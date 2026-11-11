import { describe, expect, it } from 'vitest';
import { RING_BTN, RING_RADIUS, ringCovers, ringLayout } from '../src/view/ringmenu.ts';

const AREA = { l: 0, r: 390, t: 108, b: 748 };
const inside = (l: ReturnType<typeof ringLayout>, area = AREA): boolean =>
  l.offs.every((o) => l.cx + o.x - RING_BTN / 2 >= area.l - 0.5 && l.cx + o.x + RING_BTN / 2 <= area.r + 0.5 && l.cy + o.y - RING_BTN / 2 >= area.t - 0.5 && l.cy + o.y + RING_BTN / 2 <= area.b + 0.5);

describe('操作环布局', () => {
  it('建筑在中间：环中心就是建筑', () => {
    const l = ringLayout(200, 400, AREA, 4);
    expect([l.cx, l.cy]).toEqual([200, 400]);
    expect(inside(l)).toBe(true);
  });
  it('钮从正上方起顺时针均分', () => {
    const l = ringLayout(200, 400, AREA, 4);
    expect(l.offs[0]).toEqual({ x: 0, y: -RING_RADIUS });
    expect(l.offs[1]!.x).toBe(RING_RADIUS);
    expect(l.offs[2]!.y).toBe(RING_RADIUS);
    expect(l.offs[3]!.x).toBe(-RING_RADIUS);
  });
  it('靠四边和四角时整圈内收，不出可见区', () => {
    for (const [x, y] of [[2, 400], [388, 400], [200, 110], [200, 746], [0, 108], [390, 748], [-50, 900]] as const) {
      const l = ringLayout(x, y, AREA, 4);
      expect(inside(l), `${x},${y}`).toBe(true);
    }
  });
  it('2 到 4 个钮都成立', () => {
    for (const n of [1, 2, 3, 4]) expect(ringLayout(5, 120, AREA, n).offs).toHaveLength(n);
  });
  it('可见区小于一圈时取中点，不报错', () => {
    const l = ringLayout(10, 10, { l: 0, r: 100, t: 0, b: 100 }, 4);
    expect([l.cx, l.cy]).toEqual([50, 50]);
  });
});

describe('操作环压住收取气泡', () => {
  it('按钮圆和气泡圆相交才算压住', () => {
    const area = { l: 0, t: 0, r: 390, b: 844 };
    const lay = ringLayout(195, 422, area, 3);
    const o = lay.offs[0]!;
    expect(ringCovers(lay, lay.cx + o.x, lay.cy + o.y, 10)).toBe(true);
    expect(ringCovers(lay, lay.cx + o.x + RING_BTN / 2 + 9, lay.cy + o.y, 10)).toBe(true);
    // 环中心（建筑本身）离每颗按钮都有 RING_RADIUS 远，小气泡不算压住
    expect(ringCovers(lay, lay.cx, lay.cy, 10)).toBe(false);
    expect(ringCovers(lay, 0, 0, 10)).toBe(false);
  });
});
