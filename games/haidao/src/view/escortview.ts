/**
 * 护航在守岛场景里的画面和操作（TdScene 里只留 if 分支，这里放全部护航逻辑）：
 * 航线（淡虚线 / 走过的实线 / 隘口锚标 / 相遇点红点）、商船和船尾浪、顶栏血条、底部速度三联钮 + 修船 + 跟随、
 * 预告里的相遇点说明、竖屏跟船镜头和"回到船"钮。规则状态只读（TdState.escort），操作走 host.act。
 */
import Phaser from 'phaser';
import { ESCORT_MEND, type EscortAction, type EscortPace } from '../core/escorttypes.ts';
import type { TdEvent, TdState, WavePreview } from '../core/index.ts';
import { TICKS_PER_SEC } from '../core/types.ts';
import { sfx } from './audio/sfx.ts';
import { escortIcon, escortShipArt } from './art/escort.ts';
import type { CamCtl } from './camctl.ts';
import type { FitCam } from './camfit.ts';
import { aheadPoint, centerFor, dashes, followStep, interpPos, meetPoint, nextGate, pathFrom, pathTo, shipPoint, showBackToShip, userMoved, type Pt, type View } from './escortcam.ts';
import { injectEscortCss } from './escortcss.ts';
import { PACE_INFO, PACE_ORDER, hullPercent, hullTone, meetText, mendView, paceOfKey } from './escorttext.ts';
import { put } from './ground.ts';
import { iso } from './iso.ts';
import { button, el, toast } from './ui.ts';
import { DEPTH } from './depth.ts';
import type { Occluder } from './occlude.ts';
import { SHIP_BAR, ghostAlpha, trailStep } from './shiplook.ts';

type EAct = EscortAction extends infer U ? (U extends { t: number } ? Omit<U, 't'> : never) : never;

export interface EscortHost {
  scene: Phaser.Scene;
  r: number;
  ui: HTMLElement;
  cc: CamCtl;
  fit: () => FitCam;
  state: () => TdState;
  act: (a: EAct) => void;
  /** 世界坐标上飘字 */
  float: (wx: number, wy: number, str: string, color: string, size: number) => void;
}

const STILL = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** 开场推镜走完之前不抢镜头（毫秒，FitCam 的 INTRO_HOLD + INTRO_PUSH 再留一点） */
const INTRO_MS = 2100;
const LAND_PHONE = '(orientation:landscape) and (max-height:500px)';

export class EscortView {
  private readonly h: EscortHost;
  private readonly route: readonly Pt[];
  private readonly shipArt = escortShipArt();
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly wake: Phaser.GameObjects.Graphics;
  private readonly ship: Phaser.GameObjects.Image;
  /** 船被塔楼挡住时画在塔上面的浅蓝剪影，和一直在最上层的船血条（船在哪、剩多少血任何时候看得见） */
  private readonly ghost: Phaser.GameObjects.Image;
  private readonly hbar: Phaser.GameObjects.Graphics;
  private ghostA = 0;
  private barSig = '';
  private trail = 100;
  private lastNow = 0;
  private readonly tags: Phaser.GameObjects.Text[] = [];
  private prev = 0;
  private last = 0;
  private lastTick = -1;
  private drawSig = '';
  private pv: readonly WavePreview[] = [];
  private bar: { wrap: HTMLElement; box: HTMLElement; fill: HTMLElement; txt: HTMLElement } | null = null;
  private ctl: HTMLElement | null = null;
  /** 矮竖屏的速度小钮：显示当前船速，点一下换下一档，长按（或点血条）展开修船和跟随 */
  private sum: HTMLButtonElement | null = null;
  private sumPace: EscortPace | null = null;
  /** 矮竖屏展开的速度排里的局内加速钮：点它等于点顶栏那个被收起的加速钮 */
  private speedMirror: { src: HTMLElement; btn: HTMLButtonElement } | null = null;
  private paceBtns = new Map<EscortPace, HTMLButtonElement>();
  private mend: HTMLButtonElement | null = null;
  private follow: HTMLButtonElement | null = null;
  private back: HTMLButtonElement | null = null;
  private liftSig = '';
  private camFollow = true;
  private camSet: View | null = null;
  private backOn = false;
  private hullShown = -1;

  constructor(h: EscortHost) {
    this.h = h;
    injectEscortCss();
    h.ui.classList.add('hd-esc');
    const s = this.st();
    this.route = s.escort!.def.route;
    const sc = h.scene;
    this.g = sc.add.graphics().setDepth(DEPTH.escortTrack);
    this.wake = sc.add.graphics().setDepth(DEPTH.escortWake);
    this.ship = put(sc, h.r, this.shipArt, 0, 0);
    this.ghost = put(sc, h.r, this.shipArt, 0, 0).setTint(0xd8ecff).setTintMode(Phaser.TintModes.FILL).setAlpha(0).setVisible(false);
    this.hbar = sc.add.graphics().setDepth(DEPTH.bars);
    for (let i = 0; i < 2; i++) this.tags.push(sc.add.text(0, 0, '', { fontFamily: 'system-ui', fontStyle: '900', fontSize: `${12 * h.r}px`, color: '#fff', stroke: '#7a1a14', strokeThickness: 3 * h.r }).setOrigin(0.5).setScale(1 / h.r).setDepth(DEPTH.jam).setVisible(false));
    const on = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || this.st().over) return;
      const p = paceOfKey(e.key);
      if (p) this.setPace(p);
    };
    window.addEventListener('keydown', on);
    sc.events.once('shutdown', () => {
      window.removeEventListener('keydown', on);
      this.liftObs?.disconnect();
    });
    const p0 = s.escort!.pos;
    this.prev = p0;
    this.last = p0;
  }

  private st(): TdState {
    return this.h.state();
  }

  // ---------------------------------------------------------------- 界面

  /** 顶栏：商船血条（两道刻度标 2★ / 3★） */
  buildBar(bar: HTMLElement): void {
    const def = this.st().escort!.def;
    const wrap = el('div', 'hd-esc-hullw', undefined, bar);
    wrap.addEventListener('click', () => this.toggleTray());
    const box = el('div', 'hd-esc-hull', undefined, wrap);
    box.title = '商船的血：到港时剩得越多，星越多';
    const fill = el('i', 'fill', undefined, box);
    for (const [pct, tx] of [[def.stars[0], '2★'], [def.stars[1], '3★']] as const) {
      // 靠右的刻度字写在线的左边，不然被血条右边截掉
      const mk = el('span', pct > 70 ? 'mk hi' : 'mk', undefined, box);
      mk.style.setProperty('--at', `${pct}%`);
      el('b', '', tx, mk);
    }
    const txt = el('span', 'txt', '', box);
    this.bar = { wrap, box, fill, txt };
  }

  /** 底部：速度三联钮、修船、跟随；还有竖屏的"回到船" */
  buildCtl(): void {
    // 开局船停着等造塔，试玩时有人一直不知道要点「巡航」才出发
    if (this.st().escort!.pace === 'hold') toast('船先停着：造好塔，点「巡航」出发');
    const ctl = (this.ctl = el('div', 'hd-esc-ctl', undefined, this.h.ui));
    const pace = el('div', 'hd-esc-pace', undefined, ctl);
    for (const p of PACE_ORDER) {
      const info = PACE_INFO[p];
      const b = button('', 'hd-esc-pbtn', () => this.setPace(p), pace);
      b.innerHTML = `${escortIcon(p)}<span>${info.label}</span>`;
      const k = el('kbd', 'hd-key', info.key, b);
      k.setAttribute('aria-hidden', 'true');
      b.title = `${info.tip}（${info.key}）`;
      b.dataset.pace = p;
      this.paceBtns.set(p, b);
    }
    const right = el('div', 'hd-esc-right', undefined, ctl);
    const m = (this.mend = button('', 'hd-btn-wood hd-esc-mend', () => this.h.act({ type: 'mend' }), right));
    el('span', 'cd', undefined, m);
    m.insertAdjacentHTML('beforeend', escortIcon('mend'));
    el('b', '', '修船', m);
    el('small', '', '', m);
    m.title = `修船：花 ${ESCORT_MEND.gold} 金币，回 ${ESCORT_MEND.pct}% 的血`;
    const f = (this.follow = button('', 'hd-btn-wood hd-esc-follow', () => this.h.act({ type: 'follow', on: !this.st().escort!.follow }), right));
    el('b', '', '跟随', f);
    el('i', '', undefined, f);
    f.title = '英雄跟着船走，贴身保护';
    // 矮竖屏：速度排收成底栏同一行里的一个小钮（别的尺寸 CSS 把它藏起来）
    const bar2 = this.h.ui.querySelector('.hd-td-bar2');
    if (bar2) {
      let held = false;
      let timer = 0;
      const sum = (this.sum = button('', 'hd-btn-wood hd-esc-sum', () => {
        if (held) held = false;
        else this.cyclePace();
      }, bar2 as HTMLElement));
      sum.addEventListener('pointerdown', () => {
        held = false;
        timer = window.setTimeout(() => {
          held = true;
          this.toggleTray();
        }, 450);
      });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) sum.addEventListener(ev, () => window.clearTimeout(timer));
      sum.title = '船速：点一下换下一档，长按展开修船和跟随';
      bar2.insertBefore(sum, bar2.lastElementChild);
      const src = bar2.querySelector<HTMLElement>('.hd-btn-wood:not(.hd-esc-sum)');
      if (src) {
        const btn = button(src.textContent ?? '', 'hd-btn-wood hd-esc-speed', () => {
          src.click();
          btn.textContent = src.textContent;
        }, right);
        btn.title = '游戏速度';
        this.speedMirror = { src, btn };
      }
    }
    this.back = button('', 'hd-btn-wood hd-esc-back', () => {
      this.camFollow = true;
      this.camSet = null;
    }, this.h.ui);
    this.back.innerHTML = `${escortIcon('ship')}<span>回到船</span>`;
    this.back.setAttribute('aria-label', '镜头回到船');
  }

  private cyclePace(): void {
    const cur = this.st().escort!.pace;
    this.setPace(PACE_ORDER[(PACE_ORDER.indexOf(cur) + 1) % PACE_ORDER.length]!);
  }

  /** 矮竖屏：展开 / 收起速度排（三档、修船、跟随）；别的尺寸速度排一直摆着，这个类不起作用 */
  private toggleTray(): void {
    this.ctl?.classList.toggle('open');
  }

  private setPace(p: EscortPace): void {
    if (this.st().over) return;
    this.h.act({ type: 'pace', pace: p });
    if (this.sum) this.showSum(p);
    for (const [k, b] of this.paceBtns) b.classList.toggle('on', k === p);
    sfx('tap');
  }

  /** 每拍刷新一次：血条、速度钮高亮、修船状态、跟随开关、预告 */
  refresh(pv: readonly WavePreview[]): void {
    this.pv = pv;
    const s = this.st();
    const e = s.escort!;
    const pct = hullPercent(e.hull, e.def.hull);
    if (this.bar && pct !== this.hullShown) {
      this.hullShown = pct;
      this.bar.fill.style.setProperty('--p', String(pct / 100));
      this.bar.txt.textContent = `${pct}%`;
      this.bar.box.classList.toggle('mid', hullTone(pct) === 'mid');
      this.bar.box.classList.toggle('low', hullTone(pct) === 'low');
    }
    if (this.speedMirror && this.speedMirror.btn.textContent !== this.speedMirror.src.textContent) this.speedMirror.btn.textContent = this.speedMirror.src.textContent;
    if (this.sum && this.sumPace !== e.pace) this.showSum(e.pace);
    for (const [k, b] of this.paceBtns) {
      b.classList.toggle('on', k === e.pace);
      b.setAttribute('aria-pressed', String(k === e.pace));
    }
    if (this.mend) {
      const v = mendView({ hull: e.hull, max: e.def.hull, gold: s.gold, tick: s.tick, ready: e.mendReady, tps: TICKS_PER_SEC });
      this.mend.disabled = v.disabled || s.over;
      this.mend.className = `hd-btn hd-btn-wood hd-esc-mend ${v.state}`;
      this.mend.style.setProperty('--cd', `${Math.round(v.cd * 360)}deg`);
      const sm = this.mend.querySelector('small')!;
      if (sm.textContent !== v.sub) sm.textContent = v.sub;
    }
    if (this.follow) {
      this.follow.classList.toggle('on', e.follow);
      this.follow.setAttribute('aria-pressed', String(e.follow));
    }
  }

  private showSum(p: EscortPace): void {
    this.sumPace = p;
    if (this.sum) this.sum.innerHTML = `${escortIcon(p)}<span>${PACE_INFO[p].label}</span>`;
  }

  private liftAt = 0;
  private liftObs: MutationObserver | null = null;
  private mqLand: MediaQueryList | null = null;
  private liftFound = false;
  private liftSheet: HTMLElement | null = null;
  private liftBottom: HTMLElement | null = null;
  /** 第一帧的时间：Phaser 的 time.now 是从游戏启动算的，开场推镜的等待要按本局起算 */
  private t0 = -1;

  /** 造塔面板弹出来时，速度钮跟着抬到它上面一排（竖屏、电脑）；手机横屏钮在左下角，面板开着就收起 */
  private lift(): void {
    if (!this.ctl) return;
    // 面板和底栏是界面根的直接子节点：只在子节点增减时重新找一次，不再每 100 毫秒查 DOM；媒体查询对象也只建一次
    if (!this.liftObs) {
      this.liftObs = new MutationObserver(() => {
        this.liftFound = false;
      });
      this.liftObs.observe(this.h.ui, { childList: true });
      this.mqLand = matchMedia(LAND_PHONE);
    }
    if (!this.liftFound) {
      this.liftFound = true;
      this.liftSheet = this.h.ui.querySelector<HTMLElement>('.hd-td-sheet');
      this.liftBottom = this.h.ui.querySelector<HTMLElement>('.hd-td-bottom');
    }
    const sheet = this.liftSheet;
    if (this.mqLand!.matches) {
      const sig = sheet ? 'land-hide' : 'land';
      if (sig !== this.liftSig) {
        this.liftSig = sig;
        this.ctl.style.bottom = '';
        this.ctl.style.visibility = sheet ? 'hidden' : '';
      }
      return;
    }
    this.ctl.style.visibility = '';
    const bottom = this.liftBottom;
    const base = bottom && bottom.offsetParent !== null ? bottom.offsetHeight : 84;
    const px = Math.round(Math.max(base, sheet ? sheet.offsetHeight : 0) + 8);
    const sig = String(px);
    if (sig === this.liftSig) return;
    this.liftSig = sig;
    this.ctl.style.bottom = `${px}px`;
  }

  /** 预告卡里每波加一行相遇点说明；船速一变就重画（planSig 变） */
  planSig(pv: readonly WavePreview[]): string {
    return `${this.st().escort!.pace}:${pv.map((p) => p.meet ?? 'x').join(',')}`;
  }

  decoratePlan(box: HTMLElement, pv: readonly WavePreview[]): void {
    const total = this.route.length;
    for (const p of pv) {
      if (p.meet === undefined) continue;
      const row = el('div', `hd-esc-meet${p.meet < 0 ? ' miss' : ''}`, undefined, box);
      el('i', '', undefined, row);
      el('span', '', `第 ${p.wave + 1} 波 · ${meetText(p.meet, total)}`, row);
    }
  }

  /** 竖屏放大时屏外的提示点（世界坐标）：下两波的登陆口、前方最近的隘口 */
  edgePoints(): Pt[] {
    const s = this.st();
    const out: Pt[] = [];
    for (const p of this.pv) {
      for (const l of p.lanes) {
        const at = s.level.lanes[l.lane];
        if (at) out.push(iso(at.x + 0.5, at.y + 0.5));
      }
    }
    const e = s.escort!;
    const gi = nextGate(e.def.gates, e.gatesPassed);
    const gc = gi >= 0 ? this.route[gi] : undefined;
    if (gc) out.push(iso(gc.x + 0.5, gc.y + 0.5));
    return out;
  }

  /** 竖屏适配的内容：整条航线的格子 */
  routeRects(): Array<[number, number, number, number]> {
    return this.route.map((c) => [c.x, c.y, c.x, c.y]);
  }

  // ---------------------------------------------------------------- 画面（每帧）

  frame(dt: number, frac: number, now: number): void {
    const s = this.st();
    const e = s.escort!;
    if (this.t0 < 0) this.t0 = now;
    if (s.tick !== this.lastTick) {
      this.prev = this.last;
      this.last = e.pos;
      this.lastTick = s.tick;
    }
    const pos = interpPos(this.prev, this.last, frac);
    const sp = shipPoint(this.route, pos);
    const w = iso(sp.x, sp.y);
    const ahead = iso(sp.x + sp.hx, sp.y + sp.hy);
    const sdx = ahead.x - w.x;
    const sdy = ahead.y - w.y;
    const bob = STILL ? 0 : Math.sin(now / 420) * (e.pace === 'hold' ? 1 : 2.4);
    this.ship.setPosition(w.x, w.y + bob).setDepth(sp.x + sp.y + 0.4).setFlipX(sdx < 0).setVisible(!e.sunk);
    this.ship.setAlpha(e.sunk ? 0 : 1);
    this.overShip(w.x, w.y + bob, sp.x + sp.y + 0.4, sdx < 0, e, now);
    this.drawWake(w.x, w.y, sdx, sdy, e.pace, now, sp.x + sp.y);
    this.drawRoute(pos, e);
    this.follow2(dt, pos, now - this.t0);
    // 造塔面板开着时游戏暂停、HUD 不刷新，所以抬升 / 收起放在每帧里（隔 100 毫秒查一次）
    if (now - this.liftAt > 100) {
      this.liftAt = now;
      this.lift();
    }
  }

  /** 被建筑挡住：在挡它的建筑上面补一张剪影；血条一直画在最上层，掉血时白色残段慢慢收回 */
  private overShip(x: number, y: number, depth: number, flip: boolean, e: NonNullable<TdState['escort']>, now: number): void {
    const dt = this.lastNow > 0 ? Math.min(100, now - this.lastNow) : 0;
    this.lastNow = now;
    const occ = (this.h.scene as unknown as { occ?: Occluder }).occ;
    const top = !e.sunk && occ ? occ.blocker(x, y - 30, depth) : null;
    this.ghostA = ghostAlpha(this.ghostA, !!top, dt, STILL);
    const g = this.ghost;
    if (this.ghostA > 0.01) {
      g.setVisible(true).setAlpha(this.ghostA).setPosition(x, y).setFlipX(flip);
      if (top) g.setDepth(top.depth + 0.05);
    } else if (g.visible) g.setVisible(false);
    const hb = this.hbar;
    if (e.sunk) {
      hb.setVisible(false);
      return;
    }
    const pct = hullPercent(e.hull, e.def.hull);
    this.trail = STILL ? pct : trailStep(this.trail, pct, dt);
    const sig = `${pct}|${Math.round(this.trail)}`;
    hb.setVisible(true).setPosition(x, y - SHIP_BAR.up);
    if (sig === this.barSig) return;
    this.barSig = sig;
    const { w, h } = SHIP_BAR;
    const col = { good: 0x6fd05a, mid: 0xffc83a, low: 0xe0402f }[hullTone(pct)];
    hb.clear();
    hb.fillStyle(0x2b1a15, 0.9).fillRoundedRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 4);
    if (this.trail > pct) hb.fillStyle(0xffffff, 0.9).fillRect(-w / 2, -h / 2, (w * this.trail) / 100, h);
    hb.fillStyle(col, 1).fillRect(-w / 2, -h / 2, (w * pct) / 100, h);
  }

  private drawWake(x: number, y: number, dx: number, dy: number, pace: EscortPace, now: number, depth: number): void {
    const g = this.wake;
    g.clear().setDepth(depth + 0.3);
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const px = -uy;
    const py = ux;
    const reach = pace === 'rush' ? 70 : pace === 'sail' ? 44 : 0;
    const pulse = STILL ? 0 : Math.sin(now / 180) * 3;
    if (reach === 0) {
      g.lineStyle(2.5, 0xffffff, 0.55).strokeEllipse(x, y + 6, 70 + pulse, 22 + pulse / 2);
      return;
    }
    const tx = x - ux * 40;
    const ty = y - uy * 40 + 8;
    for (const sgn of [-1, 1]) {
      g.lineStyle(3, 0xffffff, 0.7);
      g.beginPath();
      g.moveTo(tx, ty);
      g.lineTo(tx - ux * reach + px * sgn * (10 + pulse), ty - uy * reach + py * sgn * (10 + pulse));
      g.strokePath();
    }
    g.lineStyle(2.5, 0xeafcff, 0.5);
    g.beginPath();
    g.moveTo(tx - ux * 4, ty - uy * 4);
    g.lineTo(tx - ux * (reach * 0.7), ty - uy * (reach * 0.7));
    g.strokePath();
  }

  private drawRoute(pos: number, e: NonNullable<TdState['escort']>): void {
    const meets = this.pv.slice(0, 2).map((p) => meetPoint(this.route, p.meet));
    const sig = `${Math.floor(pos / 100)}|${e.gatesPassed}|${meets.map((m) => (m ? `${m.x},${m.y}` : '-')).join(';')}`;
    if (sig === this.drawSig) return;
    this.drawSig = sig;
    const g = this.g;
    g.clear();
    const W = (p: Pt): Pt => iso(p.x, p.y);
    // 没走的：淡虚线
    for (const [a, b] of dashes(pathFrom(this.route, pos).map(W), 12, 10)) g.lineStyle(4, 0xffffff, 0.45).lineBetween(a.x, a.y, b.x, b.y);
    // 走过的：实线
    const done = pathTo(this.route, pos).map(W);
    g.lineStyle(5, 0xfff3b0, 0.9);
    for (let i = 1; i < done.length; i++) g.lineBetween(done[i - 1]!.x, done[i - 1]!.y, done[i]!.x, done[i]!.y);
    // 隘口：小锚标，过了的变金色
    e.def.gates.forEach((gi, k) => {
      const c = this.route[gi];
      if (!c) return;
      const p = iso(c.x + 0.5, c.y + 0.5);
      const col = k < e.gatesPassed ? 0xffd45a : 0xffffff;
      g.lineStyle(3, 0x2b1a15, 0.9).strokeCircle(p.x, p.y - 14, 5);
      g.lineStyle(2.5, col, 1).strokeCircle(p.x, p.y - 14, 4);
      g.lineStyle(3, col, 1);
      g.lineBetween(p.x, p.y - 10, p.x, p.y + 2);
      g.lineBetween(p.x - 5, p.y - 6, p.x + 5, p.y - 6);
      g.beginPath();
      g.arc(p.x, p.y - 2, 6, 0.1, Math.PI - 0.1, false);
      g.strokePath();
    });
    // 相遇点：红点（头一波实心，第二波小一点）
    meets.forEach((m, i) => {
      const t = this.tags[i]!;
      if (!m) {
        t.setVisible(false);
        return;
      }
      const p = iso(m.x, m.y);
      g.fillStyle(0xe0402f, i === 0 ? 1 : 0.7).fillCircle(p.x, p.y - 6, i === 0 ? 9 : 7);
      g.lineStyle(2.5, 0xffffff, 1).strokeCircle(p.x, p.y - 6, i === 0 ? 9 : 7);
      t.setText(String((this.pv[i]?.wave ?? 0) + 1)).setPosition(p.x, p.y - 6).setVisible(true);
    });
  }

  // 竖屏跟船：镜头中心 = 船前方 3 格；玩家一碰就停，出"回到船"钮
  private follow2(dt: number, pos: number, now: number): void {
    const fit = this.h.fit();
    const s = this.st();
    const cc = this.h.cc;
    const live = fit.live;
    if (live && this.camFollow && !s.over && now > INTRO_MS) {
      const cur: View = { cx: cc.cx, cy: cc.cy, z: cc.z };
      if (userMoved(this.camSet, cur)) this.camFollow = false;
      else {
        const a = aheadPoint(this.route, pos);
        const wp = iso(a.x, a.y);
        const w = this.h.scene.scale.width / this.h.r;
        const hh = this.h.scene.scale.height / this.h.r;
        const z = fit.home.z;
        const tgt = centerFor(wp.x, wp.y, fit.visible(), w, hh, z);
        const nx = this.camSet ? followStep(cur, tgt, dt) : tgt;
        cc.setView(nx.cx, nx.cy, z);
        this.camSet = { cx: cc.cx, cy: cc.cy, z: cc.z };
      }
    }
    const show = showBackToShip(live, this.camFollow, s.over);
    if (show !== this.backOn && this.back) {
      this.backOn = show;
      this.back.classList.toggle('on', show);
    }
  }

  // ---------------------------------------------------------------- 事件

  onEvent(e: TdEvent): void {
    const s = this.st();
    const esc = s.escort!;
    const sp = shipPoint(this.route, esc.pos);
    const w = iso(sp.x, sp.y);
    switch (e.type) {
      case 'bite':
        this.hit(e.dmg);
        if (!STILL) this.h.float(w.x, w.y - 70, `-${e.dmg}`, '#ff6b5a', 16);
        sfx('hitWood');
        break;
      case 'mend':
        this.h.float(w.x, w.y - 70, `+${ESCORT_MEND.pct}%`, '#8be07a', 16);
        sfx('heal');
        break;
      case 'gate':
        this.h.float(w.x, w.y - 80, '过隘口', '#ffe885', 16);
        sfx('confirm');
        break;
      case 'sunk':
        this.hit(0);
        break;
      default:
        break;
    }
  }

  private hit(dmg: number): void {
    const b = this.bar;
    if (!b) return;
    if (!STILL) {
      b.wrap.classList.remove('bite');
      void b.wrap.offsetWidth;
      b.wrap.classList.add('bite');
    }
    if (dmg > 0) {
      const t = el('span', 'hd-esc-loss', `-${dmg}`, b.wrap);
      setTimeout(() => t.remove(), 900);
    }
  }
}
