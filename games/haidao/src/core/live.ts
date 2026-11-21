/**
 * 悬赏出海（实盘，DESIGN.md 第 4 节）：带一份筹码，雇一支固定的船队去打一座悬赏岛，按星数和摧毁率结回。
 * 岛和船队都只由"档位 + 种子"决定（按种子从这一档的关卡池抽一座冻结的悬赏岛、左右镜像），不看玩家自己的存档和别人的岛：
 * 期望只和打得好不好有关，模拟器量出来的就是所有人的期望。四种实盘的档位表在 content/livetable.ts；Worker 只从这里取 liveReturn 和兑换常量。
 */
import { BUILDINGS, HQ_LEVELS, SKILLS, TROOPS } from '../content/index.ts';
import { BOUNTY_LEVELS } from '../content/bountylevels.ts';
import { BOUNTY_CREW, CHIP_SHOP, LIVE_TABLE, STREAK_LADDER, STREAK_PASS, type LiveKind, type LivePick } from '../content/livetable.ts';
import { ISLAND, RULES_VERSION } from './types.ts';
import type { ArmySetup, BattleResult, BattleSetup, Profile, SkillKind } from './types.ts';

export type LiveTier = 'small' | 'mid' | 'big' | 'lux';
export const LIVE_TIER_IDS: readonly LiveTier[] = ['small', 'mid', 'big', 'lux'];

export function isLiveTier(v: unknown): v is LiveTier {
  return typeof v === 'string' && (LIVE_TIER_IDS as readonly string[]).includes(v);
}

/** 一场最多赢 3 份（结回 ≤ 带入 × 3，economy.md 第 2 节）；倍数按万分之一传 */
export const LIVE_MAX_BP = 30_000;

/**
 * 这一场打哪一关（content/livetable.ts 的关卡池）：种子最低位留给左右镜像，其余位打散（整数哈希）后均匀抽一关。
 * 打散是为了和种子的低位脱钩：机器人按 seed % 4 挑登陆的那一边，直接取低位会让某一关只被从某两边打。
 * 只由"玩法 + 档位 + 种子"决定；Worker 不用知道（client 模式，结回倍数由浏览器按这一关的表算）。
 */
export function livePick(kind: LiveKind, tier: LiveTier, seed: number): LivePick {
  const pool = LIVE_TABLE[kind][tier].pool;
  return pool[pickHash(seed >>> 1) % pool.length]!;
}

/** 32 位整数打散（murmur3 的收尾），只用整数乘法 */
function pickHash(x: number): number {
  let h = x >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** 这一档池里最高的三星倍数：选档页、确认框写"最多赢多少" */
export function liveTopBp(kind: LiveKind, tier: LiveTier): number {
  return Math.min(LIVE_MAX_BP, Math.max(...LIVE_TABLE[kind][tier].pool.map((p) => p.bp[3])));
}

export function liveArmy(tier: LiveTier): ArmySetup {
  const t = BOUNTY_CREW[tier];
  const boats = t.crew.map((troop) => ({ troop, count: troop === 'captain' ? 1 : Math.max(1, Math.floor(t.boatCap / TROOPS[troop].housing)), level: t.level }));
  const skills: ArmySetup['skills'] = [];
  for (const kind of Object.keys(SKILLS) as SkillKind[]) if (SKILLS[kind].unlockHq <= t.hq) skills.push({ kind, level: t.level });
  return { boats, skills, energy: HQ_LEVELS[t.hq - 1]?.energy ?? 0 };
}

/** 悬赏岛：池里抽到的那一关（悬赏专用的冻结副本 BOUNTY_LEVELS，战役改关不影响实盘），种子最低位决定左右镜像 */
export function liveSetup(tier: LiveTier, seed: number): BattleSetup {
  const id = livePick('live', tier, seed).level;
  const lv = BOUNTY_LEVELS.find((l) => l.id === id);
  if (!lv) throw new Error(`悬赏出海没有这座岛：${id}`);
  const mirror = (seed & 1) === 1;
  const layout = lv.layout.map((b) => ({ ...b, x: mirror ? ISLAND - b.x - BUILDINGS[b.kind].size : b.x }));
  return { layout, army: liveArmy(tier), seed, rules: RULES_VERSION };
}

/** 结回倍数（万分之一）：0 星按摧毁率线性给，到 bp[0]；1–3 星按这一关的表 */
export function liveBp(tier: LiveTier, seed: number, r: Pick<BattleResult, 'stars' | 'destroyedPct'>): number {
  const t = livePick('live', tier, seed).bp;
  const stars = Math.max(0, Math.min(3, Math.floor(r.stars)));
  const v = stars === 0 ? Math.floor((t[0] * Math.max(0, Math.min(100, r.destroyedPct))) / 100) : t[stars]!;
  return Math.min(LIVE_MAX_BP, v);
}

/** 悬赏连闯一共几座 */
export const STREAK_ISLANDS = 3;

/** 连闯第 i 座（0 起）的种子：在带入的种子上按黄金比例错开，每座各自抽关、各自镜像 */
export function streakSeed(seed: number, i: number): number {
  return (seed + Math.imul(i, 0x9e3779b9)) >>> 0;
}

/** 连闯第 i 座的悬赏岛（同悬赏出海：池里抽、冻结副本、雇来的船队） */
export function streakSetup(tier: LiveTier, seed: number, i: number): BattleSetup {
  return liveSetup(tier, streakSeed(seed, i));
}

/** 这一座算不算过 */
export const streakPassed = (r: Pick<BattleResult, 'stars'>): boolean => r.stars >= STREAK_PASS;

/**
 * 连闯结回倍数：passed = 已经过了几座（0..3），stop = 自己收手（或三座全过）；否则是在第 passed + 1 座没过、或中途离开。
 * 三座全过一定按 win[2]。
 */
export function streakBp(tier: LiveTier, passed: number, stop: boolean): number {
  const L = STREAK_LADDER[tier];
  const k = Math.max(0, Math.min(STREAK_ISLANDS, Math.floor(passed)));
  if (k === STREAK_ISLANDS) return Math.min(LIVE_MAX_BP, L.win[2]);
  return Math.min(LIVE_MAX_BP, stop && k > 0 ? L.win[k - 1]! : L.fail[k]!);
}

/** 按桌上那一份的金额算结回 */
export function liveReturn(stake: number, bp: number): number {
  return Math.floor((stake * Math.max(0, Math.min(LIVE_MAX_BP, bp))) / 10_000);
}

// ---------------------------------------------------------------- 筹码装饰（DESIGN 4.7）

/** 筹码买到的收藏进存档：不在价目表里、已经有了都不改（重发的回话不会重复加） */
export function shopGrant(p: Profile, id: string): Profile {
  if (!(id in CHIP_SHOP) || p.cosmetics.includes(id)) return p;
  return { ...p, cosmetics: [...p.cosmetics, id] };
}

// ---------------------------------------------------------------- 单向兑换

/** 一次换一份小档（2,000 筹码）；每天最多换几次（北京时间） */
export const EXCHANGE_CHIPS = 2_000;
export const EXCHANGE_PER_DAY = 2;
/** 2,000 筹码换多少（DESIGN.md 4.4：约等于主寨 2 级时全部金矿 5 小时的产量，不至于让建造和战役失去意义） */
export const EXCHANGE_GOLD = 2_000;
export const EXCHANGE_WOOD = 1_200;
