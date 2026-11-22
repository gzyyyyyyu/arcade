/**
 * 每日牌局谜题（docs/features.md 13.11）：北京日期 → 当天 5 道题，纯函数，同一天所有人一样。
 * 日期和第几道派生出密钥，按用途 RNG.puzzle 分流；模板轮着用（全部模板洗一遍轮完再洗，一天取 5 个，互不重样、三大类尽量都有）。
 * 答案是算出来的：赢面（翻牌后穷举、翻牌前抽样）对比要的赢面（底池赔率，或者推牌时对手跟注后的盈亏平衡点），
 * 差得不够开的局面（模糊的）直接重发，所以每道题的对错都站得住。
 */
import { shuffle, stream, purposeHash, type Entropy } from 'arcade-kit/rng';
import type { Card } from '../core/cards.ts';
import { evalCards } from '../core/eval.ts';
import { RNG } from '../core/table.ts';
import { dayNumber } from './date.ts';
import { DAY_SIZE } from './progress.ts';
import { exactEquity, sampleEquity, combosWithout } from './equity.ts';
import { TEMPLATES, type Kind, type Setup, type Stage, type Template } from './spots.ts';

export { TEMPLATES } from './spots.ts';
export type { Kind, Template } from './spots.ts';

/** 一天几道题 */
export const PER_DAY = DAY_SIZE;

export type ChoiceId = 'fold' | 'call' | 'raise' | 'shove';
export interface Choice {
  id: ChoiceId;
  label: string;
}

export interface Puzzle {
  date: string;
  /** 当天第几道（0 起） */
  slot: number;
  /** 模板编号、名字和大类 */
  tpl: string;
  name: string;
  kind: Kind;
  stage: Stage;
  hero: Card[];
  /** 已经发出的公共牌（翻牌前是空的） */
  board: Card[];
  /** 底池（含对手这一注）和要跟的数；翻牌前以大盲为单位 */
  pot: number;
  call: number;
  unit: 'chip' | 'bb';
  /** 对手全下：不能加注 */
  allIn: boolean;
  situation: string;
  rangeText: string;
  choices: Choice[];
  answer: ChoiceId;
  /** 计分的尺度（score.ts）：赢面亏损占底池的多少算 0 分 */
  scale: number;
  /** 我的赢面和"至少要多少赢面才不亏"，整数百分比（对错按没取整的算，差都在 4 个点以上） */
  equity: number;
  need: number;
  /** 揭晓时的一句话 */
  why: string;
  /** 抽一次看看：对手亮的牌、剩下发出来的公共牌、这一次的输赢（一次结果说明不了对错） */
  sample: { villain: Card[]; runout: Card[]; result: 'win' | 'lose' | 'tie' };
}

/** 赢面和要求差不到这么多的局面不出（有抽样误差，也免得"勉强对"） */
export const MARGIN = 0.04;
/** 不是全下时，赢面到这个数以上，加注比跟注更好（多数时候领先，要多收钱） */
export const RAISE_EQ = 0.72;
/**
 * 计分尺度（score.ts）：赢面亏损（占最终底池的比例）达到这个数就是 0 分。
 * 一般 0.2：赢面差 20 个点的选错（比如该跟注弃了牌）已经亏掉底池的五分之一，不给分；差 4 个点（刚好够出题的下限）还剩 80 分。
 * 有加注可选的局面 0.3：跟注和加注本来就差得少，少赚的那份按更宽的尺子量，不然"该加注只跟注"几乎要打零分。
 */
export const SCALE = 0.12;
export const SCALE_RAISE = 0.18;
const ATTEMPTS = 120;
const PRE_ITERS = 12_000;
/** 模板轮换用的固定密钥：不跟日期走，所以一轮的顺序只由"第几轮"定 */
const ORDER_KEY: Entropy = [0x7465, 0x7861, 0x7370, 0x757a, 0x7a6c, 0x6573, 0x2d31, 0x3030];

/** 日期和第几道（或别的用途标签）→ 8 个字的密钥 */
const keyOf = (date: string, slot: number | string = 0): Entropy => Array.from({ length: 8 }, (_, i) => purposeHash(`puzzle|${date}|${slot}|${i}`));

/**
 * 按赢面和要求定答案：null 是模糊的局面（调用方重发）。
 * 全下的局面没有加注可选；其余赢面特别高时加注
 */
export function decide(equity: number, need: number, raiseOk: boolean, shove: boolean): ChoiceId | null {
  const go: ChoiceId = shove ? 'shove' : 'call';
  if (equity <= need - MARGIN) return 'fold';
  if (equity < need + MARGIN) return null;
  if (!raiseOk) return go;
  if (equity >= RAISE_EQ + MARGIN) return 'raise';
  if (equity > RAISE_EQ - MARGIN) return null;
  return go;
}

const pct = (x: number): number => Math.round(x * 100);
const round5 = (n: number): number => Math.max(5, Math.round(n / 5) * 5);

/** 下注占底池的比例（分子/分母） */
const BETS: readonly (readonly [number, number])[] = [[1, 4], [1, 3], [1, 2], [2, 3], [3, 4], [1, 1], [1, 1], [3, 2], [2, 1], [2, 1]];
/** 对手全下：他的筹码不一定比底池大多少 */
const OVERBETS: readonly (readonly [number, number])[] = [[1, 2], [2, 3], [1, 1], [3, 2], [2, 1]];

function sentence(a: ChoiceId, s: Setup, equity: number, need: number): string {
  const e = pct(equity);
  const n = pct(need);
  if (s.sizing === 'push') {
    return a === 'shove'
      ? `${s.rangeText.replace('大盲', '他')}，被跟时你只要 ${n}% 胜率就不亏，你有 ${e}%，全下赚。`
      : `被跟时你得有 ${n}% 胜率才不亏，这手牌只有 ${e}%，弃牌更好。`;
  }
  const f = s.flavor;
  if (a === 'fold') return `${f}胜率 ${e}% 不够跟注要的 ${n}%，长期跟就是送钱，弃牌。`;
  if (a === 'raise') return `${f}胜率 ${e}% 远高于要的 ${n}%，别只跟注，加注多收钱。`;
  return s.sizing === 'allin' || s.sizing === 'shove'
    ? `${f}胜率 ${e}% 高过要的 ${n}%，跟上去长期赚钱。`
    : `${f}胜率 ${e}% 高过要的 ${n}%，跟注划算，但还没强到该加注。`;
}

/** 试着出一道题：失败（牌发不出、局面模糊）给 null */
function attempt(tpl: Template, date: string, slot: number, i: number): Puzzle | null {
  const key = keyOf(date, slot);
  const r = stream(key, RNG.puzzle, i);
  const s = tpl.deal(r);
  if (!s?.range.length) return null;

  let pot: number;
  let call: number;
  let equity: number;
  let need: number;
  let unit: 'chip' | 'bb' = 'chip';
  if (s.sizing === 'push') {
    // 我是小盲、有效筹码 S（含已投的 0.5）：对手弃牌赢 1，被跟输赢 ±S，弃牌亏 0.5
    // 盈亏平衡的"被跟时赢面" = (1 + (pc - 1.5) / (pc * S)) / 2，pc 是他跟的比例
    unit = 'bb';
    const S = s.stack!;
    const total = combosWithout(s.hero).length;
    const pc = s.range.length / total;
    pot = 1.5;
    call = S - 0.5;
    equity = sampleEquity(s.hero, s.range, stream(key, RNG.puzzle, 1_000 + i), PRE_ITERS);
    need = Math.max(0, (1 + (pc - 1.5) / (pc * S)) / 2);
  } else if (s.sizing === 'shove') {
    unit = 'bb';
    const S = s.stack!;
    pot = S + 1;
    call = S - 1;
    equity = sampleEquity(s.hero, s.range, stream(key, RNG.puzzle, 1_000 + i), PRE_ITERS);
    need = call / (pot + call);
  } else {
    const p0 = 20 * (2 + r.below(11));
    const [num, den] = (s.sizing === 'allin' ? OVERBETS : BETS)[r.below(s.sizing === 'allin' ? OVERBETS.length : BETS.length)]!;
    call = round5((p0 * num) / den);
    pot = p0 + call;
    equity = exactEquity(s.hero, s.board, s.range);
    need = call / (pot + call);
  }

  const allIn = s.sizing !== 'normal' && s.sizing !== 'push';
  const raiseOk = s.sizing === 'normal' && !s.noRaise;
  const answer = decide(equity, need, raiseOk, s.sizing === 'push');
  if (!answer) return null;
  // 全下局面里"无需加注"；推牌局面跟注叫全下
  const choices: Choice[] =
    s.sizing === 'push'
      ? [{ id: 'fold', label: '弃牌' }, { id: 'shove', label: '全下' }]
      : raiseOk
        ? [{ id: 'fold', label: '弃牌' }, { id: 'call', label: '跟注' }, { id: 'raise', label: '加注' }]
        : [{ id: 'fold', label: '弃牌' }, { id: 'call', label: '跟注' }];

  // 抽一次看看（只是演示，不参与对错）
  const sr = stream(key, RNG.puzzle, 2_000 + i);
  const live = s.range.filter(([a, b]) => !s.hero.includes(a) && !s.board.includes(a) && !s.hero.includes(b) && !s.board.includes(b));
  const villain = [...live[sr.below(live.length)]!];
  const used = [...s.hero, ...s.board, ...villain];
  const runout: Card[] = [];
  while (s.board.length + runout.length < 5) {
    const c = sr.below(52);
    if (!used.includes(c)) {
      used.push(c);
      runout.push(c);
    }
  }
  const full = [...s.board, ...runout];
  const mine = evalCards([...s.hero, ...full]);
  const his = evalCards([...villain, ...full]);

  return {
    date,
    slot,
    tpl: tpl.id,
    name: tpl.name,
    kind: tpl.kind,
    stage: tpl.stage,
    hero: s.hero,
    board: s.board,
    pot,
    call,
    unit,
    allIn,
    situation: s.situation,
    rangeText: s.rangeText,
    choices,
    answer,
    scale: raiseOk ? SCALE_RAISE : SCALE,
    equity: pct(equity),
    need: pct(need),
    why: sentence(answer, s, equity, need),
    sample: { villain, runout, result: mine > his ? 'win' : mine < his ? 'lose' : 'tie' },
  };
}

/** 指定模板出题（测试要逐个模板查）；ATTEMPTS 次都不行给 null */
export function buildPuzzle(tpl: Template, date: string, slot = 0): Puzzle | null {
  for (let i = 0; i < ATTEMPTS; i++) {
    const p = attempt(tpl, date, slot, i);
    if (p) return p;
  }
  return null;
}

const KINDS: readonly Kind[] = ['draw', 'made', 'pre'];

/**
 * 这一天用哪 5 个模板：把全部模板洗成一轮、一轮轮接下去（每轮重新洗，只由"第几轮"定），第 n 天取第 5n..5n+4 个。
 * 取出来再按当天的随机流修两处：一轮的尾和下一轮的头撞上重复的换掉；三大类缺哪类就把多的那类换一个过来。
 * 换的都是同一天里还没用到的模板，所以 5 个互不重样
 */
export function templatesFor(date: string): number[] {
  const n = dayNumber(date);
  if (n === null) throw new Error(`bad puzzle date: ${date}`);
  const len = TEMPLATES.length;
  const pick: number[] = [];
  for (let k = 0; k < PER_DAY; k++) {
    const at = n * PER_DAY + k;
    const cycle = Math.floor(at / len);
    const order = shuffle(Array.from({ length: len }, (_, i) => i), stream(ORDER_KEY, RNG.puzzle, cycle));
    pick.push(order[at - cycle * len]!);
  }
  const r = stream(keyOf(date, 'plan'), RNG.puzzle, 0);
  const kindOf = (i: number): Kind => TEMPLATES[i]!.kind;
  const unused = (kind: Kind): number[] => TEMPLATES.flatMap((t, i) => (t.kind === kind && !pick.includes(i) ? [i] : []));
  for (let k = 1; k < pick.length; k++) {
    if (pick.indexOf(pick[k]!) === k) continue;
    const c = unused(kindOf(pick[k]!));
    pick[k] = c.length ? c[r.below(c.length)]! : unused(KINDS[r.below(3)]!)[0]!;
  }
  for (const kind of KINDS) {
    if (pick.some((i) => kindOf(i) === kind)) continue;
    const count = (x: Kind): number => pick.filter((i) => kindOf(i) === x).length;
    const from = KINDS.reduce((a, b) => (count(b) > count(a) ? b : a));
    const at = pick.map(kindOf).lastIndexOf(from);
    const c = unused(kind);
    pick[at] = c[r.below(c.length)]!;
  }
  return pick;
}

/** 这一天的 5 道题。日期必须是 YYYY-MM-DD；每道题出不来（测试保证不会）就顺延到同大类的下一个模板 */
export function puzzlesFor(date: string): Puzzle[] {
  const plan = templatesFor(date);
  return plan.map((t, slot) => {
    for (let k = 0; k < TEMPLATES.length; k++) {
      const tpl = TEMPLATES[(t + k) % TEMPLATES.length]!;
      if (k && (tpl.kind !== TEMPLATES[t]!.kind || plan.includes((t + k) % TEMPLATES.length))) continue;
      const p = buildPuzzle(tpl, date, slot);
      if (p) return p;
    }
    throw new Error(`no puzzle for ${date} #${slot}`);
  });
}
