import { describe, expect, it } from 'vitest';
import { approach, CROWD_D, CROWD_MAX, CROWD_MAX_TD, crowdOffsets } from '../src/view/crowd.ts';

function run(items: Array<{ id: number; x: number; y: number }>): { ox: Float64Array; oy: Float64Array } {
  const ox = new Float64Array(items.length);
  const oy = new Float64Array(items.length);
  crowdOffsets(items, ox, oy);
  return { ox, oy };
}

describe('crowdOffsets', () => {
  it('重合的四个兵被推开到接近最小间距，且不超过上限', () => {
    const items = [1, 2, 3, 4].map((id) => ({ id, x: 500, y: 500 }));
    const { ox, oy } = run(items);
    let minD = Infinity;
    for (let i = 0; i < 4; i++) {
      expect(Math.hypot(ox[i]!, oy[i]!)).toBeLessThanOrEqual(CROWD_MAX + 1e-9);
      for (let j = i + 1; j < 4; j++) minD = Math.min(minD, Math.hypot(items[i]!.x + ox[i]! - items[j]!.x - ox[j]!, items[i]!.y + oy[i]! - items[j]!.y - oy[j]!));
    }
    expect(minD).toBeGreaterThan(CROWD_D * 0.7);
  });
  it('离得远的兵不动', () => {
    const { ox, oy } = run([{ id: 1, x: 0, y: 0 }, { id: 2, x: 400, y: 400 }]);
    expect([ox[0], oy[0], ox[1], oy[1]]).toEqual([0, 0, 0, 0]);
  });
  it('确定性：同样输入同样输出', () => {
    const items = [1, 2, 3].map((id) => ({ id, x: 100 + id, y: 100 }));
    const a = run(items);
    const b = run(items);
    expect(Array.from(a.ox)).toEqual(Array.from(b.ox));
  });
  it('约 100 个兵也能算完', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ id: i, x: 300 + (i % 10) * 5, y: 300 + Math.floor(i / 10) * 5 }));
    expect(() => run(items)).not.toThrow();
  });
});

describe('approach', () => {
  it('单调靠近且不越过目标，dt=0 不动', () => {
    expect(approach(10, 0, 0)).toBe(10);
    const a = approach(10, 0, 16);
    expect(a).toBeLessThan(10);
    expect(a).toBeGreaterThan(0);
    expect(approach(10, 0, 2000)).toBeLessThan(0.01);
  });
});

describe('crowdOffsets 大个子和遮挡', () => {
  it('大个子按各自半径之和拉开', () => {
    const items = [1, 2, 3, 4].map((id) => ({ id, x: 500, y: 500, r: 38 }));
    const ox = new Float64Array(4);
    const oy = new Float64Array(4);
    crowdOffsets(items, ox, oy);
    let minD = Infinity;
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) minD = Math.min(minD, Math.hypot(ox[i]! - ox[j]!, oy[i]! - oy[j]!));
    expect(minD).toBeGreaterThan(76 * 0.8);
  });
  it('被挡住的方向不偏', () => {
    const items = [{ id: 1, x: 500, y: 500 }, { id: 2, x: 500, y: 500 }];
    const ox = new Float64Array(2);
    const oy = new Float64Array(2);
    crowdOffsets(items, ox, oy, 56, 80, 5, (x) => x !== 500);
    expect(Array.from(ox)).toEqual([0, 0]);
  });

  it('贴墙的四个壮汉沿墙滑开：两两拉开、都不进建筑占地', () => {
    // 建筑占地 x > 520（墙面在 x = 520），四个壮汉贴着墙面站在同一点
    const blocked = (x: number) => x > 520;
    const items = [1, 2, 3, 4].map((id) => ({ id, x: 515, y: 500, r: 38 }));
    const ox = new Float64Array(4);
    const oy = new Float64Array(4);
    crowdOffsets(items, ox, oy, 56, 80, 5, blocked);
    let minD = Infinity;
    for (let i = 0; i < 4; i++) {
      expect(blocked(items[i]!.x + ox[i]!)).toBe(false);
      for (let j = i + 1; j < 4; j++) minD = Math.min(minD, Math.hypot(ox[i]! - ox[j]!, oy[i]! - oy[j]!));
    }
    expect(minD).toBeGreaterThan(76 * 0.6);
  });
  it('贴墙的一排兵（墙在上沿）也能滑开，而且兵多了仍然线性', () => {
    const blocked = (_x: number, y: number) => y < 480;
    const items = Array.from({ length: 6 }, (_, k) => ({ id: k + 1, x: 500, y: 485, r: 38 }));
    const ox = new Float64Array(6);
    const oy = new Float64Array(6);
    crowdOffsets(items, ox, oy, 56, 80, 5, blocked);
    for (let i = 0; i < 6; i++) expect(blocked(items[i]!.x + ox[i]!, items[i]!.y + oy[i]!)).toBe(false);
    const many = Array.from({ length: 400 }, (_, k) => ({ id: k, x: 500 + (k % 20) * 6, y: 485 + Math.floor(k / 20) * 6 }));
    const mx = new Float64Array(400);
    const my = new Float64Array(400);
    const t0 = performance.now();
    crowdOffsets(many, mx, my, 56, 80, 5, blocked);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe('守岛的人堆', () => {
  it('一条路上挤成一坨的 30 个敌人：推开后最近邻间距变大，每人偏移不超过 CROWD_MAX_TD', () => {
    // 规则里一波沿同一条路走，几乎重合：沿 x 方向每人只差 6 个单位
    const items = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, x: 1000 + i * 6, y: 800 + (i % 3) * 4 }));
    const ox = new Float64Array(items.length);
    const oy = new Float64Array(items.length);
    const nearest = (dx: Float64Array, dy: Float64Array): number => {
      let sum = 0;
      for (let i = 0; i < items.length; i++) {
        let best = Infinity;
        for (let j = 0; j < items.length; j++) if (i !== j) best = Math.min(best, Math.hypot(items[i]!.x + dx[i]! - items[j]!.x - dx[j]!, items[i]!.y + dy[i]! - items[j]!.y - dy[j]!));
        sum += best;
      }
      return sum / items.length;
    };
    const before = nearest(new Float64Array(30), new Float64Array(30));
    crowdOffsets(items, ox, oy, CROWD_D, CROWD_MAX_TD, 4);
    expect(nearest(ox, oy)).toBeGreaterThan(before * 2.5);
    for (let i = 0; i < items.length; i++) expect(Math.hypot(ox[i]!, oy[i]!)).toBeLessThanOrEqual(CROWD_MAX_TD + 1e-9);
  });
});
