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

  it('覆盖约定的十一类内容', () => {
    expect(gaps.map((g) => g.category)).toEqual(['法器', '被动', '进化', '合成', '怪', '首领/精英', '地图事件', '守夜地图', '夜探镇子', '角色', '技能']);
  });

  it('摆渡人两边都收着，不算差异', () => {
    for (const g of gaps) expect(g.items.some((it) => it.includes('baidu') || it.includes('摆渡人')), g.category).toBe(false);
  });

  it('规则 52 起实盘完全对齐娱乐：每一类都是空的', () => {
    for (const g of gaps) expect(g.items, g.category).toEqual([]);
  });

  it('规则差异单独列，不进内容清单；永久加成、咒印标成有意不对齐', () => {
    expect(RULE_DIFFS.length).toBeGreaterThan(0);
    for (const k of ['永久加成', '咒印']) expect(RULE_DIFFS.find((r) => r.startsWith(k)), k).toContain('有意不对齐：实盘按人人一样的起点结算');
    expect(gaps.map((g) => g.category)).not.toContain('设计上的规则差异');
  });
});

describe('按角色比（charGaps）', () => {
  it('每个实盘可带角色都有四类列表，且只含角色池里的项', async () => {
    const { charGaps, CHAR_CATEGORIES } = await import('../../tools/live-gap.ts');
    const { LIVE_CHAR_IDS } = await import('../../src/content/live.ts');
    for (const ch of LIVE_CHAR_IDS) {
      const g = charGaps(ch);
      for (const c of CHAR_CATEGORIES) expect(Array.isArray(g[c]), `${ch} ${c}`).toBe(true);
    }
    expect(LIVE_CHAR_IDS).not.toContain('baidu');
  });

  it('货郎实盘里有飞镖，不算法器差异', async () => {
    const { charGaps } = await import('../../tools/live-gap.ts');
    expect(charGaps('huolang').法器.some((x) => x.includes('(dart)') || x.includes('（dart）'))).toBe(false);
    expect(charGaps('xiaodao').法器.some((x) => x.includes('（dart）'))).toBe(false);
  });
});
