import { MODE } from '../config';
import { BrawlMode } from './BrawlMode';
import { PayloadMode } from './PayloadMode';
import { PveMode } from './PveMode';
import { TrainMode } from './TrainMode';
import type { GameMode, ModeHost } from './GameMode';

/** 按当前模式创建对应的玩法实现 */
export function createMode(host: ModeHost): GameMode {
  if (host.mode === MODE.PAYLOAD) return new PayloadMode(host);
  if (host.mode === MODE.TRAIN) return new TrainMode(host);
  if (host.mode === MODE.PVE) return new PveMode(host);
  return new BrawlMode(host);
}
