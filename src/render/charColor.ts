import { CHAR, CharId } from '../config';

/** 角色主题色：血条、小地图、死亡粒子共用 */
export const CHAR_COLOR: Record<CharId, number> = {
  [CHAR.GUNNER]: 0xd64545,
  [CHAR.WIND]: 0x3fbfc8,
  [CHAR.BOMBER]: 0xe07b39,
  [CHAR.ARCANE]: 0x9b5cff,
  [CHAR.BLADE]: 0x9fd8ff,
  [CHAR.WAR]: 0xd63a3a,
  [CHAR.EMPEROR]: 0xe8b93c,
};
