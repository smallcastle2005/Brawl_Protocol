import Phaser from 'phaser';

/**
 * v0.41 心兽·狼人形态贴图：
 * 48×58 像素，四向（down / up / side）+ 5 个动作帧（idle / w1 / w2 / atk1 / atk2）。
 * 体型刻意做得比 Q 版角色更宽更驼，肩高接近角色的 3 倍显示尺寸。
 */
export const WOLF_DIRS = ['down', 'up', 'side'] as const;
export const WOLF_POSES = ['idle', 'w1', 'w2', 'atk1', 'atk2'] as const;
export type WolfDir = typeof WOLF_DIRS[number];
export type WolfPose = typeof WOLF_POSES[number];

const W = 48;
const H = 58;

const C = {
  furDark: 0x232735,
  fur: 0x353b4d,
  furMid: 0x454c63,
  furLight: 0x5c6584,
  mane: 0x191c27,
  belly: 0x6e7694,
  claw: 0xd9dfec,
  eye: 0xff3b30,
  mouth: 0x7c2030,
  nose: 0x14161e,
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

  /** 椭圆块：rx / ry 为半轴 */
  blob(cx: number, cy: number, rx: number, ry: number, color: number) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / Math.max(0.6, rx);
        const dy = (y - cy) / Math.max(0.6, ry);
        if (dx * dx + dy * dy <= 1.02) this.set(x, y, color);
      }
    }
  }

  /** 从 (x,y) 起画一根逐渐收细的肢体 */
  limb(x: number, y: number, dx: number, dy: number, len: number, r0: number, r1: number, color: number) {
    const steps = Math.max(2, Math.round(len));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = x + dx * len * t;
      const py = y + dy * len * t;
      const r = r0 + (r1 - r0) * t;
      this.blob(px, py, r, r, color);
    }
  }
}

function paintLegs(g: Grid, dir: WolfDir, pose: WolfPose) {
  const step = pose === 'w1' ? 3 : pose === 'w2' ? -3 : 0;
  if (dir === 'side') {
    // 后腿（远）
    g.blob(17 + step, 47, 5, 7, C.furDark);
    g.rect(12 + step, 51, 10, 4, C.furDark);
    // 前腿（近）
    g.blob(31 - step, 46, 6, 8, C.fur);
    g.rect(27 - step, 50, 12, 5, C.fur);
    g.rect(27 - step, 54, 12, 2, C.furDark);
    return;
  }
  // 正面 / 背面：两条粗壮的弯曲腿
  const lx = 16 + step;
  const rx = 27 - step;
  g.blob(lx, 46, 6, 8, C.fur);
  g.blob(rx + 1, 46, 6, 8, C.fur);
  g.rect(lx - 4, 50, 12, 5, C.fur);
  g.rect(rx - 3, 50, 12, 5, C.fur);
  g.rect(lx - 4, 54, 12, 2, C.furDark);
  g.rect(rx - 3, 54, 12, 2, C.furDark);
}

function paintTorso(g: Grid, dir: WolfDir, pose: WolfPose) {
  const drop = pose === 'atk1' ? 2 : pose === 'atk2' ? 1 : 0;
  if (dir === 'side') {
    // 侧身：驼背的胸腔
    g.blob(24, 27 + drop, 15, 13, C.fur);
    g.blob(22, 24 + drop, 13, 9, C.furMid);
    g.blob(29, 24 + drop, 8, 8, C.furLight);
    // 背部鬃毛
    g.blob(15, 22 + drop, 7, 10, C.mane);
    g.rect(10, 18 + drop, 6, 16, C.mane);
    return;
  }
  // 宽肩窄腰的巨型倒三角
  g.blob(24, 26 + drop, 17, 12, C.fur);
  g.blob(24, 20 + drop, 16, 7, C.furMid);
  g.blob(24, 31 + drop, 12, 9, C.fur);
  if (dir === 'down') {
    // 胸腹浅色毛
    g.blob(24, 29 + drop, 8, 9, C.belly);
    g.blob(24, 24 + drop, 10, 5, C.furLight);
  } else {
    // 背部：整片深色鬃毛
    g.blob(24, 24 + drop, 12, 12, C.mane);
    g.rect(22, 14 + drop, 4, 18, C.mane);
  }
  // 肩部鬃毛尖刺
  for (let i = 0; i < 5; i++) {
    const x = 8 + i * 8;
    g.rect(x, 14 + drop + (i % 2), 3, 5, C.mane);
  }
}

function paintArms(g: Grid, dir: WolfDir, pose: WolfPose) {
  const up = pose === 'atk1' ? 5 : 0;
  const lunge = pose === 'atk2' ? 5 : 0;
  if (dir === 'side') {
    // 远侧手臂（暗）
    g.limb(19, 24 + up, 0.2, 1, 16, 4.5, 3, C.furDark);
    // 近侧手臂：攻击帧向前伸出
    g.limb(30, 25 + up, 0.45 + lunge * 0.06, 0.9 - lunge * 0.06, 18, 5.5, 3.6, C.fur);
    const px = 30 + (0.45 + lunge * 0.06) * 18;
    const py = 25 + up + (0.9 - lunge * 0.06) * 18;
    paintClaw(g, px, py, 1, lunge > 0 ? 0.25 : 1);
    return;
  }
  if (dir === 'up') {
    g.limb(9, 22 + up, -0.15, 1, 18, 5, 3.4, C.fur);
    g.limb(38, 22 + up, 0.15, 1, 18, 5, 3.4, C.fur);
    paintClaw(g, 7, 41 + up, 0, 1);
    paintClaw(g, 40, 41 + up, 0, -1);
    return;
  }
  // 正面：两只极长的前臂，攻击帧张开
  const spread = pose === 'atk2' ? 3 : 0;
  g.limb(8 - spread, 23 + up, -0.22, 1, 18, 5.5, 3.6, C.fur);
  g.limb(39 + spread, 23 + up, 0.22, 1, 18, 5.5, 3.6, C.fur);
  paintClaw(g, 4 - spread, 42 + up, 1, 1);
  paintClaw(g, 43 + spread, 42 + up, -1, -1);
}

function paintClaw(g: Grid, x: number, y: number, dx: number, dy: number) {
  for (let i = -1; i <= 1; i++) {
    const cx = Math.round(x + i * 3 + dx * 2);
    const cy = Math.round(y + dy * 3);
    g.rect(cx, cy, 1, 4, C.claw);
    g.rect(cx + dx, cy + 3, 1, 2, C.claw);
  }
}

function paintHead(g: Grid, dir: WolfDir, pose: WolfPose) {
  const drop = pose === 'atk1' ? 2 : pose === 'atk2' ? 1 : 0;
  const hx = 24;
  const hy = 12 + drop;
  if (dir === 'up') {
    // 后脑：整片毛发 + 双耳
    g.blob(hx, hy, 9, 9, C.furMid);
    g.blob(hx, hy - 3, 7, 6, C.mane);
    g.rect(15, hy - 12, 5, 7, C.furDark);
    g.rect(28, hy - 12, 5, 7, C.furDark);
    g.rect(16, hy - 13, 3, 3, C.mane);
    g.rect(29, hy - 13, 3, 3, C.mane);
    return;
  }
  if (dir === 'side') {
    // 侧脸：向前突出口鼻
    g.blob(hx + 4, hy, 9, 8, C.furMid);
    g.blob(hx + 12, hy + 3, 6, 4, C.furLight);
    g.rect(hx + 16, hy + 2, 4, 3, C.nose);
    // 张开的下颌与獠牙
    g.rect(hx + 12, hy + 6, 7, 3, C.mouth);
    for (let i = 0; i < 3; i++) g.rect(hx + 12 + i * 2, hy + 6, 1, 2, C.claw);
    // 耳朵 + 怒目
    g.rect(hx + 1, hy - 12, 5, 7, C.furDark);
    g.rect(hx + 2, hy - 13, 3, 3, C.mane);
    g.rect(hx + 7, hy - 2, 4, 2, C.eye);
    g.rect(hx + 7, hy - 3, 4, 1, C.mane);
    return;
  }
  // 正面
  g.blob(hx, hy, 9, 8, C.furMid);
  g.blob(hx, hy + 5, 5, 5, C.furLight);
  g.rect(hx - 2, hy + 7, 5, 3, C.nose);
  g.rect(hx - 4, hy + 10, 9, 2, C.mouth);
  for (let i = 0; i < 3; i++) g.rect(hx - 3 + i * 3, hy + 9, 1, 3, C.claw);
  // 双耳
  g.rect(hx - 11, hy - 11, 5, 8, C.furDark);
  g.rect(hx + 6, hy - 11, 5, 8, C.furDark);
  g.rect(hx - 10, hy - 12, 3, 3, C.mane);
  g.rect(hx + 7, hy - 12, 3, 3, C.mane);
  // 发光的红眼
  g.rect(hx - 6, hy - 1, 4, 2, C.eye);
  g.rect(hx + 2, hy - 1, 4, 2, C.eye);
  g.rect(hx - 6, hy - 2, 4, 1, C.mane);
  g.rect(hx + 2, hy - 2, 4, 1, C.mane);
}

function paintTail(g: Grid, dir: WolfDir, pose: WolfPose) {
  if (dir === 'up') {
    g.limb(24, 40, 0.1, 0.9, 15, 4, 1.5, C.furDark);
    return;
  }
  if (dir === 'side') {
    g.limb(14, 30, -0.8, 0.4, 14, 4.5, 1.5, C.furDark);
    return;
  }
  // 正面：尾巴从侧后方探出
  g.limb(12, 34, -0.35, 0.85, 14, 4, 1.5, C.furDark);
}

function paintPose(g: Grid, dir: WolfDir, pose: WolfPose) {
  paintTail(g, dir, pose);
  paintLegs(g, dir, pose);
  paintTorso(g, dir, pose);
  paintArms(g, dir, pose);
  paintHead(g, dir, pose);
}

/** 生成心兽狼人全部贴图（scene 只用于创建 CanvasTexture 与动画） */
export function genWolfTextures(scene: Phaser.Scene) {
  for (const dir of WOLF_DIRS) {
    for (const pose of WOLF_POSES) {
      const g = new Grid();
      paintPose(g, dir, pose);
      const key = `heart-beast-${dir}-${pose}`;
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
