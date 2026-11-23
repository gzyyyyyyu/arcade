/** 掼蛋给玩家看的短文字：牌型名、级数。只做"翻译"，不算规则。座位名、名次在 common/labels.ts。 */
import { PLAY_TYPE_NAMES, isBomb, rankName, type Play } from '../../variants/guandan/core/index.ts';

/** 中央显示的牌型名：炸弹带张数，例如"炸弹×6"。 */
export function playLabel(p: Play): string {
  if (p.type === 'bomb') return `炸弹×${p.cards.length}`;
  if (p.type === 'triple') return '三张';
  return PLAY_TYPE_NAMES[p.type];
}

/** 出牌区上一手的字和要不要按炸弹的样子画（交给 table/trick.ts 的 TrickView） */
export const describePlay = (p: Play): { label: string; bomb: boolean } => ({ label: playLabel(p), bomb: isBomb(p) });

/** 一手牌的简短说明（选择逢人配解释时用），例如"顺子 到 7""三带二 8带5"。 */
export function playDetail(p: Play): string {
  const r = rankName(p.rank);
  switch (p.type) {
    case 'straight':
    case 'straightFlush':
      return `${playLabel(p)} 到${r}`;
    case 'tube':
      return `三连对 到${r}`;
    case 'plate':
      return `钢板 到${r}`;
    case 'fullHouse':
      return `三带二 ${r}带${rankName(p.extra)}`;
    case 'jokerBomb':
      return '天王炸';
    case 'bomb':
      return `炸弹 ${bombText(p)}`;
    default:
      return `${playLabel(p)} ${r}`;
  }
}

/** 炸弹几张几（结算"最大一炸"那行，前面已经说了是炸弹）："4 张 2"。张数和点数之间要有"张"，不然"×4 2"读成"×42" */
export function bombText(p: Play): string {
  return p.type === 'bomb' ? `${p.cards.length} 张 ${rankName(p.rank)}` : playDetail(p);
}

/** 级数显示：2..10、J、Q、K、A。 */
export function levelName(lv: number): string {
  return rankName(lv);
}

/** 赢下整局要做到的（0.25.0）：完整是"过 A"，短局是"打到 10"（终点按规则核心的 endLevelOf） */
export function goalWord(endLevel: number): string {
  return endLevel >= 14 ? '过 A' : `打到 ${levelName(endLevel)}`;
}
