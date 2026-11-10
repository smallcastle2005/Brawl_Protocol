import type { SfxName } from '../audio/sfx';
import type { Fighter } from '../entities/Fighter';
import type { GameEventBus } from '../sim/events';

/** 表现层需要实现的能力集合（当前由 GameScene 提供实现） */
export interface FxViewHandlers {
  spark(x: number, y: number, color: number, count: number): void;
  boom(x: number, y: number): void;
  muzzle(fighter: Fighter, angle: number): void;
  burst(x: number, y: number): void;
  dash(fighter: Fighter, angle: number): void;
  barrage(x: number, y: number): void;
  shake(intensity: number, duration: number): void;
  sfx(name: SfxName, volume: number): void;
}

/** 把逻辑层事件桥接到表现层；返回取消订阅函数 */
export function bindFxView(bus: GameEventBus, handlers: FxViewHandlers): () => void {
  const offs = [
    bus.on('fx:spark', (e) => handlers.spark(e.x, e.y, e.color, e.count)),
    bus.on('fx:boom', (e) => handlers.boom(e.x, e.y)),
    bus.on('fx:muzzle', (e) => handlers.muzzle(e.fighter, e.angle)),
    bus.on('fx:burst', (e) => handlers.burst(e.x, e.y)),
    bus.on('fx:dash', (e) => handlers.dash(e.fighter, e.angle)),
    bus.on('fx:barrage', (e) => handlers.barrage(e.x, e.y)),
    bus.on('fx:shake', (e) => handlers.shake(e.intensity, e.duration)),
    bus.on('sfx:play', (e) => handlers.sfx(e.name, e.volume)),
  ];
  return () => {
    for (const off of offs) off();
  };
}
