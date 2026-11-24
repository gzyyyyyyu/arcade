/**
 * 两个牌桌场景（掼蛋 TableScene、斗地主 DdzScene）共用的流程骨架：播放事件、电脑计时器、联机帧泵、弹层、倒计时、
 * 结算页等人、坐标换算、调试用的控件表。只放"两边做法一样"的部分，免得改一处要改两处。
 *
 * 规矩（tests/architecture.test.ts 守着）：这里按通用层对待，只引用 view/common、table、ui、src/net、src/core，
 * 不引用任何玩法（variants/*）和玩法的画面目录（view/guandan、view/doudizhu）。玩法才有的东西（会话类型、事件怎么播、
 * 按钮怎么摆、几个座位）由子类用抽象方法和钩子给。
 */
import Phaser from 'phaser';
import type { TableFun } from 'arcade-kit/table-fun';
import { audio } from '../../common/audio.ts';
import { dur } from '../../common/anim.ts';
import { flashTitle, stopFlash, vibrate } from '../../common/attention.ts';
import { seatName } from '../../common/labels.ts';
import { PACE } from '../../common/pace.ts';
import type { LinkFrame, NetEvent, RoomLink } from '../../common/room-link.ts';
import { presenceNow } from '../../common/social.ts';
import { roomWhy } from '../../common/stake-text.ts';
import { standalone } from '../../common/platform.ts';
import { COLOR, minHit, phoneType, GAME_HEIGHT } from '../../common/theme.ts';
import { getSettings } from '../../store.ts';
import type { HandView } from '../../table/hand.ts';
import { CLOCK_TICK_MS, DEAL_BACK, DEAL_FLY, ERROR_TOAST_DY, STATUS_PILL, TOP_ICONS, TOPBAR_H } from '../../table/layout.ts';
import type { SeatView } from '../../table/seats.ts';
import { cloudButton } from '../../ui/cloud.ts';
import { iconButton, setTopHit, worldW, type Button, type Modal } from '../../ui/kit.ts';
import { toast } from '../../ui/bubble.ts';
import { releaseExtraBake } from '../../common/textures.ts';

/** 弹层的种类（两个玩法的并集；null = 没有弹层） */
type Overlay = 'settle' | 'gameOver' | 'stake' | 'choose' | 'menu' | 'tutorial' | null;

/** 画面座位 0 永远是"我"（旁观时是真实 0 号座位上的人，但不算我自己） */
const MY_SEAT = 0;

/** 世界坐标换成屏幕（CSS 像素）后的矩形 */
interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 调试桥的控件表：名字 → 世界坐标 */
type ControlMap = Record<string, { x: number; y: number; enabled?: boolean; visible?: boolean }>;

/** 联机帧里画面共用的那几项：这一步的编号、要播的事件、实盘房间每个座位的账 */
interface SceneFrame<E> {
  view: { step: number };
  events: E[];
  stake?: { seats: readonly { paid: string; out?: boolean }[]; why?: string | null } | null;
}

/** 联机会话里画面用到的部分（掼蛋、斗地主的会话都继承 RoomLink） */
type SceneNet<V> = Pick<RoomLink<never, never, V>, 'queue' | 'shown' | 'take' | 'on' | 'leave' | 'turnInfo' | 'watching'> & {
  begin(): void;
  canReady(): boolean;
  readyWait(): { waiting: number[]; deadline: number | null } | null;
};

/** 单机和联机会话共有的部分 */
interface SceneSession<A, E> {
  autoplay: boolean;
  lastEvents: E[];
  /** 单机马上返回事件；联机只是发出去（sent），结果随房间的下一帧到 */
  apply(a: A): { events: E[]; error: string | null; sent?: boolean };
}

/** A = 玩家操作，E = 核心事件，V = 联机帧里的视图 */
export abstract class TableSceneBase<A, E, V extends SceneFrame<E>> extends Phaser.Scene {
  abstract ses: SceneSession<A, E>;
  hand!: HandView;
  seats: SeatView[] = [];
  btnPlay!: Button;
  btnPass!: Button;
  btnHint!: Button;
  btnSort!: Button;
  btnClear!: Button;
  status!: Phaser.GameObjects.Text;
  statusBg!: Phaser.GameObjects.Graphics;
  top!: Phaser.GameObjects.Container;
  busy = false;
  protected botTimer: Phaser.Time.TimerEvent | null = null;
  protected botSeat = -1;
  /** 电脑这一手还在后台线程里算（runBot）；cancelBot 加一代，算回来的旧结果作废 */
  protected botWaiting = false;
  private botGen = 0;
  overlay: Overlay = null;
  overlayModal: Modal | null = null;
  /** 好友房结算页上"还在等谁"那行字 */
  settleWait: Phaser.GameObjects.Text | null = null;
  /** 顶栏的云存档图标（单独部署没有账号，不摆） */
  protected cloudBtn: Phaser.GameObjects.Container | null = null;
  fun: TableFun | null = null;
  /** 快捷键的 Esc：互动面板、头像菜单开着就关掉（kit 的 DOM 层自己不接 Esc） */
  closeFun(): boolean {
    if (!this.fun?.isOpen()) return false;
    this.fun.closeAll();
    return true;
  }
  funShown = true;
  alive = true;
  /** 画面建了几次（冒烟核对地址栏收放时没有重建） */
  builds = 0;
  /** 调试/冒烟：最近一次 dispatch 的错误 */
  lastError: string | null = null;
  /** 调试：已播放的大字特效（冒烟断言用） */
  readonly fxLog: string[] = [];
  /** 好友房实盘的结算页上"带回了没有"那行字（房间办完带回后刷新） */
  netStakeStatus: Phaser.GameObjects.Text | null = null;
  protected myNetTurn = false;

  /** 操作按钮那排的纵坐标（提示文字、出错提示跟着它） */
  protected abstract readonly buttonY: number;
  /** 结算页"还在等谁"那行字：没有按钮时的纵坐标默认值、能点时在按钮下面隔多远 */
  protected abstract readonly settleWaitAt: { y: number; gap: number };
  /** 联机会话；单机为 null */
  abstract get net(): SceneNet<V> | null;

  // 子类各自的流程：建按钮、刷新、推进、播事件、房间消息
  abstract refreshButtons(): void;
  protected abstract sync(animateHand?: boolean, beforeDeal?: boolean): void;
  abstract pump(): void;
  protected abstract playEvent(e: E): Promise<void>;
  protected abstract onNet(kind: NetEvent, detail?: string): void;
  /** 离开房间时把 app 上记着的联机会话清掉（掼蛋 app.net，斗地主 app.ddzNet） */
  protected abstract forgetNet(): void;
  /** 联机帧里电脑这一手的思考时间（毫秒，再经 dur 换算）；prev 是取走这一帧之前画面显示的那一帧 */
  protected abstract frameThinkMs(f: LinkFrame<V>, prev: V | null): number;
  /** 结算页上还在等的人里，哪些要写出来 */
  protected abstract waitingOthers(waiting: number[]): number[];
  /** 发牌时飞向这个座位的牌背转多少度；null = 这个座位不飞（我自己） */
  protected abstract dealBackAngle(seat: number): number | null;
  /** 发牌时给每个对手飞几轮牌背 */
  protected abstract readonly dealBackRounds: number;

  // ───────────────────────── 座位 ─────────────────────────

  /** 旁观：好友房开打了、我没坐下（画面座位 0 是真实的 0 号座位上的人） */
  get watching(): boolean {
    return !!this.net?.watching;
  }

  /** 画面座位 seat 是不是我自己（旁观时谁都不是） */
  isMe(seat: number): boolean {
    return seat === MY_SEAT && !this.watching;
  }

  get isBusy(): boolean {
    return this.busy || this.botTimer !== null || this.botWaiting;
  }

  // ───────────────────────── 搭建 ─────────────────────────

  /** 顶栏的底：销毁旧的、新建容器，黑漆顶栏上亮下暗三层叠出漆面（Canvas 渲染也能画，不用渐变填充），底下双金线。返回容器，调用方接着往里摆 */
  /** 顶栏整个重建了几次（调试桥 topBuilds，冒烟查"不是每出一手都重建"） */
  topBuilds = 0;

  beginTopBar(W: number): Phaser.GameObjects.Container {
    this.topBuilds++;
    this.top?.destroy();
    const c = this.add.container(0, 0).setDepth(900);
    this.top = c;
    const g = this.add.graphics();
    g.fillStyle(0x24130a, 0.94).fillRect(0, 0, W, TOPBAR_H);
    g.fillStyle(0x3a2214, 0.55).fillRect(0, 0, W, TOPBAR_H * 0.45);
    g.fillStyle(0xffffff, 0.05).fillRect(0, 2, W, TOPBAR_H * 0.2);
    g.lineStyle(2, COLOR.gold, 0.9).lineBetween(0, TOPBAR_H, W, TOPBAR_H);
    g.lineStyle(1, COLOR.goldLight, 0.35).lineBetween(0, TOPBAR_H - 4, W, TOPBAR_H - 4);
    c.add(g);
    return c;
  }

  /** 联机：接上会话（拿第一帧、听房间消息）和每 250 毫秒的倒计时；单机返回 false */
  protected bindNet(): boolean {
    const net = this.net;
    if (!net) return false;
    net.begin();
    const off = net.on((kind, detail) => this.onNet(kind, detail));
    this.events.once('shutdown', off);
    // 这一手的倒计时（房间给的截止时间）、结算页等人
    this.time.addEvent({ delay: CLOCK_TICK_MS, loop: true, callback: () => this.updateClocks() });
    return true;
  }

  /**
   * atPass：对着"不要"按钮摆（"要不起，点 不要"），不压桌子中间刚出的牌和牌型标签；
   * 别的话在按钮行正中上方
   */
  setStatus(msg: string, warn = false, atPass = false): void {
    this.status.x = atPass ? this.btnPass.x : worldW(this) / 2;
    this.status.setText(msg);
    this.statusBg.clear();
    if (!msg) return;
    const w = this.status.width + STATUS_PILL.padX;
    this.statusBg.fillStyle(warn ? 0x8a1a20 : 0x1a120c, warn ? 0.92 : 0.7).fillRoundedRect(this.status.x - w / 2, this.status.y - STATUS_PILL.halfH, w, STATUS_PILL.h, STATUS_PILL.r);
    this.statusBg.lineStyle(1.5, warn ? 0xffb0a0 : COLOR.gold, 0.7).strokeRoundedRect(this.status.x - w / 2, this.status.y - STATUS_PILL.halfH, w, STATUS_PILL.h, STATUS_PILL.r);
  }

  /** 回自己的首页（箭头图标；小房子留给"回大厅"） */
  abstract onHome(): void;
  /** 回首页要先在牌桌上确认（实盘没打完、好友房在打、每日挑战打到一半）：竖屏提示层的"回首页"这时不直接走，确认框在被盖住的画布里 */
  abstract homeAsks(): boolean;
  /** 打开设置、规则面板（顶栏图标和快捷入口共用） */
  protected abstract showSettings(): void;
  protected abstract showRules(): void;

  /**
   * 顶栏右边那一组图标，掼蛋和斗地主共用，图标和顺序只在这里定：从右往左 回首页、设置、规则，
   * 云存档放最左（单独部署不摆）；声音不单放一个键，静音在设置里（和音量一起）。手机上最多 4 个。
   * extra 是玩法多的图标（斗地主残局的"重来"），插在规则和云存档之间，这时不摆云存档（残局不记战绩）。
   * leftLimit：图标组最左不越过的横坐标（掼蛋顶栏中间有两队的级）；返回图标的名字和对象（从右往左）以及最左的横坐标。
   */
  buildTopIcons(c: Phaser.GameObjects.Container, W: number, o: { leftLimit?: number; extra?: { icon: string; name: string; tip: string; fn: () => void }[] } = {}): { items: [string, Phaser.GameObjects.Container][]; left: number } {
    const extra = o.extra ?? [];
    const specs: { icon: string; name: string; tip: string; fn: () => void }[] = [
      // 回掼蛋自己的首页用箭头；小房子留给"回大厅"
      { icon: 'back', name: 'home', tip: '回首页', fn: () => this.onHome() },
      { icon: 'settings', name: 'settings', tip: '设置', fn: () => this.showSettings() },
      { icon: 'rules', name: 'rules', tip: '规则', fn: () => this.showRules() },
      ...extra,
    ];
    const cloudOn = !standalone() && extra.length === 0;
    const n = specs.length + (cloudOn ? 1 : 0);
    // 间距：有地方就拉到 44 CSS 像素（minHit），最少 56；最左一个的点按区域不越过 leftLimit
    const room = o.leftLimit === undefined ? Infinity : (W - (o.leftLimit + TOP_ICONS.leftGap)) / n;
    const pitch = Math.max(TOP_ICONS.pitchMin, Math.min(minHit(), room));
    // 最右一个的点按区不伸出屏幕右沿
    const right = W - Math.max(TOP_ICONS.edgeMin, pitch / 2);
    const deep = Math.max(TOP_ICONS.deepMin, minHit());
    const items: [string, Phaser.GameObjects.Container][] = specs.map((s, i) => {
      const b = iconButton(this, right - i * pitch, TOP_ICONS.y, s.icon, s.fn, TOP_ICONS.size, s.tip);
      setTopHit(b, pitch, deep);
      c.add(b);
      return [s.name, b];
    });
    this.cloudBtn = null;
    if (cloudOn) {
      this.cloudBtn = cloudButton(this, right - specs.length * pitch, TOP_ICONS.y, TOP_ICONS.size);
      setTopHit(this.cloudBtn, pitch, deep);
      c.add(this.cloudBtn);
      items.push(['cloud', this.cloudBtn]);
    }
    return { items, left: right - (n - 0.5) * pitch };
  }

  /**
   * 手机上顶栏"聊天"按钮的样式：kit 的按钮点按区至少 44 CSS 像素，而手机横屏顶栏只有 30 来个 CSS 像素高，
   * 整个画出来会伸到牌桌上。这里把 kit 的按钮改成"透明的 44 像素点按区 + 顶栏高度内的圆形图标"（点按区从屏幕上沿往下，和别的顶栏图标一样）。
   * 只在手机档生效；电脑上聊天是顶栏下的胶囊（chatDock），不走这个按钮。
   */
  chatTopStyle(): void {
    const id = 'gd-chat-top-style';
    const doc = document;
    let el = doc.getElementById(id) as HTMLStyleElement | null;
    if (!phoneType()) {
      el?.remove();
      return;
    }
    const f = this.worldRect(0, 0, 100, 100).width / 100; // 世界 → CSS 像素
    const vis = Math.max(TOP_ICONS.chat.minSize, Math.round((TOPBAR_H - TOP_ICONS.chat.inset) * f));
    const top = Math.round(Math.max(0, (TOPBAR_H * f - vis) / 2));
    const ico = Math.round(vis * TOP_ICONS.chat.iconRatio);
    const css = `.atf-ui .atf-btn[data-key="chat:button"]{background:transparent;border:0;padding:0;justify-content:flex-start;overflow:visible}`
      + `.atf-ui .atf-btn[data-key="chat:button"]>span{display:none}`
      + `.atf-ui .atf-btn[data-key="chat:button"]::before{content:'';position:absolute;left:50%;top:${top}px;width:${vis}px;height:${vis}px;margin-left:${-vis / 2}px;box-sizing:border-box;border-radius:50%;background:var(--ak-soft,#6b3f20);border:2px solid var(--ak-border,#d4a64a)}`
      + `.atf-ui .atf-btn[data-key="chat:button"]>svg{position:relative;width:${ico}px;height:${ico}px;margin-top:${top + Math.round((vis - ico) / 2)}px}`;
    if (!el) {
      el = doc.createElement('style');
      el.id = id;
      doc.head.appendChild(el);
      this.events.once('shutdown', () => doc.getElementById(id)?.remove());
    }
    if (el.textContent !== css) el.textContent = css;
  }

  // ───────────────────────── 坐标 ─────────────────────────

  /** 世界坐标的矩形 → 屏幕（CSS 像素）：画布的 CSS 矩形 × 世界到 CSS 的比例（相机 zoom 后画布高 = worldH） */
  worldRect(x: number, y: number, w: number, h: number): ScreenRect {
    const r = this.game.canvas.getBoundingClientRect();
    const f = r.height / GAME_HEIGHT;
    return { left: r.left + x * f, top: r.top + y * f, width: w * f, height: h * f };
  }

  /** 头像（世界坐标）在屏幕上的矩形 */
  screenRect(a: { ax: number; ay: number; size: number }): ScreenRect {
    return this.worldRect(a.ax - a.size / 2, a.ay - a.size / 2, a.size, a.size);
  }

  // ───────────────────────── 弹层 ─────────────────────────

  /** 开弹层：电脑停想、按钮锁上；子类在 onOverlayOpen 里收起自己的 DOM 图层（道具、表情会盖住 Phaser 画的弹窗） */
  openOverlay(kind: Overlay, m: Modal): void {
    this.overlay = kind;
    this.overlayModal = m;
    this.onOverlayOpen();
    this.cancelBot();
    this.refreshButtons();
  }

  protected onOverlayOpen(): void {}

  // ───────────────────────── 玩家操作 ─────────────────────────

  onSort(): void {
    this.hand.setMode(this.hand.mode === 'rank' ? 'type' : 'rank');
    this.refreshButtons();
  }

  onClear(): void {
    this.hand.setSelected([]);
    this.refreshButtons();
  }

  /** 出错时的提示（浮在操作按钮上方） */
  protected errorToast(msg: string): void {
    toast(this, msg, worldW(this) / 2, this.buttonY - ERROR_TOAST_DY, COLOR.redDark);
  }

  /** 子类拦一下不该动的操作（返回 false 就什么都不做） */
  protected actAllowed(_a: A): boolean {
    return true;
  }

  act(a: A): void {
    if (!this.actAllowed(a)) return;
    const r = this.ses.apply(a);
    if (r.sent) {
      // 联机：只是发出去了，结果随房间的下一帧到（onNet 里播）；按钮这时锁着
      this.lastError = null;
      this.refreshButtons();
      return;
    }
    if (r.error) {
      this.lastError = r.error;
      audio.sfx('error');
      this.errorToast(r.error);
      return;
    }
    this.lastError = null;
    void this.playEvents(r.events);
  }

  // ───────────────────────── 事件、电脑、联机 ─────────────────────────

  protected async playEvents(evs: E[]): Promise<void> {
    this.busy = true;
    this.refreshButtons();
    try {
      for (const e of evs) {
        if (!this.alive) return;
        await this.playEvent(e);
      }
    } finally {
      this.busy = false;
      // 第一批事件（发牌）播完了：后台接着烘表情、印章、特效（textures.ts，进牌桌时先停着不抢动画）
      releaseExtraBake();
    }
    if (!this.alive) return;
    this.sync(true);
    this.pump();
  }

  cancelBot(): void {
    this.botGen++;
    this.botWaiting = false;
    this.botTimer?.remove();
    this.botTimer = null;
    if (this.botSeat >= 0) this.seats[this.botSeat]?.setThinking(false);
    this.botSeat = -1;
  }

  /**
   * 电脑想一手：plan 在后台线程里算（view/common/bot-runner.ts，画面和按钮不等它），算回来后按 thinkMs 扣掉已经花掉的时间再出（act）。
   * 算的时候座位上照常显示"思考中"；中途 cancelBot（换副、弹层、联机重置）了，算回来的结果作废
   */
  protected runBot<A>(seat: number, plan: Promise<A | null>, thinkMs: (a: A) => number, act: (a: A) => void): void {
    const gen = ++this.botGen;
    const t0 = performance.now();
    this.botSeat = seat;
    this.botWaiting = true;
    if (!this.isMe(seat)) this.seats[seat]?.setThinking(true);
    void plan.then((a) => {
      if (gen !== this.botGen || !this.alive) return;
      this.botWaiting = false;
      if (!a) {
        this.cancelBot();
        return;
      }
      const left = Math.max(0, dur(thinkMs(a)) - (performance.now() - t0));
      this.botTimer = this.time.delayedCall(left, () => {
        this.botTimer = null;
        this.botSeat = -1;
        this.seats[seat]?.setThinking(false);
        if (!this.alive || this.busy || this.overlay !== null) return;
        act(a);
      });
    });
  }

  /** 联机：现在这一帧先别往下播（掼蛋：弹层开着时等它关） */
  protected holdNetFrame(): boolean {
    return false;
  }

  /** 联机：按顺序播放房间发来的帧。返回 true 表示这次在播（或等着播），pump 先别往下走。 */
  protected pumpNet(): boolean {
    const net = this.net;
    if (!net) return false;
    const f = net.queue[0];
    if (!f) return false;
    if (this.holdNetFrame()) return true;
    const prev = net.shown;
    const before = prev?.view.step ?? -1;
    net.take();
    if (f.nv.view.step <= before) {
      // 同一个牌局状态（有人入座、掉线……）：只刷新画面
      this.sync(true);
      this.time.delayedCall(0, () => this.pump());
      return true;
    }
    const play = (): void => void this.playEvents(f.nv.events);
    // 电脑连着出：和单机一样给点思考时间（房间给的间隔只说明这一帧是电脑出的）
    if (f.delay > 0) {
      this.botTimer = this.time.delayedCall(dur(this.frameThinkMs(f, prev)), () => {
        this.botTimer = null;
        play();
      });
    } else play();
    return true;
  }

  /** 好友房刚轮到我：后台时标题闪，前台时手机振一下；不轮到我了就停闪 */
  protected noticeNetTurn(): void {
    const t = this.net?.turnInfo();
    const mine = !!t && this.isMe(t.seat);
    if (mine && !this.myNetTurn) {
      if (document.hidden) flashTitle();
      else vibrate();
    } else if (!mine && this.myNetTurn) stopFlash();
    this.myNetTurn = mine;
  }

  /** 每 250 毫秒一次：谁在出手就在谁的头像上数秒；结算页刷新"等谁"；其余的交给子类（afterClocks） */
  protected updateClocks(): void {
    if (this.overlay === 'settle') this.refreshSettleWait();
    const t = this.net?.turnInfo() ?? null;
    const now = Date.now();
    this.seats.forEach((sv, i) => sv.setClock(t && t.seat === i && t.deadline !== null ? Math.max(0, Math.ceil((t.deadline - now) / 1000)) : null));
    this.afterClocks(t, now);
  }

  protected afterClocks(_t: { seat: number; deadline: number | null } | null, _now: number): void {}

  /** 好友房结算页：我点没点"继续"、还在等谁、几秒后自动开下一副 */
  refreshSettleWait(): void {
    const net = this.net;
    const t = this.settleWait;
    if (!net || !t?.active || this.overlay !== 'settle') return;
    const btn = this.overlayModal?.body.getData('next') as Button | undefined;
    const can = net.canReady();
    btn?.setVisible(can);
    const w = net.readyWait();
    const sec = w?.deadline ? Math.max(0, Math.ceil((w.deadline - Date.now()) / 1000)) : null;
    const left = sec === null ? '' : `${sec} 秒后自动开始`;
    const others = this.waitingOthers(w?.waiting ?? []);
    // 跟着按钮走：能点时在按钮下面，不能点时占按钮的位置
    const by = btn?.y ?? this.settleWaitAt.y;
    t.setY(can ? by + this.settleWaitAt.gap : by);
    if (can) t.setText(left);
    else if (others.length) t.setText(`等 ${others.map(seatName).join('、')} 点继续${left ? ` · ${left}` : ''}`);
    else t.setText('马上开下一副…');
  }

  /** 结算页那行字：看最新收到的一帧（结算页开着时帧不往下播，直接看队尾） */
  refreshNetStake(): void {
    const t = this.netStakeStatus;
    const net = this.net;
    if (!t?.scene || !net) return;
    const ns = net.queue[net.queue.length - 1]?.nv.stake ?? net.shown?.stake;
    const me = ns?.seats[MY_SEAT];
    // 旁观的人没有自己的账
    if (!ns || !me || this.watching) return;
    if (me.paid === 'yes') t.setText(me.out ? '已经带回钱包' : '正在带回钱包…');
    else if (me.paid === 'pending') t.setText('带入还没到账，到账后原样带回');
    else t.setText(roomWhy(ns.why ?? ''));
  }

  leaveRoom(): void {
    this.cancelBot();
    this.net?.leave();
    this.forgetNet();
    presenceNow();
    this.scene.start('title');
  }

  // ───────────────────────── 发牌动画 ─────────────────────────

  /** 发牌：牌背从 (x, y) 飞向每个对手的座位，一轮一轮 */
  dealToOthers(x: number, y: number): void {
    if (dur(1) === 0) return;
    const key = `back:${getSettings().back}`;
    const step = dur(PACE.deal.step) * 2;
    for (let k = 0; k < this.dealBackRounds; k++) {
      for (const sv of this.seats) {
        const angle = this.dealBackAngle(sv.seat);
        if (angle === null) continue;
        const to = sv.center;
        const img = this.add.image(x, y, key).setDisplaySize(DEAL_BACK.w, DEAL_BACK.h).setAngle(DEAL_FLY.angle).setDepth(DEAL_BACK.depth);
        this.tweens.add({
          targets: img,
          x: to.x,
          y: to.y,
          angle,
          scale: img.scale * DEAL_BACK.endScale,
          delay: k * step + sv.seat * dur(DEAL_BACK.seatDelayMs),
          duration: dur(DEAL_BACK.flyMs),
          ease: 'Cubic.easeOut',
          onComplete: () => img.destroy(),
        });
      }
    }
  }

  // ───────────────────────── 调试、重建 ─────────────────────────

  /** 现在重建画面会不会丢东西：动画、电脑在想、弹层（含教程、确认框）、选着牌，都要等 */
  canRebuild(): boolean {
    return !this.isBusy && this.overlay === null && this.hand.selected().length === 0;
  }

  /** 互动（kit 的 DOM）：屏幕坐标换回世界坐标，冒烟和别的控件一样点 */
  protected addFunControls(out: ControlMap): void {
    const cr = this.game.canvas.getBoundingClientRect();
    const f = GAME_HEIGHT / cr.height;
    for (const [k, c] of Object.entries(this.fun?.controls() ?? {})) out[k] = { x: (c.x - cr.left) * f, y: (c.y - cr.top) * f, enabled: true, visible: true };
  }
}
