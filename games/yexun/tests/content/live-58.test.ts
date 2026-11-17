import { describe, expect, it } from 'vitest';
import { raidCharCoef, type RaidLiveTemplate, type RaidLiveTier } from '../../src/content/explore.ts';
import { LIVE_SKILL_BP, vigilBp, type LiveTier } from '../../src/content/live.ts';
import type { CharacterId } from '../../src/content/meta.ts';
import type { MapId } from '../../src/content/maps.ts';

describe('0.21.1 规则 57 的内容进实盘、目标带 +0.15 后抬的格子（规则 58）', () => {
  // [档, 图, 角色, 规则 57 天亮, 规则 57 打倒尸王, 规则 57 第 10 分钟倒下, 规则 58 组合系数]：前三个数取自 0.21.0 线上
  const CELLS: [LiveTier, MapId, CharacterId, number, number, number, number][] = [
    ['small', 'snow', 'xiaodao', 11800, 13800, 2596, 10900],
    ['small', 'snow', 'fushi', 12390, 14390, 2725, 11400],
    ['small', 'snow', 'jianxia', 11682, 13682, 2570, 10700],
    ['small', 'snow', 'pang', 11210, 13210, 2466, 10600],
    ['small', 'snow', 'gengfu', 11564, 13564, 2544, 10700],
    ['small', 'snow', 'caiyao', 11446, 13446, 2518, 10800],
    ['small', 'snow', 'zhijiang', 12390, 14390, 2725, 10900],
    ['small', 'snow', 'huolang', 12036, 14036, 2647, 10700],
    ['small', 'snow', 'yinyang', 12036, 14036, 2647, 10600],
    ['small', 'bamboo', 'xiaodao', 11682, 13682, 2570, 10800],
    ['small', 'bamboo', 'fushi', 12266, 14266, 2698, 11500],
    ['small', 'bamboo', 'jianxia', 11565, 13565, 2544, 10800],
    ['small', 'bamboo', 'pang', 11210, 13210, 2466, 10600],
    ['small', 'bamboo', 'gengfu', 11682, 13682, 2570, 10600],
    ['small', 'bamboo', 'caiyao', 11800, 13800, 2596, 10500],
    ['small', 'bamboo', 'zhijiang', 12266, 14266, 2698, 10700],
    ['small', 'bamboo', 'huolang', 11915, 13915, 2621, 10800],
    ['small', 'bamboo', 'yinyang', 11915, 13915, 2621, 10800],
    ['small', 'icelake', 'xiaodao', 11328, 13328, 2492, 10500],
    ['small', 'icelake', 'fushi', 11894, 13894, 2616, 11100],
    ['small', 'icelake', 'jianxia', 11214, 13214, 2467, 10700],
    ['small', 'icelake', 'pang', 10648, 12648, 2342, 10500],
    ['small', 'icelake', 'gengfu', 11101, 13101, 2442, 10700],
    ['small', 'icelake', 'caiyao', 10761, 12761, 2367, 10800],
    ['small', 'icelake', 'zhijiang', 11894, 13894, 2616, 10700],
    ['small', 'icelake', 'huolang', 11554, 13554, 2541, 10600],
    ['small', 'icelake', 'yinyang', 11554, 13554, 2541, 10600],
    ['small', 'riverbank', 'jianxia', 12390, 14390, 2725, 12700],
    ['small', 'riverbank', 'pang', 12036, 14036, 2647, 12600],
    ['small', 'riverbank', 'gengfu', 12626, 14626, 2777, 12600],
    ['small', 'riverbank', 'caiyao', 12036, 14036, 2647, 11700],
    ['small', 'riverbank', 'zhijiang', 12390, 14390, 2725, 12600],
    ['small', 'riverbank', 'huolang', 12036, 14036, 2647, 11400],
    ['small', 'yizhuang', 'jianxia', 12390, 14390, 2725, 11300],
    ['small', 'yizhuang', 'pang', 11682, 13682, 2570, 10900],
    ['small', 'yizhuang', 'gengfu', 12980, 14980, 2855, 11200],
    ['small', 'yizhuang', 'caiyao', 11918, 13918, 2621, 11000],
    ['small', 'yizhuang', 'huolang', 12154, 14154, 2673, 10700],
    ['small', 'temple', 'jianxia', 12390, 14390, 2725, 12600],
    ['small', 'temple', 'pang', 12390, 14390, 2725, 12600],
    ['small', 'temple', 'caiyao', 11918, 13918, 2621, 12000],
    ['small', 'temple', 'huolang', 12036, 14036, 2647, 11400],
    ['small', 'guishi', 'jianxia', 12626, 14626, 2777, 12100],
    ['small', 'guishi', 'pang', 12036, 14036, 2647, 11200],
    ['small', 'guishi', 'gengfu', 12390, 14390, 2725, 11900],
    ['small', 'guishi', 'caiyao', 11682, 13682, 2570, 10800],
    ['small', 'guishi', 'huolang', 12154, 14154, 2673, 10600],
    ['medium', 'snow', 'huolang', 11259, 13259, 4953, 8600],
    ['medium', 'bamboo', 'xiaodao', 10842, 12842, 4770, 8700],
    ['medium', 'bamboo', 'pang', 11092, 13092, 4880, 8400],
    ['medium', 'bamboo', 'gengfu', 12412, 14412, 5461, 9300],
    ['medium', 'bamboo', 'zhijiang', 11120, 13120, 4892, 8800],
    ['medium', 'bamboo', 'huolang', 10981, 12981, 4831, 8200],
    ['medium', 'bamboo', 'yinyang', 10564, 12564, 4648, 8300],
    ['medium', 'icelake', 'pang', 11208, 13208, 4931, 8100],
    ['medium', 'icelake', 'gengfu', 12543, 14543, 5518, 9300],
    ['medium', 'icelake', 'zhijiang', 11954, 13954, 5259, 8700],
    ['medium', 'icelake', 'huolang', 11259, 13259, 4953, 8400],
    ['medium', 'riverbank', 'gengfu', 13588, 15588, 5978, 12600],
    ['medium', 'riverbank', 'caiyao', 14022, 16022, 6169, 12000],
    ['medium', 'temple', 'caiyao', 14595, 16595, 6421, 12100],
    ['medium', 'temple', 'yinyang', 13483, 15483, 5932, 11500],
    ['large', 'snow', 'zhijiang', 10488, 12488, 4614, 8000],
    ['large', 'snow', 'yinyang', 10488, 12488, 4614, 7900],
    ['large', 'bamboo', 'gengfu', 11807, 13807, 5195, 9700],
    ['large', 'bamboo', 'zhijiang', 9384, 11384, 4128, 7900],
    ['large', 'bamboo', 'huolang', 9936, 11936, 4371, 7600],
    ['large', 'bamboo', 'yinyang', 9384, 11384, 4128, 7700],
    ['large', 'icelake', 'gengfu', 12063, 14063, 5307, 10200],
    ['large', 'icelake', 'caiyao', 12282, 14282, 5404, 9000],
    ['large', 'icelake', 'huolang', 10626, 12626, 4675, 8000],
    ['large', 'riverbank', 'xiaodao', 11868, 13868, 5221, 10100],
    ['large', 'riverbank', 'caiyao', 13938, 15938, 6132, 12800],
    ['large', 'riverbank', 'zhijiang', 11592, 13592, 5100, 10300],
    ['large', 'temple', 'caiyao', 14628, 16628, 6436, 12300],
    ['large', 'temple', 'zhijiang', 12282, 14282, 5404, 11300],
    ['large', 'guishi', 'gengfu', 13732, 15732, 6042, 11900],
    ['luxe', 'snow', 'caiyao', 10947, 12947, 8308, 9600],
    ['luxe', 'snow', 'zhijiang', 9348, 11348, 7095, 9100],
    ['luxe', 'snow', 'huolang', 8979, 10979, 6815, 7900],
    ['luxe', 'bamboo', 'gengfu', 11330, 13330, 8599, 11400],
    ['luxe', 'bamboo', 'caiyao', 10290, 12290, 7810, 9700],
    ['luxe', 'icelake', 'xiaodao', 11562, 13562, 8775, 9500],
    ['luxe', 'icelake', 'yinyang', 9131, 11131, 6930, 8300],
    ['luxe', 'riverbank', 'jianxia', 10455, 12455, 7935, 10900],
    ['luxe', 'riverbank', 'pang', 8241, 10241, 6254, 9200],
    ['luxe', 'riverbank', 'gengfu', 13500, 15500, 10246, 13700],
    ['luxe', 'riverbank', 'caiyao', 12260, 14260, 9305, 13300],
    ['luxe', 'riverbank', 'zhijiang', 10578, 12578, 8028, 10800],
    ['luxe', 'riverbank', 'yinyang', 10578, 12578, 8028, 10800],
    ['luxe', 'yizhuang', 'pang', 8979, 10979, 6815, 8200],
    ['luxe', 'temple', 'caiyao', 11931, 13931, 9055, 13200],
    ['luxe', 'temple', 'zhijiang', 10947, 12947, 8308, 11700],
    ['luxe', 'guishi', 'caiyao', 13355, 15355, 10136, 11700],
  ];

  it('规则 ≤57 开的局结回逐位不变', () => {
    for (const [t, m, c, dawn, boss, mid] of CELLS) {
      expect([vigilBp(t, 0, true, false, c, m, 57), vigilBp(t, 0, true, true, c, m, 57), vigilBp(t, 18_000, false, false, c, m, 57)], `${t} ${m} ${c}`).toEqual([dawn, boss, mid]);
    }
  });

  it('规则 58 起天亮按新组合系数结，比规则 57 多', () => {
    for (const [t, m, c, dawn, , , k] of CELLS) {
      const now = vigilBp(t, 0, true, false, c, m, 58);
      expect(now, `${t} ${m} ${c}`).toBe(Math.floor((LIVE_SKILL_BP.dawn[t]! * k) / 10_000));
      expect(now, `${t} ${m} ${c}`).toBeGreaterThan(dawn);
    }
  });

  // 夜探角色系数不跟规则版本走（撤出时按当时的系数结），只锁新值；0.27.0 又改过的格子在 live-64.test.ts 里锁
  const RAID: [RaidLiveTier, RaidLiveTemplate, CharacterId, number][] = [
    ['small', 'guzhen', 'caiyao', 10000],
    ['small', 'shansi', 'jianxia', 9400],
    ['small', 'shansi', 'huolang', 10600],
    ['small', 'xilou', 'huolang', 11000],
    ['small', 'liangcang', 'pang', 9900],
    ['small', 'liangcang', 'gengfu', 11500],
    ['medium', 'guzhen', 'huolang', 10400],
    ['medium', 'dukou', 'huolang', 10500],
    ['medium', 'shansi', 'huolang', 9900],
    ['medium', 'xilou', 'huolang', 10400],
    ['medium', 'liangcang', 'huolang', 10400],
    ['large', 'guzhen', 'huolang', 10200],
    ['large', 'dukou', 'fushi', 8600],
    ['large', 'dukou', 'huolang', 11400],
    ['large', 'shansi', 'huolang', 9200],
    ['large', 'xilou', 'fushi', 8700],
    ['large', 'xilou', 'gengfu', 9500],
    ['large', 'xilou', 'huolang', 9600],
    ['large', 'liangcang', 'pang', 9000],
    ['large', 'liangcang', 'huolang', 11300],
  ];
  it('夜探抬过的格子是新系数', () => {
    for (const [t, tp, c, k] of RAID) expect(raidCharCoef(c, t, tp), `${t} ${tp} ${c}`).toBe(k);
  });
});
