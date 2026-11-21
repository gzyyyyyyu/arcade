/**
 * 结算的"大牌"判定和动画节奏（纯函数，不碰 DOM，好单测）。
 * 为什么单拎出来：多大算大牌、各种设置下动画开多少，要在文档里写死、在测试里钉住；画面层（view/settle-fx.ts）只照着做。
 */

/** 0 不算大牌；1 大牌（川麻 ≥ 3 番，立直跳满、倍满、三倍满）；2 特大（川麻封顶，立直役满含累计役满） */
export type BigTier = 0 | 1 | 2;

/** 川麻：3 番起算大牌，封顶（含天胡地胡）或 5 番起算特大 */
export function xzTier(fan: number, capped: boolean): BigTier {
  if (capped || fan >= 5) return 2;
  return fan >= 3 ? 1 : 0;
}

/** 立直：跳满及以上算大牌，役满（含累计役满）特大；满贯不算 */
export function rcTier(limit: 'none' | 'mangan' | 'haneman' | 'baiman' | 'sanbaiman' | 'yakuman'): BigTier {
  if (limit === 'yakuman') return 2;
  return limit === 'haneman' || limit === 'baiman' || limit === 'sanbaiman' ? 1 : 0;
}

/** 当前的设置：turbo 是网址带 ?turbo（冒烟、加速），fast 是"快速"档，lite 是省内存设备，reduced 是系统"减少动态效果" */
export interface FxEnv {
  turbo: boolean;
  fast: boolean;
  lite: boolean;
  reduced: boolean;
}

interface Pacing {
  /** false：不放番型依次亮起，直接是最终状态 */
  reveal: boolean;
  /** 每条番型之间隔多久（毫秒）；0 = 同时出现，不做进场动画 */
  stepMs: number;
  /** 总数从 0 滚到终值用多久；0 = 不滚 */
  rollMs: number;
}

/** 番型依次亮起的节奏：条数少慢一点（180），多了加快（150 / 120），一局最长约 1.5 秒；快速档、省内存减半 */
export function pacingOf(items: number, env: FxEnv): Pacing {
  if (env.turbo) return { reveal: false, stepMs: 0, rollMs: 0 };
  const base = items <= 6 ? 180 : items <= 10 ? 150 : 120;
  // 减少动态效果：只保留数字，番型不做进场动画，总数照滚
  if (env.reduced) return { reveal: true, stepMs: 0, rollMs: env.fast ? 250 : 400 };
  const half = env.fast || env.lite;
  return { reveal: true, stepMs: Math.round(half ? base / 2 : base), rollMs: half ? 300 : 600 };
}

export type CheerSfx = 'fanSoft' | 'fanBig' | 'fanGrand';

export interface Celebration {
  sound: CheerSfx;
  /** 撒金粒子个数，0 = 不放粒子 */
  particles: number;
  /** 金色光圈，false = 不放（减少动态效果） */
  ring: boolean;
  /** 整段特效的总时长（毫秒，含最晚的粒子；CSS 动画要在这之内放完，上限 1500） */
  ms: number;
}

/** 这一局最大的牌（tier）该放什么。mine：是自己胡的；别人胡的只放轻的版本（轻声、少粒子、短）。tier 0 或加速时不放 */
export function celebrationOf(tier: BigTier, mine: boolean, env: FxEnv): Celebration | null {
  if (tier === 0 || env.turbo) return null;
  const sound: CheerSfx = !mine ? 'fanSoft' : tier === 2 ? 'fanGrand' : 'fanBig';
  const full = !mine ? 8 : tier === 2 ? 44 : 28;
  const ms = !mine ? 900 : tier === 2 ? 1500 : 1300;
  // 减少动态效果：只保留数字和声音；省内存设备：不放粒子，光圈保留（只动 opacity）；快速档粒子减半
  if (env.reduced) return { sound, particles: 0, ring: false, ms: 0 };
  if (env.lite) return { sound, particles: 0, ring: true, ms: Math.round(ms * 0.7) };
  return { sound, particles: env.fast ? Math.round(full / 2) : full, ring: true, ms: env.fast ? Math.round(ms * 0.8) : ms };
}

/** 一局里最大的牌：取各个胡牌的最大档；有自己的大牌就按自己的算，否则按别人的最大档 */
export function bestOf(wins: readonly { tier: BigTier; mine: boolean }[]): { tier: BigTier; mine: boolean } {
  let mine: BigTier = 0;
  let other: BigTier = 0;
  for (const w of wins) {
    if (w.mine) mine = Math.max(mine, w.tier) as BigTier;
    else other = Math.max(other, w.tier) as BigTier;
  }
  return mine > 0 ? { tier: mine, mine: true } : { tier: other, mine: false };
}
