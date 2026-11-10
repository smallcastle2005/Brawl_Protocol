import Phaser from 'phaser';
import { BALANCE, CHAR } from '../../../config';
import { dist, nearestFreePoint, rayWallDistance } from '../../../core/util';
import { BODY_R, Fighter } from '../../../entities/Fighter';
import { ArcaneWave } from '../../../entities/ArcaneWave';
import type { GameEventBus } from '../../events';

/** 奥术排斥 / 奥术抓取：鼠标落点预警后结算 */
export interface RepulseZone {
  x: number; y: number; remain: number; total: number;
  owner: Fighter; pull: boolean; radius: number;
}

/** 终极法典 · 奥术轰击：能量球（0.2s 后朝施放方向射出紫色激光） */
export interface ArcaneOrb {
  x: number; y: number;
  /** 放置瞬间锁定的鼠标方向 */
  ang: number;
  /** 起爆延迟 */
  delay: number;
  /** 激光剩余时间 */
  t: number;
  tickT: number;
  owner: Fighter;
  fired: boolean;
  /** 激光终点（被墙体截断） */
  ex: number; ey: number;
  dead: boolean;
}

/**
 * 奥术天选者技能模块。
 *
 * 只负责战斗逻辑：奥术排斥落点、蓄力跃迁、奥术登神蓄力与结算；
 * 专属光影由表现层回调提供，音效 / 震屏走事件总线。
 * 数值与判定条件与迁移前保持一致。
 */
export interface ArcaneContext {
  scene: Phaser.Scene;
  fighters: Fighter[];
  repulses: RepulseZone[];
  waves: ArcaneWave[];
  /** 奥术轰击能量球 */
  orbs: ArcaneOrb[];
  /** 冒险模式：奥术登神不再暴击，暴击属性转为固定增伤 */
  pve: boolean;
  wallRects: Phaser.Geom.Rectangle[];
  prevPos: Map<Fighter, { x: number; y: number }>;
  events: GameEventBus;
  pix(x: number, y: number, color: number, scale?: number, life?: number): void;
  arcaneJumpMarkerFx(x: number, y: number, dur: number): void;
  arcaneJumpTeleportFx(fromX: number, fromY: number, toX: number, toY: number): void;
  ascendStartFx(f: Fighter): void;
  descendFx(f: Fighter): void;
  rejectFx(x: number, y: number, pull: boolean, radius: number): void;
}

/** 奥术排斥：0.4s 预警后在落点结算（蓄力期间不可用，改走奥术跃迁） */
export function castArcaneReject(ctx: ArcaneContext, self: Fighter, x: number, y: number): void {
  if (self.silenced) return;
  if (self.charId !== CHAR.ARCANE || !self.alive) return;
  if (self.atkCd > 0 || self.stunTimer > 0 || self.bombTargeting || self.arcaneCharging) return;
  const b = BALANCE.arcane;
  const range = b.rejectRange;
  const radius = b.rejectR;
  let dx = x - self.x;
  let dy = y - self.y;
  const d = Math.hypot(dx, dy);
  if (d > range) {
    x = self.x + (dx / d) * range;
    y = self.y + (dy / d) * range;
  }
  self.faceAngle = Math.atan2(y - self.y, x - self.x);
  self.atkCd = b.atkCD;
  if (self.isPlayer) ctx.events.emit('sfx:play', { name: 'reject', volume: 0.7 });
  ctx.repulses.push({ x, y, remain: b.rejectDelay, total: b.rejectDelay, owner: self, pull: false, radius });
}

/** 蓄力期左键：尝试奥术跃迁（前 jumpWindow 秒内可用一次） */
export function tryArcaneJump(ctx: ArcaneContext, self: Fighter, x: number, y: number): void {
  if (self.silenced) return;
  if (self.charId !== CHAR.ARCANE || !self.arcaneCharging || self.arcaneJumpUsed) return;
  const b = BALANCE.arcane;
  if (self.arcaneChargeT > b.jumpWindow) return;
  let dx = x - self.x;
  let dy = y - self.y;
  const d = Math.hypot(dx, dy);
  if (d > b.jumpRange) {
    x = self.x + (dx / d) * b.jumpRange;
    y = self.y + (dy / d) * b.jumpRange;
  }
  // v0.22：跃迁无视墙体阻挡；仅当目标点本身在墙内时，改判为最近的非墙体位置
  const p = nearestFreePoint(x, y, BODY_R, ctx.wallRects);
  self.arcaneJumpUsed = true;
  self.arcaneJumpT = b.jumpDelay;
  self.arcaneJumpX = p.x;
  self.arcaneJumpY = p.y;
  ctx.arcaneJumpMarkerFx(p.x, p.y, b.jumpDelay);
}

export function startArcaneAscend(ctx: ArcaneContext, self: Fighter): void {
  if (self.silenced) return;
  if (self.charId !== CHAR.ARCANE || !self.alive) return;
  if (self.arcaneCharging || self.skillCd > 0) return;
  if (self.stunTimer > 0 || self.bombTargeting) return;
  const b = BALANCE.arcane;
  stopArcaneBeam(self);
  self.arcaneCharging = true;
  self.arcaneChargeT = 0;
  self.arcaneJumpUsed = false;
  self.arcaneJumpT = 0;
  self.skillCd = b.skillCd;
  self.moveX = 0;
  self.moveY = 0;
  if (self.isPlayer) ctx.events.emit('sfx:play', { name: 'ascend', volume: 0.8 });
  ctx.ascendStartFx(self);
  if (self.isPlayer) ctx.events.emit('fx:shake', { intensity: 0.006, duration: 220 });
}

export function updateArcane(ctx: ArcaneContext, f: Fighter, dt: number): void {
  if (!f.arcaneCharging) return;
  const b = BALANCE.arcane;
  f.arcaneChargeT += dt;
  // 持续回复（总量 100）
  f.heal((b.chargeHeal / b.chargeDur) * dt);
  // 终极法典·蓄能：登神蓄力期间持续恢复能量（整段蓄力共恢复满 100）
  f.addArcaneEnergy((b.codexEnergyMax / b.chargeDur) * dt);
  if (Math.random() < dt * 14) {
    ctx.pix(f.x + (Math.random() - 0.5) * 40, f.y + (Math.random() - 0.5) * 40, 0xd9c2ff, 3, 360);
  }
  // 奥术跃迁倒计时
  if (f.arcaneJumpT > 0) {
    f.arcaneJumpT -= dt;
    if (f.arcaneJumpT <= 0) {
      f.arcaneJumpT = 0;
      const p = nearestFreePoint(f.arcaneJumpX, f.arcaneJumpY, BODY_R, ctx.wallRects);
      const tx = p.x;
      const ty = p.y;
      ctx.arcaneJumpTeleportFx(f.x, f.y, tx, ty);
      if (f.isPlayer) ctx.events.emit('sfx:play', { name: 'jump', volume: 0.8 });
      f.sprite.setPosition(tx, ty);
      const body = f.sprite.body as Phaser.Physics.Arcade.Body;
      body.reset(tx, ty);
      body.setVelocity(0, 0);
      // v0.22：传送是瞬移，同步上一帧位置，避免下一帧扫掠把传送当成穿墙而拉回墙边
      ctx.prevPos.set(f, { x: tx, y: ty });
    }
  }
  if (f.arcaneChargeT >= b.chargeDur) {
    f.arcaneCharging = false;
    f.arcaneChargeT = 0;
    f.arcaneJumpT = 0;
    ctx.waves.push(new ArcaneWave(ctx.scene, f.x, f.y, f, ctx.pve));
    ctx.events.emit('sfx:play', { name: 'wave', volume: 0.9 });
    ctx.descendFx(f);
  }
}

export function updateRepulses(ctx: ArcaneContext, dt: number): void {
  for (const r of [...ctx.repulses]) {
    r.remain -= dt;
    if (r.remain > 0) continue;
    // 原地清理（保持与场景共享的数组引用一致）
    const idx = ctx.repulses.indexOf(r);
    if (idx >= 0) ctx.repulses.splice(idx, 1);
    const b = BALANCE.arcane;
    const dmg = r.owner.attackDmg;
    let hitAny = false;
    for (const e of ctx.fighters) {
      if (!e.alive || e === r.owner) continue;
      if (dist(e.x, e.y, r.x, r.y) > r.radius + e.hitR) continue;
      e.takeDamage(dmg, { source: r.owner });
      // 终极法典·蓄能：左键命中敌人回复能量
      r.owner.addArcaneEnergy(b.codexHitGain);
      hitAny = true;
      if (!e.alive) continue;
      const ang = Math.atan2(e.y - r.owner.y, e.x - r.owner.x);
      e.applyKnock(Math.cos(ang) * b.rejectKnock, Math.sin(ang) * b.rejectKnock);
    }
    // 奥术排斥命中敌人 → 奥术登神冷却减少 2s
    if (hitAny) {
      r.owner.skillCd = Math.max(0, r.owner.skillCd - b.rejectSkillRefund);
    }
    ctx.rejectFx(r.x, r.y, false, r.radius);
  }
}

/* ================= 终极法典 · 奥术轰击（长按右键） ================= */

/** 开始引导奥术轰击；返回是否成功 */
export function startArcaneBeam(ctx: ArcaneContext, self: Fighter): boolean {
  if (!self.arcaneEquipUnlocked || !self.alive || self.silenced) return false;
  if (self.arcaneCharging || self.bombTargeting) return false;
  if (self.arcaneEnergy <= 0) return false;
  if (self.arcaneBeamHeld) return true;
  self.arcaneBeamHeld = true;
  self.arcaneOrbAcc = 0;
  if (self.isPlayer) ctx.events.emit('sfx:play', { name: 'gust_charge', volume: 0.5 });
  return true;
}

/** 停止引导（松开右键 / 能量耗尽 / 死亡） */
export function stopArcaneBeam(self: Fighter): void {
  self.arcaneBeamHeld = false;
  self.arcaneOrbAcc = 0;
}

/**
 * 每帧推进奥术轰击：持续消耗能量（4s 消耗 100），
 * 每消耗 10 点能量在自身周围放置一颗能量球，方向锁定为放置时的鼠标方向。
 */
export function updateArcaneBeam(
  ctx: ArcaneContext, self: Fighter, dt: number, px: number, py: number,
): void {
  if (!self.arcaneBeamHeld) return;
  if (!self.alive || !self.arcaneEquipUnlocked || self.arcaneCharging) {
    stopArcaneBeam(self);
    return;
  }
  const b = BALANCE.arcane;
  const spent = self.spendArcaneEnergy(b.orbDrainPerSec * dt);
  if (spent <= 0) {
    stopArcaneBeam(self);
    return;
  }
  self.arcaneOrbAcc += spent;
  while (self.arcaneOrbAcc >= b.orbCostEach) {
    self.arcaneOrbAcc -= b.orbCostEach;
    const a = Math.random() * Math.PI * 2;
    const rr = 24 + Math.random() * 26;
    const p = nearestFreePoint(
      self.x + Math.cos(a) * rr, self.y + Math.sin(a) * rr, 12, ctx.wallRects,
    );
    ctx.orbs.push({
      x: p.x, y: p.y,
      ang: Math.atan2(py - self.y, px - self.x),
      delay: b.orbDelay,
      t: b.orbLaserDur,
      tickT: b.orbLaserTick,
      owner: self,
      fired: false,
      ex: p.x, ey: p.y,
      dead: false,
    });
  }
}

/** 点到线段距离（激光命中判定） */
function pointSegDist(
  px: number, py: number, x1: number, y1: number, x2: number, y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

/** 每帧推进能量球：延迟后朝锁定方向射出最多 1500px、被墙体截断的激光 */
export function updateArcaneOrbs(ctx: ArcaneContext, dt: number): void {
  if (ctx.orbs.length === 0) return;
  const b = BALANCE.arcane;
  for (const o of [...ctx.orbs]) {
    if (o.dead) continue;
    if (!o.fired) {
      o.delay -= dt;
      if (o.delay <= 0) {
        o.fired = true;
        const len = rayWallDistance(
          o.x, o.y, Math.cos(o.ang), Math.sin(o.ang), b.orbLaserLen, ctx.wallRects,
        );
        o.ex = o.x + Math.cos(o.ang) * len;
        o.ey = o.y + Math.sin(o.ang) * len;
        o.t = b.orbLaserDur;
        o.tickT = b.orbLaserTick;
        if (o.owner.isPlayer) ctx.events.emit('sfx:play', { name: 'shot', volume: 0.5 });
      }
      continue;
    }
    o.t -= dt;
    o.tickT -= dt;
    if (o.tickT <= 0) {
      o.tickT += b.orbLaserTick;
      const halfW = b.orbLaserWidth / 2;
      for (const f of ctx.fighters) {
        if (!f.alive || f === o.owner) continue;
        if (f.teamBattle && f.team === o.owner.team) continue;
        if (pointSegDist(f.x, f.y, o.x, o.y, o.ex, o.ey) > f.hitR + halfW) continue;
        f.takeDamage(b.orbLaserDmg, {
          source: o.owner, noCrit: true,
          dirX: Math.cos(o.ang), dirY: Math.sin(o.ang),
        });
      }
    }
    if (o.t <= 0) {
      o.dead = true;
      const i = ctx.orbs.indexOf(o);
      if (i >= 0) ctx.orbs.splice(i, 1);
    }
  }
}
