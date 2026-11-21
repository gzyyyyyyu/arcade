// 摆渡人（DESIGN 3.7）：初始伤害 1，顺水 +50%、竹篙冷却 −25% 多戳一下，横江一渡的水域里每秒打一下
import { describe, expect, it } from 'vitest';
import { createWorld, step, type Setup, type World } from '../../src/core/index.ts';
import { grantWeapon, spawnNow } from '../../src/core/debug.ts';
import { CHARACTERS, CHAR_FX } from '../../src/content/meta.ts';
import { charDmgMul, SKILL_FX, SKILLS } from '../../src/core/skills.ts';
import { vigilBp } from '../../src/content/live.ts';
import { raidCharCoef } from '../../src/content/explore.ts';

const make = (o: Partial<Setup> = {}): World => createWorld({ seed: 7, mode: 'vigil', danger: 0, character: 'baidu', ...o });

describe('摆渡人', () => {
  it('初始数值：伤害 1，出手 −5% 留着当短板', () => {
    expect(CHARACTERS.baidu.base).toMatchObject({ might: 1, cd: 1.05, hp: 1.05, speed: 1.1, area: 1.05 });
  });

  it('顺水：水类法器伤害 ×baiduWater', () => {
    expect(charDmgMul(make(), 'tide')).toBe(CHAR_FX.baiduWater);
    expect(charDmgMul(make(), 'sword')).toBe(1);
  });

  it('竹篙：冷却 ×baiduPoleCd、多戳一下（和别的角色拿竹篙比）', () => {
    const pole = (w: World) => {
      w.weapons.length = 0;
      w.wstats.length = 0;
      grantWeapon(w, 'pole', 1);
      step(w, 0, -1);
      const k = w.weapons.findIndex((o) => o.id === 'pole');
      return w.wstats[k]!;
    };
    const now = pole(make());
    const other = pole(make({ character: 'xiaodao' }));
    expect(now.amount).toBe(other.amount + 1);
    expect(now.cd).toBeLessThan(other.cd);
  });

  it('横江一渡：水域里的怪每秒挨一下 dmg + perLevel × 等级', () => {
    const w = make();
    step(w, 0, -1);
    const i = spawnNow(w, 'jiangshi', w.x + 60, w.y);
    w.eHp[i] = 1e6;
    w.weapons.length = 0;
    w.invuln = 1e9;
    step(w, 0, -1, 1);
    expect(w.skill.active).toBeGreaterThan(0);
    const before = w.eHp[i]!;
    for (let t = 0; t < SKILLS.baidu.dur; t++) step(w, 0, -1);
    // 5 秒 5 下，暴击、克制会让单下浮动，下限按不暴击算
    expect(before - w.eHp[i]!).toBeGreaterThanOrEqual(5 * (SKILL_FX.ferry.dmg + SKILL_FX.ferry.perLevel));
  });
});

describe('摆渡人进实盘（0.30.0）', () => {
  it('有自己的系数：雪原小档抬到和小道士一样，夜探山寺大档抬到 2 倍；没列的走默认', () => {
    expect(vigilBp('small', 0, true, false, 'baidu', 'snow')).toBe(vigilBp('small', 0, true, false, 'xiaodao', 'snow'));
    expect(raidCharCoef('baidu', 'large', 'shansi')).toBe(20_000);
    expect(raidCharCoef('baidu', 'luxe', 'guzhen')).toBeUndefined();
  });
});
