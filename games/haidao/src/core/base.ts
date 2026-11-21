/** 基地函数：全部是纯函数，不改入参，返回新对象 */
import { BUILDINGS, HQ_LEVELS, SKILLS, TROOPS } from '../content/index.ts';
import { COSMETICS } from './run.ts';
import { ISLAND } from './types.ts';
import type { ArmySetup, BuildingKind, Placed, Profile, ResKind, Res, Result, SkillKind, TroopKind } from './types.ts';

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T>(error: string): Result<T> => ({ ok: false, error });

/** 没有船坞时的默认船数、每船人口 */
const BASE_BOATS = 2;
const BASE_BOAT_CAP = 6;

export function hqOf(p: Profile): Placed | undefined {
  return p.base.buildings.find((b) => b.kind === 'hq');
}

export function hqLevel(p: Profile): number {
  return hqOf(p)?.level ?? 1;
}

/** 玩家的岛扩了几圈：按布局里主寨的等级查 HQ_LEVELS.ext（基地、攻防快照、海盗来袭共用） */
export function islandExt(layout: readonly Placed[]): number {
  const hq = layout.find((b) => b.kind === 'hq')?.level ?? 1;
  return HQ_LEVELS[hq - 1]?.ext ?? 0;
}

export function totalStars(p: Profile): number {
  let n = 0;
  for (const k of Object.keys(p.stars)) n += p.stars[k] ?? 0;
  return n;
}

export function capacity(p: Profile): Res {
  return capacityOfBuildings(p.base.buildings);
}

/** 只凭摆出来的建筑算仓库容量（不必有整份存档；校验快照时用） */
export function capacityOfBuildings(buildings: readonly Placed[]): Res {
  const hq = buildings.find((b) => b.kind === 'hq');
  const base = hq ? (BUILDINGS.hq.levels[hq.level - 1]?.cap ?? 0) : 0;
  let gold = base;
  let wood = base;
  for (const b of buildings) {
    const cap = BUILDINGS[b.kind].levels[b.level - 1]?.cap ?? 0;
    if (b.kind === 'vault') gold += cap;
    else if (b.kind === 'woodyard') wood += cap;
  }
  return { gold, wood };
}

export function buildLimit(p: Profile, kind: BuildingKind): { have: number; max: number } {
  const have = p.base.buildings.filter((b) => b.kind === kind).length;
  const max = HQ_LEVELS[hqLevel(p) - 1]?.limits[kind] ?? 0;
  return { have, max };
}

export function canPlace(p: Profile, kind: BuildingKind, x: number, y: number, ignoreId?: number): boolean {
  const size = BUILDINGS[kind].size;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  const ext = islandExt(p.base.buildings);
  if (x < -ext || y < -ext || x + size > ISLAND + ext || y + size > ISLAND + ext) return false;
  for (const b of p.base.buildings) {
    if (b.id === ignoreId) continue;
    const s = BUILDINGS[b.kind].size;
    if (x < b.x + s && b.x < x + size && y < b.y + s && b.y < y + size) return false;
  }
  return true;
}

function pay(res: Res, cost: Res): string | null {
  if (res.gold < cost.gold) return 'no_gold';
  if (res.wood < cost.wood) return 'no_wood';
  return null;
}

function sub(res: Res, cost: Res): Res {
  return { gold: res.gold - cost.gold, wood: res.wood - cost.wood };
}

export function build(p: Profile, kind: BuildingKind, x: number, y: number): Result<Profile> {
  const def = BUILDINGS[kind];
  if (def.unlockHq > hqLevel(p)) return err('locked');
  if (COSMETICS.includes(`deco:${kind}`) && !(p.cosmetics ?? []).includes(`deco:${kind}`)) return err('locked');
  const lim = buildLimit(p, kind);
  if (lim.have >= lim.max) return err('limit');
  if (!canPlace(p, kind, x, y)) return err('blocked');
  const cost = def.levels[0]?.cost ?? { gold: 0, wood: 0 };
  const e = pay(p.res, cost);
  if (e) return err(e);
  const placed: Placed = { id: p.base.nextId, kind, level: 1, x, y };
  if (kind === 'goldmine' || kind === 'sawmill') placed.stored = 0;
  return ok({
    ...p,
    res: sub(p.res, cost),
    base: { buildings: [...p.base.buildings, placed], nextId: p.base.nextId + 1 },
  });
}

export function move(p: Profile, id: number, x: number, y: number): Result<Profile> {
  const b = p.base.buildings.find((q) => q.id === id);
  if (!b) return err('not_found');
  if (!canPlace(p, b.kind, x, y, id)) return err('blocked');
  return ok({ ...p, base: { ...p.base, buildings: p.base.buildings.map((q) => (q.id === id ? { ...q, x, y } : q)) } });
}

export function upgradeCost(kind: BuildingKind, level: number): Res | null {
  const def = BUILDINGS[kind];
  if (level >= def.maxLevel) return null;
  const c = def.levels[level]?.cost;
  return c ? { ...c } : null;
}

export function upgrade(p: Profile, id: number): Result<Profile> {
  const b = p.base.buildings.find((q) => q.id === id);
  if (!b) return err('not_found');
  const cost = upgradeCost(b.kind, b.level);
  if (!cost) return err('max');
  if (b.kind === 'hq') {
    const need = HQ_LEVELS[b.level]?.needStars ?? 0;
    if (totalStars(p) < need) return err('need_stars');
  } else if (b.level + 1 > hqLevel(p)) {
    return err('need_hq');
  }
  const e = pay(p.res, cost);
  if (e) return err(e);
  return ok({
    ...p,
    res: sub(p.res, cost),
    base: { ...p.base, buildings: p.base.buildings.map((q) => (q.id === id ? { ...q, level: q.level + 1 } : q)) },
  });
}

/** 产出建筑按每小时产量攒进 stored，到自身上限为止；stored 允许小数，免得频繁小步调用丢产量 */
export function produce(p: Profile, seconds: number): Profile {
  if (seconds <= 0) return p;
  return {
    ...p,
    base: {
      ...p.base,
      buildings: p.base.buildings.map((b) => {
        if (b.kind !== 'goldmine' && b.kind !== 'sawmill') return b;
        const lv = BUILDINGS[b.kind].levels[b.level - 1];
        if (!lv) return b;
        const cap = lv.cap ?? 0;
        const next = Math.min(cap, (b.stored ?? 0) + ((lv.rate ?? 0) * seconds) / 3600);
        return { ...b, stored: next };
      }),
    },
  };
}

export function collect(p: Profile, id: number): Result<{ profile: Profile; got: number; kind: ResKind }> {
  const b = p.base.buildings.find((q) => q.id === id);
  if (!b || (b.kind !== 'goldmine' && b.kind !== 'sawmill')) return err('not_found');
  const kind: ResKind = b.kind === 'goldmine' ? 'gold' : 'wood';
  const have = Math.floor(b.stored ?? 0);
  if (have < 1) return err('empty');
  const room = capacity(p)[kind] - p.res[kind];
  if (room <= 0) return err('full');
  const got = Math.min(have, room);
  const profile: Profile = {
    ...p,
    res: { ...p.res, [kind]: p.res[kind] + got },
    base: { ...p.base, buildings: p.base.buildings.map((q) => (q.id === id ? { ...q, stored: (q.stored ?? 0) - got } : q)) },
  };
  return ok({ profile, got, kind });
}

/**
 * 一键收：金矿、伐木场里攒的全部收进仓库（存量多的先收），仓库装满就停，剩下的留在矿里。
 * got = 收进来多少，left = 因为仓库满了还留在矿里多少，ids = 收过的建筑（画面在这些建筑上飘字）。
 */
export function collectAll(p: Profile): { profile: Profile; got: Res; left: Res; ids: number[] } {
  let cur = p;
  const got: Res = { gold: 0, wood: 0 };
  const ids: number[] = [];
  const mines = p.base.buildings
    .filter((b) => (b.kind === 'goldmine' || b.kind === 'sawmill') && Math.floor(b.stored ?? 0) >= 1)
    .sort((a, b) => (b.stored ?? 0) - (a.stored ?? 0) || a.id - b.id);
  for (const b of mines) {
    const r = collect(cur, b.id);
    if (!r.ok) continue;
    cur = r.value.profile;
    got[r.value.kind] += r.value.got;
    ids.push(b.id);
  }
  const left: Res = { gold: 0, wood: 0 };
  for (const b of cur.base.buildings) {
    if (b.kind === 'goldmine') left.gold += Math.floor(b.stored ?? 0);
    else if (b.kind === 'sawmill') left.wood += Math.floor(b.stored ?? 0);
  }
  return { profile: cur, got, left, ids };
}

export function boatSlots(p: Profile): { boats: number; cap: number } {
  const dock = p.base.buildings.find((b) => b.kind === 'dock');
  const lv = dock ? BUILDINGS.dock.levels[dock.level - 1] : undefined;
  return { boats: lv?.boats ?? BASE_BOATS, cap: lv?.boatCap ?? BASE_BOAT_CAP };
}

export function setBoat(p: Profile, i: number, troop: TroopKind): Result<Profile> {
  const { boats } = boatSlots(p);
  if (!Number.isInteger(i) || i < 0 || i >= boats) return err('bad_index');
  if (TROOPS[troop].unlockHq > hqLevel(p)) return err('locked');
  if (troop === 'captain' && p.boats.some((b, j) => j !== i && j < boats && b.troop === 'captain')) return err('one_captain');
  const list = p.boats.slice();
  while (list.length < boats) list.push({ troop: 'sailor' });
  list[i] = { troop };
  return ok({ ...p, boats: list });
}

export function researchLevel(p: Profile, key: TroopKind | SkillKind): number {
  return p.research[key] ?? 1;
}

export function armyFor(p: Profile): ArmySetup {
  const { boats, cap } = boatSlots(p);
  const hq = hqLevel(p);
  const list: ArmySetup['boats'] = [];
  let captain = false;
  for (let i = 0; i < boats; i++) {
    const troop = p.boats[i]?.troop ?? 'sailor';
    // 一场只能带一个船长：坏存档里多出来的船长船按空船处理
    if (troop === 'captain') {
      if (captain) {
        list.push({ troop: 'sailor', count: 0, level: 1 });
        continue;
      }
      captain = true;
    }
    const count = troop === 'captain' ? 1 : Math.max(1, Math.floor(cap / TROOPS[troop].housing));
    list.push({ troop, count, level: researchLevel(p, troop) });
  }
  const skills: ArmySetup['skills'] = [];
  for (const kind of ['barrage', 'flare', 'medkit'] as SkillKind[]) {
    if (SKILLS[kind].unlockHq <= hq) skills.push({ kind, level: researchLevel(p, kind) });
  }
  return { boats: list, skills, energy: HQ_LEVELS[hq - 1]?.energy ?? 0 };
}

export function armyCost(p: Profile): Res {
  let wood = 0;
  for (const b of armyFor(p).boats) wood += b.count * (TROOPS[b.troop].levels[b.level - 1]?.cost ?? 0);
  return { gold: 0, wood };
}

/**
 * 木材不够整支船队时少带兵：从单价最高的兵开始一个个减（同价的先减后面的船），减到付得起为止。
 * 返回实际带的部队（减空的船去掉）、花多少木材、少带了几个；一个兵都付不起（全减光了）为 null。船坞配置不动，木材够了下次照旧满编。
 * 连续玩时出海的木耗和伐木场产量同一量级，主寨 4–6 级会因为缺木整场开不了（DESIGN 2.2 经济）。
 */
export function trimArmy(army: ArmySetup, wood: number): { army: ArmySetup; wood: number; trimmed: number } | null {
  const boats = army.boats.map((b) => ({ ...b }));
  const unit = boats.map((b) => TROOPS[b.troop].levels[b.level - 1]?.cost ?? 0);
  let total = boats.reduce((a, b, i) => a + b.count * (unit[i] ?? 0), 0);
  let trimmed = 0;
  while (total > wood) {
    let pick = -1;
    for (let i = 0; i < boats.length; i++) if ((boats[i]?.count ?? 0) > 0 && (unit[i] ?? 0) > 0 && (pick < 0 || (unit[i] ?? 0) >= (unit[pick] ?? 0))) pick = i;
    if (pick < 0) break;
    const b = boats[pick]!;
    const u = unit[pick] ?? 0;
    const n = Math.min(b.count, Math.ceil((total - wood) / u));
    b.count -= n;
    total -= n * u;
    trimmed += n;
  }
  if (total > wood || boats.every((b) => b.count === 0)) return null;
  // 减空的船整条不带：空船也能点登陆、也算"船都上岸了"，会让结束判定和船卡对不上
  return { army: { ...army, boats: boats.filter((b) => b.count > 0) }, wood: total, trimmed };
}

export function researchCost(key: TroopKind | SkillKind, current: number): Res {
  void key;
  return { gold: 100 * current * current, wood: 80 * current * current };
}

export function research(p: Profile, key: TroopKind | SkillKind): Result<Profile> {
  const def = key in TROOPS ? TROOPS[key as TroopKind] : SKILLS[key as SkillKind];
  if (def.unlockHq > hqLevel(p)) return err('locked');
  const cur = researchLevel(p, key);
  if (cur >= 8) return err('max');
  const armory = p.base.buildings.find((b) => b.kind === 'armory');
  if (!armory) return err('need_armory');
  if (cur + 1 > armory.level) return err('need_armory');
  const cost = researchCost(key, cur);
  const e = pay(p.res, cost);
  if (e) return err(e);
  return ok({ ...p, res: sub(p.res, cost), research: { ...p.research, [key]: cur + 1 } });
}

export function newProfile(): Profile {
  return {
    v: 1,
    base: {
      buildings: [
        { id: 1, kind: 'hq', level: 1, x: 9, y: 9 },
        { id: 2, kind: 'goldmine', level: 1, x: 4, y: 4, stored: 0 },
        { id: 3, kind: 'sawmill', level: 1, x: 15, y: 4, stored: 0 },
        { id: 4, kind: 'cannon', level: 1, x: 14, y: 14 },
        { id: 5, kind: 'palm', level: 1, x: 2, y: 12 },
        { id: 6, kind: 'palm', level: 1, x: 18, y: 10 },
        { id: 7, kind: 'palm', level: 1, x: 8, y: 18 },
        { id: 8, kind: 'palm', level: 1, x: 12, y: 2 },
      ],
      nextId: 9,
    },
    res: { gold: 600, wood: 400 },
    stars: {},
    research: {},
    boats: [{ troop: 'sailor' }, { troop: 'sailor' }],
    tutorial: 0,
    stats: { attacks: 0, wins: 0, lootGold: 0, lootWood: 0 },
    achievements: [],
    cosmetics: [],
    skins: {},
  };
}
