/** 每局不一样（DESIGN 15）的数值：漂流宝箱和中途援军。规则在 core/fun.ts，开关在 BattleSetup.fun */
import type { ChestReward, TroopKind } from '../core/types.ts';

export const FUN = {
  /** 旗舰能量上限（和 battle.ts 的 ENERGY_CAP 同一个数） */
  energyCap: 20,
  /** 撤回窗口：落地后多少拍内（0.5 秒） */
  recallTicks: 10,
  chest: {
    /** 每局撒几个：min..min+extra-1 */
    min: 2,
    extra: 2,
    /** 兵走到离箱子多近（单位）就算捡到 */
    pickR: 200,
    /** 箱子之间至少隔几格（切比雪夫距离） */
    gap: 4,
    /** 三种奖励：加几点能量、全队回血百分比、挨打减半持续几拍 */
    energy: 3,
    healPct: 30,
    shieldTicks: 160,
    shieldCutPct: 50,
    rewards: ['energy', 'heal', 'shield'] as readonly ChestReward[],
  },
  ally: {
    /** 靠岸拍：min..min+span-1（25–40 秒） */
    atMin: 500,
    atSpan: 300,
    /** 提前多少拍预告（3 秒） */
    warnTicks: 60,
    /** 援军总血量约占玩家船队总血量的百分比 */
    hpPct: 10,
    maxCount: 8,
    kinds: ['sailor', 'gunner', 'brute'] as readonly TroopKind[],
  },
} as const;

/** 战役娱乐局的开关：两样都开。悬赏、实盘、异步攻防、寻宝航线、守岛不用它（DESIGN 15） */
export const CAMPAIGN_FUN = { chest: true, ally: true } as const;
