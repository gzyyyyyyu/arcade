/**
 * 每日挑战（DESIGN.md 5.7）：全服同一个种子、同一张图、同一组当日咒印；固定角色、不带加成。
 * 全部从北京时间的日期确定性地派生（同一天所有人一样，换设备也一样），用核心的 sfc32，不碰 Math.random。
 * 守夜、夜探各一个榜：平台的子榜 vigil / raid，榜名 daily-YYYY-MM-DD-<子榜>。
 */
import type { RaidTemplateId } from '../content/explore.ts';
import { Rng, hash32 } from '../core/rng.ts';
import type { MapId } from '../content/maps.ts';
import { DAILY_CURSE_IDS, type CurseId, type OnlineSetup, type RunMode } from './types.ts';

/** 每日挑战统一的危险档：2 是配平的基准档（docs/balance.md），大家比的是走位，不比谁敢开高档 */
export const DAILY_DANGER = 2;
/** 周日噩梦日：北京时间周日的守夜每日挑战改为噩梦 1（危险 6）、咒印只抽 1 条 */
export const NIGHTMARE_SUNDAY_DANGER = 6;

export const DAILY_MAPS: readonly MapId[] = ['snow', 'yizhuang'];
/** 夜探每日挑战抽的模板（不抽教学镇） */
export const DAILY_RAID: readonly RaidTemplateId[] = ['guzhen', 'dukou', 'shansi'];

/** 北京日期 YYYY-MM-DD（每日、每周、连战共用） */
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 北京时间的日期 YYYY-MM-DD（平台只认北京时间的昨天、今天、明天） */
export function beijingDate(nowMs: number): string {
  const t = new Date(nowMs + 8 * 3600_000);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
}

/** YYYY-MM-DD 加减几天（按日历算，不看时区） */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
}

/** 平台只收北京时间昨天、今天、明天的每日榜：隔天才打开结算的局不交 */
export function dailyDateOpen(date: string, today: string): boolean {
  return date >= shiftDate(today, -1) && date <= shiftDate(today, 1);
}

/** 这一天、这个模式是不是周日噩梦日（按日期串本身算星期，不看时区；字符串比较够用，格式固定） */
export function isNightmareSunday(date: string, mode: RunMode): boolean {
  if (mode !== 'vigil' || !DATE_RE.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
}

/** 离下一个守夜噩梦日还有几天（按北京日期串算；0 = 今天就是） */
export function daysToNightmareSunday(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return (7 - new Date(Date.UTC(y, m - 1, d)).getUTCDay()) % 7;
}

export interface DailyPlan {
  date: string;
  mode: RunMode;
  setup: OnlineSetup;
  /** 当日咒印（1–2 条，不重复） */
  curses: CurseId[];
  boardId: string;
}

/** 每日榜的榜名：子榜是模式 id，连战是 rush */
export function dailyBoardId(date: string, sub: RunMode | 'rush'): string {
  return `daily-${date}-${sub}`;
}

/**
 * 这一天、这个模式的挑战。守夜和夜探用不同的种子和咒印（流名里带模式），同一天两个榜不是同一局。
 */
export function dailyPlan(date: string, mode: RunMode): DailyPlan {
  if (!DATE_RE.test(date)) throw new Error('每日挑战的日期要是 YYYY-MM-DD');
  const seed = hash32(`yexun-daily-${mode}-${date}`, 0);
  const rng = new Rng(seed, 'daily-pick');
  const map = DAILY_MAPS[rng.int(DAILY_MAPS.length)]!;
  // 咒印：先抽数量（1 条占 60%，2 条占 40%），再不放回地抽
  const n = rng.chance(0.4) ? 2 : 1;
  const pool = [...DAILY_CURSE_IDS];
  const curses: CurseId[] = [];
  for (let i = 0; i < n; i++) curses.push(pool.splice(rng.int(pool.length), 1)[0]!);
  // 周日噩梦日：抽法照旧（图和第一条咒印不变），只留第一条，难度已经够高
  const nightmare = isNightmareSunday(date, mode);
  if (nightmare) curses.length = 1;
  // 夜探的模板最后抽：守夜那天的图和咒印不受影响（快照测试锁着）。固定小道士、不带加成（DESIGN.md 5.7）
  const setup: OnlineSetup =
    mode === 'raid'
      ? { seed, mode, danger: DAILY_DANGER, curses, character: 'xiaodao', perks: {}, raid: { template: DAILY_RAID[rng.int(DAILY_RAID.length)]! } }
      : { seed, mode, map, danger: nightmare ? NIGHTMARE_SUNDAY_DANGER : DAILY_DANGER, curses, character: 'xiaodao', perks: {} };
  return { date, mode, setup, curses, boardId: dailyBoardId(date, mode) };
}

/**
 * 这一局的设置是不是货真价实的某天挑战（交每日榜前核一次，防旧存档 / 手滑）：种子、图、咒印、危险档、角色对得上，
 * 没带加成、心法、起手、锦囊、降低伤害、新手照顾，也不是夜事、连战、试炼、实盘、无尽（每日挑战人人一样，content/meta.ts CARRY）
 */
export function isDailySetup(date: string | null | undefined, s: OnlineSetup): boolean {
  if (!date || !DATE_RE.test(date)) return false;
  const p = dailyPlan(date, s.mode).setup;
  const same = p.seed === s.seed && p.map === s.map && p.danger === s.danger && (s.character ?? 'xiaodao') === p.character && (p.curses ?? []).join() === (s.curses ?? []).join() && p.raid?.template === s.raid?.template;
  const extras = s.endless || s.assist || s.novice || s.weekly || s.rush || s.live || s.trial !== undefined || s.xinfa !== undefined || s.startAlt || (s.kits?.length ?? 0) > 0 || Object.keys(s.perks ?? {}).length > 0;
  return same && !extras;
}
