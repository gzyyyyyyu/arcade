/**
 * 海盗王阶：主寨 8 级以后的金币、木材出口（DESIGN 2.6）。只给外观和展示（称号、岛上的王旗、战绩卡边框、出海船帆），
 * 不进任何战斗、守岛、悬赏、攻防的数值：规则核心只有 rank.ts 读这张表，tests/rank.test.ts 锁住"有没有王阶，打起来逐位一样"。
 *
 * 价：第 n 阶金币约 40,000 × 1.35^(n-1)、木材约 15,000 × 1.35^(n-1)，取整到千 / 五百；10 阶合计 218.3 万金币、82 万木材，
 * 约是 8 级玩家 14 天的收入（每天约 15.7 万金币 / 7.2 万木材，2026-11-06 经济模型），先按这个定，看真人数据再调。
 * 后几阶比 8 级仓库上限（16.2 万）还贵，所以是分几次"献上"攒满（donateRank），不是一次付清。
 */
import type { Res } from '../core/types.ts';

export interface PirateRank {
  /** 称号里的名字（"海盗王阶 3 · 银锚"） */
  name: string;
  cost: Res;
  /** 王旗、船帆的主色和镶边色（画面层用） */
  color: number;
  trim: number;
}

export const RANKS: readonly PirateRank[] = [
  { name: '铁锚', cost: { gold: 40_000, wood: 15_000 }, color: 0x6b7480, trim: 0xc9d1d9 },
  { name: '铜锚', cost: { gold: 54_000, wood: 20_500 }, color: 0x9a5b2e, trim: 0xe8b07a },
  { name: '银锚', cost: { gold: 73_000, wood: 27_500 }, color: 0x8fa3b8, trim: 0xf2f6fa },
  { name: '金锚', cost: { gold: 98_000, wood: 37_000 }, color: 0xc8901c, trim: 0xffe08a },
  { name: '黑帆', cost: { gold: 133_000, wood: 50_000 }, color: 0x23262e, trim: 0xd8c27a },
  { name: '赤帆', cost: { gold: 179_000, wood: 67_500 }, color: 0xa3242c, trim: 0xffd27a },
  { name: '金帆', cost: { gold: 242_000, wood: 91_000 }, color: 0xd9a21b, trim: 0xfff3c4 },
  { name: '海王冠', cost: { gold: 327_000, wood: 122_500 }, color: 0x1d5f8f, trim: 0xffd54a },
  { name: '深海王冠', cost: { gold: 441_000, wood: 165_500 }, color: 0x2b2a6b, trim: 0x7ef0ff },
  { name: '海盗王', cost: { gold: 596_000, wood: 223_500 }, color: 0x5a0f1c, trim: 0xffd700 },
];

/** 主寨几级开放王阶 */
export const RANK_HQ = 8;
