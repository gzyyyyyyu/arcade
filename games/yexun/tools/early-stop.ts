/**
 * 模拟提前停（sim.ts --stop）：每格按批跑，每批后看两条线（小白、普通）实盘期望的 ±2SE 区间，「要不要动系数」定了就停这格，省下跑满的时间。
 * 口径和配平的修正规则一致（所有者 11-03：超带上限 +0.15 才压，普通低于下限 0.10 以上才抬，小白偏低不管）。一条线「定了」：
 * - 普通：区间整个高于上限 +0.15（多发，要压）、整个低于下限 −0.10（偏低，要抬）、或整个落在 [下限 −0.10, 上限 +0.15] 里（不用动）；
 * - 小白：区间整个高于上限 +0.15（多发），或上沿不超过上限 +0.15（不会多发；偏低不管，所以不看下限）。
 * 两条线都定了就停，最少 min 局、最多 max 局（跑满）。区间跨着 上限 +0.15 或 下限 −0.10 的格子会一直跑到 max。
 * 种子按顺序分批（from+1、from+2……），提前停的结果正好是跑满那一格的前 N 局，所以可以拿已有的 json 离线回放这套规则（本文件的命令行）。
 *
 * 离线回放：node tools/early-stop.ts <sim 的 json>... [--batch 50] [--min 100] [--max 300]
 * 对每格比较「提前停时的动作」和「跑满 max 局按点估计的动作」，报不一致的格子和省下的局数、拍数（拍数近似耗时）。
 */
import { readFileSync } from 'node:fs';
import { vigilBp, type LiveTier } from '../src/content/live.ts';
import { liveBp } from '../src/explore/settle.ts';
import type { CharacterId } from '../src/content/meta.ts';
import type { MapId } from '../src/content/maps.ts';
import type { RaidLiveTemplate } from '../src/content/explore.ts';

/** balance.md 4.4：[下限, 上限]，守夜、夜探同一张表（夜探只有小中大） */
export const LIVE_BANDS: Record<LiveTier, { novice: readonly [number, number]; normal: readonly [number, number] }> = {
  small: { novice: [0.3, 0.45], normal: [0.6, 0.75] },
  medium: { novice: [0.15, 0.3], normal: [0.45, 0.6] },
  large: { novice: [0.05, 0.15], normal: [0.35, 0.45] },
  luxe: { novice: [-0.1, 0], normal: [0.2, 0.3] },
};
/** 超上限多少算「多发」（11-03 口径：超上限 +0.15 才压） */
export const OVER_MARGIN = 0.15;
/** 普通低于下限多少算「偏低」（低于下限 0.10 以上才抬） */
export const UNDER_MARGIN = 0.1;
export const STOP_DEFAULTS = { batch: 50, min: 100, max: 300 };

export type Line = 'novice' | 'normal';
/** keep：不用动系数；over：多发要压；under：普通偏低要抬 */
export type LineVerdict = 'keep' | 'over' | 'under';
export type StopWhy = '不用动' | '多发' | '偏低' | '跑满';

/** 均值和 2 倍标准误（样本方差） */
export function meanSe2(xs: readonly number[]): [number, number] {
  const n = xs.length;
  if (n === 0) return [0, Infinity];
  const m = xs.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return [m, Infinity];
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (n - 1);
  return [m, 2 * Math.sqrt(v / n)];
}

/** 期望 m（点估计或区间的一端）落在哪个动作区 */
function zone(m: number, band: readonly [number, number], line: Line): LineVerdict {
  if (m > band[1] + OVER_MARGIN) return 'over';
  return line === 'normal' && m < band[0] - UNDER_MARGIN ? 'under' : 'keep';
}

/** 一条线的区间定了没有：区间两端落在同一个动作区（压 / 抬 / 不用动）才算定了，跨区返回 null */
export function lineVerdict(xs: readonly number[], band: readonly [number, number], line: Line): LineVerdict | null {
  const [m, s] = meanSe2(xs);
  const lo = zone(m - s, band, line);
  return lo === zone(m + s, band, line) ? lo : null;
}

/** 两条线都定了才停；停的理由按要紧的排：多发 > 偏低 > 在带内 */
export function stopWhy(lines: { novice: readonly number[]; normal: readonly number[] }, tier: LiveTier, n: number, min: number, max: number): StopWhy | null {
  if (n < min) return null;
  const v = [lineVerdict(lines.novice, LIVE_BANDS[tier].novice, 'novice'), lineVerdict(lines.normal, LIVE_BANDS[tier].normal, 'normal')];
  if (v.every((x) => x !== null)) return v.includes('over') ? '多发' : v.includes('under') ? '偏低' : '不用动';
  return n >= max ? '跑满' : null;
}

/** 一格按批回放：返回停在第几局和理由（数据不够 max 局时按已有的算） */
export function replayStop(lines: { novice: readonly number[]; normal: readonly number[] }, tier: LiveTier, opt = STOP_DEFAULTS): { n: number; why: StopWhy } {
  const total = Math.min(opt.max, lines.novice.length, lines.normal.length);
  for (let n = Math.min(opt.batch, total); ; n = Math.min(n + opt.batch, total)) {
    const why = stopWhy({ novice: lines.novice.slice(0, n), normal: lines.normal.slice(0, n) }, tier, n, opt.min, total);
    if (why) return { n, why };
  }
}

const VIGIL_TIER: Partial<Record<number, LiveTier>> = { 0: 'small', 2: 'medium', 3: 'large', 4: 'luxe' };
const RAID_TIER: Partial<Record<number, LiveTier>> = { 0: 'small', 1: 'medium', 2: 'large', 3: 'luxe' };
/** 实盘档（守夜危险 0/2/3/4，夜探 0/1/2/3），别的危险不是实盘 */
export const tierOf = (raid: boolean, danger: number): LiveTier | undefined => (raid ? RAID_TIER : VIGIL_TIER)[danger];

/** sim 的 json 一局 → 实盘结回 − 1 份（按现在的系数；守夜 [赢, 尸王, 拍, …]，夜探 [撤出, 价值, 拍, …]） */
export function runEv(raid: boolean, tier: LiveTier, map: string, char: CharacterId, r: readonly number[]): number {
  if (raid) return (r[0] ? liveBp(r[1]!, tier, map as RaidLiveTemplate, r[2]!, char) : 0) / 10_000 - 1;
  return vigilBp(tier, r[2]!, r[0] === 1, r[1] === 1, char, map as MapId) / 10_000 - 1;
}

if (process.argv[1]?.endsWith('early-stop.ts')) {
  const arg = (k: string, d: number): number => {
    const i = process.argv.indexOf(k);
    return i >= 0 ? Number(process.argv[i + 1]) : d;
  };
  const opt = { batch: arg('--batch', STOP_DEFAULTS.batch), min: arg('--min', STOP_DEFAULTS.min), max: arg('--max', STOP_DEFAULTS.max) };
  const files = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));
  let cells = 0, bad = 0, runs = 0, runsFull = 0, ticks = 0, ticksFull = 0;
  const whys: Record<string, number> = {};
  for (const f of files) {
    const data = JSON.parse(readFileSync(f, 'utf8')) as { diff: number; skill: string; map: string; char: CharacterId; mode: string; runs: number[][] }[];
    const raid = data[0]?.mode === 'raid';
    for (const diff of [...new Set(data.map((c) => c.diff))]) {
      const tier = tierOf(raid, diff);
      const nv = data.find((c) => c.diff === diff && c.skill === 'novice');
      const nr = data.find((c) => c.diff === diff && c.skill === 'normal');
      if (!tier || !nv || !nr) continue;
      const lines = { novice: nv.runs.map((r) => runEv(raid, tier, nv.map, nv.char, r)), normal: nr.runs.map((r) => runEv(raid, tier, nr.map, nr.char, r)) };
      const full = Math.min(opt.max, lines.novice.length, lines.normal.length);
      const { n, why } = replayStop(lines, tier, opt);
      cells++;
      whys[why] = (whys[why] ?? 0) + 1;
      runs += 2 * n;
      runsFull += 2 * full;
      for (const c of [nv, nr]) {
        ticks += c.runs.slice(0, n).reduce((a, r) => a + r[2]!, 0);
        ticksFull += c.runs.slice(0, full).reduce((a, r) => a + r[2]!, 0);
      }
      if (why === '跑满') continue;
      // 提前停时每条线的区间结论，和跑满的点估计比
      for (const k of ['novice', 'normal'] as const) {
        const early = lineVerdict(lines[k].slice(0, n), LIVE_BANDS[tier][k], k);
        const late = zone(meanSe2(lines[k].slice(0, full))[0], LIVE_BANDS[tier][k], k);
        if (early !== late) {
          bad++;
          console.log(`不一致：${f.split('/').pop()} 危险 ${diff} ${k}：第 ${n} 局停（${early}），跑满 ${full} 局点估计 ${meanSe2(lines[k].slice(0, full))[0].toFixed(3)}（${late}）`);
        }
      }
    }
  }
  console.log(`格子 ${cells}：${Object.entries(whys).map(([k, v]) => `${k} ${v}`).join('、')}；提前停的线和跑满不一致 ${bad} 条`);
  console.log(`局数 ${runs} / ${runsFull}（省 ${((1 - runs / runsFull) * 100).toFixed(0)}%），拍数 ${(ticks / 1e6).toFixed(1)}M / ${(ticksFull / 1e6).toFixed(1)}M（省 ${((1 - ticks / ticksFull) * 100).toFixed(0)}%，约等于省下的耗时）`);
}
