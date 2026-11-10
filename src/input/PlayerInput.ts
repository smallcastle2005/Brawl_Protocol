import Phaser from 'phaser';
import {
  CHAR, MODE, ModeId,
} from '../config';
import { RENDER_SCALE } from '../core/view';
import { dist, subMapWorldPoint } from '../core/util';
import { LocalInputAdapter } from './InputFrame';
import type { Fighter } from '../entities/Fighter';
import type { FxRenderer } from '../render/FxRenderer';

/** 玩家输入需要的最小宿主状态与技能入口 */
export interface InputHost extends Phaser.Scene {
  player: Fighter;
  fighters: Fighter[];
  started: boolean;
  over: boolean;
  mode: ModeId;
  /** 当前关卡布局（轰炸子地图按活动区域换算点击落点） */
  layout: { bounds?: { x: number; y: number; w: number; h: number } };
  readonly visionRadius: number;
  fx: FxRenderer;
  canAct(f: Fighter): boolean;
  fireGunnerShot(f: Fighter, angle: number): void;
  beginGustCharge(f: Fighter): void;
  fireInstantGust(f: Fighter): void;
  releaseGust(f: Fighter, powerOverride?: number): void;
  castStorm(f: Fighter, x: number, y: number): void;
  activateGunnerSkill(f: Fighter): void;
  dashGunner(f: Fighter, angle: number): void;
  /** 西部回忆「死神之眼」：右键锁定 / 取消锁 / 锁定射击 */
  beginGunnerLock(f: Fighter, x: number, y: number): boolean;
  cancelGunnerLock(f: Fighter): void;
  fireGunnerLockShot(f: Fighter): void;
  /** 终极法典「奥术轰击」：长按右键引导 / 松开停止 */
  startArcaneBeam(f: Fighter): void;
  stopArcaneBeam(f: Fighter): void;
  fireWarShot(f: Fighter, angle: number): void;
  fireWarLaser(f: Fighter): void;
  /** 覆盖协议：切换常规 / 火力压制形态（超负荷芯片） */
  toggleWarSuppress(f: Fighter): void;
  /** 火力压制：长按右键持续激光 */
  beginWarLaserHold(f: Fighter): void;
  stopWarLaserHold(f: Fighter): void;
  beginWarHold(f: Fighter): void;
  castEmperorCharge(f: Fighter, x: number, y: number): void;
  castEmperorSwap(f: Fighter): void;
  castEmperorSkill(f: Fighter): void;
  choosePolicy(idx: number, byClick: boolean): void;
  policyIndexAt(ux: number): number;
  fireVolley(f: Fighter, target: Fighter): void;
  beginStrike(f: Fighter, x: number, y: number): void;
  launchStrike(f: Fighter): void;
  /** 最后狂欢：轰炸地图内右键锁定目标 / 左键改选轰炸点 / 空格确认 / 取消 */
  lockFinalTarget(f: Fighter, x: number, y: number): void;
  launchFinalStrike(f: Fighter): void;
  clearFinalTarget(f: Fighter): void;
  castArcaneReject(f: Fighter, x: number, y: number): void;
  tryArcaneJump(f: Fighter, x: number, y: number): void;
  startArcaneAscend(f: Fighter): void;
  fireBladeWave(f: Fighter, angle: number): void;
  startWaltz(f: Fighter): void;
  bladeDash(f: Fighter): void;
}

/**
 * 玩家输入：键鼠事件绑定、每帧移动采样与各角色的攻击/技能入口。
 * 只做「输入 → 技能调用」的路由，不结算伤害。
 */
export class PlayerInput {
  private keys: Record<string, Phaser.Input.Keyboard.Key>;
  private localInput: LocalInputAdapter;

  constructor(
    private host: InputHost,
    private pause: { paused: boolean; toggle(): void },
  ) {
    // 阶段一：输入统一采样为 InputFrame（键鼠 / 手柄共用同一契约）
    this.keys = host.input.keyboard!.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;
    this.localInput = new LocalInputAdapter(host, this.keys);
  }

  /** 绑定键盘 / 指针事件（每局重建，避免复用场景时订阅叠加） */
  bind() {
    const h = this.host;
    h.input.keyboard!.on('keydown-SPACE', () => this.onSkill());
    h.input.keyboard!.on('keyup-SPACE', () => this.onSkillRelease());
    h.input.keyboard!.on('keydown-ESC', () => this.onCancel());
    // 独裁方针快捷键
    h.input.keyboard!.on('keydown-ONE', () => h.choosePolicy(1, false));
    h.input.keyboard!.on('keydown-TWO', () => h.choosePolicy(2, false));
    h.input.keyboard!.on('keydown-THREE', () => h.choosePolicy(3, false));
    h.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) {
        this.onRightDown();
        return;
      }
      if (p.leftButtonDown()) this.onAttackDown();
    });
    h.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.leftButtonReleased()) this.onLeftUp();
      if (p.rightButtonReleased()) this.onRightUp();
    });
    h.input.mouse!.disableContextMenu();
  }

  /** 每帧：读取移动轴与长按攻击 */
  handle(dt: number) {
    const f = this.host.player;
    if (!f.alive) {
      f.moveX = 0;
      f.moveY = 0;
      return;
    }
    // 混乱（心兽「怒号」）：完全失去控制，随机走动
    if (f.confuseT > 0) {
      f.confuseDirT -= dt;
      if (f.confuseDirT <= 0) {
        f.confuseDirT = 0.35 + Math.random() * 0.4;
        const a = Math.random() * Math.PI * 2;
        f.confuseMX = Math.cos(a);
        f.confuseMY = Math.sin(a);
      }
      f.moveX = f.confuseMX;
      f.moveY = f.confuseMY;
      return;
    }
    const frame = this.localInput.sample();
    if (f.charId === CHAR.WAR) f.warFireHeld = frame.primaryHeld && !frame.secondaryHeld;
    if (f.charId !== CHAR.BOMBER) {
      f.faceAngle = Math.atan2(frame.aimWorldY - f.y, frame.aimWorldX - f.x);
    }
    if (!this.host.canAct(f) || f.bombTargeting) {
      f.moveX = 0;
      f.moveY = 0;
      return;
    }
    f.moveX = frame.moveX;
    f.moveY = frame.moveY;
    // 华尔兹期间锁定位移（穿刺位移由 updateBladeWaltz 逐帧推进）
    if (f.waltzActive) {
      f.moveX = 0;
      f.moveY = 0;
    }

    // 长按左键连续攻击（右键积攒狂风期间仍可使用左键瞬发；帝君左键为点选冲锋，不连发）
    if (frame.primaryHeld && f.charId !== CHAR.EMPEROR) {
      if (f.charId === CHAR.GUNNER && !f.skillActive && !f.lockTarget) {
        this.host.fireGunnerShot(f, f.faceAngle);
      } else if (f.charId === CHAR.WIND && f.atkCd <= 0) {
        this.host.fireInstantGust(f);
      } else if (f.charId === CHAR.WAR && f.atkCd <= 0 && !f.warLaserHeld) {
        this.host.fireWarShot(f, f.faceAngle);
      } else if (f.charId === CHAR.ARCANE) {
        if (f.arcaneCharging) this.host.tryArcaneJump(f, frame.aimWorldX, frame.aimWorldY);
        else if (f.atkCd <= 0) this.host.castArcaneReject(f, frame.aimWorldX, frame.aimWorldY);
      }
    }
  }

  private onRightDown() {
    const h = this.host;
    const f = h.player;
    if (!f.alive || f.confuseT > 0) return;
    if (f.silenced) return;
    if (f.charId === CHAR.GUNNER) {
      // 「死神之眼」：右键锁定一名敌人，再次右键取消锁定
      if (f.highNoonUnlocked && h.canAct(f)) {
        if (f.lockTarget) h.cancelGunnerLock(f);
        else {
          const p = h.input.activePointer;
          const wp = h.cameras.main.getWorldPoint(p.x, p.y);
          h.beginGunnerLock(f, wp.x, wp.y);
        }
      }
      return;
    }
    if (f.charId === CHAR.ARCANE) {
      // 「奥术轰击」：长按右键持续消耗能量放置能量球
      if (h.canAct(f)) h.startArcaneBeam(f);
      return;
    }
    if (f.charId === CHAR.EMPEROR) {
      if (h.canAct(f) && !f.silenced) h.castEmperorSwap(f);
      return;
    }
    if (f.charId === CHAR.BOMBER) {
      if (f.bombTargeting) {
        if (f.bomberEquipUnlocked && !f.finalUsed) {
          // 最后狂欢：右键在轰炸地图上锁定单个目标
          const wp = this.subMapWorld(h.input.activePointer);
          if (wp) h.lockFinalTarget(f, wp.x, wp.y);
        } else if (f.skillCd <= 0) {
          // 无终极导弹可用时，右键等同确认普通轰炸（冷却中不响应）
          h.launchStrike(f);
        }
      }
      return;
    }
    if (f.charId === CHAR.WIND && h.canAct(f) && !f.bombTargeting) {
      // 脱手积攒：首次右键开始积攒，再次右键朝鼠标发射
      if (f.gustCharging) h.releaseGust(f);
      else h.beginGustCharge(f);
    }
    if (f.charId === CHAR.BLADE && h.canAct(f)) {
      h.fireBladeWave(f, f.faceAngle);
    }
    if (f.charId === CHAR.WAR && h.canAct(f)) {
      // 火力压制形态：右键长按持续激光；常规形态：一次性毁灭激光炮
      // 左右键互斥：左键按住 / 持续激光中不响应右键起手
      if (f.warLaserHeld) return;
      if (f.warOverloadUnlocked && f.warSuppress) {
        if (f.warFireHeld || h.input.activePointer.leftButtonDown()) return;
        h.beginWarLaserHold(f);
      } else h.fireWarLaser(f);
    }
  }

  private onRightUp() {
    const h = this.host;
    const f = h.player;
    // 奥术轰击：松开右键停止引导
    if (f.charId === CHAR.ARCANE) this.host.stopArcaneBeam(f);
    // 火力压制：松开右键停止持续激光
    if (f.charId === CHAR.WAR) h.stopWarLaserHold(f);
  }

  /** 松开左键：利剑舞者结束蓄力并进入招架 */
  private onLeftUp() {
    const f = this.host.player;
    if (f.charId === CHAR.BLADE && f.parryCharging) {
      const gained = f.enterParry();
      this.host.fx.parryFx(f, gained);
    }
  }

  private onAttackDown() {
    const h = this.host;
    const f = h.player;
    const p = h.input.activePointer;
    // 混乱期间无法攻击
    if (f.confuseT > 0) return;
    // 午时已到蓄力期间无法使用其他攻击
    if (f.highNoonCharging) return;
    // 独裁选方针：左键点击卡片选择
    if (f.alive && f.emperorChoosing) {
      const ux = p.x / RENDER_SCALE;
      h.choosePolicy(h.policyIndexAt(ux), true);
      return;
    }
    if (f.charId === CHAR.EMPEROR) {
      if (!h.canAct(f) || f.silenced) return;
      const wp = h.cameras.main.getWorldPoint(p.x, p.y);
      h.castEmperorCharge(f, wp.x, wp.y);
      return;
    }
    if (f.silenced) return;
    if (f.charId === CHAR.BOMBER) {
      if (!h.canAct(f)) return;
      if (f.bombTargeting) {
        // UI 相机按 RENDER_SCALE 放大渲染，指针坐标需换算回逻辑坐标
        const ux = p.x / RENDER_SCALE;
        const uy = p.y / RENDER_SCALE;
        const wp = subMapWorldPoint(ux, uy, h.layout.bounds);
        // 冷却中不能选普通轰炸点，只能右键锁定最后狂欢
        if (wp && f.skillCd <= 0) {
          // 左键：改选普通轰炸点，并取消终极导弹锁定
          f.finalArmed = false;
          h.clearFinalTarget(f);
          f.bombTX = wp.x;
          f.bombTY = wp.y;
        }
        return;
      }
      const wp = h.cameras.main.getWorldPoint(p.x, p.y);
      const target = this.pickEnemy(wp.x, wp.y);
      if (target) {
        h.fireVolley(f, target);
      } else {
        h.fx.spark(wp.x, wp.y, 0xff9d4d, 3);
      }
      return;
    }
    // 弹幕风暴期间：左键突进
    if (f.charId === CHAR.GUNNER && f.skillActive && f.alive && h.started && !h.over) {
      h.dashGunner(f, f.faceAngle);
      return;
    }
    if (!h.canAct(f)) return;
    if (f.charId === CHAR.GUNNER) {
      // 锁定期间：左键消耗一层底气发射必暴狙击弹
      if (f.lockTarget) h.fireGunnerLockShot(f);
      else if (f.skillActive) h.dashGunner(f, f.faceAngle);
      else h.fireGunnerShot(f, f.faceAngle);
    } else if (f.charId === CHAR.ARCANE) {
      const wp = h.cameras.main.getWorldPoint(p.x, p.y);
      if (f.arcaneCharging) h.tryArcaneJump(f, wp.x, wp.y);
      else h.castArcaneReject(f, wp.x, wp.y);
    } else if (f.charId === CHAR.BLADE) {
      // 华尔兹期间左键 = 穿刺；否则按住左键开始招架蓄力
      if (f.waltzActive) h.bladeDash(f);
      else f.beginParryCharge();
    } else if (f.charId === CHAR.WAR) {
      h.fireWarShot(f, f.faceAngle);
    } else {
      h.fireInstantGust(f);
    }
  }

  private onSkill() {
    const h = this.host;
    const f = h.player;
    if (!f.alive || f.silenced || f.confuseT > 0) return;
    // 午时已到蓄力期间无法使用其他技能
    if (f.highNoonCharging) return;
    if (f.charId === CHAR.EMPEROR) {
      if (h.canAct(f) && !f.silenced && !f.emperorChoosing) h.castEmperorSkill(f);
      return;
    }
    if (f.charId === CHAR.BOMBER) {
      if (f.bombTargeting) {
        // 空格确认：锁定终极导弹则发射导弹，否则对左键选定的位置进行普通轰炸
        if (f.finalArmed && f.finalTarget) h.launchFinalStrike(f);
        else if (f.skillCd <= 0) h.launchStrike(f);
        else {
          // 冷却中且未锁定终极导弹：再次按空格关闭地图
          h.clearFinalTarget(f);
          f.bombTargeting = false;
        }
      } else {
        h.beginStrike(f, f.x, f.y);
      }
      return;
    }
    if (!h.canAct(f)) return;
    if (f.charId === CHAR.GUNNER) {
      h.activateGunnerSkill(f);
    } else if (f.charId === CHAR.ARCANE) {
      h.startArcaneAscend(f);
    } else if (f.charId === CHAR.BLADE) {
      h.startWaltz(f);
    } else if (f.charId === CHAR.WAR) {
      // 覆盖协议（超负荷芯片）：空格切换火力压制形态；否则维持原长按歼灭
      if (f.warOverloadUnlocked) h.toggleWarSuppress(f);
      else h.beginWarHold(f);
    } else {
      const p = h.input.activePointer;
      const wp = h.cameras.main.getWorldPoint(p.x, p.y);
      h.castStorm(f, wp.x, wp.y);
    }
  }

  /** 松开空格：仅取消尚未完成的长按蓄势（v0.19 取消点按后退） */
  private onSkillRelease() {
    const f = this.host.player;
    if (f.charId !== CHAR.WAR || !f.warHolding) return;
    f.warHolding = false;
    f.warHoldT = 0;
  }

  private onCancel() {
    const h = this.host;
    const f = h.player;
    if (!this.pause.paused && f.charId === CHAR.BOMBER && f.bombTargeting) {
      h.clearFinalTarget(f);
      f.bombTargeting = false;
      return;
    }
    if (h.over || !h.started) return;
    this.pause.toggle();
  }

  /** 小地图指针坐标 → 世界坐标（超出小地图范围返回 null） */
  private subMapWorld(p: Phaser.Input.Pointer): { x: number; y: number } | null {
    return subMapWorldPoint(p.x / RENDER_SCALE, p.y / RENDER_SCALE, this.host.layout.bounds);
  }

  private pickEnemy(wx: number, wy: number): Fighter | null {
    const h = this.host;
    let best: Fighter | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const f of h.fighters) {
      if (!f.alive || f === h.player) continue;
      if (h.mode !== MODE.BRAWL && f.team === h.player.team) continue; // 团队模式不锁定友军
      if (dist(f.x, f.y, h.player.x, h.player.y) > h.visionRadius) continue;
      const d = dist(f.x, f.y, wx, wy);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }
}
