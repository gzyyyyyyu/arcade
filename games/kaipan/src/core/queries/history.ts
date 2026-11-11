/** 开局前的真实历史（只读）。 */
import { BALANCE } from '../balance.ts';
import { stockById } from '../content/index.ts';
import { baseMarketRules, marketReturn, MOODS, rulesOf, warmUpTheme } from '../market.ts';
import { rngFor } from '../rng.ts';
import { isTrack, realStockPct, trackMarketRet, warmHeatSeries } from '../real.ts';
import type { GameState, ThemeId } from '../types.ts';

// ================================================================ 0.5.1 开局前的真实历史（只读）

/** 开局前 warm 天的公开历史：大盘涨跌、个股涨跌（pp，旧 → 新）、风口热度（旧 → 新，最后一项是开局时的热度）。 */
export interface PreHistory {
  /** 天数（= 行情段的 warm）；第 k 项是第 k - days 个交易日 */
  days: number;
  market: number[];
  stocks: Record<string, number[]>;
  heat: Partial<Record<ThemeId, number[]>>;
}

const preCache = new WeakMap<object, PreHistory>();

/** 合成行情补的开局前天数（画面最多看 20 天）。 */
const SYNTH_PRE_DAYS = 20;

/**
 * 画面用：行情段里开局前 warm 天（开局之前，已经发生）的走势，按和交易日一样的放大、涨跌停截断算。
 * 只读这一段开局前的数据，不碰第 0 个交易日以后。0.4 旧档（不照搬个股）只给大盘和风口。
 * 合成行情（离线兜底）没有行情段，见 syntheticPreHistory。
 */
export function preHistory(s: Readonly<GameState>): PreHistory | null {
  const real = s.real;
  if (!real) return syntheticPreHistory(s);
  if (real.warm <= 0) return null;
  const hit = preCache.get(real);
  if (hit) return hit;
  const n = real.warm;
  const market: number[] = [];
  for (let i = 0; i < n; i++) market.push(Math.round(trackMarketRet(real, i) * 100) / 100);
  const stocks: Record<string, number[]> = {};
  if (isTrack(real)) {
    const rules = rulesOf(s);
    for (const id of Object.keys(s.stocks)) {
      if (!real.stocks[id]) continue;
      const def = stockById(id);
      const limit = BALANCE.roles[def.role].limit * rules.limitMult;
      const up = Math.round(limit * rules.limitUpMult * 100) / 100;
      const row: number[] = [];
      for (let i = 0; i < n; i++) {
        const raw = BALANCE.track.amp * realStockPct(real, id, i);
        row.push(Math.round(Math.min(up, Math.max(-limit, raw)) * 100) / 100);
      }
      stocks[id] = row;
    }
  }
  const heat: Partial<Record<ThemeId, number[]>> = {};
  for (const id of s.themeIds) heat[id] = warmHeatSeries(real, id);
  const out = { days: n, market, stocks, heat };
  preCache.set(real, out);
  return out;
}

const synthCache = new Map<string, PreHistory>();

/**
 * 合成行情的开局前走势：重放开局前的风口预跑（和开局时同一串随机数，热度接得上开局状态），
 * 大盘和个股按合成行情的公式另用 'pre*' 随机流补出来。只是给第 1 天的走势图垫底，
 * 不进 state、不消耗对局里的任何随机流，回放结果不变。
 */
function syntheticPreHistory(s: Readonly<GameState>): PreHistory | null {
  const key = `${s.seed}|${s.themeIds.join(',')}|${Object.keys(s.stocks).join(',')}`;
  const hit = synthCache.get(key);
  if (hit) return hit;
  const n = Math.min(SYNTH_PRE_DAYS, BALANCE.warmupDays);
  const at = (d: number): number => d + n;
  const themeRet: Partial<Record<ThemeId, number[]>> = {};
  const heat: Partial<Record<ThemeId, number[]>> = {};
  for (const id of s.themeIds) {
    const rets: number[] = new Array(n).fill(0);
    const heats: number[] = [];
    warmUpTheme(s.seed, id, (d, ret, h) => {
      if (at(d) < 0) return;
      rets[at(d)] = ret;
      heats.push(h);
    });
    themeRet[id] = rets;
    heat[id] = heats;
  }
  const mr = baseMarketRules();
  // 开局时的大盘情绪（和 engine 开局同一个随机流；不用 s.mood，读档时它已经变了）
  const mood = MOODS[rngFor(s.seed, 'mood0').int(MOODS.length)] ?? 'flat';
  const market: number[] = [];
  for (let d = -n; d < 0; d++) market.push(marketReturn(mood, mr, rngFor(s.seed, 'preMarket', d)));
  const rules = rulesOf(s);
  const stocks: Record<string, number[]> = {};
  for (const id of Object.keys(s.stocks)) {
    const def = stockById(id);
    const p = BALANCE.roles[def.role];
    const limit = p.limit * rules.limitMult;
    const up = Math.round(limit * rules.limitUpMult * 100) / 100;
    const tr = themeRet[def.theme];
    const row: number[] = [];
    for (let d = -n; d < 0; d++) {
      const z = rngFor(s.seed, 'preStock', id, d).normal();
      const x = p.beta * (tr?.[at(d)] ?? 0) + p.market * (market[at(d)] ?? 0) + p.noise * z;
      row.push(Math.round(Math.min(up, Math.max(-limit, x)) * 100) / 100);
    }
    stocks[id] = row;
  }
  const out = { days: n, market, stocks, heat };
  synthCache.set(key, out);
  return out;
}
