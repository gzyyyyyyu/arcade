import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createWorld, Ev, fingerprint, rushPlan, rushResult, step, type World } from '../../src/core/index.ts';
import { RUSH } from '../../src/content/rush.ts';
import { midBossOf } from '../../src/content/waves.ts';
import { shiftDate } from '../../src/online/daily.ts';
import { decodeRush, isRushSetup, rushBoardId, rushDaily, rushScore } from '../../src/online/rush.ts';
import { formatScore, submissionsFor } from '../../src/online/score.ts';
import { buildShareCard } from '../../src/online/share.ts';
import type { RunSummary } from '../../src/online/types.ts';
import type { RushResult } from '../../src/core/rush.ts';
import { Bot } from '../../tools/bots.ts';

const DAY = '2026-11-02';

/** 带种子的伪随机摇杆（和 core.test 同一种），选卡按 0–2 轮着选 */
function play(setup: ReturnType<typeof rushDaily>['setup'], ticks: number, onTick?: (w: World, t: number) => void): World {
  const w = createWorld(setup);
  let s = setup.seed >>> 0;
  let dir = 1;
  for (let t = 0; t < ticks && w.phase !== 'over'; t++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    if (s % 23 === 0) dir = s % 33;
    step(w, dir, w.phase === 'choose' ? s % 3 : -1);
    onTick?.(w, t);
  }
  return w;
}

describe('首领连战：每日配置', () => {
  it('同一天同一套，换一天就不一样', () => {
    expect(rushDaily(DAY)).toEqual(rushDaily(DAY));
    const plans = Array.from({ length: 14 }, (_, i) => {
      const s = rushDaily(shiftDate(DAY, i)).setup;
      return JSON.stringify([s.map, rushPlan(s.seed, s.map!)]);
    });
    expect(new Set(plans).size).toBe(14);
    // 两周里流派、地图都不止一种
    expect(new Set(plans.map((p) => JSON.parse(p)[1].school)).size).toBeGreaterThan(2);
    expect(new Set(plans.map((p) => JSON.parse(p)[0])).size).toBeGreaterThan(2);
  });

  it('关卡骨架：九只，第五关纸扎老爷，最后一关尸王；构筑三到四件法器、一到两件被动', () => {
    for (let i = 0; i < 30; i++) {
      const s = rushDaily(shiftDate(DAY, i)).setup;
      const p = rushPlan(s.seed, s.map!);
      expect(p.total).toBe(9);
      expect(p.stages[4]).toEqual([midBossOf(s.map)]);
      expect(p.stages[6]).toEqual(['boss']);
      expect(p.weapons.length).toBeGreaterThanOrEqual(3);
      expect(p.weapons.length).toBeLessThanOrEqual(4);
      expect(p.passives.length).toBeGreaterThanOrEqual(1);
      expect(p.passives.length).toBeLessThanOrEqual(2);
      // 进化了的主法器一定带着它要的被动
      if (p.weapons[0]!.evolved) expect(p.passives.length).toBe(2);
    }
  });

  it('开局就是给好的构筑：等级、法器、被动对得上，没有摆设', () => {
    const s = rushDaily(DAY).setup;
    const w = createWorld(s);
    const p = rushPlan(s.seed, s.map!);
    expect(w.level).toBe(RUSH.level);
    expect(w.weapons.map((o) => [o.id, o.level, o.evolved])).toEqual(p.weapons.map((o) => [o.id, o.level, o.evolved]));
    for (const x of p.passives) expect(w.passives[x.id]).toBe(x.level);
    expect(w.pAlive.some((v) => v === 1)).toBe(false);
    expect(w.hp).toBe(w.stats.hpMax);
  });

  it('校验：只认当天的配置', () => {
    const s = rushDaily(DAY).setup;
    expect(isRushSetup(DAY, s)).toBe(true);
    expect(isRushSetup(shiftDate(DAY, 1), s)).toBe(false);
    expect(isRushSetup(DAY, { ...s, assist: true })).toBe(false);
    expect(isRushSetup(DAY, { ...s, rush: false })).toBe(false);
  });
});

describe('首领连战：规则', () => {
  it('同种子同输入，逐拍指纹相同（录像能重放）', () => {
    const s = rushDaily(DAY).setup;
    const a: number[] = [];
    const b: number[] = [];
    play(s, RUSH.limit, (w, t) => t % 60 === 0 && a.push(fingerprint(w)));
    play(s, RUSH.limit, (w, t) => t % 60 === 0 && b.push(fingerprint(w)));
    expect(a.length).toBeGreaterThan(20);
    expect(b).toEqual(a);
  });

  it('5 分钟内一定收工；一关一关上，打倒的只数和关底对得上', () => {
    const s = rushDaily(DAY).setup;
    let starts = 0;
    const w = play(s, RUSH.limit + 600, (x) => {
      for (let i = 0; i < x.ev.n; i++) if (x.ev.type[i] === Ev.Rush && x.ev.a[i] === 0) starts++;
    });
    expect(w.phase).toBe('over');
    expect(w.tick).toBeLessThanOrEqual(RUSH.limit);
    const r = rushResult(w)!;
    expect(r.total).toBe(9);
    expect(r.down).toBe(w.rushDown);
    expect(starts).toBe(w.rushStage + (w.rushAt < 0 && w.rushEnd < 0 ? 1 : 0));
    // 没有常规怪的时间线、没有地图事件
    expect(w.schedule.length).toBe(0);
  });

  it('普通机器人能打倒几只；全清的局算赢、尸王倒了不提前天亮', () => {
    let any = false;
    for (let i = 0; i < 12 && !any; i++) {
      const s = rushDaily(shiftDate(DAY, i)).setup;
      const w = createWorld(s);
      const bot = new Bot('normal', w.rush!.school, s.seed);
      while (w.phase !== 'over') {
        const a = bot.act(w);
        step(w, a.dir, a.choice);
      }
      const r = rushResult(w)!;
      expect(r.down).toBeLessThanOrEqual(r.total);
      if (r.cleared) {
        any = true;
        expect(w.won).toBe(true);
        expect(w.rushEnd).toBe(w.tick);
        expect(r.down).toBe(r.total);
      } else expect(w.won).toBe(false);
    }
    expect(any).toBe(true);
  }, 60_000);
});

describe('首领连战：分数和榜', () => {
  const R = (o: Partial<RushResult>): RushResult => ({ down: 0, total: 9, cleared: false, ticks: RUSH.limit, progress: 0, ...o });

  it('全清 > 没全清；全清比快；没全清比只数、再比最后一关打掉多少', () => {
    const order = [
      R({ down: 9, cleared: true, ticks: 120 * 30 }),
      R({ down: 9, cleared: true, ticks: 200 * 30 }),
      R({ down: 8, progress: 0.9 }),
      R({ down: 8, progress: 0.1 }),
      R({ down: 3, progress: 0.99 }),
      R({ down: 0 }),
    ].map(rushScore);
    for (let i = 1; i < order.length; i++) expect(order[i - 1]!).toBeGreaterThan(order[i]!);
    for (const s of order) expect(Number.isSafeInteger(s) && s <= 1e12).toBe(true);
  });

  it('编码能拆回来，榜上的写法和 daily.json 一致', () => {
    const s = rushScore(R({ down: 9, cleared: true, ticks: 191 * 30 }));
    expect(decodeRush(s)).toEqual({ cleared: true, down: 9, total: 9, tail: 109 });
    expect(formatScore('daily-rush', s)).toBe('全清 9/9 · 剩 1:49');
    expect(formatScore('daily-rush', rushScore(R({ down: 5, progress: 0.42 })))).toBe('连战 5/9 · 下一关 42%');
    // 按平台的读法（platform-backend 15.12：floor((分数 − from) / 除数) % 取模）核一遍 daily.json 的字段
    const rule = JSON.parse(readFileSync(new URL('../../public/daily.json', import.meta.url), 'utf8')).boards.rush.score as { from?: number; fields: Record<string, [number, number | null]> }[];
    const field = (r: (typeof rule)[number], score: number, k: string): number => {
      const [div, mod] = r.fields[k]!;
      const v = Math.floor((score - (r.from ?? 0)) / div);
      return mod === null ? v : v % mod;
    };
    expect(s >= rule[0]!.from!).toBe(true);
    expect([field(rule[0]!, s, 'd'), field(rule[0]!, s, 'm'), field(rule[0]!, s, 't')]).toEqual([9, 9, 109]);
    const s2 = rushScore(R({ down: 5, progress: 0.42 }));
    expect(s2 < rule[0]!.from!).toBe(true);
    expect([field(rule[1]!, s2, 'd'), field(rule[1]!, s2, 'm'), field(rule[1]!, s2, 'p')]).toEqual([5, 9, 42]);
  });

  it('只交当天的连战子榜；认输、实盘、别的日期、对不上的配置都不交', () => {
    const setup = rushDaily(DAY).setup;
    const run: RunSummary = { runId: 'x', setup, won: false, quit: false, bossKilled: false, seconds: 300, kills: 50, level: 15, coins: 0, loot: 0, live: false, reducedDamage: false, daily: DAY, rush: R({ down: 6, progress: 0.5 }) };
    expect(submissionsFor(run, DAY)).toEqual([{ board: 'daily-rush', boardId: rushBoardId(DAY), score: rushScore(run.rush!) }]);
    expect(rushBoardId(DAY)).toBe(`daily-${DAY}-rush`);
    expect(submissionsFor({ ...run, quit: true }, DAY)).toEqual([]);
    expect(submissionsFor({ ...run, daily: null }, DAY)).toEqual([]);
    expect(submissionsFor(run, shiftDate(DAY, 3))).toEqual([]);
    expect(submissionsFor({ ...run, setup: { ...setup, seed: setup.seed + 1 } }, DAY)).toEqual([]);
  });

  it('分享卡写连战 N/M 和用时', () => {
    const setup = rushDaily(DAY).setup;
    const base: RunSummary = { runId: 'x', setup, won: true, quit: false, bossKilled: false, seconds: 150, kills: 80, level: 15, coins: 0, loot: 0, live: false, reducedDamage: false, daily: DAY };
    const clear = buildShareCard({ ...base, rush: R({ down: 9, cleared: true, ticks: 150 * 30 }) });
    expect(clear.title).toBe('每日连战');
    expect(clear.big.value).toBe('全清');
    expect(clear.big.label).toContain('用时 2:30');
    const part = buildShareCard({ ...base, won: false, rush: R({ down: 6 }) });
    expect(part.big.value).toBe('6/9');
    expect(part.stats?.find((s) => s.label === '用时')?.value).toBe('5:00');
  });
});
