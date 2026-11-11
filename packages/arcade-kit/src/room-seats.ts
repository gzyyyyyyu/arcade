/**
 * 房间里座位和身份的纯函数（从 room.ts 拆出）：座位的三种初始形态、开房参数的校验、随机排座、"还谁的名额"、"出完还是不是同一组"。
 * 单独放是因为它们不碰 this、存储和连接，输入什么返回什么，好单独测，也让 room.ts 只剩要和 DO 状态打交道的部分。
 */
import type { Identity } from './internal.js';
import { ROOM_CODE_RE } from './protocol.js';

export interface SeatState {
  kind: 'empty' | 'human' | 'ai';
  userId: string | null;
  name: string | null;
  /** 掉线时刻；在线为 null */
  awaySince: number | null;
  /** 掉线超过宽限，电脑在代打 */
  auto: boolean;
  /** 这个座位最后一次做成的操作的 moveId（重发去重） */
  lastMoveId: string | null;
  /**
   * 最近做成的几个 moveId，新的在后（0.11.1，最多 RECENT_MOVES 个；旧房间的状态里没有，读到时当空的）。
   * 只记最后一个不够：连发 A、B，A 的 ack 丢了，重连后补发 A，lastMoveId 已经是 B，不轮流的操作（free）就会被做第二遍
   */
  recentMoves?: string[];
}

/**
 * 出完这一步还是不是同一组。不管给没给组标识，都要"出手的人离开名单、没有新座位加入"：
 * 这样一组里每个人最多出一次（或被代出一次），期限不会停在过去（游戏每次都给同一个 group 时，每一手照样是新的一手）。
 * 给了组标识（任何一边）：再要求两边标识一样（别的人跟着离开也行）。
 * 没给就推断：组里不止一个人，出手的那个离开、其他人原样留着（不多不少）；一手一个人时永远不是（和 0.1.0 一样）。
 */
export function sameGroup(
  before: { seats: number[]; group: string | null },
  seat: number,
  after: { seats: number[]; group: string | null },
): boolean {
  const b = before.seats;
  const a = after.seats;
  const shrank = a.every((x) => x !== seat && b.includes(x));
  if (before.group !== null || after.group !== null) return shrank && before.group !== null && before.group === after.group;
  return shrank && b.length > 1 && a.length === b.length - 1;
}

export function validHost(code: string, host: Identity): boolean {
  return ROOM_CODE_RE.test(code) && !!host && typeof host.userId === 'string' && !!host.userId && typeof host.name === 'string';
}

/** 打完、关房时要还谁的名额：匹配桌是排进来的每个人，好友房是房主 */
export function releaseOf(st: { host: string; code: string; match?: { users: string[] } }): { users: string[]; code: string } {
  return { users: st.match ? [...st.match.users] : [st.host], code: st.code };
}

/** 匹配桌的人：1 到 count 个、userId 不重复、各自像个身份 */
export function validPlayers(code: string, players: unknown, count: number): players is Identity[] {
  if (!Array.isArray(players) || players.length < 1 || players.length > count) return false;
  if (!players.every((p: Identity) => validHost(code, p))) return false;
  return new Set(players.map((p: Identity) => p.userId)).size === players.length;
}

export function validSeats(order: unknown, n: number, count: number): order is number[] {
  return Array.isArray(order) && order.length === n && new Set(order).size === n && order.every((x) => Number.isInteger(x) && x >= 0 && x < count);
}

/** 从 0..count-1 里随机挑 n 个座位（crypto；房间里的随机，不是规则核心） */
export function randomSeats(n: number, count: number): number[] {
  const all = Array.from({ length: count }, (_, i) => i);
  const r = crypto.getRandomValues(new Uint32Array(count));
  for (let i = count - 1; i > 0; i--) {
    const j = r[i]! % (i + 1);
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  return all.slice(0, n);
}

export function emptySeat(): SeatState {
  return { kind: 'empty', userId: null, name: null, awaySince: null, auto: false, lastMoveId: null };
}

export function aiSeat(): SeatState {
  return { kind: 'ai', userId: null, name: null, awaySince: null, auto: false, lastMoveId: null };
}

export function humanSeat(userId: string, name: string, awaySince: number | null): SeatState {
  return { kind: 'human', userId, name, awaySince, auto: false, lastMoveId: null };
}
