import type { Res } from '../core/types.ts';
import { PALETTE as P, badgeArt } from './art/index.ts';
import { iconA, type ArtPiece } from './art.ts';
import { fmt } from './app.ts';
import { isMusicOn, isSfxOn, setMusicOn, setSfxOn, sfx, type SfxName } from './audio/sfx.ts';
import { feelOn, resetFeel, setFeel, vibrate } from './feel.ts';
import { ModalStack, type ModalEntry } from './modalstack.ts';
import { applySkin, skinCss } from './skin.ts';
import { layoutCss } from './layout.ts';
import { baseFeelCss } from './basecss.ts';
import { mountPost } from './post.ts';
import { dismiss, feedbackCss, removeNow, sceneVeil } from './transitions.ts';

/** DOM 界面的公共件。样式全部限定在 .hd-ui 根节点下，类名前缀 hd- */

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

const urls = new Map<string, string>();
/** SVG 字符串 → data URL（同一张只编一次） */
export function svgUrl(p: ArtPiece): string {
  let u = urls.get(p.key);
  if (!u) urls.set(p.key, (u = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(p.svg)}`));
  return u;
}

/** 素材放进 DOM：高度 px，宽度按比例 */
export function img(p: ArtPiece, px: number, cls = 'hd-img'): HTMLImageElement {
  const i = el('img', cls);
  i.src = svgUrl(p);
  i.alt = '';
  i.draggable = false;
  i.style.height = `${px}px`;
  i.style.width = `${Math.round((px * p.w) / p.h)}px`;
  return i;
}

/** snd：点按声音，默认 tap；确认类按钮传 'confirm'，不想响传 null（按钮自己放声音时） */
export function button(label: string, cls: string, onClick: () => void, parent?: HTMLElement, snd: SfxName | null = 'tap'): HTMLButtonElement {
  const b = el('button', `hd-btn ${cls}`, label, parent);
  b.type = 'button';
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!b.disabled) {
      if (snd) sfx(snd);
      onClick();
    }
  });
  return b;
}

/** 金币木材费用：图标 + 数字，不够的数字标红 */
export function costRow(c: Res, have?: Res): HTMLElement {
  const row = el('span', 'hd-cost');
  for (const k of ['gold', 'wood'] as const) {
    if (!c[k]) continue;
    const s = el('span', 'hd-cost-i', undefined, row);
    s.appendChild(img(iconA(k), 18));
    const t = el('b', have && have[k] < c[k] ? 'hd-n hd-short' : 'hd-n', fmt(c[k]), s);
    t.title = k === 'gold' ? '金币' : '木材';
  }
  if (!c.gold && !c.wood) el('span', '', '免费', row);
  return row;
}

/**
 * 长列表翻页（不滚动）：按 box 能放下多少分页，页内上一页 / 下一页，页码"1 / 3"。
 * 做法：逐个显示列表项，box 一超出（scrollHeight > clientHeight）就退回一个、从这里开新页；
 * 转屏 / 改窗口大小后重新分页并停在原来第一项所在的页。items 必须已经挂在 box 里；翻页条插在 anchor 后面。
 * focus：开着的第一页要包含它（新手引导要指的那张卡）。
 */
export function paginate(box: HTMLElement, items: HTMLElement[], anchor: HTMLElement, focus?: HTMLElement | null): void {
  if (items.length < 2) return;
  const bar = el('div', 'hd-pager');
  anchor.after(bar);
  const prev = button('‹ 上一页', 'hd-btn-plain hd-pg', () => go(page - 1), bar);
  const num = el('span', 'hd-pg-n hd-n', '', bar);
  const next = button('下一页 ›', 'hd-btn-plain hd-pg', () => go(page + 1), bar);
  let starts: number[] = [0];
  let page = 0;
  const show = (from: number, to: number): void => items.forEach((it, i) => (it.style.display = i >= from && i < to ? '' : 'none'));
  const overflow = (): boolean => box.scrollHeight > box.clientHeight + 1;
  const compute = (): void => {
    starts = [];
    let s = 0;
    while (s < items.length) {
      starts.push(s);
      let e = s + 1;
      show(s, e);
      // 至少放一个；再多放一个就超出时停
      while (e < items.length) {
        show(s, e + 1);
        if (overflow()) break;
        e++;
      }
      s = e;
    }
  };
  const go = (n: number): void => {
    page = Math.max(0, Math.min(starts.length - 1, n));
    const from = starts[page]!;
    show(from, starts[page + 1] ?? items.length);
    num.textContent = `${page + 1} / ${starts.length}`;
    prev.disabled = page === 0;
    next.disabled = page === starts.length - 1;
    // 只有一页：翻页条留着会白占一行，收掉
    bar.style.display = starts.length === 1 ? 'none' : '';
  };
  const fit = (keep: number): void => {
    bar.style.display = '';
    compute();
    let n = starts.length - 1;
    while (n > 0 && starts[n]! > keep) n--;
    go(n);
    // 收掉翻页条后空间变多，只有一页时不用再算
  };
  const firstOf = (): number => starts[page] ?? 0;
  fit(focus ? Math.max(0, items.indexOf(focus)) : 0);
  const onResize = (): void => {
    if (!box.isConnected) return removeEventListener('resize', onResize);
    fit(firstOf());
  };
  addEventListener('resize', onResize);
}

let root: HTMLElement | null = null;
/** 界面根节点（#ui 下的 .hd-ui）；第一次调用时注入样式 */
export function uiRoot(): HTMLElement {
  if (root) return root;
  const st = el('style');
  st.textContent = css() + skinCss() + layoutCss() + baseFeelCss() + feedbackCss(P.ink!);
  document.head.appendChild(st);
  root = el('div', 'hd-ui');
  document.getElementById('ui')!.appendChild(root);
  applySkin(root);
  mountPost();
  // 捕获阶段、最早注册：弹窗开着时 Esc 只归弹窗，场景和各页面的快捷键收不到
  addEventListener('keydown', onModalKey, true);
  return root;
}

/** 一屏界面的根：切场景时整个移除 */
export function screen(cls = ''): HTMLElement {
  const scr = el('div', `hd-screen ${cls}`, undefined, uiRoot());
  // 三个主场景（基地 / 守岛 / 登陆战）建好时盖幕布再淡掉
  if (/\bhd-(base|td|battle)\b/.test(cls)) sceneVeil(uiRoot());
  return scr;
}

// ---------------------------------------------------------------- 弹窗（所有 .hd-mask 都经过 openModal）

const modals = new ModalStack();
const entries = new WeakMap<HTMLElement, ModalEntry>();

export interface ModalOpts {
  /** 额外的类名（跟在 hd-mask 后面） */
  cls?: string;
  /** 可关：Esc 和点遮罩都关（或走 onEsc）。结算类传 false：点遮罩不理，Esc 等于点主按钮（onEsc） */
  closable: boolean;
  /** Esc（可关的还有点遮罩）做的事：可关默认直接关；结算类写"点主按钮" */
  onEsc?: () => void;
  /** 确认框这类叠在别的弹窗上，不关下面那个 */
  stack?: boolean;
  /** 挂到哪里，默认界面根节点 */
  parent?: HTMLElement;
}

/**
 * 打开一个弹窗，返回遮罩（往里放 .hd-dialog）。同一时间只开一个（stack 的确认框、成就弹窗除外，叠在别的弹窗上，最多两层）；
 * 进场淡入加弹起 0.18 秒，离场淡出 0.14 秒（mask.remove() 已改成演完再拿掉）；三种关法统一：Esc、点遮罩（可关的）、框里自己的按钮（直接 mask.remove() 即可）。
 */
export function openModal(opts: ModalOpts): HTMLElement {
  const mask = el('div', `hd-mask${opts.cls ? ` ${opts.cls}` : ''}`, undefined, opts.parent ?? uiRoot());
  mask.setAttribute('role', 'dialog');
  mask.setAttribute('aria-modal', 'true');
  const entry: ModalEntry = {
    closable: opts.closable,
    stack: opts.stack,
    esc: opts.onEsc ?? (() => mask.remove()),
    // 被新弹窗顶掉时马上拿走（不演离场，免得新旧两层叠着）
    close: () => removeNow(mask),
    // 离场中的不算开着：新弹窗能立刻打开，Esc 和点击不会落到它身上
    alive: () => mask.isConnected && !mask.classList.contains('hd-leaving'),
  };
  // 各处的 mask.remove() 都走离场动画（淡出 + 微缩，放完才真拿掉）
  mask.remove = () => dismiss(mask);
  entries.set(mask, entry);
  // 只认点在遮罩本身上（点在框里不算）
  mask.addEventListener('click', (e) => {
    if (e.target === mask) modals.maskClick(entry);
  });
  modals.open(entry);
  return mask;
}

/** 有弹窗开着吗（场景的快捷键据此让路） */
export function modalOpen(): boolean {
  return modals.isOpen;
}

function onModalKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || e.repeat) return;
  if (!modals.escape()) return;
  e.preventDefault();
  e.stopImmediatePropagation();
}

let toastEl: HTMLElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string): void {
  toastEl ??= el('div', 'hd-toast', undefined, uiRoot());
  toastEl.textContent = msg;
  toastEl.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl?.classList.remove('on'), 1800);
}

export function confirmBox(msg: string, okLabel: string, onOk: () => void, cancelLabel = '再想想', onCancel?: () => void): void {
  // Esc 和点遮罩 = 取消（安全的那个）
  const cancel = (): void => {
    mask.remove();
    onCancel?.();
  };
  const mask = openModal({ closable: true, stack: true, onEsc: cancel });
  const box = el('div', 'hd-dialog', undefined, mask);
  el('p', '', msg, box);
  const row = el('div', 'hd-row', undefined, box);
  button(cancelLabel, 'hd-btn-plain', cancel, row);
  button(okLabel, 'hd-btn-gold', () => {
    mask.remove();
    onOk();
  }, row, 'confirm');
}

/** WebGL 上下文丢了 3 秒还没恢复的提示（同一时间只有一条） */
export function glitchBanner(): () => void {
  const b = button('画面出了点问题，点这里刷新（进度都存着）', 'hd-glitch', () => location.reload(), uiRoot());
  return () => b.remove();
}

/** 新成就弹窗：一次只弹一张。拿到好几个时合成一张「新成就 ×N」的列表，不连着弹一串盖住结算 */
export function badgePopup(list: Array<{ name: string; desc: string; tier: 'bronze' | 'silver' | 'gold'; title?: string }>): void {
  const [a] = list;
  if (!a) return;
  const mask = openModal({ cls: 'hd-badgemask', closable: true, stack: true });
  const box = el('div', 'hd-dialog hd-badge', undefined, mask);
  if (list.length === 1) {
    el('small', '', '新成就！', box);
    const im = img(badgeArt(a.tier), 96);
    im.classList.add('pop');
    box.appendChild(im);
    el('h2', '', a.name, box);
    el('p', '', a.desc, box);
    if (a.title) el('p', 'hd-sub', `解锁称号「${a.title}」，点顶栏的船长钮、进成就页可以佩戴`, box);
  } else {
    el('small', '', `新成就 ×${list.length}`, box);
    const col = el('div', 'hd-badgelist', undefined, box);
    list.forEach((q, i) => {
      const row = el('div', 'hd-badgerow', undefined, col);
      const im = img(badgeArt(q.tier), 44);
      im.classList.add('pop');
      im.style.animationDelay = `${i * 70}ms`;
      row.appendChild(im);
      const tx = el('div', 'hd-badgetx', undefined, row);
      el('b', '', q.name, tx);
      el('span', '', q.title ? `${q.desc}（称号「${q.title}」）` : q.desc, tx);
    });
    // 一次拿很多个（老号补发）时按弹窗高度翻页，不出滚动条
    paginate(col, [...col.children] as HTMLElement[], col);
  }
  button('太棒了', 'hd-btn-gold', () => mask.remove(), box).style.width = '100%';
}

/** 小锁图标（未解锁的东西用） */
export function lockIcon(px = 18): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 28 28');
  s.setAttribute('width', String(px));
  s.setAttribute('height', String(px));
  s.innerHTML = '<path d="M8 13 V9 a6 6 0 0 1 12 0 v4" fill="none" stroke="#2b1a15" stroke-width="3.2"/><rect x="4" y="12" width="20" height="14" rx="3" fill="#f8c630" stroke="#2b1a15" stroke-width="2.6"/><circle cx="14" cy="19" r="2.2" fill="#2b1a15"/>';
  return s;
}

const GEAR = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M22.1,10.3 L22.1,13.7 L19.4,13.7 L18.4,16.1 L20.3,17.9 L17.9,20.3 L16.1,18.4 L13.7,19.4 L13.7,22.1 L10.3,22.1 L10.3,19.4 L7.9,18.4 L6.1,20.3 L3.7,17.9 L5.6,16.1 L4.6,13.7 L1.9,13.7 L1.9,10.3 L4.6,10.3 L5.6,7.9 L3.7,6.1 L6.1,3.7 L7.9,5.6 L10.3,4.6 L10.3,1.9 L13.7,1.9 L13.7,4.6 L16.1,5.6 L17.9,3.7 L20.3,6.1 L18.4,7.9 L19.4,10.3 Z" fill="#2b1a15"/><circle cx="12" cy="12" r="3.4" fill="#e9c98f"/></svg>';

/** 右上角唯一的设置入口（齿轮）。类名沿用 hd-mute：layout.ts 按它定位，教学遮罩也按它避让 */
export function settingsButton(): void {
  const b = button('', 'hd-mute', openSettings, uiRoot());
  b.innerHTML = GEAR;
  b.setAttribute('aria-label', '设置');
  b.title = '设置';
}

/** 设置面板：音乐、音效分开，震屏和振动，恢复默认。改了立刻生效、立刻记下，没有"保存"钮 */
export function openSettings(): void {
  const mask = openModal({ cls: 'hd-setmask', closable: true });
  const box = el('div', 'hd-dialog hd-settings', undefined, mask);
  const head = el('div', 'hd-head', undefined, box);
  el('h2', '', '设置', head);
  button('✕', 'hd-btn-plain hd-x', () => mask.remove(), head).setAttribute('aria-label', '关闭设置');
  const paints: Array<() => void> = [];
  const row = (label: string, hint: string, get: () => boolean, set: (on: boolean) => void): void => {
    const r = el('div', 'hd-setrow', undefined, box);
    const tx = el('div', 'hd-settx', undefined, r);
    el('b', '', label, tx);
    el('small', '', hint, tx);
    const sw = button('', 'hd-switch', () => {
      set(!get());
      paints.forEach((f) => f());
    }, r, null);
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-label', label);
    paints.push(() => {
      const on = get();
      sw.setAttribute('aria-checked', String(on));
      sw.classList.toggle('on', on);
      sw.textContent = on ? '开' : '关';
    });
  };
  row('音乐', '海浪、海风和海鸟', isMusicOn, setMusicOn);
  row('音效', '点按、开火、结算的声音', isSfxOn, (on) => {
    setSfxOn(on);
    if (on) sfx('tap');
  });
  row('震屏和振动', '大事件时画面抖一下、手机振一下', feelOn, (on) => {
    setFeel(on);
    if (on) vibrate('land');
  });
  const foot = el('div', 'hd-row', undefined, box);
  button('恢复默认', 'hd-btn-plain', () => {
    setMusicOn(true);
    setSfxOn(true);
    resetFeel();
    paints.forEach((f) => f());
  }, foot);
  button('完成', 'hd-btn-gold', () => mask.remove(), foot, 'confirm');
  paints.forEach((f) => f());
}

/** 常驻的"大厅"按钮（左上角，小房子 + 大厅） */
export function hallButton(onClick: () => void, parent: HTMLElement): void {
  const b = button('', 'hd-hall', onClick, parent);
  // 窄屏的登陆战只留图标（layout.ts），读屏照样读得出是哪个钮
  b.setAttribute('aria-label', '大厅');
  b.appendChild(img(iconA('home'), 22));
  el('span', '', '大厅', b);
}

function css(): string {
  const c = P as Record<string, string>;
  const ink = c.ink!, cream = c.cream!, creamD = c.creamD!, gold = c.gold!, wood = c.wood!, woodL = c.woodL!, red = c.red!;
  return `
.hd-ui { position:absolute; inset:0; pointer-events:none; font:600 14px/1.35 system-ui,"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif; color:${ink}; }
.hd-ui * { box-sizing:border-box; }
.hd-ui .hd-screen { position:absolute; inset:0; pointer-events:none; }
.hd-ui .hd-screen > * { pointer-events:auto; }
.hd-ui .hd-img { display:block; flex:none; object-fit:contain; pointer-events:none; }
.hd-ui .hd-btn { pointer-events:auto; font:inherit; font-weight:800; min-height:44px; min-width:44px; padding:0 14px; border:3px solid ${ink}; border-radius:12px; background:${cream}; color:${ink}; cursor:pointer; box-shadow:0 3px 0 ${ink}; display:inline-flex; align-items:center; justify-content:center; gap:6px; -webkit-tap-highlight-color:transparent; }
/* 数字列：等宽右对齐；带符号的增减一律正绿负红（docs/ui.md 状态色） */
.hd-ui .hd-n { font-variant-numeric:tabular-nums; text-align:right; }
.hd-ui .hd-pos { color:#23803a; font-weight:900; }
.hd-ui .hd-neg { color:#c0392b; font-weight:900; }
.hd-ui .hd-btn:active:not(:disabled) { transform:translateY(2px); box-shadow:0 1px 0 ${ink}; }
.hd-ui .hd-btn:disabled { opacity:.55; cursor:default; filter:grayscale(.5); }
.hd-ui .hd-btn-gold { background:linear-gradient(${c.goldL},${gold}); }
.hd-ui .hd-btn-wood { background:linear-gradient(${woodL},${wood}); color:#fff8e6; text-shadow:0 1px 0 ${c.woodDD}; }
.hd-ui .hd-btn-red { background:linear-gradient(${c.redL},${red}); color:#fff; }
.hd-ui .hd-btn-plain { background:${cream}; }
.hd-ui .hd-hall { position:absolute; top:6px; left:6px; z-index:30; padding:0 10px 0 6px; }
.hd-ui .hd-mute { position:absolute; top:6px; right:6px; z-index:30; padding:0; }
.hd-ui .hd-bar { position:absolute; top:6px; left:92px; right:58px; max-width:300px; display:flex; flex-wrap:wrap; gap:6px; justify-content:flex-start; pointer-events:none !important; }
.hd-ui .hd-bar2 { position:absolute; top:58px; left:6px; right:6px; display:flex; gap:6px; pointer-events:none !important; align-items:center; }
.hd-ui .hd-pill { display:inline-flex; align-items:center; gap:6px; min-height:40px; padding:0 10px 0 6px; border:3px solid ${ink}; border-radius:20px; background:${cream}; box-shadow:0 2px 0 ${ink}; white-space:nowrap; }
.hd-ui .hd-pill b { font-size:14px; font-weight:900; }
.hd-ui .hd-col { display:flex; flex-direction:column; line-height:1.1; }
.hd-ui .hd-unlock { background:#fff8e6; border:2px solid ${ink}; border-radius:12px; padding:8px 10px; margin-bottom:10px; }
.hd-ui .hd-items { display:flex; flex-wrap:wrap; gap:8px; margin:6px 0; }
.hd-ui .hd-item { display:inline-flex; align-items:center; gap:4px; background:${creamD}; border-radius:12px; padding:2px 10px 2px 6px; }
.hd-ui .hd-need { margin:0; color:${red}; font-weight:800; }
.hd-ui .hd-lockrow { display:inline-flex; align-items:center; gap:4px; }
.hd-ui .hd-celebrate h2 { text-align:center; margin:0 0 6px; font-size:20px; }
.hd-ui .hd-newlist { display:flex; flex-direction:column; gap:8px; margin:8px 0 14px; max-height:46vh; overflow:hidden; }
.hd-ui .hd-newitem { display:flex; gap:10px; align-items:center; background:#fff8e6; border:2px solid ${ink}; border-radius:12px; padding:6px 10px; transition:opacity .25s; }
.hd-ui .hd-newitem.pop { animation:hd-pop .45s cubic-bezier(.2,1.6,.4,1); }
.hd-ui .hd-advice { text-align:left; background:#fff8e6; border:2px solid ${red}; border-radius:12px; padding:8px 10px; margin:0 0 12px; font-size:14px; }
.hd-ui .hd-advice p { margin:4px 0 0; text-align:left; font-size:14px; }
.hd-ui .hd-bossintro { position:absolute; left:8px; right:8px; top:38%; z-index:45; pointer-events:none; text-align:center; background:linear-gradient(rgba(60,10,10,.92),rgba(110,20,20,.92)); border:3px solid ${ink}; border-radius:16px; padding:10px 14px; color:#fff3d6; animation:hd-pop .5s cubic-bezier(.2,1.5,.4,1); }
.hd-ui .hd-bossintro small { display:inline-block; background:${red}; border:2px solid ${ink}; border-radius:10px; padding:0 10px; font-size:14px; }
.hd-ui .hd-bossintro h2 { margin:4px 0; font-size:24px; }
.hd-ui .hd-bossintro p { margin:0; font-size:14px; }
.hd-ui .hd-node.boss .hd-isle { width:132px; height:106px; }
.hd-ui .hd-node.boss { width:150px; }
.hd-ui .hd-bosslabel { position:absolute; right:-2px; top:-4px; background:${red}; color:#fff; border:3px solid ${ink}; border-radius:10px; padding:0 8px; font-size:14px; font-weight:900; box-shadow:0 2px 0 ${ink}; }
.hd-ui .hd-node.boss span.hd-lb { background:#ffe3d6; border-color:${c.redD}; }
.hd-ui .hd-bosstag { background:${red}; color:#fff; border:2px solid ${ink}; border-radius:10px; padding:0 8px; font-size:14px; }
.hd-ui .hd-mech { margin:0 0 8px; padding:6px 10px; background:#ffe3d6; border:2px solid ${c.redD}; border-radius:10px; font-size:14px; }
.hd-ui .hd-bountyline { margin:0 0 8px; color:${c.redD}; font-weight:800; }
.hd-ui .hd-bounty { position:absolute; left:8px; top:58px; z-index:32; width:calc(100% - 100px); max-width:360px; min-height:48px; display:flex; align-items:center; gap:8px; padding:4px 10px; border:3px solid ${ink}; border-radius:12px; background:linear-gradient(#fff3d6,#f6d98a); box-shadow:0 3px 0 ${ink}; font:inherit; color:${ink}; cursor:pointer; text-align:left; pointer-events:auto; }
.hd-ui .hd-bounty.done { filter:grayscale(.6); opacity:.8; }
.hd-ui .hd-bounty .hd-bt { display:flex; flex-direction:column; line-height:1.2; }
.hd-ui .hd-bounty small { font-size:12px; }
.hd-ui .hd-badgemask { z-index:70; }
.hd-ui .hd-badge { text-align:center; display:flex; flex-direction:column; align-items:center; gap:4px; }
.hd-ui .hd-badge small { font-size:14px; font-weight:900; color:${c.redD}; }
.hd-ui .hd-badge h2 { margin:0; font-size:20px; }
.hd-ui .hd-badge p { margin:0 0 6px; }
.hd-ui .hd-badgelist { display:flex; flex-direction:column; gap:6px; width:100%; max-height:46vh; overflow:hidden; text-align:left; }
.hd-ui .hd-badgerow { display:flex; gap:10px; align-items:center; background:#fff8e6; border:2px solid ${ink}; border-radius:12px; padding:4px 6px; }
.hd-ui .hd-badgetx { display:flex; flex-direction:column; min-width:0; line-height:1.25; font-size:14px; }
/* 弹窗里列表翻页条和下面的主按钮隔开，别挤成一对相邻的点按目标 */
.hd-ui .hd-badge .hd-pager, .hd-ui .hd-celebrate .hd-pager { margin-bottom:10px; }
.hd-ui .hd-badgetx b { font-size:14px; }
.hd-ui .hd-badge .pop { animation:hd-pop .6s cubic-bezier(.2,1.8,.4,1); }
.hd-ui .hd-ach { display:flex; align-items:center; gap:10px; padding:6px 8px; border:2px solid ${ink}; border-radius:12px; background:#fff8e6; margin-bottom:6px; }
.hd-ui .hd-ach.off { opacity:.55; filter:grayscale(.7); }
.hd-ui .hd-ach .hd-at { flex:1; min-width:0; }
.hd-ui .hd-ach b { display:block; }
.hd-ui .hd-ach small { font-size:12px; opacity:.85; }
.hd-ui .hd-ach .hd-btn { min-height:44px; padding:0 10px; font-size:14px; }
.hd-ui .hd-stars .hd-img.drop { animation:hd-dropin .55s cubic-bezier(.3,1.5,.5,1); }
@keyframes hd-dropin { 0% { transform:translateY(-140px) scale(2.4); opacity:0; } 60% { transform:translateY(6px) scale(.9); opacity:1; } 100% { transform:none; } }
.hd-ui .hd-chestbox { text-align:center; display:flex; flex-direction:column; align-items:center; gap:6px; }
.hd-ui .hd-chestbox small { font-size:14px; font-weight:900; color:${c.redD}; }
.hd-ui .hd-chest { position:relative; width:120px; height:100px; margin:8px 0; }
.hd-ui .hd-chest-body { position:absolute; left:10px; right:10px; bottom:0; height:52px; background:linear-gradient(${woodL},${wood}); border:3px solid ${ink}; border-radius:6px 6px 10px 10px; }
.hd-ui .hd-chest-lid { position:absolute; left:6px; right:6px; bottom:48px; height:34px; background:linear-gradient(${woodL},${wood}); border:3px solid ${ink}; border-radius:30px 30px 4px 4px; transform-origin:left bottom; transition:transform .45s cubic-bezier(.3,1.6,.5,1); z-index:2; }
.hd-ui .hd-chest-lid.open { transform:rotate(-70deg) translateY(-6px); }
.hd-ui .hd-chest-glow { position:absolute; left:50%; bottom:40px; width:20px; height:20px; margin-left:-10px; border-radius:50%; background:radial-gradient(#fff6b0,rgba(255,220,80,0)); opacity:0; }
.hd-ui .hd-chest-lid.open ~ .hd-chest-glow { animation:hd-glow 1.2s ease-out forwards; }
@keyframes hd-glow { 0% { opacity:.9; transform:scale(1); } 100% { opacity:.4; transform:scale(9); } }
.hd-ui .hd-chest-item { position:absolute; left:50%; bottom:30px; transform:translate(-50%,0) scale(.2); opacity:0; z-index:1; }
.hd-ui .hd-chest-item.out { transition:all .6s cubic-bezier(.2,1.6,.4,1); transform:translate(-50%,-70px) scale(1.2); opacity:1; z-index:3; }
.hd-ui .hd-scout { position:absolute; inset:0; z-index:38; background:linear-gradient(#7fe6dc,#2fb8c8); display:flex; flex-direction:column; pointer-events:auto; padding:8px; gap:6px; }
.hd-ui .hd-scout-head { display:flex; align-items:center; gap:8px; padding-left:84px; }
.hd-ui .hd-scout-head h2 { margin:0; flex:1; font-size:20px; }
.hd-ui .hd-counter { margin:0; background:#fff8e6; border:2px solid ${c.redD}; border-radius:10px; padding:6px 10px; font-weight:800; }
.hd-ui .hd-scout-tip { margin:0; text-align:center; }
.hd-ui .hd-scout-map { flex:1; min-height:0; border:3px solid ${ink}; border-radius:14px; background:#2fb8c8; }
.hd-ui .hd-scout-ov { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.hd-ui .hd-scout-chips { display:flex; gap:8px; flex-wrap:wrap; }
.hd-ui .hd-scout-chip { display:inline-flex; align-items:center; gap:2px; background:rgba(0,0,0,.06); border-radius:10px; padding:0 6px; min-height:34px; }
@media (pointer:coarse), (max-width:959px) { .hd-ui .hd-scout-chip { min-height:44px; min-width:44px; } .hd-ui .hd-num { min-width:44px; height:44px; border-radius:22px; } }
.hd-ui .hd-scout-chip i { font-style:normal; font-weight:700; font-size:14px; }
.hd-ui .hd-scout-loot { display:flex; align-items:center; gap:6px; margin-top:2px; }
.hd-ui .hd-scout-tip2 { display:flex; align-items:center; gap:6px; margin-top:2px; font-size:14px; }
.hd-ui .hd-scout-info { min-height:64px; background:${cream}; border:3px solid ${ink}; border-radius:12px; padding:6px 10px; display:flex; flex-direction:column; }
.hd-ui .hd-preset { display:flex; flex-direction:column; gap:4px; border:3px solid ${ink}; border-radius:12px; background:#fff8e6; padding:6px; margin-bottom:8px; }
.hd-ui .hd-preset-map { height:200px; border-radius:8px; background:#2fb8c8; }
.hd-ui .hd-tabs { display:flex; gap:8px; margin-bottom:8px; }
.hd-ui .hd-tabs .hd-btn { flex:1; }
.hd-ui .hd-pill small { font-size:12px; opacity:.7; font-weight:700; }
.hd-ui .hd-pill.hd-flex { flex:1 1 96px; min-width:0; }
.hd-ui .hd-pill.full b { color:${red}; }
.hd-ui .hd-bottom { position:absolute; left:0; right:0; bottom:0; display:flex; justify-content:center; gap:10px; padding:8px 10px 8px; pointer-events:none !important; }
.hd-ui .hd-bar .hd-pill, .hd-ui .hd-bar2 > * { pointer-events:auto; }
.hd-ui .hd-bottom .hd-btn { pointer-events:auto; flex:1 1 0; max-width:150px; min-height:58px; flex-direction:column; gap:2px; font-size:14px; }
.hd-ui .hd-sheet { position:absolute; left:0; right:0; margin:0 auto; bottom:0; width:min(100%,560px); max-height:60%; overflow:auto; background:${cream}; border:3px solid ${ink}; border-bottom:0; border-radius:18px 18px 0 0; padding:12px 12px 14px; box-shadow:0 -4px 14px rgba(0,0,0,.25); touch-action:pan-y; pointer-events:auto; }
.hd-ui .hd-sheet h2 { margin:0; font-size:20px; font-weight:900; flex:1; }
.hd-ui .hd-head { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
.hd-ui .hd-x { min-width:44px; padding:0; font-size:20px; }
.hd-ui .hd-desc { margin:0 0 8px; font-weight:600; opacity:.85; }
.hd-ui .hd-chips { align-items:center; display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px; }
.hd-ui .hd-chip { display:inline-flex; align-items:center; gap:6px; padding:3px 10px; border-radius:12px; background:${creamD}; font-size:14px; }
.hd-ui .hd-row { display:flex; gap:8px; align-items:center; justify-content:center; flex-wrap:wrap; }
.hd-ui .hd-row .hd-btn { flex:1 1 90px; }
.hd-ui .hd-cost { display:inline-flex; gap:8px; align-items:center; }
.hd-ui .hd-cost-i { display:inline-flex; gap:3px; align-items:center; }
.hd-ui .hd-short { color:${red}; }
.hd-ui .hd-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:8px; }
.hd-ui .hd-card { position:relative; display:flex; flex-direction:column; align-items:center; gap:4px; padding:8px 6px; min-height:120px; border:3px solid ${ink}; border-radius:12px; background:#fff8e6; font:inherit; color:inherit; cursor:pointer; }
.hd-ui .hd-card.off { opacity:.55; filter:grayscale(.6); }
.hd-ui .hd-card .hd-nm { font-weight:900; font-size:14px; }
.hd-ui .hd-card .hd-sub { font-size:12px; opacity:.8; }
.hd-ui .hd-toast { position:absolute; left:50%; top:110px; transform:translate(-50%,-10px); opacity:0; transition:.2s; background:rgba(43,26,21,.92); color:#fff8e6; padding:8px 16px; border-radius:20px; pointer-events:none; z-index:60; max-width:90%; text-align:center; }
.hd-ui .hd-toast.on { opacity:1; transform:translate(-50%,0); }
.hd-ui .hd-mask { position:absolute; inset:0; background:rgba(20,35,58,.55); display:flex; align-items:center; justify-content:center; pointer-events:auto; z-index:50; padding:16px; }
.hd-ui .hd-mask { animation:hd-mask-in .18s ease-out; }
.hd-ui .hd-mask > .hd-dialog { animation:hd-dialog-in .18s ease-out; }
@keyframes hd-mask-in { from { opacity:0; } }
@keyframes hd-dialog-in { from { opacity:0; transform:scale(.94); } }
@media (prefers-reduced-motion: reduce) { .hd-ui .hd-mask, .hd-ui .hd-mask > .hd-dialog { animation:none; } }
.hd-ui .hd-settings { display:flex; flex-direction:column; gap:10px; }
.hd-ui .hd-settings .hd-head { margin:0; }
.hd-ui .hd-settings .hd-head h2 { flex:1; margin:0; }
.hd-ui .hd-setrow { display:flex; align-items:center; gap:10px; }
.hd-ui .hd-settx { flex:1; display:flex; flex-direction:column; gap:2px; }
.hd-ui .hd-settx b { font-size:16px; }
.hd-ui .hd-settx small { font-size:12px; opacity:.75; }
.hd-ui .hd-switch { min-width:64px; min-height:44px; font-size:16px; }
.hd-ui .hd-switch.on { background:#6dbb5a; }
.hd-ui .hd-dialog { background:${cream}; border:3px solid ${ink}; border-radius:16px; padding:16px; width:min(100%,360px); box-shadow:0 6px 0 ${ink}; }
.hd-ui .hd-dialog p { margin:0 0 14px; font-size:16px; text-align:center; }
.hd-ui .hd-dialog .hd-sub { font-size:14px; margin:0; text-align:left; opacity:.8; }
.hd-ui .hd-glitch { position:absolute; left:50%; bottom:80px; transform:translateX(-50%); z-index:70; pointer-events:auto; }
.hd-ui .hd-place { position:absolute; left:0; right:0; bottom:0; display:flex; flex-direction:column; align-items:center; gap:8px; padding:8px 10px; pointer-events:none !important; }
.hd-ui .hd-place > * { pointer-events:auto; }
.hd-ui .hd-place .hd-row { width:min(100%,420px); }
.hd-ui .hd-place .hd-tag { background:${cream}; border:3px solid ${ink}; border-radius:14px; padding:4px 12px; display:flex; gap:10px; align-items:center; }
.hd-ui .hd-cards { position:absolute; left:0; right:0; bottom:0; padding:6px 8px 8px; display:flex; flex-direction:column; gap:8px; pointer-events:none !important; }
.hd-ui .hd-cards > * { pointer-events:auto; }
.hd-ui .hd-hint { align-self:center; background:rgba(43,26,21,.85); color:#fff8e6; border-radius:14px; padding:4px 12px; font-size:14px; }
.hd-ui .hd-boats, .hd-ui .hd-skills { padding-top:8px; display:flex; gap:8px; justify-content:center; overflow-x:auto; touch-action:pan-x; }
.hd-ui .hd-boat { position:relative; flex:1 1 84px; max-width:130px; min-width:72px; min-height:96px; padding:4px 4px 4px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:0; border:3px solid ${ink}; border-radius:12px; background:${cream}; font:inherit; font-size:12px; color:${ink}; cursor:pointer; box-shadow:0 3px 0 ${ink}; }
.hd-ui .hd-boat .hd-nm { font-size:14px; font-weight:900; }
.hd-ui .hd-boat.sel { background:linear-gradient(${c.goldL},${gold}); transform:translateY(-4px); }
.hd-ui .hd-boat.done { filter:grayscale(1); opacity:.5; }
.hd-ui .hd-boat b { position:absolute; right:3px; top:3px; background:${ink}; color:#fff8e6; border-radius:10px; padding:0 6px; font-size:12px; }
.hd-ui .hd-skill { min-width:64px; min-height:48px; flex:0 1 auto; flex-direction:row; align-items:center; justify-content:center; gap:4px; padding:0 8px; white-space:nowrap; }
.hd-ui .hd-skill .hd-sk-t { display:flex; flex-direction:column; align-items:flex-start; line-height:1.15; white-space:nowrap; }
.hd-ui .hd-skill .hd-sk-n { font-size:14px; font-weight:900; }
.hd-ui .hd-skills { flex-wrap:nowrap; }
.hd-ui .hd-en { flex:0 0 auto; }
.hd-ui .hd-boat .hd-nm, .hd-ui .hd-boat small { white-space:nowrap; }
.hd-ui .hd-boats.hd-tight { gap:4px; }
.hd-ui .hd-boats.hd-tight .hd-boat { flex:1 1 56px; min-width:56px; min-height:84px; padding:3px 2px; }
.hd-ui .hd-boats.hd-tight .hd-boat .hd-nm { font-size:12px; }
.hd-ui .hd-boats.hd-tight .hd-boat small { font-size:12px; }
.hd-ui .hd-skill.sel { background:linear-gradient(${c.goldL},${gold}); }
.hd-ui .hd-skill small { font-size:12px; }
.hd-ui .hd-en { align-self:center; display:inline-flex; gap:4px; align-items:center; background:${cream}; border:3px solid ${ink}; border-radius:16px; padding:2px 10px; min-height:34px; }
.hd-ui .hd-stars { display:inline-flex; gap:2px; }
.hd-ui .hd-stars .hd-img.pop { animation:hd-pop .6s cubic-bezier(.2,1.8,.4,1); }
.hd-ui .hd-result { max-width:360px; text-align:center; }
.hd-ui .hd-result h2 { font-size:24px; margin:0 0 6px; }
.hd-ui .hd-big { font-size:34px; font-weight:900; }
.hd-ui .hd-loot { display:flex; justify-content:center; gap:16px; margin:10px 0 14px; font-size:20px; }
.hd-ui .hd-map { position:absolute; inset:0; pointer-events:auto; background:linear-gradient(${c.seaLight},${c.sea} 40%,${c.seaDeep}); overflow-y:auto; touch-action:pan-y; z-index:20; }
.hd-ui .hd-map-in { position:relative; width:min(100%,520px); margin:0 auto; }
.hd-ui .hd-map-deco { position:absolute; inset:0; pointer-events:none; overflow:hidden; }
.hd-ui .hd-deco { position:absolute; transform:translate(-50%,-50%); }
.hd-ui .hd-gull { animation:hd-drift 7s ease-in-out infinite alternate; }
.hd-ui .hd-node { position:absolute; transform:translate(-50%,-50%); width:130px; display:flex; flex-direction:column; align-items:center; gap:2px; background:none; border:0; font:inherit; color:${ink}; padding:0; cursor:pointer; -webkit-tap-highlight-color:transparent; }
.hd-ui .hd-isle { position:relative; width:112px; height:84px; display:flex; align-items:center; justify-content:center; }
.hd-ui .hd-isle-img { filter:drop-shadow(0 3px 0 rgba(20,35,58,.35)); }
.hd-ui .hd-ring { position:absolute; inset:-6px 0; border-radius:50%; border:4px solid ${c.goldL}; box-shadow:0 0 14px 4px rgba(255,232,133,.9); animation:hd-breathe 1.6s ease-in-out infinite; }
.hd-ui .hd-num { position:absolute; left:2px; top:-2px; min-width:26px; height:26px; padding:0 4px; border-radius:13px; background:${gold}; border:3px solid ${ink}; font-weight:900; font-size:14px; display:flex; align-items:center; justify-content:center; }
.hd-ui .hd-node.lock .hd-isle-img { filter:brightness(.42) saturate(.35); }
.hd-ui .hd-node.lock .hd-num { background:#aab1b8; }
.hd-ui .hd-lockic { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); }
.hd-ui .hd-node span.hd-lb { font-size:14px; background:${cream}; border:3px solid ${ink}; border-radius:12px; padding:0 8px; white-space:nowrap; display:flex; flex-direction:column; align-items:center; line-height:1.25; box-shadow:0 2px 0 ${ink}; }
.hd-ui .hd-node.lock span.hd-lb { background:#cfd3d8; }
.hd-ui .hd-lb small { font-size:12px; opacity:.8; }
.hd-ui .hd-map-top { position:sticky; top:0; z-index:5; height:56px; pointer-events:none; }
.hd-ui button.hd-pvp-mapbtn, .hd-ui button.hd-live-mapbtn { top:auto; bottom:calc(14px + env(safe-area-inset-bottom, 0px)); z-index:31; }
.hd-ui .hd-map:has(.hd-sheet) ~ button.hd-pvp-mapbtn, .hd-ui .hd-map:has(.hd-sheet) ~ button.hd-live-mapbtn { display:none; }
.hd-ui button.hd-pvp-mapbtn { left:8px; right:auto; }
.hd-ui button.hd-live-mapbtn { right:8px; left:auto; }
.hd-ui .hd-map-close { position:absolute; top:60px; right:6px; z-index:31; }
.hd-ui .hd-tut-ring { position:absolute; border:4px solid ${gold}; border-radius:14px; box-shadow:0 0 0 3px ${ink}, 0 0 16px 4px rgba(248,198,48,.8); pointer-events:none; animation:hd-pulse 1s infinite; z-index:40; }
.hd-ui .hd-tut-tip { position:absolute; z-index:41; box-sizing:border-box; width:max-content; display:flex; align-items:center; gap:10px; background:#fff8e6; border:3px solid ${ink}; border-radius:14px; padding:6px 6px 6px 12px; box-shadow:0 4px 0 ${ink}; pointer-events:auto; }
.hd-ui .hd-tut-tip p { flex:1 1 auto; min-width:0; margin:0; font-size:14px; }
.hd-ui .hd-tut-tip .hd-btn { flex:none; min-height:44px; font-size:14px; padding:0 10px; }
.hd-ui .hd-tut-tip.hd-tut-new { animation:hd-tut-in .25s ease-out; }
@keyframes hd-tut-in { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:none; } }
@media (prefers-reduced-motion: reduce) { .hd-ui .hd-tut-tip.hd-tut-new { animation:none; } }
.hd-ui .hd-tut-arrow { position:absolute; z-index:42; width:0; height:0; border:12px solid transparent; pointer-events:none; }
@keyframes hd-pop { 0% { transform:scale(.2) rotate(-40deg); } 100% { transform:scale(1); } }
@keyframes hd-breathe { 50% { transform:scale(1.1); opacity:.6; } }
@keyframes hd-drift { from { transform:translate(-50%,-50%) translateX(-18px); } to { transform:translate(-50%,-50%) translateX(26px) translateY(-8px); } }
@keyframes hd-pulse { 50% { transform:scale(1.12); } }
`;
}
