import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRun, dailySetup, goalTarget, shortSetup, type Segment } from '../../src/core/index.ts';
import { MONTH_THEMES, monthThemeById } from '../../src/core/content/monthThemes.ts';
import { GOAL_RULES } from '../../src/core/tempo.ts';
import { SIX } from '../helpers.ts';

/** 0.32.0 月度目标规则版本 2：「连续 N 天收盘赚钱」少要一天，只给真实行情的普通局；开局记进 tempo.goalRules。 */
const index = JSON.parse(readFileSync('public/data/segments/index.json', 'utf8')) as { segments: { file: string }[] };
const seg = JSON.parse(readFileSync(`public/data/segments/${index.segments[0]?.file}`, 'utf8')) as Segment;
const STREAK = MONTH_THEMES.filter((d) => d.goal.kind === 'streak').map((d) => d.id);

describe('月度目标规则版本', () => {
  it('连续赚钱的目标：版本 2 比版本 1 少一天，其余目标不变', () => {
    expect(STREAK.sort()).toEqual(['flood_month', 'streak_month']);
    for (const def of MONTH_THEMES) {
      for (const d of [1, 2, 4, 8]) {
        const v1 = goalTarget(def, d, 1);
        expect(goalTarget(def, d), `${def.id} 缺省按 1`).toBe(v1);
        expect(goalTarget(def, d, 2), `${def.id} 难度 ${d}`).toBe(def.goal.kind === 'streak' ? v1 - 1 : v1);
      }
    }
    expect(goalTarget(monthThemeById('streak_month'), 1, 2)).toBe(2);
  });

  it('只有真实行情的普通局记新版本；每日挑战、闪电盘、本周市场、实盘、合成行情没有这一项', () => {
    expect(createRun('gr-1', null, { segment: seg }).state.tempo?.goalRules).toBe(GOAL_RULES);
    expect(createRun('gr-2', shortSetup('newbie', 1), { segment: seg }).state.tempo?.goalRules).toBe(GOAL_RULES);
    const d = dailySetup('2026-10-27');
    const others = [
      createRun(d.seed, d.setup, { segment: seg }),
      createRun('gr-f', { account: 1e6, themes: SIX, flash: '2026-10-27' }, { segment: seg }),
      createRun('gr-w', { account: 1e6, themes: SIX, weekly: '2026-W44' }, { segment: seg }),
      createRun('gr-l', { account: 1e6, themes: SIX, live: { months: 5, billMult: 1 } }, { segment: seg }),
      createRun('gr-s', null, { tempo: true }),
    ];
    for (const r of others) expect(r.state.tempo?.goalRules).toBeUndefined();
  });
});
