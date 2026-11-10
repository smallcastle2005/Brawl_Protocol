import Phaser from 'phaser';
import { BALANCE, CHAR, CharId, MAP_SIZE, WALL_T } from '../config';
import { clamp, lerp } from '../core/util';
import { playSfx } from '../audio/sfx';

const SPRITE_SCALE = 3;
/** 角色统一显示宽度（世界单位）：不同源画布（16×18 / 24×27）按整数倍缩放后保持同屏等大 */
const CHAR_DISPLAY_W = 48;
/** 角色碰撞半径（世界单位，与 48×54 的像素贴图基本贴合，避免“离墙还有一截就撞停”） */
const BODY_R = 22;
/** 防御力减伤公式常数：减伤乘区 = 1 - def / (def + DEF_K) */
const DEF_K = 200;

export interface DamageOpts {
  /** 来源方向（用于击退/特效朝向），可选 */
  dirX?: number;
  dirY?: number;
  /** 处决一击（跳过数值直接致命） */
  fatal?: boolean;
  /** 伤害来源（用于击杀统计） */
  source?: Fighter;
  /** 不弹出伤害数字（处决等特殊结算用） */
  noText?: boolean;
  /** 本次伤害被招架格挡（用于格挡成功音效，由 takeDamage 回填） */
  parryBlocked?: boolean;
  /** 本次伤害触发暴击（由 takeDamage 回填，用于伤害数字表现） */
  crit?: boolean;
  /** 强制暴击（最后狂欢：终极导弹必定暴击） */
  forceCrit?: boolean;
  /** 强制暴击时使用的暴击伤害倍率 */
  forceCritMul?: number;
  /** 不参与暴击判定（奥术登神在 PVE 中转为固定增伤） */
  noCrit?: boolean;
  /** 静默命中：不闪白、不播命中音效（用于高频持续伤害） */
  quiet?: boolean;
}

export interface FighterOpts {
  onDamaged?: (f: Fighter, dmg: number, died: boolean, opts?: DamageOpts) => void;
  onDeath?: (f: Fighter) => void;
  /** 贴图前缀（怪物使用自定义贴图时传入；缺省等于 charId） */
  texKey?: string;
  /** 是否为侧视怪物：按水平移动方向翻转朝向 */
  monster?: boolean;
  /** 覆盖生命上限 */
  maxHp?: number;
  /** 覆盖移动速度 */
  speed?: number;
  /** 覆盖显示宽度（世界单位；BOSS 用更大尺寸） */
  displayW?: number;
  /** 覆盖碰撞半径（世界单位） */
  bodyR?: number;
  /** 受击半径（世界单位；缺省取 bodyR 与 BODY_R 的较大值，BOSS 可单独放大） */
  hitR?: number;
  /** 防御力（PVE 敌人）：减伤乘区 = 1 - def / (def + 200) */
  def?: number;
  /** true：怪物也使用四向 + 多动作帧（心兽狼人形态） */
  dirAnim?: boolean;
  /** 活动区域钳位（缩小地图时使用；缺省沿用全图外墙） */
  clampRect?: { x: number; y: number; w: number; h: number };
}

export class Fighter {
  scene: Phaser.Scene;
  sprite: Phaser.Physics.Arcade.Sprite;
  charId: CharId;
  isPlayer: boolean;
  name: string;
  /** 当前使用的贴图前缀（怪物为自定义贴图） */
  texKey: string;
  /** 侧视怪物：按移动方向翻转朝向 */
  isMonster = false;
  /** 四向动作怪物：使用 `{texKey}-{dir}-{pose}` 贴图（心兽狼人） */
  dirAnim = false;
  /** 受击半径（世界单位）：子弹与技能命中判定使用，体型越大越容易被打中 */
  hitR = BODY_R;
  /** 防御力：PVE 敌人对友方伤害的抵抗，减伤乘区 = 1 - def / (def + 200) */
  def = 0;
  /** 活动区域（缩小地图用） */
  clampRect?: { x: number; y: number; w: number; h: number };
  /** Q 版角色的当前朝向（由 faceAngle 推导） */
  dirKey: 'down' | 'up' | 'side' = 'down';
  /** 出手 / 施法姿态剩余时间 */
  atkPoseT = 0;
  private prevAtkCd = 0;
  /** 混乱：剩余时间（期间无法操作，只能随意走动） */
  confuseT = 0;
  /** 混乱随机走动的换向计时 / 当前方向（由 PlayerInput 驱动） */
  confuseDirT = 0;
  confuseMX = 0;
  confuseMY = 0;

  /** 队伍编号：0=进攻方(蓝) / 1=防守方(红)；乱斗模式下每人独立编号 */
  team = 0;
  /** 团队模式：true 时同队伤害无效（乱斗模式为 false） */
  teamBattle = false;
  /** 训练木偶：不移动、不受控制、不会死亡，只用于承伤与 DPS 统计 */
  isDummy = false;

  maxHp: number;
  hp: number;
  speed: number;
  alive = true;
  dying = false;

  moveX = 0;
  moveY = 0;
  /** 当前朝向（瞄准角度），玩家由鼠标决定，AI 由行为树决定 */
  faceAngle = 0;
  knockX = 0;
  knockY = 0;
  stunTimer = 0;
  /** 沉默剩余时间（v0.29：帝君「统治」施加；沉默期间仍可移动，但无法施放任何攻击/技能） */
  silentTimer = 0;

  /** 旋风减速倍率：在风之女皇风暴中为 stormSlowMul，离开后恢复 1 */
  stormSlowMul = 1;
  /** 全场减速倍率：奥术天选者蓄力期间，其他角色移动速度 ×0.8 */
  globalSlowMul = 1;

  // 通用攻击冷却
  atkCd = 0;

  // 神枪手
  chargeHits = 0;
  skillActive = false;
  skillTimer = 0;
  skillTickT = 0;
  dashCd = 0;
  dashT = 0;
  dashVX = 0;
  dashVY = 0;
  lastShotDist = 0; // 生成子弹时与鼠标的距离（枪械抬手）

  // 风之女皇：脱手积攒的狂风（位置固定，玩家可自由移动/攻击/技能）
  gustCharging = false;
  gustChargeT = 0;
  gustChargeX = 0;
  gustChargeY = 0;
  /** 点按蓄力瞬间锁定的施放方向（之后移动鼠标/转向都不再改变） */
  gustAimAngle = 0;
  skillCd = 0;

  // 轰炸专家：轰炸选点状态（选点期间锁定移动）
  bombTargeting = false;
  bombTX = 0;
  bombTY = 0;
  // 轰炸专家：引线（层数叠满 fuseMaxStacks 触发爆破）
  fuseStacks = 0;
  fuseTimer = 0;

  // 奥术天选者：登神蓄力状态
  arcaneCharging = false;
  arcaneChargeT = 0;
  // 奥术跃迁：蓄力前 2s 内可使用一次
  arcaneJumpUsed = false;
  arcaneJumpT = 0; // 选定后的传送倒计时
  arcaneJumpX = 0;
  arcaneJumpY = 0;
  /* ---- 终极法典：被动蓄能 / 奥术轰击 ---- */
  /** 是否解锁终极法典 */
  arcaneEquipUnlocked = false;
  /** 能量（0~100） */
  arcaneEnergy = 0;
  /** 满能量增益剩余时间（30s：暴击率 +50% / 暴击伤害 +50%） */
  arcaneBuffT = 0;
  /** 长按右键引导奥术轰击 */
  arcaneBeamHeld = false;
  /** 轰击能量消耗累计（每满 10 点放一颗能量球） */
  arcaneOrbAcc = 0;

  // 利剑舞者：招架 / 剑势 / 利刃华尔兹
  parryCharging = false;
  parryChargeT = 0;
  /** 招架状态剩余时间 */
  parryT = 0;
  /** 当前招架减伤比例（0.2 ~ 1） */
  parryReduce = 0;
  /** 本次招架是否为满蓄招架（满蓄时招架中可继续蓄力） */
  parryFull = false;
  /** 招架成功格挡时获得的剑势层数（enterParry 按蓄力预存，格挡成功才入账） */
  parryStacks = 0;
  /** 每 3 秒自动回复剑势的计时器 */
  bladeAutoT = 0;
  /** 华尔兹冲刺冷却（剩余秒数） */
  waltzDashCd = 0;
  /** 利剑舞者华尔兹护盾（吸收伤害，华尔兹结束清空） */
  shield = 0;
  bladeStacks = 0;
  waltzActive = false;
  waltzDashing = false;
  waltzDirX = 1;
  waltzDirY = 0;
  waltzTraveled = 0;
  /** 本次穿刺已命中的敌人（避免重复结算） */
  waltzHitSet = new Set<Fighter>();

  // 战争机器：过载充能 / 歼灭姿态
  /** 过载充能（0~100） */
  warCharge = 0;
  /** 空格长按中（未达 1.5s 前松手 = 点按后退） */
  warHolding = false;
  /** 空格长按累计时长 */
  warHoldT = 0;
  /** 歼灭模式剩余时间 */
  warAnnT = 0;
  /** 歼灭模式充能发放计时 */
  warAnnTickT = 0;
  /** 点按后退冷却 */
  warBackCd = 0;
  /** 歼灭模式冷却（歼灭状态结束后才开始计时） */
  warAnnCd = 0;
  /** 自身速度倍率（歼灭 +20% / 长按蓄势最多 -50%） */
  selfSpeedMul = 1;
  /** 战地维修：距离上次攻击 / 受伤的时间（秒） */
  warIdleT = 0;
  /** 战地维修：每秒 5 生命 / 5 充能的发放累计器 */
  warRegenAcc = 0;
  /** 超负荷芯片：解锁核心超载 / 覆盖协议 */
  warOverloadUnlocked = false;
  /** 覆盖协议：当前是否为火力压制形态 */
  warSuppress = false;
  /** 覆盖协议：形态切换剩余时间（>0 时无法攻击） */
  warSwitchT = 0;
  /** 核心超载：每秒自动充能的发放累计器 */
  warOverloadAcc = 0;
  /** 火力压制：右键长按持续激光中 */
  warLaserHeld = false;
  /** 火力压制：左键是否处于按住状态（左右键互斥用） */
  warFireHeld = false;
  /** 火力压制：持续激光结算计时 */
  warLaserTickT = 0;
  /** 火力压制：持续激光累计伤害（每 0.2s 合并飘字） */
  warLaserAcc = 0;
  /** 火力压制：持续激光飘字计时 */
  warLaserShowT = 0;
  /** 火力压制：持续激光最近命中的目标（飘字落点） */
  warLaserLast: Fighter | null = null;
  /** 火力压制：左键左右交替（1 / -1） */
  warGatlingSide = 1;

  // 帝君：百万雄兵 / 护驾 / 独裁统治
  /** 本场方针：0=未选择（独裁未使用），1=运筹帷幄，2=兵贵神速，3=特立独行，4=百折不挠，5=亲力亲为 */
  emperorPolicy = 0;
  /** 本局随机抽取的 3 条方针（独裁三选一，每局固定） */
  emperorPolicyOptions: number[] = [];
  /** 雄兵召唤计时（每 20s 一次） */
  emperorSumT = 0;
  /** 方针 3 的护盾重置计时 */
  emperorP3T = 0;
  /** 左键冲锋冷却 */
  emperorChargeCd = 0;
  /** 右键易位 / 护驾冷却 */
  emperorSwapCd = 0;
  /** 方针 5：帝君自动投矛计时 */
  emperorSpearCd = 0;
  /** 独裁选方针中（玩家） */
  emperorChoosing = false;
  /** 选方针剩余时间（超时自动选择） */
  emperorChoiceT = 0;
  /** 方针 2 统治：临时增加的雄兵上限 */
  emperorCapBonus = 0;
  /** 方针 2 统治：上限提升剩余时间（最多 10s） */
  emperorCapBonusT = 0;

  /** 减速：剩余时间与移速倍率（多个减速取最强） */
  slowT = 0;
  slowMul = 1;
  /** 击飞：剩余滞空时间（期间无法操作） */
  airT = 0;

  // 四人大乱斗通用
  kills = 0;
  /** 最后造成伤害的人，用于击杀归属 */
  lastAttacker: Fighter | null = null;

  /* ---------- PVE 装备 / 暴击（非冒险模式保持默认值） ---------- */
  /** 造成伤害的倍率（装备属性） */
  dmgMul = 1;
  /** 暴击率（0~1），0 表示不参与暴击 */
  critChance = 0;
  /** 暴击伤害倍率（1.5 = 150%） */
  critDmgMul = 1.5;
  /** 子弹弹道速度倍率（西部回忆「快速拔枪」） */
  bulletSpeedMul = 1;
  /** 是否解锁 PVE 专属技能「午时已到」 */
  highNoonUnlocked = false;
  /** 午时已到：蓄力中 */
  highNoonCharging = false;
  /** 午时已到：已蓄力时长（秒） */
  highNoonT = 0;
  /** 午时已到：瞄准目标 */
  highNoonTarget: Fighter | null = null;
  /** v0.41 死神之眼：右键锁定目标（锁定期间移速 -70%，左键消耗底气狙击） */
  lockTarget: Fighter | null = null;
  /** 本次弹幕风暴的持续时间（HUD 进度条用） */
  skillDurMax = 0;
  /** 受到伤害减免比例（专属装备；0 表示无减免） */
  drPct = 0;
  /** 左键攻击冷却倍率（专属装备；0.75 = 冷却缩短 25%） */
  atkCdMul = 1;
  /** 风之女皇专属装备：和风守护 / 天降甘霖已解锁 */
  windEquipUnlocked = false;
  /** 轰炸专家专属装备：点火！/ 最后狂欢！已解锁 */
  bomberEquipUnlocked = false;
  /** 和风守护：当前所处风场提供的移速倍率（每帧由场景刷新） */
  auraSpeedMul = 1;
  /** 天降甘霖：引爆旋风后的瞬时加速剩余比例（1 → 0，1s 衰减） */
  windRushT = 0;
  /** 最后狂欢：轰炸地图中已锁定的单个目标 */
  finalTarget: Fighter | null = null;
  /** 最后狂欢：空格当前是否切换为「发射终极导弹」 */
  finalArmed = false;
  /** 最后狂欢：本关是否已使用 */
  finalUsed = false;

  onDamaged?: (f: Fighter, dmg: number, died: boolean, opts?: DamageOpts) => void;
  onDeath?: (f: Fighter) => void;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    charId: CharId,
    isPlayer: boolean,
    name: string,
    opts: FighterOpts = {},
  ) {
    this.scene = scene;
    this.charId = charId;
    this.isPlayer = isPlayer;
    this.name = name;
    this.texKey = opts.texKey ?? charId;
    this.isMonster = opts.monster ?? false;
    this.dirAnim = opts.dirAnim ?? false;
    this.hitR = opts.hitR ?? Math.max(BODY_R, opts.bodyR ?? BODY_R);
    this.def = opts.def ?? 0;
    this.clampRect = opts.clampRect;
    this.onDamaged = opts.onDamaged;
    this.onDeath = opts.onDeath;

    const bal = BALANCE[charId];
    this.maxHp = opts.maxHp ?? bal.hp;
    this.hp = this.maxHp;
    this.speed = opts.speed ?? bal.speed;

    this.sprite = scene.physics.add.sprite(x, y, this.initialTexKey);
    // 源画布尺寸自适应：16×18 → 3 倍（48×54），24×27 → 2 倍（48×54），显示尺寸始终一致
    const srcW = this.sprite.width;
    const srcH = this.sprite.height;
    const scale = (opts.displayW ?? CHAR_DISPLAY_W) / srcW;
    this.sprite.setScale(scale);
    // 记录基础缩放：受击 / 后坐力等临时缩放补间结束后复位用
    this.sprite.setData('baseScale', scale);
    this.sprite.setDepth(10);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    // Arcade 的半径以贴图为单位并按 scale 放大，故传入 BODY_R / scale
    const r = (opts.bodyR ?? BODY_R) / scale;
    body.setCircle(r, srcW / 2 - r, srcH / 2 - r);
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }
  get bal() { return BALANCE[this.charId]; }

  /** 初始贴图：怪物沿用侧视待机，可玩角色为 Q 版正面待机 */
  private get initialTexKey(): string {
    return this.isMonster && !this.dirAnim ? this.texKey + '-idle' : this.texKey + '-down-idle';
  }

  /** 奥术登神蓄力中：不可移动、免疫控制、受到伤害大幅减少 */
  get controlImmune(): boolean { return this.arcaneCharging; }

  /** 普攻实际伤害（奥术排斥固定值） */
  get attackDmg(): number { return BALANCE.arcane.atkDmg; }

  /** 当前移动速度（含旋风减速、全场减速、自身减速、风场加成与瞬时加速） */
  get speedNow(): number {
    return this.speed * this.stormSlowMul * this.globalSlowMul * this.selfSpeedMul
      * this.slowMul * this.auraSpeedMul * (1 + this.windRushT);
  }

  /** 战争机器：充能上限（超负荷芯片提升至 500） */
  get warChargeMax(): number {
    return this.warOverloadUnlocked ? BALANCE.war.overloadChargeMax : BALANCE.war.chargeMax;
  }

  /** 战争机器：是否可发射毁灭激光（充能 ≥ 20） */
  get warLaserReady(): boolean {
    return this.charId === CHAR.WAR && this.warCharge >= BALANCE.war.laserNeed;
  }

  get gunnerReady(): boolean {
    return this.charId === CHAR.GUNNER && this.chargeHits >= BALANCE.gunner.hitsToReady;
  }

  get windSkillReady(): boolean {
    return this.charId === CHAR.WIND && this.skillCd <= 0;
  }

  /** 利剑舞者是否满足开启华尔兹的剑势条件 */
  get bladeWaltzReady(): boolean {
    return this.charId === CHAR.BLADE && this.bladeStacks >= BALANCE.blade.waltzNeedStacks;
  }

  applyKnock(kx: number, ky: number) {
    if (this.arcaneCharging || this.isDummy) return; // 蓄力期间 / 训练木偶不受控制效果
    this.knockX += kx;
    this.knockY += ky;
  }

  stun(t: number) {
    if (this.arcaneCharging || this.isDummy) return; // 蓄力期间 / 训练木偶不受控制效果
    this.stunTimer = Math.max(this.stunTimer, t);
  }

  /** 沉默：仍可移动，但无法施放攻击/技能 */
  silence(t: number) {
    if (this.arcaneCharging || this.isDummy) return;
    this.silentTimer = Math.max(this.silentTimer, t);
  }

  /** 减速：slow 为减速比例（0.2 = 移速 ×0.8），同一时间取最强减速 */
  applySlow(slow: number, dur: number) {
    if (this.arcaneCharging || this.isDummy) return;
    const mul = 1 - slow;
    this.slowMul = Math.min(this.slowMul, mul);
    this.slowT = Math.max(this.slowT, dur);
  }

  /** 击飞：滞空期间无法操作（由帝君方针 3 的砸地触发） */
  applyAir(t: number) {
    if (this.arcaneCharging || this.isDummy) return;
    this.airT = Math.max(this.airT, t);
    this.stunTimer = Math.max(this.stunTimer, t);
  }

  get silenced(): boolean { return this.silentTimer > 0; }

  takeDamage(dmg: number, opts: DamageOpts = {}): boolean {
    if (!this.alive) return false;
    // 训练木偶：血量恒定，伤害只上报给 DPS 统计，不会进入死亡流程
    if (this.isDummy) {
      this.onDamaged?.(this, dmg, false, opts);
      return false;
    }
    // v0.19 全局规则：己方伤害不误伤队友与自身（自身攻击 / 同队队友一律免伤，含 AOE）
    if (opts.source && (opts.source === this
      || (this.teamBattle && opts.source.team === this.team))) {
      return false;
    }
    // PVE：攻击方伤害乘区 + 暴击（环境伤害没有来源，不参与）
    let outgoing = dmg;
    if (opts.source && opts.source !== this && !opts.fatal) {
      const src = opts.source;
      outgoing *= src.dmgMul;
      // 终极法典「蓄能」：满能量后 30s 内暴击率 / 暴击伤害各 +50%
      const critAdd = src.arcaneBuffT > 0 ? BALANCE.arcane.codexBuffCrit : 0;
      const critDmgAdd = (src.arcaneBuffT > 0 ? BALANCE.arcane.codexBuffCritDmg : 0)
        + (src.warSuppress && src.warOverloadUnlocked ? BALANCE.war.suppressCritDmgAdd : 0);
      if (opts.forceCrit) {
        // 最后狂欢：必定暴击，且使用技能指定的暴击伤害倍率
        outgoing *= opts.forceCritMul ?? (src.critDmgMul + critDmgAdd);
        opts.crit = true;
      } else if (!opts.noCrit && src.critChance + critAdd > 0
        && Math.random() < src.critChance + critAdd) {
        outgoing *= src.critDmgMul + critDmgAdd;
        opts.crit = true;
      }
    }
    if (opts.source && opts.source !== this) this.lastAttacker = opts.source;
    // 受击打断战地维修
    this.warIdleT = 0;
    let mul = this.arcaneCharging ? 1 - BALANCE.arcane.chargeDamageReduce : 1;
    // 专属装备减伤（风的遗憾：受到伤害 -10%）
    if (this.drPct > 0) mul *= 1 - this.drPct;
    // 战争机器歼灭姿态：额外 20% 减伤
    if (this.charId === CHAR.WAR && this.warAnnT > 0) {
      mul *= 1 - BALANCE.war.annDamageReduce;
    }
    // 防御力（PVE 敌人）：减伤乘区 = 1 - def / (def + 200)
    if (this.def > 0) mul *= 1 - this.def / (this.def + DEF_K);
    // 招架：减免本次伤害（真实伤害除外），触发一次即消耗；格挡成功才获得预存剑势
    let parryMul = 1;
    if (this.parryT > 0 && !opts.fatal) {
      parryMul = 1 - this.parryReduce;
      this.parryT = 0;
      this.parryReduce = 0;
      this.parryFull = false;
      opts.parryBlocked = true; // 本次为招架格挡（供音效/特效识别）
      if (this.parryStacks > 0) {
        this.addBladeStacks(this.parryStacks);
        this.parryStacks = 0;
      }
    }
    const final = opts.fatal ? 99999 : outgoing * mul * parryMul;
    // 利剑舞者华尔兹护盾：优先吸收伤害
    let afterShield = final;
    if (this.shield > 0 && !opts.fatal) {
      const absorbed = Math.min(this.shield, afterShield);
      this.shield -= absorbed;
      afterShield -= absorbed;
    }
    this.hp -= afterShield;
    this.onDamaged?.(this, final, this.hp <= 0, opts);
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
      return true;
    }
    return false;
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.dying = true;
    this.stunTimer = 0;
    this.silentTimer = 0;
    this.emperorChoosing = false;
    this.emperorChoiceT = 0;
    this.gustCharging = false;
    this.gustChargeT = 0;
    this.skillActive = false;
    this.bombTargeting = false;
    this.finalTarget = null;
    this.finalArmed = false;
    this.windRushT = 0;
    this.auraSpeedMul = 1;
    this.fuseStacks = 0;
    this.fuseTimer = 0;
    this.arcaneCharging = false;
    this.arcaneChargeT = 0;
    this.arcaneJumpT = 0;
    this.arcaneJumpUsed = false;
    this.stormSlowMul = 1;
    this.globalSlowMul = 1;
    this.slowT = 0;
    this.slowMul = 1;
    this.airT = 0;
    this.emperorSpearCd = 0;
    this.parryCharging = false;
    this.parryChargeT = 0;
    this.parryT = 0;
    this.parryReduce = 0;
    this.parryFull = false;
    this.parryStacks = 0;
    this.shield = 0;
    // v0.12：死亡/复活不再清空剑势
    this.waltzActive = false;
    this.waltzDashing = false;
    this.waltzTraveled = 0;
    this.waltzDashCd = 0;
    this.waltzHitSet.clear();
    // 午时已到：死亡/复活时中断蓄力
    this.highNoonCharging = false;
    this.highNoonT = 0;
    this.highNoonTarget = null;
    this.lockTarget = null;
    this.arcaneBeamHeld = false;
    this.arcaneOrbAcc = 0;
    // 战争机器：阵亡时退出长按/歼灭并清空充能；歼灭被死亡打断同样进入完整冷却
    this.warHolding = false;
    this.warHoldT = 0;
    if (this.warAnnT > 0) this.warAnnCd = BALANCE.war.annCd;
    this.warAnnT = 0;
    this.warAnnTickT = 0;
    this.warLaserHeld = false;
    this.warLaserTickT = 0;
    this.warLaserAcc = 0;
    this.warLaserShowT = 0;
    this.warLaserLast = null;
    this.warSuppress = false;
    this.warSwitchT = 0;
    this.warCharge = 0;
    this.warIdleT = 0;
    this.warRegenAcc = 0;
    this.selfSpeedMul = 1;
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.enable = false;
    this.scene.tweens.add({
      targets: this.sprite,
      angle: 360 * 2,
      duration: 500,
    });
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0,
      duration: 450,
      delay: 350,
    });
    this.onDeath?.(this);
  }

  /** 每帧推进运动学；由 GameScene 在物理步进前调用 */
  update(dt: number) {
    // 冷却在阵亡等待复活期间也正常计算
    this.atkCd = Math.max(0, this.atkCd - dt);
    // 冷却被抬高 = 刚出手（普攻/技能），播放一段抬手动作
    if (this.atkCd > this.prevAtkCd + 1e-4) this.atkPoseT = 0.26;
    this.prevAtkCd = this.atkCd;
    this.atkPoseT = Math.max(0, this.atkPoseT - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.skillCd = Math.max(0, this.skillCd - dt); // 技能 CD 恢复（风暴/轰炸共用）
    this.emperorChargeCd = Math.max(0, this.emperorChargeCd - dt);
    this.emperorSwapCd = Math.max(0, this.emperorSwapCd - dt);
    this.emperorSpearCd = Math.max(0, this.emperorSpearCd - dt);
    if (this.slowT > 0) {
      this.slowT = Math.max(0, this.slowT - dt);
      if (this.slowT <= 0) this.slowMul = 1;
    }
    // 天降甘霖：引爆旋风后的瞬时加速在 1s 内线性衰减
    if (this.windRushT > 0) {
      this.windRushT = Math.max(0, this.windRushT - dt / BALANCE.wind.equipRushDur);
    }
    if (this.airT > 0) this.airT = Math.max(0, this.airT - dt);
    if (this.confuseT > 0) this.confuseT = Math.max(0, this.confuseT - dt);
    // 终极法典蓄能增益倒计时
    if (this.arcaneBuffT > 0) this.arcaneBuffT = Math.max(0, this.arcaneBuffT - dt);

    // 战争机器：点按后退冷却常驻计时；歼灭冷却仅在歼灭状态结束后才走
    this.warBackCd = Math.max(0, this.warBackCd - dt);
    if (this.warAnnT <= 0) this.warAnnCd = Math.max(0, this.warAnnCd - dt);
    this.warSwitchT = Math.max(0, this.warSwitchT - dt);

    if (!this.alive) return;

    // 战争机器：长按蓄势逐渐减速（最多 -50%），歼灭期间 +20%，火力压制 -30%
    if (this.charId === CHAR.WAR) {
      this.selfSpeedMul = this.warOverloadUnlocked && this.warSuppress
        ? BALANCE.war.suppressSpeedMul
        : this.warHolding
          ? 1 - BALANCE.war.annHoldSlow * clamp(this.warHoldT / BALANCE.war.annHold, 0, 1)
          : this.warAnnT > 0 ? BALANCE.war.annSpeedMul : 1;
      // 核心超载：每秒自动获得 40 充能（与战地维修独立）
      if (this.warOverloadUnlocked) {
        this.warOverloadAcc += dt;
        while (this.warOverloadAcc >= 1) {
          this.warOverloadAcc -= 1;
          this.addWarCharge(BALANCE.war.overloadRegenPerSec);
        }
      }
      // 被动·战地维修：2s 内未攻击且未受伤 → 每秒 +5 生命 +5 充能，且歼灭冷却转速翻倍
      const w = BALANCE.war;
      this.warIdleT += dt;
      if (this.warIdleT >= w.idleRegenDelay) {
        this.warRegenAcc += dt;
        while (this.warRegenAcc >= 1) {
          this.warRegenAcc -= 1;
          this.heal(w.idleRegenHp);
          this.addWarCharge(w.idleRegenCharge);
        }
        // 额外推进一份冷却，与上方常驻推进叠加 → 冷却速度 ×2
        if (this.warAnnT <= 0) this.warAnnCd = Math.max(0, this.warAnnCd - dt);
      } else {
        this.warRegenAcc = 0;
      }
    }

    // 华尔兹冲刺冷却
    this.waltzDashCd = Math.max(0, this.waltzDashCd - dt);
    // 利剑舞者：每 autoStackCd 秒自动回复 1 层剑势
    if (this.charId === CHAR.BLADE && this.bladeStacks < BALANCE.blade.maxStacks) {
      this.bladeAutoT += dt;
      if (this.bladeAutoT >= BALANCE.blade.autoStackCd) {
        this.bladeAutoT -= BALANCE.blade.autoStackCd;
        this.addBladeStacks(1);
      }
    }

    // 利剑舞者：招架蓄力推进 / 招架状态倒计时
    if (this.parryCharging) {
      this.parryChargeT = Math.min(BALANCE.blade.parryChargeMax, this.parryChargeT + dt);
    }
    if (this.parryT > 0) {
      this.parryT -= dt;
      if (this.parryT <= 0) {
        this.parryT = 0;
        this.parryReduce = 0;
        this.parryFull = false;
        this.parryStacks = 0; // 招架到期未格挡，预存剑势作废
      }
    }
    // 脱手积攒的狂风持续蓄力（不随玩家移动）
    if (this.gustCharging) {
      this.gustChargeT = Math.min(BALANCE.wind.chargeMax, this.gustChargeT + dt);
    }
    if (this.fuseTimer > 0) {
      this.fuseTimer -= dt;
      if (this.fuseTimer <= 0) {
        this.fuseTimer = 0;
        this.fuseStacks = 0;
      }
    }
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;

    this.stunTimer = Math.max(0, this.stunTimer - dt);
    this.silentTimer = Math.max(0, this.silentTimer - dt);
    const stunned = this.stunTimer > 0;

    // 击退衰减
    const decay = Math.max(0, 1 - 8 * dt);
    this.knockX *= decay;
    this.knockY *= decay;
    if (Math.abs(this.knockX) < 1) this.knockX = 0;
    if (Math.abs(this.knockY) < 1) this.knockY = 0;

    let vx = 0;
    let vy = 0;
    // 华尔兹状态锁定位移（穿刺位移由 GameScene 逐帧推进）
    if (!stunned && !this.bombTargeting && !this.arcaneCharging && !this.waltzActive) {
      if (this.dashT > 0) {
        this.dashT -= dt;
        vx = this.dashVX;
        vy = this.dashVY;
      } else {
        const mx = clamp(this.moveX, -1, 1);
        const my = clamp(this.moveY, -1, 1);
        const len = Math.hypot(mx, my);
        if (len > 0) {
          vx = (mx / len) * this.speedNow;
          vy = (my / len) * this.speedNow;
        }
      }
    }
    // 午时已到：蓄力瞄准期间移速 -90%
    if (this.highNoonCharging) {
      const slow = 1 - BALANCE.gunner.highNoonSlow;
      vx *= slow;
      vy *= slow;
    }
    // 死神之眼：锁定期间移速 -70%
    if (this.lockTarget) {
      const slow = 1 - BALANCE.gunner.lockSlow;
      vx *= slow;
      vy *= slow;
    }
    body.setVelocity(vx + this.knockX, vy + this.knockY);

    // 安全钳位：不越出外墙（缩小地图时按关卡活动区域钳位）
    if (this.clampRect) {
      const rc = this.clampRect;
      const minX = rc.x;
      const minY = rc.y;
      const maxX = rc.x + rc.w;
      const maxY = rc.y + rc.h;
      this.sprite.x = clamp(this.sprite.x, minX + BODY_R, maxX - BODY_R);
      this.sprite.y = clamp(this.sprite.y, minY + BODY_R, maxY - BODY_R);
    } else {
      const min = WALL_T + BODY_R + 2;
      const max = MAP_SIZE - WALL_T - BODY_R - 2;
      this.sprite.x = clamp(this.sprite.x, min, max);
      this.sprite.y = clamp(this.sprite.y, min, max);
    }

    // 动画：移动播放行走帧，静止显示待机帧（训练木偶保持自身贴图不动）
    if (!this.isDummy) {
      if (this.isMonster && this.dirAnim) {
        // 心兽狼人：四向 + 多动作帧
        this.updateChibiAnim(vx, vy);
      } else if (this.isMonster) {
        const moving = Math.abs(vx) + Math.abs(vy) > 4;
        const walkKey = 'walk-' + this.texKey;
        if (moving) {
          if (this.sprite.anims.currentAnim?.key !== walkKey) {
            this.sprite.play(walkKey);
          }
        } else {
          if (this.sprite.anims.isPlaying) this.sprite.anims.stop();
          this.sprite.setTexture(this.texKey + '-idle');
        }
        // 侧视怪物：按水平移动方向翻转，始终能看清左右朝向
        if (vx > 8) this.sprite.setFlipX(false);
        else if (vx < -8) this.sprite.setFlipX(true);
      } else {
        this.updateChibiAnim(vx, vy);
      }
    }
  }

  /** 蓄力 / 引导类技能：持续显示抬手施法姿态 */
  private get casting(): boolean {
    return this.gustCharging || this.arcaneCharging || this.bombTargeting
      || this.parryCharging || this.highNoonCharging || this.lockTarget !== null
      || this.arcaneBeamHeld
      || this.warHolding || this.warAnnT > 0 || this.skillActive;
  }

  /** 终极法典：增加能量（满 100 的瞬间获得 30s 蓄能增益） */
  addArcaneEnergy(n: number) {
    if (!this.arcaneEquipUnlocked || n <= 0) return;
    const before = this.arcaneEnergy;
    const max = BALANCE.arcane.codexEnergyMax;
    this.arcaneEnergy = clamp(this.arcaneEnergy + n, 0, max);
    if (before < max && this.arcaneEnergy >= max) {
      this.arcaneBuffT = BALANCE.arcane.codexBuffDur;
      playSfx('charge_full', 0.8);
    }
  }

  /** 终极法典：消耗能量，返回实际消耗量 */
  spendArcaneEnergy(n: number): number {
    if (n <= 0) return 0;
    const spent = Math.min(this.arcaneEnergy, n);
    this.arcaneEnergy -= spent;
    return spent;
  }

  /** Q 版角色：移动时按位移方向切换朝向，静止 / 施法时沿用瞄准角度 */
  private updateChibiAnim(vx: number, vy: number) {
    const moving = Math.abs(vx) + Math.abs(vy) > 4;
    const acting = this.atkPoseT > 0 || this.casting;
    const a = moving && !acting ? Math.atan2(vy, vx) : this.faceAngle;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const dir: 'down' | 'up' | 'side' = Math.abs(sn) > Math.abs(c) * 1.35
      ? (sn > 0 ? 'down' : 'up')
      : 'side';
    if (this.dirKey !== dir) this.dirKey = dir;
    this.sprite.setFlipX(dir === 'side' && c < 0);

    const prefix = this.texKey + '-' + dir;
    if (acting) {
      if (this.sprite.anims.isPlaying) this.sprite.anims.stop();
      // 蓄势 → 出手；引导类技能一直保持蓄势帧
      const key = prefix + (this.casting || this.atkPoseT > 0.14 ? '-atk1' : '-atk2');
      if (this.sprite.texture.key !== key) this.sprite.setTexture(key);
      return;
    }
    if (moving) {
      const walkKey = 'walk-' + this.texKey + '-' + dir;
      if (this.sprite.anims.currentAnim?.key !== walkKey || !this.sprite.anims.isPlaying) {
        this.sprite.play(walkKey);
      }
    } else {
      if (this.sprite.anims.isPlaying) this.sprite.anims.stop();
      const idleKey = prefix + '-idle';
      if (this.sprite.texture.key !== idleKey) this.sprite.setTexture(idleKey);
    }
  }

  /** 神枪手突进：朝角度 dash，距离由调用方决定（鼠标更近时冲得更短） */
  dash(angle: number, distance = BALANCE.gunner.dashDist) {
    if (this.charId !== CHAR.GUNNER || this.dashCd > 0) return false;
    if (this.highNoonCharging) return false; // 午时已到蓄力期间无法使用其他技能
    const b = BALANCE.gunner;
    // 弹幕风暴期间突进距离更短
    const maxDist = this.skillActive ? b.skillDashDist : b.dashDist;
    const dist = clamp(distance, 0, maxDist);
    this.dashCd = b.dashCd;
    this.dashT = dist / b.dashSpeed;
    this.dashVX = Math.cos(angle) * b.dashSpeed;
    this.dashVY = Math.sin(angle) * b.dashSpeed;
    return true;
  }

  /** 治疗（弹幕风暴吸血）；返回实际恢复量 */
  heal(n: number): number {
    if (!this.alive || n <= 0) return 0;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + n);
    return this.hp - before;
  }

  /** 充能点（神枪手底气） */
  addCharge(n: number) {
    if (this.charId !== CHAR.GUNNER) return;
    const max = BALANCE.gunner.chargeMax;
    const before = this.gunnerReady;
    this.chargeHits = Math.min(max, this.chargeHits + n);
    if (!before && this.chargeHits >= BALANCE.gunner.hitsToReady && this.isPlayer) {
      playSfx('charge_full', 0.8);
    }
  }

  /** 过载充能（战争机器）：左键子弹造成的伤害等量转化，默认上限 100（超负荷芯片为 500） */
  addWarCharge(n: number) {
    if (this.charId !== CHAR.WAR || n <= 0) return;
    const max = this.warChargeMax;
    const before = this.warCharge;
    this.warCharge = Math.min(max, this.warCharge + n);
    if (before < max && this.warCharge >= max && this.isPlayer) {
      playSfx('charge_full', 0.7);
    }
  }

  /** 造成伤害转化为充能 */
  addWarChargeFromDamage(n: number) {
    this.addWarCharge(n);
  }

  /** 在当前位置开始脱手积攒一发狂风（不跟随玩家，可移动/攻击/技能）；返回是否成功开始 */
  beginCharge(): boolean {
    if (this.charId !== CHAR.WIND || this.gustCharging) return false;
    if (this.atkCd > 0) return false; // 释放后的短暂冷却期内不可立即再蓄力
    this.gustCharging = true;
    this.gustChargeT = 0;
    this.gustChargeX = this.x;
    this.gustChargeY = this.y;
    // v0.19：蓄力开始的瞬间锁定施放方向，之后不再随鼠标改变
    this.gustAimAngle = this.faceAngle;
    return true;
  }

  /** 取消积攒（不发射） */
  cancelGustCharge(): void {
    this.gustCharging = false;
    this.gustChargeT = 0;
  }

  /* ---------- 利剑舞者 ---------- */

  /** 开始招架蓄力（按住左键）；非满蓄招架状态结束前不可再次蓄力 */
  beginParryCharge() {
    if (this.charId !== CHAR.BLADE || !this.alive || this.silenced) return;
    if (this.waltzActive || this.parryCharging) return;
    // 满蓄招架期间允许再次蓄力（形成连续招架）
    if (this.parryT > 0 && !this.parryFull) return;
    this.parryCharging = true;
    this.parryChargeT = 0;
  }

  cancelParryCharge() {
    this.parryCharging = false;
    this.parryChargeT = 0;
  }

  /**
   * 松开左键 → 进入招架状态（持续 0.1~0.5s，随蓄力时长）：
   * 减伤 20%~100%（随蓄力）。剑势不再立即获得，而是按蓄力预存（1~5 层），
   * 只有在招架状态下成功格挡至少一次伤害时才真正入账（见 takeDamage）。
   * 满蓄招架（蓄力达到上限）期间可再次按住左键蓄力。
   * @returns 预存的剑势层数（用于特效提示；未在蓄力中返回 0）
   */
  enterParry(): number {
    if (this.charId !== CHAR.BLADE || !this.parryCharging) return 0;
    const b = BALANCE.blade;
    const t = clamp(this.parryChargeT / b.parryChargeMax, 0, 1);
    this.parryCharging = false;
    this.parryChargeT = 0;
    this.parryReduce = lerp(b.parryReduceMin, b.parryReduceMax, t);
    this.parryT = lerp(b.parryDurMin, b.parryDurMax, t);
    this.parryFull = t >= 1;
    this.parryStacks = Math.round(lerp(b.stacksPerParryMin, b.stacksPerParryMax, t));
    return this.parryStacks;
  }

  /** 增加剑势（上限 maxStacks） */
  addBladeStacks(n: number) {
    if (this.charId !== CHAR.BLADE || n <= 0) return;
    this.bladeStacks = Math.min(BALANCE.blade.maxStacks, this.bladeStacks + n);
  }

  /** 消耗剑势，返回实际消耗量 */
  spendBladeStacks(n: number): number {
    const cost = Math.min(this.bladeStacks, n);
    this.bladeStacks -= cost;
    return cost;
  }

  /** 复活：重置战斗状态并回到指定位置 */
  respawn(x: number, y: number) {
    this.scene.tweens.killTweensOf(this.sprite);
    this.alive = true;
    this.dying = false;
    this.hp = this.maxHp;
    this.stormSlowMul = 1;
    this.stunTimer = 0;
    this.silentTimer = 0;
    this.emperorChoosing = false;
    this.emperorChoiceT = 0;
    this.emperorChargeCd = 0;
    this.emperorSwapCd = 0;
    this.emperorSpearCd = 0;
    this.emperorCapBonus = 0;
    this.emperorCapBonusT = 0;
    this.slowT = 0;
    this.slowMul = 1;
    this.airT = 0;
    this.knockX = 0;
    this.knockY = 0;
    this.moveX = 0;
    this.moveY = 0;
    this.gustCharging = false;
    this.gustChargeT = 0;
    this.skillActive = false;
    this.skillTimer = 0;
    this.bombTargeting = false;
    this.finalTarget = null;
    this.finalArmed = false;
    this.windRushT = 0;
    this.auraSpeedMul = 1;
    this.fuseStacks = 0;
    this.fuseTimer = 0;
    this.arcaneCharging = false;
    this.arcaneChargeT = 0;
    this.arcaneJumpT = 0;
    this.arcaneJumpUsed = false;
    this.dashT = 0;
    this.dashCd = 0;
    this.atkCd = 0;
    this.globalSlowMul = 1;
    this.parryCharging = false;
    this.parryChargeT = 0;
    this.parryT = 0;
    this.parryReduce = 0;
    this.parryFull = false;
    this.parryStacks = 0;
    this.shield = 0;
    // v0.12：死亡/复活不再清空剑势
    this.waltzActive = false;
    this.waltzDashing = false;
    this.waltzTraveled = 0;
    this.waltzDashCd = 0;
    this.waltzHitSet.clear();
    // 午时已到：死亡/复活时中断蓄力
    this.highNoonCharging = false;
    this.highNoonT = 0;
    this.highNoonTarget = null;
    this.lockTarget = null;
    this.arcaneBeamHeld = false;
    this.arcaneOrbAcc = 0;
    // 战争机器：复活重置充能/姿态，但技能冷却保留剩余时间继续走（v0.20：不再自动刷新）
    this.warCharge = 0;
    this.warHolding = false;
    this.warHoldT = 0;
    this.warAnnT = 0;
    this.warAnnTickT = 0;
    this.warBackCd = 0;
    this.warIdleT = 0;
    this.warRegenAcc = 0;
    this.selfSpeedMul = 1;
    this.confuseT = 0;
    this.sprite.setPosition(x, y);
    this.sprite.setAlpha(1);
    this.sprite.setAngle(0);
    this.sprite.setTexture(this.initialTexKey);
    this.sprite.setFlipX(false);
    this.sprite.anims.stop();
    this.dirKey = 'down';
    this.atkPoseT = 0;
    this.prevAtkCd = 0;
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    body.reset(x, y);
    body.setVelocity(0, 0);
  }
}

export { SPRITE_SCALE, BODY_R };