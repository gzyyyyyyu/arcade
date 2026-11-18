import { buyError, chatView, formatPoints, holdingCards, ipoToday, isQuietDay, rewardView, stockById, type Action, validate, type GameState } from '../../core/index.ts';
import { IpoPanel } from '../trade/ipo.ts';
import { isTouch } from '../input.ts';
import { sound } from '../sound.ts';
import { addPaper } from '../ui/art.ts';
import { Button } from '../ui/button.ts';
import { MIN_TEXT_SIZE, addText, fitWidth } from '../ui/text.ts';
import { PORTRAIT, VIEW } from '../theme.ts';
import { hideTooltip } from '../ui/tooltip.ts';
import { recAction } from '../trade/chat.ts';
import type { PickMode } from '../trade/holdings.ts';
import { SLOTS } from '../trade/layout.ts';
import { rewardSlots } from '../trade/monthEnd.ts';
import { gearNow, isLiveRun, marginWarn } from '../live.ts';
import { loadViewPrefs } from '../meta/prefs.ts';
import { BankPanel, BuyDialog, HoldingMenu } from '../trade/ext.ts';
import { OVERLAY_FLAG } from '../ui/dialog.ts';
import { DELEVERAGE_TIP, AUTO_DELAY } from './tradeConsts.ts';
import type { TradeScene } from '../scenes/TradeScene.ts';

/** 玩家的操作：买入 / 换仓 / 卖出 / 加仓菜单 / 银行 / 减仓 / 开盘 / 快进 / 自动快进 / 三选一 / 事件选项 / 选格子模式。 */
export class TradeActions {
  readonly s: TradeScene;

  constructor(s: TradeScene) {
    this.s = s;
  }

  // ---------------------------------------------------------------- 操作

  onBuy(rec: number, short = false): void {
    const s = this.s.session.state;
    if (this.s.busy || s.phase !== 'premarket') return;
    const r = chatView(s).recs[rec];
    if (!r) return;
    const act = recAction(s, r);
    if (act.action === 'buy') {
      // 0.4 C：选买多少（试一口 / 半仓 / 重仓），押跌解锁后还能选押跌
      if (s.ext) this.openBuy(rec, undefined, short);
      else this.act({ type: 'buy', rec });
      return;
    }
    if (act.action !== 'replace') {
      sound.ui('denied');
      return;
    }
    // 满仓：选一格替换（原持仓卖出），再确认
    sound.ui('select');
    const cards = holdingCards(s);
    this.setPick(`把「${r.stock.name}」换进哪一格？原来那只会被卖掉`, {
      label: (slot) => (buyError(s, rec, slot) === null ? '换掉这只' : null),
      onPick: (slot) => {
        const old = cards[slot];
        if (s.ext) {
          this.clearPick();
          this.openBuy(rec, slot, short);
          return;
        }
        this.s.openConfirm(
          '换掉这一只？',
          `卖掉「${old?.name ?? ''}」（买入以来 ${formatPoints(old?.holdRet ?? 0)}），换成「${r.stock.name}」？`,
          '换掉',
          () => {
            this.clearPick();
            this.act({ type: 'buy', rec, slot });
          },
        );
      },
    });
  }

  /** 0.4 C：买多少的弹窗（点一个按钮就买）。 */
  openBuy(rec: number, slot: number | undefined, short: boolean): void {
    if (this.s.data.get(OVERLAY_FLAG)) return;
    sound.ui('select');
    hideTooltip(this.s);
    this.s.trackDialog(new BuyDialog(this.s, this.s.session.state, rec, slot, short, (a) => this.act(a)));
    this.s.session.notify();
  }

  /** 打新：点了群聊里的「打新」横条，开申购面板（试一口 / 半仓 / 重仓）。 */
  openIpo(): void {
    const s = this.s.session.state;
    const offer = ipoToday(s);
    if (!offer || this.s.busy || s.phase !== 'premarket' || this.s.data.get(OVERLAY_FLAG) || this.s.banner) return;
    sound.ui('select');
    hideTooltip(this.s);
    this.s.trackDialog(new IpoPanel(this.s, s, offer, (a) => this.act(a)));
    this.s.session.notify();
  }

  /** 推荐卡拖进了某格：空格就是买（有仓位玩法时先选买多少）；满仓拖到有持仓的格子就是换掉那一格。 */
  dropBuy(rec: number, slot: number): void {
    const s = this.s.session.state;
    const r = chatView(s).recs[rec];
    if (!r || this.s.busy || s.phase !== 'premarket') return;
    if (recAction(s, r).action !== 'replace') return this.onBuy(rec);
    const old = holdingCards(s)[slot];
    if (s.ext) return this.openBuy(rec, slot, false);
    this.s.openConfirm('换掉这一只？', `卖掉「${old?.name ?? ''}」（买入以来 ${formatPoints(old?.holdRet ?? 0)}），换成「${r.stock.name}」？`, '换掉', () => this.act({ type: 'buy', rec, slot }));
  }

  /** 在持仓卡上点了右键：弹出加仓 / 卖出菜单（没有仓位玩法的局没有菜单，直接卖）。 */
  onCardMenu(slot: number): void {
    this.s.claimRightClick();
    if (this.s.session.state.ext) this.openHolding(slot);
    else this.onSell(slot);
  }

  /** 0.4 C：手里这只怎么办（加仓 / 减一半 / 清仓）。 */
  openHolding(slot: number): void {
    const s = this.s.session.state;
    if (this.s.busy || s.phase !== 'premarket' || !s.slots[slot] || this.s.data.get(OVERLAY_FLAG) || this.s.banner) return;
    sound.ui('select');
    hideTooltip(this.s);
    this.s.trackDialog(new HoldingMenu(this.s, s, slot, (a) => this.act(a)));
    this.s.session.notify();
  }

  /** 0.4 C：银行面板。 */
  openBank(): void {
    const s = this.s.session.state;
    if (this.s.busy || s.phase !== 'premarket' || this.s.data.get(OVERLAY_FLAG) || this.s.banner) return;
    hideTooltip(this.s);
    this.s.trackDialog(new BankPanel(this.s, s, (a) => this.act(a)));
    this.s.session.notify();
  }

  /** 减仓按钮：实盘 2×/3× 且在开盘前才出现；快到清零线时换红色 */
  renderDeleverage(s: GameState): void {
    const x = gearNow(s);
    const show = isLiveRun(s) && x >= 2 && s.phase === 'premarket';
    this.s.deleverageBtn.setVisible(show);
    this.s.deleverageRing.setVisible(show && marginWarn(s) !== null);
    if (!show) return;
    this.s.deleverageBtn.setLabel(`减仓 ${x}×→${x - 1}×`);
    this.s.deleverageBtn.setEnabled(validate(s, { type: 'deleverage' }) === null).setLocked(this.s.busy);
  }

  /** 点了减仓：先问一句，确认了才执行 */
  onDeleverage(): void {
    const s = this.s.session.state;
    if (this.s.busy || this.s.banner || s.phase !== 'premarket' || validate(s, { type: 'deleverage' }) !== null) return;
    const x = gearNow(s);
    this.s.openConfirm(`减仓到 ${x - 1}×？`, DELEVERAGE_TIP, '减仓', () => this.act({ type: 'deleverage' }));
  }

  /** 交给会话执行；被规则拒绝（加班、T+1、现金不够等）时给一个轻提示，不能毫无反应。 */
  act(action: Action): void {
    const r = this.s.session.dispatch(action);
    if (r.error) this.s.tfx.toast(r.error);
  }

  /** 卡上的「卖出」（押跌的写「不押了」）、Shift+数字、拖出持仓区：一步全卖，不再先弹菜单。 */
  onSell(slot: number): void {
    if (this.s.busy || this.s.session.state.phase !== 'premarket') return;
    this.act({ type: 'sell', slot });
  }

  onOpen(): void {
    const s = this.s.session.state;
    if (this.s.busy || s.phase !== 'premarket' || this.s.holdings.picking) return;
    this.clearAuto();
    this.act({ type: 'open' });
  }

  /** 0.5：平淡日快进（按钮或 F）：这一天的结算快速翻过，只看账户跳动。 */
  onFast(): void {
    const s = this.s.session.state;
    if (this.s.busy || s.phase !== 'premarket' || this.s.holdings.picking || this.s.banner || this.s.data.get(OVERLAY_FLAG)) return;
    this.clearAuto();
    this.s.fastNext = true;
    sound.ui('click');
    this.act({ type: 'open' });
  }

  /** 盘前是不是"没什么事"的日子（规则层的平淡日；加班日本来就只能开盘，也算）。 */
  quietToday(s: GameState): boolean {
    return s.phase === 'premarket' && !!s.tempo && isQuietDay(s);
  }

  clearAuto(): void {
    this.s.autoTimer?.remove(false);
    this.s.autoTimer = null;
    if (this.s.session.autoPending) {
      this.s.session.autoPending = false;
      this.s.session.notify();
    }
  }

  /** 自动快进倒计时里玩家点了画面或按了键：这一天停下，等他自己开盘。 */
  cancelAuto(): void {
    if (!this.s.autoTimer) return;
    this.clearAuto();
    this.s.autoCancelDay = this.s.session.state.dayIndex;
    this.s.screen.setSub(isTouch() ? '停下了' : '停下了 · F 快进');
  }

  /**
   * 0.5 自动快进：设置里打开（默认开）、今天没什么事、上一天没有碰到高光 / 事件 / 目标变化时，
   * 停一小会儿（显示器上写着，点一下就停下）后自动快进开盘。教程在说话、对话框开着时不自动。
   */
  maybeAuto(): void {
    this.clearAuto();
    const s = this.s.session.state;
    if (!loadViewPrefs().autoQuiet || !this.quietToday(s) || this.s.stopHere || this.s.busy || this.s.banner) return;
    if (this.s.autoCancelDay === s.dayIndex || this.s.guide?.box() || this.s.data.get(OVERLAY_FLAG)) return;
    this.s.screen.setSub('自动快进… · 点一下停');
    this.s.session.autoPending = true;
    this.s.session.notify();
    this.s.autoTimer = this.s.time.delayedCall(AUTO_DELAY, () => {
      this.s.autoTimer = null;
      this.s.session.autoPending = false;
      const now = this.s.session.state;
      if (now.dayIndex !== s.dayIndex || !this.quietToday(now) || this.s.busy || this.s.data.get(OVERLAY_FLAG)) {
        this.s.session.notify();
        return;
      }
      this.s.fastNext = true;
      this.act({ type: 'open' });
    });
  }

  onPickReward(index: number): void {
    const s = this.s.session.state;
    const card = rewardView(s)[index];
    if (!card || this.s.busy) {
      // 离场动画已经播了，这一下没被接受：把卡摆回来，不留一个看不见又点不了的面板
      this.s.reward?.rest();
      return;
    }
    if (card.kind !== 'stock') {
      sound.cue({ type: 'reward', kind: card.kind });
      this.act({ type: 'pickReward', index });
      return;
    }
    // 稀有股票：选放进哪一格
    this.s.guide?.acted('bill');
    sound.ui('select');
    const ok = new Set(rewardSlots(s, index));
    this.s.reward?.setVisible(false);
    this.setPick(
      `把「${card.name}」放进哪一格？${s.slots.every((x) => x) ? '原来那只会被卖掉' : ''}`,
      {
        label: (slot, c) => (ok.has(slot) ? (c ? '换掉这只' : '放这里') : null),
        onPick: (slot) => {
          this.clearPick();
          sound.cue({ type: 'reward', kind: 'stock' });
          this.act({ type: 'pickReward', index, slot });
        },
      },
      () => this.s.reward?.setVisible(true),
    );
  }

  onSkipReward(): void {
    if (this.s.busy) {
      this.s.reward?.rest();
      return;
    }
    sound.cue({ type: 'reward', kind: null });
    this.act({ type: 'skipReward' });
  }

  onChoose(option: number): void {
    if (this.s.busy) return;
    sound.ui('click');
    this.act({ type: 'choose', option });
  }

  // ---------------------------------------------------------------- 选格子模式

  setPick(text: string, mode: PickMode, onCancel?: () => void): void {
    this.clearPick();
    this.s.holdings.setPicking(mode);
    const t = addText(this.s, 0, 0, text, { size: 16, bold: true, originY: 0.5 });
    // 提示条压在顶栏那一行上（手机上 SLOTS.y - 58 正好是顶栏），但不能盖住左上角的回大厅：
    // 窄屏（360 竖屏的世界只有 718 宽）居中会伸到回大厅上面，盖住了还点得到。左端让到回大厅右边，
    // 右边放不下就整体往左收、再放不下就把字缩小
    const lobby = this.s.top.lobby.rect();
    const minX = lobby.x + lobby.w + 6;
    const cam = this.s.cameras.main;
    const maxR = cam.scrollX + this.s.scale.width / cam.zoom - 4;
    // 竖屏版（0.33.0）：顶栏两行，提示条整宽盖在第二行（目标、账单、道具、银行）上，不碰第一行的大厅、怎么玩、设置
    const pt = PORTRAIT;
    const room = pt ? VIEW.w - 8 - 150 : maxR - minX - 150;
    for (let size = 16; t.width > room && size > MIN_TEXT_SIZE; size--) t.setFontSize(size - 1);
    if (pt) fitWidth(t, room);
    const w = pt ? VIEW.w - 8 : t.width + 150;
    const x = pt ? 4 : Math.max(minX, Math.min(SLOTS.x + SLOTS.w / 2 - w / 2, maxR - w));
    const y = pt ? SLOTS.y - 52 : SLOTS.y - 58;
    const paper = addPaper(this.s, x, y, w, 46, false);
    t.setPosition(x + 20, y + 23);
    // 竖屏版键高 34：点击区上下各撑 8，正好夹在第一行的怎么玩、设置（到 51）和持仓格（102 起）中间
    this.s.bannerCancel = new Button(this.s, x + w - 104, y + (pt ? 6 : 8), {
      width: 90,
      height: pt ? 34 : 30,
      label: '取消',
      fontSize: 14,
      hotkey: 'Esc',
      onClick: () => {
        this.clearPick();
        onCancel?.();
      },
    });
    this.s.banner = this.s.add.container(0, 0, [paper, t, this.s.bannerCancel]).setDepth(30);
    this.s.openBtn.setLocked(true);
    this.s.guide?.suspend();
    this.s.session.notify();
  }

  clearPick(): void {
    const had = this.s.banner !== null;
    if (this.s.holdings?.picking) this.s.holdings.setPicking(null);
    this.s.banner?.destroy();
    this.s.banner = null;
    this.s.bannerCancel = null;
    this.s.openBtn?.setLocked(this.s.busy);
    if (had && !this.s.busy) {
      this.s.guide?.resume(this.s.session.state);
    }
  }

  /** 点持仓卡：窗户那块换成这一格今天的拆解条（今天刚买的写明明天才有）。 */
  inspect(slot: number): void {
    if (this.s.busy || !this.s.recapCard) return;
    const s = this.s.session.state;
    const h = s.slots[slot];
    if (!h) return;
    const last = s.lastDay;
    const hm = last?.holdings.find((x) => x.slot === slot && x.stockId === h.stockId && (x.parts?.length ?? 0) > 0) ?? null;
    sound.ui('select');
    this.s.recapCard.showBreakdown(slot, stockById(h.stockId).name, hm);
    this.s.session.notify();
    // 0.4 C：点手里的股票，顺手弹出"加仓 / 减一半 / 清仓"
    if (s.ext) this.openHolding(slot);
  }
}
