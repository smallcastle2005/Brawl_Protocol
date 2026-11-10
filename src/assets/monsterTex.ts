import Phaser from 'phaser';

/**
 * PVE 怪物贴图（侧视像素画，默认朝右；引擎按移动方向水平翻转）。
 * 每只怪物输出 idle / w1 / w2 三帧，与角色行走动画同构。
 */

type Draw = (ctx: CanvasRenderingContext2D, frame: number) => void;

function tex(scene: Phaser.Scene, key: string, w: number, h: number, draw: Draw) {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, w, h);
  if (!t) return;
  const ctx = t.getContext();
  draw(ctx, 0);
  t.refresh();
}

/** 生成三帧：frame=0 待机，1/2 行走 */
function tex3(scene: Phaser.Scene, prefix: string, w: number, h: number, draw: Draw) {
  tex(scene, prefix + '-idle', w, h, (c) => draw(c, 0));
  tex(scene, prefix + '-w1', w, h, (c) => draw(c, 1));
  tex(scene, prefix + '-w2', w, h, (c) => draw(c, 2));
}

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** 幽灵枪手：牛仔帽 + 黑烟头 + 手枪（32×36） */
function drawGhostGunner(ctx: CanvasRenderingContext2D, frame: number) {
  ctx.clearRect(0, 0, 32, 36);
  // 双腿（行走帧左右错开）
  const off = frame === 1 ? -2 : frame === 2 ? 2 : 0;
  px(ctx, 10 + off, 27, 4, 9, '#2a2320');
  px(ctx, 18 - off, 27, 4, 9, '#2a2320');
  px(ctx, 9 + off, 34, 6, 2, '#17110d');
  px(ctx, 17 - off, 34, 6, 2, '#17110d');
  // 风衣
  px(ctx, 8, 15, 16, 14, '#4a3728');
  px(ctx, 8, 15, 3, 14, '#3a2a1e');
  px(ctx, 9, 26, 14, 2, '#241a12');
  // 前伸的手臂与手
  px(ctx, 20, 19, 8, 5, '#4a3728');
  px(ctx, 27, 20, 3, 3, '#d8c8a8');
  // 手枪（朝右）
  px(ctx, 23, 16, 9, 3, '#2c2c30');
  px(ctx, 24, 19, 3, 3, '#3a3a40');
  px(ctx, 31, 16, 1, 3, '#15151a');
  // 黑烟头部
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = '#17140f';
  ctx.beginPath();
  ctx.arc(16, 12, 5.5, 0, Math.PI * 2);
  ctx.arc(12, 8, 3, 0, Math.PI * 2);
  ctx.arc(20, 7, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // 眼中的红光
  px(ctx, 14, 11, 2, 1, '#ff5a3c');
  px(ctx, 18, 11, 2, 1, '#ff5a3c');
  // 牛仔帽
  px(ctx, 7, 9, 18, 3, '#6b4a2c');
  px(ctx, 7, 11, 18, 1, '#4a3018');
  px(ctx, 11, 3, 10, 7, '#7d5734');
  px(ctx, 11, 7, 10, 2, '#3a291a');
}

/** 暗影魔牛：前半身红眼公牛 + 后半身黑雾（40×36） */
function drawShadowBull(ctx: CanvasRenderingContext2D, frame: number) {
  ctx.clearRect(0, 0, 40, 36);
  // 后半身黑雾（左侧）
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#120f14';
  ctx.beginPath();
  ctx.arc(10, 20, 8, 0, Math.PI * 2);
  ctx.arc(7, 27, 6, 0, Math.PI * 2);
  ctx.arc(15, 29, 6, 0, Math.PI * 2);
  ctx.arc(18, 16, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // 牛身（右侧）
  px(ctx, 12, 15, 20, 14, '#3a2020');
  px(ctx, 12, 15, 20, 4, '#4a2a28');
  px(ctx, 26, 13, 10, 12, '#432424');
  // 腿（行走帧错开）
  const off = frame === 1 ? -2 : frame === 2 ? 2 : 0;
  px(ctx, 15 + off, 28, 4, 8, '#251414');
  px(ctx, 23 - off, 28, 4, 8, '#251414');
  px(ctx, 32, 27, 4, 9, '#251414');
  // 牛头与口鼻
  px(ctx, 29, 9, 9, 12, '#2b1717');
  px(ctx, 35, 14, 5, 6, '#4a2a2a');
  px(ctx, 38, 15, 2, 2, '#1a0d0d');
  // 牛角
  px(ctx, 29, 5, 3, 5, '#efe6cf');
  px(ctx, 36, 5, 3, 5, '#efe6cf');
  // 红眼（发光）
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#ff2b2b';
  ctx.beginPath();
  ctx.arc(35, 12, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  px(ctx, 33, 11, 3, 3, '#ff2b2b');
  px(ctx, 34, 12, 1, 1, '#ffd0c0');
}

/** 心兽实体：白毛狼人，矫健（44×44；BOSS 放大显示） */
function drawHeartBeast(ctx: CanvasRenderingContext2D, frame: number) {
  ctx.clearRect(0, 0, 44, 44);
  const white = '#e8e2d4';
  const shade = '#cfc9bd';
  // 尾巴
  px(ctx, 4, 20, 8, 4, shade);
  px(ctx, 2, 17, 4, 4, shade);
  // 后腿 / 前腿（行走帧错开）
  const off = frame === 1 ? -2 : frame === 2 ? 2 : 0;
  px(ctx, 12 + off, 32, 5, 11, white);
  px(ctx, 23 - off, 32, 5, 11, white);
  px(ctx, 11 + off, 41, 7, 2, '#3a3430');
  px(ctx, 22 - off, 41, 7, 2, '#3a3430');
  // 躯干
  px(ctx, 10, 18, 22, 16, white);
  px(ctx, 10, 18, 22, 4, '#f6f2e8');
  px(ctx, 12, 24, 8, 9, shade);
  // 后臂
  px(ctx, 7, 21, 6, 5, shade);
  // 前臂挥爪
  px(ctx, 28, 20, 10, 5, white);
  px(ctx, 36, 18, 4, 3, '#f6f2e8');
  // 爪尖
  px(ctx, 39, 17, 3, 1, '#d8d2c4');
  px(ctx, 39, 20, 3, 1, '#d8d2c4');
  ctx.fillStyle = '#f0ece2';
  ctx.beginPath();
  ctx.moveTo(40, 15); ctx.lineTo(44, 17); ctx.lineTo(40, 19);
  ctx.fill();
  // 头
  px(ctx, 26, 9, 13, 12, white);
  // 耳朵
  ctx.fillStyle = white;
  ctx.beginPath();
  ctx.moveTo(26, 10); ctx.lineTo(27, 1); ctx.lineTo(32, 8); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(34, 9); ctx.lineTo(37, 1); ctx.lineTo(40, 9); ctx.fill();
  // 口鼻
  px(ctx, 36, 14, 7, 5, '#f0ece2');
  px(ctx, 42, 15, 2, 3, '#2a2320');
  // 红色眼睛
  px(ctx, 30, 12, 3, 2, '#ff3020');
  px(ctx, 36, 12, 2, 2, '#ff3020');
  // 獠牙
  px(ctx, 38, 18, 1, 2, '#ffffff');
  px(ctx, 41, 18, 1, 2, '#ffffff');
  // 颈部长毛
  px(ctx, 24, 17, 4, 6, '#f6f2e8');
}

/** 生成全部 PVE 怪物贴图 */
export function genMonsterTextures(scene: Phaser.Scene) {
  tex3(scene, 'ghost-gunner', 32, 36, drawGhostGunner);
  tex3(scene, 'shadow-bull', 40, 36, drawShadowBull);
  tex3(scene, 'heart-beast', 44, 44, drawHeartBeast);
}
