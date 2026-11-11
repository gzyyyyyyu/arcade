/** 金币飞入的路径采样（src/features/coinfly/coinfly.ts 的纯函数部分） */
import { describe, expect, it } from 'vitest';
import { coinPath } from '../src/features/coinfly/coinfly';

const A = { x: 100, y: 400 };
const B = { x: 300, y: 80 };

describe('coinPath', () => {
  it('12 个点，首尾是 from/to', () => {
    const p = coinPath(A, B, 2, 8);
    expect(p).toHaveLength(12);
    expect(p[0]).toEqual(A);
    expect(p[11]?.x).toBeCloseTo(B.x);
    expect(p[11]?.y).toBeCloseTo(B.y);
  });

  it('中点比两端连线更靠上（y 更小）', () => {
    for (let i = 0; i < 8; i++) {
      const p = coinPath(A, B, i, 8);
      const t = 5 / 11;
      expect(p[5]?.y).toBeLessThan(A.y + (B.y - A.y) * t);
    }
  });

  it('同参数结果相同', () => {
    expect(coinPath(A, B, 3, 8)).toEqual(coinPath(A, B, 3, 8));
  });

  it('不同 i 的路径起点附近散开', () => {
    expect(coinPath(A, B, 0, 8)[1]).not.toEqual(coinPath(A, B, 1, 8)[1]);
  });
});
