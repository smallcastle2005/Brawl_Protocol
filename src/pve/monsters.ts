import Phaser from 'phaser';
import { FONT_BODY } from '../core/text';
import { nearestFreePoint, pointInRects } from '../core/util';
import type { Fighter } from '../entities/Fighter';
import type { MonsterId } from './levels';
import { WestAngelBrain, WestDemonBrain } from './westBoss';

/** 怪物基础数值 */
export interface MonsterDef {
  id: MonsterId;
  name: string;
  hp: number;
  speed: number;
  /** 显示宽度（世界单位） */
  displayW: number;
  /** 碰撞半径（世界单位） */
  bodyR: number;
  /** 受击半径（世界单位；BOSS 放大判定，使受击范围更贴合庞大体型） */
  hitR?: number;
  /** 防御力：友方伤害抵抗 = 1 - def / (def + 200) */
  def: number;
}

// v0.41：梦魇镇整体难度提升，全部怪物生命 / 伤害 +50%
// v0.43：小怪生命 +25%，精英怪生命 +150%（暗影魔牛）
export const MONSTER_DEFS: Record<MonsterId, MonsterDef> = {
  'ghost-gunner': { id: 'ghost-gunner', name: '幽灵枪手', hp: 206, speed: 78, displayW: 46, bodyR: 17, def: 10 },
  'shadow-bull': { id: 'shadow-bull', name: '暗影魔牛', hp: 2325, speed: 88, displayW: 62, bodyR: 24, def: 30 },
  'heart-beast': { id: 'heart-beast', name: '心兽', hp: 10000, speed: 120, displayW: 150, bodyR: 48, hitR: 62, def: 80 },
  'west-demon': { id: 'west-demon', name: '西部恶魔', hp: 12500, speed: 92, displayW: 132, bodyR: 40, hitR: 56, def: 40 },
  'west-angel': { id: 'west-angel', name: '西部天使', hp: 12500, speed: 92, displayW: 132, bodyR: 40, hitR: 56, def: 40 },
};

/** 西部双 BOSS 技能弹（宽型直线弹，由 PveMode 统一推进） */
export interface RectShotOpts {
  x: number; y: number;
  angle: number;
  speed: number;
  /** 弹体宽度（判定与绘制都用它） */
  width: number;
  dmg: number;
  owner: Fighter;
  color: number;
  outline?: number;
  /** bar：横向条形；diamond：红黑棱形；gold：金色光弹 */
  style?: 'bar' | 'diamond' | 'gold';
  /** 穿透墙体（重生祷告） */
  passWalls?: boolean;
  /** 命中后强制把目标生命值降为 1 */
  hpOne?: boolean;
  /** 命中后的沉默时长 */
  silence?: number;
  life?: number;
}

/** 怪物伤害倍率（生命已直接写入 def.hp，伤害统一在这里放大） */
const DMG_MUL = 1.5;

/** v0.42：心兽伤害在当前基础上再翻倍（传原始基础值即可） */
const BOSS_DMG_MUL = 2;

const hit = (base: number) => Math.round(base * DMG_MUL);

/** 怪物 AI 需要从场景/PveMode 获得的服务 */
export interface MonsterHost {
  scene: Phaser.Scene;
  wallRects: Phaser.Geom.Rectangle[];
  /** 存活己方（team 0） */
  allies(): Fighter[];
  /** 离 source 最近的存活己方 */
  nearestAlly(source: Fighter): Fighter | null;
  /** 发射怪物子弹 */
  fireBullet(owner: Fighter, x: number, y: number, angle: number, dmg: number, speed: number): void;
  /** 生成一圈红色冲击波（可被墙体阻挡，命中造成伤害 + 混乱） */
  spawnShockwave(x: number, y: number, dmg: number, confuse: number): void;
  /** 暗影魔牛「黑雾」：朝指定方向喷出一团黑雾（命中造成伤害 + 混乱） */
  spawnBlackMist(owner: Fighter, x: number, y: number, angle: number, dmg: number, confuse: number): void;
  /** 对目标显示抓痕处决预警 */
  clawWarn(target: Fighter, dur: number): void;
  /** 竞技场活动区域（缩小地图） */
  arena: { x: number; y: number; w: number; h: number };
  /** 场地中线 x（西部双 BOSS 各自活动半场） */
  centerX: number;
  /** 摧毁墙体；传入 rects 时只摧毁指定墙体 */
  destroyWalls(rects?: Phaser.Geom.Rectangle[]): void;
  /** 宽型直线弹（西部 BOSS 技能） */
  spawnRectShot(opts: RectShotOpts): void;
  /** 「上天堂」：召唤圣坛并诅咒所有己方 */
  curseAllies(owner: Fighter, altars: { x: number; y: number }[]): void;
}

/* ---------------- 通用表现工具 ---------------- */

function floatLabel(scene: Phaser.Scene, x: number, y: number, text: string, color: string, dur = 0.7) {
  const t = scene.add.text(x, y, text, {
    fontFamily: FONT_BODY, fontSize: '12px', fontStyle: 'bold', color,
  }).setOrigin(0.5, 1).setDepth(930).setStroke('#120a06', 4);
  scene.tweens.add({
    targets: t, y: y - 20, alpha: 0, duration: dur * 1000,
    onComplete: () => t.destroy(),
  });
}

function flash(scene: Phaser.Scene, x: number, y: number, color: number, r = 7) {
  const c = scene.add.circle(x, y, r, color, 0.95)
    .setDepth(14).setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: c, alpha: 0, scale: 2.2, duration: 150,
    onComplete: () => c.destroy(),
  });
}

function slashFx(scene: Phaser.Scene, x: number, y: number, angle: number) {
  const g = scene.add.graphics().setDepth(14);
  g.lineStyle(3, 0xff4a3c, 0.95);
  const a = angle;
  for (let i = -1; i <= 1; i++) {
    const ox = Math.cos(a + Math.PI / 2) * i * 9;
    const oy = Math.sin(a + Math.PI / 2) * i * 9;
    const dx = Math.cos(a + 0.55) * 16;
    const dy = Math.sin(a + 0.55) * 16;
    g.lineBetween(x + ox - dx, y + oy - dy, x + ox + dx, y + oy + dy);
  }
  scene.tweens.add({
    targets: g, alpha: 0, duration: 220,
    onComplete: () => g.destroy(),
  });
}

function body(self: Fighter) {
  return self.sprite.body as Phaser.Physics.Arcade.Body;
}

/** 朝目标移动（自动归一化），返回距离 */
function chase(self: Fighter, tx: number, ty: number): number {
  const dx = tx - self.x;
  const dy = ty - self.y;
  const d = Math.hypot(dx, dy);
  if (d > 1) {
    self.moveX = dx / d;
    self.moveY = dy / d;
  } else {
    self.moveX = 0;
    self.moveY = 0;
  }
  return d;
}

function stop(self: Fighter) {
  self.moveX = 0;
  self.moveY = 0;
}

function face(self: Fighter, tx: number, ty: number) {
  self.faceAngle = Math.atan2(ty - self.y, tx - self.x);
  self.sprite.setFlipX(tx < self.x);
}

/** 单体伤害（相机轻微震动交给场景） */
function hitOne(target: Fighter, dmg: number, source: Fighter, dirX: number, dirY: number) {
  target.takeDamage(hit(dmg), { source, dirX, dirY });
}

/* ---------------- 幽灵枪手 ---------------- */

class GhostGunnerBrain {
  private cd = 0.8 + Math.random() * 0.8;
  private windup = -1;

  update(dt: number, self: Fighter, host: MonsterHost) {
    const t = host.nearestAlly(self);
    if (!t) { stop(self); return; }
    this.cd = Math.max(0, this.cd - dt);
    face(self, t.x, t.y);

    if (this.windup >= 0) {
      this.windup -= dt;
      stop(self);
      if (this.windup < 0) {
        this.shoot(self, host, t);
      }
      return;
    }

    const dx = t.x - self.x;
    const dy = t.y - self.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > 400) {
      self.moveX = dx / d;
      self.moveY = dy / d;
    } else if (d < 230) {
      self.moveX = -dx / d;
      self.moveY = -dy / d;
    } else {
      // 侧向游走，像在找射击角度
      self.moveX = (-dy / d) * 0.8;
      self.moveY = (dx / d) * 0.8;
    }

    if (this.cd <= 0 && d < 620) {
      this.windup = 0.3;
      this.cd = 1.6 + Math.random() * 0.8;
      floatLabel(host.scene, self.x, self.y - 44, '瞄准', '#ffd75e', 0.4);
      self.sprite.setTint(0xffcc88);
      host.scene.time.delayedCall(300, () => self.sprite.clearTint());
    }
  }

  private shoot(self: Fighter, host: MonsterHost, t: Fighter) {
    const a = Math.atan2(t.y - self.y, t.x - self.x);
    const gx = self.x + Math.cos(a) * 20;
    const gy = self.y - 4 + Math.sin(a) * 20;
    host.fireBullet(self, gx, gy, a, hit(9), 500);
    flash(host.scene, gx, gy, 0xffe28a, 6);
  }
}

/* ---------------- 暗影魔牛 ---------------- */

class ShadowBullBrain {
  private cd = 2 + Math.random() * 2;
  /** v0.43 精英技能：黑雾喷射 */
  private cdMist = 3 + Math.random() * 2;
  private state: 'chase' | 'mistWind' | 'windup' | 'charge' | 'rest' = 'chase';
  private t = 0;
  private dir = 0;
  private hitSet = false;

  update(dt: number, self: Fighter, host: MonsterHost) {
    const target = host.nearestAlly(self);
    if (!target) { stop(self); return; }
    this.cd = Math.max(0, this.cd - dt);
    this.cdMist = Math.max(0, this.cdMist - dt);

    if (this.state === 'mistWind') {
      this.t -= dt;
      stop(self);
      face(self, target.x, target.y);
      if (this.t <= 0) {
        this.emitMist(self, host, target);
        self.sprite.clearTint();
        this.state = 'chase';
        this.cdMist = 4.6 + Math.random() * 1.6;
        this.cd = Math.max(this.cd, 1.2);
      }
      return;
    }

    if (this.state === 'chase') {
      const d = chase(self, target.x, target.y);
      face(self, target.x, target.y);
      if (this.cdMist <= 0 && d < 640) {
        this.state = 'mistWind';
        this.t = 0.5;
        stop(self);
        face(self, target.x, target.y);
        floatLabel(host.scene, self.x, self.y - 52, '黑雾', '#b48aff', 0.6);
        self.sprite.setTint(0x8a5cff);
        return;
      }
      if (this.cd <= 0 && d < 620) {
        this.state = 'windup';
        this.t = 0.55;
        stop(self);
        floatLabel(host.scene, self.x, self.y - 52, '冲锋', '#ff8a5c', 0.6);
        self.sprite.setTint(0xff9977);
      }
      return;
    }

    if (this.state === 'windup') {
      this.t -= dt;
      stop(self);
      face(self, target.x, target.y);
      if (this.t <= 0) {
        this.dir = Math.atan2(target.y - self.y, target.x - self.x);
        this.state = 'charge';
        this.t = 0.95;
        this.hitSet = false;
        self.sprite.clearTint();
        self.selfSpeedMul = 5.6;
        flash(host.scene, self.x, self.y, 0xff5a3c, 14);
      }
      return;
    }

    if (this.state === 'charge') {
      this.t -= dt;
      self.moveX = Math.cos(this.dir);
      self.moveY = Math.sin(this.dir);
      self.sprite.setFlipX(Math.cos(this.dir) < 0);
      // 撞到己方：立刻停下并造成伤害
      if (!this.hitSet) {
        for (const a of host.allies()) {
          if (Math.hypot(a.x - self.x, a.y - self.y) < 58) {
            this.hitSet = true;
            hitOne(a, 30, self, Math.cos(this.dir), Math.sin(this.dir));
            a.applyKnock(Math.cos(this.dir) * 260, Math.sin(this.dir) * 260);
            flash(host.scene, a.x, a.y, 0xff4a3c, 12);
            host.scene.cameras.main.shake(0.01, 160);
            break;
          }
        }
      }
      const b = body(self);
      const blocked = b.blocked.left || b.blocked.right || b.blocked.up || b.blocked.down;
      if (this.t <= 0 || this.hitSet || blocked || pointInRects(self.x, self.y, host.wallRects)) {
        this.endCharge(self, host);
      }
      return;
    }

    // rest：短暂僵直后回到追击
    this.t -= dt;
    stop(self);
    if (this.t <= 0) this.state = 'chase';
  }

  private endCharge(self: Fighter, host: MonsterHost) {
    this.state = 'rest';
    this.t = 0.5;
    self.selfSpeedMul = 1;
    stop(self);
    flash(host.scene, self.x, self.y, 0xffa060, 10);
    this.cd = 3.2;
  }

  /** 黑雾：朝目标方向喷出三团扇形黑雾，命中造成伤害并陷入混乱 */
  private emitMist(self: Fighter, host: MonsterHost, target: Fighter) {
    const base = Math.atan2(target.y - self.y, target.x - self.x);
    const ox = self.x + Math.cos(base) * 30;
    const oy = self.y - 4 + Math.sin(base) * 30;
    for (const off of [-0.28, 0, 0.28]) {
      host.spawnBlackMist(self, ox, oy, base + off, hit(26), 2.2);
    }
    flash(host.scene, ox, oy, 0x8a5cff, 16);
    host.scene.cameras.main.shake(0.008, 140);
  }
}

/* ---------------- 心兽（第二阶段实体） ---------------- */

type BossAction = 'none' | 'pounceWind' | 'pounce' | 'clawWind' | 'claw' | 'roar' | 'execute';

class HeartBeastBrain {
  private action: BossAction = 'none';
  private t = 0;
  private cdPounce = 1.5;
  private cdClaw = 2;
  private cdRoar = 4;
  /** 厮杀：只在 75% / 50% / 25% 血量各施放一次 */
  private execQueue: number[] = [0.75, 0.5, 0.25];
  private execPending = 0;
  /** 防卡墙：位移停滞检测与绕行 */
  private lastX = 0;
  private lastY = 0;
  private stuckT = 0;
  private detourT = 0;
  private detourSign = 1;
  private tracked = false;
  private dir = 0;
  private hits = 0;
  private strikeT = 0;
  private target: Fighter | null = null;
  private ringG?: Phaser.GameObjects.Graphics;

  update(dt: number, self: Fighter, host: MonsterHost) {
    const target = host.nearestAlly(self);
    if (!target) { stop(self); return; }
    this.cdPounce = Math.max(0, this.cdPounce - dt);
    this.cdClaw = Math.max(0, this.cdClaw - dt);
    this.cdRoar = Math.max(0, this.cdRoar - dt);

    // 血量跨过阈值时排队一次「厮杀」（每档仅一次）
    const ratio = self.hp / self.maxHp;
    while (this.execQueue.length > 0 && ratio <= this.execQueue[0]) {
      this.execQueue.shift();
      this.execPending += 1;
    }
    this.trackStuck(dt, self);

    switch (this.action) {
      case 'none': this.decide(self, host, target); break;
      case 'pounceWind': this.pounceWind(dt, self, host); break;
      case 'pounce': this.pounce(dt, self, host); break;
      case 'clawWind': this.clawWind(dt, self, host); break;
      case 'claw': this.claw(dt, self, host); break;
      case 'roar': this.roar(dt, self, host); break;
      case 'execute': this.execute(dt, self, host); break;
    }
  }

  /** 位移停滞计数：仅在自由追击时累计，技能动作期间清零 */
  private trackStuck(dt: number, self: Fighter) {
    if (!this.tracked) {
      this.tracked = true;
      this.lastX = self.x;
      this.lastY = self.y;
      return;
    }
    if (this.action !== 'none') {
      this.stuckT = 0;
      this.detourT = 0;
      this.lastX = self.x;
      this.lastY = self.y;
      return;
    }
    const moved = Math.hypot(self.x - this.lastX, self.y - this.lastY);
    this.lastX = self.x;
    this.lastY = self.y;
    if (moved < Math.max(0.4, self.speed * 0.3 * dt)) this.stuckT += dt;
    else this.stuckT = Math.max(0, this.stuckT - dt * 2);
    this.detourT = Math.max(0, this.detourT - dt);
  }

  private decide(self: Fighter, host: MonsterHost, target: Fighter) {
    const d = Math.hypot(target.x - self.x, target.y - self.y);
    if (this.execPending > 0) {
      this.execPending -= 1;
      this.action = 'execute';
      this.t = 2.2;
      this.target = this.lowestAlly(host);
      stop(self);
      host.clawWarn(this.target ?? target, 2.2);
      floatLabel(host.scene, self.x, self.y - 70, '厮杀', '#ff3020', 1.2);
      return;
    }
    if (this.cdRoar <= 0) {
      this.action = 'roar';
      this.t = 2.2;
      stop(self);
      return;
    }
    if (d < 240 && this.cdClaw <= 0) {
      this.action = 'clawWind';
      this.t = 0.4;
      stop(self);
      face(self, target.x, target.y);
      floatLabel(host.scene, self.x, self.y - 66, '抓击', '#ffb84d', 0.6);
      return;
    }
    if (this.cdPounce <= 0 && d > 150 && d < 760) {
      this.action = 'pounceWind';
      this.t = 0.6;
      stop(self);
      face(self, target.x, target.y);
      floatLabel(host.scene, self.x, self.y - 66, '扑咬', '#ff8a5c', 0.7);
      return;
    }
    // 追击：卡墙时先沿切线绕行，长时间无位移则瞬移到附近空地脱困
    if (this.stuckT > 1.7) {
      const p = nearestFreePoint(
        self.x + (target.x - self.x) * 0.35,
        self.y + (target.y - self.y) * 0.35,
        52, host.wallRects,
      );
      if (Math.hypot(p.x - self.x, p.y - self.y) > 8) {
        self.sprite.setPosition(p.x, p.y);
        body(self).reset(p.x, p.y);
        flash(host.scene, p.x, p.y, 0x9b5cff, 18);
        this.lastX = p.x;
        this.lastY = p.y;
      }
      this.stuckT = 0;
      this.detourT = 0;
    }
    let ang = Math.atan2(target.y - self.y, target.x - self.x);
    if (this.stuckT > 0.5) {
      if (this.detourT <= 0) {
        this.detourSign = Math.random() < 0.5 ? -1 : 1;
        this.detourT = 0.9;
      }
      ang += this.detourSign * 1.1;
    }
    self.moveX = Math.cos(ang);
    self.moveY = Math.sin(ang);
    face(self, target.x, target.y);
  }

  /* --- 技能 1：扑咬 --- */
  private pounceWind(dt: number, self: Fighter, host: MonsterHost) {
    this.t -= dt;
    stop(self);
    if (this.t <= 0) {
      this.action = 'pounce';
      this.t = 0.5;
      this.target = host.nearestAlly(self);
      if (this.target) this.dir = Math.atan2(this.target.y - self.y, this.target.x - self.x);
      self.selfSpeedMul = 6.5;
      self.atkPoseT = 0.3;
      self.sprite.setTint(0xff8a6a);
      flash(host.scene, self.x, self.y, 0xff7a4c, 16);
    }
  }

  private pounce(dt: number, self: Fighter, host: MonsterHost) {
    this.t -= dt;
    self.moveX = Math.cos(this.dir);
    self.moveY = Math.sin(this.dir);
    self.sprite.setFlipX(Math.cos(this.dir) < 0);
    let hit = false;
    for (const a of host.allies()) {
      if (Math.hypot(a.x - self.x, a.y - self.y) < 64) {
        hitOne(a, 40 * BOSS_DMG_MUL, self, Math.cos(this.dir), Math.sin(this.dir));
        slashFx(host.scene, a.x, a.y, this.dir);
        hit = true;
        break;
      }
    }
    const b = body(self);
    const blocked = b.blocked.left || b.blocked.right || b.blocked.up || b.blocked.down;
    if (this.t <= 0 || hit || blocked) {
      this.action = 'none';
      self.selfSpeedMul = 1;
      self.sprite.clearTint();
      this.cdPounce = 3;
    }
  }

  /* --- 技能 2：连续抓击 5 次 --- */
  private clawWind(dt: number, self: Fighter, host: MonsterHost) {
    this.t -= dt;
    stop(self);
    if (this.t <= 0) {
      this.action = 'claw';
      this.hits = 5;
      this.strikeT = 0;
      this.dir = self.faceAngle;
    }
  }

  private claw(dt: number, self: Fighter, host: MonsterHost) {
    stop(self);
    this.strikeT -= dt;
    if (this.strikeT > 0) return;
    this.strikeT = 0.08;
    this.hits--;
    self.atkPoseT = 0.24;
    // 每次向前小幅位移
    const nx = self.x + Math.cos(this.dir) * 16;
    const ny = self.y + Math.sin(this.dir) * 16;
    self.sprite.setPosition(nx, ny);
    body(self).reset(nx, ny);
    slashFx(host.scene, nx + Math.cos(this.dir) * 26, ny + Math.sin(this.dir) * 26, this.dir);
    for (const a of host.allies()) {
      const dx = a.x - nx;
      const dy = a.y - ny;
      if (Math.hypot(dx, dy) > 96) continue;
      const ang = Math.atan2(dy, dx);
      let diff = Math.abs(ang - this.dir);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (diff < 0.85) hitOne(a, 14 * BOSS_DMG_MUL, self, Math.cos(this.dir), Math.sin(this.dir));
    }
    if (this.hits <= 0) {
      this.action = 'none';
      this.cdClaw = 4;
    }
  }

  /* --- 技能 3：怒号（蓄力后全图红色冲击波） --- */
  private roar(dt: number, self: Fighter, host: MonsterHost) {
    stop(self);
    this.t -= dt;
    self.atkPoseT = 0.24;
    if (!this.ringG) {
      this.ringG = host.scene.add.graphics().setDepth(13);
      floatLabel(host.scene, self.x, self.y - 78, '怒号 · 蓄力', '#ff4030', 1.0);
    }
    const p = 1 - Math.max(0, this.t) / 2.2;
    this.ringG.clear();
    this.ringG.lineStyle(4, 0xff3b2f, 0.35 + p * 0.55);
    this.ringG.strokeCircle(self.x, self.y, 40 + p * 150);
    this.ringG.lineStyle(2, 0xffb0a0, 0.6);
    this.ringG.strokeCircle(self.x, self.y, 26 + p * 90);
    self.sprite.setTint(0xff6a5a);
    if (this.t <= 0) {
      this.ringG.destroy();
      this.ringG = undefined;
      self.sprite.clearTint();
      host.spawnShockwave(self.x, self.y, hit(120 * BOSS_DMG_MUL), 4);
      host.scene.cameras.main.shake(0.02, 400);
      this.action = 'none';
      this.cdRoar = 9;
    }
  }

  /* --- 技能 4：厮杀（锁定低血量己方，秒杀） --- */
  private execute(dt: number, self: Fighter, host: MonsterHost) {
    this.t -= dt;
    stop(self);
    self.atkPoseT = 0.24;
    const t = this.target;
    if (!t || !t.alive) {
      this.action = 'none';
      return;
    }
    face(self, t.x, t.y);
    if (this.t <= 0) {
      const dx = Math.cos(Math.atan2(t.y - self.y, t.x - self.x));
      const dy = Math.sin(Math.atan2(t.y - self.y, t.x - self.x));
      slashFx(host.scene, t.x, t.y, self.faceAngle);
      slashFx(host.scene, t.x, t.y, self.faceAngle + 0.4);
      t.takeDamage(1, { source: self, fatal: true, dirX: dx, dirY: dy });
      host.scene.cameras.main.shake(0.03, 320);
      this.action = 'none';
    }
  }

  private lowestAlly(host: MonsterHost): Fighter | null {
    let best: Fighter | null = null;
    for (const a of host.allies()) {
      if (!best || a.hp < best.hp) best = a;
    }
    return best;
  }
}

/* ---------------- 工厂 ---------------- */

export type MonsterBrain = {
  update(dt: number, self: Fighter, host: MonsterHost): void;
  /** 释放技能绘制资源（可选） */
  dispose?(): void;
};

export function createBrain(id: MonsterId): MonsterBrain {
  if (id === 'ghost-gunner') return new GhostGunnerBrain();
  if (id === 'shadow-bull') return new ShadowBullBrain();
  if (id === 'west-demon') return new WestDemonBrain();
  if (id === 'west-angel') return new WestAngelBrain();
  return new HeartBeastBrain();
}
