/** 事件：闪电盘的固定事件、随机事件、选项结算，以及进入下个月。 */
import { BALANCE } from '../balance.ts';
import { collateralTerms, EVENTS, FLASH_EVENTS, eventById } from '../content/index.ts';
import type { EventCtx } from '../hooks.ts';
import { round2, rulesOf } from '../market.ts';
import { rngFor } from '../rng.ts';
import type { Loan, GameState } from '../types.ts';
import { isFlash, runMonths } from './calendar.ts';
import { startDay, startMonth } from './day.ts';
import { debtOf, learn } from './ext.ts';
import { gainItem, setAccount } from './holdings.ts';
import { placeStock } from './reward.ts';
import { type Emitter, emit } from './shared.ts';

// ================================================================ 事件

/**
 * 闪电盘的事件：第 4、8 个交易日收盘后各一个（必来）。只在 FLASH_EVENTS 里抽、已经来过的不再来，用独立的 rng 用途名。
 * 返回有没有抽到（池子空了就不来，直接接着打）。
 */
export function flashEvent(s: GameState, em: Emitter): boolean {
  const rng = rngFor(s.seed, s.setup?.weekly !== undefined ? 'weeklyEvent' : 'flashEvent', s.dayIndex);
  const ready = FLASH_EVENTS.filter((id) => !s.stats.events.includes(id))
    .map((id) => eventById(id))
    .map((d) => ({ d, data: d.prepare({ state: s, rng: rngFor(s.seed, 'eventPrep', s.month, d.id), month: s.month }) }))
    .filter((x) => x.data !== null);
  if (ready.length === 0) return false;
  const pick = ready[rng.int(ready.length)] as (typeof ready)[number];
  s.event = { ...pick.data, id: pick.d.id, month: s.month };
  s.phase = 'event';
  s.stats.events.push(pick.d.id);
  emit(em, { type: 'eventStarted', event: { ...s.event } });
  return true;
}

export function maybeEvent(s: GameState, em: Emitter): void {
  const rng = rngFor(s.seed, 'event', s.month);
  if (rng.next() < BALANCE.events.chance) {
    const ready = EVENTS.map((d) => ({ d, data: d.prepare({ state: s, rng: rngFor(s.seed, 'eventPrep', s.month, d.id), month: s.month }) })).filter(
      (x) => x.data !== null,
    );
    if (ready.length > 0) {
      const pick = ready[rng.int(ready.length)] as (typeof ready)[number];
      s.event = { ...pick.data, id: pick.d.id, month: s.month };
      s.phase = 'event';
      s.stats.events.push(pick.d.id);
      emit(em, { type: 'eventStarted', event: { ...s.event } });
      return;
    }
  }
  nextMonth(s, em);
}

export function choose(s: GameState, option: number, em: Emitter): void {
  const e = s.event;
  if (!e) return;
  const def = eventById(e.id);
  const before = s.account;
  const badMult = rulesOf(s).eventBadMult;
  const ctx: EventCtx = {
    state: s,
    event: e,
    rng: rngFor(s.seed, 'eventResolve', s.month, e.id),
    badMult,
    addAccount(n, exact = false) {
      const b = s.account;
      setAccount(s, s.account + (n < 0 && !exact ? n * badMult : n));
      return round2(s.account - b);
    },
    gainItem: (id, untilMonth) => gainItem(s, id, em, true, untilMonth),
    placeStock: (stockId, slot) => {
      placeStock(s, stockId, slot, 'event');
    },
    boostTheme(theme, dH, days) {
      const t = s.themes[theme];
      if (t) t.boost = { dH, days };
    },
    scaleNextBill(mult) {
      s.nextBillMult *= mult > 1 ? 1 + (mult - 1) * badMult : mult;
    },
    addPending(amount, month) {
      if (month <= runMonths(s)) s.pending.push({ id: e.id, month, amount: round2(amount) });
    },
    skipNextDay() {
      s.busyDay = s.dayIndex;
    },
    takeLoan(id, rateMult) {
      const terms = collateralTerms(id, s.difficulty);
      const x = s.ext;
      if (!x || !terms || x.loans.some((l) => l.id === id) || x.log.seized.includes(id)) return false;
      if (s.account + terms.amount < (debtOf(s) + terms.amount) * BALANCE.ext.borrowLine) return false;
      const rate = Math.round(terms.rate * rulesOf(s).interestMult * rateMult * 10000) / 10000;
      const loan: Loan = { id, amount: terms.amount, rate, month: s.month };
      x.loans.push(loan);
      if (!x.log.borrowed.includes(id)) x.log.borrowed.push(id);
      setAccount(s, s.account + terms.amount);
      learn(s, 'borrow', em);
      emit(em, { type: 'borrowed', loan: { ...loan }, account: s.account });
      return true;
    },
    setLoanRate(id, rate) {
      const l = s.ext?.loans.find((x) => x.id === id);
      if (l) l.rate = rate;
    },
  };
  s.stats.eventPicks.push(`${e.id}:${option}`);
  const text = def.resolve(ctx, option);
  emit(em, { type: 'eventResolved', id: e.id, option, text, delta: round2(s.account - before) });
  s.event = null;
  // 闪电盘的事件在月中：接着打下一天（别的模式的事件在月底，接着是新的一个月）
  if (isFlash(s)) startDay(s, em);
  else nextMonth(s, em);
}

export function nextMonth(s: GameState, em: Emitter): void {
  const month = s.month + 1;
  // 临时道具到期（量化软件试用）
  const expired = s.expiring.filter((x) => x.month < month);
  if (expired.length > 0) {
    s.expiring = s.expiring.filter((x) => x.month >= month);
    for (const x of expired) {
      s.items = s.items.filter((id) => id !== x.id);
      emit(em, { type: 'itemExpired', itemId: x.id });
    }
  }
  startMonth(s, month, em);
  startDay(s, em);
}
