import { describe, expect, it } from 'vitest';
import { ESCORT_CELL } from '../src/core/escorttypes.ts';
import { AHEAD_CELLS, aheadPoint, centerFor, dashes, followStep, interpPos, meetPoint, nextGate, pathFrom, pathTo, shipPoint, showBackToShip, userMoved } from '../src/view/escortcam.ts';
import { ESCORT_CSS } from '../src/view/escortcss.ts';
import { PACE_INFO, PACE_ORDER, bestText, hullPercent, hullTone, lockText, mapTitle, meetText, mendView, paceOfKey, resultBig, resultLine, resultTitle, starRuleText } from '../src/view/escorttext.ts';

const C = ESCORT_CELL;
const route = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }];

describe('escortcam：船在航线上的位置', () => {
  it('起点、格间插值、终点夹住', () => {
    expect(shipPoint(route, 0)).toMatchObject({ x: 0.5, y: 0.5, hx: 1, hy: 0 });
    expect(shipPoint(route, C / 2)).toMatchObject({ x: 1, y: 0.5 });
    expect(shipPoint(route, C * 1.5)).toMatchObject({ x: 1.5, y: 1, hx: 0, hy: 1 });
    expect(shipPoint(route, 9 * C)).toMatchObject({ x: 2.5, y: 2.5 });
    expect(shipPoint(route, -5)).toMatchObject({ x: 0.5, y: 0.5 });
  });
  it('斜着走的航向是单位向量', () => {
    const p = shipPoint(route, C * 2.5);
    expect(Math.hypot(p.hx, p.hy)).toBeCloseTo(1);
  });
  it('interpPos 在两拍之间混合并夹在 0..1', () => {
    expect(interpPos(100, 110, 0.5)).toBe(105);
    expect(interpPos(100, 110, 3)).toBe(110);
    expect(interpPos(100, 100, 0.4)).toBe(100);
  });
  it('前方 3 格：到终点为止', () => {
    expect(AHEAD_CELLS).toBe(3);
    expect(aheadPoint(route, 0)).toEqual({ x: 2.5, y: 2.5 });
    const long = Array.from({ length: 10 }, (_, i) => ({ x: i, y: 0 }));
    expect(aheadPoint(long, 0)).toEqual({ x: 3.5, y: 0.5 });
  });
});

describe('escortcam：实线虚线', () => {
  it('走过的折线到船为止，没走的从船开始', () => {
    expect(pathTo(route, 0)).toEqual([{ x: 0.5, y: 0.5 }]);
    const a = pathTo(route, C * 1.5);
    expect(a).toHaveLength(3);
    expect(a[2]).toEqual({ x: 1.5, y: 1 });
    const b = pathFrom(route, C * 1.5);
    expect(b[0]).toEqual({ x: 1.5, y: 1 });
    expect(b).toHaveLength(3);
    expect(pathFrom(route, 99 * C)).toHaveLength(1);
  });
  it('dashes 按 dash / gap 切段，总长不超过折线', () => {
    const segs = dashes([{ x: 0, y: 0 }, { x: 100, y: 0 }], 10, 10);
    expect(segs).toHaveLength(5);
    expect(segs[0]).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    expect(segs[1]![0].x).toBeCloseTo(20);
    expect(dashes([{ x: 0, y: 0 }], 10, 10)).toEqual([]);
  });
  it('相遇点：-1 和 undefined 没有，其余是格心', () => {
    expect(meetPoint(route, -1)).toBeNull();
    expect(meetPoint(route, undefined)).toBeNull();
    expect(meetPoint(route, 2)).toEqual({ x: 1.5, y: 1.5 });
    expect(nextGate([2, 5], 1)).toBe(5);
    expect(nextGate([2, 5], 2)).toBe(-1);
  });
});

describe('escortcam：竖屏跟船', () => {
  it('centerFor 让目标落在可见区正中', () => {
    const vis = { l: 0, t: 100, r: 400, b: 700 };
    const c = centerFor(1000, 500, vis, 400, 800, 2);
    // 可见区中心 (200, 400) 相对屏中心 (200, 400) 没偏，中心就是目标
    expect(c).toEqual({ cx: 1000, cy: 500 });
    const d = centerFor(1000, 500, { l: 0, t: 200, r: 400, b: 800 }, 400, 800, 2);
    expect(d.cy).toBe(500 - 100 / 2);
  });
  it('followStep 逼近目标，很近时直接到，dt 为 0 不动', () => {
    const a = followStep({ cx: 0, cy: 0 }, { cx: 100, cy: 0 }, 100);
    expect(a.cx).toBeGreaterThan(0);
    expect(a.cx).toBeLessThan(100);
    expect(followStep({ cx: 0, cy: 0 }, { cx: 100, cy: 0 }, 0).cx).toBe(0);
    expect(followStep({ cx: 99.8, cy: 0 }, { cx: 100, cy: 0 }, 16)).toEqual({ cx: 100, cy: 0 });
  });
  it('玩家一碰镜头就停跟随，出"回到船"钮', () => {
    const set = { cx: 10, cy: 20, z: 1.5 };
    expect(userMoved(null, set)).toBe(false);
    expect(userMoved(set, { ...set })).toBe(false);
    expect(userMoved(set, { ...set, cx: 14 })).toBe(true);
    expect(userMoved(set, { ...set, z: 1.7 })).toBe(true);
    expect(showBackToShip(true, false, false)).toBe(true);
    expect(showBackToShip(true, true, false)).toBe(false);
    expect(showBackToShip(false, false, false)).toBe(false);
    expect(showBackToShip(true, false, true)).toBe(false);
  });
});

describe('escorttext：文案', () => {
  it('船速三档的名字和键（Q/W/E，不占守岛的 1/2/3）', () => {
    expect(PACE_ORDER.map((p) => PACE_INFO[p].label)).toEqual(['停', '巡航', '冲']);
    expect(PACE_ORDER.map((p) => PACE_INFO[p].key)).toEqual(['Q', 'W', 'E']);
    expect(paceOfKey('q')).toBe('hold');
    expect(paceOfKey('W')).toBe('sail');
    expect(paceOfKey('e')).toBe('rush');
    expect(paceOfKey('1')).toBeNull();
  });
  it('血量百分比向下取整并夹住', () => {
    expect(hullPercent(79, 100)).toBe(79);
    expect(hullPercent(199, 200)).toBe(99);
    expect(hullPercent(-3, 100)).toBe(0);
    expect(hullPercent(5, 0)).toBe(0);
    expect(hullTone(20)).toBe('low');
    expect(hullTone(50)).toBe('mid');
    expect(hullTone(90)).toBe('good');
  });
  it('修船钮四种状态：满血 / 冷却 / 金币不够 / 能修', () => {
    const base = { hull: 50, max: 100, gold: 100, tick: 0, ready: 0, tps: 20 };
    expect(mendView({ ...base, hull: 100 })).toMatchObject({ state: 'full', disabled: true });
    const cool = mendView({ ...base, ready: 100 });
    expect(cool).toMatchObject({ state: 'cool', disabled: true, sub: '5秒', cd: 1 });
    expect(mendView({ ...base, gold: 45 })).toMatchObject({ state: 'poor', disabled: true, sub: '还差 15 金币' });
    expect(mendView(base)).toMatchObject({ state: 'ready', disabled: false, sub: '60 金币' });
  });
  it('结算：到港 / 沉没 / 误了潮，大数字和一行小字', () => {
    expect(resultTitle({ arrived: true, sunk: false })).toBe('到港');
    expect(resultTitle({ arrived: false, sunk: true })).toBe('沉没');
    expect(resultTitle({ arrived: false, sunk: false })).toBe('误了潮');
    expect(resultBig(82)).toBe('82%');
    expect(resultLine({ stars: 2, cells: 14, mends: 3 })).toBe('2 星 · 走了 14 格 · 修了 3 次');
  });
  it('选图页的小字', () => {
    expect(bestText(0)).toBe('没护过');
    expect(bestText(3)).toBe('最好 3 星');
    expect(mapTitle('溪口商道·普通')).toBe('溪口商道');
    expect(mapTitle('溪口商道')).toBe('溪口商道');
    expect(starRuleText([50, 80])).toBe('到港时船剩 50% 以上 2 星，80% 以上 3 星');
    expect(lockText('溪口商道')).toContain('溪口商道');
    expect(lockText(null)).toBe('还没解锁');
    expect(meetText(undefined, 20)).toBe('');
    expect(meetText(-1, 20)).toBe('这一波追不上船');
    expect(meetText(4, 20)).toBe('这一波在第 5/20 格追上船');
  });
});

describe('escortcss：尺寸和字号规则', () => {
  const rules = [...ESCORT_CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]! }));
  const px = (body: string, prop: string): number[] => [...body.matchAll(new RegExp(`(?:^|[;\\s])${prop}:\\s*([0-9.]+)px`, 'g'))].map((m) => Number(m[1]));
  it('速度三联钮、修船、跟随、回到船：min-width / min-height 都 ≥ 44', () => {
    for (const cls of ['hd-esc-pbtn', 'hd-esc-mend', 'hd-esc-follow', 'hd-esc-back']) {
      const rs = rules.filter((r) => r.sel.split(',').some((s) => s.trim().endsWith(`.${cls}`) || s.trim().endsWith(`.${cls}.on`)));
      expect(rs.length, cls).toBeGreaterThan(0);
      const w = rs.flatMap((r) => px(r.body, 'min-width'));
      const h = rs.flatMap((r) => px(r.body, 'min-height'));
      expect(w.length, `${cls} 要写 min-width`).toBeGreaterThan(0);
      expect(h.length, `${cls} 要写 min-height`).toBeGreaterThan(0);
      for (const n of [...w, ...h]) expect(n, cls).toBeGreaterThanOrEqual(44);
    }
  });
  it('速度钮手机上一眼看出当前档：金底、上浮、外圈金光；另两档变暗', () => {
    const on = rules.find((r) => r.sel.endsWith('.hd-esc-pbtn.on'))!;
    expect(on.body).toMatch(/#ffe58a/);
    expect(on.body).toMatch(/translateY\(-6px\)/);
    expect(on.body).toMatch(/box-shadow:[^;]*rgba\(255,214,90/);
    const off = rules.find((r) => r.sel.endsWith('.hd-esc-pbtn'))!;
    expect(off.body).toMatch(/brightness\(/);
  });
  it('选图页的按钮也不小于 44', () => {
    for (const cls of ['hd-esc-map', 'hd-esc-diff', 'hd-esc-go']) {
      const rs = rules.filter((r) => r.sel.endsWith(`.${cls}`));
      const h = rs.flatMap((r) => px(r.body, 'min-height'));
      expect(h.length, cls).toBeGreaterThan(0);
      for (const n of h) expect(n, cls).toBeGreaterThanOrEqual(44);
    }
  });
  it('字号只用 12/14/16/20，大数字 ≥ 24', () => {
    for (const m of ESCORT_CSS.matchAll(/font(?:-size)?:\s*(?:[a-z0-9]+\s+)?([0-9.]+)px/g)) {
      const n = Number(m[1]);
      expect([12, 14, 16, 20].includes(n) || n >= 24, m[0]).toBe(true);
    }
  });
  it('减少动效时不抖不飘', () => {
    expect(ESCORT_CSS).toMatch(/prefers-reduced-motion:reduce[\s\S]*hd-esc-hullw\.bite[\s\S]*animation:none/);
  });
});
