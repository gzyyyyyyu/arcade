import { chatView, holdingCards } from '../../core/index.ts';
import { recAction } from '../trade/chat.ts';
import { TradeDrag, type DragSource } from '../trade/drag.ts';
import { buyDropSlots, inRect } from '../trade/dragGeo.ts';
import type { TradeScene } from '../scenes/TradeScene.ts';

/** 键盘和拖拽：拖拽买卖的接线，和交易场景的按键。 */
export class TradeInput {
  readonly s: TradeScene;

  constructor(s: TradeScene) {
    this.s = s;
  }

  /** 拖拽：哪里能拖、往哪放（判断在 trade/dragGeo.ts，画面在 trade/drag.ts），放下走和点按钮同一条路。 */
  buildDrag(): void {
    this.s.drag?.destroy();
    this.s.drag = new TradeDrag(this.s, {
      canDrag: () => this.s.session.state.phase === 'premarket' && !this.s.busy && !this.s.banner && !this.s.dialogOpen && !this.s.anim.playing,
      pick: (x, y): DragSource | null => {
        const s = this.s.session.state;
        const slot = this.s.holdings.holdingAt(x, y);
        const held = slot >= 0 ? holdingCards(s)[slot] : null;
        if (held) return { kind: 'hold', slot, stockId: held.id, name: held.name, face: held.face };
        // 手机上推荐卡在「推荐」页；不在这一页时它们不在屏幕上
        if (this.s.tabs && this.s.tab !== 'recs') return null;
        if (this.s.chat.buttonRects().some((r) => inRect(r, x, y))) return null;
        for (const r of chatView(s).recs) {
          const rr = this.s.chat.recRect(r.index);
          if (rr && inRect(rr, x, y) && recAction(s, r).action !== null) return { kind: 'rec', index: r.index, stockId: r.stock.id, name: r.stock.name, face: r.stock.face };
        }
        return null;
      },
      buyTargets: (rec) => {
        const s = this.s.session.state;
        const r = chatView(s).recs[rec];
        // 申购中的格子不是持仓也不是空位：既不能放进去，也不能换掉
        return r ? buyDropSlots(holdingCards(s).map((c) => ({ filled: !!c })), recAction(s, r).action).filter((i) => s.slots[i]?.ipo?.stage !== 'frozen') : [];
      },
      slotRects: () => this.s.holdings.slotRects(),
      sellArea: () => this.s.holdings.area(),
      dropBuy: (rec, slot) => this.s.acts.dropBuy(rec, slot),
      dropSell: (slot) => this.s.acts.act({ type: 'sell', slot }),
      lively: () => !this.s.anim.instant,
    });
  }

  // ---------------------------------------------------------------- 键盘与自动化

  onKey(e: KeyboardEvent): boolean {
    const s = this.s.session.state;
    const code = e.code;
    if (code === 'KeyF') {
      this.s.acts.cancelAuto();
      if (this.s.busy || this.s.banner || s.phase !== 'premarket') return false;
      this.s.acts.onFast();
      return true;
    }
    if (this.s.autoTimer && code !== 'Space' && code !== 'Enter' && code !== 'NumpadEnter') {
      this.s.acts.cancelAuto();
      return true;
    }
    if (code === 'Escape') {
      if (this.s.banner) {
        this.s.bannerCancel?.press();
        return true;
      }
      return this.s.recapCard?.dismiss() ?? false;
    }
    if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') {
      if (this.s.anim.playing) {
        this.s.anim.hurry();
        return true;
      }
      if (this.s.continueBtn) return this.s.continueBtn.press();
      if (this.s.awaitingInput()) return this.s.continueInput();
      if (this.s.busy || this.s.banner) return false;
      if (s.phase === 'premarket') {
        this.s.openBtn.press();
        return true;
      }
      return false;
    }
    const m = /^(?:Digit|Numpad)(\d)$/.exec(code);
    if (!m) return false;
    const n = Number(m[1]);
    if (this.s.busy) return false;
    if (e.shiftKey) return n >= 1 && s.phase === 'premarket' && !this.s.banner ? this.s.holdings.pressSell(n - 1) : false;
    if (this.s.banner) return n >= 1 ? this.s.holdings.pressPick(n - 1) : false;
    if (s.phase === 'reward' && this.s.reward) return n === 0 ? this.s.reward.pressSkip() : this.s.reward.press(n - 1);
    if (s.phase === 'event' && this.s.event) return n >= 1 ? this.s.event.pressKey(n) : false;
    if (s.phase === 'premarket' && n >= 1 && n <= chatView(s).recs.length) {
      // 手机上推荐卡在「推荐」页：按数字键先切过去
      this.s.showTab('recs');
      return this.s.chat.pressBuy(n - 1);
    }
    return false;
  }
}
