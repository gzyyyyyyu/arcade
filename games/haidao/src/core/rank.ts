/**
 * 海盗王阶（DESIGN 2.6）：主寨 8 级后把金币、木材"献上"攒王阶，只换外观和展示，不加任何战力。
 * 后几阶比仓库上限还贵，所以每阶可以分几次献，献进去的记在 rankFund 里、拿不回来、也不会被抢（不在 res 里）。
 * 王阶进攻防快照（别人打我的岛时看得到王旗），rankFund 不进；raidSetup / battle / td 都不读这两个字段。
 */
import { RANK_HQ, RANKS } from '../content/rank.ts';
import { hqLevel } from './base.ts';
import type { Profile, Res, Result } from './types.ts';

/** 已经到了第几阶（0 = 还没有） */
export const rankOf = (p: Profile): number => Math.max(0, Math.min(RANKS.length, Math.floor(p.rank ?? 0)));

/** 下一阶还差多少（已经满 10 阶为 null） */
export function rankLeft(p: Profile): Res | null {
  const next = RANKS[rankOf(p)];
  if (!next) return null;
  const f = p.rankFund ?? { gold: 0, wood: 0 };
  return { gold: Math.max(0, next.cost.gold - f.gold), wood: Math.max(0, next.cost.wood - f.wood) };
}

/**
 * 献上：手里的金币、木材按下一阶还差的量献进去（献多少由 want 定，默认能献的全献，不超过还差的）；
 * 两样都攒满就升一阶、清零重新攒。没到主寨 8 级 locked，满阶 max，手里一点都献不了 nothing。
 */
export function donateRank(p: Profile, want?: Res): Result<{ profile: Profile; ranked: boolean }> {
  if (hqLevel(p) < RANK_HQ) return { ok: false, error: 'locked' };
  const left = rankLeft(p);
  if (!left) return { ok: false, error: 'max' };
  const g = Math.max(0, Math.min(left.gold, p.res.gold, want?.gold ?? Number.MAX_SAFE_INTEGER));
  const w = Math.max(0, Math.min(left.wood, p.res.wood, want?.wood ?? Number.MAX_SAFE_INTEGER));
  if (g === 0 && w === 0) return { ok: false, error: 'nothing' };
  const f = p.rankFund ?? { gold: 0, wood: 0 };
  const fund = { gold: f.gold + g, wood: f.wood + w };
  const res = { gold: p.res.gold - g, wood: p.res.wood - w };
  const r = rankOf(p);
  if (g === left.gold && w === left.wood) {
    const { rankFund: _f, ...rest } = p;
    void _f;
    return { ok: true, value: { profile: { ...rest, res, rank: r + 1 }, ranked: true } };
  }
  return { ok: true, value: { profile: { ...p, res, rankFund: fund }, ranked: false } };
}
