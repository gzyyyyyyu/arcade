/**
 * 每日挑战（0.3.0）：按日期给出确定的种子、人设和难度。单独成模块，成就判定也要用（避免循环引用）。
 */
import { DAILY_SEGMENTS } from './content/dailySegments.ts';
import { PERSONA_IDS } from './content/personas.ts';
import { hashSeed, rngFor } from './rng.ts';
import { pickSegmentId } from './segment.ts';
import { isWeekId, weeklyRule, type WeeklyRuleId } from './weekly.ts';
import type { GameState, PersonaId, RunSetup } from './types.ts';

/** 每日挑战的难度范围（含两端）。 */
export const DAILY_LEVELS: readonly [number, number] = [2, 5];

/**
 * 每日挑战：按日期（YYYY-MM-DD）给出确定的种子、人设和难度。同一天全世界一样。
 * 人设从 5 个里挑（包括还没解锁的，每日挑战可以先试玩），难度 2..5。
 */
export function dailySetup(date: string): { date: string; seed: string; setup: RunSetup & { persona: PersonaId; difficulty: number; daily: string } } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('每日挑战的日期要是 YYYY-MM-DD');
  const rng = rngFor('daily', date);
  const persona = PERSONA_IDS[rng.int(PERSONA_IDS.length)] as PersonaId;
  const [lo, hi] = DAILY_LEVELS;
  const difficulty = lo + rng.int(hi - lo + 1);
  return { date, seed: `daily-${date}`, setup: { persona, difficulty, daily: date } };
}

/** 这一局是不是货真价实的每日挑战：种子、人设、难度都和 dailySetup(日期) 一致。 */
export function isDailyRun(date: string | null | undefined, seed: string, persona: PersonaId, difficulty: number): boolean {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = dailySetup(date);
  return d.seed === seed && d.setup.persona === persona && d.setup.difficulty === difficulty;
}

/**
 * 每日挑战规则的版本（0.5.10 排行榜）：0 = 榜单 `daily-YYYY-MM-DD-<子榜>`。人设难度的抽法、段池（DAILY_SEGMENTS）、计分方法大改时加一，
 * 榜单变成 `daily-YYYY-MM-DD-<子榜>-v<n>`，改之前和之后打的不在一个榜上比。
 */
export const DAILY_RULES = 0;

/** 每日榜的子榜（平台登记的 daily 子榜 id）：经典每日挑战 classic，闪电盘 flash。 */
export type DailyKind = 'classic' | 'flash';

/** 这一天某个子榜的排行榜 ID（平台只收北京时间的昨天、今天、明天）。 */
export function dailyBoardId(date: string, kind: DailyKind = 'classic'): string {
  return DAILY_RULES > 0 ? `daily-${date}-${kind}-v${DAILY_RULES}` : `daily-${date}-${kind}`;
}

/** 这一天的每日挑战该用哪一段真实行情：只在冻结的段池里抽，段库加了新段也不变。 */
export function dailySegmentId(date: string): string | null {
  return pickSegmentId(dailySetup(date).seed, DAILY_SEGMENTS, hashSeed);
}

/**
 * 排行榜的分数（越大越好，平台只收安全整数）：通关的按最后的账户（元，取整）排，都排在没通关的前面；
 * 没通关的按还上了几个月排。和档案里每日挑战的"最好"一个口径（DailyRecord）。
 */
export const DAILY_WIN_BASE = 100_000_000_000;

export function dailyScore(won: boolean, account: number, billsPaid: number): number {
  if (!won) return Math.max(0, Math.min(12, Math.trunc(billsPaid)));
  const yuan = Math.round(account);
  return DAILY_WIN_BASE + Math.max(0, Math.min(DAILY_WIN_BASE - 1, Number.isFinite(yuan) ? yuan : 0));
}

/** 分数还原成"通关、账户多少"或"还了几个月"（别人的分数也走这里：不认识的按没通关 0 个月）。 */
export function dailyScoreView(score: number): { won: true; account: number } | { won: false; months: number } {
  if (!Number.isSafeInteger(score) || score < 0) return { won: false, months: 0 };
  if (score >= DAILY_WIN_BASE) return { won: true, account: Math.min(score, 2 * DAILY_WIN_BASE - 1) - DAILY_WIN_BASE };
  return { won: false, months: Math.min(12, score) };
}

// ================================================================ 闪电盘（每日的 10 天短局）

/** 闪电盘的难度范围（含两端）：只有 10 天，不给最难的两级。 */
export const FLASH_LEVELS: readonly [number, number] = [2, 4];

/**
 * 闪电盘：按日期给出确定的种子、人设和难度，同一天全世界一样（行情段见 flashSegmentId）。
 * 用独立的种子前缀和 rng 用途名：和同一天的经典每日挑战不是同一局，抽取也互不影响。
 */
export function flashSetup(date: string): { date: string; seed: string; setup: RunSetup & { persona: PersonaId; difficulty: number; flash: string } } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('闪电盘的日期要是 YYYY-MM-DD');
  const rng = rngFor('flash', date);
  const persona = PERSONA_IDS[rng.int(PERSONA_IDS.length)] as PersonaId;
  const [lo, hi] = FLASH_LEVELS;
  const difficulty = lo + rng.int(hi - lo + 1);
  return { date, seed: `flash-${date}`, setup: { persona, difficulty, flash: date } };
}

/** 这一局是不是货真价实的闪电盘：种子、人设、难度都和 flashSetup(日期) 一致。 */
export function isFlashRun(date: string | null | undefined, seed: string, persona: PersonaId, difficulty: number): boolean {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = flashSetup(date);
  return d.seed === seed && d.setup.persona === persona && d.setup.difficulty === difficulty;
}

/** 这一天的闪电盘用哪一段真实行情：和每日挑战一样只在冻结的段池里抽。 */
export function flashSegmentId(date: string): string | null {
  return pickSegmentId(flashSetup(date).seed, DAILY_SEGMENTS, hashSeed);
}

/**
 * 闪电盘的分数（越大越好，平台只收安全整数）：10 天后的最终资产（元，取整）。
 * 没有月供、不会出局，所以不分通关和没通关；没打完的局不上榜，由调用方保证。
 */
export function flashScore(s: Readonly<Pick<GameState, 'account'>>): number {
  const yuan = Math.round(s.account);
  return Number.isFinite(yuan) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, yuan)) : 0;
}

// ================================================================ 本周市场（每周的 10 天短局 + 一条限定规则）

/**
 * 本周市场：按周号（北京时间 ISO 周，如 2026-W44）给出确定的种子、人设、难度和这一周的规则，这一周全世界一样（行情段见 weeklySegmentId）。
 * 玩法同闪电盘，难度范围也一样（FLASH_LEVELS）；用独立的种子前缀和 rng 用途名，和闪电盘、每日挑战互不影响。
 */
export function weeklySetup(week: string): { week: string; seed: string; rule: WeeklyRuleId; setup: RunSetup & { persona: PersonaId; difficulty: number; weekly: string } } {
  if (!isWeekId(week)) throw new Error('本周市场的周号要是 YYYY-Www（如 2026-W44）');
  const rng = rngFor('weekly', week);
  const persona = PERSONA_IDS[rng.int(PERSONA_IDS.length)] as PersonaId;
  const [lo, hi] = FLASH_LEVELS;
  const difficulty = lo + rng.int(hi - lo + 1);
  return { week, seed: `weekly-${week}`, rule: weeklyRule(week), setup: { persona, difficulty, weekly: week } };
}

/** 这一局是不是货真价实的本周市场：种子、人设、难度都和 weeklySetup(周号) 一致。 */
export function isWeeklyRun(week: string | null | undefined, seed: string, persona: PersonaId, difficulty: number): boolean {
  if (!isWeekId(week)) return false;
  const d = weeklySetup(week);
  return d.seed === seed && d.setup.persona === persona && d.setup.difficulty === difficulty;
}

/** 这一周的本周市场用哪一段真实行情：和每日挑战一样只在冻结的段池里抽。 */
export function weeklySegmentId(week: string): string | null {
  return pickSegmentId(weeklySetup(week).seed, DAILY_SEGMENTS, hashSeed);
}

/** 本周市场的榜单 ID：和每日榜分开（平台登记的周榜子榜 rules）。 */
export function weeklyBoardId(week: string): string {
  return `week-${week}-rules`;
}

/** 本周市场的分数：和闪电盘一个口径（10 天后的最终资产，元，取整）。 */
export const weeklyScore = flashScore;
