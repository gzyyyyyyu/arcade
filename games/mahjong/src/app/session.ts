/**
 * 页面的会话状态都在这一个对象里，各文件通过它读写，离开时由 lifecycle.ts 的 dispose 一处清理。
 * app/ 下的文件之间有函数级的循环 import（顶栏调离开、离开调选桌页、选桌页调开局……）：
 * 约定顶层只放声明，不在模块顶层调用别的文件的函数（只在函数体里调），这样不管谁先加载都不会读到 undefined。
 */
import type { PlatformInfo, MatchClient } from 'arcade-kit/client';
import type { SocialHandle } from 'arcade-kit/social';
import type { TableFun } from 'arcade-kit/table-fun';
import type { Highlight } from '../game/banter.ts';
import type { FeedMomentId } from '../game/feed.ts';
import { stakesOf } from '../game/stakes.ts';
import type { Online } from '../online.ts';
import type { Solo } from '../solo.ts';
import type { WalletView } from '../net/wallet.ts';
import { chatMode } from '../view/fun.ts';
import type { HomeMode } from '../view/home.ts';
import type { AnyTable } from '../view/variants/page.ts';

export const session = {
  // ---------- 现在在打的局 ----------
  /** 单机：和 online 同一时间只有一个 */
  solo: null as Solo | null,
  /** 好友房 / 匹配桌的连接 */
  online: null as Online | null,
  /** 牌桌（各玩法的牌桌视图、动作类型不同，这里只当"牌桌"用，具体玩法由 page.mountTable 创建） */
  table: null as AnyTable | null,
  /** 牌桌互动（单机、好友房同一个） */
  fun: null as TableFun | null,

  // ---------- 钱包和身份 ----------
  wallet: null as WalletView | null,
  walletNote: null as string | null,
  myName: '我',
  /**
   * 单独部署（没有平台，kit 的 detectPlatform 回 false）：没有登录、钱包和实盘，"大厅"回游戏首页，好友房用游客身份（昵称自己填，存 NICK_KEY）。
   * 平台暂时连不上（unknown）照有平台处理：实盘按钱包连不上不给选
   */
  standalone: false,
  /** detectPlatform 的结果：social 部件直接用，省一次 /api/me */
  platformInfo: undefined as PlatformInfo | undefined,

  // ---------- 好友：报位置、收邀请 ----------
  social: null as SocialHandle | null,
  /** 上次报的是哪个房间（null：不在房间） */
  reported: null as string | null,

  // ---------- 选桌页 ----------
  /** 选桌页现在摆的是哪个模式（钱包刷新后重画时不换页） */
  lobbyMode: 'fun' as HomeMode,

  // ---------- 好友房 ----------
  /** 这个房间是我开的（房间不下发房主是谁） */
  hosting: false,
  /** 上一次画的牌局走到第几步：同一步重画（有人坐下、掉线）不再放一遍动画和音效 */
  shownN: -1,
  /** 上一次画的时候我这个座位的筹码是不是我的（变了就刷新钱包） */
  ownShown: false,
  /** 跟着"再来一场"进新房间：娱乐自动坐到 seat，实盘只把那个座位亮一下、自己点了才坐（坐下的人开打时带入） */
  arrive: null as { seat: number; sit: boolean } | null,
  /** 凭链接或房间号进的别人的娱乐房：房间信息一到就坐第一个空位（只这一次；实盘房坐下就要带一份，照旧自己点） */
  autoSit: false,
  /** 别人开了新房间：几秒后跟过去（让大家先看清结算） */
  followTimer: 0,
  /** 进的是快速匹配排到的桌：进房时就知道（排到的、地址栏带 match=1），房间信息到了以 room.match 为准 */
  matchJoin: false,
  /** 立直一局结算前的等待（见 room-settle.ts） */
  endTimer: 0,

  // ---------- 快速匹配 ----------
  matcher: null as MatchClient | null,
  matchTick: 0,

  // ---------- 牌桌上 ----------
  /** 上一次画的时候有没有"轮到我"的提示（提示音只在刚出现时响一次） */
  lastPrompt: false,
  /** 这一场的名场面（一场的总结算里列出来） */
  fame: [] as Highlight[],
  /** 这一场（单机按局面对象、好友房按房间号认；再来一场是新房间）已经报过的名场面 */
  feedFor: null as object | string | null,
  feedSent: [] as FeedMomentId[],
};

/** 进的是快速匹配排到的桌 */
export function inMatch(): boolean {
  const online = session.online;
  return !!online && (online.state.room ? online.state.room.match === true : session.matchJoin);
}

/** 匹配桌、选了"不和陌生人"：不收也不能说 */
export const strangerMute = (): boolean => inMatch() && chatMode() !== 'on';

/** 从房间回选桌：匹配桌回它那一档（娱乐、实盘），好友房回好友房 */
export function roomBack(): HomeMode {
  if (!inMatch()) return 'room';
  return stakesOf(session.online?.state.opts?.stakes)?.wallet ? 'real' : 'fun';
}
