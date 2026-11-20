// 规则 67（DESIGN 3.7）：摆渡人放出时补强——初始伤害补到 1，顺水 +10% → +50%、竹篙冷却 −25% 多戳一下，横江一渡的水域里每秒打一下。娱乐和实盘同一版起；
// 规则 66 的摆渡人录像（夹具是规则 66 的代码录的：娱乐局、实盘大档）在新代码里逐位重放
import { describe, expect, it } from 'vitest';
import { createWorld, step, type Setup, type World } from '../../src/core/index.ts';
import { spawnNow } from '../../src/core/debug.ts';
import { CHAR_FX, charBase } from '../../src/content/meta.ts';
import { charDmgMul, SKILL_FX, SKILLS } from '../../src/core/skills.ts';
import { vigilBp } from '../../src/content/live.ts';
import { raidCharCoef } from '../../src/content/explore.ts';

const make = (o: Partial<Setup> = {}, rules?: number): World => createWorld({ seed: 7, mode: 'vigil', danger: 0, character: 'baidu', ...o }, rules);

describe('规则 67：摆渡人补强', () => {
  it('初始伤害规则 67 起是 1，之前 0.9（出手 −5% 留着当短板）；别的角色不变', () => {
    expect(charBase('baidu', true)).toMatchObject({ might: 1, cd: 1.05, hp: 1.05, speed: 1.1, area: 1.05 });
    expect(charBase('baidu', false)).toMatchObject({ might: 0.9, cd: 1.05 });
    expect(charBase('fushi', false)).toEqual(charBase('fushi', true));
    const now = make();
    const old = make({}, 66);
    step(now, 0, -1);
    step(old, 0, -1);
    expect(now.stats.might / old.stats.might).toBeCloseTo(1 / 0.9, 12);
  });

  it('顺水：水类法器伤害规则 67 起 ×1.5，之前 ×1.1', () => {
    expect(charDmgMul(make(), 'tide')).toBe(CHAR_FX.baiduWater67);
    expect(charDmgMul(make({}, 66), 'tide')).toBe(CHAR_FX.baiduWater);
    expect(charDmgMul(make(), 'sword')).toBe(1);
  });

  it('竹篙：规则 67 起冷却 ×0.75、多戳一下，之前照旧', () => {
    const pole = (w: World) => {
      step(w, 0, -1);
      const k = w.weapons.findIndex((o) => o.id === 'pole');
      return w.wstats[k]!;
    };
    const now = pole(make());
    const old = pole(make({}, 66));
    expect(now.cd).toBeCloseTo(old.cd * CHAR_FX.baiduPoleCd, 9);
    expect(now.amount).toBe(old.amount + 1);
  });

  it('横江一渡：水域里的怪每秒挨一下 dmg + perLevel × 等级；规则 66 只减速不打', () => {
    const hurt = (rules?: number): number => {
      const w = make({}, rules);
      step(w, 0, -1);
      const i = spawnNow(w, 'jiangshi', w.x + 60, w.y);
      w.eHp[i] = 1e6;
      w.weapons.length = 0;
      w.invuln = 1e9;
      step(w, 0, -1, 1);
      expect(w.skill.active).toBeGreaterThan(0);
      const before = w.eHp[i]!;
      for (let t = 0; t < SKILLS.baidu.dur; t++) step(w, 0, -1);
      return before - w.eHp[i]!;
    };
    expect(hurt(66)).toBe(0);
    // 5 秒 5 下，暴击、克制会让单下浮动，下限按不暴击算
    expect(hurt()).toBeGreaterThanOrEqual(5 * (SKILL_FX.ferry.dmg + SKILL_FX.ferry.perLevel));
  });
});

describe('摆渡人进实盘（0.30.0）', () => {
  it('有自己的系数：雪原小档抬到和小道士一样，夜探山寺大档抬到 2 倍；没列的走默认', () => {
    expect(vigilBp('small', 0, true, false, 'baidu', 'snow')).toBe(vigilBp('small', 0, true, false, 'xiaodao', 'snow'));
    expect(raidCharCoef('baidu', 'large', 'shansi')).toBe(20_000);
    expect(raidCharCoef('baidu', 'luxe', 'guzhen')).toBeUndefined();
  });
});
