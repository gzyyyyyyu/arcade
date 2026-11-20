/**
 * 守岛 2.0（规则版本 7）的契约：规则核心、关卡数据和配平、界面三方共读。
 * 这里只放三类东西：
 * 1. 定死的规则表：伤害类型 × 护甲的克制倍率、塔和敌人的类型归属、驻守台折阶、基地加成、星数区间、难度公式的形状；
 * 2. 新结构：关卡岛、驻守台、木台（可被沉船压着）、波次预告、路线、"海盗来袭"的局面、新命令和新事件；
 * 3. 只依赖上面两项的小纯函数（克制倍率、折阶、加成、波次预算）。
 * 能调的数（塔的三阶数值、价格、敌人血量、英雄技能、预算底数）不在这里，在 content/td2units.ts（配平只改那边）。
 * 改这个文件 = 改契约：规则、数据、界面要一起跟着调整。
 */
import { TD2_BUDGET } from '../content/td2units.ts';
import type { BuildingKind, Placed } from './types.ts';
import type { TdEnemyKind, TdEventKind, TdLevel } from './tdtypes.ts';

// ---------------------------------------------------------------- 克制表

/** 伤害类型：枪弹、炮弹、火、爆破 */
export type TdDamage = 'shot' | 'shell' | 'fire' | 'blast';
/** 护甲：布衣、重甲、木船、飞禽 */
export type TdArmor = 'cloth' | 'heavy' | 'wood' | 'air';

export const TD_DAMAGES: readonly TdDamage[] = ['shot', 'shell', 'fire', 'blast'];
export const TD_ARMORS: readonly TdArmor[] = ['cloth', 'heavy', 'wood', 'air'];

/**
 * 克制倍率（百分比，整数）：规则核心只认这一张表，界面原样显示。0 = 打不到（不能瞄准，不只是不掉血）。
 * 每种伤害克一类、怕一类；火克两类，代价是打不到飞的、怕重甲、射程最短。爆破对谁都一样（飞的除外）。
 */
export const COUNTER: Readonly<Record<TdDamage, Readonly<Record<TdArmor, number>>>> = {
  shot: { cloth: 100, heavy: 50, wood: 100, air: 150 },
  shell: { cloth: 100, heavy: 150, wood: 100, air: 0 },
  fire: { cloth: 150, heavy: 50, wood: 150, air: 0 },
  blast: { cloth: 100, heavy: 100, wood: 100, air: 0 },
};

/** 守岛里能造的塔（防御建筑里去掉海怪 kraken） */
export type TdTowerKind = 'cannon' | 'gunTower' | 'mortar' | 'flame' | 'harpoon' | 'rocket' | 'shock' | 'sniper';
export const TD_TOWER_KINDS: readonly TdTowerKind[] = ['cannon', 'gunTower', 'mortar', 'flame', 'harpoon', 'rocket', 'shock', 'sniper'];

export function isTdTowerKind(k: BuildingKind | string): k is TdTowerKind {
  return (TD_TOWER_KINDS as readonly string[]).includes(k);
}

/** 塔的伤害类型（固有，分叉不改；两条例外见 TD_BRANCH_DAMAGE） */
export const TD_TOWER_DAMAGE: Readonly<Record<TdTowerKind, TdDamage>> = {
  gunTower: 'shot',
  harpoon: 'shot',
  cannon: 'shell',
  mortar: 'shell',
  rocket: 'shell',
  flame: 'fire',
  shock: 'shell',
  sniper: 'shot',
};

/** 敌人的护甲（固有）。雾不是护甲，是状态（TdEnemyDef.fog 和雾区），要照亮才能瞄准 */
export const TD_ENEMY_ARMOR: Readonly<Record<TdEnemyKind, TdArmor>> = {
  sailor: 'cloth',
  sapper: 'cloth',
  ironclad: 'heavy',
  captain: 'heavy',
  skiff: 'wood',
  skiffling: 'wood',
  fog: 'wood',
  parrot: 'air',
  grenadier: 'cloth',
  shield: 'heavy',
  bosun: 'cloth',
  mate: 'cloth',
  medic: 'cloth',
  gunboat: 'wood',
  king: 'heavy',
  macaw: 'air',
};

/** 不是塔打出来的伤害：英雄普攻是枪弹；火药桶（地上的、英雄扔的）、地雷是爆破；燃烧弹、火油、火油坑留在地上的火是火 */
export const TD_HERO_DAMAGE: TdDamage = 'shot';
export const TD_KEG_DAMAGE: TdDamage = 'blast';
export const TD_MINE_DAMAGE: TdDamage = 'blast';
export const TD_BURN_DAMAGE: TdDamage = 'fire';

/**
 * 分叉卡上写明的例外（只有两条）：
 * - 火箭"高射"能打飞禽，按 airPct（100，不吃 1.5）；
 * - 臼炮"燃烧弹"留的火按"火"算（所有留火都按 TD_BURN_DAMAGE，这里写出来是为了界面在分叉卡上显示）。
 */
export const TD_BRANCH_DAMAGE: Readonly<Record<string, { airPct?: number; burn?: TdDamage }>> = {
  'rocket.flak': { airPct: 100 },
  'mortar.fire': { burn: 'fire' },
};

/** 一发伤害打到某种护甲的倍率（百分比）：先查分叉例外，再查 COUNTER。0 = 不能瞄准 */
export function counterPct(dmg: TdDamage, armor: TdArmor, branch: readonly string[] = []): number {
  if (armor === 'air') {
    for (const b of branch) {
      const ex = TD_BRANCH_DAMAGE[b]?.airPct;
      if (ex !== undefined) return ex;
    }
  }
  return COUNTER[dmg][armor];
}

/** 对某种护甲最克的伤害（敌人首次提示「X 打它多一半」用，tdhint.ts）：倍率最高的，平手按 TD_DAMAGES 的顺序，爆破不算（玩家造不出来） */
export function bestDamageVs(armor: TdArmor): TdDamage {
  let best: TdDamage = 'shot';
  for (const d of TD_DAMAGES) if (d !== 'blast' && COUNTER[d][armor] > COUNTER[best][armor]) best = d;
  return best;
}

// ---------------------------------------------------------------- 阶、驻守台、基地加成

/** 局内塔的阶：木台上造出来是 1 阶，升两次到 3 阶；3 阶选分叉 */
export type TdTier = 1 | 2 | 3;

/** 基地同类塔最高等级 → 驻守台上的阶：1–3 级 1 阶，4–6 级 2 阶，7–8 级 3 阶，再封顶到驻守台的 cap */
export function garrisonTier(baseLevel: number, cap: TdTier): TdTier {
  const t: TdTier = baseLevel >= 7 ? 3 : baseLevel >= 4 ? 2 : 1;
  return t < cap ? t : cap;
}

/** 基地加成：同类塔最高等级每级 +2% 伤害，封顶 +10% */
export const TD_BASE_BONUS = { perLevelPct: 2, maxPct: 10 } as const;
export function baseBonusPct(baseLevel: number): number {
  return Math.max(0, Math.min(TD_BASE_BONUS.maxPct, Math.floor(baseLevel) * TD_BASE_BONUS.perLevelPct));
}

/** 关卡写死的驻守台：2×2 左上角格子、能带进来的最高阶 */
export interface TdGarrisonSpot {
  x: number;
  y: number;
  cap: TdTier;
}

/** 开局玩家给一个驻守台挑的塔（界面只交 spot 和 kind；阶、分叉由 tdrun 按存档算，不信界面） */
export interface TdGarrisonPick {
  spot: number;
  kind: TdTowerKind;
}

/** 选塔面板的一项：基地里这种塔的最高等级、折出来的阶、带进来的分叉（基地那座已选的）、伤害加成 */
export interface TdGarrisonOption {
  kind: TdTowerKind;
  baseLevel: number;
  tier: TdTier;
  branch: string[];
  bonusPct: number;
}

/** 规则核心实际收到的驻守塔（tdrun 算好后放进 TdSetup.garrison） */
export interface TdGarrisonTower {
  spot: number;
  kind: TdTowerKind;
  tier: TdTier;
  branch: string[];
}

// ---------------------------------------------------------------- 关卡岛

/** 木台（2×2 左上角）。wreck：被沉船压着，清掉才能造（花钱立刻清，或英雄去打） */
export interface TdPadDef {
  x: number;
  y: number;
  wreck?: { hp: number };
}

/** 9 张关卡岛（A–I，见 content/td2maps.ts） */
export type TdMapId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K';
/** 战役第几章 */
export type TdChapterId = 1 | 2 | 3 | 4;

/**
 * 一张关卡岛：地形和路线固定，两关共用一张图（关卡在上面换波次、开局金、驻守台上限）。
 * layout 只放主寨、宝藏箱、墙、礁石、装饰（不放防御塔：塔都从木台和驻守台来）。
 * lanes 的下标就是 TdGroup.lane；落潮路固定是 lanes.length（和旧关卡一致），东边飞线也只是一条普通的登陆路，靠波次里放鹦鹉。
 */
export interface TdMapDef {
  id: TdMapId;
  name: string;
  layout: Placed[];
  lanes: Array<{ x: number; y: number }>;
  tide?: { x: number; y: number };
  fogZones?: Array<{ x: number; y: number; r: number }>;
  pads: TdPadDef[];
  garrison: TdGarrisonSpot[];
  kegs: Array<{ x: number; y: number }>;
  /** 水面格（第四章）：谁都走不过去（TdLevel.water） */
  water?: Array<{ x: number; y: number }>;
  /** 桥（只画，能走）：水道上留的口子铺木板 */
  bridges?: Array<{ x: number; y: number }>;
}

/**
 * 战役的一关（守岛 2.0）：就是一份 TdLevel（引擎照旧吃它）加上关卡岛的部分。
 * - hpPct 一律 100（类型里保留只为旧代码和大潮兼容；难度只来自 waveBudget、敌人种类、地图）；
 * - slots 写木台（TdPadDef，可带 wreck），obstacles 只放不压木台的装饰障碍（木桶等）；
 * - garrison 是驻守台（1–3 个），cap 是这一关的上限阶；
 * - index 是战役里的下标（0 起），进难度公式；bossExtra 是首领波前多给的倒数（拍，默认 TD2_BOSS_EXTRA_TICKS）。
 */
export interface TdIslandLevel extends TdLevel {
  index: number;
  map: TdMapId;
  chapter: TdChapterId;
  layout: Placed[];
  /** 桥（只画，能走，TdMapDef.bridges） */
  bridges?: Array<{ x: number; y: number }>;
  slots: TdPadDef[];
  garrison: TdGarrisonSpot[];
  bossExtra?: number;
}

// ---------------------------------------------------------------- 难度公式

/**
 * 第 levelIndex 关（0 起）第 wave 波（0 起）的预算点数：B关 × (1 + 0.1 × 波)，B关 = 底数 × 1.07^关。
 * 全程整数：B关逐关乘 levelPct / 100 取整，波次再乘 (100 + wavePct × 波) / 100。底数、两个百分比在 content/td2units.ts 的 TD2_BUDGET。
 * 每个敌人花多少点见 TD2_ENEMY_POINTS（等效血量 ÷ 最克它的倍率折的）。"海盗来袭"和大潮也用这条公式，levelIndex 换成各自的等效关。
 */
export function waveBudget(levelIndex: number, wave: number): number {
  let b: number = TD2_BUDGET.base;
  for (let i = 0; i < Math.max(0, Math.floor(levelIndex)); i++) b = Math.floor((b * TD2_BUDGET.levelPct) / 100);
  return Math.floor((b * (100 + TD2_BUDGET.wavePct * Math.max(0, Math.floor(wave)))) / 100);
}

// ---------------------------------------------------------------- 星数

/** 宝藏 20 枚不变：一枚没丢 3★，丢 ≤ 3 枚 2★，丢 ≤ 10 枚 1★，丢到 TD2_LOSE_AT 枚就结束、算输（0★） */
export const TD2_STAR_LOST: readonly [number, number] = [3, 10];
export const TD2_LOSE_AT = 11;

// ---------------------------------------------------------------- 模式

/**
 * campaign：战役各关（关卡岛 + 驻守台，算星）；
 * home：海盗来袭（自己的岛和布局，波次按预算现生成、一共 TD2_HOME.maxWaves 波，不算星、不进难度曲线，按撑住的波数给奖励，照每日上限）；
 * live：悬赏守岛；tide：大潮无尽；escort：护航（关卡带 escort 字段，escorttypes.ts）。
 */
export type TdMode = 'campaign' | 'home' | 'live' | 'tide' | 'escort';

/** 海盗来袭开局要的东西：玩家岛快照（布局、主寨、英雄）+ 波次生成参数 */
export interface TdHomeSnapshot {
  layout: Placed[];
  hq: number;
  hero: number;
}

export interface TdHomeGen {
  /** 难度公式里的等效关下标（按主寨等级查 TD2_HOME.levelByHq） */
  levelIndex: number;
  seed: number;
  /** 开局金、开局倒数、每波倒数 */
  gold: number;
  first: number;
  waveTicks: number;
  /** 按哪一版规则出波次（规则版本 10 起掷弹兵进波次池）；没写按 9（旧回放） */
  rules?: number;
  /** 加难档（规则版本 20，开局选）：没写 = 普通档，旧回放和普通档的生成参数逐位不变 */
  hard?: true;
}

/** 海盗来袭的结果：撑住几波、按波数折的奖励（已经按每日上限截过） */
export interface TdHomeReward {
  waves: number;
  /** 这一局是加难档（结算页、战绩写明，奖励比例高的原因） */
  hard: boolean;
  gold: number;
  wood: number;
  /** 今天上限截掉了多少（界面提示"今天的守岛收入已满"） */
  capped: boolean;
  /** 仓库装不下截掉了一部分 */
  full: boolean;
}

// ---------------------------------------------------------------- 预告和路线

/** 一路的一种敌人 */
export interface WaveEnemyPreview {
  kind: TdEnemyKind;
  armor: TdArmor;
  n: number;
  /** 雾船，或者这路经过雾区（要照亮） */
  fog: boolean;
}

/** 一波里的一条登陆路 */
export interface WaveLanePreview {
  /** 实际走的登陆路下标（落潮路 = lanes.length；涨潮时改走 0 号路的已经换算好） */
  lane: number;
  /** 这一路全是飞的：界面画虚线直飞，不画地面路线 */
  fly: boolean;
  enemies: WaveEnemyPreview[];
}

/** 一波的预告：倒数开始时显示下两波。机器人和界面拿同一份（tdPreview），机器人不再读 level.waves */
export interface WavePreview {
  /** 第几波（0 起） */
  wave: number;
  /** 这一波开打的拍：下一波 = s.next，再下一波按 waveTicks 推算；大潮里估不准时也照推算 */
  at: number;
  boss: boolean;
  /** 落潮路这一波开不开：没有落潮路为 null */
  tide: boolean | null;
  lanes: WaveLanePreview[];
  /** 各护甲的等效血量占比（百分比，四项加起来约 100） */
  armorShare: Record<TdArmor, number>;
  /** 关卡写的补充（写不进图标的事），没有为 undefined */
  note?: string;
  /** 护航：这一波先头敌人和商船按当前船速推算在航线哪一格相遇（航线下标，追不上 -1）；只读提示，规则不用 */
  meet?: number;
  /** 关内事件（规则版本 22）：这一波发生什么；战书波另写接没接（dare，接了的敌人个数已经按多出来的算） */
  event?: TdEventKind;
  dare?: boolean;
}

/** 一条登陆路到宝藏箱的路线（格子下标序列，grid.ts 的 cellIdx），墙被打破、修好时重算 */
export interface TdRouteLine {
  lane: number;
  x: number;
  y: number;
  cells: number[];
  /** 落潮路 */
  tide: boolean;
  /** 现在开着（落潮路关着时 false，界面画淡） */
  open: boolean;
}

// ---------------------------------------------------------------- 新命令和事件

/**
 * 守岛 2.0 新增的命令（并进 TdAction）：
 * - sell：卖木台上的塔，退已花金币的 TD2_ECON.sellPct%，木台下一拍空出来（驻守台上的塔也能卖，退按"同阶木台塔的花费"算）；
 * - clearNow：花 TD2_ECON.clearGold 金立刻清掉压木台的沉船（英雄去打仍用旧的 clear，打完给 TD2_ECON.heroClearGold）；
 * - barricade：英雄技能 1"拒马"，x、y 是单位（和 move、keg 一样），落在那一格（格子中心离英雄 TD2_HERO_SKILL.barricade.range 内、能走的空地）；
 *   挡住以它为中心的 3×3 格，地面敌人要走进来就停下砸；
 * 英雄技能 2"炸药桶"沿用旧命令 keg（伤害改成相对值、按爆破算）；号令改成被动，旧命令 rally 在规则版本 7 里不做事。
 */
export type Td2Action =
  | { t: number; type: 'sell'; slot: number }
  | { t: number; type: 'clearNow'; id: number }
  | { t: number; type: 'barricade'; x: number; y: number }
  /** 潮汐水闸（规则版本 16）：关上 / 重新打开还没开打的下一波（s.wave）的落潮路 */
  | { t: number; type: 'sluice' }
  /** 漂流补给箱（规则版本 16）：叫英雄去捡这个箱子，捡到后回原来的守点 */
  | { t: number; type: 'pickup'; id: number }
  /** 岸防老炮（规则版本 16）：往 (x, y)（单位）打一发 */
  | { t: number; type: 'battery'; x: number; y: number }
  /** 友军巡航船（规则版本 19）：叫船（冷却好了、不在海上时才有用） */
  | { t: number; type: 'fleet' }
  /** 锚钩（规则版本 20）：钩住编号 id 的敌人往英雄这边拉 */
  | { t: number; type: 'hook'; id: number }
  /** 战书（规则版本 22）：接下 / 退掉还没开打的下一波（s.wave）的战书 */
  | { t: number; type: 'dare' }
  /** 航海士（规则版本 23）的急射旗：插在 (x, y)（单位），圈里的塔（木台塔、驻守台都算）打得快 */
  | { t: number; type: 'flag'; x: number; y: number }
  /** 航海士的重赏：圈的中心 (x, y)（单位） */
  | { t: number; type: 'reward'; x: number; y: number };

/** 守岛 2.0 新增的事件（并进 TdEvent） */
export type Td2Event =
  | { type: 'sell'; slot: number; refund: number }
  | { type: 'cleared'; id: number; slot: number; paid: boolean; gold: number }
  | { type: 'barricade'; id: number; x: number; y: number; until: number }
  | { type: 'barricadeBreak'; id: number }
  /** 地上的宝藏没人捡，自己滚回箱子 */
  | { type: 'roll'; x: number; y: number; n: number }
  /** 地雷重新埋好 */
  | { type: 'rearm'; id: number }
  /** 水闸关上（shut）或重新打开了第 wave 波的落潮路，还剩 left 次 */
  | { type: 'sluice'; wave: number; shut: boolean; left: number }
  /** 补给箱漂来（drift，until 拍漂走）、被英雄捡到（pick，给了 gold 局内金、技能好了）、没人捡漂走了（gone）；x、y 是单位 */
  | { type: 'crate'; what: 'drift' | 'pick' | 'gone'; id: number; x: number; y: number; until: number; gold: number }
  /** 老炮开了一炮：从炮台 (x0, y0) 打向 (x1, y1)，t1 拍落地（落地另有 explode 事件），冷却到 ready 拍 */
  | { type: 'battery'; x0: number; y0: number; x1: number; y1: number; t1: number; ready: number }
  /** 第四章（规则版本 18）：炮艇往一座塔打了一炮（塔同时有 jam 事件）、炮艇开走了、军医回了一次血 */
  | { type: 'shell'; id: number; tower: number; x0: number; y0: number; x1: number; y1: number }
  | { type: 'sail'; id: number }
  | { type: 'heal'; id: number }
  /** 规则版本 19：友军船来了（come，冷却到 ready 拍）、开了一炮（shot，从船打向 (x1, y1)，t1 拍落地）、开走了（go）；x、y 是船此刻的位置（单位） */
  | { type: 'fleet'; what: 'come' | 'shot' | 'go'; x: number; y: number; x1: number; y1: number; t1: number; ready: number }
  /** 海盗王放下一船人（drop）、叫来护航（escort）；x、y 是它的位置 */
  | { type: 'king'; what: 'drop' | 'escort'; id: number; x: number; y: number }
  /**
   * 锚钩（规则版本 20）：英雄从 (x0, y0) 把钩子甩到敌人 id 的 (x1, y1)，t1 拍钩上；之后每 perCell 拍拖一格，path 是一格格的落点（单位，格中心），
   * 拖到最后一格后定到 until 拍；path 为空 = 钩上了但第一格就被挡住，只定住。ready 是下次能放的拍
   */
  | { type: 'hook'; id: number; x0: number; y0: number; x1: number; y1: number; t1: number; path: number[]; until: number; ready: number }
  /** 赏金船（规则版本 22）：上岸（come）、被打倒给了 gold 局内金（paid）、跑掉了（gone）；x、y 是它此刻的位置（单位） */
  | { type: 'bounty'; what: 'come' | 'paid' | 'gone'; id: number; x: number; y: number; gold: number }
  /** 战书（规则版本 22）：第 wave 波的战书接下（on）或退掉 */
  | { type: 'dare'; wave: number; on: boolean }
  /** 航海士（规则版本 23）：急射旗插在 (x, y)、重赏圈中心 (x, y)，半径 r（单位），都到 until 拍；ready 是这个技能下次能放的拍 */
  | { type: 'flag'; x: number; y: number; r: number; until: number; ready: number }
  | { type: 'reward'; x: number; y: number; r: number; until: number; ready: number };

/** 场上的拒马（x、y 是格子坐标，事件 barricade 里的也是）：挡住周围 3×3 格的地面敌人，血掉光或到时间就没了 */
export interface TdBarricade {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  until: number;
}
