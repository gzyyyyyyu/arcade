/**
 * 右下角的操作区（docs/screens.md 8.2）：弃牌 / 过牌或跟注 / 加注；加注展开滑杆和"最小、½ 池、¾ 池、1 池、全下"。
 * 按钮上面一行写池子多大、要跟多少、赔率（要有多大把握才值得跟），再一排一键下注（半池、⅔ 池、满池、全下，点了直接下）。
 * 不该我说话时可以预选"过牌或弃牌""跟任何注"，轮到我时自动做（只在页面里，不发消息）。
 * 桌面上有快捷键：F 弃牌、C 过牌或跟注、R 加注、回车确认、Esc 收起；展开后 1–5 选五档、←/→ 和滚轮一步一个大盲（Shift 五个）。
 * 全下或弃牌的全下局是 F 弃牌、A 全下。按钮上的键位提示只在有鼠标的设备上画（style.css 里按 data-key 取）。
 */
import type { Action } from '../core/table.ts';
import type { View } from '../core/view.ts';
import { el, setText, toggle } from './dom.ts';
import { chips } from './text.ts';
import { must } from '../must.ts';
import { handOdds } from '../fun/odds.ts';

type Pre = 'checkfold' | 'callany' | null;

export class ActionBar {
  readonly root: HTMLDivElement;
  private readonly fold: HTMLButtonElement;
  private readonly call: HTMLButtonElement;
  private readonly raise: HTMLButtonElement;
  private readonly panel: HTMLDivElement;
  private readonly slider: HTMLInputElement;
  private readonly amount: HTMLSpanElement;
  private readonly presets: HTMLButtonElement[] = [];
  private readonly pre: HTMLDivElement;
  private readonly odds: HTMLDivElement;
  private readonly quick: HTMLDivElement;
  private readonly quicks: HTMLButtonElement[] = [];
  private readonly preCheck: HTMLButtonElement;
  private readonly preCall: HTMLButtonElement;
  private v: View | null = null;
  /** 跟注提示上次算的局面和结果：同一个局面重画不再抽样 */
  private oddsKey = '';
  private oddsVal = 0;
  private preset: Pre = null;
  /** 预选是在哪一手、面对多大的注时选的：注变了"过牌或弃牌"就不再自动弃 */
  private presetHand = -1;
  private onAct: (a: Action) => void;
  private onPanel: (r: DOMRect | null) => void;
  private onOpen: () => void;

  /** onOpen：第一次点"加注"展开滑杆时（新手指引的情境提示）。onPanel：操作区（含赔率、一键下注、展开的加注面板）在屏幕上的位置，收起时 null；牌桌把被盖住的座位挪开 */
  constructor(parent: HTMLElement, onAct: (a: Action) => void, onPanel: (r: DOMRect | null) => void = () => {}, onOpen: () => void = () => {}) {
    this.onAct = onAct;
    this.onOpen = onOpen;
    this.onPanel = onPanel;
    this.root = el('div', 'actions', parent);
    this.panel = el('div', 'raise-panel', this.root);
    const row = el('div', 'presets', this.panel);
    for (const [label, frac] of [['最小', 0], ['半池', 0.5], ['¾池', 0.75], ['满池', 1], ['全下', -1]] as const) {
      const b = el('button', 'preset', row, label);
      b.type = 'button';
      b.dataset.frac = String(frac);
      // 数字键 1–5 选这五档（键位提示只在有鼠标的设备上画，见 style.css）
      b.dataset.key = String(this.presets.length + 1);
      b.addEventListener('click', () => this.setRaise(this.presetTo(frac)));
      this.presets.push(b);
    }
    const line = el('div', 'raise-line', this.panel);
    const minus = el('button', 'step', line, '−');
    this.slider = el('input', 'slider', line);
    this.slider.type = 'range';
    const plus = el('button', 'step', line, '+');
    // 下注额放在滑杆这一行的最右边：单独占一行的话面板高出一截，6 人桌右下角的座位被挤成只剩名牌
    this.amount = el('span', 'raise-amt', line);
    minus.type = plus.type = 'button';
    minus.addEventListener('click', () => this.nudge(-1));
    plus.addEventListener('click', () => this.nudge(1));
    this.slider.addEventListener('input', () => this.setRaise(Number(this.slider.value)));

    this.odds = el('div', 'odds', this.root);
    this.quick = el('div', 'quick', this.root);
    for (const [label, frac] of [['半池', 0.5], ['⅔池', 2 / 3], ['满池', 1], ['全下', -1]] as const) {
      const b = btn(this.quick, 'qbet', label, () => this.quickBet(frac));
      b.dataset.frac = String(frac);
      this.quicks.push(b);
    }
    const bar = el('div', 'buttons', this.root);
    this.fold = btn(bar, 'act fold', '弃牌', () => this.send({ t: 'fold' }));
    this.call = btn(bar, 'act call', '过牌', () => this.doCall());
    this.raise = btn(bar, 'act raise', '加注', () => this.doRaise());
    this.fold.dataset.key = 'F';
    this.call.dataset.key = 'C';
    this.raise.dataset.key = 'R';
    // 滚轮在展开的面板上调下注额：不让页面跟着滚（所以不能是被动监听）
    this.panel.addEventListener('wheel', (e) => this.wheel(e), { passive: false });

    this.pre = el('div', 'pre', parent);
    this.preCheck = btn(this.pre, 'pre-btn', '过牌或弃牌', () => this.togglePre('checkfold'));
    this.preCall = btn(this.pre, 'pre-btn', '跟任何注', () => this.togglePre('callany'));

    window.addEventListener('keydown', (e) => this.key(e));
  }

  /**
   * 按视图摆出来；轮到我且有预选时返回要自动做的操作。
   * hint：要跟注时写上"我的牌大约赢几成"（src/fun/odds.ts）。只有单机现金桌传 true（app/table.ts，设置里能关）；
   * 好友房、匹配真人、锦标赛的调用不传这个参数，真人桌上永远不显示（test/arch.test.ts 查）
   */
  update(v: View | null, enabled: boolean, hint = false): Action | null {
    this.v = v;
    const lg = v && enabled && v.me !== null && v.toAct === v.me ? v.legal : null;
    toggle(this.root, 'on', lg !== null);
    if (v && v.handNo !== this.presetHand) this.preset = null;
    const inHand = !!v && v.me !== null && v.seats[v.me]?.status === 'active' && v.phase !== 'idle';
    // 全下或弃牌的全下局只有两个键，不预选
    toggle(this.pre, 'on', !lg && inHand && v?.toAct !== v?.me && !v?.pf);
    toggle(this.root, 'pf', v?.pf === true);
    toggle(this.preCheck, 'sel', this.preset === 'checkfold');
    toggle(this.preCall, 'sel', this.preset === 'callany');
    if (!lg || !v) {
      this.closePanel();
      return null;
    }
    // 轮到我了：先看预选
    const p = this.preset;
    this.preset = null;
    if (p === 'checkfold') return lg.check ? { t: 'check' } : { t: 'fold' };
    if (p === 'callany') return lg.check ? { t: 'check' } : { t: 'call' };

    if (v.pf) return this.updatePf(v, lg.call);
    const me = must(v.seats[v.me!], 'v.seats[v.me!]');
    const allinCall = !lg.check && lg.call >= me.stack;
    setText(this.call, lg.check ? '过牌' : allinCall ? `全下 ${chips(lg.call)}` : `跟注 ${chips(lg.call)}`);
    toggle(this.call, 'allin', allinCall);
    // 全下局把跟注键标成 A，回到普通桌要换回来
    this.call.dataset.key = 'C';
    toggle(this.raise, 'hidden', !lg.raise);
    // 能过牌时弃牌放一边、淡一点（白白弃牌多半是点错了）
    toggle(this.fold, 'soft', lg.check);
    toggle(this.odds, 'hidden', false);
    this.drawOdds(v, hint);
    queueMicrotask(() => this.cover());
    this.slider.min = String(lg.minTo);
    this.slider.max = String(lg.maxTo);
    this.slider.step = String(Math.max(1, v.sb));
    if (this.panelOpen()) this.setRaise(Number(this.slider.dataset.v ?? this.slider.value));
    else setText(this.raise, v.currentBet === 0 ? '下注' : '加注');
    return null;
  }

  /**
   * 全下或弃牌的全下局（docs/features.md 13.10）：只有"弃牌"和"全下"两个键（面对全下时是"跟注全下"），都是大按钮；
   * 不摆加注、一键下注。F 弃牌、A 全下（键位提示由样式在有鼠标键盘的设备上显示）
   */
  private updatePf(v: View, call: number): null {
    const me = must(v.seats[v.me!], 'v.seats[v.me!]');
    const facing = v.currentBet > v.bb;
    const all = facing ? Math.min(call, me.stack) : me.stack + me.bet;
    setText(this.call, `${facing ? '跟注全下' : '全下'} ${chips(all)}`);
    this.call.dataset.key = 'A';
    this.fold.dataset.key = 'F';
    toggle(this.call, 'allin', true);
    toggle(this.raise, 'hidden', true);
    toggle(this.fold, 'soft', false);
    toggle(this.quick, 'hidden', true);
    toggle(this.odds, 'hidden', true);
    queueMicrotask(() => this.cover());
    return null;
  }

  /** 我的赢面（整数百分比）：对着还没弃牌的几家（全下了的也算）；同一个局面只算一次 */
  private myOdds(v: View): number | null {
    if (v.me === null || v.hole.length !== 2) return null;
    const opp = v.seats.filter((s, i) => i !== v.me && (s.status === 'active' || s.status === 'allin')).length;
    if (!opp) return null;
    const key = `${v.hole.join(',')}|${v.board.join(',')}|${opp}`;
    if (key !== this.oddsKey) {
      this.oddsKey = key;
      this.oddsVal = Math.round(handOdds(v.hole, v.board, opp) / 10);
    }
    return this.oddsVal;
  }

  /**
   * 池子多大、要跟多少、赔率。赔率 = 跟了以后能赢的（现在的池子）: 要跟的；
   * "要赢 X%" = 跟的 ÷（池子 + 跟的）：赢面比这个大，长期跟就不亏
   */
  private drawOdds(v: View, hint: boolean): void {
    const lg = must(v.legal, 'v.legal');
    const pot = v.pot;
    // 桌心已经摆着池子（翻牌后：前几轮收进去的）：加注面板展开时这条的「底池」就是重复的，样式里据此收起（style.css）
    const shown = v.pots.some((x) => x > 0);
    toggle(this.odds, 'pot-shown', shown);
    // 能过牌（这一轮没人下注）又已经摆着池子：赔率条只剩「底池 N」，和桌心那块一模一样，不写（界面审查 1121 第 11 条）
    toggle(this.odds, 'dup', shown && lg.check);
    toggle(this.odds, 'with-hint', false);
    if (lg.check) this.odds.innerHTML = `底池 <b>${chips(pot)}</b>`;
    else {
      const need = Math.round((lg.call / (pot + lg.call)) * 100);
      // 一套大白话口径（界面审查 1121 第 13 条）：都说"胜率"，不写"赔率 2.5 : 1"这种术语；金额一个字都不截
      const head = `${potLabel(v)} <b>${chips(pot)}</b> · 跟 <b>${chips(lg.call)}</b>`;
      const eq = hint ? this.myOdds(v) : null;
      toggle(this.odds, 'with-hint', eq !== null);
      // 只给"要多少"新手读不懂（以为写的是"可以跟"）：有提示时把我的胜率和要的摆在一起，够了标绿
      this.odds.innerHTML =
        eq === null
          ? `${head}<span class="need">胜率要过 ${need}% 才划算</span>`
          : `${head}<span class="hint ${eq >= need ? 'ok' : 'bad'}">胜率 <b>${eq}%</b><span class="h-need"> · 至少要 ${need}%</span><span class="h-say"> · ${eq >= need ? '划算' : '不太划算'}</span></span>`;
    }
    // 一键下注：每个按钮写上会下到多少；和最小加注、全下一样多的不重复给
    toggle(this.quick, 'hidden', !lg.raise);
    if (!lg.raise) return;
    const seen = new Set<number>();
    for (const b of this.quicks) {
      const frac = Number(b.dataset.frac);
      const to = this.presetTo(frac);
      const dup = frac >= 0 && (to >= lg.maxTo || seen.has(to));
      seen.add(to);
      toggle(b, 'hidden', dup);
      b.textContent = frac < 0 ? `全下 ${chips(lg.maxTo)}` : `${must(b.textContent, 'b.textContent').split(' ')[0]} ${chips(to)}`;
    }
  }

  /** 一键下注：直接下，不展开滑杆 */
  private quickBet(frac: number): void {
    const lg = this.v?.legal;
    if (!lg?.raise) return;
    const to = this.presetTo(frac);
    this.send(to >= lg.maxTo ? { t: 'allin' } : { t: 'raise', to });
  }

  /** 告诉牌桌操作区现在盖着哪一块（没亮时 null） */
  private cover(): void {
    // 竖屏展开加注面板时收起底下那一排和 kit 的互动按钮：在 body 上切类，不用 body:has(...)（iOS Safari 上每次 DOM 变动都要整页重算样式）
    document.body.classList.toggle('texas-raising-tall', this.panelOpen() && !!this.root.closest('.stage.tall'));
    this.onPanel(this.root.classList.contains('on') ? this.coverRect() : null);
  }

  /**
   * 操作区实际占的地方：根节点、赔率条、一键下注、主按钮的并集。
   * 刚亮起时根节点还在 rise 动画里（往下偏 8 个单位），此刻量到的比最终位置低，座位按它判断会漏掉压在赔率条上的那几个像素，所以顶边按动画偏移补回去
   */
  private coverRect(): DOMRect {
    const root = this.root.getBoundingClientRect();
    let { left, top, right, bottom } = root;
    for (const n of [this.odds, this.quick, ...Array.from(this.root.children)]) {
      if (n.classList.contains('hidden') || getComputedStyle(n).display === 'none') continue;
      const r = n.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      left = Math.min(left, r.left); top = Math.min(top, r.top); right = Math.max(right, r.right); bottom = Math.max(bottom, r.bottom);
    }
    const scale = root.height / (this.root.offsetHeight || 1);
    if (this.root.getAnimations().length) top -= 8 * scale;
    return new DOMRect(left, top, right - left, bottom - top);
  }

  private send(a: Action): void {
    toggle(this.root, 'on', false);
    this.closePanel();
    this.onAct(a);
  }

  private doCall(): void {
    const lg = this.v?.legal;
    if (!lg) return;
    this.send(this.v?.pf ? { t: 'allin' } : lg.check ? { t: 'check' } : { t: 'call' });
  }

  /** 第一次点展开滑杆，再点确认 */
  private doRaise(): void {
    const lg = this.v?.legal;
    if (!lg?.raise) return;
    if (!this.panelOpen()) {
      this.root.classList.add('open');
      this.setRaise(this.presetTo(must(this.v, 'this.v').currentBet === 0 ? 0.5 : 0));
      this.cover();
      this.onOpen();
      return;
    }
    const to = Number(this.slider.dataset.v ?? this.slider.value);
    this.send(to >= lg.maxTo ? { t: 'allin' } : { t: 'raise', to });
  }

  /** 按池子算加到多少：加到 = 最高注 + 比例 × (跟注以后的池子)；0 是最小加注，-1 全下 */
  private presetTo(frac: number): number {
    const v = must(this.v, 'this.v');
    const lg = must(v.legal, 'v.legal');
    if (frac === 0) return lg.minTo;
    if (frac < 0) return lg.maxTo;
    const raw = v.currentBet + Math.round(frac * (v.pot + lg.call));
    const step = Math.max(1, v.sb);
    return clamp(Math.round(raw / step) * step, lg.minTo, lg.maxTo);
  }

  private setRaise(to: number): void {
    const v = this.v;
    const lg = v?.legal;
    if (!v || !lg) return;
    const x = clamp(to, lg.minTo, lg.maxTo);
    this.slider.value = String(x);
    // 滑杆的值会按 step 取整，最大值（全下）可能不在格子上，以 x 为准
    this.slider.dataset.v = String(x);
    const all = x >= lg.maxTo;
    setText(this.amount, all ? `全下 ${chips(x)}` : `${v.currentBet === 0 ? '下注' : '加到'} ${chips(x)}`);
    setText(this.raise, all ? '全下' : '确认');
    toggle(this.raise, 'allin', all);
    for (const b of this.presets) toggle(b, 'sel', this.presetTo(Number(b.dataset.frac)) === x);
  }

  /** 往上/下调 dir 步，一步 = 一个大盲；big 是按住 Shift，一步变五个 */
  private nudge(dir: number, big = false): void {
    const v = this.v;
    if (!v) return;
    this.setRaise(Number(this.slider.dataset.v ?? this.slider.value) + dir * raiseStep(v.bb, big));
  }

  /** 滚轮：向上滚加、向下滚减；Shift 时有的浏览器把竖滚换成横滚，两个都看 */
  private wheel(e: WheelEvent): void {
    if (!this.panelOpen()) return;
    const d = e.deltaY || e.deltaX;
    if (!d) return;
    e.preventDefault();
    this.nudge(d < 0 ? 1 : -1, e.shiftKey);
  }

  private panelOpen(): boolean {
    return this.root.classList.contains('open');
  }

  private closePanel(): void {
    this.root.classList.remove('open');
    this.cover();
    if (this.v?.legal) setText(this.raise, this.v.currentBet === 0 ? '下注' : '加注');
    toggle(this.raise, 'allin', false);
  }

  private togglePre(p: Exclude<Pre, null>): void {
    this.preset = this.preset === p ? null : p;
    this.presetHand = this.v?.handNo ?? -1;
    toggle(this.preCheck, 'sel', this.preset === 'checkfold');
    toggle(this.preCall, 'sel', this.preset === 'callany');
  }

  private key(e: KeyboardEvent): void {
    if (!this.root.classList.contains('on') || e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
    // Ctrl/⌘/Alt 组合键留给浏览器（Ctrl+R 刷新不该变成加注）
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const pf = this.v?.pf === true;
    const dir = arrowDir(k);
    if (k === 'f') this.send({ t: 'fold' });
    else if (k === 'a' && pf) this.doCall();
    else if (pf && (k === 'c' || k === 'r' || k === 'enter')) return;
    else if (k === 'c') this.doCall();
    else if (k === 'r' || (k === 'enter' && this.panelOpen())) this.doRaise();
    else if (k === 'escape') this.closePanel();
    // 面板展开时 ←/→（↑/↓）按一个大盲调，自己处理，不让滑杆按它的小步长再走一遍
    else if (dir !== 0 && this.panelOpen()) this.nudge(dir, e.shiftKey);
    else if (/^[1-5]$/.test(k) && this.panelOpen()) this.presets[Number(k) - 1]?.click();
    else return;
    e.preventDefault();
  }
}

/** 调下注额的一步：一个大盲；Shift 五个 */
export function raiseStep(bb: number, big: boolean): number {
  return Math.max(bb, 1) * (big ? 5 : 1);
}

/** 方向键换成加减方向（→、↑ 加；←、↓ 减），别的键 0 */
/**
 * 赔率条上池子的叫法：桌心的「底池」只算前几轮收进去的，赔率条的数还算上这一轮各家面前的注。
 * 桌心摆着池子、两个数又不一样时叫「总池」，免得两个「底池」对不上（审查 1122）
 */
export function potLabel(v: Pick<View, 'pot' | 'pots'>): '底池' | '总池' {
  const center = v.pots.reduce((a, x) => a + x, 0);
  return center > 0 && v.pot !== center ? '总池' : '底池';
}

export function arrowDir(k: string): number {
  return k === 'arrowright' || k === 'arrowup' ? 1 : k === 'arrowleft' || k === 'arrowdown' ? -1 : 0;
}

function btn(parent: HTMLElement, cls: string, text: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', cls, parent, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
