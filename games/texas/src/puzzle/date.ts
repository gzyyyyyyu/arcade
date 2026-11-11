/**
 * 日期的整数运算（谜题按北京日期出题，docs/features.md 13.11）：规则核心里不能碰 Date，
 * 所以"哪一天、昨天是哪天、这天是第几天"都用公历的整数公式算（Howard Hinnant 的 days_from_civil）。
 */
const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 1970-01-01 起的天数；格式或日历不对给 null（2 月 30 日这种也算不对） */
export function dayNumber(date: string): number | null {
  const m = RE.exec(date);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const n = daysFromCivil(y, mo, d);
  return dateOfDay(n) === date ? n : null;
}

function daysFromCivil(y0: number, m: number, d: number): number {
  const y = m <= 2 ? y0 - 1 : y0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** dayNumber 的反过来：天数 → "YYYY-MM-DD" */
export function dateOfDay(n: number): string {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  const p = (x: number, w: number): string => String(x).padStart(w, '0');
  return `${p(y, 4)}-${p(m, 2)}-${p(d, 2)}`;
}

export const isDay = (s: unknown): s is string => typeof s === 'string' && dayNumber(s) !== null;

/** 前一天；日期不对原样返回 */
export function prevDay(date: string): string {
  const n = dayNumber(date);
  return n === null ? date : dateOfDay(n - 1);
}
