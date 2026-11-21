/**
 * 金银锭（DESIGN 4.5）：换筹码用的游戏内货币，只能自己挣（三星、训练营、成就、每日悬赏），攻防抢不走、筹码买不到（单向）。
 * 挣了多少直接从存档算（ingotEarned），存档里只记领了多少（claimed）、换掉多少（spent）：
 * 待领 = 挣的 − 领的（进一键收取），手里 = 领的 − 换掉的。不用在每个结算函数里加钩子，也不会漏记、重记。
 */
import { INGOT_EARN } from '../content/livetable.ts';
import type { Profile, Result } from './types.ts';

const threeStars = (m: Readonly<Record<string, number>> | undefined): number => Object.values(m ?? {}).filter((s) => s >= 3).length;

/** 到现在一共挣了多少锭 */
export function ingotEarned(p: Profile): number {
  const stars = threeStars(p.stars) + threeStars(p.td?.stars) + threeStars(p.escort?.stars);
  return (
    stars * INGOT_EARN.threeStar +
    (p.train?.done.length ?? 0) * INGOT_EARN.train +
    p.achievements.length * INGOT_EARN.badge +
    (p.stats.dailyDone ?? 0) * INGOT_EARN.daily
  );
}

/** 手里有几锭 */
export function ingotBalance(p: Profile): number {
  return Math.max(0, (p.ingot?.claimed ?? 0) - (p.ingot?.spent ?? 0));
}

/** 还没领的（一键收取领） */
export function ingotOwed(p: Profile): number {
  return Math.max(0, ingotEarned(p) - (p.ingot?.claimed ?? 0));
}

/** 领走全部待领 */
export function claimIngot(p: Profile): { profile: Profile; got: number } {
  const got = ingotOwed(p);
  if (!got) return { profile: p, got: 0 };
  return { profile: { ...p, ingot: { claimed: (p.ingot?.claimed ?? 0) + got, spent: p.ingot?.spent ?? 0 } }, got };
}

/** 换掉 n 锭（先扣，兑换没入账的再用 refundIngot 退回） */
export function spendIngot(p: Profile, n: number): Result<Profile> {
  if (!Number.isInteger(n) || n < 1) return { ok: false, error: 'bad_amount' };
  if (n > ingotBalance(p)) return { ok: false, error: 'no_ingot' };
  return { ok: true, value: { ...p, ingot: { claimed: p.ingot?.claimed ?? 0, spent: (p.ingot?.spent ?? 0) + n } } };
}

/** 退回 n 锭（兑换被拒或只入了一部分） */
export function refundIngot(p: Profile, n: number): Profile {
  if (n <= 0) return p;
  return { ...p, ingot: { claimed: p.ingot?.claimed ?? 0, spent: Math.max(0, (p.ingot?.spent ?? 0) - n) } };
}
