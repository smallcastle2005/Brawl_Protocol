import Phaser from 'phaser';
import { CHAR, CHAR_INFO, CHAR_POOL, CharId, GAME_WIDTH, GAME_HEIGHT, MODE, MODE_INFO, ModeId } from '../config';
import { FONT_BODY, FONT_MONO, useCrispText } from '../core/text';
import { applyRenderScale } from '../core/view';

const CARD_W = 126;
const CARD_H = 250;
const CARD_CY = 330;
const CARD_X: CharId[] = CHAR_POOL;
const CARD_POS: Record<CharId, number> = {
  [CHAR.GUNNER]: 66,
  [CHAR.WIND]: 204,
  [CHAR.BOMBER]: 342,
  [CHAR.ARCANE]: 480,
  [CHAR.BLADE]: 618,
  [CHAR.WAR]: 756,
  [CHAR.EMPEROR]: 894,
};
const CARD_COLOR: Record<CharId, number> = {
  [CHAR.GUNNER]: 0xd64545,
  [CHAR.WIND]: 0x3fbfc8,
  [CHAR.BOMBER]: 0xe07b39,
  [CHAR.ARCANE]: 0x9b5cff,
  [CHAR.BLADE]: 0x9fd8ff,
  [CHAR.WAR]: 0xd63a3a,
  [CHAR.EMPEROR]: 0xe8b93c,
};
const CARD_TEXT: Record<CharId, string> = {
  [CHAR.GUNNER]: '#f2994a',
  [CHAR.WIND]: '#59d3e3',
  [CHAR.BOMBER]: '#ffb84d',
  [CHAR.ARCANE]: '#b48aff',
  [CHAR.BLADE]: '#9fd8ff',
  [CHAR.WAR]: '#ff6b6b',
  [CHAR.EMPEROR]: '#ffd75e',
};

/** 选人界面：游戏流程第二步（先选模式与地图），仅名称 / 形象 / 简介 */
export class SelectScene extends Phaser.Scene {
  private selected: CharId = CHAR.GUNNER;
  private cardPanels = new Map<CharId, Phaser.GameObjects.Graphics>();
  private cardContents = new Map<CharId, Phaser.GameObjects.Container>();
  private mode: ModeId = MODE.BRAWL;
  private payloadMap?: 'ruins' | 'coral';
  private mapIndex?: number;
  private mapName = '随机地图';
  /** 防止连按 ENTER / SPACE / 重复点击触发多次 scene.start（重复启动 Game 会黑屏） */
  private busy = false;
  /** PVE 关卡（冒险模式使用） */
  private levelId?: string;
  private levelName?: string;

  constructor() {
    super('Select');
  }

  init(data: {
    mode?: ModeId; payloadMap?: 'ruins' | 'coral'; mapIndex?: number; mapName?: string;
    levelId?: string; levelName?: string;
  }) {
    this.mode = data.mode ?? MODE.BRAWL;
    this.payloadMap = data.payloadMap;
    this.mapIndex = data.mapIndex;
    this.levelId = data.levelId;
    this.levelName = data.levelName;
    this.mapName = data.mapName ?? (this.mode === MODE.TRAIN ? '试炼场' : '随机地图');
    this.busy = false;
  }

  create() {
    useCrispText(this);
    applyRenderScale(this);
    this.cameras.main.setBackgroundColor('#10131f');
    this.cameras.main.fadeIn(180);

    // 背景：地面砖条 + 幽灵角色轮廓
    const floor = this.add.tileSprite(GAME_WIDTH / 2, GAME_HEIGHT - 56, GAME_WIDTH, 112, 'tex-floor');
    floor.setAlpha(0.45);
    const ghosts: [CharId, number][] = [
      [CHAR.GUNNER, 20], [CHAR.WIND, 173], [CHAR.BOMBER, 326], [CHAR.ARCANE, 480],
      [CHAR.BLADE, 633], [CHAR.WAR, 786], [CHAR.EMPEROR, 940],
    ];
    for (const [id, x] of ghosts) {
      this.add.image(x, GAME_HEIGHT - 30, id + '-portrait').setScale(2.4).setAlpha(0.06);
    }

    // 标题
    const title = this.add.text(GAME_WIDTH / 2, 62, '选择你的角色', {
      fontFamily: FONT_BODY,
      fontSize: '36px',
      fontStyle: 'bold',
      color: '#f2c94c',
    });
    title.setOrigin(0.5).setStroke('#1a1f33', 10).setDepth(5);
    const pve = this.mode === MODE.PVE;
    this.add.text(GAME_WIDTH / 2, 104, pve
      ? `模式：${MODE_INFO[this.mode].name}　关卡：${this.levelName ?? this.mapName}`
      : `模式：${MODE_INFO[this.mode].name}　地图：${this.mapName}`, {
      fontFamily: FONT_BODY,
      fontSize: '16px',
      color: MODE_INFO[this.mode].colorText,
    }).setOrigin(0.5).setDepth(5);
    this.add.text(GAME_WIDTH / 2, 130, '七名角色 · 选中后再次点击卡片即开战', {
      fontFamily: FONT_MONO,
      fontSize: '12px',
      color: '#8fa3c8',
    }).setOrigin(0.5).setDepth(5);

    for (const id of CARD_X) this.buildCard(id);

    // 底部提示
    const tips = this.mode === MODE.PVE ? [
      '点击卡片选中角色 · 再次点击开始挑战 · 按键 1~7 选择 · 回车继续 · ESC 返回关卡地图',
      '冒险模式：逐波清空小怪 / 精英 / BOSS · 阵亡即挑战失败（不复活）',
    ] : [
      '点击卡片选中角色 · 再次点击开始战斗 · 按键 1~7 选择 · 回车继续 · ESC 返回模式选择',
      '乱斗模式：6 人混战 · 团队推车：3V3 沿铁轨护送火车头 · 阵亡 5 秒后复活',
    ];
    for (let i = 0; i < tips.length; i++) {
      this.add.text(GAME_WIDTH / 2, 556 + i * 18, tips[i], {
        fontFamily: FONT_BODY,
        fontSize: '13px',
        color: i === 0 ? '#c9d6ee' : '#8ea0c6',
      }).setOrigin(0.5).setDepth(5);
    }

    // 键盘操作
    this.input.keyboard!.on('keydown-ONE', () => this.choose(CHAR.GUNNER, false));
    this.input.keyboard!.on('keydown-TWO', () => this.choose(CHAR.WIND, false));
    this.input.keyboard!.on('keydown-THREE', () => this.choose(CHAR.BOMBER, false));
    this.input.keyboard!.on('keydown-FOUR', () => this.choose(CHAR.ARCANE, false));
    this.input.keyboard!.on('keydown-FIVE', () => this.choose(CHAR.BLADE, false));
    this.input.keyboard!.on('keydown-SIX', () => this.choose(CHAR.WAR, false));
    this.input.keyboard!.on('keydown-SEVEN', () => this.choose(CHAR.EMPEROR, false));
    this.input.keyboard!.on('keydown-LEFT', () => this.choosePrev());
    this.input.keyboard!.on('keydown-RIGHT', () => this.chooseNext());
    this.input.keyboard!.on('keydown-ENTER', () => this.startGame());
    this.input.keyboard!.on('keydown-SPACE', () => this.startGame());
    this.input.keyboard!.on('keydown-ESC', () => this.back());

    this.refreshSelection();
  }

  private buildCard(id: CharId) {
    const info = CHAR_INFO[id];
    const cx = CARD_POS[id];
    const panel = this.add.graphics().setDepth(1);
    this.cardPanels.set(id, panel);

    const content = this.add.container(cx, CARD_CY).setDepth(2);
    this.cardContents.set(id, content);

    // 头像与底光
    content.add(this.add.ellipse(0, -62, 88, 88, CARD_COLOR[id], 0.12));
    content.add(this.add.image(0, -62, id + '-portrait').setScale(0.72));

    // 名称与定位
    const name = this.add.text(0, 4, info.name, {
      fontFamily: FONT_BODY,
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);
    name.setStroke('#10131f', 5);
    content.add(name);
    content.add(this.add.text(0, 28, info.title, {
      fontFamily: FONT_BODY,
      fontSize: '11px',
      color: CARD_TEXT[id],
    }).setOrigin(0.5));

    // 简介（技能说明已移至角色图鉴界面）
    const descT = this.add.text(0, 52, info.desc, {
      fontFamily: FONT_BODY, fontSize: '10.5px', color: '#e8eefb',
      align: 'center', wordWrap: { width: 110, useAdvancedWrap: true },
    }).setOrigin(0.5, 0);
    content.add(descT);

    // 点击区域
    const zone = this.add.zone(cx, CARD_CY, CARD_W, CARD_H).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => {
      if (this.selected !== id) this.tweens.add({ targets: content, scale: 1.03, duration: 100 });
    });
    zone.on('pointerout', () => {
      this.tweens.add({ targets: content, scale: 1, duration: 100 });
    });
    zone.on('pointerdown', () => this.choose(id, true));
  }

  private choose(id: CharId, toggleStart: boolean) {
    if (this.selected === id) {
      if (toggleStart) this.startGame();
      return;
    }
    this.selected = id;
    this.refreshSelection();
  }

  private choosePrev() {
    const idx = CARD_X.indexOf(this.selected);
    this.choose(CARD_X[(idx + CARD_X.length - 1) % CARD_X.length], false);
  }

  private chooseNext() {
    const idx = CARD_X.indexOf(this.selected);
    this.choose(CARD_X[(idx + 1) % CARD_X.length], false);
  }

  private refreshSelection() {
    for (const [id, panel] of this.cardPanels) {
      const cx = CARD_POS[id];
      const sel = this.selected === id;
      const content = this.cardContents.get(id)!;
      this.tweens.add({ targets: content, scale: sel ? 1.06 : 1, duration: 120 });
      panel.clear();
      panel.fillStyle(sel ? 0x212a40 : 0x1a2134, 0.96);
      panel.fillRoundedRect(cx - CARD_W / 2, CARD_CY - CARD_H / 2, CARD_W, CARD_H, 12);
      panel.lineStyle(sel ? 4 : 2, sel ? 0xf2c94c : 0x3a4560, 1);
      panel.strokeRoundedRect(cx - CARD_W / 2, CARD_CY - CARD_H / 2, CARD_W, CARD_H, 12);
    }
  }

  private startGame() {
    if (this.busy) return;
    this.busy = true;
    this.cameras.main.fadeOut(160);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('Game', {
        charId: this.selected,
        mode: this.mode,
        payloadMap: this.mode === MODE.PAYLOAD ? this.payloadMap : undefined,
        mapIndex: this.mode === MODE.BRAWL ? this.mapIndex : undefined,
        levelId: this.mode === MODE.PVE ? this.levelId : undefined,
        levelName: this.mode === MODE.PVE ? this.levelName : undefined,
      });
    });
  }

  private back() {
    if (this.busy) return;
    this.busy = true;
    this.cameras.main.fadeOut(140);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(this.mode === MODE.PVE ? 'LevelSelect' : 'Mode');
    });
  }
}
