import { describe, expect, it } from 'vitest';
import type { Rect } from '../../src/view/rect.ts';
import { phoneWorld, pickPortrait } from '../../src/view/theme.ts';
import { portraitLayout } from '../../src/view/trade/layout.ts';
import { PORTRAIT_TOP_H, portraitTopBar } from '../../src/view/trade/topBarGeo.ts';
import { portraitHome } from '../../src/view/meta/homeGeo.ts';
import { phoneGeo as endGeo } from '../../src/view/end/endGeo.ts';

/** 竖屏版：判定、世界尺寸，以及主页、交易页、顶栏、结束页几何在常见竖屏上不出界、不互相压。 */

const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (r: Rect, W: number, H: number): boolean => r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H;
/** 360×640、390×844、更长的屏（世界高封顶 960） */
const WORLDS = [phoneWorld(360, 640, true), phoneWorld(390, 844, true), phoneWorld(390, 1000, true)];

describe('什么时候用竖屏版', () => {
  const pick = (w: number, h: number, phone = true, search = ''): boolean => pickPortrait({ w, h, phone, search });

  it('手机布局下开局时竖着拿就用竖屏版，横着拿用横屏版', () => {
    expect(pick(390, 844)).toBe(true);
    expect(pick(844, 390)).toBe(false);
  });

  it('电脑布局不用竖屏版（又窄又高的电脑窗口仍是电脑布局）', () => {
    expect(pick(390, 844, false)).toBe(false);
  });

  it('网址参数：layout=portrait 强制竖屏版，layout=phone 仍是横屏版', () => {
    expect(pick(844, 390, true, '?layout=portrait')).toBe(true);
    expect(pick(390, 844, true, '?layout=phone')).toBe(false);
    expect(pick(390, 844, true, '?layout=desktop')).toBe(false);
  });

  it('竖屏世界是横屏世界横竖对调：宽 404，高 718–960', () => {
    expect(phoneWorld(390, 844, true)).toEqual({ w: 404, h: 874 });
    expect(phoneWorld(360, 640, true)).toEqual({ w: 404, h: 718 });
    expect(phoneWorld(390, 1000, true)).toEqual({ w: 404, h: 960 });
  });
});

describe('竖屏主页', () => {
  for (const V of WORLDS) {
    for (const n of [4, 5]) {
      for (const quick of [false, true]) {
        it(`${V.w}×${V.h}、${n} 张模式卡${quick ? '、有继续' : ''}：卡片都在屏里、互不相压，Logo 不压小入口`, () => {
          const G = portraitHome(V.w, V.h, n, quick);
          const boxes = [G.hero, ...G.cards, ...(quick ? [G.quick] : [])];
          for (const b of boxes) expect(inside(b, V.w, V.h)).toBe(true);
          for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i]!, boxes[j]!)).toBe(false);
          expect(G.cards).toHaveLength(n);
          // Logo（字高约 size）的上沿在小入口一排下面；一句玩法在卡片上面
          expect(G.logo.y - G.logo.size / 2).toBeGreaterThan(G.tools.y + G.tools.h);
          expect(G.tagY + 12).toBeLessThan(Math.min(...G.cards.map((c) => c.y)));
        });
      }
    }
  }
});

describe('竖屏交易页', () => {
  for (const V of WORLDS) {
    it(`${V.w}×${V.h}：各块在屏里，顶栏、持仓、标签、群聊、开盘键、小结互不相压`, () => {
      const L = portraitLayout(V.w, V.h);
      const blocks: [string, Rect][] = [['TOP', L.TOP], ['SLOTS', L.SLOTS], ['TABS', L.TABS!], ['PHONE', L.PHONE], ['MONITOR', L.MONITOR], ['OPEN', L.OPEN], ['RECAP', L.RECAP]];
      for (const [, r] of blocks) expect(inside(r, V.w, V.h)).toBe(true);
      for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) expect(overlap(blocks[i]![1], blocks[j]![1]), `${blocks[i]![0]} 和 ${blocks[j]![0]}`).toBe(false);
      expect(L.TOP.h).toBe(PORTRAIT_TOP_H);
      // 群聊那块至少放得下三四条消息；开盘键够大（手指点得到）
      expect(L.PHONE.h).toBeGreaterThanOrEqual(230);
      expect(L.OPEN.h).toBeGreaterThanOrEqual(56);
      expect(L.OPEN.w).toBeGreaterThanOrEqual(140);
    });
  }
});

describe('竖屏顶栏', () => {
  it('两行：第一行大厅、日期、账户、怎么玩、设置不相压；第二行目标和账单、道具栏、银行不相压，都在 404 宽里', () => {
    const T = portraitTopBar(404);
    const row1: Rect[] = [
      { x: T.lobby.x, y: T.lobby.y, w: T.lobby.w, h: T.lobby.h },
      { x: T.calHit.x, y: T.calHit.y, w: T.calHit.w, h: T.calHit.h },
      { x: T.accHit.x, y: T.accHit.y, w: T.accHit.w, h: T.accHit.h },
      T.help,
      T.settings,
    ];
    const row2: Rect[] = [
      { x: T.goalX, y: T.billBox.y, w: T.billRight - T.goalX, h: T.billBox.h },
      { x: T.itemsX, y: T.itemsY, w: T.itemsWExt, h: 40 },
      T.bank,
    ];
    for (const rows of [row1, row2]) {
      for (const r of rows) expect(inside(r, 404, PORTRAIT_TOP_H + 4)).toBe(true);
      for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) expect(overlap(rows[i]!, rows[j]!)).toBe(false);
    }
    // 第二行整个在第一行下面
    expect(Math.min(...row2.map((r) => r.y))).toBeGreaterThanOrEqual(Math.max(...row1.map((r) => r.y + r.h)));
  });
});

describe('竖屏结束页', () => {
  for (const V of WORLDS) {
    it(`${V.w}×${V.h}：一栏，纸卡在屏里，战绩三格一排放得下`, () => {
      const G = endGeo(V);
      expect(G.single).not.toBeNull();
      expect(inside({ x: G.x, y: G.y, w: G.w, h: G.h }, V.w, V.h)).toBe(true);
      expect(G.tw * G.tileCols + G.tileGap * (G.tileCols - 1)).toBeLessThanOrEqual(G.rightW);
      expect(G.mx + G.rightW).toBeLessThanOrEqual(G.w - G.pad + 1);
    });
  }
  it('横屏手机仍是两栏', () => {
    expect(endGeo({ w: 874, h: 404 }).single).toBeNull();
  });
});
