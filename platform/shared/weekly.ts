/**
 * 每周挑战榜（docs/platform-backend.md 15.5）：榜名 week-<YYYY>-W<ww>-<子榜>[-v<n>]，按北京时间的 ISO 周（周一 0 点换周）。
 * 交分和 Cron（Worker）要算"这是第几周"；放在 shared/，界面也从这里取 `DAY`。只用纯算术、不读时区设置。
 * 年份和周号补零后按字典序就是按时间排：Cron 按 board_id 范围删旧榜，和每日榜同一个办法。
 */
// 这个文件不 import 别的：Worker、浏览器、冒烟工具三套 tsconfig 对引用后缀的要求不一样
export const DAY = 24 * 60 * 60 * 1000;
const SHIFT = 8 * 60 * 60 * 1000;

// 子榜 id 的写法同每日子榜（games.ts 的 DAILY_SUB_RE）：字母开头，不能像版本号 v2
const WEEKLY_RE = /^week-(\d{4}-W\d{2})-((?!v\d)[a-z][a-z0-9]{0,15})(?:-v([1-9]\d?))?$/;

/** 北京时间的 ISO 周，形如 2026-W44：哪年按这周的周四算（ISO 8601），所以年底年初的几天可能算到另一年 */
export function beijingIsoWeek(ms: number): string {
  const day = Math.floor((ms + SHIFT) / DAY);
  // 1970-01-01 是周四：(day + 3) % 7 是离本周一几天
  const thursday = day - ((day + 3) % 7) + 3;
  const year = new Date(thursday * DAY).getUTCFullYear();
  const jan1 = Math.floor(Date.UTC(year, 0, 1) / DAY);
  const week = Math.floor((thursday - jan1) / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** 每周榜的周、子榜、版本号（没有版本号是 0）；不是每周榜的形式时为 null */
export function parseWeekly(boardId: string): { week: string; sub: string; v: number } | null {
  const m = WEEKLY_RE.exec(boardId);
  if (!m) return null;
  return { week: m[1]!, sub: m[2]!, v: Number(m[3] ?? 0) };
}
