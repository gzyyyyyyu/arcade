import { describe, expect, it } from 'vitest';
import { LIVE_SKILL_BP, vigilBp, type LiveTier } from '../../src/content/live.ts';
import type { CharacterId } from '../../src/content/meta.ts';
import type { MapId } from '../../src/content/maps.ts';

describe('0.18.0 实盘同池后压回的格子（规则 51）', () => {
  // [档, 图, 角色, 规则 50 天亮, 规则 50 打倒尸王, 规则 50 第 10 分钟倒下, 规则 51 组合系数]：前三个数取自 0.17.17 线上
  const CELLS: [LiveTier, MapId, CharacterId, number, number, number, number][] = [
    ['small', 'riverbank', 'huolang', 14082, 16082, 3098, 10200],
    ['small', 'yizhuang', 'huolang', 14082, 16082, 3098, 10300],
    ['small', 'temple', 'huolang', 13721, 15721, 3018, 10200],
    ['small', 'guishi', 'huolang', 13961, 15961, 3071, 10300],
    ['medium', 'icelake', 'xiaodao', 13344, 15344, 5871, 9400],
    ['medium', 'icelake', 'huolang', 13210, 15210, 5812, 8100],
    ['medium', 'yizhuang', 'huolang', 14999, 16999, 6599, 9500],
    ['medium', 'temple', 'zhijiang', 17408, 19408, 7659, 10500],
    ['medium', 'guishi', 'huolang', 15412, 17412, 6781, 9700],
    ['large', 'bamboo', 'huolang', 12949, 14949, 5697, 7200],
    ['large', 'icelake', 'xiaodao', 12972, 14972, 5707, 9000],
    ['large', 'icelake', 'huolang', 13231, 15231, 5821, 7700],
    ['large', 'riverbank', 'xiaodao', 13938, 15938, 6132, 8600],
    ['large', 'riverbank', 'huolang', 14216, 16216, 6255, 8500],
    ['large', 'yizhuang', 'huolang', 14779, 16779, 6502, 8800],
    ['large', 'temple', 'zhijiang', 17760, 19760, 7814, 10600],
    ['luxe', 'bamboo', 'huolang', 11215, 13215, 8512, 7300],
    ['luxe', 'icelake', 'xiaodao', 14268, 16268, 10829, 9400],
    ['luxe', 'icelake', 'fushi', 12413, 14413, 9421, 8200],
    ['luxe', 'icelake', 'jianxia', 11985, 13985, 9096, 9000],
    ['luxe', 'icelake', 'pang', 11129, 13129, 8446, 8500],
    ['luxe', 'icelake', 'huolang', 11316, 13316, 8588, 7600],
    ['luxe', 'riverbank', 'xiaodao', 13776, 15776, 10455, 9400],
    ['luxe', 'riverbank', 'jianxia', 11571, 13571, 8782, 8500],
    ['luxe', 'riverbank', 'pang', 10745, 12745, 8155, 6700],
    ['luxe', 'yizhuang', 'jianxia', 12088, 14088, 9174, 8300],
  ];

  it('规则 ≤50 开的局结回逐位不变', () => {
    for (const [t, m, c, dawn, boss, mid] of CELLS) {
      expect([vigilBp(t, 0, true, false, c, m, 50), vigilBp(t, 0, true, true, c, m, 50), vigilBp(t, 18_000, false, false, c, m, 50)], `${t} ${m} ${c}`).toEqual([dawn, boss, mid]);
    }
  });

  it('规则 51 起天亮按新组合系数结，比规则 50 少', () => {
    for (const [t, m, c, dawn, , , k] of CELLS) {
      // 规则 54 又压了一部分格子，这里钉在规则 53
      const now = vigilBp(t, 0, true, false, c, m, 53);
      expect(now, `${t} ${m} ${c}`).toBe(Math.floor((LIVE_SKILL_BP.dawn[t]! * k) / 10_000));
      expect(now, `${t} ${m} ${c}`).toBeLessThan(dawn);
      expect(vigilBp(t, 0, true, false, c, m, 51)).toBe(now);
    }
  });
});
