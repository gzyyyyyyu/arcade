import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  BALANCE,
  SWAN_DEFS,
  SWAN_KINDS,
  createRun,
  dailySegmentId,
  dailySetup,
  dispatch,
  flashSegmentId,
  flashSetup,
  hasSwan,
  lastDayIndex,
  liveSetup,
  shortSetup,
  stocksOf,
  swanDelta,
  swanNotice,
  swanPlan,
  swanSwitch,
  topBar,
  type DayReport,
  type GameState,
  type RunSetup,
  type SwanKind,
  type ThemeId,
} from '../../src/core/index.ts';
import { achievementsOf } from '../../src/core/index.ts';
import { botByName, playRun, useExt, useMarket } from '../../tools/bots.ts';
import { loadSegment, segmentForSeed } from '../../tools/segments-disk.ts';

/** 黑天鹅 Boss 日（docs/design.md 第 16 节）：哪些局有、预告时间、各类修正、对冲、确定性。 */

afterEach(() => {
  swanSwitch.enabled = true;
});
afterAll(() => {
  useMarket(null);
  useExt(false);
});

const SHORT: RunSetup = shortSetup('newbie', 1);

function open(seed: string, setup: RunSetup | null, real = true): GameState {
  const state = createRun(seed, setup, { segment: real ? segmentForSeed(seed) : null, ext: true }).state;
  state.account = 5_000_000; // 空仓走到最后一天，月供不会出局
  return state;
}

/** 一路空仓开盘，领奖励、事件都跳过 / 选第一项，走到 dayIndex 天的盘前。 */
function walkTo(s: GameState, day: number, seen?: (st: GameState) => void): GameState {
  let st = s;
  for (let i = 0; i < 5000 && !(st.phase === 'premarket' && st.dayIndex >= day); i++) {
    if (st.phase === 'won' || st.phase === 'lost') throw new Error(`没走到第 ${day} 天就结束了：${st.phase}`);
    if (st.phase === 'premarket') seen?.(st);
    const a = st.phase === 'reward' ? ({ type: 'skipReward' } as const) : st.phase === 'event' ? ({ type: 'choose', option: 0 } as const) : ({ type: 'open' } as const);
    const r = dispatch(st, a);
    if (r.error) throw new Error(r.error);
    st = r.state;
  }
  return st;
}

/** 找一个黑天鹅是 kind 的种子（短局真实行情）。 */
function seedOf(kind: SwanKind): string {
  for (let i = 0; i < 400; i++) {
    const seed = `swan-${kind}-${i}`;
    const s = open(seed, SHORT);
    if (swanPlan(s)?.kind === kind) return seed;
  }
  throw new Error(`找不到 ${kind} 的种子`);
}

/** 最后一天盘前摆好持仓（每格一只指定的股票，可押跌），返回有 / 没有黑天鹅的两份收盘报告。 */
function lastDay(seed: string, picks: { stockId: string; short?: boolean }[]): { with: DayReport; without: DayReport; s: GameState } {
  const s = walkTo(open(seed, SHORT), lastDayIndex(open(seed, SHORT)));
  picks.forEach((p, i) => {
    s.slots[i] = {
      stockId: p.stockId,
      boughtDay: 0,
      value: 1,
      todayRet: null,
      lowBuy: false,
      buyFeel: 'warming',
      buyStage: 'rally',
      source: 'setup',
      recBy: null,
      firstBuy: false,
      contra: false,
      sawEbb: false,
      units: 1,
      ...(p.short ? { short: true } : {}),
    };
  });
  const a = dispatch(s, { type: 'open' });
  expect(a.error).toBeNull();
  swanSwitch.enabled = false;
  const b = dispatch(s, { type: 'open' });
  swanSwitch.enabled = true;
  expect(b.error).toBeNull();
  return { with: a.state.lastDay as DayReport, without: b.state.lastDay as DayReport, s };
}

describe('哪些局有黑天鹅', () => {
  it('真实行情的整年局和 5 个月短局都有，每局一个，由种子定', () => {
    for (const setup of [null, SHORT, { persona: 'newbie' as const, difficulty: 3 }]) {
      for (let i = 0; i < 6; i++) {
        const s = open(`swan-yes-${i}`, setup);
        expect(hasSwan(s)).toBe(true);
        const p = swanPlan(s);
        expect(p).not.toBeNull();
        expect(swanPlan(open(`swan-yes-${i}`, setup))).toEqual(p);
        expect(SWAN_KINDS).toContain(p?.kind);
        expect(p?.theme !== null).toBe(SWAN_DEFS[p?.kind as SwanKind].themed);
        if (p?.theme) expect(s.themeIds).toContain(p.theme);
      }
    }
  });

  it('四种都抽得到', () => {
    const seen = new Set<SwanKind>();
    for (let i = 0; i < 60; i++) {
      const k = swanPlan(open(`swan-mix-${i}`, SHORT))?.kind;
      if (k) seen.add(k);
    }
    expect([...seen].sort()).toEqual([...SWAN_KINDS].sort());
  });

  it('实盘、每日挑战、闪电盘、合成行情、调试开局都没有', () => {
    const d = dailySetup('2026-10-30');
    const f = flashSetup('2026-10-30');
    const daily = createRun(d.seed, d.setup, { segment: loadSegment(dailySegmentId('2026-10-30') as string), ext: true }).state;
    const flash = createRun(f.seed, f.setup, { segment: loadSegment(flashSegmentId('2026-10-30') as string), ext: true }).state;
    const live = createRun('swan-live', liveSetup('small'), { segment: segmentForSeed('swan-live'), ext: true }).state;
    const synth = open('swan-synth', SHORT, false);
    const debug = open('swan-debug', { ...SHORT, account: 100000 });
    for (const s of [daily, flash, live, synth, debug]) {
      expect(hasSwan(s)).toBe(false);
      expect(swanPlan(s)).toBeNull();
      expect(swanNotice(s)).toBeNull();
    }
  });

  it('没有黑天鹅的局，开关开不开结果逐位一样（每日、闪电盘、实盘）', () => {
    const d = dailySetup('2026-10-30');
    const f = flashSetup('2026-10-30');
    const cases: { seed: string; setup: RunSetup; seg: string }[] = [
      { seed: d.seed, setup: d.setup, seg: dailySegmentId('2026-10-30') as string },
      { seed: f.seed, setup: f.setup, seg: flashSegmentId('2026-10-30') as string },
      { seed: 'swan-live-eq', setup: liveSetup('mid'), seg: segmentForSeed('swan-live-eq').id },
    ];
    useExt(true);
    for (const c of cases) {
      useMarket(() => loadSegment(c.seg));
      const on = JSON.stringify(playRun(c.seed, botByName('normal'), c.setup));
      swanSwitch.enabled = false;
      const off = JSON.stringify(playRun(c.seed, botByName('normal'), c.setup));
      swanSwitch.enabled = true;
      expect(on).toBe(off);
    }
    useMarket(null);
  });

  it('有黑天鹅的局，最后一天之前每一天都和没有黑天鹅时一模一样', () => {
    const seed = 'swan-prefix';
    const last = lastDayIndex(open(seed, SHORT));
    const a = walkTo(open(seed, SHORT), last);
    swanSwitch.enabled = false;
    const b = walkTo(open(seed, SHORT), last);
    swanSwitch.enabled = true;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('预告', () => {
  it('最后 3 个交易日的盘前才有，倒数 2、1、0，只说种类和避险办法', () => {
    for (const kind of SWAN_KINDS) {
      const seed = seedOf(kind);
      const s0 = open(seed, SHORT);
      const last = lastDayIndex(s0);
      const got: { day: number; left: number }[] = [];
      const final = walkTo(s0, last, (st) => {
        const n = swanNotice(st);
        if (n) {
          got.push({ day: st.dayIndex, left: n.daysLeft });
          expect(n.kind).toBe(kind);
          expect(topBar(st).swan).toEqual(n);
          // 预告不透露幅度：没有任何数字和百分号
          expect(`${n.name}${n.line}${n.hedge}`).not.toMatch(/[0-9%％]/);
          expect(n.hedge.length).toBeGreaterThan(4);
        } else expect(topBar(st).swan).toBeNull();
      });
      expect(final.dayIndex).toBe(last);
      expect(got).toEqual([
        { day: last - 2, left: 2 },
        { day: last - 1, left: 1 },
      ]);
      expect(swanNotice(final)?.daysLeft).toBe(0);
    }
  });

  it('整年局也是最后 3 天；开盘后预告不再出现', () => {
    const s0 = open('swan-year', null);
    expect(lastDayIndex(s0)).toBe(
      BALANCE.monthDays.reduce((n, d) => n + d, 0) - 1,
    );
    const s = walkTo(s0, lastDayIndex(s0) - 3);
    expect(swanNotice(s)).toBeNull();
    const t = walkTo(s, lastDayIndex(s0) - 2);
    expect(swanNotice(t)?.daysLeft).toBe(2);
  });

  it('只有最后一天开盘发 swanOpen 事件，收盘报告带 swan', () => {
    const seed = seedOf('blackout');
    const s = walkTo(open(seed, SHORT), lastDayIndex(open(seed, SHORT)));
    const r = dispatch(s, { type: 'open' });
    expect(r.events.some((e) => e.type === 'swanOpen')).toBe(true);
    expect(r.state.lastDay?.swan?.kind).toBe('blackout');
    const early = walkTo(open(seed, SHORT), 3);
    const r2 = dispatch(early, { type: 'open' });
    expect(r2.events.some((e) => e.type === 'swanOpen')).toBe(false);
    expect(r2.state.lastDay?.swan).toBeUndefined();
  });
});

describe('各类黑天鹅的修正', () => {
  it('幅度函数：大停电全体、爆雷 / 利好只动那个题材、闪崩把收盘压到至少跌一点', () => {
    const b = BALANCE.swan;
    expect(swanDelta('blackout', null, 'ai', 4)).toBe(-b.blackout);
    expect(swanDelta('themeBust', 'ai', 'ai', 4)).toBe(-b.themeBust);
    expect(swanDelta('themeBust', 'ai', 'pig', 4)).toBe(0);
    expect(swanDelta('windfall', 'ai', 'ai', 4)).toBe(b.windfall);
    expect(swanDelta('windfall', 'ai', 'pig', 4)).toBe(0);
    expect(4 + swanDelta('flashCrash', null, 'ai', 4)).toBeCloseTo(-b.flashCrash);
    expect(-7 + swanDelta('flashCrash', null, 'ai', -7)).toBe(-7);
  });

  const pairs = (theme: ThemeId): string[] => stocksOf(theme).map((d) => d.id);

  it('大停电：每格多头额外 −8，归因里多一项 swan，总和对得上', () => {
    const seed = seedOf('blackout');
    const s = walkTo(open(seed, SHORT), lastDayIndex(open(seed, SHORT)));
    const a = s.themeIds.slice(0, 2).map((t) => pairs(t)[0] as string);
    const r = lastDay(seed, a.map((stockId) => ({ stockId })));
    r.with.holdings.forEach((h, i) => {
      const base = r.without.holdings[i] as (typeof r.without.holdings)[number];
      expect(h.ret - base.ret).toBeCloseTo(-BALANCE.swan.blackout, 1);
      expect(h.swan).toBeCloseTo(-BALANCE.swan.blackout, 1);
      const part = h.parts.find((p) => p.kind === 'swan');
      expect(part?.value).toBeCloseTo(-BALANCE.swan.blackout, 1);
      expect(part?.label).toContain('大停电');
      expect(h.parts.reduce((n, p) => n + p.value, 0)).toBeCloseTo(h.ret, 1);
    });
    expect(r.with.swan?.touched).toBe(true);
    expect(r.with.swan?.money).toBeLessThan(0);
    expect(r.with.account.after).toBeLessThan(r.without.account.after);
  });

  it('题材爆雷：只有那个题材的格子挨砸，别的题材一分不动', () => {
    const seed = seedOf('themeBust');
    const s = walkTo(open(seed, SHORT), lastDayIndex(open(seed, SHORT)));
    const hit = swanPlan(s)?.theme as ThemeId;
    const other = s.themeIds.find((t) => t !== hit) as ThemeId;
    const r = lastDay(seed, [{ stockId: pairs(hit)[0] as string }, { stockId: pairs(other)[0] as string }]);
    expect(r.with.holdings[0]?.ret).toBeCloseTo((r.without.holdings[0]?.ret ?? 0) - BALANCE.swan.themeBust, 1);
    expect(r.with.holdings[1]?.ret).toBe(r.without.holdings[1]?.ret);
    expect(r.with.holdings[1]?.swan).toBeUndefined();
  });

  it('天降利好：那个题材 +12，押跌它的被轧（亏得更狠）', () => {
    const seed = seedOf('windfall');
    const s = walkTo(open(seed, SHORT), lastDayIndex(open(seed, SHORT)));
    const hit = swanPlan(s)?.theme as ThemeId;
    const [x, y] = pairs(hit) as [string, string];
    const r = lastDay(seed, [{ stockId: x }, { stockId: y, short: true }]);
    expect(r.with.holdings[0]?.ret).toBeCloseTo((r.without.holdings[0]?.ret ?? 0) + BALANCE.swan.windfall, 1);
    expect((r.with.holdings[1]?.ret ?? 0) - (r.without.holdings[1]?.ret ?? 0)).toBeCloseTo(-BALANCE.swan.windfall * BALANCE.ext.squeeze, 1);
    expect(r.with.holdings[0]?.parts.some((p) => p.kind === 'swan' && p.value > 0)).toBe(true);
    expect(r.with.holdings[1]?.parts.some((p) => p.kind === 'swan' && p.value < 0)).toBe(true);
  });

  it('闪崩又拉回：每只收盘至少跌 3%，本来跌得更多的不动', () => {
    const seed = seedOf('flashCrash');
    const s = walkTo(open(seed, SHORT), lastDayIndex(open(seed, SHORT)));
    const ids = s.themeIds.map((t) => pairs(t)[0] as string);
    const r = lastDay(seed, ids.map((stockId) => ({ stockId })));
    for (const [i, h] of r.with.holdings.entries()) {
      const move = (r.without.holdings[i] as (typeof r.without.holdings)[number]).ret;
      expect(h.ret).toBeCloseTo(Math.min(move, -BALANCE.swan.flashCrash), 1);
      expect(h.ret).toBeLessThanOrEqual(-BALANCE.swan.flashCrash + 0.01);
    }
  });
});

describe('对冲有效', () => {
  it('现金不受影响；押跌在下跌类里比没有黑天鹅时多赚；换到不受影响的题材一分不动', () => {
    for (const kind of ['blackout', 'themeBust', 'flashCrash'] as const) {
      const seed = seedOf(kind);
      const s = walkTo(open(seed, SHORT), lastDayIndex(open(seed, SHORT)));
      const plan = swanPlan(s);
      const hit = (plan?.theme ?? s.themeIds[0]) as ThemeId;
      // 现金：什么都不拿
      const cash = lastDay(seed, []);
      expect(cash.with.account.after).toBe(cash.without.account.after);
      expect(cash.with.swan).toMatchObject({ touched: false, money: 0 });
      // 押跌：同一只股票多头挨砸，空头赚
      const sid = stocksOf(hit)[0]?.id as string;
      const short = lastDay(seed, [{ stockId: sid, short: true }]);
      expect(short.with.holdings[0]?.ret).toBeGreaterThan(short.without.holdings[0]?.ret ?? 0);
      expect(short.with.swan?.money).toBeGreaterThan(0);
      expect(short.with.account.after).toBeGreaterThan(short.without.account.after);
      const long = lastDay(seed, [{ stockId: sid }]);
      expect(long.with.swan?.money).toBeLessThan(0);
    }
    // 爆雷：换到别的题材躲得过
    const seed = seedOf('themeBust');
    const s = walkTo(open(seed, SHORT), lastDayIndex(open(seed, SHORT)));
    const other = s.themeIds.find((t) => t !== swanPlan(s)?.theme) as ThemeId;
    const swap = lastDay(seed, [{ stockId: stocksOf(other)[0]?.id as string }]);
    expect(swap.with.account.after).toBe(swap.without.account.after);
    expect(swap.with.swan?.touched).toBe(false);
  });
});

describe('确定性与成就', () => {
  it('同一个种子同一串操作，结果逐位相同；回放得到同一个终局', () => {
    useExt(true);
    useMarket((seed) => segmentForSeed(seed));
    const run = (): GameState => playRun('swan-det', botByName('normal'), SHORT);
    const a = run();
    const b = run();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.lastDay?.swan).toBeDefined();
    expect(a.lastDay?.day).toBe(lastDayIndex(a));
  });

  it('成就「黑天鹅猎人」：黑天鹅那天账户涨了才算，空仓和亏了都不算，没有黑天鹅的局不算', () => {
    const seed = seedOf('blackout');
    const s = walkTo(open(seed, SHORT), lastDayIndex(open(seed, SHORT)));
    const stock = stocksOf(s.themeIds[0] as ThemeId)[0]?.id as string;
    const win = lastDay(seed, [{ stockId: stock, short: true }]);
    const fin = (rep: DayReport): GameState => ({ ...s, phase: 'won', lastDay: rep });
    expect(achievementsOf(fin(win.with))).toContain('swan_hunter');
    const cash = lastDay(seed, []);
    expect(achievementsOf(fin(cash.with))).not.toContain('swan_hunter');
    const lose = lastDay(seed, [{ stockId: stock }]);
    expect(achievementsOf(fin(lose.with))).not.toContain('swan_hunter');
    expect(achievementsOf(fin(win.without))).not.toContain('swan_hunter');
  });
});
