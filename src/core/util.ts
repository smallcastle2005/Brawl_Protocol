import Phaser from 'phaser';
import { BALANCE, GAME_HEIGHT, GAME_WIDTH, MAP_SIZE, WALL_T } from '../config';

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist2 = (x1: number, y1: number, x2: number, y2: number) => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
};
export const dist = (x1: number, y1: number, x2: number, y2: number) =>
  Math.sqrt(dist2(x1, y1, x2, y2));

/**
 * 原地过滤数组：保持数组引用不变。
 * 技能模块会把 bullets / soldiers 等数组引用存进 context，
 * 并被延迟定时器跨帧持有；如果每帧用 filter 生成新数组，
 * 那些旧引用上的新增对象就再也不会被主循环更新（表现为子弹停住）。
 */
export function compactInPlace<T>(arr: T[], keep: (item: T) => boolean): T[] {
  let w = 0;
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (keep(item)) arr[w++] = item;
  }
  arr.length = w;
  return arr;
}

/** 两点之间是否被任意墙体矩形遮挡（射线步进采样） */
export function segmentHitsWall(
  x1: number, y1: number, x2: number, y2: number,
  rects: Phaser.Geom.Rectangle[], step = 14,
): boolean {
  const d = dist(x1, y1, x2, y2);
  const n = Math.max(1, Math.ceil(d / step));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = lerp(x1, x2, t);
    const y = lerp(y1, y2, t);
    for (const r of rects) {
      if (r.contains(x, y)) return true;
    }
  }
  return false;
}

/** 点是否落在任意墙体矩形内 */
export function pointInRects(x: number, y: number, rects: Phaser.Geom.Rectangle[]): boolean {
  for (const r of rects) {
    if (r.contains(x, y)) return true;
  }
  return false;
}

/**
 * 圆形（半径 r）与墙体矩形求交：返回重合时的法线方向与最小穿透深度。
 * 返回 null 表示未相交。
 */
export function circleRectCollision(
  cx: number, cy: number, r: number,
  rect: Phaser.Geom.Rectangle,
): { nx: number; ny: number; pen: number } | null {
  const nx = clamp(cx, rect.left, rect.right);
  const ny = clamp(cy, rect.top, rect.bottom);
  const dx = cx - nx;
  const dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    const pen = r - d;
    return { nx: dx / d, ny: dy / d, pen };
  }
  // 圆心在矩形内部：沿最小穿透方向推出
  const left = cx - rect.left + r;
  const right = rect.right - cx + r;
  const top = cy - rect.top + r;
  const bottom = rect.bottom - cy + r;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { nx: -1, ny: 0, pen: left };
  if (m === right) return { nx: 1, ny: 0, pen: right };
  if (m === top) return { nx: 0, ny: -1, pen: top };
  return { nx: 0, ny: 1, pen: bottom };
}

/** 单位向量反射：v 反射于法线 n */
export function reflect(vx: number, vy: number, nx: number, ny: number): [number, number] {
  const dot = vx * nx + vy * ny;
  return [vx - 2 * dot * nx, vy - 2 * dot * ny];
}

/**
 * 圆形多轮推出墙体：把与任意墙体矩形相交的圆沿最短法线推出去。
 * 用于角色常驻接触判定（多次迭代可解决墙角双面挤压）。
 */
export function pushOutOfWalls(
  x: number, y: number, r: number, rects: Phaser.Geom.Rectangle[], iter = 4,
): { x: number; y: number; hit: boolean } {
  let px = x;
  let py = y;
  let hit = false;
  for (let k = 0; k < iter; k++) {
    let moved = false;
    for (const rect of rects) {
      const col = circleRectCollision(px, py, r, rect);
      if (!col) continue;
      px += col.nx * (col.pen + 0.05);
      py += col.ny * (col.pen + 0.05);
      hit = true;
      moved = true;
    }
    if (!moved) break;
  }
  return { x: px, y: py, hit };
}

/** 圆形是否与任意墙体矩形相交 */
export function circleHitsRects(
  x: number, y: number, r: number, rects: Phaser.Geom.Rectangle[],
): boolean {
  for (const rect of rects) {
    if (circleRectCollision(x, y, r, rect)) return true;
  }
  return false;
}

/**
 * 求距离 (x,y) 最近的非墙体位置（半径 r 的圆完全离开墙体）。
 * 若起点本身就在墙体中，先沿最短法线推出；推出后仍相交则向外做环形搜索。
 */
export function nearestFreePoint(
  x: number, y: number, r: number, rects: Phaser.Geom.Rectangle[], maxSearch = 360,
): { x: number; y: number } {
  if (!circleHitsRects(x, y, r, rects)) return { x, y };
  const pushed = pushOutOfWalls(x, y, r, rects, 6);
  if (!circleHitsRects(pushed.x, pushed.y, r, rects)) return { x: pushed.x, y: pushed.y };
  // 环形扩张搜索：取距原目标点最近的空地
  for (let rad = 8; rad <= maxSearch; rad += 8) {
    const steps = Math.max(12, Math.ceil((Math.PI * 2 * rad) / 26));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const nx = x + Math.cos(a) * rad;
      const ny = y + Math.sin(a) * rad;
      if (!circleHitsRects(nx, ny, r, rects)) return { x: nx, y: ny };
    }
  }
  return { x: pushed.x, y: pushed.y };
}

/**
 * 圆形扫掠移动：从 (x0,y0) 走到 (x1,y1)，沿路径按 ≤8px 采样。
 * 首次接触墙体时把圆推出并停在接触点，避免高速位移（突进/华尔兹/击退）穿墙。
 */
export function sweepCircleMove(
  x0: number, y0: number, x1: number, y1: number,
  r: number, rects: Phaser.Geom.Rectangle[],
): { x: number; y: number; hit: boolean } {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const d = Math.hypot(dx, dy);
  if (d < 0.5) {
    const p = pushOutOfWalls(x1, y1, r, rects);
    return { x: p.x, y: p.y, hit: p.hit };
  }
  const steps = Math.max(1, Math.ceil(d / 8));
  for (let i = 1; i <= steps; i++) {
    const nx = x0 + (dx * i) / steps;
    const ny = y0 + (dy * i) / steps;
    let contact = false;
    for (const rect of rects) {
      if (circleRectCollision(nx, ny, r, rect)) {
        contact = true;
        break;
      }
    }
    if (contact) {
      const p = pushOutOfWalls(nx, ny, r, rects);
      return { x: p.x, y: p.y, hit: true };
    }
  }
  return { x: x1, y: y1, hit: false };
}

/**
 * 射线与墙体最近的交点距离（无交点返回 maxLen）。
 * 使用 slab 法逐矩形求交，比步进采样更精确，用于毁灭激光的墙体截断。
 */
export function rayWallDistance(
  x: number, y: number, dx: number, dy: number, maxLen: number,
  rects: Phaser.Geom.Rectangle[],
): number {
  let best = maxLen;
  for (const r of rects) {
    let tmin = 0;
    let tmax = best;
    if (Math.abs(dx) < 1e-6) {
      if (x < r.left || x > r.right) continue;
    } else {
      const t1 = (r.left - x) / dx;
      const t2 = (r.right - x) / dx;
      tmin = Math.max(tmin, Math.min(t1, t2));
      tmax = Math.min(tmax, Math.max(t1, t2));
    }
    if (Math.abs(dy) < 1e-6) {
      if (y < r.top || y > r.bottom) continue;
    } else {
      const t1 = (r.top - y) / dy;
      const t2 = (r.bottom - y) / dy;
      tmin = Math.max(tmin, Math.min(t1, t2));
      tmax = Math.min(tmax, Math.max(t1, t2));
    }
    if (tmax >= tmin && tmin >= 0 && tmin < best) best = tmin;
  }
  return best;
}

/* ================= 轰炸子地图坐标换算 ================= */

/** 地图活动区域（缩小的 PVE 关卡用 bounds，其余为整张地图） */
export interface ArenaBounds { x: number; y: number; w: number; h: number }

export interface SubMapGeometry {
  /** 面板左上角（逻辑 UI 坐标） */
  x0: number; y0: number;
  size: number; pad: number;
  /** 世界单位 → 面板像素 */
  s: number;
  /** 世界坐标 → 面板像素的平移量 */
  ox: number; oy: number;
  arenaX: number; arenaY: number; arenaW: number; arenaH: number;
}

/**
 * 轰炸子地图几何：HUD 绘制与鼠标点击换算共用同一份计算，
 * 避免缩小后的关卡（如冒险模式第一关）因活动区域偏移 / 缩放不一致而出现落点偏差。
 */
export function subMapGeometry(bounds?: ArenaBounds): SubMapGeometry {
  const size = BALANCE.bomber.subMapSize;
  const pad = 10;
  const shrunk = !!bounds && bounds.w < MAP_SIZE;
  const arenaW = shrunk ? bounds!.w : MAP_SIZE;
  const arenaH = shrunk ? bounds!.h : MAP_SIZE;
  const arenaX = shrunk ? bounds!.x - bounds!.w / 2 : 0;
  const arenaY = shrunk ? bounds!.y - bounds!.h / 2 : 0;
  const s = (size - pad * 2) / arenaW;
  const x0 = GAME_WIDTH / 2 - size / 2;
  const y0 = GAME_HEIGHT / 2 - size / 2;
  return {
    x0, y0, size, pad, s,
    ox: x0 + pad - arenaX * s,
    oy: y0 + pad - arenaY * s,
    arenaX, arenaY, arenaW, arenaH,
  };
}

/** 轰炸子地图：逻辑 UI 坐标 → 世界坐标（超出面板返回 null） */
export function subMapWorldPoint(
  ux: number, uy: number, bounds?: ArenaBounds,
): { x: number; y: number } | null {
  const m = subMapGeometry(bounds);
  if (ux < m.x0 || ux > m.x0 + m.size || uy < m.y0 || uy > m.y0 + m.size) return null;
  const margin = WALL_T + 8;
  return {
    x: clamp(m.arenaX + (ux - m.x0 - m.pad) / m.s, m.arenaX + margin, m.arenaX + m.arenaW - margin),
    y: clamp(m.arenaY + (uy - m.y0 - m.pad) / m.s, m.arenaY + margin, m.arenaY + m.arenaH - margin),
  };
}
