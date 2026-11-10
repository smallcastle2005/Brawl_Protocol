import Phaser from 'phaser';
import { CHAR, CHAR_INFO, GAME_WIDTH } from '../config';
import { FONT_MONO } from '../core/text';
import type { Fighter } from '../entities/Fighter';
import type { GameMode, ModeHost } from './GameMode';

/** 训练场模式：玩家 + 一具训练木偶，顶部显示滚动 DPS 面板 */
export class TrainMode implements GameMode {
  /** DPS 统计（近 5 秒滚动窗口） */
  private dps = { total: 0, window: [] as { t: number; dmg: number }[], best: 0 };
  private hudT?: Phaser.GameObjects.Text;

  constructor(private host: ModeHost) {}

  buildWorld() {}

  buildHud() {
    const h = this.host;
    // 训练场 DPS 面板（顶部居中，两行紧凑显示）
    this.hudT = h.add.text(GAME_WIDTH / 2, 8, '', {
      fontFamily: FONT_MONO, fontSize: '13px', color: '#cfe8ff', align: 'center',
      lineSpacing: 4,
    }).setDepth(1601).setScrollFactor(0).setOrigin(0.5, 0).setStroke('#0b0d15', 4);
  }

  spawnRoster() {
    const h = this.host;
    const spawns = h.layout.spawns;
    // 训练场：只有玩家与一具训练木偶
    h.player = h.spawnFighter(
      spawns[0].x, spawns[0].y, h.charId, true, CHAR_INFO[h.charId].name,
    );
    h.player.team = 0;
    h.fighters.push(h.player);
    h.aiList = [];
    const dp = h.layout.dummy!;
    const dm = h.spawnFighter(dp.x, dp.y, CHAR.WAR, false, '训练木偶');
    dm.isDummy = true;
    dm.team = 1;
    h.hpNames.get(dm)?.setColor('#ff9d9d');
    dm.sprite.setTexture('tex-dummy');
    h.fighters.push(dm);
  }

  update() {
    const win = 5;
    const now = this.host.stats.time;
    while (this.dps.window.length > 0 && now - this.dps.window[0].t > win) {
      this.dps.window.shift();
    }
    const recent = this.dps.window.reduce((a, b) => a + b.dmg, 0);
    const recentDps = recent / win;
    this.dps.best = Math.max(this.dps.best, recentDps);
    const elapsed = Math.max(1, now);
    const avg = this.dps.total / elapsed;
    if (this.hudT) {
      this.hudT.setText([
        `训练木偶 · 累计 ${Math.round(this.dps.total)} · 平均 DPS ${Math.round(avg)}`,
        `近 5 秒 DPS ${Math.round(recentDps)} · 峰值 ${Math.round(this.dps.best)}`,
      ].join('\n'));
    }
  }

  drawWorld() {}

  drawHud() {}

  respawnPos(_f: Fighter) {
    // 训练场固定西侧入口
    const sp = this.host.layout.spawns[0];
    return { x: sp.x, y: sp.y };
  }

  checkWin() {}

  recordDps(dmg: number) {
    if (!(dmg > 0)) return;
    this.dps.total += dmg;
    this.dps.window.push({ t: this.host.stats.time, dmg });
  }
}
