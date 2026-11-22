/**
 * 钱包卡的"本周走势"：用当前余额和接口给的流水倒推本周每天结束时的余额。
 * 纯函数，不碰 DOM；北京时间（UTC+8，没有夏令时）每周一 0 点起算，和排行榜的"本周"一致。
 * 流水只留最近 30 笔，所以只画流水能覆盖到的部分：从本周第一笔进出那天的"开头"画到今天。
 */
import type { LedgerEntry } from '../../api.ts';
import { DAY } from '../../../shared/weekly.ts';

const BJ = 8 * 3_600_000;

/** 北京时间的第几天（从 1970-01-01 数起） */
const dayOf = (ms: number) => Math.floor((ms + BJ) / DAY);
/** 这一周周一的天序号：1970-01-01 是周四，所以 (天序号 + 3) % 7 == 0 就是周一 */
const mondayOf = (day: number) => day - ((day + 3) % 7);

export interface TrendPoint {
  /** 0..width */
  x: number;
  /** 0..height，越大越靠下 */
  y: number;
  /** 这一点对应的余额 */
  value: number;
}

export interface Trend {
  points: TrendPoint[];
  /** SVG path 的 d；点不到 2 个时为空串 */
  path: string;
  /** 本周余额变化（今天余额 减 开头那点） */
  change: number;
}

/** 本周每天结束时的余额，第一个是"第一笔进出那天开始前"的余额；本周没有流水返回空数组 */
export function weekBalances(balance: number, ledger: readonly LedgerEntry[], now: number): number[] {
  const today = dayOf(now);
  const start = mondayOf(today);
  const mine = ledger.filter((e) => dayOf(e.at) >= start && dayOf(e.at) <= today);
  if (mine.length === 0) return [];
  const first = Math.min(...mine.map((e) => dayOf(e.at)));
  const out: number[] = [];
  // 从今天往回：今天结束 = 当前余额；前一天结束 = 今天结束 减 今天的进出
  let cur = balance;
  for (let d = today; d >= first; d--) {
    out.push(cur);
    cur -= mine.filter((e) => dayOf(e.at) === d).reduce((t, e) => t + e.a, 0);
  }
  out.push(cur);
  return out.reverse();
}

/** 归一化成 width × height 里的点；上下各留 pad，所有点一样高时画在中线 */
export function weekTrend(balance: number, ledger: readonly LedgerEntry[], now: number, width = 100, height = 48, pad = 6): Trend {
  const values = weekBalances(balance, ledger, now);
  if (values.length < 2) return { points: [], path: '', change: 0 };
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo;
  const points = values.map((value, i) => ({
    x: round((i / (values.length - 1)) * width),
    y: round(span === 0 ? height / 2 : height - pad - ((value - lo) / span) * (height - pad * 2)),
    value,
  }));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
  return { points, path, change: (values.at(-1) ?? 0) - (values[0] ?? 0) };
}

const round = (n: number) => Math.round(n * 100) / 100;
