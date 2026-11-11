/** 玩家操作的类型。 */
import type { BuySize, CollateralId } from './state.ts';

export type Action =
  /** 买入第 rec 条推荐；slot 为空格或要替换的持仓（缺省放进第一个空格） */
  | { type: 'buy'; rec: number; slot?: number; size?: BuySize; short?: boolean }
  /** 0.4 C：第 slot 格加仓 1 份（算一次买入） */
  | { type: 'add'; slot: number }
  /** 0.4 C：第 slot 格减掉一半（T+1 同卖出） */
  | { type: 'trim'; slot: number }
  /** 打新：申购今天的新股（放进第一个空格，份数同买入；只在 ipoToday(s) 不为 null 时合法） */
  | { type: 'subscribe'; size: BuySize }
  /** 0.4 C：拿抵押物去银行借钱 */
  | { type: 'borrow'; id: CollateralId }
  /** 0.4 C：还钱赎回抵押物 */
  | { type: 'repay'; id: CollateralId }
  /** 卖出第 slot 格的持仓（当天买入的不能卖） */
  | { type: 'sell'; slot: number }
  /** 开盘：结算今天 */
  | { type: 'open' }
  /** 月度奖励：选第 index 张；股票卡要放进的格子 slot（缺省第一个空格） */
  | { type: 'pickReward'; index: number; slot?: number }
  /** 月度奖励：都不要 */
  | { type: 'skipReward' }
  /** 事件：选第 option 个选项（0 或 1） */
  | { type: 'choose'; option: number }
  /** 0.20.0 实盘杠杆：盘中减仓，杠杆降一档（3× → 2× → 1×），不能再加回去 */
  | { type: 'deleverage' };
