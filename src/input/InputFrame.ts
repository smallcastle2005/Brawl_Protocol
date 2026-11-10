import Phaser from 'phaser';

/**
 * 与输入设备无关的一帧输入。
 * 手柄字段当前预留：本地键鼠适配器会填 0 / -1，后续接入手柄时只需补一个适配器。
 */
export interface InputFrame {
  /** 移动轴，范围 [-1, 1] */
  moveX: number;
  moveY: number;
  /** 瞄准点（世界坐标） */
  aimWorldX: number;
  aimWorldY: number;
  primaryHeld: boolean;
  secondaryHeld: boolean;
  primaryPressed: boolean;
  secondaryPressed: boolean;
  skillHeld: boolean;
  skillPressed: boolean;
  /** 输入设备 */
  device: 'kbm' | 'pad';
  /** 手柄索引（-1 = 未连接，预留） */
  padIndex: number;
  /** 右摇杆瞄准向量（预留） */
  aimStickX: number;
  aimStickY: number;
}

export function createEmptyInputFrame(): InputFrame {
  return {
    moveX: 0,
    moveY: 0,
    aimWorldX: 0,
    aimWorldY: 0,
    primaryHeld: false,
    secondaryHeld: false,
    primaryPressed: false,
    secondaryPressed: false,
    skillHeld: false,
    skillPressed: false,
    device: 'kbm',
    padIndex: -1,
    aimStickX: 0,
    aimStickY: 0,
  };
}

/**
 * 本地键鼠适配器：把 Phaser 的键鼠状态采样成 InputFrame。
 * 返回的是内部复用对象，请勿在下一帧采样后继续持有。
 */
export class LocalInputAdapter {
  private frame = createEmptyInputFrame();
  private prevPrimary = false;
  private prevSecondary = false;
  private prevSkill = false;

  constructor(
    private scene: Phaser.Scene,
    private keys: Record<string, Phaser.Input.Keyboard.Key>,
    private skillKey?: Phaser.Input.Keyboard.Key,
  ) {}

  sample(): InputFrame {
    const p = this.scene.input.activePointer;
    const wp = this.scene.cameras.main.getWorldPoint(p.x, p.y);
    const k = this.keys;
    const f = this.frame;

    f.moveX = (k.A?.isDown ? -1 : 0) + (k.D?.isDown ? 1 : 0);
    f.moveY = (k.W?.isDown ? -1 : 0) + (k.S?.isDown ? 1 : 0);
    f.aimWorldX = wp.x;
    f.aimWorldY = wp.y;

    f.primaryHeld = p.leftButtonDown();
    f.secondaryHeld = p.rightButtonDown();
    f.primaryPressed = f.primaryHeld && !this.prevPrimary;
    f.secondaryPressed = f.secondaryHeld && !this.prevSecondary;

    const skillHeld = this.skillKey?.isDown ?? false;
    f.skillHeld = skillHeld;
    f.skillPressed = skillHeld && !this.prevSkill;

    this.prevPrimary = f.primaryHeld;
    this.prevSecondary = f.secondaryHeld;
    this.prevSkill = skillHeld;
    return f;
  }
}
