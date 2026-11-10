import Phaser from 'phaser';
import { BALANCE, CHAR } from '../../../config';
import { clamp, dist, rayWallDistance } from '../../../core/util';
import { BODY_R, Fighter } from '../../../entities/Fighter';
import { Bullet } from '../../../entities/Bullet';
import type { Rng } from '../../../core/rng';
import type { GameEventBus } from '../../events';

/**
 * 神枪手技能模块（阶段一迁移试点）。
 *
 * 只负责战斗逻辑：生成子弹、推进弹幕风暴、结算状态；
 * 所有音效 / 粒子 / 震屏通过事件总线交给表现层（view/fxView）。
 * 数值与判定条件与迁移前逐行保持一致。
 */
export interface GunnerContext {
  scene: Phaser.Scene;
  fighters: Fighter[];
  bullets: Bullet[];
  wallRects: Phaser.Geom.Rectangle[];
  events: GameEventBus;
  rng: Rng;
  over: boolean;
}

export function fireGunnerShot(ctx: GunnerContext, self: Fighter, angle: number): void {
  if (self.silenced) return;
  if (!self.alive || ctx.over || self.charId !== CHAR.GUNNER) return;
  if (self.skillActive || self.atkCd > 0) return;
  // 午时已到蓄力期间无法普攻
  if (self.highNoonCharging) return;
  self.atkCd = BALANCE.gunner.atkCD;
  self.faceAngle = angle;
  const mx = self.x + Math.cos(angle) * (BODY_R + 16);
  const my = self.y + Math.sin(angle) * (BODY_R + 16);
  const bullet = new Bullet(
    ctx.scene, mx, my, angle, self,
    (x, y) => ctx.events.emit('fx:spark', { x, y, color: 0xf2c94c, count: 3 }),
    (x, y) => ctx.events.emit('fx:boom', { x, y }),
    {
      // 西部回忆「快速拔枪」：弹道速度 ×2
      speed: BALANCE.gunner.bulletSpeed * self.bulletSpeedMul,
      onBounce: () => ctx.events.emit('sfx:play', { name: 'bounce', volume: 0.3 }),
    },
  );
  ctx.bullets.push(bullet);
  if (self.isPlayer) ctx.events.emit('sfx:play', { name: 'shot', volume: 0.85 });
  ctx.events.emit('fx:muzzle', { fighter: self, angle });
}

export function activateGunnerSkill(ctx: GunnerContext, self: Fighter): void {
  if (self.silenced) return;
  if (self.charId !== CHAR.GUNNER || !self.gunnerReady || self.skillActive) return;
  if (!self.alive) return;
  const b = BALANCE.gunner;
  // 消耗全部底气：8 层为基础时长，每多 1 层 +0.3s（16 层 → 4.8s）
  const stacks = self.chargeHits;
  const dur = Math.min(
    b.skillDurBase + Math.max(0, stacks - b.hitsToReady) * b.skillDurPerExtra,
    b.skillDurBase + (b.chargeMax - b.hitsToReady) * b.skillDurPerExtra,
  );
  self.skillActive = true;
  self.skillTimer = dur;
  self.skillDurMax = dur;
  self.skillTickT = 0;
  self.chargeHits = 0;
  if (self.isPlayer) ctx.events.emit('sfx:play', { name: 'storm_on', volume: 0.9 });
  ctx.events.emit('fx:burst', { x: self.x, y: self.y });
  ctx.events.emit('fx:shake', { intensity: self.isPlayer ? 0.008 : 0.005, duration: 260 });
}

/**
 * 突进：玩家朝鼠标点突进（鼠标更近时只冲到鼠标位置），AI 冲到最大距离。
 * pointerWorld 仅玩家需要；为 undefined 时保持 AI 行为。
 */
export function dashGunner(
  ctx: GunnerContext,
  self: Fighter,
  angle: number,
  pointerWorld?: { x: number; y: number },
): void {
  if (self.silenced) return;
  if (!self.alive) return;
  const maxD = self.skillActive ? BALANCE.gunner.skillDashDist : BALANCE.gunner.dashDist;
  let distance = maxD;
  if (self.isPlayer) {
    if (!pointerWorld) return;
    distance = Math.min(dist(self.x, self.y, pointerWorld.x, pointerWorld.y), maxD);
    if (distance < 24) return;
  }
  if (self.dash(angle, distance)) {
    if (self.isPlayer) ctx.events.emit('sfx:play', { name: 'dash', volume: 0.5 });
    ctx.events.emit('fx:dash', { fighter: self, angle });
  }
}

export function updateGunnerSkill(ctx: GunnerContext, f: Fighter, dt: number): void {
  if (!f.skillActive) return;
  f.skillTimer -= dt;
  if (f.skillTimer <= 0) {
    f.skillActive = false;
    return;
  }
  f.skillTickT -= dt;
  if (f.skillTickT <= 0) {
    f.skillTickT += BALANCE.gunner.skillTickCd;
    const b = BALANCE.gunner;
    const enemies = ctx.fighters.filter((e) => e !== f && e.alive &&
      !(e.teamBattle && e.team === f.team) && // 团队模式不向友军发射弹幕
      dist(e.x, e.y, f.x, f.y) <= b.skillRadius + e.hitR);
    // 范围内没有敌人时不发射（修复“朝随机方向乱射”的 bug）
    if (enemies.length === 0) return;
    for (let i = 0; i < b.skillBulletCount; i++) {
      // 每发追踪弹锁定一个范围内敌人
      const target = ctx.rng.pick(enemies);
      const angle = Math.atan2(target.y - f.y, target.x - f.x);
      const bullet = new Bullet(
        ctx.scene, f.x, f.y, angle, f,
        (x, y) => ctx.events.emit('fx:spark', { x, y, color: 0xff8a3c, count: 3 }),
        (x, y) => ctx.events.emit('fx:boom', { x, y }),
        {
          dmg: b.skillTickDmg,
          homingTarget: target,
          passWalls: true,
          life: b.skillBulletLife,
          // 弹幕风暴的追踪弹不计入充能，并使用黄红色小椭圆专用贴图
          countsCharge: false,
          texture: 'tex-skillbullet',
          scale: 2.6,
          glowTint: 0xff8a3c,
        },
      );
      ctx.bullets.push(bullet);
    }
    ctx.events.emit('fx:barrage', { x: f.x, y: f.y });
  }
}

/* ================= 西部回忆 · 午时已到（PVE 专属） ================= */

/** 选出指针附近（或离自己最近）的敌人作为瞄准目标 */
function pickHighNoonTarget(
  ctx: GunnerContext, self: Fighter, px: number, py: number,
): Fighter | null {
  const valid = (e: Fighter) => e !== self && e.alive
    && !(e.teamBattle && e.team === self.team);
  let best: Fighter | null = null;
  let bestD = 240;
  for (const e of ctx.fighters) {
    if (!valid(e)) continue;
    const d = dist(px, py, e.x, e.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  if (best) return best;
  bestD = 320;
  for (const e of ctx.fighters) {
    if (!valid(e)) continue;
    const d = dist(self.x, self.y, e.x, e.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

/** 目标与自身之间是否被墙体隔开 */
function wallBetween(ctx: GunnerContext, self: Fighter, target: Fighter): boolean {
  const d = dist(self.x, self.y, target.x, target.y);
  if (d <= 1) return false;
  const dx = (target.x - self.x) / d;
  const dy = (target.y - self.y) / d;
  return rayWallDistance(self.x, self.y, dx, dy, d, ctx.wallRects) < d - BODY_R;
}

/** 开始蓄力瞄准；返回是否成功开始 */
export function beginHighNoon(
  ctx: GunnerContext, self: Fighter, px: number, py: number,
): boolean {
  if (!self.alive || ctx.over || self.charId !== CHAR.GUNNER) return false;
  if (!self.highNoonUnlocked || self.highNoonCharging) return false;
  if (self.silenced || self.skillActive) return false;
  if (self.chargeHits < BALANCE.gunner.highNoonNeedStacks) return false;
  const target = pickHighNoonTarget(ctx, self, px, py);
  if (!target) return false;
  // 起始就隔着墙则不允许开始（与蓄力中被打断保持同一判定）
  if (wallBetween(ctx, self, target)) return false;
  self.highNoonCharging = true;
  self.highNoonT = 0;
  self.highNoonTarget = target;
  self.faceAngle = Math.atan2(target.y - self.y, target.x - self.x);
  if (self.isPlayer) ctx.events.emit('sfx:play', { name: 'charge_full', volume: 0.6 });
  return true;
}

/** 中断蓄力（不消耗底气） */
export function cancelHighNoon(self: Fighter): void {
  self.highNoonCharging = false;
  self.highNoonT = 0;
  self.highNoonTarget = null;
}

/** 每帧推进蓄力：目标死亡 / 被墙体隔开 → 强制中断 */
export function updateHighNoon(ctx: GunnerContext, self: Fighter, dt: number): void {
  if (!self.highNoonCharging) return;
  const b = BALANCE.gunner;
  const target = self.highNoonTarget;
  if (!self.alive || ctx.over || !target || !target.alive) {
    cancelHighNoon(self);
    return;
  }
  if (wallBetween(ctx, self, target)) {
    cancelHighNoon(self);
    if (self.isPlayer) ctx.events.emit('sfx:play', { name: 'bounce', volume: 0.4 });
    return;
  }
  self.highNoonT = Math.min(b.highNoonMaxCharge, self.highNoonT + dt);
  self.faceAngle = Math.atan2(target.y - self.y, target.x - self.x);
}

/** 松开右键：结算即时命中；蓄力不足 0.5s 则取消 */
export function releaseHighNoon(
  ctx: GunnerContext, self: Fighter,
): { shots: number; dmg: number; target: Fighter } | null {
  if (!self.highNoonCharging) return null;
  const b = BALANCE.gunner;
  const target = self.highNoonTarget;
  const t = self.highNoonT;
  cancelHighNoon(self);
  if (!target || !target.alive || t < b.highNoonMinCharge) return null;
  const stacks = self.chargeHits;
  self.chargeHits = 0;
  // 每 3 层底气 1 发（16 层 → 6 发），每蓄力 0.5s 伤害提升 100%（最高 500%）
  const shots = Math.min(
    b.highNoonMaxBullets,
    Math.max(1, Math.ceil(stacks / b.highNoonStacksPerBullet)),
  );
  const mul = clamp(Math.floor(t / b.highNoonDmgStep), 1, 5);
  const dmg = b.highNoonBulletDmg * mul;
  const ang = Math.atan2(target.y - self.y, target.x - self.x);
  for (let i = 0; i < shots; i++) {
    if (!target.alive) break;
    target.takeDamage(dmg, {
      source: self,
      dirX: Math.cos(ang),
      dirY: Math.sin(ang),
    });
  }
  ctx.events.emit('sfx:play', { name: 'shot', volume: 1 });
  ctx.events.emit('fx:spark', { x: target.x, y: target.y - 6, color: 0xffb03c, count: 8 });
  ctx.events.emit('fx:shake', { intensity: 0.01, duration: 220 });
  return { shots, dmg, target };
}

/* ================= 西部回忆 · 死神之眼（v0.41 右键锁定狙击） ================= */

/** 选出鼠标附近（或离自己最近）的可锁定敌人 */
function pickLockTarget(
  ctx: GunnerContext, self: Fighter, px: number, py: number,
): Fighter | null {
  const b = BALANCE.gunner;
  const valid = (e: Fighter) => e !== self && e.alive
    && !(e.teamBattle && e.team === self.team)
    && dist(self.x, self.y, e.x, e.y) <= b.lockRange;
  let best: Fighter | null = null;
  let bestD = b.lockAimTol;
  for (const e of ctx.fighters) {
    if (!valid(e)) continue;
    const d = dist(px, py, e.x, e.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  if (best) return best;
  bestD = b.lockRange;
  for (const e of ctx.fighters) {
    if (!valid(e)) continue;
    const d = dist(self.x, self.y, e.x, e.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

/** 右键锁定一名敌人（无需蓄力）；墙体遮挡时不允许锁定 */
export function beginGunnerLock(
  ctx: GunnerContext, self: Fighter, px: number, py: number,
): boolean {
  if (!self.alive || ctx.over || self.charId !== CHAR.GUNNER) return false;
  if (!self.highNoonUnlocked || self.silenced || self.skillActive) return false;
  if (self.lockTarget) return false;
  const target = pickLockTarget(ctx, self, px, py);
  if (!target) return false;
  if (wallBetween(ctx, self, target)) return false;
  self.lockTarget = target;
  self.faceAngle = Math.atan2(target.y - self.y, target.x - self.x);
  if (self.isPlayer) ctx.events.emit('sfx:play', { name: 'charge_full', volume: 0.6 });
  return true;
}

/** 再次点按右键 / 目标死亡 / 墙体遮挡 → 取消锁定 */
export function cancelGunnerLock(self: Fighter): void {
  self.lockTarget = null;
}

/** 每帧校验锁定的有效性 */
export function updateGunnerLock(ctx: GunnerContext, self: Fighter): void {
  const target = self.lockTarget;
  if (!target) return;
  if (!self.alive || ctx.over || !target.alive || wallBetween(ctx, self, target)) {
    cancelGunnerLock(self);
    if (self.isPlayer) ctx.events.emit('sfx:play', { name: 'bounce', volume: 0.35 });
    return;
  }
  self.faceAngle = Math.atan2(target.y - self.y, target.x - self.x);
}

/**
 * 锁定期间点按左键：消耗一层底气，朝目标极速射出一枚水滴狙击弹（必定暴击）。
 * 暴击率按 ×2 转化为额外暴击伤害。
 */
export function fireGunnerLockShot(ctx: GunnerContext, self: Fighter): void {
  if (!self.alive || ctx.over || self.charId !== CHAR.GUNNER) return;
  const target = self.lockTarget;
  if (!target || !target.alive || self.atkCd > 0) return;
  if (self.chargeHits < 1) {
    if (self.isPlayer) ctx.events.emit('sfx:play', { name: 'bounce', volume: 0.3 });
    return;
  }
  const b = BALANCE.gunner;
  self.chargeHits -= 1;
  self.atkCd = b.atkCD;
  const ang = Math.atan2(target.y - self.y, target.x - self.x);
  self.faceAngle = ang;
  const mx = self.x + Math.cos(ang) * (BODY_R + 16);
  const my = self.y + Math.sin(ang) * (BODY_R + 16);
  const critMul = self.critDmgMul + self.critChance * b.lockCritChanceMul;
  const bullet = new Bullet(
    ctx.scene, mx, my, ang, self,
    (x, y) => ctx.events.emit('fx:spark', { x, y, color: 0x9be8ff, count: 4 }),
    (x, y) => ctx.events.emit('fx:boom', { x, y }),
    {
      dmg: b.lockShotDmg,
      speed: b.lockShotSpeed,
      // 水滴型狙击弹：极快、命中即消散
      texture: 'tex-lockdrop',
      scale: 2.2,
      radius: 7,
      vanishOnWall: true,
      countsCharge: false,
      travelMax: b.lockRange + 160,
      forceCrit: true,
      forceCritMul: critMul,
      glowTint: 0x9be8ff,
    },
  );
  ctx.bullets.push(bullet);
  if (self.isPlayer) ctx.events.emit('sfx:play', { name: 'shot', volume: 1 });
  ctx.events.emit('fx:muzzle', { fighter: self, angle: ang });
}
