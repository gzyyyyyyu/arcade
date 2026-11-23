import { describe, expect, it } from 'vitest';
import { rushPresets, rushRoute, type RushResult } from '../../src/core/rush.ts';
import { normalizeSetup } from '../../src/core/state.ts';
import { decodeRush, isRushSetup, RUSH_FREE_MAX_DANGER, rushBoardId, rushDaily, rushFree, rushScore, rushShort, withLoadout } from '../../src/online/rush.ts';
import { formatScore, submissionsFor } from '../../src/online/score.ts';
import type { RunSummary } from '../../src/online/types.ts';
import { rushCoins, runCoins } from '../../src/platform/save.ts';
import { weekGoals } from '../../src/content/weekGoals.ts';
import { emptyRecords, recordRush } from '../../src/meta/records.ts';

const S = 30;
const res = (p: Partial<RushResult>): RushResult => ({ down: 0, total: 11, cleared: false, ticks: 600 * S, progress: 0, hexes: 0, ...p });
const sum = (xs: readonly { coins: number }[]): number => xs.reduce((a, x) => a + x.coins, 0);

describe('连战分数', () => {
  it('排序：天亮 > 打倒只数 > 咒条数 > 快 / 最后一只打得深', () => {
    const order = [
      res({ down: 3, progress: 0.5 }),
      res({ down: 3, progress: 0.9 }),
      res({ down: 3, hexes: 1, progress: 0.1 }),
      res({ down: 4 }),
      res({ down: 10, hexes: 2, progress: 0.99 }),
      res({ down: 11, cleared: true, ticks: 1400 * S }),
      res({ down: 11, cleared: true, ticks: 900 * S }),
      res({ down: 11, cleared: true, hexes: 1, ticks: 1490 * S }),
      res({ down: 11, cleared: true, hexes: 2, ticks: 2000 * S }),
    ].map(rushScore);
    for (let i = 1; i < order.length; i++) expect(order[i]!).toBeGreaterThan(order[i - 1]!);
    expect(Math.max(...order)).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  it('decodeRush 往返，短写法', () => {
    for (const r of [res({ down: 7, hexes: 2, progress: 0.42 }), res({ down: 11, cleared: true, hexes: 1, ticks: 812 * S }), res({ down: 0 })]) {
      const d = decodeRush(rushScore(r));
      expect(d).toMatchObject({ cleared: r.cleared, down: r.down, hexes: r.hexes, total: 11 });
      expect(d.tail).toBe(r.cleared ? 1500 - 812 : Math.floor(r.progress * 100));
    }
    expect(rushShort(rushScore(res({ down: 11, cleared: true, ticks: 812 * S })))).toBe('天亮 13:32');
    expect(rushShort(rushScore(res({ down: 11, cleared: true, ticks: 1600 * S })))).toBe('天亮 25:00+');
    expect(rushShort(rushScore(res({ down: 6, hexes: 2 })))).toBe('6/11 · 咒 2');
    expect(formatScore('daily-rush', rushScore(res({ down: 6, progress: 0.3 })))).toBe('连战 6/11 · 下一只 30%');
  });
});

describe('每日、自由连战的设置', () => {
  const date = '2026-11-23';
  it('同一天同种子，图是路线图第一条路的；自由连战危险截到 0–4', () => {
    const a = rushDaily(date).setup;
    expect(rushDaily(date).setup).toEqual(a);
    expect(a).toMatchObject({ rush: true, danger: 2, mode: 'vigil' });
    expect(a.map).toBe(rushRoute(a.seed).layers[0]![0]!.map);
    expect(rushBoardId(date)).toBe('daily-2026-11-23-rush');
    expect(rushFree(5, 8).danger).toBe(RUSH_FREE_MAX_DANGER);
    expect(rushFree(5, 0).danger).toBe(0);
  });

  it('isRushSetup 认自由配装（别的角色也行）和 ≤2 条咒，规整过的也认', () => {
    const base = rushDaily(date).setup;
    for (const c of ['xiaodao', 'jianxia'] as const) {
      for (const l of rushPresets(c)) {
        const s = withLoadout(base, l, ['dark', 'fierce']);
        expect(isRushSetup(date, s)).toBe(true);
        expect(isRushSetup(date, normalizeSetup(s))).toBe(true);
      }
    }
    const ok = withLoadout(base, rushPresets('xiaodao')[0]);
    expect(isRushSetup(date, ok)).toBe(true);
    expect(isRushSetup(date, { ...ok, rushLoadout: undefined })).toBe(false);
    expect(isRushSetup(date, { ...ok, rushHexes: ['dark', 'fast', 'poor'] })).toBe(false);
    expect(isRushSetup(date, { ...ok, rushHexes: ['dark', 'dark'] })).toBe(false);
    expect(isRushSetup(date, { ...ok, curses: ['more'] })).toBe(false);
    expect(isRushSetup(date, { ...ok, danger: 3 })).toBe(false);
    expect(isRushSetup(date, { ...ok, seed: ok.seed + 1 })).toBe(false);
    expect(isRushSetup(date, { ...ok, character: 'jianxia' })).toBe(false);
    expect(isRushSetup(date, { ...ok, perks: { liliang: 1 } })).toBe(false);
    expect(isRushSetup(date, { ...ok, rushLoadout: { ...rushPresets('xiaodao')[0], start: 'zzz' as never } })).toBe(false);
    expect(isRushSetup('2026-11-24', ok)).toBe(false);
  });

  it('只有每日连战交榜，自由连战不交', () => {
    const daily = withLoadout(rushDaily(date).setup, rushPresets('xiaodao')[1]);
    const run = (setup: RunSummary['setup'], d: string | null): RunSummary => ({ runId: 'x', setup, won: false, quit: false, bossKilled: false, seconds: 600, kills: 0, level: 10, coins: 0, loot: 0, live: false, reducedDamage: false, daily: d, rush: res({ down: 5 }) });
    expect(submissionsFor(run(daily, date), date)).toEqual([{ board: 'daily-rush', boardId: rushBoardId(date), score: rushScore(res({ down: 5 })) }]);
    expect(submissionsFor(run(withLoadout(rushFree(9, 2), rushPresets('xiaodao')[0]), null), date)).toEqual([]);
  });
});

describe('连战铜钱', () => {
  it('危险 2 全清 15 分钟：约 650，不超过守夜同时长（天亮、尸王、1,500 只，不算捡的）', () => {
    const r = sum(rushCoins({ id: 'a', danger: 2, ticks: 15 * 60 * S, down: 11, cleared: true, hexes: [] }));
    const v = sum(runCoins({ id: 'b', danger: 2, won: true, quit: false, ticks: 15 * 60 * S, kills: 1500, coins: 0, curses: 0, boss: true }));
    expect(r).toBeGreaterThan(600);
    expect(r).toBeLessThanOrEqual(v);
  });

  it('咒按比例加，危险档放大，没打倒夜漏君不给那一份', () => {
    const plain = sum(rushCoins({ id: 'a', danger: 0, ticks: 10 * 60 * S, down: 6, cleared: false, hexes: [] }));
    expect(plain).toBe(10 * 10 + 6 * 12);
    const hexed = rushCoins({ id: 'a', danger: 0, ticks: 10 * 60 * S, down: 6, cleared: false, hexes: ['fierce', 'poor'] });
    expect(hexed.at(-1)).toEqual({ label: '咒 2 条', coins: Math.floor(plain * 0.6) });
    expect(sum(rushCoins({ id: 'a', danger: 4, ticks: 10 * 60 * S, down: 6, cleared: false, hexes: [] }))).toBe(Math.floor(100 * 1.8) + Math.floor(72 * 1.8));
  });
});

describe('连战的纪录、成就、周目标', () => {
  it('天亮记次数、解锁「更漏碎了」；危险 2 带 2 条咒再解「十殿过尽」；认输不算', () => {
    let rec = emptyRecords();
    const a = recordRush(rec, { cleared: true, danger: 1, hexes: 2, score: 1, free: true, quit: true });
    expect(a.unlocked).toEqual([]);
    const b = recordRush(rec, { cleared: true, danger: 1, hexes: 2, score: 1, free: false, quit: false });
    expect(b.unlocked).toEqual(['rush_dawn']);
    rec = b.records;
    const c = recordRush(rec, { cleared: true, danger: 2, hexes: 2, score: 1, free: false, quit: false });
    expect(c.unlocked).toEqual(['rush_hard']);
    expect(recordRush(c.records, { cleared: true, danger: 3, hexes: 2, score: 1, free: false, quit: false }).unlocked).toEqual([]);
  });

  it('自由连战按危险档记最好，每日的不记', () => {
    const r0 = emptyRecords();
    const a = recordRush(r0, { cleared: false, danger: 3, hexes: 0, score: 500, free: true, quit: false });
    expect(a.best).toBe(true);
    expect(a.records.rushBest['3']).toBe(500);
    expect(recordRush(a.records, { cleared: false, danger: 3, hexes: 0, score: 400, free: true, quit: false }).best).toBe(false);
    expect(recordRush(r0, { cleared: false, danger: 3, hexes: 0, score: 500, free: false, quit: false }).records.rushBest).toEqual({});
  });

  it('周目标：连战只给打倒精英、打倒尸王的进度，不给天亮', () => {
    const run = { mode: 'rush' as const, won: true, danger: 4, kills: 0, elites: 7, boss: true, evolves: 0, treasures: 0 };
    for (let w = 0; w < 4; w++) {
      for (const g of weekGoals(w)) {
        const n = g.gain(run);
        if (g.id.startsWith('elite')) expect(n).toBe(7);
        else if (g.id === 'boss2') expect(n).toBe(1);
        else expect(n).toBe(0);
      }
    }
  });
});
