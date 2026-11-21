/**
 * 谜题计分（docs/features.md 13.11）：整数，每道满分 100，一天 5 道满分 500。
 * 每个选项的 EV 都用题里的赢面 e 和要的赢面 n 算，单位是"最终底池"（含对手这一注和我跟的那份）：
 * - 弃牌 0；
 * - 跟注 / 全下 e − n（赢了拿走底池，输了亏掉跟的那份，n 就是跟的那份占最终底池的比例；翻牌前推牌的 n 是盈亏平衡点，差是同一个量）；
 * - 加注 在跟注上多押一个底池大小的一份，这一份只在被加注后还跟注的对手牌里打，那些牌比整体范围强 22 点（RAISE_EQ 0.72 − 0.5），
 *   所以多出来的是 (1 − n)·(2(e − 0.22) − 1)：e 高过 72% 加注才比跟注赚，和出题时"赢面超过 72% 才加注"是同一条线。
 * 得分 = round(100 × max(0, 1 − 亏损 / 尺度))，亏损是和最优选项的 EV 差，尺度在 index.ts（SCALE、SCALE_RAISE，写了为什么）。
 * 用的都是题里取整过的百分数，测试能原样复算。
 */
import type { ChoiceId, Puzzle } from './index.ts';
import { DAY_SIZE, FULL, dayTotal } from './progress.ts';

export { dayTotal, FULL };
export const DAY_FULL = FULL * DAY_SIZE;
/** 被加注后还跟注的对手牌，比整体范围强多少个点 */
const CALLER_EDGE = 0.22;

/** 每个选项的 EV（最终底池为单位） */
export function evs(p: Pick<Puzzle, 'equity' | 'need' | 'choices'>): Partial<Record<ChoiceId, number>> {
  const e = p.equity / 100;
  const n = p.need / 100;
  const go = e - n;
  const out: Partial<Record<ChoiceId, number>> = { fold: 0 };
  for (const c of p.choices) {
    if (c.id === 'call' || c.id === 'shove') out[c.id] = go;
    if (c.id === 'raise') out.raise = go + (1 - n) * (2 * (e - CALLER_EDGE) - 1);
  }
  return out;
}

/** 这一题选了 pick 得几分（0–100）；不是这一题的选项给 0 */
export function scoreOf(p: Puzzle, pick: string): number {
  const ev = evs(p);
  const mine = ev[pick as ChoiceId];
  if (mine === undefined) return 0;
  const best = Math.max(...Object.values(ev));
  return Math.round(FULL * Math.max(0, 1 - (best - mine) / p.scale));
}

/** 每日榜的榜名（games 登记了 daily:true，public/daily.json 的 puzzle 子榜） */
export const puzzleBoardId = (date: string): string => `daily-${date}-puzzle`;
