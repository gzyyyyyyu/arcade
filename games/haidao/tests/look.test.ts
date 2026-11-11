import { describe, expect, it } from 'vitest';
import { GRADE, VIVID, gradeHex, gradeSvg, h32, materialOf, outlineOf, rng } from '../src/view/art/grade.ts';
import { wear } from '../src/view/art/wear.ts';
import { CHIMNEY_AT, HQ_FLAG_AT, buildingArt, coastArt, hqFlagFrames, hqNoFlagArt, palmSwayFrames } from '../src/view/art/index.ts';
import { shoreline, vnoise } from '../src/view/terrain.ts';
import { BEACH } from '../src/core/types.ts';

const sat = (c: string): number => {
  const n = parseInt(c.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mx = Math.max(r, g, b);
  return mx === 0 ? 0 : (mx - Math.min(r, g, b)) / mx;
};

describe('配色分级', () => {
  it('普通色降饱和，同样的输入同样的输出', () => {
    for (const c of ['#6ec24b', '#b97a3d', '#2fb8c8', '#aab1b8']) {
      expect(sat(gradeHex(c))).toBeLessThan(sat(c) + 1e-9);
      expect(gradeHex(c)).toBe(gradeHex(c.toUpperCase()));
    }
    expect(GRADE.sat).toBeLessThan(1);
  });
  it('关键色（宝藏金、旗帜红、火焰）保持原样', () => {
    for (const c of ['#f8c630', '#d93b32', '#ff6a1f', '#ffe885']) {
      expect(VIVID.has(c)).toBe(true);
      expect(gradeHex(c)).toBe(c);
    }
  });
  it('亮面偏暖、暗面偏冷', () => {
    const lit = gradeHex('#e8e0d0');
    const dim = gradeHex('#30343c');
    const rb = (c: string): number => ((parseInt(c.slice(1), 16) >> 16) & 255) - (parseInt(c.slice(1), 16) & 255);
    expect(rb(lit)).toBeGreaterThan(rb('#e8e0d0') - 1);
    expect(rb(dim)).toBeLessThan(rb('#30343c') + 1);
  });
  it('整张 SVG 里的色都被分级，格式不变', () => {
    const out = gradeSvg('<rect fill="#6ec24b"/><rect fill="#f8c630"/>');
    expect(out).toMatch(/fill="#[0-9a-f]{6}"/);
    expect(out).toContain('#f8c630');
    expect(out).not.toContain('#6ec24b');
  });
});

describe('描边分级', () => {
  it('描边是本体色深一档，不是统一的黑；渐变等非十六进制色用兜底', () => {
    const o = outlineOf('#aab1b8', '#000000');
    expect(o).not.toBe('#2b1a15');
    const lum = (c: string): number => parseInt(c.slice(1), 16);
    expect(lum(o)).toBeLessThan(lum('#aab1b8'));
    expect(outlineOf('#f8c630', '#2b1a15')).not.toBe(outlineOf('#2f6fd0', '#2b1a15'));
    expect(outlineOf('url(#g1)', '#123456')).toBe('#123456');
  });
});

describe('确定性变体', () => {
  it('散列和随机数发生器同样的种子同样的结果，不同的种子不同', () => {
    expect(h32(1, 2, 3)).toBe(h32(1, 2, 3));
    expect(h32(1, 2, 3)).not.toBe(h32(1, 2, 4));
    const a = rng(7), b = rng(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('材质按颜色分类：木、石、铁', () => {
    expect(materialOf('#b97a3d')).toBe('wood');
    expect(materialOf('#aab1b8')).toBe('stone');
    expect(materialOf('#46525f')).toBe('iron');
    expect(materialOf('url(#x)')).toBe('other');
  });
  it('材质层：同一个面永远同样的纹路，小面不画', () => {
    const q: Array<[number, number]> = [[0, 40], [60, 40], [60, 0], [0, 0]];
    expect(wear(q, '#b97a3d', 'L').replace(/wc\d+|wg\d+/g, '')).toBe(wear(q, '#b97a3d', 'L').replace(/wc\d+|wg\d+/g, ''));
    expect(wear(q, '#b97a3d', 'L')).toContain('clip-path');
    expect(wear([[0, 5], [8, 5], [8, 0], [0, 0]], '#b97a3d', 'L')).toBe('');
  });
  it('建筑素材每次生成一样（缓存之外也一样）', () => {
    const strip = (s: string): string => s.replace(/(wc|wg|sh|cy|tg|sg|sp|pg|sw)\d+/g, '$1');
    expect(strip(buildingArt('hq', 3).svg)).toBe(strip(buildingArt('hq', 3).svg));
    expect(buildingArt('hq', 1).svg).not.toBe(buildingArt('hq', 3).svg);
  });
});

const stripIds = (s: string): string => s.replace(/(wc|wg|sh|cy|tg|sg|sp|pg|sw)\d+/g, '$1');

describe('场景动画用的素材', () => {
  it('棕榈摇 5 帧：key 唯一、尺寸锚点同静态棕榈、两次生成一样', () => {
    const a = palmSwayFrames();
    const st = buildingArt('palm', 1);
    expect(a).toHaveLength(5);
    expect(new Set(a.map((p) => p.key)).size).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(a[i]!.key).toBe(`b.palm.sw${i + 1}`);
      expect([a[i]!.w, a[i]!.h, a[i]!.ax, a[i]!.ay]).toEqual([st.w, st.h, st.ax, st.ay]);
      expect(a[i]!.svg).toContain('skewX');
      expect(a[i]!.svg).not.toContain('rotate');
    }
    expect(new Set(a.map((p) => stripIds(p.svg))).size).toBe(5);
    expect(a.map((p) => stripIds(p.svg))).toEqual(palmSwayFrames().map((p) => stripIds(p.svg)));
  });
  it('主寨无旗版和旗布帧：同尺寸锚点、key 规范、旗布 3 帧各不同、两次一样', () => {
    for (const lv of [1, 4, 8]) {
      const nf = hqNoFlagArt(lv);
      const full = buildingArt('hq', lv);
      expect(nf.key).toBe(`b.hqnf.${lv}`);
      expect([nf.w, nf.h, nf.ax, nf.ay]).toEqual([full.w, full.h, full.ax, full.ay]);
      expect(nf.svg.length).toBeLessThan(full.svg.length);
      const fl = hqFlagFrames(lv);
      expect(fl).toHaveLength(3);
      expect(fl.map((p) => p.key)).toEqual([0, 1, 2].map((i) => `b.hqfl.${lv}.${i}`));
      expect(new Set(fl.map((p) => stripIds(p.svg))).size).toBe(3);
      expect(fl.map((p) => stripIds(p.svg))).toEqual(hqFlagFrames(lv).map((p) => stripIds(p.svg)));
      expect(fl.every((p) => p.w < full.w / 2 && p.h < full.h / 2)).toBe(true);
      const at = HQ_FLAG_AT(lv);
      expect(at).toEqual(HQ_FLAG_AT(lv));
      expect(at.dy).toBeLessThan(0);
      // 旗位在精灵范围内
      expect(full.ax + at.dx).toBeGreaterThan(0);
      expect(full.ay + at.dy).toBeGreaterThan(0);
    }
    // 旗位随主寨升级抬高
    expect(HQ_FLAG_AT(8).dy).toBeLessThan(HQ_FLAG_AT(1).dy);
    expect(stripIds(hqNoFlagArt(3).svg)).toBe(stripIds(hqNoFlagArt(3).svg));
  });
  it('烟囱口：主寨、锯木厂、伐木场、军械所有，其余没有；位置在精灵范围内且确定', () => {
    for (const k of ['hq', 'sawmill', 'woodyard', 'armory'] as const) {
      for (const lv of [1, 5, 8]) {
        const c = CHIMNEY_AT(k, lv);
        const p = buildingArt(k, lv);
        expect(c).not.toBeNull();
        expect(c).toEqual(CHIMNEY_AT(k, lv));
        expect(p.ax + c!.dx).toBeGreaterThan(0);
        expect(p.ax + c!.dx).toBeLessThan(p.w);
        expect(p.ay + c!.dy).toBeGreaterThan(0);
        expect(c!.dy).toBeLessThan(0);
      }
    }
    for (const k of ['cannon', 'dock', 'palm', 'vault', 'wall'] as const) expect(CHIMNEY_AT(k, 3)).toBeNull();
  });
});

describe('海岸线和海面素材', () => {
  it('海岸线噪声是确定的，范围在 0..1', () => {
    expect(vnoise(3.3, 4.4, 9)).toBe(vnoise(3.3, 4.4, 9));
    for (let i = 0; i < 50; i++) {
      const v = vnoise(i * 0.37, i * 0.91, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
  it('同样参数的海岸线完全一致，只向外凸的草边不会缩进岛里', () => {
    expect(shoreline(BEACH, 9, 7)).toEqual(shoreline(BEACH, 9, 7));
    const edge = shoreline(0, 13, 3, true);
    const flat = shoreline(0, 0, 3, true);
    expect(edge.length).toBe(flat.length);
    // 屏幕 y 向下：上边的点向外凸只会更小（更靠上），下边只会更大
    const top = edge.findIndex((p, i) => p.y < flat[i]!.y - 1e-6);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(edge.every((p, i) => Math.hypot(p.x - flat[i]!.x, p.y - flat[i]!.y) < 13 * 1.2)).toBe(true);
  });
  it('浪舌、波光、鱼群素材存在', () => {
    for (const k of ['swash', 'glint', 'fish'] as const) {
      const p = coastArt(k);
      expect(p.svg).toContain('<svg');
      expect(p.key).toBe(`c.${k}`);
    }
  });
});
