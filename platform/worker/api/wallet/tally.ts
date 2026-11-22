/**
 * 真人对局统计（docs/platform-backend.md 5.11）：游戏结回、交分时可以多带一个 `tally`，平台只给
 * （天, 游戏, 玩法, mode, 档位, 时长段, 结果段）这个组合加 1，不存哪一局、哪个人。只有管理员在 /admin 看得到。
 * 没带或带得不合格就什么都不记，结回、交分照常（不合格的 tally 不能让筹码回不来）。
 */
import { isCount, isPlain } from '../lib/body';
import type { Db } from '../lib/db';
import { beijingDate } from '../core/time';
import { DAY } from '../core/context';

export interface Tally {
  variant: string;
  durSec: number;
  result?: 'win' | 'lose' | 'draw';
}

const VARIANT_RE = /^[a-z][a-z0-9-]{0,15}$/;
const DUR_MAX_SEC = 86_400;

/** 游戏传来的 tally → 合格的值；没带、形状不对一律 null（不报错） */
export function parseTally(raw: unknown): Tally | null {
  if (!isPlain(raw)) return null;
  const b = raw;
  const variant = b.variant === undefined ? 'main' : b.variant;
  if (typeof variant !== 'string' || !VARIANT_RE.test(variant)) return null;
  const d = b.durSec;
  if (!isCount(d) || d > DUR_MAX_SEC) return null;
  if (b.result !== undefined && b.result !== 'win' && b.result !== 'lose' && b.result !== 'draw') return null;
  return { variant, durSec: d, ...(b.result !== undefined && { result: b.result }) };
}

const DUR_BUCKETS = ['lt1m', '1-5m', '5-15m', '15-30m', '30-60m', 'ge60m'] as const;
const OUTCOME_BUCKETS = ['bust', 'lose', 'even', 'win', 'big', 'na'] as const;
export type DurBucket = (typeof DUR_BUCKETS)[number];
export type OutcomeBucket = (typeof OUTCOME_BUCKETS)[number];

export function durBucket(sec: number): DurBucket {
  if (sec < 60) return 'lt1m';
  if (sec < 300) return '1-5m';
  if (sec < 900) return '5-15m';
  if (sec < 1800) return '15-30m';
  if (sec < 3600) return '30-60m';
  return 'ge60m';
}

const RESULT_BUCKET = { win: 'win', lose: 'lose', draw: 'even' } as const;

/**
 * 结回的结果段：got 是进钱包的、stake 是桌上那一份。got = 0 输光；净值 < 0 输；= 0 持平；
 * 0 < 净值 < stake 赢；净值 ≥ stake（翻倍以上）大赢。带入是 0 时没法比，用游戏报的 result，没有就算持平。
 */
export function settleOutcome(stake: number, got: number, result?: Tally['result']): OutcomeBucket {
  if (stake <= 0) return result ? RESULT_BUCKET[result] : 'even';
  if (got <= 0) return 'bust';
  const net = got - stake;
  if (net < 0) return 'lose';
  if (net === 0) return 'even';
  return net >= stake ? 'big' : 'win';
}

/** 交分的结果段：没有筹码，只看游戏报的 result，没报就是 na */
export function scoreOutcome(result?: Tally['result']): OutcomeBucket {
  return result ? RESULT_BUCKET[result] : 'na';
}

/** 记一局：1 行 UPSERT。day 是北京时间的日期。 */
export function tallyStatement(
  db: Db,
  now: number,
  k: { game: string; variant: string; mode: string; tier: string; dur: DurBucket; outcome: OutcomeBucket },
): D1PreparedStatement {
  return db.stmt(
    `INSERT INTO play_tally (day, game, variant, mode, tier, dur, outcome, n) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)
     ON CONFLICT (day, game, variant, mode, tier, dur, outcome) DO UPDATE SET n = play_tally.n + 1`,
    beijingDate(now), k.game, k.variant, k.mode, k.tier, k.dur, k.outcome,
  );
}

/** 每天清理：删 tallyKeepDays 天前的，每次最多 max 行 */
export function tallyCleanupStatement(db: Db, now: number, keepDays: number, max: number): D1PreparedStatement {
  return db.stmt(
    `DELETE FROM play_tally WHERE (day, game, variant, mode, tier, dur, outcome) IN
       (SELECT day, game, variant, mode, tier, dur, outcome FROM play_tally WHERE day < ?1 LIMIT ?2)`,
    beijingDate(now - keepDays * DAY), max,
  );
}

interface TallyRow {
  game: string;
  variant: string;
  mode: string;
  tier: string;
  n: number;
  dur: Record<string, number>;
  outcome: Record<string, number>;
}

/** 管理页：最近 days 天（含今天）按游戏、玩法、mode、档位汇总。0 写入。 */
export async function readTally(db: Db, now: number, days: number): Promise<{ from: string; to: string; rows: TallyRow[] }> {
  const from = beijingDate(now - (days - 1) * DAY);
  const to = beijingDate(now);
  const got = await db.all<{ game: string; variant: string; mode: string; tier: string; dur: string; outcome: string; n: number }>(
    db.stmt(
      `SELECT game, variant, mode, tier, dur, outcome, SUM(n) AS n FROM play_tally WHERE day >= ?1 AND day <= ?2
       GROUP BY game, variant, mode, tier, dur, outcome`,
      from, to,
    ),
  );
  const map = new Map<string, TallyRow>();
  for (const r of got) {
    const key = [r.game, r.variant, r.mode, r.tier].join('|');
    let row = map.get(key);
    if (!row) map.set(key, (row = { game: r.game, variant: r.variant, mode: r.mode, tier: r.tier, n: 0, dur: {}, outcome: {} }));
    const n = Number(r.n);
    row.n += n;
    row.dur[r.dur] = (row.dur[r.dur] ?? 0) + n;
    row.outcome[r.outcome] = (row.outcome[r.outcome] ?? 0) + n;
  }
  const rows = [...map.values()].sort((a, b) => b.n - a.n || (a.game + a.variant + a.mode + a.tier).localeCompare(b.game + b.variant + b.mode + b.tier));
  return { from, to, rows };
}
