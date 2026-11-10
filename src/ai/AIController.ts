import { BALANCE, CHAR } from '../config';
import { dist, segmentHitsWall, clamp } from '../core/util';
import { getNavGrid, segmentClear } from './NavGrid';
import type Phaser from 'phaser';
import type { Fighter } from '../entities/Fighter';
import type { Bullet } from '../entities/Bullet';
import type { Missile } from '../entities/Missile';
import type { Storm } from '../entities/Storm';

export interface AIControls {
  fireGunnerShot(self: Fighter, angle: number): void;
  beginGustCharge(self: Fighter): void;
  releaseGust(self: Fighter): void;
  castStorm(self: Fighter, x: number, y: number): void;
  activateGunnerSkill(self: Fighter): void;
  dashGunner(self: Fighter, angle: number): void;
  fireVolley(self: Fighter, target: Fighter): void;
  beginStrike(self: Fighter, x: number, y: number): void;
  launchStrike(self: Fighter): void;
  arcaneBlast(self: Fighter, x: number, y: number): void;
  arcaneJump(self: Fighter, x: number, y: number): void;
  arcaneAscend(self: Fighter): void;
  bladeParryCharge(self: Fighter): void;
  bladeParryRelease(self: Fighter): void;
  bladeWave(self: Fighter, angle: number): void;
  bladeWaltz(self: Fighter): void;
  bladeDash(self: Fighter, angle: number): void;
  warFire(self: Fighter, angle: number): void;
  warLaser(self: Fighter, angle: number): void;
  warBackdash(self: Fighter): void;
  warAnnihilate(self: Fighter): void;
  // 帝君
  emperorCharge(self: Fighter, x: number, y: number): void;
  emperorSwap(self: Fighter): void;
  emperorSkill(self: Fighter): void;
}

/** 帝君雄兵的 AI 感知信息 */
export interface SoldierInfo {
  x: number; y: number; state: string; owner: Fighter;
}

export interface BurnZoneRef {
  x: number; y: number; half: number; dur: number;
}

export interface AIEnv {
  player: Fighter;
  walls: Phaser.Geom.Rectangle[];
  bullets: Bullet[]; // 对 AI 而言的威胁子弹
  missiles: Missile[];
  storms: Storm[];
  burnZones: BurnZoneRef[];
  enemies: Fighter[]; // 可攻击目标
  /** 帝君雄兵（其他角色为空数组） */
  soldiers?: SoldierInfo[];
  /** 团队推车模式：火车头与自身职责（乱斗模式为 null / 不传） */
  payload?: { x: number; y: number; r: number; active: boolean; role: 'push' | 'defend' } | null;
}

type State = 'kite' | 'approach' | 'retreat' | 'strafe' | 'wander';

const THINK_CD = 0.22;

/**
 * 人机行为树（三种角色）：
 * - 通用：残血时才脱离燃烧区 / 风暴、躲子弹/导弹、被控（眩晕/轨道）时停止行动；
 *   健康时优先缠斗。团队推车中始终向火车头的推进圈靠拢（回圈途中仍可开火）。
 * - 神枪手：中远距风筝点射，充能满近身开弹幕风暴，技能期间突进拉扯。
 * - 风之女皇：拉距蓄力狂风；技能 CD 好且目标在 castRange 内时置放风暴（敌人被拉到外圈旋转）；
 *   玩家被卷入后，蓄满狂风推入暴风眼处决。
 * - 轰炸专家：与敌人保持中距；CD 好发射 3 连跟踪导弹；技能就绪时预判玩家位置
 *   进入选点状态（短暂僵直）后启动轰炸。
 * - 利剑舞者：贴近后蓄力招架积攒剑势，有剑势时用剑气远程消耗；
 *   剑势 ≥20 时开启利刃华尔兹，穿刺期间自动锁定最近敌人。
 */
export class AIController {
  private thinkT = 0;
  private state: State = 'wander';
  private stateTimer = 0;
  private strafeSign = 1;
  private wanderPoint = { x: 0, y: 0 };
  private wanderT = 0;
  private chargeUntil = 0;
  private dashTimer = 0;
  private strikeTimer = 0;
  private leadFactor = 0.55;
  /** 绕墙寻路：当前路点 / 目标点 / 重算倒计时 */
  private navPoint: { x: number; y: number } | null = null;
  private navGoal = { x: -1, y: -1 };
  private navT = 0;
  /**
   * v0.27：蓄满右键狂风引爆自己的旋风时，蓄力期间固定的瞄准点（旋风中心）。
   * 为空则按普通逻辑跟随目标预判瞄准。
   */
  private gustAimPoint: { x: number; y: number } | null = null;

  reset() {
    this.thinkT = 0;
    this.state = 'wander';
    this.stateTimer = 0;
    this.chargeUntil = 0;
    this.dashTimer = 0;
    this.strikeTimer = 0;
    this.navPoint = null;
    this.navGoal = { x: -1, y: -1 };
    this.navT = 0;
    this.gustAimPoint = null;
  }

  private setState(s: State, t: number, self: Fighter) {
    this.state = s;
    this.stateTimer = t;
    if (s === 'strafe' || s === 'kite') {
      this.strafeSign = Math.random() < 0.5 ? 1 : -1;
    }
    self.moveX = 0;
    self.moveY = 0;
  }

  private setMove(self: Fighter, angle: number, speedFactor = 1) {
    self.moveX = Math.cos(angle) * speedFactor;
    self.moveY = Math.sin(angle) * speedFactor;
  }

  /** 直线附近有威胁弹体（子弹/导弹）则垂直闪避 */
  private dodgeProjectile(self: Fighter, env: AIEnv): boolean {
    let best: { x: number; y: number; vx: number; vy: number } | null = null;
    let bestD = 1e9;
    for (const b of env.bullets) {
      if (b.dead) continue;
      const d = dist(b.sprite.x, b.sprite.y, self.x, self.y);
      if (d < 210) {
        const dot = b.vx * (self.x - b.sprite.x) + b.vy * (self.y - b.sprite.y);
        if (dot > 0 && d < bestD) {
          bestD = d;
          best = { x: b.sprite.x, y: b.sprite.y, vx: b.vx, vy: b.vy };
        }
      }
    }
    for (const m of env.missiles) {
      if (m.dead) continue;
      const d = dist(m.x, m.y, self.x, self.y);
      if (d < 260) {
        const dot = m.dirX * (self.x - m.x) + m.dirY * (self.y - m.y);
        if (dot > 0 && d < bestD) {
          bestD = d;
          best = { x: m.x, y: m.y, vx: m.dirX, vy: m.dirY };
        }
      }
    }
    if (best) {
      const toSelf = Math.atan2(self.y - best.y, self.x - best.x);
      const perp = toSelf + Math.PI / 2;
      this.setMove(self, perp, 1);
      return true;
    }
    return false;
  }

  /**
   * 四人乱斗目标选择：玩家更“有吸引力”（有效距离打 6.8 折），
   * 最近打过自己的目标再额外加权，因此人机之间会互相消耗，但仍偏向与玩家搏斗。
   */
  private pickTarget(self: Fighter, env: AIEnv): Fighter | null {
    let best: Fighter | null = null;
    let bestScore = 1e9;
    for (const e of env.enemies) {
      if (!e.alive || e === self) continue;
      const d = dist(self.x, self.y, e.x, e.y);
      let score = d * (e.isPlayer ? 0.68 : 1);
      if (e === self.lastAttacker) score *= 0.78;
      // 团队推车：优先清除火车头附近的敌人（争夺推进圈）
      const p = env.payload;
      if (p && p.active && dist(e.x, e.y, p.x, p.y) < p.r * 1.15) score *= 0.7;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  update(dt: number, self: Fighter, env: AIEnv, ctrl: AIControls, started: boolean) {
    if (!self.alive) return;
    this.navT -= dt;
    if (!started) {
      self.moveX = 0;
      self.moveY = 0;
      return;
    }

    // 被眩晕：取消蓄力与选点，无法行动
    if (self.stunTimer > 0) {
      if (self.gustCharging) {
        self.gustCharging = false;
        self.gustChargeT = 0;
      }
      this.gustAimPoint = null;
      if (self.bombTargeting) self.bombTargeting = false;
      self.moveX = 0;
      self.moveY = 0;
      return;
    }

    // 轰炸选点中：等待启动计时结束
    if (self.bombTargeting) {
      this.strikeTimer -= dt;
      if (this.strikeTimer <= 0) {
        ctrl.launchStrike(self);
      }
      return;
    }

    // v0.25：只有残血时才脱离燃烧区 / 风暴，健康时继续缠斗而不是一味躲避
    const lowHp = self.hp / self.maxHp < 0.35;
    if (lowHp) {
      for (const z of env.burnZones) {
        if (Math.abs(self.x - z.x) < z.half + 18 && Math.abs(self.y - z.y) < z.half + 18) {
          this.setMove(self, Math.atan2(self.y - z.y, self.x - z.x), 1);
          return;
        }
      }
      for (const s of env.storms) {
        // 自己 / 队友的旋风不会伤害自己，无需躲避
        if (s.active && s.owner !== self
            && !(self.teamBattle && s.owner.team === self.team)
            && dist(self.x, self.y, s.x, s.y) < s.r + 50) {
          const away = Math.atan2(self.y - s.y, self.x - s.x);
          this.setMove(self, away, 1);
          return;
        }
      }
    }

    const target = this.pickTarget(self, env);
    if (!target) {
      self.moveX = 0;
      self.moveY = 0;
      this.cartPull(self, env);
      return;
    }
    const d = dist(self.x, self.y, target.x, target.y);
    const toPlayer = Math.atan2(target.y - self.y, target.x - self.x);

    // 利刃华尔兹：无法移动，只朝最近敌人持续穿刺
    if (self.waltzActive) {
      self.moveX = 0;
      self.moveY = 0;
      if (!self.waltzDashing) ctrl.bladeDash(self, toPlayer);
      return;
    }

    // 招架蓄力中：到点松开进入招架状态
    if (self.parryCharging) {
      if (self.parryChargeT >= this.chargeUntil) ctrl.bladeParryRelease(self);
      this.setMove(self, toPlayer + Math.PI, 0.4);
      return;
    }

    this.thinkT -= dt;
    this.stateTimer -= dt;
    this.wanderT -= dt;

    // 神枪手技能期间周期性突进
    if (self.charId === CHAR.GUNNER && self.skillActive) {
      this.dashTimer -= dt;
      if (this.dashTimer <= 0 && d > 220 && d < 620) {
        this.dashTimer = 1.15;
        ctrl.dashGunner(self, toPlayer);
      }
    }

    // 脱手积攒中的狂风：到点释放（带预判；蓄力时间由 Fighter.update 自动推进）
    if (self.gustCharging) {
      // v0.27：若自己的旋风还卷着敌人，切换/保持为「蓄满引爆旋风」的固定瞄准点
      if (!this.gustAimPoint) {
        const storm = env.storms.find((s) => s.owner === self && s.active);
        const hasEnemy = !!storm && env.enemies.some(
          (e) => e.alive && e !== self && dist(e.x, e.y, storm.x, storm.y) <= storm.r,
        );
        if (storm && hasEnemy && this.stormChargeable(self, storm, env)) {
          this.gustAimPoint = { x: storm.x, y: storm.y };
          this.chargeUntil = BALANCE.wind.chargeMax;
        }
      } else if (!env.storms.some((s) => s.owner === self && s.active)) {
        this.gustAimPoint = null; // 旋风已结束，退回普通瞄准
      }

      const aimPt = this.gustAimPoint;
      if (aimPt) {
        // 狂风从蓄力起点飞出（不跟随角色），因此从起点指向旋风中心
        self.faceAngle = Math.atan2(aimPt.y - self.gustChargeY, aimPt.x - self.gustChargeX);
      } else {
        const lead = clamp(d / 400, 0, 1) * this.leadFactor;
        const aimX = target.x + target.sprite.body!.velocity.x * lead * 0.12;
        const aimY = target.y + target.sprite.body!.velocity.y * lead * 0.12;
        self.faceAngle = Math.atan2(aimY - self.y, aimX - self.x);
      }
      // v0.19 方向锁定：AI 在积攒期间持续跟踪目标，需同步刷新锁定角
      self.gustAimAngle = self.faceAngle;
      if (self.gustChargeT >= this.chargeUntil) {
        ctrl.releaseGust(self);
        this.gustAimPoint = null;
        this.setState('strafe', 0.5 + Math.random() * 0.4, self);
      }
      const perp = toPlayer + Math.PI / 2;
      this.setMove(self, perp, 0.35);
      return;
    }

    if (this.thinkT > 0) {
      this.applyStateMove(self, env, d, toPlayer, target);
      this.cartPull(self, env);
      return;
    }
    this.thinkT = THINK_CD;

    // 通用闪避
    if (this.dodgeProjectile(self, env)) return;

    const los = !segmentHitsWall(self.x, self.y, target.x, target.y, env.walls);
    if (self.charId === CHAR.GUNNER) {
      this.thinkGunner(self, env, ctrl, d, toPlayer, los);
    } else if (self.charId === CHAR.WIND) {
      this.thinkWind(self, env, ctrl, target, d, toPlayer, los);
    } else if (self.charId === CHAR.ARCANE) {
      this.thinkArcane(self, env, ctrl, target, d, toPlayer, los);
    } else if (self.charId === CHAR.BLADE) {
      this.thinkBlade(self, env, ctrl, target, d, toPlayer, los);
    } else if (self.charId === CHAR.WAR) {
      this.thinkWar(self, env, ctrl, target, d, toPlayer, los);
    } else if (self.charId === CHAR.EMPEROR) {
      this.thinkEmperor(self, env, ctrl, target, d, toPlayer, los);
    } else {
      this.thinkBomber(self, env, ctrl, target, d, toPlayer, los);
    }
    this.applyStateMove(self, env, d, toPlayer, target);
    this.cartPull(self, env);
  }

  /**
   * v0.25 团队推车：AI 更倾向待在火车头的推进圈内。
   * 只在最后一步「叠加」回圈分量，不覆盖攻击 / 走位方向，
   * 所以回圈途中依然能开火交战（不再像旧版那样一到车前就直接 return）。
   */
  private cartPull(self: Fighter, env: AIEnv) {
    const cart = env.payload;
    if (!cart || !cart.active) return;
    const dc = dist(self.x, self.y, cart.x, cart.y);
    // 已在圈心附近且与火车头之间没有墙体遮挡，保持自由走位
    const los = !segmentHitsWall(self.x, self.y, cart.x, cart.y, env.walls);
    if (dc <= cart.r * 0.55 && los) return;
    // 回圈也走寻路：中间隔着墙时沿路点绕行，而不是直线撞墙
    const toCart = this.navDir(self, env, cart.x, cart.y);
    // 圈内用较弱的拉力（仍可拉开打），出圈后全力回圈
    const pull = dc <= cart.r ? 0.62 : 1;
    self.moveX = self.moveX * (1 - pull) + Math.cos(toCart) * pull;
    self.moveY = self.moveY * (1 - pull) + Math.sin(toCart) * pull;
    const len = Math.hypot(self.moveX, self.moveY);
    if (len > 1) {
      self.moveX /= len;
      self.moveY /= len;
    }
  }

  /** 目标点之间隔墙时，用栅格 A* 取下一个路点方向；直线可达则直接朝目标 */
  private navDir(self: Fighter, env: AIEnv, tx: number, ty: number): number {
    const direct = Math.atan2(ty - self.y, tx - self.x);
    if (!segmentHitsWall(self.x, self.y, tx, ty, env.walls)) {
      this.navPoint = { x: tx, y: ty };
      return direct;
    }
    const goalMoved = dist(tx, ty, this.navGoal.x, this.navGoal.y) > 140;
    if (this.navT <= 0 || goalMoved || !this.navPoint) {
      this.navT = 0.5;
      this.navGoal = { x: tx, y: ty };
      const path = getNavGrid(env.walls).findPath(self.x, self.y, tx, ty);
      // 从最远的路点往回找：取第一个能直线走到的点，减少折线抖动
      let wp: { x: number; y: number } | null = null;
      for (let i = path.length - 1; i >= 0; i--) {
        if (segmentClear(self.x, self.y, path[i].x, path[i].y, env.walls)) {
          wp = path[i];
          break;
        }
      }
      this.navPoint = wp ?? path[0] ?? null;
    }
    const p = this.navPoint ?? { x: tx, y: ty };
    return Math.atan2(p.y - self.y, p.x - self.x);
  }

  private applyStateMove(self: Fighter, env: AIEnv, d: number, toPlayer: number, target: Fighter) {
    switch (this.state) {
      case 'approach':
        // 追击/接近一律走寻路，遇到墙体自动绕行
        this.setMove(self, this.navDir(self, env, target.x, target.y), 1);
        break;
      case 'retreat': {
        // 后撤也以“背后的落脚点”为目标寻路，避免退进墙角
        const bx = self.x - Math.cos(toPlayer) * 160;
        const by = self.y - Math.sin(toPlayer) * 160;
        this.setMove(self, this.navDir(self, env, bx, by), 1);
        break;
      }
      case 'strafe':
      case 'kite': {
        const ideal = self.charId === CHAR.GUNNER ? 420
          : self.charId === CHAR.WIND ? 350
            : self.charId === CHAR.ARCANE ? 260
              : self.charId === CHAR.BLADE ? 220
                : self.charId === CHAR.WAR ? 460
                  : self.charId === CHAR.EMPEROR
                    ? (self.emperorPolicy === 1 ? 460 : 340)
                    : 420;
        const keep = d > ideal ? 1 : -1;
        const ax = Math.cos(toPlayer) * keep;
        const ay = Math.sin(toPlayer) * keep;
        const bx = -Math.sin(toPlayer) * this.strafeSign;
        const by = Math.cos(toPlayer) * this.strafeSign;
        self.moveX = ax * 0.75 + bx * 0.65;
        self.moveY = ay * 0.75 + by * 0.65;
        break;
      }
      case 'wander': {
        if (this.wanderT <= 0) {
          this.wanderT = 1 + Math.random() * 1.6;
          this.wanderPoint = { x: target.x, y: target.y };
        }
        this.setMove(self, this.navDir(self, env, this.wanderPoint.x, this.wanderPoint.y), 0.8);
        break;
      }
    }
  }

  private thinkGunner(
    self: Fighter, env: AIEnv, ctrl: AIControls,
    d: number, toPlayer: number, los: boolean,
  ) {
    // 1) 技能：能量满且玩家进入 AoE 射程 → 开弹幕风暴
    if (!self.skillActive && self.gunnerReady && d < 340) {
      ctrl.activateGunnerSkill(self);
      this.setState('approach', 0.6, self);
      return;
    }
    // 2) 攻击：直线可见且距离合适 → 开枪（带散布噪声）
    if (los && d < 660 && self.atkCd <= 0) {
      const noise = (Math.random() - 0.5) * 0.14;
      ctrl.fireGunnerShot(self, toPlayer + noise);
      this.setState('kite', 0.4 + Math.random() * 0.5, self);
      return;
    }
    // 3) 位移策略 / 技能期间贴脸
    if (self.skillActive) {
      if (d > BALANCE.gunner.skillRadius + 60) this.setState('approach', 0.6, self);
      else if (d < 240) this.setState('retreat', 0.6, self);
      else this.setState('strafe', 0.5, self);
      return;
    }
    if (d > 560) this.setState('approach', 0.5, self);
    else if (d < 300) this.setState('retreat', 0.45, self);
    else this.setState('strafe', 0.6, self);
  }

  /**
   * v0.27：判断此刻是否值得「右键蓄满 → 命中自己的旋风引爆」。
   * - 蓄满需要 chargeMax 秒，狂风还要飞行一段距离，旋风剩余时间不足时不启动；
   * - 蓄力点固定在当前位置（不跟随角色），该点与旋风中心之间被墙挡住的狂风会撞墙消失。
   */
  private stormChargeable(self: Fighter, storm: Storm, env: AIEnv): boolean {
    if (self.atkCd > 0) return false;
    const fromX = self.gustCharging ? self.gustChargeX : self.x;
    const fromY = self.gustCharging ? self.gustChargeY : self.y;
    if (segmentHitsWall(fromX, fromY, storm.x, storm.y, env.walls)) return false;
    const travel = dist(fromX, fromY, storm.x, storm.y) / BALANCE.wind.gustSpeedMax;
    const chargeLeft = BALANCE.wind.chargeMax - (self.gustCharging ? self.gustChargeT : 0);
    return storm.dur >= chargeLeft + travel + 0.15;
  }

  private thinkWind(
    self: Fighter, env: AIEnv, ctrl: AIControls, target: Fighter,
    d: number, toPlayer: number, los: boolean,
  ) {
    const myStorm = env.storms.find((s) => s.owner === self && s.active);
    const targetInMyStorm = !!myStorm && dist(target.x, target.y, myStorm.x, myStorm.y) <= myStorm.r;
    // 旋风里是否卷着任意敌人（没有敌人时引爆只会浪费旋风）
    const caughtEnemy = !!myStorm && env.enemies.some(
      (e) => e.alive && e !== self && dist(e.x, e.y, myStorm.x, myStorm.y) <= myStorm.r,
    );

    // 0) v0.27：自己的旋风卷住敌人且来得及，就用右键蓄满并瞄准旋风中心，命中后立刻引爆
    if (myStorm && caughtEnemy && this.stormChargeable(self, myStorm, env)) {
      // beginCharge 会锁定当前朝向，所以先把脸转向旋风中心
      self.faceAngle = Math.atan2(myStorm.y - self.y, myStorm.x - self.x);
      ctrl.beginGustCharge(self);
      if (self.gustCharging) {
        this.chargeUntil = BALANCE.wind.chargeMax;
        this.gustAimPoint = { x: myStorm.x, y: myStorm.y };
        this.setMove(self, toPlayer + Math.PI / 2, 0.3);
        return;
      }
    }

    // 1) 技能：施法圆心限自身 castRange（275px）内，靠近即可放准
    if (!myStorm && self.windSkillReady && d < BALANCE.wind.castRange + 90) {
      const px = target.x;
      const py = target.y;
      ctrl.castStorm(self, px + target.sprite.body!.velocity.x * 0.1, py + target.sprite.body!.velocity.y * 0.1);
      this.setState('strafe', 0.7, self);
      return;
    }

    // 2) 目标在我方风暴中（被减速）→ 蓄满狂风
    if (targetInMyStorm) {
      if (!self.gustCharging) {
        ctrl.beginGustCharge(self);
        this.chargeUntil = 0.7;
      }
      this.setMove(self, toPlayer, 0.3);
      return;
    }

    // 3) 攻击：蓄力狂风
    if (los && d > 200 && d < 680 && !self.gustCharging && Math.random() < 0.75) {
      ctrl.beginGustCharge(self);
      this.chargeUntil = 0.35 + Math.random() * 0.65;
      return;
    }

    // 4) 位移策略
    if (d < 200) this.setState('retreat', 0.5, self);
    else if (d > 560) this.setState('approach', 0.55, self);
    else this.setState('strafe', 0.6, self);
  }

  private thinkBomber(
    self: Fighter, env: AIEnv, ctrl: AIControls, target: Fighter,
    d: number, toPlayer: number, los: boolean,
  ) {
    // 1) 技能：预判目标位置进行轰炸（主轰炸 400×400 + 追加 10 次小轰炸，太近会炸到自己）
    if (!self.bombTargeting && self.skillCd <= 0 && d < 700 && d > 320) {
      const px = target.x + target.sprite.body!.velocity.x * 0.5;
      const py = target.y + target.sprite.body!.velocity.y * 0.5;
      ctrl.beginStrike(self, px, py);
      this.strikeTimer = 0.55 + Math.random() * 0.4;
      return;
    }

    // 2) 攻击：直线可见 → 3 连制导导弹
    if (los && d < 600 && self.atkCd <= 0) {
      ctrl.fireVolley(self, target);
      this.setState('kite', 0.5 + Math.random() * 0.5, self);
      return;
    }

    // 3) 位移策略
    if (d < 300) this.setState('retreat', 0.5, self);
    else if (d > 580) this.setState('approach', 0.55, self);
    else this.setState('strafe', 0.6, self);
  }

  /**
   * 奥术天选者：平时保持中距并预判落点施放奥术排斥；
   * 血量偏低或目标就在施法范围内时开启奥术登神，蓄力期间用奥术抓取把目标拉进能量波路径。
   */
  private thinkArcane(
    self: Fighter, env: AIEnv, ctrl: AIControls, target: Fighter,
    d: number, toPlayer: number, los: boolean,
  ) {
    const b = BALANCE.arcane;
    void env;
    void toPlayer;

    if (self.arcaneCharging) {
      // 蓄力期间无法普攻；前 2s 可使用一次奥术跃迁拉开/追击
      if (!self.arcaneJumpUsed && self.arcaneChargeT <= b.jumpWindow) {
        const jx = self.x + Math.cos(toPlayer) * b.jumpRange * 0.6;
        const jy = self.y + Math.sin(toPlayer) * b.jumpRange * 0.6;
        ctrl.arcaneJump(self, jx, jy);
      }
      return;
    }

    // 登神：残血自愈 / 近身开大清场
    if (self.skillCd <= 0 &&
        (self.hp < self.maxHp * 0.62 || (d < b.rejectRange && Math.random() < 0.3))) {
      ctrl.arcaneAscend(self);
      this.setState('strafe', 0.5, self);
      return;
    }

    if (los && d < b.rejectRange && self.atkCd <= 0 && Math.random() < 0.82) {
      const vx = target.sprite.body!.velocity.x;
      const vy = target.sprite.body!.velocity.y;
      ctrl.arcaneBlast(self, target.x + vx * 0.22, target.y + vy * 0.22);
      this.setState('strafe', 0.4, self);
      return;
    }

    if (d < 180) this.setState('retreat', 0.5, self);
    else if (d > 340) this.setState('approach', 0.5, self);
    else this.setState('strafe', 0.6, self);
  }

  /**
   * 利剑舞者：近身招架积攒剑势，有剑势时远程剑气消耗，
   * 剑势 ≥20 且敌人不远时直接开启利刃华尔兹。
   */
  private thinkBlade(
    self: Fighter, env: AIEnv, ctrl: AIControls, target: Fighter,
    d: number, toPlayer: number, los: boolean,
  ) {
    void env;

    // 1) 剑势攒够 → 开华尔兹
    if (self.bladeWaltzReady && d < 520) {
      ctrl.bladeWaltz(self);
      return;
    }

    // 2) 近身且不在招架判定中 → 蓄力招架（蓄得越久减伤越高、剑势越多）
    if (d < 190 && self.parryT <= 0) {
      ctrl.bladeParryCharge(self);
      this.chargeUntil = 0.4 + Math.random() * 0.5; // v0.11：蓄力上限 1s，0.4–0.9s 松开获得中长招架
      return;
    }

    // 3) 有剑势且直线可见 → 剑气消耗
    if (los && d < 560 && self.bladeStacks > 0 && self.atkCd <= 0 && Math.random() < 0.72) {
      ctrl.bladeWave(self, toPlayer);
      this.setState('strafe', 0.4, self);
      return;
    }

    // 4) 位移策略
    if (d < 200) this.setState('retreat', 0.4, self);
    else if (d > 320) this.setState('approach', 0.55, self);
    else this.setState('strafe', 0.6, self);
  }

  /**
   * 战争机器：中远距能量弹持续压制，充能过半或敌人贴脸时开毁灭激光；
   * 残血或被近身时进入歼灭姿态，贴近时用后跃拉开并回充能。
   */
  private thinkWar(
    self: Fighter, env: AIEnv, ctrl: AIControls, target: Fighter,
    d: number, toPlayer: number, los: boolean,
  ) {
    void env;
    const w = BALANCE.war;

    // 1) 毁灭激光：充能攒到一半以上，或敌人已进入近距
    if (self.warCharge >= w.laserNeed && los &&
        (self.warCharge >= 60 || d < 420)) {
      const aimX = target.x + target.sprite.body!.velocity.x * 0.08;
      const aimY = target.y + target.sprite.body!.velocity.y * 0.08;
      ctrl.warLaser(self, Math.atan2(aimY - self.y, aimX - self.x));
      this.setState('strafe', 0.5, self);
      return;
    }

    // 2) 歼灭姿态：残血或中近距离交战
    if (self.warAnnT <= 0 && self.warAnnCd <= 0 &&
        (self.hp < self.maxHp * 0.5 || d < 460)) {
      ctrl.warAnnihilate(self);
      this.setState('strafe', 0.6, self);
      return;
    }

    // 3) 被贴身且后跃可用 → 后跃拉开（同时回充能）
    if (d < 170 && self.warBackCd <= 0) {
      self.faceAngle = toPlayer;
      ctrl.warBackdash(self);
      this.setState('kite', 0.5, self);
      return;
    }

    // 4) 攻击：直线可见 → 持续连射（带少量散布）
    if (los && d < 900 && self.atkCd <= 0) {
      ctrl.warFire(self, toPlayer + (Math.random() - 0.5) * 0.1);
      this.setState('kite', 0.4 + Math.random() * 0.4, self);
      return;
    }

    // 5) 位移策略
    if (d < 260) this.setState('retreat', 0.5, self);
    else if (d > 620) this.setState('approach', 0.55, self);
    else this.setState('strafe', 0.6, self);
  }

  /**
   * 帝君：以雄兵为主要输出手段。
   * - 空格好了就用（首次独裁会自动选方针，之后为统治）；
   * - 被贴身或残血时用易位拉开 / 换位；
   * - 敌人处于雄兵可及范围时命令全体冲锋；
   * - 方针 1 靠 600px 箭雨，保持更远距离；其余方针主动压上让雄兵咬住目标。
   */
  private thinkEmperor(
    self: Fighter, env: AIEnv, ctrl: AIControls, target: Fighter,
    d: number, toPlayer: number, los: boolean,
  ) {
    const soldiers = (env.soldiers ?? []).filter((s) => s.owner === self);

    // 1) 空格：独裁 / 统治（AI 首次会立刻确定方针）
    if (self.skillCd <= 0 && !self.emperorChoosing) {
      ctrl.emperorSkill(self);
    }

    // 2) 右键：方针 3 为护驾（敌人进入雄兵范围即旋转矛环）；其余为易位撤离 / 换位反打
    if (self.emperorSwapCd <= 0 && soldiers.length > 0) {
      if (self.emperorPolicy === 3) {
        const near = soldiers.some(
          (s) => Math.hypot(s.x - target.x, s.y - target.y) <= 260,
        );
        if (near) {
          ctrl.emperorSwap(self);
          this.setState('strafe', 0.6, self);
          return;
        }
      } else if (self.hp < self.maxHp * 0.5 || d < 140) {
        ctrl.emperorSwap(self);
        this.setState('strafe', 0.6, self);
        return;
      }
    }

    // 3) 冲锋：命令雄兵撞向预判位置（方针 1 时改为齐射）
    if (self.emperorChargeCd <= 0 && soldiers.length > 0 && los && d < 900) {
      const vx = target.sprite.body!.velocity.x;
      const vy = target.sprite.body!.velocity.y;
      ctrl.emperorCharge(
        self,
        target.x + vx * 0.18,
        target.y + vy * 0.18,
      );
    }

    // 4) 位移：方针 1 保持 600px 边缘，其余靠近让雄兵进入交战距离
    const ideal = self.emperorPolicy === 1 ? 520 : 260;
    if (d > ideal + 80) this.setState('approach', 0.5, self);
    else if (d < 120) this.setState('retreat', 0.5, self);
    else this.setState('strafe', 0.6, self);
  }
}