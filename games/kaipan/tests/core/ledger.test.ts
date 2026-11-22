/**
 * 0.5.4 审阅：结算的几个数要对得上账，旧存档接着玩不能按半截数评。
 * 本钱 + 炒股净赚 − 账单 + 其他 (+ 没还的借款) = 最后剩；炒股净赚 = 每天收盘的赚亏 + 持仓上的道具加成 − 买入的冲击成本和手续费。
 */
import { describe, expect, it } from 'vitest';
import { dispatch, itemById, runSummary, type GameEvent, type GameState } from '../../src/core/index.ts';
import { reviveState } from '../../src/platform/storage.ts';
import { ledgerRows } from '../../src/view/labels.ts';
import { botByName, playRun, useExt, useMarket } from '../../tools/bots.ts';
import { segmentForSeed } from '../../tools/segments-disk.ts';

const r2 = (v: number): number => Math.round(v * 100) / 100;

describe('结算对得上账', () => {
  it('炒股净赚、还掉的账单和逐日逐月事件的合计一致；几个数加起来等于最后剩', () => {
    useMarket(segmentForSeed);
    useExt(true);
    try {
      let runs = 0;
      for (const bot of ['smart', 'gambler', 'random']) {
        for (let i = 0; i < 6; i++) {
          let trade = 0;
          let bills = 0;
          const s = playRun(`ledger-${bot}-${i}`, botByName(bot), null, (_st, events: readonly GameEvent[]) => {
            for (const e of events) {
              if (e.type === 'dayClosed') trade += e.report.account.after - e.report.account.before;
              if (e.type === 'bought' && e.cost) trade -= e.cost;
              // 月底持仓上的道具加成（白马分红）；收盘时的道具效果已经在当天的赚亏里
              if (e.type === 'itemTriggered' && e.slot !== null && itemById(e.itemId).onMonthEnd) trade += e.delta;
              if (e.type === 'billPaid' && !e.credit) bills += e.amount;
            }
          });
          const sum = runSummary(s);
          expect(sum.tradeMoney, `${s.seed} 炒股`).toBeCloseTo(r2(trade), 0);
          expect(sum.billMoney, `${s.seed} 账单`).toBeCloseTo(r2(bills), 0);
          expect(sum.otherMoney).not.toBeNull();
          expect(r2(sum.startAccount + (sum.tradeMoney ?? 0) - (sum.billMoney ?? 0) + (sum.otherMoney ?? 0) + sum.debtLeft)).toBeCloseTo(sum.account, 1);
          runs++;
        }
      }
      expect(runs).toBe(18);
    } finally {
      useMarket(null);
      useExt(false);
    }
  });
});

describe('旧存档接着玩', () => {
  it('缺了的统计项从 0 记起，账照样加得起来（差额进「其他」）', () => {
    let s = playRun('ledger-legacy', botByName('smart'), null, undefined, 60);
    const raw = JSON.parse(JSON.stringify(s)) as { stats: Record<string, unknown> };
    delete raw.stats.tradeMoney;
    delete raw.stats.billMoney;
    raw.stats.eventPicks = 'x';
    const back = reviveState(raw);
    expect(back).not.toBeNull();
    s = back as GameState;
    expect([s.stats.tradeMoney, s.stats.billMoney, s.stats.eventPicks]).toEqual([0, 0, []]);
    for (let i = 0; i < 400 && s.phase !== 'won' && s.phase !== 'lost'; i++) {
      const a = s.phase === 'reward' ? ({ type: 'skipReward' } as const) : s.phase === 'event' ? ({ type: 'choose', option: 0 } as const) : ({ type: 'open' } as const);
      s = dispatch(s, a).state;
    }
    const sum = runSummary(s);
    expect(r2(sum.startAccount + sum.tradeMoney - sum.billMoney + sum.otherMoney + sum.debtLeft)).toBeCloseTo(sum.account, 1);
    expect(ledgerRows(sum).map((r) => r[0])).toContain('还掉的账单');
  });
});
