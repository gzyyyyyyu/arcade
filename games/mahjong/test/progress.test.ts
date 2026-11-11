/** 主页"我的进度"汇总（src/game/progress.ts）：空数据、部分数据、两种玩法取较大连续天数 */
import { describe, expect, test } from 'vitest';
import { ACHIEVEMENTS, emptyAch } from '../src/game/achieve.ts';
import { emptyDaily, parseAll, type DailyAll } from '../src/game/daily.ts';
import { emptyDex } from '../src/game/dex.ts';
import { summarize } from '../src/game/progress.ts';

const today = '2026-10-27';
const day = (date: string, run: number) => ({ days: { [date]: { net: 10, id: 'a' } }, best: 10, last: date, run });

describe('主页进度汇总', () => {
  test('全空：没打、连续 0、总数对', () => {
    const p = summarize(parseAll(null), emptyAch(), emptyDex(), today);
    expect(p.daily).toEqual({ doneToday: false, streak: 0 });
    expect(p.ach).toEqual({ got: 0, total: ACHIEVEMENTS.length });
    expect(p.dex).toEqual({ got: 0, total: 53 });
  });

  test('部分数据：成就按 id 数，认不得的不算；图鉴两种玩法合计', () => {
    const ach = { ...emptyAch(), got: { first_win: 1, nope: 1 } as Record<string, 1> };
    const dex = { xz: { ping: 2, qing: 1 }, rc: { riichi: 1 } };
    const p = summarize(parseAll(null), ach, dex, today);
    expect(p.ach.got).toBe(1);
    expect(p.dex.got).toBe(3);
  });

  test('两种玩法取较大连续天数；昨天打的还算连着但今天没打', () => {
    const all: DailyAll = { 'sichuan-xuezhan': day('2026-10-26', 3), riichi: day('2026-10-27', 5) };
    expect(summarize(all, emptyAch(), emptyDex(), today).daily).toEqual({ doneToday: true, streak: 5 });
    const y: DailyAll = { 'sichuan-xuezhan': day('2026-10-26', 3), riichi: emptyDaily() };
    expect(summarize(y, emptyAch(), emptyDex(), today).daily).toEqual({ doneToday: false, streak: 3 });
    const old: DailyAll = { 'sichuan-xuezhan': day('2026-10-20', 9), riichi: emptyDaily() };
    expect(summarize(old, emptyAch(), emptyDex(), today).daily.streak).toBe(0);
  });
});
