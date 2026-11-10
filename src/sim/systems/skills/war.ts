import Phaser from 'phaser';
import { BALANCE, CHAR, MAP_SIZE } from '../../../config';
import { clamp, rayWallDistance } from '../../../core/util';
import { BODY_R, Fighter } from '../../../entities/Fighter';
import { Bullet } from '../../../entities/Bullet';
import type { GameEventBus } from '../../events';

/**
 * 战争机器技能模块（v0.17）。
 *
 * 只负责战斗逻辑：能量连射、毁灭激光命中结算、后撤、长按蓄势与歼灭姿态推进；
 * 视觉表现由表现层回调提供，音效 / 震屏走事件总线。
 * 数值与判定条件与迁移前保持一致。
 */
export interface WarContext {
  scene: Phaser.Scene;
  fighters: Fighter[];
  bullets: Bullet[];
  wallRects: Phaser.Geom.Rectangle[];
  events: GameEventBus;
  over: boolean;
  pix(x: number, y: number, color: number, scale?: number, life?: number): void;
  muzzleFx(f: Fighter, angle: number, recoil?: boolean): void;
  dashFx(f: Fighter, angle: number): void;
  /** 火力压制：合并飘字（每 0.2s 一次，避免 0.01s 高频伤害刷屏） */
  suppressLaserText(target: Fighter, dmg: number): void;
  warLaserFx(
    self: Fighter, ex: number, ey: number, width: number, len: number, nx: number, ny: number,
  ): void;
  warAnnihilateFx(self: Fighter): void;
}

/** 左键能量连射：0.2s 间隔，射程 1000px，撞墙消散，飞行 500px 后伤害减半 */
export function fireWarShot(ctx: WarContext, self: Fighter, angle: number): void {
  if (self.silenced) return;
  if (self.charId !== CHAR.WAR || !self.alive || ctx.over) return;
  if (self.warSwitchT > 0) return; // 覆盖协议切换期间无法攻击
  if (self.atkCd > 0) return;
  const w = BALANCE.war;
  const suppress = self.warOverloadUnlocked && self.warSuppress;
  // 火力压制：激光发射期间无法同时发射子弹
  if (suppress && self.warLaserHeld) return;
  self.atkCd = suppress ? w.suppressFireInterval : w.atkCD;
  self.warIdleT = 0; // 攻击打断战地维修
  self.faceAngle = angle;
  let mx = self.x + Math.cos(angle) * (BODY_R + 16);
  let my = self.y + Math.sin(angle) * (BODY_R + 16);
  // 火力压制：左右枪口交替，形成加特林式连射
  if (suppress) {
    self.warGatlingSide = -self.warGatlingSide;
    const off = self.warGatlingSide * 11;
    mx += -Math.sin(angle) * off;
    my += Math.cos(angle) * off;
  }
  const bullet = new Bullet(
    ctx.scene, mx, my, angle, self,
    (x, y) => ctx.events.emit('fx:spark', { x, y, color: 0xff6b6b, count: 3 }),
    (x, y) => ctx.events.emit('fx:spark', { x, y, color: 0xffb3b3, count: 4 }),
    {
      dmg: w.bulletDmg,
      speed: w.bulletSpeed,
      travelMax: w.bulletRange,
      falloffDist: w.falloffDist,
      falloffMul: w.falloffMul,
      vanishOnWall: true,
      countsCharge: false,
      texture: 'tex-war-bullet',
      scale: 2.4,
      radius: 7,
      glowTint: 0xff5a5a,
    },
  );
  ctx.bullets.push(bullet);
  if (self.isPlayer) ctx.events.emit('sfx:play', { name: 'war_shot', volume: 0.6 });
  // 火力压制：0.06s 连发时不做后坐缩放，避免高频补间把角色越缩越小
  ctx.muzzleFx(self, angle, !suppress);
}

/** 右键毁灭激光炮：消耗充能（≥20），穿透路径上所有敌人，被墙体截断 */
export function fireWarLaser(ctx: WarContext, self: Fighter): void {
  if (self.silenced) return;
  if (self.charId !== CHAR.WAR || !self.alive || ctx.over) return;
  if (self.warSwitchT > 0) return; // 覆盖协议切换期间无法攻击
  // 火力压制形态：右键改为长按持续激光
  if (self.warOverloadUnlocked && self.warSuppress) return;
  const w = BALANCE.war;
  // 核心超载：单次最多计入 / 消耗 100 充能
  const chargeCap = self.warOverloadUnlocked ? w.laserChargeCap : w.chargeMax;
  const charge = Math.min(Math.floor(self.warCharge), chargeCap);
  if (charge < w.laserNeed) return;
  const dmgFull = charge * w.laserDmgPerCharge;
  // 宽度随充能由 30px 线性提升到 60px（充能超过 100 不再变宽）
  const width = w.laserWidthMin
    + (w.laserWidthMax - w.laserWidthMin)
    * clamp((charge - w.laserNeed) / (w.laserChargeCap - w.laserNeed), 0, 1);
  self.warCharge = self.warOverloadUnlocked
    ? Math.max(0, self.warCharge - w.laserChargeCap)
    : 0;
  self.warIdleT = 0; // 攻击打断战地维修
  const a = self.faceAngle;
  const nx = Math.cos(a);
  const ny = Math.sin(a);
  // 激光长度：slab 法求最近墙体交点（无限射程，但被墙体截断，无法穿透）
  const len = rayWallDistance(self.x, self.y, nx, ny, MAP_SIZE * 2.5, ctx.wallRects);
  const ex = self.x + nx * len;
  const ey = self.y + ny * len;
  // 命中判定：沿射线的投影距离 + 垂直偏移
  for (const f of ctx.fighters) {
    if (!f.alive || f === self) continue;
    const dx = f.x - self.x;
    const dy = f.y - self.y;
    const proj = dx * nx + dy * ny;
    if (proj < -f.hitR || proj > len + f.hitR) continue;
    const perp = Math.abs(dy * nx - dx * ny);
    if (perp > width / 2 + f.hitR) continue;
    const dmg = perp <= width / 4 ? dmgFull : dmgFull * w.laserSideMul;
    f.takeDamage(dmg, { dirX: nx, dirY: ny, source: self });
  }
  ctx.warLaserFx(self, ex, ey, width, len, nx, ny);
  if (self.isPlayer) {
    ctx.events.emit('sfx:play', { name: 'war_laser', volume: 0.9 });
    ctx.events.emit('fx:shake', { intensity: 0.012, duration: 300 });
  }
}

/** 空格点按：向鼠标反方向后退 150px，恢复 30 充能（CD 4s） */
export function warBackdash(ctx: WarContext, self: Fighter): void {
  if (self.silenced) return;
  if (self.charId !== CHAR.WAR || !self.alive || ctx.over) return;
  const w = BALANCE.war;
  if (self.warBackCd > 0) return;
  self.warBackCd = w.backCd;
  self.addWarCharge(w.backCharge);
  const a = self.faceAngle + Math.PI;
  const speed = 900;
  self.dashT = w.backDist / speed;
  self.dashVX = Math.cos(a) * speed;
  self.dashVY = Math.sin(a) * speed;
  if (self.isPlayer) ctx.events.emit('sfx:play', { name: 'war_back', volume: 0.55 });
  ctx.dashFx(self, a);
}

/** 空格按下：开始长按蓄势（1.5s 后进入歼灭模式；提前松手 = 点按后退） */
export function beginWarHold(ctx: WarContext, self: Fighter): void {
  if (self.charId !== CHAR.WAR || !self.alive) return;
  if (self.warOverloadUnlocked) return; // 覆盖协议已替换歼灭形态
  if (self.warHolding || self.warAnnT > 0 || self.warAnnCd > 0) return;
  self.warHolding = true;
  self.warHoldT = 0;
}

/** 覆盖协议：空格在常规形态与火力压制形态之间切换（无冷却，1.5s 切换期间无法攻击） */
export function toggleWarSuppress(ctx: WarContext, self: Fighter): void {
  if (self.charId !== CHAR.WAR || !self.alive || ctx.over) return;
  if (!self.warOverloadUnlocked || self.silenced) return;
  if (self.warSwitchT > 0) return;
  const w = BALANCE.war;
  self.warSwitchT = w.suppressSwitchTime;
  self.warSuppress = !self.warSuppress;
  self.warLaserHeld = false;
  self.warLaserTickT = 0;
  self.warHolding = false;
  self.warHoldT = 0;
  self.warIdleT = 0;
  if (self.isPlayer) {
    ctx.events.emit('sfx:play', {
      name: self.warSuppress ? 'war_annihilate' : 'war_back', volume: 0.7,
    });
    ctx.events.emit('fx:shake', { intensity: 0.006, duration: 220 });
  }
  ctx.warAnnihilateFx(self);
}

/** 火力压制：右键按下开始长按持续激光 */
export function beginWarLaserHold(ctx: WarContext, self: Fighter): void {
  if (self.charId !== CHAR.WAR || !self.alive || ctx.over) return;
  if (!self.warOverloadUnlocked || !self.warSuppress) return;
  if (self.silenced || self.warSwitchT > 0) return;
  if (self.warLaserHeld || self.warFireHeld) return; // 左右键互斥：左键开火中不能起手激光
  if (self.warCharge <= 0) return;
  self.warLaserHeld = true;
  self.warLaserTickT = 0;
  self.warIdleT = 0;
}

/** 火力压制：右键松开停止持续激光 */
export function stopWarLaserHold(self: Fighter): void {
  self.warLaserHeld = false;
  self.warLaserTickT = 0;
  self.warLaserAcc = 0;
  self.warLaserShowT = 0;
}

/** 火力压制：持续激光结算（每 0.01s 造成 10 伤害，宽度等同 100 充能激光） */
function fireSuppressLaser(ctx: WarContext, self: Fighter): void {
  const w = BALANCE.war;
  const width = w.laserWidthMax;
  const a = self.faceAngle;
  const nx = Math.cos(a);
  const ny = Math.sin(a);
  const len = rayWallDistance(self.x, self.y, nx, ny, MAP_SIZE * 2.5, ctx.wallRects);
  for (const f of ctx.fighters) {
    if (!f.alive || f === self) continue;
    const dx = f.x - self.x;
    const dy = f.y - self.y;
    const proj = dx * nx + dy * ny;
    if (proj < -f.hitR || proj > len + f.hitR) continue;
    const perp = Math.abs(dy * nx - dx * ny);
    if (perp > width / 2 + f.hitR) continue;
    // 高频持续伤害：静默结算，每 0.2s 合并飘字
    f.takeDamage(w.suppressLaserDmg, {
      dirX: nx, dirY: ny, source: self, noText: true, quiet: true,
    });
    self.warLaserAcc += w.suppressLaserDmg * self.dmgMul;
    self.warLaserLast = f;
  }
}

/** 进入歼灭姿态：立即 +50 充能，之后每 0.05s +2，移速 +20%，持续 10s；结束后进入 30s 冷却 */
export function startWarAnnihilate(ctx: WarContext, self: Fighter): void {
  if (self.silenced) return;
  if (self.charId !== CHAR.WAR || !self.alive || ctx.over) return;
  const w = BALANCE.war;
  if (self.warAnnCd > 0 || self.warAnnT > 0) return;
  self.warHolding = false;
  self.warHoldT = 0;
  self.warAnnT = w.annDur;
  self.warAnnTickT = 0;
  self.addWarCharge(w.annBurstCharge);
  if (self.isPlayer) {
    ctx.events.emit('sfx:play', { name: 'war_annihilate', volume: 0.9 });
    ctx.events.emit('fx:shake', { intensity: 0.008, duration: 260 });
  }
  ctx.warAnnihilateFx(self);
}

/** 每帧推进战争机器的长按蓄势 / 歼灭姿态 */
export function updateWar(ctx: WarContext, f: Fighter, dt: number): void {
  if (f.charId !== CHAR.WAR) return;
  const w = BALANCE.war;
  if (!f.alive) {
    f.warHolding = false;
    f.warHoldT = 0;
    f.warLaserHeld = false;
    f.warLaserTickT = 0;
    return;
  }
  // 火力压制：长按右键持续激光，每秒消耗 150 充能，每 0.01s 结算 10 伤害
  if (f.warLaserHeld) {
    if (!f.warOverloadUnlocked || !f.warSuppress || f.warSwitchT > 0
      || f.silenced || f.warCharge <= 0) {
      f.warLaserHeld = false;
      f.warLaserTickT = 0;
      f.warLaserAcc = 0;
      f.warLaserShowT = 0;
    } else {
      f.warIdleT = 0;
      f.warCharge = Math.max(0, f.warCharge - w.suppressLaserDrain * dt);
      f.warLaserTickT += dt;
      while (f.warLaserTickT >= w.suppressLaserTick) {
        f.warLaserTickT -= w.suppressLaserTick;
        fireSuppressLaser(ctx, f);
      }
      // 高频伤害合并飘字：每 0.2s 弹出一次累计伤害
      f.warLaserShowT += dt;
      if (f.warLaserShowT >= 0.2) {
        f.warLaserShowT -= 0.2;
        if (f.warLaserAcc > 0 && f.warLaserLast && f.warLaserLast.alive) {
          ctx.suppressLaserText(f.warLaserLast, f.warLaserAcc);
        }
        f.warLaserAcc = 0;
        f.warLaserLast = null;
      }
      if (f.warCharge <= 0) {
        f.warLaserHeld = false;
        f.warLaserTickT = 0;
        f.warLaserAcc = 0;
        f.warLaserShowT = 0;
      }
    }
  }
  // 长按蓄势（移速由 Fighter.update 按倍率渐降）
  if (f.warHolding) {
    f.warHoldT += dt;
    if (Math.random() < dt * 12) {
      ctx.pix(f.x + (Math.random() - 0.5) * 40, f.y + (Math.random() - 0.5) * 40, 0xff8a8a, 3, 320);
    }
    if (f.warHoldT >= w.annHold) {
      if (f.warAnnCd <= 0) startWarAnnihilate(ctx, f);
      else {
        f.warHolding = false;
        f.warHoldT = 0;
      }
    }
  }
  // 歼灭姿态：持续充能 + 倒计时
  if (f.warAnnT > 0) {
    f.warAnnT = Math.max(0, f.warAnnT - dt);
    f.warAnnTickT += dt;
    while (f.warAnnTickT >= w.annTickCd) {
      f.warAnnTickT -= w.annTickCd;
      f.addWarCharge(w.annTickCharge);
    }
    if (Math.random() < dt * 14) {
      ctx.pix(f.x + (Math.random() - 0.5) * 46, f.y + (Math.random() - 0.5) * 46, 0xff4d4d, 3, 320);
    }
    if (f.warAnnT <= 0) {
      f.warAnnT = 0;
      f.warAnnTickT = 0;
      f.warAnnCd = w.annCd; // 歼灭状态结束后才进入冷却
    }
  }
}
