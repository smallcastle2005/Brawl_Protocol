import Phaser from 'phaser';
import { BALANCE, CHAR, MODE, ModeId } from '../../../config';
import { dist, nearestFreePoint, pointInRects } from '../../../core/util';
import { BODY_R, Fighter } from '../../../entities/Fighter';
import { Bullet } from '../../../entities/Bullet';
import { Soldier } from '../../../entities/Soldier';
import type { GameEventBus } from '../../events';

/** 帝君右键易位：帝君与雄兵沿直线互换位置（途中雄兵碰触敌人造成伤害） */
export interface SwapAnim {
  emperor: Fighter;
  soldier: Soldier;
  ex0: number; ey0: number;
  sx0: number; sy0: number;
  t: number; dur: number;
  hitSet: Set<Fighter>;
}

/**
 * 帝君技能模块（v0.29）。
 *
 * 负责雄兵召唤 / AI、冲锋、易位、护驾、独裁方针与统治效果；
 * 神罚 / 箭雨 / 砸地等专属光影由表现层回调提供，音效 / 震屏走事件总线。
 * 数值与判定条件与迁移前保持一致。
 */
export interface EmperorContext {
  scene: Phaser.Scene;
  fighters: Fighter[];
  soldiers: Soldier[];
  swapAnims: SwapAnim[];
  bullets: Bullet[];
  wallRects: Phaser.Geom.Rectangle[];
  prevPos: Map<Fighter, { x: number; y: number }>;
  events: GameEventBus;
  over: boolean;
  mode: ModeId;
  player: Fighter;
  targetsFor(owner: Fighter): Fighter[];
  resolveOutOfWalls(f: Fighter): void;
  aimWorld(): { x: number; y: number };
  pix(x: number, y: number, color: number, scale?: number, life?: number): void;
  spawnRingFx(x: number, y: number): void;
  soldierPuffFx(x: number, y: number): void;
  chargeMarkFx(x: number, y: number): void;
  chargeBadFx(x: number, y: number): void;
  dominateRingFx(f: Fighter): void;
  soldierRingFx(s: Soldier): void;
  punishFx(t: Fighter, delay: number): void;
  arrowRainFx(x: number, y: number): void;
  arrowRainBurstFx(x: number, y: number): void;
  smashFx(x: number, y: number): void;
  shieldChargeFx(f: Fighter): void;
}

export function emperorMax(f: Fighter): number {
  if (f.emperorPolicy === 3) return BALANCE.emperor.p3Max;
  return BALANCE.emperor.soldierMax + Math.max(0, f.emperorCapBonus);
}

export function shieldPer(f: Fighter): number {
  return f.emperorPolicy === 3 ? BALANCE.emperor.p3Shield : BALANCE.emperor.shieldPerSoldier;
}

/** v0.33：统治冷却随所选方针变化（1=25s / 2=35s / 3=15s / 4=15s / 5=25s） */
export function emperorSkillCdMax(f: Fighter): number {
  const e = BALANCE.emperor;
  switch (f.emperorPolicy) {
    case 1: return e.p1DominateCd;
    case 2: return e.p2DominateCd;
    case 3: return e.p3DominateCd;
    case 4: return e.p4DominateCd;
    case 5: return e.p5DominateCd;
    default: return e.skillCd;
  }
}

/** 冲锋冷却随方针变化（方针 1 = 5s / 方针 2 = 2s、上限提升期间 1s / 方针 4 = 2s / 其余 3s） */
export function emperorChargeCdMax(f: Fighter): number {
  const e = BALANCE.emperor;
  if (f.emperorPolicy === 1) return e.p1ChargeCd;
  if (f.emperorPolicy === 2) {
    // v0.34：统治的上限提升持续期间，冲锋冷却再 -1s
    const capReduce = f.emperorCapBonusT > 0 ? e.p2CapChargeCdReduce : 0;
    return Math.max(0.5, e.chargeCd - e.p2ChargeCdReduce - capReduce);
  }
  if (f.emperorPolicy === 4) return Math.max(0.5, e.chargeCd - e.p4ChargeCdReduce);
  return e.chargeCd;
}

export function countSoldiers(ctx: EmperorContext, f: Fighter): number {
  let n = 0;
  for (const s of ctx.soldiers) if (!s.dead && s.owner === f && !s.temp) n++;
  return n;
}

/** 方针 5：长矛伤害 = 基础 15 + 场上每名雄兵 +5 */
export function emperorSpearDmg(ctx: EmperorContext, f: Fighter): number {
  const e = BALANCE.emperor;
  return e.p5SpearDmg + e.p5SpearPerSoldier * countSoldiers(ctx, f);
}

function soldierEnemies(ctx: EmperorContext, owner: Fighter): Fighter[] {
  return ctx.targetsFor(owner).filter((f) => f.alive && f !== owner);
}

/** 在距帝君 150px 的随机空地召唤一名雄兵（不在墙体） */
export function spawnSoldier(
  ctx: EmperorContext,
  f: Fighter,
  opts: { x?: number; y?: number; temp?: boolean } = {},
): Soldier | null {
  if (!f.alive) return null;
  if (!opts.temp && countSoldiers(ctx, f) >= emperorMax(f)) return null;
  const e = BALANCE.emperor;
  let x = f.x + e.summonRadius;
  let y = f.y;
  if (opts.x !== undefined && opts.y !== undefined) {
    x = opts.x;
    y = opts.y;
  } else {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const px = f.x + Math.cos(a) * e.summonRadius;
      const py = f.y + Math.sin(a) * e.summonRadius;
      if (!pointInRects(px, py, ctx.wallRects)) { x = px; y = py; break; }
    }
  }
  const free = nearestFreePoint(x, y, 18, ctx.wallRects, 240);
  const soldier = new Soldier(ctx.scene, f, free.x, free.y);
  soldier.temp = opts.temp === true;
  ctx.soldiers.push(soldier);
  // 获得新雄兵 → 回复对应护盾（统治临时召唤的雄兵不提供护盾、不占上限）
  if (!soldier.temp) f.shield += shieldPer(f);
  if (f.isPlayer || f === ctx.player) ctx.events.emit('sfx:play', { name: 'warn', volume: 0.5 });
  ctx.spawnRingFx(free.x, free.y);
  return soldier;
}

function removeSoldierRandom(ctx: EmperorContext, f: Fighter): void {
  const list = ctx.soldiers.filter((s) => !s.dead && s.owner === f && !s.temp);
  if (list.length === 0) return;
  const s = list[Math.floor(Math.random() * list.length)];
  const px = s.x;
  const py = s.y;
  s.destroy();
  ctx.soldierPuffFx(px, py);
}

/** 阵亡 / 离场时清空该帝君的全部雄兵 */
export function clearSoldiers(ctx: EmperorContext, f: Fighter): void {
  for (const s of ctx.soldiers) {
    if (!s.dead && s.owner === f) s.destroy();
  }
  for (let i = ctx.soldiers.length - 1; i >= 0; i--) {
    if (ctx.soldiers[i].dead) ctx.soldiers.splice(i, 1);
  }
  f.shield = 0;
}

/** 每帧：召唤、护盾同步、方针 3 重置、选方针超时 */
export function updateEmperor(ctx: EmperorContext, f: Fighter, dt: number): void {
  if (f.charId !== CHAR.EMPEROR) return;
  if (!f.alive) return;
  const e = BALANCE.emperor;

  // 独裁选方针超时：自动选择第一个候选项
  if (f.emperorChoosing) {
    f.emperorChoiceT -= dt;
    if (f.emperorChoiceT <= 0) {
      choosePolicy(ctx, 1, false);
    }
  }

  // 方针 5：帝君每 0.6s 朝鼠标方向投出一根长矛
  updateEmperorSpear(ctx, f);

  // 百万雄兵：每 20s 召唤
  f.emperorSumT += dt;
  if (f.emperorSumT >= e.soldierInterval) {
    f.emperorSumT -= e.soldierInterval;
    spawnSoldier(ctx, f);
  }

  // 方针 2 统治：上限临时 +2，最多持续 10s
  if (f.emperorCapBonusT > 0) {
    f.emperorCapBonusT = Math.max(0, f.emperorCapBonusT - dt);
    if (f.emperorCapBonusT <= 0) f.emperorCapBonus = 0;
  }

  // 方针 3：每 20s 若护盾不满则重置满
  if (f.emperorPolicy === 3) {
    f.emperorP3T += dt;
    if (f.emperorP3T >= e.p3ShieldReset) {
      f.emperorP3T -= e.p3ShieldReset;
      if (countSoldiers(ctx, f) > 0 && f.shield < e.p3Shield) {
        f.shield = e.p3Shield;
      }
    }
  } else {
    f.emperorP3T = 0;
  }

  // 护驾：护盾每损失一档，随机失去一名雄兵
  const per = shieldPer(f);
  const want = Math.min(emperorMax(f), Math.max(0, Math.ceil((f.shield - 0.01) / per)));
  let count = countSoldiers(ctx, f);
  while (count > want) {
    removeSoldierRandom(ctx, f);
    count--;
  }
}

/** 雄兵主循环：状态机、矛击、箭雨、冲锋结算 */
export function updateSoldiers(ctx: EmperorContext, dt: number): void {
  for (const s of ctx.soldiers) {
    if (s.dead) continue;
    if (!s.owner.alive) { s.destroy(); continue; }
    s.update(dt, {
      walls: ctx.wallRects,
      enemies: soldierEnemies(ctx, s.owner),
      peers: ctx.soldiers.filter((o) => o.owner === s.owner),
      hit: (t, dmg, opts) => {
        if (!t.alive) return;
        t.takeDamage(dmg, { source: s.owner });
        // 方针 2：冲锋命中的敌人被减速 20%
        if (opts?.slow) t.applySlow(opts.slow, opts.slowDur ?? BALANCE.emperor.p2SlowDur);
        // 方针 4：冲锋附带大幅击退
        if (opts?.knock) t.applyKnock((opts.dirX ?? 0) * opts.knock, (opts.dirY ?? 0) * opts.knock);
      },
      arrow: (sol, angle) => fireSoldierArrows(ctx, sol, angle),
      cone: (sol, angle) => soldierCone(ctx, sol, angle),
    });
    // 方针 4 统治的临时雄兵：冲锋结束后消失
    if (s.expireNow) {
      ctx.events.emit('fx:spark', { x: s.x, y: s.y, color: 0xffd75e, count: 12 });
      s.destroy();
    }
  }
  for (let i = ctx.soldiers.length - 1; i >= 0; i--) {
    if (ctx.soldiers[i].dead) ctx.soldiers.splice(i, 1);
  }
}

/** 方针 1：朝 angle 及其左右 30° 各射一箭（共 3 支，不穿墙） */
function fireSoldierArrows(ctx: EmperorContext, s: Soldier, angle: number): void {
  const e = BALANCE.emperor;
  for (let i = -1; i <= 1; i++) {
    const a = angle + i * e.p1ArrowSpread;
    const mx = s.x + Math.cos(a) * 18;
    const my = s.y + Math.sin(a) * 18;
    const bullet = new Bullet(
      ctx.scene, mx, my, a, s.owner,
      (x, y) => ctx.events.emit('fx:spark', { x, y, color: 0xffd75e, count: 3 }),
      (x, y) => ctx.events.emit('fx:spark', { x, y, color: 0xfff0c8, count: 3 }),
      {
        dmg: e.p1ArrowDmg,
        speed: e.p1ArrowSpeed,
        travelMax: e.p1ArrowTravel,
        vanishOnWall: true,
        countsCharge: false,
        texture: 'tex-arrow',
        scale: 2.4,
        radius: 5,
        glowTint: 0xffd75e,
      },
    );
    ctx.bullets.push(bullet);
  }
  ctx.events.emit('sfx:play', { name: 'shot', volume: 0.45 });
}

/** 方针 3：120° 扇形挥矛（范围伤害） */
function soldierCone(ctx: EmperorContext, s: Soldier, angle: number): void {
  const e = BALANCE.emperor;
  const dmg = e.spearDmg * e.p3DmgMul;
  const range = s.attackRange;
  const half = e.p3ConeAngle / 2;
  for (const t of soldierEnemies(ctx, s.owner)) {
    const d = dist(s.x, s.y, t.x, t.y);
    if (d > range + t.hitR) continue;
    const ang = Math.atan2(t.y - s.y, t.x - s.x);
    let diff = Math.abs(ang - angle);
    while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
    if (diff > half) continue;
    t.takeDamage(dmg, { source: s.owner });
  }
  ctx.events.emit('fx:spark', {
    x: s.x + Math.cos(angle) * range * 0.6,
    y: s.y + Math.sin(angle) * range * 0.6,
    color: 0xffd75e,
    count: 6,
  });
}

/** 左键·冲锋（CD 随方针变化：方针 1 = 5s / 方针 2 = 2s / 方针 4 = 1s / 其余 3s；终点限定在 800px 内且不能是墙体） */
export function castEmperorCharge(ctx: EmperorContext, f: Fighter, x: number, y: number): void {
  if (f.charId !== CHAR.EMPEROR || !f.alive || ctx.over) return;
  if (f.emperorChargeCd > 0) return;
  const list = ctx.soldiers.filter((s) => !s.dead && s.owner === f && s.state !== 'spawn');
  if (list.length === 0) return;
  const e = BALANCE.emperor;

  // v0.32：施法终点钳制在帝君 800px 范围内
  let cx = x;
  let cy = y;
  const d = dist(f.x, f.y, x, y);
  if (d > e.chargeRange) {
    const k = e.chargeRange / d;
    cx = f.x + (x - f.x) * k;
    cy = f.y + (y - f.y) * k;
  }
  // 不允许把墙体选为冲锋终点（点到墙上时本次不生效、不进入冷却）
  if (pointInRects(cx, cy, ctx.wallRects)) {
    if (f === ctx.player) ctx.chargeBadFx(cx, cy);
    return;
  }
  f.emperorChargeCd = emperorChargeCdMax(f);

  // 方针 1：雄兵不移动，朝选定位置快速齐射三次
  if (f.emperorPolicy === 1) {
    for (const s of list) {
      const ang = Math.atan2(cy - s.y, cx - s.x);
      for (let i = 0; i < e.p1Volleys; i++) {
        ctx.scene.time.delayedCall(i * e.p1VolleyGap * 1000, () => {
          if (s.dead || !f.alive) return;
          s.volley(ang, {
            walls: ctx.wallRects,
            enemies: soldierEnemies(ctx, f),
            peers: [],
            hit: () => { /* 齐射只发箭 */ },
            arrow: (sol, a) => fireSoldierArrows(ctx, sol, a),
            cone: () => { /* 不使用 */ },
          });
        });
      }
    }
  } else {
    // v0.32：并排分配落点，使雄兵冲锋后仍相隔至少 80px
    for (let i = 0; i < list.length; i++) {
      const lane = i - (list.length - 1) / 2;
      list[i].chargeTo(cx, cy, lane);
    }
    ctx.chargeMarkFx(cx, cy);
  }
  if (f === ctx.player) ctx.events.emit('sfx:play', { name: 'dash', volume: 0.6 });
}

/** 右键·易位（CD 10s）：选最近的雄兵互换位置，途中雄兵碰触敌人造成 24 伤 */
export function castEmperorSwap(ctx: EmperorContext, f: Fighter): void {
  if (f.charId !== CHAR.EMPEROR || !f.alive || ctx.over) return;
  // 方针 3：右键改为「护驾」（雄兵旋转长矛一圈）
  if (f.emperorPolicy === 3) { castEmperorGuard(ctx, f); return; }
  if (f.emperorSwapCd > 0) return;
  const e = BALANCE.emperor;
  const list = ctx.soldiers.filter((s) => !s.dead && s.owner === f);
  if (list.length === 0) return;

  // 以鼠标位置优先选择最近雄兵，否则选离帝君最近的
  let pick: Soldier | null = null;
  let best = Infinity;
  if (f === ctx.player) {
    const wp = ctx.aimWorld();
    for (const s of list) {
      const d = dist(wp.x, wp.y, s.x, s.y);
      if (d < best) { best = d; pick = s; }
    }
    if (best > 460) {
      // 鼠标附近没有雄兵时，回退为离帝君最近的雄兵
      let b2 = Infinity;
      for (const s of list) {
        const d = dist(f.x, f.y, s.x, s.y);
        if (d < b2) { b2 = d; pick = s; }
      }
    }
  } else {
    for (const s of list) {
      const d = dist(f.x, f.y, s.x, s.y);
      if (d < best) { best = d; pick = s; }
    }
  }
  if (!pick) return;

  // v0.31：方针 1「运筹帷幄」易位冷却减半
  f.emperorSwapCd = f.emperorPolicy === 1 ? e.swapCd * e.p1SwapCdMul : e.swapCd;
  const soldier = pick;
  // 目标点各自解算到非墙位置，避免互换后卡进墙体
  ctx.swapAnims.push({
    emperor: f, soldier,
    ex0: f.x, ey0: f.y,
    sx0: soldier.x, sy0: soldier.y,
    t: 0,
    dur: Math.max(0.16, dist(f.x, f.y, soldier.x, soldier.y) / e.swapSpeed),
    hitSet: new Set<Fighter>(),
  });
  // 位移期间锁定帝君自身移动
  f.dashT = 0.3;
  f.dashVX = 0;
  f.dashVY = 0;
  if (f === ctx.player) ctx.events.emit('sfx:play', { name: 'jump', volume: 0.7 });
}

/** 方针 3·右键护驾（CD 与冲锋一致）：旋转长矛一圈，造成攻击伤害的 3 倍（72 伤） */
function castEmperorGuard(ctx: EmperorContext, f: Fighter): void {
  if (f.emperorSwapCd > 0) return;
  const list = ctx.soldiers.filter((s) => !s.dead && s.owner === f && s.state !== 'spawn');
  if (list.length === 0) return;
  const e = BALANCE.emperor;
  f.emperorSwapCd = emperorChargeCdMax(f);
  for (const s of list) {
    s.playGuard();
    for (const t of soldierEnemies(ctx, f)) {
      if (!t.alive) continue;
      if (dist(s.x, s.y, t.x, t.y) <= s.attackRange + t.hitR) {
        t.takeDamage(s.attackDmgNow * e.p3GuardDmgMul, { source: f });
        ctx.events.emit('fx:spark', { x: t.x, y: t.y, color: 0xffd75e, count: 5 });
      }
    }
    ctx.events.emit('fx:spark', { x: s.x, y: s.y, color: 0xfff3c4, count: 8 });
  }
  if (f === ctx.player) ctx.events.emit('sfx:play', { name: 'storm_on', volume: 0.7 });
}

/** 易位动画推进：帝君与雄兵沿直线互换，雄兵碰触敌人结算伤害 */
export function updateSwapAnims(ctx: EmperorContext, dt: number): void {
  for (const a of [...ctx.swapAnims]) {
    // 雄兵被护盾裁减 / 帝君阵亡时立即终止，避免继续操作已销毁的精灵
    if (a.soldier.dead || !a.emperor.alive) {
      a.emperor.dashT = 0;
      const idx = ctx.swapAnims.indexOf(a);
      if (idx >= 0) ctx.swapAnims.splice(idx, 1);
      continue;
    }
    a.t += dt;
    const k = Math.min(1, a.t / a.dur);
    const e = 0.5 - 0.5 * Math.cos(Math.PI * k); // easeInOut
    const ex = a.ex0 + (a.sx0 - a.ex0) * e;
    const ey = a.ey0 + (a.sy0 - a.ey0) * e;
    const sx = a.sx0 + (a.ex0 - a.sx0) * e;
    const sy = a.sy0 + (a.ey0 - a.sy0) * e;

    a.emperor.sprite.setPosition(ex, ey);
    (a.emperor.sprite.body as Phaser.Physics.Arcade.Body | null)?.reset(ex, ey);
    ctx.prevPos.set(a.emperor, { x: ex, y: ey });
    a.soldier.x = sx;
    a.soldier.y = sy;
    a.soldier.sprite.setPosition(sx, sy);
    a.soldier.sprite.setDepth(12);

    // 雄兵碰触敌人 → 24 伤害（同一敌人只结算一次）
    for (const t of soldierEnemies(ctx, a.emperor)) {
      if (a.hitSet.has(t)) continue;
      if (dist(sx, sy, t.x, t.y) <= 16 + t.hitR) {
        a.hitSet.add(t);
        t.takeDamage(BALANCE.emperor.swapDmg, { source: a.emperor });
        ctx.events.emit('fx:spark', { x: sx, y: sy, color: 0xffd75e, count: 4 });
      }
    }

    if (k >= 1) {
      a.soldier.state = 'warn';
      a.soldier.sprite.setDepth(9);
      ctx.resolveOutOfWalls(a.emperor);
      ctx.prevPos.set(a.emperor, { x: a.emperor.x, y: a.emperor.y });
      a.emperor.dashT = 0;
      const idx = ctx.swapAnims.indexOf(a);
      if (idx >= 0) ctx.swapAnims.splice(idx, 1);
    }
  }
}

/** 空格·独裁（首次，选方针）/ 统治（其后） */
export function castEmperorSkill(ctx: EmperorContext, f: Fighter): void {
  if (f.charId !== CHAR.EMPEROR || !f.alive || ctx.over || f.silenced) return;
  const e = BALANCE.emperor;
  if (f.skillCd > 0) return;

  if (f.emperorPolicy === 0) {
    // 独裁：本场首次使用，不进入冷却——选完方针可立刻接统治
    if (f.isPlayer) {
      f.emperorChoosing = true;
      f.emperorChoiceT = e.chooseTimeout;
      ctx.events.emit('sfx:play', { name: 'storm_on', volume: 0.9 });
    } else {
      // 人机每场战斗从自己随机抽到的三条方针中选择一条
      const opts = f.emperorPolicyOptions.length > 0 ? f.emperorPolicyOptions : [1, 2, 3];
      const idx = opts[Math.floor(Math.random() * opts.length)];
      applyPolicy(ctx, f, idx);
      // 人机不进入正式冷却，但留 0.6s 间隔，避免同一帧内接连释放统治
      f.skillCd = 0.6;
    }
    return;
  }

  // 统治：全场敌人失去当前生命 20%，沉默 2s；处于雄兵攻击范围内则眩晕
  // v0.33：统治冷却由所选方针决定
  // v0.42：PVE 中统治不再造成全场伤害 / 沉默 / 眩晕，只保留方针特殊效果
  f.skillCd = emperorSkillCdMax(f);
  const targets: Fighter[] = [];
  for (const t of ctx.fighters) {
    if (!t.alive || t === f) continue;
    if (ctx.mode === MODE.PAYLOAD && t.team === f.team) continue;
    targets.push(t);
    if (ctx.mode === MODE.PVE) continue;
    const dmg = Math.ceil(Math.max(1, t.hp) * e.dominateHpRatio);
    t.takeDamage(dmg, { source: f });
    if (!t.alive) continue;
    const inRange = ctx.soldiers.some(
      (s) => !s.dead && s.owner === f && dist(s.x, s.y, t.x, t.y) <= s.attackRange,
    );
    if (inRange) t.stun(e.dominateStun);
    else t.silence(e.dominateSilence);
  }
  // 视觉：帝君脚下金色冲击波 + 对每名敌人降下神罚之矛（PVE 不降神罚）
  ctx.dominateRingFx(f);
  if (ctx.mode !== MODE.PVE) targets.forEach((t, i) => ctx.punishFx(t, i * 0.05));
  for (const s of ctx.soldiers) {
    if (s.dead || s.owner !== f) continue;
    ctx.soldierRingFx(s);
  }
  // v0.31：不同独裁方针为统治追加额外效果
  applyPolicyDominate(ctx, f, targets);
  if (f === ctx.player) {
    ctx.events.emit('sfx:play', { name: 'storm_on', volume: 0.9 });
    ctx.events.emit('fx:shake', { intensity: 0.01, duration: 300 });
  }
}

/** 统治按方针追加效果：1=箭雨 / 2=召唤+临时上限 / 3=砸地击飞 / 4=并排盾兵冲锋 / 5=长矛连发 */
function applyPolicyDominate(ctx: EmperorContext, f: Fighter, targets: Fighter[]): void {
  const e = BALANCE.emperor;
  if (f.emperorPolicy === 1) {
    for (const t of targets) emperorArrowRain(ctx, f, t.x, t.y);
  } else if (f.emperorPolicy === 2) {
    // 立即召唤 2 名雄兵，同时雄兵上限 +2（最多持续 10s）
    f.emperorCapBonus = e.p2CapBonus;
    f.emperorCapBonusT = e.p2CapBonusDur;
    for (let i = 0; i < e.p2DominateSummon; i++) spawnSoldier(ctx, f);
  } else if (f.emperorPolicy === 3) {
    // 雄兵用长矛猛砸地面：220px 内 80 伤 + 击飞 1.2s + 聚拢到雄兵周围
    emperorGroundSmash(ctx, f);
  } else if (f.emperorPolicy === 4) {
    // 朝鼠标方向召唤并排 5 名持盾雄兵，直线冲锋 500px 后消失（伤害翻倍）
    emperorShieldCharge(ctx, f, targets);
  } else if (f.emperorPolicy === 5) {
    // 10s 内朝鼠标方向连续发射 50 根长矛（基准方向 50px 内随机偏移）
    emperorSpearBarrage(ctx, f, targets);
  }
}

/** 统治·运筹帷幄：在目标位置降下箭雨，1s 后对落点造成 30 伤（离开落点可躲避） */
function emperorArrowRain(ctx: EmperorContext, f: Fighter, x: number, y: number): void {
  const e = BALANCE.emperor;
  ctx.arrowRainFx(x, y);
  ctx.scene.time.delayedCall(e.p1RainDelay * 1000, () => {
    if (ctx.over) return;
    ctx.arrowRainBurstFx(x, y);
    for (const t of ctx.targetsFor(f)) {
      if (!t.alive || t === f) continue;
      if (dist(t.x, t.y, x, y) <= e.p1RainRadius) {
        t.takeDamage(e.p1RainDmg, { source: f });
      }
    }
  });
}

/** 鼠标（玩家）/ 最近敌人（人机）方向 */
function aimAngleFor(ctx: EmperorContext, f: Fighter, targets: Fighter[] | null): number {
  if (f === ctx.player) {
    const wp = ctx.aimWorld();
    return Math.atan2(wp.y - f.y, wp.x - f.x);
  }
  let best: Fighter | null = null;
  let bestD = Infinity;
  for (const t of targets ?? ctx.targetsFor(f)) {
    if (!t.alive) continue;
    const d = dist(f.x, f.y, t.x, t.y);
    if (d < bestD) { bestD = d; best = t; }
  }
  return best ? Math.atan2(best.y - f.y, best.x - f.x) : f.faceAngle;
}

/** 方针 5：帝君每 0.6s 朝鼠标（人机朝最近敌人）投出一根长矛（15 伤 + 每名雄兵 +5） */
function updateEmperorSpear(ctx: EmperorContext, f: Fighter): void {
  if (f.emperorPolicy !== 5) { f.emperorSpearCd = 0; return; }
  if (f.emperorSpearCd > 0) return;
  const e = BALANCE.emperor;
  f.emperorSpearCd = e.p5SpearCd;
  fireEmperorSpear(ctx, f, aimAngleFor(ctx, f, null), 0, emperorSpearDmg(ctx, f));
}

/** 发射一根帝君长矛（v0.33 起不再有「敌人在雄兵范围内 +50%」加成） */
function fireEmperorSpear(ctx: EmperorContext, f: Fighter, base: number, lateral: number, dmg: number): void {
  const e = BALANCE.emperor;
  let ang = base;
  if (lateral !== 0) {
    const tx = f.x + Math.cos(base) * 400 - Math.sin(base) * lateral;
    const ty = f.y + Math.sin(base) * 400 + Math.cos(base) * lateral;
    ang = Math.atan2(ty - f.y, tx - f.x);
  }
  const mx = f.x + Math.cos(ang) * 24;
  const my = f.y + Math.sin(ang) * 24;
  ctx.bullets.push(new Bullet(
    ctx.scene, mx, my, ang, f,
    (x, y) => ctx.events.emit('fx:spark', { x, y, color: 0xffd75e, count: 3 }),
    (x, y) => ctx.events.emit('fx:spark', { x, y, color: 0xfff0c8, count: 3 }),
    {
      dmg,
      speed: e.p5SpearSpeed,
      travelMax: e.p5SpearTravel,
      vanishOnWall: true,
      countsCharge: false,
      texture: 'tex-spear',
      scale: 2.0,
      radius: 6,
      glowTint: 0xffd75e,
    },
  ));
  ctx.events.emit('sfx:play', { name: 'shot', volume: 0.35 });
}

/** 统治·特立独行：雄兵用长矛猛砸地面，220px 内 80 伤、击飞 1.2s 并聚拢到雄兵周围 */
function emperorGroundSmash(ctx: EmperorContext, f: Fighter): void {
  const list = ctx.soldiers.filter((s) => !s.dead && s.owner === f && s.state !== 'spawn');
  if (list.length === 0) {
    // 没有雄兵时直接在当前帝君位置砸地
    emperorSmashAt(ctx, f, f.x, f.y);
    return;
  }
  for (const s of list) {
    s.playSmash();
    const sx = s.x;
    const sy = s.y;
    ctx.scene.time.delayedCall(240, () => {
      if (ctx.over || s.dead) return;
      emperorSmashAt(ctx, f, sx, sy);
    });
  }
}

function emperorSmashAt(ctx: EmperorContext, f: Fighter, x: number, y: number): void {
  const e = BALANCE.emperor;
  ctx.smashFx(x, y);
  let idx = 0;
  for (const t of ctx.targetsFor(f)) {
    if (!t.alive || t === f) continue;
    if (dist(t.x, t.y, x, y) > e.p3SmashRadius) continue;
    t.takeDamage(e.p3SmashDmg, { source: f });
    if (!t.alive) continue;
    // 击飞 1.2s（无法操作）+ 聚拢到雄兵周围
    t.applyAir(e.p3SmashAir);
    const ang = (idx / 6) * Math.PI * 2 + Math.random() * 0.4;
    const pullX = x + Math.cos(ang) * 62;
    const pullY = y + Math.sin(ang) * 62;
    pullFighterTo(ctx, t, pullX, pullY, 0.4);
    idx++;
  }
  ctx.events.emit('fx:spark', { x, y, color: 0xfff3c4, count: 16 });
  ctx.events.emit('fx:shake', { intensity: 0.012, duration: 260 });
}

/** 把目标沿直线拉到指定位置（用于方针 3 统治的聚拢） */
function pullFighterTo(ctx: EmperorContext, t: Fighter, tx: number, ty: number, dur: number): void {
  const sx = t.x;
  const sy = t.y;
  const obj = { k: 0 };
  ctx.scene.tweens.add({
    targets: obj,
    k: 1,
    duration: dur * 1000,
    ease: 'CubicOut',
    onUpdate: () => {
      if (!t.alive) return;
      const nx = sx + (tx - sx) * obj.k;
      const ny = sy + (ty - sy) * obj.k;
      t.sprite.setPosition(nx, ny);
      (t.sprite.body as Phaser.Physics.Arcade.Body | null)?.reset(nx, ny);
      ctx.prevPos.set(t, { x: nx, y: ny });
    },
    onComplete: () => {
      if (!t.alive) return;
      ctx.resolveOutOfWalls(t);
      ctx.prevPos.set(t, { x: t.x, y: t.y });
    },
  });
}

/** 统治·百折不挠：朝鼠标方向召唤并排 6 名持盾雄兵，直线冲锋 800px 后消失 */
function emperorShieldCharge(ctx: EmperorContext, f: Fighter, targets: Fighter[]): void {
  const e = BALANCE.emperor;
  const base = aimAngleFor(ctx, f, targets);
  const px = -Math.sin(base);
  const py = Math.cos(base);
  const n = e.p4DominateCount;
  for (let i = 0; i < n; i++) {
    const lane = i - (n - 1) / 2;
    const sx = f.x + Math.cos(base) * 26 + px * lane * 70;
    const sy = f.y + Math.sin(base) * 26 + py * lane * 70;
    const s = spawnSoldier(ctx, f, { x: sx, y: sy, temp: true });
    if (!s) continue;
    // 直接进入冲锋状态，不提供护盾、不占上限
    s.state = 'warn';
    s.spawnT = 0;
    s.sprite.setAlpha(1);
    s.expireAfterCharge = true;
    s.chargeDmgMulOverride = e.p4DominateDmgMul;
    const destX = s.x + Math.cos(base) * e.p4DominateDist;
    const destY = s.y + Math.sin(base) * e.p4DominateDist;
    ctx.scene.time.delayedCall(120 + i * 20, () => {
      if (ctx.over || s.dead || !f.alive) return;
      s.chargeTo(destX, destY, 0);
    });
  }
  ctx.shieldChargeFx(f);
  ctx.events.emit('sfx:play', { name: 'dash', volume: 0.7 });
}

/** 统治·亲力亲为：8s 内朝鼠标方向连发 64 根长矛（基准方向 50px 内随机偏移） */
function emperorSpearBarrage(ctx: EmperorContext, f: Fighter, targets: Fighter[]): void {
  const e = BALANCE.emperor;
  const base = aimAngleFor(ctx, f, targets);
  const gap = (e.p5BarrageDur * 1000) / Math.max(1, e.p5BarrageCount - 1);
  for (let i = 0; i < e.p5BarrageCount; i++) {
    ctx.scene.time.delayedCall(i * gap, () => {
      if (ctx.over || !f.alive) return;
      const lateral = Phaser.Math.FloatBetween(-e.p5BarrageSpread, e.p5BarrageSpread);
      fireEmperorSpear(ctx, f, base, lateral, emperorSpearDmg(ctx, f));
    });
  }
}

/** 独裁：应用方针并立即整理雄兵数量 / 护盾 */
export function applyPolicy(ctx: EmperorContext, f: Fighter, idx: number): void {
  const e = BALANCE.emperor;
  f.emperorPolicy = idx;
  f.emperorChoosing = false;
  f.emperorChoiceT = 0;
  f.emperorP3T = 0;
  if (idx === 3) {
    const list = ctx.soldiers
      .filter((s) => !s.dead && s.owner === f && !s.temp)
      .sort((a, b) => dist(f.x, f.y, a.x, a.y) - dist(f.x, f.y, b.x, b.y));
    for (let i = 1; i < list.length; i++) list[i].destroy();
    for (let i = ctx.soldiers.length - 1; i >= 0; i--) {
      if (ctx.soldiers[i].dead) ctx.soldiers.splice(i, 1);
    }
    f.shield = countSoldiers(ctx, f) > 0 ? e.p3Shield : 0;
    f.emperorP3T = 0;
  }
  // v0.32：切换方针后立即刷新雄兵形象（持弓 / 精锐 / 持盾）
  for (const s of ctx.soldiers) if (!s.dead && s.owner === f) s.refreshLook();
  if (f === ctx.player) ctx.events.emit('sfx:play', { name: 'storm_on', volume: 0.8 });
}

/** 玩家点击 / 数字键 / 超时自动选择方针（索引为卡片 1~3，映射回真实方针编号） */
export function choosePolicy(ctx: EmperorContext, idx: number, _byClick: boolean): void {
  const f = ctx.player;
  if (!f.emperorChoosing) return;
  if (idx < 1 || idx > 3) return;
  // v0.32：三项为每局随机抽取的方针，映射回真实方针编号
  const opts = f.emperorPolicyOptions;
  const pick = opts[idx - 1] ?? idx;
  applyPolicy(ctx, f, pick);
}
