/**
 * 快速匹配的排队（0.21.0）：kit 0.20.0 的 MatchQueue，每个档位一个实例（Durable Object，wrangler.jsonc 的 MATCH）。
 * 排队本身 0 行存储、一个闹钟；凑满一桌（四人档 4 个、三人两房档 3 个）或等满 15 秒（≥ 2 人）开一张匹配桌（还是 worker/room.ts 的 MahjongRoom），只剩自己的转单机。
 * 档位和开桌选项在 src/game/match.ts，test/match.test.ts 用 kit 的 matchConfigErrors 核对它们对得上房间的规则
 */
import { MatchQueue, type MatchEnv } from 'arcade-kit/match';
import { MATCH_TABLE, matchRoomOptions, tableSizeOf } from '../src/game/match.ts';

export class Queue extends MatchQueue<MatchEnv> {
  protected readonly seats = MATCH_TABLE;

  /** 三人两房档一桌 3 个真人，其余 4 个 */
  protected override tableSize(tier: string): number {
    return tableSizeOf(tier);
  }

  protected override roomOptions(tier: string): unknown {
    return matchRoomOptions(tier);
  }
}
