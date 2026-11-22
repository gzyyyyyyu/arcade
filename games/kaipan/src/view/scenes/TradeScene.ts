import Phaser from 'phaser';
import { eventView, formatMoney, swanNotice, topBar, validate, type GameEvent, type GameState } from '../../core/index.ts';
import { loadOptionalArt, queueLazy, queueStockArt, stocksForThemes } from '../assets.ts';
import { floatText } from '../fx/effects.ts';
import { dayWord as ipoDayWord } from '../trade/ipo.ts';
import { shedBurst, sparkles } from '../fx/particles.ts';
import { isTouch } from '../input.ts';
import type { Rect } from '../rect.ts';
import type { Session } from '../session.ts';
import { sound } from '../sound.ts';
import { COLOR, PHONE as PHONE_MODE, VIEW, mixColor, signColor } from '../theme.ts';
import { pctArrow } from '../labels.ts';
import { addWood } from '../ui/art.ts';
import { Button, DENIED_EVENT } from '../ui/button.ts';
import { addText, setColor } from '../ui/text.ts';
import { hideTooltip } from '../ui/tooltip.ts';
import { ChatView3 } from '../trade/chat.ts';
import { Guide } from '../trade/guide.ts';
import { HoldingsView } from '../trade/holdings.ts';
import { MarketScreen } from '../trade/marketScreen.ts';
import type { Dialog } from '../ui/dialog.ts';
import { DETAIL_EVENT, STAR_EVENT } from '../trade/detail.ts';
import { recordTape } from '../trade/tape.ts';
import { MONITOR, OPEN, TABS } from '../trade/layout.ts';
import { PanelTabs, type PanelTab } from '../trade/tabs.ts';
import { EventPanel, RewardPanel } from '../trade/monthEnd.ts';
import { Room } from '../trade/room.ts';
import { ThemeBoardView } from '../trade/themeBoard.ts';
import { TopBarView } from '../trade/topBar.ts';
import { onTutorialChange } from '../tutorial.ts';
import { BaseScene, setupCamera } from './BaseScene.ts';
import { buysText, flashFinal } from '../labels.ts';
import { HintBubble } from '../trade/hintBubble.ts';
import { RecapCard } from '../trade/recapCard.ts';
import { recapOf } from '../recap.ts';
import { isLiveRun, marginWarn } from '../live.ts';
import { hintsOn, loadViewPrefs } from '../meta/prefs.ts';
import { redeemFx } from '../trade/ext.ts';
import type { ExtTipId } from '../extTips.ts';
import { collateralById, freeUnits, isFlash, themeById, unitsWord } from '../../core/index.ts';
import { moneyShort } from '../ui/dialog.ts';
import { setFocusHome } from '../ui/focus.ts';
import type { TradeDrag } from '../trade/drag.ts';
import { resetClickSuppress } from '../trade/dragGeo.ts';
import { loadProfile } from '../../platform/profile.ts';
import { pick, first, DELEVERAGE_TIP, T } from '../trade/tradeConsts.ts';
import { TradeActions } from '../trade/tradeActions.ts';
import { TradeInput } from '../trade/tradeInput.ts';
import { TradeFx } from '../trade/tradeFx.ts';
import { DayPlayback } from '../trade/dayPlayback.ts';
import { MonthFlow } from '../trade/monthFlow.ts';
import { TradeHints } from '../trade/tradeHints.ts';
import { TradeRegions } from '../trade/tradeRegions.ts';

/**
 * 交易主场景：小屋背景、顶栏、题材看板、持仓格、手机群聊、开盘按钮；
 * 开盘后按 core 的事件顺序播放一天的结算（设计稿第 5 节），月底账单、三选一、事件也在这里。
 */
export class TradeScene extends BaseScene {
  // 协作者：按职责拆出去的代码，状态都留在本类里（它们通过 s 访问）
  readonly acts = new TradeActions(this);
  readonly kb = new TradeInput(this);
  readonly tfx = new TradeFx(this);
  readonly day = new DayPlayback(this);
  readonly month = new MonthFlow(this);
  readonly hints = new TradeHints(this);
  readonly regs = new TradeRegions(this);
  room!: Room;
  top!: TopBarView;
  board!: ThemeBoardView;
  holdings!: HoldingsView;
  chat!: ChatView3;
  openBtn!: Button;
  monitor!: Phaser.GameObjects.Text;
  /** 0.5.1 今日大盘屏 */
  screen!: MarketScreen;
  reward: RewardPanel | null = null;
  event: EventPanel | null = null;
  banner: Phaser.GameObjects.Container | null = null;
  bannerCancel: Button | null = null;
  continueBtn: Button | null = null;
  guide: Guide | null = null;
  offTutorial: (() => void) | null = null;
  /** 正在播放结算（锁住按钮） */
  busy = false;
  /** 0.5：平淡日的"快进"按钮（F） */
  quietBtn!: Button;
  /** 实盘杠杆局的「减仓」按钮（开盘前，2×/3× 才出现） */
  deleverageBtn!: Button;
  /** 快到清零线时按钮外圈的红框 */
  deleverageRing!: Phaser.GameObjects.Rectangle;
  /** 下一次开盘按快进播放 */
  fastNext = false;
  /** 自动快进的计时器 */
  autoTimer: Phaser.Time.TimerEvent | null = null;
  /** 上一天碰到了高光 / 事件 / 目标变化：这一天停下来等玩家（不自动快进） */
  stopHere = true;
  /** 玩家在这一天点过"停下"（按交易日编号） */
  autoCancelDay = -1;

  protected override readonly phoneReady = PHONE_MODE;

  constructor(session: Session) {
    super('trade', session);
  }

  /** 只补加载本局登场题材的股票合成图。 */
  preload(): void {
    setupCamera(this, this.phoneReady);
    const ids = stocksForThemes(this.session.state.themeIds);
    const n = queueStockArt(this.load, this.textures, ids) + queueLazy(this.load, this.textures);
    // 眨眼图是可选素材：后台补，到了就开始眨
    void loadOptionalArt(this.textures, { stocks: ids });
    if (n > 0) {
      this.add.rectangle(0, 0, VIEW.w, VIEW.h, COLOR.bg).setOrigin(0, 0);
      addText(this, VIEW.w / 2, VIEW.h / 2, '正在载入…', { size: 16, color: COLOR.muted, originX: 0.5, originY: 0.5 });
    }
  }

  protected override build(): void {
    // 点了禁用的按钮（加班、T+1、现金不够……）：说明原因
    const onDenied = (msg: string): void => this.tfx.toast(msg);
    this.events.on(DENIED_EVENT, onDenied);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(DENIED_EVENT, onDenied));
    const s = this.session.state;
    this.reward = null;
    this.event = null;
    this.banner = null;
    this.continueBtn = null;
    this.guide = null;
    this.busy = false;
    this.children.removeAll(true);
    this.room = new Room(this, s.mood, { ambient: this.lively });
    // 盘前是清晨；停在月底账单后的奖励、事件上时接着是夜里、傍晚
    this.room.setTime(s.phase === 'premarket' ? 'morning' : s.phase === 'event' ? 'dusk' : 'night', null);
    this.chat = new ChatView3(this, s, this.lively, (i) => this.acts.onBuy(i));
    this.chat.onShort = (i) => this.acts.onBuy(i, true);
    this.chat.onIpo = () => this.acts.openIpo();
    this.board = new ThemeBoardView(this, s, !this.lively);
    this.holdings = new HoldingsView(this, s, this.lively, (slot) => this.acts.onSell(slot));
    this.holdings.onInspect = (slot) => this.acts.inspect(slot);
    this.holdings.onMore = (slot) => this.acts.openHolding(slot);
    this.holdings.onMenu = (slot) => this.acts.onCardMenu(slot);
    // 0.5.1：显示器换成「今日大盘屏」（大盘走势、风口榜、跑马灯、昨天盈亏）
    recordTape(s);
    this.screen = new MarketScreen(this, this.lively);
    this.monitor = this.screen.big;
    // 详情卡（股票 / 风口 / 群友）打开时登记成当前对话框
    const onDetail = (d: Dialog): void => this.trackDialog(d);
    this.events.on(DETAIL_EVENT, onDetail);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(DETAIL_EVENT, onDetail));
    // 0.35.0 详情卡上的「自选」
    const onStar = (stockId: string): void => this.acts.act({ type: 'star', stockId });
    this.events.on(STAR_EVENT, onStar);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(STAR_EVENT, onStar));
    // 0.18.0 开盘台：按钮下面垫一块木头（art-v3 的木材质）
    // 手机上开盘键离画面底只有 4：木台只露出键底 4，不出画面（以前露 8，底边被裁）
    addWood(this, OPEN.x - 14, OPEN.y + OPEN.h - 24, OPEN.w + 28, PHONE_MODE ? 28 : 36);
    this.openBtn = new Button(this, OPEN.x, OPEN.y, {
      width: OPEN.w,
      height: OPEN.h,
      label: '开 盘',
      subLabel: '',
      variant: 'primary',
      // 手机上副标跟着主字缩（副标 = 主字 × 0.72），140 宽的键里「3月·第10天」放得下
      fontSize: PHONE_MODE ? 24 : 30,
      hotkey: '空格',
      sound: null,
      onClick: () => this.acts.onOpen(),
    });
    // 手机上开盘键右边是群聊那一块，快进键放到开盘键上面（大盘小屏的位置，平静日才出现）
    const quietAt = PHONE_MODE ? { x: MONITOR.x, y: MONITOR.y, w: MONITOR.w, h: MONITOR.h } : { x: OPEN.x + OPEN.w + 14, y: OPEN.y + 12, w: 196, h: 60 };
    this.quietBtn = new Button(this, quietAt.x, quietAt.y, {
      width: quietAt.w,
      height: quietAt.h,
      label: '快进',
      subLabel: '平静日',
      fontSize: 20,
      hotkey: 'F',
      sound: null,
      onClick: () => this.acts.onFast(),
    });
    this.quietBtn.setVisible(false);
    // 减仓：电脑放在开盘键左边；手机放在开盘列左边的小结卡右上角（顶栏和开盘列都没有空位）
    const dlAt = PHONE_MODE ? { x: OPEN.x - 8 - 104, y: MONITOR.y - 2, w: 104, h: 34, size: 14 } : { x: OPEN.x - 14 - 184, y: OPEN.y + 22, w: 184, h: 48, size: 18 };
    this.deleverageBtn = new Button(this, dlAt.x, dlAt.y, {
      width: dlAt.w,
      height: dlAt.h,
      label: '减仓',
      fontSize: dlAt.size,
      variant: 'default',
      sound: null,
      onClick: () => this.acts.onDeleverage(),
    });
    this.deleverageBtn.setDepth(60).setVisible(false);
    this.deleverageRing = this.add.rectangle(dlAt.x - 3, dlAt.y - 3, dlAt.w + 6, dlAt.h + 6, 0xffffff, 0).setOrigin(0, 0).setRounded(10).setStrokeStyle(3, COLOR.danger, 1).setDepth(59).setVisible(false);
    this.deleverageBtn.tooltip(() => ({ title: '减仓', body: DELEVERAGE_TIP }));
    this.deleverageBtn.onDenied(() => validate(this.session.state, { type: 'deleverage' }));
    // 键盘：方向键第一下先落在开盘键上；拖拽（推荐卡拖进空格买、持仓卡拖出去卖）
    setFocusHome(this.openBtn);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => setFocusHome(null));
    resetClickSuppress();
    this.kb.buildDrag();
    this.fastNext = false;
    this.autoTimer = null;
    this.stopHere = true;
    // 自动快进倒计时里，点画面任意处就停下
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => this.acts.cancelAuto());
    this.top = new TopBarView(this, s, () => this.openSettings(true), () => this.openHelp(), () => this.acts.openBank(), () => this.askLobby());
    // 手机横屏：右边一块用标签页在群聊 / 推荐 / 风口之间切换（重建画面时停在原来那一页）
    this.tabs = TABS ? new PanelTabs(this, TABS, this.tab, (t) => this.applyTab(t)) : null;
    this.applyTab(this.tab);
    this.extTipNow = null;
    this.knowNode = null;
    this.hint = new HintBubble(this);
    this.recapCard = new RecapCard(this);
    this.recapCard.onChange = () => this.hints.syncCorner();
    // 重建画面（读档、换设置）时，开盘前把昨天的小结补上（静态，不弹动画）
    const last = s.lastDay;
    if (s.phase === 'premarket' && last && last.holdings.some((h) => (h.parts?.length ?? 0) > 0)) this.recapCard.showRecap(recapOf(last), this.hints.recapBrief(), null);
    this.hintsEnabled = hintsOn(loadViewPrefs(), loadProfile().profile.runs);
    this.guide = new Guide(this, {
      state: () => this.session.state,
      target: (hit) => this.hints.guideTarget(hit.step, hit.stockId),
      avoid: () => this.hints.clickableRects(),
      changed: () => {
        this.hints.updateHint();
        this.session.notify();
      },
    });
    // 设置里重新打开 / 关闭教程：立刻按当前局面刷新
    this.offTutorial = onTutorialChange(() => this.hints.syncGuide());
    // 重建画面（改设置、切换输入方式）时不会再走 enter：下一帧按当前局面补出教程气泡（动画中会被跳过）
    this.time.delayedCall(0, () => this.hints.syncGuide());
  }

  protected override teardown(): void {
    this.acts.clearAuto();
    this.room?.destroy();
    this.guide?.destroy();
    this.guide = null;
    this.offTutorial?.();
    this.offTutorial = null;
  }

  override render(s: GameState): void {
    hideTooltip(this);
    this.acts.clearPick();
    this.top.render(s);
    this.board.render(s);
    this.holdings.render(s);
    this.chat.render(s, this.chatNotes(s));
    if (this.tabs) {
      this.applyTab(this.tab);
      this.tabs.setBadge('recs', s.phase === 'premarket' ? this.chat.recCount : 0);
    }
    this.room.setMood(s.mood, null);
    this.room.setRainbow(!!s.lastDay && s.lastDay.market.ret >= 1.5);
    // 0.11.0 开了杠杆、离清零线不远：每天盘前提醒一句（顶栏的账户同时变红闪）
    const warn = isLiveRun(s) ? marginWarn(s) : null;
    if (warn !== null && this.warnedDay !== s.dayIndex) {
      this.warnedDay = s.dayIndex;
      this.tfx.toast(`离清零线不远了：结回只剩约 ${warn.toFixed(1)} 份，再跌一点这局就按 0 结`, 3200);
    }
    this.renderMonitor(s);
    const pre = s.phase === 'premarket';
    this.openBtn.setEnabled(pre).setLocked(this.busy);
    const fl = topBar(s).flash;
    // 手机上开盘键只有 140 宽：副标写短（第9天·冲刺），不缩字、不用「…」截
    const dayWord = fl ? (PHONE_MODE ? `第${fl.day}天` : `第${fl.day}/${fl.days}天`) : PHONE_MODE ? `${s.month}月·第${s.dayInMonth + 1}天` : `${s.month}月 · 第${s.dayInMonth + 1}天`;
    this.openBtn.setSubLabel(pre ? `${dayWord}${fl && flashFinal(fl) ? (PHONE_MODE ? '·冲刺' : ' · 冲刺') : ''}` : '算账中');
    const quiet = pre && this.acts.quietToday(s);
    this.quietBtn.setVisible(quiet).setEnabled(quiet).setLocked(this.busy);
    this.acts.renderDeleverage(s);
    this.holdings.setLocked(this.busy);
    this.chat.setLocked(this.busy);
    sound.mood(pre ? s.mood : s.phase === 'reward' || s.phase === 'event' ? 'payday' : 'silent');
    // 月底面板（按 phase 常驻）
    if (s.phase === 'reward' && !this.reward) {
      // 0.5：三选一 / 事件弹出时收起小结卡，一屏只留一个焦点
      this.recapCard?.clear();
      this.reward = new RewardPanel(this, s, this.anim, this.lively, (i) => this.acts.onPickReward(i), () => this.acts.onSkipReward());
    } else if (s.phase !== 'reward' && this.reward) {
      this.reward.destroy();
      this.reward = null;
    }
    const ev = eventView(s);
    if (s.phase === 'event' && ev && !this.event) {
      this.recapCard?.clear();
      this.event = new EventPanel(this, ev, (o) => this.acts.onChoose(o));
    } else if (s.phase !== 'event' && this.event) {
      this.event.destroy();
      this.event = null;
    }
    this.session.notify();
  }

  /** 手机横屏的标签页（电脑上为 null）和当前在哪一页 */
  tabs: PanelTabs | null = null;
  tab: PanelTab = 'msgs';

  /** 切到某一页：群聊 / 推荐是同一块群聊的两页，风口是看板。电脑上什么都不做。 */
  applyTab(t: PanelTab): void {
    if (!this.tabs) return;
    this.tab = t;
    this.tabs.set(t);
    this.chat.setPhoneView(t === 'board' ? null : t);
    this.board.setShown(t === 'board');
    hideTooltip(this);
    this.session.notify();
  }

  /** 教程、提示要指着某一页上的东西时，先切过去。 */
  showTab(t: PanelTab): void {
    if (this.tabs && this.tab !== t) this.applyTab(t);
  }

  /** 群聊里额外的系统提示（新群友入群），到下一次开盘为止。 */
  notes: string[] = [];

  chatNotes(s: GameState): string[] {
    if (s.phase !== 'premarket') return [];
    // 黑天鹅预告：群聊最上面两行系统提示（哪一类、怎么避险），不说幅度
    const sw = swanNotice(s);
    const when = sw ? (['今天', '明天', '后天'][sw.daysLeft] ?? '') : '';
    // 一行放得下的短句：哪一天、哪一种；再一行避险办法（完整说明在顶栏标签的悬停里）
    return sw ? [`黑天鹅预告 · ${when}：${sw.name}${sw.theme ? `（${themeById(sw.theme).name}）` : ''}`, `避险：${sw.hedge}`, ...this.notes] : this.notes;
  }

  renderMonitor(s: GameState): void {
    // 0.5：屏幕上一行大数字（昨天的钱 + 箭头百分比），下面一个短标签
    recordTape(s);
    this.screen.render(s);
    const last = s.lastDay;
    if (last) this.setMonitorMoney(last.account.after - last.account.before, last.account.ret, '昨天');
    else this.setMonitorLine(`本钱 ${formatMoney(s.account)}`);
    if (s.phase === 'premarket') {
      const left = s.today.buysLeft;
      const go = isTouch() ? '点「开盘」' : '空格开盘';
      if (this.acts.quietToday(s)) this.screen.setSub(isTouch() ? '平静日 · 可快进' : '平静日 · F 快进');
      else if (topBar(s).busy) this.screen.setSub(`加班中 · 不能买卖 · ${go}`);
      else this.screen.setSub(`${buysText(left, s.ext ? freeUnits(s) : null).text} · ${go}`);
    } else {
      this.screen.setSub(isFlash(s) ? `${s.setup?.weekly !== undefined ? '本周市场' : '闪电盘'} · ${s.phase === 'reward' ? '先挑一样' : '收盘后的小事'}` : '月底算账');
    }
  }

  /** 屏幕大字：「+¥1,990  ↑1.99%」，按涨跌着亮色。 */
  setMonitorMoney(delta: number, ret: number, when: '昨天' | '今天' = '今天'): void {
    const v = Math.round(delta);
    this.monitor.setText(v === 0 ? `${when} ¥0 ${pctArrow(0, 2)}` : `${when} ${formatMoney(delta, { sign: true })} ${pctArrow(ret, 2)}`);
    // 手机上的小屏只有一百多宽：只写钱（涨跌百分比在小结卡里），还放不下就写成「万」
    if (PHONE_MODE && this.monitor.width > MONITOR.w - 12) this.monitor.setText(v === 0 ? '¥0' : formatMoney(delta, { sign: true }));
    if (PHONE_MODE && this.monitor.width > MONITOR.w - 12) this.monitor.setText(moneyShort(delta, true));
    setColor(this.monitor, v === 0 ? COLOR.screenText : mixColor(signColor(delta), 0xffffff, 0.45));
  }

  setMonitorLine(text: string): void {
    this.monitor.setText(text);
    setColor(this.monitor, COLOR.screenText);
  }

  drag: TradeDrag | null = null;

  /** 右键点在空白处：先关弹窗，再取消选格子。 */
  protected override onRightClick(): boolean {
    if (super.onRightClick()) return true;
    if (!this.banner || !this.bannerCancel) return false;
    this.bannerCancel.press();
    return true;
  }

  /** 0.11.0 今天已经提醒过离清零线不远（一天只说一次） */
  warnedDay = -1;

  toastNode: Phaser.GameObjects.Container | null = null;
  hint: HintBubble | null = null;
  recapCard: RecapCard | null = null;
  quips: { root: Phaser.GameObjects.Container; rect: Rect }[] = [];
  /** 盘前群友评论的气泡（开盘时收掉） */
  commentQuips: Phaser.GameObjects.Container[] = [];
  hintsEnabled = false;
  toastTimer: Phaser.Time.TimerEvent | null = null;

  toastRect: Rect | null = null;

  /** 最近一条拒绝提示（自动化检查用）。 */
  lastToast = '';

  // ---------------------------------------------------------------- 表现

  override async enter(events: GameEvent[]): Promise<void> {
    const s = this.session.state;
    if (first(events, 'monthStarted') && s.phase === 'premarket') {
      this.anim.begin();
      this.setBusy(true);
      await this.month.playMonthIntro(events);
      this.setBusy(false);
      await this.chat.intro(this.anim, T.chatGap);
    }
    this.hints.syncGuide();
    this.stopHere = true;
  }

  override async present(prev: GameState, next: GameState, events: GameEvent[]): Promise<void> {
    this.anim.begin();
    this.acts.clearAuto();
    if (first(events, 'opened')) {
      const fast = this.fastNext;
      this.fastNext = false;
      this.notes = [];
      this.guide?.acted('open');
      this.guide?.suspend();
      this.hint?.hide();
      this.board.setHighlight([], []);
      this.recapCard?.clear();
      await this.day.playDay(prev, next, events, fast);
      this.guide?.resume(this.session.state);
      this.acts.maybeAuto();
      return;
    }
    if (first(events, 'rewardPicked') || first(events, 'rewardSkipped')) {
      this.guide?.acted('bill');
      this.guide?.suspend();
      await this.month.playAfterReward(next, events);
      this.guide?.resume(this.session.state);
      return;
    }
    if (first(events, 'eventResolved')) {
      this.guide?.suspend();
      await this.month.playAfterEvent(prev, next, events);
      this.guide?.resume(this.session.state);
      return;
    }
    // 盘前买卖
    const bought = first(events, 'bought');
    const sold = pick(events, 'sold');
    // 0.5.1：买入的小人从推荐卡飞进格子；卖出的格子吐金币飞回顶栏钱包（先记下飞出前的位置）
    const recFrom = bought ? this.chat.recRect(bought.rec) : null;
    const soldFrom = sold.map((e) => this.holdings.center(e.slot));
    this.render(next);
    if (bought && recFrom && !this.anim.instant) this.tfx.flyIn(bought.slot, bought.stockId, { x: recFrom.x + 34, y: recFrom.y + recFrom.h / 2 });
    soldFrom.forEach((c, i) => {
      const e = sold[i];
      if (c && e && !this.anim.instant) this.tfx.coinsHome(c, e.holdRet);
    });
    if (bought) {
      sound.cue({ type: 'buy' });
      if (bought.replaced) sound.cue({ type: 'sell' });
      const c = this.holdings.center(bought.slot);
      if (c) sparkles(this, this.anim, c.x, c.y - 30, 12);
      const head = this.holdings.rect(bought.slot) ?? null;
      const u = bought.units ?? 1;
      const word = bought.short ? `押跌 ${unitsWord(u)}！` : next.ext && u >= 3 ? `重仓 ${unitsWord(u)}！` : next.ext ? `买入 ${unitsWord(u)}！` : '买入！';
      if (head) this.tfx.glyphPop(bought.short ? 'bear' : 'rocket', head.x + 22, head.y - 6, 30);
      if (head) floatText(this, this.anim, head.x + head.w / 2, head.y + 4, word, bought.short ? 0x2e3558 : COLOR.info, { size: bought.short || u >= 3 ? 20 : 16, pop: true });
      this.guide?.acted('rec');
    }
    // 打新：申购成功，那一格变成「申购中」卡
    const subscribed = first(events, 'subscribed');
    if (subscribed) {
      sound.cue({ type: 'buy' });
      const r = this.holdings.rect(subscribed.slot);
      if (r) {
        sparkles(this, this.anim, r.x + r.w / 2, r.y + 80, 10);
        floatText(this, this.anim, r.x + r.w / 2, r.y + 4, `申购！${ipoDayWord(Math.max(0, subscribed.offer.drawDay - next.dayIndex))}出签`, COLOR.accentDark, { size: 16, pop: true });
      }
    }
    for (const e of pick(events, 'added')) {
      sound.cue({ type: 'buy' });
      const r = this.holdings.rect(e.slot);
      if (r) {
        sparkles(this, this.anim, r.x + 22, r.y + 90, 10);
        floatText(this, this.anim, r.x + r.w / 2, r.y + 4, `加仓！现在 ${unitsWord(e.units)}`, COLOR.info, { size: 16, pop: true });
      }
      this.guide?.acted('sell');
    }
    for (const e of pick(events, 'trimmed')) {
      sound.cue({ type: 'sell' });
      const r = this.holdings.rect(e.slot);
      if (r) floatText(this, this.anim, r.x + r.w / 2, r.y + 4, `卖一半 ${pctArrow(e.holdRet)}`, signColor(e.holdRet), { size: 16, pop: true });
      this.guide?.acted('sell');
    }
    const cut = first(events, 'deleveraged');
    if (cut) {
      this.tfx.toast(cut.x <= 1 ? '不加杠杆了' : `减到 ${cut.x}× 了`, 2400, false);
      sound.cue({ type: 'deleverage', x: cut.x });
      const at = this.deleverageBtn.center();
      shedBurst(this, this.anim, at.x, at.y);
      floatText(this, this.anim, at.x, at.y - 6, cut.x <= 1 ? '卸下重担！' : `卸下一档 ${cut.x}×`, COLOR.info, { size: 20, pop: true, hold: 700, depth: 172 });
    }
    const borrowed = first(events, 'borrowed');
    if (borrowed) {
      sound.cue({ type: 'buy' });
      void this.top.rollAccount(this.anim, prev.account, next.account, 500);
      const name = collateralById(borrowed.loan.id).name;
      this.tfx.toast(`${collateralById(borrowed.loan.id).pledge}借到 ${formatMoney(borrowed.loan.amount)}`, 3600, false);
      floatText(this, this.anim, 420, 70, `押了${name}，+${formatMoney(borrowed.loan.amount)}`, COLOR.accentDark, { size: 20, pop: true, hold: 900, depth: 170 });
    }
    const repaid = first(events, 'repaid');
    if (repaid) {
      void this.top.rollAccount(this.anim, prev.account, next.account, 500);
      sound.cue({ type: 'rewardShow' });
      redeemFx(this, this.anim, collateralById(repaid.loan.id).name);
      this.tfx.toast(collateralById(repaid.loan.id).back, 3600, false);
    }
    this.tfx.showComments(pick(events, 'comment'));
    this.tfx.showQuips(this.anim, pick(events, 'quip'));
    // 一步卖光：到账的钱从卡上飞向现金格（只有一只卖出时钱数才对得上）
    const soldAt = sold.length === 1 ? soldFrom[0] : null;
    if (soldAt) this.tfx.cashFly(soldAt, next.account - prev.account);
    for (const e of sold) {
      sound.cue({ type: 'sell' });
      const c = this.holdings.center(e.slot);
      if (c) this.tfx.glyphPop(e.holdRet > 0 ? 'moneybag' : 'cry', c.x, c.y - 44, 40);
      if (c) floatText(this, this.anim, c.x, c.y, `卖出 ${pctArrow(e.holdRet)}`, signColor(e.holdRet), { size: 18, pop: true });
      this.guide?.acted('sell');
    }
    this.tfx.showLearned(events);
    this.hints.syncGuide();
  }

  knowNode: Phaser.GameObjects.Container | null = null;

  setBusy(b: boolean): void {
    this.busy = b;
    this.openBtn.setLocked(b);
    this.holdings.setLocked(b);
    this.chat.setLocked(b);
    this.session.notify();
  }

  /** 正在显示的本月看点卡（截图、自动化用） */
  cardRect: Rect | null = null;

  /** 正在显示的新机制提示（当天留着） */
  extTipNow: { id: ExtTipId; text: string; day: number } | null = null;

  protected override onKey(e: KeyboardEvent): boolean {
    return this.kb.onKey(e);
  }

  override controls(): Record<string, { x: number; y: number }> {
    return this.regs.controls();
  }

  override regions(): Record<string, Rect> {
    return this.regs.regions();
  }
}
