import { describe, expect, it } from 'vitest';
import { FIRE_FLASH_MS, FlashPool, flashLook, forEachDash, hatchSegments, isoRing, ringOfUnits, shotTracks, forEachEllipseDash, RANGE_RING } from '../src/view/tdfx.ts';

describe('射程圈尺寸', () => {
  it('1 格 = 100 单位，等距椭圆宽高 2:1', () => {
    const r = ringOfUnits(300);
    expect(r.w).toBeCloseTo(isoRing(3).w);
    expect(r.w / r.h).toBeCloseTo(2);
    expect(ringOfUnits(0).w).toBe(0);
  });
  it('斜线端点都落在单位圆上，且满足 u+v=c', () => {
    for (const [u0, v0, u1, v1] of hatchSegments(7) as [number, number, number, number][]) {
      expect(Math.hypot(u0, v0)).toBeCloseTo(1, 5);
      expect(Math.hypot(u1, v1)).toBeCloseTo(1, 5);
      expect(u0 + v0).toBeCloseTo(u1 + v1, 5);
    }
  });
});

describe('虚线', () => {
  it('每段不超过 dash，且都落在线段上', () => {
    const segs: number[][] = [];
    forEachDash(0, 0, 100, 0, 6, 4, 0, (a, b, c, d) => segs.push([a, b, c, d]));
    expect(segs.length).toBe(10);
    for (const s of segs) {
      expect(s[2]! - s[0]!).toBeLessThanOrEqual(6 + 1e-9);
      expect(s[0]).toBeGreaterThanOrEqual(0);
      expect(s[2]).toBeLessThanOrEqual(100);
    }
  });
  it('长度为 0 不画', () => {
    let n = 0;
    forEachDash(5, 5, 5, 5, 6, 4, 0, () => n++);
    expect(n).toBe(0);
  });
});

describe('弹道跟随', () => {
  it('只有单体直射才跟', () => {
    expect(shotTracks(0, false)).toBe(true);
    expect(shotTracks(150, false)).toBe(false);
    expect(shotTracks(0, true)).toBe(false);
  });
});

describe('开火准星', () => {
  it('150 毫秒内显示、之后消失', () => {
    expect(flashLook(0, false)).not.toBeNull();
    expect(flashLook(FIRE_FLASH_MS, false)).toBeNull();
  });
  it('减少动效：整段不缩放不渐隐', () => {
    expect(flashLook(0, true)).toEqual(flashLook(FIRE_FLASH_MS - 1, true));
  });
  it('池子过期即不再遍历，满了覆盖最老的', () => {
    const p = new FlashPool(2);
    p.add(1, 0);
    p.add(2, 10);
    p.add(3, 20);
    const ids: number[] = [];
    p.each(30, (id) => ids.push(id));
    expect(ids.sort()).toEqual([2, 3]);
    ids.length = 0;
    p.each(200, (id) => ids.push(id));
    expect(ids).toEqual([]);
  });
});

describe('射程圈样式', () => {
  it('半透明填充 0.15–0.2，线宽约 3，虚线段清楚', () => {
    expect(RANGE_RING.fillAlpha).toBeGreaterThanOrEqual(0.15);
    expect(RANGE_RING.fillAlpha).toBeLessThanOrEqual(0.2);
    expect(RANGE_RING.lineW).toBe(3);
    expect(RANGE_RING.dash).toBeGreaterThanOrEqual(8);
    expect(RANGE_RING.gap).toBeGreaterThan(0);
  });
  it('死角压暗：填充更深更不透明，也是虚线边', () => {
    expect(RANGE_RING.deadFillAlpha).toBeGreaterThan(RANGE_RING.fillAlpha);
    expect(RANGE_RING.deadFillColor).toBeLessThan(RANGE_RING.fillColor);
    expect(RANGE_RING.deadGap).toBeGreaterThan(0);
  });
  it('椭圆虚线：段数合理、段都落在椭圆上、不动画时 phase 固定得到同样结果', () => {
    const run = (ph: number): number[][] => {
      const o: number[][] = [];
      forEachEllipseDash(0, 0, 200, 100, 12, 8, ph, (ax, ay, bx, by) => o.push([ax, ay, bx, by]));
      return o;
    };
    const a = run(0);
    expect(a.length).toBeGreaterThan(20);
    for (const [x, y] of a as [number, number, number, number][]) expect((x / 100) ** 2 + (y / 50) ** 2).toBeCloseTo(1, 1);
    expect(run(0)).toEqual(a);
    expect(run(5)).not.toEqual(a);
    expect(run(0).length).toBe(a.length);
    const n: number[][] = [];
    forEachEllipseDash(0, 0, 0, 0, 12, 8, 0, (...v) => n.push(v));
    expect(n.length).toBe(0);
  });
});
