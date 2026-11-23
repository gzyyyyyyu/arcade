/** 月底：月底道具、月供账单、通关或出局，接着发奖励或事件。 */
import { fx } from '../balance.ts';
import { itemById } from '../content/index.ts';
import { round2 } from '../market.ts';
import { tempoMonthEnd } from '../tempo.ts';
import type { GameState } from '../types.ts';
import { holdingBase, isFlash, runMonths } from './calendar.ts';
import { tempoCtx } from './day.ts';
import { nextMonth } from './event.ts';
import { checkBank, learn, unitsOf } from './ext.ts';
import { marginCalled } from './gear.ts';
import { addStat, setAccount } from './holdings.ts';
import { openReward } from './reward.ts';
import { type Emitter, emit } from './shared.ts';

export function endMonth(s: GameState, em: Emitter): void {
  // 月底效果（价值眼光：白马分红）
  const weight = 1 / holdingBase(s);
  for (const id of [...s.items]) {
    const fn = itemById(id).onMonthEnd;
    if (!fn) continue;
    fn({
      state: s,
      addToHolding(slot, pct, text) {
        const h = s.slots[slot];
        if (!h) return;
        h.value *= 1 + pct / 100;
        const before = s.account;
        setAccount(s, s.account * (1 + (pct * weight * unitsOf(h)) / 100));
        // 持仓上的分红、加成算炒股赚的
        addStat(s, 'tradeMoney', s.account - before);
        emit(em, { type: 'itemTriggered', itemId: id, slot, stockId: h.stockId, text, delta: round2(s.account - before) });
      },
    });
  }
  // 月度目标（还月供之前判定，奖励先到账）
  if (s.tempo) tempoMonthEnd(s, tempoCtx(s, em));
  const monthRet = round2((s.account / Math.max(1e-9, s.stats.monthOpen) - 1) * 100);
  s.stats.monthRets.push(monthRet);
  // 月供之外另付借款利息
  if (s.ext && s.ext.loans.length > 0) {
    let interest = 0;
    for (const l of s.ext.loans) interest += l.amount * l.rate;
    interest = round2(interest);
    const b0 = s.account;
    setAccount(s, s.account - interest);
    s.ext.log.interest = round2(s.ext.log.interest + (b0 - s.account));
    emit(em, { type: 'interestPaid', amount: interest, before: b0, after: s.account });
    learn(s, 'interest', em);
  }
  const amount = s.bill.amount;
  const before = s.account;
  const paid = (): void => {
    for (const x of s.bill.extras ?? []) if (!s.stats.surprisesPaid.includes(x.id)) s.stats.surprisesPaid.push(x.id);
    if (s.notice?.id === 'crash') s.stats.crashRet = monthRet;
  };
  const flash = isFlash(s);
  if (flash) {
    // 闪电盘没有月供：不扣钱、不发账单事件，账户也不会不够
  } else if (s.account >= amount) {
    setAccount(s, s.account - amount);
    addStat(s, 'billMoney', amount);
    paid();
    emit(em, { type: 'billPaid', month: s.month, amount, before, after: s.account, credit: false });
  } else if (s.items.includes('credit')) {
    s.items = s.items.filter((id) => id !== 'credit');
    s.nextBillMult = fx('credit', 'nextBillMult');
    s.stats.creditUsed += 1;
    paid();
    emit(em, { type: 'itemTriggered', itemId: 'credit', slot: null, stockId: null, text: '信用卡帮你垫上了这个月要还的钱', delta: 0 });
    emit(em, { type: 'billPaid', month: s.month, amount, before, after: s.account, credit: true });
  } else {
    s.phase = 'lost';
    s.endReason = 'bankrupt';
    emit(em, { type: 'bankrupt', month: s.month, amount, account: s.account });
    emit(em, { type: 'runLost', reason: 'bankrupt', month: s.month, account: s.account, bill: amount });
    return;
  }
  if (!flash) s.stats.billsPaid += 1;
  if (s.ext) checkBank(s, em, 'bill');
  if (marginCalled(s, em)) return;
  if (s.month >= runMonths(s)) {
    // 一年结束，银行把没还的借款收回去（东西还给你）
    if (s.ext) {
      for (const loan of [...s.ext.loans]) {
        setAccount(s, s.account - loan.amount);
        s.ext.loans = s.ext.loans.filter((l) => l !== loan);
        emit(em, { type: 'repaid', loan: { ...loan }, account: s.account });
      }
      s.ext.called = false;
    }
    s.phase = 'won';
    emit(em, { type: 'runWon', account: s.account });
    return;
  }
  // 闪电盘月底不发奖励、不抽事件（奖励只在开局一次，事件在第 4、8 个交易日），直接接着打
  if (flash) nextMonth(s, em);
  else openReward(s, em);
}
