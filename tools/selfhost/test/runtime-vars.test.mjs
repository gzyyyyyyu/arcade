// build.mjs 用的 runtime_vars 计算（runtime-vars.mjs）。跑法：node --test "tools/selfhost/test/*.test.mjs"
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runtimeVarsOf } from '../runtime-vars.mjs';

const allow = {
  vars: { arcade: ['REGISTRATION', 'LIMITS', 'ADMIN_TOKEN'], texas: ['GATE', 'KIT_QUOTA', 'MISSING'], racing: ['KIT_QUOTA'] },
  forbiddenVars: ['ADMIN_TOKEN', 'SITE_ORIGIN'],
};

test('键 ∩ 白名单，去掉 GATE 和 forbiddenVars，白名单里没默认值的不开放', () => {
  assert.deepEqual(runtimeVarsOf('arcade', { REGISTRATION: 'open', LIMITS: {}, ADMIN_TOKEN: 'x', OTHER: 1 }, allow), ['REGISTRATION', 'LIMITS']);
  assert.deepEqual(runtimeVarsOf('texas', { GATE: 'login', KIT_QUOTA: {}, EXTRA: 1 }, allow), ['KIT_QUOTA']);
});

test('不在白名单里的 Worker 或没有 vars：空', () => {
  assert.deepEqual(runtimeVarsOf('kaipan', { A: 1 }, allow), []);
  assert.deepEqual(runtimeVarsOf('racing', {}, allow), []);
});

test('真实白名单：GATE 永远不开放', () => {
  const real = JSON.parse(readFileSync(new URL('../../deploy-allowlist.json', import.meta.url), 'utf8'));
  for (const name of Object.keys(real.vars)) {
    assert.ok(!runtimeVarsOf(name, { GATE: 'login', ...Object.fromEntries(real.vars[name].map((k) => [k, 1])) }, real).includes('GATE'), name);
  }
});
