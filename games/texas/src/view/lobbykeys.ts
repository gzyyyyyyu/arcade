import { must } from '../must.ts';
/**
 * 选桌页的键盘（仓库根 docs/ui.md 第 9 节）：←/→ 换档位，回车坐下开打。纯函数，不碰页面：谁在输入、有没有弹窗由 lobby.ts 量好传进来。
 * 原则：不抢别人的键——输入框里（房间码、自定义止盈、滑杆）、弹窗开着、带 Ctrl/⌘/Alt 时一律不处理；
 * 焦点在别的按钮上时回车留给那个按钮（Tab 过去按"锦标赛"就是开锦标赛），只有选档位、模式、人数这类"选一个"的按钮上回车才算开打。
 */

type LobbyKey = 'prev' | 'next' | 'start';

export interface KeyCtx {
  /** 现在看着的是选桌页（不是主页、不在牌桌上） */
  onPick: boolean;
  /** 页面上有 .mask 或 .dialog（弹窗、补码、结算……） */
  modal: boolean;
  /** 焦点在哪：输入类（文字框、滑杆、下拉）/ 选一个的按钮 / 别的按钮和链接 / 没有焦点 */
  focus: 'input' | 'pick-button' | 'button' | 'none';
  /** 选的是好友房：回车不开打（开房间有它自己的按钮和房间码框） */
  room: boolean;
}

/** 这个键在选桌页上该做什么；不归选桌页管返回 null（调用方就不 preventDefault） */
export function lobbyKey(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean; repeat?: boolean }, c: KeyCtx): LobbyKey | null {
  if (!c.onPick || c.modal || c.focus === 'input') return null;
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === 'ArrowLeft') return e.shiftKey ? null : 'prev';
  if (e.key === 'ArrowRight') return e.shiftKey ? null : 'next';
  // 按住回车不连着开：开打一次就够，长按会在"开打"失败重画的几帧里反复触发
  if (e.key === 'Enter' && !c.room && !e.repeat && (c.focus === 'none' || c.focus === 'pick-button')) return 'start';
  return null;
}

/** 在一排档位里挪一格；到头停住（不绕回去：从最小一档按 ← 不该突然跳到最贵的） */
export function stepPick<T>(list: readonly T[], cur: T, dir: 1 | -1): T {
  const i = list.indexOf(cur);
  if (i < 0) return must(list[0], 'list[0]');
  return must(list[Math.max(0, Math.min(list.length - 1, i + dir))], 'list[Math.max(0, Math.min(list.length - ');
}

/** 焦点元素归哪一类（lobby.ts 传 document.activeElement） */
export function focusKind(a: Element | null): KeyCtx['focus'] {
  if (!a || a === document.body || a === document.documentElement) return 'none';
  const tag = a.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (a as HTMLElement).isContentEditable) return 'input';
  if (a.matches('.lobby :is(.tile, .mode, .size, .tfmt)')) return 'pick-button';
  return 'button';
}
