import { describe, expect, it } from 'vitest';
import { type PickItem, candidates, fadeStep, newCycle, occluders, pick } from '../src/view/basepick.ts';
import { depthOf, footCenter, iso } from '../src/view/iso.ts';

const item = (id: number, x: number, y: number, size: number): PickItem => {
  const f = footCenter(x, y, size);
  return { id, x, y, size, depth: depthOf(f.gx, f.gy) };
};

// 主寨 4×4 在 (8,8)，贴图向上高出 220 像素、两侧各宽 140；大炮 2×2 在 (6,5)、仓库 2×2 在 (8,4) 都在它身后（depth 更小）
const HQ = item(1, 8, 8, 4);
const CANNON = item(2, 6, 5, 2);
const STORE = item(3, 8, 4, 2);
const ITEMS = [HQ, CANNON, STORE];

/** 主寨的不透明像素：以锚点为中心 ±140 宽、向上 220、向下 40 的矩形（其余建筑只有占地大小的小矩形） */
function hit(id: number, wx: number, wy: number): boolean {
  const b = ITEMS.find((q) => q.id === id)!;
  const f = footCenter(b.x, b.y, b.size);
  const c = iso(f.gx, f.gy);
  const [hw, up, down] = id === 1 ? [140, 220, 40] : [40, 70, 20];
  return Math.abs(wx - c.x) <= hw && wy >= c.y - up && wy <= c.y + down;
}

const center = (b: PickItem) => {
  const f = footCenter(b.x, b.y, b.size);
  return iso(f.gx, f.gy);
};

describe('选中判定', () => {
  it('主寨身后的建筑，点它的占地必中，哪怕这一点也落在主寨的贴图上', () => {
    for (const b of [CANNON, STORE]) {
      const c = center(b);
      expect(hit(1, c.x, c.y)).toBe(true); // 前提：主寨贴图确实压在这一点上
      expect(pick(ITEMS, c.x, c.y, hit)).toBe(b.id);
    }
  });

  it('点主寨高出地面的部分（不在任何占地）选主寨', () => {
    const c = center(HQ);
    expect(pick(ITEMS, c.x, c.y - 200, hit)).toBe(1);
  });

  it('空地选不到任何建筑', () => {
    expect(pick(ITEMS, 2000, 2000, hit)).toBeNull();
  });

  it('同一点连点在所有命中的建筑间循环，换个地方就重来', () => {
    const c = center(CANNON);
    expect(candidates(ITEMS, c.x, c.y, hit)).toEqual([2, 1]);
    const cy = newCycle();
    expect(pick(ITEMS, c.x, c.y, hit, cy)).toBe(2);
    expect(pick(ITEMS, c.x + 2, c.y + 1, hit, cy)).toBe(1);
    expect(pick(ITEMS, c.x + 1, c.y, hit, cy)).toBe(2);
    const far = center(HQ);
    expect(pick(ITEMS, far.x, far.y - 200, hit, cy)).toBe(1);
    expect(pick(ITEMS, c.x, c.y, hit, cy)).toBe(2);
  });

  it('只有一座命中时连点不动', () => {
    const c = center(HQ);
    const cy = newCycle();
    expect(pick(ITEMS, c.x, c.y - 200, hit, cy)).toBe(1);
    expect(pick(ITEMS, c.x, c.y - 200, hit, cy)).toBe(1);
  });

  it('贴图都命中、占地没命中时，前面的先', () => {
    const a = item(10, 0, 0, 2);
    const b = item(11, 1, 1, 2);
    const all = [a, b];
    const both = () => true;
    expect(candidates(all, 5000, 5000, both)).toEqual([11, 10]);
  });
});

describe('遮挡', () => {
  it('选中身后的大炮：主寨盖住它，变半透明；主寨自己前面没人', () => {
    expect([...occluders(ITEMS, CANNON.x, CANNON.y, CANNON.size, hit, CANNON.id)]).toEqual([1]);
    expect(occluders(ITEMS, HQ.x, HQ.y, HQ.size, hit, HQ.id).size).toBe(0);
  });

  it('只有更靠前的才算盖住', () => {
    expect(occluders(ITEMS, STORE.x, STORE.y, STORE.size, () => true, STORE.id).has(CANNON.id)).toBe(false);
  });

  it('摆放空地：盖在上面的高建筑被找出来', () => {
    expect(occluders(ITEMS, 7, 4, 2, hit).has(1)).toBe(true);
    expect(occluders(ITEMS, 18, 18, 2, hit).size).toBe(0);
  });
});

describe('渐隐', () => {
  it('按时间走，不越过目标；减少动效直接到位', () => {
    expect(fadeStep(1, 0.35, 14, false, 140)).toBeCloseTo(0.9);
    expect(fadeStep(0.4, 0.35, 140, false, 140)).toBe(0.35);
    expect(fadeStep(0.5, 1, 14, false, 140)).toBeCloseTo(0.6);
    expect(fadeStep(1, 0.35, 1, true)).toBe(0.35);
  });
});
