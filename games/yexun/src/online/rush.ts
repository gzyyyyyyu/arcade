/**
 * 每日首领连战（DESIGN.md 2.5、5.7）：北京时间的日期 → 种子 → 地图；构筑和关卡由核心按种子算（core/rush.ts），同一天全服一样。
 * 只有每日这一种，交平台每日榜的子榜 rush（榜名 daily-YYYY-MM-DD-rush），分数怎么显示写在 public/daily.json。
 */
import { Rng, hash32 } from '../core/rng.ts';
import type { RushResult } from '../core/rush.ts';
import type { MapId } from '../content/maps.ts';
import { RUSH } from '../content/rush.ts';
import { DAILY_DANGER, DAILY_RULES } from './daily.ts';
import type { OnlineSetup } from './types.ts';

/** 平台每日榜的子榜 id */
export const RUSH_SUB = 'rush';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function rushBoardId(date: string): string {
  return DAILY_RULES > 0 ? `daily-${date}-${RUSH_SUB}-v${DAILY_RULES}` : `daily-${date}-${RUSH_SUB}`;
}

/**
 * 连战抽的图：写死成一张表，不跟着守夜地图表走。新地图加进守夜时，这张表不动，已经开打的日子不会换图（同一天的榜上不会混进两张图的成绩）；
 * 要把新图加进连战，按日期从某天起换一张新表
 */
export const RUSH_MAPS: readonly MapId[] = ['snow', 'bamboo', 'icelake', 'riverbank', 'yizhuang', 'temple'];

/** 这一天的连战：守夜、危险 2、固定小道士、不带加成和咒印；图按种子从 RUSH_MAPS 里抽 */
export function rushDaily(date: string): { date: string; setup: OnlineSetup; boardId: string } {
  if (!DATE_RE.test(date)) throw new Error('每日连战的日期要是 YYYY-MM-DD');
  const seed = hash32(`yexun-daily-rush-${date}`, 0);
  const map = RUSH_MAPS[new Rng(seed, 'rush-day').int(RUSH_MAPS.length)]!;
  return { date, setup: { seed, mode: 'vigil', map, danger: DAILY_DANGER, curses: [], character: 'xiaodao', perks: {}, rush: true }, boardId: rushBoardId(date) };
}

/** 这一局是不是货真价实的某天连战（种子、图、危险档对得上，没开降低伤害） */
export function isRushSetup(date: string | null | undefined, s: OnlineSetup): boolean {
  if (!date || !DATE_RE.test(date) || !s.rush) return false;
  const p = rushDaily(date).setup;
  return p.seed === s.seed && p.map === s.map && p.danger === s.danger && !s.endless && !s.assist && (s.curses ?? []).length === 0 && Object.keys(s.perks ?? {}).length === 0 && (s.character ?? 'xiaodao') === 'xiaodao';
}

/**
 * 连战的分数（越大越好）：全清标志 × 1e9 + 打倒几只 × 1e7 + 一共几只 × 1e5 + 尾数。
 * 全清的尾数是剩下的秒数（越快剩得越多），没全清的尾数是正在打的那一关打掉了百分之几——
 * 所以先比全清没有，再比打倒几只，全清的比快、没全清的比最后一关打掉多少。一共几只同一天都一样，只为榜上能写成 N/M。
 * 平台按字段拆开显示（daily.json 的 boards.rush）。
 */
export const RUSH_CLEAR = 1e9;
export function rushScore(r: RushResult): number {
  const down = Math.max(0, Math.min(99, Math.trunc(r.down)));
  const total = Math.max(0, Math.min(99, Math.trunc(r.total)));
  const limit = RUSH.limit / 30;
  const tail = r.cleared ? Math.max(0, Math.min(limit, limit - Math.ceil(r.ticks / 30))) : Math.max(0, Math.min(99, Math.floor(r.progress * 100)));
  return (r.cleared ? RUSH_CLEAR : 0) + down * 1e7 + total * 1e5 + tail;
}

export function decodeRush(score: number): { cleared: boolean; down: number; total: number; tail: number } {
  const cleared = score >= RUSH_CLEAR;
  const s = cleared ? score - RUSH_CLEAR : score;
  return { cleared, down: Math.floor(s / 1e7) % 100, total: Math.floor(s / 1e5) % 100, tail: s % 1e5 };
}

/** 用时写成分:秒 */
export function rushClock(ticks: number): string {
  const s = Math.ceil(ticks / 30);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 结算页、分享卡上的一行："连战 6/9 · 用时 5:00" */
export function rushLine(r: RushResult): string {
  return `连战 ${r.down}/${r.total} · 用时 ${rushClock(r.ticks)}`;
}
