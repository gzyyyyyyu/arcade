/**
 * 介绍卡片的画法和打开方式（数据在 intel.ts）：
 * - openIntel：弹窗（叠在面板上，Esc / 点遮罩关）；
 * - attachIntel：给出兵栏、建造卡、研究卡这类 DOM 元素挂上「手机长按 / 电脑悬停 / 右键」打开；
 * - pinIntel：战斗里选中一个兵或塔时贴在屏边的小卡（不挡战斗、不暂停），跟着选中的换内容。
 * 样式限定在 .hd-ui .hd-intel 下；图标是自己画的小 SVG。
 */
import { BUILDINGS, TROOPS } from '../content/index.ts';
import type { BuildingKind, TroopKind } from '../core/types.ts';
import { bArt, troopF } from './art.ts';
import type { AimIcon, IntelCard } from './intel.ts';
import { towerIcon } from './td-ui.ts';
import { button, el, img, openModal, uiRoot } from './ui.ts';

const INK = '#2b1a15';
/** 寻敌图标：24×24 的小线稿 */
const ICON: Record<AimIcon, string> = {
  near: `<circle cx="12" cy="12" r="7" fill="none" stroke="${INK}" stroke-width="2"/><circle cx="12" cy="12" r="2.5" fill="#d9472b"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="${INK}" stroke-width="2"/>`,
  defense: `<path d="M6 21V9l2-2V4h2v2h4V4h2v3l2 2v12z" fill="#9aa4ad" stroke="${INK}" stroke-width="1.6"/><circle cx="12" cy="13" r="2.4" fill="${INK}"/>`,
  wall: `<path d="M3 8h18v12H3z" fill="#c8a675" stroke="${INK}" stroke-width="1.6"/><path d="M3 14h18M9 8v6M15 14v6" stroke="${INK}" stroke-width="1.4"/>`,
  cluster: `<circle cx="12" cy="12" r="8" fill="#ffd36b" stroke="${INK}" stroke-width="1.6"/><path d="M12 6l1.6 4.2L18 12l-4.4 1.8L12 18l-1.6-4.2L6 12l4.4-1.8z" fill="#e2582c"/>`,
  heal: `<rect x="4" y="4" width="16" height="16" rx="4" fill="#fff" stroke="${INK}" stroke-width="1.6"/><path d="M12 7v10M7 12h10" stroke="#2fa35a" stroke-width="3.4"/>`,
  lock: `<circle cx="12" cy="12" r="8" fill="none" stroke="${INK}" stroke-width="2"/><path d="M12 4v5M12 15v5M4 12h5M15 12h5" stroke="#d9472b" stroke-width="2"/>`,
  splash: `<circle cx="12" cy="12" r="9" fill="#ffb24a" fill-opacity=".35" stroke="#e2582c" stroke-width="1.6" stroke-dasharray="3 2"/><circle cx="12" cy="12" r="3.4" fill="#e2582c"/>`,
  dead: `<circle cx="12" cy="12" r="9" fill="none" stroke="${INK}" stroke-width="1.6"/><circle cx="12" cy="12" r="4" fill="#9aa4ad"/><path d="M5 5l14 14" stroke="#d9472b" stroke-width="2.2"/>`,
  multi: `<path d="M4 18l6-12M10 19l5-13M16 19l4-12" stroke="#e2582c" stroke-width="2.6" stroke-linecap="round"/>`,
  stun: `<path d="M12 3a9 9 0 1 0 9 9" fill="none" stroke="${INK}" stroke-width="1.8"/><path d="M14 4l-5 8h4l-3 8 7-10h-4l3-6z" fill="#ffd34a" stroke="${INK}" stroke-width="1.2"/>`,
  slow: `<path d="M3 17c3-6 6-6 9 0s6 6 9 0" fill="none" stroke="#5b3a1f" stroke-width="3"/><circle cx="8" cy="9" r="2" fill="#5b3a1f"/><circle cx="16" cy="8" r="1.6" fill="#5b3a1f"/>`,
  shield: `<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" fill="#7fa7c9" stroke="${INK}" stroke-width="1.6"/>`,
  hide: `<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z" fill="none" stroke="${INK}" stroke-width="1.6"/><path d="M4 20L20 4" stroke="#d9472b" stroke-width="2.2"/>`,
  priority: `<path d="M12 3l2.6 5.6 6.1.6-4.6 4 1.4 6-5.5-3.2L6.5 19l1.4-6-4.6-4 6.1-.6z" fill="#ffd34a" stroke="${INK}" stroke-width="1.4"/>`,
  air: `<path d="M3 13c4-1 6-5 9-5s5 4 9 5c-4 0-6 2-9 2s-5-2-9-2z" fill="#9fd0f0" stroke="${INK}" stroke-width="1.4"/>`,
  front: `<path d="M4 12h12M12 6l6 6-6 6" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`,
};

function icon(k: AimIcon, px = 24): HTMLElement {
  const s = el('span', 'hd-intel-ic');
  s.innerHTML = `<svg viewBox="0 0 24 24" width="${px}" height="${px}" aria-hidden="true">${ICON[k]}</svg>`;
  return s;
}

/** 卡片左上的大图 */
function artOf(c: IntelCard, px: number): HTMLElement {
  if (c.family === 'troop') return img(troopF(c.kind as TroopKind, 'idle')[0]!, px);
  if (c.family === 'td') return towerIcon(c.kind as BuildingKind, c.level, px);
  return img(bArt(c.kind as BuildingKind, c.level), px);
}

/** 相克那一排的小头像：登陆战是兵 / 防御的图，守岛是护甲名的小条 */
function chip(c: IntelCard, k: string, parent: HTMLElement, cls: string): void {
  const it = el('span', `hd-intel-mu ${cls}`, undefined, parent);
  if (c.family === 'td') {
    el('b', '', k, it);
    return;
  }
  if (c.family === 'troop') {
    it.appendChild(img(bArt(k as BuildingKind, 1), 28));
    el('small', '', BUILDINGS[k as BuildingKind].name, it);
  } else {
    it.appendChild(img(troopF(k as TroopKind, 'idle')[0]!, 28));
    el('small', '', TROOPS[k as TroopKind].name, it);
  }
}

/** 整张卡（compact = 战斗里贴边的小卡：只留数值和寻敌，不放相克和大图） */
function intelEl(c: IntelCard, compact = false): HTMLElement {
  injectCss();
  const box = el('div', `hd-intel${compact ? ' compact' : ''} f-${c.family}`);
  const head = el('div', 'hd-intel-head', undefined, box);
  head.appendChild(artOf(c, compact ? 44 : 72));
  const ht = el('div', 'hd-intel-ht', undefined, head);
  const nm = el('div', 'hd-intel-nm', undefined, ht);
  el('b', '', c.name, nm);
  el('span', 'hd-intel-lv', c.level >= c.maxLevel ? `${c.level} ${c.levelWord}（满）` : `${c.level} ${c.levelWord} ➜ ${c.level + 1} ${c.levelWord}`, nm);
  el('p', 'hd-intel-role', c.role, ht);
  const body = el('div', 'hd-intel-body', undefined, box);
  const st = el('div', 'hd-intel-stats', undefined, body);
  for (const s of c.stats) {
    const row = el('div', 'hd-intel-st', undefined, st);
    el('span', 'hd-intel-k', s.label, row);
    const bar = el('span', 'hd-intel-bar', undefined, row);
    el('i', '', undefined, bar).style.width = `${Math.round(s.bar * 100)}%`;
    el('b', 'hd-intel-v hd-n', s.cur, row);
    // 下一级对照：「➜ 125（+15）」，没涨的不写
    el('span', 'hd-intel-up hd-n', s.next !== null && s.up ? `➜ ${s.next.replace(/ .*$/, '')}（${s.up}）` : '', row);
  }
  const aim = el('div', 'hd-intel-aims', undefined, body);
  el('h4', '', '怎么找目标', aim);
  for (const a of c.aims) {
    const row = el('div', 'hd-intel-aim', undefined, aim);
    row.appendChild(icon(a.icon));
    el('span', '', a.text, row);
  }
  if (!compact && (c.beats.length || c.fears.length || c.none.length)) {
    const mu = el('div', 'hd-intel-mus', undefined, box);
    const line = (label: string, list: string[], cls: string): void => {
      if (!list.length) return;
      const r = el('div', `hd-intel-mur ${cls}`, undefined, mu);
      el('span', 'hd-intel-mk', label, r);
      for (const k of list) chip(c, k, r, cls);
    };
    const tr = c.family === 'troop';
    line(tr ? '好打' : c.family === 'td' ? '克' : '克', c.beats, 'good');
    line(tr ? '怕' : c.family === 'td' ? '打一半' : '被克', c.fears, 'bad');
    line('打不到', c.none, 'none');
  }
  return box;
}

/** 面板上「i 介绍」这类按钮：点了弹卡片 */
export function intelButton(label: string, make: () => IntelCard, parent: HTMLElement): HTMLButtonElement {
  injectCss();
  const b = button(label, 'hd-btn-plain hd-intel-open', () => openIntel(make()), parent);
  b.title = '数值对照、怎么找目标、克谁怕谁';
  return b;
}

/** 弹窗打开一张卡（叠在面板上，Esc / 点遮罩 / × 关） */
function openIntel(c: IntelCard): void {
  const mask = openModal({ cls: 'hd-intel-mask', closable: true, stack: true });
  const dlg = el('div', 'hd-dialog hd-intel-dlg', undefined, mask);
  dlg.appendChild(intelEl(c));
  button('×', 'hd-x hd-intel-x', () => mask.remove(), dlg).title = '关掉（Esc）';
}

let floatEl: HTMLElement | null = null;
/** 电脑悬停：卡片浮在元素旁边（不抢焦点、不挡点击），移开就收 */
function showFloat(c: IntelCard, anchor: HTMLElement): void {
  hideFloat();
  const f = el('div', 'hd-intel-float', undefined, uiRoot());
  f.appendChild(intelEl(c));
  const r = anchor.getBoundingClientRect();
  const W = f.offsetWidth;
  const H = f.offsetHeight;
  const x = Math.max(8, Math.min(innerWidth - W - 8, r.left + r.width / 2 - W / 2));
  const above = r.top - H - 8;
  const y = above >= 8 ? above : Math.min(innerHeight - H - 8, r.bottom + 8);
  f.style.transform = `translate(${Math.round(x)}px,${Math.round(Math.max(8, y))}px)`;
  floatEl = f;
}
function hideFloat(): void {
  floatEl?.remove();
  floatEl = null;
}

/**
 * 长按弹了卡：吃掉松手时浏览器补发的那一下点击。它落在松手处，这时那里已经是卡片的遮罩（点遮罩 = 关卡片），
 * 不吃掉的话卡片一弹出来就被关掉；落在原来的卡上也不该算选中、摆放。只吃一次：手指抬起后 0.4 秒内没来就不管了
 */
function swallowClick(): void {
  let t: ReturnType<typeof setTimeout> | undefined;
  const eat = (e: Event): void => {
    e.stopImmediatePropagation();
    e.preventDefault();
    done();
  };
  const lift = (): void => {
    clearTimeout(t);
    t = setTimeout(done, 400);
  };
  const done = (): void => {
    clearTimeout(t);
    document.removeEventListener('click', eat, true);
    document.removeEventListener('pointerup', lift, true);
    document.removeEventListener('pointercancel', lift, true);
  };
  document.addEventListener('click', eat, true);
  document.addEventListener('pointerup', lift, true);
  document.addEventListener('pointercancel', lift, true);
}

/** 长按多久算长按、悬停多久弹卡（毫秒） */
const HOLD_MS = 450;
const HOVER_MS = 500;

/**
 * 给一个元素挂上介绍卡片：手机长按（松手后这次点击不算）、电脑悬停一会儿浮出、右键弹出。
 * make 每次现算（等级会变）；返回 null 就不弹。
 */
export function attachIntel(target: HTMLElement, make: () => IntelCard | null): void {
  injectCss();
  // 角上一个小「i」：告诉玩家这张卡能看介绍（长按、悬停、右键都是藏着的手势）
  target.classList.add('hd-intel-host');
  el('span', 'hd-intel-i', 'i', target).setAttribute('aria-hidden', 'true');
  if (!target.title) target.title = '长按或右键看介绍';
  let hold: ReturnType<typeof setTimeout> | undefined;
  let hover: ReturnType<typeof setTimeout> | undefined;
  let sx = 0;
  let sy = 0;
  target.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    sx = e.clientX;
    sy = e.clientY;
    clearTimeout(hold);
    hold = setTimeout(() => {
      const c = make();
      if (!c) return;
      openIntel(c);
      swallowClick();
    }, HOLD_MS);
  });
  target.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) clearTimeout(hold);
  });
  for (const ev of ['pointerup', 'pointercancel'] as const) target.addEventListener(ev, () => clearTimeout(hold));
  target.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(hover);
    hover = setTimeout(() => {
      const c = make();
      if (c && target.isConnected && target.matches(':hover')) showFloat(c, target);
    }, HOVER_MS);
  });
  target.addEventListener('pointerleave', () => {
    clearTimeout(hover);
    hideFloat();
  });
  target.addEventListener('contextmenu', (e) => {
    const c = make();
    if (!c) return;
    e.preventDefault();
    clearTimeout(hover);
    hideFloat();
    openIntel(c);
  });
}

/** 战斗里选中时贴边的小卡：update 换内容，close 收起 */
export function pinIntel(onClose: () => void): { update(c: IntelCard): void; close(): void } {
  injectCss();
  const box = el('div', 'hd-intel-pin', undefined, uiRoot());
  let sig = '';
  const close = (): void => {
    box.remove();
  };
  return {
    update(c: IntelCard): void {
      const s = `${c.family}:${c.kind}:${c.level}`;
      if (s === sig) return;
      sig = s;
      box.replaceChildren(intelEl(c, true));
      button('×', 'hd-x hd-intel-x', () => {
        close();
        onClose();
      }, box).title = '取消选中（Esc）';
    },
    close,
  };
}

let cssDone = false;
function injectCss(): void {
  if (cssDone) return;
  cssDone = true;
  const U = '.hd-ui';
  const css = `
${U} .hd-intel { display:flex; flex-direction:column; gap:8px; width:min(660px, calc(100vw - 56px)); color:${INK}; text-align:left; }
${U} .hd-intel-head { display:flex; gap:10px; align-items:center; }
${U} .hd-intel-head > img { flex:none; filter:drop-shadow(0 2px 2px rgba(0,0,0,.25)); }
${U} .hd-intel-ht { min-width:0; flex:1; padding-right:40px; }
${U} .hd-intel-nm { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
${U} .hd-intel-nm b { font-size:20px; }
${U} .hd-intel-lv { font-size:14px; color:#7a5a2e; }
${U} .hd-intel .hd-intel-role { margin:2px 0 0; font-size:14px; line-height:1.35; text-align:left; }
${U} .hd-intel-body { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(0,1fr); gap:14px; }
${U} .hd-intel-stats { display:flex; flex-direction:column; gap:3px; }
${U} .hd-intel-st { display:grid; grid-template-columns:5.6em minmax(30px,1fr) auto minmax(0,auto); align-items:center; gap:6px; font-size:14px; min-height:22px; }
${U} .hd-intel-k { white-space:nowrap; color:#5d4630; }
${U} .hd-intel-bar { height:8px; border-radius:4px; background:rgba(43,26,21,.14); overflow:hidden; }
${U} .hd-intel-bar i { display:block; height:100%; border-radius:4px; background:linear-gradient(90deg,#e9a93a,#ffd56a); }
${U} .hd-intel-v { text-align:right; white-space:nowrap; }
${U} .hd-intel-up { font-size:12px; color:#2f8a3e; white-space:nowrap; }
${U} .hd-intel-aims h4, ${U} .hd-intel-mk { margin:0 0 2px; font-size:14px; color:#7a5a2e; }
${U} .hd-intel-aim { display:flex; gap:6px; align-items:flex-start; font-size:14px; line-height:1.3; margin-bottom:4px; }
${U} .hd-intel-ic { flex:none; display:inline-flex; width:24px; height:24px; }
${U} .hd-intel-mus { display:flex; flex-direction:column; gap:4px; border-top:1px dashed rgba(43,26,21,.25); padding-top:6px; }
${U} .hd-intel-mur { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
${U} .hd-intel-mk { width:3.4em; flex:none; margin:0; }
${U} .hd-intel-mu { display:inline-flex; align-items:center; gap:2px; padding:1px 6px 1px 2px; border-radius:12px; font-size:12px; background:rgba(43,26,21,.07); }
${U} .hd-intel-mu.good { background:rgba(47,138,62,.16); }
${U} .hd-intel-mu.bad { background:rgba(217,71,43,.15); }
${U} .hd-intel-mu.none { background:rgba(43,26,21,.12); text-decoration:line-through; }
${U} .hd-intel-mu b { font-size:12px; padding:2px 4px; }
${U} .hd-intel-host { position:relative; }
/* 有鼠标时悬停就会浮出卡片，角标留给数字键 */
@media (hover:hover) and (pointer:fine) { ${U} .hd-intel-i { display:none; } }
${U} .hd-btn.hd-intel-open { min-height:44px; min-width:44px; padding:0 12px; font-size:14px; }
${U} .hd-intel-i { position:absolute; left:3px; top:3px; width:16px; height:16px; border-radius:8px; background:rgba(43,26,21,.78); color:#fff8e6; font:italic 700 12px/16px Georgia,serif; text-align:center; pointer-events:none; }
${U} .hd-dialog.hd-intel-dlg { position:relative; padding:14px; width:auto; max-width:calc(100vw - 16px); max-height:calc(100vh - 16px); }
${U} .hd-intel-x { position:absolute; right:6px; top:6px; min-width:44px; min-height:44px; }
${U} .hd-intel-float { position:fixed; left:0; top:0; z-index:70; pointer-events:none; padding:12px; border-radius:14px; background:#f9f0da; border:2px solid ${INK}; box-shadow:0 6px 18px rgba(0,0,0,.35); }
${U} .hd-intel-pin { position:fixed; right:8px; top:64px; z-index:40; padding:10px 10px 10px 12px; border-radius:14px; background:rgba(249,240,218,.96); border:2px solid ${INK}; box-shadow:0 4px 12px rgba(0,0,0,.3); }
${U} .hd-intel.compact { width:300px; gap:6px; }
${U} .hd-intel.compact .hd-intel-body { grid-template-columns:1fr; gap:6px; }
${U} .hd-intel.compact .hd-intel-role { font-size:12px; }
${U} .hd-intel.compact .hd-intel-aim { font-size:12px; margin-bottom:2px; }
${U} .hd-intel-pin .hd-intel-x { right:2px; top:2px; }
/* 手机横屏（矮）：两栏不变，字和行距收紧，相克两行并成一行，整张卡放得进 390 高 */
@media (max-height: 500px) {
  ${U} .hd-dialog.hd-intel-dlg { padding:8px 10px; }
  ${U} .hd-intel { gap:4px; }
  ${U} .hd-intel-head > img { height:40px !important; width:auto !important; }
  ${U} .hd-intel-nm b { font-size:16px; }
  ${U} .hd-intel .hd-intel-role, ${U} .hd-intel-lv { font-size:12px; }
  ${U} .hd-intel-st { min-height:16px; font-size:12px; }
  ${U} .hd-intel-aim { font-size:12px; margin-bottom:1px; }
  ${U} .hd-intel-ic, ${U} .hd-intel-ic svg { width:18px; height:18px; }
  ${U} .hd-intel-aims h4, ${U} .hd-intel-mk { font-size:12px; }
  ${U} .hd-intel-mus { flex-direction:row; flex-wrap:wrap; gap:4px 12px; padding-top:4px; }
  ${U} .hd-intel-mu img { height:20px !important; width:auto !important; }
}
@media (max-width: 600px) {
  ${U} .hd-intel-body { grid-template-columns:1fr; gap:6px; }
  ${U} .hd-intel-aim { margin-bottom:2px; }
  ${U} .hd-intel-pin { left:8px; right:8px; top:auto; bottom:calc(env(safe-area-inset-bottom) + 96px); }
  ${U} .hd-intel.compact { width:auto; }
  ${U} .hd-intel.compact .hd-intel-stats { display:grid; grid-template-columns:1fr 1fr; column-gap:10px; }
  ${U} .hd-intel.compact .hd-intel-st { grid-template-columns:auto minmax(20px,1fr) auto; }
  ${U} .hd-intel.compact .hd-intel-up { display:none; }
}
`;
  el('style', '', css, document.head);
}
