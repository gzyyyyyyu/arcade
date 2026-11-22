import { describe, expect, it } from 'vitest';
import { NOVICE } from '../../src/content/player.ts';
import { TRIAL_IDS } from '../../src/content/trials.ts';
import { createWorld, normalizeSetup, step, type Setup } from '../../src/core/index.ts';
import { noviceAssist } from '../../src/core/state.ts';
import { dailyPlan, isDailySetup } from '../../src/online/daily.ts';
import { rushDaily } from '../../src/online/rush.ts';
import { weeklyPlan } from '../../src/online/weekly.ts';
import { liveSetup } from '../../src/platform/live.ts';

/** 新号前几局的照顾（content/player.ts NOVICE）：只给娱乐守夜，实盘、试炼、每日、连战、本周夜事、夜探都进不来 */
describe('新手照顾只给娱乐守夜', () => {
  const vigil: Setup = { seed: 1, mode: 'vigil', danger: 0, novice: true };

  it('娱乐守夜带 novice：生效，整理后留着', () => {
    expect(noviceAssist(vigil)).toBe(true);
    expect(normalizeSetup(vigil).novice).toBe(true);
  });

  it('实盘局（四档、守夜和夜探）：不生效，整理时删掉', () => {
    for (const tier of ['small', 'medium', 'large', 'luxe'] as const) {
      for (const raid of [undefined, 'guzhen'] as const) {
        const s = { ...liveSetup(tier, 7, raid), novice: true };
        expect(noviceAssist(s)).toBe(false);
        expect(normalizeSetup(s).novice).toBeUndefined();
      }
    }
  });

  it('试炼：不生效，展开后不带', () => {
    for (const trial of TRIAL_IDS) {
      const s = normalizeSetup({ ...vigil, trial });
      expect(noviceAssist(s)).toBe(false);
      expect(s.novice).toBeUndefined();
    }
  });

  it('每日挑战：固定配置不带 novice；硬塞进去的认不成每日挑战', () => {
    for (const mode of ['vigil', 'raid'] as const) {
      const p = dailyPlan('2026-11-22', mode).setup;
      expect(createWorld(p).setup.novice).toBeUndefined();
      expect(isDailySetup('2026-11-22', p)).toBe(true);
      expect(isDailySetup('2026-11-22', { ...p, novice: true })).toBe(false);
    }
  });

  it('首领连战、本周夜事、夜探：不生效', () => {
    const rush = { ...rushDaily('2026-11-22').setup, novice: true };
    const weekly = { ...weeklyPlan('2026-11-22').setup, novice: true };
    const raid: Setup = { seed: 1, mode: 'raid', danger: 0, raid: { template: 'guzhen' }, novice: true };
    for (const s of [rush, weekly, raid]) {
      expect(noviceAssist(s)).toBe(false);
      expect(normalizeSetup(s).novice).toBeUndefined();
    }
  });
});

describe('新手照顾的效果', () => {
  // 一直在走：每 6 秒换一个方向绕方框（右、下、左、上），选卡拿第一张，不放技能。走 3 秒一边时怪自己追得上，两边差不多；一边走得越久，普通局越吃不到魂火
  function walk(novice: boolean, seed: number): { first: number; level: number } {
    const w = createWorld({ seed, mode: 'vigil', danger: 0, ...(novice ? { novice: true } : {}) });
    let first = -1;
    for (let t = 0; t < NOVICE.until && w.phase !== 'over'; t++) {
      step(w, [1, 9, 17, 25][Math.floor(t / 180) % 4]!, w.phase === 'choose' ? 0 : -1);
      if (first < 0 && w.level > 1) first = w.tick / 30;
    }
    return { first, level: w.level };
  }

  it('同一个种子、同样一直在走：开局 2 分钟升得更快', () => {
    const seeds = [1, 2, 3, 4, 5];
    const plain = seeds.map((s) => walk(false, s));
    const nov = seeds.map((s) => walk(true, s));
    const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
    expect(mean(nov.map((r) => r.first))).toBeLessThan(mean(plain.map((r) => r.first)));
    expect(mean(nov.map((r) => r.level))).toBeGreaterThan(mean(plain.map((r) => r.level)));
  }, 30_000);
});
