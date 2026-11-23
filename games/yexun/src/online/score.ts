/**
 * 排行榜的分数公式和"这一局该交哪几个榜"（DESIGN.md 5.7）。越大越好，平台只收 |分数| ≤ 1e12 的安全整数。
 *
 * | 榜 | 分数 |
 * | vigil 守夜总榜 | 危险档 × 1e10 + 秒数 × 1e4 + 击杀（击杀 < 1e4）；打倒尸王算撑满 900 秒再加 100 秒 |
 * | raid 夜探总榜 | 单局撤出的宝物价值（铜钱） |
 * | endless 无尽 | 秒数 × 1e4 + 击杀 |
 * | 每日守夜 | 撑到天亮：1e6 + 击杀；没撑到：撑了多少秒（所以"天亮"都排在没撑到的前面，daily.json 能直接写成文字） |
 * | 每日夜探 | 单局撤出的宝物价值 |
 * | 本周夜事 | 同守夜总榜（vigilScore）；单独开局的挑战，只进周榜 week-<ISO 周>-vigil |
 * | 每日连战 | 天亮 × 1e10 + 打倒几只 × 1e8 + 咒几条 × 1e7 + 一共几只 × 1e5 + 尾数（天亮：1500 − 用时秒；没打完：最后一只打掉的百分比），online/rush.ts |
 */
import { fmtClock } from '../content/clock.ts';
import { dailyBoardId, dailyDateOpen, isDailySetup } from './daily.ts';
import { decodeRush, isRushSetup, RUSH_TAIL, rushBoardId, rushScore } from './rush.ts';
import { weeklyBoardId, weeklyDateOpen } from './weekly.ts';
import type { RunSummary } from './types.ts';
import { raidOpen } from '../content/explore.ts';

const VIGIL_FULL_SECONDS = 900;
const BOSS_BONUS_SECONDS = 100;
const DAILY_WIN_BASE = 1_000_000;
const KILL_CAP = 9_999;
const ENDLESS_SECOND_CAP = 99_999;

const nat = (x: number): number => (Number.isFinite(x) ? Math.max(0, Math.trunc(x)) : 0);

/** 守夜总榜 */
export function vigilScore(o: { danger: number; seconds: number; kills: number; bossKilled: boolean }): number {
  const danger = Math.min(8, nat(o.danger));
  const secs = o.bossKilled ? VIGIL_FULL_SECONDS + BOSS_BONUS_SECONDS : Math.min(VIGIL_FULL_SECONDS, nat(o.seconds));
  return danger * 1e10 + secs * 1e4 + Math.min(KILL_CAP, nat(o.kills));
}

export function decodeVigil(score: number): { danger: number; seconds: number; kills: number } {
  const s = nat(score);
  return { danger: Math.floor(s / 1e10), seconds: Math.floor((s % 1e10) / 1e4), kills: s % 1e4 };
}

/** 无尽榜 */
export function endlessScore(o: { seconds: number; kills: number }): number {
  return Math.min(ENDLESS_SECOND_CAP, nat(o.seconds)) * 1e4 + Math.min(KILL_CAP, nat(o.kills));
}

export function decodeEndless(score: number): { seconds: number; kills: number } {
  const s = nat(score);
  return { seconds: Math.floor(s / 1e4), kills: s % 1e4 };
}

/** 夜探：带出的宝物价值 */
export function raidScore(loot: number): number {
  return Math.min(999_999_999, nat(loot));
}

/** 每日守夜 */
function dailyVigilScore(o: { won: boolean; seconds: number; kills: number }): number {
  return o.won ? DAILY_WIN_BASE + Math.min(DAILY_WIN_BASE - 1, nat(o.kills)) : Math.min(DAILY_WIN_BASE - 1, nat(o.seconds));
}

/** 分数在榜上怎么显示（每日榜平台自己按 daily.json 写，这里管总榜） */
export function formatScore(board: BoardKind, score: number): string {
  const n = (x: number): string => x.toLocaleString('zh-CN');
  switch (board) {
    case 'vigil':
    case 'weekly-vigil': {
      const d = decodeVigil(score);
      return `${d.danger >= 6 ? `噩梦${d.danger - 5}` : `危险${d.danger}`} · ${fmtClock(d.seconds)} · 斩${n(d.kills)}`;
    }
    case 'endless': {
      const d = decodeEndless(score);
      return `${fmtClock(d.seconds)} · 斩${n(d.kills)}`;
    }
    case 'raid':
      return `${n(score)} 铜钱`;
    case 'daily-vigil':
      return score >= DAILY_WIN_BASE ? `天亮 · 斩${n(score - DAILY_WIN_BASE)}` : `撑了 ${fmtClock(score)}`;
    case 'daily-raid':
      return `${n(score)} 铜钱`;
    case 'trial':
      return score >= 1e9 ? '通关' : `${n(score)}`;
    case 'daily-rush': {
      const d = decodeRush(score);
      const hex = d.hexes > 0 ? ` · 咒 ${d.hexes}` : '';
      return d.cleared ? `天亮 · 用时 ${d.tail > 0 ? fmtClock(RUSH_TAIL - d.tail) : `${fmtClock(RUSH_TAIL)}+`}${hex}` : `连战 ${d.down}/${d.total}${hex} · 下一只 ${d.tail}%`;
    }
  }
}

export type BoardKind = 'vigil' | 'raid' | 'endless' | 'daily-vigil' | 'daily-raid' | 'daily-rush' | 'weekly-vigil' | 'trial';

export interface Submission {
  board: BoardKind;
  boardId: string;
  score: number;
}

/**
 * 这一局该往哪几个榜交什么分（空数组 = 不交）：
 * - 实盘不交；认输的不交（没打完不算成绩；无尽本来就是打到不想打为止，认输照交）；
 * - 每日挑战只交当天的每日榜（不进总榜：咒印让它和普通局不可比）；日期过了平台收的范围（昨天到明天）、配置对不上（isDailySetup）都不交；
 * - 本周夜事挑战只交本周的周榜（不进总榜、不进每日榜）；隔周才结算的不交；没带挑战日期却带着本周事件的局（旧存档）什么都不交；
 * - 试炼只交这关的固定榜，只在刷新本机最好成绩时交；
 * - 开了"降低伤害"的普通局不交总榜（每日挑战是对谁都一样的固定局，没有这个开关，开了也不交）；
 * - 守夜普通局：vigil；开了无尽的：endless；夜探：raid（没撤出的 loot 为 0，不交）。
 */
export function submissionsFor(r: RunSummary, today: string): Submission[] {
  if (r.live || r.reducedDamage || (r.quit && !r.setup.endless)) return [];
  const s = r.setup;
  // 收起的镇子（开发服务器里才进得去）的局不交榜，免得开发时打的分混进线上榜
  if (s.mode === 'raid' && s.raid?.template !== undefined && !raidOpen(s.raid.template, false)) return [];
  // 首领连战只交每日的：当天的连战子榜，配置对不上（旧存档、手改）的不交；自由连战没有 daily，不交
  if (s.rush) {
    if (!r.daily || !r.rush || !dailyDateOpen(r.daily, today) || !isRushSetup(r.daily, s)) return [];
    return [{ board: 'daily-rush', boardId: rushBoardId(r.daily), score: rushScore(r.rush) }];
  }
  // 试炼：只交这关的固定榜 trial-<id>，而且只在刷新了本机最好成绩时交（每人每天交分次数有限）
  if (s.trial) return r.trial?.best ? [{ board: 'trial', boardId: `trial-${s.trial}`, score: r.trial.score }] : [];
  if (r.weekly) {
    if (!weeklyDateOpen(r.weekly, today) || s.mode !== 'vigil' || !s.weekly) return [];
    return [{ board: 'weekly-vigil', boardId: weeklyBoardId(r.weekly), score: vigilScore({ danger: s.danger, seconds: r.seconds, kills: r.kills, bossKilled: r.bossKilled }) }];
  }
  if (s.weekly) return [];
  if (r.daily) {
    if (!dailyDateOpen(r.daily, today) || !isDailySetup(r.daily, s)) return [];
    if (s.mode === 'vigil') return [{ board: 'daily-vigil', boardId: dailyBoardId(r.daily, 'vigil'), score: dailyVigilScore(r) }];
    return r.loot > 0 ? [{ board: 'daily-raid', boardId: dailyBoardId(r.daily, 'raid'), score: raidScore(r.loot) }] : [];
  }
  if (s.mode === 'raid') return r.loot > 0 ? [{ board: 'raid', boardId: 'raid', score: raidScore(r.loot) }] : [];
  if (s.endless) return [{ board: 'endless', boardId: 'endless', score: endlessScore(r) }];
  return [{ board: 'vigil', boardId: 'vigil', score: vigilScore({ danger: s.danger, seconds: r.seconds, kills: r.kills, bossKilled: r.bossKilled }) }];
}

/** 榜名 → 分数（录像的"每榜最好一局"用它比；不上榜的局是空对象） */
export function scoresOfRun(r: RunSummary, today: string): Record<string, number> {
  return Object.fromEntries(submissionsFor(r, today).map((s) => [s.boardId, s.score]));
}
