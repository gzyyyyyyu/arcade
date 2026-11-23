/**
 * 斗地主实盘的规则（docs/stake-ddz.md）：每分多少、每副和一场的封顶、一场几副、结回额、钱包 ref 的拼法、单机每档的电脑。
 * 档位表、钱包 id 格式、op 的拼法是通用的，在 src/core/stake.ts。和 src/core 一样是纯函数：不碰 DOM、网络、时间、随机数
 * （ref 里的随机数由调用方给）。
 * 一场的截断（每副 s 封顶、任何一家累计到 ±一份（pps 分）就结束、最后那副截 s 仍然零和）由规则核心做（DdzOptions.dealCap / cap），
 * 这里只给实盘用的选项，不再算一遍；单机里我的分就是核心状态里 scores[0]。
 * 一场的数按版本取（StakeRules）：新开的用现行版本，打到一半的老存档、老房间按它自己的版本（核心状态里的 opts 本来就是开局时定的）。
 */
import { TIERS, type Paid, type RoomBook, type TierId } from '../../../core/stake.ts';
import type { DdzLevel } from '../ai/index.ts';
import type { DdzOptions, DdzResult } from '../core/index.ts';

export { SOLO_HOURS, TIERS, TIER_IDS, WALLET_ID, isTier, seatOp, setPaid, soloOp, type Paid, type RoomBook, type TierId } from '../../../core/stake.ts';

/**
 * 一场的规则，按版本记（存档、好友房的桌里带 `rules` 字段，没有就是版本 1）：
 * 版本 1 是最早的 8 副 / 6 副、每分一份的 1/40；版本 2 把一场缩成 3 副（实盘一场要 3–6 分钟、能利用碎片时间，docs/stake-ddz.md 第 1 节），每分按比例放大。
 * 老的一场按老数打完：打到一半的存档、房间不换规则，结回额也按它自己的每分算。
 */
export interface StakeRules {
  v: number;
  /** 每分 = 一份的 1/pps（各档整除）；也是一场任何一家累计结束的分数线 */
  pps: number;
  /** 每副的分 s 封顶 */
  dealCap: number;
  soloDeals: number;
  roomDeals: number;
  /** 不洗牌发牌（核心的 noShuffle）：炸弹多、一副的分大，所以每分、每副封顶、电脑单配一套（版本 3） */
  noShuffle?: true;
}
export const RULES_V1: StakeRules = { v: 1, pps: 40, dealCap: 24, soloDeals: 8, roomDeals: 6 };
/** 现行规则。pps 要整除四档的一份（2,000 起，只有 10 / 16 / 20 / 25 这类数能整除），15 不行。50 / 24 是 CI 上 `tools/ddz-stake-sim.ts --pps P --cap C` 的模拟定的，理由：每小时期望和别的游戏对齐（docs/stake-ddz.md 第 2 节） */
export const RULES_V2: StakeRules = { v: 2, pps: 50, dealCap: 24, soloDeals: 3, roomDeals: 3 };
export const CURRENT_RULES = RULES_V2;
/**
 * 不洗牌实盘（和版本 2 并列，开一场时选发牌）：成团发牌炸弹多，照经典的每分 1/50、每副封顶 24 会有 13–23% 的场碰到一份封顶、
 * 小档普通玩家每场 +0.27 份。每副封顶放到 48（和娱乐的不洗牌一样）、每分 1/200（10 / 50 / 250 / 1,000），每小时期望和经典差不多（docs/stake-ddz.md 第 5 节）
 */
export const RULES_CLUMP: StakeRules = { v: 3, pps: 200, dealCap: 48, soloDeals: 3, roomDeals: 3, noShuffle: true };

/** 存档、桌里的规则版本字段 → 规则；没有这个字段是版本 1（老数）；不认识的版本回 null */
export function rulesOf(v: unknown): StakeRules | null {
  if (v === undefined || v === 1) return RULES_V1;
  return v === 2 ? RULES_V2 : v === 3 ? RULES_CLUMP : null;
}

/** 新开一场用哪套：经典发牌是现行版本，不洗牌是版本 3 */
export function newRules(noShuffle: boolean): StakeRules {
  return noShuffle ? RULES_CLUMP : CURRENT_RULES;
}

/** 现行规则的数（新开的一场用；老的一场用 rulesOf 取它自己的） */
export const POINTS_PER_SHARE = CURRENT_RULES.pps;
/** 一场打几副：单机、好友房现在都是 3 副 */
export const SOLO_DEALS = CURRENT_RULES.soloDeals;
export const ROOM_DEALS = CURRENT_RULES.roomDeals;

/** 每分多少筹码 */
export function pointValue(tier: TierId, rules: StakeRules = CURRENT_RULES): number {
  return TIERS[tier] / rules.pps;
}

/** 实盘用的规则核心选项：一场任何一家累计到 ±一份就结束 */
export function stakeOptions(deals: number, rules: StakeRules = CURRENT_RULES): DdzOptions {
  return { deals, dealCap: rules.dealCap, cap: rules.pps, ...(rules.noShuffle ? { noShuffle: true } : {}) };
}

/**
 * 结回额：带进去的一份加上输赢。不再截断：核心已经保证一家的累计在 ±pps 分内，Worker 另用 validSoloResult 查一遍，
 * 所以在 0 到 2 份之间
 */
export function payout(tier: TierId, points: number, rules: StakeRules = CURRENT_RULES): number {
  return TIERS[tier] + points * pointValue(tier, rules);
}

// ───────────── 钱包的 ref（平台 5.9：8–64 位的 [A-Za-z0-9_-]；op 的拼法在通用层） ─────────────

/**
 * 单机 ref：`solo-ddz-<档位>-<32 位十六进制>`。带 ddz 标记，和掼蛋的 `solo-<档位>-<hex>` 区分得开（互不匹配），
 * 结回时按 ref 里的档位算结回额，不信页面带来的档位。最长 15 + 32 = 47 位，拼上 `-refund` 不过 64 位
 */
const SOLO_REF = /^solo-ddz-(small|mid|big|lux)-[0-9a-f]{32}$/;

export function isSoloRef(x: unknown): x is string {
  return typeof x === 'string' && SOLO_REF.test(x);
}

/** hex 是 128 位随机数（32 位十六进制） */
export function soloRef(tier: TierId, hex: string): string {
  const ref = `solo-ddz-${tier}-${hex}`;
  if (!SOLO_REF.test(ref)) throw new Error(`斗地主单机 ref 要档位加 32 位小写十六进制：${tier} ${hex}`);
  return ref;
}

/** ref 里的档位；不是斗地主单机 ref 回 null */
export function soloRefTier(ref: string): TierId | null {
  const m = /^solo-ddz-(small|mid|big|lux)-/.exec(ref);
  return m && SOLO_REF.test(ref) ? (m[1] as TierId) : null;
}

// ───────────── 单机一场（我是 0 号，1、2 号是电脑，电脑不碰钱包） ─────────────

/** 我的分：就是我的累计（零和，另两家的和是它的相反数） */
export function soloPoints(scores: readonly number[]): number {
  return scores[0] ?? 0;
}

/** Worker 收到的结算是不是规则允许的数（防的是自己的代码写错，不防作弊：economy.md 定了不防） */
export function validSoloResult(points: unknown, deals: unknown, rules: StakeRules = CURRENT_RULES): boolean {
  return (
    Number.isSafeInteger(points) &&
    Number.isSafeInteger(deals) &&
    Math.abs(points as number) <= rules.pps &&
    (deals as number) >= 0 &&
    (deals as number) <= rules.soloDeals &&
    // 每副我最多动 2s（地主）
    Math.abs(points as number) <= 2 * rules.dealCap * (deals as number)
  );
}

/**
 * 单机实盘每档的电脑（座位 1、2；docs/stake-ddz.md 第 3 节，数字由 tools/ddz-stake-sim.ts 量）：越往上越难。
 * 我不是地主时，坐我这边的电脑农民是我的队友，所以两个座位强弱不一定要一样：大档"新手 + 高手"（一强一弱）比豪华档"普通 + 普通"好打。
 * 普通玩家每场（份）：小档 +0.29（小白 +0.14）、中档 +0.20、大档 +0.03、豪华 0.00，落在 docs/balance.md 第 2 节普通那一列。
 * 两个高手（−0.12）、普通 + 高手（−0.08）对普通玩家都太难，不用。数字见 10.3，以最近一次模拟为准
 */
export const DDZ_SOLO_BOTS: Readonly<Record<TierId, readonly [DdzLevel, DdzLevel]>> = {
  small: ['novice', 'novice'],
  mid: ['novice', 'normal'],
  big: ['novice', 'pro'],
  lux: ['normal', 'normal'],
};

/**
 * 不洗牌实盘每档的电脑（10.5）：小、中、大和经典一样；豪华的"普通 + 普通"在不洗牌下普通玩家 +0.043 份、比大档还好打，换"普通 + 高手"
 * （"高手 + 高手"反而好打一点：+0.014，和经典同一个道理，两个高手抢着压）
 */
export const DDZ_SOLO_BOTS_CLUMP: Readonly<Record<TierId, readonly [DdzLevel, DdzLevel]>> = {
  ...DDZ_SOLO_BOTS,
  lux: ['normal', 'pro'],
};

/** 这一场每档的电脑（按规则取：不洗牌单配一套） */
export function soloBots(tier: TierId, rules: StakeRules = CURRENT_RULES): readonly [DdzLevel, DdzLevel] {
  return (rules.noShuffle ? DDZ_SOLO_BOTS_CLUMP : DDZ_SOLO_BOTS)[tier];
}

// ───────────── 好友房：每个座位一本账（docs/stake.md 3.2、10.4；3 个座位） ─────────────

const ROOM_REF = /^ddz-[0-9a-f]{16}$/;

/** 好友房 ref：`ddz-<16 位十六进制>`（从这一场的密钥流取 64 位）。和掼蛋的 `gd-…`、斗地主单机的 `solo-ddz-…` 互相区分得开 */
export function roomRef(hex: string): string {
  const ref = `ddz-${hex}`;
  if (!ROOM_REF.test(ref)) throw new Error(`斗地主好友房 ref 要 16 位小写十六进制：${hex}`);
  return ref;
}

const DDZ_ROOM_SEATS = 3;

export function newRoomBook(tier: TierId): RoomBook {
  return { tier, seats: Array.from({ length: DDZ_ROOM_SEATS }, () => ({ paid: 'no' as Paid, points: 0 })), deals: 0, house: 0 };
}

/** 一家的分封顶：一场任何一家到 ±pps 核心就结束；这里再夹一道，是因为走了又回来的新一份从 0 记，不等于核心里的累计 */
const clampPoints = (p: number, rules: StakeRules): number => Math.max(-rules.pps, Math.min(rules.pps, p));

/**
 * 记一副（用核心给的每家的分 delta，零和）：只记到到账的座位上，各自封顶；其余座位（电脑、还没到账、被拒、离开了）的分归庄家，
 * 封顶多出来的也归庄家。同一副只记一次。
 */
export function roomAddDeal(b: RoomBook, r: DdzResult, dealNo: number, rules: StakeRules = CURRENT_RULES): RoomBook {
  if (dealNo !== b.deals + 1) return b;
  let house = b.house;
  const seats = b.seats.map((s, seat) => {
    const d = r.delta[seat] ?? 0;
    if (s.paid !== 'yes') {
      house += d;
      return s;
    }
    const points = clampPoints(s.points + d, rules);
    house += s.points + d - points;
    return { ...s, points };
  });
  return { ...b, seats, deals: b.deals + 1, house };
}

/** 一场结束了没有：打满副数，或者牌局本身结束（任何一家到 ±pps，核心就把牌局收了） */
export function roomOver(b: RoomBook, phase?: string, rules: StakeRules = CURRENT_RULES): boolean {
  return b.deals >= rules.roomDeals || phase === 'gameOver';
}

/** 好友房：房间寿命 8 小时 + 关房收尾 1 小时 + 余量（和掼蛋同一个数） */
export const ROOM_HOURS = 10;
