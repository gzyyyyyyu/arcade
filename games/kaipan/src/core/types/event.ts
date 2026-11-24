/** 引擎事件的类型。 */
import type { ThemeId, Mood, EndReason, AutoSellReason } from './base.ts';
import type { IpoOffer, BuySize, CollateralId, Loan, Message, Rec, BillState, RewardCard, EventState, ThemeReview, MarketNotice } from './state.ts';
import type { ThemeMove, StockMove, SwanNotice, NewsItem, StockQuip, HoldingMove, ChainLink, ItemTrigger, MessageJudge, Comment, DayReport } from './report.ts';
import type { MonthGoalState, Highlight, ComboReward } from './run.ts';

export type GameEvent =
  | { type: 'monthStarted'; month: number; days: number; bill: BillState; calendar: string }
  | { type: 'dayStarted'; day: number; month: number; dayInMonth: number }
  | { type: 'chat'; messages: Message[]; recs: Rec[] }
  | { type: 'bought'; rec: number; slot: number; stockId: string; replaced: string | null; units?: number; short?: boolean; cost?: number }
  | { type: 'added'; slot: number; stockId: string; units: number }
  | { type: 'trimmed'; slot: number; stockId: string; units: number; holdRet: number }
  | { type: 'borrowed'; loan: Loan; account: number }
  | { type: 'repaid'; loan: Loan; account: number }
  | { type: 'interestPaid'; amount: number; before: number; after: number }
  | { type: 'bankCalled'; account: number; debt: number }
  | { type: 'seized'; id: CollateralId; amount: number; penalty: number; before: number; after: number; /** 收之前的欠款、收东西的线（欠款 × seizeLine）、起因（当天亏的 / 月底付完账单） */ debt?: number; line?: number; cause?: 'trade' | 'bill' }
  | { type: 'squeezed'; slot: number; stockId: string; ret: number }
  | { type: 'learned'; id: string }
  | { type: 'sold'; slot: number; stockId: string; holdRet: number }
  | { type: 'opened'; day: number }
  | { type: 'marketMoved'; moodBefore: Mood; mood: Mood; ret: number }
  | ({ type: 'themeMoved' } & ThemeMove)
  | ({ type: 'stockMoved'; slot: number } & HoldingMove & { stock: StockMove })
  | ({ type: 'chain' } & ChainLink)
  | ({ type: 'itemTriggered' } & ItemTrigger)
  | { type: 'stockNews'; stockId: string; news: 'uncap' | 'warning' | 'delisted'; warnings: number; held: boolean }
  | { type: 'autoSold'; slot: number; stockId: string; reason: AutoSellReason; holdRet: number }
  | { type: 'accountChanged'; before: number; after: number; ret: number }
  | ({ type: 'messageJudged' } & MessageJudge)
  | ({ type: 'comment' } & Comment)
  | ({ type: 'news' } & NewsItem)
  | ({ type: 'quip' } & StockQuip)
  | { type: 'dayClosed'; report: DayReport }
  | { type: 'billPaid'; month: number; amount: number; before: number; after: number; credit: boolean }
  | { type: 'bankrupt'; month: number; amount: number; account: number }
  | { type: 'rewardOffered'; month: number; cards: RewardCard[] }
  | { type: 'rewardPicked'; card: RewardCard; slot: number | null; replaced: string | null }
  | { type: 'rewardSkipped' }
  | { type: 'friendJoined'; friendId: string; topics: ThemeId[] }
  | { type: 'eventStarted'; event: EventState }
  | { type: 'eventResolved'; id: string; option: number; text: string; delta: number }
  | { type: 'runWon'; account: number }
  | { type: 'marketNotice'; notice: MarketNotice }
  | { type: 'crashHit'; day: number; month: number }
  /** 黑天鹅日开盘：盘前已公开的预告（画面在开盘时全屏报幕）；收盘结果在 dayClosed 的 report.swan */
  | { type: 'swanOpen'; notice: SwanNotice }
  /** 打新：申购日开始（dayStarted 之后），今天盘前能申购这只新股 */
  | { type: 'ipoOpened'; offer: IpoOffer }
  | { type: 'subscribed'; slot: number; size: BuySize; units: number; offer: IpoOffer }
  /** 出签那天收盘：中没中（没中这一格清空） */
  | { type: 'ipoDrawn'; slot: number; won: boolean; offer: IpoOffer }
  /** 上市首日收盘；premium < 0 = 破发 */
  | { type: 'ipoListed'; slot: number; stockId: string; premium: number }
  | ({ type: 'themeReviewed' } & ThemeReview)
  | { type: 'pendingSettled'; id: string; amount: number; delta: number; text: string }
  | { type: 'itemExpired'; itemId: string }
  | { type: 'runLost'; reason: EndReason; month: number; account: number; bill: number }
  /** 实盘杠杆爆仓：levered 是放大后的带回倍数（跌到了爆仓线） */
  | { type: 'gearWiped'; month: number; account: number; levered: number }
  | { type: 'deleveraged'; levered: number; x: number }
  /** 月初公布本月主题（"本月看点"卡），紧跟在 monthStarted 之后 */
  | { type: 'monthTheme'; goal: MonthGoalState; name: string; intro: string; rule: string; goalText: string; rewardText: string; roast: { friendId: string; text: string } }
  /** 月度目标进度变化 / 达成 / 失败 */
  | { type: 'goalProgress'; goal: MonthGoalState }
  | { type: 'goalDone'; goal: MonthGoalState; cash: number; shards: number; itemId: string | null }
  | { type: 'goalFailed'; goal: MonthGoalState }
  /** 高光时刻、连击 / 小奖励 */
  | ({ type: 'highlight' } & Highlight)
  | ({ type: 'combo' } & ComboReward)
  /** 从真实走势里识别出的连板（≥ 2）、炸板、妖股异动（只播报，不改涨跌） */
  | { type: 'spotted'; kind: 'boards' | 'blown' | 'wild'; stockId: string; move: number; boards: number; held: boolean }
  /** 多日消息揭晓 */
  | ({ type: 'intelJudged' } & MessageJudge);
