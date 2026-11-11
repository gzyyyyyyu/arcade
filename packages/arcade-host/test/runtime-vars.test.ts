/**
 * runtime_vars：生成器把默认值写进 <out>/vars/，绑定 embed 以 / 开头的路径，由 workerd 的 -I 解析；
 * 起 workerd 时 -I 指到别的目录就能覆盖。
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generate } from '../src/gen/generate.ts';
import { fixtureSite, startSite, type Running } from './harness.ts';

const json = async (r: Response | Promise<Response>) => (await r).json() as Promise<any>;

describe('runtime_vars：生成器', () => {
  const gen = (mutate: (w: ReturnType<typeof fixtureSite>['workers'][0]) => void) => {
    const dir = mkdtempSync(join(tmpdir(), 'arcade-host-gen-'));
    try {
      const site = fixtureSite();
      mutate(site.workers[0]!);
      generate(site, { out: join(dir, 'release') });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('名字不在 vars 里、名字不合规、Worker 名不合规都报错', () => {
    expect(() => gen((w) => (w.runtime_vars = ['NOPE']))).toThrow(/不在 vars 里/);
    expect(() => gen((w) => { w.vars = { ...w.vars, lower: 1 }; w.runtime_vars = ['lower']; })).toThrow(/名不合规/);
    expect(() => gen((w) => { w.vars = { ...w.vars, A_B: 1 }; w.runtime_vars = ['A_B']; })).not.toThrow();
    expect(() => gen((w) => { w.name = 'pro-be'; w.services = []; })).toThrow(/Worker 名只许小写字母和数字/);
  });

  it('vars/ 文件内容等于默认值：字符串原样、别的 JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'arcade-host-gen-'));
    try {
      generate(fixtureSite(), { out: dir });
      expect(JSON.parse(readFileSync(join(dir, 'vars', 'probe', 'RV_JSON.json'), 'utf8'))).toEqual({ n: 1, list: ['a'] });
      expect(readFileSync(join(dir, 'vars', 'probe', 'RV_TEXT.txt'), 'utf8')).toBe('默认文本');
      // 不在 runtime_vars 里的 vars 不生成 vars/ 文件
      expect(() => readFileSync(join(dir, 'vars', 'probe', 'TEXT.txt'))).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('runtime_vars：运行时', () => {
  let s: Running;
  const tmp = mkdtempSync(join(tmpdir(), 'arcade-host-rv-'));
  beforeAll(async () => {
    s = await startSite(fixtureSite(), {}, { PROBE_SECRET: 'x' });
  });
  afterAll(async () => {
    await s?.cleanup();
    rmSync(tmp, { recursive: true, force: true });
  });
  const rv = () => json(fetch(`${s.base}/games/probe/rvars`));

  it('-I 指到发布目录：读到默认值；指到改过的副本：读到覆盖值；坏 JSON 起不来', async () => {
    expect(await rv()).toEqual({ json: { n: 1, list: ['a'] }, text: '默认文本' });

    const over = join(tmp, 'over');
    cpSync(join(s.dir, 'vars'), join(over, 'vars'), { recursive: true });
    writeFileSync(join(over, 'vars', 'probe', 'RV_JSON.json'), JSON.stringify({ n: 2, list: [] }));
    writeFileSync(join(over, 'vars', 'probe', 'RV_TEXT.txt'), '覆盖文本');
    await s.restart(over);
    expect(await rv()).toEqual({ json: { n: 2, list: [] }, text: '覆盖文本' });

    writeFileSync(join(over, 'vars', 'probe', 'RV_JSON.json'), '{bad');
    await expect(s.restart()).rejects.toThrow(/workerd 起不来/);
    expect(s.log()).toContain('SyntaxError');
  });
});
