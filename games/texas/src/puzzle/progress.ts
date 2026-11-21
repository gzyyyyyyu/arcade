/**
 * 谜题的进度（本机存档 texas.puzzle，只在本机，不进云存档）：每天 5 道，每道选了什么、得几分；
 * 答完是否交过榜、连续完成几天、一共完成几天。
 * 读出来的东西不可信（别的版本写的、手改的、坏了的），parse 把每个字段都查一遍，查不过的丢掉，绝不抛错；旧版（v1，一天一道）的存档整个丢掉。
 * 每道只能答一次、按顺序答；答到一半刷新，接着答下一道。
 */
import { isDay, prevDay } from './date.ts';

/** 一天几道题，每道满分多少 */
export const DAY_SIZE = 5;
export const FULL = 100;

/** 一天的总分：0 到 DAY_SIZE × FULL */
export const dayTotal = (scores: readonly number[]): number => scores.reduce((a, b) => a + Math.max(0, Math.min(FULL, Math.round(b))), 0);

interface DayRun {
  /** 已答的每道选了什么 */
  picks: string[];
  /** 每道得几分（和 picks 一一对应） */
  scores: number[];
  /** 答完那一刻起：true 交上榜了，false 交了没上（或还在路上）；单独部署不交，一直是 null。一天只交一次 */
  sent: boolean | null;
}

export interface PuzzleSave {
  v: 2;
  days: Record<string, DayRun>;
  /** 连续完成（5 道全答完）的天数，从最后完成的那天算起；隔了一天就断 */
  streak: number;
  best: number;
  /** 一共完成几天 */
  done: number;
  /** 最后完成的日期 */
  last: string | null;
}

/** 只留最近这么多天的记录，存档不会越长越大 */
const KEEP = 60;
const PICKS = new Set(['fold', 'call', 'raise', 'shove']);

export const emptySave = (): PuzzleSave => ({ v: 2, days: {}, streak: 0, best: 0, done: 0, last: null });

const count = (x: unknown): number => (typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 ? x : 0);

export function parseSave(x: unknown): PuzzleSave {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return emptySave();
  const o = x as Record<string, unknown>;
  if (o.v !== 2) return emptySave();
  const days: Record<string, DayRun> = {};
  if (typeof o.days === 'object' && o.days !== null && !Array.isArray(o.days)) {
    for (const [d, rec] of Object.entries(o.days)) {
      if (!isDay(d) || typeof rec !== 'object' || rec === null) continue;
      const { picks, scores, sent } = rec as Record<string, unknown>;
      if (!Array.isArray(picks) || !Array.isArray(scores)) continue;
      const n = Math.min(picks.length, scores.length, DAY_SIZE);
      const ps: string[] = [];
      const ss: number[] = [];
      for (let i = 0; i < n; i++) {
        const p = picks[i];
        const s = scores[i];
        // 中间坏了一道，后面的就接不上了：到这里为止
        if (typeof p !== 'string' || !PICKS.has(p) || typeof s !== 'number' || !Number.isInteger(s) || s < 0 || s > FULL) break;
        ps.push(p);
        ss.push(s);
      }
      if (ps.length) days[d] = { picks: ps, scores: ss, sent: ps.length === DAY_SIZE && typeof sent === 'boolean' ? sent : null };
    }
  }
  const last = isDay(o.last) ? o.last : null;
  const done = count(o.done);
  const streak = Math.min(count(o.streak), done);
  return { v: 2, days, streak, best: Math.max(count(o.best), streak), done, last };
}

/** 这一天答到哪了：已答几道、已得几分、答完没有 */
export function dayStatus(save: PuzzleSave, date: string): { answered: number; total: number; complete: boolean } {
  const run = save.days[date];
  return { answered: run?.picks.length ?? 0, total: run ? dayTotal(run.scores) : 0, complete: (run?.picks.length ?? 0) >= DAY_SIZE };
}

/** 记下这一天的下一道的答案；这一天已经答完、日期不对就原样返回。第 5 道答完时顺带算连续天数 */
export function record(save: PuzzleSave, date: string, pick: string, score: number): PuzzleSave {
  const run = save.days[date];
  if (!isDay(date) || (run && run.picks.length >= DAY_SIZE) || !PICKS.has(pick)) return save;
  const picks = [...(run?.picks ?? []), pick];
  const scores = [...(run?.scores ?? []), Math.max(0, Math.min(FULL, Math.round(score)))];
  const complete = picks.length === DAY_SIZE;
  const days = { ...save.days, [date]: { picks, scores, sent: null } };
  for (const d of Object.keys(days).sort().slice(0, -KEEP)) delete days[d];
  if (!complete) return { ...save, days };
  const streak = (save.last === prevDay(date) ? save.streak : 0) + 1;
  return { v: 2, days, streak, best: Math.max(save.best, streak), done: save.done + 1, last: save.last && save.last > date ? save.last : date };
}

/** 记下交榜的结果（只在答完且还没记过时有效：一天只交一次） */
export function markSent(save: PuzzleSave, date: string, ok: boolean): PuzzleSave {
  const run = save.days[date];
  if (!run || run.picks.length < DAY_SIZE) return save;
  return { ...save, days: { ...save.days, [date]: { ...run, sent: ok } } };
}

/** 此刻还连着的天数：最后完成是今天或昨天才算，隔了一天以上就断了 */
export function liveStreak(save: PuzzleSave, today: string): number {
  return save.last === today || save.last === prevDay(today) ? save.streak : 0;
}
