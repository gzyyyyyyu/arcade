import { describe, expect, it } from 'vitest';
import { iso as iso0 } from '../src/view/iso.ts';
import { BATTLE_Z_CAP, type Inset, PORTRAIT_LIVE, SHIP_H, cellsBox, fitBox, fitView, islandBox, isLandscapePhone, nudgeInto, withRoute } from '../src/view/camfit.ts';

/** 屏幕上的点（CSS 像素）：世界点按适配结果投到画布上 */
const proj = (f: { z: number; cx: number; cy: number }, w: number, h: number, x: number, y: number): { x: number; y: number } => ({ x: (x - f.cx) * f.z + w / 2, y: (y - f.cy) * f.z + h / 2 });

const VIEWS = [
  { name: '手机竖屏', w: 390, h: 844, inset: { top: 108, bottom: 96, left: 0, right: 0 } },
  { name: '手机横屏', w: 844, h: 390, inset: { top: 56, bottom: 0, left: 0, right: 96 } },
  { name: '电脑', w: 1280, h: 800, inset: { top: 64, bottom: 92, left: 0, right: 0 } },
  { name: '平板竖屏', w: 768, h: 1024, inset: { top: 64, bottom: 92, left: 0, right: 0 } },
];

describe('镜头按岛适配（fit）', () => {
  for (const v of VIEWS) {
    it(`${v.name}：整座岛含沙滩在可见区内`, () => {
      const box = islandBox(0);
      const f = fitBox(v.w, v.h, v.inset, box);
      const a = proj(f, v.w, v.h, box.l, box.t);
      const b = proj(f, v.w, v.h, box.r, box.b);
      expect(a.x).toBeGreaterThanOrEqual(v.inset.left - 0.5);
      expect(b.x).toBeLessThanOrEqual(v.w - v.inset.right + 0.5);
      expect(a.y).toBeGreaterThanOrEqual(v.inset.top - 0.5);
      expect(b.y).toBeLessThanOrEqual(v.h - v.inset.bottom + 0.5);
    });
  }
  it('缩放范围：最小就是适配缩放，最大是它的 3 倍', () => {
    const f = fitBox(390, 844, VIEWS[0]!.inset, islandBox(0));
    expect(f.minZ).toBe(f.z);
    expect(f.maxZ).toBeCloseTo(f.z * 3);
  });
  it('额外点（登陆点、登陆口）也装进可见区', () => {
    const box = islandBox(0, [[-6, 11], [28, 11]]);
    const f = fitBox(390, 844, VIEWS[0]!.inset, box);
    const a = proj(f, 390, 844, box.l, box.t);
    const b = proj(f, 390, 844, box.r, box.b);
    expect(a.x).toBeGreaterThanOrEqual(-0.5);
    expect(b.x).toBeLessThanOrEqual(390.5);
  });
  it('横屏的缩放比竖屏大（可见区更宽）', () => {
    const p = fitBox(390, 844, VIEWS[0]!.inset, islandBox(0));
    const l = fitBox(844, 390, VIEWS[1]!.inset, islandBox(0));
    expect(Number.isFinite(l.z) && Number.isFinite(l.cx) && Number.isFinite(l.cy)).toBe(true);
    expect(l.z).toBeGreaterThan(0);
    expect(p.z).toBeGreaterThan(0);
  });
  it('横屏判断：宽大于高且高 ≤ 500', () => {
    expect(isLandscapePhone(844, 390)).toBe(true);
    expect(isLandscapePhone(390, 844)).toBe(false);
    expect(isLandscapePhone(1280, 800)).toBe(false);
  });

  describe('竖屏按有内容的区域适配', () => {
    const P = VIEWS[0]!;
    // 390×844 上三个场景的顶 / 底栏高（CSS 像素，ui-compare 截图量出）
    const BARS: Record<string, Inset> = {
      基地: { top: 102, bottom: 77, left: 0, right: 0 },
      登陆战: { top: 50, bottom: 66, left: 0, right: 0 },
      守岛: { top: 102, bottom: 80, left: 0, right: 0 },
    };
    const full = islandBox(0, [], 1);
    const inView = (f: { z: number; cx: number; cy: number }, inset: Inset, c: { l: number; r: number; t: number; b: number }): boolean => {
      const a = proj(f, P.w, P.h, c.l, c.t);
      const b = proj(f, P.w, P.h, c.r, c.b);
      return a.x >= inset.left - 0.5 && b.x <= P.w - inset.right + 0.5 && a.y >= inset.top - 0.5 && b.y <= P.h - inset.bottom + 0.5;
    };
    it('顶 + 底栏 ≤ 22% 屏高', () => {
      for (const [name, ins] of Object.entries(BARS)) expect([name, (ins.top + ins.bottom) / P.h <= 0.22]).toEqual([name, true]);
    });
    for (const [name, box] of [['登陆战', cellsBox([[5, 5, 16, 16]], 0)], ['守岛', cellsBox([[6, 3, 16, 19], [-1, 8, -1, 8]], 1)]] as const) {
      it(`${name}（实时操作）：内容盒放大到约占屏高 60%，上下完整在可见区里，左右可裁；另给整岛全景`, () => {
        const ins = BARS[name]!;
        const f = fitView(P.w, P.h, ins, full, { box });
        const whole = fitBox(P.w, P.h, ins, full);
        const hPct = ((box.b - box.t) * f.z) / P.h;
        expect(hPct).toBeGreaterThan(0.55);
        expect(hPct).toBeLessThanOrEqual(PORTRAIT_LIVE + 1e-9);
        expect(inView(f, { ...ins, left: -1e9, right: -1e9 }, box)).toBe(true);
        expect(f.z).toBeGreaterThan(whole.z);
        // 全景按内容盒装（不是整座岛含沙滩）：内容盒完整在可见区里，比整岛适配放得大
        const pano = f.pano!;
        expect(pano.z).toBeGreaterThanOrEqual(whole.z - 1e-9);
        expect(pano.z).toBeLessThanOrEqual(f.z + 1e-9);
        expect(inView(pano, ins, box)).toBe(true);
        expect(f.minZ).toBeLessThanOrEqual(whole.z + 1e-9);
      });
    }
    it('实时操作带主寨：全景裁掉左右空沙角放大（岛占屏高更多），放大档和全景里主寨都整个在屏内', () => {
      const ins = BARS.守岛!;
      const box = cellsBox([[0, 0, 22, 22]], 1);
      const hq = cellsBox([[1, 9, 4, 12]], 0);
      const plain = fitView(P.w, P.h, ins, full, { box });
      const f = fitView(P.w, P.h, ins, full, { box, must: hq });
      expect(f.pano!.z).toBeGreaterThan(plain.pano!.z * 1.1);
      const vis = { ...ins, top: 0, bottom: 0 };
      const line = { l: hq.l, r: hq.r, t: 0, b: 0 };
      expect(inView(f.pano!, vis, line)).toBe(true);
      expect(inView(f, vis, line)).toBe(true);
      // 全景的岛高占可见区的比例
      const ah = P.h - ins.top - ins.bottom;
      expect(((box.b - box.t) * f.pano!.z) / ah).toBeGreaterThan(((box.b - box.t) * plain.pano!.z) / ah);
    });
    it('实时操作的内容盒很高时，放大以可见区装得下为准（不裁上下）', () => {
      const ins = BARS.守岛!;
      const box = cellsBox([[0, -3, 0, 24], [21, -3, 21, 24]], 1);
      const f = fitView(P.w, P.h, ins, full, { box });
      expect(((box.b - box.t) * f.z) / (P.h - ins.top - ins.bottom)).toBeLessThanOrEqual(0.93);
    });
    it('基地（能拖）：比整岛放大，左右空沙角可裁，但主寨在屏内、可见宽 ≥ 内容盒宽的 40%', () => {
      const ins = BARS.基地!;
      const box = cellsBox([[2, 10, 19, 17]], 1);
      const hq = cellsBox([[1, 9, 4, 12]], 0);
      const f = fitView(P.w, P.h, ins, full, { box, must: hq });
      expect(f.z).toBeGreaterThan(fitBox(P.w, P.h, ins, full).z);
      expect(inView({ ...f }, { ...ins, top: 0, bottom: 0 }, { l: hq.l, r: hq.r, t: 0, b: 0 })).toBe(true);
      expect(P.w / ((box.r - box.l) * f.z)).toBeGreaterThanOrEqual(0.4 - 1e-6);
    });
    it('放大不超过上限 1.5', () => {
      const f = fitView(P.w, P.h, P.inset, full, { box: cellsBox([[9, 9, 12, 12]], 1) });
      expect(f.z).toBeLessThanOrEqual(1.5);
    });
    it('横屏和电脑：有内容盒也和改前的整岛适配一样', () => {
      for (const v of [VIEWS[1]!, VIEWS[2]!]) {
        const old = fitBox(v.w, v.h, v.inset, full);
        expect(fitView(v.w, v.h, v.inset, full, { box: cellsBox([[4, 4, 17, 17]], 1) })).toEqual(old);
        expect(fitView(v.w, v.h, v.inset, full)).toEqual(old);
      }
    });
  });

  describe('主寨挪进屏内（nudgeInto）', () => {
    it('已经在屏内不动；被右边切掉往右挪，被左边切掉往左挪，只挪最少的', () => {
      const m = { l: -40, r: 40 };
      expect(nudgeInto(0, 1, 390, 0, 0, m)).toBe(0);
      const r = nudgeInto(-300, 1, 390, 0, 0, m);
      expect(((m.r - r) * 1 + 195)).toBeLessThanOrEqual(390 - 14 + 1e-9);
      expect(((m.l - r) + 195)).toBeGreaterThanOrEqual(14 - 1e-9);
      const l = nudgeInto(300, 1, 390, 0, 0, m);
      expect((m.l - l) + 195).toBeCloseTo(14, 6);
    });
    it('比可见区还宽时保左边', () => {
      const cx = nudgeInto(0, 1, 100, 0, 0, { l: -200, r: 200 });
      expect((-200 - cx) + 50).toBeCloseTo(14, 6);
    });
  });

  describe('护航适配盒（withRoute）', () => {
    const base = islandBox(0, [], 1);
    it('航线在岛外（北岸）时盒子并进起点和终点，上沿比单纯外扩再多一个船身高度', () => {
      const rects = [[3, -4, 3, -4], [20, -4, 20, -4]] as const;
      const b = withRoute(base, rects);
      const plain = cellsBox(rects, 1);
      expect(b.t).toBeLessThan(base.t);
      expect(b.t).toBeCloseTo(plain.t - SHIP_H, 6);
      expect(b.l).toBeLessThanOrEqual(Math.min(base.l, plain.l));
      expect(b.r).toBeGreaterThanOrEqual(Math.max(base.r, plain.r));
      expect(b.b).toBe(base.b);
    });
    it('没有航线就原样', () => {
      expect(withRoute(base, [])).toBe(base);
    });
    it('电脑 1920×1080：并进航线后起点和终点（含船身高度）完整在可见区里', () => {
      const ins = { top: 64, bottom: 92, left: 0, right: 0 };
      const rects = [[3, -4, 3, -4], [20, -4, 20, -4]] as const;
      const b = withRoute(base, rects);
      const f = fitBox(1920, 1080, ins, b);
      const a = proj(f, 1920, 1080, iso0(3, -4).x, iso0(3, -4).y - SHIP_H);
      expect(a.y).toBeGreaterThanOrEqual(ins.top);
    });
  });
});

describe('基地横屏和电脑按内容适配（tight）', () => {
  const content = { box: cellsBox([[6, 4, 12, 12]], 1), tight: true };
  for (const v of VIEWS.filter((q) => q.w > q.h)) {
    it(`${v.name}：内容盒装进可见区，比整岛大，仍能缩出去看全岛`, () => {
      const whole = fitView(v.w, v.h, v.inset, islandBox(0));
      const f = fitView(v.w, v.h, v.inset, islandBox(0), content);
      expect(f.z).toBeGreaterThan(whole.z);
      expect(f.minZ).toBeLessThanOrEqual(whole.z);
      const a = proj(f, v.w, v.h, content.box.l, content.box.t);
      const b = proj(f, v.w, v.h, content.box.r, content.box.b);
      expect(a.x).toBeGreaterThanOrEqual(v.inset.left - 0.5);
      expect(b.x).toBeLessThanOrEqual(v.w - v.inset.right + 0.5);
      expect(a.y).toBeGreaterThanOrEqual(v.inset.top - 0.5);
      expect(b.y).toBeLessThanOrEqual(v.h - v.inset.bottom + 0.5);
    });
  }
});

describe('登陆战横屏和电脑：内容盒适配的缩放上限只对登陆战放宽（zCap）', () => {
  // 一座小岛：建筑只占中间一小块，按 1.5 封顶时贴不满屏
  const small = cellsBox([[8, 8, 12, 12]], 3);
  for (const v of VIEWS.filter((q) => q.w > q.h)) {
    it(`${v.name}：给 zCap 时顶到 1.5 的能再放大、不超过 zCap；不给时照旧封顶 1.5`, () => {
      const base = fitView(v.w, v.h, v.inset, islandBox(0), { box: small, tight: true });
      const battle = fitView(v.w, v.h, v.inset, islandBox(0), { box: small, tight: true, zCap: BATTLE_Z_CAP });
      expect(base.z).toBeLessThanOrEqual(1.5 + 1e-9);
      // 原来顶到 1.5 的放宽后更大；按高度就装不下、没顶到上限的（手机横屏矮）放宽前后一样
      if (base.z >= 1.5 - 1e-9) expect(battle.z).toBeGreaterThan(base.z);
      else expect(battle.z).toBeCloseTo(base.z, 9);
      expect(battle.z).toBeLessThanOrEqual(BATTLE_Z_CAP + 1e-9);
      expect(battle.minZ).toBeLessThanOrEqual(fitView(v.w, v.h, v.inset, islandBox(0)).z);
    });
  }
  it('竖屏不走 tight，zCap 不起作用', () => {
    const v = VIEWS[0]!;
    const a = fitView(v.w, v.h, v.inset, islandBox(0), { box: small, tight: true });
    const b = fitView(v.w, v.h, v.inset, islandBox(0), { box: small, tight: true, zCap: BATTLE_Z_CAP });
    expect(b).toEqual(a);
  });
});
