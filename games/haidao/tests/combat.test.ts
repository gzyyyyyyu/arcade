import { describe, expect, it } from 'vitest';
import { LEAD_MAX, flightTicks, inRing, keepLock, laneOffset, leadPoint, rankTargets } from '../src/core/index.ts';

/** 进攻和守岛共用的战斗规则（docs/v2.md 第 3 节、DESIGN 10.2b）：每条规则一个测试 */

const u = (id: number, x: number, y: number, px?: number, py?: number) => ({ id, x, y, px, py });

describe('寻敌 rankTargets', () => {
  it('按 [优先级类, 先后, id] 升序，同样的输入同样的顺序', () => {
    const c = [u(3, 0, 0), u(1, 0, 0), u(2, 0, 0), u(4, 0, 0)];
    const rank = (q: { id: number }) => [q.id === 4 ? 0 : 1, q.id === 2 ? 5 : 9] as const;
    expect(rankTargets(c, -1, rank).map((q) => q.id)).toEqual([4, 2, 1, 3]);
    expect(rankTargets([...c].reverse(), -1, rank).map((q) => q.id)).toEqual([4, 2, 1, 3]);
  });
  it('锁定：同一类里旧目标排后面了也接着打它', () => {
    const c = [u(1, 0, 0), u(2, 0, 0), u(3, 0, 0)];
    expect(rankTargets(c, 3, (q) => [0, q.id])[0]?.id).toBe(3);
  });
  it('锁定让位给更高的优先级类（比如拿着宝藏的）', () => {
    const c = [u(1, 0, 0), u(2, 0, 0)];
    expect(rankTargets(c, 2, (q) => [q.id === 1 ? 0 : 1, 0])[0]?.id).toBe(1);
  });
  it('旧目标不在候选里（死了、出射程）就换最好的', () => {
    expect(rankTargets([u(1, 0, 0), u(2, 0, 0)], 7, (q) => [0, q.id])[0]?.id).toBe(1);
  });
});

describe('锁定快判 keepLock', () => {
  it('锁定的还在、没有更高一类的就留着；不在了或被更高一类压过就交回重排', () => {
    const c = [u(1, 0, 0), u(2, 0, 0)];
    expect(keepLock(c, 2, () => 0)?.id).toBe(2);
    expect(keepLock(c, 3, () => 0)).toBeUndefined();
    expect(keepLock(c, -1, () => 0)).toBeUndefined();
    expect(keepLock(c, 2, (q) => (q.id === 1 ? 0 : 1))).toBeUndefined();
  });
});

describe('射程 inRing', () => {
  it('两端都算在内，死区以内不打', () => {
    expect(inRing(700 * 700, 700, 300)).toBe(true);
    expect(inRing(300 * 300, 700, 300)).toBe(true);
    expect(inRing(299 * 299, 700, 300)).toBe(false);
    expect(inRing(701 * 701, 700, 0)).toBe(false);
  });
});

describe('攻击', () => {
  it('飞行拍数按距离和速度向上取整，至少 2 拍', () => {
    expect(flightTicks(0, 0, 0, 0, 30)).toBe(2);
    expect(flightTicks(0, 0, 300, 400, 14)).toBe(36);
  });
  it('提前量按上一拍的位移乘飞行拍数，最多 LEAD_MAX', () => {
    expect(leadPoint(u(1, 100, 100, 95, 100), 10)).toEqual({ x: 150, y: 100 });
    const far = leadPoint(u(1, 0, 0, -20, 0), 100);
    expect(far.x).toBe(LEAD_MAX);
  });
  it('没动、没有上一拍、或者一拍跳太远（被拉回）不估', () => {
    expect(leadPoint(u(1, 100, 100, 100, 100), 10)).toEqual({ x: 100, y: 100 });
    expect(leadPoint(u(1, 100, 100), 10)).toEqual({ x: 100, y: 100 });
    expect(leadPoint(u(1, 100, 100, 0, 100), 10)).toEqual({ x: 100, y: 100 });
  });
});

describe('走位 laneOffset', () => {
  it('相邻的 id 横竖都不同档，偏移不超过 2 档', () => {
    for (let id = 1; id < 200; id++) {
      const a = laneOffset(id, 12);
      const b = laneOffset(id + 1, 12);
      expect(a.x === b.x || a.y === b.y).toBe(false);
      expect(Math.abs(a.x)).toBeLessThanOrEqual(24);
      expect(Math.abs(a.y)).toBeLessThanOrEqual(24);
    }
  });
});
