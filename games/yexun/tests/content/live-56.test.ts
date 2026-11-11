import { describe, expect, it } from 'vitest';
import { LIVE_SKILL_BP, vigilBp, type LiveTier } from '../../src/content/live.ts';
import type { CharacterId } from '../../src/content/meta.ts';
import type { MapId } from '../../src/content/maps.ts';

describe('0.20.2 规则 55 的新内容进实盘后压回的格子（规则 56）', () => {
  // [档, 图, 角色, 规则 55 天亮, 规则 55 打倒尸王, 规则 55 第 10 分钟倒下, 规则 56 组合系数]：前三个数取自 0.20.1 线上
  const CELLS: [LiveTier, MapId, CharacterId, number, number, number, number][] = [
    ['medium', 'icelake', 'xiaodao', 12788, 14788, 5626, 9000],
    ['large', 'icelake', 'xiaodao', 12282, 14282, 5404, 8700],
    ['large', 'icelake', 'caiyao', 12420, 14420, 5464, 8900],
    ['large', 'temple', 'fushi', 17222, 19222, 7577, 10400],
    ['luxe', 'yizhuang', 'xiaodao', 14391, 16391, 10922, 10100],
    ['luxe', 'yizhuang', 'fushi', 12520, 14520, 9502, 8800],
    ['luxe', 'yizhuang', 'pang', 11224, 13224, 8519, 7300],
    ['luxe', 'temple', 'fushi', 13407, 15407, 10175, 8800],
    ['medium', 'yizhuang', 'yinyang', 14696, 16696, 6466, 9100],
    ['luxe', 'guishi', 'yinyang', 12915, 14915, 9802, 8700],
  ];

  it('规则 ≤55 开的局结回逐位不变', () => {
    for (const [t, m, c, dawn, boss, mid] of CELLS) {
      expect([vigilBp(t, 0, true, false, c, m, 55), vigilBp(t, 0, true, true, c, m, 55), vigilBp(t, 18_000, false, false, c, m, 55)], `${t} ${m} ${c}`).toEqual([dawn, boss, mid]);
    }
  });

  it('规则 56 起天亮按新组合系数结，比规则 55 少', () => {
    for (const [t, m, c, dawn, , , k] of CELLS) {
      // 规则 58 起抬过的格子另有表（live-58），这里看规则 56、57 的局
      const now = vigilBp(t, 0, true, false, c, m, 57);
      expect(now, `${t} ${m} ${c}`).toBe(Math.floor((LIVE_SKILL_BP.dawn[t]! * k) / 10_000));
      expect(now, `${t} ${m} ${c}`).toBeLessThan(dawn);
      expect(vigilBp(t, 0, true, false, c, m, 56)).toBe(now);
    }
  });
});
