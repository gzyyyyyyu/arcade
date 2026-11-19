/**
 * 守岛 2.0 能调的数（规则版本 7）：塔的三阶数值和价格、统一的敌人表、英雄和技能、局内经济、难度预算、"海盗来袭"。
 * 数值由 tools/td-sim.ts 配平（DESIGN 10.7 的验收表）；规则核心只按字段名读，单测不写死这些数。
 * 规则表（克制倍率、类型归属、折阶、星数区间）不在这里，在 core/td2types.ts。
 * 速度是每拍多少单位（20 拍 1 秒，100 单位 1 格），射程、溅射是单位，伤害、血量是整数。
 */
import type { TdEnemyDef, TdEnemyKind } from '../core/tdtypes.ts';
import type { TdTier, TdTowerKind } from '../core/td2types.ts';

/** 一座塔某一阶的数值 */
export interface TdTierStats {
  dmg: number;
  /** 两发之间隔几拍 */
  reload: number;
  range: number;
  minRange: number;
  splash: number;
  /** 一次打几个不同的目标 */
  shots: number;
}

/** 木台上 1 阶的造价（局内金币）。升 1→2 阶花造价的 TD2_UP_PCT[0]%，2→3 阶花 TD2_UP_PCT[1]% */
export const TD2_COST: Readonly<Record<TdTowerKind, number>> = {
  gunTower: 90,
  cannon: 100,
  mortar: 120,
  flame: 120,
  harpoon: 140,
  rocket: 150,
  shock: 150,
  sniper: 180,
};
export const TD2_UP_PCT: readonly [number, number] = [80, 120];

const tiers = (s: Omit<TdTierStats, 'dmg'>, dmg1: number): readonly [TdTierStats, TdTierStats, TdTierStats] =>
  // 2 阶伤害 ×1.85、3 阶 ×3.2：累计花费是 1、1.8、3.0 倍造价，每 100 金的秒伤随阶略涨，升级有收益但不压倒铺开
  [{ ...s, dmg: dmg1 }, { ...s, dmg: Math.floor((dmg1 * 185) / 100) }, { ...s, dmg: Math.floor((dmg1 * 320) / 100) }];

/**
 * 三阶数值。拉平口径（DESIGN 10.2）：1 阶"每 100 金单体秒伤"单体塔约 15、溅射塔约 9（按平均打到 2 个折算），差 ±10% 以内。
 * 火枪 11×20/16 = 13.75 秒伤 / 90 金 ≈ 15.3；加农 60×20/80 = 15 / 100 金 = 15；鱼叉 105×20/100 = 21 / 140 ≈ 15；
 * 臼炮 54×20/100 = 10.8 / 120 = 9；喷火 6×20/11 ≈ 10.9 / 120 ≈ 9；火箭 3 发合计 22×3×20/100 = 13.2 / 150 ≈ 8.8。
 */
export const TD2_TOWERS: Readonly<Record<TdTowerKind, readonly [TdTierStats, TdTierStats, TdTierStats]>> = {
  gunTower: tiers({ reload: 16, range: 600, minRange: 0, splash: 0, shots: 1 }, 11),
  cannon: tiers({ reload: 80, range: 700, minRange: 0, splash: 0, shots: 1 }, 60),
  harpoon: tiers({ reload: 100, range: 900, minRange: 0, splash: 0, shots: 1 }, 105),
  mortar: tiers({ reload: 100, range: 1000, minRange: 300, splash: 150, shots: 1 }, 41),
  flame: tiers({ reload: 14, range: 450, minRange: 0, splash: 80, shots: 1 }, 6),
  rocket: tiers({ reload: 100, range: 800, minRange: 0, splash: 80, shots: 3 }, 18),
  // 震荡炮（规则版本 10）：3 秒一发、1 格小溅射，伤害是加农的七成，值钱的是命中震晕 TD2_SHOCK_STUN 拍
  shock: tiers({ reload: 60, range: 600, minRange: 0, splash: 80, shots: 1 }, 24),
  // 狙击塔（规则版本 11）：射程全岛最远（11 格）、4 秒一发（含 0.5 秒锁定预警）、不溅射；单发 2 倍多的加农，枪弹对重甲只有一半
  sniper: tiers({ reload: 80, range: 1100, minRange: 0, splash: 0, shots: 1 }, 90),
};

/** 震荡炮命中震晕几拍（1.2 秒）；之后 2 倍时长免控（combat.ts applyStun），首领减半 */
export const TD2_SHOCK_STUN = 24;

/** 某种塔某一阶 */
export function td2TierStats(kind: TdTowerKind, tier: TdTier): TdTierStats {
  return TD2_TOWERS[kind][tier - 1] as TdTierStats;
}

/**
 * 统一的敌人表：全关同一份，不再按关拧 hpPct。没有 armor 百分比和 flying（护甲在 core/td2types.ts 的 TD_ENEMY_ARMOR，飞的 = air）。
 * 初稿照搬 0.21.0 的 TD_ENEMIES 去掉减伤；铁甲不再减伤 60%，靠炮弹 1.5 / 枪弹火 0.5 的倍率体现。
 */
export const TD2_ENEMIES: Readonly<Record<TdEnemyKind, TdEnemyDef>> = {
  sailor: { name: '水手', hp: 90, speed: 5, dmg: 12, reload: 20, reach: 90, carry: 1, gold: 5 },
  ironclad: { name: '铁甲', hp: 180, speed: 3, dmg: 20, reload: 24, reach: 90, carry: 2, gold: 12 },
  fog: { name: '雾船', hp: 90, speed: 5, dmg: 10, reload: 20, reach: 90, carry: 1, gold: 9, fog: true },
  skiff: { name: '分裂小艇', hp: 140, speed: 4, dmg: 12, reload: 20, reach: 90, carry: 1, gold: 6, split: { kind: 'skiffling', n: 3 } },
  skiffling: { name: '小艇', hp: 40, speed: 6, dmg: 6, reload: 20, reach: 80, carry: 1, gold: 2 },
  sapper: { name: '工兵', hp: 100, speed: 5, dmg: 10, reload: 20, reach: 90, carry: 1, gold: 9, bomb: { dmg: 1000, r: 120 } },
  parrot: { name: '鹦鹉群', hp: 30, speed: 6, dmg: 6, reload: 20, reach: 80, carry: 1, gold: 4 },
  captain: { name: '船长', hp: 1600, speed: 3, dmg: 45, reload: 24, reach: 100, carry: 3, gold: 60, aura: { r: 300, pct: 30 } },
  // 掷弹兵（规则版本 10）：布衣甲怕火；离挡路的墙、拒马、英雄 3 格就停下扔手雷，不贴脸砸
  // 盾兵（规则版本 11）：重甲；正面挡枪和炮的单体伤害（SHIELD.frontPct），火和爆照吃；被震晕盾放下
  shield: { name: '盾兵', hp: 240, speed: 3, dmg: 18, reload: 24, reach: 90, carry: 2, gold: 14 },
  grenadier: { name: '掷弹兵', hp: 85, speed: 4, dmg: 30, reload: 50, reach: 90, carry: 1, gold: 8, lob: { range: 300, r: 120, wallPct: 30 } },
  // 精英（规则版本 15）：4 倍血、4 倍预算点、4 倍金，一个顶四个，让后期少而精。速度和普通兵一样，搬宝比四个普通兵少一点：
  // 初稿走得慢、只搬 2 枚，同样预算下明显好守（漏一个丢得少、挨打时间长），拟预算时得加到敌人比原来还多
  bosun: { name: '水手长', hp: 360, speed: 5, dmg: 30, reload: 20, reach: 90, carry: 3, gold: 20 },
  macaw: { name: '鹦鹉王', hp: 120, speed: 6, dmg: 15, reload: 20, reach: 80, carry: 2, gold: 16 },
  // 大副（规则版本 17，DESIGN 10.3）：精英的另一种难法。倒下原地散成水手——本体血厚，高单发塔打它不浪费，
  // 可散出来的 90 血水手又让高单发每发溢出一大半，挤成一团正好给溅射收；只靠狙击守不住，逼两种塔都摆。
  // 金按水手的比例（每点 5/6 金）连分身一起算，本体只拿扣掉分身的那部分
  mate: { name: '大副', hp: 240, speed: 5, dmg: 30, reload: 20, reach: 90, carry: 3, gold: 13, split: { kind: 'sailor', n: 3 } },
  // 第四章（规则版本 18）。军医：跟着队伍走，每秒给 2 格内的同伴回 3% 血，不先打掉它，后面一串都打不死；狙击塔先打它
  medic: { name: '军医', hp: 120, speed: 5, dmg: 10, reload: 20, reach: 90, carry: 1, gold: 10, heal: { r: 200, pct: 3 } },
  // 炮艇：停在海上不上岸，每 5 秒炸哑 9 格内最近的一座塔 3 秒，停 40 秒开走；不拿宝藏，只有射程 ≥ 8 格的塔打得到（TD_SEA_RANGE）
  gunboat: { name: '炮艇', hp: 300, speed: 0, dmg: 0, reload: 100, reach: 0, carry: 0, gold: 16, shell: { range: 900, reload: 100, jamTicks: 60, moor: 800 } },
  king: {
    name: '海盗王', hp: 3600, speed: 0, dmg: 0, reload: 120, reach: 0, carry: 0, gold: 150,
    shell: { range: 1000, reload: 120, jamTicks: 60, moor: 2000 },
    drop: { every: 200, n: 3, kind: 'sailor' },
    escort: { n: 2, kind: 'gunboat' },
  },
};

/** 海上的目标（炮艇）只有射程不小于这么多单位的塔打得到：臼炮、鱼叉、火箭、狙击够，加农、火枪、喷火、震荡不够 */
export const TD_SEA_RANGE = 800;

/**
 * 难度预算：B关 = base × (levelPct/100)^关，第 w 波 = B关 × (100 + wavePct × w)/100（core/td2types.ts 的 waveBudget）。
 * 配平只拧 base（整体）和单关的地图、开局金、驻守台上限；每次 ±2% 看 td-sim 的三星率变化（> 15 点说明这关太悬崖，改地图不改数）。
 */
export const TD2_BUDGET = { base: 100, levelPct: 103, wavePct: 10 } as const;

/** 每个敌人花多少预算点：≈ 等效血量 ÷ 最克它的倍率（1.5）÷ 10，雾船、工兵、首领按难对付加价；分裂小艇算上分出来的 */
export const TD2_ENEMY_POINTS: Readonly<Record<TdEnemyKind, number>> = {
  sailor: 6,
  ironclad: 15,
  fog: 8,
  skiff: 17,
  skiffling: 3,
  sapper: 9,
  parrot: 6,
  captain: 120,
  grenadier: 9,
  shield: 20,
  bosun: 24,
  macaw: 24,
  // 本体 240 加三个水手 270，按等效血量折 34 点（≈ 5.7 个水手）
  mate: 34,
  // 军医血少，但回血让一串人打不死，按 1.5 倍等效算
  medic: 12,
  // 炮艇 300 血木船，近程塔打不到、还要哑塔，按等效血量加价
  gunboat: 24,
  king: 300,
};

/** 首领波前多给的倒数（拍）：10 秒，预告条变红 */
export const TD2_BOSS_EXTRA_TICKS = 200;

/** 局内经济 */
export const TD2_ECON = {
  /** 卖塔退已花金币的百分之几 */
  sellPct: 70,
  /** 花钱立刻清掉压木台的沉船 */
  clearGold: 60,
  /** 英雄打掉沉船给多少金 */
  heroClearGold: 30,
  /** 压木台的沉船血量（英雄 1 级约 10 秒打掉） */
  wreckHp: 220,
  /** 叫波奖励 = ⌊下一波击杀金 × 剩余倒数 ÷ 总倒数 × callPct / 100⌋ */
  callPct: 60,
  /** 叫波时剩下的倒数每 1 拍抵多少拍英雄技能冷却（100 = 一比一） */
  callCdPct: 100,
  /** 修一段墙 */
  repairGold: 25,
} as const;

/** 地上的宝藏几拍没人捡就自己滚回箱子 */
export const TD2_TREASURE_ROLL_TICKS = 100;
/** 地雷炸完几拍重新埋好 */
export const TD2_MINE_REARM_TICKS = 400;

/**
 * 英雄（规则版本 7）：每级 +8%（旧版 15%）；技能按"这一关每波平均"写成相对值，各关一致。
 * 注意：登陆战的驻岛英雄 RAID_HERO 仍由 tdunits.ts 的 TD_HERO 派生，攻防不读这里。
 */
export const TD2_HERO = {
  hp: 420,
  dmg: 22,
  reload: 20,
  range: 250,
  speed: 6,
  growPct: 8,
  respawnTicks: 240,
  /** 最多同时缠住几个地面敌人，多的绕过去 */
  maxEngaged: 3,
} as const;

export const TD2_HERO_SKILL = {
  /** 拒马：英雄 range 内的路上，挡 ticks 拍；血 = 这一关一波平均敌人总血 × hpPct% */
  barricade: { range: 400, ticks: 100, hpPct: 15, cd: 400 },
  /** 炸药桶：扔 range 内，伤害 = 这一关每波平均单个敌人血量 × dmgPct%，半径 r，按爆破算 */
  bomb: { range: 500, dmgPct: 250, r: 180, cd: 500 },
  /** 号令（被动）：英雄身边 r 内的塔攻速 +pct% */
  rally: { r: 300, pct: 15 },
  /**
   * 锚钩（规则版本 20，英雄 level 级起，只在战役和海盗来袭）：钩 range 内一个敌人，钩子飞 fly 拍，再按整数格朝英雄拉回最多 cells 格
   * （每格 perCell 拍），拉完再定住 stun 拍；首领和海上的船钩不动。冷却 cd 拍，和炸药桶一样
   */
  hook: { level: 8, range: 500, fly: 4, cells: 3, perCell: 2, stun: 20, cd: 500 },
} as const;

/**
 * 岸防老炮（规则版本 16，第三章最后两关，core/tdmech.ts）：点哪里 delay 拍（1 秒）后落一发，伤害 = 这一关每波平均单个敌人血量 × dmgPct%（和炸药桶一样），
 * 半径 r 单位（比炸药桶大一点），按爆破算（打不到飞的，雾里照打，炸障碍不炸自己人）；打一发冷却 cd 拍（30 秒）。全岛都够得着，不看英雄站哪。
 * 400% / 25 秒那一档 td17 稳机器人三星 23% → 100%，章末关一炮清场就没意思了，按炸药桶的伤害、拉长冷却后约 80%
 */
/**
 * 漂流补给箱（规则版本 16，第一章最后两关，core/tdmech.ts）：写了 crates 的波开打时沙滩上漂来一个箱子，ticks 拍（30 秒，比一波的倒数长：清完这一波再去捡来得及）没人捡就漂走；
 * 英雄走到 pickR 单位内就捡到：局内金 = 这一波击杀金 × goldPct%（至少 minGold），英雄两个技能马上能用。敌人不捡
 */
export const TD2_CRATE = { ticks: 600, pickR: 120, goldPct: 30, minGold: 20 } as const;

export const TD2_BATTERY = { dmgPct: 250, r: 220, cd: 600, delay: 20 } as const;

/**
 * 友军巡航船（规则版本 19，第四章最后两关）：叫来后沿岛外沙滩的一圈开半圈，用 ticks 拍；每 reload 拍朝船边 r 单位内最近的地上或海上敌人开一炮，
 * delay 拍后落地，半径 splash，伤害 = 这一关每波平均单个敌人血量 × dmgPct%（和炸药桶、老炮同一个口径，按爆破算，打不到飞的）；叫一次冷却 cd 拍，开局就能叫
 */
export const TD2_FLEET = { ticks: 300, cd: 1200, reload: 20, r: 400, splash: 100, dmgPct: 120, delay: 10 } as const;

/**
 * 海盗来袭：自己的岛和布局，波次按 waveBudget(levelByHq[主寨-1], w) 现生成，打到丢 TD2_LOSE_AT 枚为止。
 * 奖励：每撑住一波给 tdRunReward(主寨, 3★) 的 perWavePct%，最多算 maxWaves 波，再照守岛的每日上限截（和战役共用一个上限）。
 * lanes / slots / kegs 是候选位置，照旧由 placeTdLevel 按玩家布局挑空的摆。
 */
export const TD2_HOME = {
  levelByHq: [0, 2, 10, 18, 26, 34, 42, 50] as readonly number[],
  gold: 300,
  first: 400,
  waveTicks: 360,
  perWavePct: 6,
  maxWaves: 20,
  /**
   * 登陆点离宝藏多远才算"够远"（规则版本 21）：登陆点到最近宝藏箱的路程，按敌人寻路的流场算（直走一格 10、斜走 14，砸墙按墙代价），
   * 80 ≈ 8 格空路（主寨 6、7 级推荐布局原来的样子）。写死的登陆点不够远就在同一边挑一个够远的（tdhome.ts 的 homeLanes）
   */
  laneMinPath: 80,
  /**
   * 加难档（规则版本 20）：主寨 hq 级起开局能选，默认关。等效关下标 +levelPlus（每波敌人约多 9%），精英按 elite 写的波数（0 起）进敌人池；
   * 每撑住一波给 perWavePct%（普通档 6%），照样受守岛每日上限管
   */
  hard: {
    hq: 6,
    levelPlus: 3,
    perWavePct: 8,
    elite: [['bosun', 7], ['macaw', 7], ['mate', 11]] as ReadonlyArray<readonly ['bosun' | 'macaw' | 'mate', number]>,
  },
  lanes: [{ x: 10, y: -2 }, { x: -2, y: 11 }, { x: 23, y: 10 }] as ReadonlyArray<{ x: number; y: number }>,
  tide: { x: 11, y: 23 },
  slots: [{ x: 5, y: 7 }, { x: 15, y: 7 }, { x: 2, y: 12 }, { x: 15, y: 15 }, { x: 11, y: 19 }, { x: 18, y: 10 }] as ReadonlyArray<{ x: number; y: number }>,
  kegs: [{ x: 10, y: 0 }, { x: 11, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 11 }, { x: 21, y: 10 }] as ReadonlyArray<{ x: number; y: number }>,
} as const;

/**
 * 守岛关内事件（规则版本 22，DESIGN 10.6g，core/tdevent.ts）：关卡写了 events 才有，落在哪一波由这一局的种子挑，提前一波写进预告。
 * - bounty 赏金船：开打 delay 拍后从这一波的一条登陆路上岸一个挂金旗的水手（血量 = 同波水手 × hpMul），不抢宝藏，横穿到最远的另一条登陆路离开；
 *   打倒给局内金 = 这一波击杀金 × goldPct%（至少 minGold），跑掉没有损失。
 * - rain 暴雨：这一波开打到下一波开打之间，火的伤害只剩 firePct%、地上的火不烧，飞的速度只剩 airPct%。
 * - dare 战书：开打前玩家可以接（默认不接）；接了这一波每组敌人多 morePct%（向下取整），这一波的击杀金 × goldMul。
 * 事件不挑首领波。
 */
export const TD2_EVENT = {
  bounty: { delay: 100, hpMul: 3, goldPct: 40, minGold: 30 },
  rain: { firePct: 80, airPct: 85 },
  dare: { morePct: 50, goldMul: 2 },
} as const;
