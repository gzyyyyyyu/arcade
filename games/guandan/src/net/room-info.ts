/**
 * 房间信息（kit 的 RoomInfo）里和玩法有关的几个问题：房间是哪个玩法、用几个座位、是不是实盘。
 * 页面的联机会话基类（view/common/room-link.ts）在知道房间是哪个玩法之前就要问，所以放在这一层（hall.ts 同级，认得两个玩法），
 * 不让 common 直接引用任何玩法。
 */
import type { RoomInfo } from 'arcade-kit/protocol';
import { DDZ_SEATS } from '../variants/doudizhu/index.ts';
import { parseRoomOpts } from '../variants/guandan/net/stake.ts';

/** 房间是哪个玩法：开房选项里带 variant: 'ddz' 的是斗地主，没有是掼蛋（src/net/hall.ts 的约定） */
export type RoomVariant = 'guandan' | 'ddz';
export function roomVariant(room: RoomInfo | null): RoomVariant {
  return (room?.opts as { variant?: unknown } | undefined)?.variant === 'ddz' ? 'ddz' : 'guandan';
}
/** 这个房间用几个座位：RoomInfo.seats 永远按 kit 的最大座位数（4）给，斗地主只用前 3 个，后面的坐不进去（seat_closed） */
export function seatCountOf(room: RoomInfo): number {
  return roomVariant(room) === 'ddz' ? DDZ_SEATS : room.seats.length;
}
/** 实盘房间：开房选项里带了认得的档位（娱乐房间没有） */
export function isStakeRoom(room: RoomInfo): boolean {
  return !!parseRoomOpts(room.opts)?.stake;
}
/** 斗地主不洗牌房间（娱乐 0.33.0、实盘 0.39.0）：开房选项里带 noShuffle: true（hall.ts 校验） */
export function isNoShuffleRoom(room: RoomInfo | null): boolean {
  return roomVariant(room) === 'ddz' && (room?.opts as { noShuffle?: unknown } | undefined)?.noShuffle === true;
}
