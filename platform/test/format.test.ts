/** 数字写法（src/lib/format.ts）：整数自己加千分位，要和 zh-CN 的 toLocaleString 一模一样 */
import { describe, expect, it } from 'vitest';
import { num, signed } from '../src/lib/format';

describe('num', () => {
  it('整数和 zh-CN 的 toLocaleString 一样：0、个位、千、百万、负数、余额上限', () => {
    for (const n of [0, 7, 999, 1_000, 12_345, -12_345, 100_000, 2_000_000, -1, 1_000_000_000_000, Number.MAX_SAFE_INTEGER]) {
      expect(num(n)).toBe(n.toLocaleString('zh-CN'));
    }
  });

  it('不是整数的照旧交给 toLocaleString', () => {
    expect(num(1234.5)).toBe((1234.5).toLocaleString('zh-CN'));
    expect(signed(1_500)).toBe('+1,500');
  });
});
