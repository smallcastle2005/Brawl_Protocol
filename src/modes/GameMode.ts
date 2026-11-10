import type Phaser from 'phaser';
import type { CharId, ModeId } from '../config';
import type { MapLayout } from '../maps';
import type { Fighter } from '../entities/Fighter';
import type { Soldier } from '../entities/Soldier';
import type { AIController } from '../ai/AIController';
import type { HudRenderer } from '../render/HudRenderer';

/**
 * 玩法实现需要从 GameScene 读取 / 调用的最小接口。
 * GameScene 通过 `this as unknown as ModeHost` 传入，避免把大量 private 成员改成 public。
 */
export interface ModeHost extends Phaser.Scene {
  charId: CharId;
  mode: ModeId;
  /** PVE 关卡 id（冒险模式使用；其余模式为空） */
  levelId?: string;
  layout: MapLayout;
  player: Fighter;
  fighters: Fighter[];
  aiList: Fighter[];
  aiCtrls: Map<Fighter, AIController>;
  soldiers: Soldier[];
  started: boolean;
  over: boolean;
  wallRects: Phaser.Geom.Rectangle[];
  hud: HudRenderer;
  hpNames: Map<Fighter, Phaser.GameObjects.Text>;
  stats: { time: number; dealt: number; taken: number };
  /** 为新生成的敌人补上敌对描边（已存在的不会重复创建） */
  refreshOutlines(): void;
  /** 为后刷出的单位补上墙体碰撞 */
  addWallColliders(f: Fighter): void;
  spawnFighter(
    x: number, y: number, charId: CharId, isPlayer: boolean, name: string,
    opts?: {
      texKey?: string; monster?: boolean; maxHp?: number; speed?: number;
      displayW?: number; bodyR?: number; hitR?: number; def?: number; dirAnim?: boolean;
      clampRect?: { x: number; y: number; w: number; h: number };
    },
  ): Fighter;
  /** 冒险模式装备加成（level 省略时按该角色自身装备等级） */
  applyPveEquipment(f: Fighter, level?: number): void;
  /** 怪物子弹：直线飞行、撞墙消散 */
  fireMonsterBullet(owner: Fighter, x: number, y: number, angle: number, dmg: number, speed: number): void;
  /** 摧毁墙体（西部恶魔「下地狱」，可指定只摧毁部分） */
  destroyPveWalls(rects?: { x: number; y: number; width: number; height: number }[]): void;
  endGame(win: boolean, winner?: Fighter, reason?: string, winnerTeam?: number): void;
}

/**
 * 玩法模式统一接口：只负责「模式专属」的建立、更新、绘制与胜负判定。
 * 通用战斗（子弹 / 技能 / AI / HUD）仍由 GameScene 驱动。
 */
export interface GameMode {
  /** 地图与墙体就绪后，建立模式专属世界对象（铁轨 / 推车 / 重生室标注等） */
  buildWorld(): void;
  /** UI 相机分层前，建立模式专属屏幕 HUD */
  buildHud(): void;
  /** 创建本模式的阵容（玩家 / 队友 / 敌人 / 训练木偶） */
  spawnRoster(): void;
  /** 每帧模式逻辑（在通用战斗更新之后调用） */
  update(dt: number): void;
  /** 每帧世界层绘制（如推车推进圈） */
  drawWorld(): void;
  /** 每帧屏幕层绘制（如推车进度条） */
  drawHud(): void;
  /** 复活点；返回 null 表示沿用通用随机空地 */
  respawnPos(f: Fighter): { x: number; y: number } | null;
  /** 模式胜负判定（推车在 update 内自行结算） */
  checkWin(): void;
  /** 训练场：记录一次训练木偶受到的伤害 */
  recordDps(dmg: number): void;
}
