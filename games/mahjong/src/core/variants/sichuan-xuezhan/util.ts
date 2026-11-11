/** 血战的小工具：手牌整理、血战/血流的判断、听牌、统计、记账。被各步骤共用。 */
import { isComplete, waits } from '../../hand/index.ts';
import type { Payment } from '../../match/index.ts';
import { byTile, countsOf, kindOf, suitOf, type Tile } from '../../tiles/index.ts';
import { SHAPE, SUITED_KINDS, type SeatStats, type Win, type XzOpts, type XzPlayer, type XzState } from './types.ts';

// ---------- 小工具 ----------

export const sortHand = (p: XzPlayer): void => {
  p.hand.sort(byTile);
};
export const hasQue = (p: XzPlayer): boolean => p.que >= 0 && p.hand.some((t) => suitOf(kindOf(t)) === p.que);
export const countKind = (tiles: readonly Tile[], k: number): number => tiles.reduce((a, t) => a + (kindOf(t) === k ? 1 : 0), 0);
export const unfinished = (s: XzState): number[] => s.players.map((_, i) => i).filter((i) => !s.players[i]!.won);
/** 血战里只剩一家没胡：这一局结束（四人局三家胡了，三人局两家胡了；血流不下桌，不按这个结束） */
export const doneAll = (s: XzState): boolean => !isFlow(s) && s.winners >= s.players.length - 1;
/** 血流成河（旧存档没有这个字段，按血战） */
export const isFlow = (s: { opts: XzOpts }): boolean => !!s.opts.flow;
/** 这一局所有的胡（旧存档没有 wins，按 won 有无补） */
export const winsOf = (p: XzPlayer): Win[] => p.wins ?? (p.won ? [p.won] : []);
/** 自摸、杠钱向谁收：血战是还没胡的别家，血流没人下桌，是所有别家 */
export const payersOf = (s: XzState, seat: number): number[] => (isFlow(s) ? s.players.map((_, i) => i) : unfinished(s)).filter((i) => i !== seat);

/** 14 张能不能和（手里不能有缺门） */
export function canWin(p: XzPlayer, hand: Tile[]): boolean {
  if (p.que >= 0 && hand.some((t) => suitOf(kindOf(t)) === p.que)) return false;
  return isComplete(countsOf(hand), p.melds.length, SHAPE);
}

/**
 * 听哪些牌（手里有缺门就是没听）。四张都在自己手里和自己碰杠里的那种不算：摸不到、也没人打得出来，胡不了的叫不算叫（0.3.9）
 */
export function tenpaiKinds(p: XzPlayer): number[] {
  if (hasQue(p)) return [];
  const own = countsOf([...p.hand, ...p.melds.flatMap((m) => m.tiles)]);
  const allowed = SUITED_KINDS.filter((k) => suitOf(k) !== p.que && own[k]! < 4);
  return waits(countsOf(p.hand), p.melds.length, SHAPE, allowed);
}

export function emptyStats(): SeatStats {
  return { rounds: 0, wins: 0, zimo: 0, pao: 0, gangs: 0, maxFan: 0, best: 0, flags: [] };
}

export function flag(st: SeatStats, id: string): void {
  if (!st.flags.includes(id)) st.flags.push(id);
}

export function pay(s: XzState, pays: Payment[]): void {
  if (!pays.length) return;
  s.ledger.push(...pays);
  s.events.push({ e: 'pay', pays });
}

