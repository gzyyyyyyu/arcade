/**
 * 守岛的出海与结算（DESIGN 10.4；守岛 2.0）：战役 30 关是写死的关卡岛（content/tdmaps.ts 的 TD2_LEVELS，关 id td01–td30，旧星数照算），
 * 开局读存档算驻守台、基地加成、能造的塔（不花木材）；结算按星数给金币木材（奖励表 content/tdreward.ts），每天有上限（超了只记星数、不给资源），
 * 首次拿到星的奖励另算、不计入上限。纯函数，不改入参。
 */
import { BUILDINGS, HQ_LEVELS, TD_BONUS_PER_STAR, TD_CAP_RUNS, TD_RUN_REWARD, TD_STAR_PCT } from '../content/index.ts';
import { TD2_LEVELS, TD2_LEVEL_BY_ID } from '../content/tdmaps.ts';
import { branchOptions } from '../content/branches.ts';
import { capacity, hqLevel, newProfile } from './base.ts';
import { TD_TROPHIES } from './run.ts';
import { heroLevel } from './tdbase.ts';
import { TD_TOWER_KINDS, baseBonusPct, garrisonTier } from './td2types.ts';
import type { TdGarrisonOption, TdGarrisonPick, TdGarrisonTower, TdIslandLevel, TdTier, TdTowerKind } from './td2types.ts';
import type { TdLevel, TdResult, TdSetup } from './tdtypes.ts';
import { ISLAND, RULES_VERSION } from './types.ts';
import type { Placed, Profile, Res, Result } from './types.ts';


const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T>(error: string): Result<T> => ({ ok: false, error });

const runAt = (hq: number): Res => TD_RUN_REWARD[Math.max(1, Math.min(HQ_LEVELS.length, hq)) - 1]!;

/** 每天守岛收入上限：当前主寨等级 3★ 一局 × TD_CAP_RUNS */
export function tdDailyCap(p: Profile): Res {
  const r = runAt(hqLevel(p));
  return { gold: r.gold * TD_CAP_RUNS, wood: r.wood * TD_CAP_RUNS };
}

/** 守岛类（战役、护航、海盗来袭）一局实际发多少，以及写回存档的 res、当天已拿 */
interface TdGrant {
  /** 本局奖励：先按今天剩的上限截，再按仓库剩的空间截 */
  run: Res;
  /** 首次拿星的奖励：不占每日上限，只按仓库截（先装它） */
  bonus: Res;
  /** 每日上限截掉了一部分 */
  capped: boolean;
  /** 仓库装不下截掉了一部分 */
  full: boolean;
  cap: Res;
  /** 今天已拿的（含这一局；只算真进了仓库的） */
  got: Res;
  res: Res;
}

/**
 * 发放：和出海一样按仓库上限截。异步攻防上传快照时资源不许超过仓库（validate.ts），所以不能把仓库撑破；
 * 截掉的部分不计入当天已拿。dayIndex 换天就从 0 重新计。
 */
export function tdGrant(p: Profile, raw: Res, bonusRaw: Res, dayIndex: number): TdGrant {
  const same = p.td === undefined || p.td.day === dayIndex;
  const got0: Res = { gold: same ? (p.td?.gotGold ?? 0) : 0, wood: same ? (p.td?.gotWood ?? 0) : 0 };
  const cap = tdDailyCap(p);
  const room = capacity(p);
  const part = (k: keyof Res): { bonus: number; today: number; run: number } => {
    const space = Math.max(0, room[k] - p.res[k]);
    const bonus = Math.min(bonusRaw[k], space);
    const today = Math.max(0, Math.min(raw[k], cap[k] - got0[k]));
    return { bonus, today, run: Math.min(today, space - bonus) };
  };
  const g = part('gold');
  const w = part('wood');
  return {
    run: { gold: g.run, wood: w.run },
    bonus: { gold: g.bonus, wood: w.bonus },
    capped: g.today < raw.gold || w.today < raw.wood,
    full: g.run < g.today || w.run < w.today || g.bonus < bonusRaw.gold || w.bonus < bonusRaw.wood,
    cap,
    got: { gold: got0.gold + g.run, wood: got0.wood + w.run },
    res: { gold: p.res.gold + g.run + g.bonus, wood: p.res.wood + w.run + w.bonus },
  };
}

/** 一局拿 stars 颗星的基础奖励（还没按每日上限截）：关卡建议主寨等级的 3★ 奖励 × TD_STAR_PCT */
export function tdRunReward(level: Pick<TdLevel, 'hq'>, stars: number): Res {
  const r = runAt(level.hq);
  const pct = TD_STAR_PCT[Math.max(0, Math.min(3, stars))] ?? 0;
  return { gold: Math.floor((r.gold * pct) / 100), wood: Math.floor((r.wood * pct) / 100) };
}

export interface TdNextUnlock {
  id: string;
  name: string;
  /** 要先在哪一关拿到 ≥ 1★ */
  after: string;
}

const starsOf = (p: Profile, id: string): number => p.td?.stars[id] ?? 0;

/** 守岛第 chapter 章的关都至少 1 星：结算时送这一章的纪念装饰（TD_TROPHIES）；第四章「远洋」另在船长档案多一行「远洋通关」 */
export function tdChapterCleared(stars: Readonly<Record<string, number>>, chapter: number): boolean {
  const cs = tdCampaign().filter((l) => l.chapter === chapter);
  return cs.length > 0 && cs.every((l) => (stars[l.id] ?? 0) >= 1);
}

/** 航海士解锁了没有：守岛第一章的关都至少 1 星 */
export function navUnlocked(p: Profile): boolean {
  return tdChapterCleared(p.td?.stars ?? {}, 1);
}

/** 开局写进 setup 的英雄：存档选了航海士、已经解锁才写（不信存档里的选择），否则不写（船长） */
export function heroKindOf(p: Profile): { heroKind?: 'nav' } {
  return p.heroPick === 'nav' && navUnlocked(p) ? { heroKind: 'nav' } : {};
}

/** 战役关表：TD2_LEVELS 里 id 是 td 加两位数的关（样板关之类的不进战役），按 index 排成一条线 */
export function tdCampaign(): TdIslandLevel[] {
  return TD2_LEVELS.filter((l) => /^td\d\d$/.test(l.id)).sort((a, b) => a.index - b.index);
}

/** 第 n 关要第 n−1 关 ≥ 1★（跨章也一样，所有章的关排成一条线）；第一关一直开着。不在战役里的关（样板关）一直开着 */
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
export function placeTdLevel(level: TdLevel | TdPlacedLevel, layout: readonly Placed[], ext: number): TdLevel {
  if (!('place' in level)) return level;
  const { place, ...rest } = level;
  const used = new Set<number>();
  for (const b of layout) {
    const s = BUILDINGS[b.kind]?.size ?? 1;
    for (let dx = 0; dx < s; dx++) for (let dy = 0; dy < s; dy++) used.add(key(b.x + dx, b.y + dy));
  }
  const free = (x: number, y: number, size: number): boolean => {
    if (x < -ext || y < -ext || x + size > ISLAND + ext || y + size > ISLAND + ext) return false;
    for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) if (used.has(key(x + dx, y + dy))) return false;
    return true;
  };
  const take = (x: number, y: number, size: number): void => {
    for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) used.add(key(x + dx, y + dy));
  };
  // 离最近登陆点（含落潮路）的远近排所有格子：候选用完后的补位
  const entries = [...level.lanes, ...(level.tide ? [level.tide.lane] : [])];
  const fallback: Array<{ x: number; y: number }> = [];
  for (let y = -ext; y < ISLAND + ext; y++) for (let x = -ext; x < ISLAND + ext; x++) fallback.push({ x, y });
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
        if (size === 2 && (c.x < 1 - ext || c.y < 1 - ext || c.x + size > ISLAND + ext - 1 || c.y + size > ISLAND + ext - 1)) continue;
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
  /** 因为仓库装不下少给了 */
  full: boolean;
  /** 今天已拿的（含这一局）和上限 */
  gotGold: number;
  gotWood: number;
  capGold: number;
  capWood: number;
  /** 这一局新解锁的关，没有为 null */
  unlocked: string | null;
  /** 还锁着的第一关（"下一个解锁"提示），全开了为 null */
  next: TdNextUnlock | null;
  /** 这一局送的章节纪念装饰（收藏 id，按章号排），没有为空 */
  trophies: string[];
}

/**
 * 结算一局守岛。dayIndex 是北京时间的天数（画面层算好传进来，和每日悬赏同一口径），换天就重新计当天已拿的。
 * 超过上限照样记星、给首次星奖励，只是不给本局的金币木材；仓库装不下的部分不给（tdGrant）。
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
  const g = tdGrant(p, tdRunReward(lv, stars), { gold: newStars * lv.hq * TD_BONUS_PER_STAR.gold, wood: newStars * lv.hq * TD_BONUS_PER_STAR.wood }, dayIndex);
  const unlockedBefore = nextTdUnlock(p);
  const profile: Profile = {
    ...p,
    res: g.res,
    td: { stars: { ...(p.td?.stars ?? {}), [levelId]: Math.max(prev, stars) }, day: dayIndex, gotGold: g.got.gold, gotWood: g.got.wood },
  };
  // 只在拿到星的这一局发：没守住的结算框里不该冒出「通关」（老存档早已全有星、还没领到的章，下一次赢了一起补发）
  const owned = p.cosmetics ?? [];
  const trophies = stars >= 1 ? Object.entries(TD_TROPHIES).filter(([ch, id]) => !owned.includes(id) && tdChapterCleared(profile.td!.stars, Number(ch))).map(([, id]) => id) : [];
  if (trophies.length) profile.cosmetics = [...owned, ...trophies];
  const next = nextTdUnlock(profile);
  const unlocked = unlockedBefore && unlockedBefore.after === levelId && stars >= 1 && prev === 0 ? unlockedBefore.id : null;
  return ok({
    profile,
    reward: {
      gold: g.run.gold, wood: g.run.wood, bonusGold: g.bonus.gold, bonusWood: g.bonus.wood, newStars,
      capped: g.capped, full: g.full,
      gotGold: g.got.gold, gotWood: g.got.wood, capGold: g.cap.gold, capWood: g.cap.wood,
      unlocked, next, trophies,
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
    ...heroKindOf(p),
  });
}

/**
 * 每个驻守台按阶挑（只给配平模拟、指纹锁的养成开局 tdGrowthSetup 和单测用，改了旧指纹全变）：阶最高的，同阶按基地等级高的，再按 TD_TOWER_KINDS 的顺序；
 * 基地里一座塔都没有就不挑。界面上的推荐看敌人，在画面层 view/garrisonrec.ts
 */
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
export function tdGrowthProfile(level: Pick<TdLevel, 'hq'>, growth: TdGrowth, hero?: 'nav'): Profile {
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
    ...(hero ? { heroPick: hero } : {}),
  };
}

/** 按养成档位开一局（td-sim 用）：tdGrowthProfile + tdAutoPicks + startTd2；hero = 'nav' 带航海士 */
export function tdGrowthSetup(levelId: string, growth: TdGrowth, seed: number, hero?: 'nav'): Result<TdSetup> {
  const lv = TD2_LEVEL_BY_ID.get(levelId);
  if (!lv) return err('unknown');
  const p = tdGrowthProfile(lv, growth, hero);
  return startTd2(p, levelId, seed, tdAutoPicks(p, levelId));
}
