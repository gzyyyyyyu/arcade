import { describe, expect, it } from 'vitest';
import { createWorld } from '../../src/core/index.ts';
import { normalizeSetup, type Setup } from '../../src/core/state.ts';
import { CARRY, carries, carryExcept, runKind, RUN_KIND_NAMES } from '../../src/content/meta.ts';
import { mainSchools } from '../../src/content/pools.ts';
import { dailyPlan, isDailySetup } from '../../src/online/daily.ts';
import { submissionsFor } from '../../src/online/score.ts';
import type { RunSummary } from '../../src/online/types.ts';

/** 各种局能带什么只有 content/meta.ts CARRY 一张表：核心整理开局设置、开局扣锦囊、说明文案都读它 */
const xinfa = mainSchools('xiaodao')[0]!;
const all: Partial<Setup> = { kits: ['reroll'], xinfa, startAlt: true };
const base: Setup = { seed: 7, mode: 'vigil', danger: 2, character: 'xiaodao' };
const kept = (s: Setup): string[] => {
  const n = normalizeSetup({ ...s, ...all });
  return (['kits', 'xinfa', 'startAlt'] as const).filter((k) => n[k] !== undefined);
};

describe('模式 × 可带项（CARRY）', () => {
  it('认得出各种局', () => {
    expect(runKind(base)).toBe('play');
    expect(runKind({ ...base, live: true })).toBe('live');
    expect(runKind({ ...base, rush: true })).toBe('rush');
    expect(runKind({ ...base, weekly: 'coin' })).toBe('weekly');
    expect(runKind({ ...base, trial: 'yuehei' })).toBe('trial');
    expect(runKind({ mode: 'raid', raid: { template: 'teach' } })).toBe('teach');
    expect(runKind({ mode: 'raid', raid: { template: 'guzhen' }, live: true })).toBe('live');
  });

  it('核心照表留、照表丢', () => {
    expect(kept(base)).toEqual(['kits', 'xinfa', 'startAlt']);
    expect(kept({ ...base, live: true })).toEqual(['xinfa', 'startAlt']);
    expect(kept({ seed: 1, mode: 'raid', danger: 0, character: 'xiaodao', raid: { template: 'teach' } })).toEqual(['xinfa', 'startAlt']);
    expect(kept({ ...base, rush: true })).toEqual([]);
    expect(kept({ ...base, weekly: 'coin' })).toEqual([]);
    for (const item of Object.keys(CARRY) as (keyof typeof CARRY)[]) expect(carries(item, 'daily')).toBe(false);
  });

  it('文案从表拼，顺序固定', () => {
    expect(carryExcept('kits')).toBe(Object.values(RUN_KIND_NAMES).join('、'));
    expect(carryExcept('xinfa')).toBe('每日挑战、本周夜事、首领连战、试炼');
  });

  it('每日挑战开出来的局能过交榜核对，带了不该带的不过', () => {
    for (const mode of ['vigil', 'raid'] as const) {
      const p = dailyPlan('2026-11-22', mode).setup;
      const w = createWorld({ ...p, tall: true });
      expect(isDailySetup('2026-11-22', w.setup)).toBe(true);
      expect(isDailySetup('2026-11-22', { ...w.setup, xinfa })).toBe(false);
      expect(isDailySetup('2026-11-22', { ...w.setup, startAlt: true })).toBe(false);
      expect(isDailySetup('2026-11-22', { ...w.setup, kits: ['reroll'] })).toBe(false);
      expect(isDailySetup('2026-11-22', { ...w.setup, character: 'jianxia' })).toBe(false);
      expect(isDailySetup('2026-11-22', { ...w.setup, rush: true })).toBe(false);
    }
  });

  it('每日榜只收配置对得上的局（和连战一样核）', () => {
    const p = dailyPlan('2026-11-22', 'vigil').setup;
    const r = (setup: Setup): RunSummary =>
      ({ runId: 'r', setup, won: true, quit: false, bossKilled: true, seconds: 900, kills: 500, level: 20, loot: 0, coins: 0, live: false, reducedDamage: false, daily: '2026-11-22' }) as unknown as RunSummary;
    expect(submissionsFor(r(p), '2026-11-22').map((s) => s.board)).toEqual(['daily-vigil']);
    expect(submissionsFor(r({ ...p, xinfa }), '2026-11-22')).toEqual([]);
    expect(submissionsFor(r({ ...p, seed: p.seed + 1 }), '2026-11-22')).toEqual([]);
  });
});
