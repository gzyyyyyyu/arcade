// backup.sh 的完整性检查：自己建的库和从 wrangler d1 export 导入的库，d1_migrations 的建表语句写法不同，都要认
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const script = new URL('../backup.sh', import.meta.url).pathname;

/** 假的管理入口：/d1 列一个库，export 回给定的 SQL；跑一次 backup.sh，返回退出码和输出 */
async function backup(exportSql) {
  const server = createServer((req, res) => {
    if (req.url === '/d1') return res.end('["d1-arcade-DB"]');
    if (req.url === '/d1/d1-arcade-DB/export') return res.end(exportSql);
    res.statusCode = 404;
    res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const dest = mkdtempSync(join(tmpdir(), 'backup-sh-'));
  try {
    const admin = `http://127.0.0.1:${server.address().port}`;
    const p = spawn('bash', [script, dest, admin, join(dest, 'no-data')]);
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    const status = await new Promise((r) => p.on('close', r));
    return { status, err };
  } finally {
    server.close();
    rmSync(dest, { recursive: true, force: true });
  }
}

const rest = 'INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(1,\'0001_init.sql\',\'2026-10-27 00:00:00\');\n';

test('自己建的库：CREATE TABLE d1_migrations(', async () => {
  const r = await backup(`PRAGMA defer_foreign_keys=TRUE;\nCREATE TABLE d1_migrations(\n  id INTEGER PRIMARY KEY AUTOINCREMENT);\n${rest}`);
  assert.equal(r.status, 0, r.err);
});

test('从 wrangler d1 export 导入的库：CREATE TABLE IF NOT EXISTS "d1_migrations"(', async () => {
  const r = await backup(`PRAGMA defer_foreign_keys=TRUE;\nCREATE TABLE IF NOT EXISTS "d1_migrations"(\n  id INTEGER PRIMARY KEY AUTOINCREMENT);\n${rest}`);
  assert.equal(r.status, 0, r.err);
});

test('没有 d1_migrations 表（不完整）：退出 1', async () => {
  const r = await backup('PRAGMA defer_foreign_keys=TRUE;\nCREATE TABLE users (id INTEGER);\nCREATE TABLE d1_migrations_old (id INTEGER);\n');
  assert.equal(r.status, 1);
  assert.match(r.err, /导出不完整/);
});
