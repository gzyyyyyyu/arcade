/**
 * 听牌速判的本机成绩（DESIGN.md 7 节、8 节 mahjong.ting）：最好的一轮分数 + 今天那一轮"今日一轮"的记账（daily）。
 * 不碰存储和时间，读写在画面层（view/ting.ts），今天是几号由它传进来。
 * 记账先于提交：开始就记，刷新、中途关页面都不能重来；交榜成功才写 sent，没交成下次再交；只交当天的。
 */
export const TING_KEY = 'mahjong.ting';

export interface TingData {
  /** 结构版本 */
  v: 1;
  /** 本机最好的一轮分数；没玩过是 0 */
  best: number;
  /** 今日一轮的记账；只留一天（日期变了就丢） */
  daily?: DailyTing;
}

export interface DailyTing {
  /** 哪一天（YYYY-MM-DD，北京时间） */
  date: string;
  score: number;
  correct: number;
  bestStreak: number;
  /** 这一轮打完了（时间到，或中途离开后按已得分算完） */
  done: boolean;
  /** 已经交给平台每日榜 */
  sent: boolean;
}

/** 分数上限：防止坏数据把主页撑坏（一轮 60 秒不可能到） */
const MAX_SCORE = 100000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const cnt = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= MAX_SCORE;

/** 今日一轮的记账读不对就当没有 */
function parseDaily(raw: unknown): DailyTing | undefined {
  const d = raw as Partial<DailyTing> | null;
  if (!d || typeof d !== 'object' || typeof d.date !== 'string' || !DATE_RE.test(d.date)) return undefined;
  if (!cnt(d.score) || !cnt(d.correct) || !cnt(d.bestStreak) || typeof d.done !== 'boolean' || typeof d.sent !== 'boolean') return undefined;
  return { date: d.date, score: d.score, correct: d.correct, bestStreak: d.bestStreak, done: d.done, sent: d.sent };
}

export const emptyTing = (): TingData => ({ v: 1, best: 0 });

/** 读出来的东西不对（坏数据、不是 JSON、分数不是整数）当没有 */
export function parseTing(raw: unknown): TingData {
  try {
    const o = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Partial<TingData> | null;
    if (!o || typeof o !== 'object') return emptyTing();
    const best = Number.isInteger(o.best) && o.best! > 0 && o.best! <= MAX_SCORE ? o.best! : 0;
    const daily = parseDaily(o.daily);
    return daily ? { v: 1, best, daily } : { v: 1, best };
  } catch {
    return emptyTing();
  }
}

/** 这一轮打完：破了最好成绩才改（得 0 分不算破纪录）；record 说有没有破 */
export function recordTing(data: TingData, score: number): { data: TingData; record: boolean } {
  if (!Number.isInteger(score) || score <= data.best) return { data, record: false };
  return { data: { ...data, best: Math.min(score, MAX_SCORE) }, record: true };
}

/** 今日一轮在平台每日榜上的榜名 */
export const tingBoard = (date: string): string => `daily-${date}-ting`;

/** 今天的记账（日期不是今天的不算） */
export const dailyOf = (data: TingData, today: string): DailyTing | null => (data.daily?.date === today ? data.daily : null);

/** 开始今日一轮：马上记一笔 0 分；今天已经有记录就不动（不能重来），别的日子的旧记录丢掉 */
export function startDaily(data: TingData, today: string): TingData {
  if (dailyOf(data, today)) return data;
  return { ...data, daily: { date: today, score: 0, correct: 0, bestStreak: 0, done: false, sent: false } };
}

/** 每答一题，把当前的分数等写进记账（已经打完的不再改） */
export function noteDaily(data: TingData, today: string, s: { score: number; correct: number; bestStreak: number }): TingData {
  const d = dailyOf(data, today);
  if (!d || d.done) return data;
  return { ...data, daily: { ...d, score: Math.min(s.score, MAX_SCORE), correct: s.correct, bestStreak: s.bestStreak } };
}

/** 时间到：写 done */
export function finishDaily(data: TingData, today: string): TingData {
  const d = dailyOf(data, today);
  return d && !d.done ? { ...data, daily: { ...d, done: true } } : data;
}

/** 交榜成功：写 sent */
export function markSent(data: TingData, today: string): TingData {
  const d = dailyOf(data, today);
  return d && !d.sent ? { ...data, daily: { ...d, sent: true } } : data;
}

/**
 * 进页面或主页时清账：旧日子的记录丢掉；今天没打完的（中途离开）按已得分算打完，破了最好成绩也记上；
 * 今天打完但没交成的要再交（submit 非空）；已经交过的不再交
 */
export function settleDaily(data: TingData, today: string): { data: TingData; submit: DailyTing | null } {
  if (!data.daily) return { data, submit: null };
  if (data.daily.date !== today) {
    const { daily: _old, ...rest } = data;
    return { data: rest, submit: null };
  }
  let next = finishDaily(data, today);
  next = recordTing(next, next.daily!.score).data;
  return { data: next, submit: next.daily!.sent ? null : next.daily! };
}
