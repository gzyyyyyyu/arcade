/** 战役：出海扣木材、结算掠夺和星数 */
import { CAMPAIGN, REPLAY_PCT, income } from '../content/index.ts';
import { armyFor, capacity, totalStars, trimArmy } from './base.ts';
import { Rng, hash32 } from './rng.ts';
import { RULES_VERSION } from './types.ts';
import type { BattleResult, BattleSetup, Profile, Res, Result, TroopKind } from './types.ts';

/** 首次拿到一颗星奖多少金币 */
export const STAR_BONUS_GOLD = 50;

/** 出海：木材不够整支船队就自动少带兵（trimArmy，trimmed 是少带了几个），一个兵都带不起才回 no_wood */
export function startCampaign(p: Profile, levelId: string, seed: number): Result<{ profile: Profile; setup: BattleSetup; trimmed: number }> {
  const lv = CAMPAIGN.find((l) => l.id === levelId);
  if (!lv || totalStars(p) < lv.reqStars) return { ok: false, error: 'locked' };
  const t = trimArmy(armyFor(p), p.res.wood);
  if (!t) return { ok: false, error: 'no_wood' };
  const profile: Profile = { ...p, res: { gold: p.res.gold, wood: p.res.wood - t.wood } };
  const setup: BattleSetup = {
    layout: lv.layout.map((b) => ({ ...b })),
    army: t.army,
    seed,
    rules: RULES_VERSION,
  };
  return { ok: true, value: { profile, setup, trimmed: t.trimmed } };
}

/** 连胜加成：每场 +10%，封顶 +50% */
export const STREAK_STEP_PCT = 10;
export const STREAK_MAX_PCT = 50;
/** 0 星的安慰奖：这关掠夺的百分之几，另给一点木材 */
export const CONSOLATION_PCT = 15;
export const CONSOLATION_WOOD = 10;

export type Drop =
  | { kind: 'gold' | 'wood'; amount: number }
  | { kind: 'cosmetic'; id: string; rare: true };

const TROOP_IDS = ['sailor', 'gunner', 'brute', 'bomber', 'captain', 'medic', 'cannoneer', 'harpooner'];
const SKIN_NAMES = ['gold', 'shadow', 'royal'];
/** 稀有掉落池：装饰和兵种皮肤 */
export const RARE_POOL: string[] = [
  'deco:statue',
  'deco:flagpole',
  'deco:chest',
  ...TROOP_IDS.flatMap((t) => SKIN_NAMES.map((n) => `skin:${t}:${n}`)),
];
/** 守岛每章全部过关送的纪念装饰（章号 → 收藏 id），都会动（画面层的 envfx）；不进掉宝池 */
export const TD_TROPHIES: Readonly<Record<number, string>> = { 1: 'deco:windmill', 2: 'deco:lighthouse', 3: 'deco:bonfire', 4: 'deco:wheel', 5: 'deco:lookout' };
/** 存档认得的全部收藏（掉宝池 + 纪念装饰）：读存档、校验快照按它过滤，没在这里的收藏和摆着的装饰都丢掉 */
export const COSMETICS: readonly string[] = [...RARE_POOL, ...Object.values(TD_TROPHIES)];

/**
 * 掉宝：带种子、确定性。1 星以上给 1 个普通掉落（金币或木材箱，量随星数和关卡掠夺涨）；
 * 稀有掉落按星数 3% / 6% / 10%；firstThree（首领岛首次三星）必掉一件稀有。owned 里已有的不重复掉。
 */
export function rollDrops(seed: number, result: BattleResult, levelId: string, owned: string[] = [], firstThree = false): Drop[] {
  const out: Drop[] = [];
  if (result.stars < 1) return out;
  const lv = CAMPAIGN.find((l) => l.id === levelId);
  const rng = new Rng(seed, `drops:${levelId}`);
  const base = lv?.loot ?? { gold: 300, wood: 150 };
  const pct = 4 * result.stars + rng.int(5);
  const box = income({ gold: Math.max(10, Math.floor((base.gold * pct) / 100)), wood: Math.max(10, Math.floor((base.wood * pct) / 100)) });
  if (rng.int(2) === 0) out.push({ kind: 'gold', amount: box.gold });
  else out.push({ kind: 'wood', amount: box.wood });
  const chance = result.stars === 1 ? 3 : result.stars === 2 ? 6 : 10;
  if (firstThree || rng.int(100) < chance) {
    const start = rng.int(RARE_POOL.length);
    for (let i = 0; i < RARE_POOL.length; i++) {
      const id = RARE_POOL[(start + i) % RARE_POOL.length] as string;
      if (!owned.includes(id) && !out.some((d) => d.kind === 'cosmetic' && d.id === id)) {
        out.push({ kind: 'cosmetic', id, rare: true });
        break;
      }
    }
  }
  return out;
}

/** 装备 / 卸下皮肤（要先有） */
export function equipSkin(p: Profile, troop: TroopKind, skin: string | null): Result<Profile> {
  const skins = { ...(p.skins ?? {}) };
  if (skin === null) delete skins[troop];
  else {
    if (!(p.cosmetics ?? []).includes(`skin:${troop}:${skin}`)) return { ok: false, error: 'locked' };
    skins[troop] = skin;
  }
  return { ok: true, value: { ...p, skins } };
}

/**
 * loot 是实际进了仓库的数量（含连胜加成、首次星级奖励、掉落的金币木材箱，都已乘收入倍率 INCOME_PCT，再按仓库上限截断），cut 是仓库满了截掉的。
 * 连胜：连续 ≥1 星的场数；0 星清零并给安慰奖。seed 用来掉宝（不传就按战绩算一个）。
 */
export function settleCampaign(
  p: Profile,
  levelId: string,
  result: BattleResult,
  seed?: number,
): { profile: Profile; loot: Res; cut: Res; newStars: number; streak: number; streakBonusPct: number; consolation: boolean; drops: Drop[] } {
  const lv = CAMPAIGN.find((l) => l.id === levelId);
  const prev = p.stars[levelId] ?? 0;
  const stars = Math.max(prev, result.stars);
  const newStars = stars - prev;
  const win = result.stars > 0;
  const streakBefore = p.stats.streak ?? 0;
  const bonusPct = win ? Math.min(STREAK_MAX_PCT, streakBefore * STREAK_STEP_PCT) : 0;
  let gold = 0;
  let wood = 0;
  if (lv) {
    if (win) {
      const pct = prev >= 3 ? REPLAY_PCT : 100;
      gold = Math.floor((lv.loot.gold * result.destroyedPct * pct) / 10000);
      wood = Math.floor((lv.loot.wood * result.destroyedPct * pct) / 10000);
      gold += Math.floor((gold * bonusPct) / 100);
      wood += Math.floor((wood * bonusPct) / 100);
      gold += newStars * STAR_BONUS_GOLD;
    } else {
      gold = Math.floor((lv.loot.gold * CONSOLATION_PCT) / 100);
      wood = Math.floor((lv.loot.wood * CONSOLATION_PCT) / 100) + CONSOLATION_WOOD;
    }
    // 收入倍率乘在结算里、不改关卡的 loot：流浪海盗岛（异步攻防，服务端重放）也读 lv.loot，那边不调
    ({ gold, wood } = income({ gold, wood }));
  }
  const owned = p.cosmetics ?? [];
  const firstThree = lv?.boss === true && prev < 3 && result.stars >= 3;
  const drops = rollDrops(seed ?? hash32(`${levelId}:${p.stats.attacks}`, p.stats.wins), result, levelId, owned, firstThree);
  const gain: string[] = [];
  for (const d of drops) {
    if (d.kind === 'gold') gold += d.amount;
    else if (d.kind === 'wood') wood += d.amount;
    else if (d.kind === 'cosmetic') gain.push(d.id);
  }
  const cap = capacity(p);
  const gotGold = Math.max(0, Math.min(gold, cap.gold - p.res.gold));
  const gotWood = Math.max(0, Math.min(wood, cap.wood - p.res.wood));
  const streak = win ? streakBefore + 1 : 0;
  const profile: Profile = {
    ...p,
    res: { gold: p.res.gold + gotGold, wood: p.res.wood + gotWood },
    stars: newStars > 0 ? { ...p.stars, [levelId]: stars } : p.stars,
    cosmetics: gain.length > 0 ? [...owned, ...gain] : owned,
    stats: {
      attacks: p.stats.attacks + 1,
      wins: p.stats.wins + (win ? 1 : 0),
      lootGold: p.stats.lootGold + gotGold,
      lootWood: p.stats.lootWood + gotWood,
      threeStars: (p.stats.threeStars ?? 0) + (stars >= 3 && prev < 3 ? 1 : 0),
      bossWins: (p.stats.bossWins ?? 0) + (lv?.boss && prev === 0 && win ? 1 : 0),
      dailyDone: p.stats.dailyDone ?? 0,
      maxStreak: Math.max(p.stats.maxStreak ?? 0, streak),
      streak,
    },
  };
  return { profile, loot: { gold: gotGold, wood: gotWood }, cut: { gold: gold - gotGold, wood: wood - gotWood }, newStars, streak, streakBonusPct: bonusPct, consolation: !win, drops };
}
