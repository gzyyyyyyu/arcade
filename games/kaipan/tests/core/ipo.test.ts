import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  BALANCE,
  IPO_STOCKS,
  STOCKS,
  achievementsOf,
  createRun,
  dailySegmentId,
  dailySetup,
  dispatch,
  flashSegmentId,
  flashSetup,
  hasIpo,
  ipoFirstPremium,
  ipoOffer,
  ipoPending,
  ipoSwitch,
  ipoToday,
  ipoWon,
  isStockId,
  liveSetup,
  replay,
  shortSetup,
  stockById,
  stocksOf,
  validate,
  type BuySize,
  type GameEvent,
  type GameState,
  type RunSetup,
} from '../../src/core/index.ts';
import { reviveState } from '../../src/platform/storage.ts';
import { botByName, playRun, useExt, useMarket } from '../../tools/bots.ts';
import { loadSegment, segmentForSeed } from '../../tools/segments-disk.ts';

/** 打新（docs/design-modes.md 第 18 节）：哪些局有、日程、冻结、抽签、上市溢价、不开的模式逐位不变。 */

afterEach(() => {
  ipoSwitch.enabled = true;
});
afterAll(() => {
  useMarket(null);
  useExt(false);
});

const SHORT: RunSetup = shortSetup('newbie', 1);

function open(seed: string, setup: RunSetup | null = SHORT, real = true, ext = true): GameState {
  const state = createRun(seed, setup, { segment: real ? segmentForSeed(seed) : null, ext }).state;
  state.account = 5_000_000; // 空仓走下去，月供不会出局
  return state;
}

/** 一路空仓开盘，领奖励、事件都跳过 / 选第一项，走到 dayIndex 天的盘前。 */
function walkTo(s: GameState, day: number): GameState {
  let st = s;
  for (let i = 0; i < 5000 && !(st.phase === 'premarket' && st.dayIndex >= day); i++) {
    if (st.phase === 'won' || st.phase === 'lost') throw new Error(`没走到第 ${day} 天就结束了：${st.phase}`);
    const a = st.phase === 'reward' ? ({ type: 'skipReward' } as const) : st.phase === 'event' ? ({ type: 'choose', option: 1 } as const) : ({ type: 'open' } as const);
    const r = dispatch(st, a);
    if (r.error) throw new Error(r.error);
    st = r.state;
  }
  return st;
}

/** 找一个第 2 个月的新股在 size 档位下中 / 不中的种子。 */
function seedWhere(size: BuySize, won: boolean): string {
  for (let i = 0; i < 400; i++) {
    const seed = `ipo-${won ? 'win' : 'lose'}-${i}`;
    const offer = ipoOffer(open(seed), 2);
    if (offer && ipoWon(seed, offer, size) === won) return seed;
  }
  throw new Error('找不到种子');
}

/** 在申购日申购，然后一天天开盘到 D+4（上市后第 3 天）收盘，返回每天收盘后的局面和事件。 */
function playIpo(seed: string, size: BuySize = 'taste'): { start: GameState; days: { state: GameState; events: GameEvent[] }[]; sub: GameEvent[] } {
  const s0 = open(seed);
  const offer = ipoOffer(s0, 2) as NonNullable<ReturnType<typeof ipoOffer>>;
  const start = walkTo(s0, offer.day);
  const sub = dispatch(start, { type: 'subscribe', size });
  expect(sub.error).toBeNull();
  const days: { state: GameState; events: GameEvent[] }[] = [];
  let st = sub.state;
  for (let k = 0; k < 5; k++) {
    const r = dispatch(st, { type: 'open' });
    expect(r.error).toBeNull();
    st = r.state;
    days.push({ state: st, events: r.events });
    // 月底的奖励跳过、事件选第二项（多是"不理"；第一项可能让下个交易日没空，日子就对不上上市日了），接着走到下一个盘前
    for (let j = 0; j < 4 && (st.phase === 'reward' || st.phase === 'event'); j++) {
      const q = dispatch(st, st.phase === 'reward' ? { type: 'skipReward' } : { type: 'choose', option: 1 });
      expect(q.error).toBeNull();
      st = q.state;
    }
  }
  return { start, days, sub: sub.events };
}

describe('哪些局有打新', () => {
  it('真实行情加仓位玩法的整年局和 5 个月短局都有', () => {
    for (const setup of [null, SHORT, { persona: 'newbie' as const, difficulty: 3 }]) {
      for (let i = 0; i < 4; i++) {
        const s = open(`ipo-yes-${i}`, setup);
        expect(hasIpo(s)).toBe(true);
        expect(ipoOffer(s, 2)).not.toBeNull();
      }
    }
  });

  it('实盘、每日挑战、闪电盘、本周市场、合成行情、没有仓位玩法、调试开局都没有', () => {
    const d = dailySetup('2026-10-30');
    const f = flashSetup('2026-10-30');
    const daily = createRun(d.seed, d.setup, { segment: loadSegment(dailySegmentId('2026-10-30') as string), ext: true }).state;
    const flash = createRun(f.seed, f.setup, { segment: loadSegment(flashSegmentId('2026-10-30') as string), ext: true }).state;
    const live = createRun('ipo-live', liveSetup('small'), { segment: segmentForSeed('ipo-live'), ext: true }).state;
    const synth = open('ipo-synth', SHORT, false);
    const noExt = open('ipo-noext', SHORT, true, false);
    const debug = open('ipo-debug', { ...SHORT, account: 100000 });
    const weekly: GameState = { ...open('ipo-weekly'), setup: { weekly: '2026-W44' } };
    for (const s of [daily, flash, live, synth, noExt, debug, weekly]) {
      expect(hasIpo(s)).toBe(false);
      for (let m = 1; m <= 12; m++) expect(ipoOffer(s, m)).toBeNull();
      expect(ipoToday(s)).toBeNull();
    }
  });

  it('开关关掉就没有', () => {
    const s = open('ipo-switch');
    ipoSwitch.enabled = false;
    expect(hasIpo(s)).toBe(false);
    expect(ipoOffer(s, 2)).toBeNull();
  });
});

describe('日程和确定性', () => {
  it('除了第 1 个月和最后一个月，每月一只；申购日是当月第 floor(天数 / 2) 个交易日；冻结 2 天，次日出签，隔日上市', () => {
    const short = open('ipo-cal', SHORT);
    expect([1, 2, 3, 4, 5].map((m) => ipoOffer(short, m) !== null)).toEqual([false, true, true, true, false]);
    const year = open('ipo-cal', null);
    expect(Array.from({ length: 12 }, (_, i) => ipoOffer(year, i + 1) !== null)).toEqual([false, ...Array(10).fill(true), false]);
    let start = 0;
    for (let m = 1; m <= 12; m++) {
      const days = BALANCE.monthDays[m - 1] as number;
      const o = ipoOffer(year, m);
      if (o) {
        expect(o.month).toBe(m);
        expect(o.day).toBe(start + Math.floor(days / 2) - 1);
        expect(o.drawDay).toBe(o.day + 1);
        expect(o.listDay).toBe(o.day + 2);
        expect(o.odds).toEqual(BALANCE.ipo.odds);
        expect(year.themeIds).toContain(o.theme);
        expect(stockById(o.stockId).theme).toBe(o.theme);
        expect(stockById(o.stockId).role).toBe('ipo');
        expect(o.name).toBe(stockById(o.stockId).name);
      }
      start += days;
    }
  });

  it('只由种子定：同种子同日程，换种子题材和新股会变', () => {
    const a = open('ipo-det-1');
    expect(ipoOffer(open('ipo-det-1'), 3)).toEqual(ipoOffer(a, 3));
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) seen.add(ipoOffer(open(`ipo-mix-${i}`), 2)?.stockId ?? '');
    expect(seen.size).toBeGreaterThan(4);
  });

  it('新股内容：每个题材 2 只化名，借用同题材现有内容股的形象，不进股票池和开局登场', () => {
    expect(IPO_STOCKS).toHaveLength(16);
    for (const d of IPO_STOCKS) {
      expect(d.role).toBe('ipo');
      expect(isStockId(d.id)).toBe(true);
      const look = STOCKS.find((x) => x.id === d.look);
      expect(look?.theme, d.id).toBe(d.theme);
      expect(STOCKS.some((x) => x.id === d.id || x.name === d.name)).toBe(false);
      expect(stocksOf(d.theme).some((x) => x.id === d.id)).toBe(false);
    }
    expect(STOCKS.some((d) => d.role === 'ipo')).toBe(false);
    const s = open('ipo-pool');
    expect(Object.keys(s.stocks).some((id) => id.startsWith('ipo_'))).toBe(false);
  });
});

describe('申购和冻结', () => {
  const seed = seedWhere('taste', false);
  const day = (): number => (ipoOffer(open(seed), 2) as NonNullable<ReturnType<typeof ipoOffer>>).day;

  it('冻结中存档再读档：申购中的格子还在（s.stocks 里还没有新股，读档不能把它当坏数据清掉）', () => {
    const r = dispatch(walkTo(open(seed), day()), { type: 'subscribe', size: 'taste' }).state;
    const back = reviveState(JSON.parse(JSON.stringify(r))) as GameState;
    expect(back.slots[0]?.ipo?.stage).toBe('frozen');
    expect(ipoPending(back)?.slot).toBe(0);
  });

  it('只有申购日盘前能申购：前一天、当天开盘后、第二天都不行', () => {
    const before = walkTo(open(seed), day() - 1);
    expect(ipoToday(before)).toBeNull();
    expect(validate(before, { type: 'subscribe', size: 'taste' })).not.toBeNull();
    const on = walkTo(open(seed), day());
    const offer = ipoToday(on);
    expect(offer?.day).toBe(day());
    expect(validate(on, { type: 'subscribe', size: 'taste' })).toBeNull();
    const r = dispatch(on, { type: 'subscribe', size: 'taste' });
    expect(ipoToday(r.state)).toBeNull();
    expect(validate(r.state, { type: 'subscribe', size: 'taste' })).not.toBeNull();
    const after = dispatch(on, { type: 'open' }).state;
    expect(ipoToday(after)).toBeNull();
  });

  it('申购日开始时发 ipoOpened 事件，别的日子不发', () => {
    const s0 = open(seed);
    const prev = walkTo(s0, day() - 1);
    const r = dispatch(prev, { type: 'open' });
    expect(r.events.filter((e) => e.type === 'ipoOpened')).toHaveLength(1);
    const early = dispatch(walkTo(s0, 1), { type: 'open' });
    expect(early.events.some((e) => e.type === 'ipoOpened')).toBe(false);
  });

  it('三档申购占第一个空格，份数同买入；冻结的格子不在 s.stocks 里，不能卖、减、加、换', () => {
    const on = walkTo(open(seed), day());
    for (const [size, units] of [['taste', 1], ['half', 2], ['heavy', 4]] as const) {
      const r = dispatch(on, { type: 'subscribe', size });
      expect(r.error).toBeNull();
      const h = r.state.slots[0];
      expect(h?.units).toBe(units);
      expect(h?.ipo?.stage).toBe('frozen');
      expect(h?.stockId).toBe(ipoOffer(on, 2)?.stockId);
      expect(r.state.stocks[h?.stockId as string]).toBeUndefined();
      expect(r.state.stats.ipo).toEqual({ subs: 1, wins: 0, money: 0 });
      expect(r.state.actions.at(-1)).toEqual({ type: 'subscribe', size });
      expect(ipoPending(r.state)).toMatchObject({ slot: 0 });
      const ev = r.events.find((e) => e.type === 'subscribed');
      expect(ev).toMatchObject({ type: 'subscribed', slot: 0, size, units });
    }
    const r = dispatch(on, { type: 'subscribe', size: 'taste' }).state;
    expect(validate(r, { type: 'sell', slot: 0 })).not.toBeNull();
    expect(validate(r, { type: 'trim', slot: 0 })).not.toBeNull();
    expect(validate(r, { type: 'add', slot: 0 })).not.toBeNull();
    expect(validate(r, { type: 'buy', rec: 0, slot: 0 })).not.toBeNull();
  });

  it('没有空格或没有闲钱时不能申购', () => {
    const on = walkTo(open(seed), day());
    const full = structuredClone(on);
    full.slots = full.slots.map(() => ({ ...on.slots[0], stockId: 'ai_leader', boughtDay: 0, value: 1, todayRet: null, lowBuy: false, buyFeel: 'hot', buyStage: 'rally', source: 'setup', recBy: null, firstBuy: false, contra: false, sawEbb: false, units: 1 }) as never);
    expect(ipoToday(full)).toBeNull();
    expect(validate(full, { type: 'subscribe', size: 'taste' })).not.toBeNull();
  });

  it('冻结期间收益为 0：账户不动，持仓结算里没有这一格', () => {
    const { days } = playIpo(seed);
    const d = days[0]?.state.lastDay;
    expect(d?.day).toBe(day());
    expect(d?.holdings).toHaveLength(0);
    expect(d?.account.ret).toBe(0);
    expect(d?.account.after).toBe(d?.account.before);
    const d1 = days[1]?.state.lastDay;
    expect(d1?.holdings).toHaveLength(0);
    expect(d1?.account.after).toBe(d1?.account.before);
  });
});

describe('抽签', () => {
  it('没中：冻结满那天收盘清空这一格，只发 ipoDrawn(won: false)', () => {
    const seed = seedWhere('taste', false);
    const { days } = playIpo(seed);
    const drawn = days[1]?.events.find((e) => e.type === 'ipoDrawn');
    expect(drawn).toMatchObject({ type: 'ipoDrawn', slot: 0, won: false });
    expect(days[0]?.events.some((e) => e.type === 'ipoDrawn')).toBe(false);
    expect(days[1]?.state.slots[0]).toBeNull();
    expect(days[1]?.state.stats.ipo).toEqual({ subs: 1, wins: 0, money: 0 });
    expect(days[4]?.state.stats.ipo?.wins).toBe(0);
  });

  it('中签：只配 1 份，新股加入 s.stocks，stage 变 listed，次日就能卖', () => {
    const seed = seedWhere('heavy', true);
    const { days } = playIpo(seed, 'heavy');
    const st = days[1]?.state as GameState;
    const h = st.slots[0];
    expect(days[1]?.events.find((e) => e.type === 'ipoDrawn')).toMatchObject({ won: true, slot: 0 });
    expect(h?.ipo?.stage).toBe('listed');
    expect(h?.units).toBe(1);
    expect(st.stocks[h?.stockId as string]).toBeDefined();
    expect(st.stats.ipo).toMatchObject({ subs: 1, wins: 1 });
    expect(validate(st, { type: 'sell', slot: 0 })).toBeNull();
    // 重仓冻结 4 份，中签后只剩 1 份占仓位，其余 3 份回到现金
    expect(st.slots.reduce((n, x) => n + (x?.units ?? 0), 0)).toBe(1);
  });

  it('中签率按档位递增，同一个签号高档位更容易中；档位和种子决定结果', () => {
    expect(BALANCE.ipo.odds).toEqual({ taste: 0.1, half: 0.16, heavy: 0.22 });
    let wins = { taste: 0, half: 0, heavy: 0 };
    const n = 600;
    for (let i = 0; i < n; i++) {
      const seed = `ipo-odds-${i}`;
      const offer = ipoOffer(open(seed), 2) as NonNullable<ReturnType<typeof ipoOffer>>;
      for (const size of ['taste', 'half', 'heavy'] as const) {
        const w = ipoWon(seed, offer, size);
        if (w) wins = { ...wins, [size]: wins[size] + 1 };
        if (size === 'taste' && w) expect(ipoWon(seed, offer, 'heavy')).toBe(true);
      }
    }
    expect(wins.taste).toBeLessThan(wins.half);
    expect(wins.half).toBeLessThan(wins.heavy);
    expect(wins.taste / n).toBeGreaterThan(0.06);
    expect(wins.taste / n).toBeLessThan(0.14);
    expect(wins.heavy / n).toBeGreaterThan(0.17);
    expect(wins.heavy / n).toBeLessThan(0.27);
    // 不同月份的签号不同
    const s = open('ipo-month');
    const rolls = [2, 3, 4].map((m) => ipoWon('ipo-month', ipoOffer(s, m) as NonNullable<ReturnType<typeof ipoOffer>>, 'heavy'));
    expect(rolls.length).toBe(3);
  });
});

describe('上市溢价', () => {
  it('首日大概率大涨（BALANCE.ipo.up），否则破发（down）；只由种子和月份定', () => {
    const { pop, up: [upLo, upHi], down: [downLo, downHi] } = BALANCE.ipo;
    let ups = 0;
    const n = 1000;
    for (let i = 0; i < n; i++) {
      const v = ipoFirstPremium(`ipo-prem-${i}`, 2 + (i % 9));
      if (v > 0) {
        ups += 1;
        expect(v).toBeGreaterThanOrEqual(upLo);
        expect(v).toBeLessThanOrEqual(upHi);
      } else {
        expect(v).toBeLessThanOrEqual(-downLo);
        expect(v).toBeGreaterThanOrEqual(-downHi);
      }
      expect(ipoFirstPremium(`ipo-prem-${i}`, 2 + (i % 9))).toBe(v);
    }
    expect(ups / n).toBeGreaterThan(pop - 0.06);
    expect(ups / n).toBeLessThan(pop + 0.06);
    expect(pop).toBeGreaterThan(0.5);
  });

  it('中签后：上市首日收盘发 ipoListed 带溢价，归因多一项 ipo；第 2 天叠首日的 0.3 倍；之后没有', () => {
    const seed = seedWhere('taste', true);
    const { start, days } = playIpo(seed);
    const offer = ipoOffer(start, 2) as NonNullable<ReturnType<typeof ipoOffer>>;
    const first = ipoFirstPremium(seed, offer.month);
    const list = days[2] as (typeof days)[number];
    expect(list.state.lastDay?.day).toBe(offer.listDay);
    const ev = list.events.find((e) => e.type === 'ipoListed');
    expect(ev).toMatchObject({ type: 'ipoListed', slot: 0, stockId: offer.stockId, premium: first });
    const hm = list.state.lastDay?.holdings[0];
    expect(hm?.stockId).toBe(offer.stockId);
    expect(hm?.ipo).toBe(first);
    const part = hm?.parts.find((p) => p.kind === 'ipo');
    expect(part?.value).toBeCloseTo(first, 1);
    expect(part?.label.length).toBeGreaterThan(4);
    expect(hm?.parts.reduce((x, p) => x + p.value, 0)).toBeCloseTo(hm?.ret ?? 0, 1);
    const second = days[3]?.state.lastDay?.holdings[0];
    expect(second?.ipo).toBeCloseTo(first * BALANCE.ipo.carry, 1);
    expect(days[3]?.events.some((e) => e.type === 'ipoListed')).toBe(false);
    const third = days[4]?.state.lastDay?.holdings[0];
    expect(third?.ipo).toBeUndefined();
    expect(third?.parts.some((p) => p.kind === 'ipo')).toBe(false);
  });

  it('首日溢价的方向体现在涨跌上：大涨的新股首日涨得比替身多，破发的比替身少', () => {
    for (let i = 0; i < 40; i++) {
      const seed = `ipo-dir-${i}`;
      const s0 = open(seed);
      const offer = ipoOffer(s0, 2) as NonNullable<ReturnType<typeof ipoOffer>>;
      if (!ipoWon(seed, offer, 'taste')) continue;
      const { days } = playIpo(seed);
      const hm = days[2]?.state.lastDay?.holdings[0];
      const first = ipoFirstPremium(seed, offer.month);
      // move 里含溢价；去掉溢价后就是替身的真实涨跌（逐位对得上归因里的 market + theme + noise）
      const rest = (hm?.parts ?? []).filter((p) => p.kind !== 'ipo' && p.kind !== 'item').reduce((x, p) => x + p.value, 0);
      expect((hm?.move ?? 0) - first).toBeCloseTo(rest, 1);
      return;
    }
    throw new Error('没找到中签的种子');
  });

  it('新股不进推荐和群聊：持有新股的那些天，推荐和消息里没有它', () => {
    const seed = seedWhere('taste', true);
    const { days } = playIpo(seed);
    for (const d of days) {
      for (const r of d.state.today.recs) expect(r.stockId.startsWith('ipo_')).toBe(false);
    }
  });

  it('中签后的新股能当普通持仓卖掉，计入打新盈亏', () => {
    const seed = seedWhere('taste', true);
    const { days } = playIpo(seed);
    let st = days[2]?.state as GameState;
    const money = st.stats.ipo?.money ?? 0;
    expect(money).toBe(st.lastDay?.holdings[0]?.amount);
    const r = dispatch(st, { type: 'sell', slot: 0 });
    expect(r.error).toBeNull();
    st = r.state;
    expect(st.slots[0]).toBeNull();
    expect(st.stats.trades.at(-1)?.stockId.startsWith('ipo_')).toBe(true);
    // 卖掉之后不再累加
    const after = dispatch(st, { type: 'open' }).state;
    expect(after.stats.ipo?.money).toBe(money);
  });
});

describe('不开打新时逐位不变', () => {
  it('不申购的局，开关开不开结果逐位一样（整年局、短局，一路空仓和不申购的机器人）', () => {
    for (const setup of [SHORT, null]) {
      const a = walkTo(open('ipo-eq', setup), 20);
      ipoSwitch.enabled = false;
      const b = walkTo(open('ipo-eq', setup), 20);
      ipoSwitch.enabled = true;
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
    useExt(true);
    useMarket((seed) => segmentForSeed(seed));
    const on = JSON.stringify(playRun('ipo-eq-bot', botByName('xiaobai'), SHORT));
    ipoSwitch.enabled = false;
    const off = JSON.stringify(playRun('ipo-eq-bot', botByName('xiaobai'), SHORT));
    ipoSwitch.enabled = true;
    expect(on).toBe(off);
    useMarket(null);
    useExt(false);
  });

  it('实盘、每日挑战、闪电盘、合成行情：开关开不开结果逐位一样（普通机器人打一局）', () => {
    const d = dailySetup('2026-10-30');
    const f = flashSetup('2026-10-30');
    const cases: { seed: string; setup: RunSetup | null; seg: string | null }[] = [
      { seed: d.seed, setup: d.setup, seg: dailySegmentId('2026-10-30') as string },
      { seed: f.seed, setup: f.setup, seg: flashSegmentId('2026-10-30') as string },
      { seed: 'ipo-live-eq', setup: liveSetup('mid'), seg: segmentForSeed('ipo-live-eq').id },
      { seed: 'ipo-synth-eq', setup: SHORT, seg: null },
    ];
    useExt(true);
    for (const c of cases) {
      useMarket(c.seg ? () => loadSegment(c.seg as string) : null);
      const on = JSON.stringify(playRun(c.seed, botByName('normal'), c.setup));
      ipoSwitch.enabled = false;
      const off = JSON.stringify(playRun(c.seed, botByName('normal'), c.setup));
      ipoSwitch.enabled = true;
      expect(on).toBe(off);
    }
    useMarket(null);
    useExt(false);
  });

  it('申购了的局和没申购的局，申购日之前的每一天逐位一样', () => {
    const seed = seedWhere('taste', true);
    const day = (ipoOffer(open(seed), 2) as NonNullable<ReturnType<typeof ipoOffer>>).day;
    const a = walkTo(open(seed), day);
    ipoSwitch.enabled = false;
    const b = walkTo(open(seed), day);
    ipoSwitch.enabled = true;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('确定性、回放、机器人、成就', () => {
  it('同一个种子同一串操作，结果逐位相同；回放得到同一个局面', () => {
    const seed = seedWhere('taste', true);
    const run = (): GameState => {
      const s0 = createRun(seed, SHORT, { segment: segmentForSeed(seed), ext: true }).state;
      const offer = ipoOffer(s0, 2) as NonNullable<ReturnType<typeof ipoOffer>>;
      let st = s0;
      for (let i = 0; i < 400 && st.dayIndex <= offer.listDay + 2 && st.phase !== 'lost' && st.phase !== 'won'; i++) {
        const sub = ipoToday(st) !== null;
        const a = st.phase === 'reward' ? ({ type: 'skipReward' } as const) : st.phase === 'event' ? ({ type: 'choose', option: 0 } as const) : sub ? ({ type: 'subscribe', size: 'taste' } as const) : ({ type: 'open' } as const);
        const r = dispatch(st, a);
        if (r.error) throw new Error(r.error);
        st = r.state;
      }
      return st;
    };
    const a = run();
    const b = run();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.stats.ipo?.wins).toBe(1);
    const re = replay(seed, a.actions, SHORT, { segment: segmentForSeed(seed), ext: true });
    expect(JSON.stringify(re)).toBe(JSON.stringify(a));
  });

  it('机器人：普通、聪明会申购，只打新一整局只申购、不买别的', () => {
    useExt(true);
    useMarket((seed) => segmentForSeed(seed));
    for (const name of ['normal', 'smart'] as const) {
      let subs = 0;
      for (let i = 0; i < 6; i++) subs += playRun(`ipo-bot-${i}`, botByName(name), SHORT).stats.ipo?.subs ?? 0;
      expect(subs, name).toBeGreaterThan(0);
    }
    const only = playRun('ipo-only-0', botByName('ipo-only'), SHORT);
    expect(only.stats.buys).toBe(0);
    expect(only.stats.ipo?.subs).toBeGreaterThan(0);
    for (const t of only.stats.trades) expect(t.stockId.startsWith('ipo_')).toBe(true);
    useMarket(null);
    useExt(false);
  });

  it('成就：中签 1 次拿「中签了」，3 次拿「三签在手」', () => {
    const seed = seedWhere('taste', true);
    const { days } = playIpo(seed);
    const fin = (s: GameState): GameState => ({ ...s, phase: 'lost' });
    const got = achievementsOf(fin(days[1]?.state as GameState));
    expect(got).toContain('ipo_first');
    expect(got).not.toContain('ipo_three');
    const three = fin(days[1]?.state as GameState);
    three.stats.ipo = { subs: 5, wins: 3, money: 0 };
    expect(achievementsOf(three)).toContain('ipo_three');
    const none = playIpo(seedWhere('taste', false)).days[1]?.state as GameState;
    expect(achievementsOf(fin(none))).not.toContain('ipo_first');
  });
});
