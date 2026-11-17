/**
 * 实盘（DESIGN.md 第 4 节）：档位、开局配置、结回倍数。Worker 只从这里取档位表和 liveReturn，不引规则核心（整个核心会被打进 Worker）。
 * 倍数曲线按模拟器结局配到 balance.md 4.4 的区间（0.4.7 全量重拟）：形状四档共用，天亮倍数每档一个（DESIGN.md 4.2）。
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

export interface LiveTierDef {
  id: LiveTier;
  wallet: WalletTier;
  name: string;
  /** 一份多少筹码（docs/economy.md 第 2 节） */
  stake: number;
  /** 固定映射的危险档（4.1）：只维护一套怪表 */
  danger: Danger;
  /** 撑到天亮结回几倍（万分比）；中途倒下按 VIGIL_SHAPE 折算，打倒尸王再加 VIGIL_BOSS_ADD_BP。按模拟器结局拟合（DESIGN 4.2） */
  dawnBp: number;
}

export const LIVE_TIERS: Record<LiveTier, LiveTierDef> = {
  small: { id: 'small', wallet: 'small', name: '小', stake: 2_000, danger: 0, dawnBp: 13_500 },
  medium: { id: 'medium', wallet: 'mid', name: '中', stake: 10_000, danger: 2, dawnBp: 16_900 },
  large: { id: 'large', wallet: 'big', name: '大', stake: 50_000, danger: 3, dawnBp: 17_600 },
  luxe: { id: 'luxe', wallet: 'lux', name: '豪华', stake: 200_000, danger: 4, dawnBp: 19_200 },
};

export function isLiveTier(v: unknown): v is LiveTier {
  return typeof v === 'string' && (LIVE_TIER_IDS as readonly string[]).includes(v);
}

/** 一场最多赢 3 份（结回 ≤ 带入 × 3，economy.md 第 2 节）；倍数按万分之一传 */
export const LIVE_MAX_BP = 30_000;

/**
 * 守夜的结回倍数（4.2）：中途倒下按撑到的秒数逐拍插值，点是 [秒, 占天亮倍数的万分比]；3:00 以前为 0。
 * 曲线从 3:00 起平滑上升，没有"4 分 01 秒才有钱"的断崖。四档形状相同，只按 dawnBp 缩放：配平时每档只调一个数。
 * 第 12 轮全量（每格 2,000 局）拟合：中途回得少、天亮给得多，小白（早死）和普通（多半撑到天亮）才拉得开，
 * 原来的形状（10 分钟回 55%）下四档小白都压不进 balance.md 的区间。
 */
export const VIGIL_SHAPE: readonly (readonly [number, number])[] = [
  [180, 0],
  [300, 560],
  [600, 2_200],
  [840, 2_880],
  [900, 10_000],
];
/** 打倒尸王比撑到天亮多结回多少（万分比），总数不超过 LIVE_MAX_BP */
export const VIGIL_BOSS_ADD_BP = 2_000;

/**
 * 实盘可以选已解锁的角色和地图（0.3.6，DESIGN.md 4.1、4.2）。各角色、各地图的实盘期望若比同档最高、最低差出 0.15 份以上，
 * 就在这里给一个单独的系数（万分比，乘在这一档的 dawnBp 上，没写 = 10_000 = 不调）；不改角色、地图本身的数值，不改对局规则。
 * 难度随档位涨得快的角色、地图（比如义庄）在各档需要的补偿不一样，所以系数按档写。
 * 角色和地图分开扫、各自对着小道士、雪原拟合，两个系数默认相乘；乘出来偏离同档平均 ±0.15 份以上的组合（胖师叔、采药女在义庄等，
 * 角色和地图的强弱不是各管各的）单独写在 LIVE_COMBO_BP，整套系数直接替换乘积。夜探的角色系数在 explore.ts 的 RAID_LIVE.charBp。
 */
export type LiveCoef<K extends string> = Partial<Record<K, Partial<Record<LiveTier, number>>>>;
/**
 * 实盘技能开放的「档位 × 地图」（规则版本 39，主线 11-02）：只在量过的格子里放技能，其余格子的实盘局和线上原样一致——
 * 技能键无效、HUD 不出技能钮、角色系数和倍数不变。核对法：普通机器人开技能跑这一格，期望 + 2SE 不超过 balance.md 4.4 的普通带上限，
 * 小白同理（只卡多发筹码的一侧，DESIGN 4.2）。表外的格子、夜探实盘一律不放技能。规则核心查它（World.liveNoSkill）。
 */
export const LIVE_SKILL_OPEN: Record<LiveTier, readonly MapId[]> = {
  small: ['snow', 'bamboo', 'icelake', 'riverbank', 'yizhuang', 'temple', 'guishi'],
  medium: ['snow', 'bamboo', 'icelake', 'riverbank', 'yizhuang', 'temple', 'guishi'],
  large: ['snow', 'bamboo', 'icelake', 'riverbank', 'yizhuang', 'temple', 'guishi'],
  luxe: ['snow', 'bamboo', 'icelake', 'riverbank', 'yizhuang', 'temple', 'guishi'],
};
/** 规则版本 39（0.16.0）的开放表：那一版的实盘录像回放时按它判断能不能放技能 */
const LIVE_SKILL_OPEN_39: Record<LiveTier, readonly MapId[]> = { small: ['snow', 'bamboo'], medium: [], large: [], luxe: [] };
/** 规则版本 40–42（0.17.0–0.17.7）的开放表：0.17.8 小档才开河滩、义庄、荒庙、鬼市，之前开的局回放、结回按这张 */
const LIVE_SKILL_OPEN_42: Record<LiveTier, readonly MapId[]> = { small: ['snow', 'bamboo'], medium: ['snow', 'bamboo'], large: ['snow', 'bamboo'], luxe: ['snow'] };
/** 规则版本 43–44（0.17.8–0.17.9）的开放表：0.17.10 起四档 × 七图全开 */
const LIVE_SKILL_OPEN_44: Record<LiveTier, readonly MapId[]> = {
  small: ['snow', 'bamboo', 'riverbank', 'yizhuang', 'temple', 'guishi'],
  medium: ['snow', 'bamboo'],
  large: ['snow', 'bamboo'],
  luxe: ['snow'],
};
/**
 * 规则版本 40–44（0.17.0–0.17.9）里带技能后小白线低于带下限、那一档照不带技能的样子打的角色；0.17.10 起清空（所有者 11-03：实盘和娱乐对齐），
 * 只给那几版的局回放、结回用。
 */
const LIVE_SKILL_CHAR_SHUT_44: Partial<Record<LiveTier, readonly CharacterId[]>> = {
  medium: ['pang', 'zhijiang'],
  large: ['fushi', 'pang', 'caiyao', 'gengfu', 'zhijiang'],
  luxe: ['fushi', 'caiyao', 'gengfu', 'zhijiang', 'yinyang'],
};
/**
 * rules 给了且小于 40（旧录像）时按 0.16.0 的表、不看角色；40–42 按 0.17.7 的表、43–44 按 0.17.9 的表，都要看当时关技能的角色；
 * 不给 = 现行规则（四档 × 七图全开）。character 不给 = 只看档位 × 地图
 */
export function liveSkillOpen(tier: LiveTier | undefined, map: MapId | undefined, rules?: number, character?: CharacterId): boolean {
  if (!tier) return false;
  if (rules !== undefined && rules < 40) return LIVE_SKILL_OPEN_39[tier].includes(map ?? 'snow');
  if (rules === undefined || rules > 44) return LIVE_SKILL_OPEN[tier].includes(map ?? 'snow');
  const table = rules <= 42 ? LIVE_SKILL_OPEN_42 : LIVE_SKILL_OPEN_44;
  return table[tier].includes(map ?? 'snow') && !(character && LIVE_SKILL_CHAR_SHUT_44[tier]?.includes(character));
}

/** 实盘能选的角色：娱乐里能选的都能（0.17.10 起新三人各档、各图、夜探都开；摆渡人娱乐里也收着，不开） */
export const LIVE_CHAR_IDS: readonly CharacterId[] = ['xiaodao', 'fushi', 'jianxia', 'pang', 'gengfu', 'caiyao', 'zhijiang', 'huolang', 'yinyang'];
/** 这个角色能不能带进实盘（档位、地图、守夜 / 夜探都不再限；参数留着给界面和旧调用） */
export function liveCharOk(_tier: LiveTier, character: CharacterId, _map: MapId = 'snow', _raid = false): boolean {
  return LIVE_CHAR_IDS.includes(character);
}

export const LIVE_CHAR_BP: LiveCoef<CharacterId> = {
  jianxia: { small: 9_900, medium: 9_100, large: 9_100, luxe: 7_700 },
  pang: { small: 9_900, medium: 8_400, large: 8_100, luxe: 6_400 },
  gengfu: { small: 10_100, medium: 11_600, large: 12_700, luxe: 15_100 },
  caiyao: { small: 9_900, medium: 9_700, luxe: 8_900 },
  fushi: { medium: 9_600, large: 9_600, luxe: 8_700 },
  // 新三人（0.17.10，雪原、不放技能、每格两条线各 300 局，按两线期望 + 2SE 不超上限拟）
  zhijiang: { small: 9_500, medium: 10_100, large: 9_900, luxe: 8_100 },
  huolang: { small: 8_800, medium: 9_000, large: 8_800, luxe: 6_700 },
  yinyang: { small: 8_900, medium: 8_500, large: 7_700, luxe: 6_400 },
};
/**
 * 开了技能的格子（LIVE_SKILL_OPEN）用的倍数，和上面不带技能的那套分开：技能让机器人更能撑到天亮，同一份 dawnBp 会多发筹码，
 * 所以开了技能的格子单独定 dawnBp、角色系数、地图系数（DESIGN 4.2a）。小档 0.16.0：按「期望 + 2SE 不超上限」收的保守值，
 * 主线定下小档维持（普通暂时比带低）；中档以上 0.17.0：配合 LIVE_SKILL_SHAPE 的按档曲线，小道士每档两条线各 1,000 局拟合。
 * 0.17.10 起四档 × 七图全开：这里没写的角色、地图按不带技能那套（LIVE_CHAR_BP、LIVE_MAP_BP）补，再没有按 1 倍。
 */
export const LIVE_SKILL_BP: { dawn: Partial<Record<LiveTier, number>>; char: LiveCoef<CharacterId>; map: LiveCoef<MapId> } = {
  dawn: { small: 11_800, medium: 13_900, large: 13_800, luxe: 12_300 },
  char: {
    fushi: { small: 10_500, medium: 10_000 },
    jianxia: { small: 9_900, medium: 9_500, large: 9_100, luxe: 8_400 },
    pang: { small: 9_400, luxe: 7_800 },
    // 更夫大、豪华档 0.17.10 开技能：按不带技能的 12,700 / 15,100 补，普通机器人 100 局期望 +0.70 / +0.69（上限 +0.30 / +0.15），压到上限
    gengfu: { small: 9_800, medium: 9_400, large: 9_300, luxe: 9_800 },
    caiyao: { small: 9_500, medium: 9_700 },
    zhijiang: { small: 10_500 },
    huolang: { small: 10_200, medium: 9_900, large: 10_200, luxe: 9_700 },
    yinyang: { small: 10_200, medium: 9_700, large: 9_700 },
  },
  // 开了技能的格子的地图系数：小档竹林沿用不带技能那套的 9,900（0.16.0 就是这么开的）；中档以上按带技能的模拟单独拟；
  // 小档河滩、义庄、荒庙、鬼市 0.17.8 按带技能的模拟各 300 局拟（两条线期望 + 2SE 都不超上限）
  // 中档以上的冰湖、河滩、义庄、荒庙、鬼市和豪华档竹林 0.17.10 开，用小道士带技能各 300 局拟的值（只卡两线期望 + 2SE 不超上限）
  map: {
    bamboo: { small: 9_900, medium: 9_500, large: 9_200, luxe: 9_400 },
    icelake: { small: 9_600, medium: 9_600 },
    riverbank: { small: 11_700, medium: 10_400, large: 10_100, luxe: 11_200 },
    yizhuang: { small: 11_700, medium: 10_900, large: 10_500, luxe: 11_700 },
    temple: { small: 11_400, medium: 12_400, large: 13_000, luxe: 14_400 },
    guishi: { small: 11_600, medium: 11_200, large: 10_700, luxe: 12_200 },
  },
};
/**
 * 开了技能的格子里「角色 × 地图」乘出来超带上限的组合（0.17.9，规则版本 44）：写了就用它替换 LIVE_SKILL_BP 的角色系数 × 地图系数。
 * 0.17.8 小档河滩、义庄、荒庙、鬼市的地图系数只拿小道士拟，老角色带技能的系数乘上去多数格超了上限（小白最高 +0.41、普通最高 +0.64）。
 * 拟法：每个角色 × 每张图两条线各 300 局，取两线期望 + 2SE 都不超上限的最大值（DESIGN 4.2）；没写的格子没超；胖师叔义庄、荒庙、鬼市 0.17.10 补上
 */
export const LIVE_SKILL_COMBO_BP: Partial<Record<CharacterId, Partial<Record<MapId, Partial<Record<LiveTier, number>>>>>> = {
  fushi: { riverbank: { small: 11_800 }, yizhuang: { small: 11_800 }, temple: { small: 11_800 }, guishi: { small: 11_800 } },
  gengfu: { riverbank: { small: 10_700 }, yizhuang: { small: 11_000 }, guishi: { small: 10_500 } },
  jianxia: { riverbank: { small: 10_500 }, yizhuang: { small: 10_500 }, temple: { small: 10_500 }, guishi: { small: 10_700 } },
  caiyao: { riverbank: { small: 10_200 }, yizhuang: { small: 9_800 }, temple: { small: 10_100 }, guishi: { small: 9_900 } },
  pang: { riverbank: { small: 10_200 }, yizhuang: { small: 9_900 }, temple: { small: 10_500 }, guishi: { small: 10_200 } },
};
/**
 * 规则版本 46（0.17.11）起加的组合：货郎带技能在中档以上的难图上明显多发（普通 +0.20～+0.67，超带上限 0.15 以上）。
 * 技能地图系数是拿小道士拟的，难图对小道士难、对货郎没那么难，乘上去多给了。每格两条线各 300 局，压到两线期望都不超上限。
 * 规则 45 及以前开的局不用这张（和 0.17.10 线上一致）。
 */
const LIVE_SKILL_COMBO_BP_46: Partial<Record<CharacterId, Partial<Record<MapId, Partial<Record<LiveTier, number>>>>>> = {
  huolang: {
    temple: { medium: 10_500, large: 10_200, luxe: 9_300 },
    guishi: { large: 9_600, luxe: 8_800 },
    icelake: { luxe: 9_200 },
    riverbank: { luxe: 8_600 },
    yizhuang: { luxe: 9_000 },
  },
};
/**
 * 规则版本 47（0.17.12）起加的组合：荒庙中档以上，剑侠、采药女、胖师叔、更夫、小道士带技能明显多发（普通 +0.31～+0.71，超带上限 0.15 以上）。
 * 荒庙技能地图系数对近战、回血型偏高（同图纸匠、阴阳先生反而偏低），一个地图系数压不平，按角色 × 档位写；每格两条线各 300 局，压到两线期望都不超上限。
 * 规则 46 及以前开的局不用这张（和 0.17.11 线上一致）。
 */
const LIVE_SKILL_COMBO_BP_47: Partial<Record<CharacterId, Partial<Record<MapId, Partial<Record<LiveTier, number>>>>>> = {
  jianxia: { temple: { medium: 9_800, large: 9_600, luxe: 9_000 } },
  caiyao: { temple: { medium: 10_500, large: 10_600, luxe: 9_700 } },
  xiaodao: { temple: { large: 10_800 } },
  pang: { temple: { luxe: 9_400 } },
  gengfu: { temple: { luxe: 12_200 } },
};
/**
 * 规则版本 49（0.17.14）起加的组合：全覆盖测量（每格两线各 300 局）里普通期望低于带下限 0.10 以上的格子，在两线都不超上限的前提下抬向带中点（最多 1.5 倍）。
 * 小档简单图的胖师叔、采药女这些两线差得少，小白先碰上限，只能抬一点；冰湖按所有者定的保守系数不动。规则 48 及以前开的局不用这张。
 */
const LIVE_SKILL_COMBO_BP_49: Partial<Record<CharacterId, Partial<Record<MapId, Partial<Record<LiveTier, number>>>>>> = {
  pang: { snow: { small: 9_500 }, bamboo: { small: 9_500 } },
  caiyao: { snow: { small: 9_700 }, bamboo: { small: 10_000 }, yizhuang: { small: 10_100 } },
  gengfu: { bamboo: { small: 9_900 }, riverbank: { large: 11_100 } },
  zhijiang: { snow: { luxe: 10_200 }, bamboo: { luxe: 9_100 }, riverbank: { luxe: 11_100 } },
  yinyang: { snow: { luxe: 9_000 }, bamboo: { luxe: 8_300 }, riverbank: { luxe: 10_000 }, yizhuang: { luxe: 11_200 }, temple: { luxe: 13_800 }, guishi: { luxe: 10_500 } },
};
/**
 * 规则版本 50（0.17.15）起加的组合：实盘降难度（waves.ts 的 LIVE_EASE）以后粗跑复核（每格两线各 100 局），普通期望超带上限 +0.15 的压回上限以内。
 * 规则 49 及以前开的局不用这张。
 */
const LIVE_SKILL_COMBO_BP_50: Partial<Record<CharacterId, Partial<Record<MapId, Partial<Record<LiveTier, number>>>>>> = {
  xiaodao: { temple: { medium: 10_400, luxe: 11_100 }, guishi: { luxe: 10_300 } },
  fushi: { guishi: { medium: 9_800 } },
  jianxia: { guishi: { luxe: 8_500 } },
};
/**
 * 规则 54（0.19.4）：规则 52 起 2.0 的新怪和首领进了实盘、开局配置也能带，按 sim --stop 重量守夜 63 个「角色 × 地图」压回多发格（点估计超上限 +0.15）。
 * 纸匠、阴阳先生、货郎另量了一条带最优配置的线（纸匠、阴阳先生镇魂铃起手 + 幽冥心法，货郎聚财 + 聚财心法；主线 11-06：按最优配置压多发，不砍配置），
 * 两条线都多发的取压得低的。冰湖几格小白和普通一样高，只压到不再明显多发。规则 ≤53 的局不用这张
 */
const LIVE_SKILL_COMBO_BP_54: Partial<Record<CharacterId, Partial<Record<MapId, Partial<Record<LiveTier, number>>>>>> = {
  xiaodao: { snow: { large: 8_500 }, bamboo: { medium: 7_800, large: 8_100 }, icelake: { medium: 9_200, large: 8_900 } },
  fushi: { temple: { medium: 10_200, luxe: 10_900 }, guishi: { large: 8_600, luxe: 8_900 } },
  jianxia: { icelake: { medium: 9_000, large: 8_500, luxe: 8_600 } },
  pang: { icelake: { luxe: 8_300 } },
  caiyao: { icelake: { medium: 9_100, large: 9_000 } },
  zhijiang: { snow: { medium: 8_500, large: 7_600, luxe: 7_600 }, bamboo: { medium: 8_000, large: 6_800 }, icelake: { medium: 8_600, large: 8_500 }, riverbank: { small: 10_500, medium: 9_300, large: 8_400, luxe: 8_600 }, yizhuang: { medium: 9_400, large: 8_800 }, temple: { large: 8_900, luxe: 8_900 }, guishi: { medium: 9_400, large: 8_700 } },
  huolang: { snow: { medium: 8_100, large: 8_100, luxe: 7_300 }, bamboo: { medium: 7_900 }, riverbank: { medium: 8_900 }, temple: { medium: 9_100, large: 8_000 }, guishi: { large: 8_300 } },
  yinyang: { snow: { medium: 8_400, large: 7_600 }, bamboo: { medium: 7_600, large: 6_800 }, icelake: { large: 8_900 }, riverbank: { luxe: 8_600 }, yizhuang: { large: 8_500, luxe: 9_100 }, temple: { medium: 9_700, large: 9_900, luxe: 9_800 }, guishi: { medium: 9_500, large: 8_700 } },
};
/**
 * 规则 65（0.28.0）：专属搭配的料加权、铁布衫和万符齐发冷却缩短、心法流派的法器伤害 +10% 进实盘后压回的格子。
 * 量法：雪原守夜 9 个角色默认线、带心法线和三条最优配置线，每格 150 局和 0.27.0 的大样本同种子配对，新期望 = 大样本期望 + 配对差；
 * 只压估计值超多发线、而且配对差本身显著（差 − 2SE > 0）的格，压到小白不超多发线（这 5 格压完普通都在带内）。没列的格子照规则 64 的表。规则 ≤64 的局不用这张
 */
const LIVE_SKILL_COMBO_BP_65: Partial<Record<CharacterId, Partial<Record<MapId, Partial<Record<LiveTier, number>>>>>> = {
  xiaodao: { snow: { luxe: 8_900 } },
  fushi: { snow: { medium: 9_800, large: 9_100, luxe: 8_500 } },
  zhijiang: { snow: { medium: 9_200 } },
};
/**
 * 规则 64（0.27.0）：规则 60–63 的内容（选卡、角色钩子、换池和新搭配、两段式合成）进实盘后统一重拟。sim --stop 重量守夜 63 个「角色 × 地图」默认线
 * 和纸匠、阴阳先生、货郎的最优配置线（最多 2,000 局）。口径「宁简勿难」（docs/balance.md 开头）：多发线 = 带上限 + 0.15，只压超过它的格子，
 * 压到普通回到带上限、小白不超多发线；普通低于带下限的抬到带上限（同样两条线、最多 2 倍）。两条线都量过的：任一线要压取压得低的，两条都偏低才抬。
 * 没列的格子照规则 58 的表。规则 ≤63 的局不用这张
 */
const LIVE_SKILL_COMBO_BP_64: Partial<Record<CharacterId, Partial<Record<MapId, Partial<Record<LiveTier, number>>>>>> = {
  xiaodao: { snow: { small: 12_100, medium: 9_600, large: 8_800, luxe: 9_500 }, bamboo: { small: 11_800, medium: 9_600, large: 8_700 }, icelake: { small: 11_800, medium: 9_700, large: 8_900 }, riverbank: { small: 13_200 }, yizhuang: { small: 12_300 }, temple: { small: 13_100 }, guishi: { small: 12_700 } },
  fushi: { snow: { small: 12_300 }, bamboo: { small: 12_200, luxe: 9_000 }, icelake: { small: 12_100, luxe: 9_400 }, riverbank: { small: 13_200 }, yizhuang: { small: 13_200 }, temple: { small: 13_100 }, guishi: { small: 13_100, large: 9_400 } },
  jianxia: { snow: { small: 11_900, large: 8_600 }, bamboo: { small: 11_900, large: 8_500, luxe: 8_700 }, icelake: { small: 11_800, medium: 9_200, large: 8_800, luxe: 8_900 }, riverbank: { luxe: 9_300 }, yizhuang: { small: 12_200, luxe: 8_900 }, guishi: { luxe: 9_400 } },
  pang: { snow: { small: 11_800, medium: 9_200, large: 8_600, luxe: 8_600 }, bamboo: { small: 11_800, medium: 9_200, large: 8_200, luxe: 8_100 }, icelake: { small: 11_900, medium: 9_200, large: 8_400, luxe: 8_400 }, riverbank: { medium: 10_200, large: 9_300 }, yizhuang: { small: 12_400, luxe: 8_800 }, guishi: { small: 12_500, large: 9_400 } },
  gengfu: { snow: { small: 11_900, medium: 9_900 }, bamboo: { small: 11_800, medium: 10_300, large: 9_600 }, icelake: { small: 11_900, medium: 9_800, large: 9_900 }, yizhuang: { small: 12_000 }, temple: { small: 13_100 } },
  caiyao: { snow: { small: 11_800, medium: 9_100, large: 8_600, luxe: 9_000 }, bamboo: { small: 11_800, large: 8_700, luxe: 9_000 }, icelake: { small: 11_900, medium: 9_300, large: 8_600, luxe: 9_200 }, riverbank: { small: 12_400, large: 10_600, luxe: 10_700 }, yizhuang: { small: 12_000, medium: 10_200, large: 9_700, luxe: 9_100 }, temple: { large: 10_600, luxe: 11_200 }, guishi: { small: 11_900, medium: 10_500, large: 9_900, luxe: 10_000 } },
  zhijiang: { snow: { small: 11_800, medium: 9_400, large: 8_400, luxe: 8_600 }, bamboo: { small: 11_800, medium: 9_400, large: 8_200, luxe: 8_600 }, icelake: { small: 11_800, medium: 9_200, large: 8_400, luxe: 8_400 }, temple: { large: 9_600, luxe: 9_200 }, guishi: { large: 9_400 } },
  huolang: { snow: { small: 11_800, medium: 9_100, large: 8_900, luxe: 8_400 }, bamboo: { small: 12_000, medium: 9_400, large: 8_600, luxe: 8_300 }, icelake: { small: 11_900, medium: 9_300, large: 8_800, luxe: 8_700 }, riverbank: { small: 12_800, medium: 10_200, large: 9_200 }, yizhuang: { small: 11_900, luxe: 8_800 }, temple: { small: 13_100, medium: 10_200, large: 9_200 }, guishi: { small: 12_200, large: 9_100 } },
  yinyang: { snow: { small: 11_800, medium: 9_500, large: 8_700 }, bamboo: { small: 11_800, medium: 9_300, large: 8_600, luxe: 8_900 }, icelake: { small: 11_900, medium: 9_500, luxe: 9_800 }, temple: { small: 13_100 }, guishi: { small: 13_100, luxe: 9_800 } },
};
/**
 * 规则 58（0.21.1）：规则 57 的新内容进实盘，目标带整体 +0.15（balance.md 4.4，所有者 11-07「收益要配得上难度」）。按 sim --stop 重量守夜 63 个「角色 × 地图」
 * 默认线和纸匠、阴阳先生、货郎的最优配置线：没有多发格；普通低于下限 0.10 以上的抬向带中点（两线都不超上限、最多 2 倍，两条线都量过的要两条都偏低才抬）。
 * 多数格子小白先碰到上限，普通只抬到小白上限为止。没列的格子照规则 56 的表。规则 ≤57 的局不用这张
 */
const LIVE_SKILL_COMBO_BP_58: Partial<Record<CharacterId, Partial<Record<MapId, Partial<Record<LiveTier, number>>>>>> = {
  xiaodao: { snow: { small: 10_900 }, bamboo: { small: 10_800, medium: 8_700 }, icelake: { small: 10_500, luxe: 9_500 }, riverbank: { large: 10_100 } },
  fushi: { snow: { small: 11_400 }, bamboo: { small: 11_500 }, icelake: { small: 11_100 } },
  jianxia: { snow: { small: 10_700 }, bamboo: { small: 10_800 }, icelake: { small: 10_700 }, riverbank: { small: 12_700, luxe: 10_900 }, yizhuang: { small: 11_300 }, temple: { small: 12_600 }, guishi: { small: 12_100 } },
  pang: { snow: { small: 10_600 }, bamboo: { small: 10_600, medium: 8_400 }, icelake: { small: 10_500, medium: 8_100 }, riverbank: { small: 12_600, luxe: 9_200 }, yizhuang: { small: 10_900, luxe: 8_200 }, temple: { small: 12_600 }, guishi: { small: 11_200 } },
  gengfu: { snow: { small: 10_700 }, bamboo: { small: 10_600, medium: 9_300, large: 9_700, luxe: 11_400 }, icelake: { small: 10_700, medium: 9_300, large: 10_200 }, riverbank: { small: 12_600, medium: 12_600, luxe: 13_700 }, yizhuang: { small: 11_200 }, guishi: { small: 11_900, large: 11_900 } },
  caiyao: { snow: { small: 10_800, luxe: 9_600 }, bamboo: { small: 10_500, luxe: 9_700 }, icelake: { small: 10_800, large: 9_000 }, riverbank: { small: 11_700, medium: 12_000, large: 12_800, luxe: 13_300 }, yizhuang: { small: 11_000 }, temple: { small: 12_000, medium: 12_100, large: 12_300, luxe: 13_200 }, guishi: { small: 10_800, luxe: 11_700 } },
  zhijiang: { snow: { small: 10_900, large: 8_000, luxe: 9_100 }, bamboo: { small: 10_700, medium: 8_800, large: 7_900 }, icelake: { small: 10_700, medium: 8_700 }, riverbank: { small: 12_600, large: 10_300, luxe: 10_800 }, temple: { large: 11_300, luxe: 11_700 } },
  huolang: { snow: { small: 10_700, medium: 8_600, luxe: 7_900 }, bamboo: { small: 10_800, medium: 8_200, large: 7_600 }, icelake: { small: 10_600, medium: 8_400, large: 8_000 }, riverbank: { small: 11_400 }, yizhuang: { small: 10_700 }, temple: { small: 11_400 }, guishi: { small: 10_600 } },
  yinyang: { snow: { small: 10_600, large: 7_900 }, bamboo: { small: 10_800, medium: 8_300, large: 7_700 }, icelake: { small: 10_600, luxe: 8_300 }, riverbank: { luxe: 10_800 }, temple: { medium: 11_500 } },
};

/**
 * 规则 56（0.20.2）：规则 55 的新内容（河滩、荒庙的纸弩手和催命鬼，符火燎原、铃符、铃焰、钟鼓齐鸣，幡下招魂）这一版起进实盘，
 * 按 sim --stop 重量守夜 63 个「角色 × 地图」和纸匠、阴阳先生、货郎的最优配置线（同规则 54），压回 10 个多发格；冰湖三格小白和普通一样高，只压到不再明显多发。
 * 没列的格子照规则 54 的表。规则 ≤55 的局不用这张
 */
const LIVE_SKILL_COMBO_BP_56: Partial<Record<CharacterId, Partial<Record<MapId, Partial<Record<LiveTier, number>>>>>> = {
  xiaodao: { icelake: { medium: 9_000, large: 8_700 }, yizhuang: { luxe: 10_100 } },
  fushi: { yizhuang: { luxe: 8_800 }, temple: { large: 10_400, luxe: 8_800 } },
  pang: { yizhuang: { luxe: 7_300 } },
  caiyao: { icelake: { large: 8_900 } },
  yinyang: { yizhuang: { medium: 9_100 }, guishi: { luxe: 8_700 } },
};
/**
 * 规则 51（0.18.0）实盘和娱乐同池以后，按 sim --stop 全量粗跑压回的多发格（点估计超上限 +0.15）：压到两线都不超上限；
 * 小白和普通差不多高的几格（冰湖、河滩）再压普通就低于下限 −0.10，只压到不再明显多发。规则 ≤50 的局不用这张
 */
const LIVE_SKILL_COMBO_BP_51: Partial<Record<CharacterId, Partial<Record<MapId, Partial<Record<LiveTier, number>>>>>> = {
  xiaodao: { icelake: { medium: 9_400, large: 9_000, luxe: 9_400 }, riverbank: { large: 8_600, luxe: 9_400 } },
  fushi: { icelake: { luxe: 8_200 } },
  jianxia: { icelake: { luxe: 9_000 }, riverbank: { luxe: 8_500 }, yizhuang: { luxe: 8_300 } },
  pang: { icelake: { luxe: 8_500 }, riverbank: { luxe: 6_700 } },
  zhijiang: { temple: { medium: 10_500, large: 10_600 } },
  huolang: { bamboo: { large: 7_200, luxe: 7_300 }, icelake: { medium: 8_100, large: 7_700, luxe: 7_600 }, riverbank: { small: 10_200, large: 8_500 }, yizhuang: { small: 10_300, medium: 9_500, large: 8_800 }, temple: { small: 10_200 }, guishi: { small: 10_300, medium: 9_700 } },
};
/**
 * 开了技能的格子（LIVE_SKILL_OPEN）中途倒下的形状和打倒尸王的加成，和不带技能的 VIGIL_SHAPE / VIGIL_BOSS_ADD_BP 分开：
 * 技能让中途撑得更久，同一条曲线会多发筹码。没写的档（小档）和表外的格子仍用 VIGIL_SHAPE / VIGIL_BOSS_ADD_BP。
 * 0.17.0 按带技能的模拟拟合（小道士、雪原，每档两条线各 1,000 局；DESIGN 4.2a）：天亮少给、中途倒下多给，小白和普通才能同时进带。
 */
export const LIVE_SKILL_SHAPE: Partial<Record<LiveTier, { shape: readonly (readonly [number, number])[]; bossAdd: number }>> = {
  medium: { shape: [[120, 0], [300, 1_120], [600, 4_400], [840, 5_760], [900, 10_000]], bossAdd: 2_000 },
  large: { shape: [[120, 0], [300, 1_120], [600, 4_400], [840, 5_760], [900, 10_000]], bossAdd: 2_000 },
  luxe: { shape: [[120, 0], [300, 1_932], [600, 7_590], [840, 9_936], [900, 10_000]], bossAdd: 2_000 },
};
export const LIVE_MAP_BP: LiveCoef<MapId> = {
  bamboo: { small: 9_900, medium: 8_900, large: 8_400, luxe: 7_900 },
  icelake: { small: 8_400, medium: 8_700, large: 9_400, luxe: 11_600 },
  riverbank: { small: 10_200, medium: 9_900, large: 9_500, luxe: 10_500 },
  yizhuang: { small: 10_200, medium: 9_300, large: 8_800, luxe: 8_500 },
  temple: { small: 10_000, medium: 10_400, large: 11_600, luxe: 10_600 },
  guishi: { small: 10_200, medium: 9_600, large: 9_100, luxe: 9_200 },
};

/**
 * 组合系数（0.3.7）：「角色 × 地图 × 档」整套系数（万分比），写了就替换 LIVE_CHAR_BP × LIVE_MAP_BP 的乘积。
 * 只给乘积偏出同档平均 0.10 份以上的格子（0.4.7 全扫 6 角色 × 6 地图 × 4 档，每格 600 局拟合，DESIGN 4.2a）；没写的组合仍按乘积。小道士 × 雪原是基准，不写。
 */
export const LIVE_COMBO_BP: Partial<Record<CharacterId, Partial<Record<MapId, Partial<Record<LiveTier, number>>>>>> = {
  fushi: { yizhuang: { medium: 13_600 }, icelake: { large: 9_100, luxe: 8_800 }, temple: { large: 14_500, luxe: 23_600 }, bamboo: { luxe: 6_200 } },
  pang: { yizhuang: { medium: 9_700, large: 9_800, luxe: 9_300 }, icelake: { large: 9_400, luxe: 9_100 }, bamboo: { luxe: 5_700 }, temple: { luxe: 8_900 } },
  gengfu: { snow: { medium: 10_500, large: 11_400, luxe: 11_800 }, bamboo: { large: 11_700 }, icelake: { luxe: 12_400 }, yizhuang: { luxe: 25_000 }, temple: { luxe: 25_000 } },
  caiyao: { temple: { large: 11_800, luxe: 11_500 }, bamboo: { luxe: 7_900 }, icelake: { luxe: 11_600 } },
  jianxia: { yizhuang: { luxe: 12_500 } },
};

/** 实盘档 tier 的守夜撑了 ticks 拍（每秒 30 拍）、赢没赢、打没打倒尸王 → 结回倍数（万分比，整数）；角色、地图缺省 = 小道士、雪原 */
/**
 * 改过的地图系数（不带技能那套）：每张表是「到这个规则版本为止」用的值，只写后来改过的条目。
 * 实盘局按开局时的规则版本结回（页面重开、新版本上线后才结的局不换倍数）：从开局版本往后找第一张写了这一格的表，都没写就是现行的 LIVE_MAP_BP。
 * - 39（0.16.0）：0.17.0 抬了小档河滩、义庄、荒庙；
 * - 40（0.17.0–0.17.2）：0.17.3 义庄、荒庙打通院墙后各档按新墙重拟（MAPS.blocksV40 是旧墙）；
 * - 41（0.17.3–0.17.4）：0.17.5 冰湖小、中、大档按现在的机器人重拟（小白远超上限；冰面让小白和普通撑得差不多，普通线跟着低于下限）。
 */
const LIVE_MAP_BP_UNTIL: readonly (readonly [number, LiveCoef<MapId>])[] = [
  [39, { riverbank: { small: 9_900 }, yizhuang: { small: 10_500 }, temple: { small: 10_300 } }],
  [40, { yizhuang: { small: 11_000, medium: 13_000, large: 13_300, luxe: 17_900 }, temple: { small: 10_900, medium: 12_300, large: 13_000, luxe: 15_900 } }],
  [41, { icelake: { small: 9_900, medium: 9_600, large: 10_500 } }],
];
/** 组合系数（LIVE_COMBO_BP）是在规则 40 的地图系数上拟的；之后地图系数改了，组合按小道士新旧地图系数的比例同比折算 */
const COMBO_FIT_RULES = 40;

function mapBpAt(tier: LiveTier, map: MapId, rules?: number): number {
  if (rules !== undefined) for (const [until, tbl] of LIVE_MAP_BP_UNTIL) if (rules <= until && tbl[map]?.[tier] !== undefined) return tbl[map]![tier]!;
  return LIVE_MAP_BP[map]?.[tier] ?? 10_000;
}

/**
 * rules：这一局开局时的规则版本（实盘记录里存的）；不给 = 现行规则。旧版本按当时的开放表（liveSkillOpen）和地图系数（mapBpAt）算，
 * 免得新版本上线前开的局、上线后才结回时换了一套倍数。
 */
export function vigilBp(tier: LiveTier, ticks: number, won: boolean, bossKilled: boolean, character: CharacterId = 'xiaodao', map: MapId = 'snow', rules?: number): number {
  const open = liveSkillOpen(tier, map, rules, character);
  // 组合系数是不带技能时拟的，开了技能的格子不用（小档的技能格子本来就没有组合条目）
  const combo0 = open ? undefined : LIVE_COMBO_BP[character]?.[map]?.[tier];
  const mapNow = mapBpAt(tier, map, rules);
  const mapFit = mapBpAt(tier, map, COMBO_FIT_RULES);
  // 规则 40 及以前的局组合系数直接替换乘积、不折算（和当时线上逐位一致）
  const combo = combo0 !== undefined && (rules === undefined || rules > COMBO_FIT_RULES) && mapNow !== mapFit ? Math.floor((combo0 * mapNow) / mapFit) : combo0;
  // 开了技能的格子：规则 44 起超上限的组合替换「技能角色 × 技能地图」乘积（规则 46 起再加货郎那几格，47 起荒庙那几格，49 起抬普通偏低的格子，50 起降难度后压回的格子，51 起同池后压回的格子，54 起新怪和开局配置进实盘后压回的格子，56 起规则 55 的新内容进实盘后压回的格子，58 起规则 57 的内容进实盘、目标带 +0.15 后抬的格子，64 起规则 60–63 的内容进实盘后重拟的格子，65 起规则 65 的内容进实盘后压回的格子）；规则 43 开的局按乘积结（和 0.17.8 线上一致）
  const after = (v: number) => rules === undefined || rules > v;
  const skillCombo = !open || !after(43) ? undefined
    : ((after(64) ? LIVE_SKILL_COMBO_BP_65[character]?.[map]?.[tier] : undefined)
      ?? (after(63) ? LIVE_SKILL_COMBO_BP_64[character]?.[map]?.[tier] : undefined)
      ?? (after(57) ? LIVE_SKILL_COMBO_BP_58[character]?.[map]?.[tier] : undefined)
      ?? (after(55) ? LIVE_SKILL_COMBO_BP_56[character]?.[map]?.[tier] : undefined)
      ?? (after(53) ? LIVE_SKILL_COMBO_BP_54[character]?.[map]?.[tier] : undefined)
      ?? (after(50) ? LIVE_SKILL_COMBO_BP_51[character]?.[map]?.[tier] : undefined)
      ?? (after(49) ? LIVE_SKILL_COMBO_BP_50[character]?.[map]?.[tier] : undefined)
      ?? (after(48) ? LIVE_SKILL_COMBO_BP_49[character]?.[map]?.[tier] : undefined)
      ?? (after(46) ? LIVE_SKILL_COMBO_BP_47[character]?.[map]?.[tier] : undefined)
      ?? (after(45) ? LIVE_SKILL_COMBO_BP_46[character]?.[map]?.[tier] : undefined)
      ?? LIVE_SKILL_COMBO_BP[character]?.[map]?.[tier]);
  const base = (open ? LIVE_SKILL_BP.dawn[tier] : undefined) ?? LIVE_TIERS[tier].dawnBp;
  // 规则 45 起开了技能的格子没单独写的角色、地图按不带技能那套补（之前开着的格子都写了，逐位不变）
  const fill = rules === undefined || rules > 44;
  const charBp = (open ? (LIVE_SKILL_BP.char[character]?.[tier] ?? (fill ? LIVE_CHAR_BP[character]?.[tier] : undefined)) : LIVE_CHAR_BP[character]?.[tier]) ?? 10_000;
  const mapBp = open ? (LIVE_SKILL_BP.map[map]?.[tier] ?? (fill ? mapNow : 10_000)) : mapNow;
  const dawn = (combo ?? skillCombo) !== undefined
    ? Math.floor((base * (combo ?? skillCombo)!) / 10_000)
    : Math.floor((Math.floor((base * charBp) / 10_000) * mapBp) / 10_000);
  const skill = open ? LIVE_SKILL_SHAPE[tier] : undefined;
  if (bossKilled) return Math.min(LIVE_MAX_BP, dawn + (skill?.bossAdd ?? VIGIL_BOSS_ADD_BP));
  if (won) return Math.min(LIVE_MAX_BP, dawn);
  return shapeBp(skill?.shape ?? VIGIL_SHAPE, ticks, dawn);
}

/** 中途倒下按形状逐拍插值：整数运算，浏览器和 Worker、各平台算出来一样；dawn 是这一格撑到天亮的倍数（万分比） */
export function shapeBp(shape: readonly (readonly [number, number])[], ticks: number, dawn: number): number {
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
