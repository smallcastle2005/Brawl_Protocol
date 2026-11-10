import Phaser from 'phaser';

/** 全游戏正文字体 —— 想整体换字体只改这一处 */
export const FONT_BODY =
  '"Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif';
/** 数字/等宽信息（计时、战绩、伤害数字） */
export const FONT_MONO = '"Consolas", "Cascadia Mono", "Courier New", monospace';
/** 文字纹理按 4 倍生成再缩回逻辑尺寸，配合画布超采样保证大字也不糊（覆盖最高 3.5 倍超采样） */
export const TEXT_RES = 4;

/**
 * 让该场景内所有 Text 都使用 4 倍纹理 + 线性采样。
 * 在 scene.create() 开头调用一次即可（内部幂等，重复调用不会重复监听）。
 */
export function useCrispText(scene: Phaser.Scene): void {
  const tag = '__crispTextHooked';
  const s = scene as unknown as Record<string, boolean>;
  if (s[tag]) return;
  s[tag] = true;
  scene.events.on(
    Phaser.Scenes.Events.ADDED_TO_SCENE,
    (obj: Phaser.GameObjects.GameObject) => {
      if (obj instanceof Phaser.GameObjects.Text) {
        obj.setResolution(TEXT_RES);
        obj.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
    },
  );
}
