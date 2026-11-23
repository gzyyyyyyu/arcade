import { describe, expect, it } from 'vitest';
import { layout } from '../../src/view/art/atlas.ts';
import { HERO_SPRITES } from '../../src/view/art/heroes.ts';
import { CHARS2_SPRITES } from '../../src/view/art/sprites-chars2.ts';
import { SPRITES_YELOU } from '../../src/view/art/sprites-yelou.ts';
import { SKILL_ICON_SPRITES } from '../../src/view/art/sprites-skillicons.ts';

describe('连战美术', () => {
  it('角色小图集（含夜漏君）在渲染倍数 1–3 下不超过 2048', () => {
    const defs = [...HERO_SPRITES, ...CHARS2_SPRITES, ...SKILL_ICON_SPRITES, ...SPRITES_YELOU];
    for (const res of [1, 2, 3]) expect(layout(defs, res).height).toBeLessThanOrEqual(2048);
  });

  it('夜漏君精灵键名不重复、不撞角色图集已有的键', () => {
    const keys = SPRITES_YELOU.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    const others = new Set([...HERO_SPRITES, ...CHARS2_SPRITES, ...SKILL_ICON_SPRITES].map((d) => d.key));
    for (const k of keys) expect(others.has(k), k).toBe(false);
  });
});
