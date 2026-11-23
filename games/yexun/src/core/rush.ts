/**
 * 首领连战（docs/design-play.md 2.5）的纯规则：配装点数和合法性、三套推荐配装、按种子出路线图、战果。
 * 只用 sfc32 的分流，同种子同图逐位相同（每日同一天全服同图，录像只存种子和选择就能重放）。
 * 每拍的推进（上场、过关、选卡、驿站、换图、软限时）在 core/step.ts。
 */
import { SCHOOLS, type SchoolId } from '../content/guide.ts';
import type { CharacterId } from '../content/meta.ts';
import { MAP_IDS, type MapId } from '../content/maps.ts';
import { CHARACTER_POOLS, mainSchools, POOL_START } from '../content/pools.ts';
import {
  AFFIX_IDS,
  RUSH,
  RUSH_EVENT_IDS,
  RUSH_FOE_IDS,
  RUSH_FOES,
  RUSH_TOTAL,
  RUSH_WEAPON_COST,
  type AffixId,
  type RelicId,
  type RushEventId,
  type RushFoeId,
  type RushStopKind,
} from '../content/rush.ts';
import { PASSIVES, type PassiveId, type WeaponId } from '../content/weapons.ts';
import { Rng } from './rng.ts';
import type { Choice, World } from './state.ts';

// ───────────────────────── 配装 ─────────────────────────

export interface RushLoadout {
  character: CharacterId;
  /** 起手法器（3 级） */
  start: WeaponId;
  /** 第二件法器（1 级），可不带 */
  second?: WeaponId;
  /** 心法：本角色的主修流派之一 */
  xinfa: SchoolId;
  /** 被动最多 2 件，每件 1–2 级 */
  passives: readonly { id: PassiveId; level: 1 | 2 }[];
}

/** 起手法器的等级、第二件的等级、最多几件被动 */
export const LOADOUT = { startLevel: 3, secondLevel: 1, passives: 2, passiveMax: 2 } as const;

/** 能当起手 / 第二件的法器：角色起手件 + 心法流派单子上前三件（只要角色池里有的） */
export function loadoutWeapons(c: CharacterId, xinfa: SchoolId): readonly WeaponId[] {
  const pool = CHARACTER_POOLS[c].weapons;
  const out: WeaponId[] = [POOL_START[c]];
  for (const id of SCHOOLS[xinfa].weapons.filter((x) => pool.includes(x)).slice(0, 3)) if (!out.includes(id)) out.push(id);
  return out;
}

/** 能带的被动：角色池里的，去掉连战里没用的灵芝（只涨经验，连战等级固定） */
export function loadoutPassives(c: CharacterId): readonly PassiveId[] {
  return CHARACTER_POOLS[c].passives.filter((p) => p !== 'lingzhi');
}

function weaponCost(c: CharacterId, id: WeaponId): number {
  return id === POOL_START[c] ? RUSH_WEAPON_COST.start : (RUSH_WEAPON_COST.strong[id] ?? RUSH_WEAPON_COST.other);
}

/** 配装用了几点（不判合法） */
export function loadoutCost(l: RushLoadout): number {
  let n = weaponCost(l.character, l.start);
  if (l.second) n += RUSH_WEAPON_COST.second;
  for (const p of l.passives) n += p.level * RUSH_WEAPON_COST.passiveLevel;
  return n;
}

/** 角色池、心法、法器候选、被动、点数都合法（角色解没解锁由调用方另判） */
export function loadoutOk(l: RushLoadout): boolean {
  if (!(l.character in CHARACTER_POOLS)) return false;
  if (!mainSchools(l.character).includes(l.xinfa)) return false;
  const ws = loadoutWeapons(l.character, l.xinfa);
  if (!ws.includes(l.start)) return false;
  if (l.second !== undefined && (l.second === l.start || !ws.includes(l.second))) return false;
  if (l.passives.length > LOADOUT.passives) return false;
  const ps = loadoutPassives(l.character);
  const seen = new Set<PassiveId>();
  for (const p of l.passives) {
    if (seen.has(p.id) || !ps.includes(p.id)) return false;
    if (p.level !== 1 && p.level !== 2) return false;
    if (p.level > PASSIVES[p.id].max) return false;
    seen.add(p.id);
  }
  return loadoutCost(l) <= RUSH.budget;
}

/** 剩下的配装点（每点换一次重抽） */
export function loadoutSpare(l: RushLoadout): number {
  return Math.max(0, RUSH.budget - loadoutCost(l));
}

/**
 * 三套一键推荐（从角色池和心法表推出来）：
 * 稳 = 起手件 + 第一主修心法 + 防身被动 2 级；猛 = 另一主修的头号件 + 攻击被动 2 级；双 = 起手件 + 第二件 + 1 级被动
 */
export function rushPresets(c: CharacterId): readonly [RushLoadout, RushLoadout, RushLoadout] {
  const [s0, s1 = s0] = mainSchools(c) as readonly SchoolId[] as [SchoolId, SchoolId?];
  const start = POOL_START[c];
  const ps = loadoutPassives(c);
  const firstOf = (want: readonly PassiveId[], school: SchoolId): PassiveId => want.find((p) => ps.includes(p)) ?? SCHOOLS[school].passives.find((p) => ps.includes(p)) ?? ps[0]!;
  // 起手件所在的主修当「稳」的心法，另一主修给「猛」
  const own = mainSchools(c).find((s) => SCHOOLS[s].weapons.includes(start)) ?? s0;
  const other = own === s0 ? s1! : s0;
  const guard = firstOf(['xiantao', 'daopao'], own);
  // 稳：防身被动 2 级 + 攻击被动 1 级（每关有软限时，只加血打不动）
  const steady: RushLoadout = { character: c, start, xinfa: own, passives: [{ id: guard, level: 2 }] };
  if (ps.includes('zhusha') && guard !== 'zhusha') steady.passives = [{ id: guard, level: 2 }, { id: 'zhusha', level: 1 }];
  const otherWs = loadoutWeapons(c, other).filter((w) => w !== start);
  const strong: RushLoadout = { character: c, start: otherWs[0] ?? start, xinfa: other, passives: [{ id: firstOf(['zhusha'], other), level: 1 }] };
  const ownWs = loadoutWeapons(c, own).filter((w) => w !== start);
  const dual: RushLoadout = { character: c, start, xinfa: own, passives: [{ id: firstOf([], own), level: 2 }] };
  if (ownWs[0]) dual.second = ownWs[0];
  return [steady, strong, dual];
}

// ───────────────────────── 路线图 ─────────────────────────

/** 路线图一列里的一条路：打哪张图、普通还是精英、带几条词缀、打之前路过哪种驿站 */
export interface RushOption {
  map: MapId;
  elite: boolean;
  affixes: readonly AffixId[];
  stop: RushStopKind | null;
  /** stop 是事件时是哪个 */
  event?: RushEventId;
}

export interface RushRoute {
  /** 10 只首领的先后 */
  foes: readonly RushFoeId[];
  /** 每列 2–3 条路 */
  layers: readonly (readonly RushOption[])[];
  /** 终局那一关的图 */
  finalMap: MapId;
}

/** 整张路线图：开局就生成、只看种子 */
export function rushRoute(seed: number): RushRoute {
  const rng = new Rng(seed, 'rushroute');
  const bag = [...RUSH_FOE_IDS];
  const foes: RushFoeId[] = [];
  for (let k = 0; k < RUSH.stages; k++) {
    const pool = k === 0 ? bag.filter((id) => !RUSH_FOES[id].late) : bag;
    const id = pool[rng.int(pool.length)]!;
    foes.push(bag.splice(bag.indexOf(id), 1)[0]!);
  }
  const layers: RushOption[][] = [];
  for (let k = 0; k < RUSH.stages; k++) {
    const n = k === 0 ? RUSH.firstPaths : RUSH.paths;
    const last = k === RUSH.stages - 1;
    const home = RUSH_FOES[foes[k]!].home;
    const used: MapId[] = [];
    const col: RushOption[] = [];
    for (let p = 0; p < n; p++) {
      let map: MapId;
      if (!used.includes(home) && rng.chance(RUSH.homeMap)) map = home;
      else {
        const left = MAP_IDS.filter((m) => !used.includes(m));
        map = left[rng.int(left.length)]!;
      }
      used.push(map);
      // 第一条路一定是普通；终局前那列都是普通（每条都带补给）
      const elite = p > 0 && !last && rng.chance(0.4);
      const nAffix = RUSH.affixes[k]! + (elite ? RUSH.eliteAffix : 0);
      const ab = [...AFFIX_IDS];
      const affixes: AffixId[] = [];
      for (let a = 0; a < nAffix; a++) affixes.push(ab.splice(rng.int(ab.length), 1)[0]!);
      let stop: RushStopKind | null = null;
      if (last) stop = rng.chance(0.5) ? 'shop' : 'rest';
      else if (!elite) {
        const r = rng.int(4);
        stop = r === 0 ? 'shop' : r === 1 ? 'rest' : r === 2 ? 'event' : null;
      }
      const opt: RushOption = { map, elite, affixes, stop };
      if (stop === 'event') opt.event = RUSH_EVENT_IDS[rng.int(RUSH_EVENT_IDS.length)]!;
      col.push(opt);
    }
    layers.push(col);
  }
  // 补够商店和休整：从前往后找不带驿站的普通路改掉（先商店后休整）
  const count = (s: RushStopKind): number => layers.reduce((a, col) => a + col.filter((o) => o.stop === s).length, 0);
  for (const want of ['shop', 'rest'] as const) {
    const min = want === 'shop' ? RUSH.minShops : RUSH.minRests;
    while (count(want) < min) {
      const free: RushOption[] = [];
      for (const col of layers) for (const o of col) if (!o.elite && (o.stop === null || o.stop === 'event')) free.push(o);
      if (free.length === 0) break;
      const o = free[rng.int(free.length)]!;
      o.stop = want;
      delete o.event;
    }
  }
  return { foes, layers, finalMap: 'snow' };
}

// ───────────────────────── 驿站 ─────────────────────────

/** 商店的一格货：卡（带稀有度）、符印、回血、重抽 +1、放逐 +1 */
export interface RushGood {
  kind: 'card' | 'relic' | 'heal' | 'reroll' | 'ban';
  card?: Choice;
  relic?: RelicId;
  price: number;
  sold: boolean;
}

/** 事件的一个选项：option 是 RUSH_EVENTS[event].options 的下标；老货郎的换法写在 trade（from 换成 to，同级） */
export interface RushEventChoice {
  event: RushEventId;
  option: number;
  trade?: { from: WeaponId; to: WeaponId };
}

// ───────────────────────── 战果 ─────────────────────────

/** 一局连战的战果（结算、交榜、分享卡、实盘结回都按它） */
export interface RushResult {
  /** 清完几关（0–11，第 11 关 = 夜漏君；双煞一关算 1，和首领只数无关）：进度条、分数、实盘结回、中途离开都按它 */
  down: number;
  total: typeof RUSH_TOTAL;
  /** 打倒了夜漏君（天亮） */
  cleared: boolean;
  /** 局内拍数（选卡、路线、驿站停拍不算） */
  ticks: number;
  /** 正在打的那一关打掉了几成（0–1） */
  progress: number;
  /** 带了几条咒 */
  hexes: number;
}

export function rushResult(w: World): RushResult | null {
  if (!w.rush) return null;
  let hp = 0;
  let max = 0;
  for (let i = 0; i < w.eRush.length; i++) {
    if (!w.eRush[i] || !w.eAlive[i]) continue;
    hp += Math.max(0, w.eHp[i]!);
    max += w.eHpMax[i]!;
  }
  const cleared = w.rushEnd >= 0;
  return { down: w.rushDown, total: RUSH_TOTAL, cleared, ticks: cleared ? w.rushEnd : w.tick, progress: max > 0 ? 1 - hp / max : 0, hexes: w.setup.rushHexes?.length ?? 0 };
}
