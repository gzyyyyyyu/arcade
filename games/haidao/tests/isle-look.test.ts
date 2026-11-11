import { describe, expect, it } from 'vitest';
import { MAP_BOSSES, MAP_ISLANDS } from '../src/content/maps.ts';
import { STYLE_SHAPES, isleLook, mapIslandArt, shapeOfVariant } from '../src/view/art/mapart.ts';

describe('寻宝航线：岛的图标按风格挑', () => {
  it('每座岛的造型属于它风格的那一组；终点岛一定是首领岛，别的一定不是', () => {
    for (const d of [...MAP_ISLANDS, ...MAP_BOSSES]) {
      const v = isleLook(d.id, d.style);
      const s = shapeOfVariant(v);
      expect(s.boss, d.id).toBe(d.style === 'boss');
      expect((STYLE_SHAPES[d.style] as readonly number[]).includes(s.k), `${d.id} ${d.style} 造型 ${s.k}`).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(29);
      expect(mapIslandArt(v).key).toBeTruthy();
    }
  });
  it('确定性：同一座岛永远同一张；金库厚的岛不会抽到海蛇（造型 9）', () => {
    for (const d of MAP_ISLANDS) {
      expect(isleLook(d.id, d.style)).toBe(isleLook(d.id, d.style));
      if (d.style === 'vault') expect(shapeOfVariant(isleLook(d.id, d.style)).k).not.toBe(9);
    }
  });
  it('序号和造型互逆：每种造型、两种配色都落在非首领位上', () => {
    for (const style of ['vault', 'cannon', 'mine', 'mortar'] as const) {
      for (let i = 0; i < 40; i++) {
        const s = shapeOfVariant(isleLook(`x${i}`, style));
        expect(s.boss).toBe(false);
        expect((STYLE_SHAPES[style] as readonly number[]).includes(s.k)).toBe(true);
      }
    }
  });
});
