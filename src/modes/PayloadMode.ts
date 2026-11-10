import Phaser from 'phaser';
import {
  CHAR_INFO, CHAR_POOL, GAME_WIDTH, MAP_SIZE, PAYLOAD,
} from '../config';
import { railPointAt } from '../maps';
import { clamp, dist, segmentHitsWall } from '../core/util';
import { FONT_BODY, FONT_MONO } from '../core/text';
import { playSfx } from '../audio/sfx';
import { AIController } from '../ai/AIController';
import type { Fighter } from '../entities/Fighter';
import type { Soldier } from '../entities/Soldier';
import type { GameMode, ModeHost } from './GameMode';

/** 地图名去掉字间距（结算文案用） */
function themeName(name: string): string {
  return name.replace(/\s+/g, '');
}

/** 珊瑚海巨浪（v0.35）：每 30s 一道，浪墙宽 240px、横扫速度 1400px/s、击退 + 2s 眩晕 */
const CORAL_WAVE_INTERVAL = 30;
const CORAL_WAVE_SPEED = 1400;
const CORAL_WAVE_BAND = 240;
const CORAL_WAVE_STUN = 2;
const CORAL_WAVE_KNOCK = 2200;

/** 团队推车模式：3V3，进攻方推车到终点或时间耗尽由防守方获胜 */
export class PayloadMode implements GameMode {
  /** 火车头沿折线铁轨已推进的距离（px） */
  cartDist = 0;
  /** 火车头当前世界坐标（由 cartDist 在折线上插值得到） */
  cartX = 0;
  cartY = 0;
  /** 火车头当前朝向（沿轨道切线） */
  cartAngle = 0;
  /** 是否已通过全部轨道检查点（推车地图可能不止一个检查点） */
  passedCheckpoint = false;
  /** 本帧推进圈内进攻方 / 防守方人数 */
  pushAttackers = 0;
  pushDefenders = 0;

  private cartImg?: Phaser.GameObjects.Image;
  private cartG?: Phaser.GameObjects.Graphics;
  /** 剩余推车时间（秒） */
  private payloadT = 0;
  /** 各轨道检查点是否已通过 */
  private cpPassed: boolean[] = [];
  /** v0.34 珊瑚海：占领进度 0~1 与是否已完成占领（完成前船不前进） */
  private captureProgress = 0;
  private captureDone = true;
  private payloadHudG?: Phaser.GameObjects.Graphics;
  private payloadHudT?: Phaser.GameObjects.Text;
  private payloadHint?: Phaser.GameObjects.Text;

  /* ---------- 珊瑚海巨浪（v0.35） ---------- */
  /** 距离下一道巨浪（秒） */
  private waveT = CORAL_WAVE_INTERVAL;
  private waveActive = false;
  /** 浪头世界 x（起始在画面外侧） */
  private wavePos = 0;
  /** +1 = 左 → 右，-1 = 右 → 左 */
  private waveDir = 1;
  /** 本道浪已命中的角色 / 雄兵（每道浪只结算一次） */
  private waveHit = new Set<Fighter>();
  private waveHitSoldiers = new Set<Soldier>();
  private waveG?: Phaser.GameObjects.Graphics;

  constructor(private host: ModeHost) {}

  /* ================= 建立 ================= */

  buildWorld() {
    const h = this.host;
    const layout = h.layout;
    const theme = layout.theme;
    if (!layout.rails) return;
    const rail = layout.rails;
    const coral = theme === 'coral';
    // 逐段铺设轨道贴图：每段按切线旋转，折线拐弯处自然衔接（珊瑚海改用更宽的深蓝航道）
    const laneW = coral ? 58 : 42;
    for (let i = 0; i + 1 < rail.path.length; i++) {
      const a = rail.path[i];
      const b = rail.path[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      h.add.tileSprite((a.x + b.x) / 2, (a.y + b.y) / 2, len, laneW, coral ? 'tex-channel' : 'tex-rail')
        .setDepth(2)
        .setRotation(Math.atan2(b.y - a.y, b.x - a.x));
    }
    // 起点 / 终点 / 检查点标记（垂直于轨道）
    const mkG = h.add.graphics().setDepth(2);
    const mark = (p: { x: number; y: number; angle: number }, color: number, half = 34) => {
      const px = -Math.sin(p.angle);
      const py = Math.cos(p.angle);
      mkG.lineStyle(7, color, 0.6);
      mkG.lineBetween(p.x - px * half, p.y - py * half, p.x + px * half, p.y + py * half);
    };
    mark(railPointAt(rail, 0), 0x57e08b);
    mark(railPointAt(rail, rail.total), 0xff5f6d);
    // 检查点（第一个检查点由占领区承担，轨道检查点从第二处开始）
    layout.checkpoints?.forEach((d, i) => {
      const p = railPointAt(rail, d);
      mark(p, 0xffd166, 40);
      h.add.text(p.x, p.y - 30, `检查点 ${i + 2}`, {
        fontFamily: FONT_BODY, fontSize: '13px', color: '#ffe6a3',
        align: 'center',
      }).setOrigin(0.5, 1).setDepth(3).setStroke('#0b0d15', 4);
    });
    // 占领区（第一个检查点）：珊瑚海进攻方必须先占领船所在区域才能推车
    const cap = layout.capture;
    if (cap) {
      const capG = h.add.graphics().setDepth(2);
      capG.lineStyle(5, 0xffd166, 0.45).strokeCircle(cap.x, cap.y, cap.r);
      capG.lineStyle(2, 0xffd166, 0.25).strokeCircle(cap.x, cap.y, cap.r - 8);
      h.add.text(cap.x, cap.y - cap.r - 12, `检查点 1 · 占领区 ${cap.time}s`, {
        fontFamily: FONT_BODY, fontSize: '14px', color: '#ffe6a3',
      }).setOrigin(0.5, 1).setDepth(3).setStroke('#0b0d15', 4);
      this.captureProgress = 0;
      this.captureDone = false;
    }

    this.cartG = h.add.graphics().setDepth(7);
    const p0 = railPointAt(rail, 0);
    const v0 = this.cartVisual(p0.angle);
    this.cartImg = h.add.image(p0.x, p0.y, coral ? 'tex-boat' : 'tex-train')
      .setDepth(8).setDisplaySize(PAYLOAD.bodyW, PAYLOAD.bodyH)
      .setRotation(v0.rotation).setFlipX(v0.flipX);
    this.cartDist = 0;
    this.cartX = p0.x;
    this.cartY = p0.y;
    this.cartAngle = p0.angle;
    this.payloadT = layout.timeFirst ?? PAYLOAD.timeFirst;
    this.cpPassed = (layout.checkpoints ?? []).map(() => false);
    if (layout.checkpoints === undefined && !cap) {
      // 遗迹：沿用旧的单检查点（轨道中点）
      layout.checkpoints = [PAYLOAD.checkpointDist];
      this.cpPassed = [false];
    }
    // 珊瑚海巨浪图层（在航道 / 墙体之上、角色之下）
    if (coral) {
      this.waveG = h.add.graphics().setDepth(5);
      this.waveT = CORAL_WAVE_INTERVAL;
    }

    // 重生室标注：让三个重生室的位置一目了然
    if (layout.rooms) {
      const roomNames = ['起点重生室', '检查点重生室', '终点重生室'];
      layout.rooms.forEach((rm, i) => {
        h.add.text(rm.x, rm.y - rm.h / 2 - 24, roomNames[i], {
          fontFamily: FONT_BODY,
          fontSize: '15px',
          color: i === 2 ? '#ff9d9d' : '#9fd8ff',
          align: 'center',
        })
          .setOrigin(0.5, 1)
          .setDepth(3)
          .setAlpha(0.9)
          .setStroke('#0b0d15', 4);
      });
    }
  }

  buildHud() {
    const h = this.host;
    // 团队推车顶部 HUD：倒计时 + 推车进度条
    this.payloadHudG = h.add.graphics().setDepth(1600).setScrollFactor(0);
    this.payloadHudT = h.add.text(GAME_WIDTH / 2, 8, '', {
      fontFamily: FONT_MONO, fontSize: '14px', color: '#ffe27a',
    }).setDepth(1601).setScrollFactor(0).setOrigin(0.5, 0).setStroke('#0b0d15', 4);
    this.payloadHint = h.add.text(GAME_WIDTH / 2, 72, '', {
      fontFamily: FONT_BODY, fontSize: '13px', color: '#cfe3ff',
    }).setDepth(1601).setScrollFactor(0).setOrigin(0.5, 0).setStroke('#0b0d15', 4).setAlpha(0);
  }

  spawnRoster() {
    const h = this.host;
    const layout = h.layout;
    // 3V3：玩家随机分配到进攻方（team 0）或防守方（team 1），同队 2 名 AI、敌对 3 名 AI
    const pool = CHAR_POOL
      .filter((c) => c !== h.charId);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const rooms = layout.rooms!;
    const playerTeam = Math.random() < 0.5 ? 0 : 1;
    const mateSpawns = rooms[playerTeam === 0 ? 0 : 1].spawns;
    const foeSpawns = rooms[playerTeam === 0 ? 1 : 0].spawns;
    h.player = h.spawnFighter(
      mateSpawns[0].x, mateSpawns[0].y, h.charId, true, CHAR_INFO[h.charId].name,
    );
    h.player.team = playerTeam;
    h.player.teamBattle = true;
    h.fighters.push(h.player);
    h.aiList = [];
    for (let i = 0; i < 2; i++) {
      const cid = pool[i];
      const ai = h.spawnFighter(
        mateSpawns[i + 1].x, mateSpawns[i + 1].y, cid, false, '队友·' + CHAR_INFO[cid].name,
      );
      ai.team = playerTeam;
      ai.teamBattle = true;
      h.fighters.push(ai);
      h.aiList.push(ai);
      h.aiCtrls.set(ai, new AIController());
    }
    for (let i = 0; i < 3; i++) {
      const cid = pool[i + 2];
      const ai = h.spawnFighter(
        foeSpawns[i].x, foeSpawns[i].y, cid, false, '敌·' + CHAR_INFO[cid].name,
      );
      ai.team = 1 - playerTeam;
      ai.teamBattle = true;
      h.fighters.push(ai);
      h.aiList.push(ai);
      h.aiCtrls.set(ai, new AIController());
    }
  }

  /* ================= 每帧逻辑：推进 / 检查点 / 倒计时 ================= */

  update(dt: number) {
    const h = this.host;
    if (!h.started || h.over) {
      this.pushAttackers = 0;
      this.pushDefenders = 0;
      return;
    }

    const rail = h.layout.rails;
    if (!rail) return;
    // 珊瑚海：每 30s 一道全屏巨浪
    this.updateCoralWave(dt);
    const cap = h.layout.capture;
    const locked = !!cap && !this.captureDone;

    // 推进圈人数：以推车当前位置为圆心的存活角色（占领阶段改为占领区半径）
    const zone = locked && cap ? { x: cap.x, y: cap.y, r: cap.r } : { x: this.cartX, y: this.cartY, r: PAYLOAD.radius };
    let atk = 0;
    let def = 0;
    for (const f of h.fighters) {
      if (!f.alive) continue;
      if (dist(f.x, f.y, zone.x, zone.y) > zone.r) continue;
      // v0.26：角色与车之间的直线被墙体挡住时不计入（必须能“看到”车）
      if (segmentHitsWall(f.x, f.y, zone.x, zone.y, h.wallRects)) continue;
      if (f.team === 0) atk++;
      else def++;
    }
    this.pushAttackers = atk;
    this.pushDefenders = def;

    if (locked && cap) {
      // v0.34 珊瑚海：进攻方需在占领区内累计占领 cap.time 秒；
      // 防守方在圈内会拖慢进度（3v3 对拼约 32s，无人防守最快 20s），但不会完全停滞
      if (atk > 0) {
        const rate = atk / (atk + def * 0.6);
        this.captureProgress = Math.min(1, this.captureProgress + dt * rate / cap.time);
      }
      if (this.captureProgress >= 1) {
        this.captureDone = true;
        this.captureProgress = 1;
        // v0.35：占领成功与通过检查点一样，推车时间 +2:00
        const extra = h.layout.timeExtra ?? PAYLOAD.timeExtra;
        this.payloadT += extra;
        const extraStr = extra >= 60 ? `${Math.floor(extra / 60)}:${String(extra % 60).padStart(2, '0')}` : `${extra}s`;
        playSfx('go', 0.9);
        h.hud.pushFeed(`占领区已夺取！推车时间 +${extraStr}`);
        this.showHint(`检查点 1 已占领 · 船可以开始推进 · 时间 +${extraStr}`);
      }
      this.syncCartSprite();
    } else {
      // 进攻方人数多于防守方才推进；人数越多越快（3 人满速跑完全程约 45s）
      const diff = atk - def;
      if (diff > 0) {
        // v0.35：珊瑚海按分段速度推进——满速 40s 到检查点 2、再 50s 到终点；
        // 遗迹沿用旧的“全长 45s”均速
        const cps0 = h.layout.checkpoints?.[0] ?? rail.total / 2;
        let full: number;
        if (h.layout.pushTimeCp && h.layout.pushTimeRest) {
          full = this.cartDist < cps0
            ? cps0 / h.layout.pushTimeCp
            : (rail.total - cps0) / h.layout.pushTimeRest;
        } else {
          full = rail.total / 45;
        }
        const speed = full * clamp(diff / 3, 0, 1);
        this.cartDist = Math.min(rail.total, this.cartDist + speed * dt);
      }

      // 检查点（可多个）：依次加时；全部通过后进攻方重生室前移
      const cps = h.layout.checkpoints ?? [];
      for (let i = 0; i < cps.length; i++) {
        if (this.cpPassed[i] || this.cartDist < cps[i]) continue;
        this.cpPassed[i] = true;
        const extra = h.layout.timeExtra ?? PAYLOAD.timeExtra;
        this.payloadT += extra;
        const extraStr = extra >= 60 ? `${Math.floor(extra / 60)}:${String(extra % 60).padStart(2, '0')}` : `${extra}s`;
        playSfx('go', 0.9);
        h.hud.pushFeed(`船通过检查点 ${i + 2}！推车时间 +${extraStr}`);
        this.showHint(`检查点 ${i + 2} 已占领 · 时间 +${extraStr}`);
        if (this.cpPassed.every(Boolean)) {
          this.passedCheckpoint = true;
          h.hud.pushFeed('全部检查点已过：进攻方重生点前移');
          this.showHint('全部检查点已过 · 进攻方重生室前移');
        }
      }
    }

    // 终点：进攻方获胜
    if (this.cartDist >= rail.total) {
      this.cartDist = rail.total;
      this.syncCartSprite();
      h.endGame(true, undefined, themeName(h.layout.name) + ' 终点已抵达', 0);
      return;
    }

    // 倒计时归零：防守方获胜（占领阶段同样计时）
    this.payloadT -= dt;
    if (this.payloadT <= 0) {
      this.payloadT = 0;
      this.syncCartSprite();
      h.endGame(false, undefined, locked ? '进攻方未能占领船只，时间耗尽' : '推车时间耗尽，船被拦下', 1);
      return;
    }

    this.syncCartSprite();
  }

  /**
   * v0.35 珊瑚海专属机制：每 30s 随机从地图左 / 右侧卷来一道全屏巨浪。
   * 浪墙扫过时大幅击退所有单位，并施加 2s 眩晕（蓄力中的奥术使免疫控制，设计上保留）。
   */
  private updateCoralWave(dt: number) {
    const h = this.host;
    if (h.layout.theme !== 'coral') return;
    if (!this.waveActive) {
      this.waveT -= dt;
      if (this.waveT <= 0) this.startCoralWave();
      return;
    }

    const prev = this.wavePos;
    this.wavePos += this.waveDir * CORAL_WAVE_SPEED * dt;
    // 扫掠判定：这一帧浪墙覆盖的竖直区域
    const x0 = Math.min(prev, this.wavePos) - CORAL_WAVE_BAND / 2;
    const x1 = Math.max(prev, this.wavePos) + CORAL_WAVE_BAND / 2;
    for (const f of h.fighters) {
      if (!f.alive || this.waveHit.has(f)) continue;
      if (f.x < x0 || f.x > x1) continue;
      this.waveHit.add(f);
      f.stun(CORAL_WAVE_STUN);
      f.applyKnock(this.waveDir * CORAL_WAVE_KNOCK, Phaser.Math.Between(-260, 260));
    }
    for (const s of h.soldiers) {
      if (s.dead || this.waveHitSoldiers.has(s)) continue;
      if (s.x < x0 || s.x > x1) continue;
      this.waveHitSoldiers.add(s);
      s.hitByWave(this.waveDir, CORAL_WAVE_STUN, CORAL_WAVE_KNOCK);
    }
    this.drawCoralWave();

    const done = this.waveDir > 0 ? this.wavePos > MAP_SIZE + CORAL_WAVE_BAND : this.wavePos < -CORAL_WAVE_BAND;
    if (done) {
      this.waveActive = false;
      this.waveG?.clear();
    }
  }

  private startCoralWave() {
    this.waveActive = true;
    this.waveDir = Math.random() < 0.5 ? 1 : -1;
    this.wavePos = this.waveDir > 0 ? -CORAL_WAVE_BAND : MAP_SIZE + CORAL_WAVE_BAND;
    this.waveHit.clear();
    this.waveHitSoldiers.clear();
    this.waveT = CORAL_WAVE_INTERVAL;
    this.host.cameras.main.shake(420, 0.006);
    playSfx('go', 0.7);
    this.host.hud.pushFeed(this.waveDir > 0 ? '左侧巨浪来袭！' : '右侧巨浪来袭！');
    this.showHint('巨浪来袭 · 大幅击退并眩晕 2s');
  }

  /** 巨浪视觉：贯穿全图的深蓝水墙 + 白色浪脊 */
  private drawCoralWave() {
    const g = this.waveG;
    if (!g) return;
    g.clear();
    if (!this.waveActive) return;
    const band = CORAL_WAVE_BAND;
    const head = this.wavePos;
    const x0 = this.waveDir > 0 ? head - band : head;
    const t = this.host.time.now * 0.004;
    g.fillStyle(0x0a4f86, 0.30).fillRect(x0, 0, band, MAP_SIZE);
    g.fillStyle(0x1f8fd6, 0.26).fillRect(x0, 0, band, MAP_SIZE);
    for (let y = 0; y < MAP_SIZE; y += 120) {
      const off = Math.sin(t + y * 0.01) * 10;
      g.fillStyle(0xdff4ff, 0.5)
        .fillEllipse(head - this.waveDir * 18 + off, y + 60, 46, 120);
    }
    g.fillStyle(0xffffff, 0.26)
      .fillRect(this.waveDir > 0 ? head - 26 : head + 14, 0, 12, MAP_SIZE);
  }

  private syncCartSprite() {
    if (!this.cartImg) return;
    const rail = this.host.layout.rails;
    if (!rail) return;
    const p = railPointAt(rail, this.cartDist);
    this.cartX = p.x;
    this.cartY = p.y;
    this.cartAngle = p.angle;
    const bob = Math.sin(this.host.time.now * 0.006) * 1.2;
    const v = this.cartVisual(p.angle);
    this.cartImg.setPosition(p.x, p.y + bob).setRotation(v.rotation).setFlipX(v.flipX);
  }

  /**
   * v0.22：火车头贴图默认「朝右、车顶朝上」。
   * 向左行驶时若直接按切线角旋转 π 会导致车顶朝下；
   * 这里统一取 |角度|≤90° 的等价角度保持车顶朝上，再用水平翻转表示行进方向。
   */
  private cartVisual(angle: number): { rotation: number; flipX: boolean } {
    return Math.cos(angle) < 0
      ? { rotation: angle + Math.PI, flipX: true }
      : { rotation: angle, flipX: false };
  }

  private showHint(text: string) {
    if (!this.payloadHint) return;
    this.payloadHint.setText(text).setAlpha(1);
    this.host.tweens.killTweensOf(this.payloadHint);
    this.host.tweens.add({ targets: this.payloadHint, alpha: 0, duration: 700, delay: 2400 });
  }

  /* ================= 绘制 ================= */

  /** 世界层：火车头推进圈 + 前进方向指示（占领阶段改为占领区进度环） */
  drawWorld() {
    if (!this.cartG) return;
    const h = this.host;
    const g = this.cartG;
    g.clear();
    const cap = h.layout.capture;
    const locked = !!cap && !this.captureDone;
    const cx = locked && cap ? cap.x : this.cartX;
    const cy = locked && cap ? cap.y : this.cartY;
    const diff = this.pushAttackers - this.pushDefenders;
    const t = h.time.now * 0.005;
    const moving = !locked && diff > 0 && h.started && !h.over;
    const radius = locked && cap ? cap.r : PAYLOAD.radius;

    // 推进圈
    g.fillStyle(moving ? 0x57e08b : 0x9aa8c4, 0.08).fillCircle(cx, cy, radius);
    const ring = locked ? 0xffd166 : moving ? 0x57e08b : 0x9aa8c4;
    g.lineStyle(3, ring, 0.55 + 0.2 * Math.sin(t * 2)).strokeCircle(cx, cy, radius);
    // 推进圈内侧虚线刻度
    const segs = 40;
    for (let i = 0; i < segs; i += 2) {
      const a0 = t * 0.6 + (i / segs) * Math.PI * 2;
      const a1 = t * 0.6 + ((i + 1) / segs) * Math.PI * 2;
      g.lineStyle(2, ring, 0.35);
      g.lineBetween(
        cx + Math.cos(a0) * (radius - 6), cy + Math.sin(a0) * (radius - 6),
        cx + Math.cos(a1) * (radius - 6), cy + Math.sin(a1) * (radius - 6),
      );
    }

    // 占领进度环（珊瑚海：占领完成前船不会前进）
    if (locked) {
      const start = -Math.PI / 2;
      g.lineStyle(7, 0xffd166, 0.95);
      g.beginPath();
      g.arc(cx, cy, radius - 16, start, start + Math.PI * 2 * this.captureProgress, false);
      g.strokePath();
      return;
    }

    // 前进方向箭头：沿轨道切线方向（折线每段朝向不同）
    const ux = Math.cos(this.cartAngle);
    const uy = Math.sin(this.cartAngle);
    const nx = -uy;
    const ny = ux;
    const ax = cx + ux * (PAYLOAD.radius - 26);
    const ay = cy + uy * (PAYLOAD.radius - 26);
    const bx = ax - ux * 4;
    const by = ay - uy * 4;
    const col = moving ? 0x9bffb8 : 0x6d7b96;
    g.fillStyle(col, 0.9);
    g.fillTriangle(
      ax + ux * 22, ay + uy * 22,
      bx + nx * 13, by + ny * 13,
      bx - nx * 13, by - ny * 13,
    );
    g.lineStyle(3, col, 0.7);
    g.lineBetween(
      cx + ux * 26 + nx * 24, cy + uy * 26 + ny * 24,
      bx - ux * 22 + nx * 24, by - uy * 22 + ny * 24,
    );
    g.lineBetween(
      cx + ux * 26 - nx * 24, cy + uy * 26 - ny * 24,
      bx - ux * 22 - nx * 24, by - uy * 22 - ny * 24,
    );
  }

  /** 屏幕层：顶部推车倒计时 + 进度条（起点 / 检查点 / 终点） */
  drawHud() {
    if (!this.payloadHudG || !this.payloadHudT) return;
    const layout = this.host.layout;
    const g = this.payloadHudG;
    g.clear();
    const barW = 460;
    const barH = 12;
    const x0 = (GAME_WIDTH - barW) / 2;
    const y0 = 26;
    const total = layout.rails?.total ?? PAYLOAD.pathTotal;
    const cap = layout.capture;
    const locked = !!cap && !this.captureDone;
    const prog = locked ? 0 : clamp(this.cartDist / total, 0, 1);
    const cps = layout.checkpoints ?? [];

    g.fillStyle(0x0b0d15, 0.82).fillRoundedRect(x0 - 8, y0 - 7, barW + 16, barH + 14, 7);
    g.fillStyle(0x22304a, 0.95).fillRoundedRect(x0, y0, barW, barH, 5);
    g.fillStyle(locked ? 0xffd166 : 0x57c8ff, 0.95)
      .fillRoundedRect(x0, y0, Math.max(1, barW * prog), barH, 5);
    // 检查点刻度
    for (let i = 0; i < cps.length; i++) {
      const px = x0 + barW * clamp(cps[i] / total, 0, 1);
      g.fillStyle(this.cpPassed[i] ? 0x57e08b : 0xffe27a, 1);
      g.fillRect(px - 2, y0 - 6, 4, barH + 12);
    }
    // 起点 / 终点旗标
    g.fillStyle(0x57e08b, 1).fillRect(x0 - 3, y0 - 4, 3, barH + 8);
    g.fillStyle(0xff5f6d, 1).fillRect(x0 + barW, y0 - 4, 3, barH + 8);

    // 占领进度条（船所在区域）
    if (locked) {
      const capW = 220;
      const capX = (GAME_WIDTH - capW) / 2;
      const capY = y0 + barH + 16;
      g.fillStyle(0x0b0d15, 0.82).fillRoundedRect(capX - 6, capY - 5, capW + 12, 16, 5);
      g.fillStyle(0x3a2c12, 0.9).fillRoundedRect(capX, capY, capW, 6, 3);
      g.fillStyle(0xffd166, 0.95).fillRoundedRect(capX, capY, Math.max(1, capW * this.captureProgress), 6, 3);
    }

    const left = Math.max(0, Math.ceil(this.payloadT));
    const mm = Math.floor(left / 60);
    const ss = left % 60;
    const timeStr = `${mm}:${ss < 10 ? '0' : ''}${ss}`;
    let stateStr = '';
    if (locked && cap) {
      stateStr = `占领 ${Math.floor(this.captureProgress * 100)}%（${cap.time}s 占领区）`;
    } else {
      const done = this.cpPassed.filter(Boolean).length;
      stateStr = `检查点 ${done}/${cps.length}`;
    }
    this.payloadHudT.setText(
      `推车 ${timeStr}   ·   攻 ${this.pushAttackers} : 守 ${this.pushDefenders}   ·   ${stateStr}`,
    );
  }

  /* ================= 复活 / 胜负 ================= */

  respawnPos(f: Fighter): { x: number; y: number } | null {
    const rooms = this.host.layout.rooms;
    if (!rooms) return null;
    // 进攻方：起点室 → 过检查点后检查点室；防守方：检查点室 → 过检查点后终点室
    const room = f.team === 0
      ? (this.passedCheckpoint ? rooms[1] : rooms[0])
      : (this.passedCheckpoint ? rooms[2] : rooms[1]);
    const sp = room.spawns[Phaser.Math.Between(0, room.spawns.length - 1)];
    return { x: sp.x + Phaser.Math.Between(-10, 10), y: sp.y + Phaser.Math.Between(-10, 10) };
  }

  checkWin() {}

  recordDps() {}
}
