import Phaser from 'phaser';

/**
 * Q 版三头身角色贴图（程序化像素绘制）
 * - 画布 32×36，显示宽度 48（与旧角色同屏等大）
 * - 三个朝向：down（面向镜头）/ up（背向）/ side（侧向，向左时水平翻转）
 * - 五个动作帧：idle / w1 / w2 / atk1（抬手蓄势）/ atk2（出手）
 * - 同时生成红色敌对轮廓（34×38）与 96×108 选人立绘
 */

const W = 32;
const H = 36;
const RED = 0xff3b3b;

export type ChibiDir = 'down' | 'up' | 'side';
export type ChibiPose = 'idle' | 'w1' | 'w2' | 'atk1' | 'atk2';

export const CHIBI_DIRS: ChibiDir[] = ['down', 'up', 'side'];
export const CHIBI_POSES: ChibiPose[] = ['idle', 'w1', 'w2', 'atk1', 'atk2'];

type Headgear = 'cowboy' | 'crown' | 'aviator' | 'hood' | 'helm' | 'imperial' | 'none';
type Weapon = 'gun' | 'staff' | 'orb' | 'bomb' | 'sword' | 'cannon' | 'spear';

interface Style {
  id: string;
  dark: number;
  skin: number;
  skinShade: number;
  hair: number;
  hairDark: number;
  cloth: number;
  clothLight: number;
  clothDark: number;
  accent: number;
  pants: number;
  pantsDark: number;
  boot: number;
  metal: number;
  metalDark: number;
  glow: number;
  hat: number;
  hatDark: number;
  cape?: number;
  capeDark?: number;
  headgear: Headgear;
  weapon: Weapon;
  eye: number;
  longHair?: boolean;
}

const STYLES: Record<string, Style> = {
  gunner: {
    id: 'gunner', dark: 0x1e1409,
    skin: 0xf4c89a, skinShade: 0xd1966c,
    hair: 0x6f4520, hairDark: 0x4a3018,
    cloth: 0x6f4a2a, clothLight: 0x8a6038, clothDark: 0x4a3018,
    accent: 0xd64545, pants: 0x4a6891, pantsDark: 0x334a6b, boot: 0x23252e,
    metal: 0x9aa7bd, metalDark: 0x39405a, glow: 0xffe07a,
    hat: 0xa9713f, hatDark: 0x6f4520,
    headgear: 'cowboy', weapon: 'gun', eye: 0x20242e,
  },
  wind: {
    id: 'wind', dark: 0x1e1409,
    skin: 0xfbd8b8, skinShade: 0xe2b295,
    hair: 0x9be8d8, hairDark: 0x5fbfae,
    cloth: 0x3fbfc8, clothLight: 0x7fe3ea, clothDark: 0x2a8f99,
    accent: 0xf2c94c, pants: 0xf4fbff, pantsDark: 0xd8e9ee, boot: 0x1f6a73,
    metal: 0xf2c94c, metalDark: 0xb8862b, glow: 0x8be8f2,
    hat: 0xf2c94c, hatDark: 0xb8862b,
    headgear: 'crown', weapon: 'staff', eye: 0x1c2440, longHair: true,
  },
  bomber: {
    id: 'bomber', dark: 0x1e1409,
    skin: 0xf4c89a, skinShade: 0xd1966c,
    hair: 0x8a4a22, hairDark: 0x5c2f14,
    cloth: 0xe0834a, clothLight: 0xf0a469, clothDark: 0xb25d2a,
    accent: 0xf2c14c, pants: 0x39405a, pantsDark: 0x23252e, boot: 0x23252e,
    metal: 0x8fd0e8, metalDark: 0x39405a, glow: 0xffe27a,
    hat: 0xe0834a, hatDark: 0xb25d2a,
    headgear: 'aviator', weapon: 'bomb', eye: 0x23252e,
  },
  arcane: {
    id: 'arcane', dark: 0x1e1409,
    skin: 0xfbd8b8, skinShade: 0xd1966c,
    hair: 0xe3d4ff, hairDark: 0xb9a6e0,
    cloth: 0x9b5cff, clothLight: 0xc39bff, clothDark: 0x6636c4,
    accent: 0xf0c23a, pants: 0x2b1a5e, pantsDark: 0x1c1440, boot: 0x1c1440,
    metal: 0xf0e6ff, metalDark: 0x6636c4, glow: 0xd6b3ff,
    hat: 0x6636c4, hatDark: 0x4a2490,
    headgear: 'hood', weapon: 'orb', eye: 0x3a2470,
  },
  blade: {
    id: 'blade', dark: 0x1e1409,
    skin: 0xfbd8b8, skinShade: 0xe2b295,
    hair: 0xeaf2ff, hairDark: 0xb9c8de,
    cloth: 0xd64545, clothLight: 0xff8f8f, clothDark: 0x9c2b2b,
    accent: 0xf2c94c, pants: 0x23252e, pantsDark: 0x15161c, boot: 0x23252e,
    metal: 0xeaf2ff, metalDark: 0xb9c8de, glow: 0xd9f0ff,
    hat: 0xeaf2ff, hatDark: 0xb9c8de,
    headgear: 'none', weapon: 'sword', eye: 0x1c2440,
  },
  war: {
    id: 'war', dark: 0x14161c,
    skin: 0xd9a06c, skinShade: 0x9c663a,
    hair: 0x2f3542, hairDark: 0x1a1c24,
    cloth: 0x2f3542, clothLight: 0x4a5468, clothDark: 0x1a1c24,
    accent: 0xd6423a, pants: 0x2f3542, pantsDark: 0x1a1c24, boot: 0x1a1c24,
    metal: 0x4a5468, metalDark: 0x1a1c24, glow: 0x66e6ff,
    hat: 0x2f3542, hatDark: 0x1a1c24,
    headgear: 'helm', weapon: 'cannon', eye: 0x66e6ff,
  },
  emperor: {
    id: 'emperor', dark: 0x120f18,
    skin: 0xfbd8b8, skinShade: 0xd1966c,
    hair: 0x17151f, hairDark: 0x3a3348,
    cloth: 0x17151f, clothLight: 0x3a3348, clothDark: 0x0f0e16,
    accent: 0xf0c23a, pants: 0x38142a, pantsDark: 0x241018, boot: 0x17151f,
    metal: 0xf0c23a, metalDark: 0x9c7315, glow: 0xffe08a,
    hat: 0xf0c23a, hatDark: 0x9c7315,
    cape: 0x5a2340, capeDark: 0x38142a,
    headgear: 'imperial', weapon: 'spear', eye: 0xffd75e,
  },
};

/** 可玩角色贴图前缀（士兵 / 木偶仍沿用原有 ASCII 贴图） */
export const CHIBI_CHARS = Object.keys(STYLES);

/* ---------------- 像素网格 ---------------- */

class Grid {
  px: number[] = new Array(W * H).fill(-1);

  set(x: number, y: number, c: number) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    this.px[y * W + x] = c;
  }

  rect(x: number, y: number, w: number, h: number, c: number) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  /** 圆角矩形（按行内缩，适合头部/躯干） */
  blob(x: number, y: number, w: number, h: number, c: number, corner = 2) {
    for (let j = 0; j < h; j++) {
      const inset = Math.max(0, corner - j, corner - (h - 1 - j));
      const ww = w - inset * 2;
      if (ww <= 0) continue;
      this.rect(x + inset, y + j, ww, 1, c);
    }
  }

  /** 描边/剪影：把紧贴实心像素的空位填色（keep=false 时只保留描边） */
  ring(color: number, keepBody = true): Grid {
    const g = new Grid();
    if (keepBody) g.px = this.px.slice();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (this.px[y * W + x] !== -1) continue;
        let edge = false;
        for (let dy = -1; dy <= 1 && !edge; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            if (this.px[ny * W + nx] !== -1) { edge = true; break; }
          }
        }
        if (edge) g.px[y * W + x] = color;
      }
    }
    return g;
  }
}

function paint(scene: Phaser.Scene, key: string, grid: Grid, pad = 0, scale = 1) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, (W + pad * 2) * scale, (H + pad * 2) * scale);
  if (!tex) return;
  const ctx = tex.getContext();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = grid.px[y * W + x];
      if (c === -1) continue;
      ctx.fillStyle = '#' + c.toString(16).padStart(6, '0');
      ctx.fillRect((x + pad) * scale, (y + pad) * scale, scale, scale);
    }
  }
  tex.refresh();
}

/* ---------------- 部件绘制 ---------------- */

/** 正/背面双腿（行走时左右腿错开 1px） */
function drawLegs(g: Grid, s: Style, pose: ChibiPose, atk: boolean) {
  const base = 24;
  const lY = pose === 'w1' ? base - 1 : pose === 'w2' ? base + 1 : base;
  const rY = pose === 'w2' ? base - 1 : pose === 'w1' ? base + 1 : base;
  const xs = atk ? [9, 19] : [10, 18];
  const legs: [number, number][] = [[xs[0], lY], [xs[1], rY]];
  for (const [x, y] of legs) {
    g.rect(x, y, 4, 6, s.pants);
    g.rect(x, y + 3, 1, 3, s.pantsDark);
    g.rect(x - 1, y + 6, 6, 4, s.boot);
    g.rect(x - 1, y + 6, 6, 1, s.pantsDark);
  }
}

/** 侧视双腿（前后错步） */
function drawSideLegs(g: Grid, s: Style, pose: ChibiPose, atk: boolean) {
  const base = 24;
  let bx = 10;
  let fx = 15;
  if (pose === 'w1') { bx = 11; fx = 14; }
  else if (pose === 'w2') { bx = 9; fx = 16; }
  if (atk) { bx = 9; fx = 16; }
  const back: [number, number] = [bx, pose === 'w2' ? base - 1 : base];
  const front: [number, number] = [fx, pose === 'w2' ? base + 1 : base];
  for (const [x, y] of [back, front]) {
    g.rect(x, y, 4, 6, s.pants);
    g.rect(x, y + 3, 1, 3, s.pantsDark);
    g.rect(x - 1, y + 6, 6, 4, s.boot);
  }
}

/** 头戴物（帽 / 冠 / 兜帽 / 头盔），绘制在头发之后 */
function drawGear(g: Grid, s: Style, dir: ChibiDir, top: number) {
  switch (s.headgear) {
    case 'cowboy': {
      const x = dir === 'side' ? 6 : 4;
      const w = dir === 'side' ? 20 : 24;
      g.rect(x, top + 2, w, 2, s.hat);
      g.rect(x, top + 3, w, 1, s.hatDark);
      g.blob(x + 5, top - 2, 12, 5, s.hat, 2);
      g.rect(x + 5, top + 1, 12, 1, s.accent);
      break;
    }
    case 'crown': {
      const x = dir === 'side' ? 10 : 9;
      g.rect(x, top - 1, 14, 3, s.hat);
      g.rect(x + 1, top - 2, 2, 2, s.hat);
      g.rect(x + 6, top - 3, 2, 3, s.hat);
      g.rect(x + 11, top - 2, 2, 2, s.hat);
      g.rect(x + 6, top, 2, 2, s.glow);
      break;
    }
    case 'aviator': {
      if (dir === 'side') {
        g.blob(7, top - 1, 16, 6, s.hat, 3);
        g.rect(7, top + 2, 2, 5, s.hat);
        g.rect(15, top + 2, 7, 2, s.metalDark);
        g.rect(16, top + 2, 4, 2, s.metal);
      } else {
        g.blob(7, top - 1, 18, 6, s.hat, 3);
        g.rect(6, top + 2, 2, 5, s.hat);
        g.rect(24, top + 2, 2, 5, s.hat);
        g.rect(8, top + 2, 16, 2, s.metalDark);
        g.rect(9, top + 2, 5, 3, s.metalDark);
        g.rect(10, top + 3, 3, 2, s.metal);
        g.rect(18, top + 2, 5, 3, s.metalDark);
        g.rect(19, top + 3, 3, 2, s.metal);
      }
      break;
    }
    case 'hood': {
      g.blob(5, top - 2, 22, 9, s.hat, 4);
      g.rect(5, top + 4, 4, 9, s.hat);
      g.rect(23, top + 4, 4, 9, s.hat);
      if (dir === 'up') {
        g.blob(7, top + 2, 18, 10, s.hatDark, 3);
      } else if (dir === 'side') {
        g.rect(9, top + 4, 12, 9, s.hatDark);
        g.blob(9, top + 4, 11, 9, s.skin, 3);
      } else {
        g.rect(9, top + 4, 14, 9, s.hatDark);
        g.blob(10, top + 4, 12, 10, s.skin, 3);
      }
      break;
    }
    case 'helm': {
      g.blob(6, top - 2, 20, 6, s.hat, 3);
      g.rect(6, top + 3, 20, 2, s.hatDark);
      g.rect(dir === 'side' ? 14 : 10, top + 4, dir === 'side' ? 8 : 12, 2, s.accent);
      break;
    }
    case 'imperial': {
      g.rect(8, top - 2, 16, 3, s.hat);
      g.rect(8, top - 2, 2, 2, s.hatDark);
      g.rect(8, top - 4, 2, 2, s.hat);
      g.rect(13, top - 5, 2, 3, s.hat);
      g.rect(17, top - 5, 2, 3, s.hat);
      g.rect(22, top - 4, 2, 2, s.hat);
      g.rect(14, top - 1, 4, 2, s.accent);
      break;
    }
    default:
      break;
  }
}

function drawHead(g: Grid, s: Style, dir: ChibiDir, top: number) {
  if (dir === 'side') {
    g.blob(8, top, 15, 13, s.skin, 4);
    g.rect(23, top + 5, 2, 3, s.skin);
    g.rect(23, top + 5, 1, 3, s.skinShade);
    g.blob(7, top, 15, 4, s.hair, 3);
    g.rect(7, top + 3, 3, 9, s.hair);
    g.rect(9, top + 3, 1, 9, s.hairDark);
    if (s.longHair) g.rect(7, top + 9, 3, 7, s.hair);
    drawGear(g, s, dir, top);
    g.rect(17, top + 6, 2, 2, s.eye);
    g.rect(16, top + 10, 3, 1, s.skinShade);
    return;
  }

  const back = dir === 'up';
  if (back) {
    g.blob(7, top, 18, 13, s.hair, 4);
    g.rect(8, top + 10, 16, 3, s.hairDark);
  } else {
    g.blob(7, top, 18, 13, s.skin, 4);
    g.blob(7, top, 18, 4, s.hair, 3);
  }
  g.rect(6, top + 3, 2, back ? 10 : 8, s.hair);
  g.rect(24, top + 3, 2, back ? 10 : 8, s.hair);
  if (s.longHair) {
    g.rect(5, top + 8, 2, 8, s.hair);
    g.rect(25, top + 8, 2, 8, s.hair);
  }
  drawGear(g, s, dir, top);
  if (!back) {
    g.rect(11, top + 6, 2, 2, s.eye);
    g.rect(19, top + 6, 2, 2, s.eye);
    g.rect(15, top + 10, 2, 1, s.skinShade);
  }
}

/** 躯干差异化细节（围巾 / 裙摆 / 背带 / 肩甲…） */
function drawBodyExtra(g: Grid, s: Style, dir: ChibiDir, tTop: number) {
  const side = dir === 'side';
  switch (s.id) {
    case 'gunner':
      g.rect(9, tTop, 13, 2, s.accent);
      g.rect(10, tTop + 2, 3, 4, s.accent);
      break;
    case 'wind':
      if (side) g.blob(8, tTop + 5, 14, 6, s.cloth, 2);
      else g.blob(6, tTop + 5, 19, 6, s.cloth, 2);
      g.rect(15, tTop + 1, 3, 3, s.accent);
      break;
    case 'bomber':
      g.rect(10, tTop + 1, 2, 6, s.accent);
      g.rect(20, tTop + 1, 2, 6, s.accent);
      g.rect(15, tTop + 2, 3, 3, s.glow);
      break;
    case 'arcane':
      if (side) g.blob(8, tTop + 6, 14, 6, s.cloth, 2);
      else g.blob(6, tTop + 6, 19, 6, s.cloth, 2);
      g.rect(8, tTop + 7, side ? 13 : 15, 1, s.accent);
      break;
    case 'blade':
      g.rect(8, tTop, side ? 12 : 15, 2, s.clothLight);
      g.rect(8, tTop + 7, side ? 12 : 15, 2, s.metal);
      break;
    case 'war':
      g.rect(6, tTop, 5, 4, s.clothDark);
      g.rect(21, tTop, 5, 4, s.clothDark);
      g.rect(14, tTop + 3, 4, 4, s.accent);
      g.rect(15, tTop + 4, 2, 2, s.glow);
      break;
    case 'emperor':
      g.rect(9, tTop + 6, side ? 11 : 13, 1, s.accent);
      g.rect(15, tTop + 2, 3, 3, s.accent);
      break;
    default:
      break;
  }
}

/** 武器：随朝向与动作改变位置，出手帧带高光/枪口火光 */
function drawWeapon(g: Grid, s: Style, dir: ChibiDir, pose: ChibiPose) {
  const atk = pose === 'atk1' || pose === 'atk2';
  const side = dir === 'side';
  const fire = pose === 'atk2';

  switch (s.weapon) {
    case 'gun': {
      const x = side ? (atk ? 23 : 22) : 24;
      const y = atk ? 20 : 22;
      const len = side ? 6 : 5;
      g.rect(x, y, len, 2, s.metalDark);
      g.rect(x, y, len - 1, 1, s.metal);
      g.rect(x, y + 2, 2, 3, s.metalDark);
      if (fire) g.rect(x + len, y - 1, 2, 4, s.glow);
      break;
    }
    case 'staff': {
      const x = side ? 25 : 26;
      g.rect(x, 8, 2, 23, s.metalDark);
      g.rect(x, 8, 1, 23, s.metal);
      g.blob(x - 2, atk ? 2 : 3, 6, 6, s.glow, 2);
      g.blob(x, atk ? 4 : 5, 2, 2, 0xffffff, 0);
      break;
    }
    case 'orb': {
      const ox = side ? 24 : 26;
      const oy = atk ? 7 : 10;
      const r = atk ? 6 : 5;
      g.blob(ox - 1, oy, r + 1, r, s.glow, 1);
      g.rect(ox, oy + 2, 3, 3, 0xffffff);
      if (atk) {
        g.rect(ox - 2, oy - 2, 2, 2, s.glow);
        g.rect(ox + 3, oy - 3, 2, 2, s.glow);
      }
      break;
    }
    case 'bomb': {
      if (atk) {
        const x = side ? 22 : 23;
        g.blob(x, 4, 6, 6, s.metalDark, 2);
        g.rect(x + 1, 5, 2, 2, s.metal);
        g.rect(x + 4, 2, 1, 2, s.accent);
        g.rect(x + 5, 1, 2, 2, s.glow);
      } else {
        const x = side ? 22 : 23;
        g.blob(x, 22, 6, 6, s.metalDark, 2);
        g.rect(x + 1, 23, 2, 2, s.metal);
        g.rect(x + 4, 20, 1, 2, s.accent);
      }
      break;
    }
    case 'sword': {
      if (side) {
        const y = atk ? 16 : 18;
        g.rect(22, y, 8, 2, s.metal);
        g.rect(22, y, 8, 1, 0xffffff);
        g.rect(21, y - 2, 2, 6, s.accent);
        g.rect(20, y + 2, 2, 3, s.clothDark);
      } else if (atk) {
        g.rect(26, 3, 2, 16, s.metal);
        g.rect(26, 3, 1, 16, 0xffffff);
        g.rect(24, 18, 6, 2, s.accent);
        g.rect(26, 20, 2, 4, s.clothDark);
      } else {
        g.rect(27, 8, 2, 14, s.metal);
        g.rect(27, 8, 1, 14, 0xffffff);
        g.rect(25, 21, 6, 2, s.accent);
        g.rect(27, 23, 2, 3, s.clothDark);
      }
      break;
    }
    case 'cannon': {
      if (side) {
        g.rect(20, 19, 8, 6, s.metal);
        g.rect(20, 19, 8, 1, s.metalDark);
        g.rect(21, 21, 4, 2, s.metalDark);
        g.rect(28, 20, 2, 4, s.metalDark);
        if (fire) g.rect(30, 20, 1, 4, s.glow);
      } else {
        g.rect(23, 19, 5, 7, s.metal);
        g.rect(23, 19, 5, 1, s.metalDark);
        g.rect(24, 21, 3, 3, s.metalDark);
        if (fire) g.rect(27, 21, 2, 3, s.glow);
      }
      break;
    }
    case 'spear': {
      if (side) {
        const y = atk ? 19 : 21;
        g.rect(19, y, 11, 2, s.metalDark);
        g.rect(19, y, 10, 1, s.metal);
        g.rect(28, y - 1, 2, 4, s.metalDark);
        g.rect(30, y, 1, 2, s.accent);
      } else {
        g.rect(26, 4, 2, 30, s.metalDark);
        g.rect(26, 4, 1, 30, s.metal);
        g.rect(25, 1, 4, 4, s.accent);
        if (fire) g.rect(24, 0, 6, 2, s.glow);
      }
      break;
    }
    default:
      break;
  }
}

/* ---------------- 朝向组合 ---------------- */

function drawDown(s: Style, pose: ChibiPose): Grid {
  const g = new Grid();
  const atk = pose === 'atk1' || pose === 'atk2';
  const bob = pose === 'w1' || pose === 'atk1' ? -1 : 0;
  const tTop = 17 + bob;

  if (s.cape !== undefined) {
    g.blob(6, tTop, 20, 12, s.cape, 3);
    g.rect(7, tTop + 10, 18, 2, s.capeDark ?? s.cape);
  }
  drawLegs(g, s, pose, atk);

  g.blob(8, tTop, 15, 9, s.cloth, 2);
  g.rect(9, tTop + 2, 3, 5, s.clothLight);
  g.rect(8, tTop + 7, 15, 2, s.accent);
  drawBodyExtra(g, s, 'down', tTop);

  const armY = tTop + (atk ? 0 : 1);
  const lx = atk ? 4 : 5;
  const rx = atk ? 25 : 24;
  g.rect(lx, armY, 3, 6, s.cloth);
  g.rect(lx, armY, 1, 6, s.clothDark);
  g.rect(lx, armY + 6, 3, 2, s.skin);
  g.rect(rx, armY, 3, 6, s.cloth);
  g.rect(rx + 2, armY, 1, 6, s.clothDark);
  g.rect(rx, armY + 6, 3, 2, s.skin);

  drawHead(g, s, 'down', 4 + bob);
  drawWeapon(g, s, 'down', pose);
  return g;
}

function drawUp(s: Style, pose: ChibiPose): Grid {
  const g = new Grid();
  const atk = pose === 'atk1' || pose === 'atk2';
  const bob = pose === 'w1' || pose === 'atk1' ? -1 : 0;
  const tTop = 17 + bob;

  drawLegs(g, s, pose, atk);
  g.blob(8, tTop, 15, 9, s.cloth, 2);
  g.rect(9, tTop + 2, 3, 5, s.clothLight);
  g.rect(8, tTop + 7, 15, 2, s.accent);

  if (s.cape !== undefined) {
    g.blob(6, tTop - 1, 20, 12, s.cape, 3);
    g.rect(7, tTop + 9, 18, 2, s.capeDark ?? s.cape);
    g.rect(15, tTop - 1, 2, 11, s.accent);
  }

  const armY = tTop + (atk ? 0 : 1);
  g.rect(5, armY, 3, 6, s.cloth);
  g.rect(24, armY, 3, 6, s.cloth);
  g.rect(5, armY + 6, 3, 2, s.skin);
  g.rect(24, armY + 6, 3, 2, s.skin);

  drawHead(g, s, 'up', 4 + bob);
  drawWeapon(g, s, 'up', pose);
  return g;
}

function drawSide(s: Style, pose: ChibiPose): Grid {
  const g = new Grid();
  const atk = pose === 'atk1' || pose === 'atk2';
  const bob = pose === 'w1' || pose === 'atk1' ? -1 : 0;
  const tTop = 17 + bob;

  if (s.cape !== undefined) {
    g.blob(5, tTop, 14, 12, s.cape, 3);
    g.rect(5, tTop + 10, 12, 2, s.capeDark ?? s.cape);
  }
  drawSideLegs(g, s, pose, atk);

  g.blob(9, tTop, 12, 9, s.cloth, 3);
  g.rect(10, tTop + 2, 3, 5, s.clothLight);
  g.rect(9, tTop + 7, 12, 2, s.accent);
  drawBodyExtra(g, s, 'side', tTop);

  const armY = tTop + (atk ? 0 : 1);
  g.rect(19, armY, 4, 6, s.cloth);
  g.rect(19, armY + 6, 4, 2, s.skin);

  drawHead(g, s, 'side', 4 + bob);
  drawWeapon(g, s, 'side', pose);
  return g;
}

function drawChar(s: Style, dir: ChibiDir, pose: ChibiPose): Grid {
  if (dir === 'up') return drawUp(s, pose);
  if (dir === 'side') return drawSide(s, pose);
  return drawDown(s, pose);
}

/* ---------------- 对外生成 ---------------- */

export function genChibiTextures(scene: Phaser.Scene) {
  for (const id of CHIBI_CHARS) {
    const s = STYLES[id];
    for (const dir of CHIBI_DIRS) {
      for (const pose of CHIBI_POSES) {
        const raw = drawChar(s, dir, pose);
        const body = raw.ring(s.dark);
        const key = `${id}-${dir}-${pose}`;
        paint(scene, key, body);
        paint(scene, key + '-o', body.ring(RED, false), 1);
      }
    }
    // 选人 / 结算立绘：正面待机放大到 96×108
    paint(scene, `${id}-portrait`, drawChar(s, 'down', 'idle').ring(s.dark), 0, 3);
  }
}
