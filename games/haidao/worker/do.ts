/**
 * 海岛的两个 Durable Object（SQLite 后端）：外壳只把 ctx.storage 包成 Kv、把 RPC 转给 worker/pvp 里的逻辑类。
 * 只在 Worker 入口里引用（用到 Workers 的全局类型），测试直接测逻辑类。
 */
import { DurableObject } from 'cloudflare:workers';
import { meterLevel, meterReport, type MeterEnv } from 'arcade-kit/meter';
import { BASE_METHODS, HARBOR_METHODS, type BasePort, type HarborPort, type Ports } from './pvp/api.ts';
import { BaseCore } from './pvp/base.ts';
import { HarborCore, hqSpan, INACTIVE_MS, TROPHY_RANGE, type HarborStore, type PvpStats, type RangeQuery, type RecentQuery } from './pvp/harbor.ts';
import type { HarborEntry } from './pvp/base.ts';
import type { Kv } from './pvp/kv.ts';

function doKv(storage: DurableObjectStorage): Kv {
  return {
    get: <T>(key: string) => storage.get<T>(key),
    put: (key, value) => storage.put(key, value),
    list: <T>(prefix: string) => storage.list<T>({ prefix }),
  };
}

type Call = (...a: unknown[]) => Promise<unknown>;

/** 每个玩家一个（idFromName(userId)）。userId 由 Worker 每次带进来（认人在 Worker 做，浏览器碰不到 DO） */
export class Base extends DurableObject {
  private core: BaseCore | null = null;
  async run(userId: string, method: string, args: unknown[]): Promise<unknown> {
    if (!(BASE_METHODS as readonly string[]).includes(method)) throw new Error('bad method');
    this.core ??= new BaseCore(doKv(this.ctx.storage), userId);
    return (this.core[method as keyof BaseCore] as unknown as Call).apply(this.core, args);
  }
}

type Row = { id: string; name: string; trophies: number; hq: number; shield: number; protect: number; lock_until: number; active: number; ref: string };
const COLS = 'id, name, trophies, hq, shield, protect, lock_until, active, ref';
const toEntry = (r: Row): HarborEntry => ({ id: r.id, name: r.name, trophies: r.trophies, hq: r.hq, shieldUntil: r.shield, protectUntil: r.protect, lockUntil: r.lock_until, activeAt: r.active, ref: r.ref });

/**
 * Harbor 的 SQLite 表：一人一行，奖杯上有索引（挑候选是带 LIMIT 的范围查询，不扫整张表），activeAt 上有索引（删久不上线的旧记录）。
 * 建表放在构造里（IF NOT EXISTS，表在就不写）。条件和 harbor.ts 的 eligible 一一对应。
 */
function sqlHarbor(sql: SqlStorage): HarborStore {
  sql.exec(`CREATE TABLE IF NOT EXISTS harbor (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', trophies INTEGER NOT NULL, hq INTEGER NOT NULL, shield INTEGER NOT NULL, protect INTEGER NOT NULL, lock_until INTEGER NOT NULL, active INTEGER NOT NULL, ref TEXT NOT NULL DEFAULT '')`);
  // 昵称列、名单编号列是后加的（港口名单）：老表补列；昵称旧行空串，下次上传或结算时写上；编号旧行一次补上随机数（只在加列那次写）
  const cols = new Set(sql.exec<{ name: string }>(`PRAGMA table_info(harbor)`).toArray().map((c) => c.name));
  if (!cols.has('name')) sql.exec(`ALTER TABLE harbor ADD COLUMN name TEXT NOT NULL DEFAULT ''`);
  if (!cols.has('ref')) {
    sql.exec(`ALTER TABLE harbor ADD COLUMN ref TEXT NOT NULL DEFAULT ''`);
    sql.exec(`UPDATE harbor SET ref = lower(hex(randomblob(8)))`);
  }
  sql.exec(`CREATE INDEX IF NOT EXISTS harbor_trophies ON harbor (trophies, id)`);
  sql.exec(`CREATE INDEX IF NOT EXISTS harbor_active ON harbor (active)`);
  // 汇总统计：只有一行（id = 1，JSON），不进匹配查询
  sql.exec(`CREATE TABLE IF NOT EXISTS pvp_stats (id INTEGER PRIMARY KEY, v TEXT NOT NULL)`);
  return {
    async put(e) {
      // 编号只在新行生成，已有的行不动（上游传进来的 ref 不看）
      sql.exec(
        `INSERT INTO harbor (${COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, lower(hex(randomblob(8))))
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, trophies = excluded.trophies, hq = excluded.hq, shield = excluded.shield,
           protect = excluded.protect, lock_until = excluded.lock_until, active = excluded.active`,
        e.id, e.name ?? '', e.trophies, e.hq, e.shieldUntil, e.protectUntil, e.lockUntil, e.activeAt,
      );
    },
    async stats() {
      const row = sql.exec<{ v: string }>(`SELECT v FROM pvp_stats WHERE id = 1`).toArray()[0];
      return row ? (JSON.parse(row.v) as PvpStats) : null;
    },
    async putStats(st) {
      sql.exec(`INSERT OR REPLACE INTO pvp_stats (id, v) VALUES (1, ?)`, JSON.stringify(st));
    },
    async range(r: RangeQuery) {
      const q = r.q;
      const rows = sql
        .exec<Row>(
          `SELECT ${COLS} FROM harbor
           WHERE trophies BETWEEN ? AND ? AND id != ? AND id NOT IN (SELECT value FROM json_each(?))
             AND hq BETWEEN ? AND ? AND shield <= ? AND protect <= ? AND lock_until < ? AND active > ?
           ORDER BY trophies ${r.desc ? 'DESC' : 'ASC'}, id ${r.desc ? 'DESC' : 'ASC'} LIMIT ?`,
          Math.max(r.lo, q.trophies - (q.trophyRange ?? TROPHY_RANGE)), Math.min(r.hi, q.trophies + (q.trophyRange ?? TROPHY_RANGE)), q.attackerId, JSON.stringify(q.exclude),
          ...hqSpan(q), q.now, q.now, q.now, q.now - INACTIVE_MS, r.limit,
        )
        .toArray();
      return rows.map(toEntry);
    },
    async recent(r: RecentQuery) {
      const rows = sql
        .exec<Row>(
          `SELECT ${COLS} FROM harbor WHERE active > ? AND hq BETWEEN ? AND ? AND id NOT IN (SELECT value FROM json_each(?))
           ORDER BY active DESC, id ASC LIMIT ?`,
          r.now - INACTIVE_MS, r.hqLo, r.hqHi, JSON.stringify(r.exclude), r.limit,
        )
        .toArray();
      return rows.map(toEntry);
    },
    async prune(before, limit) {
      return sql.exec(`DELETE FROM harbor WHERE id IN (SELECT id FROM harbor WHERE active < ? LIMIT ?)`, before, limit).rowsWritten;
    },
  };
}

/** 全站一个（idFromName('all')）：匹配索引 */
export class Harbor extends DurableObject {
  private core: HarborCore | null = null;
  async run(method: string, args: unknown[]): Promise<unknown> {
    if (!(HARBOR_METHODS as readonly string[]).includes(method)) throw new Error('bad method');
    this.core ??= new HarborCore(sqlHarbor(this.ctx.storage.sql));
    return (this.core[method as keyof HarborCore] as unknown as Call).apply(this.core, args);
  }
}

export interface DoEnv extends MeterEnv {
  BASE?: DurableObjectNamespace<Base>;
  HARBOR?: DurableObjectNamespace<Harbor>;
}

/** 两个绑定都在才有 PvP；缺了按单独部署处理（501） */
export function portsOf(env: DoEnv): Ports | null {
  const { BASE, HARBOR } = env;
  if (!BASE || !HARBOR) return null;
  const proxy = <T>(call: (method: string, args: unknown[]) => Promise<unknown>, names: readonly string[]): T =>
    Object.fromEntries(names.map((n) => [n, (...args: unknown[]) => call(n, args)])) as T;
  return {
    meter: { level: () => meterLevel(env), report: (n) => meterReport(env, n) },
    base: (userId) => {
      const stub = BASE.get(BASE.idFromName(userId));
      return proxy<BasePort>((m, a) => stub.run(userId, m, a) as Promise<unknown>, BASE_METHODS);
    },
    harbor: () => {
      const stub = HARBOR.get(HARBOR.idFromName('all'));
      return proxy<HarborPort>((m, a) => stub.run(m, a) as Promise<unknown>, HARBOR_METHODS);
    },
  };
}
