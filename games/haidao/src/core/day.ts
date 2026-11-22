/**
 * 北京时间（UTC+8）的「天」：每日悬赏、航线、实盘每日场次、大潮周榜都按它换天。
 * 规则核心不许用 Date，日期全用整数算法；画面层和 Worker 也引这里，换天的口径只有一份。
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** 北京时间 = UTC+8，不用时区库 */
const SHIFT_MS = 8 * 60 * 60 * 1000;

/** 北京时间距 1970-01-01 的第几天 */
export function beijingDayIndex(ms: number): number {
  return Math.floor((ms + SHIFT_MS) / DAY_MS);
}

/** 北京时间的日期 'YYYY-MM-DD' */
export function beijingDate(ms: number): string {
  const { y, m, d } = civilFromDays(beijingDayIndex(ms));
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 公历 y-m-d 距 1970-01-01 的天数（整数算法，不用 Date） */
export function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** 距 1970-01-01 的第 z 天是公历哪年哪月哪日（daysFromCivil 的反函数） */
export function civilFromDays(z: number): { y: number; m: number; d: number } {
  const zz = z + 719468;
  const era = Math.floor(zz / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

/** 距 1970-01-01 的第 z 天落在公历哪一年 */
export function yearOfDay(z: number): number {
  return civilFromDays(z).y;
}
