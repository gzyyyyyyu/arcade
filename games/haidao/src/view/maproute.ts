/**
 * 寻宝航线（每日航线）的画面和流程：海图上的"今日航线"卡 → 航线图页（四层节点、整备、补给礁）→ 登陆战一站（BattleScene 的 map 钩子）
 * → 站间条 → … → 终局演出和结算（mapend.ts）。规则全从 maprules.ts 的注入点拿，这里只显示、存进度、串流程。
 * 进度存在本机 `haidao.map`（net/mapscore.ts）：每走一步就存，刷新、断线后从卡片接着走；战斗中途离开的那一站按 0 宝分算。
 * DOM 动画走 mapfx.ts 的时钟（跟游戏循环同步）；样式在 mapcss.ts。
 */
import { TROOPS } from '../content/index.ts';
import { fleetSurvivors, rankOf } from '../core/index.ts';
import { MAP_ENERGY_MAX, MAP_LAYERS, type MapIslandDef, type MapNode, type MapState, type ReefPick } from '../core/maptypes.ts';
import type { LiveTier } from '../core/live.ts';
import { mapLiveBp } from '../core/maplive.ts';
import type { BattleResult } from '../core/types.ts';
import { mapLive } from '../net/live.ts';
import { readMap, writeMap, type MapLocal } from '../net/mapscore.ts';
import { app, fmt } from './app.ts';
import { iconA, shipA, tArt } from './art.ts';
import { mapIslandArt } from './art/index.ts';
import { isleLook } from './art/mapart.ts';
import { sfx } from './audio/sfx.ts';
import { vibrate, REDUCED } from './feel.ts';
import { keyBadge } from './inputs.ts';
import { readLiveRun, writeLiveRun } from './livemore-logic.ts';
import { mapCss } from './mapcss.ts';
import { playFinal, type FinalOpts } from './mapend.ts';
import { every, rollNum, tween, wait } from './mapfx.ts';
import { beijingDay, mapRules, type MapSource } from './maprules.ts';
import { button, confirmBox, el, hallButton, img, openModal, toast, uiRoot } from './ui.ts';

// ---------------------------------------------------------------- 显示用的小表

export const STYLE_LOOK: Record<MapIslandDef['style'], { tag: string; c: string }> = {
  cannon: { tag: '炮台多', c: '#b03a2e' },
  mine: { tag: '有暗雷', c: '#6b4f9e' },
  mortar: { tag: '臼炮多', c: '#a0522d' },
  vault: { tag: '金库厚', c: '#2e7d5b' },
  boss: { tag: '终点宝岛', c: '#c7861e' },
};
const DEFENSE = new Set(['cannon', 'gunTower', 'mortar', 'flame', 'harpoon', 'rocket', 'shock', 'kraken', 'mine', 'tar']);

/** 风险星（只是给玩家的直观提示）：岛上防御建筑越多越危险；终点岛恒为 3 */
export function riskOf(def: MapIslandDef): number {
  if (def.style === 'boss') return 3;
  const n = def.layout.filter((p) => DEFENSE.has(p.kind)).length;
  return n <= 3 ? 1 : n <= 6 ? 2 : 3;
}

/** 有鼠标的电脑才提键盘（和 layout.ts 显示按键角标的条件一致） */
const MOUSE = typeof matchMedia === 'function' && matchMedia('(hover:hover) and (pointer:fine)').matches;
const ZERO: BattleResult = { over: true, stars: 0, destroyedPct: 0, hqDown: false };
/** 副标题用的短日期（竖屏窄，「11 月 10 日」会让副标题折行） */
const dayShort = (day: string): string => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
const nodeName = (R: MapSource, n: MapNode | undefined): string => (n?.kind === 'island' ? (R.island(n.island)?.name ?? '无名岛') : '补给礁');

/** 航线图上的位置（百分比）：港口在最下，4 层从下往上 */
const ROW_Y_STD = [91, 71, 51, 31, 11];
/** 手机横屏（高 ≤ 500）图区只有约 236 像素高，节点卡 44 高，层距 20% 只剩 2–3 像素缝；层距拉到 22.5%（约 53 像素），港口和终点各往边上挪一点 */
const ROW_Y_LOW = [92, 78, 55.5, 33, 10.5];
const rowY = (): number[] => (typeof matchMedia === 'function' && matchMedia('(orientation:landscape) and (max-height:500px)').matches ? ROW_Y_LOW : ROW_Y_STD);
function nodePos(layer: number, node: number, count: number): { x: number; y: number } {
  const ROW_Y = rowY();
  if (layer < 0) return { x: 50, y: ROW_Y[0]! };
  return { x: count <= 1 ? 50 : node === 0 ? 27 : 73, y: ROW_Y[layer + 1]! };
}
/** 小船停在节点卡下方的航路上，不盖住卡 */
const dockOf = (layer: number, node: number, count: number): { x: number; y: number } => {
  const p = nodePos(layer, node, count);
  return layer < 0 ? p : { x: p.x, y: p.y + 9.5 };
};

// ---------------------------------------------------------------- 一局的进度

interface Run {
  day: string;
  best: number;
  s: MapState;
  /** 实盘航线的档位：有它就存 `haidao.maplive.run`，不碰娱乐的 `haidao.map`、不交榜、不记今天最好 */
  live?: LiveTier;
}
let run: Run | null = null;

function persist(pending?: { node: number; rest: number }): void {
  if (!run) return;
  if (run.live) {
    // 实盘：走完的状态也留着（结回发出去之前掉线，下次打开能按它的宝分结）
    writeLiveRun({ day: run.day, tier: run.live, state: run.s, ...(pending && !run.s.over ? { pending } : {}) });
    return;
  }
  const v: MapLocal = { day: run.day, best: run.best };
  if (!run.s.over) v.state = run.s;
  if (pending && !run.s.over) v.pending = pending;
  writeMap(v);
}

/** 当前停在哪：最后走过的节点；还没出港是港口（layer -1） */
function here(s: MapState): { layer: number; node: number } {
  const l = s.log[s.log.length - 1];
  return l ? { layer: l.layer, node: l.node } : { layer: -1, node: 0 };
}

// ---------------------------------------------------------------- 键盘（电脑）

/** 页面开着时接管几个键（捕获阶段，处理了就不让 Phaser 场景再收到）；有确认框时不管 */
function grabKeys(h: (e: KeyboardEvent) => boolean): () => void {
  const f = (e: KeyboardEvent): void => {
    if (e.repeat || document.querySelector('.hd-ui > .hd-mask:not(.hd-route-mid)')) return;
    if (h(e)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  addEventListener('keydown', f, true);
  return () => removeEventListener('keydown', f, true);
}
const digit = (e: KeyboardEvent): number => (/^(Digit|Numpad)[1-9]$/.test(e.code) ? Number(e.code.slice(-1)) : 0);

// ---------------------------------------------------------------- 海图上的入口卡

/** 出海面板（seamap.ts）里的"今日航线"卡：日期、终点宝岛、今天最好 / 航行到第几站；返回移除函数 */
export function mapCard(onOpen: () => void, parent: HTMLElement = uiRoot()): () => void {
  mapCss();
  const R = mapRules();
  const day = beijingDay();
  const loc = readMap(day);
  const route = loc.state?.route ?? R.routeOf(day);
  const boss = nodeName(R, route.layers[MAP_LAYERS - 1]?.[0]);
  const b = el('button', 'hd-mapcard', undefined, parent);
  b.type = 'button';
  b.title = `今日航线，终点：${boss}`;
  b.appendChild(img(iconA('map'), 36));
  const t = el('span', 'hd-mc-t', undefined, b);
  // 标题不带日期：带上在 390 宽会折成两行；日期在点进去的航线图页顶上
  el('b', '', '今日航线', t);
  el('small', '', loc.state ? `航行中，第 ${loc.state.layer + 1}/${MAP_LAYERS} 站` : loc.best > 0 ? `今天最好 ${fmt(loc.best)} 宝分` : '今天还没出航 · 4 站 3 分钟', t);
  el('span', 'hd-mc-go', loc.state ? '接着走' : '出航', b);
  b.addEventListener('click', () => {
    sfx('tap');
    onOpen();
  });
  return () => b.remove();
}

/** "今日航线"卡旁边的"实盘"小钮（带筹码跑同一条航线）；返回移除函数 */
export function mapLiveChip(onOpen: () => void, parent: HTMLElement): () => void {
  mapCss();
  const b = el('button', 'hd-mapchip', undefined, parent);
  b.type = 'button';
  b.setAttribute('aria-label', '航线实盘');
  el('b', '', '实盘', b);
  el('small', '', '带筹码', b);
  b.addEventListener('click', () => {
    sfx('tap');
    onOpen();
  });
  return () => b.remove();
}

// ---------------------------------------------------------------- 入口

/** 打开今天的航线：有没走完的就接着走（中途离开的那一站按 0 宝分算），没有就新开一条 */
export function openRoute(fresh = false): void {
  mapCss();
  const R = mapRules();
  const day = beijingDay();
  const loc = readMap(day);
  let s = !fresh && loc.state ? loc.state : R.startMap(R.routeOf(day));
  if (!fresh && loc.state && loc.pending) {
    const p = loc.pending;
    const n = s.route.layers[s.layer]?.[p.node];
    if (n?.kind === 'island') s = R.finishStop(s, p.node, p.rest, ZERO, s.fleet.map((b) => b.alive), s.energy);
    toast('上一站中途离开了，按 0 宝分算');
  }
  run = { day, best: loc.best, s };
  persist();
  if (s.over) finish();
  else showRoute();
}

/**
 * 实盘航线（带筹码跑今天的航线）：fresh 是刚带入的一趟，从头走；否则接着本机记的进度走（战斗中途离开的那一站按 0 宝分算）。
 * 流程和娱乐完全一样，只是进度存在 `haidao.maplive.run`。进度找不到（被清了、换天了）说明这趟已经由 resumeLive 结掉了。
 */
export function openLiveRoute(tier: LiveTier, fresh: boolean): void {
  mapCss();
  const R = mapRules();
  const day = beijingDay();
  const saved = fresh ? null : readLiveRun();
  if (!fresh && !(saved?.state && saved.day === day && saved.tier === tier)) {
    toast('这趟实盘航线已经结算了');
    return;
  }
  let s = saved?.state ?? R.startMap(R.routeOf(day));
  if (saved?.pending) {
    const p = saved.pending;
    const n = s.route.layers[s.layer]?.[p.node];
    if (n?.kind === 'island') s = R.finishStop(s, p.node, p.rest, ZERO, s.fleet.map((b) => b.alive), s.energy);
    toast('上一站中途离开了，按 0 宝分算');
  }
  run = { day, best: 0, s, live: tier };
  persist();
  if (s.over) finish();
  else showRoute();
}

/** 回到基地场景（航线页、终局都盖在场景上面；从战斗回来时底下换成基地） */
function toBase(): void {
  const cur = app.game.scene.getScenes(true)[0]?.scene.key;
  if (cur !== 'base') app.goBase();
  else app.api.scene = 'base';
}

// ---------------------------------------------------------------- 航线图页

let page: RoutePage | null = null;

function showRoute(stamp = false): void {
  page?.close(true);
  page = new RoutePage(stamp);
}

class RoutePage {
  private root: HTMLElement;
  private paper: HTMLElement;
  private nodesEl: HTMLElement;
  private lines: SVGSVGElement;
  private ship: HTMLElement;
  private shipAt: { x: number; y: number };
  private ptsEl: HTMLElement;
  private fleetEl: HTMLElement;
  private bottom: HTMLElement;
  private goBtn: HTMLButtonElement;
  private tip: HTMLElement;
  private prep: HTMLElement | null = null;
  private sel = -1;
  private rest = -1;
  private busy = false;
  private dead = false;
  private unkeys: () => void;
  private readonly alive = (): boolean => !this.dead;

  constructor(stamp: boolean) {
    const R = mapRules();
    const s = run!.s;
    this.root = el('div', 'hd-route', undefined, uiRoot());
    hallButton(() => app.leave(), this.root);
    const top = el('div', 'hd-route-top', undefined, this.root);
    const tt = el('div', 'hd-route-title', undefined, top);
    el('b', '', run!.live ? '今日航线（实盘）' : '今日航线', tt);
    el('small', '', `${dayShort(run!.day)} · 终点 ${nodeName(R, s.route.layers[MAP_LAYERS - 1]?.[0])}`, tt);
    const pts = el('div', 'hd-pill hd-route-pts', undefined, top);
    pts.appendChild(img(iconA('gold'), 22));
    this.ptsEl = el('b', '', fmt(s.pts), pts);
    button('回岛', 'hd-btn-wood hd-route-home', () => this.leave(), top);
    this.fleetEl = el('div', 'hd-route-fleet', undefined, this.root);

    const chart = el('div', 'hd-route-chart', undefined, this.root);
    this.paper = el('div', 'hd-route-paper', undefined, chart);
    this.deco();
    // 整备条开着时节点点不了（mapcss），点纸面空白等于点 ×
    this.paper.addEventListener('click', (e) => {
      if (this.sel >= 0 && this.prep && !(e.target as HTMLElement).closest('.hd-route-node')) this.unpick();
    });
    this.lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.lines.setAttribute('viewBox', '0 0 100 100');
    this.lines.setAttribute('preserveAspectRatio', 'none');
    this.lines.classList.add('hd-route-lines');
    this.paper.appendChild(this.lines);
    this.nodesEl = el('div', '', undefined, this.paper);
    this.ship = el('div', 'hd-route-ship', undefined, this.paper);
    this.ship.appendChild(img(shipA('flagship', rankOf(app.profile)), 46));
    const h = here(s);
    this.shipAt = dockOf(h.layer, h.node, s.route.layers[h.layer]?.length ?? 1);

    this.bottom = el('div', 'hd-route-bottom', undefined, this.root);
    this.tip = el('div', 'hd-route-tip', '', this.bottom);
    const home = button('收航', 'hd-btn-wood', () => this.askHome(), this.bottom);
    keyBadge(home, 0);
    home.querySelector('.hd-key')!.textContent = 'H';
    this.goBtn = button('出发', 'hd-btn-gold', () => void this.sail(), this.bottom, 'confirm');
    keyBadge(this.goBtn, 0);
    this.goBtn.querySelector('.hd-key')!.textContent = '↵';

    this.unkeys = grabKeys((e) => this.key(e));
    this.render(stamp);
    // 小船随浪轻轻起伏（位置由 placeShip 每帧写）
    every((ms) => {
      this.placeShip(ms);
      return true;
    }, this.alive);
    const ro = new ResizeObserver(() => this.placeShip(0));
    ro.observe(this.paper);
    this.root.addEventListener('hd-gone', () => ro.disconnect());
  }

  private deco(): void {
    // 罗盘、几道浪：纯装饰，SVG 直接画
    const c = el('div', 'hd-route-deco', undefined, this.paper);
    c.style.cssText = 'right:10px;bottom:10px;width:64px;height:64px';
    c.innerHTML = `<svg viewBox="0 0 64 64" width="64" height="64"><circle cx="32" cy="32" r="28" fill="none" stroke="#7a5a30" stroke-width="2"/><circle cx="32" cy="32" r="20" fill="none" stroke="#7a5a30" stroke-width="1" stroke-dasharray="2 3"/><path d="M32 4 L37 32 L32 60 L27 32 Z" fill="#b03a2e" stroke="#2b1a15" stroke-width="1.5"/><path d="M4 32 L32 27 L60 32 L32 37 Z" fill="#e2c690" stroke="#2b1a15" stroke-width="1.5"/><text x="32" y="14" text-anchor="middle" font-size="9" font-weight="900" fill="#2b1a15">北</text></svg>`;
    for (let i = 0; i < 6; i++) {
      const w = el('div', 'hd-route-deco', undefined, this.paper);
      w.style.cssText = `left:${(i * 37 + 8) % 84}%;top:${12 + ((i * 29) % 76)}%;width:46px;height:12px`;
      w.innerHTML = '<svg viewBox="0 0 46 12" width="46" height="12"><path d="M2 8 q5 -7 10 0 t10 0 t10 0 t10 0" stroke="#4f7f8f" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
    }
  }

  /** 整张图按当前进度重画（进度变化时才调，不每帧） */
  private render(stamp = false): void {
    const R = mapRules();
    const s = run!.s;
    this.ptsEl.textContent = fmt(s.pts);
    this.renderFleet();
    // 线：每层到下一层全连；走过的金色，眼下能去的蓝色流动
    this.lines.textContent = '';
    const NS = 'http://www.w3.org/2000/svg';
    const taken = new Set<string>();
    let prev = { layer: -1, node: 0 };
    for (const l of s.log) {
      taken.add(`${prev.layer}.${prev.node}-${l.layer}.${l.node}`);
      prev = { layer: l.layer, node: l.node };
    }
    const h = here(s);
    const rows: Array<{ layer: number; n: number }> = [{ layer: -1, n: 1 }, ...s.route.layers.map((ns, i) => ({ layer: i, n: ns.length }))];
    for (let r = 0; r + 1 < rows.length; r++) {
      const a = rows[r]!;
      const b = rows[r + 1]!;
      for (let i = 0; i < a.n; i++) for (let j = 0; j < b.n; j++) {
        const pa = a.layer < 0 ? nodePos(-1, 0, 1) : nodePos(a.layer, i, a.n);
        const pb = nodePos(b.layer, j, b.n);
        const ln = document.createElementNS(NS, 'line');
        ln.setAttribute('x1', String(pa.x));
        ln.setAttribute('y1', String(pa.y));
        ln.setAttribute('x2', String(pb.x));
        ln.setAttribute('y2', String(pb.y));
        if (taken.has(`${a.layer}.${i}-${b.layer}.${j}`)) ln.classList.add('taken');
        else if (!s.over && a.layer === h.layer && (a.layer < 0 || i === h.node) && b.layer === s.layer) ln.classList.add('next');
        this.lines.appendChild(ln);
      }
    }
    // 港口
    this.nodesEl.textContent = '';
    const hb = el('div', 'hd-route-harbor', undefined, this.nodesEl);
    const hp = nodePos(-1, 0, 1);
    hb.style.left = `${hp.x}%`;
    hb.style.top = `${hp.y + 3}%`;
    hb.innerHTML = '<svg viewBox="0 0 60 18" width="60" height="18"><path d="M2 14 H58 M8 14 V6 M20 14 V6 M32 14 V6 M44 14 V6 M54 14 V6 M4 6 H56" stroke="#6a4a22" stroke-width="3" stroke-linecap="round" fill="none"/></svg>';
    el('span', '', '出港', hb);
    // 节点
    const visited = new Map(s.log.map((l) => [`${l.layer}.${l.node}`, l]));
    s.route.layers.forEach((ns, layer) => {
      const lbl = el('div', 'hd-route-layer', layer === MAP_LAYERS - 1 ? '终点' : `第 ${layer + 1} 站`, this.nodesEl);
      lbl.style.top = `${rowY()[layer + 1]! - 8.5}%`;
      ns.forEach((n, i) => {
        const cur = !s.over && layer === s.layer;
        const log = visited.get(`${layer}.${i}`);
        const skip = layer < s.layer && !log;
        const b = el('button', `hd-route-node${cur ? ' cur' : layer > s.layer ? ' fut' : ''}${log ? ' done' : ''}${skip ? ' skip' : ''}${n.kind === 'reef' ? ' reef' : ''}${layer === MAP_LAYERS - 1 ? ' boss' : ''}${cur && i === this.sel ? ' sel' : ''}`, undefined, this.nodesEl);
        b.type = 'button';
        b.dataset.layer = String(layer);
        b.dataset.node = String(i);
        const p = nodePos(layer, i, ns.length);
        b.style.left = `${p.x}%`;
        b.style.top = `${p.y}%`;
        this.nodeFace(b, n, R);
        if (cur && ns.length > 1) keyBadge(b, i + 1);
        if (log) {
          const st = el('span', `hd-route-stamp${stamp && log === s.log[s.log.length - 1] ? ' new' : ''}`, log.reef ? '✓' : `+${fmt(log.gain)}`, b);
          st.classList.add('hd-n');
          st.title = '走过了';
        }
        if (cur) b.addEventListener('click', () => this.pick(i));
        else b.addEventListener('click', () => toast(layer > s.layer ? '先走完前面的站' : '这一站已经过去了'));
      });
    });
    if (stamp) {
      sfx('star');
      vibrate('land');
    }
    this.syncBottom();
    this.placeShip(0);
  }

  private nodeFace(b: HTMLElement, n: MapNode, R: MapSource): void {
    const isle = el('span', 'hd-route-isle', undefined, b);
    const info = el('span', 'hd-route-info', undefined, b);
    if (n.kind === 'reef') {
      isle.innerHTML = '<svg viewBox="0 0 52 44" width="52" height="44"><ellipse cx="26" cy="34" rx="23" ry="8" fill="#7fc6d8" stroke="#2b1a15" stroke-width="2"/><path d="M8 34 L14 22 L20 34 Z M30 34 L36 18 L44 34 Z" fill="#8d806c" stroke="#2b1a15" stroke-width="2" stroke-linejoin="round"/><rect x="19" y="20" width="12" height="13" rx="2" fill="#a86a34" stroke="#2b1a15" stroke-width="2"/><path d="M19 25 H31 M19 29 H31" stroke="#5e3719" stroke-width="1.5"/></svg>';
      el('b', '', '补给礁', info);
      const tg = el('span', 'hd-route-tags', undefined, info);
      el('span', 'hd-route-tag', '补兵', tg);
      el('span', 'hd-route-tag', '或 补能量', tg);
      el('span', 'hd-route-val', '二选一', info);
      return;
    }
    const def = R.island(n.island);
    isle.appendChild(img(mapIslandArt(def ? isleLook(n.island, def.style) : 0), b.classList.contains('boss') ? 56 : 44, 'hd-img'));
    el('b', '', def?.name ?? '无名岛', info);
    if (!def) return;
    const tg = el('span', 'hd-route-tags', undefined, info);
    const look = STYLE_LOOK[def.style];
    const st = el('span', 'hd-route-tag st', look.tag, tg);
    st.style.setProperty('--c', look.c);
    for (const h of def.hint.slice(0, 2)) el('span', 'hd-route-tag', h, tg);
    const v = el('span', 'hd-route-val', undefined, info);
    v.appendChild(img(iconA('gold'), 14));
    el('b', '', fmt(def.pts), v);
    const r = riskOf(def);
    const rk = el('span', 'hd-route-risk', undefined, v);
    rk.title = `风险 ${r} 星`;
    rk.append('★'.repeat(r));
    el('s', '', '★'.repeat(3 - r), rk);
  }

  private renderFleet(): void {
    const s = run!.s;
    this.fleetEl.textContent = '';
    s.fleet.forEach((b, i) => {
      const c = el('div', `hd-route-crew${b.alive <= 0 ? ' gone' : b.alive < b.cap ? ' hurt' : ''}`, undefined, this.fleetEl);
      c.dataset.i = String(i);
      c.title = TROOPS[b.troop].name;
      c.appendChild(img(tArt(b.troop, 'idle'), 28));
      el('b', '', `${b.alive}/${b.cap}`, c);
      el('i', '', undefined, c).style.setProperty('--k', String(b.cap ? b.alive / b.cap : 0));
    });
    const e = el('div', 'hd-route-energy', undefined, this.fleetEl);
    e.title = '旗舰能量：放技能用，跨站累计';
    e.appendChild(img(iconA('energy'), 22));
    el('b', '', `${s.energy}/${MAP_ENERGY_MAX}`, e);
    el('i', '', undefined, e).style.setProperty('--k', String(s.energy / MAP_ENERGY_MAX));
  }

  private placeShip(ms: number): void {
    const w = this.paper.clientWidth;
    const h = this.paper.clientHeight;
    const bob = REDUCED ? 0 : Math.sin(ms / 520) * 2.5;
    this.ship.style.transform = `translate(${(this.shipAt.x / 100) * w - 30}px,${(this.shipAt.y / 100) * h - 34 + bob}px)`;
  }

  /** 小船沿航路开到 to（百分比坐标），收拾好再回来 */
  private moveShip(to: { x: number; y: number }, ms = 900): Promise<void> {
    const from = { ...this.shipAt };
    this.ship.style.setProperty('--f', to.x < from.x - 1 ? '-1' : '1');
    sfx('splash');
    return tween(ms, (k) => {
      this.shipAt = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
    }, 'recover', this.alive);
  }

  private syncBottom(): void {
    const s = run!.s;
    const n = this.sel >= 0 ? s.route.layers[s.layer]?.[this.sel] : undefined;
    this.goBtn.disabled = this.busy || n?.kind !== 'island';
    this.tip.textContent = this.sel < 0 ? (s.route.layers[s.layer]?.length ?? 0) > 1 ? (MOUSE ? '选一个去处（按 1 / 2）' : '点一座岛') : '点终点宝岛，准备登陆' : '';
    this.tip.style.display = this.tip.textContent ? '' : 'none';
  }

  private pick(i: number): void {
    if (this.busy) return;
    const s = run!.s;
    const n = s.route.layers[s.layer]?.[i];
    if (!n) return;
    this.sel = i;
    this.rest = -1;
    for (const b of this.nodesEl.querySelectorAll<HTMLElement>('.hd-route-node.cur')) b.classList.toggle('sel', Number(b.dataset.node) === i);
    this.openPrep(n, i);
    this.syncBottom();
  }

  private closePrep(): void {
    this.prep?.remove();
    this.prep = null;
  }

  private openPrep(n: MapNode, node: number): void {
    this.closePrep();
    const R = mapRules();
    const s = run!.s;
    const d = (this.prep = el('div', 'hd-sheet hd-route-prep', undefined, this.bottom));
    const head = el('div', 'hd-head', undefined, d);
    if (n.kind === 'reef') {
      el('h2', '', '补给礁', head);
      button('×', 'hd-x', () => this.unpick(), head);
      el('p', '', '靠岸歇一歇，不打仗。二选一：', d);
      const crew = R.takeReef(s, node, 'crew');
      const en = R.takeReef(s, node, 'energy');
      const gotCrew = crew.fleet.reduce((a, b) => a + b.alive, 0) - s.fleet.reduce((a, b) => a + b.alive, 0);
      const row = el('div', 'hd-route-picks', undefined, d);
      const mk = (pick: ReefPick, title: string, sub: string, k: number): void => {
        const b = button('', 'hd-btn-gold hd-route-pick', () => void this.reef(node, pick), row, 'confirm');
        el('b', '', title, b);
        el('small', '', sub, b);
        keyBadge(b, k);
      };
      mk('crew', '补兵', gotCrew > 0 ? `每条船补回一半缺员（+${gotCrew} 人）` : '船队满员，补了也没用', 1);
      mk('energy', '补能量', `能量 ${s.energy} → ${en.energy}`, 2);
      return;
    }
    const def = R.island(n.island);
    el('h2', '', `第 ${s.layer + 1} 站 · ${def?.name ?? ''}`, head);
    button('×', 'hd-x', () => this.unpick(), head);
    if (def) el('p', '', `满分 ${fmt(def.pts)} 宝分 · ${STYLE_LOOK[def.style].tag}${def.hint.length ? ` · ${def.hint.join(' ')}` : ''} · 50 秒一站`, d);
    el('p', '', '选一条船休整（这站不上岛，回一半缺员），不选就全队出战：', d);
    const box = el('div', 'hd-route-rest', undefined, d);
    const sailing = (): number => s.fleet.filter((b, i) => i !== this.rest && b.alive > 0).length;
    const info = el('p', '', '', d);
    const paint = (): void => {
      for (const b of box.querySelectorAll<HTMLElement>('.hd-route-restbtn')) b.classList.toggle('sel', Number(b.dataset.i) === this.rest);
      info.textContent = `出战 ${sailing()} 条船 · 能量 ${s.energy}/${MAP_ENERGY_MAX}`;
    };
    s.fleet.forEach((b, i) => {
      const healed = R.finishStop(s, node, i, ZERO, s.fleet.map((x) => x.alive), s.energy).fleet[i]?.alive ?? b.alive;
      const gain = Math.max(0, healed - b.alive);
      const btn = button('', 'hd-route-restbtn', () => {
        this.rest = this.rest === i ? -1 : i;
        paint();
      }, box);
      btn.dataset.i = String(i);
      btn.appendChild(img(tArt(b.troop, 'idle'), 26));
      el('span', '', `${b.alive}/${b.cap}`, btn);
      el('small', '', gain > 0 ? `休整 +${gain}` : '满员', btn);
      // 只剩这一条能出战的船时不能休整
      btn.disabled = s.fleet.every((x, j) => j === i || x.alive <= 0);
    });
    paint();
  }

  private unpick(): void {
    this.sel = -1;
    this.rest = -1;
    this.closePrep();
    for (const b of this.nodesEl.querySelectorAll('.hd-route-node.sel')) b.classList.remove('sel');
    this.syncBottom();
  }

  private key(e: KeyboardEvent): boolean {
    if (this.busy) return false;
    const n = digit(e);
    const s = run!.s;
    const reefOpen = this.sel >= 0 && s.route.layers[s.layer]?.[this.sel]?.kind === 'reef';
    if (n && reefOpen && n <= 2) {
      void this.reef(this.sel, n === 1 ? 'crew' : 'energy');
      return true;
    }
    if (n && n <= (s.route.layers[s.layer]?.length ?? 0)) {
      this.pick(n - 1);
      return true;
    }
    if (e.key === 'Enter') {
      if (!this.goBtn.disabled) this.goBtn.click();
      return true;
    }
    if (e.key === 'h' || e.key === 'H') {
      this.askHome();
      return true;
    }
    if (e.key === 'Escape' && this.sel >= 0) {
      this.unpick();
      return true;
    }
    return false;
  }

  private async reef(node: number, pick: ReefPick): Promise<void> {
    if (this.busy || !run) return;
    this.busy = true;
    this.closePrep();
    this.syncBottom();
    const R = mapRules();
    const s = run.s;
    run.s = R.takeReef(s, node, pick);
    persist();
    await this.moveShip(dockOf(s.layer, node, s.route.layers[s.layer]!.length));
    if (this.dead) return;
    sfx(pick === 'crew' ? 'heal' : 'flare');
    vibrate('skill');
    toast(pick === 'crew' ? '补兵完成，船队精神了' : '能量补满一截');
    this.sel = -1;
    this.busy = false;
    this.render(true);
    for (const c of this.fleetEl.children) (c as HTMLElement).classList.add('bump');
  }

  private async sail(): Promise<void> {
    if (this.busy || !run || this.sel < 0) return;
    const R = mapRules();
    const s = run.s;
    const node = this.sel;
    const n = s.route.layers[s.layer]?.[node];
    if (n?.kind !== 'island') return;
    const rest = this.rest;
    const setup = R.stopSetup(s, node, rest);
    if (!setup.army.boats.length) return toast('没有能出战的船了');
    this.busy = true;
    this.closePrep();
    this.syncBottom();
    // 进战斗前记下这一站：中途离开、刷新回来按 0 宝分结
    persist({ node, rest });
    await this.moveShip(dockOf(s.layer, node, s.route.layers[s.layer]!.length));
    if (this.dead) return;
    const prev = s;
    const name = nodeName(R, n);
    this.close();
    app.startMapStop(setup, {
      stop: prev.layer + 1,
      name,
      pts: prev.pts,
      gain: (res) => R.finishStop(prev, node, rest, res, prev.fleet.map((b) => b.alive), prev.energy).pts - prev.pts,
      onFinish: (res, alive, energy) => afterStop(prev, node, rest, res, alive, energy),
    });
  }

  private askHome(): void {
    if (this.busy || !run) return;
    const pts = run.s.pts;
    confirmBox(pts > 0 ? `现在收航，带着 ${fmt(pts)} 宝分回家？后面的站就不打了。` : '一站没打就收航？宝分是 0。', '收航', () => {
      if (!run) return;
      run.s = mapRules().goHome(run.s);
      this.close();
      finish();
    }, '再走走');
  }

  private leave(): void {
    this.close();
    toBase();
  }

  close(now = false): void {
    if (this.dead) return;
    this.dead = true;
    this.unkeys();
    this.root.dispatchEvent(new Event('hd-gone'));
    if (page === this) page = null;
    if (now || REDUCED) return void this.root.remove();
    this.root.classList.add('out');
    setTimeout(() => this.root.remove(), 240);
  }
}

// ---------------------------------------------------------------- 一站打完：写回、站间条

function afterStop(prev: MapState, node: number, rest: number, res: BattleResult, alive: number[], energy: number): void {
  if (!run) return;
  const R = mapRules();
  const next = R.finishStop(prev, node, rest, res, fleetSurvivors(prev, rest, alive), energy);
  run.s = next;
  persist();
  showMid(prev, next, node, res);
}

function showMid(prev: MapState, next: MapState, node: number, res: BattleResult): void {
  const R = mapRules();
  const gain = next.pts - prev.pts;
  // 每一站的小结算：点遮罩不理，Esc = 主按钮（继续），按钮出现之前不动
  let goOn: (() => void) | undefined;
  const mask = openModal({ cls: 'hd-route-mid', closable: false, onEsc: () => goOn?.() });
  const box = el('div', 'hd-dialog hd-route-midbox', undefined, mask);
  const alive = (): boolean => mask.isConnected;
  el('h2', '', `第 ${prev.layer + 1} 站 · ${nodeName(R, prev.route.layers[prev.layer]?.[node])}`, box);
  const sr = el('div', 'hd-stars', undefined, box);
  for (let i = 0; i < 3; i++) sr.appendChild(img(iconA(i < res.stars ? 'star' : 'starEmpty'), 26));
  const lost = next.log[next.log.length - 1]?.lost ?? 0;
  el('div', '', `摧毁 ${res.destroyedPct}%${lost > 0 ? ` · 折损 ${lost} 人` : ' · 一个没少'}`, box).style.fontWeight = '800';
  // 这一站拿的宝分居中大字（带单位），累计只在不是第一站时另起一行（第一站累计和这站一样，写两遍是重复）
  const gl = el('div', 'hd-route-gain', undefined, box);
  const g = el('b', 'hd-pos', '+0', gl);
  el('small', '', '宝分', gl);
  const tot = el('div', 'hd-route-total', `累计 ${fmt(prev.pts)}`, box);
  if (prev.pts === 0) tot.style.display = 'none';
  // 船队：每种兵一格（图 + 剩几个 / 满编 + 这站折损），比一排小胶囊看得清
  el('div', 'hd-route-losscap', '船队还剩', box);
  const loss = el('div', 'hd-route-loss', undefined, box);
  next.fleet.forEach((b, i) => {
    const d = b.alive - (prev.fleet[i]?.alive ?? b.alive);
    const sp = el('span', b.alive === 0 ? 'gone' : '', undefined, loss);
    sp.appendChild(img(tArt(b.troop, 'idle'), 30));
    el('b', 'hd-n', `${b.alive}/${b.cap}`, sp);
    if (d !== 0) el('em', d > 0 ? 'up' : '', d > 0 ? `+${d}` : `${d}`, sp);
  });
  const row = el('div', 'hd-row', undefined, box);
  vibrate(res.stars > 0 ? 'win' : 'land');
  let unkeys = (): void => undefined;
  const close = (): void => {
    unkeys();
    mask.remove();
  };
  const go = (): void => {
    close();
    toBase();
    showRoute(true);
  };
  const home = (): void => {
    if (!run) return;
    close();
    run.s = R.goHome(run.s);
    finish();
  };
  if (!next.over) {
    button('收航', 'hd-btn-wood', home, row);
    button('继续 → 下一站', 'hd-btn-gold', go, row, 'confirm');
    goOn = () => {
      if (row.classList.contains('on')) go();
    };
    unkeys = grabKeys((e) => {
      if (!row.classList.contains('on')) return false;
      if (e.key === 'Enter') {
        go();
        return true;
      }
      if (e.key === 'h' || e.key === 'H') {
        home();
        return true;
      }
      return false;
    });
  } else {
    el('p', '', next.end === 'wiped' ? '船队打光了……' : '终点宝岛拿下了！', row).style.cssText = 'margin:0;font-weight:900';
  }
  // 数字滚动 → 按钮出现（约 2 秒）
  void (async () => {
    await wait(350, alive);
    if (gain > 0) sfx('coin');
    await rollNum(g, 0, gain, 900, (n) => `+${fmt(n)}`, alive);
    if (prev.pts > 0) await rollNum(tot, prev.pts, next.pts, 500, (n) => `累计 ${fmt(n)}`, alive);
    await wait(250, alive);
    row.classList.add('on');
    if (next.over) {
      await wait(900, alive);
      if (!alive()) return;
      close();
      finish();
    }
  })();
}

// ---------------------------------------------------------------- 终局

function finish(): void {
  if (!run) return;
  const R = mapRules();
  const r = run;
  const fin = R.mapFinal(r.s);
  const prevBest = r.best;
  let live: FinalOpts['live'];
  if (r.live) {
    // 实盘：先把结回写进钱包记录（同步写成 settling，发出去之前关页面也会在下次打开时重发），再清掉进度
    const bp = mapLiveBp(r.live, fin);
    const sent = mapLive.settle(bp);
    live = { tier: r.live, bp, sent };
    writeLiveRun(null);
  } else {
    r.best = Math.max(r.best, fin.score);
    persist();
  }
  playFinal({
    s: r.s,
    fin,
    day: r.day,
    prevBest,
    rules: R,
    ...(live ? { live } : {}),
    onHome: () => {
      run = null;
      toBase();
    },
    onAgain: () => {
      toBase();
      openRoute(true);
    },
  });
}
