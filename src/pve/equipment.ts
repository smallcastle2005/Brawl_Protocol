import { CHAR } from '../config';
import type { CharId } from '../config';

/**
 * PVE 装备系统：每个角色一件专属装备，独立经验与等级。
 *
 * 数值全部集中在本文件，方便后续调整 / 添加新角色的装备。
 * 装备只在冒险模式生效（属性 / 机制 / PVE 专属技能）。
 */

/** PVE 基础暴击：所有角色通用 */
export const PVE_CRIT = {
  chance: 0.2,
  dmgMul: 1.5,
};

/** 装备属性加成（百分比，0.2 = +20%） */
export interface EquipAttrs {
  hpPct: number;
  dmgPct: number;
  critPct: number;
  critDmgPct: number;
  /** 受到伤害减免 */
  drPct: number;
  /** 左键攻击冷却缩短 */
  cdPct: number;
}

/** 装备效果条目（展示用） */
export interface EquipEffect {
  tag: string;
  name: string;
  desc: string;
}

export interface EquipmentDef {
  id: string;
  charId: CharId;
  name: string;
  quality: string;
  lore: string;
  /** 小图标贴图 key */
  iconKey: string;
  /** 展示大图贴图 key */
  artKey: string;
  maxLevel: number;
  /** 1 级基础加成 */
  attrs: EquipAttrs;
  /** 每级成长（线性叠加） */
  growth: EquipAttrs;
  effects: EquipEffect[];
}

/** 已实装的专属装备（未列出的角色视为「暂无专属装备」） */
export const EQUIPMENTS: EquipmentDef[] = [
  {
    id: 'western-memory',
    charId: CHAR.GUNNER,
    name: '西部回忆',
    quality: '传说 · 专属装备',
    lore: '枪身上每一道花纹，都是一次没有回头路的拔枪。',
    iconKey: 'equip-western-icon',
    artKey: 'equip-western-icon',
    maxLevel: 10,
    attrs: { hpPct: 0.2, dmgPct: 0.2, critPct: 0.1, critDmgPct: 0.5, drPct: 0, cdPct: 0 },
    growth: { hpPct: 0.02, dmgPct: 0.02, critPct: 0.005, critDmgPct: 0.03, drPct: 0, cdPct: 0 },
    effects: [
      {
        tag: '被动',
        name: '快速拔枪',
        desc: '神枪手左键子弹的弹道速度提升 100%。',
      },
      {
        tag: 'PVE 技能',
        name: '死神之眼',
        desc: '右键立即锁定鼠标附近一名敌人（无需蓄力），目标身上出现准心；锁定期间移速 -70%。'
          + '锁定中点按左键消耗 1 层底气，向目标极速射出一枚水滴狙击弹，必定暴击，'
          + '基础伤害 110，暴击伤害额外获得「暴击率 × 2」。再次点按右键取消锁定；'
          + '目标被墙体遮挡时自动解除锁定。',
      },
    ],
  },
  {
    id: 'ultimate-codex',
    charId: CHAR.ARCANE,
    name: '虚空秘典',
    quality: '传说 · 专属装备',
    lore: '书页翻动一次，虚空里就多出一颗不肯熄灭的星。',
    iconKey: 'equip-codex-icon',
    artKey: 'equip-codex-icon',
    maxLevel: 10,
    attrs: { hpPct: 0.2, dmgPct: 0.2, critPct: 0, critDmgPct: 0, drPct: 0.1, cdPct: 0 },
    growth: { hpPct: 0.02, dmgPct: 0.02, critPct: 0, critDmgPct: 0, drPct: 0.01, cdPct: 0 },
    effects: [
      {
        tag: '被动',
        name: '蓄能',
        desc: '获得 0~100 能量条：左键命中敌人 +10 能量；「奥术登神」蓄力期间持续恢复能量。'
          + '能量达到 100 的瞬间获得持续 30s 的增益：暴击率 +50%、暴击伤害 +50%'
          + '（能量后续被消耗也不会移除该增益）。',
      },
      {
        tag: 'PVE 技能',
        name: '奥术轰击',
        desc: '长按右键持续消耗能量（每秒 25 点，4s 耗尽 100），并在自身周围放置能量球；'
          + '每消耗 10 点能量放置一个。能量球 0.2s 后朝放置时的鼠标方向射出一道'
          + '最长 1500px、无法穿墙的紫色激光，持续 1s，每 0.5s 造成 150 伤害。',
      },
      {
        tag: 'PVE 特性',
        name: '虚空增幅',
        desc: '冒险模式中「奥术登神」不再暴击，暴击率×0.5 + 暴击伤害×0.25 转为固定增伤；'
          + '伤害 -30%，但也不再受距离衰减影响。',
      },
    ],
  },
  {
    id: 'wind-regret',
    charId: CHAR.WIND,
    name: '风的遗憾',
    quality: '传说 · 专属装备',
    lore: '她握住的从来不是风，而是风离开时留下的那道缝隙。',
    iconKey: 'equip-wind-icon',
    artKey: 'equip-wind-icon',
    maxLevel: 10,
    attrs: { hpPct: 0.2, dmgPct: 0.2, critPct: 0, critDmgPct: 0, drPct: 0.1, cdPct: 0 },
    growth: { hpPct: 0.02, dmgPct: 0.02, critPct: 0, critDmgPct: 0, drPct: 0.01, cdPct: 0 },
    effects: [
      {
        tag: '被动',
        name: '和风守护',
        desc: '风之女皇周围形成半径约 150px 的风场。风场内的所有友军移速 +8%；'
          + '所有进入风场的子弹移速 -50%，离开风场时立即失效。',
      },
      {
        tag: 'PVE 技能',
        name: '天降甘霖',
        desc: '特殊技能产生的旋风内，所有友军每秒回复等同于当前旋风伤害 30% 的生命值。'
          + '右键引爆旋风时，为所有仍处于旋风中的友军回复旋风剩余伤害等量的生命值，'
          + '并提供瞬间 100% 移速加成，在 1s 内衰减。',
      },
    ],
  },
  {
    id: 'bomber-finale',
    charId: CHAR.BOMBER,
    name: '超究极无敌毁灭疯狂飞鹰导弹发射装置',
    quality: '传说 · 专属装备',
    lore: '它不负责瞄准，只负责让天空记住这一声巨响。',
    iconKey: 'equip-bomber-icon',
    artKey: 'equip-bomber-icon',
    maxLevel: 10,
    attrs: { hpPct: 0.1, dmgPct: 0.2, critPct: 0, critDmgPct: 0.5, drPct: 0, cdPct: 0.25 },
    growth: { hpPct: 0.01, dmgPct: 0.02, critPct: 0, critDmgPct: 0.03, drPct: 0, cdPct: 0.02 },
    effects: [
      {
        tag: '被动',
        name: '点火！',
        desc: '每一次触发引线爆破都会为轰炸专家回复 4 点生命值、缩短特殊技能 0.5s 冷却，并提高 1% 暴击率；'
          + '当暴击率达到 100% 后，转而提供 2% 暴击伤害，持续至关卡结束。',
      },
      {
        tag: 'PVE 技能',
        name: '最后狂欢！',
        desc: '特殊技能在小地图上左键 / 右键点击单个目标，确认锁定后再次按空格即可发射终极导弹。'
          + '导弹将在 3s 延迟后连续发射 10 枚轰击目标，每枚导弹造成总伤害的 1/10'
          + '（总伤害 = 20 × 当前小轰炸数量）；每枚伤害必定暴击，暴击伤害为'
          + '当前暴击率 × 2 + 当前暴击伤害。该技能单场关卡仅能使用一次。',
      },
    ],
  },
  {
    id: 'overload-chip',
    charId: CHAR.WAR,
    name: '超负荷芯片',
    quality: '传说 · 专属装备',
    lore: '它不是为了让机器更强，而是为了让它忘记「上限」这个词。',
    iconKey: 'equip-war-icon',
    artKey: 'equip-war-icon',
    maxLevel: 10,
    attrs: { hpPct: 0.2, dmgPct: 0.2, critPct: 0.2, critDmgPct: 0, drPct: 0, cdPct: 0 },
    growth: { hpPct: 0.02, dmgPct: 0.02, critPct: 0.01, critDmgPct: 0, drPct: 0, cdPct: 0 },
    effects: [
      {
        tag: '被动',
        name: '核心超载',
        desc: '充能上限提升至 500，自身每秒自动获得 40 充能。'
          + '毁灭激光炮单次最多消耗 100 充能，超过 100 的部分不再提升伤害与激光宽度。',
      },
      {
        tag: 'PVE 技能',
        name: '覆盖协议',
        desc: '空格替换「歼灭形态」：按下空格在常规形态与火力压制形态之间切换，无冷却；'
          + '每次切换耗时 1.5s，切换期间无法攻击。'
          + '火力压制形态：移速 -30%、暴击伤害 +50%；'
          + '左键能量弹改为左右交替连发，发射间隔 0.06s（与右键激光互斥）；'
          + '右键毁灭激光炮改为长按持续激光，每 0.01s 对敌人造成 10 伤害、每秒消耗 250 充能，'
          + '激光宽度等同毁灭激光炮 100 充能时的宽度。',
      },
    ],
  },
];

export const EQUIP_BY_CHAR: Partial<Record<CharId, EquipmentDef>> = Object.fromEntries(
  EQUIPMENTS.map((e) => [e.charId, e]),
) as Partial<Record<CharId, EquipmentDef>>;

/** 升到下一级所需经验 */
export function equipXpToNext(level: number): number {
  return 80 + (level - 1) * 40;
}

export interface EquipState {
  /** 当前等级累计总经验 */
  totalXp: number;
  level: number;
  /** 当前等级内已获得经验 */
  xp: number;
  /** 当前等级升到下一级所需经验 */
  need: number;
  /** 当前等级进度 0~1 */
  progress: number;
  maxed: boolean;
}

/* ---------------- 本地存档（localStorage） ---------------- */

const STORAGE_KEY = 'pixel-brawl.equipment.v1';

type EquipSave = Record<string, { xp: number }>;

function readSave(): EquipSave {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as EquipSave;
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function writeSave(data: EquipSave) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 隐私模式 / 禁用存储时静默失败，不影响对局
  }
}

export function getEquipXp(def: EquipmentDef): number {
  return readSave()[def.id]?.xp ?? 0;
}

export function getEquipState(def: EquipmentDef): EquipState {
  const totalXp = getEquipXp(def);
  let level = 1;
  let left = totalXp;
  let need = equipXpToNext(level);
  while (level < def.maxLevel && left >= need) {
    left -= need;
    level++;
    need = equipXpToNext(level);
  }
  const maxed = level >= def.maxLevel;
  return {
    totalXp,
    level,
    xp: left,
    need,
    progress: maxed ? 1 : Math.min(1, left / need),
    maxed,
  };
}

/** 增加装备经验；返回增加前后的状态（未拥有该装备时返回 null） */
export function addEquipXp(
  charId: CharId,
  gain: number,
): { def: EquipmentDef; before: EquipState; after: EquipState; gain: number } | null {
  const def = EQUIP_BY_CHAR[charId];
  if (!def || gain <= 0) return null;
  const before = getEquipState(def);
  if (before.maxed) return { def, before, after: before, gain: 0 };
  const data = readSave();
  data[def.id] = { xp: before.totalXp + gain };
  writeSave(data);
  return { def, before, after: getEquipState(def), gain };
}

/** 指定等级下的属性加成 */
export function equipAttrsAt(def: EquipmentDef, level: number): EquipAttrs {
  const n = Math.max(0, level - 1);
  return {
    hpPct: def.attrs.hpPct + def.growth.hpPct * n,
    dmgPct: def.attrs.dmgPct + def.growth.dmgPct * n,
    critPct: def.attrs.critPct + def.growth.critPct * n,
    critDmgPct: def.attrs.critDmgPct + def.growth.critDmgPct * n,
    drPct: def.attrs.drPct + def.growth.drPct * n,
    cdPct: def.attrs.cdPct + def.growth.cdPct * n,
  };
}

/** 当前角色的装备加成（含等级成长）；无装备返回 null */
export function getEquipBonus(charId: CharId): { def: EquipmentDef; level: number; attrs: EquipAttrs } | null {
  const def = EQUIP_BY_CHAR[charId];
  if (!def) return null;
  const state = getEquipState(def);
  return { def, level: state.level, attrs: equipAttrsAt(def, state.level) };
}

/** 冒险结算的装备经验（levelOrder 从 1 开始） */
export function pveXpReward(levelOrder: number, win: boolean): number {
  const base = 40 + Math.max(0, levelOrder) * 20;
  return win ? base : Math.round(base * 0.3);
}
