// 角色特点（DESIGN 3.7、3.9）：铁布衫和万符齐发的冷却、心法流派的法器伤害 +10%
import { describe, expect, it } from 'vitest';
import { createWorld, skillCooldown, type Setup, type World } from '../../src/core/index.ts';
import { charDmgMul } from '../../src/core/skills.ts';
import { XINFA_DMG } from '../../src/content/pools.ts';
import { CHAR_FX } from '../../src/content/meta.ts';

const S = 30;
const make = (o: Partial<Setup> = {}): World => createWorld({ seed: 31, mode: 'vigil', danger: 0, ...o });

describe('技能冷却', () => {
  it('万符齐发 12 秒、铁布衫 15 秒', () => {
    expect(skillCooldown(make({ character: 'fushi' }))).toBe(12 * S);
    expect(skillCooldown(make({ character: 'pang' }))).toBe(15 * S);
  });
});

describe('心法流派的法器伤害', () => {
  it('心法流派单子上的法器 ×XINFA_DMG，别的法器、不带心法都是 1', () => {
    const fushi = make({ character: 'fushi', xinfa: 'talisman' });
    expect(charDmgMul(fushi, 'talisman')).toBe(XINFA_DMG);
    expect(charDmgMul(fushi, 'gourd')).toBe(1);
    expect(charDmgMul(fushi, undefined)).toBe(1);
    expect(charDmgMul(make({ character: 'fushi' }), 'talisman')).toBe(1);
  });
  it('和角色被动相乘：摆渡人水府心法下的寒泉 = 心法 × 顺水', () => {
    const w = make({ character: 'baidu', xinfa: 'water' });
    expect(charDmgMul(w, 'spring')).toBeCloseTo(XINFA_DMG * CHAR_FX.baiduWater, 12);
  });
});
