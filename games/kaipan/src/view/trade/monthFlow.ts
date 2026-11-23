import type Phaser from 'phaser';
import { currentCalendar, eventView, formatMoney, friendView, itemView, monthThemeView, type GameEvent, type GameState } from '../../core/index.ts';
import { floatText } from '../fx/effects.ts';
import { sound } from '../sound.ts';
import { COLOR, PHONE as PHONE_MODE, PORTRAIT, VIEW } from '../theme.ts';
import { Button } from '../ui/button.ts';
import { addText } from '../ui/text.ts';
import { PHONE_RECT as PHONE } from '../trade/layout.ts';
import { eventResult, monthIntro } from '../trade/monthEnd.ts';
import { coverOf } from '../viewport.ts';
import { gearNow } from '../live.ts';
import { bankCallCard, seizedCard } from '../trade/ext.ts';
import { collateralById } from '../../core/index.ts';
import { monthCard, SPEND_HEAD } from '../trade/tempoFx.ts';
import { pick, first, T } from './tradeConsts.ts';
import type { TradeScene } from '../scenes/TradeScene.ts';

/** 月底和新月份：奖励 / 事件之后的衔接、月初看点卡、银行来电、清零卡、「继续」按钮。 */
export class MonthFlow {
  readonly s: TradeScene;

  constructor(s: TradeScene) {
    this.s = s;
  }

  /** 开了杠杆、跌到清零线：一张卡说清楚这局按 0 结，等玩家点了再去结束页 */
  async playMarginCall(): Promise<void> {
    sound.cue({ type: 'runLost' });
    const layer = this.s.add.container(0, 0).setDepth(300);
    const cv = coverOf(this.s);
    layer.add(this.s.add.rectangle(cv.x, cv.y, cv.w, cv.h, COLOR.ink, 0.45).setOrigin(0, 0).setInteractive());
    // 竖屏版：卡跟屏宽、放在屏幕正中
    const cw = PHONE_MODE ? Math.min(520, VIEW.w - 16) : 560;
    const cy = PORTRAIT ? VIEW.h / 2 : PHONE_MODE ? 190 : 330;
    const x = gearNow(this.s.session.state);
    const body = addText(this.s, VIEW.w / 2, cy + 6, `开了杠杆 ×${x}，资产跌到了清零线，这局按 0 结。\n杠杆越高，赢得越多，也越容易一下清零。`, {
      size: 16,
      color: COLOR.ink,
      originX: 0.5,
      originY: 0.5,
      wrap: cw - 60,
      align: 'center',
      lineSpacing: 4,
    });
    const ch = body.height + 110;
    const panel = this.s.add.rectangle(VIEW.w / 2, cy, cw, ch, COLOR.paper).setRounded(18).setStrokeStyle(4, COLOR.danger);
    const title = addText(this.s, VIEW.w / 2, cy - ch / 2 + 34, '清零了', { size: 30, bold: true, color: COLOR.danger, originX: 0.5, originY: 0.5 });
    layer.add([panel, title, body]);
    this.showContinue(layer, '看看这一局怎么样');
    this.s.setBusy(false);
    await this.s.waitContinue();
    this.s.continueBtn = null;
  }

  /** 弹一张要点"知道了"的大卡（银行来电、东西被收走），等玩家点了再往下播。 */
  async popup(make: (onOk: () => void) => { root: Phaser.GameObjects.Container; button: Button }): Promise<void> {
    const c = make(() => this.s.continueInput());
    this.s.continueBtn = c.button;
    this.s.session.notify();
    // 不用点也会在几秒后自己收起（少打断一次）；点"知道了"可以马上收
    const timer = this.s.time.delayedCall(3200, () => this.s.continueInput());
    await this.s.waitContinue();
    timer.remove(false);
    this.s.continueBtn = null;
    c.root.destroy();
  }

  /** 银行这一天的动作：打电话、收走东西（开盘结算或月底）。 */
  async playBank(events: GameEvent[]): Promise<void> {
    const a = this.s.anim;
    for (const e of events) {
      if (e.type === 'bankCalled') {
        sound.cue({ type: 'news', kind: 'warning' });
        await this.popup((ok) => bankCallCard(this.s, a, e.debt, ok));
      } else if (e.type === 'seized') {
        sound.cue({ type: 'news', kind: 'delisted' });
        const d = collateralById(e.id);
        void this.s.top.rollAccount(a, e.before, e.after, 400);
        const why = e.line !== undefined && e.debt !== undefined ? { cause: e.cause ?? 'trade', account: e.before, line: e.line, debt: e.debt } : null;
        await this.popup((ok) => seizedCard(this.s, a, d.name, d.lost, e.amount, e.penalty, why, ok));
      }
    }
  }

  /** 选完奖励：新群友入群提示 →（事件）或新月份开场 → 下一天。 */
  async playAfterReward(next: GameState, events: GameEvent[]): Promise<void> {
    const joined = pick(events, 'friendJoined');
    for (const j of joined) {
      const name = next.friends.some((f) => f.id === j.friendId) ? friendView(next, j.friendId).name : j.friendId;
      this.s.notes.push(`${name} 加入了群聊`);
    }
    this.s.render(next);
    if (joined.length > 0) {
      sound.cue({ type: 'friendJoin' });
      this.s.tfx.glyphPop('horn', PHONE.x + 40, PHONE.y + 140, 30, 600);
      floatText(this.s, this.s.anim, PHONE.x + PHONE.w / 2, PHONE.y + 140, '新群友进群了！', COLOR.accentDark, { size: 18, pop: true, hold: 600 });
    }
    if (next.phase === 'premarket') {
      this.s.room.setTime('morning', this.s.anim);
      this.s.setBusy(true);
      await this.playMonthIntro(events);
      this.s.setBusy(false);
      await this.s.chat.intro(this.s.anim, T.chatGap);
    }
  }

  /** 事件结果文案 → 新月份开场 → 下一天。 */
  async playAfterEvent(prev: GameState, next: GameState, events: GameEvent[]): Promise<void> {
    const r = first(events, 'eventResolved');
    this.s.event?.destroy();
    this.s.event = null;
    // 接着就是新月份的看点卡时，事件结果写进看点卡里（少点一次"继续"）
    if (r && next.phase === 'premarket' && first(events, 'monthStarted') && monthThemeView(next)) {
      const name = eventView(prev)?.name ?? '事件';
      sound.cue({ type: 'eventResult', delta: r.delta });
      if (Math.abs(r.delta) >= 0.5) void this.s.top.rollAccount(this.s.anim, prev.account, next.account, 500);
      this.s.render(next);
      this.s.room.setTime('morning', this.s.anim);
      this.s.setBusy(true);
      await this.playMonthIntro(events, [`${name} · 后来呢：${r.text}${Math.abs(r.delta) >= 0.5 ? `（${formatMoney(r.delta, { sign: true })}）` : ''}`]);
      this.s.setBusy(false);
      await this.s.chat.intro(this.s.anim, T.chatGap);
      return;
    }
    if (r) {
      const name = eventView(prev)?.name ?? '事件';
      const res = eventResult(this.s, this.s.anim, `${name} · 后来呢`, r.text, r.delta, () => this.s.continueInput());
      if (Math.abs(r.delta) >= 0.5) void this.s.top.rollAccount(this.s.anim, prev.account, next.account, 500);
      this.s.continueBtn = res.button;
      this.s.session.notify();
      await this.s.waitContinue();
      this.s.continueBtn = null;
      res.root.destroy();
    }
    this.s.render(next);
    if (next.phase === 'premarket') {
      this.s.room.setTime('morning', this.s.anim);
      this.s.setBusy(true);
      await this.playMonthIntro(events);
      this.s.setBusy(false);
      await this.s.chat.intro(this.s.anim, T.chatGap);
    }
  }

  async playMonthIntro(events: GameEvent[], lead: string[] = []): Promise<void> {
    const ms = first(events, 'monthStarted');
    if (!ms) return;
    const s = this.s.session.state;
    const surprise = (s.bill.extras ?? []).map((e) => `${SPEND_HEAD}：${e.name} ${formatMoney(-e.amount)}（已经算进这个月要还的钱里）`);
    const extras = [
      // 市场传闻（股灾预告）、到期的临时道具、事件的延后结算，再是打新
      ...pick(events, 'marketNotice').map((e) => `${e.notice.name}：${e.notice.text}`),
      ...pick(events, 'itemExpired').map((e) => `${itemView(e.itemId).name}到期了，不再起作用`),
      ...pick(events, 'pendingSettled').map((e) => `${e.text}${e.delta ? `（${formatMoney(e.delta, { sign: true })}）` : ''}`),
      ...pick(events, 'itemTriggered')
        .filter((e) => events.indexOf(e) > events.indexOf(ms))
        .map((e) => `${itemView(e.itemId).name}：${e.text}${e.delta ? `（${formatMoney(e.delta, { sign: true })}）` : ''}`),
    ];
    if (!this.s.anim.instant) this.s.chat.hideAll();
    const all = [...lead, ...surprise, ...extras];
    // 有月度主题时弹"本月看点"卡（主题、目标、奖励、开场白、群友吐槽 + 这个月要还的钱），没有时照旧
    const mt = monthThemeView(s);
    const ev = first(events, 'monthTheme');
    let box: Phaser.GameObjects.Container;
    let ms2 = T.monthIntro + Math.min(3, all.length) * 600;
    const done = (): void => this.s.anim.hurry();
    if (mt) {
      const cal = currentCalendar(s);
      const card = monthCard(
        this.s,
        this.s.anim,
        s,
        { month: s.month, name: mt.name, intro: mt.intro, rule: mt.rule, goalText: mt.goalText, rewardText: mt.rewardText, boss: mt.goal.boss, roast: ev?.roast ?? null },
        cal,
        s.bill,
        all,
        done,
      );
      box = card.root;
      this.s.cardRect = card.rect;
      ms2 = (mt.goal.boss ? T.bossCard : T.monthCard) + Math.min(3, all.length) * 500;
      this.s.top.render(s);
    } else box = monthIntro(this.s, currentCalendar(s), s.bill, all, done);
    sound.mood('payday');
    this.s.session.notify();
    // 附加说明多时多留一会儿读（点击或空格可以跳过）
    await this.s.anim.wait(ms2);
    box.destroy();
    this.s.cardRect = null;
    sound.mood(s.mood);
    this.s.anim.relax();
  }

  /** 账单之后的「继续」按钮（爆仓 / 通关）。 */
  showContinue(layer: Phaser.GameObjects.Container, label: string): void {
    // 手机上账单卡偏左、高度占满，按钮放到右边印章下面
    // 手机世界宽窄不定（718–960）、高 404：按群聊那一块的位置放，底边离画面下沿 8
    const b = new Button(this.s, PHONE_MODE ? Math.min(VIEW.w - 8 - 220, PHONE.x + (PHONE.w - 220) / 2) : VIEW.w / 2 - 110, PHONE_MODE ? VIEW.h - 8 - 52 : 600, { width: 220, height: 52, label, variant: 'primary', fontSize: 18, hotkey: '空格', onClick: () => this.s.continueInput() });
    layer.add(b);
    this.s.continueBtn = b;
  }
}
