/**
 * 把一关造成 dispatchDdz 能直接推进的出牌阶段状态：地主已定（座位 0）、底牌已并进手牌所以为空、叫分 1。
 * deals 设成 2：地主打完这一副落在 dealEnd，而不是 gameOver（画面接"过关"弹窗更顺）。
 */
import { type DdzState, DDZ_RULES } from '../core/game.ts';
import { sortDdz } from '../core/patterns.ts';
import type { DdzPuzzle } from './puzzles.ts';

/** 地主的座位：闯关里玩家永远是 0 号 */
const PUZZLE_LANDLORD = 0;

export function puzzleState(p: DdzPuzzle): DdzState {
  return {
    rules: DDZ_RULES,
    seed: `puzzle-${p.id}`,
    step: 0,
    opts: { deals: 2, dealCap: 0, cap: 0 },
    dealNo: 1,
    redeal: 0,
    phase: 'play',
    hands: p.hands.map((h) => sortDdz(h)),
    bottom: [],
    firstBidder: PUZZLE_LANDLORD,
    bids: [1, 0, 0],
    bid: 1,
    landlord: PUZZLE_LANDLORD,
    turn: PUZZLE_LANDLORD,
    trick: [],
    handsPlayed: [0, 0, 0],
    played: [],
    bombs: 0,
    scores: [0, 0, 0],
    results: [],
  };
}
