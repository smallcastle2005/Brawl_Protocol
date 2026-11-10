import Phaser from 'phaser';
import { CHAR, CHAR_INFO, CHAR_POOL, GAME_WIDTH, MAP_SIZE } from '../config';
import { FONT_BODY, FONT_MONO } from '../core/text';
import { nearestFreePoint, segmentHitsWall } from '../core/util';
import { AIController } from '../ai/AIController';
import { getPveLevel, PveEnemy, PveLevel } from '../pve/levels';
import { createBrain, MONSTER_DEFS, MonsterBrain, MonsterHost } from '../pve/monsters';
import { getEquipBonus } from '../pve/equipment';
import type { Fighter } from '../entities/Fighter';
import type { GameMode, ModeHost } from './GameMode';
import type { RectShotOpts } from '../pve/monsters';

/** 己方复活：首次 5s，之后每次 +5s，上不封顶 */
const REVIVE_BASE = 5;

interface ReviveEntry { f: Fighter; t: number }

/** 心兽「怒号」冲击波 */
interface Shockwave {
  x: number; y: number; r: number; maxR: number;
  dmg: number; confuse: number;
  hit: Set<Fighter>;
  g: Phaser.GameObjects.Graphics;
}

/** 心兽「厮杀」抓痕预警 */
interface ClawWarn { target: Fighter; t: number; g: Phaser.GameObjects.Graphics }

/** 暗影魔牛「黑雾」：飞行一段距离，命中己方造成伤害 + 混乱 */
interface BlackMist {
  x: number; y: number; vx: number; vy: number;
  r: number; life: number;
  dmg: number; confuse: number;
  owner: Fighter;
  g: Phaser.GameObjects.Graphics;
}

/** 西部 BOSS 技能弹：宽型直线弹（条形 / 棱形 / 金色光弹） */
interface RectShot extends RectShotOpts {
  vx: number; vy: number;
  life: number;
  g: Phaser.GameObjects.Graphics;
  hit: Set<Fighter>;
}

/**
 * PVE 冒险模式：
 * 玩家 + 2 名随机 AI 队友，逐波清怪，最后挑战 BOSS「心兽」。
 * 己方阵亡后只要还有人活着，就会在递增延迟后复活；全灭判负。
 */
export class PveMode implements GameMode {
  readonly level: PveLevel;
  private waveIndex = 0;
  private waveDelay = 0;
  private allies: Fighter[] = [];
  private brains = new Map<Fighter, MonsterBrain>();
  private reviving: ReviveEntry[] = [];
  /** 已经登记过死亡的己方（避免重复计时） */
  private handled = new Set<Fighter>();
  private deathSeq = 0;

  private boss: Fighter | null = null;
  private bossPhase2 = false;
  private bossDefeated = false;

  private shockwaves: Shockwave[] = [];
  private clawWarns: ClawWarn[] = [];
  private mists: BlackMist[] = [];
  /** 第二关：西部双 BOSS */
  private westBosses: Fighter[] = [];
  private westSpawned = false;
  private rectShots: RectShot[] = [];
  /** 西部天使「上天堂」：圣坛与圣洁值 */
  private curseOwner: Fighter | null = null;
  private altars: { x: number; y: number }[] = [];
  private sanctity = new Map<Fighter, number>();
  /** 「上天堂」：圣洁值归零后的每秒伤害计时 */
  private curseHitT = new Map<Fighter, number>();
  private altarG?: Phaser.GameObjects.Graphics;
  private curseBarG?: Phaser.GameObjects.Graphics;

  private hudT?: Phaser.GameObjects.Text;
  private bossBar?: Phaser.GameObjects.Graphics;
  private bossName?: Phaser.GameObjects.Text;
  private bossHp?: Phaser.GameObjects.Text;
  /** 西部双 BOSS 的血条（2 条） */
  private westBars: { g: Phaser.GameObjects.Graphics; name: Phaser.GameObjects.Text; hp: Phaser.GameObjects.Text }[] = [];

  private mhost: MonsterHost;

  constructor(private host: ModeHost) {
    this.level = getPveLevel(host.levelId);
    const b = host.layout.bounds;
    const wt = host.layout.wallT ?? 0;
    // bounds 的 x/y 是中心点，转换为左上角并扣掉外墙厚度
    const arena = b
      ? { x: b.x - b.w / 2 + wt, y: b.y - b.h / 2 + wt, w: b.w - wt * 2, h: b.h - wt * 2 }
      : { x: 0, y: 0, w: MAP_SIZE, h: MAP_SIZE };
    this.mhost = {
      scene: host,
      wallRects: host.wallRects,
      allies: () => this.aliveAllies(),
      nearestAlly: (s) => this.nearestAlly(s),
      fireBullet: (o, x, y, a, d, sp) => host.fireMonsterBullet(o, x, y, a, d, sp),
      spawnShockwave: (x, y, d, c) => this.spawnShockwave(x, y, d, c),
      spawnBlackMist: (o, x, y, a, d, c) => this.spawnBlackMist(o, x, y, a, d, c),
      clawWarn: (t, dur) => this.clawWarn(t, dur),
      arena,
      centerX: b ? b.x : MAP_SIZE / 2,
      destroyWalls: (rects) => host.destroyPveWalls(rects),
      spawnRectShot: (o) => this.spawnRectShot(o),
      curseAllies: (o, a) => this.curseAllies(o, a),
    };
  }

  buildWorld() {}

  buildHud() {
    const h = this.host;
    this.hudT = h.add.text(GAME_WIDTH / 2, 8, '', {
      fontFamily: FONT_MONO, fontSize: '13px', color: '#cfe8ff', align: 'center',
    }).setDepth(1601).setScrollFactor(0).setOrigin(0.5, 0).setStroke('#0b0d15', 4);

    // BOSS 血条（屏幕层）
    this.bossBar = h.add.graphics().setDepth(1601).setScrollFactor(0).setVisible(false);
    this.bossName = h.add.text(GAME_WIDTH / 2, 58, '', {
      fontFamily: FONT_BODY, fontSize: '14px', fontStyle: 'bold', color: '#ffd75e',
    }).setDepth(1602).setScrollFactor(0).setOrigin(0.5).setStroke('#120a06', 4).setVisible(false);
    this.bossHp = h.add.text(GAME_WIDTH / 2, 96, '', {
      fontFamily: FONT_MONO, fontSize: '11px', color: '#ffd0c0',
    }).setDepth(1602).setScrollFactor(0).setOrigin(0.5).setStroke('#120a06', 3).setVisible(false);

    // 第二关：西部双 BOSS 各一条血条
    for (let i = 0; i < 2; i++) {
      const g = h.add.graphics().setDepth(1601).setScrollFactor(0).setVisible(false);
      const name = h.add.text(0, 0, '', {
        fontFamily: FONT_BODY, fontSize: '13px', fontStyle: 'bold', color: '#ffd75e',
      }).setDepth(1602).setScrollFactor(0).setOrigin(0, 0.5).setStroke('#120a06', 4).setVisible(false);
      const hp = h.add.text(0, 0, '', {
        fontFamily: FONT_MONO, fontSize: '10px', color: '#ffd0c0',
      }).setDepth(1602).setScrollFactor(0).setOrigin(1, 0.5).setStroke('#120a06', 3).setVisible(false);
      this.westBars.push({ g, name, hp });
    }

    this.refreshHud();
  }

  spawnRoster() {
    const h = this.host;
    const spawns = h.layout.spawns;
    this.mhost.wallRects = h.wallRects;

    // 玩家
    h.player = h.spawnFighter(
      spawns[0].x, spawns[0].y, h.charId, true, CHAR_INFO[h.charId].name,
    );
    h.player.team = 0;
    h.player.teamBattle = true;
    h.fighters.push(h.player);
    h.aiList = [];

    // 两名随机 AI 队友（尽量避开玩家角色）
    const pool = CHAR_POOL.filter((c) => c !== h.charId);
    for (let i = 0; i < 2; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      const charId = pool.splice(idx, 1)[0];
      const s = spawns[(i + 1) % spawns.length];
      const ally = h.spawnFighter(s.x, s.y, charId, false, `${CHAR_INFO[charId].name}·队友`);
      ally.team = 0;
      ally.teamBattle = true;
      h.fighters.push(ally);
      h.aiList.push(ally);
      h.aiCtrls.set(ally, new AIController());
      h.addWallColliders(ally);
      h.hpNames.get(ally)?.setColor('#7fd4ff');
      // 队友装备等级与玩家一致；玩家没有装备时不套用
      const bonus = getEquipBonus(h.charId);
      if (bonus) h.applyPveEquipment(ally, bonus.level);
      this.allies.push(ally);
    }

    this.waveIndex = 0;
    this.waveDelay = 0;
    this.spawnWave(0);
  }

  update(dt: number) {
    const h = this.host;
    if (!h.started || h.over) return;
    this.updateDeaths(dt);
    if (h.over) return;
    this.updateBrains(dt);
    this.updateBossPhase();
    this.updateShockwaves(dt);
    this.updateClawWarns(dt);
    this.updateMists(dt);
    this.updateRectShots(dt);
    this.updateCurse(dt);
    this.updateWaves(dt);
    this.refreshHud();
  }

  drawWorld() {}

  drawHud() {
    this.drawHeartBossBar();
    this.drawWestBossBars();
  }

  private drawHeartBossBar() {
    if (!this.bossBar || !this.bossName || !this.bossHp) return;
    const f = this.boss;
    if (!f || !f.alive) {
      this.bossBar.setVisible(false);
      this.bossName.setVisible(false);
      this.bossHp.setVisible(false);
      return;
    }
    const ratio = Phaser.Math.Clamp(f.hp / f.maxHp, 0, 1);
    const w = 400;
    const hgt = 14;
    const x = (GAME_WIDTH - w) / 2;
    const y = 74;
    const g = this.bossBar;
    g.setVisible(true).clear();
    g.fillStyle(0x120a06, 0.85).fillRoundedRect(x - 5, y - 5, w + 10, hgt + 10, 7);
    g.fillStyle(0x3a1a18, 1).fillRect(x, y, w, hgt);
    g.fillStyle(0xff3b30, 1).fillRect(x, y, w * ratio, hgt);
    g.fillStyle(0xff8a6a, 0.9).fillRect(x, y, w * ratio, 3);
    g.lineStyle(2, 0xffd75e, 1).strokeRoundedRect(x - 5, y - 5, w + 10, hgt + 10, 7);
    this.bossName.setText(this.bossPhase2 ? '心兽 · 实体' : '心兽').setVisible(true);
    this.bossHp.setText(`${Math.ceil(f.hp)} / ${f.maxHp}`).setVisible(true);
  }

  /** 西部双 BOSS：屏幕顶部并排两条血条 */
  private drawWestBossBars() {
    if (this.westBars.length === 0) return;
    const w = 280;
    const hgt = 12;
    const y = 40;
    const startX = (GAME_WIDTH - w * 2 - 24) / 2;
    for (let i = 0; i < this.westBars.length; i++) {
      const bar = this.westBars[i];
      const f = this.westBosses[i];
      if (!f || !f.alive) {
        bar.g.setVisible(false);
        bar.name.setVisible(false);
        bar.hp.setVisible(false);
        continue;
      }
      const x = startX + i * (w + 24);
      const ratio = Phaser.Math.Clamp(f.hp / f.maxHp, 0, 1);
      const demon = f.texKey === 'west-demon';
      const g = bar.g;
      g.setVisible(true).clear();
      g.fillStyle(0x120a06, 0.85).fillRoundedRect(x - 4, y - 4, w + 8, hgt + 8, 6);
      g.fillStyle(demon ? 0x3a1210 : 0x2c2a1a, 1).fillRect(x, y, w, hgt);
      g.fillStyle(demon ? 0xc81f2a : 0xffd75e, 1).fillRect(x, y, w * ratio, hgt);
      g.fillStyle(demon ? 0xff8a6a : 0xfff6d0, 0.9).fillRect(x, y, w * ratio, 3);
      g.lineStyle(2, demon ? 0xff5a4a : 0xffe9a8, 1).strokeRoundedRect(x - 4, y - 4, w + 8, hgt + 8, 6);
      bar.name.setPosition(x, y - 14).setText(demon ? '西部恶魔' : '西部天使').setVisible(true);
      bar.hp.setPosition(x + w, y - 14)
        .setText(`${Math.ceil(f.hp)} / ${f.maxHp}`).setVisible(true);
    }
  }

  respawnPos(f: Fighter): { x: number; y: number } | null {
    const spawns = this.host.layout.spawns;
    if (spawns.length === 0) return null;
    const idx = f === this.host.player ? 0 : this.allies.indexOf(f) + 1;
    const s = spawns[Math.max(0, idx) % spawns.length];
    return nearestFreePoint(s.x, s.y, 24, this.host.wallRects);
  }

  checkWin() {
    const h = this.host;
    if (h.over || !h.started) return;
    if (this.bossDefeated && this.waveIndex >= this.level.waves.length - 1) {
      h.endGame(true, h.player, '关卡完成');
    }
  }

  recordDps() {}

  /* ================= 己方死亡 / 复活 ================= */

  private updateDeaths(dt: number) {
    const h = this.host;
    const team0 = h.fighters.filter((f) => f.team === 0 && !f.isDummy);
    for (const f of team0) {
      if (!f.alive && !this.handled.has(f)) {
        this.handled.add(f);
        this.deathSeq += 1;
        this.reviving.push({ f, t: REVIVE_BASE * this.deathSeq });
        h.hud?.pushFeed(`${f.name} 阵亡 · ${REVIVE_BASE * this.deathSeq}s 后复活`);
      }
    }
    // 全部己方死亡 → 失败
    if (team0.length > 0 && team0.every((f) => !f.alive)) {
      h.endGame(false, undefined, '队伍全灭');
      return;
    }
    for (let i = this.reviving.length - 1; i >= 0; i--) {
      const r = this.reviving[i];
      r.t -= dt;
      if (r.t <= 0) {
        const p = this.respawnPos(r.f);
        if (p) r.f.respawn(p.x, p.y);
        this.handled.delete(r.f);
        this.reviving.splice(i, 1);
        h.hud?.pushFeed(`${r.f.name} 已复活`);
      }
    }
  }

  /* ================= 怪物 AI ================= */

  private updateBrains(dt: number) {
    for (const [f, b] of this.brains) {
      if (!f.alive) continue;
      b.update(dt, f, this.mhost);
    }
  }

  private updateBossPhase() {
    // 第二关：两位 BOSS 全部倒下才算通关
    if (this.westSpawned && !this.bossDefeated
      && this.westBosses.every((f) => !f.alive)) {
      this.bossDefeated = true;
      this.clearWestFx();
      this.host.hud?.pushFeed('西部恶魔与西部天使已被击败');
      return;
    }
    const b = this.boss;
    if (!b || b.alive) return;
    if (!this.bossPhase2) {
      const x = b.x;
      const y = b.y;
      if (this.host.aiCtrls.has(b)) this.host.aiCtrls.delete(b);
      this.boss = null;
      this.spawnBossPhase2(x, y);
    } else {
      this.boss = null;
      this.bossDefeated = true;
      this.host.hud?.pushFeed('心兽已被击败');
    }
  }

  /* ================= 冲击波 / 抓痕 ================= */

  private spawnShockwave(x: number, y: number, dmg: number, confuse: number) {
    const g = this.host.add.graphics().setDepth(13);
    this.shockwaves.push({
      x, y, r: 40, maxR: 1500, dmg, confuse, hit: new Set(), g,
    });
  }

  private updateShockwaves(dt: number) {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const w = this.shockwaves[i];
      w.r += 640 * dt;
      const fade = 1 - w.r / w.maxR;
      w.g.clear();
      w.g.lineStyle(8, 0xff2b20, 0.35 * fade + 0.15);
      w.g.strokeCircle(w.x, w.y, w.r);
      w.g.lineStyle(3, 0xff8a70, 0.7 * fade);
      w.g.strokeCircle(w.x, w.y, w.r - 10);
      for (const a of this.aliveAllies()) {
        if (w.hit.has(a)) continue;
        const d = Math.hypot(a.x - w.x, a.y - w.y);
        if (d > w.r) continue;
        w.hit.add(a);
        // 红色冲击波可被墙体阻挡
        if (segmentHitsWall(w.x, w.y, a.x, a.y, this.host.wallRects)) continue;
        a.takeDamage(w.dmg, { source: this.boss ?? undefined });
        a.confuseT = Math.max(a.confuseT, w.confuse);
      }
      if (w.r >= w.maxR) {
        w.g.destroy();
        this.shockwaves.splice(i, 1);
      }
    }
  }

  private clawWarn(target: Fighter, dur: number) {
    const g = this.host.add.graphics().setDepth(12);
    this.clawWarns.push({ target, t: dur, g });
  }

  private updateClawWarns(dt: number) {
    for (let i = this.clawWarns.length - 1; i >= 0; i--) {
      const c = this.clawWarns[i];
      c.t -= dt;
      const t = c.target;
      if (c.t <= 0 || !t.alive) {
        c.g.destroy();
        this.clawWarns.splice(i, 1);
        continue;
      }
      const pulse = 0.55 + 0.45 * Math.abs(Math.sin(c.t * 12));
      c.g.clear();
      c.g.lineStyle(4, 0xff2b20, pulse);
      for (let k = -1; k <= 1; k++) {
        const ox = k * 13;
        c.g.lineBetween(t.x + ox - 20, t.y - 26, t.x + ox + 8, t.y + 18);
        c.g.lineBetween(t.x + ox + 4, t.y - 26, t.x + ox - 8, t.y + 18);
      }
      c.g.lineStyle(2, 0xffd0c0, 0.8);
      c.g.strokeCircle(t.x, t.y, 34);
    }
  }

  /* ================= 黑雾（精英技能） ================= */

  private spawnBlackMist(
    owner: Fighter, x: number, y: number, angle: number, dmg: number, confuse: number,
  ) {
    const speed = 250;
    this.mists.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 26,
      life: 1.25,
      dmg,
      confuse,
      owner,
      g: this.host.add.graphics().setDepth(13),
    });
  }

  private updateMists(dt: number) {
    const now = this.host.time.now;
    for (let i = this.mists.length - 1; i >= 0; i--) {
      const m = this.mists[i];
      m.life -= dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      const blocked = this.host.wallRects.some((r) => r.contains(m.x, m.y));
      if (m.life <= 0 || blocked) {
        m.g.destroy();
        this.mists.splice(i, 1);
        continue;
      }
      const fade = Math.min(1, m.life / 0.35);
      const wob = Math.sin(now * 0.01 + m.x * 0.05) * 4;
      const g = m.g;
      g.clear();
      g.fillStyle(0x1a0626, 0.62 * fade).fillCircle(m.x + wob, m.y, m.r);
      g.fillStyle(0x3b1655, 0.55 * fade).fillCircle(m.x - wob * 0.5, m.y - 3, m.r * 0.72);
      g.fillStyle(0x7a3cc0, 0.35 * fade).fillCircle(m.x + wob * 0.8, m.y + 4, m.r * 0.42);
      g.lineStyle(2, 0x9b5cff, 0.5 * fade).strokeCircle(m.x, m.y, m.r);
      for (const a of this.aliveAllies()) {
        if (Math.hypot(a.x - m.x, a.y - m.y) > m.r + 22) continue;
        a.takeDamage(m.dmg, { source: m.owner });
        a.confuseT = Math.max(a.confuseT, m.confuse);
        this.confuseFx(a);
        g.destroy();
        this.mists.splice(i, 1);
        break;
      }
    }
  }

  /** 混乱命中的表现：紫色扩散环 + 头顶文字 */
  private confuseFx(f: Fighter) {
    const host = this.host;
    const ring = host.add.circle(f.x, f.y, 20, 0x8a5cff, 0.45).setDepth(14);
    host.tweens.add({
      targets: ring, scale: 2.4, alpha: 0, duration: 320,
      onComplete: () => ring.destroy(),
    });
    const t = host.add.text(f.x, f.y - 58, '混乱', {
      fontFamily: FONT_BODY, fontSize: '12px', fontStyle: 'bold', color: '#c9a6ff',
    }).setOrigin(0.5, 1).setDepth(930).setStroke('#120a06', 4);
    host.tweens.add({
      targets: t, y: f.y - 78, alpha: 0, duration: 700,
      onComplete: () => t.destroy(),
    });
  }

  /* ================= 波次 ================= */

  private updateWaves(dt: number) {
    const h = this.host;
    if (this.aliveEnemies().length > 0) return;
    if (this.waveIndex >= this.level.waves.length - 1) return;
    if (this.waveDelay <= 0) {
      this.waveDelay = 1.6;
      const p = h.player;
      if (p.alive) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.2);
      h.hud?.pushFeed('波次清除 · 恢复 20% 生命');
    } else {
      this.waveDelay -= dt;
      if (this.waveDelay <= 0) {
        this.waveIndex += 1;
        this.spawnWave(this.waveIndex);
      }
    }
  }

  private spawnWave(index: number) {
    const h = this.host;
    const wave = this.level.waves[index];
    if (!wave) return;
    const positions = this.enemyPositions(wave.enemies.length);
    wave.enemies.forEach((e, j) => this.spawnEnemy(e, positions[j]));
    h.refreshOutlines();
    h.hud?.pushFeed(`第 ${index + 1} 波 · ${wave.label}`);
    this.waveDelay = 0;
  }

  private spawnEnemy(e: PveEnemy, pos: { x: number; y: number }) {
    if (e.monster === 'heart-beast') {
      this.spawnBossPhase1(pos.x, pos.y);
      return;
    }
    if (e.monster === 'west-demon' || e.monster === 'west-angel') {
      this.spawnWestBoss(e.monster);
      return;
    }
    const h = this.host;
    const def = MONSTER_DEFS[e.monster];
    const f = h.spawnFighter(pos.x, pos.y, CHAR.GUNNER, false, def.name, {
      texKey: e.monster,
      monster: true,
      maxHp: def.hp,
      speed: def.speed,
      displayW: def.displayW,
      bodyR: def.bodyR,
      hitR: def.hitR,
      def: def.def,
    });
    f.team = 1;
    f.teamBattle = true;
    h.fighters.push(f);
    h.addWallColliders(f);
    h.hpNames.get(f)?.setColor(e.tier === 'elite' ? '#ffb84d' : '#ff5a4a');
    this.brains.set(f, createBrain(e.monster));
  }

  /** BOSS 第一阶段：复制玩家角色（技能一致、血量一致、伤害减半） */
  private spawnBossPhase1(x: number, y: number) {
    const h = this.host;
    const p = h.player;
    const f = h.spawnFighter(x, y, p.charId, false, '心兽', {
      maxHp: p.maxHp,
      speed: p.speed,
    });
    f.team = 1;
    f.teamBattle = true;
    f.dmgMul = 0.5;
    h.fighters.push(f);
    h.aiList.push(f);
    h.aiCtrls.set(f, new AIController());
    h.addWallColliders(f);
    h.hpNames.get(f)?.setColor('#ffd75e').setFontSize(16);
    this.boss = f;
    this.bossPhase2 = false;
    this.bossDefeated = false;
    h.hud?.pushFeed('心兽出现 · 它复制了你的模样');
  }

  /** BOSS 第二阶段：健硕狼人实体（四向 + 技能施法动作） */
  private spawnBossPhase2(x: number, y: number) {
    const h = this.host;
    const def = MONSTER_DEFS['heart-beast'];
    // 出生点吸到空地，避免大体积 BOSS 一出现就嵌在墙体里
    const spot = nearestFreePoint(x, y, 52, h.wallRects);
    const f = h.spawnFighter(spot.x, spot.y, CHAR.GUNNER, false, '心兽·实体', {
      texKey: 'heart-beast',
      monster: true,
      dirAnim: true,
      maxHp: def.hp,
      speed: def.speed,
      displayW: def.displayW,
      bodyR: def.bodyR,
      hitR: def.hitR,
      def: def.def,
    });
    f.team = 1;
    f.teamBattle = true;
    h.fighters.push(f);
    h.addWallColliders(f);
    h.hpNames.get(f)?.setColor('#ffd75e').setFontSize(16);
    this.brains.set(f, createBrain('heart-beast'));
    this.boss = f;
    this.bossPhase2 = true;
    h.refreshOutlines();
    h.hud?.pushFeed('心兽化作实体 · 健硕狼人现身');
    h.cameras.main.shake(0.03, 500);
  }

  /** 第二关：西部恶魔 / 西部天使（各自活动在半场，不可越过中线） */
  private spawnWestBoss(monster: 'west-demon' | 'west-angel') {
    const h = this.host;
    const def = MONSTER_DEFS[monster];
    const a = this.mhost.arena;
    const mid = this.mhost.centerX;
    const demon = monster === 'west-demon';
    const px = demon ? a.x + a.w * 0.22 : a.x + a.w * 0.78;
    const py = a.y + a.h * 0.5;
    const spot = nearestFreePoint(px, py, def.bodyR + 18, h.wallRects);
    const f = h.spawnFighter(spot.x, spot.y, CHAR.GUNNER, false, def.name, {
      texKey: monster,
      monster: true,
      dirAnim: true,
      maxHp: def.hp,
      speed: def.speed,
      displayW: def.displayW,
      bodyR: def.bodyR,
      hitR: def.hitR,
      def: def.def,
      clampRect: demon
        ? { x: a.x + 24, y: a.y + 24, w: mid - a.x - 48, h: a.h - 48 }
        : { x: mid + 24, y: a.y + 24, w: a.x + a.w - mid - 48, h: a.h - 48 },
    });
    f.team = 1;
    f.teamBattle = true;
    f.faceAngle = Math.PI / 2;
    h.fighters.push(f);
    h.addWallColliders(f);
    h.hpNames.get(f)?.setColor(demon ? '#ff4a4a' : '#ffe27a').setFontSize(16);
    this.brains.set(f, createBrain(monster));
    this.westBosses.push(f);
    this.westSpawned = true;
    h.refreshOutlines();
    h.hud?.pushFeed(`${def.name} 现身 · ${demon ? '左半场' : '右半场'}`);
    h.cameras.main.shake(0.03, 500);
  }

  /* ================= 西部 BOSS：宽型直线弹 ================= */

  private spawnRectShot(o: RectShotOpts) {
    const g = this.host.add.graphics().setDepth(13);
    this.rectShots.push({
      ...o,
      vx: Math.cos(o.angle) * o.speed,
      vy: Math.sin(o.angle) * o.speed,
      life: o.life ?? 3.4,
      g,
      hit: new Set<Fighter>(),
    });
  }

  private updateRectShots(dt: number) {
    const h = this.host;
    for (let i = this.rectShots.length - 1; i >= 0; i--) {
      const s = this.rectShots[i];
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const ca = Math.cos(s.angle);
      const sa = Math.sin(s.angle);
      const px = -sa;
      const py = ca;
      // 无法穿透墙体：按整条弹体宽度取样
      if (!s.passWalls) {
        let blocked = false;
        for (const k of [-0.5, -0.25, 0, 0.25, 0.5]) {
          const qx = s.x + px * s.width * k;
          const qy = s.y + py * s.width * k;
          if (h.wallRects.some((r) => r.contains(qx, qy))) { blocked = true; break; }
        }
        if (blocked) {
          this.removeShot(i);
          continue;
        }
      }
      // 命中判定：垂直于飞行方向的宽型判定
      let consumed = false;
      for (const a of this.aliveAllies()) {
        if (s.hit.has(a)) continue;
        const dx = a.x - s.x;
        const dy = a.y - s.y;
        const along = dx * ca + dy * sa;
        const perp = Math.abs(-dx * sa + dy * ca);
        if (Math.abs(along) > 40 + s.speed * dt) continue;
        if (perp > s.width / 2 + 26) continue;
        s.hit.add(a);
        if (s.hpOne) {
          // 重生祷告：生命值强制降为 1
          if (a.hp > 1) a.hp = 1;
        } else {
          a.takeDamage(s.dmg, { source: s.owner });
        }
        if (s.silence) a.silence(s.silence);
        consumed = true;
        break;
      }
      if (consumed) {
        this.removeShot(i);
        continue;
      }
      if (s.life <= 0 || s.x < -240 || s.y < -240
        || s.x > MAP_SIZE + 240 || s.y > MAP_SIZE + 240) {
        this.removeShot(i);
        continue;
      }
      this.drawRectShot(s);
    }
  }

  private removeShot(index: number) {
    const s = this.rectShots[index];
    if (!s) return;
    s.g.destroy();
    this.rectShots.splice(index, 1);
  }

  private shotPoints(s: RectShot, hw: number, hl: number): Phaser.Geom.Point[] {
    const ca = Math.cos(s.angle);
    const sa = Math.sin(s.angle);
    const px = -sa;
    const py = ca;
    return [
      new Phaser.Geom.Point(s.x + ca * hl + px * hw, s.y + sa * hl + py * hw),
      new Phaser.Geom.Point(s.x - ca * hl + px * hw, s.y - sa * hl + py * hw),
      new Phaser.Geom.Point(s.x - ca * hl - px * hw, s.y - sa * hl - py * hw),
      new Phaser.Geom.Point(s.x + ca * hl - px * hw, s.y + sa * hl - py * hw),
    ];
  }

  private drawRectShot(s: RectShot) {
    const g = s.g;
    g.clear();
    const hw = s.width / 2;
    if (s.style === 'diamond') {
      // 重生炼狱：红色 + 黑色描边的棱形子弹
      g.fillStyle(0x101010, 1).fillPoints(this.shotPoints(s, hw * 0.66 + 3, hw * 0.55 + 3), true);
      g.fillStyle(s.color, 1).fillPoints(this.shotPoints(s, hw * 0.66, hw * 0.55), true);
      g.lineStyle(2, s.outline ?? 0x101010, 0.95)
        .strokePoints(this.shotPoints(s, hw * 0.66, hw * 0.55), true);
    } else if (s.style === 'gold') {
      // 重生祷告：金色光弹
      g.fillStyle(0xffd75e, 0.26).fillPoints(this.shotPoints(s, hw * 0.95, hw * 0.9), true);
      g.fillStyle(0xffe9a0, 0.95).fillPoints(this.shotPoints(s, hw * 0.5, hw * 0.62), true);
      g.fillStyle(0xffffff, 1).fillPoints(this.shotPoints(s, hw * 0.22, hw * 0.4), true);
    } else {
      // 深渊火枪 / 天堂长枪：宽条形弹
      g.fillStyle(s.color, 0.92).fillPoints(this.shotPoints(s, hw, 10), true);
      if (s.outline !== undefined) {
        g.lineStyle(3, s.outline, 0.95).strokePoints(this.shotPoints(s, hw, 10), true);
      }
      g.fillStyle(0xffffff, 0.4).fillPoints(this.shotPoints(s, hw * 0.9, 3), true);
    }
  }

  /* ================= 西部天使「上天堂」 ================= */

  private curseAllies(owner: Fighter, altars: { x: number; y: number }[]) {
    this.clearCurse();
    this.curseOwner = owner;
    this.altars = altars.map((p) => {
      const spot = nearestFreePoint(p.x, p.y, 30, this.host.wallRects);
      return { x: spot.x, y: spot.y };
    });
    for (const a of this.aliveAllies()) this.sanctity.set(a, 10);
    this.altarG = this.host.add.graphics().setDepth(11);
    this.curseBarG = this.host.add.graphics().setDepth(945);
    this.host.hud?.pushFeed('上天堂 · 站入圣坛补充圣洁值');
  }

  private updateCurse(dt: number) {
    const owner = this.curseOwner;
    if (!owner) return;
    if (!owner.alive) {
      this.clearCurse();
      return;
    }
    const altarR = 210; // 圣坛范围在 350 基础上减少 40%
    for (const a of this.aliveAllies()) {
      let v = this.sanctity.get(a);
      if (v === undefined) {
        v = 10;
        this.sanctity.set(a, v);
      }
      let inside = false;
      for (const p of this.altars) {
        if (Math.hypot(a.x - p.x, a.y - p.y) <= altarR) { inside = true; break; }
      }
      // 圣坛内每秒 +3（上限 10）；否则每秒 -1，约 10s 清零
      v = inside ? Math.min(10, v + 3 * dt) : Math.max(0, v - dt);
      this.sanctity.set(a, v);
      if (v <= 0) {
        let t = (this.curseHitT.get(a) ?? 0) + dt;
        while (t >= 1) {
          t -= 1;
          a.takeDamage(15, { source: owner });
          if (!a.alive) break;
        }
        this.curseHitT.set(a, t);
      } else {
        this.curseHitT.delete(a);
      }
    }
    this.drawAltars();
    this.drawCurseBars();
  }

  private drawAltars() {
    const g = this.altarG;
    if (!g) return;
    g.clear();
    const pulse = 0.5 + 0.5 * Math.abs(Math.sin(this.host.time.now * 0.003));
    for (const p of this.altars) {
      g.fillStyle(0xffe27a, 0.07 + pulse * 0.05);
      g.fillCircle(p.x, p.y, 210);
      g.lineStyle(3, 0xffe27a, 0.35 + pulse * 0.25);
      g.strokeCircle(p.x, p.y, 210);
      g.lineStyle(1, 0xfff6d0, 0.2);
      g.strokeCircle(p.x, p.y, 180);
      // 圣坛本体
      g.fillStyle(0xfff2c0, 0.85);
      g.fillRect(p.x - 12, p.y - 22, 24, 34);
      g.fillStyle(0xffd75e, 0.9);
      g.fillRect(p.x - 18, p.y + 8, 36, 8);
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(p.x, p.y - 30, 7);
    }
  }

  private drawCurseBars() {
    const g = this.curseBarG;
    if (!g) return;
    g.clear();
    const w = 46;
    const hgt = 5;
    for (const a of this.aliveAllies()) {
      const v = this.sanctity.get(a) ?? 10;
      const ratio = Phaser.Math.Clamp(v / 10, 0, 1);
      const x = a.x - w / 2;
      const y = a.y - 86;
      g.fillStyle(0x120a06, 0.85).fillRect(x - 1, y - 1, w + 2, hgt + 2);
      g.fillStyle(0x3a2c10, 1).fillRect(x, y, w, hgt);
      const color = ratio > 0.5 ? 0xffe27a : ratio > 0 ? 0xff9a4a : 0xff3b30;
      g.fillStyle(color, 1).fillRect(x, y, w * ratio, hgt);
    }
  }

  private clearCurse() {
    this.curseOwner = null;
    this.altars = [];
    this.sanctity.clear();
    this.curseHitT.clear();
    this.altarG?.destroy();
    this.altarG = undefined;
    this.curseBarG?.destroy();
    this.curseBarG = undefined;
  }

  /** 双 BOSS 全部阵亡：清理残余弹幕、圣坛与技能绘制 */
  private clearWestFx() {
    for (const s of this.rectShots) s.g.destroy();
    this.rectShots = [];
    this.clearCurse();
    for (const b of this.brains.values()) b.dispose?.();
  }

  /* ================= 工具 ================= */

  private aliveAllies(): Fighter[] {
    return this.host.fighters.filter((f) => f.team === 0 && !f.isDummy && f.alive);
  }

  private nearestAlly(source: Fighter): Fighter | null {
    let best: Fighter | null = null;
    let bestD = Infinity;
    for (const a of this.aliveAllies()) {
      const d = Math.hypot(a.x - source.x, a.y - source.y);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    return best;
  }

  private aliveEnemies(): Fighter[] {
    return this.host.fighters.filter((f) => f.team === 1 && f.alive);
  }

  /** 敌人出生点：沿地图外圈均布，再吸附到最近空地 */
  private enemyPositions(n: number): { x: number; y: number }[] {
    // 缩小后的关卡以 layout.bounds 为准（梦魇镇第一关为 1200×1200）
    const b = this.host.layout.bounds;
    const arenaW = b && b.w < MAP_SIZE ? b.w : MAP_SIZE;
    const arenaH = b && b.h < MAP_SIZE ? b.h : MAP_SIZE;
    const cx = b && b.w < MAP_SIZE ? b.x : MAP_SIZE / 2;
    const cy = b && b.h < MAP_SIZE ? b.y : MAP_SIZE / 2;
    const rx = arenaW * 0.36;
    const ry = arenaH * 0.32;
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (i / Math.max(1, n)) * Math.PI * 2;
      const x = Phaser.Math.Clamp(cx + Math.cos(ang) * rx, 240, cx + arenaW / 2 - 60);
      const y = Phaser.Math.Clamp(cy + Math.sin(ang) * ry, 240, cy + arenaH / 2 - 60);
      out.push(nearestFreePoint(x, y, 28, this.host.wallRects));
    }
    return out;
  }

  private refreshHud() {
    if (!this.hudT) return;
    const total = this.level.waves.length;
    const w = Math.min(this.waveIndex + 1, total);
    const alive = this.aliveEnemies().length;
    const revive = this.reviving.length > 0
      ? `　复活 ${Math.min(...this.reviving.map((r) => r.t)).toFixed(1)}s`
      : '';
    this.hudT.setText(
      `第 ${this.level.order} 关 · ${this.level.name}　波次 ${w}/${total}　剩余敌人 ${alive}${revive}`,
    );
  }
}
