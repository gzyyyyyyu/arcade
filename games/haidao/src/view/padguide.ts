import { cellX, cellY } from '../core/grid.ts';
import { UNIT } from '../core/types.ts';

/**
 * 海盗来袭开局的木台推荐（纯函数，只读核心给的路线 tdRoutes 和木台表，不自己算规则）。
 * 新手开局倒数里只造 1–2 座塔且离入口远，第一波水手直冲主寨、炮台打不到，所以高亮离敌人路线最近的几块空木台。
 */

export interface GuideSlot {
  x: number;
  y: number;
  tower: number;
  garrison?: number;
  wreck?: number;
}
export interface GuideRoute {
  cells: number[];
  open: boolean;
}

/** 木台中心（2×2，所以 +1）离路线超过这个格数的不推荐：炮台够不着 */
export const GUIDE_MAX_DIST = 4.5;
/** 同样近时更靠近入口的优先：沿路线每走一格折成这么多格的距离 */
const ALONG = 0.03;

/**
 * 按"离路线近、靠近入口"给空木台排序，返回木台下标。
 * 每条开着的路先各取最好的一块（别全挤在一条路上），再按分数补满到 limit 块。
 */
export function recommendPads(slots: readonly GuideSlot[], routes: readonly GuideRoute[], limit = 3): number[] {
  type Cand = { i: number; score: number; lane: number };
  const cands: Cand[] = [];
  slots.forEach((sl, i) => {
    if (sl.tower >= 0 || sl.garrison !== undefined || sl.wreck !== undefined) return;
    const cx = sl.x + 1;
    const cy = sl.y + 1;
    let best = Infinity;
    let lane = -1;
    routes.forEach((r, li) => {
      if (!r.open) return;
      r.cells.forEach((c, k) => {
        const dx = cellX(c) / UNIT - cx;
        const dy = cellY(c) / UNIT - cy;
        const sc = Math.sqrt(dx * dx + dy * dy);
        if (sc <= GUIDE_MAX_DIST && sc + k * ALONG < best) {
          best = sc + k * ALONG;
          lane = li;
        }
      });
    });
    if (lane >= 0) cands.push({ i, score: best, lane });
  });
  // 分数相同按下标，结果稳定
  cands.sort((a, b) => a.score - b.score || a.i - b.i);
  const out: number[] = [];
  const lanes = new Set<number>();
  for (const c of cands) {
    if (out.length >= limit) break;
    if (lanes.has(c.lane)) continue;
    lanes.add(c.lane);
    out.push(c.i);
  }
  for (const c of cands) {
    if (out.length >= limit) break;
    if (!out.includes(c.i)) out.push(c.i);
  }
  return out;
}

/** 引导还该不该显示：开局倒数里（第一波没开、倒数还在走）、没结束、挑出来的木台里还有空的 */
export function guideVisible(wave: number, tick: number, next: number, over: boolean, emptyPicks: number): boolean {
  return wave === 0 && next >= 0 && tick < next && !over && emptyPicks > 0;
}
