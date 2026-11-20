/**
 * 基地快照的服务端把关（DESIGN.md 5.3）：异步攻防里别人的岛按它上传的快照摆、进攻方的兵按它自己的快照算，
 * 不防作弊的口径照旧，但坏数据不能让重放崩、也不能摆出这个主寨等级不可能有的岛。浏览器也可以拿它自检。
 *
 * 全部按内容表数据驱动（BUILDINGS 的 unlockHq / maxLevel / size、HQ_LEVELS 的名额、TROOPS / SKILLS 的研究上限），
 * 加了新建筑、新主寨等级不用改这里。只回一个短原因码，不回原数据。
 */
import { BUILDINGS, HQ_LEVELS, SKILLS, TROOPS } from '../content/index.ts';
import { capacityOfBuildings, islandExt } from './base.ts';
import { COSMETICS } from './run.ts';
import { branchError, heroCap } from './tdbase.ts';
import { RANK_HQ, RANKS } from '../content/rank.ts';
import { EXT_MAX, ISLAND } from './types.ts';
import type { BuildingKind, Placed, Profile, SkillKind, TroopKind } from './types.ts';

export type Validated = { ok: true; value: Profile } | { ok: false; error: string };

/** 是普通对象（不是 null、不是数组）：存档、攻防快照、云存档回包的形状检查共用 */
export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const own = <T extends object>(o: T, k: unknown): k is keyof T => typeof k === 'string' && Object.hasOwn(o, k);
/** 存量、统计数的上限：远大于任何正常存档，挡住 1e308 这类会把乘法算爆的数（仓库里的资源另按主寨等级的容量封顶） */
export const VALIDATE_RES_MAX = 1e9;
const MAX_BUILDINGS = 400;
const MAX_BOATS = 32;

const fail = (error: string): Validated => ({ ok: false, error });

/**
 * 这个主寨等级下仓库最多能装多少：每种建筑按名额摆满、等级拉到 min(主寨, 上限)，交给核心的 capacity 算（加了新的仓储建筑不用改这里）。
 * 快照里的资源超过它就是不可能的岛；按实际摆的仓库算会把"拆了金库后资源暂时超容量"这类正常存档也拒掉，所以按等级的上限算。
 */
export function maxCapacity(hq: number): { gold: number; wood: number } {
  const limits = HQ_LEVELS[hq - 1]?.limits ?? {};
  const buildings: Placed[] = [{ id: 1, kind: 'hq', level: hq, x: 0, y: 0 }];
  for (const [k, n] of Object.entries(limits) as [BuildingKind, number][]) {
    if (k === 'hq') continue;
    const level = Math.min(hq, BUILDINGS[k].maxLevel);
    for (let i = 0; i < n; i++) buildings.push({ id: buildings.length + 1, kind: k, level, x: 0, y: 0 });
  }
  return capacityOfBuildings(buildings);
}

/**
 * 不可信的 Profile → 规整过的 Profile；有一处不合格就整份拒收（和 reviveSave 不同：那边是"救本机的坏档"，这里是"拒收上传"）。
 * 原因码：shape / building / overlap / dup_id / no_hq / locked / limit / level / research / boat / res / deco / branch。
 * 宝藏箱按主寨名额收（和别的建筑一样）；分叉要过 tdbase.ts 的 branchError（塔对得上、等级够、先 3 级那次）；英雄研究 hero 要有军械所、不超过主寨（都进攻防）。
 * 掉宝装饰（雕像、旗杆、宝箱）：快照带了收藏（cosmetics）时必须已拥有才许摆（和 reviveSave、build 一致）；没带收藏的旧快照直接放行——
 * 装饰不挡路、不算摧毁率（battle.ts 的 isDeco），放行也不影响结算。
 */
export function validateBase(raw: unknown): Validated {
  if (!isObj(raw) || raw.v !== 1 || !isObj(raw.base) || !Array.isArray(raw.base.buildings) || !isObj(raw.res)) return fail('shape');
  const list = raw.base.buildings;
  if (list.length === 0 || list.length > MAX_BUILDINGS) return fail('shape');
  const kept: Placed[] = [];
  const ids = new Set<number>();
  // 先按扩得最大的岛收，主寨等级定下来后再按这一级的范围查（islandExt）
  const W = ISLAND + 2 * EXT_MAX;
  const occupied = new Uint8Array(W * W);
  for (const b of list) {
    if (!isObj(b) || !own(BUILDINGS, b.kind)) return fail('building');
    const def = BUILDINGS[b.kind];
    if (!isInt(b.id, 1, Number.MAX_SAFE_INTEGER) || !isInt(b.level, 1, def.maxLevel)) return fail('building');
    if (ids.has(b.id)) return fail('dup_id');
    if (!isInt(b.x, -EXT_MAX, ISLAND + EXT_MAX - def.size) || !isInt(b.y, -EXT_MAX, ISLAND + EXT_MAX - def.size)) return fail('building');
    for (let y: number = b.y; y < b.y + def.size; y++) {
      for (let x: number = b.x; x < b.x + def.size; x++) {
        const at: number = (y + EXT_MAX) * W + x + EXT_MAX;
        if (occupied[at]) return fail('overlap');
        occupied[at] = 1;
      }
    }
    const p: Placed = { id: b.id, kind: b.kind, level: b.level, x: b.x, y: b.y };
    if (b.stored !== undefined) {
      if (typeof b.stored !== 'number' || !Number.isFinite(b.stored) || b.stored < 0 || b.stored > VALIDATE_RES_MAX) return fail('res');
      p.stored = b.stored;
    }
    if (b.branch !== undefined) {
      if (!Array.isArray(b.branch) || b.branch.length === 0 || b.branch.length > 2) return fail('branch');
      const br: string[] = [];
      for (const id of b.branch) {
        if (typeof id !== 'string' || branchError(b.kind, b.level, br, id) !== null) return fail('branch');
        br.push(id);
      }
      p.branch = br;
    }
    ids.add(b.id);
    kept.push(p);
  }
  const hqs = kept.filter((b) => b.kind === 'hq');
  if (hqs.length !== 1) return fail('no_hq');
  const hq = hqs[0]!.level;
  const ext = islandExt(kept);
  for (const b of kept) {
    const size = BUILDINGS[b.kind].size;
    if (b.x < -ext || b.y < -ext || b.x + size > ISLAND + ext || b.y + size > ISLAND + ext) return fail('building');
  }
  const limits = HQ_LEVELS[hq - 1]?.limits;
  if (!limits) return fail('level');
  const count = new Map<BuildingKind, number>();
  let armory = 0;
  for (const b of kept) {
    const def = BUILDINGS[b.kind];
    if (def.unlockHq > hq) return fail('locked');
    const n = (count.get(b.kind) ?? 0) + 1;
    count.set(b.kind, n);
    if (n > (limits[b.kind] ?? 0)) return fail('limit');
    // 主寨以外的建筑等级不超过主寨（base.ts upgrade 的 need_hq）
    if (b.kind !== 'hq' && b.level > hq) return fail('level');
    if (b.kind === 'armory') armory = Math.max(armory, b.level);
  }
  const research: Profile['research'] = {};
  if (raw.research !== undefined) {
    if (!isObj(raw.research)) return fail('research');
    for (const [k, v] of Object.entries(raw.research)) {
      if (k === 'hero') {
        // 英雄研究：要军械所，等级 1..heroCap(主寨)（tdbase.ts researchHero；8 级后到 12，攻防里 raidSetup 封顶 8）
        if (!isInt(v, 1, heroCap(hq)) || (v > 1 && armory === 0)) return fail('research');
        research.hero = v;
        continue;
      }
      const def = own(TROOPS, k) ? TROOPS[k] : own(SKILLS, k) ? SKILLS[k] : null;
      if (!def || !isInt(v, 1, def.levels.length) || def.unlockHq > hq) return fail('research');
      // 研究要军械所，等级不超过军械所（base.ts research 的 need_armory）
      if (v > Math.max(1, armory)) return fail('research');
      research[k as TroopKind | SkillKind] = v;
    }
  }
  if (!Array.isArray(raw.boats) || raw.boats.length > MAX_BOATS) return fail('boat');
  const boats: Profile['boats'] = [];
  for (const bt of raw.boats) {
    if (!isObj(bt) || !own(TROOPS, bt.troop) || TROOPS[bt.troop].unlockHq > hq) return fail('boat');
    boats.push({ troop: bt.troop });
  }
  // 掉宝装饰、纪念装饰的归属
  const pool = new Set(COSMETICS);
  let cosmetics: string[] = [];
  if (raw.cosmetics !== undefined) {
    if (!Array.isArray(raw.cosmetics) || raw.cosmetics.length > 200) return fail('shape');
    cosmetics = [...new Set(raw.cosmetics.filter((c): c is string => typeof c === 'string' && pool.has(c)))];
    for (const b of kept) if (pool.has(`deco:${b.kind}`) && !cosmetics.includes(`deco:${b.kind}`)) return fail('deco');
  }
  const skins: Profile['skins'] = {};
  if (isObj(raw.skins)) {
    for (const [t, sk] of Object.entries(raw.skins)) if (own(TROOPS, t) && typeof sk === 'string' && cosmetics.includes(`skin:${t}:${sk}`)) skins[t] = sk;
  }
  // 资源封顶到这个主寨等级的仓库总容量：别人能抢的是它的 20%（raidLoss），报个天文数字也只能按真实能装的算
  const res = raw.res;
  const cap = maxCapacity(hq);
  for (const k of ['gold', 'wood'] as const) {
    const v = res[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > cap[k]) return fail('res');
  }
  const stars: Record<string, number> = {};
  if (isObj(raw.stars)) for (const [k, v] of Object.entries(raw.stars)) if (isInt(v, 0, 3) && k.length <= 16) stars[k] = v;
  const st = isObj(raw.stats) ? raw.stats : {};
  const cnt = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(Math.min(v, VALIDATE_RES_MAX)) : 0);
  const maxId = Math.max(...ids);
  const nextId = isInt(raw.base.nextId, maxId + 1, Number.MAX_SAFE_INTEGER) ? raw.base.nextId : maxId + 1;
  return {
    ok: true,
    value: {
      v: 1,
      base: { buildings: kept, nextId },
      res: { gold: Math.floor(res.gold as number), wood: Math.floor(res.wood as number) },
      stars,
      research,
      boats,
      tutorial: isInt(raw.tutorial, 0, 1000) ? raw.tutorial : 0,
      stats: { attacks: cnt(st.attacks), wins: cnt(st.wins), lootGold: cnt(st.lootGold), lootWood: cnt(st.lootWood) },
      cosmetics,
      skins,
      // 成就、称号攻防用不上，快照里不留
      achievements: [],
      // 海盗王阶只给对面看王旗（rank.ts），不进任何数值；没到主寨 8 级不该有
      ...(isInt(raw.rank, 1, RANKS.length) && hq >= RANK_HQ ? { rank: raw.rank } : {}),
    },
  };
}
