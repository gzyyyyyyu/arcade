import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRun, dailySetup, goalTarget, shortSetup, type Segment } from '../../src/core/index.ts';
import { MONTH_THEMES, monthThemeById } from '../../src/core/content/monthThemes.ts';
import { isRegularRun } from '../../src/core/tempo.ts';
import { SIX } from '../helpers.ts';

/** 「连续 N 天收盘赚钱」在真实行情的普通局少要一天；每日挑战、闪电盘、本周市场、实盘、合成行情照原数。 */
const index = JSON.parse(readFileSync('public/data/segments/index.json', 'utf8')) as { segments: { file: string }[] };
const seg = JSON.parse(readFileSync(`public/data/segments/${index.segments[0]?.file}`, 'utf8')) as Segment;
const STREAK = MONTH_THEMES.filter((d) => d.goal.kind === 'streak').map((d) => d.id);

describe('月度目标：普通局放宽连续赚钱', () => {
  it('连续赚钱的目标：普通局少一天，其余目标不变', () => {
    expect(STREAK.sort()).toEqual(['flood_month', 'streak_month']);
    for (const def of MONTH_THEMES) {
      for (const d of [1, 2, 4, 8]) {
        const base = goalTarget(def, d, false);
        expect(goalTarget(def, d, true), `${def.id} 难度 ${d}`).toBe(def.goal.kind === 'streak' ? base - 1 : base);
      }
    }
    expect(goalTarget(monthThemeById('streak_month'), 1, true)).toBe(2);
  });

  it('只有真实行情的普通局算普通局；每日挑战、闪电盘、本周市场、实盘、合成行情不算', () => {
    const regular = (r: ReturnType<typeof createRun>): boolean => isRegularRun(r.state.real, r.state.setup);
    expect(regular(createRun('gr-1', null, { segment: seg }))).toBe(true);
    expect(regular(createRun('gr-2', shortSetup('newbie', 1), { segment: seg }))).toBe(true);
    const d = dailySetup('2026-10-27');
    const others = [
      createRun(d.seed, d.setup, { segment: seg }),
      createRun('gr-f', { account: 1e6, themes: SIX, flash: '2026-10-27' }, { segment: seg }),
      createRun('gr-w', { account: 1e6, themes: SIX, weekly: '2026-W44' }, { segment: seg }),
      createRun('gr-l', { account: 1e6, themes: SIX, live: { months: 5, billMult: 1 } }, { segment: seg }),
      createRun('gr-s', null, { tempo: true }),
    ];
    for (const r of others) expect(regular(r)).toBe(false);
  });
});
