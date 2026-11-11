/**
 * 茶馆擂台（DESIGN.md 7 节、8 节 mahjong.ladder）：单机连打三桌，电脑一桌比一桌强（新手 → 普通 → 高手），三桌全赢拿这个玩法的称号。
 * 纯娱乐：不碰筹码，称号只存本机（和以后的云存档），不进平台。
 * 纯函数：不碰存储、时间和随机数。一轮擂台的密钥由画面层现生成传进来，每一桌的牌由它按桌号、第几次打派生，同一桌重进还是那副牌。
 * 中途离开：这一桌的牌局本身由单机存档（mahjong.solo）接着打，这里只记打到第几桌、这一桌是哪一场（solo），回来对得上就接着。
 */
import { stream } from 'arcade-kit/rng';
import type { Level } from '../ai/venues.ts';

export const LADDER_KEY = 'mahjong.ladder';

/** 擂台的三种打法：血战到底、血流成河（川麻 flow）、立直（一局） */
export const LADDER_MODES = ['xz', 'xl', 'x3', 'rc'] as const;
export type LadderMode = (typeof LADDER_MODES)[number];
export const isLadderMode = (m: unknown): m is LadderMode => (LADDER_MODES as readonly unknown[]).includes(m);

/** 三桌的难度，按桌号 */
export const LADDER_LEVELS: readonly Level[] = ['easy', 'normal', 'hard'];
export const TABLES = LADDER_LEVELS.length;
/** 一轮里输了能原桌重打几次（scripts/ladder.ts 量过，DESIGN.md 4.1） */
export const RETRIES = 0;

/** 这一桌算赢：打完不亏（净分 ≥ 0）。一局里没人点到自己、自己也没胡，也算守住了 */
export const winsTable = (net: number): boolean => net >= 0;

export interface LadderRun {
  mode: LadderMode;
  /** 这一轮的密钥（8 个 32 位整数） */
  key: number[];
  /** 正在打第几桌（0 起） */
  table: number;
  /** 这一轮已经重打过几次 */
  retried: number;
  /** 这一桌的单机存档号：存档还是它就接着打，对不上（被别的单机盖了）就按同一副牌重开这一桌 */
  solo?: string;
}

export interface LadderData {
  v: 1;
  run?: LadderRun;
  /** 打通过的玩法（拿到的称号），按 LADDER_MODES 的顺序 */
  titles: LadderMode[];
  /** 每种玩法最远赢到第几桌（0–3），首页显示进度 */
  best: Partial<Record<LadderMode, number>>;
}

export const emptyLadder = (): LadderData => ({ v: 1, titles: [], best: {} });

const u32 = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 0xffff_ffff;
const small = (n: unknown, max: number): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= max;
const sortModes = (ms: Iterable<LadderMode>): LadderMode[] => LADDER_MODES.filter((m) => new Set(ms).has(m));

function parseRun(raw: unknown): LadderRun | undefined {
  const r = raw as Partial<LadderRun> | null;
  if (!r || typeof r !== 'object' || !isLadderMode(r.mode)) return undefined;
  if (!Array.isArray(r.key) || r.key.length !== 8 || !r.key.every(u32)) return undefined;
  if (!small(r.table, TABLES - 1) || !small(r.retried, RETRIES)) return undefined;
  return { mode: r.mode, key: [...r.key], table: r.table, retried: r.retried, ...(typeof r.solo === 'string' && r.solo.length <= 64 ? { solo: r.solo } : {}) };
}

/** 读本机记录：坏的字段丢掉，整份坏了当空 */
export function parseLadder(raw: unknown): LadderData {
  try {
    const o = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Partial<LadderData> | null;
    if (!o || typeof o !== 'object' || o.v !== 1) return emptyLadder();
    const titles = Array.isArray(o.titles) ? sortModes(o.titles.filter(isLadderMode)) : [];
    const best: LadderData['best'] = {};
    for (const m of LADDER_MODES) if (small(o.best?.[m], TABLES)) best[m] = o.best![m];
    const run = parseRun(o.run);
    return { v: 1, titles, best, ...(run ? { run } : {}) };
  } catch {
    return emptyLadder();
  }
}

/** 开一轮新的（有没打完的一轮就作废它） */
export function startRun(d: LadderData, mode: LadderMode, key: readonly number[]): LadderData {
  return { ...d, run: { mode, key: [...key], table: 0, retried: 0 } };
}

/** 这一桌的牌局密钥：按桌号和第几次打分流，同一桌重进还是那副牌，重打换一副 */
export function tableKey(run: LadderRun): number[] {
  const rng = stream(run.key, `ladder:${run.table}:${run.retried}`);
  return Array.from({ length: 8 }, () => rng.u32());
}

/** 这一桌的难度 */
export const levelOf = (run: LadderRun): Level => LADDER_LEVELS[run.table]!;

/** 记下这一桌对应的单机存档号（开打时） */
export function bindSolo(d: LadderData, solo: string): LadderData {
  return d.run ? { ...d, run: { ...d.run, solo } } : d;
}

export type TableOutcome = 'next' | 'clear' | 'retry' | 'out';

/**
 * 一桌打完：赢了进下一桌，三桌都赢了拿称号、这一轮结束；输了还能重打就原桌换副牌重打，不能就这一轮结束。
 * 最远赢到第几桌按玩法记最好的一次。
 */
export function endTable(d: LadderData, net: number): { d: LadderData; outcome: TableOutcome } {
  const run = d.run;
  if (!run) return { d, outcome: 'out' };
  const { run: _, ...rest } = d;
  if (winsTable(net)) {
    const won = run.table + 1;
    const best = { ...d.best, [run.mode]: Math.max(d.best[run.mode] ?? 0, won) };
    if (won >= TABLES) return { d: { ...rest, best, titles: sortModes([...d.titles, run.mode]) }, outcome: 'clear' };
    return { d: { ...rest, best, run: { mode: run.mode, key: run.key, table: won, retried: run.retried } }, outcome: 'next' };
  }
  if (run.retried < RETRIES) return { d: { ...rest, run: { mode: run.mode, key: run.key, table: run.table, retried: run.retried + 1 } }, outcome: 'retry' };
  return { d: rest, outcome: 'out' };
}

/** 放弃这一轮 */
export function quitRun(d: LadderData): LadderData {
  const { run: _, ...rest } = d;
  return rest;
}

/** 上云存档的那一份（docs/platform-backend.md 5.5）：只有称号和最远几桌；没打完的一轮是这台设备上的牌局，不同步 */
export function cloudPart(d: LadderData): LadderData {
  // 按打法的顺序重排，同样的内容序列化出来一样（sameCloud 靠它）
  const best: LadderData['best'] = {};
  for (const m of LADDER_MODES) if (d.best[m]) best[m] = d.best[m];
  return { v: 1, titles: sortModes(d.titles), best };
}

/**
 * 合并本机和云端（或换号前的备份）：称号取并集、最远取较大；没打完的一轮留本机的。
 * 交换律、幂等：两边谁先谁后、合并几次结果都一样
 */
export function mergeLadder(local: LadderData, other: unknown): LadderData {
  const o = parseLadder(other);
  const best: LadderData['best'] = { ...local.best };
  for (const m of LADDER_MODES) {
    const b = Math.max(local.best[m] ?? 0, o.best[m] ?? 0);
    if (b) best[m] = b;
  }
  return { v: 1, titles: sortModes([...local.titles, ...o.titles]), best, ...(local.run ? { run: local.run } : {}) };
}

/** 两份上云的部分是否一样（合并后没变就不用上传） */
export const sameCloud = (a: LadderData, b: LadderData): boolean => JSON.stringify(cloudPart(a)) === JSON.stringify(cloudPart(b));
