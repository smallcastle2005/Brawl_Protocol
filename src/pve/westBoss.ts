import Phaser from 'phaser';
import type { Fighter } from '../entities/Fighter';
import type { MonsterHost } from './monsters';

/** 西部双 BOSS：技能公共小工具（与 monsters.ts 内部实现保持同样的表现风格） */

function stop(self: Fighter) {
  self.moveX = 0;
  self.moveY = 0;
}

function face(self: Fighter, x: number, y: number) {
  const a = Math.atan2(y - self.y, x - self.x);
  self.faceAngle = a;
  self.sprite.setFlipX(Math.cos(a) < 0);
}

function flash(scene: Phaser.Scene, x: number, y: number, color: number, n: number) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 6 + Math.random() * 26;
    const dot = scene.add.circle(x + Math.cos(a) * r, y + Math.sin(a) * r, 2 + Math.random() * 3, color, 0.9)
      .setDepth(14);
    scene.tweens.add({
      targets: dot, alpha: 0, scale: 0.3, duration: 220 + Math.random() * 200,
      onComplete: () => dot.destroy(),
    });
  }
}

function label(scene: Phaser.Scene, x: number, y: number, text: string, color: string, dur: number) {
  const t = scene.add.text(x, y, text, {
    fontFamily: 'monospace', fontSize: '20px', color, stroke: '#10131b', strokeThickness: 5,
  }).setOrigin(0.5).setDepth(60);
  scene.tweens.add({
    targets: t, y: y - 26, alpha: 0, duration: dur * 1000,
    onComplete: () => t.destroy(),
  });
}

/** 蓄力 / 出招动作（让方向贴图切到 atk1/atk2） */
function castPose(self: Fighter) {
  self.atkPoseT = Math.max(self.atkPoseT, 0.2);
}

/** 追击：保持在目标 260~520px 的距离内，卡墙时绕行 */
function chase(self: Fighter, host: MonsterHost, target: Fighter, dt: number,
  lastX: number, lastY: number, stuck: { t: number; detour: number; sign: number }) {
  const d = Math.hypot(target.x - self.x, target.y - self.y);
  face(self, target.x, target.y);
  if (d < 250) {
    const a = Math.atan2(self.y - target.y, self.x - target.x);
    self.moveX = Math.cos(a) * 0.8;
    self.moveY = Math.sin(a) * 0.8;
    return d;
  }
  if (d < 520) {
    // 侧向绕圈，避免贴脸
    const a = Math.atan2(target.y - self.y, target.x - self.x) + Math.PI / 2;
    self.moveX = Math.cos(a) * 0.55;
    self.moveY = Math.sin(a) * 0.55;
    return d;
  }
  const moved = Math.hypot(self.x - lastX, self.y - lastY);
  if (moved < Math.max(0.4, self.speed * 0.3 * dt)) stuck.t += dt;
  else stuck.t = Math.max(0, stuck.t - dt * 2);
  stuck.detour = Math.max(0, stuck.detour - dt);
  let ang = Math.atan2(target.y - self.y, target.x - self.x);
  if (stuck.t > 0.6) {
    if (stuck.detour <= 0) {
      stuck.sign = Math.random() < 0.5 ? -1 : 1;
      stuck.detour = 0.9;
    }
    ang += stuck.sign * 1.15;
  }
  self.moveX = Math.cos(ang);
  self.moveY = Math.sin(ang);
  return d;
}

/* ================================================================
 * 西部恶魔
 * 技能：缠身熔岩 / 深渊火枪 / 重生炼狱 / 下地狱（半血）
 * ================================================================ */

interface WarnCircle { x: number; y: number; r: number; t: number; total: number }
interface LavaZone { x: number; y: number; r: number; t: number; tick: number }
interface PendingShot { t: number; fire: () => void }

export class WestDemonBrain {
  private mode: 'idle' | 'lava' | 'volley' | 'purgatory' | 'inferno' = 'idle';
  private t = 0;
  private cd1 = 4;
  private cd2 = 8;
  private cd3 = 11;
  /** 出招频率倍率（下地狱后 0.833 → 频率 +20%） */
  private freq = 1;
  private infernoDone = false;
  private warnings: WarnCircle[] = [];
  private lavas: LavaZone[] = [];
  private shots: PendingShot[] = [];
  private g?: Phaser.GameObjects.Graphics;
  private target: Fighter | null = null;
  private lockAng = 0;
  private lastX = 0;
  private lastY = 0;
  private stuck = { t: 0, detour: 0, sign: 1 };
  /** 深渊火枪：黑洞位置 */
  private holes: { x: number; y: number }[] = [];
  /** 重生炼狱：施法原点（预警射线起点） */
  private castX = 0;
  private castY = 0;

  update(dt: number, self: Fighter, host: MonsterHost) {
    if (!self.alive) return;
    if (!this.g) this.g = host.scene.add.graphics().setDepth(12);
    this.cd1 = Math.max(0, this.cd1 - dt);
    this.cd2 = Math.max(0, this.cd2 - dt);
    this.cd3 = Math.max(0, this.cd3 - dt);
    this.tickShots(dt);
    this.tickZones(dt);
    this.tickLava(dt, self, host);

    // 半血：下地狱（仅一次，只烧毁地图中央的纵向墙体）
    if (!this.infernoDone && self.hp <= self.maxHp * 0.5) {
      this.infernoDone = true;
      this.mode = 'inferno';
      this.t = 0;
      this.warnings = [];
      this.shots = [];
      this.holes = [];
      stop(self);
      this.infernoWalls = host.wallRects.filter((r) => r.x >= host.arena.x - 1
        && r.x + r.width <= host.arena.x + host.arena.w + 1
        && r.y >= host.arena.y - 1
        && r.y + r.height <= host.arena.y + host.arena.h + 1);
      this.setInfernoTargets(
        this.infernoWalls.map((r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 })),
        self.x, self.y,
      );
      label(host.scene, self.x, self.y - 90, '下地狱！', '#ff3b2f', 1.2);
      host.scene.cameras.main.shake(0.02, 500);
    }

    switch (this.mode) {
      case 'idle': this.idle(dt, self, host); break;
      case 'lava': this.lavaSkill(dt, self, host); break;
      case 'volley': this.volleySkill(dt, self, host); break;
      case 'purgatory': this.purgatory(dt, self, host); break;
      case 'inferno': this.inferno(dt, self, host); break;
    }
    this.draw();
  }

  private idle(dt: number, self: Fighter, host: MonsterHost) {
    const target = host.nearestAlly(self);
    // 无论角色在哪一侧，都按冷却固定出招；有目标时仅用于走位
    if (target) {
      chase(self, host, target, dt, this.lastX, this.lastY, this.stuck);
    } else {
      stop(self);
    }
    this.lastX = self.x;
    this.lastY = self.y;
    const allies = host.allies();
    if (allies.length === 0) return;
    const ready: string[] = [];
    if (this.cd1 <= 0) ready.push('lava');
    if (this.cd2 <= 0) ready.push('volley');
    if (this.cd3 <= 0) ready.push('purgatory');
    if (ready.length === 0) return;
    const pick = ready[Math.floor(Math.random() * ready.length)];
    stop(self);
    this.t = 0;
    if (pick === 'lava') {
      this.mode = 'lava';
      this.cd1 = 10 * this.freq;
      label(host.scene, self.x, self.y - 84, '缠身熔岩', '#ff5a2b', 1.0);
      for (const a of allies) {
        this.warnings.push({ x: a.x, y: a.y, r: 100, t: 1.5, total: 1.5 });
      }
    } else if (pick === 'volley') {
      this.mode = 'volley';
      this.cd2 = 12 * this.freq;
      this.holes = [];
      const { x, y, h } = host.arena;
      for (let i = 0; i < 5; i++) {
        // 黑洞纵向位置随机（每段内随机偏移，避免重叠）
        this.holes.push({ x: x + 36, y: y + (h * (i + 0.15 + Math.random() * 0.7)) / 5 });
      }
      // 0.8s 后每 1s 一轮，共 5 轮
      for (let k = 0; k < 5; k++) {
        this.shots.push({
          t: 0.8 + k * 1.0,
          fire: () => {
            for (const hole of this.holes) {
              host.spawnRectShot({
                x: hole.x, y: hole.y, angle: 0, speed: 500, width: 75, dmg: 200,
                owner: self, color: 0x9a1030, outline: 0xff3b3b, style: 'bar',
              });
            }
            flash(host.scene, x + 40, y + h / 2, 0xff3b3b, 6);
            host.scene.cameras.main.shake(0.006, 120);
          },
        });
      }
      label(host.scene, self.x, self.y - 84, '深渊火枪', '#ff3b3b', 1.0);
    } else {
      this.mode = 'purgatory';
      this.cd3 = 14 * this.freq;
      this.target = allies[Math.floor(Math.random() * allies.length)];
      // 2.5s 内 40 发
      for (let i = 0; i < 40; i++) {
        this.shots.push({
          t: (i * 2.5) / 40,
          fire: () => {
            const t = this.target;
            if (!t || !t.alive) return;
            const ang = Math.atan2(t.y - self.y, t.x - self.x);
            host.spawnRectShot({
              x: self.x + Math.cos(ang) * 40, y: self.y + Math.sin(ang) * 40,
              angle: ang, speed: 1000, width: 50, dmg: 80,
              owner: self, color: 0xff2b2b, outline: 0x101010, style: 'diamond',
            });
            castPose(self);
            flash(host.scene, self.x + Math.cos(ang) * 44, self.y + Math.sin(ang) * 44, 0xff5a3c, 3);
          },
        });
      }
      label(host.scene, self.x, self.y - 84, '重生炼狱', '#ff2b2b', 1.1);
    }
  }

  private lavaSkill(dt: number, self: Fighter, host: MonsterHost) {
    this.t += dt;
    stop(self);
    castPose(self);
    if (this.t >= 1.5) {
      for (const w of this.warnings) {
        this.lavas.push({ x: w.x, y: w.y, r: w.r, t: 4, tick: 0 });
        flash(host.scene, w.x, w.y, 0xff5a1e, 12);
      }
      this.warnings = [];
      host.scene.cameras.main.shake(0.012, 260);
      // 熔岩会自行持续 4s，BOSS 不必留在施法状态
      this.mode = 'idle';
      this.t = 0;
    }
    void host;
  }

  private volleySkill(dt: number, self: Fighter, host: MonsterHost) {
    this.t += dt;
    stop(self);
    castPose(self);
    if (this.t > 5.1) {
      this.mode = 'idle';
      this.t = 0;
      this.holes = [];
    }
    void host;
  }

  private purgatory(dt: number, self: Fighter, host: MonsterHost) {
    this.t += dt;
    stop(self);
    castPose(self);
    const t = this.target;
    if (!t || !t.alive) {
      this.mode = 'idle';
      this.t = 0;
      return;
    }
    // 记录锁定方向，供预警绘制使用
    this.castX = self.x;
    this.castY = self.y;
    face(self, t.x, t.y);
    if (this.t > 2.5) {
      this.mode = 'idle';
      this.t = 0;
      this.target = null;
    }
    void host;
  }

  private inferno(dt: number, self: Fighter, host: MonsterHost) {
    this.t += dt;
    stop(self);
    castPose(self);
    if (this.t >= 1) {
      // 只摧毁中央纵向墙体，四周外墙保留；烧毁瞬间在墙体周围产生爆炸
      if (this.infernoWalls.length > 0) {
        const hitSet = new Set<Fighter>();
        for (const w of this.infernoWalls) {
          const cx = w.x + w.width / 2;
          const cy = w.y + w.height / 2;
          flash(host.scene, cx, cy, 0xff5a1e, 18);
          for (const a of host.allies()) {
            if (!a.alive || hitSet.has(a)) continue;
            if (Math.hypot(a.x - cx, a.y - cy) > 160 + a.hitR) continue;
            hitSet.add(a);
            a.takeDamage(200, { source: self });
          }
        }
        host.destroyWalls(this.infernoWalls);
      }
      host.scene.cameras.main.shake(0.03, 600);
      flash(host.scene, self.x, self.y, 0xff2b00, 30);
      // 伤害 +20%、移速 +100%、出招频率 +20%
      self.dmgMul *= 1.2;
      self.selfSpeedMul = 2;
      this.freq = 1 / 1.2;
      this.mode = 'idle';
      this.t = 0;
    }
  }

  private tickShots(dt: number) {
    if (this.shots.length === 0) return;
    for (const s of [...this.shots]) {
      s.t -= dt;
      if (s.t <= 0) {
        const i = this.shots.indexOf(s);
        if (i >= 0) this.shots.splice(i, 1);
        s.fire();
      }
    }
  }

  private tickZones(dt: number) {
    // 仅推进预警动画，不在这里移除；由熔岩结算统一清空
    for (const w of this.warnings) w.t = Math.max(0, w.t - dt);
  }

  private tickLava(dt: number, self: Fighter, host: MonsterHost) {
    for (const l of [...this.lavas]) {
      l.t -= dt;
      l.tick += dt;
      const doHit = l.tick >= 0.5;
      for (const a of host.allies()) {
        if (!a.alive) continue;
        if (Math.hypot(a.x - l.x, a.y - l.y) > l.r + a.hitR) continue;
        a.silence(0.25);
        a.applySlow(0.5, 0.3);
        if (doHit) a.takeDamage(25, { source: self });
      }
      if (doHit) l.tick -= 0.5;
      if (l.t <= 0) this.lavas.splice(this.lavas.indexOf(l), 1);
    }
  }

  private draw() {
    const g = this.g;
    if (!g) return;
    g.clear();
    // 熔岩预警
    for (const w of this.warnings) {
      const p = 1 - w.t / w.total;
      g.lineStyle(4, 0xff2b2b, 0.4 + p * 0.5);
      g.strokeCircle(w.x, w.y, w.r);
      g.fillStyle(0xff2b2b, 0.10 + p * 0.14);
      g.fillCircle(w.x, w.y, w.r);
      g.lineStyle(2, 0xffd0a0, 0.5);
      g.strokeCircle(w.x, w.y, w.r * (0.25 + p * 0.7));
    }
    // 熔岩本体
    for (const l of this.lavas) {
      const k = Math.min(1, l.t / 4);
      g.fillStyle(0xff4a12, 0.28 * k + 0.12);
      g.fillCircle(l.x, l.y, l.r);
      g.lineStyle(3, 0xffb04a, 0.55);
      g.strokeCircle(l.x, l.y, l.r);
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7 + l.tick * 2;
        g.fillStyle(0xffd27a, 0.6);
        g.fillCircle(l.x + Math.cos(a) * l.r * 0.5, l.y + Math.sin(a) * l.r * 0.5, 5);
      }
    }
    // 深渊火枪：黑洞与横轴预警
    if (this.mode === 'volley') {
      const warn = Math.min(1, this.t / 0.8);
      for (const h of this.holes) {
        if (this.t < 0.8) {
          g.fillStyle(0xff2b2b, 0.10 + warn * 0.18);
          g.fillRect(h.x, h.y - 37.5, 1600, 75);
          g.lineStyle(2, 0xff5a5a, 0.5 + warn * 0.4);
          g.lineBetween(h.x, h.y, h.x + 1600, h.y);
        }
        g.fillStyle(0x05050a, 0.95);
        g.fillCircle(h.x, h.y, 26);
        g.lineStyle(3, 0x9a1030, 0.9);
        g.strokeCircle(h.x, h.y, 26);
      }
    }
    // 重生炼狱：锁定标记（瞄准射线 + 扩散预警，提示射击方向）
    if (this.mode === 'purgatory' && this.target) {
      const t = this.target;
      const p = Math.min(1, this.t / 0.4);
      g.lineStyle(6, 0xff2b2b, 0.22 + p * 0.35);
      g.lineBetween(this.castX, this.castY, t.x, t.y);
      g.lineStyle(2, 0xffd27a, 0.45 + p * 0.4);
      g.lineBetween(this.castX, this.castY, t.x, t.y);
      g.fillStyle(0xff2b2b, 0.10 + p * 0.10);
      g.fillCircle(t.x, t.y, 90);
      g.lineStyle(3, 0xff2b2b, 0.8);
      g.strokeCircle(t.x, t.y, 34 + Math.sin(this.t * 18) * 4);
      g.lineStyle(2, 0xff8080, 0.6);
      g.strokeCircle(t.x, t.y, 60);
      g.strokeCircle(t.x, t.y, 90 * (0.4 + p * 0.6));
    }
    // 下地狱：火焰射向所有墙体
    if (this.mode === 'inferno') {
      for (const r of this.wallsSnapshot) {
        g.lineStyle(6 + Math.random() * 6, 0xff5a12, 0.8);
        g.lineBetween(this.originX, this.originY, r.x, r.y);
        g.lineStyle(2, 0xffd27a, 0.8);
        g.lineBetween(this.originX, this.originY, r.x, r.y);
      }
    }
  }

  private wallsSnapshot: { x: number; y: number }[] = [];
  /** 下地狱要烧毁的中央墙体 */
  private infernoWalls: Phaser.Geom.Rectangle[] = [];
  private originX = 0;
  private originY = 0;

  /** 记录下地狱的火焰目标（由 PveMode 在触发时调用） */
  setInfernoTargets(walls: { x: number; y: number }[], x: number, y: number) {
    this.wallsSnapshot = walls;
    this.originX = x;
    this.originY = y;
  }

  dispose() {
    this.g?.destroy();
    this.g = undefined;
    this.warnings = [];
    this.lavas = [];
    this.holes = [];
    this.shots = [];
  }
}

/* ================================================================
 * 西部天使
 * 技能：圣洁审判 / 天堂长枪 / 重生祷告 / 上天堂（半血）
 * ================================================================ */

export class WestAngelBrain {
  private mode: 'idle' | 'judge' | 'lance' | 'prayer' | 'heaven' = 'idle';
  private t = 0;
  private cd1 = 4;
  private cd2 = 8;
  private cd3 = 11;
  private freq = 1;
  private heavenDone = false;
  private warnings: WarnCircle[] = [];
  private shots: PendingShot[] = [];
  private g?: Phaser.GameObjects.Graphics;
  private target: Fighter | null = null;
  private lockX = 0;
  private lockY = 0;
  private holes: { x: number; y: number }[] = [];
  private lastX = 0;
  private lastY = 0;
  private stuck = { t: 0, detour: 0, sign: 1 };

  update(dt: number, self: Fighter, host: MonsterHost) {
    if (!self.alive) return;
    if (!this.g) this.g = host.scene.add.graphics().setDepth(12);
    this.cd1 = Math.max(0, this.cd1 - dt);
    this.cd2 = Math.max(0, this.cd2 - dt);
    this.cd3 = Math.max(0, this.cd3 - dt);
    this.tickShots(dt);

    if (!this.heavenDone && self.hp <= self.maxHp * 0.5) {
      this.heavenDone = true;
      this.mode = 'heaven';
      this.t = 0;
      stop(self);
      label(host.scene, self.x, self.y - 90, '上天堂！', '#ffe27a', 1.2);
      host.scene.cameras.main.shake(0.02, 500);
      const { x, y, w, h } = host.arena;
      const altars: { x: number; y: number }[] = [];
      for (let i = 0; i < 4; i++) {
        const left = i < 2;
        const nx = left
          ? x + 90 + Math.random() * (w / 2 - 180)
          : x + w / 2 + 90 + Math.random() * (w / 2 - 180);
        altars.push({ x: nx, y: y + 120 + Math.random() * (h - 240) });
      }
      host.curseAllies(self, altars);
      self.drPct = 0.2;
      self.selfSpeedMul = 2;
      this.freq = 1 / 1.2;
    }

    switch (this.mode) {
      case 'idle': this.idle(dt, self, host); break;
      case 'judge': this.judge(dt, self, host); break;
      case 'lance': this.lance(dt, self, host); break;
      case 'prayer': this.prayer(dt, self, host); break;
      case 'heaven': this.heaven(dt, self, host); break;
    }
    this.draw();
  }

  private idle(dt: number, self: Fighter, host: MonsterHost) {
    const target = host.nearestAlly(self);
    // 无论角色在哪一侧，都按冷却固定出招；有目标时仅用于走位
    if (target) {
      chase(self, host, target, dt, this.lastX, this.lastY, this.stuck);
    } else {
      stop(self);
    }
    this.lastX = self.x;
    this.lastY = self.y;
    const allies = host.allies();
    if (allies.length === 0) return;
    const ready: string[] = [];
    if (this.cd1 <= 0) ready.push('judge');
    if (this.cd2 <= 0) ready.push('lance');
    if (this.cd3 <= 0) ready.push('prayer');
    if (ready.length === 0) return;
    const pick = ready[Math.floor(Math.random() * ready.length)];
    stop(self);
    this.t = 0;
    if (pick === 'judge') {
      this.mode = 'judge';
      this.cd1 = 10 * this.freq;
      label(host.scene, self.x, self.y - 84, '圣洁审判', '#fff2b0', 1.0);
      for (const a of allies) {
        this.warnings.push({ x: a.x, y: a.y, r: 100, t: 1.5, total: 1.5 });
      }
    } else if (pick === 'lance') {
      this.mode = 'lance';
      this.cd2 = 12 * this.freq;
      this.holes = [];
      const { x, y, w, h } = host.arena;
      for (let i = 0; i < 5; i++) {
        // 白洞纵向位置随机（每段内随机偏移，避免重叠）
        this.holes.push({ x: x + w - 36, y: y + (h * (i + 0.15 + Math.random() * 0.7)) / 5 });
      }
      for (let k = 0; k < 5; k++) {
        this.shots.push({
          t: 0.8 + k * 1.0,
          fire: () => {
            for (const hole of this.holes) {
              host.spawnRectShot({
                x: hole.x, y: hole.y, angle: Math.PI, speed: 500, width: 75, dmg: 200,
                owner: self, color: 0xe8ecff, outline: 0xffe27a, style: 'bar',
              });
            }
            host.scene.cameras.main.shake(0.006, 120);
          },
        });
      }
      label(host.scene, self.x, self.y - 84, '天堂长枪', '#ffe27a', 1.0);
    } else {
      this.mode = 'prayer';
      this.cd3 = 14 * this.freq;
      this.target = allies[Math.floor(Math.random() * allies.length)];
      this.lockX = this.target.x;
      this.lockY = this.target.y;
      this.setOrigin(self.x, self.y);
      this.shots.push({
        t: 1.5,
        fire: () => {
          const ang = Math.atan2(this.lockY - self.y, this.lockX - self.x);
          host.spawnRectShot({
            x: self.x, y: self.y, angle: ang, speed: 1000, width: 60, dmg: 0,
            owner: self, color: 0xffd75e, outline: 0xfff6d0, style: 'gold',
            hpOne: true, silence: 5, passWalls: true,
          });
          flash(host.scene, self.x, self.y, 0xffe27a, 14);
        },
      });
      label(host.scene, self.x, self.y - 84, '重生祷告', '#ffd75e', 1.1);
    }
  }

  private judge(dt: number, self: Fighter, host: MonsterHost) {
    this.t += dt;
    stop(self);
    castPose(self);
    if (this.t >= 1.5) {
      for (const w of this.warnings) {
        for (const a of host.allies()) {
          if (!a.alive) continue;
          if (Math.hypot(a.x - w.x, a.y - w.y) > w.r + a.hitR) continue;
          a.takeDamage(150, { source: self });
          a.silence(2);
        }
        flash(host.scene, w.x, w.y, 0xfff2b0, 16);
      }
      this.warnings = [];
      host.scene.cameras.main.shake(0.012, 260);
      this.mode = 'idle';
      this.t = 0;
    }
  }

  private lance(dt: number, self: Fighter, host: MonsterHost) {
    this.t += dt;
    stop(self);
    castPose(self);
    if (this.t > 5.1) {
      this.mode = 'idle';
      this.t = 0;
      this.holes = [];
    }
    void host;
  }

  private prayer(dt: number, self: Fighter, host: MonsterHost) {
    this.t += dt;
    stop(self);
    castPose(self);
    face(self, this.lockX, this.lockY);
    if (this.t > 1.8) {
      this.mode = 'idle';
      this.t = 0;
      this.target = null;
    }
    void host;
  }

  private heaven(dt: number, self: Fighter, host: MonsterHost) {
    this.t += dt;
    stop(self);
    castPose(self);
    if (this.t >= 1.2) {
      this.mode = 'idle';
      this.t = 0;
    }
    void host;
  }

  private tickShots(dt: number) {
    if (this.shots.length === 0) return;
    for (const s of [...this.shots]) {
      s.t -= dt;
      if (s.t <= 0) {
        const i = this.shots.indexOf(s);
        if (i >= 0) this.shots.splice(i, 1);
        s.fire();
      }
    }
  }

  private draw() {
    const g = this.g;
    if (!g) return;
    g.clear();
    // 圣洁审判：从天而降的光束预警
    for (const w of this.warnings) {
      const p = 1 - w.t / w.total;
      g.fillStyle(0xff2b2b, 0.10 + p * 0.12);
      g.fillCircle(w.x, w.y, w.r);
      g.lineStyle(4, 0xff4a4a, 0.45 + p * 0.5);
      g.strokeCircle(w.x, w.y, w.r);
      g.fillStyle(0xfff2c0, 0.14 + p * 0.2);
      g.fillRect(w.x - 26, w.y - 1400, 52, 1400);
    }
    // 天堂长枪：白洞与横轴预警（自右向左发射）
    if (this.mode === 'lance') {
      const warn = Math.min(1, this.t / 0.8);
      for (const h of this.holes) {
        if (this.t < 0.8) {
          g.fillStyle(0xff2b2b, 0.10 + warn * 0.18);
          g.fillRect(h.x - 1600, h.y - 37.5, 1600, 75);
          g.lineStyle(2, 0xff5a5a, 0.5 + warn * 0.4);
          g.lineBetween(h.x, h.y, h.x - 1600, h.y);
        }
        g.fillStyle(0xf8f6ff, 0.95);
        g.fillCircle(h.x, h.y, 22);
        g.lineStyle(3, 0xffe27a, 0.9);
        g.strokeCircle(h.x, h.y, 22);
      }
    }
    // 重生祷告：200px 宽锁定预警
    if (this.mode === 'prayer' && this.target) {
      const ang = Math.atan2(this.lockY - this.originY(), this.lockX - this.originX());
      const len = Math.hypot(this.lockX - this.originX(), this.lockY - this.originY());
      const px = -Math.sin(ang);
      const py = Math.cos(ang);
      const p = Math.min(1, this.t / 1.5);
      g.fillStyle(0xff2b2b, 0.12 + p * 0.2);
      g.beginPath();
      g.moveTo(this.originX() + px * 100, this.originY() + py * 100);
      g.lineTo(this.originX() + Math.cos(ang) * len + px * 100, this.originY() + Math.sin(ang) * len + py * 100);
      g.lineTo(this.originX() + Math.cos(ang) * len - px * 100, this.originY() + Math.sin(ang) * len - py * 100);
      g.lineTo(this.originX() - px * 100, this.originY() - py * 100);
      g.closePath();
      g.fillPath();
      g.lineStyle(3, 0xffd75e, 0.8);
      g.strokeCircle(this.lockX, this.lockY, 30 + Math.sin(this.t * 18) * 4);
    }
  }

  private ox = 0;
  private oy = 0;

  private originX() { return this.ox; }
  private originY() { return this.oy; }

  /** 记录施法原点（由 PveMode 在施放重生祷告时更新） */
  setOrigin(x: number, y: number) {
    this.ox = x;
    this.oy = y;
  }

  dispose() {
    this.g?.destroy();
    this.g = undefined;
    this.warnings = [];
    this.holes = [];
    this.shots = [];
  }
}
