// bin/arcade（arcade.sh）的 ARCADE_VARS_* 覆盖：用假的 workerd 打印收到的参数和 -I 目录里 vars/ 的内容。
// 跑法：node --test "tools/selfhost/test/*.test.mjs"
import assert from 'node:assert/strict';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const arcadeSh = join(here, '..', 'arcade.sh');
const root = mkdtempSync(join(tmpdir(), 'arcade-sh-test-'));
after(() => rmSync(root, { recursive: true, force: true }));

const FAKE = `#!/bin/sh
echo "ARGS $*"
while [ $# -gt 0 ]; do [ "$1" = -I ] && inc=$2; shift; done
echo "INC $inc"
for f in "$inc"/vars/*/*; do printf 'FILE %s=' "\${f#"$inc"/vars/}"; cat "$f"; echo; done
`;

/** 摆一个假发布目录；pg/ 里是 PG 档（自带 vars/） */
function release(name) {
  const dir = join(root, name);
  mkdirSync(join(dir, 'bin'), { recursive: true });
  cpSync(arcadeSh, join(dir, 'bin', 'arcade'));
  writeFileSync(join(dir, 'bin', 'workerd'), FAKE);
  chmodSync(join(dir, 'bin', 'workerd'), 0o755);
  chmodSync(join(dir, 'bin', 'arcade'), 0o755);
  const fill = (d, db) => {
    mkdirSync(join(d, 'vars', 'arcade'), { recursive: true });
    mkdirSync(join(d, 'vars', 'texas'), { recursive: true });
    writeFileSync(join(d, 'config.capnp'), '');
    writeFileSync(join(d, 'release.json'), `{"storage": "sqlite", "db": "${db}"}`);
    writeFileSync(join(d, 'vars', 'arcade', 'LIMITS.json'), '{"a":1}');
    writeFileSync(join(d, 'vars', 'arcade', 'REGISTRATION.txt'), 'open');
    writeFileSync(join(d, 'vars', 'texas', 'KIT_QUOTA.json'), '{"q":2}');
  };
  fill(dir, 'sqlite');
  mkdirSync(join(dir, 'pg'));
  fill(join(dir, 'pg'), 'pg');
  return dir;
}

function run(dir, env) {
  const clean = { PATH: process.env.PATH, ARCADE_DATA: join(root, 'data'), TMPDIR: join(root, 'tmp'), ...env };
  mkdirSync(clean.TMPDIR, { recursive: true });
  const r = spawnSync(join(dir, 'bin', 'arcade'), [], { env: clean, encoding: 'utf8' });
  return { ...r, out: r.stdout + r.stderr };
}
const files = (out) => Object.fromEntries([...out.matchAll(/^FILE (.+?)=(.*)$/gm)].map((m) => [m[1], m[2]]));

test('没有覆盖：-I 是发布目录，vars 原样', () => {
  const dir = release('plain');
  const r = run(dir, {});
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, new RegExp(`INC ${dir}\\n`));
  assert.deepEqual(files(r.out), { 'arcade/LIMITS.json': '{"a":1}', 'arcade/REGISTRATION.txt': 'open', 'texas/KIT_QUOTA.json': '{"q":2}' });
});

test('有覆盖：-I 指副本，被覆盖的文件改写（含 json 和 txt），别的原样，原目录不动', () => {
  const dir = release('over');
  const r = run(dir, { ARCADE_VARS_arcade_LIMITS: '{"x":[1,2]}', ARCADE_VARS_arcade_REGISTRATION: 'a b\'"$c' });
  assert.equal(r.status, 0, r.out);
  const inc = /INC (.+)\n/.exec(r.out)[1];
  assert.ok(inc.startsWith(join(root, 'tmp')) && inc !== dir, inc);
  assert.deepEqual(files(r.out), { 'arcade/LIMITS.json': '{"x":[1,2]}', 'arcade/REGISTRATION.txt': 'a b\'"$c', 'texas/KIT_QUOTA.json': '{"q":2}' });
  // 发布目录里的默认值没被改
  const again = run(dir, {});
  assert.equal(files(again.out)['arcade/LIMITS.json'], '{"a":1}');
});

test('RUNTIME_DIRECTORY 优先于 TMPDIR', () => {
  const dir = release('rtd');
  const rtd = join(root, 'run');
  mkdirSync(rtd, { recursive: true });
  const r = run(dir, { RUNTIME_DIRECTORY: rtd, ARCADE_VARS_texas_KIT_QUOTA: '{"q":9}' });
  assert.equal(r.status, 0, r.out);
  assert.ok(/INC (.+)\n/.exec(r.out)[1].startsWith(rtd));
  assert.equal(readdirSync(rtd).length, 1);
});

test('不认识的名字：拒绝启动、列出能覆盖的名字，输出里没有值', () => {
  const dir = release('bad');
  const secret = 'S3CR3T-value-xyz';
  for (const name of ['ARCADE_VARS_arcade_NOPE', 'ARCADE_VARS_nobody_LIMITS', 'ARCADE_VARS_LIMITS', 'ARCADE_VARS_arcade_GATE']) {
    const r = run(dir, { ARCADE_VARS_arcade_LIMITS: secret, [name]: secret });
    assert.notEqual(r.status, 0, name);
    assert.ok(r.out.includes(name), name);
    assert.ok(!r.out.includes(secret), '输出里不许有值');
    assert.ok(!r.out.includes('ARGS'), '不该起 workerd');
    for (const ok of ['ARCADE_VARS_arcade_LIMITS', 'ARCADE_VARS_arcade_REGISTRATION', 'ARCADE_VARS_texas_KIT_QUOTA']) assert.ok(r.out.includes(ok), ok);
  }
});

test('PG 档（先 cd pg）：默认和覆盖都按 pg/vars 找', () => {
  const dir = release('pg');
  const pg = { ARCADE_DB: 'pg', ARCADE_PG_URL: 'postgres://x' };
  const plain = run(dir, pg);
  assert.equal(plain.status, 0, plain.out);
  assert.match(plain.out, new RegExp(`INC ${join(dir, 'pg')}\\n`));
  writeFileSync(join(dir, 'pg', 'vars', 'arcade', 'LIMITS.json'), '{"pg":1}');
  const over = run(dir, { ...pg, ARCADE_VARS_texas_KIT_QUOTA: '{"q":3}' });
  assert.equal(over.status, 0, over.out);
  assert.deepEqual(files(over.out), { 'arcade/LIMITS.json': '{"pg":1}', 'arcade/REGISTRATION.txt': 'open', 'texas/KIT_QUOTA.json': '{"q":3}' });
  const bad = run(dir, { ...pg, ARCADE_VARS_arcade_NOPE: 'v' });
  assert.notEqual(bad.status, 0);
});
