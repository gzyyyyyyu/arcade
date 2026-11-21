/**
 * 护航实盘（DESIGN.md 12.1）：带一份筹码护一趟商船，按到港时的星数结回；没到港按船走了多远折算。
 * 每档一个关卡池（content/livetable.ts），按种子抽一关，读实盘专用的冻结副本（content/escortlivelevels.ts，拆分时和娱乐同名关逐字一样；娱乐的关以后随便调，不影响实盘），
 * 开局只由"关 + 种子"决定（不读存档），期望只和局内决策有关，模拟器量出来的就是所有人的期望。改冻结副本就要重跑 tools/live-sim.ts --kind escort。
 * 金额换算复用 live.ts 的 liveReturn。
 */
import { ESCORT_LIVE_LEVELS } from '../content/escortlivelevels.ts';
import { escortSetupOf } from './escortrun.ts';
import type { EscortResult } from './escorttypes.ts';
import { LIVE_MAX_BP, livePick, type LiveTier } from './live.ts';
import type { TdSetup } from './tdtypes.ts';

/** 没到港最多回 0.79 份：沉了就是输，不能比"勉强到港"更值 */
export const ESCORT_LIVE_ZERO_MAX_BP = 7_900;

/** 实盘这一场的开局：池里抽到的那一关（冻结副本）的护航开局；名单里没有就抛错（档位表和副本对不上是代码问题，单测锁住） */
export function escortLiveSetup(tier: LiveTier, seed: number): TdSetup {
  const id = livePick('escort', tier, seed).level;
  const level = ESCORT_LIVE_LEVELS.find((l) => l.id === id);
  if (!level) throw new Error(`护航实盘没有这一关：${id}`);
  return escortSetupOf(level, seed, { live: true });
}

/**
 * 结回倍数（万分之一）：到港按星数查表；没到港（沉船、误了潮）按走过的格数占比线性乘满值。
 * 不用守岛那条凹曲线：护航沉船、误潮多半在快到港的时候（9 关机器人平均走完 0.6–0.9），凹曲线下 0 星几乎都拿满值，分不出好坏。
 */
export function escortLiveBp(tier: LiveTier, seed: number, r: Pick<EscortResult, 'arrived' | 'stars' | 'cells' | 'total'>): number {
  const t = livePick('escort', tier, seed).bp;
  const stars = r.arrived ? Math.max(0, Math.min(3, Math.floor(r.stars))) : 0;
  if (stars > 0) return Math.min(LIVE_MAX_BP, t[stars]!);
  const total = Math.max(1, Math.floor(r.total));
  const done = Math.max(0, Math.min(total, Math.floor(r.cells)));
  return Math.min(LIVE_MAX_BP, ESCORT_LIVE_ZERO_MAX_BP, Math.floor((t[0] * done) / total));
}
