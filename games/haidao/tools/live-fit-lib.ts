/**
 * 实盘配平的共用部分（live-sim.ts、map-live-sim.ts 用）。
 * 汇总里存星数分布和 0 星"折算占比" f 的和与平方和（悬赏出海 f = 摧毁率，守岛 f = 1 − (1 − 撑过波数占比)³，
 * 护航 f = 走过的格数占比，航线 f = 宝分 ÷ 1 星线），不存某一版 bp 算出的期望：合并时按当前的倍数表重算，改 bp 不用重跑模拟。
 * 0 星结回 = bp[0] × f（各玩法的 0 星上限都不会被 f ≤ 1 触到）。
 */
import type { Bp } from '../src/content/livetable.ts';
import type { LiveTier } from '../src/core/live.ts';

export type Style = 'novice' | 'normal';

export interface Raw {
  tier: LiveTier;
  style: Style;
  /** 哪一关（关卡池里的 id）；航线写 'route' */
  level: string;
  n: number;
  /** 星数 0/1/2/3 的局数 */
  dist: [number, number, number, number];
  /** 0 星局的折算占比之和、平方和 */
  f0: number;
  f0sq: number;
  /** 总秒数（游戏内） */
  secs: number;
}

export const zero = (tier: LiveTier, style: Style, level: string): Raw => ({ tier, style, level, n: 0, dist: [0, 0, 0, 0], f0: 0, f0sq: 0, secs: 0 });

export function add(a: Raw, b: Raw): void {
  a.n += b.n;
  for (let i = 0; i < 4; i++) a.dist[i]! += b.dist[i]!;
  a.f0 += b.f0;
  a.f0sq += b.f0sq;
  a.secs += b.secs;
}

/** 按倍数表算期望（份）、2SE、赢的比例 */
export function stats(r: Raw, bp: Bp): { mean: number; se2: number; win: number } {
  let sum = 0;
  let sq = 0;
  let wins = 0;
  for (let s = 1; s <= 3; s++) {
    const v = bp[s]! / 10_000 - 1;
    sum += r.dist[s]! * v;
    sq += r.dist[s]! * v * v;
    if (v > 0) wins += r.dist[s]!;
  }
  const k = bp[0] / 10_000;
  sum += k * r.f0 - r.dist[0]!;
  sq += k * k * r.f0sq - 2 * k * r.f0 + r.dist[0]!;
  const mean = sum / r.n;
  return { mean, se2: 2 * Math.sqrt(Math.max(0, sq / r.n - mean * mean) / r.n), win: wins / r.n };
}

/** docs/balance.md 第 2 节的目标区间（份），lo / hi 为 null 表示不设 */
export const TARGET: Record<LiveTier, Record<Style, [number | null, number | null]>> = {
  small: { novice: [0.05, 0.15], normal: [0.2, 0.4] },
  mid: { novice: [-0.05, 0.05], normal: [0.1, 0.2] },
  big: { novice: [-0.2, -0.1], normal: [0, 0.1] },
  lux: { novice: [null, -0.2], normal: [-0.05, 0.05] },
};

export function inside(tier: LiveTier, style: Style, mean: number): boolean {
  const [lo, hi] = TARGET[tier][style];
  return (lo === null || mean >= lo) && (hi === null || mean <= hi);
}

export function line(r: Raw, bp: Bp): string {
  const { mean, se2, win } = stats(r, bp);
  const [lo, hi] = TARGET[r.tier][r.style];
  const tgt = `${lo === null ? '' : lo.toFixed(2)}～${hi === null ? '' : hi.toFixed(2)}`;
  const pct = (k: number): string => `${Math.round((r.dist[k]! * 100) / r.n)}`;
  return (
    `${r.tier.padEnd(6)}${r.level.padEnd(15)}${(r.style === 'novice' ? '小白' : '普通').padEnd(4)} 期望 ${mean >= 0 ? '+' : ''}${mean.toFixed(3)} ± ${se2.toFixed(3)}  目标 ${tgt} ${inside(r.tier, r.style, mean) ? '✓' : '✗'}  ` +
    `赢 ${Math.round(win * 100)}%  ≥1★ ${100 - Number(pct(0))}%  3★ ${pct(3)}%  星 0/1/2/3 = ${r.dist.join('/')}  0★ 平均折算 ${r.dist[0] ? (r.f0 / r.dist[0]!).toFixed(2) : '-'}  时长 ${Math.round(r.secs / r.n)} 秒  [${r.n} 局]`
  );
}
