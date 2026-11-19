/**
 * 登陆战：固定步长、整数坐标（1 格 = 100 单位）、确定性。
 * 同一个 setup 加同一串操作必得同一结果；这里不用随机、时间和平台数学函数，开方用整数牛顿法。
 */
import { BUILDINGS, DEFENSE_KINDS, SHIELD, SKILLS, TROOPS } from '../content/index.ts';
import { BRANCH_BY_ID, RAID_BRANCH_PCT, RAID_LINE_MAX } from '../content/branches.ts';
import { RAID_HERO, RAID_HERO_AGGRO, RAID_HERO_CLUSTER, RAID_HERO_GUARD, RAID_HERO_LEASH, TD_KEG_THROW, TD_RALLY_PCT, TD_RALLY_R } from '../content/tdunits.ts';
import { SNIPE_WARN, applyStun, flightTicks, inRing, laneOffset, leadPoint, rankTargets, shieldFaces, stunned } from './combat.ts';
import { isqrt } from './fmath.ts';
import { GRID, INF, cellIdx, cellOf, flowFrom, inGrid, nextCell as gridNextCell } from './grid.ts';
import { sanitizeBranch } from './tdbase.ts';
import { FUN } from '../content/fun.ts';
import { type FunState, allyPending, funCut, funFingerprint, makeFun, stepFun } from './fun.ts';
import { Rng, hash32 } from './rng.ts';
import { BATTLE_TICKS, BEACH, ISLAND, RULES_VERSION, UNIT, RULES_SINCE } from './types.ts';
import type {
  ArmySetup,
  BBuilding,
  BHero,
  BuildingKind,
  BProjectile,
  BUnit,
  BattleAction,
  BattleEvent,
  BattleResult,
  BattleSetup,
  BattleState,
  Placed,
} from './types.ts';

/** 延迟结算的命中：炮弹飞行时间到了才算伤害 */
interface Pend {
  t: number;
  kind: 'unit' | 'building' | 'splashU' | 'splashB' | 'hero' | 'grenade';
  id: number;
  dmg: number;
  x: number;
  y: number;
  r: number;
  /** 规则版本 ≥ 6 的分叉效果（命中时减速、落点留火、拖拽）；旧版本没有这一项 */
  fx?: HitFx;
  /** 规则版本 ≥ 10：震荡炮的落点溅射，命中的兵震晕几拍 */
  stun?: number;
  /** 规则版本 ≥ 11：直射的出膛点（盾兵按它判正面）；溅射、抛射不写，盾挡不住 */
  sx?: number;
  sy?: number;
}

/** 分叉带来的命中效果（规则版本 ≥ 6） */
interface HitFx {
  slowPct: number;
  slowTicks: number;
  burnDps: number;
  burnTicks: number;
  /** 落点留火的半径（单位） */
  burnR: number;
  pull: number;
}

/** 防御塔、陷阱按等级和分叉算出来的数值（规则版本 ≥ 6，单位已换好） */
interface BStats {
  dmg: number;
  range: number;
  minRange: number;
  reload: number;
  splash: number;
  shots: number;
  line: boolean;
  fx: HitFx | undefined;
  /** 震荡炮：命中的兵震晕几拍（规则版本 10）；别的塔 0 */
  stun: number;
}

interface Fire {
  x: number;
  y: number;
  r: number;
  until: number;
  dps: number;
}

interface Internal {
  rng: Rng;
  nextUnit: number;
  nextProj: number;
  pend: Pend[];
  flareId: number;
  flareUntil: number;
  meds: Array<{ x: number; y: number; r: number; heal: number; until: number }>;
  army: ArmySetup;
  counted: number;
  destroyedCounted: number;
  hqDown: boolean;
  minSkill: number;
  /** 焦油减速：单位 id → 减速到哪一拍 */
  slow: number[];
  /** 建筑占格或存亡变了就加一：寻路用的格子图和流场据此重算 */
  ver: number;
  gridVer: number;
  /** 格子占用：0 空，>0 为建筑下标+1（只含会挡路的建筑） */
  occ: Int16Array;
  /** 目标建筑 id → 到它的代价流场 */
  flow: Map<number, Int32Array>;
  /** 以下只在规则版本 ≥ 6 用：塔的数值缓存、减速百分比、地上的火 */
  stats: Map<number, BStats>;
  slowPct: number[];
  fires: Fire[];
  /** 规则版本 ≥ 9：兵 id → 到哪一拍之前不理驻岛英雄（追不过去时记下，免得每拍在"追英雄"和"拆房子"之间来回切） */
  ignoreHero: number[];
  /** 规则版本 ≥ 12：远程兵为等盾兵已连续等了几拍（到 ESCORT_HOLD_MAX 就放行，打到敌人才清零） */
  hold: number[];
  /** 规则版本 ≥ 11：狙击塔 id → 正在瞄的目标和开火拍（锁定后 SNIPE_WARN 拍才开火） */
  snipe: Map<number, { target: number; fireAt: number }>;
  /** 规则版本 ≥ 13：每条船落地的拍和放下的兵 id（撤回用） */
  landAt: number[];
  landIds: number[][];
  /** 规则版本 ≥ 13 且 setup.fun 开着：宝箱、援军的状态（core/fun.ts）；没开 = undefined，一项都不碰 */
  fun?: FunState;
}

const ENERGY_CAP = 20;
/** 规则版本 ≥ 12（DESIGN 10.2b）：掷弹兵找目标比射程多看几格；船医只就近挑伤员的范围；远程兵等盾的距离差和最长等待 */
const GRENADE_LOOK = 300;
const MEDIC_REACH = 600;
const ESCORT_GAP = 150;
const ESCORT_HOLD_MAX = 60;
const RANGED_KINDS: ReadonlySet<string> = new Set(['gunner', 'harpooner', 'cannoneer', 'grenadier']);
/** 兵要砸一段墙的代价（相当于绕多远的路） */
const WALL_COST = 7;
/** 炸药兵炸墙的伤害倍数 */
const WALL_BOMB_MUL = 3;
/** 掷弹兵的手雷炸到城墙只算百分之几（规则版本 10，DESIGN 13：墙挡不住雷，但拆墙仍然慢） */
export const GRENADE_WALL_PCT = 30;
/** 手雷每拍飞多远（单位）、最少飞几拍（抛物线，近处也要看得见） */
const GRENADE_SPEED = 18;
const GRENADE_MIN_FLIGHT = 12;
const BARRAGE_FLIGHT = 24;
/** 各种弹丸每拍飞多远（单位） */
const PROJ_SPEED = { ball: 25, bullet: 45, shell: 14, flame: 60 } as const;

function inner(s: BattleState): Internal {
  return s.internal as Internal;
}

/** 信号弹正标着的建筑 id（没标或已过期返回 -1）；只读，给画面画持续的准星，不改状态、不进指纹 */
export function flareTarget(s: BattleState): number {
  const I = inner(s);
  return s.tick < I.flareUntil ? I.flareId : -1;
}

/** 兵 id 被减速到哪一拍（焦油、冰冻类命中写的内部表）；只读，给画面画焦油黑点用，不改状态、不进指纹 */
export function slowUntil(s: BattleState, id: number): number {
  return inner(s).slow[id] ?? 0;
}

function isCounted(b: BBuilding): boolean {
  return b.kind !== 'palm' && b.kind !== 'rock' && b.kind !== 'mine' && b.kind !== 'tar' && b.kind !== 'wall' && !isDeco(b);
}

function isDeco(b: BBuilding): boolean {
  return b.kind === 'palm' || b.kind === 'rock' || b.kind === 'statue' || b.kind === 'flagpole' || b.kind === 'chest' || b.kind === 'wheel';
}

function bldById(s: BattleState, id: number): BBuilding | undefined {
  for (const b of s.buildings) if (b.id === id) return b;
  return undefined;
}

export function createBattle(setup: BattleSetup): BattleState {
  // 规则版本 10 以前没有震荡炮、11 以前没有狙击塔：万一布局里带了也不摆（旧版本的岛不会有，回放逐位不变）
  const layout = setup.layout.filter((p) => !(p.kind === 'shock' && setup.rules < RULES_SINCE.shockGrenadier) && !(p.kind === 'sniper' && setup.rules < RULES_SINCE.sniperShield));
  const buildings: BBuilding[] = layout.map((p) => {
    const def = BUILDINGS[p.kind];
    const hp = def.levels[p.level - 1]?.hp ?? 0;
    return {
      id: p.id,
      kind: p.kind,
      level: p.level,
      x: p.x,
      y: p.y,
      size: def.size,
      hp,
      maxHp: hp,
      destroyed: false,
      revealed: p.kind !== 'mine' && p.kind !== 'tar',
      aim: -1,
      cd: 0,
    };
  });
  let minSkill = Number.POSITIVE_INFINITY;
  for (const k of setup.army.skills) {
    const e = SKILLS[k.kind].levels[k.level - 1]?.energy ?? 0;
    if (e < minSkill) minSkill = e;
  }
  const internal: Internal = {
    rng: new Rng(setup.seed, 'land'),
    nextUnit: 1,
    nextProj: 1,
    pend: [],
    flareId: -1,
    flareUntil: 0,
    meds: [],
    army: setup.army,
    counted: buildings.filter(isCounted).length,
    destroyedCounted: 0,
    hqDown: false,
    minSkill,
    slow: [],
    ver: 1,
    gridVer: 0,
    occ: new Int16Array(GRID * GRID),
    flow: new Map(),
    stats: new Map(),
    slowPct: [],
    fires: [],
    ignoreHero: [],
    hold: [],
    snipe: new Map(),
    landAt: [],
    landIds: [],
  };
  // 规则版本 6：分叉带进登陆战（只认合法的前缀，和守岛一样）
  if (setup.rules >= RULES_SINCE.raidHero) {
    layout.forEach((p, i) => {
      const br = sanitizeBranch(p.kind, p.level, p.branch);
      if (br) (buildings[i] as BBuilding).branch = br;
    });
  }
  // 雾塔：半径内的建筑先看不见
  for (const t of buildings) {
    if (t.kind !== 'fogTower') continue;
    for (const b of buildings) if (fogCovers(t, b)) b.revealed = false;
  }
  const s: BattleState = {
    rules: setup.rules,
    tick: 0,
    units: [],
    buildings,
    projectiles: [],
    landed: setup.army.boats.map(() => false),
    energy: setup.army.energy,
    over: false,
    internal,
  };
  const mf = makeFun(setup, buildings);
  if (mf) {
    internal.fun = mf.fun;
    if (mf.chests) s.chests = mf.chests;
  }
  if (setup.rules >= RULES_SINCE.raidHero) {
    s.fires = internal.fires;
    const hero = makeHero(s, setup.hero);
    if (hero) s.hero = hero;
  }
  return s;
}

/** 给"侦察别人的岛"界面用：去掉地雷（敌方看不见），其余原样 */
export function publicLayout(layout: Placed[]): Placed[] {
  return layout.filter((b) => b.kind !== 'mine').map((b) => ({ ...b }));
}

/** 雾塔 t 的半径是否罩住建筑 b（雾塔自己、地雷、陷阱、装饰不算） */
function fogCovers(t: BBuilding, b: BBuilding): boolean {
  if (b.kind === 'fogTower' || b.kind === 'mine' || b.kind === 'tar' || isDeco(b)) return false;
  const r = Math.round((BUILDINGS.fogTower.levels[t.level - 1]?.range ?? 5) * UNIT);
  const dx = cxOf(b) - cxOf(t);
  const dy = cyOf(b) - cyOf(t);
  return dx * dx + dy * dy <= r * r;
}

export function canLand(_state: BattleState, x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const cx = Math.floor(x / UNIT);
  const cy = Math.floor(y / UNIT);
  if (cx < -BEACH || cy < -BEACH || cx >= ISLAND + BEACH || cy >= ISLAND + BEACH) return false;
  return !(cx >= 0 && cy >= 0 && cx < ISLAND && cy < ISLAND);
}

export function battleResult(s: BattleState): BattleResult {
  const I = inner(s);
  const pct = I.counted === 0 ? 100 : Math.floor((I.destroyedCounted * 100) / I.counted);
  const stars = (pct >= 50 ? 1 : 0) + (I.hqDown ? 1 : 0) + (pct >= 100 ? 1 : 0);
  return { over: s.over, stars, destroyedPct: pct, hqDown: I.hqDown };
}

/** 状态指纹：测试里比较两次重放是否逐位一致 */
export function battleFingerprint(s: BattleState): number {
  const I = inner(s);
  const parts: number[] = [s.tick, s.energy, s.over ? 1 : 0, I.pend.length, I.nextUnit, I.flareId, I.flareUntil, ...I.rng.snapshot()];
  for (const u of s.units) parts.push(u.id, u.x, u.y, u.hp, u.target, u.cd, u.mode === 'dead' ? 2 : u.mode === 'attack' ? 1 : 0);
  for (const b of s.buildings) parts.push(b.id, b.hp, b.destroyed ? 1 : 0, b.revealed ? 1 : 0, b.aim, b.cd);
  if (s.rules >= RULES_SINCE.raidHero) {
    const h = s.hero;
    // 没有英雄、地上没火时一项不加：战役岛（没有宝藏箱和分叉）在版本 5、6 下指纹相同，测试据此锁住"规则 6 不改战役结果"
    if (h) parts.push(h.x, h.y, h.hp, h.target, h.cd, h.kegReady, h.rallyReady, h.rallyUntil, h.returning ? 1 : 0);
    for (const f of I.fires) parts.push(f.x, f.y, f.until);
  }
  if (I.fun) parts.push(...funFingerprint(I.fun, s.chests));
  return hash32(parts.join(','), 7);
}

/** 这条船现在能不能撤回（规则版本 ≥ 13）：落地 recallTicks 拍内，这批兵都活着、满血、还没出过手（cd 还是落地那拍）；画面的撤回钮也问它 */
export function canRecall(s: BattleState, boat: number): boolean {
  if (s.rules < RULES_SINCE.fun || s.over || !s.landed[boat]) return false;
  const I = inner(s);
  const at = I.landAt[boat];
  const ids = I.landIds[boat];
  if (at === undefined || !ids || ids.length === 0 || s.tick - at > FUN.recallTicks) return false;
  for (const id of ids) {
    const u = s.units.find((q) => q.id === id);
    if (!u || u.mode === 'dead' || u.hp < u.maxHp || u.cd !== at) return false;
  }
  return true;
}

// ------------------------------------------------------------ 几何

function bx0(b: BBuilding): number {
  return b.x * UNIT;
}
function bx1(b: BBuilding): number {
  return (b.x + b.size) * UNIT;
}
function by0(b: BBuilding): number {
  return b.y * UNIT;
}
function by1(b: BBuilding): number {
  return (b.y + b.size) * UNIT;
}
function cxOf(b: BBuilding): number {
  return b.x * UNIT + (b.size * UNIT) / 2;
}
function cyOf(b: BBuilding): number {
  return b.y * UNIT + (b.size * UNIT) / 2;
}
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : Math.min(v, hi);
}
/** 点到建筑占地矩形的距离平方 */
function d2Rect(px: number, py: number, b: BBuilding): number {
  const dx = clamp(px, bx0(b), bx1(b)) - px;
  const dy = clamp(py, by0(b), by1(b)) - py;
  return dx * dx + dy * dy;
}

function unitRange(u: BUnit): number {
  return Math.round((TROOPS[u.kind].levels[u.level - 1]?.range ?? 1) * UNIT);
}

// ------------------------------------------------------------ 伤害

function damageUnit(s: BattleState, ev: BattleEvent[], u: BUnit, dmg: number): void {
  if (u.mode === 'dead') return;
  const fun = inner(s).fun;
  if (fun) dmg = funCut(fun, u.id, s.tick, dmg);
  u.hp -= dmg;
  ev.push({ type: 'hit', x: u.x, y: u.y, dmg, target: 'unit', id: u.id });
  if (u.hp <= 0) {
    u.hp = 0;
    u.mode = 'dead';
    ev.push({ type: 'die', id: u.id, kind: u.kind });
  }
  void s;
}

/** 盾朝 (dx, dy) 方向（取单位向量 × 100）；没有方向（0, 0）就不改 */
function setShield(u: BUnit, dx: number, dy: number): void {
  const d = isqrt(dx * dx + dy * dy);
  if (d === 0) return;
  u.gx = Math.round((dx * 100) / d);
  u.gy = Math.round((dy * 100) / d);
}

/**
 * 直射命中前过一遍盾（规则版本 11）：自己是盾兵且盾朝着来弹、没被震晕，只吃 SHIELD.frontPct%；
 * 否则看身后 SHIELD.coverRadius 内有没有盾兵替他挡（盾对着来弹、他在盾后 ±60° 里），有就少吃 coverCutPct%。每发只算一层。
 */
function guardedDamage(s: BattleState, ev: BattleEvent[], u: BUnit, dmg: number, sx: number, sy: number): number {
  const front = (o: BUnit): boolean => o.mode !== 'dead' && !stunned(o, s.tick) && shieldFaces(o.gx ?? 0, o.gy ?? 0, o.x, o.y, sx, sy);
  const spark = (o: BUnit): { x: number; y: number } => ({ x: o.x + Math.round(((o.gx ?? 0) * 40) / 100), y: o.y + Math.round(((o.gy ?? 0) * 40) / 100) });
  if (u.kind === 'shield' && front(u)) {
    ev.push({ type: 'guard', id: u.id, ...spark(u), cover: false });
    return Math.floor((dmg * SHIELD.frontPct) / 100);
  }
  const r2 = SHIELD.coverRadius * SHIELD.coverRadius;
  for (const o of s.units) {
    if (o === u || o.kind !== 'shield' || !front(o)) continue;
    if ((o.x - u.x) * (o.x - u.x) + (o.y - u.y) * (o.y - u.y) > r2) continue;
    if (!shieldFaces(o.x - sx, o.y - sy, o.x, o.y, u.x, u.y)) continue;
    ev.push({ type: 'guard', id: o.id, ...spark(o), cover: true });
    return Math.floor((dmg * (100 - SHIELD.coverCutPct)) / 100);
  }
  return dmg;
}

function destroyBuilding(s: BattleState, ev: BattleEvent[], b: BBuilding): void {
  const I = inner(s);
  b.hp = 0;
  b.destroyed = true;
  b.revealed = true;
  I.ver++;
  ev.push({ type: 'destroy', id: b.id, kind: b.kind });
  if (isCounted(b)) {
    I.destroyedCounted++;
    if (b.kind === 'hq') I.hqDown = true;
    if (s.energy < ENERGY_CAP) s.energy++;
  }
}

function damageBuilding(s: BattleState, ev: BattleEvent[], b: BBuilding, dmg: number, px: number, py: number): void {
  if (b.destroyed || isDeco(b)) return;
  b.hp -= dmg;
  ev.push({ type: 'hit', x: px, y: py, dmg, target: 'building', id: b.id });
  if (b.hp <= 0) destroyBuilding(s, ev, b);
}

function addProjectile(s: BattleState, kind: BProjectile['kind'], x0: number, y0: number, x1: number, y1: number, flight: number): BProjectile {
  const I = inner(s);
  const p: BProjectile = { id: I.nextProj++, kind, x0, y0, x1, y1, t0: s.tick, t1: s.tick + flight };
  s.projectiles.push(p);
  return p;
}

// ------------------------------------------------------------ 目标

function pickTarget(s: BattleState, u: BUnit): number {
  const def = TROOPS[u.kind];
  let best = -1;
  let bestD = Number.POSITIVE_INFINITY;
  const scan = (onlyDefense: boolean): void => {
    for (const b of s.buildings) {
      if (b.destroyed || isDeco(b) || b.kind === 'mine' || b.kind === 'tar' || b.kind === 'wall') continue;
      if (onlyDefense && !DEFENSE_KINDS.has(b.kind)) continue;
      const d = d2Rect(u.x, u.y, b);
      if (d < bestD) {
        bestD = d;
        best = b.id;
      }
    }
  };
  if (u.kind === 'bomber') {
    // 炸药兵优先炸墙：附近 6 格内有墙就先去炸最近的一段
    for (const b of s.buildings) {
      if (b.destroyed || b.kind !== 'wall') continue;
      const d = d2Rect(u.x, u.y, b);
      if (d <= 600 * 600 && d < bestD) {
        bestD = d;
        best = b.id;
      }
    }
    if (best >= 0) return best;
  }
  if (u.kind === 'grenadier' && s.rules >= RULES_SINCE.raidAi) {
    const id = pickGrenadeTarget(s, u);
    if (id >= 0) return id;
  }
  if (def.prefers === 'defense') scan(true);
  if (best < 0) scan(false);
  return best;
}

/**
 * 规则版本 ≥ 12：掷弹兵挑"一颗雷炸得最多"的建筑：射程 + GRENADE_LOOK 内，每座按落点半径内的非墙建筑打分（防御 3、其余 1），
 * 分高的先，同分离得近的先，再按 id；一座都没有返回 -1（退回最近的建筑）。
 */
function pickGrenadeTarget(s: BattleState, u: BUnit): number {
  const R = unitRange(u) + GRENADE_LOOK;
  const splash = Math.round((TROOPS.grenadier.levels[u.level - 1]?.splash ?? 1) * UNIT);
  const live = s.buildings.filter((b) => !b.destroyed && !isDeco(b) && b.kind !== 'mine' && b.kind !== 'tar' && b.kind !== 'wall');
  let best = -1;
  let bestScore = -1;
  let bestD = Number.POSITIVE_INFINITY;
  for (const b of live) {
    const d = d2Rect(u.x, u.y, b);
    if (d > R * R) continue;
    const cx = cxOf(b);
    const cy = cyOf(b);
    let score = 0;
    for (const o of live) if (d2Rect(cx, cy, o) <= splash * splash) score += DEFENSE_KINDS.has(o.kind) ? 3 : 1;
    if (score > bestScore || (score === bestScore && d < bestD)) {
      bestScore = score;
      bestD = d;
      best = b.id;
    }
  }
  return best;
}

/** 规则版本 ≥ 12：远程兵要往前挪时，比最近的活盾兵更靠前 ESCORT_GAP 以上就原地等，最多等 ESCORT_HOLD_MAX 拍 */
function escortHolds(s: BattleState, u: BUnit, tgt: BBuilding, dist: number): boolean {
  const I = inner(s);
  if ((I.hold[u.id] ?? 0) >= ESCORT_HOLD_MAX) return false;
  let sd = Number.POSITIVE_INFINITY;
  for (const o of s.units) {
    if (o.kind !== 'shield' || o.mode === 'dead' || stunned(o, s.tick)) continue;
    const dx = clamp(o.x, bx0(tgt), bx1(tgt)) - o.x;
    const dy = clamp(o.y, by0(tgt), by1(tgt)) - o.y;
    const d = isqrt(dx * dx + dy * dy);
    if (d < sd) sd = d;
  }
  if (sd === Number.POSITIVE_INFINITY || dist + ESCORT_GAP > sd) return false;
  I.hold[u.id] = (I.hold[u.id] ?? 0) + 1;
  return true;
}

// ------------------------------------------------------------ 操作

function doAction(s: BattleState, ev: BattleEvent[], a: BattleAction): void {
  const I = inner(s);
  if (a.type === 'recall') {
    if (!canRecall(s, a.boat)) return;
    const ids = I.landIds[a.boat] ?? [];
    s.units = s.units.filter((u) => !ids.includes(u.id));
    s.landed[a.boat] = false;
    I.landIds[a.boat] = [];
    ev.push({ type: 'recall', boat: a.boat, units: ids });
    return;
  }
  if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) return;
  if (a.type === 'land') {
    const boat = I.army.boats[a.boat];
    if (!boat || s.landed[a.boat] || !canLand(s, a.x, a.y)) return;
    // 掷弹兵规则版本 10 才有
    if (boat.troop === 'grenadier' && s.rules < RULES_SINCE.shockGrenadier) return;
    // 盾兵规则版本 11 才有
    if (boat.troop === 'shield' && s.rules < RULES_SINCE.sniperShield) return;
    s.landed[a.boat] = true;
    const lvl = TROOPS[boat.troop].levels[boat.level - 1];
    if (!lvl) return;
    const ids: number[] = [];
    for (let i = 0; i < boat.count; i++) {
      const id = I.nextUnit++;
      const u: BUnit = {
        id,
        kind: boat.troop,
        level: boat.level,
        x: a.x + I.rng.int(121) - 60,
        y: a.y + I.rng.int(121) - 60,
        hp: lvl.hp,
        maxHp: lvl.hp,
        target: -1,
        mode: 'move',
        face: 1,
        cd: s.tick,
      };
      // 盾兵：盾先朝岛心（之后按目标 / 走的方向更新）
      if (boat.troop === 'shield') setShield(u, (ISLAND * UNIT) / 2 - u.x, (ISLAND * UNIT) / 2 - u.y);
      s.units.push(u);
      ids.push(id);
    }
    I.landAt[a.boat] = s.tick;
    I.landIds[a.boat] = ids;
    ev.push({ type: 'land', boat: a.boat, x: a.x, y: a.y, units: ids });
    return;
  }
  const sk = I.army.skills.find((k) => k.kind === a.skill);
  const lv = sk ? SKILLS[a.skill].levels[sk.level - 1] : undefined;
  if (!sk || !lv || s.energy < lv.energy) return;
  const r = Math.round(lv.radius * UNIT);
  if (a.skill === 'barrage') {
    s.energy -= lv.energy;
    addProjectile(s, 'barrage', a.x - 1800, a.y - 900, a.x, a.y, BARRAGE_FLIGHT);
    I.pend.push({ t: s.tick + BARRAGE_FLIGHT, kind: 'splashB', id: -1, dmg: lv.dmg ?? 0, x: a.x, y: a.y, r });
  } else if (a.skill === 'flare') {
    let best: BBuilding | undefined;
    let bestD = r * r + 1;
    for (const b of s.buildings) {
      if (b.destroyed || isDeco(b) || b.kind === 'mine' || b.kind === 'tar') continue;
      if (!b.revealed) continue; // 雾里看不见，信号弹标不了
      const d = d2Rect(a.x, a.y, b);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    if (!best) return;
    s.energy -= lv.energy;
    I.flareId = best.id;
    I.flareUntil = s.tick + (lv.duration ?? 160);
    for (const u of s.units) if (u.mode !== 'dead') u.target = best.id;
  } else {
    s.energy -= lv.energy;
    I.meds.push({ x: a.x, y: a.y, r, heal: lv.heal ?? 0, until: s.tick + (lv.duration ?? 100) });
  }
  ev.push({ type: 'skill', skill: a.skill, x: a.x, y: a.y });
}

// ------------------------------------------------------------ 一拍

function resolvePend(s: BattleState, ev: BattleEvent[]): void {
  const I = inner(s);
  const keep: Pend[] = [];
  for (const p of I.pend) {
    if (p.t > s.tick) {
      keep.push(p);
      continue;
    }
    if (p.kind === 'hero') {
      if (s.hero) damageHero(s, ev, p.dmg);
    } else if (p.kind === 'unit') {
      const u = s.units[p.id - 1];
      if (u && u.mode !== 'dead') {
        damageUnit(s, ev, u, p.sx !== undefined && p.sy !== undefined ? guardedDamage(s, ev, u, p.dmg, p.sx, p.sy) : p.dmg);
        if (p.fx) applyFx(s, u, p.fx);
      }
      if (p.fx && p.fx.burnDps > 0) addFire(s, p.x, p.y, p.fx);
    } else if (p.kind === 'building') {
      const b = bldById(s, p.id);
      if (b) damageBuilding(s, ev, b, p.dmg, p.x, p.y);
    } else if (p.kind === 'splashU') {
      ev.push({ type: 'explode', x: p.x, y: p.y, r: p.r });
      for (const u of s.units) {
        if (u.mode === 'dead') continue;
        const dx = u.x - p.x;
        const dy = u.y - p.y;
        if (dx * dx + dy * dy <= p.r * p.r) {
          damageUnit(s, ev, u, p.dmg);
          if (p.fx) applyFx(s, u, p.fx);
          if (p.stun && u.hp > 0) {
            // 震晕（规则版本 10）：船长只震一半；免控中的不再震
            const until = applyStun(u, s.tick, p.stun, u.kind === 'captain');
            if (until >= 0) ev.push({ type: 'stun', target: 'unit', id: u.id, until });
          }
        }
      }
      if (p.fx && p.fx.burnDps > 0) addFire(s, p.x, p.y, p.fx);
    } else if (p.kind === 'grenade') {
      grenadeBlast(s, ev, p);
    } else {
      ev.push({ type: 'explode', x: p.x, y: p.y, r: p.r });
      for (const b of s.buildings) {
        if (b.destroyed || isDeco(b)) continue;
        if (!b.revealed && b.kind !== 'mine' && b.kind !== 'tar') continue; // 炮击打不中看不见的
        if (d2Rect(p.x, p.y, b) <= p.r * p.r) damageBuilding(s, ev, b, p.dmg, p.x, p.y);
      }
      // 规则版本 6：炮击也炸得到驻岛英雄
      const h = s.hero;
      if (h && h.mode !== 'dead' && (h.x - p.x) * (h.x - p.x) + (h.y - p.y) * (h.y - p.y) <= p.r * p.r) damageHero(s, ev, p.dmg);
    }
  }
  I.pend = keep;
}

/**
 * 手雷落地（规则版本 10）：半径内的建筑都挨炸（城墙只算 GRENADE_WALL_PCT%），驻岛英雄也炸；
 * 埋着的地雷、焦油不炸（看不见），装饰不算。手雷是抛的，所以墙后的建筑照样炸得到。
 */
function grenadeBlast(s: BattleState, ev: BattleEvent[], p: Pend): void {
  ev.push({ type: 'explode', x: p.x, y: p.y, r: p.r });
  for (const b of s.buildings) {
    if (b.destroyed || isDeco(b) || b.kind === 'mine' || b.kind === 'tar') continue;
    if (d2Rect(p.x, p.y, b) > p.r * p.r) continue;
    damageBuilding(s, ev, b, b.kind === 'wall' ? Math.floor((p.dmg * GRENADE_WALL_PCT) / 100) : p.dmg, p.x, p.y);
  }
  const h = s.hero;
  if (h && h.mode !== 'dead' && (h.x - p.x) * (h.x - p.x) + (h.y - p.y) * (h.y - p.y) <= p.r * p.r) damageHero(s, ev, p.dmg);
}

/** 掷弹兵扔一颗手雷到 (tx, ty)：抛物线飞过去（越过城墙），落地按 grenadeBlast 结算 */
function throwGrenade(s: BattleState, ev: BattleEvent[], u: BUnit, tx: number, ty: number, dmg: number, splash: number): void {
  const fl = Math.max(GRENADE_MIN_FLIGHT, flightTicks(u.x, u.y, tx, ty, GRENADE_SPEED));
  const pr = addProjectile(s, 'grenade', u.x, u.y, tx, ty, fl);
  inner(s).pend.push({ t: s.tick + fl, kind: 'grenade', id: -1, dmg, x: tx, y: ty, r: Math.round(splash * UNIT) });
  ev.push({ type: 'shoot', from: 'unit', id: u.id, projectile: pr.id });
}

/** 格子占用图：建筑数量或存亡变了才重建，流场缓存同时清掉 */
function ensureGrid(s: BattleState): void {
  const I = inner(s);
  if (I.gridVer === I.ver) return;
  I.occ.fill(0);
  s.buildings.forEach((b, i) => {
    if (b.destroyed || isDeco(b) || b.kind === 'mine' || b.kind === 'tar') return;
    for (let ox = 0; ox < b.size; ox++) for (let oy = 0; oy < b.size; oy++) I.occ[cellIdx(b.x + ox, b.y + oy)] = i + 1;
  });
  I.flow.clear();
  I.gridVer = I.ver;
}

/** 下一步该走哪个格（流场里最低的邻格）；没有路时返回 -1 */
function nextCell(s: BattleState, u: BUnit, tgt: BBuilding): number {
  ensureGrid(s);
  const I = inner(s);
  // 到目标建筑的代价流场（按目标缓存）：墙可以走但贵（要砸），别的建筑不能走；目标四周的空格是终点
  let f = I.flow.get(tgt.id);
  if (!f) {
    const isHard = (idx: number): boolean => {
      const o = I.occ[idx] ?? 0;
      return o > 0 && (s.buildings[o - 1] as BBuilding).kind !== 'wall';
    };
    f = flowFrom(
      I.occ,
      (seed) => {
        // 终点：目标占地外一圈（含斜角）里能站的格
        for (let cy = tgt.y - 1; cy <= tgt.y + tgt.size; cy++) {
          for (let cx = tgt.x - 1; cx <= tgt.x + tgt.size; cx++) {
            if (cx >= tgt.x && cx < tgt.x + tgt.size && cy >= tgt.y && cy < tgt.y + tgt.size) continue;
            if (!inGrid(cx, cy)) continue;
            seed(cellIdx(cx, cy));
          }
        }
      },
      isHard,
      (n) => ((I.occ[n] ?? 0) > 0 ? WALL_COST : 1),
    );
    I.flow.set(tgt.id, f);
  }
  // 脚下就是够不着的格（INF）时不找路；grid.nextCell 只认 0
  if ((f[cellOf(u.x, u.y)] as number) >= INF) return -1;
  return gridNextCell(I.occ, f, u.x, u.y);
}

/** 下一步的格子上是墙就返回那段墙 */
function nextWall(s: BattleState, u: BUnit, tgt: BBuilding): BBuilding | undefined {
  const n = nextCell(s, u, tgt);
  if (n < 0) return undefined;
  const o = inner(s).occ[n] ?? 0;
  const b = o > 0 ? s.buildings[o - 1] : undefined;
  return b && b.kind === 'wall' ? b : undefined;
}

/**
 * 兵在格子里的小道偏移（规则版本 ≥ 9）：横竖各 -2..2 档 × 12，最多偏 24。
 * 为什么是 12：格子半宽 50，偏 24 还留 26 的余量，兵始终站在流场选的那一格里、不会蹭进旁边建筑的占格；
 * 相邻 id 至少差 12，画面上脚底不再重成一个点。再大就开始贴着建筑边走，近战兵的接敌距离也会变得忽长忽短。
 */
const RAID_LANE_SPREAD = 12;

/** 沿流场走一步（没有路就直线走，和旧行为一致）；返回位移。规则版本 ≥ 9 走向格子中心加上自己的小道偏移 */
function flowStep(s: BattleState, u: BUnit, tgt: BBuilding, dx: number, dy: number, dist: number, step: number): [number, number] {
  const n = nextCell(s, u, tgt);
  if (n < 0) return [Math.round((dx * step) / dist), Math.round((dy * step) / dist)];
  const o = s.rules >= RULES_SINCE.combat ? laneOffset(u.id, RAID_LANE_SPREAD) : { x: 0, y: 0 };
  const tx = ((n % GRID) - BEACH) * UNIT + UNIT / 2 + o.x - u.x;
  const ty = (Math.floor(n / GRID) - BEACH) * UNIT + UNIT / 2 + o.y - u.y;
  const d = isqrt(tx * tx + ty * ty);
  if (d === 0) return [0, 0];
  const st = Math.min(step, d);
  if (tx !== 0) u.face = tx > 0 ? 1 : -1;
  return [Math.round((tx * st) / d), Math.round((ty * st) / d)];
}

function stepUnits(s: BattleState, ev: BattleEvent[]): void {
  const I = inner(s);
  for (const u of s.units) {
    if (u.mode === 'dead') continue;
    // 规则版本 ≥ 9：记下这一拍走之前的位置，塔按"这一拍走了多少"估提前量
    if (s.rules >= RULES_SINCE.combat) {
      u.px = u.x;
      u.py = u.y;
    }
    // 规则版本 10：震晕中不走不打（stunUntil 只有震荡炮会写）
    if (s.rules >= RULES_SINCE.shockGrenadier && stunned(u, s.tick)) continue;
    const def = TROOPS[u.kind];
    const lvl = def.levels[u.level - 1];
    if (!lvl) continue;
    if (u.kind === 'medic') {
      stepMedic(s, ev, u, lvl);
      continue;
    }
    if (s.hero && u.kind !== 'bomber' && fightHero(s, ev, u, lvl)) continue;
    let tgt = u.target >= 0 ? bldById(s, u.target) : undefined;
    if (s.tick < I.flareUntil && u.target !== I.flareId) {
      const f = bldById(s, I.flareId);
      if (f && !f.destroyed) tgt = f;
    }
    if (!tgt || tgt.destroyed) {
      const id = pickTarget(s, u);
      tgt = id >= 0 ? bldById(s, id) : undefined;
    }
    u.target = tgt ? tgt.id : -1;
    if (!tgt) {
      u.mode = 'move';
      continue;
    }
    const range = unitRange(u);
    const dx = clamp(u.x, bx0(tgt), bx1(tgt)) - u.x;
    const dy = clamp(u.y, by0(tgt), by1(tgt)) - u.y;
    const d2 = dx * dx + dy * dy;
    if (dx !== 0) u.face = dx > 0 ? 1 : -1;
    if (u.kind === 'shield') setShield(u, dx, dy);
    const dist = isqrt(d2);
    if (dist <= range) {
      u.mode = 'attack';
      if (s.rules >= RULES_SINCE.raidAi) inner(s).hold[u.id] = 0;
      if (s.tick < u.cd) continue;
      u.cd = s.tick + lvl.reload;
      if (u.kind === 'bomber') {
        const r = Math.round((lvl.splash ?? 1) * UNIT);
        ev.push({ type: 'explode', x: u.x, y: u.y, r });
        for (const b of s.buildings) {
          if (b.destroyed || isDeco(b)) continue;
          if (d2Rect(u.x, u.y, b) <= r * r) damageBuilding(s, ev, b, b.kind === 'wall' ? lvl.dmg * WALL_BOMB_MUL : lvl.dmg, u.x, u.y);
        }
        u.hp = 0;
        u.mode = 'dead';
        ev.push({ type: 'die', id: u.id, kind: u.kind });
      } else if (u.kind === 'grenadier') {
        throwGrenade(s, ev, u, cxOf(tgt), cyOf(tgt), lvl.dmg, lvl.splash ?? 1);
      } else if (range > 150) {
        const tx = cxOf(tgt);
        const ty = cyOf(tgt);
        const fl = flightTicks(u.x, u.y, tx, ty, PROJ_SPEED.bullet);
        const pr = addProjectile(s, 'bullet', u.x, u.y, tx, ty, fl);
        I.pend.push({ t: s.tick + fl, kind: 'building', id: tgt.id, dmg: lvl.dmg, x: tx, y: ty, r: 0 });
        ev.push({ type: 'shoot', from: 'unit', id: u.id, projectile: pr.id });
      } else {
        damageBuilding(s, ev, tgt, lvl.dmg, clamp(u.x, bx0(tgt), bx1(tgt)), clamp(u.y, by0(tgt), by1(tgt)));
      }
    } else {
      u.mode = 'move';
      if (s.rules >= RULES_SINCE.raidAi && RANGED_KINDS.has(u.kind) && escortHolds(s, u, tgt, dist)) continue;
      const spd = unitSpeed(s, u, lvl.speed);
      const wall = nextWall(s, u, tgt);
      if (wall) {
        // 前面是墙：砸墙（炸药兵的目标本身就是墙，走不到这里）
        u.mode = 'attack';
        if (s.tick >= u.cd) {
          u.cd = s.tick + lvl.reload;
          // 掷弹兵不砸墙：往墙上扔雷（只算三成，但连墙后一起炸）
          if (u.kind === 'grenadier') throwGrenade(s, ev, u, cxOf(wall), cyOf(wall), lvl.dmg, lvl.splash ?? 1);
          else damageBuilding(s, ev, wall, lvl.dmg, clamp(u.x, bx0(wall), bx1(wall)), clamp(u.y, by0(wall), by1(wall)));
        }
      } else {
        const step = Math.min(spd, dist - range);
        const mv = flowStep(s, u, tgt, dx, dy, dist, step);
        u.x += mv[0];
        u.y += mv[1];
      }
    }
  }
}

/** 规则版本 ≥ 12：船医的跟随对象。MEDIC_REACH 内血量比最低的伤员 → 全队最近的伤员 → 最近的友军 */
function medicPick(s: BattleState, u: BUnit): BUnit | undefined {
  let near: BUnit | undefined;
  let nearD = Number.POSITIVE_INFINITY;
  let low: BUnit | undefined;
  let lowR = Number.POSITIVE_INFINITY;
  let lowD = 0;
  let any: BUnit | undefined;
  let anyD = Number.POSITIVE_INFINITY;
  for (const a of s.units) {
    if (a.mode === 'dead' || a.kind === 'medic') continue;
    const d = (a.x - u.x) * (a.x - u.x) + (a.y - u.y) * (a.y - u.y);
    if (d < anyD) {
      anyD = d;
      any = a;
    }
    if (a.hp >= a.maxHp) continue;
    if (d < nearD) {
      nearD = d;
      near = a;
    }
    if (d <= MEDIC_REACH * MEDIC_REACH) {
      const r = Math.floor((a.hp * 1000) / a.maxHp);
      if (r < lowR || (r === lowR && d < lowD)) {
        lowR = r;
        low = a;
        lowD = d;
      }
    }
  }
  return low ?? near ?? any;
}

/** 规则版本 ≥ 12：船医该站的点——伤员背后 hold 处（背后 = 离伤员最近的防御的反方向；没有防御就是现在的方向） */
function behindPoint(s: BattleState, a: BUnit, hold: number): [number, number] {
  let best: BBuilding | undefined;
  let bestD = Number.POSITIVE_INFINITY;
  for (const b of s.buildings) {
    if (b.destroyed || !DEFENSE_KINDS.has(b.kind)) continue;
    const d = (cxOf(b) - a.x) * (cxOf(b) - a.x) + (cyOf(b) - a.y) * (cyOf(b) - a.y);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  if (!best) return [a.x, a.y];
  const vx = a.x - cxOf(best);
  const vy = a.y - cyOf(best);
  const vd = isqrt(vx * vx + vy * vy);
  if (vd === 0) return [a.x, a.y];
  return [a.x + Math.round((vx * hold) / vd), a.y + Math.round((vy * hold) / vd)];
}

/** 规则版本 ≥ 12：回血顺序——血量比低的先，同比按 id */
function healOrder(s: BattleState): BUnit[] {
  return s.units
    .filter((a) => a.mode !== 'dead' && a.kind !== 'medic' && a.hp < a.maxHp)
    .sort((p, q) => p.hp * q.maxHp - q.hp * p.maxHp || p.id - q.id);
}

/** 船医：跟着受伤最重的友军走，每个周期给附近的兵回血 */
function stepMedic(s: BattleState, ev: BattleEvent[], u: BUnit, lvl: { range: number; speed: number; reload: number; dmg: number }): void {
  const range = Math.round(lvl.range * UNIT);
  let pick: BUnit | undefined;
  let pickScore = Number.POSITIVE_INFINITY;
  if (s.rules >= RULES_SINCE.raidAi) pick = medicPick(s, u);
  else
    for (const a of s.units) {
      if (a.mode === 'dead' || a.kind === 'medic') continue;
      const score = Math.floor((a.hp * 1000) / a.maxHp);
      if (score < pickScore) {
        pickScore = score;
        pick = a;
      }
    }
  if (!pick) {
    u.mode = 'move';
    return;
  }
  const dx = pick.x - u.x;
  const dy = pick.y - u.y;
  const dist = isqrt(dx * dx + dy * dy);
  const hold = Math.floor(range / 2);
  if (dx !== 0) u.face = dx > 0 ? 1 : -1;
  if (dist > hold) {
    u.mode = 'move';
    const spd = unitSpeed(s, u, lvl.speed);
    if (s.rules >= RULES_SINCE.raidAi) {
      // 站到伤员背后（离他最近的防御的反方向），不抢到伤员前面去
      const [bx, by] = behindPoint(s, pick, hold);
      const ex = bx - u.x;
      const ey = by - u.y;
      const ed = isqrt(ex * ex + ey * ey);
      if (ed > 0) {
        const st = Math.min(spd, ed);
        u.x += Math.round((ex * st) / ed);
        u.y += Math.round((ey * st) / ed);
      }
    } else {
      const step = Math.min(spd, dist - hold);
      u.x += Math.round((dx * step) / dist);
      u.y += Math.round((dy * step) / dist);
    }
  } else u.mode = 'attack';
  if (s.tick < u.cd) return;
  u.cd = s.tick + lvl.reload;
  let n = 0;
  const pool = s.rules >= RULES_SINCE.raidAi ? healOrder(s) : s.units;
  for (const a of pool) {
    if (n >= 4) break;
    if (a.mode === 'dead' || a.kind === 'medic' || a.hp >= a.maxHp) continue;
    const ax = a.x - u.x;
    const ay = a.y - u.y;
    if (ax * ax + ay * ay > range * range) continue;
    const amount = Math.min(lvl.dmg, a.maxHp - a.hp);
    a.hp += amount;
    n++;
    ev.push({ type: 'heal', id: a.id, amount });
  }
}

/** 规则版本 < 6 的塔（旧回放专用） */
function stepDefensesLegacy(s: BattleState, ev: BattleEvent[]): void {
  const I = inner(s);
  for (const b of s.buildings) {
    if (b.destroyed || !DEFENSE_KINDS.has(b.kind)) continue;
    const lv = BUILDINGS[b.kind].levels[b.level - 1];
    if (!lv) continue;
    const range = Math.round((lv.range ?? 0) * UNIT);
    const minR = Math.round((lv.minRange ?? 0) * UNIT);
    const cx = cxOf(b);
    const cy = cyOf(b);
    let best: BUnit | undefined;
    let bestD = range * range + 1;
    for (const u of s.units) {
      if (u.mode === 'dead') continue;
      const dx = u.x - cx;
      const dy = u.y - cy;
      const d = dx * dx + dy * dy;
      if (d < bestD && d >= minR * minR) {
        bestD = d;
        best = u;
      }
    }
    b.aim = best ? best.id : -1;
    if (!best || s.tick < b.cd) continue;
    b.cd = s.tick + (lv.reload ?? 20);
    const dmg = lv.dmg ?? 0;
    if (b.kind === 'kraken') {
      I.pend.push({ t: s.tick + 8, kind: 'splashU', id: -1, dmg, x: best.x, y: best.y, r: Math.round((lv.splash ?? 1.8) * UNIT) });
    } else if (b.kind === 'harpoon') {
      const fl = flightTicks(cx, cy, best.x, best.y, 40);
      const pr = addProjectile(s, 'bullet', cx, cy, best.x, best.y, fl);
      I.pend.push({ t: s.tick + fl, kind: 'unit', id: best.id, dmg, x: best.x, y: best.y, r: 0 });
      ev.push({ type: 'shoot', from: 'building', id: b.id, projectile: pr.id });
    } else if (b.kind === 'rocket') {
      // 一次打三个不同的兵
      const picked: BUnit[] = [best];
      for (let k = 1; k < 3; k++) {
        let nx: BUnit | undefined;
        let nd = range * range + 1;
        for (const u of s.units) {
          if (u.mode === 'dead' || picked.includes(u)) continue;
          const dx = u.x - cx;
          const dy = u.y - cy;
          const d = dx * dx + dy * dy;
          if (d < nd && d >= minR * minR) {
            nd = d;
            nx = u;
          }
        }
        if (!nx) break;
        picked.push(nx);
      }
      for (const t of picked) {
        const fl = flightTicks(cx, cy, t.x, t.y, 30);
        const pr = addProjectile(s, 'shell', cx, cy, t.x, t.y, fl);
        I.pend.push({ t: s.tick + fl, kind: 'splashU', id: -1, dmg, x: t.x, y: t.y, r: Math.round((lv.splash ?? 0.8) * UNIT) });
        ev.push({ type: 'shoot', from: 'building', id: b.id, projectile: pr.id });
      }
    } else if (b.kind === 'cannon') {
      const fl = flightTicks(cx, cy, best.x, best.y, PROJ_SPEED.ball);
      const pr = addProjectile(s, 'ball', cx, cy, best.x, best.y, fl);
      I.pend.push({ t: s.tick + fl, kind: 'unit', id: best.id, dmg, x: best.x, y: best.y, r: 0 });
      ev.push({ type: 'shoot', from: 'building', id: b.id, projectile: pr.id });
    } else if (b.kind === 'gunTower') {
      const fl = flightTicks(cx, cy, best.x, best.y, PROJ_SPEED.bullet);
      const pr = addProjectile(s, 'bullet', cx, cy, best.x, best.y, fl);
      I.pend.push({ t: s.tick + fl, kind: 'unit', id: best.id, dmg, x: best.x, y: best.y, r: 0 });
      ev.push({ type: 'shoot', from: 'building', id: b.id, projectile: pr.id });
    } else if (b.kind === 'mortar') {
      const fl = flightTicks(cx, cy, best.x, best.y, PROJ_SPEED.shell);
      const pr = addProjectile(s, 'shell', cx, cy, best.x, best.y, fl);
      I.pend.push({ t: s.tick + fl, kind: 'splashU', id: -1, dmg, x: best.x, y: best.y, r: Math.round((lv.splash ?? 1) * UNIT) });
      ev.push({ type: 'shoot', from: 'building', id: b.id, projectile: pr.id });
    } else {
      const fl = flightTicks(cx, cy, best.x, best.y, PROJ_SPEED.flame);
      const pr = addProjectile(s, 'flame', cx, cy, best.x, best.y, fl);
      I.pend.push({ t: s.tick + fl, kind: 'splashU', id: -1, dmg, x: best.x, y: best.y, r: Math.round((lv.splash ?? 1) * UNIT) });
      ev.push({ type: 'shoot', from: 'building', id: b.id, projectile: pr.id });
    }
  }
}

/** 规则版本 < 6 的地雷和焦油（旧回放专用） */
function stepMinesLegacy(s: BattleState, ev: BattleEvent[]): void {
  for (const b of s.buildings) {
    if ((b.kind !== 'mine' && b.kind !== 'tar') || b.destroyed) continue;
    const lv = BUILDINGS[b.kind].levels[b.level - 1];
    if (!lv) continue;
    const cx = cxOf(b);
    const cy = cyOf(b);
    const trig = Math.round((lv.range ?? 1) * UNIT);
    let hit = false;
    for (const u of s.units) {
      if (u.mode === 'dead') continue;
      const dx = u.x - cx;
      const dy = u.y - cy;
      if (dx * dx + dy * dy <= trig * trig) {
        hit = true;
        break;
      }
    }
    if (!hit) continue;
    const r = Math.round((lv.splash ?? 1) * UNIT);
    b.revealed = true;
    ev.push({ type: 'explode', x: cx, y: cy, r });
    for (const u of s.units) {
      if (u.mode === 'dead') continue;
      const dx = u.x - cx;
      const dy = u.y - cy;
      if (dx * dx + dy * dy > r * r) continue;
      if (b.kind === 'tar') inner(s).slow[u.id] = s.tick + (lv.reload ?? 80);
      else damageUnit(s, ev, u, lv.dmg ?? 0);
    }
    destroyBuilding(s, ev, b);
  }
}

function stepMeds(s: BattleState, ev: BattleEvent[]): void {
  const I = inner(s);
  if (s.tick % 20 !== 0) return;
  I.meds = I.meds.filter((m) => m.until > s.tick);
  for (const m of I.meds) {
    for (const u of s.units) {
      if (u.mode === 'dead' || u.hp >= u.maxHp) continue;
      const dx = u.x - m.x;
      const dy = u.y - m.y;
      if (dx * dx + dy * dy > m.r * m.r) continue;
      const amount = Math.min(m.heal, u.maxHp - u.hp);
      u.hp += amount;
      ev.push({ type: 'heal', id: u.id, amount });
    }
  }
}

/** 雾里的建筑：罩着它的雾塔都没了，或有兵走近（3 格内），就现形 */
function stepFog(s: BattleState): void {
  for (const b of s.buildings) {
    if (b.revealed || b.destroyed || b.kind === 'mine' || b.kind === 'tar') continue;
    let covered = false;
    for (const t of s.buildings) {
      if (t.kind === 'fogTower' && !t.destroyed && fogCovers(t, b)) {
        covered = true;
        break;
      }
    }
    if (!covered) {
      b.revealed = true;
      continue;
    }
    for (const u of s.units) {
      if (u.mode !== 'dead' && d2Rect(u.x, u.y, b) <= 300 * 300) {
        b.revealed = true;
        break;
      }
    }
  }
}

// ------------------------------------------------------------ 规则版本 6：分叉、驻岛英雄、地上的火（DESIGN 10.6）
// 下面的函数只在 s.rules >= RULES_SINCE.raidHero 时调用；旧版本走上面原来的 stepDefensesLegacy / stepMinesLegacy，回放逐位不变。

function unitSpeed(s: BattleState, u: BUnit, speed: number): number {
  const I = inner(s);
  let spd = Math.round((speed * UNIT) / 20);
  if (s.tick < (I.slow[u.id] ?? 0)) spd = s.rules >= RULES_SINCE.raidHero ? Math.floor((spd * (100 - (I.slowPct[u.id] ?? 50))) / 100) : Math.floor(spd / 2);
  return spd;
}

/** 等级表 + 分叉 → 数值（规则版本 6）。和守岛 td.ts 的 statsOf 同一套算法，加减按 RAID_BRANCH_PCT 打折；登陆战没有飞的、没有铁甲和雾船，防空、穿甲、灯塔在这里不起作用 */
function buildingStats(s: BattleState, b: BBuilding): BStats {
  const I = inner(s);
  const hit = I.stats.get(b.id);
  if (hit) return hit;
  const lv = BUILDINGS[b.kind].levels[b.level - 1];
  const kind: BuildingKind = b.kind;
  const splashKind = kind === 'mortar' || kind === 'flame' || kind === 'rocket' || kind === 'kraken' || kind === 'mine' || kind === 'tar' || kind === 'shock';
  let dmgPct = 100;
  let reloadPct = 100;
  let rangePct = 100;
  let splash = splashKind ? Math.round((lv?.splash ?? (kind === 'kraken' ? 1.8 : kind === 'rocket' ? 0.8 : 1)) * UNIT) : 0;
  let shots = kind === 'rocket' ? 3 : 1;
  let line = false;
  const fx: HitFx = { slowPct: 0, slowTicks: 0, burnDps: 0, burnTicks: 0, burnR: 0, pull: 0 };
  let stun = lv?.stun ?? 0;
  // 分叉的加减按 RAID_BRANCH_PCT 打折（向 0 取整）；持续时间不折
  const sc = (v: number | undefined): number => ((v ?? 0) * RAID_BRANCH_PCT / 100) | 0;
  for (const id of b.branch ?? []) {
    const m = BRANCH_BY_ID.get(id)?.mod;
    if (!m) continue;
    dmgPct += sc(m.dmgPct);
    reloadPct += sc(m.reloadPct);
    rangePct += sc(m.rangePct);
    // 溅射只加给本来就溅射的塔：加农炮、火枪塔、鱼叉在登陆战里仍是单体（链弹、葡萄弹把单体炮变成打一片，对抱团登陆的兵太狠）
    if (splashKind) splash += sc(m.splash);
    shots += m.shots ?? 0;
    if (m.line) line = true;
    fx.slowPct = Math.min(90, fx.slowPct + sc(m.slowPct));
    fx.slowTicks += m.slowTicks ?? 0;
    fx.burnDps += sc(m.burnDps);
    fx.burnTicks = Math.max(fx.burnTicks, m.burnTicks ?? 0);
    fx.pull = Math.max(fx.pull, sc(m.pull));
    // 震晕时长是持续时间，不折
    if (m.stunTicks !== undefined && stun > 0) stun = m.stunTicks;
  }
  if (fx.slowPct > 0 && fx.slowTicks === 0) fx.slowTicks = 40;
  // 焦油本身就是减速一半，分叉在这上面加
  if (kind === 'tar') {
    fx.slowPct = Math.min(90, 50 + fx.slowPct);
    fx.slowTicks += lv?.reload ?? 80;
  }
  fx.burnR = Math.max(100, splash);
  const st: BStats = {
    dmg: Math.floor(((lv?.dmg ?? 0) * dmgPct) / 100),
    range: Math.floor((Math.round((lv?.range ?? 0) * UNIT) * rangePct) / 100),
    minRange: Math.round((lv?.minRange ?? 0) * UNIT),
    reload: Math.max(4, Math.floor(((lv?.reload ?? 20) * reloadPct) / 100)),
    splash,
    shots,
    line,
    fx: fx.slowPct > 0 || fx.burnDps > 0 || fx.pull > 0 ? fx : undefined,
    stun,
  };
  I.stats.set(b.id, st);
  return st;
}

/** 命中效果落到一个兵身上：减速、拖拽（往离开它目标的方向推回去，推进建筑里就不推） */
function applyFx(s: BattleState, u: BUnit, fx: HitFx): void {
  if (u.mode === 'dead') return;
  const I = inner(s);
  if (fx.slowPct > 0) {
    I.slow[u.id] = Math.max(I.slow[u.id] ?? 0, s.tick + fx.slowTicks);
    I.slowPct[u.id] = Math.max(s.tick < (I.slow[u.id] ?? 0) ? (I.slowPct[u.id] ?? 0) : 0, fx.slowPct);
  }
  if (fx.pull > 0) {
    const tgt = u.target >= 0 ? bldById(s, u.target) : undefined;
    if (!tgt) return;
    const dx = u.x - cxOf(tgt);
    const dy = u.y - cyOf(tgt);
    const d = isqrt(dx * dx + dy * dy);
    if (d === 0) return;
    const lv = TROOPS[u.kind].levels[u.level - 1];
    const dist = Math.min(300, Math.round(((lv?.speed ?? 1) * UNIT * fx.pull) / 20));
    const nx = u.x + Math.round((dx * dist) / d);
    const ny = u.y + Math.round((dy * dist) / d);
    ensureGrid(s);
    const cx = Math.floor(nx / UNIT);
    const cy = Math.floor(ny / UNIT);
    if (cx < -BEACH || cy < -BEACH || cx >= ISLAND + BEACH || cy >= ISLAND + BEACH || (I.occ[cellIdx(cx, cy)] ?? 0) > 0) return;
    u.x = nx;
    u.y = ny;
  }
}

function addFire(s: BattleState, x: number, y: number, fx: HitFx): void {
  inner(s).fires.push({ x, y, r: fx.burnR, until: s.tick + fx.burnTicks, dps: fx.burnDps });
}

/** 地上的火：每半秒烧一次，伤害按每秒的一半；几团火叠在一起只算最旺的那团（登陆的兵抱团走，叠烧太狠） */
function stepFires(s: BattleState, ev: BattleEvent[]): void {
  const I = inner(s);
  if (I.fires.length === 0) return;
  if (s.tick % 10 === 0) {
    for (const u of s.units) {
      if (u.mode === 'dead') continue;
      let dps = 0;
      for (const f of I.fires) if (f.dps > dps && (u.x - f.x) * (u.x - f.x) + (u.y - f.y) * (u.y - f.y) <= f.r * f.r) dps = f.dps;
      if (dps > 0) damageUnit(s, ev, u, Math.floor(dps / 2));
    }
  }
  let k = 0;
  for (const f of I.fires) if (f.until > s.tick) I.fires[k++] = f;
  I.fires.length = k;
}

/** 离 (x, y) 最近、在 r 以内（且不近于 minR）的活兵；skip 里的跳过 */
function nearestUnit(s: BattleState, x: number, y: number, r: number, minR: number, skip?: readonly BUnit[]): BUnit | undefined {
  let best: BUnit | undefined;
  let bestD = r * r + 1;
  for (const u of s.units) {
    if (u.mode === 'dead' || skip?.includes(u)) continue;
    const d = (u.x - x) * (u.x - x) + (u.y - y) * (u.y - y);
    if (d < bestD && d >= minR * minR) {
      bestD = d;
      best = u;
    }
  }
  return best;
}

/** 规则版本 6–8 的塔：带分叉 */
function stepDefensesBranches(s: BattleState, ev: BattleEvent[]): void {
  const I = inner(s);
  const h = s.hero;
  for (const b of s.buildings) {
    if (b.destroyed || !DEFENSE_KINDS.has(b.kind)) continue;
    const st = buildingStats(s, b);
    const cx = cxOf(b);
    const cy = cyOf(b);
    const best = nearestUnit(s, cx, cy, st.range, st.minRange);
    b.aim = best ? best.id : -1;
    if (!best || s.tick < b.cd) continue;
    let reload = st.reload;
    // 号令：罩住的塔攻速 +30%
    if (h && s.tick < h.rallyUntil && h.rallyIds.includes(b.id)) reload = Math.floor((reload * 100) / (100 + TD_RALLY_PCT));
    b.cd = s.tick + reload;
    const dmg = st.dmg;
    const fx = st.fx;
    if (b.kind === 'kraken') {
      I.pend.push({ t: s.tick + 8, kind: 'splashU', id: -1, dmg, x: best.x, y: best.y, r: st.splash });
      continue;
    }
    // 一次打几个不同的兵（火箭 3 个，双发、齐射再加）
    const picked: BUnit[] = [best];
    while (picked.length < st.shots) {
      const nx = nearestUnit(s, cx, cy, st.range, st.minRange, picked);
      if (!nx) break;
      picked.push(nx);
    }
    const kind: BProjectile['kind'] = b.kind === 'cannon' ? 'ball' : b.kind === 'mortar' || b.kind === 'rocket' ? 'shell' : b.kind === 'flame' ? 'flame' : 'bullet';
    const speed = b.kind === 'harpoon' ? 40 : b.kind === 'rocket' ? 30 : PROJ_SPEED[kind as keyof typeof PROJ_SPEED];
    for (const t of picked) {
      const fl = flightTicks(cx, cy, t.x, t.y, speed);
      const pr = addProjectile(s, kind, cx, cy, t.x, t.y, fl);
      ev.push({ type: 'shoot', from: 'building', id: b.id, projectile: pr.id });
      if (st.line) {
        // 贯穿：从塔到射程尽头这条线上 0.5 格内的兵挨一下，登陆战里最多穿 RAID_LINE_MAX 个（按兵的顺序）
        const dx = t.x - cx;
        const dy = t.y - cy;
        const len = isqrt(dx * dx + dy * dy);
        if (len === 0) continue;
        let hits = 0;
        for (const u of s.units) {
          if (u.mode === 'dead' || hits >= RAID_LINE_MAX) continue;
          const ux = u.x - cx;
          const uy = u.y - cy;
          const along = Math.floor((ux * dx + uy * dy) / len);
          if (along < 0 || along > st.range) continue;
          const cross = Math.floor(Math.abs(ux * dy - uy * dx) / len);
          if (cross > 50) continue;
          hits++;
          I.pend.push({ t: s.tick + fl, kind: 'unit', id: u.id, dmg, x: u.x, y: u.y, r: 0, ...(fx ? { fx } : {}) });
        }
      } else if (st.splash > 0) I.pend.push({ t: s.tick + fl, kind: 'splashU', id: -1, dmg, x: t.x, y: t.y, r: st.splash, ...(fx ? { fx } : {}) });
      else I.pend.push({ t: s.tick + fl, kind: 'unit', id: t.id, dmg, x: t.x, y: t.y, r: 0, ...(fx ? { fx } : {}) });
    }
  }
}

/** 狙击塔挑目标的优先级类：船长 > 船医 > 掷弹兵 / 火炮兵 > 其余（DESIGN 14）；必死的排到最后 */
function snipeClass(u: BUnit): number {
  return u.kind === 'captain' ? 0 : u.kind === 'medic' ? 1 : u.kind === 'grenadier' || u.kind === 'cannoneer' ? 2 : 3;
}

/**
 * 狙击塔这一拍该打谁：返回要开火的兵；没到开火时机（装填中、锁定后还在预警）返回 undefined。
 * 装填完才锁定：挑目标走 rankTargets（rank = [优先级类（在途伤害够打死的 +4）, -血量]，同类血多的先），推 aim 事件，SNIPE_WARN 拍后开火；
 * 预警期间目标死了、走出射程（cand 里没有）就作废，下一拍重挑重新预警。装填中只跟着最优目标转炮管，不推事件。
 */
function snipeAim(s: BattleState, ev: BattleEvent[], b: BBuilding, cand: readonly BUnit[], ready: boolean, due: ReadonlyMap<number, number>): BUnit | undefined {
  const I = inner(s);
  const rank = (u: BUnit): [number, number] => [snipeClass(u) + (ready && (due.get(u.id) ?? 0) >= u.hp ? 4 : 0), -u.hp];
  let sn = I.snipe.get(b.id);
  let tgt = sn ? cand.find((u) => u.id === sn!.target) : undefined;
  if (sn && !tgt) {
    I.snipe.delete(b.id);
    sn = undefined;
  }
  if (!ready || !sn) {
    const best = rankTargets(cand, b.lock ?? -1, rank)[0] as BUnit;
    b.lock = best.id;
    b.aim = best.id;
    if (!ready) return undefined;
    sn = { target: best.id, fireAt: s.tick + SNIPE_WARN };
    I.snipe.set(b.id, sn);
    ev.push({ type: 'aim', id: b.id, target: 'unit', tid: best.id, fireAt: sn.fireAt });
    return undefined;
  }
  tgt = tgt as BUnit;
  b.aim = tgt.id;
  if (s.tick < sn.fireAt) return undefined;
  I.snipe.delete(b.id);
  return tgt;
}

/**
 * 规则版本 9：进攻里的塔接入共用战斗规则（combat.ts，和守岛同一套）。和 stepDefensesBranches 的差别：
 * 寻敌按 rankTargets 排（rank = [必死 ? 4 : 0, 到塔中心的距离平方]，锁定上一个目标不来回换，多发按同一顺序往下挑、人不够从头轮）；
 * 炸的（加农的弹丸、臼炮和火箭的炮弹、海怪）瞄提前量，落点 = 兵 fl 拍后的位置，弹道终点也画到落点；
 * 直射（子弹、鱼叉、火焰）照旧追着兵走；在途直射伤害够打死的兵算必死、排到后面。
 */
function stepDefensesCombat(s: BattleState, ev: BattleEvent[]): void {
  const I = inner(s);
  const h = s.hero;
  // 已经在路上的直射伤害：够打死的兵算"必死"，别的塔不再往它身上浪费炮弹（驻岛英雄的子弹也算在内）
  const due = new Map<number, number>();
  const owe = (id: number, dmg: number): void => {
    due.set(id, (due.get(id) ?? 0) + dmg);
  };
  for (const p of I.pend) if (p.kind === 'unit') owe(p.id, p.dmg);
  for (const b of s.buildings) {
    if (b.destroyed || !DEFENSE_KINDS.has(b.kind)) continue;
    const st = buildingStats(s, b);
    const cx = cxOf(b);
    const cy = cyOf(b);
    const cand: BUnit[] = [];
    for (const u of s.units) {
      if (u.mode === 'dead') continue;
      if (inRing((u.x - cx) * (u.x - cx) + (u.y - cy) * (u.y - cy), st.range, st.minRange)) cand.push(u);
    }
    if (cand.length === 0) {
      b.aim = -1;
      b.lock = -1;
      I.snipe.delete(b.id);
      continue;
    }
    // 必死只在要开火的这一拍算：装填中照旧盯着锁定的目标，炮管不跟着在途伤害来回甩
    const ready = s.tick >= b.cd;
    let ranked: BUnit[];
    if (b.kind === 'sniper') {
      // 狙击塔：先锁定（推 aim 预警），SNIPE_WARN 拍后才开火；锁定的兵走出射程就作废重挑（DESIGN 14）
      const fire = snipeAim(s, ev, b, cand, ready, due);
      if (!fire) continue;
      ranked = [fire];
    } else {
      ranked = rankTargets(cand, b.lock ?? -1, (u) => [ready && (due.get(u.id) ?? 0) >= u.hp ? 4 : 0, (u.x - cx) * (u.x - cx) + (u.y - cy) * (u.y - cy)]);
    }
    const best = ranked[0] as BUnit;
    b.lock = best.id;
    b.aim = best.id;
    if (s.tick < b.cd) continue;
    let reload = st.reload;
    if (h && s.tick < h.rallyUntil && h.rallyIds.includes(b.id)) reload = Math.floor((reload * 100) / (100 + TD_RALLY_PCT));
    // 狙击塔的锁定预警算在装填里：一发的总间隔仍是 reload
    b.cd = s.tick + (b.kind === 'sniper' ? Math.max(1, reload - SNIPE_WARN) : reload);
    const dmg = st.dmg;
    const fx = st.fx;
    if (b.kind === 'kraken') {
      const at = leadPoint(best, 8);
      I.pend.push({ t: s.tick + 8, kind: 'splashU', id: -1, dmg, x: at.x, y: at.y, r: st.splash });
      continue;
    }
    // 多发（火箭）：按顺序一人一发，人不够就从头再轮（只剩一个兵时几发都打它，不白丢）
    const picked: BUnit[] = [];
    for (let k = 0; k < Math.max(1, st.shots); k++) picked.push(ranked[k % ranked.length] as BUnit);
    // 震荡炮（规则版本 10）：炮弹按加农的速度飞、瞄提前量，落点小溅射 + 震晕
    const src = s.rules >= RULES_SINCE.sniperShield ? { sx: cx, sy: cy } : {};
    const kind: BProjectile['kind'] = b.kind === 'cannon' ? 'ball' : b.kind === 'shock' ? 'shock' : b.kind === 'mortar' || b.kind === 'rocket' ? 'shell' : b.kind === 'flame' ? 'flame' : 'bullet';
    const speed = b.kind === 'sniper' ? 60 : b.kind === 'harpoon' ? 40 : b.kind === 'rocket' ? 30 : b.kind === 'shock' ? PROJ_SPEED.ball : PROJ_SPEED[kind as keyof typeof PROJ_SPEED];
    const lead = kind === 'ball' || kind === 'shell' || kind === 'shock';
    for (const t of picked) {
      const fl = flightTicks(cx, cy, t.x, t.y, speed);
      const at = lead ? leadPoint(t, fl) : { x: t.x, y: t.y };
      const pr = addProjectile(s, kind, cx, cy, at.x, at.y, fl);
      ev.push({ type: 'shoot', from: 'building', id: b.id, projectile: pr.id });
      if (st.line) {
        const dx = t.x - cx;
        const dy = t.y - cy;
        const len = isqrt(dx * dx + dy * dy);
        if (len === 0) continue;
        let hits = 0;
        for (const u of s.units) {
          if (u.mode === 'dead' || hits >= RAID_LINE_MAX) continue;
          const ux = u.x - cx;
          const uy = u.y - cy;
          const along = Math.floor((ux * dx + uy * dy) / len);
          if (along < 0 || along > st.range) continue;
          const cross = Math.floor(Math.abs(ux * dy - uy * dx) / len);
          if (cross > 50) continue;
          hits++;
          I.pend.push({ t: s.tick + fl, kind: 'unit', id: u.id, dmg, x: u.x, y: u.y, r: 0, ...src, ...(fx ? { fx } : {}) });
        }
      } else if (st.splash > 0) I.pend.push({ t: s.tick + fl, kind: 'splashU', id: -1, dmg, x: at.x, y: at.y, r: st.splash, ...(fx ? { fx } : {}), ...(st.stun > 0 ? { stun: st.stun } : {}) });
      // 单体（加农在登陆战里是单体）：伤害跟着兵走，弹丸画到提前量落点，兵照常走就正好撞上
      else {
        I.pend.push({ t: s.tick + fl, kind: 'unit', id: t.id, dmg, x: at.x, y: at.y, r: 0, ...src, ...(fx ? { fx } : {}) });
        owe(t.id, dmg);
      }
    }
  }
}

/** 规则版本 ≥ 6 的地雷和焦油 */
function stepMines(s: BattleState, ev: BattleEvent[]): void {
  for (const b of s.buildings) {
    if ((b.kind !== 'mine' && b.kind !== 'tar') || b.destroyed) continue;
    const lv = BUILDINGS[b.kind].levels[b.level - 1];
    if (!lv) continue;
    const cx = cxOf(b);
    const cy = cyOf(b);
    const trig = Math.round((lv.range ?? 1) * UNIT);
    if (!nearestUnit(s, cx, cy, trig, 0)) continue;
    const st = buildingStats(s, b);
    const r = st.splash;
    b.revealed = true;
    ev.push({ type: 'explode', x: cx, y: cy, r });
    for (const u of s.units) {
      if (u.mode === 'dead') continue;
      const dx = u.x - cx;
      const dy = u.y - cy;
      if (dx * dx + dy * dy > r * r) continue;
      if (b.kind === 'mine') damageUnit(s, ev, u, st.dmg);
      if (st.fx) applyFx(s, u, st.fx);
    }
    if (st.fx && st.fx.burnDps > 0) addFire(s, cx, cy, st.fx);
    destroyBuilding(s, ev, b);
  }
}

/** 驻岛英雄出场：岛上第一个宝藏箱旁边第一个空格（四邻先、斜角后）；没有宝藏箱、没写等级就没有英雄 */
function makeHero(s: BattleState, level: number | undefined): BHero | undefined {
  if (level === undefined || !Number.isInteger(level) || level < 1) return undefined;
  const t = s.buildings.find((b) => b.kind === 'treasure');
  if (!t) return undefined;
  ensureGrid(s);
  const occ = inner(s).occ;
  for (const [ox, oy] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
    const cx = t.x + ox;
    const cy = t.y + oy;
    if (cx < -BEACH || cy < -BEACH || cx >= ISLAND + BEACH || cy >= ISLAND + BEACH || (occ[cellIdx(cx, cy)] ?? 0) > 0) continue;
    const lv = Math.min(RAID_HERO.length, level);
    const hp = (RAID_HERO[lv - 1] as (typeof RAID_HERO)[number]).hp;
    const x = cx * UNIT + 50;
    const y = cy * UNIT + 50;
    return { level: lv, x, y, hp, maxHp: hp, postX: x, postY: y, mode: 'idle', face: 1, target: -1, cd: 0, kegReady: 0, rallyReady: 0, rallyUntil: 0, rallyIds: [], returning: false };
  }
  return undefined;
}

function damageHero(s: BattleState, ev: BattleEvent[], dmg: number): void {
  const h = s.hero;
  if (!h || h.mode === 'dead') return;
  h.hp -= dmg;
  ev.push({ type: 'hit', x: h.x, y: h.y, dmg, target: 'hero', id: 0 });
  if (h.hp <= 0) {
    h.hp = 0;
    h.mode = 'dead';
    h.target = -1;
    h.rallyUntil = 0;
    ev.push({ type: 'hero', what: 'down', x: h.x, y: h.y });
  }
}

/** 进攻兵碰上驻岛英雄：英雄在 max(射程, 3 格) 内就转身打它（远程的站着打，近战的贴上去）；返回 true 表示这一拍在对付英雄 */
function fightHero(s: BattleState, ev: BattleEvent[], u: BUnit, lvl: { range: number; speed: number; reload: number; dmg: number }): boolean {
  const h = s.hero;
  if (!h || h.mode === 'dead') return false;
  if (s.rules >= RULES_SINCE.combat) {
    const I = inner(s);
    // 信号弹生效期间所有兵先去打标记的建筑（技能说明这么写），不被英雄引走
    if (s.tick < I.flareUntil) return false;
    if (s.tick < (I.ignoreHero[u.id] ?? 0)) return false;
  }
  const range = Math.round(lvl.range * UNIT) + 30;
  const dx = h.x - u.x;
  const dy = h.y - u.y;
  const d2 = dx * dx + dy * dy;
  const aggro = Math.max(range, RAID_HERO_AGGRO);
  if (d2 > aggro * aggro) return false;
  if (dx !== 0) u.face = dx > 0 ? 1 : -1;
  if (u.kind === 'shield') setShield(u, dx, dy);
  const dist = isqrt(d2);
  if (dist > range) {
    u.mode = 'move';
    const step = Math.min(unitSpeed(s, u, lvl.speed), dist - range);
    const nx = u.x + Math.round((dx * step) / dist);
    const ny = u.y + Math.round((dy * step) / dist);
    ensureGrid(s);
    // 不往建筑里钻：前面是建筑就不追（照常去拆自己的目标）
    if ((inner(s).occ[cellIdx(Math.floor(nx / UNIT), Math.floor(ny / UNIT))] ?? 0) > 0) {
      // 规则版本 ≥ 9：追不过去就 1 秒内不再理英雄，老老实实拆自己的目标
      if (s.rules >= RULES_SINCE.combat) inner(s).ignoreHero[u.id] = s.tick + 20;
      return false;
    }
    u.x = nx;
    u.y = ny;
    return true;
  }
  u.mode = 'attack';
  if (s.tick < u.cd) return true;
  u.cd = s.tick + lvl.reload;
  if (u.kind === 'grenadier') throwGrenade(s, ev, u, h.x, h.y, lvl.dmg, TROOPS.grenadier.levels[u.level - 1]?.splash ?? 1);
  else if (range > 180) {
    const fl = flightTicks(u.x, u.y, h.x, h.y, PROJ_SPEED.bullet);
    const pr = addProjectile(s, 'bullet', u.x, u.y, h.x, h.y, fl);
    inner(s).pend.push({ t: s.tick + fl, kind: 'hero', id: 0, dmg: lvl.dmg, x: h.x, y: h.y, r: 0 });
    ev.push({ type: 'shoot', from: 'unit', id: u.id, projectile: pr.id });
  } else damageHero(s, ev, lvl.dmg);
  return true;
}

/** 英雄朝 (tx, ty) 走一步；下一格是建筑就试只走横或只走竖，都不行就站住 */
function heroStep(s: BattleState, h: BHero, tx: number, ty: number, speed: number): void {
  const dx = tx - h.x;
  const dy = ty - h.y;
  const d = isqrt(dx * dx + dy * dy);
  if (d === 0) return;
  const st = Math.min(speed, d);
  if (dx !== 0) h.face = dx > 0 ? 1 : -1;
  ensureGrid(s);
  const occ = inner(s).occ;
  const free = (x: number, y: number): boolean => {
    const cx = Math.floor(x / UNIT);
    const cy = Math.floor(y / UNIT);
    return cx >= -BEACH && cy >= -BEACH && cx < ISLAND + BEACH && cy < ISLAND + BEACH && (occ[cellIdx(cx, cy)] ?? 0) === 0;
  };
  const mx = Math.round((dx * st) / d);
  const my = Math.round((dy * st) / d);
  if (free(h.x + mx, h.y + my)) {
    h.x += mx;
    h.y += my;
  } else if (mx !== 0 && free(h.x + (mx > 0 ? st : -st), h.y)) h.x += mx > 0 ? st : -st;
  else if (my !== 0 && free(h.x, h.y + (my > 0 ? st : -st))) h.y += my > 0 ? st : -st;
}

/** 驻岛英雄一拍：回岗 → 接战（4 格内最近的兵）→ 火药桶（3 个以上扎堆）→ 号令（附近有塔在开火） */
function stepHero(s: BattleState, ev: BattleEvent[]): void {
  const h = s.hero;
  if (!h || h.mode === 'dead') return;
  const I = inner(s);
  const hl = RAID_HERO[h.level - 1] as (typeof RAID_HERO)[number];
  const fromPost = (h.x - h.postX) * (h.x - h.postX) + (h.y - h.postY) * (h.y - h.postY);
  if (fromPost > RAID_HERO_LEASH * RAID_HERO_LEASH) h.returning = true;
  if (h.returning) {
    h.target = -1;
    if (fromPost <= 50 * 50) h.returning = false;
    else {
      h.mode = 'move';
      heroStep(s, h, h.postX, h.postY, hl.speed);
    }
  }
  if (!h.returning) {
    let tgt = h.target >= 0 ? s.units[h.target - 1] : undefined;
    if (!tgt || tgt.mode === 'dead' || (tgt.x - h.x) * (tgt.x - h.x) + (tgt.y - h.y) * (tgt.y - h.y) > RAID_HERO_GUARD * RAID_HERO_GUARD) tgt = nearestUnit(s, h.x, h.y, RAID_HERO_GUARD, 0);
    h.target = tgt ? tgt.id : -1;
    if (!tgt) {
      if (fromPost > 0) {
        h.mode = 'move';
        heroStep(s, h, h.postX, h.postY, hl.speed);
      } else h.mode = 'idle';
    } else {
      const dx = tgt.x - h.x;
      const dy = tgt.y - h.y;
      const dist = isqrt(dx * dx + dy * dy);
      if (dx !== 0) h.face = dx > 0 ? 1 : -1;
      if (dist > hl.range) {
        h.mode = 'move';
        heroStep(s, h, tgt.x, tgt.y, Math.min(hl.speed, dist - hl.range));
      } else {
        h.mode = 'attack';
        if (s.tick >= h.cd) {
          h.cd = s.tick + hl.reload;
          const fl = flightTicks(h.x, h.y, tgt.x, tgt.y, PROJ_SPEED.bullet);
          const pr = addProjectile(s, 'bullet', h.x, h.y, tgt.x, tgt.y, fl);
          I.pend.push({ t: s.tick + fl, kind: 'unit', id: tgt.id, dmg: hl.dmg, x: tgt.x, y: tgt.y, r: 0 });
          ev.push({ type: 'shoot', from: 'hero', id: 0, projectile: pr.id });
        }
      }
    }
  }
  // 火药桶：扔得到的兵里，身边 kegR 内兵最多的那个；够 3 个才扔
  if (s.tick >= h.kegReady) {
    let pick: BUnit | undefined;
    let pickN = 0;
    for (const u of s.units) {
      if (u.mode === 'dead' || (u.x - h.x) * (u.x - h.x) + (u.y - h.y) * (u.y - h.y) > TD_KEG_THROW * TD_KEG_THROW) continue;
      let n = 0;
      for (const v of s.units) if (v.mode !== 'dead' && (v.x - u.x) * (v.x - u.x) + (v.y - u.y) * (v.y - u.y) <= hl.kegR * hl.kegR) n++;
      if (n > pickN) {
        pickN = n;
        pick = u;
      }
    }
    if (pick && pickN >= RAID_HERO_CLUSTER) {
      h.kegReady = s.tick + hl.kegCd;
      addProjectile(s, 'keg', h.x, h.y, pick.x, pick.y, 10);
      I.pend.push({ t: s.tick + 10, kind: 'splashU', id: -1, dmg: hl.kegDmg, x: pick.x, y: pick.y, r: hl.kegR });
      ev.push({ type: 'hero', what: 'keg', x: pick.x, y: pick.y });
    }
  }
  // 号令：身边有塔正在瞄人（上一拍的瞄准）就放
  if (s.tick >= h.rallyReady) {
    const ids: number[] = [];
    let firing = false;
    for (const b of s.buildings) {
      if (b.destroyed || !DEFENSE_KINDS.has(b.kind)) continue;
      if ((cxOf(b) - h.x) * (cxOf(b) - h.x) + (cyOf(b) - h.y) * (cyOf(b) - h.y) > TD_RALLY_R * TD_RALLY_R) continue;
      ids.push(b.id);
      if (b.aim >= 0) firing = true;
    }
    if (firing) {
      h.rallyReady = s.tick + hl.rallyCd;
      h.rallyUntil = s.tick + hl.rallyTicks;
      h.rallyIds = ids;
      ev.push({ type: 'hero', what: 'rally', x: h.x, y: h.y });
    }
  }
}

/** 原地推进一拍；actions 是这一拍的操作 */
export function stepBattle(s: BattleState, actions: BattleAction[]): BattleEvent[] {
  const ev: BattleEvent[] = [];
  if (s.over) return ev;
  const I = inner(s);
  for (const a of actions) doAction(s, ev, a);
  resolvePend(s, ev);
  if (I.fun) I.nextUnit = stepFun(s, ev, I.fun, I.nextUnit);
  stepUnits(s, ev);
  if (s.rules >= RULES_SINCE.raidHero) {
    stepHero(s, ev);
    if (s.rules >= RULES_SINCE.combat) stepDefensesCombat(s, ev);
    else stepDefensesBranches(s, ev);
    stepMines(s, ev);
    stepFires(s, ev);
  } else {
    stepDefensesLegacy(s, ev);
    stepMinesLegacy(s, ev);
  }
  stepMeds(s, ev);
  stepFog(s);
  s.projectiles = s.projectiles.filter((p) => p.t1 > s.tick);
  s.tick++;

  const r = battleResult(s);
  const alive = s.units.some((u) => u.mode !== 'dead' && u.kind !== 'medic');
  const spent = s.landed.every(Boolean) && !alive && s.energy < I.minSkill && I.pend.length === 0 && !allyPending(I.fun);
  if (r.destroyedPct >= 100 || s.tick >= BATTLE_TICKS || spent) {
    s.over = true;
    ev.push({ type: 'end', stars: battleResult(s).stars });
  }
  return ev;
}

export function runBattle(setup: BattleSetup, actions: BattleAction[]): { state: BattleState; result: BattleResult; events: number } {
  const s = createBattle(setup);
  const sorted = actions.map((a, i) => ({ a, i })).sort((p, q) => p.a.t - q.a.t || p.i - q.i);
  let k = 0;
  let events = 0;
  while (!s.over) {
    const now: BattleAction[] = [];
    while (k < sorted.length && (sorted[k]?.a.t ?? 0) <= s.tick) {
      const e = sorted[k];
      if (e) now.push(e.a);
      k++;
    }
    events += stepBattle(s, now).length;
  }
  return { state: s, result: battleResult(s), events };
}

export { RULES_VERSION };
