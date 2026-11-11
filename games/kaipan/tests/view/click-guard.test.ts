import { describe, expect, it } from 'vitest';
import { cancelPress, pressCancelled, samePress, usesHitPad } from '../../src/view/ui/clickGuard.ts';

/** 按钮松手判定（src/view/ui/clickGuard.ts）：不点穿，但按钮在按下到松手之间重建时点击不丢。 */
describe('同一次按下', () => {
  const down = { id: 1, downTime: 500, x: 100, y: 200, w: 120, h: 40 };

  it('按钮重建在原位（或悬停抬起挪了几像素）：算同一个按钮', () => {
    expect(samePress(down, { id: 1, downTime: 500 }, { x: 100, y: 200, w: 120, h: 40 })).toBe(true);
    expect(samePress(down, { id: 1, downTime: 500 }, { x: 98, y: 190, w: 124, h: 41 })).toBe(true);
  });

  it('按在别处、松手落到另一个按钮上：不算', () => {
    expect(samePress(down, { id: 1, downTime: 500 }, { x: 100, y: 330, w: 120, h: 40 })).toBe(false);
    expect(samePress(null, { id: 1, downTime: 500 }, { x: 100, y: 200, w: 120, h: 40 })).toBe(false);
  });

  it('不是同一次按下（别的指针、后来又按了一次）：不算', () => {
    expect(samePress(down, { id: 2, downTime: 500 }, { x: 100, y: 200, w: 120, h: 40 })).toBe(false);
    expect(samePress(down, { id: 1, downTime: 900 }, { x: 100, y: 200, w: 120, h: 40 })).toBe(false);
  });
});

describe('长按作废', () => {
  it('长按出了说明的那一下作废，下一次按下不受影响', () => {
    cancelPress({ id: 1, downTime: 700 });
    expect(pressCancelled({ id: 1, downTime: 700 })).toBe(true);
    expect(pressCancelled({ id: 1, downTime: 800 })).toBe(false);
  });
});

describe('hitPad 生效条件', () => {
  it('点击区被撑出按钮的触屏设备（手机、省内存平板）用，电脑不用', () => {
    expect(usesHitPad(56, true)).toBe(true);
    expect(usesHitPad(50, true)).toBe(true);
    expect(usesHitPad(0, true)).toBe(false);
    expect(usesHitPad(56, false)).toBe(false);
  });
});
