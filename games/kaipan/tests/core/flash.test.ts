import { afterAll, describe, expect, it } from 'vitest';
import {
  BALANCE,
  FLASH_LEVELS,
  createRun,
  dailyBoardId,
  dailySetup,
  dispatch,
  flashDays,
  flashScore,
  flashSegmentId,
  flashSetup,
  isFlash,
  isFlashRun,
  replay,
  runMonths,
  runSummary,
  topBar,
  type GameEvent,
  type GameState,
} from '../../src/core/index.ts';
import { FLASH_EVENTS } from '../../src/core/content/index.ts';
import { emptyProfile, recordRun } from '../../src/platform/profile.ts';
import { dayLabel, flashFinal, flashLeft } from '../../src/view/labels.ts';
import { shareData } from '../../src/view/shareCard.ts';
import { TUTORIAL_LINE_MAX, eligibleSteps, freshTutorial, tutorialCard } from '../../src/view/tutorial.ts';
import { botByName, playRun, useExt, useMarket } from '../../tools/bots.ts';
import { loadSegment } from '../../tools/segments-disk.ts';

/** 闪电盘：每日 10 天短局（docs/design-modes.md「闪电盘」）。 */

const DATE = '2026-10-30';

/** 机器人用的行情：按种子 flash-<日期> 取那一天该用的段（和画面层一样只在冻结的段池里抽） */
function useFlashMarket(): void {
  useMarket((seed) => {
    const id = flashSegmentId(seed.replace(/^flash-/, ''));
    return id ? loadSegment(id) : null;
  });
  useExt(true);
}

function playFlash(date: string, bot = 'normal'): { end: GameState; events: { day: number; event: GameEvent }[] } {
  useFlashMarket();
  const d = flashSetup(date);
  const events: { day: number; event: GameEvent }[] = [];
  const end = playRun(d.seed, botByName(bot), d.setup, (state, evs) => {
    for (const event of evs) events.push({ day: state.dayIndex, event });
  });
  return { end, events };
}

afterAll(() => {
  useMarket(null);
  useExt(false);
});

describe('闪电盘的开局：同一天同一局', () => {
  it('种子、人设、难度、行情段都由日期决定，每次一样；难度在 FLASH_LEVELS 内；和同一天的经典每日挑战分开', () => {
    expect(flashSetup(DATE)).toEqual(flashSetup(DATE));
    expect(flashSegmentId(DATE)).toBe(flashSegmentId(DATE));
    expect(flashSegmentId(DATE)).not.toBeNull();
    const d = flashSetup(DATE);
    expect(d.seed).toBe(`flash-${DATE}`);
    expect(d.setup.flash).toBe(DATE);
    expect(d.seed).not.toBe(dailySetup(DATE).seed);
    const combos = new Set<string>();
    const segs = new Set<string | null>();
    for (let i = 1; i <= 60; i++) {
      const date = `2026-11-${String(((i - 1) % 28) + 1).padStart(2, '0')}`;
      const x = flashSetup(date);
      expect(x.setup.difficulty).toBeGreaterThanOrEqual(FLASH_LEVELS[0]);
      expect(x.setup.difficulty).toBeLessThanOrEqual(FLASH_LEVELS[1]);
      combos.add(`${x.setup.persona}:${x.setup.difficulty}`);
      segs.add(flashSegmentId(date));
    }
    expect(combos.size).toBeGreaterThan(5);
    expect(segs.size).toBeGreaterThan(10);
    expect(() => flashSetup('10-30')).toThrow('YYYY-MM-DD');
  });

  it('isFlashRun 要种子、人设、难度都对得上', () => {
    const d = flashSetup(DATE);
    expect(isFlashRun(DATE, d.seed, d.setup.persona, d.setup.difficulty)).toBe(true);
    expect(isFlashRun(DATE, 'other', d.setup.persona, d.setup.difficulty)).toBe(false);
    expect(isFlashRun(null, d.seed, d.setup.persona, d.setup.difficulty)).toBe(false);
  });

  it('开局先三选一道具（只出道具、不出和月供有关的）；没有月供；10 天', () => {
    const d = flashSetup(DATE);
    const { state, events } = createRun(d.seed, d.setup, { ext: true });
    expect(isFlash(state)).toBe(true);
    expect(state.phase).toBe('reward');
    expect(state.reward?.cards.length).toBe(3);
    expect(state.reward?.cards.every((c) => c.kind === 'item' && c.id !== 'credit' && c.id !== 'crowd_fund')).toBe(true);
    expect(state.bill.amount).toBe(0);
    expect(runMonths(state)).toBe(BALANCE.flash.months);
    expect(flashDays()).toBe(10);
    expect(events.some((e) => e.type === 'monthStarted')).toBe(false);
    expect(events.some((e) => e.type === 'rewardOffered')).toBe(true);
    // 领完才开第一天
    const r = dispatch(state, { type: 'pickReward', index: 0 });
    expect(r.error).toBeNull();
    expect(r.state.phase).toBe('premarket');
    expect(r.state.dayIndex).toBe(0);
    expect(r.state.items.length).toBeGreaterThan(state.items.length);
    expect(dispatch(state, { type: 'open' }).error).not.toBeNull();
    const skip = dispatch(state, { type: 'skipReward' });
    expect(skip.state.phase).toBe('premarket');
  });

  it('不能和每日挑战、实盘、短局一起；日期要对', () => {
    const d = flashSetup(DATE);
    expect(() => createRun('x', { ...d.setup, daily: DATE })).toThrow('闪电盘');
    expect(() => createRun('x', { ...d.setup, short: { months: 5, billMult: 0.25, goal: 1 } })).toThrow('闪电盘');
    expect(() => createRun('x', { ...d.setup, flash: 'abc' })).toThrow('YYYY-MM-DD');
  });
});

describe('打完一局闪电盘', () => {
  it('10 个交易日结束、第 4 和第 8 天收盘后各一个事件（池内、不重复）、没有账单；分数 = 最终资产取整', () => {
    const { end, events } = playFlash(DATE);
    expect(end.phase).toBe('won');
    expect(end.stats.days).toBe(10);
    expect(end.dayIndex).toBe(10);
    expect(end.stats.billsPaid).toBe(0);
    expect(events.some((x) => x.event.type === 'billPaid' || x.event.type === 'bankrupt' || x.event.type === 'monthStarted')).toBe(false);
    const started = events.filter((x) => x.event.type === 'eventStarted');
    expect(started.map((x) => x.day)).toEqual([4, 8]);
    expect(end.stats.events.length).toBe(2);
    expect(new Set(end.stats.events).size).toBe(2);
    for (const id of end.stats.events) expect(FLASH_EVENTS).toContain(id);
    expect(events.filter((x) => x.event.type === 'eventResolved').length).toBe(2);
    expect(flashScore(end)).toBe(Math.round(end.account));
    expect(Number.isSafeInteger(flashScore(end))).toBe(true);
    const sum = runSummary(end);
    expect(sum.flash).toBe(DATE);
    expect(sum.won).toBe(true);
  });

  it('同一天同一串操作结果逐位一样（回放）；不同机器人走法不同但同一局', () => {
    const { end } = playFlash(DATE, 'normal');
    const again = replay(end.seed, end.actions, end.setup, { ext: true, segment: loadSegment(flashSegmentId(DATE)!) });
    expect(again.account).toBe(end.account);
    expect(again.phase).toBe('won');
    expect(again.stats.events).toEqual(end.stats.events);
    const a = createRun(end.seed, end.setup, { ext: true, segment: loadSegment(flashSegmentId(DATE)!) }).state;
    const b = createRun(end.seed, end.setup, { ext: true, segment: loadSegment(flashSegmentId(DATE)!) }).state;
    expect(a.reward?.cards).toEqual(b.reward?.cards);
  });

  it('换一天就是另一局', () => {
    const a = playFlash('2026-10-30').end;
    const b = playFlash('2026-10-31').end;
    expect(a.seed).not.toBe(b.seed);
    expect(a.account).not.toBe(b.account);
  });

  it('档案不记闪电盘（只上自己的榜）', () => {
    const { end } = playFlash(DATE);
    const r = recordRun(emptyProfile(), runSummary(end), DATE);
    expect(r.ignored).toBe('flash');
    expect(r.profile.runs).toBe(0);
  });
});

describe('顶栏、教程、分享卡', () => {
  it('顶栏：第 N/10 天，最后 3 天（含今天）进入冲刺', () => {
    const d = flashSetup(DATE);
    let s = dispatch(createRun(d.seed, d.setup, { ext: true }).state, { type: 'skipReward' }).state;
    expect(topBar(s).flash).toMatchObject({ date: DATE, day: 1, days: 10 });
    expect(dayLabel(topBar(s))).toBe('第 1/10 天');
    expect(flashFinal({ day: 7, days: 10 })).toBe(false);
    expect(flashFinal({ day: 8, days: 10 })).toBe(true);
    expect(flashLeft({ day: 8, days: 10 })).toBe(3);
    expect(flashLeft({ day: 10, days: 10 })).toBe(1);
    s = dispatch(s, { type: 'open' }).state;
    expect(topBar(s).flash?.day).toBe(2);
    // 经典局的顶栏不变
    expect(topBar(createRun('x', { persona: 'newbie', difficulty: 1 }).state).flash).toBeNull();
    expect(dayLabel({ month: 3, day: 2, daysInMonth: 5 })).toBe('3月 2/5');
  });

  it('教程：闪电盘不讲月供，也不在开局三选一时讲「月底」', () => {
    const d = flashSetup(DATE);
    const s0 = createRun(d.seed, d.setup, { ext: true }).state;
    expect(eligibleSteps(s0, freshTutorial()).map((x) => x.step)).toEqual([]);
    const s1 = dispatch(s0, { type: 'skipReward' }).state;
    expect(tutorialCard('goal', s1).line).toBe('10 天后，资产越多越好');
    expect(Array.from(tutorialCard('goal', s1).line).length).toBeLessThanOrEqual(TUTORIAL_LINE_MAX);
  });

  it('分享卡：闪电盘标题、名次、邀请语', () => {
    const { end } = playFlash(DATE);
    const sum = runSummary(end);
    const a = shareData(sum, null);
    expect(a.title).toBe('闪电盘 10/30');
    expect(a.stats[0]).toEqual({ label: '用时', value: '10 个交易日' });
    const b = shareData(sum, 7);
    expect(b.stats[0]).toEqual({ label: '今天', value: '第 7 名' });
    expect(b.text).toContain('闪电盘');
    expect(b.text).toContain('第 7 名');
    expect(b.line?.length ?? 0).toBeGreaterThan(0);
  });

});

describe('子榜名', () => {
  it('经典每日交 daily-日期-classic，闪电盘交 daily-日期-flash', () => {
    expect(dailyBoardId(DATE)).toBe(`daily-${DATE}-classic`);
    expect(dailyBoardId(DATE, 'classic')).toBe(`daily-${DATE}-classic`);
    expect(dailyBoardId(DATE, 'flash')).toBe(`daily-${DATE}-flash`);
  });
});
