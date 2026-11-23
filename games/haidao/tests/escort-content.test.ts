import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ESCORT_LIVE_LEVELS } from '../src/content/escortlivelevels.ts';
import { escortLiveSetup } from '../src/core/escortlive.ts';
import { LIVE_TIER_IDS, livePick } from '../src/core/live.ts';
import { ESCORT_LEVELS, ESCORT_LEVEL_BY_ID, ESCORT_MAPS } from '../src/content/index.ts';
import { ESCORT_DIFFS } from '../src/core/escorttypes.ts';
import { BEACH, ISLAND } from '../src/core/types.ts';
import { BUILDINGS } from '../src/content/index.ts';

const LO = -BEACH;
const HI = ISLAND + BEACH - 1;
/** 加农炮的射程（单位）：隘口附近的木台要在这个距离内才算"护得住" */
const REACH = 700;

const footprint = (x: number, y: number, size: number): string[] => {
  const out: string[] = [];
  for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) out.push(`${x + dx},${y + dy}`);
  return out;
};

describe('护航内容：图', () => {
  for (const m of ESCORT_MAPS) {
    describe(m.id, () => {
      it('航线 28–36 格、8 邻接、不越界、不重复', () => {
        expect(m.route.length).toBeGreaterThanOrEqual(28);
        expect(m.route.length).toBeLessThanOrEqual(36);
        const seen = new Set<string>();
        m.route.forEach((c, i) => {
          expect(c.x).toBeGreaterThanOrEqual(LO);
          expect(c.x).toBeLessThanOrEqual(HI);
          expect(c.y).toBeGreaterThanOrEqual(LO);
          expect(c.y).toBeLessThanOrEqual(HI);
          expect(seen.has(`${c.x},${c.y}`)).toBe(false);
          seen.add(`${c.x},${c.y}`);
          if (i > 0) {
            const p = m.route[i - 1]!;
            expect(Math.max(Math.abs(c.x - p.x), Math.abs(c.y - p.y))).toBe(1);
          }
        });
      });

      it('航线不压木台、主寨、装饰，也不放宝藏箱', () => {
        const used = new Set<string>();
        for (const p of m.pads) footprint(p.x, p.y, 2).forEach((k) => used.add(k));
        for (const b of m.layout) footprint(b.x, b.y, BUILDINGS[b.kind].size).forEach((k) => used.add(k));
        for (const c of m.route) expect(used.has(`${c.x},${c.y}`)).toBe(false);
        expect(m.layout.some((b) => b.kind === 'treasure')).toBe(false);
      });

      it('木台 8–12 个，在岛内、互不重叠、不压主寨和装饰', () => {
        expect(m.pads.length).toBeGreaterThanOrEqual(8);
        expect(m.pads.length).toBeLessThanOrEqual(12);
        const used = new Set<string>();
        for (const b of m.layout) footprint(b.x, b.y, BUILDINGS[b.kind].size).forEach((k) => used.add(k));
        for (const p of m.pads) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.x + 2).toBeLessThanOrEqual(ISLAND);
          expect(p.y + 2).toBeLessThanOrEqual(ISLAND);
          for (const k of footprint(p.x, p.y, 2)) {
            expect(used.has(k)).toBe(false);
            used.add(k);
          }
        }
        for (const k of m.kegs) expect(used.has(`${k.x},${k.y}`)).toBe(false);
      });

      it('隘口 3–4 个、升序、在航线内', () => {
        expect(m.gates.length).toBeGreaterThanOrEqual(3);
        expect(m.gates.length).toBeLessThanOrEqual(4);
        m.gates.forEach((g, i) => {
          expect(g).toBeGreaterThanOrEqual(0);
          expect(g).toBeLessThan(m.route.length);
          if (i > 0) expect(g).toBeGreaterThan(m.gates[i - 1]!);
        });
      });

      it('登陆口、落潮路在海滩上，不在航线上', () => {
        const route = new Set(m.route.map((c) => `${c.x},${c.y}`));
        for (const l of [...m.lanes, ...(m.tide ? [m.tide] : [])]) {
          expect(l.x >= LO && l.x <= HI && l.y >= LO && l.y <= HI).toBe(true);
          expect(l.x < 0 || l.y < 0 || l.x >= ISLAND || l.y >= ISLAND).toBe(true);
          expect(route.has(`${l.x},${l.y}`)).toBe(false);
        }
      });
    });
  }
});

describe('护航内容：9 关', () => {
  it('3 图 × 3 档都在，id 是 <图>-<难度>', () => {
    expect(ESCORT_LEVELS).toHaveLength(9);
    for (const m of ESCORT_MAPS) for (const d of ESCORT_DIFFS) expect(ESCORT_LEVEL_BY_ID.get(`${m.id}-${d}`)).toBeDefined();
  });

  for (const lv of ESCORT_LEVELS) {
    it(`${lv.id}：每个隘口附近 ≥ 2 个木台，旋钮在范围内`, () => {
      const m = ESCORT_MAPS.find((x) => x.id === lv.map)!;
      expect(lv.slots.length).toBeGreaterThanOrEqual(8);
      for (const g of lv.escort.gates) {
        const c = lv.escort.route[g]!;
        const near = lv.slots.filter((p) => Math.hypot((p.x + 1 - (c.x + 0.5)) * 100, (p.y + 1 - (c.y + 0.5)) * 100) <= REACH);
        expect(near.length, `${lv.id} 隘口 ${g}`).toBeGreaterThanOrEqual(2);
      }
      expect(lv.escort.route).toEqual(m.route);
      expect(lv.maxTicks).toBe(6000);
      expect(lv.escort.stars).toEqual([50, 90]);
      expect(lv.waves.length).toBeGreaterThanOrEqual(8);
      for (const w of lv.waves) for (const g of w.groups) expect(g.lane).toBeLessThanOrEqual(lv.lanes.length - 1 + (lv.tide ? 1 : 0));
    });
  }

  it('难度单调：新手船血最多、预算最少；高手相反', () => {
    for (const m of ESCORT_MAPS) {
      const [e, n, h] = ESCORT_DIFFS.map((d) => ESCORT_LEVEL_BY_ID.get(`${m.id}-${d}`)!);
      expect(e!.escort.hull).toBeGreaterThan(n!.escort.hull);
      expect(n!.escort.hull).toBeGreaterThan(h!.escort.hull);
      // 预算只比新手档和普通档：高手档靠船血、开局金、木台数和波间倒数变难（见 escortlevels.ts 的 KNOBS / TUNE）
      const total = (l: typeof e): number => l!.waves.reduce((a, w) => a + w.groups.reduce((b, g) => b + g.n, 0), 0);
      expect(total(e)).toBeLessThan(total(n));
      expect(h!.waveTicks).toBeLessThan(n!.waveTicks);
      expect(h!.slots.length).toBeLessThan(n!.slots.length);
    }
  });
});

/**
 * 护航实盘池里八关的冻结副本（src/content/escortlivelevels.ts）：哈希是整份定义（JSON）的 sha256。
 * 这条挂了说明实盘数值变了——是有意改的就重跑 live-sim --kind escort（--n 2000）、更新 DESIGN 12.1，再改这里的哈希。
 */
const ESCORT_LIVE_SHA256 = '27618e9d3001f7bc7258914ac07613fdf519d83053d9b616e91f78fff5fc8a75';

describe('护航实盘的关', () => {
  it('冻结副本逐字不变', () => {
    expect(createHash('sha256').update(JSON.stringify(ESCORT_LIVE_LEVELS)).digest('hex')).toBe(ESCORT_LIVE_SHA256);
  });

  it('每档都从冻结副本开局，不读娱乐的关', () => {
    for (const t of LIVE_TIER_IDS) {
      const lv = ESCORT_LIVE_LEVELS.find((l) => l.id === livePick('escort', t, 3).level);
      expect(lv, t).toBeDefined();
      expect(escortLiveSetup(t, 3).level).toBe(lv);
    }
  });
});
