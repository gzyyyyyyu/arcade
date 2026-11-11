/**
 * 悬赏守岛（实盘，DESIGN.md 10.5）：带一份筹码，守一座固定的悬赏岛，按星数和撑过的波数结回。
 * 岛、常驻塔、分叉、英雄等级都只由"档位 + 种子"决定（模板在 content/tdlive.ts，按种子最低位左右镜像），
 * 不看玩家自己的存档：期望只和局内决策（临时塔、英雄走位、技能、叫波）有关，模拟器量出来的就是所有人的期望。
 * Worker 只从这里取档位表和 tdLiveBp；金额换算复用 live.ts 的 liveReturn。
 */
import { BUILDINGS } from '../content/buildings.ts';
import { TD_LIVE_ISLANDS } from '../content/tdlive.ts';
import { LIVE_MAX_BP, LIVE_TIERS, type LiveTier } from './live.ts';
import { ISLAND, RULES_VERSION } from './types.ts';
import type { TdLevel, TdResult, TdSetup } from './tdtypes.ts';

export { LIVE_TIER_IDS, isLiveTier, liveReturn } from './live.ts';
export type { LiveTier } from './live.ts';

export interface TdLiveTierDef {
  id: LiveTier;
  name: string;
  /** 一份多少筹码：和悬赏出海是同一份钱包金额 */
  stake: number;
  /** 选档页的"电脑多强" */
  power: number;
  /**
   * 结回倍数（万分之一）：[0 星时按撑过的波数折算的满值（0 星最多回 0.79 份，所以 ≤ 7_900）, 1 星, 2 星, 3 星]。
   * 按 tools/td-live-sim.ts 两种机器人的结局拟合到 docs/balance.md 第 2 节（DESIGN.md 10.5 有实测表）；
   * 同档星越多越高，档越高三星不降（单测锁住）。
   */
  bp: readonly [number, number, number, number];
}

/** 0 星最多回 0.79 份：丢光宝藏就是输，不能比"勉强守住"更值（各档 1 星都在 0.80 份以上） */
export const TD_LIVE_ZERO_MAX_BP = 7_900;

/** 现在开放带入的档位：四档按每档 2,000 局配平后重开（0.29.1）。 */
export const TD_LIVE_OPEN: readonly LiveTier[] = ['small', 'mid', 'big', 'lux'];
export const tdLiveOpen = (t: unknown): t is LiveTier => typeof t === 'string' && (TD_LIVE_OPEN as readonly string[]).includes(t);

export const TD_LIVE_TIERS: Record<LiveTier, TdLiveTierDef> = {
  small: { id: 'small', name: '小', stake: LIVE_TIERS.small.stake, power: 1, bp: [4_900, 9_500, 11_500, 13_000] },
  mid: { id: 'mid', name: '中', stake: LIVE_TIERS.mid.stake, power: 2, bp: [4_900, 9_300, 11_000, 13_000] },
  big: { id: 'big', name: '大', stake: LIVE_TIERS.big.stake, power: 3, bp: [4_900, 8_100, 11_000, 15_000] },
  lux: { id: 'lux', name: '豪华', stake: LIVE_TIERS.lux.stake, power: 4, bp: [7_500, 8_000, 10_500, 16_000] },
};

const flip = (x: number, size: number): number => ISLAND - x - size;

/** 悬赏岛：模板，种子最低位决定左右镜像（登陆路、潮汐路、塔位、火药桶、障碍一起翻） */
export function tdLiveSetup(tier: LiveTier, seed: number): TdSetup {
  const t = TD_LIVE_ISLANDS[tier];
  const mirror = (seed & 1) === 1;
  if (!mirror) return { layout: t.layout.map((b) => ({ ...b })), level: t.level, hero: t.hero, seed, rules: RULES_VERSION, mode: 'live' };
  const lv = t.level;
  const pt = <P extends { x: number }>(p: P, size = 1): P => ({ ...p, x: flip(p.x, size) });
  const level: TdLevel = {
    ...lv,
    lanes: lv.lanes.map((p) => pt(p)),
    ...(lv.tide ? { tide: { wave: lv.tide.wave, lane: pt(lv.tide.lane) } } : {}),
    kegs: lv.kegs.map((p) => pt(p)),
    obstacles: lv.obstacles.map((o) => pt(o, o.size)),
    slots: lv.slots.map((p) => pt(p, 2)),
  };
  const layout = t.layout.map((b) => ({ ...b, x: flip(b.x, BUILDINGS[b.kind].size) }));
  return { layout, level, hero: t.hero, seed, rules: RULES_VERSION, mode: 'live' };
}

/**
 * 结回倍数（万分之一）：0 星按撑过的波数给（凹曲线），到 bp[0]；1–3 星按表。封顶 LIVE_MAX_BP。
 * 0 星就是宝藏丢光，按宝藏剩余折算永远是 0，所以按"撑过几波"折算才有意义。
 */
export function tdLiveBp(tier: LiveTier, r: Pick<TdResult, 'stars' | 'waves' | 'total'>): number {
  const t = TD_LIVE_TIERS[tier].bp;
  const stars = Math.max(0, Math.min(3, Math.floor(r.stars)));
  if (stars > 0) return Math.min(LIVE_MAX_BP, t[stars]!);
  const total = Math.max(1, r.total);
  const done = Math.max(0, Math.min(total, Math.floor(r.waves)));
  // 凹曲线 1 − (1 − 撑过的比例)³：撑过前几波就能拿回大半，和"丢光了"的分别主要在有没有撑到后面，
  // 免得电脑打不过的高档把小白的期望压到几乎全输（整数运算，不用浮点）
  const rest = total - done;
  const cube = total * total * total;
  return Math.min(LIVE_MAX_BP, TD_LIVE_ZERO_MAX_BP, Math.floor((t[0] * (cube - rest * rest * rest)) / cube));
}
