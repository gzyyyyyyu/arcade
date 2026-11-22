/** 摆画面：座位和版式、把一帧摆出来、位置换算（table.ts 拆分；状态在 context.ts 的 TableCtx，量位置、动画、一手的演出各是一个部件） */
import { avatarSvg, chipCols, chipPile, HUMAN_BG, makeCard, ME_LOOK, setCard } from '../art.ts';
import { el, setText, toggle } from '../dom.ts';
import { betPos, boardPos, buttonPos, dealerSpots, deckPos, felt, isPacked, isTop, potPos, resultPos, seatPos, type Geo, type Pt } from '../layout.ts';
import { clampShift } from '../fx.ts';
import type { Card } from '../../core/cards.ts';
import type { View } from '../../core/view.ts';
import { chips, madeHand, personaName } from '../text.ts';
import { EQ, DEALER_TRY, CLOCK_LEN, type SeatFrame, type Frame, type SeatNodes, type SeatPeople } from './types.ts';
import { frameOf, bestFive } from './frame.ts';
import { seatName, potName, resultLines } from './result.ts';
import { place } from './nodes.ts';
import type { TableCtx } from './context.ts';
import { must } from '../../must.ts';

export class TableScene {
  private readonly c: TableCtx;

  constructor(c: TableCtx) {
    this.c = c;
  }

  /** 桌心的字：主题房的名字（rooms.ts） */
  setMark(text: string): void {
    setText(this.c.markEl, text);
    this.placeCroupier();
  }

  /** 好友房：座位上的人（null 是单机，按电脑的性格起名） */
  setPeople(p: SeatPeople[] | null): void {
    this.c.people = p;
    if (this.c.frame) this.draw(this.c.frame);
  }

  /** 好友房：轮到谁、什么时候到点（房间的时间），在他的头像外面转一圈；seat 为 null 收起 */
  setClock(seat: number | null, deadline: number | null, totalMs: number): void {
    this.c.clockAnim?.cancel();
    this.c.clockAnim = null;
    this.c.seats.forEach((n, i) => toggle(n.clock, 'on', i === seat && deadline !== null));
    const n = seat === null ? undefined : this.c.seats[seat];
    if (!n || deadline === null) return;
    const left = Math.max(0, deadline - Date.now());
    const c = must(n.clock.querySelector('circle'), 'n.clock.querySelector(circle)');
    const from = CLOCK_LEN * Math.min(1, 1 - left / totalMs);
    this.c.clockAnim = c.animate([{ strokeDashoffset: `${from}` }, { strokeDashoffset: `${CLOCK_LEN}` }], { duration: left, fill: 'forwards' });
  }

  /** 换一桌（人数或我的座位变了）时重建座位 */
  setup(size: number, me: number): void {
    for (const s of this.c.seats) {
      s.root.remove();
      s.bet.remove();
    }
    this.c.me = me;
    this.c.frame = null;
    this.c.won.clear();
    this.c.seats = Array.from({ length: size }, (_, i) => this.makeSeat(i));
    this.layout(this.c.g);
  }

  layout(g: Geo): void {
    this.c.g = g;
    const w = g.w;
    const f = felt(g);
    Object.assign(this.c.feltEl.style, { left: `${f.cx - f.rx}px`, top: `${f.cy - f.ry}px`, width: `${f.rx * 2}px`, height: `${f.ry * 2}px` });
    place(this.c.potEl, potPos(g));
    place(this.c.resultEl, resultPos(g));
    if (this.c.resultEl.classList.contains('on')) this.fitResult();
    this.placeCroupier();
    this.c.boardCards.forEach((c, i) => place(c, boardPos(g, i)));
    const size = this.c.seats.length;
    const packed = isPacked(g, size);
    this.c.seats.forEach((s, i) => {
      const p = seatPos(i, this.c.me, size, g);
      place(s.root, p);
      place(s.bet, betPos(p, g, i === this.c.me, packed));
      // 我的下注按底边摆、往上长：筹码多了也不压到自己的底牌
      s.bet.classList.toggle('mine', i === this.c.me);
      // 两侧座位的下注按靠座位那头摆、往桌心长：居中摆时几摞筹码一多，往回伸到那家的底牌上（牌桌互压检查）
      const sideBet = i !== this.c.me && !isTop(p, g) && (!g.tall || packed || p.y >= f.cy);
      s.bet.classList.toggle('from-l', sideBet && p.x < w / 2);
      s.bet.classList.toggle('from-r', sideBet && p.x > w / 2);
      // 别人的底牌放在头像朝桌子中间的那一侧，不压名牌
      const side = p.x > w / 2 + 1 ? 'right' : p.x < w / 2 - 1 ? 'left' : 'mid';
      s.root.classList.toggle('left', side === 'left');
      s.root.classList.toggle('right', side === 'right');
      const top = isTop(p, g);
      s.root.classList.toggle('top', top);
      // 矮竖屏的格子（layout.ts 的 isPacked）：底牌只露出一半挨着头像，动作签放头像正上方
      s.root.classList.toggle('pack', packed && i !== this.c.me);
      // 顶上一排贴着左边的（6、7 人桌左上角）：动作标签放头像左边会出屏（线上 1280×800 实测），改放头像正上方
      s.root.classList.toggle('edge', top && p.x < 150);
    });
    if (this.c.frame) this.draw(this.c.frame);
  }

  /** 直接摆成这个视图（进桌、刷新、动画之后）；一手打完停着的，摆这一手的结果 */
  show(v: View): void {
    this.draw(frameOf(v));
  }

  /**
   * 气泡（动作标签、电脑说话）不许伸出舞台、也不许伸出屏幕：1920×1080 时右上座位的"跟注 20"跑出右边缘。
   * 量实际位置、超出就用独立的 translate 属性推回来（不碰气泡自己的 transform 动画和各处 CSS 摆法）；
   * key 没变（文字、宽度同上次）就不重量，免得每步重画都强制排版。key 为空是清掉位移
   */
  clampIn(e: HTMLElement, key: string, n?: SeatNodes): void {
    if (n) {
      if (n.clampKey === key) return;
      n.clampKey = key;
    }
    e.style.translate = '';
    if (!key && n) return;
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const st = this.c.root.getBoundingClientRect();
    const vw = window.visualViewport?.width ?? window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const bound = { left: Math.max(st.left, 0), top: Math.max(st.top, 0), right: Math.min(st.right, vw), bottom: Math.min(st.bottom, vh) };
    const { dx, dy: dy0 } = clampShift(r, bound);
    const dy = dy0 + (n ? this.potShift(r, dx, dy0) : 0);
    if (dx === 0 && dy === 0) return;
    // 屏幕像素换成舞台像素（舞台整体缩放过）
    const k = st.width / this.c.g.w || 1;
    e.style.translate = `${dx / k}px ${dy / k}px`;
  }

  /**
   * 座位的动作签压到桌心的池子就上下让开（挪得少的那边）：池子的数不许被压。
   * 冒烟 scenes：手机 360×640 六人桌两个边池时，左边那家的「下注 270」压住「主池」
   */
  private potShift(r: DOMRect, dx: number, dy: number): number {
    const top = r.top + dy;
    const bottom = r.bottom + dy;
    const hit = [this.c.potMain, ...this.c.potSides.children]
      .map((e) => e.getBoundingClientRect())
      .filter((p) => p.width > 0 && !(r.right + dx <= p.left || r.left + dx >= p.right || bottom <= p.top || top >= p.bottom));
    if (!hit.length) return 0;
    const down = Math.max(...hit.map((p) => p.bottom)) - top + 2;
    const up = bottom - Math.min(...hit.map((p) => p.top)) + 2;
    return down <= up ? down : -up;
  }

  // ---------- 位置 ----------

  /** 牌从哪里发出、收回哪里：荷官的右手（dealer.ts 的画法，缩到 0.8 后手在桌边上方 15、右边 15），没有荷官就是桌心 */
  deckPt(): Pt {
    const d = this.c.croupierAt;
    return d ? { x: d.x + 15, y: d.y - 15 } : deckPos(this.c.g);
  }

  /**
   * 荷官站哪：layout 给的几个点里挑第一个不碰顶栏的（顶栏左边的字随玩法变长短，按实际位置量）；都碰就不出现。
   * 摆座位时、顶栏的字变了时（setMark 跟着 drawTop 来）各挑一次
   */
  placeCroupier(): void {
    // 牌桌藏着（标题页、选桌页）量不出来，量一下反倒逼浏览器把整页提前排一遍（手机主页打开约多一个长任务）：先按第一个点摆着，进桌时 setup、drawTop 会再挑
    if (!this.c.root.closest('.stage')?.classList.contains('at-table')) {
      const [p] = dealerSpots(this.c.g, this.c.seats.length);
      this.c.croupierAt = p ?? null;
      this.c.croupier.place(p ?? null);
      return;
    }
    const bar = [...(this.c.root.closest('.stage')?.querySelectorAll('.topbar > :not(.spacer)') ?? [])]
      .map((e) => e.getBoundingClientRect())
      .filter((b) => b.width > 0);
    this.c.croupierAt = null;
    for (const p of dealerSpots(this.c.g, this.c.seats.length)) {
      this.c.croupier.place(p);
      const r = this.c.croupier.root.getBoundingClientRect();
      if (r.width === 0 || bar.every((b) => b.right <= r.left || b.left >= r.right || b.bottom <= r.top || b.top >= r.bottom)) {
        this.c.croupierAt = p;
        return;
      }
    }
    this.c.croupier.place(null);
  }

  seatPt(i: number): Pt {
    return seatPos(i, this.c.me, this.c.seats.length, this.c.g);
  }
  betPt(i: number): Pt {
    return betPos(this.seatPt(i), this.c.g, i === this.c.me, isPacked(this.c.g, this.c.seats.length));
  }
  /** 底牌第 k 张的中心（和 style.css 里 .hole 的摆法对上） */
  holePt(i: number, k: number): Pt {
    const p = this.seatPt(i);
    if (i === this.c.me) return { x: p.x + (k ? 36 : -36), y: p.y - 46 };
    const side = p.x > this.c.g.w / 2 + 1 ? -1 : 1;
    return { x: p.x + side * 54 + (k ? 8 : -8), y: p.y - 6 };
  }

  nameOf(i: number, s: SeatFrame): string {
    return seatName(s, i === this.c.me, this.c.people?.[i]?.name ?? null);
  }

  // ---------- 摆出来 ----------

  makeSeat(i: number): SeatNodes {
    const mine = i === this.c.me;
    const root = el('div', `seat${mine ? ' me' : ''}`, this.c.root);
    root.dataset.seat = String(i);
    const hole = el('div', 'hole', root);
    const cards = [makeCard(mine ? 'mine' : 'small'), makeCard(mine ? 'mine' : 'small')];
    for (const c of cards) hole.appendChild(c);
    const avatar = el('div', 'avatar', root);
    const plate = el('div', 'plate', root);
    const name = el('span', 'name', plate);
    const stack = el('span', 'stack', plate);
    const badge = el('span', 'badge', root);
    const hand = el('span', 'hand', root);
    const bubble = el('div', 'bubble', root);
    const clock = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    clock.setAttribute('class', 'clock');
    clock.setAttribute('viewBox', '0 0 72 72');
    clock.innerHTML = `<circle cx="36" cy="36" r="34" stroke-dasharray="${CLOCK_LEN}"/>`;
    root.appendChild(clock);
    root.addEventListener('click', () => this.c.opts.onSeat?.(i));
    const bet = el('div', 'bet', this.c.root);
    const betChips = el('span', 'bet-chips', bet);
    const betAmt = el('span', 'bet-amt', bet);
    return { root, avatar, plate, name, stack, hole, cards, bubble, badge, clock, hand, bet, betChips, betAmt, look: -2, shown: null, tween: 0, cur: null, roll: 0, clampKey: '' };
  }

  draw(f: Frame): void {
    this.c.frame = f;
    this.drawPot(f.pots);
    this.c.boardCards.forEach((c, i) => {
      const card = f.board[i];
      toggle(c, 'hidden', card === undefined);
      if (card !== undefined) setCard(c, card);
    });
    const b = f.button >= 0 && f.button < this.c.seats.length ? f.button : -1;
    toggle(this.c.dealer, 'hidden', b < 0);
    f.seats.forEach((s, i) => this.drawSeat(must(this.c.seats[i], 'this.c.seats[i]'), s, i, f));
    // 结果条先摆好，D 再躲开它（两人桌我是庄时，D 在我的底牌上方，正是结果条往上提的地方）
    this.drawResult(f);
    if (b >= 0) this.placeDealer(b);
  }

  drawPot(pots: number[]): void {
    const total = pots.reduce((a, x) => a + x, 0);
    toggle(this.c.potEl, 'empty', total === 0);
    const key = pots.join(',');
    if (this.c.potEl.dataset.k === key) return;
    this.c.potEl.dataset.k = key;
    // 有边池时不写总数，换成一排小标签：主池、边池（一、二……），各带一枚筹码，宽度按字（原来标签的 class 叫 side，
    // 撞上选桌页右栏的 .side，被撑成 430 宽、竖排的两条，横在桌心压住手牌，主池的数字也挤没了）
    const multi = pots.length > 1;
    this.c.potMain.innerHTML = total && !multi ? `<span class="pile">${chipPile(total)}</span><span class="pot-label">底池</span><b>${chips(total)}</b>` : '';
    toggle(this.c.potMain, 'hidden', multi);
    this.c.potSides.innerHTML = multi
      ? pots.map((x, k) => `<span class="pot-tag"><i class="chip c-${chipCols(x)[0]?.[0] ?? 'w'}"></i>${potName(k, pots.length)} <b>${chips(x)}</b></span>`).join('')
      : '';
  }

  /**
   * 庄家按钮 D：先放在那家下注的左边（buttonPos），压到名牌、头像、底牌、别人的下注、公共牌、池子时依次试上、下、右、更左，
   * 都压就留在原处（左边弃了牌的那家名字和筹码被 D 盖住过）
   */
  placeDealer(b: number): void {
    const p = buttonPos(this.seatPt(b), this.c.g, b === this.c.me, isPacked(this.c.g, this.c.seats.length));
    // D 的 left/top 有过渡（换庄时滑过去），改了马上量还是旧位置；底牌、下注是发牌、下注时才露出来的，那时不重摆：
    // 都按版式算（和 chatDock 一样），名牌和头像位置固定，量实际的
    const box = this.c.root.getBoundingClientRect();
    const k = box.width / this.c.g.w || 1;
    const at = (c: Pt, hw: number, hh: number): DOMRect => new DOMRect(box.left + (c.x - hw) * k, box.top + (c.y - hh) * k, 2 * hw * k, 2 * hh * k);
    const b0 = boardPos(this.c.g, 0);
    const b4 = boardPos(this.c.g, 4);
    const blockers = [
      at({ x: (b0.x + b4.x) / 2, y: b0.y }, (b4.x - b0.x) / 2 + 32, 44),
      at(potPos(this.c.g), 110, 22),
      // 结果条按版式估一块（实际宽高随行数变，量出来的会让 D 一手打完才跳）；动作签也不算：
      // 它们一闪一闪的，D 跟着躲就是"跳来跳去"，签画在 D 上面压一下无妨
      at(resultPos(this.c.g), 140, 34),
      ...this.c.seats.flatMap((n, i) =>
        n.root.classList.contains('empty')
          ? []
          : [n.plate.getBoundingClientRect(), n.avatar.getBoundingClientRect(), at(this.holePt(i, 0), 26, 36), at(this.holePt(i, 1), 26, 36), ...(i === b ? [] : [at(this.betPt(i), 36, 16)])],
      ),
    ].filter((r) => r.width > 0 && r.height > 0);
    const half = (this.c.dealer.offsetWidth || 26) / 2;
    const hits = (q: Pt): boolean => {
      const d = at(q, half, half);
      // 出了牌桌区域（竖屏右侧座位的外侧）也算压：以前靠动作签把 D 挤回来，现在得自己躲
      if (d.left < box.left || d.right > box.right || d.top < box.top || d.bottom > box.bottom) return true;
      return blockers.some((r) => Math.min(d.right, r.right) - Math.max(d.left, r.left) > 1 && Math.min(d.bottom, r.bottom) - Math.max(d.top, r.top) > 1);
    };
    place(this.c.dealer, DEALER_TRY.map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy })).find((q) => !hits(q)) ?? p);
  }

  /**
   * 结果条按上边摆在池子下面，几行的往下长会压到我的底牌、竖屏下面两侧那两家：
   * 放不下就往上提，最高到公共牌下沿（摊牌时池子已经分走了，那一块空着）
   */
  fitResult(): void {
    const p = resultPos(this.c.g);
    const box = this.c.root.getBoundingClientRect();
    const k = box.width / this.c.g.w || 1;
    const b0 = must(this.c.boardCards[0], 'this.c.boardCards[0]');
    const ceil = b0.classList.contains('hidden') ? boardPos(this.c.g, 0).y + 46 : (b0.getBoundingClientRect().bottom - box.top) / k + 4;
    // 横着和结果条重叠、又在公共牌下面的座位部件，最高的那个上沿就是底线
    const half = this.c.resultEl.offsetWidth / 2;
    const parts = this.c.seats.flatMap((n) => (n.root.classList.contains('empty') ? [] : [n.plate, n.avatar, ...n.cards.filter((c) => !c.classList.contains('hidden'))]));
    const floor = parts.reduce((m, e) => {
      const r = e.getBoundingClientRect();
      const l = (r.left - box.left) / k;
      const t = (r.top - box.top) / k;
      return r.width > 0 && t > ceil && l < p.x + half && l + r.width / k > p.x - half ? Math.min(m, t - 6) : m;
    }, Infinity);
    place(this.c.resultEl, { x: p.x, y: Math.max(ceil, Math.min(p.y, floor - this.c.resultEl.offsetHeight)) });
  }

  /** 结果条：一手打完停着时，谁赢了多少、什么牌；分池时每个池子一行 */
  drawResult(f: Frame): void {
    const r = f.result;
    toggle(this.c.root, 'showdown', !!r && !r.byFold);
    for (const c of this.c.root.querySelectorAll('.best')) c.classList.remove('best');
    if (!r) {
      this.c.resultEl.classList.remove('on', 'mine');
      this.c.resultEl.dataset.k = '';
      return;
    }
    const key = `${r.handNo}`;
    if (this.c.resultEl.dataset.k !== key) {
      this.c.resultEl.dataset.k = key;
      const lines = resultLines(r, (i) => this.nameOf(i, must(f.seats[i], 'f.seats[i]')), this.c.me);
      // 赢家横幅：左边圆框里是赢家的头像（分池、平分时放第一个池子的第一个赢家）
      const face = this.c.seats[r.pots[0]?.winners[0]?.seat ?? -1]?.avatar.innerHTML ?? '';
      this.c.resultEl.innerHTML = (face ? `<span class="r-face">${face}</span>` : '') + `<div class="r-lines">${lines.map((l) => `<div class="r-line${l.mine ? ' mine' : ''}">${l.html}</div>`).join('')}</div>`;
      toggle(this.c.resultEl, 'mine', lines.some((l) => l.mine));
      this.c.resultEl.classList.remove('on');
      void this.c.resultEl.offsetWidth;
      this.c.resultEl.classList.add('on');
      this.fitResult();
    }
    // 摊牌赢的那五张亮起来，其余变暗
    if (r.byFold) return;
    const best = new Set<Card>();
    for (const pot of r.pots) {
      for (const w of pot.winners) {
        const sh = r.shown.find((s) => s.seat === w.seat);
        if (sh) for (const c of bestFive([...sh.hole, ...r.board])) best.add(c);
      }
    }
    // 没发到河牌时后几张 board[i] 是 undefined，has 给 false，所以不用 must()
    this.c.boardCards.forEach((c, i) => toggle(c, 'best', best.has(f.board[i]!)));
    this.c.seats.forEach((n, i) => n.cards.forEach((c, k) => toggle(c, 'best', best.has(must(f.seats[i], 'f.seats[i]').cards[k] as Card))));
  }

  drawSeat(n: SeatNodes, s: SeatFrame, i: number, f: Frame): void {
    const mine = i === this.c.me;
    const who = this.c.people?.[i];
    // 好友房里坐下了、买入还没到账的真人也不算空位
    const empty = s.owner === 'none' && !who?.name;
    const human = s.owner === 'player' || !!who?.name;
    toggle(n.root, 'empty', empty);
    // 头像：电脑按性格；我；好友房里别的真人用我的脸换座位的底色（look 记成 100 + 座位）
    const look = empty ? -1 : mine && human ? ME_LOOK : human ? 100 + i : s.persona;
    if (n.look !== look) {
      n.look = look;
      n.avatar.innerHTML = look < 0 ? '' : look >= 100 ? avatarSvg(ME_LOOK, HUMAN_BG[i % HUMAN_BG.length]) : avatarSvg(look);
    }
    const name = empty ? '空位' : (who?.name ?? (mine ? this.c.opts.myName() : personaName(s.persona)));
    n.name.dataset.real = name;
    setText(n.name, this.c.won.get(i) ?? name);
    toggle(n.root, 'takeable', who?.takeable === true);
    const allin = s.status === 'allin';
    this.drawStack(n, empty ? null : s.stack, allin);
    toggle(n.root, 'allin', allin);
    toggle(n.root, 'folded', s.status === 'folded');
    toggle(n.root, 'acting', f.toAct === i);
    toggle(n.root, 'win', s.win);
    toggle(n.root, 'house', s.owner === 'house');
    const badge = who?.tag ?? (s.away ? '暂离' : s.leaving ? '离桌' : !empty && s.stack === 0 && s.status === 'out' ? '输光' : '');
    setText(n.badge, badge);
    toggle(n.badge, 'on', badge !== '');
    // 座位上也挂一个类给 CSS 用（竖屏徽章下面的牌型签让一格），不用 .seat:has(.badge.on)：iOS 上 :has 每次变动都要重算
    toggle(n.root, 'badged', badge !== '');
    // 这一轮做了什么：挂在头像上方（我的在底牌右边）
    setText(n.bubble, s.tag);
    toggle(n.bubble, 'on', s.tag !== '');
    toggle(n.bubble, 'fold', s.tag === '弃牌');
    this.clampIn(n.bubble, s.tag === '' ? '' : `${s.tag}|${this.c.root.clientWidth}|${window.innerWidth}|${i}|${this.c.potEl.dataset.k ?? ''}`, n);
    // 翻牌后我在这一手里：底牌旁边显示现在凑成的牌；摊牌时换成摊牌的牌型
    const live =
      mine && !s.hand && f.board.length >= 3 && (s.status === 'active' || s.status === 'allin') && s.cards.length === 2 && s.cards.every((c) => c !== null)
        ? madeHand([...(s.cards as Card[]), ...f.board])
        : '';
    setText(n.hand, s.hand || live);
    toggle(n.hand, 'on', (s.hand || live) !== '');
    toggle(n.hand, 'live', live !== '');
    toggle(n.hand, 'bluff', s.hand.endsWith('诈唬'));
    toggle(n.hand, 'eq', s.hand.startsWith(EQ));
    n.cards.forEach((c, k) => {
      const card = s.cards[k];
      toggle(c, 'hidden', card === undefined);
      if (card !== undefined) setCard(c, card);
    });
    toggle(n.bet, 'hidden', s.bet === 0);
    if (s.bet > 0) {
      setText(n.betAmt, chips(s.bet));
      const key = `${s.bet}`;
      if (n.betChips.dataset.k !== key) {
        n.betChips.dataset.k = key;
        n.betChips.innerHTML = chipPile(s.bet);
      }
    }
  }

  /** 名牌上的数：变了就跳着走过去（涨绿跌红闪一下），全下时写"全下" */
  drawStack(n: SeatNodes, value: number | null, allin: boolean): void {
    if (value === null) {
      n.shown = null;
      n.cur = null;
      setText(n.stack, '');
      return;
    }
    if (allin && value === 0) {
      n.shown = 0;
      n.cur = 0;
      setText(n.stack, '全下');
      return;
    }
    // 目标没变：正在滚的接着滚（画面每一步都会重画，不能每次重启），没在滚的就是已经显示着
    if (n.shown === value && n.cur !== null) {
      if (n.cur === value) setText(n.stack, chips(value));
      return;
    }
    // 从"此刻显示的数"起滚：上一次还没滚完又来一个池子（边池接着发）时不会先跳回旧目标再重滚
    const from = n.cur ?? n.shown;
    const roll = n.roll;
    n.shown = value;
    if (from === null || from === value || this.c.opts.pace() < 0.5) {
      n.cur = value;
      n.tween++;
      n.roll = 0;
      setText(n.stack, chips(value));
      return;
    }
    n.roll = 0;
    toggle(n.plate, 'up', value > from);
    toggle(n.plate, 'down', value < from);
    const id = ++n.tween;
    const t0 = performance.now();
    // 赢池子的滚数 0.6–0.9 秒（按差额放长一点，大池子读得清）；平时的小变动 0.52 秒
    const dur = (roll > 0 ? roll : 520) * this.c.opts.pace();
    const tick = (now: number): void => {
      if (n.tween !== id) return;
      const k = Math.min(1, (now - t0) / dur);
      // 先快后慢（easeOutCubic）：数字很快冲到大半、最后几位慢慢停下，是"收钱"的手感
      const e = 1 - (1 - k) ** 3;
      n.cur = k >= 1 ? value : Math.round(from + (value - from) * e);
      setText(n.stack, chips(n.cur));
      if (k < 1) requestAnimationFrame(tick);
      else window.setTimeout(() => n.tween === id && n.plate.classList.remove('up', 'down'), 300);
    };
    requestAnimationFrame(tick);
  }
}
