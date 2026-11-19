import { describe, expect, it } from 'vitest';
import { BAR_FADE_MS, BAR_SHOW_MS, BAR_SIZE, BarList, BarTracker, type BarItem, barAlpha, crowdBars, stackBars } from '../src/view/bars.ts';

describe('血条显示时间', () => {
  it('到时间前满显，最后一段淡出，过了就没了', () => {
    expect(barAlpha(0, 1000)).toBe(1);
    expect(barAlpha(1000 - BAR_FADE_MS, 1000)).toBe(1);
    expect(barAlpha(1000 - BAR_FADE_MS / 2, 1000)).toBeCloseTo(0.5, 5);
    expect(barAlpha(1000, 1000)).toBe(0);
    expect(barAlpha(2000, 1000)).toBe(0);
  });
  it('满血不显示，没挨过打不显示', () => {
    const t = new BarTracker();
    t.begin();
    expect(t.alpha('u1', 100, 100, 0)).toBe(0);
    t.begin();
    expect(t.alpha('u1', 100, 100, 50)).toBe(0);
  });
  it('第一次见到就是残血（没看见它掉血）也不显示', () => {
    const t = new BarTracker();
    t.begin();
    expect(t.alpha('b1', 40, 100, 0)).toBe(0);
  });
  it('掉血后显示约 3 秒再淡出，再掉血重新计时', () => {
    const t = new BarTracker();
    t.begin();
    t.alpha('u1', 100, 100, 0);
    t.begin();
    expect(t.alpha('u1', 80, 100, 100)).toBe(1);
    t.begin();
    expect(t.alpha('u1', 80, 100, 100 + BAR_SHOW_MS - BAR_FADE_MS)).toBe(1);
    t.begin();
    expect(t.alpha('u1', 80, 100, 100 + BAR_SHOW_MS - 10)).toBeLessThan(0.1);
    t.begin();
    expect(t.alpha('u1', 80, 100, 100 + BAR_SHOW_MS + 1)).toBe(0);
    t.begin();
    expect(t.alpha('u1', 60, 100, 4000)).toBe(1);
  });
  it('治疗不触发显示，回满就收起', () => {
    const t = new BarTracker();
    t.begin();
    t.alpha('u1', 50, 100, 0);
    t.begin();
    expect(t.alpha('u1', 70, 100, 10)).toBe(0);
    t.begin();
    expect(t.alpha('u1', 100, 100, 20)).toBe(0);
  });
  it('sweep 清掉这一帧没出现的对象', () => {
    const t = new BarTracker();
    t.begin();
    t.alpha('a', 10, 10, 0);
    t.alpha('b', 10, 10, 0);
    t.begin();
    t.alpha('a', 10, 10, 1);
    t.sweep();
    expect(t.size).toBe(1);
  });
});

describe('血条错开', () => {
  it('挨得近的上下错开，互相不再重叠', () => {
    const s = stackBars([{ x: 0, y: 100, w: 30 }, { x: 5, y: 101, w: 30 }, { x: -4, y: 99, w: 30 }], 8);
    const ys = s.map((q) => q.y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!).toBeGreaterThanOrEqual(8 - 1e-9);
  });
  it('横向离得远的不动', () => {
    const s = stackBars([{ x: 0, y: 100, w: 30 }, { x: 200, y: 100, w: 30 }], 8);
    expect(s.map((q) => q.y)).toEqual([100, 100]);
  });
  it('竖向本来就够开的不动', () => {
    const s = stackBars([{ x: 0, y: 100, w: 30 }, { x: 0, y: 70, w: 30 }], 8);
    expect(s.map((q) => q.y)).toEqual([100, 70]);
  });
});

describe('扎堆少画', () => {
  const bar = (x: number, f: number, big = false): BarItem => ({ x, y: 10, w: 20, f, col: 0, a: 1, big, mark: 0 });
  it('同一格的小条最多留 max 条，血最少的先留；大条全留', () => {
    const items = [bar(1, 0.9), bar(2, 0.2), bar(3, 0.5), bar(4, 0.7), bar(5, 0.8, true), bar(6, 0.6, true)];
    crowdBars(items, 48, 2);
    expect(items.filter((i) => !i.big).map((i) => i.f)).toEqual([0.2, 0.5]);
    expect(items.filter((i) => i.big)).toHaveLength(2);
  });
  it('分散在不同格的不删', () => {
    const items = [bar(0, 0.9), bar(60, 0.2), bar(120, 0.5), bar(180, 0.7)];
    crowdBars(items, 48, 2);
    expect(items).toHaveLength(4);
  });
});

describe('尺寸', () => {
  it('兵的条比建筑的更小更细', () => {
    expect(BAR_SIZE.unit[0]).toBeLessThan(BAR_SIZE.building[0]);
    expect(BAR_SIZE.unit[1]).toBeLessThan(BAR_SIZE.building[1]);
  });
});

describe('BarList 和数字键', () => {
  it('BarList 每帧复用对象，begin 后清空', () => {
    const l = new BarList();
    l.begin();
    l.push(1, 2, 20, 0.5, 0xff0000, 1, false);
    l.push(3, 4, 20, 0.4, 0x00ff00, 1, true);
    const first = l.items[0];
    expect(l.items.length).toBe(2);
    l.begin();
    expect(l.items.length).toBe(0);
    l.push(9, 8, 10, 1, 1, 1, false);
    expect(l.items[0]).toBe(first);
    expect(first?.x).toBe(9);
  });
  it('数字键的 BarTracker 和字符串键行为一致', () => {
    const t = new BarTracker();
    t.begin();
    expect(t.alpha(5, 10, 10, 0)).toBe(0);
    expect(t.alpha(5, 8, 10, 100)).toBe(1);
    expect(t.alpha(-3, 10, 10, 100)).toBe(0);
    t.sweep();
    expect(t.size).toBe(2);
  });
  it('stackBars 少于两条原样返回，多次调用结果不受临时数组影响', () => {
    const a = [{ x: 0, y: 10, w: 20 }];
    expect(stackBars(a, 6)).toBe(a);
    const b = [{ x: 0, y: 10, w: 20 }, { x: 5, y: 10, w: 20 }];
    stackBars(b, 6);
    expect(Math.abs(b[0]!.y - b[1]!.y)).toBeGreaterThanOrEqual(6);
    const c = [{ x: 0, y: 10, w: 20 }, { x: 5, y: 10, w: 20 }];
    stackBars(c, 6);
    expect(c.map((q) => q.y)).toEqual(b.map((q) => q.y));
  });
});
