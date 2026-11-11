/**
 * 海盗王阶的界面文字和进度（纯函数，tests/rankview.test.ts 锁住；规则在 core/rank.ts，画面只读它给的字段）。
 */
import { RANKS } from '../content/rank.ts';
import { rankLeft, rankOf } from '../core/rank.ts';
import type { Profile, Res } from '../core/types.ts';

/** 「海盗王阶 3 · 银锚」；没有王阶（0 或越界）给空串 */
export function rankTitle(rank: number): string {
  const r = RANKS[Math.floor(rank) - 1];
  return r ? `海盗王阶 ${Math.floor(rank)} · ${r.name}` : '';
}

export interface RankView {
  /** 已到第几阶（0..10） */
  rank: number;
  /** 下一阶；满阶 null */
  next: { name: string; cost: Res; fund: Res; left: Res } | null;
  /** 点「献上」会献出多少：手里有的，不超过还差的 */
  want: Res;
}

export function rankView(p: Profile): RankView {
  const rank = rankOf(p);
  const nx = RANKS[rank];
  const left = rankLeft(p);
  if (!nx || !left) return { rank, next: null, want: { gold: 0, wood: 0 } };
  const fund = p.rankFund ?? { gold: 0, wood: 0 };
  return {
    rank,
    next: { name: nx.name, cost: nx.cost, fund: { gold: fund.gold, wood: fund.wood }, left },
    want: { gold: Math.max(0, Math.min(left.gold, p.res.gold)), wood: Math.max(0, Math.min(left.wood, p.res.wood)) },
  };
}

/** 进度条填多满（0..100，向下取整；还没献时 0） */
export const pctOf = (have: number, need: number): number => (need <= 0 ? 100 : Math.max(0, Math.min(100, Math.floor((have / need) * 100))));
