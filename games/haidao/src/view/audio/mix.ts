// 音效混音的纯逻辑：并发上限、变体选择、闪避曲线、环境混合表。
// 不碰 WebAudio，方便单测；画面层不是规则核心，随机用 Math.random 即可（测试里可注入）。

export type SfxGroup = 'ui' | 'build' | 'fire' | 'hit' | 'voice' | 'blast' | 'skill' | 'misc' | 'star' | 'stinger';

/** 每组同时最多几个在响；多余的直接丢弃（密集时听不出区别，丢掉比叠成噪声好） */
export const GROUP_MAX: Record<SfxGroup, number> = {
  ui: 3, build: 2, fire: 5, hit: 4, voice: 3, blast: 4, skill: 2, misc: 2, star: 3, stinger: 1,
};

/** 同一个名字在这么短的时间内最多放 2 次（沿用旧规则：60ms 内最多 2 个） */
const SAME_NAME_WINDOW_MS = 60;
const SAME_NAME_MAX = 2;

export interface Slot { name: string; group: SfxGroup; end: number }

/** 并发限制器：记录每个正在响的声音的结束时间 */
export class Limiter {
  private live: Slot[] = [];
  private starts = new Map<string, number[]>();

  /** 允许播放就登记并返回 true；超限返回 false */
  tryAcquire(name: string, group: SfxGroup, nowMs: number, durMs: number): boolean {
    this.live = this.live.filter((s) => s.end > nowMs);
    const recent = (this.starts.get(name) ?? []).filter((x) => nowMs - x < SAME_NAME_WINDOW_MS);
    if (recent.length >= SAME_NAME_MAX) { this.starts.set(name, recent); return false; }
    // 结算音乐短句不叠：新的来了顶掉旧的没有意义，直接保留先到的
    if (this.live.filter((s) => s.group === group).length >= GROUP_MAX[group]) { this.starts.set(name, recent); return false; }
    recent.push(nowMs);
    this.starts.set(name, recent);
    this.live.push({ name, group, end: nowMs + durMs });
    return true;
  }

  active(group?: SfxGroup): number { return group ? this.live.filter((s) => s.group === group).length : this.live.length; }
}

/** 变体参数：音高倍数、时长倍数、亮度（滤波频率）倍数 */
export interface Variant { p: number; l: number; b: number }

export const VARIANTS: readonly Variant[] = [
  { p: 1, l: 1, b: 1 },
  { p: 1.08, l: 0.9, b: 1.18 },
  { p: 0.93, l: 1.12, b: 0.85 },
];

/** 从 count 个变体里挑一个，尽量不和上一次相同 */
export function pickVariant(count: number, last: number, rand: () => number = Math.random): number {
  if (count <= 1) return 0;
  const r = Math.min(count - 2, Math.floor(rand() * (count - 1)));
  return r >= last ? r + 1 : r;
}

/** 变体加一点随机细抖（±jitter），让同一个变体每次也不完全一样 */
export function variantParams(idx: number, rand: () => number = Math.random, jitter = 0.03): Variant {
  const base = VARIANTS[Math.max(0, Math.min(VARIANTS.length - 1, idx))] ?? VARIANTS[0]!;
  const j = (): number => 1 + (rand() * 2 - 1) * jitter;
  return { p: base.p * j(), l: base.l * j(), b: base.b * j() };
}

/** 闪避：大音效响起时，把环境和小音效压到 depth，保持 holdMs 后用 releaseMs 恢复 */
export const DUCK_ATTACK_MS = 30;
const DUCK_MIN_MS = 300;
const DUCK_MAX_MS = 600;

interface DuckPlan { depth: number; holdMs: number; releaseMs: number }

/** 按大音效的时长算闪避：时长 → 压低保持时间，夹在 300–600ms 之间 */
export function duckPlan(soundMs: number, depth = 0.35): DuckPlan {
  const total = Math.max(DUCK_MIN_MS, Math.min(DUCK_MAX_MS, soundMs));
  return { depth, holdMs: Math.round(total * 0.4), releaseMs: Math.round(total * 0.6) };
}

/** 某一刻的闪避增益（线性近似，用来测试和做离线渲染对照）：t 是从大音效开始起的毫秒 */
export function duckGainAt(plan: DuckPlan, tMs: number): number {
  if (tMs <= 0) return 1;
  if (tMs < DUCK_ATTACK_MS) return 1 - (1 - plan.depth) * (tMs / DUCK_ATTACK_MS);
  const hold = DUCK_ATTACK_MS + plan.holdMs;
  if (tMs < hold) return plan.depth;
  const k = (tMs - hold) / plan.releaseMs;
  return k >= 1 ? 1 : plan.depth + (1 - plan.depth) * k;
}

/** 环境声场景：基地、对战（攻防）、守岛 */
export type AmbienceMode = 'off' | 'base' | 'battle' | 'td';

interface AmbienceMix { wave: number; wind: number; bird: number; birdGapMs: [number, number] }

export const AMBIENCE_MIX: Record<AmbienceMode, AmbienceMix> = {
  off: { wave: 0, wind: 0, bird: 0, birdGapMs: [0, 0] },
  base: { wave: 0.11, wind: 0.045, bird: 0.05, birdGapMs: [3500, 9000] },
  battle: { wave: 0.06, wind: 0.085, bird: 0, birdGapMs: [0, 0] },
  td: { wave: 0.075, wind: 0.06, bird: 0.03, birdGapMs: [8000, 18000] },
};

export function nextBirdGap(mode: AmbienceMode, rand: () => number = Math.random): number | null {
  const m = AMBIENCE_MIX[mode];
  if (m.bird <= 0) return null;
  return m.birdGapMs[0] + rand() * (m.birdGapMs[1] - m.birdGapMs[0]);
}

/** 每种声音两次之间至少隔多少毫秒：密集事件（命中、受击叫、开火）靠这个压住，并发上限只管同时在响的个数 */
export const MIN_GAP_MS: Readonly<Record<string, number>> = {
  hit: 70, hitWood: 70, hitStone: 70, hitMetal: 90, error: 250,
  cry: 450, shout: 140, die: 110,
  musket: 80, cannon: 90, mortar: 90, rocket: 90, harpoon: 90, flame: 90, kraken: 150, shock: 120, stun: 200, snipe: 120, guard: 90,
  boom: 80, crumble: 120, splash: 120, land: 100, coin: 70, tap: 40,
};

/** 同名最小间隔：允许就记下这一刻并返回 true */
export class Throttle {
  private last = new Map<string, number>();
  allow(name: string, nowMs: number, gapMs: number): boolean {
    if (gapMs <= 0) return true;
    const l = this.last.get(name);
    if (l !== undefined && nowMs - l < gapMs) return false;
    this.last.set(name, nowMs);
    return true;
  }
}

/** 测试钩子用的计数：请求、放出、被限频丢掉、被并发上限丢掉、没有音频上下文 */
export interface SfxCount { req: number; played: number; gap: number; cap: number; silent: number }
