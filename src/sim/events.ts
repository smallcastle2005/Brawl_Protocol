import { EventBus } from '../core/eventBus';
import type { Fighter } from '../entities/Fighter';
import type { SfxName } from '../audio/sfx';

/**
 * 战斗逻辑 → 表现层的事件契约。
 * 逻辑层只描述「发生了什么」，由 view 层决定如何绘制 / 播放。
 */
export interface GameEvents {
  'fx:spark': { x: number; y: number; color: number; count: number };
  'fx:boom': { x: number; y: number };
  'fx:muzzle': { fighter: Fighter; angle: number };
  'fx:burst': { x: number; y: number };
  'fx:dash': { fighter: Fighter; angle: number };
  'fx:barrage': { x: number; y: number };
  'fx:shake': { intensity: number; duration: number };
  'sfx:play': { name: SfxName; volume: number };
}

export type GameEventBus = EventBus<GameEvents>;

export function createGameEventBus(): GameEventBus {
  return new EventBus<GameEvents>();
}
