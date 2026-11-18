/**
 * 好友房（含快速匹配排到的桌）：开房、进房、连接的画面回调、等人页、牌桌的画面。
 * 连接和帧的播放在 src/online.ts，规则在房间（Worker），这里只把收到的状态画出来；一局打完的结算在 room-settle.ts。
 */
import { createRoom } from 'arcade-kit/client';
import type { RoomInfo } from 'arcade-kit/protocol';
import { PERSONAS } from '../ai/personas.ts';
import { seatsOf } from '../core/variants/sichuan-xuezhan/rules.ts';
import type { XzView } from '../core/variants/sichuan-xuezhan/index.ts';
import { dexKey } from '../game/dex.ts';
import { stakesOf, type StakesId } from '../game/stakes.ts';
import { createError, Online, roomUrl, type OnlineState } from '../online.ts';
import type { RoomView } from '../room/rules.ts';
import { recordAch } from '../view/achieve.ts';
import { closeDialog, dialog } from '../view/dialog.ts';
import { button, el } from '../view/dom.ts';
import { recordDex } from '../view/dex.ts';
import { chatMode } from '../view/fun.ts';
import { rotateTip } from '../view/guide.ts';
import { renderWaiting, roomNotice, type Watching } from '../view/room.ts';
import type { SeatMeta } from '../view/table.ts';
import { num } from '../view/text.ts';
import type { AnyOpts, AnyView } from '../view/variants/page.ts';
import { pageOf } from '../view/variants/pages.ts';
import { alertTurn, newFun, publicMoments, feed } from './fun.ts';
import { dispose } from './lifecycle.ts';
import { prefs, savePrefs } from './prefs.ts';
import { roomRoundEnd } from './room-settle.ts';
import { inMatch, roomBack, session, strangerMute } from './session.ts';
import { paintTop, screen, stage, title, toast } from './shell.ts';
import { share } from './social.ts';
import { lobby } from './routes.ts';
import { withNick } from './identity.ts';
import { checkFunds, refreshWallet, showError } from './wallet.ts';

/** 别人开了新房间，几秒后跟过去（让大家先看清结算） */
export const FOLLOW_MS = 5_000;

export function stopFollow(): void {
  window.clearTimeout(session.followTimer);
  session.followTimer = 0;
}

/**
 * 房间号放在地址栏：刷新、分享、登录跳回来都靠它（不另存）。匹配桌再带 match=1（0.21.0）：
 * 刷新时进房之前就知道是匹配桌，选了"不和陌生人"的连接照样不带 chat=1
 */
export function setRoomInUrl(code: string | null, match = false): void {
  const u = new URL(location.href);
  if (code) u.searchParams.set('room', code);
  else u.searchParams.delete('room');
  if (code && match) u.searchParams.set('match', '1');
  else u.searchParams.delete('match');
  history.replaceState(null, '', u);
}

export async function openRoom(stakes: StakesId, opts: AnyOpts, variant: string): Promise<void> {
  prefs.stakes = stakes;
  pageOf(variant).setRules(prefs, opts);
  savePrefs();
  const st = stakesOf(stakes)!;
  if (st.wallet && !(await checkFunds(st.share))) return;
  const r = await createRoom(withNick('rooms'), { variant, stakes, rules: opts });
  if ('error' in r) return showError(createError(r.error), r.error === 'login' ? 'refresh' : undefined);
  enterRoom(r.code, true);
}

export function enterRoom(code: string, host: boolean, from: { seat: number; sit: boolean } | null = null, match = false): void {
  dispose();
  session.matchJoin = match;
  session.arrive = from;
  session.autoSit = !host && !match && !from;
  session.hosting = host;
  session.shownN = -1;
  session.ownShown = false;
  setRoomInUrl(code, match);
  closeDialog();
  screen.className = 'screen room';
  screen.replaceChildren();
  el('p', 'room-hint', screen, '正在进房……');
  session.online = new Online(code, onlineUi, { url: withNick(roomUrl(code)), chat: !(match && chatMode() !== 'on') });
  paintTop();
}

const onlineUi = {
  draw(s: OnlineState, fresh: boolean): void {
    paintTop();
    if (!s.room) return;
    // 进了房间（房间信息到了才知道几个人）：马上报一次位置
    if (session.reported !== s.code) {
      session.reported = s.code;
      session.social?.presenceNow(true);
    }
    const arrive = session.arrive;
    if (s.room.status === 'waiting' && arrive?.sit && s.you && s.you.seat === null) {
      // 跟过来的娱乐房：坐回和上一场一样的相对位置（被人占了就不坐，留在等人页自己挑）
      if (s.room.seats[arrive.seat]?.kind === 'empty') session.online?.sit(arrive.seat);
      session.arrive = { ...arrive, sit: false };
    }
    // 凭链接、房间号进来的娱乐房：多数人是来打的，直接坐第一个空位，不用再点"坐这里"（11-18 体检）
    if (session.autoSit && s.you && s.opts) {
      session.autoSit = false;
      const free = tableSeats(s).findIndex((x) => x.kind === 'empty');
      if (s.room.status === 'waiting' && s.you.seat === null && !stakesOf(s.opts.stakes)?.wallet && free >= 0) session.online?.sit(free);
    }
    if (s.room.status === 'waiting' || !s.view) return drawWaiting(s);
    drawRoomTable(s, s.view, fresh);
  },
  toast,
  emote(seat: number, id: number, to?: number): void {
    session.fun?.receive(seat, id, to);
  },
  // 房间的座位号就是牌桌和互动用的座位号（seatMetas、newFun 都按房间的座位，四人局 0–3、三人两房 0–2），不用换算
  chat(seat: number, text: string, masked: boolean): void {
    // 地址栏没带 match=1 进的匹配桌（连接带了 chat=1）：页面这边照样不显示
    if (!strangerMute()) session.fun?.chat(seat, text, masked);
  },
  chatError(code: string): void {
    session.fun?.chatError(code);
  },
  ended(text: string): void {
    void refreshWallet();
    const back = roomBack();
    dialog(stage, 'error', (box) => {
      el('p', '', box, text);
      button('act go', box, '回选桌', () => {
        closeDialog();
        lobby(false, back);
      });
    }, false);
  },
};

function drawWaiting(s: OnlineState): void {
  const match = inMatch();
  // 不带游戏名：顶栏左边已有「大厅」，360 宽时「雀馆 · 好友房」会被省略号截成「雀馆 · …」
  title.textContent = match ? '快速匹配' : '好友房';
  screen.className = 'screen room';
  renderWaiting(screen, {
    match,
    code: s.code,
    room: { ...s.room!, seats: tableSeats(s) },
    you: s.you,
    opts: s.opts,
    host: session.hosting || s.you?.seat === 0,
    suggest: s.you?.seat === null && session.arrive ? session.arrive.seat : null,
    onSit: (seat) => session.online?.sit(seat),
    onStart: () => session.online?.start(),
    onShare: () => share(),
    // 等人页离开：先离座再断开（只断开的话 kit 只记掉线、座位还占着，房主开打会照样从他钱包带一份，自审 C4）
    onLeave: () => {
      if (s.you?.seat !== null && s.you?.seat !== undefined) session.online?.leaveSeat();
      lobby(false, roomBack());
    },
  });
}

/** 这一桌用到的座位：kit 的座位列表按玩法上限（4）给，三人两房后面那个座位一直空着、谁也坐不进去，页面不摆 */
export function tableSeats(s: OnlineState): RoomInfo['seats'] {
  const rules = s.opts?.rules;
  const n = rules && typeof rules === 'object' ? seatsOf(rules as { three?: boolean }) : s.room!.seats.length;
  return s.room!.seats.slice(0, n);
}

export function seatMetas(s: OnlineState, g: { seats: { persona: number }[] }): SeatMeta[] {
  // 电脑座位的性格各不相同（room/rules.ts 的 begin），名字不会撞
  const named = g.seats.map((x) => PERSONAS[x.persona]?.name ?? '电脑');
  const seats = tableSeats(s);
  return seats.map((x, i): SeatMeta => {
    // 绑了人、主人离座了的座位：电脑代他打
    const name = x.kind === 'human' ? (x.name ?? '玩家') : x.name ? `电脑（代${x.name}）` : named[i]!;
    return { name, bot: x.kind !== 'human', away: x.away, auto: x.auto };
  });
}

/** 顶栏的房间号和档位：房间号要念给朋友听，窄竖屏顶栏放不下时藏掉后面的档位（.var），不截号码（0.19.1）；iPhone SE 这么窄连"好友房"三个字也放不下，再藏掉它（.pre），只留号码 */
function paintRoomTitle(s: OnlineState, rv: RoomView): void {
  const st = stakesOf(rv.stakes)!;
  title.replaceChildren();
  if (inMatch()) {
    // 匹配桌不摆房间码（只有排进来的人能进，念给谁也没用）
    title.textContent = `快速匹配 · ${st.wallet ? `实盘 ${num(st.share)}` : '娱乐'}`;
  } else {
    el('span', 'pre', title, '好友房 ');
    title.append(s.code);
    el('span', 'var', title, ` · ${st.wallet ? `实盘 ${num(st.share)}` : '娱乐'}`);
  }
}

/** 开牌桌：牌桌、顶栏标题、互动组件（这一桌的头像、聊天、表情都接在上面） */
function mountRoomTable(s: OnlineState, rv: RoomView, g: AnyView): void {
  screen.className = 'screen game';
  screen.replaceChildren();
  paintRoomTitle(s, rv);
  const table = pageOf(g.variant).mountTable(screen, (a) => session.online?.play(a));
  session.table = table;
  rotateTip(stage);
  session.lastPrompt = false;
  session.fame = [];
  session.fun = newFun(
    table,
    () => session.online?.state.you?.seat ?? null,
    (seat) => (session.online?.state.room?.seats[seat]?.kind === 'ai' ? (PERSONAS[(session.online.state.view?.g as XzView | undefined)?.seats[seat]?.persona ?? -1]?.fun ?? 'normal') : null),
    (id, to) => session.online?.emote(id, to),
    s.code,
    false,
    // 匹配桌选了"不和陌生人"：不给聊天（没有聊天框和按钮）
    strangerMute() ? undefined : (text) => session.online?.chat(text) ?? { ok: false, code: 'chat_offline' },
  );
}

function drawRoomTable(s: OnlineState, rv: RoomView, fresh: boolean): void {
  const g = rv.g as AnyView;
  const page = pageOf(g.variant);
  if (!session.table) mountRoomTable(s, rv, g);
  const table = session.table!;
  // 同一步重画：事件已经放过了
  const replay = fresh || rv.n === session.shownN;
  session.shownN = rv.n;
  const v = replay ? { ...g, events: [] } : g;
  const turn = s.room!.turn;
  const pause = s.room!.pause;
  table.render({
    v: page.tableView(v),
    seats: seatMetas(s, g),
    timer: turn?.deadline ? { seats: turn.seats ?? [turn.seat], until: turn.deadline } : pause ? { seats: [], until: pause.until } : null,
  });
  const seat = s.you?.seat ?? null;
  // 带入到账、结回了：顶栏的钱包跟着变
  const mine = seat !== null && rv.own[seat] === true;
  if (mine !== session.ownShown) void refreshWallet();
  session.ownShown = mine;
  table.root.querySelector('.room-note')?.remove();
  const n = roomNotice(rv, seat, () => session.online?.rebuy(), seat === null ? watching(s, g) : null);
  if (n) table.root.appendChild(n);
  session.fun?.refresh();
  if (!replay) {
    recordDex(g.events, seat, dexKey(s.code, g, g.events, seat));
    recordAch(g, seat, s.code);
    publicMoments(v, seatMetas(s, g).map((x) => x.name), false);
    if (seat !== null && !(stakesOf(rv.stakes)?.wallet && !rv.unrated)) feed(s.code, v, seat);
  }
  alertTurn(v);
  roomRoundEnd(s, rv, g, replay);
}

/** 没入座：回自己坐过的座位，或者能接管的电脑座位（没绑人的；实盘房间旁观只看，不给坐） */
function watching(s: OnlineState, g: AnyView): Watching {
  const metas = seatMetas(s, g);
  return {
    back: s.you?.bound ?? null,
    free: tableSeats(s).flatMap((x, i) => (x.kind === 'ai' && !x.reserved ? [{ seat: i, name: metas[i]!.name }] : [])),
    wallet: !!stakesOf(s.view?.stakes)?.wallet,
    onSit: (seat) => session.online?.sit(seat),
  };
}
