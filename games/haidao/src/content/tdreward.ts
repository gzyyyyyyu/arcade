import type { Res } from '../core/types.ts';
import { CAMPAIGN } from './campaign.ts';
import { HQ_LEVELS } from './hq.ts';
import { INCOME_PCT, REPLAY_PCT } from './income.ts';

/**
 * 守岛（战役和海盗来袭）的奖励表（DESIGN 10.4）。
 * 守岛一局 6–7 分钟、出海一场约 3 分钟，要每分钟收入对得上，3★ 一局就等于"同主寨等级的战役关满 3★ 重打 TD_RUN_RAIDS 场"：
 * 这一级战役关 loot 的平均 × REPLAY_PCT × INCOME_PCT × TD_RUN_RAIDS，取整到 10。从关卡表推出来，改战役掠夺这里跟着变；
 * tests/td-run.test.ts 锁住公式和 1–8 级的数。
 */
export const TD_RUN_RAIDS = 2;
/** 1★ / 2★ / 3★ 拿 3★ 奖励的百分之几；0★ 不给 */
export const TD_STAR_PCT = [0, 40, 70, 100];
/** 每天守岛收入上限 = 当前主寨等级 3★ 一局 × 这么多局（战役、海盗来袭、护航共用） */
export const TD_CAP_RUNS = 6;
/** 每个首次拿到的星另给（乘关卡建议主寨等级）：不计入每日上限 */
export const TD_BONUS_PER_STAR: Res = { gold: 90, wood: 45 };

const round10 = (v: number): number => Math.round(v / 10) * 10;

function runReward(hq: number): Res {
  const lv = CAMPAIGN.filter((l) => l.hq === hq);
  const avg = (k: keyof Res): number => lv.reduce((s, l) => s + l.loot[k], 0) / Math.max(1, lv.length);
  const f = (k: keyof Res): number => round10((avg(k) * REPLAY_PCT * INCOME_PCT[k] * TD_RUN_RAIDS) / 10000);
  return { gold: f('gold'), wood: f('wood') };
}

/** 主寨 1–8 级（下标 0–7）守岛 3★ 一局的金币木材 */
export const TD_RUN_REWARD: readonly Res[] = Array.from({ length: HQ_LEVELS.length }, (_, i) => runReward(i + 1));
