import Phaser from 'phaser';
import type { Fighter } from './Fighter';

/**
 * 风暴领域的前置风球（v0.16）：
 * - 施法后风球以 orbSpeed(600px/s) 飞向目标点，途中不生成旋风；
 * - 到达目标点后由 GameScene 生成风暴领域（给敌人博弈反应时间）；
 * - 风球可穿墙；可被敌方旋风吸入（视为子弹，旋风获得持续时间奖励）。
 */
export class WindOrb {
  scene: Phaser.Scene;
  sprite: Phaser.GameObjects.Sprite;
  glow: Phaser.GameObjects.Sprite;
  owner: Fighter;
  tx: number;
  ty: number;
  speed: number;
  dead = false;
  /** 出生位置（用于绘制飞行拖尾） */
  x0: number;
  y0: number;
  private spinT = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    tx: number,
    ty: number,
    speed: number,
    owner: Fighter,
  ) {
    this.scene = scene;
    this.owner = owner;
    this.tx = tx;
    this.ty = ty;
    this.speed = speed;
    this.x0 = x;
    this.y0 = y;
    this.sprite = scene.add.sprite(x, y, 'tex-gust-charged').setScale(2.4).setDepth(18);
    this.glow = scene.add.sprite(x, y, 'tex-gust-charged')
      .setScale(3.4).setAlpha(0.35).setTint(0x9fe4ff)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(17);
  }

  /** @returns true 表示已抵达终点（由 GameScene 生成旋风） */
  update(dt: number): boolean {
    if (this.dead) return true;
    const dx = this.tx - this.sprite.x;
    const dy = this.ty - this.sprite.y;
    const d = Math.hypot(dx, dy);
    const step = this.speed * dt;
    this.spinT += dt;
    if (d <= step + 2) {
      this.sprite.setPosition(this.tx, this.ty);
      this.dead = true;
      return true;
    }
    const nx = dx / d;
    const ny = dy / d;
    this.sprite.x += nx * step;
    this.sprite.y += ny * step;
    this.sprite.setAngle(this.sprite.angle + 520 * dt);
    this.glow.setPosition(this.sprite.x, this.sprite.y);
    this.glow.setAlpha(0.25 + 0.15 * Math.sin(this.spinT * 14));
    return false;
  }

  destroy() {
    this.dead = true;
    this.sprite.destroy();
    this.glow.destroy();
  }
}