/**
 * 斗地主记牌器：开局、出牌后、底牌（地主之外的人也扣掉）、不会出负数。
 */
import { describe, expect, it } from 'vitest';
import { countLeftDdz } from '../../src/view/doudizhu/counter.ts';
import { createDdz, dispatchDdz, viewDdz, ddzValue, type DdzState } from '../../src/variants/doudizhu/index.ts';

const total = (v: Parameters<typeof countLeftDdz>[0]): number => countLeftDdz(v).reduce((n, c) => n + c.left, 0);
const left = (v: Parameters<typeof countLeftDdz>[0], rank: number): number => countLeftDdz(v).find((c) => c.rank === rank)!.left;

/** 叫到地主 seat（别人不叫），返回状态 */
function landlordState(seed: string, seat: number): DdzState {
  let s = createDdz(seed).state;
  while (s.phase === 'bid') {
    const bid = s.turn === seat ? 3 : 0;
    s = dispatchDdz(s, { type: 'bid', seat: s.turn, bid }).state;
  }
  return s;
}

describe('斗地主记牌器', () => {
  it('空桌：从大到小 15 格，王各 1 张、其余各 4 张，共 54', () => {
    const cells = countLeftDdz({ hand: [], played: [], bottom: [] });
    expect(cells.map((c) => c.rank)).toEqual([17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
    expect(cells.map((c) => c.left)).toEqual([1, 1, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]);
  });

  it('叫分阶段：只扣自己的 17 张手牌，别人的牌和没翻的底牌都算没露面', () => {
    const s = createDdz('ddz-counter-1').state;
    const v = viewDdz(s, 0);
    expect(v.bottom).toEqual([]);
    expect(total(v)).toBe(54 - 17);
  });

  it('出牌后：打出去的牌从剩余里扣掉', () => {
    let s = landlordState('ddz-counter-2', 0);
    const v0 = viewDdz(s, 1);
    const before = total(v0);
    const c = s.hands[0]![0]!;
    s = dispatchDdz(s, { type: 'play', seat: 0, cards: [c] }).state;
    const v1 = viewDdz(s, 1);
    expect(total(v1)).toBe(before - 1);
    expect(left(v1, ddzValue(c))).toBe(left(v0, ddzValue(c)) - 1);
  });

  it('底牌：地主之外的人也扣掉（亮过给三家看），地主自己不会重复扣', () => {
    const s = landlordState('ddz-counter-3', 0);
    expect(s.landlord).toBe(0);
    const farmer = viewDdz(s, 1);
    expect(farmer.bottom).toHaveLength(3);
    // 农民：自己 17 张 + 公开的 3 张底牌
    expect(total(farmer)).toBe(54 - 17 - 3);
    // 地主：手里已经有 20 张（含底牌），底牌不再扣第二次
    const lord = viewDdz(s, 0);
    expect(lord.hand).toHaveLength(20);
    expect(total(lord)).toBe(54 - 20);
  });

  it('底牌已经打出去：不会扣两次，也不会出负数', () => {
    const bottom = [0, 1, 2];
    const cells = countLeftDdz({ hand: [3], played: [0, 1, 2, 4], bottom });
    expect(cells.reduce((n, c) => n + c.left, 0)).toBe(54 - 5);
    expect(cells.every((c) => c.left >= 0)).toBe(true);
  });

  it('同一张牌重复出现（异常数据）也不会负数', () => {
    const cells = countLeftDdz({ hand: [0, 0, 0], played: [0, 0], bottom: [0] });
    expect(cells.every((c) => c.left >= 0)).toBe(true);
    expect(total({ hand: [0], played: [0], bottom: [0] })).toBe(53);
  });
});
