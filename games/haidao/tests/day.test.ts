import { describe, expect, it } from 'vitest';
import { beijingDate, beijingDayIndex, civilFromDays, daysFromCivil } from '../src/core/day.ts';

describe('北京时间换天（core/day.ts，不用 Date）', () => {
  it('和 Date 算的一致：跨年、闰年 2 月、UTC 16 点前后', () => {
    const cases = [Date.UTC(2026, 10, 22, 15, 59, 59), Date.UTC(2026, 10, 22, 16, 0, 0), Date.UTC(2024, 1, 28, 16, 0, 0), Date.UTC(2025, 11, 31, 16, 0, 0), Date.UTC(1999, 11, 31, 23, 0, 0), 0];
    for (const ms of cases) {
      expect(beijingDate(ms), String(ms)).toBe(new Date(ms + 8 * 3600_000).toISOString().slice(0, 10));
      expect(beijingDayIndex(ms)).toBe(Math.floor((ms + 8 * 3600_000) / 86_400_000));
    }
  });
  it('civilFromDays 是 daysFromCivil 的反函数（逐天扫 1970–2100）', () => {
    for (let z = 0; z < daysFromCivil(2100, 1, 1); z += 1) {
      const { y, m, d } = civilFromDays(z);
      expect(daysFromCivil(y, m, d)).toBe(z);
    }
  });
});
