import Phaser from 'phaser';
import { BALANCE, CHAR, MAP_SIZE, WALL_T } from '../../../config';
import { clamp, circleRectCollision, dist, nearestFreePoint } from '../../../core/util';
import { BODY_R, Fighter } from '../../../entities/Fighter';
import { Bullet } from '../../../entities/Bullet';
import type { GameEventBus } from '../../events';

/**
 * 利剑舞者技能模块。
 *
 * 只负责战斗逻辑：剑气、招架结算入口、利刃华尔兹开启 / 穿刺 / 击杀易位；
 * 专属打击特效由表现层回调提供，音效与震屏走事件总线。
 * 数值与判定条件与迁移前保持一致。
 */
export interface BladeContext {
  scene: Phaser.Scene;
  fighters: Fighter[];
  bullets: Bullet[];
  wallRects: Phaser.Geom.Rectangle[];
  events: GameEventBus;
  over: boolean;
  resolveOutOfWalls(f: Fighter): void;
  healFx(f: Fighter, amount: number): void;
  swordWaveFx(f: Fighter, angle: number): void;
  waltzEnterFx(f: Fighter): void;
  waltzEndFx(f: Fighter): void;
  waltzTrailFx(f: Fighter, angle: number): void;
  waltzStepFx(x: number, y: number, dx: number, dy: number): void;
  waltzHitFx(x: number, y: number, dx: number, dy: number): void;
  waltzRelocateFx(x0: number, y0: number, x1: number, y1: number): void;
}

export function fireBladeWave(ctx: BladeContext, self: Fighter, angle: number): void {
  if (self.silenced) return;
  if (self.charId !== CHAR.BLADE || !self.alive || ctx.over) return;
  if (self.waltzActive || self.stunTimer > 0 || self.bombTargeting) return;
  if (self.bladeStacks <= 0 || self.atkCd > 0) return;
  const b = BALANCE.blade;
  self.spendBladeStacks(1);
  self.atkCd = b.waveCd;
  self.faceAngle = angle;
  const mx = self.x + Math.cos(angle) * (BODY_R + 14);
  const my = self.y + Math.sin(angle) * (BODY_R + 14);
  // v0.13：剑气命中敌人返还 1 层剑势（每发仅返还一次）
  let refunded = false;
  const bullet = new Bullet(
    ctx.scene, mx, my, angle, self,
    (x, y) => {
      ctx.events.emit('fx:spark', { x, y, color: 0xd9f0ff, count: 3 });
      if (!refunded) {
        refunded = true;
        self.addBladeStacks(b.waveHitRefund);
      }
    },
    (x, y) => ctx.events.emit('fx:spark', { x, y, color: 0x9fd8ff, count: 4 }),
    {
      dmg: b.waveDmg,
      speed: b.waveSpeed,
      life: b.waveRange / b.waveSpeed,
      countsCharge: false,
      pierce: true,
      vanishOnWall: true,
      texture: 'tex-swordwave',
      scale: 4,
      radius: b.waveRadius,
      glowTint: 0x9fd8ff,
    },
  );
  ctx.bullets.push(bullet);
  if (self.isPlayer) ctx.events.emit('sfx:play', { name: 'swordwave', volume: 0.6 });
  ctx.swordWaveFx(self, angle);
}

/** 空格·利刃华尔兹：剑势 ≥20 开启；华尔兹中再次按空格 = 提前结束（保留剩余剑势） */
export function startWaltz(ctx: BladeContext, self: Fighter): void {
  if (self.silenced) return;
  if (self.charId !== CHAR.BLADE || !self.alive) return;
  if (self.waltzActive) {
    // v0.15：提前结束华尔兹（剑势不清空）
    exitWaltz(ctx, self);
    if (self.isPlayer) ctx.events.emit('sfx:play', { name: 'waltz_on', volume: 0.5 });
    return;
  }
  if (!self.bladeWaltzReady) return;
  self.waltzActive = true;
  self.waltzDashing = false;
  self.waltzTraveled = 0;
  self.waltzHitSet.clear();
  self.parryCharging = false;
  self.parryChargeT = 0;
  self.parryT = 0;
  self.parryReduce = 0;
  // 开启华尔兹：获得 剑势×10 的护盾，持续至华尔兹结束
  self.shield = self.bladeStacks * BALANCE.blade.waltzShieldMul;
  self.moveX = 0;
  self.moveY = 0;
  if (self.isPlayer) ctx.events.emit('sfx:play', { name: 'waltz_on', volume: 0.8 });
  ctx.waltzEnterFx(self);
  if (self.isPlayer) ctx.events.emit('fx:shake', { intensity: 0.008, duration: 260 });
}

/** 华尔兹左键：朝鼠标方向固定穿刺 350px（前 300px 极快，最后 50px 卸力减速；冲刺冷却 0.1s） */
export function bladeDash(ctx: BladeContext, self: Fighter): void {
  if (self.silenced) return;
  if (self.charId !== CHAR.BLADE || !self.alive) return;
  if (!self.waltzActive || self.waltzDashing) return;
  if (self.waltzDashCd > 0) return; // v0.13：冲刺冷却
  if (self.bladeStacks <= 0) return;
  const cost = self.spendBladeStacks(BALANCE.blade.waltzCost);
  if (cost <= 0) return;
  self.waltzDashing = true;
  self.waltzDashCd = BALANCE.blade.waltzDashCd;
  self.waltzTraveled = 0;
  self.waltzDirX = Math.cos(self.faceAngle);
  self.waltzDirY = Math.sin(self.faceAngle);
  self.waltzHitSet.clear();
  if (self.isPlayer) ctx.events.emit('sfx:play', { name: 'blade_dash', volume: 0.45 });
  ctx.waltzTrailFx(self, self.faceAngle);
}

/** 逐帧推进华尔兹穿刺（子步进 + 圆-矩检测，避免高速穿墙） */
export function updateBladeWaltz(ctx: BladeContext, f: Fighter, dt: number): void {
  if (!f.waltzActive || !f.waltzDashing || !f.alive) return;
  const b = BALANCE.blade;
  const remaining = b.waltzDist - f.waltzTraveled;
  if (remaining <= 0) {
    finishWaltzDash(ctx, f);
    return;
  }
  // 速度曲线：前 300px 极快，最后 50px 从 waltzSlowSpeed 线性卸力到 0
  const speed = f.waltzTraveled < b.waltzFastDist
    ? b.waltzFastSpeed
    : Math.max(40, b.waltzSlowSpeed * (remaining / (b.waltzDist - b.waltzFastDist)));
  const stepDist = Math.min(remaining, speed * dt);
  const steps = Math.max(1, Math.ceil(stepDist / 6));
  const s = stepDist / steps;
  const body = f.sprite.body as Phaser.Physics.Arcade.Body;
  let blocked = false;
  for (let i = 0; i < steps; i++) {
    const px = f.x + f.waltzDirX * s;
    const py = f.y + f.waltzDirY * s;
    // 撞墙即终止穿刺（开启穿墙时忽略墙体）
    if (!b.waltzPierceWalls) {
      for (const r of ctx.wallRects) {
        if (circleRectCollision(px, py, BODY_R, r)) {
          blocked = true;
          break;
        }
      }
    }
    if (blocked) break;
    body.reset(px, py);
    body.setVelocity(0, 0);
    f.waltzTraveled += s;
    // 命中敌人：高额伤害 + 回复 50% 伤害的血量
    for (const e of ctx.fighters) {
      if (!e.alive || e === f || f.waltzHitSet.has(e)) continue;
      if (f.teamBattle && e.team === f.team) continue; // 团队模式跳过友军
      if (dist(px, py, e.x, e.y) > e.hitR + b.waltzHitR) continue;
      f.waltzHitSet.add(e);
      const died = e.takeDamage(b.waltzDmg, {
        dirX: f.waltzDirX, dirY: f.waltzDirY, source: f,
      });
      ctx.waltzHitFx(px, py, f.waltzDirX, f.waltzDirY);
      if (died && f.waltzActive) {
        // v0.16：华尔兹穿刺击杀回复固定生命（吸血已移除）
        const killedHeal = f.heal(BALANCE.blade.waltzKillHeal);
        if (killedHeal > 0) ctx.healFx(f, killedHeal);
        // 华尔兹中击杀：迅速冲刺到另一名敌人 200px 附近（剑势由击杀统一回复）
        waltzRelocate(ctx, f);
        blocked = true;
        break;
      }
    }
    if (blocked) break;
    ctx.waltzStepFx(px, py, f.waltzDirX, f.waltzDirY);
    if (f.waltzTraveled >= b.waltzDist) break;
  }
  if (blocked || f.waltzTraveled >= b.waltzDist) {
    finishWaltzDash(ctx, f);
    // v0.22：穿墙穿刺可以经过墙体，但结束时不能停留在墙内
    if (b.waltzPierceWalls) ctx.resolveOutOfWalls(f);
  }
}

function finishWaltzDash(ctx: BladeContext, f: Fighter): void {
  f.waltzDashing = false;
  f.waltzTraveled = 0;
  if (f.bladeStacks <= 0) exitWaltz(ctx, f);
}

export function exitWaltz(ctx: BladeContext, f: Fighter): void {
  if (!f.waltzActive) return;
  f.waltzActive = false;
  f.waltzDashing = false;
  f.waltzTraveled = 0;
  f.shield = 0; // 华尔兹结束，护盾清空
  ctx.waltzEndFx(f);
}

/** 华尔兹击杀：冲刺到另一名敌人 200px 周围随机处（剑势由击杀统一回复） */
export function waltzRelocate(ctx: BladeContext, f: Fighter): void {
  const b = BALANCE.blade;
  ctx.events.emit('sfx:play', { name: 'waltz_kill', volume: 0.8 }); // v0.15：华尔兹击杀穿梭音效
  const others = ctx.fighters.filter((e) => e !== f && e.alive);
  let target: Fighter | null = null;
  let best = Infinity;
  for (const e of others) {
    const d = dist(f.x, f.y, e.x, e.y);
    if (d < best) {
      best = d;
      target = e;
    }
  }
  if (!target) return;
  const fromX = f.x;
  const fromY = f.y;
  const lo = WALL_T + BODY_R + 2;
  const hi = MAP_SIZE - WALL_T - BODY_R - 2;
  let nx = f.x;
  let ny = f.y;
  for (let i = 0; i < 24; i++) {
    const a = Math.random() * Math.PI * 2;
    nx = clamp(target.x + Math.cos(a) * b.waltzJumpRange, lo, hi);
    ny = clamp(target.y + Math.sin(a) * b.waltzJumpRange, lo, hi);
    let inside = false;
    for (const r of ctx.wallRects) {
      if (circleRectCollision(nx, ny, BODY_R, r)) {
        inside = true;
        break;
      }
    }
    if (!inside) break;
  }
  f.waltzDashing = false;
  f.waltzTraveled = 0;
  // v0.22：若目标处仍与墙体相交，改判为最近的非墙体位置
  const free = nearestFreePoint(nx, ny, BODY_R, ctx.wallRects);
  const body = f.sprite.body as Phaser.Physics.Arcade.Body;
  body.reset(free.x, free.y);
  body.setVelocity(0, 0);
  f.faceAngle = Math.atan2(target.y - free.y, target.x - free.x);
  ctx.waltzRelocateFx(fromX, fromY, free.x, free.y);
}
