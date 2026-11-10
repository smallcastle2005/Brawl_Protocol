/** 全局常量与数值平衡表 —— 所有战斗数值集中在此便于调参 */

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 600;

/** v0.19：推车遗迹地图扩大到 2400×2400（原 1600 等比 1.5×） */
export const MAP_SIZE = 2400;
export const WALL_T = 39; // 外围墙体厚度（26 × 1.5）
/**
 * 相机基准缩放：v0.17 在 v0.16 的 +20% 视野基础上再拓宽 30%（1.2 × 1.3 = 1.56），
 * 让六人乱斗中获得的信息更多（zoom 越小看得越远、角色越小）
 */
export const BASE_ZOOM = 1 / 1.56;

export const CHAR = {
  GUNNER: 'gunner',
  WIND: 'wind',
  BOMBER: 'bomber',
  ARCANE: 'arcane',
  BLADE: 'blade',
  WAR: 'war',
  EMPEROR: 'emperor',
} as const;
export type CharId = (typeof CHAR)[keyof typeof CHAR];

/** 全部可选角色（选人页 / 图鉴 / 人机随机池统一从这里取） */
export const CHAR_POOL: CharId[] = [
  CHAR.GUNNER, CHAR.WIND, CHAR.BOMBER, CHAR.ARCANE, CHAR.BLADE, CHAR.WAR, CHAR.EMPEROR,
];

/** 胜负条件：任意角色累计击杀数达到该值即结束战斗（v0.17：由 8 提升到 10） */
export const KILLS_TO_WIN = 10;
/** 阵亡后复活等待时间（秒） */
export const RESPAWN_DELAY = 5;

export const BALANCE = {
  gunner: {
    name: '神枪手',
    hp: 400, // 最高生命：以生存换取的持续输出型
    speed: 230,
    atkCD: 0.32,
    bulletDmg: 12, // v0.16：由 11 提升
    bulletSpeed: 800, // v0.16：由 600 提升
    bulletScaleMul: 0.8, // 子弹体积缩小 20%
    bulletRadiusMul: 0.8,
    bounceSpeedAdd: 0, // 已取消弹墙增益（保持反弹，不再提速/增伤）
    bounceSpeedCap: 0,
    bounceDmgAdd: 0,
    bounceDmgMax: 0,
    bulletLifeDist: 1500, // 子弹最大飞行距离
    hitsToReady: 8, // v0.40：命中 8 次积攒 8 层「底气」才能开启弹幕风暴
    chargeMax: 16, // 底气上限
    skillDurBase: 2.4, // 消耗 8 层底气开启时的持续时间
    skillDurPerExtra: 0.3, // 每多消耗 1 层底气，持续时间 +0.3s（16 层 → 4.8s）
    skillRadius: 240, // v0.29：弹幕风暴 AoE 半径 200 → 240
    skillTickCd: 0.1, // v0.16：由 0.15 加快
    skillBulletCount: 4, // v0.16：由 3 提升，每个 tick 向范围内敌人发射的追踪弹数量
    skillTickDmg: 5, // 每发追踪弹伤害
    skillBulletLife: 1.6, // 追踪弹寿命（秒）
    skillLifesteal: 0.5, // v0.16：弹幕风暴期间造成伤害的 50% 转化为自身治疗（由 30% 提升）
    // ---- PVE 专属装备「西部回忆」：午时已到 ----
    highNoonNeedStacks: 3, // 最少 3 层底气可用
    highNoonMinCharge: 0.5, // 最短有效蓄力
    highNoonMaxCharge: 2.5, // 最长蓄力
    highNoonBulletDmg: 20, // 每发子弹基础伤害
    highNoonMaxBullets: 6, // 最多子弹数
    highNoonStacksPerBullet: 3, // 每 3 层底气发射 1 发
    highNoonDmgStep: 0.5, // 每蓄力 0.5s 提升 100% 伤害（最高 500%）
    highNoonSlow: 0.9, // 蓄力期间移速 -90%
    // v0.41 锁定狙击（替换午时已到）
    lockRange: 520, // 右键可锁定的最大距离（世界单位）
    lockAimTol: 220, // 锁定判定：鼠标与敌人连线的容差
    lockSlow: 0.7, // 锁定期间移速 -70%
    lockShotDmg: 110, // 每次锁定射击基础伤害
    lockShotSpeed: 3200, // 狙击水滴弹速度（极快）
    lockCritChanceMul: 2, // 锁定射击必定暴击：暴击率 ×2 转为额外暴击伤害
    dashSpeed: 1250,
    dashDist: 300, // 突进最大距离（鼠标更近时只冲到鼠标位置）
    skillDashDist: 200, // 弹幕风暴期间的突进最大距离
    dashCd: 0.45,
  },
  wind: {
    name: '风之女皇',
    hp: 375,
    speed: 270,
    chargeMax: 1.2, // 满蓄力时间
    gustDmgMin: 18, // v0.21：左键瞬发狂风伤害 12 → 18
    gustDmgMax: 38,
    gustRangeMin: 500, // v0.16：瞬发狂风射程由 250 提升
    gustRangeMax: 1500, // v0.16：满蓄射程由 1380 提升
    gustSpeedMin: 680, // v0.22：左键基础弹速 340 → 680
    gustSpeedMax: 1320, // 满蓄弹速
    knockMin: 150,
    knockMax: 330,
    releaseCd: 0.4, // v0.16：左键瞬发/长按连发的间隔由 0.2 上调
    gustWidthMax: 1.5, // 满蓄时狂风宽度倍率
    gustWidthRight: 2, // 右键积攒的狂风宽度整体再 ×2
    castRange: 275, // 风暴圆心限定在以自身为中心该半径内
    orbSpeed: 600, // v0.16：风暴领域施放的风球飞行速度（先飞向目标再形成旋风）
    skillCd: 8, // 风暴领域冷却
    skillRadius: 160, // 风暴领域半径
    skillDur: 2, // 风暴持续时间（基础）
    skillTickCd: 0.4,
    skillTickDmg: 3, // 外围旋转的持续伤害
    stormDetonateMul: 1, // 满蓄狂风引爆旋风：剩余伤害（不再 ×2）
    orbitRadiusFactor: 0.78, // 子弹与狂风统一拉到这条轨道上旋转（敌人不再旋转，改为减速）
    orbitAngular: 3.4, // 轨道旋转角速度 rad/s
    bulletSpinMul: 2, // 旋风中的子弹/狂风以 2 倍转速旋转
    stormGrowPerBullet: 0.05, // 每吸入一颗子弹，旋风半径 +5%
    stormGrowMax: 1, // 半径最多 +100%（即翻倍）
    stormAbsorbDmgRatio: 0.25, // 吸收子弹伤害的 25% 追加到旋风持续伤害
    stormSlowMul: 0.4, // v0.22：减速 50% → 60%（移速 ×0.4，仍可攻击/技能）
    stormSlowMulMax: 0.2, // v0.22：旋风半径扩大 50% 后减速增强至 80%（移速 ×0.2）
    stormSpinAtGrow: 0.5, // v0.22：旋风半径扩大 ≥50% 时强制敌人绕旋风旋转
    stormSpinSpeed: 2.2, // v0.22：强制旋转的角速度（rad/s）
    stormDurBonusPerBullet: 0.12, // 每吸入一颗子弹，旋风持续时间 +0.12s
    stormDurBonusMax: 2, // 吸入子弹带来的额外持续时间上限（总持续时间最长 2+2=4s）
    // 专属装备「风的遗憾」
    equipAuraR: 150, // 和风守护：风场半径
    equipAuraSpeed: 1.08, // 风场内友军移速倍率
    equipBulletSlow: 0.5, // 风场内子弹移速倍率
    equipRainRatio: 0.3, // 天降甘霖：每秒回复当前旋风伤害的比例
    equipRushDur: 1, // 引爆旋风后的加速衰减时长（1s）
  },
  bomber: {
    name: '轰炸专家',
    hp: 300,
    speed: 230,
    atkCD: 1.5,
    missileCount: 3,
    missileDmg: 12, // v0.13：由 16 下调（直接命中）
    missileSplashR: 44,
    missileSplashDmg: 6, // v0.13：由 9 下调（溅射）
    missileSpeed0: 130, // 起步很慢
    missileSpeedMax: 620, // 逐渐加快
    missileAccel: 480,
    missileTurn: 3.4, // 跟踪转向速率 rad/s
    missileLife: 5.5,
    skillCd: 20, // 不如直接炸翻天冷却
    strikeDelay: 1.8, // 右键启动后的预警延迟
    strikeHalf: 200, // 主轰炸范围：正方形边长 400px
    strikeDmg: 60, // v0.21：主轰炸 50 → 60
    // 主轰炸后 200~400px 圆环上均匀随机位置的小轰炸（中心不会落在主炸中心 200px 内）
    miniRange: 400,
    miniInner: 200,
    miniCount: 5, // v0.15：初始小轰炸 5 次（每次触发引线爆破 +1，整局生效、新对局重置）
    miniInterval: 0.1, // v0.15：由 0.2 加快（小轰炸频率）
    miniDelay: 0.8,
    miniHalf: 100, // 小轰炸范围：正方形边长 200px
    miniDmg: 35, // v0.21：小轰炸 25 → 35
    miniBurnHalf: 100,
    burnDur: 5.0,
    burnTick: 0.5, // v0.21：燃烧频率 1.0s → 0.5s
    burnDmg: 3, // v0.21：每跳 6 → 3（频率翻倍，总 DPS 不变）
    subMapSize: 460, // 轰炸子地图面板边长（屏幕px）
    // 引线：导弹/轰炸/燃烧每次命中叠层，叠满 6 层触发爆破（v0.15：由 8 层下调）
    fuseDur: 5, // 引线持续时间（每次续期）
    fuseBombMul: 2, // 轰炸（主炸/小炸）施加的层数倍率
    fuseMaxStacks: 6, // v0.15：由 8 层下调，叠满该层数触发爆破
    fuseBlastDmg: 20, // v0.15：由 40 下调，爆破对自身及周围单位造成的伤害
    fuseBlastR: 200, // 爆破波及半径（只造成伤害，不再传染引线）
    // 专属装备「超究极无敌毁灭疯狂飞鹰导弹发射装置」
    fuseHeal: 4, // 点火！：每次引线爆破回复生命
    fuseCritStep: 0.01, // 点火！：每次引线爆破提高暴击率
    fuseCritDmgStep: 0.02, // 暴击率满后改为提高暴击伤害
    fuseCdRefund: 0.5, // 点火！：每次引线爆破减少特殊技能冷却
    finalDelay: 3, // 最后狂欢：终极导弹落地延迟
    finalDmgPerMini: 20, // 最后狂欢：每份小轰炸数量的基础伤害
    finalVolley: 10, // 最后狂欢：延迟后连续发射的导弹数量
    finalShotInterval: 0.12, // 最后狂欢：连续导弹的发射间隔
    finalLockR: 140, // 小地图右键锁定目标的最大容差（世界单位）
  },
  arcane: {
    name: '奥术天选者',
    hp: 320,
    speed: 230,
    atkCD: 0.8, // 奥术排斥冷却
    atkDmg: 25, // v0.16：奥术排斥伤害由 20 提升
    rejectRange: 350, // 施法范围：以自身为圆心 350px
    rejectR: 50, // 落点预警圈半径
    rejectDelay: 0.6, // v0.16：预警后命中延迟由 0.4 增加
    rejectKnock: 800, // 推开力度
    rejectSkillRefund: 2, // 奥术排斥命中敌人后，奥术登神冷却减少 2s
    skillCd: 30, // 奥术登神冷却
    chargeDur: 3.5, // 蓄力时长
    chargeHeal: 150, // v0.16：蓄力期间持续回复的总生命由 100 提升
    chargeDamageReduce: 0.9, // 蓄力期间受到伤害减少 90%
    // 奥术跃迁：蓄力前 2s 内可左键选定 1000px 内一点，1.5s 后传送
    jumpRange: 1000,
    jumpWindow: 2, // 蓄力开始后多久内可使用跃迁
    jumpDelay: 1.5, // 选定后多久传送
    ascendEnemySlowMul: 0.8, // 蓄力期间所有敌人移动速度 ×0.8（减速 20%）
    waveSpeed: 600, // 能量波扩散速度
    waveDmg0: 2000, // 能量波基础伤害
    waveK: 100000, // 反比例衰减常量：dmg = min(waveDmg0, round(waveK / 距离))；500px 处约 200
    waveMaxRadius: 1200,
    visionMul: 1.8, // 蓄力期间视野额外扩大 80%
    // v0.41 终极法典：被动蓄能 / 奥术轰击
    codexEnergyMax: 100, // 能量条上限
    codexHitGain: 10, // 左键命中敌人回复能量
    codexBuffDur: 30, // 能量达到 100 时的增益持续时间
    codexBuffCrit: 0.5, // 增益：暴击率 +50%
    codexBuffCritDmg: 0.5, // 增益：暴击伤害 +50%
    orbDrainPerSec: 25, // 长按右键每秒消耗能量（4s 消耗 100）
    orbCostEach: 10, // 每消耗 10 点能量放置一个能量球
    orbDelay: 0.2, // 能量球放置后 0.2s 延迟出射
    orbLaserDur: 1, // 激光持续时间
    orbLaserLen: 1500, // 激光最大长度（无法穿墙）
    orbLaserTick: 0.5, // 激光伤害间隔
    orbLaserDmg: 150, // 激光每跳伤害（原 50，现为原来的 300%）
    orbLaserWidth: 26, // 激光判定宽度
  },
  blade: {
    name: '利剑舞者',
    hp: 420,
    speed: 240,
    // 左键·招架
    parryChargeMax: 1, // 最多蓄力 1s
    parryDurMin: 0.1, // 蓄力最少获得 0.1s 招架
    parryDurMax: 0.5, // 满蓄获得 0.5s 招架
    parryReduceMin: 0.2, // 蓄力最少减伤 20%
    parryReduceMax: 1.0, // 满蓄减伤 100%
    parryFullRecharge: true, // 满蓄进入招架时，招架状态中仍可再次蓄力
    stacksPerParryMin: 1, // 招架获得剑势下限
    stacksPerParryMax: 5, // 招架获得剑势上限
    maxStacks: 40, // 剑势层数上限
    autoStackCd: 5, // v0.16：每 5s 自动回复 1 层剑势（由 3s 削弱）
    waveHitRefund: 3, // v0.15：剑气命中获得剑势层数（由返还 1 层提升）
    // 右键·剑气
    waveCd: 0.35,
    waveDmg: 20, // 剑气伤害
    waveSpeed: 900,
    waveRange: 900,
    waveRadius: 9,
    // 空格·利刃华尔兹
    waltzNeedStacks: 20, // 开启所需剑势
    waltzCost: 5, // 每次冲刺消耗剑势
    waltzDist: 350, // 固定穿刺距离
    waltzFastDist: 300, // 前 300px 极快
    waltzFastSpeed: 2200,
    waltzSlowSpeed: 340, // 最后 50px 减速到停止
    waltzDmg: 80, // 穿刺伤害
    waltzLifesteal: 0, // v0.16：华尔兹穿刺吸血移除（改为穿刺击杀回复固定 50 生命）
    waltzKillHeal: 50, // v0.16：华尔兹状态穿刺击杀回复生命值
    waltzHitR: 42, // v0.15：穿刺命中判定半径（BODY_R + 该值，由 36 提升）
    waltzDashCd: 0.1, // v0.13：华尔兹冲刺冷却
    waltzPierceWalls: true, // 穿刺可穿越墙体
    waltzShieldMul: 10, // 开启华尔兹时获得 剑势×该值 的护盾
    waltzJumpRange: 200, // 华尔兹中击杀后落到另一名敌人 200px 周围
    killStacks: 10, // 利剑舞者击败任意敌人回复剑势（v0.12：不再限定华尔兹状态）
  },
  war: {
    name: '战争机器',
    hp: 350,
    speed: 240,
    // 左键·能量连射（按住持续发射）
    atkCD: 0.2, // 连射间隔
    bulletDmg: 10, // v0.19：由 6 提升到 10（衰减后 5）
    bulletSpeed: 1000,
    bulletRange: 1000, // 射程：飞行到该距离即消散
    falloffDist: 500, // 飞行超过该距离后伤害衰减
    falloffMul: 0.5, // 衰减后的伤害倍率（10 → 5）
    // 被动·过载充能
    chargeMax: 100,
    // 被动·战地维修：2s 内既未攻击也未受伤，每秒回复 5 生命与 5 充能
    idleRegenDelay: 2,
    idleRegenHp: 5,
    idleRegenCharge: 5,
    // 右键·毁灭激光炮
    laserNeed: 20, // 最低可用充能
    laserDmgPerCharge: 1.2, // v0.29：每点充能 1.5 → 1.2 伤害（满 100 充能 = 120）
    /** v0.29：激光左右两侧区域伤害倍率（原 50% → 75%） */
    laserSideMul: 0.75,
    laserWidthMin: 30, // 20 充能时的激光宽度
    laserWidthMax: 60, // 100 充能时的激光宽度
    // 空格·点按后退
    backDist: 150,
    backCharge: 30,
    backCd: 4,
    // 空格·歼灭姿态（仅长按进入，取消点按分支）
    annHold: 1.5, // 长按时长
    annHoldSlow: 0.5, // 长按期间移速最多降低 50%
    annBurstCharge: 50, // 进入歼灭模式立刻获得
    annTickCd: 0.05,
    annTickCharge: 4, // v0.19：每 0.05s 获得 4 点
    annSpeedMul: 1.2, // 歼灭期间移速 +20%
    annDamageReduce: 0.2, // v0.19：歼灭期间额外 20% 减伤
    annDur: 10,
    annCd: 30, // 歼灭状态结束后才进入冷却
    // ---- PVE 专属装备「超负荷芯片」----
    overloadChargeMax: 500, // 核心超载：充能上限
    overloadRegenPerSec: 40, // 核心超载：每秒自动获得充能
    laserChargeCap: 100, // 毁灭激光炮单次最多计入 / 消耗的充能
    suppressSwitchTime: 1.5, // 覆盖协议：形态切换耗时（期间无法攻击）
    suppressSpeedMul: 0.7, // 火力压制：移速 -30%
    suppressCritDmgAdd: 0.5, // 火力压制：暴击伤害 +50%
    suppressFireInterval: 0.06, // 火力压制：左键能量弹发射间隔
    suppressLaserTick: 0.01, // 火力压制：持续激光结算间隔
    suppressLaserDmg: 10, // 火力压制：持续激光每跳伤害（右键伤害减半）
    suppressLaserDrain: 250, // 火力压制：持续激光每秒消耗充能
  },
  emperor: {
    name: '帝君',
    hp: 50,
    speed: 240,
    // ---- 被动·百万雄兵 ----
    soldierInterval: 20, // 每 20s 召唤 1 名
    soldierMax: 4, // 常规上限
    soldierStartCount: 2, // 开局立即召唤
    summonRadius: 150, // v0.32：在距自身 150px 处随机召唤（落点避开墙体）
    soldierSpawnDelay: 1, // 召唤后 1s 延迟进入戒备
    spearRange: 120, // 雄兵不再追踪，只攻击进入 120px 的敌人
    spearCd: 0.6, // 戳击频率
    spearDmg: 6, // v0.32：雄兵攻击伤害 12 → 6
    // v0.33：800px 只限制「攻击判定」，不再限制冲锋落点 / 冲锋终止 / 队形排斥
    leashRange: 800,
    // ---- 被动·护驾 ----
    shieldPerSoldier: 100, // 每名在场雄兵提供 100 护盾
    visionMul: 1.25, // 有雄兵在场时视野 +25%
    // ---- 左键·冲锋 ----
    chargeRange: 800, // v0.32：冲锋终点只能选在帝君 800px 内
    chargeCd: 3,
    chargeSpeed: 900,
    chargeDmg: 8, // v0.32：碰触伤害 24 → 8
    chargeLaneGap: 88, // 冲锋终点并排间距（至少相隔 80px）
    chargeOverShoot: 0.6, // 越过终点的距离 = 攻击范围 × 该倍率
    // ---- 右键·易位 ----
    swapCd: 10,
    swapSpeed: 900,
    swapDmg: 24,
    // ---- 空格·独裁 / 统治 ----
    // v0.33：独裁不再进入冷却，可立刻接统治；统治冷却改由所选方针决定（见各方针的 *DominateCd）
    skillCd: 40, // 兜底值（尚未选定方针时）
    dominateHpRatio: 0.2, // 统治：当前生命 20%
    dominateSilence: 2, // 沉默 2s
    dominateStun: 2, // 处于雄兵攻击范围内改为眩晕 2s
    chooseTimeout: 10, // 独裁选方针的超时（自动选择第一个）
    // ---- 方针 1·运筹帷幄 ----
    p1Range: 600, // 方针 1 的持弓射击范围
    p1ArrowSpeed: 1000,
    p1ArrowDmg: 15, // v0.32：弓箭伤害 30 → 15
    p1ArrowCount: 3, // 朝目标方向 + 左右各 30°
    p1ArrowSpread: Math.PI / 6,
    p1ArrowTravel: 800,
    p1Volleys: 3, // 冲锋改为向选定位置快速发射三次箭矢
    p1VolleyGap: 0.12,
    p1ChargeCd: 5, // v0.32：左键冲锋冷却 3s → 5s
    p1SwapCdMul: 0.5, // 易位冷却减半
    p1RainDelay: 1, // 统治附加：箭雨延迟 1s 落地
    p1RainDmg: 50, // v0.33：箭雨 30 → 50 伤
    p1RainRadius: 60, // 箭雨落点的伤害半径
    p1DominateCd: 25, // v0.33：统治冷却 25s
    // ---- 方针 2·兵贵神速 ----
    p2SpeedMul: 2, // 冲锋速度 +100%
    p2ChargeDmgMul: 0.25, // 冲锋伤害 -75%
    p2ChargeCdReduce: 1, // v0.33：冲锋冷却 -1s
    p2Slow: 0.2, // 命中造成 20% 减速
    p2SlowDur: 2,
    p2NextRangeBonus: 50, // 冲锋后攻击范围 +50px（只触发一次，攻击后消失）
    p2NextDmgBonus: 8, // v0.34：冲锋后攻击伤害 +4 → +8（只触发一次，攻击后消失）
    p2DominateSummon: 2, // 统治附加：立即召唤 2 名雄兵
    p2CapBonus: 2, // 上限临时 +2
    p2CapBonusDur: 10, // 上限提升最多持续 10s
    p2CapChargeCdReduce: 1, // v0.34：上限提升持续期间，冲锋冷却再 -1s
    p2DominateCd: 35, // v0.33：统治冷却 35s
    // ---- 方针 3·特立独行 ----
    p3Max: 1,
    p3Shield: 400,
    p3BuffMul: 1.5, // v0.33：体型 / 移速 +50%（攻击范围不再增加）
    p3DmgMul: 4, // v0.32：攻击力 +300%
    p3ConeAngle: Math.PI * 2 / 3, // 120° 扇形挥击
    p3ShieldReset: 20, // 每 20s 若护盾不满则重置
    p3GuardDmgMul: 3, // v0.33：护驾伤害 = 雄兵攻击伤害 ×3（方针 3 下 24×3 = 72）
    p3SmashRadius: 220, // 统治：长矛猛砸地面范围
    p3SmashDmg: 65, // v0.33：80 → 65 伤
    p3SmashAir: 1.2, // 击飞 1.2s
    p3DominateCd: 15, // v0.33：统治冷却 15s
    // ---- 方针 4·百折不挠 ----
    p4ChargeRadiusMul: 1.5, // 冲锋伤害判定范围 +50%
    p4ChargeDmgMul: 3, // v0.33：冲锋伤害 +200%
    p4ChargeCdReduce: 1, // v0.34：冲锋冷却 -1s（由 -2s 下调）
    p4Knock: 900, // 大幅击退
    p4BlockRadius: 20, // v0.33：持盾雄兵阻挡子弹的判定半径
    p4DominateCount: 6, // v0.33：统治召唤并排 6 名雄兵
    p4DominateDist: 800, // v0.33：向前笔直冲锋 800px 后消失
    p4DominateDmgMul: 2, // 该次冲锋伤害额外翻倍
    p4DominateCd: 15, // v0.33：统治冷却 15s
    // ---- 方针 5·亲力亲为 ----
    p5SoldierDmgMul: 0.75, // 雄兵伤害 -25%
    p5SoldierCdMul: 4 / 3, // 雄兵攻速 -25%
    p5SpearCd: 0.6, // 帝君每 0.6s 发射一根长矛
    p5SpearDmg: 15, // v0.33：长矛基础伤害 20 → 15
    p5SpearPerSoldier: 5, // v0.33：场上每有一名雄兵，长矛伤害 +5
    p5SpearSpeed: 900,
    p5SpearTravel: 900,
    p5BarrageCount: 64, // v0.33：统治 8s 内 64 根长矛
    p5BarrageDur: 8,
    p5BarrageSpread: 50, // 基准方向 50px 内随机偏移
    p5DominateCd: 25, // v0.33：统治冷却 25s
  },
};

export interface CharIntro {
  key: CharId;
  name: string;
  title: string;
  stats: { label: string; value: number }[];
  skills: string[];
  desc: string;
}

export const CHAR_INFO: Record<CharId, CharIntro> = {
  [CHAR.GUNNER]: {
    key: CHAR.GUNNER,
    name: '神枪手',
    title: '远程爆发 · 弹幕专家',
    stats: [
      { label: '攻击', value: 4 },
      { label: '机动', value: 3 },
      { label: '技能', value: 4 },
      { label: '生存', value: 4 },
    ],
    desc: '用会反弹的子弹封锁整个竞技场！',
    skills: [
      '【左键】弹射子弹：朝鼠标发射，撞墙无限反弹，累计飞行距离后爆炸；按住可连续发射',
      '【被动】底气：普攻子弹每次命中积攒 1 层底气，上限 16 层（弹幕风暴的追踪弹不计入）',
      '【空格】弹幕风暴：至少 8 层底气才能开启，消耗全部底气；8 层持续 2.4s，每多 1 层 +0.3s（16 层 4.8s）',
      '【风暴期左键】朝鼠标方向突进，鼠标越近突进距离越短',
    ],
  },
  [CHAR.WIND]: {
    key: CHAR.WIND,
    name: '风之女皇',
    title: '控场法师 · 风暴化身',
    stats: [
      { label: '攻击', value: 3 },
      { label: '机动', value: 4 },
      { label: '技能', value: 5 },
      { label: '生存', value: 3 },
    ],
    desc: '脱手积攒狂风，把敌人和弹幕一起卷进风暴漩涡！',
    skills: [
      '【左键·瞬发】狂风：点击立即释放，可长按连发；蓄力越满，伤害、射程与弹速越高；旋风存在期间冷却减半',
      '【右键·脱手积攒】原地积攒一发狂风（期间可自由移动、攻击），再次右键朝鼠标发射；蓄力越满威力与宽度越大',
      '【空格】风暴领域：投掷风球（可穿墙，但会被敌方旋风吸收），抵达后形成旋风并减速范围内的敌人',
      '【旋风】吸收途经的一切子弹，把伤害转化为持续伤害；吸入越多半径越大、减速越强，达到一定程度后强制敌人绕旋风旋转',
      '【引爆】满蓄狂风命中旋风时立即引爆，造成与剩余时间对应的爆炸，并把吸收的弹体反弹出去',
    ],
  },
  [CHAR.BOMBER]: {
    key: CHAR.BOMBER,
    name: '轰炸专家',
    title: '范围毁灭 · 制导轰炸',
    stats: [
      { label: '攻击', value: 4 },
      { label: '机动', value: 2 },
      { label: '技能', value: 5 },
      { label: '生存', value: 3 },
    ],
    desc: '制导导弹与定点轰炸，把战场夷为平地！',
    skills: [
      '【左键】制导：在视野内点击，锁定最近的敌人发射跟踪导弹；导弹可被敌方旋风吸收',
      '导弹直击并溅射，起步慢、逐渐加速，撞墙或撞人即爆炸',
      '【空格】不如直接炸翻天：打开大地图选点轰炸；预警后主炸落地，并向外圈追加多轮小轰炸与引燃地面',
      '【引线】导弹/轰炸/燃烧命中会叠加引线，叠满触发爆破，波及自身与周围单位并继续传染引线；每次爆破令后续小轰炸次数增加，场上仅剩一个敌人时每次直接触发两次',
      '【空格】技能冷却中仍可打开大地图：左键普通轰炸被禁用，但可右键锁定「最后狂欢」目标后按空格发射',
    ],
  },
  [CHAR.ARCANE]: {
    key: CHAR.ARCANE,
    name: '奥术天选者',
    title: '蓄力法师 · 灭世能量波',
    stats: [
      { label: '攻击', value: 4 },
      { label: '机动', value: 3 },
      { label: '技能', value: 5 },
      { label: '生存', value: 3 },
    ],
    desc: '原地蓄力登神，用扩散能量波审判整片战场！',
    skills: [
      '【左键】奥术排斥：在鼠标处预警后爆炸并推开敌人；命中敌人会减少奥术登神的冷却',
      '【空格】奥术登神：长时间蓄力，期间不可移动、免控、大幅减伤并持续回血，同时减速所有敌人',
      '蓄力期左键·奥术跃迁：前期可选定远距离落点，延迟后传送（无视墙体）',
      '蓄力完成：释放向外扩散的能量波，距离越近伤害越高，会被墙体截断',
      '【PVE 生效】奥术登神不再暴击，暴击率×0.5 + 暴击伤害×0.25 转为固定增伤；伤害 -30%，但不再受距离衰减影响',
    ],
  },
  [CHAR.BLADE]: {
    key: CHAR.BLADE,
    name: '利剑舞者',
    title: '近战刺客 · 剑势舞踏',
    stats: [
      { label: '攻击', value: 4 },
      { label: '机动', value: 3 },
      { label: '技能', value: 4 },
      { label: '生存', value: 5 },
    ],
    desc: '以招架积攒剑势，在华尔兹的剑光中收割敌人！',
    skills: [
      '【左键·招架】按住蓄力，松手获得短暂招架，大幅减免下一次受到的伤害；成功格挡后获得剑势，蓄力越满层数越多；剑势随时间自动恢复',
      '【右键·剑气】消耗剑势射出可穿透敌人的剑气，会被墙体挡下；命中敌人返还剑势',
      '【空格·利刃华尔兹】剑势足够时开启：获得护盾且无法移动，左键改为朝鼠标高速穿刺（可穿墙）；每次穿刺消耗剑势，耗尽或提前按空格结束',
      '穿刺击杀回复生命；击败任意敌人返还大量剑势，华尔兹中击杀还会立刻冲向下一个敌人',
    ],
  },
  [CHAR.WAR]: {
    key: CHAR.WAR,
    name: '战争机器',
    title: '火力压制 · 毁灭激光',
    stats: [
      { label: '攻击', value: 4 },
      { label: '机动', value: 2 },
      { label: '技能', value: 4 },
      { label: '生存', value: 4 },
    ],
    desc: '双手能量炮持续压制，蓄满过载后一炮贯穿全场！',
    skills: [
      '【左键】能量连射：按住持续发射能量弹，远距离伤害衰减，撞墙消散',
      '【被动·过载充能】左键造成的伤害等量转化为充能',
      '【被动·战地维修】一段时间未攻击也未受伤时，持续回复生命与充能，并加快技能冷却',
      '【右键·毁灭激光炮】消耗全部充能（有最低要求）发射穿透激光，中心全额、两侧减伤，会被墙体截断',
      '【空格·点按】向鼠标反方向后撤，并回复充能',
      '【空格·长按】进入歼灭姿态：启动即获得充能并持续蓄能，期间加速、减伤；状态结束后才进入冷却',
    ],
  },
  [CHAR.EMPEROR]: {
    key: CHAR.EMPEROR,
    name: '帝君',
    title: '乱世枭雄 · 雄兵号令',
    stats: [
      { label: '攻击', value: 2 },
      { label: '机动', value: 3 },
      { label: '技能', value: 5 },
      { label: '生存', value: 4 },
    ],
    desc: '坐镇乱世，以雄兵与护驾号令天下！',
    skills: [
      '【被动·百万雄兵】定期在自身附近召唤雄兵（有数量上限，开局即有基础数量）；雄兵驻守原地，只攻击进入范围的敌人；超出号令距离只是不再攻击，仍可被冲锋操控；不阻挡子弹、不受攻击',
      '【被动·护驾】每名在场雄兵提供护盾；护盾损失会消耗雄兵，新雄兵补充护盾；有雄兵在场时视野扩大',
      '【左键·冲锋】在施法范围内选定非墙终点，命令全体雄兵突进；可穿墙、彼此保持间距，会越过终点继续前冲撞到敌人，落点保持攻击距离',
      '【右键·易位】与选定雄兵互换位置，位移途中碰触敌人造成伤害（部分方针会改写此技能）',
      '【空格·独裁/统治】首次使用为独裁：从随机三条方针中选定一条（超时自动选择）；之后为统治：全场敌人受到当前生命一定比例的伤害并沉默，处于雄兵攻击范围内改为眩晕，并按方针追加效果',
      '【PVE 生效】统治不再造成全场伤害 / 沉默 / 眩晕，仅保留所选方针的特殊效果',
      '【方针·运筹帷幄】雄兵改为持弓远程齐射；冲锋改为向选定位置连续齐射箭矢；易位冷却减半；统治降下延迟箭雨',
      '【方针·兵贵神速】冲锋更快、伤害更低但附带减速；冲锋后的下一次攻击获得范围与伤害加成（只生效一次）；统治立即召唤雄兵并临时提升上限，期间冲锋冷却缩短',
      '【方针·特立独行】雄兵数量上限降为一名，但护盾、体型、移速与攻击力大幅提升，攻击改为扇形挥矛；右键改为护驾旋转长矛；统治为长矛砸地，击飞并聚拢敌人',
      '【方针·百折不挠】雄兵改为持盾、不攻击，但能拦截经过自身的敌方子弹；冲锋范围与伤害大幅提升并附带击退；统治召唤并排持盾雄兵直线冲锋',
      '【方针·亲力亲为】雄兵伤害与攻速下降；帝君亲自投矛，场上雄兵越多伤害越高；统治期间连续投出大量长矛',
    ],
  },
};

export const WALL_RECTS_FILL = 0x58607a;

/* ================= 游戏模式（v0.18） ================= */

export const MODE = {
  BRAWL: 'brawl',
  PAYLOAD: 'payload',
  TRAIN: 'train',
  PVE: 'pve',
} as const;
export type ModeId = (typeof MODE)[keyof typeof MODE];

export interface ModeIntro {
  key: ModeId;
  name: string;
  tag: string;
  desc: string;
  rules: string[];
  color: number;
  colorText: string;
}

export const MODE_INFO: Record<ModeId, ModeIntro> = {
  [MODE.BRAWL]: {
    key: MODE.BRAWL,
    name: '乱斗模式',
    tag: '6 人混战 · 各自为战',
    desc: '六名角色同场混战，没有队友，只有最后一个站着的人。',
    rules: [
      '你 + 五名人机，六种角色各一名，所有人互为敌人',
      '率先累计击杀 10 人即获胜',
      '阵亡 5 秒后在地图随机空地复活',
      '地图：四方庭院 / 双环回廊 / 斜影回廊 / 庭院长廊 随机',
    ],
    color: 0xf2c94c,
    colorText: '#f2c94c',
  },
  [MODE.PAYLOAD]: {
    key: MODE.PAYLOAD,
    name: '团队推车',
    tag: '3V3 · 进攻 vs 防守',
    desc: '三人小队护送船只 / 火车头沿轨道推进，防守方则要用人肉与火力把它拦下来。',
    rules: [
      '随机分配攻守阵营与地图（遗迹 / 珊瑚海）',
      '进攻方人数多于防守方才推得动，人数越多越快',
      '满速约 1:30 抵达，初始计时 2:00；占领 / 检查点各 +2:00',
      '珊瑚海每 30s 卷来全屏巨浪：击退并眩晕全场 2s',
      '车到终点 → 进攻方胜；时间耗尽 → 防守方胜',
    ],
    color: 0x6fc46c,
    colorText: '#8ce07f',
  },
  [MODE.TRAIN]: {
    key: MODE.TRAIN,
    name: '训练场',
    tag: '单人 · 伤害测试',
    desc: '四面外墙围出的演武场，中央立着一具打不坏、也不会还手的训练木偶。',
    rules: [
      '只有你与训练木偶，没有敌人，也不会阵亡结束',
      '木偶血量恒定、不移动、不受控制，任何伤害都会实时计入 DPS',
      'HUD 显示累计伤害 / 平均 DPS / 近 5 秒 DPS / 峰值 DPS',
      '用来展示角色技能、验证数值、练习连招与手感',
      '地图：试炼场（封闭外墙的小型演武场）',
    ],
    color: 0x8fd6ff,
    colorText: '#8fd6ff',
  },
  [MODE.PVE]: {
    key: MODE.PVE,
    name: '冒险模式',
    tag: 'PVE · 关卡推进',
    desc: '在一张关卡地图上自由选择关卡，清空所有敌人即可通关；阵亡即挑战失败。',
    rules: [
      '大地图上自由选择关卡，无需按顺序解锁',
      '每关由若干波次组成：小怪 / 精英 / BOSS 逐波登场',
      'PVE 不设复活：玩家阵亡即挑战失败',
      '清空最后一波敌人即通关，结算后可再次挑战',
      '装备与宠物将在后续版本接入',
    ],
    color: 0x57c8ff,
    colorText: '#7fd4ff',
  },
};

/**
 * 团队推车模式数值（v0.19）
 * 铁轨为折线，沿地图底 / 中 / 上三层蛇形绕行，全长 6470px（2400 地图下 6 个拐弯点，每段 ≥450px）。
 */
export const PAYLOAD = {
  /** 铁轨折线全长（与 maps.ts 的遗迹轨道一致） */
  pathTotal: 6470,
  /** 检查点距起点（铁轨中点；检查点重生室已上移至 (920,1200)，不再由房间位置反推） */
  checkpointDist: 3200,
  /** 火车头推进范围半径（v0.26：300 → 210，缩小 30%） */
  radius: 210,
  /** 满速（3 名进攻方推车）时的移动速度：全长 6470px / 45s ≈ 143.8px/s */
  speedFull: 6470 / 45,
  /** 初始推车时间（秒）（v0.27：180 → 120） */
  timeFirst: 120,
  /** 通过检查点后追加时间（秒） */
  timeExtra: 120,
  /** 火车头视觉尺寸（世界单位，等比 1.5×） */
  bodyW: 93,
  bodyH: 69,
};
