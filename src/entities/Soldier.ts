import Phaser from 'phaser';
import { BALANCE, MAP_SIZE } from '../config';
import { circleRectCollision, dist, pointInRects } from '../core/util';
import type { Fighter } from './Fighter';

export type SoldierState = 'spawn' | 'warn' | 'charge';

export interface SoldierHitOpts {
  /** 减速比例（0.2 = 移速 ×0.8） */
  slow?: number;
  slowDur?: number;
  /** 击退冲量 */
  knock?: number;
  dirX?: number;
  dirY?: number;
}

export interface SoldierWorld {
  /** 地图墙体矩形 */
  walls: Phaser.Geom.Rectangle[];
  /** 当前敌对目标（已过滤自身 / 友军 / 阵亡） */
  enemies: Fighter[];
  /** 结算伤害（击杀归属帝君），可附带减速 / 击退 */
  hit: (target: Fighter, dmg: number, opts?: SoldierHitOpts) => void;
  /** 方针 1：朝指定角度发射 3 支箭 */
  arrow: (soldier: Soldier, angle: number) => void;
  /** 方针 3：120° 扇形挥矛 */
  cone: (soldier: Soldier, angle: number) => void;
  /** 同属主的其他雄兵（计算相互排斥力，避免叠在一点） */
  peers: Soldier[];
}

const SOLDIER_SCALE = 2.8;
/** 友军碰撞体半径（用于冲锋碰触判定，与 Fighter 的 BODY_R 一致） */
const TOUCH_R = 22;
/** 队形最小间距：雄兵之间尽量相隔至少 80px */
const SEP_DIST = 80;
/** 排斥力权重 */
const SEP_WEIGHT = 1.35;

/**
 * 帝君麾下雄兵（v0.32）。
 * 不阻挡子弹、不会受到攻击；不会自动追踪敌人。
 * 长矛只在攻击瞬间出现；方针 1 常驻持弓；方针 4 改为持盾；方针 3 为特立独行的精锐。
 */
export class Soldier {
  readonly owner: Fighter;
  readonly sprite: Phaser.GameObjects.Sprite;
  /** 长矛武器：仅在攻击 / 冲锋 / 护驾时显示 */
  readonly spear: Phaser.GameObjects.Sprite;
  /** 弓：仅方针 1 常驻显示 */
  readonly bow: Phaser.GameObjects.Sprite;
  /** 盾：仅方针 4 常驻显示 */
  readonly shield: Phaser.GameObjects.Sprite;
  private ring: Phaser.GameObjects.Graphics;

  x: number;
  y: number;
  dead = false;
  state: SoldierState = 'spawn';
  /** 召唤后的 1s 延迟 */
  spawnT = BALANCE.emperor.soldierSpawnDelay;
  /** 攻击间隔计时 */
  atkT = 0;
  /** 巨浪眩晕剩余时间（v0.35 珊瑚海） */
  stunT = 0;
  /** 巨浪击退速度（衰减） */
  private kbX = 0;
  private kbY = 0;
  target: Fighter | null = null;
  faceAngle = 0;

  /** 统治临时召唤：不占雄兵上限、不提供护盾 */
  temp = false;
  /** 本次冲锋结束后立即消失（方针 4 的统治冲锋） */
  expireAfterCharge = false;
  /** 冲锋结算后标记为待销毁 */
  expireNow = false;
  /** 冲锋伤害额外倍率（方针 4 统治：本次冲锋伤害翻倍） */
  chargeDmgMulOverride = 1;

  /** 方针 2：冲锋后的下次攻击加成（攻击时消耗） */
  p2NextRange = 0;
  p2NextDmg = 0;

  /** 冲锋目标点（施法终点） */
  chargeX = 0;
  chargeY = 0;
  /** 冲锋实际落点（越过终点一小段，确保撞到终点上的敌人并能继续攻击） */
  private chargeGoalX = 0;
  private chargeGoalY = 0;
  /** 冲锋方向 */
  private chargeDirX = 1;
  private chargeDirY = 0;
  /** 本次冲锋已碰触的敌人（避免重复结算） */
  private chargeHits = new Set<Fighter>();

  /** 移动/攻击视觉计时 */
  private moveT = 0;
  private attackFxT = 0;
  private attackAngle = 0;
  private animT = 0;
  /** 护驾旋转视觉 */
  private spinFxT = 0;
  private spinStart = 0;
  /** 砸地视觉 */
  private smashFxT = 0;

  constructor(scene: Phaser.Scene, owner: Fighter, x: number, y: number) {
    this.owner = owner;
    this.x = x;
    this.y = y;
    this.sprite = scene.add.sprite(x, y, 'soldier-idle')
      .setScale(SOLDIER_SCALE)
      .setDepth(9)
      .setAlpha(0.4);
    this.spear = scene.add.sprite(x, y, 'tex-spear')
      .setOrigin(0.12, 0.5)
      .setScale(2.2)
      .setDepth(9)
      .setVisible(false)
      .setAlpha(0.4);
    this.bow = scene.add.sprite(x, y, 'tex-bow')
      .setOrigin(0.5, 0.5)
      .setScale(2.0)
      .setDepth(9)
      .setVisible(false)
      .setAlpha(0.4);
    this.shield = scene.add.sprite(x, y, 'tex-shield')
      .setOrigin(0.5, 0.5)
      .setScale(2.4)
      .setDepth(9)
      .setVisible(false)
      .setAlpha(0.4);
    this.ring = scene.add.graphics().setDepth(6);
  }

  private get policy(): number { return this.owner.emperorPolicy; }

  /** 方针 3 的体型 / 攻击范围 / 移速倍率 */
  get p3Mul(): number { return this.policy === 3 ? BALANCE.emperor.p3BuffMul : 1; }

  /** 是否常驻持弓（方针 1） */
  private get holdingBow(): boolean { return this.policy === 1; }

  /** 是否持盾（方针 4，不攻击） */
  private get holdingShield(): boolean { return this.policy === 4; }

  /** 攻击范围：方针 1 为 600px 射击距离，其余为矛击距离（v0.33 方针 3 不再增加范围） */
  get attackRange(): number {
    if (this.policy === 1) return BALANCE.emperor.p1Range;
    return BALANCE.emperor.spearRange;
  }

  /** 阻挡子弹的判定半径（仅方针 4 的持盾雄兵） */
  get blockRadius(): number {
    return this.policy === 4 ? BALANCE.emperor.p4BlockRadius : 0;
  }

  /** 本次攻击可用的范围（方针 2 冲锋后的下次攻击 +50px） */
  get attackRangeNow(): number {
    return this.attackRange + (this.policy === 2 ? this.p2NextRange : 0);
  }

  get attackCd(): number {
    const e = BALANCE.emperor;
    let cd = e.spearCd;
    if (this.policy === 5) cd *= e.p5SoldierCdMul; // 攻速 -25%
    return cd;
  }

  /** 当前攻击伤害（含方针加成与冲锋后的下次攻击加成） */
  get attackDmgNow(): number {
    const e = BALANCE.emperor;
    let dmg = e.spearDmg;
    if (this.policy === 3) dmg *= e.p3DmgMul;
    if (this.policy === 5) dmg *= e.p5SoldierDmgMul;
    if (this.policy === 2) dmg += this.p2NextDmg;
    return dmg;
  }

  get scaleNow(): number { return SOLDIER_SCALE * this.p3Mul; }

  /** 被珊瑚海巨浪击中：眩晕 + 大幅击退（雄兵体型小，击退按 45% 结算） */
  hitByWave(dir: number, stun: number, knock: number) {
    if (this.dead) return;
    this.stunT = Math.max(this.stunT, stun);
    this.kbX += dir * knock * 0.45;
    this.kbY += (Math.random() - 0.5) * 220;
    if (this.state === 'charge') this.state = 'warn';
    this.chargeHits.clear();
    this.target = null;
  }

  /** 眩晕期间的击退位移：与墙体相交的轴单独停下 */
  private updateKnockback(dt: number, world: SoldierWorld) {
    const decay = Math.max(0, 1 - 8 * dt);
    this.kbX *= decay;
    this.kbY *= decay;
    if (Math.abs(this.kbX) < 1) this.kbX = 0;
    if (Math.abs(this.kbY) < 1) this.kbY = 0;
    const blocked = (x: number, y: number) =>
      world.walls.some((r) => circleRectCollision(x, y, this.wallR, r) !== null);
    const nx = Math.min(MAP_SIZE - 60, Math.max(60, this.x + this.kbX * dt));
    const ny = Math.min(MAP_SIZE - 60, Math.max(60, this.y + this.kbY * dt));
    if (!blocked(nx, this.y)) this.x = nx; else this.kbX = 0;
    if (!blocked(this.x, ny)) this.y = ny; else this.kbY = 0;
  }

  private get wallR(): number { return 15 * this.p3Mul; }

  /** 冲锋碰触判定半径（方针 4 扩大 50%） */
  private get chargeTouchR(): number {
    const r = this.wallR + TOUCH_R;
    return this.policy === 4 ? r * BALANCE.emperor.p4ChargeRadiusMul : r;
  }

  /** 本次冲锋伤害 */
  private get chargeDmgNow(): number {
    const e = BALANCE.emperor;
    let dmg = e.chargeDmg;
    if (this.policy === 2) dmg *= e.p2ChargeDmgMul;
    if (this.policy === 4) dmg *= e.p4ChargeDmgMul;
    return dmg * this.chargeDmgMulOverride;
  }

  /** 贴图前缀：方针 3 / 4 使用专属形象 */
  private get texPrefix(): string {
    if (this.policy === 3) return 'soldier-p3';
    if (this.policy === 4) return 'soldier-p4';
    return 'soldier';
  }

  private nearestEnemy(enemies: Fighter[], range: number): Fighter | null {
    // 超出活动范围时雄兵不再攻击
    if (dist(this.owner.x, this.owner.y, this.x, this.y) > BALANCE.emperor.leashRange) return null;
    let best: Fighter | null = null;
    let bestD = range;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = dist(this.x, this.y, e.x, e.y);
      if (d <= bestD) { bestD = d; best = e; }
    }
    return best;
  }

  /**
   * 冲锋：朝施法终点移动，并越过终点一小段继续前冲，确保撞到终点上的敌人；
   * 落点仍处于攻击范围内，可以继续攻击终点附近的敌人。
   * @param lane 并排偏移序号（负/正表示左右两侧）
   */
  chargeTo(x: number, y: number, lane = 0) {
    const e = BALANCE.emperor;
    this.state = 'charge';
    this.chargeX = x;
    this.chargeY = y;
    this.chargeHits.clear();
    this.target = null;
    // v0.33：方针 2 的冲锋后攻击加成在每次使用冲锋时重置（再由本次冲锋结束重新赋予）
    if (this.policy === 2) {
      this.p2NextRange = 0;
      this.p2NextDmg = 0;
    }

    let dx = x - this.x;
    let dy = y - this.y;
    let len = Math.hypot(dx, dy);
    if (len < 1) { dx = 1; dy = 0; len = 1; }
    this.chargeDirX = dx / len;
    this.chargeDirY = dy / len;
    const px = -this.chargeDirY;
    const py = this.chargeDirX;
    // 越过终点的距离：保持在攻击范围内，同时确实“穿过”终点
    // （方针 4 统治的临时雄兵必须正好冲锋 500px，不额外越过）
    const overshoot = this.expireAfterCharge
      ? 0
      : this.policy === 4
        ? Math.min(60, len)
        : Math.min(this.attackRange * e.chargeOverShoot, 90, len * 0.5);
    const gx = x + this.chargeDirX * overshoot + px * lane * e.chargeLaneGap;
    const gy = y + this.chargeDirY * overshoot + py * lane * e.chargeLaneGap;

    // v0.33：800px 活动范围只限制攻击，不再限制冲锋落点——雄兵超出 800px 仍可被冲锋操控。
    // 落点不能落在墙体里：真正的墙体检在 updateCharge 中（墙壁表由每帧 world 传入）
    this.chargeGoalX = gx;
    this.chargeGoalY = gy;
  }

  /** 方针 1 的「冲锋」改为原地快速三轮齐射（由 GameScene 计时触发） */
  volley(angle: number, world: SoldierWorld) {
    this.faceAngle = angle;
    this.attackFxT = 0.2;
    this.attackAngle = angle;
    world.arrow(this, angle);
  }

  /** 方针 3 护驾：原地旋转长矛一圈 */
  playGuard() {
    this.spinFxT = 0.42;
    this.spinStart = this.faceAngle;
  }

  /** 方针 3 统治：举矛猛砸地面 */
  playSmash() {
    this.smashFxT = 0.5;
  }

  update(dt: number, world: SoldierWorld) {
    if (this.dead) return;

    // 召唤延迟：半透明闪烁，1s 后才能行动
    if (this.state === 'spawn') {
      this.spawnT -= dt;
      const a = 0.35 + 0.45 * (Math.abs(Math.sin(this.spawnT * 9)));
      this.sprite.setAlpha(a);
      this.spear.setAlpha(a);
      this.bow.setAlpha(a);
      this.shield.setAlpha(a);
      this.sprite.setScale(this.scaleNow);
      this.sprite.setPosition(this.x, this.y);
      this.updateWeapon(dt);
      this.drawRing();
      if (this.spawnT <= 0) {
        this.state = 'warn';
        this.sprite.setAlpha(1);
        this.spear.setAlpha(1);
        this.bow.setAlpha(1);
        this.shield.setAlpha(1);
      }
      return;
    }

    this.atkT = Math.max(0, this.atkT - dt);
    this.attackFxT = Math.max(0, this.attackFxT - dt);
    this.spinFxT = Math.max(0, this.spinFxT - dt);
    this.smashFxT = Math.max(0, this.smashFxT - dt);

    // 巨浪眩晕：只被击退，不做任何 AI 行为
    if (this.stunT > 0) {
      this.stunT = Math.max(0, this.stunT - dt);
      this.updateKnockback(dt, world);
      this.sprite.setScale(this.scaleNow);
      this.sprite.setPosition(this.x, this.y);
      this.sprite.setFlipX(Math.cos(this.faceAngle) < 0);
      this.updateWeapon(dt);
      this.drawRing();
      return;
    }

    if (this.state === 'charge') {
      this.updateCharge(dt, world);
    } else {
      this.updateCombat(dt, world);
    }

    // 队形维持：与同伴保持至少 80px（位置力场，不做实体碰撞）
    this.applySeparation(dt, world);

    // 走路动画：按方针使用不同形象
    this.animT += dt;
    const moving = this.moveT > 0;
    this.moveT = Math.max(0, this.moveT - dt);
    const prefix = this.texPrefix;
    if (moving) {
      const walkKey = 'walk-' + prefix;
      if (this.sprite.anims.currentAnim?.key !== walkKey) this.sprite.play(walkKey);
    } else if (this.sprite.anims.isPlaying) {
      this.sprite.anims.stop();
      this.sprite.setTexture(prefix + '-idle');
    } else if (this.sprite.texture.key !== prefix + '-idle') {
      this.sprite.setTexture(prefix + '-idle');
    }

    this.sprite.setScale(this.scaleNow);
    this.sprite.setPosition(this.x, this.y);
    this.sprite.setFlipX(Math.cos(this.faceAngle) < 0);
    this.updateWeapon(dt);
    this.drawRing();
  }

  /** 武器跟随：方针 1 常驻持弓；方针 4 常驻持盾；其余长矛只在动作时出现 */
  private updateWeapon(dt: number) {
    const s = this.scaleNow / SOLDIER_SCALE;
    const ang = this.attackAngle;
    let offset = 12;
    let angle = this.faceAngle;
    if (this.attackFxT > 0) {
      const dur = this.policy === 3 ? 0.26 : 0.2;
      const p = Math.max(0, Math.min(1, 1 - this.attackFxT / dur));
      if (this.policy === 3) {
        // 挥击：从 -60° 扫到 +60°，并略微前伸
        angle = ang - Math.PI / 3 + (Math.PI * 2 / 3) * p;
        offset = 16 + 10 * Math.sin(p * Math.PI);
      } else {
        // 戳击：先快速前刺再收回
        angle = ang;
        offset = 12 + 26 * Math.sin(p * Math.PI);
      }
    }
    // 护驾：长矛绕身旋转一圈
    if (this.spinFxT > 0) {
      const p = 1 - this.spinFxT / 0.42;
      angle = this.spinStart + p * Math.PI * 2;
      offset = 26 * s;
    }
    // 砸地：长矛转到正下方
    if (this.smashFxT > 0) {
      angle = Math.PI / 2;
      offset = 14 + 26 * Math.min(1, (0.5 - this.smashFxT) / 0.22);
    }

    // 长矛：动作时可见（方针 1 持弓、方针 4 持盾时不出现）
    const showSpear = (this.attackFxT > 0 || this.spinFxT > 0 || this.smashFxT > 0)
      && !this.holdingBow && !this.holdingShield;
    this.spear.setVisible(showSpear);
    if (showSpear) {
      this.spear.setScale(2.2 * s);
      this.spear.setPosition(
        this.x + Math.cos(angle) * offset * s,
        this.y + Math.sin(angle) * offset * s,
      );
      this.spear.setAngle(angle * Phaser.Math.RAD_TO_DEG);
    }

    // 弓：方针 1 常驻，攻击时略微后拉
    this.bow.setVisible(this.holdingBow);
    if (this.holdingBow) {
      const draw = this.attackFxT > 0 ? 0.9 : 0;
      this.bow.setScale((2.0 + draw * 0.15) * s);
      this.bow.setPosition(
        this.x + Math.cos(this.faceAngle) * 13 * s,
        this.y + Math.sin(this.faceAngle) * 13 * s,
      );
      this.bow.setAngle(this.faceAngle * Phaser.Math.RAD_TO_DEG);
      this.bow.setFlipY(Math.cos(this.faceAngle) < 0);
    }

    // 盾：方针 4 常驻，挡在面朝方向前方
    this.shield.setVisible(this.holdingShield);
    if (this.holdingShield) {
      this.shield.setScale(2.4 * s);
      this.shield.setPosition(
        this.x + Math.cos(this.faceAngle) * 15 * s,
        this.y + Math.sin(this.faceAngle) * 15 * s,
      );
      this.shield.setFlipX(Math.cos(this.faceAngle) < 0);
    }

    void dt;
  }

  private updateCombat(dt: number, world: SoldierWorld) {
    const e = BALANCE.emperor;
    const enemies = world.enemies;
    this.moveT = 0;

    // 方针 4：持盾，不再攻击目标
    if (this.holdingShield) {
      this.target = null;
      // 冲锋结束后没有攻击，直接保持阵型
      const t0 = this.nearestEnemy(enemies, this.attackRangeNow);
      if (t0) this.faceAngle = Math.atan2(t0.y - this.y, t0.x - this.x);
      return;
    }

    // 雄兵不再自动追踪：只在攻击范围内（且未超出帝君活动范围）攻击最近的敌人
    const t = this.nearestEnemy(enemies, this.attackRangeNow);
    this.target = t;
    if (!t) return;
    this.faceAngle = Math.atan2(t.y - this.y, t.x - this.x);
    if (this.atkT > 0) return;

    this.atkT = this.attackCd;
    this.attackAngle = this.faceAngle;
    if (this.policy === 1) {
      // 方针 1：常驻弓箭，朝最近敌人及左右 30° 齐射
      this.attackFxT = 0.18;
      world.arrow(this, this.faceAngle);
    } else if (this.policy === 3) {
      // 方针 3：120° 扇形挥矛
      this.attackFxT = 0.26;
      world.cone(this, this.faceAngle);
    } else {
      this.attackFxT = 0.2;
      world.hit(t, this.attackDmgNow);
    }
    // v0.34：方针 2 的冲锋后范围/伤害加成只触发一次，攻击后立即清除（需再次冲锋才会重新获得）
    if (this.policy === 2) {
      this.p2NextRange = 0;
      this.p2NextDmg = 0;
    }
    void dt;
    void e;
  }

  /**
   * 冲锋：沙兵式群体移动，朝“越过终点”的落点推进。
   * 不再因进入攻击范围而提前停止；碰到终点上的敌人后继续前冲一小段。
   */
  private updateCharge(dt: number, world: SoldierWorld) {
    const e = BALANCE.emperor;
    // 落点若落在墙里（例如并排偏移把落点推进了墙），退回施法终点
    if (pointInRects(this.chargeGoalX, this.chargeGoalY, world.walls)) {
      this.chargeGoalX = this.chargeX;
      this.chargeGoalY = this.chargeY;
    }

    const gx = this.chargeGoalX;
    const gy = this.chargeGoalY;
    let dx = gx - this.x;
    let dy = gy - this.y;
    const d = Math.hypot(dx, dy);
    // 阈值放宽到 8px：同伴排斥会把士兵推离落点 2~4px，
    // 若用 2px 判定会陷入「永远差一点」的循环，冲锋状态无法结束
    if (d <= 8) { this.finishCharge(); return; }
    dx /= d;
    dy /= d;

    // 排斥分量：与同样处于冲锋状态的同伴互斥，保持 80px 间距
    let rx = 0;
    let ry = 0;
    for (const p of world.peers) {
      if (p === this || p.dead) continue;
      const pd = dist(this.x, this.y, p.x, p.y);
      if (pd >= SEP_DIST || pd <= 0.001) continue;
      const w = (SEP_DIST - pd) / SEP_DIST;
      rx += ((this.x - p.x) / pd) * w;
      ry += ((this.y - p.y) / pd) * w;
    }
    const nearK = 1 - Math.min(1, d / 260);
    const sepHard = SEP_WEIGHT * (0.55 + 0.9 * nearK);
    let sx = 0;
    let sy = 0;
    const rlen = Math.hypot(rx, ry);
    if (rlen > 0.001) {
      const push = Math.min(1, rlen) * sepHard * 210;
      sx = (rx / rlen) * push * dt;
      sy = (ry / rlen) * push * dt;
    }

    let mul = 1;
    if (this.policy === 2) mul *= e.p2SpeedMul; // 冲锋速度 +100%
    if (this.policy === 3) mul *= e.p3BuffMul; // 移速 +50%
    const step = Math.min(d, e.chargeSpeed * mul * dt);
    const nx = this.x + dx * step + sx;
    const ny = this.y + dy * step + sy;
    this.faceAngle = Math.atan2(dy * step + sy, dx * step + sx);

    // v0.33：冲锋不再受 800px 活动范围限制（超距只影响攻击）
    // 冲锋可越过墙体，不做墙体扫掠，只保留位置力场
    this.x = nx;
    this.y = ny;
    this.moveT = 0.15;

    // 冲锋途中碰触敌人 → 结算伤害（每次冲锋每个敌人只结算一次）
    for (const en of world.enemies) {
      if (!en.alive || this.chargeHits.has(en)) continue;
      if (dist(this.x, this.y, en.x, en.y) <= this.chargeTouchR) {
        this.chargeHits.add(en);
        const opts: SoldierHitOpts = {
          dirX: dx,
          dirY: dy,
        };
        if (this.policy === 2) {
          opts.slow = e.p2Slow;
          opts.slowDur = e.p2SlowDur;
        }
        if (this.policy === 4) opts.knock = e.p4Knock;
        world.hit(en, this.chargeDmgNow, opts);
      }
    }

    if (d <= 8) this.finishCharge();
  }

  /** 冲锋结束：进入戒备；方针 2 的士兵获得下次攻击加成；临时雄兵标记消失 */
  private finishCharge() {
    this.state = 'warn';
    this.moveT = 0.2;
    if (this.policy === 2) {
      this.p2NextRange = BALANCE.emperor.p2NextRangeBonus;
      this.p2NextDmg = BALANCE.emperor.p2NextDmgBonus;
    }
    if (this.expireAfterCharge) this.expireNow = true;
  }

  /** 与同伴保持至少 80px（位置力场，平时也生效），并遵守活动范围 / 墙体 */
  private applySeparation(dt: number, world: SoldierWorld) {
    let rx = 0;
    let ry = 0;
    for (const p of world.peers) {
      if (p === this || p.dead || p.owner !== this.owner) continue;
      const pd = dist(this.x, this.y, p.x, p.y);
      if (pd >= SEP_DIST || pd <= 0.001) continue;
      const w = (SEP_DIST - pd) / SEP_DIST;
      rx += ((this.x - p.x) / pd) * w;
      ry += ((this.y - p.y) / pd) * w;
    }
    const rlen = Math.hypot(rx, ry);
    if (rlen <= 0.001) return;
    const push = Math.min(1, rlen) * 240 * dt;
    const nx = this.x + (rx / rlen) * push;
    const ny = this.y + (ry / rlen) * push;
    // v0.33：队形排斥不再受 800px 限制
    // 位置微调后若被挤进墙体则放弃本次修正
    for (const r of world.walls) {
      if (circleRectCollision(nx, ny, this.wallR, r)) return;
    }
    this.x = nx;
    this.y = ny;
  }

  /** 攻击范围圈 + 冲锋 / 护驾 / 砸地特效 */
  private drawRing() {
    const g = this.ring;
    g.clear();
    if (this.dead) return;

    const rangeColor = this.policy === 1 ? 0xffd75e
      : this.policy === 3 ? 0xff9d4d : this.policy === 4 ? 0xc9d6ea : 0xfff0c8;
    if (this.state !== 'spawn' && !this.holdingShield) {
      g.lineStyle(1, rangeColor, this.policy === 1 ? 0.16 : 0.3);
      g.strokeCircle(this.x, this.y, this.attackRange);
    }

    // 冲锋：脚下金圈 + 朝向箭头
    if (this.state === 'charge') {
      g.lineStyle(2, 0xffd75e, 0.45);
      g.strokeCircle(this.x, this.y, this.wallR + 4);
      g.lineStyle(3, 0xfff0c8, 0.7);
      g.lineBetween(
        this.x, this.y,
        this.x + Math.cos(this.faceAngle) * (this.wallR + 16),
        this.y + Math.sin(this.faceAngle) * (this.wallR + 16),
      );
    }

    // 护驾：旋转的金色矛环
    if (this.spinFxT > 0) {
      const p = 1 - this.spinFxT / 0.42;
      g.lineStyle(3, 0xffd75e, 0.75);
      g.beginPath();
      g.arc(this.x, this.y, this.attackRange, this.spinStart, this.spinStart + Math.PI * 2 * p);
      g.strokePath();
      g.lineStyle(2, 0xfff3c4, 0.6);
      g.strokeCircle(this.x, this.y, this.attackRange);
    }

    // 砸地：冲击圈
    if (this.smashFxT > 0) {
      const p = 1 - this.smashFxT / 0.5;
      const r = 30 + 190 * p;
      g.lineStyle(5, 0xffd75e, 0.7 * (1 - p));
      g.strokeCircle(this.x, this.y, r);
      g.lineStyle(2, 0xfff3c4, 0.4 * (1 - p));
      g.strokeCircle(this.x, this.y, r * 0.7);
    }

    // 矛击特效：朝攻击方向的一记短刺 / 扇形挥击弧
    if (this.attackFxT > 0) {
      const a = this.attackAngle;
      const r = this.attackRange;
      const len = Math.min(r, 90);
      if (this.policy === 3) {
        g.fillStyle(0xffd75e, 0.18);
        g.beginPath();
        g.arc(this.x, this.y, r, a - Math.PI / 3, a + Math.PI / 3);
        g.lineTo(this.x, this.y);
        g.closePath();
        g.fillPath();
      } else if (this.policy !== 1 && !this.holdingShield) {
        g.lineStyle(3, 0xfff0c8, 0.85);
        g.lineBetween(this.x, this.y, this.x + Math.cos(a) * len, this.y + Math.sin(a) * len);
      }
    }

    // 方针 3 的精锐雄兵：额外金色底环
    if (this.policy === 3) {
      g.lineStyle(2, 0xf0c23a, 0.5);
      g.strokeCircle(this.x, this.y, this.wallR);
    }
    // 方针 4 的持盾雄兵：银蓝底环
    if (this.policy === 4) {
      g.lineStyle(2, 0x9fc4e8, 0.45);
      g.strokeCircle(this.x, this.y, this.wallR + 2);
    }
  }

  /** 方针切换后立即刷新形象（由 GameScene 在 applyPolicy 时调用） */
  refreshLook() {
    if (this.sprite.anims.isPlaying) this.sprite.anims.stop();
    this.sprite.setTexture(this.texPrefix + '-idle');
    if (this.attackFxT <= 0 && this.spinFxT <= 0 && this.smashFxT <= 0) this.spear.setVisible(false);
    this.bow.setVisible(this.holdingBow);
    this.shield.setVisible(this.holdingShield);
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.ring.destroy();
    this.spear.destroy();
    this.bow.destroy();
    this.shield.destroy();
    this.sprite.destroy();
  }
}
