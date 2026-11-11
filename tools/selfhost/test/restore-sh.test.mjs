// restore.sh：文件读不到或是空的就不发请求（curl 读不到文件只警告、照样发空 body，以前会把库清空）
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const script = new URL('../restore.sh', import.meta.url).pathname;
// 管理入口指一个不会有人听的端口：真发了请求，curl 会报连不上而不是这里的提示
const run = (file) => spawnSync('bash', [script, 'd1-arcade-DB', file, 'http://127.0.0.1:9'], { encoding: 'utf8' });

test('空文件、不存在的文件：拒绝，不发请求', () => {
  const dir = mkdtempSync(join(tmpdir(), 'restore-sh-'));
  try {
    const empty = join(dir, 'empty.sql');
    writeFileSync(empty, '');
    const a = run(empty);
    assert.equal(a.status, 1);
    assert.match(a.stderr, /是空的，没动库/);
    const b = run(join(dir, 'nope.sql'));
    assert.equal(b.status, 1);
    assert.match(b.stderr, /读不到/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
