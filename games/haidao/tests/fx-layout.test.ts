import { describe, expect, it } from 'vitest';
import { DMG_GAP, MERGE_MS, MERGE_PX, clampCenter, pickMerge, pickSlot, pushApart, topBlame } from '../src/view/fxlayout.ts';

describe('pickSlot：伤害数字错开', () => {
  it('没有别的数字时原位', () => {
    expect(pickSlot([], 100, 100)).toEqual({ dx: 0, dy: 0 });
  });
  it('原位被占就挪到不冲突的位置', () => {
    const s = pickSlot([{ x: 100, y: 100 }], 100, 100);
    expect(Math.abs(s.dx) + Math.abs(s.dy)).toBeGreaterThan(0);
    expect(Math.abs(s.dx) >= 28 || Math.abs(s.dy) >= 15).toBe(true);
  });
  it('连着来几个，前几个互不压住', () => {
    const act: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 4; i++) {
      const s = pickSlot(act, 50, 50);
      const p = { x: 50 + s.dx, y: 50 + s.dy };
      for (const a of act) expect(Math.abs(a.x - p.x) >= 28 || Math.abs(a.y - p.y) >= 15).toBe(true);
      act.push(p);
    }
  });
});

describe('pickSlot：大数字和小数字之间留空', () => {
  it('一个大数字（60×22）在原位时，新来的大数字挪开后两框之间至少隔 DMG_GAP', () => {
    const big = { x: 100, y: 100, w: 60, h: 22 };
    for (const [w, h] of [[60, 22], [30, 14]] as const) {
      const s = pickSlot([big], 100, 100, w, h);
      const gx = Math.abs(s.dx) - (big.w + w) / 2;
      const gy = Math.abs(s.dy) - (big.h + h) / 2;
      expect(Math.max(gx, gy), `${w}×${h}`).toBeGreaterThanOrEqual(DMG_GAP);
    }
  });
});

describe('clampCenter：提示不出屏', () => {
  it('靠右边缘被拉回', () => {
    expect(clampCenter(390, 160, 390, 8)).toBe(390 - 8 - 80);
  });
  it('靠左边缘被拉回', () => {
    expect(clampCenter(0, 160, 390, 8)).toBe(8 + 80);
  });
  it('在中间不动；屏幕太窄就居中', () => {
    expect(clampCenter(200, 160, 390, 8)).toBe(200);
    expect(clampCenter(10, 400, 390, 8)).toBe(195);
  });
});

describe('topBlame：谁造成了大部分伤亡', () => {
  it('占一半以上且至少 3 个', () => {
    expect(topBlame(new Map([['mortar', 6], ['cannon', 2]]))).toEqual({ kind: 'mortar', n: 6, total: 8 });
  });
  it('太分散或太少不点名', () => {
    expect(topBlame(new Map([['mortar', 2], ['cannon', 2], ['musket', 2]]))).toBeNull();
    expect(topBlame(new Map([['mortar', 2]]))).toBeNull();
  });
});

describe('pushApart：飘字竖向防撞', () => {
  const f = (x: number, y: number, born: number, w = 30, h = 14) => ({ x, y, w, h, born });
  it('后出的数字追上先出的：把先出的往上推开，后出的不动', () => {
    const items = [f(0, 100, 300), f(0, 106, 100)];
    const push = new Float64Array(2);
    pushApart(items, push);
    expect(push[1]).toBe(0);
    const top = items[0]!.y - push[0]!;
    expect(items[1]!.y - top).toBeGreaterThanOrEqual(14 + DMG_GAP - 1e-9);
  });
  it('横向错开、竖向本来就分开的不推', () => {
    const push = new Float64Array(3);
    pushApart([f(0, 100, 300), f(60, 100, 100), f(0, 140, 50)], push);
    expect([...push]).toEqual([0, 0, 0]);
  });
  it('三个叠在一起：一路往上推开，互不重叠', () => {
    const items = [f(0, 100, 500), f(0, 104, 300), f(0, 108, 100)];
    const push = new Float64Array(3);
    pushApart(items, push);
    const ys = items.map((it, i) => it.y - push[i]!).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!).toBeGreaterThanOrEqual(14 + DMG_GAP - 1e-6);
  });
  it('推上去的不回落：已经推开的量只增不减', () => {
    const push = new Float64Array([20, 0]);
    pushApart([f(0, 100, 300), f(0, 200, 100)], push);
    expect(push[0]).toBe(20);
  });
});

describe('pickMerge：同一片的「+N」并成一个', () => {
  const r = (key: string, t: number, x: number, y: number) => ({ key, t, x, y });
  it('同类、时间窗内、半径内最近的那个', () => {
    const rec = [r('+|y', 0, 0, 0), r('+|y', 100, 50, 0), r('+|g', 100, 10, 0)];
    expect(pickMerge(rec, '+|y', 40, 0, 200, 1)).toBe(1);
  });
  it('超时、超半径、不同类的不并', () => {
    expect(pickMerge([r('+|y', 0, 0, 0)], '+|y', 0, 0, MERGE_MS, 1)).toBe(-1);
    expect(pickMerge([r('+|y', 0, 0, 0)], '+|y', MERGE_PX + 1, 0, 10, 1)).toBe(-1);
    expect(pickMerge([r('+|g', 0, 0, 0)], '+|y', 0, 0, 10, 1)).toBe(-1);
  });
  it('半径按屏幕像素算：镜头拉远（z 小）时世界里离得远的也并', () => {
    expect(pickMerge([r('+|y', 0, 0, 0)], '+|y', 200, 0, 10, 0.5)).toBe(0);
  });
});
