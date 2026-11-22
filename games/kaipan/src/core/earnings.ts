/**
 * 0.36 财报周：真实行情的普通局，3 / 6 / 9 / 12 月各一次（短局只有 3 月）。
 * 月初第一个交易日盘前预告「某只在场股票这周第 N 天出财报，要有大动静」，不说方向；
 * 几位老群友各押一个方向；出财报那天收盘后揭晓「超预期 / 暴雷」和谁押对了。
 *
 * 只读不改局面：不进 GameState、不改涨跌、不碰别的随机流（用途名 `earnings*`），
 * 所以加不加它，同种子同操作的结算逐位相同。挑哪只、哪天，用行情段这个月真实涨跌绝对值最大的那一格
 * ——和黑天鹅预告同一口径：透露「会有大动静」，方向只有群友的押注（按各自靠谱度说对）。
 */
import { BALANCE } from './balance.ts';
import { friendById, stockById, stocksOf } from './content/index.ts';
import { friendForm, topicsOf } from './chat.ts';
import { daysInMonth, lastDayIndex, runMonths } from './engine/calendar.ts';
import { realStockPct, tapeIndex } from './real.ts';
import { rngFor } from './rng.ts';
import { isRegularRun } from './tempo.ts';
import type { GameState } from './types.ts';

export const EARNINGS_MONTHS: readonly number[] = [3, 6, 9, 12];

/** 最多几位群友押方向 */
const BETTORS = 3;

export interface EarningsPlan {
  month: number;
  stockId: string;
  /** 预告那天（这个月第一个交易日，全局 dayIndex） */
  announce: number;
  /** 出财报那天（全局 dayIndex；那天收盘揭晓） */
  day: number;
  /** 这个月第几个交易日出（1 起，给画面写「第 N 天」） */
  nth: number;
}

export interface EarningsBet {
  friendId: string;
  up: boolean;
}

function monthStart(month: number): number {
  let n = 0;
  for (let m = 1; m < month; m++) n += daysInMonth(m);
  return n;
}

/** 这一局 month 月有没有财报周、是哪只哪天；没有为 null。只看种子、行情段和本局风口，整局不变。 */
export function earningsPlan(s: Readonly<GameState>, month: number): EarningsPlan | null {
  const real = s.real;
  if (!real || !isRegularRun(real, s.setup)) return null;
  if (!EARNINGS_MONTHS.includes(month) || month > runMonths(s)) return null;
  const start = monthStart(month);
  const last = lastDayIndex(s);
  let best: { id: string; day: number; v: number } | null = null;
  // 第 2 个交易日起（预告当天不出），避开整局最后一天（黑天鹅）
  for (let d = start + 1; d < start + daysInMonth(month) && d < last; d++) {
    for (const t of s.themeIds) {
      for (const def of stocksOf(t)) {
        if (!real.stocks[def.id]) continue;
        const v = Math.abs(realStockPct(real, def.id, tapeIndex(real, d)));
        if (!best || v > best.v) best = { id: def.id, day: d, v };
      }
    }
  }
  return best && best.v > 0 ? { month, stockId: best.id, announce: start, day: best.day, nth: best.day - start + 1 } : null;
}

/** 群友押注：开局就在群里的老群友挑几位，按各自对这个风口的靠谱度说对（隐藏的真相只用来定对错，不直接显示）。 */
export function earningsBets(s: Readonly<GameState>, plan: Readonly<EarningsPlan>): EarningsBet[] {
  const real = s.real;
  if (!real) return [];
  const up = realStockPct(real, plan.stockId, tapeIndex(real, plan.day)) > 0;
  const theme = stockById(plan.stockId).theme;
  const rng = rngFor(s.seed, 'earnings', plan.month);
  const pool = s.friends.filter((f) => friendById(f.id).founding);
  const picked: typeof pool = [];
  const left = [...pool];
  while (picked.length < BETTORS && left.length > 0) picked.push(...left.splice(rng.int(left.length), 1));
  return picked.map((f) => {
    const [expert, other] = BALANCE.intel.cred[f.id] ?? [0.5, 0.5];
    const p = Math.min(0.95, Math.max(0.05, (topicsOf(s, f).includes(theme) ? expert : other) + friendForm(s, f.id).cred));
    const right = rngFor(s.seed, 'earningsBet', plan.month, f.id).next() < p;
    return { friendId: f.id, up: right ? up : !up };
  });
}

export interface EarningsView {
  stockId: string;
  name: string;
  /** 'soon'：预告中（盘前，还没出）；'today'：今天收盘出；'done'：昨天出了，揭晓 */
  stage: 'soon' | 'today' | 'done';
  /** 还有几个交易日出（今天出为 0） */
  daysLeft: number;
  nth: number;
  bets: { friendId: string; name: string; up: boolean; right?: boolean }[];
  /** 揭晓后：那天的涨跌（pp，已发生）、超预期还是暴雷 */
  move?: number;
  beat?: boolean;
}

/** 盘前群聊里的财报横条：预告到出的那天，以及第二天揭晓；别的时候为 null。 */
export function earningsView(s: Readonly<GameState>): EarningsView | null {
  if (s.phase !== 'premarket') return null;
  const plan = earningsPlan(s, s.month) ?? (s.month > 1 ? earningsPlan(s, s.month - 1) : null);
  if (!plan || s.dayIndex < plan.announce || s.dayIndex > plan.day + 1) return null;
  const name = stockById(plan.stockId).name;
  const bets = earningsBets(s, plan).map((b) => ({ ...b, name: friendById(b.friendId).name }));
  if (s.dayIndex <= plan.day) {
    const daysLeft = plan.day - s.dayIndex;
    return { stockId: plan.stockId, name, stage: daysLeft === 0 ? 'today' : 'soon', daysLeft, nth: plan.nth, bets };
  }
  // 揭晓：出财报那天的涨跌已经发生，读局面里公开的 move
  const move = s.stocks[plan.stockId]?.move ?? 0;
  const beat = move > 0;
  return { stockId: plan.stockId, name, stage: 'done', daysLeft: 0, nth: plan.nth, bets: bets.map((b) => ({ ...b, right: b.up === beat })), move, beat };
}
