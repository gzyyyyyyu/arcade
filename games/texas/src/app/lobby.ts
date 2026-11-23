/**
 * 大厅（标题页）：启动、钱包、本机没打完的一桌、开一桌单机现金桌、另一个标签页动了本机这一桌。
 * 单独部署（没有平台，docs/deploy.md 10.1，site.ts）时不接钱包和云存档，"大厅"回游戏首页。
 */
import { detectPlatform } from 'arcade-kit/client';
import { reportErrors } from 'arcade-kit/report';
import { mountSocial } from 'arcade-kit/social';
import { DEFS } from '../achievements.ts';
import type { StakesId } from '../core/stakes.ts';
import { createCloud } from '../net/cloud.ts';
import { getWallet, relief as reliefApi, texasStakes, walletError } from '../net/wallet.ts';
import { isRoomCode } from '../online.ts';
import { site, twoText } from '../site.ts';
import { ME, SESSION_KEY, Solo } from '../solo.ts';
import { remove } from '../store.ts';
import { TOUR_KEY, TourSolo } from '../tour-solo.ts';
import { notMyTurn } from '../view/alert.ts';
import { closeCoach } from '../view/coach.ts';
import { closeDialog } from '../view/dialog.ts';
import { setText } from '../view/dom.ts';
import { play, unlockAudio } from '../view/sound.ts';
import { chips } from '../view/text.ts';
import { LOGIN_NOTE, PENDING_NOTE, type App } from './state.ts';
import { must } from '../must.ts';
import { RETRY_MS } from '../view/timing.ts';

export function createLobby(c: App) {
  const f = c.fn;
  const { stage, lobby, home, twoNote } = c.ui;
  /** 钱包里还有好友房那一份时，标题页隔一会儿再看一次钱包（结回了提示就收起） */
  let stakeTimer = 0;

  async function boot(): Promise<void> {
    // 没人接住的报错发给平台的 /api/client-error；单独部署没有平台，发出去回 404，kit 吞掉不重试
    reportErrors({ game: 'texas', version: __TEXAS_VERSION__ });
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    // 点按声：界面上的按钮轻轻"嗒"一下；出牌按钮、喇叭自己有声音，不叠
    document.addEventListener('click', (e) => {
      const b = e.target instanceof Element ? e.target.closest('button') : null;
      if (b && !b.disabled && !b.matches('.act, .qbet, .icon.sound')) play('tap');
    });
    window.addEventListener('keydown', unlockAudio, { once: true });
    // 云存档先建好再画大厅：画大厅要读本机记着的房间，按 cloud.userId() 认是不是这个账号的。
    // 先画大厅、后建 cloud 的话，刷新前在好友房里的（记着房间）一打开页面就报错、大厅画不出来
    // 有没有平台（10.1），顺带拿昵称（平台的 /api/me）；问不到（平台抖了一下）按有平台算
    const p = await detectPlatform();
    site.standalone = p.platform === false;
    f.drawTakeProfit();
    const u = p.platform === true ? (p.user as { displayName?: unknown } | null) : null;
    if (typeof u?.displayName === 'string' && u.displayName) c.myName = u.displayName;
    if (site.standalone) standaloneUi();
    // 报位置、收邀请（仓库根 docs/social.md 1.2、1.3，kit 的 social）：没平台、没登录 kit 回 null，一个请求都不发
    void mountSocial({ platform: p, where: () => f.presence(), gameName: (id) => (id === 'texas' ? '德州扑克' : undefined), onGo: (inv) => void f.goInvite(inv.game, inv.room) }).then((h) => (c.social = h));
    c.cloud = createCloud({
      fetch: (...a) => fetch(...a),
      storage: localStorage,
      now: () => Date.now(),
      loggedInHint: () => /(?:^|;\s*)__Host-arcade_li=1/.test(document.cookie),
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (h) => window.clearTimeout(h as number),
    });
    f.drawTop();
    showLobby();
    c.cloud.onChange(f.drawCloud);
    if (!site.standalone) await Promise.all([c.cloud.start(), refreshWallet()]);
    f.drawCloud();

    const s = Solo.load(localStorage, c.cloud.userId());
    if (s) {
      c.solo = new Solo(s, c.deps);
      // 上次有一笔没办完：用同一个操作 id 再办一次
      if (s.pending) await settlePending();
      if (c.solo && !s.practice && !s.pending && c.wallet && !texasStakes(c.wallet).some((x) => x.ref === s.id)) {
        // 钱包里已经没有这一桌了：单机只在本机结回，几乎都是放太久、平台原样退回了（15.10 的 expired）
        remove(SESSION_KEY);
        c.solo = null;
        c.walletNote = walletError('expired');
      }
    }
    const ts = TourSolo.load(localStorage, c.cloud.userId());
    if (ts && !c.solo) {
      c.tour = new TourSolo(ts, c.tourDeps);
      if (ts.pending) await f.settleTour();
      if (c.tour && !ts.practice && !ts.pending && c.wallet && !texasStakes(c.wallet).some((x) => x.ref === ts.id)) {
        remove(TOUR_KEY);
        c.tour = null;
        c.walletNote = walletError('expired');
      }
    }
    // 邀请链接 ?room=123456 直接进；平台大厅的"好友房"按钮 ?online=1（和掼蛋同一个约定）。
    // 刷新前在房间里的不自动拉回去（试玩反馈："每次进去自动进入一个房间…完全打不了"）：标题页给"回到房间"，点了才进
    const q = new URLSearchParams(location.search);
    const code = q.get('room');
    const wantOnline = q.get('online') === '1';
    if (q.has('room') || q.has('online')) history.replaceState(null, '', location.pathname);
    if (code && isRoomCode(code)) f.joinRoom(code, true);
    else if (wantOnline) lobby.showFriends();
    drawLobby();
    // 第一版真数据已画好（钱包、云存档、本机没打完的一桌都到了）：标题页右栏淡入，不先露一排空面板
    lobby.ready();
  }

  /**
   * 办本机这一桌还没回话的那一笔。连不上就留着、隔一会儿自动再办；办完（或者钱包明确拒了）刷新钱包。
   * 第一笔买入被拒的，这一桌从没开过，直接作废
   */
  async function settlePending(): Promise<void> {
    const s = c.solo;
    if (!s?.session.pending) return;
    window.clearTimeout(c.retryTimer);
    const err = await s.settle();
    if (!Solo.load(localStorage, c.cloud.userId())) c.solo = null;
    else if (!s.session.pending && !s.session.practice && must(s.table.seats[ME], '单机桌一定有我的座位').owner === 'none') {
      remove(SESSION_KEY);
      c.solo = null;
    }
    await refreshWallet();
    if (s.session.pending && err === 'login') {
      // 登录过期：重试也是 401，等刷新登录后打开页面再结
      c.walletNote = LOGIN_NOTE;
    } else if (s.session.pending) {
      c.walletNote = PENDING_NOTE;
      c.retryTimer = window.setTimeout(() => void settlePending().then(drawLobby), RETRY_MS);
    } else if (err) c.walletNote = walletError(err);
  }

  /** 单独部署："大厅"回游戏首页，几句说法换成不记账的 */
  function standaloneUi(): void {
    home.href = hall();
    setText(twoNote, twoText());
    lobby.standalone();
  }

  /** "大厅"：有平台回平台首页；单独部署回游戏自己的首页 */
  const hall = (): string => (site.standalone ? './' : '/');

  /** 单独部署时好友房带的昵称；有平台时用平台的，不带 */
  const nickname = (): string | null => (site.standalone ? lobby.nickname() || null : null);

  async function refreshWallet(): Promise<void> {
    if (site.standalone) return;
    const r = await getWallet();
    c.wallet = r.ok ? r.wallet : null;
    c.walletNote = r.ok ? null : walletError(r.error, r.retryAfter, 'api');
    f.drawTop();
  }

  function showLobby(): void {
    c.pfMode = false;
    closeCoach();
    stage.classList.remove('at-table');
    lobby.home();
    notMyTurn();
    f.closeFun();
    closeDialog();
    drawLobby();
  }

  function drawLobby(): void {
    const s = c.solo?.session;
    const ts = c.tour?.session;
    // "回到房间"横幅只在两种时候有：钱包里有好友房那一份（以 /api/wallet 的 stakes 为准）；
    // 或者刷新、关页面前还在房间里（没点"离开房间"，6 小时内）。点了才进，不点照常玩单机。
    // 德州可以同时有好几份（单机一份、每个房间各一份）：好友房的合起来说
    const rooms = texasStakes(c.wallet, 'server');
    const inRoom = rooms.length ? { amount: rooms.reduce((a, x) => a + x.amount, 0) } : null;
    const back = inRoom ? (f.savedRoom() ?? f.lastRoom()) : f.savedRoom();
    const settle = '在房间里点「离桌」马上带回钱包；直接关了页面的话，房间里没人以后约 10 分钟自动带回钱包';
    window.clearTimeout(stakeTimer);
    if (inRoom && !stage.classList.contains('at-table') && !c.online) stakeTimer = window.setTimeout(() => void refreshWallet().then(drawLobby), 10_000);
    lobby.update({
      wallet: c.wallet,
      // 本机不知道是哪个房间（别的设备进的）：没有按钮，只说一句
      note: c.walletNote ?? (inRoom && !back ? `好友房那一桌还没带回钱包（带上桌 ${chips(inRoom.amount)}）。${settle}` : null),
      resume: s
        ? { stakes: s.table.stakes, size: s.table.seats.length, practice: s.practice, level: s.table.level, waiting: s.pending !== null }
        : ts
          ? { stakes: ts.stakes, size: ts.state.table.seats.length, practice: ts.practice, level: ts.state.table.level, waiting: ts.pending !== null, tour: true }
          : null,
      orphan: texasStakes(c.wallet, 'client').find((x) => x.ref !== (s?.id ?? ts?.id)) ?? null,
      busy: c.busy,
      stats: c.cloud.stats(),
      room: back
        ? { code: back.code, text: inRoom ? `好友房 ${back.code} 里还有 ${chips(inRoom.amount)} 在桌上。${settle}` : `刚才在好友房 ${back.code}` }
        : null,
    });
    lobby.setAch(c.ach.got.length, DEFS.length);
    f.drawPuzzleEntry();
    f.drawTop();
  }

  async function start(stakes: StakesId, size: number, amount: number, practice: boolean, level?: number): Promise<void> {
    if (c.busy) return;
    c.busy = true;
    drawLobby();
    const r = await Solo.open(c.deps, { userId: c.cloud.userId(), stakes, size, amount, practice, ...(level !== undefined ? { level } : {}) });
    c.busy = false;
    if ('error' in r) {
      await refreshWallet();
      if (r.pending) {
        // 连不上：这一桌留着（钱包可能已经扣了），自动再办
        c.solo = r.pending;
        await settlePending();
      } else c.walletNote = walletError(r.error);
      drawLobby();
      return;
    }
    c.solo = r;
    f.enterTable();
  }

  async function resume(): Promise<void> {
    if (c.busy) return;
    if (c.tour && !c.solo) {
      if (c.tour.session.pending) {
        c.busy = true;
        drawLobby();
        await f.settleTour();
        c.busy = false;
        if (c.tour?.session.pending) return drawLobby();
      }
      if (c.tour) f.enterTour();
      else drawLobby();
      return;
    }
    if (!c.solo) return;
    // 那一笔还没回话：先办完（买入到账才上桌；离桌的结算结完这一桌就没了）
    if (c.solo.session.pending) {
      c.busy = true;
      drawLobby();
      await settlePending();
      c.busy = false;
      if (c.solo?.session.pending) return drawLobby();
    }
    if (c.solo) f.enterTable();
    else drawLobby();
  }

  async function relief(): Promise<void> {
    if (c.busy) return;
    c.busy = true;
    drawLobby();
    const r = await reliefApi();
    c.busy = false;
    if (r.ok) {
      c.wallet = r.wallet;
      play('chip');
    } else c.walletNote = walletError(r.error, r.retryAfter, 'api');
    drawLobby();
  }

  /**
   * 另一个标签页动了本机这一桌单机：两个页面各打各的、各自存盘会互相覆盖，一边离桌了另一边再离桌就对不上。
   * 这一页在牌桌上就停下回标题页、说一句；在标题页就按存盘重读，"接着打"接的是最新的那一桌
   */
  function otherTab(): void {
    if (c.online || c.busy) return;
    const atTable = (c.solo !== null || c.tour !== null) && stage.classList.contains('at-table');
    c.solo?.stop();
    c.tour?.stop();
    if (atTable) {
      f.stopCountdown();
      closeDialog();
      c.walletNote = '这一桌在另一个页面打开了：在那边接着打，或者关掉那边再回来';
    }
    const s = Solo.load(localStorage, c.cloud.userId());
    c.solo = s ? new Solo(s, c.deps) : null;
    const ts = c.solo ? null : TourSolo.load(localStorage, c.cloud.userId());
    c.tour = ts ? new TourSolo(ts, c.tourDeps) : null;
    // 标题页上开着的弹窗（结算、补给）不关，只重画
    if (atTable) showLobby();
    else drawLobby();
  }

  return { boot, settlePending, hall, nickname, refreshWallet, showLobby, drawLobby, start, resume, relief, otherTab };
}

/** 切后台、换标签页、别的标签页改了存盘 */
export function bindPage(c: App): void {
  // 切后台：补传战绩；离桌的结算还没回话就用 keepalive 再发一次
  const hidden = (): void => {
    c.cloud?.flush();
    if (c.solo?.closing) void c.solo.settle(true);
    if (c.tour?.closing) void c.tour.settle(true);
  };
  document.addEventListener('visibilitychange', () => {
    // 切到后台时停掉一直在转的 CSS 动画（背景浮尘、赢家射线、呼吸光圈）：iOS 后台也留着合成层，回来再接着转
    document.body.classList.toggle('texas-paused', document.visibilityState === 'hidden');
    if (document.visibilityState === 'hidden') hidden();
    else void c.cloud?.recheck();
  });
  window.addEventListener('pagehide', hidden);
  window.addEventListener('focus', () => void c.cloud?.recheck());
  window.addEventListener('storage', (e) => {
    c.cloud?.onStorage({ key: e.key, newValue: e.newValue });
    if (e.key === SESSION_KEY || e.key === TOUR_KEY) c.fn.otherTab();
  });
}
