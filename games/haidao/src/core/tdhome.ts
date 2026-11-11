/**
 * 海盗来袭（守岛 2.0 的"守自己的岛"）：用玩家自己的岛和布局（常驻塔照常开火、按基地等级表，木台、火药桶由 placeTdLevel 挑空的摆），
 * 波次按 waveBudget 现生成，打满 TD2_HOME.maxWaves 波或丢到 TD2_LOSE_AT 枚为止；不算星、不进难度曲线，
 * 按撑住的波数给奖励，和战役共用守岛的每日上限（Profile.td 的 day / gotGold / gotWood），不加存档字段。
 * 奖励表、候选位置、开局金这些数在 content/td2units.ts 的 TD2_HOME。纯函数，不改入参。
 */
import { TD2_ENEMY_POINTS, TD2_HOME } from '../content/td2units.ts';
import { hqLevel } from './base.ts';
import { Rng } from './rng.ts';
import { waveBudget } from './td2types.ts';
import type { TdHomeGen, TdHomeReward, TdHomeSnapshot } from './td2types.ts';
import { heroLevel } from './tdbase.ts';
import { placeTdLevel, tdBaseBonus, tdDailyCap, tdRunReward, tdUnlockedTowers } from './tdrun.ts';
import type { TdPlacedLevel } from './tdrun.ts';
import type { TdEnemyKind, TdGroup, TdResult, TdSetup, TdWave } from './tdtypes.ts';
import { RULES_VERSION } from './types.ts';
import type { Profile, Res, Result } from './types.ts';

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T>(error: string): Result<T> => ({ ok: false, error });

/** 落潮路从第几波（0 起）起开着 */
const HOME_TIDE_WAVE = 4;
/** 首领波：每 10 波最后一波来一个船长 */
const HOME_BOSS_EVERY = 10;
/** 一波最多几组（组内同一种敌人走同一路） */
const HOME_GROUPS = 4;

/** 某种敌人从第几波（0 起）开始出现：先水手，再铁甲、小艇、鹦鹉、雾船、工兵（和战役教机制的顺序一样） */
const HOME_FROM: ReadonlyArray<[TdEnemyKind, number]> = [
  ['sailor', 0], ['ironclad', 2], ['skiff', 3], ['parrot', 4], ['fog', 5], ['sapper', 7],
  // 规则版本 10：掷弹兵（gen.rules < 10 的旧局不出，波次逐位不变）
  ['grenadier', 6],
  // 规则版本 11：盾兵第 9 波起（gen.rules < 11 的旧局不出，大潮不放）
  ['shield', 8],
];

/** 每种敌人一组里隔几拍上一个 */
const EVERY: Readonly<Record<TdEnemyKind, number>> = {
  sailor: 22, ironclad: 50, fog: 30, skiff: 45, skiffling: 20, sapper: 40, parrot: 18, captain: 1, grenadier: 40, shield: 45,
};

/** 从存档取岛快照（布局深拷贝、主寨等级、英雄等级） */
export function tdHomeSnapshot(p: Profile): TdHomeSnapshot {
  return {
    layout: p.base.buildings.map((b) => ({ ...b, ...(b.branch ? { branch: [...b.branch] } : {}) })),
    hq: hqLevel(p),
    hero: heroLevel(p),
  };
}

/** 波次生成参数：等效关按主寨等级查 TD2_HOME.levelByHq，种子由界面给（和战役一样） */
export function tdHomeGen(snap: TdHomeSnapshot, seed: number): TdHomeGen {
  const t = TD2_HOME.levelByHq;
  const i = Math.max(0, Math.min(t.length - 1, Math.floor(snap.hq) - 1));
  return { levelIndex: t[i] ?? 0, seed, gold: TD2_HOME.gold, first: TD2_HOME.first, waveTicks: TD2_HOME.waveTicks, rules: RULES_VERSION };
}

/**
 * 第 w 波（0 起）：只由 gen 和波数决定（同一个 gen 重放出同一局），预算 = waveBudget(gen.levelIndex, w)。
 * 每 10 波的最后一波先放一个船长（首领波）；剩下的预算平分给至多 4 组，每组随机挑一种已经出场的敌人、随机挑一路
 * （开几路随波数加：前 3 波只走 0 号路，往后每 3 波多开一路；落潮路从第 5 波起算进来）。
 */
export function tdHomeWave(gen: TdHomeGen, w: number): TdWave {
  const rng = new Rng(gen.seed, `td-home-wave-${w}`);
  let left = waveBudget(gen.levelIndex, w);
  const groups: TdGroup[] = [];
  const boss = (w + 1) % HOME_BOSS_EVERY === 0;
  if (boss) {
    groups.push({ enemy: 'captain', n: 1, lane: 0, every: EVERY.captain, delay: 60 });
    left = Math.max(0, left - TD2_ENEMY_POINTS.captain);
  }
  const lanes = TD2_HOME.lanes.length + (w >= HOME_TIDE_WAVE ? 1 : 0);
  const open = Math.max(1, Math.min(lanes, 1 + Math.floor(w / 3)));
  const pool = HOME_FROM.filter(([k, from]) => w >= from && (k !== 'grenadier' || (gen.rules ?? 9) >= 10) && (k !== 'shield' || (gen.rules ?? 9) >= 11)).map(([k]) => k);
  for (let g = 0; g < HOME_GROUPS && left > 0; g++) {
    const kind = pool[rng.int(pool.length)] as TdEnemyKind;
    const pts = TD2_ENEMY_POINTS[kind];
    const share = Math.floor(left / (HOME_GROUPS - g));
    let n = Math.max(1, Math.floor(share / pts));
    if (n * pts > left) n = Math.floor(left / pts);
    if (n <= 0) continue;
    left -= n * pts;
    // 落潮路下标 = 陆上的路数（和关卡的约定一致）
    const lane = rng.int(open);
    groups.push({ enemy: kind, n, lane, every: EVERY[kind], delay: g * 40 });
  }
  const wave: TdWave = boss ? { groups, boss: true } : { groups };
  // 规则版本 10：掷弹兵第一次成组出现的那几波，预告卡提醒先用火
  if (w < 14 && groups.some((g) => g.enemy === 'shield')) wave.note = '盾兵：正面挡枪炮，用溅射、爆破';
  else if (w < 12 && groups.some((g) => g.enemy === 'grenadier')) wave.note = '掷弹兵：先用火';
  return wave;
}

/** 开一局海盗来袭：TdSetup.mode = 'home'，level 由 TD2_HOME 的候选位置（按玩家布局挑空的摆）和 tdHomeWave 拼出，一共 maxWaves 波 */
export function tdHomeSetup(p: Profile, seed: number): Result<TdSetup> {
  if (!Number.isInteger(seed)) return err('bad_seed');
  const snap = tdHomeSnapshot(p);
  const gen = tdHomeGen(snap, seed);
  const raw: TdPlacedLevel = {
    id: 'home',
    name: '海盗来袭',
    hq: snap.hq,
    hpPct: 100,
    gold: gen.gold,
    first: gen.first,
    waveTicks: gen.waveTicks,
    lanes: TD2_HOME.lanes.map((l) => ({ ...l })),
    tide: { wave: HOME_TIDE_WAVE, lane: { ...TD2_HOME.tide } },
    waves: Array.from({ length: TD2_HOME.maxWaves }, (_, w) => tdHomeWave(gen, w)),
    kegs: TD2_HOME.kegs.map((k) => ({ ...k })),
    obstacles: [],
    slots: TD2_HOME.slots.map((s) => ({ ...s })),
    place: { slots: TD2_HOME.slots.length, kegs: TD2_HOME.kegs.length, wrecks: 0, barrels: 0 },
  };
  return ok({
    layout: snap.layout,
    level: placeTdLevel(raw, snap.layout),
    hero: snap.hero,
    seed,
    rules: gen.rules ?? RULES_VERSION,
    mode: 'home',
    bonus: tdBaseBonus(p),
    unlocked: tdUnlockedTowers(p),
    home: gen,
  });
}

/** 撑住 waves 波的原始奖励（还没按每日上限截）：tdRunReward(主寨, 3★) × perWavePct% × min(waves, maxWaves) */
export function tdHomeRawReward(hq: number, waves: number): Res {
  const w = Math.max(0, Math.min(TD2_HOME.maxWaves, Math.floor(waves)));
  const r = tdRunReward({ hq }, 3);
  return { gold: Math.floor((r.gold * TD2_HOME.perWavePct * w) / 100), wood: Math.floor((r.wood * TD2_HOME.perWavePct * w) / 100) };
}

/** 结算一局海盗来袭：按每日上限截（和 settleTd 共用 Profile.td 的 day / gotGold / gotWood），不记星。dayIndex 同 settleTd */
export function settleTdHome(p: Profile, result: TdResult, dayIndex: number): Result<{ profile: Profile; reward: TdHomeReward }> {
  if (!result.over) return err('not_over');
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return err('bad_day');
  const waves = Math.max(0, Math.min(TD2_HOME.maxWaves, Math.floor(result.waves)));
  const td = p.td ?? { stars: {}, day: dayIndex, gotGold: 0, gotWood: 0 };
  const sameDay = td.day === dayIndex;
  const cap = tdDailyCap(p);
  const gotG = sameDay ? td.gotGold : 0;
  const gotW = sameDay ? td.gotWood : 0;
  const raw = tdHomeRawReward(hqLevel(p), waves);
  const gold = Math.max(0, Math.min(raw.gold, cap.gold - gotG));
  const wood = Math.max(0, Math.min(raw.wood, cap.wood - gotW));
  const profile: Profile = {
    ...p,
    res: { gold: p.res.gold + gold, wood: p.res.wood + wood },
    td: { stars: { ...td.stars }, day: dayIndex, gotGold: gotG + gold, gotWood: gotW + wood },
  };
  return ok({ profile, reward: { waves, gold, wood, capped: gold < raw.gold || wood < raw.wood } });
}
