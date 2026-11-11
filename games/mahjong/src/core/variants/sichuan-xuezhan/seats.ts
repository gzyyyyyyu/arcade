/** 座位相关：这一刻谁能出手、好友房接管座位和换人。 */
import type { SeatKind } from '../types.ts';
import type { XzState } from './types.ts';
import { emptyStats, isFlow } from './util.ts';

/** 这一刻谁能出手（声明窗口的名单见文件头） */
export function actorsOf(s: XzState): { seats: number[]; group: string } | null {
  const all = s.players.map((_, i) => i);
  switch (s.phase) {
    case 'swap':
      return { seats: all.filter((i) => !s.players[i]!.swapOut), group: `swap-${s.round}` };
    case 'que':
      return { seats: all.filter((i) => s.players[i]!.que < 0), group: `que-${s.round}` };
    case 'turn':
      return { seats: [s.turn], group: `turn-${s.round}` };
    case 'claim': {
      const c = s.claim!;
      return { seats: all.filter((i) => i !== c.from && (isFlow(s) || !s.players[i]!.won) && !c.bot[i]), group: `claim-${c.id}` };
    }
    default:
      return null;
  }
}

/** 好友房有人接管座位、带入到账：这个座位的筹码和"带进来的"重新记 */
export function restakeMut(s: XzState, seat: number, chips: number): void {
  // 从这一笔起这个座位的杠钱才算新人的（退税不追到他头上，见 since）
  s.since = (s.since ?? s.players.map(() => 0)).map((x, i) => (i === seat ? s.ledger.length : x));
  s.chips[seat] = chips;
  s.stake[seat] = chips;
  s.start[seat] = chips;
}

/** 好友房里座位换了人：只换"是谁"，统计从头算（离座的人已经带着他的小结结算走了） */
export function seatedMut(s: XzState, seat: number, kind: SeatKind): void {
  if (s.kinds[seat] === kind) return;
  s.kinds[seat] = kind;
  s.stats[seat] = { ...emptyStats(), rounds: s.phase === 'end' || s.phase === 'over' ? 0 : 1 };
}

