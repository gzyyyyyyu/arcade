// 选模式页点起手、心法后浮出的说明：娱乐局写保底和补刷新（规则 60），实盘只写「出现多一半」
import { describe, expect, it } from 'vitest';
import { loadoutNote } from '../../src/view/ui/screens/shared.ts';

const l = { alt: true, starts: [{ icon: '', name: '纸兵' }, { icon: '', name: '镇魂铃' }], xinfa: 'ghost' as const, schools: [{ id: 'paper' as const, name: '纸兵' }, { id: 'ghost' as const, name: '幽冥' }] };

describe('loadoutNote', () => {
  it('娱乐局：起手、保底、补刷新', () => {
    expect(loadoutNote(l, false)).toBe('起手 镇魂铃 · 心法 幽冥：每次升级保底一张幽冥的卡，幽冥的法器进化多补一次刷新');
  });
  it('实盘：不保底', () => {
    expect(loadoutNote(l, true)).toBe('起手 镇魂铃 · 心法 幽冥：幽冥的卡出现多一半（实盘不保底）');
  });
  it('不带心法', () => {
    expect(loadoutNote({ ...l, alt: false, xinfa: null }, false)).toBe('起手 纸兵 · 不带心法');
  });
});
