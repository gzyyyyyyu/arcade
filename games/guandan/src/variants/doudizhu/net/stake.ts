/**
 * 斗地主好友房实盘的"桌"（docs/stake.md 3、10 节）：开房选项、开局带入、座位换人、每副记账、一场结束结回、关房收场。纯函数，房间和浏览器共用。
 * 带入、结回、离开、再带入这些玩法无关的规矩在 src/net/stake-table.ts（和掼蛋同一份，见那里的说明）；这里只管斗地主的：
 * 3 个座位、结回额、一副打到一半的阶段（叫分、出牌）、每副按核心给的每家的分（零和）记账，一场 3 副（老房间 6 副）或任何一家到 ±一份结束。
 * 没有战绩小结（掼蛋才有）。真人不到 2 个整场不计输赢，和掼蛋一样。
 */
import type { SeatKind } from 'arcade-kit/protocol';
import { stream, type Entropy } from 'arcade-kit/rng';
import { stakeTableKit, type TableEffect, type TableView } from '../../../net/stake-table.ts';
import type { DdzResult } from '../core/index.ts';
import { CURRENT_RULES, RULES_V1, ROOM_DEALS, isTier, newRoomBook, payout, roomAddDeal, roomOver, roomRef, rulesOf, type RoomBook, type StakeRules, type TierId } from '../stake/index.ts';

export { ROOM_DEALS };

/** 开房选项里的档位：没带或 null 是娱乐；带了必须是认得的档位 */
export function parseStake(raw: unknown): TierId | null | undefined {
  if (raw === undefined || raw === null) return null;
  return isTier(raw) ? raw : undefined;
}

export type DdzStakeEffect = TableEffect;

export interface DdzStakeTable {
  tier: TierId;
  ref: string;
  /** 规则版本（stake/index.ts 的 StakeRules）：开房时定，一场里不变；老房间没有这个字段，按版本 1 打完 */
  rules?: number;
  book: RoomBook;
  /** 还没办完的事 */
  pending: DdzStakeEffect[];
  /** 这一场结束了（结回已经记下） */
  over: boolean;
  /** 每个座位：带入被拒的原因（钱包的错误码，或 need_two：开局真人不到 2 个） */
  why: (string | null)[];
  /** 每个座位：结回办完了 */
  out: boolean[];
  /** 每个座位现在是第几份（0：没带入过） */
  share: number[];
  /** 这一副打到一半点了"离开"、等这副结束再结回的座位 */
  leaving?: boolean[];
}

/** 公开的分和到账；rules 是这张桌的规则版本（画面按它写副数、每分），没有就是版本 1 */
export type DdzStakeView = TableView & { rules?: number };

/** 每个规则版本一份桌的实现：结回额的每分不同（带入、结回、换人的规矩是一样的） */
const kitOf = (r: StakeRules) => stakeTableKit({ seats: 3, payout: (tier, points) => payout(tier, points, r), midDeal: (phase) => phase === 'bid' || phase === 'show' || phase === 'play' });
const KITS = new Map<number, ReturnType<typeof kitOf>>([RULES_V1, CURRENT_RULES].map((r) => [r.v, kitOf(r)] as const));
/** 这张桌的规则；不认识的版本当现行的（不会出现：开房只写现行版本） */
export const tableRules = (t: { rules?: number }): StakeRules => rulesOf(t.rules) ?? CURRENT_RULES;
const kitFor = (t: { rules?: number }) => KITS.get(tableRules(t).v)!;

/** 这一场的 ref：从牌局密钥另分一条流取 64 位（和发牌的流互不相干，看到 ref 也推不出牌） */
export function stakeRef(key: Entropy): string {
  const r = stream(key, 'stake-ref');
  return roomRef([r.u32(), r.u32()].map((x) => x.toString(16).padStart(8, '0')).join(''));
}

export const shareRef = (t: DdzStakeTable, seat: number): string => kitFor(t).shareRef(t, seat);

export function stakeBegin(key: Entropy, tier: TierId, seats: readonly SeatKind[]): DdzStakeTable {
  const t: DdzStakeTable = { tier, ref: stakeRef(key), rules: CURRENT_RULES.v, book: newRoomBook(tier), pending: [], over: false, why: [null, null, null], out: [false, false, false], share: [0, 0, 0] };
  const humans = [0, 1, 2].filter((i) => seats[i] === 'human');
  const kit = kitFor(t);
  if (humans.length < 2) return kit.needTwo(t, humans);
  return humans.reduce((a, i) => kit.addIn(a, i), t);
}

/** 座位换人（规矩见 stake-table.ts）；phase 是牌局现在的阶段 */
export const stakeSeated = (t: DdzStakeTable, seat: number, kind: 'human' | 'ai', phase?: string): DdzStakeTable => kitFor(t).seated(t, seat, kind, phase);
export const canRebuy = (t: DdzStakeTable, seat: number): boolean => kitFor(t).canRebuy(t, seat);
export const stakeRebuy = (t: DdzStakeTable, seat: number): DdzStakeTable => kitFor(t).rebuy(t, seat);

/** 一副结束：记账；一场结束就记下每个到账座位的结回。dealNo 是这一副的序号（核心的 dealNo），phase 是记完以后牌局的阶段 */
export function stakeDeal(t: DdzStakeTable, r: DdzResult, dealNo: number, phase: string): DdzStakeTable {
  if (t.over || dealNo !== t.book.deals + 1) return t;
  const rules = tableRules(t);
  const kit = kitFor(t);
  const next = kit.leaveDone<DdzStakeTable>({ ...t, book: roomAddDeal(t.book, r, dealNo, rules) });
  return roomOver(next.book, phase, rules) ? kit.finish(next) : next;
}

/** 这一场就地结束（打完，或者关房）：每个到账的座位按目前的分结回 */
export const stakeFinish = (t: DdzStakeTable): DdzStakeTable => kitFor(t).finish(t);
export const stakeSettled = (t: DdzStakeTable, id: string, result: unknown): DdzStakeTable => kitFor(t).settled(t, id, result);
export const stakeView = (t: DdzStakeTable, seat: number): DdzStakeView => ({ ...kitFor(t).view(t, seat), ...(t.rules ? { rules: t.rules } : {}) });
