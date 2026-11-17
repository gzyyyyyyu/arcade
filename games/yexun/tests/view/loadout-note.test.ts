// 选模式页点起手、心法后浮出的说明：写保底和补刷新（规则 60；实盘规则 64 起一样）
import { describe, expect, it } from 'vitest';
import { loadoutNote } from '../../src/view/ui/screens/shared.ts';

const l = { alt: true, starts: [{ icon: '', name: '纸兵' }, { icon: '', name: '镇魂铃' }], xinfa: 'ghost' as const, schools: [{ id: 'paper' as const, name: '纸兵' }, { id: 'ghost' as const, name: '幽冥' }] };

describe('loadoutNote', () => {
  it('起手、保底、补刷新（娱乐、实盘一样）', () => {
    expect(loadoutNote(l)).toBe('起手 镇魂铃 · 心法 幽冥：每次升级保底一张幽冥的卡，幽冥的法器进化多补一次刷新');
  });
  it('不带心法', () => {
    expect(loadoutNote({ ...l, alt: false, xinfa: null })).toBe('起手 纸兵 · 不带心法');
  });
});
