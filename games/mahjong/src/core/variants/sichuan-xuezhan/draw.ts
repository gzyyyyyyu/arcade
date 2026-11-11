/** 摸牌与轮转：牌墙摸完这一局结束，否则轮到下一个还没胡的人。 */
import { drawHead, drawTail, nextSeat, wallLeft } from '../../table/index.ts';
import { endRound } from './settle.ts';
import type { XzState } from './types.ts';
import { isFlow, sortHand } from './util.ts';

/** 摸牌：牌墙空了这一局结束 */
export function drawFor(s: XzState, seat: number, tail: boolean): void {
  const t = tail ? drawTail(s.wall) : drawHead(s.wall);
  if (t === null) return endRound(s, 'wall');
  const p = s.players[seat]!;
  p.hand.push(t);
  sortHand(p);
  p.draws++;
  s.turn = seat;
  s.drawn = t;
  s.canZimo = true;
  s.phase = 'turn';
  s.events.push({ e: 'draw', seat, tile: t, tail });
}

/** 轮到 from 之后下一个还没胡的人摸牌 */
export function advance(s: XzState, from: number): void {
  const next = nextSeat(from, s.players.length, (i) => isFlow(s) || !s.players[i]!.won);
  if (next === null || wallLeft(s.wall) <= 0) return endRound(s, 'wall');
  s.afterKan = null;
  drawFor(s, next, false);
}

