/** 大场面（src/fun/climax.ts）：补牌时的胜率、大牌庆祝档次、被逆转、池子大小对应的筹码声档次 */
import { describe, expect, it } from 'vitest';
import type { Card } from '../../src/core/cards.ts';
import { evalCards } from '../../src/core/eval.ts';
import type { HandResult } from '../../src/core/table.ts';
import { badBeat, BAD_BEAT, celebration, potTier, runoutEquity } from '../../src/fun/climax.ts';

// 牌 = 点数 * 4 + 花色（点数 0 是 2，12 是 A；花色 0–3）
const c = (rank: string, suit: number): Card => '23456789TJQKA'.indexOf(rank) * 4 + suit;
const cards = (s: string): Card[] => s.split(' ').map((x) => c(x[0]!, 'cdhs'.indexOf(x[1]!)));

function result(shown: { seat: number; hole: string }[], board: string, winner: number): HandResult {
  const b = cards(board);
  return {
    handNo: 1,
    board: b,
    shown: shown.map((x) => {
      const hole = cards(x.hole);
      return { seat: x.seat, hole, value: evalCards([...hole, ...b]) };
    }),
    pots: [{ amount: 1000, winners: [{ seat: winner, won: 1000 }] }],
    uncalled: null,
    byFold: false,
  } as unknown as HandResult;
}

describe('补牌时的胜率', () => {
  it('缺一张牌穷举：AA 对 KK 翻牌后转牌前，胜率合起来 1000 且 AA 远大于 KK', () => {
    const e = runoutEquity([cards('As Ah'), cards('Kd Kc')], cards('2c 7d 9h Js'));
    expect(e[0]! + e[1]!).toBeGreaterThanOrEqual(998);
    expect(e[0]).toBeGreaterThan(900);
  });

  it('河牌都发了：赢家 1000、输家 0，平分各一半', () => {
    expect(runoutEquity([cards('As Ah'), cards('Kd Kc')], cards('2c 7d 9h Js 3d'))).toEqual([1000, 0]);
    // 公共牌是同花顺（皇家），两家都用公共牌：平分
    expect(runoutEquity([cards('2c 3c'), cards('2d 3d')], cards('Ts Js Qs Ks As'))).toEqual([500, 500]);
  });

  it('翻牌前全下抽样：同样的牌总是同样的结果（不用随机），AA 对 72 大约 87%', () => {
    const a = runoutEquity([cards('As Ah'), cards('7d 2c')], []);
    expect(runoutEquity([cards('As Ah'), cards('7d 2c')], [])).toEqual(a);
    expect(a[0]).toBeGreaterThan(820);
    expect(a[0]).toBeLessThan(920);
  });

  it('三家：三人的胜率合起来约 1000', () => {
    const e = runoutEquity([cards('As Ah'), cards('Kd Kc'), cards('Qd Qc')], cards('2c 7d 9h'));
    expect(e.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(997);
  });
});

describe('大牌庆祝的档次', () => {
  it('葫芦 = 1 档，四条、同花顺、皇家同花顺 = 2 档，带对应的字', () => {
    expect(celebration(result([{ seat: 0, hole: 'As Ah' }, { seat: 1, hole: 'Kd Qc' }], 'Ad Kh Kc 2s 3s', 0))).toEqual({ seat: 0, tier: 1, text: '葫芦！' });
    expect(celebration(result([{ seat: 0, hole: 'As Ah' }, { seat: 1, hole: 'Kd Qc' }], 'Ad Ac Kc 2s 3s', 0))).toEqual({ seat: 0, tier: 2, text: '四条！' });
    expect(celebration(result([{ seat: 0, hole: '9s 8s' }, { seat: 1, hole: 'Kd Qc' }], '7s 6s 5s 2d 3d', 0))).toEqual({ seat: 0, tier: 2, text: '同花顺！' });
    expect(celebration(result([{ seat: 0, hole: 'As Ks' }, { seat: 1, hole: 'Kd Qc' }], 'Qs Js Ts 2d 3d', 0))).toEqual({ seat: 0, tier: 2, text: '皇家同花顺！' });
  });

  it('同花、顺子不庆祝；弃牌赢不庆祝；输家亮了大牌（赢家是更大的牌之外）只认赢家', () => {
    expect(celebration(result([{ seat: 0, hole: 'As 8s' }, { seat: 1, hole: 'Kd Qc' }], '2s 5s 9s Kc 3d', 0))).toBeNull();
    expect(celebration({ ...result([{ seat: 0, hole: 'As Ah' }], 'Ad Ac Kc 2s 3s', 0), byFold: true })).toBeNull();
    // 1 号的葫芦输给 0 号的四条：庆祝的是 0 号
    const r = result([{ seat: 0, hole: 'As Ah' }, { seat: 1, hole: 'Kd Kh' }], 'Ad Ac Ks 2s 3s', 0);
    expect(celebration(r)?.seat).toBe(0);
    // 赢家只有两对，输家的葫芦（不可能但按只认赢家）：不庆祝
    const odd = result([{ seat: 0, hole: '3c 2d' }, { seat: 1, hole: 'Kd Kh' }], 'Ad Ac Ks 2s 3s', 0);
    expect(celebration(odd)).toBeNull();
  });
});

describe('被逆转', () => {
  it('转牌时 AA 对 KK 领先超过八成，河牌来 K 反超：被逆转，输家是 AA 那家', () => {
    const r = result([{ seat: 0, hole: 'Kd Kc' }, { seat: 1, hole: 'As Ah' }], '2c 7d 9h Js Ks', 0);
    const b = badBeat(r);
    expect(b).toMatchObject({ winner: 0, loser: 1 });
    expect(b!.equity).toBeGreaterThanOrEqual(BAD_BEAT);
  });

  it('领先不到八成、领先的人赢了、主池平分、弃牌赢、河牌没发：都不算', () => {
    // 转牌时 TT 对同花听牌加大牌，TT 约 65%、对手约 35%，河牌 TT 赢了：没人领先八成
    expect(badBeat(result([{ seat: 0, hole: 'Td Tc' }, { seat: 1, hole: 'Ah Qh' }], '2h 7h 9c Js 3d', 0))).toBeNull();
    // 对手领先 86% 以上才算：QQ 转牌时对 AK 是大热门，河牌来 K 输了才是被逆转（上一条的反面）
    // 领先的赢了
    expect(badBeat(result([{ seat: 0, hole: 'Kd Kc' }, { seat: 1, hole: 'As Ah' }], '2c 7d 9h Js 3s', 1))).toBeNull();
    const split = result([{ seat: 0, hole: 'Kd Kc' }, { seat: 1, hole: 'As Ah' }], '2c 7d 9h Js Ks', 0);
    split.pots[0]!.winners = [{ seat: 0, won: 500 }, { seat: 1, won: 500 }];
    expect(badBeat(split)).toBeNull();
    expect(badBeat({ ...result([{ seat: 0, hole: 'Kd Kc' }, { seat: 1, hole: 'As Ah' }], '2c 7d 9h Js Ks', 0), byFold: true })).toBeNull();
    expect(badBeat(result([{ seat: 0, hole: 'Kd Kc' }, { seat: 1, hole: 'As Ah' }], '2c 7d 9h Js', 0))).toBeNull();
  });
});

describe('池子大小对应的筹码声', () => {
  it('十个大盲内小、四十个大盲起大（和"哗啦"原来的门槛一致）、一百五十个大盲起特大', () => {
    expect([0, 9, 10, 39, 40, 149, 150].map((k) => potTier(k * 20, 20))).toEqual([0, 0, 1, 1, 2, 2, 3]);
    expect(potTier(100, 0)).toBe(0);
  });
});
