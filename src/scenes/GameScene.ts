import Phaser from 'phaser';
import {
  BALANCE, BASE_ZOOM, CHAR, CHAR_INFO, CharId, GAME_HEIGHT, GAME_WIDTH,
  KILLS_TO_WIN, MAP_SIZE, MODE, ModeId, PAYLOAD, WALL_T,
} from '../config';
import { MAPS, makePayloadMap, makePveMap, makeTraining, pickMap, MapLayout, TRAIN_WALL_T } from '../maps';
import {
  clamp, dist, circleRectCollision, rayWallDistance, sweepCircleMove, nearestFreePoint, pointInRects,
} from '../core/util';
import { applyRenderScale, CANVAS_H, CANVAS_W, RENDER_SCALE, setupHudCamera } from '../core/view';
import { createRng } from '../core/rng';
import type { Rng } from '../core/rng';
import { frameDelta } from '../core/fixedStep';
import { EQUIP_BY_CHAR, equipAttrsAt, getEquipBonus, PVE_CRIT } from '../pve/equipment';
import { createGameEventBus } from '../sim/events';
import type { GameEventBus } from '../sim/events';
import { InputHost, PlayerInput } from '../input/PlayerInput';
import { bindFxView } from '../view/fxView';
import {
  activateGunnerSkill as simActivateGunnerSkill,
  beginHighNoon as simBeginHighNoon,
  beginGunnerLock as simBeginGunnerLock,
  cancelGunnerLock as simCancelGunnerLock,
  dashGunner as simDashGunner,
  fireGunnerLockShot as simFireGunnerLockShot,
  fireGunnerShot as simFireGunnerShot,
  releaseHighNoon as simReleaseHighNoon,
  updateGunnerLock as simUpdateGunnerLock,
  updateGunnerSkill as simUpdateGunnerSkill,
  updateHighNoon as simUpdateHighNoon,
} from '../sim/systems/skills/gunner';
import type { GunnerContext } from '../sim/systems/skills/gunner';
import {
  beginGustCharge as simBeginGustCharge,
  castStorm as simCastStorm,
  fireInstantGust as simFireInstantGust,
  releaseGust as simReleaseGust,
  updateWindOrbs as simUpdateWindOrbs,
} from '../sim/systems/skills/wind';
import type { WindContext } from '../sim/systems/skills/wind';
import {
  bladeDash as simBladeDash,
  fireBladeWave as simFireBladeWave,
  startWaltz as simStartWaltz,
  updateBladeWaltz as simUpdateBladeWaltz,
} from '../sim/systems/skills/blade';
import type { BladeContext } from '../sim/systems/skills/blade';
import {
  beginWarHold as simBeginWarHold,
  beginWarLaserHold as simBeginWarLaserHold,
  fireWarLaser as simFireWarLaser,
  fireWarShot as simFireWarShot,
  startWarAnnihilate as simStartWarAnnihilate,
  stopWarLaserHold as simStopWarLaserHold,
  toggleWarSuppress as simToggleWarSuppress,
  updateWar as simUpdateWar,
  warBackdash as simWarBackdash,
} from '../sim/systems/skills/war';
import type { WarContext } from '../sim/systems/skills/war';
import {
  castArcaneReject as simCastArcaneReject,
  startArcaneAscend as simStartArcaneAscend,
  startArcaneBeam as simStartArcaneBeam,
  stopArcaneBeam as simStopArcaneBeam,
  tryArcaneJump as simTryArcaneJump,
  updateArcane as simUpdateArcane,
  updateArcaneBeam as simUpdateArcaneBeam,
  updateArcaneOrbs as simUpdateArcaneOrbs,
  updateRepulses as simUpdateRepulses,
} from '../sim/systems/skills/arcane';
import type { ArcaneContext, ArcaneOrb, RepulseZone } from '../sim/systems/skills/arcane';
import {
  applyFuse as simApplyFuse,
  beginStrike as simBeginStrike,
  clearFinalTarget as simClearFinalTarget,
  fireVolley as simFireVolley,
  launchFinalStrike as simLaunchFinalStrike,
  launchStrike as simLaunchStrike,
  lockFinalTarget as simLockFinalTarget,
  strikeExplode as simStrikeExplode,
  updateBurnZones as simUpdateBurnZones,
  updateFinalStrikes as simUpdateFinalStrikes,
  updateMiniBombs as simUpdateMiniBombs,
} from '../sim/systems/skills/bomber';
import type {
  BomberContext, BurnZone, FinalStrike, MiniBomb, MiniSpawn, PendingStrike,
} from '../sim/systems/skills/bomber';
import {
  applyPolicy as simApplyPolicy,
  castEmperorCharge as simCastEmperorCharge,
  castEmperorSkill as simCastEmperorSkill,
  castEmperorSwap as simCastEmperorSwap,
  choosePolicy as simChoosePolicy,
  clearSoldiers as simClearSoldiers,
  countSoldiers as simCountSoldiers,
  emperorChargeCdMax as simEmperorChargeCdMax,
  emperorMax as simEmperorMax,
  emperorSkillCdMax as simEmperorSkillCdMax,
  spawnSoldier as simSpawnSoldier,
  updateEmperor as simUpdateEmperor,
  updateSoldiers as simUpdateSoldiers,
  updateSwapAnims as simUpdateSwapAnims,
} from '../sim/systems/skills/emperor';
import type { EmperorContext, SwapAnim } from '../sim/systems/skills/emperor';
import { FONT_BODY, useCrispText } from '../core/text';
import { Fighter, BODY_R } from '../entities/Fighter';
import { Bullet } from '../entities/Bullet';
import { Gust } from '../entities/Gust';
import { Storm, StormReflectItem } from '../entities/Storm';
import { WindOrb } from '../entities/WindOrb';
import { Missile } from '../entities/Missile';
import { ArcaneWave } from '../entities/ArcaneWave';
import { Soldier } from '../entities/Soldier';
import { AIController, AIControls, AIEnv, BurnZoneRef } from '../ai/AIController';
import { playSfx } from '../audio/sfx';
import { CameraRig, scrollFactorX } from '../render/CameraRig';
import { FxRenderer } from '../render/FxRenderer';
import { HudHost, HudRenderer } from '../render/HudRenderer';
import { CHAR_COLOR } from '../render/charColor';
import { createMode } from '../modes/createMode';
import type { GameMode, ModeHost } from '../modes/GameMode';
import { PayloadMode } from '../modes/PayloadMode';
import { RespawnHost, RespawnSystem } from '../sim/systems/RespawnSystem';
import { CombatHost, CombatSystem } from '../sim/systems/CombatSystem';
import { getPveLevel } from '../pve/levels';
import { PauseHost, PauseOverlay } from '../render/PauseOverlay';

/* ================= 场景数据结构 ================= */

export class GameScene extends Phaser.Scene {
  private charId: CharId = CHAR.GUNNER;
  private mode: ModeId = MODE.BRAWL;
  /** 推车地图：不指定时每局在遗迹 / 珊瑚海之间随机 */
  private payloadMap?: 'ruins' | 'coral';
  /** v0.37：乱斗地图由模式页先行随机并在开战前告知，此处直接沿用 */
  private mapIndex?: number;
  /** 冒险模式关卡 id 与名称 */
  private levelId?: string;
  private levelName?: string;
  private fighters: Fighter[] = [];
  private player!: Fighter;
  private aiList: Fighter[] = [];
  private bullets: Bullet[] = [];
  private gusts: Gust[] = [];
  private missiles: Missile[] = [];
  private storms: Storm[] = [];
  /** v0.16：风暴领域的飞行风球（到达目标后才形成旋风） */
  private windOrbs: WindOrb[] = [];
  private waves: ArcaneWave[] = [];
  private burnZones: BurnZone[] = [];
  private pendingStrikes: PendingStrike[] = [];
  private miniSpawns: MiniSpawn[] = [];
  /** v0.13：每次触发引线爆破，后续轰炸技能的小轰炸次数 +1（整局生效，新对局随场景重建而重置） */
  private miniCountBonus = 0;
  private miniBombs: MiniBomb[] = [];
  /** 最后狂欢：待落地的终极导弹 */
  private finalStrikes: FinalStrike[] = [];
  private repulses: RepulseZone[] = [];
  /** 终极法典·奥术轰击：能量球与激光 */
  private arcaneOrbs: ArcaneOrb[] = [];
  /** 帝君雄兵（所有帝君共享一个列表，按 owner 区分） */
  private soldiers: Soldier[] = [];
  /** 帝君易位动画 */
  private swapAnims: SwapAnim[] = [];
  private wallRects: Phaser.Geom.Rectangle[] = [];
  /** 墙体显示对象（供 BOSS 技能「下地狱」摧毁墙体） */
  private wallVisuals: Phaser.GameObjects.GameObject[] = [];
  private wallZones: Phaser.GameObjects.Zone[] = [];
  /** 逐堵墙的显示对象与碰撞体，支持只摧毁指定墙体 */
  private wallGroups: {
    rect: Phaser.Geom.Rectangle;
    zone: Phaser.GameObjects.Zone;
    visuals: Phaser.GameObjects.GameObject[];
  }[] = [];

  /** 战斗逻辑事件总线：技能模块通过它通知表现层 */
  private gameEvents: GameEventBus = createGameEventBus();
  /** 随机数入口（默认沿用 Math.random，后续可切换为确定性种子） */
  private rng: Rng = createRng();
  /** 玩家输入（键鼠绑定 / 移动采样 / 技能入口） */
  private inputCtl!: PlayerInput;
  /** 复活系统（阵亡计时 + 复活点结算） */
  private respawns!: RespawnSystem;
  /** 暂停覆盖层 */
  private pause!: PauseOverlay;
  /** 事件订阅取消函数（场景重建时清理） */
  private unbindFx?: () => void;
  private started = false;
  private over = false;
  private layout!: MapLayout;
  private respawnTimers = new Map<Fighter, number>();

  private countdownT!: Phaser.GameObjects.Text;

  /** 局内 HUD 渲染（瞄准提示 / 小地图 / 血条 / 技能面板 / 计分 / 播报） */
  private hud!: HudRenderer;
  /** 和风守护风场可视层 */
  private windAuraG?: Phaser.GameObjects.Graphics;
  /** 奥术轰击能量球 / 激光可视层 */
  private arcaneOrbG!: Phaser.GameObjects.Graphics;
  /** 战争机器火力压制：持续激光可视层 */
  private warBeamG!: Phaser.GameObjects.Graphics;
  /** 相机编排（缩放 / UI 分层 / 震屏） */
  private cameraRig!: CameraRig;
  /** 纯表现层特效 */
  private fx!: FxRenderer;
  /** 当前模式的基础缩放：训练场按可视范围自适应，其余为 BASE_ZOOM × 渲染超采样倍率 */
  private baseZoom = BASE_ZOOM * RENDER_SCALE;
  /** 当前玩法模式的实现（乱斗 / 推车 / 训练场） */
  private modeImpl!: GameMode;
  /** 推车模式实现（供 HUD / AI 读取推车状态） */
  private payload?: PayloadMode;
  /** 屏幕 UI 专用相机：不受世界相机缩放影响，HUD 保持原尺寸 */
  private uiCam!: Phaser.Cameras.Scene2D.Camera;

  private shadows = new Map<Fighter, Phaser.GameObjects.Ellipse>();
  private hpG = new Map<Fighter, Phaser.GameObjects.Graphics>();
  private hpNames = new Map<Fighter, Phaser.GameObjects.Text>();
  private stars = new Map<Fighter, Phaser.GameObjects.Sprite>();

  private aiCtrls = new Map<Fighter, AIController>();
  /** 战斗系统（每帧战斗更新 / 伤害统计 / 击杀处理） */
  private combat!: CombatSystem;
  /** 战斗统计（结算页与训练场 DPS 读取） */
  private get stats() {
    return this.combat.stats;
  }
  /** 上一帧位置（用于高速位移的扫掠防穿墙） */
  private prevPos = new Map<Fighter, { x: number; y: number }>();
  /** 敌对单位描边轮廓（v0.19：贴合剪影的红色描边精灵，不再用方块） */
  private outlines = new Map<Fighter, Phaser.GameObjects.Sprite>();

  /* ---------- 推车状态转发（模式实现持有真实状态，HUD / AI 只读） ---------- */
  private get cartX(): number {
    return this.payload?.cartX ?? 0;
  }

  private get cartY(): number {
    return this.payload?.cartY ?? 0;
  }

  private get passedCheckpoint(): boolean {
    return this.payload?.passedCheckpoint ?? false;
  }

  private get pushAttackers(): number {
    return this.payload?.pushAttackers ?? 0;
  }

  private get pushDefenders(): number {
    return this.payload?.pushDefenders ?? 0;
  }

  constructor() {
    super('Game');
  }

  init(data: {
    charId?: CharId; mode?: ModeId; payloadMap?: 'ruins' | 'coral'; mapIndex?: number;
    levelId?: string; levelName?: string;
  }) {
    this.charId = data.charId ?? CHAR.GUNNER;
    this.mode = data.mode ?? MODE.BRAWL;
    this.payloadMap = data.payloadMap;
    this.mapIndex = data.mapIndex;
    this.levelId = data.levelId;
    this.levelName = data.levelName;
  }

  create() {
    useCrispText(this);
    applyRenderScale(this);
    this.cameraRig = new CameraRig(this);
    this.fx = new FxRenderer(this, this.cameraRig);
    this.windAuraG = this.add.graphics().setDepth(7);
    this.arcaneOrbG = this.add.graphics().setDepth(13).setBlendMode(Phaser.BlendModes.ADD);
    this.warBeamG = this.add.graphics().setDepth(18).setBlendMode(Phaser.BlendModes.ADD);
    this.started = false;
    this.over = false;
    this.physics.resume();
    this.bullets = [];
    this.gusts = [];
    this.missiles = [];
    this.storms = [];
    this.windOrbs = [];
    this.waves = [];
    this.burnZones = [];
    this.pendingStrikes = [];
    this.miniSpawns = [];
    this.miniBombs = [];
    this.finalStrikes = [];
    this.miniCountBonus = 0; // 每局重置：引线爆破带来的小轰炸加成（v0.15 修复未重置 bug）
    this.repulses = [];
    this.arcaneOrbs = [];
    this.fighters = [];
    this.aiList = [];
    this.aiCtrls.clear();
    this.respawnTimers.clear();
    // v0.31 修复：GameScene 实例在「再来一局」/返回菜单后会被复用，
    // 这些持久引用必须清空，否则数组会指向已被销毁的旧显示对象，
    // 下一局 update 时抛异常 → 黑屏/卡死（推车、乱斗复开时偶发）。
    this.soldiers = [];
    this.swapAnims = [];
    this.shadows.clear();
    this.hpG.clear();
    this.hpNames.clear();
    this.stars.clear();
    this.prevPos.clear();
    this.outlines.clear();
    // 旧 HUD 的 Text 随上一局关闭已被销毁；本局 create 期间（PVE 首波播报等）
    // 若继续引用旧实例会 setText 崩溃 → create 中断、整局黑屏
    this.hud = undefined as unknown as HudRenderer;

    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_SIZE, MAP_SIZE);
    cam.setBackgroundColor(
      this.mode === MODE.PAYLOAD ? '#061a2e' : this.mode === MODE.TRAIN ? '#141a24' : '#0d101c',
    );

    // ------ 地图：乱斗随机对称地图 / 推车 遗迹或珊瑚海 / 训练场封闭演武场 / 冒险关卡 ------
    const trainMode = this.mode === MODE.TRAIN;
    const payloadMode = this.mode === MODE.PAYLOAD;
    const pveMode = this.mode === MODE.PVE;
    const pveLevel = pveMode ? getPveLevel(this.levelId) : undefined;
    if (pveLevel) this.levelName = pveLevel.name;
    this.layout = trainMode ? makeTraining()
      : payloadMode ? makePayloadMap(this.payloadMap)
        : pveLevel ? makePveMap(pveLevel.id)
          : pickMap(this.mapIndex);
    // 记录本局实际使用的地图，结算页重开 / 返回选人时沿用同一张图
    if (payloadMode) {
      this.payloadMap = this.layout.theme === 'coral' ? 'coral' : 'ruins';
    } else if (!trainMode && !pveMode && this.mapIndex === undefined) {
      this.mapIndex = MAPS.findIndex((m) => m.name === this.layout.name);
    }
    const theme = this.layout.theme;
    const floorTex = theme === 'ruins' ? 'tex-floor-ruins'
      : theme === 'coral' ? 'tex-floor-coral'
        : theme === 'wasteland' ? 'tex-floor-sand' : 'tex-floor';
    this.add.tileSprite(
      MAP_SIZE / 2, MAP_SIZE / 2, MAP_SIZE, MAP_SIZE, floorTex,
    ).setDepth(0);
    this.wallRects = [];
    this.wallZones = [];
    this.wallVisuals = [];
    this.wallGroups = [];
    if (trainMode && this.layout.bounds) {
      // 训练场：相机只展示演武场这一小块区域，并按可视范围自适应缩放
      const b = this.layout.bounds;
      cam.setBounds(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
      this.baseZoom = Math.min(CANVAS_W / b.w, CANVAS_H / b.h);
    } else if (this.layout.bounds && this.layout.bounds.w < MAP_SIZE) {
      // 缩小后的关卡（PVE 梦魇镇）：相机只展示活动区域，外墙由关卡布局自带
      const b = this.layout.bounds;
      cam.setBounds(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
      this.baseZoom = BASE_ZOOM * RENDER_SCALE;
    } else {
      cam.setBounds(0, 0, MAP_SIZE, MAP_SIZE);
      this.baseZoom = BASE_ZOOM * RENDER_SCALE;
      this.addWall(MAP_SIZE / 2, WALL_T / 2, MAP_SIZE, WALL_T);
      this.addWall(MAP_SIZE / 2, MAP_SIZE - WALL_T / 2, MAP_SIZE, WALL_T);
      this.addWall(WALL_T / 2, MAP_SIZE / 2, WALL_T, MAP_SIZE);
      this.addWall(MAP_SIZE - WALL_T / 2, MAP_SIZE / 2, WALL_T, MAP_SIZE);
    }
    for (const o of this.layout.obstacles) this.addWall(o.x, o.y, o.w, o.h);

    // ------ 模式专属世界（铁轨 / 航道与推车 / 重生室标注） ------
    this.combat = new CombatSystem(this as unknown as CombatHost);
    this.modeImpl = createMode(this as unknown as ModeHost);
    this.payload = this.modeImpl instanceof PayloadMode ? this.modeImpl : undefined;
    this.modeImpl.buildWorld();

    // ------ 角色阵容（按模式创建） ------
    this.modeImpl.spawnRoster();
    for (const z of this.wallZones) {
      for (const f of this.fighters) this.physics.add.collider(f.sprite, z);
    }
    this.refreshOutlines();
    cam.startFollow(this.player.sprite, false, 0.14, 0.14);
    // v0.42：冒险模式全局视野减少 30%
    this.cameraRig.resetZoom(this.baseZoom / (this.mode === MODE.PVE ? 0.7 : 1));

    // 出生环
    for (const f of this.fighters) {
      this.fx.spawnRing(f.x, f.y, this.teamColor(f));
    }

    const mapTag = this.add.text(GAME_WIDTH / 2, payloadMode || pveMode ? 116 : 30,
      trainMode ? `训练场 · ${this.layout.name}` : payloadMode
        ? `模式：团队推车 · ${this.layout.name}`
        : pveMode ? `冒险关卡 · ${this.levelName ?? this.layout.name}`
          : `随机地图：${this.layout.name}`, {
        fontFamily: FONT_BODY, fontSize: '14px', color: '#f2c94c',
      }).setDepth(1700).setScrollFactor(0).setOrigin(0.5).setStroke('#10131f', 5);
    this.time.delayedCall(2600, () => {
      this.tweens.add({ targets: mapTag, alpha: 0, duration: 500, onComplete: () => mapTag.destroy() });
    });

    // ------ 战场特效层 + 局内 HUD（瞄准/燃烧/预警/小地图/血条/面板/方针/计分/方向提示） ------
    this.hud = new HudRenderer(this as unknown as HudHost);

    // ------ 固定 UI 文案 ------
    this.add.text(GAME_WIDTH - 198, 10,
      this.mode === MODE.PAYLOAD ? '小地图·队友常显'
        : this.mode === MODE.TRAIN ? '小地图·训练场' : '小地图·仅显示视野内敌人', {
      fontFamily: FONT_BODY, fontSize: '11px', color: '#aebbd8',
    }).setDepth(1601).setScrollFactor(0).setOrigin(0, 0.5).setStroke('#0b0d15', 3);

    // 底部中心四段式 HUD：血量/护盾 · 普攻冷却 · 技能冷却 · 特定资源
    const hudSegX = [305, 415, 525, 635];
    const hudLabels = ['血量/护盾', '普攻', '技能', '资源'];
    for (let i = 0; i < 4; i++) {
      this.add.text(hudSegX[i], 549, hudLabels[i], {
        fontFamily: FONT_BODY, fontSize: '9px', color: '#8fa3c8',
      }).setDepth(1601).setScrollFactor(0).setOrigin(0.5, 0.5);
    }
    // 模式专属 HUD（训练场 DPS / 推车倒计时与进度条）
    this.modeImpl.buildHud();
    this.add.text(12, GAME_HEIGHT - 12,
      'WASD 移动 · 鼠标瞄准 · ESC 暂停', {
        fontFamily: FONT_BODY, fontSize: '11px', color: '#96a6cc',
      }).setDepth(1601).setScrollFactor(0).setOrigin(0, 0.5).setStroke('#0b0d15', 3);

    this.countdownT = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, '', {
      fontFamily: FONT_BODY, fontSize: '72px', fontStyle: 'bold', color: '#f2c94c',
    }).setDepth(1700).setScrollFactor(0).setOrigin(0.5).setStroke('#10131f', 10);

    // 暂停菜单
    this.pause = new PauseOverlay(this as unknown as PauseHost);
    this.pause.build();

    // ------ 相机分层：世界相机可缩放，UI 相机按超采样倍率铺满画布 ------
    const uiObjects = this.children.list.filter((o) => scrollFactorX(o) === 0);
    cam.ignore(uiObjects);
    this.uiCam = this.cameras.add(0, 0, CANVAS_W, CANVAS_H);
    setupHudCamera(this.uiCam);
    this.cameraRig.syncUiCamera(this.uiCam);

    // ------ 输入 ------
    // 阶段一：逻辑与表现解耦的基础设施（每局重建，避免复用场景时订阅叠加）
    this.rng = createRng();
    this.respawns = new RespawnSystem(this as unknown as RespawnHost);
    this.inputCtl = new PlayerInput(this as unknown as InputHost, this.pause);
    this.bindViewEvents();
    this.inputCtl.bind();

    // 帝君：对局开始直接召唤 2 名雄兵（护盾同步由 updateEmperor 维护）
    for (const f of this.fighters) {
      if (f.charId === CHAR.EMPEROR && !f.isDummy) {
        for (let i = 0; i < BALANCE.emperor.soldierStartCount; i++) this.spawnSoldier(f);
      }
    }

    // ------ 开场倒计时 ------
    const goText = trainMode ? '训练开始！'
      : this.mode === MODE.PAYLOAD ? '推车开始！'
        : pveMode ? '冒险开始！' : '七人乱斗！';
    const seq: [number, string][] = [
      [700, '3'], [1400, '2'], [2100, '1'], [2800, goText],
    ];
    for (const [delay, text] of seq) {
      this.time.delayedCall(delay, () => {
        if (!this.over) {
          this.countdownT.setText(text);
          if (text === goText) {
            playSfx('go');
            this.tweens.add({ targets: this.countdownT, alpha: 0, duration: 500, delay: 300 });
          } else {
            playSfx('countdown', 0.9);
          }
        }
      });
    }
    this.time.delayedCall(3200, () => {
      this.started = true;
      this.countdownT.setText('');
    });

    // 淡入放在 create 末尾：若上方初始化中途抛异常，画面不会被永久锁在全黑
    cam.fadeIn(200);
  }

  /* ================= 地图 ================= */

  /** 西部恶魔「下地狱」：摧毁墙体（不传参时摧毁全部，传参时只摧毁指定墙体） */
  destroyPveWalls(rects?: { x: number; y: number; width: number; height: number }[]) {
    const wanted = rects && rects.length > 0
      ? new Set(rects.map((r) => `${r.x},${r.y},${r.width},${r.height}`))
      : null;
    const removed = new Set<Phaser.GameObjects.GameObject>();
    for (let i = this.wallGroups.length - 1; i >= 0; i--) {
      const grp = this.wallGroups[i];
      const key = `${grp.rect.x},${grp.rect.y},${grp.rect.width},${grp.rect.height}`;
      if (wanted && !wanted.has(key)) continue;
      const body = grp.zone.body as Phaser.Physics.Arcade.StaticBody | null;
      if (body) body.enable = false;
      grp.zone.setActive(false);
      removed.add(grp.zone);
      grp.zone.destroy();
      for (const v of grp.visuals) {
        removed.add(v);
        v.destroy();
      }
      const ri = this.wallRects.indexOf(grp.rect);
      if (ri >= 0) this.wallRects.splice(ri, 1);
      this.wallGroups.splice(i, 1);
    }
    if (removed.size > 0) {
      this.wallZones = this.wallZones.filter((z) => !removed.has(z));
      this.wallVisuals = this.wallVisuals.filter((v) => !removed.has(v));
    }
  }

  private addWall(x: number, y: number, w: number, h: number) {
    const theme = this.layout?.theme;
    const ruins = theme === 'ruins';
    const coral = theme === 'coral';
    const sand = theme === 'wasteland';
    const wallTex = coral ? 'tex-wall-coral'
      : ruins ? 'tex-wall-ruins'
        : sand ? 'tex-wall-sand' : 'tex-wall';
    const visuals: Phaser.GameObjects.GameObject[] = [];
    const add = <T extends Phaser.GameObjects.GameObject>(obj: T): T => {
      visuals.push(obj);
      this.wallVisuals.push(obj);
      return obj;
    };
    add(this.add.rectangle(x + 4, y + 5, w, h, 0x080b14, 0.35).setDepth(3));
    add(this.add.tileSprite(x, y, w, h, wallTex).setDepth(4));
    // 西部荒原：木屋屋顶压条 + 底部阴影，让墙体一眼看出是破败建筑
    if (sand) {
      add(this.add.rectangle(x, y - h / 2 + 7, w, 14, 0x3a2517, 0.95).setDepth(5));
      add(this.add.rectangle(x, y - h / 2 + 13, w, 3, 0x8a6136, 0.9).setDepth(5));
      add(this.add.rectangle(x, y + h / 2 - 4, w, 8, 0x2a1a10, 0.75).setDepth(5));
    }
    add(this.add.rectangle(x, y, w + 8, h + 8)
      .setStrokeStyle(4, coral ? 0x4a1730 : ruins ? 0x0d0a08 : sand ? 0x2a180c : 0x0a1020, 0.95)
      .setDepth(5));
    add(this.add.rectangle(x, y, w, h)
      .setStrokeStyle(3, coral ? 0xffc4dc : ruins ? 0xc9a06a : sand ? 0xa9814f : 0xcfe3ff, 1)
      .setDepth(6));
    const zone = this.add.zone(x, y, w, h);
    this.physics.add.existing(zone, true);
    (zone.body as Phaser.Physics.Arcade.StaticBody).setSize(w, h);
    this.wallZones.push(zone);
    const rect = new Phaser.Geom.Rectangle(x - w / 2, y - h / 2, w, h);
    this.wallRects.push(rect);
    this.wallGroups.push({ rect, zone, visuals });
  }

  /** 队伍配色：己方青绿，敌对红色（v0.27 玩家可能被分到守方，按玩家队伍相对判定）；乱斗模式回落到角色色 */
  private teamColor(f: Fighter): number {
    if (this.mode === MODE.BRAWL) {
      return f === this.player ? 0x57e08b : CHAR_COLOR[f.charId];
    }
    return f.team === this.player.team ? 0x57e08b : 0xff5f6d;
  }

  /** 命中目标列表：团队模式排除同队（避免友军挡子弹）；训练场木偶可被玩家命中 */
  private targetsFor(owner: Fighter): Fighter[] {
    if (this.mode === MODE.BRAWL || this.mode === MODE.TRAIN) return this.fighters;
    return this.fighters.filter((f) => f !== owner && f.team !== owner.team);
  }

  /** 敌对单位轮廓描红：用贴合人物剪影的红色轮廓，乱斗除玩家外全部标红、团队模式标红对方阵营 */
  refreshOutlines() {
    for (const f of this.fighters) {
      if (f.isDummy) continue; // 训练木偶不算敌人，不描红
      if (f.isMonster) continue; // 怪物使用自带贴图，不叠加轮廓
      if (this.outlines.has(f)) continue; // 已创建过的单位不重复描红
      const hostile = this.mode === MODE.BRAWL ? f !== this.player : f.team !== this.player.team;
      if (!hostile) continue;
      const o = this.add.sprite(f.x, f.y, f.charId + '-down-idle-o')
        .setScale(f.sprite.scaleX, f.sprite.scaleY)
        .setDepth(9);
      this.outlines.set(f, o);
    }
  }

  /** 为后刷出的单位补上墙体碰撞（PVE 逐波刷怪使用） */
  addWallColliders(f: Fighter) {
    for (const z of this.wallZones) this.physics.add.collider(f.sprite, z);
  }

  /** 每帧同步轮廓的位置、朝向、动作帧与存活状态 */
  private syncOutlines() {
    for (const [f, o] of this.outlines) {
      o.setVisible(f.alive);
      o.setPosition(f.x, f.y);
      o.setFlipX(f.sprite.flipX);
      if (f.sprite.anims.isPlaying) {
        const walkKey = 'walk-o-' + f.charId + '-' + f.dirKey;
        if (o.anims.currentAnim?.key !== walkKey || !o.anims.isPlaying) o.play(walkKey);
      } else {
        if (o.anims.isPlaying) o.anims.stop();
        const idleKey = f.sprite.texture.key + '-o';
        if (o.texture.key !== idleKey) o.setTexture(idleKey);
      }
    }
  }

  /* ================= 角色 ================= */

  private spawnFighter(
    x: number, y: number, charId: CharId, isPlayer: boolean, name: string,
    opts?: {
      texKey?: string; monster?: boolean; maxHp?: number; speed?: number;
      displayW?: number; bodyR?: number; hitR?: number; def?: number; dirAnim?: boolean;
      clampRect?: { x: number; y: number; w: number; h: number };
    },
  ): Fighter {
    // 缩小后的 PVE 关卡：限制所有单位活动范围（同时给相机一个合理的内边界）
    const b = this.layout.bounds;
    const wt = this.layout.wallT ?? TRAIN_WALL_T;
    const clampRect = b && b.w < MAP_SIZE
      ? { x: b.x - b.w / 2 + wt, y: b.y - b.h / 2 + wt, w: b.w - wt * 2, h: b.h - wt * 2 }
      : undefined;
    const f = new Fighter(this, x, y, charId, isPlayer, name, {
      onDamaged: (victim, dmg, died, o) => this.combat.onDamaged(victim, dmg, died, o),
      onDeath: (victim) => this.combat.onDeath(victim),
      clampRect,
      ...opts,
    });

    // 帝君：每局从 5 条方针中随机抽取 3 条（互不相同），供独裁三选一
    if (charId === CHAR.EMPEROR) {
      const pool = [1, 2, 3, 4, 5];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      f.emperorPolicyOptions = pool.slice(0, 3);
    }

    // 冒险模式：全员基础暴击 20% / 150%；玩家额外套用专属装备
    if (this.mode === MODE.PVE) {
      f.critChance = PVE_CRIT.chance;
      f.critDmgMul = PVE_CRIT.dmgMul;
      if (isPlayer) this.applyPveEquipment(f);
    }

    const shadow = this.add.ellipse(x, y + 18, 34, 14, 0x0b0f1c, 0.35).setDepth(6);
    this.shadows.set(f, shadow);

    const g = this.add.graphics().setDepth(800);
    this.hpG.set(f, g);
    // v0.27：团队模式按「玩家所在队伍」相对判定，玩家被分到守方时队友不再显示为红色
    // 注意：玩家自身在 spawnFighter 内创建时 this.player 尚未赋值，需额外放行
    const ally = isPlayer || !this.player || f.team === this.player.team;
    const nameColor = this.mode === MODE.BRAWL
      ? (isPlayer ? '#8ff0b0' : '#ff3b3b')
      : (ally ? (isPlayer ? '#8ff0b0' : '#8fd6ff') : '#ff3b3b');
    const t = this.add.text(x, y - 72, name, {
      fontFamily: FONT_BODY, fontSize: '12px', fontStyle: 'bold',
      color: nameColor,
    }).setDepth(800).setOrigin(0.5, 1).setStroke('#0b0d15', 3);
    this.hpNames.set(f, t);

    const star = this.add.sprite(x, y - 46, 'tex-star').setDepth(30).setScale(1.5).setVisible(false);
    this.stars.set(f, star);

    return f;
  }

  /** PVE 怪物子弹：直线飞行、撞墙消散（可被墙体隔断） */
  fireMonsterBullet(owner: Fighter, x: number, y: number, angle: number, dmg: number, speed: number) {
    const b = new Bullet(this, x, y, angle, owner,
      (px, py) => this.fx.spark(px, py, 0xff9d4d, 3),
      (px, py) => this.fx.boom(px, py),
      {
        dmg, speed, vanishOnWall: true, life: 4, glowTint: 0xff7a3c,
        countsCharge: false, travelMax: 2600,
      });
    this.bullets.push(b);
  }

  /* ================= 击杀 / 复活 ================= */

  /**
   * 冒险模式：把角色的专属装备加成套用到单位身上（无专属装备时保持原样）。
   * level 用于 AI 队友：按玩家的装备等级套用队友自己角色的装备。
   */
  applyPveEquipment(f: Fighter, level?: number) {
    const def = EQUIP_BY_CHAR[f.charId];
    if (!def) return;
    const bonus = getEquipBonus(f.charId);
    if (level === undefined && !bonus) return;
    const a = level === undefined && bonus ? bonus.attrs : equipAttrsAt(def, level ?? 1);
    f.maxHp = Math.round(f.maxHp * (1 + a.hpPct));
    f.hp = f.maxHp;
    f.dmgMul = 1 + a.dmgPct;
    f.critChance = PVE_CRIT.chance + a.critPct;
    f.critDmgMul = PVE_CRIT.dmgMul + a.critDmgPct;
    // 减伤 / 左键冷却缩短
    f.drPct = a.drPct;
    f.atkCdMul = Math.max(0.4, 1 - a.cdPct);
    // 各装备的专属效果解锁
    if (def.id === 'western-memory') {
      // 效果一「快速拔枪」：左键子弹弹道速度 +100%
      f.bulletSpeedMul = 2;
      // 效果二「午时已到」：解锁 PVE 专属技能
      f.highNoonUnlocked = true;
    } else if (def.id === 'wind-regret') {
      f.windEquipUnlocked = true;
    } else if (def.id === 'bomber-finale') {
      f.bomberEquipUnlocked = true;
    } else if (def.id === 'ultimate-codex') {
      f.arcaneEquipUnlocked = true;
      f.arcaneEnergy = 0;
      f.arcaneBuffT = 0;
    } else if (def.id === 'overload-chip') {
      // 核心超载 / 覆盖协议
      f.warOverloadUnlocked = true;
      f.warSuppress = false;
      f.warSwitchT = 0;
      f.warOverloadAcc = 0;
    }
  }

  /** 击杀结算在 CombatSystem.onDeath，本类只负责复活点与复活流程 */

  /** 复活点：交由模式决定，模式返回 null 时使用乱斗的随机空地 */
  private respawnPosFor(f: Fighter): { x: number; y: number } {
    return this.modeImpl.respawnPos(f) ?? this.findRespawnPos();
  }

  /**
   * v0.22：墙体兜底——若角色当前与墙体相交，移动到距其最近的非墙体位置。
   * 用于穿墙技能（利刃华尔兹）或传送/瞬移结束后，保证角色不会停留在墙内。
   */
  private resolveOutOfWalls(f: Fighter) {
    const p = nearestFreePoint(f.x, f.y, BODY_R, this.wallRects);
    if (dist(p.x, p.y, f.x, f.y) < 0.01) return;
    f.sprite.setPosition(p.x, p.y);
    const body = f.sprite.body as Phaser.Physics.Arcade.Body | null;
    body?.reset(p.x, p.y);
    this.prevPos.set(f, { x: p.x, y: p.y });
  }

  /**
   * v0.28：把角色圆心钳回可活动区域。
   * 外围墙体是实心的，但极端击退 / 冲刺把圆心挤进外墙后，「最短推出方向」可能指向墙外，
   * 角色会被推出地图并从此不再与任何墙体相交；这里的硬边界是最后一道保险。
   */
  private clampInsideArena(f: Fighter) {
    // 训练场以 layout.bounds 为演武场外沿（墙厚 60）；其余地图外沿即 2400 世界边界（墙厚 WALL_T）
    const b = this.layout.bounds;
    const inset = b ? (this.layout.wallT ?? TRAIN_WALL_T) : WALL_T;
    const left = (b ? b.x - b.w / 2 : 0) + inset + BODY_R;
    const right = (b ? b.x + b.w / 2 : MAP_SIZE) - inset - BODY_R;
    const top = (b ? b.y - b.h / 2 : 0) + inset + BODY_R;
    const bottom = (b ? b.y + b.h / 2 : MAP_SIZE) - inset - BODY_R;
    const x = clamp(f.x, left, right);
    const y = clamp(f.y, top, bottom);
    if (x === f.x && y === f.y) return;
    f.sprite.setPosition(x, y);
    (f.sprite.body as Phaser.Physics.Arcade.Body | null)?.reset(x, y);
    this.prevPos.set(f, { x, y });
  }

  /** 复活点：随机空地，且尽量远离当前存活角色 */
  private findRespawnPos(): { x: number; y: number } {
    const margin = WALL_T + 70;
    for (let i = 0; i < 60; i++) {
      const x = Phaser.Math.Between(margin, MAP_SIZE - margin);
      const y = Phaser.Math.Between(margin, MAP_SIZE - margin);
      let blocked = false;
      for (const r of this.wallRects) {
        if (x > r.x - 46 && x < r.right + 46 && y > r.y - 46 && y < r.bottom + 46) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      let near = false;
      for (const f of this.fighters) {
        if (!f.alive || f === this.player) continue;
        if (dist(x, y, f.x, f.y) < 280) {
          near = true;
          break;
        }
      }
      if (near) continue;
      return { x, y };
    }
    const sp = this.layout.spawns[Phaser.Math.Between(0, this.layout.spawns.length - 1)];
    return { x: sp.x, y: sp.y };
  }

  /* ================= 输入 ================= */

  private canAct(f: Fighter): boolean {
    return this.started && !this.over && f.alive && f.stunTimer <= 0;
  }

  /* ================= 攻击与技能 ================= */

  fireGunnerShot(self: Fighter, angle: number) {
    simFireGunnerShot(this.gunnerCtx(), self, angle);
  }

  beginGustCharge(self: Fighter) {
    simBeginGustCharge(this.windCtx(), self);
  }

  /** 左键瞬发狂风：从自身释放；旋风存在期间冷却减半 */
  fireInstantGust(self: Fighter) {
    simFireInstantGust(this.windCtx(), self);
  }

  /** 右键：把积攒在当前位置的狂风朝鼠标发射（宽度 ×2，满蓄命中旋风可引爆） */
  releaseGust(self: Fighter, powerOverride?: number) {
    simReleaseGust(this.windCtx(), self, powerOverride);
  }

  castStorm(self: Fighter, x: number, y: number) {
    simCastStorm(this.windCtx(), self, x, y);
  }

  /** 风球每帧推进：被敌方旋风吸入则消散并奖励持续时间；抵达目标后形成旋风 */
  private updateWindOrbs(dt: number) {
    simUpdateWindOrbs(this.windCtx(), dt);
  }

  activateGunnerSkill(self: Fighter) {
    simActivateGunnerSkill(this.gunnerCtx(), self);
  }

  dashGunner(self: Fighter, angle: number) {
    let pointerWorld: { x: number; y: number } | undefined;
    if (self.isPlayer) {
      const p = this.input.activePointer;
      pointerWorld = this.cameras.main.getWorldPoint(p.x, p.y);
    }
    simDashGunner(this.gunnerCtx(), self, angle, pointerWorld);
  }

  /** 逻辑事件 → 现有表现函数（阶段一试点：神枪手技能已通过事件发特效） */
  private bindViewEvents() {
    this.unbindFx?.();
    this.gameEvents.clear();
    this.unbindFx = bindFxView(this.gameEvents, {
      spark: (x, y, color, count) => this.fx.spark(x, y, color, count),
      boom: (x, y) => this.fx.boom(x, y),
      muzzle: (f, a) => this.fx.muzzleFx(f, a),
      burst: (x, y) => this.fx.burstFx(x, y),
      dash: (f, a) => this.fx.dashFx(f, a),
      barrage: (x, y) => this.fx.barrageFx(x, y),
      shake: (i, d) => this.cameraRig.shake(i, d),
      sfx: (name, volume) => playSfx(name, volume),
    });
  }

  /** 神枪手技能模块的场景访问面 */
  private gunnerCtx(): GunnerContext {
    return {
      scene: this,
      fighters: this.fighters,
      bullets: this.bullets,
      wallRects: this.wallRects,
      events: this.gameEvents,
      rng: this.rng,
      over: this.over,
    };
  }

  /** 风之女皇技能模块的场景访问面 */
  private windCtx(): WindContext {
    return {
      scene: this,
      gusts: this.gusts,
      storms: this.storms,
      windOrbs: this.windOrbs,
      bullets: this.bullets,
      missiles: this.missiles,
      fighters: this.fighters,
      events: this.gameEvents,
      over: this.over,
      targetsFor: (owner) => this.targetsFor(owner),
      puff: (x, y) => this.fx.puff(x, y),
      orbMarkFx: (x, y) => this.fx.orbMarkFx(x, y),
      orbAbsorbFx: (x, y) => this.fx.orbAbsorbFx(x, y),
      castRingFx: (x, y) => this.fx.castRingFx(x, y),
      pix: (x, y, color, scale, life) => this.fx.pix(x, y, color, scale, life),
      reflectMissileBoom: (x, y, dmg, owner) => this.combat.reflectMissileBoom(x, y, dmg, owner),
      missileTrail: (x, y) => this.fx.missileTrail(x, y),
    };
  }

  /** 利剑舞者技能模块的场景访问面 */
  private bladeCtx(): BladeContext {
    return {
      scene: this,
      fighters: this.fighters,
      bullets: this.bullets,
      wallRects: this.wallRects,
      events: this.gameEvents,
      over: this.over,
      resolveOutOfWalls: (f) => this.resolveOutOfWalls(f),
      healFx: (f, amount) => this.fx.healFx(f, amount),
      swordWaveFx: (f, angle) => this.fx.swordWaveFx(f, angle),
      waltzEnterFx: (f) => this.fx.waltzEnterFx(f),
      waltzEndFx: (f) => this.fx.waltzEndFx(f),
      waltzTrailFx: (f, angle) => this.fx.waltzTrailFx(f, angle),
      waltzStepFx: (x, y, dx, dy) => this.fx.waltzStepFx(x, y, dx, dy),
      waltzHitFx: (x, y, dx, dy) => this.fx.waltzHitFx(x, y, dx, dy),
      waltzRelocateFx: (x0, y0, x1, y1) => this.fx.waltzRelocateFx(x0, y0, x1, y1),
    };
  }

  /** 战争机器技能模块的场景访问面 */
  private warCtx(): WarContext {
    return {
      scene: this,
      fighters: this.fighters,
      bullets: this.bullets,
      wallRects: this.wallRects,
      events: this.gameEvents,
      over: this.over,
      pix: (x, y, color, scale, life) => this.fx.pix(x, y, color, scale, life),
      muzzleFx: (f, angle, recoil) => this.fx.muzzleFx(f, angle, recoil),
      dashFx: (f, angle) => this.fx.dashFx(f, angle),
      suppressLaserText: (target, dmg) =>
        this.fx.dmgText(target.x, target.y - 40, Math.round(dmg), 0xffe27a, false),
      warLaserFx: (self, ex, ey, width, len, nx, ny) =>
        this.warLaserFx(self, ex, ey, width, len, nx, ny),
      warAnnihilateFx: (self) => this.warAnnihilateFx(self),
    };
  }

  /** 奥术天选者技能模块的场景访问面 */
  private arcaneCtx(): ArcaneContext {
    return {
      scene: this,
      fighters: this.fighters,
      repulses: this.repulses,
      waves: this.waves,
      orbs: this.arcaneOrbs,
      pve: this.mode === MODE.PVE,
      wallRects: this.wallRects,
      prevPos: this.prevPos,
      events: this.gameEvents,
      pix: (x, y, color, scale, life) => this.fx.pix(x, y, color, scale, life),
      arcaneJumpMarkerFx: (x, y, dur) => this.fx.arcaneJumpMarkerFx(x, y, dur),
      arcaneJumpTeleportFx: (fromX, fromY, toX, toY) =>
        this.fx.arcaneJumpTeleportFx(fromX, fromY, toX, toY),
      ascendStartFx: (f) => this.fx.ascendStartFx(f),
      descendFx: (f) => this.fx.descendFx(f),
      rejectFx: (x, y, pull, radius) => this.fx.rejectFx(x, y, pull, radius),
    };
  }

  /** 轰炸专家技能模块的场景访问面 */
  private bomberCtx(): BomberContext {
    return {
      scene: this,
      fighters: this.fighters,
      missiles: this.missiles,
      burnZones: this.burnZones,
      pendingStrikes: this.pendingStrikes,
      miniSpawns: this.miniSpawns,
      miniBombs: this.miniBombs,
      finalStrikes: this.finalStrikes,
      events: this.gameEvents,
      over: this.over,
      started: this.started,
      getMiniCountBonus: () => this.miniCountBonus,
      bumpMiniCountBonus: () => { this.miniCountBonus++; },
      pix: (x, y, color, scale, life, alpha) => this.fx.pix(x, y, color, scale, life, alpha),
      puff: (x, y) => this.fx.puff(x, y),
      missileBoom: (x, y, dmg, owner) => this.combat.missileBoom(x, y, dmg, owner),
      missileTrail: (x, y) => this.fx.missileTrail(x, y),
      strikeMissileFx: (x, y, delay) => this.fx.strikeMissileFx(x, y, delay),
      finalWarnFx: (target, delay) => this.fx.finalWarnFx(target, delay),
      finalMissileFx: (x, y) => this.fx.finalMissileFx(x, y),
      mushroomBoomFx: (x, y) => this.fx.mushroomBoomFx(x, y),
      bigBoomFx: (x, y) => this.fx.bigBoomFx(x, y),
      miniBoomFx: (x, y) => this.fx.miniBoomFx(x, y),
      fuseBoomFx: (x, y) => this.fx.fuseBoomFx(x, y),
    };
  }

  /** 帝君技能模块的场景访问面 */
  private emperorCtx(): EmperorContext {
    return {
      scene: this,
      fighters: this.fighters,
      soldiers: this.soldiers,
      swapAnims: this.swapAnims,
      bullets: this.bullets,
      wallRects: this.wallRects,
      prevPos: this.prevPos,
      events: this.gameEvents,
      over: this.over,
      mode: this.mode,
      player: this.player,
      targetsFor: (owner) => this.targetsFor(owner),
      resolveOutOfWalls: (f) => this.resolveOutOfWalls(f),
      aimWorld: () => {
        const p = this.input.activePointer;
        return this.cameras.main.getWorldPoint(p.x, p.y);
      },
      pix: (x, y, color, scale, life) => this.fx.pix(x, y, color, scale, life),
      spawnRingFx: (x, y) => this.fx.spawnRingFx(x, y),
      soldierPuffFx: (x, y) => this.fx.soldierPuffFx(x, y),
      chargeMarkFx: (x, y) => this.fx.chargeMarkFx(x, y),
      chargeBadFx: (x, y) => this.fx.chargeBadFx(x, y),
      dominateRingFx: (f) => this.fx.dominateRingFx(f),
      soldierRingFx: (s) => this.fx.soldierRingFx(s),
      punishFx: (t, delay) => this.fx.punishFx(t, delay),
      arrowRainFx: (x, y) => this.fx.arrowRainFx(x, y),
      arrowRainBurstFx: (x, y) => this.fx.arrowRainBurstFx(x, y),
      smashFx: (x, y) => this.fx.smashFx(x, y),
      shieldChargeFx: (f) => this.fx.shieldChargeFx(f),
    };
  }

  /* ---------- 战争机器（v0.17） ---------- */

  /** 左键能量连射：0.2s 间隔，射程 1000px，撞墙消散，飞行 500px 后伤害减半 */
  fireWarShot(self: Fighter, angle: number) {
    simFireWarShot(this.warCtx(), self, angle);
  }

  /** 右键毁灭激光炮：消耗全部充能（≥20），穿透路径上所有敌人，被墙体截断 */
  fireWarLaser(self: Fighter) {
    simFireWarLaser(this.warCtx(), self);
  }

  /** 空格点按：向鼠标反方向后退 150px，恢复 30 充能（CD 4s） */
  warBackdash(self: Fighter) {
    simWarBackdash(this.warCtx(), self);
  }

  /** 空格按下：开始长按蓄势（1.5s 后进入歼灭模式；提前松手 = 点按后退） */
  beginWarHold(self: Fighter) {
    simBeginWarHold(this.warCtx(), self);
  }

  /** 覆盖协议：空格切换常规 / 火力压制形态（超负荷芯片） */
  toggleWarSuppress(self: Fighter) {
    simToggleWarSuppress(this.warCtx(), self);
  }

  /** 火力压制：右键长按持续激光 */
  beginWarLaserHold(self: Fighter) {
    simBeginWarLaserHold(this.warCtx(), self);
  }

  stopWarLaserHold(self: Fighter) {
    simStopWarLaserHold(self);
  }

  /** 进入歼灭姿态：立即 +50 充能，之后每 0.05s +2，移速 +20%，持续 10s；结束后进入 30s 冷却 */
  startWarAnnihilate(self: Fighter) {
    simStartWarAnnihilate(this.warCtx(), self);
  }

  /** 毁灭激光视觉：外层红光 + 内核白光 + 末端闪光 + 沿途火星 */
  private warLaserFx(
    self: Fighter, ex: number, ey: number, width: number, len: number, nx: number, ny: number,
  ) {
    const g = this.add.graphics().setDepth(18);
    const px = -ny;
    const py = nx;
    const quad = (half: number, color: number, alpha: number) => {
      g.fillStyle(color, alpha);
      g.beginPath();
      g.moveTo(self.x + px * half, self.y + py * half);
      g.lineTo(ex + px * half, ey + py * half);
      g.lineTo(ex - px * half, ey - py * half);
      g.lineTo(self.x - px * half, self.y - py * half);
      g.closePath();
      g.fillPath();
    };
    quad(width / 2, 0xff3b3b, 0.32);
    quad(width / 4, 0xffd0d0, 0.55);
    quad(width / 8, 0xffffff, 0.9);
    const flash = this.add.circle(ex, ey, width * 0.7, 0xffffff, 0.9).setDepth(18);
    this.tweens.add({ targets: flash, radius: width * 1.6, alpha: 0, duration: 280, onComplete: () => flash.destroy() });
    this.tweens.add({
      targets: g, alpha: 0, duration: 300, ease: 'CubicOut',
      onComplete: () => g.destroy(),
    });
    for (let i = 0; i < 14; i++) {
      const p = Math.random() * len;
      this.fx.pix(self.x + nx * p, self.y + ny * p, i % 2 ? 0xff6b6b : 0xffffff, 3, 300, 0.9);
    }
    this.fx.spark(self.x, self.y, 0xff8a8a, 8);
  }

  /**
   * 火力压制：每帧重绘连续深红激光 + 红色闪电，
   * 与常规形态一次性淡出的光束炮区分。
   */
  private drawWarSuppressBeam() {
    const g = this.warBeamG;
    g.clear();
    if (this.over) return;
    const now = this.time.now;
    for (const f of this.fighters) {
      if (!f.alive || f.charId !== CHAR.WAR || !f.warLaserHeld) continue;
      const a = f.faceAngle;
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      const px = -ny;
      const py = nx;
      const len = rayWallDistance(f.x, f.y, nx, ny, MAP_SIZE * 2.5, this.wallRects);
      const ex = f.x + nx * len;
      const ey = f.y + ny * len;
      const half = BALANCE.war.laserWidthMax / 2;
      const quad = (h: number, color: number, alpha: number) => {
        g.fillStyle(color, alpha);
        g.beginPath();
        g.moveTo(f.x + px * h, f.y + py * h);
        g.lineTo(ex + px * h, ey + py * h);
        g.lineTo(ex - px * h, ey - py * h);
        g.lineTo(f.x - px * h, f.y - py * h);
        g.closePath();
        g.fillPath();
      };
      // 深红外层 → 亮红中层 → 炽白芯（整体比常规光束更深）
      quad(half, 0x5c0000, 0.5);
      quad(half * 0.66, 0xc40000, 0.72);
      quad(half * 0.28, 0xff6a4a, 0.95);
      // 红色闪电：沿光束的随机折线
      for (let k = 0; k < 2; k++) {
        g.lineStyle(k === 0 ? 2.5 : 1.4, k === 0 ? 0xff2b2b : 0xffd6c8,
          k === 0 ? 0.9 : 0.65);
        g.beginPath();
        g.moveTo(f.x, f.y);
        let d = 0;
        while (d < len) {
          d += 26 + Math.random() * 34;
          const dd = Math.min(d, len);
          const jitter = (Math.random() - 0.5) * half * 1.1;
          g.lineTo(f.x + nx * dd + px * jitter, f.y + ny * dd + py * jitter);
        }
        g.strokePath();
      }
      // 枪口 / 末端光斑
      g.fillStyle(0xffe0d0, 0.9).fillCircle(f.x + nx * 22, f.y + ny * 22, 7);
      g.fillStyle(0xff4d4d, 0.5).fillCircle(ex, ey, half * 0.85);
      // 压制状态红色光环提示
      g.lineStyle(2, 0xff3b3b, 0.45 + 0.22 * Math.sin(now * 0.02));
      g.strokeCircle(f.x, f.y, BODY_R + 10 + Math.sin(now * 0.012) * 2);
    }
  }

  /** 歼灭姿态开启特效：红色扩散环 + 环形火星 */
  private warAnnihilateFx(self: Fighter) {
    const ring = this.add.circle(self.x, self.y, 26, 0xff4d4d, 0.55).setDepth(17);
    this.tweens.add({
      targets: ring, radius: 120, alpha: 0, duration: 520, ease: 'CubicOut',
      onComplete: () => ring.destroy(),
    });
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      this.fx.pix(self.x + Math.cos(ang) * 30, self.y + Math.sin(ang) * 30, i % 2 ? 0xff4d4d : 0xffd0d0, 4, 420);
    }
  }

  /* ================= 帝君（v0.29） ================= */

  private emperorMax(f: Fighter): number {
    return simEmperorMax(f);
  }

  private emperorSkillCdMax(f: Fighter): number {
    return simEmperorSkillCdMax(f);
  }

  private emperorChargeCdMax(f: Fighter): number {
    return simEmperorChargeCdMax(f);
  }

  private countSoldiers(f: Fighter): number {
    return simCountSoldiers(this.emperorCtx(), f);
  }

  private spawnSoldier(f: Fighter, opts: { x?: number; y?: number; temp?: boolean } = {}): Soldier | null {
    return simSpawnSoldier(this.emperorCtx(), f, opts);
  }

  private clearSoldiers(f: Fighter) {
    simClearSoldiers(this.emperorCtx(), f);
  }

  private updateEmperor(f: Fighter, dt: number) {
    simUpdateEmperor(this.emperorCtx(), f, dt);
  }

  private updateSoldiers(dt: number) {
    simUpdateSoldiers(this.emperorCtx(), dt);
  }

  castEmperorCharge(f: Fighter, x: number, y: number) {
    simCastEmperorCharge(this.emperorCtx(), f, x, y);
  }

  castEmperorSwap(f: Fighter) {
    simCastEmperorSwap(this.emperorCtx(), f);
  }

  private updateSwapAnims(dt: number) {
    simUpdateSwapAnims(this.emperorCtx(), dt);
  }

  castEmperorSkill(f: Fighter) {
    simCastEmperorSkill(this.emperorCtx(), f);
  }

  /** 独裁：应用方针并立即整理雄兵数量 / 护盾 */
  private applyPolicy(f: Fighter, idx: number) {
    simApplyPolicy(this.emperorCtx(), f, idx);
  }

  private choosePolicy(idx: number, byClick: boolean) {
    simChoosePolicy(this.emperorCtx(), idx, byClick);
  }

  /** 屏幕坐标 ux 命中的方针卡片序号（1~3），未命中返回 0 */
  private policyIndexAt(ux: number): number {
    const gap = 236;
    for (let i = 0; i < 3; i++) {
      const cx = GAME_WIDTH / 2 + (i - 1) * gap;
      if (Math.abs(ux - cx) <= 112) return i + 1;
    }
    return 0;
  }

  /** 每帧推进战争机器的长按蓄势 / 歼灭姿态 */
  private updateWar(f: Fighter, dt: number) {
    simUpdateWar(this.warCtx(), f, dt);
  }

  /* ---------- 奥术天选者 ---------- */

  /** 奥术排斥：0.4s 预警后在落点结算（蓄力期间不可用，改走奥术跃迁） */
  castArcaneReject(self: Fighter, x: number, y: number) {
    simStopArcaneBeam(self);
    simCastArcaneReject(this.arcaneCtx(), self, x, y);
  }

  /** 蓄力期左键：尝试奥术跃迁（前 jumpWindow 秒内可用一次） */
  tryArcaneJump(self: Fighter, x: number, y: number) {
    simTryArcaneJump(this.arcaneCtx(), self, x, y);
  }

  startArcaneAscend(self: Fighter) {
    simStartArcaneAscend(this.arcaneCtx(), self);
  }

  /** 终极法典·奥术轰击：长按右键引导 */
  startArcaneBeam(self: Fighter) {
    simStartArcaneBeam(this.arcaneCtx(), self);
  }

  /** 终极法典·奥术轰击：松开右键停止 */
  stopArcaneBeam(self: Fighter) {
    simStopArcaneBeam(self);
  }

  /** 每帧推进奥术轰击（消耗能量 + 能量球激光） */
  private updateArcaneBeam(dt: number) {
    if (!this.player) return;
    const p = this.input.activePointer;
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    simUpdateArcaneBeam(this.arcaneCtx(), this.player, dt, wp.x, wp.y);
    simUpdateArcaneOrbs(this.arcaneCtx(), dt);
    this.drawArcaneOrbs();
  }

  /** 绘制能量球与紫色激光 */
  private drawArcaneOrbs() {
    const g = this.arcaneOrbG;
    g.clear();
    const now = this.time.now * 0.006;
    for (const o of this.arcaneOrbs) {
      if (!o.fired) {
        const k = 1 - Math.max(0, o.delay) / 0.2;
        const pulse = 0.5 + 0.5 * Math.sin(now * 3);
        // 地面光晕 + 方向指示，确保玩家能清楚看到已放置的能量球
        g.fillStyle(0x7b3fff, 0.16).fillCircle(o.x, o.y, 19);
        g.lineStyle(2, 0x9b5cff, 0.55).strokeCircle(o.x, o.y, 15 + pulse * 2);
        g.fillStyle(0xb388ff, 0.85).fillCircle(o.x, o.y, 7 + 3 * k);
        g.fillStyle(0xf0e6ff, 1).fillCircle(o.x, o.y, 3.5 + 1.5 * k);
        g.lineStyle(1.5, 0xd9c2ff, 0.85).strokeCircle(o.x, o.y, 11 + 5 * k);
        // 环绕符文刻度
        for (let i = 0; i < 4; i++) {
          const a2 = now * 1.5 + (i * Math.PI) / 2;
          g.lineStyle(2, 0xe4d2ff, 0.8).lineBetween(
            o.x + Math.cos(a2) * 13, o.y + Math.sin(a2) * 13,
            o.x + Math.cos(a2) * 18, o.y + Math.sin(a2) * 18,
          );
        }
        // 放置时锁定的射击方向预告
        g.lineStyle(2, 0xb388ff, 0.2 + 0.3 * k).lineBetween(
          o.x, o.y, o.x + Math.cos(o.ang) * 78, o.y + Math.sin(o.ang) * 78,
        );
        continue;
      }
      const a = Math.max(0, Math.min(1, o.t / 1));
      g.lineStyle(BALANCE.arcane.orbLaserWidth + 10, 0x7b3fff, 0.18 * a);
      g.lineBetween(o.x, o.y, o.ex, o.ey);
      g.lineStyle(BALANCE.arcane.orbLaserWidth, 0xb388ff, 0.5 * a);
      g.lineBetween(o.x, o.y, o.ex, o.ey);
      g.lineStyle(6, 0xffffff, 0.75 * a);
      g.lineBetween(o.x, o.y, o.ex, o.ey);
      g.fillStyle(0xe8d7ff, 0.9 * a).fillCircle(o.ex, o.ey, 6);
    }
  }

  private updateArcane(f: Fighter, dt: number) {
    simUpdateArcane(this.arcaneCtx(), f, dt);
  }

  private updateRepulses(dt: number) {
    simUpdateRepulses(this.arcaneCtx(), dt);
  }

  /* ---------- 轰炸专家 ---------- */

  fireVolley(self: Fighter, target: Fighter) {
    simFireVolley(this.bomberCtx(), self, target);
  }

  beginStrike(self: Fighter, x: number, y: number) {
    simBeginStrike(this.bomberCtx(), self, x, y);
  }

  launchStrike(self: Fighter) {
    simLaunchStrike(this.bomberCtx(), self);
  }

  private strikeExplode(strike: PendingStrike) {
    simStrikeExplode(this.bomberCtx(), strike);
  }

  private updateMiniBombs(dt: number) {
    simUpdateMiniBombs(this.bomberCtx(), dt);
  }

  private updateFinalStrikes(dt: number) {
    simUpdateFinalStrikes(this.bomberCtx(), dt);
  }

  /** 最后狂欢：小地图右键锁定单个目标 */
  lockFinalTarget(self: Fighter, x: number, y: number) {
    simLockFinalTarget(this.bomberCtx(), self, x, y);
  }

  /** 最后狂欢：确认后发射终极导弹 */
  launchFinalStrike(self: Fighter) {
    simLaunchFinalStrike(this.bomberCtx(), self);
  }

  /** 最后狂欢：清除锁定（左键改选轰炸点 / ESC 取消） */
  clearFinalTarget(self: Fighter) {
    simClearFinalTarget(self);
  }

  /** 和风守护：风场内的友军移速加成 + 进入风场的子弹减速 */
  private updateWindField() {
    const wind = this.player;
    const on = !!wind && wind.alive && wind.windEquipUnlocked;
    const b = BALANCE.wind;
    for (const f of this.fighters) f.auraSpeedMul = 1;
    if (on) {
      for (const f of this.fighters) {
        if (!f.alive) continue;
        const ally = f === wind || (f.teamBattle && f.team === wind.team);
        if (!ally) continue;
        if (dist(f.x, f.y, wind.x, wind.y) <= b.equipAuraR) {
          f.auraSpeedMul = b.equipAuraSpeed;
        }
      }
    }
    for (const bullet of this.bullets) {
      if (bullet.dead) continue;
      const inside = on
        && dist(bullet.sprite.x, bullet.sprite.y, wind.x, wind.y) <= b.equipAuraR;
      bullet.fieldSlowMul = inside ? b.equipBulletSlow : 1;
    }
    const g = this.windAuraG;
    if (!g) return;
    g.clear();
    if (!on) return;
    const pulse = Math.sin(this.time.now * 0.004) * 2;
    g.fillStyle(0x59d3e3, 0.06).fillCircle(wind.x, wind.y, b.equipAuraR);
    g.lineStyle(2, 0x8be8f2, 0.45).strokeCircle(wind.x, wind.y, b.equipAuraR);
    g.lineStyle(1, 0xd9fff0, 0.22).strokeCircle(wind.x, wind.y, b.equipAuraR - 7 + pulse);
  }

  /** 天降甘霖：旋风持续为范围内的友军回血 */
  private updateWindRain(dt: number) {
    for (const st of this.storms) {
      if (!st.active) continue;
      if (!st.owner.windEquipUnlocked || st.owner.charId !== CHAR.WIND) continue;
      st.rainT += dt;
      while (st.rainT >= 1) {
        st.rainT -= 1;
        const heal = Math.round(st.tickDamage() * BALANCE.wind.equipRainRatio);
        if (heal <= 0) continue;
        for (const f of this.fighters) {
          if (!f.alive) continue;
          const ally = f === st.owner || (f.teamBattle && f.team === st.owner.team);
          if (!ally) continue;
          if (dist(f.x, f.y, st.x, st.y) <= st.r) {
            f.heal(heal);
            this.fx.pix(f.x, f.y - 24, 0x8ff0b0, 1.2, 360);
          }
        }
      }
    }
  }

  private updateGunnerSkill(f: Fighter, dt: number) {
    simUpdateGunnerSkill(this.gunnerCtx(), f, dt);
    // 死神之眼：锁定有效性校验（目标死亡 / 墙体遮挡自动解除）
    simUpdateGunnerLock(this.gunnerCtx(), f);
    // 西部回忆「午时已到」：蓄力推进 / 目标死亡或被墙隔开时中断
    simUpdateHighNoon(this.gunnerCtx(), f, dt);
  }

  /** 死神之眼：右键锁定 */
  beginGunnerLock(self: Fighter, x: number, y: number): boolean {
    return simBeginGunnerLock(this.gunnerCtx(), self, x, y);
  }

  /** 死神之眼：再次右键取消锁定 */
  cancelGunnerLock(self: Fighter) {
    simCancelGunnerLock(self);
  }

  /** 死神之眼：左键消耗一层底气发射必暴狙击弹 */
  fireGunnerLockShot(self: Fighter) {
    simFireGunnerLockShot(this.gunnerCtx(), self);
  }

  /** 西部回忆「午时已到」：按下右键开始蓄力瞄准 */
  beginHighNoon(self: Fighter, x: number, y: number): boolean {
    return simBeginHighNoon(this.gunnerCtx(), self, x, y);
  }

  /** 西部回忆「午时已到」：松开右键结算即时命中 */
  releaseHighNoon(self: Fighter) {
    simReleaseHighNoon(this.gunnerCtx(), self);
  }

  /* ---------- 利剑舞者 ---------- */

  /** 右键·剑气：消耗 1 层剑势朝鼠标发射，可穿透敌人但会被墙体挡下 */
  fireBladeWave(self: Fighter, angle: number) {
    simFireBladeWave(this.bladeCtx(), self, angle);
  }

  /** 空格·利刃华尔兹：剑势 ≥20 开启；华尔兹中再次按空格 = 提前结束（保留剩余剑势） */
  startWaltz(self: Fighter) {
    simStartWaltz(this.bladeCtx(), self);
  }

  /** 华尔兹左键：朝鼠标方向固定穿刺 350px（前 300px 极快，最后 50px 卸力减速；冲刺冷却 0.1s） */
  bladeDash(self: Fighter) {
    simBladeDash(this.bladeCtx(), self);
  }

  /** 逐帧推进华尔兹穿刺（子步进 + 圆-矩检测，避免高速穿墙） */
  private updateBladeWaltz(f: Fighter, dt: number) {
    simUpdateBladeWaltz(this.bladeCtx(), f, dt);
  }


  private updateBurnZones(dt: number) {
    simUpdateBurnZones(this.bomberCtx(), dt);
  }

  /* ---------- 引线（轰炸专家爆破机制） ---------- */

  /** 每次命中叠层并续期；叠满 fuseMaxStacks 层触发爆破（v0.19：不施加给自身与队友） */
  private applyFuse(f: Fighter, layers: number, owner: Fighter) {
    simApplyFuse(this.bomberCtx(), f, layers, owner);
  }

  /* ================= 主循环 ================= */

  update(_time: number, delta: number) {
    const dt = frameDelta(delta);
    if (this.pause.paused) return;
    if (this.started && !this.over) this.stats.time += dt;

    // 奥术登神蓄力期间：除施法者外所有角色移动速度 -20%
    let ascendCharging = false;
    for (const f of this.fighters) {
      if (f.alive && f.arcaneCharging) {
        ascendCharging = true;
        break;
      }
    }
    for (const f of this.fighters) {
      f.globalSlowMul = ascendCharging && !f.arcaneCharging
        ? BALANCE.arcane.ascendEnemySlowMul : 1;
    }

    this.inputCtl.handle(dt);
    for (const f of this.fighters) {
      const prev = this.prevPos.get(f);
      f.update(dt);
      this.updateBladeWaltz(f, dt);
      // v0.19 扫掠防穿模：突进 / 冲刺 / 瞬移等高速位移逐段检测墙体，
      // 避免一帧直接跨过整块墙（华尔兹已在 updateBladeWaltz 内分步检测）
      if (prev && f.alive && !f.waltzDashing) {
        const moved = dist(prev.x, prev.y, f.x, f.y);
        if (moved > 14) {
          const res = sweepCircleMove(prev.x, prev.y, f.x, f.y, BODY_R, this.wallRects);
          if (res.hit) {
            f.sprite.setPosition(res.x, res.y);
            (f.sprite.body as Phaser.Physics.Arcade.Body | null)?.reset(res.x, res.y);
          }
        }
      }
      // v0.22 墙体实心兜底：任何技能/位移若把角色留在墙体内部，改判到最近的非墙体位置
      // （穿墙穿刺期间允许经过墙体，结束时会单独结算落点）
      if (prev && f.alive && !f.waltzDashing && pointInRects(f.x, f.y, this.wallRects)) {
        this.resolveOutOfWalls(f);
      }
      // v0.28 地图边界兜底：外墙是实心的，但击退/冲刺把圆心挤进外墙后，最短推出方向可能朝外，
      // 角色会落到地图外并且不再与任何墙体相交；因此每帧都把圆心钳回可活动区域
      if (f.alive) this.clampInsideArena(f);
      this.prevPos.set(f, { x: f.x, y: f.y });
      const sh = this.shadows.get(f)!;
      sh.setPosition(f.x, f.y + 18);
    }
    this.syncOutlines();

    // 战斗第一段：帝君雄兵 / 易位动画
    this.combat.updateActors(dt);

    if (this.player.bombTargeting &&
        (!this.player.alive || this.player.stunTimer > 0)) {
      this.clearFinalTarget(this.player);
      this.player.bombTargeting = false;
    }
    // 轰炸地图打开期间，若已锁定的终极导弹目标死亡则自动解除锁定
    if (this.player.bombTargeting && this.player.finalTarget && !this.player.finalTarget.alive) {
      this.clearFinalTarget(this.player);
    }

    if (!this.over) {
      for (const ai of this.aiList) {
        if (!ai.alive) continue;
        // 混乱：AI 队友也失去控制，只能随意走动
        if (ai.confuseT > 0) {
          ai.confuseDirT -= dt;
          if (ai.confuseDirT <= 0) {
            ai.confuseDirT = 0.35 + Math.random() * 0.4;
            const a = Math.random() * Math.PI * 2;
            ai.confuseMX = Math.cos(a);
            ai.confuseMY = Math.sin(a);
          }
          ai.moveX = ai.confuseMX;
          ai.moveY = ai.confuseMY;
          continue;
        }
        const ctrl = this.aiCtrls.get(ai);
        if (!ctrl) continue;
        ctrl.update(dt, ai, this.aiEnv(ai), this.aiCtrlsFor(ai), this.started);
      }
    }

    // 战斗第二段：投射物 / 持续技能 / 区域结算
    this.updateWindField();
    this.combat.updateProjectiles(dt);
    this.updateArcaneBeam(dt);
    this.drawWarSuppressBeam();
    this.updateWindRain(dt);
    this.updateFinalStrikes(dt);

    // 复活
    this.respawns.update(dt);

    // 模式专属逻辑：推车推进 / 检查点 / 倒计时，训练场 DPS 面板
    this.modeImpl.update(dt);

    // UI
    this.hud.drawAim();
    this.hud.drawBurnZones();
    this.hud.drawWarnings();
    this.hud.drawMinimap();
    this.hud.drawSubMap();
    this.modeImpl.drawWorld();
    this.hud.drawHpBars();
    this.hud.drawSkillPanel();
    this.hud.drawPolicyPanel();
    this.hud.drawScores();
    this.modeImpl.drawHud();
    this.hud.drawArcaneAlerts();
    this.hud.setTime(Math.floor(this.stats.time));

    for (const [f, star] of this.stars) {
      if (f.alive && f.stormSlowMul < 1) {
        star.setVisible(true);
        star.setPosition(f.x, f.y - 48 + Math.sin(this.time.now * 0.008) * 4);
        star.rotation += dt * 5;
      } else {
        star.setVisible(false);
      }
    }

    this.cameraRig.syncZoom(
      this.player, this.baseZoom, this.countSoldiers(this.player),
      this.mode === MODE.PVE ? 0.7 : 1,
    );
    this.cameraRig.syncUiCamera(this.uiCam);

    // 胜负：乱斗为击杀数达标；推车由模式 update 自行判定
    if (!this.over) this.modeImpl.checkWin();
  }

  /**
   * @param win 乱斗：玩家是否达成胜利；推车：进攻方是否获胜（由 winnerTeam 再换算成玩家视角）
   * @param winnerTeam 推车模式的获胜队伍（0 进攻 / 1 防守），随机分队后用于结算页标题与音效
   */
  private endGame(win: boolean, winner?: Fighter, reason?: string, winnerTeam?: number) {
    if (this.over) return;
    this.over = true;
    // v0.27：玩家可能被分到守方，结算的胜负必须以玩家所在队伍为准
    const playerWin = winnerTeam === undefined ? win : this.player.team === winnerTeam;
    playSfx(playerWin ? 'win' : 'lose', 0.9);
    for (const ai of this.aiList) {
      ai.moveX = 0;
      ai.moveY = 0;
    }
    const headline = reason ?? `${winner ? winner.name : '无人'}  达成 ${KILLS_TO_WIN} 击杀`;
    this.hud.pushFeed(`${headline}，战斗结束`);
    const aiChars = this.aiList.map((a) => a.charId);
    const scores = this.fighters.map((f) => ({
      name: f.name, charId: f.charId, kills: f.kills, isPlayer: f.isPlayer, team: f.team,
    }));
    this.cameras.main.fadeOut(450);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('End', {
        win: playerWin,
        winnerTeam,
        mode: this.mode,
        payloadMap: this.mode === MODE.PAYLOAD ? this.payloadMap : undefined,
        mapIndex: this.mode === MODE.BRAWL ? this.mapIndex : undefined,
        mapName: this.layout.name.replace(/\s+/g, ''),
        levelId: this.mode === MODE.PVE ? this.levelId : undefined,
        levelName: this.mode === MODE.PVE ? this.levelName : undefined,
        reason,
        charId: this.charId,
        aiChars,
        time: Math.floor(this.stats.time),
        dealt: Math.round(this.stats.dealt),
        taken: Math.round(this.stats.taken),
        scores,
      });
    });
  }

  /* ================= AI 接口 ================= */

  private aiCtrlsFor(_self: Fighter): AIControls {
    return {
      fireGunnerShot: (f, angle) => this.fireGunnerShot(f, angle),
      beginGustCharge: (f) => this.beginGustCharge(f),
      releaseGust: (f) => this.releaseGust(f),
      castStorm: (f, x, y) => this.castStorm(f, x, y),
      activateGunnerSkill: (f) => this.activateGunnerSkill(f),
      dashGunner: (f, angle) => this.dashGunner(f, angle),
      fireVolley: (f, target) => this.fireVolley(f, target),
      beginStrike: (f, x, y) => this.beginStrike(f, x, y),
      launchStrike: (f) => this.launchStrike(f),
      arcaneBlast: (f, x, y) => this.castArcaneReject(f, x, y),
      arcaneJump: (f, x, y) => this.tryArcaneJump(f, x, y),
      arcaneAscend: (f) => this.startArcaneAscend(f),
      bladeParryCharge: (f) => f.beginParryCharge(),
      bladeParryRelease: (f) => {
        const gained = f.enterParry();
        this.fx.parryFx(f, gained);
      },
      bladeWave: (f, angle) => this.fireBladeWave(f, angle),
      bladeWaltz: (f) => this.startWaltz(f),
      bladeDash: (f, angle) => {
        f.faceAngle = angle;
        this.bladeDash(f);
      },
      warFire: (f, angle) => this.fireWarShot(f, angle),
      warLaser: (f, angle) => {
        f.faceAngle = angle;
        this.fireWarLaser(f);
      },
      warBackdash: (f) => this.warBackdash(f),
      warAnnihilate: (f) => this.startWarAnnihilate(f),
      emperorCharge: (f, x, y) => this.castEmperorCharge(f, x, y),
      emperorSwap: (f) => this.castEmperorSwap(f),
      emperorSkill: (f) => this.castEmperorSkill(f),
    };
  }

  private aiEnv(self: Fighter): AIEnv {
    return {
      player: this.player,
      walls: this.wallRects,
      bullets: this.bullets.filter((b) => b.owner !== self),
      missiles: this.missiles.filter((m) => m.owner !== self),
      storms: this.storms,
      burnZones: this.burnZones as BurnZoneRef[],
      enemies: this.fighters.filter((f) => f !== self && f.alive
        && (this.mode === MODE.BRAWL || f.team !== self.team)),
      soldiers: this.soldiers.filter((s) => !s.dead).map((s) => ({
        x: s.x, y: s.y, state: s.state, owner: s.owner,
      })),
      payload: this.mode === MODE.PAYLOAD
        ? {
            x: this.cartX,
            y: this.cartY,
            r: PAYLOAD.radius,
            active: this.started && !this.over,
            role: self.team === 0 ? 'push' as const : 'defend' as const,
          }
        : null,
    };
  }

  /* ================= 视野 ================= */

  /** 当前视野半径（由相机编排计算，AI / 可见性判定与 HUD 共用） */
  private get visionRadius(): number {
    return this.cameraRig.visionRadius;
  }
}
