/**
 * 实盘的规则核心（docs/stake.md 第 1 节）：档位、每副的分、封顶、结回额、钱包 ref / op 的拼法、单机一场和好友房每个座位的账。
 * 和 src/core 一样是纯函数：不碰 DOM、网络、时间、随机数（ref 里的随机数由调用方给）。Worker、页面、房间都从这里取数，
 * 不各算一份。
 */
import { TIERS, type Paid, type RoomBook, type TierId } from '../../../core/stake.ts';
import { teamOf, type DealResult, type Phase, type Team } from '../core/index.ts';

// 档位、钱包 id 格式、单机有效期、op 的拼法是玩法无关的，放在通用层；这里原样再导出，掼蛋这边的 import 不变
export { SOLO_HOURS, TIERS, TIER_IDS, WALLET_ID, isTier, seatOp, setPaid, soloOp, type Paid, type RoomBook, type SeatBook, type TierId } from '../../../core/stake.ts';

/**
 * 每分 = 一份的 1/25，一场两头都封顶 25 分（= 一份）。一场从 8 副缩成 3 副，每分按比例调大；
 * 25 是 CI 模拟（tools/stake-sim.ts --pps）定的，理由：每小时期望和别的游戏对齐（docs/stake.md 1.2），只改这一处
 */
export const POINTS_PER_SHARE = 25;
/** 一场打几副：单机、好友房都是 3 副（实盘一场要 3–8 分钟、能利用碎片时间；按副数固定而不按打到几级，时长才可预期） */
export const SOLO_DEALS = 3;
export const ROOM_DEALS = 3;

/**
 * 一场用哪一套数。状态 / 存档里记 `rules`（2 = 现在这一套）；没有这个字段的是 3 副之前开的一场，
 * 按原来的数打完、结回（单机 8 副、好友房 5 副、每分 = 一份的 1/20、封顶 ±20 分）。以后再改数就加新版本，别改这两套
 */
export interface StakeRules {
  id: 1 | 2;
  /** 每分 = 一份的 1/pps，同时是一场两头封顶的分数 */
  pps: number;
  soloDeals: number;
  roomDeals: number;
}
export const RULES_V1: StakeRules = { id: 1, pps: 20, soloDeals: 8, roomDeals: 5 };
export const RULES_V2: StakeRules = { id: 2, pps: POINTS_PER_SHARE, soloDeals: SOLO_DEALS, roomDeals: ROOM_DEALS };
/** 新开的一场用这一套 */
export const CURRENT_RULES = RULES_V2;
/** 读到的 `rules` 字段（存档、房间状态、结回请求里的）对应哪一套：没有或不认识的按旧的 */
export function rulesOf(id: unknown): StakeRules {
  return id === 2 ? RULES_V2 : RULES_V1;
}
/** 好友房：房间寿命 8 小时 + 关房收尾 1 小时 + 余量 */
export const ROOM_HOURS = 10;

/** 每分多少筹码（各档都整除） */
export function pointValue(tier: TierId, rules: StakeRules = CURRENT_RULES): number {
  return TIERS[tier] / rules.pps;
}

/** 一副结束时 team 这一队得几分：头游那一队搭档第 2 名 3 分、第 3 名 2 分、末游 1 分，另一队扣同样的分 */
export function dealPoints(r: DealResult, team: Team): number {
  const head = r.order[0]!;
  const matePlace = r.order.indexOf((head + 2) % 4);
  const pts = matePlace === 1 ? 3 : matePlace === 2 ? 2 : 1;
  return teamOf(head) === team ? pts : -pts;
}

export function capPoints(p: number, rules: StakeRules = CURRENT_RULES): number {
  return Math.max(-rules.pps, Math.min(rules.pps, p));
}

/** 结回额：带进去的一份加上输赢，在 0 到 2 份之间 */
export function payout(tier: TierId, points: number, rules: StakeRules = CURRENT_RULES): number {
  return TIERS[tier] + capPoints(points, rules) * pointValue(tier, rules);
}

// ───────────── 钱包的 ref 和 op（平台 5.9：8–64 位的 [A-Za-z0-9_-]） ─────────────

/**
 * 单机 ref：`solo-<档位>-<32 位十六进制>`（0.12.2 起把档位编进去）。ref 由 Worker 生成，结回时按 ref 里的档位算结回额，
 * 不信页面带来的档位——否则小档带入、报豪华档结回会按豪华档算（安全审计 2026-10-16，低危：钱包另有"不超过带入 + 20 份"兜着）。
 * 0.12.1 以前的旧格式 `solo-<32 位十六进制>` 照旧认（没有档位，按页面带的算），带入最多 24 小时就过期，之后不会再有
 */
const SOLO_REF = /^solo-(?:(small|mid|big|lux)-)?[0-9a-f]{32}$/;
const ROOM_REF = /^gd-[0-9a-f]{16}$/;

export function isSoloRef(x: unknown): x is string {
  return typeof x === 'string' && SOLO_REF.test(x);
}

/** 单机：hex 是 128 位随机数（32 位十六进制），带上这一份的档位 */
export function soloRef(tier: TierId, hex: string): string {
  const ref = `solo-${tier}-${hex}`;
  if (!SOLO_REF.test(ref)) throw new Error(`单机 ref 要档位加 32 位小写十六进制：${tier} ${hex}`);
  return ref;
}

/** 单机 ref 里的档位；旧格式（没编档位）和不是单机 ref 的回 null */
export function soloRefTier(ref: string): TierId | null {
  return (SOLO_REF.exec(ref)?.[1] as TierId | undefined) ?? null;
}

/** 好友房：hex 是从这一场的密钥流里取的 64 位（16 位十六进制） */
export function roomRef(hex: string): string {
  const ref = `gd-${hex}`;
  if (!ROOM_REF.test(ref)) throw new Error(`好友房 ref 要 16 位小写十六进制：${hex}`);
  return ref;
}

// ───────────── 单机一场（我是 0 号，我方 = 0 队） ─────────────

export interface SoloMatch {
  tier: TierId;
  /** 用哪一套数（StakeRules.id）；没有的是 3 副之前开的，按旧的 */
  rules?: number;
  /** 每副我方的分（按副的先后），不封顶；合计在 soloPoints 里封顶 */
  deals: number[];
}

/** 记一副。同一副（按 dealNo）只记一次：刷新、重放事件都不会重复加 */
export function soloAddDeal(m: SoloMatch, r: DealResult): SoloMatch {
  if (r.dealNo !== m.deals.length + 1 || soloOver(m)) return m;
  return { ...m, deals: [...m.deals, dealPoints(r, 0)] };
}

/** 这一场到目前的净分（封顶） */
export function soloPoints(m: SoloMatch): number {
  return capPoints(m.deals.reduce((a, b) => a + b, 0), rulesOf(m.rules));
}

/** 新开一场单机（用现在这一套数） */
export function newSoloMatch(tier: TierId): SoloMatch {
  return { tier, rules: CURRENT_RULES.id, deals: [] };
}

/** 一场结束了没有：打满副数、碰到封顶，或者有一队过 A（牌局本身结束） */
export function soloOver(m: SoloMatch, phase?: Phase): boolean {
  const r = rulesOf(m.rules);
  return m.deals.length >= r.soloDeals || Math.abs(soloPoints(m)) >= r.pps || phase === 'gameOver';
}

/** Worker 收到的结算是不是规则允许的数（防的是自己的代码写错，不防作弊：economy.md 定了不防） */
export function validSoloResult(points: unknown, deals: unknown, rulesId?: unknown): boolean {
  const rules = rulesOf(rulesId);
  return (
    Number.isSafeInteger(points) &&
    Number.isSafeInteger(deals) &&
    Math.abs(points as number) <= rules.pps &&
    (deals as number) >= 0 &&
    (deals as number) <= rules.soloDeals &&
    // 每副最多 ±3 分
    Math.abs(points as number) <= 3 * (deals as number)
  );
}

// ───────────── 好友房：每个座位一本账（3.2） ─────────────

/** 好友房的账多记一个用哪一套数；没有的是 3 副之前开的，按旧的 */
export type GdBook = RoomBook & { rules?: number };

export function newRoomBook(tier: TierId): GdBook {
  return { tier, rules: CURRENT_RULES.id, seats: [0, 1, 2, 3].map(() => ({ paid: 'no' as Paid, points: 0 })), deals: 0, house: 0 };
}

/**
 * 记一副：只记到到账的座位上，各自封顶；其余座位（电脑、还没到账、被拒）的分归庄家。
 * 同一副只记一次。
 */
export function roomAddDeal<B extends GdBook>(b: B, r: DealResult): B {
  if (r.dealNo !== b.deals + 1) return b;
  const rules = rulesOf(b.rules);
  let house = b.house;
  const seats = b.seats.map((s, seat) => {
    const d = dealPoints(r, teamOf(seat));
    if (s.paid !== 'yes') {
      house += d;
      return s;
    }
    const points = capPoints(s.points + d, rules);
    // 封顶后多出来的那部分也归庄家，账才对得上
    house += s.points + d - points;
    return { ...s, points };
  });
  return { ...b, seats, deals: b.deals + 1, house };
}

/** 一场结束了没有：打满副数、有一队过 A，或者所有到账的座位都碰到了封顶 */
export function roomOver(b: GdBook, phase?: Phase): boolean {
  const rules = rulesOf(b.rules);
  if (b.deals >= rules.roomDeals || phase === 'gameOver') return true;
  const paid = b.seats.filter((s) => s.paid === 'yes');
  return paid.length > 0 && paid.every((s) => Math.abs(s.points) >= rules.pps);
}
