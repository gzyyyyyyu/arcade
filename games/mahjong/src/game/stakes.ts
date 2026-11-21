/**
 * 档位（docs/economy.md 第 2 节，各游戏同一张表）和麻将的底分（DESIGN.md 第 4 节）。
 * 娱乐不碰钱包，按小档的数显示"分"。底分 = 一份 ÷ BASE_DIV，用模拟器量出来（npm run sim，结果写 DESIGN.md 4.1）。
 */
export type TierId = 'small' | 'mid' | 'big' | 'lux';
export type StakesId = 'fun' | TierId;

interface Stakes {
  id: StakesId;
  /** 一份 */
  share: number;
  /** 碰不碰钱包 */
  wallet: boolean;
}

const BASE_DIV = 25;

export const STAKES: readonly Stakes[] = [
  { id: 'fun', share: 2_000, wallet: false },
  { id: 'small', share: 2_000, wallet: true },
  { id: 'mid', share: 10_000, wallet: true },
  { id: 'big', share: 50_000, wallet: true },
  { id: 'lux', share: 200_000, wallet: true },
];

export const stakesOf = (id: unknown): Stakes | null => STAKES.find((x) => x.id === id) ?? null;
/**
 * 血流成河一局能胡好几次，输赢比血战大一截（同样底分时一局一结输光约 0.5%）：底分再除以这个数。
 * 娱乐、实盘、好友房的血流一样算，同一套规则同样的分（配平见 DESIGN.md 4.1）
 */
export const FLOW_BASE_K = 2;
/** 底分：一份 ÷ BASE_DIV，血流成河再 ÷ FLOW_BASE_K */
export const baseOf = (share: number, rules?: { flow?: boolean }): number => Math.max(1, Math.floor(share / (BASE_DIV * (rules?.flow ? FLOW_BASE_K : 1))));

/** 川麻实盘一局一结（2026-10-30）：一次买入到结算 3–6 分钟，不再是一场 8 局的 17–19 分钟 */
export const REAL_ROUNDS = 1;

/**
 * 把川麻的开局选项改成实盘用的：局数固定 1，三人两房不换三张（配平、快速匹配、擂台都按不换算），其余照旧
 * （血流成河底分见 baseOf，三人两房的电脑见 venues.ts）；好友房不走这里
 */
export const realOpts = <T extends { rounds: number; three?: boolean; swap?: boolean }>(opts: T): T => ({
  ...opts,
  rounds: REAL_ROUNDS,
  ...(opts.three ? { swap: false } : {}),
});
