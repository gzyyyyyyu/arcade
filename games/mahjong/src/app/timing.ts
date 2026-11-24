/** 页面和流程层手调的“手感”时间（毫秒）。单机电脑想多久和 sleep 在 game/pace.ts，规则核心和电脑里的节奏（如 turnMs）也不在这里。 */
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
  /** 设置里「快速」：电脑的停顿乘这个（默认常速 ×1；快速 ×0.45） */
  fastScale: 0.45,
} as const;
