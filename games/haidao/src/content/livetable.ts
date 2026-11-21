/**
 * 四种实盘（悬赏出海 live、悬赏守岛 td、护航 escort、寻宝航线 map）的一张表（DESIGN 4.2、10.5、12.1、11.1）。
 * 每档一个关卡池：带入时按种子抽一关（core/live.ts 的 livePick），每关一张自己的结回倍数表，
 * 按 tools/live-sim.ts 两种机器人的结局逐关拟合到 docs/balance.md 第 2 节，同一档抽到哪关期望都差不多。
 * 关都来自冻结副本（悬赏出海 bountylevels.ts、悬赏守岛 tdlive.ts、护航 escortlivelevels.ts），娱乐的关随便调不影响这里；
 * 航线全服每天同一条，池里只有一项。**改这里或冻结副本就是改实盘数值**：重跑 `node tools/live-sim.ts --n 2000`，改前改后的数报主线。
 *
 * bp（万分之一）：[0 星满值, 1 星, 2 星, 3 星]。0 星怎么折算各玩法不同（core 里各自的 *Bp 函数），
 * 同关星越多越高、档越高三星不降、都不超过 3 份（tests/livetable.test.ts 锁住）。
 */
import type { LiveTier } from '../core/live.ts';
import type { TroopKind } from '../core/types.ts';

export type LiveKind = 'live' | 'td' | 'escort' | 'map';
export type Bp = readonly [number, number, number, number];

export interface LivePick {
  /** 关 id：悬赏出海是 BOUNTY_LEVELS 的 id，悬赏守岛是 TD_LIVE_ISLANDS 的键，护航是 ESCORT_LIVE_LEVELS 的 id，航线固定 'route' */
  level: string;
  bp: Bp;
}

export interface LiveRow {
  /** 选档页的"电脑多强"（1–4）；航线四档同一条，不显示，写 0 */
  power: number;
  pool: readonly LivePick[];
}

/** 一份多少筹码（docs/economy.md 第 2 节），四种实盘同一份 */
export const LIVE_STAKE: Readonly<Record<LiveTier, number>> = { small: 2_000, mid: 10_000, big: 50_000, lux: 200_000 };
export const TIER_NAME: Readonly<Record<LiveTier, string>> = { small: '小', mid: '中', big: '大', lux: '豪华' };

/** 悬赏出海雇的船队：每条船的兵种、研究等级；技能和旗舰能量按 hq 级主寨；每条船装 boatCap 人口 */
export interface BountyCrew {
  crew: readonly TroopKind[];
  level: number;
  hq: number;
  boatCap: number;
}

export const BOUNTY_CREW: Readonly<Record<LiveTier, BountyCrew>> = {
  small: { crew: ['brute', 'brute', 'gunner', 'bomber', 'sailor'], level: 2, hq: 4, boatCap: 9 },
  mid: { crew: ['brute', 'brute', 'gunner', 'bomber', 'sailor'], level: 3, hq: 4, boatCap: 10 },
  big: { crew: ['brute', 'brute', 'captain', 'gunner', 'gunner', 'bomber'], level: 4, hq: 6, boatCap: 12 },
  lux: { crew: ['brute', 'brute', 'gunner', 'gunner', 'gunner', 'bomber'], level: 4, hq: 6, boatCap: 12 },
};

export const LIVE_TABLE: Readonly<Record<LiveKind, Readonly<Record<LiveTier, LiveRow>>>> = {
  live: {
    small: { power: 1, pool: [{ level: 'c07', bp: [10_000, 10_800, 12_900, 14_300] }, { level: 'c06', bp: [10_000, 10_100, 10_500, 14_300] }, { level: 'c08', bp: [15_000, 12_700, 13_000, 14_300] }] },
    mid: { power: 2, pool: [{ level: 'c10', bp: [15_000, 9_900, 13_800, 14_300] }, { level: 'c08', bp: [15_000, 9_300, 11_500, 14_300] }, { level: 'c09', bp: [20_000, 10_400, 10_700, 14_300] }] },
    big: { power: 3, pool: [{ level: 'c14', bp: [15_000, 10_300, 10_600, 15_000] }, { level: 'c15', bp: [15_000, 7_700, 9_300, 15_000] }] },
    lux: { power: 4, pool: [{ level: 'c16', bp: [10_000, 8_000, 8_900, 20_000] }, { level: 'c14', bp: [5_000, 6_200, 9_800, 20_000] }] },
  },
  td: {
    small: { power: 1, pool: [{ level: 'small', bp: [5_000, 10_500, 12_500, 13_000] }, { level: 'small-b', bp: [3_000, 7_900, 9_800, 13_000] }] },
    mid: { power: 2, pool: [{ level: 'mid', bp: [6_000, 10_200, 10_600, 13_000] }, { level: 'mid-b', bp: [7_900, 9_600, 9_900, 13_000] }] },
    big: { power: 3, pool: [{ level: 'big', bp: [5_000, 8_500, 10_700, 15_000] }, { level: 'big-b', bp: [5_000, 8_200, 10_600, 15_000] }] },
    lux: { power: 4, pool: [{ level: 'lux', bp: [7_900, 8_300, 10_500, 16_000] }, { level: 'lux-b', bp: [7_000, 8_000, 11_100, 16_000] }] },
  },
  escort: {
    small: { power: 2, pool: [{ level: 'strait-normal', bp: [7_900, 11_900, 12_200, 12_500] }, { level: 'cape-easy', bp: [7_000, 10_300, 10_800, 12_500] }, { level: 'bays-easy', bp: [2_000, 5_000, 12_200, 12_500] }] },
    mid: { power: 2, pool: [{ level: 'strait-normal', bp: [7_900, 9_900, 11_500, 12_500] }, { level: 'cape-normal', bp: [7_900, 10_400, 10_600, 12_500] }, { level: 'bays-normal', bp: [7_900, 11_000, 11_300, 12_500] }] },
    big: { power: 3, pool: [{ level: 'bays-normal', bp: [7_900, 8_400, 8_700, 13_450] }, { level: 'bays-hard', bp: [7_900, 8_500, 8_800, 13_450] }, { level: 'cape-hard', bp: [6_000, 7_200, 7_800, 13_450] }] },
    lux: { power: 4, pool: [{ level: 'strait-hard', bp: [7_900, 18_800, 23_900, 24_300] }] },
  },
  map: {
    small: { power: 0, pool: [{ level: 'route', bp: [4_700, 11_000, 15_000, 15_500] }] },
    mid: { power: 0, pool: [{ level: 'route', bp: [7_700, 9_200, 12_700, 15_500] }] },
    big: { power: 0, pool: [{ level: 'route', bp: [2_600, 8_400, 11_650, 15_500] }] },
    lux: { power: 0, pool: [{ level: 'route', bp: [2_000, 8_000, 10_500, 15_500] }] },
  },
};

// ---------------------------------------------------------------- 悬赏连闯（DESIGN 4.6）

/** 连闯一座要拿到几星才算过 */
export const STREAK_PASS = 1;
/**
 * 悬赏连闯的倍数（万分之一）：带入一份，连打三座悬赏岛（每座从这一档的池里另抽），每座之间可以收手。
 * win[k-1]：过了 k 座时收手（或三座全过）结回多少；fail[k]：过了 k 座、在第 k+1 座没过（或中途离开）结回多少。
 * 按 tools/live-sim.ts --streak 用两种机器人"一路闯到底"的期望配到 docs/balance.md 第 2 节；同档过得越多越高、输了总比收手少（单测锁住）。
 * 不要求档越高三座全过越多：普通机器人几乎每座都过，全过的倍数就是"1 + 普通的目标"，中档的目标本来就比小档低。
 */
export const STREAK_LADDER: Readonly<Record<LiveTier, { win: readonly [number, number, number]; fail: readonly [number, number, number] }>> = {
  small: { win: [10_000, 12_000, 13_000], fail: [3_000, 6_000, 11_000] },
  mid: { win: [11_000, 11_500, 12_000], fail: [6_000, 10_000, 10_500] },
  big: { win: [9_500, 10_000, 10_500], fail: [6_000, 8_500, 9_000] },
  lux: { win: [8_000, 10_000, 10_400], fail: [4_000, 5_000, 9_000] },
};

// ---------------------------------------------------------------- 金银锭（DESIGN 4.5）

/** 1 锭换多少筹码（平台 WALLET.exchange，每人每游戏每天的额度由平台管，默认 2,000 = 20 锭） */
export const INGOT_CHIPS = 100;
/**
 * 金银锭只能自己挣、抢不走、买不到，数目直接从存档算（core/ingot.ts 的 ingotEarned），不在各处结算时另记：
 * 每座战役关、守岛战役关、护航关第一次拿满三星，每过一关训练营，每个成就，各给 1 锭；每完成一次每日悬赏给 3 锭。
 */
export const INGOT_EARN = { threeStar: 1, train: 1, badge: 1, daily: 3 } as const;

// ---------------------------------------------------------------- 筹码装饰（DESIGN 4.7）

/**
 * 用筹码买的收藏（纯外观，不加任何属性，只扣不返）：掉宝池里的三件岛上装饰和各兵种的金色皮肤，价格由 Worker 按这张表扣。
 * 掉宝照样会掉；买到的和掉到的一样进 profile.cosmetics。
 */
export const CHIP_SHOP: Readonly<Record<string, number>> = {
  'deco:flagpole': 3_000,
  'deco:chest': 3_000,
  'deco:statue': 5_000,
  ...Object.fromEntries(['sailor', 'gunner', 'brute', 'bomber', 'captain', 'medic', 'cannoneer', 'harpooner'].map((t) => [`skin:${t}:gold`, 8_000])),
};

