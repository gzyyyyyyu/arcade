/**
 * 牌桌：播放核心给出的事件（发牌、进贡、出牌、炸弹、接风、名次、结算），并把玩家的操作交给核心。
 *
 * 节奏：dispatch → 拿到事件 → 逐个 await 播放 → 用 viewFor 刷新静态画面（sync）→ pump 决定下一步
 * （轮到电脑就"想一会儿"再出；轮到我就打开按钮；一副结束弹结算）。画面不自己算规则：
 * 能不能出、怎么解释一手牌、提示，全部来自 src/core 和 src/ai。
 */
import type Phaser from 'phaser';
import { TableSceneBase } from './shared/TableSceneBase.ts';
import { canPass, hint, interpret, isBomb, type Action, type Card, type DealResult, type GameEvent, type Play, type PlayerView } from '../../variants/guandan/core/index.ts';
import type { Mood } from '../art/index.ts';
import { app } from '../app.ts';
import { audio } from '../common/audio.ts';
import { dur } from '../common/anim.ts';
import { PACE } from '../common/pace.ts';
import { seatName } from '../common/labels.ts';
import { describePlay } from '../guandan/labels.ts';
import { NetSession } from '../guandan/net.ts';
import { closeText, createRoom, type LinkFrame, type NetEvent } from '../common/room-link.ts';
import { errorText } from '../../net/error-text.ts';
import { thinkTime, type Situation } from '../personas.ts';
import { showUnlocked } from '../ui/achievements.ts';
import { ME, Session, type TableSession } from '../guandan/session.ts';
import { randomSeed } from '../common/seed.ts';
import { payout, pointValue, rulesOf } from '../../variants/guandan/stake/index.ts';
import type { StakeView } from '../../variants/guandan/net/stake.ts';
import type { Again, NetView } from '../../variants/guandan/net/rules.ts';
import { flashTitle, stopFlash } from '../common/attention.ts';
import { ROOM_STAKE_TEXT, roomLeaveText, type SignedRow } from '../common/stake-text.ts';
import { DailySession } from '../guandan/daily.ts';
import { StakeSession } from '../guandan/stake.ts';
import type { SettleOutcome } from '../common/stake-api.ts';
import { emptyMatchLog, type Title } from '../../variants/guandan/stake/titles.ts';
import type { Award } from '../../variants/guandan/net/awards.ts';
import { COLOR, TYPE, css, minHit, GAME_HEIGHT } from '../common/theme.ts';
import { goLobby, inGame, inOnlineGame, leaveText } from '../common/lobby.ts';
import { join } from '../online.ts';
import { Button, modal, text, toast, worldW, type Modal } from '../ui/kit.ts';
import { confirm, openRules, openSettings } from '../ui/panels.ts';
import { runTutorial } from '../guandan/tutorial.ts';
import { HandView } from '../table/hand.ts';
import { BUTTON_Y, DISCONNECT_MODAL, FOLLOW_AGAIN_MS, MOOD_MS, PARTNER_AVATAR_CLEAR, PUMP_AFTER_CLOSE_MS, seatAnchors, SETTLE_WAIT_AT, TOAST_Y, TOPBAR } from '../table/layout.ts';
import { SeatView } from '../table/seats.ts';
import type { Nudges } from '../table/nudge.ts';
import type { dealMoment } from '../../variants/guandan/net/fun-moments.ts';
import { mountShortcuts } from '../ui/shortcuts.ts';
import { TrickView } from '../table/trick.ts';
import { lobbyName } from '../common/platform.ts';
import type { ShareKind } from '../guandan/share-card.ts';
import { side, leaveStake, refundAndLeave, stakeLabel, showSettle, showGameOver, addShare, myShareName, feedDeal, logMatch, titleLine, roomAwards, addAwards, showStakeResult, showDailyResult, showNetStakeResult, stakeAgain } from '../guandan/overlays.ts';
import { playEvent, animatePlay, bombFx, flyTribute, showPrevTrick, restoreTrick, talk, dealTalk, mood } from '../guandan/play-fx.ts';
import { buildButtons, buildFun, syncFunShown, funIn, funMoment, tickSoloUrge, mySoloTurn, pulse, buildTopBar, topBarKey, refreshTopBar, buildCounter, refreshButtons } from '../guandan/table-ui.ts';
import { judge, ensureHints, onHint, onPass, onPlay, chooseInterpretation } from '../guandan/actions.ts';

export class TableScene extends TableSceneBase<Action, GameEvent, NetView> {
  ses!: TableSession;
  trick!: TrickView<Play>;
  btnPrev!: Button;
  /** 好友房里我走开了、房间在快速替我出时的"我回来了"（0.6.3） */
  btnBack: Button | undefined;
  /** 旁观时的"坐下"（0.13.0） */
  btnSit: Button | undefined;
  /** 记牌器（或收起后的小签）的中心，冒烟点它 */
  counterAt: { x: number; y: number } | null = null;
  /** 掼蛋自己多的：顺手提示、催促炸弹 */
  nudges: Nudges | null = null;
  /** 读秒嘀嗒：上一声对应的格子（同一格不重复响） */
  private tickSlot = -1;
  /** 好友房：电脑发的、等出牌画面播完再放的（画面座位） */
  private botEmotes: { from: number; id: number; to: number | undefined }[] = [];
  /** 整局称号用：攒到第几副了（场景重开不清，新的一局从第 1 副重新攒） */
  matchLog = emptyMatchLog();
  /** 这一局已经报到好友动态的名场面编号（0.15.0，feed.ts）：一局最多两条、同一种一次 */
  feedPosted: string[] = [];
  /** 这一副播过几次接风（结算页的复盘用；重连后只算之后看到的） */
  dealJiefeng = 0;
  loggedDeal = 0;
  /** 提示轮换的列表；null 表示"建议不要"（高手判断该让，比如队友的牌已经够大） */
  hints: (Play | null)[] = [];
  hintIdx = 0;
  hintStep = -1;
  /** 进贡 / 还贡替新手挑过牌的那一步（table-ui.ts），一步只挑一次 */
  tributeStep = -1;
  /** 上一次"提示"选出的那一手：选中的还是这几张就按它出，带逢人配的牌不再问"当作哪一手" */
  hinted: Play | null = null;
  /** 第一次玩、引导看完后还要指几次「提示」，at 是上次指的那一步（同一步只指一回） */
  hintGuide: { left: number; at: string | null } | null = null;
  inviteBtn: Phaser.GameObjects.Container | null = null;
  /** 顶栏上次重建时的内容（topBarKey）、记牌器那一块和它的纵坐标：每一步只重画记牌器 */
  topKey = '';
  counterBox: Phaser.GameObjects.Container | null = null;
  counterY = 0;
  /** 再来一场：正在去新房间（只去一次）。我开的新房间的码记在会话上（NetSession.againCode），场景重开（重连）也不丢 */
  private following = false;
  lobbyBtn: Button | undefined;
  /** 单机实盘那条的中心（冒烟点它） */
  stakeStrip: { x: number; y: number } | null = null;
  /** 结算弹窗上叠着的"回大厅"确认框（冒烟要找它的按钮） */
  private settleConfirm: Modal | null = null;
  /** 好友房实盘：带入被拒以后的"重新带入"（冒烟点它） */
  rebuyBtn: Button | undefined;
  /** 顶栏右边四个图标（冒烟检查它们在可见区内） */
  topIcons: Phaser.GameObjects.Container[] = [];
  /** 顶栏右边图标点按区域的左边（记牌条避开它） */
  iconsLeft = Infinity;
  /** 实盘：这一场结算的结果（冒烟看） */
  stakeOutcome: SettleOutcome | null = null;
  /** 实盘：最后一副的结算页看过了（之后直接弹这一场的结算） */
  stakeDealSeen = false;
  protected readonly buttonY = BUTTON_Y;
  protected readonly settleWaitAt = SETTLE_WAIT_AT;
  protected readonly dealBackRounds = 6;

  constructor() {
    super('table');
  }

  create(): void {
    this.builds++;
    this.alive = true;
    this.busy = false;
    this.overlay = null;
    this.overlayModal = null;
    // 场景重开（重连的全量快照）时旧的按钮、面板已经随场景销毁
    this.fun = null;
    this.funShown = true;
    this.nudges = null;
    this.botEmotes = [];
    this.following = false;
    this.botTimer = null;
    this.seats = [];
    this.stakeOutcome = null;
    this.stakeDealSeen = false;
    this.netStakeStatus = null;
    this.cameras.main.setOrigin(0, 0).setZoom(app.game ? app.game.scale.gameSize.height / GAME_HEIGHT : 1);
    this.events.once('shutdown', () => {
      this.alive = false;
      this.hand?.destroy();
    });
    this.ses = app.net ?? app.session!;
    // 单机的称号统计跟着存档走：从会话接过来（新开的一局是空的，第 1 副开始时照样清零）
    if (this.ses instanceof Session) {
      this.matchLog = this.ses.log;
      this.loggedDeal = this.ses.loggedDeal;
    }
    if (!this.bindNet()) {
      // 单机：标签页切到后台时正轮到我，标题闪
      const onHide = (): void => {
        if (document.hidden && this.mySoloTurn()) flashTitle();
      };
      document.addEventListener('visibilitychange', onHide);
      this.events.once('shutdown', () => {
        document.removeEventListener('visibilitychange', onHide);
        stopFlash();
      });
    }
    const W = worldW(this);
    this.add.image(0, 0, `table:${W}`).setOrigin(0, 0).setDisplaySize(W, GAME_HEIGHT);

    // 顶栏左边只有"大厅"（右边 126）和好友房的邀请按钮（minHit 宽）；对家头像不压着它们（49 是头像半径加空隙）
    const anchors = seatAnchors(W, this.net ? TOPBAR.lobbyRight + minHit() + PARTNER_AVATAR_CLEAR : 0);
    for (let s = 0; s < 4; s++) this.seats.push(new SeatView(this, s, anchors[s]!));
    this.trick = new TrickView<Play>(this, anchors, describePlay);
    this.hand = new HandView(this);
    this.hand.onChange = () => this.refreshButtons();
    this.buildButtons(W);
    mountShortcuts(this, { play: this.btnPlay, pass: this.btnPass, hint: this.btnHint, sort: this.btnSort, clear: this.btnClear, hand: this.hand, blocked: () => this.overlay !== null });
    this.buildTopBar(W);
    this.buildFun();
    audio.music('table');

    const evs = this.ses.lastEvents;
    this.ses.lastEvents = [];
    if (evs.some((e) => e.type === 'dealStart')) {
      // 新开的局（或跳转）：从事件播放发牌
      this.sync(false, true);
      void this.playEvents(evs);
    } else {
      this.sync(false);
      this.restoreTrick();
      this.pump();
    }
  }

  // ───────────────────────── 搭建 ─────────────────────────

  buildButtons(W: number): void { buildButtons(this, W); }

  buildFun(): void { buildFun(this); }

  syncFunShown(): void { syncFunShown(this); }

  funIn(from: number, id: number, to?: number): void { funIn(this, from, id, to); }

  funMoment(m: ReturnType<typeof dealMoment>): void { funMoment(this, m); }

  tickSoloUrge(): void { tickSoloUrge(this); }

  mySoloTurn(): boolean { return mySoloTurn(this); }

  pulse(b: Button): void { pulse(this, b); }

  buildTopBar(W: number): void { buildTopBar(this, W); }

  stakeLabel(): string { return stakeLabel(this); }

  topBarKey(W: number): string { return topBarKey(this, W); }

  refreshTopBar(): void { refreshTopBar(this); }

  buildCounter(c: Phaser.GameObjects.Container, W: number, v: PlayerView, y0: number): void { buildCounter(this, c, W, v, y0); }

  /** 打到一半：先确认（说清这局会怎样）；打完了就直接走 */
  onLobby(): void {
    if (this.net) {
      // 好友房回大厅不算离开房间：座位留着（掉线宽限过了电脑先替他打），房间码也留着，回来点"回到刚才的房间"接着打
      if (!inOnlineGame()) return goLobby();
      this.openOverlay('menu', confirm(this, leaveText(), `回${lobbyName()}`, () => goLobby(), () => this.closeOverlay()));
      return;
    }
    const st = this.stake;
    if (st && !st.over) return this.leaveStake(st, 'lobby');
    if (!inGame()) return goLobby();
    this.openOverlay('menu', confirm(this, leaveText(), `回${lobbyName()}`, () => goLobby(), () => this.closeOverlay()));
  }

  stakeStripTap(): void {
    const st = this.stake;
    if (!st || st.over || this.overlay !== null || this.isBusy) return;
    this.leaveStake(st, 'lobby');
  }

  /** 结算弹窗里的"回大厅"：和顶栏的一样先确认一次（确认框叠在结算上，点"算了"回到结算） */
  lobbyFromSettle(): void {
    if (this.net ? !inOnlineGame() : !inGame()) return goLobby();
    const m = confirm(this, leaveText(), `回${lobbyName()}`, () => goLobby(), () => (this.settleConfirm = null));
    this.settleConfirm = m;
  }

  onHome(): void {
    const st = this.stake;
    if (st && !st.over) return this.leaveStake(st, 'title');
    const net = this.net;
    // 旁观的人没有座位，直接走
    if (this.watching) return this.leaveRoom();
    if (net && net.room?.status === 'playing') {
      // 好友房：离开就把座位交给电脑（不判输），先问一句
      // 我是最后一个真人：房间就此结束（0.6.0），说清楚
      const others = net.room.seats.some((s, i) => s.kind === 'human' && i !== net.mySeat);
      const ns = this.netStake;
      const me = ns?.seats[0];
      const ph = net.view().phase;
      const mid = ph === 'play' || ph === 'tribute' || ph === 'return';
      const msg: string | readonly SignedRow[] = ns && !ns.over ? (me?.paid === 'yes' ? roomLeaveText(me.points, me.points * pointValue(ns.tier, rulesOf(ns.rules)), payout(ns.tier, me.points, rulesOf(ns.rules)), mid) : ROOM_STAKE_TEXT.leave) : others ? '离开这个房间？你的座位交给电脑接着打' : '离开这个房间？没有别人在了，这一局就结束';
      this.openOverlay('menu', confirm(this, msg, '离开', () => this.leaveRoom(), () => this.closeOverlay(), true));
      return;
    }
    if (net) return this.leaveRoom();
    this.cancelBot();
    this.scene.start('title');
  }

  protected showSettings(): void {
    this.openOverlay('menu', openSettings(this, { onTutorial: () => this.startTutorial(), onClose: () => this.closeOverlay() }));
  }

  protected showRules(): void {
    this.openOverlay('menu', openRules(this, () => this.closeOverlay(), this.ses.view().level));
  }

  /** 分享卡上的链接带不带房间码：匹配桌别人拿着码也进不去（kit 0.20.0 只放排到的人），不带 */
  shareRoom(): string | null {
    return this.net && !this.net.match ? this.net.code : null;
  }

  /**
   * 好友房打完一整场，点"再来一场"（0.6.2）：我来开新房间，再告诉这个房间新房间的码，大家看到了一起过去（followAgain）。
   * 这个房间已经不等了（停够了、关了），就自己先过去，进了再叫朋友
   */
  async again(btn: Button): Promise<void> {
    const net = this.net;
    if (!net || net.againInfo) return;
    btn.setEnabled(false);
    const r = await createRoom(fetch, null);
    if (!this.alive) return;
    if (!('code' in r)) {
      btn.setEnabled(true);
      toast(this, r.error, worldW(this) / 2, TOAST_Y, COLOR.redDark);
      return;
    }
    // 等的这一会儿别人先开了：跟他的（followAgain 已经在路上），我开的这间没人进，房间到点自己关
    if (net.againInfo) return;
    net.againCode = r.code;
    if (net.againInfo === null || net.status !== 'open') this.followAgain({ code: r.code, by: 0 });
    else net.again(r.code);
  }

  /**
   * 有人开好了新房间（画面座位 by 点的）：说一声，离开这个房间，进新房间。开房的人房间直接让他坐 0 号（kit 开房），
   * 所以别人按"和他的相对位置"坐（我在画面 0 号，他在 by 号 → 我坐 (4 - by) % 4）：队友、上下家都和上一场一样
   */
  followAgain(a: Again): void {
    const net = this.net;
    if (!net || this.following) return;
    this.following = true;
    const mine = a.code === net.againCode;
    const prefer = (4 - a.by) % 4;
    const msg = mine ? '新房间开好了，正在过去…' : `${seatName(a.by)} 开了新房间，一起过去…`;
    // 结束页上的那行字换成这句（toast 在弹窗下面一层，会被挡住）
    const tip = this.overlayModal?.body.getData('againTip') as ReturnType<typeof text> | undefined;
    if (tip?.scene) tip.setText(msg).setColor(css(COLOR.redDark));
    else toast(this, msg, worldW(this) / 2, TOAST_Y);
    for (const k of ['again', 'home']) (this.overlayModal?.body.getData(k) as Button | undefined)?.setEnabled(false);
    this.time.delayedCall(mine ? FOLLOW_AGAIN_MS.mine : FOLLOW_AGAIN_MS.others, () => {
      if (!this.alive) return;
      this.cancelBot();
      net.leave();
      app.net = null;
      this.scene.start('title');
      join(a.code, mine, prefer);
    });
  }

  get net(): NetSession | null {
    return this.ses instanceof NetSession ? this.ses : null;
  }

  protected forgetNet(): void {
    app.net = null;
  }

  side(team: number): string { return side(this, team); }

  /** 每日挑战的一局（不存档、不记战绩） */
  get dailyRun(): DailySession | null {
    return this.ses instanceof DailySession ? this.ses : null;
  }

  get stake(): StakeSession | null {
    return this.ses instanceof StakeSession ? this.ses : null;
  }

  /** 好友房实盘：现在显示的这一帧里每个座位的账（娱乐房间为 null） */
  get netStake(): StakeView | null {
    return this.net?.shown?.stake ?? null;
  }

  leaveStake(st: StakeSession, to: 'lobby' | 'title'): void { leaveStake(this, st, to); }

  async refundAndLeave(st: StakeSession, to: 'lobby' | 'title'): Promise<void> { return refundAndLeave(this, st, to); }

  /** 联机：房间来了新消息 */
  protected onNet(kind: NetEvent, detail?: string): void {
    if (!this.alive) return;
    if (kind === 'reset') {
      // 进房、重连的全量快照、换了座位：整桌重画
      this.cancelBot();
      this.scene.restart();
      return;
    }
    for (const sv of this.seats) sv.refreshIdentity();
    const net = this.net!;
    // 再来一场（0.6.2）：有人开好了新房间。我这边结束页已经出来了就一起过去；还在播最后一副的，等结束页出来再走（openGameOver 里）
    const again = net.againInfo;
    if (again && this.overlay === 'gameOver') {
      this.followAgain(again);
      return;
    }
    // 我开好了新房间、这个房间却不等了（停够了、打完关了）：自己先过去
    if (net.againCode && kind === 'error' && (detail === 'cannot_again' || detail === 'room_over')) {
      this.followAgain({ code: net.againCode, by: 0 });
      return;
    }
    if (this.overlay === 'stake') this.refreshNetStake();
    if (kind === 'status' && net.status === 'closed' && this.overlay !== 'gameOver' && this.overlay !== 'stake') {
      // 房间散了、在别处登录被顶掉……：说清楚原因，只能回首页
      this.overlayModal?.close();
      // 不用标题栏：标题字体是子集，"房间断开"这几个字不在里面
      const m = modal(this, DISCONNECT_MODAL.w, DISCONNECT_MODAL.h, undefined, { closeBtn: false, depth: 5200 });
      m.body.add(text(this, 0, DISCONNECT_MODAL.titleY, '房间断开了', { size: TYPE.title, bold: true, color: COLOR.redDark }));
      m.body.add(text(this, 0, DISCONNECT_MODAL.bodyY, closeText(net.closeCode), { size: TYPE.body, bold: true, color: COLOR.ink, wrap: DISCONNECT_MODAL.wrap }));
      m.body.add(new Button(this, 0, DISCONNECT_MODAL.btnY, DISCONNECT_MODAL.btnW, DISCONNECT_MODAL.btnH, '回首页', 'red', () => this.leaveRoom(), 'back'));
      this.openOverlay('menu', m);
      return;
    }
    if (kind === 'emote') {
      // 房间转发的（含我自己发的）："说话人:编号:对象:电脑"，画面座位
      const [vs, id, to, bot] = (detail ?? '').split(':');
      const e = { from: Number(vs), id: Number(id), to: to ? Number(to) : undefined };
      if (!Number.isInteger(e.from) || !Number.isInteger(e.id)) return;
      // 电脑的是房间看了这一步当场发的，比出牌的画面早到：排到手头这几帧播完再放，免得炸弹还没出来电脑就先显摆
      if (bot === '1' && (this.busy || (this.net?.queue.length ?? 0) > 0)) this.botEmotes.push(e);
      else this.funIn(e.from, e.id, e.to);
      return;
    }
    this.noticeNetTurn();
    if (kind === 'error') {
      this.lastError = detail ?? 'illegal_move';
      audio.sfx('error');
      toast(this, errorText(detail ?? ''), worldW(this) / 2, TOAST_Y, COLOR.redDark);
    }
    // 结算页开着时，别人点"继续"只是同一个局面（step 不变）：收下来刷新"还在等谁"，不然会堵住后面开下一副的那一帧
    if (this.overlay === 'settle') {
      while (net.queue[0] && net.shown && net.queue[0].nv.view.step === net.shown.view.step) net.take();
      this.refreshSettleWait();
    }
    // 人齐了、房间开了下一副：结算页自己收起来，接着播
    const next = this.net?.queue[0];
    if (this.overlay === 'settle' && next && next.nv.view.phase !== 'dealEnd') {
      this.overlayModal?.close();
      this.closeOverlay();
    }
    this.refreshButtons();
    this.pump();
  }

  protected waitingOthers(waiting: number[]): number[] {
    return waiting.filter((s) => s !== 0);
  }

  protected override afterClocks(t: { seat: number; deadline: number | null } | null, now: number): void {
    // 电脑的互动：画面追上了再放（每 250 毫秒看一次，一次放一条）
    if (this.botEmotes.length && !this.busy && (this.net?.queue.length ?? 0) === 0) {
      const e = this.botEmotes.shift()!;
      this.funIn(e.from, e.id, e.to);
    }
    this.nudges?.tickTurn(this.overlay === null && t ? t.seat : null, t ? `${t.seat}:${t.deadline}` : '');
    // 我的最后 5 秒：每秒"嗒"一声，最后 2 秒每半秒一声、升调
    const left = t && this.isMe(t.seat) && t.deadline !== null ? t.deadline - now : -1;
    if (left > 0 && left <= 5000) {
      const slot = left > 2000 ? Math.ceil(left / 1000) : 10 + Math.ceil(left / 500);
      if (slot !== this.tickSlot) audio.sfx('tick', { pitch: left > 2000 ? 0 : 5 });
      this.tickSlot = slot;
    } else this.tickSlot = -1;
  }

  protected override holdNetFrame(): boolean {
    return this.overlay !== null;
  }

  protected frameThinkMs(f: LinkFrame<NetView>, prev: NetView | null): number {
    // 电脑连着出：和单机一样按出法给思考时间（房间给的间隔只说明这一帧是电脑出的；播得比房间慢一点，到我出牌时队列总会播完）
    const lead = !prev?.view.trick.last;
    const e = f.nv.events.find((x) => x.type === 'play' || x.type === 'pass');
    return !e ? f.delay : this.botThink(e.seat, e.type === 'pass' ? 'pass' : isBomb(e.play) ? 'bomb' : 'play', lead);
  }

  protected override onOverlayOpen(): void {
    // 道具、表情在 DOM 图层上，会盖住 Phaser 画的弹窗：弹窗开着时藏起来
    this.fun?.closeAll();
    this.nudges?.clearTip();
    this.syncFunShown();
  }

  closeOverlay(): void {
    this.overlay = null;
    this.overlayModal = null;
    this.time.delayedCall(PUMP_AFTER_CLOSE_MS, () => this.pump());
  }

  // ───────────────────────── 静态刷新 ─────────────────────────

  /** 按当前状态刷新所有静态元素。animateHand=false 时手牌直接就位。 */
  protected sync(animateHand = true, beforeDeal = false): void {
    if (!this.alive) return;
    const v = this.ses.view();
    this.trick.setLevel(v.level);
    if (!beforeDeal) this.hand.setHand(v.hand, v.level, { animate: animateHand });
    for (let s = 0; s < 4; s++) {
      const seat = this.seats[s]!;
      seat.setCount(beforeDeal ? 27 : v.counts[s]!, v.finished.includes(s));
      seat.setTurn(v.phase === 'play' && v.turn === s);
      const place = v.finished.indexOf(s);
      if (place < 0) void seat.setPlace(null, false);
    }
    this.refreshTopBar();
    this.refreshButtons();
  }

  restoreTrick(): void { restoreTrick(this); }

  myTurn(v: PlayerView): boolean {
    return !this.busy && this.overlay === null && !this.ses.autoplay && v.toAct.includes(ME) && this.ses.canAct();
  }

  refreshButtons(): void { refreshButtons(this); }

  judge(v: PlayerView, sel: Card[]): { ok: boolean; plays: Play[]; reason: string; label: string } { return judge(this, v, sel); }

  ensureHints(v: PlayerView): (Play | null)[] { return ensureHints(this, v); }

  // ───────────────────────── 玩家操作 ─────────────────────────

  onHint(): void { onHint(this); }

  onPass(): void { onPass(this); }

  onPlay(): void { onPlay(this); }

  chooseInterpretation(sel: Card[], plays: Play[]): void { chooseInterpretation(this, sel, plays); }

  /** 调试桥：按玩家同样的路径推进（带动画）。 */
  debugDispatch(a: Action): string | null {
    if (this.busy) return '正在播放动画';
    this.cancelBot();
    const r = this.ses.apply(a);
    if (r.error) return r.error;
    void this.playEvents(r.events);
    return null;
  }

  // ───────────────────────── 电脑 ─────────────────────────

  /** 决定下一步：电脑行动、等玩家、或弹结算。 */
  pump(): void {
    if (!this.alive || this.busy || this.botTimer) return;
    if (this.pumpNet()) return;
    if (this.overlay !== null) return;
    const v = this.ses.view();
    const st = this.stake;
    if (st?.over && (v.phase !== 'dealEnd' || this.stakeDealSeen || st.stake.settle!.deals !== v.lastDeal?.dealNo)) {
      this.showStakeResult();
      return;
    }
    const dl = this.dailyRun;
    if (dl?.over && (v.phase !== 'dealEnd' || this.stakeDealSeen || dl.match.deals.length !== v.lastDeal?.dealNo)) {
      this.showDailyResult();
      return;
    }
    // 好友房实盘一场打完：先看最后一副的结算页，点"结算"再看这一场
    if (this.netStake?.over && (v.phase !== 'dealEnd' || this.stakeDealSeen)) {
      this.showNetStakeResult();
      return;
    }
    if (v.phase === 'dealEnd') {
      // 好友房里点了"下一副"、房间还没回：别再弹一次结算
      if (this.net?.pending) return;
      this.showSettle(v.lastDeal!);
      return;
    }
    if (v.phase === 'gameOver') {
      this.showGameOver();
      return;
    }
    const bots = this.ses.online && !this.ses.canAct() ? [] : v.toAct.filter((s) => this.ses.isBot(s));
    this.refreshButtons();
    if (bots.length === 0) return;
    const seat = bots[0]!;
    // 先想好出什么（电脑的决定只看牌局和种子，早算晚算一样），再按出法给思考时间
    const planned = this.ses.botAction(seat);
    if (seat !== ME) this.seats[seat]!.setThinking(true);
    this.botSeat = seat;
    const kind = planned?.type !== 'play' ? 'pass' : isBomb(planned.as ?? interpret(planned.cards, v.level, v.options)[0] ?? { type: 'single' }) ? 'bomb' : 'play';
    this.botTimer = this.time.delayedCall(dur(v.phase === 'play' ? this.botThink(seat, kind, !v.trick.last) : PACE.ddz.bidThink), () => {
      this.botTimer = null;
      this.botSeat = -1;
      this.seats[seat]!.setThinking(false);
      if (!this.alive || this.busy || this.overlay !== null) return;
      let a = planned;
      if (!a) return;
      let r = this.ses.apply(a);
      if (r.sent) return;
      if (r.error) {
        // 电脑出错（理论上不会）：退回到"不要"或第一种合法出法，保证不卡住
        console.warn(`电脑 ${seat} 动作非法：${r.error}`);
        const view = this.ses.view(seat);
        a = canPass(view) ? { type: 'pass', seat } : { type: 'play', seat, cards: hint(view)[0]!.cards };
        r = this.ses.apply(a);
        if (r.error) return;
      }
      void this.playEvents(r.events);
    });
  }

  // ───────────────────────── 事件播放 ─────────────────────────

  /**
   * 电脑的思考时间（毫秒，再经 dur 换算）：按性格、状态和上头程度（personas.ts 的 thinkTime）；对手快走完时多想一会儿。
   * 太快了看不清谁出了什么，也没有"在博弈"的感觉（德州试玩时的反馈，掼蛋按同一标准自查）。
   */
  private botThink(seat: number, kind: 'pass' | 'play' | 'bomb', lead: boolean): number {
    const style = this.ses.botStyle(seat);
    const v = this.ses.view();
    const tense = [1, 3].some((d) => {
      const opp = (seat + d) % 4;
      return !v.finished.includes(opp) && v.counts[opp]! <= 4;
    });
    // 连着几家"不要"：数出牌记录末尾有几个不要（领出的头一手不算）
    let passes = 0;
    for (let i = v.history.length - 1; i >= 0 && !v.history[i]!.play; i--) passes++;
    return thinkTime({ kind, lead, tense, passes, ...(style ?? {}) });
  }

  talk(seat: number, sit: Situation, force = false): void { talk(this, seat, sit, force); }

  dealTalk(dealNo: number): void { dealTalk(this, dealNo); }

  mood(seat: number, m: Mood, ms = MOOD_MS): void { mood(this, seat, m, ms); }

  protected async playEvent(e: GameEvent): Promise<void> { return playEvent(this, e); }

  /** 新解锁的成就：弹一条不挡操作的横幅（只有单机会话有；好友房、匹配不计成就） */
  /** low：结算弹窗马上要开，横幅直接落到下沿，不压弹窗的标题 */
  showUnlocked(low?: boolean): void {
    if (this.ses instanceof Session) showUnlocked(this, this.ses.takeUnlocked(), low);
  }

  async animatePlay(seat: number, play: Play, left: number): Promise<void> { return animatePlay(this, seat, play, left); }

  async bombFx(seat: number, play: Play): Promise<void> { return bombFx(this, seat, play); }

  /**
   * 发牌时另外三家也"收到牌"（art-v3）：从桌心往三家头像各飞 6 张牌背，和我的手牌同一个节奏，到了就消失。
   * 纯画面，不等它（我的手牌发完就往下走）；关了动画不飞
   */
  protected dealBackAngle(seat: number): number | null {
    return this.isMe(seat) ? null : seat === 1 ? 20 : seat === 3 ? -20 : 0;
  }

  async flyTribute(from: number, to: number, card: Card | null, label: string): Promise<void> { return flyTribute(this, from, to, card, label); }

  showPrevTrick(): void { showPrevTrick(this); }

  // ───────────────────────── 结算 / 胜负 ─────────────────────────

  showSettle(r: DealResult): void { showSettle(this, r); }

  showGameOver(): void { showGameOver(this); }

  addShare(b: Phaser.GameObjects.Container, x: number, y: number, k: ShareKind, awards: readonly Award[] | null = null, labelW = 0): void { addShare(this, b, x, y, k, awards, labelW); }

  myShareName(): string | null { return myShareName(this); }

  feedDeal(r: DealResult): void { feedDeal(this, r); }

  logMatch(): void { logMatch(this); }

  titleLine(t: Title, why: boolean): string { return titleLine(this, t, why); }

  roomAwards(gameWinner: number): Award[] | null { return roomAwards(this, gameWinner); }

  addAwards(b: Phaser.GameObjects.Container, y: number, awards: readonly Award[]): void { addAwards(this, b, y, awards); }

  /** 同难度、同规则（含短局的终点）再开一局；设置里改过的难度不影响这一局的"再来" */
  newGame(seed = randomSeed()): void {
    const ses = this.ses;
    app.session = ses instanceof Session ? Session.fresh(seed, { ...ses.view().options }, ses.difficulty) : Session.fresh(seed);
    this.scene.restart();
  }

  showStakeResult(toLobby = false): void { showStakeResult(this, toLobby); }

  showDailyResult(): void { showDailyResult(this); }

  showNetStakeResult(): void { showNetStakeResult(this); }

  async stakeAgain(tier: StakeSession['tier'], status: Phaser.GameObjects.Text, btn: Button): Promise<void> { return stakeAgain(this, tier, status, btn); }

  // ───────────────────────── 引导 ─────────────────────────

  startTutorial(): void {
    void this.startTutorialAsync();
  }

  async startTutorialAsync(): Promise<void> {
    this.cancelBot();
    this.overlay = 'tutorial';
    this.refreshButtons();
    // 状态行（"等 X 出牌"）会和引导第 3 步按钮上方的说明叠在一起；引导完 pump 会重新写
    this.setStatus('');
    await runTutorial(this, { play: this.btnPlay, hint: this.btnHint, pass: this.btnPass, sort: this.btnSort }, this.ses.view().level);
    this.overlay = null;
    if (!this.busy) this.pump();
  }

  // ───────────────────────── 调试桥 ─────────────────────────

  /** 主要控件的世界坐标（冒烟用真实鼠标点）。 */
  controls(): Record<string, { x: number; y: number; enabled: boolean; visible: boolean }> {
    const out: Record<string, { x: number; y: number; enabled: boolean; visible: boolean }> = {};
    const put = (name: string, b: Button | undefined): void => {
      if (!b) return;
      out[name] = { x: b.x, y: b.y, enabled: b.enabled, visible: b.visible };
    };
    put('play', this.btnPlay);
    put('pass', this.btnPass);
    put('hint', this.btnHint);
    put('sort', this.btnSort);
    put('clear', this.btnClear);
    put('prev', this.btnPrev);
    put('imback', this.btnBack);
    put('sit', this.btnSit);
    if (this.counterAt) out.counter = { ...this.counterAt, enabled: true, visible: true };
    this.addFunControls(out);
    this.nudges?.controls(out);
    if (this.inviteBtn) out.invite = { x: this.inviteBtn.x, y: this.inviteBtn.y, enabled: true, visible: true };
    if (this.cloudBtn?.visible) out.cloud = { x: this.cloudBtn.x, y: this.cloudBtn.y, enabled: true, visible: true };
    put('lobby', this.lobbyBtn);
    if (this.stakeStrip) out.stakeStrip = { ...this.stakeStrip, enabled: true, visible: true };
    put('rebuy', this.rebuyBtn);
    this.topIcons.forEach((b, i) => (out[`top${i}`] = { x: b.x, y: b.y, enabled: true, visible: b.visible }));
    const top = this.settleConfirm ?? this.overlayModal;
    for (const k of ['ok', 'cancel']) {
      const b = top?.body.getData(k) as Button | undefined;
      if (b) out[k] = { x: b.x + top!.body.x, y: b.y + top!.body.y, enabled: true, visible: true };
    }
    for (const k of ['again', 'home', 'settleNow', 'share']) {
      const b = this.overlayModal?.body.getData(k) as Button | undefined;
      if (b?.scene) out[k] = { x: b.x + this.overlayModal!.body.x, y: b.y + this.overlayModal!.body.y, enabled: b.enabled ?? true, visible: true };
    }
    const next = this.overlayModal?.body.getData('next') as Button | undefined;
    if (next && this.overlay === 'settle') out.next = { x: next.x + this.overlayModal!.body.x, y: next.y + this.overlayModal!.body.y, enabled: true, visible: true };
    const lb = this.overlayModal?.body.getData('lobby') as Button | undefined;
    if (lb && this.overlay === 'settle') out.settleLobby = { x: lb.x + this.overlayModal!.body.x, y: lb.y + this.overlayModal!.body.y, enabled: true, visible: true };
    return out;
  }

  cardPoint(c: Card): { x: number; y: number } | null {
    return this.hand.tapPoint(c);
  }

  handSelected(): Card[] {
    return this.hand.selected();
  }

  debugHint(): void {
    this.onHint();
  }

  /** 调试：打开设置 / 规则 / 战绩之类的弹窗（截图用）。 */
  debugOpen(kind: 'settings' | 'rules'): void {
    if (kind === 'settings') this.openOverlay('menu', openSettings(this, { onClose: () => this.closeOverlay() }));
    else this.openOverlay('menu', openRules(this, () => this.closeOverlay(), this.ses.view().level));
  }

  debugCloseOverlay(): void {
    this.overlayModal?.close();
    this.overlay = null;
    this.overlayModal = null;
    this.pump();
  }

}
