import { describe, expect, it } from 'vitest';
import { GAMES } from '../shared/games.ts';
import { boardTabs, podiumSplit } from '../src/pages/boards/boards-logic.ts';

describe('排行页页签', () => {
  const tabs = boardTabs(GAMES);
  it('总榜在第一个，其余是接了钱包或有代表性每日榜（featuredDaily）的可玩游戏', () => {
    expect(tabs[0]!.id).toBe('total');
    for (const t of tabs.slice(1)) expect(t.daily !== null || t.weekly !== null).toBe(true);
    // 接了钱包就开页签（海岛只有本周净赢）；没钱包又没代表性每日榜的不开
    const haidao = tabs.find((t) => t.id === 'haidao');
    expect(haidao?.weekly).toBe('haidao');
    expect(haidao?.daily).toBeNull();
    expect(tabs.some((t) => t.id === 'racing' || t.id === 'danli')).toBe(false);
  });
  it('featuredDaily 必须是这个游戏登记过的每日子榜（写错了排行页会悄悄少一个页签）', () => {
    for (const g of GAMES.filter((x) => x.featuredDaily)) {
      expect(Array.isArray(g.daily) && g.daily.some((d) => d.id === g.featuredDaily), g.id).toBe(true);
    }
  });
  it('每个游戏最多一个每日榜，就是登记的 featuredDaily', () => {
    for (const g of GAMES.filter((x) => x.featuredDaily)) expect(tabs.find((t) => t.id === g.id)?.daily?.sub?.id).toBe(g.featuredDaily);
  });
});

describe('领奖台', () => {
  const r = (rank: number) => ({ rank });
  it('第二、第一、第三从左到右，其余进列表', () => {
    const s = podiumSplit([r(1), r(2), r(3), r(4)], false);
    expect(s.stand.map((x) => x.rank)).toEqual([2, 1, 3]);
    expect(s.rest.map((x) => x.rank)).toEqual([4]);
  });
  it('不满三个人不站台子，全进列表', () => {
    expect(podiumSplit([r(1)], false)).toEqual({ stand: [], top: [], rest: [r(1)] });
    expect(podiumSplit([r(1), r(2)], false).stand).toHaveLength(0);
    // 并列第一占了两个名次，第三个人排第 3：照样站台子
    expect(podiumSplit([r(1), r(1), r(3)], false).stand.map((x) => x.rank)).toEqual([1, 1, 3]);
  });
  it('矮屏不站台子，全进列表', () => {
    expect(podiumSplit([r(1), r(2)], true).rest).toHaveLength(2);
  });
});
