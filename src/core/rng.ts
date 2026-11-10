/**
 * 随机数统一入口。
 *
 * 默认实现仍直接使用 Math.random，保证与历史版本行为一致；
 * 传入 seed 后切换为 mulberry32 确定性序列，为后续回放 / 联机同步预留。
 */

export interface Rng {
  /** [0, 1) */
  next(): number;
  /** [min, max) 浮点 */
  range(min: number, max: number): number;
  /** [min, max] 整数 */
  int(min: number, max: number): number;
  /** 从非空数组中等概率取一个 */
  pick<T>(items: readonly T[]): T;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed?: number): Rng {
  const next = seed === undefined ? Math.random : mulberry32(seed);
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
  };
}
