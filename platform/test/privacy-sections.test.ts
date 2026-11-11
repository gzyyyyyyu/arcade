import { describe, expect, it } from 'vitest';
import { PRIVACY_SECTIONS } from '../src/pages/privacy/privacy-sections.ts';

describe('隐私说明分节（一屏放下，按小节分页）', () => {
  it('小节和条目的 id 不重复（翻页和页签靠它们认）', () => {
    expect(new Set(PRIVACY_SECTIONS.map((s) => s.id)).size).toBe(PRIVACY_SECTIONS.length);
    for (const s of PRIVACY_SECTIONS) expect(new Set(s.blocks.map((b) => b.id)).size, s.id).toBe(s.blocks.length);
  });

  it('每节都有条目，页签名短到手机上一行放得下', () => {
    for (const s of PRIVACY_SECTIONS) {
      expect(s.blocks.length, s.id).toBeGreaterThan(0);
      expect(s.name.length, s.id).toBeLessThanOrEqual(5);
    }
  });

  it('"积分和筹码"那几条（所有游戏适用）都在，并且是单独的一节', () => {
    const coins = PRIVACY_SECTIONS.find((s) => s.id === 'coins');
    expect(coins?.blocks).toHaveLength(5);
  });

  it('只有第一条是"不放广告"的承诺', () => {
    const promises = PRIVACY_SECTIONS.flatMap((s) => s.blocks.filter((b) => b.promise));
    expect(promises).toHaveLength(1);
    expect(PRIVACY_SECTIONS[0]!.blocks[0]!.promise).toBe(true);
  });
});
