/**
 * 护航实盘（DESIGN.md 12.1）：带一份筹码护一趟商船，按到港时的星数结回；没到港按船走了多远折算。
 * 每档固定用一关现成的护航关（escortlevels.ts，娱乐也玩这几关），开局只由"关 + 种子"决定（escortSetup 本来就不读存档），
 * 期望只和局内决策有关，模拟器量出来的就是所有人的期望。不另调关卡：改了娱乐的关，实盘就要重跑 tools/escort-live-sim.ts。
 * Worker 只从这里取档位表；金额换算复用 live.ts 的 liveReturn。
 */
import { escortSetup } from './escortrun.ts';
import type { EscortResult } from './escorttypes.ts';
import { LIVE_MAX_BP, LIVE_TIERS, type LiveTier } from './live.ts';
import type { TdSetup } from './tdtypes.ts';

export interface EscortLiveTierDef {
  id: LiveTier;
  name: string;
  /** 一份多少筹码：和悬赏出海是同一份钱包金额 */
  stake: number;
  /** 用哪一关护航关（`<图>-<难度>`） */
  level: string;
  /** 选档页的"电脑多强"：按用的那一关算，小、中两档是同一关所以一样 */
  power: number;
  /**
   * 结回倍数（万分之一）：[没到港时按走过的格数折算的满值（最多 0.79 份，所以 ≤ 7_900）, 1 星, 2 星, 3 星]。
   * 按 tools/escort-live-sim.ts 两种机器人的结局拟合到 docs/balance.md 第 2 节（DESIGN.md 12.1 有实测表）；
   * 同档星越多越高，档越高三星不降（单测锁住）。
   */
  bp: readonly [number, number, number, number];
}

/** 没到港最多回 0.79 份：沉了就是输，不能比"勉强到港"更值 */
export const ESCORT_LIVE_ZERO_MAX_BP = 7_900;

export const ESCORT_LIVE_TIERS: Record<LiveTier, EscortLiveTierDef> = {
  small: { id: 'small', name: '小', stake: LIVE_TIERS.small.stake, level: 'strait-normal', power: 2, bp: [7_700, 11_400, 12_900, 13_450] },
  mid: { id: 'mid', name: '中', stake: LIVE_TIERS.mid.stake, level: 'strait-normal', power: 2, bp: [7_400, 10_200, 11_450, 13_450] },
  big: { id: 'big', name: '大', stake: LIVE_TIERS.big.stake, level: 'bays-normal', power: 3, bp: [7_700, 8_200, 8_700, 13_450] },
  lux: { id: 'lux', name: '豪华', stake: LIVE_TIERS.lux.stake, level: 'strait-hard', power: 4, bp: [7_700, 18_800, 23_800, 24_300] },
};

/** 实盘这一档的开局：就是那一关的护航开局 */
export function escortLiveSetup(tier: LiveTier, seed: number): TdSetup {
  return escortSetup(ESCORT_LIVE_TIERS[tier].level, seed, { live: true });
}

/**
 * 结回倍数（万分之一）：到港按星数查表；没到港（沉船、误了潮）按走过的格数占比线性乘满值。
 * 不用守岛那条凹曲线：护航沉船、误潮多半在快到港的时候（9 关机器人平均走完 0.6–0.9），凹曲线下 0 星几乎都拿满值，分不出好坏。
 */
export function escortLiveBp(tier: LiveTier, r: Pick<EscortResult, 'arrived' | 'stars' | 'cells' | 'total'>): number {
  const t = ESCORT_LIVE_TIERS[tier].bp;
  const stars = r.arrived ? Math.max(0, Math.min(3, Math.floor(r.stars))) : 0;
  if (stars > 0) return Math.min(LIVE_MAX_BP, t[stars]!);
  const total = Math.max(1, Math.floor(r.total));
  const done = Math.max(0, Math.min(total, Math.floor(r.cells)));
  return Math.min(LIVE_MAX_BP, ESCORT_LIVE_ZERO_MAX_BP, Math.floor((t[0] * done) / total));
}
