/**
 * 互动（kit 的 TableFun，docs/experience.md 13.7）、聊天、顺手提示、名场面、称号、好友动态和成就：单机和好友房的牌桌共用。
 */
import { localChat } from 'arcade-kit/chat';
import { chatFont, chatMode as chatLayout } from 'arcade-kit/fun-logic';
import { postMoment } from 'arcade-kit/social';
import { TableFun, type FunSeat } from 'arcade-kit/table-fun';
import { DEFS, noteHandAch, noteTour } from '../achievements.ts';
import { feedMoment, shouldReport, type FeedMoment } from '../core/feed.ts';
import { stakesOf } from '../core/stakes.ts';
import { view, type View } from '../core/view.ts';
import { momentOf, temperOf } from '../fun/moments.ts';
import { tauntId, TAUNTS } from '../fun/taunts.ts';
import { ME, type Step } from '../solo.ts';
import { KEYS, patchSettings, readJson } from '../store.ts';
import { START_STACK } from '../tour/rules.ts';
import type { TourSolo } from '../tour-solo.ts';
import { saveAch } from '../view/ach.ts';
import { el, toggle } from '../view/dom.ts';
import { saveFunOff, suggest } from '../view/fun.ts';
import { funSound, play } from '../view/sound.ts';
import { personaName } from '../view/text.ts';
import { handOver, showcase, showcaseText } from '../view/titles.ts';
import type { App } from './state.ts';
import { must } from '../must.ts';

/** 头像菜单里的三句点名短语：一句挑衅、一句激将、一句服气 */
const MENU_SAYS = ['就这？', '跟啊，怕了？', '好牌，服了'] as const;

/** 聊天开关三档：开 → 不和陌生人（匹配真人桌不聊，好友房、单机照常）→ 不看 */
type ChatMode = 'on' | 'friends' | 'off';
const CHAT_MODE: Record<ChatMode, { label: string; next: ChatMode; tip: string }> = {
  on: { label: '聊天：开', next: 'friends', tip: '聊天：开' },
  friends: { label: '聊天：不和陌生人', next: 'off', tip: '聊天：不和陌生人（匹配真人的桌上不聊，好友房照常）' },
  off: { label: '聊天：不看', next: 'on', tip: '聊天：不看（别人说的话不显示，自己也不能说）' },
};

export function createFun(c: App) {
  const f = c.fn;
  const { stage, screen, top, hud, tableView, tally, bar, betweenBar, chatBtn, funHints, funSlot, chatSlot, achToasts, lobby, getFit } = c.ui;
  let hintTimer = 0;
  /** 已经算过成就的锦标赛（每一场只算一次） */
  const tourAwarded = new Set<string>();

  /** 现在桌上的视图（好友房、单机）和我坐的座位；不在桌上是 null */
  function curView(): View | null {
    const { online, tour, solo } = c;
    return online ? online.state.view : tour ? view(tour.table, ME) : solo ? view(solo.table, ME) : null;
  }
  function mySeat(): number | null {
    const { online } = c;
    return online ? (online.state.you?.seat ?? null) : c.solo || c.tour ? ME : null;
  }

  /** 座位上的人怎么称呼（名场面横幅、称号）：我是"你"，好友房真人用昵称，电脑用性格名 */
  function nameAt(v: View, i: number, me: number | null): string {
    if (i === me) return '你';
    const info = c.online?.state.room?.seats[i];
    if (info?.kind === 'human' && info.name) return info.name;
    return personaName(must(v.seats[i], '视图里每个座位号都有座位').persona);
  }

  /**
   * 进桌（单机、好友房）时建互动组件。座位、按钮、禁区每次用到时现问：
   * 头像矩形按实际画出来的算（舞台整体缩放过，getBoundingClientRect 就是屏幕上的）；名字用屏蔽名单的那个（真人昵称、电脑性格名、我自己的昵称）
   */
  function openFun(scope: string): void {
    c.tf?.destroy();
    const online = c.online;
    // 单机这时牌桌已经摆好，量得出挤不挤；好友房还在等人页，等座位坐满再量（drawRoom）
    c.crowded = online ? null : !dockFitsNow();
    c.tf = new TableFun({
      storageKey: 'texas',
      phrases: TAUNTS,
      named: MENU_SAYS.map((t) => tauntId(t)),
      seats: () => {
        const v = curView();
        const me = mySeat();
        return (v?.seats ?? []).map((s, i): FunSeat | null => {
          const rect = s.owner === 'none' ? null : tableView.avatarRect(i);
          if (!rect) return null;
          const bot = s.owner === 'house';
          const plate = tableView.plateRect(i);
          return { rect, ...(plate ? { plate } : {}), name: i === me ? c.myName : nameAt(must(v, '画座位时已经有视图'), i, null), me: i === me, bot, ...(bot ? { temper: temperOf(s.persona) } : {}) };
        });
      },
      avoid: () => tableView.keepOut(),
      // 聊天：中间的公共牌、底池弹幕不横穿；省内存的设备弹幕默认关（scene.ts 判断，根上的 .lowfx）
      center: () => tableView.centerRects(),
      lite: () => document.documentElement.classList.contains('lowfx'),
      // 电脑版聊天框：自己挑一个不压座位、不压下注按钮的地方（顶栏、左下"互动"那一排、两手之间那一栏也算在要躲的里面）
      chatDock: () => {
        const d = dockSize();
        return chatFolded() ? tableView.chatDock(120, 48, dockAvoid()) : tableView.chatDock(d.w, d.h, dockAvoid());
      },
      // 玩家自己没点过收起、展开时：放不下就默认收着；好友房还在等人页、量不出来（null）时也收着，不然展开的框压住房间码
      chatFolded: () => chatFolded(),
      // 大屏上舞台放大到 1.5–2 倍，"互动""聊天"按钮的字（13 px）和图标（22 px）跟着放大，手机上不缩小
      buttonStyle: () => {
        const k = Math.max(1, getFit().scale);
        return { fontSize: Math.round(13 * k), icon: Math.round(22 * k) };
      },
      button: () => slotRect(funSlot),
      send: (id, to) => {
        toggle(funHints, 'hidden', true);
        if (c.online) c.online.emote(id, to);
        else c.tf?.receive(ME, id, to);
      },
      canSend: () => funReady(),
      enabled: () => !c.funOff,
      // 聊天：好友房经房间转发（房间过滤、限速后只转发，不进状态、不存）；单机用 kit 的 localChat 在本机过一遍和房间一样的过滤、限速，
      // 只冒在我自己头上。电脑不读聊天（公平：说什么都不影响电脑怎么打、怎么起哄）
      chat: online ? (text: string) => must(c.online, '联机房间的状态（只在好友房里被调用）').chat(text) : localChat((text, masked) => c.tf?.chat(ME, text, masked)),
      chatEnabled: chatOn,
      chatButton: () => slotRect(chatSlot),
      danmakuArea: () => tallDanmaku(),
      scope: () => scope,
      localBots: !online,
      sound: (prop, phase) => funSound(prop, phase),
      onHit: (seat) => tableView.hit(seat),
    });
    toggle(chatBtn, 'hidden', false);
    drawChatBtn();
    c.tpFired = false;
    f.drawTakeProfit();
    syncFun();
  }

  /**
   * "互动""聊天"占位块的屏幕矩形；藏着或没排出来（好友房等人页时底栏整个不显示，量出来是 0×0）就是 null，kit 不画按钮。
   * 不然 kit 照 0×0 的矩形把按钮放到左上角，压住顶栏的"大厅"
   */
  function slotRect(slot: HTMLElement): DOMRect | null {
    if (slot.classList.contains('hidden')) return null;
    const r = slot.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? r : null;
  }

  /**
   * kit 的电脑版聊天框多大：画出来了按实际的量；收着、还没画时按 kit 的字号估（宽是字号的 17 倍，高约 15 倍：快捷短语占两行，
   * 1280×720 实测 306×264、字号 18）。写死的尺寸在大屏上会压住左下座位的"大盲"；估矮了会判成放得下、展开后压住我的底牌
   */
  function dockSize(): { w: number; h: number } {
    const dock = document.querySelector<HTMLElement>('[data-key="chat:dock"]');
    if (dock && dock.offsetHeight > 0) return { w: dock.offsetWidth, h: dock.offsetHeight };
    const font = chatFont({ width: window.innerWidth, height: window.innerHeight });
    return { w: Math.round(font * 17), h: Math.round(font * 15) };
  }

  const dockFitsNow = (): boolean => {
    const d = dockSize();
    return tableView.dockFits(d.w, d.h, dockAvoid());
  };

  /**
   * 竖屏的弹幕走我的座位和操作区之间那一截空地：kit 默认在屏幕 8%–58% 飘，竖屏那里全是座位和公共牌，弹幕总压着别人的名牌。
   * 空地不到两行高（比如加注面板展开了）就交回 kit 默认
   */
  function tallDanmaku(): { left: number; top: number; width: number; height: number } | null {
    if (!stage.classList.contains('tall')) return null;
    const me = mySeat();
    const plate = me === null ? null : tableView.plateRect(me);
    const acts = bar.root.getBoundingClientRect();
    if (!plate || acts.height <= 0) return null;
    const topY = plate.bottom + 8;
    const height = acts.top - 8 - topY;
    // 加注面板展开时空地不够两行：给一块零高的区，kit 找不到轨道就不飘（聊天记录里照样有）。
    // 不能回 null，回 null 是 kit 默认的屏幕上半截，正好横穿上面的座位
    if (height < 72 && bar.root.classList.contains('open')) return { left: 8, top: topY, width: window.innerWidth - 16, height: 0 };
    return height >= 72 ? { left: 8, top: topY, width: window.innerWidth - 16, height } : null;
  }

  /** 聊天框要躲的：顶栏、左下"互动"那一排、两手之间那一栏 */
  function dockAvoid(): Element[] {
    return [top, betweenBar, ...hud.children];
  }

  /** 电脑版聊天框现在是收着的（玩家自己点过的以 kit 记的设置 texas.chat 为准，没点过看 crowded）：收着时只给小按钮找位置 */
  function chatFolded(): boolean {
    const own = readJson<{ folded?: unknown }>(KEYS.chat)?.folded;
    return typeof own === 'boolean' ? own : c.crowded !== false;
  }

  const chatMode = (): ChatMode => (c.chatOff ? 'off' : c.strangerChat ? 'on' : 'friends');

  function drawChatBtn(): void {
    const m = chatMode();
    const mark =
      m === 'off'
        ? '<path d="M4 4l16 16" stroke="currentColor" stroke-width="2"/>'
        : m === 'friends'
          ? '<circle cx="12" cy="10.5" r="1.6" fill="currentColor"/>'
          : '<path d="M8 10.5h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
    chatBtn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v10H10l-4.5 3.5V15.5H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>${mark}</svg>`;
    const label = `${CHAT_MODE[m].label}（点一下换）`;
    chatBtn.setAttribute('aria-label', label);
    chatBtn.title = label;
    chatBtn.dataset.mode = m;
    toggle(chatBtn, 'sel', m !== 'off');
  }

  /** 点了顶栏的聊天开关：换到下一档 */
  function nextChatMode(): void {
    const next = CHAT_MODE[chatMode()].next;
    c.chatOff = next === 'off';
    c.strangerChat = next === 'on';
    patchSettings({ chatOff: c.chatOff, strangerChat: c.strangerChat });
    drawChatBtn();
    syncFun();
    // kit 每次开面板、每收到一句都现问 chatEnabled，不用重建组件（重建会丢掉内存里的聊天记录）。
    // 匹配桌上从"不和陌生人"换回"开"：这次连接没带 chat=1，下回进桌才收得到
    f.toast(CHAT_MODE[next].tip);
  }

  function closeFun(): void {
    c.tf?.destroy();
    c.tf = null;
    toggle(chatBtn, 'hidden', true);
    toggle(funHints, 'hidden', true);
    toggle(funSlot, 'hidden', true);
    document.body.classList.remove('texas-fun-idle');
  }

  /** 这会儿有没有聊天（kit 每次开面板、每收到一句都现问） */
  function chatOn(): boolean {
    const online = c.online;
    return !c.chatOff && (!online?.match || (online.chatOn && c.strangerChat));
  }

  /** 我坐着、没关互动：头像点开的是 kit 的菜单；不然（旁观、关了）头像的点按穿过去给牌桌（看对手、接管座位） */
  function funReady(): boolean {
    return mySeat() !== null && !c.funOff;
  }

  /** 座位、按钮、开关变了：重摆 kit 的热区和按钮 */
  function syncFun(): void {
    if (!c.tf) return;
    toggle(funSlot, 'hidden', !funReady());
    const phoneRow = chatLayout({ width: window.innerWidth, height: window.innerHeight }) === 'phone';
    toggle(chatSlot, 'hidden', !(funReady() && chatOn() && phoneRow));
    document.body.classList.toggle('texas-fun-idle', !funReady());
    c.tf.refresh();
  }

  /** 一手打完：名场面横幅、记称号的数（单机、好友房都有）；给我顺手提示；名场面交给 kit，单机的电脑按性格起哄 */
  function handDone(prev: View, next: View, me: number | null): void {
    const h = handOver(prev, next);
    if (!h) return;
    if (me !== null) f.checkTakeProfit(me);
    const sc = showcase(h.r, h.log);
    if (sc && c.tf && !c.funOff) {
      play('banner');
      c.tf.banner(showcaseText(sc, nameAt(prev, sc.seat, me), h.r));
    }
    // 称号的数单机、好友房都记（结算页都给称号）
    const key = f.who(prev);
    tally.observe(h.r, h.log, (i) => ({ key: key(i), name: i === me ? c.myName : nameAt(prev, i, null) }));
    if (me !== null && !c.tour) reportMoment(feedMoment(h.r, h.log, me, stakesOf(prev.stakes).bb));
    if (c.funOff || !c.tf) return;
    if (me !== null) showHints(suggest(h.r, h.log, me));
    // 好友房的电脑由房间替它反应（worker/room.ts），这里只在单机报
    const m = c.online ? null : momentOf(h.r, h.log);
    if (m) c.tf.moment({ kind: 'moment', moment: m.moment, winners: [m.winner], losers: m.losers, hand: h.r.handNo });
  }

  function showHints(ids: number[]): void {
    window.clearTimeout(hintTimer);
    funHints.textContent = '';
    for (const id of ids) {
      const b = el('button', 'fun-hint', funHints, must(TAUNTS[id], '嘲讽表覆盖每个编号'));
      b.type = 'button';
      b.addEventListener('click', () => funSend(id));
    }
    toggle(funHints, 'hidden', !ids.length);
    hintTimer = window.setTimeout(() => toggle(funHints, 'hidden', true), 6_000);
  }

  /** 不经 kit 菜单发的（顺手提示、催促炸弹）：和菜单走同一条路，好友房经房间转发，单机直接交给组件播 */
  function funSend(id: number, to?: number): void {
    if (!c.tf || !funReady()) return;
    toggle(funHints, 'hidden', true);
    if (c.online) c.online.emote(id, to);
    else c.tf.receive(ME, id, to);
  }

  /** 点了顶栏的互动开关 */
  function flipFunOff(): void {
    c.funOff = !c.funOff;
    saveFunOff(localStorage, c.funOff);
    if (c.funOff) {
      c.tf?.closeAll();
      toggle(funHints, 'hidden', true);
    }
    f.toast(c.funOff ? '互动：不看（别人的道具、表情、短语和电脑说话都不显示）' : '互动：开');
    syncFun();
    f.drawTop();
  }

  /**
   * 好友动态的名场面（平台 15.17 第 2 条）：只报编号和数字，文字由 public/moments.json 的模板拼。
   * 只在有平台、已登录（social 挂上了）时报；单机、好友房都报；失败不管（平台每人每天也只收 10 条，超了静默丢）
   */
  function reportMoment(m: { moment: FeedMoment; n: number } | null): void {
    if (!m || !c.social || !shouldReport(c.feedSent, m.moment)) return;
    c.feedSent.add(m.moment);
    void postMoment('texas', m.moment, m.n).catch(() => {});
  }

  /** 一手打完（onStep 里、画面播完以后）：单机和锦标赛才算；st.next 是完整的牌桌，底牌在 kept 里 */
  function achHand(st: Step, prev: View, next: View): void {
    // 全下局每手不是全下就是弃牌，"全下赢""以小博大"这类成就在这里是白送的，不算
    if (c.online || c.pfMode) return;
    const h = handOver(prev, next);
    if (!h) return;
    const t = st.next;
    const before = c.ach;
    const r = noteHandAch(c.ach, {
      r: h.r,
      log: h.log,
      me: ME,
      hole: t.kept?.[ME] ?? [],
      endStack: must(t.seats[ME], '桌上一定有我的座位').stack,
      base: c.tour ? START_STACK : stakesOf(t.stakes).max,
      personaAt: (i) => (t.seats[i]?.owner === 'house' ? must(t.seats[i], '桌上每个座位号都有座位').persona : -1),
    });
    // 没有新成就时计数也要存（手数、连胜）
    c.ach = r.state;
    if (r.state !== before) saveAch(c.ach);
    if (r.fresh.length) {
      achToasts.show(r.fresh);
      lobby.setAch(c.ach.got.length, DEFS.length);
    }
  }

  /** 锦标赛结束：名次定了才算，每一场（单机按场次 id、好友房按房间号）只算一次 */
  function achTour(t: TourSolo): void {
    awardTour(t.session.id, t.state.places[ME] ?? t.result().place);
  }

  /** 好友房的娱乐锦标赛打完：全桌名次（含电脑）和单机一样算；实盘的不算（成就只管娱乐，实盘奖金另有结算） */
  function achRoomTour(code: string, place: number): void {
    awardTour(`room:${code}`, place);
  }

  function awardTour(key: string, place: number): void {
    if (tourAwarded.has(key)) return;
    tourAwarded.add(key);
    const r = noteTour(c.ach, place);
    c.ach = r.state;
    saveAch(c.ach);
    if (r.fresh.length) achToasts.show(r.fresh);
    lobby.setAch(c.ach.got.length, DEFS.length);
  }

  // 加注面板把座位挪开（或挪回）是 .18s 的 translate 过渡（view/table.ts avoid）：kit 的互动热区按头像矩形摆，
  // 挪完要重摆，不然热区留在原位、压在面板的"1池""全下"上拦住点按。过渡结束或被打断时各摆一次
  const reseat = (e: Event): void => {
    if ((e as TransitionEvent).propertyName === 'translate') syncFun();
  };
  screen.addEventListener('transitionend', reseat);
  screen.addEventListener('transitioncancel', reseat);

  return { curView, mySeat, nameAt, openFun, dockFitsNow, nextChatMode, closeFun, chatOn, syncFun, handDone, funSend, flipFunOff, achHand, achTour, achRoomTour };
}
