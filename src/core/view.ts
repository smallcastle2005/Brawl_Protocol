import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';

/**
 * 渲染超采样倍率（v0.20）
 *
 * 原因：游戏逻辑画布固定 960×600，原先 `Scale.FIT` 直接把这 960×600 的
 * 低分辨率画面用 CSS 放大到整个窗口，浏览器对整张画布做线性插值，
 * 于是像素块和文字都会糊成一片——屏幕越大越明显。
 *
 * 做法：按「窗口能容纳的逻辑倍数」把画布本身的像素尺寸放大（960S×600S），
 * 再让所有场景的相机 `zoom = S`。相机缩放以画布中心为原点，
 * 因此 960×600 的逻辑坐标布局完全不变，只是每个逻辑像素由 S×S 个真实像素绘制。
 * 这样 CSS 不再需要放大小画布，文字纹理（TEXT_RES=3）也接近 1:1，边缘清晰。
 *
 * 注：不乘 devicePixelRatio —— 高 DPI 屏上 1 个 CSS 像素本来就是整数个物理像素，
 * 按 CSS 尺寸渲染已经足够锐利，乘 DPR 只会白白多消耗 GPU。
 */
export const RENDER_SCALE = (() => {
  const fit = Math.min(window.innerWidth / GAME_WIDTH, window.innerHeight / GAME_HEIGHT);
  const s = Math.min(3.5, Math.max(1, fit));
  return Math.round(s * 20) / 20; // 0.05 步进，避免怪异的小数缩放
})();

/** 画布真实像素尺寸（Phaser 的 width/height） */
export const CANVAS_W = Math.round(GAME_WIDTH * RENDER_SCALE);
export const CANVAS_H = Math.round(GAME_HEIGHT * RENDER_SCALE);

/**
 * 相机缩放后需要补偿的滚动量（v0.20）
 *
 * Phaser 的相机缩放以「视口中心（origin）」为原点：
 *   screen = zoom * (world - scroll) + viewport * (1 - zoom) / 2
 * 若 scroll 仍为 0，逻辑 (0,0) 会被画到屏幕 (-96,-60) 处，导致 UI 整体左上偏移并被裁边。
 * 令 screen(0,0) = 0 可得 scroll = GAME_WIDTH*(1 - S)/2（高度同理）。
 *
 * 注意：scrollFactor=0 的对象（游戏内 HUD）不参与 scroll 计算，
 * 它们需要把相机 origin 设为 (0,0) 才能得到 screen = zoom * obj（见 GameScene.uiCam）。
 */
export const UI_SCROLL_X = GAME_WIDTH * (1 - RENDER_SCALE) / 2;
export const UI_SCROLL_Y = GAME_HEIGHT * (1 - RENDER_SCALE) / 2;

/** 普通场景（未使用 scrollFactor=0）在 create() 开头调用：缩放并补偿滚动 */
export function applyRenderScale(scene: Phaser.Scene): number {
  const cam = scene.cameras.main;
  cam.setZoom(RENDER_SCALE);
  cam.setScroll(UI_SCROLL_X, UI_SCROLL_Y);
  return RENDER_SCALE;
}

/** scrollFactor=0 的 HUD 相机：原点移到左上角，使 screen = RENDER_SCALE * 逻辑坐标 */
export function setupHudCamera(cam: Phaser.Cameras.Scene2D.Camera): void {
  cam.setOrigin(0, 0);
  cam.setZoom(RENDER_SCALE);
  cam.setScroll(0, 0);
}
