/**
 * 大场面（docs/scenes.md 8.10）：全下以后补发公共牌时每家的实时胜率、大牌庆祝的档次、被逆转、池子大小对应的筹码声。
 * 纯函数，只吃摊牌时真的亮出来的牌（HandResult.shown 和公共牌），没亮的牌一概不碰；画面（view/table.ts、fx.ts、sound.ts）读它的结果。
 * 算法全用整数：同样的牌总是同样的数，不依赖平台的数学函数；抽样用 arcade-kit/rng 的流（用途 RNG.runout，密钥由亮出来的牌算），不用 Math.random。
 */
import type { Card } from '../core/cards.ts';
import { categoryOf, evalCards, FULL_HOUSE, QUADS, STRAIGHT_FLUSH } from '../core/eval.ts';
import { RNG, type HandResult } from '../core/table.ts';
import { ENTROPY_WORDS, stream } from 'arcade-kit/rng';

/** 1–9 的最小公倍数：平局按人数分，每份都是整数 */
const LCM = 2520;
/** 缺的公共牌多于两张时（翻牌或翻牌前就全下）抽样的次数；缺 ≤ 2 张时穷举，是准的 */
const SAMPLES = 600;

/**
 * 每家现在的胜率（千分数，平分按人数分）：holes 是各家亮出来的两张，board 是已经翻开的公共牌。
 * 缺的公共牌 ≤ 2 张穷举，再多就抽 SAMPLES 次。
 */
export function runoutEquity(holes: readonly (readonly Card[])[], board: readonly Card[]): number[] {
  const n = holes.length;
  const out = new Array<number>(n).fill(0);
  if (n === 0) return out;
  const need = 5 - board.length;
  const used = new Set<number>([...board, ...holes.flat()]);
  const rest: Card[] = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) rest.push(c);
  const score = new Array<number>(n).fill(0);
  let runs = 0;
  const run = (extra: readonly Card[]): void => {
    const full = [...board, ...extra];
    let best = -1;
    let who: number[] = [];
    for (let i = 0; i < n; i++) {
      const v = evalCards([...holes[i]!, ...full]);
      if (v > best) {
        best = v;
        who = [i];
      } else if (v === best) who.push(i);
    }
    for (const i of who) score[i]! += LCM / who.length;
    runs++;
  };
  if (need <= 0) run([]);
  else if (need === 1) for (const a of rest) run([a]);
  else if (need === 2) {
    for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) run([rest[i]!, rest[j]!]);
  } else {
    // 密钥只由亮出来的牌决定：同样的牌永远同样的数，不同的局面互不相干
    const key = new Array<number>(ENTROPY_WORDS).fill(0);
    used.forEach((c, i) => (key[i % ENTROPY_WORDS] = (Math.imul(key[i % ENTROPY_WORDS]!, 53) + c + 1) >>> 0));
    const rng = stream(key, RNG.runout);
    const deck = [...rest];
    for (let k = 0; k < SAMPLES; k++) {
      // 只洗前 need 张
      for (let i = 0; i < need; i++) {
        const j = i + rng.below(deck.length - i);
        const t = deck[i]!;
        deck[i] = deck[j]!;
        deck[j] = t;
      }
      run(deck.slice(0, need));
    }
  }
  for (let i = 0; i < n; i++) out[i] = Math.floor((score[i]! * 1000) / (LCM * runs));
  return out;
}

/** 庆祝的档次：1 = 葫芦、同花顺以下的大牌里的葫芦（葫芦及以上、四条以下），2 = 四条、同花顺、皇家同花顺 */
interface Celebration {
  seat: number;
  tier: 1 | 2;
  /** 横幅上的字 */
  text: string;
}

/** 皇家同花顺：同花顺里最高张是 A（牌力值最低 4 位是最高张 + 1） */
const isRoyal = (value: number): boolean => categoryOf(value) === STRAIGHT_FLUSH && (value & 15) - 1 === 12;

/**
 * 摊牌赢的牌是葫芦或更大就庆祝：取赢了池子的人里亮出来最大的那手。弃牌赢没摊牌、没亮出来的不算（只看亮出的牌）。
 * 只有输的人亮了大牌（赢家牌小）不会触发，因为只认赢家
 */
export function celebration(r: HandResult): Celebration | null {
  if (r.byFold) return null;
  const won = new Set(r.pots.flatMap((p) => p.winners.map((w) => w.seat)));
  const best = r.shown.filter((s) => won.has(s.seat)).sort((a, b) => b.value - a.value)[0];
  if (!best) return null;
  const cat = categoryOf(best.value);
  if (cat < FULL_HOUSE) return null;
  if (isRoyal(best.value)) return { seat: best.seat, tier: 2, text: '皇家同花顺！' };
  if (cat === STRAIGHT_FLUSH) return { seat: best.seat, tier: 2, text: '同花顺！' };
  if (cat === QUADS) return { seat: best.seat, tier: 2, text: '四条！' };
  return { seat: best.seat, tier: 1, text: '葫芦！' };
}

/** 转牌时领先到这个胜率（千分数）还输了，才算被逆转 */
export const BAD_BEAT = 800;

interface BadBeat {
  winner: number;
  loser: number;
  /** 输家在转牌时的胜率（千分数） */
  equity: number;
}

/**
 * 被逆转：河牌发出来以后，主池的赢家不是转牌时领先的那个——转牌时（四张公共牌）亮出来的牌里，
 * 有输家的胜率 ≥ 80%。要摊牌、五张公共牌都发了、至少两家亮牌，主池平分不算。
 */
export function badBeat(r: HandResult): BadBeat | null {
  if (r.byFold || r.board.length < 5 || r.shown.length < 2) return null;
  const main = r.pots[0]?.winners ?? [];
  if (main.length !== 1) return null;
  const winner = main[0]!.seat;
  const eq = runoutEquity(
    r.shown.map((s) => s.hole),
    r.board.slice(0, 4),
  );
  let loser = -1;
  let top = 0;
  r.shown.forEach((s, i) => {
    if (s.seat !== winner && eq[i]! >= BAD_BEAT && eq[i]! > top) {
      top = eq[i]!;
      loser = s.seat;
    }
  });
  return loser < 0 ? null : { winner, loser, equity: top };
}

/**
 * 池子多大：0 小（十个大盲以内）、1 中、2 大（四十个大盲以上）、3 特大（一百五十个大盲以上）。
 * 筹码声按它换：小的叮一下，大的一串哗啦，特大的再加低频的堆叠声
 */
export function potTier(total: number, bb: number): 0 | 1 | 2 | 3 {
  const k = bb > 0 ? total / bb : 0;
  return k >= 150 ? 3 : k >= 40 ? 2 : k >= 10 ? 1 : 0;
}
