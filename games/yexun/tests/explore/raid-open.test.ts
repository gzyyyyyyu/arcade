import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RAID_OPEN, RAID_TEMPLATES, raidOpen } from '../../src/content/explore.ts';
import { RAID_PICKS } from '../../src/platform/save.ts';
import { submissionsFor } from '../../src/online/score.ts';
import type { RunSummary } from '../../src/online/types.ts';

// 线上只开白名单里的镇子：配平没过的新镇子不能靠 ?raid=<id> 进去刷铜钱、上夜探榜（粮仓镇 0.17.4 配平后放出）
describe('线上只开白名单里的镇子', () => {
  it('生产构建（dev=false）下只认 RAID_OPEN，乱写的不开局', () => {
    for (const t of ['teach', 'guzhen', 'dukou', 'shansi', 'xilou', 'liangcang']) expect(raidOpen(t, false)).toBe(true);
    expect(Object.keys(RAID_TEMPLATES).filter((t) => !raidOpen(t, false))).toEqual([]);
    // 原型上的名字、空值、乱写的都不算镇子
    for (const t of ['toString', 'constructor', '__proto__', 'nope', '', null, undefined]) expect(raidOpen(t, false)).toBe(false);
  });

  it('开发服务器里所有模板都能进（截图、配平用）', () => {
    for (const t of Object.keys(RAID_TEMPLATES)) expect(raidOpen(t, true)).toBe(true);
  });

  it('菜单能选的就是 RAID_OPEN 去掉教学镇', () => {
    expect([...RAID_PICKS]).toEqual(RAID_OPEN.filter((t) => t !== 'teach'));
    expect(RAID_PICKS).toContain('liangcang');
  });

  it('链接参数和夜探开局都按 import.meta.env.DEV 过 raidOpen', () => {
    const main = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
    expect(main).toContain('else if (raidOpen(qr, import.meta.env.DEV)) menu.onRaid(qr');
    expect(main).toContain('if (!raidOpen(template, import.meta.env.DEV)) return menu.show(menuState());');
    expect(main).not.toMatch(/in RAID_TEMPLATES/);
  });

  it('能选的镇子的局都交夜探榜', () => {
    const r = (template: 'liangcang' | 'guzhen'): RunSummary =>
      ({ runId: 'r', setup: { seed: 1, mode: 'raid', danger: 2, curses: [], raid: { template } }, won: true, quit: false, bossKilled: false, seconds: 600, kills: 100, level: 10, loot: 700, coins: 0, live: false, reducedDamage: false, daily: null }) as unknown as RunSummary;
    expect(submissionsFor(r('liangcang'), '2026-11-02').map((s) => s.boardId)).toEqual(['raid']);
    expect(submissionsFor(r('guzhen'), '2026-11-02').map((s) => s.boardId)).toEqual(['raid']);
  });
});
