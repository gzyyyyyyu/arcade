import { describe, expect, it } from 'vitest';
import { pageCount, perPage } from '../src/features/fit/fit-logic';

describe('按高度翻页的算术（src/features/fit/Fit.tsx）', () => {
  it('一页放几条：按整行算，至少一行；网格按列数成倍', () => {
    expect(perPage(400, 44, 8, 1)).toBe(7); // (400 + 8) / 52 = 7.8
    expect(perPage(30, 44, 8, 1)).toBe(1); // 一行都放不下也给一行，别变成 0 条
    expect(perPage(500, 100, 16, 4)).toBe(16); // 4 行 × 4 列
    expect(perPage(400, 0, 8, 2)).toBe(2); // 还没量到条目高：先一行
  });

  it('一共几页：空列表也是一页，一页条数不足 1 按 1 算', () => {
    expect(pageCount(0, 5)).toBe(1);
    expect(pageCount(10, 5)).toBe(2);
    expect(pageCount(11, 5)).toBe(3);
    expect(pageCount(3, 0)).toBe(3);
  });
});
