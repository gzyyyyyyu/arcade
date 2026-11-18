/**
 * 推荐出牌开在哪些桌（"宁简勿难"，docs/balance.md 开头）：单机的娱乐新手档和实盘小档，默认开、"声"面板里能关。
 * 娱乐新手是给第一次打麻将的人一根拐杖；实盘小档推荐的是普通玩家的打法（src/ai/coach.ts），照着打最多接近配平量过的普通玩家，小档期望本来就在带内。
 * 不开的：中档往上（要靠自己）、每日挑战和擂台（有榜单，大家要比的是自己打）；好友房、匹配桌有别的真人，牌桌从不调这里，一律不开。
 */
import type { Level } from '../ai/venues.ts';
import type { StakesId } from './stakes.ts';

export function coachAllowed(save: { stakes: StakesId; level?: Level; daily?: string; ladder?: unknown }): boolean {
  if (save.daily || save.ladder) return false;
  return save.stakes === 'small' || (save.stakes === 'fun' && (save.level ?? 'easy') === 'easy');
}
