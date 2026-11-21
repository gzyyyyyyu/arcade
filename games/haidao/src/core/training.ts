/**
 * 训练营的规则（DESIGN 16）：开局、过关记账、奖励进「一键收取」。岛、部队、守岛关都只由关卡表定，不看存档里的养成。
 */
import { TD2_LEVEL_BY_ID } from '../content/td2levels.ts';
import { TRAIN_BY_ID, TRAIN_LESSONS, TRAIN_TD_LEVEL, TRAIN_TD_WAVES, TRAIN_TROOP_LEVEL, type TrainLesson } from '../content/training.ts';
import { capacity, hqLevel } from './base.ts';
import type { TdTowerKind } from './td2types.ts';
import type { TdSetup } from './tdtypes.ts';
import { RULES_VERSION, type BattleSetup, type Profile, type Res, type Result } from './types.ts';

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T>(error: string): Result<T> => ({ ok: false, error });

/** 守岛关能造的塔：第一关的三种基础塔 */
const TRAIN_TD_TOWERS: readonly TdTowerKind[] = ['cannon', 'gunTower', 'mortar'];
/** 守岛关开局圈出来的木台和先造什么（守岛第一关的岛：0 号台挨着登陆路的拐弯、1 号台在路对面；守岛机器人三档开局也都先造这两块） */
export const TRAIN_TD_OPENER: ReadonlyArray<{ slot: number; kind: TdTowerKind }> = [
  { slot: 0, kind: 'cannon' },
  { slot: 1, kind: 'gunTower' },
];

/** 训练营登陆战用的种子：同一关每次打都一样，提示说的情形一定会出现 */
export const TRAIN_SEED = 1;

export function trainOpen(p: Profile, l: TrainLesson): boolean {
  return hqLevel(p) >= l.hq;
}

export function trainDone(p: Profile, id: string): boolean {
  return p.train?.done.includes(id) ?? false;
}

/** 已开放、还没过的第一关（引导和红点用）；都过了或都没开放为 null */
export function nextLesson(p: Profile): TrainLesson | null {
  return TRAIN_LESSONS.find((l) => trainOpen(p, l) && !trainDone(p, l.id)) ?? null;
}

/** 登陆战关的开局（守岛关回 null） */
export function trainSetup(l: TrainLesson, seed: number): BattleSetup | null {
  if (!l.layout || !l.boats) return null;
  return {
    layout: l.layout.map((b) => ({ ...b })),
    army: { boats: l.boats.map((b) => ({ troop: b.troop, count: b.count, level: TRAIN_TROOP_LEVEL })), skills: [], energy: 0 },
    seed,
    rules: RULES_VERSION,
  };
}

/** 守岛关的开局：守岛第一关的岛，只打前 TRAIN_TD_WAVES 波，开局圈出 TRAIN_TD_OPENER；英雄 1 级、没有驻守塔和基地加成 */
export function trainTdSetup(seed: number): TdSetup {
  const lv = TD2_LEVEL_BY_ID.get(TRAIN_TD_LEVEL);
  if (!lv) throw new Error(`训练营守岛关借的 ${TRAIN_TD_LEVEL} 不存在`);
  return {
    layout: lv.layout.map((b) => ({ ...b })),
    level: { ...lv, waves: lv.waves.slice(0, TRAIN_TD_WAVES), opener: TRAIN_TD_OPENER },
    hero: 1,
    seed,
    rules: RULES_VERSION,
    mode: 'campaign',
    garrison: [],
    bonus: {},
    unlocked: [...TRAIN_TD_TOWERS],
  };
}

/**
 * 打完一关：过了（登陆战 ≥1 星、守岛守住）而且是第一次，记下并把奖励记成待领。
 * reward = 这次新记的待领（没有为 null）
 */
export function trainFinish(p: Profile, id: string, passed: boolean): Result<{ profile: Profile; reward: Res | null }> {
  const l = TRAIN_BY_ID.get(id);
  if (!l) return err('unknown');
  if (!passed || trainDone(p, id)) return ok({ profile: p, reward: null });
  const t = p.train ?? { done: [] };
  const owed = { gold: (t.owed?.gold ?? 0) + l.reward.gold, wood: (t.owed?.wood ?? 0) + l.reward.wood };
  return ok({ profile: { ...p, train: { done: [...t.done, id], owed } }, reward: { ...l.reward } });
}

/** 领训练营的待领奖励：仓库放得下多少收多少，剩下的还留着待领 */
export function claimTrain(p: Profile): { profile: Profile; got: Res; left: Res } {
  const owed = p.train?.owed;
  const none = { gold: 0, wood: 0 };
  if (!owed || !p.train) return { profile: p, got: none, left: none };
  const cap = capacity(p);
  const got = { gold: Math.max(0, Math.min(owed.gold, cap.gold - p.res.gold)), wood: Math.max(0, Math.min(owed.wood, cap.wood - p.res.wood)) };
  const left = { gold: owed.gold - got.gold, wood: owed.wood - got.wood };
  const train = left.gold > 0 || left.wood > 0 ? { done: p.train.done, owed: left } : { done: p.train.done };
  return { profile: { ...p, res: { gold: p.res.gold + got.gold, wood: p.res.wood + got.wood }, train }, got, left };
}

/** 有训练营奖励而且仓库还放得下（一键收取钮和「建造」红点用） */
export function trainClaimable(p: Profile): boolean {
  const g = claimTrain(p).got;
  return g.gold + g.wood > 0;
}
