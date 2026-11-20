import { describe, expect, it } from 'vitest';
import { MARK_FONT, MARK_MIN_PX, guideVisible, markScale } from '../src/view/padguide.ts';

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

describe('markScale', () => {
  it('镜头缩小时把金圈上的字放大到屏幕上不小于 MARK_MIN_PX，放大时不缩小', () => {
    for (const z of [0.3, 0.4, 0.55, 0.7]) expect(MARK_FONT * z * markScale(z)).toBeGreaterThanOrEqual(MARK_MIN_PX - 1e-9);
    expect(markScale(1)).toBe(1);
    expect(markScale(2)).toBe(1);
    expect(MARK_MIN_PX).toBeGreaterThanOrEqual(12);
  });
});
