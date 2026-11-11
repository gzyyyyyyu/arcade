/**
 * 手牌的纯逻辑（电脑操作）：右键不选牌、斗地主横排的位置、快捷键的按键表。不起浏览器、不碰 Phaser。
 */
import { describe, expect, it } from 'vitest';
import { createDdz } from '../../src/variants/doudizhu/index.ts';
import { DDZ_ORDER } from '../../src/view/doudizhu/view.ts';
import { FLAT_MIN_STEP, downAction, flatLayout } from '../../src/view/table/hand-logic.ts';
import { SHORTCUT_HELP, actionOf } from '../../src/view/ui/shortcuts.ts';
import { worldWidthFor } from '../../src/view/common/theme.ts';

/** 手牌一张牌的宽（table/card.ts 的 HAND_W；那边带着 Phaser，纯逻辑测试不导入） */
const HAND_W = 92;

const sel = (...c: number[]): ReadonlySet<number> => new Set(c);

describe('鼠标按下手牌', () => {
  const base = { allowed: null, single: false };

  it('左键点没选的牌：开始拖选并选上；点已选的：取消', () => {
    expect(downAction({ ...base, right: false, hit: 5, selected: sel() })).toEqual({ kind: 'drag', card: 5, on: true });
    expect(downAction({ ...base, right: false, hit: 5, selected: sel(5) })).toEqual({ kind: 'drag', card: 5, on: false });
  });

  it('左键点空白什么也不做', () => {
    expect(downAction({ ...base, right: false, hit: null, selected: sel(1) })).toEqual({ kind: 'none' });
  });

  it('右键点没选的牌：不选上（以前会选上）', () => {
    expect(downAction({ ...base, right: true, hit: 5, selected: sel() })).toEqual({ kind: 'none' });
    expect(downAction({ ...base, right: true, hit: 5, selected: sel(1, 2) })).toEqual({ kind: 'none' });
  });

  it('右键点已选的牌：只取消这一张', () => {
    expect(downAction({ ...base, right: true, hit: 5, selected: sel(5, 6) })).toEqual({ kind: 'deselect', card: 5 });
  });

  it('右键点空白：有选牌取消全部，没有就不动', () => {
    expect(downAction({ ...base, right: true, hit: null, selected: sel(5, 6) })).toEqual({ kind: 'clear' });
    expect(downAction({ ...base, right: true, hit: null, selected: sel() })).toEqual({ kind: 'none' });
  });

  it('进贡 / 还贡（只许选一张）：左键换成这一张，点已选的取消；压暗的牌左右键都不理', () => {
    const o = { allowed: sel(5, 6), single: true };
    expect(downAction({ ...o, right: false, hit: 6, selected: sel(5) })).toEqual({ kind: 'set', cards: [6] });
    expect(downAction({ ...o, right: false, hit: 6, selected: sel(6) })).toEqual({ kind: 'set', cards: [] });
    expect(downAction({ ...o, right: false, hit: 9, selected: sel() })).toEqual({ kind: 'none' });
    expect(downAction({ ...o, right: true, hit: 9, selected: sel(9) })).toEqual({ kind: 'none' });
    expect(downAction({ ...o, right: true, hit: 6, selected: sel(6) })).toEqual({ kind: 'deselect', card: 6 });
  });
});

describe('斗地主手牌横排', () => {
  const o = { cardW: HAND_W, margin: 26, maxStep: 76, gap: 12 };
  const widths = [1280, 1558, 1720];

  it('20 张一行放下：每张露出不少于 32、都在世界宽度以内、从左到右不回头', () => {
    for (const W of widths) {
      for (const gap of [0, 12]) {
        const groups = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];
        const { xs, step } = flatLayout(groups, W, { ...o, gap });
        expect(xs.length).toBe(20);
        for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeGreaterThanOrEqual(FLAT_MIN_STEP);
        expect(step).toBeGreaterThanOrEqual(FLAT_MIN_STEP);
        expect(xs[0]! - HAND_W / 2).toBeGreaterThanOrEqual(0);
        expect(xs[19]! + HAND_W / 2).toBeLessThanOrEqual(W);
      }
    }
  });

  it('手机横屏 667×375（世界最窄）：20 张换成 CSS 像素每张露出 ≥ 28，按牌型的空隙会让位', () => {
    const W = worldWidthFor(667, 375);
    const k = 375 / 720;
    const { step } = flatLayout([4, 4, 4, 4, 1, 1, 1, 1], W, o);
    expect(step * k).toBeGreaterThanOrEqual(28);
  });

  it('张数少时不拉太开，整排居中', () => {
    const { xs, step } = flatLayout([2, 2, 1], 1280, { ...o, gap: 0 });
    expect(step).toBe(o.maxStep);
    expect((xs[0]! + xs[4]!) / 2).toBeCloseTo(640);
  });

  it('组与组之间留空隙，一张牌的手不除零', () => {
    const { xs, gap } = flatLayout([1, 1], 1280, o);
    expect(gap).toBe(12);
    expect(xs[1]! - xs[0]!).toBe(o.maxStep + 12);
    expect(flatLayout([1], 1280, o).xs).toEqual([640]);
    expect(flatLayout([], 1280, o).xs).toEqual([]);
  });

  it('斗地主给 HandView 的是横排，分组覆盖每张牌一次', () => {
    expect(DDZ_ORDER.flat).toBe(true);
    for (const mode of ['rank', 'type'] as const) {
      const hand = createDdz('flat-a').state.hands[0]!;
      const groups = DDZ_ORDER.columns(hand, 0, mode, Number.MAX_SAFE_INTEGER);
      expect(groups.flat().sort((a, b) => a - b)).toEqual([...hand].sort((a, b) => a - b));
    }
  });
});

describe('快捷键', () => {
  it('按键对应的动作', () => {
    expect(actionOf(' ')).toBe('play');
    expect(actionOf('Enter')).toBe('play');
    expect(actionOf('b')).toBe('pass');
    expect(actionOf('B')).toBe('pass');
    expect(actionOf('h')).toBe('hint');
    expect(actionOf('S')).toBe('sort');
    expect(actionOf('Escape')).toBe('clear');
  });

  it('Tab 和方向键归 focus.ts，不在这里', () => {
    for (const k of ['Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'x', '1']) expect(actionOf(k), k).toBeNull();
  });

  it('规则页的说明覆盖每个键', () => {
    const text = SHORTCUT_HELP.map((r) => r.keys).join('|');
    for (const k of ['空格', '回车', 'B', 'H', 'S', 'Esc', '右键', 'Tab']) expect(text, k).toContain(k);
  });
});
