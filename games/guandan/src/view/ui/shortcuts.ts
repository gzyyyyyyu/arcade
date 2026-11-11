/**
 * 牌桌快捷键（电脑）：空格 / 回车 = 出牌，B = 不要，H = 提示（连按换下一组），S = 理牌，Esc = 取消全部选中。
 * 每个键都只是按一下对应的按钮（`Button.press`）：音效、禁用、能不能出的判断和鼠标点一样，不另走一条路。
 * 不抢别人的键：弹窗开着（有焦点层）、键盘在输入框或 DOM 面板里、键盘焦点框亮着（回车空格归 `focus.ts`）时都不管；
 * Esc 没有选牌时什么也不做，关弹窗仍是 `focus.ts` 的事；Tab、方向键也在那边。
 * 手牌上滚轮不滚页面（浏览器默认会带着整页滚）。
 */
import type Phaser from 'phaser';
import type { HandView } from '../table/hand.ts';
import { hasLayer, keyboardInDom, ringActive } from './focus.ts';
import type { Button } from './kit.ts';

export interface ShortcutTargets {
  play: Button;
  pass: Button;
  hint: Button;
  sort: Button;
  /** "重选"：Esc 取消选中走它 */
  clear: Button;
  hand: HandView;
  /** 场景自己的弹层（结算、确认）开着时不接键 */
  blocked: () => boolean;
}

/** 按键 → 动作（纯函数，单测直接测）；不认的键返回 null */
export type ShortcutAction = 'play' | 'pass' | 'hint' | 'sort' | 'clear';

export function actionOf(key: string): ShortcutAction | null {
  switch (key) {
    case ' ':
    case 'Enter':
      return 'play';
    case 'Escape':
      return 'clear';
    default:
      break;
  }
  switch (key.toLowerCase()) {
    case 'b':
      return 'pass';
    case 'h':
      return 'hint';
    case 's':
      return 'sort';
    default:
      return null;
  }
}

/** 规则页里"快捷键"一页的内容（电脑上才显示）；按钮名和牌桌上的字一致 */
export const SHORTCUT_HELP: readonly { keys: string; what: string }[] = [
  { keys: '空格 / 回车', what: '出牌（进贡、还贡时是"进贡"、"还贡"）' },
  { keys: 'B', what: '不要' },
  { keys: 'H', what: '提示，连按换下一组' },
  { keys: 'S', what: '理牌：按点数、按牌型切换' },
  { keys: 'Esc', what: '取消全部选中（没选牌时关弹窗）' },
  { keys: '鼠标右键', what: '点牌取消这张，点空白取消全部' },
  { keys: 'Tab / 方向键', what: '在按钮之间移动，回车或空格按下' },
];

/** 有鼠标和键盘的设备（不是手机、平板）：悬停、快捷键说明只在这种设备上出现 */
export function hasPointerKeys(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

/** 在牌桌场景里接上快捷键和手牌滚轮；场景关掉时自动摘掉 */
export function mountShortcuts(scene: Phaser.Scene, t: ShortcutTargets): void {
  const canPress = (b: Button): boolean => b.visible && b.enabled && !b.loading;
  const run = (a: ShortcutAction): boolean => {
    const b = { play: t.play, pass: t.pass, hint: t.hint, sort: t.sort, clear: t.clear }[a];
    if (!canPress(b)) return false;
    b.press();
    return true;
  };
  const onKey = (ev: KeyboardEvent): void => {
    if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.isComposing || ev.repeat) return;
    if (keyboardInDom(ev) || hasLayer(scene) || t.blocked()) return;
    if (!scene.sys.isActive() || !scene.sys.isVisible()) return;
    const a = actionOf(ev.key);
    if (!a) return;
    // 回车空格：焦点框亮着时归 focus.ts（它会按下框住的按钮）
    if (a === 'play' && ringActive(scene)) return;
    if (run(a)) ev.preventDefault();
  };
  window.addEventListener('keydown', onKey);

  // 滚轮在手牌上不滚页面；游标移动留给以后
  const canvas = scene.game.canvas;
  const onWheel = (ev: WheelEvent): void => {
    const p = scene.input.activePointer;
    const w = scene.cameras.main.getWorldPoint(p.x, p.y);
    if (t.hand.inArea(w.y)) ev.preventDefault();
  };
  canvas.addEventListener('wheel', onWheel, { passive: false });

  scene.events.once('shutdown', () => {
    window.removeEventListener('keydown', onKey);
    canvas.removeEventListener('wheel', onWheel);
  });
}
