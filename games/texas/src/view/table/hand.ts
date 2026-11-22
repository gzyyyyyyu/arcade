/** 一步一步的大动画（TableHand）：一步操作、一手打完、新的一手发牌（table.ts 拆分） */
import { el } from '../dom.ts';
import { boardPos, buttonPos, isPacked, isTop, potPos } from '../layout.ts';
import { badBeatTag, celebrate, coinBurst, edgeGlow, handBanner, potFlight, spotlight } from '../fx.ts';
import { play } from '../sound.ts';
import type { Action, HandResult, LogEntry } from '../../core/table.ts';
import type { View } from '../../core/view.ts';
import { putIn } from '../../core/fame.ts';
import { badBeat, celebration, potTier } from '../../fun/climax.ts';
import { chips } from '../text.ts';
import { EQ, type Frame } from './types.ts';
import { MS } from '../timing.ts';
import { frameOf, showName, tagOf, tagFor, isBetting, putBy } from './frame.ts';
import { potName, potsOf, shave } from './result.ts';
import { chipNode, backNode } from './nodes.ts';
import type { TableCtx } from './context.ts';
import type { TableScene } from './base.ts';
import type { TableMotion } from './motion.ts';
import { must } from '../../must.ts';

/** 牌型金牌为了不压名牌最多往下挪多少（舞台像素）：1280×720 上名牌和公共牌之间大约空着这么多 */
const MAX_DODGE = 48;

export class TableHand {
  private readonly c: TableCtx;
  private readonly scene: TableScene;
  private readonly motion: TableMotion;

  constructor(c: TableCtx, scene: TableScene, motion: TableMotion) {
    this.c = c;
    this.scene = scene;
    this.motion = motion;
  }

  async animate(prev: View, next: View, seat: number | null, action: Action | null): Promise<void> {
    const ended = prev.phase !== 'idle' && next.lastHand !== null && next.lastHand.handNo === prev.handNo;
    const fresh = next.phase !== 'idle' && (ended || prev.phase === 'idle' || next.handNo !== prev.handNo);
    const f = frameOf(prev);
    this.scene.draw(f);

    // 1. 这一步的操作：冒一句话、推筹码或弃牌
    if (seat !== null && action && isBetting(action) && prev.seats[seat]?.status === 'active') {
      // 一手在这一步打完时，停着的视图（hold）里 log 还是这一手的；老的房间状态（不停）已经是下一手了，只能按动作说
      const log = ended && !next.hold ? null : (next.log.slice(prev.log.length).find((e) => e.seat === seat) ?? null);
      const put = ended ? putBy(prev, seat, action) : Math.max(0, must(next.seats[seat], 'next.seats[seat]').total - must(prev.seats[seat], 'prev.seats[seat]').total);
      const s = must(f.seats[seat], 'f.seats[seat]');
      const folded = log ? log.act === 'fold' : action.t === 'fold' || (action.t === 'timeout' && put === 0 && prev.currentBet > s.bet);
      s.tag = log ? tagOf(log) : tagFor(action, put, s.stack, s.bet + put);
      this.scene.draw(f);
      this.motion.pop(seat);
      // 电脑全下：按性格偶尔说一句
      if (log?.allin && s.owner === 'house' && seat !== this.c.me && log.act !== 'sb' && log.act !== 'bb') this.motion.speak(seat, s.persona, prev.handNo, log.act === 'call' ? 'callAllin' : 'allin');
      if (folded) {
        play('fold');
        await this.motion.muck(seat, f);
      } else if (put > 0) {
        play(log?.allin ? 'allin' : 'chip');
        // 全下（不算交盲注交到没钱）：桌子暗下去、聚光打在他身上
        if (log?.allin && log.act !== 'sb' && log.act !== 'bb') spotlight(this.c.fx, this.scene.seatPt(seat), this.c.opts.pace());
        await this.motion.fly(chipNode(put), this.scene.seatPt(seat), this.scene.betPt(seat), MS.chip);
        s.stack -= put;
        s.bet += put;
        if (s.stack === 0) s.status = 'allin';
        this.scene.draw(f);
      } else {
        play('check');
        await this.motion.pause(MS.check);
      }
    } else if (seat !== null && action?.t === 'show') {
      // 主动亮牌：翻牌的声音、头像跳一下，牌由 show(next) 摆出来
      play('reveal');
      this.motion.pop(seat);
    } else if (seat !== null && action?.t === 'leave' && prev.seats[seat]?.status === 'active') {
      play('fold');
      await this.motion.muck(seat, f);
    }

    if (ended) {
      // 停着的视图里 log 是这一手完整的；老的房间状态只能用上一步的（少最后一下，一般是跟注，不影响认诈唬）
      await this.finish(f, must(next.lastHand, 'next.lastHand'), next.hold ? next.log : prev.log);
    } else if (next.board.length > prev.board.length) {
      // 2. 这一轮结束：收注，发公共牌
      await this.motion.pause(MS.street * 0.4);
      await this.motion.collect(f, next.pots);
      await this.motion.dealBoard(f, next.board, prev.board.length);
    }

    // 3. 新的一手：先把上一手的结果收掉，再挪按钮、交盲注、一张张发底牌
    if (fresh) {
      await this.clear(ended ? null : f);
      await this.newHand(next);
    }
  }

  // ---------- 一手打完 ----------

  /** 收池、补发的公共牌、亮牌、分池；播完停在结果上（结果条、赢的五张），由下一手发牌时收 */
  async finish(f: Frame, r: HandResult, log: readonly LogEntry[]): Promise<void> {
    await this.motion.pause(MS.street * 0.4);
    // 没人跟的那部分这时还在他面前的下注里：先一起收进池子，再退回给他
    await this.motion.collect(f, r.uncalled ? [...potsOf(r).slice(0, -1), (potsOf(r).at(-1) ?? 0) + r.uncalled.amount] : potsOf(r));
    // 全下后补发的公共牌：一张一张慢慢翻，最有看头
    const runout = !r.byFold && r.shown.length >= 2 && r.board.length > f.board.length;
    if (runout) await this.motion.runOut(f, r);
    else if (r.board.length > f.board.length) await this.motion.dealBoard(f, r.board, f.board.length, r.byFold ? 1 : 1.8);
    if (r.uncalled) {
      const u = r.uncalled;
      f.pots = shave(f.pots, u.amount);
      this.scene.draw(f);
      await this.motion.fly(chipNode(u.amount), potPos(this.c.g), this.scene.seatPt(u.seat), MS.chip);
      must(f.seats[u.seat], 'f.seats[u.seat]').stack += u.amount;
      this.scene.draw(f);
    }
    const bluffs: number[] = [];
    if (!r.byFold) {
      // 亮牌：一家一家翻过来，标上牌型；最后下注的人只有高牌，是诈唬，标出来
      for (const sh of r.shown) {
        const s = must(f.seats[sh.seat], 'f.seats[sh.seat]');
        s.cards = [...sh.hole];
        s.hand = showName(log, sh);
        if (s.hand.endsWith('诈唬')) bluffs.push(sh.seat);
        this.scene.draw(f);
        // 全下补牌时底牌已经翻开过了：只换上牌型名，不再响一遍
        if (!runout) play('reveal');
        await this.motion.pause(runout ? MS.reveal * 0.4 : MS.reveal);
      }
    }
    // 结果条先出来、赢的五张亮起来，再一个池子一个池子分给赢的人
    f.result = r;
    this.scene.draw(f);
    // 大池子（40 个大盲以上）收给赢家：筹码哗啦一串
    // 池子越大筹码声越足：叮一下 → 一小串 → 哗啦 → 再加一记低频的堆叠
    const tier = potTier(r.pots.reduce((a, p) => a + p.amount, 0), f.bb);
    const big = tier >= 2;
    play((['potS', 'potM', 'bigpot', 'potXL'] as const)[tier]);
    if (big) edgeGlow(this.c.fx, this.c.opts.pace());
    for (const [k, pot] of r.pots.entries()) {
      await Promise.all(
        pot.winners.map(async (w) => {
          const to = this.scene.seatPt(w.seat);
          const d = MS.potFly * this.c.opts.pace();
          const lead = chipNode(w.won, 'big');
          if (r.pots.length > 1) el('span', 'fly-label', lead, potName(k, r.pots.length));
          // 筹码飞到一半多一点就开始入账、数字开始滚：滚数和落地的叮嗒叠在一起，飞完时数字已经走了一大半。
          // 滚数不占牌局时间（不 await）；时长 0.6–0.9 秒，随赢的数目略放长
          let landed = false;
          const land = (): void => {
            if (landed) return;
            landed = true;
            const s = must(f.seats[w.seat], 'f.seats[w.seat]');
            const n = this.c.seats[w.seat];
            if (n) n.roll = Math.min(900, 600 + 300 * Math.min(1, w.won / (20 * f.bb)));
            s.stack += w.won;
            s.win = true;
            this.scene.draw(f);
            play('stackup');
            this.motion.landPulse(w.seat);
          };
          const timer = window.setTimeout(land, d * 0.6);
          await potFlight(this.c.fx, lead, potPos(this.c.g), to, MS.potFly * this.c.opts.pace(), { pace: this.c.opts.pace(), tier, quick: this.c.opts.quick?.() === true });
          window.clearTimeout(timer);
          land();
        }),
      );
      f.pots = f.pots.slice(1);
      this.scene.draw(f);
      if (k < r.pots.length - 1) await this.motion.pause(MS.potGap);
    }
    f.pots = [];
    this.scene.draw(f);
    const mine = r.pots.reduce((a, p) => a + (p.winners.find((x) => x.seat === this.c.me)?.won ?? 0), 0);
    // 大牌（葫芦及以上）赢：庆祝的和弦代替普通的赢声
    const cele = celebration(r);
    if (cele) {
      play(cele.tier === 2 ? 'cele2' : 'cele1');
      const quick = this.c.opts.quick?.() === true;
      celebrate(this.c.fx, { at: this.scene.seatPt(cele.seat), mid: this.motion.bigTextPt(cele.seat), w: this.c.g.w, h: this.c.g.h, pace: this.c.opts.pace(), tier: cele.tier, text: cele.text, quick });
    } else if (mine > 0) play('win');
    // 摊牌我亮了牌却没赢到：轻轻两个往下的音（弃牌认输不响）
    else if (!r.byFold && r.shown.some((x) => x.seat === this.c.me)) play('lose');
    // 摊牌：赢的牌型名在公共牌上方放大停一下（大牌庆祝自己有横幅，不再叠；结果条照旧）。只是画面，不占牌局时间
    if (!r.byFold && !cele) {
      const hn = f.seats[r.pots[0]?.winners[0]?.seat ?? -1]?.hand ?? '';
      if (hn && !hn.endsWith('诈唬') && !hn.startsWith(EQ)) {
        const b = boardPos(this.c.g, 2);
        handBanner(this.c.fx, { x: b.x, y: b.y - (this.c.g.tall ? 74 : 100) }, hn, this.c.opts.pace(), this.c.opts.quick?.() === true, (e) => this.clearOfPlates(e));
      }
    }
    // 被逆转：转牌时领先 80% 以上的人输了；等 kit 的名场面横幅（约 2.1 秒，压在顶上的座位上）收了再冒一个小签
    const beat = badBeat(r);
    if (beat) {
      const p = this.scene.seatPt(beat.loser);
      window.setTimeout(() => {
        play('badbeat');
        badBeatTag(this.c.fx, this.c.seats[beat.loser]?.avatar ?? null, p, this.c.opts.pace(), isTop(p, this.c.g));
      }, (this.c.opts.quick?.() ? 600 : 2_300) * this.c.opts.pace());
    }
    const winners = new Set(r.pots.flatMap((p) => p.winners.map((x) => x.seat)));
    for (const seat of winners) {
      // 赢家头像里迸出金币（大锅更多更远）
      coinBurst(this.c.fx, this.scene.seatPt(seat), this.c.opts.pace(), big || cele?.seat === seat, isTop(this.scene.seatPt(seat), this.c.g));
      this.motion.float(seat, `+${chips(r.pots.reduce((a, p) => a + (p.winners.find((x) => x.seat === seat)?.won ?? 0), 0))}`);
    }
    this.afterHand(f, r, winners, bluffs, log);
  }

  /**
   * 一手打完电脑说一句（一手最多一句）：亮出来是诈唬的，被抓了、成了都有反应；
   * 下了注别人都弃了的，偶尔得意一句（不亮牌，说的话和他真拿的什么无关，不漏底牌）；赢了大池子的得意一句
   */
  afterHand(f: Frame, r: HandResult, winners: Set<number>, bluffs: number[], log: readonly LogEntry[]): void {
    const house = (i: number): boolean => f.seats[i]?.owner === 'house' && i !== this.c.me;
    const b = bluffs.find(house);
    if (b !== undefined) return void this.motion.speak(b, must(f.seats[b], 'f.seats[b]').persona, r.handNo, winners.has(b) ? 'bluffWon' : 'caught', true);
    const w = [...winners].find(house);
    if (w !== undefined) {
      const pot = r.pots.reduce((a, p) => a + p.amount, 0);
      const lastBet = log.findLast((e) => e.act === 'bet' || e.act === 'raise');
      if (r.byFold && lastBet?.seat === w && pot >= 10 * f.bb) return void this.motion.speak(w, must(f.seats[w], 'f.seats[w]').persona, r.handNo, 'bluffWon');
      if (pot >= 40 * f.bb) return void this.motion.speak(w, must(f.seats[w], 'f.seats[w]').persona, r.handNo, 'bigWin', true);
    }
    // 输了大池子：这一手投进去 ≥ 40 个大盲、又没赢的电脑，偶尔嘟囔一句
    const loser = [...putIn(log)].find(([s, v]) => v >= 40 * f.bb && !winners.has(s) && house(s));
    if (loser) this.motion.speak(loser[0], must(f.seats[loser[0]], 'f.seats[loser[0]]').persona, r.handNo, 'bigLoss');
  }

  /** 收掉桌上上一手的牌和结果（下一手发牌前）。f 为 null 时按现在摆着的收 */
  async clear(f0: Frame | null): Promise<void> {
    const f = f0 ?? this.c.frame;
    if (!f) return;
    const out: Promise<void>[] = [];
    f.seats.forEach((s, i) => {
      if (s.cards.length) out.push(this.motion.muck(i, f, true));
      s.hand = '';
      s.win = false;
      s.tag = '';
    });
    f.board.forEach((_, i) => out.push(this.motion.flyFrom(must(this.c.boardCards[i], 'this.c.boardCards[i]'), boardPos(this.c.g, i), this.scene.deckPt(), MS.clear)));
    f.board = [];
    f.result = null;
    f.pots = [];
    this.scene.draw(f);
    await Promise.all(out);
  }

  async newHand(v: View): Promise<void> {
    const f = frameOf(v);
    // 先摆成"还没发牌、盲注还在面前"的样子
    const dealt = f.seats.map((s) => s.cards.length);
    const blinds = f.seats.map((s) => s.bet);
    for (const s of f.seats) {
      s.cards = [];
      s.stack += s.bet;
      s.bet = 0;
      s.tag = '';
    }
    this.scene.draw(f);
    await this.motion.pause(MS.blinds * 0.6);
    // 盲注
    const sb = v.log.find((e) => e.act === 'sb');
    const bb = v.log.find((e) => e.act === 'bb');
    await Promise.all(
      blinds.map(async (b, i) => {
        if (!b) return;
        await this.motion.fly(chipNode(b), this.scene.seatPt(i), this.scene.betPt(i), MS.blinds);
        must(f.seats[i], 'f.seats[i]').stack -= b;
        must(f.seats[i], 'f.seats[i]').bet = b;
        must(f.seats[i], 'f.seats[i]').tag = i === sb?.seat ? `小盲 ${chips(b)}` : i === bb?.seat ? `大盲 ${chips(b)}` : '';
      }),
    );
    play('shuffle');
    if (blinds.some((b) => b > 0)) play('chip');
    this.scene.draw(f);
    // 从按钮下家开始顺时针，一人一张发两圈；牌从庄家那里发出
    const size = f.seats.length;
    const order: number[] = [];
    for (let k = 1; k <= size; k++) {
      const i = (v.button + k) % size;
      if (dealt[i]) order.push(i);
    }
    const from = this.c.croupierAt ? this.scene.deckPt() : buttonPos(this.scene.seatPt(v.button), this.c.g, v.button === this.c.me, isPacked(this.c.g, this.c.seats.length));
    const target = frameOf(v);
    const flights: Promise<void>[] = [];
    let n = 0;
    // 发牌总时长按两圈 12 张封顶：9 人桌 18 张照 170 毫秒一张要 3 秒多（实打嫌一手太慢）
    const gap = MS.dealGap * Math.min(1, 12 / (order.length * 2));
    this.c.croupier.deal((gap * order.length * 2 + MS.dealFly) * this.c.opts.pace());
    for (let round = 0; round < 2; round++) {
      for (const i of order) {
        const delay = n++ * gap;
        flights.push(
          (async () => {
            await this.motion.pause(delay);
            play('card');
            await this.motion.fly(backNode(i === this.c.me ? 'mine' : 'small'), from, this.scene.holePt(i, round), MS.dealFly);
            must(f.seats[i], 'f.seats[i]').cards = must(target.seats[i], 'target.seats[i]').cards.slice(0, round + 1).map((c) => (i === this.c.me ? null : c));
            this.scene.draw(f);
          })(),
        );
      }
    }
    await Promise.all(flights);
    // 我的两张翻过来
    if (target.seats[this.c.me]?.cards.length) {
      play('flip');
      must(f.seats[this.c.me], 'f.seats[this.c.me]').cards = must(target.seats[this.c.me], 'target.seats[this.c.me]').cards;
      this.scene.draw(f);
      await this.motion.pause(MS.flip);
    }
  }

  /**
   * 牌型金牌不压东西：电脑版正上方座位的名牌离公共牌近，金牌摆在公共牌上方 100 就盖住它的名字和筹码；
   * 原来往下躲名牌又会压住公共牌（界面审查 1121 第 1 条）。往左/右让开名牌、往下（最多 MAX_DODGE、不过公共牌顶）、往上让开公共牌几种挪法里，
   * 名牌、头像、翻开的牌（公共牌和亮出来的底牌）都不压、挪得最少的那个就用；都不行就用往下那个（宁可压名牌一点，也不压牌）
   */
  private clearOfPlates(e: HTMLElement): void {
    const r = e.getBoundingClientRect();
    const rects = (sel: string): DOMRect[] => [...this.c.root.querySelectorAll(sel)].map((x) => x.getBoundingClientRect()).filter((x) => x.width > 0);
    const people = rects('.seat:not(.empty) :is(.plate, .avatar)');
    const cards = rects('.card:not(.hidden)');
    const stage = this.c.root.getBoundingClientRect();
    const k = stage.width / this.c.g.w || 1;
    const hits = (dx: number, dy: number, list: DOMRect[]): DOMRect[] =>
      list.filter((p) => p.left < r.right + dx && p.right > r.left + dx && p.top < r.bottom + dy && p.bottom > r.top + dy);
    const blocked = hits(0, 0, people);
    if (!blocked.length && !hits(0, 0, cards).length) return;
    const gap = 6;
    const boardTop = Math.min(...rects('.card.board:not(.hidden)').map((c) => c.top), Number.POSITIVE_INFINITY);
    const down = Math.max(0, Math.min(MAX_DODGE * k, (Math.max(r.top, ...blocked.map((p) => p.bottom)) + 4 - r.top), boardTop - gap - r.bottom));
    const tries: [number, number][] = [
      ...blocked.flatMap((p): [number, number][] => [[p.left - gap - r.right, 0], [p.right + gap - r.left, 0]]),
      [0, down],
      [0, Math.min(0, boardTop - gap - r.bottom)],
    ];
    const fits = ([dx, dy]: [number, number]): boolean =>
      r.left + dx >= stage.left && r.right + dx <= stage.right && !hits(dx, dy, people).length && !hits(dx, dy, cards).length;
    const [dx, dy] = tries.filter((t) => t[0] !== 0 || t[1] !== 0).sort((a, b) => Math.abs(a[0]) + Math.abs(a[1]) - Math.abs(b[0]) - Math.abs(b[1])).find(fits) ?? [0, down];
    e.style.left = `${Number.parseFloat(e.style.left) + dx / k}px`;
    e.style.top = `${Number.parseFloat(e.style.top) + dy / k}px`;
  }
}
