/**
 * 好友房（docs/online.md 6）和快速匹配（docs/online.md 6.11）的页面：开房进房、排队、牌桌上的座位和计时、带入补码、离开和结算、叫朋友、报位置。
 * 连接本身在 src/online.ts（kit 的 RoomClient），规则在 src/room/；好友房锦标赛的出局和结束页在 tour.ts。
 */
import { MATCH_TEXT, MatchClient } from 'arcade-kit/client';
import { CLOSE } from 'arcade-kit/protocol';
import { openInvite, type Presence } from 'arcade-kit/social';
import { PROPS, propId } from 'arcade-kit/table-fun';
import { FUN_STAKES, stakesOf, type StakesId } from '../core/stakes.ts';
import type { Action } from '../core/table.ts';
import { TAUNTS } from '../fun/taunts.ts';
import { walletError } from '../net/wallet.ts';
import { createError, createRoom, isRoomCode, matchUrl, Online, seatName, type OnlineState, type OnlineUi, type SavedRoom } from '../online.ts';
import { MATCH_TABLE, matchTierOf } from '../room/match.ts';
import { HAND_PAUSE_MS, OPENING_MS, TURN_MS, type RoomView } from '../room/rules.ts';
import { site } from '../site.ts';
import { KEYS, readJson, remove, writeJson } from '../store.ts';
import { myTurn, notMyTurn, tickUntil } from '../view/alert.ts';
import { closeDialog, dialog } from '../view/dialog.ts';
import { el, setText, toggle } from '../view/dom.ts';
import { topBuyIn } from '../view/lobby.ts';
import { roomCard } from '../view/share.ts';
import { ROOM_REMEMBER_MS, SHOW_MS, URGE_AFTER_MS } from '../view/timing.ts';
import { roomSummary, type RoomSummaryRow } from '../view/summary.ts';
import { chips } from '../view/text.ts';
import { shareIt } from './shell.ts';
import { pace, type App } from './state.ts';
import { must } from '../must.ts';


export function createOnline(c: App) {
  const f = c.fn;
  const u = c.ui;
  const { stage, tableView, reads, tally, bar, betweenBar, roomPause, nextBtn, autoBtn, twoNote, showBar, handNo, topUpBtn, sitBtn, ffBtn, backSeatBtn, spectate, sitDownBtn, inviteBtn, hud, where, leaveBtn, roomPanel } = u;
  /** 正在排的队（同一时间只排一个） */
  let matcher: MatchClient | null = null;
  /** 房间替电脑发的、等这一手播完再画的（seat、id、to） */
  const botQueue: [number, number, number | undefined][] = [];
  /** 好友房锦标赛：房主的页面在座位坐满 6 个真人时替他点"开赛"（kit 没有自动开打，只有房主能发 start），每个房间只发一次 */
  let autoStarted = '';
  /** 带入被拒时按钮带多少（null 是带满） */
  let rebuyAmount: number | null = null;
  /** 被拒的那一次刷过钱包没有（被拒时页面上的余额多半是旧的） */
  let rebuyChecked = '';
  let urgeTimer = 0;
  let urgeFor = '';
  /** 好友房两手之间（房间的停顿，kit RoomInfo.pause）：大家看同一个倒计时，走完房间自己发下一手 */
  let pauseUntil: number | null = null;

  /** 读本机记着的房间：码不对、不是这个账号的、过了 6 小时的都当没有 */
  function readRoom(key: string): SavedRoom | null {
    const r = readJson<SavedRoom>(key);
    return r && isRoomCode(r.code) && r.userId === c.cloud.userId() && Date.now() - r.at < ROOM_REMEMBER_MS ? r : null;
  }

  const savedRoom = (): SavedRoom | null => readRoom(KEYS.room);

  /** 上一次进的好友房（离开后也留着，标题页说"那一桌还没结回"时给回去的按钮） */
  const lastRoom = (): SavedRoom | null => readRoom(KEYS.lastRoom);

  function saveRoom(r: SavedRoom | null): void {
    // 存不上：刷新后从大厅输码回来
    if (r) writeJson(KEYS.room, r);
    else remove(KEYS.room);
  }

  async function openRoom(stakes: StakesId, size: number, fun: boolean, tour?: { fill: boolean }): Promise<void> {
    if (c.busy) return;
    // 每人同时只能开 1 个（没真人的房间马上结束、还名额）：还开着的话 kit 回 has_room 带那个房间的码，直接送回去，不停在报错上
    c.busy = true;
    f.drawLobby();
    const r = await createRoom({ stakes, size, ...(tour ? { tour: true as const, fill: tour.fill } : {}), ...(fun ? { fun: true as const } : {}) }, f.nickname());
    c.busy = false;
    if ('code' in r && !('error' in r)) enterRoom({ code: r.code, userId: c.cloud.userId(), host: true, at: Date.now(), ...(fun ? { fun: true as const } : {}) });
    else if (r.error === 'has_room' && r.code && isRoomCode(r.code)) backToOpen(r.code);
    else {
      c.walletNote = createError('error' in r ? r.error : 'unavailable');
      f.drawLobby();
    }
  }

  /**
   * 这一档排队找真人：排队卡写"正在找人 · 已有 n/6 人 · 还剩 s 秒"，"不等了，和电脑打"和"取消"都是 cancel。
   * 排到了进匹配桌（藏起房间码、叫人、选座、开打）；已经有开着的房间就回那一桌；只剩自己、今天的局数用完、联机忙时说一句（MATCH_TEXT），
   * 过一秒多转成同一档的单机（照常从钱包带入）。被同一个账号别处的排队顶掉（replaced）不开单机。
   * 娱乐档（fun）：所有难度排同一队，排到的是不记筹码的娱乐房间；转单机时按选的难度开娱乐单机
   */
  async function quickMatch(stakes: StakesId, fun: boolean, level: number): Promise<void> {
    if (c.busy || matcher) return;
    const st = stakesOf(fun ? FUN_STAKES : stakes);
    const body = el('div', 'match-card');
    el('div', 'mc-tier', body, fun ? `娱乐 · 筹码不算数 · ${MATCH_TABLE} 人桌` : `实盘 · ${st.name} · 盲注 ${chips(st.sb)}/${chips(st.bb)} · ${MATCH_TABLE} 人桌`);
    const line = el('div', 'mc-wait', body);
    el('div', 'mc-tip', body, '找到几个算几个，空位电脑补；只剩你一个就先和电脑打');
    // 冒烟看排队卡说过什么（排到、转单机时卡片马上就关了）
    const said = ((window as { __said?: string[] }).__said ??= []);
    const say = (t: string): void => {
      setText(line, t);
      said.push(t);
    };
    let tick = 0;
    /** 排到了、回原来的房间：卡片由这里关，之后什么都不做 */
    let entered = false;
    /** 房间说转单机：说完那句话一秒多后关卡片、开单机；这一秒里点了"取消"就不开 */
    let soloNow = false;
    let soloTimer = 0;
    let count = 0;
    let seats = MATCH_TABLE;
    let until = 0;
    const draw = (): void => say(`正在找人 · 已有 ${count}/${seats} 人 · 还剩 ${Math.max(0, Math.ceil((until - Date.now()) / 1000))} 秒`);
    const stop = (): void => {
      window.clearInterval(tick);
      matcher?.cancel();
      matcher = null;
    };
    say('正在找人…');
    const mc = new MatchClient({
      url: matchUrl(matchTierOf(stakes, fun)),
      onWaiting: (n, size, leftMs) => {
        count = n;
        seats = size;
        until = Date.now() + leftMs;
        draw();
        if (!tick) tick = window.setInterval(draw, 1_000);
      },
      onMatched: (code) => {
        stop();
        entered = true;
        closeDialog();
        enterRoom({ code, userId: c.cloud.userId(), host: false, at: Date.now(), match: true, ...(fun ? { fun: true as const } : {}) });
      },
      onHasRoom: (code) => {
        stop();
        entered = true;
        closeDialog();
        backToOpen(code);
      },
      onSolo: (why) => {
        stop();
        say(MATCH_TEXT[why]);
        if (why === 'replaced') return;
        soloNow = true;
        soloTimer = window.setTimeout(closeDialog, 1_200);
      },
    });
    matcher = mc;
    mc.start();
    const pick = await dialog(
      stage,
      '快速匹配',
      body,
      [
        { label: '不等了，和电脑打', value: 'solo' },
        { label: '取消', value: 'cancel', primary: true, cancel: true },
      ],
      true,
    );
    window.clearTimeout(soloTimer);
    if (entered) return;
    stop();
    // 人点了"不等了"，或者房间说转单机、卡片到点自己关了（pick 是 null）；点了"取消"什么都不开
    if (pick === 'solo' || (pick === null && soloNow)) void matchSolo(stakes, fun, level);
  }

  /** 匹配没排到人：同一档开一桌单机，6 人桌，钱包够就带满一份（不够少带一点，和选桌一样） */
  function matchSolo(stakes: StakesId, fun: boolean, level: number): Promise<void> {
    if (fun) return f.start(FUN_STAKES, MATCH_TABLE, stakesOf(FUN_STAKES).max, true, level);
    const st = stakesOf(stakes);
    return f.start(stakes, MATCH_TABLE, topBuyIn(st, c.wallet?.balance ?? 0), false);
  }

  function joinRoom(code: string): void {
    if (!isRoomCode(code)) return;
    const old = savedRoom();
    enterRoom(old?.code === code ? old : { code, userId: c.cloud.userId(), host: false, at: Date.now() });
  }

  /** 每人同时 1 个房间：还占着一间（自己开的没散、匹配桌还在打）时开房、排队都送回那一间，说一声为什么 */
  function backToOpen(code: string): void {
    joinRoom(code);
    f.toast('你已经开着一个房间，先回到这一桌');
  }

  function backToRoom(): void {
    const r = savedRoom() ?? lastRoom();
    if (r) enterRoom(r);
  }

  /** 点了"离开房间"、房间关了、房间没了：本机关于这个房间的记录全清掉 */
  function forgetRoom(): void {
    saveRoom(null);
    remove(KEYS.lastRoom); // 清不掉：6 小时后自己过期
  }

  function enterRoom(r: SavedRoom): void {
    // 本机还有一桌单机没打完也能进：那一桌存在本机，回标题页还能接着打；钱包里两份互不影响
    saveRoom({ ...r, at: Date.now() });
    reads.clear();
    tally.clear();
    c.feedSent.clear();
    // 存不上：标题页只是不给"回到房间"
    writeJson(KEYS.lastRoom, { ...r, at: Date.now() });
    c.online?.close();
    c.lastRefused = null;
    c.wasBuying = false;
    c.outShown.clear();
    c.roomTourEnded = '';
    c.roomWatch = false;
    c.laidOut = { size: 0, me: -1 };
    stage.classList.add('in-room');
    closeDialog();
    // 换了房间、离开以后，旧连接还没播完的帧和状态回调一律不理
    const o: Online = new Online(r, roomUi(() => c.online === o), { name: f.nickname(), chat: !r.match || c.strangerChat });
    c.online = o;
    f.openFun(`room:${r.code}`);
    c.social?.presenceNow(true);
    drawRoom(o.state);
  }

  /** 锦标赛里离开的说明：还在打的座位交给电脑托管，打完按名次由服务端结回；淘汰了、打完了、旁观的直接走 */
  function tourLeaveText(t: NonNullable<RoomView['tour']>, me: number | null): string {
    const playing = t.in && !t.over && me !== null && t.places[me] === null;
    if (!playing) return '离开房间？名次和奖金不变，奖金会直接结回钱包。';
    return t.fun ? '你的座位交给电脑接着打，打完出名次。' : '你的座位交给电脑接着打，打完按名次把奖金结回钱包，不用你在线。报名费不退，想拿奖就坚持到底。';
  }

  /** 离开房间：坐着的先离座（这一手弃牌，打完结回钱包），再断开。auto：止盈到了自动走，不问 */
  async function leaveRoom(goHome: boolean, auto = false): Promise<void> {
    const o = c.online;
    if (!o) return;
    const st = o.state;
    const seated = st.you?.seat !== null && st.you?.seat !== undefined;
    const playing = st.room?.status === 'playing';
    // 断线时离座的消息发不出去（kit 没连上就丢），座位和筹码还留在房间里：不能说"马上结回"，也不能把回房间的路清掉
    if (seated && st.status !== 'open') {
      const how = await dialog(
        stage,
        '网络断了',
        '现在连不上房间，"离开"发不出去：你还坐着，掉线由电脑代打，筹码还在桌上。等连上了再点离开，筹码马上结回；先回大厅也行，回来点"回到房间"再离开。',
        [
          { label: '等连上', value: 'wait', primary: true },
          { label: '先回大厅', value: 'lobby' },
        ],
      );
      if (how !== 'lobby' || c.online !== o) return;
      o.close();
      // 不 forgetRoom：上一次进的房间留着，标题页按钱包里那一份给"回到房间"
      exitRoom('你还坐在好友房里（掉线由电脑代打）：连上网后点"回到房间"再离开，桌上的筹码才会结回');
      if (goHome) {
        c.cloud.flush();
        location.href = f.hall();
      }
      return;
    }
    const ok = auto
      ? 'yes'
      : await dialog(
          stage,
          '离开房间',
          seated && playing && st.view?.tour
            ? tourLeaveText(st.view.tour, st.you?.seat ?? null)
            : seated && playing
              ? noWallet()
                ? '这一手弃牌，离开后座位空出来。'
                : '这一手弃牌，桌上的筹码马上结回钱包。'
              : seated
                ? '离开后座位空出来。'
                : '不看了？',
          [
            { label: '留下', value: 'no', cancel: true },
            { label: '离开', value: 'yes', danger: true },
          ],
        );
    if (ok !== 'yes' || c.online !== o) return;
    // 确认的这一会儿断了：按断线的说
    if (seated && o.state.status !== 'open') return leaveRoom(goHome);
    const rows = summaryRows(o.state, true);
    // 回大厅的不出结算页，也就不用先画分享卡
    const share = rows && !goHome ? roomShare(o.state, rows, true) : undefined;
    if (seated) o.leaveSeat();
    // 离座的消息先发出去再断开
    await new Promise((done) => window.setTimeout(done, 300));
    o.close();
    forgetRoom();
    // 还没结回的那一份由标题页按钱包说（drawLobby），这里不另记一句：记了会一直挂着，和钱包对不上
    exitRoom(null);
    if (rows && !goHome) await roomSummary(stage, '这一场', null, rows, tally.awards(rows), share);
    if (goHome) {
      c.cloud.flush();
      location.href = f.hall();
    }
  }

  /** 我在哪（kit 每次报之前现问）：在好友房里报房间码和"真人/座位数"，别的时候报在玩德州 */
  function presence(): Presence {
    const s = c.online?.state;
    // 快速匹配桌进不去（不是这一桌的人房间回 4004），不报房间码
    if (!s?.room || c.online?.match) return { place: 'game', game: 'texas' };
    const humans = s.room.seats.filter((x) => x.kind === 'human').length;
    const size = s.view?.size ?? s.opts?.size ?? s.room.seats.length;
    return { place: 'room', game: 'texas', room: s.code, seats: `${humans}/${size}` };
  }

  /** 点了邀请横条的"去"：正在牌桌上的先问一句（单机这一桌留在本机，回来接着打；好友房的座位照旧，掉线算歇着） */
  async function goInvite(game: string, room: string): Promise<void> {
    if (stage.classList.contains('at-table')) {
      const ok = await dialog(stage, '去朋友的房间', '先离开这一桌？单机这一桌会留着，回来接着打。', [
        { label: '留下', value: 'no' },
        { label: '去', value: 'yes', primary: true },
      ]);
      if (ok !== 'yes') return;
    }
    c.cloud.flush();
    location.assign(`/games/${game}/?room=${room}`);
  }

  /** 好友房结算页的"分享"：单独部署没有；withRoom 时链接带房间码（房间还开着，朋友点了能进来看） */
  function roomShare(s: OnlineState, rows: RoomSummaryRow[], withRoom: boolean): (() => void) | undefined {
    const v = s.view;
    if (site.standalone || !v) return undefined;
    const card = roomCard(rows, tally.awards(rows), `${stakesOf(v.stakes).name} · ${v.size} 人桌`, c.myName);
    return card ? shareIt(card, withRoom && !c.online?.match ? s.code : null) : undefined;
  }

  /**
   * 好友房这一场每个人的输赢（房间按座位记的账，RoomView.net）。没人带过筹码时 null。
   * leaving：我正要离开，手里这一手会弃牌，已经下的注算输
   */
  function summaryRows(s: OnlineState, leaving: boolean): RoomSummaryRow[] | null {
    const v = s.view;
    const room = s.room;
    if (!v || !room) return null;
    const me = s.you?.seat ?? s.you?.bound ?? null;
    const rows = v.net.flatMap((net, i): RoomSummaryRow[] => {
      if (net === null) return [];
      const lost = leaving && i === me && must(v.seats[i], '视图里每个座位号都有座位').status === 'active' ? must(v.seats[i], '视图里每个座位号都有座位').total : 0;
      return [{ name: seatName(s, i, me, c.myName), net: net - lost, me: i === me }];
    });
    return rows.length ? rows : null;
  }

  /**
   * 回到大厅（离开、房间关了）。
   * keep：被别的页面顶掉（4001）时不清本机记着的房间：那条记录是另一个页面还在用的，清了它刷新后就不知道自己是房主
   */
  function exitRoom(note: string | null, keep = false): void {
    c.online = null;
    c.social?.presenceNow(true);
    if (!keep) saveRoom(null);
    stage.classList.remove('in-room', 'at-table');
    toggle(backSeatBtn, 'hidden', true);
    toggle(spectate, 'hidden', true);
    toggle(sitDownBtn, 'hidden', true);
    tableView.setPeople(null);
    tableView.setClock(null, null, 1);
    drawRoomPause(null);
    toggle(betweenBar, 'hidden', true);
    toggle(twoNote, 'hidden', true);
    drawRebuy(null);
    toggle(inviteBtn, 'hidden', true);
    toggle(hud, 'inviting', false);
    drawUrge(null, null);
    botQueue.length = 0;
    notMyTurn();
    roomPanel.draw(null);
    c.walletNote = note;
    // 钱包回来只重画标题页：不能再 showLobby，它会关掉紧接着弹的"这一场"结算（结算一闪就没）
    void f.refreshWallet().then(() => {
      if (note) c.walletNote = note;
      f.drawLobby();
    });
    f.showLobby();
  }

  const roomUi = (mine: () => boolean): OnlineUi => ({
    draw: (s) => {
      if (mine()) drawRoom(s);
    },
    async play(prev, next, last) {
      const o = c.online;
      if (!o || !mine()) return;
      stage.classList.add('at-table');
      // 刚进来、换了座位：直接摆，不播
      if (layOut(next.size, o.mySeat) || !prev) {
        tableView.show(next);
        return;
      }
      c.animating++;
      bar.update(prev, false);
      try {
        const action = last && last.action.t !== 'rebuy' ? (last.action as Action) : null;
        await tableView.play(prev, next, last?.seat ?? null, action);
        const me = o.state.you?.seat;
        if (me !== null && me !== undefined) f.record(prev, next, me);
        reads.observe(prev, next, f.who(prev));
        f.handDone(prev, next, me ?? null);
      } finally {
        c.animating--;
      }
      if (c.animating === 0 && botQueue.length) flushBots();
      f.syncFun();
    },
    toast: (text) => {
      if (mine()) f.toast(text);
    },
    // 真人发的即时画；房间替电脑发的（kit 的 botEmote）房间一算完就到：一手打完那一下页面多半还在播这一手，排着播完再交给 kit
    // （kit 收到电脑座位发来的会再晚 0.9 秒播、配一句话，像人看一眼再回）
    chat: (seat, text, masked) => {
      if (mine()) c.tf?.chat(seat, text, masked);
    },
    chatError: (code) => {
      if (mine()) c.tf?.chatError(code);
    },
    emote: (seat, id, to, bot) => {
      if (!mine()) return;
      if (!bot) return c.tf?.receive(seat, id, to);
      botQueue.push([seat, id, to]);
      if (c.animating === 0) flushBots();
    },
    ended: (text, code) => {
      const o = c.online;
      if (!mine() || !o) return;
      // 房间关了、没有这个房间：本机记着的都清掉，标题页不再给"回到房间"
      if (code === CLOSE.noRoom || code === CLOSE.roomClosed) forgetRoom();
      // 锦标赛打完房间就关：结束页（名次、奖金、真人名次表）还在看的话不能被收掉；还没弹的在这里弹
      if (o.state.view?.tour?.over && code === CLOSE.roomClosed) {
        if (c.roomTourEnded !== o.state.code) void f.roomTourEnd(o.state);
        return;
      }
      // 房间关了是这一场打完了：给每个人的输赢；别的（被顶掉、连不上）只说一句
      const rows = code === CLOSE.roomClosed ? summaryRows(o.state, false) : null;
      // 房间关了：分享链接不带房间码（进不去了）
      const share = rows ? roomShare(o.state, rows, false) : undefined;
      exitRoom(null, code === CLOSE.replaced);
      if (rows) void roomSummary(stage, '这一场', text, rows, tally.awards(rows), share);
      else void dialog(stage, '好友房', text, [{ label: '好', value: 'ok', primary: true }]);
    },
    wait: (ms) => (pace(c) === 0 ? Promise.resolve() : new Promise((ok) => window.setTimeout(ok, ms * pace(c)))),
    skip: (on) => {
      c.skipAnim = on;
    },
  });

  function flushBots(): void {
    for (const [seat, id, to] of botQueue.splice(0)) c.tf?.receive(seat, id, to);
  }

  /** 人数或我的座位变了：重摆牌桌（我永远在正下方）；摆了回 true */
  function layOut(size: number, me: number): boolean {
    if (c.laidOut.size === size && c.laidOut.me === me) return false;
    c.laidOut = { size, me };
    tableView.setup(size, me);
    return true;
  }

  function drawRoom(s: OnlineState): void {
    roomPanel.draw(s);
    if (s.opts?.tour && s.host && s.status === 'open' && s.room?.status === 'waiting' && autoStarted !== s.code && s.room.seats.slice(0, s.opts.size).every((x) => x.kind === 'human')) {
      autoStarted = s.code;
      c.online?.start();
    }
    const v = s.view;
    // 锦标赛打完房间就 over，牌桌和结束页还得摆着给人看（点"回大厅"才离开）
    const playing = (s.room?.status === 'playing' || (s.room?.status === 'over' && !!v?.tour)) && v !== null;
    stage.classList.toggle('at-table', playing);
    drawRoomTop(s);
    if (!playing || !s.room) {
      bar.update(null, false);
      drawUrge(null, null);
      return;
    }
    if (layOut(v.size, must(c.online, '联机房间的状态（只在好友房里被调用）').mySeat)) tableView.show(v);
    const me = s.you?.seat ?? null;
    const spectator = me === null && (s.you?.bound ?? null) === null;
    const room = s.room;
    const people = v.seats.map((_, i) => {
      const info = must(room.seats[i], '房间每个座位号都有座位信息');
      const human = info.kind === 'human';
      return {
        // 离座的人的座位已经换成电脑（庄家的筹码），按电脑的名字显示
        name: human ? info.name : null,
        // 中途坐下、接管电脑座位的人：钱到账了还要等这一手打完（写清楚，不让人以为卡住了）
        tag: human && info.auto ? '电脑代打' : human && info.away ? '掉线' : v.next?.[i] ? '下一手上桌' : v.buying[i] ? (v.tour ? '报名中' : '带入中') : null,
        takeable: spectator && !must(c.online, '联机房间的状态（只在好友房里被调用）').match && !v.tour && info.kind === 'ai' && !info.reserved,
      };
    });
    tableView.setPeople(people);
    const turn = s.room.turn;
    // 一手和一手之间也在计时的，是开打时在等这个人的买入（OPENING_MS）
    tableView.setClock(s.busy ? null : (turn?.seat ?? null), turn?.deadline ?? null, v.phase === 'idle' || v.tour?.phase === 'opening' ? OPENING_MS : TURN_MS);
    drawRoomPause(s.busy || c.animating > 0 ? null : (s.room.pause?.until ?? null));
    // 亮牌：房间停顿的前 SHOW_MS（停顿从这一手最后一帧播完算，和倒计时圈同一个起点）
    const until = s.room.pause?.until;
    if (!v.hold) showBar.hide();
    else if (until && !s.busy && c.animating === 0) f.drawShow(v, `${s.code}:${v.handNo}`, until - (HAND_PAUSE_MS - SHOW_MS));
    toggle(twoNote, 'hidden', !v.needTwo);
    if (v.needTwo) toggle(betweenBar, 'hidden', false);
    if (!s.busy && c.animating === 0) tableView.show(v);
    // 进房时还在等人页、牌桌没排座位，量不出聊天框挤不挤：等座位都坐上人（真人带入完）再量一次，kit 下次摆的时候按它收不收
    if (c.crowded === null && !s.busy && c.animating === 0 && v.seats.every((x) => x.owner !== 'none')) {
      c.crowded = !f.dockFitsNow();
      c.tf?.refresh();
    }

    setText(handNo, v.handNo ? `第 ${v.handNo} 手` : '');
    stage.dataset.phase = v.phase;
    const mine = me === null ? null : must(v.seats[me], '我的座位号在视图里有座位');
    // 被拒了、还没上桌的用座位上面那个大按钮；坐着的人补码（被拒了也一样）还是左下角的小按钮，被拒时冒一句
    // （坐着补码被拒也挂出"没带上桌"的大框的话，会按满额写、还把小按钮藏了）
    const seated = mine?.owner === 'player';
    const refusedOut = v.canRebuy && v.refused !== null && !seated;
    toggle(topUpBtn, 'hidden', !v.canRebuy || refusedOut);
    drawRebuy(refusedOut ? v : null);
    toggle(ffBtn, 'hidden', true);
    toggle(sitBtn, 'hidden', mine?.owner !== 'player' || !!v.tour);
    setText(sitBtn, mine?.away ? '回来' : '歇一手');
    toggle(sitBtn, 'sel', !!mine?.away);
    toggle(backSeatBtn, 'hidden', me !== null || (s.you?.bound ?? null) === null);
    // 互动只有坐着的人能发（kit：旁观的不能发，免得刷屏）
    f.syncFun();
    // 快速匹配桌叫不进人
    toggle(inviteBtn, 'hidden', must(c.online, '联机房间的状态（只在好友房里被调用）').match);
    // 竖屏小屏那一排放不下时藏"第几手"（style.css 的 .hud.inviting），切类不用 :has
    toggle(hud, 'inviting', !must(c.online, '联机房间的状态（只在好友房里被调用）').match);
    toggle(spectate, 'hidden', !people.some((p) => p.takeable));
    toggle(sitDownBtn, 'hidden', !people.some((p) => p.takeable));
    if (v.tour) f.roomTourNotes(s, v);

    // 我的买入、补码办完了：钱包的数变了
    const buyingNow = me !== null && (v.buying[me] ?? false);
    if (c.wasBuying && !buyingNow) void f.refreshWallet();
    c.wasBuying = buyingNow;

    // 买入被钱包拒了：钱包的数可能变了（比如别处已经结回），刷新一下，座位上面那块按新的数说
    if (v.refused && v.refused !== c.lastRefused) {
      void f.refreshWallet().then(() => c.online && drawRoom(c.online.state));
      if (v.tour) f.toast(`报名没成，这场你先旁观：${walletError(v.refused, undefined, 'room')}`);
      else if (seated) f.toast(`没补上：${walletError(v.refused, undefined, 'room')}`);
    }
    c.lastRefused = v.refused;

    const auto = bar.update(v, !s.busy && c.animating === 0 && s.status === 'open' && me !== null);
    if (auto) must(c.online, '联机房间的状态（只在好友房里被调用）').act(auto);
    drawUrge(me, v.phase === 'idle' ? null : turn);
    // 画面播完、真轮到我了：提醒一次，按房间的期限在最后 5 秒嘀嗒
    if (!s.busy && c.animating === 0) {
      if (!auto && me !== null && v.toAct === me && turn?.seat === me) {
        myTurn(`r${v.handNo}:${v.log.length}`);
        tickUntil(turn.deadline ?? null);
      } else notMyTurn();
    }
  }

  /** 这一桌的筹码不碰钱包：单独部署，或者娱乐房间 */
  const noWallet = (): boolean => site.standalone || c.online?.fun === true;

  /** 钱包够带多少（按大盲取整，最多 full）；不知道钱包时按 full */
  const affordable = (full: number, bb: number): number => (c.wallet ? Math.min(full, Math.floor(c.wallet.balance / bb) * bb) : full);

  /**
   * 带入被拒、还没上桌：为什么、怎么办，和"带入 2,000 上桌"（v 为 null 时收起）。
   * 钱包不够一整份（开一份只要求余额够这次带入）：按钮改成钱包够的数，最少这一档的最少买入
   */
  function drawRebuy(v: RoomView | null): void {
    toggle(u.rebuyBox, 'hidden', !v);
    if (!v) {
      rebuyChecked = '';
      return;
    }
    const st = stakesOf(v.stakes);
    const poor = v.refused === 'no_funds';
    if (poor && rebuyChecked !== c.online?.state.code) {
      rebuyChecked = c.online?.state.code ?? '';
      void f.refreshWallet().then(() => {
        const w = c.online?.state.view;
        drawRebuy(w?.canRebuy && w.refused !== null ? w : null);
      });
    }
    const can = affordable(st.max, st.bb);
    rebuyAmount = poor && can >= st.min && can < st.max ? can : null;
    setText(u.rebuyText, poor ? `${walletError('no_funds')}（钱包里有 ${c.wallet ? chips(c.wallet.balance) : '—'}）` : `没带上桌：${walletError(must(v.refused, '没钱以外的情况才会走到被拒的提示'), undefined, 'room')}`);
    toggle(u.rebuyWallet, 'hidden', !poor);
    setText(u.rebuyBtn, `带入 ${chips(rebuyAmount ?? st.max)} 上桌`);
  }

  /** 点了座位上面的"带入 X 上桌" */
  function rebuyNow(): void {
    c.online?.act({ t: 'rebuy', ...(rebuyAmount ? { amount: rebuyAmount } : {}) });
  }

  function drawUrge(me: number | null, turn: { seat: number; deadline?: number | null } | null): void {
    const info = turn ? c.online?.state.room?.seats[turn.seat] : null;
    const ok = !!turn && turn.deadline != null && me !== null && turn.seat !== me && info?.kind === 'human' && !info.auto && !c.funOff;
    const key = ok ? `${must(turn, 'ok 为真则轮到了人').seat}:${turn?.deadline}` : '';
    if (key === urgeFor) return;
    urgeFor = key;
    window.clearTimeout(urgeTimer);
    tableView.urge(null, () => {});
    if (!ok) return;
    const seat = must(turn, 'ok 为真则轮到了人').seat;
    const at = must(turn?.deadline, 'ok 为真则有计时截止') - TURN_MS + URGE_AFTER_MS;
    urgeTimer = window.setTimeout(() => tableView.urge(seat, () => f.funSend(propId(TAUNTS.length, PROPS.indexOf('bomb')), seat)), Math.max(0, at - Date.now()));
  }

  function drawRoomPause(until: number | null): void {
    toggle(betweenBar, 'hidden', until === null);
    toggle(roomPause, 'hidden', until === null);
    toggle(nextBtn, 'hidden', true);
    toggle(autoBtn, 'hidden', true);
    if (until === pauseUntil) return;
    pauseUntil = until;
    c.countdown?.cancel();
    c.countdown = until === null ? null : f.drain(roomPause, until - Date.now());
  }

  function drawRoomTop(s: OnlineState): void {
    const v = s.view;
    const o = v ? { stakes: v.stakes, size: v.size } : s.opts;
    const st = o ? stakesOf(o.stakes) : null;
    // 旁观中（docs/social.md 1.4）：开打了、我没坐下也没绑着座位（离座回来的有"回到我的座位"）
    const watching = s.room?.status === 'playing' && (s.you?.seat ?? null) === null && (s.you?.bound ?? null) === null;
    if (v?.tour) {
      const t = v.tour;
      const left = t.next ? `还有 ${t.handsLeft} 手涨` : '最后一级，不再涨';
      setText(where, `${watching ? '旁观中 · ' : ''}锦标赛 · 第 ${t.level + 1} 级 · 盲注 ${chips(t.blinds[0])}/${chips(t.blinds[1])} · ${left}`);
      toggle(where, 'watching', watching);
      toggle(leaveBtn, 'hidden', false);
      setText(leaveBtn, '离开');
      return;
    }
    const kind = c.online?.match ? '快速匹配' : `好友房 ${s.code}`;
    // 娱乐房间不写档位：筹码不算数，盲注照小桌
    const table = s.opts?.tour ? ` · 锦标赛 · ${c.online?.fun ? '娱乐' : (st?.name ?? '')}` : c.online?.fun ? ' · 娱乐 · 筹码不算数' : st ? ` · ${st.name} · 盲注 ${chips(st.sb)}/${chips(st.bb)}` : '';
    setText(where, `${watching ? '旁观中 · ' : ''}${kind}${table}`);
    toggle(where, 'watching', watching);
    toggle(leaveBtn, 'hidden', false);
    setText(leaveBtn, '离开');
  }

  /** 点了一个座位：看着的人可以接管没人的电脑座位 */
  async function takeSeat(i: number): Promise<void> {
    const s = c.online?.state;
    // 单机、不能接管的座位：看这个人这一场的数
    if (!s?.view || !s.room) return f.showRead(i);
    const info = s.room.seats[i];
    const spectator = (s.you?.seat ?? null) === null && (s.you?.bound ?? null) === null;
    if (!spectator || info?.kind !== 'ai' || info.reserved) return f.showRead(i);
    const st = stakesOf(s.view.stakes);
    const how = site.standalone ? `带 ${chips(st.max)} 上桌。` : `从钱包带 ${chips(st.max)} 上桌，离开时结回钱包。`;
    const ok = await dialog(stage, '接管这个座位', `电脑这一手弃牌，下一手起你坐这里：${how}`, [
      { label: '算了', value: 'no' },
      { label: '坐下', value: 'yes', primary: true },
    ]);
    if (ok === 'yes') c.online?.sit(i);
  }

  async function roomRebuy(): Promise<void> {
    const v = c.online?.state.view;
    if (!v?.canRebuy) return;
    const st = stakesOf(v.stakes);
    // 桌上还有的补到满；这一手打着的，打完才上桌
    const mine = v.me === null ? null : v.seats[v.me];
    const seated = mine?.owner === 'player';
    const full = seated ? st.max - mine.stack : st.max;
    // 钱包不够补满：补钱包够的，最少一个大盲（没坐上的最少这一档的最少买入）
    const add = noWallet() ? full : Math.max(Math.min(full, seated ? st.bb : st.min), affordable(full, st.bb));
    const later = mine?.status !== 'out' && v.phase !== 'idle' ? '，这一手打完上桌' : '';
    const to = seated ? `补到 ${chips(mine.stack + add)}` : '上桌';
    const msg = noWallet() ? `带 ${chips(add)} ${to}${later}。` : `从钱包带 ${chips(add)} ${to}${later}（钱包里有 ${c.wallet ? chips(c.wallet.balance) : '—'}）。`;
    const ok = await dialog(stage, '补码', msg, [
      { label: '算了', value: 'no' },
      { label: '补码', value: 'yes', primary: true },
    ]);
    if (ok === 'yes') c.online?.act({ t: 'rebuy', ...(add < full ? { amount: add } : {}) });
  }

  /**
   * 叫朋友来（kit 的面板）：有平台、已登录的列好友、一人一个"叫他来"，底下复制链接（手机上弹系统分享）；
   * 没挂上 social（单独部署、没登录）只有复制链接。链接按这一页自己的路径拼、只带房间码（档位、人数进房后房间会告诉他）；
   * 朋友没登录的，登录完平台跳回原链接（登录页的 next），照样进房
   */
  function invite(): void {
    const s = c.online?.state;
    if (!s) return;
    const url = new URL(location.pathname, location.origin);
    url.searchParams.set('room', s.code);
    const o = { game: 'texas', room: s.code, url: url.toString(), text: `来打德州，好友房 ${s.code}，点开就进` };
    if (c.social) c.social.openInvite(o);
    else openInvite({ ...o, friends: false });
  }

  return { savedRoom, lastRoom, openRoom, quickMatch, joinRoom, backToRoom, forgetRoom, leaveRoom, presence, goInvite, exitRoom, rebuyNow, drawRoomTop, takeSeat, roomRebuy, invite };
}
