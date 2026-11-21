/**
 * 实盘（DESIGN.md 第 4 节）：档位、开局配置、结回倍数。Worker 只从这里取档位表和 liveReturn，不引规则核心（整个核心会被打进 Worker）。
 * 倍数曲线按模拟器结局配到 balance.md 4.4 的区间：每档一个天亮倍数和中途倒下的形状，角色、地图各有系数（DESIGN.md 4.2、4.2a）。
 */
import type { MapId } from './maps.ts';
import type { CharacterId } from './meta.ts';
import type { Danger } from './waves.ts';

/**
 * 实盘开没开（守夜）。第 7 步按模拟器每格 2,000 局把四档的天亮倍数配进 balance.md 的区间后打开（2026-10-17）。
 * 关掉时菜单不显示实盘，Worker 拒绝带入（直接调接口也带不进去）；结回、退回照常，免得万一有挂着的一份结不掉。
 * 夜探实盘另做（基准价值要先模拟），菜单上先写"很快开放"。
 */
export const LIVE_OPEN = true;

/**
 * 实盘暂不开放的守夜图：新图要先按 LIVE_MAP_BP 同一套方法拟合系数、偏离同档平均 ±0.15 份以内才开（DESIGN 8.1，主线 10-20）。
 * 菜单上这几张图在实盘里灰着；直接调带入也会退回雪原（main.ts startLive）。现在没有（鬼市 0.17.7 开放）。
 */
export const LIVE_MAP_CLOSED: readonly MapId[] = [];
export const liveMapOk = (m: MapId): boolean => !LIVE_MAP_CLOSED.includes(m);

export type LiveTier = 'small' | 'medium' | 'large' | 'luxe';
export const LIVE_TIER_IDS: readonly LiveTier[] = ['small', 'medium', 'large', 'luxe'];

/** 平台钱包的档位名（docs/economy.md：small / mid / big / lux）。夜巡自己叫 medium / large / luxe，带入时要换成钱包的名字，
 *  不换钱包回 bad_request（0.3.8 修：0.3.0 起中、大、豪华档一直带不进去，只有小档两边同名） */
export type WalletTier = 'small' | 'mid' | 'big' | 'lux';

/** 中途倒下的形状：点是 [秒, 占天亮倍数的万分比]，逐拍插值；第一个点之前为 0 */
export type LiveShape = readonly (readonly [number, number])[];

export interface LiveTierDef {
  id: LiveTier;
  wallet: WalletTier;
  name: string;
  /** 一份多少筹码（docs/economy.md 第 2 节） */
  stake: number;
  /** 固定映射的危险档（4.1）：只维护一套怪表 */
  danger: Danger;
  /** 小道士雪原撑到天亮结回几倍（万分比）；别的角色、地图乘系数（LIVE_CHAR_BP、LIVE_MAP_BP，或整套换成 LIVE_COMBO_BP）。按模拟器结局拟合（DESIGN 4.2） */
  dawnBp: number;
  /** 中途倒下按它折算 */
  shape: LiveShape;
  /** 打倒尸王比撑到天亮多结回多少（万分比），总数不超过 LIVE_MAX_BP；不跟系数缩放 */
  bossAdd: number;
}

/**
 * 形状：小档从 3:00 起平滑上升（第 12 轮全量拟合：中途回得少、天亮给得多，小白和普通才拉得开）；
 * 中档以上 0.17.0 按带技能的模拟拟合（技能让中途撑得更久，从 2:00 起回、天亮前回得多一些），豪华档中途回得更多。
 */
const SHAPE_SMALL: LiveShape = [[180, 0], [300, 560], [600, 2_200], [840, 2_880], [900, 10_000]];
const SHAPE_MID: LiveShape = [[120, 0], [300, 1_120], [600, 4_400], [840, 5_760], [900, 10_000]];
const SHAPE_LUXE: LiveShape = [[120, 0], [300, 1_932], [600, 7_590], [840, 9_936], [900, 10_000]];

// dawnBp：规则 68 危险档变难后，中、大、豪华档按小道士雪原同种子各 2,000 局重拟，普通线期望回到改前
export const LIVE_TIERS: Record<LiveTier, LiveTierDef> = {
  small: { id: 'small', wallet: 'small', name: '小', stake: 2_000, danger: 0, dawnBp: 11_800, shape: SHAPE_SMALL, bossAdd: 2_000 },
  medium: { id: 'medium', wallet: 'mid', name: '中', stake: 10_000, danger: 2, dawnBp: 14_100, shape: SHAPE_MID, bossAdd: 2_000 },
  large: { id: 'large', wallet: 'big', name: '大', stake: 50_000, danger: 3, dawnBp: 14_600, shape: SHAPE_MID, bossAdd: 2_000 },
  luxe: { id: 'luxe', wallet: 'lux', name: '豪华', stake: 200_000, danger: 4, dawnBp: 13_800, shape: SHAPE_LUXE, bossAdd: 2_000 },
};

export function isLiveTier(v: unknown): v is LiveTier {
  return typeof v === 'string' && (LIVE_TIER_IDS as readonly string[]).includes(v);
}

/** 一场最多赢 3 份（结回 ≤ 带入 × 3，economy.md 第 2 节）；倍数按万分之一传 */
export const LIVE_MAX_BP = 30_000;

/** 实盘能选的角色：娱乐里能选的都能（0.17.10 起新三人各档、各图、夜探都开；摆渡人 0.30.0 放出，同时进实盘） */
export const LIVE_CHAR_IDS: readonly CharacterId[] = ['xiaodao', 'fushi', 'jianxia', 'pang', 'gengfu', 'caiyao', 'zhijiang', 'baidu', 'huolang', 'yinyang'];
/** 这个角色能不能带进实盘（档位、地图、守夜 / 夜探都不再限；参数留着给界面） */
export function liveCharOk(_tier: LiveTier, character: CharacterId, _map: MapId = 'snow', _raid = false): boolean {
  return LIVE_CHAR_IDS.includes(character);
}

/**
 * 角色、地图系数（万分比，没写 = 10_000，DESIGN 4.2a）：选哪个角色、哪张图，同一档期望不该差出 0.15 份以上，差出去的乘一个系数，
 * 对局规则不动。按档写：难度随档位涨得快的角色、地图在各档要的补偿不一样。小道士、雪原是基准，不写。
 * 角色在雪原、地图用小道士分开拟，默认相乘；乘出来偏出带的组合写进 LIVE_COMBO_BP，整套替换乘积。
 */
export type LiveCoef<K extends string> = Partial<Record<K, Partial<Record<LiveTier, number>>>>;
export const LIVE_CHAR_BP: LiveCoef<CharacterId> = {
  fushi: { small: 10_500, medium: 10_000, large: 9_600, luxe: 8_700 },
  jianxia: { small: 9_900, medium: 9_500, large: 9_100, luxe: 8_400 },
  pang: { small: 9_400, medium: 8_400, large: 8_100, luxe: 7_800 },
  gengfu: { small: 9_800, medium: 9_400, large: 9_300, luxe: 9_800 },
  caiyao: { small: 9_500, medium: 9_700, luxe: 8_900 },
  zhijiang: { small: 10_500, medium: 10_100, large: 9_900, luxe: 8_100 },
  huolang: { small: 10_200, medium: 9_900, large: 10_200, luxe: 9_700 },
  yinyang: { small: 10_200, medium: 9_700, large: 9_700, luxe: 6_400 },
};
export const LIVE_MAP_BP: LiveCoef<MapId> = {
  bamboo: { small: 9_900, medium: 9_500, large: 9_200, luxe: 9_400 },
  icelake: { small: 9_600, medium: 9_600, large: 9_400, luxe: 11_600 },
  riverbank: { small: 11_700, medium: 10_400, large: 10_100, luxe: 11_200 },
  yizhuang: { small: 11_700, medium: 10_900, large: 10_500, luxe: 11_700 },
  temple: { small: 11_400, medium: 12_400, large: 13_000, luxe: 14_400 },
  guishi: { small: 11_600, medium: 11_200, large: 10_700, luxe: 12_200 },
  // 0.32.0：小道士每格 2,000 局，普通线锚到雪原同档普通（DESIGN 4.2a）
  luanzang: { small: 12_100, medium: 10_100, large: 10_300, luxe: 11_700 },
};
/**
 * 组合系数：「角色 × 地图 × 档」整套系数，写了就替换 dawnBp × 角色系数 × 地图系数里的两个系数（尸王加成不缩放）。
 * 拟法：每格两条线（小白、普通）各 300 局起，压到两线期望 + 2SE 不超上限、普通线不低于下限 0.10 以上（DESIGN 4.2）。
 * 小道士 × 雪原也写：dawnBp 是按小道士拟的，带技能后各档又按同种子重拟过。
 */
export const LIVE_COMBO_BP: Partial<Record<CharacterId, Partial<Record<MapId, Partial<Record<LiveTier, number>>>>>> = {
  xiaodao: { snow: { small: 12_100, medium: 9_600, large: 8_800, luxe: 8_900 }, bamboo: { small: 11_800, medium: 9_600, large: 8_700 }, icelake: { small: 11_800, medium: 9_700, large: 8_900, luxe: 9_500 }, riverbank: { small: 13_200, large: 10_100, luxe: 9_400 }, yizhuang: { small: 12_300, luxe: 10_100 }, temple: { small: 13_100, medium: 10_400, large: 10_800, luxe: 11_100 }, guishi: { small: 12_700, luxe: 10_300 } },
  fushi: { snow: { small: 12_300, medium: 9_800, large: 9_100, luxe: 8_500 }, bamboo: { small: 12_200, luxe: 9_000 }, icelake: { small: 12_100, luxe: 9_400 }, riverbank: { small: 13_200 }, yizhuang: { small: 13_200, luxe: 8_800 }, temple: { small: 13_100, medium: 10_200, large: 10_400, luxe: 8_800 }, guishi: { small: 13_100, medium: 9_800, large: 9_400, luxe: 8_900 } },
  zhijiang: { snow: { small: 11_800, medium: 9_200, large: 8_400, luxe: 8_600 }, bamboo: { small: 11_800, medium: 9_400, large: 8_200, luxe: 8_600 }, icelake: { small: 11_800, medium: 9_200, large: 8_400, luxe: 8_400 }, riverbank: { small: 12_600, medium: 9_300, large: 10_300, luxe: 10_800 }, yizhuang: { medium: 9_400, large: 8_800 }, temple: { medium: 10_500, large: 9_600, luxe: 9_200 }, guishi: { medium: 9_400, large: 9_400 } },
  baidu: { snow: { small: 12_100 }, bamboo: { small: 12_000, large: 10_100, luxe: 11_000 }, icelake: { small: 11_800, luxe: 10_100 }, riverbank: { small: 13_100, large: 11_400, luxe: 12_400 }, yizhuang: { small: 12_900, large: 12_000 }, temple: { small: 13_100 }, guishi: { small: 13_000 } },
  jianxia: { snow: { small: 11_900, large: 8_600 }, bamboo: { small: 11_900, large: 8_500, luxe: 8_700 }, icelake: { small: 11_800, medium: 9_200, large: 8_800, luxe: 8_900 }, riverbank: { small: 12_700, luxe: 9_300 }, yizhuang: { small: 12_200, luxe: 8_900 }, temple: { small: 12_600, medium: 9_800, large: 9_600, luxe: 9_000 }, guishi: { small: 12_100, luxe: 9_400 } },
  pang: { snow: { small: 11_800, medium: 9_200, large: 8_600, luxe: 8_600 }, bamboo: { small: 11_800, medium: 9_200, large: 8_200, luxe: 8_100 }, icelake: { small: 11_900, medium: 9_200, large: 8_400, luxe: 8_400 }, riverbank: { small: 12_600, medium: 10_200, large: 9_300, luxe: 9_200 }, yizhuang: { small: 12_400, luxe: 8_800 }, temple: { small: 12_600, luxe: 9_400 }, guishi: { small: 12_500, large: 9_400 } },
  gengfu: { snow: { small: 11_900, medium: 9_900 }, bamboo: { small: 11_800, medium: 10_300, large: 9_600, luxe: 11_400 }, icelake: { small: 11_900, medium: 9_800, large: 9_900 }, riverbank: { small: 12_600, medium: 12_600, large: 11_100, luxe: 13_700 }, yizhuang: { small: 12_000 }, temple: { small: 13_100, luxe: 12_200 }, guishi: { small: 11_900, large: 11_900 } },
  caiyao: { snow: { small: 11_800, medium: 9_100, large: 8_600, luxe: 9_000 }, bamboo: { small: 11_800, large: 8_700, luxe: 9_000 }, icelake: { small: 11_900, medium: 9_300, large: 8_600, luxe: 9_200 }, riverbank: { small: 12_400, medium: 12_000, large: 10_600, luxe: 10_700 }, yizhuang: { small: 12_000, medium: 10_200, large: 9_700, luxe: 9_100 }, temple: { small: 12_000, medium: 12_100, large: 10_600, luxe: 11_200 }, guishi: { small: 11_900, medium: 10_500, large: 9_900, luxe: 10_000 } },
  huolang: { snow: { small: 11_800, medium: 9_100, large: 8_900, luxe: 8_400 }, bamboo: { small: 12_000, medium: 9_400, large: 8_600, luxe: 8_300 }, icelake: { small: 11_900, medium: 9_300, large: 8_800, luxe: 8_700 }, riverbank: { small: 12_800, medium: 10_200, large: 9_200, luxe: 8_600 }, yizhuang: { small: 11_900, medium: 9_500, large: 8_800, luxe: 8_800 }, temple: { small: 13_100, medium: 10_200, large: 9_200, luxe: 9_300 }, guishi: { small: 12_200, medium: 9_700, large: 9_100, luxe: 8_800 } },
  yinyang: { snow: { small: 11_800, medium: 9_500, large: 8_700, luxe: 9_000 }, bamboo: { small: 11_800, medium: 9_300, large: 8_600, luxe: 8_900 }, icelake: { small: 11_900, medium: 9_500, large: 8_900, luxe: 9_800 }, riverbank: { luxe: 10_800 }, yizhuang: { medium: 9_100, large: 8_500, luxe: 9_100 }, temple: { small: 13_100, medium: 11_500, large: 9_900, luxe: 9_800 }, guishi: { small: 13_100, medium: 9_500, large: 8_700, luxe: 9_800 } },
};

/** 实盘档 tier 的守夜撑了 ticks 拍（每秒 30 拍）、赢没赢、打没打倒尸王 → 结回倍数（万分比，整数）；角色、地图缺省 = 小道士、雪原 */
export function vigilBp(tier: LiveTier, ticks: number, won: boolean, bossKilled: boolean, character: CharacterId = 'xiaodao', map: MapId = 'snow'): number {
  const def = LIVE_TIERS[tier];
  const combo = LIVE_COMBO_BP[character]?.[map]?.[tier];
  const dawn = combo !== undefined
    ? Math.floor((def.dawnBp * combo) / 10_000)
    : Math.floor((Math.floor((def.dawnBp * (LIVE_CHAR_BP[character]?.[tier] ?? 10_000)) / 10_000) * (LIVE_MAP_BP[map]?.[tier] ?? 10_000)) / 10_000);
  if (bossKilled) return Math.min(LIVE_MAX_BP, dawn + def.bossAdd);
  if (won) return Math.min(LIVE_MAX_BP, dawn);
  return shapeBp(def.shape, ticks, dawn);
}

/** 中途倒下按形状逐拍插值：整数运算，浏览器和 Worker、各平台算出来一样；dawn 是这一格撑到天亮的倍数（万分比） */
export function shapeBp(shape: LiveShape, ticks: number, dawn: number): number {
  const t = Math.max(0, Math.floor(ticks));
  let share = shape[shape.length - 1]![1];
  for (let i = 1; i < shape.length; i++) {
    const [s1, b1] = shape[i]!;
    if (t >= s1 * 30) continue;
    const [s0, b0] = shape[i - 1]!;
    share = t <= s0 * 30 ? b0 : b0 + Math.floor(((b1 - b0) * (t - s0 * 30)) / ((s1 - s0) * 30));
    break;
  }
  return Math.min(LIVE_MAX_BP, Math.floor((share * dawn) / 10_000));
}

/** 危险档对应的实盘档（模拟器按它算期望；危险 1、5 没有实盘，返回 undefined） */
export function tierOfDanger(d: number): LiveTier | undefined {
  return LIVE_TIER_IDS.find((t) => LIVE_TIERS[t].danger === d);
}

/** 结回多少筹码：桌上那一份 × 倍数，向下取整（和开盘一样） */
export function liveReturn(stake: number, bp: number): number {
  return Math.floor((stake * Math.max(0, Math.min(LIVE_MAX_BP, Math.floor(bp)))) / 10_000);
}
