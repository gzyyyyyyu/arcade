/**
 * Harbor：全站一个，可被匹配的岛的索引（DESIGN.md 5.2）。每人一行，存储在 HarborStore 后面：
 * 线上是 DO 的 SQLite 表（worker/do.ts，奖杯上有索引，挑候选是带 LIMIT 的范围查询，不扫整张表），测试用内存版 MemHarbor。
 * 每个方法最多写 2 行。这里的护盾、锁只是"挑候选"用的近似值，真正说了算的是防守方 Base 的 lock()（会再查一遍）。
 * 超过 INACTIVE_DAYS 天没上传过快照的人不进匹配（查询里排除），顺手在写得不满 2 行的调用里删掉一行这样的旧记录。
 */
import type { HarborEntry } from './base.ts';
import type { Kv } from './kv.ts';

/** 奖杯差多少以内、主寨差几级以内算一个段位 */
export const TROPHY_RANGE = 150;
export const HQ_RANGE = 1;
/** 最近这么久有操作（上传快照）的算在线，不进匹配 */
export const ONLINE_MS = 3 * 60_000;
/** 这么多天没上传过快照的人不进匹配，记录逐步删掉 */
export const INACTIVE_DAYS = 14;
export const INACTIVE_MS = INACTIVE_DAYS * 24 * 3600_000;
/** 一次范围查询最多取几个候选 */
export const PICK_LIMIT = 32;

export interface PickReq {
  attackerId: string;
  trophies: number;
  hq: number;
  /** 24 小时内打过的人、这次已经试过不行的人 */
  exclude: string[];
  now: number;
  /** 0 ≤ rand < 1，Worker 用 crypto 给 */
  rand: number;
  /** 进攻方自己那一行（护盾已清零），顺手写进去 */
  self?: HarborEntry;
}

/** 范围查询：奖杯在 [lo, hi]、按奖杯升序（desc 时降序）取前 limit 个合格的 */
export interface RangeQuery {
  lo: number;
  hi: number;
  desc: boolean;
  limit: number;
  q: Omit<PickReq, 'rand' | 'self'> & HqSpan;
}

/**
 * 真人攻防的汇总统计（DESIGN.md 5.9）：不含任何个人信息，只有计数。cells 的键 `主寨差|进攻方主寨`，
 * 主寨差 = 防守方 − 进攻方，-2 以下并成 -2、+2 以上并成 2。放弃、过期空打只记 cancelled，不进 cells。
 */
export interface StatCell {
  n: number;
  /** 0 / 1 / 2 / 3 星各多少场 */
  stars: [number, number, number, number];
  /** 摧毁率（0–100）之和，除以 n 是平均 */
  pctSum: number;
}
export interface PvpStats {
  since: number;
  total: number;
  cancelled: number;
  cells: Record<string, StatCell>;
}
export interface RaidSample {
  /** 防守方主寨 − 进攻方主寨（原值，这里再并档） */
  diff: number;
  attHq: number;
  stars: number;
  pct: number;
  cancelled: boolean;
}
export const STAT_DIFF_MAX = 2;
const clampDiff = (d: number): number => Math.max(-STAT_DIFF_MAX, Math.min(STAT_DIFF_MAX, d));

/** 把一场记进汇总（纯函数，测试直接用） */
export function addSample(st: PvpStats, x: RaidSample): PvpStats {
  st.total++;
  if (x.cancelled) {
    st.cancelled++;
    return st;
  }
  const key = `${clampDiff(x.diff)}|${x.attHq}`;
  const c = (st.cells[key] ??= { n: 0, stars: [0, 0, 0, 0], pctSum: 0 });
  c.n++;
  c.stars[Math.max(0, Math.min(3, Math.floor(x.stars)))]!++;
  c.pctSum += x.pct;
  return st;
}

/** 给管理员看的样子：展开成数组，加上 ≥1 星场数和平均摧毁率 */
export function viewStats(st: PvpStats | null, now: number): unknown {
  const s = st ?? { since: now, total: 0, cancelled: 0, cells: {} };
  const cells = Object.entries(s.cells)
    .map(([k, c]) => {
      const [diff, attHq] = k.split('|').map(Number) as [number, number];
      return { diff, attHq, n: c.n, stars: c.stars, ge1: c.n - c.stars[0], avgPct: Math.round((c.pctSum / c.n) * 10) / 10 };
    })
    .sort((a, b) => a.diff - b.diff || a.attHq - b.attHq);
  return { ok: true, since: s.since, total: s.total, cancelled: s.cancelled, counted: s.total - s.cancelled, cells };
}

/** Harbor 的存储：put / remove 各算一行写入 */
export interface HarborStore {
  put(e: HarborEntry): Promise<void>;
  /** 汇总统计：单独一行，不在匹配索引里 */
  stats(): Promise<PvpStats | null>;
  putStats(s: PvpStats): Promise<void>;
  range(r: RangeQuery): Promise<HarborEntry[]>;
  /** 删掉最多 limit 个 activeAt < before 的旧记录，回删了几行 */
  prune(before: number, limit: number): Promise<number>;
}

/** 候选的主寨区间：不给就是同级上下各 HQ_RANGE 级；pick 分档挑时用它收窄 */
export interface HqSpan {
  hqLo?: number;
  hqHi?: number;
}
export const hqSpan = (q: Omit<PickReq, 'rand' | 'self'> & HqSpan): [number, number] => [q.hqLo ?? q.hq - HQ_RANGE, q.hqHi ?? q.hq + HQ_RANGE];

export function eligible(e: HarborEntry, q: Omit<PickReq, 'rand' | 'self'> & HqSpan): boolean {
  const [hqLo, hqHi] = hqSpan(q);
  return (
    e.id !== q.attackerId &&
    !q.exclude.includes(e.id) &&
    Math.abs(e.trophies - q.trophies) <= TROPHY_RANGE &&
    e.hq >= hqLo &&
    e.hq <= hqHi &&
    e.shieldUntil <= q.now &&
    e.protectUntil <= q.now &&
    e.lockUntil < q.now &&
    q.now - e.activeAt >= ONLINE_MS &&
    q.now - e.activeAt < INACTIVE_MS
  );
}

/** 测试用：内存版，writes 记累计写了几行（put、删各算一行） */
export class MemHarbor implements HarborStore {
  rows = new Map<string, HarborEntry>();
  writes = 0;
  statsRow: PvpStats | null = null;
  async put(e: HarborEntry): Promise<void> {
    this.writes++;
    this.rows.set(e.id, structuredClone(e));
  }
  async stats(): Promise<PvpStats | null> {
    return this.statsRow ? structuredClone(this.statsRow) : null;
  }
  async putStats(s: PvpStats): Promise<void> {
    this.writes++;
    this.statsRow = structuredClone(s);
  }
  async range(r: RangeQuery): Promise<HarborEntry[]> {
    return rangeOf(this.rows.values(), r);
  }
  async prune(before: number, limit: number): Promise<number> {
    let n = 0;
    for (const [k, e] of this.rows) {
      if (n >= limit) break;
      if (e.activeAt < before) {
        this.rows.delete(k);
        this.writes++;
        n++;
      }
    }
    return n;
  }
}

/** 内存里模拟"奖杯索引 + LIMIT"：同奖杯按 id 排，和 SQL 的 ORDER BY trophies, id 一致 */
function rangeOf(rows: Iterable<HarborEntry>, r: RangeQuery): HarborEntry[] {
  const list = [...rows].filter((e) => e.trophies >= r.lo && e.trophies <= r.hi && eligible(e, r.q)).sort((a, b) => a.trophies - b.trophies || (a.id < b.id ? -1 : 1));
  if (r.desc) list.reverse();
  return list.slice(0, r.limit).map((e) => structuredClone(e));
}

/** 本地工具（tools/shot.ts 的假港口）还在用键值假存储：每人一行 `u:<id>`，查询整张读出来过滤，不删旧记录。线上不走这里 */
function kvHarbor(kv: Kv): HarborStore {
  return {
    put: (e) => kv.put(`u:${e.id}`, e),
    stats: async () => (await kv.get<PvpStats>('stats')) ?? null,
    putStats: (st) => kv.put('stats', st),
    range: async (r) => rangeOf((await kv.list<HarborEntry>('u:')).values(), r),
    prune: async () => 0,
  };
}

export class HarborCore {
  private store: HarborStore;
  constructor(store: HarborStore | Kv) {
    this.store = 'range' in store ? store : kvHarbor(store);
  }

  /** 写得不满 2 行时顺手删旧记录，凑满也不超过 2 行 */
  private async tidy(written: number, now: number): Promise<void> {
    if (written < 2) await this.store.prune(now - INACTIVE_MS, 2 - written);
  }

  /** 更新最多两行（结算后的防守方 + 进攻方，或上传快照的人）；带了 now 才顺手删旧记录 */
  async upsert(entries: HarborEntry[], now?: number): Promise<{ ok: true }> {
    const list = entries.slice(0, 2);
    for (const e of list) await this.store.put(e);
    if (now !== undefined) await this.tidy(list.length, now);
    return { ok: true };
  }

  /**
   * 挑一个候选，先在索引里标上锁（防两个人同时挑中），回 userId；没有合适的回 null。最多 2 行（候选的锁 + 进攻方自己）。
   * 主寨分两档：先找同级和低一级（防守方主寨 ≤ 进攻方，高一级的岛对进攻方太难，DESIGN.md 5.9），这一档一个都没有才给高一级。
   * 每档不扫整张表：rand 在奖杯段里定一个起点，往上取 PICK_LIMIT 个，取不到再从起点往下取，再用 rand 在取到的里面挑。
   */
  async pick(q: PickReq, lockMs: number): Promise<{ id: string | null }> {
    let written = 0;
    if (q.self) {
      await this.store.put(q.self);
      written++;
    }
    const lo = q.trophies - TROPHY_RANGE;
    const hi = q.trophies + TROPHY_RANGE;
    const pivot = Math.min(hi, lo + Math.floor(q.rand * (hi - lo + 1)));
    const tiers: [number, number][] = [
      [q.hq - HQ_RANGE, q.hq],
      [q.hq + 1, q.hq + HQ_RANGE],
    ];
    let list: HarborEntry[] = [];
    for (const [hqLo, hqHi] of tiers) {
      if (hqLo > hqHi) continue;
      const base = { attackerId: q.attackerId, trophies: q.trophies, hq: q.hq, exclude: q.exclude, now: q.now, hqLo, hqHi };
      list = await this.store.range({ lo: pivot, hi, desc: false, limit: PICK_LIMIT, q: base });
      // 往下取的是离起点最近的那些（降序），翻回升序再挑，rand 的含义两边一致
      if (list.length === 0) list = (await this.store.range({ lo, hi: pivot - 1, desc: true, limit: PICK_LIMIT, q: base })).reverse();
      if (list.length > 0) break;
    }
    if (list.length === 0) {
      await this.tidy(written, q.now);
      return { id: null };
    }
    const e = list[Math.min(list.length - 1, Math.floor(q.rand * list.length))]!;
    await this.store.put({ ...e, lockUntil: q.now + lockMs });
    return { id: e.id };
  }

  /** 记一场真人攻防进汇总：读一行、写一行（1 行写入） */
  async tally(x: RaidSample, now: number): Promise<{ ok: true }> {
    const st = (await this.store.stats()) ?? { since: now, total: 0, cancelled: 0, cells: {} };
    await this.store.putStats(addSample(st, x));
    return { ok: true };
  }

  /** 汇总（只读，0 行写入） */
  async stats(now: number): Promise<unknown> {
    return viewStats(await this.store.stats(), now);
  }
}
