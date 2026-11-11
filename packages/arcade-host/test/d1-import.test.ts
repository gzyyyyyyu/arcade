/** D1 整库导入：wrangler d1 export 格式和本包 backup 格式的大 dump，逐条执行、一个事务、失败原样不动。 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureSite, startSite, type Running } from './harness.ts';

const json = async (r: Response | Promise<Response>) => (await r).json() as Promise<any>;
const N_ROWS = 4000;
const SEQ = 9000;

/** 值里带分号、单引号、--、换行（wrangler 的 replace 写法）、中文 */
const val = (i: number) => `row ${i} ${"填充".repeat(20)}; it's -- /* x */ 中文\n第二行 ${i}`;
const lit = (v: string) => `replace('${v.replace(/'/g, "''").replace(/\n/g, '\\n')}','\\n',char(10))`;

function wranglerDump(extra = ''): string {
  const out: string[] = ['PRAGMA defer_foreign_keys=TRUE;'];
  out.push('CREATE TABLE IF NOT EXISTS "t"(id INTEGER PRIMARY KEY AUTOINCREMENT, v TEXT);');
  out.push('CREATE TABLE IF NOT EXISTS "child"(id INTEGER PRIMARY KEY, tid INTEGER NOT NULL REFERENCES t(id));');
  out.push('CREATE TABLE IF NOT EXISTS "log"(n INTEGER);');
  // 子表先于父表：要靠 defer_foreign_keys 才不报错
  out.push('INSERT INTO "child" ("id","tid") VALUES(1,1);');
  out.push('INSERT INTO "child" ("id","tid") VALUES(2,5);');
  for (let i = 1; i <= N_ROWS; i++) out.push(`INSERT INTO "t" ("id","v") VALUES(${i},${lit(val(i))});`);
  out.push('DELETE FROM sqlite_sequence;');
  out.push(`INSERT INTO "sqlite_sequence" VALUES('t',${SEQ});`);
  out.push('CREATE INDEX t_v ON t (v);');
  out.push('CREATE TRIGGER t_ai AFTER INSERT ON t BEGIN\n  INSERT INTO log VALUES (new.id);\n  INSERT INTO log VALUES (new.id * 10);\nEND;');
  if (extra) out.push(extra);
  return out.join('\n') + '\n';
}

describe('D1 整库导入（大 dump）', () => {
  let s: Running;
  beforeAll(async () => {
    s = await startSite(fixtureSite(), {}, { PROBE_SECRET: 'x' });
  }, 30_000);
  afterAll(async () => s?.cleanup());

  const q = (sql: string) => json(fetch(`${s.base}/games/probe/d1q`, { method: 'POST', body: JSON.stringify({ sql }) }));
  const imp = (body: string) => json(fetch(`${s.admin}/d1/d1-probe-DB/import`, { method: 'POST', body }));
  const exp = async () => (await fetch(`${s.admin}/d1/d1-probe-DB/export`)).text();

  it('a. wrangler d1 export 格式 >500KB：行数、值逐字、sequence、索引、触发器', async () => {
    const dump = wranglerDump();
    expect(dump.length).toBeGreaterThan(500_000);
    const r = await imp(dump);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(await q('SELECT count(*) AS n FROM t')).toEqual([{ n: N_ROWS }]);
    expect(await q('SELECT count(*) AS n FROM child')).toEqual([{ n: 2 }]);
    for (const i of [1, 2, 777, 2500, N_ROWS]) expect(await q(`SELECT v FROM t WHERE id=${i}`)).toEqual([{ v: val(i) }]);
    expect(await q("SELECT seq FROM sqlite_sequence WHERE name='t'")).toEqual([{ seq: SEQ }]);
    // 旧库的表（items）被清掉了
    expect((await q('SELECT count(*) AS n FROM items')).error).toMatch(/no such table/);
    expect(await q("SELECT name FROM sqlite_master WHERE type='index' AND name='t_v'")).toEqual([{ name: 't_v' }]);
    await q("INSERT INTO t (v) VALUES ('new')");
    expect(await q("SELECT id FROM t WHERE v='new'")).toEqual([{ id: SEQ + 1 }]);
    // 触发器的两条语句都执行了（导入时没触发：INSERT 在建触发器之前）
    expect(await q(`SELECT n FROM log ORDER BY n`)).toEqual([{ n: SEQ + 1 }, { n: (SEQ + 1) * 10 }]);
  }, 60_000);

  it('b. 本包 backup 格式 >500KB：导出 → 改动 → 导入，回到导出时的样子', async () => {
    const dump = await exp();
    expect(dump.length).toBeGreaterThan(500_000);
    const before = await q('SELECT id, v FROM t ORDER BY id');
    await q("DELETE FROM t WHERE id < 100");
    await q("UPDATE t SET v='changed' WHERE id=500");
    await q("INSERT INTO t (v) VALUES ('extra')");
    const r = await imp(dump);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(await q('SELECT id, v FROM t ORDER BY id')).toEqual(before);
    expect(await exp()).toBe(dump);
  }, 60_000);

  it('c. 大 dump 末尾有失败语句：ok:false，库原样不动', async () => {
    const dump = await exp();
    const bad = await imp(wranglerDump('INSERT INTO nope VALUES (1);'));
    expect(bad.ok).toBe(false);
    expect(await exp()).toBe(dump);
  }, 60_000);

  it('d. 单条语句超过 100KB：ok:false，错误提到第几条和 100KB，库不动', async () => {
    const dump = await exp();
    const big = `INSERT INTO t (v) VALUES ('${'x'.repeat(150_000)}');`;
    const bad = await imp(`${dump}${big}\n`);
    expect(bad.ok).toBe(false);
    const msg = JSON.stringify(bad);
    expect(msg).toMatch(/第 \d+ 条/);
    expect(msg).toContain('100KB');
    expect(await exp()).toBe(dump);
  }, 60_000);
  it('e. 空请求、只有注释、导完一张表都没有：400，库原样不动（不能一键清库）', async () => {
    const dump = await exp();
    for (const body of ['', '   \n', '-- 只有注释\n/* 和块注释 */;\n', 'PRAGMA defer_foreign_keys=TRUE;\nSELECT 1;\n']) {
      const r = await fetch(`${s.admin}/d1/d1-probe-DB/import`, { method: 'POST', body });
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect(((await r.json()) as { ok: boolean }).ok).toBe(false);
      expect(await exp()).toBe(dump);
    }
  }, 60_000);
});
