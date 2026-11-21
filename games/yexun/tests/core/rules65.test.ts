// 角色特点（DESIGN 3.7、3.9）：铁布衫和万符齐发的冷却
import { describe, expect, it } from 'vitest';
import { createWorld, skillCooldown, type Setup, type World } from '../../src/core/index.ts';

const S = 30;
const make = (o: Partial<Setup> = {}): World => createWorld({ seed: 31, mode: 'vigil', danger: 0, ...o });

describe('技能冷却', () => {
  it('万符齐发 12 秒、铁布衫 15 秒', () => {
    expect(skillCooldown(make({ character: 'fushi' }))).toBe(12 * S);
    expect(skillCooldown(make({ character: 'pang' }))).toBe(15 * S);
  });
});
