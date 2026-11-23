import type Phaser from 'phaser';
import { chatView, dragonBoard, earningsView, friendView, ipoToday, type ChatView, type Comment, type DayReport, type DragonBoard, type GameState, type MessageJudge, type MessageView, type NewsItem, canShortNow, topBar } from '../../core/index.ts';
import type { Animator } from '../fx/anim.ts';
import type { Rect } from '../rect.ts';
import { sound } from '../sound.ts';
import { COLOR, FS, PHONE as PHONE_MODE } from '../theme.ts';
import { addImage, addPaper, addPill, addSlice, addTile } from '../ui/art.ts';
import type { Button } from '../ui/button.ts';
import type { Spark } from '../ui/spark.ts';
import { addText } from '../ui/text.ts';
import { PHONE_RECT as PHONE } from './layout.ts';
import { AFTER_CLOSE_MAX, AVATAR, BODY_H, BODY_Y, HEADER_H, BUBBLE_W, CW, CX, GAP, INTRO_MAX, JUDGE_MAX, REC_H, REC_H_FLAT, REC_H_MINI, SW, SX, bubbleLine, recShort, type MsgNode } from './chatConsts.ts';
import { addEarningsBanner, addIpoBanner, addSysPill, addWatch, addWeeklyBanner } from './chatBanners.ts';
import { addMessage, commentNode, tickerNode } from './chatBubbles.ts';
import { addFluff } from './chatFluffView.ts';
import { layoutRecs, addRec, recAction } from './chatRec.ts';
import { newsFold, toggleNews } from './chatNews.ts';

export { recAction } from './chatRec.ts';

/**
 * 右栏手机群聊：消息气泡（头像、名字、战绩、台词、题材方向）、今日推荐卡（小人、理由、买入）、
 * 收盘后在消息上标出说中 / 说错，群友吐槽冒出来。
 */
export class ChatView3 {
  readonly scene: Phaser.Scene;
  readonly content: Phaser.GameObjects.Container;
  readonly title: Phaser.GameObjects.Text;
  readonly idle: boolean;
  readonly onBuy: (rec: number) => void;
  msgs: MsgNode[] = [];
  recNodes: Phaser.GameObjects.Container[] = [];
  buttons: (Button | null)[] = [];
  shortButtons: (Button | null)[] = [];
  /** 点了推荐卡上的"押跌" */
  onShort: ((rec: number) => void) | null = null;
  recRects: Rect[] = [];
  /** 推荐卡上的 5 天走势（卡片冒出来时从左往右画） */
  recSparks = new Map<Phaser.GameObjects.Container, Spark>();
  /** 填空白的热闹元素（贴纸、互相回复、撤回、拍一拍） */
  fluffNodes: { node: Phaser.GameObjects.Container; pop: Phaser.GameObjects.Image | null }[] = [];
  /** 收盘揭晓后的状态（judge 传进来），收盘后的热闹元素按它定调 */
  closeState: GameState | null = null;
  cursor = 0;
  state: GameState;
  /** 盘前之外（结算、月底）显示的系统提示 */
  extra: string[] = [];
  /** 手机横屏：推荐卡单独一页；底框（纸面、底纹）单独装着，切到「风口」页时整块藏起来 */
  readonly recLayer: Phaser.GameObjects.Container;
  readonly frame: Phaser.GameObjects.Container | null;
  view: 'msgs' | 'recs' | null = 'msgs';

  /** 手机标签页：显示群聊消息、推荐卡，或整块藏起来（null，看「风口」时）。电脑上不用。 */
  setPhoneView(v: 'msgs' | 'recs' | null): void {
    if (!PHONE_MODE) return;
    this.view = v;
    this.frame?.setVisible(v !== null);
    this.content.setVisible(v === 'msgs');
    this.recLayer.setVisible(v === 'recs');
  }

  get phoneView(): 'msgs' | 'recs' | null {
    return this.view;
  }

  /** 手机群聊页里带推荐、点一下就能买的消息位置（自动化点击用）。 */
  recBuy: { index: number; x: number; y: number }[] = [];
  /** 手机：消息序号 → 点这条消息能买的推荐（同一位群友、同一个风口、看涨；能不能买和推荐卡「买入」同一个判断），没有就不挂「买 ›」 */
  msgBuy = new Map<number, number>();

  get recBuyCenters(): readonly { index: number; x: number; y: number }[] {
    return this.recBuy;
  }

  /** 今天能买的推荐有几条（手机标签页上的小红点）。 */
  get recCount(): number {
    return this.buttons.filter((b) => !!b && b.active && b.usable).length;
  }

  constructor(scene: Phaser.Scene, s: GameState, idle: boolean, onBuy: (rec: number) => void) {
    this.scene = scene;
    this.state = s;
    this.idle = idle;
    this.onBuy = onBuy;
    const before = scene.children.list.length;
    if (PHONE_MODE) {
      addPaper(scene, PHONE.x, PHONE.y, PHONE.w, PHONE.h);
      scene.add.rectangle(SX, BODY_Y, SW, BODY_H, 0xfdf3e3).setOrigin(0, 0).setRounded(8);
      addTile(scene, SX, BODY_Y, SW, BODY_H, 'chat:chat_bg_tile', 0.7);
    } else {
      addSlice(scene, PHONE.x, PHONE.y, PHONE.w, PHONE.h, 'phone_frame');
      scene.add.rectangle(SX, BODY_Y, SW, BODY_H, 0xfdf3e3).setOrigin(0, 0);
      addTile(scene, SX, BODY_Y, SW, BODY_H, 'chat:chat_bg_tile', 0.7);
      addSlice(scene, SX, PHONE.y + 14, SW, HEADER_H, 'chat_header');
      addImage(scene, PHONE.x + PHONE.w / 2, PHONE.y + 22, 'chat:phone_notch', 96, 22);
    }
    this.title = addText(scene, PHONE.x + PHONE.w / 2, PHONE.y + 14 + HEADER_H / 2 + 6, '', { size: 15, bold: true, originX: 0.5, originY: 0.5 }).setVisible(!PHONE_MODE);
    // 底框先装进容器（排在消息、推荐卡下面）
    this.frame = PHONE_MODE ? scene.add.container(0, 0, scene.children.list.slice(before)) : null;
    this.content = scene.add.container(0, 0);
    this.recLayer = scene.add.container(0, 0);
    // 不在这里先画一遍：场景建完马上整页 render（带上提示条），群聊是最贵的一块，开局时画两遍白费
  }

  /**
   * 增量更新：上一次整块重建时消息侧的输入（见 keyOf）。同一天里买卖、加自选只改推荐卡，
   * 这时只重建推荐卡，消息、横条、新闻、热闹元素原样留着（每次整块重建约 150 个文字对象）。
   * 收盘盖章、吐槽、系统提示这些往群聊里加东西的方法会把它清掉，下次整块重建。
   */
  private lastKey: string | null = null;
  /** 推荐卡从哪一行排起、最矮能压到多高（增量重建推荐卡时照原位排） */
  private recsY = 0;
  private minRecH = REC_H_MINI;

  /** 消息侧的输入：这些都没变，版面（消息字号、推荐卡高度、各横条位置）就和上次一样。手机上消息气泡带「买 ›」，哪些推荐还能买也算。 */
  private keyOf(s: GameState, v: ChatView, notes: readonly string[]): string {
    const tb = topBar(s);
    return JSON.stringify([s.dayIndex, s.phase, s.month, notes, s.friends.length, tb.weekly?.rule ?? null, tb.flash?.day ?? null, ipoToday(s)?.stockId ?? null, earningsView(s)?.stage ?? null, s.watch ?? null, s.lastDay?.day ?? null, canShortNow(s), v.recs.length, v.messages, PHONE_MODE ? [...msgBuyOf(s, v)] : null]);
  }

  /** 按状态重建当天的群聊（无动画）；同一天只有推荐卡变了时只重建推荐卡。 */
  render(s: GameState, notes: string[] = []): void {
    const v = chatView(s);
    const key = s.phase === 'premarket' ? this.keyOf(s, v, notes) : null;
    if (key !== null && key === this.lastKey) {
      this.state = s;
      this.renderRecs(s, v);
      return;
    }
    this.lastKey = key;
    this.state = s;
    this.extra = notes;
    this.title.setText(`韭菜交流群（${s.friends.length}）`);
    this.content.removeAll(true);
    this.recLayer.removeAll(true);
    this.newsRect = null;
    this.newsOpen = null;
    this.newsOpenRect = null;
    this.newsList = [];
    this.newsBoard = null;
    this.msgs = [];
    this.recBuy = [];
    this.msgBuy = PHONE_MODE && s.phase === 'premarket' ? msgBuyOf(s, v) : new Map();
    this.recNodes = [];
    this.buttons = [];
    this.shortButtons = [];
    this.recRects = [];
    this.recSparks.clear();
    this.fluffNodes = [];
    this.closeState = null;
    this.layout(s, v);
  }

  /** 只重建推荐卡（电脑在消息下面原位，手机在推荐页）。 */
  private renderRecs(s: GameState, v: ChatView): void {
    for (const n of this.recNodes) n.destroy();
    this.recLayer.removeAll(true);
    this.recNodes = [];
    this.buttons = [];
    this.shortButtons = [];
    this.recRects = [];
    this.recSparks.clear();
    let y = this.recsY;
    if (!PHONE_MODE) for (const r of v.recs) y = addRec(this, s, r, y, this.recHeight) + GAP;
    else layoutRecs(this, s, v.recs, this.minRecH);
    if (this.newsOpen) this.content.bringToTop(this.newsOpen);
  }

  private layout(s: GameState, v: ChatView): void {
    let y = BODY_Y + 8;
    const tb = topBar(s);
    const tf = tb.flash;
    const pill = s.phase === 'premarket' ? (tf ? `第 ${tf.day}/${tf.days} 天 · 盘前` : `${s.month}月 ${s.dayInMonth + 1}日 · 盘前`) : tf ? (tb.weekly ? '本周市场' : '闪电盘') : '月底算账';
    for (const note of [pill, ...this.extra]) y = addSysPill(this, note, y) + 4;
    // 本周市场：这一周的规则一直挂在群聊最上面（反向群聊必须让人一眼看到，不能以为是 bug）
    if (tb.weekly) y = addWeeklyBanner(this, tb.weekly, y) + 4;
    // 打新：申购日盘前，群聊最上面一条「打新」横条，点一下开申购面板
    this.ipoRect = null;
    const ipo = s.phase === 'premarket' ? ipoToday(s) : null;
    if (ipo) y = addIpoBanner(this, s, ipo, y) + 4;
    // 财报周：预告到揭晓，挂在打新下面
    const earn = earningsView(s);
    if (earn) y = addEarningsBanner(this, earn, y) + 4;
    // 前几天发的、还没揭晓的多日消息（到揭晓那天收盘时盖章）
    this.watchNodes = [];
    this.watchPills = [];
    const yBeforeWatch = y;
    if (s.phase === 'premarket') y = addWatch(this, s, y);
    if (v.messages.length === 0 && s.phase === 'premarket') y = addSysPill(this, '今天群里没人说话', y) + 4;
    // 先估算总高度，当天消息必须完整显示：放不下时依次 消息改小字号 → 推荐卡压扁 → 两样都用；
    // 还放不下（极少见）才略去最早的几条，并写明略了几条
    const premarket = s.phase === 'premarket';
    // 手机横屏：推荐卡在另一页，这一页只排消息
    const allRecs = premarket ? v.recs : [];
    const recs = PHONE_MODE ? [] : allRecs;
    // 能押跌时推荐卡右边要竖排两颗按钮，最矮一档（56）放不下（押跌按钮会掉出卡外），最矮只压到扁卡（68）
    const minRecH = canShortNow(s) ? REC_H_FLAT : REC_H_MINI;
    const tries: [number, number, boolean?][] = (
      [
        [13, REC_H],
        [12, REC_H],
        [13, REC_H_FLAT],
        [12, REC_H_FLAT],
        [11, REC_H_FLAT],
        [11, REC_H_MINI],
        // 手机上字号不能再降（MIN_TEXT_SIZE），上面几档的消息高度其实一样；最后一档收紧行距，当天消息宁可挤一点也要全显示
        [11, minRecH, true],
      ] as [number, number, boolean?][]
    ).filter(([, rh]) => rh >= minRecH);
    let room = BODY_Y + BODY_H - y;
    // 当天消息优先：等揭晓的多日消息一行一条放不下时，收成一个小签（详情在群友卡和揭晓时的盖章里）
    if (premarket && this.watchNodes.length > 0 && this.estimate(v.messages, recs.length, 11, minRecH) > room) {
      for (const w of this.watchNodes) w.node.destroy();
      for (const n of this.watchPills) n.destroy();
      this.watchNodes = [];
      this.watchPills = [];
      const pending = (s.watch ?? []).filter((w) => w.day < s.today.day).length;
      y = addSysPill(this, `${pending} 条消息等揭晓`, yBeforeWatch) + 4;
      room = BODY_Y + BODY_H - y;
    }
    // 昨天收盘的新闻放在最上面（解释昨天各风口为什么动）；地方不够时它先让位，今天的消息优先
    const news = premarket ? (s.lastDay?.news ?? []) : [];
    // 龙虎榜跟昨日新闻折在一起（折着露出领涨的一只）
    const board = premarket ? dragonBoard(s) : null;
    let paper = news.length > 0 || board ? newsFold(this, news, '昨日新闻', board) : null;
    const fitIn = (r: number): [number, number, boolean?] | undefined => tries.find(([size, rh, tight]) => this.estimate(v.messages, recs.length, size, rh, tight) <= r);
    let fit = paper ? fitIn(room - paper.h - GAP) : undefined;
    if (paper && !fit) {
      paper.node.destroy();
      paper = null;
      this.newsRect = null;
    }
    if (paper) {
      paper.node.setY(y).setVisible(true);
      this.content.add(paper.node);
      this.newsRect = { x: CX, y, w: CW, h: paper.h };
      y += paper.h + GAP;
    } else fit = fitIn(room);
    const [size, recH, tight] = fit ?? [11, minRecH, true];
    this.tight = tight === true;
    let messages = v.messages;
    if (!fit) while (messages.length > 0 && this.estimate(messages, recs.length, size, recH, tight) > BODY_Y + BODY_H - y - 26) messages = messages.slice(1);
    if (messages.length < v.messages.length) y = addSysPill(this, `+${v.messages.length - messages.length} 条更早`, y) + 4;
    this.recHeight = recH;
    for (const m of messages) y = addMessage(this, m, y, size) + this.gap;
    if (premarket) {
      // 消息和推荐卡都排下以后，剩下的空白用群友的贴纸、互相回复、撤回、拍一拍填上（纯装饰）
      const recsH = recs.length > 0 ? 2 + recs.length * (recH + GAP) : 0;
      y = addFluff(this, s, y, BODY_Y + BODY_H - 4 - recsH, 'pre', messages.map((m) => ({ friendId: m.friend.id, text: m.text }))).y;
      if (recs.length > 0) y += 2;
      this.recsY = y;
      this.minRecH = minRecH;
      for (const r of recs) y = addRec(this, s, r, y, recH) + GAP;
      if (PHONE_MODE) layoutRecs(this, s, allRecs, minRecH);
    } else {
      // 月底算账等时候群里也不冷场
      y = addFluff(this, s, y, BODY_Y + BODY_H - 6, 'month', messages.map((m) => ({ friendId: m.friend.id, text: m.text }))).y;
    }
    this.cursor = y;
  }


  /** 多日消息区里的"+N 条待揭晓"小签（收起时一起删掉）。 */
  watchPills: Phaser.GameObjects.GameObject[] = [];
  /** 当前推荐卡高度（自动化检查用）。 */
  recHeight = REC_H;
  /** 当天消息里实际显示了几条。 */
  get shownMessages(): number {
    return this.msgs.length;
  }

  /** 紧凑行距（消息多到放不下时用）：名字行、气泡内边距、条间距都收一点。 */
  tight = false;
  get gap(): number {
    return this.tight ? 2 : GAP;
  }
  get head(): number {
    return this.tight ? 15 : 18;
  }
  get pad(): number {
    return this.tight ? 6 : 12;
  }

  /** 气泡文字的高度（键 = 字号 + 文字）：估高度要按好几档字号各试一遍，每试一次都新建一个文字对象（画一遍、传一张纹理），同一条消息只量一次 */
  private textH = new Map<string, number>();
  /** 量气泡高度用的不显示文字，按字号各一个 */
  private readonly meters = new Map<number, Phaser.GameObjects.Text>();

  private bubbleTextH(text: string, size: number): number {
    const line = bubbleLine(text, size);
    const k = `${size}\u0000${line}`;
    let h = this.textH.get(k);
    if (h === undefined) {
      if (this.textH.size > 400) this.textH.clear();
      // 复用一个不显示的量高文字：每条新消息新建再销毁一个文字对象，就要多建、多传一张纹理
      let meter = this.meters.get(size);
      if (!meter?.active) {
        meter = addText(this.scene, 0, 0, '', { size, wrap: BUBBLE_W - 20, lineSpacing: 2 }).setVisible(false);
        this.meters.set(size, meter);
      }
      h = meter.setText(line).height;
      this.textH.set(k, h);
    }
    return h;
  }

  private estimate(messages: readonly MessageView[], recs: number, size: number, recH: number, tight = false): number {
    const head = tight ? 15 : 18;
    const pad = tight ? 6 : 12;
    const gap = tight ? 2 : GAP;
    let h = 0;
    // 拐点消息的标签可能放进气泡第一行，按最坏情况多算 18
    for (const m of messages) h += head + this.bubbleTextH(m.text, size) + pad + gap + (m.turn ? 18 : 0);
    return h + recs * (recH + GAP) + (recs > 0 ? 6 : 0);
  }


  /** 点了「打新」横条（场景接着开申购面板）。 */
  onIpo: (() => void) | null = null;
  ipoRect: Rect | null = null;

  /** 横条的位置（自动化、截图用）；没有打新时为 null。 */
  get ipoBannerRect(): Rect | null {
    return this.ipoRect;
  }









  /** 先把当天的消息藏起来（月份开场时），随后由 intro 依次冒出。 */
  hideAll(): void {
    for (const n of [...this.msgs.map((m) => m.root), ...this.fluffNodes.map((f) => f.node), ...this.recNodes]) n.setAlpha(0);
  }

  /** 盘前：消息与推荐依次冒出来（每条一声「叮」）。 */
  async intro(anim: Animator, gap = 160): Promise<void> {
    const fluff = new Map(this.fluffNodes.map((f) => [f.node, f.pop]));
    const nodes: Phaser.GameObjects.Container[] = [...this.msgs.map((m) => m.root), ...this.fluffNodes.map((f) => f.node), ...this.recNodes];
    if (anim.instant) {
      for (const n of nodes) n.setAlpha(1).setY(0);
      return;
    }
    // 总时长不变：按「消息 + 推荐卡」条数算的时间，均摊给多出来的热闹元素
    const base = nodes.length - fluff.size;
    // 条数多时按总时长封顶（INTRO_MAX），不让盘前冒消息拖住开盘键
    const step = Math.min(base > 0 && fluff.size > 0 ? (gap * base) / nodes.length : gap, INTRO_MAX / Math.max(1, nodes.length));
    for (const n of nodes) n.setAlpha(0);
    let i = 0;
    for (const n of nodes) {
      if (!n.active) continue;
      if (!fluff.has(n)) sound.cue({ type: 'chat', index: i });
      n.setAlpha(1);
      if (!anim.calm) {
        n.y = 10;
        anim.fx({ targets: n, y: 0, duration: 180, ease: 'Back.easeOut' }, () => n.setY(0));
        // 贴纸弹一下
        const pop = fluff.get(n);
        if (pop) {
          const sx = pop.scaleX;
          const sy = pop.scaleY;
          pop.setScale(sx * 0.3, sy * 0.3);
          anim.fx({ targets: pop, scaleX: sx, scaleY: sy, duration: 320, ease: 'Back.easeOut' }, () => pop.setScale(sx, sy));
        }
      }
      this.recSparks.get(n)?.play(420, anim.calm);
      i += 1;
      await anim.wait(step);
    }
    for (const n of nodes) if (n.active) n.setAlpha(1).setY(0);
  }

  /** 收盘后：消息逐条标出说中 / 说错。 */
  async judge(anim: Animator, judges: MessageJudge[], gap = 90, next: GameState | null = null): Promise<void> {
    this.lastKey = null;
    gap = Math.min(gap, JUDGE_MAX / Math.max(1, judges.length));
    if (next) {
      this.refreshRecords(next);
      this.closeState = next;
    }
    for (const j of judges) {
      const m = this.msgs.find((x) => x.index === j.index);
      if (!m) continue;
      const label = j.hit ? '说对了' : '说错了';
      const t = addText(this.scene, 0, 0, label, { size: FS.xs, bold: true, color: COLOR.white, originX: 0.5, originY: 0.5 });
      const w = t.width + 10;
      const pill = addPill(this.scene, -w / 2, -8, w, 16, j.hit ? COLOR.accent : 0x8d7b84);
      // 盖在头像下半截（不压消息文字）
      const stamp = this.scene.add.container(CX + AVATAR / 2, m.top + AVATAR - 4, [pill, t]).setAngle(-8);
      m.root.add(stamp);
      sound.cue({ type: 'judge', hit: j.hit });
      if (!anim.calm) {
        stamp.setScale(1.8);
        anim.fx({ targets: stamp, scale: 1, duration: 160, ease: 'Quad.easeIn' }, () => stamp.setScale(1));
      }
      await anim.wait(gap);
    }
  }

  /** 名字旁边的战绩换成规则层最新的（收盘揭晓之后）。 */
  refreshRecords(next: GameState): void {
    for (const m of this.msgs) {
      if (!m.rec.active || !next.friends.some((f) => f.id === m.friendId)) continue;
      m.rec.setText(recShort(friendView(next, m.friendId).record));
    }
  }

  /** 等揭晓的多日消息（按发出那天 + 下标认） */
  watchNodes: { day: number; index: number; node: Phaser.GameObjects.Container; w: number }[] = [];


  /** 多日消息到期揭晓——在那一行盖「说对了 / 翻车了」。 */
  async judgeIntel(anim: Animator, judges: MessageJudge[], gap = 90): Promise<void> {
    this.lastKey = null;
    gap = Math.min(gap, JUDGE_MAX / Math.max(1, judges.length));
    for (const j of judges) {
      const w = this.watchNodes.find((x) => x.day === j.day && x.index === j.index);
      if (!w?.node.active) continue;
      const t = addText(this.scene, 0, 0, j.hit ? '说对了' : '翻车了', { size: FS.xs, bold: true, color: COLOR.white, originX: 0.5, originY: 0.5 });
      const pw = t.width + 10;
      const pill = addPill(this.scene, -pw / 2, -8, pw, 16, j.hit ? COLOR.accent : 0x8d7b84);
      const st = this.scene.add.container(w.w - 36, 11, [pill, t]).setAngle(-6);
      // 盖住「今天收盘揭晓」那几个字
      const cover = this.scene.add.rectangle(w.w - 74, 2, 72, 18, 0xfff3d6).setOrigin(0, 0);
      w.node.add([cover, st]);
      sound.cue({ type: 'judge', hit: j.hit });
      if (!anim.calm) {
        st.setScale(1.8);
        anim.fx({ targets: st, scale: 1, duration: 160, ease: 'Quad.easeIn' }, () => st.setScale(1));
      }
      await anim.wait(gap);
    }
  }

  /** 收盘后：推荐卡收起，群友吐槽冒出来。 */
  /**
   * 收盘后：群友吐槽，然后是「今日新闻」（F2，只解释今天已经发生的热度变化）。
   * 推荐卡收起；位置不够时把最早的几条消息收起来（写明收起了几条），保证吐槽和新闻完整显示。
   */
  async afterClose(anim: Animator, list: Comment[], news: NewsItem[], gap = 260, ticker: string[] = [], report: DayReport | null = null): Promise<void> {
    this.lastKey = null;
    for (const n of this.recNodes) n.destroy();
    this.recNodes = [];
    this.recSparks.clear();
    // 盘前的热闹元素夹在消息和推荐卡之间，收盘后让位给吐槽和新闻（最后有空再按今天的行情补几条）
    for (const f of this.fluffNodes) f.node.destroy();
    this.fluffNodes = [];
    this.buttons = [];
    this.shortButtons = [];
    // 先量高度：吐槽按文字量，新闻卡先画好（没有跟位置相关的提示，挪过去就行）
    const commentH = list.map((c) => {
      const t = addText(this.scene, 0, 0, bubbleLine(c.text, 13), { size: 13, wrap: BUBBLE_W - 20, lineSpacing: 2 });
      const h = 18 + t.height + 12;
      t.destroy();
      return h;
    });
    const board = report ? dragonBoard(this.state, report) : null;
    const paper = news.length > 0 || board ? newsFold(this, news, '今日新闻', board) : null;
    // 盘中播报（识别出的连续涨停、没封住、过山车异动），最多 2 条
    const tick = ticker.slice(0, 2).map((text) => tickerNode(this, text));
    const need = commentH.reduce((n, h) => n + h + GAP, 0) + (paper ? paper.h + GAP : 0) + tick.reduce((n, t) => n + t.h + GAP, 0);
    this.makeRoom(need);
    let y = this.msgs.length > 0 ? this.cursorAfterMessages() : this.cursor;
    const items: { node: Phaser.GameObjects.Container; h: number; cue: number }[] = [];
    for (const t of tick) {
      t.node.setY(y);
      items.push({ ...t, cue: 2 });
      y += t.h + GAP;
    }
    list.forEach((c, i) => {
      const n = commentNode(this, c, y);
      y += n.h + GAP;
      items.push({ ...n, cue: i + 3 });
    });
    this.newsRect = null;
    if (paper) {
      paper.node.setY(y);
      this.newsRect = { x: CX, y, w: CW, h: paper.h };
      items.push({ ...paper, cue: 6 });
      y += paper.h + GAP;
    }
    const base = items.length;
    const pops = new Map<Phaser.GameObjects.Container, Phaser.GameObjects.Image | null>();
    if (this.closeState) {
      const said = list.map((c) => ({ friendId: c.friendId, text: c.text }));
      const got = addFluff(this, this.closeState, y, BODY_Y + BODY_H - 6, 'close', said);
      for (const f of got.nodes) {
        f.node.setVisible(false);
        pops.set(f.node, f.pop);
        items.push({ node: f.node, h: 0, cue: -1 });
      }
      y = got.y;
    }
    // 总时长不变：多出来的热闹元素均摊同一段间隔
    // 条数多时按总时长封顶（AFTER_CLOSE_MAX）
    const step = Math.min(pops.size === 0 ? gap : base > 0 ? (gap * base) / items.length : 0, AFTER_CLOSE_MAX / Math.max(1, items.length));
    for (const { node, cue } of items) {
      node.setVisible(true);
      this.content.add(node);
      if (cue >= 0) sound.cue({ type: 'chat', index: cue });
      const pop = pops.get(node);
      if (pop && !anim.calm && !anim.instant) {
        const sx = pop.scaleX;
        const sy = pop.scaleY;
        pop.setScale(sx * 0.3, sy * 0.3);
        anim.fx({ targets: pop, scaleX: sx, scaleY: sy, duration: 320, ease: 'Back.easeOut' }, () => pop.setScale(sx, sy));
      }
      if (!anim.calm && !anim.instant) {
        const to = node.y;
        node.setAlpha(0).setY(to + 10);
        anim.fx({ targets: node, alpha: 1, y: to, duration: 200, ease: 'Back.easeOut' }, () => node.setAlpha(1).setY(to));
      }
      if (step > 0) await anim.wait(step);
    }
    this.cursor = y;
  }





  newsList: NewsItem[] = [];
  newsBoard: DragonBoard | null = null;
  newsHeading = '';
  newsMore: Phaser.GameObjects.Text | null = null;
  newsOpen: Phaser.GameObjects.Container | null = null;


  /** 展开 / 收起新闻（自动化也用）；没有新闻时什么都不做。 */
  toggleNews(): void {
    toggleNews(this);
  }

  get newsExpanded(): boolean {
    return this.newsOpen?.active ?? false;
  }

  newsOpenRect: Rect | null = null;

  /** 折叠条的中心（自动化点击用）。 */
  newsCenter(): { x: number; y: number } | null {
    // 手机上群聊页没打开时点不到它
    const r = this.view === 'msgs' ? this.newsRect : null;
    return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : null;
  }


  /** 最近一次收盘显示了几条新闻、新闻卡的位置（自动化检查用；重画群聊后清空）。 */
  newsShown = 0;
  newsRect: Rect | null = null;

  /** 位置不够放 need 高度时，收起最早的消息（其余往上挪），并在顶上写明收起了几条。 */
  private makeRoom(need: number): void {
    this.lastKey = null;
    const bottom = BODY_Y + BODY_H - 6;
    let folded = 0;
    while (this.msgs.length > 1 && this.cursorAfterMessages() + need > bottom) {
      const first = this.msgs.shift()!;
      const next = this.msgs[0]!;
      const dy = next.top - first.top;
      first.root.destroy();
      folded += 1;
      for (const m of this.msgs) {
        m.root.setY(m.root.y - dy);
        m.top -= dy;
        m.bubble = { ...m.bubble, y: m.bubble.y - dy };
      }
    }
    if (folded > 0) {
      const at = this.msgs[0]?.top ?? this.cursor;
      const t = addText(this.scene, SX + SW / 2, at - 13, `（前面 ${folded} 条消息收起来了）`, { size: FS.xs, color: COLOR.dim, originX: 0.5, originY: 0.5 });
      this.content.add(t);
    }
  }

  private cursorAfterMessages(): number {
    const last = this.msgs[this.msgs.length - 1];
    return last ? last.bubble.y + last.bubble.h + GAP + 4 : BODY_Y + 40;
  }

  /** 追加一条系统提示（新群友入群等）。 */
  note(text: string): void {
    this.lastKey = null;
    this.cursor = addSysPill(this, text, this.cursor) + 4;
  }

  /** 收盘动画中：横条点不了（和推荐按钮一样锁住） */
  locked = false;

  setLocked(locked: boolean): void {
    this.locked = locked;
    for (const b of [...this.buttons, ...this.shortButtons]) b?.setLocked(locked);
  }

  pressBuy(i: number): boolean {
    return this.buttons[i]?.press() ?? false;
  }

  controls(): Record<string, { x: number; y: number }> {
    const out: Record<string, { x: number; y: number }> = {};
    this.buttons.forEach((b, i) => {
      if (b?.isEnabled()) out[`buy:${i}`] = b.center();
    });
    this.shortButtons.forEach((b, i) => {
      if (b?.isEnabled() && b.active) out[`short:${i}`] = b.center();
    });
    // 打新横条在群聊页上；手机上切到推荐页时它不在屏幕上
    if (this.ipoRect && this.view === 'msgs' && !this.locked) out.ipo = { x: this.ipoRect.x + this.ipoRect.w / 2, y: this.ipoRect.y + this.ipoRect.h / 2 };
    return out;
  }

  recRect(i: number): Rect | null {
    return this.recRects[i] ?? null;
  }

  /** 当天消息所在的区域（教程用）；没有消息时为 null。 */
  /** 每条显示出来的消息气泡（自动化检查消息没被挤掉）：键为消息序号。 */
  messageRects(): Record<number, Rect> {
    const out: Record<number, Rect> = {};
    for (const m of this.msgs) out[m.index] = { ...m.bubble };
    return out;
  }

  messagesRect(): Rect | null {
    const first = this.msgs[0];
    const last = this.msgs[this.msgs.length - 1];
    if (!first || !last) return null;
    const top = first.bubble.y - 20;
    return { x: CX, y: top, w: CW, h: last.bubble.y + last.bubble.h - top };
  }

  /** 推荐卡所在的区域（教程用）。 */
  recsRect(): Rect | null {
    const rs = this.recRects.filter(Boolean);
    const first = rs[0];
    const last = rs[rs.length - 1];
    if (!first || !last) return null;
    return { x: first.x, y: first.y, w: first.w, h: last.y + last.h - first.y };
  }

  /** 此刻能点的按钮区域。 */
  buttonRects(): Rect[] {
    return [...this.buttons, ...this.shortButtons].filter((b): b is Button => !!b && b.active && b.isEnabled()).map((b) => b.rect());
  }

  rect(): Rect {
    return { ...PHONE };
  }
}

/** 每位群友今天点消息能买的那条推荐（只认还能买或能换仓的）。 */
function msgBuyOf(s: GameState, v: ChatView): Map<number, number> {
  const out = new Map<number, number>();
  // 推荐和消息在规则里各挑各的：先挂同一风口看涨的那条，没有就挂这位群友不唱空的一条；唱空的消息不挂「买」（前后矛盾，Gemini 界面审查第 3 条）
  const said = (m: MessageView): MessageView['claim'] => m.readAs ?? m.claim;
  for (const r of v.recs) {
    if (!r.friend || r.short || recAction(s, r).action === null) continue;
    const mine = v.messages.filter((m) => m.friend.id === r.friend?.id && !out.has(m.index) && said(m) !== 'down');
    const m = mine.find((x) => x.theme === r.stock.theme && said(x) === 'up') ?? mine[0];
    if (m) out.set(m.index, r.index);
  }
  return out;
}
