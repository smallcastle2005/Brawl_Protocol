import Phaser from 'phaser';
import './style.css';
import { GAME_WIDTH, GAME_HEIGHT } from './config';
import { CANVAS_W, CANVAS_H } from './core/view';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { CodexScene } from './scenes/CodexScene';
import { EquipmentScene } from './scenes/EquipmentScene';
import { SelectScene } from './scenes/SelectScene';
import { ModeScene } from './scenes/ModeScene';
import { LevelSelectScene } from './scenes/LevelSelectScene';
import { GameScene } from './scenes/GameScene';
import { EndScene } from './scenes/EndScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: CANVAS_W,
  height: CANVAS_H,
  backgroundColor: '#0b0d15',
  pixelArt: true,
  roundPixels: true,
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  scale: {
    // 自适应窗口：画布已是高分辨率（960×600 的 RENDER_SCALE 倍），
    // FIT 只负责适配，不再需要浏览器把小画布放大到模糊
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: CANVAS_W,
    height: CANVAS_H,
  },
  scene: [BootScene, MenuScene, CodexScene, EquipmentScene, SelectScene, ModeScene, LevelSelectScene, GameScene, EndScene],
});

// 便于调试/自动化测试访问游戏实例
(window as unknown as { __PB_GAME: Phaser.Game }).__PB_GAME = game;