import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TRIAL_IDS, TRIAL_TIERS, TRIALS, trialScore, trialScoreText } from '../../src/content/trials.ts';
import { WEEK_GOAL_ALL, WEEK_GOAL_COINS, weekGoals, type WeekRun } from '../../src/content/weekGoals.ts';
import { friendBest } from '../../src/online/trials.ts';
import { submissionsFor } from '../../src/online/score.ts';
import type { RunSummary } from '../../src/online/types.ts';
import { applyWeekRun, coins, finishTrial, fresh, reviveSave, trialTierOpen } from '../../src/platform/save.ts';

/** 试炼和周目标的存档、交分、好友最好（docs/design-play.md 2.6） */
const run = (over: Partial<RunSummary>): RunSummary => ({ runId: 'r', setup: { seed: 1, mode: 'vigil', danger: 2, trial: 'chuye' }, won: false, quit: false, bossKilled: false, seconds: 300, kills: 1, level: 1, coins: 0, loot: 0, live: false, reducedDamage: false, daily: null, ...over });

describe('试炼交分', () => {
  it('只交这关的固定榜，只在刷新最好成绩时交；认输不交', () => {
    expect(submissionsFor(run({ trial: { score: 123, best: true } }), '2026-11-21')).toEqual([{ board: 'trial', boardId: 'trial-chuye', score: 123 }]);
    expect(submissionsFor(run({ trial: { score: 123, best: false } }), '2026-11-21')).toEqual([]);
    expect(submissionsFor(run({ quit: true, trial: { score: 123, best: true } }), '2026-11-21')).toEqual([]);
  });

  it('好友最好取好友里第一名（不含自己），带上我的名次；读不到为 null', () => {
    const r = friendBest({ kind: 'ok', entries: [{ rank: 1, displayName: '我', score: 9, isMe: true }, { rank: 2, displayName: '阿甲', score: 5, isMe: false }], me: { rank: 1, score: 9 } });
    expect(r).toEqual({ top: { name: '阿甲', score: 5 }, myRank: 1 });
    expect(friendBest({ kind: 'ok', entries: [], me: null })).toEqual({ top: null, myRank: null });
    expect(friendBest({ kind: 'out' })).toBeNull();
  });

  it('public/boards.json 每关一个 trial-<id>，通关那条从 1e9 起，字段和 trialScoreText 一致', () => {
    const boards = JSON.parse(readFileSync(new URL('../../public/boards.json', import.meta.url), 'utf8')).boards as Record<string, { score: { from?: number; fields?: Record<string, [number, number]>; text: string }[] }>;
    for (const id of TRIAL_IDS) {
      const b = boards[`trial-${id}`]!;
      expect(b.score[0]!.from).toBe(1e9);
      expect(b.score[1]!.from).toBeUndefined();
      const won = trialScore(true, 75);
      expect(trialScoreText(TRIALS[id], won).startsWith('通关')).toBe(true);
      for (const f of Object.values(b.score[0]!.fields ?? {})) expect(Math.floor(won / f[0]) % f[1]).toBe(75);
    }
  });
});

describe('试炼存档', () => {
  it('第一次通关给这一档的铜钱，只给一次；最好成绩只升不降', () => {
    const s = fresh();
    expect(finishTrial(s, 'chuye', trialScore(false, 300))).toEqual({ best: true, first: 0 });
    expect(finishTrial(s, 'chuye', trialScore(false, 200))).toEqual({ best: false, first: 0 });
    expect(finishTrial(s, 'chuye', trialScore(true, 900))).toEqual({ best: true, first: TRIAL_TIERS[0]!.coins });
    expect(finishTrial(s, 'chuye', trialScore(true, 900))).toEqual({ best: false, first: 0 });
    expect(coins(s)).toBe(TRIAL_TIERS[0]!.coins);
    expect(reviveSave(JSON.parse(JSON.stringify(s)))!.trials).toEqual({ chuye: trialScore(true, 900) });
  });

  it('前一档通 2 关开下一档', () => {
    const s = fresh();
    expect([0, 1, 2].map((t) => trialTierOpen(s, t as 0 | 1 | 2))).toEqual([true, false, false]);
    finishTrial(s, 'chuye', 1e9);
    finishTrial(s, 'dumu', 1e9);
    expect(trialTierOpen(s, 1)).toBe(true);
    expect(trialTierOpen(s, 2)).toBe(false);
  });
});

describe('周目标', () => {
  const big: WeekRun = { mode: 'vigil', won: true, danger: 8, kills: 99999, elites: 999, boss: true, evolves: 99, treasures: 0 };
  const raid: WeekRun = { mode: 'raid', won: true, danger: 3, kills: 0, elites: 0, boss: false, evolves: 0, treasures: 99 };

  it('每周 3 条按周序号轮，各来自自己的池子', () => {
    expect(weekGoals(0).map((g) => g.id)).not.toEqual(weekGoals(1).map((g) => g.id));
    expect(weekGoals(5)).toHaveLength(3);
  });

  it('完成了发铜钱，三条全完成再给一份；同一周不重发，换周重来', () => {
    const s = fresh();
    let got = 0;
    for (let i = 0; i < 20; i++) got += applyWeekRun(s, 7, i % 2 ? raid : big).reduce((a, x) => a + x.coins, 0);
    const all = WEEK_GOAL_COINS.reduce((a, b) => a + b, 0) + WEEK_GOAL_ALL;
    expect(got).toBe(all);
    expect(coins(s)).toBe(all);
    expect(s.weekGoal.done).toBe(15);
    applyWeekRun(s, 8, big);
    expect(s.weekGoal.week).toBe(8);
    expect(reviveSave(JSON.parse(JSON.stringify(s)))!.weekGoal).toEqual(s.weekGoal);
  });
});
