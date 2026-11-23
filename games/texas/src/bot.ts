/**
 * 规则和电脑之间的胶水：给某个座位算电脑的操作。单机的页面、房间的 ai()、测试和模拟都走这里，
 * 保证电脑只拿到视图，随机数按"第几手、第几步、哪个座位"分流（docs/rules.md 1.5、4.1）。
 */
import { decide } from './ai/decide.ts';
import { pushFoldAction } from './ai/pushfold.ts';
import { stream } from 'arcade-kit/rng';
import { RNG, type Action, type Table } from './core/table.ts';
import { view } from './core/view.ts';

export function aiAction(t: Table, seat: number): Action {
  const v = view(t, seat);
  const r = stream(t.seed, RNG.ai, aiIndex(t, seat));
  // 全下或弃牌的全下局有自己的一套（docs/features.md 13.10）
  return v.pf ? pushFoldAction(v, r) : decide(v, r);
}

/**
 * 电脑这一步用哪条随机流：第几手、这一手第几步、哪个座位（一手的操作记录远少于 2^17 条）。
 * 座位占 4 位：9 人桌 8 号座第 L 步和 0 号座第 L+1 步才不会撞流（docs/ai.md 4.8）
 */
export const aiIndex = (t: Table, seat: number): number => (t.handNo * 0x20000 + t.log.length) * 16 + seat;
