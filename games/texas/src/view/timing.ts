/** 画面层和 app 层的时长常量（全部是毫秒）集中在这里，只改节奏看这一个文件。规则核心里的计时（src/core、room、ai）是规则的一部分，不在此处 */

// ---- app：牌局节奏 ----

/** 自动下一手：结果摆这么久再发（按动画快慢缩放） */
export const AUTO_NEXT_MS = 3_500;
/** 全下局：结果摆这么久自动发下一手（再乘 pace） */
export const PF_NEXT_MS = 2_400;
/** 最后一手演完（摊牌、结果条、收池、赢家横幅约 2.4 秒）后再停 1.2 秒才弹输光/结果卡，让人看清自己是怎么输的（乘节奏档） */
export const END_CARD_MS = 3_600;

// ---- app：钱包与联机 ----

/** 补码那一笔没回话时，最多在牌桌上停着等多久 */
export const TOPUP_WAIT_MS = 60_000;
/** 补码那一笔没回话时，隔多久用同一个操作 id 再办一次 */
export const TOPUP_RETRY_MS = 5_000;
/** 钱包那一笔连不上（请求可能已经到了、只是回话丢了）：这一桌留在本机，隔这么久用同一个操作 id 再办 */
export const RETRY_MS = 15_000;
/** 刷新页面后多久以内自动回到上次的房间（房间最长活 6 小时） */
export const ROOM_REMEMBER_MS = 6 * 3_600_000;
/** 进房后补报一次位置的间隔：比平台"同一个人 10 秒内只记一次位置"（docs/api.md 7.2）多 1 秒 */
export const PRESENCE_RETRY_MS = 11_000;
/**
 * 催促炸弹（朋友们："谁出得慢就炸他"）：轮到的是别的真人（不是电脑、不是电脑代打）、他已经想了 8 秒以上，
 * 他头像旁边冒一个小炸弹，我坐着就能点：对他扔 bomb（kit 的道具，走 emote 带 to）。不缩短他的计时、不碰规则
 */
export const URGE_AFTER_MS = 8_000;

// ---- view：界面提示与特效 ----

/** 亮牌条（别人亮牌后）停留多久 */
export const SHOW_MS = 5_000;
/** 整桌两句话之间至少隔这么久（真人节奏，不刷屏） */
export const SPEAK_GAP_MS = 8_000;
/** 金币粒子等特效在正常速度下的时长；pace 是 TableView 的动画快慢（快档 0.55，减少动态效果 0.3） */
export const FX_MS = 1200;
/** 特效时长的上限（pace 大于 1 时也不超过这个） */
export const MAX_MS = 1500;

/**
 * 各段动画的时长（毫秒，pace 为 1 时）。0.1.1 整体放慢一档，参照真人牌桌：
 * 发一张牌约 0.3 秒、翻牌三张依次翻、转牌河牌前停半秒多，每一下都看得清是谁、做了什么
 */
export const MS = {
  chip: 380,
  check: 420,
  muck: 380,
  collect: 460,
  street: 650,
  flopGap: 360,
  boardFly: 300,
  flip: 320,
  dealGap: 170,
  dealFly: 320,
  blinds: 340,
  reveal: 560,
  potFly: 760,
  potGap: 260,
  clear: 420,
};
