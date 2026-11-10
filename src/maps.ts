/** 预制对称地图池：每份地图手工设计，墙体严格四向对称且互不重叠 */

import { MAP_SIZE } from './config';

export interface Obstacle {
  /** 中心坐标 */
  x: number; y: number; w: number; h: number;
  /** 是否属于重生室围墙（校验时按整体房间处理，不参与逐块间距检查） */
  room?: boolean;
}
export interface SpawnPoint { x: number; y: number }
/** 推车铁轨：折线（世界坐标）+ 预计算全长 */
export interface RailSpan { path: SpawnPoint[]; total: number }
/** 重生室：方形围墙（四边各留一个缺口出口），spawns 为室内重生点 */
export interface RespawnRoom { x: number; y: number; w: number; h: number; spawns: SpawnPoint[] }

export interface MapLayout {
  obstacles: Obstacle[];
  spawns: SpawnPoint[];
  name: string;
  /** 是否四向对称（乱斗地图为 true；推车地图为 false，跳过对称校验） */
  symmetric?: boolean;
  /** 地面主题：草地 / 遗迹 / 珊瑚海 / 西部荒原 */
  theme?: 'grass' | 'ruins' | 'coral' | 'wasteland';
  rails?: RailSpan;
  rooms?: RespawnRoom[];
  cartStart?: SpawnPoint;
  /** 推车占领区（v0.34 珊瑚海）：进攻方需先在车所在区域占领一段时间才能推车 */
  capture?: { x: number; y: number; r: number; time: number };
  /** 推车检查点（轨道弧长，可多个；珊瑚海第一个检查点即占领区，此处为之后的检查点） */
  checkpoints?: number[];
  /** 本图推车起始时间 / 过检查点加时（缺省用 PAYLOAD 全局值） */
  timeFirst?: number;
  timeExtra?: number;
  /** 分段推进：满速推到首个检查点 / 之后推到终点分别用多少秒（缺省按全长 45s 均速） */
  pushTimeCp?: number;
  pushTimeRest?: number;
  /** 训练场：训练木偶位置 */
  dummy?: SpawnPoint;
  /** 训练场：相机可视范围（与外墙对齐的小地图区域） */
  bounds?: { x: number; y: number; w: number; h: number };
  /** bounds 区域的外墙厚度（缺省训练场 60 / 其余地图 WALL_T） */
  wallT?: number;
}

/** 乱斗地图的设计基准尺寸（v0.19 起按 1.5× 载入到 2400 世界） */
const BRAWL_SIZE = 1600;
/** 乱斗地图载入时的缩放倍率 */
const BRAWL_SCALE = MAP_SIZE / BRAWL_SIZE;

/** 四向对称：把第一象限（x<800, y<800）障碍镜像到其余三个象限 */
function mirrorQuad(quads: Obstacle[], center: Obstacle[] = []): Obstacle[] {
  const out: Obstacle[] = [...center.map((o) => ({ ...o }))];
  const M = BRAWL_SIZE;
  for (const o of quads) {
    const seen = new Set<string>();
    const points: [number, number][] = [
      [o.x, o.y], [M - o.x, o.y], [o.x, M - o.y], [M - o.x, M - o.y],
    ];
    for (const [px, py] of points) {
      const key = `${px},${py},${o.w},${o.h}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ x: px, y: py, w: o.w, h: o.h });
    }
  }
  return out;
}

/** 六名角色的出生点：四条边中点 + 上下两条短边的内圈点，天然对称且远离四角 */
export const SPAWNS: SpawnPoint[] = [
  { x: 800, y: 250 },
  { x: 1350, y: 800 },
  { x: 800, y: 1350 },
  { x: 250, y: 800 },
  { x: 800, y: 450 },
  { x: 800, y: 1150 },
];

/** 地图 1：四方庭院 */
const MAP_A = mirrorQuad([
  { x: 520, y: 420, w: 200, h: 34 },
  { x: 660, y: 520, w: 34, h: 200 },
  { x: 280, y: 300, w: 160, h: 34 },
  { x: 300, y: 460, w: 34, h: 160 },
  { x: 600, y: 240, w: 120, h: 34 },
  { x: 240, y: 600, w: 34, h: 120 },
], [{ x: 800, y: 800, w: 140, h: 140 }]);

/** 地图 2：双环回廊 */
const MAP_B = mirrorQuad([
  { x: 560, y: 460, w: 160, h: 34 },
  { x: 460, y: 560, w: 34, h: 160 },
  { x: 640, y: 640, w: 34, h: 120 },
  { x: 300, y: 300, w: 100, h: 100 },
  { x: 420, y: 200, w: 34, h: 140 },
  { x: 160, y: 560, w: 34, h: 120 },
], [{ x: 800, y: 800, w: 120, h: 120 }]);

/** 地图 3：斜影回廊 */
const MAP_C = mirrorQuad([
  { x: 540, y: 400, w: 200, h: 34 },
  { x: 660, y: 540, w: 34, h: 200 },
  { x: 400, y: 660, w: 200, h: 34 },
  { x: 540, y: 660, w: 34, h: 160 },
  { x: 200, y: 300, w: 140, h: 34 },
  { x: 300, y: 200, w: 34, h: 140 },
  { x: 200, y: 560, w: 34, h: 140 },
  { x: 560, y: 200, w: 140, h: 34 },
], [{ x: 800, y: 800, w: 100, h: 100 }]);

/** 地图 4：庭院长廊 */
const MAP_D = mirrorQuad([
  { x: 600, y: 480, w: 160, h: 34 },
  { x: 480, y: 600, w: 34, h: 160 },
  { x: 660, y: 300, w: 34, h: 140 },
  { x: 300, y: 460, w: 34, h: 140 },
  { x: 460, y: 240, w: 140, h: 34 },
  { x: 640, y: 700, w: 34, h: 120 },
  { x: 240, y: 240, w: 100, h: 100 },
], [{ x: 800, y: 800, w: 140, h: 140 }]);

export const MAPS: { obstacles: Obstacle[]; name: string }[] = [
  { obstacles: MAP_A, name: '四方庭院' },
  { obstacles: MAP_B, name: '双环回廊' },
  { obstacles: MAP_C, name: '斜影回廊' },
  { obstacles: MAP_D, name: '庭院长廊' },
];

/* ================= 遗迹（团队推车专用） ================= */

const ROOM_T = 39; // 重生室围墙厚度（26 × 1.5）
/** 墙体重叠 / 间距校验门槛 */
const MIN_GAP = 60;
/** 墙体距铁轨的最小净距（v0.25 按白板 1:1 还原后，部分墙体贴近铁轨） */
const RAIL_CLEAR = 40;

/**
 * 方形重生室：外墙尺寸恰为 size×size，四边各留一个居中缺口（宽 gap）作为出口。
 * 水平段贴外沿并延伸到角部，竖直段从水平段内沿开始，四段彼此只“相接”不重叠。
 */
function roomWalls(cx: number, cy: number, size: number, gap: number): Obstacle[] {
  const half = size / 2;
  const inner = half - ROOM_T;   // 竖直段可用的内沿
  const gh = gap / 2;            // 缺口半宽
  const segH = half - gh;        // 水平段长度（角部 → 缺口）
  const offH = (half + gh) / 2;  // 水平段中心偏移
  const segV = inner - gh;       // 竖直段长度（水平段内沿 → 缺口）
  const offV = (inner + gh) / 2; // 竖直段中心偏移
  const lineH = half - ROOM_T / 2; // 水平段贴外沿的中心线
  const lineV = half - ROOM_T / 2; // 竖直段贴外沿的中心线
  return [
    // 上
    { x: cx - offH, y: cy - lineH, w: segH, h: ROOM_T, room: true },
    { x: cx + offH, y: cy - lineH, w: segH, h: ROOM_T, room: true },
    // 下
    { x: cx - offH, y: cy + lineH, w: segH, h: ROOM_T, room: true },
    { x: cx + offH, y: cy + lineH, w: segH, h: ROOM_T, room: true },
    // 左
    { x: cx - lineV, y: cy - offV, w: ROOM_T, h: segV, room: true },
    { x: cx - lineV, y: cy + offV, w: ROOM_T, h: segV, room: true },
    // 右
    { x: cx + lineV, y: cy - offV, w: ROOM_T, h: segV, room: true },
    { x: cx + lineV, y: cy + offV, w: ROOM_T, h: segV, room: true },
  ];
}

/**
 * 铁轨折线（2400 世界坐标）：底 → 右 → 中 → 左 → 上 → 右，共 6 个拐弯点。
 * 每段长度均 ≥450px，避免拐弯点彼此挨得太近、推车刚加速就拐弯。
 */
export const RUINS_RAIL: SpawnPoint[] = [
  { x: 330, y: 1950 }, { x: 2000, y: 1950 }, { x: 2000, y: 1500 }, { x: 360, y: 1500 },
  { x: 360, y: 1020 }, { x: 1690, y: 1020 }, { x: 1690, y: 570 }, { x: 2140, y: 570 },
];

/** 折线累加长度 */
export function railLength(path: SpawnPoint[]): number {
  let total = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    total += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y);
  }
  return total;
}

/** 沿折线取距离起点 d 处的坐标与切线方向（弧度） */
export function railPointAt(rail: RailSpan, d: number): { x: number; y: number; angle: number } {
  const p = rail.path;
  let acc = 0;
  const dd = Math.max(0, Math.min(rail.total, d));
  for (let i = 0; i + 1 < p.length; i++) {
    const a = p[i];
    const b = p[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + len >= dd || i === p.length - 2) {
      const t = len > 0 ? Math.max(0, Math.min(1, (dd - acc) / len)) : 0;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        angle: Math.atan2(b.y - a.y, b.x - a.x),
      };
    }
    acc += len;
  }
  const last = p[p.length - 1] ?? { x: 0, y: 0 };
  return { x: last.x, y: last.y, angle: 0 };
}

/** 折线上距离点 (px,py) 最近处的弧长（用于把检查点对齐到重生室中心） */
export function railDistanceOf(rail: RailSpan, px: number, py: number): number {
  let acc = 0;
  let best = -1;
  let bestD = Infinity;
  const p = rail.path;
  for (let i = 0; i + 1 < p.length; i++) {
    const a = p[i];
    const b = p[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len <= 0) continue;
    const t = Math.max(0, Math.min(1,
      ((px - a.x) * (b.x - a.x) + (py - a.y) * (b.y - a.y)) / (len * len)));
    const d = Math.hypot(px - (a.x + (b.x - a.x) * t), py - (a.y + (b.y - a.y) * t));
    if (d < bestD) {
      bestD = d;
      best = acc + len * t;
    }
    acc += len;
  }
  return best < 0 ? 0 : best;
}

/**
 * 墙体（左上角 + 宽高，2400 世界坐标）：v0.25 严格按最新白板截图 1:1 重建，共 35 块。
 * 相邻矩形（间距为 0）是白板里拼成的 L / E / F / H 形模块，属于同一结构。
 */
const RUINS_WALLS: [number, number, number, number][] = [
  // 左上巨型遗迹块
  [39, 39, 845, 649],
  // 顶部横带
  [884, 39, 520, 294],
  [1540, 39, 199, 288],
  // 右上 L 形（终点重生室旁）
  [1872, 126, 79, 312],
  [1872, 433, 320, 79],
  // 上中 E 形
  [1045, 469, 224, 112],
  [1259, 469, 112, 455],
  [1365, 469, 224, 112],
  [1915, 654, 221, 91],
  // 中上带
  [165, 791, 109, 315],
  [268, 791, 275, 112],
  [655, 803, 278, 121],
  [1042, 812, 224, 112],
  [1362, 812, 224, 112],
  [1903, 821, 458, 127],
  // 右侧 H 形
  [2280, 939, 81, 130],
  [1903, 1061, 458, 127],
  [1199, 1070, 190, 161],
  [1628, 1097, 115, 315],
  [2283, 1176, 78, 130],
  // 检查点层
  [153, 1279, 121, 531],
  [1906, 1300, 455, 127],
  [918, 1303, 299, 121],
  [1362, 1303, 275, 112],
  // 中下带
  [2202, 1558, 159, 121],
  [1374, 1561, 109, 319],
  [1477, 1561, 275, 112],
  [265, 1631, 979, 179],
  [2295, 1783, 66, 240],
  // 底部
  [1036, 1992, 115, 369],
  [39, 2010, 800, 70],
  [2069, 2013, 292, 118],
  [1283, 2113, 514, 121],
  [2295, 2125, 66, 127],
  [1936, 2244, 425, 117],
];

const RUINS_ROOM_SIZE = 276;
const RUINS_ROOM_GAP = 126;
/** v0.25：三座重生室移到白板截图中的口袋位置（左下 / 中左 / 右上） */
const RUINS_ROOM_CENTERS: SpawnPoint[] = [
  { x: 262, y: 2226 }, // 起点（左下角）
  { x: 616, y: 1261 }, // 检查点（中左口袋）
  { x: 2179, y: 227 }, // 终点（右上口袋）
];

/** 房间内三个重生点（相对中心的偏移） */
const ROOM_SPAWN_OFFSETS: SpawnPoint[] = [
  { x: -46, y: -52 },
  { x: 46, y: -52 },
  { x: 0, y: 52 },
];

/** 遗迹：凹字形废墟，铁轨蛇形贯穿底 / 中 / 上三层，起点 / 中点 / 终点各有一座重生室 */
export function buildRuins(): MapLayout {
  const obstacles: Obstacle[] = [];
  for (const [x, y, w, h] of RUINS_WALLS) {
    obstacles.push({ x: x + w / 2, y: y + h / 2, w, h });
  }
  const rooms: RespawnRoom[] = RUINS_ROOM_CENTERS.map((c) => {
    obstacles.push(...roomWalls(c.x, c.y, RUINS_ROOM_SIZE, RUINS_ROOM_GAP));
    return {
      x: c.x, y: c.y, w: RUINS_ROOM_SIZE, h: RUINS_ROOM_SIZE,
      spawns: ROOM_SPAWN_OFFSETS.map((o) => ({ x: c.x + o.x, y: c.y + o.y })),
    };
  });

  return {
    obstacles,
    spawns: [ ...rooms[0].spawns, ...rooms[2].spawns ],
    name: '遗 迹',
    symmetric: false,
    theme: 'ruins',
    rails: { path: RUINS_RAIL, total: railLength(RUINS_RAIL) },
    rooms,
    cartStart: { ...RUINS_RAIL[0] },
  };
}

/* ================= 珊瑚海（v0.35 新蓝本） ================= */

/**
 * 航道折线（按白板蓝本 1:1 还原）：船从左侧起点出发，绕内圈两圈后由右侧上行到终点。
 * 全长约 8068px；检查点 1 为船所在占领区（弧长 0），检查点 2 在 4592px 处（上圈左侧拐点）。
 * 满速时 40s 推到检查点 2，再 50s 抵达终点（合计 1:30）。
 */
export const CORAL_CHANNEL: SpawnPoint[] = [
  { x: 257, y: 1223 }, { x: 1049, y: 1249 }, { x: 1048, y: 2150 }, { x: 1349, y: 2147 },
  { x: 1341, y: 971 }, { x: 771, y: 965 }, { x: 770, y: 643 }, { x: 1182, y: 292 },
  { x: 1592, y: 653 }, { x: 1601, y: 1739 }, { x: 2188, y: 1738 }, { x: 2195, y: 493 },
];

/** 珊瑚海占领区（检查点 1，船所在处）：最快 20s 占领完毕 */
export const CORAL_CAPTURE = { x: 257, y: 1223, r: 170, time: 20 };

/** 珊瑚海检查点（轨道弧长）：第一个检查点由占领区承担，这里只登记之后的检查点 */
export const CORAL_CHECKPOINTS: number[] = [4592];

/** 珊瑚海粉色珊瑚墙（中心坐标 + 宽高，按蓝本截图提取） */
const CORAL_WALLS: Obstacle[] = [
  { x: 728.5, y: 141.5, w: 471, h: 283 },
  { x: 444.5, y: 256.5, w: 97, h: 513 },
  { x: 1938, y: 159, w: 924, h: 318 },
  { x: 1087.5, y: 143, w: 97, h: 166 },
  { x: 1304, y: 141, w: 216, h: 118 },
  { x: 768.5, y: 402, w: 75, h: 238 },
  { x: 1743, y: 672, w: 94, h: 708 },
  { x: 51.5, y: 981.5, w: 103, h: 947 },
  { x: 1121, y: 641.5, w: 158, h: 239 },
  { x: 351, y: 676, w: 496, h: 88 },
  { x: 1970.5, y: 785, w: 201, h: 274 },
  { x: 1391.5, y: 759, w: 201, h: 180 },
  { x: 953.5, y: 776, w: 177, h: 118 },
  { x: 521.5, y: 995, w: 145, h: 362 },
  { x: 2335, y: 1247.5, w: 130, h: 727 },
  { x: 197, y: 993.5, w: 188, h: 75 },
  { x: 1462.5, y: 1354, w: 91, h: 544 },
  { x: 831, y: 1131.5, w: 474, h: 83 },
  { x: 1902, y: 1208, w: 418, h: 156 },
  { x: 1199, y: 1627.5, w: 94, h: 823 },
  { x: 1895.5, y: 1440, w: 201, h: 308 },
  { x: 423.5, y: 1396, w: 335, h: 102 },
  { x: 634.5, y: 1683.5, w: 483, h: 233 },
  { x: 177, y: 1688.5, w: 126, h: 231 },
  { x: 1547.5, y: 1925, w: 201, h: 206 },
  { x: 2154, y: 1914.5, w: 492, h: 99 },
  { x: 861.5, y: 2147.5, w: 139, h: 505 },
  { x: 319.5, y: 1956, w: 639, h: 118 },
  { x: 1549.5, y: 2253, w: 201, h: 294 },
  { x: 1804.5, y: 2309.5, w: 309, h: 181 },
  { x: 1190.5, y: 2291, w: 201, h: 102 },
];

/** 珊瑚海三座重生室：起点（进攻）/ 检查点 / 终点（防守） */
const CORAL_ROOM_CENTERS: SpawnPoint[] = [
  { x: 206, y: 2226 },
  { x: 188, y: 179 },
  { x: 2204, y: 2194 },
];

/**
 * 珊瑚海：以蓝色色块海面为背景、粉色珊瑚为墙体、深蓝航道代替铁轨。
 * 船停在占领区，进攻方先占领 20s 才能起航；满速 40s 到检查点 2、再 50s 到终点。
 * 占领成功与通过检查点都会加 2:00；另外每 30s 会有一道全屏巨浪横扫战场（见 GameScene）。
 */
export function buildCoralSea(): MapLayout {
  const obstacles: Obstacle[] = CORAL_WALLS.map((o) => ({ ...o }));
  const roomSize = 276;
  const roomGap = 126;
  const rooms: RespawnRoom[] = CORAL_ROOM_CENTERS.map((c) => {
    obstacles.push(...roomWalls(c.x, c.y, roomSize, roomGap));
    return {
      x: c.x, y: c.y, w: roomSize, h: roomSize,
      spawns: ROOM_SPAWN_OFFSETS.map((o) => ({ x: c.x + o.x, y: c.y + o.y })),
    };
  });
  return {
    obstacles,
    spawns: [...rooms[0].spawns, ...rooms[2].spawns],
    name: '珊 瑚 海',
    symmetric: false,
    theme: 'coral',
    rails: { path: CORAL_CHANNEL, total: railLength(CORAL_CHANNEL) },
    rooms,
    cartStart: { ...CORAL_CHANNEL[0] },
    capture: { ...CORAL_CAPTURE },
    checkpoints: [...CORAL_CHECKPOINTS],
    timeFirst: 120,
    timeExtra: 120,
    pushTimeCp: 40,
    pushTimeRest: 50,
  };
}

/** 推车地图池：每局在遗迹 / 珊瑚海中随机；?pmap=coral / ?pmap=ruins 可强制指定（调试用） */
export function makePayloadMap(force?: 'ruins' | 'coral'): MapLayout {
  let pick: 'ruins' | 'coral' | undefined = force;
  if (!pick && typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search).get('pmap');
    if (q === 'coral' || q === 'ruins') pick = q;
  }
  if (!pick) pick = Math.random() < 0.5 ? 'coral' : 'ruins';
  const layout = pick === 'coral' ? buildCoralSea() : buildRuins();
  const issues = validateLayout(layout);
  if (issues.length > 0) console.warn(`[map] ${layout.name} 布局校验未通过:`, issues);
  return layout;
}

/** 矩形之间的最短距离（0 表示重叠/接触） */
function rectDist(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): number {
  const dx = Math.max(bx - bw / 2 - (ax + aw / 2), ax - aw / 2 - (bx + bw / 2), 0);
  const dy = Math.max(by - bh / 2 - (ay + ah / 2), ay - ah / 2 - (by + bh / 2), 0);
  return Math.hypot(dx, dy);
}

/** 点到矩形的最短距离 */
function pointRectDist(px: number, py: number, o: Obstacle): number {
  const dx = Math.max(o.x - o.w / 2 - px, px - (o.x + o.w / 2), 0);
  const dy = Math.max(o.y - o.h / 2 - py, py - (o.y + o.h / 2), 0);
  return Math.hypot(dx, dy);
}

/** 校验：重叠 / 四向对称 / 出生点安全 / 间距（推车地图还有轨距与拐弯段长度）。返回问题列表 */
export function validateLayout(layout: MapLayout): string[] {
  const issues: string[] = [];
  const obs = layout.obstacles;
  const M = MAP_SIZE;
  for (let i = 0; i < obs.length; i++) {
    for (let j = i + 1; j < obs.length; j++) {
      const a = obs[i];
      const b = obs[j];
      const ox = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2);
      const oy = Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2);
      if (ox > 0.5 && oy > 0.5) issues.push(`墙体重叠 #${i} / #${j}`);
    }
  }
  if (layout.symmetric !== false) {
    for (const o of obs) {
      const mirrors: [number, number][] = [[M - o.x, o.y], [o.x, M - o.y], [M - o.x, M - o.y]];
      for (const [mx, my] of mirrors) {
        const found = obs.some((p) => Math.abs(p.x - mx) < 0.5 && Math.abs(p.y - my) < 0.5
          && Math.abs(p.w - o.w) < 0.5 && Math.abs(p.h - o.h) < 0.5);
        if (!found) issues.push(`墙体不对称 (${o.x},${o.y})`);
      }
    }
  }
  // 出生点不得陷在墙体内（遗迹地图的出生点在重生室内部，跳过“远离墙体”检查）
  for (const s of layout.spawns) {
    for (const o of obs) {
      const d = pointRectDist(s.x, s.y, o);
      if (layout.symmetric === false) {
        if (d <= 0.5) issues.push(`出生点陷在墙体内 (${s.x},${s.y})`);
      } else if (d < 60) {
        issues.push(`出生点过近 (${s.x},${s.y})`);
      }
    }
  }

  // ---- 推车地图：墙体 / 重生室互不贴近，且不侵占铁轨走廊 ----
  if (layout.symmetric === false) {
    for (let i = 0; i < obs.length; i++) {
      for (let j = i + 1; j < obs.length; j++) {
        const a = obs[i];
        const b = obs[j];
        // 重生室围墙是同一结构，段与段本来就相接，不做逐块间距检查
        if (a.room || b.room) continue;
        // 间距恰为 0 表示两块墙在白板里拼成同一模块（L / E / F / H），合法；
        // 只拦截真正会卡住角色的窄缝。
        const gap = rectDist(a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h);
        if (gap > 0.5 && gap < MIN_GAP) {
          issues.push(`墙体过近 #${i} / #${j}`);
        }
      }
    }
    for (const rm of layout.rooms ?? []) {
      for (const o of obs) {
        // 房间与自身围墙必然相接，只检查房间与普通墙体
        if (o.room) continue;
        // 白板里的重生室本就塞在墙体口袋中，只要求不与墙体实体重叠
        if (rectDist(rm.x, rm.y, rm.w, rm.h, o.x, o.y, o.w, o.h) <= 0.5) {
          issues.push(`重生室与墙体重叠 (${o.x},${o.y})`);
        }
      }
    }
    if (layout.rails) {
      const rail = layout.rails;
      for (const o of obs) {
        // 重生室就建在铁轨上，铁轨从房间缺口穿过，跳过净距检查
        if (o.room) continue;
        for (let i = 0; i + 1 < rail.path.length; i++) {
          const a = rail.path[i];
          const b = rail.path[i + 1];
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          for (let d = 0; d <= len; d += 12) {
            const t = len > 0 ? d / len : 0;
            const px = a.x + (b.x - a.x) * t;
            const py = a.y + (b.y - a.y) * t;
            const dd = pointRectDist(px, py, o);
            if (dd < RAIL_CLEAR - 6) {
              issues.push(`墙体 (${o.x},${o.y}) 距铁轨仅 ${dd.toFixed(1)}`);
              break;
            }
          }
        }
      }
      // v0.25：三座重生室按白板放在铁轨旁的口袋里，不再要求房间中心落在铁轨上
      // 相邻轨道段过短会让拐弯处“点挤在一起”
      for (let i = 0; i + 1 < rail.path.length; i++) {
        const a = rail.path[i];
        const b = rail.path[i + 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 450) issues.push(`铁轨第 ${i} 段过短（${Math.round(len)}px）`);
      }
    }
  }
  return issues;
}

/** 团队推车：固定使用遗迹地图 */
export function makeRuins(): MapLayout {
  const layout = buildRuins();
  const issues = validateLayout(layout);
  if (issues.length > 0) console.warn('[map] 遗迹布局校验未通过:', issues);
  return layout;
}

/** 训练场：封闭外墙的小型演武场（v0.20） */
const TRAIN_CX = 1200;
const TRAIN_CY = 1200;
const TRAIN_W = 1240; // 外墙外沿宽
const TRAIN_H = 800;  // 外墙外沿高
const TRAIN_T = 60;   // 外墙厚度

/** 试炼场外墙厚度（供场景做地图边界兜底钳制） */
export const TRAIN_WALL_T = TRAIN_T;

/**
 * 试炼场：四面外墙围成的小房间，中央不设障碍，只在东侧放一具训练木偶。
 * 水平墙覆盖全宽，竖直墙夹在两道水平墙之间，因此四段墙互不重叠。
 */
export function makeTraining(): MapLayout {
  const halfW = TRAIN_W / 2;
  const halfH = TRAIN_H / 2;
  const innerH = TRAIN_H - TRAIN_T * 2;
  const obstacles: Obstacle[] = [
    { x: TRAIN_CX, y: TRAIN_CY - halfH + TRAIN_T / 2, w: TRAIN_W, h: TRAIN_T },
    { x: TRAIN_CX, y: TRAIN_CY + halfH - TRAIN_T / 2, w: TRAIN_W, h: TRAIN_T },
    { x: TRAIN_CX - halfW + TRAIN_T / 2, y: TRAIN_CY, w: TRAIN_T, h: innerH },
    { x: TRAIN_CX + halfW - TRAIN_T / 2, y: TRAIN_CY, w: TRAIN_T, h: innerH },
  ];
  return {
    obstacles,
    // 玩家从西侧入场，木偶固定在东侧，两者相距 660px
    spawns: [{ x: TRAIN_CX - 340, y: TRAIN_CY }],
    dummy: { x: TRAIN_CX + 320, y: TRAIN_CY },
    bounds: { x: TRAIN_CX, y: TRAIN_CY, w: TRAIN_W, h: TRAIN_H },
    name: '试炼场',
  };
}

/**
 * PVE 第一关「梦魇镇」：黄沙荒原上的废弃西部小镇。
 * v0.41：地图整体缩小一半（1200×1200 活动区域，居中于 2400 世界坐标）。
 * v0.43：只保留上 / 下 / 左 / 右各一块墙体，给 BOSS 与怪群留出充足的走位空间。
 */
export function makeNightmareTown(): MapLayout {
  const CX = MAP_SIZE / 2;
  const CY = MAP_SIZE / 2;
  const ARENA = 1200;
  const T = 30;
  // 缩小后的地图四周围墙
  const hw = ARENA / 2;
  const innerH = ARENA - T * 2;
  const obstacles: Obstacle[] = [
    { x: CX, y: CY - hw + T / 2, w: ARENA, h: T },
    { x: CX, y: CY + hw - T / 2, w: ARENA, h: T },
    { x: CX - hw + T / 2, y: CY, w: T, h: innerH },
    { x: CX + hw - T / 2, y: CY, w: T, h: innerH },
    // 上 / 下 / 左 / 右各一块孤墙（不互相围堵，保持大面积开阔场地）
    { x: CX, y: CY - 420, w: 360, h: 80 },
    { x: CX, y: CY + 420, w: 360, h: 80 },
    { x: CX - 420, y: CY, w: 80, h: 360 },
    { x: CX + 420, y: CY, w: 80, h: 360 },
  ];
  const spawn = (x: number, y: number) => ({
    x: Math.round(CX + (x - CX) * 0.5),
    y: Math.round(CY + (y - CY) * 0.5),
  });
  const layout: MapLayout = {
    obstacles,
    // 玩家与两名队友从西南角入场
    spawns: [spawn(400, 2050), spawn(620, 2000), spawn(300, 1930)],
    name: '梦 魇 镇',
    symmetric: false,
    theme: 'wasteland',
    bounds: { x: CX, y: CY, w: ARENA, h: ARENA },
    wallT: T,
  };
  const issues = validateLayout(layout);
  if (issues.length > 0) console.warn('[map] 梦魇镇布局校验未通过:', issues);
  return layout;
}

/**
 * PVE 第二关「“重生”酒馆」：与梦魇镇同为 1200×1200 荒原场地。
 * 地图正中心纵向排列 5 堵墙，墙与墙 / 墙与边界之间共留出 6 个空隙。
 */
export function makeRebirthTavern(): MapLayout {
  const CX = MAP_SIZE / 2;
  const CY = MAP_SIZE / 2;
  const ARENA = 1200;
  const T = 30;
  const hw = ARENA / 2;
  const innerH = ARENA - T * 2;
  const obstacles: Obstacle[] = [
    { x: CX, y: CY - hw + T / 2, w: ARENA, h: T },
    { x: CX, y: CY + hw - T / 2, w: ARENA, h: T },
    { x: CX - hw + T / 2, y: CY, w: T, h: innerH },
    { x: CX + hw - T / 2, y: CY, w: T, h: innerH },
  ];
  // 中心纵向 5 堵墙：墙高 128、空隙 60，共 6 个空隙（上下各 1 + 墙间 4）
  const WALL_H = 128;
  const GAP = 60;
  const SPINE_W = 90;
  const spanTop = CY - 500;
  for (let i = 0; i < 5; i++) {
    const y = spanTop + GAP * (i + 1) + WALL_H * i + WALL_H / 2;
    obstacles.push({ x: CX, y, w: SPINE_W, h: WALL_H });
  }
  const spawn = (x: number, y: number) => ({
    x: Math.round(CX + (x - CX) * 0.5),
    y: Math.round(CY + (y - CY) * 0.5),
  });
  const layout: MapLayout = {
    obstacles,
    // 与第一关相同的西南角入场
    spawns: [spawn(400, 2050), spawn(620, 2000), spawn(300, 1930)],
    name: '“重 生” 酒 馆',
    symmetric: false,
    theme: 'wasteland',
    bounds: { x: CX, y: CY, w: ARENA, h: ARENA },
    wallT: T,
  };
  const issues = validateLayout(layout);
  if (issues.length > 0) console.warn('[map] 重生酒馆布局校验未通过:', issues);
  return layout;
}

/** PVE 关卡地图：前两关有专属荒原地图，其余回落到随机预制图 */
export function makePveMap(levelId?: string): MapLayout {
  if (levelId === 'lv1') return makeNightmareTown();
  if (levelId === 'lv2') return makeRebirthTavern();
  return pickMap();
}

/** 随机抽取一份预制地图；?map=0..3 可强制指定（便于验证） */
export function pickMap(forceIndex?: number): MapLayout {
  let idx = forceIndex;
  if (idx === undefined && typeof window !== 'undefined') {
    const q = Number(new URLSearchParams(window.location.search).get('map'));
    if (Number.isInteger(q) && q >= 0 && q < MAPS.length) idx = q;
  }
  if (idx === undefined || idx < 0 || idx >= MAPS.length) {
    idx = Math.floor(Math.random() * MAPS.length);
  }
  const base = MAPS[idx];
  const layout: MapLayout = {
    // 乱斗地图按 1.5× 载入到 2400 世界坐标
    obstacles: base.obstacles.map((o) => ({
      x: o.x * BRAWL_SCALE, y: o.y * BRAWL_SCALE,
      w: o.w * BRAWL_SCALE, h: o.h * BRAWL_SCALE,
    })),
    spawns: SPAWNS.map((s) => ({ x: s.x * BRAWL_SCALE, y: s.y * BRAWL_SCALE })),
    name: base.name,
  };
  const issues = validateLayout(layout);
  if (issues.length > 0) {
    // 预览/开发期提示；设计数据本身应始终通过校验
    console.warn('[map] 布局校验未通过:', layout.name, issues);
  }
  return layout;
}
