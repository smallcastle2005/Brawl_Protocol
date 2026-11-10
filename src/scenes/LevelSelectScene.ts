import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, MODE } from '../config';
import { FONT_BODY, FONT_MONO, useCrispText } from '../core/text';
import { applyRenderScale } from '../core/view';
import { PVE_LEVELS } from '../pve/levels';

/** 大地图原图尺寸（cover 铺满 960×600） */
const IMG_W = 2560;
const IMG_H = 1440;

/**
 * PVE 关卡选择：一张西部荒原大地图，5 个关卡热点。
 * 悬停显示关卡名 + 黄色轮廓；仅第一关开放，其余点击提示“还在开发中”。
 */
export class LevelSelectScene extends Phaser.Scene {
  private rings = new Map<number, Phaser.GameObjects.Graphics>();
  private names = new Map<number, Phaser.GameObjects.Text>();
  private subs = new Map<number, Phaser.GameObjects.Text>();
  private toast!: Phaser.GameObjects.Text;
  private toastBg!: Phaser.GameObjects.Graphics;
  private busy = false;

  constructor() {
    super('LevelSelect');
  }

  init() {
    this.rings.clear();
    this.names.clear();
    this.subs.clear();
    this.busy = false;
  }

  create() {
    useCrispText(this);
    applyRenderScale(this);
    this.cameras.main.setBackgroundColor('#0b0a08');
    this.cameras.main.fadeIn(180);

    // cover 缩放：铺满屏幕，超出部分居中裁切
    const scale = Math.max(GAME_WIDTH / IMG_W, GAME_HEIGHT / IMG_H);
    const dw = IMG_W * scale;
    const dh = IMG_H * scale;
    const ox = (GAME_WIDTH - dw) / 2;
    const oy = (GAME_HEIGHT - dh) / 2;

    if (this.textures.exists('pve-world-map')) {
      this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'pve-world-map')
        .setDisplaySize(dw, dh).setDepth(0);
    } else {
      // 兜底：图片缺失时用荒原色块顶上，避免黑屏
      this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x6b5636);
    }

    // 上下压暗，保证标题与提示文字可读
    const veil = this.add.graphics().setDepth(1);
    veil.fillStyle(0x000000, 0.55).fillRect(0, 0, GAME_WIDTH, 92);
    veil.fillStyle(0x000000, 0.42).fillRect(0, GAME_HEIGHT - 46, GAME_WIDTH, 46);

    this.add.text(GAME_WIDTH / 2, 34, '冒险模式 · 关卡地图', {
      fontFamily: FONT_BODY, fontSize: '32px', fontStyle: 'bold', color: '#f2c94c',
    }).setOrigin(0.5).setDepth(5).setStroke('#1a1206', 10);
    this.add.text(GAME_WIDTH / 2, 70, '鼠标悬停查看关卡 · 点击已开放关卡进入挑战', {
      fontFamily: FONT_MONO, fontSize: '13px', color: '#e8dcc0',
    }).setOrigin(0.5).setDepth(5).setStroke('#1a1206', 5);

    for (let i = 0; i < PVE_LEVELS.length; i++) {
      const lv = PVE_LEVELS[i];
      const x = ox + lv.hotspot.nx * dw;
      const y = oy + lv.hotspot.ny * dh;
      const g = this.add.graphics().setDepth(3);
      this.rings.set(i, g);

      const name = this.add.text(x, y - 62, lv.name, {
        fontFamily: FONT_BODY, fontSize: '18px', fontStyle: 'bold', color: '#ffe07a',
      }).setOrigin(0.5).setDepth(5).setStroke('#140d04', 7).setVisible(false);
      this.names.set(i, name);

      const sub = this.add.text(x, y - 40, lv.open ? `${lv.order} · 点击挑战` : '开发中', {
        fontFamily: FONT_MONO, fontSize: '11px', color: lv.open ? '#9ff0b0' : '#c9bda4',
      }).setOrigin(0.5).setDepth(5).setStroke('#140d04', 5).setVisible(false);
      this.subs.set(i, sub);

      const zone = this.add.zone(x, y, 92, 92)
        .setInteractive({ useHandCursor: true }).setDepth(6);
      zone.on('pointerover', () => this.hover(i, true));
      zone.on('pointerout', () => this.hover(i, false));
      zone.on('pointerdown', () => this.click(i));

      this.paint(i, false);
      // 已开放关卡加一点呼吸感，突出可点击
      if (lv.open) {
        this.tweens.add({
          targets: g, alpha: { from: 0.75, to: 1 }, duration: 1100,
          yoyo: true, repeat: -1, ease: 'Sine.inOut',
        });
      }
    }

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 22,
      'ENTER 挑战第一关 · ESC 返回主页', {
        fontFamily: FONT_BODY, fontSize: '13px', color: '#e8dcc0',
      }).setOrigin(0.5).setDepth(5).setStroke('#1a1206', 4);

    this.toastBg = this.add.graphics().setDepth(9).setVisible(false);
    this.toast = this.add.text(GAME_WIDTH / 2, 512, '', {
      fontFamily: FONT_BODY, fontSize: '16px', fontStyle: 'bold', color: '#ffd75e',
    }).setOrigin(0.5).setDepth(10).setStroke('#140d04', 6).setVisible(false);

    this.input.keyboard!.on('keydown-ENTER', () => this.click(0));
    this.input.keyboard!.on('keydown-SPACE', () => this.click(0));
    this.input.keyboard!.on('keydown-ESC', () => this.back());
  }

  /** 画热点：默认低调，悬停时高亮黄色轮廓 */
  private paint(index: number, hover: boolean) {
    const lv = PVE_LEVELS[index];
    const g = this.rings.get(index);
    if (!g) return;
    const x = this.hotspotX(index);
    const y = this.hotspotY(index);
    g.clear();

    if (hover) {
      g.fillStyle(0xffd75e, 0.16).fillCircle(x, y, 44);
      g.lineStyle(3, 0xffe07a, 1).strokeCircle(x, y, 38);
      g.lineStyle(1, 0xffe07a, 0.5).strokeCircle(x, y, 48);
    } else if (lv.open) {
      g.fillStyle(0xf2c94c, 0.14).fillCircle(x, y, 34);
      g.lineStyle(2, 0xd8ab45, 0.95).strokeCircle(x, y, 30);
    } else {
      g.lineStyle(2, 0x8a7d68, 0.8).strokeCircle(x, y, 30);
    }

    // 中心标记：已开放为亮黄点，未开放为暗灰叉
    if (lv.open) {
      g.fillStyle(0xffe07a, hover ? 1 : 0.9).fillCircle(x, y, 9);
      g.fillStyle(0x1a1206, 0.55).fillCircle(x, y, 4);
    } else {
      g.lineStyle(2, 0x9a8a70, 0.9);
      g.lineBetween(x - 7, y - 7, x + 7, y + 7);
      g.lineBetween(x + 7, y - 7, x - 7, y + 7);
    }
  }

  private hover(index: number, on: boolean) {
    this.paint(index, on);
    this.names.get(index)?.setVisible(on);
    this.subs.get(index)?.setVisible(on);
  }

  private click(index: number) {
    if (this.busy) return;
    const lv = PVE_LEVELS[index];
    if (!lv) return;
    if (!lv.open) {
      this.showToast(`「${lv.name}」还在开发中，敬请期待`);
      return;
    }
    this.busy = true;
    this.cameras.main.fadeOut(160);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('Select', {
        mode: MODE.PVE,
        levelId: lv.id,
        levelName: lv.name,
        mapName: lv.name,
      });
    });
  }

  private showToast(msg: string) {
    this.toast.setText(msg).setVisible(true).setAlpha(1);
    this.toastBg.clear();
    this.toastBg.setVisible(true).setAlpha(1);
    const w = this.toast.width + 44;
    this.toastBg.fillStyle(0x140d04, 0.86).fillRoundedRect(
      GAME_WIDTH / 2 - w / 2, 512 - 20, w, 40, 10,
    );
    this.toastBg.lineStyle(2, 0xffd75e, 0.9).strokeRoundedRect(
      GAME_WIDTH / 2 - w / 2, 512 - 20, w, 40, 10,
    );
    this.tweens.killTweensOf([this.toast, this.toastBg]);
    this.tweens.add({
      targets: [this.toast, this.toastBg], alpha: 0, delay: 1500, duration: 420,
      onComplete: () => {
        this.toast.setVisible(false);
        this.toastBg.setVisible(false);
      },
    });
  }

  /* ---------- 热点坐标换算（与 create 中的 cover 缩放保持一致） ---------- */
  private hotspotX(index: number) {
    const scale = Math.max(GAME_WIDTH / IMG_W, GAME_HEIGHT / IMG_H);
    const dw = IMG_W * scale;
    const ox = (GAME_WIDTH - dw) / 2;
    return ox + PVE_LEVELS[index].hotspot.nx * dw;
  }

  private hotspotY(index: number) {
    const scale = Math.max(GAME_WIDTH / IMG_W, GAME_HEIGHT / IMG_H);
    const dh = IMG_H * scale;
    const oy = (GAME_HEIGHT - dh) / 2;
    return oy + PVE_LEVELS[index].hotspot.ny * dh;
  }

  private back() {
    if (this.busy) return;
    this.busy = true;
    this.cameras.main.fadeOut(140);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Menu'));
  }
}
