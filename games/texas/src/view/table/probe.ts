/** 量位置（TableProbe）：互动菜单、聊天框、指引要的矩形，加注面板让位，看对手的小卡（table.ts 拆分） */
import { el, toggle } from '../dom.ts';
import { boardPos, felt, isTop, type Pt } from '../layout.ts';
import { personaStyle } from '../text.ts';
import { KEEP_OUT, type SeatNodes } from './types.ts';
import { place, union } from './nodes.ts';
import type { TableCtx } from './context.ts';
import type { TableScene } from './base.ts';
import { must } from '../../must.ts';

export class TableProbe {
  private readonly c: TableCtx;
  private readonly scene: TableScene;

  constructor(c: TableCtx, scene: TableScene) {
    this.c = c;
    this.scene = scene;
  }

  /**
   * 加注面板打开时，被它盖住的座位挪开（r 是操作区在屏幕上的位置），收起时放回去。
   * 按实际位置算：不同人数、不同屏幕宽，盖住的是哪个座位不一样。先试整个座位往上挪到面板上方，再试往左挪到面板左边，
   * 都放不下就只留名牌（名字和筹码）塞到面板上方（.tucked，头像、底牌、动作签先藏起来）。挪过去不许压到别的座位、出舞台
   * （0.9.0 之前只往上挪，6 人桌右下的座位叠到右上那个上面）
   */
  avoid(r: DOMRect | null): void {
    const stage = this.c.root.getBoundingClientRect();
    // 屏幕像素换回舞台单位（舞台整体缩放过）
    const scale = stage.height / (this.c.root.offsetHeight || 1);
    // 各座位没挪时占的地方：轮到我时操作区一更新就会再问一次，座位可能已经挪过、还在挪的动画里，减掉此刻挪到哪了
    // （不然第二次量到的是挪了一半的位置，0.3.0 冒烟抓到）
    const boxes = this.c.seats.map((n) => {
      const [mx = 0, my = 0] = (getComputedStyle(n.root).translate.match(/-?[\d.]+/g) ?? []).map(Number);
      const parts = [n.avatar, n.plate, ...n.cards.filter((c) => !c.classList.contains('hidden'))].map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0);
      return {
        left: Math.min(...parts.map((b) => b.left)) - mx * scale,
        right: Math.max(...parts.map((b) => b.right)) - mx * scale,
        top: Math.min(...parts.map((b) => b.top)) - my * scale,
        bottom: Math.max(...parts.map((b) => b.bottom)) - my * scale,
      };
    });
    type Box = (typeof boxes)[number];
    const overlap = (a: Box, b: Box | DOMRect): boolean => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
    const shift = (a: Box, dx: number, dy: number): Box => ({ left: a.left + dx, right: a.right + dx, top: a.top + dy, bottom: a.bottom + dy });
    // 面板刚打开时还在往上升的动画里（低 8 个单位），再留 6 个单位的缝
    const gap = 14 * scale;
    for (const [i, n] of this.c.seats.entries()) {
      const box = must(boxes[i], 'boxes[i]');
      // 我的座位不挪（操作区在右下角，碰不到我；万一碰到也不能把自己的牌挪走）
      if (!r || i === this.c.me || !overlap(box, r)) {
        n.root.style.translate = '';
        n.bet.style.translate = '';
        toggle(n.root, 'tucked', false);
        toggle(n.root, 'shifted', false);
        continue;
      }
      const fits = (b: Box): boolean => b.top >= stage.top && b.left >= stage.left && !overlap(b, r) && boxes.every((o, k) => k === i || !overlap(b, o));
      const p = n.plate.getBoundingClientRect();
      const [mx = 0, my = 0] = (getComputedStyle(n.root).translate.match(/-?[\d.]+/g) ?? []).map(Number);
      const plate = { left: p.left - mx * scale, right: p.right - mx * scale, top: p.top - my * scale, bottom: p.bottom - my * scale };
      const up = -(box.bottom - r.top + gap);
      const left = -(box.right - r.left + gap);
      const tuck = -(plate.bottom - r.top + gap);
      let move: [number, number, Box] = [0, 0, box];
      if (fits(shift(box, 0, up))) move = [0, up, shift(box, 0, up)];
      else if (fits(shift(box, left, 0))) move = [left, 0, shift(box, left, 0)];
      else if (fits(shift(plate, 0, tuck))) move = [0, tuck, shift(plate, 0, tuck)];
      toggle(n.root, 'tucked', move[2] !== box && move[2].bottom - move[2].top < box.bottom - box.top);
      // 整个挪开的座位：动作签换到名牌朝桌心那一侧，头像上方那一格现在是别人的名牌
      toggle(n.root, 'shifted', move[2] !== box && !n.root.classList.contains('tucked'));
      // 挪过去的座位也算占了地方，后面的座位别再挪到这里
      boxes[i] = move[2];
      n.root.style.translate = move[0] || move[1] ? `${Math.round(move[0] / scale)}px ${Math.round(move[1] / scale)}px` : '';
      this.clearBet(n, move[0] - mx * scale, move[1] - my * scale, gap);
    }
  }

  /**
   * 整个挪开的座位，动作签挂到名牌朝桌心那一侧，正好是这一家面前下注筹码的高度（审查 1122：横屏「大盲 20」盖住筹码数、电脑版「弃牌」盖住小盲的 10）。
   * 压住了就把筹码往桌心让开：金额不许被压。dx、dy 是座位从现在到挪好还差多少（屏幕像素），量的是挪好以后动作签在哪
   */
  private clearBet(n: SeatNodes, dx: number, dy: number, gap: number): void {
    n.bet.style.translate = '';
    if (!n.root.classList.contains('shifted') || !n.bubble.classList.contains('on') || n.bet.classList.contains('hidden')) return;
    const b = n.bubble.getBoundingClientRect();
    const q = n.bet.getBoundingClientRect();
    const tag = { left: b.left + dx, right: b.right + dx, top: b.top + dy, bottom: b.bottom + dy };
    if (tag.right <= q.left || tag.left >= q.right || tag.bottom <= q.top || tag.top >= q.bottom) return;
    const scale = this.c.root.getBoundingClientRect().height / (this.c.root.offsetHeight || 1);
    const away = n.root.classList.contains('right') ? tag.left - q.right - gap / 2 : tag.right - q.left + gap / 2;
    n.bet.style.translate = `${Math.round(away / scale)}px 0`;
  }

  /** 这个座位头像在屏幕上的位置（道具往这儿扔）；按实际画出来的算，横竖屏、9 人桌都对。空座位、没摆出来回 null */
  avatarRect(seat: number): DOMRect | null {
    const n = this.c.seats[seat];
    if (!n || n.root.classList.contains('empty')) return null;
    const r = n.avatar.getBoundingClientRect();
    return r.width > 0 ? r : null;
  }

  /**
   * 名牌和筹码那一块（kit 0.19 的 plate：气泡、弹幕、聊天按钮都避开）；我自己的连头像和底牌一起算，说话不盖自己的牌
   */
  plateRect(seat: number): DOMRect | null {
    const n = this.c.seats[seat];
    if (!n || n.root.classList.contains('empty')) return null;
    const parts = [n.plate, ...(seat === this.c.me ? [n.avatar, ...n.cards.filter((c) => !c.classList.contains('hidden'))] : [])];
    return union(parts.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0));
  }

  /**
   * 新手指引指的那几块在屏幕上的矩形（view/coach.ts）。公共牌、底池没发牌时节点量不到，公共牌按版式算那一排的位置
   */
  guideRect(what: 'hole' | 'board' | 'pot' | 'result'): DOMRect | null {
    if (what === 'hole') {
      const n = this.c.seats[this.c.me];
      return n ? union(n.cards.filter((c) => !c.classList.contains('hidden')).map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0)) : null;
    }
    if (what === 'pot' || what === 'result') {
      const r = (what === 'pot' ? this.c.potEl : this.c.resultEl).getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? r : null;
    }
    const box = this.c.root.getBoundingClientRect();
    const k = box.width / this.c.g.w;
    const b0 = boardPos(this.c.g, 0);
    const b4 = boardPos(this.c.g, 4);
    const hw = (b4.x - b0.x) / 2 + 30;
    return new DOMRect(box.left + ((b0.x + b4.x) / 2 - hw) * k, box.top + (b0.y - 40) * k, 2 * hw * k, 80 * k);
  }

  /** 牌桌中间的信息区（kit 0.19 的 center）：公共牌、底池、一手的结果条，弹幕不横穿、聊天框和气泡不压 */
  centerRects(): DOMRect[] {
    const board = union(this.c.boardCards.map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0));
    return [board, ...[this.c.potEl, this.c.resultEl].map((e) => e.getBoundingClientRect())].filter((r): r is DOMRect => !!r && r.width > 0 && r.height > 0);
  }

  /**
   * 电脑版常驻聊天框放哪（kit 0.19 的 chatDock，屏幕坐标）：kit 自己只试屏幕四个角，德州的四个角都有座位或下注按钮（实测 1920 落在右下的按钮上）。
   * 这里在整个屏幕上每 16×8 像素试一格，挑盖得最不要紧的：公共牌最要紧，名牌上的名字和筹码数、面前下的注、下注区其次，头像和底牌再次，空桌面不算；一样的先左后上。
   * 1920 上落在左边两个座位中间的空当；1280×720 的 6 人桌没有空当，落在左下那家的牌和公共牌之间。
   * 底牌、下的注、公共牌、下注区都按版式算（没发牌、没下注、没轮到我时节点藏着，量不到），同一个窗口、同一桌人只算一次：
   * kit 每次重画都来问，按当时的筹码算会让聊天框跟着下注跳来跳去
   */
  chatDock(w: number, h: number, extra: readonly DOMRect[]): { left: number; top: number; width: number; height: number } {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const live = this.c.seats.flatMap((n, i) => (n.root.classList.contains('empty') ? [] : [i]));
    const key = `${vw}x${vh}:${w}x${h}:${this.c.me}:${live.join(',')}`;
    if (this.c.dockAt?.key === key) return this.c.dockAt.at;
    const box = this.c.root.getBoundingClientRect();
    const k = box.width / this.c.g.w;
    const at = (c: Pt, hw: number, hh: number): DOMRect => new DOMRect(box.left + (c.x - hw) * k, box.top + (c.y - hh) * k, 2 * hw * k, 2 * hh * k);
    const b0 = boardPos(this.c.g, 0);
    const b4 = boardPos(this.c.g, 4);
    const board = at({ x: (b0.x + b4.x) / 2, y: b0.y }, (b4.x - b0.x) / 2 + 36, 48);
    // 右下的下注区（赔率条、快捷下注、三个大按钮）
    const bets = new DOMRect(box.left + box.width / 2 + 100 * k, box.bottom - 190 * k, box.width / 2 - 100 * k, 190 * k);
    const rect = (e: Element): DOMRect => e.getBoundingClientRect();
    const block: [DOMRect, number][] = [
      [board, 30],
      ...live.flatMap((i): [DOMRect, number][] => {
        const n = must(this.c.seats[i], 'this.c.seats[i]');
        return [[rect(n.plate), 10], [at(this.scene.betPt(i), 44, 18), 10], [rect(n.avatar), i === this.c.me ? 10 : 4], [at(this.scene.holePt(i, 0), 32, 44), 2], [at(this.scene.holePt(i, 1), 32, 44), 2]];
      }),
      // 我的牌型（"一对 Q"，style.css 的 .seat.me .hand 以座位左边 150 为中线、上面 60 起）：没亮时量不到，按版式算（1280 上被聊天框盖住）
      // 好友房等人页还没排座位（this.c.me 不是个数、没有座位）时没有这一块：0.25.6 起这里直接按 seatPt 算，朋友页报 reading 'NaN'
      ...(this.c.seats[this.c.me] ? [[at({ x: this.scene.seatPt(this.c.me).x - 150, y: this.scene.seatPt(this.c.me).y - 46 }, 60, 16), 10] as [DOMRect, number]] : []),
      // 别人的动作签（"过牌"）贴在头像旁边，平时藏着：头像四周各让出一截（1920 的 5 人桌）
      ...live.filter((i) => i !== this.c.me).map((i): [DOMRect, number] => {
        const a = rect(must(this.c.seats[i], 'this.c.seats[i]').avatar);
        return [new DOMRect(a.left - 70 * k, a.top - 30 * k, a.width + 140 * k, a.height + 30 * k), 3];
      }),
      // 摊牌时名牌下面的牌型（.seat .hand，座位下面 66 起）
      ...live.filter((i) => i !== this.c.me).map((i): [DOMRect, number] => [at({ x: this.scene.seatPt(i).x, y: this.scene.seatPt(i).y + 80 }, 44, 14), 3]),
      ...[bets, ...extra].map((r): [DOMRect, number] => [r, 10]),
    ];
    const live2 = block.filter(([r]) => r.width > 0 && r.height > 0);
    const hit = (l: number, t: number): number =>
      live2.reduce((a, [r, k2]) => a + k2 * Math.max(0, Math.min(l + w, r.right) - Math.max(l, r.left)) * Math.max(0, Math.min(t + h, r.bottom) - Math.max(t, r.top)), 0);
    let best = { left: 16, top: 64, cost: Infinity };
    for (let left = 16; left + w <= vw - 16; left += 16)
      for (let top = 64; top + h <= vh - 8; top += 8) {
        const cost = hit(left, top);
        if (cost < best.cost) best = { left, top, cost };
      }
    // 进桌那 0.45 秒牌桌在放大入场（skin.css 的 table-in），这时量的位置是缩放中的，不记住：下次来问再量
    const moving = this.c.root.parentElement?.getAnimations().some((a) => a.playState === 'running') ?? false;
    this.c.dockAt = { key: moving ? '' : key, cost: best.cost, at: { left: best.left, top: best.top, width: w, height: h } };
    return this.c.dockAt.at;
  }

  /** 这么大的聊天框有没有一个什么都不盖的地方（chatDock 算过的） */
  dockFits(w: number, h: number, extra: readonly DOMRect[]): boolean {
    this.chatDock(w, h, extra);
    return must(this.c.dockAt, 'this.c.dockAt').cost === 0;
  }

  /**
   * 互动菜单、面板不许盖的地方（kit 的 TableFun 的 avoid，docs/table-fun.md 第 1 节）：我的底牌和操作区，屏幕矩形。
   * 0.13.0 起头像菜单是 kit 画的，这里只报位置
   */
  keepOut(): DOMRect[] {
    const mine = this.c.seats[this.c.me]?.cards.filter((c) => !c.classList.contains('hidden')) ?? [];
    const parts = [...mine, ...(this.c.root.parentElement?.querySelectorAll<HTMLElement>(KEEP_OUT) ?? [])];
    return parts.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
  }

  /**
   * 看对手：点名牌弹一张小卡，名字、风格、这一场的数；放在座位往桌心那一侧，点别处或 5 秒后收起。
   * tag 是按这一场的数给的标签，电脑再加上它的性格那一句。0.13.0 起点头像是 kit 的互动菜单，这张卡只放数（docs/experience.md 13.7）
   */
  showCard(seat: number, tag: string, rows: string[]): void {
    this.hideCard();
    const s = this.c.frame?.seats[seat];
    if (!s || s.owner === 'none' || seat === this.c.me) return;
    const card = el('div', 'read-card', this.c.root);
    el('div', 'rc-name', card, this.scene.nameOf(seat, s));
    if (s.owner === 'house') el('div', 'rc-style', card, personaStyle(s.persona));
    el('div', 'rc-tag', card, tag);
    for (const r of rows) el('div', 'rc-row', card, r);
    // 贴着座位朝桌心那一边摆，不盖住这个人自己的头像和名字：顶上的往下，两边的往里
    const p = this.scene.seatPt(seat);
    const side = isTop(p, this.c.g) ? 'below' : p.x < felt(this.c.g).cx ? 'right' : 'left';
    card.classList.add(side);
    place(card, side === 'below' ? { x: p.x, y: p.y + 100 } : { x: p.x + (side === 'right' ? 80 : -80), y: p.y });
    this.clearOf(card);
    this.c.card = card;
    this.c.cardTimer = window.setTimeout(() => this.hideCard(), 5_000);
    // 下一次点哪里都收起（这一次的点击已经冒泡完了）
    window.setTimeout(() => window.addEventListener('pointerdown', () => this.hideCard(), { once: true }), 0);
  }

  /** 卡片不许盖操作按钮、加注那一行和预选（规范 1 节）：压到了就整张往上挪，挪到舞台顶为止 */
  clearOf(card: HTMLElement): void {
    const r = card.getBoundingClientRect();
    if (!r.height) return;
    const k = r.height / card.offsetHeight || 1;
    let lift = 0;
    for (const e of this.c.root.parentElement?.querySelectorAll<HTMLElement>(KEEP_OUT) ?? []) {
      const o = e.getBoundingClientRect();
      if (!o.height || o.right < r.left || o.left > r.right || o.bottom < r.top || o.top > r.bottom) continue;
      lift = Math.max(lift, r.bottom - o.top + 8 * k);
    }
    const top = this.c.root.getBoundingClientRect().top;
    lift = Math.min(lift, r.top - top - 8 * k);
    if (lift > 0) card.style.top = `${parseFloat(card.style.top) - lift / k}px`;
  }

  hideCard(): void {
    window.clearTimeout(this.c.cardTimer);
    this.c.card?.remove();
    this.c.card = null;
  }
}
