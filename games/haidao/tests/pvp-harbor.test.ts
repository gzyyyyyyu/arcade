import { describe, expect, it } from 'vitest';
import { HarborCore, INACTIVE_MS, MemHarbor, PICK_LIMIT, addSample, viewStats } from '../worker/pvp/harbor.ts';
import type { PickReq, PvpStats } from '../worker/pvp/harbor.ts';
import type { HarborEntry } from '../worker/pvp/base.ts';

/** 匹配池不能只增不删（审阅第 6 条）：久不上线的不进匹配、旧记录被顺手删掉，挑对手不扫整张表 */
const NOW = 1_800_000_000_000;
function entry(over: Partial<HarborEntry> = {}): HarborEntry {
  return { id: 'x', name: '', trophies: 100, hq: 1, shieldUntil: 0, protectUntil: 0, lockUntil: 0, activeAt: NOW - 3600_000, ...over };
}
const Q: Omit<PickReq, 'rand' | 'self'> = { attackerId: 'me', trophies: 100, hq: 1, exclude: [], now: NOW };

describe('Harbor 清理', () => {
  it('超过不活跃期限的人挑不到；写得不满 2 行的调用顺手删掉旧记录', async () => {
    const store = new MemHarbor();
    const h = new HarborCore(store);
    await h.upsert([entry({ id: 'old', activeAt: NOW - INACTIVE_MS - 1 })]);
    expect((await h.pick({ ...Q, rand: 0 }, 240_000)).id).toBeNull();
    // 再写一行（不满 2 行）：旧记录被删
    await h.upsert([entry({ id: 'fresh' })], NOW);
    expect(store.rows.has('old')).toBe(false);
    expect(store.rows.has('fresh')).toBe(true);
    expect((await h.pick({ ...Q, rand: 0 }, 240_000)).id).toBe('fresh');
  });

  it('挑对手只取一段（带 LIMIT），不读整张表', async () => {
    const store = new MemHarbor();
    const h = new HarborCore(store);
    for (let i = 0; i < 100; i += 2) await h.upsert([entry({ id: `p${i}` }), entry({ id: `p${i + 1}` })]);
    let maxRead = 0;
    const range = store.range.bind(store);
    store.range = async (r) => {
      const out = await range(r);
      maxRead = Math.max(maxRead, out.length);
      expect(r.limit).toBeLessThanOrEqual(PICK_LIMIT);
      return out;
    };
    expect((await h.pick({ ...Q, rand: 0.3 }, 240_000)).id).not.toBeNull();
    expect(maxRead).toBeLessThanOrEqual(PICK_LIMIT);
  });
});

describe('匹配偏同级（DESIGN.md 5.9）', () => {
  const pickId = async (h: HarborCore, hq: number, rand = 0): Promise<string | null> => (await h.pick({ ...Q, hq, rand }, 240_000)).id;
  it('有同级就不给高一级；同级和低一级都没有才给高一级', async () => {
    // 挑中会上锁，每个 rand 用一个新港口
    for (const rand of [0, 0.5, 0.99]) {
      const h = new HarborCore(new MemHarbor());
      await h.upsert([entry({ id: 'up', hq: 3, trophies: 100 }), entry({ id: 'same', hq: 2, trophies: 240 })]);
      expect(await pickId(h, 2, rand)).toBe('same');
    }
    const only = new HarborCore(new MemHarbor());
    await only.upsert([entry({ id: 'up', hq: 3 })]);
    expect(await pickId(only, 2)).toBe('up');
  });
  it('低一级也算优先，高两级仍然不给', async () => {
    for (const rand of [0, 0.5, 0.99]) {
      const h = new HarborCore(new MemHarbor());
      await h.upsert([entry({ id: 'up', hq: 3 }), entry({ id: 'down', hq: 1, trophies: 240 })]);
      expect(await pickId(h, 2, rand)).toBe('down');
    }
    const far = new HarborCore(new MemHarbor());
    await far.upsert([entry({ id: 'far', hq: 4 })]);
    expect(await pickId(far, 2)).toBeNull();
  });
  it('第一档里被锁了的不算：落到高一级', async () => {
    const h = new HarborCore(new MemHarbor());
    await h.upsert([entry({ id: 'same', hq: 2, lockUntil: NOW + 1000 }), entry({ id: 'up', hq: 3 })]);
    expect(await pickId(h, 2)).toBe('up');
  });
});

describe('汇总统计', () => {
  const fresh = (): PvpStats => ({ since: 5, total: 0, cancelled: 0, cells: {} });
  it('主寨差 -2 以下、+2 以上合并；放弃单独计数；星数分布、≥1 星、平均摧毁率', () => {
    const st = fresh();
    addSample(st, { diff: -5, attHq: 4, stars: 3, pct: 100, cancelled: false });
    addSample(st, { diff: -2, attHq: 4, stars: 0, pct: 20, cancelled: false });
    addSample(st, { diff: 7, attHq: 2, stars: 1, pct: 50, cancelled: false });
    addSample(st, { diff: 2, attHq: 2, stars: 0, pct: 10, cancelled: false });
    addSample(st, { diff: 1, attHq: 2, stars: 2, pct: 80, cancelled: true });
    expect(st.total).toBe(5);
    expect(st.cancelled).toBe(1);
    const v = viewStats(st, 9) as { since: number; counted: number; cells: Array<{ diff: number; attHq: number; n: number; stars: number[]; ge1: number; avgPct: number }> };
    expect(v.since).toBe(5);
    expect(v.counted).toBe(4);
    expect(v.cells).toEqual([
      { diff: -2, attHq: 4, n: 2, stars: [1, 0, 0, 1], ge1: 1, avgPct: 60 },
      { diff: 2, attHq: 2, n: 2, stars: [1, 1, 0, 0], ge1: 1, avgPct: 30 },
    ]);
  });
  it('tally 每次只写 1 行', async () => {
    const store = new MemHarbor();
    const h = new HarborCore(store);
    await h.tally({ diff: 0, attHq: 1, stars: 1, pct: 40, cancelled: false }, NOW);
    expect(store.writes).toBe(1);
    await h.tally({ diff: 0, attHq: 1, stars: 2, pct: 60, cancelled: false }, NOW + 1);
    expect(store.writes).toBe(2);
    expect(store.statsRow).toMatchObject({ since: NOW, total: 2 });
    expect(await h.stats(NOW)).toMatchObject({ counted: 2 });
  });
});
