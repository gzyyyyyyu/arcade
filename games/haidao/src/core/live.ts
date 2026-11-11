/**
 * 悬赏出海（实盘，DESIGN.md 第 4 节）：带一份筹码，雇一支固定的船队去打一座悬赏岛，按星数和摧毁率结回。
 * 岛和船队都只由"档位 + 种子"决定（战役关卡做模板、按种子左右镜像），不看玩家自己的存档和别人的岛：
 * 期望只和打得好不好有关，模拟器量出来的就是所有人的期望。Worker 只从这里取档位表和 liveReturn。
 */
import { BUILDINGS, HQ_LEVELS, SKILLS, TROOPS } from '../content/index.ts';
import { BOUNTY_LEVELS } from '../content/bountylevels.ts';
import { ISLAND, RULES_VERSION } from './types.ts';
import type { ArmySetup, BattleResult, BattleSetup, SkillKind, TroopKind } from './types.ts';

export type LiveTier = 'small' | 'mid' | 'big' | 'lux';
export const LIVE_TIER_IDS: readonly LiveTier[] = ['small', 'mid', 'big', 'lux'];

export interface LiveTierDef {
  id: LiveTier;
  name: string;
  /** 一份多少筹码（docs/economy.md 第 2 节） */
  stake: number;
  /** 悬赏岛用哪一关的布局做模板 */
  level: string;
  /** 雇的船队：每条船的兵种、研究等级；技能和旗舰能量按 crewHq 级主寨 */
  crew: TroopKind[];
  crewLevel: number;
  crewHq: number;
  /** 每条船装多少人口（雇来的船队，不看玩家自己的船坞） */
  boatCap: number;
  /** 选档页的"电脑多强" */
  power: number;
  /**
   * 结回倍数（万分之一）：[0 星时按摧毁率线性折算的满值（0 星最多拆到 49%，所以 10_000 = 最多回 0.49 份）, 1 星, 2 星, 3 星]。
   * 按模拟器两种机器人的结局拟合到 docs/balance.md 第 2 节（DESIGN.md 4.2 有实测表）；同档星越多越高，档越高三星不降（单测锁住）。
   */
  bp: readonly [number, number, number, number];
}

export const LIVE_TIERS: Record<LiveTier, LiveTierDef> = {
  small: { id: 'small', name: '小', stake: 2_000, level: 'c07', crew: ['brute', 'brute', 'gunner', 'bomber', 'sailor'], crewLevel: 2, crewHq: 4, boatCap: 9, power: 1, bp: [10_000, 10_500, 12_000, 14_300] },
  mid: { id: 'mid', name: '中', stake: 10_000, level: 'c10', crew: ['brute', 'brute', 'gunner', 'bomber', 'sailor'], crewLevel: 3, crewHq: 4, boatCap: 10, power: 2, bp: [10_000, 8_300, 11_500, 14_300] },
  big: { id: 'big', name: '大', stake: 50_000, level: 'c16', crew: ['brute', 'brute', 'captain', 'gunner', 'gunner', 'bomber'], crewLevel: 4, crewHq: 6, boatCap: 12, power: 3, bp: [19_000, 10_300, 10_500, 20_000] },
  lux: { id: 'lux', name: '豪华', stake: 200_000, level: 'c16', crew: ['brute', 'brute', 'gunner', 'gunner', 'gunner', 'bomber'], crewLevel: 4, crewHq: 6, boatCap: 12, power: 4, bp: [10_000, 8_000, 11_200, 20_000] },
};

export function isLiveTier(v: unknown): v is LiveTier {
  return typeof v === 'string' && (LIVE_TIER_IDS as readonly string[]).includes(v);
}

/** 一场最多赢 3 份（结回 ≤ 带入 × 3，economy.md 第 2 节）；倍数按万分之一传 */
export const LIVE_MAX_BP = 30_000;

export function liveArmy(tier: LiveTier): ArmySetup {
  const t = LIVE_TIERS[tier];
  const boats = t.crew.map((troop) => ({ troop, count: troop === 'captain' ? 1 : Math.max(1, Math.floor(t.boatCap / TROOPS[troop].housing)), level: t.crewLevel }));
  const skills: ArmySetup['skills'] = [];
  for (const kind of Object.keys(SKILLS) as SkillKind[]) if (SKILLS[kind].unlockHq <= t.crewHq) skills.push({ kind, level: t.crewLevel });
  return { boats, skills, energy: HQ_LEVELS[t.crewHq - 1]?.energy ?? 0 };
}

/** 悬赏岛：关卡布局（悬赏专用的冻结副本 BOUNTY_LEVELS，战役改关不影响实盘），种子最低位决定左右镜像 */
export function liveSetup(tier: LiveTier, seed: number): BattleSetup {
  const lv = BOUNTY_LEVELS.find((l) => l.id === LIVE_TIERS[tier].level) ?? BOUNTY_LEVELS[0]!;
  const mirror = (seed & 1) === 1;
  const layout = lv.layout.map((b) => ({ ...b, x: mirror ? ISLAND - b.x - BUILDINGS[b.kind].size : b.x }));
  return { layout, army: liveArmy(tier), seed, rules: RULES_VERSION };
}

/** 结回倍数（万分之一）：0 星按摧毁率线性给，到 bp[0]；1–3 星按表 */
export function liveBp(tier: LiveTier, r: Pick<BattleResult, 'stars' | 'destroyedPct'>): number {
  const t = LIVE_TIERS[tier].bp;
  const stars = Math.max(0, Math.min(3, Math.floor(r.stars)));
  const v = stars === 0 ? Math.floor((t[0] * Math.max(0, Math.min(100, r.destroyedPct))) / 100) : t[stars]!;
  return Math.min(LIVE_MAX_BP, v);
}

/** 按桌上那一份的金额算结回 */
export function liveReturn(stake: number, bp: number): number {
  return Math.floor((stake * Math.max(0, Math.min(LIVE_MAX_BP, bp))) / 10_000);
}

// ---------------------------------------------------------------- 单向兑换

/** 一次换一份小档（2,000 筹码）；每天最多换几次（北京时间） */
export const EXCHANGE_CHIPS = 2_000;
export const EXCHANGE_PER_DAY = 2;
/** 2,000 筹码换多少（DESIGN.md 4.4：约等于主寨 2 级时全部金矿 5 小时的产量，不至于让建造和战役失去意义） */
export const EXCHANGE_GOLD = 2_000;
export const EXCHANGE_WOOD = 1_200;
