import Phaser from 'phaser';
import { MAP_SIZE } from '../config';
import { circleHitsRects } from '../core/util';

/** 寻路栅格边长（世界单位） */
const CELL = 40;
/** 栅格膨胀半径：角色碰撞半径 22 + 少量余量，保证路径与实际走位一致 */
const NAV_R = 24;

/** 圆半径 r 从 (x1,y1) 直线走到 (x2,y2) 是否全程不碰墙（用于路径平滑） */
export function segmentClear(
  x1: number, y1: number, x2: number, y2: number,
  rects: Phaser.Geom.Rectangle[], r = 20,
): boolean {
  const d = Math.hypot(x2 - x1, y2 - y1);
  const n = Math.max(1, Math.ceil(d / 12));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (circleHitsRects(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, r, rects)) return false;
  }
  return true;
}

/** 简易二叉堆（按 f 值取最小） */
class MinHeap {
  private a: { i: number; f: number }[] = [];

  push(i: number, f: number) {
    this.a.push({ i, f });
    let k = this.a.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (this.a[p].f <= this.a[k].f) break;
      [this.a[p], this.a[k]] = [this.a[k], this.a[p]];
      k = p;
    }
  }

  pop(): { i: number; f: number } | null {
    if (!this.a.length) return null;
    const top = this.a[0];
    const last = this.a.pop()!;
    if (this.a.length) {
      this.a[0] = last;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1;
        const r = l + 1;
        let m = k;
        if (l < this.a.length && this.a[l].f < this.a[m].f) m = l;
        if (r < this.a.length && this.a[r].f < this.a[m].f) m = r;
        if (m === k) break;
        [this.a[m], this.a[k]] = [this.a[k], this.a[m]];
        k = m;
      }
    }
    return top;
  }

  get size() { return this.a.length; }
}

/**
 * 墙体栅格寻路：把 2400×2400 地图切成 40px 网格，
 * 用角色半径膨胀墙体后做 8 方向 A*，返回一串世界坐标路点。
 */
export class NavGrid {
  private cols: number;
  private rows: number;
  private blocked: Uint8Array;
  private walls: Phaser.Geom.Rectangle[];

  constructor(walls: Phaser.Geom.Rectangle[]) {
    this.walls = walls;
    this.cols = Math.ceil(MAP_SIZE / CELL);
    this.rows = this.cols;
    this.blocked = new Uint8Array(this.cols * this.rows);
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const x = cx * CELL + CELL / 2;
        const y = cy * CELL + CELL / 2;
        if (circleHitsRects(x, y, NAV_R, walls)) this.blocked[cy * this.cols + cx] = 1;
      }
    }
  }

  private free(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows
      && this.blocked[cy * this.cols + cx] === 0;
  }

  private cellOf(x: number, y: number): { cx: number; cy: number } {
    return {
      cx: Math.max(0, Math.min(this.cols - 1, Math.floor(x / CELL))),
      cy: Math.max(0, Math.min(this.rows - 1, Math.floor(y / CELL))),
    };
  }

  private centerOf(cx: number, cy: number): { x: number; y: number } {
    return { x: cx * CELL + CELL / 2, y: cy * CELL + CELL / 2 };
  }

  /** 目标落在墙体/贴墙格里时，向外环形找最近的可走格 */
  private nearestFree(cx: number, cy: number): { cx: number; cy: number } | null {
    if (this.free(cx, cy)) return { cx, cy };
    for (let rad = 1; rad <= 14; rad++) {
      for (let dy = -rad; dy <= rad; dy++) {
        for (let dx = -rad; dx <= rad; dx++) {
          if (Math.abs(dx) !== rad && Math.abs(dy) !== rad) continue;
          if (this.free(cx + dx, cy + dy)) return { cx: cx + dx, cy: cy + dy };
        }
      }
    }
    return null;
  }

  /**
   * A* 寻路。返回从起点格到终点格的世界坐标路点（含终点）；
   * 无解时返回空数组，调用方自行退回直线方向。
   */
  findPath(sx: number, sy: number, gx: number, gy: number): { x: number; y: number }[] {
    const s = this.cellOf(sx, sy);
    const g = this.cellOf(gx, gy);
    const start = this.nearestFree(s.cx, s.cy);
    const goal = this.nearestFree(g.cx, g.cy);
    if (!start || !goal) return [];
    if (start.cx === goal.cx && start.cy === goal.cy) {
      return [{ x: gx, y: gy }];
    }

    const W = this.cols;
    const n = W * this.rows;
    const gScore = new Float32Array(n).fill(Infinity);
    const from = new Int32Array(n).fill(-1);
    const seen = new Uint8Array(n);
    const goalId = goal.cy * W + goal.cx;
    const dirs = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142],
    ];
    const h = (cx: number, cy: number) => {
      const dx = Math.abs(cx - goal.cx);
      const dy = Math.abs(cy - goal.cy);
      return (dx + dy) + (1.4142 - 2) * Math.min(dx, dy);
    };

    const startId = start.cy * W + start.cx;
    gScore[startId] = 0;
    seen[startId] = 1;
    const open = new MinHeap();
    open.push(startId, h(start.cx, start.cy));

    while (open.size) {
      const cur = open.pop()!;
      if (cur.i === goalId) break;
      const cx = cur.i % W;
      const cy2 = Math.floor(cur.i / W);
      for (const [dx, dy, cost] of dirs) {
        const nx = cx + dx;
        const ny = cy2 + dy;
        if (!this.free(nx, ny)) continue;
        // 斜穿墙角视为不可走
        if (dx !== 0 && dy !== 0 && (!this.free(cx + dx, cy2) || !this.free(cx, cy2 + dy))) continue;
        const id = ny * W + nx;
        const ng = gScore[cur.i] + cost;
        if (ng >= gScore[id]) continue;
        gScore[id] = ng;
        from[id] = cur.i;
        seen[id] = 1;
        open.push(id, ng + h(nx, ny));
      }
    }

    if (from[goalId] === -1 && goalId !== startId) return [];

    // 回溯
    const cells: { cx: number; cy: number }[] = [];
    let id = goalId;
    while (id !== -1) {
      cells.push({ cx: id % W, cy: Math.floor(id / W) });
      if (id === startId) break;
      id = from[id];
    }
    cells.reverse();

    // 转世界坐标；最后一点用真实目标点（若可直达）
    const pts = cells.map((c) => this.centerOf(c.cx, c.cy));
    if (segmentClear(pts[pts.length - 1].x, pts[pts.length - 1].y, gx, gy, this.walls)) {
      pts.push({ x: gx, y: gy });
    }
    return pts;
  }
}

const cache = new WeakMap<Phaser.Geom.Rectangle[], NavGrid>();

/** 同一份墙体数组复用同一个栅格（每张地图只构建一次） */
export function getNavGrid(walls: Phaser.Geom.Rectangle[]): NavGrid {
  let nav = cache.get(walls);
  if (!nav) {
    nav = new NavGrid(walls);
    cache.set(walls, nav);
  }
  return nav;
}
