/**
 * 帧步进工具。
 *
 * 当前主循环仍使用可变帧（frameDelta），语义与旧版 `Math.min(delta, 50) / 1000` 完全一致；
 * FixedStep 作为固定步长累加器预留，供后续确定性模拟 / 联机 / 回放使用。
 */

export const MAX_FRAME_MS = 50;

/** 把引擎给出的毫秒帧间隔转成秒，并做上限保护（与旧逻辑一致） */
export function frameDelta(deltaMs: number, maxMs = MAX_FRAME_MS): number {
  return Math.min(deltaMs, maxMs) / 1000;
}

/**
 * 固定步长累加器：把可变帧时间切成固定步长推进。
 * 使用示例（后续阶段再接入主循环）：
 *   fixed.consume(frameDelta(delta), (dt) => this.simulate(dt));
 */
export class FixedStep {
  readonly step: number;
  private acc = 0;

  constructor(hz = 60) {
    this.step = 1 / hz;
  }

  /** 返回本次消费的固定步数，并逐次回调 */
  consume(deltaSec: number, fn: (dt: number) => void, maxSteps = 5): number {
    this.acc += deltaSec;
    let steps = 0;
    while (this.acc >= this.step && steps < maxSteps) {
      this.acc -= this.step;
      steps++;
      fn(this.step);
    }
    // 防止长时间卡顿后债务越积越多
    if (steps >= maxSteps) this.acc = Math.min(this.acc, this.step);
    return steps;
  }

  /** 当前步内插值系数 [0, 1)，用于渲染插值 */
  get alpha(): number {
    return this.acc / this.step;
  }

  reset(): void {
    this.acc = 0;
  }
}
