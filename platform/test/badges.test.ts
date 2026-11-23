/**
 * 街机厅徽章（src/features/badges/badges.ts）：从战绩现算，纯函数。档位线、空战绩、大厅没登记的游戏 id 不算、牌类/单人/好友房按标签归。
 */
import { describe, expect, it } from 'vitest';
import type { CareerView } from '../src/api';
import { badgesOf, BADGE_COUNT, unlockedCount, type BadgeGame } from '../src/features/badges/badges';
import { GAMES } from '../shared/games';

const career = (o: Partial<CareerView>): CareerView => ({ n: 1, net: 0, wnet: 0, rounds: 0, wins: 0, best: 0, titles: [], max: {}, sum: {}, ...o });
const LIST: BadgeGame[] = [
  { id: 'a', tags: ['牌类', '好友房'], status: 'playable' },
  { id: 'b', tags: ['麻将', '好友房'], status: 'playable' },
  { id: 'c', tags: ['单人'], status: 'playable' },
  { id: 'd', tags: ['单人'], status: 'playable', wallet: false },
  { id: 'e', tags: ['牌类'], status: 'coming' },
];
const pick = (games: Record<string, CareerView>, id: string, list = LIST) => badgesOf(games, list).find((b) => b.id === id)!;

describe('badgesOf', () => {
  it('空战绩：全部在列、全部没拿到，进度写还差多少', () => {
    const all = badgesOf({}, LIST);
    expect(all).toHaveLength(BADGE_COUNT);
    expect(unlockedCount(all)).toBe(0);
    expect(pick({}, 'regular').line).toBe('再打 50 局就拿到');
    expect(pick({}, 'steady').line).toBe('再打 20 局就拿到');
    expect(pick({}, 'all').line).toBe('再在 3 个游戏里各赢一次就拿到');
  });

  it('档位线：刚到线拿到，差一点不算；满档不再有进度', () => {
    const at = (rounds: number) => pick({ a: career({ rounds }) }, 'regular');
    expect(at(49).tier).toBe(0);
    expect(at(49).left).toBe(1);
    expect(at(50).tier).toBe(1);
    expect(at(200).tier).toBe(2);
    expect(at(999).tier).toBe(2);
    expect(at(1000).tier).toBe(3);
    expect(at(1000).left).toBeNull();
    expect(at(1000).line).toBe('金牌');
    expect(at(60).line).toBe('铜牌 · 再打 140 局升银牌');
    expect(at(60).left).toBe(140);
  });

  it('卡上那一行带单位和下一档；说明写每档要多少', () => {
    expect(pick({ a: career({ n: 20 }) }, 'seat').line).toBe('铜牌 · 再上桌 80 次升银牌');
    expect(pick({ a: career({ best: 30 }) }, 'big').line).toBe('单把赢到 10,000 就拿到');
    expect(pick({ a: career({ wnet: 0 }) }, 'hot').line).toBe('本周净赢再多 1 就拿到');
    expect(pick({}, 'seat').how).toBe('带筹码上桌：20 次铜、100 次银、500 次金');
    expect(pick({}, 'sharp').how).toBe('打满 30 局后，总胜率达到：30%铜、40%银、50%金');
  });

  it('跨游戏相加；最大一把取各游戏里最大的；称号数相加', () => {
    const g = { a: career({ wins: 6, best: 12_000, titles: [{ id: 'x', at: 1 }] }), b: career({ wins: 4, best: 9_000, titles: [{ id: 'y', at: 1 }, { id: 'z', at: 2 }] }) };
    expect(pick(g, 'winner').tier).toBe(1);
    expect(pick(g, 'big').value).toBe(12_000);
    expect(pick(g, 'big').tier).toBe(1);
    expect(pick(g, 'titles').value).toBe(3);
    expect(pick(g, 'titles').tier).toBe(1);
    expect(pick(g, 'tour').value).toBe(2);
  });

  it('大厅没登记的游戏 id 不算', () => {
    const g = { ghost: career({ rounds: 5000, wins: 900, best: 1e9, titles: [{ id: 'x', at: 1 }], n: 99 }) };
    const all = badgesOf(g, LIST);
    expect(unlockedCount(all)).toBe(0);
    expect(pick(g, 'tour').value).toBe(0);
  });

  it('本周手热：净赢大于 0 就有铜；亏着没有', () => {
    expect(pick({ a: career({ wnet: 1 }) }, 'hot').tier).toBe(1);
    expect(pick({ a: career({ wnet: 5_000 }), b: career({ wnet: -1_000 }) }, 'hot').tier).toBe(1);
    expect(pick({ a: career({ wnet: 6_000 }), b: career({ wnet: -1_000 }) }, 'hot').tier).toBe(2);
    expect(pick({ a: career({ wnet: -50 }) }, 'hot').tier).toBe(0);
  });

  it('不倒翁：满 20 局且总账不亏；局数够了但亏着，说还差多少筹码回本', () => {
    expect(pick({ a: career({ rounds: 19, net: 100 }) }, 'steady').tier).toBe(0);
    expect(pick({ a: career({ rounds: 20, net: 0 }) }, 'steady').tier).toBe(1);
    const losing = pick({ a: career({ rounds: 30, net: -2_500 }) }, 'steady');
    expect(losing.tier).toBe(0);
    expect(losing.line).toBe('总账再赢回 2,500 筹码就拿到');
  });

  it('神机妙算：局数不够不算比例；够了按总胜率取整', () => {
    expect(pick({ a: career({ rounds: 10, wins: 10 }) }, 'sharp').tier).toBe(0);
    expect(pick({ a: career({ rounds: 10, wins: 10 }) }, 'sharp').line).toBe('再打 20 局才开始算胜率');
    expect(pick({ a: career({ rounds: 100, wins: 35 }) }, 'sharp').line).toBe('铜牌 · 胜率再高 5 个百分点升银牌');
    expect(pick({ a: career({ rounds: 100, wins: 29 }) }, 'sharp').tier).toBe(0);
    expect(pick({ a: career({ rounds: 100, wins: 40 }) }, 'sharp').tier).toBe(2);
    expect(pick({ a: career({ rounds: 100, wins: 50 }) }, 'sharp').tier).toBe(3);
  });

  it('按标签归类：牌类/麻将、单人、好友房、同一个游戏里最多', () => {
    const g = { a: career({ rounds: 60 }), b: career({ rounds: 40 }), c: career({ rounds: 20 }), d: career({ rounds: 5 }) };
    expect(pick(g, 'cards').value).toBe(100);
    expect(pick(g, 'cards').tier).toBe(1);
    expect(pick(g, 'solo').value).toBe(25);
    expect(pick(g, 'solo').tier).toBe(1);
    expect(pick(g, 'room').value).toBe(100);
    expect(pick(g, 'master').value).toBe(60);
  });

  it('全能选手：每个能带筹码的游戏都赢过；不能用钱包的和还没上线的不要求', () => {
    // a、b、c 要求；d（不用钱包）、e（即将上线）不要求
    expect(pick({ a: career({ wins: 1 }), b: career({ best: 5 }) }, 'all').tier).toBe(0);
    expect(pick({ a: career({ wins: 1 }), b: career({ best: 5 }) }, 'all').line).toBe('再在 1 个游戏里各赢一次就拿到');
    expect(pick({ a: career({ wins: 1 }), b: career({ best: 5 }), c: career({ wins: 2 }) }, 'all').tier).toBe(1);
    expect(pick({ a: career({ n: 3 }), b: career({ n: 3 }), c: career({ n: 3 }) }, 'all').tier).toBe(0);
  });

  it('大厅真实登记的游戏：每个徽章的档位线递增、名字不重复', () => {
    const all = badgesOf({}, GAMES);
    expect(new Set(all.map((b) => b.name)).size).toBe(all.length);
    for (const b of all) expect([...b.tiers]).toEqual([...b.tiers].sort((x, y) => x - y));
    expect(all.every((b) => b.tiers.length >= 1 && b.tiers.length <= 3)).toBe(true);
  });

  it('战绩页冒烟里那份假战绩：解锁 10 个', () => {
    const g = {
      texas: career({ n: 4, net: 2_000, wnet: -1_500, rounds: 1_000, wins: 213, best: 18_400, titles: [{ id: 'bluff_king', at: 1 }] }),
      kaipan: career({ n: 2, net: 2_000, wnet: 12_000, rounds: 2, wins: 1, best: 12_000, titles: [{ id: 'a', at: 1 }, { id: 'b', at: 2 }] }),
      mahjong: career({ n: 3, net: 2_000, rounds: 25, wins: 1, best: 12, titles: [{ id: 'c', at: 1 }] }),
    };
    expect(unlockedCount(badgesOf(g, GAMES))).toBe(10);
  });
});
