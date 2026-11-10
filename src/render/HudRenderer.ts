import Phaser from 'phaser';
import {
  BALANCE, CHAR, GAME_HEIGHT, GAME_WIDTH, KILLS_TO_WIN, MAP_SIZE, MODE, PAYLOAD,
} from '../config';
import type { ModeId } from '../config';
import { FONT_BODY, FONT_MONO } from '../core/text';
import { RENDER_SCALE } from '../core/view';
import { clamp, dist, pointInRects, rayWallDistance, subMapGeometry } from '../core/util';
import { BODY_R, Fighter } from '../entities/Fighter';
import { Soldier } from '../entities/Soldier';
import { Storm } from '../entities/Storm';
import type { MapLayout } from '../maps';
import type { BurnZone, MiniBomb, MiniSpawn, PendingStrike } from '../sim/systems/skills/bomber';
import type { RepulseZone } from '../sim/systems/skills/arcane';
import { CHAR_COLOR } from './charColor';

/** 帝君方针定义（1~5），面板展示文案随每局随机抽取的选项动态变化 */
const POLICY_DEFS: Record<number, { name: string; desc: string }> = {
  1: {
    name: '运筹帷幄',
    desc: '雄兵常驻持弓，射程 600\n朝最近敌人 + 左右 30° 齐射 3 箭\n15 伤 · 不穿墙\n冲锋改为快速三轮齐射，冷却 5s\n易位冷却减半\n统治：敌人位置上降下箭雨（50 伤，冷却 25s）',
  },
  2: {
    name: '兵贵神速',
    desc: '雄兵冲锋速度 +100%\n冲锋伤害 -75%，命中 20% 减速\n冲锋冷却 -1s\n冲锋后攻击范围 +50px、伤害 +8\n（仅触发一次，攻击后消失）\n统治：召唤 2 名雄兵、上限 +2（最多 10s）\n期间冲锋冷却再 -1s，冷却 35s',
  },
  3: {
    name: '特立独行',
    desc: '雄兵上限 1、护盾 400\n每 20s 护盾不满即重置满\n体型 / 移速 +50%\n攻击力 +300%（120° 扇形挥矛）\n右键护驾：旋转矛环 72 伤，冷却 3s\n统治：砸地 220px · 65 伤 · 击飞 1.2s 并聚拢（冷却 15s）',
  },
  4: {
    name: '百折不挠',
    desc: '雄兵持盾，不再攻击\n雄兵阻挡经过自身的敌方子弹\n冲锋判定范围 +50%\n冲锋伤害 +200%（24 伤）+ 大幅击退，冷却 2s\n统治：并排 6 名雄兵直线冲锋 800px\n该次冲锋伤害翻倍（48 伤）后消失（冷却 15s）',
  },
  5: {
    name: '亲力亲为',
    desc: '雄兵伤害 / 攻速 -25%\n帝君每 0.6s 朝鼠标投矛 15 伤\n场上每有一名雄兵长矛伤害 +5\n统治：8s 内朝鼠标连发 64 根长矛\n每根在基准方向 50px 内随机偏移（冷却 25s）',
  },
};

/** HudRenderer 需要读取的 GameScene 状态（只读为主，不改写战斗逻辑） */
export interface HudHost extends Phaser.Scene {
  player: Fighter;
  fighters: Fighter[];
  soldiers: Soldier[];
  storms: Storm[];
  burnZones: BurnZone[];
  pendingStrikes: PendingStrike[];
  miniBombs: MiniBomb[];
  repulses: RepulseZone[];
  miniSpawns: MiniSpawn[];
  miniCountBonus: number;
  wallRects: Phaser.Geom.Rectangle[];
  layout: MapLayout;
  mode: ModeId;
  cartX: number;
  cartY: number;
  passedCheckpoint: boolean;
  pushAttackers: number;
  pushDefenders: number;
  respawnTimers: Map<Fighter, number>;
  hpG: Map<Fighter, Phaser.GameObjects.Graphics>;
  hpNames: Map<Fighter, Phaser.GameObjects.Text>;
  readonly visionRadius: number;
  emperorMax(f: Fighter): number;
  emperorSkillCdMax(f: Fighter): number;
  emperorChargeCdMax(f: Fighter): number;
  countSoldiers(f: Fighter): number;
  policyIndexAt(ux: number): number;
}

/**
 * 局内 HUD 渲染：瞄准提示、燃烧区、预警、小地图、轰炸子地图、
 * 血条、底部技能面板、方针面板、计分板、方向提示与击杀播报。
 * 只读取战斗状态并写 Graphics / Text，不结算伤害。
 */
export class HudRenderer {
  private readonly miniG: Phaser.GameObjects.Graphics;
  private readonly aimG: Phaser.GameObjects.Graphics;
  private readonly noonG: Phaser.GameObjects.Graphics;
  private readonly burnG: Phaser.GameObjects.Graphics;
  private readonly warnG: Phaser.GameObjects.Graphics;
  private readonly panelG: Phaser.GameObjects.Graphics;
  private readonly hudHpT: Phaser.GameObjects.Text;
  private readonly hudAtkT: Phaser.GameObjects.Text;
  private readonly hudSkillT: Phaser.GameObjects.Text;
  private readonly hudResT: Phaser.GameObjects.Text;
  private readonly timeT: Phaser.GameObjects.Text;
  private readonly scoreT: Phaser.GameObjects.Text;
  private readonly feedT: Phaser.GameObjects.Text;
  private readonly deathHint: Phaser.GameObjects.Text;

  private readonly subBackdrop: Phaser.GameObjects.Rectangle;
  private readonly subMapG: Phaser.GameObjects.Graphics;
  private readonly subHint: Phaser.GameObjects.Text;

  private readonly policyG: Phaser.GameObjects.Graphics;
  private readonly policyTitle: Phaser.GameObjects.Text;
  private readonly policyCards: Phaser.GameObjects.Text[] = [];
  private readonly alertG: Phaser.GameObjects.Graphics;

  constructor(private host: HudHost) {
    // ------ 战场特效层 ------
    this.aimG = host.add.graphics().setDepth(9);
    // 午时已到准心：需要盖在角色贴图（depth 10）之上
    this.noonG = host.add.graphics().setDepth(30);
    this.burnG = host.add.graphics().setDepth(15);
    this.warnG = host.add.graphics().setDepth(16);

    // ------ UI ------
    this.miniG = host.add.graphics().setDepth(1600).setScrollFactor(0);
    this.panelG = host.add.graphics().setDepth(1600).setScrollFactor(0);
    const hudSegX = [305, 415, 525, 635];
    const hudTextCfg = {
      fontFamily: FONT_MONO, fontSize: '9px', color: '#eaf1ff',
    };
    this.hudHpT = host.add.text(hudSegX[0], 565, '', hudTextCfg)
      .setDepth(1602).setScrollFactor(0).setOrigin(0.5).setStroke('#0b0d15', 2);
    this.hudAtkT = host.add.text(hudSegX[1], 565, '', hudTextCfg)
      .setDepth(1602).setScrollFactor(0).setOrigin(0.5).setStroke('#0b0d15', 2);
    this.hudSkillT = host.add.text(hudSegX[2], 565, '', hudTextCfg)
      .setDepth(1602).setScrollFactor(0).setOrigin(0.5).setStroke('#0b0d15', 2);
    this.hudResT = host.add.text(hudSegX[3], 565, '', hudTextCfg)
      .setDepth(1602).setScrollFactor(0).setOrigin(0.5).setStroke('#0b0d15', 2);

    this.timeT = host.add.text(12, 10, '', {
      fontFamily: FONT_MONO, fontSize: '14px', color: '#c9d6ee',
    }).setDepth(1601).setScrollFactor(0).setOrigin(0, 0).setStroke('#0b0d15', 3);
    this.scoreT = host.add.text(12, 32, '', {
      fontFamily: FONT_BODY, fontSize: '12px', color: '#c9d6ee',
      lineSpacing: 3,
    }).setDepth(1601).setScrollFactor(0).setOrigin(0, 0).setStroke('#0b0d15', 3);
    this.feedT = host.add.text(GAME_WIDTH / 2, 54, '', {
      fontFamily: FONT_BODY, fontSize: '15px', color: '#ffe27a',
    }).setDepth(1650).setScrollFactor(0).setOrigin(0.5).setAlpha(0).setStroke('#0b0d15', 4);
    this.deathHint = host.add.text(GAME_WIDTH / 2, 250, '', {
      fontFamily: FONT_BODY, fontSize: '20px', color: '#ff8a8a',
      align: 'center',
    }).setDepth(1660).setScrollFactor(0).setOrigin(0.5).setStroke('#10131f', 6).setAlpha(0);

    // 轰炸子地图（默认隐藏）
    this.subBackdrop = host.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x05070f, 0.35,
    ).setScrollFactor(0).setDepth(1639).setVisible(false);
    this.subMapG = host.add.graphics().setDepth(1640).setScrollFactor(0);
    this.subHint = host.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + BALANCE.bomber.subMapSize / 2 + 24,
      '左键 选择轰炸点 | 右键/空格 启动轰炸 | ESC 取消（选点期间无法移动）', {
        fontFamily: FONT_BODY, fontSize: '13px', color: '#ffd98a',
      }).setScrollFactor(0).setDepth(1650).setOrigin(0.5).setVisible(false);
    this.subMapG.setVisible(false);

    // 帝君「独裁」方针三选一面板（默认隐藏，选方针时显示；每局从 5 条方针随机抽 3 条）
    this.policyG = host.add.graphics().setDepth(1646).setScrollFactor(0).setVisible(false);
    this.policyTitle = host.add.text(GAME_WIDTH / 2, 206, '独裁 · 选择本场方针（1 / 2 / 3 或点击）', {
      fontFamily: FONT_BODY, fontSize: '18px', color: '#ffd75e',
    }).setDepth(1648).setScrollFactor(0).setOrigin(0.5).setStroke('#10131f', 6).setVisible(false);
    for (let i = 0; i < 3; i++) {
      this.policyCards.push(host.add.text(GAME_WIDTH / 2 + (i - 1) * 236, 268,
        '', {
          fontFamily: FONT_BODY, fontSize: '12px', color: '#dfe9ff',
          align: 'center', lineSpacing: 5,
          wordWrap: { width: 200, useAdvancedWrap: true },
        }).setDepth(1648).setScrollFactor(0).setOrigin(0.5, 0).setStroke('#10131f', 4).setVisible(false));
    }

    // 屏幕方向提示层（对手奥术登神蓄力）
    this.alertG = host.add.graphics().setDepth(1600).setScrollFactor(0);
  }

  /** 左上角战斗计时 */
  setTime(sec: number) {
    this.timeT.setText('时间 ' + sec + 's');
  }

  /** 中央击杀播报 */
  pushFeed(text: string) {
    this.feedT.setText(text).setAlpha(1);
    this.host.tweens.killTweensOf(this.feedT);
    this.host.tweens.add({ targets: this.feedT, alpha: 0, duration: 600, delay: 1400 });
  }

  /** 午时已到：目标身上的枪械准心（随蓄力由黄逐渐变红，并显示蓄力进度弧） */
  private drawHighNoonCrosshair() {
    const g = this.noonG;
    g.clear();
    // 死神之眼：锁定目标的准心图案
    const now = this.host.time.now;
    for (const gf of this.host.fighters) {
      const tg = gf.lockTarget;
      if (!gf.alive || !tg || !tg.alive) continue;
      const cx = tg.x;
      const cy = tg.y - 4;
      const rad = 20;
      const col = 0xff4d4d;
      g.lineStyle(2.5, col, 0.95).strokeCircle(cx, cy, rad);
      g.lineStyle(2, col, 0.95);
      for (const [sx, sy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        g.lineBetween(cx + sx * rad, cy + sy * rad, cx + sx * (rad + 10), cy + sy * (rad + 10));
      }
      g.fillStyle(col, 0.95).fillCircle(cx, cy, 3);
      // 旋转外环刻度
      const rot = now * 0.004;
      g.lineStyle(1.5, 0xffd7d7, 0.7);
      for (let i = 0; i < 8; i++) {
        const a0 = rot + (i / 8) * Math.PI * 2;
        g.lineBetween(
          cx + Math.cos(a0) * (rad + 15), cy + Math.sin(a0) * (rad + 15),
          cx + Math.cos(a0) * (rad + 21), cy + Math.sin(a0) * (rad + 21),
        );
      }
    }
    for (const gf of this.host.fighters) {
      if (!gf.highNoonCharging) continue;
      const tg = gf.highNoonTarget;
      if (!tg || !tg.alive) continue;
      const t = clamp(gf.highNoonT / BALANCE.gunner.highNoonMaxCharge, 0, 1);
      // 黄 (0xffe04d) → 红 (0xff2a2a)
      const r = 255;
      const gg = Math.round(224 - 184 * t);
      const b = Math.round(77 - 35 * t);
      const color = (r << 16) | (gg << 8) | b;
      const cx = tg.x;
      const cy = tg.y - 4;
      const rad = 26 - 8 * t;
      g.lineStyle(2.5, color, 0.92).strokeCircle(cx, cy, rad);
      g.lineStyle(2, color, 0.92);
      for (const [sx, sy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        g.lineBetween(cx + sx * rad, cy + sy * rad, cx + sx * (rad + 9), cy + sy * (rad + 9));
      }
      g.fillStyle(color, 0.92).fillCircle(cx, cy, 2.5);
      // 蓄力进度弧（顺时针从顶部开始）
      g.lineStyle(3, color, 0.85);
      g.beginPath();
      g.arc(cx, cy, rad + 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t, false);
      g.strokePath();
    }
  }

  drawAim() {
    const g = this.aimG;
    g.clear();
    this.drawHighNoonCrosshair();
    const f = this.host.player;
    const p = this.host.input.activePointer;
    const now = this.host.time.now;

    // 弹幕风暴范围圈：任何角色的弹幕风暴都完整可见
    for (const gf of this.host.fighters) {
      if (!gf.alive || gf.charId !== CHAR.GUNNER || !gf.skillActive) continue;
      const r = BALANCE.gunner.skillRadius;
      const t = now * 0.004;
      g.fillStyle(0xffc93c, 0.07).fillCircle(gf.x, gf.y, r);
      g.lineStyle(4, 0xffd34d, 0.55 + 0.25 * Math.sin(t * 3));
      const segs = 36;
      for (let i = 0; i < segs; i += 3) {
        const a0 = t + (i / segs) * Math.PI * 2;
        const a1 = t + ((i + 1.6) / segs) * Math.PI * 2;
        g.lineBetween(
          gf.x + Math.cos(a0) * r, gf.y + Math.sin(a0) * r,
          gf.x + Math.cos(a1) * r, gf.y + Math.sin(a1) * r,
        );
      }
      g.lineStyle(2, 0xfff3a6, 0.6);
      g.strokeCircle(gf.x, gf.y, r - 3);
    }

    // 歼灭姿态：任何进入歼灭模式的战争机器都完整可见（红环 + 旋转刻度）
    for (const wf of this.host.fighters) {
      if (!wf.alive || wf.charId !== CHAR.WAR || wf.warAnnT <= 0) continue;
      const t = now * 0.006;
      g.fillStyle(0xff3b3b, 0.06).fillCircle(wf.x, wf.y, 64);
      g.lineStyle(4, 0xff4d4d, 0.5 + 0.3 * Math.sin(t * 2));
      const segs = 24;
      for (let i = 0; i < segs; i += 3) {
        const a0 = t + (i / segs) * Math.PI * 2;
        const a1 = t + ((i + 1.6) / segs) * Math.PI * 2;
        g.lineBetween(
          wf.x + Math.cos(a0) * 50, wf.y + Math.sin(a0) * 50,
          wf.x + Math.cos(a1) * 50, wf.y + Math.sin(a1) * 50,
        );
      }
    }

    if (!f.alive || f.charId === CHAR.BOMBER) {
      if (f.alive && f.charId === CHAR.BOMBER && !f.bombTargeting) {
        const wp = this.host.cameras.main.getWorldPoint(p.x, p.y);
        g.lineStyle(1, 0xff9d4d, 0.4);
        g.strokeCircle(wp.x, wp.y, 12);
        g.fillStyle(0xff9d4d, 0.25);
        g.fillCircle(wp.x, wp.y, 3);
      }
      return;
    }
    const a = f.faceAngle;
    let len = 42;
    let color = 0xffffff;
    if (f.charId === CHAR.WIND) {
      if (f.windSkillReady) {
        const cr = BALANCE.wind.castRange;
        const t2 = now * 0.005;
        g.fillStyle(0x59d3e3, 0.06).fillCircle(f.x, f.y, cr);
        g.lineStyle(3, 0x59d3e3, 0.55 + 0.2 * Math.sin(t2 * 2));
        const segs = 40;
        for (let i = 0; i < segs; i += 2) {
          const a0 = t2 + (i / segs) * Math.PI * 2;
          const a1 = t2 + ((i + 1.2) / segs) * Math.PI * 2;
          g.lineBetween(
            f.x + Math.cos(a0) * cr, f.y + Math.sin(a0) * cr,
            f.x + Math.cos(a1) * cr, f.y + Math.sin(a1) * cr,
          );
        }
        g.lineStyle(2, 0xd9fbff, 0.6);
        g.strokeCircle(f.x, f.y, cr);

        const wp = this.host.cameras.main.getWorldPoint(p.x, p.y);
        let dx = wp.x - f.x;
        let dy = wp.y - f.y;
        const d = Math.hypot(dx, dy);
        if (d > cr) {
          dx = (dx / d) * cr;
          dy = (dy / d) * cr;
        }
        const sx = f.x + dx;
        const sy = f.y + dy;
        g.fillStyle(0x8be8f2, 0.06).fillCircle(sx, sy, BALANCE.wind.skillRadius);
        g.lineStyle(2, 0x8be8f2, 0.5).strokeCircle(sx, sy, BALANCE.wind.skillRadius);
        g.lineStyle(1.5, 0xffffff, 0.6).strokeCircle(sx, sy, 7);
      }
      if (f.gustCharging) {
        const c = clamp(f.gustChargeT / BALANCE.wind.chargeMax, 0, 1);
        // v0.21：弹道提示必须和实际发射方向一致——蓄力瞬间已锁定 gustAimAngle，
        // 之后鼠标再转动也不会改变，因此预览不能再跟随 faceAngle。
        const ga = f.gustAimAngle;
        const wScale = (1 + (BALANCE.wind.gustWidthMax - 1) * c) * BALANCE.wind.gustWidthRight;
        len = 42 + 120 * c;
        color = 0x8be8f2;
        const nx = -Math.sin(ga);
        const ny = Math.cos(ga);
        const halfW = 9 * wScale;
        // 狂风从脱手积攒位置发射
        const ox = f.gustChargeX;
        const oy = f.gustChargeY;
        g.lineStyle(2, 0x8be8f2, 0.35 + 0.3 * c);
        for (const sgn of [-1, 1]) {
          g.lineBetween(
            ox + nx * halfW * sgn, oy + ny * halfW * sgn,
            ox + Math.cos(ga) * len + nx * halfW * sgn,
            oy + Math.sin(ga) * len + ny * halfW * sgn,
          );
        }
        g.fillStyle(color, 0.25 + 0.5 * c);
        g.fillCircle(ox + Math.cos(ga) * (len + 4), oy + Math.sin(ga) * (len + 4), 5 + 6 * c);
        // 标记积攒位置
        g.lineStyle(2, 0x8be8f2, 0.7).strokeCircle(ox, oy, 10);
      }
    } else if (f.charId === CHAR.GUNNER && f.skillActive) {
      len = 90;
      color = 0x9be8ff;
    } else if (f.charId === CHAR.ARCANE) {
      const b = BALANCE.arcane;
      color = 0xc9a6ff;
      // 蓄力期左键为奥术跃迁（范围 700），平时为奥术排斥（范围 350）
      const range = f.arcaneCharging ? b.jumpRange : b.rejectRange;
      const rr = b.rejectR;
      const wp = this.host.cameras.main.getWorldPoint(p.x, p.y);
      let dx = wp.x - f.x;
      let dy = wp.y - f.y;
      const d = Math.hypot(dx, dy);
      if (d > range) {
        dx = (dx / d) * range;
        dy = (dy / d) * range;
      }
      // 施法范围
      g.lineStyle(1.5, 0x9b5cff, 0.3).strokeCircle(f.x, f.y, range);
      // 鼠标落点预警圈
      g.fillStyle(0x9b5cff, 0.12).fillCircle(f.x + dx, f.y + dy, rr);
      g.lineStyle(2, 0xc9a6ff, 0.85).strokeCircle(f.x + dx, f.y + dy, rr);
      if (f.arcaneCharging) {
        const p2 = clamp(f.arcaneChargeT / b.chargeDur, 0, 1);
        const rr2 = 56 + 40 * p2;
        // 明显的蓄力视觉：多层脉冲光环 + 中心光核
        g.fillStyle(0x9b5cff, 0.1 + 0.08 * p2).fillCircle(f.x, f.y, rr2 + 24);
        g.fillStyle(0xd9c2ff, 0.12 + 0.08 * p2).fillCircle(f.x, f.y, rr2);
        g.lineStyle(5, 0xe8d6ff, 0.7 + 0.3 * p2).strokeCircle(f.x, f.y, rr2);
        g.lineStyle(2, 0xffffff, 0.6 * p2).strokeCircle(f.x, f.y, rr2 * 0.6);
        // 旋转符文
        const spin = now * 0.004;
        g.lineStyle(3, 0xc9a6ff, 0.8);
        for (let k = 0; k < 6; k++) {
          const ang = spin + (k / 6) * Math.PI * 2;
          g.lineBetween(
            f.x + Math.cos(ang) * (rr2 * 0.72), f.y + Math.sin(ang) * (rr2 * 0.72),
            f.x + Math.cos(ang) * (rr2 * 1.05), f.y + Math.sin(ang) * (rr2 * 1.05),
          );
        }
      }
      len = 60;
    } else if (f.charId === CHAR.BLADE) {
      const b = BALANCE.blade;
      color = 0x9fd8ff;
      len = 20;
      if (f.waltzActive) {
        // 华尔兹：显示固定 350px 穿刺轨迹（虚线，遇墙截断）
        const wp = this.host.cameras.main.getWorldPoint(p.x, p.y);
        const ang = Math.atan2(wp.y - f.y, wp.x - f.x);
        const dashLen = 20;
        const gap = 12;
        g.lineStyle(3, 0xd9f0ff, 0.75);
        const stopAt = b.waltzPierceWalls
          ? b.waltzDist
          : Math.max(BODY_R, Math.min(
            b.waltzDist,
            rayWallDistance(f.x, f.y, Math.cos(ang), Math.sin(ang), b.waltzDist, this.host.wallRects) - BODY_R,
          ));
        for (let d0 = BODY_R; d0 < stopAt; d0 += dashLen + gap) {
          const d1 = Math.min(stopAt, d0 + dashLen);
          g.lineBetween(
            f.x + Math.cos(ang) * d0, f.y + Math.sin(ang) * d0,
            f.x + Math.cos(ang) * d1, f.y + Math.sin(ang) * d1,
          );
        }
        g.lineStyle(2, 0xffffff, 0.5);
        g.strokeCircle(f.x + Math.cos(ang) * stopAt, f.y + Math.sin(ang) * stopAt, 9);
        // 前 300px / 最后 50px 分界
        g.lineStyle(1.5, 0x9fd8ff, 0.45);
        const mx = f.x + Math.cos(ang) * b.waltzFastDist;
        const my = f.y + Math.sin(ang) * b.waltzFastDist;
        g.lineBetween(mx - Math.cos(ang + Math.PI / 2) * 7, my - Math.sin(ang + Math.PI / 2) * 7,
          mx + Math.cos(ang + Math.PI / 2) * 7, my + Math.sin(ang + Math.PI / 2) * 7);
      } else if (f.parryCharging) {
        // 招架蓄力：光圈随蓄力扩张，满蓄变金色
        const c = clamp(f.parryChargeT / b.parryChargeMax, 0, 1);
        const rr = 30 + 26 * c;
        g.fillStyle(0x9fd8ff, 0.08 + 0.1 * c).fillCircle(f.x, f.y, rr);
        g.lineStyle(4, c >= 0.999 ? 0xfff3a6 : 0x9fd8ff, 0.6 + 0.3 * c).strokeCircle(f.x, f.y, rr);
        g.lineStyle(2, 0xd9f0ff, 0.8).strokeCircle(f.x, f.y, 16);
      } else if (f.parryT > 0) {
        // 招架生效中：护盾弧
        const t2 = now * 0.008;
        g.lineStyle(5, 0xfff3a6, 0.85);
        for (let i = 0; i < 3; i++) {
          const a0 = t2 + (i / 3) * Math.PI * 2;
          g.lineBetween(
            f.x + Math.cos(a0) * 34, f.y + Math.sin(a0) * 34,
            f.x + Math.cos(a0 + 0.9) * 34, f.y + Math.sin(a0 + 0.9) * 34,
          );
        }
      } else if (f.bladeStacks > 0) {
        len = 110;
      }
    } else if (f.charId === CHAR.EMPEROR) {
      color = 0xffd75e;
      len = 46;
      // v0.32：显示 800px 冲锋施法范围与选定终点（墙体终点标红）
      if (!f.emperorChoosing) {
        const e = BALANCE.emperor;
        const wp = this.host.cameras.main.getWorldPoint(p.x, p.y);
        let tx = wp.x;
        let ty = wp.y;
        const d = dist(f.x, f.y, tx, ty);
        if (d > e.chargeRange) {
          const k = e.chargeRange / d;
          tx = f.x + (tx - f.x) * k;
          ty = f.y + (ty - f.y) * k;
        }
        const spin = now * 0.002;
        const R = e.chargeRange;
        g.lineStyle(2, 0xffd75e, 0.34);
        for (let i = 0; i < 32; i += 2) {
          const a0 = spin + (i / 32) * Math.PI * 2;
          const a1 = spin + ((i + 1.15) / 32) * Math.PI * 2;
          g.lineBetween(
            f.x + Math.cos(a0) * R, f.y + Math.sin(a0) * R,
            f.x + Math.cos(a1) * R, f.y + Math.sin(a1) * R,
          );
        }
        g.lineStyle(1, 0xffe8a0, 0.2);
        g.strokeCircle(f.x, f.y, e.summonRadius);
        g.lineStyle(1, 0xffd75e, 0.18);
        g.lineBetween(f.x, f.y, tx, ty);
        const inWall = pointInRects(tx, ty, this.host.wallRects);
        g.lineStyle(2, inWall ? 0xff4d4d : 0xfff0c8, 0.9);
        g.strokeCircle(tx, ty, 16);
        g.fillStyle(inWall ? 0xff4d4d : 0xffd75e, 0.18).fillCircle(tx, ty, 16);
      }
    } else if (f.charId === CHAR.WAR) {
      color = 0xff6b6b;
      len = 46;
      // 充能达到门槛时预览毁灭激光：宽度随充能增长，遇墙截断
      const b = BALANCE.war;
      const suppress = f.warOverloadUnlocked && f.warSuppress;
      // 火力压制形态使用持续激光，不再显示右键范围预览
      if (!suppress && f.warCharge >= b.laserNeed) {
        // 核心超载：单次激光最多按 100 充能计算宽度
        const charge = Math.min(Math.floor(f.warCharge), b.laserChargeCap);
        const width = b.laserWidthMin
          + (b.laserWidthMax - b.laserWidthMin)
          * clamp((charge - b.laserNeed) / (b.laserChargeCap - b.laserNeed), 0, 1);
        const beamLen = rayWallDistance(
          f.x, f.y, Math.cos(a), Math.sin(a), MAP_SIZE * 2.5, this.host.wallRects,
        );
        const px = -Math.sin(a);
        const py = Math.cos(a);
        const ex = f.x + Math.cos(a) * beamLen;
        const ey = f.y + Math.sin(a) * beamLen;
        const half = width / 2;
        g.fillStyle(0xff3b3b, 0.10);
        g.beginPath();
        g.moveTo(f.x + px * half, f.y + py * half);
        g.lineTo(ex + px * half, ey + py * half);
        g.lineTo(ex - px * half, ey - py * half);
        g.lineTo(f.x - px * half, f.y - py * half);
        g.closePath();
        g.fillPath();
        g.lineStyle(1.5, 0xff8a8a, 0.5);
        g.lineBetween(f.x + px * half, f.y + py * half, ex + px * half, ey + py * half);
        g.lineBetween(f.x - px * half, f.y - py * half, ex - px * half, ey - py * half);
        g.lineStyle(1, 0xffd0d0, 0.35);
        g.lineBetween(f.x, f.y, ex, ey);
        // 中心（全额）/ 两侧（半额）分界
        g.lineStyle(1, 0xffe07a, 0.35);
        g.lineBetween(f.x + px * width / 4, f.y + py * width / 4, ex + px * width / 4, ey + py * width / 4);
        g.lineBetween(f.x - px * width / 4, f.y - py * width / 4, ex - px * width / 4, ey - py * width / 4);
      }
    }
    // v0.21：风女蓄力时方向已锁定，不再画跟随鼠标的通用瞄准线（避免与实际弹道矛盾）
    if (!(f.charId === CHAR.WIND && f.gustCharging)) {
      g.lineStyle(2, color, 0.85);
      g.lineBetween(f.x, f.y, f.x + Math.cos(a) * len, f.y + Math.sin(a) * len);
      g.fillStyle(color, 0.9);
      g.fillCircle(f.x + Math.cos(a) * (len + 2), f.y + Math.sin(a) * (len + 2), 2.5);
    }
  }

  drawBurnZones() {
    const g = this.burnG;
    g.clear();
    const t = this.host.time.now * 0.01;
    for (const z of this.host.burnZones) {
      const flick = 0.1 + 0.05 * Math.sin(t * 7 + z.x * 0.01);
      g.fillStyle(0xe0702a, flick);
      g.fillRect(z.x - z.half, z.y - z.half, z.half * 2, z.half * 2);
      g.lineStyle(2, 0xf2a03c, 0.16);
      const x0 = z.x - z.half;
      const y0 = z.y - z.half;
      const x1 = z.x + z.half;
      const y1 = z.y + z.half;
      for (let k = 24; k < z.half * 2; k += 24) {
        g.lineBetween(x0 + k, y0, x0, y0 + k);
        g.lineBetween(x1 - k, y1, x1, y1 - k);
      }
      g.lineStyle(3, 0xff6b2a, 0.85);
      g.strokeRect(z.x - z.half, z.y - z.half, z.half * 2, z.half * 2);
    }
  }

  drawWarnings() {
    const g = this.warnG;
    g.clear();
    const pulse = 0.5 + 0.5 * Math.sin(this.host.time.now * 0.02);

    for (const s of this.host.pendingStrikes) {
      const p = 1 - s.remain / s.total;
      const h = BALANCE.bomber.strikeHalf;
      g.lineStyle(3, 0xff4d4d, 0.55 + 0.4 * pulse);
      g.strokeRect(s.x - h, s.y - h, h * 2, h * 2);
      g.fillStyle(0xff4d4d, 0.12 + 0.1 * pulse);
      g.fillRect(s.x - h, s.y - h, h * 2, h * 2);
      g.lineStyle(2, 0xffd98a, 0.7 * (1 - p));
      g.strokeCircle(s.x, s.y, Math.max(8, h * (1 - p)));
    }

    // 小轰炸预警
    for (const m of this.host.miniBombs) {
      const p = 1 - m.remain / m.total;
      const h = BALANCE.bomber.miniHalf;
      g.fillStyle(0xff8a3c, 0.16 + 0.08 * pulse);
      g.fillRect(m.x - h, m.y - h, h * 2, h * 2);
      g.lineStyle(2, 0xffb84d, 0.85);
      g.strokeRect(m.x - h, m.y - h, h * 2, h * 2);
      g.lineStyle(2, 0xfff3a6, 0.75 * (1 - p));
      g.strokeCircle(m.x, m.y, Math.max(5, h * (1 - p)));
    }

    // 奥术排斥 / 抓取预警
    for (const r of this.host.repulses) {
      const p = 1 - r.remain / r.total;
      const rr = r.radius;
      const col = r.pull ? 0xb48aff : 0x9b5cff;
      g.fillStyle(col, 0.14).fillCircle(r.x, r.y, rr);
      g.lineStyle(3, col, 0.9).strokeCircle(r.x, r.y, rr);
      g.fillStyle(0xffffff, 0.55).fillCircle(r.x, r.y, rr * p);
      if (r.pull) {
        g.lineStyle(2, 0xd9c2ff, 0.8);
        for (let i = 0; i < 4; i++) {
          const ang = (i / 4) * Math.PI * 2;
          const x0 = r.x + Math.cos(ang) * (rr - 4);
          const y0 = r.y + Math.sin(ang) * (rr - 4);
          g.lineBetween(x0, y0, r.x + Math.cos(ang) * 12, r.y + Math.sin(ang) * 12);
        }
      }
    }
  }

  /* ================= 小地图 ================= */

  drawMinimap() {
    const g = this.miniG;
    g.clear();
    const host = this.host;
    const W = 190;
    const px0 = GAME_WIDTH - W - 8;
    const py0 = 8;
    g.fillStyle(0x0c1122, 0.55).fillRect(px0, py0, W, W);
    const pad = 8;
    const nb = host.layout.bounds;
    const arenaW = nb && nb.w < MAP_SIZE ? nb.w : MAP_SIZE;
    const arenaH = nb && nb.h < MAP_SIZE ? nb.h : MAP_SIZE;
    const arenaX = nb && nb.w < MAP_SIZE ? nb.x - nb.w / 2 : 0;
    const arenaY = nb && nb.h < MAP_SIZE ? nb.y - nb.h / 2 : 0;
    const s = (W - pad * 2) / arenaW;
    const ox = px0 + pad - arenaX * s;
    const oy = py0 + pad - arenaY * s;
    g.fillStyle(0x27324e, 0.5).fillRect(px0 + pad, py0 + pad, arenaW * s, arenaH * s);

    g.fillStyle(0xe9effb, 0.85);
    for (const r of host.wallRects) {
      g.fillRect(ox + r.x * s, oy + r.y * s, Math.max(2, r.width * s), Math.max(2, r.height * s));
    }

    // 推车模式：铁轨 / 火车头 / 重生室（双方都能看到）
    if (host.mode === MODE.PAYLOAD) {
      const rail = host.layout.rails;
      if (rail) {
        // 折线铁轨：逐段连线
        g.lineStyle(Math.max(2, 5 * s), 0xb08a5a, 0.95);
        for (let i = 0; i + 1 < rail.path.length; i++) {
          const a = rail.path[i];
          const b = rail.path[i + 1];
          g.lineBetween(ox + a.x * s, oy + a.y * s, ox + b.x * s, oy + b.y * s);
        }
      }
      for (const rm of host.layout.rooms ?? []) {
        g.lineStyle(1.2, 0x9aa8c4, 0.9);
        g.strokeRect(ox + (rm.x - rm.w / 2) * s, oy + (rm.y - rm.h / 2) * s,
          rm.w * s, rm.h * s);
      }
      g.fillStyle(0xff8a3c, 1);
      g.fillCircle(ox + host.cartX * s, oy + host.cartY * s, 3.6);
      g.lineStyle(1, 0xffc93c, 0.8);
      g.strokeCircle(ox + host.cartX * s, oy + host.cartY * s, PAYLOAD.radius * s);
    }

    const vr = host.visionRadius;
    g.lineStyle(1.5, host.player.arcaneCharging ? 0xb48aff : 0xffffff, 0.45);
    g.strokeCircle(ox + host.player.x * s, oy + host.player.y * s, vr * s);

    for (const st of host.storms) {
      if (dist(st.x, st.y, host.player.x, host.player.y) > vr) continue;
      g.lineStyle(1, 0x59d3e3, 0.75);
      g.strokeCircle(ox + st.x * s, oy + st.y * s, st.r * s);
      g.fillStyle(0xffffff, 0.85);
      g.fillCircle(ox + st.x * s, oy + st.y * s, 1.6);
    }

    for (const z of host.burnZones) {
      if (dist(z.x, z.y, host.player.x, host.player.y) > vr + 50) continue;
      g.fillStyle(0xf2a03c, 0.6);
      g.fillRect(ox + (z.x - z.half) * s, oy + (z.y - z.half) * s, z.half * 2 * s, z.half * 2 * s);
    }

    for (const st of host.pendingStrikes) {
      g.lineStyle(1, 0xff4d4d, 0.9);
      g.strokeRect(ox + (st.x - BALANCE.bomber.strikeHalf) * s,
        oy + (st.y - BALANCE.bomber.strikeHalf) * s,
        BALANCE.bomber.strikeHalf * 2 * s, BALANCE.bomber.strikeHalf * 2 * s);
    }

    for (const f of host.fighters) {
      if (f === host.player || !f.alive) continue;
      const teammate = host.mode !== MODE.BRAWL && f.team === host.player.team;
      if (!teammate && dist(f.x, f.y, host.player.x, host.player.y) > vr) continue;
      g.fillStyle(host.mode === MODE.BRAWL ? CHAR_COLOR[f.charId] : (teammate ? 0x57c8ff : 0xff5f6d), 1);
      g.fillCircle(ox + f.x * s, oy + f.y * s, 3.2);
    }

    g.fillStyle(host.mode === MODE.BRAWL ? 0x57e08b : 0x9bffb8, 1);
    g.fillCircle(ox + host.player.x * s, oy + host.player.y * s, 3.2);

    // 帝君雄兵（仅己方可见）
    for (const sol of host.soldiers) {
      if (sol.dead || sol.owner !== host.player) continue;
      g.fillStyle(0xf0c23a, 1);
      g.fillCircle(ox + sol.x * s, oy + sol.y * s, 2.4);
    }

    g.lineStyle(2, 0x49536e, 0.9);
    g.strokeRect(px0, py0, W, W);
  }

  /* ================= 轰炸子地图 ================= */

  drawSubMap() {
    const host = this.host;
    const p = host.player;
    const active = p.charId === CHAR.BOMBER && p.bombTargeting;
    this.subBackdrop.setVisible(active);
    this.subMapG.setVisible(active);
    this.subHint.setVisible(active);
    if (!active) return;
    // 同一张轰炸地图：左键选普通轰炸点，右键锁定终极导弹目标，空格确认
    const finalReady = p.bomberEquipUnlocked && !p.finalUsed;
    const onCd = p.skillCd > 0;
    if (p.finalArmed && p.finalTarget) {
      this.subHint.setText(onCd
        ? '已锁定终极导弹目标 · 空格 发射 | ESC 取消'
        : '已锁定终极导弹目标 · 空格 发射 | 左键 改选轰炸点 | ESC 取消');
    } else if (onCd) {
      this.subHint.setText(finalReady
        ? '技能冷却中 · 右键 锁定最后狂欢目标 | 空格 发射 | ESC 取消'
        : '技能冷却中 · 暂无可施放的技能 | ESC 取消');
    } else if (finalReady) {
      this.subHint.setText('左键 选择轰炸点 / 右键 锁定终极导弹目标 | 空格 确认 | ESC 取消');
    } else {
      this.subHint.setText('左键 选择轰炸点 | 右键/空格 启动轰炸 | ESC 取消（选点期间无法移动）');
    }

    const g = this.subMapG;
    g.clear();
    // 与输入换算共用同一份几何：缩小关卡（冒险模式第一关）也严格对齐
    const gm = subMapGeometry(host.layout.bounds);
    const size = gm.size;
    const pad = gm.pad;
    const s = gm.s;
    const x0 = gm.x0;
    const y0 = gm.y0;

    g.fillStyle(0x0c1122, 0.94).fillRoundedRect(x0, y0, size, size, 10);
    g.fillStyle(0x27324e, 0.9).fillRect(x0 + pad, y0 + pad, gm.arenaW * s, gm.arenaH * s);
    const ax = gm.ox;
    const ay = gm.oy;
    g.fillStyle(0xe9effb, 0.9);
    for (const r of host.wallRects) {
      g.fillRect(ax + r.x * s, ay + r.y * s, Math.max(2, r.width * s), Math.max(2, r.height * s));
    }
    for (const z of host.burnZones) {
      g.fillStyle(0xf2a03c, 0.6);
      g.fillRect(ax + (z.x - z.half) * s, ay + (z.y - z.half) * s, z.half * 2 * s, z.half * 2 * s);
    }
    for (const f of host.fighters) {
      if (!f.alive) continue;
      g.fillStyle(f === host.player ? 0x57e08b : CHAR_COLOR[f.charId], 1);
      g.fillCircle(ax + f.x * s, ay + f.y * s, f === host.player ? 4 : 5);
      if (f === host.player) {
        g.lineStyle(1, 0xffffff, 0.8);
        g.strokeCircle(ax + f.x * s, ay + f.y * s, 5);
      }
    }
    // 普通轰炸落点预览：技能冷却中不显示（此时无法选点，只能锁定最后狂欢）
    if (p.skillCd <= 0) {
      const hw = BALANCE.bomber.strikeHalf * s;
      const bx = ax + host.player.bombTX * s;
      const by = ay + host.player.bombTY * s;
      g.fillStyle(0xff4d4d, 0.22);
      g.fillRect(bx - hw, by - hw, hw * 2, hw * 2);
      g.lineStyle(2, 0xff4d4d, 0.95);
      g.strokeRect(bx - hw, by - hw, hw * 2, hw * 2);
      // 小轰炸散布范围预览（400px 圆）
      const mh = BALANCE.bomber.miniRange * s;
      g.lineStyle(1, 0xffb84d, 0.7);
      g.strokeCircle(bx, by, mh);
      g.lineStyle(1, 0xffffff, 0.9);
      g.lineBetween(bx - 6, by, bx + 6, by);
      g.lineBetween(bx, by - 6, bx, by + 6);
    }
    // 最后狂欢：右键锁定的单体目标（空格确认后发射终极导弹）
    const t = p.finalTarget;
    if (t && t.alive) {
      const tx = ax + t.x * s;
      const ty = ay + t.y * s;
      const r = 10 + Math.sin(host.time.now * 0.008) * 2;
      const locked = p.finalArmed;
      g.lineStyle(2, 0xff4d4d, locked ? 1 : 0.5).strokeCircle(tx, ty, r);
      g.lineStyle(1, 0xffe27a, locked ? 0.9 : 0.45).strokeCircle(tx, ty, r + 5);
      g.lineStyle(1, 0xffe27a, locked ? 0.9 : 0.45);
      g.lineBetween(tx - r - 8, ty, tx - r - 2, ty);
      g.lineBetween(tx + r + 2, ty, tx + r + 8, ty);
      g.lineBetween(tx, ty - r - 8, tx, ty - r - 2);
      g.lineBetween(tx, ty + r + 2, tx, ty + r + 8);
    }

    g.lineStyle(2, 0x49536e, 1);
    g.strokeRoundedRect(x0, y0, size, size, 10);
  }

  /* ================= HUD ================= */

  drawHpBars() {
    const host = this.host;
    for (const f of host.fighters) {
      const g = host.hpG.get(f)!;
      g.clear();
      const t = host.hpNames.get(f)!;
      const timer = host.respawnTimers.get(f);
      if (!f.alive) {
        t.setPosition(f.x, f.y - 74);
        t.setText(`${f.name} · 复活 ${timer !== undefined ? Math.ceil(timer) : 0}s`);
        t.setVisible(true);
        continue;
      }
      t.setPosition(f.x, f.y - 74);
      t.setText(`${f.name}  ⚔${f.kills}`);
      t.setVisible(true);
      const x = f.x - 25;
      const y = f.y - 56;
      g.fillStyle(0x0d1120, 0.85).fillRect(x - 1, y - 1, 52, 9);
      const pct = clamp(f.hp / f.maxHp, 0, 1);
      // v0.22：血条不再随血量变色——己方恒绿、敌对恒红，仅宽度随血量变化
      const hostile = host.mode === MODE.BRAWL ? f !== host.player : f.team !== host.player.team;
      const color = hostile ? 0xff3b3b : 0x57e08b;
      g.fillStyle(color, 1).fillRect(x, y, 50 * pct, 7);
      // 引线：橙色层数条，叠满 fuseMaxStacks 层即触发爆破
      if (f.fuseStacks > 0) {
        const fp = clamp(f.fuseStacks / BALANCE.bomber.fuseMaxStacks, 0, 1);
        g.fillStyle(0x0d1120, 0.85).fillRect(x - 1, y - 8, 52, 6);
        g.fillStyle(0xff8a3c, 1).fillRect(x, y - 7, 50 * fp, 4);
        if (fp >= 1) g.fillStyle(0xfff3a6, 1).fillRect(x, y - 7, 50 * fp, 4);
      }
      if (f.charId === CHAR.WIND && f.gustCharging) {
        const p = clamp(f.gustChargeT / BALANCE.wind.chargeMax, 0, 1);
        g.fillStyle(0x0d1120, 0.85).fillRect(x - 1, y + 10, 52, 6);
        g.fillStyle(0x8be8f2, 1).fillRect(x, y + 11, 50 * p, 4);
      }
      if (f.charId === CHAR.ARCANE && f.arcaneCharging) {
        const p = clamp(f.arcaneChargeT / BALANCE.arcane.chargeDur, 0, 1);
        // 明显的蓄力特效：脉动光环 + 旋转符文（所有角色都可见）
        const rr = 58 + 42 * p;
        g.fillStyle(0x9b5cff, 0.12 + 0.1 * p).fillCircle(f.x, f.y, rr + 20);
        g.fillStyle(0xd9c2ff, 0.14 + 0.1 * p).fillCircle(f.x, f.y, rr * 0.75);
        g.lineStyle(5, 0xe8d6ff, 0.7 + 0.3 * p).strokeCircle(f.x, f.y, rr);
        g.lineStyle(2, 0xffffff, 0.65 * p).strokeCircle(f.x, f.y, rr * 0.55);
        const spin = host.time.now * 0.004;
        g.lineStyle(3, 0xc9a6ff, 0.85);
        for (let k = 0; k < 6; k++) {
          const a = spin + (k / 6) * Math.PI * 2;
          g.lineBetween(
            f.x + Math.cos(a) * (rr * 0.7), f.y + Math.sin(a) * (rr * 0.7),
            f.x + Math.cos(a) * (rr * 1.06), f.y + Math.sin(a) * (rr * 1.06),
          );
        }
        g.fillStyle(0x0d1120, 0.85).fillRect(x - 1, y + 10, 52, 6);
        g.fillStyle(0xb48aff, 1).fillRect(x, y + 11, 50 * p, 4);
      }
      if (f.charId === CHAR.GUNNER && f.atkCd > 0 && !f.skillActive) {
        const p = 1 - f.atkCd / BALANCE.gunner.atkCD;
        g.fillStyle(0x0d1120, 0.85).fillRect(x - 1, y + 10, 52, 6);
        g.fillStyle(0xf2c94c, 1).fillRect(x, y + 11, 50 * p, 4);
      }
      if (f.charId === CHAR.BLADE) {
        const b = BALANCE.blade;
        // 剑势条：40 层，20 层处画开启刻度
        const sp = clamp(f.bladeStacks / b.maxStacks, 0, 1);
        g.fillStyle(0x0d1120, 0.85).fillRect(x - 1, y - 8, 52, 6);
        g.fillStyle(f.bladeStacks >= b.waltzNeedStacks ? 0x9fd8ff : 0x4b7fa8, 1)
          .fillRect(x, y - 7, 50 * sp, 4);
        g.fillStyle(0xfff3a6, 1).fillRect(
          x + 50 * (b.waltzNeedStacks / b.maxStacks) - 1, y - 8, 2, 6,
        );
        // 招架蓄力条
        if (f.parryCharging) {
          const p = clamp(f.parryChargeT / b.parryChargeMax, 0, 1);
          g.fillStyle(0x0d1120, 0.85).fillRect(x - 1, y + 10, 52, 6);
          g.fillStyle(p >= 0.999 ? 0xfff3a6 : 0x8be8f2, 1).fillRect(x, y + 11, 50 * p, 4);
        }
      }
      if (f.charId === CHAR.BOMBER && f.bombTargeting) {
        g.lineStyle(2, 0xff4d4d, 0.9);
        g.strokeCircle(x + 25, y + 3, 7);
      }
    }
  }

  /** 底部中心四段式 HUD：血量/护盾 · 普攻冷却 · 技能冷却 · 特定资源（紧凑无遮挡） */
  drawSkillPanel() {
    const host = this.host;
    const g = this.panelG;
    g.clear();
    const f = host.player;
    const pulse = 0.6 + 0.4 * Math.sin(host.time.now * 0.008);

    // 面板底
    g.fillStyle(0x0c1122, 0.85).fillRoundedRect(250, 540, 460, 48, 8);
    g.lineStyle(1.5, 0x3a4560, 0.9).strokeRoundedRect(250, 540, 460, 48, 8);

    const barY = 559;
    const barH = 12;
    const segX = [305, 415, 525, 635];

    // ---- 血量/护盾（护盾为灰色，接在血量右侧）----
    {
      const w = 96;
      const x = segX[0] - w / 2;
      const hpW = w * clamp(f.hp / f.maxHp, 0, 1);
      const shW = Math.min(w * clamp(f.shield / f.maxHp, 0, 1), w - hpW);
      g.fillStyle(0x232b42, 1).fillRect(x, barY, w, barH);
      g.fillStyle(0x57e08b, 1).fillRect(x, barY, hpW, barH);
      if (shW > 0) g.fillStyle(0x9aa4b8, 1).fillRect(x + hpW, barY, shW, barH);
      g.lineStyle(1, 0x3a4560, 1).strokeRect(x, barY, w, barH);
      this.hudHpT.setText(
        `${Math.ceil(f.hp)}/${f.maxHp}` + (f.shield > 0 ? `(+${Math.ceil(f.shield)})` : ''),
      );
    }

    // ---- 普攻冷却（利剑舞者显示招架蓄力）----
    {
      const w = 90;
      const x = segX[1] - w / 2;
      let p = 1;
      let color = 0x57e08b;
      let label = '就绪';
      if (f.charId === CHAR.BLADE) {
        if (f.parryCharging) {
          p = clamp(f.parryChargeT / BALANCE.blade.parryChargeMax, 0, 1);
          color = p >= 0.999 ? 0xffe07a : 0x8be8f2;
          label = p >= 0.999 ? '满蓄' : '蓄力';
        } else if (f.parryT > 0) {
          color = 0x8be8f2;
          label = '招架';
        }
      } else if (f.charId === CHAR.EMPEROR) {
        // 帝君没有普攻：该槽显示左键冲锋冷却（随方针变化）
        const maxCd = host.emperorChargeCdMax(f);
        if (f.emperorChargeCd > 0) {
          p = 1 - f.emperorChargeCd / maxCd;
          color = 0x8fa3c8;
          label = f.emperorChargeCd.toFixed(1);
        } else {
          color = 0xf0c23a;
        }
      } else {
        const maxCd = f.charId === CHAR.GUNNER ? BALANCE.gunner.atkCD
          : f.charId === CHAR.WIND ? BALANCE.wind.releaseCd
          : f.charId === CHAR.BOMBER ? BALANCE.bomber.atkCD * f.atkCdMul
          : f.charId === CHAR.WAR ? BALANCE.war.atkCD
          : BALANCE.arcane.atkCD;
        if (f.atkCd > 0) {
          p = 1 - f.atkCd / maxCd;
          color = 0x8fa3c8;
          label = f.atkCd.toFixed(1);
        }
      }
      g.fillStyle(0x232b42, 1).fillRect(x, barY, w, barH);
      g.fillStyle(color, 1).fillRect(x, barY, w * p, barH);
      g.lineStyle(1, 0x3a4560, 1).strokeRect(x, barY, w, barH);
      this.hudAtkT.setText(label);
    }

    // ---- 技能冷却 ----
    {
      const w = 90;
      const x = segX[2] - w / 2;
      let p = 1;
      let color = 0xf2c94c;
      let label = '就绪';
      let readyPulse = false;
      if (f.charId === CHAR.GUNNER) {
        if (f.lockTarget) {
          p = 1;
          color = 0x9be8ff;
          label = '锁定';
        } else if (f.highNoonCharging) {
          p = clamp(f.highNoonT / BALANCE.gunner.highNoonMaxCharge, 0, 1);
          color = 0xff6b3c;
          label = '午时';
        } else if (f.skillActive) {
          p = clamp(f.skillTimer / Math.max(0.01, f.skillDurMax || BALANCE.gunner.skillDurBase), 0, 1);
          label = '风暴中';
        } else if (!f.gunnerReady) {
          p = f.chargeHits / BALANCE.gunner.hitsToReady;
          color = 0x8fa3c8;
          label = `${f.chargeHits}/${BALANCE.gunner.hitsToReady}`;
        } else {
          readyPulse = true;
        }
      } else if (f.charId === CHAR.WIND) {
        const active = host.storms.some((s) => s.owner === f && s.active);
        if (active) {
          color = 0x3fbfc8;
          label = '旋风中';
        } else if (f.skillCd > 0) {
          p = 1 - f.skillCd / BALANCE.wind.skillCd;
          color = 0x8fa3c8;
          label = f.skillCd.toFixed(1);
        } else {
          color = 0x3fbfc8;
          readyPulse = true;
        }
      } else if (f.charId === CHAR.BOMBER) {
        if (f.bombTargeting && f.finalArmed) {
          color = 0xff4d4d;
          label = '已锁定';
        } else if (f.bombTargeting) {
          color = 0xff4d4d;
          label = '瞄准中';
        } else if (f.skillCd > 0) {
          p = 1 - f.skillCd / BALANCE.bomber.skillCd;
          color = 0x8fa3c8;
          label = f.skillCd.toFixed(1);
        } else {
          color = 0xff9d4d;
          readyPulse = true;
        }
      } else if (f.charId === CHAR.ARCANE) {
        if (f.arcaneCharging) {
          p = clamp(f.arcaneChargeT / BALANCE.arcane.chargeDur, 0, 1);
          color = 0xb48aff;
          label = '蓄力';
        } else if (f.skillCd > 0) {
          p = 1 - f.skillCd / BALANCE.arcane.skillCd;
          color = 0x8fa3c8;
          label = f.skillCd.toFixed(1);
        } else {
          color = 0x9b5cff;
          readyPulse = true;
        }
      } else if (f.charId === CHAR.EMPEROR) {
        if (f.emperorChoosing) {
          color = 0xffd75e;
          label = '选方针';
        } else if (f.skillCd > 0) {
          p = 1 - f.skillCd / host.emperorSkillCdMax(f);
          color = 0x8fa3c8;
          label = f.skillCd.toFixed(1);
        } else if (f.emperorPolicy === 0) {
          color = 0xffd75e;
          label = '独裁';
          readyPulse = true;
        } else {
          color = 0xf0c23a;
          label = '统治';
          readyPulse = true;
        }
      } else if (f.charId === CHAR.WAR) {
        if (f.warAnnT > 0) {
          p = clamp(f.warAnnT / BALANCE.war.annDur, 0, 1);
          color = 0xff4d4d;
          label = '歼灭';
        } else if (f.warHolding) {
          p = clamp(f.warHoldT / BALANCE.war.annHold, 0, 1);
          color = 0xff8a8a;
          label = '蓄势';
        } else if (f.warAnnCd > 0) {
          p = 1 - f.warAnnCd / BALANCE.war.annCd;
          color = 0x8fa3c8;
          label = f.warAnnCd.toFixed(1);
        } else {
          color = 0xd63a3a;
          readyPulse = true;
        }
      } else {
        if (f.waltzActive) {
          color = 0x9fd8ff;
          label = '华尔兹';
        } else if (f.bladeWaltzReady) {
          color = 0x9fd8ff;
          readyPulse = true;
        } else {
          p = clamp(f.bladeStacks / BALANCE.blade.waltzNeedStacks, 0, 1);
          color = 0x4b7fa8;
          label = `${f.bladeStacks}/${BALANCE.blade.waltzNeedStacks}`;
        }
      }
      g.fillStyle(0x232b42, 1).fillRect(x, barY, w, barH);
      g.fillStyle(color, 1).fillRect(x, barY, w * p, barH);
      g.lineStyle(1, 0x3a4560, 1).strokeRect(x, barY, w, barH);
      if (readyPulse) {
        g.lineStyle(2, color, pulse).strokeRect(x - 2, barY - 2, w + 4, barH + 4);
      }
      this.hudSkillT.setText(label);
    }

    // ---- 特定资源 ----
    {
      const w = 90;
      const x = segX[3] - w / 2;
      if (f.charId === CHAR.GUNNER) {
        // 底气：上限 16 层，分两行各 8 点；第 8 点为弹幕风暴开启阈值
        const max = BALANCE.gunner.chargeMax;
        const perRow = 8;
        const threshold = BALANCE.gunner.hitsToReady - 1;
        for (let i = 0; i < max; i++) {
          const row = Math.floor(i / perRow);
          const col = i % perRow;
          const dx = segX[3] - 31.5 + col * 9;
          const dy = barY + 6 + row * 10;
          const on = i < f.chargeHits;
          g.fillStyle(on ? (i === threshold ? 0xffe07a : 0xf2c94c) : 0x2a3350, 1).fillCircle(dx, dy, 3);
          g.lineStyle(1, i === threshold ? 0xffe07a : 0x0c1122, 1).strokeCircle(dx, dy, 3);
        }
        this.hudResT.setText('');
      } else if (f.charId === CHAR.WIND) {
        // 右键狂风积攒进度
        let p = 0;
        let color = 0x8be8f2;
        let label = '—';
        if (f.gustCharging) {
          p = clamp(f.gustChargeT / BALANCE.wind.chargeMax, 0, 1);
          color = p >= 0.999 ? 0xffe07a : 0x8be8f2;
          label = p >= 0.999 ? '满蓄' : '积攒';
        }
        g.fillStyle(0x232b42, 1).fillRect(x, barY, w, barH);
        if (p > 0) g.fillStyle(color, 1).fillRect(x, barY, w * p, barH);
        g.lineStyle(1, 0x3a4560, 1).strokeRect(x, barY, w, barH);
        this.hudResT.setText(label);
      } else if (f.charId === CHAR.BLADE) {
        // 剑势条（40 层，20 层开启刻度）
        const b = BALANCE.blade;
        const sp = clamp(f.bladeStacks / b.maxStacks, 0, 1);
        g.fillStyle(0x232b42, 1).fillRect(x, barY, w, barH);
        g.fillStyle(f.bladeStacks >= b.waltzNeedStacks ? 0x9fd8ff : 0x4b7fa8, 1)
          .fillRect(x, barY, w * sp, barH);
        g.fillStyle(0xfff3a6, 1)
          .fillRect(x + w * (b.waltzNeedStacks / b.maxStacks) - 1, barY - 1, 2, barH + 2);
        g.lineStyle(1, 0x3a4560, 1).strokeRect(x, barY, w, barH);
        this.hudResT.setText(`${f.bladeStacks}/${b.maxStacks}`);
      } else if (f.charId === CHAR.ARCANE) {
        if (f.arcaneEquipUnlocked) {
          // 终极法典·蓄能：0~100 能量条（满能量获得 30s 暴击强化）
          const b = BALANCE.arcane;
          const ep = clamp(f.arcaneEnergy / b.codexEnergyMax, 0, 1);
          g.fillStyle(0x232b42, 1).fillRect(x, barY, w, barH);
          g.fillStyle(f.arcaneBuffT > 0 ? 0xffd75e : 0x9b5cff, 1)
            .fillRect(x, barY, w * ep, barH);
          g.lineStyle(1, 0x3a4560, 1).strokeRect(x, barY, w, barH);
          let label = `${Math.floor(f.arcaneEnergy)}/${b.codexEnergyMax}`;
          if (f.arcaneBeamHeld) label = '轰击';
          else if (f.arcaneBuffT > 0) label = `强化 ${Math.ceil(f.arcaneBuffT)}s`;
          this.hudResT.setText(label);
        } else {
          // 奥术跃迁状态
          let label = '—';
          let fillP = 0;
          if (f.arcaneCharging) {
            const avail = !f.arcaneJumpUsed && f.arcaneChargeT <= BALANCE.arcane.jumpWindow;
            if (f.arcaneJumpUsed) label = '跃迁已用';
            else if (avail) { label = '跃迁可用'; fillP = 1; }
          }
          g.fillStyle(0x232b42, 1).fillRect(x, barY, w, barH);
          if (fillP > 0) g.fillStyle(0xb48aff, pulse).fillRect(x, barY, w, barH);
          g.lineStyle(1, 0x3a4560, 1).strokeRect(x, barY, w, barH);
          this.hudResT.setText(label);
        }
      } else if (f.charId === CHAR.WAR) {
        // 过载充能条（20 充能刻度 = 毁灭激光使用门槛）
        const ww = BALANCE.war;
        const wmax = f.warChargeMax;
        const cp = clamp(f.warCharge / wmax, 0, 1);
        g.fillStyle(0x232b42, 1).fillRect(x, barY, w, barH);
        g.fillStyle(f.warCharge >= ww.laserNeed ? 0xff6b6b : 0x8e2323, 1)
          .fillRect(x, barY, w * cp, barH);
        g.fillStyle(0xffe07a, 1)
          .fillRect(x + w * (ww.laserNeed / wmax) - 1, barY - 1, 2, barH + 2);
        g.lineStyle(1, 0x3a4560, 1).strokeRect(x, barY, w, barH);
        const form = f.warOverloadUnlocked && f.warSuppress ? ' 压制' : '';
        this.hudResT.setText(`${Math.floor(f.warCharge)}/${wmax}${form}`);
      } else if (f.charId === CHAR.EMPEROR) {
        // 雄兵数量（每名 100 护盾，方针 3 为 1 名 / 400 护盾）
        const max = host.emperorMax(f);
        const n = host.countSoldiers(f);
        const per = 1 / Math.max(1, max);
        g.fillStyle(0x232b42, 1).fillRect(x, barY, w, barH);
        for (let i = 0; i < max; i++) {
          const dx = x + w * (i + 0.5) * per;
          g.fillStyle(i < n ? 0xf0c23a : 0x2a3350, 1).fillCircle(dx, barY + 6, 5);
          g.lineStyle(1, 0x0c1122, 1).strokeCircle(dx, barY + 6, 5);
        }
        g.lineStyle(1, 0x3a4560, 1).strokeRect(x, barY, w, barH);
        const swapLabel = f.emperorPolicy === 3 ? '护驾' : '易位';
        const swap = f.emperorSwapCd > 0 ? ` ${swapLabel}${f.emperorSwapCd.toFixed(1)}` : '';
        this.hudResT.setText(`雄兵 ${n}/${max}${swap}`);
      } else {
        // 轰炸专家：资源槽显示「本次轰炸可触发的小轰炸次数」
        const total = BALANCE.bomber.miniCount + host.miniCountBonus;
        const live = host.miniSpawns.reduce((n, m) => n + m.left, 0);
        g.fillStyle(0x232b42, 1).fillRect(x, barY, w, barH);
        g.fillStyle(0xe07b39, 0.95).fillRect(x, barY, w, barH);
        if (live > 0) {
          g.fillStyle(0xffd166, 1)
            .fillRect(x, barY, w * clamp(live / Math.max(1, total), 0, 1), barH);
        }
        g.lineStyle(1, 0x3a4560, 1).strokeRect(x, barY, w, barH);
        this.hudResT.setText(`小轰炸 ${total} 次`);
      }
    }
  }

  /** 独裁选方针面板（屏幕 UI，选完即隐藏） */
  drawPolicyPanel() {
    const host = this.host;
    const show = host.player.emperorChoosing && host.player.alive;
    if (!show) {
      if (this.policyG.visible) {
        this.policyG.setVisible(false);
        this.policyTitle.setVisible(false);
        for (const t of this.policyCards) t.setVisible(false);
      }
      return;
    }
    this.policyG.setVisible(true);
    this.policyTitle.setVisible(true);
    this.policyTitle.setText(`独裁 · 选择本场方针（1 / 2 / 3 或点击）  ${Math.max(0, Math.ceil(host.player.emperorChoiceT))}s`);
    // v0.32：卡片文案随本局随机抽取的三条方针动态刷新
    const opts = host.player.emperorPolicyOptions;
    for (let i = 0; i < this.policyCards.length; i++) {
      const t = this.policyCards[i];
      const pid = opts[i] ?? 0;
      if (t.getData('pid') !== pid) {
        const def = POLICY_DEFS[pid];
        t.setData('pid', pid);
        t.setText(def ? `方针${i + 1} · ${def.name}\n\n${def.desc}` : '');
      }
    }
    const hover = host.policyIndexAt(host.input.activePointer.x / RENDER_SCALE);
    const blink = 0.5 + 0.5 * Math.sin(host.time.now * 0.008);
    const g = this.policyG;
    g.clear();
    g.fillStyle(0x05070d, 0.62).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    for (let i = 0; i < 3; i++) {
      const cx = GAME_WIDTH / 2 + (i - 1) * 236;
      const w = 216;
      const h = 236;
      const x0 = cx - w / 2;
      const y0 = 250;
      const on = hover === i + 1;
      g.fillStyle(on ? 0x2a2714 : 0x151a26, 0.96).fillRoundedRect(x0, y0, w, h, 12);
      g.lineStyle(on ? 3 : 2, on ? 0xffd75e : 0x7d6a2a, on ? 1 : 0.7)
        .strokeRoundedRect(x0, y0, w, h, 12);
      if (on) {
        g.fillStyle(0xffd75e, 0.12 + 0.06 * blink).fillRoundedRect(x0, y0, w, h, 12);
      }
    }
    for (let i = 0; i < this.policyCards.length; i++) {
      const t = this.policyCards[i];
      t.setVisible(true);
      t.setColor(hover === i + 1 ? '#ffd75e' : '#dfe9ff');
    }
  }

  drawScores() {
    const host = this.host;
    const f = host.player;
    if (host.mode === MODE.PAYLOAD) {
      const atk = host.fighters.filter((x) => x.team === 0).sort((a, b) => b.kills - a.kills);
      const def = host.fighters.filter((x) => x.team === 1).sort((a, b) => b.kills - a.kills);
      const fmt = (x: Fighter) => `${x === host.player ? '你' : x.name.replace(/^(队友·|敌·|机·)/, '')} ⚔${x.kills}`;
      this.scoreT.setText([
        '【进攻方】',
        atk.map(fmt).join('  '),
        '【防守方】',
        def.map(fmt).join('  '),
        `推进圈  攻 ${host.pushAttackers} : 守 ${host.pushDefenders}`,
        '目标：护送火车头抵达终点',
      ].join('\n'));
    } else if (host.mode === MODE.TRAIN) {
      this.scoreT.setText([
        '训练场 · 试炼场',
        '目标：攻击训练木偶，观察 DPS 面板',
        '木偶血量恒定，不会死亡、不会还手',
        'ESC 暂停 · 可随时重选角色',
      ].join('\n'));
    } else if (host.mode === MODE.PVE) {
      const alive = host.fighters.filter((x) => !x.isPlayer && !x.isDummy && x.alive).length;
      this.scoreT.setText([
        '冒险模式',
        `剩余敌人 ${alive}`,
        '目标：清空所有波次',
        '阵亡即挑战失败，不会复活',
      ].join('\n'));
    } else {
      const sorted = [...host.fighters].sort((a, b) => b.kills - a.kills);
      const lines = sorted.map((x, i) => {
        const me = x === host.player ? ' (你)' : '';
        return `${i + 1}. ${x.name}${me}  ⚔${x.kills}`;
      });
      this.scoreT.setText(`${lines.join('\n')}\n\n目标：率先击杀 ${KILLS_TO_WIN} 人`);
    }

    const timer = host.respawnTimers.get(f);
    if (timer !== undefined) {
      // 推车模式只在己方重生室复活：过检查点前为起点室，之后为检查点室
      const where = host.mode === MODE.PAYLOAD
        ? (host.passedCheckpoint ? '检查点重生室' : '起点重生室')
        : host.mode === MODE.TRAIN ? '训练场入口' : '随机位置';
      this.deathHint.setAlpha(1).setText(`你已阵亡\n${Math.ceil(timer)} 秒后在${where}复活`);
    } else {
      this.deathHint.setAlpha(0);
    }
  }

  /** 对手奥术登神蓄力时：视野内给出方向提示（屏幕中心的紫色箭头） */
  drawArcaneAlerts() {
    const host = this.host;
    const g = this.alertG;
    g.clear();
    if (!host.player.alive) return;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const pulse = 0.55 + 0.45 * Math.sin(host.time.now * 0.012);
    for (const f of host.fighters) {
      if (!f.alive || f === host.player) continue;
      if (f.charId !== CHAR.ARCANE || !f.arcaneCharging) continue;
      const d = dist(f.x, f.y, host.player.x, host.player.y);
      if (d > host.visionRadius * 1.4) continue;
      const ang = Math.atan2(f.y - host.player.y, f.x - host.player.x);
      const rad = 132;
      const ax = cx + Math.cos(ang) * rad;
      const ay = cy + Math.sin(ang) * rad;
      // 方向箭头
      g.fillStyle(0x9b5cff, 0.5 + 0.4 * pulse);
      const tip = 20;
      const back = 14;
      const wide = 11;
      g.beginPath();
      g.moveTo(ax + Math.cos(ang) * tip, ay + Math.sin(ang) * tip);
      g.lineTo(
        ax + Math.cos(ang + Math.PI * 0.5) * wide + Math.cos(ang) * -back,
        ay + Math.sin(ang + Math.PI * 0.5) * wide + Math.sin(ang) * -back,
      );
      g.lineTo(
        ax + Math.cos(ang - Math.PI * 0.5) * wide + Math.cos(ang) * -back,
        ay + Math.sin(ang - Math.PI * 0.5) * wide + Math.sin(ang) * -back,
      );
      g.closePath();
      g.fillPath();
      g.lineStyle(2, 0xe8d6ff, 0.9);
      g.strokeCircle(ax, ay, 24);
    }
  }
}
