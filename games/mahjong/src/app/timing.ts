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
  /** 设置里「快速」：电脑的停顿乘这个（默认常速 ×1；快速差不多是 11-20 之前的节奏） */
  fastScale: 0.45,
  // 单机电脑「想」多久（solo.ts 的 thinkMs，再乘性格快慢和速度；所有者 11-20 嫌太快，从 450/700/1000 放慢）
  /** 摸了就打（摸切） */
  thinkTsumogiriMs: 650,
  /** 从手里挑一张打 */
  thinkDiscardMs: 1_000,
  /** 别家立直或已经胡了：再加 */
  thinkTenseMs: 600,
  /** 牌墙后半段：再加 */
  thinkLateMs: 300,
  /** 碰、吃、杠、立直 */
  thinkMeldMs: 1_300,
  /** 胡、和 */
  thinkWinMs: 1_200,
  /** 换三张、定缺这些 */
  thinkOtherMs: 800,
} as const;

/** 页面流程里等一会儿（单机电脑出牌节奏、房间电脑的出牌延迟、离座后等房间收到） */
export const sleep = (ms: number): Promise<void> => new Promise((r) => window.setTimeout(r, ms));
