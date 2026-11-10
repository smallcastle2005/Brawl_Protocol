import Phaser from 'phaser';
import { CHAR, CHAR_INFO, CHAR_POOL, CharId, GAME_WIDTH } from '../config';
import { FONT_BODY, FONT_MONO, useCrispText } from '../core/text';
import { applyRenderScale } from '../core/view';
import {
  EQUIP_BY_CHAR, equipAttrsAt, getEquipState,
} from '../pve/equipment';

const ORDER: CharId[] = CHAR_POOL;
const COLOR: Record<CharId, number> = {
  [CHAR.GUNNER]: 0xd64545,
  [CHAR.WIND]: 0x3fbfc8,
  [CHAR.BOMBER]: 0xe07b39,
  [CHAR.ARCANE]: 0x9b5cff,
  [CHAR.BLADE]: 0x9fd8ff,
  [CHAR.WAR]: 0xd63a3a,
  [CHAR.EMPEROR]: 0xe8b93c,
};

const ENTRY_W = 132;
const ENTRY_H = 66;
const ENTRY_X = 106;
const ENTRY_Y0 = 96;
const ENTRY_GAP = 72;

const PANEL_X = 196;
const PANEL_Y = 76;
const PANEL_W = 740;
const PANEL_H = 492;

/** 装备页：左侧角色列表，右侧展示该角色的专属装备（图鉴式布局） */
export class EquipmentScene extends Phaser.Scene {
  private selected: CharId = CHAR.GUNNER;
  private entryPanels = new Map<CharId, Phaser.GameObjects.Graphics>();
  private detail: Phaser.GameObjects.Container | null = null;
  /** 装备效果介绍分页 */
  private effectPage = 0;
  private effectPageCount = 1;

  constructor() {
    super('Equipment');
  }

  create() {
    useCrispText(this);
    applyRenderScale(this);
    this.cameras.main.setBackgroundColor('#10131f');
    this.cameras.main.fadeIn(180);

    this.add.text(GAME_WIDTH / 2, 38, '装备', {
      fontFamily: FONT_BODY, fontSize: '30px', fontStyle: 'bold', color: '#f2c94c',
    }).setOrigin(0.5).setStroke('#1a1f33', 8);
    this.add.text(GAME_WIDTH / 2, 62, '每位角色拥有一件专属装备 · 冒险模式生效', {
      fontFamily: FONT_BODY, fontSize: '12px', color: '#8fa3c8',
    }).setOrigin(0.5);
    this.makeBackButton();

    ORDER.forEach((id, i) => this.buildEntry(id, ENTRY_Y0 + i * ENTRY_GAP));
    this.refreshEntries();
    this.showDetail(this.selected);

    this.input.keyboard!.on('keydown-ESC', () => this.back());
    this.input.keyboard!.on('keydown-UP', () => this.step(-1));
    this.input.keyboard!.on('keydown-DOWN', () => this.step(1));
    this.input.keyboard!.on('keydown-LEFT', () => this.flipPage(-1));
    this.input.keyboard!.on('keydown-RIGHT', () => this.flipPage(1));
    const keys = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN'];
    keys.forEach((k, i) => {
      this.input.keyboard!.on('keydown-' + k, () => this.select(ORDER[i]));
    });
  }

  private makeBackButton() {
    const cx = 62;
    const cy = 38;
    const w = 92;
    const h = 34;
    const draw = (hover: boolean) => {
      panel.clear();
      panel.fillStyle(hover ? 0x2a3550 : 0x1d2536, 1);
      panel.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 9);
      panel.lineStyle(2, hover ? 0xffe07a : 0xf2c94c, 1);
      panel.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 9);
    };
    const panel = this.add.graphics();
    draw(false);
    this.add.text(cx, cy, '← 返回', {
      fontFamily: FONT_BODY, fontSize: '14px', color: '#f2e9c4',
    }).setOrigin(0.5);
    const zone = this.add.zone(cx, cy, w, h).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => draw(true));
    zone.on('pointerout', () => draw(false));
    zone.on('pointerdown', () => this.back());
  }

  private buildEntry(id: CharId, cy: number) {
    const panel = this.add.graphics();
    this.entryPanels.set(id, panel);
    this.add.image(ENTRY_X, cy - 8, id + '-portrait').setScale(0.4);
    this.add.text(ENTRY_X, cy + 22, CHAR_INFO[id].name, {
      fontFamily: FONT_BODY, fontSize: '14px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setStroke('#10131f', 4);
    // 有专属装备的角色在右下角显示装备图标
    const def = EQUIP_BY_CHAR[id];
    if (def) {
      this.add.image(ENTRY_X + 48, cy + 16, def.iconKey).setDisplaySize(26, 26);
    }
    const zone = this.add.zone(ENTRY_X, cy, ENTRY_W, ENTRY_H).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => this.select(id));
  }

  private refreshEntries() {
    for (const [id, panel] of this.entryPanels) {
      const i = ORDER.indexOf(id);
      const cy = ENTRY_Y0 + i * ENTRY_GAP;
      const sel = this.selected === id;
      panel.clear();
      panel.fillStyle(sel ? 0x212a40 : 0x1a2134, 0.96);
      panel.fillRoundedRect(ENTRY_X - ENTRY_W / 2, cy - ENTRY_H / 2, ENTRY_W, ENTRY_H, 10);
      panel.lineStyle(sel ? 3 : 2, sel ? 0xf2c94c : 0x3a4560, 1);
      panel.strokeRoundedRect(ENTRY_X - ENTRY_W / 2, cy - ENTRY_H / 2, ENTRY_W, ENTRY_H, 10);
    }
  }

  private select(id: CharId) {
    if (this.selected === id) return;
    this.selected = id;
    this.effectPage = 0;
    this.refreshEntries();
    this.showDetail(id);
  }

  /** 装备效果翻页（键盘 ← → 与面板箭头均可） */
  private flipPage(dir: number) {
    if (this.effectPageCount <= 1) return;
    const next = this.effectPage + dir;
    if (next < 0 || next >= this.effectPageCount) return;
    this.effectPage = next;
    this.showDetail(this.selected);
  }

  private step(dir: number) {
    const i = ORDER.indexOf(this.selected);
    this.select(ORDER[(i + ORDER.length + dir) % ORDER.length]);
  }

  /** 右侧详情：装备立绘 + 属性 + 经验 + 效果 */
  private showDetail(id: CharId) {
    if (this.detail) this.detail.destroy();
    const c = this.add.container(0, 0).setDepth(2);
    this.detail = c;

    const def = EQUIP_BY_CHAR[id];
    const panel = this.add.graphics();
    panel.fillStyle(0x161c2e, 0.97);
    panel.fillRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 12);
    panel.lineStyle(2, def ? 0xf2c94c : 0x3a4560, 1);
    panel.strokeRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 12);
    c.add(panel);

    // ---- 立绘框 ----
    const artCx = PANEL_X + 140;
    const artCy = PANEL_Y + 140;
    const frame = this.add.graphics();
    frame.fillStyle(0x0d1220, 1);
    frame.fillRoundedRect(artCx - 118, artCy - 118, 236, 236, 10);
    frame.lineStyle(2, def ? 0x6b5a2a : 0x2c3652, 1);
    frame.strokeRoundedRect(artCx - 118, artCy - 118, 236, 236, 10);
    c.add(frame);

    if (!def) {
      this.effectPageCount = 1;
      this.effectPage = 0;
      c.add(this.add.text(artCx, artCy, '暂无\n专属装备', {
        fontFamily: FONT_BODY, fontSize: '18px', color: '#5d6b8c', align: 'center',
      }).setOrigin(0.5).setLineSpacing(8));
      c.add(this.add.text(PANEL_X + 284, PANEL_Y + 46, '暂无专属装备', {
        fontFamily: FONT_BODY, fontSize: '26px', fontStyle: 'bold', color: '#8fa3c8',
      }).setOrigin(0, 0.5).setStroke('#10131f', 5));
      c.add(this.add.text(PANEL_X + 284, PANEL_Y + 82,
        `${CHAR_INFO[id].name}的专属装备尚未推出，冒险模式中不提供额外加成。`, {
          fontFamily: FONT_BODY, fontSize: '13px', color: '#9fb0d0',
          wordWrap: { width: 420, useAdvancedWrap: true },
        }).setOrigin(0, 0));
    } else {
      const img = this.add.image(artCx, artCy, def.artKey);
      img.setScale(Math.min(220 / img.width, 220 / img.height));
      c.add(img);
      // 装备栏状态
      const slot = this.add.graphics();
      slot.fillStyle(0x1d2536, 0.92);
      slot.fillRoundedRect(artCx - 118, artCy + 122, 236, 24, 6);
      slot.lineStyle(1, 0x3a4560, 1);
      slot.strokeRoundedRect(artCx - 118, artCy + 122, 236, 24, 6);
      c.add(slot);
      c.add(this.add.text(artCx, artCy + 134, '装备栏 1/1 · 已装备', {
        fontFamily: FONT_BODY, fontSize: '11px', color: '#8ff0b0',
      }).setOrigin(0.5));

      // ---- 名称 / 品质 / 等级 ----
      c.add(this.add.text(PANEL_X + 284, PANEL_Y + 34, def.name, {
        fontFamily: FONT_BODY,
        // 超长装备名（如轰炸专家的导弹发射装置）缩小字号以保持单行
        fontSize: def.name.length > 12 ? '18px' : '27px',
        fontStyle: 'bold', color: '#ffe27a',
      }).setOrigin(0, 0.5).setStroke('#10131f', 5));
      c.add(this.add.text(PANEL_X + 284, PANEL_Y + 68, def.quality, {
        fontFamily: FONT_BODY, fontSize: '13px', color: '#f2c94c',
      }).setOrigin(0, 0.5));

      const state = getEquipState(def);
      c.add(this.add.text(PANEL_X + 284, PANEL_Y + 94,
        state.maxed ? `等级 ${state.level}/${def.maxLevel} · 已满级` : `等级 ${state.level}/${def.maxLevel}`, {
          fontFamily: FONT_MONO, fontSize: '13px', color: '#e8eefb',
        }).setOrigin(0, 0.5));

      // ---- 属性加成（仅显示该装备实际拥有的属性） ----
      const a = equipAttrsAt(def, state.level);
      const attrLines = ([
        ['生命值', a.hpPct], ['伤害', a.dmgPct],
        ['暴击率', a.critPct], ['暴击伤害', a.critDmgPct],
        ['减伤', a.drPct], ['冷却缩短', a.cdPct],
      ] as const).filter(([, v]) => v > 0);
      attrLines.forEach(([label, v], i) => {
        const y = PANEL_Y + 120 + i * 18;
        c.add(this.add.text(PANEL_X + 284, y, label, {
          fontFamily: FONT_BODY, fontSize: '12.5px', color: '#9fb0d0',
        }).setOrigin(0, 0.5));
        c.add(this.add.text(PANEL_X + 504, y, `+${Math.round(v * 1000) / 10}%`, {
          fontFamily: FONT_MONO, fontSize: '13px', color: '#57e08b',
        }).setOrigin(1, 0.5));
      });

      // ---- 经验条 ----
      const xpX = PANEL_X + 284;
      const xpY = PANEL_Y + 218;
      const xpW = 400;
      const xpG = this.add.graphics();
      xpG.fillStyle(0x232b42, 1).fillRect(xpX, xpY, xpW, 10);
      xpG.fillStyle(0xf2c94c, 1).fillRect(xpX, xpY, xpW * state.progress, 10);
      xpG.lineStyle(1, 0x3a4560, 1).strokeRect(xpX, xpY, xpW, 10);
      c.add(xpG);
      c.add(this.add.text(xpX + xpW, xpY - 10,
        state.maxed ? 'EXP 已满' : `EXP ${state.xp} / ${state.need}`, {
          fontFamily: FONT_MONO, fontSize: '11px', color: '#8fa3c8',
        }).setOrigin(1, 0.5));

      // ---- 背景故事（放在右列经验条下方，避免与效果文字争位置） ----
      c.add(this.add.text(PANEL_X + 284, PANEL_Y + 236, def.lore, {
        fontFamily: FONT_BODY, fontSize: '11px', color: '#6f7f9f', fontStyle: 'italic',
        wordWrap: { width: 420, useAdvancedWrap: true },
      }).setOrigin(0, 0));

      // ---- 分隔线 ----
      const divY = PANEL_Y + 286;
      const divG = this.add.graphics();
      divG.lineStyle(1, 0x2c3652, 1).lineBetween(PANEL_X + 24, divY, PANEL_X + PANEL_W - 24, divY);
      c.add(divG);

      // ---- 装备效果（按可用高度自动分页，避免长文本溢出） ----
      c.add(this.add.text(PANEL_X + 26, divY + 12, '装备效果', {
        fontFamily: FONT_MONO, fontSize: '13px', color: '#f2c94c',
      }).setOrigin(0, 0));
      const effTop = divY + 34;
      const effMaxH = PANEL_Y + PANEL_H - effTop - 34;
      const titleStyle: Phaser.Types.GameObjects.Text.TextStyle = {
        fontFamily: FONT_BODY, fontSize: '14px', fontStyle: 'bold', color: '#ffe27a',
      };
      const descStyle: Phaser.Types.GameObjects.Text.TextStyle = {
        fontFamily: FONT_BODY, fontSize: '12px', color: '#c4d0e6',
        wordWrap: { width: PANEL_W - 60, useAdvancedWrap: true }, lineSpacing: 4,
      };
      // 先测量每个效果块的高度，再按页高装箱
      const blocks = def.effects.map((eff) => {
        const t = this.add.text(0, 0, `【${eff.tag}】${eff.name}`, titleStyle);
        const d = this.add.text(0, 0, eff.desc, descStyle);
        const h = t.height + 4 + d.height;
        t.destroy();
        d.destroy();
        return h;
      });
      const pages: number[][] = [];
      let page: number[] = [];
      let used = 0;
      blocks.forEach((bh, i) => {
        const gap = page.length > 0 ? 10 : 0;
        if (page.length > 0 && used + gap + bh > effMaxH) {
          pages.push(page);
          page = [];
          used = 0;
        }
        used += (page.length > 0 ? 10 : 0) + bh;
        page.push(i);
      });
      if (page.length > 0) pages.push(page);
      this.effectPageCount = Math.max(1, pages.length);
      this.effectPage = Math.min(this.effectPage, this.effectPageCount - 1);
      let ey = effTop;
      for (const bi of pages[this.effectPage] ?? []) {
        const eff = def.effects[bi];
        c.add(this.add.text(PANEL_X + 26, ey, `【${eff.tag}】${eff.name}`, titleStyle).setOrigin(0, 0));
        const body = this.add.text(PANEL_X + 26, ey + 21, eff.desc, descStyle).setOrigin(0, 0);
        c.add(body);
        ey += 21 + body.height + 10;
      }
      // 翻页底栏
      if (this.effectPageCount > 1) {
        const fy = PANEL_Y + PANEL_H - 17;
        const arrowStyle: Phaser.Types.GameObjects.Text.TextStyle = {
          fontFamily: FONT_MONO, fontSize: '17px', color: '#f2c94c',
        };
        const prev = this.add.text(PANEL_X + 26, fy, '‹', arrowStyle).setOrigin(0, 0.5);
        const next = this.add.text(PANEL_X + PANEL_W - 26, fy, '›', arrowStyle).setOrigin(1, 0.5);
        if (this.effectPage > 0) {
          prev.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.flipPage(-1));
        } else {
          prev.setAlpha(0.28);
        }
        if (this.effectPage < this.effectPageCount - 1) {
          next.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.flipPage(1));
        } else {
          next.setAlpha(0.28);
        }
        c.add(prev);
        c.add(next);
        c.add(this.add.text(PANEL_X + PANEL_W / 2, fy,
          `第 ${this.effectPage + 1} / ${this.effectPageCount} 页 · ← → 翻页`, {
            fontFamily: FONT_MONO, fontSize: '11px', color: '#8fa3c8',
          }).setOrigin(0.5));
      }
    }

    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 140 });
  }

  private back() {
    this.cameras.main.fadeOut(140);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('Menu');
    });
  }
}
