/**
 * 守岛（塔防，DESIGN 10.1–10.3；规则版本 7 = 守岛 2.0）：固定步长 20 拍/秒、整数坐标（1 格 = 100 单位）、确定性。
 * 同一个 setup 加同一串操作必得同一结果；不用随机、时间和平台数学函数，开方用整数牛顿法，随机用按用途分流的 sfc32。
 * 地图由 setup 给：战役是写死的关卡岛（木台、驻守台），海盗来袭是玩家自己的岛（常驻塔照常开火）。墙能砸能修，宝藏箱是敌人的目标。
 * 伤害一律按 td2types.ts 的克制表算（伤害类型 × 护甲），倍率 0 的打不到；局内塔按阶读 td2units.ts，常驻塔按基地等级表。
 * 局内的塔、金币、修墙打完就没，不回写 Profile。和登陆战（battle.ts）完全分开：攻防的结算不受这里任何东西影响。
 */
import { BUILDINGS, DEFENSE_KINDS } from '../content/index.ts';
import { SHIELD } from '../content/troops.ts';
import { TD_BRANCH_MOD } from '../content/tdbranches.ts';
import { HERO_RESEARCH_MAX, TD_HERO_LIGHT, TD_KEG, TD_MAX_TICKS, TD_PICK_R, TD_SAPPER_WALL_COST, TD_TREASURE, TD_WALL_COST } from '../content/tdunits.ts';
import {
  TD2_BOSS_EXTRA_TICKS, TD2_COST, TD2_ECON, TD2_ENEMIES, TD2_HERO, TD2_HERO_SKILL, TD2_MINE_REARM_TICKS, TD2_SHOCK_STUN, TD2_TREASURE_ROLL_TICKS, TD2_UP_PCT,
  td2TierStats,
} from '../content/td2units.ts';
import { isqrt } from './fmath.ts';
import { SNIPE_WARN, applyStun, flightTicks, inRing, keepLock, laneOffset, leadPoint, rankTargets, shieldFaces, stunned } from './combat.ts';
import { Rng, hash32 } from './rng.ts';
import { branchError, sanitizeBranch } from './tdbase.ts';
import { GRID, INF, cellIdx, cellOf, cellX, cellY, flowField, inGrid, nextCell } from './grid.ts';
import { ISLAND, UNIT } from './types.ts';
import type { BuildingKind } from './types.ts';
import {
  TD2_LOSE_AT, TD2_STAR_LOST, TD_ARMORS, TD_BURN_DAMAGE, TD_ENEMY_ARMOR, TD_HERO_DAMAGE, TD_KEG_DAMAGE, TD_MINE_DAMAGE, TD_TOWER_DAMAGE,
  TD_TOWER_KINDS, bestDamageVs, counterPct, isTdTowerKind,
} from './td2types.ts';
import { ESCORT_CELL, ESCORT_MEND, ESCORT_SHIP_R } from './escorttypes.ts';
import type { EscortState } from './escorttypes.ts';
import { escortBite, escortHullPct, escortMeet, escortRate, escortResult, escortShip } from './escort.ts';
import type { TdArmor, TdBarricade, TdDamage, TdMode, TdRouteLine, TdTier, TdTowerKind, WaveLanePreview, WavePreview } from './td2types.ts';
import type {
  TdAction, TdBlock, TdEnemy, TdEnemyKind, TdEvent, TdHero, TdLevel, TdResult, TdSetup, TdSlot, TdTower, TdWall,
} from './tdtypes.ts';

/** 一发伤害的类型：伤害类型、塔的分叉（克制表的例外看它）、打重甲另加的百分点 */
interface Hit {
  dt: TdDamage;
  branch: readonly string[];
  heavy: number;
}

/** 塔这一刻的实际数值（阶表或基地等级表 + 分叉 + 基地加成），塔升阶、选分叉时重算 */
interface TowerStats extends Hit {
  dmg: number;
  range: number;
  minRange: number;
  reload: number;
  splash: number;
  airFirst: boolean;
  light: number;
  slowPct: number;
  slowTicks: number;
  burnDps: number;
  burnTicks: number;
  shots: number;
  line: boolean;
  pull: number;
  /** 震荡炮：命中震晕几拍（规则版本 10）；别的塔 0 */
  stun: number;
}

/** 延迟结算的命中：弹丸飞到了才算 */
interface Pend {
  t: number;
  /** lob = 掷弹兵的手雷（规则版本 10）：炸英雄、墙（按 wallPct 打折）、拒马，不炸敌人 */
  kind: 'unit' | 'splash' | 'keg' | 'heroKeg' | 'lob';
  id: number;
  dmg: number;
  x: number;
  y: number;
  r: number;
  hit: Hit;
  slowPct: number;
  slowTicks: number;
  burnDps: number;
  burnTicks: number;
  pull: number;
  /** 震荡炮的落点溅射：命中的敌人震晕几拍（规则版本 10） */
  stun?: number;
  /** 手雷炸墙按百分之几 */
  wallPct?: number;
  /** 规则版本 ≥ 11：直射的出膛点（盾兵按它判正面）；溅射不写 */
  sx?: number;
  sy?: number;
}

interface Trap {
  id: number;
  kind: 'mine' | 'tar';
  x: number;
  y: number;
  st: TowerStats;
  fired: boolean;
  /** 地雷炸完后哪一拍重新埋好；没炸过为 -1 */
  rearm: number;
}

interface Internal {
  rng: Rng;
  nextId: number;
  pend: Pend[];
  spawns: Array<{ t: number; kind: TdEnemyKind; x: number; y: number; wave: number }>;
  /** 每一波还没处理完（没死、没回船、还没登陆）的敌人数 */
  waveLeft: number[];
  /** 不会变的占格（主寨、仓库、宝藏箱等）：0 空 / 2 不能走 */
  fixed: Uint8Array;
  occ: Uint8Array;
  /** 格 → 墙下标 + 1 */
  wallAt: Int16Array;
  ver: number;
  gridVer: number;
  flow: Map<string, Int32Array>;
  stats: Map<number, TowerStats>;
  traps: Trap[];
  /** 岛上（箱里加地上）的宝藏最近一次归零时已经清完的波数：输的那局按它算"撑过几波"，免得宝藏空了以后空手回船的敌人把波数刷上去 */
  clearedAtEmpty: number;
  /** 哑火的塔：塔 id → 哑火到哪一拍（工兵冲击波、首领技能；没有这类字段的关卡永远是空的） */
  jam: Map<number, number>;
  /** 已经发过技能的首领 id */
  skilled: Set<number>;
  /** 打沉的敌人数（死了才算，工兵自爆、回船的不算） */
  kills: number;
  /** 基地加成：每种塔的伤害加成百分比 */
  bonus: Partial<Record<TdTowerKind, number>>;
  /** 这一段倒数一共多长（拍）：叫波奖励按剩下的占比折 */
  cdTotal: number;
  /** 这一关每波的平均敌人总血、平均单个敌人的血（英雄技能的相对值）；无尽关每次现算 */
  avg: { wave: number; unit: number } | null;
  /** 英雄现在的 goal 是守点逻辑自己定的（迎敌、回守点），不是玩家点的 */
  heroAuto?: boolean;
  /** 规则版本 ≥ 14：玩家这条命里指挥过英雄（之后听玩家的守点，倒下复活后清掉，重新自己守） */
  heroCmd?: boolean;
  /** 规则版本 ≥ 11：狙击塔 id → 正在瞄的敌人和开火拍 */
  snipe: Map<number, { target: number; fireAt: number }>;
}

export interface TdState {
  rules: number;
  tick: number;
  level: TdLevel;
  /** 守岛 2.0：哪种玩法（setup 没写按 campaign） */
  mode: TdMode;
  /** 守岛 2.0：木台上能造哪些塔 */
  unlocked: TdTowerKind[];
  enemies: TdEnemy[];
  towers: TdTower[];
  walls: TdWall[];
  blocks: TdBlock[];
  kegs: Array<{ id: number; x: number; y: number; alive: boolean }>;
  slots: TdSlot[];
  hero: TdHero;
  /** 宝藏箱（格子坐标） */
  treasures: Array<{ id: number; x: number; y: number }>;
  /** 还在宝藏箱里的枚数 */
  vault: number;
  /** 被带回船、丢掉的枚数 */
  lost: number;
  /** 敌人半路被打死掉在地上的；at = 掉下的拍，TD2_TREASURE_ROLL_TICKS 拍没人捡就自己滚回箱子 */
  piles: Array<{ x: number; y: number; n: number; at: number }>;
  gold: number;
  goldEarned: number;
  /** 已经开始了几波 */
  wave: number;
  /** 下一波开始的拍；没有下一波为 -1 */
  next: number;
  fires: Array<{ x: number; y: number; r: number; dps: number; until: number }>;
  /** 旧版的主动号令（规则版本 7 起号令是被动，这里永远是空的；字段留给画面层兼容） */
  rally: { until: number; ids: number[] };
  /** 场上的拒马（格子坐标） */
  barricades: TdBarricade[];
  over: boolean;
  /** 护航的商船（关卡带 escort 时才有） */
  escort?: EscortState;
  internal: unknown;
}

function inner(s: TdState): Internal {
  return s.internal as Internal;
}

const NO_MOD: TowerStats = {
  dmg: 0, range: 0, minRange: 0, reload: 20, splash: 0, dt: 'shell', branch: [], heavy: 0, airFirst: false, light: 0,
  slowPct: 0, slowTicks: 0, burnDps: 0, burnTicks: 0, shots: 1, line: false, pull: 0, stun: 0,
};

const HIT_HERO: Hit = { dt: TD_HERO_DAMAGE, branch: [], heavy: 0 };
const HIT_KEG: Hit = { dt: TD_KEG_DAMAGE, branch: [], heavy: 0 };
const HIT_BURN: Hit = { dt: TD_BURN_DAMAGE, branch: [], heavy: 0 };

/** 局内塔的阶对应的"等级"：选分叉的检查和画面挑贴图用（1–3 级算 1 阶、4–6 级 2 阶、7–8 级 3 阶，各取一个代表） */
export const TD_TIER_LEVEL: Readonly<Record<TdTier, number>> = { 1: 2, 2: 5, 3: 8 };

/** 敌人在格子里按 id 散开的步长（单位）：同一条路上的敌人错开成几列，不叠成一个点 */
export const TD_LANE_SPREAD = 18;
/** 英雄守点：守点周围多远（单位）的敌人他会主动迎上去打 */
export const TD_HERO_GUARD = 450;
/** 英雄迎敌时，离敌人多近就站住开火（射程的几分之几，留一点余量免得在射程边上进进出出） */
export const TD_HERO_STAND_PCT = 80;
/** 从这个规则版本起英雄没被指挥时自己守：站到威胁最大那条路的路口，永远不站在木台上 */
export const TD_HERO_AUTO_RULES = 14;
/** 自己守时多久重选一次站位（拍） */
const TD_HERO_AUTO_EVERY = 50;
/** 自己守的站位：那条路去宝藏的路线上，离宝藏还有几格（≈ 迎敌圈 4.5 格，站在路口也罩得住宝藏） */
const TD_HERO_AUTO_BACK = 4;

/** 一发打到某种护甲的倍率（百分比）：克制表 + 分叉例外，打重甲再加分叉的 heavyPct。0 = 打不到 */
function mult(h: Hit, armor: TdArmor): number {
  const p = counterPct(h.dt, armor, h.branch);
  return p > 0 && armor === 'heavy' ? p + h.heavy : p;
}

const isAir = (kind: TdEnemyKind): boolean => TD_ENEMY_ARMOR[kind] === 'air';

/** 不是守岛塔的防御（海怪）、陷阱的伤害类型 */
function damageOf(kind: BuildingKind): TdDamage {
  if (isTdTowerKind(kind)) return TD_TOWER_DAMAGE[kind];
  if (kind === 'mine') return TD_MINE_DAMAGE;
  if (kind === 'tar') return TD_BURN_DAMAGE;
  return 'shell';
}

/**
 * 塔的数值：局内塔（有 tier）读 td2units 的阶表，常驻塔（海盗来袭、悬赏、大潮岛上的）和陷阱读基地等级表；
 * 再加分叉（tdbranches.ts 的守岛解释）和基地加成。射程、溅射从"格"换成单位；百分比都按整数算。
 */
function statsOf(kind: BuildingKind, level: number, tier: TdTier | undefined, branch: readonly string[], bonusPct: number): TowerStats {
  const st: TowerStats = { ...NO_MOD, dt: damageOf(kind), branch: [...branch] };
  if (tier !== undefined && isTdTowerKind(kind)) {
    const t = td2TierStats(kind, tier);
    st.dmg = t.dmg;
    st.range = t.range;
    st.minRange = t.minRange;
    st.reload = t.reload;
    st.splash = t.splash;
    st.shots = t.shots;
    if (kind === 'shock') st.stun = TD2_SHOCK_STUN;
  } else {
    const lv = BUILDINGS[kind].levels[level - 1];
    if (!lv) return { ...NO_MOD };
    st.dmg = lv.dmg ?? 0;
    st.range = Math.round((lv.range ?? 0) * UNIT);
    st.minRange = Math.round((lv.minRange ?? 0) * UNIT);
    st.reload = lv.reload ?? 20;
    // 火箭本来就带溅射，地雷、焦油的爆炸半径也在 splash
    st.splash = kind === 'mortar' || kind === 'flame' || kind === 'rocket' || kind === 'mine' || kind === 'tar' || kind === 'shock' ? Math.round((lv.splash ?? 1) * UNIT) : 0;
    st.stun = lv.stun ?? 0;
    st.shots = kind === 'rocket' ? 3 : 1;
    // 焦油：踩上去减速一半（和登陆战一样），持续 reload 拍
    st.slowPct = kind === 'tar' ? 50 : 0;
    st.slowTicks = kind === 'tar' ? (lv.reload ?? 80) : 0;
  }
  let dmgPct = 100 + bonusPct;
  let reloadPct = 100;
  let rangePct = 100;
  for (const id of branch) {
    const m = TD_BRANCH_MOD.get(id);
    if (!m) continue;
    dmgPct += m.dmgPct ?? 0;
    reloadPct += m.reloadPct ?? 0;
    rangePct += m.rangePct ?? 0;
    st.splash += m.splash ?? 0;
    st.heavy += m.heavyPct ?? 0;
    if (m.airFirst) st.airFirst = true;
    if (m.line) st.line = true;
    st.light = Math.max(st.light, m.light ?? 0);
    st.slowPct = Math.min(90, st.slowPct + (m.slowPct ?? 0));
    st.slowTicks += m.slowTicks ?? 0;
    st.burnDps += m.burnDps ?? 0;
    st.burnTicks = Math.max(st.burnTicks, m.burnTicks ?? 0);
    st.shots += m.shots ?? 0;
    st.pull = Math.max(st.pull, m.pull ?? 0);
    if (m.stunTicks !== undefined && st.stun > 0) st.stun = m.stunTicks;
  }
  st.dmg = Math.floor((st.dmg * dmgPct) / 100);
  st.reload = Math.max(4, Math.floor((st.reload * reloadPct) / 100));
  st.range = Math.floor((st.range * rangePct) / 100);
  if (st.slowPct > 0 && st.slowTicks === 0) st.slowTicks = 40;
  return st;
}

function towerStats(s: TdState, t: TdTower): TowerStats {
  const I = inner(s);
  let st = I.stats.get(t.id);
  if (!st) {
    st = statsOf(t.kind, t.level, t.tier, t.branch, isTdTowerKind(t.kind) ? (I.bonus[t.kind] ?? 0) : 0);
    I.stats.set(t.id, st);
  }
  return st;
}

/** 塔真实的射程（单位）：界面画射程圈、造塔预览都读它，和出手判定是同一个数 */
export function tdTowerRange(s: TdState, t: TdTower): { range: number; minRange: number } {
  const st = towerStats(s, t);
  return { range: st.range, minRange: st.minRange };
}

/** 还没造的塔（造塔预览）：这种塔这一阶、不带分叉时的射程 */
export function tdBuildRange(kind: TdTowerKind, tier: TdTier = 1): { range: number; minRange: number } {
  const st = statsOf(kind, TD_TIER_LEVEL[tier], tier, [], 0);
  return { range: st.range, minRange: st.minRange };
}

/** 英雄某一级的数值：TD2_HERO 每级 +growPct%（登陆战的驻岛英雄另有一张表，不读这里） */
export function tdHeroStats(level: number): { hp: number; dmg: number; reload: number; range: number; speed: number } {
  const k = 100 + TD2_HERO.growPct * (Math.max(1, level) - 1);
  return { hp: Math.floor((TD2_HERO.hp * k) / 100), dmg: Math.floor((TD2_HERO.dmg * k) / 100), reload: TD2_HERO.reload, range: TD2_HERO.range, speed: TD2_HERO.speed };
}

/** 英雄等级上限：和基地的英雄研究一样（8 级后能研究到 12）；9 级以上的 setup 以前不存在，旧回放不受影响 */
const HERO_MAX = HERO_RESEARCH_MAX;

function tcx(t: { x: number; size: number }): number {
  return t.x * UNIT + (t.size * UNIT) / 2;
}
function tcy(t: { y: number; size: number }): number {
  return t.y * UNIT + (t.size * UNIT) / 2;
}
function d2(ax: number, ay: number, bx: number, by: number): number {
  return (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
}

// ------------------------------------------------------------ 开局

/** 大潮无尽：开局和每开一波都把波次往后补到"已开的波 + 这么多"，机器人、界面能看到后面几波的预告 */
const ENDLESS_AHEAD = 6;

/** 大潮无尽（关卡写了 endless）：把 waves 补到至少 n 波；其它关卡什么都不做。生成只看波数，补多补少不影响结果 */
export function ensureWaves(lv: TdLevel, n: number): void {
  const gen = lv.endless;
  if (!gen) return;
  while (lv.waves.length < n) lv.waves.push(gen(lv.waves.length));
}

/** 升到下一阶（ups = 已经升过几次，0 或 1）要多少局内金币；升满或不是守岛塔为 -1 */
export function tdUpCost(kind: BuildingKind, ups: number): number {
  if (!isTdTowerKind(kind)) return -1;
  const pct = TD2_UP_PCT[ups];
  if (pct === undefined) return -1;
  return Math.floor((TD2_COST[kind] * pct) / 100);
}

/** 木台上从 1 阶升到 tier 阶一共花多少（驻守台的塔卖掉时按它退） */
function costToTier(kind: TdTowerKind, tier: TdTier): number {
  let c = TD2_COST[kind];
  for (let u = 0; u < tier - 1; u++) c += tdUpCost(kind, u);
  return c;
}

export function createTd(setup: TdSetup): TdState {
  const level = setup.level;
  // 规则版本 10 以前没有震荡炮、11 以前没有狙击塔：岛上的、驻守台的、能造的都去掉（旧版本的局里本来就没有，回放逐位不变）
  const missing = (k: string): boolean => (setup.rules < 10 && k === 'shock') || (setup.rules < 11 && k === 'sniper');
  ensureWaves(level, ENDLESS_AHEAD);
  const fixed = new Uint8Array(GRID * GRID);
  const towers: TdTower[] = [];
  const walls: TdWall[] = [];
  const traps: Trap[] = [];
  const treasures: TdState['treasures'] = [];
  let maxId = 0;
  for (const p of setup.layout) {
    const def = BUILDINGS[p.kind];
    if (!def || missing(p.kind)) continue;
    maxId = Math.max(maxId, p.id);
    const lv = Math.max(1, Math.min(def.maxLevel, p.level));
    if (def.category === 'deco') continue; // 装饰不挡路（和登陆战一样）
    if (p.kind === 'wall') {
      const hp = def.levels[lv - 1]?.hp ?? 1;
      walls.push({ id: p.id, x: p.x, y: p.y, hp, maxHp: hp, destroyed: false });
      continue;
    }
    if (p.kind === 'mine' || p.kind === 'tar') {
      const branch = sanitizeBranch(p.kind, lv, p.branch) ?? [];
      traps.push({ id: p.id, kind: p.kind, x: p.x * UNIT + 50, y: p.y * UNIT + 50, st: statsOf(p.kind, lv, undefined, branch, 0), fired: false, rearm: -1 });
      continue;
    }
    for (let ox = 0; ox < def.size; ox++) for (let oy = 0; oy < def.size; oy++) fixed[cellIdx(p.x + ox, p.y + oy)] = 2;
    if (p.kind === 'treasure') treasures.push({ id: p.id, x: p.x, y: p.y });
    else if (DEFENSE_KINDS.has(p.kind)) {
      towers.push({ id: p.id, kind: p.kind, level: lv, x: p.x, y: p.y, size: def.size, branch: sanitizeBranch(p.kind, lv, p.branch) ?? [], cd: 0, aim: -1, lock: -1, slot: -1 });
    }
  }
  // 没摆宝藏箱的岛（老档、测试）：放在主寨旁边第一个空格，保证有目标
  if (treasures.length === 0 && !level.escort) {
    const hq = setup.layout.find((b) => b.kind === 'hq');
    const cx = hq ? hq.x : 10;
    const cy = hq ? hq.y + BUILDINGS.hq.size : 10;
    for (let r = 0; r < ISLAND && treasures.length === 0; r++) {
      for (let dx = -r; dx <= r && treasures.length === 0; dx++) {
        for (let dy = -r; dy <= r && treasures.length === 0; dy++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= ISLAND || y >= ISLAND || fixed[cellIdx(x, y)] !== 0) continue;
          if (walls.some((w) => w.x === x && w.y === y)) continue;
          fixed[cellIdx(x, y)] = 2;
          treasures.push({ id: ++maxId, x, y });
        }
      }
    }
  }
  const taken = (x: number, y: number, size: number): boolean => {
    for (let ox = 0; ox < size; ox++) {
      for (let oy = 0; oy < size; oy++) {
        if (!inGrid(x + ox, y + oy) || fixed[cellIdx(x + ox, y + oy)] !== 0) return true;
        if (walls.some((w) => w.x === x + ox && w.y === y + oy)) return true;
      }
    }
    return false;
  };
  const mark = (x: number, y: number, size: number, v: number): void => {
    for (let ox = 0; ox < size; ox++) for (let oy = 0; oy < size; oy++) fixed[cellIdx(x + ox, y + oy)] = v;
  };
  // 关卡写死的东西和岛重叠了就不摆（海盗来袭打在每个人自己的岛上，不可能都对得上）
  const blocks: TdBlock[] = [];
  for (const o of level.obstacles) {
    if (taken(o.x, o.y, o.size)) continue;
    blocks.push({ id: ++maxId, kind: o.kind, x: o.x, y: o.y, size: o.size, hp: o.hp, gold: o.gold, destroyed: false });
    mark(o.x, o.y, o.size, 3);
  }
  // 木台（可能被沉船压着），然后是驻守台（TdSlot.garrison = 驻守台下标），都先占住，免得火药桶摆上去
  const slots: TdSlot[] = [];
  for (const sl of level.slots) {
    if (taken(sl.x, sl.y, 2)) continue;
    const slot: TdSlot = { x: sl.x, y: sl.y, tower: -1, ups: 0, spent: 0 };
    if (sl.wreck) {
      const b: TdBlock = { id: ++maxId, kind: 'wreck', x: sl.x, y: sl.y, size: 2, hp: sl.wreck.hp > 0 ? sl.wreck.hp : TD2_ECON.wreckHp, gold: TD2_ECON.heroClearGold, destroyed: false };
      blocks.push(b);
      slot.wreck = b.id;
    }
    slots.push(slot);
    mark(sl.x, sl.y, 2, 4);
  }
  (level.garrison ?? []).forEach((g, i) => {
    if (taken(g.x, g.y, 2)) return;
    slots.push({ x: g.x, y: g.y, tower: -1, ups: 0, spent: 0, garrison: i });
    mark(g.x, g.y, 2, 4);
  });
  const kegs: TdState['kegs'] = [];
  for (const k of level.kegs) {
    if (taken(k.x, k.y, 1)) continue;
    kegs.push({ id: ++maxId, x: k.x * UNIT + 50, y: k.y * UNIT + 50, alive: true });
  }
  // 障碍、木台的临时标记清回去：障碍由 blocks 挡路，空木台能走
  for (let i = 0; i < fixed.length; i++) if (fixed[i] === 3 || fixed[i] === 4) fixed[i] = 0;
  // 驻守台上的塔：阶、分叉由 tdrun 按存档算好；分叉只校验 id 和先后（基地上已按那座塔的等级校验过）
  for (const g of setup.garrison ?? []) {
    const sl = slots.find((q) => q.garrison === g.spot);
    if (!sl || sl.tower >= 0 || !isTdTowerKind(g.kind) || missing(g.kind)) continue;
    const tier: TdTier = g.tier === 3 ? 3 : g.tier === 2 ? 2 : 1;
    const t: TdTower = {
      id: ++maxId, kind: g.kind, level: TD_TIER_LEVEL[tier], x: sl.x, y: sl.y, size: 2, branch: sanitizeBranch(g.kind, TD_TIER_LEVEL[3], g.branch) ?? [],
      cd: 0, aim: -1, lock: -1, slot: slots.indexOf(sl), tier, garrison: true,
    };
    towers.push(t);
    sl.tower = t.id;
    sl.ups = tier - 1;
    sl.spent = costToTier(g.kind, tier);
  }
  const heroLv = Math.max(1, Math.min(HERO_MAX, Math.floor(setup.hero) || 1));
  const hs = tdHeroStats(heroLv);
  const t0 = (treasures[0] ?? level.escort?.route[0] ?? { x: 10, y: 10 }) as { x: number; y: number };
  const hero: TdHero = {
    level: heroLv,
    x: t0.x * UNIT + 50,
    y: (t0.y + 1) * UNIT + 50,
    hp: hs.hp,
    maxHp: hs.hp,
    respawn: -1,
    goal: null,
    clear: -1,
    cd: 0,
    kegReady: 0,
    rallyReady: 0,
    barricadeReady: 0,
    aim: -1,
  };
  const internal: Internal = {
    rng: new Rng(setup.seed, 'td-spawn'),
    nextId: maxId + 1,
    pend: [],
    spawns: [],
    waveLeft: level.waves.map(() => 0),
    fixed,
    occ: new Uint8Array(GRID * GRID),
    wallAt: new Int16Array(GRID * GRID),
    ver: 1,
    gridVer: 0,
    flow: new Map(),
    stats: new Map(),
    traps,
    clearedAtEmpty: -1,
    jam: new Map(),
    skilled: new Set(),
    kills: 0,
    bonus: { ...(setup.bonus ?? {}) },
    cdTotal: Math.max(1, level.first),
    avg: null,
    snipe: new Map(),
  };
  const s: TdState = {
    rules: setup.rules,
    tick: 0,
    level,
    mode: setup.mode ?? (level.escort ? 'escort' : 'campaign'),
    unlocked: TD_TOWER_KINDS.filter((k) => (!setup.unlocked || setup.unlocked.includes(k)) && !missing(k)),
    enemies: [],
    towers,
    walls,
    blocks,
    kegs,
    slots,
    hero,
    treasures,
    vault: level.escort ? 0 : TD_TREASURE,
    lost: 0,
    piles: [],
    gold: level.gold,
    goldEarned: 0,
    wave: 0,
    next: level.first,
    fires: [],
    rally: { until: 0, ids: [] },
    barricades: [],
    over: false,
    internal,
  };
  if (level.escort) {
    // 护航：船停在起点（要玩家定速度），没有宝藏箱
    s.escort = {
      def: level.escort, pos: 0, pace: 'hold', hull: level.escort.hull, biters: 0, mendReady: 0, follow: false,
      gatesPassed: 0, arrived: false, sunk: false, mends: 0,
    };
  }
  // 英雄出生点要能站：宝藏箱下面被占就挪到四周第一个空格
  placeHero(s);
  s.hero.post = { x: s.hero.x, y: s.hero.y };
  return s;
}

function placeHero(s: TdState): void {
  ensureGrid(s);
  const occ = inner(s).occ;
  if (s.escort) {
    // 护航：英雄出生、复活都在船边（船所在格，被占就找四周）
    const sh = escortShip(s.escort);
    const bx = Math.floor(sh.x / UNIT);
    const by = Math.floor(sh.y / UNIT);
    for (const [ox, oy] of [[0, 0], [0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
      if (!inGrid(bx + ox, by + oy) || occ[cellIdx(bx + ox, by + oy)] !== 0) continue;
      s.hero.x = (bx + ox) * UNIT + 50;
      s.hero.y = (by + oy) * UNIT + 50;
      return;
    }
    return;
  }
  const t = s.treasures[0] as { x: number; y: number };
  for (const [ox, oy] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
    if (!inGrid(t.x + ox, t.y + oy) || occ[cellIdx(t.x + ox, t.y + oy)] !== 0) continue;
    s.hero.x = (t.x + ox) * UNIT + 50;
    s.hero.y = (t.y + oy) * UNIT + 50;
    return;
  }
}

// ------------------------------------------------------------ 格子

function ensureGrid(s: TdState): void {
  const I = inner(s);
  if (I.gridVer === I.ver) return;
  I.occ.set(I.fixed);
  I.wallAt.fill(0);
  s.walls.forEach((w, i) => {
    if (w.destroyed) return;
    const c = cellIdx(w.x, w.y);
    I.occ[c] = 1;
    I.wallAt[c] = i + 1;
  });
  for (const b of s.blocks) {
    if (b.destroyed) continue;
    for (let ox = 0; ox < b.size; ox++) for (let oy = 0; oy < b.size; oy++) I.occ[cellIdx(b.x + ox, b.y + oy)] = 2;
  }
  for (const t of s.towers) {
    if (t.slot < 0) continue;
    for (let ox = 0; ox < t.size; ox++) for (let oy = 0; oy < t.size; oy++) I.occ[cellIdx(t.x + ox, t.y + oy)] = 2;
  }
  I.flow.clear();
  I.gridVer = I.ver;
}

function flowTo(s: TdState, key: string, goals: () => number[], wallCost: number): Int32Array {
  ensureGrid(s);
  const I = inner(s);
  const k = `${wallCost}|${key}`;
  let f = I.flow.get(k);
  if (!f) {
    f = flowField(I.occ, goals(), wallCost);
    I.flow.set(k, f);
  }
  return f;
}

function treasureFlow(s: TdState, i: number, wallCost: number): Int32Array {
  const t = s.treasures[i] as { x: number; y: number };
  return flowTo(s, `t${i}`, () => [cellIdx(t.x, t.y)], wallCost);
}

function cellFlow(s: TdState, cell: number, wallCost: number): Int32Array {
  return flowTo(s, `c${cell}`, () => [cell], wallCost);
}

// ------------------------------------------------------------ 伤害

/** 敌人站在雾区里（关卡没写雾区就永远 false） */
function inFogZone(s: TdState, e: TdEnemy): boolean {
  const zones = s.level.fogZones;
  if (!zones) return false;
  if (s.level.fogFrom !== undefined && s.wave <= s.level.fogFrom) return false;
  for (const z of zones) {
    const r = z.r * UNIT;
    if (d2(e.x, e.y, z.x * UNIT + 50, z.y * UNIT + 50) <= r * r) return true;
  }
  return false;
}

/** 这座塔现在是不是哑火（被工兵冲击波或首领技能炸哑了） */
export function tdJammed(s: TdState, towerId: number): boolean {
  return (inner(s).jam.get(towerId) ?? 0) > s.tick;
}

function seen(s: TdState, e: TdEnemy): boolean {
  if (!TD2_ENEMIES[e.kind].fog && !inFogZone(s, e)) return true;
  const h = s.hero;
  if (h.respawn < 0 && d2(h.x, h.y, e.x, e.y) <= TD_HERO_LIGHT * TD_HERO_LIGHT) return true;
  for (const t of s.towers) {
    const st = towerStats(s, t);
    if (st.light > 0 && d2(tcx(t), tcy(t), e.x, e.y) <= st.light * st.light) return true;
  }
  return false;
}

/** 塔、英雄能不能瞄准它：活着、克制倍率不是 0（飞的只给枪弹和高射火箭打）、雾里的要被照亮 */
function targetable(s: TdState, e: TdEnemy, h: Hit): boolean {
  if (e.mode !== 'in' && e.mode !== 'out') return false;
  if (mult(h, TD_ENEMY_ARMOR[e.kind]) <= 0) return false;
  return seen(s, e);
}

function addGold(s: TdState, n: number): void {
  s.gold += n;
  s.goldEarned += n;
}

function resolveEnemy(s: TdState, e: TdEnemy): void {
  const I = inner(s);
  I.waveLeft[e.wave] = (I.waveLeft[e.wave] ?? 1) - 1;
}

/** 某个敌人在第 w 波的血量：统一敌人表 × 关卡 hpPct（战役一律 100）× 波次 hpPct（大潮） */
function enemyHp(lv: TdLevel, kind: TdEnemyKind, w: number): number {
  const wp = lv.waves[w]?.hpPct;
  return Math.max(1, Math.floor((TD2_ENEMIES[kind].hp * (wp ? Math.floor((lv.hpPct * wp) / 100) : lv.hpPct)) / 100));
}

function spawnEnemy(s: TdState, ev: TdEvent[], kind: TdEnemyKind, x: number, y: number, hx: number, hy: number, wave: number): TdEnemy {
  const I = inner(s);
  const hp = enemyHp(s.level, kind, wave);
  const e: TdEnemy = {
    id: I.nextId++, kind, wave, x, y, hp, maxHp: hp, mode: 'in', carry: 0, hx, hy, cd: s.tick, slowUntil: 0, slowPct: 0, face: 1, trail: [],
    px: x, py: y,
  };
  // 盾兵：盾先朝宝藏箱（之后按走的方向更新，见 stepTd）
  const tr = s.treasures[0];
  if (kind === 'shield' && tr) faceShield(e, tr.x * UNIT + 50 - x, tr.y * UNIT + 50 - y);
  s.enemies.push(e);
  ev.push({ type: 'spawn', id: e.id, kind, x, y });
  return e;
}

/** 盾朝 (dx, dy)（单位向量 × 100）；没有方向不改 */
function faceShield(e: TdEnemy, dx: number, dy: number): void {
  const d = isqrt(dx * dx + dy * dy);
  if (d === 0) return;
  e.gx = Math.round((dx * 100) / d);
  e.gy = Math.round((dy * 100) / d);
}

/**
 * 直射命中盾兵（规则版本 11）：盾朝着来弹、没被震晕，枪弹和炮弹的单体伤害只吃 SHIELD.frontPct%，推 guard 事件；
 * 火、爆和溅射不走这里（p.sx 只有塔的直射才写）。
 */
function guardedHit(s: TdState, ev: TdEvent[], e: TdEnemy, p: Pend): number {
  if (e.kind !== 'shield' || p.sx === undefined || p.sy === undefined || stunned(e, s.tick)) return p.dmg;
  if (p.hit.dt !== 'shot' && p.hit.dt !== 'shell') return p.dmg;
  if (!shieldFaces(e.gx ?? 0, e.gy ?? 0, e.x, e.y, p.sx, p.sy)) return p.dmg;
  ev.push({ type: 'guard', id: e.id, x: e.x + Math.round(((e.gx ?? 0) * 40) / 100), y: e.y + Math.round(((e.gy ?? 0) * 40) / 100) });
  return Math.floor((p.dmg * SHIELD.frontPct) / 100);
}

function damageEnemy(s: TdState, ev: TdEvent[], e: TdEnemy, dmg: number, h: Hit): void {
  if (e.mode !== 'in' && e.mode !== 'out') return;
  const m = mult(h, TD_ENEMY_ARMOR[e.kind]);
  if (m <= 0) return;
  const def = TD2_ENEMIES[e.kind];
  const d = Math.floor((dmg * m) / 100);
  e.hp -= d;
  ev.push({ type: 'hit', id: e.id, dmg: d });
  if (e.hp > 0) return;
  e.hp = 0;
  e.mode = 'dead';
  ev.push({ type: 'die', id: e.id, kind: e.kind });
  inner(s).kills++;
  addGold(s, def.gold);
  if (e.carry > 0) {
    s.piles.push({ x: e.x, y: e.y, n: e.carry, at: s.tick });
    ev.push({ type: 'drop', x: e.x, y: e.y, n: e.carry });
    e.carry = 0;
  }
  if (def.split) {
    const I = inner(s);
    for (let i = 0; i < def.split.n; i++) {
      I.waveLeft[e.wave] = (I.waveLeft[e.wave] ?? 0) + 1;
      spawnEnemy(s, ev, def.split.kind, e.x + I.rng.int(81) - 40, e.y + I.rng.int(81) - 40, e.hx, e.hy, e.wave);
    }
  }
  resolveEnemy(s, e);
}

function slowEnemy(s: TdState, e: TdEnemy, pct: number, ticks: number): void {
  if (pct <= 0 || ticks <= 0) return;
  if (s.tick >= e.slowUntil) e.slowPct = 0;
  e.slowPct = Math.max(e.slowPct, pct);
  e.slowUntil = Math.max(e.slowUntil, s.tick + ticks);
}

function damageHero(s: TdState, ev: TdEvent[], dmg: number): void {
  const h = s.hero;
  if (h.respawn >= 0) return;
  h.hp -= dmg;
  if (h.hp > 0) return;
  h.hp = 0;
  h.respawn = s.tick + TD2_HERO.respawnTicks;
  h.goal = null;
  h.clear = -1;
  h.aim = -1;
  ev.push({ type: 'hero', what: 'down' });
}

function damageWall(s: TdState, ev: TdEvent[], w: TdWall, dmg: number): void {
  if (w.destroyed) return;
  w.hp -= dmg;
  if (w.hp > 0) return;
  w.hp = 0;
  w.destroyed = true;
  inner(s).ver++;
  ev.push({ type: 'wall', id: w.id, destroyed: true });
}

/** 障碍没了：压木台的沉船顺带把木台放出来（cleared 事件） */
function blockGone(s: TdState, ev: TdEvent[], b: TdBlock, paid: boolean, gold: number): void {
  b.hp = 0;
  b.destroyed = true;
  inner(s).ver++;
  if (gold > 0) addGold(s, gold);
  ev.push({ type: 'block', id: b.id });
  const slot = s.slots.findIndex((q) => q.wreck === b.id);
  if (slot < 0) return;
  delete (s.slots[slot] as TdSlot).wreck;
  ev.push({ type: 'cleared', id: b.id, slot, paid, gold });
}

function damageBlock(s: TdState, ev: TdEvent[], b: TdBlock, dmg: number): void {
  if (b.destroyed) return;
  b.hp -= dmg;
  if (b.hp > 0) return;
  blockGone(s, ev, b, false, b.gold);
}

interface Blast {
  dmg: number;
  r: number;
  hit: Hit;
  /** 看不见的雾船也炸（爆炸是一片，不用瞄准） */
  fog: boolean;
  /** 地上的火药桶：敌我都炸（英雄、墙），也炸障碍 */
  friendly: boolean;
  /** 英雄的炸药桶：不炸自己人，但炸障碍、点火药桶 */
  blocks: boolean;
  slowPct: number;
  slowTicks: number;
  /** 震荡炮：炸到的敌人震晕几拍（规则版本 10） */
  stun?: number;
}

function explode(s: TdState, ev: TdEvent[], x: number, y: number, b: Blast): void {
  const I = inner(s);
  const r2 = b.r * b.r;
  ev.push({ type: 'explode', x, y, r: b.r });
  for (const e of s.enemies) {
    if (e.mode !== 'in' && e.mode !== 'out') continue;
    if (d2(e.x, e.y, x, y) > r2) continue;
    if (mult(b.hit, TD_ENEMY_ARMOR[e.kind]) <= 0) continue;
    if (!b.fog && !seen(s, e)) continue;
    damageEnemy(s, ev, e, b.dmg, b.hit);
    slowEnemy(s, e, b.slowPct, b.slowTicks);
    if (b.stun && e.hp > 0) {
      // 首领（船长）只震一半；免控中的不再震（combat.ts）
      const until = applyStun(e, s.tick, b.stun, e.kind === 'captain');
      if (until >= 0) ev.push({ type: 'stun', id: e.id, until });
    }
  }
  if (b.friendly) {
    if (d2(s.hero.x, s.hero.y, x, y) <= r2) damageHero(s, ev, b.dmg);
    for (const w of s.walls) if (!w.destroyed && d2(w.x * UNIT + 50, w.y * UNIT + 50, x, y) <= r2) damageWall(s, ev, w, b.dmg);
  }
  if (b.friendly || b.blocks) {
    for (const k of s.blocks) if (!k.destroyed && d2(tcx(k), tcy(k), x, y) <= r2 + (k.size * 50) * (k.size * 50)) damageBlock(s, ev, k, b.dmg);
  }
  // 爆炸点着火药桶：隔几拍再炸，连锁看得出先后
  for (const k of s.kegs) {
    if (!k.alive || d2(k.x, k.y, x, y) > r2) continue;
    k.alive = false;
    I.pend.push({ t: s.tick + TD_KEG.fuse, kind: 'keg', id: k.id, dmg: TD_KEG.dmg, x: k.x, y: k.y, r: TD_KEG.r, hit: HIT_KEG, slowPct: 0, slowTicks: 0, burnDps: 0, burnTicks: 0, pull: 0 });
  }
}

function resolvePend(s: TdState, ev: TdEvent[]): void {
  const I = inner(s);
  const keep: Pend[] = [];
  const due: Pend[] = [];
  for (const p of I.pend) (p.t > s.tick ? keep : due).push(p);
  I.pend = keep;
  for (const p of due) {
    if (p.kind === 'unit') {
      const e = s.enemies.find((q) => q.id === p.id);
      if (!e || (e.mode !== 'in' && e.mode !== 'out')) continue;
      damageEnemy(s, ev, e, guardedHit(s, ev, e, p), p.hit);
      if (e.hp <= 0) continue;
      slowEnemy(s, e, p.slowPct, p.slowTicks);
      if (p.pull > 0 && !isAir(e.kind)) pullBack(e, p.pull);
    } else if (p.kind === 'lob') {
      lobBlast(s, ev, p);
    } else if (p.kind === 'splash') {
      explode(s, ev, p.x, p.y, { dmg: p.dmg, r: p.r, hit: p.hit, fog: false, friendly: false, blocks: false, slowPct: p.slowPct, slowTicks: p.slowTicks, ...(p.stun ? { stun: p.stun } : {}) });
      if (p.burnDps > 0) s.fires.push({ x: p.x, y: p.y, r: p.r, dps: p.burnDps, until: s.tick + p.burnTicks });
    } else if (p.kind === 'keg') {
      explode(s, ev, p.x, p.y, { dmg: p.dmg, r: p.r, hit: p.hit, fog: true, friendly: true, blocks: true, slowPct: 0, slowTicks: 0 });
    } else {
      explode(s, ev, p.x, p.y, { dmg: p.dmg, r: p.r, hit: p.hit, fog: true, friendly: false, blocks: true, slowPct: 0, slowTicks: 0 });
    }
  }
}

/** 手雷落地（规则版本 10）：英雄挨全额，墙按 wallPct% 算，拒马挨全额；不炸敌人自己 */
function lobBlast(s: TdState, ev: TdEvent[], p: Pend): void {
  const r2 = p.r * p.r;
  ev.push({ type: 'explode', x: p.x, y: p.y, r: p.r });
  if (d2(s.hero.x, s.hero.y, p.x, p.y) <= r2) damageHero(s, ev, p.dmg);
  const wd = Math.floor((p.dmg * (p.wallPct ?? 100)) / 100);
  for (const w of s.walls) if (!w.destroyed && d2(w.x * UNIT + 50, w.y * UNIT + 50, p.x, p.y) <= r2) damageWall(s, ev, w, wd);
  for (const b of [...s.barricades]) {
    if (d2(b.x * UNIT + 50, b.y * UNIT + 50, p.x, p.y) > r2 + UNIT * UNIT) continue;
    hitBarricade(s, ev, b, p.dmg);
  }
}

function hitBarricade(s: TdState, ev: TdEvent[], bar: TdBarricade, dmg: number): void {
  bar.hp -= dmg;
  if (bar.hp <= 0 && s.barricades.includes(bar)) {
    s.barricades = s.barricades.filter((b) => b !== bar);
    ev.push({ type: 'barricadeBreak', id: bar.id });
  }
}

/** 掷弹兵扔一颗手雷到 (tx, ty)：推 lob 事件给画面画抛物线，落地按 lobBlast 结算 */
function lob(s: TdState, ev: TdEvent[], e: TdEnemy, tx: number, ty: number): void {
  const def = TD2_ENEMIES[e.kind];
  const lb = def.lob;
  if (!lb || s.tick < e.cd) return;
  e.cd = s.tick + def.reload;
  if (tx !== e.x) e.face = tx > e.x ? 1 : -1;
  const fl = Math.max(12, flightTicks(e.x, e.y, tx, ty, 18));
  ev.push({ type: 'lob', id: e.id, x0: e.x, y0: e.y, x1: tx, y1: ty, t1: s.tick + fl, r: lb.r });
  inner(s).pend.push({
    t: s.tick + fl, kind: 'lob', id: e.id, dmg: def.dmg, x: tx, y: ty, r: lb.r, hit: HIT_KEG, slowPct: 0, slowTicks: 0, burnDps: 0, burnTicks: 0, pull: 0, wallPct: lb.wallPct,
  });
}

/** 掷弹兵往前看：沿流场再走 3 格以内有挡路的墙或拒马就返回它的中心（停下扔雷），没有为 null */
function lobAhead(s: TdState, e: TdEnemy, f: Int32Array, range: number): { x: number; y: number } | null {
  const I = inner(s);
  const here = barricadeAt(s, cellOf(e.x, e.y));
  let x = e.x;
  let y = e.y;
  for (let k = 0; k < 4; k++) {
    const n = nextCell(I.occ, f, x, y);
    if (n < 0) return null;
    const cx = cellX(n);
    const cy = cellY(n);
    if (d2(cx, cy, e.x, e.y) > range * range) return null;
    if (I.occ[n] === 1) return { x: cx, y: cy };
    const bar = barricadeAt(s, n);
    if (bar && bar !== here) return { x: bar.x * UNIT + 50, y: bar.y * UNIT + 50 };
    x = cx;
    y = cy;
  }
  return null;
}

/** 拖拽：拉回到 ticks 拍之前走过的位置（每 10 拍记一次），走过的路一定能站 */
function pullBack(e: TdEnemy, ticks: number): void {
  const back = Math.max(1, Math.floor(ticks / 10));
  const n = e.trail.length / 2;
  if (n === 0) return;
  const i = Math.max(0, n - back);
  e.x = e.trail[i * 2] as number;
  e.y = e.trail[i * 2 + 1] as number;
  e.trail.length = i * 2;
}

// ------------------------------------------------------------ 关卡的平均量（英雄技能的相对值）

/** 一波的敌人总血（分裂小艇算上分出来的）和个数 */
function waveHp(lv: TdLevel, w: number): { hp: number; n: number } {
  let hp = 0;
  let n = 0;
  for (const g of lv.waves[w]?.groups ?? []) {
    const def = TD2_ENEMIES[g.enemy];
    let one = enemyHp(lv, g.enemy, w);
    if (def.split) one += enemyHp(lv, def.split.kind, w) * def.split.n;
    hp += one * g.n;
    n += g.n;
  }
  return { hp, n };
}

/** 这一关每波平均敌人总血、平均单个敌人血量（只算主体，不算分出来的）。无尽关按当前前后三波现算 */
function levelAvg(s: TdState): { wave: number; unit: number } {
  const I = inner(s);
  const lv = s.level;
  if (!lv.endless && I.avg) return I.avg;
  const from = lv.endless ? Math.max(0, s.wave - 1) : 0;
  const to = lv.endless ? s.wave + 2 : lv.waves.length;
  ensureWaves(lv, to);
  let total = 0;
  let units = 0;
  let unitHp = 0;
  let waves = 0;
  for (let w = from; w < Math.min(to, lv.waves.length); w++) {
    total += waveHp(lv, w).hp;
    waves++;
    for (const g of lv.waves[w]?.groups ?? []) {
      unitHp += enemyHp(lv, g.enemy, w) * g.n;
      units += g.n;
    }
  }
  const avg = { wave: waves > 0 ? Math.floor(total / waves) : 0, unit: units > 0 ? Math.floor(unitHp / units) : 0 };
  if (!lv.endless) I.avg = avg;
  return avg;
}

/** 拒马的血：这一关一波平均敌人总血 × hpPct% */
export function tdBarricadeHp(s: TdState): number {
  return Math.max(1, Math.floor((levelAvg(s).wave * TD2_HERO_SKILL.barricade.hpPct) / 100));
}

/** 炸药桶的伤害：这一关每波平均单个敌人血量 × dmgPct% */
export function tdBombDmg(s: TdState): number {
  return Math.max(1, Math.floor((levelAvg(s).unit * TD2_HERO_SKILL.bomb.dmgPct) / 100));
}

// ------------------------------------------------------------ 操作

function slotTower(s: TdState, slot: number): TdTower | undefined {
  const sl = s.slots[slot];
  if (!sl || sl.tower < 0) return undefined;
  return s.towers.find((t) => t.id === sl.tower);
}

/** 一波全部打死能拿多少金（分裂小艇算上分出来的） */
function waveGold(lv: TdLevel, w: number): number {
  let g = 0;
  for (const grp of lv.waves[w]?.groups ?? []) {
    const def = TD2_ENEMIES[grp.enemy];
    g += grp.n * (def.gold + (def.split ? def.split.n * TD2_ENEMIES[def.split.kind].gold : 0));
  }
  return g;
}

/** 第 w 波（w ≥ 1）开打前的倒数：每波的倒数，首领波前另加 bossExtra */
function gapBefore(lv: TdLevel, w: number): number {
  const boss = !!lv.waves[w]?.boss;
  const extra = (lv as TdLevel & { bossExtra?: number }).bossExtra ?? TD2_BOSS_EXTRA_TICKS;
  return lv.waveTicks + (boss ? extra : 0);
}

function startWave(s: TdState, ev: TdEvent[], early: boolean): void {
  const I = inner(s);
  const lv = s.level;
  const w = s.wave;
  ensureWaves(lv, w + ENDLESS_AHEAD);
  const wave = lv.waves[w];
  if (!wave) return;
  let bonus = 0;
  let cdCut = 0;
  if (early) {
    const b = tdCallBonus(s);
    bonus = b.gold;
    cdCut = b.cdCut;
    if (bonus > 0) addGold(s, bonus);
    if (cdCut > 0) {
      const h = s.hero;
      h.kegReady = Math.max(s.tick, h.kegReady - cdCut);
      h.barricadeReady = Math.max(s.tick, (h.barricadeReady ?? 0) - cdCut);
    }
  }
  for (const g of wave.groups) {
    let lane = lv.lanes[g.lane % Math.max(1, lv.lanes.length)] ?? { x: -2, y: 10 };
    if (g.lane === lv.lanes.length) lane = tideOpenAt(lv, w) ? (lv.tide as NonNullable<TdLevel['tide']>).lane : (lv.lanes[0] ?? lane);
    for (let i = 0; i < g.n; i++) {
      I.spawns.push({ t: s.tick + (g.delay ?? 0) + i * g.every, kind: g.enemy, x: lane.x * UNIT + 50, y: lane.y * UNIT + 50, wave: w });
      I.waveLeft[w] = (I.waveLeft[w] ?? 0) + 1;
    }
  }
  s.wave++;
  // 大潮无尽：波次补到 w+ENDLESS_AHEAD，下一波永远有
  if (s.wave < lv.waves.length) {
    I.cdTotal = gapBefore(lv, s.wave);
    s.next = s.tick + I.cdTotal;
  } else s.next = -1;
  ev.push({ type: 'wave', wave: w, early, bonus, cdCut });
}

/** 一格能不能放拒马：岛上（含沙滩）能走的空地，没有别的拒马 */
function barricadeCell(s: TdState, x: number, y: number): { cx: number; cy: number } | null {
  ensureGrid(s);
  const cx = Math.floor(x / UNIT);
  const cy = Math.floor(y / UNIT);
  if (!inGrid(cx, cy) || (inner(s).occ[cellIdx(cx, cy)] ?? 0) !== 0) return null;
  if (s.barricades.some((b) => b.x === cx && b.y === cy)) return null;
  return { cx, cy };
}

function doAction(s: TdState, ev: TdEvent[], a: TdAction): void {
  const I = inner(s);
  const h = s.hero;
  switch (a.type) {
    case 'call':
      if (s.wave < s.level.waves.length) startWave(s, ev, true);
      return;
    case 'build': {
      const sl = s.slots[a.slot];
      if (!sl || sl.tower >= 0 || sl.wreck !== undefined || !isTdTowerKind(a.kind) || !s.unlocked.includes(a.kind)) return;
      const cost = TD2_COST[a.kind];
      if (s.gold < cost) return;
      if (tdBuildBlock(s, a.slot)) return;
      s.gold -= cost;
      const t: TdTower = { id: I.nextId++, kind: a.kind, level: TD_TIER_LEVEL[1], x: sl.x, y: sl.y, size: 2, branch: [], cd: s.tick, aim: -1, lock: -1, slot: a.slot, tier: 1 };
      s.towers.push(t);
      sl.tower = t.id;
      sl.ups = 0;
      sl.spent = cost;
      I.ver++;
      return;
    }
    case 'up': {
      const sl = s.slots[a.slot];
      const t = slotTower(s, a.slot);
      if (!sl || !t || t.tier === undefined || t.tier >= 3) return;
      const cost = tdUpCost(t.kind, t.tier - 1);
      if (cost < 0 || s.gold < cost) return;
      s.gold -= cost;
      const tier: TdTier = t.tier === 1 ? 2 : 3;
      t.tier = tier;
      t.level = TD_TIER_LEVEL[tier];
      sl.ups = tier - 1;
      sl.spent = (sl.spent ?? 0) + cost;
      I.stats.delete(t.id);
      return;
    }
    case 'branch': {
      // 局内的塔到 3 阶才选分叉（先 3 级那一档，再 6 级那一档）
      const t = slotTower(s, a.slot);
      if (t?.tier !== 3 || typeof a.branch !== 'string' || branchError(t.kind, t.level, t.branch, a.branch) !== null) return;
      t.branch = [...t.branch, a.branch];
      I.stats.delete(t.id);
      return;
    }
    case 'sell': {
      const sl = s.slots[a.slot];
      const t = slotTower(s, a.slot);
      if (!sl || !t) return;
      const refund = tdSellRefund(s, a.slot);
      s.towers = s.towers.filter((q) => q.id !== t.id);
      I.stats.delete(t.id);
      I.jam.delete(t.id);
      sl.tower = -1;
      sl.ups = 0;
      sl.spent = 0;
      I.ver++;
      // 退款不算局内挣的（goldEarned 不加）
      s.gold += refund;
      ev.push({ type: 'sell', slot: a.slot, refund });
      return;
    }
    case 'repair': {
      const w = s.walls.find((q) => q.id === a.id);
      if (!w || w.hp >= w.maxHp || s.gold < TD2_ECON.repairGold) return;
      if (w.destroyed) {
        for (const e of s.enemies) if ((e.mode === 'in' || e.mode === 'out') && cellOf(e.x, e.y) === cellIdx(w.x, w.y)) return;
        if (cellOf(h.x, h.y) === cellIdx(w.x, w.y)) return;
        w.destroyed = false;
        I.ver++;
      }
      s.gold -= TD2_ECON.repairGold;
      w.hp = w.maxHp;
      ev.push({ type: 'wall', id: w.id, destroyed: false });
      return;
    }
    case 'move':
      if (h.respawn >= 0 || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return;
      h.goal = { x: Math.round(a.x), y: Math.round(a.y) };
      if (s.rules >= TD_HERO_AUTO_RULES) {
        // 指到木台上就挪到台边：英雄站在台上会挡住造塔
        h.goal = offSlot(s, h.goal.x, h.goal.y);
        inner(s).heroCmd = true;
      }
      h.post = { ...h.goal };
      inner(s).heroAuto = false;
      h.clear = -1;
      if (s.escort) s.escort.follow = false; // 自己指了地方就不跟船了
      return;
    case 'clear': {
      const b = s.blocks.find((q) => q.id === a.id);
      if (h.respawn >= 0 || !b || b.destroyed) return;
      h.clear = b.id;
      h.goal = { x: tcx(b), y: tcy(b) };
      inner(s).heroAuto = false;
      return;
    }
    case 'clearNow': {
      const b = s.blocks.find((q) => q.id === a.id);
      const cost = tdClearCost(s, a.id);
      if (!b || cost < 0 || s.gold < cost) return;
      s.gold -= cost;
      if (h.clear === b.id) {
        h.clear = -1;
        h.goal = null;
      }
      blockGone(s, ev, b, true, 0);
      return;
    }
    case 'keg': {
      // 炸药桶：伤害按这一关每波平均单个敌人血量的相对值，按爆破算（打不到飞的），炸障碍、点火药桶，不炸自己人
      const sk = TD2_HERO_SKILL.bomb;
      if (h.respawn >= 0 || s.tick < h.kegReady || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return;
      if (d2(h.x, h.y, a.x, a.y) > sk.range * sk.range) return;
      h.kegReady = s.tick + sk.cd;
      I.pend.push({ t: s.tick + 10, kind: 'heroKeg', id: -1, dmg: tdBombDmg(s), x: Math.round(a.x), y: Math.round(a.y), r: sk.r, hit: HIT_KEG, slowPct: 0, slowTicks: 0, burnDps: 0, burnTicks: 0, pull: 0 });
      ev.push({ type: 'hero', what: 'keg' });
      return;
    }
    case 'barricade': {
      const sk = TD2_HERO_SKILL.barricade;
      if (h.respawn >= 0 || s.tick < (h.barricadeReady ?? 0) || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return;
      const c = barricadeCell(s, a.x, a.y);
      if (!c || d2(h.x, h.y, c.cx * UNIT + 50, c.cy * UNIT + 50) > sk.range * sk.range) return;
      h.barricadeReady = s.tick + sk.cd;
      const hp = tdBarricadeHp(s);
      const b: TdBarricade = { id: I.nextId++, x: c.cx, y: c.cy, hp, maxHp: hp, until: s.tick + sk.ticks };
      s.barricades.push(b);
      ev.push({ type: 'barricade', id: b.id, x: b.x, y: b.y, until: b.until });
      ev.push({ type: 'hero', what: 'barricade' });
      return;
    }
    case 'pace':
      if (s.escort && (a.pace === 'hold' || a.pace === 'sail' || a.pace === 'rush') && s.escort.pace !== a.pace) {
        s.escort.pace = a.pace;
        ev.push({ type: 'pace', pace: a.pace });
      }
      return;
    case 'mend': {
      const es = s.escort;
      if (!es || s.tick < es.mendReady || s.gold < ESCORT_MEND.gold || es.hull >= es.def.hull) return;
      s.gold -= ESCORT_MEND.gold;
      es.hull = Math.min(es.def.hull, es.hull + Math.max(1, Math.floor((es.def.hull * ESCORT_MEND.pct) / 100)));
      es.mendReady = s.tick + ESCORT_MEND.cd;
      es.mends++;
      ev.push({ type: 'mend', hull: es.hull });
      return;
    }
    case 'follow':
      if (s.escort) s.escort.follow = !!a.on;
      return;
    case 'rally':
      // 规则版本 7 起号令是被动（英雄身边的塔攻速加成，见 stepTowers），这条旧命令不做事
      return;
  }
}

// ------------------------------------------------------------ 一拍

function moveToward(e: { x: number; y: number; face: 1 | -1 }, tx: number, ty: number, spd: number): void {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = isqrt(dx * dx + dy * dy);
  if (d === 0) return;
  const st = Math.min(spd, d);
  if (dx !== 0) e.face = dx > 0 ? 1 : -1;
  e.x += Math.round((dx * st) / d);
  e.y += Math.round((dy * st) / d);
}

function stepSpawns(s: TdState, ev: TdEvent[]): void {
  const I = inner(s);
  if (I.spawns.length === 0) return;
  const keep: Internal['spawns'] = [];
  for (const sp of I.spawns) {
    if (sp.t > s.tick) {
      keep.push(sp);
      continue;
    }
    spawnEnemy(s, ev, sp.kind, sp.x + I.rng.int(81) - 40, sp.y + I.rng.int(81) - 40, sp.x, sp.y, sp.wave);
  }
  I.spawns = keep;
}

/** 去抢的敌人选哪个宝藏箱：走过去代价最小的（墙按代价算，所以"能走到"的都算） */
function pickTreasure(s: TdState, e: TdEnemy, wallCost: number): { f: Int32Array; d: number } | null {
  let best: Int32Array | null = null;
  let bestD = INF;
  const c = cellOf(e.x, e.y);
  for (let i = 0; i < s.treasures.length; i++) {
    const f = treasureFlow(s, i, wallCost);
    const d = f[c] as number;
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best ? { f: best, d: bestD } : null;
}

function stepEnemies(s: TdState, ev: TdEvent[]): void {
  const h = s.hero;
  const captains = s.enemies.filter((e) => e.kind === 'captain' && (e.mode === 'in' || e.mode === 'out'));
  // 英雄最多同时缠住 maxEngaged 个地面敌人（按数组顺序先到先缠），多的绕过去
  let engaged = 0;
  if (s.escort) s.escort.biters = 0;
  for (const e of s.enemies) {
    if (e.mode !== 'in' && e.mode !== 'out') continue;
    const def = TD2_ENEMIES[e.kind];
    const fly = isAir(e.kind);
    if (s.tick % 10 === 0) {
      e.trail.push(e.x, e.y);
      if (e.trail.length > 12) e.trail.splice(0, 2);
    }
    // 规则版本 10：震晕中不走不打（stunUntil 只有震荡炮会写）
    if (stunned(e, s.tick)) continue;
    let spd = def.speed * 100;
    for (const c of captains) {
      if (c === e) continue;
      const a = TD2_ENEMIES.captain.aura;
      if (a && d2(c.x, c.y, e.x, e.y) <= a.r * a.r) {
        spd = Math.floor((spd * (100 + a.pct)) / 100);
        break;
      }
    }
    if (s.tick < e.slowUntil) spd = Math.floor((spd * (100 - e.slowPct)) / 100);
    spd = Math.max(1, Math.floor(spd / 100));

    if (e.mode === 'in') {
      // 掷弹兵：英雄在 3 格内就站住往他身上扔雷（不贴脸，不算缠住）
      if (def.lob && h.respawn < 0 && d2(h.x, h.y, e.x, e.y) <= def.lob.range * def.lob.range) {
        lob(s, ev, e, h.x, h.y);
        continue;
      }
      // 英雄挡路：近身就先打英雄（飞的不理）
      if (!fly && h.respawn < 0 && engaged < TD2_HERO.maxEngaged && d2(h.x, h.y, e.x, e.y) <= (def.reach + 30) * (def.reach + 30)) {
        engaged++;
        if (s.tick >= e.cd) {
          e.cd = s.tick + def.reload;
          damageHero(s, ev, def.dmg);
        }
        continue;
      }
      if (s.escort) {
        escortEnemy(s, ev, e, spd);
        continue;
      }
      if (s.vault <= 0) {
        // 宝藏箱空了：去捡地上的，地上也没有就空手回船
        const pile = nearestPile(s, e.x, e.y);
        if (!pile) {
          e.mode = 'out';
          continue;
        }
        if (d2(pile.x, pile.y, e.x, e.y) <= TD_PICK_R * TD_PICK_R) {
          e.carry = pile.n;
          s.piles.splice(s.piles.indexOf(pile), 1);
          e.mode = 'out';
          ev.push({ type: 'grab', id: e.id, n: e.carry });
          continue;
        }
        if (fly) moveToward(e, pile.x, pile.y, spd);
        else walk(s, ev, e, cellFlow(s, cellOf(pile.x, pile.y), TD_WALL_COST), spd, pile.x, pile.y);
        continue;
      }
      if (fly) {
        let tx = 0;
        let ty = 0;
        let bd = Number.POSITIVE_INFINITY;
        for (const t of s.treasures) {
          const d = d2(t.x * UNIT + 50, t.y * UNIT + 50, e.x, e.y);
          if (d < bd) {
            bd = d;
            tx = t.x * UNIT + 50;
            ty = t.y * UNIT + 50;
          }
        }
        if (bd <= 80 * 80) grab(s, ev, e);
        else moveToward(e, tx, ty, spd);
        continue;
      }
      const sj = def.bomb ? s.level.sapperJam : undefined;
      if (sj && blastOnTower(s, ev, e, sj)) continue;
      const wc = def.bomb ? TD_SAPPER_WALL_COST : TD_WALL_COST;
      const pick = pickTreasure(s, e, wc);
      if (!pick) continue;
      if (pick.d === 0) {
        grab(s, ev, e);
        continue;
      }
      walk(s, ev, e, pick.f, spd, Number.NaN, Number.NaN);
    } else {
      // 回船：飞的直线，走的按流场（墙、拒马照样砸）
      if (d2(e.hx, e.hy, e.x, e.y) <= 60 * 60) {
        e.mode = 'gone';
        if (e.carry > 0) {
          s.lost += e.carry;
          ev.push({ type: 'escape', id: e.id, n: e.carry });
        }
        resolveEnemy(s, e);
        continue;
      }
      if (fly) moveToward(e, e.hx, e.hy, spd);
      else walk(s, ev, e, cellFlow(s, cellOf(e.hx, e.hy), TD_WALL_COST), spd, e.hx, e.hy);
    }
  }
}

/** 护航：这个敌人此刻咬得到船吗 */
function biting(e: TdEnemy, ship: { x: number; y: number }): boolean {
  const r = TD2_ENEMIES[e.kind].reach + ESCORT_SHIP_R;
  return d2(e.x, e.y, ship.x, ship.y) <= r * r;
}

/** 护航里一个在追船的敌人（英雄挡路那段已经在 stepEnemies 里处理过了）：够得着就站住咬，否则朝船走（地面按流场，飞的直线） */
function escortEnemy(s: TdState, ev: TdEvent[], e: TdEnemy, spd: number): void {
  const es = s.escort as EscortState;
  const def = TD2_ENEMIES[e.kind];
  const ship = escortShip(es);
  if (!isAir(e.kind) && def.bomb && s.level.sapperJam && blastOnTower(s, ev, e, s.level.sapperJam)) return;
  if (biting(e, ship)) {
    es.biters++;
    if (!es.arrived && s.tick >= e.cd) {
      e.cd = s.tick + def.reload;
      const dmg = escortBite(def.dmg);
      es.hull -= dmg;
      ev.push({ type: 'bite', id: e.id, dmg, hull: Math.max(0, es.hull) });
    }
    return;
  }
  if (isAir(e.kind)) moveToward(e, ship.x, ship.y, spd);
  else walk(s, ev, e, cellFlow(s, cellOf(ship.x, ship.y), def.bomb ? TD_SAPPER_WALL_COST : TD_WALL_COST), spd, ship.x, ship.y);
}

/** 护航：船按速度前进（咬住减速），过隘口发事件，到终点就算到达 */
function stepEscort(s: TdState, ev: TdEvent[]): void {
  const es = s.escort as EscortState;
  const end = (es.def.route.length - 1) * ESCORT_CELL;
  es.pos = Math.min(end, es.pos + escortRate(es));
  while (es.gatesPassed < es.def.gates.length && (es.def.gates[es.gatesPassed] as number) * ESCORT_CELL <= es.pos) {
    ev.push({ type: 'gate', index: es.def.gates[es.gatesPassed] as number });
    es.gatesPassed++;
  }
  if (es.pos >= end && !es.arrived) {
    es.arrived = true;
    ev.push({ type: 'arrive', hullPct: escortHullPct(es) });
  }
}

/** 护航英雄跟随：每 10 拍把目标设到船旁边一个能站的格 */
function followShip(s: TdState): void {
  const es = s.escort as EscortState;
  const h = s.hero;
  if (!es.follow || s.tick % 10 !== 0 || h.respawn >= 0 || h.clear >= 0) return;
  ensureGrid(s);
  const occ = inner(s).occ;
  const ship = escortShip(es);
  const bx = Math.floor(ship.x / UNIT);
  const by = Math.floor(ship.y / UNIT);
  for (const [ox, oy] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1], [0, 0]] as const) {
    if (!inGrid(bx + ox, by + oy) || occ[cellIdx(bx + ox, by + oy)] !== 0) continue;
    const gx = (bx + ox) * UNIT + 50;
    const gy = (by + oy) * UNIT + 50;
    if (d2(gx, gy, h.x, h.y) > 60 * 60) h.goal = { x: gx, y: gy };
    return;
  }
}

/** 炸塔工兵（关卡写了 sapperJam）：摸到离塔 1.5 格就引爆，自己没了（不给金币），半径内的塔哑火 */
function blastOnTower(s: TdState, ev: TdEvent[], e: TdEnemy, sj: NonNullable<TdLevel['sapperJam']>): boolean {
  const hit = s.towers.some((t) => d2(tcx(t), tcy(t), e.x, e.y) <= 150 * 150);
  if (!hit) return false;
  ev.push({ type: 'explode', x: e.x, y: e.y, r: sj.r * UNIT });
  jamTowers(s, ev, e.x, e.y, sj.r * UNIT, sj.ticks, 100000);
  e.hp = 0;
  e.mode = 'dead';
  ev.push({ type: 'die', id: e.id, kind: e.kind });
  resolveEnemy(s, e);
  return true;
}

function nearestPile(s: TdState, x: number, y: number): TdState['piles'][number] | undefined {
  let best: TdState['piles'][number] | undefined;
  let bd = Number.POSITIVE_INFINITY;
  for (const p of s.piles) {
    const d = d2(p.x, p.y, x, y);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

function grab(s: TdState, ev: TdEvent[], e: TdEnemy): void {
  const n = Math.min(TD2_ENEMIES[e.kind].carry, s.vault);
  s.vault -= n;
  e.carry = n;
  e.mode = 'out';
  ev.push({ type: 'grab', id: e.id, n });
}

/** 格子 n 在拒马挡住的 3×3 范围里 */
function barricadeAt(s: TdState, n: number): TdBarricade | undefined {
  if (s.barricades.length === 0) return undefined;
  const x = cellX(n);
  const y = cellY(n);
  for (const b of s.barricades) if (Math.abs(x - (b.x * UNIT + 50)) <= UNIT && Math.abs(y - (b.y * UNIT + 50)) <= UNIT) return b;
  return undefined;
}

/** 沿流场走一步；前面是墙就砸（工兵炸），前面是拒马就砸拒马；已经在终点格就直走到 (fx, fy)（NaN = 不用走） */
function walk(s: TdState, ev: TdEvent[], e: TdEnemy, f: Int32Array, spd: number, fx: number, fy: number): void {
  const I = inner(s);
  const n = nextCell(I.occ, f, e.x, e.y);
  if (n < 0) {
    if (Number.isFinite(fx)) moveToward(e, fx, fy, spd);
    return;
  }
  const def = TD2_ENEMIES[e.kind];
  // 掷弹兵：前面 3 格内有挡路的墙或拒马就停下扔雷，不走过去砸
  if (def.lob) {
    const at = lobAhead(s, e, f, def.lob.range);
    if (at) {
      lob(s, ev, e, at.x, at.y);
      return;
    }
  }
  // 拒马：要走进它挡的 3×3 才拦（已经在里面的，比如放在敌人脚下的，照常走出去）
  const bar = barricadeAt(s, n);
  if (bar && barricadeAt(s, cellOf(e.x, e.y)) !== bar) {
    if (s.tick >= e.cd) {
      e.cd = s.tick + def.reload;
      hitBarricade(s, ev, bar, def.dmg);
    }
    return;
  }
  if (I.occ[n] === 1) {
    const w = s.walls[(I.wallAt[n] ?? 0) - 1];
    if (!w) return;
    if (def.bomb) {
      // 工兵：在墙前炸开，自己也没了（不给金币：不是被打死的）
      explodeWalls(s, ev, w.x * UNIT + 50, w.y * UNIT + 50, def.bomb.dmg, def.bomb.r);
      e.hp = 0;
      e.mode = 'dead';
      ev.push({ type: 'die', id: e.id, kind: e.kind });
      resolveEnemy(s, e);
      return;
    }
    if (s.tick >= e.cd) {
      e.cd = s.tick + def.reload;
      damageWall(s, ev, w, def.dmg);
    }
    return;
  }
  // 各走各的小道：每个敌人在格子里有一个按 id 定的固定偏移，同一条路上的不会叠成一个点
  const o = laneOffset(e.id, TD_LANE_SPREAD);
  moveToward(e, cellX(n) + o.x, cellY(n) + o.y, spd);
}

function explodeWalls(s: TdState, ev: TdEvent[], x: number, y: number, dmg: number, r: number): void {
  ev.push({ type: 'explode', x, y, r });
  for (const w of s.walls) if (!w.destroyed && d2(w.x * UNIT + 50, w.y * UNIT + 50, x, y) <= r * r) damageWall(s, ev, w, dmg);
}

/** 炸哑 (x, y) 周围 r 单位内离得最近的至多 max 座塔 ticks 拍（固定顺序：先近后远，同距离按 id） */
function jamTowers(s: TdState, ev: TdEvent[], x: number, y: number, r: number, ticks: number, max: number): void {
  const I = inner(s);
  const near = s.towers
    .map((t) => ({ t, d: d2(tcx(t), tcy(t), x, y) }))
    .filter((q) => q.d <= r * r)
    .sort((a, b) => a.d - b.d || a.t.id - b.t.id)
    .slice(0, max);
  for (const q of near) {
    const until = s.tick + ticks;
    if ((I.jam.get(q.t.id) ?? 0) >= until) continue;
    I.jam.set(q.t.id, until);
    ev.push({ type: 'jam', id: q.t.id, until });
  }
}

/** 首领技能：血量掉到一半发一次，在身边召一批小敌人，再炸哑离它最近的几座塔 */
function stepBoss(s: TdState, ev: TdEvent[]): void {
  const sk = s.level.bossSkill;
  if (!sk) return;
  const I = inner(s);
  for (const e of s.enemies) {
    if (e.kind !== 'captain' || e.mode !== 'in' || e.hp * 2 > e.maxHp || I.skilled.has(e.id)) continue;
    I.skilled.add(e.id);
    ev.push({ type: 'skill', id: e.id, x: e.x, y: e.y });
    for (let i = 0; i < sk.summon.n; i++) {
      I.waveLeft[e.wave] = (I.waveLeft[e.wave] ?? 0) + 1;
      spawnEnemy(s, ev, sk.summon.kind, e.x + I.rng.int(201) - 100, e.y + I.rng.int(201) - 100, e.hx, e.hy, e.wave);
    }
    jamTowers(s, ev, e.x, e.y, 100000, sk.jamTicks, sk.jam);
  }
}

/**
 * 敌人离宝藏还有多远（瞄准排序用，越小越先打）：去抢的按流场路程（地面）或直线距离（飞的）到最近的宝藏箱，
 * 拿着宝藏回船的按离船的直线距离（这一类整体最优先），空手回船的最后。和流场同一个尺度（1 格 = 10）。
 */
function progressOf(s: TdState, e: TdEnemy, memo: Map<number, number>): number {
  const m = memo.get(e.id);
  if (m !== undefined) return m;
  let v: number;
  if (s.escort) {
    // 护航：离船还有多远（地面按追船流场，飞的直线）
    const ship = escortShip(s.escort);
    if (isAir(e.kind)) v = Math.floor(isqrt(d2(e.x, e.y, ship.x, ship.y)) / 10);
    else v = cellFlow(s, cellOf(ship.x, ship.y), TD2_ENEMIES[e.kind].bomb ? TD_SAPPER_WALL_COST : TD_WALL_COST)[cellOf(e.x, e.y)] as number;
    memo.set(e.id, v);
    return v;
  }
  if (e.mode === 'out') v = e.carry > 0 ? Math.floor(isqrt(d2(e.x, e.y, e.hx, e.hy)) / 10) : INF;
  else if (isAir(e.kind)) {
    v = INF;
    for (const t of s.treasures) v = Math.min(v, Math.floor(isqrt(d2(e.x, e.y, t.x * UNIT + 50, t.y * UNIT + 50)) / 10));
  } else {
    const p = pickTreasure(s, e, TD2_ENEMIES[e.kind].bomb ? TD_SAPPER_WALL_COST : TD_WALL_COST);
    v = p ? p.d : INF;
  }
  memo.set(e.id, v);
  return v;
}

/**
 * 弹的飞行拍数：臼炮按距离在 20–28 拍（1–1.4 秒）之间插值，太久了玩家对不上是哪一发；火箭每拍 50、喷火 60、其余 35
 */
function shotTicks(kind: BuildingKind, x0: number, y0: number, x1: number, y1: number): number {
  if (kind === 'mortar') return Math.min(28, Math.max(20, flightTicks(x0, y0, x1, y1, 36)));
  return flightTicks(x0, y0, x1, y1, kind === 'flame' || kind === 'sniper' ? 60 : kind === 'rocket' ? 50 : 35);
}

function stepTowers(s: TdState, ev: TdEvent[]): void {
  const I = inner(s);
  const h = s.hero;
  const rally = TD2_HERO_SKILL.rally;
  const memo = new Map<number, number>();
  // 已经在路上的直射伤害：够打死的敌人算"必死"，别的塔不再往它身上浪费炮弹（不然五座塔盯一个，落地时八成已经死了）
  const due = new Map<number, number>();
  const kindOf = new Map<number, TdEnemyKind>();
  for (const e of s.enemies) kindOf.set(e.id, e.kind);
  const owe = (id: number, dmg: number, h: Hit): void => {
    const k = kindOf.get(id);
    if (k) due.set(id, (due.get(id) ?? 0) + Math.floor((dmg * mult(h, TD_ENEMY_ARMOR[k])) / 100));
  };
  for (const p of I.pend) if (p.kind === 'unit') owe(p.id, p.dmg, p.hit);
  for (const t of s.towers) {
    const st = towerStats(s, t);
    if (st.dmg <= 0) continue;
    if (I.jam.size > 0 && (I.jam.get(t.id) ?? 0) > s.tick) {
      t.aim = -1;
      continue;
    }
    const cx = tcx(t);
    const cy = tcy(t);
    const cand: TdEnemy[] = [];
    for (const e of s.enemies) if (targetable(s, e, st) && inRing(d2(e.x, e.y, cx, cy), st.range, st.minRange)) cand.push(e);
    if (cand.length === 0) {
      t.aim = -1;
      t.lock = -1;
      continue;
    }
    // 优先级类：防空塔先打飞的；再是拿着宝藏回船的（护航是正在咬船的）；同一类里离宝藏箱路程最近的（走在最前面的）；锁定见 combat.ts
    const ship = s.escort ? escortShip(s.escort) : undefined;
    // 必死只在要开火的这一拍算：装填中照旧盯着锁定的目标，炮管不跟着在途伤害来回甩
    const ready = s.tick >= t.cd;
    // 拿着宝藏的（护航是咬着船的）和会炸哑塔的工兵（工兵关）同属最急的一类：一个是丢分，一个是塔要哑
    const jammer = !!s.level.sapperJam;
    const urgent = (e: TdEnemy): boolean => (ship ? biting(e, ship) : e.carry > 0) || (jammer && !!TD2_ENEMIES[e.kind].bomb);
    const cls = (e: TdEnemy): number => (st.airFirst && !isAir(e.kind) ? 2 : 0) + (urgent(e) ? 0 : 1);
    const sniper = t.kind === 'sniper';
    if (!ready && !sniper) {
      // 装填中：锁定的还在、没有更高一类的就接着盯（不排序，省下每拍按路程排一遍）
      const held = keepLock(cand, t.lock ?? -1, cls);
      if (held) {
        t.aim = held.id;
        continue;
      }
    }
    const doomed = (e: TdEnemy): number => (ready && (due.get(e.id) ?? 0) >= e.hp ? 4 : 0);
    let inRange: TdEnemy[];
    if (sniper) {
      // 狙击塔：优先打首领（船长），再是拿着宝藏的，其余按路程；装填完先锁定并推 aim 预警，SNIPE_WARN 拍后才开火，
      // 锁定的敌人死了或走出射程（cand 里没有）就作废重挑（DESIGN 14）
      const sCls = (e: TdEnemy): number => doomed(e) + (e.kind === 'captain' ? 0 : urgent(e) ? 1 : 2);
      let sn = I.snipe.get(t.id);
      let tgt = sn ? cand.find((e) => e.id === sn!.target) : undefined;
      if (sn && !tgt) {
        I.snipe.delete(t.id);
        sn = undefined;
      }
      if (!ready || !sn) {
        const pick = rankTargets(cand, t.lock ?? -1, (e) => [sCls(e), progressOf(s, e, memo)])[0] as TdEnemy;
        t.lock = pick.id;
        t.aim = pick.id;
        if (ready) {
          sn = { target: pick.id, fireAt: s.tick + SNIPE_WARN };
          I.snipe.set(t.id, sn);
          ev.push({ type: 'aim', id: t.id, target: pick.id, fireAt: sn.fireAt });
        }
        continue;
      }
      tgt = tgt as TdEnemy;
      t.aim = tgt.id;
      if (s.tick < sn.fireAt) continue;
      I.snipe.delete(t.id);
      inRange = [tgt];
    } else {
      inRange = rankTargets(cand, t.lock ?? -1, (e) => [doomed(e) + cls(e), progressOf(s, e, memo)]);
    }
    const best = inRange[0] as TdEnemy;
    t.lock = best.id;
    t.aim = best.id;
    if (s.tick < t.cd) continue;
    let reload = st.reload;
    // 号令（被动）：英雄身边的塔攻速加成
    if (h.respawn < 0 && d2(cx, cy, h.x, h.y) <= rally.r * rally.r) reload = Math.floor((reload * 100) / (100 + rally.pct));
    // 狙击塔的锁定预警算在装填里：一发的总间隔仍是 reload
    t.cd = s.tick + (sniper ? Math.max(1, reload - SNIPE_WARN) : reload);
    // 多发（火箭）：按顺序一人一发，人不够就从头再轮（单挑首领时三发都打它，不白丢三分之二的伤害）
    const shots: TdEnemy[] = [];
    for (let k = 0; k < Math.max(1, st.shots); k++) shots.push(inRange[k % inRange.length] as TdEnemy);
    for (const e of shots) {
      const fl = shotTicks(t.kind, cx, cy, e.x, e.y);
      // 瞄提前量：落点 = 敌人 fl 拍后的位置（直射的伤害跟着目标走，炸的按落点炸，所以炸的更要瞄准）
      const at = leadPoint(e, fl);
      ev.push({ type: 'shoot', id: t.id, x0: cx, y0: cy, x1: at.x, y1: at.y, t1: s.tick + fl, target: e.id });
      const base = { hit: { dt: st.dt, branch: st.branch, heavy: st.heavy }, slowPct: st.slowPct, slowTicks: st.slowTicks, burnDps: 0, burnTicks: 0, pull: 0, ...(s.rules >= 11 ? { sx: cx, sy: cy } : {}) };
      if (st.line) {
        // 贯穿：从塔到射程尽头这条线上 0.5 格内的都中
        const dx = at.x - cx;
        const dy = at.y - cy;
        const len = Math.max(1, isqrt(dx * dx + dy * dy));
        const ex = cx + Math.floor((dx * st.range) / len);
        const ey = cy + Math.floor((dy * st.range) / len);
        for (const o of inRange) if (segD2(o.x, o.y, cx, cy, ex, ey) <= 50 * 50) I.pend.push({ ...base, t: s.tick + fl, kind: 'unit', id: o.id, dmg: st.dmg, x: o.x, y: o.y, r: 0 });
      } else if (st.splash > 0) {
        I.pend.push({ ...base, t: s.tick + fl, kind: 'splash', id: -1, dmg: st.dmg, x: at.x, y: at.y, r: st.splash, burnDps: st.burnDps, burnTicks: st.burnTicks, ...(st.stun > 0 ? { stun: st.stun } : {}) });
      } else {
        I.pend.push({ ...base, t: s.tick + fl, kind: 'unit', id: e.id, dmg: st.dmg, x: e.x, y: e.y, r: 0, pull: st.pull });
        owe(e.id, st.dmg, base.hit);
      }
    }
  }
}

/** 点到线段距离的平方（整数近似：投影比例按千分之一取整） */
function segD2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const L = vx * vx + vy * vy;
  if (L === 0) return d2(px, py, ax, ay);
  let k = Math.floor((((px - ax) * vx + (py - ay) * vy) * 1000) / L);
  k = k < 0 ? 0 : Math.min(k, 1000);
  return d2(px, py, ax + Math.floor((vx * k) / 1000), ay + Math.floor((vy * k) / 1000));
}

function stepTraps(s: TdState, ev: TdEvent[]): void {
  for (const tr of inner(s).traps) {
    if (tr.fired) {
      // 地雷炸完过一阵重新埋好；焦油坑一局只用一次
      if (tr.kind === 'mine' && tr.rearm >= 0 && s.tick >= tr.rearm) {
        tr.fired = false;
        tr.rearm = -1;
        ev.push({ type: 'rearm', id: tr.id });
      }
      continue;
    }
    const lv = BUILDINGS[tr.kind].levels[0];
    const trig = Math.round((lv?.range ?? 1) * UNIT);
    let hit = false;
    for (const e of s.enemies) {
      if ((e.mode === 'in' || e.mode === 'out') && !isAir(e.kind) && d2(e.x, e.y, tr.x, tr.y) <= trig * trig) {
        hit = true;
        break;
      }
    }
    if (!hit) continue;
    tr.fired = true;
    const st = tr.st;
    if (tr.kind === 'mine') {
      tr.rearm = s.tick + TD2_MINE_REARM_TICKS;
      explode(s, ev, tr.x, tr.y, { dmg: st.dmg, r: st.splash, hit: st, fog: true, friendly: false, blocks: false, slowPct: st.slowPct, slowTicks: st.slowTicks });
    } else {
      ev.push({ type: 'explode', x: tr.x, y: tr.y, r: st.splash });
      for (const e of s.enemies) {
        if ((e.mode === 'in' || e.mode === 'out') && !isAir(e.kind) && d2(e.x, e.y, tr.x, tr.y) <= st.splash * st.splash) slowEnemy(s, e, st.slowPct, st.slowTicks);
      }
    }
    if (st.burnDps > 0) s.fires.push({ x: tr.x, y: tr.y, r: st.splash, dps: st.burnDps, until: s.tick + st.burnTicks });
  }
}

/** 留在地上的火（燃烧弹、火油、火油坑）：每半秒烧一次，按"火"算克制 */
function stepFires(s: TdState, ev: TdEvent[]): void {
  if (s.fires.length === 0) return;
  s.fires = s.fires.filter((f) => f.until > s.tick);
  if (s.tick % 10 !== 0) return;
  for (const f of s.fires) {
    for (const e of s.enemies) {
      if ((e.mode === 'in' || e.mode === 'out') && d2(e.x, e.y, f.x, f.y) <= f.r * f.r) damageEnemy(s, ev, e, Math.floor(f.dps / 2), HIT_BURN);
    }
  }
}

/** 拒马到时间就撤 */
function stepBarricades(s: TdState, ev: TdEvent[]): void {
  if (s.barricades.length === 0) return;
  const keep: TdBarricade[] = [];
  for (const b of s.barricades) {
    if (b.until > s.tick) keep.push(b);
    else ev.push({ type: 'barricadeBreak', id: b.id });
  }
  s.barricades = keep;
}

/** 地上的宝藏 TD2_TREASURE_ROLL_TICKS 拍没人捡就自己滚回箱子 */
function stepPiles(s: TdState, ev: TdEvent[]): void {
  for (let i = s.piles.length - 1; i >= 0; i--) {
    const p = s.piles[i] as TdState['piles'][number];
    if (s.tick - p.at < TD2_TREASURE_ROLL_TICKS) continue;
    s.vault += p.n;
    s.piles.splice(i, 1);
    ev.push({ type: 'roll', x: p.x, y: p.y, n: p.n });
  }
}

function stepHero(s: TdState, ev: TdEvent[]): void {
  const h = s.hero;
  const I = inner(s);
  const hl = tdHeroStats(h.level);
  if (h.respawn >= 0) {
    if (s.tick < h.respawn) return;
    h.respawn = -1;
    h.hp = h.maxHp;
    placeHero(s);
    if (s.rules >= TD_HERO_AUTO_RULES) {
      I.heroCmd = false;
      h.post = undefined;
    }
    ev.push({ type: 'hero', what: 'up' });
    return;
  }
  if (s.escort) followShip(s);
  if (s.rules >= TD_HERO_AUTO_RULES && !s.escort && !I.heroCmd && s.tick % TD_HERO_AUTO_EVERY === 0) {
    const p = autoPost(s);
    if (p) h.post = p;
  }
  // 玩家手动指了地方（或清障）就听玩家的；守点逻辑只在没有手动指令时接管
  if ((!h.goal || I.heroAuto) && h.clear < 0 && !s.escort?.follow) heroGuard(s, hl.range);
  // 捡地上的宝藏：直接送回宝藏箱
  for (let i = s.piles.length - 1; i >= 0; i--) {
    const p = s.piles[i] as TdState['piles'][number];
    if (d2(p.x, p.y, h.x, h.y) > TD_PICK_R * TD_PICK_R) continue;
    s.vault += p.n;
    s.piles.splice(i, 1);
    ev.push({ type: 'pickup', n: p.n });
  }
  // 清障碍
  const blk = h.clear >= 0 ? s.blocks.find((b) => b.id === h.clear && !b.destroyed) : undefined;
  if (h.clear >= 0 && !blk) {
    h.clear = -1;
    h.goal = null;
  }
  if (blk) {
    const nx = Math.max(blk.x * UNIT, Math.min((blk.x + blk.size) * UNIT, h.x));
    const ny = Math.max(blk.y * UNIT, Math.min((blk.y + blk.size) * UNIT, h.y));
    if (d2(nx, ny, h.x, h.y) <= hl.range * hl.range) {
      h.goal = null;
      if (s.tick >= h.cd) {
        h.cd = s.tick + hl.reload;
        damageBlock(s, ev, blk, hl.dmg * 2);
        if (blk.destroyed) h.clear = -1;
      }
      return;
    }
  }
  if (h.goal) {
    const goalCell = cellOf(h.goal.x, h.goal.y);
    const f = cellFlow(s, goalCell, 0);
    const here = f[cellOf(h.x, h.y)] as number;
    if (here === 0 || here >= INF) {
      // 到了（或走不到）：在终点格里直走到点上
      const face = { x: h.x, y: h.y, face: 1 as 1 | -1 };
      if (here === 0 && (I.occ[goalCell] ?? 0) === 0) moveToward(face, h.goal.x, h.goal.y, hl.speed);
      h.x = face.x;
      h.y = face.y;
      if (here >= INF || d2(h.x, h.y, h.goal.x, h.goal.y) <= 10 * 10 || (I.occ[goalCell] ?? 0) !== 0) h.goal = null;
    } else {
      const n = nextCell(I.occ, f, h.x, h.y);
      if (n >= 0) {
        const face = { x: h.x, y: h.y, face: 1 as 1 | -1 };
        moveToward(face, cellX(n), cellY(n), hl.speed);
        h.x = face.x;
        h.y = face.y;
      }
    }
  }
  // 自动打射程内的：拿着宝藏的先打，其次最近的，锁住上一个（枪弹：能打飞的；雾船在身边 2 格内自然被照亮）
  const cand: TdEnemy[] = [];
  for (const e of s.enemies) if (targetable(s, e, HIT_HERO) && inRing(d2(e.x, e.y, h.x, h.y), hl.range, 0)) cand.push(e);
  const best = rankTargets(cand, h.aim, (e) => [e.carry > 0 ? 0 : 1, d2(e.x, e.y, h.x, h.y)])[0];
  h.aim = best ? best.id : -1;
  if (best && s.tick >= h.cd) {
    h.cd = s.tick + hl.reload;
    // 英雄的开火事件 id 记 -1（没有这座塔），画面据此播英雄的枪口火光和弹道
    ev.push({ type: 'shoot', id: -1, x0: h.x, y0: h.y, x1: best.x, y1: best.y, t1: s.tick + 4, target: best.id });
    I.pend.push({ t: s.tick + 4, kind: 'unit', id: best.id, dmg: hl.dmg, x: best.x, y: best.y, r: 0, hit: HIT_HERO, slowPct: 0, slowTicks: 0, burnDps: 0, burnTicks: 0, pull: 0 });
  }
}

/**
 * 英雄守点（每 5 拍判一次）：守点 TD_HERO_GUARD 内有能打的敌人，就朝离自己最近的那个走到射程的 TD_HERO_STAND_PCT% 以内再站住开火；
 * 没有了就回守点。只追守点附近的，不会被一路引到岛的另一头；手动走位会改守点。
 */
function heroGuard(s: TdState, range: number): void {
  if (s.tick % 5 !== 0) return;
  const h = s.hero;
  const I = inner(s);
  const post = h.post ?? { x: h.x, y: h.y };
  const g2 = TD_HERO_GUARD * TD_HERO_GUARD;
  let best: TdEnemy | undefined;
  let bd = Number.POSITIVE_INFINITY;
  for (const e of s.enemies) {
    if (!targetable(s, e, HIT_HERO) || d2(e.x, e.y, post.x, post.y) > g2) continue;
    const d = d2(e.x, e.y, h.x, h.y);
    if (d < bd || (d === bd && best && e.id < best.id)) {
      bd = d;
      best = e;
    }
  }
  const stand = Math.floor((range * TD_HERO_STAND_PCT) / 100);
  if (best) {
    // 规则版本 ≥ 14：站在木台上不停下，接着朝敌人走，走出木台再站住
    if (bd > stand * stand || (s.rules >= TD_HERO_AUTO_RULES && onSlot(s, h.x, h.y) >= 0)) {
      h.goal = { x: best.x, y: best.y };
      I.heroAuto = true;
    } else if (I.heroAuto) {
      h.goal = null;
      I.heroAuto = false;
    }
    return;
  }
  if (d2(h.x, h.y, post.x, post.y) > 40 * 40) {
    h.goal = { x: post.x, y: post.y };
    I.heroAuto = true;
  } else if (I.heroAuto) {
    h.goal = null;
    I.heroAuto = false;
  }
}

/** 点 (x, y)（单位）压在哪块木台上：和 tdBuildBlock 的英雄判定同一个范围（台中心 ±100 内）；不压为 -1 */
function onSlot(s: TdState, x: number, y: number): number {
  return s.slots.findIndex((sl) => Math.abs(x - (sl.x * UNIT + 100)) < 100 && Math.abs(y - (sl.y * UNIT + 100)) < 100);
}

/** 把一个点挪出木台：沿离台中心远的那根轴推到台外 10 单位；推出去又压到别的台就再推（最多 3 次） */
function offSlot(s: TdState, x: number, y: number): { x: number; y: number } {
  for (let k = 0; k < 3; k++) {
    const sl = s.slots[onSlot(s, x, y)];
    if (!sl) break;
    const cx = sl.x * UNIT + 100;
    const cy = sl.y * UNIT + 100;
    const dx = x - cx;
    const dy = y - cy;
    if (Math.abs(dx) > Math.abs(dy)) x = cx + (dx > 0 ? 110 : -110);
    else y = cy + (dy >= 0 ? 110 : -110);
  }
  return { x, y };
}

/** 威胁最大的那条路（下标同 laneOf）：场上的敌人按登陆点归路、按剩余血量加；场上没敌人看下一波各路的总血；都没有为 -1，平手取下标小的 */
function threatLane(s: TdState): number {
  const lv = s.level;
  const n = lv.lanes.length + (lv.tide ? 1 : 0);
  const w = new Array<number>(n).fill(0);
  let any = false;
  for (const e of s.enemies) {
    if (e.mode !== 'in' && e.mode !== 'out') continue;
    let bl = 0;
    let bd = Number.POSITIVE_INFINITY;
    for (let l = 0; l < n; l++) {
      const c = laneCell(lv, l);
      if (!c) continue;
      const d = d2(e.hx, e.hy, c.x * UNIT + 50, c.y * UNIT + 50);
      if (d < bd) {
        bd = d;
        bl = l;
      }
    }
    w[bl] = (w[bl] ?? 0) + e.hp;
    any = true;
  }
  const wave = lv.waves[s.wave];
  if (!any && wave) for (const g of wave.groups) {
    const l = laneOf(lv, g.lane, s.wave);
    w[l] = (w[l] ?? 0) + g.n * TD2_ENEMIES[g.enemy].hp;
  }
  let best = -1;
  for (let l = 0; l < n; l++) if ((w[l] ?? 0) > 0 && (best < 0 || (w[l] ?? 0) > (w[best] ?? 0))) best = l;
  return best;
}

/**
 * 自己守的站位：威胁最大那条路去宝藏的路线上的路口——和别的开着的路汇合的第一格；汇合点离宝藏比 TD_HERO_AUTO_BACK 格远（或只有这一条路）
 * 就取离宝藏 TD_HERO_AUTO_BACK 格的那格（已经在汇合之后，几路都从这里过）。压着木台或被占就往路线上游找，再找下游；找不到为 null。
 * 不站在一条路离宝藏 4 格的地方而让别的路从旁边摸宝藏：那样不走位的玩家反而丢三星（td06 实测 100% → 1%）。
 */
function autoPost(s: TdState): { x: number; y: number } | null {
  const l = threatLane(s);
  const c = l >= 0 ? laneCell(s.level, l) : undefined;
  if (!c) return null;
  const cells = tdRoute(s, c.x, c.y);
  if (cells.length === 0) return null;
  const occ = inner(s).occ;
  const others = new Set<number>();
  for (const o of tdLanes(s)) if (o.x !== c.x || o.y !== c.y) for (const q of tdRoute(s, o.x, o.y)) others.add(q);
  let k0 = Math.max(0, cells.length - 1 - TD_HERO_AUTO_BACK);
  if (others.size > 0) {
    const m = cells.findIndex((q) => others.has(q));
    k0 = Math.max(k0, m < 0 ? cells.length - 1 : m);
  }
  const ok = (k: number): { x: number; y: number } | null => {
    const cell = cells[k] as number;
    const x = cellX(cell);
    const y = cellY(cell);
    return (occ[cell] ?? 1) === 0 && onSlot(s, x, y) < 0 ? { x, y } : null;
  };
  for (let k = k0; k >= 0; k--) {
    const p = ok(k);
    if (p) return p;
  }
  for (let k = k0 + 1; k < cells.length; k++) {
    const p = ok(k);
    if (p) return p;
  }
  return null;
}

/** 原地推进一拍；actions 是这一拍的操作 */
export function stepTd(s: TdState, actions: TdAction[]): TdEvent[] {
  const ev: TdEvent[] = [];
  if (s.over) return ev;
  const I = inner(s);
  for (const a of actions) doAction(s, ev, a);
  if (s.next >= 0 && s.tick >= s.next) startWave(s, ev, false);
  stepSpawns(s, ev);
  ensureGrid(s);
  resolvePend(s, ev);
  ensureGrid(s);
  if (s.escort) stepEscort(s, ev);
  // 记下这一拍走之前的位置：塔按"这一拍走了多少"算提前量
  for (const e of s.enemies) {
    e.px = e.x;
    e.py = e.y;
  }
  stepEnemies(s, ev);
  // 盾兵的盾朝这一拍走的方向（没动就不变；被震晕、停下砸墙时保持最后朝的方向）
  for (const e of s.enemies) if (e.kind === 'shield') faceShield(e, e.x - (e.px ?? e.x), e.y - (e.py ?? e.y));
  stepBoss(s, ev);
  stepHero(s, ev);
  stepTowers(s, ev);
  stepTraps(s, ev);
  stepFires(s, ev);
  stepBarricades(s, ev);
  stepPiles(s, ev);
  // 死的、回船的留在数组里会越积越多：每秒清一次（id 不复用，引用按 id 找）
  if (s.tick % 20 === 0) s.enemies = s.enemies.filter((e) => e.mode === 'in' || e.mode === 'out');
  s.tick++;
  if (s.escort) {
    // 护航的终局：到了、沉了、超时。清完所有波也不结束（船还没到）
    const es = s.escort;
    if (!es.arrived && es.hull <= 0) {
      es.hull = 0;
      es.sunk = true;
      ev.push({ type: 'sunk' });
    }
    if (es.arrived || es.sunk || s.tick >= (s.level.maxTicks ?? TD_MAX_TICKS)) {
      s.over = true;
      ev.push({ type: 'end', stars: tdResult(s).stars });
    }
    return ev;
  }
  if (s.vault <= 0 && s.piles.length === 0 && I.clearedAtEmpty < 0) I.clearedAtEmpty = clearedWaves(s);
  if (s.vault > 0 || s.piles.length > 0) I.clearedAtEmpty = -1;
  const allSpawned = !s.level.endless && s.wave >= s.level.waves.length && I.spawns.length === 0;
  const alive = s.enemies.some((e) => e.mode === 'in' || e.mode === 'out');
  if (s.lost >= TD2_LOSE_AT || (allSpawned && !alive && I.pend.length === 0) || s.tick >= (s.level.maxTicks ?? TD_MAX_TICKS)) {
    s.over = true;
    ev.push({ type: 'end', stars: tdResult(s).stars });
  }
  return ev;
}

/** 星数（td2types.ts 的区间）：一枚没丢 3★，丢 ≤ 3 枚 2★，丢 ≤ 10 枚 1★，再多就输（0★，丢到 TD2_LOSE_AT 枚当场结束） */
export function tdStars(lost: number): number {
  if (lost <= 0) return 3;
  if (lost <= TD2_STAR_LOST[0]) return 2;
  if (lost <= TD2_STAR_LOST[1]) return 1;
  return 0;
}

function clearedWaves(s: TdState): number {
  const I = inner(s);
  let waves = 0;
  for (let w = 0; w < s.wave; w++) if ((I.waveLeft[w] ?? 0) <= 0) waves++;
  return waves;
}

export function tdResult(s: TdState): TdResult {
  if (s.escort) {
    const I0 = inner(s);
    return {
      over: s.over, stars: escortResult(s.escort, s.tick).stars, lost: 0, waves: clearedWaves(s), total: s.level.waves.length, ticks: s.tick,
      goldEarned: s.goldEarned, kills: I0.kills,
    };
  }
  const I = inner(s);
  const waves = s.lost >= TD2_LOSE_AT && I.clearedAtEmpty >= 0 ? I.clearedAtEmpty : clearedWaves(s);
  return { over: s.over, stars: tdStars(s.lost), lost: s.lost, waves, total: s.level.waves.length, ticks: s.tick, goldEarned: s.goldEarned, kills: I.kills };
}

/** 状态指纹：测试里比较两次重放是否逐位一致 */
export function tdFingerprint(s: TdState): number {
  const I = inner(s);
  const parts: number[] = [s.tick, s.gold, s.goldEarned, s.vault, s.lost, s.wave, s.next, s.over ? 1 : 0, I.nextId, I.pend.length, I.spawns.length, I.cdTotal, ...I.rng.snapshot()];
  for (const e of s.enemies) parts.push(e.id, e.x, e.y, e.hp, e.carry, e.mode === 'in' ? 0 : e.mode === 'out' ? 1 : 2);
  for (const t of s.towers) parts.push(t.id, t.level, t.tier ?? 0, t.cd, t.aim, t.branch.length);
  for (const sl of s.slots) parts.push(sl.tower, sl.spent ?? 0, sl.wreck ?? -1);
  for (const w of s.walls) parts.push(w.id, w.hp);
  for (const b of s.blocks) parts.push(b.id, b.hp);
  for (const p of s.piles) parts.push(p.x, p.y, p.n, p.at);
  for (const b of s.barricades) parts.push(b.id, b.x, b.y, b.hp, b.until);
  for (const tr of I.traps) parts.push(tr.fired ? 1 : 0, tr.rearm);
  const h = s.hero;
  parts.push(h.x, h.y, h.hp, h.respawn, h.cd, h.kegReady, h.barricadeReady ?? 0);
  for (const [id, until] of [...I.jam].sort((a, b) => a[0] - b[0])) parts.push(id, until);
  parts.push(I.skilled.size);
  if (s.escort) {
    const es = s.escort;
    parts.push(es.pos, es.pace === 'hold' ? 0 : es.pace === 'sail' ? 1 : 2, es.hull, es.biters, es.mendReady, es.follow ? 1 : 0, es.gatesPassed, es.arrived ? 1 : 0, es.sunk ? 1 : 0, es.mends);
  }
  return hash32(parts.join(','), 11);
}

/** 操作按拍稳定排序后逐拍喂进去，打到结束 */
export function runTd(setup: TdSetup, actions: TdAction[]): { state: TdState; result: TdResult; events: number } {
  const s = createTd(setup);
  const sorted = actions.map((a, i) => ({ a, i })).sort((p, q) => p.a.t - q.a.t || p.i - q.i);
  let k = 0;
  let events = 0;
  while (!s.over) {
    const now: TdAction[] = [];
    while (k < sorted.length && (sorted[k]?.a.t ?? 0) <= s.tick) now.push(sorted[k++]!.a);
    events += stepTd(s, now).length;
  }
  return { state: s, result: tdResult(s), events };
}

/** 第 w 波（0 起）开打时落潮路是不是开着：写了 `tideOpen` 按名单，没写就是 `tide.wave` 起一直开着 */
export function tideOpenAt(lv: TdLevel, w: number): boolean {
  if (!lv.tide) return false;
  return lv.tideOpen ? lv.tideOpen.includes(w) : w >= lv.tide.wave;
}

/**
 * 现在开着的登陆路（格子）：落潮前不含落潮路。机器人和画面层用。
 * 潮水涨落的关（写了 `tideOpen`）按"最近开打的那一波"算，下一波的潮用 `tdNextTide` 预告。
 */
export function tdLanes(s: TdState): Array<{ x: number; y: number }> {
  const lv = s.level;
  const out = lv.lanes.slice();
  if (lv.tide && (lv.tideOpen ? tideOpenAt(lv, Math.max(0, s.wave - 1)) : s.wave >= lv.tide.wave)) out.push(lv.tide.lane);
  return out;
}

/** 涨落的潮：下一波开打时落潮路是开（true）还是关（false）；不是涨落的关、没有下一波为 null。画面层提前预告用 */
export function tdNextTide(s: TdState): boolean | null {
  const lv = s.level;
  if (!lv.tide || !lv.tideOpen || s.wave >= lv.waves.length) return null;
  return tideOpenAt(lv, s.wave);
}

/** 从某格出发，地面敌人去最近宝藏箱会走的格子序列（不含起点，最多 200 步）。机器人选塔位、英雄站位用 */
export function tdRoute(s: TdState, cx: number, cy: number): number[] {
  ensureGrid(s);
  const I = inner(s);
  const x0 = cx * UNIT + 50;
  const y0 = cy * UNIT + 50;
  let best: Int32Array | null = null;
  let bd = INF;
  for (let i = 0; i < s.treasures.length; i++) {
    const f = treasureFlow(s, i, TD_WALL_COST);
    const d = f[cellOf(x0, y0)] as number;
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  const out: number[] = [];
  if (!best) return out;
  let x = x0;
  let y = y0;
  for (let k = 0; k < 200; k++) {
    const n = nextCell(I.occ, best, x, y);
    if (n < 0) break;
    out.push(n);
    x = cellX(n);
    y = cellY(n);
  }
  return out;
}

// ------------------------------------------------------------ 守岛 2.0 的出口（契约，td2types.ts）

/** 第 w 波第 g 组实际走哪条路：落潮路（下标 = lanes.length）在涨潮的波改走 0 号路 */
function laneOf(lv: TdLevel, lane: number, w: number): number {
  if (lane === lv.lanes.length) return tideOpenAt(lv, w) ? lane : 0;
  return lane % Math.max(1, lv.lanes.length);
}

/** 一条登陆路（下标同 laneOf）的格子坐标 */
function laneCell(lv: TdLevel, lane: number): { x: number; y: number } | undefined {
  return lane === lv.lanes.length ? lv.tide?.lane : lv.lanes[lane];
}

/** 这条地面路线有没有经过雾区（雾区按 fogFrom 晚来的，按那一波算） */
function routeFoggy(s: TdState, lane: number, w: number): boolean {
  const zones = s.level.fogZones;
  if (!zones || zones.length === 0) return false;
  if (s.level.fogFrom !== undefined && w < s.level.fogFrom) return false;
  const c = laneCell(s.level, lane);
  if (!c) return false;
  for (const cell of tdRoute(s, c.x, c.y)) {
    const x = cellX(cell);
    const y = cellY(cell);
    for (const z of zones) {
      // 雾区圆心是格子坐标、按格子中心算（和 inFogZone 一致）
      const dx = x - Math.round(z.x * UNIT + UNIT / 2);
      const dy = y - Math.round(z.y * UNIT + UNIT / 2);
      const r = Math.round(z.r * UNIT);
      if (dx * dx + dy * dy <= r * r) return true;
    }
  }
  return false;
}

/**
 * 下 n 波（从还没开打的第 s.wave 波起）的预告：每路什么敌人几个、护甲占比、建议的伤害类型。
 * 界面和机器人都只读它。等效血量 = 统一敌人表 × 关卡 hpPct × 波次 hpPct（分裂小艇算上分出来的）。
 */
export function tdPreview(s: TdState, n = 2): WavePreview[] {
  const lv = s.level;
  ensureWaves(lv, s.wave + n);
  const out: WavePreview[] = [];
  let at = s.next;
  for (let w = s.wave; w < Math.min(lv.waves.length, s.wave + n); w++) {
    const wave = lv.waves[w] as TdLevel['waves'][number];
    const byLane = new Map<number, WaveLanePreview>();
    const hp: Record<TdArmor, number> = { cloth: 0, heavy: 0, wood: 0, air: 0 };
    for (const g of wave.groups) {
      const lane = laneOf(lv, g.lane, w);
      let lp = byLane.get(lane);
      if (!lp) {
        lp = { lane, fly: true, enemies: [] };
        byLane.set(lane, lp);
      }
      const def = TD2_ENEMIES[g.enemy];
      const armor = TD_ENEMY_ARMOR[g.enemy];
      if (armor !== 'air') lp.fly = false;
      const fog = !!def.fog || (armor !== 'air' && routeFoggy(s, lane, w));
      const same = lp.enemies.find((e) => e.kind === g.enemy && e.fog === fog);
      if (same) same.n += g.n;
      else lp.enemies.push({ kind: g.enemy, armor, n: g.n, fog });
      let one = enemyHp(lv, g.enemy, w);
      if (def.split) one += enemyHp(lv, def.split.kind, w) * def.split.n;
      hp[armor] += one * g.n;
    }
    const total = hp.cloth + hp.heavy + hp.wood + hp.air;
    const share: Record<TdArmor, number> = { cloth: 0, heavy: 0, wood: 0, air: 0 };
    let top: TdArmor | null = null;
    for (const a of TD_ARMORS) {
      share[a] = total > 0 ? Math.floor((hp[a] * 100) / total) : 0;
      if (hp[a] > 0 && (top === null || hp[a] > hp[top])) top = a;
    }
    if (w > s.wave && at >= 0) at += gapBefore(lv, w);
    const p: WavePreview = {
      wave: w,
      at: s.next < 0 ? -1 : at,
      boss: !!wave.boss,
      tide: lv.tide ? tideOpenAt(lv, w) : null,
      lanes: [...byLane.values()].sort((a, b) => a.lane - b.lane),
      armorShare: share,
      suggest: top === null ? null : bestDamageVs(top),
    };
    if (wave.note) p.note = wave.note;
    if (s.escort) {
      // 先头敌人和船最早相遇在航线哪一格（各组取最靠前的；追不上 -1）
      let meet = -1;
      for (const g of wave.groups) {
        const c = laneCell(lv, laneOf(lv, g.lane, w));
        if (!c) continue;
        const m = escortMeet(s.escort, s.next < 0 ? 0 : Math.max(0, at - s.tick), c, TD2_ENEMIES[g.enemy].speed);
        if (m >= 0 && (meet < 0 || m < meet)) meet = m;
      }
      p.meet = meet;
    }
    out.push(p);
  }
  return out;
}

/** 每条登陆路（含落潮路）到宝藏箱的地面路线；落潮路按下一波开不开标 open。墙破、墙修后再调就是新路线 */
export function tdRoutes(s: TdState): TdRouteLine[] {
  const lv = s.level;
  const out: TdRouteLine[] = lv.lanes.map((l, i) => ({ lane: i, x: l.x, y: l.y, cells: tdRoute(s, l.x, l.y), tide: false, open: true }));
  if (lv.tide) {
    const l = lv.tide.lane;
    const open = s.wave < lv.waves.length ? tideOpenAt(lv, s.wave) : tideOpenAt(lv, Math.max(0, s.wave - 1));
    out.push({ lane: lv.lanes.length, x: l.x, y: l.y, cells: tdRoute(s, l.x, l.y), tide: true, open });
  }
  return out;
}

/**
 * 这块木台现在为什么造不了（只看「有人站在上面」这两条，钱、解锁、有塔由调用方另判）：
 * 'enemy' 有地面敌人站在台上（造上去会把它卡在塔里），'hero' 活着的英雄站在台上（同理），能造为 null。
 * build 和界面共用这一个函数：界面据此把塔卡画成不可点并说明原因，不自己重算规则（以前点了没反应、没有任何提示）。
 */
export function tdBuildBlock(s: TdState, slot: number): 'enemy' | 'hero' | null {
  const sl = s.slots[slot];
  if (!sl) return null;
  for (const e of s.enemies) {
    if ((e.mode === 'in' || e.mode === 'out') && !isAir(e.kind) && e.x >= sl.x * UNIT && e.x < (sl.x + 2) * UNIT && e.y >= sl.y * UNIT && e.y < (sl.y + 2) * UNIT) return 'enemy';
  }
  const h = s.hero;
  if (Math.abs(h.x - (sl.x * UNIT + 100)) < 100 && Math.abs(h.y - (sl.y * UNIT + 100)) < 100 && h.respawn < 0) return 'hero';
  return null;
}

/** 卖掉某块木台（或驻守台）上的塔能退多少金：已花的 TD2_ECON.sellPct%（驻守台的塔按同阶木台塔的花费算）；没塔为 -1 */
export function tdSellRefund(s: TdState, slot: number): number {
  const sl = s.slots[slot];
  const t = slotTower(s, slot);
  if (!sl || !t) return -1;
  return Math.floor(((sl.spent ?? 0) * TD2_ECON.sellPct) / 100);
}

/** 花钱立刻清掉一块障碍（压木台的沉船、木桶）要多少金；清不了（没有、已经没了）为 -1 */
export function tdClearCost(s: TdState, id: number): number {
  const b = s.blocks.find((q) => q.id === id);
  return !b || b.destroyed ? -1 : TD2_ECON.clearGold;
}

/**
 * 现在叫下一波能拿多少金、抵掉多少拍英雄技能冷却：
 * 金 = ⌊下一波击杀金 × 剩余倒数 ÷ 这段倒数总长 × callPct%⌋，冷却 = 剩余倒数 × callCdPct%。没有下一波、已经到点为 0。
 */
export function tdCallBonus(s: TdState): { gold: number; cdCut: number } {
  if (s.wave >= s.level.waves.length || s.next <= s.tick) return { gold: 0, cdCut: 0 };
  const left = s.next - s.tick;
  const total = Math.max(left, inner(s).cdTotal);
  return {
    gold: Math.floor((waveGold(s.level, s.wave) * left * TD2_ECON.callPct) / (total * 100)),
    cdCut: Math.floor((left * TD2_ECON.callCdPct) / 100),
  };
}
