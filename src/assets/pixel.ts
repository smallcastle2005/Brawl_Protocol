import Phaser from 'phaser';

/**
 * 程序化像素纹理生成：rows 为字符矩阵，pal 为字符→颜色映射。
 * 每个像素按 scale 放大，scale>1 时用于生成头像/大图。
 */
export function makeTex(
  scene: Phaser.Scene,
  key: string,
  rows: string[],
  pal: Record<string, number>,
  scale = 1,
): Phaser.Textures.CanvasTexture {
  if (scene.textures.exists(key)) {
    return scene.textures.get(key) as Phaser.Textures.CanvasTexture;
  }
  const h = rows.length;
  const w = rows[0].length;
  const tex = scene.textures.createCanvas(key, w * scale, h * scale);
  if (!tex) throw new Error('texture exists: ' + key);
  const ctx = tex.getContext();
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const c = pal[ch];
      if (c === undefined) continue;
      ctx.fillStyle = '#' + c.toString(16).padStart(6, '0');
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  tex.refresh();
  return tex;
}

/** 校验字符矩阵行列是否一致（开发期辅助） */
export function assertMatrix(name: string, rows: string[], w: number, h: number) {
  if (rows.length !== h) throw new Error(`${name}: expect ${h} rows, got ${rows.length}`);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].length !== w) {
      throw new Error(`${name}: row ${i} expect ${w} cols, got ${rows[i].length}`);
    }
  }
}