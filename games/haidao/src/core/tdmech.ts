/**
 * 守岛章末机制（DESIGN 10.6d）：每章最后两关给玩家多一件工具，不用就和没有一样——
 * 漂流补给箱（第一章）、潮汐水闸（第二章）、岸防老炮（第三章）、友军巡航船（第四章）。只由关卡字段打开，没写的关一律不建、遇到操作忽略。
 */
import { TD2_BATTERY, TD2_CRATE, TD2_DRAWBRIDGE, TD2_ENEMIES, TD2_FLEET } from '../content/td2units.ts';
import { inGrid } from './grid.ts';
import { tideOpenAt } from './tdquery.ts';
import { HIT_KEG, addGold, d2, inner, isAir, waveGold } from './tdstate.ts';
import type { TdState } from './tdstate.ts';
import { BEACH, ISLAND, UNIT } from './types.ts';
import type { TdEnemy, TdEvent } from './tdtypes.ts';

/** 开局时按关卡字段建好章末机制的状态（createTd 最后调） */
export function initMech(s: TdState): void {
  const lv = s.level;
  if (lv.sluice && lv.tide && lv.tideOpen) s.sluice = { left: lv.sluice, shut: [] };
  if (lv.battery) s.battery = { x: lv.battery.x, y: lv.battery.y, ready: 0 };
  if (lv.crates?.length) s.drift = { crates: [], chase: -1 };
  if (lv.fleet) s.fleet = { ready: 0, sail: null };
  if (lv.drawbridge) s.drawbridge = { down: 0, ready: 0 };
}

/** 吊桥：在两座吊桥之间切换哪座放下（另一座收起、那条路断），冷却 TD2_DRAWBRIDGE.cd 拍，开局能用 */
export function toggleDrawbridge(s: TdState, ev: TdEvent[]): void {
  const db = s.drawbridge;
  if (!db || s.tick < db.ready) return;
  db.down = db.down === 0 ? 1 : 0;
  db.ready = s.tick + TD2_DRAWBRIDGE.cd;
  inner(s).ver++;
  ev.push({ type: 'drawbridge', down: db.down, ready: db.ready });
}

/** 第 w 波开打：这一波写了补给箱就在沙滩上漂来一个（startWave 调） */
export function driftCrates(s: TdState, ev: TdEvent[], w: number): void {
  const d = s.drift;
  if (!d) return;
  for (const c of s.level.crates ?? []) {
    if (c.wave !== w) continue;
    const box = { id: inner(s).nextId++, x: c.x * UNIT + 50, y: c.y * UNIT + 50, until: s.tick + TD2_CRATE.ticks, wave: w };
    d.crates.push(box);
    ev.push({ type: 'crate', what: 'drift', id: box.id, x: box.x, y: box.y, until: box.until, gold: 0 });
  }
}

/** 叫英雄去捡：走过去，不改他的守点（捡到或箱子漂走后回守点）；倒下了、箱子不在了不理 */
export function fetchCrate(s: TdState, id: number): void {
  const d = s.drift;
  const box = d?.crates.find((c) => c.id === id);
  if (!d || !box || s.hero.respawn >= 0) return;
  d.chase = id;
  s.hero.goal = { x: box.x, y: box.y };
  s.hero.clear = -1;
  inner(s).heroAuto = false;
}

/** 玩家另外指挥了英雄（走位、清障）：不再惦记箱子 */
export function forgetFetch(s: TdState): void {
  if (s.drift) s.drift.chase = -1;
}

/** 每拍（英雄走完之后）：英雄够得着的箱子捡起来，到时间的漂走；被叫去捡的那个没了就让英雄回守点 */
export function stepCrates(s: TdState, ev: TdEvent[]): void {
  const d = s.drift;
  if (!d || d.crates.length === 0) return;
  const h = s.hero;
  const keep: typeof d.crates = [];
  for (const c of d.crates) {
    if (h.respawn < 0 && d2(h.x, h.y, c.x, c.y) <= TD2_CRATE.pickR * TD2_CRATE.pickR) {
      const gold = Math.max(TD2_CRATE.minGold, Math.floor((waveGold(s.level, c.wave) * TD2_CRATE.goldPct) / 100));
      addGold(s, gold);
      h.kegReady = Math.min(h.kegReady, s.tick);
      h.barricadeReady = Math.min(h.barricadeReady ?? 0, s.tick);
      if (h.hookReady !== undefined) h.hookReady = Math.min(h.hookReady, s.tick);
      ev.push({ type: 'crate', what: 'pick', id: c.id, x: c.x, y: c.y, until: c.until, gold });
    } else if (s.tick >= c.until) {
      ev.push({ type: 'crate', what: 'gone', id: c.id, x: c.x, y: c.y, until: c.until, gold: 0 });
    } else {
      keep.push(c);
      continue;
    }
    if (d.chase === c.id) {
      d.chase = -1;
      h.goal = h.post ? { ...h.post } : null;
      inner(s).heroAuto = true;
    }
  }
  d.crates = keep;
  // 叫去捡的英雄停下了却没捡到（走不到、被别的事拉走）：不再惦记它，交回守点逻辑
  if (d.chase >= 0 && !h.goal) d.chase = -1;
}

/**
 * 老炮往 (x, y) 打一发：冷却好了、落点在格子里才打；1 秒后按炸药桶同一套爆炸结算（爆破、雾里照打、炸障碍不炸自己人），
 * 伤害由 td.ts 按这一关的平均敌人血量算好传进来
 */
export function fireBattery(s: TdState, ev: TdEvent[], x: number, y: number, dmg: number): void {
  const b = s.battery;
  if (!b || s.tick < b.ready || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const tx = Math.round(x);
  const ty = Math.round(y);
  if (!inGrid(s.ext, Math.floor(tx / UNIT), Math.floor(ty / UNIT))) return;
  const t1 = s.tick + TD2_BATTERY.delay;
  b.ready = s.tick + TD2_BATTERY.cd;
  inner(s).pend.push({ t: t1, kind: 'heroKeg', id: -1, dmg, x: tx, y: ty, r: TD2_BATTERY.r, hit: HIT_KEG, slowPct: 0, slowTicks: 0, burnDps: 0, burnTicks: 0, pull: 0 });
  ev.push({ type: 'battery', x0: b.x * UNIT + 50, y0: b.y * UNIT + 50, x1: tx, y1: ty, t1, ready: b.ready });
}

/**
 * 现在按水闸会怎样：'shut' 关上下一波（s.wave）的落潮路，'open' 把已经关上的重新打开（退回次数），null 按了没用
 * （没有水闸、下一波本来就涨潮、次数用完、没有下一波）。界面的按钮和规则共用这一个判断。
 */
export function tdSluiceCan(s: TdState): 'shut' | 'open' | null {
  const sl = s.sluice;
  if (!sl || s.wave >= s.level.waves.length) return null;
  if (sl.shut.includes(s.wave)) return 'open';
  return sl.left > 0 && tideOpenAt(s.level, s.wave) ? 'shut' : null;
}

export function toggleSluice(s: TdState, ev: TdEvent[]): void {
  const sl = s.sluice;
  const can = tdSluiceCan(s);
  if (!sl || !can) return;
  if (can === 'shut') {
    sl.shut.push(s.wave);
    sl.left--;
  } else {
    sl.shut = sl.shut.filter((w) => w !== s.wave);
    sl.left++;
  }
  ev.push({ type: 'sluice', wave: s.wave, shut: can === 'shut', left: sl.left });
}

// ------------------------------------------------------------ 友军巡航船

/**
 * 船走的一圈：格子外 1.5 格的海上连成的方框（单位），左上角起顺时针，一边长 RING_SIDE。
 * 登陆点（炮艇、海盗王停的地方）在沙滩第 1 排，离这圈 3 格，船的射程（TD2_FLEET.r）够得着；岛里面够不着
 */
const RING_LO = -150;
const RING_SIDE = (ISLAND + 2 * BEACH + 3) * UNIT;
const RING = 4 * RING_SIDE;

/** 一圈上的位置 p（0 ≤ p < RING）对应的点 */
export function ringPoint(p: number): { x: number; y: number } {
  const q = ((p % RING) + RING) % RING;
  const side = Math.floor(q / RING_SIDE);
  const u = q - side * RING_SIDE;
  const hi = RING_LO + RING_SIDE;
  if (side === 0) return { x: RING_LO + u, y: RING_LO };
  if (side === 1) return { x: hi, y: RING_LO + u };
  if (side === 2) return { x: hi - u, y: hi };
  return { x: RING_LO, y: hi - u };
}

/** 离 (x, y) 最近的一圈上的位置：投影到四条边上挑最近的（同样近取 p 小的） */
function ringNear(x: number, y: number): number {
  const hi = RING_LO + RING_SIDE;
  const clamp = (v: number): number => Math.max(RING_LO, Math.min(hi, v));
  const cands = [clamp(x) - RING_LO, RING_SIDE + clamp(y) - RING_LO, 2 * RING_SIDE + hi - clamp(x), 3 * RING_SIDE + hi - clamp(y)];
  let best = 0;
  let bd = Infinity;
  for (const p of cands) {
    const q = ringPoint(p);
    const d = d2(q.x, q.y, x, y);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

/** 船在 tick 拍的位置：从 p0 起顺时针开半圈，匀速（整数） */
export function fleetAt(sail: { p0: number; t0: number }, tick: number): { x: number; y: number } {
  const dt = Math.max(0, Math.min(TD2_FLEET.ticks, tick - sail.t0));
  return ringPoint(sail.p0 + Math.floor((2 * RING_SIDE * dt) / TD2_FLEET.ticks));
}

/** 海上的敌人（炮艇、海盗王）：船先冲着它们去 */
const atSea = (e: TdEnemy): boolean => !!TD2_ENEMIES[e.kind].shell && (e.mode === 'in' || e.mode === 'out');

/**
 * 叫船：冷却好了、船不在海上才来。从一圈上离海上敌人最近的地方进场（有好几艘挑编号最小的），没有海上敌人就从离宝藏箱最近的地方进场
 */
export function callFleet(s: TdState, ev: TdEvent[]): void {
  const f = s.fleet;
  if (!f || f.sail || s.tick < f.ready) return;
  const sea = s.enemies.filter(atSea);
  const aim = sea.length ? sea.reduce((a, b) => (b.id < a.id ? b : a)) : null;
  const tr = s.treasures[0];
  const p0 = aim ? ringNear(aim.x, aim.y) : tr ? ringNear(tr.x * UNIT + 50, tr.y * UNIT + 50) : 0;
  f.sail = { p0, t0: s.tick, until: s.tick + TD2_FLEET.ticks, next: s.tick + TD2_FLEET.reload };
  f.ready = s.tick + TD2_FLEET.cd;
  const at = ringPoint(p0);
  ev.push({ type: 'fleet', what: 'come', x: at.x, y: at.y, x1: at.x, y1: at.y, t1: s.tick, ready: f.ready });
}

/** 每拍：船在海上就往前开，装填好了朝 r 内最近的地上或海上敌人开一炮（落点爆炸由 td.ts 的 pend 结算），到点开走 */
export function stepFleet(s: TdState, ev: TdEvent[], dmg: number): void {
  const sail = s.fleet?.sail;
  if (!sail) return;
  const at = fleetAt(sail, s.tick);
  if (s.tick >= sail.until) {
    s.fleet!.sail = null;
    ev.push({ type: 'fleet', what: 'go', x: at.x, y: at.y, x1: at.x, y1: at.y, t1: s.tick, ready: s.fleet!.ready });
    return;
  }
  if (s.tick < sail.next) return;
  const r2 = TD2_FLEET.r * TD2_FLEET.r;
  let best: TdEnemy | undefined;
  let bd = r2 + 1;
  for (const e of s.enemies) {
    if ((e.mode !== 'in' && e.mode !== 'out') || isAir(e.kind)) continue;
    const d = d2(e.x, e.y, at.x, at.y);
    if (d < bd || (d === bd && best && e.id < best.id)) {
      bd = d;
      best = e;
    }
  }
  if (!best) return;
  sail.next = s.tick + TD2_FLEET.reload;
  const t1 = s.tick + TD2_FLEET.delay;
  inner(s).pend.push({ t: t1, kind: 'splash', id: -1, dmg, x: best.x, y: best.y, r: TD2_FLEET.splash, hit: HIT_KEG, slowPct: 0, slowTicks: 0, burnDps: 0, burnTicks: 0, pull: 0 });
  ev.push({ type: 'fleet', what: 'shot', x: at.x, y: at.y, x1: best.x, y1: best.y, t1, ready: s.fleet!.ready });
}
