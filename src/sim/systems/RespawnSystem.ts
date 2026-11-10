import Phaser from 'phaser';
import { CHAR } from '../../config';
import { playSfx } from '../../audio/sfx';
import type { Fighter } from '../../entities/Fighter';
import type { Soldier } from '../../entities/Soldier';
import type { AIController } from '../../ai/AIController';
import type { FxRenderer } from '../../render/FxRenderer';

/** 复活系统需要的最小宿主状态 */
export interface RespawnHost extends Phaser.Scene {
  respawnTimers: Map<Fighter, number>;
  over: boolean;
  player: Fighter;
  aiCtrls: Map<Fighter, AIController>;
  prevPos: Map<Fighter, { x: number; y: number }>;
  fx: FxRenderer;
  respawnPosFor(f: Fighter): { x: number; y: number };
  spawnSoldier(f: Fighter, opts?: { x?: number; y?: number; temp?: boolean }): Soldier | null;
  teamColor(f: Fighter): number;
}

/** 阵亡计时与复活结算（复活点由当前玩法模式决定） */
export class RespawnSystem {
  constructor(private host: RespawnHost) {}

  update(dt: number) {
    const h = this.host;
    for (const [f, t] of [...h.respawnTimers]) {
      const left = t - dt;
      if (left > 0) {
        h.respawnTimers.set(f, left);
        continue;
      }
      h.respawnTimers.delete(f);
      if (h.over) continue;
      const pos = h.respawnPosFor(f);
      f.respawn(pos.x, pos.y);
      // 帝君复活：直接召唤两名雄兵（各自提供护盾，与被动召唤互相独立）
      if (f.charId === CHAR.EMPEROR) {
        h.spawnSoldier(f);
        h.spawnSoldier(f);
      }
      // v0.21 修复：复活是瞬移，必须同步上一帧位置，
      // 否则下一帧的扫掠防穿墙会把「死亡点 → 重生室」这条长位移当成一次穿越墙体，
      // 从而把角色拉回半路的墙边——表现为「复活在重生室之外」。
      h.prevPos.set(f, { x: pos.x, y: pos.y });
      h.fx.spawnRing(pos.x, pos.y, h.teamColor(f));
      if (f.isPlayer) {
        playSfx('respawn');
        h.cameras.main.flash(260, 120, 200, 160);
        h.cameras.main.startFollow(h.player.sprite, false, 0.14, 0.14);
      }
      const ctrl = h.aiCtrls.get(f);
      if (ctrl) ctrl.reset();
    }
  }
}
