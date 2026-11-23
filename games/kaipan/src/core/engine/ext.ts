/** 仓位、押跌、抵押：份额计算、银行检查，以及能不能卖、是不是加班日。 */
import { BALANCE } from '../balance.ts';
import { EXT_REACT_LINES, collateralTerms } from '../content/index.ts';
import { round2, rulesOf } from '../market.ts';
import { rngFor } from '../rng.ts';
import { isEaseRun, tapeIndex } from '../real.ts';
import type { BuySize, CollateralId, ExtState, Loan, Comment, GameState, Holding } from '../types.ts';
import { isFlash } from './calendar.ts';
import { setAccount } from './holdings.ts';
import { type Emitter, emit } from './shared.ts';

// ================================================================ 仓位、押跌、抵押

/** 一格持仓占几份钱（缺省 1 份 = 0.3 的一格）。 */
export function unitsOf(h: Readonly<Holding> | null | undefined): number {
  return h ? (h.units ?? 1) : 0;
}

/** 已经用掉的份数。 */
export function usedUnits(s: Readonly<GameState>): number {
  let n = 0;
  for (const h of s.slots) n += unitsOf(h);
  return n;
}

/** 还剩几份现金（总份数 = 格子数）；except 给出时把那一格当成卖掉（换股用）。 */
export function freeUnits(s: Readonly<GameState>, except?: number): number {
  const back = except !== undefined ? unitsOf(s.slots[except]) : 0;
  return Math.max(0, round2(s.slots.length - usedUnits(s) + back));
}

/** 按仓位选项算这次买几份（不够最小一份时为 0）。 */
export function sizeUnits(s: Readonly<GameState>, size: BuySize, except?: number): number {
  const free = freeUnits(s, except);
  const E = BALANCE.ext;
  const want = size === 'heavy' ? free : size === 'half' ? E.half : E.taste;
  const u = Math.min(want, free);
  return u + 1e-9 >= E.minUnit ? u : 0;
}

/**
 * 押跌的顺风逆风（pp / 天）：大环境最近在涨，押跌逆风；在跌，押跌顺风。
 * 真实行情看开盘前 20 个交易日大盘的累计涨跌（× shortWeather / 2，封顶 ±1.5 × shortWeather）；合成行情看今天的天气（晴 −、雨 +）。
 */
export function shortWind(s: Readonly<GameState>, mood: GameState['mood']): number {
  const k = BALANCE.ext.shortWeather;
  const real = s.real;
  if (!real) return mood === 'bull' ? -k : mood === 'bear' ? k : 0;
  const i = tapeIndex(real, s.dayIndex);
  let sum = 0;
  for (let j = Math.max(0, i - 20); j < i; j++) sum += real.market[j] ?? 0;
  const trend = sum / 100;
  return round2(Math.max(-1.5 * k, Math.min(1.5 * k, (-trend * k) / 2)));
}

/**
 * 现在能不能押跌：真实行情的娱乐局开局就能；实盘、合成行情要押跌许可证、人设、月度主题解锁，或者难度够高。
 * 规则表里的 canShort 只记「解锁了」：空军老周跟着解锁进群，娱乐局开局不拉他（他什么都喊跌，开局就在群里会把跟消息的人带偏，
 * 模拟：普通打法 L3 通关率 72% → 63%）。
 */
export function canShortNow(s: Readonly<GameState>): boolean {
  return !!s.ext && (isEaseRun(s) || rulesOf(s).canShort || s.difficulty >= BALANCE.ext.shortLevel);
}

/** 欠银行多少（元）。 */
export function debtOf(s: Readonly<GameState>): number {
  let d = 0;
  for (const l of s.ext?.loans ?? []) d += l.amount;
  return round2(d);
}

/** 这件抵押物现在能押多少、利息多少；不能押时给原因。 */
export function loanOffer(s: Readonly<GameState>, id: CollateralId): { amount: number; rate: number; error: string | null } | null {
  const terms = collateralTerms(id, s.difficulty);
  if (!s.ext || !terms) return null;
  const rate = Math.round(terms.rate * rulesOf(s).interestMult * 10000) / 10000;
  const E = BALANCE.ext;
  let error: string | null = null;
  if (s.ext.log.seized.includes(id)) error = '已经被银行收走了';
  else if (s.ext.loans.some((l) => l.id === id)) error = '已经押在银行了';
  else if (isFlash(s)) error = '这一局只有 10 天，银行不借钱';
  else if (s.month < E.bankMonth) error = `第 ${E.bankMonth} 个月起银行才肯借钱`;
  else if (s.phase !== 'premarket') error = '银行只在开盘前办事';
  else {
    const d = debtOf(s) + terms.amount;
    if (s.account + terms.amount < d * E.borrowLine) error = '银行看了看你的账户：家底太薄，不借';
  }
  return { amount: terms.amount, rate, error };
}

export function newExt(): ExtState {
  return {
    loans: [],
    called: false,
    learned: [],
    log: {
      heavy: 0,
      maxUnits: 0,
      maxStock: null,
      adds: 0,
      trims: 0,
      shorts: 0,
      shortPnl: 0,
      shortBest: null,
      squeezes: 0,
      stubborn: 0,
      borrowed: [],
      calls: 0,
      seized: [],
      redeemed: [],
      interest: 0,
    },
  };
}

/** 群友对重仓、押跌、抵押的反应（只发事件，不改局面；说话的人得在群里）。 */
export function react(s: Readonly<GameState>, em: Emitter, kind: string, key: number): Comment | null {
  if (!em.enabled || !s.ext) return null;
  const lines = (EXT_REACT_LINES[kind] ?? []).filter((l) => s.friends.some((f) => f.id === l.friendId));
  if (lines.length === 0) return null;
  const l = lines[rngFor(s.seed, 'react', kind, key).int(lines.length)] as (typeof lines)[number];
  const c: Comment = { friendId: l.friendId, text: l.text, mood: l.mood };
  emit(em, { type: 'comment', ...c });
  return c;
}

export function learn(s: GameState, id: string, em: Emitter): void {
  if (!s.ext || s.ext.learned.includes(id)) return;
  s.ext.learned.push(id);
  emit(em, { type: 'learned', id });
}

export function noteUnits(s: GameState, h: Holding): void {
  if (!s.ext) return;
  const u = unitsOf(h);
  if (u > s.ext.log.maxUnits) {
    s.ext.log.maxUnits = u;
    s.ext.log.maxStock = h.stockId;
  }
}

/** 银行看账户：跌破警戒线打电话，再跌就收走抵押物（先收借得最多的）。 */
export function checkBank(s: GameState, em: Emitter, cause: 'trade' | 'bill' = 'trade'): { called: boolean; seized: CollateralId[] } {
  const out = { called: false, seized: [] as CollateralId[] };
  const x = s.ext;
  if (!x || x.loans.length === 0) {
    if (x) x.called = false;
    return out;
  }
  const E = BALANCE.ext;
  while (x.loans.length > 0 && s.account < debtOf(s) * E.seizeLine) {
    const loan = [...x.loans].sort((a, b) => b.amount - a.amount)[0] as Loan;
    const before = s.account;
    const debt = debtOf(s);
    const penalty = round2(loan.amount * E.penalty);
    setAccount(s, s.account - loan.amount - penalty);
    x.loans = x.loans.filter((l) => l !== loan);
    if (!x.log.seized.includes(loan.id)) x.log.seized.push(loan.id);
    out.seized.push(loan.id);
    emit(em, { type: 'seized', id: loan.id, amount: loan.amount, penalty, before, after: s.account, debt, line: round2(debt * E.seizeLine), cause });
    learn(s, 'seize', em);
  }
  const low = x.loans.length > 0 && s.account < debtOf(s) * E.callLine;
  if (low && !x.called) {
    x.log.calls += 1;
    out.called = true;
    emit(em, { type: 'bankCalled', account: s.account, debt: debtOf(s) });
    learn(s, 'call', em);
  }
  x.called = low;
  return out;
}

/** 第 slot 格的持仓今天能不能卖（T+1；FOMO 体质取消 T+1）。 */
export function canSell(s: Readonly<GameState>, slot: number): boolean {
  const h = s.slots[slot];
  if (h?.ipo?.stage === 'frozen') return false;
  return !!h && (h.boughtDay < s.today.day || rulesOf(s).noT1);
}

/** 今天没空看盘（加班事件）：不能买卖。 */
export function isBusy(s: Readonly<GameState>): boolean {
  return s.busyDay !== null && s.busyDay === s.today.day && s.phase === 'premarket';
}
