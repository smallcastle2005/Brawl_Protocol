import Phaser from 'phaser';
import { BALANCE, CHAR } from '../config';
import { circleRectCollision, reflect, dist, clamp } from '../core/util';
import { Fighter } from './Fighter';
import type { Storm } from './Storm';

/** 子弹附加参数 */
export interface BulletOpts {
  dmg?: number;
  speed?: number;
  homingTarget?: Fighter;
  passWalls?: boolean;
  life?: number;
  /** 命中敌人是否给神枪手充能（弹幕风暴的追踪弹为 false） */
  countsCharge?: boolean;
  /** 穿透：命中敌人后继续飞行（同一目标只结算一次） */
  pierce?: boolean;
  /** 撞墙直接消散（剑气类），而不是反弹 */
  vanishOnWall?: boolean;
  texture?: string;
  /** 贴图缩放倍率（相对默认 3.2） */
  scale?: number;
  /** 碰撞半径 */
  radius?: number;
  glowTint?: number;
  /** 撞墙反弹时回调（用于弹墙音效，区别于命中） */
  onBounce?: () => void;
  /** 最大飞行距离（默认神枪手 1500） */
  travelMax?: number;
  /** 超过该飞行距离后伤害开始衰减（0 表示不衰减） */
  falloffDist?: number;
  /** 衰减后的伤害倍率 */
  falloffMul?: number;
  /** 命中时按目标动态结算伤害（帝君方针 5：敌人在雄兵攻击范围内时 +50%） */
  dmgResolve?: (target: Fighter) => number;
  /** v0.41 死神之眼：锁定狙击必定暴击 */
  forceCrit?: boolean;
  /** 强制暴击使用的暴击伤害倍率（暴击率 ×2 转暴伤） */
  forceCritMul?: number;
}

/** 阻挡子弹的圆形区域（v0.33：方针 4 的持盾雄兵） */
export interface BulletBlocker {
  x: number;
  y: number;
  r: number;
}

/** 神枪手弹射子弹：无限反弹、限距爆炸；追踪弹可穿墙、被旋风吸收 */
export class Bullet {
  scene: Phaser.Scene;
  sprite: Phaser.GameObjects.Sprite;
  glow: Phaser.GameObjects.Sprite;
  owner: Fighter;
  vx: number;
  vy: number;
  speed: number;
  dmg: number;
  travelMax: number;
  traveled = 0;
  bounces = 0;
  dead = false;
  radius = 6;
  /** 距离衰减：飞行超过 falloffDist 后伤害乘以 falloffMul（战争机器能量弹） */
  falloffDist = 0;
  falloffMul = 1;

  /** 命中敌人是否计入神枪手充能 */
  countsCharge = true;
  /** 穿透（剑气）：命中后继续飞行 */
  pierce = false;
  /** 撞墙消散（不反弹） */
  vanishOnWall = false;
  /** 穿透弹已经命中过的目标，避免重复结算 */
  hitSet = new Set<Fighter>();
  /** 命中时按目标动态结算伤害（帝君方针 5：敌人在雄兵攻击范围内时 +50%） */
  dmgResolve?: (target: Fighter) => number;
  /** 锁定狙击：必定暴击 */
  forceCrit = false;
  /** 锁定狙击：强制暴击倍率 */
  forceCritMul = 1.5;

  /** 和风守护：进入风场时子弹移速倍率（离开后由场景恢复为 1） */
  fieldSlowMul = 1;

  /** 被旋风吸入后的轨道状态（绕风暴统一轨道旋转，不再消耗飞行距离） */
  orbit: { storm: Storm; angle: number; radius: number } | null = null;

  /** 追踪弹：追踪目标（可被旋风吸收） */
  homingTarget: Fighter | null = null;
  /** 追踪弹是否穿墙（忽略墙体碰撞） */
  passWalls = false;
  /** 追踪弹寿命（秒），到点消失 */
  lifeTimer = 0;

  onSpark?: (x: number, y: number) => void;
  onBoom?: (x: number, y: number) => void;
  onBounce?: () => void;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    angle: number,
    owner: Fighter,
    onSpark?: (x: number, y: number) => void,
    onBoom?: (x: number, y: number) => void,
    opts?: BulletOpts,
  ) {
    const b = BALANCE.gunner;
    this.scene = scene;
    this.owner = owner;
    this.speed = opts?.speed ?? b.bulletSpeed;
    this.dmg = opts?.dmg ?? b.bulletDmg;
    this.travelMax = opts?.travelMax ?? b.bulletLifeDist;
    this.falloffDist = opts?.falloffDist ?? 0;
    this.falloffMul = opts?.falloffMul ?? 1;
    this.onSpark = onSpark;
    this.onBoom = onBoom;
    this.onBounce = opts?.onBounce;
    this.vx = Math.cos(angle);
    this.vy = Math.sin(angle);
    this.homingTarget = opts?.homingTarget ?? null;
    this.passWalls = opts?.passWalls ?? false;
    this.lifeTimer = opts?.life ?? 0;
    this.countsCharge = opts?.countsCharge ?? true;
    this.pierce = opts?.pierce ?? false;
    this.vanishOnWall = opts?.vanishOnWall ?? false;
    this.dmgResolve = opts?.dmgResolve;
    this.forceCrit = opts?.forceCrit ?? false;
    this.forceCritMul = opts?.forceCritMul ?? 1.5;
    // 体积缩小 20%（贴图与判定半径同步）
    this.radius = opts?.radius ?? 6 * b.bulletRadiusMul;
    const tex = opts?.texture ?? 'tex-bullet';
    this.sprite = scene.add.sprite(x, y, tex).setDepth(12);
    this.sprite.setScale((opts?.scale ?? 3.2) * b.bulletScaleMul);
    this.sprite.setAngle(angle * Phaser.Math.RAD_TO_DEG);
    // 外发光层：让弹道在混战中一眼可见
    this.glow = scene.add.sprite(x, y, tex)
      .setDepth(11).setScale((opts?.scale ?? 3.2) * 1.9 * b.bulletScaleMul).setAlpha(0.32)
      .setTint(opts?.glowTint ?? 0xffe27a)
      .setBlendMode(Phaser.BlendModes.ADD);
    // 追踪弹用黄红色发光以示区别
    if (this.homingTarget) this.glow.setTint(0xff8a3c);
  }

  explode() {
    if (this.dead) return;
    this.dead = true;
    this.onBoom?.(this.sprite.x, this.sprite.y);
    this.sprite.destroy();
    this.glow.destroy();
  }

  /** 被旋风吸入：转速为敌人的 2 倍，绕统一轨道旋转 */
  absorb(storm: Storm) {
    if (this.dead || this.orbit) return;
    const ang = Math.atan2(this.sprite.y - storm.y, this.sprite.x - storm.x);
    this.orbit = { storm, angle: ang, radius: storm.orbitR };
    this.sprite.setPosition(
      storm.x + Math.cos(ang) * storm.orbitR,
      storm.y + Math.sin(ang) * storm.orbitR,
    );
    this.glow.setPosition(this.sprite.x, this.sprite.y);
  }

  /** 旋风结束时消散（不触发爆炸特效） */
  vanish() {
    if (this.dead) return;
    this.dead = true;
    this.sprite.destroy();
    this.glow.destroy();
  }

  /** 子步进移动：高速下防穿墙；返回 true 表示已销毁 */
  update(
    dt: number, rects: Phaser.Geom.Rectangle[], fighters: Fighter[], blockers?: BulletBlocker[],
  ): boolean {
    if (this.dead) return true;
    if (this.orbit) {
      this.updateOrbit(dt);
      return false;
    }
    // 追踪弹寿命倒计时
    if (this.lifeTimer > 0) {
      this.lifeTimer -= dt;
      if (this.lifeTimer <= 0) {
        this.vanish();
        return true;
      }
    }

    // 追踪弹：每帧朝目标转向；目标死亡则立刻消失
    if (this.homingTarget) {
      if (!this.homingTarget.alive) {
        this.vanish();
        return true;
      }
      const dx = this.homingTarget.x - this.sprite.x;
      const dy = this.homingTarget.y - this.sprite.y;
      const dlen = Math.hypot(dx, dy) || 1;
      const desX = dx / dlen;
      const desY = dy / dlen;
      const curA = Math.atan2(this.vy, this.vx);
      const desA = Math.atan2(desY, desX);
      let diff = desA - curA;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const turn = 9 * dt; // 追踪转向速率 rad/s
      const newA = curA + clamp(diff, -turn, turn);
      this.vx = Math.cos(newA);
      this.vy = Math.sin(newA);
      this.sprite.setAngle(newA * Phaser.Math.RAD_TO_DEG);
    }

    const stepDist = this.speed * this.fieldSlowMul * dt;
    this.traveled += stepDist;
    const steps = Math.max(1, Math.ceil(stepDist / 5));
    const s = stepDist / steps;

    for (let i = 0; i < steps; i++) {
      const px = this.sprite.x + this.vx * s;
      const py = this.sprite.y + this.vy * s;

      // v0.33：持盾雄兵阻挡经过自身的子弹
      if (blockers) {
        for (const bl of blockers) {
          if (dist(px, py, bl.x, bl.y) <= this.radius + bl.r) {
            this.sprite.setPosition(px, py);
            this.explode();
            return true;
          }
        }
      }

      // 命中敌人
      for (const f of fighters) {
        if (!f.alive || f === this.owner) continue;
        if (this.pierce && this.hitSet.has(f)) continue;
        if (dist(px, py, f.x, f.y) < this.radius + f.hitR) {
          // v0.17：远距离衰减（战争机器能量弹飞行 500px 后伤害减半）
          const baseDmg = this.falloffDist > 0 && this.traveled > this.falloffDist
            ? this.dmg * this.falloffMul
            : this.dmg;
          const dmgNow = this.dmgResolve ? this.dmgResolve(f) : baseDmg;
          f.takeDamage(dmgNow, {
            dirX: this.vx, dirY: this.vy, source: this.owner,
            forceCrit: this.forceCrit,
            forceCritMul: this.forceCrit ? this.forceCritMul : undefined,
          });
          if (this.countsCharge && this.owner.charId === CHAR.GUNNER) {
            this.owner.addCharge(1);
          }
          // v0.17：战争机器过载充能——左键子弹造成的伤害等量转为充能（超负荷芯片翻倍）
          if (this.owner.charId === CHAR.WAR) {
            this.owner.addWarChargeFromDamage(dmgNow);
          }
          // 弹幕风暴期间的追踪弹造成伤害的 30% 治疗自身
          if (this.owner.charId === CHAR.GUNNER && this.owner.skillActive) {
            this.owner.heal(Math.round(this.dmg * BALANCE.gunner.skillLifesteal));
          }
          if (this.pierce) {
            // 剑气穿透：只结算一次，继续飞行
            this.hitSet.add(f);
            this.onSpark?.(px, py);
            continue;
          }
          this.explode();
          return true;
        }
      }

      // 撞墙：剑气类直接消散，其余无限反弹（追踪弹穿墙则跳过墙体碰撞）
      if (!this.passWalls) {
        let bounced = false;
        for (const r of rects) {
          const col = circleRectCollision(px, py, this.radius, r);
          if (col) {
            if (this.vanishOnWall) {
              this.sprite.setPosition(px, py);
              this.explode();
              return true;
            }
            this.sprite.setPosition(px + col.nx * (col.pen + 0.5), py + col.ny * (col.pen + 0.5));
            const [rvx, rvy] = reflect(this.vx, this.vy, col.nx, col.ny);
            this.vx = rvx;
            this.vy = rvy;
            this.bounces++;
            const b = BALANCE.gunner;
            this.speed = Math.min(this.speed + b.bounceSpeedAdd, b.bulletSpeed + b.bounceSpeedCap);
            this.dmg = Math.min(this.dmg + b.bounceDmgAdd, b.bulletDmg + b.bounceDmgMax);
            this.sprite.setAngle(Math.atan2(this.vy, this.vx) * Phaser.Math.RAD_TO_DEG);
            this.onSpark?.(this.sprite.x, this.sprite.y);
            this.onBounce?.();
            bounced = true;
            break;
          }
        }
        if (!bounced) {
          this.sprite.setPosition(px, py);
        }
      } else {
        this.sprite.setPosition(px, py);
      }
    }

    if (this.traveled >= this.travelMax && this.lifeTimer <= 0) {
      this.explode();
      return true;
    }
    this.glow.setPosition(this.sprite.x, this.sprite.y);
    return false;
  }

  /** 旋风轨道：以 2 倍转速绕圈，仅作视觉，不再命中敌人 */
  private updateOrbit(dt: number) {
    const o = this.orbit!;
    const b = BALANCE.wind;
    o.angle += o.storm.spinDir * (b.orbitAngular * b.bulletSpinMul) * dt;
    const x = o.storm.x + Math.cos(o.angle) * o.radius;
    const y = o.storm.y + Math.sin(o.angle) * o.radius;
    this.sprite.setPosition(x, y);
    this.sprite.setAngle(this.sprite.angle + o.storm.spinDir * 720 * dt);
    this.glow.setPosition(x, y);
  }
}