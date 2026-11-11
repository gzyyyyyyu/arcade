/** 全下或弃牌的快速局（docs/features.md 13.9）：规则限制、电脑的推跟范围、同种子同结果、一局的结束条件。 */
import { stream } from 'arcade-kit/rng';
import { describe, expect, it } from 'vitest';
import { pushFoldAction } from '../../src/ai/pushfold.ts';
import { classCards } from '../../src/ai/preflop.ts';
import { aiAction } from '../../src/bot.ts';
import { canScore, dailyBoardId, dailySeed, finishDaily, parseRecord, startDaily } from '../../src/core/daily.ts';
import { submitScore } from '../../src/net/scores.ts';
import { PF_HANDS, PF_STACK_BB } from '../../src/core/stakes.ts';
import { apply, deal, isFail, newTable, seatHouse, seatPlayer, type Action, type Table } from '../../src/core/table.ts';
import { view } from '../../src/core/view.ts';
import { Solo, type SoloDeps } from '../../src/solo.ts';
import { conserve, must, rig, SEED } from '../support/helpers.ts';

const BB = 20;
const ME = 0;

/** 6 人快速局：我坐 0 号，其余是电脑，每人 stackBB 个大盲；还没发牌 */
function pfTable(seed: readonly number[] = SEED, stackBB = PF_STACK_BB): Table {
  let t = newTable('small', 6, seed, { holdHands: true, pushFold: true });
  t = must(seatPlayer(t, ME, BB * PF_STACK_BB, false));
  for (let i = 1; i < 6; i++) t = must(seatHouse(t, i, false));
  if (stackBB !== PF_STACK_BB) {
    t = structuredClone(t);
    for (const s of t.seats) {
      t.bank += BB * stackBB - s.stack;
      s.stack = BB * stackBB;
    }
  }
  return deal(t);
}

/** 轮到的人都按电脑（推跟表）出手，直到这一手打完 */
function finishHand(t0: Table): Table {
  let t = t0;
  const no = t.handNo;
  while (t.toAct !== null && t.handNo === no) {
    t = must(apply(t, t.toAct, aiAction(t, t.toAct)));
    conserve(t);
  }
  return t;
}

/** 一整局：我也按推跟表出手；打满 PF_HANDS 手，或我输光为止 */
function session(seed: readonly number[] = SEED): { t: Table; hands: number } {
  let t = pfTable(seed);
  let hands = 1;
  for (;;) {
    t = finishHand(t);
    if (hands >= PF_HANDS || t.seats[ME]!.stack === 0) return { t, hands };
    t = deal(t);
    hands++;
  }
}

describe('规则：翻牌前只有弃牌 / 全下', () => {
  it('不能加注，也不能平跟；全下和弃牌可以', () => {
    const t = pfTable();
    const seat = t.toAct!;
    expect(isFail(apply(t, seat, { t: 'raise', to: 60 }))).toBe(true);
    expect(isFail(apply(t, seat, { t: 'call' }))).toBe(true);
    expect(isFail(apply(t, seat, { t: 'allin' }))).toBe(false);
    expect(isFail(apply(t, seat, { t: 'fold' }))).toBe(false);
  });

  it('有人全下以后：可以跟或弃，"全下"就是跟注，不能再加注', () => {
    const t0 = pfTable();
    const a = t0.toAct!;
    const t1 = must(apply(t0, a, { t: 'allin' }));
    const b = t1.toAct!;
    expect(isFail(apply(t1, b, { t: 'raise', to: 150 }))).toBe(true);
    const viaAllin = must(apply(t1, b, { t: 'allin' }));
    const viaCall = must(apply(t1, b, { t: 'call' }));
    expect(viaAllin.seats[b]!.total).toBe(viaCall.seats[b]!.total);
    expect(viaAllin.seats[b]!.total).toBe(Math.min(t1.seats[b]!.stack + t1.seats[b]!.total, t1.currentBet));
  });

  it('跟注的人比全下的深：全下的只被跟到自己那么多，多余的退回，不会再开一轮下注', () => {
    let t = pfTable(SEED, 10);
    t = structuredClone(t);
    // 把轮到的下一家筹码加深，让他跟注后还有剩
    const first = t.toAct!;
    t = must(apply(t, first, { t: 'allin' }));
    const second = t.toAct!;
    t.seats[second]!.stack += 400;
    t.bank += 400;
    t = must(apply(t, second, { t: 'call' }));
    conserve(t);
    // 其余的人弃牌或跟，最后一手一定打完（没有翻牌后的下注）
    t = finishHand(t);
    expect(t.toAct).toBeNull();
    expect(t.phase).toBe('idle');
    conserve(t);
  });

  it('翻牌前说完话就一次发完公共牌摊牌', () => {
    const t0 = rig(pfTable(), { 0: 'As Ad', 1: 'Kc Kd', 2: '7c 2d', 3: '8c 3d', 4: '9c 4d', 5: 'Tc 5d' }, '2s 5h 9d Js Qh');
    let t = t0;
    // 谁说话谁全下，直到打完
    while (t.toAct !== null) t = must(apply(t, t.toAct, { t: 'allin' }));
    expect(t.lastHand!.board).toHaveLength(5);
    expect(t.lastHand!.byFold).toBe(false);
    conserve(t);
  });

  it('普通牌桌不受影响：照样能加注、平跟', () => {
    let t = newTable('small', 3, SEED, { holdHands: true });
    t = must(seatPlayer(t, 0, 2000, false));
    t = must(seatHouse(t, 1, false));
    t = must(seatHouse(t, 2, false));
    t = deal(t);
    const seat = t.toAct!;
    expect(isFail(apply(t, seat, { t: 'call' }))).toBe(false);
    expect(isFail(apply(t, seat, { t: 'raise', to: 60 }))).toBe(false);
  });

  it('快速局只有娱乐：实盘开局直接拒，不碰钱包', async () => {
    let calls = 0;
    const wallet = new Proxy({}, { get: () => () => {
      calls++;
      return Promise.resolve({ ok: true });
    } });
    const r = await Solo.open(
      { store: new Map(), wallet, newId: () => 'x', entropy: () => [...SEED] } as unknown as SoloDeps,
      { userId: 'u', stakes: 'small', size: 6, amount: 200, practice: false, pushFold: true },
    );
    expect(r).toEqual({ error: 'fun_only' });
    expect(calls).toBe(0);
  });

  it('电脑坐下、换人都带 PF_STACK_BB 个大盲', () => {
    const t = pfTable();
    for (const s of t.seats) expect(s.stack + s.total).toBe(BB * PF_STACK_BB);
    // 输光的电脑下一手换一个新的，也是 10 个大盲
    let u = structuredClone(t);
    u.seats[3]!.stack = 0;
    u.seats[3]!.total = 0;
    u.bank = u.seats.reduce((a, s) => a + s.stack + s.total, 0);
    u = finishHand(u);
    u = deal(u);
    const s3 = u.seats[3]!;
    expect(s3.owner).toBe('house');
    expect(s3.stack + s3.total).toBe(BB * PF_STACK_BB);
  });
});

describe('电脑的推跟范围', () => {
  /** 在这个局面（stackBB 个大盲）下，轮到的人拿 169 类起手牌各出一次手，返回推 / 跟的类数 */
  function counts(stackBB: number, facing: boolean): number {
    let n = 0;
    for (let k = 0; k < 169; k++) {
      let t = pfTable(SEED, stackBB);
      let seat = t.toAct!;
      if (facing) {
        t = must(apply(t, seat, { t: 'allin' }));
        seat = t.toAct!;
      }
      t = structuredClone(t);
      t.seats[seat]!.hole = classCards(k);
      const v = view(t, seat);
      const a: Action = pushFoldAction(v, stream(SEED, 'pf-test', k));
      if (a.t !== 'fold') n++;
    }
    return n;
  }

  it('抢先全下：筹码越短推得越宽', () => {
    const c5 = counts(5, false);
    const c10 = counts(10, false);
    const c20 = counts(20, false);
    expect(c5).toBeGreaterThan(c10);
    expect(c10).toBeGreaterThan(c20);
    expect(c20).toBeGreaterThan(0);
  });

  it('只出弃牌 / 全下 / 跟注三种，面对全下时全下不会出现', () => {
    for (let k = 0; k < 169; k += 7) {
      let t = pfTable();
      const seat = t.toAct!;
      t = structuredClone(t);
      t.seats[seat]!.hole = classCards(k);
      expect(['fold', 'allin']).toContain(pushFoldAction(view(t, seat), stream(SEED, 'pf-test', k)).t);
      const shoved = must(apply(t, seat, { t: 'allin' }));
      const next = shoved.toAct!;
      const u = structuredClone(shoved);
      u.seats[next]!.hole = classCards(k);
      expect(['fold', 'call']).toContain(pushFoldAction(view(u, next), stream(SEED, 'pf-test', k)).t);
    }
  });

  it('强牌总推总跟，最差的牌不推不跟', () => {
    // 对子 AA 是 12*13+12，72o 是 0*13+5（不同花，小点数在行）
    const AA = 12 * 13 + 12;
    const worst = 0 * 13 + 5;
    for (const stackBB of [5, 10, 20]) {
      for (let i = 0; i < 6; i++) {
        let t = pfTable(SEED, stackBB);
        let seat = t.toAct!;
        t = structuredClone(t);
        t.seats[seat]!.hole = classCards(AA);
        expect(pushFoldAction(view(t, seat), stream(SEED, 'x', i)).t).toBe('allin');
        t.seats[seat]!.hole = classCards(worst);
        expect(pushFoldAction(view(t, seat), stream(SEED, 'x', i)).t).toBe('fold');
        // 面对全下
        t.seats[seat]!.hole = classCards(AA);
        const shoved = must(apply(t, seat, { t: 'allin' }));
        seat = shoved.toAct!;
        const u = structuredClone(shoved);
        u.seats[seat]!.hole = classCards(AA);
        expect(pushFoldAction(view(u, seat), stream(SEED, 'y', i)).t).toBe('call');
        u.seats[seat]!.hole = classCards(worst);
        expect(pushFoldAction(view(u, seat), stream(SEED, 'y', i)).t).toBe('fold');
      }
    }
  });
});

describe('同种子同结果、一局的结束条件', () => {
  it('同一个种子打一整局，结果一模一样；换种子就不同', () => {
    const a = session();
    const b = session();
    expect(JSON.stringify(a.t)).toBe(JSON.stringify(b.t));
    expect(a.hands).toBe(b.hands);
    const c = session([9, 9, 9, 9, 9, 9, 9, 9]);
    expect(JSON.stringify(c.t)).not.toBe(JSON.stringify(a.t));
  });

  it('一局最多 PF_HANDS 手；每一步筹码守恒、没有翻牌后的下注', () => {
    for (let i = 1; i <= 8; i++) {
      const { t, hands } = session([i, 2, 3, 4, 5, 6, 7, 8]);
      expect(hands).toBeLessThanOrEqual(PF_HANDS);
      // 打满手数，或者我输光了
      expect(hands === PF_HANDS || t.seats[ME]!.stack === 0).toBe(true);
      conserve(t);
    }
  });

  it('我输光了就发不出下一手（一局结束），电脑不用等我', () => {
    let t = pfTable();
    t = finishHand(t);
    const lost = structuredClone(t);
    lost.bank -= lost.seats[ME]!.stack;
    lost.seats[ME]!.stack = 0;
    lost.seats[ME]!.status = 'out';
    // 补一个电脑没有 hold 的状态：dealt 之后座位上不再有我
    const n = lost.handNo;
    const after = deal(lost);
    expect(after.handNo).toBe(n);
    expect(after.phase).toBe('idle');
  });
});

describe('今日局：每天同一副牌，一天记一次分', () => {
  const holes = (t: Table): number[][] => t.seats.map((x) => x.hole);

  it('同一天的种子和发牌一模一样，不同的天不一样', () => {
    const a = dailySeed('2026-10-30');
    expect(dailySeed('2026-10-30')).toEqual(a);
    expect(a).toHaveLength(8);
    expect(dailySeed('2026-10-31')).not.toEqual(a);
    expect(holes(pfTable(dailySeed('2026-10-30')))).toEqual(holes(pfTable(a)));
    expect(holes(pfTable(dailySeed('2026-10-31')))).not.toEqual(holes(pfTable(a)));
    // 整局也一样（同样的操作 → 同样的结果）
    expect(JSON.stringify(session(a).t)).toBe(JSON.stringify(session(dailySeed('2026-10-30')).t));
    expect(() => dailySeed('10/30')).toThrow();
  });

  it('榜名是 daily-北京日期-pushfold', () => {
    expect(dailyBoardId('2026-10-30')).toBe('daily-2026-10-30-pushfold');
  });

  it('一天只记一次：开始就算打过，同一天再打不记分，换一天又可以', () => {
    let rec = parseRecord(null);
    expect(canScore(rec, '2026-10-30')).toBe(true);
    rec = startDaily(rec, '2026-10-30');
    expect(canScore(rec, '2026-10-30')).toBe(false);
    rec = finishDaily(rec, '2026-10-30', 340);
    expect(rec.daily).toEqual({ date: '2026-10-30', score: 340 });
    // 同一天再开始、再结束都不改第一次的分
    expect(startDaily(rec, '2026-10-30')).toEqual(rec);
    expect(finishDaily(rec, '2026-10-30', 999).daily!.score).toBe(340);
    expect(canScore(rec, '2026-10-31')).toBe(true);
    expect(startDaily(rec, '2026-10-31').daily).toEqual({ date: '2026-10-31', score: null });
  });

  it('记录坏了当没有', () => {
    expect(parseRecord({ best: -3, plays: 'x', daily: { date: 'x', score: 1 } })).toEqual({ best: null, plays: 0, daily: null });
    expect(parseRecord({ best: 120, plays: 2 })).toEqual({ best: 120, plays: 2, daily: null });
  });

  it('交分：POST /api/scores 带对的榜名和整数分；失败返回 false 不抛错', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const ok = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    expect(await submitScore('daily-2026-10-30-pushfold', 340, ok)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('/api/scores');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ gameId: 'texas', boardId: 'daily-2026-10-30-pushfold', score: 340 });
    const denied = (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch;
    expect(await submitScore('daily-2026-10-30-pushfold', 1, denied)).toBe(false);
    const down = (async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    expect(await submitScore('daily-2026-10-30-pushfold', 1, down)).toBe(false);
  });
});
