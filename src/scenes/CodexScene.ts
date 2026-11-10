import Phaser from 'phaser';
import { CHAR, CHAR_INFO, CHAR_POOL, CharId, GAME_WIDTH, GAME_HEIGHT } from '../config';
import { FONT_BODY, FONT_MONO, useCrispText } from '../core/text';
import { applyRenderScale } from '../core/view';

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
const TEXT_COLOR: Record<CharId, string> = {
  [CHAR.GUNNER]: '#f2994a',
  [CHAR.WIND]: '#59d3e3',
  [CHAR.BOMBER]: '#ffb84d',
  [CHAR.ARCANE]: '#b48aff',
  [CHAR.BLADE]: '#9fd8ff',
  [CHAR.WAR]: '#ff6b6b',
  [CHAR.EMPEROR]: '#ffd75e',
};

/** 左侧条目尺寸与位置（v0.29：7 名角色，压缩间距以适配 600 高度） */
const ENTRY_W = 132;
const ENTRY_H = 66;
const ENTRY_X = 106;
const ENTRY_Y0 = 96;
const ENTRY_GAP = 72;

/** 右侧详情面板区域 */
const PANEL_X = 196;
const PANEL_Y = 76;
const PANEL_W = 740;
const PANEL_H = 492;

/** 详情可滚动区（分隔线以下）：内容超出时可用滚轮 / 拖拽 / PageUp·PageDown 翻阅 */
const SCROLL_TOP = PANEL_Y + 206;
const SCROLL_BOTTOM = PANEL_Y + PANEL_H - 14;
const SCROLL_H = SCROLL_BOTTOM - SCROLL_TOP;
const SCROLL_PAD_X = 28;
const SCROLL_BAR_X = PANEL_X + PANEL_W - 14;

/** 角色图鉴：左侧头像列表，右侧详细技能说明 */
export class CodexScene extends Phaser.Scene {
  private selected: CharId = CHAR.GUNNER;
  private entryPanels = new Map<CharId, Phaser.GameObjects.Graphics>();
  private detail: Phaser.GameObjects.Container | null = null;

  // ---- 详情区滚动状态 ----
  private scrollContent: Phaser.GameObjects.Container | null = null;
  private scrollBar: Phaser.GameObjects.Graphics | null = null;
  private scrollMaskG: Phaser.GameObjects.Graphics | null = null;
  private scrollY = 0;
  private scrollMax = 0;
  private dragging = false;
  private dragFromY = 0;
  private dragFromScroll = 0;

  constructor() {
    super('Codex');
  }

  create() {
    useCrispText(this);
    applyRenderScale(this);
    this.cameras.main.setBackgroundColor('#10131f');
    this.cameras.main.fadeIn(180);

    // 标题与返回
    this.add.text(GAME_WIDTH / 2, 38, '角色图鉴', {
      fontFamily: FONT_BODY, fontSize: '30px', fontStyle: 'bold', color: '#f2c94c',
    }).setOrigin(0.5).setStroke('#1a1f33', 8);
    this.makeBackButton();

    // 左侧角色条目
    ORDER.forEach((id, i) => this.buildEntry(id, ENTRY_Y0 + i * ENTRY_GAP));
    this.refreshEntries();

    // 右侧详情（默认展示第一个）
    this.showDetail(this.selected);

    // 键盘：上下/数字切换，ESC 返回
    this.input.keyboard!.on('keydown-ESC', () => this.back());
    this.input.keyboard!.on('keydown-UP', () => this.step(-1));
    this.input.keyboard!.on('keydown-DOWN', () => this.step(1));
    const keys = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN'];
    keys.forEach((k, i) => {
      this.input.keyboard!.on('keydown-' + k, () => this.select(ORDER[i]));
    });

    // 详情区翻阅：鼠标滚轮 / 拖拽 / PageUp·PageDown
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
      this.setScroll(this.scrollY + dy * 0.55);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging) return;
      this.setScroll(this.dragFromScroll - (p.worldY - this.dragFromY));
    });
    this.input.on('pointerup', () => { this.dragging = false; });
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      if (e.code === 'PageUp') this.setScroll(this.scrollY - SCROLL_H * 0.8);
      else if (e.code === 'PageDown') this.setScroll(this.scrollY + SCROLL_H * 0.8);
    });

    // 场景关闭时清理离屏遮罩（不在显示列表中的 Graphics 不会被自动销毁）
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scrollMaskG?.destroy();
      this.scrollMaskG = null;
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

    // 头像 + 名称（条目内纵向排布，互不重叠）
    this.add.image(ENTRY_X, cy - 8, id + '-portrait').setScale(0.4);
    this.add.text(ENTRY_X, cy + 22, CHAR_INFO[id].name, {
      fontFamily: FONT_BODY, fontSize: '14px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setStroke('#10131f', 4);

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
    this.refreshEntries();
    this.showDetail(id);
  }

  private step(dir: number) {
    const i = ORDER.indexOf(this.selected);
    this.select(ORDER[(i + ORDER.length + dir) % ORDER.length]);
  }

  /** 右侧详情：名称/定位/属性固定；简介与技能放在可滚动区内，超出时可上下翻阅 */
  private showDetail(id: CharId) {
    if (this.detail) this.detail.destroy();
    this.scrollMaskG?.destroy();
    this.scrollMaskG = null;
    this.scrollContent = null;
    this.scrollBar = null;
    this.scrollY = 0;
    this.scrollMax = 0;
    this.dragging = false;

    const info = CHAR_INFO[id];
    const c = this.add.container(0, 0).setDepth(2);
    this.detail = c;

    // 面板底
    const panel = this.add.graphics();
    panel.fillStyle(0x161c2e, 0.97);
    panel.fillRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 12);
    panel.lineStyle(2, COLOR[id], 1);
    panel.strokeRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 12);
    c.add(panel);

    // 大立绘
    c.add(this.add.ellipse(PANEL_X + 78, PANEL_Y + 84, 96, 96, COLOR[id], 0.14));
    c.add(this.add.image(PANEL_X + 78, PANEL_Y + 84, id + '-portrait').setScale(0.85));

    // 名称与定位
    const name = this.add.text(PANEL_X + 148, PANEL_Y + 46, info.name, {
      fontFamily: FONT_BODY, fontSize: '26px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0, 0.5).setStroke('#10131f', 5);
    c.add(name);
    c.add(this.add.text(PANEL_X + 148, PANEL_Y + 80, info.title, {
      fontFamily: FONT_BODY, fontSize: '14px', color: TEXT_COLOR[id],
    }).setOrigin(0, 0.5));

    // 属性条（4 项，右对齐竖排）
    const barG = this.add.graphics();
    c.add(barG);
    info.stats.forEach((s, i) => {
      const y = PANEL_Y + 112 + i * 18;
      c.add(this.add.text(PANEL_X + 148, y, s.label, {
        fontFamily: FONT_BODY, fontSize: '11px', color: '#9fb0d0',
      }).setOrigin(0, 0.5));
      barG.fillStyle(0x232b42, 1).fillRect(PANEL_X + 196, y - 3, 150, 6);
      barG.fillStyle(COLOR[id], 1).fillRect(PANEL_X + 196, y - 3, 150 * (s.value / 5), 6);
    });

    // 分隔线
    const divY = PANEL_Y + 200;
    const divG = this.add.graphics();
    divG.lineStyle(1, 0x2c3652, 1).lineBetween(PANEL_X + 24, divY, PANEL_X + PANEL_W - 24, divY);
    c.add(divG);

    // ---- 可滚动内容区：简介 + 技能说明 ----
    const content = this.add.container(PANEL_X, SCROLL_TOP);
    c.add(content);
    this.scrollContent = content;

    const descT = this.add.text(SCROLL_PAD_X, 2, info.desc, {
      fontFamily: FONT_BODY, fontSize: '13px', color: '#e8eefb',
      wordWrap: { width: PANEL_W - 56, useAdvancedWrap: true },
    }).setOrigin(0, 0);
    content.add(descT);

    const headY = descT.y + descT.height + 14;
    content.add(this.add.text(SCROLL_PAD_X, headY, '技能说明', {
      fontFamily: FONT_MONO, fontSize: '13px', color: '#f2c94c',
    }).setOrigin(0, 0));

    const skillsT = this.add.text(SCROLL_PAD_X, headY + 26, info.skills.join('\n'), {
      fontFamily: FONT_BODY,
      fontSize: '12.5px',
      color: '#c4d0e6',
      wordWrap: { width: PANEL_W - 56, useAdvancedWrap: true },
      align: 'left',
      lineSpacing: 6,
    }).setOrigin(0, 0);
    content.add(skillsT);

    // 内容超出视口时允许上下翻阅
    this.scrollMax = Math.max(0, skillsT.y + skillsT.height + 10 - SCROLL_H);

    // 裁剪遮罩：只显示视口内的内容（离屏创建，销毁时手动清理）
    const maskG = this.make.graphics({ x: 0, y: 0 }, false);
    maskG.fillStyle(0xffffff, 1);
    maskG.fillRect(PANEL_X + 8, SCROLL_TOP - 2, PANEL_W - 20, SCROLL_H + 4);
    content.setMask(maskG.createGeometryMask());
    this.scrollMaskG = maskG;

    // 滚动条与提示
    const bar = this.add.graphics();
    c.add(bar);
    this.scrollBar = bar;
    if (this.scrollMax > 0) {
      c.add(this.add.text(PANEL_X + PANEL_W - 26, divY - 12, '▲▼ 滚轮 / 拖拽翻阅', {
        fontFamily: FONT_BODY, fontSize: '10px', color: '#8fa6d4',
      }).setOrigin(1, 0.5));
    }
    this.drawScrollBar();

    // 拖拽区域（覆盖内容视口）
    const zone = this.add.zone(PANEL_X + PANEL_W / 2, SCROLL_TOP + SCROLL_H / 2, PANEL_W - 40, SCROLL_H);
    zone.setInteractive({ useHandCursor: true });
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.scrollMax <= 0) return;
      this.dragging = true;
      this.dragFromY = p.worldY;
      this.dragFromScroll = this.scrollY;
    });
    c.add(zone);

    // 淡入
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 140 });
  }

  /** 按当前滚动位置更新滚动条 */
  private drawScrollBar() {
    const g = this.scrollBar;
    if (!g) return;
    g.clear();
    if (this.scrollMax <= 0) return;
    const contentH = SCROLL_H + this.scrollMax;
    const thumbH = Math.max(30, (SCROLL_H * SCROLL_H) / contentH);
    const thumbY = SCROLL_TOP + (this.scrollY / this.scrollMax) * (SCROLL_H - thumbH);
    g.fillStyle(0x252e46, 0.9);
    g.fillRoundedRect(SCROLL_BAR_X - 2.5, SCROLL_TOP, 5, SCROLL_H, 2.5);
    g.fillStyle(0x8fa6d4, 0.95);
    g.fillRoundedRect(SCROLL_BAR_X - 2.5, thumbY, 5, thumbH, 2.5);
  }

  /** 滚动到指定位置（自动夹在 0 ~ scrollMax） */
  private setScroll(v: number) {
    if (this.scrollMax <= 0) {
      this.scrollY = 0;
      return;
    }
    const next = Phaser.Math.Clamp(v, 0, this.scrollMax);
    if (Math.abs(next - this.scrollY) < 0.5) return;
    this.scrollY = next;
    if (this.scrollContent) this.scrollContent.y = SCROLL_TOP - next;
    this.drawScrollBar();
  }

  private back() {
    this.cameras.main.fadeOut(140);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('Menu');
    });
  }
}
