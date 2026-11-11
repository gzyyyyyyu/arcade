/** 基础枚举与内容表（题材、股票、群友）的类型。 */
export type ThemeId = 'ai' | 'newenergy' | 'consumer' | 'pharma' | 'finance' | 'lowalt' | 'gaming' | 'pig';
/** 题材生命周期的真实阶段（隐藏）：冷门、萌芽、发酵、主升、高潮、退潮。 */
export type Stage = 'cold' | 'sprout' | 'ferment' | 'rally' | 'climax' | 'ebb';
/** 体感标签（公开，只由热度和走势算出）：冷门、升温、火热、过热、降温。 */
export type Feel = 'cold' | 'warming' | 'hot' | 'overheated' | 'cooling';
/** 股票角色：龙头、跟风、白马、妖股、ST；ipo 是打新中签的新股（只出现在 IPO_STOCKS，不进推荐和群聊）。 */
export type Role = 'leader' | 'follower' | 'bluechip' | 'meme' | 'st' | 'ipo';
/** 大盘：牛、平、熊（画面用窗外天气表示）。 */
export type Mood = 'bull' | 'flat' | 'bear';
/** 群聊消息说的方向：涨、横、跌。 */
export type Dir = 'up' | 'flat' | 'down';
/**
 * 消息用了哪种"拐点"说法（0.3 第二轮新增）：start 要起飞了、top 差不多到顶了、ebb 该跑了。
 * 只由消息的方向和公开的体感决定（说的方向和眼下走势相反时用拐点说法），不泄露真实阶段。
 */
export type TurnTalk = 'start' | 'top' | 'ebb';
export type Rarity = 'common' | 'uncommon' | 'rare';
/** 道具分类：战法、工具、人脉。 */
export type ItemKind = 'tactic' | 'tool' | 'network';
/** premarket：盘前（买卖、开盘）；reward：月度三选一；event：事件二选一；won/lost：本局结束。 */
export type Phase = 'premarket' | 'reward' | 'event' | 'won' | 'lost';
/** bankrupt：账单交不上；margin（0.11.0）：实盘加了杠杆，资产跌破爆仓线被强制平仓 */
export type EndReason = 'bankrupt' | 'margin';
/** 人设（0.3.0）：开局可选 newbie / retiree / mom，coder、youzi 由成就解锁。 */
export type PersonaId = 'newbie' | 'retiree' | 'mom' | 'coder' | 'youzi';
/** 成就档位：铜（轻松）、银（需要构筑）、金（硬核）。 */
export type AchievementTier = 'bronze' | 'silver' | 'gold';
/** 成就图标（美术按这 16 个出图）。 */
export type AchievementIcon =
  | 'chart_up'
  | 'chart_down'
  | 'fire'
  | 'ice'
  | 'rocket'
  | 'crown'
  | 'bill'
  | 'cat'
  | 'chat'
  | 'megaphone'
  | 'shield'
  | 'skull'
  | 'star'
  | 'clover'
  | 'coin'
  | 'trophy';
export type RewardKind = 'item' | 'friend' | 'stock';
/** 股票小人的表情（查询函数按当日涨跌给出）。 */
export type Face = 'calm' | 'happy' | 'limitup' | 'worried' | 'limitdown' | 'delisted';
/** 持仓被自动卖出的原因：止损单、止盈单、退市。 */
export type AutoSellReason = 'stop' | 'take' | 'delist';

export interface ThemeDef {
  id: ThemeId;
  name: string;
  /** 一句话性格（公开） */
  desc: string;
}

export interface StockDef {
  id: string;
  name: string;
  theme: ThemeId;
  role: Role;
  /** 画面取形象用的股票 id（借用同题材现有内容股的形象，新股用）：`def.look ?? def.id` */
  look?: string;
}

/** 群友擅长的题材：固定列表、全部、当前最热、入群时随机两个。 */
export type FriendTopics = readonly ThemeId[] | 'all' | 'hottest' | 'random2';

export interface FriendDef {
  id: string;
  name: string;
  /** 身份（大学生、退休教师……） */
  title: string;
  topics: FriendTopics;
  /** 推荐股票时也偏向妖股（老赵） */
  memes?: boolean;
  /** 一句话性格（公开） */
  desc: string;
  /** 开局就在群里 */
  founding: boolean;
  /**
   * 只在真实行情的非每日局进月度奖励的抽取池（同 events.ts 的 realOnly）：
   * 奖励池多一张卡，rng.weighted 抽到的就变了——合成行情（replay-golden）会对不上旧回放，每日挑战会让同一天的局不一样。
   */
  realOnly?: boolean;
}
