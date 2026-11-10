/** PVE 关卡表：大地图热点 + 波次配置（前两关「梦魇镇」「重生酒馆」已开放） */

/** 敌人分级：小怪 / 精英 / BOSS */
export type EnemyTier = 'mob' | 'elite' | 'boss';

/** 本关可出现的怪物种类 */
export type MonsterId =
  | 'ghost-gunner' | 'shadow-bull' | 'heart-beast'
  | 'west-demon' | 'west-angel';

/** 单个敌人的配置（怪物 + 分级） */
export interface PveEnemy {
  monster: MonsterId;
  tier: EnemyTier;
}

/** 一波敌人 */
export interface PveWave {
  /** 波次提示（显示在 HUD） */
  label: string;
  enemies: PveEnemy[];
}

/** 关卡定义：大地图热点 / 波次 */
export interface PveLevel {
  id: string;
  /** 关卡序号（第几关） */
  order: number;
  name: string;
  tag: string;
  desc: string;
  /** 难度 1~5，用于关卡地图上的星标 */
  difficulty: number;
  /** 在关卡大地图上的热点（图片归一化坐标 0~1） */
  hotspot: { nx: number; ny: number };
  /** 是否已开放；未开放点击提示“还在开发中” */
  open: boolean;
  waves: PveWave[];
  /** 装备掉落占位（P8 装备系统接入） */
  drops: string[];
}

export const TIER_INFO: Record<EnemyTier, { label: string; hpMul: number; speedMul: number }> = {
  mob: { label: '小怪', hpMul: 1, speedMul: 1 },
  elite: { label: '精英', hpMul: 1, speedMul: 1 },
  boss: { label: 'BOSS', hpMul: 1, speedMul: 1 },
};

const mob = (): PveEnemy => ({ monster: 'ghost-gunner', tier: 'mob' });
const elite = (): PveEnemy => ({ monster: 'shadow-bull', tier: 'elite' });
const boss = (): PveEnemy => ({ monster: 'heart-beast', tier: 'boss' });
const westBoss = (monster: 'west-demon' | 'west-angel'): PveEnemy => ({ monster, tier: 'boss' });

/** 生成 n 个同类小怪 */
const mobs = (n: number): PveEnemy[] => Array.from({ length: n }, mob);

/**
 * PVE 关卡表。
 * 大地图自由选关：节点位置即图片上的归一化热点坐标。
 * 目前开放前两关，其余关卡保持占位。
 */
export const PVE_LEVELS: PveLevel[] = [
  {
    id: 'lv1',
    order: 1,
    name: '梦魇镇',
    tag: '第一关 · 荒原小镇',
    desc: '荒原深处的废弃西部小镇，破旧木屋与歪斜招牌在风沙里吱呀作响。镇上的幽灵枪手仍在巡逻，深处还藏着更危险的东西。',
    difficulty: 1,
    hotspot: { nx: 0.17, ny: 0.28 },
    open: true,
    waves: [
      { label: '幽灵枪手 ×20', enemies: mobs(20) },
      {
        label: '幽灵枪手 ×10 + 暗影魔牛 ×2',
        enemies: [...mobs(10), elite(), elite()],
      },
      { label: 'BOSS · 心兽', enemies: [boss()] },
    ],
    drops: ['装备掉落：待开放'],
  },
  {
    id: 'lv2',
    order: 2,
    name: '“重生”酒馆',
    tag: '第二关 · 恶魔藏身处',
    desc: '荒原上孤立的西部酒馆，褪色的招牌在夜里摇晃，门窗漆黑。据说恶魔就藏在酒馆深处。',
    difficulty: 2,
    hotspot: { nx: 0.31, ny: 0.53 },
    open: true,
    waves: [
      {
        label: '暗影魔牛（精英）×10 + 幽灵枪手 ×30',
        enemies: [...Array.from({ length: 10 }, elite), ...mobs(30)],
      },
      {
        label: 'BOSS · 西部恶魔 + 西部天使',
        enemies: [westBoss('west-demon'), westBoss('west-angel')],
      },
    ],
    drops: ['装备掉落：待开放'],
  },
  {
    id: 'lv3',
    order: 3,
    name: '沙陵',
    tag: '第三关 · 黄沙墓园',
    desc: '歪扭的十字架墓碑与土坟堆埋在黄沙下，掘墓人仍在这片墓园里游荡。',
    difficulty: 3,
    hotspot: { nx: 0.42, ny: 0.33 },
    open: false,
    waves: [],
    drops: ['装备掉落：待开放'],
  },
  {
    id: 'lv4',
    order: 4,
    name: '末日游乐场',
    tag: '第四关 · 废弃乐园',
    desc: '沙漠里阴森废弃的游乐园，扭曲的旋转木马与破败摩天轮在风里缓缓转动。',
    difficulty: 4,
    hotspot: { nx: 0.55, ny: 0.68 },
    open: false,
    waves: [],
    drops: ['装备掉落：待开放'],
  },
  {
    id: 'lv5',
    order: 5,
    name: '恶魔之乡',
    tag: '第五关 · 深渊裂隙',
    desc: '荒原最深处，巨大黑雾包裹着黑洞裂隙。所有怪谈的源头都在这道裂口之下。',
    difficulty: 5,
    hotspot: { nx: 0.83, ny: 0.27 },
    open: false,
    waves: [],
    drops: ['装备掉落：待开放'],
  },
];

/** 按 id 取关卡，找不到时回落到第一关 */
export function getPveLevel(id?: string): PveLevel {
  return PVE_LEVELS.find((l) => l.id === id) ?? PVE_LEVELS[0];
}
