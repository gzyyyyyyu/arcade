import type { Rect } from '../rect.ts';
import { OPEN, PHONE_RECT as PHONE } from '../trade/layout.ts';
import type { TradeScene } from '../scenes/TradeScene.ts';

/** 给自动化和截图用的坐标：controls() 可点的控件，regions() 各区域。 */
export class TradeRegions {
  readonly s: TradeScene;

  constructor(s: TradeScene) {
    this.s = s;
  }

  controls(): Record<string, { x: number; y: number }> {
    const out: Record<string, { x: number; y: number }> = { settings: this.s.top.settings.center(), help: this.s.top.help.center(), lobby: this.s.top.lobby.center() };
    const ex = this.s.recapCard?.expandCenter();
    if (ex) out['recap:expand'] = ex;
    const cat = this.s.recapCard?.catCenter();
    if (cat) out['recap:cat'] = cat;
    const badge = this.s.recapCard?.badgeCenter();
    if (badge) out['recap:badge'] = badge;
    // 手机群聊页里带推荐的消息（点一下就能买）
    const msgBuy = this.s.tab === 'msgs' ? this.s.chat.recBuyCenters[0] : undefined;
    if (msgBuy) out['chat:buy'] = { x: msgBuy.x, y: msgBuy.y };
    const news = this.s.chat.newsCenter();
    if (news && !this.s.busy) out['news:toggle'] = news;
    if (this.s.continueBtn) return { ...out, continue: this.s.continueBtn.center() };
    if (this.s.guide) Object.assign(out, this.s.guide.controls());
    if (this.s.reward?.root.visible) return { ...out, ...this.s.reward.controls() };
    if (this.s.event) return { ...out, ...this.s.event.controls() };
    Object.assign(out, this.s.holdings.controls());
    if (this.s.top.bank?.isEnabled()) out.bank = this.s.top.bank.center();
    if (this.s.banner && this.s.bannerCancel) {
      out['pick:cancel'] = this.s.bannerCancel.center();
      return out;
    }
    Object.assign(out, this.s.chat.controls());
    if (this.s.tabs && !this.s.busy) Object.assign(out, this.s.tabs.controls());
    if (this.s.openBtn.isEnabled()) out.open = this.s.openBtn.center();
    if (this.s.deleverageBtn.visible && this.s.deleverageBtn.isEnabled() && !this.s.busy) out.deleverage = this.s.deleverageBtn.center();
    if (this.s.quietBtn.visible && this.s.quietBtn.isEnabled() && !this.s.busy) out.fast = this.s.quietBtn.center();
    return out;
  }

  regions(): Record<string, Rect> {
    const out: Record<string, Rect> = { chat: { ...PHONE }, board: this.s.board.rect(), slots: this.s.holdings.area(), open: { ...OPEN }, bill: this.s.top.billRect(), account: this.s.top.accountRect() };
    // 正在显示的教程步骤：guide:<步骤>（自动化与截图用）
    // 手机上群聊页没打开时，消息和新闻都不在屏幕上
    const msgsShown = this.s.chat.phoneView === 'msgs';
    if (msgsShown) for (const [i, r] of Object.entries(this.s.chat.messageRects())) out[`msg:${i}`] = r;
    if (this.s.toastNode?.active && this.s.toastRect) out.toast = this.s.toastRect;
    if (msgsShown && this.s.chat.ipoBannerRect) out.ipoBanner = this.s.chat.ipoBannerRect;
    if (this.s.cardRect) out.monthCard = this.s.cardRect;
    const hr = this.s.hint?.rect();
    if (hr) out.hint = hr;
    const rc = this.s.recapCard?.rect();
    if (rc) out[`recap:${this.s.recapCard?.showing ?? ''}`] = rc;
    this.s.quips = this.s.quips.filter((q) => q.root.active);
    this.s.quips.forEach((q, i) => (out[`quip:${i}`] = q.rect));
    if (msgsShown && this.s.chat.newsRect) out.news = this.s.chat.newsRect;
    if (this.s.chat.newsExpanded && this.s.chat.newsOpenRect) out['news:open'] = this.s.chat.newsOpenRect;
    const f = this.s.top.flagsRect();
    if (f) out.flags = f;
    const g = this.s.guide?.box();
    if (g) out[`guide:${g.step}`] = g.rect;
    const cash = this.s.holdings.cashArea();
    if (cash) out.cash = cash;
    if (this.s.top.bank) out.bankBtn = this.s.top.bank.rect();
    if (this.s.knowNode?.active) {
      // Phaser 的矩形是 width / height，这里的 Rect 是 w / h
      const b = this.s.knowNode.getBounds();
      out.knowledge = { x: b.x, y: b.y, w: b.width, h: b.height };
    }
    if (this.s.extTipNow) out[`tip:${this.s.extTipNow.id}`] = this.s.hint?.rect() ?? { x: 0, y: 0, w: 0, h: 0 };
    return out;
  }
}
