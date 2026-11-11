/**
 * 护航的出海与结算（娱乐版，不碰筹码）：9 关 = 3 张图 × 3 档难度（content/escortlevels.ts）。
 * 解锁：第一张图三档一直开着；后一张图要前一张图任一难度 ≥ 1★。
 * 结算和守岛共用 `Profile.td` 里的每日上限（settleTd 同款：超上限只记星、不给本局资源，首次拿星的奖励不计入上限）；
 * 星数另存在 `Profile.escort.stars`，不混进守岛的战役星。纯函数，不改入参。
 */
import { ESCORT_LEVEL_BY_ID, ESCORT_LEVELS, ESCORT_MAP_BY_ID, ESCORT_MAPS, TD_HERO } from '../content/index.ts';
import type { EscortLevel } from './escorttypes.ts';
import { TD_BONUS_PER_STAR, tdDailyCap, tdRunReward } from './tdrun.ts';
import { TD_TOWER_KINDS } from './td2types.ts';
import type { TdResult, TdSetup } from './tdtypes.ts';
import { RULES_VERSION } from './types.ts';
import type { Profile, Result } from './types.ts';

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T>(error: string): Result<T> => ({ ok: false, error });

const starsOf = (p: Profile, id: string): number => p.escort?.stars[id] ?? 0;

/**
 * 开一局护航：岛是图自带的（不读存档的基地），能造的塔全开，英雄用关卡建议主寨等级对应的等级（护航不看养成，公平）。
 * 没有这一关就抛错（关 id 来自界面的固定列表，错了是代码问题）。
 */
export function escortSetup(levelId: string, seed: number): TdSetup {
  const level = ESCORT_LEVEL_BY_ID.get(levelId);
  const map = level && ESCORT_MAP_BY_ID.get(level.map as never);
  if (!level || !map) throw new Error(`没有这一关：${levelId}`);
  return {
    layout: map.layout.map((b) => ({ ...b })),
    level,
    hero: Math.max(1, Math.min(level.hq, TD_HERO.length)),
    seed,
    rules: RULES_VERSION,
    mode: 'escort',
    garrison: [],
    bonus: {},
    // 震荡炮（规则版本 10）这一版先不进护航：护航有自己的规则版本和指纹，等单独配平
    unlocked: TD_TOWER_KINDS.filter((k) => k !== 'shock' && k !== 'sniper'),
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
  const profile: Profile = {
    ...p,
    res: { gold: p.res.gold + gold + bonusGold, wood: p.res.wood + wood + bonusWood },
    td: { ...td, day: dayIndex, gotGold: gotG + gold, gotWood: gotW + wood },
    escort: { stars: { ...(p.escort?.stars ?? {}), [levelId]: Math.max(prev, stars) } },
  };
  // 新开的图：这一局让前一张图第一次有了 ≥ 1★
  const mapIdx = ESCORT_MAPS.findIndex((m) => m.id === lv.map);
  const nextMap = ESCORT_MAPS[mapIdx + 1];
  const opened = !!nextMap && stars >= 1 && !escortUnlocked(p, `${nextMap.id}-easy`);
  return ok({
    profile,
    reward: {
      gold, wood, bonusGold, bonusWood, newStars,
      capped: gold < raw.gold || wood < raw.wood,
      gotGold: gotG + gold, gotWood: gotW + wood, capGold: cap.gold, capWood: cap.wood,
      unlocked: opened ? `${nextMap!.id}-easy` : null,
    },
  });
}
