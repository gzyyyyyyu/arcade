import { describe, expect, it } from 'vitest';
import { packPages, pageCount, perPage } from '../src/features/fit/fit-logic';

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

  it('高矮不一的条目按实际高度装页：矮的多装、高的单独一页，每页至少一条', () => {
    // 邀请码竖屏：一般码 50 高，带长名字的用过码 85 高；框 200、翻页条占 50
    expect(packPages([50, 85, 50, 50, 50], 400, 148, 0)).toEqual([0]);
    expect(packPages([50, 85, 50, 50, 50], 200, 150, 0)).toEqual([0, 2]);
    expect(packPages([50, 50, 50, 50], 150, 120, 8)).toEqual([0, 2]);
    // 一条比整页还高：自己一页，不卡死
    expect(packPages([300, 40, 40], 200, 150, 0)).toEqual([0, 1]);
    expect(packPages([], 100, 50, 0)).toEqual([0]);
  });
});
