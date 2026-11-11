/**
 * 我的手牌：按点数（或按牌型）分列，同列竖着叠放，大牌在左。点选或按住滑动多选，选中上抬。
 * 斗地主（HandOrder.flat）改成横排一行，不分列。电脑上鼠标停在可选的牌上这张上浮 8 并描边；右键取消选中（点牌取消这张，点空白取消全部）。
 *
 * 手机横屏（844×390）时世界坐标缩到约 0.54 倍。叠放高度有上限（不能盖到按钮），一列 5 张时每张只露约 30（约 16 CSS 像素），
 * 4 张时露约 40（约 21 CSS 像素）。所以横向放得下时一列最多 4 张（列间距不小于 72，约 39 CSS 像素），放不下才用 5 张。
 */
import type Phaser from 'phaser';
import { sortHand, type Card } from '../../variants/guandan/core/index.ts';
import { audio } from '../common/audio.ts';
import { dur, settle } from '../common/anim.ts';
import { PACE, dealInMs } from '../common/pace.ts';
import { worldH, worldW } from '../ui/kit.ts';
import { CardView, HAND_H, HAND_W } from './card.ts';

export type { SortMode } from './columns.ts';
import { MAX_COL, columnsFor, type SortMode } from './columns.ts';
import { downAction, flatLayout } from './hand-logic.ts';
import { DEAL_FLY, HAND_LAYOUT } from './layout.ts';

/**
 * 手牌怎么理、怎么分列（牌馆 0.28.0：玩法给；不给就是掼蛋的，按级牌牌序、逢人配排在级牌后）。
 * level 是掼蛋的级牌，别的玩法不用它。
 * flat：横排成一行（斗地主，最多 20 张），columns 给的每一列当"一组"，按牌型理牌时组与组之间留空隙；不给就是掼蛋的分列竖叠
 */
export interface HandOrder {
  sort(cards: readonly Card[], level: number): Card[];
  columns(cards: readonly Card[], level: number, mode: SortMode, maxCol?: number): Card[][];
  flat?: boolean;
}

export const GUANDAN_ORDER: HandOrder = { sort: sortHand, columns: columnsFor };

const BOTTOM_PAD = 8;
/** 手牌区最高能叠到多高（含一张整牌） */
const MAX_STACK = 248;
const LIFT = 24;
/** 鼠标停在牌上（只电脑）上浮多少 */
const HOVER_LIFT = 8;
/** 横排：张数少时相邻两张最多隔多远（世界坐标）；按牌型理牌时组与组之间的空隙 */
const FLAT_MAX_STEP = 76;
const FLAT_GAP = 12;
/** 一列最多 4 张时，列间距至少要这么宽才用 */
const MIN_SPACING_SHORT = 72;

interface Slot {
  x: number;
  y: number;
  depth: number;
}

export class HandView {
  private scene: Phaser.Scene;
  private views = new Map<Card, CardView>();
  private sel = new Set<Card>();
  private slots = new Map<Card, Slot>();
  private level = 2;
  private cards: Card[] = [];
  mode: SortMode = 'rank';
  private allowed: Set<Card> | null = null;
  private single = false;
  private on = false;
  private dragging: { mode: boolean; seen: Set<Card> } | null = null;
  /** 鼠标停在哪张上（只电脑；触屏不悬停） */
  private hovered: Card | null = null;
  onChange: () => void = () => {};

  private readonly order: HandOrder;

  constructor(scene: Phaser.Scene, order: HandOrder = GUANDAN_ORDER) {
    this.scene = scene;
    this.order = order;
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.down(p));
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => this.move(p));
    scene.input.on('pointerup', () => (this.dragging = null));
    scene.input.on('pointerupoutside', () => (this.dragging = null));
    // 鼠标移出画布：上浮的牌归位
    scene.input.on('gameout', () => this.setHover(null));
    // 右键是"取消选中"：画布上不弹浏览器菜单（只管画布，页面别处照旧）
    const canvas = scene.game.canvas;
    const noMenu = (e: Event): void => e.preventDefault();
    canvas.addEventListener('contextmenu', noMenu);
    scene.events.once('shutdown', () => canvas.removeEventListener('contextmenu', noMenu));
  }

  get enabled(): boolean {
    return this.on;
  }

  set enabled(v: boolean) {
    this.on = v;
    if (!v) this.setHover(null);
  }

  /** 世界坐标这一点在不在手牌区（滚轮不滚页面用）：最高一张的上沿往上留一个选中上抬的高度 */
  inArea(y: number): boolean {
    return this.views.size > 0 && y >= this.topY - LIFT - HOVER_LIFT;
  }

  get topY(): number {
    let top = worldH;
    for (const s of this.slots.values()) top = Math.min(top, s.y - HAND_H / 2);
    return top;
  }

  private world(p: Phaser.Input.Pointer): { x: number; y: number } {
    const v = this.scene.cameras.main.getWorldPoint(p.x, p.y);
    return { x: v.x, y: v.y };
  }

  private hit(x: number, y: number): Card | null {
    let best: Card | null = null;
    let bestDepth = -1;
    for (const [c, v] of this.views) {
      if (!v.visible) continue;
      if (Math.abs(x - v.x) <= HAND_W / 2 && Math.abs(y - v.y) <= HAND_H / 2 && v.depth > bestDepth) {
        best = c;
        bestDepth = v.depth;
      }
    }
    return best;
  }

  private down(p: Phaser.Input.Pointer): void {
    if (!this.enabled) return;
    const { x, y } = this.world(p);
    const act = downAction({
      right: p.rightButtonDown() || p.button === 2,
      hit: this.hit(x, y),
      selected: this.sel,
      allowed: this.allowed,
      single: this.single,
    });
    switch (act.kind) {
      case 'none':
        return;
      case 'clear':
        this.setSelected([]);
        break;
      case 'deselect':
        this.toggle(act.card, false);
        break;
      case 'set':
        this.setSelected(act.cards);
        break;
      case 'drag':
        this.dragging = { mode: act.on, seen: new Set([act.card]) };
        this.toggle(act.card, act.on);
        break;
    }
    this.onChange();
  }

  /** 鼠标停在哪张就让哪张上浮；触屏、手指、不能选的牌（进贡时压暗的）不悬停 */
  private setHover(c: Card | null): void {
    if (c === this.hovered) return;
    const old = this.hovered;
    this.hovered = c;
    if (old !== null) this.views.get(old)?.setHover(false);
    if (c !== null) this.views.get(c)?.setHover(true);
    if (old !== null) this.place(old, true);
    if (c !== null) this.place(c, true);
  }

  private move(p: Phaser.Input.Pointer): void {
    if (!this.dragging || !p.isDown) {
      if (p.wasTouch || !this.enabled) return this.setHover(null);
      const { x, y } = this.world(p);
      const c = this.hit(x, y);
      this.setHover(c !== null && (!this.allowed || this.allowed.has(c)) ? c : null);
      return;
    }
    const { x, y } = this.world(p);
    const c = this.hit(x, y);
    if (c === null || this.dragging.seen.has(c)) return;
    if (this.allowed && !this.allowed.has(c)) return;
    this.dragging.seen.add(c);
    this.toggle(c, this.dragging.mode);
    this.onChange();
  }

  private toggle(c: Card, on: boolean): void {
    if (on === this.sel.has(c)) return;
    if (on) this.sel.add(c);
    else this.sel.delete(c);
    audio.sfx(on ? 'select' : 'deselect');
    this.place(c, true);
  }

  selected(): Card[] {
    return this.cards.filter((c) => this.sel.has(c));
  }

  setSelected(cards: readonly Card[]): void {
    const want = new Set(cards.filter((c) => this.views.has(c)));
    for (const c of this.cards) {
      const on = want.has(c);
      if (on !== this.sel.has(c)) {
        if (on) this.sel.add(c);
        else this.sel.delete(c);
        this.place(c, true);
      }
    }
  }

  /** 进贡/还贡时只允许点这些牌，且只能选一张；null 恢复正常。 */
  setAllowed(allowed: readonly Card[] | null): void {
    this.allowed = allowed ? new Set(allowed) : null;
    this.single = allowed !== null;
    for (const [c, v] of this.views) v.setDim(this.allowed !== null && !this.allowed.has(c));
    if (this.allowed) this.setSelected(this.selected().filter((c) => this.allowed!.has(c)));
  }

  positionOf(c: Card): { x: number; y: number } | null {
    const v = this.views.get(c);
    return v ? { x: v.x, y: v.y } : null;
  }

  private computeSlots(): void {
    const W = worldW(this.scene);
    const margin = HAND_LAYOUT.margin;
    if (this.order.flat) return this.computeFlat(W, margin);
    const avail = W - margin * 2;
    const spacingFor = (n: number) => (n <= 1 ? 0 : Math.min(HAND_W + HAND_LAYOUT.spacingExtra, (avail - HAND_W) / (n - 1)));
    let cols = this.order.columns(this.cards, this.level, this.mode, MAX_COL - 1);
    if (cols.length > 1 && spacingFor(cols.length) < MIN_SPACING_SHORT) cols = this.order.columns(this.cards, this.level, this.mode);
    const n = cols.length;
    const spacing = spacingFor(n);
    const total = spacing * (n - 1) + HAND_W;
    const x0 = W / 2 - total / 2 + HAND_W / 2;
    const maxLen = Math.max(1, ...cols.map((c) => c.length));
    const dy = maxLen <= 1 ? 0 : Math.min(HAND_LAYOUT.stackStepMax, (MAX_STACK - HAND_H) / (maxLen - 1));
    const bottomY = worldH - BOTTOM_PAD - HAND_H / 2;
    this.slots.clear();
    cols.forEach((col, i) => {
      col.forEach((c, j) => {
        this.slots.set(c, { x: x0 + i * spacing, y: bottomY - (col.length - 1 - j) * dy, depth: HAND_LAYOUT.depthBase + i * HAND_LAYOUT.depthPerCol + j });
      });
    });
  }

  /** 横排一行：右边的牌压在左边的上面（depth 随位置增），每张露出左边一条，点数花色在左上角读得到 */
  private computeFlat(W: number, margin: number): void {
    const groups = this.order.columns(this.cards, this.level, this.mode, Number.MAX_SAFE_INTEGER);
    const { xs } = flatLayout(groups.map((g) => g.length), W, {
      cardW: HAND_W,
      margin,
      maxStep: FLAT_MAX_STEP,
      gap: this.mode === 'type' ? FLAT_GAP : 0,
    });
    const y = worldH - BOTTOM_PAD - HAND_H / 2;
    this.slots.clear();
    let k = 0;
    for (const g of groups) for (const c of g) this.slots.set(c, { x: xs[k]!, y, depth: HAND_LAYOUT.depthBase + k++ });
  }

  private place(c: Card, animate: boolean): void {
    const v = this.views.get(c);
    const s = this.slots.get(c);
    if (!v || !s) return;
    const picked = this.sel.has(c);
    const y = s.y - (picked ? LIFT : this.hovered === c ? HOVER_LIFT : 0);
    v.setDepth(s.depth);
    v.setSelected(picked);
    this.scene.tweens.killTweensOf(v);
    if (animate && dur(1) > 0) this.scene.tweens.add({ targets: v, x: s.x, y, duration: dur(this.hovered === c || picked ? HAND_LAYOUT.moveMs.lifted : HAND_LAYOUT.moveMs.rest), ease: 'Quad.easeOut' });
    else v.setPosition(s.x, y);
  }

  /**
   * 换成新手牌：已有的牌移到新位置，新增的牌从 from（世界坐标）飞入，去掉的牌直接销毁（出牌动画另做）。
   */
  setHand(cards: readonly Card[], level: number, opts: { animate?: boolean; from?: { x: number; y: number } } = {}): void {
    const levelChanged = level !== this.level;
    this.level = level;
    this.cards = this.order.sort(cards, level);
    const keep = new Set(this.cards);
    for (const [c, v] of this.views) {
      if (!keep.has(c)) {
        v.destroy();
        this.views.delete(c);
        this.sel.delete(c);
        if (this.hovered === c) this.hovered = null;
      }
    }
    this.computeSlots();
    for (const c of this.cards) {
      let v = this.views.get(c);
      if (!v) {
        const s = this.slots.get(c)!;
        const from = opts.from ?? { x: s.x, y: s.y };
        v = new CardView(this.scene, from.x, from.y, c, level);
        this.views.set(c, v);
        if (this.allowed) v.setDim(!this.allowed.has(c));
      } else if (levelChanged) v.setLevel(level);
      this.place(c, opts.animate ?? true);
    }
  }

  /** 拿走一些牌的显示对象（出牌时交给出牌区继续做飞出动画），手牌重排。 */
  take(cards: readonly Card[]): CardView[] {
    const out: CardView[] = [];
    for (const c of cards) {
      const v = this.views.get(c);
      if (!v) continue;
      this.views.delete(c);
      this.sel.delete(c);
      if (this.hovered === c) this.hovered = null;
      v.setSelected(false);
      v.setHover(false);
      out.push(v);
    }
    const left = new Set(cards);
    this.cards = this.cards.filter((c) => !left.has(c));
    this.computeSlots();
    for (const c of this.cards) this.place(c, true);
    return out;
  }

  setMode(mode: SortMode): void {
    this.mode = mode;
    this.computeSlots();
    for (const c of this.cards) this.place(c, true);
  }

  relayout(): void {
    this.computeSlots();
    for (const c of this.cards) this.place(c, false);
  }

  /** 发牌动画：牌背从桌心逐张飞到位置后翻开。 */
  async dealIn(fromX: number, fromY: number): Promise<void> {
    const list = [...this.cards].sort((a, b) => this.slots.get(a)!.depth - this.slots.get(b)!.depth);
    if (dur(1) === 0) {
      for (const c of list) this.place(c, false);
      return;
    }
    const { batch, step: batchStep, fly, flip } = PACE.deal;
    const step = dur(batchStep);
    await settle(new Promise<void>((resolve) => {
      list.forEach((c, i) => {
        const v = this.views.get(c)!;
        const s = this.slots.get(c)!;
        v.flip(false, this.level);
        v.setPosition(fromX, fromY).setScale(DEAL_FLY.startScale).setAngle(DEAL_FLY.angle);
        this.scene.tweens.add({
          targets: v,
          x: s.x,
          y: s.y,
          scale: 1,
          angle: 0,
          delay: Math.floor(i / batch) * step,
          duration: dur(fly),
          ease: 'Cubic.easeOut',
          onStart: () => i % batch === 0 && audio.sfx('deal'),
          onComplete: () => {
            this.scene.tweens.add({
              targets: v,
              scaleX: 0,
              duration: dur(flip),
              yoyo: true,
              onYoyo: () => v.flip(true, this.level),
              onComplete: () => {
                if (i === list.length - 1) resolve();
              },
            });
          },
        });
      });
      if (list.length === 0) resolve();
    }), dur(dealInMs(list.length)));
  }

  get count(): number {
    return this.cards.length;
  }

  destroy(): void {
    for (const v of this.views.values()) v.destroy();
    this.views.clear();
  }

  /** 调试/冒烟：某张牌在世界坐标里的可点位置（露出部分的中心）。 */
  tapPoint(c: Card): { x: number; y: number } | null {
    const v = this.views.get(c);
    if (!v) return null;
    return { x: v.x - HAND_W / 2 + HAND_LAYOUT.tapInset.x, y: v.y - HAND_H / 2 + HAND_LAYOUT.tapInset.y };
  }

  get size(): number {
    return this.views.size;
  }
}
