import { describe, expect, it } from 'vitest';
import { createTd, newProfile, tdHomeSetup, tdRoutes } from '../src/core/index.ts';
import { cellX, cellY, GRID } from '../src/core/grid.ts';
import { UNIT, BEACH } from '../src/core/types.ts';
import { GUIDE_MAX_DIST, guideVisible, recommendPads } from '../src/view/padguide.ts';

/** 海盗来袭开局的木台推荐：纯函数，只读路线和木台 */
const route = (cx: number, cy: number, len: number): number[] => {
  const out: number[] = [];
  for (let k = 0; k < len; k++) out.push(idxOf(cx + k, cy));
  return out;
};
const idxOf = (x: number, y: number): number => (y + BEACH) * GRID + (x + BEACH);
const pad = (x: number, y: number, extra = {}) => ({ x, y, tower: -1, ...extra });

describe('recommendPads', () => {
  it('格子换算和测试里的 idxOf 一致', () => {
    const c = idxOf(5, 7);
    expect(cellX(c)).toBe(5 * UNIT + UNIT / 2);
    expect(cellY(c)).toBe(7 * UNIT + UNIT / 2);
  });
  it('离路线近的先，太远的不推荐', () => {
    const r = [{ cells: route(2, 10, 20), open: true }];
    const slots = [pad(10, 12), pad(10, 9), pad(10, 30), pad(10, 11)];
    expect(recommendPads(slots, r, 3)).toEqual([1, 3, 0]);
    expect(recommendPads(slots, r, 4)).not.toContain(2);
  });
  it('已有塔、驻守台、压沉船的不推荐', () => {
    const r = [{ cells: route(2, 10, 20), open: true }];
    const slots = [pad(8, 9, { tower: 3 }), pad(9, 9, { garrison: 0 }), pad(10, 9, { wreck: 1 }), pad(11, 9)];
    expect(recommendPads(slots, r)).toEqual([3]);
  });
  it('关着的落潮路不参与；每条开着的路先各取一块', () => {
    const a = { cells: route(2, 10, 20), open: true };
    const b = { cells: route(2, 30, 20), open: true };
    const closed = { cells: route(2, 50, 20), open: false };
    const slots = [pad(8, 9), pad(10, 9), pad(8, 28), pad(8, 49)];
    expect(recommendPads(slots, [a, b, closed], 2)).toEqual([0, 2]);
  });
  it('同样近时靠近入口的优先，结果稳定', () => {
    const r = [{ cells: route(2, 10, 30), open: true }];
    const slots = [pad(25, 8), pad(5, 8)];
    expect(recommendPads(slots, r, 1)).toEqual([1]);
    expect(recommendPads(slots, r, 2)).toEqual(recommendPads(slots, r, 2));
  });
  it('真实的海盗来袭开局：挑 1–3 块，都是空的、都在路线附近', () => {
    const st = tdHomeSetup(newProfile(), 7);
    if (!st.ok) throw new Error('setup');
    const s = createTd(st.value);
    const routes = tdRoutes(s);
    const picks = recommendPads(s.slots, routes);
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.length).toBeLessThanOrEqual(3);
    for (const i of picks) {
      const sl = s.slots[i]!;
      expect(sl.tower).toBe(-1);
      const d = Math.min(...routes.flatMap((r) => r.cells.map((c) => Math.hypot(cellX(c) / UNIT - sl.x - 1, cellY(c) / UNIT - sl.y - 1))));
      expect(d).toBeLessThanOrEqual(GUIDE_MAX_DIST);
    }
  });
});

describe('guideVisible', () => {
  it('只在第一波前的倒数里、没结束、还有空的推荐木台', () => {
    expect(guideVisible(0, 10, 340, false, 2)).toBe(true);
    expect(guideVisible(1, 10, 340, false, 2)).toBe(false);
    expect(guideVisible(0, 340, 340, false, 2)).toBe(false);
    expect(guideVisible(0, 10, -1, false, 2)).toBe(false);
    expect(guideVisible(0, 10, 340, true, 2)).toBe(false);
    expect(guideVisible(0, 10, 340, false, 0)).toBe(false);
  });
});
