/**
 * 约局的时间算术（docs/social.md 1.6），纯函数好测。时间一律按北京时间显示和取整：好友在不同时区也看到同一个"20:00"，
 * 和接口的规矩一致（worker/api/social/meetups.ts：只收整点半点、最远到北京时间明天结束）。
 */
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SHIFT = 8 * HOUR;
const HALF = HOUR / 2;
/** 开局前 10 分钟起算"到点"：头像出小点、好友页的"去"变主按钮 */
const MEETUP_LEAD_MS = 600_000;
/** 开局后 30 分钟还算到点（接口的 meetupGraceMs，过了接口就不给了；这里只为两次轮询之间也及时收起） */
const MEETUP_GRACE_MS = 1_800_000;

const bjDay = (ms: number) => Math.floor((ms + SHIFT) / DAY);

/** 北京时间的"HH:MM" */
export const hhmm = (ms: number) => new Date(ms + SHIFT).toISOString().slice(11, 16);

/** "今天 20:00" / "明天 09:30" */
export function whenText(at: number, now: number): string {
  const d = bjDay(at) - bjDay(now);
  return `${d === 0 ? '今天' : d === 1 ? '明天' : `${d} 天后`} ${hhmm(at)}`;
}

/** 今天（0）或明天（1）还能选的开局时间：整点半点、晚于现在 */
export function slots(now: number, which: 0 | 1): number[] {
  const start = (bjDay(now) + which) * DAY - SHIFT;
  const first = Math.max(start, Math.floor(now / HALF) * HALF + HALF);
  const out: number[] = [];
  for (let t = first; t < start + DAY; t += HALF) out.push(t);
  return out;
}

/** 默认选的时间：离现在至少半小时的下一个整点；今天没有了就明天 20:00 */
export function defaultSlot(now: number): number {
  const today = slots(now, 0).find((t) => t - now >= HALF && (t + SHIFT) % HOUR === 0);
  return today ?? (bjDay(now) + 1) * DAY - SHIFT + 20 * HOUR;
}

/** 到点了：开局前 10 分钟到开局后 30 分钟 */
export const isDue = (at: number, now: number) => now >= at - MEETUP_LEAD_MS && now < at + MEETUP_GRACE_MS;
