/**
 * 守岛（塔防，DESIGN 10.1–10.3）：固定步长 20 拍/秒、整数坐标（1 格 = 100 单位）、确定性。
 * 同一个 setup 加同一串操作必得同一结果；不用随机、时间和平台数学函数，开方用整数牛顿法，随机用按用途分流的 sfc32。
 * 地图由 setup 给：战役是写死的关卡岛（木台、驻守台），海盗来袭是玩家自己的岛（常驻塔照常开火）。墙能砸能修，宝藏箱是敌人的目标。
 * 伤害一律按 td2types.ts 的克制表算（伤害类型 × 护甲），倍率 0 的打不到；局内塔按阶读 td2units.ts，常驻塔按基地等级表。
 * 局内的塔、金币、修墙打完就没，不回写 Profile。和登陆战（battle.ts）完全分开：攻防的结算不受这里任何东西影响。
 * 本文件管开局、玩家操作、每拍的编排和敌人、塔、陷阱；英雄在 tdhero.ts，给界面和机器人的查询在 tdquery.ts，几处都用的状态和底层在 tdstate.ts。
 */
import { BUILDINGS, DEFENSE_KINDS } from '../content/index.ts';
import { SHIELD } from '../content/troops.ts';
import { HERO_RESEARCH_MAX, TD_KEG, TD_MAX_TICKS, TD_PICK_R, TD_SAPPER_WALL_COST, TD_TREASURE, TD_WALL_COST } from '../content/tdunits.ts';
import { TD2_BATTERY, TD2_COST, TD2_ECON, TD2_ENEMIES, TD2_EVENT, TD2_FLEET, TD2_HERO, TD2_HERO_SKILL, TD2_MINE_REARM_TICKS, TD2_NAV_SKILL, TD2_TREASURE_ROLL_TICKS, TD2_UP_PCT } from '../content/td2units.ts';
import { isqrt } from './fmath.ts';
import { SNIPE_WARN, applyStun, flightTicks, inRing, keepLock, laneOffset, leadPoint, rankTargets, shieldFaces, stunned } from './combat.ts';
import { Rng, hash32 } from './rng.ts';
import { branchError, sanitizeBranch } from './tdbase.ts';
import { GRID, INF, cellIdx, cellOf, cellX, cellY, inGrid, inIsle, nextCell } from './grid.ts';
import { ISLAND, UNIT } from './types.ts';
import type { BuildingKind } from './types.ts';
import { TD2_STAR_LOST, TD_ENEMY_ARMOR, TD_TOWER_KINDS, isTdTowerKind } from './td2types.ts';
import { ESCORT_CELL, ESCORT_MEND, ESCORT_SHIP_R } from './escorttypes.ts';
import type { EscortState } from './escorttypes.ts';
import { escortBite, escortHullPct, escortRate, escortResult, escortShip } from './escort.ts';
import type { TdBarricade, TdTier, TdTowerKind } from './td2types.ts';
import type { TdAction, TdBlock, TdEnemy, TdEnemyDef, TdEnemyKind, TdEvent, TdHero, TdLevel, TdResult, TdSetup, TdSlot, TdTower, TdWall } from './tdtypes.ts';
import { inner, HIT_KEG, HIT_BURN, TD_TIER_LEVEL, mult, isAir, statsOf, towerStats, tdHeroStats, tcx, tcy, d2, ensureWaves, ensureGrid, treasureFlow, cellFlow, seen, targetable, addGold, blockGone, damageBlock, moveToward, enemyHp, gapBefore, slotTower, barricadeAt, cliffOn, onHigh, tdBuildCost, onRaisedBridge, occFor, nearestWalkable } from './tdstate.ts';
import type { Hit, Pend, Trap, Internal, TdState } from './tdstate.ts';
import { callFleet, driftCrates, fetchCrate, fireBattery, forgetFetch, initMech, stepCrates, stepFleet, toggleDrawbridge, toggleSluice } from './tdmech.ts';
import { tdTideOpen, tdBuildBlock, tdSellRefund, tdClearCost, tdCallBonus, tdRuleBlock, tdUltCost, tdLoseAt } from './tdquery.ts';
import { deepOf, ultError } from './tddeep.ts';
import { TD_PRIOS, TD_PRIO_ELITE, TD_ULTS, TD_ULT_BOSS, TD_ULT_BY_ID } from '../content/tdults.ts';
import type { TdPrio } from '../content/tdults.ts';
import { placeHero, stepHero, offSlot } from './tdhero.ts';
import { castHook, hookEnabled, stepHooked } from './tdhook.ts';
import { castFlag, castReward, flagOn, navEnabled } from './tdnav.ts';
import { HIT_CAMP_SHELL, HIT_SOLDIER, campAt, campEnabled, campPrint, campUltCost, campUltError, campUpCost, heldBy, hitSoldier, newCamp, rallyOk, refitCamp, stepCamps } from './tdcamp.ts';
import { TD2_CAMP, TD2_CAMP_BRANCH } from '../content/tdcamp.ts';
import type { TdCampUlt } from '../content/tdcamp.ts';
import { dareCount, heroCd, initHappen, killGold, payBounty, queueBounty, raining, toggleDare } from './tdevent.ts';

/** 敌人在格子里按 id 散开的步长（单位）：同一条路上的敌人错开成几列，不叠成一个点 */
const TD_LANE_SPREAD = 18;
/** 英雄等级上限：和基地的英雄研究一样（8 级后能研究到 12） */
const HERO_MAX = HERO_RESEARCH_MAX;

// ------------------------------------------------------------ 开局

/** 大潮无尽：开局和每开一波都把波次往后补到"已开的波 + 这么多"，机器人、界面能看到后面几波的预告 */
const ENDLESS_AHEAD = 6;

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
  const ext = setup.ext ?? 0;
  ensureWaves(level, ENDLESS_AHEAD);
  const fixed = new Uint8Array(GRID * GRID);
  const towers: TdTower[] = [];
  const walls: TdWall[] = [];
  const traps: Trap[] = [];
  const treasures: TdState['treasures'] = [];
  let maxId = 0;
  for (const p of setup.layout) {
    const def = BUILDINGS[p.kind];
    if (!def) continue;
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
  // 第四章的水面（只有写了 water 的关才有）：和建筑一样整格挡死，谁都走不过去
  for (const c of level.water ?? []) if (inGrid(ext, c.x, c.y)) fixed[cellIdx(c.x, c.y)] = 2;
  // 第五章的断崖：和水面一样挡死；崖上的高台不在断崖格里（content 里扣掉了），照常是木台
  const cliffs = cliffOn({ level });
  if (cliffs) for (const c of level.cliffs ?? []) if (inGrid(ext, c.x, c.y)) fixed[cellIdx(c.x, c.y)] = 2;
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
          if (!inIsle(ext, x, y) || fixed[cellIdx(x, y)] !== 0) continue;
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
        if (!inGrid(ext, x + ox, y + oy) || fixed[cellIdx(x + ox, y + oy)] !== 0) return true;
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
    const slot: TdSlot = { x: sl.x, y: sl.y, tower: -1, ups: 0, spent: 0, ...(cliffs && sl.high ? { high: true as const } : {}) };
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
    if (!sl || sl.tower >= 0 || !isTdTowerKind(g.kind)) continue;
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
  const nav = navEnabled(setup);
  const hs = tdHeroStats(heroLv, nav ? 'nav' : undefined);
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
  // 航海士没有锚钩（第三技能只有船长有）
  if (nav) hero.kind = 'nav';
  else if (hookEnabled(setup, heroLv)) hero.hookReady = 0;
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
    ext,
    tick: 0,
    level,
    mode: setup.mode,
    unlocked: TD_TOWER_KINDS.filter((k) => !setup.unlocked || setup.unlocked.includes(k)),
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
    barricades: [],
    over: false,
    ...(campEnabled(setup) ? { campOn: true as const } : {}),
    internal,
  };
  const deep = deepOf(setup);
  if (deep) s.deep = deep;
  if (level.escort) {
    // 护航：船停在起点（要玩家定速度），没有宝藏箱
    // 娱乐护航照顾新手：开局英雄就跟着船（不跟随时普通机器人新手档三张图全沉，新手又找不到这个开关）；
    // 第一波开打时还没碰过船速就替他点「巡航」（试玩里造塔造过了头，船停在港口被第一波钉死）
    const assist = !!setup.escortAssist;
    s.escort = {
      def: level.escort, pos: 0, pace: 'hold', hull: level.escort.hull, biters: 0, mendReady: 0, follow: assist,
      gatesPassed: 0, arrived: false, sunk: false, mends: 0,
      ...(assist ? { autoSail: true } : {}),
    };
  }
  // 英雄出生点要能站：宝藏箱下面被占就挪到四周第一个空格
  placeHero(s);
  s.hero.post = { x: s.hero.x, y: s.hero.y };
  initMech(s);
  initHappen(s, setup.seed);
  return s;
}

// ------------------------------------------------------------ 伤害

/** 分裂、召唤的落点在水面上（第四章）就落在原地 (fx, fy)：没有水面的关原样返回 */
function offWater(s: TdState, x: number, y: number, fx: number, fy: number): { x: number; y: number } {
  const w = s.level.water;
  if (!w) return { x, y };
  const cx = Math.floor(x / UNIT);
  const cy = Math.floor(y / UNIT);
  return w.some((c) => c.x === cx && c.y === cy) ? { x: fx, y: fy } : { x, y };
}

function resolveEnemy(s: TdState, e: TdEnemy): void {
  const I = inner(s);
  I.waveLeft[e.wave] = (I.waveLeft[e.wave] ?? 1) - 1;
}

function spawnEnemy(s: TdState, ev: TdEvent[], kind: TdEnemyKind, x: number, y: number, hx: number, hy: number, wave: number): TdEnemy {
  const I = inner(s);
  const hp = enemyHp(s.level, kind, wave);
  const e: TdEnemy = {
    id: I.nextId++, kind, wave, x, y, hp, maxHp: hp, mode: 'in', carry: 0, hx, hy, cd: s.tick, slowUntil: 0, slowPct: 0, face: 1, trail: [],
    px: x, py: y,
  };
  const shell = TD2_ENEMIES[kind].shell;
  if (shell) e.until = s.tick + shell.moor;
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
 * 直射命中盾兵：盾朝着来弹、没被震晕，枪弹和炮弹的单体伤害只吃 SHIELD.frontPct%，推 guard 事件；
 * 火、爆和溅射不走这里（p.sx 只有直射才写：塔都写，英雄的枪只在断崖关写，见 tdhero.ts）。
 * 盾挡不挡只判这一处：从崖上高台往下打的（p.above）挡不住；被锚钩钩住的在拖动和定住期间算震晕，盾放下，挡不住。
 */
function guardedHit(s: TdState, ev: TdEvent[], e: TdEnemy, p: Pend): number {
  const dmg = drummed(s, e, p);
  if (dmg !== p.dmg) return dmg;
  if (e.kind !== 'shield' || p.sx === undefined || p.sy === undefined || p.above || stunned(e, s.tick)) return p.dmg;
  if (p.hit.dt !== 'shot' && p.hit.dt !== 'shell') return p.dmg;
  if (!shieldFaces(e.gx ?? 0, e.gy ?? 0, e.x, e.y, p.sx, p.sy)) return p.dmg;
  ev.push({ type: 'guard', id: e.id, x: e.x + Math.round(((e.gx ?? 0) * 40) / 100), y: e.y + Math.round(((e.gy ?? 0) * 40) / 100) });
  return Math.floor((p.dmg * SHIELD.frontPct) / 100);
}

/**
 * 盾鼓手：直射（塔都写 sx；英雄的枪只在断崖关写）的枪弹、炮弹打到它身边 drum.r 内的同伴（不含它自己、首领），只吃 drum.pct%；
 * 几个鼓手不叠加。溅射、火、爆不走这里
 */
function drummed(s: TdState, e: TdEnemy, p: Pend): number {
  if (p.sx === undefined || (p.hit.dt !== 'shot' && p.hit.dt !== 'shell')) return p.dmg;
  const me = TD2_ENEMIES[e.kind];
  if (me.drum || me.boss) return p.dmg;
  for (const o of s.enemies) {
    const dr = TD2_ENEMIES[o.kind].drum;
    if (!dr || (o.mode !== 'in' && o.mode !== 'out') || d2(o.x, o.y, e.x, e.y) > dr.r * dr.r) continue;
    return Math.floor((p.dmg * dr.pct) / 100);
  }
  return p.dmg;
}

/** 落人的位置：这一格能走就原地，不然（水面、墙、建筑里）按一圈圈往外找最近能走的格（格中心），同一圈按先行后列；4 圈内都找不到就原地 */
function landAt(s: TdState, x: number, y: number): { x: number; y: number } {
  ensureGrid(s);
  const occ = inner(s).occ;
  const cx = Math.floor(x / UNIT);
  const cy = Math.floor(y / UNIT);
  if (inGrid(s.ext, cx, cy) && occ[cellIdx(cx, cy)] === 0) return { x, y };
  for (let r = 1; r <= 4; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (inGrid(s.ext, nx, ny) && occ[cellIdx(nx, ny)] === 0) return { x: nx * UNIT + 50, y: ny * UNIT + 50 };
      }
    }
  }
  return { x, y };
}

/** 热气球落人：n 个 kind 围着 (x, y) 按编号排成一圈（不用随机），每个都挪到能走的格 */
function dropCrew(s: TdState, ev: TdEvent[], e: TdEnemy, kind: TdEnemyKind, n: number): void {
  const I = inner(s);
  for (let i = 0; i < n; i++) {
    const o = laneOffset(e.id * 7 + i, 30);
    const p = landAt(s, e.x + o.x, e.y + o.y);
    I.waveLeft[e.wave] = (I.waveLeft[e.wave] ?? 0) + 1;
    spawnEnemy(s, ev, kind, p.x, p.y, e.hx, e.hy, e.wave);
  }
}

/**
 * 多段首领换形态：原地换成 next（新 id，血按旧形态剩下的比例折，至少 1），带上 with；旧形态不算打死、不给金、不掉东西。
 * 推 phase 事件给画面演变身
 */
function shiftPhase(s: TdState, ev: TdEvent[], e: TdEnemy, ph: NonNullable<TdEnemyDef['phase']>): void {
  const I = inner(s);
  const ratio = Math.max(1, e.hp);
  const from = e.maxHp;
  // 扛着宝藏回船的途中换段，新形态接着回船（不折返再抢）
  const mode = e.mode;
  e.mode = 'dead';
  e.hp = 0;
  I.waveLeft[e.wave] = (I.waveLeft[e.wave] ?? 0) + 1;
  // 海上的一段换到岸上：落在登陆点（它本来就停在登陆点外）；岸上的一段原地换
  const at = TD2_ENEMIES[e.kind].shell ? landAt(s, e.hx, e.hy) : { x: e.x, y: e.y };
  const n = spawnEnemy(s, ev, ph.next, at.x, at.y, e.hx, e.hy, e.wave);
  n.hp = Math.max(1, Math.floor((n.maxHp * ratio) / from));
  n.carry = e.carry;
  if (mode === 'out') n.mode = 'out';
  ev.push({ type: 'phase', id: e.id, next: n.id, kind: ph.next });
  if (ph.with) {
    for (let i = 0; i < ph.with.n; i++) {
      const o = laneOffset(n.id * 5 + i, 60);
      const p = landAt(s, at.x + o.x, at.y + o.y);
      I.waveLeft[e.wave] = (I.waveLeft[e.wave] ?? 0) + 1;
      spawnEnemy(s, ev, ph.with.kind, p.x, p.y, e.hx, e.hy, e.wave);
    }
  }
  resolveEnemy(s, e);
}

function damageEnemy(s: TdState, ev: TdEvent[], e: TdEnemy, dmg: number, h: Hit): void {
  if (e.mode !== 'in' && e.mode !== 'out') return;
  const m = mult(h, TD_ENEMY_ARMOR[e.kind]);
  if (m <= 0) return;
  const def = TD2_ENEMIES[e.kind];
  // 暴雨：火的伤害打折
  const wet = h.dt === 'fire' && raining(s) ? TD2_EVENT.rain.firePct : 100;
  const d = Math.floor((Math.floor((dmg * wet) / 100) * m) / 100);
  e.hp -= d;
  ev.push({ type: 'hit', id: e.id, dmg: d });
  if (def.phase && e.hp * 100 <= e.maxHp * def.phase.at) {
    shiftPhase(s, ev, e, def.phase);
    return;
  }
  if (e.hp > 0) return;
  e.hp = 0;
  e.mode = 'dead';
  ev.push({ type: 'die', id: e.id, kind: e.kind });
  inner(s).kills++;
  addGold(s, killGold(s, e, def.gold));
  if (e.bounty) payBounty(s, ev, e);
  if (e.carry > 0) {
    // 倒在收起的吊桥（水面）上：宝藏落到最近的岸上，不然捡的人能借这座桥过去
    const at = onRaisedBridge(s, e.x, e.y) >= 0 ? nearestWalkable(s, e.x, e.y) : { x: e.x, y: e.y };
    s.piles.push({ x: at.x, y: at.y, n: e.carry, at: s.tick });
    ev.push({ type: 'drop', x: at.x, y: at.y, n: e.carry });
    e.carry = 0;
  }
  if (def.land) dropCrew(s, ev, e, def.land.kind, def.land.shot);
  if (def.split) {
    const I = inner(s);
    for (let i = 0; i < def.split.n; i++) {
      I.waveLeft[e.wave] = (I.waveLeft[e.wave] ?? 0) + 1;
      const p = offWater(s, e.x + I.rng.int(81) - 40, e.y + I.rng.int(81) - 40, e.x, e.y);
      spawnEnemy(s, ev, def.split.kind, p.x, p.y, e.hx, e.hy, e.wave);
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
  const rp = s.deep?.talent.respawnPct;
  h.respawn = s.tick + (rp ? Math.floor((TD2_HERO.respawnTicks * rp) / 100) : TD2_HERO.respawnTicks);
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
  /** 震荡炮：炸到的敌人震晕几拍 */
  stun?: number;
  /** 攻城巨炮：炸到首领伤害 × bossPct% */
  bossPct?: number;
  /** 霰弹炮台：炸到的地面敌人（不含首领、海上的船）往回推 push 拍 */
  push?: number;
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
    damageEnemy(s, ev, e, b.bossPct && TD_ULT_BOSS.has(e.kind) ? Math.floor((b.dmg * b.bossPct) / 100) : b.dmg, b.hit);
    slowEnemy(s, e, b.slowPct, b.slowTicks);
    if (b.push && e.hp > 0 && !isAir(e.kind) && !TD_ULT_BOSS.has(e.kind) && !TD2_ENEMIES[e.kind].shell) pullBack(e, b.push);
    if (b.stun && e.hp > 0) {
      // 首领（船长）只震一半；免控中的不再震（combat.ts）
      const until = applyStun(e, s.tick, b.stun, e.kind === 'captain' || !!TD2_ENEMIES[e.kind].boss);
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
      explode(s, ev, p.x, p.y, {
        dmg: p.dmg, r: p.r, hit: p.hit, fog: false, friendly: false, blocks: false, slowPct: p.slowPct, slowTicks: p.slowTicks,
        ...(p.stun ? { stun: p.stun } : {}), ...(p.bossPct ? { bossPct: p.bossPct } : {}), ...(p.push ? { push: p.push } : {}),
      });
      if (p.burnDps > 0) s.fires.push({ x: p.x, y: p.y, r: p.r, dps: p.burnDps, until: s.tick + p.burnTicks });
    } else if (p.kind === 'keg') {
      explode(s, ev, p.x, p.y, { dmg: p.dmg, r: p.r, hit: p.hit, fog: true, friendly: true, blocks: true, slowPct: 0, slowTicks: 0 });
    } else {
      explode(s, ev, p.x, p.y, { dmg: p.dmg, r: p.r, hit: p.hit, fog: true, friendly: false, blocks: true, slowPct: 0, slowTicks: 0 });
    }
  }
}

/** 手雷落地：英雄挨全额，墙按 wallPct% 算，拒马挨全额；不炸敌人自己 */
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
function lobAhead(s: TdState, e: TdEnemy, f: Int32Array, range: number, occ: Uint8Array): { x: number; y: number } | null {
  const here = barricadeAt(s, cellOf(e.x, e.y));
  let x = e.x;
  let y = e.y;
  for (let k = 0; k < 4; k++) {
    const n = nextCell(occ, s.ext, f, x, y);
    if (n < 0) return null;
    const cx = cellX(n);
    const cy = cellY(n);
    if (d2(cx, cy, e.x, e.y) > range * range) return null;
    if (occ[n] === 1) return { x: cx, y: cy };
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
function tdBombDmg(s: TdState): number {
  return Math.max(1, Math.floor((levelAvg(s).unit * TD2_HERO_SKILL.bomb.dmgPct) / 100));
}

/** 岸防老炮一发的伤害：同一个口径，TD2_BATTERY.dmgPct% */
function tdBatteryDmg(s: TdState): number {
  return Math.max(1, Math.floor((levelAvg(s).unit * TD2_BATTERY.dmgPct) / 100));
}

/** 友军巡航船一炮的伤害：同一个口径，TD2_FLEET.dmgPct% */
function tdFleetDmg(s: TdState): number {
  return Math.max(1, Math.floor((levelAvg(s).unit * TD2_FLEET.dmgPct) / 100));
}

// ------------------------------------------------------------ 操作

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
      if (h.hookReady !== undefined) h.hookReady = Math.max(s.tick, h.hookReady - cdCut);
    }
  }
  for (const g of wave.groups) {
    let lane = lv.lanes[g.lane % Math.max(1, lv.lanes.length)] ?? { x: -2, y: 10 };
    if (g.lane === lv.lanes.length) lane = tdTideOpen(s, w) ? (lv.tide as NonNullable<TdLevel['tide']>).lane : (lv.lanes[0] ?? lane);
    const n = dareCount(s, w, g.n);
    for (let i = 0; i < n; i++) {
      I.spawns.push({ t: s.tick + (g.delay ?? 0) + i * g.every, kind: g.enemy, x: lane.x * UNIT + 50, y: lane.y * UNIT + 50, wave: w });
      I.waveLeft[w] = (I.waveLeft[w] ?? 0) + 1;
    }
  }
  // 天赋「利息」：每波开打时按当前金币给一点
  const it = s.deep?.talent.interest;
  if (it) {
    const g = Math.min(it.cap, Math.floor((s.gold * it.pct) / 100));
    if (g > 0) {
      addGold(s, g);
      bonus += g;
    }
  }
  driftCrates(s, ev, w);
  queueBounty(s, w);
  const es = s.escort;
  if (w === 0 && es?.autoSail) {
    es.autoSail = false;
    es.pace = 'sail';
    ev.push({ type: 'pace', pace: 'sail', auto: true });
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
  if (!inGrid(s.ext, cx, cy) || (inner(s).occ[cellIdx(cx, cy)] ?? 0) !== 0) return null;
  if (s.barricades.some((b) => b.x === cx && b.y === cy)) return null;
  return { cx, cy };
}

/** 英雄能不能直接站到 (x, y)（单位）：岛内、这一格空着（天赋「随意站位」） */
function heroCanStand(s: TdState, x: number, y: number): boolean {
  ensureGrid(s);
  const cx = Math.floor(x / UNIT);
  const cy = Math.floor(y / UNIT);
  return inIsle(s.ext, cx, cy) && inner(s).occ[cellIdx(cx, cy)] === 0;
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
      const cost = tdBuildCost(s, a.slot, a.kind);
      if (s.gold < cost) return;
      if (tdBuildBlock(s, a.slot) || tdRuleBlock(s, a.slot)) return;
      s.gold -= cost;
      const t: TdTower = { id: I.nextId++, kind: a.kind, level: TD_TIER_LEVEL[1], x: sl.x, y: sl.y, size: 2, branch: [], cd: s.tick, aim: -1, lock: -1, slot: a.slot, tier: 1 };
      s.towers.push(t);
      sl.tower = t.id;
      sl.ups = 0;
      sl.spent = cost;
      I.ver++;
      return;
    }
    case 'camp': {
      const sl = s.slots[a.slot];
      if (!s.campOn || !sl || sl.tower >= 0 || sl.wreck !== undefined || sl.garrison !== undefined || s.gold < TD2_CAMP.cost || tdBuildBlock(s, a.slot) || tdRuleBlock(s, a.slot) || s.deep?.rule.kinds) return;
      s.gold -= TD2_CAMP.cost;
      const c = newCamp(s, I.nextId++, a.slot);
      (s.camps ??= []).push(c);
      sl.tower = c.id;
      sl.ups = 0;
      sl.spent = TD2_CAMP.cost;
      I.ver++;
      ev.push({ type: 'camp', camp: c.id, slot: a.slot, what: 'build' });
      return;
    }
    case 'muster': {
      const c = campAt(s, a.slot);
      if (!c || !rallyOk(s, a.slot, a.x, a.y)) return;
      c.rx = Math.round(a.x);
      c.ry = Math.round(a.y);
      for (const m of c.men) m.foes = [];
      ev.push({ type: 'camp', camp: c.id, slot: a.slot, what: 'muster' });
      return;
    }
    case 'up': {
      const sl = s.slots[a.slot];
      const camp = campAt(s, a.slot);
      if (sl && camp) {
        const cost = campUpCost(camp);
        if (cost < 0 || s.gold < cost) return;
        s.gold -= cost;
        camp.tier = camp.tier === 1 ? 2 : 3;
        sl.ups = camp.tier - 1;
        sl.spent = (sl.spent ?? 0) + cost;
        refitCamp(s, camp);
        ev.push({ type: 'camp', camp: camp.id, slot: a.slot, what: 'up' });
        return;
      }
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
      // 局内的塔到 3 阶才选分叉（先 3 级那一档，再 6 级那一档）；水手营 3 阶二选一
      const camp = campAt(s, a.slot);
      if (camp) {
        if (camp.tier !== 3 || camp.branch || !Object.hasOwn(TD2_CAMP_BRANCH, a.branch)) return;
        camp.branch = a.branch as keyof typeof TD2_CAMP_BRANCH;
        refitCamp(s, camp);
        ev.push({ type: 'camp', camp: camp.id, slot: a.slot, what: 'branch' });
        return;
      }
      const t = slotTower(s, a.slot);
      if (t?.tier !== 3 || typeof a.branch !== 'string' || branchError(t.kind, t.level, t.branch, a.branch) !== null) return;
      if (s.deep?.rule.noBranch?.includes(a.branch)) return;
      t.branch = [...t.branch, a.branch];
      I.stats.delete(t.id);
      return;
    }
    case 'ult': {
      // 终极：只在战役和海盗来袭、解锁了才有（tddeep.ts）；钱按天赋打折后的价，卖塔照样按已花的退
      const sl = s.slots[a.slot];
      const camp = campAt(s, a.slot);
      if (sl && camp) {
        if (!s.deep?.ult || typeof a.ult !== 'string' || campUltError(camp, a.ult) !== null) return;
        const cost = campUltCost(s, a.ult);
        if (cost < 0 || s.gold < cost) return;
        s.gold -= cost;
        camp.ult = a.ult as TdCampUlt;
        if (camp.ult === 'ult.camp.marine') camp.chargeReady = s.tick;
        sl.spent = (sl.spent ?? 0) + cost;
        refitCamp(s, camp);
        ev.push({ type: 'ult', slot: a.slot, id: camp.id, ult: camp.ult });
        return;
      }
      const t = slotTower(s, a.slot);
      if (!s.deep?.ult || !sl || !t || typeof a.ult !== 'string' || ultError(t, a.ult) !== null) return;
      const cost = tdUltCost(s, a.ult);
      if (cost < 0 || s.gold < cost) return;
      s.gold -= cost;
      t.ult = a.ult;
      if (TD_ULT_BY_ID.get(a.ult)?.every) t.fired = 0;
      sl.spent = (sl.spent ?? 0) + cost;
      I.stats.delete(t.id);
      ev.push({ type: 'ult', slot: a.slot, id: t.id, ult: a.ult });
      return;
    }
    case 'prio': {
      const t = slotTower(s, a.slot);
      if (!s.deep || !t || !(TD_PRIOS as readonly string[]).includes(a.prio)) return;
      if (a.prio === 'first') delete t.prio;
      else t.prio = a.prio as TdPrio;
      return;
    }
    case 'sell': {
      if (s.deep?.rule.noSell) return;
      const sl = s.slots[a.slot];
      const camp = campAt(s, a.slot);
      if (sl && camp) {
        const refund = tdSellRefund(s, a.slot);
        s.camps = (s.camps ?? []).filter((c) => c !== camp);
        sl.tower = -1;
        sl.ups = 0;
        sl.spent = 0;
        I.ver++;
        s.gold += refund;
        ev.push({ type: 'camp', camp: camp.id, slot: a.slot, what: 'sell' });
        ev.push({ type: 'sell', slot: a.slot, refund });
        return;
      }
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
      // 指到木台上就挪到台边：英雄站在台上会挡住造塔
      h.goal = offSlot(s, Math.round(a.x), Math.round(a.y));
      // 天赋「随意站位」：第一波开打前直接摆过去（能站的格才行）
      if (s.deep?.talent.heroDrag && s.wave === 0 && heroCanStand(s, h.goal.x, h.goal.y)) {
        h.x = h.goal.x;
        h.y = h.goal.y;
      }
      inner(s).heroCmd = true;
      h.post = { ...h.goal };
      inner(s).heroAuto = false;
      h.clear = -1;
      forgetFetch(s);
      if (s.escort) s.escort.follow = false; // 自己指了地方就不跟船了
      return;
    case 'clear': {
      const b = s.blocks.find((q) => q.id === a.id);
      if (h.respawn >= 0 || !b || b.destroyed) return;
      h.clear = b.id;
      h.goal = { x: tcx(b), y: tcy(b) };
      inner(s).heroAuto = false;
      forgetFetch(s);
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
      if (h.kind || h.respawn >= 0 || s.tick < h.kegReady || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return;
      if (d2(h.x, h.y, a.x, a.y) > sk.range * sk.range) return;
      h.kegReady = s.tick + heroCd(s, sk.cd);
      I.pend.push({ t: s.tick + 10, kind: 'heroKeg', id: -1, dmg: tdBombDmg(s), x: Math.round(a.x), y: Math.round(a.y), r: sk.r + (s.deep?.talent.skillR ?? 0), hit: HIT_KEG, slowPct: 0, slowTicks: 0, burnDps: 0, burnTicks: 0, pull: 0 });
      ev.push({ type: 'hero', what: 'keg' });
      return;
    }
    case 'barricade': {
      const sk = TD2_HERO_SKILL.barricade;
      if (h.kind || h.respawn >= 0 || s.tick < (h.barricadeReady ?? 0) || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return;
      const c = barricadeCell(s, a.x, a.y);
      if (!c || d2(h.x, h.y, c.cx * UNIT + 50, c.cy * UNIT + 50) > sk.range * sk.range) return;
      h.barricadeReady = s.tick + heroCd(s, sk.cd);
      const hp = tdBarricadeHp(s);
      const b: TdBarricade = { id: I.nextId++, x: c.cx, y: c.cy, hp, maxHp: hp, until: s.tick + sk.ticks };
      s.barricades.push(b);
      ev.push({ type: 'barricade', id: b.id, x: b.x, y: b.y, until: b.until });
      ev.push({ type: 'hero', what: 'barricade' });
      return;
    }
    case 'pace':
      // 玩家自己定过船速（哪怕是点「停」留在原地）就不再替他开船
      if (s.escort?.autoSail) s.escort.autoSail = false;
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
    case 'sluice':
      if (s.deep?.rule.noSluice) return;
      toggleSluice(s, ev);
      return;
    case 'pickup':
      fetchCrate(s, a.id);
      return;
    case 'battery':
      if (s.battery && !s.deep?.rule.noBattery) fireBattery(s, ev, a.x, a.y, tdBatteryDmg(s));
      return;
    case 'fleet':
      if (s.deep?.rule.noFleet) return;
      callFleet(s, ev);
      return;
    case 'drawbridge':
      toggleDrawbridge(s, ev);
      return;
    case 'hook':
      castHook(s, ev, a.id);
      return;
    case 'dare':
      toggleDare(s, ev);
      return;
    case 'flag':
      castFlag(s, ev, a.x, a.y);
      return;
    case 'reward':
      castReward(s, ev, a.x, a.y);
      return;
    case 'rally':
      // 号令是被动的（英雄身边的塔攻速加成，见 stepTowers），这条命令不做事
      return;
  }
}

// ------------------------------------------------------------ 一拍

function stepSpawns(s: TdState, ev: TdEvent[]): void {
  const I = inner(s);
  if (I.spawns.length === 0) return;
  const keep: Internal['spawns'] = [];
  for (const sp of I.spawns) {
    if (sp.t > s.tick) {
      keep.push(sp);
      continue;
    }
    const e = spawnEnemy(s, ev, sp.kind, sp.x + I.rng.int(81) - 40, sp.y + I.rng.int(81) - 40, sp.x, sp.y, sp.wave);
    if (sp.exit) {
      // 赏金船：血量翻几倍，一上岸就当"回船"往另一条登陆路跑（不抢宝藏、跑掉不算丢）
      e.bounty = true;
      e.hp = e.maxHp = e.maxHp * TD2_EVENT.bounty.hpMul;
      e.mode = 'out';
      e.hx = sp.exit.x;
      e.hy = sp.exit.y;
      ev.push({ type: 'bounty', what: 'come', id: e.id, x: e.x, y: e.y, gold: 0 });
    }
  }
  I.spawns = keep;
}

/** 去抢的敌人选哪个宝藏箱：走过去代价最小的（墙按代价算，所以"能走到"的都算） */
function pickTreasure(s: TdState, e: TdEnemy, wallCost: number, bridge: 0 | 1 | -1 = -1): { f: Int32Array; d: number } | null {
  let best: Int32Array | null = null;
  let bestD = INF;
  const c = cellOf(e.x, e.y);
  for (let i = 0; i < s.treasures.length; i++) {
    const f = treasureFlow(s, i, wallCost, bridge);
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
  if (s.tick % 20 === 0) stepMedics(s, ev);
  // 英雄最多同时缠住 maxEngaged 个地面敌人（按数组顺序先到先缠），多的绕过去
  let engaged = 0;
  if (s.escort) s.escort.biters = 0;
  const held = s.camps ? heldBy(s) : null;
  for (const e of s.enemies) {
    if (e.mode !== 'in' && e.mode !== 'out') continue;
    const def = TD2_ENEMIES[e.kind];
    const fly = isAir(e.kind);
    if (s.tick % 10 === 0) {
      e.trail.push(e.x, e.y);
      if (e.trail.length > 12) e.trail.splice(0, 2);
    }
    // 锚钩拉着的：这几拍由钩子拖着走，自己不走不打
    if (e.hook) {
      stepHooked(s, e);
      continue;
    }
    // 炮艇不上岸：到点开走，其余时间隔一阵打哑一座塔（震晕也照样数着开走的时间）
    if (def.shell) {
      stepGunboat(s, ev, e, def.shell);
      continue;
    }
    // 震晕中不走不打（stunUntil 只有震荡炮会写）
    if (stunned(e, s.tick)) continue;
    let spd = (e.mode === 'out' && e.carry > 0 && def.carrySpeed ? def.carrySpeed : def.speed) * 100;
    for (const c of captains) {
      if (c === e) continue;
      const a = TD2_ENEMIES.captain.aura;
      if (a && d2(c.x, c.y, e.x, e.y) <= a.r * a.r) {
        spd = Math.floor((spd * (100 + a.pct)) / 100);
        break;
      }
    }
    if (s.tick < e.slowUntil) spd = Math.floor((spd * (100 - e.slowPct)) / 100);
    if (fly && raining(s)) spd = Math.floor((spd * TD2_EVENT.rain.airPct) / 100);
    spd = Math.max(1, Math.floor(spd / 100));

    // 水手营的兵缠住了：原地打兵（去抢的、回船的都拦）
    const hb = held?.get(e.id);
    if (hb) {
      if (s.tick >= e.cd) {
        e.cd = s.tick + def.reload;
        hitSoldier(s, ev, hb.camp, hb.man, def.dmg);
      }
      continue;
    }

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
      if (def.land) {
        floatBalloon(s, ev, e, def.land, spd);
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
        const br = fly ? -1 : onRaisedBridge(s, e.x, e.y);
        if (fly) moveToward(e, pile.x, pile.y, spd);
        else walk(s, ev, e, cellFlow(s, cellOf(pile.x, pile.y), TD_WALL_COST, br), spd, pile.x, pile.y, occFor(s, br));
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
      const br = onRaisedBridge(s, e.x, e.y);
      const pick = pickTreasure(s, e, wc, br);
      if (!pick) continue;
      if (pick.d === 0) {
        grab(s, ev, e);
        continue;
      }
      walk(s, ev, e, pick.f, spd, Number.NaN, Number.NaN, occFor(s, br));
    } else {
      // 回船：飞的直线，走的按流场（墙、拒马照样砸）
      if (d2(e.hx, e.hy, e.x, e.y) <= 60 * 60) {
        e.mode = 'gone';
        if (e.bounty) ev.push({ type: 'bounty', what: 'gone', id: e.id, x: e.x, y: e.y, gold: 0 });
        if (e.carry > 0) {
          s.lost += e.carry;
          ev.push({ type: 'escape', id: e.id, n: e.carry });
        }
        resolveEnemy(s, e);
        continue;
      }
      const br = fly ? -1 : onRaisedBridge(s, e.x, e.y);
      if (fly) moveToward(e, e.hx, e.hy, spd);
      else walk(s, ev, e, cellFlow(s, cellOf(e.hx, e.hy), TD_WALL_COST, br), spd, e.hx, e.hy, occFor(s, br));
    }
  }
}

/** 热气球：直线飘向最近的宝藏箱（箱子空了也照飘），到 land.r 内落下 land.near 个人，气球自己没了（不算丢、不给金） */
function floatBalloon(s: TdState, ev: TdEvent[], e: TdEnemy, land: NonNullable<TdEnemyDef['land']>, spd: number): void {
  let tx = e.x;
  let ty = e.y;
  let bd = Number.POSITIVE_INFINITY;
  for (const t of s.treasures) {
    const d = d2(t.x * UNIT + 50, t.y * UNIT + 50, e.x, e.y);
    if (d < bd) {
      bd = d;
      tx = t.x * UNIT + 50;
      ty = t.y * UNIT + 50;
    }
  }
  if (bd > land.r * land.r) {
    moveToward(e, tx, ty, spd);
    return;
  }
  e.mode = 'gone';
  ev.push({ type: 'land', id: e.id, x: e.x, y: e.y });
  dropCrew(s, ev, e, land.kind, land.near);
  resolveEnemy(s, e);
}

/**
 * 炮艇：到点开走（不带宝藏、不算丢）；多段首领（铁潮舰）到点不走、直接上岸换下一段，免得塔够不着时拖到超时白拿三星。
 * 没震晕、装填好了就打 range 内最近的一座塔（同距离按 id），打中的哑 jamTicks 拍
 */
function stepGunboat(s: TdState, ev: TdEvent[], e: TdEnemy, sh: NonNullable<TdEnemyDef['shell']>): void {
  if (s.tick >= (e.until ?? INF)) {
    const ph = TD2_ENEMIES[e.kind].phase;
    if (ph) {
      shiftPhase(s, ev, e, ph);
      return;
    }
    e.mode = 'gone';
    ev.push({ type: 'sail', id: e.id });
    resolveEnemy(s, e);
    return;
  }
  const def = TD2_ENEMIES[e.kind];
  if (def.drop || def.escort) stepKing(s, ev, e, sh, def);
  if (stunned(e, s.tick) || s.tick < e.cd) return;
  let best: TdTower | undefined;
  let bd = sh.range * sh.range + 1;
  for (const t of s.towers) {
    const d = d2(tcx(t), tcy(t), e.x, e.y);
    if (d < bd || (d === bd && best && t.id < best.id)) {
      bd = d;
      best = t;
    }
  }
  if (!best) return;
  e.cd = s.tick + sh.reload;
  ev.push({ type: 'shell', id: e.id, tower: best.id, x0: e.x, y0: e.y, x1: tcx(best), y1: tcy(best) });
  const I = inner(s);
  const until = s.tick + sh.jamTicks;
  if ((I.jam.get(best.id) ?? 0) < until) {
    I.jam.set(best.id, until);
    ev.push({ type: 'jam', id: best.id, until });
  }
}

/**
 * 海盗王：停泊期间每 drop.every 拍在身边放下一船人（震晕时照放，船上的人不归它管）；血掉到一半时叫来护航（一局一次），
 * 护航沿着它所在的那条岸边一左一右各摆一艘，停泊时间照自己的算
 */
function stepKing(s: TdState, ev: TdEvent[], e: TdEnemy, sh: NonNullable<TdEnemyDef['shell']>, def: TdEnemyDef): void {
  const I = inner(s);
  const age = s.tick - ((e.until ?? 0) - sh.moor);
  if (def.drop && age > 0 && age % def.drop.every === 0) {
    ev.push({ type: 'king', what: 'drop', id: e.id, x: e.x, y: e.y });
    for (let i = 0; i < def.drop.n; i++) {
      I.waveLeft[e.wave] = (I.waveLeft[e.wave] ?? 0) + 1;
      spawnEnemy(s, ev, def.drop.kind, e.x + I.rng.int(121) - 60, e.y + I.rng.int(121) - 60, e.hx, e.hy, e.wave);
    }
  }
  if (def.escort && e.hp * 2 <= e.maxHp && !I.skilled.has(e.id)) {
    I.skilled.add(e.id);
    ev.push({ type: 'king', what: 'escort', id: e.id, x: e.x, y: e.y });
    const mid = (ISLAND * UNIT) / 2;
    const alongY = Math.abs(e.x - mid) > Math.abs(e.y - mid);
    for (let i = 0; i < def.escort.n; i++) {
      const off = (i % 2 === 0 ? 1 : -1) * 250 * (1 + (i >> 1));
      I.waveLeft[e.wave] = (I.waveLeft[e.wave] ?? 0) + 1;
      spawnEnemy(s, ev, def.escort.kind, alongY ? e.x : e.x + off, alongY ? e.y + off : e.y, e.hx, e.hy, e.wave);
    }
  }
}

/** 军医（每秒一次）：给 heal.r 内别的活着的同伴回 heal.pct% 最大血（至少 1，不超过上限），不给自己、不给首领回；回到人了发一次 heal 事件 */
function stepMedics(s: TdState, ev: TdEvent[]): void {
  for (const m of s.enemies) {
    const hl = TD2_ENEMIES[m.kind].heal;
    if (!hl || (m.mode !== 'in' && m.mode !== 'out') || stunned(m, s.tick)) continue;
    let any = false;
    for (const e of s.enemies) {
      if (e === m || e.hp >= e.maxHp || e.kind === 'captain' || TD2_ENEMIES[e.kind].boss || (e.mode !== 'in' && e.mode !== 'out')) continue;
      if (d2(e.x, e.y, m.x, m.y) > hl.r * hl.r) continue;
      e.hp = Math.min(e.maxHp, e.hp + Math.max(1, Math.floor((e.maxHp * hl.pct) / 100)));
      any = true;
    }
    if (any) ev.push({ type: 'heal', id: m.id });
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

/** 沿流场走一步；前面是墙就砸（工兵炸），前面是拒马就砸拒马；已经在终点格就直走到 (fx, fy)（NaN = 不用走） */
function walk(s: TdState, ev: TdEvent[], e: TdEnemy, f: Int32Array, spd: number, fx: number, fy: number, occ: Uint8Array = inner(s).occ): void {
  const I = inner(s);
  const n = nextCell(occ, s.ext, f, e.x, e.y);
  if (n < 0) {
    if (Number.isFinite(fx)) moveToward(e, fx, fy, spd);
    return;
  }
  const def = TD2_ENEMIES[e.kind];
  // 掷弹兵：前面 3 格内有挡路的墙或拒马就停下扔雷，不走过去砸
  if (def.lob) {
    const at = lobAhead(s, e, f, def.lob.range, occ);
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
  if (occ[n] === 1) {
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
      const p = offWater(s, e.x + I.rng.int(201) - 100, e.y + I.rng.int(201) - 100, e.x, e.y);
      spawnEnemy(s, ev, sk.summon.kind, p.x, p.y, e.hx, e.hy, e.wave);
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
    const p = pickTreasure(s, e, TD2_ENEMIES[e.kind].bomb ? TD_SAPPER_WALL_COST : TD_WALL_COST, onRaisedBridge(s, e.x, e.y));
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
  const flagPct = TD2_NAV_SKILL.flag.pct;
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
    const high = onHigh(s, t);
    const cand: TdEnemy[] = [];
    // 先判射程再判看不看得见：targetable 里雾中的敌人要把全岛的塔挨个查照明，射程外的不用算
    for (const e of s.enemies) if (inRing(d2(e.x, e.y, cx, cy), st.range, st.minRange) && targetable(s, e, st, st.range)) cand.push(e);
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
    // 先打（玩家改过才有）：同一优先级类里换排序键；防空塔先打飞的、拿宝藏的那一类照旧排前
    const order = (e: TdEnemy): number => prioKey(s, e, t.prio, cx, cy, memo);
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
      // 狙击塔：优先打首领（船长）和军医（第四章：不先打掉它，后面一串都打不死），再是拿着宝藏的，其余按路程；
      // 装填完先锁定并推 aim 预警，SNIPE_WARN 拍后才开火，锁定的敌人死了或走出射程（cand 里没有）就作废重挑（DESIGN 14）
      const sCls = (e: TdEnemy): number => doomed(e) + (e.kind === 'captain' || e.kind === 'king' || e.kind === 'medic' || e.kind === 'drummer' || TD2_ENEMIES[e.kind].boss ? 0 : urgent(e) ? 1 : 2);
      let sn = I.snipe.get(t.id);
      let tgt = sn ? cand.find((e) => e.id === sn!.target) : undefined;
      if (sn && !tgt) {
        I.snipe.delete(t.id);
        sn = undefined;
      }
      if (!ready || !sn) {
        const pick = rankTargets(cand, t.lock ?? -1, (e) => [sCls(e), order(e)])[0] as TdEnemy;
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
      inRange = rankTargets(cand, t.lock ?? -1, (e) => [doomed(e) + cls(e), order(e)]);
    }
    const best = inRange[0] as TdEnemy;
    t.lock = best.id;
    t.aim = best.id;
    if (s.tick < t.cd) continue;
    let reload = st.reload;
    // 号令（船长的被动）：英雄身边的塔攻速加成；航海士没有号令，换成急射旗插着的那一座
    if (h.kind) {
      if (flagOn(s, t)) reload = Math.floor((reload * 100) / (100 + flagPct));
    } else if (h.respawn < 0 && d2(cx, cy, h.x, h.y) <= rally.r * rally.r) reload = Math.floor((reload * 100) / (100 + rally.pct));
    // 狙击塔的锁定预警算在装填里：一发的总间隔仍是 reload
    t.cd = s.tick + (sniper ? Math.max(1, reload - SNIPE_WARN) : reload);
    // 多发（火箭）：按顺序一人一发，人不够就从头再轮（单挑首领时三发都打它，不白丢三分之二的伤害）
    const shots: TdEnemy[] = [];
    for (let k = 0; k < Math.max(1, st.shots); k++) shots.push(inRange[k % inRange.length] as TdEnemy);
    const u = st.ult;
    for (const e of shots) {
      const fl = shotTicks(t.kind, cx, cy, e.x, e.y);
      // 瞄提前量：落点 = 敌人 fl 拍后的位置（直射的伤害跟着目标走，炸的按落点炸，所以炸的更要瞄准）
      const at = leadPoint(e, fl);
      ev.push({ type: 'shoot', by: 'tower', id: t.id, x0: cx, y0: cy, x1: at.x, y1: at.y, t1: s.tick + fl, target: e.id });
      let dmg = st.dmg;
      let heavy = st.heavy;
      // 鹰眼哨：每第 n 发打弱点
      if (u?.every) {
        t.fired = (t.fired ?? 0) + 1;
        if (t.fired % u.every.n === 0) {
          dmg = Math.floor((dmg * u.every.pct) / 100);
          heavy += u.every.heavy;
        }
      }
      // 连珠楼：打中的飞禽减速
      const airSlow = u?.airSlow && isAir(e.kind) ? u.airSlow : undefined;
      const base = {
        hit: { dt: st.dt, branch: st.branch, heavy }, slowPct: airSlow ? airSlow.pct : st.slowPct, slowTicks: airSlow ? airSlow.ticks : st.slowTicks, burnDps: 0, burnTicks: 0, pull: 0,
        sx: cx,
        sy: cy,
        ...(high ? { above: true as const } : {}),
      };
      if (st.line) {
        // 贯穿：从塔到射程尽头这条线上 0.5 格内的都中
        const dx = at.x - cx;
        const dy = at.y - cy;
        const len = Math.max(1, isqrt(dx * dx + dy * dy));
        const ex = cx + Math.floor((dx * st.range) / len);
        const ey = cy + Math.floor((dy * st.range) / len);
        for (const o of inRange) if (segD2(o.x, o.y, cx, cy, ex, ey) <= 50 * 50) I.pend.push({ ...base, t: s.tick + fl, kind: 'unit', id: o.id, dmg: st.dmg, x: o.x, y: o.y, r: 0 });
      } else if (st.splash > 0) {
        const extra = { ...(st.stun > 0 ? { stun: st.stun } : {}), ...(u?.bossPct ? { bossPct: u.bossPct } : {}), ...(u?.push ? { push: u.push } : {}) };
        // 火雨：一炮落 n 发，落点按敌人编号轮转（不用随机）
        const pts = u?.rain ? rainPoints(at.x, at.y, e.id, u.rain.n, u.rain.off) : [at];
        for (const q of pts) I.pend.push({ ...base, t: s.tick + fl, kind: 'splash', id: -1, dmg, x: q.x, y: q.y, r: st.splash, burnDps: st.burnDps, burnTicks: st.burnTicks, ...extra });
      } else {
        if (u?.bossPct && TD_ULT_BOSS.has(e.kind)) dmg = Math.floor((dmg * u.bossPct) / 100);
        I.pend.push({ ...base, t: s.tick + fl, kind: 'unit', id: e.id, dmg, x: e.x, y: e.y, r: 0, pull: st.pull });
        owe(e.id, dmg, base.hit);
      }
    }
  }
}

/** 「先打」的排序键（越小越先打）：最前 = 离宝藏的路程，最强 = 血多的，最近 = 离塔近的，精英 = 精英和首领先、同类按路程 */
function prioKey(s: TdState, e: TdEnemy, prio: TdPrio | undefined, cx: number, cy: number, memo: Map<number, number>): number {
  if (prio === 'strong') return -e.hp;
  if (prio === 'near') return d2(e.x, e.y, cx, cy);
  const p = progressOf(s, e, memo);
  if (prio === 'elite') return (TD_PRIO_ELITE.has(e.kind) ? 0 : 1) * 1e9 + Math.min(p, 1e8);
  return p;
}

/** 火雨的落点：目标点，再按编号从四个方向里轮着挑 n−1 个偏 off 单位的点 */
const RAIN_DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [0, 1], [-1, 0], [0, -1]];
function rainPoints(x: number, y: number, id: number, n: number, off: number): Array<{ x: number; y: number }> {
  const out = [{ x, y }];
  for (let k = 1; k < n; k++) {
    const d = RAIN_DIRS[(id + k * 2 - 2) % 4] as readonly [number, number];
    out.push({ x: x + d[0] * off, y: y + d[1] * off });
  }
  return out;
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
  // 暴雨：地上的火不烧（照样到时间灭）
  if (s.tick % 10 !== 0 || raining(s)) return;
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
  if (s.camps)
    stepCamps(
      s,
      ev,
      (e, dmg, x, y) => soldierHit(s, ev, e, dmg, x, y),
      (e, dmg, splash, sx, sy, t1) => {
        I.pend.push({ t: t1, kind: 'splash', id: -1, dmg, x: e.x, y: e.y, r: splash, hit: HIT_CAMP_SHELL, slowPct: 0, slowTicks: 0, burnDps: 0, burnTicks: 0, pull: 0, sx, sy });
      },
    );
  stepCrates(s, ev);
  if (s.fleet) stepFleet(s, ev, tdFleetDmg(s));
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
  if (s.lost >= tdLoseAt(s) || (allSpawned && !alive && I.pend.length === 0) || s.tick >= (s.level.maxTicks ?? TD_MAX_TICKS)) {
    s.over = true;
    ev.push({ type: 'end', stars: tdResult(s).stars });
  }
  return ev;
}

/** 水兵的一下：近战、火枪队都按直射结算（盾、鼓照挡），立刻生效 */
function soldierHit(s: TdState, ev: TdEvent[], e: TdEnemy, dmg: number, x: number, y: number): void {
  const p: Pend = { t: s.tick, kind: 'unit', id: e.id, dmg, x: e.x, y: e.y, r: 0, hit: HIT_SOLDIER, slowPct: 0, slowTicks: 0, burnDps: 0, burnTicks: 0, pull: 0, sx: x, sy: y };
  damageEnemy(s, ev, e, guardedHit(s, ev, e, p), HIT_SOLDIER);
}

/** 星数（td2types.ts 的区间）：一枚没丢 3★，丢 ≤ 3 枚 2★，丢 ≤ 10 枚 1★，再多就输（0★，丢到 TD2_LOSE_AT 枚当场结束；老兵局 TD_VET_LOSE_AT，见 tdLoseAt） */
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
  const lose = tdLoseAt(s);
  const waves = s.lost >= lose && I.clearedAtEmpty >= 0 ? I.clearedAtEmpty : clearedWaves(s);
  return { over: s.over, stars: s.lost >= lose ? 0 : tdStars(s.lost), lost: s.lost, waves, total: s.level.waves.length, ticks: s.tick, goldEarned: s.goldEarned, kills: I.kills };
}

/** 状态指纹：测试里比较两次重放是否逐位一致 */
export function tdFingerprint(s: TdState): number {
  const I = inner(s);
  const parts: number[] = [s.tick, s.gold, s.goldEarned, s.vault, s.lost, s.wave, s.next, s.over ? 1 : 0, I.nextId, I.pend.length, I.spawns.length, I.cdTotal, ...I.rng.snapshot()];
  for (const e of s.enemies) parts.push(e.id, e.x, e.y, e.hp, e.carry, e.mode === 'in' ? 0 : e.mode === 'out' ? 1 : 2);
  for (const t of s.towers) {
    parts.push(t.id, t.level, t.tier ?? 0, t.cd, t.aim, t.branch.length);
    // 终极、先打只在换过、改过的塔上进指纹
    if (t.ult || t.prio) parts.push(-31, t.ult ? TD_ULTS.findIndex((u) => u.id === t.ult) : -1, t.prio ? TD_PRIOS.indexOf(t.prio) : -1, t.fired ?? -1);
  }
  for (const sl of s.slots) parts.push(sl.tower, sl.spent ?? 0, sl.wreck ?? -1);
  for (const w of s.walls) parts.push(w.id, w.hp);
  for (const b of s.blocks) parts.push(b.id, b.hp);
  for (const p of s.piles) parts.push(p.x, p.y, p.n, p.at);
  for (const b of s.barricades) parts.push(b.id, b.x, b.y, b.hp, b.until);
  for (const tr of I.traps) parts.push(tr.fired ? 1 : 0, tr.rearm);
  const h = s.hero;
  parts.push(h.x, h.y, h.hp, h.respawn, h.cd, h.kegReady, h.barricadeReady ?? 0);
  // 锚钩只在有锚钩的局里进指纹
  if (h.hookReady !== undefined) parts.push(h.hookReady);
  // 航海士只在带了航海士的局里进指纹
  if (h.kind) parts.push(-23, h.flag?.x ?? -1, h.flag?.y ?? -1, h.flag?.until ?? 0, h.reward?.x ?? -1, h.reward?.y ?? -1, h.reward?.until ?? 0);
  for (const [id, until] of [...I.jam].sort((a, b) => a[0] - b[0])) parts.push(id, until);
  parts.push(I.skilled.size);
  // 章末机制只在有的局里进指纹
  if (s.sluice) parts.push(s.sluice.left, ...s.sluice.shut);
  if (s.battery) parts.push(s.battery.ready);
  if (s.fleet) parts.push(s.fleet.ready, ...(s.fleet.sail ? [s.fleet.sail.p0, s.fleet.sail.t0, s.fleet.sail.next] : [-1]));
  if (s.drawbridge) parts.push(-25, s.drawbridge.down, s.drawbridge.ready);
  // 关内事件只在有的局里进指纹
  if (s.happen) {
    parts.push(-22, ...s.happen.dare);
    for (const a of s.happen.at) parts.push(a.wave, a.kind === 'bounty' ? 0 : a.kind === 'rain' ? 1 : 2);
  }
  if (s.drift) {
    parts.push(s.drift.chase);
    for (const c of s.drift.crates) parts.push(c.id, c.until);
  }
  // 水手营只在造了营的局里进指纹
  if (s.camps) parts.push(-24, ...campPrint(s));
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
