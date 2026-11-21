import { describe, expect, it } from 'vitest';
import { liveGaps, RULE_DIFFS } from '../../tools/live-gap.ts';

describe('实盘缺口清单（tools/live-gap.ts）', () => {
  const gaps = liveGaps();

  it('能跑，结构对：每类有中文名和 id 字符串列表', () => {
    expect(gaps.length).toBeGreaterThan(0);
    const names = gaps.map((g) => g.category);
    expect(new Set(names).size).toBe(names.length);
    for (const g of gaps) {
      expect(g.category).toMatch(/\S/);
      expect(Array.isArray(g.items)).toBe(true);
      for (const it of g.items) expect(typeof it).toBe('string');
    }
  });

  it('覆盖约定的六类内容', () => {
    expect(gaps.map((g) => g.category)).toEqual(['怪', '首领/精英', '地图事件', '守夜地图', '夜探镇子', '角色']);
  });

  it('实盘完全对齐娱乐：每一类都是空的', () => {
    for (const g of gaps) expect(g.items, g.category).toEqual([]);
  });

  it('规则差异单独列，不进内容清单；永久加成、咒印标成有意不对齐', () => {
    expect(RULE_DIFFS.length).toBeGreaterThan(0);
    for (const k of ['永久加成', '咒印']) expect(RULE_DIFFS.find((r) => r.startsWith(k)), k).toContain('有意不对齐：实盘按人人一样的起点结算');
    expect(gaps.map((g) => g.category)).not.toContain('设计上的规则差异');
  });
});
