import Phaser from 'phaser';
import { makeTex } from './pixel';

/* ---------------- 神枪手 Gunner：西部牛仔（32×36 画布 / 深色描边 / 双行帽檐 / 红围巾 / 皮革背心 / 金扣） ---------------- */
const GPAL: Record<string, number> = {
  O: 0x1e1409,
  H: 0xa9713f, L: 0xd9a869, h: 0x6f4520,
  S: 0xf4c89a, s: 0xd1966c, E: 0x20242e,
  R: 0xd64545, r: 0xa12f2f,
  C: 0x6f4a2a, c: 0x4a3018, W: 0xf4efe2, w: 0xcfc7b4,
  Y: 0xf2c94c, B: 0x4a6891, b: 0x334a6b, K: 0x23252e, G: 0x9aa7bd,
};

/** 三帧共用上半身（32×36）：帽冠 + 双行帽檐 + 脸 + 红围巾 */
const GUNNER_TOP = [
  '..........OOOOOOOOOOOO..........',
  '.........OHHHHHHHHHHHHO.........',
  '.......OHHHHLLHHHHLLLLHHO.......',
  '.......OHHHHLLHHHHLLLLHHO.......',
  '.......OhYYYYYYYYYYYYYYhO.......',
  '.....OhHHHHHHHHHHHHHHHHHHhO.....',
  '...OhhhhhhhhhhhhhhhhhhhhhhhhO...',
  '.......OssSSSSSSSSSSSSssO.......',
  '.......OssSSKKSSSSKKSSssO.......',
  '.......OssSSEESSSSEESSssO.......',
  '.......OssSSSSSSSSSSSSssO.......',
  '.......OssSSSSSssSSSSSssO.......',
  '.......OsSSSSSSssSSSSSSsO.......',
  '.......OsSSSSSSSSSSSSSSsO.......',
  '........OsSSSSSSSSSSSsO.........',
  '.......ORRRRRRRRRRRRRRRRO.......',
  '......ORRRRrRRRRRRRRrRRRRO......',
  '.....ORRRrRRRRRRRRRRRRrRRRO.....',
];

/** 皮背心 + 白衬衫 + 金扣 + 围巾垂坠 */
const GUNNER_TORSO = [
  '.....OCCCCcWWWWRRWWWWcCCCCO.....',
  '....OcCCCCWWWWWRRWWWWWCCCCcO....',
  '....OcCCCwWYWWWRRWWYWWwCCCcO....',
  '....OcCCCwWWWWWRRWWWWWwCCCcO....',
  '....OcCCCwWYWWWRRWWYWWwCCCcO....',
  '....OSCCCwWWWWWrrWWWWWwCCCSO....',
  '....OSCCWWWWWWWWWWWWWWWWCCSO....',
  '.....OcCWWWWWWWWWWWWWWWWCcO.....',
  '......OcWWWWWWWWWWWWWWWWcO......',
];

const GUNNER_BELT = '.....OccccYYYYYYYYYYYYccccO.....';

const GUNNER_LEG_IDLE = [
  '.......OBBBBBBBBBBBBBBBBO.......',
  '.......OBBBBBBB..BBBBBBBO.......',
  '.......OBBBBBBB..BBBBBBBO.......',
  '.......Obbbbbbb..bbbbbbbO.......',
  '.......Obbbbbbb..bbbbbbbO.......',
  '.......OKKKKKKK..KKKKKKKO.......',
  '.......OKKKKKKK..KKKKKKKO.......',
  '......OKKKKKKKK.KKKKKKKKO.......',
];

const GUNNER_LEG_W1 = [
  '.......OBBBBBBBBBBBBBBBBO.......',
  '.......OBBBBBB....BBBBBBO.......',
  '.......OBBBBBB....BBBBBBO.......',
  '.......Obbbbbb....bbbbbbO.......',
  '.......Obbbbbb....bbbbbbO.......',
  '.......OKKKKKK....KKKKKKO.......',
  '.......OKKKKKK....KKKKKKO.......',
  '.......OKKKKKKK..KKKKKKKO.......',
];

const GUNNER_LEG_W2 = [
  '........OBBBBBBBBBBBBBBO........',
  '........OBBBBBB..BBBBBBO........',
  '........OBBBBBB..BBBBBBO........',
  '........Obbbbbb..bbbbbbO........',
  '........Obbbbbb..bbbbbbO........',
  '........OKKKKKK..KKKKKKO........',
  '........OKKKKKK..KKKKKKO........',
  '.......OKKKKKKK..KKKKKKKO.......',
];

const GUNNER_IDLE = [...GUNNER_TOP, ...GUNNER_TORSO, GUNNER_BELT, ...GUNNER_LEG_IDLE];
const GUNNER_W1 = [...GUNNER_TOP, ...GUNNER_TORSO, GUNNER_BELT, ...GUNNER_LEG_W1];
const GUNNER_W2 = [...GUNNER_TOP, ...GUNNER_TORSO, GUNNER_BELT, ...GUNNER_LEG_W2];

/* ---------------- 风之女皇 Wind：青绿长裙风暴女皇（32×36 大头圆身 / 金冠 + 长发 + 白领口 + 裙摆） ---------------- */
const WPAL: Record<string, number> = {
  O: 0x1e1409,
  K: 0xf2c94c, k: 0xb8862b, J: 0x59d3e3,
  H: 0x9be8d8, h: 0x5fbfae,
  S: 0xfbd8b8, s: 0xe2b295, P: 0xd98c8c, E: 0x1c2440,
  D: 0x3fbfc8, d: 0x2a8f99,
  W: 0xf4fbff, w: 0xd8e9ee, F: 0x1f6a73,
};

const WIND_IDLE = [
  '..........K..KKKKKK..K..........',
  '........kKKKKKKKKKKKKKKk........',
  '......kKKKKKKKKJJKKKKKKKKk......',
  '......OKKKKKKKKKKKKKKKKKKO......',
  '......OhHHHHHHHHHHHHHHHHhO......',
  '......OhHHHHHHHHHHHHHHHHhO......',
  '......OhHSSSSSSSSSSSSSSHhO......',
  '......OhHSSEEESSSSEEESSHhO......',
  '......OhHSSEEESSSSEEESSHhO......',
  '......OhHSSssSSSSSSssSSHhO......',
  '......OhHSSSSSSPPSSSSSSHhO......',
  '......OhHSSSSSSSSSSSSSSHhO......',
  '......OhHhSSSSSSSSSSSShHhO......',
  '......OhHhSSSSSSSSSSSShHhO......',
  '.......OhHhssSSSSSSsshHhO.......',
  '.........OhhssSSSSsshhO.........',
  '............OsSSSSsO............',
  '.......OddDDDDDDDDDDDDddO.......',
  '.....OdDDDDDDDDDDDDDDDDDDdO.....',
  '.....OdDDDDWWWWWWWWWWDDDDdO.....',
  '.....OdDDDWWDDDDDDDDWWDDDdO.....',
  '.....OdDDDDDDDDDDDDDDDDDDdO.....',
  '.....OdDDDDDDDJJJJDDDDDDDdO.....',
  '......OdDDDDDDDDDDDDDDDDdO......',
  '......ODDddddddddddddddDDO......',
  '.......ODDDDDDDDDDDDDDDDO.......',
  '.........OKKKKKKKKKKKKO.........',
  '.........OddddddddddddO.........',
  '........OWWWWWW..WWWWWWO........',
  '........OWWWWWW..WWWWWWO........',
  '........OWWWWWW..WWWWWWO........',
  '........OWWWWWW..WWWWWWO........',
  '........OFFFFFF..FFFFFFO........',
  '........OFFFFFF..FFFFFFO........',
  '........OFFFFFF..FFFFFFO........',
  '........OFFFFFF..FFFFFFO........',
];

const WIND_W1 = [
  '..........K..KKKKKK..K..........',
  '........kKKKKKKKKKKKKKKk........',
  '......kKKKKKKKKJJKKKKKKKKk......',
  '......OKKKKKKKKKKKKKKKKKKO......',
  '......OhHHHHHHHHHHHHHHHHhO......',
  '......OhHHHHHHHHHHHHHHHHhO......',
  '......OhHSSSSSSSSSSSSSSHhO......',
  '......OhHSSEEESSSSEEESSHhO......',
  '......OhHSSEEESSSSEEESSHhO......',
  '......OhHSSssSSSSSSssSSHhO......',
  '......OhHSSSSSSPPSSSSSSHhO......',
  '......OhHSSSSSSSSSSSSSSHhO......',
  '......OhHhSSSSSSSSSSSShHhO......',
  '......OhHhSSSSSSSSSSSShHhO......',
  '.......OhHhssSSSSSSsshHhO.......',
  '.........OhhssSSSSsshhO.........',
  '............OsSSSSsO............',
  '.......OddDDDDDDDDDDDDddO.......',
  '.....OdDDDDDDDDDDDDDDDDDDdO.....',
  '.....OdDDDDWWWWWWWWWWDDDDdO.....',
  '.....OdDDDWWDDDDDDDDWWDDDdO.....',
  '.....OdDDDDDDDDDDDDDDDDDDdO.....',
  '.....OdDDDDDDDJJJJDDDDDDDdO.....',
  '......OdDDDDDDDDDDDDDDDDdO......',
  '......ODDddddddddddddddDDO......',
  '.......ODDDDDDDDDDDDDDDDO.......',
  '.........OKKKKKKKKKKKKO.........',
  '.........OddddddddddddO.........',
  '.......OWWWWWW....WWWWWWO.......',
  '.......OWWWWWW....WWWWWWO.......',
  '.......OWWWWWW....WWWWWWO.......',
  '.......OWWWWWW....WWWWWWO.......',
  '.......OFFFFFF....FFFFFFO.......',
  '.......OFFFFFF....FFFFFFO.......',
  '.......OFFFFFF....FFFFFFO.......',
  '.......OFFFFFF....FFFFFFO.......',
];

const WIND_W2 = [
  '..........K..KKKKKK..K..........',
  '........kKKKKKKKKKKKKKKk........',
  '......kKKKKKKKKJJKKKKKKKKk......',
  '......OKKKKKKKKKKKKKKKKKKO......',
  '......OhHHHHHHHHHHHHHHHHhO......',
  '......OhHHHHHHHHHHHHHHHHhO......',
  '......OhHSSSSSSSSSSSSSSHhO......',
  '......OhHSSEEESSSSEEESSHhO......',
  '......OhHSSEEESSSSEEESSHhO......',
  '......OhHSSssSSSSSSssSSHhO......',
  '......OhHSSSSSSPPSSSSSSHhO......',
  '......OhHSSSSSSSSSSSSSSHhO......',
  '......OhHhSSSSSSSSSSSShHhO......',
  '......OhHhSSSSSSSSSSSShHhO......',
  '.......OhHhssSSSSSSsshHhO.......',
  '.........OhhssSSSSsshhO.........',
  '............OsSSSSsO............',
  '.......OddDDDDDDDDDDDDddO.......',
  '.....OdDDDDDDDDDDDDDDDDDDdO.....',
  '.....OdDDDDWWWWWWWWWWDDDDdO.....',
  '.....OdDDDWWDDDDDDDDWWDDDdO.....',
  '.....OdDDDDDDDDDDDDDDDDDDdO.....',
  '.....OdDDDDDDDJJJJDDDDDDDdO.....',
  '......OdDDDDDDDDDDDDDDDDdO......',
  '......ODDddddddddddddddDDO......',
  '.......ODDDDDDDDDDDDDDDDO.......',
  '.........OKKKKKKKKKKKKO.........',
  '.........OddddddddddddO.........',
  '.......OWWWWWWW..WWWWWWWO.......',
  '.......OWWWWWWW..WWWWWWWO.......',
  '.......OWWWWWWW..WWWWWWWO.......',
  '.......OWWWWWWW..WWWWWWWO.......',
  '.......OFFFFFFF..FFFFFFFO.......',
  '.......OFFFFFFF..FFFFFFFO.......',
  '.......OFFFFFFF..FFFFFFFO.......',
  '.......OFFFFFFF..FFFFFFFO.......',
];

/* ---------------- 轰炸专家 Bomber：护目镜工装炸弹人（32×36 大头圆身 / 飞行帽 / 双镜片护目镜 / 胸口指示灯） ---------------- */
const BPAL: Record<string, number> = {
  O: 0x1e1409,
  A: 0xe0834a, a: 0xb25d2a,
  Y: 0xf2c14c,
  G: 0x39405a, g: 0x8fd0e8,
  S: 0xf4c89a, s: 0xd1966c,
  K: 0x23252e,
};

const BOMBER_IDLE = [
  '..........OAAAAAAAAAAO..........',
  '........OAAAAAAAAAAAAAAO........',
  '......OAAAAAAAAAAAAAAAAAAO......',
  '......OAAAAAAAAAAAAAAAAAAO......',
  '......OAAAAYYYYYYYYYYAAAAO......',
  '......OaaaaaaaaaaaaaaaaaaO......',
  '......OASSSSSSSSSSSSSSSSAO......',
  '......OAGGggggGGGGggggGGAO......',
  '......OAGGggggGGGGggggGGAO......',
  '......OAGGGGGGGGGGGGGGGGAO......',
  '......OASSSSSSSSSSSSSSSSAO......',
  '......OASSSSSSSssSSSSSSSAO......',
  '......OASSSSSSSSSSSSSSSSAO......',
  '......OAssSSSSSSSSSSSSssAO......',
  '.......OAssSSSSSSSSSSssAO.......',
  '.........OAssSSSSSSssAO.........',
  '............OSSSSSSO............',
  '.......OaaAAAAAAAAAAAAaaO.......',
  '.....OaAAAAAAAAAAAAAAAAAAaO.....',
  '.....OaAAAAYYYYYYYYYYAAAAaO.....',
  '.....OaAAAYYAAAAAAAAYYAAAaO.....',
  '.....OaAAAAAAAAAAAAAAAAAAaO.....',
  '.....OaAAAAAAAggggAAAAAAAaO.....',
  '......OaAAAAAAAAAAAAAAAAaO......',
  '......OAAaaaaaaaaaaaaaaAAO......',
  '.......OAAAAAAAAAAAAAAAAO.......',
  '.........OKKKKKKKKKKKKO.........',
  '.........OaaaaaaaaaaaaO.........',
  '........OAAAAAA..AAAAAAO........',
  '........OAAAAAA..AAAAAAO........',
  '........OAAAAAA..AAAAAAO........',
  '........OAAAAAA..AAAAAAO........',
  '........OKKKKKK..KKKKKKO........',
  '........OKKKKKK..KKKKKKO........',
  '........OKKKKKK..KKKKKKO........',
  '........OKKKKKK..KKKKKKO........',
];

const BOMBER_W1 = [
  '..........OAAAAAAAAAAO..........',
  '........OAAAAAAAAAAAAAAO........',
  '......OAAAAAAAAAAAAAAAAAAO......',
  '......OAAAAAAAAAAAAAAAAAAO......',
  '......OAAAAYYYYYYYYYYAAAAO......',
  '......OaaaaaaaaaaaaaaaaaaO......',
  '......OASSSSSSSSSSSSSSSSAO......',
  '......OAGGggggGGGGggggGGAO......',
  '......OAGGggggGGGGggggGGAO......',
  '......OAGGGGGGGGGGGGGGGGAO......',
  '......OASSSSSSSSSSSSSSSSAO......',
  '......OASSSSSSSssSSSSSSSAO......',
  '......OASSSSSSSSSSSSSSSSAO......',
  '......OAssSSSSSSSSSSSSssAO......',
  '.......OAssSSSSSSSSSSssAO.......',
  '.........OAssSSSSSSssAO.........',
  '............OSSSSSSO............',
  '.......OaaAAAAAAAAAAAAaaO.......',
  '.....OaAAAAAAAAAAAAAAAAAAaO.....',
  '.....OaAAAAYYYYYYYYYYAAAAaO.....',
  '.....OaAAAYYAAAAAAAAYYAAAaO.....',
  '.....OaAAAAAAAAAAAAAAAAAAaO.....',
  '.....OaAAAAAAAggggAAAAAAAaO.....',
  '......OaAAAAAAAAAAAAAAAAaO......',
  '......OAAaaaaaaaaaaaaaaAAO......',
  '.......OAAAAAAAAAAAAAAAAO.......',
  '.........OKKKKKKKKKKKKO.........',
  '.........OaaaaaaaaaaaaO.........',
  '.......OAAAAAA....AAAAAAO.......',
  '.......OAAAAAA....AAAAAAO.......',
  '.......OAAAAAA....AAAAAAO.......',
  '.......OAAAAAA....AAAAAAO.......',
  '.......OKKKKKK....KKKKKKO.......',
  '.......OKKKKKK....KKKKKKO.......',
  '.......OKKKKKK....KKKKKKO.......',
  '.......OKKKKKK....KKKKKKO.......',
];

const BOMBER_W2 = [
  '..........OAAAAAAAAAAO..........',
  '........OAAAAAAAAAAAAAAO........',
  '......OAAAAAAAAAAAAAAAAAAO......',
  '......OAAAAAAAAAAAAAAAAAAO......',
  '......OAAAAYYYYYYYYYYAAAAO......',
  '......OaaaaaaaaaaaaaaaaaaO......',
  '......OASSSSSSSSSSSSSSSSAO......',
  '......OAGGggggGGGGggggGGAO......',
  '......OAGGggggGGGGggggGGAO......',
  '......OAGGGGGGGGGGGGGGGGAO......',
  '......OASSSSSSSSSSSSSSSSAO......',
  '......OASSSSSSSssSSSSSSSAO......',
  '......OASSSSSSSSSSSSSSSSAO......',
  '......OAssSSSSSSSSSSSSssAO......',
  '.......OAssSSSSSSSSSSssAO.......',
  '.........OAssSSSSSSssAO.........',
  '............OSSSSSSO............',
  '.......OaaAAAAAAAAAAAAaaO.......',
  '.....OaAAAAAAAAAAAAAAAAAAaO.....',
  '.....OaAAAAYYYYYYYYYYAAAAaO.....',
  '.....OaAAAYYAAAAAAAAYYAAAaO.....',
  '.....OaAAAAAAAAAAAAAAAAAAaO.....',
  '.....OaAAAAAAAggggAAAAAAAaO.....',
  '......OaAAAAAAAAAAAAAAAAaO......',
  '......OAAaaaaaaaaaaaaaaAAO......',
  '.......OAAAAAAAAAAAAAAAAO.......',
  '.........OKKKKKKKKKKKKO.........',
  '.........OaaaaaaaaaaaaO.........',
  '.......OAAAAAAA..AAAAAAAO.......',
  '.......OAAAAAAA..AAAAAAAO.......',
  '.......OAAAAAAA..AAAAAAAO.......',
  '.......OAAAAAAA..AAAAAAAO.......',
  '.......OKKKKKKK..KKKKKKKO.......',
  '.......OKKKKKKK..KKKKKKKO.......',
  '.......OKKKKKKK..KKKKKKKO.......',
  '.......OKKKKKKK..KKKKKKKO.......',
];

/* ---------------- 奥术天选者 Arcane：紫水晶兜帽法师（32×36 大头圆身 / 尖顶兜帽 / 胸口金色符文 / 金腰带与紫靴） ---------------- */
const ARCANE_PAL: Record<string, number> = { O: 0x1e1409, L: 0xe3d4ff, V: 0x9b5cff, v: 0x6636c4, S: 0xfbd8b8, s: 0xd1966c, E: 0x1c1440, G: 0xf0e6ff, F: 0x2b1a5e, Q: 0xf0c23a };

const ARCANE_IDLE = [
  '............OVVVVVVO............',
  '..........OVVVVVVVVVVO..........',
  '........OVVVVVVVVVVVVVVO........',
  '......OLVVVVVVVVVVVVVVVVLO......',
  '......OVvvvvvvvvvvvvvvvvVO......',
  '......OVvvvvvvvvvvvvvvvvVO......',
  '......OVvvvvvvvvvvvvvvvvVO......',
  '......OVVSSEEESSSSEEESSVVO......',
  '......OVVSSEEESSSSEEESSVVO......',
  '......OVVSSSSSSSSSSSSSSVVO......',
  '......OVVSSSSSSssSSSSSSVVO......',
  '......OVVSSSSSSSSSSSSSSVVO......',
  '......OVVSSSSSSSSSSSSSSVVO......',
  '......OVVssSSSSSSSSSSssVVO......',
  '.......OVvvvvvvvvvvvvvvVO.......',
  '.........OVvvvvvvvvvvVO.........',
  '............OVVVVVVO............',
  '.......OvvVVVVVVVVVVVVvvO.......',
  '.....OvVVVVVVVVVVVVVVVVVVvO.....',
  '.....OvVVVVvvvvvvvvvvVVVVvO.....',
  '.....OvVVVvvVVVVVVVVvvVVVvO.....',
  '.....OvVVVVVVVVVVVVVVVVVVvO.....',
  '.....OvVVVVVVVQQQQVVVVVVVvO.....',
  '......OvVVVVVVVVVVVVVVVVvO......',
  '......OVVvvvvvvvvvvvvvvVVO......',
  '.......OVVVVVVVVVVVVVVVVO.......',
  '.........OQQQQQQQQQQQQO.........',
  '.........OvvvvvvvvvvvvO.........',
  '........OFFFFFF..FFFFFFO........',
  '........OFFFFFF..FFFFFFO........',
  '........OFFFFFF..FFFFFFO........',
  '........OFFFFFF..FFFFFFO........',
  '........OVVVVVV..VVVVVVO........',
  '........OVVVVVV..VVVVVVO........',
  '........OVVVVVV..VVVVVVO........',
  '........OVVVVVV..VVVVVVO........',
];

const ARCANE_W1 = [
  '............OVVVVVVO............',
  '..........OVVVVVVVVVVO..........',
  '........OVVVVVVVVVVVVVVO........',
  '......OLVVVVVVVVVVVVVVVVLO......',
  '......OVvvvvvvvvvvvvvvvvVO......',
  '......OVvvvvvvvvvvvvvvvvVO......',
  '......OVvvvvvvvvvvvvvvvvVO......',
  '......OVVSSEEESSSSEEESSVVO......',
  '......OVVSSEEESSSSEEESSVVO......',
  '......OVVSSSSSSSSSSSSSSVVO......',
  '......OVVSSSSSSssSSSSSSVVO......',
  '......OVVSSSSSSSSSSSSSSVVO......',
  '......OVVSSSSSSSSSSSSSSVVO......',
  '......OVVssSSSSSSSSSSssVVO......',
  '.......OVvvvvvvvvvvvvvvVO.......',
  '.........OVvvvvvvvvvvVO.........',
  '............OVVVVVVO............',
  '.......OvvVVVVVVVVVVVVvvO.......',
  '.....OvVVVVVVVVVVVVVVVVVVvO.....',
  '.....OvVVVVvvvvvvvvvvVVVVvO.....',
  '.....OvVVVvvVVVVVVVVvvVVVvO.....',
  '.....OvVVVVVVVVVVVVVVVVVVvO.....',
  '.....OvVVVVVVVQQQQVVVVVVVvO.....',
  '......OvVVVVVVVVVVVVVVVVvO......',
  '......OVVvvvvvvvvvvvvvvVVO......',
  '.......OVVVVVVVVVVVVVVVVO.......',
  '.........OQQQQQQQQQQQQO.........',
  '.........OvvvvvvvvvvvvO.........',
  '.......OFFFFFF....FFFFFFO.......',
  '.......OFFFFFF....FFFFFFO.......',
  '.......OFFFFFF....FFFFFFO.......',
  '.......OFFFFFF....FFFFFFO.......',
  '.......OVVVVVV....VVVVVVO.......',
  '.......OVVVVVV....VVVVVVO.......',
  '.......OVVVVVV....VVVVVVO.......',
  '.......OVVVVVV....VVVVVVO.......',
];

const ARCANE_W2 = [
  '............OVVVVVVO............',
  '..........OVVVVVVVVVVO..........',
  '........OVVVVVVVVVVVVVVO........',
  '......OLVVVVVVVVVVVVVVVVLO......',
  '......OVvvvvvvvvvvvvvvvvVO......',
  '......OVvvvvvvvvvvvvvvvvVO......',
  '......OVvvvvvvvvvvvvvvvvVO......',
  '......OVVSSEEESSSSEEESSVVO......',
  '......OVVSSEEESSSSEEESSVVO......',
  '......OVVSSSSSSSSSSSSSSVVO......',
  '......OVVSSSSSSssSSSSSSVVO......',
  '......OVVSSSSSSSSSSSSSSVVO......',
  '......OVVSSSSSSSSSSSSSSVVO......',
  '......OVVssSSSSSSSSSSssVVO......',
  '.......OVvvvvvvvvvvvvvvVO.......',
  '.........OVvvvvvvvvvvVO.........',
  '............OVVVVVVO............',
  '.......OvvVVVVVVVVVVVVvvO.......',
  '.....OvVVVVVVVVVVVVVVVVVVvO.....',
  '.....OvVVVVvvvvvvvvvvVVVVvO.....',
  '.....OvVVVvvVVVVVVVVvvVVVvO.....',
  '.....OvVVVVVVVVVVVVVVVVVVvO.....',
  '.....OvVVVVVVVQQQQVVVVVVVvO.....',
  '......OvVVVVVVVVVVVVVVVVvO......',
  '......OVVvvvvvvvvvvvvvvVVO......',
  '.......OVVVVVVVVVVVVVVVVO.......',
  '.........OQQQQQQQQQQQQO.........',
  '.........OvvvvvvvvvvvvO.........',
  '.......OFFFFFFF..FFFFFFFO.......',
  '.......OFFFFFFF..FFFFFFFO.......',
  '.......OFFFFFFF..FFFFFFFO.......',
  '.......OFFFFFFF..FFFFFFFO.......',
  '.......OVVVVVVV..VVVVVVVO.......',
  '.......OVVVVVVV..VVVVVVVO.......',
  '.......OVVVVVVV..VVVVVVVO.......',
  '.......OVVVVVVV..VVVVVVVO.......',
];

/* ---------------- 利剑舞者 Blade：红发女性剑士（32×36 大头圆身 / 金冠带 / 白色轻甲 / 金纹胸甲 / 深色长靴） ---------------- */
const BLADE_PAL: Record<string, number> = { O: 0x1e1409, R: 0xd64545, r: 0x9c2b2b, L: 0xff8f8f, W: 0xeaf2ff, w: 0xb9c8de, G: 0xf2c94c, Y: 0xffe07a, S: 0xfbd8b8, s: 0xe2b295, E: 0x1c2440, P: 0xd98c8c, K: 0x23252e };

const BLADE_IDLE = [
  '..........ORRRRRRRRRRO..........',
  '........ORRRRRRRRRRRRRRO........',
  '......ORRRRRRRRRRRRRRRRRRO......',
  '......ORRLLLLRRRRRRLLLLRRO......',
  '......OGGGGGGGGGGGGGGGGGGO......',
  '.......ORRSSSSSSSSSSSSRRO.......',
  '.......ORRSSSSSSSSSSSSRRO.......',
  '......ORRSSEEESSSSEEESSRRO......',
  '......ORRSSEEESSSSEEESSRRO......',
  '......ORRSSssSSSSSSssSSRRO......',
  '.......ORRSSSSSPPSSSSSRRO.......',
  '.......ORRSSSSSSSSSSSSRRO.......',
  '.......ORRSSSSSSSSSSSSRRO.......',
  '.......ORRSSSSSSSSSSSSRRO.......',
  '.......ORRsSSSSSSSSSSsRRO.......',
  '.........ORsSSSSSSSSsRO.........',
  '............OSSSSSsO............',
  '.......OwwWWWWWWWWWWWWwwO.......',
  '.....OwWWWWWWWWWWWWWWWWWWwO.....',
  '.....OwWWWWGGGGGGGGGGWWWWwO.....',
  '.....OwWWWGGWWWWWWWWGGWWWwO.....',
  '.....OwWWWWWWWWWWWWWWWWWWwO.....',
  '.....OwWWWWWWWYYYYWWWWWWWwO.....',
  '......OwWWWWWWWWWWWWWWWWwO......',
  '......OWWwwwwwwwwwwwwwwWWO......',
  '.......OWWWWWWWWWWWWWWWWO.......',
  '.........OGGGGGGGGGGGGO.........',
  '.........OwwwwwwwwwwwwO.........',
  '........OWWWWWW..WWWWWWO........',
  '........OWWWWWW..WWWWWWO........',
  '........OWWWWWW..WWWWWWO........',
  '........OWWWWWW..WWWWWWO........',
  '........OKKKKKK..KKKKKKO........',
  '........OKKKKKK..KKKKKKO........',
  '........OKKKKKK..KKKKKKO........',
  '........OKKKKKK..KKKKKKO........',
];

const BLADE_W1 = [
  '..........ORRRRRRRRRRO..........',
  '........ORRRRRRRRRRRRRRO........',
  '......ORRRRRRRRRRRRRRRRRRO......',
  '......ORRLLLLRRRRRRLLLLRRO......',
  '......OGGGGGGGGGGGGGGGGGGO......',
  '.......ORRSSSSSSSSSSSSRRO.......',
  '.......ORRSSSSSSSSSSSSRRO.......',
  '......ORRSSEEESSSSEEESSRRO......',
  '......ORRSSEEESSSSEEESSRRO......',
  '......ORRSSssSSSSSSssSSRRO......',
  '.......ORRSSSSSPPSSSSSRRO.......',
  '.......ORRSSSSSSSSSSSSRRO.......',
  '.......ORRSSSSSSSSSSSSRRO.......',
  '.......ORRSSSSSSSSSSSSRRO.......',
  '.......ORRsSSSSSSSSSSsRRO.......',
  '.........ORsSSSSSSSSsRO.........',
  '............OSSSSSsO............',
  '.......OwwWWWWWWWWWWWWwwO.......',
  '.....OwWWWWWWWWWWWWWWWWWWwO.....',
  '.....OwWWWWGGGGGGGGGGWWWWwO.....',
  '.....OwWWWGGWWWWWWWWGGWWWwO.....',
  '.....OwWWWWWWWWWWWWWWWWWWwO.....',
  '.....OwWWWWWWWYYYYWWWWWWWwO.....',
  '......OwWWWWWWWWWWWWWWWWwO......',
  '......OWWwwwwwwwwwwwwwwWWO......',
  '.......OWWWWWWWWWWWWWWWWO.......',
  '.........OGGGGGGGGGGGGO.........',
  '.........OwwwwwwwwwwwwO.........',
  '.......OWWWWWW....WWWWWWO.......',
  '.......OWWWWWW....WWWWWWO.......',
  '.......OWWWWWW....WWWWWWO.......',
  '.......OWWWWWW....WWWWWWO.......',
  '.......OKKKKKK....KKKKKKO.......',
  '.......OKKKKKK....KKKKKKO.......',
  '.......OKKKKKK....KKKKKKO.......',
  '.......OKKKKKK....KKKKKKO.......',
];

const BLADE_W2 = [
  '..........ORRRRRRRRRRO..........',
  '........ORRRRRRRRRRRRRRO........',
  '......ORRRRRRRRRRRRRRRRRRO......',
  '......ORRLLLLRRRRRRLLLLRRO......',
  '......OGGGGGGGGGGGGGGGGGGO......',
  '.......ORRSSSSSSSSSSSSRRO.......',
  '.......ORRSSSSSSSSSSSSRRO.......',
  '......ORRSSEEESSSSEEESSRRO......',
  '......ORRSSEEESSSSEEESSRRO......',
  '......ORRSSssSSSSSSssSSRRO......',
  '.......ORRSSSSSPPSSSSSRRO.......',
  '.......ORRSSSSSSSSSSSSRRO.......',
  '.......ORRSSSSSSSSSSSSRRO.......',
  '.......ORRSSSSSSSSSSSSRRO.......',
  '.......ORRsSSSSSSSSSSsRRO.......',
  '.........ORsSSSSSSSSsRO.........',
  '............OSSSSSsO............',
  '.......OwwWWWWWWWWWWWWwwO.......',
  '.....OwWWWWWWWWWWWWWWWWWWwO.....',
  '.....OwWWWWGGGGGGGGGGWWWWwO.....',
  '.....OwWWWGGWWWWWWWWGGWWWwO.....',
  '.....OwWWWWWWWWWWWWWWWWWWwO.....',
  '.....OwWWWWWWWYYYYWWWWWWWwO.....',
  '......OwWWWWWWWWWWWWWWWWwO......',
  '......OWWwwwwwwwwwwwwwwWWO......',
  '.......OWWWWWWWWWWWWWWWWO.......',
  '.........OGGGGGGGGGGGGO.........',
  '.........OwwwwwwwwwwwwO.........',
  '.......OWWWWWWW..WWWWWWWO.......',
  '.......OWWWWWWW..WWWWWWWO.......',
  '.......OWWWWWWW..WWWWWWWO.......',
  '.......OWWWWWWW..WWWWWWWO.......',
  '.......OKKKKKKK..KKKKKKKO.......',
  '.......OKKKKKKK..KKKKKKKO.......',
  '.......OKKKKKKK..KKKKKKKO.......',
  '.......OKKKKKKK..KKKKKKKO.......',
];

/* ---------------- 战争机器 War：红蓝钢铁机甲（32×36 大头圆身 / 金色目镜 / 青色核心 / 厚重机甲腿） ---------------- */
const WAR_PAL: Record<string, number> = { X: 0x1a1c24, K: 0x2f3542, k: 0x4a5468, N: 0x2f6f9e, n: 0x1c4a6b, R: 0xd6423a, r: 0x8e2620, Y: 0xff9a3c, E: 0xffd75e, C: 0x66e6ff, W: 0xf5f9ff };

const WAR_IDLE = [
  '..........XKKKKKKKKKKX..........',
  '........XKKKKKKKKKKKKKKX........',
  '......XKKKKKKKKKKKKKKKKKKX......',
  '......XkkkkkkkkkkkkkkkkkkX......',
  '......XKKKKKKKKKKKKKKKKKKX......',
  '......XKKKKKKKKKKKKKKKKKKX......',
  '......XREEEEEEEEEEEEEEEERX......',
  '......XREEEEEEEEEEEEEEEERX......',
  '......XrrrrrrrrrrrrrrrrrrX......',
  '......XKKKKKKKKKKKKKKKKKKX......',
  '......XKKKKKKkkKKkkKKKKKKX......',
  '......XKKKKKKKKKKKKKKKKKKX......',
  '......XKKKKKKKKKKKKKKKKKKX......',
  '......XkkKKKKKKKKKKKKKKkkX......',
  '........XkkKKKKKKKKKKkkX........',
  '.........XkKKKKKKKKKKkX.........',
  '............XKKKKKKX............',
  '.......XrrRRRRRRRRRRRRrrX.......',
  '.....XrRRRRRRRRRRRRRRRRRRrX.....',
  '.....XrRRRRKKKKKKKKKKRRRRrX.....',
  '.....XrRRRKKRRRRRRRRKKRRRrX.....',
  '.....XrRRRRRRRRRRRRRRRRRRrX.....',
  '.....XrRRRRRRRCCCCRRRRRRRrX.....',
  '......XrRRRRRRRRRRRRRRRRrX......',
  '......XRRrrrrrrrrrrrrrrRRX......',
  '.......XRRRRRRRRRRRRRRRRX.......',
  '.........XYYYYYYYYYYYYX.........',
  '.........XrrrrrrrrrrrrX.........',
  '........XKKKKKK..KKKKKKX........',
  '........XKKKKKK..KKKKKKX........',
  '........XKKKKKK..KKKKKKX........',
  '........XKKKKKK..KKKKKKX........',
  '........Xkkkkkk..kkkkkkX........',
  '........Xkkkkkk..kkkkkkX........',
  '........Xkkkkkk..kkkkkkX........',
  '........Xkkkkkk..kkkkkkX........',
];

const WAR_W1 = [
  '..........XKKKKKKKKKKX..........',
  '........XKKKKKKKKKKKKKKX........',
  '......XKKKKKKKKKKKKKKKKKKX......',
  '......XkkkkkkkkkkkkkkkkkkX......',
  '......XKKKKKKKKKKKKKKKKKKX......',
  '......XKKKKKKKKKKKKKKKKKKX......',
  '......XREEEEEEEEEEEEEEEERX......',
  '......XREEEEEEEEEEEEEEEERX......',
  '......XrrrrrrrrrrrrrrrrrrX......',
  '......XKKKKKKKKKKKKKKKKKKX......',
  '......XKKKKKKkkKKkkKKKKKKX......',
  '......XKKKKKKKKKKKKKKKKKKX......',
  '......XKKKKKKKKKKKKKKKKKKX......',
  '......XkkKKKKKKKKKKKKKKkkX......',
  '........XkkKKKKKKKKKKkkX........',
  '.........XkKKKKKKKKKKkX.........',
  '............XKKKKKKX............',
  '.......XrrRRRRRRRRRRRRrrX.......',
  '.....XrRRRRRRRRRRRRRRRRRRrX.....',
  '.....XrRRRRKKKKKKKKKKRRRRrX.....',
  '.....XrRRRKKRRRRRRRRKKRRRrX.....',
  '.....XrRRRRRRRRRRRRRRRRRRrX.....',
  '.....XrRRRRRRRCCCCRRRRRRRrX.....',
  '......XrRRRRRRRRRRRRRRRRrX......',
  '......XRRrrrrrrrrrrrrrrRRX......',
  '.......XRRRRRRRRRRRRRRRRX.......',
  '.........XYYYYYYYYYYYYX.........',
  '.........XrrrrrrrrrrrrX.........',
  '.......XKKKKKK....KKKKKKX.......',
  '.......XKKKKKK....KKKKKKX.......',
  '.......XKKKKKK....KKKKKKX.......',
  '.......XKKKKKK....KKKKKKX.......',
  '.......Xkkkkkk....kkkkkkX.......',
  '.......Xkkkkkk....kkkkkkX.......',
  '.......Xkkkkkk....kkkkkkX.......',
  '.......Xkkkkkk....kkkkkkX.......',
];

const WAR_W2 = [
  '..........XKKKKKKKKKKX..........',
  '........XKKKKKKKKKKKKKKX........',
  '......XKKKKKKKKKKKKKKKKKKX......',
  '......XkkkkkkkkkkkkkkkkkkX......',
  '......XKKKKKKKKKKKKKKKKKKX......',
  '......XKKKKKKKKKKKKKKKKKKX......',
  '......XREEEEEEEEEEEEEEEERX......',
  '......XREEEEEEEEEEEEEEEERX......',
  '......XrrrrrrrrrrrrrrrrrrX......',
  '......XKKKKKKKKKKKKKKKKKKX......',
  '......XKKKKKKkkKKkkKKKKKKX......',
  '......XKKKKKKKKKKKKKKKKKKX......',
  '......XKKKKKKKKKKKKKKKKKKX......',
  '......XkkKKKKKKKKKKKKKKkkX......',
  '........XkkKKKKKKKKKKkkX........',
  '.........XkKKKKKKKKKKkX.........',
  '............XKKKKKKX............',
  '.......XrrRRRRRRRRRRRRrrX.......',
  '.....XrRRRRRRRRRRRRRRRRRRrX.....',
  '.....XrRRRRKKKKKKKKKKRRRRrX.....',
  '.....XrRRRKKRRRRRRRRKKRRRrX.....',
  '.....XrRRRRRRRRRRRRRRRRRRrX.....',
  '.....XrRRRRRRRCCCCRRRRRRRrX.....',
  '......XrRRRRRRRRRRRRRRRRrX......',
  '......XRRrrrrrrrrrrrrrrRRX......',
  '.......XRRRRRRRRRRRRRRRRX.......',
  '.........XYYYYYYYYYYYYX.........',
  '.........XrrrrrrrrrrrrX.........',
  '.......XKKKKKKK..KKKKKKKX.......',
  '.......XKKKKKKK..KKKKKKKX.......',
  '.......XKKKKKKK..KKKKKKKX.......',
  '.......XKKKKKKK..KKKKKKKX.......',
  '.......Xkkkkkkk..kkkkkkkX.......',
  '.......Xkkkkkkk..kkkkkkkX.......',
  '.......Xkkkkkkk..kkkkkkkX.......',
  '.......Xkkkkkkk..kkkkkkkX.......',
];

/* ---------------- 帝君 Emperor：乱世枭雄（32×36 大头圆身 / 冕冠 / 络腮胡 / 紫金王袍） ---------------- */
const EMPEROR_PAL: Record<string, number> = { O: 0x1e1409, K: 0x17151f, k: 0x3a3348, G: 0xf0c23a, g: 0x9c7315, S: 0xfbd8b8, s: 0xd1966c, E: 0x191423, D: 0x5a2340, d: 0x38142a, W: 0xfff0c8, R: 0xc0392b, B: 0x2a2233, b: 0x4a3a52, C: 0x7a2d4d, Q: 0x39a86b };

const EMPEROR_IDLE = [
  '..........OGGGGGGGGGGO..........',
  '........OGGGGGGGGGGGGGGO........',
  '......OgGGGGGGGGGGGGGGGGgO......',
  '......OgGRRRRRRRRRRRRRRGgO......',
  '......OKKKKKKKKKKKKKKKKKKO......',
  '.......OKKSSSSSSSSSSSSKKO.......',
  '.......OKKSSSSSSSSSSSSKKO.......',
  '......OKKSSEEESSSSEEESSKKO......',
  '......OKKSSEEESSSSEEESSKKO......',
  '.......OKKSSSSSSSSSSSSKKO.......',
  '.......OKKSSSSBBBBSSSSKKO.......',
  '.......OKKSSSSSBBSSSSSKKO.......',
  '.......OKKBBSSSSSSSSBBKKO.......',
  '.......OKKBBBBSSSSBBBBKKO.......',
  '.......OKbbBBBBBBBBBBbbKO.......',
  '.........OBBBBBbbBBBBBO.........',
  '............OSSSSSSO............',
  '.......OddDDDDDDDDDDDDddO.......',
  '.....OdDDDDDDDDDDDDDDDDDDdO.....',
  '.....OdDDDDGGGGGGGGGGDDDDdO.....',
  '.....OdDDDGGDDDDDDDDGGDDDdO.....',
  '.....OdDDDDDDDDDDDDDDDDDDdO.....',
  '.....OdDDDDDDDQQQQDDDDDDDdO.....',
  '......OdDDDDDDDDDDDDDDDDdO......',
  '......ODDddddddddddddddDDO......',
  '.......ODDDDDDDDDDDDDDDDO.......',
  '.........OGGGGGGGGGGGGO.........',
  '.........OddddddddddddO.........',
  '........OKKKKKK..KKKKKKO........',
  '........OKKKKKK..KKKKKKO........',
  '........OKKKKKK..KKKKKKO........',
  '........OKKKKKK..KKKKKKO........',
  '........OKKKKKK..KKKKKKO........',
  '........OKKKKKK..KKKKKKO........',
  '........OKKKKKK..KKKKKKO........',
  '........OKKKKKK..KKKKKKO........',
];

const EMPEROR_W1 = [
  '..........OGGGGGGGGGGO..........',
  '........OGGGGGGGGGGGGGGO........',
  '......OgGGGGGGGGGGGGGGGGgO......',
  '......OgGRRRRRRRRRRRRRRGgO......',
  '......OKKKKKKKKKKKKKKKKKKO......',
  '.......OKKSSSSSSSSSSSSKKO.......',
  '.......OKKSSSSSSSSSSSSKKO.......',
  '......OKKSSEEESSSSEEESSKKO......',
  '......OKKSSEEESSSSEEESSKKO......',
  '.......OKKSSSSSSSSSSSSKKO.......',
  '.......OKKSSSSBBBBSSSSKKO.......',
  '.......OKKSSSSSBBSSSSSKKO.......',
  '.......OKKBBSSSSSSSSBBKKO.......',
  '.......OKKBBBBSSSSBBBBKKO.......',
  '.......OKbbBBBBBBBBBBbbKO.......',
  '.........OBBBBBbbBBBBBO.........',
  '............OSSSSSSO............',
  '.......OddDDDDDDDDDDDDddO.......',
  '.....OdDDDDDDDDDDDDDDDDDDdO.....',
  '.....OdDDDDGGGGGGGGGGDDDDdO.....',
  '.....OdDDDGGDDDDDDDDGGDDDdO.....',
  '.....OdDDDDDDDDDDDDDDDDDDdO.....',
  '.....OdDDDDDDDQQQQDDDDDDDdO.....',
  '......OdDDDDDDDDDDDDDDDDdO......',
  '......ODDddddddddddddddDDO......',
  '.......ODDDDDDDDDDDDDDDDO.......',
  '.........OGGGGGGGGGGGGO.........',
  '.........OddddddddddddO.........',
  '.......OKKKKKK....KKKKKKO.......',
  '.......OKKKKKK....KKKKKKO.......',
  '.......OKKKKKK....KKKKKKO.......',
  '.......OKKKKKK....KKKKKKO.......',
  '.......OKKKKKK....KKKKKKO.......',
  '.......OKKKKKK....KKKKKKO.......',
  '.......OKKKKKK....KKKKKKO.......',
  '.......OKKKKKK....KKKKKKO.......',
];

const EMPEROR_W2 = [
  '..........OGGGGGGGGGGO..........',
  '........OGGGGGGGGGGGGGGO........',
  '......OgGGGGGGGGGGGGGGGGgO......',
  '......OgGRRRRRRRRRRRRRRGgO......',
  '......OKKKKKKKKKKKKKKKKKKO......',
  '.......OKKSSSSSSSSSSSSKKO.......',
  '.......OKKSSSSSSSSSSSSKKO.......',
  '......OKKSSEEESSSSEEESSKKO......',
  '......OKKSSEEESSSSEEESSKKO......',
  '.......OKKSSSSSSSSSSSSKKO.......',
  '.......OKKSSSSBBBBSSSSKKO.......',
  '.......OKKSSSSSBBSSSSSKKO.......',
  '.......OKKBBSSSSSSSSBBKKO.......',
  '.......OKKBBBBSSSSBBBBKKO.......',
  '.......OKbbBBBBBBBBBBbbKO.......',
  '.........OBBBBBbbBBBBBO.........',
  '............OSSSSSSO............',
  '.......OddDDDDDDDDDDDDddO.......',
  '.....OdDDDDDDDDDDDDDDDDDDdO.....',
  '.....OdDDDDGGGGGGGGGGDDDDdO.....',
  '.....OdDDDGGDDDDDDDDGGDDDdO.....',
  '.....OdDDDDDDDDDDDDDDDDDDdO.....',
  '.....OdDDDDDDDQQQQDDDDDDDdO.....',
  '......OdDDDDDDDDDDDDDDDDdO......',
  '......ODDddddddddddddddDDO......',
  '.......ODDDDDDDDDDDDDDDDO.......',
  '.........OGGGGGGGGGGGGO.........',
  '.........OddddddddddddO.........',
  '.......OKKKKKKK..KKKKKKKO.......',
  '.......OKKKKKKK..KKKKKKKO.......',
  '.......OKKKKKKK..KKKKKKKO.......',
  '.......OKKKKKKK..KKKKKKKO.......',
  '.......OKKKKKKK..KKKKKKKO.......',
  '.......OKKKKKKK..KKKKKKKO.......',
  '.......OKKKKKKK..KKKKKKKO.......',
  '.......OKKKKKKK..KKKKKKKO.......',
];


/* ---------------- 雄兵 Soldier：帝君麾下的兵马俑式执矛卫兵（陶土甲胄 + 红缨 + 金边） ---------------- */
const SPAL: Record<string, number> = {
  K: 0x2b2119, k: 0x6b4a2c, G: 0xd9b33a, S: 0xe6bd8e,
  E: 0x18120e, R: 0xc0392b, W: 0xd8deea, B: 0x4a3020,
  T: 0xa5663a, D: 0x7d4e2a,
};

/* 陶俑甲：头盔 + 红缨 + 金箍；胸甲为深浅陶土色分层，腰间金带 */
const SOLDIER_IDLE = [
  '................',
  '......RRRR......',
  '.....KKKKKK.....',
  '....KDGGGGDK....',
  '....SSSSSSSS....',
  '....SESSSSES....',
  '....SSSSSSSS....',
  '....SBBBBBBS....',
  '...KKTTTTTTKK...',
  '..KKTGGGGGGTKK..',
  '..KTTDDDDDDTTK..',
  '..KTTDDDDDDTTK..',
  '..KKTDDDDDDTKK..',
  '..KKGGGGGGGGKK..',
  '...KTTTTTTTTK...',
  '...BBB....BBB...',
  '...BBB....BBB...',
  '..KKKK....KKKK..',
];

const SOLDIER_W1 = [
  '................',
  '......RRRR......',
  '.....KKKKKK.....',
  '....KDGGGGDK....',
  '....SSSSSSSS....',
  '....SESSSSES....',
  '....SSSSSSSS....',
  '....SBBBBBBS....',
  '...KKTTTTTTKK...',
  '..KKTGGGGGGTKK..',
  '..KTTDDDDDDTTK..',
  '..KTTDDDDDDTTK..',
  '..KKTDDDDDDTKK..',
  '..KKGGGGGGGGKK..',
  '...KTTTTTTTTK...',
  '...BBB....BBB...',
  '..BBB......BBB..',
  '.KKKK......KKKK.',
];

const SOLDIER_W2 = [
  '................',
  '......RRRR......',
  '.....KKKKKK.....',
  '....KDGGGGDK....',
  '....SSSSSSSS....',
  '....SESSSSES....',
  '....SSSSSSSS....',
  '....SBBBBBBS....',
  '...KKTTTTTTKK...',
  '..KKTGGGGGGTKK..',
  '..KTTDDDDDDTTK..',
  '..KTTDDDDDDTTK..',
  '..KKTDDDDDDTKK..',
  '..KKGGGGGGGGKK..',
  '...KTTTTTTTTK...',
  '...BBB....BBB...',
  '....BBB..BBB....',
  '..KKKK....KKKK..',
];

/* ---------------- 方针 3·特立独行的精锐雄兵：紫金将袍 + 红翎 + 金甲（明显区别于普通雄兵） ---------------- */
const SPAL3: Record<string, number> = {
  K: 0x211a26, k: 0x3d3350, G: 0xf0c23a, S: 0xf4c89a,
  E: 0x18121e, R: 0xc0392b, P: 0x6b2f8a, Q: 0x39a86b, W: 0xfff0c8,
};

const SOLDIER_P3_IDLE = [
  '................',
  '......GGGG......',
  '.....GGGGGG.....',
  '....RGGGGGGR....',
  '....KKGGGGKK....',
  '...R..SSSS..R...',
  '....SSSSSSSS....',
  '....SESSSSES....',
  '....SSSSSSSS....',
  '...GGGGGGGGGG...',
  '..PPkGGGGGGkPP..',
  '..PPkGQGGGQkPP..',
  '..PPkGGGGGGkPP..',
  '...PPKKKKKKPP...',
  '...KKKKKKKKKK...',
  '...GGG....GGG...',
  '...GGG....GGG...',
  '..KKKK....KKKK..',
];

const SOLDIER_P3_W1 = [
  '................',
  '......GGGG......',
  '.....GGGGGG.....',
  '....RGGGGGGR....',
  '....KKGGGGKK....',
  '...R..SSSS..R...',
  '....SSSSSSSS....',
  '....SESSSSES....',
  '....SSSSSSSS....',
  '...GGGGGGGGGG...',
  '..PPkGGGGGGkPP..',
  '..PPkGQGGGQkPP..',
  '..PPkGGGGGGkPP..',
  '...PPKKKKKKPP...',
  '...KKKKKKKKKK...',
  '...GGG....GGG...',
  '..GGGG....GGGG..',
  '.KKKK......KKKK.',
];

const SOLDIER_P3_W2 = [
  '................',
  '......GGGG......',
  '.....GGGGGG.....',
  '....RGGGGGGR....',
  '....KKGGGGKK....',
  '...R..SSSS..R...',
  '....SSSSSSSS....',
  '....SESSSSES....',
  '....SSSSSSSS....',
  '...GGGGGGGGGG...',
  '..PPkGGGGGGkPP..',
  '..PPkGQGGGQkPP..',
  '..PPkGGGGGGkPP..',
  '...PPKKKKKKPP...',
  '...KKKKKKKKKK...',
  '...GGG....GGG...',
  '....GGG..GGG....',
  '..KKKK....KKKK..',
];

/* ---------------- 方针 4·百折不挠的持盾雄兵：重甲 + 蓝底金徽大盾 ---------------- */
const SPAL4: Record<string, number> = {
  K: 0x22262e, k: 0x4c5563, G: 0xd9b33a, S: 0xb5773f,
  E: 0x161a20, W: 0xe8eef8, B: 0x35557e,
};

const SOLDIER_P4_IDLE = [
  '................',
  '.....KKKKKK.....',
  '....KKkkkkKK....',
  '...KKkkkkkkKK...',
  '....SSSSSSSS....',
  '....SESSSSES....',
  '....SSSSSSSS....',
  '...KKKKKKKKKK...',
  '..KKGkkkkkkGKK..',
  '..KKGGGGGGGGKK..',
  '..BBWWGGGGWWBB..',
  '.BBBWWkGGkWWBBB.',
  '.BBBWWkGGkWWBBB.',
  '.BBBWWGGGGWWBBB.',
  '..BBWWGGGGWWBB..',
  '...KKK....KKK...',
  '...KKK....KKK...',
  '..GGG......GGG..',
];

const SOLDIER_P4_W1 = [
  '................',
  '.....KKKKKK.....',
  '....KKkkkkKK....',
  '...KKkkkkkkKK...',
  '....SSSSSSSS....',
  '....SESSSSES....',
  '....SSSSSSSS....',
  '...KKKKKKKKKK...',
  '..KKGkkkkkkGKK..',
  '..KKGGGGGGGGKK..',
  '..BBWWGGGGWWBB..',
  '.BBBWWkGGkWWBBB.',
  '.BBBWWkGGkWWBBB.',
  '.BBBWWGGGGWWBBB.',
  '..BBWWGGGGWWBB..',
  '...KKK....KKK...',
  '..KKK......KKK..',
  '.GGG........GGG.',
];

const SOLDIER_P4_W2 = [
  '................',
  '.....KKKKKK.....',
  '....KKkkkkKK....',
  '...KKkkkkkkKK...',
  '....SSSSSSSS....',
  '....SESSSSES....',
  '....SSSSSSSS....',
  '...KKKKKKKKKK...',
  '..KKGkkkkkkGKK..',
  '..KKGGGGGGGGKK..',
  '..BBWWGGGGWWBB..',
  '.BBBWWkGGkWWBBB.',
  '.BBBWWkGGkWWBBB.',
  '.BBBWWGGGGWWBBB.',
  '..BBWWGGGGWWBB..',
  '...KKK....KKK...',
  '....KKK..KKK....',
  '..GGG......GGG..',
];

const CHAR_TEX: Record<string, { rows: string[]; pal: Record<string, number> }> = {
  'gunner-idle': { rows: GUNNER_IDLE, pal: GPAL },
  'gunner-w1': { rows: GUNNER_W1, pal: GPAL },
  'gunner-w2': { rows: GUNNER_W2, pal: GPAL },
  'wind-idle': { rows: WIND_IDLE, pal: WPAL },
  'wind-w1': { rows: WIND_W1, pal: WPAL },
  'wind-w2': { rows: WIND_W2, pal: WPAL },
  'bomber-idle': { rows: BOMBER_IDLE, pal: BPAL },
  'bomber-w1': { rows: BOMBER_W1, pal: BPAL },
  'bomber-w2': { rows: BOMBER_W2, pal: BPAL },
  'arcane-idle': { rows: ARCANE_IDLE, pal: ARCANE_PAL },
  'arcane-w1': { rows: ARCANE_W1, pal: ARCANE_PAL },
  'arcane-w2': { rows: ARCANE_W2, pal: ARCANE_PAL },
  'blade-idle': { rows: BLADE_IDLE, pal: BLADE_PAL },
  'blade-w1': { rows: BLADE_W1, pal: BLADE_PAL },
  'blade-w2': { rows: BLADE_W2, pal: BLADE_PAL },
  'war-idle': { rows: WAR_IDLE, pal: WAR_PAL },
  'war-w1': { rows: WAR_W1, pal: WAR_PAL },
  'war-w2': { rows: WAR_W2, pal: WAR_PAL },
  'emperor-idle': { rows: EMPEROR_IDLE, pal: EMPEROR_PAL },
  'emperor-w1': { rows: EMPEROR_W1, pal: EMPEROR_PAL },
  'emperor-w2': { rows: EMPEROR_W2, pal: EMPEROR_PAL },
  'soldier-idle': { rows: SOLDIER_IDLE, pal: SPAL },
  'soldier-w1': { rows: SOLDIER_W1, pal: SPAL },
  'soldier-w2': { rows: SOLDIER_W2, pal: SPAL },
  'soldier-p3-idle': { rows: SOLDIER_P3_IDLE, pal: SPAL3 },
  'soldier-p3-w1': { rows: SOLDIER_P3_W1, pal: SPAL3 },
  'soldier-p3-w2': { rows: SOLDIER_P3_W2, pal: SPAL3 },
  'soldier-p4-idle': { rows: SOLDIER_P4_IDLE, pal: SPAL4 },
  'soldier-p4-w1': { rows: SOLDIER_P4_W1, pal: SPAL4 },
  'soldier-p4-w2': { rows: SOLDIER_P4_W2, pal: SPAL4 },
};

const FX_TEX: Record<string, { rows: string[]; pal: Record<string, number> }> = {
  'tex-bullet': {
    rows: [
      '..Y..',
      '.YYY.',
      'YYYYY',
      '.YYY.',
      '..Y..',
    ],
    pal: { Y: 0xf2c94c },
  },
  'tex-spark': { rows: ['WWW', 'WWW', 'WWW'], pal: { W: 0xffffff } },
  // 雄兵长矛（v0.31 重绘）：朝右，深棕矛杆 + 金箍 + 锐利尖刺状矛头（贴在士兵手上旋转/突刺）
  'tex-spear': {
    rows: [
      '................DD........',
      '................DDDD......',
      'KKKKKKKKKKKKKKGGDDDDDD....',
      'KKKKKKKKKKKKKKGGDDDDDDDDDL',
      'KKKKKKKKKKKKKKGGDDDDDD....',
      '................DDDD......',
      '................DD........',
    ],
    pal: { K: 0x7a4b2a, G: 0xe0b33c, D: 0x9aa7bd, L: 0xd8e2f0 },
  },
  // 方针 1 的弓（朝右）：左侧金色弓臂弧线 + 右侧白色弓弦（士兵常驻持有）
  'tex-bow': {
    rows: [
      '.............',
      '.........AAA.',
      '.......AAA..S',
      '.....AAA...S.',
      '....AA.....S.',
      '...AA......S.',
      '...A.......S.',
      '...AA......S.',
      '....AA.....S.',
      '.....AAA...S.',
      '.......AAA..S',
      '.........AAA.',
      '.............',
    ],
    pal: { A: 0xd9a21b, S: 0xe8eefb },
  },
  // 方针 4 的持盾雄兵：蓝底金徽大盾（正面朝右）
  'tex-shield': {
    rows: [
      '..KKKKKKKKKK..',
      '.KWWKKKKKKWWK.',
      '.KWWBBBBBBWWK.',
      '.KBBBBBBBBBBK.',
      '.KBBBGGGGBBBK.',
      '.KBBGGGGGGBBK.',
      '.KBBGGGGGGBBK.',
      '.KBBBGGGGBBBK.',
      '.KBBBBBBBBBBK.',
      '.KWWBBBBBBWWK.',
      '.KWWKKKKKKWWK.',
      '..KKKKKKKKKK..',
    ],
    pal: { K: 0x22262e, W: 0xe8eef8, B: 0x35557e, G: 0xd9b33a },
  },
  'tex-gust': {
    rows: [
      '.......',
      '.TTTTT.',
      '.TTTTTT',
      '.TTTTTT',
      '.TTTTTT',
      '.TTTTTT',
      'TTT....',
    ],
    pal: { T: 0x8be8f2 },
  },
  'tex-pixel': { rows: ['c', 'c'], pal: { c: 0xffffff } },
  'tex-dash': { rows: ['dd', 'dd'], pal: { d: 0x9be8ff } },
  // 跟踪导弹：8×15 火箭造型，带深色描边与尾焰，保证在草地上清晰可见
  'tex-missile': {
    rows: [
      '...DD...',
      '..DMMD..',
      '.DMMMMD.',
      '.DMMMMD.',
      '.DMHHMD.',
      '.DMHHMD.',
      '.DMHHMD.',
      '.DMHHMD.',
      '.DMMMMD.',
      '.DMMMMD.',
      '..DMMD..',
      '..DMMD..',
      '..FDDF..',
      '.FF..FF.',
      '..F..F..',
    ],
    pal: { D: 0x39405a, M: 0xff9d4d, H: 0xffe27a, F: 0xfff3a6 },
  },
  'tex-star': {
    rows: [
      '..Y..',
      '..Y..',
      'YYYYY',
      '..Y..',
      '..Y..',
    ],
    pal: { Y: 0xffe07a },
  },
  // 弹幕风暴的追踪弹：黄红横向椭圆（朝向目标），与普通金色圆弹明显区分
  'tex-skillbullet': {
    rows: [
      '..YYY..',
      '.YRRRY.',
      'YRWWWRY',
      '.YRRRY.',
      '..YYY..',
    ],
    pal: { Y: 0xffe07a, R: 0xff5a3c, W: 0xfff0e0 },
  },
  // 右键积攒的狂风：亮蓝描边 + 白色核心，与左键青绿狂风区分
  'tex-gust-charged': {
    rows: [
      '.......',
      '.GGGGG.',
      '.GWWWWG',
      '.GWWWWG',
      '.GWWWWG',
      '.GWWWWG',
      'GGG....',
    ],
    pal: { G: 0x7fd8ff, W: 0xeaf6ff },
  },
  // 利剑舞者的剑气：细长月牙斩击
  'tex-swordwave': {
    rows: [
      '......W..',
      '..WWWWWW.',
      '.WGGGGGW.',
      '..WWWWWW.',
      '......W..',
    ],
    pal: { W: 0xd9f0ff, G: 0x9fd8ff },
  },
  // 战争机器能量弹：红边白心的横向椭圆，与金色弹明显区分
  'tex-war-bullet': {
    rows: [
      '..rrrr..',
      '.rWWWWr.',
      'rWWWWWWr',
      '.rWWWWr.',
      '..rrrr..',
    ],
    pal: { r: 0xd63a3a, W: 0xffffff },
  },
  // 帝君雄兵方针 1 的箭矢：金色箭杆 + 白色箭簇（朝右）
  'tex-arrow': {
    rows: [
      '........W',
      '....GGGGW',
      'GGGGWWWWW',
      '....GGGGW',
      '........W',
    ],
    pal: { G: 0xd9a21b, W: 0xfff2c4 },
  },
};

/** 仍需 ASCII 贴图生成的前缀（可玩角色的 Q 版贴图由 chibiTex 生成） */
const CHAR_PREFIXES = ['soldier', 'soldier-p3', 'soldier-p4'];

/** 敌对轮廓描边色 */
const OUTLINE_COLOR = 0xff3b3b;

/**
 * 由角色像素矩阵生成「轮廓描边」纹理：四周各留 1px 边距，
 * 只把紧贴身体像素的外侧一圈填成描边色，得到贴合人物剪影的红色轮廓（而非方块）。
 */
function makeOutlineTex(
  scene: Phaser.Scene, key: string, rows: string[], color = OUTLINE_COLOR,
) {
  if (scene.textures.exists(key)) return;
  const h = rows.length;
  const w = rows[0].length;
  const tex = scene.textures.createCanvas(key, w + 2, h + 2);
  if (!tex) return;
  const ctx = tex.getContext();
  const solid = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && rows[y][x] !== '.' && rows[y][x] !== ' ';
  ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
  for (let y = -1; y <= h; y++) {
    for (let x = -1; x <= w; x++) {
      if (solid(x, y)) continue;
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (solid(x + dx, y + dy)) { edge = true; break; }
        }
      }
      if (edge) ctx.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  tex.refresh();
}

/** 角色源画布允许的尺寸区间（16×18 / 32×36 / 64×72），行宽必须一致 */
function assertCharMatrix(key: string, rows: string[]) {
  const w = rows[0].length;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].length !== w) {
      throw new Error(`${key}: row ${i} expect ${w} cols, got ${rows[i].length}`);
    }
  }
  if (w < 16 || w > 64 || rows.length < 18 || rows.length > 72) {
    throw new Error(`${key}: unsupported matrix ${w}x${rows.length}`);
  }
}

/** 选择页 / 图鉴头像：统一输出 96×108 的放大贴图 */
const PORTRAIT_W = 96;

/** 生成全部角色与特效纹理；已存在则跳过 */
export function genCharacterTextures(scene: Phaser.Scene) {
  for (const [key, def] of Object.entries(CHAR_TEX)) {
    // 可玩角色已改为 Q 版三头身贴图（chibiTex），此处只生成雄兵
    if (!key.startsWith('soldier')) continue;
    assertCharMatrix(key, def.rows);
    makeTex(scene, key, def.rows, def.pal, 1);
  }
  // 敌对红色轮廓（idle / 两帧行走，与角色本体逐帧一致）
  for (const prefix of CHAR_PREFIXES) {
    for (const frame of ['idle', 'w1', 'w2']) {
      makeOutlineTex(scene, prefix + '-' + frame + '-o', CHAR_TEX[prefix + '-' + frame].rows);
    }
  }
  // 选择页头像：按源宽精确缩放到 96 宽，保证不同画布规格的头像尺寸一致（96×108）
  for (const prefix of CHAR_PREFIXES) {
    const idle = CHAR_TEX[prefix + '-idle'];
    const scale = PORTRAIT_W / idle.rows[0].length;
    makeTex(scene, prefix + '-portrait', idle.rows, idle.pal, scale);
  }
  for (const [key, def] of Object.entries(FX_TEX)) {
    makeTex(scene, key, def.rows, def.pal, 1);
  }
}

/** 生成地面与墙体装饰纹理 */
export function genEnvTextures(scene: Phaser.Scene) {
  if (!scene.textures.exists('tex-floor')) {
    const tex = scene.textures.createCanvas('tex-floor', 96, 96);
    const ctx = tex!.getContext();
    ctx.fillStyle = '#9fc05f';
    ctx.fillRect(0, 0, 96, 96);
    ctx.fillStyle = '#94b556';
    for (let y = 0; y < 96; y += 12) {
      for (let x = (y / 12) % 2 === 0 ? 0 : 12; x < 96; x += 24) {
        ctx.fillRect(x, y, 12, 12);
      }
    }
    ctx.fillStyle = '#8aa84e';
    const seeds: [number, number][] = [
      [8, 20], [40, 64], [76, 8], [60, 33], [24, 80], [88, 52], [12, 52], [70, 84],
    ];
    for (const [sx, sy] of seeds) {
      ctx.fillRect(sx, sy, 3, 3);
      ctx.fillRect(sx + 2, sy + 3, 2, 2);
    }
    tex!.refresh();
  }
  if (!scene.textures.exists('tex-wall')) {
    const tex = scene.textures.createCanvas('tex-wall', 16, 16);
    const ctx = tex!.getContext();
    ctx.fillStyle = '#5a6278';
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = '#6e7790';
    ctx.fillRect(0, 0, 16, 4);
    ctx.fillStyle = '#454c60';
    ctx.fillRect(0, 12, 16, 4);
    ctx.fillStyle = '#333a4c';
    ctx.fillRect(0, 0, 1, 16);
    ctx.fillRect(15, 0, 1, 16);
    ctx.fillStyle = '#4a5268';
    ctx.fillRect(4, 6, 3, 3);
    ctx.fillRect(9, 9, 3, 3);
    tex!.refresh();
  }

  // ---------------- v0.18 遗迹主题（黄绿地面 + 棕黑墙体） ----------------
  if (!scene.textures.exists('tex-floor-ruins')) {
    const tex = scene.textures.createCanvas('tex-floor-ruins', 96, 96);
    const ctx = tex!.getContext();
    ctx.fillStyle = '#a8a04e';
    ctx.fillRect(0, 0, 96, 96);
    // 黄绿棋盘砖
    for (let y = 0; y < 96; y += 24) {
      for (let x = (y / 24) % 2 === 0 ? 0 : 24; x < 96; x += 48) {
        ctx.fillStyle = '#8fa84a';
        ctx.fillRect(x, y, 24, 24);
        ctx.fillStyle = '#b8b25a';
        ctx.fillRect(x + 2, y + 2, 20, 20);
      }
    }
    // 砖缝
    ctx.fillStyle = '#6d7a3a';
    for (let i = 0; i <= 96; i += 24) {
      ctx.fillRect(i, 0, 1, 96);
      ctx.fillRect(0, i, 96, 1);
    }
    // 裂纹与苔痕
    const cracks: [number, number][] = [[10, 44], [52, 12], [80, 60], [28, 78], [66, 88], [16, 18]];
    for (const [cx, cy] of cracks) {
      ctx.fillStyle = '#5f6a33';
      ctx.fillRect(cx, cy, 6, 2);
      ctx.fillRect(cx + 4, cy + 2, 2, 4);
    }
    tex!.refresh();
  }
  if (!scene.textures.exists('tex-wall-ruins')) {
    const tex = scene.textures.createCanvas('tex-wall-ruins', 16, 16);
    const ctx = tex!.getContext();
    // 棕黑砖墙：黑缝 + 棕色砖块
    ctx.fillStyle = '#1d1712';
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = '#6b4629';
    ctx.fillRect(1, 1, 6, 6);
    ctx.fillRect(9, 1, 6, 6);
    ctx.fillStyle = '#7d5334';
    ctx.fillRect(1, 9, 10, 6);
    ctx.fillStyle = '#4a2f1d';
    ctx.fillRect(12, 9, 3, 6);
    ctx.fillStyle = '#8f6440';
    ctx.fillRect(1, 1, 6, 2);
    ctx.fillRect(1, 9, 10, 2);
    tex!.refresh();
  }
  // 铁轨（横向平铺：深色枕木 + 两条金属轨道）
  if (!scene.textures.exists('tex-rail')) {
    const tex = scene.textures.createCanvas('tex-rail', 32, 28);
    const ctx = tex!.getContext();
    ctx.fillStyle = '#2b241c';
    ctx.fillRect(0, 0, 32, 28);
    ctx.fillStyle = '#4a3524';
    ctx.fillRect(0, 0, 8, 28);
    ctx.fillRect(16, 0, 8, 28);
    ctx.fillStyle = '#a7a9b4';
    ctx.fillRect(0, 5, 32, 4);
    ctx.fillRect(0, 19, 32, 4);
    ctx.fillStyle = '#e3e6ef';
    ctx.fillRect(0, 5, 32, 1);
    ctx.fillRect(0, 19, 32, 1);
    tex!.refresh();
  }
  // 火车头（朝右）：深红车体 + 黑烟囱 + 车轮
  if (!scene.textures.exists('tex-train')) {
    const tex = scene.textures.createCanvas('tex-train', 64, 48);
    const ctx = tex!.getContext();
    // 车体
    ctx.fillStyle = '#7d2f24';
    ctx.fillRect(4, 16, 54, 22);
    ctx.fillStyle = '#a8402e';
    ctx.fillRect(4, 16, 54, 6);
    // 驾驶室
    ctx.fillStyle = '#c4543a';
    ctx.fillRect(6, 4, 22, 16);
    ctx.fillStyle = '#3a1a14';
    ctx.fillRect(10, 7, 14, 8);
    // 烟囱
    ctx.fillStyle = '#241c18';
    ctx.fillRect(40, 2, 10, 16);
    ctx.fillStyle = '#5a4a3e';
    ctx.fillRect(38, 2, 14, 4);
    // 前挡板
    ctx.fillStyle = '#3a2a22';
    ctx.fillRect(54, 20, 8, 18);
    ctx.fillStyle = '#8f8f9a';
    ctx.fillRect(52, 22, 4, 14);
    // 车轮
    const wheels: [number, number][] = [[16, 40], [32, 40], [48, 40]];
    for (const [wx, wy] of wheels) {
      ctx.fillStyle = '#141210';
      ctx.beginPath();
      ctx.arc(wx, wy, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#6d6d78';
      ctx.beginPath();
      ctx.arc(wx, wy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    tex!.refresh();
  }

  // ---------------- v0.34 珊瑚海主题（蓝色色块海面 + 粉色珊瑚墙 + 深蓝航道 + 小船） ----------------
  if (!scene.textures.exists('tex-floor-coral')) {
    const tex = scene.textures.createCanvas('tex-floor-coral', 96, 96);
    const ctx = tex!.getContext();
    // 蓝色色块（深浅两色棋盘）
    for (let y = 0; y < 96; y += 48) {
      for (let x = 0; x < 96; x += 48) {
        const even = (x / 48 + y / 48) % 2 === 0;
        ctx.fillStyle = even ? '#17497a' : '#123a63';
        ctx.fillRect(x, y, 48, 48);
        ctx.fillStyle = even ? '#1d5589' : '#164370';
        ctx.fillRect(x + 3, y + 3, 42, 42);
      }
    }
    // 色块接缝
    ctx.fillStyle = '#0d2b4c';
    for (let i = 0; i <= 96; i += 48) {
      ctx.fillRect(i, 0, 1, 96);
      ctx.fillRect(0, i, 96, 1);
    }
    // 海面碎浪
    ctx.fillStyle = 'rgba(150,225,255,0.16)';
    const waves: [number, number][] = [[12, 30], [58, 12], [72, 60], [26, 76], [86, 88]];
    for (const [wx, wy] of waves) {
      ctx.fillRect(wx, wy, 10, 2);
      ctx.fillRect(wx + 2, wy - 2, 5, 2);
    }
    tex!.refresh();
  }
  if (!scene.textures.exists('tex-wall-coral')) {
    const tex = scene.textures.createCanvas('tex-wall-coral', 16, 16);
    const ctx = tex!.getContext();
    // 粉色珊瑚砖
    ctx.fillStyle = '#8e3a63';
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = '#f07ca7';
    ctx.fillRect(1, 1, 6, 6);
    ctx.fillRect(9, 1, 6, 6);
    ctx.fillStyle = '#ff9dc4';
    ctx.fillRect(1, 9, 10, 6);
    ctx.fillStyle = '#d66597';
    ctx.fillRect(12, 9, 3, 6);
    ctx.fillStyle = '#ffc4dc';
    ctx.fillRect(1, 1, 6, 2);
    ctx.fillRect(1, 9, 10, 2);
    tex!.refresh();
  }
  // 深蓝航道（横向平铺：深色水系 + 两道浅色水纹）
  if (!scene.textures.exists('tex-channel')) {
    const tex = scene.textures.createCanvas('tex-channel', 48, 48);
    const ctx = tex!.getContext();
    ctx.fillStyle = '#0a2a52';
    ctx.fillRect(0, 0, 48, 48);
    ctx.fillStyle = '#0d3563';
    ctx.fillRect(0, 6, 48, 12);
    ctx.fillRect(0, 30, 48, 12);
    ctx.fillStyle = 'rgba(84,214,245,0.55)';
    ctx.fillRect(0, 8, 46, 2);
    ctx.fillRect(0, 32, 46, 2);
    ctx.fillStyle = 'rgba(150,235,255,0.35)';
    ctx.fillRect(10, 15, 8, 2);
    ctx.fillRect(30, 24, 10, 2);
    ctx.fillRect(6, 39, 12, 2);
    tex!.refresh();
  }
  // 推车小船（俯视，朝右）：象牙船体 + 木质甲板 + 白帆
  if (!scene.textures.exists('tex-boat')) {
    const tex = scene.textures.createCanvas('tex-boat', 72, 48);
    const ctx = tex!.getContext();
    // 船体（尖头朝右）
    ctx.beginPath();
    ctx.moveTo(68, 24);
    ctx.quadraticCurveTo(48, 4, 16, 6);
    ctx.lineTo(-2 + 6, 10);
    ctx.quadraticCurveTo(0, 24, 4, 38);
    ctx.lineTo(16, 42);
    ctx.quadraticCurveTo(48, 44, 68, 24);
    ctx.closePath();
    ctx.fillStyle = '#f3ead6';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#1d3a5f';
    ctx.stroke();
    // 甲板
    ctx.beginPath();
    ctx.ellipse(28, 24, 22, 9, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#c98a5a';
    ctx.fill();
    ctx.strokeStyle = '#7a4c2a';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 桅杆与白帆
    ctx.fillStyle = '#fff8ea';
    ctx.beginPath();
    ctx.moveTo(38, 22);
    ctx.lineTo(60, 10);
    ctx.lineTo(38, 3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#b9a98c';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#3b2a1c';
    ctx.fillRect(36, 22, 3, 5);
    // 船首旗
    ctx.fillStyle = '#54d6f5';
    ctx.fillRect(64, 21, 8, 6);
    tex!.refresh();
  }

  // ---------------- PVE 西部荒原主题（黄沙地面 + 破旧木屋墙体） ----------------
  if (!scene.textures.exists('tex-floor-sand')) {
    const tex = scene.textures.createCanvas('tex-floor-sand', 96, 96);
    const ctx = tex!.getContext();
    ctx.fillStyle = '#c9a96b';
    ctx.fillRect(0, 0, 96, 96);
    ctx.fillStyle = '#c0a063';
    for (let y = 0; y < 96; y += 16) {
      for (let x = (y / 16) % 2 === 0 ? 0 : 16; x < 96; x += 32) {
        ctx.fillRect(x, y, 16, 16);
      }
    }
    // 风沙纹路与碎石
    ctx.fillStyle = '#b3945a';
    const seeds: [number, number][] = [
      [10, 18], [44, 62], [78, 10], [62, 34], [26, 82], [86, 54], [14, 54], [70, 86],
    ];
    for (const [sx, sy] of seeds) {
      ctx.fillRect(sx, sy, 4, 2);
      ctx.fillRect(sx + 3, sy + 3, 3, 2);
    }
    ctx.fillStyle = '#8d7748';
    for (const [sx, sy] of seeds) ctx.fillRect(sx + 1, sy + 6, 2, 2);
    tex!.refresh();
  }
  if (!scene.textures.exists('tex-wall-sand')) {
    const tex = scene.textures.createCanvas('tex-wall-sand', 16, 16);
    const ctx = tex!.getContext();
    // 木板底色
    ctx.fillStyle = '#6b4a2c';
    ctx.fillRect(0, 0, 16, 16);
    // 横向木板纹理
    ctx.fillStyle = '#7d5734';
    ctx.fillRect(0, 0, 16, 6);
    ctx.fillStyle = '#5a3d24';
    ctx.fillRect(0, 6, 16, 1);
    ctx.fillRect(0, 12, 16, 1);
    // 拼缝与钉子
    ctx.fillStyle = '#42291a';
    ctx.fillRect(7, 0, 1, 16);
    ctx.fillRect(0, 0, 1, 16);
    ctx.fillRect(15, 0, 1, 16);
    ctx.fillStyle = '#a9814f';
    ctx.fillRect(3, 3, 2, 2);
    ctx.fillRect(11, 9, 2, 2);
    tex!.refresh();
  }
}