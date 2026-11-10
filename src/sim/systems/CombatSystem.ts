import Phaser from 'phaser';
import { BALANCE, CHAR, KILLS_TO_WIN, MODE, RESPAWN_DELAY } from '../../config';
import type { ModeId } from '../../config';
import { compactInPlace, dist } from '../../core/util';
import { playSfx } from '../../audio/sfx';
import type { DamageOpts, Fighter } from '../../entities/Fighter';
import type { Soldier } from '../../entities/Soldier';
import type { Bullet } from '../../entities/Bullet';
import type { Gust } from '../../entities/Gust';
import type { Missile } from '../../entities/Missile';
import type { Storm } from '../../entities/Storm';
import type { WindOrb } from '../../entities/WindOrb';
import type { ArcaneWave } from '../../entities/ArcaneWave';
import type { BurnZone, MiniBomb, PendingStrike } from './skills/bomber';
import type { RepulseZone } from './skills/arcane';
import type { FxRenderer } from '../../render/FxRenderer';
import type { HudRenderer } from '../../render/HudRenderer';
import type { CameraRig } from '../../render/CameraRig';
import type { GameMode } from '../../modes/GameMode';

/** 战斗系统需要的最小宿主状态与技能更新入口 */
export interface CombatHost extends Phaser.Scene {
  player: Fighter;
  fighters: Fighter[];
  soldiers: Soldier[];
  bullets: Bullet[];
  gusts: Gust[];
  missiles: Missile[];
  storms: Storm[];
  windOrbs: WindOrb[];
  waves: ArcaneWave[];
  burnZones: BurnZone[];
  pendingStrikes: PendingStrike[];
  miniBombs: MiniBomb[];
  repulses: RepulseZone[];
  wallRects: Phaser.Geom.Rectangle[];
  respawnTimers: Map<Fighter, number>;
  mode: ModeId;
  started: boolean;
  over: boolean;
  stats: { time: number; dealt: number; taken: number };
  fx: FxRenderer;
  hud: HudRenderer;
  cameraRig: CameraRig;
  modeImpl: GameMode;
  updateEmperor(f: Fighter, dt: number): void;
  updateSoldiers(dt: number): void;
  updateSwapAnims(dt: number): void;
  updateWindOrbs(dt: number): void;
  updateGunnerSkill(f: Fighter, dt: number): void;
  updateArcane(f: Fighter, dt: number): void;
  updateWar(f: Fighter, dt: number): void;
  updateRepulses(dt: number): void;
  strikeExplode(s: PendingStrike): void;
  updateMiniBombs(dt: number): void;
  updateBurnZones(dt: number): void;
  targetsFor(owner: Fighter): Fighter[];
  applyFuse(f: Fighter, layers: number, owner: Fighter): void;
  clearSoldiers(f: Fighter): void;
  endGame(win: boolean, winner?: Fighter, reason?: string, winnerTeam?: number): void;
}

/**
 * 战斗系统：每帧战斗更新（雄兵 / 投射物 / 技能结算 / 区域）、
 * 伤害统计与击杀处理。表现仍由 FxRenderer / HudRenderer 负责。
 */
export class CombatSystem {
  readonly stats = { time: 0, dealt: 0, taken: 0 };

  constructor(private host: CombatHost) {}

  /** 命中结算：统计、音效、受击闪白、飘字与死亡特效 */
  onDamaged(victim: Fighter, dmg: number, died: boolean, opts?: DamageOpts) {
    const h = this.host;
    if (victim.isDummy) h.modeImpl.recordDps(dmg);
    if (victim.isPlayer) this.stats.taken += dmg;
    else if (victim.lastAttacker === h.player) this.stats.dealt += dmg;
    // 音效：仅玩家相关命中/受击/招架格挡（AI 互殴不播，避免嘈杂）；高频持续伤害静默
    if (!opts?.quiet) {
      if (victim.isPlayer) playSfx(opts?.parryBlocked ? 'parry' : 'hit', 0.8);
      else if (opts?.source === h.player) playSfx('hit', 0.4);
      victim.sprite.setTintFill(0xffffff);
      h.time.delayedCall(70, () => {
        if (victim.sprite.active) victim.sprite.clearTint();
      });
    }
    if (!opts?.noText) {
      h.fx.dmgText(
        victim.x, victim.y - 40, Math.round(dmg),
        victim.isPlayer ? 0xff8a8a : 0xffe27a, opts?.crit === true,
      );
    }
    if (died) h.fx.deathFx(victim);
  }

  /** 击杀处理：击杀数、播报、连杀奖励与复活排队 */
  onDeath(victim: Fighter) {
    const h = this.host;
    const killer = victim.lastAttacker && victim.lastAttacker !== victim ? victim.lastAttacker : null;
    victim.lastAttacker = null;
    if (killer && h.started) {
      killer.kills++;
      // 击杀音效：玩家击杀或玩家被杀
      if (killer === h.player) playSfx('kill', 0.9);
      else if (victim === h.player) playSfx('boom', 0.6);
      // 利剑舞者击败任意敌人回复剑势（不限定华尔兹状态）
      if (killer.charId === CHAR.BLADE) killer.addBladeStacks(BALANCE.blade.killStacks);
      h.hud.pushFeed(`${killer.name}  击杀  ${victim.name}`);
      if (victim === h.player) h.cameraRig.shake(0.016, 380);
      if (h.mode === MODE.BRAWL && killer.kills >= KILLS_TO_WIN) {
        h.endGame(killer === h.player, killer);
        return;
      }
    }
    if (h.over) return;
    // 帝君阵亡：麾下雄兵随之离场，护盾清空
    if (victim.charId === CHAR.EMPEROR) h.clearSoldiers(victim);
    // 冒险模式：己方阵亡 / 复活由 PveMode 统一管理（含 AI 队友与递增复活时间）
    if (h.mode === MODE.PVE) return;
    h.respawnTimers.set(victim, RESPAWN_DELAY);
  }

  /** 第一段：角色驱动的战斗（帝君 / 雄兵 / 易位动画） */
  updateActors(dt: number) {
    const h = this.host;
    // 帝君：雄兵召唤 / 护盾同步 / 方针 3 重置 / 选方针超时
    for (const f of h.fighters) h.updateEmperor(f, dt);
    h.updateSoldiers(dt);
    h.updateSwapAnims(dt);
  }

  /** 第二段：投射物、持续技能与区域结算 */
  updateProjectiles(dt: number) {
    const h = this.host;

    // 子弹（团队模式排除同队，避免被队友挡住）
    // v0.33：方针 4 的持盾雄兵会挡下经过自身的敌方子弹（含统治临时召唤的盾兵）
    {
      const blockerCache = new Map<number, { x: number; y: number; r: number }[]>();
      const blockersFor = (owner: Fighter) => {
        let list = blockerCache.get(owner.team);
        if (!list) {
          list = [];
          for (const s of h.soldiers) {
            if (s.dead || s.owner.emperorPolicy !== 4) continue;
            if (s.owner === owner || s.owner.team === owner.team) continue;
            list.push({ x: s.x, y: s.y, r: s.blockRadius });
          }
          blockerCache.set(owner.team, list);
        }
        return list;
      };
      // 原地压缩（不换数组）：技能模块的 context 会跨帧持有同一个数组引用
      compactInPlace(
        h.bullets,
        (b) => !b.update(dt, h.wallRects, h.targetsFor(b.owner), blockersFor(b.owner)),
      );
    }

    // 狂风
    compactInPlace(h.gusts, (g) => !g.update(dt, h.wallRects, h.targetsFor(g.owner)));

    // 导弹
    compactInPlace(h.missiles, (m) => {
      const others = h.targetsFor(m.owner).filter((f) => f.alive);
      return !m.update(dt, h.wallRects, others);
    });

    // 风暴
    h.updateWindOrbs(dt); // v0.16：飞行中的风球先于旋风更新
    for (const s of [...h.storms]) {
      const enemies = h.targetsFor(s.owner).filter((f) => f.alive);
      const done = s.update(dt, enemies, h.bullets, h.gusts, h.missiles, h.wallRects);
      if (done) {
        compactInPlace(h.storms, (x) => x !== s);
        s.destroy();
      }
    }

    // 奥术能量波
    compactInPlace(h.waves, (w) => !w.update(dt, h.wallRects, h.targetsFor(w.owner)));

    // 神枪手弹幕风暴 / 奥术蓄力 / 战争机器歼灭姿态
    for (const f of h.fighters) {
      h.updateGunnerSkill(f, dt);
      h.updateArcane(f, dt);
      h.updateWar(f, dt);
    }

    // 奥术排斥结算
    h.updateRepulses(dt);

    // 轰炸预警 → 引爆
    for (const s of [...h.pendingStrikes]) {
      s.remain -= dt;
      if (s.remain <= 0) {
        compactInPlace(h.pendingStrikes, (x) => x !== s);
        h.strikeExplode(s);
      }
    }
    h.updateMiniBombs(dt);

    // 引燃区域
    h.updateBurnZones(dt);
  }

  /* ---------- 导弹爆炸（轰炸专家 / 旋风反弹共用） ---------- */

  missileBoom(x: number, y: number, dmg: boolean, owner: Fighter) {
    this.boomFx(x, y);
    if (!dmg) return;
    const b = BALANCE.bomber;
    for (const f of this.host.fighters) {
      if (!f.alive || f === owner) continue;
      const d = dist(f.x, f.y, x, y);
      if (d < f.hitR + 10) {
        f.takeDamage(b.missileDmg, { source: owner });
        this.host.applyFuse(f, 1, owner);
      } else if (d < b.missileSplashR + f.hitR) {
        f.takeDamage(b.missileSplashDmg, { source: owner });
        this.host.applyFuse(f, 1, owner);
      }
    }
  }

  /** 旋风反弹的导弹爆炸：与 missileBoom 相同但不叠引线（归属旋风主人） */
  reflectMissileBoom(x: number, y: number, dmg: boolean, owner: Fighter) {
    this.boomFx(x, y);
    if (!dmg) return;
    const b = BALANCE.bomber;
    for (const f of this.host.fighters) {
      if (!f.alive || f === owner) continue;
      const d = dist(f.x, f.y, x, y);
      if (d < f.hitR + 10) {
        f.takeDamage(b.missileDmg, { source: owner });
      } else if (d < b.missileSplashR + f.hitR) {
        f.takeDamage(b.missileSplashDmg, { source: owner });
      }
    }
  }

  private boomFx(x: number, y: number) {
    const h = this.host;
    for (let i = 0; i < 12; i++) h.fx.pix(x, y, i % 2 ? 0xff9d4d : 0xf2c94c, 3, 350);
    h.fx.spark(x, y, 0xffffff, 4);
    h.cameraRig.shake(0.004, 160);
    playSfx('boom', 0.45);
  }
}
