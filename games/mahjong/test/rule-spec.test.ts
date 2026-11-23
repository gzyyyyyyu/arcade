/**
 * 选桌页的规则表（game/rule-spec.ts、xuezhan-rules.ts、riichi/rules.ts）：摘要、互斥、实盘藏固定项、每一项都是真的规则字段、第一次来的默认值。
 */
import { describe, expect, test } from 'vitest';
import { DEFAULT_OPTS as RC_DEFAULT } from '../src/core/variants/riichi/index.ts';
import { DEFAULT_OPTS as XZ_DEFAULT } from '../src/core/variants/sichuan-xuezhan/index.ts';
import { RC_FIRST_OPTS, RC_RULES } from '../src/game/riichi/rules.ts';
import { choose, chosen, editable, summary } from '../src/game/rule-spec.ts';
import { XZ_FIRST_OPTS, XZ_RULES } from '../src/game/xuezhan-rules.ts';

describe('川麻的规则表', () => {
  test('每一项都是规则里的字段，选中的值一定在选项里', () => {
    for (const d of XZ_RULES.defs) {
      expect(Object.keys(XZ_DEFAULT)).toContain(d.key);
      expect(chosen(d, XZ_FIRST_OPTS)).toBeDefined();
    }
  });
  test('第一次来：4 局，其余照核心默认', () => {
    expect(XZ_FIRST_OPTS).toEqual({ ...XZ_DEFAULT, rounds: 4 });
    expect(summary(XZ_RULES, XZ_FIRST_OPTS, false).join(' · ')).toBe('4 局 · 4 番封顶 · 自摸加底 · 换三张 · 呼叫转移');
  });
  test('实盘：局数不给选，摘要写一局一结', () => {
    expect(editable(XZ_RULES, true, XZ_FIRST_OPTS).map((d) => d.key)).not.toContain('rounds');
    expect(summary(XZ_RULES, XZ_FIRST_OPTS, true)[0]).toBe('一局一结');
    expect(summary(XZ_RULES, XZ_FIRST_OPTS, true).join(' ')).not.toContain('4 局');
  });
  test('血流成河、三人两房只在玩法行选，不在规则表里；选了一项不改原来那份', () => {
    expect(XZ_RULES.defs.map((d) => d.key)).not.toContain('flow');
    expect(XZ_RULES.defs.map((d) => d.key)).not.toContain('three');
    expect(() => choose(XZ_RULES, XZ_FIRST_OPTS, 'flow', true)).toThrow();
    const swapped = choose(XZ_RULES, XZ_FIRST_OPTS, 'swap', false);
    expect(XZ_FIRST_OPTS.swap).toBe(true);
    expect(swapped.swap).toBe(false);
  });
  test('三人两房没有换三张这一项：面板不摆、摘要不写', () => {
    const three = { ...XZ_FIRST_OPTS, three: true };
    expect(editable(XZ_RULES, false, three).map((d) => d.key)).not.toContain('swap');
    expect(summary(XZ_RULES, three, false).join(' ')).not.toContain('换三张');
    expect(editable(XZ_RULES, false, XZ_FIRST_OPTS).map((d) => d.key)).toContain('swap');
  });
  test('不认识的选项直接报错', () => {
    expect(() => choose(XZ_RULES, XZ_FIRST_OPTS, 'cap', 9)).toThrow();
    expect(() => choose(XZ_RULES, XZ_FIRST_OPTS, 'nope', true)).toThrow();
  });
  test('约几分钟跟着局数和三人两房变', () => {
    expect(XZ_RULES.minutes(XZ_FIRST_OPTS)).toBe(10);
    expect(XZ_RULES.minutes({ ...XZ_FIRST_OPTS, rounds: 1 })).toBe(3);
    expect(XZ_RULES.minutes({ ...XZ_FIRST_OPTS, rounds: 8, three: true })).toBe(10);
  });
});

describe('立直的规则表', () => {
  test('第一次来打东风战；实盘只写一局一结和红 5', () => {
    expect(RC_FIRST_OPTS).toEqual({ ...RC_DEFAULT, length: 'tonpuu' });
    expect(summary(RC_RULES, RC_FIRST_OPTS, false)).toEqual(['东风战（约 4 局）', '3 张红 5 算宝牌']);
    expect(summary(RC_RULES, RC_FIRST_OPTS, true)).toEqual(['一局一结', '3 张红 5 算宝牌']);
    expect(editable(RC_RULES, true, RC_FIRST_OPTS)).toEqual([]);
  });
});
