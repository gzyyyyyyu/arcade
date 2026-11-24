/**
 * 谜题的局面模板（docs/features.md 13.11）：每个模板按种子发出"我的牌、公共牌、对手可能的牌"，下注多少、答案是什么由 index.ts 算。
 * 三类：听牌（算赔率）、成牌（对手的牌里多少比我大）、翻牌前短码（推不推、跟不跟）。
 * 发不出合格的牌（条件太苛刻）就返回 null，调用方换一个随机流再来。
 */
import { shuffle, type RandomStream } from 'arcade-kit/rng';
import { rankOf, suitOf, type Card } from '../core/cards.ts';
import { categoryOf, evalCards, HIGH_CARD, PAIR, STRAIGHT, TRIPS, TWO_PAIR } from '../core/eval.ts';
import { combosWithout, type Combo } from './equity.ts';

type Sizing = 'normal' | 'allin' | 'push' | 'shove';
export type Stage = 'pre' | 'flop' | 'turn' | 'river';

export interface Setup {
  hero: Card[];
  board: Card[];
  range: Combo[];
  /** 对手可能的牌，一句话 */
  rangeText: string;
  /** 局面，一句话 */
  situation: string;
  /** 结论前面的一小句，点出这手牌的特点（"你在听同花，"） */
  flavor: string;
  sizing: Sizing;
  /** 不该加注的局面（我的牌不是拿来要钱的：抓诈唬、没成牌），只给弃牌和跟注 */
  noRaise?: boolean;
  /** 翻牌前：有效筹码（大盲数） */
  stack?: number;
  /** 对手"比你大 / 比你小"的组数（成牌类才有），揭晓时讲 */
  split?: { ahead: number; behind: number };
}

/** 大类：听牌、成牌、翻牌前；每天 5 道尽量三类都有 */
export type Kind = 'draw' | 'made' | 'pre';

export interface Template {
  id: string;
  name: string;
  kind: Kind;
  stage: Stage;
  deal(r: RandomStream): Setup | null;
}

const card = (rank: number, suit: number): Card => rank * 4 + suit;
const RANKS = Array.from({ length: 13 }, (_, i) => i);

/** 不重复地抽 n 张，避开 used */
function draw(r: RandomStream, n: number, used: readonly Card[]): Card[] {
  const taken = [...used];
  const out: Card[] = [];
  while (out.length < n) {
    const c = r.below(52);
    if (!taken.includes(c)) {
      taken.push(c);
      out.push(c);
    }
  }
  return out;
}

const distinctRanks = (cs: readonly Card[]): boolean => new Set(cs.map(rankOf)).size === cs.length;
const suitCount = (cs: readonly Card[]): number[] => {
  const n = [0, 0, 0, 0];
  for (const c of cs) n[suitOf(c)]!++;
  return n;
};
const maxSuit = (cs: readonly Card[]): number => Math.max(...suitCount(cs));
const maxRank = (cs: readonly Card[]): number => Math.max(...cs.map(rankOf));
const otherSuit = (r: RandomStream, not: number): number => (not + 1 + r.below(3)) % 4;

// ---------- 听牌 ----------

interface DrawParts {
  hero: Card[];
  board: Card[];
}

/** 听牌类共用的收尾：牌洗一下顺序、对手范围是"至少一对" */
function drawSetup(r: RandomStream, p: DrawParts, o: { allIn?: boolean; situation: string; flavor: string }): Setup | null {
  const all = [...p.hero, ...p.board];
  if (new Set(all).size !== all.length) return null;
  // 我已经成了顺子以上的（凑巧五张连着）不算听牌
  if (all.length >= 5 && categoryOf(evalCards(all)) >= STRAIGHT) return null;
  const range = combosWithout(all).filter((c) => categoryOf(evalCards([...c, ...p.board])) >= PAIR);
  return {
    hero: p.hero,
    board: shuffle(p.board, r),
    range,
    rangeText: '对手手里至少有一对（他在下注，多半已经有牌了）',
    situation: o.situation,
    flavor: o.flavor,
    sizing: o.allIn ? 'allin' : 'normal',
  };
}

const STREET_TEXT = { 3: '翻牌圈', 4: '转牌圈' } as const;

function flushDraw(len: 3 | 4, allIn: boolean) {
  return (r: RandomStream): Setup | null => {
    const s = r.below(4);
    const rk = shuffle(RANKS, r);
    const board = [card(rk[2]!, s), card(rk[3]!, s), card(rk[4]!, otherSuit(r, s))];
    if (len === 4) board.push(card(rk[5]!, otherSuit(r, s)));
    return drawSetup(r, { hero: [card(rk[0]!, s), card(rk[1]!, s)], board }, {
      allIn,
      situation: `${STREET_TEXT[len]}，你手里两张同花色，桌上还有两张同花色，差一张就成同花。对手${allIn ? '全下' : '下注'}。`,
      flavor: '你差一张成同花，',
    });
  };
}

function openEnder(len: 3 | 4) {
  return (r: RandomStream): Setup | null => {
    const a = r.below(8); // 缺的两头是 a 和 a+5，都得在 2–A 之内
    const far = RANKS.filter((x) => x < a - 1 || x > a + 6);
    const blanks = shuffle(far, r);
    const sh = r.below(4);
    const hero = [card(a + 1, sh), card(a + 2, (sh + 1 + r.below(3)) % 4)];
    const board = [card(a + 3, r.below(4)), card(a + 4, r.below(4)), card(blanks[0]!, r.below(4))];
    if (len === 4) board.push(card(blanks[1]!, r.below(4)));
    const all = [...hero, ...board];
    if (maxSuit(all) >= 3) return null;
    return drawSetup(r, { hero, board }, {
      situation: `${STREET_TEXT[len]}，你手里两张连着，桌上又接着两张，两头都能补成顺子。对手下注。`,
      flavor: '你差两头任一张成顺子，',
    });
  };
}

function gutshot(len: 3 | 4) {
  return (r: RandomStream): Setup | null => {
    const x = r.below(9); // 顺子 x..x+4，缺中间一张
    const miss = 1 + r.below(3);
    const present = [0, 1, 2, 3, 4].filter((k) => k !== miss).map((k) => x + k);
    const sp = shuffle(present, r);
    const far = shuffle(
      RANKS.filter((v) => v < x - 1 || v > x + 5),
      r,
    );
    const hero = [card(sp[0]!, r.below(4)), card(sp[1]!, r.below(4))];
    const board = [card(sp[2]!, r.below(4)), card(sp[3]!, r.below(4)), card(far[0]!, r.below(4))];
    if (len === 4) board.push(card(far[1]!, r.below(4)));
    if (maxSuit([...hero, ...board]) >= 3) return null;
    return drawSetup(r, { hero, board }, {
      situation: `${STREET_TEXT[len]}，你的牌和桌上的牌连成四张，但中间缺一张，只有一种点数能补成顺子。对手下注。`,
      flavor: '你只差中间一张成顺子，',
    });
  };
}

function overcards(r: RandomStream): Setup | null {
  const hi = 8 + r.below(5); // 两张都是 10 以上
  const rk = shuffle(RANKS.filter((x) => x < hi), r);
  const a = hi + r.below(13 - hi);
  const b = hi;
  if (a === b) return null;
  const hero = [card(a, r.below(4)), card(b, r.below(4))];
  const board = [card(rk[0]!, r.below(4)), card(rk[1]!, r.below(4)), card(rk[2]!, r.below(4))];
  if (maxSuit([...hero, ...board]) >= 3 || !distinctRanks(board)) return null;
  return drawSetup(r, { hero, board }, {
    situation: '翻牌圈，你手里两张都比桌上所有牌大，但还没成对。对手下注。',
    flavor: '你只有两张大牌，',
  });
}

function comboDraw(len: 3 | 4, allIn: boolean) {
  return (r: RandomStream): Setup | null => {
    const s = r.below(4);
    const rk = shuffle(RANKS, r);
    // 我的一张和桌上一张成对，我的两张同花，桌上另两张也是这个花色
    const pairRank = rk[0]!;
    const hero = [card(pairRank, s), card(rk[1]!, s)];
    const board = [card(pairRank, otherSuit(r, s)), card(rk[2]!, s), card(rk[3]!, s)];
    if (len === 4) board.push(card(rk[4]!, otherSuit(r, s)));
    const all = [...hero, ...board];
    if (suitCount(all)[s]! !== 4) return null;
    const range = combosWithout(all).filter((c) => categoryOf(evalCards([...c, ...board])) >= PAIR);
    return {
      hero,
      board: shuffle(board, r),
      range,
      rangeText: '对手手里至少有一对（他在下注，多半已经有牌了）',
      situation: `${STREET_TEXT[len]}，你有一对，同时还在听同花。对手${allIn ? '全下' : '下注'}。`,
      flavor: '你有一对，还差一张成同花，',
      sizing: allIn ? 'allin' : 'normal',
    };
  };
}

// ---------- 成牌：对手的牌里有几种比我大 ----------

type HeroPred = (hero: Card[], board: Card[], hv: number) => boolean;

const pocketPair = (h: Card[]): boolean => rankOf(h[0]!) === rankOf(h[1]!);
const holeIn = (h: Card[], board: Card[]): number => h.filter((c) => board.some((b) => rankOf(b) === rankOf(c))).length;

const PRED = {
  topPair: (h, b, v) => categoryOf(v) === PAIR && !pocketPair(h) && h.filter((c) => rankOf(c) === maxRank(b)).length === 1,
  overpair: (h, b, v) => categoryOf(v) === PAIR && pocketPair(h) && rankOf(h[0]!) > maxRank(b),
  secondPair: (h, b, v) => {
    const top = maxRank(b);
    const second = Math.max(...b.map(rankOf).filter((x) => x !== top));
    return categoryOf(v) === PAIR && !pocketPair(h) && h.some((c) => rankOf(c) === second) && !h.some((c) => rankOf(c) === top);
  },
  twoPair: (h, b, v) => categoryOf(v) === TWO_PAIR && !pocketPair(h) && holeIn(h, b) === 2,
  set: (h, b, v) => categoryOf(v) === TRIPS && pocketPair(h) && holeIn(h, b) === 2,
  strong: (_h, b, v) => categoryOf(v) >= STRAIGHT && v > evalCards(b),
  air: (h, _b, v) => categoryOf(v) === HIGH_CARD && Math.max(...h.map(rankOf)) >= 11,
  anyPair: (h, b, v) => categoryOf(v) === PAIR && (pocketPair(h) || holeIn(h, b) >= 1),
} satisfies Record<string, HeroPred>;

interface MixSpec {
  len: 3 | 4 | 5;
  pred: HeroPred;
  sizing: 'normal' | 'allin';
  noRaise?: boolean;
  /** 公共牌里同花色最多几张（不要三张同花的牌面搅局，大牌类放宽） */
  suitCap: number;
  situation: string;
  flavor: string;
}

/**
 * 我的牌合格后，把对手所有可能的牌分成"比我大 / 比我小"两堆，各抽几手拼成他的范围：
 * 数量由种子定，所以同一类局面有时对手多半在诈唬、有时多半是真牌，答案跟着变
 */
function mix(spec: MixSpec) {
  return (r: RandomStream): Setup | null => {
    for (let t = 0; t < 4000; t++) {
      const cs = draw(r, 2 + spec.len, []);
      const hero = cs.slice(0, 2);
      const board = cs.slice(2);
      if (!distinctRanks(board) || maxSuit(board) > spec.suitCap) continue;
      const hv = evalCards(cs);
      if (!spec.pred(hero, board, hv)) continue;
      const ahead: Combo[] = [];
      const behind: Combo[] = [];
      for (const c of combosWithout(cs)) {
        const v = evalCards([...c, ...board]);
        if (v > hv) ahead.push(c);
        else if (v < hv) behind.push(c);
      }
      if (!behind.length) continue;
      const nA = Math.min(ahead.length, 2 + r.below(8));
      const nB = Math.min(behind.length, 1 + r.below(5));
      const range = [...shuffle(ahead, r).slice(0, nA), ...shuffle(behind, r).slice(0, nB)];
      return {
        hero,
        board,
        range,
        rangeText: `对手手里大概是 ${range.length} 种牌之一：${nA} 种比你大，${nB} 种比你小（空手诈唬或牌更差）${board.length < 5 ? '；后面还有牌没发，落后的也能追上' : ''}`,
        situation: spec.situation,
        flavor: spec.flavor,
        sizing: spec.sizing,
        ...(spec.noRaise ? { noRaise: true } : {}),
        split: { ahead: nA, behind: nB },
      };
    }
    return null;
  };
}

// ---------- 翻牌前短码 ----------

/**
 * 陈氏分（Chen formula）：翻牌前一手牌的粗略强度，整数运算（半分按两倍算最后进位）。
 * 谜题里用来划"对手跟多宽的牌"，数值只是排大小，不当作什么权威牌力表
 */
export function chen(a: Card, b: Card): number {
  const ra = Math.max(rankOf(a), rankOf(b));
  const rb = Math.min(rankOf(a), rankOf(b));
  const dbl = (rank: number): number => (rank === 12 ? 20 : rank === 11 ? 16 : rank === 10 ? 14 : rank === 9 ? 12 : rank + 2);
  let s = dbl(ra);
  if (ra === rb) s = Math.max(s * 2, 10);
  else {
    if (suitOf(a) === suitOf(b)) s += 4;
    const gap = ra - rb - 1;
    s -= gap === 0 ? 0 : gap === 1 ? 2 : gap === 2 ? 4 : gap === 3 ? 8 : 10;
    if (gap <= 1 && ra < 10) s += 2;
  }
  return Math.ceil(s / 2);
}

function rangeAtLeast(used: readonly Card[], t: number): Combo[] {
  return combosWithout(used).filter(([a, b]) => chen(a, b) >= t);
}

function push(minStack: number, maxStack: number) {
  return (r: RandomStream): Setup | null => {
    const hero = draw(r, 2, []);
    const stack = minStack + r.below(maxStack - minStack + 1);
    const t = 4 + r.below(3);
    const range = rangeAtLeast(hero, t);
    const pc = Math.round((range.length * 100) / combosWithout(hero).length);
    return {
      hero,
      board: [],
      range,
      rangeText: `大盲只会拿最好的约 ${pc}% 的牌跟你`,
      situation: `你在小盲，只剩 ${stack} 个大盲，前面的人都弃牌了。只能全下或弃牌。`,
      flavor: '',
      sizing: 'push',
      stack,
    };
  };
}

function callShove(minStack: number, maxStack: number) {
  return (r: RandomStream): Setup | null => {
    const hero = draw(r, 2, []);
    const stack = minStack + r.below(maxStack - minStack + 1);
    const t = 3 + r.below(4);
    const range = rangeAtLeast(hero, t);
    const pc = Math.round((range.length * 100) / combosWithout(hero).length);
    return {
      hero,
      board: [],
      range,
      rangeText: `小盲全下的牌约占 ${pc}%（比较宽）`,
      situation: `你在大盲。小盲全下了 ${stack} 个大盲，轮到你：跟还是弃？`,
      flavor: '',
      sizing: 'shove',
      stack,
    };
  };
}

// ---------- 目录 ----------

const mixT = (id: string, name: string, stage: Stage, spec: MixSpec): Template => ({ id, name, kind: 'made', stage, deal: mix(spec) });
const T = (id: string, name: string, stage: Stage, deal: Template['deal']): Template => ({ id, name, kind: stage === 'pre' ? 'pre' : 'draw', stage, deal });

export const TEMPLATES: readonly Template[] = [
  T('fd-flop', '差一张成同花 · 翻牌圈', 'flop', flushDraw(3, false)),
  T('fd-turn', '差一张成同花 · 转牌圈', 'turn', flushDraw(4, false)),
  T('fd-turn-allin', '差一张成同花 · 转牌被全下', 'turn', flushDraw(4, true)),
  T('oesd-flop', '顺子差两头一张 · 翻牌圈', 'flop', openEnder(3)),
  T('oesd-turn', '顺子差两头一张 · 转牌圈', 'turn', openEnder(4)),
  T('gutshot-flop', '顺子差中间一张 · 翻牌圈', 'flop', gutshot(3)),
  T('gutshot-turn', '顺子差中间一张 · 转牌圈', 'turn', gutshot(4)),
  T('overcards-flop', '两张大牌 · 翻牌圈', 'flop', overcards),
  T('combo-flop', '一对加差一张成同花', 'flop', comboDraw(3, false)),
  T('combo-turn-allin', '一对加差一张成同花 · 被全下', 'turn', comboDraw(4, true)),
  mixT('tp-flop', '顶对 · 翻牌圈', 'flop', {
    len: 3, pred: PRED.topPair, sizing: 'normal', suitCap: 2,
    situation: '翻牌圈，你有顶对（和桌上最大的牌配对）。对手下注。', flavor: '你有顶对，',
  }),
  mixT('tp-river', '顶对 · 河牌圈', 'river', {
    len: 5, pred: PRED.topPair, sizing: 'normal', suitCap: 2,
    situation: '河牌圈，牌都发完了，你有顶对。对手下注。', flavor: '你有顶对，',
  }),
  mixT('overpair-turn', '大对子 · 转牌圈', 'turn', {
    len: 4, pred: PRED.overpair, sizing: 'normal', suitCap: 2,
    situation: '转牌圈，你的口袋对子比桌上所有牌都大。对手下注。', flavor: '你有大对子，',
  }),
  mixT('second-pair-river', '二对 · 河牌圈', 'river', {
    len: 5, pred: PRED.secondPair, sizing: 'normal', noRaise: true, suitCap: 2,
    situation: '河牌圈，你只有第二大的一对。对手下注。', flavor: '你只有二对，',
  }),
  mixT('bluffcatch-allin', '抓诈唬 · 河牌被全下', 'river', {
    len: 5, pred: PRED.anyPair, sizing: 'allin', suitCap: 2,
    situation: '河牌圈，你有一对，不算大。对手全下。', flavor: '你只有一对，',
  }),
  mixT('two-pair-flop-allin', '两对 · 翻牌被全下', 'flop', {
    len: 3, pred: PRED.twoPair, sizing: 'allin', suitCap: 2,
    situation: '翻牌圈，你的两张牌都和桌上配了对，是两对。对手全下。', flavor: '你有两对，',
  }),
  mixT('set-flop', '暗三条 · 翻牌圈', 'flop', {
    len: 3, pred: PRED.set, sizing: 'normal', suitCap: 2,
    situation: '翻牌圈，你的口袋对子在桌上又来一张，是三条。对手下注。', flavor: '你有三条，',
  }),
  mixT('nuts-river', '大牌 · 河牌圈', 'river', {
    len: 5, pred: PRED.strong, sizing: 'normal', suitCap: 3,
    situation: '河牌圈，你成了顺子或更大的牌。对手下注。', flavor: '你的牌很大，',
  }),
  mixT('air-river', '没成牌 · 河牌圈', 'river', {
    len: 5, pred: PRED.air, sizing: 'normal', noRaise: true, suitCap: 2,
    situation: '河牌圈，你什么都没中，只有大牌高张。对手下注。', flavor: '你什么都没中，',
  }),
  mixT('pair-turn', '一对 · 转牌圈', 'turn', {
    len: 4, pred: PRED.anyPair, sizing: 'normal', noRaise: true, suitCap: 2,
    situation: '转牌圈，你有一对。对手下注。', flavor: '你有一对，',
  }),
  T('push-short', '小盲短码 · 推不推', 'pre', push(7, 10)),
  T('push-mid', '小盲中短码 · 推不推', 'pre', push(11, 16)),
  T('call-shove', '大盲面对全下', 'pre', callShove(5, 9)),
  T('call-shove-deep', '大盲面对全下 · 更深', 'pre', callShove(10, 15)),
];
