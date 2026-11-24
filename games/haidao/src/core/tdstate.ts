/**
 * 守岛的状态和各文件共用的底层：内部状态、塔和英雄的数值、格子流场、看不看得见、几个小的结算工具。只被守岛的规则文件引用（td.ts、tdhero.ts、tdquery.ts），界面经 index.ts 拿导出的那几个。
 */
import { BUILDINGS } from '../content/index.ts';
import { TD_BRANCH_MOD } from '../content/tdbranches.ts';
import { TD_ULT_BY_ID } from '../content/tdults.ts';
import type { TdUltDef } from '../content/tdults.ts';
import { TD_HERO_LIGHT } from '../content/tdunits.ts';
import { TD2_BOSS_EXTRA_TICKS, TD2_CLIFF, TD2_COST, TD2_ENEMIES, TD2_HERO, TD2_NAV, TD2_SHOCK_STUN, TD_SEA_RANGE, td2TierStats } from '../content/td2units.ts';
import { isqrt } from './fmath.ts';
import type { Rng } from './rng.ts';
import { cellIdx, cellX, cellY, flowField, inGrid } from './grid.ts';
import { UNIT } from './types.ts';
import type { BuildingKind } from './types.ts';
import { TD_BURN_DAMAGE, TD_ENEMY_ARMOR, TD_HERO_DAMAGE, TD_KEG_DAMAGE, TD_MINE_DAMAGE, TD_TOWER_DAMAGE, counterPct, isTdTowerKind } from './td2types.ts';
import type { EscortState } from './escorttypes.ts';
import type { TdDeep } from './tddeep.ts';
import type { TdCamp } from './tdcamp.ts';
import type { TdArmor, TdBarricade, TdDamage, TdMode, TdTier, TdTowerKind } from './td2types.ts';
import type { TdBlock, TdEnemy, TdEnemyKind, TdEvent, TdEventKind, TdHero, TdLevel, TdSlot, TdTower, TdWall } from './tdtypes.ts';

/** 一发伤害的类型：伤害类型、塔的分叉（克制表的例外看它）、打重甲另加的百分点 */
export interface Hit {
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
  /** 震荡炮：命中震晕几拍；别的塔 0 */
  stun: number;
  /** 换了终极（content/tdults.ts）：特色效果按这张表的 every、airSlow、bossPct、push、rain 结算 */
  ult?: TdUltDef;
}

/** 延迟结算的命中：弹丸飞到了才算 */
export interface Pend {
  t: number;
  /** lob = 掷弹兵的手雷：炸英雄、墙（按 wallPct 打折）、拒马，不炸敌人 */
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
  /** 震荡炮的落点溅射：命中的敌人震晕几拍 */
  stun?: number;
  /** 手雷炸墙按百分之几 */
  wallPct?: number;
  /** 直射的出膛点（盾兵按它判正面）；溅射不写 */
  sx?: number;
  sy?: number;
  /** 从崖上的高台往下打（盾挡不住） */
  above?: true;
  /** 终极塔：打首领的倍率、往回推几拍（td.ts 的 Blast） */
  bossPct?: number;
  push?: number;
}

export interface Trap {
  id: number;
  kind: 'mine' | 'tar';
  x: number;
  y: number;
  st: TowerStats;
  fired: boolean;
  /** 地雷炸完后哪一拍重新埋好；没炸过为 -1 */
  rearm: number;
}

export interface Internal {
  rng: Rng;
  nextId: number;
  pend: Pend[];
  /** exit：赏金船要跑去的另一条登陆路（单位）；带它的上岸就往那里跑，不抢宝藏 */
  spawns: Array<{ t: number; kind: TdEnemyKind; x: number; y: number; wave: number; exit?: { x: number; y: number } }>;
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
  /** 玩家这条命里指挥过英雄（之后听玩家的守点，倒下复活后清掉，重新自己守） */
  heroCmd?: boolean;
  /** 狙击塔 id → 正在瞄的敌人和开火拍 */
  snipe: Map<number, { target: number; fireAt: number }>;
  /** 吊桥收起时给"已经在桥上的人"用的占格图（把那座桥暂算成能走） */
  bridgeOcc?: [Uint8Array | null, Uint8Array | null];
}

export interface TdState {
  /** 岛扩了几圈（TdSetup.ext，海盗来袭按主寨等级）；判格子边界一律带它 */
  ext: number;
  rules: number;
  tick: number;
  level: TdLevel;
  /** 守岛 2.0：哪种玩法 */
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
  /** 场上的拒马（格子坐标） */
  barricades: TdBarricade[];
  over: boolean;
  /** 护航的商船（关卡带 escort 时才有） */
  escort?: EscortState;
  /** 潮汐水闸（关卡写了 sluice 才有，tdmech.ts）：还能关几次、关了哪几波（0 起） */
  sluice?: { left: number; shut: number[] };
  /** 漂流补给箱（关卡写了 crates 才有）：沙滩上还在的箱子（单位坐标），英雄正被叫去捡哪一个（-1 没有） */
  drift?: { crates: Array<{ id: number; x: number; y: number; until: number; wave: number }>; chase: number };
  /** 岸防老炮（关卡写了 battery 才有）：炮台在哪一格、下一发能打的拍 */
  battery?: { x: number; y: number; ready: number };
  /**
   * 友军巡航船（关卡写了 fleet 才有）：下一次能叫的拍；船在海上时 sail 是这一趟（从一圈上的 p0 出发、t0 拍叫来、until 拍开走、下一炮 next 拍）
   */
  fleet?: { ready: number; sail: { p0: number; t0: number; until: number; next: number } | null };
  /**
   * 关内事件和大潮海况（关卡写了 events / eventEvery / killGoldPct / heroCdPct 才有，tdevent.ts）：
   * at 是开局挑好的哪一波发生什么（战役），dare 是接了战书的波（0 起）
   */
  happen?: { at: Array<{ wave: number; kind: TdEventKind }>; dare: number[] };
  /** 终极、先打、老兵、挑战、天赋（tddeep.ts）：只在战役和海盗来袭有 */
  deep?: TdDeep;
  /** 这一局能造水手营（tdcamp.ts 的 campEnabled） */
  campOn?: true;
  /** 水手营（造了第一座才有） */
  camps?: TdCamp[];
  /** 吊桥（关卡写了 drawbridge 才有，tdmech.ts）：哪座正放下（0 或 1），下次能切换的拍 */
  drawbridge?: { down: 0 | 1; ready: number };
  internal: unknown;
}

export function inner(s: TdState): Internal {
  return s.internal as Internal;
}

const NO_MOD: TowerStats = {
  dmg: 0, range: 0, minRange: 0, reload: 20, splash: 0, dt: 'shell', branch: [], heavy: 0, airFirst: false, light: 0,
  slowPct: 0, slowTicks: 0, burnDps: 0, burnTicks: 0, shots: 1, line: false, pull: 0, stun: 0,
};

export const HIT_HERO: Hit = { dt: TD_HERO_DAMAGE, branch: [], heavy: 0 };

export const HIT_KEG: Hit = { dt: TD_KEG_DAMAGE, branch: [], heavy: 0 };

export const HIT_BURN: Hit = { dt: TD_BURN_DAMAGE, branch: [], heavy: 0 };

/** 局内塔的阶对应的"等级"：选分叉的检查和画面挑贴图用（1–3 级算 1 阶、4–6 级 2 阶、7–8 级 3 阶，各取一个代表） */
export const TD_TIER_LEVEL: Readonly<Record<TdTier, number>> = { 1: 2, 2: 5, 3: 8 };

/** 一发打到某种护甲的倍率（百分比）：克制表 + 分叉例外，打重甲再加分叉的 heavyPct。0 = 打不到 */
export function mult(h: Hit, armor: TdArmor): number {
  const p = counterPct(h.dt, armor, h.branch);
  return p > 0 && armor === 'heavy' ? p + h.heavy : p;
}

export const isAir = (kind: TdEnemyKind): boolean => TD_ENEMY_ARMOR[kind] === 'air';

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
export function statsOf(kind: BuildingKind, level: number, tier: TdTier | undefined, branch: readonly string[], bonusPct: number, ult?: string): TowerStats {
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
  const u = ult === undefined ? undefined : TD_ULT_BY_ID.get(ult);
  if (u && u.tower === kind) ultMod(st, u);
  return st;
}

/** 终极：在 3 阶（含分叉）的数上再乘一层，特色效果挂在 st.ult 上由 td.ts 结算 */
function ultMod(st: TowerStats, u: TdUltDef): void {
  st.ult = u;
  st.dmg = Math.floor((st.dmg * u.dmgPct) / 100);
  if (u.reloadPct) st.reload = Math.max(4, Math.floor((st.reload * u.reloadPct) / 100));
  if (u.rangePct) st.range = Math.floor((st.range * u.rangePct) / 100);
  if (u.splash) st.splash = Math.max(st.splash, u.splash);
  if (u.shots) st.shots = u.shots;
  if (u.light) st.light = Math.max(st.light, u.light);
  if (u.stun) st.stun = Math.max(st.stun, u.stun);
  if (u.burn) {
    st.burnDps = Math.max(st.burnDps, u.burn.dps);
    st.burnTicks = Math.max(st.burnTicks, u.burn.ticks);
  }
}

export function towerStats(s: TdState, t: TdTower): TowerStats {
  const I = inner(s);
  let st = I.stats.get(t.id);
  if (!st) {
    st = statsOf(t.kind, t.level, t.tier, t.branch, isTdTowerKind(t.kind) ? (I.bonus[t.kind] ?? 0) : 0, t.ult);
    if (onHigh(s, t)) highReach(st);
    I.stats.set(t.id, st);
  }
  return st;
}

/**
 * 断崖关的规则开着吗（关卡写了 cliffs）：断崖格挡路、高台、断崖关里盾兵挡英雄的枪都看这一处。
 * 海盗来袭也有盾兵，但它的岛没有 cliffs，盾兵挡不住英雄的枪
 */
export function cliffOn(s: { level: TdLevel }): boolean {
  return !!s.level.cliffs;
}

/** 塔在崖上的高台上（slot 的 high 只在断崖关的规则开着时才写，createTd） */
export function onHigh(s: TdState, t: TdTower): boolean {
  return t.slot >= 0 && s.slots[t.slot]?.high === true;
}

/** 高台：射程多 rangeAdd；崖下 minRange 内打不到，和塔自己的近身死区（臼炮）取大的，出手判定照旧走 inRing */
function highReach(st: { range: number; minRange: number }): void {
  st.range += TD2_CLIFF.rangeAdd;
  st.minRange = Math.max(st.minRange, TD2_CLIFF.minRange);
}

/** 在这块木台上造这种塔要多少局内金：高台按 TD2_CLIFF.costPct 算，别的木台就是 TD2_COST（机器人、界面、规则都读这一处） */
export function tdBuildCost(s: Pick<TdState, 'slots'>, slot: number, kind: TdTowerKind): number {
  return s.slots[slot]?.high ? Math.floor((TD2_COST[kind] * TD2_CLIFF.costPct) / 100) : TD2_COST[kind];
}

/** 塔真实的射程（单位）：界面画射程圈、造塔预览都读它，和出手判定是同一个数 */
export function tdTowerRange(s: TdState, t: TdTower): { range: number; minRange: number } {
  const st = towerStats(s, t);
  return { range: st.range, minRange: st.minRange };
}

/** 还没造的塔（造塔预览）：这种塔这一阶、不带分叉时的射程；high = 造在高台上 */
export function tdBuildRange(kind: TdTowerKind, tier: TdTier = 1, high = false): { range: number; minRange: number } {
  const st = statsOf(kind, TD_TIER_LEVEL[tier], tier, [], 0);
  const r = { range: st.range, minRange: st.minRange };
  if (high) highReach(r);
  return r;
}

/** 英雄某一级的数值：船长 TD2_HERO、航海士 TD2_NAV，每级 +growPct%（登陆战的驻岛英雄另有一张表，不读这里） */
export function tdHeroStats(level: number, kind?: 'nav'): { hp: number; dmg: number; reload: number; range: number; speed: number } {
  const b = kind === 'nav' ? TD2_NAV : TD2_HERO;
  const k = 100 + TD2_HERO.growPct * (Math.max(1, level) - 1);
  return { hp: Math.floor((b.hp * k) / 100), dmg: Math.floor((b.dmg * k) / 100), reload: b.reload, range: b.range, speed: b.speed };
}

export function tcx(t: { x: number; size: number }): number {
  return t.x * UNIT + (t.size * UNIT) / 2;
}

export function tcy(t: { y: number; size: number }): number {
  return t.y * UNIT + (t.size * UNIT) / 2;
}

export function d2(ax: number, ay: number, bx: number, by: number): number {
  return (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
}


/** 大潮无尽（关卡写了 endless）：把 waves 补到至少 n 波；其它关卡什么都不做。生成只看波数，补多补少不影响结果 */
export function ensureWaves(lv: TdLevel, n: number): void {
  const gen = lv.endless;
  if (!gen) return;
  while (lv.waves.length < n) lv.waves.push(gen(lv.waves.length));
}

export function ensureGrid(s: TdState): void {
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
  for (const c of s.camps ?? []) {
    const sl = s.slots[c.slot];
    if (sl) for (let ox = 0; ox < 2; ox++) for (let oy = 0; oy < 2; oy++) I.occ[cellIdx(sl.x + ox, sl.y + oy)] = 2;
  }
  const db = s.drawbridge;
  const dbl = s.level.drawbridge;
  if (db && dbl) {
    for (const c of dbl[db.down]) if (inGrid(s.ext, c.x, c.y) && I.occ[cellIdx(c.x, c.y)] === 2) I.occ[cellIdx(c.x, c.y)] = 0;
    const up = dbl[db.down === 0 ? 1 : 0];
    for (const c of up) if (inGrid(s.ext, c.x, c.y)) I.occ[cellIdx(c.x, c.y)] = 2;
  }
  I.bridgeOcc = undefined;
  I.flow.clear();
  I.gridVer = I.ver;
}

/** 站在正收起的那座吊桥上时返回它的下标（0 或 1），不在或没有吊桥为 -1：桥上的人照走完 */
export function onRaisedBridge(s: TdState, x: number, y: number): 0 | 1 | -1 {
  const db = s.drawbridge;
  const dbl = s.level.drawbridge;
  if (!db || !dbl) return -1;
  const up: 0 | 1 = db.down === 0 ? 1 : 0;
  const cx = Math.floor(x / UNIT);
  const cy = Math.floor(y / UNIT);
  return dbl[up].some((c) => c.x === cx && c.y === cy) ? up : -1;
}

/**
 * 离 (x, y) 最近的能走格中心（单位）：吊桥收起时把桥上的宝藏堆、集结点、英雄守点挪上岸用。
 * 从所在格往外一圈圈找，找到的那圈和外面一圈里取离点最近的，同样近取格下标小的；整张图都找不到就原样返回
 */
export function nearestWalkable(s: TdState, x: number, y: number): { x: number; y: number } {
  ensureGrid(s);
  const occ = inner(s).occ;
  const cx = Math.floor(x / UNIT);
  const cy = Math.floor(y / UNIT);
  let best: { x: number; y: number } | null = null;
  let bd = Number.POSITIVE_INFINITY;
  let bi = -1;
  let stop = Number.POSITIVE_INFINITY;
  for (let r = 0; r <= stop && r < 64; r++) {
    for (let gy = cy - r; gy <= cy + r; gy++) {
      for (let gx = cx - r; gx <= cx + r; gx++) {
        if (Math.max(Math.abs(gx - cx), Math.abs(gy - cy)) !== r || !inGrid(s.ext, gx, gy)) continue;
        const i = cellIdx(gx, gy);
        if (occ[i] !== 0) continue;
        const p = { x: gx * UNIT + 50, y: gy * UNIT + 50 };
        const d = d2(p.x, p.y, x, y);
        if (d < bd || (d === bd && i < bi)) {
          bd = d;
          bi = i;
          best = p;
        }
      }
    }
    if (best && stop === Number.POSITIVE_INFINITY) stop = r + 1;
  }
  return best ?? { x, y };
}

/** 占格图：普通局面用 I.occ；站在收起的吊桥上时把那座桥暂算成能走 */
export function occFor(s: TdState, bi: 0 | 1 | -1): Uint8Array {
  ensureGrid(s);
  const I = inner(s);
  if (bi !== 0 && bi !== 1) return I.occ;
  I.bridgeOcc ??= [null, null];
  let occ = I.bridgeOcc[bi];
  if (!occ) {
    occ = new Uint8Array(I.occ);
    for (const c of s.level.drawbridge![bi]) if (inGrid(s.ext, c.x, c.y)) occ[cellIdx(c.x, c.y)] = 0;
    I.bridgeOcc[bi] = occ;
  }
  return occ;
}

function flowTo(s: TdState, key: string, goals: () => number[], wallCost: number, bridge: 0 | 1 | -1 = -1): Int32Array {
  ensureGrid(s);
  const I = inner(s);
  const k = bridge >= 0 ? `${wallCost}|b${bridge}|${key}` : `${wallCost}|${key}`;
  let f = I.flow.get(k);
  if (!f) {
    f = flowField(occFor(s, bridge), s.ext, goals(), wallCost);
    I.flow.set(k, f);
  }
  return f;
}

export function treasureFlow(s: TdState, i: number, wallCost: number, bridge: 0 | 1 | -1 = -1): Int32Array {
  const t = s.treasures[i] as { x: number; y: number };
  return flowTo(s, `t${i}`, () => [cellIdx(t.x, t.y)], wallCost, bridge);
}

export function cellFlow(s: TdState, cell: number, wallCost: number, bridge: 0 | 1 | -1 = -1): Int32Array {
  return flowTo(s, `c${cell}`, () => [cell], wallCost, bridge);
}


/** 敌人站在雾区里（关卡没写雾区就永远 false） */
export function inFogZone(s: TdState, e: TdEnemy): boolean {
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

export function seen(s: TdState, e: TdEnemy): boolean {
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
/**
 * 这一发打得到这个敌人吗：活着、这种伤害对它不是 0 倍、看得见；海上的炮艇还要射程 range 不小于 TD_SEA_RANGE
 * （英雄不给 range，打不到海上的）
 */
export function targetable(s: TdState, e: TdEnemy, h: Hit, range = 0): boolean {
  if (e.mode !== 'in' && e.mode !== 'out') return false;
  if (TD2_ENEMIES[e.kind].shell && range < TD_SEA_RANGE) return false;
  if (mult(h, TD_ENEMY_ARMOR[e.kind]) <= 0) return false;
  return seen(s, e);
}

export function addGold(s: TdState, n: number): void {
  s.gold += n;
  s.goldEarned += n;
}

/** 某个敌人在第 w 波的血量：统一敌人表 × 关卡 hpPct（战役一律 100）× 波次 hpPct（大潮） */
export function enemyHp(lv: TdLevel, kind: TdEnemyKind, w: number): number {
  const wp = lv.waves[w]?.hpPct;
  return Math.max(1, Math.floor((TD2_ENEMIES[kind].hp * (wp ? Math.floor((lv.hpPct * wp) / 100) : lv.hpPct)) / 100));
}

/** 障碍没了：压木台的沉船顺带把木台放出来（cleared 事件） */
export function blockGone(s: TdState, ev: TdEvent[], b: TdBlock, paid: boolean, gold: number): void {
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

export function damageBlock(s: TdState, ev: TdEvent[], b: TdBlock, dmg: number): void {
  if (b.destroyed) return;
  b.hp -= dmg;
  if (b.hp > 0) return;
  blockGone(s, ev, b, false, b.gold);
}

export function slotTower(s: TdState, slot: number): TdTower | undefined {
  const sl = s.slots[slot];
  if (!sl || sl.tower < 0) return undefined;
  return s.towers.find((t) => t.id === sl.tower);
}

/** 一波全部打死能拿多少金（分裂小艇算上分出来的） */
export function waveGold(lv: TdLevel, w: number): number {
  let g = 0;
  for (const grp of lv.waves[w]?.groups ?? []) {
    const def = TD2_ENEMIES[grp.enemy];
    g += grp.n * (def.gold + (def.split ? def.split.n * TD2_ENEMIES[def.split.kind].gold : 0));
  }
  return g;
}

/** 第 w 波（w ≥ 1）开打前的倒数：每波的倒数，首领波前另加 bossExtra */
export function gapBefore(lv: TdLevel, w: number): number {
  const boss = !!lv.waves[w]?.boss;
  const extra = (lv as TdLevel & { bossExtra?: number }).bossExtra ?? TD2_BOSS_EXTRA_TICKS;
  return lv.waveTicks + (boss ? extra : 0);
}

export function moveToward(e: { x: number; y: number; face: 1 | -1 }, tx: number, ty: number, spd: number): void {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = isqrt(dx * dx + dy * dy);
  if (d === 0) return;
  const st = Math.min(spd, d);
  if (dx !== 0) e.face = dx > 0 ? 1 : -1;
  e.x += Math.round((dx * st) / d);
  e.y += Math.round((dy * st) / d);
}

/** 格子 n 在拒马挡住的 3×3 范围里 */
export function barricadeAt(s: TdState, n: number): TdBarricade | undefined {
  if (s.barricades.length === 0) return undefined;
  const x = cellX(n);
  const y = cellY(n);
  for (const b of s.barricades) if (Math.abs(x - (b.x * UNIT + 50)) <= UNIT && Math.abs(y - (b.y * UNIT + 50)) <= UNIT) return b;
  return undefined;
}
