// 规则 65（DESIGN 3.7、3.9）：专属搭配的料加权、铁布衫和万符齐发冷却缩短、心法流派的法器伤害 +10%。娱乐和实盘同一版起，
// 规则 64 的录像（夹具是规则 64 的代码录的：符师、胖师叔娱乐局，符师实盘大档）在新代码里逐位重放
import { describe, expect, it } from 'vitest';
import { createWorld, Pick, skillCooldown, step, type Choice, type Setup, type World } from '../../src/core/index.ts';
import { charDmgMul } from '../../src/core/skills.ts';
import { XINFA_DMG } from '../../src/content/pools.ts';
import { CHAR_FX } from '../../src/content/meta.ts';

const S = 30;
const make = (o: Partial<Setup> = {}, rules?: number): World => createWorld({ seed: 31, mode: 'vigil', danger: 0, ...o }, rules);

function toChoose(w: World): void {
  for (let t = 0; t < 3000 && w.phase !== 'choose'; t++) {
    w.invuln = 1e9;
    step(w, t % 8, -1);
  }
  expect(w.phase).toBe('choose');
}

/** 在同一次选卡上连刷 n 次，数有几手出现了 id */
function seen(w: World, id: string, n: number): number {
  let k = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      w.rerolls = 1;
      step(w, 0, Pick.Reroll);
    }
    if (w.choices.some((c: Choice) => c.id === id)) k++;
  }
  return k;
}

describe('规则 65：专属搭配的料更常出', () => {
  it('拿了一件：阴阳先生起手阵旗，两仪阵的八卦镜比规则 64 常出得多', () => {
    const count = (rules?: number): number => {
      const w = make({ character: 'yinyang' }, rules);
      toChoose(w);
      return seen(w, 'mirror', 400);
    };
    expect(count()).toBeGreaterThan(count(64) * 1.5);
  });

  it('两件都没拿：剑侠的判官笔（笔走龙蛇的料）比规则 64 常出；别人的专属料不加权', () => {
    const count = (character: Setup['character'], rules?: number): number => {
      const w = make({ character }, rules);
      toChoose(w);
      return seen(w, 'brush', 400);
    };
    expect(count('jianxia')).toBeGreaterThan(count('jianxia', 64) * 1.3);
    // 纸匠池里也有判官笔，但笔走龙蛇、阴律斩都不是他的：不加权，他自己的招魂幡加了权，判官笔只会更少
    expect(count('zhijiang')).toBeLessThanOrEqual(count('zhijiang', 64));
  });
});

describe('规则 65：技能冷却', () => {
  it('万符齐发 18 → 12 秒、铁布衫 22 → 15 秒；规则 64 的局照旧，别的角色不变', () => {
    expect(skillCooldown(make({ character: 'fushi' }))).toBe(12 * S);
    expect(skillCooldown(make({ character: 'fushi' }, 64))).toBe(18 * S);
    expect(skillCooldown(make({ character: 'pang' }))).toBe(15 * S);
    expect(skillCooldown(make({ character: 'pang' }, 64))).toBe(22 * S);
    expect(skillCooldown(make({ character: 'gengfu' }))).toBe(skillCooldown(make({ character: 'gengfu' }, 64)));
  });
});

describe('规则 65：心法流派的法器伤害', () => {
  it('心法流派单子上的法器 ×XINFA_DMG，别的法器、不带心法、规则 64 都是 1', () => {
    const fushi = make({ character: 'fushi', xinfa: 'talisman' });
    expect(charDmgMul(fushi, 'talisman')).toBe(XINFA_DMG);
    expect(charDmgMul(fushi, 'gourd')).toBe(1);
    expect(charDmgMul(fushi, undefined)).toBe(1);
    expect(charDmgMul(make({ character: 'fushi' }), 'talisman')).toBe(1);
    expect(charDmgMul(make({ character: 'fushi', xinfa: 'talisman' }, 64), 'talisman')).toBe(1);
  });
  it('和角色被动相乘：摆渡人水府心法下的寒泉 = 心法 × 顺水', () => {
    const w = make({ character: 'baidu', xinfa: 'water' });
    expect(charDmgMul(w, 'spring')).toBeCloseTo(XINFA_DMG * CHAR_FX.baiduWater67, 12);
  });
});
