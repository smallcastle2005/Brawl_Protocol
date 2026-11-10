import Phaser from 'phaser';
import { BALANCE } from '../config';
import { circleRectCollision, dist } from '../core/util';
import { Fighter } from './Fighter';
import type { Storm } from './Storm';

export interface MissileOpts {
  /** 随机轨迹参数（每个导弹独立随机） */
  angle: number;
  speed0: number;
  speedMax: number;
  accel: number;
  wobbleFreq: number;
  wobbleAmp: number;
  phase: number;
}

/**
 * 轰炸专家的跟踪导弹：
 * - 起步很慢，逐渐加速；
 * - 随机正弦轨迹追踪目标；
 * - 撞墙 / 撞任意角色爆炸（直击伤害 + 溅射伤害）；
 * - 超时自毁（无伤害）。
 */
export class Missile {
  scene: Phaser.Scene;
  sprite: Phaser.GameObjects.Sprite;
  owner: Fighter;
  target: Fighter | null;

  x = 0;
  y = 0;
  dirX = 1;
  dirY = 0;
  speed: number;
  speedMax: number;
  accel: number;
  turnRate: number;
  wobbleFreq: number;
  wobbleAmp: number;
  phase: number;
  age = 0;
  life: number;
  dead = false;
  radius = 9; // 体积增大后同步放大的碰撞半径
  trailT = 0;

  /** 被旋风吸入后的轨道状态（导弹视为子弹，可被吸收） */
  orbit: { storm: Storm; angle: number; radius: number } | null = null;

  /** 导弹的直击伤害，作为被旋风吸收时的「子弹伤害」计入加成 */
  get dmg(): number { return BALANCE.bomber.missileDmg; }

  /** 目标死亡后仍飞向最后位置；低于此距离自爆（无伤害） */
  lastTX = 0;
  lastTY = 0;

  onBoom?: (x: number, y: number, dmg: boolean) => void;
  onTrail?: (x: number, y: number) => void;

  constructor(scene: Phaser.Scene, x: number, y: number, owner: Fighter, target: Fighter | null, opts: MissileOpts,
    onBoom?: (x: number, y: number, dmg: boolean) => void,
    onTrail?: (x: number, y: number) => void,
  ) {
    const b = BALANCE.bomber;
    this.scene = scene;
    this.owner = owner;
    this.target = target;
    this.onBoom = onBoom;
    this.onTrail = onTrail;

    this.x = x;
    this.y = y;
    this.dirX = Math.cos(opts.angle);
    this.dirY = Math.sin(opts.angle);
    this.speed = opts.speed0;
    this.speedMax = opts.speedMax;
    this.accel = opts.accel;
    this.turnRate = b.missileTurn;
    this.wobbleFreq = opts.wobbleFreq;
    this.wobbleAmp = opts.wobbleAmp;
    this.phase = opts.phase;
    this.life = b.missileLife;
    if (target) {
      this.lastTX = target.x;
      this.lastTY = target.y;
    } else {
      this.lastTX = x + this.dirX * 300;
      this.lastTY = y + this.dirY * 300;
    }

    this.sprite = scene.add.sprite(x, y, 'tex-missile').setDepth(12).setScale(1.8);
    this.sprite.setAngle(opts.angle * Phaser.Math.RAD_TO_DEG + 90);
  }

  explode(dmg: boolean) {
    if (this.dead) return;
    this.dead = true;
    this.onBoom?.(this.x, this.y, dmg);
    this.sprite.destroy();
  }

  /** 被旋风吸入：绕统一轨道旋转（不再追踪、不爆炸） */
  absorb(storm: Storm) {
    if (this.dead || this.orbit) return;
    const ang = Math.atan2(this.sprite.y - storm.y, this.sprite.x - storm.x);
    this.orbit = { storm, angle: ang, radius: storm.orbitR };
    this.sprite.setPosition(
      storm.x + Math.cos(ang) * storm.orbitR,
      storm.y + Math.sin(ang) * storm.orbitR,
    );
  }

  /** 旋风结束时消散（不爆炸、无伤害） */
  vanish() {
    if (this.dead) return;
    this.dead = true;
    this.sprite.destroy();
  }

  /** 子步进移动，返回 true 表示已销毁 */
  update(dt: number, rects: Phaser.Geom.Rectangle[], fighters: Fighter[]): boolean {
    if (this.dead) return true;
    if (this.orbit) {
      const o = this.orbit;
      const b = BALANCE.wind;
      o.angle += o.storm.spinDir * (b.orbitAngular * b.bulletSpinMul) * dt;
      const x = o.storm.x + Math.cos(o.angle) * o.radius;
      const y = o.storm.y + Math.sin(o.angle) * o.radius;
      this.sprite.setPosition(x, y);
      this.sprite.setAngle(this.sprite.angle + o.storm.spinDir * 720 * dt);
      return false;
    }
    const b = BALANCE.bomber;
    this.age += dt;
    this.life -= dt;
    if (this.life <= 0) {
      this.explode(false);
      return true;
    }

    // 目标追踪（目标存活则实时更新；死亡则飞向最后已知位置）
    let tx: number;
    let ty: number;
    if (this.target && this.target.alive) {
      tx = this.target.x;
      ty = this.target.y;
      this.lastTX = tx;
      this.lastTY = ty;
    } else {
      tx = this.lastTX;
      ty = this.lastTY;
    }

    // 逐渐加速
    this.speed = Math.min(this.speedMax, this.speed + this.accel * dt);

    // 期望方向 = 指向目标 + 垂直方向正弦随机摆动
    const ddx = tx - this.x;
    const ddy = ty - this.y;
    const dlen = Math.hypot(ddx, ddy) || 1;
    const baseX = ddx / dlen;
    const baseY = ddy / dlen;
    const wob = Math.sin(this.age * this.wobbleFreq + this.phase);
    let desX = baseX + -baseY * wob * this.wobbleAmp;
    let desY = baseY + baseX * wob * this.wobbleAmp;
    const desLen = Math.hypot(desX, desY) || 1;
    desX /= desLen;
    desY /= desLen;

    // 有限转向速率
    const curA = Math.atan2(this.dirY, this.dirX);
    const desA = Math.atan2(desY, desX);
    let diff = desA - curA;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const maxTurn = this.turnRate * dt;
    const newA = curA + Math.max(-maxTurn, Math.min(maxTurn, diff));
    this.dirX = Math.cos(newA);
    this.dirY = Math.sin(newA);

    // 子步进移动 + 碰撞
    const stepDist = this.speed * dt;
    const steps = Math.max(1, Math.ceil(stepDist / 6));
    const s = stepDist / steps;
    for (let i = 0; i < steps; i++) {
      const px = this.x + this.dirX * s;
      const py = this.y + this.dirY * s;

      // 撞墙爆炸
      for (const r of rects) {
        if (circleRectCollision(px, py, this.radius, r)) {
          this.explode(true);
          return true;
        }
      }

      // 撞角色爆炸（不含发射者）
      for (const f of fighters) {
        if (!f.alive || f === this.owner) continue;
        if (dist(px, py, f.x, f.y) < this.radius + f.hitR) {
          this.explode(true);
          return true;
        }
      }

      this.x = px;
      this.y = py;
    }
    this.sprite.setPosition(this.x, this.y);
    this.sprite.setAngle(Math.atan2(this.dirY, this.dirX) * Phaser.Math.RAD_TO_DEG + 90);

    // 尾迹
    this.trailT -= dt;
    if (this.trailT <= 0) {
      this.trailT = 0.055;
      this.onTrail?.(this.x, this.y);
    }

    // 目标早已死亡：飞抵最后位置附近即自毁
    if ((!this.target || !this.target.alive) && dist(this.x, this.y, this.lastTX, this.lastTY) < 14) {
      this.explode(false);
      return true;
    }
    return false;
  }
}