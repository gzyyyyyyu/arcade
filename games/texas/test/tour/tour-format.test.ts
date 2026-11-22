/** 单机锦标赛的赛制（极速赛、9 人赛，docs/tournament.md 14.4）：盲注表、奖金和电脑强弱、实盘报名和结算、存档里的赛制和接着打。 */
import { stream } from 'arcade-kit/rng';
import { describe, expect, it } from 'vitest';
import { SOLO_LEVEL, STAKES } from '../../src/core/stakes.ts';
import type { WalletApi } from '../../src/net/wallet.ts';
import type { Store } from '../../src/solo.ts';
import {
  BLINDS,
  FORMATS,
  NINE_BLINDS,
  TURBO_BLINDS,
  formatInfo,
  newTour,
  payouts,
  playOut,
  tourLevel,
  tourView,
  type TourFormat,
  type TourState,
} from '../../src/tour/rules.ts';
import { TOUR_KEY, TourSolo, type TourDeps } from '../../src/tour-solo.ts';

const seedOf = (g: number): number[] => {
  const e = stream([0x7406, g, 1, 1, 2, 2, 3, 3], 'seed');
  return Array.from({ length: 8 }, () => e.below(0x100000000));
};
const mk = (format: TourFormat, g = 1): TourState => newTour({ format, humans: Array.from({ length: formatInfo(format).seats }, (_, i) => i === 0) }, seedOf(g));

describe('赛制表', () => {
  it('盲注表单调上升、起手 1,500 在 30 个大盲以上；极速赛涨得更快，9 人赛座位 9', () => {
    for (const f of FORMATS) {
      const b = formatInfo(f).blinds;
      for (let i = 1; i < b.length; i++) {
        expect(b[i]![1]).toBeGreaterThan(b[i - 1]![1]);
        expect(b[i]![0] * 2).toBe(b[i]![1]);
      }
      expect(1_500 / b[0]![1]).toBeGreaterThanOrEqual(30);
    }
    expect(formatInfo('sng')).toMatchObject({ seats: 6, every: 6, blinds: BLINDS });
    expect(formatInfo('turbo')).toMatchObject({ seats: 6, every: 3, blinds: TURBO_BLINDS });
    expect(formatInfo('nine')).toMatchObject({ seats: 9, every: 6, blinds: NINE_BLINDS });
    expect(formatInfo(undefined).blinds).toBe(BLINDS);
  });

  it('经典不写 format（旧存档一样）；极速赛每 3 手涨一级，9 人赛每 6 手；视图的盲注跟着赛制', () => {
    expect(mk('sng').format).toBeUndefined();
    const t = mk('turbo');
    expect(t.table.seats.length).toBe(6);
    expect(t.every).toBe(3);
    expect(tourView(t, 0).blinds).toEqual(TURBO_BLINDS[0]);
    expect(tourView(t, 0).next).toEqual(TURBO_BLINDS[1]);
    const n = mk('nine');
    expect(n.table.seats.length).toBe(9);
    expect(n.table.seats.reduce((a, x) => a + x.stack + x.bet, 0)).toBe(9 * 1_500);
    expect(tourView(n, 0).blinds).toEqual(NINE_BLINDS[0]);
  });

  it.each(FORMATS)('%s：确定地打完，涨盲按手数、总筹码守恒、名次不重', (f) => {
    const s = playOut(mk(f, 2));
    expect(s.over).toBe(true);
    const total = formatInfo(f).seats * 1_500;
    expect(s.table.seats.reduce((a, x) => a + x.stack, 0)).toBe(total);
    expect([...s.places].sort((a, b) => a! - b!)).toEqual(Array.from({ length: formatInfo(f).seats }, (_, i) => i + 1));
    expect(playOut(mk(f, 2)).places).toEqual(s.places);
    const b = formatInfo(f).blinds;
    expect([s.table.sb, s.table.bb]).toEqual(b[Math.min(b.length - 1, Math.floor((s.table.handNo - 1) / formatInfo(f).every))]);
  });
});

describe('奖金和电脑强弱（CI 配平，docs/tournament.md 14.4）', () => {
  it('每个赛制第 1 名最多 4 份：一场净赢不超过 3 份（仓库根 docs/balance.md 第 2 节）；名次越前拿得越多，取整到整数', () => {
    for (const f of FORMATS)
      for (const b of [100, 500, 2_000, 33, 7]) {
        const p = payouts(b, f);
        expect(p).toHaveLength(formatInfo(f).seats);
        expect(p[0]! - b).toBeLessThanOrEqual(3 * b);
        expect(p.every(Number.isInteger)).toBe(true);
        for (let i = 1; i < p.length; i++) expect(p[i]!).toBeLessThanOrEqual(p[i - 1]!);
      }
  });

  it('经典前四名 3 / 1.2 / 1 / 0.9；极速赛 3.3 / 1 / 0.9 / 0.9；9 人赛 4 / 1.4 / 1.3 / 1.2', () => {
    expect(payouts(1_000)).toEqual([3_000, 1_200, 1_000, 900, 0, 0]);
    expect(payouts(1_000, 'turbo')).toEqual([3_300, 1_000, 900, 900, 0, 0]);
    expect(payouts(1_000, 'nine')).toEqual([4_000, 1_400, 1_300, 1_200, 0, 0, 0, 0, 0]);
  });

  it('实盘的电脑强弱：三种赛制都比现金桌（SOLO_LEVEL）弱一档（0/1/2/3），档位越高越强', () => {
    for (const f of FORMATS) for (const st of STAKES) expect(tourLevel(f, st.id)).toBe(SOLO_LEVEL[st.id] - 1);
    for (const f of FORMATS) for (let i = 1; i < STAKES.length; i++) expect(tourLevel(f, STAKES[i]!.id)).toBeGreaterThan(tourLevel(f, STAKES[i - 1]!.id));
  });

  it.each(['turbo', 'nine'] as const)('%s 实盘：报名扣这一档的一份，离开托管打完按本赛制的奖金表结回', async (format) => {
    const calls: [string, number][] = [];
    const wallet = {
      buyin: async (_op: string, _ref: string, _stakes: string, amount: number) => {
        calls.push(['buyin', amount]);
        return { ok: true };
      },
      cashout: async (_op: string, _ref: string, amount: number) => {
        calls.push(['cashout', amount]);
        return { ok: true };
      },
    } as unknown as WalletApi;
    let n = 0;
    const d = { store: new MemStore(), wallet, newId: () => `x${++n}`, entropy: () => [1, 2, 3, 4, 5, 6, 7, 8], think: () => 0, gap: () => 0, wait: async () => {}, onStep: async () => {} } as unknown as TourDeps;
    const r = await TourSolo.open(d, { userId: 'u', stakes: 'small', practice: false, level: tourLevel(format, 'small'), format });
    if ('error' in r) throw new Error(r.error);
    const fee = STAKES.find((x) => x.id === 'small')!.max;
    expect(calls).toEqual([['buyin', fee]]);
    expect(await r.leave()).toBeNull();
    const { place, prize } = r.result();
    expect(prize).toBe(payouts(fee, format)[place - 1]);
    expect(calls).toEqual([['buyin', fee], ['cashout', prize]]);
  });
});

class MemStore implements Store {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

describe('存档和接着打', () => {
  it.each(['turbo', 'nine'] as const)('%s：开局存档记着赛制，读回来同一个赛制，接着打到结束并按人数算奖金', async (f) => {
    const store = new MemStore();
    let n = 0;
    const d = {
      wallet: {},
      store,
      entropy: () => seedOf(7),
      newId: () => `id${++n}`,
      think: () => 0,
      gap: () => 0,
      wait: async () => {},
      onStep: async () => {},
    } as unknown as TourDeps;
    const r = await TourSolo.open(d, { userId: 'u1', stakes: 'small', practice: true, level: 2, format: f });
    if ('error' in r) throw new Error(r.error);
    expect(r.state.table.seats.length).toBe(formatInfo(f).seats);
    const saved = JSON.parse(store.getItem(TOUR_KEY)!);
    expect(saved.state.format).toBe(f);
    const back = TourSolo.load(store, 'u1')!;
    expect(back.state.format).toBe(f);
    const t = new TourSolo(back, d);
    expect(t.view.blinds).toEqual(formatInfo(f).blinds[0]);
    expect(await t.leave()).toBeNull();
    expect(t.over).toBe(true);
    expect(t.result().order).toHaveLength(formatInfo(f).seats);
  });
});
