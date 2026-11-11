/**
 * 悬赏守岛配平的共用部分（td-live-sim.ts 跑、td-live-merge.ts 合并）。
 * 汇总里存的是星数分布和 0 星"折算占比"（1 − (1 − 撑过波数占比)³）的和与平方和，而不是某一版 bp 算出的期望：
 * 合并时按当前的倍数表重算，改 bp 不用重跑模拟。
 */
import { TD_LIVE_TIERS } from '../src/core/tdlive.ts';
import type { LiveTier } from '../src/core/live.ts';

export type Style = 'novice' | 'normal';

export interface Raw {
  tier: LiveTier;
  style: Style;
  n: number;
  /** 星数 0/1/2/3 的局数 */
  dist: [number, number, number, number];
  /** 0 星局的折算占比（见上）的和、平方和 */
  f0: number;
  f0sq: number;
  /** 0 星局撑过的波数之和 */
  waves0: number;
  /** 总拍数 */
  ticks: number;
  /** 每局丢的宝藏枚数之和 */
  lost: number;
}

export const zero = (tier: LiveTier, style: Style): Raw => ({ tier, style, n: 0, dist: [0, 0, 0, 0], f0: 0, f0sq: 0, waves0: 0, ticks: 0, lost: 0 });

export function add(a: Raw, b: Raw): void {
  a.n += b.n;
  for (let i = 0; i < 4; i++) a.dist[i]! += b.dist[i]!;
  a.f0 += b.f0;
  a.f0sq += b.f0sq;
  a.waves0 += b.waves0;
  a.ticks += b.ticks;
  a.lost += b.lost;
}

/** 按当前倍数表算期望（份）、2SE、赢的比例 */
export function stats(r: Raw): { mean: number; se2: number; win: number } {
  const bp = TD_LIVE_TIERS[r.tier].bp;
  let sum = 0;
  let sq = 0;
  let wins = 0;
  for (let s = 1; s <= 3; s++) {
    const v = bp[s]! / 10_000 - 1;
    sum += r.dist[s]! * v;
    sq += r.dist[s]! * v * v;
    if (v > 0) wins += r.dist[s]!;
  }
  // 0 星：v = bp0 × f − 1（f 为折算占比），封顶规则和 tdLiveBp 一致（f ≤ 1 且 bp0 ≤ 7900，不会触顶）
  const k = bp[0] / 10_000;
  sum += k * r.f0 - r.dist[0]!;
  sq += k * k * r.f0sq - 2 * k * r.f0 + r.dist[0]!;
  const mean = sum / r.n;
  return { mean, se2: 2 * Math.sqrt(Math.max(0, sq / r.n - mean * mean) / r.n), win: wins / r.n };
}

export function line(r: Raw): string {
  const { mean, se2, win } = stats(r);
  const z = r.dist[0]!;
  return (
    `${r.tier.padEnd(6)}${(r.style === 'novice' ? '小白' : '普通').padEnd(4)} 期望 ${mean >= 0 ? '+' : ''}${mean.toFixed(3)} ± ${se2.toFixed(3)}  赢 ${Math.round(win * 100)}%  ` +
    `星 0/1/2/3 = ${r.dist.join('/')}  0★ 平均撑过 ${z ? (r.waves0 / z).toFixed(1) : '-'} 波  丢 ${(r.lost / r.n).toFixed(1)} 枚  时长 ${Math.round(r.ticks / r.n / 20)} 秒`
  );
}

