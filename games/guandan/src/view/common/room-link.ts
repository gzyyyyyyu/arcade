/**
 * 联机会话里和玩法无关的部分（掼蛋、斗地主共用）：连房间（arcade-kit 的 RoomClient）、座位和房间信息、关闭码和重连文字、
 * 记房间码（本机 guandan.room）、帧排队、出手锁到 ack、聊天和互动、开房。玩法的会话（guandan/net.ts、doudizhu/net.ts）继承 RoomLink，
 * 只管把房间发来的视图转成"我 = 0"、座位号怎么换、座位上的人怎么写进 labels.ts。
 *
 * - 房间说了算：出牌只是"发出去"，结果随下一帧回来；这期间按钮锁着（pending），不重复发。
 * - 进房、重连收到 welcome（全量快照）：清掉没播放的帧，牌桌整桌重画（reset）。
 * - 房间码记在本机（guandan.room），刷新页面或回到标题页还能回到这个房间；房间散了就忘掉。
 */
import { RoomClient, type ChatSendResult, type ClientStatus, type RoomClientOptions, type WebSocketLike } from 'arcade-kit/client';
import { CLOSE, CLOSE_REASON, EMOTE_ERRORS, type CreateError, type DownMsg, type RoomInfo } from 'arcade-kit/protocol';
import { CLIENT_VERSION, ROOM_PATH } from '../../net/version.ts';
import { isStakeRoom, roomVariant, seatCountOf, type RoomVariant } from '../../net/room-info.ts';
import type { TierId } from '../../core/stake.ts';
import { setSeatIdentities, setWatching } from './labels.ts';
import { QUOTA_TEXT } from './quota-text.ts';
import { KEYS, getSettings, rawStore } from '../store.ts';
import { GUEST_ID, lobbyName, standalone, withNick } from './platform.ts';

export { QUOTA_TEXT };

export type NetEvent = 'room' | 'frames' | 'reset' | 'error' | 'status' | 'emote';
type NetListener = (kind: NetEvent, detail?: string) => void;

/** 本机记着的房间（刷新后回得去） */
export interface SavedRoom {
  code: string;
  host: boolean;
  /**
   * 记下的时间：房主是开房那一刻（开完马上进房），别人是第一次进这个房间那一刻。
   * arcade-kit 不下发房间的创建时间，别人拿不到更准的；房间最长活 8 小时，按进房时间算顶多多提示一会儿，点了会说房间散了。
   */
  at: number;
  /** 是谁的房间（平台 /api/me 的 user.id）；进房后才问得到，问到之前是 null。同一台设备换了账号就不能给新账号看（host 也不能被带走） */
  userId: string | null;
  /** 快速匹配排到的桌（0.26.0）：刷新接回去时也按设置"聊天：不和陌生人"决定带不带 chat=1 */
  match?: true;
  /** 斗地主的房间（牌馆 ⑤）：刷新接回去时直接用斗地主的会话；没有这一项是掼蛋（房间信息到了会再核对） */
  variant?: 'ddz';
}
/** 房间最长活 8 小时（worker/room.ts 的 maxLifeMs），超过就不提"回到房间"了 */
const ROOM_LIFE_MS = 8 * 3_600_000;
/** 本页正连着的房间码：进房时先记房间、问到账号才记到名下（claimRoom），这一会儿记录还没有 userId，myRoom 不能把它当成别人的清掉 */
let liveCode: string | null = null;

export function savedRoom(): SavedRoom | null {
  const r = rawStore.read<SavedRoom>(KEYS.room);
  if (!r || typeof r.code !== 'string' || !/^\d{6}$/.test(r.code) || typeof r.at !== 'number') return null;
  return Date.now() - r.at < ROOM_LIFE_MS ? r : null;
}

export function forgetRoom(): void {
  rawStore.remove(KEYS.room);
}

/**
 * 记着的房间给不给现在这个账号："show" 给；"wait" 还不知道是谁（没登录、连不上平台），先不给、也不清；
 * "forget" 不是他的（或者旧记录、进房后没问到账号的记录），清掉——换了账号的人看不到上一个人的房间，也拿不走房主标记。
 */
export function roomOwnerCheck(saved: SavedRoom, userId: string | null): 'show' | 'wait' | 'forget' {
  if (userId === null) return 'wait';
  return saved.userId !== null && saved.userId === userId ? 'show' : 'forget';
}

/**
 * 现在登录的是谁（平台 /api/me 的 user.id）；没登录、连不上为 null。
 * 每次现问：云同步记的账号可能落后于别的标签页的切换。只在本机记着房间时才问，次数很少。
 */
export async function currentUserId(fetcher: typeof fetch = fetch): Promise<string | null> {
  if (standalone()) return GUEST_ID;
  try {
    const res = await fetcher('/api/me', { credentials: 'same-origin' });
    if (res.status !== 200) return null;
    const body = (await res.json()) as { user?: { id?: unknown } | null };
    return typeof body.user?.id === 'string' ? body.user.id : null;
  } catch {
    return null;
  }
}

/** 本机记着的、属于现在这个账号的房间（标题页"回到房间"、大厅"回到刚才的房间"、邀请链接带房主标记之前都要过这一关） */
/**
 * 进房后自动坐哪儿（0.6.0：点开链接就能打，不用再找按钮）：回自己绑着的座位；等人时坐第一个空位；
 * 开打了先旁观（0.13.0 起不再自动接管电脑座位）。实盘房间坐下就要从钱包带入，不替人拿主意（回自己的座位除外）。null：不自动坐
 */
export function autoSeat(room: RoomInfo, you: { seat: number | null; bound?: number | null }, prefer: number | null = null): number | null {
  if (you.seat !== null) return null;
  if (you.bound !== undefined && you.bound !== null) return room.status === 'playing' ? you.bound : null;
  if (isStakeRoom(room)) return null;
  // 再来一场跟过来的（0.6.2）：先坐和上一场一样的相对位置（开房的人在 0 号），队友还是那个人
  if (prefer !== null && room.status === 'waiting' && room.seats[prefer]?.kind === 'empty') return prefer;
  // 已经开打的不替人接管电脑座位：先旁观，想打自己点"坐下"（0.13.0，docs/social.md 1.4）
  const i = room.status === 'waiting' ? room.seats.slice(0, seatCountOf(room)).findIndex((s) => s.kind === 'empty') : -1;
  return i >= 0 ? i : null;
}

export async function myRoom(): Promise<SavedRoom | null> {
  const r = savedRoom();
  if (!r) return null;
  const id = await currentUserId();
  // 本页刚进的房间还没记到名下：是这个人自己的，不清（邀请链接、大厅 ?online=1 打开时标题页和面板都会问，曾把刚进的房间清掉）
  if (r.code === liveCode && r.userId === null) return id === null ? null : r;
  const verdict = roomOwnerCheck(r, id);
  // 问的这一会儿记录可能变了（进了别的房间）：只清问之前看到的那一条
  if (verdict === 'forget' && savedRoom()?.code === r.code) forgetRoom();
  return verdict === 'show' ? r : null;
}

/** 这些关闭是"回不去了"（房间散了、码不对、没登录、满了、在别处进了、被拒、额度用完）：不再提"回到房间"，地址栏的码也去掉 */
export function isFinalForRoom(code: number | null): boolean {
  return (
    code === CLOSE.roomClosed ||
    code === CLOSE.noRoom ||
    code === CLOSE.unauthorized ||
    code === CLOSE.full ||
    code === CLOSE.replaced ||
    code === CLOSE.forbidden ||
    code === CLOSE.tooManyJoins ||
    code === CLOSE.userQuota ||
    code === CLOSE.busy
  );
}

/** 地址栏里的房间码跟着当前房间走（其他参数如 online=1 不动）：刷新页面就回到这个房间，离开了就去掉 */
export function roomInUrl(code: string | null): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url.href);
}

/** 关闭码 → 大白话（玩家看得懂、知道下一步做什么） */
export function closeText(code: number | null, reason: string | null = null): string {
  if (code === CLOSE.roomClosed && reason === CLOSE_REASON.quota) return QUOTA_TEXT.closed;
  switch (code) {
    case CLOSE.busy:
      return QUOTA_TEXT.joinBusy;
    case CLOSE.unauthorized:
      // 单独部署：游客 cookie 是打开首页时发的，没带上多半是浏览器没存住
      return standalone() ? '认不出你是谁（浏览器没存上 cookie），刷新页面再进' : '还没登录，先登录再来';
    case CLOSE.tryLater:
      return '平台有点忙，正在重新连接…';
    case CLOSE.noRoom:
      return '没有这个房间：看看房间码对不对，或者房间已经散了';
    case CLOSE.tooManyJoins:
      return '你在这个房间进进出出太多次了，换个房间吧';
    case CLOSE.userQuota:
      return '你在这个房间发的消息太多了，先断开；换个房间再玩';
    case CLOSE.full:
      return '房间里人满了，进不去';
    case CLOSE.replaced:
      return '你在别的地方进了这个房间，这里先断开';
    case CLOSE.roomClosed:
      return '房间已经散了（打完了，或者太久没人）';
    case CLOSE.tooOld:
      return '页面版本太旧了，刷新一下再进';
    case CLOSE.forbidden:
      return `请从游戏${lobbyName()}打开牌馆再进房间`;
    case CLOSE.policy:
    case CLOSE.tooBig:
      return '连接出了点问题，刷新页面再试';
    default:
      return '连不上房间，检查一下网络';
  }
}

/** 房间接口的地址（同域） */
function roomsUrl(): string {
  return `${ROOM_PATH}/rooms`;
}

function wsUrl(code: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return withNick(`${proto}//${window.location.host}${ROOM_PATH}/rooms/${code}/ws`);
}

/**
 * 开房：成功给房间码，失败给一句话。额度（arcade-kit 0.2.0）不够时 kit 回 JSON { error, code? }：
 * 已经有一个开着的房间（409 has_room，带那个房间的码，每人同时 1 个）、今天开房次数用完（429）、今天联机的人太多（503 busy）。
 */
export async function createRoom(
  fetcher: typeof fetch = fetch,
  stake: TierId | null = null,
  variant: 'ddz' | null = null,
  noShuffle = false,
): Promise<{ code: string } | { error: string; login?: boolean; quota?: CreateError; room?: string }> {
  let res: Response;
  try {
    // 实盘房间（0.5.0）：开房时就定档位（arcade-kit 0.4.0 的开房选项），之后不能改
    // 斗地主房间（牌馆 ⑤⑥）：请求体带 variant: 'ddz'，实盘再带 stake；不洗牌再带 noShuffle（娱乐 0.33.0、实盘 0.39.0）
    const body = variant ? { variant, ...(stake ? { stake } : {}), ...(noShuffle ? { noShuffle: true } : {}) } : stake ? { stake } : null;
    const init: RequestInit = body
      ? { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : { method: 'POST', credentials: 'same-origin' };
    res = await fetcher(withNick(roomsUrl()), init);
  } catch {
    return { error: '连不上服务器，检查一下网络' };
  }
  if (res.status === 201) {
    const body = (await res.json().catch(() => null)) as { code?: unknown } | null;
    if (body && typeof body.code === 'string' && /^\d{6}$/.test(body.code)) return { code: body.code };
    return { error: '开房没成功，刷新一下再试' };
  }
  if (res.status === 401) return standalone() ? { error: '认不出你是谁，刷新页面再试' } : { error: '还没登录，先登录再来', login: true };
  if (res.status === 403) return { error: `请从游戏${lobbyName()}打开牌馆再开房` };
  if (res.status === 404) return { error: '好友房暂时关了，单机照常玩' };
  const body = (await res.json().catch(() => null)) as { error?: unknown; code?: unknown } | null;
  if (body?.error === 'has_room') return { error: QUOTA_TEXT.has_room, quota: 'has_room', ...(typeof body.code === 'string' && /^\d{6}$/.test(body.code) ? { room: body.code } : {}) };
  if (body?.error === 'daily_limit') return { error: QUOTA_TEXT.daily_limit, quota: 'daily_limit' };
  if (body?.error === 'busy') return { error: QUOTA_TEXT.busy, quota: 'busy' };
  if (body?.error === 'bad_options') return { error: '这个档位开不了，换一个试试' };
  // unavailable（平台、计量一时连不上）、开房码连撞：房间没开成，什么都没动
  return { error: '房间没开成（平台一时连不上），过一会儿再点"开个房间"' };
}

type SocketImpl = new (url: string) => WebSocketLike;

/** 测试用：不连真房间时换掉 RoomClient，或者给真 RoomClient 换 WebSocket、计时器 */
export interface LinkDeps<A, R> {
  client?: RoomClient<A, R>;
  url?: string;
  WebSocketImpl?: SocketImpl;
  /** 现在登录的是谁（默认问 /api/me） */
  whoAmI?: () => Promise<string | null>;
  setTimer?: RoomClientOptions<R>['setTimer'];
  clearTimer?: RoomClientOptions<R>['clearTimer'];
  /** 快速匹配排到的桌（0.26.0）：不给就看本机记着的这个房间是不是 */
  match?: boolean;
}
export interface LinkFrame<V> {
  nv: V;
  delay: number;
}

/**
 * 联机会话里和玩法无关的部分（牌馆 ⑤ 从 NetSession 抽出来，掼蛋、斗地主共用）：连房间、座位和房间信息、关闭码和重连文字、
 * 记房间码、帧排队、出手锁到 ack、聊天和互动。玩法只管三件事：把房间按真实座位发来的视图转成"我 = 0"（project）、
 * 座位号怎么在真实和画面之间换（seatToView / seatToReal）、座位上的人怎么写进 labels.ts（identities）。
 * 大厅（online.ts）在知道房间是哪个玩法之前用掼蛋的会话连；房间信息一到发现不是（variant 不对），
 * 这条会话不处理任何视图，由大厅换一条对的会话重连。
 */
export abstract class RoomLink<A, R, V> {
  readonly online = true;
  autoplay = false;
  readonly code: string;
  /** 这条会话按哪个玩法转视图 */
  readonly variant: RoomVariant;
  /** 进房时就知道是快速匹配排到的桌（房间信息到之前用） */
  private readonly matched: boolean;
  /** 这条连接收不收发打字聊天：陌生人桌按进房那一刻的设置（中途改了下次进房生效，连接上的 chat=1 改不了），别的都收（设置里"聊天"另算） */
  readonly chatOn: boolean;
  /** 这个房间是我开的（只有房主能开局；房间不下发谁是房主） */
  readonly host: boolean;
  /** 我的真实座位；没坐下为 null */
  mySeat: number | null = null;
  room: RoomInfo | null = null;
  status: ClientStatus = 'connecting';
  closeCode: number | null = null;
  /** 房间关闭时给的原因（arcade-kit 0.2.0：4000 带 quota 是今天额度满了收场） */
  closeReason: string | null = null;
  /** 最近一次连接断开时的关闭码（arcade-kit 0.1.1 起重连中也带：1006 断网、1013 平台忙）；进了房间（welcome）清空 */
  lastCloseCode: number | null = null;
  /** 开打后我绑定的真实座位（离座了也还是它，能"回到我的座位"）；没开打、没坐过为 null */
  bound: number | null = null;
  /** 画面正在显示的那一帧（我 = 0） */
  shown: V | null = null;
  /** 收到了、还没播放的帧 */
  readonly queue: LinkFrame<V>[] = [];
  /** 这次连接已经把房间记到账号名下了（只问一次 /api/me） */
  private claimed = false;
  private autoSat = false;
  /** 再来一场跟过来的：想坐的真实座位（和上一场一样的相对位置），空着就自动坐它 */
  prefer: number | null = null;
  private readonly whoAmI: () => Promise<string | null>;
  /** 发出去还没回音的操作的 moveId */
  pending: string | null = null;
  /** 最近一次被房间拒绝的原因（冒烟看） */
  lastError: string | null = null;
  private readonly listeners = new Set<NetListener>();
  protected readonly client: RoomClient<A, R>;

  protected constructor(variant: RoomVariant, code: string, host: boolean, deps: LinkDeps<A, R> = {}) {
    this.variant = variant;
    this.code = code;
    this.host = host;
    this.whoAmI = deps.whoAmI ?? (() => currentUserId());
    liveCode = code;
    const prev = savedRoom()?.code === code ? savedRoom() : null;
    this.matched = deps.match ?? prev?.match === true;
    rawStore.write(KEYS.room, {
      code,
      host,
      at: prev?.at ?? Date.now(),
      userId: prev?.userId ?? null,
      ...(this.matched ? { match: true as const } : {}),
      ...(variant === 'ddz' ? { variant: 'ddz' as const } : {}),
    } satisfies SavedRoom);
    // 陌生人桌（快速匹配）看设置"聊天"选没选"不和陌生人"（strangerChat 为假）：选了就不给 onChat，kit 进房不带 chat=1，房间不转聊天给这条连接（kit docs/match.md 第 5 节）
    this.chatOn = !this.matched || getSettings().strangerChat;
    this.client =
      deps.client ??
      new RoomClient<A, R>({
        url: deps.url ?? wsUrl(code),
        clientVersion: CLIENT_VERSION,
        onMessage: (m) => this.handle(m),
        onStatus: (s, c, r) => this.onStatus(s, c ?? null, r ?? null),
        // 聊天（kit 0.18.0）：文字里可能有冒号，不走 emit 的字符串，直接交给牌桌挂的 chatSink（座位换成画面上的）
        ...(this.chatOn ? { onChat: (seat: number, text: string, masked: boolean) => this.chatSink?.(this.seatToView(seat), text, masked) } : {}),
        onChatError: (code) => this.chatErrorSink?.(code),
        // detail："说话人:编号:对象:电脑"（画面座位；没对象是空串，电脑发的末尾是 1）
        onEmote: (seat, id, to, bot) => this.emit('emote', `${this.seatToView(seat)}:${id}:${to === undefined ? '' : this.seatToView(to)}:${bot ? 1 : 0}`),
        ...(deps.WebSocketImpl ? { WebSocketImpl: deps.WebSocketImpl } : {}),
        ...(deps.setTimer ? { setTimer: deps.setTimer } : {}),
        ...(deps.clearTimer ? { clearTimer: deps.clearTimer } : {}),
      });
  }

  /** 房间按真实座位发来的视图 → 我 = 0 的视图（mySeat 已经更新） */
  protected abstract project(raw: R): V;
  /** 真实座位 → 画面座位（座位 -1 原样） */
  protected abstract seatToView(real: number): number;
  /** 画面座位 → 真实座位（选座、互动对象用） */
  protected abstract seatToReal(view: number): number;
  /** 把座位上的人写进 labels.ts */
  protected abstract identities(): void;
  /** 我走开了、房间在快速替我出（0.6.3）：画面座位 0 是我 */
  abstract get afk(): boolean;

  /** 快速匹配的桌（kit 0.20.0 的 RoomInfo.match）：没有房间码、邀请、房主开局，人到齐自动开打 */
  get match(): boolean {
    return this.room ? this.room.match === true : this.matched;
  }

  /** 平台暂时不可用（1013）：连不上不是玩家的网络问题，别让他去查网络 */
  get platformBusy(): boolean {
    return (this.status === 'reconnecting' || this.status === 'failed') && this.lastCloseCode === CLOSE.tryLater;
  }

  /** 房间已经知道是别的玩法：这条会话不转它的视图，大厅换一条对的重连 */
  get wrongVariant(): boolean {
    return !!this.room && roomVariant(this.room) !== this.variant;
  }

  /**
   * 连接没好时给玩家看的一句话（大厅、牌桌横条共用）；连着的时候是空串。
   * tap：横条上失败时点一下能重试，要说出来；大厅里另有"再试一次"按钮。
   */
  linkText(tap = false): string {
    switch (this.status) {
      case 'connecting':
      case 'reconnecting':
        return this.platformBusy ? '平台有点忙，正在重试…' : '网络断了，正在重连…';
      case 'failed':
        if (this.platformBusy) return tap ? '平台有点忙，过一会儿点这里重试' : '平台有点忙，过一会儿再试';
        return tap ? '连不上房间，点这里重试' : '连不上房间，检查一下网络';
      case 'closed':
        return closeText(this.closeCode, this.closeReason);
      default:
        return '';
    }
  }

  on(fn: NetListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  protected emit(kind: NetEvent, detail?: string): void {
    for (const fn of [...this.listeners]) fn(kind, detail);
  }

  private onStatus(s: ClientStatus, code: number | null, reason: string | null = null): void {
    this.status = s;
    if (code !== null) this.lastCloseCode = code;
    if (s === 'closed') {
      this.closeCode = code;
      this.closeReason = reason;
      if (isFinalForRoom(code)) forgetRoom();
    }
    if (s === 'open') this.closeCode = null;
    this.emit('status', s);
  }

  /** 进了房间（cookie 认得人）：把本机记的房间记到现在这个账号名下，换了账号的人看不到它 */
  private async claimRoom(): Promise<void> {
    const id = await this.whoAmI();
    const r = savedRoom();
    if (id === null || r?.code !== this.code) return;
    if (r.userId !== id) rawStore.write(KEYS.room, { ...r, userId: id } satisfies SavedRoom);
  }

  /** 收到房间消息（RoomClient 已经按 seq 去过重）。测试里直接调。 */
  handle(msg: DownMsg<R>): void {
    if (msg.t === 'welcome') {
      if (!this.claimed) {
        this.claimed = true;
        void this.claimRoom();
      }
      this.lastCloseCode = null;
      this.mySeat = msg.you.seat;
      this.bound = msg.you.bound ?? null;
      this.room = msg.room;
      this.queue.length = 0;
      this.pending = null;
      this.onFresh();
      if (this.wrongVariant) {
        this.shown = null;
        this.emit('reset');
        return;
      }
      this.shown = msg.view ? this.project(msg.view) : null;
      this.identities();
      // 连上了（打开页面、断线重连）就说明人回来了：房间还当我走开着的话，替我点一下"我回来了"。
      // 人一直连着、只是走开的收不到 welcome，照旧要自己点
      if (this.mySeat !== null && this.afk) this.back();
      this.emit('reset');
      // 每次进房只替人坐一次（之后换座、重连都按他自己的）
      if (!this.autoSat) {
        this.autoSat = true;
        const seat = autoSeat(msg.room, msg.you, this.prefer);
        if (seat !== null) this.client.sit(seat);
      }
      return;
    }
    if (msg.t === 'error') {
      // 快捷短语被拒（发太快之类）：不打扰，按钮自己有冷却
      if ((EMOTE_ERRORS as readonly string[]).includes(msg.code)) return;
      // 自动点的"我回来了"晚到一步（已经自己出过牌了）：不用告诉人
      if (msg.code === 'not_away') return;
      if (msg.moveId && msg.moveId === this.pending) this.pending = null;
      this.lastError = msg.code;
      this.emit('error', msg.code);
      return;
    }
    if (msg.ack && msg.ack === this.pending) this.pending = null;
    const seatChanged = msg.you.seat !== this.mySeat;
    this.mySeat = msg.you.seat;
    this.bound = msg.you.bound ?? null;
    this.room = msg.room;
    if (this.wrongVariant) {
      this.emit('room');
      return;
    }
    const frames = msg.frames.filter((f) => f.view !== null).map((f) => ({ nv: this.project(f.view!), delay: f.delay }));
    if (seatChanged) {
      // 换了座位（刚坐下、接管）：视角整个变了，直接跳到最新一帧整桌重画
      this.queue.length = 0;
      const last = frames[frames.length - 1];
      if (last) this.shown = last.nv;
      this.identities();
      this.emit('reset');
      return;
    }
    this.queue.push(...frames);
    // 帧收下以后再更新（谁走开了看最新一帧）
    this.identities();
    this.emit(frames.length ? 'frames' : 'room');
  }

  /** 收到全量快照时，子类清自己的状态用 */
  protected onFresh(): void {}

  /** 牌桌取下一帧来播 */
  take(): LinkFrame<V> | undefined {
    const f = this.queue.shift();
    if (f) this.shown = f.nv;
    return f;
  }

  // ───────────── 房间里的事 ─────────────

  get playing(): boolean {
    return this.room?.status === 'playing' || this.room?.status === 'over';
  }

  /**
   * 能进牌桌了：开打了、手上有局面（已经显示过的，或者开局时排着还没播的第一帧）。没坐下的人也进，是旁观（0.13.0）：
   * 房间给没入座的只下发公开视图（座位 -1，没有任何人的手牌）
   */
  get canEnterTable(): boolean {
    return !this.wrongVariant && this.playing && (this.shown !== null || this.queue.length > 0);
  }

  /** 旁观：开打了、我没坐下 */
  get watching(): boolean {
    return this.playing && this.mySeat === null;
  }

  /**
   * 旁观时能坐哪儿（真实座位）：回我自己绑着的座位；娱乐房间接管第一个没绑人的电脑座位（照 kit 的座位绑人规则）。
   * 实盘房间只看、不带入（docs/social.md 1.4），自己的座位除外。null：没地方坐
   */
  freeSeat(): number | null {
    const room = this.room;
    if (room?.status !== 'playing' || this.mySeat !== null) return null;
    if (this.bound !== null) return this.bound;
    if (isStakeRoom(room)) return null;
    const i = room.seats.findIndex((s) => s.kind === 'ai' && !s.reserved);
    return i >= 0 ? i : null;
  }

  sit(realSeat: number): void {
    this.client.sit(realSeat);
  }

  start(): void {
    this.client.start();
  }

  /** 牌桌挂上来收聊天的（画面座位）；牌桌关了置回 null，这时收到的丢掉（聊天不补发） */
  chatSink: ((seat: number, text: string, masked: boolean) => void) | null = null;
  chatErrorSink: ((code: string) => void) | null = null;

  /** 说一句（kit 的 RoomClient.chat：本地先过一遍过滤和节奏，不行直接返回原因） */
  chat(text: string): ChatSendResult {
    return this.client.chat(text);
  }

  /** 发一句快捷短语、表情或道具（编号见 src/net/emotes.ts）；toView 是画面座位，转成真实座位再发 */
  emote(id: number, toView?: number): void {
    this.client.emote(id, toView === undefined || this.mySeat === null ? undefined : this.seatToReal(toView));
  }

  /** 离开房间：开打后由电脑接手我的座位；忘掉房间码（本机和地址栏里的） */
  leave(): void {
    if (this.mySeat !== null) this.client.leave();
    forgetRoom();
    roomInUrl(null);
    this.close();
  }

  close(): void {
    this.client.close();
    if (liveCode === this.code) liveCode = null;
    setSeatIdentities([null, null, null, null]);
    setWatching(false);
  }

  /** 换成别的玩法的会话时放手：只断开这条连接，座位、房间码、本机记的都不动 */
  detach(): void {
    this.client.close();
  }

  retry(): void {
    this.client.retry();
  }

  /** 这一手轮到谁、截止时间（画面座位） */
  turnInfo(): { seat: number; deadline: number | null } | null {
    const t = this.room?.turn;
    if (!t) return null;
    return { seat: this.seatToView(t.seat), deadline: t.deadline };
  }

  /** 托管中点"我回来了"（不轮流的操作）；自己出一手也一样会恢复 */
  back(): void {
    this.client.act({ type: 'back' } as A);
  }
}
