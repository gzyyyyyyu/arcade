/**
 * 首领连战（docs/design-play.md 2.5）：守夜的一个子模式（Setup.rush）。配装开局 → 10 列路线图，每列一只首领 → 第 11 关终局夜漏君。
 * 这里只放数值和名单；路线、配装、驿站的规则在 core/rush.ts，每日的种子在 online/rush.ts，首领池和词缀在 rushFoes.ts。
 */
import { TICKS_PER_SECOND } from './clock.ts';
import type { EnemyKind } from './enemies.ts';
import type { WeaponId } from './weapons.ts';

export { AFFIX_IDS, RUSH_AFFIXES, RUSH_FOE_IDS, RUSH_FOES, YELOU, type AffixId, type RushFoeDef, type RushFoeId } from './rushFoes.ts';

const S = TICKS_PER_SECOND;

export type RushHexId = 'fast' | 'noheal' | 'noreroll' | 'fierce' | 'dark' | 'poor';
export type RelicId = 'mirror' | 'lamp' | 'lock' | 'tube' | 'string' | 'charm' | 'boots' | 'ruler' | 'bowl' | 'thunder' | 'cloak' | 'gourd';
export type RushStopKind = 'shop' | 'rest' | 'event';
export type RushEventId = 'blood' | 'gamble' | 'well' | 'effigy' | 'dark' | 'peddler' | 'incense' | 'stele';

export const RUSH = {
  /** 开局几拍后第一关上场 */
  first: 3 * S,
  /** 清完一关喘口气：这么多拍后进选卡，期间掉肉包 */
  rest: 3 * S,
  /** 每次喘息掉几个肉包 */
  buns: 2,
  /** 等级固定（连战不吃魂、不升级；小道士「每 5 级」类特色按它算） */
  level: 10,
  /** 终局首领：夜漏君（数值在 rushFoes.ts YELOU） */
  finalKind: 'yelou' as EnemyKind,
  /** 路线图几列（每列一只首领），之后是终局 */
  stages: 10,
  /** 第几关（下标）的首领基准血、贴身伤害；危险档 hpMul 另乘，双煞每只再乘 RUSH_FOES.hpK */
  hp: [800, 1200, 1800, 3800, 6400, 10000, 14800, 19500, 25500, 33000] as readonly number[],
  dmg: [7, 8, 10, 12, 13, 14, 16, 17, 18, 20] as readonly number[],
  /** 精英路：血 ×eliteHp、多 eliteAffix 条词缀 */
  eliteHp: 1.3,
  eliteAffix: 1,
  /** 每列的词缀条数（精英、咒「凶」各另加 1） */
  affixes: [0, 0, 0, 1, 1, 1, 1, 1, 1, 2] as readonly number[],
  /** 软限时：到点首领发狂（不判负），之后每 every 拍伤害 +dmg、移速 +speed，封顶 maxDmg / maxSpeed。终局不算（五更滴漏就是终局的时限） */
  soft: 90 * S,
  enrage: { every: 10 * S, dmg: 0.1, speed: 0.05, maxDmg: 2, maxSpeed: 1.3 },
  /** 手牌几张、挑几张（精英、终局前那次挑 3） */
  hand: 5,
  take: { normal: 2, elite: 3, preFinal: 3 },
  /** 一局免费的重抽、放逐；每轮能锁几张 */
  rerolls: 2,
  bans: 2,
  locks: 1,
  /** 纸钱：普通关、精英关、快清（fastTicks 内清完）另给、跳过的每张 */
  coins: { normal: 20, elite: 35, fast: 10, fastTicks: 45 * S, skip: 8 },
  /** 商店价钱：卡按稀有度（普 / 稀 / 珍）、符印、回血、重抽 +1、放逐 +1 */
  prices: { card: [25, 40, 60] as readonly number[], relic: 50, heal: 20, reroll: 12, ban: 15 },
  /** 商店回血、休整回血（血上限的比例），休整升级给几级 */
  shopHeal: 0.3,
  restHeal: 0.5,
  restLevels: 2,
  /** 配装点上限 */
  budget: 6,
  /** 符印：从第几关（下标）起出、每手出现的概率、最多带几个 */
  relicFrom: 1,
  relicChance: 0.3,
  maxRelics: 6,
  /** 路线图：第 1 列几条路、其余几条；主场图的概率；整张图至少几个商店、几个休整 */
  firstPaths: 2,
  paths: 3,
  homeMap: 0.6,
  minShops: 3,
  minRests: 2,
} as const;

/** 一共几只（10 列 + 终局），结算 N/11、实盘结回按它 */
export const RUSH_TOTAL = RUSH.stages + 1;

/** 卡的稀有度权重（普通 / 稀有 / 珍品）：第 1 关 first，第 10 关 last，中间线性；升级数 = 稀有度 */
export const RUSH_TIER = { first: [75, 22, 3] as readonly number[], last: [45, 40, 15] as readonly number[] };

/** 流派套：同一流派单子上拿够 need[k] 件，本流派法器伤害 +bonus[k] */
export const RUSH_SETS = { need: [3, 5] as readonly number[], bonus: [0.1, 0.2] as readonly number[] };

/**
 * 配装点：角色起手件 0、其余候选 1、强件按表；第二件法器 2；被动每级 1。剩下的点每点换一次重抽
 */
export const RUSH_WEAPON_COST = { start: 0, other: 1, second: 2, passiveLevel: 1, strong: { thunder: 3 } as Partial<Record<WeaponId, number>> };

/** 咒（连战用，最多 2 条）：coins = 铜钱多给的比例 */
export const RUSH_HEXES: Record<RushHexId, { name: string; text: string; coins: number }> = {
  fast: { name: '疾', text: '首领快 15%', coins: 0.25 },
  noheal: { name: '枯', text: '肉包、回血减半', coins: 0.25 },
  noreroll: { name: '定', text: '不能重抽', coins: 0.25 },
  fierce: { name: '凶', text: '每关首领多 1 种强化', coins: 0.35 },
  dark: { name: '暗', text: '夜更黑', coins: 0.25 },
  poor: { name: '贫', text: '局内纸钱减半', coins: 0.25 },
};
export const RUSH_HEX_IDS = Object.keys(RUSH_HEXES) as readonly RushHexId[];
export const MAX_RUSH_HEXES = 2;

/** 符印（连战专用卡种）：名字和一句话说明；数值在 RELIC_FX */
export const RUSH_RELICS: Record<RelicId, { name: string; text: string }> = {
  mirror: { name: '照胆镜', text: '打首领伤害 +12%' },
  lamp: { name: '长明灯', text: '每关开打回 25% 血' },
  lock: { name: '铜锁', text: '选卡多锁 1 张' },
  tube: { name: '签筒', text: '每关多 1 次免费重抽' },
  string: { name: '纸钱串', text: '纸钱 +40%' },
  charm: { name: '护身符', text: '每关第一次挨致命伤留 1 血' },
  boots: { name: '疾风履', text: '走得快 10%' },
  ruler: { name: '镇尺', text: '首领的强化效果减半' },
  bowl: { name: '聚宝盆', text: '手牌多 1 张' },
  thunder: { name: '五雷令', text: '首领每掉一成血落一道雷' },
  cloak: { name: '夜行衣', text: '挨打后无敌时间长一半' },
  gourd: { name: '血葫芦', text: '血上限 +25' },
};
export const RELIC_IDS = Object.keys(RUSH_RELICS) as readonly RelicId[];
export const RELIC_FX = { mirror: 0.12, lamp: 0.25, string: 0.4, boots: 0.1, ruler: 0.5, thunder: 0.01, cloak: 0.5, gourd: 25 };

/** 事件：每个 2–3 个选项（文案大白话），最后一项多是「离开」；效果在 core/rush.ts */
export const RUSH_EVENTS: Record<RushEventId, { name: string; text: string; options: readonly string[] }> = {
  blood: { name: '血契', text: '石台上刻着字：拿血来换。', options: ['掉 25% 血，下一关过关多挑一张珍品卡', '离开'] },
  gamble: { name: '赌坊', text: '路边有人摆骰子。', options: ['押 20 纸钱，一半机会翻倍', '离开'] },
  well: { name: '古井', text: '井水清得能照见月亮。', options: ['喝一口，回满血', '许个愿，下一关多 2 张手牌'] },
  effigy: { name: '纸人替身', text: '纸人说：下一位首领让我扎得凶一点，换你多挑一张卡？', options: ['下一关首领多一种强化，过关多挑 1 张卡', '离开'] },
  dark: { name: '灯下黑', text: '灯笼一盏盏灭了。', options: ['下一关更黑，过关多挑一张珍品卡', '离开'] },
  peddler: { name: '老货郎', text: '货郎说：换一件同级的？', options: ['离开'] },
  incense: { name: '香火', text: '破庙里还有半炷香。', options: ['上香，回 40% 血'] },
  stele: { name: '无名碑', text: '碑上没有名字。', options: ['拜一拜，放逐 +2', '摸一摸，纸钱 +30'] },
};
export const RUSH_EVENT_IDS = Object.keys(RUSH_EVENTS) as readonly RushEventId[];
export const EVENT_FX = { bloodCost: 0.25, gambleBet: 20, effigyTake: 1, wellHand: 2, incenseHeal: 0.4, steleBans: 2, steleCoins: 30, peddlerOffers: 3 };
