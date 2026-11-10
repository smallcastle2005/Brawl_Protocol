import Phaser from 'phaser';
import { BALANCE, CHAR, MAP_SIZE, WALL_T } from '../../../config';
import { clamp, dist } from '../../../core/util';
import { BODY_R, Fighter } from '../../../entities/Fighter';
import { Missile } from '../../../entities/Missile';
import type { GameEventBus } from '../../events';

export interface PendingStrike { x: number; y: number; remain: number; total: number; owner: Fighter }
export interface BurnZone { x: number; y: number; half: number; dur: number; tickT: number; owner: Fighter }
/** 主轰炸后的追加小轰炸：按时间片在 400px 圆内均匀取点 */
export interface MiniSpawn { cx: number; cy: number; left: number; timer: number; owner: Fighter }
export interface MiniBomb { x: number; y: number; remain: number; total: number; owner: Fighter }
/** 最后狂欢：终极导弹齐射（单场一次，落地前有延迟） */
export interface FinalStrike {
  x: number;
  y: number;
  remain: number;
  total: number;
  owner: Fighter;
  target: Fighter | null;
  /** 已发射的导弹数量 */
  fired: number;
  /** 下一发导弹的发射倒计时 */
  fireT: number;
  /** 每发基础伤害（总伤 ÷ 发数，已按发射时的数值锁定） */
  shotBase?: number;
  /** 每发使用的暴击倍率 */
  critMul: number;
  /** 已发射、尚未落地的导弹（0.2s 飞行时间） */
  impacts: { x: number; y: number; remain: number }[];
}

/**
 * 轰炸专家技能模块。
 *
 * 只负责战斗逻辑：导弹齐射、主轰炸预警与结算、追加小轰炸、燃烧区域、引线叠层与爆破；
 * 爆炸 / 预警视觉由表现层回调提供，音效 / 震屏走事件总线。
 * 数值与判定条件与迁移前保持一致。
 */
export interface BomberContext {
  scene: Phaser.Scene;
  fighters: Fighter[];
  missiles: Missile[];
  burnZones: BurnZone[];
  pendingStrikes: PendingStrike[];
  miniSpawns: MiniSpawn[];
  miniBombs: MiniBomb[];
  /** 最后狂欢：待落地的终极导弹 */
  finalStrikes: FinalStrike[];
  events: GameEventBus;
  over: boolean;
  started: boolean;
  getMiniCountBonus(): number;
  bumpMiniCountBonus(): void;
  pix(x: number, y: number, color: number, scale?: number, life?: number, alpha?: number): void;
  puff(x: number, y: number): void;
  missileBoom(x: number, y: number, dmg: boolean, owner: Fighter): void;
  missileTrail(x: number, y: number): void;
  strikeMissileFx(x: number, y: number, delay?: number): void;
  /** 最后狂欢：延迟期间跟随目标的锁定预警 */
  finalWarnFx(target: Fighter, delay: number): void;
  /** 最后狂欢：黑色导弹从目标左上斜向极速来袭（0.2s 落地） */
  finalMissileFx(x: number, y: number): void;
  /** 最后狂欢：向上翻涌的蘑菇云爆炸 */
  mushroomBoomFx(x: number, y: number): void;
  bigBoomFx(x: number, y: number): void;
  miniBoomFx(x: number, y: number): void;
  fuseBoomFx(x: number, y: number): void;
}

export function fireVolley(ctx: BomberContext, self: Fighter, target: Fighter): void {
  if (self.silenced) return;
  if (self.charId !== CHAR.BOMBER || !self.alive || ctx.over) return;
  if (self.atkCd > 0 || self.bombTargeting) return;
  self.atkCd = BALANCE.bomber.atkCD * self.atkCdMul;
  const b = BALANCE.bomber;
  const baseA = Math.atan2(target.y - self.y, target.x - self.x);
  for (let i = 0; i < b.missileCount; i++) {
    const jitter = (Math.random() - 0.5) * 0.5;
    const a = baseA + (i - 1) * 0.16 + jitter;
    const px = self.x + Math.cos(baseA) * (BODY_R + 16) + (Math.random() - 0.5) * 18;
    const py = self.y + Math.sin(baseA) * (BODY_R + 16) + (Math.random() - 0.5) * 18;
    const m = new Missile(
      ctx.scene, px, py, self, target,
      {
        angle: a,
        speed0: b.missileSpeed0 + (Math.random() - 0.5) * 60,
        speedMax: b.missileSpeedMax + (Math.random() - 0.5) * 110,
        accel: b.missileAccel + (Math.random() - 0.5) * 160,
        wobbleFreq: 2.5 + Math.random() * 3,
        wobbleAmp: 0.18 + Math.random() * 0.22,
        phase: Math.random() * Math.PI * 2,
      },
      (x, y, dmg) => ctx.missileBoom(x, y, dmg, self),
      (x, y) => ctx.missileTrail(x, y),
    );
    ctx.missiles.push(m);
  }
  if (self.isPlayer) ctx.events.emit('sfx:play', { name: 'missile', volume: 0.8 });
  ctx.events.emit('fx:spark', { x: self.x, y: self.y, color: 0xff9d4d, count: 5 });
}

export function beginStrike(ctx: BomberContext, self: Fighter, x: number, y: number): void {
  if (self.silenced) return;
  if (self.charId !== CHAR.BOMBER || !self.alive) return;
  if (!ctx.started || ctx.over) return;
  // 技能冷却中也可以打开轰炸地图：左键普通轰炸被禁用，但可右键锁定最后狂欢
  if (self.stunTimer > 0) return;
  self.bombTargeting = true;
  // 每次打开轰炸地图都清空上一次的终极导弹锁定
  self.finalTarget = null;
  self.finalArmed = false;
  self.bombTX = clamp(x, WALL_T + 40, MAP_SIZE - WALL_T - 40);
  self.bombTY = clamp(y, WALL_T + 40, MAP_SIZE - WALL_T - 40);
}

export function launchStrike(ctx: BomberContext, self: Fighter): void {
  if (self.silenced) return;
  if (self.charId !== CHAR.BOMBER || !self.bombTargeting) return;
  // 冷却中不能确认普通轰炸；地图保持打开，等冷却转好或改用最后狂欢
  if (self.skillCd > 0) return;
  self.bombTargeting = false;
  self.skillCd = BALANCE.bomber.skillCd;
  ctx.pendingStrikes.push({
    x: self.bombTX,
    y: self.bombTY,
    remain: BALANCE.bomber.strikeDelay,
    total: BALANCE.bomber.strikeDelay,
    owner: self,
  });
  if (self.isPlayer) ctx.events.emit('sfx:play', { name: 'warn', volume: 0.9 });
  ctx.strikeMissileFx(self.bombTX, self.bombTY); // v0.16：预警期间导弹从天而降
  const ring = ctx.scene.add.circle(self.bombTX, self.bombTY, 8, 0xff9d4d, 0.8).setDepth(14);
  ctx.scene.tweens.add({ targets: ring, radius: 70, alpha: 0, duration: 340, onComplete: () => ring.destroy() });
  ctx.events.emit('fx:spark', { x: self.bombTX, y: self.bombTY, color: 0xff9d4d, count: 5 });
}

export function strikeExplode(ctx: BomberContext, strike: PendingStrike): void {
  const b = BALANCE.bomber;
  for (const f of ctx.fighters) {
    if (!f.alive) continue;
    if (Math.abs(f.x - strike.x) < b.strikeHalf + f.hitR &&
        Math.abs(f.y - strike.y) < b.strikeHalf + f.hitR) {
      f.takeDamage(b.strikeDmg, { source: strike.owner });
      applyFuse(ctx, f, b.fuseBombMul, strike.owner);
    }
  }
  ctx.bigBoomFx(strike.x, strike.y);
  ctx.events.emit('sfx:play', { name: 'boom', volume: 0.85 });
  ctx.events.emit('fx:shake', { intensity: 0.02, duration: 420 });
  ctx.burnZones.push({
    x: strike.x, y: strike.y, half: b.strikeHalf, dur: b.burnDur, tickT: 0, owner: strike.owner,
  });
  // 追加：主轰炸后 400px 圆内随机位置小轰炸（初始 miniCount 次，每次引线爆破 +1 持续整场）
  ctx.miniSpawns.push({
    cx: strike.x, cy: strike.y,
    left: b.miniCount + ctx.getMiniCountBonus(),
    timer: 0, owner: strike.owner,
  });
}

export function updateMiniBombs(ctx: BomberContext, dt: number): void {
  const b = BALANCE.bomber;
  for (const m of [...ctx.miniSpawns]) {
    m.timer -= dt;
    if (m.timer <= 0 && m.left > 0) {
      m.left--;
      m.timer += b.miniInterval;
      // 圆环均匀分布：中心不会落在主炸 200px 内，只在 200~400px 环带
      const a = b.miniInner;
      const rad = Math.sqrt(a * a + Math.random() * (b.miniRange * b.miniRange - a * a));
      const ang = Math.random() * Math.PI * 2;
      let x = m.cx + Math.cos(ang) * rad;
      let y = m.cy + Math.sin(ang) * rad;
      x = clamp(x, WALL_T + 50, MAP_SIZE - WALL_T - 50);
      y = clamp(y, WALL_T + 50, MAP_SIZE - WALL_T - 50);
      ctx.miniBombs.push({ x, y, remain: b.miniDelay, total: b.miniDelay, owner: m.owner });
      ctx.pix(x, y, 0xffb84d, 4, 320, 0.7);
    }
    if (m.left <= 0) {
      const idx = ctx.miniSpawns.indexOf(m);
      if (idx >= 0) ctx.miniSpawns.splice(idx, 1);
    }
  }

  for (const m of [...ctx.miniBombs]) {
    m.remain -= dt;
    if (m.remain > 0) continue;
    const idx = ctx.miniBombs.indexOf(m);
    if (idx >= 0) ctx.miniBombs.splice(idx, 1);
    for (const f of ctx.fighters) {
      if (!f.alive) continue;
      if (Math.abs(f.x - m.x) < b.miniHalf + f.hitR &&
          Math.abs(f.y - m.y) < b.miniHalf + f.hitR) {
        f.takeDamage(b.miniDmg, { source: m.owner });
        applyFuse(ctx, f, b.fuseBombMul, m.owner);
      }
    }
    ctx.miniBoomFx(m.x, m.y);
    ctx.events.emit('sfx:play', { name: 'boom', volume: 0.15 }); // v0.15：小轰炸音效进一步压低，避免连爆嘈杂
    ctx.burnZones.push({
      x: m.x, y: m.y, half: b.miniBurnHalf, dur: b.burnDur, tickT: 0, owner: m.owner,
    });
  }
}

export function updateBurnZones(ctx: BomberContext, dt: number): void {
  // 同一帧内已被引燃结算过的目标：重叠区域不重复受伤
  const ticked = new Set<Fighter>();
  for (const z of [...ctx.burnZones]) {
    z.dur -= dt;
    z.tickT -= dt;
    if (z.tickT <= 0) {
      z.tickT += BALANCE.bomber.burnTick;
      for (const f of ctx.fighters) {
        if (!f.alive || f === z.owner || ticked.has(f)) continue;
        if (Math.abs(f.x - z.x) < z.half + f.hitR && Math.abs(f.y - z.y) < z.half + f.hitR) {
          f.takeDamage(BALANCE.bomber.burnDmg, { source: z.owner });
          applyFuse(ctx, f, 1, z.owner);
          ticked.add(f);
        }
      }
      for (let i = 0; i < 3; i++) {
        ctx.pix(
          z.x + (Math.random() - 0.5) * z.half * 2,
          z.y + (Math.random() - 0.5) * z.half * 2,
          Math.random() < 0.5 ? 0xe0702a : 0xf2a03c, 3, 450, 0.85,
        );
      }
    }
    if (z.dur <= 0) {
      const idx = ctx.burnZones.indexOf(z);
      if (idx >= 0) ctx.burnZones.splice(idx, 1);
      ctx.puff(z.x, z.y);
    }
  }
}

/** 每次命中叠层并续期；叠满 fuseMaxStacks 层触发爆破（v0.19：不施加给自身与队友） */
export function applyFuse(ctx: BomberContext, f: Fighter, layers: number, owner: Fighter): void {
  if (!f.alive || layers <= 0) return;
  if (f === owner || (f.teamBattle && f.team === owner.team)) return;
  const b = BALANCE.bomber;
  f.fuseStacks += layers;
  f.fuseTimer = b.fuseDur;
  if (f.fuseStacks >= b.fuseMaxStacks) blastFuse(ctx, f, owner);
}

/** 引线爆破：自身及 200px 内单位各受 20 伤，波及范围不再传染引线（避免连锁套娃） */
function blastFuse(ctx: BomberContext, victim: Fighter, owner: Fighter, chain = 0): void {
  const b = BALANCE.bomber;
  const x = victim.x;
  const y = victim.y;
  // 场上仅有一个敌人时，本次引线爆破直接连炸两次（小轰炸次数也累计两次）
  const soloEnemy = chain === 0
    && ctx.fighters.filter((e) => e.alive && e !== owner
      && !(e.teamBattle && e.team === owner.team)).length === 1;
  victim.fuseStacks = 0;
  victim.fuseTimer = 0;
  ctx.bumpMiniCountBonus(); // v0.13：引线爆破使后续小轰炸 +1（持续整场）
  // 点火！：专属装备让每次引线爆破回复 4 点生命并永久叠加暴击率 / 暴击伤害
  if (owner.bomberEquipUnlocked && owner.alive) {
    owner.heal(b.fuseHeal);
    if (owner.critChance < 1) {
      owner.critChance = Math.min(1, owner.critChance + b.fuseCritStep);
    } else {
      owner.critDmgMul += b.fuseCritDmgStep;
    }
    // v0.43：每次引线爆破额外减少特殊技能冷却 0.5s
    owner.skillCd = Math.max(0, owner.skillCd - b.fuseCdRefund);
    ctx.pix(owner.x, owner.y - BODY_R, 0xffd76a, 1.2, 380);
  }
  ctx.events.emit('sfx:play', { name: 'fuse', volume: 0.85 });
  ctx.fuseBoomFx(x, y);
  // 自身受到爆破伤害
  victim.takeDamage(b.fuseBlastDmg, { source: owner });
  // 波及周围单位：仅造成伤害，不再对其他敌人施加引线（防止反复套娃）
  for (const e of ctx.fighters) {
    if (!e.alive || e === victim) continue;
    if (dist(e.x, e.y, x, y) <= b.fuseBlastR + e.hitR) {
      e.takeDamage(b.fuseBlastDmg, { source: owner });
    }
  }
  if (soloEnemy) blastFuse(ctx, victim, owner, 1);
}

/* ---------------- 最后狂欢！（专属装备 PVE 技能） ---------------- */

/**
 * 小地图右键：锁定点击位置附近的单个敌方目标。
 * 与普通轰炸共用同一张轰炸地图，右键只负责锁定，空格负责确认。
 */
export function lockFinalTarget(ctx: BomberContext, self: Fighter, x: number, y: number): void {
  if (!self.bombTargeting) return;
  if (!self.bomberEquipUnlocked || self.finalUsed) return;
  let best: Fighter | null = null;
  let bestD = Infinity;
  for (const f of ctx.fighters) {
    if (!f.alive || f === self) continue;
    if (f.teamBattle && f.team === self.team) continue;
    const d = dist(f.x, f.y, x, y);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  self.finalTarget = bestD <= BALANCE.bomber.finalLockR ? best : null;
  // 只有成功锁定才把空格切换为「发射终极导弹」
  if (self.finalTarget) {
    self.finalArmed = true;
    if (self.isPlayer) ctx.events.emit('sfx:play', { name: 'charge_full', volume: 0.5 });
  }
}

/** 清除终极导弹锁定（左键改选轰炸点 / ESC 取消时调用） */
export function clearFinalTarget(self: Fighter): void {
  self.finalTarget = null;
  self.finalArmed = false;
}

/** 空格确认：已锁定终极导弹目标则发射导弹 */
export function launchFinalStrike(ctx: BomberContext, self: Fighter): void {
  if (self.silenced || !self.bombTargeting || !self.finalArmed) return;
  const target = self.finalTarget;
  if (!target || !target.alive) return;
  const b = BALANCE.bomber;
  self.bombTargeting = false;
  self.finalTarget = null;
  self.finalArmed = false;
  self.finalUsed = true;
  self.skillCd = Math.max(self.skillCd, 0.6);
  ctx.finalStrikes.push({
    x: target.x,
    y: target.y,
    remain: b.finalDelay,
    total: b.finalDelay,
    owner: self,
    target,
    fired: 0,
    fireT: 0,
    critMul: self.critChance * 2 + self.critDmgMul,
    impacts: [],
  });
  // 延迟期间只显示跟随目标的锁定预警，导弹在落地前才逐发出现
  ctx.finalWarnFx(target, b.finalDelay);
  if (self.isPlayer) ctx.events.emit('sfx:play', { name: 'warn', volume: 1 });
  ctx.events.emit('fx:shake', { intensity: 0.012, duration: 320 });
}

export function updateFinalStrikes(ctx: BomberContext, dt: number): void {
  const b = BALANCE.bomber;
  for (let i = ctx.finalStrikes.length - 1; i >= 0; i--) {
    const s = ctx.finalStrikes[i];
    // 先等待终极导弹的落地延迟
    if (s.shotBase === undefined) {
      s.remain -= dt;
      if (s.remain > 0) continue;
      // 延迟结束：锁定总伤，拆成十发导弹（每发 1/10）
      const mini = b.miniCount + ctx.getMiniCountBonus();
      s.shotBase = (b.finalDmgPerMini * mini) / b.finalVolley;
      s.critMul = s.owner.critChance * 2 + s.owner.critDmgMul;
      s.fireT = 0;
    }
    // 连续发射：每发导弹飞向目标当前位置
    s.fireT -= dt;
    while (s.fired < b.finalVolley && s.fireT <= 0) {
      s.fired += 1;
      s.fireT += b.finalShotInterval;
      const t = s.target;
      if (t && t.alive) {
        s.x = t.x;
        s.y = t.y;
      }
      ctx.finalMissileFx(s.x, s.y);
      s.impacts.push({ x: s.x, y: s.y, remain: 0.2 });
    }
    // 导弹落地：逐发结算伤害与爆炸表现
    for (let k = s.impacts.length - 1; k >= 0; k--) {
      const imp = s.impacts[k];
      imp.remain -= dt;
      if (imp.remain > 0) continue;
      s.impacts.splice(k, 1);
      ctx.mushroomBoomFx(imp.x, imp.y);
      ctx.events.emit('sfx:play', { name: 'boom', volume: 0.9 });
      ctx.events.emit('fx:shake', { intensity: 0.014, duration: 220 });
      for (let j = 0; j < 8; j++) {
        const a = Math.random() * Math.PI * 2;
        ctx.pix(imp.x + Math.cos(a) * Math.random() * 80,
          imp.y + Math.sin(a) * Math.random() * 80,
          0xffb347, 1.2 + Math.random(), 420);
      }
      const t = s.target;
      if (t && t.alive && s.shotBase !== undefined) {
        t.takeDamage(s.shotBase, {
          source: s.owner, forceCrit: true, forceCritMul: s.critMul,
        });
      }
    }
    if (s.fired >= b.finalVolley && s.impacts.length === 0) {
      ctx.finalStrikes.splice(i, 1);
    }
  }
}
