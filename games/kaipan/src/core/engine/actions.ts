/** 玩家操作的落地：买、申购、卖、加仓、减仓、借款、还款。 */
import { BALANCE } from '../balance.ts';
import { stockQuip } from '../story.ts';
import { stockById } from '../content/index.ts';
import { round2, rulesOf } from '../market.ts';
import { isTrack } from '../real.ts';
import type { Action, BuySize, CollateralId, Loan, GameState } from '../types.ts';
import { firstEmpty, ipoToday } from './calendar.ts';
import { debtOf, freeUnits, learn, loanOffer, noteUnits, react, sizeUnits, unitsOf } from './ext.ts';
import { addStat, closeHolding, feelNow, markOp, newHolding, setAccount } from './holdings.ts';
import { type Emitter, emit } from './shared.ts';

export function buy(s: GameState, a: Extract<Action, { type: 'buy' }>, em: Emitter): void {
  const rec = s.today.recs[a.rec];
  if (!rec) return;
  const slot = a.slot ?? firstEmpty(s);
  const old = closeHolding(s, slot, 'replace');
  const theme = stockById(rec.stockId).theme;
  const contra = s.today.messages.some((m) => m.friendId === 'qunzhu' && m.theme === theme && m.claim === 'down');
  // 0.4 C：仓位（换股时那一格的钱先回来）
  const units = s.ext ? sizeUnits(s, a.size ?? 'taste') : 1;
  const h = newHolding(s, rec.stockId, s.today.day, 'rec', { recBy: rec.friendId, firstBuy: s.today.buys === 0, contra });
  if (s.ext) {
    h.units = units;
    if (a.short) {
      h.short = true;
      h.squeezed = 0;
      s.ext.log.shorts += 1;
      learn(s, 'short', em);
    }
    if (a.size === 'half' || a.size === 'heavy') learn(s, 'size', em);
    if (a.size === 'heavy') {
      s.ext.log.heavy += 1;
      learn(s, 'heavy', em);
    }
  }
  s.slots[slot] = h;
  noteUnits(s, h);
  // 0.4 C：一次买太多，价格被自己抬高一点（多出来的每份 impact pp，按这一笔的金额算）
  let cost = 0;
  if (s.ext && units > 1) {
    const b0 = s.account;
    setAccount(s, s.account * (1 - ((units / BALANCE.slots) * BALANCE.ext.impact * (units - 1)) / 100));
    cost = round2(b0 - s.account);
  }
  // 0.5（真实行情）：手续费（难度"熊出没"起），按这一笔的金额算
  const fee = isTrack(s.real) ? rulesOf(s).buyFee : 0;
  if (fee > 0) {
    const b0 = s.account;
    setAccount(s, s.account * (1 - ((units / BALANCE.slots) * fee) / 100));
    cost = round2(cost + b0 - s.account);
  }
  // 冲击成本、手续费也是炒股的一部分
  if (cost > 0) addStat(s, 'tradeMoney', -cost);
  rec.taken = true;
  s.today.buysLeft -= 1;
  s.today.buys += 1;
  s.stats.buys += 1;
  if (old) s.stats.sells += 1;
  markOp(s);
  emit(em, { type: 'bought', rec: a.rec, slot, stockId: rec.stockId, replaced: old?.stockId ?? null, ...(s.ext ? { units, short: !!a.short, cost } : cost > 0 ? { cost } : {}) });
  quip(s, em, old?.stockId ?? null, slot, 'sold', s.stats.sells);
  quip(s, em, rec.stockId, slot, 'bought', s.stats.buys);
  if (a.short) react(s, em, 'short', s.stats.buys);
  else if (a.size === 'heavy') react(s, em, 'heavy', s.stats.buys);
}

/**
 * 打新：申购今天的新股。占第一个空格，份数同买入（试一口 1 份、半仓 2 份、重仓是剩下的全部现金），冻结期间收益为 0。
 * 不算一次买入（不占今天的买入次数、不付冲击成本和手续费、不进"买过的股票"），申购次数记在 stats.ipo。
 */
export function subscribe(s: GameState, size: BuySize, em: Emitter): void {
  const offer = ipoToday(s);
  if (!offer) return;
  const slot = firstEmpty(s);
  const units = sizeUnits(s, size);
  const buyFeel = feelNow(s, offer.theme);
  s.slots[slot] = {
    stockId: offer.stockId,
    boughtDay: s.today.day,
    value: 1,
    todayRet: null,
    lowBuy: false,
    buyFeel,
    buyStage: s.themes[offer.theme]?.stage ?? 'cold',
    source: 'rec',
    recBy: null,
    firstBuy: false,
    contra: false,
    sawEbb: false,
    units,
    ipo: { stage: 'frozen', offer: { ...offer, odds: { ...offer.odds } }, size },
  };
  const st = (s.stats.ipo ??= { subs: 0, wins: 0, money: 0 });
  st.subs += 1;
  emit(em, { type: 'subscribed', slot, size, units, offer: { ...offer, odds: { ...offer.odds } } });
}

/** 0.3.1：买入、卖出时股票小人冒一句（只发事件，不改局面）。 */
export function quip(s: GameState, em: Emitter, stockId: string | null, slot: number, moment: 'bought' | 'sold', key: number): void {
  if (!stockId || !em.enabled) return;
  const text = stockQuip(s, stockId, moment, key);
  if (text) emit(em, { type: 'quip', stockId, slot, moment, text });
}

export function sell(s: GameState, slot: number, em: Emitter): void {
  const h = closeHolding(s, slot, 'sell');
  if (!h) return;
  s.stats.sells += 1;
  markOp(s);
  emit(em, { type: 'sold', slot, stockId: h.stockId, holdRet: round2((h.value - 1) * 100) });
  quip(s, em, h.stockId, slot, 'sold', s.stats.sells);
}

/** 0.4 C：加仓（+1 份，现金不够时有多少加多少）。持有收益按成本摊薄。 */
export function addTo(s: GameState, slot: number, em: Emitter): void {
  const h = s.slots[slot];
  if (!h || !s.ext) return;
  const add = Math.min(BALANCE.ext.add, freeUnits(s));
  const u0 = unitsOf(h);
  h.value = 1 + (u0 * (h.value - 1)) / (u0 + add);
  h.units = round2(u0 + add);
  if (!rulesOf(s).freeAdd) s.today.buysLeft -= 1;
  s.today.buys += 1;
  s.stats.buys += 1;
  s.ext.log.adds += 1;
  noteUnits(s, h);
  markOp(s);
  learn(s, 'add', em);
  emit(em, { type: 'added', slot, stockId: h.stockId, units: h.units });
}

/** 0.4 C：减一半（按 0.5 份取整，至少留 0.5 份）。 */
export function trim(s: GameState, slot: number, em: Emitter): void {
  const h = s.slots[slot];
  if (!h || !s.ext) return;
  const m = BALANCE.ext.minUnit;
  h.units = Math.max(m, Math.floor(unitsOf(h) / 2 / m + 1e-9) * m);
  s.stats.sells += 1;
  s.ext.log.trims += 1;
  markOp(s);
  learn(s, 'trim', em);
  emit(em, { type: 'trimmed', slot, stockId: h.stockId, units: h.units, holdRet: round2((h.value - 1) * 100) });
}

export function borrow(s: GameState, id: CollateralId, em: Emitter): void {
  const o = loanOffer(s, id);
  if (!o || !s.ext) return;
  const loan: Loan = { id, amount: o.amount, rate: o.rate, month: s.month };
  s.ext.loans.push(loan);
  if (!s.ext.log.borrowed.includes(id)) s.ext.log.borrowed.push(id);
  setAccount(s, s.account + o.amount);
  learn(s, 'borrow', em);
  emit(em, { type: 'borrowed', loan: { ...loan }, account: s.account });
  react(s, em, 'borrow', s.ext.log.borrowed.length);
}

export function repay(s: GameState, id: CollateralId, em: Emitter): void {
  const x = s.ext;
  const loan = x?.loans.find((l) => l.id === id);
  if (!x || !loan) return;
  setAccount(s, s.account - loan.amount);
  x.loans = x.loans.filter((l) => l !== loan);
  if (!x.log.redeemed.includes(id)) x.log.redeemed.push(id);
  x.called = x.loans.length > 0 && s.account < debtOf(s) * BALANCE.ext.callLine;
  learn(s, 'redeem', em);
  emit(em, { type: 'repaid', loan: { ...loan }, account: s.account });
  react(s, em, 'redeem', x.log.redeemed.length);
}
