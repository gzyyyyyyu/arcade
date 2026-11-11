import { describe, expect, it } from 'vitest';
import { WEEKLIES, WEEKLY_ORDER, WEEKLY_FX } from '../../src/content/weekly.ts';
import { createWorld, step, type World } from '../../src/core/index.ts';
import { chestSize } from '../../src/core/step.ts';
import { normalizeSetup, type Setup } from '../../src/core/state.ts';
import { dailyPlan, isDailySetup } from '../../src/online/daily.ts';
import { formatScore, submissionsFor, vigilScore } from '../../src/online/score.ts';
import { WEEKLY_MAPS, beijingIsoWeek, weekDaysLeft, weekIndex, weekStart, weeklyDateOpen, weeklyFor, weeklyPlan } from '../../src/online/weekly.ts';
import { MAP_IDS } from '../../src/content/maps.ts';
import { runCoins } from '../../src/platform/save.ts';
import { tonightRules } from '../../src/view/ui/codexNights.ts';
import type { RunSummary } from '../../src/online/types.ts';

describe('每周夜事：日期 → 事件', () => {
  it('周一起算，周一到周日同一周，周一换事件', () => {
    expect(weekStart('2026-10-26')).toBe('2026-10-26'); // 周一
    expect(weekStart('2026-11-01')).toBe('2026-10-26'); // 周日
    expect(weekStart('2026-11-02')).toBe('2026-11-02');
    expect(weekIndex('2026-11-02')).toBe(weekIndex('2026-10-26') + 1);
    expect(weeklyFor('2026-10-26')).toBe(weeklyFor('2026-11-01'));
    expect(weeklyFor('2026-10-26')!.id).not.toBe(weeklyFor('2026-11-02')!.id);
  });
  it('剩余天数含今天：周一 7、周日 1', () => {
    expect(weekDaysLeft('2026-10-26')).toBe(7);
    expect(weekDaysLeft('2026-10-30')).toBe(3);
    expect(weekDaysLeft('2026-11-01')).toBe(1);
    expect(weekDaysLeft('2026-11-02')).toBe(7);
  });
  it('表长 4–6，id 和轮换表一一对应', () => {
    expect(Object.keys(WEEKLIES).sort()).toEqual([...WEEKLY_ORDER].sort());
    expect(WEEKLY_ORDER.length).toBeGreaterThanOrEqual(4);
    expect(WEEKLY_ORDER.length).toBeLessThanOrEqual(6);
  });
  it('一整轮（连着表长那么多周）正好各出现一次', () => {
    const ids = new Set<string>();
    let d = Date.UTC(2026, 10, 2);
    for (let k = 0; k < WEEKLY_ORDER.length; k++, d += 7 * 86400_000) ids.add(weeklyFor(new Date(d).toISOString().slice(0, 10))!.id);
    expect(ids.size).toBe(WEEKLY_ORDER.length);
  });
  it('坏日期返回 null', () => {
    expect(weeklyFor('abc')).toBeNull();
    expect(weekStart('2026/10/26')).toBe('');
    expect(weekDaysLeft('x')).toBe(0);
  });
});

const base = (weekly?: Setup['weekly']): Setup => ({ seed: 7, mode: 'vigil', danger: 2, ...(weekly ? { weekly } : {}) });

describe('每周夜事：只给守夜局', () => {
  it('夜探、实盘、坏 id 都被去掉；每日挑战不算每日', () => {
    expect(normalizeSetup({ ...base('coin'), mode: 'raid', raid: { template: 'guzhen' } as never }).weekly).toBeUndefined();
    expect(normalizeSetup({ ...base('coin'), live: true }).weekly).toBeUndefined();
    expect(normalizeSetup({ ...base('coin'), weekly: 'nope' as never }).weekly).toBeUndefined();
    expect(normalizeSetup(base('coin')).weekly).toBe('coin');
    expect('weekly' in normalizeSetup(base())).toBe(false);
    const p = dailyPlan('2026-10-30', 'vigil').setup;
    expect(isDailySetup('2026-10-30', p)).toBe(true);
    expect(isDailySetup('2026-10-30', { ...p, weekly: 'coin' })).toBe(false);
  });
});

const fp = (w: World): string => [w.coins, w.kills, w.dCount, w.level, w.hp].join();

function run(setup: Setup, ticks: number): World {
  const w = createWorld(setup);
  for (let t = 0; t < ticks; t++) {
    w.hp = w.stats.hpMax; // 站着不动也不死，才能打够久
    if (w.phase === 'choose') step(w, 0, 0);
    else step(w, 0);
  }
  return w;
}

describe('每周夜事：核心开 / 不开', () => {
  it('不开 = 和没这个字段完全一样（同种子同指纹）', () => {
    const a = run(base(), 1500);
    const b = run({ ...base(), weekly: undefined }, 1500);
    expect(a.kills).toBe(b.kills);
    expect(a.coins).toBe(b.coins);
    expect(a.coinBy.weekly).toBe(0);
  });
  it('精英周：精英多一只；打倒精英多给铜钱、单列', () => {
    const count = (s: Setup): number => createWorld(s).schedule.filter((e) => e.kind === 'elite').reduce((n, e) => n + e.count, 0);
    // 1:45 那只（small）不跟精英周加只
    expect(count(base('elite'))).toBe(count(base()) + (createWorld(base()).schedule.filter((e) => e.kind === 'elite' && !e.small).length) * WEEKLY_FX.eliteExtra);
    for (const id of ['coin', 'lantern', 'moon', 'chest'] as const) expect(count(base(id))).toBe(count(base()));
  });
  it('灯会周：同种子下掉落和不开不一样', () => {
    const plain = run(base(), 4500);
    expect(fp(run(base('lantern'), 4500))).not.toBe(fp(plain));
  });
});

describe('每周夜事：宝箱周', () => {
  it('大箱（≥3 件）更常见，不开时和平时一样', () => {
    const big = (s: Setup): number => {
      const w = createWorld(s);
      let n = 0;
      for (let k = 0; k < 4000; k++) if (chestSize(w, 1) >= 3) n++;
      return n;
    };
    expect(big(base('chest'))).toBeGreaterThan(big(base()) * 1.2);
  });
});

describe('每周夜事：铜钱和榜', () => {
  const end = (weekly?: Setup['weekly']): Parameters<typeof runCoins>[0] => ({ id: 'x', danger: 2, won: true, quit: false, ticks: 27000, kills: 400, coins: 300, curses: 0, ...(weekly ? { weekly } : {}) });
  it('铜钱周在结算多 50%，单列一行；不开没有这一行', () => {
    const off = runCoins(end());
    const on = runCoins(end('coin'));
    const sum = (r: { coins: number }[]): number => r.reduce((a, c) => a + c.coins, 0);
    expect(off.find((r) => r.label === '本周夜事')).toBeUndefined();
    const row = on.find((r) => r.label === '本周夜事')!;
    expect(row.coins).toBe(Math.floor(sum(off) * 0.5));
    expect(sum(on)).toBe(sum(off) + row.coins);
  });
  it('精英周的额外铜钱单列，不重复算进捡到的', () => {
    const r = runCoins({ ...end('elite'), coinBy: { drop: 0, purse: 0, prop: 0, chest: 0, weekly: 30 }, coins: 330 });
    expect(r.find((x) => x.label === '本周夜事')!.coins).toBe(30);
    expect(r.find((x) => x.label === '捡到的铜钱')!.coins).toBe(300);
  });
  const sum = (weekly?: Setup['weekly'], week: string | null = null): RunSummary => ({ runId: 'r', setup: base(weekly), won: true, quit: false, bossKilled: false, seconds: 900, kills: 100, level: 10, coins: 1, loot: 0, live: false, reducedDamage: false, daily: null, weekly: week });
  it('普通局（没挂事件）照常交总榜；带着事件却不是本周挑战的局什么都不交', () => {
    const today = '2026-10-30';
    expect(submissionsFor(sum(), today).map((s) => s.boardId)).toEqual(['vigil']);
    for (const id of WEEKLY_ORDER) expect(submissionsFor(sum(id), today)).toEqual([]);
  });
  it('本周夜事挑战只交周榜，分数同守夜总榜公式；不进总榜和每日榜', () => {
    const today = '2026-10-30';
    const out = submissionsFor(sum('coin', today), today);
    expect(out).toEqual([{ board: 'weekly-vigil', boardId: 'week-2026-W44-vigil', score: vigilScore({ danger: 2, seconds: 900, kills: 100, bossKilled: false }) }]);
    expect(formatScore('weekly-vigil', out[0]!.score)).toBe('危险2 · 15:00 · 斩100');
    expect(submissionsFor({ ...sum('coin', today), quit: true }, today)).toEqual([]);
  });
  it('只收本周的：隔周不交，周一当天还能交上周的', () => {
    expect(weeklyDateOpen('2026-10-26', '2026-11-01')).toBe(true); // 同一周
    expect(weeklyDateOpen('2026-11-01', '2026-11-02')).toBe(true); // 周一交上周日开的局
    expect(weeklyDateOpen('2026-11-01', '2026-11-03')).toBe(false); // 周二起不收
    expect(weeklyDateOpen('2026-10-26', '2026-11-02')).toBe(true); // 周一（上周一开的）
    expect(weeklyDateOpen('2026-10-20', '2026-11-02')).toBe(false);
    expect(submissionsFor(sum('coin', '2026-11-01'), '2026-11-04')).toEqual([]);
    expect(weeklyDateOpen('2026-11-09', '2026-11-02')).toBe(false); // 不收未来的周
  });
});

describe('每周夜事挑战：ISO 周和固定配置', () => {
  it('北京 ISO 周：周一换周，年份按周四所在的年（跨年）', () => {
    expect(beijingIsoWeek('2026-10-30')).toBe('2026-W44');
    expect(beijingIsoWeek('2026-10-26')).toBe('2026-W44');
    expect(beijingIsoWeek('2026-11-01')).toBe('2026-W44');
    expect(beijingIsoWeek('2026-11-02')).toBe('2026-W45');
    expect(beijingIsoWeek('2026-12-31')).toBe('2026-W53');
    expect(beijingIsoWeek('2027-01-01')).toBe('2026-W53');
    expect(beijingIsoWeek('2027-01-03')).toBe('2026-W53');
    expect(beijingIsoWeek('2027-01-04')).toBe('2027-W01');
    expect(beijingIsoWeek('2024-12-30')).toBe('2025-W01');
    expect(beijingIsoWeek('bad')).toBe('');
  });
  it('固定配置：本周事件、危险 2、小道士、不带加成咒印；种子由调用方给', () => {
    const p = weeklyPlan('2026-10-30', 123);
    expect(p.week).toBe('2026-W44');
    expect(p.boardId).toBe('week-2026-W44-vigil');
    expect(p.event).toBe(weeklyFor('2026-10-30'));
    expect(p.setup).toMatchObject({ seed: 123, mode: 'vigil', danger: 2, character: 'xiaodao', perks: {}, curses: [], weekly: p.event.id });
    expect(p.setup.assist).toBeUndefined();
    expect(normalizeSetup(p.setup).weekly).toBe(p.event.id);
    expect(weeklyPlan('2026-10-26', 9).setup.map).toBe(p.setup.map); // 同一周同一张图
    expect(() => weeklyPlan('x')).toThrow();
  });
  it('地图按周序号轮换 WEEKLY_MAPS', () => {
    const maps = new Set<string>();
    let d = Date.UTC(2026, 10, 2);
    for (let k = 0; k < WEEKLY_MAPS.length; k++, d += 7 * 86400_000) maps.add(weeklyPlan(new Date(d).toISOString().slice(0, 10)).setup.map!);
    expect(maps.size).toBe(WEEKLY_MAPS.length);
    for (const m of maps) expect(MAP_IDS).toContain(m);
  });
});

describe('每周夜事：界面文案', () => {
  it('暂停面板「今晚的规矩」带本周夜事；夜探不带', () => {
    expect(tonightRules({ mode: 'vigil', danger: 2, weekly: 'coin' })!.weekly).toContain('铜钱周');
    expect(tonightRules({ mode: 'raid', danger: 2, weekly: 'coin' })?.weekly ?? null).toBeNull();
    // 连战不开地图事件，暂停面板不写"第 4、8、12 分钟"
    expect(tonightRules({ mode: 'vigil', danger: 2, map: 'icelake' })!.event).not.toBeNull();
    expect(tonightRules({ mode: 'vigil', danger: 2, map: 'icelake', rush: true })?.event ?? null).toBeNull();
  });
});
