import type Phaser from 'phaser';
import { BALANCE, faceOf, holdingBase, holdingCards, isBusy, topBar, type Face, type GameState, type HoldingCard } from '../../core/index.ts';
import type { Animator } from '../fx/anim.ts';
import { flashBox, floatText, pop, shake } from '../fx/effects.ts';
import { flameBurst, iceBurst } from '../fx/particles.ts';
import { stamp, type FlipTone } from './tempoFx.ts';
import { buysText } from '../labels.ts';
import type { Rect } from '../rect.ts';
import { COLOR, FS, PHONE, PORTRAIT, TYPE, signColor } from '../theme.ts';
import { addText, fitWidth } from '../ui/text.ts';
import { pctArrow } from '../labels.ts';
import { bindTooltip } from '../ui/tooltip.ts';
import { COMPACT_SLOTS, SLOTS, slotRects } from './layout.ts';
import { unitPips } from './ext.ts';
import { positionsView, formatMoney, freeUnits } from '../../core/index.ts';
import { moneyShort } from '../ui/dialog.ts';
import { addGlyph } from '../ui/art.ts';
import { LOWBUY_ITEMS, dashedBox, frozenKeyOf, frozenOf, newTagOf, type PickMode, type SlotExt } from './holdingsShared.ts';
import { SlotCard } from './slotCard.ts';
export type { FrozenInfo, PickMode } from './holdingsShared.ts';
export { frozenOf } from './holdingsShared.ts';
const SLOTS_TOP = SLOTS.y;

/** 中间持仓格：4–5 张股票小人卡，空格显示「现金」。 */
export class HoldingsView {
  private readonly scene: Phaser.Scene;
  private cards: SlotCard[] = [];
  private readonly idle: boolean;
  private readonly onSell: (slot: number) => void;
  private pickMode: PickMode | null = null;
  private highlight: Phaser.GameObjects.Graphics;
  private state: GameState;

  /** 点了某格的小人（看拆解条） */
  onInspect: ((slot: number) => void) | null = null;
  /** 点了「加减」小按钮（加仓 / 减一半菜单） */
  onMore: ((slot: number) => void) | null = null;
  /** 在某张持仓卡上点了右键 */
  onMenu: ((slot: number) => void) | null = null;

  constructor(scene: Phaser.Scene, s: GameState, idle: boolean, onSell: (slot: number) => void) {
    this.scene = scene;
    this.idle = idle;
    this.onSell = onSell;
    this.state = s;
    this.highlight = scene.add.graphics().setDepth(5);
    this.render(s);
  }

  /** 收盘动画开始：卡上改口说「今天」。 */
  setDayWord(w: '今天' | '昨天'): void {
    for (const c of this.cards) if (c) c.dayWord = w;
  }

  /** 按状态刷新：换了股票的格子重建，同一只原地更新。 */
  render(s: GameState): void {
    this.state = s;
    // 「冷时买的」只在手里有在意这一点的道具时才标，否则只是噪音
    const careLow = topBar(s).items.some((it) => LOWBUY_ITEMS.includes(it.id));
    // 申购中的格子先当空的交给规则层的持仓查询（它们的股票还不在 s.stocks 里），下面再按格子画「申购中」卡
    const frozen = s.slots.map((_, i) => frozenOf(s, i));
    const cardsOf = frozen.some((f) => f) ? holdingCards({ ...s, slots: s.slots.map((h, i) => (frozen[i] ? null : h)) }) : holdingCards(s);
    const hc = cardsOf.map((c) => (c?.lowBuy && !careLow ? { ...c, lowBuy: false } : c));
    const busy = isBusy(s);
    const rects = slotRects(hc.length);
    const pv = s.ext ? positionsView(s) : null;
    const ext: SlotExt | null = pv ? { total: pv.total, cash: pv.cash } : null;
    this.drawCash(pv);
    if (this.cards.length !== hc.length) {
      for (const c of this.cards) c.destroy();
      this.cards = [];
    }
    // 空格每次都重画（现金块跟着账户变）
    const pre = s.phase === 'premarket';
    hc.forEach((card, i) => {
      const old = this.cards[i];
      const rect = rects[i] as Rect;
      const fz = frozen[i] ?? null;
      if (!card && fz) {
        if (!old || old.frozenKey !== frozenKeyOf(fz)) {
          old?.destroy();
          this.cards[i] = new SlotCard(this.scene, i, rect, null, this.idle, this.onSell, busy, undefined, ext, s, undefined, undefined, fz);
        }
      } else if (!card) {
        old?.destroy();
        this.cards[i] = new SlotCard(this.scene, i, rect, null, this.idle, this.onSell, busy, (sl) => this.onInspect?.(sl), ext, s);
      } else if (!old || old.frozen || old.stockId !== card.id || old.short !== !!card.short) {
        old?.destroy();
        this.cards[i] = new SlotCard(this.scene, i, rect, card, this.idle, this.onSell, busy, (sl) => this.onInspect?.(sl), ext, s, (sl) => this.onMore?.(sl), (sl) => this.onMenu?.(sl));
      } else {
        old.update(card, pre, busy, s);
      }
      this.cards[i]?.setPick(this.pickMode, card);
      this.cards[i]?.setNewTag(card ? newTagOf(s, i) : null);
    });
    this.drawPurse(s, hc, rects);
    this.drawHighlight();
  }

  private purse: Phaser.GameObjects.Container | null = null;

  /**
   * 空格是桌上的「位子」（art-v3：纸垫）：每个空格一块纸垫、里面一圈虚线座位；第一块左上角是缩小的钱袋和现金数，
   * 今天还能买时纸垫外圈发金光（不写「还能买 N 只」大字），座位里写「空位」。推荐只在右栏，纸垫里不放推荐位。
   */
  private drawPurse(s: GameState, hc: readonly (HoldingCard | null)[], rects: readonly Rect[]): void {
    this.purse?.destroy();
    const sc = this.scene;
    const root = sc.add.container(0, 0).setDepth(1);
    this.purse = root;
    const cashIdx = this.cards.map((c, i) => (c && !c.stockId && !c.frozen ? i : -1)).filter((i) => i >= 0);
    if (cashIdx.length === 0) return;
    const weights = hc.reduce((n, c) => n + (c ? c.weight : 0), 0);
    // 申购中冻结的钱不算「现金」：它不在持仓里，也还没退回
    const frozenW = s.slots.reduce((n, h) => n + (h?.ipo?.stage === 'frozen' ? (h.units ?? 1) : 0), 0) / holdingBase(s);
    const cash = Math.max(0, s.account * (1 - weights - frozenW));
    const pre = s.phase === 'premarket';
    const buys = pre ? buysText(s.today.buysLeft, s.ext ? freeUnits(s) : null) : null;
    const glow = !!buys?.can && !isBusy(s);
    cashIdx.forEach((i, k) => {
      const { x, y, w, h } = rects[i] as Rect;
      const pad = sc.add.graphics();
      pad.fillStyle(0x6b4a3a, 0.12).fillRoundedRect(x + 2, y + 6, w - 4, h - 6, 16);
      pad.fillStyle(0xfff6e6, 0.94).fillRoundedRect(x + 2, y + 2, w - 4, h - 6, 16);
      pad.lineStyle(2, 0xd8c3a8, 1).strokeRoundedRect(x + 2, y + 2, w - 4, h - 6, 16);
      root.add(pad);
      if (glow) {
        const ring = sc.add.graphics();
        ring.lineStyle(4, COLOR.gold, 0.9).strokeRoundedRect(x - 1, y - 1, w + 2, h, 18);
        root.add(ring);
        if (this.idle) sc.tweens.add({ targets: ring, alpha: { from: 1, to: 0.35 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
      // 竖屏版的矮卡（约 100 高）：钱袋和现金一行在上，「空位」和一句引导在虚线座位里
      const guide = glow ? (PORTRAIT ? '点下面的推荐买' : '点右边的推荐买') : buys?.text.replace(/ /g, '');
      if (COMPACT_SLOTS) {
        root.add(dashedBox(sc, x + 8, y + 36, w - 16, h - 46, 0xd8c3a8));
        if (k === 0) {
          const bag = addGlyph(sc, x + 20, y + 19, 'moneybag', 22);
          const amt = addText(sc, x + 34, y + 19, formatMoney(cash), { size: 14, bold: true, num: true, color: COLOR.accentDark, originY: 0.5 });
          // 金额不截断：放不下换短写法
          if (amt.width > w - 42) amt.setText(moneyShort(cash));
          root.add([bag, amt]);
          if (this.cashRect === null) this.cashRect = { x, y, w, h: 34 };
        }
        const cx = x + w / 2;
        root.add(addText(sc, cx, y + 36 + (h - 46) / 2 - (guide ? 9 : 0), '空位', { size: 16, bold: true, color: COLOR.muted, originX: 0.5, originY: 0.5 }));
        if (guide) root.add(fitWidth(addText(sc, cx, y + 36 + (h - 46) / 2 + 12, guide, { size: FS.xs, bold: true, color: COLOR.muted, originX: 0.5, originY: 0.5 }), w - 24));
        return;
      }
      root.add(dashedBox(sc, x + (PHONE ? 8 : 14), y + (PHONE ? 60 : 52), w - (PHONE ? 16 : 28), h - (PHONE ? 74 : 70), 0xd8c3a8));
      if (k === 0) {
        // 缩小的钱袋 + 现金数（左上角）
        // 手机上卡窄（SE 约 104），金额挪到钱袋下面一整行，不再截成「¥10....」
        const bag = PHONE ? addGlyph(sc, x + 22, y + 22, 'moneybag', 26) : addGlyph(sc, x + 28, y + 28, 'moneybag', 34);
        const lbl = addText(sc, PHONE ? x + 38 : x + 50, PHONE ? y + 13 : y + 12, '现金', { size: FS.xs, bold: true, color: COLOR.muted });
        const amt = PHONE
          ? addText(sc, x + w / 2, y + 36, formatMoney(cash), { size: 16, bold: true, num: true, color: COLOR.accentDark, originX: 0.5 })
          : addText(sc, x + 50, y + 26, formatMoney(cash), { size: 16, bold: true, num: true, color: COLOR.accentDark });
        fitWidth(amt, PHONE ? w - 12 : w - 58);
        root.add([bag, lbl, amt]);
        if (this.cashRect === null) this.cashRect = { x, y, w, h: 44 };
      }
      const cx = x + w / 2;
      root.add(addText(sc, cx, y + 112, '空位', { size: TYPE.title, bold: true, color: COLOR.muted, originX: 0.5, originY: 0.5 }));
      // 能买时纸垫发光，下面一句引导点右边的推荐（拖到这里也行）；今天买不了了写原因（买够了、在加班……）
      if (guide) root.add(fitWidth(addText(sc, cx, y + 140, guide, { size: FS.xs, bold: true, color: COLOR.muted, originX: 0.5, originY: 0.5 }), w - 16));
    });
    // 选格子模式时现金块退到后面，格子上的选择按钮照样露出来
    root.setDepth(0);
    for (const c of this.cards) if (c && !c.stockId) c.root.setDepth(1);
  }

  private cashNode: Phaser.GameObjects.Container | null = null;
  private cashRect: Rect | null = null;

  /** 持仓区右上角："现金还剩 N 份" + 小方块。 */
  private drawCash(pv: ReturnType<typeof positionsView> | null): void {
    this.cashNode?.destroy();
    this.cashNode = null;
    this.cashRect = null;
    // 手机横屏：持仓顶着顶栏，上面没地方放这条；还剩几份在空格的悬停和「买多少」里都看得到
    if (!pv || PHONE) return;
    const rects = slotRects(pv.total);
    const last = rects[rects.length - 1] as Rect;
    const right = last.x + last.w;
    const t = addText(this.scene, 0, 0, '现金', { size: 13, bold: true, color: COLOR.ink, originY: 0.5 });
    const pipsW = pv.total * 12 - 3;
    const w = t.width + pipsW + 30;
    const x = right - w;
    const y = SLOTS_TOP - 36;
    const bg = this.scene.add.rectangle(x, y, w, 24, COLOR.paperHi, 0.94).setOrigin(0, 0).setRounded(12).setStrokeStyle(2, COLOR.ink, 1);
    t.setPosition(x + 10, y + 12);
    const pips = unitPips(this.scene, x + 20 + t.width, y + 7, pv.cash, pv.total, COLOR.gold, 9);
    const hit = this.scene.add.rectangle(x, y, w, 24, 0xffffff, 0.001).setOrigin(0, 0).setInteractive();
    bindTooltip(hit, () => ({ x, y, w, h: 24 }), () => ({ title: '还剩几份钱', body: `钱一共分成 ${pv.total} 份（1 份约是账户的四分之一）。买的时候选"试一口"用 1 份、"半仓"用 2 份、"重仓"把剩下的全压上。` }));
    this.cashNode = this.scene.add.container(0, 0, [bg, t, pips, hit]).setDepth(6);
    this.cashRect = { x, y, w, h: 24 };
  }

  /** "现金还剩几份"那块的位置（截图、检查遮挡用）。 */
  cashArea(): Rect | null {
    return this.cashRect;
  }

  /** 进入 / 退出选格子模式（满仓替换、放稀有股票）。 */
  setPicking(mode: PickMode | null): void {
    this.pickMode = mode;
    const hc = holdingCards(this.state);
    this.cards.forEach((c, i) => c.setPick(mode, hc[i] ?? null));
    this.drawHighlight();
  }

  get picking(): boolean {
    return this.pickMode !== null;
  }

  private drawHighlight(): void {
    const g = this.highlight;
    g.clear();
    if (!this.pickMode) return;
    for (const c of this.cards) {
      if (!c.pick) continue;
      g.lineStyle(4, COLOR.accent, 1).strokeRoundedRect(c.rect.x - 4, c.rect.y - 4, c.rect.w + 8, c.rect.h + 8, 14);
    }
  }

  setLocked(locked: boolean): void {
    for (const c of this.cards) c.setLocked(locked);
  }

  card(slot: number): SlotCard | null {
    return this.cards[slot] ?? null;
  }

  rect(slot: number): Rect | null {
    return this.cards[slot]?.rect ?? null;
  }

  count(): number {
    return this.cards.length;
  }

  /** 卡片中心（世界坐标）。 */
  center(slot: number): { x: number; y: number } | null {
    const r = this.rect(slot);
    return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : null;
  }

  /** 小人头顶（世界坐标）。 */
  head(slot: number): { x: number; y: number } | null {
    const c = this.cards[slot];
    if (!c) return null;
    if (c.guy) return c.guy.headWorld();
    return { x: c.rect.x + c.rect.w / 2, y: c.rect.y + 30 };
  }

  /** 找持仓里某只股票在哪一格。 */
  slotOf(stockId: string): number {
    return this.cards.findIndex((c) => c.stockId === stockId);
  }

  /**
   * ② 揭晓一格：小人弹跳或发抖、换表情、头顶弹出涨跌幅、「今日」数字滚到 shown。
   * role 用来取涨跌停幅度（ST 只有 ±5%）。
   */
  reveal(anim: Animator, slot: number, move: number, shown: number, role: keyof typeof BALANCE.roles, flags: { short?: boolean; limitUp: boolean; limitDown: boolean; blown: boolean; jump: number }): void {
    const c = this.cards[slot];
    if (!c) return;
    const face: Face = faceOf(move, BALANCE.roles[role].limit);
    c.guy?.setFace(face);
    if (move > 0.05) c.guy?.bounce(anim, Math.min(1, move / 10));
    else if (move < -0.05) c.guy?.shake(anim, Math.min(1, -move / 10));
    const head = this.head(slot);
    if (head) {
      // 涨跌幅弹在卡片上沿之上（窗外天空的位置），不压住卡上的标签；手机上卡片顶着顶栏，就弹在卡片上半截
      head.y = PHONE ? c.rect.y + 44 : Math.min(head.y, c.rect.y + 2);
      // 浮字和卡上滚到的数字一致（都是这一格这一步的收益）
      // 押跌：股票涨停就是被轧，浮字写"被轧"（数字是这一格的亏损，不是股票的 +10%）
      const label = flags.limitUp ? `${flags.short ? '被轧' : '涨停'} ${pctArrow(shown)}` : flags.limitDown ? `跌停 ${pctArrow(shown)}` : pctArrow(shown);
      floatText(this.scene, anim, head.x, head.y - 4, label, signColor(shown), { size: flags.limitUp || flags.limitDown ? 20 : 18, pop: true, rise: 24, hold: 600, depth: 160 });
      if (flags.blown) floatText(this.scene, anim, head.x, head.y - 26, '没封住！', COLOR.down, { size: 14, pop: true, hold: 500, depth: 161 });
      else if (flags.jump !== 0) floatText(this.scene, anim, head.x, head.y - 26, flags.jump > 0 ? '突然暴涨' : '突然暴跌', signColor(flags.jump), { size: 14, pop: true, hold: 500, depth: 161 });
    }
    void this.rollToday(anim, slot, shown, 360);
  }

  /** 开盘翻牌：盖着的牌背（按格子） */
  private covers = new Map<number, Phaser.GameObjects.Container>();

  /** 开盘：手里每只股票先盖上牌背（揭晓时一张张翻开）；关掉动画时不盖。 */
  coverAll(anim: Animator): void {
    this.clearCovers();
    if (anim.instant) return;
    for (const c of this.cards) {
      if (!c?.stockId) continue;
      const { x, y, w, h } = c.rect;
      const back = this.scene.add.rectangle(0, 0, w, h, c.short ? 0x3f4a7a : COLOR.accent).setRounded(12).setStrokeStyle(3, COLOR.ink, 1);
      const inner = this.scene.add.rectangle(0, 0, w - 16, h - 16, 0xffffff, 0).setRounded(9).setStrokeStyle(2, 0xffffff, 0.8);
      const q = addText(this.scene, 0, -6, '?', { size: 56, bold: true, color: COLOR.white, originX: 0.5, originY: 0.5 });
      const sub = addText(this.scene, 0, 44, c.short ? '押跌' : '开盘', { size: 14, bold: true, color: COLOR.white, originX: 0.5, originY: 0.5 });
      const node = this.scene.add.container(x + w / 2, y + h / 2, [back, inner, q, sub]).setDepth(40);
      this.covers.set(c.slot, node);
    }
  }

  clearCovers(): void {
    for (const n of this.covers.values()) n.destroy();
    this.covers.clear();
  }

  /**
   * 翻开一格：牌背横向收窄翻走，按档位放特效——大涨冒火、大跌结冰、涨停 / 跌停 / 押对了盖章并震一下。
   * 档位按"这一格对你是赚是亏"分，押跌的格子颜色和特效都反过来。
   */
  flip(anim: Animator, slot: number, tone: FlipTone): void {
    const node = this.covers.get(slot);
    this.covers.delete(slot);
    if (node) {
      if (anim.instant) node.destroy();
      else anim.fx({ targets: node, scaleX: 0, duration: 120, ease: 'Quad.easeIn' }, () => node.destroy());
    }
    const c = this.cards[slot];
    if (!c || anim.instant) return;
    const { x, y, w, h } = c.rect;
    const cx = x + w / 2;
    switch (tone) {
      case 'limitUp':
      case 'shortWin':
        flashBox(this.scene, anim, x - 4, y - 4, w + 8, h + 8, COLOR.gold, 45);
        stamp(this.scene, anim, cx, y + 92, tone === 'limitUp' ? '涨停' : '押对了', true, 900);
        flameBurst(this.scene, anim, cx, y + 120, 12);
        shake(this.scene, anim, 140, 0.004);
        break;
      case 'bigUp':
        flashBox(this.scene, anim, x - 3, y - 3, w + 6, h + 6, COLOR.up, 45);
        flameBurst(this.scene, anim, cx, y + 120, 8);
        break;
      case 'bigDown':
        flashBox(this.scene, anim, x - 3, y - 3, w + 6, h + 6, COLOR.down, 45);
        iceBurst(this.scene, anim, cx, y + 110, 8);
        break;
      case 'limitDown':
      case 'squeezed':
        flashBox(this.scene, anim, x - 4, y - 4, w + 8, h + 8, COLOR.down, 45);
        stamp(this.scene, anim, cx, y + 92, tone === 'limitDown' ? '跌停' : '被轧', false, 900);
        iceBurst(this.scene, anim, cx, y + 110, 12);
        shake(this.scene, anim, 180, 0.006);
        break;
      default:
        break;
    }
  }

  /** 「今日」数字滚到 to（数字再跳一下）。 */
  async rollToday(anim: Animator, slot: number, to: number, ms: number): Promise<void> {
    const c = this.cards[slot];
    if (!c) return;
    const from = c.shownToday;
    await anim.count(from, to, ms, (v) => c.setToday(v));
    if (c.todayLabel) pop(anim, c.todayLabel, 1.3);
  }

  controls(): Record<string, { x: number; y: number }> {
    const out: Record<string, { x: number; y: number }> = {};
    this.cards.forEach((c, i) => {
      out[`card:${i}`] = { x: c.rect.x + c.rect.w / 2, y: c.rect.y + c.rect.h / 2 };
      if (c.sell?.visible && c.sell.isEnabled()) out[`sell:${i}`] = c.sell.center();
      if (c.more?.visible && c.more.isEnabled()) out[`more:${i}`] = c.more.center();
      if (c.pick) out[`slot:${i}`] = c.pick.center();
      if (c.magCenter) out[`detail:${i}`] = c.magCenter;
    });
    return out;
  }

  /** 某格卖出按钮的区域（教程用）；按钮不在时用整张卡。 */
  sellRect(slot: number): Rect | null {
    const c = this.cards[slot];
    if (!c) return null;
    return c.sell?.visible ? c.sell.rect() : c.rect;
  }

  /** 此刻能点的按钮区域。 */
  buttonRects(): Rect[] {
    const out: Rect[] = [];
    for (const c of this.cards) {
      if (c.sell?.visible && c.sell.isEnabled()) out.push(c.sell.rect());
      if (c.more?.visible && c.more.isEnabled()) out.push(c.more.rect());
      if (c.pick) out.push(c.pick.rect());
    }
    return out;
  }

  /** 每格的位置（拖拽落点用；空格也算，满仓换股时放在有持仓的格子上）。 */
  slotRects(): Rect[] {
    return this.cards.map((c) => c.rect);
  }

  /** 这一格有没有股票 */
  filled(slot: number): boolean {
    return !!this.cards[slot]?.stockId;
  }

  /** 按下 (x, y) 在哪张持仓卡上（要有股票、不在按钮上）；没有返回 -1。拖出去卖用。 */
  holdingAt(x: number, y: number): number {
    if (this.pickMode) return -1;
    const btns = this.buttonRects();
    const hit = btns.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    if (hit) return -1;
    return this.cards.findIndex((c) => c.stockId && x >= c.rect.x && x <= c.rect.x + c.rect.w && y >= c.rect.y && y <= c.rect.y + c.rect.h);
  }

  /** 按 slot 触发「加减」按钮（键盘、自动化）。 */
  pressMore(slot: number): boolean {
    return this.cards[slot]?.more?.press() ?? false;
  }

  /** 按 slot 触发卖出按钮（键盘快捷键）。 */
  pressSell(slot: number): boolean {
    return this.cards[slot]?.sell?.press() ?? false;
  }

  pressPick(slot: number): boolean {
    return this.cards[slot]?.pick?.press() ?? false;
  }

  /** 整个持仓区的范围（引导用）。 */
  area(): Rect {
    const first = this.cards[0]?.rect;
    const last = this.cards[this.cards.length - 1]?.rect;
    if (!first || !last) return { x: 266, y: 232, w: 692, h: 222 };
    return { x: first.x, y: first.y, w: last.x + last.w - first.x, h: first.h };
  }
}
