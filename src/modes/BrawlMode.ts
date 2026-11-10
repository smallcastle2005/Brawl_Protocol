import { CHAR_INFO, CHAR_POOL, KILLS_TO_WIN } from '../config';
import { AIController } from '../ai/AIController';
import type { Fighter } from '../entities/Fighter';
import type { GameMode, ModeHost } from './GameMode';

/** 乱斗模式：六人混战，先达成击杀目标者获胜 */
export class BrawlMode implements GameMode {
  constructor(private host: ModeHost) {}

  buildWorld() {}

  buildHud() {}

  spawnRoster() {
    const h = this.host;
    const spawns = h.layout.spawns;
    // 六人乱斗：玩家 + 五名人机，从七名角色池中随机抽取（各自独立队伍）
    const pool = CHAR_POOL.filter((c) => c !== h.charId);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    h.player = h.spawnFighter(
      spawns[0].x, spawns[0].y, h.charId, true, CHAR_INFO[h.charId].name,
    );
    h.player.team = 0;
    h.fighters.push(h.player);
    h.aiList = [];
    for (let i = 0; i < 5; i++) {
      const cid = pool[i % pool.length];
      const ai = h.spawnFighter(
        spawns[i + 1].x, spawns[i + 1].y, cid, false, '机·' + CHAR_INFO[cid].name,
      );
      ai.team = i + 1;
      h.fighters.push(ai);
      h.aiList.push(ai);
      h.aiCtrls.set(ai, new AIController());
    }
  }

  update() {}

  drawWorld() {}

  drawHud() {}

  respawnPos(_f: Fighter) {
    return null;
  }

  checkWin() {
    const top = this.host.fighters.find((f) => f.kills >= KILLS_TO_WIN);
    if (top) this.host.endGame(top === this.host.player, top);
  }

  recordDps() {}
}
