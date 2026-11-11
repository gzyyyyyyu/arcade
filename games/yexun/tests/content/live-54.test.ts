import { describe, expect, it } from 'vitest';
import { LIVE_SKILL_BP, vigilBp, type LiveTier } from '../../src/content/live.ts';
import type { CharacterId } from '../../src/content/meta.ts';
import type { MapId } from '../../src/content/maps.ts';

describe('0.19.4 新怪和开局配置进实盘后压回的格子（规则 54）', () => {
  // [档, 图, 角色, 规则 50 天亮, 规则 50 打倒尸王, 规则 50 第 10 分钟倒下, 规则 51 组合系数]：前三个数取自 0.17.17 线上
  // [档, 图, 角色, 规则 53 天亮, 规则 53 打倒尸王, 规则 53 第 10 分钟倒下, 规则 54 组合系数]：前三个数取自 0.19.3 线上
  const CELLS: [LiveTier, MapId, CharacterId, number, number, number, number][] = [
    ['medium', 'snow', 'huolang', 13761, 15761, 6054, 8100],
    ['medium', 'bamboo', 'xiaodao', 13205, 15205, 5810, 7800],
    ['medium', 'bamboo', 'huolang', 13072, 15072, 5751, 7900],
    ['medium', 'icelake', 'xiaodao', 13066, 15066, 5749, 9200],
    ['medium', 'icelake', 'jianxia', 12676, 14676, 5577, 9000],
    ['medium', 'icelake', 'caiyao', 12943, 14943, 5694, 9100],
    ['medium', 'temple', 'fushi', 17236, 19236, 7583, 10200],
    ['large', 'snow', 'xiaodao', 13800, 15800, 6072, 8500],
    ['large', 'snow', 'huolang', 14076, 16076, 6193, 8100],
    ['large', 'bamboo', 'xiaodao', 12696, 14696, 5586, 8100],
    ['large', 'icelake', 'xiaodao', 12420, 14420, 5464, 8900],
    ['large', 'icelake', 'jianxia', 11804, 13804, 5193, 8500],
    ['large', 'icelake', 'caiyao', 12972, 14972, 5707, 9000],
    ['large', 'guishi', 'fushi', 14175, 16175, 6237, 8600],
    ['luxe', 'snow', 'huolang', 11931, 13931, 9055, 7300],
    ['luxe', 'icelake', 'jianxia', 11070, 13070, 8402, 8600],
    ['luxe', 'icelake', 'pang', 10455, 12455, 7935, 8300],
    ['luxe', 'temple', 'fushi', 15409, 17409, 11695, 10900],
    ['luxe', 'guishi', 'fushi', 13055, 15055, 9908, 8900],
    ['small', 'riverbank', 'zhijiang', 14496, 16496, 3189, 10500],
    ['medium', 'snow', 'zhijiang', 14039, 16039, 6177, 8500],
    ['medium', 'snow', 'yinyang', 13483, 15483, 5932, 8400],
    ['medium', 'bamboo', 'zhijiang', 13337, 15337, 5868, 8000],
    ['medium', 'bamboo', 'yinyang', 12808, 14808, 5635, 7600],
    ['medium', 'icelake', 'zhijiang', 13477, 15477, 5929, 8600],
    ['medium', 'riverbank', 'zhijiang', 14600, 16600, 6424, 9300],
    ['medium', 'riverbank', 'huolang', 14311, 16311, 6296, 8900],
    ['medium', 'yizhuang', 'zhijiang', 15302, 17302, 6732, 9400],
    ['medium', 'temple', 'huolang', 14595, 16595, 6421, 9100],
    ['medium', 'temple', 'yinyang', 16718, 18718, 7355, 9700],
    ['medium', 'guishi', 'zhijiang', 15723, 17723, 6918, 9400],
    ['medium', 'guishi', 'yinyang', 15100, 17100, 6644, 9500],
    ['large', 'snow', 'zhijiang', 13662, 15662, 6011, 7600],
    ['large', 'snow', 'yinyang', 13386, 15386, 5889, 7600],
    ['large', 'bamboo', 'zhijiang', 12569, 14569, 5530, 6800],
    ['large', 'bamboo', 'yinyang', 12315, 14315, 5418, 6800],
    ['large', 'icelake', 'zhijiang', 12842, 14842, 5650, 8500],
    ['large', 'icelake', 'yinyang', 12582, 14582, 5536, 8900],
    ['large', 'riverbank', 'zhijiang', 13798, 15798, 6071, 8400],
    ['large', 'yizhuang', 'zhijiang', 14345, 16345, 6311, 8800],
    ['large', 'yizhuang', 'yinyang', 14055, 16055, 6184, 8500],
    ['large', 'temple', 'zhijiang', 14628, 16628, 6436, 8900],
    ['large', 'temple', 'huolang', 14076, 16076, 6193, 8000],
    ['large', 'temple', 'yinyang', 17401, 19401, 7656, 9900],
    ['large', 'guishi', 'zhijiang', 14618, 16618, 6431, 8700],
    ['large', 'guishi', 'huolang', 13248, 15248, 5829, 8300],
    ['large', 'guishi', 'yinyang', 14323, 16323, 6302, 8700],
    ['luxe', 'snow', 'zhijiang', 12546, 14546, 9522, 7600],
    ['luxe', 'riverbank', 'zhijiang', 13653, 15653, 10362, 8600],
    ['luxe', 'riverbank', 'yinyang', 12300, 14300, 9335, 8600],
    ['luxe', 'yizhuang', 'yinyang', 13776, 15776, 10455, 9100],
    ['luxe', 'temple', 'zhijiang', 14346, 16346, 10888, 8900],
    ['luxe', 'temple', 'yinyang', 16974, 18974, 12883, 9800],
  ];

  it('规则 ≤53 开的局结回逐位不变', () => {
    for (const [t, m, c, dawn, boss, mid] of CELLS) {
      expect([vigilBp(t, 0, true, false, c, m, 53), vigilBp(t, 0, true, true, c, m, 53), vigilBp(t, 18_000, false, false, c, m, 53)], `${t} ${m} ${c}`).toEqual([dawn, boss, mid]);
    }
  });

  it('规则 54 起天亮按新组合系数结，比规则 53 少', () => {
    for (const [t, m, c, dawn, , , k] of CELLS) {
      // 钉在规则 55：规则 56 又压了其中几格（live-56.test.ts）
      const now = vigilBp(t, 0, true, false, c, m, 55);
      expect(now, `${t} ${m} ${c}`).toBe(Math.floor((LIVE_SKILL_BP.dawn[t]! * k) / 10_000));
      expect(now, `${t} ${m} ${c}`).toBeLessThan(dawn);
      expect(vigilBp(t, 0, true, false, c, m, 54)).toBe(now);
    }
  });
});
