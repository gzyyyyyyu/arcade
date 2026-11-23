/**
 * 每日三件小事（base.md 第③批）：每天（北京时间天数，画面传入）从池里抽 3 件，做到就能领金币木材，三件都领了再开一个箱子。
 * 抽哪三件只看天数和有没有平台（没平台抽不到抢劫、切磋、试打），同一天怎么升级都不变。只给金币木材和装饰，不给筹码。
 */
import { CAMPAIGN, REPLAY_PCT, income } from '../content/index.ts';
import { capacity, hqLevel } from './base.ts';
import { Rng, hash32 } from './rng.ts';
import { rollDrops } from './run.ts';
import type { GoalKind, Profile, Res, Result } from './types.ts';

export interface GoalDef {
  need: number;
  text: string;
  /** 要平台（登录了、接口没关）才能做 */
  online?: boolean;
}

export const GOALS: Readonly<Record<GoalKind, GoalDef>> = {
  sail: { need: 2, text: '出海打 2 场' },
  star: { need: 4, text: '拿 4 颗星' },
  raid: { need: 1, text: '抢劫一次', online: true },
  td: { need: 1, text: '守岛或海盗来袭一局' },
  upgrade: { need: 2, text: '升级 2 次建筑' },
  collect: { need: 1, text: '收一次矿' },
  duel: { need: 1, text: '切磋或复仇一次', online: true },
  scrim: { need: 1, text: '试打自己的岛一次', online: true },
};
export const GOAL_KINDS = Object.keys(GOALS) as GoalKind[];
/** 每件的奖励 = 同主寨等级最难那关三星重打掠夺的百分之几 */
export const GOAL_REWARD_PCT = 50;
/** 三件都领了的箱子在 got 里的记号 */
export const GOAL_BOX = 'box';

/** 今天抽到的三件（确定性：同一天、同样有没有平台，结果相同） */
export function goalPicks(day: number, online: boolean): GoalKind[] {
  const pool = GOAL_KINDS.filter((k) => online || !GOALS[k].online);
  const rng = new Rng(day, 'goals');
  const out: GoalKind[] = [];
  while (out.length < 3 && pool.length > 0) out.push(pool.splice(rng.int(pool.length), 1)[0]!);
  return out;
}

/** 今天的进度（跨天自动清零；没写 = 今天还没开始） */
export function goalState(p: Profile, day: number): { prog: Partial<Record<GoalKind, number>>; got: string[] } {
  const g = p.goals;
  return g && g.day === day ? { prog: g.prog, got: g.got } : { prog: {}, got: [] };
}

/** 记一笔：哪件事做了 n 次（每件封顶到要求的次数；不管抽没抽到都记，换平台状态也不丢） */
export function goalTick(p: Profile, day: number, kind: GoalKind, n = 1): Profile {
  if (n <= 0) return p;
  const s = goalState(p, day);
  const have = s.prog[kind] ?? 0;
  const need = GOALS[kind].need;
  if (have >= need) return p;
  return { ...p, goals: { day, prog: { ...s.prog, [kind]: Math.min(need, have + n) }, got: s.got } };
}

/** 主寨这一级能打的最难那关（关卡要求的主寨不超过自己） */
function goalLevel(p: Profile): (typeof CAMPAIGN)[number] {
  const hq = hqLevel(p);
  let lv = CAMPAIGN[0]!;
  for (const l of CAMPAIGN) if (l.hq <= hq) lv = l;
  return lv;
}

/** 一件的奖励：同主寨最难那关三星重打的掠夺 × GOAL_REWARD_PCT%（已乘收入倍率） */
export function goalReward(p: Profile): Res {
  const lv = goalLevel(p);
  const f = (v: number): number => Math.floor((v * REPLAY_PCT * GOAL_REWARD_PCT) / 10000);
  return income({ gold: f(lv.loot.gold), wood: f(lv.loot.wood) });
}

/** 能领的有几件（含箱子；海图红点用） */
export function goalsClaimable(p: Profile, day: number, online: boolean): number {
  const s = goalState(p, day);
  const picks = goalPicks(day, online);
  const n = picks.filter((k) => !s.got.includes(k) && (s.prog[k] ?? 0) >= GOALS[k].need).length;
  return n + (picks.every((k) => s.got.includes(k)) && !s.got.includes(GOAL_BOX) ? 1 : 0);
}

const fits = (p: Profile, r: Res): boolean => {
  const cap = capacity(p);
  return p.res.gold + r.gold <= cap.gold && p.res.wood + r.wood <= cap.wood;
};

/**
 * 领一件（或三件都领了之后的箱子）。错误码：not_today（今天没抽到）、not_done、got（领过了）、full（仓库放不下，留着今天再领）。
 * 箱子用战役掉宝同一套（rollDrops 按一星算：一个金币或木材箱，3% 掉一件稀有装饰或皮肤）。
 */
export function claimGoal(p: Profile, day: number, online: boolean, id: GoalKind | typeof GOAL_BOX): Result<{ profile: Profile; reward: Res; cosmetic?: string }> {
  const s = goalState(p, day);
  const picks = goalPicks(day, online);
  if (s.got.includes(id)) return { ok: false, error: 'got' };
  let reward: Res;
  let cosmetic: string | undefined;
  if (id === GOAL_BOX) {
    if (!picks.every((k) => s.got.includes(k))) return { ok: false, error: 'not_done' };
    const drops = rollDrops(hash32('goals-box', day), { over: true, stars: 1, destroyedPct: 100, hqDown: true }, goalLevel(p).id, p.cosmetics ?? [], false, hqLevel(p));
    reward = { gold: 0, wood: 0 };
    for (const d of drops) {
      if (d.kind === 'cosmetic') cosmetic = d.id;
      else reward[d.kind] += d.amount;
    }
  } else {
    if (!picks.includes(id)) return { ok: false, error: 'not_today' };
    if ((s.prog[id] ?? 0) < GOALS[id].need) return { ok: false, error: 'not_done' };
    reward = goalReward(p);
  }
  if (!fits(p, reward)) return { ok: false, error: 'full' };
  const profile: Profile = {
    ...p,
    res: { gold: p.res.gold + reward.gold, wood: p.res.wood + reward.wood },
    goals: { day, prog: s.prog, got: [...s.got, id] },
    ...(cosmetic ? { cosmetics: [...(p.cosmetics ?? []), cosmetic] } : {}),
  };
  return { ok: true, value: { profile, reward, ...(cosmetic ? { cosmetic } : {}) } };
}
