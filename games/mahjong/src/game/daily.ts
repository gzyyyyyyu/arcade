/**
 * 每日挑战的纯函数（DESIGN.md 7 节）：日期 → 种子、记成绩、连续打卡天数。
 * 不碰时间和存储：今天是几号由画面层按北京时间算好传进来，读写 mahjong.daily 也在画面层（view/daily.ts）。
 * 同一天的种子相同，所以所有人这一天拿到同一副牌、同样的三个电脑。
 */

export const DAILY_KEY = 'mahjong.daily';
/** 每日挑战的规则：川麻·血战到底最短的一场（4 局），其余用默认，大家一样 */
export const DAILY_ROUNDS = 4 as const;
/** 立直的每日局：东风战（立直一场最短的），其余默认 */
export const DAILY_RC_LENGTH = 'tonpuu' as const;
/** 每日挑战有哪两种玩法（和 variant 的号一致）；成绩按玩法分开记 */
export const DAILY_VARIANTS = ['sichuan-xuezhan', 'riichi'] as const;
export type DailyVariant = (typeof DAILY_VARIANTS)[number];
export const isDailyVariant = (v: string): v is DailyVariant => (DAILY_VARIANTS as readonly string[]).includes(v);
/** 最近几天的成绩留着 */
const KEEP_DAYS = 7;

export interface DailyScore {
  /** 这一场的净得分 */
  net: number;
  /** 算成绩的是哪一场（存档的号）：同一场结算弹窗重画不会被当成练习 */
  id: string;
  /** 已经交给平台每日榜（交成功才写；没交成下次打开主页补交，只补当天的） */
  sent?: true;
}

export interface DailyData {
  /** 日期（YYYY-MM-DD）→ 当天算数的成绩，只留最近 KEEP_DAYS 天 */
  days: Record<string, DailyScore>;
  /** 历史最好的一次今日成绩；没打过是 null */
  best: number | null;
  /** 连续打卡：最后一次打卡的日期和到那天为止连续几天 */
  last: string | null;
  run: number;
}

export const emptyDaily = (): DailyData => ({ days: {}, best: null, last: null, run: 0 });

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (s: unknown): s is string => typeof s === 'string' && DATE.test(s) && !Number.isNaN(dayNo(s));

/** 日期的"第几天"，用来比较和相减（UTC 当天零点，跨月跨年都对） */
export function dayNo(date: string): number {
  return Math.floor(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86_400_000);
}

/** mahjong.daily 的整体：每种玩法一份（老数据只有川麻那一份，读成川麻） */
export type DailyAll = Record<DailyVariant, DailyData>;

export const emptyAll = (): DailyAll => ({ 'sichuan-xuezhan': emptyDaily(), riichi: emptyDaily() });

/** 读整份：新结构 { 'sichuan-xuezhan': {...}, riichi: {...} }；老结构（顶层直接是 days/best/last/run）整个当川麻；坏数据当空 */
export function parseAll(raw: unknown): DailyAll {
  try {
    const o = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown> | null;
    if (!o || typeof o !== 'object') return emptyAll();
    if ('days' in o) return { ...emptyAll(), 'sichuan-xuezhan': parseDaily(o) };
    return { 'sichuan-xuezhan': parseDaily(o['sichuan-xuezhan']), riichi: parseDaily(o.riichi) };
  } catch {
    return emptyAll();
  }
}

/** 读出来的东西不对（坏数据、旧格式）当空 */
export function parseDaily(raw: unknown): DailyData {
  try {
    const o = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Partial<DailyData> | null;
    if (!o || typeof o !== 'object' || !o.days || typeof o.days !== 'object') return emptyDaily();
    const days: Record<string, DailyScore> = {};
    for (const [d, x] of Object.entries(o.days)) {
      if (isDate(d) && x && Number.isFinite(x.net) && typeof x.id === 'string') days[d] = { net: x.net, id: x.id, ...(x.sent === true ? { sent: true as const } : {}) };
    }
    const best = typeof o.best === 'number' && Number.isFinite(o.best) ? o.best : null;
    const last = isDate(o.last) ? o.last : null;
    const run = last && Number.isInteger(o.run) && o.run! > 0 ? o.run! : 0;
    return { days, best, last, run };
  } catch {
    return emptyDaily();
  }
}

/** 日期（和玩法）→ 种子（8 个 32 位数，和单机平时现生成的密钥一个形状）。FNV-1a 按位置加盐。川麻的盐保持原样（已打过的日子牌不变），立直多加玩法名，两种玩法同一天两副不同的牌 */
export function dailyKey(date: string, variant: string = DAILY_VARIANTS[0]): number[] {
  const salt = variant === DAILY_VARIANTS[0] ? '' : `${variant}:`;
  return Array.from({ length: 8 }, (_, i) => {
    let h = 0x811c9dc5;
    for (const c of `mahjong-daily:${salt}${date}:${i}`) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
    return h;
  });
}

/**
 * 记一场。这个日期还没有成绩，或者算成绩的就是这一场 → 记下（first 为 true）；否则是练习，原样返回。
 * 连续天数：最后打卡是前一天就 +1，是当天保持，更早或第一次就从 1 开始；补记过了零点的旧日期不倒着改连续天数。
 */
export function recordDaily(data: DailyData, date: string, net: number, id: string): { data: DailyData; first: boolean } {
  const have = data.days[date];
  if (have && have.id !== id) return { data, first: false };
  if (have) return { data, first: true };
  const days = { ...data.days, [date]: { net, id } };
  for (const d of Object.keys(days).sort().slice(0, -KEEP_DAYS)) delete days[d];
  let run = data.run;
  let last = data.last;
  if (!last || dayNo(date) > dayNo(last)) {
    run = last && dayNo(date) - dayNo(last) === 1 ? run + 1 : 1;
    last = date;
  }
  return { data: { days, best: data.best === null ? net : Math.max(data.best, net), last, run }, first: true };
}

/** 今天看到的连续天数：最后打卡是今天或昨天还算数，再早就断了 */
export function streakOf(data: DailyData, today: string): number {
  return data.last && dayNo(today) - dayNo(data.last) <= 1 ? data.run : 0;
}

/** 最近 7 天（含今天，老的在前）：每天有成绩就带成绩，没打是 null */
export function lastDays(data: DailyData, today: string): { date: string; net: number | null }[] {
  const t = dayNo(today);
  return Array.from({ length: KEEP_DAYS }, (_, i) => {
    const date = new Date((t - (KEEP_DAYS - 1 - i)) * 86_400_000).toISOString().slice(0, 10);
    return { date, net: data.days[date]?.net ?? null };
  });
}

/** 每日榜的子榜号，和 DAILY_VARIANTS 一一对应（川麻 xz、立直 rc） */
const BOARD_SUB = ['xz', 'rc'] as const;

/** 平台每日榜的榜名：daily-<北京日期>-<子榜> */
export const dailyBoard = (date: string, variant: DailyVariant): string => `daily-${date}-${BOARD_SUB[DAILY_VARIANTS.indexOf(variant)]}`;

/** 该交的分：这一天有今日成绩、还没交；分数是净得分取整（平台只收整数） */
export function toSubmit(data: DailyData, date: string): number | null {
  const d = data.days[date];
  return d && !d.sent ? Math.round(d.net) : null;
}

/** 这一天的成绩交上了 */
export function markSent(data: DailyData, date: string): DailyData {
  const d = data.days[date];
  return d ? { ...data, days: { ...data.days, [date]: { ...d, sent: true } } } : data;
}
