/**
 * 收池飞行的弧线和气泡夹边（src/view/fx.ts 的纯函数）：端点、单调、夹进舞台。
 */
import { describe, expect, it } from 'vitest';
import { arcPoints, clampShift } from '../../src/view/fx.ts';

describe('arcPoints', () => {
  const a = { x: 100, y: 200 };
  const b = { x: 400, y: 80 };

  it('起点是 0、终点正好是 b 减 a（相对位移）', () => {
    const p = arcPoints(a, b, 60);
    expect(p[0]).toEqual({ x: 0, y: 0 });
    expect(p.at(-1)!.x).toBeCloseTo(300, 6);
    expect(p.at(-1)!.y).toBeCloseTo(-120, 6);
  });

  it('横向单调往前、中途向上拱过直线', () => {
    const p = arcPoints(a, b, 60);
    for (let i = 1; i < p.length; i++) expect(p[i]!.x).toBeGreaterThanOrEqual(p[i - 1]!.x);
    // 中点比 a、b 的连线中点更高（y 更小）
    const mid = p[Math.floor(p.length / 2)]!;
    expect(mid.y).toBeLessThan((-120 / 300) * mid.x);
  });

  it('起步和落点前都变慢（缓动），中段最快', () => {
    const p = arcPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 0, 20);
    const step = (i: number): number => p[i + 1]!.x - p[i]!.x;
    expect(step(0)).toBeLessThan(step(9));
    expect(step(19)).toBeLessThan(step(9));
  });
});

describe('clampShift', () => {
  const stage = { left: 0, top: 0, right: 1920, bottom: 1080 };

  it('在里面不动', () => {
    expect(clampShift({ left: 100, top: 100, right: 200, bottom: 140 }, stage)).toEqual({ dx: 0, dy: 0 });
  });

  it('右边伸出去：往回推到留 6 像素边', () => {
    // 1920 宽下右上座位的"跟注 20"：右沿 1990
    expect(clampShift({ left: 1800, top: 220, right: 1990, bottom: 280 }, stage)).toEqual({ dx: -76, dy: 0 });
  });

  it('左边、上边伸出去：往里推', () => {
    expect(clampShift({ left: -20, top: -8, right: 80, bottom: 30 }, stage)).toEqual({ dx: 26, dy: 14 });
  });

  it('比范围还大：贴左上，不抖', () => {
    expect(clampShift({ left: 50, top: 10, right: 2300, bottom: 40 }, stage).dx).toBe(-44);
  });
});
