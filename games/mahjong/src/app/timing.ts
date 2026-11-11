/** 页面和流程层手调的“手感”时间（毫秒）。规则核心和电脑里的节奏（如 turnMs）不在这里。 */
export const TIMING = {
  /** 提示条（toast）显示多久，到点自动收起 */
  toastMs: 2_600,
  /** 快速匹配找到人后，提示文字停多久再进入下一步 */
  matchDoneHoldMs: 1_000,
  /** 快速匹配倒计时卡片刷新间隔 */
  matchTickMs: 1_000,
  /** 轮到你时标签页标题闪烁的间隔 */
  titleFlashMs: 800,
  /** 名场面横幅出现前的基础等待；再加每符 {@link TIMING.momentPerHuMs}，让胡牌的牌面先放完 */
  momentBaseMs: 600,
  /** 名场面横幅：胡牌牌面每一符多等多久 */
  momentPerHuMs: 2_400,
  /** 好友房离座后，等房间收到离座消息再断开的时间 */
  leaveSeatGraceMs: 300,
  /** 单机：电脑和了牌（胡、和）之后停多久（再乘性格快慢和速度） */
  soloAfterWinMs: 1_000,
  /** 单机：电脑碰、吃、杠、立直之后停多久 */
  soloAfterMeldMs: 700,
  /** 单机：电脑打牌之后停多久 */
  soloAfterDiscardMs: 450,
  /** 单机：其余步骤之后停多久 */
  soloAfterOtherMs: 250,
} as const;
