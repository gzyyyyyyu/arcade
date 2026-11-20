import { describe, expect, it } from 'vitest';
import { buildLevel, TD2_LEVEL_DEFS } from '../src/content/tdmaps.ts';
import { createTd, runTdBot, tdFingerprint, tdGrowthSetup } from '../src/core/index.ts';
import type { TdSetup } from '../src/core/index.ts';
import { openerText } from '../src/view/td-ui.ts';

const setupOf = (id: string, seed: number): TdSetup => {
  const r = tdGrowthSetup(id, 'suggest', seed);
  if (!r.ok) throw new Error(`${id}: ${r.error}`);
  return r.value;
};

// 开局造法（TdLevel.opener）：第一张预告卡写先造什么、木台标金圈。只是给画面的提示，规则和机器人不读、不进指纹
const withOpener = TD2_LEVEL_DEFS.filter((d) => d.opener);

describe('开局造法', () => {
  it('写的都是这一关真有的、没被沉船压着的木台，塔在建议养成下造得了，木台不重复', () => {
    expect(withOpener.length).toBeGreaterThan(0);
    for (const d of withOpener) {
      const s = createTd(setupOf(d.id, 1));
      const slots = d.opener!.map(([i]) => i);
      expect(new Set(slots).size, d.id).toBe(slots.length);
      for (const [i, k] of d.opener!) {
        expect(i, d.id).toBeLessThan(d.pads);
        expect(d.wrecks?.includes(i) ?? false, `${d.id} 木台 ${i}`).toBe(false);
        expect(s.unlocked, `${d.id} ${k}`).toContain(k);
      }
    }
  });

  it('关卡岛带上开局造法；开局指纹和不写时一样，td11 整局结果也一样（各关整局由 td-golden.json 锁住）', () => {
    for (const d of withOpener) {
      expect(buildLevel(d).opener).toEqual(d.opener!.map(([slot, kind]) => ({ slot, kind })));
      const st = setupOf(d.id, 3);
      const plain = { ...st, level: { ...st.level, opener: undefined } };
      expect(tdFingerprint(createTd(st)), d.id).toBe(tdFingerprint(createTd(plain)));
    }
    const st = setupOf('td11', 3);
    expect(runTdBot(st, 'guided').result).toEqual(runTdBot({ ...st, level: { ...st.level, opener: undefined } }, 'guided').result);
  });

  it('文字按塔合并、保持顺序', () => {
    expect(openerText([{ kind: 'gunTower' }, { kind: 'mortar' }])).toBe('先造：火枪塔、臼炮');
    expect(openerText([{ kind: 'gunTower' }, { kind: 'gunTower' }, { kind: 'mortar' }])).toBe('先造：火枪塔 ×2、臼炮');
  });
});
