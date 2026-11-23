/**
 * 一局的全部状态（DESIGN.md 5.1）：怪、子弹、掉落物用定长的并列数组，空位用空闲表复用，热路径不分配对象。
 * `step` 原地修改这里的东西（主线批准的例外，见模块 AGENTS.md 第 3 节）。
 */
import { LIVE_EASE, RAID_MAX_DANGER, type Danger, type WaveEvent } from '../content/waves.ts';
import { CHAR_FX, CHARACTERS, CURSE_IDS, KIT_FX, KIT_IDS, MAX_CURSES, PERK_FX, PERKS, type CharacterId, type CurseId, type KitId, type PerkId, CHARACTER_IDS } from '../content/meta.ts';
import { isWeeklyId, type WeeklyId } from '../content/weekly.ts';
import { isTrialId, TRIALS, type TrialDef, type TrialId } from '../content/trials.ts';
import { MAPS, type Block, type MapId, type Rect } from '../content/maps.ts';
import { PICKS } from '../content/picks.ts';
import { MAX_WEAPONS, MERGE_STAGE, MERGES, type MergeDef, type PassiveId, type WeaponId, type WeaponStats } from '../content/weapons.ts';
import { ARENA, PLAYER } from '../content/player.ts';
import { Events } from './events.ts';
import { Rng } from './rng.ts';
import { raidHooks, type RaidPort } from './raid-port.ts';
import type { RaidSetup } from './raid-host.ts';
import { BlockIndex, type RaidBlock } from './blocks.ts';
import { rushPlan, type RushPlan } from './rush.ts';
import { altStart, mainSchools } from '../content/pools.ts';
import type { SchoolId } from '../content/guide.ts';
import { ArmsState } from './arms/state.ts';
import { FoeState } from './foes/state.ts';

export const RULES_VERSION = 76;
export { TICKS_PER_SECOND } from '../content/clock.ts';
/**
 * 刷怪的一圈：刚好在屏幕外（横屏一屏约 1000 × 560 到 1080 × 500 单位，画面层 viewport.ts 的 worldZoom），
 * 椭圆横向宽；竖屏开的局（setup.tall）转 90°，纵向宽。放在这里而不是 step.ts：画面层要读它，不能为一个常量把整个 step 拉进首屏
 */
export const RING = { long: 600, short: 360 };

export const MAX_ENEMIES = 300;
/** 法器格最多几个：6 个，每合成一次空出一个（合成以后两件都还在出手） */
export const WEAPON_SLOTS = MAX_WEAPONS + MERGES.length;
export const MAX_SHOTS = 400;
export const MAX_DROPS = 400;
/** 场上可碰碎的摆设（灯笼架、纸扎）最多几个 */
export const MAX_PROPS = 48;

/** 子弹种类 */
export const Shot = {
  Talisman: 1,
  Coin: 2,
  Fly: 3,
  /** 敌人的：灯笼鬼的火球、尸王的尸气；sState 1 = 雪魅的冰锥（打中走路变慢），2 = 纸扎老爷的纸钱（旋着飞，sIdx 是第几圈） */
  Fireball: 4,
  /** 八卦镜的光波：sR 是当前半径（开始是负的 = 还没放出来），sDist 是推到多远 */
  Wave: 5,
  /** 桃花雨的一片花瓣：sLife 拍后落地 */
  Petal: 6,
  /** 纸鹤：sState 0 盘旋 1 俯冲（sLife 是还要飞几拍）2 飞回 */
  Crane: 7,
  /** 三昧真火留在地上的火：sLife 拍后灭 */
  Burn: 8,
  /** 纸兵：走去顶住最近的怪，sLife 是还能活几拍（贴身挨打折寿），sDist 是火兵下次点火还差几拍 */
  Paper: 9,
  /** 寒泉：地上的一眼泉，sR 半径、sLife 还剩几拍、sState 1 = 进化（玄冥寒潭） */
  Spring: 10,
  /** 龙王令的浪：直线走，sR 浪头半径、sLife 还要走几拍；sState 0 往外推 1 卷回来（翻江倒海） */
  Tide: 11,
  /** 符师技能「万符齐发」的一张符：sIdx 是盯着的怪的槽位（-1 = 没盯），不属于任何法器（sSlot = -1） */
  SkillFu: 12,
} as const;
export type Shot = (typeof Shot)[keyof typeof Shot];

/** 掉落种类 */
export const Drop = {
  Soul: 1,
  Coin: 2,
  Bun: 3,
  Scroll: 4,
  Chest: 5,
  /** 符咒炸弹：捡到时附近的小怪全倒，精英和 Boss 掉一截血 */
  Bomb: 6,
  /** 铜钱袋：一次给一把铜钱 */
  Purse: 7,
} as const;
export type Drop = (typeof Drop)[keyof typeof Drop];

/** 一件拿在手上的法器 */
export interface OwnedWeapon {
  id: WeaponId;
  level: number;
  evolved: boolean;
  /** 离下次出手还有几拍 */
  timer: number;
  /** 这一局打出的伤害和击杀（结算页用） */
  dmg: number;
  kills: number;
  /** 铜钱：这一轮还转几拍；飞剑：轮到第几把出手 */
  phase: number;
  /** 铜钱：绕身的角度（方向表下标） */
  angle: number;
}

/** 汇总后的主角加成（被动改变时重算） */
export interface Stats {
  might: number;
  cdMul: number;
  areaMul: number;
  amount: number;
  speed: number;
  magnet: number;
  armor: number;
  hpMax: number;
  regen: number;
  /** 黄历：暴击、宝箱多给、好卡的概率加成（0.1 一级） */
  luck: number;
  /** 灵芝、引魂灯：经验倍数 */
  xpMul: number;
  /** 引魂灯：铜钱多给的概率 */
  coinBonus: number;
  /** 墨斗：持续倍数（火、绳、铜钱、护盾回层） */
  durMul: number;
  /** 引魂灯的级数（怪多、怪快） */
  curse: number;
  /** 捆仙绳：捆住的挨打加倍 */
  bindDouble: boolean;
  /** 剑 2 件：暴击率另加；剑 3 件：暴击伤害另加 */
  critAdd: number;
  critDmg: number;
  /** 镇 3 件：靠近主角的怪减速 */
  nearSlow: boolean;
}

/** 三选一时除了选第几张以外的操作（step 的 choice 参数） */
export const Pick = {
  Reroll: 100,
  /** + 第几张 */
  Ban: 200,
  Skip: 300,
} as const;

export interface Choice {
  kind: 'weapon' | 'passive' | 'coins';
  id: WeaponId | PassiveId | 'coins';
}

export interface Setup {
  seed: number;
  /** 守夜 / 夜探 */
  mode: 'vigil' | 'raid';
  /** 夜探的模板和实盘档（mode 为 raid 时必有；种子和危险档以上面的为准） */
  raid?: Omit<RaidSetup, 'seed' | 'danger'>;
  /** 危险档 0–5（DESIGN.md 13.2） */
  danger: Danger;
  /** 这台设备上的第一局：3 分钟前不会死（DESIGN.md 13.2） */
  firstRun?: boolean;
  /** 新号前 NOVICE.runs 局（存档 runs 小于它）开的娱乐守夜：开局魂火磁吸放大、怪从前方来（content/player.ts NOVICE）；只有 noviceAssist 为真时留着 */
  novice?: boolean;
  /** 地图（缺省雪原） */
  map?: MapId;
  /** 角色（缺省小道士；实盘可选已解锁的，结回乘角色系数） */
  character?: CharacterId;
  /** 咒印，最多 MAX_CURSES 条（实盘为空） */
  curses?: readonly CurseId[];
  /** 永久加成的等级（实盘为空） */
  perks?: Partial<Record<PerkId, number>>;
  /** 连死以后开的"降低伤害"（成绩不进总榜） */
  assist?: boolean;
  /** 无尽：天亮不收工，一直打到倒下 */
  endless?: boolean;
  /**
   * 模拟器的对照臂：双修条件满足了也不合（宝箱照常给进化或升级）。只给 tools/sim.ts 量双修的净强度用，
   * 界面不开、录像和存档里不会有（缺省 false，不改变任何正常对局）
   */
  noDual?: boolean;
  /**
   * 实盘局（platform/live.ts liveSetup 写）：卡池和娱乐局一样按角色法器池；实盘守夜中档以上降难度（World.liveEase），不开本周夜事
   */
  live?: boolean;
  /**
   * 法器池按这个 id 算（content/pools.ts），缺省 = 角色。只给模拟器用：新角色还没加进来之前量幽冥、聚财；
   * 'all' = 不限池（量新法器稀释老流派用）。界面不开、录像和存档里不会有
   */
  pool?: CharacterId | 'all';
  /**
   * 竖屏开的局：刷怪圈转 90°（纵向远、横向近）。竖屏看得见的世界是竖长条，横屏那圈的上下两边会落在屏幕里，
   * 怪凭空冒出来（10-20）。开局按屏幕定、录进录像，转屏不改（缺省 false = 横屏那圈）
   */
  tall?: boolean;
  /**
   * 本周夜事（content/weekly.ts）：只在「本周夜事」挑战（online/weekly.ts 的 weeklyPlan）里有，录进录像；
   * 没有这个字段 = 不开（普通守夜、旧录像、实盘、夜探、每日挑战都是这样，normalizeSetup 会把不该有的去掉）
   */
  weekly?: WeeklyId;
  /**
   * 首领连战（DESIGN.md 2.5，只在守夜下有效）：开局按种子给一套构筑，精英和首领一关一关上，打完或 5 分钟收工。
   * 构筑和关卡都从种子算（core/rush.ts），录像照常重放
   */
  rush?: boolean;
  /**
   * 开局配置 A：起手法器换成「另一主修流派的核心件」（content/pools.ts altStart），而不是角色自己的起手件。
   * 只有 true 有意义；首领连战不开（排行榜局人人一样），normalizeSetup 会把别的值和不该有的去掉
   */
  startAlt?: boolean;
  /**
   * 开局配置 B：心法 = 选一个本角色的主修流派（content/pools.ts mainSchools），
   * 这个流派单子上的法器卡和被动卡在升级三选一里权重 ×XINFA_MUL。不在主修里的值 normalizeSetup 会删掉
   */
  xinfa?: SchoolId;
  /** 局前锦囊（content/meta.ts KITS）：娱乐局才有，实盘、连战、本周夜事丢掉 */
  kits?: readonly KitId[];
  /**
   * 试炼（content/trials.ts，docs/design-play.md 2.6）：人人一样的固定关。normalizeSetup 按表展开模式、地图、角色、危险、咒印、夜事，
   * 玩家自己的加成、锦囊、开局配置、降低伤害都去掉；种子照常每局随机
   */
  trial?: TrialId;
}

/** 新手照顾生效的局：只给娱乐守夜，实盘、试炼、首领连战、本周夜事、夜探都不开（每日挑战的固定配置不带 novice，online/daily.ts isDailySetup 也拒掉） */
export function noviceAssist(s: Setup): boolean {
  return s.novice === true && s.mode === 'vigil' && !s.live && s.trial === undefined && !s.rush && s.weekly === undefined;
}

/** 试炼展开：表里定的盖掉传进来的，玩家自己的东西都不带（实盘、连战不开试炼） */
function expandTrial(s: Setup): Setup {
  if (s.trial === undefined) return s;
  if (!isTrialId(s.trial) || s.live || s.rush) {
    const rest = { ...s };
    delete rest.trial;
    return rest;
  }
  const t = TRIALS[s.trial];
  const out: Setup = { seed: s.seed, mode: t.mode, danger: t.danger, map: t.map, character: t.character, curses: t.curses ?? [], perks: {}, trial: t.id };
  if (t.raid) out.raid = { template: t.raid };
  if (t.weekly) out.weekly = t.weekly;
  if (s.tall) out.tall = true;
  return out;
}

/** 整理开局设置：咒印去重、截到上限，加成等级截到表里的最高级（录像和存档里来的数据不一定干净） */
export function normalizeSetup(raw: Setup): Setup {
  const s = expandTrial(raw);
  const curses = CURSE_IDS.filter((c) => s.curses?.includes(c)).slice(0, MAX_CURSES);
  const perks: Partial<Record<PerkId, number>> = {};
  for (const [id, lv] of Object.entries(s.perks ?? {}) as [PerkId, number][]) {
    if (!(id in PERKS)) continue;
    const n = Math.max(0, Math.min(PERKS[id].cost.length, Math.floor(lv)));
    if (n > 0) perks[id] = n;
  }
  const character = s.character && s.character in CHARACTERS ? s.character : 'xiaodao';
  // 守夜到噩梦 3（危险 8），夜探最高到 5
  const danger = (Math.max(0, Math.min(s.mode === 'raid' ? RAID_MAX_DANGER : 8, Math.floor(s.danger))) || 0) as Danger;
  const out = { ...s, danger, character, curses, perks };
  // 本周夜事只给守夜：实盘、夜探不开（每日挑战的 Setup 本来就不带它，isDailySetup 也核了）
  if (out.weekly !== undefined && (!isWeeklyId(out.weekly) || out.mode !== 'vigil' || out.live)) delete out.weekly;
  if (out.novice !== undefined && !noviceAssist(out)) delete out.novice;
  // 开局配置：A 只认 true；B 只认本角色的主修流派；首领连战要人人一样，两个都不开
  if (out.startAlt !== true || out.rush) delete out.startAlt;
  const pc = (CHARACTER_IDS as readonly string[]).includes(character) ? (character as CharacterId) : undefined;
  if (out.xinfa !== undefined && (out.rush || !pc || !mainSchools(pc).includes(out.xinfa))) delete out.xinfa;
  // 锦囊：只认表里的、不重复；实盘、连战、本周夜事要人人一样，不带
  const kits = KIT_IDS.filter((k) => s.kits?.includes(k));
  if (kits.length && !out.live && !out.rush && out.weekly === undefined) out.kits = kits;
  else delete out.kits;
  return out;
}

/** 心法特色的每拍状态（core/xinfa.ts 读写） */
export class XinfaState {
  /** 连续站定 / 连续走动了几拍 */
  still = 0;
  move = 0;
  /** 层数：符潮 = 身边怪数换算的层，雷动 = 走动攒的层，财运 = 捡铜钱攒的层 */
  stack = 0;
  /** 财运：上一次捡铜钱的拍 */
  coinAt = 0;
  /** 同袍：场上纸兵数；阵眼：这一拍站在自己的阵里 */
  papers = 0;
  inZone = false;
  /** 燎原：这一拍要炸的火星（x, y, 伤害）三个一组，xinfaSplash 结算后清空 */
  readonly splash: number[] = [];
}

export class World {
  readonly setup: Setup;
  /** 试炼的关（Setup.trial 展开后）；不是试炼为 null */
  readonly trial: TrialDef | null;
  /** 夜探的状态（宝箱、门、背包、守卫）；守夜为 null */
  readonly raid: RaidPort | null;
  /** 场地大小：守夜 ARENA，夜探按镇子 */
  readonly arenaW: number;
  readonly arenaH: number;
  tick = 0;
  /** 起手法器：开局配置 A（startAlt）开了就是另一主修的核心件，否则是角色自己的起手件 */
  get startWeapon(): WeaponId {
    const id = this.setup.character ?? 'xiaodao';
    return this.setup.startAlt ? altStart(id) : CHARACTERS[id].start;
  }
  /** 心法（开局配置 B） */
  get xinfa(): SchoolId | undefined {
    return this.setup.xinfa;
  }
  /** 这个搭配效果的强度：初成按 MERGE_STAGE.halfPower，大成 1。每个搭配效果里的数都乘它 */
  mergePower(id: MergeDef['id']): number {
    return this.mergeHalf.length > 0 && this.mergeHalf.includes(id) ? MERGE_STAGE.halfPower : 1;
  }
  /** 空出法器格的搭配数：初成不算（大成才空格） */
  get fullMerges(): number {
    return this.merges.length - this.mergeHalf.length;
  }
  /** 实盘降难度（LIVE_EASE）：实盘守夜中档以上 */
  get liveEase(): boolean {
    return !!this.setup.live && this.setup.mode === 'vigil' && this.setup.danger >= LIVE_EASE.fromDanger;
  }
  /** play：在打；choose：等升级三选一；over：结束 */
  phase: 'play' | 'choose' | 'over' = 'play';
  won = false;
  bossKilled = false;
  /** 这张图的中期首领倒了（试炼「限时打倒首领」看它） */
  midKilled = false;
  kills = 0;
  coins = 0;
  /** 铜钱从哪来的（结算页列来源用，只记不影响规则）：地上捡的、铜钱袋、摆设、宝箱 */
  readonly coinBy = { drop: 0, purse: 0, prop: 0, chest: 0, weekly: 0 };
  /**
   * 带出局外的铜钱要扣掉的部分（只记不影响规则，platform/save.ts carryCoins）：招财进宝多掉的那枚铜钱捡到了几枚（货郎一局上万枚，
   * 只在局里用：夜市、讨价、补刷新），局里花掉了几枚（夜市、鬼市，先算花的是招财进宝的钱）
   */
  coinFortune = 0;
  coinSpent = 0;
  /** 货郎（规则 61）：捡到的铜钱攒到这个数补一次刷新，补完往后加 CHAR_FX.huolangRerollEvery */
  rerollAt = CHAR_FX.huolangRerollEvery;
  /** 开过几个宝箱、一共升了几件；碰碎几个摆设（结算页用） */
  chests = 0;
  chestUps = 0;
  propsBroken = 0;

  // 随机数，按用途分流
  readonly rSpawn: Rng;
  readonly rDrop: Rng;
  readonly rUp: Rng;
  readonly rChest: Rng;
  readonly rAi: Rng;
  readonly rHit: Rng;
  readonly rWeapon: Rng;
  readonly rProp: Rng;
  /** 跳过的随机小奖（单独一路，不动别的随机） */
  readonly rSkip: Rng;
  /** 守夜夜市摆什么货、摊在哪个方向 */
  readonly rMarket: Rng;

  // 主角
  x = ARENA.w / 2;
  y = ARENA.h / 2;
  px = this.x;
  py = this.y;
  hp = PLAYER.hp;
  /** 面朝方向（方向表下标），一开始朝右 */
  face = 0;
  moving = false;
  invuln = 0;
  /** 最后一下是谁打的（模拟器死因统计用，不进指纹） */
  hurtBy = -1;
  level = 1;
  xp = 0;
  /** 攒着还没选的升级次数 */
  pendingLevels = 0;
  /** 其中来自夜探宝箱的（先选这些；选卡标题写「宝箱」） */
  chestPicks = 0;
  /** 夜探宝气（伤害加成），和 raid.boost 同步，变了重算数值 */
  raidBoost = 0;
  choices: Choice[] = [];
  weapons: OwnedWeapon[] = [];
  /** 每件法器算上被动以后的数值（和 weapons 同下标；法器或被动变了就重算） */
  wstats: WeaponStats[] = [];
  passives: Partial<Record<PassiveId, number>> = {};
  stats: Stats;
  /** 金钟罩：还能挡几下、最多几下；碎了的那一拍记一笔，下一拍出手时震开 */
  shield = 0;
  shieldMax = 0;
  shieldBurst = false;
  /** 凑成的套装（显示用）：比如 剑2、金3 */
  sets: string[] = [];
  /** 刷新、封禁还剩几次；封禁掉的（不再出现在三选一里） */
  rerolls = 2;
  bans = 1;
  /** 跳过抽中"下次多一张卡"：下一次升级多给一张（不叠加） */
  bonusCard = 0;
  /** 夜市求签买下后：下一次升级必出这个搭配（MERGES 的下标）缺的料；-1 = 没有（规则 60） */
  omen = -1;
  /** 守夜夜市（content/market.ts）：第几次（0、1 是还没开的那次，2 = 都开过了）、这次的阶段 0 没到 / 1 预告 / 2 开着 */
  mkIndex = 0;
  mkPhase = 0;
  /** 这次收市的拍 */
  mkEnd = 0;
  /** 这一局夜市一共买了几样（解锁货郎用；不进指纹） */
  mkBuys = 0;
  /** 三个摊：位置、货（MARKET_GOODS 的序号）、价格、卖掉没有 */
  readonly mkX: number[] = [];
  readonly mkY: number[] = [];
  readonly mkGood: number[] = [];
  readonly mkPrice: number[] = [];
  readonly mkSold: number[] = [];
  /** 正站在哪一摊前（-1 没有）、站了几拍 */
  mkStall = -1;
  mkHold = 0;
  /** 夜市买的临时增益到哪一拍 */
  mightUntil = 0;
  speedUntil = 0;
  banned: (WeaponId | PassiveId)[] = [];
  /** 合成了哪几个（MergeDef.id） */
  merges: MergeDef['id'][] = [];
  /** 两段式合成：merges 里还在「初成」的那些（效果按 MERGE_STAGE.halfPower 打折、不空法器格），升了大成就移出去 */
  mergeHalf: MergeDef['id'][] = [];
  /** 规则 57：只掉单件宝箱的精英（1:45 那只）的格子号；格子被别的怪占用时清掉 */
  smallElites: number[] = [];
  /** 规则 68：危险档多出来的那只精英（eliteExtra）的格子号，倒下不掉宝箱（不然高档精英多、宝箱多，反而好过）；格子被别的怪占用时清掉 */
  bareElites: number[] = [];
  /** 2.0 法器第一批（阵旗、勾魂锁、竹篙、长明灯）的阵、灯、水痕和按怪记的状态，逻辑在 core/arms/ */
  readonly arms = new ArmsState(MAX_ENEMIES);
  readonly xf = new XinfaState();
  /** 往生铃：光环半径（这一拍），光环里的怪死了回血；下次能回血的拍 */
  bellArea = 0;
  /** 挡路的东西（地图上的墙、棺材） */
  /** 挡路的块：守夜是地图的，夜探是镇子生成的（推挤走 raid.map.index，分桶） */
  blocks: readonly (Block | RaidBlock)[];
  /** 地图的全部块（竹子倒了 blocks 里就没有它，这里还在）和每块的血（不会倒的是 Infinity）、上次受伤的拍；没有竹子时 blockHp 为空 */
  readonly allBlocks: readonly Block[];
  readonly blockHp: Float64Array;
  readonly blockAt: Int32Array;
  /** 地形：水区、冰区（夜探没有） */
  /** 块多的守夜图（竹林）也走分桶的索引，竹子倒了重建 */
  index: BlockIndex | null = null;
  readonly water: readonly Rect[];
  readonly ice: readonly Rect[];
  /** 香火区（荒庙） */
  readonly incense: readonly Rect[];
  /** 火区（乱葬岗的磷火地、窑镇的窑口；core/fire.ts） */
  readonly fire: readonly Rect[];
  /** 主角这一拍在不在香火区里（每拍开头按位置算，画面层拿来亮光圈） */
  inIncense = false;
  /** 主角在冰上的速度（冰上才用；离开冰面就按输入直接走） */
  pvx = 0;
  pvy = 0;
  /** 怪在冰上的速度 */
  readonly eVX = new Float64Array(MAX_ENEMIES);
  readonly eVY = new Float64Array(MAX_ENEMIES);
  /** 冰锥、水鬼：到这一拍之前主角走路变慢 */
  slowUntil = 0;
  /** 画皮的缠丝：到这一拍之前主角走路再乘 HUAPI.silkSlow（画皮每拍在圈里就续上） */
  silkUntil = 0;
  /** 2.0 首领留在地上的圈、竹浪、冰风、浮冰等（core/foes/） */
  readonly foe = new FoeState();
  /** 收获期：到这一拍之前少刷怪、多掉东西 */
  calmUntil = 0;
  /** 受伤补偿：下一个补偿肉包最早在这一拍 */
  mercyAt = 0;
  bellHealAt = 0;
  /** 回血的零头（每拍加一点，满 1 才加到血上，免得血量出现很长的小数） */
  regenAcc = 0;

  // 怪
  readonly eAlive = new Uint8Array(MAX_ENEMIES);
  readonly eGen = new Uint32Array(MAX_ENEMIES);
  readonly eKind = new Uint8Array(MAX_ENEMIES);
  readonly eX = new Float64Array(MAX_ENEMIES);
  readonly eY = new Float64Array(MAX_ENEMIES);
  readonly ePX = new Float64Array(MAX_ENEMIES);
  readonly ePY = new Float64Array(MAX_ENEMIES);
  /** 击退速度（每拍衰减） */
  readonly eKX = new Float64Array(MAX_ENEMIES);
  readonly eKY = new Float64Array(MAX_ENEMIES);
  readonly eHp = new Float64Array(MAX_ENEMIES);
  readonly eHpMax = new Float64Array(MAX_ENEMIES);
  readonly eSpeed = new Float64Array(MAX_ENEMIES);
  readonly eDmg = new Float64Array(MAX_ENEMIES);
  readonly eR = new Float64Array(MAX_ENEMIES);
  /** 个体的大小差别（0.9–1.1，画面按它缩放，碰撞半径也乘它） */
  readonly eSize = new Float64Array(MAX_ENEMIES);
  /** 行为计时（跳尸的跳、灯笼的火球、狐妖的冲刺、将军的召唤、尸王的技能） */
  readonly eT = new Int32Array(MAX_ENEMIES);
  /** 行为状态 */
  readonly eS = new Int32Array(MAX_ENEMIES);
  /** 行为参数（狐妖冲刺方向、尸王落点） */
  readonly eAX = new Float64Array(MAX_ENEMIES);
  readonly eAY = new Float64Array(MAX_ENEMIES);
  /** 行为里的速度（尸王跳砸这一跳每拍走多远） */
  readonly eV = new Float64Array(MAX_ENEMIES);
  /** 最近一次挨打的拍和法器槽（连锁雷找"还没劈过的"） */
  readonly eLastHit = new Int32Array(MAX_ENEMIES);
  readonly eLastBy = new Int8Array(MAX_ENEMIES);
  /** 被缚妖索捆到第几拍（大于当前拍就走不动） */
  readonly eBind = new Int32Array(MAX_ENEMIES);
  /** 符剑合璧：身上的符几拍炸（0 = 没贴）；marks 是现在贴着几张，没有时不用扫 */
  readonly eMark = new Int32Array(MAX_ENEMIES);
  marks = 0;
  /** Boss 打到第几段（0 起） */
  readonly ePhase = new Uint8Array(MAX_ENEMIES);
  /** 在镇魂铃光环里：这一拍减速 */
  readonly eSlow = new Uint8Array(MAX_ENEMIES);
  /** 同一件法器连着打同一只的冷却：[怪 × 法器槽] = 下次能打的拍数 */
  readonly eHitAt = new Int32Array(MAX_ENEMIES * WEAPON_SLOTS);
  eCount = 0;

  // 子弹
  readonly sAlive = new Uint8Array(MAX_SHOTS);
  readonly sGen = new Uint32Array(MAX_SHOTS);
  readonly sKind = new Uint8Array(MAX_SHOTS);
  readonly sX = new Float64Array(MAX_SHOTS);
  readonly sY = new Float64Array(MAX_SHOTS);
  readonly sPX = new Float64Array(MAX_SHOTS);
  readonly sPY = new Float64Array(MAX_SHOTS);
  readonly sVX = new Float64Array(MAX_SHOTS);
  readonly sVY = new Float64Array(MAX_SHOTS);
  readonly sLife = new Int32Array(MAX_SHOTS);
  readonly sDmg = new Float64Array(MAX_SHOTS);
  readonly sR = new Float64Array(MAX_SHOTS);
  /** 还能穿几只（符咒）；飞剑的状态（0 待命 1 飞出 2 飞回） */
  readonly sState = new Int32Array(MAX_SHOTS);
  /** 属于哪个法器槽；飞剑、铜钱是第几把 */
  readonly sSlot = new Int8Array(MAX_SHOTS);
  readonly sIdx = new Int16Array(MAX_SHOTS);
  /** 飞了多远（飞剑） */
  readonly sDist = new Float64Array(MAX_SHOTS);
  sCount = 0;

  // 掉落物
  readonly dAlive = new Uint8Array(MAX_DROPS);
  readonly dGen = new Uint32Array(MAX_DROPS);
  readonly dKind = new Uint8Array(MAX_DROPS);
  readonly dX = new Float64Array(MAX_DROPS);
  readonly dY = new Float64Array(MAX_DROPS);
  readonly dPX = new Float64Array(MAX_DROPS);
  readonly dPY = new Float64Array(MAX_DROPS);
  readonly dVal = new Float64Array(MAX_DROPS);
  /** 铜钱：1 = 招财进宝多掉的那枚（只记账，见 coinFortune） */
  readonly dLuck = new Uint8Array(MAX_DROPS);
  /** 被吸着走：速度 */
  readonly dPull = new Float64Array(MAX_DROPS);
  dCount = 0;
  /** 地上的魂珠数（超过上限就合并） */
  soulCount = 0;

  // 摆设（守夜才有）：走过去碰碎，掉吃的、铜钱、磁符、炸弹
  readonly pAlive = new Uint8Array(MAX_PROPS);
  readonly pGen = new Uint32Array(MAX_PROPS);
  readonly pKind = new Uint8Array(MAX_PROPS);
  readonly pX = new Float64Array(MAX_PROPS);
  readonly pY = new Float64Array(MAX_PROPS);
  /** 下次在主角附近补摆设的拍数 */
  propAt = 0;

  // 刷怪
  spawnAcc = 0;
  /** 这一局的定点事件（按危险档、咒印排好；createWorld 填） */
  schedule: WaveEvent[] = [];
  nextEvent = 0;
  bossSlot = -1;

  readonly ev = new Events();

  /**
   * 角色的主动技能（core/skills.ts）：cd 还要几拍能再放，active 持续中还剩几拍，uses 放过几次。
   * 一次都没放过时不进指纹（没按技能键的局指纹和加技能前一样）
   */
  /** store：胖师叔铁布衫期间挡下的伤害（规则 61，结束时震出去）；采药女这次回春药香伤害多几成（千分比，规则 66，满血放时回不进去的血换的） */
  readonly skill = { cd: 0, active: 0, uses: 0, zx: 0, zy: 0, store: 0 };
  /** 阴阳先生阴阳互换（规则 66）：side 上一拍是阳 1 / 阴 −1（0 = 还没看过），next = 下一次能炸的拍号 */
  readonly flip = { side: 0, next: 0 };

  /** 复活还剩几次（永久加成"复活"） */
  revives = 0;
  /** 升级时给几张卡（永久加成"多一张"：4） */
  cardCount = 3;
  /** 胖师叔：这一拍挨了打，下一拍震开身边 */
  quake = false;

  // 首领连战（setup.rush）：不是连战时 rush 为 null，下面几项不动
  readonly rush: RushPlan | null;
  /** 正在打 / 下一个要上的是第几关 */
  rushStage = 0;
  /** 下一关上场的拍；-1 = 这一关正在打 */
  rushAt = 0;
  /** 这一关还剩几只没倒 */
  rushLeft = 0;
  /** 一共打倒了几只 */
  rushDown = 0;
  /** 全部打倒的那一拍（-1 = 还没打完） */
  rushEnd = -1;
  /** 哪些怪是连战的关底（召出来的小怪、纸轿不算） */
  readonly eRush = new Uint8Array(MAX_ENEMIES);

  constructor(raw: Setup) {
    const setup = normalizeSetup(raw);
    this.setup = setup;
    this.trial = setup.trial ? TRIALS[setup.trial] : null;
    const perk = (id: PerkId): number => setup.perks?.[id] ?? 0;
    // 小道士起步多 1 次刷新、符师多 1 次封禁（角色小特权）
    const own = (id: CharacterId): number => ((setup.character ?? 'xiaodao') === id ? 1 : 0);
    this.rerolls = setup.curses?.includes('noreroll') ? 0 : PICKS.rerolls + perk('shuaxin') * PERK_FX.shuaxin + own('xiaodao');
    this.bans = PICKS.bans + own('fushi');
    if (setup.kits?.includes('reroll')) {
      // 「定」咒印（不能刷新）照样不能刷新，只多封禁
      if (!setup.curses?.includes('noreroll')) this.rerolls += KIT_FX.rerolls;
      this.bans += KIT_FX.bans;
    }
    this.revives = perk('fuhuo') * PERK_FX.fuhuo;
    this.cardCount = 3 + perk('kapian') * PERK_FX.kapian;
    this.rush = setup.rush && setup.mode === 'vigil' ? rushPlan(setup.seed, setup.map ?? 'snow') : null;
    this.raid = setup.mode === 'raid' && setup.raid ? raidHooks().create({ ...setup.raid, seed: setup.seed, danger: setup.danger, character: setup.character }) : null;
    this.arenaW = this.raid ? this.raid.map.size : ARENA.w;
    this.arenaH = this.raid ? this.raid.map.size : ARENA.h;
    const def = MAPS[setup.map ?? 'snow'];
    const mapBlocks = def.blocks;
    this.blocks = this.raid ? this.raid.map.blocks : mapBlocks;
    this.allBlocks = this.raid ? [] : mapBlocks;
    const dyn = !this.raid && mapBlocks.some((b) => b.hp !== undefined);
    this.blockHp = new Float64Array(dyn ? mapBlocks.length : 0);
    this.blockAt = new Int32Array(dyn ? mapBlocks.length : 0);
    if (dyn) mapBlocks.forEach((b, k) => (this.blockHp[k] = b.hp ?? Infinity));
    if (!this.raid && mapBlocks.length > 40) this.index = new BlockIndex(mapBlocks as readonly RaidBlock[], ARENA.w);
    this.water = this.raid ? [] : def.water ?? [];
    this.ice = this.raid ? [] : def.ice ?? [];
    this.incense = this.raid ? [] : def.incense ?? [];
    this.fire = this.raid ? this.raid.map.fire : def.fire ?? [];
    if (this.raid) {
      this.x = this.px = this.raid.map.spawn.x;
      this.y = this.py = this.raid.map.spawn.y;
    }
    const s = setup.seed;
    this.rSpawn = new Rng(s, 'spawn');
    this.rDrop = new Rng(s, 'drop');
    this.rUp = new Rng(s, 'upgrade');
    this.rChest = new Rng(s, 'chest');
    this.rAi = new Rng(s, 'ai');
    this.rHit = new Rng(s, 'hit');
    this.rWeapon = new Rng(s, 'weapon');
    this.rProp = new Rng(s, 'prop');
    this.rSkip = new Rng(s, 'skip');
    this.rMarket = new Rng(s, 'market');
    this.stats = baseStats();
  }
}

export function baseStats(): Stats {
  return { might: 1, cdMul: 1, areaMul: 1, amount: 0, speed: PLAYER.speed, magnet: PLAYER.magnet, armor: 0, hpMax: PLAYER.hp, regen: 0, luck: 0, xpMul: 1, coinBonus: 0, durMul: 1, curse: 0, bindDouble: false, critAdd: 0, critDmg: 0, nearSlow: false };
}
