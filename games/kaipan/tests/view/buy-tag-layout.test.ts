import { describe, expect, it } from 'vitest';
import { BUY_ROW, buyTagRowHeight } from '../../src/view/trade/buyTagLayout.ts';

describe('买 › 小签布局', () => {
  it('短话放得下时不多留一行', () => {
    expect(buyTagRowHeight(80, 260, 40)).toBe(0);
  });
  it('文字撑到小签位置时多留一行挂在下沿', () => {
    expect(buyTagRowHeight(200, 260, 40)).toBe(BUY_ROW);
  });
  it('窄气泡下同样的文字要多留，宽气泡不用', () => {
    expect(buyTagRowHeight(160, 220, 40)).toBe(BUY_ROW);
    expect(buyTagRowHeight(160, 300, 40)).toBe(0);
  });
});
