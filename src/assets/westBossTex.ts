import Phaser from 'phaser';

/**
 * 第二关双 BOSS 贴图：
 * 56×64 像素，四向（down / up / side）+ 5 个动作帧（idle / w1 / w2 / atk1 / atk2）。
 * 西部恶魔：黑色面部 + 红眼 + 深色牛仔帽 + 双枪；
 * 西部天使：白色面部 + 金眼 + 白色牛仔帽 + 大炮。
 */
export const WEST_BOSS_DIRS = ['down', 'up', 'side'] as const;
export const WEST_BOSS_POSES = ['idle', 'w1', 'w2', 'atk1', 'atk2'] as const;
export type WestBossDir = typeof WEST_BOSS_DIRS[number];
export type WestBossPose = typeof WEST_BOSS_POSES[number];
export type WestBossKind = 'west-demon' | 'west-angel';

const W = 56;
const H = 64;

interface Palette {
  hat: number;
  hatDark: number;
  band: number;
  face: number;
  faceShade: number;
  eye: number;
  coat: number;
  coatDark: number;
  trim: number;
  boot: number;
  gun: number;
  gunDark: number;
}

const DEMON: Palette = {
  hat: 0x2a1c18,
  hatDark: 0x150d0b,
  band: 0xc41f2a,
  face: 0x0d0a12,
  faceShade: 0x1c1420,
  eye: 0xff2b2b,
  coat: 0x3a1018,
  coatDark: 0x23080e,
  trim: 0xb8863a,
  boot: 0x181012,
  gun: 0x6a6e78,
  gunDark: 0x2b2f36,
};

const ANGEL: Palette = {
  hat: 0xf2eee2,
  hatDark: 0xc8c0ac,
  band: 0xffd75e,
  face: 0xfbf7ee,
  faceShade: 0xd9d0bc,
  eye: 0xffc93a,
  coat: 0xe8e2d2,
  coatDark: 0xb9b09a,
  trim: 0xffd75e,
  boot: 0xcfc6b0,
  gun: 0xd8b24a,
  gunDark: 0x8a6a1c,
};

class Grid {
  readonly px: number[] = new Array(W * H).fill(0);

  set(x: number, y: number, color: number) {
    if (x < 0 || y < 0 || x >= W || y >= H || color === 0) return;
    this.px[(y | 0) * W + (x | 0)] = color;
  }

  rect(x: number, y: number, w: number, h: number, color: number) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color);
  }

  blob(cx: number, cy: number, rx: number, ry: number, color: number) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / Math.max(0.6, rx);
        const dy = (y - cy) / Math.max(0.6, ry);
        if (dx * dx + dy * dy <= 1.02) this.set(x, y, color);
      }
    }
  }

  limb(x: number, y: number, dx: number, dy: number, len: number, r0: number, r1: number, color: number) {
    const steps = Math.max(2, Math.round(len));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.blob(x + dx * len * t, y + dy * len * t, r0 + (r1 - r0) * t, r0 + (r1 - r0) * t, color);
    }
  }
}

function paintLegs(g: Grid, p: Palette, dir: WestBossDir, pose: WestBossPose) {
  const step = pose === 'w1' ? 3 : pose === 'w2' ? -3 : 0;
  if (dir === 'side') {
    g.blob(23 + step, 52, 6, 8, p.coatDark);
    g.rect(17 + step, 58, 14, 5, p.boot);
    g.blob(33 - step, 52, 6, 8, p.coat);
    g.rect(28 - step, 58, 14, 5, p.boot);
    return;
  }
  g.blob(21 + step, 52, 6, 8, p.coatDark);
  g.rect(15 + step, 58, 14, 5, p.boot);
  g.blob(35 - step, 52, 6, 8, p.coatDark);
  g.rect(29 - step, 58, 14, 5, p.boot);
}

function paintTorso(g: Grid, p: Palette, dir: WestBossDir, pose: WestBossPose) {
  const drop = pose === 'atk1' ? 1 : 0;
  if (dir === 'side') {
    // 侧身：长风衣下摆
    g.blob(28, 36 + drop, 12, 14, p.coat);
    g.blob(28, 32 + drop, 11, 8, p.coatDark);
    g.rect(18, 40, 6, 16, p.coatDark);
    g.rect(24, 34, 3, 20, p.trim);
    return;
  }
  // 正面 / 背面：宽肩长风衣
  g.blob(28, 34 + drop, 15, 12, p.coat);
  g.blob(28, 28 + drop, 14, 7, p.coatDark);
  if (dir === 'down') {
    // 前襟与腰带
    g.rect(20, 32 + drop, 4, 16, p.trim);
    g.rect(32, 32 + drop, 4, 16, p.trim);
    g.rect(19, 44 + drop, 18, 4, p.coatDark);
    g.rect(27, 44 + drop, 3, 4, p.trim);
  } else {
    // 背面：整片风衣 + 中缝
    g.rect(27, 24 + drop, 2, 26, p.coatDark);
  }
  // 双肩装饰
  g.blob(15, 30 + drop, 4, 5, p.coatDark);
  g.blob(41, 30 + drop, 4, 5, p.coatDark);
}

function paintPistol(g: Grid, x: number, y: number, p: Palette, flip: number) {
  g.rect(x, y, 9, 4, p.gun);
  g.rect(x + 9 * flip, y, 3, 2, p.gunDark);
  g.rect(x + 1, y + 4, 3, 5, p.gunDark);
}

function paintCannon(g: Grid, p: Palette, dir: WestBossDir, pose: WestBossPose) {
  const up = pose === 'atk1' ? 4 : 0;
  if (dir === 'side') {
    // 侧身扛炮：粗炮管朝前
    g.rect(34, 30 - up, 20, 10, p.gun);
    g.rect(34, 30 - up, 20, 3, p.trim);
    g.rect(52, 27 - up, 5, 16, p.gunDark);
    g.rect(30, 34 - up, 8, 7, p.gunDark);
    return;
  }
  if (dir === 'up') {
    g.rect(34, 18 - up, 10, 22, p.gunDark);
    return;
  }
  // 正面：横抱大炮
  g.rect(12, 38 - up, 32, 9, p.gun);
  g.rect(12, 40 - up, 32, 3, p.trim);
  g.rect(8, 36 - up, 6, 13, p.gunDark);
  g.rect(44, 36 - up, 6, 13, p.gunDark);
}

function paintArms(g: Grid, p: Palette, dir: WestBossDir, pose: WestBossPose, kind: WestBossKind) {
  const up = pose === 'atk1' ? 5 : 0;
  const lunge = pose === 'atk2' ? 4 : 0;
  if (dir === 'side') {
    const ax = 30 + lunge;
    g.limb(22, 28 + up, 0.2, 1, 14, 4.5, 3, p.coatDark);
    g.limb(ax, 28 + up, 0.4, 0.9, 15, 5, 3.4, p.coat);
    if (kind === 'west-demon') {
      paintPistol(g, ax + 12, 40 + up, p, 1);
    } else {
      paintCannon(g, p, dir, pose);
    }
    return;
  }
  if (dir === 'up') {
    g.limb(12, 28 + up, -0.2, 1, 15, 5, 3.4, p.coat);
    g.limb(43, 28 + up, 0.2, 1, 15, 5, 3.4, p.coat);
    if (kind === 'west-angel') paintCannon(g, p, dir, pose);
    return;
  }
  // 正面：双臂张开
  const spread = pose === 'atk2' ? 3 : 0;
  g.limb(13 - spread, 28 + up, -0.2, 1, 14, 5, 3.4, p.coat);
  g.limb(42 + spread, 28 + up, 0.2, 1, 14, 5, 3.4, p.coat);
  if (kind === 'west-demon') {
    paintPistol(g, 4 - spread, 40 + up, p, -1);
    paintPistol(g, 43 + spread, 40 + up, p, 1);
  } else {
    paintCannon(g, p, dir, pose);
  }
}

function paintHead(g: Grid, p: Palette, dir: WestBossDir, pose: WestBossPose) {
  const drop = pose === 'atk1' ? 2 : 0;
  const hx = 28;
  const hy = 19 + drop;
  if (dir === 'up') {
    // 后脑 + 帽檐
    g.blob(hx, hy, 8, 8, p.faceShade);
    g.blob(hx, hy - 9, 16, 4, p.hatDark);
    g.blob(hx, hy - 10, 15, 3, p.hat);
    g.blob(hx, hy - 16, 9, 7, p.hat);
    g.rect(hx - 9, hy - 14, 18, 3, p.band);
    return;
  }
  if (dir === 'side') {
    // 侧脸
    g.blob(hx + 2, hy, 8, 8, p.face);
    g.blob(hx + 9, hy + 3, 5, 3, p.faceShade);
    g.rect(hx + 6, hy - 2, 5, 2, p.eye);
    // 帽檐 + 帽冠
    g.blob(hx, hy - 8, 17, 4, p.hatDark);
    g.blob(hx - 1, hy - 9, 16, 3, p.hat);
    g.blob(hx - 1, hy - 15, 9, 7, p.hat);
    g.rect(hx - 10, hy - 13, 18, 3, p.band);
    return;
  }
  // 正面
  g.blob(hx, hy, 8, 8, p.face);
  g.blob(hx, hy + 4, 5, 4, p.faceShade);
  g.rect(hx - 5, hy - 1, 4, 2, p.eye);
  g.rect(hx + 2, hy - 1, 4, 2, p.eye);
  // 高光让眼睛“发光”
  g.rect(hx - 4, hy - 1, 2, 1, 0xffffff);
  g.rect(hx + 3, hy - 1, 2, 1, 0xffffff);
  // 帽檐 + 帽冠 + 帽带
  g.blob(hx, hy - 8, 17, 4, p.hatDark);
  g.blob(hx, hy - 9, 16, 3, p.hat);
  g.blob(hx, hy - 16, 9, 7, p.hat);
  g.rect(hx - 9, hy - 13, 18, 3, p.band);
  g.rect(hx - 9, hy - 16, 18, 1, p.hatDark);
}

function paintPose(g: Grid, p: Palette, dir: WestBossDir, pose: WestBossPose, kind: WestBossKind) {
  paintLegs(g, p, dir, pose);
  paintTorso(g, p, dir, pose);
  paintArms(g, p, dir, pose, kind);
  paintHead(g, p, dir, pose);
}

/** 生成西部双 BOSS 全部贴图 */
export function genWestBossTextures(scene: Phaser.Scene) {
  for (const kind of ['west-demon', 'west-angel'] as WestBossKind[]) {
    const p = kind === 'west-demon' ? DEMON : ANGEL;
    for (const dir of WEST_BOSS_DIRS) {
      for (const pose of WEST_BOSS_POSES) {
        const g = new Grid();
        paintPose(g, p, dir, pose, kind);
        const key = `${kind}-${dir}-${pose}`;
        if (scene.textures.exists(key)) scene.textures.remove(key);
        const tex = scene.textures.createCanvas(key, W, H);
        if (!tex) continue;
        const ctx = tex.getContext();
        const img = ctx.createImageData(W, H);
        for (let i = 0; i < g.px.length; i++) {
          const v = g.px[i];
          img.data[i * 4 + 0] = (v >> 16) & 0xff;
          img.data[i * 4 + 1] = (v >> 8) & 0xff;
          img.data[i * 4 + 2] = v & 0xff;
          img.data[i * 4 + 3] = v === 0 ? 0 : 255;
        }
        ctx.putImageData(img, 0, 0);
        tex.refresh();
      }
    }
  }
}
