/**
 * 护航的出海与结算（娱乐版，不碰筹码）：9 关 = 3 张图 × 3 档难度（content/escortlevels.ts）。
 * 解锁：第一张图三档一直开着；后一张图要前一张图任一难度 ≥ 1★。
 * 一局给关卡建议主寨等级下全部金矿 / 伐木场 15 分钟的产量 × 星数折（守岛的 TD_STAR_PCT）；护航不跟守岛的战役掠夺表，娱乐收益随产量（INCOME_PCT）涨。
 * 结算和守岛共用 `Profile.td` 里的每日上限（settleTd 同款：超上限只记星、不给本局资源，首次拿星的奖励不计入上限）；
 * 星数另存在 `Profile.escort.stars`，不混进守岛的战役星。纯函数，不改入参。
 */
import { BUILDINGS, ESCORT_LEVEL_BY_ID, ESCORT_LEVELS, ESCORT_MAP_BY_ID, ESCORT_MAPS, HQ_LEVELS, TD_BONUS_PER_STAR, TD_HERO, TD_STAR_PCT } from '../content/index.ts';
import type { EscortLevel } from './escorttypes.ts';
import { tdGrant } from './tdrun.ts';
import { TD_TOWER_KINDS } from './td2types.ts';
import type { TdResult, TdSetup } from './tdtypes.ts';
import { RULES_VERSION } from './types.ts';
import type { Profile, Res, Result } from './types.ts';

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T>(error: string): Result<T> => ({ ok: false, error });

const starsOf = (p: Profile, id: string): number => p.escort?.stars[id] ?? 0;

/** 一局拿 stars 颗星的基础奖励（还没按每日上限截）：建议主寨等级下全部金矿 / 伐木场 15 分钟的产量 × TD_STAR_PCT */
export function escortRunReward(level: Pick<EscortLevel, 'hq'>, stars: number): Res {
  const hq = Math.max(1, Math.min(HQ_LEVELS.length, level.hq));
  const lim = HQ_LEVELS[hq - 1]?.limits ?? {};
  const pct = TD_STAR_PCT[Math.max(0, Math.min(3, stars))] ?? 0;
  const f = (k: 'goldmine' | 'sawmill'): number => Math.floor(((lim[k] ?? 0) * (BUILDINGS[k].levels[hq - 1]?.rate ?? 0) * pct) / 400);
  return { gold: f('goldmine'), wood: f('sawmill') };
}

/**
 * 开一局娱乐护航：岛是图自带的（不读存档的基地），能造的塔全开，英雄用关卡建议主寨等级对应的等级（护航不看养成，公平）。
 * 没有这一关就抛错（关 id 来自界面的固定列表，错了是代码问题）。
 */
export function escortSetup(levelId: string, seed: number): TdSetup {
  const level = ESCORT_LEVEL_BY_ID.get(levelId);
  if (!level) throw new Error(`没有这一关：${levelId}`);
  return escortSetupOf(level, seed);
}

/** 按一关的完整定义开局（娱乐读 escortlevels.ts，实盘读冻结副本 escortlivelevels.ts）；live：实盘，不设开局跟随 */
export function escortSetupOf(level: EscortLevel, seed: number, opts: { live?: boolean } = {}): TdSetup {
  const map = ESCORT_MAP_BY_ID.get(level.map as never);
  if (!map) throw new Error(`没有这张图：${level.map}`);
  return {
    layout: map.layout.map((b) => ({ ...b })),
    level,
    hero: Math.max(1, Math.min(level.hq, TD_HERO.length)),
    seed,
    rules: RULES_VERSION,
    mode: 'escort',
    garrison: [],
    bonus: {},
    // 震荡炮这一版先不进护航：护航有自己的规则版本和指纹，等单独配平
    unlocked: TD_TOWER_KINDS.filter((k) => k !== 'shock' && k !== 'sniper'),
    ...(opts.live ? {} : { escortAssist: true }),
  };
}

/** 这一关开着吗：第一张图三档一直开；后面的图要前一张图任一难度 ≥ 1★；不认识的关 false */
export function escortUnlocked(p: Profile, levelId: string): boolean {
  const lv = ESCORT_LEVEL_BY_ID.get(levelId);
  if (!lv) return false;
  const i = ESCORT_MAPS.findIndex((m) => m.id === lv.map);
  if (i <= 0) return i === 0;
  const prev = ESCORT_MAPS[i - 1]!.id;
  return ESCORT_LEVELS.some((l) => l.map === prev && starsOf(p, l.id) >= 1);
}

export interface EscortReward {
  /** 这一局实际给的（已按每日上限截过，不含首次星奖励） */
  gold: number;
  wood: number;
  /** 首次拿星的奖励（不计入每日上限） */
  bonusGold: number;
  bonusWood: number;
  /** 这一局新拿到几颗星（比这关历史最高多出来的） */
  newStars: number;
  /** 因为每日上限少给了 */
  capped: boolean;
  /** 因为仓库装不下少给了 */
  full: boolean;
  gotGold: number;
  gotWood: number;
  capGold: number;
  capWood: number;
  /** 这一局新开的图（第一关 id），没有为 null */
  unlocked: string | null;
}

/**
 * 结算一局护航。stars 取 result.stars（核心按到达时剩余血量定）。dayIndex 同守岛（北京时间天数）。
 * 与守岛共用 Profile.td 的 day / gotGold / gotWood，所以今天守岛拿满了护航就不再给资源，反之亦然。
 */
export function settleEscort(p: Profile, levelId: string, result: TdResult, dayIndex: number): Result<{ profile: Profile; reward: EscortReward }> {
  const lv: EscortLevel | undefined = ESCORT_LEVEL_BY_ID.get(levelId);
  if (!lv) return err('unknown');
  if (!escortUnlocked(p, levelId)) return err('locked');
  if (!result.over) return err('not_over');
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return err('bad_day');
  const stars = Math.max(0, Math.min(3, Math.floor(result.stars)));
  const prev = starsOf(p, levelId);
  const newStars = Math.max(0, stars - prev);
  const g = tdGrant(p, escortRunReward(lv, stars), { gold: newStars * lv.hq * TD_BONUS_PER_STAR.gold, wood: newStars * lv.hq * TD_BONUS_PER_STAR.wood }, dayIndex);
  const profile: Profile = {
    ...p,
    res: g.res,
    td: { stars: { ...(p.td?.stars ?? {}) }, day: dayIndex, gotGold: g.got.gold, gotWood: g.got.wood },
    escort: { stars: { ...(p.escort?.stars ?? {}), [levelId]: Math.max(prev, stars) } },
  };
  // 新开的图：这一局让前一张图第一次有了 ≥ 1★
  const mapIdx = ESCORT_MAPS.findIndex((m) => m.id === lv.map);
  const nextMap = ESCORT_MAPS[mapIdx + 1];
  const opened = !!nextMap && stars >= 1 && !escortUnlocked(p, `${nextMap.id}-easy`);
  return ok({
    profile,
    reward: {
      gold: g.run.gold, wood: g.run.wood, bonusGold: g.bonus.gold, bonusWood: g.bonus.wood, newStars,
      capped: g.capped, full: g.full,
      gotGold: g.got.gold, gotWood: g.got.wood, capGold: g.cap.gold, capWood: g.cap.wood,
      unlocked: opened ? `${nextMap!.id}-easy` : null,
    },
  });
}
