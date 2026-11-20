import { describe, expect, it } from 'vitest';
import { BEACH, ISLAND } from '../src/core/types.ts';
import { SNAP_IN, SNAP_OUT, ringNearest, ringPoint, snapLanding } from '../src/view/beachfx.ts';

describe('beachfx 路径', () => {
  it('t=0 在左上角，t=0.25 在右上角，循环', () => {
    expect(ringPoint(0)).toEqual({ x: -BEACH, y: -BEACH });
    expect(ringPoint(0.25)).toEqual({ x: ISLAND + BEACH, y: -BEACH });
    expect(ringPoint(1.5).x).toBeCloseTo(ringPoint(0.5).x);
    expect(ringPoint(-0.75).y).toBeCloseTo(ringPoint(0.25).y);
  });
  it('最近点：靠哪条边就落在哪条边上', () => {
    const t = ringNearest(ISLAND / 2, -BEACH - 0.5);
    const p = ringPoint(t);
    expect(p.y).toBeCloseTo(-BEACH);
    expect(p.x).toBeCloseTo(ISLAND / 2);
  });
  it('最近点再取点，往返在边上不跳', () => {
    for (let t = 0.01; t < 1; t += 0.07) {
      const p = ringPoint(t);
      expect(ringNearest(p.x, p.y)).toBeCloseTo(t, 6);
    }
  });
});

describe('出船落点吸附', () => {
  const legal = (p: { x: number; y: number } | null): boolean => {
    if (!p) return false;
    const cx = Math.floor(p.x);
    const cy = Math.floor(p.y);
    const out = cx < -BEACH || cy < -BEACH || cx >= ISLAND + BEACH || cy >= ISLAND + BEACH;
    const inside = cx >= 0 && cy >= 0 && cx < ISLAND && cy < ISLAND;
    return !out && !inside;
  };
  it('沙滩上的点原样返回', () => {
    expect(snapLanding(-1.5, 10)).toEqual({ x: -1.5, y: 10 });
    expect(snapLanding(ISLAND + 2, ISLAND + 2)).toEqual({ x: ISLAND + 2, y: ISLAND + 2 });
  });
  it('环外不远的点吸到环上，再远是海', () => {
    expect(legal(snapLanding(-BEACH - SNAP_OUT + 0.05, 10))).toBe(true);
    expect(snapLanding(-BEACH - SNAP_OUT - 0.1, 10)).toBeNull();
    // 角上斜着出去：按直线距离算
    expect(legal(snapLanding(ISLAND + BEACH + 0.4, ISLAND + BEACH + 0.4))).toBe(true);
    expect(snapLanding(ISLAND + BEACH + 0.7, ISLAND + BEACH + 0.7)).toBeNull();
  });
  it('贴着草边的岛内点推到最近那条边外，岛里面不吸', () => {
    for (const [x, y] of [[0.3, 10], [10, 0.2], [ISLAND - 0.3, 10], [10, ISLAND - 0.35]] as const) expect(legal(snapLanding(x, y)), `${x},${y}`).toBe(true);
    expect(snapLanding(SNAP_IN + 0.1, 10)).toBeNull();
    expect(snapLanding(ISLAND / 2, ISLAND / 2)).toBeNull();
  });
  it('选着船（deep）时岛里面多深都吸到最近那条边外，海里照旧不吸', () => {
    expect(snapLanding(3, 10, BEACH, ISLAND, true)).toEqual({ x: -0.05, y: 10 });
    expect(snapLanding(10, ISLAND - 3, BEACH, ISLAND, true)).toEqual({ x: 10, y: ISLAND + 0.05 });
    expect(legal(snapLanding(ISLAND / 2, ISLAND / 2, BEACH, ISLAND, true))).toBe(true);
    expect(snapLanding(-BEACH - SNAP_OUT - 0.1, 10, BEACH, ISLAND, true)).toBeNull();
    for (let x = 0.1; x < ISLAND; x += 0.53) for (let y = 0.1; y < ISLAND; y += 0.71) expect(legal(snapLanding(x, y, BEACH, ISLAND, true)), `${x},${y}`).toBe(true);
  });
  it('吸过的点取整后一定是规则认的登陆格', () => {
    for (let x = -BEACH - 1; x <= ISLAND + BEACH + 1; x += 0.37) {
      for (const y of [-BEACH - 0.5, -1, 0.2, 7, ISLAND - 0.2, ISLAND + 1, ISLAND + BEACH + 0.5]) {
        const p = snapLanding(x, y);
        if (p) expect(legal(p), `${x},${y}`).toBe(true);
      }
    }
  });
});
