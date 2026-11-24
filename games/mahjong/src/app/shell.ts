/**
 * 页面骨架和顶栏：大厅入口、标题、钱包、设置齿轮（面板在 settings.ts）、规则、叫朋友、离开，
 * 以及中间放选桌页 / 牌桌的 screen 和提示条 toast。
 * 骨架在加载这个模块时一次画好（子节点的先后顺序有讲究：顶栏、设置面板、screen），别的文件 import 这里的节点来用。
 */
import { button, el } from '../view/dom.ts';
import '../view/ui-help.css';
import { showRules } from '../view/guide.ts';
import { watchScreen } from '../view/motion.ts';
import { GAME_NAME } from '../view/text.ts';
import { DEFAULT_VARIANT } from '../core/variants/index.ts';
import { pageOf } from '../view/variants/pages.ts';
import { leave } from './leave.ts';
import { activeVariant, prefs } from './prefs.ts';
import { inMatch, session } from './session.ts';
import { mountSettings } from './settings.ts';
import { share } from './social.ts';
import { TIMING } from './timing.ts';

/** 不在牌桌时顶栏的名字：游戏名和玩法名只用空格隔开，「·」只留给玩法名内部（川麻·血战到底），避免两种点混用；实盘选桌页按实盘真打的规则取（实盘不开血流、三人两房，平时规则里开着也写"血战到底"） */
export const idleTitle = (real = false): string => {
  const page = pageOf(activeVariant());
  return `${GAME_NAME} ${page.name(real ? (page.realOpts(prefs.opts) as typeof prefs.opts) : prefs.opts)}`;
};

/** 规则小册子讲哪个玩法：好友房看这一桌的，单机里看正在打的，别处看选着的 */
const rulesVariant = (): string => (session.online ? (session.online.state.opts?.variant ?? DEFAULT_VARIANT) : (session.solo?.save.state.variant ?? activeVariant()));

export const app = document.getElementById('app')!;
export const stage = el('div', 'stage', app);
export const topbar = el('div', 'topbar', stage);
export const home = el('a', 'home', topbar);
home.href = '/';
home.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 3l9 8v10h-6v-6H9v6H3z"/></svg><span>大厅</span>';
export const title = el('span', 'title', topbar, idleTitle());
el('span', 'spacer', topbar);
export const walletChip = el('span', 'wallet-chip', topbar);
const settings = mountSettings(topbar, stage, paintTop);
/**
 * Esc 在页面上：设置面板开着就关面板，主页的子页（选桌、何切、速判、擂台）就回主页，和点「‹ 主页」一样。
 * 挂在 window 上，排在弹窗（dialog.ts）和牌桌的键盘处理后面：那边处理过（preventDefault）或还有弹窗时不管
 */
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
  if (settings.close()) return;
  if (document.querySelector('.mask:not(.closing)')) return;
  screen.querySelector<HTMLButtonElement>(':scope > .pill.back, .ld-back, .hk-back, .td-back')?.click();
});
button('icon', topbar, '规则', () => showRules(stage, undefined, rulesVariant()));
const shareBtn = button('pill share', topbar, '叫朋友', () => share());
const leaveBtn = button('pill leave', topbar, '离开', () => void leave());
export const screen = el('div', 'screen', stage);

/** 顶栏连同它按钮的隐形点按区（buttons.css：从顶栏顶往下撑满 --tap，屏幕上 44）：交给 kit 让开，头像热区、气泡不压「离开」「规则」的下半截 */
export function topbarTapRect(): DOMRect {
  const r = topbar.getBoundingClientRect();
  return new DOMRect(r.left, r.top, r.width, Math.max(r.height, 44));
}
watchScreen(screen);

/** 顶栏、设置面板里各按钮的字和显隐，跟着现在在打单机、好友房还是没开局 */
export function paintTop(): void {
  settings.paint();
  // 等人页自己有「叫朋友来」「离开房间」，顶栏不再摆一套
  const waiting = session.online?.state.room?.status === 'waiting';
  leaveBtn.hidden = (!session.solo && !session.online) || waiting;
  // 匹配桌只有排进来的人能进，不摆"叫朋友"
  shareBtn.hidden = !session.online || session.online.state.room?.status === 'over' || waiting || inMatch();
}

let toastTimer = 0;
export function toast(text: string): void {
  let t = stage.querySelector<HTMLElement>('.toast');
  if (!t) t = el('div', 'toast', stage);
  t.textContent = text;
  t.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t!.hidden = true), TIMING.toastMs);
}
