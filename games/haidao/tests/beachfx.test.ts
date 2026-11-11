import { describe, expect, it } from 'vitest';
import { BEACH, ISLAND } from '../src/core/types.ts';
import { ringNearest, ringPoint } from '../src/view/beachfx.ts';

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
