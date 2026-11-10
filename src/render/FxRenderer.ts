import Phaser from 'phaser';
import { BALANCE } from '../config';
import { FONT_BODY, FONT_MONO } from '../core/text';
import { BODY_R, Fighter } from '../entities/Fighter';
import { Soldier } from '../entities/Soldier';
import { CHAR_COLOR } from './charColor';
import type { CameraRig } from './CameraRig';

/**
 * 纯表现层特效：只创建/驱动 Phaser 显示对象，不结算伤害、不读写战斗状态。
 * 需要伤害的 missileBoom / reflectMissileBoom 仍留在 GameScene。
 */
export class FxRenderer {
  constructor(private scene: Phaser.Scene, private camera: CameraRig) {}

  pix(x: number, y: number, color: number, scale = 4, life = 300, alpha = 0.9) {
    const s = this.scene.add.image(x, y, 'tex-pixel').setTint(color).setDepth(15).setScale(scale / 2).setAlpha(alpha);
    this.scene.tweens.add({
      targets: s,
      x: x + Phaser.Math.Between(-14, 14),
      y: y + Phaser.Math.Between(-14, 14),
      alpha: 0,
      scale: 0.5,
      duration: life,
      onComplete: () => s.destroy(),
    });
  }

  spark(x: number, y: number, color: number, n: number) {
    for (let i = 0; i < n; i++) this.pix(x, y, color, 3, 220);
  }

  boom(x: number, y: number) {
    for (let i = 0; i < 10; i++) this.pix(x, y, i % 2 ? 0xf2c94c : 0xffb84d, 3, 320);
    this.spark(x, y, 0xffffff, 3);
  }

  puff(x: number, y: number) {
    for (let i = 0; i < 8; i++) this.pix(x, y, 0x8be8f2, 3, 300);
  }

  missileTrail(x: number, y: number) {
    this.pix(x, y, 0xffb06a, 3, 340, 0.55);
  }

  /** 主轰炸爆炸：冲击波 + 火球 + 烈焰粒子喷发 + 烟尘上涌（v0.15 增强） */
  bigBoomFx(x: number, y: number) {
    const half = BALANCE.bomber.strikeHalf;
    // 冲击波三环
    const c1 = this.scene.add.circle(x, y, half * 0.4, 0xff6a2a, 0.95).setDepth(16);
    const c2 = this.scene.add.circle(x, y, half * 0.26, 0xffe27a, 1).setDepth(16);
    const c3 = this.scene.add.circle(x, y, half * 0.12, 0xffffff, 1).setDepth(16);
    this.scene.tweens.add({
      targets: c1, radius: half * 1.7, alpha: 0, duration: 620, ease: 'CubicOut',
      onComplete: () => c1.destroy(),
    });
    this.scene.tweens.add({ targets: c2, radius: half * 1.1, alpha: 0, duration: 430, onComplete: () => c2.destroy() });
    this.scene.tweens.add({ targets: c3, radius: half * 0.7, alpha: 0, duration: 300, onComplete: () => c3.destroy() });
    // 地面爆闪
    const flash = this.scene.add.rectangle(x, y, half * 1.7, half * 1.7, 0xfff3d6, 0.35).setDepth(15);
    this.scene.tweens.add({ targets: flash, alpha: 0, scale: 1.25, duration: 240, onComplete: () => flash.destroy() });
    // 烈焰粒子：橙/红/金向外喷发
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const r0 = 8 + Math.random() * half * 0.5;
      const s = this.scene.add.image(x + Math.cos(a) * r0, y + Math.sin(a) * r0, 'tex-pixel')
        .setTint(i % 3 === 0 ? 0xffe27a : i % 3 === 1 ? 0xff8a3c : 0xe0702a)
        .setDepth(17).setScale(2 + Math.random() * 2).setAlpha(0.95);
      const r1 = half * (0.5 + Math.random() * 0.9);
      this.scene.tweens.add({
        targets: s,
        x: x + Math.cos(a) * r1,
        y: y + Math.sin(a) * r1 - Math.random() * 30,
        alpha: 0,
        scale: 0.4,
        duration: 420 + Math.random() * 300,
        onComplete: () => s.destroy(),
      });
    }
    // 烟尘：灰褐团块向上翻滚扩散
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const r0 = 6 + Math.random() * half * 0.4;
      const sm = this.scene.add.image(x + Math.cos(a) * r0, y + Math.sin(a) * r0, 'tex-pixel')
        .setTint(i % 2 ? 0x6b5b4a : 0x54493c)
        .setDepth(15).setScale(3 + Math.random() * 3).setAlpha(0.55);
      this.scene.tweens.add({
        targets: sm,
        x: sm.x + (Math.random() - 0.5) * 110,
        y: sm.y - 45 - Math.random() * 70,
        alpha: 0,
        scale: 6 + Math.random() * 4,
        duration: 900 + Math.random() * 500,
        onComplete: () => sm.destroy(),
      });
    }
    this.spark(x, y, 0xffffff, 14);
  }

  miniBoomFx(x: number, y: number) {
    const half = BALANCE.bomber.miniHalf;
    const c1 = this.scene.add.circle(x, y, half * 0.5, 0xffb84d, 0.9).setDepth(16);
    const c2 = this.scene.add.circle(x, y, half * 0.22, 0xfff3a6, 0.95).setDepth(16);
    this.scene.tweens.add({ targets: c1, radius: half * 1.3, alpha: 0, duration: 340, onComplete: () => c1.destroy() });
    this.scene.tweens.add({ targets: c2, radius: half * 0.7, alpha: 0, duration: 240, onComplete: () => c2.destroy() });
    for (let i = 0; i < 14; i++) {
      const px = x + (Math.random() - 0.5) * half * 1.6;
      const py = y + (Math.random() - 0.5) * half * 1.6;
      this.pix(px, py, i % 2 ? 0xff8a3c : 0xffe27a, 4, 420);
    }
  }

  muzzleFx(self: Fighter, angle: number, recoil = true) {
    const mx = self.x + Math.cos(angle) * (BODY_R + 20);
    const my = self.y + Math.sin(angle) * (BODY_R + 20);
    this.spark(mx, my, 0xffe27a, 4);
    if (!recoil) return;
    // 后坐力缩放：先清理旧补间并复位，避免高频射击叠加补间导致角色越缩越小
    const base = (self.sprite.getData('baseScale') as number) || self.sprite.scaleX;
    this.scene.tweens.killTweensOf(self.sprite);
    self.sprite.setScale(base);
    this.scene.tweens.add({
      targets: self.sprite, scaleX: base * 0.92, scaleY: base * 0.92,
      duration: 50, yoyo: true,
      onComplete: () => self.sprite.setScale(base),
    });
  }

  barrageFx(x: number, y: number) {
    const R = BALANCE.gunner.skillRadius;
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2;
      const r0 = 16 + Math.random() * 40;
      const s = this.scene.add.image(x + Math.cos(a) * r0, y + Math.sin(a) * r0, 'tex-bullet')
        .setDepth(16).setScale(2.2).setAlpha(0.95);
      this.scene.tweens.add({
        targets: s,
        x: s.x + Math.cos(a) * (R * 0.75),
        y: s.y + Math.sin(a) * (R * 0.75),
        alpha: 0,
        duration: 300,
        onComplete: () => s.destroy(),
      });
    }
    const ring = this.scene.add.circle(x, y, R * 0.82, 0xffd34d, 0.1).setDepth(10);
    this.scene.tweens.add({
      targets: ring, radius: R, alpha: 0, duration: 300,
      onComplete: () => ring.destroy(),
    });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.4;
      this.pix(x + Math.cos(a) * R * (0.92 + Math.random() * 0.08),
        y + Math.sin(a) * R * (0.92 + Math.random() * 0.08), 0xfff3a6, 6, 340);
    }
  }

  burstFx(x: number, y: number) {
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const s = this.scene.add.image(x + Math.cos(a) * 20, y + Math.sin(a) * 20, 'tex-bullet')
        .setDepth(16).setScale(1.8);
      this.scene.tweens.add({
        targets: s,
        x: x + Math.cos(a) * (70 + Math.random() * 30),
        y: y + Math.sin(a) * (70 + Math.random() * 30),
        alpha: 0,
        duration: 380,
        onComplete: () => s.destroy(),
      });
    }
    this.spark(x, y, 0xffffff, 8);
  }

  dashFx(self: Fighter, angle: number) {
    for (let i = 0; i < 8; i++) {
      const s = this.scene.add.image(self.x, self.y, 'tex-dash').setDepth(14).setAlpha(0.8);
      s.rotation = angle;
      this.scene.tweens.add({
        targets: s,
        x: self.x - Math.cos(angle) * (14 + i * 9),
        y: self.y - Math.sin(angle) * (14 + i * 9),
        alpha: 0,
        duration: 260,
        onComplete: () => s.destroy(),
      });
    }
  }

  dmgText(x: number, y: number, v: number, color: number, crit = false) {
    const t = this.scene.add.text(x, y, crit ? `${v}!` : String(v), {
      fontFamily: FONT_MONO,
      fontSize: crit ? '21px' : '15px',
      fontStyle: 'bold',
      color: crit ? '#ffb347' : '#' + color.toString(16).padStart(6, '0'),
    }).setDepth(895).setOrigin(0.5).setStroke('#0d1120', crit ? 4 : 3);
    if (crit) {
      t.setScale(1.25);
      this.scene.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.Out' });
    }
    this.scene.tweens.add({
      targets: t, y: y - (crit ? 30 : 22), alpha: 0, duration: crit ? 760 : 650,
      onComplete: () => t.destroy(),
    });
  }

  healFx(f: Fighter, amount: number) {
    const t = this.scene.add.text(f.x + 14, f.y - 44, '+' + amount, {
      fontFamily: FONT_MONO,
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#7ef0a8',
    }).setDepth(896).setOrigin(0.5).setStroke('#0d1120', 3);
    this.scene.tweens.add({
      targets: t, y: t.y - 18, alpha: 0, duration: 520, onComplete: () => t.destroy(),
    });
    for (let i = 0; i < 3; i++) this.pix(f.x, f.y, 0x7ef0a8, 3, 380);
  }

  spawnRing(x: number, y: number, color: number) {
    const ring = this.scene.add.circle(x, y, 20, color, 0.5).setDepth(5);
    this.scene.tweens.add({
      targets: ring, radius: 60, alpha: 0, duration: 500, onComplete: () => ring.destroy(),
    });
  }

  castRingFx(x: number, y: number) {
    const ring = this.scene.add.circle(x, y, 10, 0xff9d4d, 0.7).setDepth(14);
    const ring2 = this.scene.add.circle(x, y, 4, 0xffffff, 0.9).setDepth(14);
    this.scene.tweens.add({ targets: ring, radius: 120, alpha: 0, duration: 380, onComplete: () => ring.destroy() });
    this.scene.tweens.add({ targets: ring2, radius: 80, alpha: 0, duration: 300, onComplete: () => ring2.destroy() });
    this.spark(x, y, 0x8be8f2, 6);
  }

  /** v0.16：风球目标点的落点提示（青色小圈，区别于旋风成型特效） */
  orbMarkFx(x: number, y: number) {
    const ring = this.scene.add.circle(x, y, 14, 0x7fd8ff, 0.65).setDepth(13);
    const dot = this.scene.add.circle(x, y, 5, 0xeaf6ff, 0.9).setDepth(13);
    this.scene.tweens.add({ targets: ring, radius: 26, alpha: 0.25, duration: 500, yoyo: true, onComplete: () => ring.destroy() });
    this.scene.tweens.add({ targets: dot, scale: 0.7, alpha: 0, duration: 700, onComplete: () => dot.destroy() });
  }

  /** v0.16：风球被敌方旋风吸入时的打散特效 */
  orbAbsorbFx(x: number, y: number) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.5;
      this.pix(x + Math.cos(a) * 10, y + Math.sin(a) * 10, i % 2 ? 0x7fd8ff : 0xeaf6ff, 3, 260);
    }
  }

  /* ---------- 奥术特效 ---------- */

  ascendStartFx(f: Fighter) {
    const ring = this.scene.add.circle(f.x, f.y, 24, 0x9b5cff, 0.55).setDepth(14);
    this.scene.tweens.add({ targets: ring, radius: 84, alpha: 0, duration: 420, onComplete: () => ring.destroy() });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      this.pix(f.x + Math.cos(a) * 30, f.y + Math.sin(a) * 30, 0xd9c2ff, 4, 480);
    }
  }

  /** 蓄力完成：能量波从自身扩散（v0.15 增强：多重冲击环 + 放射粒子喷发 + 强震屏体现威慑） */
  descendFx(f: Fighter) {
    for (let ring = 0; ring < 3; ring++) {
      const r = this.scene.add.circle(f.x, f.y, 26 + ring * 14, 0xffffff, 0.9 - ring * 0.25).setDepth(16);
      this.scene.tweens.add({
        targets: r, radius: 140 + ring * 70, alpha: 0, duration: 420 + ring * 120, ease: 'CubicOut',
        onComplete: () => r.destroy(),
      });
    }
    const core = this.scene.add.circle(f.x, f.y, 26, 0xffffff, 1).setDepth(16);
    this.scene.tweens.add({ targets: core, radius: 110, alpha: 0, duration: 360, onComplete: () => core.destroy() });
    // 放射状能量粒子喷发
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const s = this.scene.add.image(f.x, f.y, 'tex-pixel')
        .setTint(i % 2 ? 0xd9c2ff : 0x9b5cff)
        .setDepth(17).setScale(2.2).setAlpha(0.95);
      const rr = 140 + Math.random() * 130;
      this.scene.tweens.add({
        targets: s,
        x: f.x + Math.cos(a) * rr,
        y: f.y + Math.sin(a) * rr,
        alpha: 0, scale: 0.3,
        duration: 480,
        onComplete: () => s.destroy(),
      });
    }
    this.spark(f.x, f.y, 0xd9c2ff, 18);
    if (f.isPlayer) this.scene.cameras.main.flash(420, 240, 210, 255);
    this.camera.shake(0.03, 640); // 高伤害威慑（幅度已在 shake() 内全局减弱）
  }

  rejectFx(x: number, y: number, pull: boolean, radius: number) {
    const color = pull ? 0xb48aff : 0x9b5cff;
    const ring = this.scene.add.circle(x, y, radius * 0.6, color, 0.55).setDepth(16);
    this.scene.tweens.add({
      targets: ring, radius: radius * 1.5, alpha: 0, duration: 300, ease: 'CubicOut',
      onComplete: () => ring.destroy(),
    });
    const core = this.scene.add.circle(x, y, 10, 0xffffff, 0.7).setDepth(16);
    this.scene.tweens.add({ targets: core, radius: 30, alpha: 0, duration: 220, onComplete: () => core.destroy() });
    for (let i = 0; i < 8; i++) this.pix(x, y, color, 4, 340);
  }

  deathFx(f: Fighter) {
    const color = CHAR_COLOR[f.charId];
    for (let i = 0; i < 20; i++) {
      this.pix(f.x, f.y, color, 4, 600);
    }
    this.spark(f.x, f.y, 0xffffff, 10);
    this.camera.shake(0.012, 300);
  }

  /* ---------- 帝君表现层 ---------- */

  spawnRingFx(x: number, y: number) {
    const ring = this.scene.add.circle(x, y, 16, 0xf0c23a, 0.7).setDepth(8);
    this.scene.tweens.add({
      targets: ring, radius: 46, alpha: 0, duration: 420, ease: 'CubicOut',
      onComplete: () => ring.destroy(),
    });
  }

  soldierPuffFx(x: number, y: number) {
    const puff = this.scene.add.circle(x, y, 14, 0xff9d4d, 0.6).setDepth(8);
    this.scene.tweens.add({
      targets: puff, radius: 0, alpha: 0, duration: 300,
      onComplete: () => puff.destroy(),
    });
  }

  chargeMarkFx(x: number, y: number) {
    const ring = this.scene.add.circle(x, y, 20, 0xffd75e, 0.5).setDepth(8);
    this.scene.tweens.add({
      targets: ring, radius: 54, alpha: 0, duration: 380,
      onComplete: () => ring.destroy(),
    });
  }

  chargeBadFx(x: number, y: number) {
    const bad = this.scene.add.circle(x, y, 18, 0xff4d4d, 0.45).setDepth(8);
    this.scene.tweens.add({
      targets: bad, radius: 34, alpha: 0, duration: 300,
      onComplete: () => bad.destroy(),
    });
  }

  dominateRingFx(f: Fighter) {
    const ring = this.scene.add.circle(f.x, f.y, 30, 0xf0c23a, 0.6).setDepth(17);
    this.scene.tweens.add({
      targets: ring, radius: 240, alpha: 0, duration: 620, ease: 'CubicOut',
      onComplete: () => ring.destroy(),
    });
  }

  soldierRingFx(s: Soldier) {
    const r2 = this.scene.add.circle(s.x, s.y, 10, 0xffd75e, 0.55).setDepth(17);
    this.scene.tweens.add({
      targets: r2, radius: 120, alpha: 0, duration: 520,
      onComplete: () => r2.destroy(),
    });
  }

  /** 神罚：金色天光 + 长矛自头顶落下，命中处炸开光环（每名被统治者一份） */
  punishFx(t: Fighter, delay: number) {
    this.scene.time.delayedCall(delay * 1000, () => {
      const x = t.x;
      const y = t.y;
      // 地面印记：金色法阵先亮起
      const rune = this.scene.add.circle(x, y, 20, 0x000000, 0).setDepth(17)
        .setStrokeStyle(2, 0xffd75e, 0.9);
      this.scene.tweens.add({
        targets: rune, radius: 52, alpha: 0, duration: 420, delay: 120,
        onComplete: () => rune.destroy(),
      });
      // 天光柱：从屏幕上方垂下的金色光幕
      const beam = this.scene.add.rectangle(x, y - 170, 30, 340, 0xffe9a6, 0.28).setDepth(18);
      beam.setAlpha(0);
      this.scene.tweens.add({
        targets: beam, alpha: 0.9, duration: 100, yoyo: true, hold: 90,
        onComplete: () => beam.destroy(),
      });
      // 神罚之矛：由上方高速落下（贴图朝右，旋转 90° 指向下方）
      const spear = this.scene.add.image(x, y - 320, 'tex-spear')
        .setOrigin(0.12, 0.5).setScale(6).setAngle(90).setDepth(19).setAlpha(0.95);
      this.scene.tweens.add({
        targets: spear,
        y: y - 110,
        duration: 210,
        ease: 'Quad.easeIn',
        onComplete: () => {
          spear.destroy();
          const flash = this.scene.add.circle(x, y, 30, 0xfff3c4, 0.9).setDepth(19);
          this.scene.tweens.add({
            targets: flash, radius: 70, alpha: 0, duration: 260,
            onComplete: () => flash.destroy(),
          });
        },
      });
    });
  }

  /** 箭雨落点预警 + 箭矢下坠动画（伤害由技能模块在延迟后结算） */
  arrowRainFx(x: number, y: number) {
    const e = BALANCE.emperor;
    const mark = this.scene.add.circle(x, y, e.p1RainRadius, 0xf0c23a, 0.1)
      .setDepth(16).setStrokeStyle(1, 0xffd75e, 0.55);
    this.scene.time.delayedCall(e.p1RainDelay * 1000, () => mark.destroy());
    // 箭雨视觉：多支箭从上方落下
    for (let i = 0; i < 8; i++) {
      const ox = Phaser.Math.Between(-70, 70);
      const oy = Phaser.Math.Between(-70, 70);
      const arrow = this.scene.add.image(x + ox, y - 300, 'tex-arrow')
        .setAngle(90).setScale(2).setDepth(19).setAlpha(0.95);
      this.scene.tweens.add({
        targets: arrow,
        y: y + oy,
        duration: 260,
        delay: Phaser.Math.Between(0, 120),
        ease: 'Quad.easeIn',
        onComplete: () => arrow.destroy(),
      });
    }
  }

  arrowRainBurstFx(x: number, y: number) {
    const e = BALANCE.emperor;
    const burst = this.scene.add.circle(x, y, e.p1RainRadius * 0.4, 0xffe9a6, 0.75).setDepth(18);
    this.scene.tweens.add({
      targets: burst, radius: e.p1RainRadius, alpha: 0, duration: 320,
      onComplete: () => burst.destroy(),
    });
  }

  /** 砸地冲击环 + 地面裂痕 */
  smashFx(x: number, y: number) {
    const e = BALANCE.emperor;
    const ring = this.scene.add.circle(x, y, 30, 0xffd75e, 0.45).setDepth(18);
    this.scene.tweens.add({
      targets: ring, radius: e.p3SmashRadius, alpha: 0, duration: 380, ease: 'CubicOut',
      onComplete: () => ring.destroy(),
    });
    // 地面裂痕
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.3;
      const r0 = 24;
      const r1 = e.p3SmashRadius * (0.55 + Math.random() * 0.45);
      const line = this.scene.add.line(0, 0, 0, 0, Math.cos(a) * r1, Math.sin(a) * r1, 0xf0c23a, 0.5)
        .setOrigin(0, 0).setDepth(17).setLineWidth(2);
      line.setPosition(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
      this.scene.tweens.add({ targets: line, alpha: 0, duration: 420, onComplete: () => line.destroy() });
    }
  }

  shieldChargeFx(f: Fighter) {
    const ring = this.scene.add.circle(f.x, f.y, 20, 0xffd75e, 0.5).setDepth(8);
    this.scene.tweens.add({
      targets: ring, radius: 90, alpha: 0, duration: 420,
      onComplete: () => ring.destroy(),
    });
  }

  /** 奥术跃迁目标处的明显图案提示（持续到传送完成） */
  arcaneJumpMarkerFx(x: number, y: number, dur: number) {
    const g = this.scene.add.graphics().setDepth(15);
    const draw = () => {
      g.clear();
      const t = this.scene.time.now * 0.006;
      g.lineStyle(3, 0xc9a6ff, 0.9);
      g.strokeCircle(x, y, 30 + Math.sin(t * 3) * 4);
      g.lineStyle(2, 0xffffff, 0.7);
      for (let i = 0; i < 6; i++) {
        const a = t + (i / 6) * Math.PI * 2;
        g.lineBetween(
          x + Math.cos(a) * 14, y + Math.sin(a) * 14,
          x + Math.cos(a) * 26, y + Math.sin(a) * 26,
        );
      }
      g.fillStyle(0x9b5cff, 0.25).fillCircle(x, y, 12);
    };
    const ev = this.scene.time.addEvent({ delay: 16, loop: true, callback: draw });
    this.scene.time.delayedCall(dur * 1000, () => { ev.remove(); g.destroy(); });
  }

  arcaneJumpTeleportFx(fromX: number, fromY: number, toX: number, toY: number) {
    for (let i = 0; i < 10; i++) {
      this.pix(fromX + (Math.random() - 0.5) * 30, fromY + (Math.random() - 0.5) * 30, 0xc9a6ff, 4, 380);
      this.pix(toX + (Math.random() - 0.5) * 30, toY + (Math.random() - 0.5) * 30, 0xd9c2ff, 4, 380);
    }
    this.spark(toX, toY, 0xffffff, 8);
  }

  /** v0.16：轰炸预警期间，导弹从天而降并加速下坠，与爆炸时刻同步落地 */
  strikeMissileFx(x: number, y: number, delay?: number) {
    const b = BALANCE.bomber;
    // 最后狂欢：更长的预警时间与更高的坠落起点
    const total = delay ?? b.strikeDelay;
    const startY = y - (delay ? 900 : 560);
    const missile = this.scene.add.image(x, startY, 'tex-missile').setScale(3.4).setDepth(19).setAngle(180);
    const shadow = this.scene.add.ellipse(x, y, 28, 10, 0x000000, 0.4).setDepth(4);
    const dur = Math.max(200, (total - 0.06) * 1000);
    // 尾焰粒子
    const flameTimer = this.scene.time.addEvent({
      delay: 50,
      repeat: Math.floor(dur / 50),
      callback: () => {
        if (!missile.active) return;
        this.pix(
          missile.x + (Math.random() - 0.5) * 8,
          missile.y + 24,
          Math.random() < 0.5 ? 0xfff3a6 : 0xff9d4d,
          3, 220, 0.85,
        );
      },
    });
    this.scene.tweens.add({
      targets: missile,
      y,
      duration: dur,
      ease: 'QuadraticIn', // 下坠加速
      onComplete: () => {
        missile.destroy();
        shadow.destroy();
        this.scene.time.removeEvent(flameTimer);
      },
    });
    this.scene.tweens.add({ targets: shadow, scaleX: 2.0, scaleY: 1.5, duration: dur });
  }

  /** 最后狂欢：延迟期间跟随目标的锁定预警（落地前 0.2s 消失） */
  finalWarnFx(target: Fighter, delay: number) {
    const ring = this.scene.add.circle(target.x, target.y, 30, 0xff3b30, 0.14).setDepth(6);
    ring.setStrokeStyle(2, 0xff6a5a, 0.9);
    const pulse = this.scene.tweens.add({
      targets: ring, scale: 1.18, duration: 380, yoyo: true, repeat: -1,
    });
    const start = this.scene.time.now;
    const keep = Math.max(0.2, delay - 0.2) * 1000;
    const follow = this.scene.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        const done = !ring.active || !target.alive || this.scene.time.now - start >= keep;
        if (done) {
          follow.remove(false);
          pulse.remove();
          if (ring.active) ring.destroy();
          return;
        }
        ring.setPosition(target.x, target.y);
      },
    });
  }

  /** 最后狂欢：黑色超级导弹从目标左上方斜向极速突入（0.2s 落地） */
  finalMissileFx(x: number, y: number) {
    const sx = x - 300;
    const sy = y - 300;
    const ang = Math.atan2(y - sy, x - sx);
    // tex-missile 默认朝上，旋转后让弹头对准来袭方向
    const m = this.scene.add.image(sx, sy, 'tex-missile')
      .setScale(5).setDepth(30).setTint(0x24262b).setRotation(ang + Math.PI / 2);
    // 黑色尾烟 + 少量余烬
    const trail = this.scene.time.addEvent({
      delay: 18,
      repeat: 11,
      callback: () => {
        if (!m.active) return;
        const puff = this.scene.add.image(m.x, m.y, 'tex-pixel')
          .setTint(0x191b20).setDepth(29).setScale(1.4 + Math.random()).setAlpha(0.6);
        this.scene.tweens.add({
          targets: puff, alpha: 0, scale: 3.6, duration: 280, onComplete: () => puff.destroy(),
        });
        if (Math.random() < 0.45) this.pix(m.x, m.y, 0xffb347, 2, 180, 0.9);
      },
    });
    const shadow = this.scene.add.ellipse(x, y, 24, 9, 0x000000, 0.45).setDepth(4);
    this.scene.tweens.add({
      targets: shadow, scaleX: 3.2, scaleY: 2, duration: 200, onComplete: () => shadow.destroy(),
    });
    this.scene.tweens.add({
      targets: m,
      x, y,
      duration: 200,
      ease: 'CubicIn',
      onComplete: () => {
        m.destroy();
        this.scene.time.removeEvent(trail);
      },
    });
  }

  /** 最后狂欢：非圆形爆炸，改为向上翻涌的蘑菇云（强调单体超高伤害） */
  mushroomBoomFx(x: number, y: number) {
    // 地面横向爆闪（压扁的椭圆，避免读成普通圆形爆炸）
    const flash = this.scene.add.ellipse(x, y, 160, 44, 0xfff1c4, 0.9).setDepth(18);
    this.scene.tweens.add({
      targets: flash, scaleX: 2.4, scaleY: 0.5, alpha: 0,
      duration: 260, onComplete: () => flash.destroy(),
    });
    // 火柱：竖直上冲并被拉长
    for (let i = 0; i < 16; i++) {
      const col = this.scene.add.image(x + (Math.random() - 0.5) * 28, y - Math.random() * 18, 'tex-pixel')
        .setTint(i % 3 === 0 ? 0xfff3a6 : i % 3 === 1 ? 0xff9d3c : 0xff5b22)
        .setDepth(19).setScale(2.2 + Math.random() * 1.8).setAlpha(0.95);
      const h = 150 + Math.random() * 130;
      this.scene.tweens.add({
        targets: col,
        x: x + (Math.random() - 0.5) * 44,
        y: y - h,
        scaleX: 0.6,
        scaleY: 2.4,
        alpha: 0,
        duration: 540 + Math.random() * 280,
        ease: 'CubicOut',
        onComplete: () => col.destroy(),
      });
    }
    // 蘑菇云顶：灰白 / 褐烟团向两侧翻卷上升
    for (let i = 0; i < 24; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      const cap = this.scene.add.image(
        x + dir * (16 + Math.random() * 36), y - 170 - Math.random() * 70, 'tex-pixel',
      )
        .setTint(i % 3 === 0 ? 0xd9cbb8 : i % 3 === 1 ? 0x8a7a68 : 0x5d5248)
        .setDepth(18).setScale(3 + Math.random() * 3).setAlpha(0.85);
      this.scene.tweens.add({
        targets: cap,
        x: x + dir * (95 + Math.random() * 110),
        y: cap.y - 45 - Math.random() * 55,
        scaleX: 5 + Math.random() * 3,
        scaleY: 4 + Math.random() * 3,
        alpha: 0,
        duration: 920 + Math.random() * 480,
        ease: 'CubicOut',
        onComplete: () => cap.destroy(),
      });
    }
    // 上升的余烬
    for (let i = 0; i < 22; i++) {
      const s = this.scene.add.image(x + (Math.random() - 0.5) * 60, y + Math.random() * 20, 'tex-pixel')
        .setTint(i % 2 ? 0xffb347 : 0xff6a2a).setDepth(20)
        .setScale(0.9 + Math.random() * 1.4).setAlpha(0.95);
      this.scene.tweens.add({
        targets: s,
        x: s.x + (Math.random() - 0.5) * 90,
        y: s.y - 130 - Math.random() * 150,
        alpha: 0,
        scale: 0.3,
        duration: 620 + Math.random() * 420,
        onComplete: () => s.destroy(),
      });
    }
  }

  parryFx(f: Fighter, gained: number) {
    if (gained <= 0) return;
    const ring = this.scene.add.circle(f.x, f.y, 26, 0x9fd8ff, 0.6).setDepth(16);
    this.scene.tweens.add({
      targets: ring, radius: 54, alpha: 0, duration: 260, onComplete: () => ring.destroy(),
    });
    this.spark(f.x, f.y, 0xffffff, gained + 2);
    if (f.isPlayer && gained >= 4) this.camera.shake(0.003, 100);
  }

  swordWaveFx(f: Fighter, angle: number) {
    for (let i = 0; i < 5; i++) {
      const s = this.scene.add.image(f.x + Math.cos(angle) * 20, f.y + Math.sin(angle) * 20, 'tex-swordwave')
        .setDepth(14).setScale(3).setRotation(angle).setAlpha(0.7);
      this.scene.tweens.add({
        targets: s,
        x: s.x + Math.cos(angle) * (24 + i * 14),
        y: s.y + Math.sin(angle) * (24 + i * 14),
        alpha: 0, scale: 2, duration: 200, onComplete: () => s.destroy(),
      });
    }
  }

  waltzEnterFx(f: Fighter) {
    const ring = this.scene.add.circle(f.x, f.y, 30, 0xd9f0ff, 0.75).setDepth(16);
    this.scene.tweens.add({
      targets: ring, radius: 110, alpha: 0, duration: 420, ease: 'CubicOut',
      onComplete: () => ring.destroy(),
    });
    const core = this.scene.add.circle(f.x, f.y, 12, 0xffffff, 0.9).setDepth(16);
    this.scene.tweens.add({
      targets: core, radius: 60, alpha: 0, duration: 300, onComplete: () => core.destroy(),
    });
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      this.pix(f.x + Math.cos(a) * 26, f.y + Math.sin(a) * 26, 0xd9f0ff, 4, 460);
    }
    if (f.isPlayer) this.scene.cameras.main.flash(150, 200, 235, 255);
  }

  waltzEndFx(f: Fighter) {
    const ring = this.scene.add.circle(f.x, f.y, 40, 0x9fd8ff, 0.5).setDepth(16);
    this.scene.tweens.add({
      targets: ring, radius: 90, alpha: 0, duration: 320, onComplete: () => ring.destroy(),
    });
    for (let i = 0; i < 8; i++) this.pix(f.x, f.y, 0xd9f0ff, 3, 360);
  }

  waltzTrailFx(f: Fighter, angle: number) {
    const s = this.scene.add.image(f.x, f.y, 'tex-swordwave').setDepth(17)
      .setScale(4).setRotation(angle).setAlpha(0.9);
    this.scene.tweens.add({
      targets: s, alpha: 0, scaleX: 1.4, duration: 200, onComplete: () => s.destroy(),
    });
  }

  waltzStepFx(x: number, y: number, dx: number, dy: number) {
    if (Math.random() < 0.4) {
      const a = Math.atan2(dy, dx);
      const s = this.scene.add.image(x - Math.cos(a) * 18, y - Math.sin(a) * 18, 'tex-swordwave')
        .setDepth(15).setScale(3.2).setRotation(a).setAlpha(0.5);
      this.scene.tweens.add({
        targets: s, alpha: 0, scaleX: 1.5, duration: 170, onComplete: () => s.destroy(),
      });
    }
    this.pix(x, y, 0xd9f0ff, 3, 220, 0.8);
  }

  waltzHitFx(x: number, y: number, dx: number, dy: number) {
    const a = Math.atan2(dy, dx);
    for (let i = 0; i < 9; i++) {
      const s = this.scene.add.image(x, y, 'tex-swordwave').setDepth(17)
        .setScale(4).setRotation(a + (Math.random() - 0.5) * 0.9).setAlpha(0.9);
      this.scene.tweens.add({
        targets: s,
        x: x + Math.cos(a) * (28 + i * 12),
        y: y + Math.sin(a) * (28 + i * 12),
        alpha: 0, scale: 1.6, duration: 260, onComplete: () => s.destroy(),
      });
    }
    this.spark(x, y, 0xffffff, 9);
  }

  waltzRelocateFx(x0: number, y0: number, x1: number, y1: number) {
    const line = this.scene.add.graphics().setDepth(17);
    line.lineStyle(3, 0xd9f0ff, 0.9);
    line.lineBetween(x0, y0, x1, y1);
    this.scene.tweens.add({
      targets: line, alpha: 0, duration: 260, onComplete: () => line.destroy(),
    });
    for (let i = 0; i < 10; i++) {
      const t = i / 10;
      this.pix(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0xd9f0ff, 4, 320);
    }
    this.spark(x1, y1, 0xffffff, 8);
  }

  fuseBoomFx(x: number, y: number) {
    const R = BALANCE.bomber.fuseBlastR;
    const ring = this.scene.add.circle(x, y, R * 0.3, 0xff4d4d, 0.7).setDepth(16);
    this.scene.tweens.add({
      targets: ring, scale: 3.2, alpha: 0, duration: 420, ease: 'CubicOut',
      onComplete: () => ring.destroy(),
    });
    const core = this.scene.add.circle(x, y, 20, 0xfff3a6, 0.95).setDepth(16);
    this.scene.tweens.add({
      targets: core, scale: 3.4, alpha: 0, duration: 320, onComplete: () => core.destroy(),
    });
    const tag = this.scene.add.text(x, y - 52, '引线爆破！', {
      fontFamily: FONT_BODY, fontSize: '19px', fontStyle: 'bold', color: '#ffb37a',
    }).setDepth(1700).setOrigin(0.5).setStroke('#5a1a05', 5).setScale(0.6);
    this.scene.tweens.add({
      targets: tag, scale: 1.15, y: y - 70, duration: 260, ease: 'BackOut',
      onComplete: () => this.scene.tweens.add({
        targets: tag, alpha: 0, duration: 380, delay: 180, onComplete: () => tag.destroy(),
      }),
    });
    for (let i = 0; i < 22; i++) this.pix(x, y, i % 2 ? 0xff8a3c : 0xffe27a, 5, 560);
    this.camera.shake(0.018, 340);
  }
}
