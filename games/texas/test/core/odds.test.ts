/**
 * 跟注提示的赢面（src/fun/odds.ts）：抽样和穷举对得上、同一个局面同一个数、算得够快。
 * 它只给画面用，不进规则核心；真人桌拿不到它见 test/arch.test.ts。
 */
import { describe, expect, it } from 'vitest';
import { parseCards as parse } from '../../src/core/cards.ts';
import { handOdds } from '../../src/fun/odds.ts';
import { combosWithout, exactEquity } from '../../src/puzzle/equity.ts';

/** 'AhKh' 这样连写的牌 */
const parseCards = (s: string) => parse(s.replace(/(..)(?=.)/g, '$1 '));
const pct = (hole: string, board: string, opp: number): number => handOdds(parseCards(hole), parseCards(board), opp) / 10;

describe('跟注提示的赢面', () => {
  it('一对一时和穷举差不到 3 个百分点（翻牌、转牌、河牌）', () => {
    for (const [hole, board] of [
      ['AhKh', '2h7hQc'],
      ['8s8d', 'Ac9c4d'],
      ['5c6c', '7d8hKs2s'],
      ['QsJd', 'Th9s2c3d4h'],
    ] as const) {
      const h = parseCards(hole);
      const b = parseCards(board);
      const exact = exactEquity(h, b, combosWithout([...h, ...b])) * 100;
      expect(Math.abs(pct(hole, board, 1) - exact), `${hole} ${board}`).toBeLessThan(3);
    }
  });

  it('翻牌前和人数：AA 对一家约 85%、对五家约 49%；72 杂色对一家约 35%', () => {
    expect(pct('AsAd', '', 1)).toBeGreaterThan(82);
    expect(pct('AsAd', '', 1)).toBeLessThan(88);
    expect(pct('AsAd', '', 5)).toBeGreaterThan(45);
    expect(pct('AsAd', '', 5)).toBeLessThan(53);
    expect(pct('7c2d', '', 1)).toBeGreaterThan(31);
    expect(pct('7c2d', '', 1)).toBeLessThan(39);
  });

  it('同一个局面永远同一个数（重画不跳）；没有对手、底牌不是两张时报错', () => {
    expect(pct('Td9d', '8d2s', 3)).toBe(pct('Td9d', '8d2s', 3));
    expect(() => handOdds(parseCards('Td9d'), [], 0)).toThrow();
    expect(() => handOdds(parseCards('Td'), [], 1)).toThrow();
  });

  it('够快：9 人桌翻牌前（最慢的情形）和一对一比不过 4 倍（每次轮到我只算一次；实测 1 家 2 ms、8 家 4.5 ms）。和同一台机、同一时刻的一对一比，机器忙不忙不影响结论，只防算法成倍变慢', () => {
    // 先热身几次（JIT），量的是打牌时每次轮到我那一下；两种交替量，负载起伏两边一起吃，再各取最快的一次
    for (let i = 0; i < 5; i++) handOdds([i, i + 20], [], 8);
    const time = (opp: number, i: number): number => {
      const t0 = performance.now();
      handOdds([i % 52, (i + 13) % 52], [], opp);
      return performance.now() - t0;
    };
    const one: number[] = [];
    const nine: number[] = [];
    for (let i = 0; i < 31; i++) {
      one.push(time(1, i));
      nine.push(time(8, i));
    }
    // 比最快的那次：机器忙只会让某几次变慢，最快的那次最接近算法本身的耗时
    expect(Math.min(...nine)).toBeLessThan(4 * Math.min(...one));
  });
});
