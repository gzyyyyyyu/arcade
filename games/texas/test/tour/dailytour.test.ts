/** 今日锦标赛（docs/tournament.md 14.5）：分数、种子、一天只记一次分、交榜只一次、同一天同一场牌。 */
import { describe, expect, it } from 'vitest';
import { canScoreTour, dailySeed, dailyTourBoardId, dailyTourSeed, finishTourDaily, parseTourDaily, sentTourDaily, startTourDaily, tourScore } from '../../src/core/daily.ts';
import { submitScore } from '../../src/net/scores.ts';
import type { WalletApi } from '../../src/net/wallet.ts';
import type { Store } from '../../src/solo.ts';
import { TourSolo, type TourDeps } from '../../src/tour-solo.ts';

describe('今日锦标赛分数', () => {
  it('名次分 (7 - 名次) × 1000', () => {
    for (let p = 2; p <= 6; p++) expect(tourScore(p, 0)).toBe((7 - p) * 1000);
  });
  it('第 1 名再加 clamp(100 - 手数, 0, 100)：最高 6100，超过 100 手加 0，不出现负数', () => {
    expect(tourScore(1, 0)).toBe(6100);
    expect(tourScore(1, 21)).toBe(6079);
    expect(tourScore(1, 100)).toBe(6000);
    expect(tourScore(1, 101)).toBe(6000);
    expect(tourScore(1, 5000)).toBe(6000);
  });
  it('第 2–6 名再加 min(手数, 999)：撑得越久越高，封顶 999', () => {
    expect(tourScore(6, 1)).toBe(1001);
    expect(tourScore(6, 17)).toBe(1017);
    expect(tourScore(2, 999)).toBe(5999);
    expect(tourScore(2, 5000)).toBe(5999);
    expect(tourScore(3, 30)).toBeGreaterThan(tourScore(3, 29));
  });
  it('名次靠前总是更高（第 6 名撑满封顶也比不上第 5 名最低）', () => {
    expect(tourScore(5, 0)).toBeGreaterThan(tourScore(6, 999));
  });
  it('都是整数', () => {
    for (let p = 1; p <= 6; p++) for (const h of [0, 3, 40, 150, 2000]) expect(Number.isInteger(tourScore(p, h))).toBe(true);
  });
});

describe('今日锦标赛种子和榜名', () => {
  it('同一天种子相同、别的天不同', () => {
    const a = dailyTourSeed('2026-10-31');
    expect(dailyTourSeed('2026-10-31')).toEqual(a);
    expect(dailyTourSeed('2026-11-01')).not.toEqual(a);
    expect(a).toHaveLength(8);
    expect(() => dailyTourSeed('10/31')).toThrow();
  });
  it('和全下局今日全下的种子不同', () => {
    expect(dailyTourSeed('2026-10-31')).not.toEqual(dailySeed('2026-10-31'));
  });
  it('榜名是 daily-北京日期-tour', () => {
    expect(dailyTourBoardId('2026-10-31')).toBe('daily-2026-10-31-tour');
  });
});

describe('一天只记一次分', () => {
  it('点开始就算打过；当天再开不能记分；第二天又能', () => {
    let rec = parseTourDaily(null);
    expect(canScoreTour(rec, '2026-10-31')).toBe(true);
    rec = startTourDaily(rec, '2026-10-31');
    expect(rec).toEqual({ date: '2026-10-31', score: null, sent: false });
    expect(canScoreTour(rec, '2026-10-31')).toBe(false);
    expect(startTourDaily(rec, '2026-10-31')).toBe(rec);
    expect(canScoreTour(rec, '2026-11-01')).toBe(true);
  });
  it('只记当天第一场的分；记过以后原样返回（调用方据此不再交榜）；先记没交上，成功才改已上榜', () => {
    const started = startTourDaily(null, '2026-10-31');
    const done = finishTourDaily(started, '2026-10-31', 4017);
    expect(done).toEqual({ date: '2026-10-31', score: 4017, sent: false });
    expect(finishTourDaily(done, '2026-10-31', 6100)).toBe(done);
    expect(finishTourDaily(null, '2026-10-31', 1)).toBeNull();
    expect(finishTourDaily(started, '2026-11-01', 1)).toBe(started);
    expect(sentTourDaily(done, '2026-10-31')).toEqual({ date: '2026-10-31', score: 4017, sent: true });
    expect(sentTourDaily(started, '2026-10-31')).toBe(started);
  });
  it('读存档时整理：坏的当没有，没分数不可能已上榜', () => {
    expect(parseTourDaily({ date: 'x' })).toBeNull();
    expect(parseTourDaily({ date: '2026-10-31', score: -1, sent: true })).toEqual({ date: '2026-10-31', score: null, sent: false });
    expect(parseTourDaily({ date: '2026-10-31', score: 5000, sent: true })).toEqual({ date: '2026-10-31', score: 5000, sent: true });
  });
  it('流程：模拟一场结束的记分，重复结算只交一次', async () => {
    const calls: unknown[] = [];
    const f = (async (_u: string, init: RequestInit) => {
      calls.push(JSON.parse(init.body as string));
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    let rec = startTourDaily(null, '2026-10-31');
    for (let i = 0; i < 3; i++) {
      const next = finishTourDaily(rec, '2026-10-31', 3020);
      if (next !== rec) {
        rec = next;
        if (await submitScore(dailyTourBoardId('2026-10-31'), 3020, f)) rec = sentTourDaily(rec, '2026-10-31');
      }
    }
    expect(calls).toEqual([{ gameId: 'texas', boardId: 'daily-2026-10-31-tour', score: 3020 }]);
    expect(rec?.sent).toBe(true);
  });
});

class MemStore implements Store {
  m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
}

const deps = (seed: number): TourDeps => ({
  wallet: {} as WalletApi,
  store: new MemStore(),
  entropy: () => [seed, 2, 3, 4, 5, 6, 7, 8],
  newId: () => 'id',
  think: () => 0,
  gap: () => 0,
  wait: async () => {},
  onStep: async () => {},
});

describe('今日锦标赛开一场', () => {
  const open = async (seed: number, date: string) => {
    const t = await TourSolo.open(deps(seed), { userId: null, stakes: 'small', practice: true, level: 1, format: 'turbo', entropy: dailyTourSeed(date), daily: { date, scored: true } });
    if ('error' in t) throw new Error(t.error);
    return t;
  };
  it('同一天开出同样的牌、座位和电脑性格（和本机随机种子无关）', async () => {
    const a = await open(1, '2026-10-31');
    const b = await open(999, '2026-10-31');
    expect(b.table.seats.map((s) => s.persona)).toEqual(a.table.seats.map((s) => s.persona));
    expect(b.table.seats.map((s) => s.hole)).toEqual(a.table.seats.map((s) => s.hole));
    const c = await open(1, '2026-11-01');
    expect(c.table.seats.map((s) => s.persona)).not.toEqual(a.table.seats.map((s) => s.persona));
    expect(a.session.daily).toEqual({ date: '2026-10-31', scored: true });
    expect(a.table.seats).toHaveLength(6);
  });
  it('打完后记下我出局（或夺冠）时的手数，分数用它', async () => {
    const t = await open(1, '2026-10-31');
    await t.leave();
    const { place } = t.result();
    expect(t.state.over).toBe(true);
    expect(t.myHands).toBeGreaterThan(0);
    expect(tourScore(place, t.myHands)).toBeGreaterThanOrEqual(1000);
  });
});
