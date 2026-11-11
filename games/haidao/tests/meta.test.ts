import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, BUILDINGS, CAMPAIGN, checkAchievements, dailyBounty, newProfile } from '../src/core/index.ts';
import type { Profile } from '../src/core/index.ts';

describe('每日悬赏', () => {
  it('同一天同进度结果相同，换一天不同；奖励翻倍；布局合法', () => {
    const p: Profile = { ...newProfile(), stars: { c01: 3, c02: 3, c03: 2 } };
    const a = dailyBounty(20500, p);
    expect(dailyBounty(20500, p)).toEqual(a);
    const days = new Set<string>();
    for (let d = 20500; d < 20520; d++) days.add(JSON.stringify(dailyBounty(d, p).layout));
    expect(days.size).toBeGreaterThan(1);
    const tpl = CAMPAIGN.find((l) => l.id === a.levelId)!;
    expect(a.loot).toEqual({ gold: tpl.loot.gold * 2, wood: tpl.loot.wood * 2 });
    for (let d = 0; d < 40; d++) {
      const g = dailyBounty(d, { ...p, stars: { ...p.stars, c20: 1 } });
      const seen = new Set<string>();
      for (const b of g.layout) {
        const s = BUILDINGS[b.kind].size;
        const lo = b.kind === 'kraken' ? -3 : 0;
        const hi = b.kind === 'kraken' ? 25 : 22;
        expect(b.x >= lo && b.y >= lo && b.x + s <= hi && b.y + s <= hi).toBe(true);
        for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) {
          const k = `${b.x + i},${b.y + j}`;
          expect(seen.has(k)).toBe(false);
          seen.add(k);
        }
      }
    }
  });
  it('进度附近取模板：新号取前几关，通关到 c30 取末尾', () => {
    expect(Number(dailyBounty(1, newProfile()).levelId.slice(1))).toBeLessThanOrEqual(2);
    const all: Record<string, number> = {};
    for (const l of CAMPAIGN) all[l.id] = 3;
    expect(Number(dailyBounty(1, { ...newProfile(), stars: all }).levelId.slice(1))).toBeGreaterThanOrEqual(28);
  });
});

describe('成就', () => {
  it('id 唯一；新号没有成就；达成后只返回新增的', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    const p = newProfile();
    expect(checkAchievements(p, p.stats)).toEqual([]);
    const stats = { ...p.stats, wins: 1, attacks: 1 };
    expect(checkAchievements({ ...p, stats }, stats)).toEqual(['first_win']);
    expect(checkAchievements({ ...p, stats, achievements: ['first_win'] }, stats)).toEqual([]);
  });
  it('旧档缺计数字段按 0 算，不报错', () => {
    const p = newProfile();
    const old = { attacks: 5, wins: 5, lootGold: 0, lootWood: 0 };
    expect(checkAchievements({ ...p, stats: old, achievements: undefined as unknown as string[] }, old)).toEqual(['first_win']);
  });
  it('星数、首领、每日', () => {
    const p = newProfile();
    const stars: Record<string, number> = {};
    for (const l of CAMPAIGN.slice(0, 5)) stars[l.id] = 3;
    const got = checkAchievements({ ...p, stars, stats: { ...p.stats, wins: 5, dailyDone: 1 } }, { ...p.stats, wins: 5, dailyDone: 1 });
    expect(got).toEqual(expect.arrayContaining(['first_win', 'stars_10', 'boss_1', 'daily_1']));
    expect(got).not.toContain('boss_6');
  });
});
