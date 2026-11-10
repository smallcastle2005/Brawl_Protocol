import Phaser from 'phaser';
import { CHAR, CharId, GAME_WIDTH, GAME_HEIGHT, MODE, MODE_INFO, ModeId } from '../config';
import { FONT_BODY, FONT_MONO, useCrispText } from '../core/text';
import { applyRenderScale } from '../core/view';
import { MAPS } from '../maps';

const CARD_W = 292;
const CARD_H = 320;
const CARD_CY = 318;
const CARD_POS: Partial<Record<ModeId, number>> = {
  [MODE.BRAWL]: 170,
  [MODE.PAYLOAD]: 480,
  [MODE.TRAIN]: 790,
};
const MODE_ORDER: ModeId[] = [MODE.BRAWL, MODE.PAYLOAD, MODE.TRAIN];

/** 本局地图抽签结果（由模式页在开战前随机并告知，再带入选人页） */
interface MapRoll {
  name: string;
  payloadMap?: 'ruins' | 'coral';
  mapIndex?: number;
}

/** 模式选择：游戏流程第一步，选定模式后揭晓本局随机地图，再进入选人页 */
export class ModeScene extends Phaser.Scene {
  private selected: ModeId = MODE.BRAWL;
  private panels = new Map<ModeId, Phaser.GameObjects.Graphics>();
  private contents = new Map<ModeId, Phaser.GameObjects.Container>();
  /** 推车模式提示（地图随机、攻守方在进入战场时随机） */
  private mapRow!: Phaser.GameObjects.Container;
  private reveal: Phaser.GameObjects.Container | null = null;
  private revealOpen = false;
  private roll: MapRoll | null = null;
  /** 防止连按 ENTER / SPACE 触发多次 scene.start */
  private leaving = false;

  constructor() {
    super('Mode');
  }

  init() {
    this.selected = MODE.BRAWL;
    this.reveal = null;
    this.revealOpen = false;
    this.roll = null;
    this.leaving = false;
  }

  create() {
    useCrispText(this);
    applyRenderScale(this);
    this.cameras.main.setBackgroundColor('#10131f');
    this.cameras.main.fadeIn(180);

    // 背景
    const floor = this.add.tileSprite(GAME_WIDTH / 2, GAME_HEIGHT - 56, GAME_WIDTH, 112, 'tex-floor');
    floor.setAlpha(0.4);
    const ghosts: [CharId, number][] = [
      [CHAR.GUNNER, 40], [CHAR.WIND, 216], [CHAR.BOMBER, 392],
      [CHAR.ARCANE, 568], [CHAR.BLADE, 744], [CHAR.WAR, 920],
    ];
    for (const [id, x] of ghosts) {
      this.add.image(x, GAME_HEIGHT - 30, id + '-portrait').setScale(2.4).setAlpha(0.06);
    }

    this.add.text(GAME_WIDTH / 2, 58, '选择游戏模式', {
      fontFamily: FONT_BODY, fontSize: '34px', fontStyle: 'bold', color: '#f2c94c',
    }).setOrigin(0.5).setStroke('#1a1f33', 10).setDepth(5);

    this.add.text(GAME_WIDTH / 2, 104, '先选模式 → 揭晓本局随机地图 → 再选角色', {
      fontFamily: FONT_MONO, fontSize: '13px', color: '#9fb2d8',
    }).setOrigin(0.5).setDepth(5);

    for (const id of MODE_ORDER) this.buildCard(id);
    this.buildMapRow();
    this.refreshSelection();

    // 底部提示
    this.add.text(GAME_WIDTH / 2, 556, '点击卡片选择模式 · 再次点击揭晓随机地图 · 按键 1/2/3 切换 · 回车继续 · ESC 返回主页', {
      fontFamily: FONT_BODY, fontSize: '13px', color: '#c9d6ee',
    }).setOrigin(0.5).setDepth(5);

    this.input.keyboard!.on('keydown-ONE', () => this.select(MODE.BRAWL));
    this.input.keyboard!.on('keydown-TWO', () => this.select(MODE.PAYLOAD));
    this.input.keyboard!.on('keydown-THREE', () => this.select(MODE.TRAIN));
    this.input.keyboard!.on('keydown-LEFT', () => this.select(MODE.BRAWL));
    this.input.keyboard!.on('keydown-RIGHT', () => this.select(MODE.TRAIN));
    this.input.keyboard!.on('keydown-ENTER', () => (this.revealOpen ? this.continueToSelect() : this.revealMap()));
    this.input.keyboard!.on('keydown-SPACE', () => (this.revealOpen ? this.continueToSelect() : this.revealMap()));
    this.input.keyboard!.on('keydown-ESC', () => (this.revealOpen ? this.closeReveal() : this.back()));
  }

  private buildCard(id: ModeId) {
    const info = MODE_INFO[id];
    const cx = CARD_POS[id] ?? 170;
    const panel = this.add.graphics().setDepth(1);
    this.panels.set(id, panel);

    const content = this.add.container(cx, CARD_CY).setDepth(2);
    this.contents.set(id, content);

    // 顶部色带 + 模式名
    const band = this.add.graphics();
    band.fillStyle(info.color, 0.22);
    band.fillRoundedRect(-CARD_W / 2 + 10, -CARD_H / 2 + 10, CARD_W - 20, 54, 8);
    content.add(band);
    const name = this.add.text(0, -CARD_H / 2 + 37, info.name, {
      fontFamily: FONT_BODY, fontSize: '23px', fontStyle: 'bold', color: info.colorText,
    }).setOrigin(0.5);
    name.setStroke('#10131f', 6);
    content.add(name);
    content.add(this.add.text(0, -CARD_H / 2 + 62, info.tag, {
      fontFamily: FONT_MONO, fontSize: '12px', color: '#c9d6ee',
    }).setOrigin(0.5));

    // 简介
    content.add(this.add.text(0, -CARD_H / 2 + 82, info.desc, {
      fontFamily: FONT_BODY, fontSize: '12px', color: '#e8eefb',
      align: 'center', wordWrap: { width: CARD_W - 60, useAdvancedWrap: true },
    }).setOrigin(0.5, 0));

    // 规则要点
    content.add(this.add.text(-CARD_W / 2 + 28, -CARD_H / 2 + 134, info.rules.map((r) => '· ' + r).join('\n'), {
      fontFamily: FONT_BODY, fontSize: '11px', color: '#b9c8e6',
      lineSpacing: 5,
      wordWrap: { width: CARD_W - 56, useAdvancedWrap: true },
    }).setOrigin(0, 0));

    // 点击区域
    const zone = this.add.zone(cx, CARD_CY, CARD_W, CARD_H).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => {
      if (this.selected !== id) this.tweens.add({ targets: content, scale: 1.02, duration: 100 });
    });
    zone.on('pointerout', () => {
      this.tweens.add({ targets: content, scale: 1, duration: 100 });
    });
    zone.on('pointerdown', () => {
      if (this.revealOpen) return;
      if (this.selected === id) this.revealMap();
      else this.select(id);
    });
  }

  private buildMapRow() {
    const cx = CARD_POS[MODE.PAYLOAD];
    const row = this.add.container(cx, 508).setDepth(5);
    row.add(this.add.text(0, 0, '地图与攻守阵营随本局随机，选完模式后揭晓地图', {
      fontFamily: FONT_BODY, fontSize: '12px', color: '#8ea0c6',
    }).setOrigin(0.5));
    this.mapRow = row;
  }

  private select(id: ModeId) {
    if (this.revealOpen || this.selected === id) return;
    this.selected = id;
    this.refreshSelection();
  }

  private refreshSelection() {
    for (const [id, panel] of this.panels) {
      const cx = CARD_POS[id] ?? 170;
      const info = MODE_INFO[id];
      const sel = this.selected === id;
      const content = this.contents.get(id)!;
      this.tweens.add({ targets: content, scale: sel ? 1.03 : 1, duration: 120 });
      panel.clear();
      panel.fillStyle(sel ? 0x212a40 : 0x1a2134, 0.96);
      panel.fillRoundedRect(cx - CARD_W / 2, CARD_CY - CARD_H / 2, CARD_W, CARD_H, 14);
      panel.lineStyle(sel ? 4 : 2, sel ? info.color : 0x3a4560, 1);
      panel.strokeRoundedRect(cx - CARD_W / 2, CARD_CY - CARD_H / 2, CARD_W, CARD_H, 14);
    }
    this.mapRow.setVisible(this.selected === MODE.PAYLOAD);
  }

  /** 随机本局地图（训练场固定试炼场；调试参数 ?map / ?pmap 仍可强制指定） */
  private rollMap(): MapRoll {
    if (this.selected === MODE.TRAIN) return { name: '试炼场' };
    if (this.selected === MODE.PAYLOAD) {
      const q = new URLSearchParams(window.location.search).get('pmap');
      const pick: 'ruins' | 'coral' = q === 'coral' || q === 'ruins'
        ? q
        : (Math.random() < 0.5 ? 'coral' : 'ruins');
      return { name: pick === 'coral' ? '珊瑚海' : '遗迹', payloadMap: pick };
    }
    const q = Number(new URLSearchParams(window.location.search).get('map'));
    const idx = Number.isInteger(q) && q >= 0 && q < MAPS.length
      ? q
      : Math.floor(Math.random() * MAPS.length);
    return { name: MAPS[idx].name, mapIndex: idx };
  }

  /** 揭晓本局地图（覆盖层），确认后进入选人页 */
  private revealMap() {
    if (this.revealOpen) return;
    this.revealOpen = true;
    const info = MODE_INFO[this.selected];
    const roll = this.rollMap();
    this.roll = roll;

    const cx = GAME_WIDTH / 2;
    const cy = 316;
    const w = 560;
    const h = 322;
    const top = cy - h / 2;
    const c = this.add.container(0, 0).setDepth(20);
    this.reveal = c;

    c.add(this.add.rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x05070f, 0.8)
      .setInteractive());

    const panel = this.add.graphics();
    panel.fillStyle(0x161c2e, 0.98);
    panel.fillRoundedRect(cx - w / 2, top, w, h, 16);
    panel.lineStyle(3, info.color, 1);
    panel.strokeRoundedRect(cx - w / 2, top, w, h, 16);
    c.add(panel);

    c.add(this.add.text(cx, top + 40, this.selected === MODE.TRAIN ? '本局地图' : '本局随机地图', {
      fontFamily: FONT_MONO, fontSize: '15px', color: '#8fa3c8',
    }).setOrigin(0.5));

    const name = this.add.text(cx, top + 104, roll.name, {
      fontFamily: FONT_BODY, fontSize: '46px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setStroke('#10131f', 10);
    c.add(name);

    c.add(this.add.text(cx, top + 158, `${info.name} · ${info.tag}`, {
      fontFamily: FONT_BODY, fontSize: '15px', color: info.colorText,
    }).setOrigin(0.5));

    const note = this.selected === MODE.PAYLOAD
      ? '攻守阵营将在进入战场时随机分配'
      : this.selected === MODE.BRAWL
        ? '六名角色互为敌人 · 率先击杀 10 人获胜'
        : '伤害测试木偶 · 不会移动也不会还手';
    c.add(this.add.text(cx, top + 184, note, {
      fontFamily: FONT_BODY, fontSize: '12px', color: '#b9c8e6',
    }).setOrigin(0.5));

    const div = this.add.graphics();
    div.lineStyle(1, 0x2c3652, 1).lineBetween(cx - w / 2 + 36, cy + 32, cx + w / 2 - 36, cy + 32);
    c.add(div);

    const btnW = 220;
    const btnH = 48;
    const btnY = cy + 82;
    const btn = this.add.graphics();
    const drawBtn = (hover: boolean) => {
      btn.clear();
      btn.fillStyle(hover ? 0x2f3b58 : 0x232c42, 1);
      btn.fillRoundedRect(cx - btnW / 2, btnY - btnH / 2, btnW, btnH, 12);
      btn.lineStyle(2, hover ? 0xffffff : info.color, 1);
      btn.strokeRoundedRect(cx - btnW / 2, btnY - btnH / 2, btnW, btnH, 12);
    };
    drawBtn(false);
    c.add(btn);
    c.add(this.add.text(cx, btnY, '选择角色 →', {
      fontFamily: FONT_BODY, fontSize: '19px', fontStyle: 'bold', color: '#f2e9c4',
    }).setOrigin(0.5));
    const zone = this.add.zone(cx, btnY, btnW, btnH).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => drawBtn(true));
    zone.on('pointerout', () => drawBtn(false));
    zone.on('pointerdown', () => this.continueToSelect());
    c.add(zone);

    c.add(this.add.text(cx, top + h - 16, '回车继续 · ESC 返回模式选择', {
      fontFamily: FONT_BODY, fontSize: '11px', color: '#7f90b0',
    }).setOrigin(0.5));

    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 180 });
  }

  private closeReveal() {
    this.revealOpen = false;
    this.roll = null;
    this.reveal?.destroy();
    this.reveal = null;
  }

  private continueToSelect() {
    if (!this.roll || this.leaving) return;
    this.leaving = true;
    const roll = this.roll;
    const mode = this.selected;
    this.cameras.main.fadeOut(160);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('Select', {
        mode,
        mapName: roll.name,
        payloadMap: roll.payloadMap,
        mapIndex: roll.mapIndex,
      });
    });
  }

  private back() {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(140);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('Menu');
    });
  }
}
