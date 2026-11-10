import Phaser from 'phaser';

/**
 * 程序化音效合成（8-bit 像素风）：零外部素材、单文件打包不受影响。
 * 用 OfflineAudioContext 合成各音效 → 编码 WAV → Phaser decodeAudio 解码入缓存并播放。
 */

export type SfxName =
  // 神枪手
  | 'shot' | 'bounce' | 'storm_on' | 'dash' | 'charge_full'
  // 风之女皇
  | 'gust' | 'gust_charge' | 'storm_cast' | 'detonate'
  // 轰炸专家
  | 'missile' | 'boom' | 'warn' | 'fuse'
  // 奥术天选者
  | 'reject' | 'jump' | 'ascend' | 'wave'
  // 利剑舞者
  | 'parry' | 'swordwave' | 'waltz_on' | 'blade_dash' | 'waltz_kill'
  // 战争机器
  | 'war_shot' | 'war_laser' | 'war_back' | 'war_annihilate'
  // 通用
  | 'hit' | 'kill' | 'respawn' | 'countdown' | 'go' | 'win' | 'lose';

interface ToneOpts {
  type?: OscillatorType;
  t0?: number;
  dur: number;
  f0: number;
  f1?: number;
  vol?: number;
  attack?: number;
}

interface NoiseOpts {
  t0?: number;
  dur: number;
  vol?: number;
  type?: BiquadFilterType;
  f0: number;
  f1?: number;
  Q?: number;
  attack?: number;
}

/** 对数扫频（听感更自然） */
function rampFreq(p: AudioParam, f0: number, f1: number, t0: number, dur: number, min = 1) {
  p.setValueAtTime(Math.max(min, f0), t0);
  if (f1 !== f0) {
    p.exponentialRampToValueAtTime(Math.max(min, f1), t0 + Math.max(0.01, dur));
  }
}

function tone(ctx: BaseAudioContext, o: ToneOpts) {
  const t0 = o.t0 ?? 0;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = o.type ?? 'square';
  rampFreq(osc.frequency, o.f0, o.f1 ?? o.f0, t0, o.dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(o.vol ?? 0.5, t0 + (o.attack ?? 0.004));
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.02);
}

/** 每个音效上下文缓存 0.5s 白噪声源（多个实例共享） */
const noiseBufs = new WeakMap<BaseAudioContext, AudioBuffer>();

function noise(ctx: BaseAudioContext, o: NoiseOpts) {
  const t0 = o.t0 ?? 0;
  let buf = noiseBufs.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * 0.5)), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseBufs.set(ctx, buf);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const filt = ctx.createBiquadFilter();
  filt.type = o.type ?? 'lowpass';
  filt.Q.value = o.Q ?? 1;
  rampFreq(filt.frequency, o.f0, o.f1 ?? o.f0, t0, o.dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(o.vol ?? 0.5, t0 + (o.attack ?? 0.008));
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  src.connect(filt).connect(gain).connect(ctx.destination);
  src.start(t0);
  src.stop(t0 + o.dur + 0.02);
}

/** 音效定义：函数内按 t0（相对偏移）向 destination 写入 */
const SFX_DEFS: Record<SfxName, { dur: number; build: (ctx: BaseAudioContext) => void }> = {
  shot: {
    dur: 0.1,
    build: (c) => tone(c, { type: 'square', f0: 900, f1: 200, dur: 0.09, vol: 0.5 }),
  },
  charge_full: {
    dur: 0.2,
    build: (c) => {
      tone(c, { type: 'square', f0: 880, dur: 0.06, vol: 0.32 });
      tone(c, { type: 'square', f0: 1318, dur: 0.1, vol: 0.32, t0: 0.07 });
    },
  },
  bounce: {
    dur: 0.07,
    build: (c) => tone(c, { type: 'triangle', f0: 1500, f1: 900, dur: 0.05, vol: 0.28 }),
  },
  hit: {
    dur: 0.11,
    build: (c) => {
      tone(c, { type: 'square', f0: 260, f1: 110, dur: 0.09, vol: 0.4 });
      noise(c, { t0: 0.01, dur: 0.06, vol: 0.25, type: 'lowpass', f0: 900, f1: 200 });
    },
  },
  storm_on: {
    dur: 0.4,
    build: (c) => {
      tone(c, { type: 'sawtooth', f0: 300, f1: 1400, dur: 0.35, vol: 0.3, attack: 0.02 });
      noise(c, { dur: 0.3, vol: 0.25, type: 'bandpass', f0: 500, f1: 2400 });
    },
  },
  dash: {
    dur: 0.24,
    build: (c) => noise(c, { dur: 0.22, vol: 0.32, type: 'bandpass', f0: 500, f1: 3000 }),
  },
  gust: {
    dur: 0.22,
    build: (c) => noise(c, { dur: 0.2, vol: 0.38, type: 'bandpass', f0: 900, f1: 250, Q: 1.4 }),
  },
  gust_charge: {
    dur: 0.85,
    build: (c) => tone(c, { type: 'sine', f0: 250, f1: 1100, dur: 0.8, vol: 0.16, attack: 0.1 }),
  },
  storm_cast: {
    dur: 1.15,
    build: (c) => {
      noise(c, { dur: 1.1, vol: 0.4, type: 'lowpass', f0: 1600, f1: 350, attack: 0.05 });
      tone(c, { type: 'sine', f0: 80, f1: 60, dur: 1.1, vol: 0.28, attack: 0.05 });
    },
  },
  detonate: {
    dur: 0.55,
    build: (c) => {
      noise(c, { dur: 0.5, vol: 0.65, type: 'lowpass', f0: 3000, f1: 60 });
      tone(c, { type: 'square', f0: 130, f1: 40, dur: 0.45, vol: 0.5 });
    },
  },
  missile: {
    dur: 0.5,
    build: (c) => {
      tone(c, { type: 'sawtooth', f0: 700, f1: 220, dur: 0.45, vol: 0.28, attack: 0.03 });
      noise(c, { dur: 0.45, vol: 0.3, type: 'bandpass', f0: 800, f1: 400 });
    },
  },
  boom: {
    dur: 0.6,
    build: (c) => {
      noise(c, { dur: 0.55, vol: 0.7, type: 'lowpass', f0: 2500, f1: 70 });
      tone(c, { type: 'square', f0: 100, f1: 32, dur: 0.5, vol: 0.5 });
    },
  },
  warn: {
    dur: 0.36,
    build: (c) => {
      tone(c, { type: 'square', f0: 660, dur: 0.08, vol: 0.26, t0: 0 });
      tone(c, { type: 'square', f0: 660, dur: 0.08, vol: 0.26, t0: 0.18 });
    },
  },
  fuse: {
    dur: 0.45,
    build: (c) => {
      tone(c, { type: 'square', f0: 1800, f1: 800, dur: 0.08, vol: 0.4 });
      noise(c, { t0: 0.04, dur: 0.3, vol: 0.5, type: 'lowpass', f0: 2000, f1: 200 });
    },
  },
  reject: {
    dur: 0.25,
    build: (c) => {
      tone(c, { type: 'sine', f0: 950, f1: 160, dur: 0.22, vol: 0.4 });
      tone(c, { type: 'square', f0: 1800, f1: 300, dur: 0.15, vol: 0.18 });
    },
  },
  jump: {
    dur: 0.45,
    build: (c) => {
      tone(c, { type: 'sine', f0: 350, f1: 1500, dur: 0.18, vol: 0.3 });
      tone(c, { type: 'sine', f0: 1500, f1: 400, dur: 0.15, vol: 0.26, t0: 0.22 });
    },
  },
  ascend: {
    dur: 3.5,
    build: (c) => {
      tone(c, { type: 'sine', f0: 180, f1: 1600, dur: 3.4, vol: 0.2, attack: 0.3 });
      tone(c, { type: 'triangle', f0: 180, f1: 1600, dur: 3.4, vol: 0.12, attack: 0.3 });
    },
  },
  wave: {
    dur: 1.7,
    build: (c) => {
      noise(c, { dur: 1.6, vol: 0.7, type: 'lowpass', f0: 3000, f1: 100 });
      tone(c, { type: 'square', f0: 70, f1: 28, dur: 1.5, vol: 0.55 });
    },
  },
  parry: {
    dur: 0.16,
    build: (c) => {
      tone(c, { type: 'square', f0: 1500, dur: 0.05, vol: 0.4 });
      tone(c, { type: 'square', f0: 2300, f1: 1800, dur: 0.09, vol: 0.3, t0: 0.03 });
      noise(c, { dur: 0.06, vol: 0.2, type: 'highpass', f0: 3000, t0: 0.02 });
    },
  },
  swordwave: {
    dur: 0.18,
    build: (c) => noise(c, { dur: 0.16, vol: 0.32, type: 'bandpass', f0: 3200, f1: 800 }),
  },
  waltz_on: {
    dur: 0.36,
    build: (c) => {
      [523, 659, 784].forEach((f, i) =>
        tone(c, { type: 'square', f0: f, dur: 0.1, vol: 0.3, t0: i * 0.09 }));
    },
  },
  blade_dash: {
    dur: 0.22,
    // v0.15：明显刀锋穿刺感——高频金属啸叫 + 尖锐噪声扫频
    build: (c) => {
      tone(c, { type: 'square', f0: 2600, f1: 1100, dur: 0.16, vol: 0.42 });
      tone(c, { type: 'sawtooth', f0: 1800, f1: 500, dur: 0.14, vol: 0.22, t0: 0.03 });
      noise(c, { dur: 0.16, vol: 0.34, type: 'bandpass', f0: 3600, f1: 1400, Q: 2.2 });
    },
  },
  waltz_kill: {
    dur: 0.4,
    // v0.15：华尔兹击杀穿梭——高速掠过噪声 + 上扬金属尾音
    build: (c) => {
      noise(c, { dur: 0.3, vol: 0.4, type: 'bandpass', f0: 700, f1: 3200, Q: 1.8 });
      tone(c, { type: 'square', f0: 900, f1: 1700, dur: 0.16, vol: 0.3, t0: 0.16 });
      tone(c, { type: 'triangle', f0: 2400, dur: 0.08, vol: 0.2, t0: 0.28 });
    },
  },
  war_shot: {
    dur: 0.09,
    build: (c) => {
      tone(c, { type: 'square', f0: 1500, f1: 620, dur: 0.07, vol: 0.34 });
      tone(c, { type: 'triangle', f0: 2400, f1: 1200, dur: 0.05, vol: 0.16, t0: 0.01 });
      noise(c, { dur: 0.05, vol: 0.14, type: 'highpass', f0: 2400 });
    },
  },
  war_laser: {
    dur: 0.55,
    // 毁灭激光：低频轰击 + 高频过载啸叫
    build: (c) => {
      noise(c, { dur: 0.5, vol: 0.7, type: 'lowpass', f0: 3200, f1: 180 });
      tone(c, { type: 'sawtooth', f0: 140, f1: 40, dur: 0.45, vol: 0.5 });
      tone(c, { type: 'square', f0: 1800, f1: 500, dur: 0.3, vol: 0.28, t0: 0.02 });
    },
  },
  war_back: {
    dur: 0.2,
    build: (c) => {
      noise(c, { dur: 0.18, vol: 0.34, type: 'bandpass', f0: 1800, f1: 320, Q: 1.6 });
      tone(c, { type: 'square', f0: 700, f1: 300, dur: 0.12, vol: 0.22 });
    },
  },
  war_annihilate: {
    dur: 0.8,
    // 歼灭姿态：机械过载爬升 + 重击落地感
    build: (c) => {
      tone(c, { type: 'sawtooth', f0: 220, f1: 1400, dur: 0.5, vol: 0.3, attack: 0.06 });
      tone(c, { type: 'square', f0: 440, f1: 1760, dur: 0.45, vol: 0.18, t0: 0.05, attack: 0.06 });
      noise(c, { t0: 0.45, dur: 0.3, vol: 0.55, type: 'lowpass', f0: 2200, f1: 120 });
      tone(c, { type: 'square', f0: 160, f1: 60, dur: 0.28, vol: 0.4, t0: 0.45 });
    },
  },
  kill: {
    dur: 0.24,
    build: (c) => {
      tone(c, { type: 'square', f0: 660, dur: 0.08, vol: 0.35 });
      tone(c, { type: 'square', f0: 990, dur: 0.13, vol: 0.35, t0: 0.09 });
    },
  },
  respawn: {
    dur: 0.35,
    build: (c) => {
      tone(c, { type: 'sine', f0: 300, f1: 900, dur: 0.3, vol: 0.26, attack: 0.05 });
      tone(c, { type: 'triangle', f0: 600, f1: 1800, dur: 0.25, vol: 0.1, attack: 0.05 });
    },
  },
  countdown: {
    dur: 0.12,
    build: (c) => tone(c, { type: 'square', f0: 800, dur: 0.1, vol: 0.3 }),
  },
  go: {
    dur: 0.35,
    build: (c) => {
      tone(c, { type: 'square', f0: 1100, dur: 0.3, vol: 0.35 });
      tone(c, { type: 'square', f0: 2200, dur: 0.25, vol: 0.15, t0: 0.02 });
    },
  },
  win: {
    dur: 0.6,
    build: (c) => {
      [523, 659, 784, 1046].forEach((f, i) =>
        tone(c, { type: 'square', f0: f, dur: 0.14, vol: 0.32, t0: i * 0.12 }));
    },
  },
  lose: {
    dur: 0.65,
    build: (c) => {
      [392, 330, 262].forEach((f, i) =>
        tone(c, { type: 'triangle', f0: f, dur: 0.2, vol: 0.3, t0: i * 0.18 }));
    },
  },
};

const SAMPLE_RATE = 22050;

/** Float32 → 16bit PCM 单声道 WAV（RIFF 头 + 数据） */
function encodeWav(buf: AudioBuffer): ArrayBuffer {
  const n = buf.length;
  const ab = new ArrayBuffer(44 + n * 2);
  const v = new DataView(ab);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // 单声道
  v.setUint32(24, SAMPLE_RATE, true);
  v.setUint32(28, SAMPLE_RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  writeStr(36, 'data');
  v.setUint32(40, n * 2, true);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, ch[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return ab;
}

async function renderSfx(name: SfxName): Promise<AudioBuffer> {
  const def = SFX_DEFS[name];
  const ctx = new OfflineAudioContext(1, Math.ceil(SAMPLE_RATE * (def.dur + 0.05)), SAMPLE_RATE);
  def.build(ctx);
  return ctx.startRendering();
}

const sounds = new Map<SfxName, Phaser.Sound.WebAudioSound>();
let booted = false;

/** BootScene 中调用一次：合成 + 解码 + 注册全部音效 */
export async function initSfx(game: Phaser.Game): Promise<void> {
  if (booted) return;
  booted = true;
  const mgr = game.sound as Phaser.Sound.WebAudioSoundManager;
  if (!mgr || typeof (mgr as unknown as { decodeAudio?: unknown }).decodeAudio !== 'function') return;

  const configs: { key: string; data: ArrayBuffer }[] = [];
  for (const name of Object.keys(SFX_DEFS) as SfxName[]) {
    const buf = await renderSfx(name);
    configs.push({ key: 'sfx-' + name, data: encodeWav(buf) });
  }
  mgr.decodeAudio(configs);
  mgr.once('decodedall', () => {
    for (const name of Object.keys(SFX_DEFS) as SfxName[]) {
      sounds.set(name, mgr.add('sfx-' + name));
    }
  });
}

/** 播放音效（未就绪/不支持 WebAudio 时静默跳过） */
export function playSfx(name: SfxName, volume = 1) {
  const s = sounds.get(name);
  if (!s) return;
  s.play({ volume });
}