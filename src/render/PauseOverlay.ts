import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, ModeId } from '../config';
import { FONT_BODY } from '../core/text';
import type { Fighter } from '../entities/Fighter';

/** 暂停覆盖层需要的最小宿主状态 */
export interface PauseHost extends Phaser.Scene {
  over: boolean;
  player: Fighter;
  mode: ModeId;
  /** 冒险模式关卡（重选角色时回传） */
  levelId?: string;
  levelName?: string;
}

/**
 * 暂停覆盖层：持有暂停状态、遮罩面板与「继续 / 重选角色」按钮。
 * 暂停时统一冻结物理与玩家操作，ESC 与按钮共用同一入口。
 */
export class PauseOverlay {
  paused = false;
  /** 防止重复触发 scene.start 造成黑屏 */
  private leaving = false;
  private ui!: Phaser.GameObjects.Container;

  constructor(private host: PauseHost) {}

  build() {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const items: Phaser.GameObjects.GameObject[] = [];

    const backdrop = this.host.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x05070f, 0.72);
    items.push(backdrop);

    const panel = this.host.add.graphics();
    panel.fillStyle(0x141a2c, 0.98);
    panel.fillRoundedRect(cx - 190, cy - 130, 380, 260, 14);
    panel.lineStyle(3, 0x9b5cff, 1);
    panel.strokeRoundedRect(cx - 190, cy - 130, 380, 260, 14);
    items.push(panel);

    items.push(this.host.add.text(cx, cy - 84, '已暂停', {
      fontFamily: FONT_BODY, fontSize: '30px', fontStyle: 'bold', color: '#e8d6ff',
    }).setOrigin(0.5));

    items.push(this.host.add.text(cx, cy - 44, '按 ESC 继续战斗', {
      fontFamily: FONT_BODY, fontSize: '13px', color: '#8fa3c8',
    }).setOrigin(0.5));

    items.push(...this.makeButton(cx, cy + 8, 260, 44, '返回（继续战斗）', () => this.toggle()));
    items.push(...this.makeButton(cx, cy + 68, 260, 44, '重选角色（回选人页）', () => this.toSelect()));

    this.ui = this.host.add.container(0, 0, items)
      .setDepth(2100).setScrollFactor(0).setVisible(false);
  }

  private makeButton(
    cx: number, cy: number, w: number, h: number, label: string, onClick: () => void,
  ): Phaser.GameObjects.GameObject[] {
    const bg = this.host.add.graphics();
    const paint = (hover: boolean) => {
      bg.clear();
      bg.fillStyle(hover ? 0x2a3550 : 0x1d2536, 1);
      bg.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 9);
      bg.lineStyle(2, hover ? 0xe8d6ff : 0x7a5bb8, 1);
      bg.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 9);
    };
    paint(false);
    const text = this.host.add.text(cx, cy, label, {
      fontFamily: FONT_BODY, fontSize: '15px', color: '#f2e9c4',
    }).setOrigin(0.5);
    const zone = this.host.add.zone(cx, cy, w, h).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => paint(true));
    zone.on('pointerout', () => paint(false));
    zone.on('pointerdown', () => {
      if (this.paused) onClick();
    });
    return [bg, text, zone];
  }

  toggle() {
    if (this.host.over || this.leaving) return;
    this.paused = !this.paused;
    this.ui.setVisible(this.paused);
    if (this.paused) {
      this.host.physics.pause();
      this.host.player.moveX = 0;
      this.host.player.moveY = 0;
      this.host.player.gustCharging = false;
      this.host.player.gustChargeT = 0;
      this.host.player.bombTargeting = false;
    } else {
      this.host.physics.resume();
    }
  }

  private toSelect() {
    if (this.leaving) return;
    this.leaving = true;
    this.paused = false;
    this.ui.setVisible(false);
    this.host.physics.resume();
    this.host.cameras.main.fadeOut(160);
    this.host.time.delayedCall(200, () => this.host.scene.start('Select', {
      mode: this.host.mode,
      levelId: this.host.levelId,
      levelName: this.host.levelName,
    }));
  }
}
