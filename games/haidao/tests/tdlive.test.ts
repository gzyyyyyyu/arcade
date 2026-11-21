import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/core/index.ts';
import { createTd, runTdBot, tdFingerprint } from '../src/core/index.ts';
import { LIVE_TABLE } from '../src/content/livetable.ts';
import { LIVE_MAX_BP, LIVE_TIER_IDS, livePick } from '../src/core/live.ts';
import { TD_LIVE_ZERO_MAX_BP, tdLiveBp, tdLiveSetup } from '../src/core/tdlive.ts';

/** 悬赏守岛（实盘）的档位表、倍数和模板（src/core/tdlive.ts、src/content/tdlive.ts） */

describe('悬赏守岛：倍数表', () => {
  it('0 星按撑过的波数折算：0 波 0、撑满是 bp[0]，随波数单调往上，前几波的折算比线性多', () => {
    for (const t of LIVE_TIER_IDS) {
      const full = livePick('td', t, 0).bp[0];
      expect(tdLiveBp(t, 0, { stars: 0, waves: 0, total: 10 })).toBe(0);
      expect(tdLiveBp(t, 0, { stars: 0, waves: 10, total: 10 })).toBe(full);
      expect(tdLiveBp(t, 0, { stars: 0, waves: 5, total: 10 })).toBeGreaterThan(Math.floor(full / 2));
      for (let w = 1; w <= 10; w++) expect(tdLiveBp(t, 0, { stars: 0, waves: w, total: 10 })).toBeGreaterThanOrEqual(tdLiveBp(t, 0, { stars: 0, waves: w - 1, total: 10 }));
      expect(tdLiveBp(t, 0, { stars: 0, waves: 99, total: 10 })).toBeLessThanOrEqual(TD_LIVE_ZERO_MAX_BP);
      expect(tdLiveBp(t, 0, { stars: 0, waves: 3, total: 0 })).toBeLessThanOrEqual(TD_LIVE_ZERO_MAX_BP);
    }
  });

  it('1–3 星查表，星数越界按边界算', () => {
    for (const t of LIVE_TIER_IDS) {
      const bp = livePick('td', t, 0).bp;
      for (const s of [1, 2, 3]) expect(tdLiveBp(t, 0, { stars: s, waves: 1, total: 10 })).toBe(bp[s]);
      expect(tdLiveBp(t, 0, { stars: 9, waves: 1, total: 10 })).toBe(bp[3]);
      expect(tdLiveBp(t, 0, { stars: -1, waves: 5, total: 10 })).toBe(tdLiveBp(t, 0, { stars: 0, waves: 5, total: 10 }));
    }
  });
});

describe('悬赏守岛：模板', () => {
  it('只由档位和种子决定：同种子同布局，奇偶种子互为左右镜像', () => {
    for (const t of LIVE_TIER_IDS) {
      expect(tdLiveSetup(t, 7)).toEqual(tdLiveSetup(t, 7));
      const a = tdLiveSetup(t, 2);
      const b = tdLiveSetup(t, 3);
      expect(a.layout.length).toBe(b.layout.length);
      expect(a.level.lanes[0]!.x + b.level.lanes[0]!.x).toBe(21);
      a.layout.forEach((p, i) => expect(p.x + b.layout[i]!.x + BUILDINGS[p.kind].size).toBe(22));
    }
  });

  it('岛的内容（[宝藏箱, 常驻塔, 临时塔位]）按池里每座岛对，落潮从中档起，只有豪华档有首领波', () => {
    const want: Record<string, readonly number[]> = {
      small: [1, 4, 4], 'small-b': [1, 4, 4], mid: [1, 6, 5], 'mid-b': [1, 6, 5],
      big: [2, 8, 5], 'big-b': [2, 8, 5], lux: [3, 8, 4], 'lux-b': [2, 8, 4],
    };
    for (const t of LIVE_TIER_IDS) {
      for (const { level } of LIVE_TABLE.td[t].pool) {
        // 正反镜像各挑一个抽到这座岛的种子
        for (const mirror of [0, 1]) {
          let seed = mirror;
          while (livePick('td', t, seed).level !== level) seed += 2;
          const s = createTd(tdLiveSetup(t, seed));
          expect([s.treasures.length, s.towers.length, s.slots.length], level).toEqual(want[level]);
          expect(!!s.level.tide, level).toBe(t !== 'small');
          expect(s.level.waves.some((w) => w.boss), level).toBe(t === 'lux');
        }
      }
    }
  });

  it('模板能跑完一局：两种机器人、两个朝向，星数合法，同种子同结果', () => {
    for (const t of LIVE_TIER_IDS) {
      for (const seed of [1, 2]) {
        for (const kind of ['novice', 'normal'] as const) {
          const a = runTdBot(tdLiveSetup(t, seed), kind);
          const b = runTdBot(tdLiveSetup(t, seed), kind);
          expect(a.result.over).toBe(true);
          expect(a.result.stars).toBeGreaterThanOrEqual(0);
          expect(a.result.stars).toBeLessThanOrEqual(3);
          expect(a.result).toEqual(b.result);
          expect(tdFingerprint(a.state)).toBe(tdFingerprint(b.state));
          expect(tdLiveBp(t, seed, a.result)).toBeLessThanOrEqual(LIVE_MAX_BP);
        }
      }
    }
  }, 85_000); // 负载 28–32、maxWorkers=1 实测 20.0 秒，取 4 倍

  it('普通机器人比小白星数高（每档 12 局）', () => {
    for (const t of LIVE_TIER_IDS) {
      const avg = (kind: 'novice' | 'normal'): number => {
        let sum = 0;
        for (let seed = 1; seed <= 12; seed++) sum += runTdBot(tdLiveSetup(t, seed), kind).result.stars;
        return sum / 12;
      };
      expect(avg('normal')).toBeGreaterThan(avg('novice'));
    }
    // 4 档 × 2 种机器人 × 12 局 = 96 局整局模拟；空闲时单局 65–170 毫秒（live-sim --kind td 实测），整条 6–16 秒，
    // 发布脚本跑整套时机器负载 30+、单局慢到 4–5 倍，60 秒会超时；留到 4 分钟
  }, 240_000);
});
