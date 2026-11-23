/**
 * 页面骨架和顶栏：大厅入口、标题、钱包、速度、声音面板（音量、静音、茶馆声、安全牌提示、推荐出牌、互动、聊天、弹幕）、规则、叫朋友、离开，
 * 以及中间放选桌页 / 牌桌的 screen 和提示条 toast。
 * 骨架在加载这个模块时一次画好（子节点的先后顺序有讲究：顶栏、声音面板、screen），别的文件 import 这里的节点来用。
 */
import { chatMode, funOff, setChatMode, setFunOff, type ChatMode } from '../view/fun.ts';
import { button, el } from '../view/dom.ts';
import '../view/ui-help.css';
import { setCutinFast } from '../view/cutin.ts';
import { showRules } from '../view/guide.ts';
import { watchScreen } from '../view/motion.ts';
import { play, setAmbience, setSound, setVolume } from '../view/sound.ts';
import { GAME_NAME } from '../view/text.ts';
import { DEFAULT_VARIANT } from '../core/variants/index.ts';
import { pageOf } from '../view/variants/pages.ts';
import { setSafeHint } from '../view/variants/riichi/ui.ts';
import { leave } from './leave.ts';
import { coachAllowed } from '../game/coach.ts';
import { activeVariant, live, prefs, resetSettings, savePrefs, setLiveSound } from './prefs.ts';
import { inMatch, session } from './session.ts';
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
/** 齿轮（24 格，八个齿 + 中间的孔，填充色跟着 currentColor） */
const GEAR_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M10.3 2h3.4l.5 2.6 1.6.7 2.2-1.5 2.4 2.4-1.5 2.2.7 1.6 2.4.5v3.4l-2.6.5-.7 1.6 1.5 2.2-2.4 2.4-2.2-1.5-1.6.7-.5 2.6h-3.4l-.5-2.6-1.6-.7-2.2 1.5-2.4-2.4 1.5-2.2-.7-1.6L2 13.7v-3.4l2.6-.5.7-1.6-1.5-2.2 2.4-2.4 2.2 1.5 1.6-.7zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/></svg>';
// 设置：顶栏只有一个齿轮（docs/ui.md 第 8 节；出牌速度也在里面，360 宽顶栏放不下单独的按钮），点开小面板，再点或点别处收起
const soundBtn = button('icon gear', topbar, '', () => {
  volBox.hidden = !volBox.hidden;
  // 弹幕开关的字跟着这一桌的互动组件（开局才有）
  paintTop();
});
soundBtn.innerHTML = GEAR_SVG;
soundBtn.setAttribute('aria-label', '设置');
soundBtn.title = '设置';
const volBox = el('div', 'vol', stage);
volBox.hidden = true;
/** 面板分组（ui.md 第 8 节的顺序）：音量 / 茶馆声 / 速度（单机才有） / 提示，每组一个小标题 */
const group = (title: string): HTMLElement => {
  const g = el('div', 'vol-group', volBox);
  el('p', 'vol-title', g, title);
  return g;
};
const gVol = group('音量');
const gAmb = group('茶馆声');
const gSpeed = group('电脑出牌');
const gHint = group('提示和互动');
const volRange = el('input', '', gVol) as HTMLInputElement;
volRange.type = 'range';
volRange.min = '0';
volRange.max = '100';
volRange.value = String(Math.round(prefs.volume * 100));
volRange.setAttribute('aria-label', '音量');
volRange.addEventListener('input', () => {
  prefs.volume = Number(volRange.value) / 100;
  setVolume(prefs.volume);
  if (prefs.volume > 0 && !live.sound) {
    setLiveSound(true);
    setSound(true);
  }
  paintTop();
});
volRange.addEventListener('change', () => {
  savePrefs();
  play('button');
});
const muteBtn = button('act soft', gVol, '', () => {
  setLiveSound(!live.sound);
  setSound(live.sound);
  paintTop();
});
const ambBtn = button('act soft', gAmb, '', () => {
  prefs.ambience = !prefs.ambience;
  setAmbience(prefs.ambience);
  savePrefs();
  paintTop();
});
const speedBtn = button('act soft', gSpeed, '', () => {
  prefs.fast = !prefs.fast;
  savePrefs();
  applySpeed();
  paintTop();
});
function applySpeed(): void {
  if (session.solo) session.solo.speed = prefs.fast ? TIMING.fastScale : 1;
}
// 安全牌提示（立直玩法才出现这个按钮）
const safeBtn = button('act soft', gHint, '', () => {
  prefs.safeHint = !prefs.safeHint;
  setSafeHint(prefs.safeHint);
  savePrefs();
  paintTop();
});
// 推荐出牌（单机娱乐新手、实盘小档才出现这个按钮，game/coach.ts）
const coachBtn = button('act soft', gHint, '', () => {
  prefs.coach = !prefs.coach;
  savePrefs();
  applyCoach();
  paintTop();
});
/** 这一桌该不该标推荐的牌：设置开着、而且是能开推荐的单机桌 */
const coachHere = (): boolean => !!session.solo && coachAllowed(session.solo.save);
function applyCoach(): void {
  session.table?.setCoach(prefs.coach && coachHere());
}
// 互动的总开关也放这儿（docs/table-fun.md 第 5 节）：关了别人的一律不播，单机电脑也不反应
const funBtn = button('act soft', gHint, '', () => {
  setFunOff(!funOff());
  if (funOff()) session.fun?.closeAll();
  paintTop();
});
// 聊天的开关（好友房和单机都有，三档轮着切）：对局里出现。
// 不看：别人说的不显示，自己还能说；不和陌生人：只管快速匹配的桌，下次进匹配桌起不收也不能说
const CHAT_NEXT: Record<ChatMode, ChatMode> = { on: 'stranger', stranger: 'off', off: 'on' };
const CHAT_LABEL: Record<ChatMode, string> = { on: '聊天：开', stranger: '聊天：不和陌生人', off: '聊天：不看' };
const chatBtn = button('act soft', gHint, '', () => {
  setChatMode(CHAT_NEXT[chatMode()]);
  paintTop();
});
// 弹幕：和 kit 聊天框、面板里的"弹幕"同一份开关（存在 mahjong.chat）；对局里才有
const danBtn = button('act soft', gHint, '', () => {
  session.fun?.setDanmaku(!session.fun.danmaku());
  paintTop();
});
// 恢复默认：音量、静音、茶馆声、出牌速度、安全牌提示、推荐出牌、互动、聊天回出厂值，立刻生效并存回（弹幕随系统的减少动态设置，不在这里动）
button('act soft reset', volBox, '恢复默认', () => {
  resetSettings();
  applySpeed();
  setVolume(prefs.volume);
  setSound(live.sound);
  setAmbience(prefs.ambience);
  setSafeHint(prefs.safeHint);
  applyCoach();
  setFunOff(false);
  setChatMode('on');
  volRange.value = String(Math.round(prefs.volume * 100));
  play('button');
  paintTop();
});
/**
 * Esc 在页面上：设置面板开着就关面板，主页的子页（选桌、何切、速判、擂台）就回主页，和点「‹ 主页」一样。
 * 挂在 window 上，排在弹窗（dialog.ts）和牌桌的键盘处理后面：那边处理过（preventDefault）或还有弹窗时不管
 */
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
  if (!volBox.hidden) {
    volBox.hidden = true;
    soundBtn.focus({ preventScroll: true });
    return;
  }
  if (document.querySelector('.mask:not(.closing)')) return;
  screen.querySelector<HTMLButtonElement>(':scope > .pill.back, .ld-back, .hk-back, .td-back')?.click();
});
document.addEventListener('pointerdown', (e) => {
  if (!volBox.hidden && !volBox.contains(e.target as Node) && e.target !== soundBtn) volBox.hidden = true;
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

/** 顶栏、声音面板里各按钮的字和显隐，跟着现在在打单机、好友房还是没开局 */
export function paintTop(): void {
  // 写的是现在的速度
  speedBtn.textContent = prefs.fast ? '速度：快' : '速度：常速';
  setCutinFast(prefs.fast);
  soundBtn.classList.toggle('muted', !(live.sound && prefs.volume > 0));
  muteBtn.textContent = live.sound ? '静音' : '开声';
  funBtn.textContent = funOff() ? '表情道具：不看' : '表情道具：显示';
  ambBtn.textContent = prefs.ambience ? '茶馆声：开' : '茶馆声：关';
  safeBtn.textContent = prefs.safeHint ? '安全牌提示：开' : '安全牌提示：关';
  safeBtn.hidden = !session.table?.root.classList.contains('rc');
  coachBtn.textContent = prefs.coach ? '推荐出牌：开' : '推荐出牌：关';
  coachBtn.hidden = !coachHere();
  chatBtn.textContent = CHAT_LABEL[chatMode()];
  chatBtn.hidden = !session.online && !session.solo;
  danBtn.textContent = session.fun?.danmaku() ? '弹幕：开' : '弹幕：关';
  danBtn.hidden = !session.fun;
  // 等人页自己有「叫朋友来」「离开房间」，顶栏不再摆一套
  const waiting = session.online?.state.room?.status === 'waiting';
  leaveBtn.hidden = (!session.solo && !session.online) || waiting;
  gSpeed.hidden = !session.solo;
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
