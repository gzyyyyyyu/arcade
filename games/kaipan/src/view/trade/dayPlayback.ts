import { BALANCE, faceOf, formatMoney, formatPoints, ipoToday, itemView, monthThemeView, runMonths, shortNeed, stockById, swanNotice, type GameEvent, type GameState, type HoldingMove, type StockMove } from '../../core/index.ts';
import { floatText, pop, shake } from '../fx/effects.ts';
import { swanCurtain, swanGlow } from '../fx/swan.ts';
import { ipoDraw, ipoGlow } from '../fx/ipo.ts';
import { fireworks, rainCloud } from '../fx/particles.ts';
import { isTouch } from '../input.ts';
import { sound } from '../sound.ts';
import { COLOR, PHONE as PHONE_MODE, VIEW, signColor } from '../theme.ts';
import { downPaymentRow, pctArrow } from '../labels.ts';
import { addText } from '../ui/text.ts';
import { hideTooltip } from '../ui/tooltip.ts';
import { playBill } from '../trade/monthEnd.ts';
import { BILL_MS } from '../trade/billTiming.ts';
import { revealShown } from '../labels.ts';
import { recapOf } from '../recap.ts';
import { loadViewPrefs } from '../meta/prefs.ts';
import { squeezeFx } from '../trade/ext.ts';
import { SWAN_DEFS } from '../../core/index.ts';
import { flipTone, shout, shoutOf, spamLines, spottedText, HIGHLIGHT_RANK, type FlipTone } from '../trade/tempoFx.ts';
import { pick, first, SHOUT_AT, T, FAST } from './tradeConsts.ts';
import type { TradeScene } from '../scenes/TradeScene.ts';

/** 一天的结算演出：开盘翻牌 → 龙头带动 → 道具 → 账户跳动 → 高光 / 目标 → 消息揭晓 → 收盘小结 → 月底账单。 */
export class DayPlayback {
  readonly s: TradeScene;

  constructor(s: TradeScene) {
    this.s = s;
  }

  /**
   * 收盘逐张结算：每张持仓的盈亏数字依次从卡上弹出、飞向顶栏账户，账户数字跟着一下一下滚，
   * 一张一个音（赚的音高逐张上行，亏的是低沉的一下）；账户层的加成（借钱放大、分散投资等道具）排在最后，从道具图标飞来。
   * 间隔按条数缩短，总时长不超过 rollMs 的 1.3 倍（最多 9 条时约 0.63 秒）；快进（anim.instant）时直接落到结果。
   */
  async settleChain(holdings: readonly HoldingMove[], before: number, after: number, effects: readonly { source: string; amount: number }[], rollMs: number): Promise<void> {
    const a = this.s.anim;
    const rows = holdings.filter((h) => Math.abs(h.amount) >= 0.5).sort((x, y) => x.slot - y.slot);
    const extra = effects.filter((e) => Math.abs(e.amount) >= 0.5);
    const n = rows.length + extra.length;
    if (n === 0) return this.s.top.rollAccount(a, before, after, rollMs);
    const gap = Math.max(70, Math.min(170, Math.floor(rollMs / n)));
    const dest = this.s.top.accountAt();
    const items = [
      ...rows.map((h) => ({ at: this.s.holdings.head(h.slot) ?? this.s.holdings.center(h.slot) ?? dest, amount: h.amount })),
      ...extra.map((e) => ({ at: this.s.top.itemCenter(e.source) ?? this.s.top.walletAt(), amount: e.amount })),
    ];
    // 整段由一个计数器驱动（进度 0…n，第 i 条占 [i, i+1)）：每条的音和飞行在进度跨过 i 时触发，账户数字按已结算的累加 + 当前这条的缓动。
    // 不逐条 await：软件渲染等低帧率下每条至少等一帧的话，倍速越高越拖不快
    let fired = 0;
    await a.count(
      0,
      n,
      n * gap,
      (v) => {
        const k = Math.min(n, Math.floor(v + 1e-9));
        let shown = before;
        for (let i = 0; i < Math.min(k, n); i++) shown += items[i]!.amount;
        if (k < n) shown += items[k]!.amount * (1 - (1 - (v - k)) ** 2);
        this.s.top.setAccount(shown);
        for (; fired <= Math.min(k, n - 1); fired++) {
          const it = items[fired]!;
          if (a.instant) continue;
          sound.cue({ type: 'tally', index: fired, up: it.amount > 0 });
          this.flyAmount(it.at, dest, it.amount, gap);
          if (fired > 0) this.s.top.nudgeAccount(a);
        }
      },
      'Linear',
    );
    // 取整误差、没列出的零头：落到收盘后的真实数字
    this.s.top.setAccount(after);
    this.s.top.nudgeAccount(a);
    this.s.top.floatDelta(a, after - before);
  }

  /** 一条盈亏数字「+¥金额」：在起点弹出，然后飞向账户大数字，到了淡掉。 */
  flyAmount(from: { x: number; y: number }, to: { x: number; y: number }, amount: number, gap: number): void {
    const t = addText(this.s, from.x, from.y, formatMoney(amount, { sign: true }), { size: 17, bold: true, num: true, color: signColor(amount), originX: 0.5, originY: 0.5, stroke: 0xffffff, strokeWidth: 5 })
      .setDepth(168)
      .setScale(0.4);
    this.s.anim.fx({ targets: t, scale: 1.05, duration: Math.min(150, gap + 40), ease: 'Back.easeOut' });
    this.s.anim.fx(
      { targets: t, x: to.x, y: to.y, scale: 0.7, alpha: { from: 1, to: 0.15 }, delay: Math.min(150, gap + 40), duration: 340, ease: 'Cubic.easeIn' },
      () => t.destroy(),
    );
    // 快进中途 fx 直接收尾也要清掉
    this.s.time.delayedCall(900, () => t.active && t.destroy());
  }

  /**
   * 一天的结算：开盘翻牌（持仓卡一张张翻开，大涨大跌涨停跌停各有特效）→ 龙头带动 → 道具 → 账户跳动；
   * 然后高光 / 连击大字、目标进度、消息揭晓、播报和吐槽、收盘小结；月底账单或下一天。
   * fast（平淡日快进）：节拍压到约五分之一，只看翻牌和账户跳动；碰到高光、目标变化照常播。
   */
  async playDay(prev: GameState, next: GameState, events: GameEvent[], fast = false): Promise<void> {
    const a = this.s.anim;
    const k = fast ? FAST : 1;
    this.s.setBusy(true);
    // 盘前群友对买入 / 借钱的那句评论到开盘就收掉：开盘后群聊换成新一天的推荐，留着会盖住新的推荐卡
    for (const r of this.s.commentQuips) {
      if (!r.active) continue;
      this.s.tweens.killTweensOf(r);
      r.destroy();
    }
    this.s.commentQuips = [];
    this.s.acts.clearPick();
    this.s.quietBtn.setVisible(false);
    this.s.holdings.setDayWord('今天');
    hideTooltip(this.s);
    sound.cue({ type: 'marketOpen' });
    pop(a, this.s.openBtn, 0.92);
    this.s.setMonitorLine(fast ? '快进中…' : '开盘！');
    // 快进时一天一两秒，色调来回换会闪：停在清晨，只有月底算账才入夜
    if (!fast) {
      this.s.room.setTime('day', a);
      this.s.room.flashLights(a);
    }
    this.s.screen.setSub(isTouch() ? '点屏幕跳过' : '空格跳过');
    // 黑天鹅日：开盘先全屏报幕（盘前已预告过）
    const swanOpen = first(events, 'swanOpen');
    if (swanOpen) {
      sound.cue({ type: 'swan', down: SWAN_DEFS[swanOpen.notice.kind].down });
      this.s.setMonitorLine('黑天鹅！');
      await swanCurtain(this.s, a, swanOpen.notice);
    }
    // 节拍按同一个起点累计（waitUntil），低帧率时不会每段都晚一帧、越拖越长
    const t0 = a.now();
    let off = 0;
    const beat = (ms: number): Promise<void> => {
      off += ms * k;
      return a.waitUntil(t0, off);
    };
    const sms = pick(events, 'stockMoved');
    // 开盘翻牌：手里的股票先盖上牌背（快进时不盖）
    if (!fast && sms.length > 0) this.s.holdings.coverAll(a);
    await beat(T.open * 0.6);

    // ① 大盘天气与题材热度
    const mm = first(events, 'marketMoved');
    if (mm && mm.mood !== this.s.room.currentMood) {
      this.s.room.setMood(mm.mood, a);
      sound.cue({ type: 'weather', to: mm.mood });
    }
    if (mm) sound.mood(mm.mood);
    const tms = pick(events, 'themeMoved');
    const up = tms.filter((t) => t.dH >= 2).length;
    const down = tms.filter((t) => t.dH <= -2).length;
    if (!fast) sound.cue({ type: 'heat', up, down, max: Math.max(0, ...tms.map((t) => Math.abs(t.dH))) });
    const themeMs = Math.round(T.themes * 0.6 * k);
    await this.s.board.animate(a, tms, themeMs);
    // 热度动完：看板的数字、走势、状态一起换成收盘后的（不然同屏的新闻、账单和看板对不上）
    this.s.board.render(next);
    off += themeMs;

    // ② 开盘翻牌：持仓一张张翻开（龙头带动的跟涨先不算，③ 再跳）
    const steps = new Map<number, HoldingMove & { stock: StockMove }>();
    const tones: FlipTone[] = [];
    for (const [i, e] of sms.entries()) {
      steps.set(e.slot, e);
      const pre = e.stock.move - e.stock.chain;
      const role = stockById(e.stockId).role;
      const shown = revealShown(e);
      const flags = { short: e.short === true, limitUp: e.stock.limitUp && e.stock.chain === 0, limitDown: e.stock.limitDown };
      const tone = flipTone(shown, flags);
      tones.push(tone);
      this.s.holdings.flip(a, e.slot, fast ? 'flat' : tone);
      // 押跌的格子直接揭晓自己的收益（它涨你亏，含被轧）；不然会先闪一下股票本身的 +10% 再变成亏损
      this.s.holdings.reveal(a, e.slot, pre, shown, role, { ...flags, blown: e.stock.blown, jump: e.stock.jump });
      sound.cue({ type: 'reveal', move: pre, limit: flags.limitUp ? 'up' : flags.limitDown ? 'down' : null, index: i });
      if (!fast && (tone === 'bigUp' || tone === 'bigDown')) sound.cue({ type: 'settle', ret: tone === 'bigUp' ? 6 : -6 });
      await beat(T.reveal * 0.75);
    }
    this.s.holdings.clearCovers();
    if (sms.length > 0) await beat(T.afterReveal * 0.5);
    // 涨停、押对时群友刷屏一两句
    if (!fast && !a.instant) {
      const spam = tones.some((t) => t === 'shortWin') ? 'short' : tones.some((t) => t === 'limitUp') ? 'up' : tones.filter((t) => t === 'bigUp').length >= 2 ? 'big' : null;
      if (spam) this.s.tfx.spam(spamLines(next, spam, next.dayIndex));
    }
    // 押跌的股票涨停：被轧（屏幕抖、红闪、大字）
    for (const e of pick(events, 'squeezed')) {
      const r = this.s.holdings.rect(e.slot);
      sound.cue({ type: 'squeeze' });
      squeezeFx(this.s, a, r ? r.x + r.w / 2 : VIEW.w / 2, r ? r.y + (PHONE_MODE ? 70 : 4) : SHOUT_AT.y + 90, stockById(e.stockId).name);
      await beat(1000);
    }

    // ③ 龙头带动：从龙头（不在持仓时从题材徽记）连线到持仓里的跟风股，跟风数字再跳一下
    let chainIdx = 0;
    for (const c of pick(events, 'chain')) {
      if (c.held.length === 0) continue;
      const leaderSlot = this.s.holdings.slotOf(c.leader);
      const from = c.leaderHeld && leaderSlot >= 0 ? this.s.holdings.head(leaderSlot) : this.s.board.badgeCenter(stockById(c.leader).theme);
      if (!from) continue;
      for (const f of c.held) {
        const slot = this.s.holdings.slotOf(f);
        const e = steps.get(slot);
        const to = this.s.holdings.head(slot);
        if (!e || !to) continue;
        if (!fast) this.s.tfx.beam(from, to);
        sound.cue({ type: 'chain', index: chainIdx++ });
        const limit = BALANCE.roles[stockById(f).role].limit;
        this.s.holdings.card(slot)?.guy?.setFace(faceOf(e.stock.move, limit));
        this.s.holdings.card(slot)?.guy?.bounce(a, 0.6);
        floatText(this.s, a, to.x, to.y + 26, `带飞 ${pctArrow(e.stock.chain)}`, COLOR.accentDark, { size: 14, pop: true });
        void this.s.holdings.rollToday(a, slot, revealShown({ ...e, stock: { chain: 0 } }), 300);
      }
      await beat(T.chain * 0.7);
    }

    // ④ 道具触发：图标闪一下，写明改动，该格数字跳到这一步之后的值
    const stepIndex = new Map<number, number>();
    const acc = first(events, 'accountChanged');
    const accIdx = acc ? events.indexOf(acc) : events.length;
    for (const [i, e] of events.entries()) {
      if (i > accIdx) break;
      if (e.type === 'itemTriggered') {
        this.s.top.flashItem(a, e.itemId);
        sound.cue({ type: 'item', id: e.itemId, delta: e.delta });
        const name = itemView(e.itemId).name;
        const at = e.slot !== null ? this.s.holdings.head(e.slot) : this.s.top.itemCenter(e.itemId);
        // 落在某一格的道具只写「道具名 +x%」（卡片已经说明是哪只），账户级的写全文
        const label = e.slot !== null ? `${name} ${pctArrow(e.delta)}` : `${name}：${e.text}`;
        if (at) floatText(this.s, a, at.x, at.y + (e.slot !== null ? 26 : 50), label, COLOR.accentDark, { size: 14, pop: true, hold: 600 });
        if (e.slot !== null) {
          const h = steps.get(e.slot);
          if (h) {
            const k2 = h.steps.findIndex((st, j) => j > (stepIndex.get(e.slot as number) ?? 0) && st.source === e.itemId);
            const st = k2 >= 0 ? h.steps[k2] : undefined;
            if (st && k2 >= 0) {
              stepIndex.set(e.slot, k2);
              void this.s.holdings.rollToday(a, e.slot, st.value, 300);
            }
          }
        }
        await beat(T.item * 0.75);
      } else if (e.type === 'stockNews' && e.held) {
        const slot = this.s.holdings.slotOf(e.stockId);
        const at = slot >= 0 ? this.s.holdings.head(slot) : null;
        const label = e.news === 'uncap' ? '翻身了！' : e.news === 'warning' ? `退市警告 ${e.warnings}/${BALANCE.st.warnings}` : '退市了…';
        sound.cue({ type: 'news', kind: e.news });
        if (at) floatText(this.s, a, at.x, at.y + 30, label, e.news === 'uncap' ? COLOR.up : COLOR.danger, { size: 15, pop: true, hold: 600 });
        await beat(T.item * 0.75);
      } else if (e.type === 'autoSold') {
        const at = this.s.holdings.center(e.slot);
        const label = e.reason === 'stop' ? '跌太多，自动卖了' : e.reason === 'take' ? '赚够了，自动卖了' : '退市了，移出';
        sound.cue({ type: 'autoSold', reason: e.reason });
        if (at) floatText(this.s, a, at.x, at.y + 40, `${label} ${formatPoints(e.holdRet)}`, signColor(e.holdRet), { size: 15, pop: true, hold: 600 });
        this.s.holdings.card(e.slot)?.root.setAlpha(0.55);
        await beat(T.item * 0.75);
      }
    }
    // 收尾：每格数字落到最终收益
    for (const [slot, h] of steps) void this.s.holdings.rollToday(a, slot, h.ret, 200);

    // ⑤ 账户滚动；涨停放烟花、跌停飘雨云
    const report = first(events, 'dayClosed')?.report ?? null;
    if (acc) {
      sound.cue({ type: 'settle', ret: acc.ret });
      const rollMs = Math.round(T.account * (fast ? 0.5 : 0.8));
      // 平淡日快进沿用整块滚动；正常的日子一张一张结算（持仓、账户层加成依次飞进总额）
      // 每格的盈亏金额在收盘报告里（stockMoved 事件发出时还没分摊，amount 是 0）
      const rolling = fast || a.calm || !report ? this.s.top.rollAccount(a, acc.before, acc.after, rollMs) : this.settleChain(report.holdings, acc.before, acc.after, report.account.effects, rollMs);
      let fw = 0;
      for (const [slot, h] of steps) {
        const head = this.s.holdings.head(slot);
        const rect = this.s.holdings.rect(slot);
        if (!head || !rect) continue;
        // 烟花、雨云放在卡片上沿之上，不挡住小人和数字
        head.y = Math.min(head.y, rect.y + 10);
        if (h.stock.limitUp) {
          this.s.time.delayedCall(fw * 160, () => fireworks(this.s, a, head.x, head.y - 34, h.stock.boards >= 3));
          if (fw === 0) sound.cue({ type: 'limitUp' });
          fw += 1;
        } else if (h.stock.limitDown) {
          rainCloud(this.s, a, head.x, head.y - 30);
          sound.cue({ type: 'limitDown' });
        }
      }
      this.s.tfx.showQuips(a, pick(events, 'quip'));
      // 黑天鹅收盘：躲过 / 受益的持仓亮绿光，被砸的变灰震屏
      const swanR = first(events, 'dayClosed')?.report.swan;
      if (swanR) {
        const downKind = SWAN_DEFS[swanR.kind].down;
        for (const [slot, h] of steps) {
          const rect = this.s.holdings.rect(slot);
          if (!rect || (!downKind && h.swan === undefined)) continue;
          swanGlow(this.s, a, rect, (h.swan ?? 0) >= 0);
        }
        const text = swanR.money < 0 ? `黑天鹅中招 ${formatMoney(swanR.money)}` : swanR.money > 0 ? `黑天鹅送了 ${formatMoney(swanR.money, { sign: true })}` : '躲过了黑天鹅';
        floatText(this.s, a, VIEW.w / 2, SHOUT_AT.y + 150, text, swanR.money < 0 ? COLOR.danger : 0x2e8b57, { size: 24, pop: true, hold: 1300, depth: 170 });
      }
      await rolling;
    }
    await this.playIpo(events);
    if (report) {
      this.s.setMonitorMoney(report.account.after - report.account.before, report.account.ret);
      this.s.screen.setSub('收盘');
      if (!fast) {
        this.s.room.setTime('dusk', a);
        // 收盘：总账数字砸一下，赚了的话金币从显示器飞进钱包（都不占节拍）
        pop(a, this.s.monitor, 1.25);
        if (report.account.after - report.account.before >= 1) this.s.tfx.coinsHome({ x: this.s.monitor.x, y: this.s.monitor.y }, report.account.ret);
      }
      // 房间跟着今天的结果——赚了掉金币、亏了飘乌云，大盘大涨挂彩虹
      this.s.room.celebrate(a, report.account.ret);
      this.s.room.setRainbow(report.market.ret >= 1.5);
    }
    // ⑥ 高光、连击：屏幕中部大字（快进时也照常播，最多两条）；连击的红包让账户再跳一下；目标进度、达成、没达成。
    // 大字和群聊那边（揭晓盖章 → 播报、吐槽、新闻）一起播，两边都播完才往下走：排队的话一天多挡 1.5 秒左右
    const tempo = this.playTempo(prev, next, events, report);
    // 消息揭晓（当天的、前几天的多日消息），然后播报、吐槽和新闻
    await this.s.chat.judge(a, pick(events, 'messageJudged'), T.judge * k, next);
    await this.s.chat.judgeIntel(a, pick(events, 'intelJudged'), T.judge * k);
    // 新股上市当天也播一条（排最前：是你手里的）
    const listed = pick(events, 'ipoListed').map((e) => `新股${stockById(e.stockId).name}（你手里的）上市首日 ${formatPoints(report?.stocks.find((m) => m.id === e.stockId)?.move ?? e.premium)}`);
    const ticker = [...listed, ...pick(events, 'spotted').sort((x, y) => Number(y.held) - Number(x.held)).map((e) => spottedText(e))];
    await this.s.chat.afterClose(a, pick(events, 'comment'), report?.news ?? [], T.comment * k, ticker, report ?? null);
    const stopped = await tempo;
    // 股灾：收盘后才揭晓，所有题材提前退潮
    if (first(events, 'crashHit')) {
      sound.cue({ type: 'weather', to: 'bear' });
      shake(this.s, a, 320, 0.008);
      this.s.tfx.glyphPop('storm', VIEW.w / 2, SHOUT_AT.y + 102, 64, 1100);
      floatText(this.s, a, VIEW.w / 2, SHOUT_AT.y + 150, '股灾！风口全部↓', COLOR.down, { size: 26, pop: true, hold: 1200, depth: 170 });
      this.s.setMonitorLine('股灾！');
      this.s.screen.setSub('全部降温');
      await a.wait(1200);
    }
    // 熬夜复盘：揭示一个题材今天收盘时的阶段（看板上标到明天盘前）
    const rv = first(events, 'themeReviewed');
    if (rv) {
      const c = this.s.board.badgeCenter(rv.theme);
      if (c) floatText(this.s, a, c.x + 90, c.y, itemView('night_review').name, COLOR.info, { size: 14, pop: true, hold: 500 });
    }
    // 收盘小结：今天最精彩的事 + 总账一句 + 每只一行（设置里可以改成只看总账）
    if (report) this.s.recapCard?.showRecap(recapOf(report, '今天'), this.s.hints.recapBrief(), a, '今天');
    await a.wait(T.hold * k);
    // 银行：打电话、收走东西（卡片自己几秒后收起，不用点）；付完月底账单才跌破线的，等账单收据出来再说
    const billBank = events.some((e) => e.type === 'seized' && e.cause === 'bill');
    if ((first(events, 'bankCalled') || first(events, 'seized')) && !billBank) {
      await this.s.month.playBank(events);
    }
    this.s.tfx.showLearned(events);
    // 下一天要不要停下来等玩家：今天有高光 / 连击 / 目标变化 / 事件 / 银行 / 新月份，或者今天本身不平淡
    this.s.stopHere =
      stopped ||
      // 黑天鹅预告出现的几天自动快进要停下来，让玩家看到预告、有机会布局
      !!swanNotice(next) ||
      // 打新：申购日、出签和上市首日也停下来，让玩家看到横条和结果
      !!ipoToday(next) ||
      events.some((e) => e.type === 'ipoDrawn' || e.type === 'ipoListed') ||
      report?.tempo?.quiet === false ||
      !report?.tempo ||
      // 摘帽 / 戴帽 / 退市只在是你拿着的那只时停（全市场哪只出新闻都停的话，平淡日几乎从不自动快进）
      events.some((e) => e.type === 'eventStarted' || e.type === 'monthStarted' || e.type === 'bankCalled' || e.type === 'seized' || e.type === 'crashHit' || e.type === 'autoSold' || (e.type === 'stockNews' && e.held));

    // 开了杠杆、收盘后跌到清零线：一张卡说清楚，点了去结束页（月底还完账单后跌到的在账单卡后面说）
    const called = first(events, 'gearWiped');
    if (called && !first(events, 'billPaid')) {
      await this.s.month.playMarginCall();
      return;
    }

    // 月底
    const paid = first(events, 'billPaid');
    const broke = first(events, 'bankrupt');
    if (paid || broke) {
      sound.mood('payday');
      // 突发账单明细（总额已含在 amount 里）
      const extras = (prev.bill.extras ?? []).map((e) => ({ name: e.name, amount: e.amount }));
      const info = paid
        ? { month: paid.month, name: prev.bill.name, amount: paid.amount, before: paid.before, after: paid.after, paid: true, credit: paid.credit, extras, interest: pick(events, 'interestPaid').reduce((n, e) => n + e.amount, 0) }
        : { month: broke?.month ?? prev.month, name: prev.bill.name, amount: broke?.amount ?? 0, before: broke?.account ?? 0, after: broke?.account ?? 0, paid: false, credit: false, extras };
      // 本月目标写在账单上
      const mt = monthThemeView(prev);
      const goal = mt ? { name: mt.name, done: mt.goal.done || !!first(events, 'goalDone') } : undefined;
      // 短局：还上了、又不是最后一个月，账单里多一行收据：剩下的账单加首付还差多少（最后一个月的账单里已经含着首付）
      const dp = paid && paid.month < runMonths(prev) ? shortNeed(next) : null;
      const downPayment = paid && dp ? downPaymentRow(paid.after, dp.need) : undefined;
      const quick = loadViewPrefs().bill === 'quick';
      a.relax();
      this.s.room.setTime('night', a);
      const bill = await playBill(this.s, a, { ...info, goal, downPayment }, quick);
      if (paid) this.s.top.setAccount(paid.after);
      if (billBank) await this.s.month.playBank(events);
      if (called) {
        bill.destroy();
        await this.s.month.playMarginCall();
        return;
      }
      if (broke || first(events, 'runWon')) {
        this.s.month.showContinue(bill, broke ? '看看这一局怎么样' : '通关了！看看这一局');
        this.s.setBusy(false);
        await this.s.waitContinue();
        this.s.continueBtn = null;
        return; // Session 随后切到结束页
      }
      await a.wait(quick ? BILL_MS.quick : BILL_MS.hold);
      bill.destroy();
    }
    this.s.setBusy(false);
    this.s.render(next);
    // 到了第二天开盘前：小结改口说「昨天」
    if (report && this.s.recapCard?.showing === 'recap') this.s.recapCard.showRecap(recapOf(report, '昨天'), this.s.hints.recapBrief(), null, '昨天');
    if (next.phase === 'premarket') {
      a.relax();
      this.s.room.setTime('morning', a);
      if (first(events, 'monthStarted')) await this.s.month.playMonthIntro(events);
      await this.s.chat.intro(a, T.chatGap * (fast && !first(events, 'monthStarted') ? 0.5 : 1));
      // 新的一天：教程和猫的提示按新局面重新说
      this.s.hints.syncGuide();
    }
  }

  /**
   * 打新的收盘演出：上市首日的卡片溢价亮金、破发变灰；出签那天申购中的卡摇号，翻出中签金卡或「没中签，现金退回」。
   * 摇号约 1 秒，期间收盘节拍等着（动画关闭时不画，只在大屏上写一行结果）。
   */
  async playIpo(events: GameEvent[]): Promise<void> {
    const a = this.s.anim;
    for (const e of pick(events, 'ipoListed')) {
      const r = this.s.holdings.rect(e.slot);
      if (!r) continue;
      ipoGlow(this.s, a, r, e.premium);
      floatText(this.s, a, r.x + r.w / 2, r.y + 4, e.premium >= 0 ? `上市首日 ${formatPoints(e.premium)}` : `上市就跌 ${formatPoints(e.premium)}`, signColor(e.premium), { size: 20, pop: true, hold: 900, depth: 172 });
    }
    for (const e of pick(events, 'ipoDrawn')) {
      sound.cue({ type: 'ipo', won: e.won });
      this.s.setMonitorLine(e.won ? '抽中了！' : '没抽中，现金退回');
      const r = this.s.holdings.rect(e.slot);
      if (r) await ipoDraw(this.s, a, r, e.won, e.offer);
    }
  }

  /**
   * 收盘的节奏反馈：高光 / 连击大字（按精彩程度挑两条）、连击红包让账户跳一下、顶栏目标进度跳动或盖章。
   * 返回今天有没有值得停下来看的事（自动快进碰到就停）。
   */
  async playTempo(prev: GameState, next: GameState, events: GameEvent[], report: { tempo?: { streak: number } } | null): Promise<boolean> {
    const a = this.s.anim;
    const hs = pick(events, 'highlight').filter((h) => h.kind !== 'headline');
    const combos = pick(events, 'combo');
    const goalEv = events.filter((e) => e.type === 'goalProgress' || e.type === 'goalDone' || e.type === 'goalFailed');
    if (hs.length === 0 && combos.length === 0 && goalEv.length === 0) return false;
    a.relax();
    // 连击红包、目标奖励的钱：账户再跳一下（收盘结算之后才加的）
    const acc = first(events, 'accountChanged');
    const settled = acc ? acc.after : prev.account;
    const bonus = combos.reduce((n, c) => n + c.cash, 0) + pick(events, 'goalDone').reduce((n, g) => n + g.cash, 0);
    const streak = report?.tempo?.streak ?? 0;
    const list = [...hs].sort((x, y) => HIGHLIGHT_RANK[y.kind] - HIGHLIGHT_RANK[x.kind]);
    const top = list.slice(0, 2);
    // 只有连击没有别的高光时，也喊一句
    if (top.length === 0 && combos[0]) top.push({ type: 'highlight', kind: 'combo', text: combos[0].text });
    for (const [i, h] of top.entries()) {
      const sh = shoutOf(h, streak);
      if (!sh) continue;
      sound.cue(sh.good ? { type: 'rewardShow' } : { type: 'news', kind: 'warning' });
      shout(this.s, a, sh.title, sh.sub, sh.good, SHOUT_AT.x, SHOUT_AT.y);
      // 第二条接得快一点：两条都满等，一天的设计时长会超过 8 秒
      await a.wait(i === 0 ? T.shout : T.shout * 0.6);
    }
    if (Math.abs(bonus) >= 0.5 && Math.abs(next.account - settled) >= 0.5) {
      sound.cue({ type: 'reward', kind: 'item' });
      void this.s.top.rollAccount(a, settled, next.account, 400);
    }
    // 碎片：在道具栏旁边飘一句
    combos
      .filter((x) => x.kind !== 'streak')
      .forEach((c, i) => {
        const at = this.s.top.billRect();
        floatText(this.s, a, at.x + at.w / 2, at.y + at.h + 28 + i * 26, c.text, COLOR.accentDark, { size: 15, pop: true, hold: 1100, depth: 170 });
      });
    // 目标：进度变了跳一下；达成 / 没达成盖章
    const done = first(events, 'goalDone');
    const failed = first(events, 'goalFailed');
    if (done || failed) {
      this.s.top.goalChanged(a, next, done ? 'done' : 'failed');
      // 月底那天出结果的：账单上会写，不再单独飘一行字、多停 0.9 秒
      const billDay = events.some((e) => e.type === 'billPaid' || e.type === 'bankrupt');
      if (failed && !done && !billDay) this.s.tfx.glyphPop('target', SHOUT_AT.x - 150, SHOUT_AT.y, 34, 800);
      if (failed && !done && !billDay) floatText(this.s, a, SHOUT_AT.x, SHOUT_AT.y, `本月目标没达成：${monthThemeView(prev)?.name ?? ''}`, COLOR.muted, { size: 20, pop: true, hold: 900, depth: 170 });
      if (!billDay) await a.wait(900);
    } else if (first(events, 'goalProgress')) {
      this.s.top.goalChanged(a, next, 'progress');
    }
    // 只有目标进度变化（没有高光、连击、达成）不算"停下来"的理由：每天都可能动一点
    return top.length > 0 || !!done || !!failed;
  }
}
