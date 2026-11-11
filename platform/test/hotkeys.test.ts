/** 键盘快捷键的按键判断（src/features/hotkeys/hotkeys.ts） */
import { describe, expect, it } from 'vitest';
import { actionFor, HOTKEY_HELP } from '../src/features/hotkeys/hotkeys';

const page = { tag: 'BODY', editable: false };
const ev = (key: string, extra: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...extra,
});

describe('actionFor', () => {
  it('带 Ctrl/Meta/Alt 一律不抢', () => {
    for (const m of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      expect(actionFor(ev('1', { [m]: true }), page)).toBeNull();
      expect(actionFor(ev('f', { [m]: true }), page)).toBeNull();
      expect(actionFor(ev('Escape', { [m]: true }), page)).toBeNull();
    }
  });

  it('输入框、文本域、下拉、可编辑区只认 Escape', () => {
    for (const t of [
      { tag: 'INPUT', editable: false },
      { tag: 'textarea', editable: false },
      { tag: 'Select', editable: false },
      { tag: 'DIV', editable: true },
    ]) {
      expect(actionFor(ev('1'), t)).toBeNull();
      expect(actionFor(ev('b'), t)).toBeNull();
      expect(actionFor(ev('?'), t)).toBeNull();
      expect(actionFor(ev('Escape'), t)).toEqual({ kind: 'escape' });
    }
  });

  it('1 到 9 对应第 0 到 8 个游戏，0 不算', () => {
    for (let i = 1; i <= 9; i++) expect(actionFor(ev(String(i)), page)).toEqual({ kind: 'game', index: i - 1 });
    expect(actionFor(ev('0'), page)).toBeNull();
  });

  it('字母跳转，大小写都行', () => {
    const cases: [string, string][] = [
      ['b', '/boards'],
      ['f', '/friends'],
      ['w', '/wallet'],
      ['s', '/me/stats'],
      ['h', '/'],
    ];
    for (const [k, path] of cases) {
      expect(actionFor(ev(k), page)).toEqual({ kind: 'go', path });
      expect(actionFor(ev(k.toUpperCase(), { shiftKey: true }), page)).toEqual({ kind: 'go', path });
    }
  });

  it('? 打开帮助，Escape 是 escape', () => {
    expect(actionFor(ev('?', { shiftKey: true }), page)).toEqual({ kind: 'help' });
    expect(actionFor(ev('Escape'), page)).toEqual({ kind: 'escape' });
  });

  it('无关键返回 null', () => {
    for (const k of ['a', 'Enter', 'Tab', ' ', 'ArrowUp', 'F1', 'Shift', 'Backspace']) {
      expect(actionFor(ev(k), page)).toBeNull();
    }
  });
});

describe('HOTKEY_HELP', () => {
  it('每条都有按键和说明', () => {
    expect(HOTKEY_HELP.length).toBeGreaterThan(0);
    for (const h of HOTKEY_HELP) {
      expect(h.keys).not.toBe('');
      expect(h.what).not.toBe('');
    }
  });
});
