/**
 * 解析游戏经 RPC 传来的参数（service.ts 调）：只认形状，余额、桌上那一份这些在 state.ts 的 apply 里查。
 * 形状不对返回错误码，不抛：RPC 的业务拒绝都走返回值。
 */
import { isCount, isPlain } from '../lib/body';
import { GAME_IDS } from '../../../shared/games';
import { type Cmd, MAX_BALANCE, type Mode, type SettleStats, type StatsError, TIERS, type TierId, type WalletError } from './state';
import { parseTally } from './tally';

/** 战绩小结 JSON 后最多几字节（docs/platform-backend.md 5.10） */
const STATS_MAX_BYTES = 256;
/** 一份最多算几局：德州坐一晚上可能上千手，超出的截掉，不整份忽略 */
const STATS_MAX_ROUNDS = 1_000;
/** 操作 id、ref 的样子 */
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

const isId = (x: unknown): x is string => typeof x === 'string' && ID_RE.test(x);
const isChips = isCount;
const isMode = (x: unknown): x is Mode => x === 'server' || x === 'client';
const isTier = (x: unknown): x is TierId => typeof x === 'string' && Object.hasOwn(TIERS, x);

/** 游戏传来的一条操作 → Cmd；形状不对返回错误码。game 是否认识也在这里查。 */
export function parseCmd(t: 'buyin' | 'settle' | 'refund' | 'exchange', raw: unknown): Cmd | WalletError {
  if (!isPlain(raw)) return 'bad_request';
  const b = raw;
  if (typeof b.game !== 'string' || !GAME_IDS.has(b.game)) return 'unknown_game';
  // 兑换不上桌：没有 ref、mode。amount 是 0 的在 apply 里回 bad_amount
  if (t === 'exchange') return isId(b.op) && isChips(b.amount) ? { t, game: b.game, op: b.op, amount: b.amount } : 'bad_request';
  if (!isId(b.ref) || !isId(b.op) || !isMode(b.mode)) return 'bad_request';
  const base = { game: b.game, ref: b.ref, op: b.op, mode: b.mode };
  switch (t) {
    case 'buyin':
      if (!isTier(b.tier) || !isChips(b.amount) || !isChips(b.until)) return 'bad_request';
      return { t, ...base, tier: b.tier, amount: b.amount, until: b.until };
    case 'settle': {
      if (!isChips(b.amount)) return 'bad_request';
      // tally 不合格就当没带：不能因为它让带回失败
      const tally = parseTally(b.tally);
      const withTally = tally ? { tally } : {};
      if (b.stats === undefined || b.stats === null) return { t, ...base, amount: b.amount, ...withTally };
      const stats = parseStats(b.stats);
      return typeof stats === 'string'
        ? { t, ...base, amount: b.amount, statsIgnored: stats, ...withTally }
        : { t, ...base, amount: b.amount, stats, ...withTally };
    }
    case 'refund':
      return { t, ...base };
  }
}

// 以字母开头：排除 __proto__ 这类会碰到原型的 key
const STAT_KEY = /^[a-z][a-z0-9_]{0,15}$/;
const TITLE_ID = /^[a-z][a-z0-9_]{0,23}$/;

/**
 * 小结 → 校验过的 SettleStats。超长、形状不对整份忽略（钱照常结）；局数超出只截断：德州一份能打上千手，
 * 赢的局数跟着截到不超过局数。
 */
function parseStats(raw: unknown): SettleStats | StatsError {
  let text: string;
  try {
    text = JSON.stringify(raw);
  } catch {
    // 循环引用、BigInt 之类序列化不了的 stats：当格式错误
    return 'bad_stats';
  }
  if (new TextEncoder().encode(text).length > STATS_MAX_BYTES) return 'too_big';
  if (!isPlain(raw) || !isCount(raw.rounds) || !isCount(raw.wins) || !isCount(raw.best)) return 'bad_stats';
  const rounds = Math.min(raw.rounds, STATS_MAX_ROUNDS);
  const out: SettleStats = { rounds, wins: Math.min(raw.wins, rounds), best: Math.min(raw.best, MAX_BALANCE) };
  if (raw.titles !== undefined) {
    if (!Array.isArray(raw.titles) || raw.titles.length > 5 || !raw.titles.every((t) => typeof t === 'string' && TITLE_ID.test(t))) return 'bad_stats';
    out.titles = [...new Set(raw.titles as string[])];
  }
  let keys = 0;
  for (const kind of ['max', 'sum'] as const) {
    const m = raw[kind];
    if (m === undefined) continue;
    if (!isPlain(m)) return 'bad_stats';
    const entries = Object.entries(m);
    if (!entries.every(([k, v]) => STAT_KEY.test(k) && typeof v === 'number' && Number.isSafeInteger(v))) return 'bad_stats';
    keys += entries.length;
    out[kind] = Object.fromEntries(entries) as Record<string, number>;
  }
  if (keys > 3) return 'bad_stats';
  return out;
}
