// 《海岛》音效：全部用 WebAudio 现场合成，不带音频文件。
// 总线：小音效 + 环境 -> 闪避增益 -> 主增益 -> 压缩器 -> 出口；大音效（倒塌、结算等）绕过闪避增益直接进主增益，
// 响起时把闪避增益压低 300–600ms 再恢复。合成在 synth.ts，并发/闪避/变体的纯逻辑在 mix.ts，环境声在 ambience.ts。
// 没有 AudioContext（Node、测试）时所有函数静默不做事。
import { loadSettings, saveSettings, type Settings } from '../settings.ts';
import { Ambience } from './ambience.ts';
import { duckPlan, Limiter, MIN_GAP_MS, pickVariant, Throttle, variantParams, type AmbienceMode, type SfxCount } from './mix.ts';
import { playSound, SFX_META, type Kit, type SfxName } from './synth.ts';

export type { SfxName } from './synth.ts';
export type { AmbienceMode } from './mix.ts';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let smallBus: GainNode | null = null;
let duck: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let ambience: Ambience | null = null;
let wantMode: AmbienceMode = 'off';
let prefs: Settings = loadSettings();
const limiter = new Limiter();
const throttle = new Throttle();

/** 测试钩子读的统计和最近 40 次（只记数，不影响播放） */
const counts = new Map<string, SfxCount>();
const recent: Array<{ name: string; at: number; ok: boolean }> = [];
export function sfxStats(): { counts: Record<string, SfxCount>; recent: typeof recent } {
  return { counts: Object.fromEntries(counts), recent: recent.slice() };
}
export function sfxStatsReset(): void { counts.clear(); recent.length = 0; }
function note(name: string, key: keyof SfxCount, ok = false): void {
  let c = counts.get(name);
  if (!c) counts.set(name, (c = { req: 0, played: 0, gap: 0, cap: 0, silent: 0 }));
  c[key]++;
  if (key === 'req') return;
  recent.push({ name, at: Math.round(performance.now()), ok });
  if (recent.length > 40) recent.shift();
}

export interface SfxOpts {
  /** 音高倍数（星星递增、失败压低） */
  pitch?: number;
  /** 覆盖 MIN_GAP_MS 的同名最小间隔 */
  gap?: number;
}
const lastVariant = new Map<SfxName, number>();

export function isMusicOn(): boolean { return prefs.music; }
export function isSfxOn(): boolean { return prefs.sfx; }

/** 音乐（环境声：海浪、海风、海鸟）开关，立刻生效并记下 */
export function setMusicOn(b: boolean): void {
  prefs = { ...prefs, music: b };
  ambience?.setMuted(!b);
  saveSettings(prefs);
}

/** 音效开关，立刻生效并记下 */
export function setSfxOn(b: boolean): void {
  prefs = { ...prefs, sfx: b };
  saveSettings(prefs);
}

/** 切后台暂停整个音频（环境声也停），回来恢复；只绑一次 */
let visBound = false;
function bindVisibility(): void {
  if (visBound || typeof document === 'undefined') return;
  visBound = true;
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    const hidden = document.visibilityState === 'hidden';
    ambience?.setPaused(hidden);
    if (hidden) void ctx.suspend().catch(() => {});
    else void ctx.resume().catch(() => {});
  });
}

export function unlockAudio(): void {
  try {
    if (!ctx) {
      const AC: typeof AudioContext | undefined =
        typeof AudioContext !== 'undefined' ? AudioContext
          : (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 6;
      comp.attack.value = 0.003; comp.release.value = 0.2;
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(comp);
      comp.connect(ctx.destination);
      duck = ctx.createGain();
      duck.connect(master);
      smallBus = duck;
      const len = Math.floor(ctx.sampleRate * 2);
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      ambience = new Ambience(ctx, duck);
      ambience.setMuted(!prefs.music);
      ambience.setMode(wantMode);
      bindVisibility();
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  } catch { /* 不支持就静默 */ }
}

/** 切环境声场景：基地 / 对战 / 守岛 / 关。可在解锁音频之前调用，解锁后生效。 */
export function setAmbience(mode: AmbienceMode): void {
  wantMode = mode;
  try { ambience?.setMode(mode); } catch { /* 环境声出错不影响游戏 */ }
}

function duckDown(durSec: number): void {
  if (!ctx || !duck) return;
  const p = duckPlan(durSec * 1000);
  const t = ctx.currentTime;
  const g = duck.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(p.depth, t + 0.03);
  g.setValueAtTime(p.depth, t + 0.03 + p.holdMs / 1000);
  g.linearRampToValueAtTime(1, t + 0.03 + (p.holdMs + p.releaseMs) / 1000);
}

export function sfx(name: SfxName, opts: SfxOpts = {}): void {
  if (!prefs.sfx) return;
  note(name, 'req');
  if (!ctx || !master || !smallBus || !noiseBuf || ctx.state !== 'running') return note(name, 'silent');
  const meta = SFX_META[name];
  const now = performance.now();
  if (!throttle.allow(name, now, opts.gap ?? MIN_GAP_MS[name] ?? 0)) return note(name, 'gap');
  if (!limiter.tryAcquire(name, meta.group, now, meta.dur * 1000)) return note(name, 'cap');
  try {
    const idx = pickVariant(meta.variants, lastVariant.get(name) ?? -1);
    lastVariant.set(name, idx);
    const v = meta.variants > 1 ? variantParams(idx) : { p: 1, l: 1, b: 1 };
    if (opts.pitch) v.p *= opts.pitch;
    const kit: Kit = { ctx, out: meta.big ? master : smallBus, noiseBuf, v };
    if (meta.big) duckDown(meta.dur);
    playSound(name, kit, ctx.currentTime + 0.005);
    note(name, 'played', true);
  } catch { /* 音频节点出错不影响游戏 */ }
}
