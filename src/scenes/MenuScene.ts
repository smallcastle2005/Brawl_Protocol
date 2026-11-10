import Phaser from 'phaser';
import { CHAR, CharId, GAME_WIDTH, GAME_HEIGHT, KILLS_TO_WIN } from '../config';
import { FONT_BODY, FONT_MONO, useCrispText } from '../core/text';
import { applyRenderScale } from '../core/view';

/** 主页：标题 + 开始游戏 / 角色图鉴 / 装备 / 冒险模式 四个入口 */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    useCrispText(this);
    applyRenderScale(this);
    this.cameras.main.setBackgroundColor('#10131f');
    this.cameras.main.fadeIn(180);
    this.leaving = false;

    // 背景：地面砖条 + 幽灵角色轮廓
    const floor = this.add.tileSprite(GAME_WIDTH / 2, GAME_HEIGHT - 56, GAME_WIDTH, 112, 'tex-floor');
    floor.setAlpha(0.45);
    const ghosts: [CharId, number][] = [
      [CHAR.GUNNER, 40], [CHAR.WIND, 216], [CHAR.BOMBER, 392],
      [CHAR.ARCANE, 568], [CHAR.BLADE, 744], [CHAR.WAR, 920],
    ];
    for (const [id, x] of ghosts) {
      this.add.image(x, GAME_HEIGHT - 30, id + '-portrait').setScale(2.4).setAlpha(0.06);
    }

    // 标题
    const title = this.add.text(GAME_WIDTH / 2, 168, '乱斗协议', {
      fontFamily: FONT_BODY,
      fontSize: '52px',
      fontStyle: 'bold',
      color: '#f2c94c',
    });
    title.setOrigin(0.5).setStroke('#1a1f33', 10).setDepth(5);
    this.add.text(GAME_WIDTH / 2, 220, 'BRAWL PROTOCOL · 俯视角 6人乱斗 DEMO', {
      fontFamily: FONT_MONO,
      fontSize: '14px',
      color: '#8fa3c8',
    }).setOrigin(0.5).setDepth(5);

    // 主按钮
    this.makeButton(GAME_WIDTH / 2, 300, 240, 56, '开始游戏', () => this.go('Mode'));
    this.makeButton(GAME_WIDTH / 2, 366, 240, 56, '角色图鉴', () => this.go('Codex'));
    this.makeButton(GAME_WIDTH / 2, 432, 240, 56, '装备', () => this.go('Equipment'));
    this.makeButton(GAME_WIDTH / 2, 498, 240, 56, '冒险模式（PVE）', () => this.go('LevelSelect'));

    // 底部提示
    this.add.text(GAME_WIDTH / 2, 566, `乱斗（${KILLS_TO_WIN} 杀获胜）· 3V3 推车 · 冒险模式 · 装备 · 回车开始游戏`, {
      fontFamily: FONT_BODY,
      fontSize: '13px',
      color: '#8ea0c6',
    }).setOrigin(0.5).setDepth(5);

    this.input.keyboard!.on('keydown-ENTER', () => this.go('Mode'));
    this.input.keyboard!.on('keydown-SPACE', () => this.go('Mode'));
    this.input.keyboard!.on('keydown-A', () => this.go('LevelSelect'));
    this.input.keyboard!.on('keydown-E', () => this.go('Equipment'));
  }

  private makeButton(
    cx: number, cy: number, w: number, h: number,
    label: string, onClick: () => void,
  ) {
    const draw = (hover: boolean) => {
      panel.clear();
      panel.fillStyle(hover ? 0x2a3550 : 0x1d2536, 1);
      panel.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 12);
      panel.lineStyle(2, hover ? 0xffe07a : 0xf2c94c, 1);
      panel.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 12);
    };
    const panel = this.add.graphics().setDepth(5);
    draw(false);
    this.add.text(cx, cy, label, {
      fontFamily: FONT_BODY, fontSize: '20px', fontStyle: 'bold', color: '#f2e9c4',
    }).setOrigin(0.5).setDepth(6);
    const zone = this.add.zone(cx, cy, w, h).setInteractive({ useHandCursor: true }).setDepth(7);
    zone.on('pointerover', () => draw(true));
    zone.on('pointerout', () => draw(false));
    zone.on('pointerdown', onClick);
  }

  /** 防止连按 ENTER / SPACE 触发多次 scene.start（重复启动会导致黑屏） */
  private leaving = false;

  private go(scene: string) {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(160);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start(scene);
    });
  }
}
