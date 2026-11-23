/**
 * 寻宝航线（每日航线）的规则：契约在 maptypes.ts，内容在 content/maps.ts。
 * 一天一条航线（种子只由北京日期算），全服同一条航线、同一支船队，所以每日榜可比；一局只看局内的决定。
 * 每站一场小登陆战，按 MAP_STOP_TICKS 截断结算；兵的损耗和旗舰能量跨站累计。
 * 全部纯函数、整数；每个函数返回新状态，不改传入的状态。
 */
import { BUILDINGS, DEFENSE_KINDS, TROOPS } from '../content/index.ts';
import { MAP_BOSSES, MAP_FLEETS, MAP_ISLAND_BY_ID, MAP_LAYER_POOL, MAP_REEF_PCT } from '../content/maps.ts';
import { battleResult, createBattle, stepBattle } from './battle.ts';
import { MAP_ENERGY_MAX, MAP_LAYERS, MAP_STOP_TICKS } from './maptypes.ts';
import type { MapBoat, MapFinal, MapIslandDef, MapNode, MapRoute, MapRules, MapState, MapStopLog, ReefPick } from './maptypes.ts';
import { Rng, hash32 } from './rng.ts';
import { ISLAND, RULES_VERSION } from './types.ts';
import type { ArmySetup, BattleAction, BattleResult, BattleSetup, BattleState, Placed } from './types.ts';

/** 开局旗舰能量 */
const MAP_ENERGY_START = 8;
/** 每打完一站回多少能量 */
const MAP_ENERGY_REGEN = 2;
/** 补给礁选"补能量"加多少 */
const MAP_REEF_ENERGY = 8;
/** 休整、补兵恢复缺员的百分比（向下取整） */
const MAP_HEAL_PCT = 50;
/** 每颗星的宝分加成 */
const MAP_STAR_BONUS = 10;
/** 船队覆灭时宝分按百分之几计 */
const MAP_WIPED_PCT = 70;
/** 终局星的宝分阈值 T1 / T2 / T3（tools/map-sim.ts 配平：普通机器人平均约 1.6 星） */
export const MAP_STAR_PTS: readonly [number, number, number] = [90, 150, 200];

const clampEnergy = (e: number): number => Math.max(0, Math.min(MAP_ENERGY_MAX, Math.floor(e)));

export function mapIsland(id: string): MapIslandDef | undefined {
  return MAP_ISLAND_BY_ID[id];
}

// ---------------------------------------------------------------- 航线

/** 北京日期 'YYYY-MM-DD' → 当天航线 */
export function routeOf(day: string): MapRoute {
  const seed = hash32(`map.day:${day}`, 0);
  const pick = new Rng(seed, 'map.route');
  const mir = new Rng(seed, 'map.mirror');
  const used = new Set<string>();
  const layers: MapNode[][] = [];
  for (let layer = 0; layer < MAP_LAYERS - 1; layer++) {
    const reefAt = layer > 0 && pick.int(100) < MAP_REEF_PCT ? pick.int(2) : -1;
    const pool = (MAP_LAYER_POOL[layer] ?? []).filter((id) => !used.has(id));
    const nodes: MapNode[] = [];
    let style = '';
    for (let node = 0; node < 2; node++) {
      if (node === reefAt) {
        nodes.push({ kind: 'reef' });
        continue;
      }
      // 同一层两座岛风格不同；池子被用光的极端情况退回不挑风格
      let cand = pool.filter((id) => !used.has(id) && MAP_ISLAND_BY_ID[id]?.style !== style);
      if (cand.length === 0) cand = pool.filter((id) => !used.has(id));
      const id = cand[pick.int(cand.length)]!;
      used.add(id);
      style = MAP_ISLAND_BY_ID[id]?.style ?? '';
      nodes.push({ kind: 'island', island: id, mirror: mir.int(2) === 1 });
    }
    layers.push(nodes);
  }
  const boss = MAP_BOSSES[pick.int(MAP_BOSSES.length)]!;
  layers.push([{ kind: 'island', island: boss.id, mirror: mir.int(2) === 1 }]);
  const fl = MAP_FLEETS[new Rng(seed, 'map.fleet').int(MAP_FLEETS.length)]!;
  const fleet: MapBoat[] = fl.crew.map((troop) => {
    const cap = troop === 'captain' ? 1 : Math.max(1, Math.floor(fl.boatCap / TROOPS[troop].housing));
    return { troop, level: fl.level, cap, alive: cap };
  });
  return { day, seed, layers, fleet, skills: fl.skills.map((s) => ({ ...s })) };
}

export function startMap(route: MapRoute): MapState {
  return { route, layer: 0, fleet: route.fleet.map((b) => ({ ...b })), energy: MAP_ENERGY_START, pts: 0, log: [], over: false };
}

/** 当前层第 node 个节点；over 或越界给 undefined */
function nodeAt(s: MapState, node: number): MapNode | undefined {
  if (s.over) return undefined;
  return s.route.layers[s.layer]?.[node];
}

/** 岛节点的布局：镜像时左右翻（坐标仍在岛内、不重叠） */
export function nodeLayout(n: MapNode): Placed[] {
  if (n.kind !== 'island') return [];
  const def = MAP_ISLAND_BY_ID[n.island];
  if (!def) return [];
  return def.layout.map((b) => ({ ...b, x: n.mirror ? ISLAND - b.x - BUILDINGS[b.kind].size : b.x }));
}

// ---------------------------------------------------------------- 整备和战斗

/** 实际休整哪条船：-1 不休整；休整后没有能出战的船时不许休整（按 -1 算） */
export function restOf(s: MapState, rest: number): number {
  if (rest < 0 || rest >= s.fleet.length) return -1;
  const others = s.fleet.some((b, i) => i !== rest && b.alive > 0);
  return others ? rest : -1;
}

/** 这一站出战的船（fleet 下标），顺序 = ArmySetup.boats 的下标 */
function stopBoats(s: MapState, rest: number): number[] {
  const r = restOf(s, rest);
  const out: number[] = [];
  s.fleet.forEach((b, i) => {
    if (i !== r && b.alive > 0) out.push(i);
  });
  return out;
}

function stopArmy(s: MapState, rest: number): ArmySetup {
  return {
    boats: stopBoats(s, rest).map((i) => {
      const b = s.fleet[i]!;
      return { troop: b.troop, count: b.alive, level: b.level };
    }),
    skills: s.route.skills.map((k) => ({ ...k })),
    energy: clampEnergy(s.energy),
  };
}

export function stopSetup(s: MapState, node: number, rest: number): BattleSetup {
  const n = nodeAt(s, node);
  const layout = n ? nodeLayout(n) : [];
  return { layout, army: stopArmy(s, rest), seed: hash32(`map.battle:${s.layer}:${node}`, s.route.seed), rules: RULES_VERSION };
}

/**
 * 每条出战船（ArmySetup.boats 下标）还剩几个人：登陆过的按 land 事件记下的兵数活着的；没登陆的船人都还在。
 * lands[boat] = 这条船 land 事件的 units（画面层在 stepBattle 的事件里收集）。
 */
export function aliveByBoat(state: BattleState, army: ArmySetup, lands: ReadonlyArray<readonly number[] | undefined>): number[] {
  const dead = new Set<number>();
  for (const u of state.units) if (u.mode === 'dead') dead.add(u.id);
  return army.boats.map((b, i) => {
    const ids = lands[i];
    if (!state.landed[i] || !ids) return b.count;
    return ids.filter((id) => !dead.has(id)).length;
  });
}

/** 出战船的存活数 → 按 fleet 下标的 survivors（finishStop 的参数）；休整、没出战的船填原值 */
export function fleetSurvivors(s: MapState, rest: number, alive: readonly number[]): number[] {
  const out = s.fleet.map((b) => b.alive);
  stopBoats(s, rest).forEach((fi, k) => {
    out[fi] = Math.max(0, Math.min(s.fleet[fi]!.alive, Math.floor(alive[k] ?? 0)));
  });
  return out;
}

interface StopRun {
  result: BattleResult;
  /** 按出战船（ArmySetup.boats）下标；用 fleetSurvivors 换成 fleet 下标再传给 finishStop */
  survivors: number[];
  /** 战斗结束时剩的旗舰能量（finishStop 的 energyLeft） */
  energyLeft: number;
  /** 实际打了多少拍（≤ MAP_STOP_TICKS） */
  ticks: number;
}

/** 按 MAP_STOP_TICKS 截断跑一站（机器人、模拟器、测试用；画面层自己推 BattleScene，口径相同）。survivors 按出战船（ArmySetup.boats）下标 */
export function runStop(setup: BattleSetup, actions: BattleAction[]): StopRun {
  const s = createBattle(setup);
  const sorted = actions.map((a, i) => ({ a, i })).sort((p, q) => p.a.t - q.a.t || p.i - q.i);
  const lands: number[][] = [];
  let k = 0;
  while (!s.over && s.tick < MAP_STOP_TICKS) {
    const now: BattleAction[] = [];
    while (k < sorted.length && sorted[k]!.a.t <= s.tick) now.push(sorted[k++]!.a);
    for (const e of stepBattle(s, now)) if (e.type === 'land') lands[e.boat] = e.units;
  }
  return { result: battleResult(s), survivors: aliveByBoat(s, setup.army, lands), energyLeft: s.energy, ticks: s.tick };
}

/** 一条船恢复缺员的 MAP_HEAL_PCT% */
const heal = (b: MapBoat): MapBoat => ({ ...b, alive: Math.min(b.cap, b.alive + Math.floor(((b.cap - b.alive) * MAP_HEAL_PCT) / 100)) });

const wiped = (fleet: MapBoat[]): boolean => fleet.every((b) => b.alive <= 0);

/**
 * 战斗结束写回。survivors 按 fleet 下标（休整船填原值，fleetSurvivors 可以把出战船下标的存活数换过来）；
 * energyLeft = 战斗结束时 BattleState.energy（契约之外的加法参数；不传按没花能量算）。
 */
export function finishStop(s: MapState, node: number, rest: number, result: BattleResult, survivors: number[], energyLeft?: number): MapState {
  const n = nodeAt(s, node);
  if (n?.kind !== 'island') return s;
  const def = MAP_ISLAND_BY_ID[n.island];
  if (!def) return s;
  const r = restOf(s, rest);
  const sailing = new Set(stopBoats(s, rest));
  let lost = 0;
  const fleet = s.fleet.map((b, i) => {
    if (i === r) return heal(b);
    if (!sailing.has(i)) return { ...b };
    const alive = Math.max(0, Math.min(b.alive, Math.floor(survivors[i] ?? b.alive)));
    lost += b.alive - alive;
    return { ...b, alive };
  });
  const pct = Math.max(0, Math.min(100, Math.floor(result.destroyedPct)));
  const stars = Math.max(0, Math.min(3, Math.floor(result.stars)));
  const gain = Math.floor((def.pts * pct) / 100) + stars * MAP_STAR_BONUS;
  const log: MapStopLog = { layer: s.layer, node, destroyedPct: pct, stars, gain, rested: r, lost };
  const left = energyLeft === undefined ? s.energy : energyLeft;
  const next: MapState = { ...s, fleet, energy: clampEnergy(left + MAP_ENERGY_REGEN), pts: s.pts + gain, log: [...s.log, log] };
  if (wiped(fleet)) return { ...next, over: true, end: 'wiped' };
  if (s.layer >= MAP_LAYERS - 1) return { ...next, over: true, end: 'clear' };
  return { ...next, layer: s.layer + 1 };
}

export function takeReef(s: MapState, node: number, pick: ReefPick): MapState {
  const n = nodeAt(s, node);
  if (n?.kind !== 'reef') return s;
  const fleet = pick === 'crew' ? s.fleet.map(heal) : s.fleet.map((b) => ({ ...b }));
  const energy = pick === 'energy' ? clampEnergy(s.energy + MAP_REEF_ENERGY) : s.energy;
  return { ...s, fleet, energy, layer: s.layer + 1, log: [...s.log, { layer: s.layer, node, gain: 0, reef: pick }] };
}

export function goHome(s: MapState): MapState {
  if (s.over) return s;
  return { ...s, over: true, end: 'home' };
}

export function mapFinal(s: MapState): MapFinal {
  const pts = s.end === 'wiped' ? Math.floor((s.pts * MAP_WIPED_PCT) / 100) : s.pts;
  let stars = 0;
  for (const t of MAP_STAR_PTS) if (pts >= t) stars++;
  return { pts, stars, score: pts };
}

export const MAP_RULES: MapRules = { routeOf, startMap, stopSetup, finishStop, takeReef, goHome, mapFinal };

// ---------------------------------------------------------------- 机器人（模拟器、测试用）

export type MapBotStyle = 'novice' | 'normal';

/** 航线上的一个决定 */
type MapMove = { kind: 'island'; node: number; rest: number } | { kind: 'reef'; node: number; pick: ReefPick } | { kind: 'home' };

/** 船队现有人数 / 满编人数（百分比） */
export function fleetPct(fleet: MapBoat[]): number {
  let cap = 0;
  let alive = 0;
  for (const b of fleet) {
    cap += b.cap * TROOPS[b.troop].housing;
    alive += b.alive * TROOPS[b.troop].housing;
  }
  return cap === 0 ? 0 : Math.floor((alive * 100) / cap);
}

/** 侦察能看到的防御强度（地雷看不见，不算）：每秒伤害加权，给普通机器人估岛 */
function seenDefense(def: MapIslandDef): number {
  let d = 0;
  for (const b of def.layout) {
    if (!DEFENSE_KINDS.has(b.kind) || b.kind === 'mine') continue;
    const lv = BUILDINGS[b.kind].levels[b.level - 1];
    d += Math.floor(((lv?.dmg ?? 0) * 20 * (b.kind === 'mortar' ? 2 : 1)) / (lv?.reload ?? 20));
  }
  return d;
}

/**
 * 机器人这一步怎么走（确定性：小白的随机用航线种子 + 层号分流）。
 * 小白：随机选节点、不休整、补给礁缺员多补兵否则补能量、不收航；
 * 普通：船队剩不到 30% 就收航；有补给礁且缺员 ≥ 40% 去补兵；否则按"宝分 ÷ 看得见的防御"挑岛，休整缺员最多的船。
 */
export function mapBotMove(s: MapState, style: MapBotStyle): MapMove {
  const nodes = s.route.layers[s.layer] ?? [];
  const pct = fleetPct(s.fleet);
  const reefPick: ReefPick = pct < 70 ? 'crew' : 'energy';
  if (style === 'novice') {
    const node = new Rng(s.route.seed, `map.bot.${s.layer}`).int(nodes.length);
    const n = nodes[node];
    if (n?.kind === 'reef') return { kind: 'reef', node, pick: reefPick };
    return { kind: 'island', node, rest: -1 };
  }
  if (s.layer > 0 && pct < 30) return { kind: 'home' };
  const reef = nodes.findIndex((n) => n.kind === 'reef');
  if (reef >= 0 && pct <= 60) return { kind: 'reef', node: reef, pick: 'crew' };
  let best = -1;
  let bestScore = -1;
  nodes.forEach((n, i) => {
    if (n.kind !== 'island') return;
    const def = MAP_ISLAND_BY_ID[n.island];
    if (!def) return;
    const score = Math.floor((def.pts * 10_000) / (100 + seenDefense(def)));
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  if (best < 0) return { kind: 'reef', node: Math.max(0, reef), pick: reefPick };
  let rest = -1;
  let most = 0;
  s.fleet.forEach((b, i) => {
    const miss = (b.cap - b.alive) * TROOPS[b.troop].housing;
    if (miss > most) {
      most = miss;
      rest = i;
    }
  });
  return { kind: 'island', node: best, rest: restOf(s, rest) };
}
