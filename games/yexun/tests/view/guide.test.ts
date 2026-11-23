import { describe, expect, it } from 'vitest';
import { SCHOOL_IDS, SCHOOLS, WEAPON_ROLE, GUIDE_EXAMPLES } from '../../src/content/guide.ts';
import { PASSIVES, WEAPONS, type WeaponId } from '../../src/content/weapons.ts';
import { CHARACTER_IDS } from '../../src/content/meta.ts';
import { mainSchools } from '../../src/content/pools.ts';
import { BUILD_IDS, BUILDS } from '../../tools/bots.ts';
import { GATE_WINDOWS, GATE_WINDOWS_EARLY } from '../../src/content/explore.ts';

// 玩法说明的流派单子和机器人用的是同一份打法：两边一改另一边就要跟（说明讲的就是模拟器验证过的路线）
describe('玩法说明的数据', () => {
  it('流派和机器人的单子一致', () => {
    expect([...SCHOOL_IDS]).toEqual([...BUILD_IDS]);
    for (const id of SCHOOL_IDS) {
      expect([...SCHOOLS[id].weapons]).toEqual(BUILDS[id].weapons);
      expect([...SCHOOLS[id].passives]).toEqual(BUILDS[id].passives);
    }
  });

  it('每件法器都标了干什么活；流派里的法器、被动都存在', () => {
    for (const id of Object.keys(WEAPONS) as WeaponId[]) expect(WEAPON_ROLE[id]).toBeDefined();
    for (const id of SCHOOL_IDS) {
      for (const w of SCHOOLS[id].weapons) expect(WEAPONS[w]).toBeDefined();
      for (const p of SCHOOLS[id].passives) expect(PASSIVES[p]).toBeDefined();
    }
    expect(GUIDE_EXAMPLES[0]).toBe('sword');
  });

  it('流派页每个流派有一句话打法，也都有角色主修（流派页写的就是角色页「主修」那份）', () => {
    for (const id of SCHOOL_IDS) {
      expect(SCHOOLS[id].brief.length).toBeGreaterThan(4);
      expect(CHARACTER_IDS.some((c) => mainSchools(c).includes(id))).toBe(true);
    }
  });
});

// 玩法说明夜探段只写早开那一套的第一座门：后面几座得和普通的一样，不一样就要改说明
describe('夜探开门时段的说明', () => {
  it('危险 0 / 教学镇只有第一座门早开', () => {
    expect(GATE_WINDOWS_EARLY.slice(1)).toEqual(GATE_WINDOWS.slice(1));
    expect(GATE_WINDOWS_EARLY[0]!.from).toBeLessThan(GATE_WINDOWS[0]!.from);
  });
});
