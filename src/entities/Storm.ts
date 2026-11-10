import Phaser from 'phaser';
import { BALANCE } from '../config';
import { clamp, dist, sweepCircleMove } from '../core/util';
import { Fighter, BODY_R } from './Fighter';
import type { Bullet } from './Bullet';
import type { Gust } from './Gust';
import type { Missile } from './Missile';

/**
 * 风之女皇的旋风：
 * - 范围内所有敌人被施加 99% 减速（仍可攻击/技能）；
 * - 途经的一切子弹（含狂风、导弹）被吸入，绕统一轨道旋转，
 *   不再命中敌人，而将其伤害的 25% 追加到旋风每 0.4s 持续伤害；
 * - 每吸入一颗子弹，旋风半径 +5%（上限 +100%）；
 * - 旋风结束时，轨道上的子弹/狂风/导弹一并消散。
 */
/** 旋风引爆时反弹的弹体描述：类型与数量与吸入时一致 */
export interface StormReflectItem {
  kind: 'bullet' | 'gust' | 'missile';
  dmg: number;
  /** 仅狂风使用：蓄力程度（决定反弹狂风的速度/射程/宽度） */
  power?: number;
}

export class Storm {
  scene: Phaser.Scene;
  owner: Fighter;
  x: number;
  y: number;
  /** 原始半径（用于计算成长后的实际半径） */
  baseR: number;
  r: number;
  dur: number;
  /** 子弹、狂风、导弹统一旋转的轨道半径 */
  orbitR: number;
  spinDir: 1 | -1;
  active = true;

  tickTimer = 0;
  angle = 0;

  graphics: Phaser.GameObjects.Graphics;
  caught = new Set<Fighter>();
  /** v0.22：被强制旋转的敌人在旋风中的轨道角度与半径 */
  private spinAngles = new Map<Fighter, number>();
  private spinRadii = new Map<Fighter, number>();
  caughtBullets = new Set<Bullet>();
  caughtGusts = new Set<Gust>();
  caughtMissiles = new Set<Missile>();
  /** 已累积的吸入奖励持续时间（上限 stormDurBonusMax） */
  durBonus = 0;
  /** 最近一次引爆的剩余伤害（天降甘霖按此数值治疗风场内友军） */
  lastBoomDmg = 0;
  /** 天降甘霖：每秒治疗的累计计时 */
  rainT = 0;

  onEnd?: (storm: Storm) => void;
  /** 被满蓄狂风引爆时回调：把吸收的弹体（类型+数量）交给场景，由场景按原样反弹 */
  onDetonate?: (storm: Storm, reflect: StormReflectItem[]) => void;

  constructor(scene: Phaser.Scene, x: number, y: number, owner: Fighter, onDetonate?: (storm: Storm, reflect: StormReflectItem[]) => void) {
    const b = BALANCE.wind;
    this.scene = scene;
    this.owner = owner;
    this.onDetonate = onDetonate;
    this.x = x;
    this.y = y;
    this.baseR = b.skillRadius;
    this.r = b.skillRadius;
    this.orbitR = this.r * b.orbitRadiusFactor;
    this.dur = b.skillDur;
    this.spinDir = Math.random() < 0.5 ? 1 : -1;
    this.graphics = scene.add.graphics().setDepth(14);
  }

  /**
   * v0.23：旋风只作用于敌人。
   * 乱斗模式传入的列表可能包含施法者本人，团队模式的队友也一样，
   * 都必须排除，否则会被自己的旋风减速/强制旋转。
   */
  private affects(e: Fighter): boolean {
    if (!e.alive || e === this.owner) return false;
    if (e.teamBattle && e.team === this.owner.team) return false;
    return true;
  }

  /** 当前被吸入的抛射物总数（用于半径成长与伤害加成） */
  private absorbedCount(): number {
    return this.caughtBullets.size + this.caughtGusts.size + this.caughtMissiles.size;
  }

  /** v0.16：风球等特殊抛射物被吸入时，按一颗子弹的标准增加持续时间 */
  gainDurBonus() {
    const b = BALANCE.wind;
    const remaining = Math.max(0, b.stormDurBonusMax - this.durBonus);
    const add = Math.min(b.stormDurBonusPerBullet, remaining);
    if (add > 0) {
      this.dur += add;
      this.durBonus += add;
    }
  }

  /** 当前半径相对基础半径的成长比例（1 = 未成长） */
  private growMul(): number {
    const b = BALANCE.wind;
    return Math.min(1 + b.stormGrowMax, 1 + b.stormGrowPerBullet * this.absorbedCount());
  }

  /** v0.22：减速随吸入弹体增多而增强，半径扩大 50% 时达到 80% 减速 */
  private slowMul(): number {
    const b = BALANCE.wind;
    const t = clamp((this.growMul() - 1) / b.stormSpinAtGrow, 0, 1);
    return b.stormSlowMul + (b.stormSlowMulMax - b.stormSlowMul) * t;
  }

  /** v0.22：半径扩大 ≥50% 后，狂风强制敌人绕旋风旋转 */
  private shouldSpin(): boolean {
    const b = BALANCE.wind;
    return this.growMul() >= 1 + b.stormSpinAtGrow;
  }

  /** 强制敌人沿旋风轨道旋转（仍遵守墙体，撞墙即停在墙边） */
  private spinEnemy(e: Fighter, dt: number, walls: Phaser.Geom.Rectangle[]) {
    const b = BALANCE.wind;
    let ang = this.spinAngles.get(e);
    if (ang === undefined) {
      ang = Math.atan2(e.y - this.y, e.x - this.x);
      this.spinAngles.set(e, ang);
      this.spinRadii.set(e, clamp(dist(e.x, e.y, this.x, this.y), 34, this.orbitR));
    }
    ang += this.spinDir * b.stormSpinSpeed * dt;
    this.spinAngles.set(e, ang);
    const rad = Math.min(this.spinRadii.get(e) ?? this.orbitR, this.orbitR);
    const tx = this.x + Math.cos(ang) * rad;
    const ty = this.y + Math.sin(ang) * rad;
    const res = sweepCircleMove(e.x, e.y, tx, ty, BODY_R, walls);
    const body = e.sprite.body as Phaser.Physics.Arcade.Body | null;
    e.sprite.setPosition(res.x, res.y);
    body?.reset(res.x, res.y);
  }

  /** 根据吸入数量刷新实际半径与轨道半径 */
  private refreshRadius() {
    const b = BALANCE.wind;
    this.r = this.baseR * this.growMul();
    this.orbitR = this.r * b.orbitRadiusFactor;
  }

  /** 清除某个敌人的强制旋转轨道记录 */
  private clearSpin(e: Fighter) {
    this.spinAngles.delete(e);
    this.spinRadii.delete(e);
  }

  /** @returns 风暴是否已结束 */
  update(
    dt: number, enemies: Fighter[], bullets: Bullet[], gusts: Gust[], missiles: Missile[],
    walls: Phaser.Geom.Rectangle[] = [],
  ): boolean {
    if (!this.active) return true;
    const b = BALANCE.wind;

    this.dur -= dt;
    this.angle += dt * 2.6;
    if (this.dur <= 0) {
      this.end();
      return true;
    }

    this.refreshRadius();

    // 周期伤害：基础 + 吸入子弹伤害的 25%
    this.tickTimer -= dt;
    if (this.tickTimer <= 0) {
      this.tickTimer += b.skillTickCd;
      const tickDmg = this.tickDamage();
      for (const e of enemies) {
        if (!this.affects(e)) continue;
        if (dist(e.x, e.y, this.x, this.y) <= this.r) {
          e.takeDamage(tickDmg, { source: this.owner });
        }
      }
    }

    // 敌人：进入范围则减速（随吸入量增强），离开则恢复；半径扩大 ≥50% 后强制旋转
    const slow = this.slowMul();
    const spin = this.shouldSpin();
    for (const e of enemies) {
      // 自己 / 队友 / 已阵亡：不减速、不旋转；若此前被卷入则恢复
      if (!this.affects(e)) {
        if (this.caught.has(e)) {
          e.stormSlowMul = 1;
          this.caught.delete(e);
          this.clearSpin(e);
        }
        continue;
      }
      if (e.controlImmune) continue; // 免控（奥术登神蓄力）无视旋风
      const inside = dist(e.x, e.y, this.x, this.y) <= this.r;
      if (inside) {
        this.caught.add(e);
        e.stormSlowMul = slow;
        if (spin) this.spinEnemy(e, dt, walls);
        else this.clearSpin(e);
      } else if (this.caught.has(e)) {
        e.stormSlowMul = 1;
        this.caught.delete(e);
        this.clearSpin(e);
      }
    }

    // 吸入前计数，用于本帧新增奖励持续时间
    const prevCount = this.absorbedCount();

    // 子弹 / 狂风 / 导弹：吸入旋风并绕同一轨道旋转
    for (const bt of bullets) {
      if (bt.dead || bt.orbit) continue;
      if (dist(bt.sprite.x, bt.sprite.y, this.x, this.y) <= this.r) {
        bt.absorb(this);
        this.caughtBullets.add(bt);
      }
    }
    for (const g of gusts) {
      if (g.dead || g.orbit) continue;
      if (dist(g.sprite.x, g.sprite.y, this.x, this.y) <= this.r) {
        // 满蓄的右键狂风命中旋风 → 立刻引爆
        if (g.charged && g.power >= 1) {
          this.detonateNow(enemies);
          return true;
        }
        g.absorb(this);
        this.caughtGusts.add(g);
      }
    }
    for (const m of missiles) {
      if (m.dead || m.orbit) continue;
      if (dist(m.sprite.x, m.sprite.y, this.x, this.y) <= this.r) {
        m.absorb(this);
        this.caughtMissiles.add(m);
      }
    }

    // 本帧新吸入的抛射物 → 增加旋风持续时间（上限 stormDurBonusMax）
    const delta = this.absorbedCount() - prevCount;
    if (delta > 0) {
      const remaining = b.stormDurBonusMax - this.durBonus;
      const add = Math.min(delta * b.stormDurBonusPerBullet, remaining);
      if (add > 0) {
        this.dur += add;
        this.durBonus += add;
      }
    }

    this.draw();
    return false;
  }

  /** 当前一次 tick 的伤害（基础 + 吸入物伤害的 25%） */
  tickDamage(): number {
    const b = BALANCE.wind;
    let bonus = 0;
    for (const bt of this.caughtBullets) bonus += bt.dmg;
    for (const g of this.caughtGusts) bonus += g.dmg;
    for (const m of this.caughtMissiles) bonus += m.dmg;
    return b.skillTickDmg + Math.round(bonus * b.stormAbsorbDmgRatio);
  }

  /** 被满蓄狂风引爆：范围爆炸 + 立刻停止，并把吸收的弹体（类型+数量一致）交给场景反弹 */
  private detonateNow(enemies: Fighter[]) {
    const b = BALANCE.wind;
    const remainingTicks = Math.max(0, this.dur) / b.skillTickCd;
    const boom = Math.round(remainingTicks * this.tickDamage() * b.stormDetonateMul);
    this.lastBoomDmg = boom;

    // 收集吸收物的类型信息（用于按原类型、原数量反弹）
    const reflect: StormReflectItem[] = [];
    for (const bt of this.caughtBullets) reflect.push({ kind: 'bullet', dmg: bt.dmg });
    for (const g of this.caughtGusts) reflect.push({ kind: 'gust', dmg: g.dmg, power: g.power });
    for (const m of this.caughtMissiles) reflect.push({ kind: 'missile', dmg: m.dmg });

    // 恢复减速；原弹体消散（不触发爆炸特效）
    for (const e of [...this.caught]) e.stormSlowMul = 1;
    this.caught.clear();
    this.spinAngles.clear();
    this.spinRadii.clear();
    for (const bt of this.caughtBullets) bt.vanish();
    for (const g of this.caughtGusts) g.destroyPuff();
    for (const m of this.caughtMissiles) m.vanish();
    this.caughtBullets.clear();
    this.caughtGusts.clear();
    this.caughtMissiles.clear();
    this.active = false;

    // 范围爆炸伤害
    if (boom > 0) {
      for (const e of enemies) {
        if (!this.affects(e)) continue;
        if (dist(e.x, e.y, this.x, this.y) <= this.r) {
          e.takeDamage(boom, { source: this.owner });
        }
      }
    }
    this.onDetonate?.(this, reflect);
  }

  end() {
    if (!this.active) return;
    this.active = false;
    for (const e of [...this.caught]) {
      e.stormSlowMul = 1;
    }
    this.caught.clear();
    this.spinAngles.clear();
    this.spinRadii.clear();
    // 旋风中的子弹/狂风/导弹随旋风一同消散
    for (const bt of this.caughtBullets) bt.vanish();
    for (const g of this.caughtGusts) g.destroyPuff();
    for (const m of this.caughtMissiles) m.vanish();
    this.caughtBullets.clear();
    this.caughtGusts.clear();
    this.caughtMissiles.clear();
    this.onEnd?.(this);
  }

  destroy() {
    this.end();
    this.graphics.destroy();
  }

  private draw() {
    const g = this.graphics;
    g.clear();
    const pulse = 0.5 + 0.5 * Math.sin(this.angle * 3);
    const r = this.r;

    // 风暴能量场：半透明青色覆盖整片范围，玩家/对手都能一眼看出边界
    g.fillStyle(0x2b8fa8, 0.11 + 0.05 * pulse).fillCircle(this.x, this.y, r);
    g.fillStyle(0x8be8f2, 0.07).fillCircle(this.x, this.y, r * 0.82);

    // 外圈：旋转断弧（加粗）+ 亮色实线
    g.lineStyle(6, 0x6fe0f0, 0.9);
    const segs = 18;
    for (let i = 0; i < segs; i += 2) {
      const a0 = this.angle + (i / segs) * Math.PI * 2;
      const a1 = this.angle + ((i + 1) / segs) * Math.PI * 2;
      g.lineBetween(
        this.x + Math.cos(a0) * r, this.y + Math.sin(a0) * r,
        this.x + Math.cos(a1) * r, this.y + Math.sin(a1) * r,
      );
    }
    g.lineStyle(2, 0xd9fbff, 0.85);
    g.strokeCircle(this.x, this.y, r - 4);

    // 轨道环：子弹 / 狂风 / 导弹全都固定在这条环上旋转
    g.lineStyle(4, 0x59d3e3, 0.55 + 0.3 * pulse);
    g.strokeCircle(this.x, this.y, this.orbitR);
    g.lineStyle(1.5, 0xd9fbff, 0.35 + 0.25 * pulse);
    g.strokeCircle(this.x, this.y, this.orbitR - 6);

    // 内吸螺旋：提示“卷进去”的方向感
    g.lineStyle(3, 0x59d3e3, 0.35);
    for (let k = 0; k < 6; k++) {
      const base = this.angle + (k * Math.PI) / 3;
      g.beginPath();
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const a = base + this.spinDir * t * 0.55;
        const rr = this.orbitR * (1 - t * 0.92);
        const px = this.x + Math.cos(a) * rr;
        const py = this.y + Math.sin(a) * rr;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.strokePath();
    }

    // 中心风眼弱光
    const glow = 0.6 + 0.4 * Math.sin(this.angle * 2);
    g.fillStyle(0xbfefff, glow * 0.18).fillCircle(this.x, this.y, r * 0.22);
  }
}
