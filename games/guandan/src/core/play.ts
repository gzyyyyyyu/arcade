/** 一手牌的通用形状（牌馆通用层，docs/doudizhu.md 第 1 节）：出牌区的画法两个玩法共用它。 */
import type { Card } from './cards.ts';

/** 一手牌最少要有的：牌型名和这几张牌（各玩法在上面加自己的字段：掼蛋的 rank/value/extra，斗地主的 v/len） */
export interface PlayBase {
  type: string;
  cards: Card[];
}
