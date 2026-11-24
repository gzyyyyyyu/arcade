/** 牌桌的摆位（docs/screens.md 8.2）：下注的筹码离座位远近一致、不压公共牌（美术 v3 第 3 步） */
import { describe, expect, it } from 'vitest';
import { betPos, boardPos, buttonPos, dealerSpots, felt, fit, isCompact, potPos, seatPos, STAGE_MAX_W, STAGE_MIN_W, type Geo } from '../../src/view/layout.ts';

/** 公共牌一张 58 × 82（按中心摆） */
const CARD_W = 58;
const CARD_H = 82;

describe('横屏下注位置', () => {
  for (const w of [STAGE_MIN_W, 960, STAGE_MAX_W]) {
    const g: Geo = { w, h: 540, tall: false };
    for (let size = 2; size <= 9; size++) {
      it(`宽 ${w}、${size} 人：别人的下注离座位 90–130，不压公共牌`, () => {
        const f = felt(g);
        const left = boardPos(g, 0).x - CARD_W / 2;
        const right = boardPos(g, 4).x + CARD_W / 2;
        const top = boardPos(g, 0).y - CARD_H / 2;
        const bottom = boardPos(g, 0).y + CARD_H / 2;
        for (let seat = 1; seat < size; seat++) {
          const p = seatPos(seat, 0, size, g);
          const b = betPos(p, g, false);
          const d = Math.hypot(b.x - p.x, b.y - 6 - p.y);
          expect(d).toBeGreaterThanOrEqual(90 - 1e-9);
          expect(d).toBeLessThanOrEqual(130 + 1e-9);
          // 筹码那一摞连数字约 70 × 30（中心往左右各 35、上下各 15）
          const hits = b.x + 35 > left && b.x - 35 < right && b.y + 15 > top && b.y - 15 < bottom;
          expect(hits, `座位 ${seat} 的下注 (${b.x.toFixed(0)}, ${b.y.toFixed(0)}) 压到公共牌`).toBe(false);
          // 在桌子里面（椭圆内）
          expect(((b.x - f.cx) / f.rx) ** 2 + ((b.y - f.cy) / f.ry) ** 2).toBeLessThan(1);
        }
      });
    }
  }
});

describe('荷官能站的地方', () => {
  it('竖屏没有', () => {
    expect(dealerSpots({ w: 540, h: 960, tall: true }, 6)).toEqual([]);
  });
  for (const w of [STAGE_MIN_W, 960, STAGE_MAX_W]) {
    const g: Geo = { w, h: 540, tall: false };
    for (let size = 2; size <= 9; size++) {
      it(`宽 ${w}、${size} 人：都在桌子顶边上，离顶上的座位至少 150（右边 112）`, () => {
        const spots = dealerSpots(g, size);
        if (size <= 6) expect(spots.length, '2–6 人桌至少有一个地方').toBeGreaterThan(0);
        const f = felt(g);
        for (const d of spots) {
          expect(((d.x - f.cx) / f.rx) ** 2 + ((d.y - f.cy) / f.ry) ** 2).toBeCloseTo(1, 6);
          expect(d.y).toBeLessThan(f.cy);
          for (let seat = 0; seat < size; seat++) {
            const p = seatPos(seat, 0, size, g);
            // 座位右边只有底牌，让 112 就够；左边有动作签，要 150
            if (p.y < 200) expect(Math.abs(p.x - d.x)).toBeGreaterThanOrEqual(d.x > p.x ? 112 : 150);
          }
        }
      });
    }
  }
});

describe('竖屏牌桌铺满屏幕', () => {
  /** 桌面（椭圆）高度占屏高的比例：舞台缩放 scale，椭圆高 2·ry 个设计单位 */
  const share = (w: number, h: number): number => {
    // biome-ignore lint/suspicious/noFocusedTests: fit 是 layout.ts 的取景函数，不是 jest 的 fit
    const g = fit(w, h);
    return (2 * felt(g).ry * g.scale) / h;
  };
  it('390×844：桌面高度不小于屏高的 55%（原来 49%，下半屏空着）', () => {
    expect(share(390, 844)).toBeGreaterThanOrEqual(0.55);
  });
  it('各尺寸的竖屏都比原来的版式（桌顶 150、桌底在我的座位上方 100）高', () => {
    for (const [w, h] of [[390, 844], [360, 640], [375, 667], [414, 896], [430, 932]] as const) {
      // biome-ignore lint/suspicious/noFocusedTests: fit 是 layout.ts 的取景函数，不是 jest 的 fit
      const g = fit(w, h);
      expect(g.tall).toBe(true);
      const old = (g.h - 285 - 62 - 100 - 150) * g.scale;
      expect(2 * felt(g).ry * g.scale, `${w}×${h}`).toBeGreaterThan(old);
    }
  });
  for (let size = 2; size <= 9; size++) {
    it(`390×844、${size} 人：座位都在屏幕里，两两间隔够放名牌（水平 ≥ 108 或垂直 ≥ 58），不压公共牌和底池`, () => {
      // biome-ignore lint/suspicious/noFocusedTests: fit 是 layout.ts 的取景函数，不是 jest 的 fit
      const g = fit(390, 844);
      const pts = Array.from({ length: size }, (_, k) => seatPos(k, 0, size, g));
      for (const p of pts) {
        expect(p.x).toBeGreaterThanOrEqual(54);
        expect(p.x).toBeLessThanOrEqual(g.w - 54);
        expect(p.y).toBeGreaterThanOrEqual(40);
      }
      for (let i = 0; i < size; i++) {
        for (let j = i + 1; j < size; j++) {
          const dx = Math.abs(pts[i]!.x - pts[j]!.x);
          const dy = Math.abs(pts[i]!.y - pts[j]!.y);
          expect(dx >= 108 || dy >= 58, `座位 ${i} 和 ${j} 挤在一起 (${dx.toFixed(0)}, ${dy.toFixed(0)})`).toBe(true);
        }
      }
      // 公共牌 5 张（宽 50 高 70，间距 54）加底池条（约 200 × 34）所在的矩形：别人的名牌（108 × 52，座位点下方 26 起）不碰
      const left = boardPos(g, 0).x - 25;
      const right = boardPos(g, 4).x + 25;
      const top = boardPos(g, 0).y - 35;
      const bottom = potPos(g).y + 17;
      for (let k = 1; k < size; k++) {
        const p = pts[k]!;
        const hit = p.x + 54 > left && p.x - 54 < right && p.y + 78 > top && p.y + 26 < bottom;
        expect(hit, `座位 ${k} 的名牌压到公共牌或底池`).toBe(false);
      }
    });
  }
});

describe('矮竖屏（360×640、375×667）5–9 人：每家的格子互不重叠，也不进公共牌和池子', () => {
  /** 一家占的格子：头像、名牌（宽 108，座位点下 26–78）、挨着头像露出一半的底牌（朝桌心那边 66） */
  const box = (p: { x: number; y: number }, cx: number) => ({
    l: p.x <= cx ? p.x - 54 : p.x - 66,
    r: p.x <= cx ? p.x + 66 : p.x + 54,
    t: p.y - 34,
    b: p.y + 78,
  });
  for (const [w, h] of [[360, 640], [375, 667]] as const) {
    for (let size = 5; size <= 9; size++) {
      it(`${w}×${h}、${size} 人`, () => {
        // biome-ignore lint/suspicious/noFocusedTests: fit 是 layout.ts 的取景函数，不是 jest 的 fit
        const g = fit(w, h);
        expect(isCompact(g)).toBe(true);
        const cx = felt(g).cx;
        const boxes = Array.from({ length: size - 1 }, (_, k) => box(seatPos(k + 1, 0, size, g), cx));
        for (const [i, a] of boxes.entries()) {
          expect(a.l, `座位 ${i + 1} 出了左边`).toBeGreaterThanOrEqual(0);
          expect(a.r, `座位 ${i + 1} 出了右边`).toBeLessThanOrEqual(g.w);
          // 公共牌（5 张）和池子那一行（三个池子最宽，约 83–457）
          const potY = potPos(g).y;
          const inBoard = a.r > boardPos(g, 0).x - 25 && a.l < boardPos(g, 4).x + 25 && a.b > boardPos(g, 0).y - 35 && a.t < boardPos(g, 0).y + 35;
          const inPot = a.r > 83 && a.l < 457 && a.b > potY - 16 && a.t < potY + 16;
          expect(inBoard, `座位 ${i + 1} 压到公共牌`).toBe(false);
          expect(inPot, `座位 ${i + 1} 压到池子`).toBe(false);
          for (const [j, b] of boxes.entries()) {
            if (j <= i) continue;
            const hit = a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b && b.t < a.b;
            expect(hit, `座位 ${i + 1} 和 ${j + 1} 的格子重叠`).toBe(false);
          }
        }
      });
    }
  }
  it('高的竖屏（390×844）不用格子', () => {
    // biome-ignore lint/suspicious/noFocusedTests: fit 是 layout.ts 的取景函数，不是 jest 的 fit
    expect(isCompact(fit(390, 844))).toBe(false);
  });
});

describe('横屏庄家按钮 D', () => {
  for (const w of [STAGE_MIN_W, 960, STAGE_MAX_W]) {
    const g: Geo = { w, h: 540, tall: false };
    for (let size = 3; size <= 9; size++) {
      it(`宽 ${w}、${size} 人：两侧座位的 D 在下注筹码上方，不压筹码（手机横屏右下角最容易压）`, () => {
        for (let seat = 1; seat < size; seat++) {
          const p = seatPos(seat, 0, size, g);
          if (p.y < 150) continue;
          const b = betPos(p, g, false);
          const d = buttonPos(p, g, false);
          // 筹码那一摞连数字高约 30（中心上下各 15），D 直径 26
          expect(d.y + 13, `座位 ${seat}`).toBeLessThanOrEqual(b.y - 15 + 1e-9);
        }
      });
    }
  }
});

describe('竖屏操作区让开吧台的深色带', () => {
  it('我的名牌留够 285 + 24 给操作区', () => {
    // biome-ignore lint/suspicious/noFocusedTests: fit 是 layout.ts 的取景函数，不是 jest 的 fit
    const g = fit(390, 844);
    expect(g.tall).toBe(true);
    expect(seatPos(0, 0, 6, g).y).toBe(g.h - 285 - 24 - 62);
  });
});
