import Phaser from 'phaser';
import { BALANCE } from '../config';
import { circleRectCollision, lerp } from '../core/util';
import { Fighter } from './Fighter';
import type { Storm } from './Storm';

/** 风之女皇的狂风：蓄力后发射，命中击退，撞墙消失；进入旋风后会被吸入旋转 */
export class Gust {
  scene: Phaser.Scene;
  sprite: Phaser.GameObjects.Sprite;
  owner: Fighter;
  vx: number;
  vy: number;
  speed: number;
  dmg: number;
  knock: number;
  travelMax: number;
  traveled = 0;
  dead = false;
  radius = 6;
  /** 蓄力程度 0..1（1 表示满蓄） */
  power: number;
  /** 右键积攒的狂风（与左键瞬发狂风做视觉区分，满蓄命中旋风可引爆） */
  charged: boolean;
  /** 蓄力越满，狂风横向越宽（1.0 → gustWidthMax）；右键再 × gustWidthRight */
  widthScale: number;

  /** 被旋风吸入后的轨道状态 */
  orbit: { storm: Storm; angle: number; radius: number } | null = null;

  onPuff?: (x: number, y: number) => void;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    angle: number,
    power: number, // 0..1 蓄力程度
    owner: Fighter,
    onPuff?: (x: number, y: number) => void,
    opts?: { charged?: boolean; widthMul?: number },
  ) {
    const b = BALANCE.wind;
    this.scene = scene;
    this.owner = owner;
    this.onPuff = onPuff;
    this.power = power;
    this.charged = opts?.charged ?? false;
    this.dmg = Math.round(lerp(b.gustDmgMin, b.gustDmgMax, power));
    this.speed = lerp(b.gustSpeedMin, b.gustSpeedMax, power);
    this.knock = lerp(b.knockMin, b.knockMax, power);
    this.travelMax = lerp(b.gustRangeMin, b.gustRangeMax, power);
    this.widthScale = lerp(1, b.gustWidthMax, power) * (opts?.widthMul ?? 1);
    this.vx = Math.cos(angle);
    this.vy = Math.sin(angle);
    // 右键积攒的狂风使用带金色描边的专用贴图，与左键瞬发狂风明显区分
    this.sprite = scene.add.sprite(x, y, this.charged ? 'tex-gust-charged' : 'tex-gust').setDepth(11);
    this.sprite.setScale(3.4 * this.widthScale, this.charged ? 3.2 : 2.8);
    this.sprite.setAngle(angle * Phaser.Math.RAD_TO_DEG + 90);
    this.sprite.setAlpha(0.95);
  }

  destroyPuff() {
    if (this.dead) return;
    this.dead = true;
    this.onPuff?.(this.sprite.x, this.sprite.y);
    this.sprite.destroy();
  }

  /** 被旋风吸入：与子弹一样绕统一轨道旋转（2 倍敌人转速） */
  absorb(storm: Storm) {
    if (this.dead || this.orbit) return;
    const ang = Math.atan2(this.sprite.y - storm.y, this.sprite.x - storm.x);
    this.orbit = { storm, angle: ang, radius: storm.orbitR };
    this.sprite.setPosition(
      storm.x + Math.cos(ang) * storm.orbitR,
      storm.y + Math.sin(ang) * storm.orbitR,
    );
  }

  update(dt: number, rects: Phaser.Geom.Rectangle[], fighters: Fighter[]): boolean {
    if (this.dead) return true;
    if (this.orbit) {
      this.updateOrbit(dt);
      return false;
    }
    const stepDist = this.speed * dt;
    this.traveled += stepDist;
    const steps = Math.max(1, Math.ceil(stepDist / 6));
    const s = stepDist / steps;

    for (let i = 0; i < steps; i++) {
      const px = this.sprite.x + this.vx * s;
      const py = this.sprite.y + this.vy * s;

      // 撞墙消失
      for (const r of rects) {
        if (circleRectCollision(px, py, this.radius, r)) {
          this.destroyPuff();
          return true;
        }
      }

      // 命中敌人：击退（横向判定随蓄力宽度放大）
      for (const f of fighters) {
        if (!f.alive || f === this.owner) continue;
        const dx = f.x - px;
        const dy = f.y - py;
        const along = dx * this.vx + dy * this.vy;
        const perp = Math.abs(-dx * this.vy + dy * this.vx);
        const hitLong = this.radius + f.hitR;
        const hitHalfW = hitLong * this.widthScale;
        if (Math.abs(along) < hitLong && perp < hitHalfW) {
          f.takeDamage(this.dmg, { dirX: this.vx, dirY: this.vy, source: this.owner });
          f.applyKnock(this.vx * this.knock, this.vy * this.knock);
          this.destroyPuff();
          return true;
        }
      }
      this.sprite.setPosition(px, py);
    }

    if (this.traveled >= this.travelMax) {
      this.destroyPuff();
      return true;
    }
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
  }
}