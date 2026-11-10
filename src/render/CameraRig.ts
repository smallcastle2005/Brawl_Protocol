import Phaser from 'phaser';
import { BALANCE, BASE_ZOOM, CHAR, CharId } from '../config';
import { CANVAS_W, RENDER_SCALE } from '../core/view';

/** 读取对象的 scrollFactorX（用 0 区分屏幕 UI 与世界对象） */
export function scrollFactorX(o: Phaser.GameObjects.GameObject): number {
  return (o as unknown as { scrollFactorX?: number }).scrollFactorX ?? 1;
}

/** 缩放计算只需要这两个字段 */
interface ZoomSubject {
  charId: CharId;
  arcaneCharging: boolean;
}

/**
 * 相机编排：世界相机缩放、UI 相机分层、震屏。
 * 只碰相机，不读写战斗状态。
 */
export class CameraRig {
  private zoomTarget = BASE_ZOOM;

  constructor(private scene: Phaser.Scene) {}

  /** 每局开场把目标缩放重置为本局基础缩放 */
  resetZoom(z: number) {
    this.zoomTarget = z;
    this.scene.cameras.main.setZoom(z);
  }

  /** 全局减弱震屏：幅度按渲染超采样倍率归一，避免大屏上震得更厉害 */
  shake(mag: number, dur: number) {
    this.scene.cameras.main.shake(dur * 0.8, (mag * 0.45) / RENDER_SCALE);
  }

  /** 按奥术蓄力 / 帝君雄兵状态平滑调整世界相机缩放（视野越大 zoom 越小） */
  syncZoom(
    player: ZoomSubject, baseZoom: number, soldierCount: number, globalVision = 1,
  ) {
    let vision = globalVision;
    if (player.arcaneCharging) vision *= BALANCE.arcane.visionMul;
    if (player.charId === CHAR.EMPEROR && soldierCount > 0) vision *= BALANCE.emperor.visionMul;
    const want = baseZoom / vision;
    if (Math.abs(want - this.zoomTarget) < 1e-4) return;
    this.zoomTarget = want;
    const cam = this.scene.cameras.main;
    this.scene.tweens.killTweensOf(cam);
    this.scene.tweens.add({ targets: cam, zoom: want, duration: 320, ease: 'SineOut' });
  }

  /** 当前视野半径：基础视野 +20%；奥术登神蓄力期间额外扩大 80% */
  get visionRadius(): number {
    return (CANVAS_W / 2) / this.scene.cameras.main.zoom;
  }

  /** UI 相机忽略所有世界对象（含运行期动态新建的粒子/伤害数字） */
  syncUiCamera(uiCam?: Phaser.Cameras.Scene2D.Camera) {
    if (!uiCam) return;
    for (const o of this.scene.children.list) {
      if (scrollFactorX(o) !== 0) uiCam.ignore(o);
    }
  }
}
