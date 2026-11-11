/**
 * 手牌上的两类提示（纯函数，方便单测）：换三张换进来的牌、有缺先打缺的说明。
 */
import { kindOf, suitOf, type Suit, type Tile } from '../../../core/tiles/index.ts';
import { SUIT_NAME } from '../../text.ts';

/** 换进来的牌标记留几手：我打出第 3 张牌以后就不再标 */
export const SWAP_MARK_DISCARDS = 3;

/** 换进来的牌里现在还在我手里的；我已经打了 SWAP_MARK_DISCARDS 张以上就不再标 */
export function swappedInHand(swapIn: readonly Tile[] | null, hand: readonly Tile[], myDiscards: number): Tile[] {
  if (!swapIn || myDiscards >= SWAP_MARK_DISCARDS) return [];
  return swapIn.filter((t) => hand.includes(t));
}

/** 手里还有缺门的牌时，点别的牌给的说明；没定缺或缺门已经打完返回 null */
export function banNote(que: number, hand: readonly Tile[]): string | null {
  if (que < 0 || !hand.some((t) => suitOf(kindOf(t)) === que)) return null;
  return `先把缺的那门（${SUIT_NAME[que as Suit]}）打完才能打别的`;
}

/** 血流成河：这家已经胡过，手牌锁住，点别的牌给的说明 */
export const FLOW_LOCK_NOTE = '胡了手牌锁住，只能打刚摸的牌';
