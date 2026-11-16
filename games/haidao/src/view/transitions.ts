/**
 * 界面的开合与切场景过渡：弹窗 / 面板离场淡出，场景之间盖一层幕布再淡掉，按钮反馈的 CSS。
 * 离场和幕布的时长走 mapfx 的游戏时钟（game.events 'step'），冒烟 / 录像用 __haidao.frameStep 手动推帧时
 * 也是一帧一帧走，不会按墙钟跑完；按钮悬停 / 按下是纯 CSS 过渡（瞬时反馈，不需要跟时钟）。
 * 本文件不 import ui.ts（ui.ts 反过来用它），样式由 ui.ts 的 css() 之后拼进去。
 */
import { app } from './app.ts';
import { tween } from './mapfx.ts';
import { REDUCED } from './feel.ts';

/** 离场时长（毫秒）：淡出加微缩 */
export const LEAVE_MS = 140;
/** 幕布从全黑淡到透明的时长 */
export const VEIL_MS = 200;

const rawRemove = (n: Element): void => Element.prototype.remove.call(n);

/** 直接拿掉（不演离场）：同一位置马上要换新的时用，免得新旧两层叠在一起 */
export function removeNow(node: HTMLElement): void {
  rawRemove(node);
}

/**
 * 离场：加 hd-leaving（不再吃点击、读屏忽略）→ 淡出 + 微缩 → 拿掉。
 * 重复调用无副作用；游戏还没起来 / 开了"减弱动态效果"时直接拿掉。
 * 兜底：游戏循环停了（标签页在后台）时墙钟超时也拿掉，不留残影。
 */
export function dismiss(node: HTMLElement): void {
  if (!node.isConnected || node.classList.contains('hd-leaving')) return;
  if (REDUCED || !app.booted) return rawRemove(node);
  node.classList.add('hd-leaving');
  node.setAttribute('aria-hidden', 'true');
  node.inert = true;
  // 遮罩：缩里面的框；面板：整块一起缩并往下沉一点
  const inner = node.classList.contains('hd-mask') ? (node.firstElementChild as HTMLElement | null) : node;
  const fallback = setTimeout(() => rawRemove(node), LEAVE_MS * 4);
  void tween(
    LEAVE_MS,
    (k) => {
      node.style.opacity = String(1 - k);
      if (inner) inner.style.transform = inner === node ? `translateY(${(6 * k).toFixed(2)}px) scale(${(1 - 0.03 * k).toFixed(4)})` : `scale(${(1 - 0.05 * k).toFixed(4)})`;
    },
    'fade',
    () => node.isConnected,
  ).then(() => {
    clearTimeout(fallback);
    rawRemove(node);
  });
}

let veil: HTMLElement | null = null;
let veilToken = 0;
let seenScene = false;

/**
 * 切场景：新场景的界面一建好就盖一层全屏幕布（遮住画布和界面的那一下硬切），再淡掉；幕布期间不接受点击。
 * 场景是 main.ts 那边直接销毁重建的，淡出那半段插不进去，所以只做"盖住 → 淡入新场景"。第一次进场景（刚启动）不盖。
 */
export function sceneVeil(host: HTMLElement): void {
  const first = !seenScene;
  seenScene = true;
  if (first || REDUCED || !app.booted) return;
  const token = ++veilToken;
  if (!veil?.isConnected) {
    veil = document.createElement('div');
    veil.className = 'hd-veil';
    veil.setAttribute('aria-hidden', 'true');
    host.appendChild(veil);
  }
  const v = veil;
  v.style.opacity = '1';
  const fallback = setTimeout(() => {
    if (token === veilToken) rawRemove(v);
  }, VEIL_MS * 4);
  void tween(VEIL_MS, (k) => (v.style.opacity = String(1 - k)), 'recover', () => token === veilToken && v.isConnected).then(() => {
    if (token !== veilToken) return;
    clearTimeout(fallback);
    rawRemove(v);
  });
}

/** 按钮 / 卡片的悬停、按下、焦点，弹窗和面板的进场，离场与幕布。写在最后注入，叠两层类名压过皮肤和排布里同类规则 */
export function feedbackCss(ink: string): string {
  const U = '.hd-ui.hd-ui';
  const press = [
    `${U} .hd-btn:active:not(:disabled)`,
    `${U} .hd-card:active:not(.off)`,
    `${U} .hd-td-tower:active:not(:disabled)`,
    `${U} .hd-td-branch:active:not(:disabled)`,
    `${U} .hd-tdtab:active`,
    `${U} .hd-boat:active`,
    `${U} .hd-tdgar-card:active:not(:disabled)`,
    `${U} .hd-td-plan:active`,
    `${U} .hd-bounty:active`,
  ].join(',');
  const base = [`${U} .hd-btn`, `${U} .hd-card`, `${U} .hd-td-tower`, `${U} .hd-td-branch`, `${U} .hd-tdtab`, `${U} .hd-boat`, `${U} .hd-tdgar-card`, `${U} .hd-td-plan`, `${U} .hd-bounty`];
  const hover = base.map((s) => `${s}:hover:not(:disabled):not(.off):not(.done)`).join(',');
  const focus = base.map((s) => `${s}:focus-visible`).join(',');
  return `
/* 反馈：松手慢（带一点回弹），按下快 */
${base.join(',')} { transition:transform .16s cubic-bezier(.3,1.5,.5,1),box-shadow .16s ease-out,filter .12s ease-out; }
${press} { transform:scale(.96); box-shadow:0 1px 0 ${ink}; transition-duration:.08s; transition-timing-function:cubic-bezier(.2,.8,.2,1); }
@media (hover:hover) { ${hover} { transform:translateY(-1px); filter:brightness(1.1) saturate(1.05); cursor:pointer; }
  ${press} { transform:scale(.96); filter:brightness(1.04); } }
${focus} { outline:3px solid #2f7fd8; outline-offset:2px; }
/* 弹窗和面板：进场沿用上面的 hd-mask-in / hd-dialog-in；面板上滑淡入。同类面板原地换内容（hd-nofx）不重演 */
.hd-ui .hd-sheet { animation:hd-sheet-in .16s cubic-bezier(.2,.9,.3,1); }
.hd-ui .hd-sheet.hd-nofx { animation:none; }
@keyframes hd-sheet-in { from { opacity:0; transform:translateY(10px); } }
/* 离场：不吃点击，进场动画别再压住内联的淡出 */
.hd-ui .hd-leaving, .hd-ui .hd-leaving * { pointer-events:none !important; animation:none !important; }
.hd-ui .hd-veil { position:absolute; inset:0; z-index:90; background:#14233a; pointer-events:auto; }
@media (prefers-reduced-motion: reduce) {
  ${base.join(',')} { transition:none; }
  ${hover}, ${press} { transform:none; }
  .hd-ui .hd-sheet { animation:none; }
  .hd-ui .hd-veil { display:none; }
}
`;
}
