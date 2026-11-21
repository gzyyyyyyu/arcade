/**
 * 页面的共享状态：mount 建一份，以参数（ctx）交给 src/app/ 下各块。
 * 只在一块里用的（那一块自己的计时器、去重标记）放在那一块的闭包里，不放这里。
 * 各块之间互相调用走 ctx.fn：mount 把每一块返回的函数并进去，模块之间只有类型引用，没有运行时的循环 import。
 */
import type { SocialHandle } from 'arcade-kit/social';
import type { TableFun } from 'arcade-kit/table-fun';
import type { AchState } from '../achievements.ts';
import type { FeedMoment } from '../core/feed.ts';
import type { StakesId } from '../core/stakes.ts';
import { parseTakeProfit, type TakeProfit } from '../core/takeprofit.ts';
import type { Cloud } from '../net/cloud.ts';
import type { WalletView } from '../net/wallet.ts';
import type { Online } from '../online.ts';
import { fastForward, type Solo, type SoloDeps } from '../solo.ts';
import { readPrefs, readSettings, type Prefs } from '../store.ts';
import type { TourDeps, TourSolo } from '../tour/solo.ts';
import { loadAch } from '../view/ach.ts';
import { loadFunOff } from '../view/fun.ts';
import type { createDaily } from './daily.ts';
import type { createFun } from './fun.ts';
import type { createGuide } from './guide.ts';
import type { createLobby } from './lobby.ts';
import type { createOnline } from './online.ts';
import type { createPuzzle } from './puzzle.ts';
import type { createTop, Ui } from './shell.ts';
import type { createTable } from './table.ts';
import type { createTakeProfit } from './takeprofit.ts';
import type { createTour } from './tour.ts';

export const PENDING_NOTE = '钱包暂时连不上，稍后会自动重试';
export const LOGIN_NOTE = '登录过期了：这一桌的筹码先记在本机，刷新页面登录后自动结回钱包';

export interface State {
  settings: Prefs;
  /** 系统设了减少动画 */
  reduced: boolean;
  /** 好友房追上最新状态（切回前台、重连）时剩下的动画瞬间走完：节奏取 0 */
  skipAnim: boolean;
  /** 单机桌上点了"看完这手"的那一手的手数（-1 没点过）；下一手自动恢复快进 */
  ffSkip: number;
  /** 在全下或弃牌的快速局里（docs/features.md 13.10）：节奏整体快一倍，一手几十秒 */
  pfMode: boolean;
  /** 互动"不看"（texas.fun）。菜单、面板、冷却、连击回敬、按人屏蔽、首次提示、电脑的反应都是 kit 的 TableFun（docs/table-fun.md 第 0 节） */
  funOff: boolean;
  /** 聊天"不看"（texas.settings 的 chatOff）：别人说的不冒气泡、不进记录，自己也没有聊天页 */
  chatOff: boolean;
  /** 快速匹配桌上和陌生人聊不聊（texas.settings 的 strangerChat，默认聊）：不聊时进匹配桌不带 chat=1，好友房、单机照常 */
  strangerChat: boolean;
  /** 止盈（texas.settings 的 takeProfit） */
  takeProfit: TakeProfit;
  /** 这一桌已经止盈走了（离桌要几步，别一手里叫两次） */
  tpFired: boolean;
  /** 牌桌上的互动组件：进桌时建、离桌时拆；单机的电脑由它在本地反应，好友房的由房间算（worker/room.ts） */
  tf: TableFun | null;
  /**
   * 这一桌的电脑版聊天框放不下（1280×720 的 6 人桌，哪儿都要盖住座位、按钮或公共牌）：进桌时量一次，量完不再变，免得座位一变聊天框一会儿收一会儿开。
   * null 是好友房还没坐满、没量
   */
  crowded: boolean | null;
  /** 选桌上选中的那一间（标题页时背景按它） */
  lobbyRoom: StakesId | null;
  /** 云存档：boot 里问过有没有平台才建；在那之前用到的地方（drawCloud、切后台）自己判空 */
  cloud: Cloud;
  myName: string;
  wallet: WalletView | null;
  walletNote: string | null;
  solo: Solo | null;
  /** 单机锦标赛（和现金桌不会同时开着） */
  tour: TourSolo | null;
  /** 好友房（和单机不会同时开着） */
  online: Online | null;
  /** 报位置、收邀请的部件（mountSocial 回来以后才有；没平台、没登录一直是 null） */
  social: SocialHandle | null;
  /** 牌桌按这个人数、这个座位摆的（好友房里换了座位要重摆） */
  laidOut: { size: number; me: number };
  lastRefused: string | null;
  wasBuying: boolean;
  /** 正在播的画面有几段（播着的时候不出操作区、不弹窗） */
  animating: number;
  busy: boolean;
  /** 正在问人（补码、出局了怎么办）：这时不再弹别的 */
  asking: boolean;
  /** 单机、锦标赛钱包那一笔的自动重试（同一时间只有一个） */
  retryTimer: number;
  /** 两手之间圈在走的倒计时（单机的自动下一手、好友房的停顿，同一时间只有一个） */
  countdown: Animation | null;
  /** 已经提示过"某某出局"的座位 */
  outShown: Set<number>;
  /** 好友房锦标赛：这个房间的结束页已经弹过 / 我淘汰后选了看到结束 */
  roomTourEnded: string;
  roomWatch: boolean;
  /** 这一局（坐上一桌到离开，进一个房间到离开）已经报过的名场面 */
  feedSent: Set<FeedMoment>;
  /** 成就（src/achievements.ts）：只记单机和单机锦标赛；好友房、快速局不算 */
  ach: AchState;
}

/** 各块交出来的函数，mount 并成一个 */
export type Fns = ReturnType<typeof createTop> &
  ReturnType<typeof createLobby> &
  ReturnType<typeof createTable> &
  ReturnType<typeof createDaily> &
  ReturnType<typeof createTour> &
  ReturnType<typeof createFun> &
  ReturnType<typeof createGuide> &
  ReturnType<typeof createOnline> &
  ReturnType<typeof createTakeProfit> &
  ReturnType<typeof createPuzzle>;

/** 交给各块的 ctx：状态、骨架上的元素、单机和锦标赛的依赖、别的块的函数 */
export type App = State & { ui: Ui; fn: Fns; deps: SoloDeps; tourDeps: TourDeps };

export function createState(): State {
  const raw = readSettings();
  return {
    settings: readPrefs(),
    reduced: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    skipAnim: false,
    ffSkip: -1,
    pfMode: false,
    funOff: loadFunOff(localStorage),
    chatOff: raw.chatOff === true,
    strangerChat: raw.strangerChat !== false,
    takeProfit: parseTakeProfit(raw.takeProfit),
    tpFired: false,
    tf: null,
    crowded: null,
    lobbyRoom: null,
    // boot 里才建（要先问有没有平台）；类型上当它一直在，和原来模块里的 `let cloud: Cloud` 一样
    cloud: null as unknown as Cloud,
    myName: '我',
    wallet: null,
    walletNote: null,
    solo: null,
    tour: null,
    online: null,
    social: null,
    laidOut: { size: 0, me: -1 },
    lastRefused: null,
    wasBuying: false,
    animating: 0,
    busy: false,
    asking: false,
    retryTimer: 0,
    countdown: null,
    outShown: new Set(),
    roomTourEnded: '',
    roomWatch: false,
    feedSent: new Set(),
    ach: loadAch(),
  };
}

/** 单机现金桌上正在快进（我弃牌了或没在这一手里）：好友房、快速匹配的真人桌、锦标赛都不快进 */
export const fastForwarding = (s: State): boolean => !!s.solo && !s.online && !s.tour && fastForward(s.solo.table, s.ffSkip);

/** 动画节奏：减少动画 0.3、快 0.55（快进时也走这一档）、正常 1，快速局再快一倍；好友房追状态时 0 */
export const pace = (s: State): number => (s.skipAnim ? 0 : (s.reduced ? 0.3 : s.settings.fast || fastForwarding(s) ? 0.55 : 1) * (s.pfMode ? 0.5 : 1));
