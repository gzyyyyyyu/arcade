import { chatView, topBar } from '../../core/index.ts';
import type { Rect } from '../rect.ts';
import { PHONE as PHONE_MODE } from '../theme.ts';
import { OPEN, PHONE_RECT as PHONE } from '../trade/layout.ts';
import { newbieHint } from '../hints.ts';
import { loadViewPrefs } from '../meta/prefs.ts';
import { loadSeenTips, markTipSeen, nextExtTip } from '../extTips.ts';
import { bankRisk } from '../../core/index.ts';
import { moneyShort } from '../ui/dialog.ts';
import type { TradeScene } from '../scenes/TradeScene.ts';

/** 教程气泡、猫的提示、小结卡和提示的角标，以及它们要指向 / 避开的区域。 */
export class TradeHints {
  readonly s: TradeScene;

  constructor(s: TradeScene) {
    this.s = s;
  }

  // ---------------------------------------------------------------- 教程

  /** 按当前局面刷新教程气泡（动画中、选格子时不出）。 */
  syncGuide(): void {
    if (this.s.guide && !this.s.busy && !this.s.banner) this.s.guide.sync(this.s.session.state);
    this.updateHint();
  }

  /** 新手提示：开盘前、没在播放动画时，猫根据公开信息说一句。 */
  updateHint(): void {
    this.refreshHint();
    this.syncCorner();
  }

  /** 电脑上小结默认收成一行（总账一句 + 「详情」展开）；手机已经靠角标收起，按设置走。 */
  recapBrief(): boolean {
    return !PHONE_MODE || loadViewPrefs().recap === 'brief';
  }

  /** 小结卡和猫的提示一次只露一个（电脑、手机都一样，一屏最多一条提示）——小结优先，猫有话时卡上挂一只小猫，点它收起小结换猫说。 */
  syncCorner(): void {
    if (!this.s.hint || !this.s.recapCard) return;
    const recap = this.s.recapCard.showing !== null;
    this.s.hint.setSuppressed(recap);
    this.s.recapCard.setCatBadge(recap && this.s.hint.visible);
  }

  refreshHint(): void {
    const st = this.s.session.state;
    if (!this.s.hint) return;
    // 教程气泡在说话时，猫先不说（别两个气泡一起说）；加班日什么都做不了，也不说
    // 0.5.4：月底那天付完账单会跌破银行的线——不受"新手提示"开关影响，盘前就讲清楚（试玩反馈：车没了才知道）；排在新玩法提示前面，免得被当天留着的提示压住
    if (!this.s.busy && !this.s.banner && st.phase === 'premarket' && !this.s.guide?.box()) {
      const r = bankRisk(st);
      if (r) {
        const text =
          r.kind === 'seize'
            ? `月底付完账单大概只剩 ${moneyShort(r.after)}，跌破收东西的线 ${moneyShort(r.line)}，${r.first}会被收走！${st.slots.some((h) => h) ? '先卖点股票去银行还钱' : '去银行还钱能保住它（还完要够付账单）'}`
            : `月底付完账单大概只剩 ${moneyShort(r.after)}，低于银行的警戒线 ${moneyShort(r.line)}，银行会打电话`;
        this.s.hint.show(text, st.dayIndex, this.s.anim, undefined, '银行提醒 · 今天付账单', true);
        this.s.board.setHighlight([], []);
        return;
      }
    }
    // 0.4 C 新机制的第一次提示：每条只说一次，不受"新手提示"开关影响（当天一直留着）
    if (!this.s.busy && !this.s.banner && st.phase === 'premarket' && !this.s.guide?.box() && st.ext) {
      if (!this.s.extTipNow || this.s.extTipNow.day !== st.dayIndex) {
        const tip = nextExtTip(st, loadSeenTips());
        if (tip) {
          markTipSeen(tip.id);
          this.s.extTipNow = { ...tip, day: st.dayIndex };
        } else if (this.s.extTipNow && this.s.extTipNow.day !== st.dayIndex) this.s.extTipNow = null;
      }
      if (this.s.extTipNow) {
        this.s.hint.show(this.s.extTipNow.text, st.dayIndex, this.s.anim, undefined, '新玩法 · 第一次见', true);
        this.s.board.setHighlight([], []);
        return;
      }
    }
    if (!this.s.hintsEnabled || this.s.busy || this.s.banner || st.phase !== 'premarket' || this.s.guide?.box() || topBar(st).busy) {
      this.s.hint.hide();
      this.s.board.setHighlight([], []);
      return;
    }
    const h = newbieHint(st);
    if (h) this.s.hint.show(h.text, st.dayIndex, this.s.anim);
    else this.s.hint.hide();
    // 看板只高亮和猫的提示、今天推荐有关的风口
    const recThemes = chatView(st).recs.filter((r) => !r.taken).map((r) => r.stock.theme);
    this.s.board.setHighlight(h?.theme ? [h.theme] : [], recThemes);
  }

  /** 教程每一步指向的区域。 */
  guideTarget(step: string, stockId: string | null): Rect | null {
    switch (step) {
      case 'chat':
        this.s.showTab('msgs');
        return this.s.chat.messagesRect();
      case 'rec':
        this.s.showTab('recs');
        return this.s.chat.recsRect();
      case 'open':
        return this.s.openBtn.isEnabled() ? { ...OPEN } : null;
      case 'goal':
        return this.s.top.billRect();
      case 'colors':
        return this.s.holdings.area();
      case 'heat':
        this.s.showTab('board');
        return this.s.board.rect();
      case 'chain':
      case 'boards': {
        const slot = stockId ? this.s.holdings.slotOf(stockId) : -1;
        return slot >= 0 ? this.s.holdings.rect(slot) : null;
      }
      case 'sell': {
        const slot = stockId ? this.s.holdings.slotOf(stockId) : -1;
        return slot >= 0 ? this.s.holdings.sellRect(slot) : null;
      }
      case 'bill':
        return this.s.reward?.area() ?? null;
      default:
        return null;
    }
  }

  /** 此刻能点的控件（教程气泡尽量不盖住）。 */
  clickableRects(): Rect[] {
    // 群聊整块也算：教程气泡盖住群聊会挡住正要讲的消息（试玩反馈）
    const out: Rect[] = [this.s.top.settings.rect(), this.s.top.help.rect(), { ...PHONE }, ...(this.s.tabs ? [this.s.tabs.area()] : [])];
    const hr = this.s.hint?.rect();
    if (hr) out.push(hr);
    const rc = this.s.recapCard?.rect();
    if (rc) out.push(rc);
    if (this.s.reward?.root.visible) return [...out, ...this.s.reward.buttonRects()];
    if (this.s.openBtn.isEnabled()) out.push({ ...OPEN });
    return [...out, ...this.s.holdings.buttonRects(), ...this.s.chat.buttonRects()];
  }
}
