/**
 * 页面骨架和顶栏：舞台、顶栏的按钮、牌桌左下那一排、两手之间那一栏、标题页和等人页，都在 mount 时建一次；
 * 状态变了只改属性和文字（docs/screens.md 8.1）。按钮点了做什么在 bindShell 里接到各块的函数上。
 */
import { prepareShare, type ShareCard } from 'arcade-kit/share';
import { propSvg, showSticker } from 'arcade-kit/fun';
import { DIFFICULTY_NAME, difficultyOf, stakesOf } from '../core/stakes.ts';
import { TWO_NOTE } from '../room/rules.ts';
import { ME } from '../solo.ts';
import { replay } from '../guide.ts';
import { site } from '../site.ts';
import { formatInfo } from '../tour/rules.ts';
import { TP_OFF, takeProfitLabel } from '../core/takeprofit.ts';
import { DEFAULT_PREFS, resetSettings, savePrefs } from '../store.ts';
import { ActionBar } from '../view/actions.ts';
import { AchToasts, achPanel } from '../view/ach.ts';
import { el, setText, toggle } from '../view/dom.ts';
import { Lobby } from '../view/lobby.ts';
import { Reads } from '../view/reads.ts';
import { RoomPanel } from '../view/room.ts';
import { ROOM_NAME, setRoom } from '../view/rooms.ts';
import { mountScene } from '../view/scene.ts';
import { ShowBar } from '../view/showbar.ts';
import { openSettings, refreshSettings, type SettingsView } from '../view/settings.ts';
import { play, setSound, setVolume } from '../view/sound.ts';
import { TableView } from '../view/table.ts';
import { chips } from '../view/text.ts';
import { Tally } from '../view/titles.ts';
import { watchViewport } from '../view/viewport.ts';
import { pace, type App, type Fns, type State } from './state.ts';
import { must } from '../must.ts';

/** 顶栏的齿轮（设置）和问号（怎么玩）；图标都是线条，跟着字色 */
const GEAR ='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8zm8.2 4.6.1-1.2-.1-1.2 1.9-1.5-1.9-3.3-2.3.9a7.6 7.6 0 0 0-2-1.2L15.5 3h-3.8l-.4 2.7c-.7.3-1.4.7-2 1.2l-2.3-.9-1.9 3.3 1.9 1.5-.1 1.2.1 1.2-1.9 1.5 1.9 3.3 2.3-.9c.6.5 1.3.9 2 1.2l.4 2.7h3.8l.4-2.7c.7-.3 1.4-.7 2-1.2l2.3.9 1.9-3.3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
const HELP = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.4 9.6a2.7 2.7 0 1 1 3.9 2.4c-.9.5-1.3 1-1.3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17" r="1.2" fill="currentColor"/></svg>';
/** 两手之间倒计时的圈 */
const RING ='<svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" pathLength="100"/></svg>';

/**
 * 表情包盖在头像上（头像"做表情"）：kit 默认冒在头像右上方，那里不是这个人亮出来的牌、就是动作标签或者屏幕上沿。
 * kit 按矩形中心往右上偏 0.45、0.55 个头像，这里先反着挪回来。只用于电脑说话配的表情（view/talk.ts）
 */
const onFace = (r: DOMRect): DOMRect => new DOMRect(r.x - r.width * 0.45, r.y + r.height * 0.55, r.width, r.height);

export type Ui = ReturnType<typeof buildShell>;

/** 建整页的骨架。回调里用到的状态和函数都是点的那一下现取（fn 这时还没接上） */
export function buildShell(app: HTMLElement, s: State, fn: Fns) {
  const stage = el('div', 'stage', app);
  const scene = mountScene(app, stage);
  const top = el('div', 'topbar', stage);
  const home = el('a', 'home', top);
  home.href = '/';
  home.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 3l9 8v10h-6v-6H9v6H3z"/></svg><span>大厅</span>';
  const where = el('span', 'where', top);
  el('span', 'spacer', top);
  // 聊天开关（kit 的"聊天：开 / 不看"，和互动分开）：进桌时显示，单机也有聊天。设置面板里有同一个设置
  const chatBtn = el('button', 'icon chat-toggle hidden', top);
  chatBtn.type = 'button';
  // 设置（唯一入口）：声音、动画、互动、聊天、止盈、战绩、钱包都在面板里（view/settings.ts）。
  // 电脑宽屏、不在牌桌上时图标后面带"设置"两个字（lobby-layout.css 用 data-lbl 画）
  const gearBtn = el('button', 'icon gear', top);
  gearBtn.type = 'button';
  gearBtn.dataset.lbl = '设置';
  gearBtn.setAttribute('aria-label', '设置');
  gearBtn.title = '设置';
  gearBtn.innerHTML = GEAR;
  const leaveBtn = el('button', 'pill leave', top, '离桌');
  leaveBtn.type = 'button';

  const screen = el('div', 'screen', stage);
  const tableView: TableView = new TableView(screen, {
    myName: () => s.myName,
    pace: () => pace(s),
    onSeat: (i) => void fn.takeSeat(i),
    quiet: () => s.funOff,
    quick: () => s.online !== null,
    muted: (seat) => !!s.tf?.isBlocked(seat),
    // 电脑说话配的表情包，和真人发的同一套（kit 的 STICKERS），画在 kit 的效果层上
    sticker: (seat, id) => {
      const r = tableView.avatarRect(seat);
      if (r && s.tf && !s.funOff && !s.tf.isBlocked(seat)) {
        play('emote');
        void showSticker(s.tf.layer, onFace(r), id);
      }
    },
    bombIcon: () => propSvg('bomb'),
  });
  /** 看对手：每个座位这一场的数，点名牌看（点头像是 kit 的互动菜单） */
  const reads = new Reads();
  /** 称号：这一场公开发生的事，结算页给 */
  const tally = new Tally();
  const hud = el('div', 'hud', screen);
  const handNo = el('span', 'hand-no', hud);
  // 重看新手指引（顶栏，只在牌桌上显示；放在右边那排图标或牌桌左下那一排都会把别的东西挤到头像上，所以挨着"大厅"）：单机、锦标赛、好友房的牌桌上都在（好友房不自动出，想看自己点）
  const helpBtn = el('button', 'icon help', top);
  top.insertBefore(helpBtn, where);
  helpBtn.innerHTML = HELP;
  helpBtn.type = 'button';
  helpBtn.setAttribute('aria-label', '怎么玩');
  helpBtn.title = '怎么玩';
  const topUpBtn = el('button', 'pill', hud, '补码');
  topUpBtn.type = 'button';
  const sitBtn = el('button', 'pill', hud, '歇一手');
  sitBtn.type = 'button';
  // 好友房：离座以后回到自己的座位；没坐下的人看着时的提示
  // 单机快进时的出口：点了这一手恢复正常节奏
  const ffBtn = el('button', 'pill ff-btn hidden', hud, '看完这手');
  ffBtn.type = 'button';
  const backSeatBtn = el('button', 'pill go hidden', hud, '回到我的座位');
  backSeatBtn.type = 'button';
  // 旁观（docs/social.md 1.4）：座位满了、已经开打时进来的人只看。有电脑座位能接管时给"坐下"（接第一个亮着蓝圈的，也可以直接点那个座位）
  const sitDownBtn = el('button', 'pill go hidden', hud, '坐下');
  sitDownBtn.type = 'button';
  const spectate = el('span', 'spectate hidden', hud, '也可以点蓝圈的座位');
  // 互动（docs/table-fun.md 第 1 节）：左下角的"互动"按钮由 kit 画，这里只占个位置（funSlot 的屏幕矩形交给 TableFun 的 button）；
  // 一手打完按公开发生的事冒 1–2 句顺手提示，一点就发。都在左下，不挡底牌和操作区
  const funSlot = el('div', 'fun-slot hidden', hud);
  // 放在这一行最前面：后面的"补码""歇一手"一显一隐，这个位置也不挪（kit 的按钮按矩形摆，挪了会压到别的按钮）
  hud.prepend(funSlot);
  // 手机的"聊天"按钮（kit 的 chatButton）也在这一行占个位，挨着"互动"：不给的话 kit 把它摆在互动旁边，横屏压住"第几手""歇一手"，
  // 竖屏摆在互动下面压住左上的座位。电脑是聊天框，不占这个位
  const chatSlot = el('div', 'fun-slot chat-slot hidden', hud);
  funSlot.after(chatSlot);
  // 开打以后也能叫人：朋友点开链接看着，点亮着的电脑座位就能接管
  const inviteBtn = el('button', 'pill invite-btn hidden', hud, '叫朋友来');
  inviteBtn.type = 'button';
  const funHints = el('div', 'fun-hints hidden', hud);
  // 两手之间：单机一手打完停着，点"下一手"才发（开着"自动下一手"时倒数几秒自己发）；好友房是房间定的停顿，大家看同一个倒计时
  const betweenBar = el('div', 'between hidden', screen);
  const roomPause = el('div', 'room-pause hidden', betweenBar);
  roomPause.innerHTML = `${RING}<span>下一手马上开始</span>`;
  // 好友房能打的真人不到两个：牌桌停着不发牌，这里说为什么
  const twoNote = el('div', 'two-note hidden', betweenBar, TWO_NOTE);
  const autoBtn = el('button', 'auto-next', betweenBar, '自动下一手');
  autoBtn.type = 'button';
  const nextBtn = el('button', 'next-hand', betweenBar);
  nextBtn.type = 'button';
  nextBtn.innerHTML = `<span class="next-ring hidden">${RING}</span><span>下一手</span>`;
  // 主动亮牌：放在这一栏最前面
  const showBar = new ShowBar(betweenBar, (cards) => fn.showMine(cards));
  // 好友房带入被拒：一直挂在我的座位上面，写清楚为什么、怎么办，点了重新带入。只弹一句的话，人就卡在空座位上
  const rebuyBox = el('div', 'rebuy-cta hidden', screen);
  const rebuyText = el('span', 'rc-why', rebuyBox);
  const rebuyWallet = el('a', 'rc-link hidden', rebuyBox, '去钱包');
  rebuyWallet.href = '/wallet';
  const rebuyBtn = el('button', 'rc-go', rebuyBox);
  rebuyBtn.type = 'button';
  const toastEl = el('div', 'toast', stage);
  const achToasts = new AchToasts(stage);
  const bar = new ActionBar(screen, (a) => void fn.act(a), (r) => tableView.avoid(r), () => fn.raiseHint());
  const lobby = new Lobby(stage, {
    start: (...a) => fn.start(...a),
    howTo: () => fn.setGuide(replay()),
    resume: () => fn.resume(),
    relief: () => fn.relief(),
    openRoom: (...a) => fn.openRoom(...a),
    match: (stakes, fun, level) => void fn.quickMatch(stakes, fun, level),
    takeProfit: () => void fn.pickTakeProfit(),
    pushFold: (daily) => void fn.startPushFold(daily),
    dailyTour: () => void fn.startDailyTour(),
    achievements: () => void achPanel(stage, s.ach),
    puzzle: () => fn.openDailyPuzzle(),
    tour: (stakes, fun, level, format) => void fn.startTour(stakes, fun, level, format),
    joinRoom: (code) => fn.joinRoom(code),
    backToRoom: () => fn.backToRoom(),
    preview: (id) => {
      s.lobbyRoom = id;
      fn.drawRoomTheme();
    },
  });
  const roomPanel = new RoomPanel(stage, {
    sit: (i) => s.online?.sit(i),
    start: () => s.online?.start(),
    invite: () => fn.invite(),
    leave: () => void fn.leaveRoom(false),
    retry: () => s.online?.retry(),
  });

  // 第一次量是在这里同步做的，那时还没进桌、没有互动组件（syncFun 本来也什么都不做），fn 也还没接上
  const getFit = watchViewport(app, stage, (f) => {
    tableView.layout(f);
    if (s.tf) fn.syncFun();
  });
  tableView.layout(getFit());

  return {
    app, stage, scene, top, home, where, chatBtn, leaveBtn,
    screen, tableView, reads, tally, hud, handNo, helpBtn, gearBtn, topUpBtn, sitBtn, ffBtn, backSeatBtn, sitDownBtn, spectate,
    funSlot, chatSlot, inviteBtn, funHints, betweenBar, roomPause, twoNote, autoBtn, nextBtn, showBar,
    rebuyBox, rebuyText, rebuyWallet, rebuyBtn, toastEl, achToasts, bar, lobby, roomPanel, getFit,
  };
}

/**
 * 分享卡交给 kit（系统分享或预览层）；链接是游戏首页，好友房带房间码。
 * 结算页一出来就先画好：iOS 只许在点击那一下里调系统分享，点了再画就过期了，所以点击里不能先 await
 */
export function shareIt(card: ShareCard, room: string | null = null): () => void {
  const url = `${location.origin}${location.pathname}${room ? `?room=${room}` : ''}`;
  const p = prepareShare(card, { url });
  return () => void p.share().catch((e: unknown) => console.warn('texas: share failed', e));
}

/** 顶栏：这一桌是什么；设置面板；主题房；底部的小提示 */
export function createTop(c: App) {
  const f = c.fn;
  const { stage, scene, tableView, where, leaveBtn, chatBtn, toastEl } = c.ui;

  /**
   * 主题房（view/rooms.ts）：好友房按房间的档位，单机实盘按这一桌的档位，娱乐都在小桌那一间；
   * 标题页按选桌上选中的那一档（主页是小桌那一间）
   */
  function drawRoomTheme(): void {
    const { online, tour, solo } = c;
    const v = online?.state.view;
    const id = online ? (v?.stakes ?? online.state.opts?.stakes ?? null) : stage.classList.contains('at-table') && tour ? (tour.session.practice ? null : tour.session.stakes) : stage.classList.contains('at-table') && solo ? (solo.session.practice ? null : solo.table.stakes) : c.lobbyRoom;
    setRoom([stage, scene], id);
    tableView.setMark(ROOM_NAME[id ?? 'small']);
  }

  function drawTop(): void {
    refreshSettings();
    drawRoomTheme();
    if (c.online) return f.drawRoomTop(c.online.state);
    const tour = c.tour;
    if (stage.classList.contains('at-table') && tour) {
      const v = tour.view;
      const fmt = tour.state.format && tour.state.format !== 'sng' ? `${formatInfo(tour.state.format).name} · ` : '';
      const dly = tour.session.daily;
      setText(where, `${dly ? (dly.scored ? '今日赛' : '今日赛（练习）') : '锦标赛'} · ${fmt}第 ${v.level + 1} 级 · 盲注 ${chips(v.blinds[0])}/${chips(v.blinds[1])}`);
      toggle(leaveBtn, 'hidden', false);
    } else {
      drawSoloTop();
    }
  }

  function drawSoloTop(): void {
    const { solo } = c;
    const at = stage.classList.contains('at-table') && solo;
    const diff = solo?.session.practice ? difficultyOf(solo.table.level) : null;
    const so = at ? must(solo, 'at 为真则在单机牌桌上') : null;
    setText(where, so?.table.pushFold ? `${so.session.daily ? (so.session.daily.scored ? '今日局' : '今日局（练习）') : '快速局'} · 全下或弃牌 · 盲注 ${chips(so.table.sb)}/${chips(so.table.bb)}` : so ? `${so.session.practice ? `娱乐 · ${diff ? DIFFICULTY_NAME[diff] : stakesOf(so.table.stakes).name}` : stakesOf(so.table.stakes).name} · 盲注 ${chips(so.table.sb)}/${chips(so.table.bb)}` : '');
    toggle(leaveBtn, 'hidden', !at);
  }

  function drawCloud(): void {
    if (c.cloud) refreshSettings();
  }

  /** 战绩现在怎么样（设置面板的"战绩"一行） */
  function cloudText(): string {
    const cloud = c.cloud;
    const label = { anon: '没登录，战绩只存在本机', synced: '战绩已同步', syncing: '正在同步战绩', pending: '战绩待上传', merged: '本机战绩已并进账号', paused: '战绩暂停同步' }[cloud.state()];
    const note = cloud.note();
    return note ? `${label}：${note}` : label;
  }

  /** 设置面板的"钱包"一行显不显示：和顶栏"离桌"旁的钱包数同一套条件（娱乐桌、没坐在桌上、单独部署都不显示） */
  /** 设置面板的状态都现取，不另存一份（view/settings.ts 只管画） */
  function settingsView(): SettingsView {
    const atTable = stage.classList.contains('at-table');
    const chat = chatBtn.classList.contains('hidden') ? null : c.chatOff ? 'off' : c.strangerChat ? 'on' : 'friends';
    // 锦标赛里没有止盈；坐在桌上时看止盈旗子显不显示（好友房锦标赛也藏），不在桌上都有
    const tp = c.tour || (atTable && (!c.tf || c.online?.state.view?.tour)) ? null : takeProfitLabel(c.takeProfit, chips).replace('止盈：', '');
    return {
      prefs: c.settings,
      fun: !c.funOff,
      chat,
      takeProfit: tp,
      record: c.cloud && !site.standalone ? { text: cloudText(), login: c.cloud.state() === 'anon' } : null,
      // 钱包不挂顶栏了，设置里只要登录了就显示（娱乐桌也能看一眼余额）
      wallet: c.wallet && !site.standalone ? chips(c.wallet.balance) : null,
    };
  }

  function showSettings(): void {
    openSettings(stage, {
      view: settingsView,
      prefs: (p) => {
        Object.assign(c.settings, p);
        setSound(c.settings.sound);
        setVolume(c.settings.volume);
        savePrefs(c.settings);
        if (p.sound) play('tap');
        // 拖音量时不重画（会丢掉手指），松手面板自己画
        if (p.volume === undefined) f.drawTop();
      },
      flipFun: () => f.flipFunOff(),
      nextChat: () => {
        f.nextChatMode();
        refreshSettings();
      },
      pickTakeProfit: () => f.pickTakeProfit(),
      login: () => {
        location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
      },
      reset: () => {
        resetSettings();
        Object.assign(c.settings, DEFAULT_PREFS);
        setSound(c.settings.sound);
        setVolume(c.settings.volume);
        c.chatOff = false;
        c.strangerChat = true;
        c.takeProfit = TP_OFF;
        if (c.funOff) f.flipFunOff();
        f.syncFun();
        f.drawTakeProfit();
        f.drawTop();
        f.toast('已恢复默认');
      },
    });
  }

  let toastTimer = 0;
  function toast(text: string): void {
    if (!text) return;
    setText(toastEl, text);
    toastEl.classList.add('on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove('on'), 2600);
  }

  return { drawRoomTheme, drawTop, drawCloud, toast, showSettings };
}

/** 骨架上的按钮接到各块的函数 */
export function bindShell(c: App): void {
  const f = c.fn;
  const u = c.ui;
  const { stage, home, gearBtn, leaveBtn, nextBtn, autoBtn, topUpBtn, backSeatBtn, sitBtn } = u;
  const settings = c.settings;

  u.helpBtn.addEventListener('click', () => void f.walkthrough());
  u.sitDownBtn.addEventListener('click', () => {
    const room = c.online?.state.room;
    const i = room?.seats.findIndex((x) => x.kind === 'ai' && !x.reserved) ?? -1;
    if (i >= 0) void f.takeSeat(i);
  });
  u.inviteBtn.addEventListener('click', () => f.invite());
  u.rebuyBtn.addEventListener('click', () => f.rebuyNow());
  u.chatBtn.addEventListener('click', () => f.nextChatMode());

  gearBtn.addEventListener('click', () => f.showSettings());
  leaveBtn.addEventListener('click', () => void (c.online ? f.leaveRoom(false) : c.tour ? f.leaveTour() : f.leave()));
  nextBtn.addEventListener('click', f.nextHand);
  autoBtn.addEventListener('click', () => {
    settings.autoNext = !settings.autoNext;
    savePrefs(settings);
    f.stopCountdown();
    f.refresh();
  });
  home.addEventListener('click', (e) => {
    if (c.online) {
      e.preventDefault();
      void f.leaveRoom(true);
      return;
    }
    if (c.tour && stage.classList.contains('at-table')) {
      e.preventDefault();
      void f.leaveTour().then((left) => {
        if (left && !c.tour) {
          c.cloud.flush();
          location.href = f.hall();
        }
      });
      return;
    }
    if (!c.solo || !stage.classList.contains('at-table')) return;
    e.preventDefault();
    void f.leave().then((left) => {
      if (left && !c.solo) {
        c.cloud.flush();
        location.href = f.hall();
      }
    });
  });
  topUpBtn.addEventListener('click', () => void (c.online ? f.roomRebuy() : f.offerTopUp(false)));
  backSeatBtn.addEventListener('click', () => {
    const b = c.online?.state.you?.bound;
    if (b !== null && b !== undefined) c.online!.sit(b);
  });
  sitBtn.addEventListener('click', () => {
    const online = c.online;
    if (online) {
      const v = online.state.view;
      const me = online.state.you?.seat;
      if (v && me !== null && me !== undefined) online.act({ t: v.seats[me]!.away ? 'back' : 'away' });
      return;
    }
    const s = c.solo;
    if (!s) return;
    void f.drive(s.sitOut(!must(s.table.seats[ME], '单机桌一定有我的座位').away));
  });
}
