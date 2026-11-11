/** 回大厅时筹码牌子演什么（src/lib/chips-fx-logic.ts、src/features/coinfly/burst-logic.ts 的纯函数） */
import { describe, expect, it } from 'vitest';
import { burstTarget } from '../src/features/coinfly/burst-logic';
import { chipsTotal, decideChipsFx } from '../src/lib/chips-fx-logic';

const NOW = 1_000_000_000;
const rec = (total: unknown, ago = 60_000) => ({ total, at: NOW - ago });

describe('chipsTotal', () => {
  it('余额加桌上筹码', () => {
    expect(chipsTotal({ balance: 500, stakes: [] })).toBe(500);
    expect(chipsTotal({ balance: 500, stakes: [{ amount: 200 }, { amount: 300 }] })).toBe(1000);
  });
});

describe('decideChipsFx', () => {
  it('总数多了：迸金币，起点是余额减去增量', () => {
    expect(decideChipsFx(rec(1000), { total: 1300, balance: 1300 }, NOW)).toEqual({ kind: 'burst', from: 1000 });
  });
  it('总数少了：只滚数字', () => {
    expect(decideChipsFx(rec(1000), { total: 700, balance: 700 }, NOW)).toEqual({ kind: 'roll', from: 1000 });
  });
  it('没变：什么都不播', () => {
    expect(decideChipsFx(rec(1000), { total: 1000, balance: 1000 }, NOW)).toEqual({ kind: 'none' });
  });
  it('桌上有筹码：离开时余额降了但总数没变，不算赢', () => {
    // 进游戏时 1000 都在余额里；实盘带走 400 坐下，回来余额 600 + 桌上 400
    expect(decideChipsFx(rec(1000), { total: 1000, balance: 600 }, NOW)).toEqual({ kind: 'none' });
  });
  it('桌上有筹码且总数多了：起点按余额算', () => {
    expect(decideChipsFx(rec(1000), { total: 1100, balance: 700 }, NOW)).toEqual({ kind: 'burst', from: 600 });
  });
  it('起点不低于 0', () => {
    expect(decideChipsFx(rec(0), { total: 500, balance: 100 }, NOW)).toEqual({ kind: 'burst', from: 0 });
  });
  it('没有记录、没记总数、坏数据：不播', () => {
    expect(decideChipsFx(null, { total: 5, balance: 5 }, NOW)).toEqual({ kind: 'none' });
    expect(decideChipsFx({ at: NOW }, { total: 5, balance: 5 }, NOW)).toEqual({ kind: 'none' });
    expect(decideChipsFx(rec('9'), { total: 5, balance: 5 }, NOW)).toEqual({ kind: 'none' });
    expect(decideChipsFx(rec(Number.NaN), { total: 5, balance: 5 }, NOW)).toEqual({ kind: 'none' });
    expect(decideChipsFx({ total: 1 }, { total: 5, balance: 5 }, NOW)).toEqual({ kind: 'none' });
  });
  it('记录过期（超过 30 分钟）：不播', () => {
    expect(decideChipsFx(rec(1000, 31 * 60_000), { total: 2000, balance: 2000 }, NOW)).toEqual({ kind: 'none' });
    expect(decideChipsFx(rec(1000, 29 * 60_000), { total: 2000, balance: 2000 }, NOW).kind).toBe('burst');
  });
});

describe('burstTarget', () => {
  it('全部向下散开（牌子贴着屏幕顶）且同参数同结果', () => {
    for (let i = 0; i < 8; i++) {
      expect(burstTarget(i, 8).dy).toBeGreaterThan(0);
      expect(burstTarget(i, 8)).toEqual(burstTarget(i, 8));
    }
  });
});
