import { describe, expect, it } from 'vitest';
import { BILL_MS, billStageMs } from '../../src/view/trade/billTiming.ts';

/** 月底账单舞台：每月自动停 ≤ 2 秒，一局 12 个月加结束过场不到半分钟（docs/art-v3.md 第 5 节）。 */
describe('月底账单舞台的时长', () => {
  it('每个月自动停不超过 2 秒，简短模式更短', () => {
    expect(billStageMs()).toBeLessThanOrEqual(2000);
    expect(BILL_MS.quick).toBeLessThan(billStageMs());
    expect(BILL_MS.rowMax * 5).toBeLessThanOrEqual(BILL_MS.rows + BILL_MS.rowMax);
  });
});
