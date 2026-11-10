/**
 * 生成「遗迹」推车地图 2400×2400 草案（白板 JSON）
 * 设计坐标全部为 2400 世界单位，等比 1.5× 放大后额外拉开间距。
 * 运行：node scripts/map-draft-2400.mjs
 */
import fs from 'node:fs';

const MAP = 2400;
const S = 0.55;           // 画布缩放
const OX = 90, OY = 150;  // 画布原点
const PAD = 39;           // 外墙厚度（26*1.5）
const RAIL_CLEAR = 160;   // 墙体距铁轨的最小净距
const MIN_GAP = 60;       // 墙体/房间之间的最小间距

const cx = (x) => +(OX + S * x).toFixed(2);
const cy = (y) => +(OY + S * y).toFixed(2);
const sw = (v) => +(S * v).toFixed(2);

/* ---------------- 铁轨折线（世界坐标） ---------------- */
const RAIL = [
  [330, 1950], [2000, 1950], [2000, 1500], [360, 1500],
  [360, 1020], [1690, 1020], [1690, 570], [2140, 570],
];

/* ---------------- 重生室 ---------------- */
const ROOM = 270, ROOM_GAP = 126;
const ROOMS = [
  { c: [330, 1950], tag: '起点重生室' },
  { c: [920, 1500], tag: '检查点重生室' },
  { c: [2140, 570], tag: '终点重生室' },
];

/* ---------------- 墙体（左上角 + 宽高） ---------------- */
const WALLS = [
  // A1 顶部
  [78, 39, 210, 700],
  [390, 270, 240, 150],
  [880, 39, 520, 291],
  [1490, 90, 200, 240],
  [1780, 39, 220, 150],
  [2090, 60, 270, 180],
  // A2
  [670, 520, 160, 160],
  [920, 530, 280, 140],
  [1290, 520, 240, 160],
  [390, 530, 180, 140],
  // A3
  [920, 740, 300, 120],
  [1290, 740, 240, 120],
  [540, 740, 280, 120],
  [1850, 770, 220, 90],
  [2160, 770, 200, 90],
  // C 中带
  [78, 1180, 122, 160],
  [520, 1180, 190, 160],
  [1180, 1180, 280, 160],
  [1550, 1180, 250, 160],
  [1890, 1180, 200, 160],
  [2180, 1180, 180, 160],
  // D 下中带
  [560, 1660, 150, 120],
  [1160, 1660, 180, 120],
  [1430, 1660, 200, 120],
  [2160, 1660, 190, 120],
  // E 底部
  [200, 2175, 280, 180],
  [570, 2175, 260, 150],
  [920, 2175, 280, 200],
  [1290, 2175, 280, 170],
  [1660, 2175, 200, 190],
  [1950, 2175, 280, 160],
];

/* ---------------- 校验 ---------------- */
const rectDist = (a, b) => Math.hypot(
  Math.max(a[0] - b[2], b[0] - a[2], 0),
  Math.max(a[1] - b[3], b[1] - a[3], 0),
);
const ptRect = (px, py, r) => Math.hypot(
  Math.max(r[0] - px, px - (r[0] + r[2]), 0),
  Math.max(r[1] - py, py - (r[1] + r[3]), 0),
);
const segLen = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

const report = [];
const wallRects = WALLS.map(([x, y, w, h]) => [x, y, x + w, y + h]);
const roomRects = ROOMS.map(({ c }) => [c[0] - ROOM / 2, c[1] - ROOM / 2, c[0] + ROOM / 2, c[1] + ROOM / 2]);

// 1. 墙体重叠 / 间距
for (let i = 0; i < wallRects.length; i++) {
  for (let j = i + 1; j < wallRects.length; j++) {
    const d = rectDist(wallRects[i], wallRects[j]);
    if (d < MIN_GAP) report.push(`墙体 #${i} 与 #${j} 过近（间距 ${d.toFixed(1)}）`);
  }
}
// 2. 墙体 / 房间间距
roomRects.forEach((rr, ri) => {
  wallRects.forEach((wr, wi) => {
    const d = rectDist(rr, wr);
    if (d < MIN_GAP) report.push(`重生室 #${ri} 与墙体 #${wi} 过近（间距 ${d.toFixed(1)}）`);
  });
});
// 3. 墙体 / 房间 vs 铁轨净距
for (const wr of wallRects) {
  const r = [wr[0], wr[1], wr[2] - wr[0], wr[3] - wr[1]];
  for (let s = 0; s + 1 < RAIL.length; s++) {
    const [ax, ay] = RAIL[s], [bx, by] = RAIL[s + 1];
    const len = Math.hypot(bx - ax, by - ay);
    for (let d = 0; d <= len; d += 12) {
      const t = d / len;
      const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
      const dist = ptRect(px, py, r);
      if (dist < RAIL_CLEAR - 6) report.push(`墙体 (${wr[0]},${wr[1]}) 距铁轨段 ${s} 仅 ${dist.toFixed(1)}`);
    }
  }
}
// 4. 重生室 vs 铁轨：房间中心必须落在铁轨上
const onRail = (p) => RAIL.some((a, i) => {
  if (i === RAIL.length - 1) return false;
  const b = RAIL[i + 1];
  const len = segLen(a, b);
  const t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (len * len);
  if (t < 0 || t > 1) return false;
  return Math.hypot(p[0] - (a[0] + (b[0] - a[0]) * t), p[1] - (a[1] + (b[1] - a[1]) * t)) < 1;
});
ROOMS.forEach(({ c }, i) => { if (!onRail(c)) report.push(`重生室 #${i} 不在铁轨上`); });

// 5. 周长 / 检查点：每个拐弯段 ≥450px，避免点与点相隔太近
const total = RAIL.slice(1).reduce((acc, p, i) => acc + segLen(RAIL[i], p), 0);
RAIL.slice(0, -1).forEach((a, i) => {
  const len = segLen(a, RAIL[i + 1]);
  if (len < 450) report.push(`铁轨第 ${i} 段过短（${Math.round(len)}px < 450）`);
});
let acc = 0, mid = null;
for (let i = 0; i + 1 < RAIL.length && !mid; i++) {
  const a = RAIL[i], b = RAIL[i + 1], len = segLen(a, b);
  if (acc + len >= total / 2) {
    const t = (total / 2 - acc) / len;
    mid = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  acc += len;
}
// 检查点 = 检查点重生室中心在轨道上的弧长
let cpDist = 0, cpAcc = 0;
for (let i = 0; i + 1 < RAIL.length; i++) {
  const a = RAIL[i], b = RAIL[i + 1], len = segLen(a, b);
  const t = Math.max(0, Math.min(1,
    ((ROOMS[1].c[0] - a[0]) * (b[0] - a[0]) + (ROOMS[1].c[1] - a[1]) * (b[1] - a[1])) / (len * len)));
  const d = Math.hypot(ROOMS[1].c[0] - (a[0] + (b[0] - a[0]) * t),
    ROOMS[1].c[1] - (a[1] + (b[1] - a[1]) * t));
  if (d < 1 && cpDist === 0) cpDist = cpAcc + len * t;
  cpAcc += len;
}
report.push(`轨道全长 ${total}px ｜ 检查点距起点 ${Math.round(cpDist)}px ｜ 满速 ${(total / 45).toFixed(1)}px/s`);
if (Math.abs(cpDist - 3200) > 1) report.push(`检查点弧长与设计值 3200px 不一致：${Math.round(cpDist)}`);

/* ---------------- 输出白板 JSON ---------------- */
const els = [];
const rect = (x, y, w, h, bg, stroke, sw2) => els.push({
  type: 'rectangle', x: cx(x), y: cy(y), width: sw(w), height: sw(h),
  backgroundColor: bg, strokeColor: stroke, strokeWidth: sw2 || 3,
  roughness: 0, opacity: 100, fillStyle: 'solid',
});
const text = (x, y, t, size) => els.push({
  type: 'text', x: cx(x), y: cy(y), text: t, fontSize: size || 17,
  fontFamily: 'helvetica', strokeColor: '#0A0A0A', roughness: 0, opacity: 100,
});

// 底图
els.push({
  type: 'rectangle', x: cx(0) - 8, y: cy(0) - 10, width: sw(MAP) + 16, height: sw(MAP) + 16,
  backgroundColor: '#FBF8EF', strokeColor: '#16100B', strokeWidth: 4, roughness: 0, opacity: 100, fillStyle: 'solid',
});
els.push({
  type: 'rectangle', x: cx(PAD), y: cy(PAD), width: sw(MAP - PAD * 2), height: sw(MAP - PAD * 2),
  backgroundColor: '#EAD9A8', strokeColor: '#EAD9A8', strokeWidth: 1, roughness: 0, opacity: 100, fillStyle: 'solid',
});
// 草地色块
rect(15, 15, 740, 1030, '#BFD79B', '#BFD79B', 1);
rect(1570, 1550, 800, 800, '#BFD79B', '#BFD79B', 1);

// 墙体
WALLS.forEach(([x, y, w, h]) => rect(x, y, w, h, '#6E4B2D', '#16100B', 2));

// 重生室（方形围墙示意）
ROOMS.forEach(({ c }) => rect(c[0] - ROOM / 2, c[1] - ROOM / 2, ROOM, ROOM, 'transparent', '#16100B', 4));

// 铁轨
els.push({
  type: 'line', x: cx(RAIL[0][0]), y: cy(RAIL[0][1]),
  points: RAIL.map(([x, y]) => [+(S * (x - RAIL[0][0])).toFixed(2), +(S * (y - RAIL[0][1])).toFixed(2)]),
  strokeColor: '#7A4A1F', strokeWidth: 9, roughness: 0, opacity: 100, strokeStyle: 'solid',
});

// 拐弯点
const BENDS = RAIL.slice(1, -1);
const BEND_NAMES = ['A', 'B', 'C', 'D', 'E', 'F'];
BENDS.forEach(([x, y], i) => {
  els.push({
    type: 'ellipse', x: cx(x) - 20, y: cy(y) - 20, width: 40, height: 40,
    backgroundColor: '#E8B84B', strokeColor: '#16100B', strokeWidth: 2, roughness: 0, opacity: 100, fillStyle: 'solid',
  });
  text(x + 6, y + 6, BEND_NAMES[i], 17);
});

// 房间标签
text(ROOMS[0].c[0] - 200, ROOMS[0].c[1] - 16, '起点重生室', 17);
text(ROOMS[1].c[0] - 230, ROOMS[1].c[1] - 16, '检查点重生室', 17);
text(ROOMS[2].c[0] - 200, ROOMS[2].c[1] - 16, '终点重生室', 17);

// 标题
text(0, -215, '「遗迹」推车地图 · v3 草案（2400×2400）', 30);
text(0, -160, `凹字形轮廓 ｜ 铁轨绕行贯穿底 / 中 / 上三层 ｜ 全长 ${total}px ｜ 6 个拐弯点 ｜ 墙距 ≥${MIN_GAP}px、轨距 ≥${RAIL_CLEAR}px`, 17);

// 右侧信息栏
rect(2440, 40, 1270, 1000, '#FAF7F0', '#D8CDB8', 1);
text(2500, 100, '图例', 22);
els.push({ type: 'line', x: cx(2500), y: cy(210), points: [[0, 0], [90, 0]], strokeColor: '#7A4A1F', strokeWidth: 9, roughness: 0, opacity: 100, strokeStyle: 'solid' });
text(2640, 175, `铁轨 · 全长 ${total}px · 6 个拐弯`, 17);
rect(2520, 280, 70, 44, '#6E4B2D', '#16100B', 2);
text(2640, 285, `墙体 · ${WALLS.length} 块 · 不压轨道、零重叠`, 17);
rect(2520, 380, 70, 44, 'transparent', '#16100B', 4);
text(2640, 385, `重生室 · ${ROOM}×${ROOM} · 四边 ${ROOM_GAP}px 缺口`, 17);
els.push({ type: 'ellipse', x: cx(2532), y: cy(475), width: 38, height: 38, backgroundColor: '#E8B84B', strokeColor: '#16100B', strokeWidth: 2, roughness: 0, opacity: 100, fillStyle: 'solid' });
text(2640, 480, '拐弯点 A–F（铁轨转向处）', 17);

text(2500, 580, '推车规则', 22);
text(2500, 650, '· 3V3：攻方护送火车头，守方拦截', 17);
text(2500, 700, '· 推进圈半径 300px，人数差决定推进', 17);
text(2500, 750, `· 满速 ≈ ${(total / 45).toFixed(1)}px/s；初始 180s，过点 +120s`, 17);
text(2500, 800, '· 过点后攻方重生室前移，守方到终点', 17);
text(2500, 850, '· 抵终点 = 攻方胜；时间耗尽 = 守方胜', 17);

text(2500, 950, '设计核对', 22);
text(2500, 1020, `· 墙体距铁轨 ≥${RAIL_CLEAR}px，不压走廊`, 17);
text(2500, 1070, `· 墙体 / 重生室间距 ≥${MIN_GAP}px，互不重叠`, 17);
text(2500, 1120, '· 相邻段 1670 / 450 / 1640 / 480 / 1330 / 450 / 450（均 ≥450）', 17);
text(2500, 1170, `· 检查点 = 检查点重生室中心（弧长 ${Math.round(cpDist)}px）`, 17);

fs.writeFileSync('d:/游戏文档/pixel-brawl/scripts/map-draft.2400.json', JSON.stringify(els, null, 2), 'utf8');
console.log(JSON.stringify({ elements: els.length, total, mid, issues: report }, null, 2));
