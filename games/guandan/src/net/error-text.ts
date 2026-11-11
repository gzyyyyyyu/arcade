/** 房间拒绝一步操作时的短码 → 大白话。掼蛋的在 variants/guandan/net/rules.ts（ERROR_TEXT），斗地主多出来的几条写在这里；两个玩法的页面共用 errorText。 */
import { ERROR_TEXT } from '../variants/guandan/net/rules.ts';

/** 斗地主房间自己的短码（其余和掼蛋共用 ERROR_TEXT：not_your_turn、wrong_phase、not_seated……） */
export const DDZ_ERROR_TEXT: Record<string, string> = {
  bad_bid: '叫分要比前面的高，或者不叫',
  not_bidding: '现在不是叫分的时候',
  too_small: '压不过上家',
  not_in_hand: '手里没有这些牌',
  not_deal_end: '这一副还没打完',
};

export function errorText(code: string): string {
  return DDZ_ERROR_TEXT[code] ?? ERROR_TEXT[code] ?? '这手牌出不了';
}
