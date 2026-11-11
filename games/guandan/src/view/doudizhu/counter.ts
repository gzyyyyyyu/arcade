/**
 * 斗地主记牌器：这一副 54 张，每种点数还有几张没露面。
 * 只用公开信息加自己的手牌（视图里的 played、bottom、hand），不读别人的手牌。
 *
 * 底牌：叫完分翻开，三家都看得见，所以算"已露面"。地主之外的人把底牌扣掉；
 * 这样记牌器回答的是"没见过的牌还剩几张"，底牌在地主手里是已知的，不该算进对手可能握着的未知牌里。
 * 地主自己的底牌已经在手牌里（或已经打出去，在 played 里）。按牌 id 去重，同一张牌不会被扣两次，张数不会变负。
 */
import { ddzValue, type DdzView } from '../../variants/doudizhu/index.ts';

export interface DdzCounterCell {
  /** 比大小用的点数（ddzValue）：3..13，A 14，2 是 15，小王 16，大王 17 */
  rank: number;
  /** 还没露面的张数 */
  left: number;
}

/** 从大到小：大王、小王、2、A、K……3 */
const ORDER = [17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3];

export function countLeftDdz(view: Pick<DdzView, 'hand' | 'played' | 'bottom'>): DdzCounterCell[] {
  const known = new Set<number>([...view.hand, ...view.played, ...view.bottom]);
  const left = new Map<number, number>(ORDER.map((r) => [r, r >= 16 ? 1 : 4]));
  for (const c of known) {
    const r = ddzValue(c);
    left.set(r, Math.max(0, (left.get(r) ?? 0) - 1));
  }
  return ORDER.map((rank) => ({ rank, left: left.get(rank) ?? 0 }));
}
