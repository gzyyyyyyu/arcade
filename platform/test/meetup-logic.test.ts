/** 约局的时间算术（src/features/meetup/meetup-logic.ts）：北京时间显示、可选时间、默认时间、到点 */
import { describe, expect, it } from 'vitest';
import { defaultSlot, hhmm, isDue, slots, whenText } from '../src/features/meetup/meetup-logic';

const bj = (s: string) => Date.parse(`${s}+08:00`);

describe('约局时间', () => {
  it('按北京时间显示今天、明天', () => {
    const now = bj('2026-10-14T14:10:00');
    expect(hhmm(bj('2026-10-14T20:00:00'))).toBe('20:00');
    expect(whenText(bj('2026-10-14T20:00:00'), now)).toBe('今天 20:00');
    expect(whenText(bj('2026-10-15T09:30:00'), now)).toBe('明天 09:30');
  });

  it('今天从下一个半点起到 23:30，明天从 00:00 到 23:30', () => {
    const now = bj('2026-10-14T14:10:00');
    const today = slots(now, 0);
    expect(hhmm(today[0]!)).toBe('14:30');
    expect(hhmm(today.at(-1)!)).toBe('23:30');
    expect(today).toHaveLength(19);
    const tomorrow = slots(now, 1);
    expect([hhmm(tomorrow[0]!), hhmm(tomorrow.at(-1)!), tomorrow.length]).toEqual(['00:00', '23:30', 48]);
    // 正好在半点上：这个半点已经不能选
    expect(hhmm(slots(bj('2026-10-14T14:30:00'), 0)[0]!)).toBe('15:00');
    expect(slots(bj('2026-10-14T23:40:00'), 0)).toEqual([]);
  });

  it('默认：离现在至少半小时的下一个整点；今天没有了就明天 20:00', () => {
    expect(hhmm(defaultSlot(bj('2026-10-14T14:10:00')))).toBe('15:00');
    expect(hhmm(defaultSlot(bj('2026-10-14T14:40:00')))).toBe('16:00');
    expect(defaultSlot(bj('2026-10-14T23:20:00'))).toBe(bj('2026-10-15T20:00:00'));
  });

  it('到点：开局前 10 分钟到开局后 30 分钟', () => {
    const at = bj('2026-10-14T20:00:00');
    expect(isDue(at, at - 600_001)).toBe(false);
    expect(isDue(at, at - 600_000)).toBe(true);
    expect(isDue(at, at + 1_799_999)).toBe(true);
    expect(isDue(at, at + 1_800_000)).toBe(false);
  });
});
