/**
 * 斗地主"每日残局"的生成器（docs/doudizhu.md 第 6 节）：只看日期字符串，任何机器算出同一道题。
 * 三家小手牌明牌，地主先出；求解器验过"地主必胜"，且不算太容易（必胜着法占首出着法的一半以下、至少 3 手）。
 * 不满足就换下一个子种子重发，直到找到；搜索节点有预算，候选太难算也换下一个。纯函数，随机只用 rngFor。
 */
import { type Card, rankOf } from '../../../core/cards.ts';
import { rngFor } from '../../../core/rng.ts';
import { ddzValue } from '../core/patterns.ts';
import type { DdzPuzzle } from './puzzles.ts';
import { rootMoves, solve, withBudget } from './solver.ts';
import { puzzleState } from './state.ts';

export interface DailyPuzzle extends DdzPuzzle {
  /** 北京时间日期 YYYY-MM-DD */
  date: string;
  /** 地主最少要出几手才稳赢 */
  plays: number;
  /** 第几个子种子才找到（0 = 第一个） */
  attempt: number;
}

/**
 * 地主 6–7 张、农民各 5 张。原定 6–9 / 5–8，但求解的节点数随牌数爆炸，满足条件的题又只有百分之几，
 * 浏览器里生成（中等手机约慢 4 倍）要 ≤ 1.5 秒，所以收紧到这里，再配合下面的连续点数和较小的预算（本机 120 天扫描最慢约 0.3 秒）
 */
const LANDLORD_MIN = 6;
const LANDLORD_SPAN = 2;
const FARMER_MIN = 5;
const FARMER_SPAN = 1;
const DAILY_RANKS = 5;
/** 每个候选的搜索节点预算（超了就换下一个；调大反而更慢：每个候选都多算，而难算的题本来就不要）和最多换几次 */
export const DAILY_BUDGET = 4000;
export const DAILY_MAX_ATTEMPTS = 400;
/** 难度约束：必胜首出占比上限、最少手数 */
export const DAILY_MAX_WIN_SHARE = 0.5;
export const DAILY_MIN_PLAYS = 3;

/** 名字 = 前缀 + 后缀，四个字 */
const NAME_HEAD = ['连环', '暗度', '险中', '孤注', '绝地', '巧布', '步步', '三军', '一子', '先声', '回马', '王炸'];
const NAME_TAIL = ['飞机', '陈仓', '求胜', '一掷', '反击', '破局', '翻盘', '夺先', '出奇', '收官', '压阵', '突围'];

/** 分数：越高越好。用时（秒）、重来次数、提示次数 */
export function dailyPuzzleScore(seconds: number, tries: number, hints: number): number {
  const s = Math.max(0, Math.floor(seconds));
  return Math.max(10, 600 - s - 30 * Math.max(0, tries) - 60 * Math.max(0, hints));
}

/**
 * 发一副：只用一段连续的点数（DAILY_RANKS 个，3..A 里随机一段，2 和两张王各一半机会加入）。
 * 牌少、点数集中，同点数的牌多，三家的着法少，求解才快（整副 54 张里随便抽 20 来张，几乎都算不完或地主必输）；连续的点数还留着出顺子的可能。
 */
function dealFor(date: string, attempt: number): Card[][] {
  const rng = rngFor('ddz-pz-daily', date, attempt);
  const start = rng.int(12 - DAILY_RANKS + 1) + 1;
  const ranks = Array.from({ length: DAILY_RANKS }, (_, i) => start + i);
  if (rng.int(2)) ranks.push(0);
  const pool = ranks.flatMap((r) => [0, 1, 2, 3].map((s) => s * 13 + r));
  if (rng.int(2)) pool.push(52);
  if (rng.int(2)) pool.push(53);
  const deck = rng.shuffle(pool);
  const sizes = [LANDLORD_MIN + rng.int(LANDLORD_SPAN), FARMER_MIN + rng.int(FARMER_SPAN), FARMER_MIN + rng.int(FARMER_SPAN)];
  let at = 0;
  return sizes.map((n) => {
    const h = deck.slice(at, at + n).sort((a, b) => a - b);
    at += n;
    return h;
  });
}

/** 按这一题的特点挑一句提示（不剧透具体出法） */
function tipOf(hands: readonly (readonly Card[])[], plays: number, rng: ReturnType<typeof rngFor>): string {
  const count = (h: readonly Card[]): Map<number, number> => {
    const m = new Map<number, number>();
    for (const c of h) m.set(ddzValue(c), (m.get(ddzValue(c)) ?? 0) + 1);
    return m;
  };
  const mine = count(hands[0]!);
  const hasRocket = hands[0]!.some((c) => rankOf(c) === 17) && hands[0]!.some((c) => rankOf(c) === 16);
  const myBomb = [...mine.values()].some((n) => n === 4);
  const foeBomb = [1, 2].some((i) => [...count(hands[i]!).values()].some((n) => n === 4));
  const foeRocket = [1, 2].some((i) => hands[i]!.some((c) => rankOf(c) === 17) && hands[i]!.some((c) => rankOf(c) === 16));
  const triples = [...mine.values()].filter((n) => n >= 3).length;
  const pairs = [...mine.values()].filter((n) => n === 2).length;
  const pool: string[] = [];
  if (hasRocket) pool.push('王炸在手，别急着用，留到最后抢先手。');
  if (myBomb) pool.push('炸弹留着，拿它抢最后的先手。');
  if (foeBomb) pool.push('对方有炸弹，想好它炸过来之后怎么办。');
  if (foeRocket) pool.push('对方手里有王炸，大牌别随便打出去。');
  if (triples >= 2) pool.push('两组三张挨在一起，说不定能连着走。');
  else if (triples === 1) pool.push('三张不一定整着出，带上单牌或拆开用。');
  if (pairs >= 2) pool.push('先出小对子试探，大对子留着压回来。');
  if (plays >= 5) pool.push('手数不少，每一步都要算。');
  pool.push('有时候“不要”才是好牌。', '容易被压住的牌，留到最后一手出。');
  return rng.pick(pool);
}

/** 一个候选够不够格，够格返回地主最少手数。先看首出着法（输的、太容易的、算不完的最先被筛掉），最后才求最少手数 */
function qualifies(hands: readonly (readonly Card[])[]): number | null {
  const s = puzzleState({ id: 'probe', name: '', tip: '', hands });
  const roots = withBudget(DAILY_BUDGET, () => rootMoves(s));
  if (!roots || roots.length === 0) return null;
  const wins = roots.filter((r) => r.wins).length;
  if (wins === 0 || wins / roots.length > DAILY_MAX_WIN_SHARE) return null;
  const sol = withBudget(DAILY_BUDGET, () => solve(s));
  return sol?.win && (sol.plays ?? 0) >= DAILY_MIN_PLAYS ? sol.plays! : null;
}

/** 这一天的残局。同一个日期结果永远一样；找不到时（极不可能）抛错，测试扫过未来 60 天 */
export function dailyPuzzle(date: string): DailyPuzzle {
  for (let attempt = 0; attempt < DAILY_MAX_ATTEMPTS; attempt++) {
    const hands = dealFor(date, attempt);
    const plays = qualifies(hands);
    if (plays === null) continue;
    const rng = rngFor('ddz-pz-daily-name', date);
    return {
      id: `daily-${date}`,
      name: `${rng.pick(NAME_HEAD)}${rng.pick(NAME_TAIL)}`,
      tip: tipOf(hands, plays, rng),
      hands,
      date,
      plays,
      attempt,
    };
  }
  throw new Error(`每日残局 ${date}：${DAILY_MAX_ATTEMPTS} 次都没找到合格的题`);
}
