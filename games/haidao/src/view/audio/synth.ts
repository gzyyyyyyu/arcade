// 音效合成：全部现场用振荡器、噪声和滤波器算出来，不带音频文件。
// 只依赖 BaseAudioContext，所以浏览器里的实时 AudioContext 和离线渲染（tools/sfx-render.ts 导 WAV）共用同一份。
import type { SfxGroup, Variant } from './mix.ts';

export type SfxName =
  // 界面
  | 'tap' | 'confirm' | 'error' | 'coin'
  // 建筑：建造 / 升级 / 倒塌各分小档和大档
  | 'wood' | 'build' | 'buildBig' | 'upgrade' | 'upgradeBig' | 'crumble' | 'crumbleBig'
  // 各塔开火
  | 'cannon' | 'musket' | 'mortar' | 'rocket' | 'harpoon' | 'flame' | 'kraken' | 'shock' | 'stun' | 'snipe' | 'guard'
  // 命中材质（hit 保留为通用命中）
  | 'hit' | 'hitWood' | 'hitStone' | 'hitMetal'
  // 兵的语气声
  | 'shout' | 'die' | 'cry'
  // 爆炸、登陆、水花
  | 'boom' | 'land' | 'splash'
  // 技能
  | 'barrage' | 'flare' | 'heal' | 'keg' | 'rally'
  // 结算
  | 'star' | 'star3' | 'win' | 'lose';

export interface SfxMeta {
  group: SfxGroup;
  /** 变体个数（1 = 不做变体，用于有固定旋律的短句） */
  variants: number;
  /** 大约时长，秒；用于并发登记和离线渲染长度 */
  dur: number;
  /** 大音效：不走会被压低的小音效总线，并触发闪避 */
  big?: boolean;
}

export const SFX_META: Record<SfxName, SfxMeta> = {
  tap: { group: 'ui', variants: 3, dur: 0.1 },
  confirm: { group: 'ui', variants: 2, dur: 0.3 },
  error: { group: 'ui', variants: 2, dur: 0.3 },
  coin: { group: 'ui', variants: 3, dur: 0.4 },
  wood: { group: 'build', variants: 3, dur: 0.2 },
  build: { group: 'build', variants: 3, dur: 0.55 },
  buildBig: { group: 'build', variants: 2, dur: 0.9 },
  upgrade: { group: 'build', variants: 2, dur: 0.5 },
  upgradeBig: { group: 'build', variants: 1, dur: 0.9 },
  crumble: { group: 'blast', variants: 3, dur: 0.8 },
  crumbleBig: { group: 'blast', variants: 2, dur: 1.5, big: true },
  cannon: { group: 'fire', variants: 3, dur: 0.55 },
  musket: { group: 'fire', variants: 3, dur: 0.2 },
  mortar: { group: 'fire', variants: 3, dur: 0.55 },
  rocket: { group: 'fire', variants: 3, dur: 0.5 },
  harpoon: { group: 'fire', variants: 3, dur: 0.3 },
  flame: { group: 'fire', variants: 3, dur: 0.4 },
  kraken: { group: 'fire', variants: 3, dur: 0.7 },
  shock: { group: 'fire', variants: 3, dur: 0.6 },
  stun: { group: 'misc', variants: 3, dur: 0.35 },
  snipe: { group: 'fire', variants: 3, dur: 0.9 },
  guard: { group: 'hit', variants: 3, dur: 0.35 },
  hit: { group: 'hit', variants: 3, dur: 0.15 },
  hitWood: { group: 'hit', variants: 3, dur: 0.18 },
  hitStone: { group: 'hit', variants: 3, dur: 0.2 },
  hitMetal: { group: 'hit', variants: 3, dur: 0.4 },
  shout: { group: 'voice', variants: 3, dur: 0.45 },
  die: { group: 'voice', variants: 3, dur: 0.4 },
  cry: { group: 'voice', variants: 3, dur: 0.3 },
  boom: { group: 'blast', variants: 3, dur: 0.7 },
  land: { group: 'misc', variants: 3, dur: 0.25 },
  splash: { group: 'misc', variants: 3, dur: 0.3 },
  barrage: { group: 'skill', variants: 2, dur: 0.8, big: true },
  flare: { group: 'skill', variants: 2, dur: 0.5 },
  heal: { group: 'skill', variants: 2, dur: 0.4 },
  keg: { group: 'skill', variants: 2, dur: 0.8, big: true },
  rally: { group: 'skill', variants: 2, dur: 0.7 },
  star: { group: 'star', variants: 1, dur: 0.4 },
  star3: { group: 'stinger', variants: 1, dur: 2.4, big: true },
  win: { group: 'stinger', variants: 1, dur: 3.4, big: true },
  lose: { group: 'stinger', variants: 1, dur: 3.2, big: true },
};

export const SFX_NAMES = Object.keys(SFX_META) as SfxName[];

/** 一次播放用到的东西：环境、出口、共用噪声和这次的变体参数 */
export interface Kit {
  ctx: BaseAudioContext;
  out: AudioNode;
  noiseBuf: AudioBuffer;
  v: Variant;
}

function env(g: GainNode, t: number, peak: number, atk: number, dur: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

/** 振荡器：频率可滑音 f0 -> f1。变体改音高和时长。 */
function tone(k: Kit, type: OscillatorType, f0: number, f1: number, t: number, dur: number, vol: number, atk = 0.005): void {
  const d = dur * k.v.l;
  const o = k.ctx.createOscillator();
  const g = k.ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0 * k.v.p, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1 * k.v.p), t + d);
  env(g, t, vol, atk, d);
  o.connect(g); g.connect(k.out);
  o.onended = () => { o.disconnect(); g.disconnect(); };
  o.start(t); o.stop(t + d + 0.02);
}

/** 噪声：滤波器中心频率可扫频。变体改亮度和时长。 */
function noise(k: Kit, ft: BiquadFilterType, f0: number, f1: number, t: number, dur: number, vol: number, q = 1, atk = 0.003): void {
  const d = dur * k.v.l;
  const s = k.ctx.createBufferSource();
  s.buffer = k.noiseBuf;
  const f = k.ctx.createBiquadFilter();
  f.type = ft; f.Q.value = q;
  f.frequency.setValueAtTime(f0 * k.v.b, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * k.v.b), t + d);
  const g = k.ctx.createGain();
  env(g, t, vol, atk, d);
  s.connect(f); f.connect(g); g.connect(k.out);
  s.onended = () => { s.disconnect(); f.disconnect(); g.disconnect(); };
  s.start(t, 0, Math.min(d + 0.02, k.noiseBuf.duration)); s.stop(t + d + 0.02);
}

/**
 * 元音：锯齿波过两个共振峰（带通），音高和共振峰都可以滑动。
 * 听起来像含糊的“嘿”“啊”，不是真人语音。
 */
function vowel(k: Kit, t: number, dur: number, f0a: number, f0b: number, f1a: number, f1b: number, f2a: number, f2b: number, vol: number): void {
  const d = dur * k.v.l;
  const o = k.ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0a * k.v.p, t);
  o.frequency.linearRampToValueAtTime(f0b * k.v.p, t + d);
  const g = k.ctx.createGain();
  env(g, t, vol, 0.03, d);
  const nodes: AudioNode[] = [o, g];
  for (const [fa, fb, q, gain] of [[f1a, f1b, 5, 2.2], [f2a, f2b, 7, 1.2]] as const) {
    const f = k.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = q;
    f.frequency.setValueAtTime(fa * k.v.b, t);
    f.frequency.linearRampToValueAtTime(fb * k.v.b, t + d);
    const pre = k.ctx.createGain();
    pre.gain.value = gain;
    o.connect(f); f.connect(pre); pre.connect(g);
    nodes.push(f, pre);
  }
  g.connect(k.out);
  o.onended = () => { for (const n of nodes) n.disconnect(); };
  o.start(t); o.stop(t + d + 0.02);
}

const N = { C3: 130.8, G3: 196, C4: 261.6, D4: 293.7, E4: 329.6, F4: 349.2, G4: 392, A4: 440, B4: 493.9, C5: 523.3, D5: 587.3, E5: 659.3, G5: 784, A5: 880, C6: 1046.5, E6: 1318.5 };

function melody(k: Kit, notes: number[], step: number, t: number, type: OscillatorType, dur: number, vol: number): void {
  notes.forEach((f, i) => tone(k, type, f, f, t + i * step, dur, vol, 0.008));
}

/** 带泛音的钟声：基音 + 2.76 倍泛音，结算和升级的亮点 */
function bell(k: Kit, f: number, t: number, dur: number, vol: number): void {
  tone(k, 'sine', f, f, t, dur, vol, 0.004);
  tone(k, 'sine', f * 2.76, f * 2.76, t, dur * 0.4, vol * 0.35, 0.002);
}

type Def = (k: Kit, t: number) => void;

export const SOUNDS: Record<SfxName, Def> = {
  // ---- 界面 ----
  tap: (k, t) => tone(k, 'triangle', 700, 500, t, 0.06, 0.25),
  confirm: (k, t) => { tone(k, 'triangle', 520, 520, t, 0.08, 0.22); tone(k, 'triangle', 780, 780, t + 0.07, 0.18, 0.22); },
  error: (k, t) => { tone(k, 'square', 200, 200, t, 0.08, 0.18); tone(k, 'square', 150, 150, t + 0.09, 0.14, 0.18); },
  coin: (k, t) => { tone(k, 'square', 988, 988, t, 0.08, 0.14); tone(k, 'square', 1319, 1319, t + 0.07, 0.25, 0.14); },

  // ---- 建筑 ----
  wood: (k, t) => { tone(k, 'sine', 180, 80, t, 0.14, 0.5); noise(k, 'bandpass', 900, 400, t, 0.06, 0.25, 2); },
  build: (k, t) => {
    tone(k, 'sine', 200, 90, t, 0.12, 0.45); noise(k, 'bandpass', 1000, 500, t, 0.05, 0.2, 2);
    tone(k, 'sine', 220, 100, t + 0.14, 0.12, 0.45); noise(k, 'bandpass', 1100, 500, t + 0.14, 0.05, 0.2, 2);
    tone(k, 'triangle', N.G4, N.G4, t + 0.3, 0.2, 0.2);
  },
  // 大建筑：三下夯桩 + 木板落定 + 收尾的和弦
  buildBig: (k, t) => {
    for (let i = 0; i < 3; i++) {
      const d = i * 0.16;
      tone(k, 'sine', 150 - i * 12, 60, t + d, 0.16, 0.55);
      noise(k, 'bandpass', 800, 350, t + d, 0.07, 0.28, 2);
    }
    noise(k, 'bandpass', 1500, 700, t + 0.5, 0.1, 0.2, 2);
    melody(k, [N.C4, N.G4], 0.05, t + 0.5, 'triangle', 0.35, 0.18);
  },
  upgrade: (k, t) => melody(k, [N.C5, N.E5, N.G5, N.C6], 0.08, t, 'triangle', 0.18, 0.22),
  upgradeBig: (k, t) => {
    melody(k, [N.C5, N.E5, N.G5, N.C6, N.E6], 0.075, t, 'triangle', 0.22, 0.22);
    bell(k, N.C6, t + 0.38, 0.5, 0.16);
    tone(k, 'sine', 100, 70, t, 0.2, 0.4);
  },
  crumble: (k, t) => {
    noise(k, 'lowpass', 900, 80, t, 0.6, 0.7, 0.6, 0.004);
    tone(k, 'sine', 80, 30, t, 0.5, 0.6, 0.004);
    noise(k, 'bandpass', 1600, 700, t + 0.18, 0.05, 0.3, 2, 0.001);
    noise(k, 'bandpass', 1300, 600, t + 0.3, 0.05, 0.25, 2, 0.001);
  },
  // 大建筑倒塌：长轰隆 + 几块碎石接连落地
  crumbleBig: (k, t) => {
    noise(k, 'lowpass', 1200, 60, t, 1.2, 0.85, 0.6, 0.004);
    tone(k, 'sine', 70, 24, t, 1.0, 0.75, 0.004);
    for (let i = 0; i < 5; i++) noise(k, 'bandpass', 1900 - i * 200, 600, t + 0.2 + i * 0.16, 0.06, 0.3, 2, 0.001);
    noise(k, 'lowpass', 600, 100, t + 0.35, 0.5, 0.5, 0.7);
  },

  // ---- 各塔开火 ----
  cannon: (k, t) => {
    tone(k, 'sine', 140, 38, t, 0.45, 0.8, 0.003);
    noise(k, 'lowpass', 1200, 150, t, 0.4, 0.6);
  },
  musket: (k, t) => {
    noise(k, 'highpass', 2500, 1500, t, 0.12, 0.55, 0.7, 0.001);
    tone(k, 'square', 900, 200, t, 0.06, 0.15, 0.001);
  },
  mortar: (k, t) => {
    tone(k, 'sine', 110, 55, t, 0.25, 0.6, 0.003);
    noise(k, 'lowpass', 500, 120, t, 0.22, 0.4);
    tone(k, 'sine', 900, 350, t + 0.12, 0.4, 0.12, 0.05);
  },
  rocket: (k, t) => { noise(k, 'highpass', 800, 3500, t, 0.35, 0.4, 0.6, 0.02); tone(k, 'sawtooth', 220, 700, t, 0.3, 0.1, 0.01); },
  harpoon: (k, t) => { tone(k, 'triangle', 420, 160, t, 0.18, 0.4, 0.002); noise(k, 'bandpass', 2400, 900, t, 0.1, 0.25, 1.5, 0.001); },
  flame: (k, t) => { noise(k, 'bandpass', 700, 400, t, 0.3, 0.4, 0.7, 0.03); noise(k, 'highpass', 3000, 2000, t, 0.25, 0.08, 0.5, 0.03); },
  // 海怪塔：低沉的咆哮 + 水声
  kraken: (k, t) => {
    tone(k, 'sawtooth', 90, 45, t, 0.6, 0.3, 0.05);
    noise(k, 'lowpass', 600, 200, t, 0.6, 0.45, 0.8, 0.04);
    noise(k, 'bandpass', 1800, 600, t + 0.15, 0.3, 0.18, 0.8, 0.05);
  },

  // 震荡炮：先是 0.3 秒往上爬的电容嗡鸣（蓄力），再是一声低沉的闷震加金属嗡鸣尾巴
  shock: (k, t) => {
    tone(k, 'sawtooth', 120, 520, t, 0.3, 0.14, 0.05);
    tone(k, 'sine', 90, 36, t + 0.3, 0.45, 0.8, 0.004);
    noise(k, 'lowpass', 900, 120, t + 0.3, 0.3, 0.5, 0.7, 0.003);
    tone(k, 'triangle', 640, 300, t + 0.32, 0.3, 0.16, 0.004);
  },
  // 狙击塔：一声重枪——极短的高频爆裂（枪口）、很沉的低频一击（托起整声）、一条往下掉的啸叫（子弹飞走），最后远处的回声
  snipe: (k, t) => {
    noise(k, 'highpass', 2600, 1400, t, 0.05, 0.7, 0.8, 0.0005);
    tone(k, 'sine', 150, 38, t, 0.32, 0.95, 0.002);
    noise(k, 'lowpass', 1800, 140, t, 0.28, 0.65, 0.7, 0.001);
    tone(k, 'sawtooth', 2400, 600, t + 0.02, 0.22, 0.08, 0.002);
    noise(k, 'bandpass', 900, 260, t + 0.16, 0.55, 0.16, 0.5, 0.05);
  },
  // 盾兵挡住一发：木盾上的闷“咚” + 包边铁的短“当”，两个非整数倍泛音带一点余音
  guard: (k, t) => {
    tone(k, 'sine', 260, 120, t, 0.14, 0.55, 0.001);
    noise(k, 'bandpass', 1100, 500, t, 0.06, 0.4, 2, 0.001);
    tone(k, 'sine', 1560, 1540, t + 0.005, 0.3, 0.26, 0.001);
    tone(k, 'sine', 2310, 2290, t + 0.005, 0.2, 0.15, 0.001);
    noise(k, 'highpass', 3600, 3000, t, 0.03, 0.22, 0.8, 0.001);
  },
  // 被震晕：一声短促的金属“嗡”下滑
  stun: (k, t) => {
    tone(k, 'triangle', 820, 330, t, 0.3, 0.3, 0.002);
    tone(k, 'sine', 1240, 520, t, 0.2, 0.14, 0.002);
    noise(k, 'bandpass', 1600, 700, t, 0.06, 0.2, 1.2, 0.001);
  },

  // ---- 命中材质 ----
  hit: (k, t) => { noise(k, 'bandpass', 1500, 600, t, 0.08, 0.4, 1.5, 0.001); tone(k, 'square', 300, 150, t, 0.06, 0.12, 0.001); },
  // 木：钝的“咚”，中低频、短
  hitWood: (k, t) => { tone(k, 'sine', 220, 90, t, 0.12, 0.5, 0.001); noise(k, 'bandpass', 900, 450, t, 0.07, 0.32, 2.5, 0.001); },
  // 石：碎裂的“嚓”，高频沙沙 + 一声闷响
  hitStone: (k, t) => { noise(k, 'highpass', 2200, 1200, t, 0.1, 0.4, 0.8, 0.001); noise(k, 'lowpass', 1400, 300, t, 0.12, 0.35, 0.8, 0.001); tone(k, 'sine', 120, 60, t, 0.1, 0.35, 0.001); },
  // 金属：非整数倍泛音的“叮”，带余音
  hitMetal: (k, t) => {
    tone(k, 'sine', 1180, 1170, t, 0.35, 0.22, 0.001);
    tone(k, 'sine', 1870, 1860, t, 0.25, 0.16, 0.001);
    tone(k, 'sine', 2650, 2640, t, 0.15, 0.1, 0.001);
    noise(k, 'highpass', 3500, 3000, t, 0.04, 0.25, 0.8, 0.001);
  },

  // ---- 兵的语气声（合成元音，含糊，不是真人语音） ----
  // 出兵吆喝：低沉的“嘿——哦”，音高先抬后落
  shout: (k, t) => {
    vowel(k, t, 0.38, 125, 105, 700, 450, 1200, 900, 0.5);
    noise(k, 'bandpass', 1500, 900, t, 0.1, 0.06, 1, 0.02);
  },
  // 阵亡：短促的“呃啊”，音高快速下滑
  die: (k, t) => {
    vowel(k, t, 0.3, 190, 80, 800, 500, 1300, 1000, 0.45);
    noise(k, 'lowpass', 800, 200, t + 0.22, 0.15, 0.18);
  },
  // 受击的闷哼，比阵亡短
  cry: (k, t) => vowel(k, t, 0.16, 160, 120, 600, 500, 1100, 1000, 0.4),

  // ---- 爆炸 / 登陆 / 水花 ----
  boom: (k, t) => {
    noise(k, 'lowpass', 2500, 100, t, 0.55, 0.9, 0.5, 0.002);
    tone(k, 'sine', 90, 30, t, 0.5, 0.7, 0.003);
  },
  land: (k, t) => { tone(k, 'sine', 120, 50, t, 0.2, 0.6, 0.003); noise(k, 'lowpass', 700, 200, t, 0.18, 0.4); },
  splash: (k, t) => { noise(k, 'bandpass', 1800, 700, t, 0.22, 0.35, 0.8, 0.01); tone(k, 'sine', 500, 220, t, 0.12, 0.12, 0.004); },

  // ---- 技能 ----
  barrage: (k, t) => {
    for (let i = 0; i < 4; i++) {
      const d = i * 0.09;
      tone(k, 'sine', 150, 45, t + d, 0.3, 0.55, 0.003);
      noise(k, 'lowpass', 1200, 200, t + d, 0.25, 0.4);
    }
  },
  flare: (k, t) => { noise(k, 'bandpass', 1500, 5000, t, 0.4, 0.3, 2, 0.05); tone(k, 'sine', 600, 2200, t, 0.4, 0.14, 0.05); },
  // 补给桶：木桶落地 + 清亮的叮咚
  heal: (k, t) => {
    tone(k, 'sine', 160, 80, t, 0.12, 0.4);
    melody(k, [N.G4, N.C5, N.E5], 0.07, t + 0.05, 'sine', 0.22, 0.25);
  },
  // 火药桶：嘶嘶的引信，再一声闷爆
  keg: (k, t) => {
    noise(k, 'highpass', 3000, 5000, t, 0.35, 0.18, 0.6, 0.02);
    noise(k, 'lowpass', 2000, 80, t + 0.35, 0.5, 0.85, 0.5, 0.002);
    tone(k, 'sine', 100, 28, t + 0.35, 0.5, 0.7, 0.003);
  },
  // 号令：号角两声，音高上扬
  rally: (k, t) => {
    tone(k, 'sawtooth', 196, 196, t, 0.22, 0.14, 0.03);
    tone(k, 'sawtooth', 294, 294, t + 0.24, 0.4, 0.16, 0.03);
    tone(k, 'square', 98, 98, t, 0.6, 0.06, 0.03);
  },

  // ---- 结算：2–4 秒的小旋律 ----
  star: (k, t) => melody(k, [N.C5, N.E5, N.G5], 0.1, t, 'triangle', 0.25, 0.25),
  // 三星：上行琶音落在钟声上
  star3: (k, t) => {
    melody(k, [N.C5, N.E5, N.G5, N.C6, N.E6], 0.1, t, 'triangle', 0.3, 0.22);
    bell(k, N.C6, t + 0.55, 1.4, 0.2);
    bell(k, N.G5, t + 0.7, 1.2, 0.14);
    bell(k, N.E6, t + 0.85, 1.2, 0.12);
    tone(k, 'sine', N.C3, N.C3, t + 0.5, 1.6, 0.18, 0.02);
  },
  // 胜利：欢快的 4 小节，主旋律 + 低音，最后长音收住
  win: (k, t) => {
    const m = [N.C5, N.E5, N.G5, N.E5, N.G5, N.C6, N.A5, N.G5, N.E5, N.G5, N.C6, N.E6];
    m.forEach((f, i) => tone(k, 'triangle', f, f, t + i * 0.17, 0.32, 0.24, 0.01));
    const bass = [N.C3, N.C3, N.G3, N.G3, N.C3, N.G3];
    bass.forEach((f, i) => tone(k, 'sine', f, f, t + i * 0.34, 0.4, 0.22, 0.01));
    bell(k, N.C6, t + 2.1, 1.3, 0.2);
    bell(k, N.E6, t + 2.1, 1.3, 0.12);
    tone(k, 'sine', N.C3, N.C3, t + 2.1, 1.3, 0.2, 0.02);
  },
  // 失败：小调下行，低沉的长音
  lose: (k, t) => {
    const m = [N.G4, N.E4 * 0.945, N.D4, N.C4, N.G3 * 1.05];
    m.forEach((f, i) => tone(k, 'triangle', f, f, t + i * 0.4, 0.55, 0.22, 0.02));
    tone(k, 'sawtooth', 130.8, 110, t + 1.6, 1.4, 0.07, 0.1);
    tone(k, 'sine', 65.4, 55, t + 1.6, 1.5, 0.22, 0.05);
  },
};

/** 在 t 时刻播放一个音效。 */
export function playSound(name: SfxName, kit: Kit, t: number): void {
  SOUNDS[name](kit, t);
}
