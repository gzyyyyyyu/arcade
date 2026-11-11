import { describe, expect, it } from 'vitest';
import { CAMPAIGN } from '../src/content/index.ts';
import { HINT_MAX, HINT_ORDER, hintAllowed, hintText, newDefenses, parseSeen } from '../src/view/battlehint.ts';

describe('新防御首次提示', () => {
  it('只出没见过的，已见过的不再出', () => {
    expect(newDefenses(['mortar', 'cannon'], new Set())).toEqual(['mortar']);
    expect(newDefenses(['mortar'], new Set(['mortar']))).toEqual([]);
  });
  it('最多 2 个，按固定顺序，没出的留给下一局', () => {
    const all = [...HINT_ORDER].reverse();
    const a = newDefenses(all, new Set());
    expect(a).toEqual(HINT_ORDER.slice(0, HINT_MAX));
    expect(newDefenses(all, new Set(a))[0]).toBe(HINT_ORDER[HINT_MAX]);
  });
  it('每种都有说明、不超 30 字', () => {
    for (const k of HINT_ORDER) {
      const t = hintText(k);
      expect(t.length).toBeGreaterThan(0);
      expect(t.length).toBeLessThanOrEqual(30);
    }
  });
  it('首领关、机器人、回放 / 异步攻防、航线、悬赏都不出', () => {
    const d = { auto: false };
    expect(hintAllowed(d, false)).toBe(true);
    expect(hintAllowed(d, true)).toBe(false);
    expect(hintAllowed({ auto: true }, false)).toBe(false);
    expect(hintAllowed({ auto: false, pvp: { replay: {} } }, false)).toBe(false);
    expect(hintAllowed({ auto: false, map: {} }, false)).toBe(false);
    expect(hintAllowed({ auto: false, bounty: true }, false)).toBe(false);
  });
  it('存储坏数据当空；战役里首领关都能认出来', () => {
    expect(parseSeen(null).size).toBe(0);
    expect(parseSeen('{oops').size).toBe(0);
    expect([...parseSeen('["mine",3]')]).toEqual(['mine']);
    expect(CAMPAIGN.some((l) => l.boss)).toBe(true);
  });
});
