/**
 * 寻宝航线实盘（DESIGN.md 11.1）：带一份筹码跑一趟今天的航线，按终局星数结回；没到 1 星按宝分折算。
 * 航线和船队都是当天全服同一条（routeOf 只看北京日期），实盘不另改：每日榜照样可比，结果只看局内的决定。
 * 所以四档的难度一样，档位只换结回倍数（档越高，同样的星回得越少；表在 content/livetable.ts，池里只有一项）。金额换算复用 live.ts 的 liveReturn。
 */
import { MAP_STAR_PTS } from './map.ts';
import type { MapFinal } from './maptypes.ts';
import { LIVE_MAX_BP, livePick, type LiveTier } from './live.ts';

/** 0 星最多回 0.79 份 */
export const MAP_LIVE_ZERO_MAX_BP = 7_900;

/** 结回倍数（万分之一）：1–3 星按表；0 星按宝分占 1 星线的比例线性给，到满值 bp[0] */
export function mapLiveBp(tier: LiveTier, f: Pick<MapFinal, 'stars' | 'pts'>): number {
  const t = livePick('map', tier, 0).bp;
  const stars = Math.max(0, Math.min(3, Math.floor(f.stars)));
  if (stars > 0) return Math.min(LIVE_MAX_BP, t[stars]!);
  const line = MAP_STAR_PTS[0];
  const pts = Math.max(0, Math.min(line, Math.floor(f.pts)));
  return Math.min(LIVE_MAX_BP, MAP_LIVE_ZERO_MAX_BP, Math.floor((t[0] * pts) / line));
}
