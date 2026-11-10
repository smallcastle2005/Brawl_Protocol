import Phaser from 'phaser';
import { BALANCE, CHAR } from '../../../config';
import { clamp, dist } from '../../../core/util';
import { BODY_R, Fighter } from '../../../entities/Fighter';
import { Bullet } from '../../../entities/Bullet';
import { Gust } from '../../../entities/Gust';
import { Storm, StormReflectItem } from '../../../entities/Storm';
import { WindOrb } from '../../../entities/WindOrb';
import { Missile } from '../../../entities/Missile';
import type { GameEventBus } from '../../events';

/**
 * 风之女皇技能模块。
 *
 * 只负责战斗逻辑：蓄力、狂风生成、风暴掷出 / 落地 / 引爆与弹体反弹；
 * 音效与震屏通过事件总线交给表现层，专属粒子由场景回调提供。
 * 数值与判定条件与迁移前保持一致。
 */
export interface WindContext {
  scene: Phaser.Scene;
  gusts: Gust[];
  storms: Storm[];
  windOrbs: WindOrb[];
  bullets: Bullet[];
  missiles: Missile[];
  /** 全部单位（天降甘霖需要查找旋风内的友军） */
  fighters: Fighter[];
  events: GameEventBus;
  over: boolean;
  targetsFor(owner: Fighter): Fighter[];
  puff(x: number, y: number): void;
  orbMarkFx(x: number, y: number): void;
  orbAbsorbFx(x: number, y: number): void;
  castRingFx(x: number, y: number): void;
  pix(x: number, y: number, color: number, scale?: number, life?: number): void;
  reflectMissileBoom(x: number, y: number, dmg: boolean, owner: Fighter): void;
  missileTrail(x: number, y: number): void;
}

export function beginGustCharge(ctx: WindContext, self: Fighter): void {
  if (self.silenced) return;
  if (self.charId !== CHAR.WIND || !self.alive) return;
  if (self.beginCharge()) {
    // v0.14：放电音效
    if (self.isPlayer) ctx.events.emit('sfx:play', { name: 'gust_charge', volume: 0.7 });
  }
}

/** 左键瞬发狂风：从自身释放；旋风存在期间冷却减半 */
export function fireInstantGust(ctx: WindContext, self: Fighter): void {
  if (self.charId !== CHAR.WIND || !self.alive || ctx.over) return;
  if (self.atkCd > 0) return;
  const stormUp = ctx.storms.some((s) => s.owner === self && s.active);
  self.atkCd = BALANCE.wind.releaseCd * (stormUp ? 0.5 : 1);
  const mx = self.x + Math.cos(self.faceAngle) * (BODY_R + 18);
  const my = self.y + Math.sin(self.faceAngle) * (BODY_R + 18);
  const gust = new Gust(ctx.scene, mx, my, self.faceAngle, 0, self, ctx.puff);
  ctx.gusts.push(gust);
  if (self.isPlayer) ctx.events.emit('sfx:play', { name: 'gust', volume: 0.6 });
}

/** 右键：把积攒在当前位置的狂风朝鼠标发射（宽度 ×2，满蓄命中旋风可引爆） */
export function releaseGust(ctx: WindContext, self: Fighter, powerOverride?: number): void {
  if (self.silenced) return;
  if (self.charId !== CHAR.WIND || !self.alive) return;
  // 只有右键积攒中的狂风才能被发射
  if (!self.gustCharging) return;
  const power = powerOverride !== undefined
    ? clamp(powerOverride, 0, 1)
    : clamp(self.gustChargeT / BALANCE.wind.chargeMax, 0, 1);
  self.gustCharging = false;
  self.gustChargeT = 0;
  // v0.19：沿点按蓄力瞬间锁定的方向发射（之后鼠标转向不影响弹道）
  const aim = self.gustAimAngle;
  const mx = self.gustChargeX + Math.cos(aim) * (BODY_R + 18);
  const my = self.gustChargeY + Math.sin(aim) * (BODY_R + 18);
  const gust = new Gust(ctx.scene, mx, my, aim, power, self, ctx.puff, {
    charged: true,
    widthMul: BALANCE.wind.gustWidthRight,
  });
  ctx.gusts.push(gust);
  if (self.isPlayer) {
    ctx.events.emit('sfx:play', { name: 'gust', volume: 0.5 + power * 0.4 });
  }
  if (power > 0.6 && self.isPlayer) {
    ctx.events.emit('fx:shake', { intensity: 0.004, duration: 150 });
  }
}

export function castStorm(ctx: WindContext, self: Fighter, x: number, y: number): void {
  if (self.silenced) return;
  if (self.charId !== CHAR.WIND || self.skillCd > 0 || !self.alive) return;
  if (self.stunTimer > 0) return;
  const castR = BALANCE.wind.castRange;
  let dx = x - self.x;
  let dy = y - self.y;
  const d = Math.hypot(dx, dy);
  if (d > castR) {
    dx = (dx / d) * castR;
    dy = (dy / d) * castR;
    x = self.x + dx;
    y = self.y + dy;
  }
  self.skillCd = BALANCE.wind.skillCd;
  // v0.16：先投掷风球飞向目标点，抵达后再形成旋风（给敌人博弈反应时间）
  ctx.windOrbs.push(new WindOrb(ctx.scene, self.x, self.y, x, y, BALANCE.wind.orbSpeed, self));
  if (self.isPlayer) ctx.events.emit('sfx:play', { name: 'storm_cast', volume: 0.9 });
  ctx.orbMarkFx(x, y);
}

/** 风球每帧推进：被敌方旋风吸入则消散并奖励持续时间；抵达目标后形成旋风 */
export function updateWindOrbs(ctx: WindContext, dt: number): void {
  for (const orb of [...ctx.windOrbs]) {
    // 被其他角色的旋风吸入（视为子弹，可穿墙但可被卷走）
    let absorbed = false;
    for (const s of ctx.storms) {
      if (!s.active || s.owner === orb.owner) continue;
      if (dist(orb.sprite.x, orb.sprite.y, s.x, s.y) <= s.r) {
        s.gainDurBonus();
        ctx.orbAbsorbFx(orb.sprite.x, orb.sprite.y);
        orb.destroy();
        absorbed = true;
        break;
      }
    }
    if (absorbed) continue;
    if (orb.update(dt)) {
      // 抵达目标：形成旋风
      ctx.storms.push(new Storm(ctx.scene, orb.tx, orb.ty, orb.owner,
        (st, dmgList) => onStormDetonate(ctx, st, dmgList)));
      ctx.events.emit('sfx:play', { name: 'storm_cast', volume: 0.9 });
      ctx.castRingFx(orb.tx, orb.ty);
      if (orb.owner.isPlayer) ctx.events.emit('fx:shake', { intensity: 0.006, duration: 220 });
      orb.destroy();
    }
  }
  // 原地清理（保持与场景共享的数组引用一致）
  for (let i = ctx.windOrbs.length - 1; i >= 0; i--) {
    if (ctx.windOrbs[i].dead) ctx.windOrbs.splice(i, 1);
  }
}

/** 旋风被满蓄狂风引爆：范围爆炸 + 把吸收的弹体按原类型、原数量朝随机方向反弹 */
export function onStormDetonate(ctx: WindContext, storm: Storm, items: StormReflectItem[]): void {
  const R = storm.r;

  // 天降甘霖：引爆旋风时为仍处于旋风中的友军回复「旋风剩余伤害」等量生命，并给予瞬时加速
  if (storm.owner.windEquipUnlocked && storm.lastBoomDmg > 0) {
    const heal = Math.round(storm.lastBoomDmg);
    for (const f of ctx.fighters) {
      if (!f.alive) continue;
      const ally = f === storm.owner || (f.teamBattle && f.team === storm.owner.team);
      if (!ally) continue;
      if (dist(f.x, f.y, storm.x, storm.y) > R) continue;
      f.heal(heal);
      f.windRushT = 1;
      ctx.pix(f.x, f.y - BODY_R, 0x8ff0b0, 1.6, 520);
      ctx.pix(f.x, f.y - BODY_R - 6, 0xd9fff0, 1.2, 420);
      // 天降甘霖：友军头顶升起绿色治疗光环
      const halo = ctx.scene.add.circle(f.x, f.y - BODY_R, 11, 0x8ff0b0, 0.35)
        .setStrokeStyle(2, 0xd9fff0, 0.9).setDepth(18);
      ctx.scene.tweens.add({
        targets: halo, y: f.y - BODY_R - 30, scale: 2.1, alpha: 0,
        duration: 620, ease: 'CubicOut', onComplete: () => halo.destroy(),
      });
    }

    // 天降甘霖：整片旋风范围降下绿色甘霖 + 治疗波纹
    const healRing = ctx.scene.add.circle(storm.x, storm.y, R * 0.2, 0x000000, 0)
      .setStrokeStyle(3, 0x8ff0b0, 0.9).setDepth(17);
    ctx.scene.tweens.add({
      targets: healRing, radius: R * 1.05, alpha: 0, duration: 720, ease: 'CubicOut',
      onComplete: () => healRing.destroy(),
    });
    const healGlow = ctx.scene.add.circle(storm.x, storm.y, R, 0x36c98b, 0.2).setDepth(16);
    ctx.scene.tweens.add({
      targets: healGlow, alpha: 0, duration: 720, onComplete: () => healGlow.destroy(),
    });
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * R;
      const drop = ctx.scene.add.rectangle(
        storm.x + Math.cos(a) * rr, storm.y + Math.sin(a) * rr - 130 - Math.random() * 70,
        2, 12, i % 3 === 0 ? 0xd9fff0 : 0x8ff0b0, 0.9,
      ).setDepth(18);
      ctx.scene.tweens.add({
        targets: drop, y: storm.y + Math.sin(a) * rr, alpha: 0,
        duration: 320 + Math.random() * 240, delay: Math.random() * 220,
        ease: 'QuadIn', onComplete: () => drop.destroy(),
      });
    }
  }

  const c1 = ctx.scene.add.circle(storm.x, storm.y, R * 0.55, 0xffe27a, 0.85).setDepth(17);
  const c2 = ctx.scene.add.circle(storm.x, storm.y, R * 0.3, 0xffffff, 0.95).setDepth(17);
  ctx.scene.tweens.add({
    targets: c1, radius: R * 1.15, alpha: 0, duration: 420, ease: 'CubicOut',
    onComplete: () => c1.destroy(),
  });
  ctx.scene.tweens.add({
    targets: c2, radius: R * 0.7, alpha: 0, duration: 300, onComplete: () => c2.destroy(),
  });
  for (let i = 0; i < 34; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = R * (0.4 + Math.random() * 0.7);
    ctx.pix(storm.x + Math.cos(a) * rr, storm.y + Math.sin(a) * rr,
      i % 3 === 0 ? 0xfff3a6 : i % 3 === 1 ? 0x59d3e3 : 0xffffff, 5, 520);
  }
  ctx.events.emit('fx:shake', { intensity: 0.02, duration: 380 });
  ctx.events.emit('sfx:play', { name: 'detonate', volume: 0.9 });
  // 反弹：吸入什么就反弹什么（子弹→子弹、狂风→狂风、导弹→导弹），击杀归属风之女皇
  const bb = BALANCE.bomber;
  for (const item of items) {
    const a = Math.random() * Math.PI * 2;
    if (item.kind === 'bullet') {
      const b = new Bullet(
        ctx.scene, storm.x, storm.y, a, storm.owner,
        (px, py) => ctx.events.emit('fx:spark', { x: px, y: py, color: 0xffe27a, count: 3 }),
        (px, py) => ctx.events.emit('fx:boom', { x: px, y: py }),
        { dmg: item.dmg, speed: 760, life: 2.2, countsCharge: false },
      );
      ctx.bullets.push(b);
    } else if (item.kind === 'gust') {
      const g = new Gust(ctx.scene, storm.x, storm.y, a, item.power ?? 0.5, storm.owner, ctx.puff);
      ctx.gusts.push(g);
    } else {
      // 导弹：重新锁定一名存活敌人（无敌人则直线飞）
      const foes = ctx.targetsFor(storm.owner).filter((f) => f.alive);
      const target = foes.length > 0 ? foes[Math.floor(Math.random() * foes.length)] : null;
      const m = new Missile(
        ctx.scene, storm.x, storm.y, storm.owner, target,
        {
          angle: a,
          speed0: bb.missileSpeed0,
          speedMax: bb.missileSpeedMax,
          accel: bb.missileAccel,
          wobbleFreq: 2.5 + Math.random() * 3,
          wobbleAmp: 0.18 + Math.random() * 0.22,
          phase: Math.random() * Math.PI * 2,
        },
        (x, y, dmg) => ctx.reflectMissileBoom(x, y, dmg, storm.owner),
        (x, y) => ctx.missileTrail(x, y),
      );
      ctx.missiles.push(m);
    }
    ctx.events.emit('fx:spark', {
      x: storm.x + Math.cos(a) * 18,
      y: storm.y + Math.sin(a) * 18,
      color: 0xfff3a6,
      count: 3,
    });
  }
}
