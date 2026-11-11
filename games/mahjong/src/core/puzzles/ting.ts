/**
 * 听牌速判的出题和计分（DESIGN.md 7 节）：清一色 13 张，把听的牌全点出来，全对才得分，连对有加成。
 * 纯函数：不碰时间、存储、画面。听哪些牌直接用 core/hand 的 waits（川麻牌型：一般型加七对），不另写一套。
 * 随机只用 arcade-kit/rng 的 stream(key, 'ting', 第几题)，题和题互不影响；
 * 每日一套的种子只由北京日期字符串派生（tingKey），练习的 key 由页面层随机给。
 */
import { stream, type Entropy, type RandomStream } from 'arcade-kit/rng';
import { waits as handWaits, type ShapeRules } from '../hand/index.ts';
import { KINDS, suitKinds, type Kind, type Suit } from '../tiles/index.ts';

/** 川麻的牌型：一般型加七对（龙七对算两对），和每日何切一样 */
const RULES: ShapeRules = { seven: true, sevenQuads: true, kokushi: false };

/** 一轮多少秒（页面层计时，核心不碰时间） */
export const ROUND_SECONDS = 60;
/** 答对一题，听几种每种得几分 */
export const POINTS_PER_WAIT = 10;
/** 连对加成：每个连对多 5 分，连对数最多按 6 算（封顶 30 分） */
export const COMBO_POINTS = 5;
export const COMBO_CAP = 6;

/** 难度档：听的种数范围，和从第几题（0 起）开始 */
export interface Tier {
  /** 档号，0 起 */
  id: number;
  from: number;
  min: number;
  max: number;
}
export const TIERS: readonly Tier[] = [
  { id: 0, from: 0, min: 1, max: 2 },
  { id: 1, from: 2, min: 2, max: 3 },
  { id: 2, from: 5, min: 3, max: 5 },
  { id: 3, from: 9, min: 5, max: 9 },
];

/** 第 i 题（0 起）属于哪一档 */
export function tingTier(i: number): Tier {
  let t = TIERS[0]!;
  for (const x of TIERS) if (i >= x.from) t = x;
  return t;
}

export interface TingQuestion {
  suit: Suit;
  /** 13 张手牌的牌种，从小到大，全在 suit 这一门里 */
  hand: Kind[];
  /** 听的牌种，从小到大，至少 1 种 */
  waits: Kind[];
}

/** 日期（YYYY-MM-DD）→ 种子（8 个 32 位数；盐和何切、每日挑战不同，互不影响） */
export function tingKey(date: string): number[] {
  return Array.from({ length: 8 }, (_, i) => {
    let h = 0x811c9dc5;
    for (const c of `mahjong-ting:${date}:${i}`) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
    return h;
  });
}

/** 精确凑种数的尝试次数、放宽到档位范围的尝试次数（到顶还不行就取最后一个至少听 1 种的；测试保证实际几乎用不到） */
const EXACT_TRIES = 400;
const RANGE_TRIES = 4000;

interface Built {
  suit: Suit;
  /** 这一门九种牌各几张，下标 0–8 */
  c: number[];
}

/**
 * 随机凑一手 13 张：先凑一副完整的 14 张（4 组顺子或刻子加一对，偶尔六对加一对的七对形），再拿掉一张，所以必听牌。
 * 手里 4 张的那种在 waits 里会被排除，听的种数可能比凑的少，由调用方数。
 */
function build(rng: RandomStream): Built | null {
  const suit = rng.below(3) as Suit;
  const c = new Array<number>(9).fill(0);
  if (rng.below(8) === 0) {
    // 七对形：七种不同的对子（龙七对另算，这里不凑四张）
    const picked = new Set<number>();
    while (picked.size < 7) picked.add(rng.below(9));
    for (const r of picked) c[r] = 2;
  } else {
    for (let m = 0; m < 4; m++) {
      if (rng.below(3) === 0) c[rng.below(9)]! += 3;
      else {
        const s = rng.below(7);
        c[s]!++; c[s + 1]!++; c[s + 2]!++;
      }
    }
    c[rng.below(9)]! += 2;
  }
  if (c.some((n) => n > 4)) return null;
  // 拿掉一张
  const tiles: number[] = [];
  c.forEach((n, r) => {
    for (let i = 0; i < n; i++) tiles.push(r);
  });
  c[tiles[rng.below(tiles.length)]!]!--;
  return { suit, c };
}

function waitsOf(b: Built): Kind[] {
  const counts = new Array<number>(KINDS).fill(0);
  b.c.forEach((n, r) => {
    counts[b.suit * 9 + r] = n;
  });
  return handWaits(counts, 0, RULES, suitKinds(b.suit));
}

/** 听哪些牌（13 张）：测试和页面都用它，和出题是同一个算法 */
export function tingWaits(hand: readonly Kind[]): Kind[] {
  const counts = new Array<number>(KINDS).fill(0);
  for (const k of hand) counts[k]!++;
  const suit = Math.floor(hand[0]! / 9) as Suit;
  return handWaits(counts, 0, RULES, suitKinds(suit));
}

const toQuestion = (b: Built, w: Kind[]): TingQuestion => {
  const hand: Kind[] = [];
  b.c.forEach((n, r) => {
    for (let i = 0; i < n; i++) hand.push(b.suit * 9 + r);
  });
  return { suit: b.suit, hand, waits: w };
};

/** 第 i 题（0 起）。同一个 key 同一个 i 永远出同一题 */
export function tingQuestion(key: Entropy, i: number): TingQuestion {
  const rng = stream(key, 'ting', i);
  const tier = tingTier(i);
  const target = tier.min + rng.below(tier.max - tier.min + 1);
  let loose: TingQuestion | null = null;
  let any: TingQuestion | null = null;
  for (let t = 0; t < EXACT_TRIES + RANGE_TRIES; t++) {
    const b = build(rng);
    if (!b) continue;
    const w = waitsOf(b);
    if (w.length === 0) continue;
    if (t < EXACT_TRIES) {
      if (w.length === target) return toQuestion(b, w);
    } else if (w.length >= tier.min && w.length <= tier.max) return toQuestion(b, w);
    if (!loose && w.length >= tier.min) loose = toQuestion(b, w);
    any = toQuestion(b, w);
  }
  // 兜底：同一个 rng 往下再凑，直到有一手听牌（凑出来的一定听，几乎一次就成）
  for (let n = 0; !any && n < 100000; n++) {
    const b = build(rng);
    const w = b ? waitsOf(b) : [];
    if (b && w.length) any = toQuestion(b, w);
  }
  return loose ?? any!;
}

// ---------- 判题和计分 ----------

export interface Judged {
  /** 选的集合正好等于听的集合 */
  ok: boolean;
  /** 听、也选了的 */
  hit: Kind[];
  /** 听、但没选的 */
  missed: Kind[];
  /** 选了、但不听的 */
  wrong: Kind[];
}

export function judge(waits: readonly Kind[], picks: readonly Kind[]): Judged {
  const pick = new Set(picks);
  const want = new Set(waits);
  const asc = (a: Kind, b: Kind): number => a - b;
  const hit = waits.filter((k) => pick.has(k)).sort(asc);
  const missed = waits.filter((k) => !pick.has(k)).sort(asc);
  const wrong = [...pick].filter((k) => !want.has(k)).sort(asc);
  return { ok: waits.length > 0 && missed.length === 0 && wrong.length === 0, hit, missed, wrong };
}

/** 答对一题得几分：10 × 听的种数 + 5 × min(连对数, 6)；连对数是答这题之前已经连对几题，第一题加成为 0 */
export function scoreOf(nWaits: number, combo: number): number {
  return POINTS_PER_WAIT * nWaits + COMBO_POINTS * Math.min(Math.max(combo, 0), COMBO_CAP);
}

export interface RoundState {
  score: number;
  /** 答了几题 */
  answered: number;
  correct: number;
  /** 现在连对几题 */
  streak: number;
  bestStreak: number;
}

export const startRound = (): RoundState => ({ score: 0, answered: 0, correct: 0, streak: 0, bestStreak: 0 });

/** 一次作答：返回新状态和这一题得的分（答错 0 分、连击清零） */
export function answer(s: RoundState, waits: readonly Kind[], picks: readonly Kind[]): { state: RoundState; judged: Judged; gain: number } {
  const judged = judge(waits, picks);
  const gain = judged.ok ? scoreOf(waits.length, s.streak) : 0;
  const streak = judged.ok ? s.streak + 1 : 0;
  return {
    judged,
    gain,
    state: {
      score: s.score + gain,
      answered: s.answered + 1,
      correct: s.correct + (judged.ok ? 1 : 0),
      streak,
      bestStreak: Math.max(s.bestStreak, streak),
    },
  };
}
