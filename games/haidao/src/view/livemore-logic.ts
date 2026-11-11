/**
 * 护航和寻宝航线实盘的小逻辑（纯函数，tests/livemore.test.ts 锁住）：结算文案、航线实盘进度的存取判断。
 * 进度存在 `haidao.maplive.run`，和娱乐的 `haidao.map` 完全分开；钱的那一份在 net/live.ts 的 `haidao.maplive`。
 */
import { MAP_RULES } from '../core/index.ts';
import type { LiveTier } from '../core/live.ts';
import { mapLiveBp } from '../core/maplive.ts';
import type { MapState } from '../core/maptypes.ts';

export const MAPLIVE_RUN_KEY = 'haidao.maplive.run';

/** 本机记的实盘航线：哪一天、哪一档、走到哪（进了战斗还没写回的一站记在 pending） */
export interface LiveRun {
  day: string;
  tier: LiveTier;
  state?: MapState;
  pending?: { node: number; rest: number };
}

const TIERS: readonly string[] = ['small', 'mid', 'big', 'lux'];

/** 把 localStorage 里的原文读成实盘航线；坏数据当没有 */
export function parseLiveRun(raw: string | null): LiveRun | null {
  try {
    const v = JSON.parse(raw ?? 'null') as Partial<LiveRun> | null;
    if (!v || typeof v.day !== 'string' || typeof v.tier !== 'string' || !TIERS.includes(v.tier)) return null;
    const out: LiveRun = { day: v.day, tier: v.tier as LiveTier };
    if (v.state && typeof v.state === 'object' && v.state.route?.day === v.day) out.state = v.state;
    if (v.pending && Number.isInteger(v.pending.node) && Number.isInteger(v.pending.rest)) out.pending = { node: v.pending.node, rest: v.pending.rest };
    return out;
  } catch {
    return null;
  }
}

export function readLiveRun(): LiveRun | null {
  try {
    return parseLiveRun(localStorage.getItem(MAPLIVE_RUN_KEY));
  } catch {
    return null;
  }
}

export function writeLiveRun(v: LiveRun | null): void {
  try {
    if (v) localStorage.setItem(MAPLIVE_RUN_KEY, JSON.stringify(v));
    else localStorage.removeItem(MAPLIVE_RUN_KEY);
  } catch {
    // 存不上：最坏是刷新后这趟按已记的钱包状态结（没进度就按输结）
  }
}

/** resume() 遇到 playing 时：进度还在、是同一天、没走完、档位对得上，就接着跑，不按输结 */
export function liveRunKeep(run: LiveRun | null, today: string, recTier: LiveTier): boolean {
  return !!run && run.day === today && run.tier === recTier && !!run.state && !run.state.over;
}

/** 跨天了：这趟航线作废，按当时已拿的宝分收航结（战斗中途离开的那一站是 0 宝分，不算在里面） */
export function liveRunBpOnExpire(run: LiveRun | null, recTier: LiveTier): number {
  if (!run?.state || run.tier !== recTier) return 0;
  const home = MAP_RULES.goHome(run.state);
  return mapLiveBp(recTier, MAP_RULES.mapFinal(home));
}

/** 结算页"拿回带入的 N%" */
export const returnPctText = (bp: number): string => `拿回带入的 ${Math.round(bp / 100)}%`;

/** 这局筹码 ±N（赢输用不同符号，数字不带小数） */
export function netText(credited: number, stake: number): string {
  const net = credited - stake;
  return `这局筹码 ${net >= 0 ? '+' : '−'}${Math.floor(Math.abs(net)).toLocaleString('en-US')}`;
}

/** 护航实盘结算里的一行："商船剩余血量 N% · 走了 a/b 格" */
export const escortLiveLine = (r: { hullPct: number; cells: number; total: number }): string => `商船剩余血量 ${r.hullPct}% · 走了 ${r.cells}/${r.total} 格`;

/** 航线实盘结算里的一行："宝分 N · M 星 · 走了 K 站" */
export const mapLiveLine = (f: { pts: number; stars: number }, stops: number): string => `宝分 ${Math.floor(f.pts).toLocaleString('en-US')} · ${f.stars} 星 · 走了 ${stops} 站`;

/** 选档页顶上的"今天还剩几场"；打完了给 over 版本（按钮灰掉） */
export function quotaText(kind: 'escort' | 'map', left: number, max: number): { text: string; full: boolean } {
  if (kind === 'escort') {
    return left > 0 ? { text: `今天还能护 ${left} 场（每天 ${max} 场）`, full: false } : { text: `今天的护航实盘打完了（每天 ${max} 场），明天再来`, full: true };
  }
  return left > 0 ? { text: `今天还能跑 ${left} 趟（每天 ${max} 趟）`, full: false } : { text: `今天的航线实盘打完了（每天 ${max} 趟），明天再来`, full: true };
}

/** 航线实盘选档卡上的说明：四档同一条航线，只换结回倍数 */
export const MAP_TIER_NOTE = '同一条航线，档越高结回越少';
