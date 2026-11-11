import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  achievementsOf,
  achievementsView,
  codex,
  createRun,
  dailySetup,
  isRankedSetup,
  runSummary,
  seenOf,
  stockById,
  type DayReport,
  type GameState,
  type RunSetup,
  type TradeLog,
} from '../../src/core/index.ts';
import { SIX, fixedDay, must, quiet, withBalance } from '../helpers.ts';

const ICONS = ['chart_up', 'chart_down', 'fire', 'ice', 'rocket', 'crown', 'bill', 'cat', 'chat', 'megaphone', 'shield', 'skull', 'star', 'clover', 'coin', 'trophy'];

/** 一局结束的局面：phase 为 won / lost，再按需改统计。 */
function ended(phase: 'won' | 'lost', mutate: (s: GameState) => void = () => {}, setup: RunSetup | null = null, seed = 'ach', ext = false): GameState {
  const s = createRun(seed, setup, { ext }).state;
  s.phase = phase;
  mutate(s);
  return s;
}

/** 合成行情的局没有月度节奏，成就测试直接塞一份只有结果的。 */
function tempoWith(results: NonNullable<GameState['tempo']>['results']): NonNullable<GameState['tempo']> {
  return { plan: [], cur: null, streak: 0, bestStreak: 0, shards: 0, results, bonus: 0 };
}

function trade(t: Partial<TradeLog>): TradeLog {
  return { stockId: 'ai_leader', buyDay: 0, sellDay: 3, stage: 'rally', feel: 'hot', ret: 0, reason: 'sell', recBy: null, contra: false, guard: false, ...t };
}

/** 每个成就一个能达成的局面（构造测试：证明可达且判定正确）。 */
const CASES: Record<string, () => GameState> = {
  daily_checkin: () => ended('lost', () => {}, dailySetup('2026-10-10').setup, dailySetup('2026-10-10').seed),
  first_limitup: () => ended('lost', (s) => (s.stats.limitUpDays = 1)),
  leader_chain: () => ended('lost', (s) => (s.stats.chains = 1)),
  limit_down: () => ended('lost', (s) => (s.stats.limitDownDays = 1)),
  bust: () => ended('lost'),
  cat_rich: () => ended('lost', (s) => s.stats.surprisesPaid.push('vet')),
  half_year: () => ended('lost', (s) => (s.stats.billsPaid = 6)),
  qunzhu_tuition: () => ended('lost', (s) => s.stats.trades.push(trade({ recBy: 'qunzhu', ret: -12 }))),
  stand_guard: () => ended('lost', (s) => s.stats.trades.push(trade({ stage: 'climax', guard: true, ret: -20 }))),
  first_win: () => ended('won'),
  lianban_5: () => ended('lost', (s) => (s.stats.maxBoards = 5)),
  school_theme: () => ended('won', (s) => s.items.push('longtou', 'genfeng')),
  school_board: () => ended('won', (s) => s.items.push('yaogu', 'lianban')),
  school_steady: () => ended('won', (s) => s.items.push('baima', 'margin', 'ipo')),
  school_dip: () => ended('won', (s) => s.items.push('dixi', 'mood_meter', 'zhiying')),
  school_news: () => ended('won', (s) => s.items.push('paid_group', 'notebook')),
  contrarian: () => ended('lost', (s) => s.stats.trades.push(trade({ contra: true, ret: 12 }), trade({ contra: true, ret: 9 }))),
  data_driven: () => ended('won', (s) => s.items.push('night_review')),
  diversified: () => ended('lost', (s) => (s.stats.maxThemes = 4)),
  one_basket: () => ended('lost', (s) => (s.stats.maxSameTheme = 4)),
  big_day: () => ended('lost', (s) => (s.stats.maxDayRet = 8.2)),
  credit_win: () => ended('won', (s) => (s.stats.creditUsed = 1)),
  stock_god: () => ended('won', () => {}, { difficulty: 8 }),
  veteran: () => ended('won', () => {}, { difficulty: 5 }),
  millionaire: () => ended('lost', (s) => (s.stats.peakAccount = 1_000_000)),
  value_investor: () =>
    ended('lost', (s) => {
      s.stats.acquired.push('con_blue', 'fin_blue', 'ai_blue');
      s.stats.billsPaid = 9;
    }),
  limitup_crew: () => ended('lost', (s) => (s.stats.limitUpDays = 20)),
  naked: () => ended('won', () => {}, { difficulty: 3, persona: 'retiree' }),
  crash_survivor: () => ended('lost', (s) => (s.stats.crashRet = 1.5), { difficulty: 6 }),
  steady_dog: () => ended('won', (s) => (s.stats.monthRets = Array.from({ length: 12 }, () => 2))),
  // 0.4 C
  all_in: () => ended('won', (s) => s.ext && (s.ext.log.heavy = 3), null, 'ach', true),
  mouth_hard: () => ended('lost', (s) => s.ext && (s.ext.log.stubborn = 2), null, 'ach', true),
  air_force: () => ended('lost', (s) => s.ext && (s.ext.log.shortPnl = 50_000), null, 'ach', true),
  pawned: () => ended('lost', (s) => s.ext?.log.seized.push('car'), null, 'ach', true),
  redeemed: () => ended('lost', (s) => s.ext?.log.redeemed.push('bracelet'), null, 'ach', true),
  house_back: () => ended('won', (s) => s.ext?.log.redeemed.push('house'), null, 'ach', true),
  zen_watch: () => ended('lost', (s) => (s.stats.billsPaid = 2)),
  so_close: () => ended('lost', (s) => (s.month = 12)),
  chat_fan: () => ended('won', (s) => s.stats.trades.push(...Array.from({ length: 10 }, () => trade({ recBy: 'laowang' })))),
  loner: () => ended('won', (s) => s.stats.trades.push(...Array.from({ length: 10 }, () => trade({})))),
  every_day: () => ended('won', (s) => (s.stats.days = s.stats.activeDays = 58)),
  lucky_88: () => ended('lost', (s) => (s.account = 12_388.5)),
  busy_nothing: () => ended('won', (s) => { s.stats.buys = 20; s.stats.tradeMoney = -300; }),
  nail: () => ended('won', (s) => (s.stats.buys = 3)),
  phoenix: () => ended('won', (s) => (s.stats.monthRets = [5, -45, 30])),
  sit_tight: () => ended('lost', (s) => s.stats.trades.push(trade({ buyDay: 3, sellDay: 23, ret: 4 }))),
  no_red: () => ended('won', (s) => s.stats.trades.push(...Array.from({ length: 6 }, (_, i) => trade({ ret: i })))),
  take_profit: () => ended('lost', (s) => s.stats.trades.push(trade({ ret: 20 }))),
  peanuts: () => ended('lost', (s) => (s.stats.eventPicks = ['old_trader:0'])),
  moonlight: () => ended('won', (s) => (s.stats.eventPicks = ['salary_advance:0'])),
  early_riser: () => ended('won', (s) => s.items.push('early_bird')),
  group_member: () => ended('lost', (s) => (s.stats.eventPicks = ['invest_group:0'])),
  egg_queue: () => ended('lost', (s) => (s.stats.eventPicks = ['free_eggs:0'])),
  herd_chat: () => ended('lost', (s) => (s.tempo = tempoWith([{ month: 2, id: 'flood_month', done: true }]))),
  swan_hunter: () => ended('lost', (s) => (s.lastDay = swanDay(100, 101))),
  ipo_first: () => ended('lost', (s) => (s.stats.ipo = { subs: 2, wins: 1, money: 0 })),
  ipo_three: () => ended('lost', (s) => (s.stats.ipo = { subs: 5, wins: 3, money: 0 })),
};

/** 最后一天带黑天鹅的收盘报告（只填成就用到的字段）：账户从 before 到 after。 */
function swanDay(before: number, after: number, swan = true): DayReport {
  return { account: { before, after }, ...(swan ? { swan: { kind: 'blackout', name: '大停电', theme: null, money: 0, touched: false } } : {}) } as unknown as DayReport;
}

/** 差一点没达成的局面（判定的边界）。 */
const NEAR: Record<string, () => GameState> = {
  // 种子对不上 dailySetup 的"每日挑战"不算
  daily_checkin: () => ended('lost', () => {}, dailySetup('2026-10-10').setup, 'not-daily'),
  first_limitup: () => ended('lost'),
  half_year: () => ended('lost', (s) => (s.stats.billsPaid = 5)),
  qunzhu_tuition: () => ended('lost', (s) => s.stats.trades.push(trade({ recBy: 'qunzhu', ret: -12, reason: 'end' }), trade({ recBy: 'xiaoli', ret: -12 }))),
  stand_guard: () => ended('lost', (s) => s.stats.trades.push(trade({ stage: 'climax', guard: false }))),
  lianban_5: () => ended('lost', (s) => (s.stats.maxBoards = 4)),
  school_theme: () => ended('lost', (s) => s.items.push('longtou', 'genfeng')),
  school_steady: () => ended('won', (s) => s.items.push('baima', 'margin')),
  contrarian: () => ended('lost', (s) => s.stats.trades.push(trade({ contra: true, ret: 19.9 }), trade({ contra: false, ret: 30 }))),
  data_driven: () => ended('lost', (s) => s.items.push('mood_meter')),
  diversified: () => ended('lost', (s) => (s.stats.maxThemes = 3)),
  big_day: () => ended('lost', (s) => (s.stats.maxDayRet = 7.9)),
  credit_win: () => ended('lost', (s) => (s.stats.creditUsed = 1)),
  stock_god: () => ended('won', () => {}, { difficulty: 7 }),
  veteran: () => ended('won', () => {}, { difficulty: 4 }),
  millionaire: () => ended('lost', (s) => (s.stats.peakAccount = 999_999)),
  value_investor: () =>
    ended('lost', (s) => {
      s.stats.acquired.push('con_blue', 'ai_leader');
      s.stats.billsPaid = 12;
    }),
  limitup_crew: () => ended('lost', (s) => (s.stats.limitUpDays = 19)),
  naked: () => ended('won', (s) => s.stats.itemsTaken.push('ipo'), { difficulty: 3 }),
  crash_survivor: () => ended('lost', (s) => (s.stats.crashRet = -0.5), { difficulty: 6 }),
  steady_dog: () => ended('won', (s) => (s.stats.monthRets = Array.from({ length: 12 }, (_, i) => (i === 7 ? -0.1 : 2)))),
  all_in: () => ended('lost', (s) => s.ext && (s.ext.log.heavy = 5), null, 'ach', true),
  mouth_hard: () => ended('lost', (s) => s.ext && (s.ext.log.stubborn = 1), null, 'ach', true),
  air_force: () => ended('won', (s) => s.ext && (s.ext.log.shortPnl = 49_999), null, 'ach', true),
  house_back: () => ended('won', (s) => s.ext?.log.redeemed.push('car'), null, 'ach', true),
  zen_watch: () => ended('lost', (s) => { s.stats.billsPaid = 5; s.stats.buys = 1; }),
  so_close: () => ended('lost', (s) => (s.month = 11)),
  chat_fan: () => ended('won', (s) => s.stats.trades.push(...Array.from({ length: 10 }, (_, i) => trade({ recBy: i ? 'laowang' : null })))),
  loner: () => ended('won', (s) => s.stats.trades.push(...Array.from({ length: 9 }, () => trade({})))),
  every_day: () => ended('won', (s) => { s.stats.days = 58; s.stats.activeDays = 57; }),
  lucky_88: () => ended('lost', (s) => (s.account = 12_389)),
  busy_nothing: () => ended('won', (s) => { s.stats.buys = 20; s.stats.tradeMoney = 5_000_000; }),
  nail: () => ended('won', (s) => { s.stats.buys = 3; s.stats.sells = 1; }),
  phoenix: () => ended('lost', (s) => (s.stats.monthRets = [5, -45, 30])),
  // 差一天、没赚、押跌不算拿股
  sit_tight: () =>
    ended('lost', (s) =>
      s.stats.trades.push(trade({ buyDay: 3, sellDay: 22, ret: 40 }), trade({ buyDay: 3, sellDay: 30, ret: 0 }), trade({ buyDay: 3, sellDay: 30, ret: 40, short: true })),
    ),
  // 差一笔、有一笔亏、没通关
  no_red: () => ended('won', (s) => s.stats.trades.push(...Array.from({ length: 5 }, () => trade({ ret: 3 })))),
  // 没到 20%、押跌、自动卖出、到期没卖都不算；婉拒；预支了但没通关
  take_profit: () =>
    ended('won', (s) =>
      s.stats.trades.push(trade({ ret: 19.9 }), trade({ ret: 50, short: true }), trade({ ret: 50, reason: 'end' }), trade({ ret: 50, reason: 'replace' })),
    ),
  peanuts: () => ended('won', (s) => (s.stats.eventPicks = ['old_trader:1', 'salary_advance:0'])),
  moonlight: () => ended('lost', (s) => (s.stats.eventPicks = ['salary_advance:0'])),
  // 带着战法但没通关；婉拒了投资群
  early_riser: () => ended('lost', (s) => s.items.push('dip_buyer', 'early_bird')),
  group_member: () => ended('won', (s) => (s.stats.eventPicks = ['invest_group:1'])),
  egg_queue: () => ended('won', (s) => (s.stats.eventPicks = ['free_eggs:1'])),
  // 遇到了但没完成目标，或完成的是别的主题
  herd_chat: () =>
    ended('won', (s) => (s.tempo = tempoWith([{ month: 2, id: 'herd_month', done: false }, { month: 3, id: 'fomo_month', done: true }]))),
  // 黑天鹅那天账户跌了、没动（空仓）、或者那天没有黑天鹅，都不算
  swan_hunter: () => ended('won', (s) => (s.lastDay = swanDay(100, 99.9))),
  // 申购了但一次没中不算"中签了"；只中 2 次不算"三签在手"
  ipo_first: () => ended('won', (s) => (s.stats.ipo = { subs: 4, wins: 0, money: 0 })),
  ipo_three: () => ended('won', (s) => (s.stats.ipo = { subs: 6, wins: 2, money: 0 })),
};
const NEAR_SWAN_FLAT = () => ended('won', (s) => (s.lastDay = swanDay(100, 100)));
const NEAR_SWAN_NONE = () => ended('won', (s) => (s.lastDay = swanDay(100, 120, false)));
const NEAR_NO_RED_LOSS = () => ended('won', (s) => s.stats.trades.push(...Array.from({ length: 6 }, (_, i) => trade({ ret: i ? 3 : -0.1 }))));
const NEAR_NO_RED_LOST = () => ended('lost', (s) => s.stats.trades.push(...Array.from({ length: 6 }, () => trade({ ret: 3 }))));

describe('成就（30 + 0.4 C 6 个 + 隐藏与打法 + 持仓节奏）', () => {
  it('57 个：铜 27、银 19、金 11；id 不重复；图标只用约定的 16 个', () => {
    expect(ACHIEVEMENTS).toHaveLength(57);
    const tiers = { bronze: 0, silver: 0, gold: 0 };
    for (const d of ACHIEVEMENTS) tiers[d.tier] += 1;
    expect(tiers).toEqual({ bronze: 27, silver: 19, gold: 11 });
    expect(new Set(ACHIEVEMENTS.map((d) => d.id)).size).toBe(57);
    for (const d of ACHIEVEMENTS) {
      expect(ICONS).toContain(d.icon);
      expect(d.name.length).toBeGreaterThan(1);
      expect(d.desc.length).toBeGreaterThan(4);
    }
    expect(achievementsView().map((v) => v.tierLabel)).toContain('金');
    // 解锁：coder ← 银档，youzi ← 金档
    expect(ACHIEVEMENTS.filter((d) => d.unlocks).map((d) => [d.unlocks, d.tier])).toEqual([
      ['coder', 'silver'],
      ['youzi', 'gold'],
    ]);
  });

  it('每个成就都有构造局面能达成（判定确定、可测试）', () => {
    expect(Object.keys(CASES).sort()).toEqual(ACHIEVEMENTS.map((d) => d.id).sort());
    for (const [id, make] of Object.entries(CASES)) {
      const got = achievementsOf(make());
      expect(got, id).toContain(id);
      expect(achievementsOf(make()), `${id} 确定性`).toEqual(got);
    }
  });

  it('判定的边界：差一点就不算', () => {
    for (const [id, make] of Object.entries(NEAR)) expect(achievementsOf(make()), id).not.toContain(id);
    // 价值投资：只买白马但只撑了 8 个月；一只都没买过
    const eight = ended('lost', (s) => {
      s.stats.acquired.push('con_blue');
      s.stats.billsPaid = 8;
    });
    expect(achievementsOf(eight)).not.toContain('value_investor');
    expect(achievementsOf(ended('lost', (s) => (s.stats.billsPaid = 12)))).not.toContain('value_investor');
    // 稳赚不赔：有一笔亏 0.1、没通关，都不算
    expect(achievementsOf(NEAR_NO_RED_LOSS())).not.toContain('no_red');
    expect(achievementsOf(NEAR_SWAN_FLAT())).not.toContain('swan_hunter');
    expect(achievementsOf(NEAR_SWAN_NONE())).not.toContain('swan_hunter');
    expect(achievementsOf(NEAR_NO_RED_LOST())).not.toContain('no_red');
  });

  it('什么都没做就爆仓只拿"韭菜的自我修养"；通关只拿"上岸"；局中不判定', () => {
    expect(achievementsOf(ended('lost'))).toEqual(['bust']);
    expect(achievementsOf(ended('won'))).toEqual(['first_win']);
    expect(achievementsOf(createRun('mid').state)).toEqual([]);
  });

  it('结束页小结带上成就、人设、难度、图鉴；调试开局标为不计入', () => {
    const s = ended('won', (x) => (x.stats.limitUpDays = 3), { persona: 'mom', difficulty: 2 });
    const sum = runSummary(s);
    expect(sum.ended).toBe(true);
    expect(sum.achievements).toEqual(['first_limitup', 'first_win']);
    expect(sum.persona).toBe('mom');
    expect(sum.difficulty).toBe(2);
    expect(sum.ranked).toBe(true);
    expect(sum.seen.stocks.length).toBeGreaterThan(20);
    expect(runSummary(ended('won', () => {}, { items: ['ipo'] })).ranked).toBe(false);
    expect(isRankedSetup(null)).toBe(true);
    expect(isRankedSetup({ persona: 'newbie', difficulty: 3, daily: '2026-10-10' })).toBe(true);
    expect(isRankedSetup({ account: 1 })).toBe(false);
  });
});

describe('成就用到的局内统计', () => {
  it('跌停日、单日最大涨幅、同时覆盖的题材数和同题材只数', () => {
    withBalance(quiet, () => {
      const s = fixedDay({ holdings: ['ai_leader', 'ai_meme', 'ne_leader', 'con_leader'] }, { ai: -40, newenergy: 40, consumer: 40 });
      const r = must(s, { type: 'open' }).state;
      expect(r.stats.limitDownDays).toBe(1);
      expect(r.stats.maxThemes).toBe(3);
      expect(r.stats.maxSameTheme).toBe(2);
      expect(r.stats.maxDayRet).toBe(Math.max(0, r.lastDay?.account.ret ?? 0));
    });
  });

  it('站岗：高潮期买入，持有期间题材进入退潮，了结时记 guard', () => {
    withBalance(quiet, () => {
      let s = createRun('guard', { themes: SIX }).state;
      const rec = s.today.recs[0];
      if (!rec) throw new Error('no rec');
      const realTheme = stockById(rec.stockId).theme;
      const t0 = s.themes[realTheme];
      if (t0) t0.stage = 'climax';
      s = must(s, { type: 'buy', rec: 0, slot: 0 }).state;
      expect(s.slots[0]?.buyStage).toBe('climax');
      const t1 = s.themes[realTheme];
      if (t1) {
        t1.stage = 'ebb';
        t1.left = 5;
      }
      s = must(s, { type: 'open' }).state;
      expect(s.slots[0]?.sawEbb).toBe(true);
      s = must(s, { type: 'sell', slot: 0 }).state;
      expect(s.stats.trades.at(-1)?.guard).toBe(true);
    });
  });

  it('反向：买入当天群主唱空这个题材，持仓带 contra；推荐人记在 recBy', () => {
    let found = 0;
    for (let i = 0; i < 300 && found < 3; i++) {
      const s = createRun(`contra-${i}`).state;
      s.today.recs.forEach((r, k) => {
        const theme = stockById(r.stockId).theme;
        const down = s.today.messages.some((m) => m.friendId === 'qunzhu' && m.theme === theme && m.claim === 'down');
        if (!down || found >= 3) return;
        const b = must(s, { type: 'buy', rec: k, slot: 0 }).state;
        expect(b.slots[0]?.contra).toBe(true);
        expect(b.slots[0]?.recBy).toBe(r.friendId);
        found += 1;
      });
    }
    expect(found).toBe(3);
  });

  it('一整局：每月涨跌、还过的突发账单、进过持仓的股票、见过的东西都记下来', () => {
    let s = createRun('stats-run', { account: 1e9 }).state;
    for (let i = 0; i < 400 && s.phase !== 'won'; i++) {
      const a =
        s.phase === 'premarket'
          ? s.today.buysLeft > 0 && s.slots.some((h) => h === null) && s.today.recs[0] && !s.today.recs[0].taken && !s.slots.some((h) => h?.stockId === s.today.recs[0]?.stockId)
            ? { type: 'buy' as const, rec: 0 }
            : { type: 'open' as const }
          : s.phase === 'reward'
            ? { type: 'pickReward' as const, index: 0, slot: 0 }
            : { type: 'choose' as const, option: 0 };
      s = must(s, a).state;
    }
    expect(s.phase).toBe('won');
    expect(s.stats.monthRets).toHaveLength(12);
    const extras = new Set<string>();
    expect(s.stats.surprisesPaid.length).toBeGreaterThanOrEqual(2);
    for (const id of s.stats.surprisesPaid) extras.add(id);
    expect(extras.size).toBe(s.stats.surprisesPaid.length);
    expect(s.stats.acquired.length).toBeGreaterThan(3);
    const seen = seenOf(s);
    expect(seen.stocks).toHaveLength(Object.keys(s.stocks).length);
    expect(seen.friends.length).toBeGreaterThanOrEqual(6);
    expect(seen.items.length).toBeGreaterThanOrEqual(s.items.length);
    expect(seen.events).toEqual([...new Set(s.stats.events)].sort((a, b) => codex().events.findIndex((e) => e.id === a) - codex().events.findIndex((e) => e.id === b)));
  });
});

