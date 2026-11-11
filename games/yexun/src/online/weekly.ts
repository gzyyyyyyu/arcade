/**
 * 每周夜事（DESIGN.md 5.8）：北京日期 → 本周是哪个事件、哪张图、榜名、还剩几天，以及「本周夜事」挑战的固定开局。
 * 纯函数，只吃日期串（YYYY-MM-DD），同一周所有人、所有设备结果一样；规则核心不碰日期，开局时由 main.ts 把 plan.setup 交给核心。
 * 周序号 / ISO 周都按日期串自己算，不碰时区；不引用平台代码。
 */
import { WEEKLIES, WEEKLY_ORDER, type WeeklyDef } from '../content/weekly.ts';
import type { MapId } from '../content/maps.ts';
import { DAILY_DANGER } from './daily.ts';
import type { OnlineSetup } from './types.ts';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86400_000;
/** 1970-01-05 是周一，从它起数周序号 */
const FIRST_MONDAY_DAY = 4;

function dayNo(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Math.floor(Date.UTC(y, m - 1, d) / DAY);
}

function fmt(day: number): string {
  const t = new Date(day * DAY);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
}

/** 这一天所在周的序号（周一起算，1970-01-05 那周是 0）；日期不合格式返回 -1 */
export function weekIndex(date: string): number {
  if (!DATE_RE.test(date)) return -1;
  return Math.floor((dayNo(date) - FIRST_MONDAY_DAY) / 7);
}

/** 这一天所在周的周一 */
export function weekStart(date: string): string {
  const k = weekIndex(date);
  return k < 0 ? '' : fmt(FIRST_MONDAY_DAY + k * 7);
}

/** 这一周还剩几天（含今天：周一 7，周日 1） */
export function weekDaysLeft(date: string): number {
  const k = weekIndex(date);
  return k < 0 ? 0 : FIRST_MONDAY_DAY + k * 7 + 7 - dayNo(date);
}

/** 这一天所在周的夜事；日期不合格式返回 null */
export function weeklyFor(date: string): WeeklyDef | null {
  const k = weekIndex(date);
  if (k < 0) return null;
  return WEEKLIES[WEEKLY_ORDER[((k % WEEKLY_ORDER.length) + WEEKLY_ORDER.length) % WEEKLY_ORDER.length]!];
}

/**
 * 北京日期所在的 ISO 8601 周，写成 YYYY-Www：周一起算，年份按该周周四所在的年
 * （2026-12-31 → 2026-W53，2027-01-01 → 2026-W53，2027-01-04 → 2027-W01）；日期不合格式返回 ''
 */
export function beijingIsoWeek(date: string): string {
  const k = weekIndex(date);
  if (k < 0) return '';
  const thursday = FIRST_MONDAY_DAY + k * 7 + 3;
  const year = new Date(thursday * DAY).getUTCFullYear();
  const week = Math.floor((thursday - Math.floor(Date.UTC(year, 0, 1) / DAY)) / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** 本周夜事榜的榜名：week-<ISO 周>-vigil（例：week-2026-W44-vigil） */
export function weeklyBoardId(date: string): string {
  return `week-${beijingIsoWeek(date)}-vigil`;
}

/**
 * 平台只收本周的榜：隔周才结算的局不交。周一那天还能交上周的（周日晚开的局跨过零点）。
 * date 是这一局开局那天，today 是交分那天，都是北京日期
 */
export function weeklyDateOpen(date: string, today: string): boolean {
  const a = weekIndex(date);
  const b = weekIndex(today);
  return a >= 0 && b >= 0 && (a === b || (a === b - 1 && weekDaysLeft(today) === 7));
}

export interface WeeklyPlan {
  /** ISO 周，2026-W44 */
  week: string;
  event: WeeklyDef;
  setup: OnlineSetup;
  boardId: string;
}

/**
 * 本周夜事轮换的图：写死成一张表，不跟着守夜地图表走。新地图加进守夜时这张表不动，这一周不会中途换图（同一个周榜不混两张图）；
 * 要把新图加进来，按周序号从某周起换一张新表
 */
export const WEEKLY_MAPS: readonly MapId[] = ['snow', 'bamboo', 'icelake', 'riverbank', 'yizhuang', 'temple'];

/**
 * 这一天所在周的「本周夜事」挑战：本周事件（weeklyFor），地图按周序号轮换 WEEKLY_MAPS（不看玩家解没解锁），
 * 危险 2、小道士、不带加成和咒印、不开降低伤害。种子每局随机（每周可以多打几次取最好），由调用方传入。
 */
export function weeklyPlan(date: string, seed = 0): WeeklyPlan {
  const event = weeklyFor(date);
  if (!event) throw new Error('本周夜事的日期要是 YYYY-MM-DD');
  const map = WEEKLY_MAPS[weekIndex(date) % WEEKLY_MAPS.length]!;
  const setup: OnlineSetup = { seed, mode: 'vigil', map, danger: DAILY_DANGER, curses: [], character: 'xiaodao', perks: {}, weekly: event.id };
  return { week: beijingIsoWeek(date), event, setup, boardId: weeklyBoardId(date) };
}
