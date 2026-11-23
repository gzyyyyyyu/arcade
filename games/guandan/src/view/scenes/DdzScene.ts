/**
 * 斗地主牌桌（牌馆 0.28.0，docs/doudizhu.md 第 4 节）：单机，我 + 稳哥（下家，右）+ 幺妹儿（上家，左）。
 * 画面部件和掼蛋共用（手牌 HandView、出牌区 TrickView、座位 SeatView、按钮、弹窗、特效、kit 的牌桌互动），按斗地主的理牌、牌型名注入；
 * 这里只管斗地主的流程：叫分 → 地主拿底牌 → 出牌 → 每副结算 → 一局打完。推进只走 DdzSession.apply（规则核心 dispatchDdz），画面不算规则。
 */
import type Phaser from 'phaser';
import { TableSceneBase } from './shared/TableSceneBase.ts';
import { chooseDdz, type DdzAction, interpretDdz, isBombish, hintDdz, sortDdz, type DdzEvent, type DdzPlay, type DdzResult, type DdzView } from '../../variants/doudizhu/index.ts';
import { app } from '../app.ts';
import { audio } from '../common/audio.ts';
import { PACE } from '../common/pace.ts';
import { showUnlocked } from '../ui/achievements.ts';
import { DDZ_ME, DdzSession, type DdzTableSession } from '../doudizhu/session.ts';
import { runDdzBotJob, type DdzBotJob } from '../doudizhu/bot-job.ts';
import { BotRunner } from '../common/bot-runner.ts';
import { DdzNetSession } from '../doudizhu/net.ts';
import type { DdzNetView } from '../../variants/doudizhu/net/rules.ts';
import { DailyPuzzleSession, PUZZLE_LOST_HINT, PuzzleSession, startDailyPuzzle, startPuzzle } from '../doudizhu/puzzle.ts';
import type { DdzPuzzle } from '../../variants/doudizhu/puzzles/puzzles.ts';
import { DdzStakeSession } from '../doudizhu/stake.ts';
import { closeText, type LinkFrame, type NetEvent } from '../common/room-link.ts';
import { errorText } from '../../net/error-text.ts';
import { stopFlash } from '../common/attention.ts';
import { ROOM_STAKE_TEXT, roomLeaveText, type SignedRow } from '../common/stake-text.ts';
import { payout as ddzPayout, pointValue as ddzPointValue } from '../../variants/doudizhu/stake/index.ts';
import { tableRules, type DdzStakeView } from '../../variants/doudizhu/net/stake.ts';
import { DDZ_ORDER, ddzDescribe, ddzPlayDetail, ddzPlayLabel } from '../doudizhu/view.ts';
import { DDZ_SEAT_PERSON, setTablePersons } from '../common/labels.ts';
import { goLobby, inOnlineGame, leaveText } from '../common/lobby.ts';
import { DAILY_LEAVE } from '../common/daily.ts';
import { thinkTime, type Situation } from '../personas.ts';
import { lobbyName } from '../common/platform.ts';
import { ddzTutorialDone } from '../store.ts';
import { runDdzTutorial } from '../doudizhu/tutorial.ts';
import { COLOR, TYPE, GAME_HEIGHT } from '../common/theme.ts';
import { HandView } from '../table/hand.ts';
import { DDZ_BUTTONS, DDZ_CLOSED_MODAL, DDZ_SETTLE_WAIT, seatAnchors3 } from '../table/layout.ts';
import { SeatView } from '../table/seats.ts';
import { TrickView } from '../table/trick.ts';
import { mountShortcuts } from '../ui/shortcuts.ts';
import { Button, modal, text, worldW } from '../ui/kit.ts';
import { toast } from '../ui/bubble.ts';
import { confirm, openDdzRules, openSettings } from '../ui/panels.ts';
import { openPuzzlePicker } from '../ui/puzzles.ts';
import { showPuzzleResult, showDailyWin, showSettle, showGameOver, showNetStakeResult, showStakeResult, stakeAgain } from '../doudizhu/overlays.ts';
import { playEvent, animatePlay, bombFx, springSeal, talk, placeHat, drawOpenHands } from '../doudizhu/play-fx.ts';
import { BUTTON_Y, buildButtons, buildTopBar, topBarKey, refreshTopBar, dailyTopText, tickDailyClock, shownMult, buildTopMid, buildPuzzle, buildNetStake, buildCounter, funBox, buildFun, funIn, refreshButtons } from '../doudizhu/table-ui.ts';

/** 单机电脑在后台线程里算（高手的深残局一手要几百毫秒，放主线程画面会冻） */
const ddzBotRunner = new BotRunner<DdzBotJob, DdzAction>(() => new Worker(new URL('../doudizhu/bot-worker.ts', import.meta.url), { type: 'module' }), runDdzBotJob);

export class DdzScene extends TableSceneBase<DdzAction, DdzEvent, DdzNetView> {
  ses!: DdzTableSession;
  btnBack: Button | null = null;
  btnSit: Button | null = null;
  trick!: TrickView<DdzPlay>;
  bidBtns: Button[] = [];
  showBtns: Button[] = [];
  /** 好友房实盘条（连同"重新带入"）的左沿，记牌器让它；没有实盘条是 null */
  stakeLeft: number | null = null;
  /** 记牌器的下沿（没画是 0），弹幕区从它下面起 */
  counterBottom = 0;
  /** 地主帽（地主定下以后挂在地主头像上） */
  hat: Phaser.GameObjects.Container | null = null;
  /** 残局：两家农民摊开的手牌（座位 1、2），和关卡提示横幅 */
  openHands: (Phaser.GameObjects.Container | null)[] = [null, null, null];
  /** 每日残局顶栏的用时（每秒刷新） */
  dailyClock: Phaser.GameObjects.Text | null = null;
  dailyTimer: Phaser.Time.TimerEvent | null = null;
  /** 顶栏上次重建时的内容（topBarKey）和记牌器那一块：每一步只重画记牌器 */
  topKey = '';
  counterBox: Phaser.GameObjects.Container | null = null;
  hints: DdzPlay[] = [];
  hintIdx = 0;
  hintStep = -1;
  /** 最后一副的结算页看过了（一局打完先看这一副，再看总分） */
  lastSettleSeen = false;
  /** 冒烟点按用：控件名 → 世界坐标 */
  private ctl = new Map<string, { x: number; y: number; obj: Phaser.GameObjects.Container }>();

  protected readonly buttonY = BUTTON_Y;
  protected readonly settleWaitAt = DDZ_SETTLE_WAIT;
  protected readonly dealBackRounds = 5;

  constructor() {
    super('ddz');
  }

  get net(): DdzNetSession | null {
    return this.ses instanceof DdzNetSession ? this.ses : null;
  }

  protected forgetNet(): void {
    app.ddzNet = null;
  }

  /** 残局闯关的会话（明牌残局；不是就是 null） */
  get puzzle(): PuzzleSession | null {
    return this.ses instanceof PuzzleSession ? this.ses : null;
  }

  get solo(): DdzSession | null {
    return this.ses instanceof DdzSession ? this.ses : null;
  }

  /** 好友房实盘：现在显示的这一帧里每个座位的账（画面座位；娱乐房间为 null） */
  get netStake(): DdzStakeView | null {
    return this.net?.shown?.stake ?? null;
  }

  /** 离开房间前的确认文字：实盘房间说清楚按现在的分结回多少（打到一半的这一副打完再结） */
  private leaveMsg(): string | readonly SignedRow[] {
    const net = this.net!;
    const ns = this.netStake;
    const me = ns?.seats[0];
    if (ns && !ns.over) {
      if (me?.paid !== 'yes') return ROOM_STAKE_TEXT.leave;
      const ph = net.view().phase;
      const r = tableRules(ns);
      return roomLeaveText(me.points, me.points * ddzPointValue(ns.tier, r), ddzPayout(ns.tier, me.points, r), ph === 'bid' || ph === 'play');
    }
    const others = net.room?.seats.some((x, i) => x.kind === 'human' && i !== net.mySeat);
    return others ? '离开这个房间？你的座位交给电脑接着打' : '离开这个房间？没有别人在了，这一局就结束';
  }

  create(): void {
    this.builds++;
    this.netStakeStatus = null;
    this.alive = true;
    this.busy = false;
    this.overlay = null;
    this.overlayModal = null;
    this.fun = null;
    this.funShown = true;
    this.botTimer = null;
    this.botSeat = -1;
    this.seats = [];
    this.bidBtns = [];
    this.hat = null;
    this.openHands = [null, null, null];
    this.dailyClock = null;
    this.dailyTimer = null;
    this.ctl.clear();
    this.lastSettleSeen = false;
    // 座位上的人物换成斗地主的两个（labels.ts），离开时换回掼蛋的
    setTablePersons(DDZ_SEAT_PERSON);
    this.cameras.main.setOrigin(0, 0).setZoom(app.game ? app.game.scale.gameSize.height / GAME_HEIGHT : 1);
    this.events.once('shutdown', () => {
      this.alive = false;
      this.cancelBot();
      this.hand?.destroy();
      stopFlash();
      const n = this.net;
      if (n) n.chatSink = n.chatErrorSink = null;
      this.fun?.destroy();
      this.fun = null;
      setTablePersons(null);
    });
    this.ses = app.ddzNet ?? app.ddz!;
    this.btnBack = this.btnSit = this.settleWait = null;
    this.myNetTurn = false;
    this.bindNet();
    const W = worldW(this);
    this.add.image(0, 0, `table:${W}`).setOrigin(0, 0).setDisplaySize(W, GAME_HEIGHT);
    const anchors = seatAnchors3(W);
    for (let s = 0; s < 3; s++) this.seats.push(new SeatView(this, s, anchors[s]!));
    this.trick = new TrickView<DdzPlay>(this, anchors, ddzDescribe);
    this.hand = new HandView(this, DDZ_ORDER);
    this.hand.onChange = () => this.refreshButtons();
    this.buildButtons(W);
    mountShortcuts(this, { play: this.btnPlay, pass: this.btnPass, hint: this.btnHint, sort: this.btnSort, clear: this.btnClear, hand: this.hand, blocked: () => this.overlay !== null });
    this.buildTopBar(W);
    // 残局不开牌桌互动（和每日挑战一样不嘲讽），农民的牌摊开、顶上挂关卡提示
    if (this.puzzle) this.buildPuzzle(W);
    else this.buildFun(W);
    audio.music('table');

    const evs = this.ses.lastEvents;
    this.ses.lastEvents = [];
    if (evs.some((e) => e.type === 'deal')) {
      this.sync(false, true);
      void this.playEvents(evs);
    } else {
      this.sync(false);
      this.restoreTable();
      this.pump();
    }
  }

  // ───────────────────────── 搭建 ─────────────────────────

  reg(name: string, obj: Phaser.GameObjects.Container): void {
    this.ctl.set(name, { x: obj.x, y: obj.y, obj });
  }

  buildButtons(W: number): void { buildButtons(this, W); }

  buildTopBar(W: number): void { buildTopBar(this, W); }

  topBarKey(W: number): string { return topBarKey(this, W); }

  refreshTopBar(): void { refreshTopBar(this); }

  dailyTopText(pz: DailyPuzzleSession): string { return dailyTopText(this, pz); }

  tickDailyClock(pz: DailyPuzzleSession): void { tickDailyClock(this, pz); }

  shownMult(v: ReturnType<DdzTableSession['view']>): number { return shownMult(this, v); }

  buildTopMid(c: Phaser.GameObjects.Container, v: ReturnType<DdzTableSession['view']>, mx: number): void { buildTopMid(this, c, v, mx); }

  // ───────────────────────── 残局 ─────────────────────────

  buildPuzzle(W: number): void { buildPuzzle(this, W); }

  drawOpenHands(): void { drawOpenHands(this); }

  restartPuzzle(p: DdzPuzzle): void {
    this.cancelBot();
    const pz = this.puzzle;
    // 每日残局的重来：计时不清零、重来次数加一
    if (pz instanceof DailyPuzzleSession && pz.puzzle === p) startDailyPuzzle(pz.restart());
    else startPuzzle(p);
    this.scene.restart();
  }

  /** 选了今日残局：全新的一场（打完后再来一次也是重新计） */
  startDailyHere(): void {
    this.overlay = null;
    this.cancelBot();
    startDailyPuzzle();
    this.scene.restart();
  }

  showPuzzleResult(r: DdzResult): void { showPuzzleResult(this, r); }

  showDailyWin(pz: DailyPuzzleSession): void { showDailyWin(this, pz); }

  startPuzzleHere(p: DdzPuzzle): void {
    this.overlay = null;
    this.restartPuzzle(p);
  }

  /** 选关弹窗：选了就开那一关；直接关掉回到结果页 */
  openPicker(): void {
    const m = openPuzzlePicker(this, { onPick: (p) => this.startPuzzleHere(p), onDaily: () => this.startDailyHere(), onClose: () => this.closeOverlay() });
    this.openOverlay('menu', m);
    for (const [k, v] of Object.entries((m.body.data?.getAll() ?? {}) as Record<string, unknown>)) {
      if (k.startsWith('btn:') && v instanceof Button) this.reg(k.slice(4), v);
    }
  }

  buildNetStake(c: Phaser.GameObjects.Container, W: number): void { buildNetStake(this, c, W); }

  buildCounter(c: Phaser.GameObjects.Container, W: number, v: ReturnType<DdzTableSession['view']>): void { buildCounter(this, c, W, v); }

  funBox(): { left: number; bw: number; bh: number } { return funBox(this); }

  buildFun(W: number): void { buildFun(this, W); }

  funIn(from: number, id: number, to?: number): void { funIn(this, from, id, to); }

  // ───────────────────────── 顶栏动作 ─────────────────────────

  private inGame(): boolean {
    return this.ses.view().phase !== 'gameOver';
  }

  /** 打到一半先确认一次：单机这局存着，回来点"继续"接着打；好友房座位留着（回大厅不算离开房间） */
  onLobby(): void {
    if (this.puzzle || (this.net ? !inOnlineGame() : !this.inGame())) return goLobby();
    this.openOverlay('menu', confirm(this, this.net ? (this.netStake ? this.leaveMsg() : leaveText()) : `回${lobbyName()}？这局会存着，回来接着打`, `回${lobbyName()}`, () => goLobby(), () => this.closeOverlay()));
  }

  onHome(): void {
    const net = this.net;
    if (net) {
      // 旁观的人没有座位，直接走；打到一半离开要先问一句
      if (!this.watching && net.room?.status === 'playing') {
        const msg = this.leaveMsg();
        // 从结算页点的：确认框叠在结算上，点"算了"要回到结算页，不能让 pump 再弹一份
        const prev = this.overlay === 'settle' ? this.overlayModal : null;
        this.openOverlay('menu', confirm(this, msg, '离开', () => this.leaveRoom(), () => {
          if (!prev) return this.closeOverlay();
          this.overlay = 'settle';
          this.overlayModal = prev;
          this.refreshSettleWait();
        }, true));
        return;
      }
      return this.leaveRoom();
    }
    if (this.ses.daily && this.inGame()) {
      this.openOverlay('menu', confirm(this, DAILY_LEAVE, '回首页', () => this.home(), () => this.closeOverlay()));
      return;
    }
    this.home();
  }

  private home(): void {
    this.cancelBot();
    this.scene.start('title');
  }

  protected showRules(): void {
    this.openOverlay('menu', openDdzRules(this, () => this.closeOverlay()));
  }

  protected showSettings(): void {
    // "重看引导"：先清掉看过的记号（panels 里做），这一副里马上演一遍，和掼蛋一样
    this.openOverlay('menu', openSettings(this, {
      onTutorial: () => {
        this.cancelBot();
        void this.startTutorial().then(() => {
          if (!this.busy) this.pump();
        });
      },
      onClose: () => this.closeOverlay(),
    }));
  }

  /** 第一次玩单机娱乐出新手引导：好友房、实盘、每日、托管、URL 调试开局都不弹 */
  wantsTutorial(): boolean {
    return !ddzTutorialDone() && !this.net && !this.ses.autoplay && !this.ses.daily && !this.puzzle && !(this.ses instanceof DdzStakeSession) && app.params?.seed === null;
  }

  async startTutorial(): Promise<void> {
    this.overlay = 'tutorial';
    this.refreshButtons();
    await runDdzTutorial(this);
    this.overlay = null;
  }

  protected override actAllowed(a: DdzAction): boolean {
    return a.type === 'next' || this.myTurn(this.ses.view());
  }

  protected waitingOthers(waiting: number[]): number[] {
    return waiting.filter((x) => x !== 0 || this.watching);
  }

  protected dealBackAngle(seat: number): number | null {
    return seat === DDZ_ME ? null : seat === 1 ? 20 : -20;
  }

  protected frameThinkMs(f: LinkFrame<DdzNetView>): number {
    // 电脑连着出：和单机一样给点思考时间（房间给的间隔只说明这一帧是电脑出的）
    const e = f.nv.events.find((x) => x.type === 'play' || x.type === 'pass' || x.type === 'bid');
    const v = f.nv.view;
    const kind = e?.type === 'play' ? (isBombish(e.play) ? 'bomb' : 'play') : 'pass';
    return !e || e.type === 'bid' ? PACE.ddz.bidThink : thinkTime({ kind, lead: v.trick.length <= 1, tense: v.counts.some((n) => n <= 2) });
  }

  closeOverlay(): void {
    this.overlay = null;
    this.overlayModal = null;
    this.refreshButtons();
    this.pump();
  }

  // ───────────────────────── 状态 → 画面 ─────────────────────────

  protected sync(animateHand = true, beforeDeal = false): void {
    if (!this.alive) return;
    const v = this.ses.view();
    if (!beforeDeal) this.hand.setHand(v.hand, 0, { animate: animateHand });
    for (let s = 0; s < 3; s++) {
      const sv = this.seats[s]!;
      sv.setCount(beforeDeal ? 17 : v.counts[s]!, false);
      sv.setTurn((v.phase === 'play' || v.phase === 'bid' || v.phase === 'show') && v.turn === s);
    }
    this.placeHat(v.landlord);
    this.refreshTopBar();
    this.drawOpenHands();
    this.refreshButtons();
  }

  /** 刷新、读档后：把这一轮桌上的出牌摆回去 */
  private restoreTable(): void {
    const v = this.ses.view();
    if (v.phase !== 'play') return;
    for (const t of v.trick) this.trick.restore(t.seat, t.play);
  }

  placeHat(seat: number): void { placeHat(this, seat); }

  myTurn(v: DdzView): boolean {
    const net = this.net;
    // 联机：旁观的人不能出手；上一手发出去还没回音、连接断了时也锁着
    if (net && (net.mySeat === null || net.pending !== null || net.status !== 'open')) return false;
    return !this.busy && this.overlay === null && !this.ses.autoplay && v.turn === DDZ_ME && (v.phase === 'bid' || v.phase === 'show' || v.phase === 'play');
  }

  refreshButtons(): void { refreshButtons(this); }

  /** 选中的牌能不能出：只调规则核心的 interpretDdz / chooseDdz */
  judge(v: DdzView, sel: number[]): { ok: boolean; play: DdzPlay | null; reason: string; label: string } {
    if (sel.length === 0) return { ok: false, play: null, reason: '', label: '' };
    const all = interpretDdz(sel);
    if (all.length === 0) return { ok: false, play: null, reason: '不成牌型', label: '' };
    const lead = !v.target || v.target.seat === DDZ_ME;
    const target = lead ? null : v.target!.play;
    const p = chooseDdz(all, target);
    if (!p) {
      const sameType = all.some((x) => x.type === target!.type && x.cards.length === target!.cards.length);
      return { ok: false, play: null, reason: sameType || isBombish(target!) ? '压不过' : `要出${ddzPlayLabel(target!)}`, label: '' };
    }
    return { ok: true, play: p, reason: '', label: ddzPlayDetail(p) };
  }

  ensureHints(v: DdzView): DdzPlay[] {
    if (this.hintStep === v.step) return this.hints;
    this.hintStep = v.step;
    this.hints = hintDdz(v);
    this.hintIdx = 0;
    return this.hints;
  }

  // ───────────────────────── 玩家操作 ─────────────────────────

  onHint(): void {
    const v = this.ses.view();
    if (!this.myTurn(v) || v.phase !== 'play') return;
    const pz = this.puzzle;
    if (pz) {
      // 残局的提示是求解器给的必胜着法，不是普通的轮换提示
      const h = pz.hintAction();
      if (!h) this.setStatus(PUZZLE_LOST_HINT, true);
      else if (h.type === 'play') {
        this.hand.setSelected(h.cards);
        this.refreshButtons();
      } else {
        this.hand.setSelected([]);
        this.setStatus('必胜的走法：这手选"不要"');
      }
      return;
    }
    const hints = this.ensureHints(v);
    if (hints.length === 0) {
      this.setStatus('要不起，点 不要', true, true);
      return;
    }
    const p = hints[this.hintIdx % hints.length]!;
    this.hintIdx++;
    this.hand.setSelected(p.cards);
    this.refreshButtons();
  }

  onPass(): void {
    const v = this.ses.view();
    if (!this.myTurn(v) || v.phase !== 'play' || !v.target || v.target.seat === DDZ_ME) return;
    this.hand.setSelected([]);
    this.act({ type: 'pass', seat: DDZ_ME });
  }

  onPlay(): void {
    const v = this.ses.view();
    if (!this.myTurn(v) || v.phase !== 'play') return;
    const sel = this.hand.selected();
    const r = this.judge(v, sel);
    if (!r.ok) {
      audio.sfx('error');
      if (r.reason) toast(this, r.reason, worldW(this) / 2, BUTTON_Y - DDZ_BUTTONS.toastDy, COLOR.redDark);
      return;
    }
    this.act({ type: 'play', seat: DDZ_ME, cards: sel });
  }

  // ───────────────────────── 电脑 ─────────────────────────

  /** 决定下一步：电脑行动、等我、或者弹结算 */
  pump(): void {
    if (!this.alive || this.busy || this.botTimer || this.botWaiting || this.overlay !== null) return;
    if (this.pumpNet()) return;
    const v = this.ses.view();
    if (v.phase === 'dealEnd' || (v.phase === 'gameOver' && !this.lastSettleSeen)) {
      this.showSettle(v.results[v.results.length - 1]!);
      return;
    }
    if (v.phase === 'gameOver') {
      this.showGameOver();
      return;
    }
    this.refreshButtons();
    const seat = v.turn;
    if (seat < 0 || !this.ses.isBot(seat)) return;
    // 联机只有调试托管会走到这里：等上一手有了回音、轮到我再出
    if (this.net && !this.net.canAct()) return;
    // 先想好出什么（单机交给后台线程算，深残局不冻画面），再按出法给思考时间
    const job = this.ses.botJob?.(seat) ?? null;
    const plan = job ? ddzBotRunner.run(job) : Promise.resolve(this.ses.botAction(seat));
    const lead = !v.target || v.target.seat === seat;
    // 连着几家不要：这一墩里已经有几个 pass（target 之后的）
    let passes = 0;
    for (let i = v.trick.length - 1; i >= 0 && v.trick[i]!.play === null; i--) passes++;
    const think = (a: DdzAction) => {
      if (v.phase === 'bid' || v.phase === 'show') return PACE.ddz.bidThink;
      const kind = a.type === 'play' ? (isBombish(interpretDdz(a.cards)[0] ?? { type: 'single' }) ? 'bomb' : 'play') : 'pass';
      return thinkTime({ kind, lead, passes, tense: v.counts.some((n, s) => s !== seat && n <= 2) });
    };
    this.runBot(seat, plan, think, (planned) => {
      const r = this.ses.apply(planned);
      if (r.sent) return;
      if (r.error) {
        // 电脑出错（理论上不会）：退回到"不要"或最小的单张，保证不卡住
        console.warn(`斗地主电脑 ${seat} 动作非法：${r.error}`);
        const view = this.ses.view();
        const canPass = view.phase === 'play' && !!view.target && view.target.seat !== seat;
        const fb = view.phase === 'bid' ? { type: 'bid' as const, seat, bid: 0 } : view.phase === 'show' ? { type: 'show' as const, seat, open: false } : canPass ? { type: 'pass' as const, seat } : { type: 'play' as const, seat, cards: [sortDdz(view.hand)[0]!] };
        const r2 = this.ses.apply(fb);
        if (r2.error) return;
        void this.playEvents(r2.events);
        return;
      }
      void this.playEvents(r.events);
    });
  }

  /** 联机：按顺序播放房间发来的帧。返回 true 表示这次在播（或等着播），pump 先别往下走 */
  /** 房间来了新消息（联机） */
  protected onNet(kind: NetEvent, detail?: string): void {
    if (!this.alive) return;
    const net = this.net!;
    if (kind === 'reset') {
      // 进房、重连的全量快照、换了座位：整桌重画
      this.cancelBot();
      this.scene.restart();
      return;
    }
    for (const sv of this.seats) sv.refreshIdentity();
    if (kind === 'status' && net.status === 'closed' && this.overlay !== 'gameOver') {
      // 房间散了、在别处登录被顶掉……：说清楚原因，只能回首页
      this.overlayModal?.close();
      const m = modal(this, DDZ_CLOSED_MODAL.w, DDZ_CLOSED_MODAL.h, undefined, { closeBtn: false, depth: 5200 });
      m.body.add(text(this, 0, -60, '房间断开了', { size: TYPE.title, bold: true, color: COLOR.redDark }));
      m.body.add(text(this, 0, -10, closeText(net.closeCode), { size: TYPE.body, bold: true, color: COLOR.ink, wrap: DDZ_CLOSED_MODAL.bodyW }));
      m.body.add(new Button(this, 0, DDZ_CLOSED_MODAL.btnY, DDZ_CLOSED_MODAL.btnW, DDZ_CLOSED_MODAL.btnH, '回首页', 'red', () => this.leaveRoom(), 'back'));
      this.openOverlay('menu', m);
      return;
    }
    if (kind === 'emote') {
      // 房间转发的（含我自己发的）："说话人:编号:对象:电脑"，画面座位
      const [vs, id, to] = (detail ?? '').split(':');
      const from = Number(vs);
      if (!Number.isInteger(from) || !Number.isInteger(Number(id))) return;
      this.funIn(from, Number(id), to ? Number(to) : undefined);
      return;
    }
    this.noticeNetTurn();
    this.refreshNetStake();
    if (kind === 'error') {
      this.lastError = detail ?? 'illegal_move';
      audio.sfx('error');
      toast(this, errorText(detail ?? ''), worldW(this) / 2, BUTTON_Y - DDZ_BUTTONS.toastDy, COLOR.redDark);
    }
    // 结算页开着时，别人点"继续"只是同一个局面（step 不变）：收下来刷新"还在等谁"，不然会堵住后面开下一副的那一帧
    if (this.overlay === 'settle') {
      while (net.queue[0] && net.shown && net.queue[0].nv.view.step === net.shown.view.step) net.take();
      this.refreshSettleWait();
      // 人齐了、房间开了下一副：结算页自己收起来，接着播
      const next = net.queue[0];
      if (next && next.nv.view.phase !== 'dealEnd') {
        this.overlayModal?.close();
        this.closeOverlay();
        return;
      }
    }
    this.refreshButtons();
    this.pump();
  }

  talk(seat: number, sit: Situation, force = false): void { talk(this, seat, sit, force); }

  // ───────────────────────── 事件播放 ─────────────────────────

  protected async playEvent(e: DdzEvent): Promise<void> { return playEvent(this, e); }

  /** 新解锁的成就：弹一条不挡操作的横幅（只有单机会话有；好友房不计成就） */
  /** low：结算弹窗马上要开，横幅直接落到下沿，不压弹窗的标题 */
  showUnlocked(low?: boolean): void {
    if (this.ses instanceof DdzSession) showUnlocked(this, this.ses.takeUnlocked(), low);
  }

  async animatePlay(seat: number, play: DdzPlay, left: number): Promise<void> { return animatePlay(this, seat, play, left); }

  async bombFx(seat: number, play: DdzPlay): Promise<void> { return bombFx(this, seat, play); }

  /** 发牌时另外两家也"收到牌"：从桌心往两家头像各飞几张牌背 */
  // ───────────────────────── 结算 ─────────────────────────

  springSeal(body: Phaser.GameObjects.Container, anti: boolean): void { springSeal(this, body, anti); }

  showSettle(r: DdzResult): void { showSettle(this, r); }

  showGameOver(): void { showGameOver(this); }

  showNetStakeResult(ns: DdzStakeView): void { showNetStakeResult(this, ns); }

  showStakeResult(ses: DdzStakeSession): void { showStakeResult(this, ses); }

  async stakeAgain(tier: DdzStakeSession['stake']['tier'], status: Phaser.GameObjects.Text, btn: Button): Promise<void> { return stakeAgain(this, tier, status, btn); }

  // ───────────────────────── 调试、重建 ─────────────────────────

  /** 冒烟用：控件名 → 世界坐标、能不能点、看不看得见 */
  controls(): Record<string, { x: number; y: number; enabled?: boolean; visible?: boolean }> {
    const out: Record<string, { x: number; y: number; enabled?: boolean; visible?: boolean }> = {};
    for (const [k, c] of this.ctl) {
      if (!c.obj.active) continue;
      const m = c.obj.getWorldTransformMatrix();
      const b = c.obj as unknown as { enabled?: boolean; visible: boolean };
      // 世界坐标（getWorldTransformMatrix 只叠父容器、不含相机），和掼蛋 TableScene 一样交给调试桥换成屏幕坐标
      out[k] = { x: m.tx, y: m.ty, ...(typeof b.enabled === 'boolean' ? { enabled: b.enabled } : {}), visible: c.obj.visible };
    }
    this.addFunControls(out);
    // 确认框的两个键（和掼蛋 TableScene 一样叫 ok / cancel，冒烟点"算了"）
    for (const k of ['ok', 'cancel']) {
      const b = this.overlayModal?.body.getData(k) as Button | undefined;
      if (b?.scene) out[k] = { x: b.x + this.overlayModal!.body.x, y: b.y + this.overlayModal!.body.y, enabled: true, visible: true };
    }
    // 手牌每张的点按点（冒烟逐张点）
    for (const c of this.ses.view().hand) {
      const p = this.hand.tapPoint(c);
      if (p) out[`card:${c}`] = p;
    }
    return out;
  }

  /** 调试桥：电脑代打我（冒烟快速推进）；正等我出手时马上接着走 */
  debugAutoplay(on: boolean): void {
    this.ses.autoplay = on;
    this.refreshButtons();
    this.pump();
  }

  handSelected(): number[] {
    return this.hand.selected();
  }
}

