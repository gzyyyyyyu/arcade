import type { Res } from '../core/types.ts';

/**
 * 游戏资源收入的总倍率（11-16 收益上调，DESIGN 2.3）：金矿 / 伐木场产量、战役出海和每日悬赏的掠夺、掉落的金币木材箱都乘它。
 * 金币多给一点是因为模拟里金币一直是瓶颈（tools/econ.ts）。只管娱乐的资源；实盘的筹码结回、异步攻防的掠夺不经过这里。
 * 单独一个文件、不引别的内容表：buildings.ts 要用它，战役表又依赖 buildings.ts，放一起会成环。
 */
export const INCOME_PCT: Res = { gold: 170, wood: 130 };

/** 已经三星的战役关再打只给这么多（百分比） */
export const REPLAY_PCT = 30;

/** 按 INCOME_PCT 放大一笔收入（向下取整） */
export function income(r: Res): Res {
  return { gold: Math.floor((r.gold * INCOME_PCT.gold) / 100), wood: Math.floor((r.wood * INCOME_PCT.wood) / 100) };
}
