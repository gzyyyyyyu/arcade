/** 小动画（TableMotion）：说话气泡、催促、被砸、收池发牌翻牌、弃牌、飘字、飞行节点（table.ts 拆分） */
import { el, setText } from '../dom.ts';
import { boardPos, felt, isTop, potPos, type Pt } from '../layout.ts';
import { play } from '../sound.ts';
import type { Card } from '../../core/cards.ts';
import type { HandResult } from '../../core/table.ts';
import { runoutEquity } from '../../fun/climax.ts';
import { stickerFor, type Moment } from '../talk.ts';
import { EQ, type Frame, type Drama } from './types.ts';
import { MS } from '../timing.ts';
import { place, chipNode, backNode, flipIn, flipHot, bump } from './nodes.ts';
import type { TableCtx } from './context.ts';
import type { TableScene } from './base.ts';
import { must } from '../../must.ts';

export class TableMotion {
  private readonly c: TableCtx;
  private readonly scene: TableScene;

  constructor(c: TableCtx, scene: TableScene) {
    this.c = c;
    this.scene = scene;
  }

  /** 头像旁边冒一句话，过一会儿自己消失 */
  speak(seat: number, persona: number, handNo: number, m: Moment, must = false): void {
    if (this.c.opts.quiet?.() || this.c.opts.muted?.(seat)) return;
    const text = this.c.talk.line(seat, persona, handNo, m, must);
    if (!text) return;
    this.bubble(seat, text);
    this.c.opts.sticker?.(seat, stickerFor(persona, m));
  }

  /**
   * 催促炸弹（朋友们："谁出得慢就炸他"）：轮到的真人想了 8 秒以上，他头像旁边冒一个小炸弹，别人点了就对他扔。seat 为 null 收起。
   * 只是个按钮：不缩短他的计时、不碰规则
   */
  urge(seat: number | null, onClick: () => void): void {
    this.c.urgeEl?.remove();
    this.c.urgeEl = null;
    if (seat === null || seat === this.c.me || !this.c.seats[seat]) return;
    const p = this.scene.seatPt(seat);
    const b = el('button', 'urge', this.c.root);
    b.type = 'button';
    b.title = '催他一下';
    b.setAttribute('aria-label', '催他一下');
    b.innerHTML = this.c.opts.bombIcon?.() ?? '';
    // 头像右上角（顶上的座位放右下，免得出画面）
    place(b, { x: p.x + 34, y: p.y + (isTop(p, this.c.g) ? 30 : -34) });
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    this.c.urgeEl = b;
  }

  /** 被道具砸中（kit 的 onHit）：头像抖一下、缩一下 */
  hit(seat: number): void {
    // 被砸的那一下，这个人的动作气泡（"加注到 70"）先让开，不和番茄叠在一起
    const root = this.c.seats[seat]?.root;
    if (root) {
      root.classList.add('hit');
      window.clearTimeout(Number(root.dataset.hitTimer));
      root.dataset.hitTimer = String(window.setTimeout(() => root.classList.remove('hit'), 1_400));
    }
    const a = this.c.seats[seat]?.avatar;
    a?.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(.86) rotate(-8deg)' }, { transform: 'scale(1.04) rotate(6deg)' }, { transform: 'scale(1)' }],
      { duration: 420, easing: 'ease-out' },
    );
  }

  /**
   * 头像旁边冒一句话，过一会儿自己消失：电脑说话、好友房的嘲讽共用。
   * 不挡点击（pointer-events: none）；我自己的放在头像左边，不压我的底牌和右下的操作区
   */
  bubble(seat: number, text: string, ms = 2_600): void {
    const p = this.scene.seatPt(seat);
    // 同一个人上一句还没收：换成新的，不叠
    this.c.fx.querySelector(`.speech[data-seat="${seat}"]`)?.remove();
    const side = seat === this.c.me ? 'left' : isTop(p, this.c.g) ? 'below' : p.x < felt(this.c.g).cx ? 'right' : 'left';
    const e = el('div', `speech ${side}`, this.c.fx, text);
    e.dataset.seat = String(seat);
    play('taunt');
    const after = (): void => this.scene.clampIn(e, '');
    place(
      e,
      // 两边的贴着名牌往里摆：头像上面要放赢了多少（float），旁边是亮出来的牌
      // 我自己的放在头像左上（和头像一样高会盖住左下角的"歇一手""嘲讽"）
      seat === this.c.me ? { x: p.x - 196, y: p.y - 30 } : side === 'below' ? { x: p.x, y: p.y + 92 } : { x: p.x + (side === 'right' ? 80 : -80), y: p.y + 58 },
    );
    after();
    window.setTimeout(() => e.remove(), ms * this.c.opts.pace());
  }

  /** 筹码落进名牌：名牌轻轻鼓一下（独立的 scale 属性，不碰名牌的涨跌色过渡）；.lowfx / 减少动态效果不鼓 */
  landPulse(seat: number): void {
    const p = this.c.seats[seat]?.plate;
    if (!p || document.documentElement.classList.contains('lowfx') || this.c.opts.pace() < 0.5) return;
    p.animate([{ scale: '1' }, { scale: '1.1', offset: 0.35 }, { scale: '1' }], { duration: 420 * this.c.opts.pace(), easing: 'ease-out' });
  }

  // ---------- 小动画 ----------

  /** 这一轮的下注都推进池子；pots 是收完以后的主池、边池 */
  async collect(f: Frame, pots: number[]): Promise<void> {
    const bets = f.seats.map((s, i) => [i, s.bet] as const).filter(([, b]) => b > 0);
    for (const s of f.seats) if (s.status !== 'folded') s.tag = '';
    if (!bets.length) {
      this.scene.draw(f);
      return;
    }
    for (const [i] of bets) must(f.seats[i], 'f.seats[i]').bet = 0;
    this.scene.draw(f);
    play('collect');
    await Promise.all(bets.map(([i, b]) => this.fly(chipNode(b), this.scene.betPt(i), potPos(this.c.g), MS.collect)));
    f.pots = pots.length ? [...pots] : [f.pots.reduce((a, x) => a + x, 0) + bets.reduce((a, [, b]) => a + b, 0)];
    this.scene.draw(f);
    bump(this.c.potEl);
  }

  /** 翻牌三张依次翻，转牌、河牌前停一下；slow 是全下后补发时放慢的倍数 */
  async dealBoard(f: Frame, board: Card[], from: number, slow = 1, drama?: Drama): Promise<void> {
    for (let i = from; i < board.length; i++) {
      await this.pause((i < 3 ? (i === from ? MS.street * 0.5 : MS.flopGap) : MS.street) * slow);
      // 全下补牌的悬念：转牌、河牌前心跳两下、停一停；河牌停得更久
      if (drama && i >= 3) {
        play('heartbeat');
        if (!drama.quick) await this.pause(i === 4 ? 850 : 480);
      }
      play('card');
      this.c.croupier.deal(MS.boardFly * this.c.opts.pace());
      await this.fly(backNode('board'), this.scene.deckPt(), boardPos(this.c.g, i), MS.boardFly);
      f.board = board.slice(0, i + 1);
      this.scene.draw(f);
      play('flip');
      if (drama && i >= 3 && !drama.quick) {
        // 慢翻、放大发光；翻完停一拍，胜率再跳
        const ms = MS.flip * (i === 4 ? 2.6 : 2) * this.c.opts.pace();
        flipHot(must(this.c.boardCards[i], 'this.c.boardCards[i]'), ms);
        await this.pause(MS.flip * (i === 4 ? 2.6 : 2) + 140);
      } else {
        flipIn(must(this.c.boardCards[i], 'this.c.boardCards[i]'), MS.flip * this.c.opts.pace());
        if (drama && !drama.quick) await this.pause(MS.flip + 100);
      }
      drama?.after();
    }
    await this.pause(MS.flip + 120);
  }

  /**
   * 全下以后补发公共牌：先把所有人的底牌翻开（规则：全下比牌，底牌马上亮），每家标上现在的胜率，
   * 再一张一张补牌，每发一张胜率就跳一次。只用摊牌结果里真亮出来的牌。好友房（quick）不加停顿
   */
  async runOut(f: Frame, r: HandResult): Promise<void> {
    const quick = this.c.opts.quick?.() === true;
    const live = r.shown;
    const eq = (): void => {
      const e = runoutEquity(live.map((x) => x.hole), f.board);
      live.forEach((x, k) => {
        must(f.seats[x.seat], 'f.seats[x.seat]').hand = `${EQ}${Math.round(must(e[k], 'e[k]') / 10)}%`;
      });
      this.scene.draw(f);
    };
    for (const sh of live) must(f.seats[sh.seat], 'f.seats[sh.seat]').cards = [...sh.hole];
    eq();
    play('reveal');
    if (!quick) await this.pause(MS.reveal);
    await this.dealBoard(f, r.board, f.board.length, quick ? 1.8 : 1.15, { quick, after: eq });
  }

  /** 弃牌：牌飞回牌堆 */
  async muck(seat: number, f: Frame, quiet = false): Promise<void> {
    const s = must(f.seats[seat], 'f.seats[seat]');
    const n = s.cards.length;
    if (!n) return;
    s.cards = [];
    if (!quiet) s.status = 'folded';
    this.scene.draw(f);
    const flights = [];
    for (let k = 0; k < n; k++) flights.push(this.fly(backNode(seat === this.c.me ? 'mine' : 'small'), this.scene.holePt(seat, k), this.scene.deckPt(), MS.muck, 0.4));
    await Promise.all(flights);
  }

  /** 这个座位刚做的事：气泡弹一下（之后缩成小标签挂着） */
  pop(seat: number): void {
    const b = this.c.seats[seat]?.bubble;
    if (!b) return;
    b.classList.remove('pop');
    void b.offsetWidth;
    b.classList.add('pop');
  }

  float(seat: number, text: string): void {
    const p = this.scene.seatPt(seat);
    // 顶上一排：赢数写在自己名牌的名字那一行，停一会儿换回名字。头顶放会被屏幕上沿裁掉、压住标题（实打），
    // 压在头像下沿又挡住名字，两边是邻座的牌和名牌（9 人桌只隔 190 个单位），没有空地方飘
    const n = this.c.seats[seat];
    if (seat !== this.c.me && p.y < 110 && n) {
      this.c.won.set(seat, text);
      setText(n.name, text);
      n.name.classList.add('won');
      window.setTimeout(() => {
        this.c.won.delete(seat);
        n.name.classList.remove('won');
        setText(n.name, n.name.dataset.real ?? '');
      }, 2_400 * this.c.opts.pace());
      return;
    }
    const e = el('div', 'float', this.c.fx, text);
    // 我的赢数放在名牌右边：头顶是我的两张底牌，白底上看不清
    place(e, seat === this.c.me ? { x: p.x + 130, y: p.y + 18 } : { x: p.x, y: p.y - 40 });
    e.animate([{ transform: 'translate(-50%, 0)', opacity: 0 }, { transform: 'translate(-50%, -14px)', opacity: 1, offset: 0.2 }, { transform: 'translate(-50%, -34px)', opacity: 0 }], {
      duration: 2400 * this.c.opts.pace(),
      easing: 'ease-out',
    }).finished.then(() => e.remove(), () => e.remove());
  }

  /**
   * 大牌横幅的落点：公共牌正中（kit 的名场面横幅在舞台上沿 18% 处，放上面会叠在一起；字只停一秒多，盖一下牌没关系）。
   * 竖屏窄，kit 的横幅折成四行盖住整张桌面，所以我赢时改放到自己的底牌上方
   */
  bigTextPt(seat: number): Pt {
    if (this.c.g.tall && seat === this.c.me) {
      const p = this.scene.seatPt(seat);
      return { x: this.c.g.w / 2, y: p.y - 112 };
    }
    return boardPos(this.c.g, 2);
  }

  pause(ms: number): Promise<void> {
    const t = ms * this.c.opts.pace();
    return t <= 0 ? Promise.resolve() : new Promise((ok) => window.setTimeout(ok, t));
  }

  /** 一个临时节点从 a 飞到 b（舞台坐标），落地后删掉；label 是跟着飞的小字（"主池"） */
  async fly(node: HTMLElement, a: Pt, b: Pt, ms: number, fade = 1, label = ''): Promise<void> {
    if (label) el('span', 'fly-label', node, label);
    this.c.fx.appendChild(node);
    place(node, a);
    const d = ms * this.c.opts.pace();
    if (d > 0) {
      const anim = node.animate(
        [
          { transform: 'translate(-50%, -50%) translate(0, 0)', opacity: 1 },
          { transform: `translate(-50%, -50%) translate(${b.x - a.x}px, ${b.y - a.y}px)`, opacity: fade },
        ],
        { duration: d, easing: 'cubic-bezier(.25,.75,.35,1)', fill: 'forwards' },
      );
      // 兜底：动画没按时结束（被挂起、浏览器没推进时间线）也最多多等 500 ms，不让牌局等一个永远不来的 finished
      await Promise.race([anim.finished.catch(() => {}), new Promise<void>((ok) => window.setTimeout(ok, d + 500))]);
    }
    node.remove();
  }

  /** 让一张已经摆着的牌飞走（收牌）：先藏起原来的，用一个牌背代替飞 */
  flyFrom(card: HTMLElement, a: Pt, b: Pt, ms: number): Promise<void> {
    card.classList.add('gone');
    return this.fly(backNode('board'), a, b, ms, 0.3).then(() => card.classList.remove('gone'));
  }
}
