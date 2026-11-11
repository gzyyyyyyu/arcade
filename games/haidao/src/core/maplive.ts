/**
 * 寻宝航线实盘（DESIGN.md 11.1）：带一份筹码跑一趟今天的航线，按终局星数结回；没到 1 星按宝分折算。
 * 航线和船队都是当天全服同一条（routeOf 只看北京日期），实盘不另改：每日榜照样可比，结果只看局内的决定。
 * 所以四档的难度一样，档位只换结回倍数（档越高，同样的星回得越少）。Worker 只从这里取档位表；金额换算复用 live.ts 的 liveReturn。
 */
import { MAP_STAR_PTS } from './map.ts';
import type { MapFinal } from './maptypes.ts';
import { LIVE_MAX_BP, LIVE_TIERS, type LiveTier } from './live.ts';

export interface MapLiveTierDef {
  id: LiveTier;
  name: string;
  /** 一份多少筹码：和悬赏出海是同一份钱包金额 */
  stake: number;
  /**
   * 结回倍数（万分之一）：[0 星时按宝分 ÷ 1 星线线性折算的满值（最多 0.79 份，所以 ≤ 7_900）, 1 星, 2 星, 3 星]。
   * 按 tools/map-live-sim.ts 两种机器人的结局拟合到 docs/balance.md 第 2 节（DESIGN.md 11.1 有实测表）；
   * 同档星越多越高，档越高三星不降（单测锁住）。
   */
  bp: readonly [number, number, number, number];
}

/** 0 星最多回 0.79 份 */
export const MAP_LIVE_ZERO_MAX_BP = 7_900;

export const MAP_LIVE_TIERS: Record<LiveTier, MapLiveTierDef> = {
  small: { id: 'small', name: '小', stake: LIVE_TIERS.small.stake, bp: [4_700, 11_000, 15_000, 15_500] },
  mid: { id: 'mid', name: '中', stake: LIVE_TIERS.mid.stake, bp: [7_700, 9_200, 12_700, 15_500] },
  big: { id: 'big', name: '大', stake: LIVE_TIERS.big.stake, bp: [2_600, 8_400, 11_650, 15_500] },
  lux: { id: 'lux', name: '豪华', stake: LIVE_TIERS.lux.stake, bp: [2_000, 8_000, 10_500, 15_500] },
};

/** 结回倍数（万分之一）：1–3 星按表；0 星按宝分占 1 星线的比例线性给，到满值 bp[0] */
export function mapLiveBp(tier: LiveTier, f: Pick<MapFinal, 'stars' | 'pts'>): number {
  const t = MAP_LIVE_TIERS[tier].bp;
  const stars = Math.max(0, Math.min(3, Math.floor(f.stars)));
  if (stars > 0) return Math.min(LIVE_MAX_BP, t[stars]!);
  const line = MAP_STAR_PTS[0];
  const pts = Math.max(0, Math.min(line, Math.floor(f.pts)));
  return Math.min(LIVE_MAX_BP, MAP_LIVE_ZERO_MAX_BP, Math.floor((t[0] * pts) / line));
}
