/**
 * 快速局的“今日局”（docs/features.md 13.10）：每天同一副牌，一天只记一次分，上平台的每日榜。
 * 这里只放纯函数：日期（北京时间，由画面层算好传进来）→ 当天的种子和榜名，以及本机 texas.pushfold 记录的整理。
 * 随机数只用 arcade-kit/rng：日期的数字当密钥，按用途分出 8 个 32 位字，同一天永远得到同一把种子。
 */
import { stream, type Entropy } from 'arcade-kit/rng';

/** 日期 YYYY-MM-DD（北京时间） */
export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** 平台每日榜的榜名：`daily-<北京日期>-<子榜>`（platform-backend.md 9.2、15.5），子榜叫 pushfold */
export const dailyBoardId = (date: string): string => `daily-${date}-pushfold`;

/** 当天的 256 位种子：全世界同一天同一把 */
export function dailySeed(date: string): Entropy {
  if (!isDate(date)) throw new Error(`bad date ${date}`);
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const key = [y, m, d, 0x7075, 0x7368, 0x666f, 0x6c64, 1];
  const r = stream(key, 'pf-daily');
  return Array.from({ length: 8 }, () => r.below(0x100000000));
}

/** 本机存的快速局记录（texas.pushfold） */
export interface PushFoldRecord {
  /** 普通快速局的最好成绩（最后的筹码）和玩过几局 */
  best: number | null;
  plays: number;
  /** 今日局：哪天开始打过、得了多少（还没打完是 null）。一天一条，只留最近一次 */
  daily: { date: string; score: number | null } | null;
}

const int = (x: unknown): number | null => (typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 ? x : null);

/** 读时整理：坏的、缺的字段当没有 */
export function parseRecord(raw: unknown): PushFoldRecord {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = o.daily as { date?: unknown; score?: unknown } | null | undefined;
  return {
    best: int(o.best),
    plays: int(o.plays) ?? 0,
    daily: d && isDate(d.date) ? { date: d.date, score: int(d.score) } : null,
  };
}

/** 这一天还没打过今日局（开始就算打过，刷新接着打同一局，不能重开刷分）：才能记分、上榜 */
export const canScore = (rec: PushFoldRecord, date: string): boolean => rec.daily?.date !== date;

/** 开始今日局：记下今天打过 */
export const startDaily = (rec: PushFoldRecord, date: string): PushFoldRecord => (canScore(rec, date) ? { ...rec, daily: { date, score: null } } : rec);

/** 今日局打完：记分数（只记当天第一次那一局） */
export const finishDaily = (rec: PushFoldRecord, date: string, score: number): PushFoldRecord =>
  rec.daily?.date === date && rec.daily.score === null ? { ...rec, daily: { date, score } } : rec;

// ---------- 今日赛（docs/tournament.md 14.5）：每天一场单机极速赛，只有娱乐 ----------

/** 平台每日榜的榜名：子榜叫 tour */
export const dailyTourBoardId = (date: string): string => `daily-${date}-tour`;

/**
 * 当天今日赛的种子：同样是日期当密钥，但盐字和用途名都和快速局今日局（dailySeed）不同，
 * 所以同一天两种今日玩法的牌不会撞。当天所有人的牌堆、电脑性格和座位都一样
 */
export function dailyTourSeed(date: string): Entropy {
  if (!isDate(date)) throw new Error(`bad date ${date}`);
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const key = [y, m, d, 0x746f, 0x7572, 0x6e65, 0x7973, 2];
  const r = stream(key, 'tour-daily');
  return Array.from({ length: 8 }, () => r.below(0x100000000));
}

/**
 * 今日赛的分数（整数）：名次分 (7 − 名次) × 1000；
 * 第 1 名再加 clamp(100 − 用了几手, 0, 100)（赢得越快越高），第 2–6 名再加 min(撑到第几手, 999)（撑得越久越高）。
 * 第 1 名最高 6100，第 6 名最低 1000 + 手数
 */
export function tourScore(place: number, hands: number): number {
  const p = Math.min(6, Math.max(1, Math.floor(place)));
  const h = Math.max(0, Math.floor(hands));
  return (7 - p) * 1000 + (p === 1 ? Math.min(100, Math.max(0, 100 - h)) : Math.min(h, 999));
}

/** 本机存的今日赛记录（texas.dailytour）：一天一条，只留最近一次 */
export interface TourDailyRecord {
  date: string;
  /** 打完得的分；还没打完是 null */
  score: number | null;
  /** 分交上平台榜了没有（先记 false，成功才改 true，所以刷新、关页不会交第二次） */
  sent: boolean;
}

/** 读时整理：坏的、缺的字段当没有 */
export function parseTourDaily(raw: unknown): TourDailyRecord | null {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  if (!isDate(o.date)) return null;
  return { date: o.date, score: int(o.score), sent: o.sent === true && int(o.score) !== null };
}

/** 这一天还没打过今日赛（点开始就算打过，刷新接着打同一场）：才能记分、上榜 */
export const canScoreTour = (rec: TourDailyRecord | null, date: string): boolean => rec?.date !== date;

/** 开始今日赛：记下今天打过 */
export const startTourDaily = (rec: TourDailyRecord | null, date: string): TourDailyRecord | null =>
  canScoreTour(rec, date) ? { date, score: null, sent: false } : rec;

/** 今日赛打完：记分数（只记当天第一场；已经记过就原样返回，调用方据此判断要不要交榜） */
export const finishTourDaily = (rec: TourDailyRecord | null, date: string, score: number): TourDailyRecord | null =>
  rec?.date === date && rec.score === null ? { date, score, sent: false } : rec;

/** 交榜成功：标成已上榜 */
export const sentTourDaily = (rec: TourDailyRecord | null, date: string): TourDailyRecord | null =>
  rec?.date === date && rec.score !== null ? { ...rec, sent: true } : rec;
