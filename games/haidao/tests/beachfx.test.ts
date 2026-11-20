import { describe, expect, it } from 'vitest';
import { BEACH, ISLAND } from '../src/core/types.ts';
import { SNAP_IN, SNAP_OUT, ringNearest, ringPoint, snapLanding } from '../src/view/beachfx.ts';

describe('beachfx 路径', () => {
  it('t=0 在左上角，t=0.25 在右上角，循环', () => {
    expect(ringPoint(0, 0)).toEqual({ x: -BEACH, y: -BEACH });
    expect(ringPoint(0.25, 0)).toEqual({ x: ISLAND + BEACH, y: -BEACH });
    expect(ringPoint(1.5, 0).x).toBeCloseTo(ringPoint(0.5, 0).x);
    expect(ringPoint(-0.75, 0).y).toBeCloseTo(ringPoint(0.25, 0).y);
  });
  it('最近点：靠哪条边就落在哪条边上', () => {
    const t = ringNearest(ISLAND / 2, -BEACH - 0.5, 0);
    const p = ringPoint(t, 0);
    expect(p.y).toBeCloseTo(-BEACH);
    expect(p.x).toBeCloseTo(ISLAND / 2);
  });
  it('最近点再取点，往返在边上不跳', () => {
    for (let t = 0.01; t < 1; t += 0.07) {
      const p = ringPoint(t, 0);
      expect(ringNearest(p.x, p.y, 0)).toBeCloseTo(t, 6);
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
    expect(snapLanding(-1.5, 10, 0)).toEqual({ x: -1.5, y: 10 });
    expect(snapLanding(ISLAND + 2, ISLAND + 2, 0)).toEqual({ x: ISLAND + 2, y: ISLAND + 2 });
  });
  it('环外不远的点吸到环上，再远是海', () => {
    expect(legal(snapLanding(-BEACH - SNAP_OUT + 0.05, 10, 0))).toBe(true);
    expect(snapLanding(-BEACH - SNAP_OUT - 0.1, 10, 0)).toBeNull();
    // 角上斜着出去：按直线距离算
    expect(legal(snapLanding(ISLAND + BEACH + 0.4, ISLAND + BEACH + 0.4, 0))).toBe(true);
    expect(snapLanding(ISLAND + BEACH + 0.7, ISLAND + BEACH + 0.7, 0)).toBeNull();
  });
  it('贴着草边的岛内点推到最近那条边外，岛里面不吸', () => {
    for (const [x, y] of [[0.3, 10], [10, 0.2], [ISLAND - 0.3, 10], [10, ISLAND - 0.35]] as const) expect(legal(snapLanding(x, y, 0)), `${x},${y}`).toBe(true);
    expect(snapLanding(SNAP_IN + 0.1, 10, 0)).toBeNull();
    expect(snapLanding(ISLAND / 2, ISLAND / 2, 0)).toBeNull();
  });
  it('选着船（deep）时岛里面多深都吸到最近那条边外，海里照旧不吸', () => {
    expect(snapLanding(3, 10, 0, true)).toEqual({ x: -0.05, y: 10 });
    expect(snapLanding(10, ISLAND - 3, 0, true)).toEqual({ x: 10, y: ISLAND + 0.05 });
    expect(legal(snapLanding(ISLAND / 2, ISLAND / 2, 0, true))).toBe(true);
    expect(snapLanding(-BEACH - SNAP_OUT - 0.1, 10, 0, true)).toBeNull();
    for (let x = 0.1; x < ISLAND; x += 0.53) for (let y = 0.1; y < ISLAND; y += 0.71) expect(legal(snapLanding(x, y, 0, true)), `${x},${y}`).toBe(true);
  });
  it('岛扩了两圈：沙滩跟着往外挪，扩出来的草地不算登陆区', () => {
    const legal2 = (p: { x: number; y: number } | null): boolean => {
      if (!p) return false;
      const cx = Math.floor(p.x);
      const cy = Math.floor(p.y);
      const out = cx < -2 - BEACH || cy < -2 - BEACH || cx >= ISLAND + 2 + BEACH || cy >= ISLAND + 2 + BEACH;
      const inside = cx >= -2 && cy >= -2 && cx < ISLAND + 2 && cy < ISLAND + 2;
      return !out && !inside;
    };
    expect(ringPoint(0, 2)).toEqual({ x: -2 - BEACH, y: -2 - BEACH });
    expect(snapLanding(-1.5, 10, 2)).toBeNull();
    expect(snapLanding(-3.5, 10, 2)).toEqual({ x: -3.5, y: 10 });
    expect(snapLanding(-1.5, 10, 2, true)).toEqual({ x: -2.05, y: 10 });
    for (let x = -1.9; x < ISLAND + 2; x += 0.53) for (let y = -1.9; y < ISLAND + 2; y += 0.71) expect(legal2(snapLanding(x, y, 2, true)), `${x},${y}`).toBe(true);
  });
  it('吸过的点取整后一定是规则认的登陆格', () => {
    for (let x = -BEACH - 1; x <= ISLAND + BEACH + 1; x += 0.37) {
      for (const y of [-BEACH - 0.5, -1, 0.2, 7, ISLAND - 0.2, ISLAND + 1, ISLAND + BEACH + 0.5]) {
        const p = snapLanding(x, y, 0);
        if (p) expect(legal(p), `${x},${y}`).toBe(true);
      }
    }
  });
});
