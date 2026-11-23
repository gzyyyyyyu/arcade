import { describe, expect, it } from 'vitest';
import { LEAGUES } from '../src/content/index.ts';
import { newProfile } from '../src/core/base.ts';
import { checkAchievements } from '../src/core/meta.ts';
import { leagueOf } from '../src/core/pvp.ts';

describe('攻防段位和成就', () => {
  it('段位边界：到门槛就升，差 1 杯不升', () => {
    expect(LEAGUES.map((l) => l.min)).toEqual([0, 100, 250, 450, 700, 1000, 1400]);
    expect(leagueOf(0)).toBe(0);
    for (let i = 1; i < LEAGUES.length; i++) {
      expect(leagueOf(LEAGUES[i]!.min)).toBe(i);
      expect(leagueOf(LEAGUES[i]!.min - 1)).toBe(i - 1);
    }
    expect(leagueOf(99_999)).toBe(LEAGUES.length - 1);
  });

  it('6 个攻防成就按统计触发', () => {
    const p = newProfile();
    expect(checkAchievements(p).filter((id) => ['pvp_three', 'revenge_1', 'hold_5', 'league_2', 'league_4', 'league_6'].includes(id))).toEqual([]);
    const got = checkAchievements(p, { ...p.stats, pvpThree: 1, revengeWins: 1, holds: 5, bestTrophies: 700 });
    expect(got).toEqual(expect.arrayContaining(['pvp_three', 'revenge_1', 'hold_5', 'league_2', 'league_4']));
    expect(got).not.toContain('league_6');
    expect(checkAchievements(p, { ...p.stats, holds: 4, bestTrophies: 249 })).not.toEqual(expect.arrayContaining(['hold_5']));
  });
});
