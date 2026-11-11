import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import {
  BALANCE,
  WEEKLY_RULE_IDS,
  canShortNow,
  createRun,
  dayMarketRules,
  dispatch,
  flashSetup,
  hasSwan,
  isFlash,
  isWeekId,
  isWeeklyRun,
  isoWeeksInYear,
  rulesOf,
  runSummary,
  stockTruth,
  themeTruth,
  topBar,
  weekMondayDays,
  weeklyBoardId,
  weeklyRule,
  weeklyScore,
  weeklySegmentId,
  weeklySetup,
  type GameState,
  type Message,
} from '../../src/core/index.ts';
import { WEEKLY_RULE_INFO } from '../../src/core/weekly.ts';
import { flipDir } from '../../src/core/chat.ts';
import { shortWind } from '../../src/core/engine/index.ts';
import { emptyProfile, recordRun } from '../../src/platform/profile.ts';
import { beijingIsoWeek, boardLine, weeklyTag } from '../../src/view/labels.ts';
import { boardCheck } from '../../src/view/dailyBoard.ts';
import { shareData } from '../../src/view/shareCard.ts';
import { botByName, playRun, useExt, useMarket } from '../../tools/bots.ts';
import { loadSegment } from '../../tools/segments-disk.ts';

/** 本周市场：每周一条限定规则的 10 天短局（docs/design.md「本周市场」）。 */

/** 五条规则各对应的一周（2026-W44 起相邻五周正好各一条） */
const WEEK: Record<(typeof WEEKLY_RULE_IDS)[number], string> = {
  reverse: '2026-W44',
  rotate: '2026-W45',
  full: '2026-W46',
  short: '2026-W47',
  limit: '2026-W48',
};
const FLASH_DATE = '2026-10-30';

function useWeeklyMarket(): void {
  useMarket((seed) => {
    const m = /^weekly-(\d{4}-W\d{2})/.exec(seed);
    const id = m ? weeklySegmentId(m[1] as string) : null;
    return id ? loadSegment(id) : null;
  });
  useExt(true);
}

afterAll(() => {
  useMarket(null);
  useExt(false);
});

describe('周号和规则的映射', () => {
  it('周号合法性：W53 只在有 53 周的年份里存在', () => {
    expect(isoWeeksInYear(2026)).toBe(53);
    expect(isoWeeksInYear(2025)).toBe(52);
    expect(isoWeeksInYear(2020)).toBe(53);
    expect(isoWeeksInYear(2027)).toBe(52);
    expect(isWeekId('2026-W53')).toBe(true);
    expect(isWeekId('2025-W53')).toBe(false);
    expect(isWeekId('2026-W00')).toBe(false);
    expect(isWeekId('2026-W5')).toBe(false);
    expect(isWeekId('2026-10-30')).toBe(false);
    expect(isWeekId(null)).toBe(false);
    expect(() => weeklyRule('2025-W53')).toThrow('YYYY-Www');
    expect(() => weeklySetup('abc')).toThrow('YYYY-Www');
  });

  it('映射稳定（改了会让已经打过的榜说不清是哪条规则）：2026-W44 起依次 反向群聊、题材快轮、满仓周、做空周、涨跌停放宽', () => {
    expect(weeklyRule('2026-W44')).toBe('reverse');
    expect(weeklyRule('2026-W45')).toBe('rotate');
    expect(weeklyRule('2026-W46')).toBe('full');
    expect(weeklyRule('2026-W47')).toBe('short');
    expect(weeklyRule('2026-W48')).toBe('limit');
    expect(weeklyRule('2026-W49')).toBe('reverse');
    expect(weeklyRule('2026-W43')).toBe('limit');
    for (const id of WEEKLY_RULE_IDS) expect(WEEKLY_RULE_INFO[id].line.length).toBeGreaterThan(5);
    expect(WEEKLY_RULE_INFO.reverse.line).toContain('反话');
  });

  it('相邻两周的规则一定不同（含 W52 → W01、W53 → W01 跨年），五条规则都轮得到', () => {
    const seen = new Set<string>();
    let prev: string | null = null;
    for (let y = 2023; y <= 2031; y++) {
      for (let w = 1; w <= isoWeeksInYear(y); w++) {
        const week = `${y}-W${String(w).padStart(2, '0')}`;
        const r = weeklyRule(week);
        if (prev !== null) expect(r, `${week} 和上一周相同`).not.toBe(prev);
        prev = r;
        seen.add(r);
      }
    }
    expect([...seen].sort()).toEqual([...WEEKLY_RULE_IDS].sort());
    // 周一到周一正好隔 7 天，连续的周号不跳天（W53 之后接下一年的 W01）
    expect(weekMondayDays('2027-W01') - weekMondayDays('2026-W53')).toBe(7);
    expect(weekMondayDays('2026-W01') - weekMondayDays('2025-W52')).toBe(7);
    expect(weekMondayDays('2021-W01') - weekMondayDays('2020-W53')).toBe(7);
  });

  it('种子、人设、难度、行情段只由周号决定；难度在闪电盘的范围里；和闪电盘、每日挑战分开', () => {
    const w = '2026-W44';
    expect(weeklySetup(w)).toEqual(weeklySetup(w));
    expect(weeklySegmentId(w)).toBe(weeklySegmentId(w));
    expect(weeklySegmentId(w)).not.toBeNull();
    const d = weeklySetup(w);
    expect(d.seed).toBe(`weekly-${w}`);
    expect(d.setup.weekly).toBe(w);
    expect(d.rule).toBe('reverse');
    expect(d.seed).not.toBe(flashSetup(FLASH_DATE).seed);
    const combos = new Set<string>();
    const segs = new Set<string | null>();
    for (let i = 1; i <= 40; i++) {
      const week = `2027-W${String(i).padStart(2, '0')}`;
      const x = weeklySetup(week);
      expect(x.setup.difficulty).toBeGreaterThanOrEqual(2);
      expect(x.setup.difficulty).toBeLessThanOrEqual(4);
      combos.add(`${x.setup.persona}:${x.setup.difficulty}`);
      segs.add(weeklySegmentId(week));
    }
    expect(combos.size).toBeGreaterThan(4);
    expect(segs.size).toBeGreaterThan(8);
    expect(weeklyBoardId(w)).toBe('week-2026-W44-rules');
    expect(isWeeklyRun(w, d.seed, d.setup.persona, d.setup.difficulty)).toBe(true);
    expect(isWeeklyRun(w, 'other', d.setup.persona, d.setup.difficulty)).toBe(false);
    expect(isWeeklyRun('2026-W99', d.seed, d.setup.persona, d.setup.difficulty)).toBe(false);
    expect(isWeeklyRun(null, d.seed, d.setup.persona, d.setup.difficulty)).toBe(false);
  });
});

describe('beijingIsoWeek（北京时间 ISO 周）', () => {
  const at = (y: number, m: number, d: number, h = 0, mi = 0, s = 0): number => Date.UTC(y, m - 1, d, h, mi, s);

  it('北京周一 0 点 = UTC 周日 16:00：前一秒还是上一周，这一秒换周', () => {
    // 2026-10-26 是周一
    expect(new Date(weekMondayDays('2026-W44') * 86_400_000).toISOString().slice(0, 10)).toBe('2026-10-26');
    expect(beijingIsoWeek(at(2026, 10, 25, 15, 59, 59))).toBe('2026-W43');
    expect(beijingIsoWeek(at(2026, 10, 25, 16, 0, 0))).toBe('2026-W44');
    expect(beijingIsoWeek(at(2026, 10, 26, 0, 0, 0))).toBe('2026-W44');
    // 北京周日 23:59:59 = UTC 周日 15:59:59，仍是 W44；再过一秒进 W45
    expect(beijingIsoWeek(at(2026, 11, 1, 15, 59, 59))).toBe('2026-W44');
    expect(beijingIsoWeek(at(2026, 11, 1, 16, 0, 0))).toBe('2026-W45');
  });

  it('跨年：哪年按这周的周四算；2026 有 W53', () => {
    expect(beijingIsoWeek(at(2026, 1, 1))).toBe('2026-W01');
    expect(beijingIsoWeek(at(2026, 12, 31))).toBe('2026-W53');
    expect(beijingIsoWeek(at(2027, 1, 1))).toBe('2026-W53');
    expect(beijingIsoWeek(at(2027, 1, 3, 15, 59, 59))).toBe('2026-W53');
    // 北京 2027-01-04 周一 0 点 = UTC 2027-01-03 16:00
    expect(beijingIsoWeek(at(2027, 1, 3, 16, 0, 0))).toBe('2027-W01');
    // 北京 2027-01-01 0 点 = UTC 2026-12-31 16:00：已经是新的一年，周还是 W53
    expect(beijingIsoWeek(at(2026, 12, 31, 16, 0, 0))).toBe('2026-W53');
    expect(beijingIsoWeek(at(2024, 12, 30))).toBe('2025-W01');
    expect(beijingIsoWeek(at(2021, 1, 3))).toBe('2020-W53');
    expect(beijingIsoWeek(at(2021, 1, 4))).toBe('2021-W01');
    expect(beijingIsoWeek(at(2025, 12, 28))).toBe('2025-W52');
  });

  it('和规则核心的周号一致：每天都落在自己周号的周一到周日里，结果是合法周号', () => {
    for (let ms = at(2024, 12, 1); ms < at(2028, 2, 1); ms += 86_400_000 / 3) {
      const week = beijingIsoWeek(ms);
      expect(isWeekId(week), week).toBe(true);
      const beijingDay = Math.floor((ms + 8 * 3600_000) / 86_400_000);
      const monday = weekMondayDays(week);
      expect(beijingDay).toBeGreaterThanOrEqual(monday);
      expect(beijingDay).toBeLessThan(monday + 7);
    }
  });
});

describe('本周市场的开局和结算', () => {
  it('和闪电盘同一套：先三选一道具、没有月供、10 天；不能和别的模式混；周号要对', () => {
    const d = weeklySetup('2026-W45');
    const { state } = createRun(d.seed, d.setup, { ext: true });
    expect(isFlash(state)).toBe(true);
    expect(state.phase).toBe('reward');
    expect(state.reward?.cards.length).toBe(3);
    expect(state.bill.amount).toBe(0);
    const tb = topBar(state);
    expect(tb.weekly).toMatchObject({ week: '2026-W45', rule: 'rotate', name: '题材快轮' });
    expect(tb.flash?.days).toBe(10);
    expect(() => createRun('x', { ...d.setup, daily: '2026-10-30' })).toThrow('本周市场');
    expect(() => createRun('x', { ...d.setup, flash: '2026-10-30' })).toThrow('本周市场');
    expect(() => createRun('x', { ...d.setup, weekly: '2026-W99' })).toThrow('YYYY-Www');
  });

  it('打完一局：10 天、没有账单、两个事件；分数 = 最终资产取整；不计入档案', () => {
    useWeeklyMarket();
    const d = weeklySetup('2026-W44');
    const end = playRun(d.seed, botByName('normal'), d.setup);
    expect(end.phase).toBe('won');
    expect(end.stats.days).toBe(10);
    expect(end.stats.billsPaid).toBe(0);
    expect(end.stats.events.length).toBe(2);
    expect(weeklyScore(end)).toBe(Math.round(end.account));
    // 没有黑天鹅 Boss 日（和闪电盘一样）
    expect(hasSwan(end)).toBe(false);
    expect(end.lastDay?.swan).toBeUndefined();
    const sum = runSummary(end);
    expect(sum.weekly).toBe('2026-W44');
    expect(sum.flash).toBeNull();
    const rec = recordRun(emptyProfile(), sum, '2026-10-30');
    expect(rec.ignored).toBe('flash');
  });

  it('上榜：榜名 week-<周号>-rules、只收本周的局；别的周、对不上的局不交', () => {
    useWeeklyMarket();
    const w = '2026-W44';
    const d = weeklySetup(w);
    const end = playRun(d.seed, botByName('normal'), d.setup);
    const sum = runSummary(end);
    const flashed = { ignored: 'flash' } as never;
    expect(boardCheck(end, sum, flashed, '2026-10-30', w)).toEqual({ state: 'sending', boardId: 'week-2026-W44-rules', score: Math.round(end.account) });
    expect(boardCheck(end, sum, flashed, '2026-11-03', '2026-W45')).toEqual({ state: 'skip', why: 'stale' });
    expect(boardCheck(end, { ...sum, seed: 'weekly-other' }, flashed, '2026-10-30', w)).toEqual({ state: 'none' });
    expect(boardCheck({ ...end, real: null } as GameState, sum, flashed, '2026-10-30', w)).toEqual({ state: 'skip', why: 'synthetic' });
    expect(boardLine({ state: 'done', boardId: 'b', score: 1, result: { kind: 'ok', best: 123_456, improved: false }, rank: 3 }, 'weekly')?.text).toBe('本周第 3 名 · 榜上最好：¥12.35万');
    expect(boardLine({ state: 'skip', why: 'stale' }, 'weekly')?.text).toContain('这周');
  });

  it('分享卡写周号和规则，不写日期', () => {
    useWeeklyMarket();
    const d = weeklySetup('2026-W44');
    const sum = runSummary(playRun(d.seed, botByName('normal'), d.setup));
    const card = shareData(sum, 5);
    expect(card.title).toBe(weeklyTag('2026-W44'));
    expect(card.stats[0]).toEqual({ label: '本周', value: '第 5 名' });
    expect(card.text).toContain('反向群聊');
    expect(shareData(sum).stats[0]).toEqual({ label: '规则', value: '反向群聊' });
  });
});

describe('同一周号、同一种子、同一串操作，结果逐位相同', () => {
  for (const rule of WEEKLY_RULE_IDS) {
    it(`${rule}（${WEEK[rule]}）：两次结果一样，状态序列化后逐字相同`, () => {
      useWeeklyMarket();
      const d = weeklySetup(WEEK[rule]);
      const a = playRun(d.seed, botByName('smart'), d.setup);
      const b = playRun(d.seed, botByName('smart'), d.setup);
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
      expect(a.actions.length).toBeGreaterThan(10);
    });
  }
});

describe('五条规则各自确实生效', () => {
  const make = (week: string, seed = 'weekly-t'): GameState => createRun(seed, { persona: 'newbie', difficulty: 3, weekly: week }, { ext: true, segment: loadSegment(weeklySegmentId(week) as string) }).state;
  const flashBase = (seed = 'weekly-t'): GameState => createRun(seed, { persona: 'newbie', difficulty: 3, flash: FLASH_DATE }, { ext: true, segment: loadSegment(weeklySegmentId('2026-W44') as string) }).state;
  const toDay = (s: GameState): GameState => dispatch(s, { type: 'skipReward' }).state;

  it('涨跌停放宽：涨跌停宽度 ×2（±10% → ±20%），别的周不变；一局里真有超过 10% 的涨跌、不超过 20%', () => {
    const lim = make(WEEK.limit);
    expect(rulesOf(lim).limitMult).toBe(BALANCE.weekly.limitMult);
    expect(rulesOf(flashBase()).limitMult).toBe(1);
    for (const r of ['reverse', 'rotate', 'full', 'short'] as const) expect(rulesOf(make(WEEK[r])).limitMult).toBe(1);
    // 找一局：放宽后个股真的涨跌超过 10%，也不超过 20%
    useWeeklyMarket();
    let beyond = 0;
    let most = 0;
    for (let i = 1; i <= 20; i++) {
      const wk = `2027-W${String(i).padStart(2, '0')}`;
      if (weeklyRule(wk) !== 'limit') continue;
      const d = weeklySetup(wk);
      playRun(d.seed, botByName('normal'), d.setup, (state) => {
        for (const st of state.lastDay?.stocks ?? []) {
          most = Math.max(most, Math.abs(st.move));
          if (Math.abs(st.move) > 10 + 1e-9) beyond++;
        }
      });
    }
    expect(most).toBeLessThanOrEqual(20 + 1e-9);
    expect(beyond).toBeGreaterThan(0);
  });

  it('反向群聊：所有消息和推荐都标反话；说中真相的比例明显低于平常的周', () => {
    const rev = make(WEEK.reverse);
    expect(rulesOf(rev).reverseAll).toBe(true);
    expect(rulesOf(flashBase()).reverseAll).toBe(false);
    expect(topBar(rev).weekly?.line).toContain('反话');
    // 同一个行情段、同样的种子：反向周里"说对"（claim 等于真实方向）的比例，和闪电盘（无规则）比
    const hit = (s: GameState): { n: number; hit: number } => {
      let n = 0;
      let ok = 0;
      let cur = toDay(s);
      for (let day = 0; day < 10 && cur.phase === 'premarket'; day++) {
        for (const m of cur.today.messages as readonly Message[]) {
          const truth = themeTruth(cur.real!, m.theme, cur.today.day, m.days ?? 1);
          n++;
          if (m.claim === truth) ok++;
        }
        const next = dispatch(cur, { type: 'open' });
        cur = next.state;
        while (cur.phase !== 'premarket' && cur.phase !== 'won' && cur.phase !== 'lost') {
          cur = dispatch(cur, cur.phase === 'event' ? { type: 'choose', option: 0 } : { type: 'skipReward' }).state;
        }
      }
      return { n, hit: ok };
    };
    let revN = 0;
    let revHit = 0;
    let baseN = 0;
    let baseHit = 0;
    for (let i = 0; i < 12; i++) {
      const r = hit(make(WEEK.reverse, `weekly-t${i}`));
      const b = hit(flashBase(`weekly-t${i}`));
      revN += r.n;
      revHit += r.hit;
      baseN += b.n;
      baseHit += b.hit;
    }
    expect(revN).toBeGreaterThan(100);
    expect(baseHit / baseN).toBeGreaterThan(0.45);
    expect(revHit / revN).toBeLessThan(baseHit / baseN - 0.15);
    // 每条消息都带反话标记，推荐也是
    const day1 = toDay(rev);
    expect(day1.today.messages.length).toBeGreaterThan(0);
    expect(day1.today.messages.every((m) => m.liar)).toBe(true);
    expect(day1.today.recs.length).toBeGreaterThan(0);
    expect(day1.today.recs.every((r) => r.liar)).toBe(true);
    expect(toDay(flashBase()).today.messages.some((m) => m.liar)).toBe(false);
    // 推荐：反向周里推荐的票真实涨的比例低于平常
    const recUp = (s: GameState): { n: number; up: number } => {
      const cur = toDay(s);
      let up = 0;
      for (const r of cur.today.recs) if (stockTruth(cur.real!, r.stockId, cur.today.day, r.days ?? 1) === 'up') up++;
      return { n: cur.today.recs.length, up };
    };
    let ru = 0;
    let rn = 0;
    let bu = 0;
    let bn = 0;
    for (let i = 0; i < 40; i++) {
      const a = recUp(make(WEEK.reverse, `weekly-r${i}`));
      const b = recUp(flashBase(`weekly-r${i}`));
      ru += a.up;
      rn += a.n;
      bu += b.up;
      bn += b.n;
    }
    expect(ru / rn).toBeLessThan(bu / bn);
    expect(flipDir('up')).toBe('down');
  });

  it('题材快轮：热度变化 ×1.8，风口一天里的起落明显比平常大', () => {
    const rot = make(WEEK.rotate);
    expect(dayMarketRules(rot).dHMult).toBe(BALANCE.weekly.rotateMult);
    expect(dayMarketRules(flashBase()).dHMult).toBe(1);
    let rotSum = 0;
    let baseSum = 0;
    for (let i = 0; i < 30; i++) {
      const a = toDay(make(WEEK.rotate, `weekly-d${i}`));
      const b = toDay(flashBase(`weekly-d${i}`));
      for (const id of a.themeIds) rotSum += Math.abs(a.today.plan.dH[id] ?? 0);
      for (const id of b.themeIds) baseSum += Math.abs(b.today.plan.dH[id] ?? 0);
    }
    expect(rotSum).toBeGreaterThan(baseSum * 1.4);
  });

  it('满仓周：持仓格多 2 格，开局就有；别的周不变', () => {
    const full = make(WEEK.full);
    const base = flashBase();
    expect(full.slots.length).toBe(base.slots.length + BALANCE.weekly.extraSlots);
    expect(rulesOf(full).slots).toBe(rulesOf(base).slots + BALANCE.weekly.extraSlots);
    for (const r of ['reverse', 'rotate', 'short', 'limit'] as const) expect(make(WEEK[r]).slots.length).toBe(base.slots.length);
    // 开局三选一选完以后格子数还是多 2 个，也能真的把它们填上
    let s = toDay(full);
    const recs = s.today.recs.length;
    expect(recs).toBeGreaterThan(0);
    s = dispatch(s, { type: 'buy', rec: 0 }).state;
    expect(s.slots.filter((h) => h).length).toBe(1);
  });

  it('做空周：一开局就能押跌，押跌赚的更多、被轧亏的更少；别的周要到高难度才行', () => {
    const sh = make(WEEK.short);
    const base = flashBase();
    expect(canShortNow(sh)).toBe(true);
    expect(canShortNow(base)).toBe(false);
    expect(rulesOf(sh).shortGainMult).toBe(BALANCE.weekly.shortGain);
    expect(rulesOf(sh).squeezeMult).toBe(BALANCE.weekly.squeezeMult);
    expect(rulesOf(base).shortGainMult).toBe(1);
    // 真的能下押跌单
    const day = toDay(sh);
    const r = dispatch(day, { type: 'buy', rec: 0, short: true });
    expect(r.error).toBeNull();
    expect(r.state.slots.some((h) => h?.short)).toBe(true);
    expect(dispatch(toDay(base), { type: 'buy', rec: 0, short: true }).error).not.toBeNull();
    // 一天的押跌收益 = −涨跌 × 1.5 − 手续费 + 天气（涨停那天另算被轧）：和公式对得上
    let checked = 0;
    for (let i = 0; i < 40; i++) {
      const st = toDay(make(WEEK.short, `weekly-s${i}`));
      const b0 = dispatch(st, { type: 'buy', rec: 0, short: true });
      if (b0.error) continue;
      const done = dispatch(b0.state, { type: 'open' }).state;
      const h = done.lastDay?.holdings.find((x) => x.short);
      if (!h || h.squeeze) continue;
      const want = -h.move * BALANCE.weekly.shortGain - BALANCE.ext.shortFee + shortWind(st, st.today.plan.mood);
      expect(h.ret).toBeCloseTo(want, 1);
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
  });
});

describe('public/weekly.json（周榜怎么显示）', () => {
  it('格式同 daily.json：boards.rules 名字「本周市场」，分数就是最后的资产；note ≤ 80 字', () => {
    const raw = readFileSync('public/weekly.json', 'utf8');
    const json = JSON.parse(raw) as { boards: Record<string, { name?: string; note?: string; score: { from?: number; text: string }[] }> };
    expect(Object.keys(json.boards)).toEqual(['rules']);
    const b = json.boards.rules!;
    expect(b.name).toBe('本周市场');
    expect(Array.from(b.note ?? '').length).toBeLessThanOrEqual(80);
    expect(b.score).toEqual([{ text: '¥{n}' }]);
    expect(new TextEncoder().encode(raw).length).toBeLessThanOrEqual(32 * 1024);
    // 榜名和平台登记的子榜 rules 对得上
    expect(weeklyBoardId('2026-W44')).toMatch(/^week-\d{4}-W\d{2}-rules$/);
  });
});
