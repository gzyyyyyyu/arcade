import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, STAKES } from '../../src/core/stakes.ts';
import { lobbyKey, stepPick, type KeyCtx } from '../../src/view/lobbykeys.ts';

const ok: KeyCtx = { onPick: true, modal: false, focus: 'none', room: false };

describe('选桌页键盘', () => {
  it('←/→ 换档位，回车坐下开打', () => {
    expect(lobbyKey({ key: 'ArrowLeft' }, ok)).toBe('prev');
    expect(lobbyKey({ key: 'ArrowRight' }, ok)).toBe('next');
    expect(lobbyKey({ key: 'Enter' }, ok)).toBe('start');
  });

  it('不在选桌页（主页、牌桌上）不处理', () => {
    for (const k of ['ArrowLeft', 'ArrowRight', 'Enter']) expect(lobbyKey({ key: k }, { ...ok, onPick: false })).toBeNull();
  });

  it('弹窗开着不处理', () => {
    for (const k of ['ArrowLeft', 'ArrowRight', 'Enter']) expect(lobbyKey({ key: k }, { ...ok, modal: true })).toBeNull();
  });

  it('焦点在输入框（房间码、自定义止盈、滑杆）里一个键都不拦', () => {
    for (const k of ['ArrowLeft', 'ArrowRight', 'Enter']) expect(lobbyKey({ key: k }, { ...ok, focus: 'input' })).toBeNull();
  });

  it('焦点在别的按钮上回车留给它（Tab 到"更多玩法"按回车是展开）；选档位、模式的按钮上回车算开打', () => {
    expect(lobbyKey({ key: 'Enter' }, { ...ok, focus: 'button' })).toBeNull();
    expect(lobbyKey({ key: 'Enter' }, { ...ok, focus: 'pick-button' })).toBe('start');
    expect(lobbyKey({ key: 'ArrowRight' }, { ...ok, focus: 'button' })).toBe('next');
  });

  it('带 Ctrl / ⌘ / Alt、Shift+方向键、长按回车、好友房里的回车都不处理', () => {
    expect(lobbyKey({ key: 'ArrowRight', ctrlKey: true }, ok)).toBeNull();
    expect(lobbyKey({ key: 'Enter', metaKey: true }, ok)).toBeNull();
    expect(lobbyKey({ key: 'ArrowLeft', altKey: true }, ok)).toBeNull();
    expect(lobbyKey({ key: 'ArrowLeft', shiftKey: true }, ok)).toBeNull();
    expect(lobbyKey({ key: 'Enter', repeat: true }, ok)).toBeNull();
    expect(lobbyKey({ key: 'Enter' }, { ...ok, room: true })).toBeNull();
    expect(lobbyKey({ key: 'ArrowRight' }, { ...ok, room: true })).toBe('next');
  });

  it('别的键不管', () => {
    for (const k of ['a', ' ', 'Escape', 'ArrowUp', '1']) expect(lobbyKey({ key: k }, ok)).toBeNull();
  });
});

describe('换档位', () => {
  const ids = STAKES.map((s) => s.id);
  it('一格一格走，到头停住不绕回', () => {
    expect(stepPick(ids, ids[0]!, 1)).toBe(ids[1]);
    expect(stepPick(ids, ids[1]!, -1)).toBe(ids[0]);
    expect(stepPick(ids, ids[0]!, -1)).toBe(ids[0]);
    expect(stepPick(ids, ids.at(-1)!, 1)).toBe(ids.at(-1));
    expect(stepPick(DIFFICULTIES, DIFFICULTIES[0]!, 1)).toBe(DIFFICULTIES[1]);
  });
  it('当前值不在列表里就回到第一个', () => {
    expect(stepPick(ids, 'nope' as never, 1)).toBe(ids[0]);
  });
});
