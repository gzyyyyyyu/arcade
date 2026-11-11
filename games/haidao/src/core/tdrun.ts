/**
 * 守岛的出海与结算（DESIGN 10.4；守岛 2.0）：战役 18 关是写死的关卡岛（content/tdmaps.ts 的 TD2_LEVELS，关 id td01–td18，旧星数照算），
 * 开局读存档算驻守台、基地加成、能造的塔（不花木材）；结算按星数给金币木材，每天有上限（超了只记星数、不给资源），
 * 首次拿到星的奖励另算、不计入上限。纯函数，不改入参。
 */
import { BUILDINGS, HQ_LEVELS } from '../content/index.ts';
import { TD2_LEVELS, TD2_LEVEL_BY_ID } from '../content/tdmaps.ts';
import { branchOptions } from '../content/branches.ts';
import { hqLevel, newProfile } from './base.ts';
import { heroLevel } from './tdbase.ts';
import { TD_TOWER_KINDS, baseBonusPct, garrisonTier } from './td2types.ts';
import type { TdGarrisonOption, TdGarrisonPick, TdGarrisonTower, TdIslandLevel, TdTier, TdTowerKind } from './td2types.ts';
import type { TdLevel, TdResult, TdSetup } from './tdtypes.ts';
import { ISLAND, RULES_VERSION } from './types.ts';
import type { Placed, Profile, Res, Result } from './types.ts';

/** 一局的基础奖励 = 这一关建议主寨等级下全部产出建筑 15 分钟的产量，按星数折：0★ 不给 */
export const TD_RUN_PCT = [0, 40, 70, 100];
/** 每个首次拿到的星另给（乘关卡建议主寨等级）：不计入每日上限 */
export const TD_BONUS_PER_STAR: Res = { gold: 30, wood: 15 };
/** 每日上限按几小时的产量算（DESIGN 10.4：8 小时） */
const CAP_HOURS = 8;

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T>(error: string): Result<T> => ({ ok: false, error });

/** 某主寨等级下"全部金矿 / 伐木场每小时产量" */
function hourly(hq: number): Res {
  const lim = HQ_LEVELS[hq - 1]?.limits ?? {};
  const rate = (k: 'goldmine' | 'sawmill'): number => (lim[k] ?? 0) * (BUILDINGS[k].levels[hq - 1]?.rate ?? 0);
  return { gold: rate('goldmine'), wood: rate('sawmill') };
}

/** 每天守岛收入上限：当前主寨等级的金矿名额 × 每小时产量 × 8（伐木场同理）；1–8 级金币 1,200 / 3,200 / 4,160 / 7,920 / 10,080 / 16,640 / 25,600 / 37,440 */
export function tdDailyCap(p: Profile): Res {
  const h = hourly(hqLevel(p));
  return { gold: h.gold * CAP_HOURS, wood: h.wood * CAP_HOURS };
}

/** 一局拿 stars 颗星的基础奖励（还没按每日上限截） */
export function tdRunReward(level: Pick<TdLevel, 'hq'>, stars: number): Res {
  const h = hourly(Math.max(1, Math.min(HQ_LEVELS.length, level.hq)));
  const pct = TD_RUN_PCT[Math.max(0, Math.min(3, stars))] ?? 0;
  return { gold: Math.floor((h.gold * pct) / 400), wood: Math.floor((h.wood * pct) / 400) };
}

export interface TdNextUnlock {
  id: string;
  name: string;
  /** 要先在哪一关拿到 ≥ 1★ */
  after: string;
}

const starsOf = (p: Profile, id: string): number => p.td?.stars[id] ?? 0;

/** 战役关表：TD2_LEVELS 里 id 是 td 加两位数的关（样板关之类的不进战役），按 index 排成一条线 */
export function tdCampaign(): TdIslandLevel[] {
  return TD2_LEVELS.filter((l) => /^td\d\d$/.test(l.id)).sort((a, b) => a.index - b.index);
}

/** 第 n 关要第 n−1 关 ≥ 1★（跨章也一样，三章 18 关排成一条线）；第一关一直开着。不在战役里的关（样板关）一直开着 */
export function tdLevelUnlocked(p: Profile, id: string): boolean {
  const list = tdCampaign();
  const i = list.findIndex((l) => l.id === id);
  if (i < 0) return TD2_LEVEL_BY_ID.has(id);
  return i === 0 || starsOf(p, (list[i - 1] as TdIslandLevel).id) >= 1;
}

/** 还锁着的第一关（给界面写"通关 X 解锁"）；全开了为 null */
export function nextTdUnlock(p: Profile): TdNextUnlock | null {
  const list = tdCampaign();
  for (let i = 1; i < list.length; i++) {
    const l = list[i] as TdIslandLevel;
    if (!tdLevelUnlocked(p, l.id)) return { id: l.id, name: l.name, after: (list[i - 1] as TdIslandLevel).id };
  }
  return null;
}

// ---------------------------------------------------------------- 摆关卡里的东西

const key = (x: number, y: number): number => y * 64 + x;

/** 写候选位置的关（海盗来袭、旧关卡）：place 是要摆几个 */
export type TdPlacedLevel = TdLevel & { place: { slots: number; kegs: number; wrecks: number; barrels: number } };

/**
 * 关卡写的是候选位置，打在玩家自己的岛上（守岛 2.0 只剩海盗来袭这么用）：按候选的先后顺序挑**不压任何建筑**（含装饰、墙、陷阱）也不互相压的位置，
 * 摆够 `place` 里的数量为止；候选不够就在离登陆点近的空地补（临时塔位和火药桶），还是没地方就少摆，绝不重叠。
 * 确定性：只看关卡和布局，不用随机。
 */
export function placeTdLevel(level: TdLevel | TdPlacedLevel, layout: readonly Placed[]): TdLevel {
  if (!('place' in level)) return level;
  const { place, ...rest } = level;
  const used = new Set<number>();
  for (const b of layout) {
    const s = BUILDINGS[b.kind]?.size ?? 1;
    for (let dx = 0; dx < s; dx++) for (let dy = 0; dy < s; dy++) used.add(key(b.x + dx, b.y + dy));
  }
  const free = (x: number, y: number, size: number): boolean => {
    if (x < 0 || y < 0 || x + size > ISLAND || y + size > ISLAND) return false;
    for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) if (used.has(key(x + dx, y + dy))) return false;
    return true;
  };
  const take = (x: number, y: number, size: number): void => {
    for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) used.add(key(x + dx, y + dy));
  };
  // 离最近登陆点（含落潮路）的远近排所有格子：候选用完后的补位
  const entries = [...level.lanes, ...(level.tide ? [level.tide.lane] : [])];
  const fallback: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < ISLAND; y++) for (let x = 0; x < ISLAND; x++) fallback.push({ x, y });
  const dist = (c: { x: number; y: number }): number => Math.min(...entries.map((e) => (e.x - c.x) * (e.x - c.x) + (e.y - c.y) * (e.y - c.y)));
  fallback.sort((a, b) => dist(a) - dist(b) || a.y - b.y || a.x - b.x);

  const pick = <T extends { x: number; y: number }>(cands: readonly T[], n: number, size: number, extra: boolean): T[] => {
    const out: T[] = [];
    for (const c of cands) {
      if (out.length >= n) break;
      if (free(c.x, c.y, size)) {
        take(c.x, c.y, size);
        out.push(c);
      }
    }
    if (extra) {
      for (const c of fallback) {
        if (out.length >= n) break;
        // 补位的离岛边别太远：塔位至少离岛边 1 格，免得堵死海滩出口
        if (size === 2 && (c.x < 1 || c.y < 1 || c.x + size > ISLAND - 1 || c.y + size > ISLAND - 1)) continue;
        if (free(c.x, c.y, size)) {
          take(c.x, c.y, size);
          out.push({ ...c } as T);
        }
      }
    }
    return out;
  };

  const slots = pick(level.slots, place.slots, 2, true);
  const wrecks = pick(level.obstacles.filter((o) => o.kind === 'wreck'), place.wrecks, 2, false);
  const barrels = pick(level.obstacles.filter((o) => o.kind === 'barrel'), place.barrels, 1, false);
  const kegs = pick(level.kegs, place.kegs, 1, true);
  return { ...rest, slots, kegs, obstacles: [...wrecks, ...barrels] };
}

// ---------------------------------------------------------------- 出海与结算

/** 旧的出海入口（界面还没接驻守台选塔时用）：等于 startTd2 加上每个驻守台的推荐选择 tdAutoPicks。守岛不花木材，所以不改存档 */
export function startTd(p: Profile, levelId: string, seed: number): Result<TdSetup> {
  return startTd2(p, levelId, seed, tdAutoPicks(p, levelId));
}

export interface TdReward {
  /** 这一局实际给的（已按每日上限截过，不含首次星奖励） */
  gold: number;
  wood: number;
  /** 首次拿星的奖励（不计入每日上限） */
  bonusGold: number;
  bonusWood: number;
  /** 这一局新拿到几颗星（比这关历史最高多出来的） */
  newStars: number;
  /** 因为每日上限少给了（有一项被截就是 true；上限已满时 gold、wood 为 0） */
  capped: boolean;
  /** 今天已拿的（含这一局）和上限 */
  gotGold: number;
  gotWood: number;
  capGold: number;
  capWood: number;
  /** 这一局新解锁的关，没有为 null */
  unlocked: string | null;
  /** 还锁着的第一关（"下一个解锁"提示），全开了为 null */
  next: TdNextUnlock | null;
}

/**
 * 结算一局守岛。dayIndex 是北京时间的天数（画面层算好传进来，和每日悬赏同一口径），换天就重新计当天已拿的。
 * 超过上限照样记星、给首次星奖励，只是不给本局的金币木材。
 */
export function settleTd(p: Profile, levelId: string, result: TdResult, dayIndex: number): Result<{ profile: Profile; reward: TdReward }> {
  const lv = TD2_LEVEL_BY_ID.get(levelId);
  if (!lv) return err('unknown');
  if (!tdLevelUnlocked(p, levelId)) return err('locked');
  if (!result.over) return err('not_over');
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return err('bad_day');
  const stars = Math.max(0, Math.min(3, Math.floor(result.stars)));
  const prev = starsOf(p, levelId);
  const newStars = Math.max(0, stars - prev);
  const td = p.td ?? { stars: {}, day: dayIndex, gotGold: 0, gotWood: 0 };
  const sameDay = td.day === dayIndex;
  const cap = tdDailyCap(p);
  const gotG = sameDay ? td.gotGold : 0;
  const gotW = sameDay ? td.gotWood : 0;
  const raw = tdRunReward(lv, stars);
  const gold = Math.max(0, Math.min(raw.gold, cap.gold - gotG));
  const wood = Math.max(0, Math.min(raw.wood, cap.wood - gotW));
  const bonusGold = newStars * lv.hq * TD_BONUS_PER_STAR.gold;
  const bonusWood = newStars * lv.hq * TD_BONUS_PER_STAR.wood;
  const unlockedBefore = nextTdUnlock(p);
  const profile: Profile = {
    ...p,
    res: { gold: p.res.gold + gold + bonusGold, wood: p.res.wood + wood + bonusWood },
    td: { stars: { ...td.stars, [levelId]: Math.max(prev, stars) }, day: dayIndex, gotGold: gotG + gold, gotWood: gotW + wood },
  };
  const next = nextTdUnlock(profile);
  const unlocked = unlockedBefore && unlockedBefore.after === levelId && stars >= 1 && prev === 0 ? unlockedBefore.id : null;
  return ok({
    profile,
    reward: {
      gold, wood, bonusGold, bonusWood, newStars,
      capped: gold < raw.gold || wood < raw.wood,
      gotGold: profile.td!.gotGold, gotWood: profile.td!.gotWood, capGold: cap.gold, capWood: cap.wood,
      unlocked, next,
    },
  });
}

// ---------------------------------------------------------------- 守岛 2.0：驻守台、解锁、基地加成（契约，td2types.ts）

/** 基地里每种守岛塔的最高等级和那一座的分叉（没有这种塔就不在表里） */
function bestTowers(p: Profile): Map<TdTowerKind, { level: number; branch: string[] }> {
  const out = new Map<TdTowerKind, { level: number; branch: string[] }>();
  for (const b of p.base.buildings) {
    if (!(TD_TOWER_KINDS as readonly string[]).includes(b.kind)) continue;
    const k = b.kind as TdTowerKind;
    const cur = out.get(k);
    if (!cur || b.level > cur.level) out.set(k, { level: b.level, branch: b.branch ? [...b.branch] : [] });
  }
  return out;
}

/** 木台上能造哪些塔：主寨等级到了 unlockHq 的守岛塔（不要求基地里已经造了） */
export function tdUnlockedTowers(p: Profile): TdTowerKind[] {
  const hq = hqLevel(p);
  return TD_TOWER_KINDS.filter((k) => BUILDINGS[k].unlockHq <= hq);
}

/** 基地加成：每种塔按基地同类最高等级 baseBonusPct */
export function tdBaseBonus(p: Profile): Partial<Record<TdTowerKind, number>> {
  const out: Partial<Record<TdTowerKind, number>> = {};
  for (const [k, v] of bestTowers(p)) out[k] = baseBonusPct(v.level);
  return out;
}

/** 某个上限阶的驻守台能挑哪些塔：基地里有的每种塔一项（按 TD_TOWER_KINDS 的顺序），阶按 garrisonTier 折、封顶 cap */
export function tdGarrisonOptions(p: Profile, cap: TdTier): TdGarrisonOption[] {
  const best = bestTowers(p);
  const out: TdGarrisonOption[] = [];
  for (const k of TD_TOWER_KINDS) {
    const b = best.get(k);
    if (!b) continue;
    out.push({ kind: k, baseLevel: b.level, tier: garrisonTier(b.level, cap), branch: b.branch, bonusPct: baseBonusPct(b.level) });
  }
  return out;
}

/**
 * 守岛 2.0 出海：关卡岛（TD2_LEVEL_BY_ID）+ 玩家给驻守台挑的塔（阶、分叉由存档算，不信界面）+ 基地加成 + 能造的塔。
 * 没有这关回 unknown，没解锁回 locked；同一个驻守台挑两次、挑基地里没有的塔、驻守台下标越界都回 bad_garrison；
 * 没挑的驻守台空着（局内能当木台用）。
 */
export function startTd2(p: Profile, levelId: string, seed: number, picks: readonly TdGarrisonPick[]): Result<TdSetup> {
  const lv = TD2_LEVEL_BY_ID.get(levelId);
  if (!lv) return err('unknown');
  if (!tdLevelUnlocked(p, levelId)) return err('locked');
  const garrison: TdGarrisonTower[] = [];
  const used = new Set<number>();
  for (const pk of picks) {
    const spot = lv.garrison[pk.spot];
    if (!spot || used.has(pk.spot)) return err('bad_garrison');
    const opt = tdGarrisonOptions(p, spot.cap).find((o) => o.kind === pk.kind);
    if (!opt) return err('bad_garrison');
    used.add(pk.spot);
    garrison.push({ spot: pk.spot, kind: opt.kind, tier: opt.tier, branch: opt.branch });
  }
  return ok({
    layout: lv.layout.map((b) => ({ ...b })),
    level: lv,
    hero: heroLevel(p),
    seed,
    rules: RULES_VERSION,
    mode: 'campaign',
    garrison,
    bonus: tdBaseBonus(p),
    unlocked: tdUnlockedTowers(p),
  });
}

/** 每个驻守台的推荐选择（界面的默认选中、旧入口、模拟器用）：阶最高的，同阶按基地等级高的，再按 TD_TOWER_KINDS 的顺序；基地里一座塔都没有就不挑 */
export function tdAutoPicks(p: Profile, levelId: string): TdGarrisonPick[] {
  const lv = TD2_LEVEL_BY_ID.get(levelId);
  if (!lv) return [];
  const out: TdGarrisonPick[] = [];
  lv.garrison.forEach((spot, i) => {
    let best: TdGarrisonOption | undefined;
    for (const o of tdGarrisonOptions(p, spot.cap)) if (!best || o.tier > best.tier || (o.tier === best.tier && o.baseLevel > best.baseLevel)) best = o;
    if (best) out.push({ spot: i, kind: best.kind });
  });
  return out;
}

/** 配平用的三种养成：零养成（基地没有防御塔、英雄 1 级）、建议养成（关卡建议主寨，能造的塔各一座在主寨等级）、满养成（主寨 8 级，六种塔 8 级带分叉，英雄 8 级） */
export type TdGrowth = 'zero' | 'suggest' | 'max';

/**
 * 按养成档位造一份存档（模拟器、单测用，不进正式流程）：主寨等级、防御塔、英雄研究按档位摆好，战役全部 1★（哪一关都开着）。
 * 塔的坐标只是占位（存档里不校验摆放），守岛 2.0 只看每种塔的最高等级和分叉。
 */
export function tdGrowthProfile(level: Pick<TdLevel, 'hq'>, growth: TdGrowth): Profile {
  const p0 = newProfile();
  const hq = growth === 'max' ? HQ_LEVELS.length : Math.max(1, Math.min(HQ_LEVELS.length, level.hq));
  // 新档自带的防御塔也去掉：每种塔只留下面按档位摆的那一座
  const buildings = p0.base.buildings.filter((b) => !(TD_TOWER_KINDS as readonly string[]).includes(b.kind)).map((b) => (b.kind === 'hq' ? { ...b, level: hq } : b));
  let nextId = p0.base.nextId;
  if (growth !== 'zero') {
    TD_TOWER_KINDS.forEach((k, i) => {
      if (BUILDINGS[k].unlockHq > hq) return;
      const lvl = Math.min(BUILDINGS[k].maxLevel, hq);
      const branch = growth === 'max' ? [branchOptions(k, 1)[0]?.id, branchOptions(k, 2)[0]?.id].filter((x): x is string => !!x) : [];
      buildings.push({ id: nextId++, kind: k, level: lvl, x: 2 * i, y: 0, ...(branch.length > 0 ? { branch } : {}) });
    });
  }
  const stars = Object.fromEntries(tdCampaign().map((l) => [l.id, 1]));
  return {
    ...p0,
    base: { buildings, nextId },
    research: { ...p0.research, hero: growth === 'zero' ? 1 : hq },
    td: { stars, day: 0, gotGold: 0, gotWood: 0 },
  };
}

/** 按养成档位开一局（td-sim 用）：tdGrowthProfile + tdAutoPicks + startTd2 */
export function tdGrowthSetup(levelId: string, growth: TdGrowth, seed: number): Result<TdSetup> {
  const lv = TD2_LEVEL_BY_ID.get(levelId);
  if (!lv) return err('unknown');
  const p = tdGrowthProfile(lv, growth);
  return startTd2(p, levelId, seed, tdAutoPicks(p, levelId));
}
