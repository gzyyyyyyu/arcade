import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/core/index.ts';
import { createTd, runTdBot, tdFingerprint } from '../src/core/index.ts';
import { LIVE_MAX_BP, LIVE_TIERS, LIVE_TIER_IDS } from '../src/core/live.ts';
import { TD_LIVE_TIERS, TD_LIVE_ZERO_MAX_BP, tdLiveBp, tdLiveSetup } from '../src/core/tdlive.ts';

/** 悬赏守岛（实盘）的档位表、倍数和模板（src/core/tdlive.ts、src/content/tdlive.ts） */

describe('悬赏守岛：倍数表', () => {
  it('stake 和悬赏出海是同一份钱包金额', () => {
    for (const t of LIVE_TIER_IDS) expect(TD_LIVE_TIERS[t].stake).toBe(LIVE_TIERS[t].stake);
  });

  it('同档星越多倍数越高，0 星最多 0.79 份，一场最多赢 3 份', () => {
    for (const t of LIVE_TIER_IDS) {
      const bp = TD_LIVE_TIERS[t].bp;
      expect(bp[0]).toBeLessThanOrEqual(TD_LIVE_ZERO_MAX_BP);
      expect(bp[0]).toBeLessThan(bp[1]);
      expect(bp[1]).toBeLessThan(bp[2]);
      expect(bp[2]).toBeLessThan(bp[3]);
      expect(Math.max(...bp)).toBeLessThanOrEqual(LIVE_MAX_BP);
    }
  });

  it('档越高 3 星倍数不降', () => {
    for (let i = 1; i < LIVE_TIER_IDS.length; i++) {
      expect(TD_LIVE_TIERS[LIVE_TIER_IDS[i]!].bp[3]).toBeGreaterThanOrEqual(TD_LIVE_TIERS[LIVE_TIER_IDS[i - 1]!].bp[3]);
    }
  });

  it('0 星按撑过的波数折算：0 波 0、撑满是 bp[0]，随波数单调往上，前几波的折算比线性多', () => {
    for (const t of LIVE_TIER_IDS) {
      const full = TD_LIVE_TIERS[t].bp[0];
      expect(tdLiveBp(t, { stars: 0, waves: 0, total: 10 })).toBe(0);
      expect(tdLiveBp(t, { stars: 0, waves: 10, total: 10 })).toBe(full);
      expect(tdLiveBp(t, { stars: 0, waves: 5, total: 10 })).toBeGreaterThan(Math.floor(full / 2));
      for (let w = 1; w <= 10; w++) expect(tdLiveBp(t, { stars: 0, waves: w, total: 10 })).toBeGreaterThanOrEqual(tdLiveBp(t, { stars: 0, waves: w - 1, total: 10 }));
      expect(tdLiveBp(t, { stars: 0, waves: 99, total: 10 })).toBeLessThanOrEqual(TD_LIVE_ZERO_MAX_BP);
      expect(tdLiveBp(t, { stars: 0, waves: 3, total: 0 })).toBeLessThanOrEqual(TD_LIVE_ZERO_MAX_BP);
    }
  });

  it('1–3 星查表，星数越界按边界算', () => {
    for (const t of LIVE_TIER_IDS) {
      const bp = TD_LIVE_TIERS[t].bp;
      for (const s of [1, 2, 3]) expect(tdLiveBp(t, { stars: s, waves: 1, total: 10 })).toBe(bp[s]);
      expect(tdLiveBp(t, { stars: 9, waves: 1, total: 10 })).toBe(bp[3]);
      expect(tdLiveBp(t, { stars: -1, waves: 5, total: 10 })).toBe(tdLiveBp(t, { stars: 0, waves: 5, total: 10 }));
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

  it('岛的内容：宝藏箱 1/1/2/3、常驻塔 4/6/8/8、临时塔位 4/5/5/4，落潮从中档起，只有豪华档有首领波', () => {
    const want = { small: [1, 4, 4], mid: [1, 6, 5], big: [2, 8, 5], lux: [3, 8, 4] } as const;
    for (const t of LIVE_TIER_IDS) {
      for (const seed of [1, 2]) {
        const s = createTd(tdLiveSetup(t, seed));
        expect([s.treasures.length, s.towers.length, s.slots.length]).toEqual(want[t]);
        expect(!!s.level.tide).toBe(t !== 'small');
        expect(s.level.waves.some((w) => w.boss)).toBe(t === 'lux');
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
          expect(tdLiveBp(t, a.result)).toBeLessThanOrEqual(LIVE_MAX_BP);
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
    // 4 档 × 2 种机器人 × 12 局 = 96 局整局模拟；空闲时单局 65–170 毫秒（td-live-sim 实测），整条 6–16 秒，
    // 发布脚本跑整套时机器负载 30+、单局慢到 4–5 倍，60 秒会超时；留到 4 分钟
  }, 240_000);
});
