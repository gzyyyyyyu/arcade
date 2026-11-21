/**
 * 页面路由：游戏主页、选桌页、每日何切、听牌速判、茶馆擂台。每个都先 teardown 放掉牌桌，再整页接管 screen。
 * 从牌桌、房间"回选桌"、离开都回到这里的函数。
 */
import type { Level } from '../ai/venues.ts';
import { stakesOf, type StakesId } from '../game/stakes.ts';
import { loadSolo, type SoloSave } from '../solo.ts';
import { settleDailyBoards } from '../view/daily.ts';
import { showRules } from '../view/guide.ts';
import { showHekiri } from '../view/hekiri.ts';
import { readLadder, showLadder } from '../view/ladder.ts';
import type { CloudState } from '../net/cloud.ts';
import { cloud } from './cloud.ts';
import { confirmBox } from '../view/dialog.ts';
import { settleTing, showTing } from '../view/ting.ts';
import { renderHome, type HomeMode } from '../view/home.ts';
import { renderLobby } from '../view/lobby.ts';
import { LEVEL_NAME, NET_FAIL, STAKES_NAME } from '../view/text.ts';
import type { AnyOpts } from '../view/variants/page.ts';
import { allPages, homeChoiceOf, pageOf } from '../view/variants/pages.ts';
import { nick, setNick, userIdOf } from './identity.ts';
import { teardown } from './lifecycle.ts';
import { quickMatch } from './match-flow.ts';
import { activeVariant, prefs, savePrefs } from './prefs.ts';
import { readRecord } from './record.ts';
import { enterRoom, openRoom } from './room-flow.ts';
import { session } from './session.ts';
import { idleTitle, screen, stage, title, toast } from './shell.ts';
import { playLadder, quitLadder, resumeSolo, startDaily, startLadder, startSolo } from './solo-flow.ts';

/** 游戏主页（0.17.0，docs/art.md）：主视觉、快速一局 / 继续上局、模式卡、战绩 */
export function homePage(): void {
  teardown();
  // 速判：上次没交成的今日一轮在这里补交（主页的"速判"值也按清账后的算）
  settleTing(userIdOf(session.platformInfo));
  // 每日挑战：今天的成绩没交上今日榜的，在这里补交
  settleDailyBoards(userIdOf(session.platformInfo));
  screen.className = 'screen front';
  const save = loadSolo();
  const kind = (stakes: StakesId, level: Level | undefined): string =>
    stakesOf(stakes)?.wallet ? `实盘 · ${STAKES_NAME[stakes]}档` : `娱乐 · ${LEVEL_NAME[level ?? 'easy']}`;
  const page = pageOf(activeVariant());
  const quickStakes = quickStakesOf();
  const { wallet, walletNote } = session;
  renderHome(screen, {
    quick: kind(quickStakes, prefs.level),
    resume: save ? `${kind(save.stakes, save.level)} · ${progressOf(save)}` : null,
    // 卡上只写原因的头一句（"连不上服务器"），整句挤不下一屏（docs/ui.md 第 11 节）
    realOff: wallet ? (wallet.balance <= 0 ? '钱包没有筹码了' : null) : (walletNote ?? NET_FAIL).split(/[，。]/)[0]!,
    standalone: session.standalone,
    record: readRecord(),
    variant: page.homeId(prefs),
    variants: variantChoices(homePage),
    onQuick: startQuick,
    onResume: () => void resumeSolo(),
    onMode: (m) => lobby(false, m),
    onRules: () => showRules(stage, undefined, activeVariant()),
    onProgress: (to) => (to === 'daily' ? lobby(false, 'fun') : to === 'hekiri' ? hekiriPage() : to === 'ting' ? tingPage() : to === 'ladder' ? ladderPage() : showRules(stage, to, activeVariant())),
  });
}

/**
 * 玩法切换项（主页快速一局底下、选桌页的玩法行共用）：血战 / 血流 / 三人两房 / 立直，各玩法的 VariantPage.homeChoices。
 * 血流、三人两房是川麻的 opts.flow / opts.three，记在 mahjong.prefs 的规则里，没有新的存储键；选了记下来再重画当前页（after）
 */
function variantChoices(after: () => void): { ids: string[]; current: string; onPick(id: string): void } {
  return {
    ids: allPages().flatMap((pg) => pg.homeChoices.map((c) => c.id)),
    current: pageOf(activeVariant()).homeId(prefs),
    onPick: (id) => {
      homeChoiceOf(id).page.homePick(prefs, id);
      savePrefs();
      after();
    },
  };
}

/** 快速一局的档位：上次选的实盘档（还开着的话），不然娱乐 */
const quickStakesOf = (): StakesId => (stakesOf(prefs.stakes) ? prefs.stakes : 'fun');

/** 快速一局：上次的档位和难度，规则固定一局一结（碎片时间打一把），不改选桌页里平时的规则设置。主页的大按钮和新手说明的"开打"都走这里 */
export function startQuick(): Promise<void> {
  const page = pageOf(activeVariant());
  return startSolo(quickStakesOf(), page.quick(prefs).opts, prefs.level, page.id, undefined, true);
}

/** 每日何切（DESIGN.md 7 节）：整页接管 screen，收尾函数在下一次 teardown 前由它自己的"回主页"调 */
function hekiriPage(): void {
  teardown();
  screen.className = 'screen';
  const stop = showHekiri(screen, { onExit: () => { stop(); homePage(); }, shareUrl: `${location.origin}${location.pathname}`, userId: userIdOf(session.platformInfo) });
}

/** 听牌速判（DESIGN.md 7 节）：同何切，整页接管 screen；只是娱乐，不碰筹码 */
function tingPage(): void {
  teardown();
  screen.className = 'screen';
  const stop = showTing(screen, { onExit: () => { stop(); homePage(); }, shareUrl: `${location.origin}${location.pathname}`, userId: userIdOf(session.platformInfo) });
}

/** 茶馆擂台（DESIGN.md 7 节）：三种打法各一张卡；开新的一轮时有没打完的一轮先问一声 */
export function ladderPage(): void {
  teardown();
  screen.className = 'screen';
  showLadder(screen, {
    onExit: homePage,
    onStart: async (mode) => {
      if (readLadder().run && !(await confirmBox(stage, '还有一轮擂台没打完，放弃它、重新开一轮？', '重新开', '不了'))) return;
      void startLadder(mode);
    },
    onResume: () => void playLadder(),
    ...(session.standalone ? {} : { cloud: { state: () => cloud.state, on: (f: (s: CloudState) => void) => cloud.on(f), tap: cloudTap } }),
    onQuit: async () => {
      if (!(await confirmBox(stage, '放弃这一轮擂台？下次从第一桌重来。', '放弃', '不了'))) return;
      quitLadder();
      ladderPage();
    },
  });
}

/** 点云朵：没登录去登录（登录完回来）；别的只说一句现在怎样，不叫人去登录（docs/platform-backend.md 5.5 第 11 条） */
function cloudTap(s: CloudState): void {
  if (s === 'out') {
    location.href = `/login?from=mahjong`;
    return;
  }
  const say: Record<CloudState, string> = {
    off: '',
    out: '',
    ok: '擂台的称号已经存到你的账号，换台设备登录也在',
    syncing: '正在和账号同步',
    pending: '还有改动没传上去，过一会儿自动传',
    merged: '已经把这台设备和账号里的称号合到一起了',
    paused: '平台那边暂时停了存档，称号先记在这台设备上，之后再传',
    full: '这台设备的存储满了，云同步先停下（称号没丢）',
  };
  toast(say[s]);
}

/** 存档打到哪了（主页"继续上局"底下那行） */
function progressOf(save: SoloSave): string {
  return pageOf(save.state.variant).progress(save.state, save.daily);
}

/**
 * 选桌页（主页点模式卡进来）：mode 是从哪张模式卡进来的，实盘卡进来先选中小档；从平台大厅的"好友房"来（friends）开房、进房亮一下。
 * 从牌桌"回选桌"、离开时没带 mode：按上次打的是娱乐还是实盘回到那一页
 */
export function lobby(friends = false, mode: HomeMode | null = null): void {
  teardown();
  screen.className = 'screen lobby';
  const standalone = session.standalone;
  let stakes = prefs.stakes;
  const m: HomeMode = standalone && mode === 'real' ? 'fun' : (mode ?? (friends ? 'room' : stakesOf(stakes)?.wallet && !standalone ? 'real' : 'fun'));
  if (m === 'real' && !stakesOf(stakes)?.wallet) stakes = 'small';
  if (m === 'fun') stakes = 'fun';
  session.lobbyMode = m;
  title.textContent = idleTitle(m === 'real');
  renderLobby(screen, {
    wallet: session.wallet,
    walletNote: session.walletNote,
    stakes,
    level: prefs.level,
    rules: prefs,
    variants: variantChoices(() => lobby(false, session.lobbyMode)),
    canResume: loadSolo() !== null,
    onSolo: startSolo,
    onResume: () => void resumeSolo(),
    onDaily: (v) => void startDaily(v),
    onRules: () => showRules(stage, undefined, activeVariant()),
    onRoom: openRoom,
    onJoin: (code) => (/^\d{6}$/.test(code) ? enterRoom(code, false) : toast('房间号是 6 位数字')),
    // 快速匹配：选了三人两房（opts.three）、血流成河（opts.flow）排各自的档位，转单机也是这个玩法
    ...(m !== 'room' ? { onMatch: (st: StakesId, o: AnyOpts, l: Level, v: string) => void quickMatch(st, o, l, v) } : {}),
    friends,
    ...(standalone ? { standalone: { nick: nick(), onNick: setNick } } : {}),
    onBack: homePage,
    mode: m,
  });
}
