import Phaser from 'phaser';
import { formatMoney, friendView, type GameEvent, type StockQuip } from '../../core/index.ts';
import { hasArt } from '../assets.ts';
import { flashBox } from '../fx/effects.ts';
import { sparkles } from '../fx/particles.ts';
import { sound } from '../sound.ts';
import { COLOR, VIEW } from '../theme.ts';
import { addGlyph, addImage } from '../ui/art.ts';
import type { Glyph } from '../assets.ts';
import { addText } from '../ui/text.ts';
import { StockGuy } from '../ui/stockGuy.ts';
import { viewRandom } from '../ui/stable.ts';
import { PHONE_RECT as PHONE } from '../trade/layout.ts';
import { quipBubble } from '../trade/quip.ts';
import type { Animator } from '../fx/anim.ts';
import { knowledgeToast } from '../trade/ext.ts';
import { type Ev, pick, TOAST } from './tradeConsts.ts';
import type { TradeScene } from '../scenes/TradeScene.ts';

/** 交易场景的短动画和飘字：轻提示、飞金币、买卖反馈、群友气泡、龙头连线。 */
export class TradeFx {
  readonly s: TradeScene;

  constructor(s: TradeScene) {
    this.s = s;
  }

  /** 开盘按钮上方的一条轻提示（不压小结卡、猫和群聊），1.8 秒后消失（关掉动画时也显示）。 */
  toast(msg: string, ms = 1800, denied = true): void {
    if (denied) sound.ui('denied');
    this.s.toastNode?.destroy();
    this.s.toastTimer?.remove();
    const t = addText(this.s, 0, 0, msg, { size: 15, bold: true, color: COLOR.white, originX: 0.5, originY: 0.5, wrap: TOAST.w - 36, align: 'center' });
    const w = Math.min(TOAST.w, t.width + 36);
    const h = t.height + 16;
    const bg = this.s.add.rectangle(0, 0, w, h, COLOR.ink, 0.88).setRounded(h / 2);
    const c = this.s.add.container(TOAST.x, TOAST.y, [bg, t]).setDepth(260);
    this.s.toastRect = { x: TOAST.x - w / 2, y: TOAST.y - h / 2, w, h };
    this.s.toastNode = c;
    this.s.lastToast = msg;
    this.s.toastTimer = this.s.time.delayedCall(ms, () => {
      if (this.s.toastNode === c) this.s.toastNode = null;
      c.destroy();
    });
  }

  /** 飘字旁边配一个图标（弹出、停一下、淡出）；动画关闭时不放。 */
  glyphPop(g: Glyph, x: number, y: number, size = 34, hold = 700): void {
    if (this.s.anim.instant) return;
    const img = addGlyph(this.s, x, y, g, size).setDepth(171).setScale(0);
    const sc = (size / Math.max(1, img.width)) || 1;
    this.s.tweens.add({ targets: img, scale: { from: 0, to: sc }, duration: 200, ease: 'Back.easeOut' });
    this.s.tweens.add({ targets: img, alpha: 0, y: y - 24, delay: 200 + hold, ease: 'Sine.easeIn', duration: 300, onComplete: () => img.destroy() });
  }

  /** 买入：一个小人从推荐卡飞进格子，格子里的小人落地时弹一下。 */
  flyIn(slot: number, stockId: string, from: { x: number; y: number }): void {
    const card = this.s.holdings.card(slot);
    const to = this.s.holdings.head(slot);
    if (!card?.guy || !to) return;
    const guy = card.guy;
    guy.setAlpha(0);
    const ghost = new StockGuy(this.s, from.x, from.y + 20, stockId, guy.faceNow, 48, { idle: false }).setDepth(150);
    const midX = (from.x + to.x) / 2;
    this.s.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 420,
      ease: 'Sine.easeInOut',
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 1;
        const bx = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * midX + t * t * to.x;
        const by = (1 - t) * (1 - t) * (from.y + 20) + 2 * (1 - t) * t * (Math.min(from.y, to.y) - 120) + t * t * (to.y + guy.size);
        ghost.setPosition(bx, by).setScale(1 + t * (guy.size / 48 - 1));
      },
      onComplete: () => {
        ghost.destroy();
        if (guy.active) {
          guy.setAlpha(1);
          this.s.tweens.add({ targets: guy, scaleY: { from: 0.8, to: 1 }, duration: 220, ease: 'Back.easeOut' });
        }
      },
    });
  }

  /** 卖出：几枚金币从格子飞回顶栏的钱包（亏了也飞，只是少几枚、颜色灰一点）。 */
  coinsHome(from: { x: number; y: number }, holdRet: number): void {
    const to = this.s.top.walletAt();
    const n = holdRet > 0 ? 7 : 4;
    for (let i = 0; i < n; i++) {
      const c = addImage(this.s, from.x + (viewRandom() - 0.5) * 50, from.y + (viewRandom() - 0.5) * 30, 'fx:coin', 22).setDepth(160);
      if (holdRet <= 0) c.setTint(0xc8c0b8);
      this.s.tweens.add({
        targets: c,
        x: to.x,
        y: to.y,
        scale: c.scale * 0.6,
        delay: i * 60,
        duration: 520,
        ease: 'Cubic.easeIn',
        onComplete: () => c.destroy(),
      });
    }
    this.s.time.delayedCall(n * 60 + 520, () => {
      if (this.s.sys.isActive()) this.s.top.pulseAccount();
    });
  }

  /** 卖出到账：「+¥金额」从卡上弹出，飞向持仓区的现金格（没有现金格时飞向顶栏钱包）。 */
  cashFly(from: { x: number; y: number }, amount: number): void {
    if (this.s.anim.instant || !(amount > 0)) return;
    const r = this.s.holdings.cashArea();
    const to = r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : this.s.top.walletAt();
    const t = addText(this.s, from.x, from.y - 30, `+${formatMoney(amount)}`, { size: 20, bold: true, num: true, color: COLOR.up, originX: 0.5, originY: 0.5, stroke: 0xffffff, strokeWidth: 5 }).setDepth(168).setScale(0.5);
    this.s.tweens.add({ targets: t, scale: 1.1, duration: 140, ease: 'Back.easeOut' });
    // 到了现金格：一声「落袋」，现金格轻轻亮一下
    this.s.tweens.add({
      targets: t,
      x: to.x,
      y: to.y,
      scale: 0.7,
      alpha: 0.25,
      delay: 260,
      duration: 520,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        t.destroy();
        if (!this.s.sys.isActive()) return;
        sound.cue({ type: 'pocket' });
        if (r) flashBox(this.s, this.s.anim, r.x, r.y, r.w, r.h, COLOR.gold, 30);
      },
    });
  }

  /** 群友对买入、借钱、赎回的反应：手机下方冒一句。 */
  showComments(list: readonly Ev<'comment'>[]): void {
    // 冒在推荐卡上方（叠着往上摞），不盖住推荐卡；今天没有推荐卡时在手机下方
    const recs = this.s.chat.recsRect();
    let anchor = recs ? recs.y - 4 : PHONE.y + PHONE.h - 150;
    list.slice(0, 2).forEach((c) => {
      const name = this.s.session.state.friends.some((f) => f.id === c.friendId) ? friendView(this.s.session.state, c.friendId).name : '群友';
      const q = quipBubble(this.s, this.s.anim, PHONE.x + PHONE.w / 2, anchor, `${name}：${c.text}`, 3200);
      this.s.quips.push(q);
      this.s.commentQuips.push(q.root);
      anchor = q.rect.y - 4;
    });
  }

  /** 第一次触发新机制：顶上滑出"点亮小知识"。 */
  showLearned(events: GameEvent[]): void {
    const ids = pick(events, 'learned').map((e) => e.id);
    if (ids.length === 0) return;
    this.s.knowNode?.destroy();
    this.s.knowNode = knowledgeToast(this.s, this.s.anim, ids);
    if (this.s.knowNode && this.s.anim.instant) {
      // 关掉动画时多留一会儿再收起
      const node = this.s.knowNode;
      this.s.time.delayedCall(4000, () => node.active && node.destroy());
    }
  }

  /** 涨停、押对时群友刷屏：手机下半截冒一两句（不挡推荐卡，收盘时推荐卡已经收起）。 */
  spam(lines: { name: string; text: string }[]): void {
    let y = PHONE.y + PHONE.h - 60;
    lines.forEach((l, i) => {
      this.s.time.delayedCall(i * 220, () => {
        const q = quipBubble(this.s, this.s.anim, PHONE.x + PHONE.w / 2 + (i % 2 === 0 ? -30 : 30), y, `${l.name}：${l.text}`, 1700, VIEW.w - 10);
        this.s.quips.push(q);
        y = q.rect.y - 6;
      });
    });
  }

  /** 龙头带动的连线光效：光带从 from 伸到 to，光点沿线跑过去。 */
  beam(from: { x: number; y: number }, to: { x: number; y: number }): void {
    const a = this.s.anim;
    if (a.instant || !hasArt(this.s.textures, 'fx:link_beam')) return;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    const img = addImage(this.s, from.x, from.y, 'fx:link_beam', 1, 22).setOrigin(0, 0.5).setRotation(ang).setDepth(145);
    a.fx({ targets: img, displayWidth: len, duration: 220, ease: 'Quad.easeOut' });
    a.fx({ targets: img, alpha: 0, delay: 520, duration: 260 }, () => img.destroy());
    if (!a.calm && hasArt(this.s.textures, 'fx:link_spark')) {
      const spark = addImage(this.s, from.x, from.y, 'fx:link_spark', 30).setDepth(146).setBlendMode(Phaser.BlendModes.ADD);
      a.fx({ targets: spark, x: to.x, y: to.y, duration: 320, ease: 'Sine.easeInOut' }, () => {
        spark.destroy();
        sparkles(this.s, a, to.x, to.y, 8);
      });
    }
  }

  /** 股票小人冒台词（收盘时的涨停、跌停、连续涨停、退市、自动卖出；盘前的买入、卖出）。 */
  showQuips(a: Animator, list: readonly StockQuip[]): void {
    for (const q of list) {
      if (q.slot === null) continue;
      const head = this.s.holdings.head(q.slot) ?? this.s.holdings.center(q.slot);
      const rect = this.s.holdings.rect(q.slot);
      if (!head || !rect) continue;
      this.s.quips.push(quipBubble(this.s, a, head.x, Math.min(head.y, rect.y + 70) - 30, q.text, 2200, PHONE.x - 4));
    }
  }
}
