import Phaser from 'phaser';
import { BALANCE } from '../config';
import { Fighter } from './Fighter';

/**
 * 奥术登神的能量波：
 * - 以施法者为中心向外扩散的环形波，速度 600px/s；
 * - 伤害 = min(2000, round(100000 / 距离))，反比例衰减，500px 处约 200；
 * - 碰到墙体时，只有对应角度的波front消失，其余方向继续扩散；
 * - 对同一目标只结算一次。
 */
export class ArcaneWave {
  private scene: Phaser.Scene;
  owner: Fighter;
  x: number;
  y: number;
  r = 0;
  prevR = 0;
  speed = BALANCE.arcane.waveSpeed;
  dead = false;

  private segCount = 360;
  private active: boolean[] = [];
  private blockR: number[] = []; // 该扇区被墙体挡住的距离（未挡住为 Infinity）
  private hitSet = new Set<Fighter>();
  private g: Phaser.GameObjects.Graphics;
  /** PVE：不再暴击，改为暴击率 ×0.5 + 暴击伤害 ×0.25 的固定增伤 */
  private convertCrit: boolean;

  constructor(
    scene: Phaser.Scene, x: number, y: number, owner: Fighter, convertCrit = false,
  ) {
    this.scene = scene;
    this.owner = owner;
    this.convertCrit = convertCrit;
    this.x = x;
    this.y = y;
    for (let i = 0; i < this.segCount; i++) {
      this.active.push(true);
      this.blockR.push(Infinity);
    }
    this.g = scene.add.graphics().setDepth(14).setBlendMode(Phaser.BlendModes.ADD);
  }

  private segIndex(angle: number): number {
    let a = angle;
    while (a < 0) a += Math.PI * 2;
    while (a >= Math.PI * 2) a -= Math.PI * 2;
    return Math.floor((a / (Math.PI * 2)) * this.segCount) % this.segCount;
  }

  /** @returns true 表示能量波已结束 */
  update(
    dt: number,
    walls: Phaser.Geom.Rectangle[],
    fighters: Fighter[],
  ): boolean {
    if (this.dead) return true;
    const b = BALANCE.arcane;
    this.prevR = this.r;
    this.r += this.speed * dt;

    // 1) 扇区推进：碰到墙体的扇区就地消失
    for (let i = 0; i < this.segCount; i++) {
      if (!this.active[i]) continue;
      const a = ((i + 0.5) / this.segCount) * Math.PI * 2;
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      for (let d = Math.max(this.prevR, 0); d <= this.r; d += 6) {
        const px = this.x + nx * d;
        const py = this.y + ny * d;
        let blocked = false;
        for (const r of walls) {
          if (px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) {
            blocked = true;
            break;
          }
        }
        if (blocked) {
          this.active[i] = false;
          this.blockR[i] = d;
          break;
        }
      }
    }

    // 2) 伤害：波前扫过目标时结算一次（被墙截断的方向不再伤害）
    const empty = this.active.every((v) => !v);
    if (!empty) {
      for (const f of fighters) {
        if (!f.alive || f === this.owner || this.hitSet.has(f)) continue;
        const dx = f.x - this.x;
        const dy = f.y - this.y;
        const d = Math.hypot(dx, dy);
        if (d > this.r || d <= this.prevR) continue;
        const idx = this.segIndex(Math.atan2(dy, dx));
        if (this.blockR[idx] < d) continue; // 该方向被墙体挡在更近处
        this.hitSet.add(f);
        // 反比例衰减：dmg = min(基础伤害, round(K / 距离))；500px 处约 200
        let dmg: number;
        if (this.convertCrit) {
          // PVE：伤害 -30%，但不再受距离衰减；暴击属性转为固定增伤
          const src = this.owner;
          const cc = src.critChance + (src.arcaneBuffT > 0 ? 0.5 : 0);
          const cd = src.critDmgMul + (src.arcaneBuffT > 0 ? 0.5 : 0);
          dmg = Math.round(b.waveDmg0 * 0.7 * (1 + cc * 0.5 + cd * 0.25));
        } else {
          dmg = Math.min(b.waveDmg0, Math.round(b.waveK / Math.max(1, d)));
        }
        if (dmg > 0) f.takeDamage(dmg, {
          source: this.owner, dirX: dx / (d || 1), dirY: dy / (d || 1),
          noCrit: this.convertCrit,
        });
      }
    }

    this.draw();

    if (empty || this.r >= b.waveMaxRadius) {
      this.destroy();
      return true;
    }
    return false;
  }

  private draw() {
    const g = this.g;
    g.clear();
    if (this.dead) return;
    // 波前颜色随距离由亮紫渐变为淡紫
    const fade = Math.max(0.25, 1 - this.r / BALANCE.arcane.waveMaxRadius);

    const pts: { x: number; y: number; on: boolean }[] = [];
    for (let i = 0; i < this.segCount; i++) {
      const a = ((i + 0.5) / this.segCount) * Math.PI * 2;
      const rr = this.active[i] ? this.r : this.blockR[i];
      if (!Number.isFinite(rr)) {
        pts.push({ x: 0, y: 0, on: false });
      } else {
        pts.push({ x: this.x + Math.cos(a) * rr, y: this.y + Math.sin(a) * rr, on: this.active[i] });
      }
    }

    // 三层波前：外层紫色晕光 / 中层亮紫 / 内层炽白芯（v0.15 增强亮度与宽度）
    g.lineStyle(11, 0x9b5cff, 0.45 * fade);
    for (let i = 0; i < this.segCount; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % this.segCount];
      if (a.on && b.on) g.lineBetween(a.x, a.y, b.x, b.y);
    }
    g.lineStyle(5, 0xb48aff, 0.85 * fade);
    for (let i = 0; i < this.segCount; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % this.segCount];
      if (a.on && b.on) g.lineBetween(a.x, a.y, b.x, b.y);
    }
    // 内层炽白芯
    g.lineStyle(2.5, 0xffffff, 1.0 * fade);
    for (let i = 0; i < this.segCount; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % this.segCount];
      if (a.on && b.on) g.lineBetween(a.x, a.y, b.x, b.y);
    }
    // 波前能量粒子：随机沿波前迸发（v0.15 新增）
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const idx = Math.floor((a / (Math.PI * 2)) * this.segCount) % this.segCount;
      if (!this.active[idx]) continue;
      const px = this.x + Math.cos(a) * this.r + (Math.random() - 0.5) * 16;
      const py = this.y + Math.sin(a) * this.r + (Math.random() - 0.5) * 16;
      const s = this.scene.add.image(px, py, 'tex-pixel')
        .setTint(Math.random() < 0.5 ? 0xffffff : 0xb48aff)
        .setDepth(15).setScale(1.5 + Math.random() * 1.5).setAlpha(0.9);
      this.scene.tweens.add({
        targets: s, alpha: 0, scale: 0.2,
        duration: 260 + Math.random() * 200,
        onComplete: () => s.destroy(),
      });
    }
    // 中心余晖
    const core = Math.max(0, 90 - this.r * 0.22);
    if (core > 1) {
      g.fillStyle(0x9b5cff, 0.34 * fade).fillCircle(this.x, this.y, core);
      g.fillStyle(0xd9c2ff, 0.4 * fade).fillCircle(this.x, this.y, core * 0.6);
      g.fillStyle(0xffffff, 0.55 * fade).fillCircle(this.x, this.y, core * 0.3);
    }
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.g.destroy();
  }
}
