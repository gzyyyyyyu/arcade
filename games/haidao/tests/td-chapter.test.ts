import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/content/index.ts';
import { TD2_CHAPTERS, TD2_LEVELS as ALL_LEVELS, TD2_LEVEL_BY_ID, TD2_MAPS, buildLevel, TD2_LEVEL_DEFS } from '../src/content/tdmaps.ts';
import { TD2_ENEMY_POINTS } from '../src/content/td2units.ts';
import { createTd, stepTd } from '../src/core/td.ts';
import { tdIncomingWave, tdPreview, tdRoute, tdRoutes, tdWaveLanes } from '../src/core/tdquery.ts';
import { tdGrowthSetup } from '../src/core/tdrun.ts';
import { waveBudget } from '../src/core/td2types.ts';
import { RULES_VERSION } from '../src/core/types.ts';
import type { TdLevel } from '../src/core/tdtypes.ts';

/**
 * 守岛 2.0 的关卡数据（DESIGN 10.6）：11 张关卡岛、22 关的形状、波次和公式的对应、塔位和路线（第四章这一批先有 td19–td22，td23、td24 下一批加）。
 * 数值配平（三星率曲线等）看 tools/td-sim.ts，这里只锁数据的结构。
 */

/** 战役的关（样板关不算） */
const TD2_LEVELS = ALL_LEVELS.filter((l) => /^td\d\d$/.test(l.id));
const ID = (i: number): string => `td${String(i + 1).padStart(2, '0')}`;

describe('关卡表', () => {
  it('5 章 30 关（每章 6 关），id td01–td30，建议主寨不降，一波 15–18 秒、8–12 波', () => {
    expect(TD2_CHAPTERS.map((c) => c.levels.length)).toEqual([6, 6, 6, 6, 6]);
    expect(TD2_LEVELS.map((l) => l.id)).toEqual(Array.from({ length: 30 }, (_, i) => ID(i)));
    TD2_LEVELS.forEach((l, i) => {
      expect(l.index).toBe(i);
      expect(l.chapter).toBe(Math.floor(i / 6) + 1);
      expect(l.hpPct).toBe(100);
      expect(l.waves.length).toBeGreaterThanOrEqual(8);
      expect(l.waves.length).toBeLessThanOrEqual(12);
      expect(l.waveTicks / 20).toBeGreaterThanOrEqual(15);
      expect(l.waveTicks / 20).toBeLessThanOrEqual(18);
      expect(TD2_LEVEL_BY_ID.get(l.id)).toBe(l);
      if (i > 0) expect(l.hq).toBeGreaterThanOrEqual(TD2_LEVELS[i - 1]!.hq);
    });
    expect(TD2_LEVEL_BY_ID.has('td2-sample')).toBe(true);
    expect(TD2_CHAPTERS.flatMap((c) => c.levels).some((l) => l.id === 'td2-sample')).toBe(false);
  });
  it('13 张图都用上：双滩只出一关，潮沟、双子岛、火山口、断崖湾、双崖口各出三关，其余各两关', () => {
    expect(TD2_MAPS.map((m) => m.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M']);
    const count = new Map<string, number>();
    for (const l of TD2_LEVELS) count.set(l.map, (count.get(l.map) ?? 0) + 1);
    expect([...count.keys()].sort()).toEqual(TD2_MAPS.map((m) => m.id));
    expect(TD2_MAPS.map((m) => count.get(m.id))).toEqual([2, 1, 2, 3, 2, 2, 2, 2, 2, 3, 3, 3, 3]);
  });
  it('木台数和沉船、驻守台数按 DESIGN 10.7 的关卡表', () => {
    const pads = [4, 4, 5, 6, 6, 7, 7, 7, 7, 8, 8, 8, 8, 8, 8, 9, 9, 10, 9, 10, 9, 10, 10, 10, 7, 7, 8, 9, 9, 10];
    const wrecks = [0, 0, 0, 1, 1, 0, 0, 2, 2, 0, 0, 0, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const garrison = [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1, 1, 2, 2, 2, 2];
    TD2_LEVELS.forEach((l, i) => {
      expect(l.slots, l.id).toHaveLength(pads[i]!);
      expect(l.slots.filter((p) => p.wreck).length, l.id).toBe(wrecks[i]);
      expect(l.garrison, l.id).toHaveLength(garrison[i]!);
      for (const g of l.garrison) expect([1, 2, 3]).toContain(g.cap);
    });
  });
  it('波里的登陆路下标都有效；写了 tideOpen 就必须有 tide；有首领技能的关有首领波；东路关有三条路', () => {
    for (const l of TD2_LEVELS) {
      const max = l.tide ? l.lanes.length : l.lanes.length - 1;
      for (const w of l.waves) for (const g of w.groups) expect(g.lane, l.id).toBeLessThanOrEqual(max);
      if (l.tideOpen) {
        expect(l.tide).toBeDefined();
        for (const w of l.tideOpen) expect(w).toBeLessThan(l.waves.length);
      }
      if (l.bossSkill) expect(l.waves.some((w) => w.boss), l.id).toBe(true);
      if (l.flank) expect(l.lanes.length, l.id).toBeGreaterThanOrEqual(3);
      for (const f of l.fogZones ?? []) expect(f.r).toBeGreaterThan(0);
    }
  });
  it('每章带的新机制：第一章只有潮和首领，第二章有潮和雾，第三章有工兵、首领技能、东路', () => {
    const [c1, c2, c3] = TD2_CHAPTERS.map((c) => c.levels);
    expect(c1!.some((l) => l.sapperJam || l.bossSkill || l.flank)).toBe(false);
    expect(c1!.filter((l) => l.waves.some((w) => w.boss))).toHaveLength(1);
    expect(c2!.some((l) => l.tideOpen)).toBe(true);
    expect(c2!.some((l) => l.fogZones && l.fogZones.length > 0)).toBe(true);
    expect(c3!.some((l) => l.sapperJam)).toBe(true);
    expect(c3!.some((l) => l.bossSkill)).toBe(true);
    expect(c3!.filter((l) => l.waves.some((w) => w.boss)).length).toBeGreaterThanOrEqual(3);
    // 第四章：两张带水面的新图、军医、炮艇、大副、海盗王（只在最后一关），最后两关有友军船
    const c4 = TD2_CHAPTERS[3]!.levels;
    expect(c4.every((l) => (l.water?.length ?? 0) > 0)).toBe(true);
    const kinds = new Set(c4.flatMap((l) => l.waves.flatMap((w) => w.groups.map((g) => g.enemy))));
    for (const k of ['medic', 'gunboat', 'mate', 'king'] as const) expect(kinds.has(k), k).toBe(true);
    expect(c4.filter((l) => l.waves.some((w) => w.groups.some((g) => g.enemy === 'king'))).map((l) => l.id)).toEqual(['td24']);
    expect(c4.filter((l) => l.fleet).map((l) => l.id)).toEqual(['td23', 'td24']);
    expect(TD2_LEVELS.filter((l) => l.fleet).length).toBe(2);
    expect(TD2_CHAPTERS.slice(0, 3).some((c) => c.levels.some((l) => l.water))).toBe(false);
  });
});

describe('波次 = 预算公式', () => {
  it('每一波的点数（个数 × 敌人点数，首领另算）和 waveBudget 差不到两成；预算逐波上涨', () => {
    for (const l of TD2_LEVELS) {
      // 精英一个顶四个，点数照算
      const def = TD2_LEVEL_DEFS[l.index]!;
      l.waves.forEach((w, i) => {
        // 份额加起来不到 100 的波是有意放轻的铺垫波（td02 / td04 / td05 的前几波），预算按份额之和折算
        const shares = def.waves[i]!.groups.reduce((s, g) => s + (g[0] === 'captain' ? 0 : g[1]), 0);
        // 给新手放宽的波（ease）再乘它的百分比
        const ease = def.ease?.pct && i < (def.ease.waves ?? def.waves.length) ? def.ease.pct : 100;
        const budget = (waveBudget(l.index, i) * (def.scale ?? 100) * Math.min(100, shares || 100) * ease) / 1_000_000;
        let pts = 0;
        for (const g of w.groups) pts += g.n * TD2_ENEMY_POINTS[g.enemy];
        // 个数四舍五入、至少 1 个：小波次会偏，预算大的波偏差小
        expect(pts, `${l.id} 第 ${i + 1} 波`).toBeGreaterThan(budget * 0.75);
        expect(pts, `${l.id} 第 ${i + 1} 波`).toBeLessThan(budget * 1.25);
      });
    }
    for (let w = 1; w < 12; w++) expect(waveBudget(5, w)).toBeGreaterThan(waveBudget(5, w - 1));
    for (let i = 1; i < 18; i++) expect(waveBudget(i, 0)).toBeGreaterThan(waveBudget(i - 1, 0));
  });
  it('预算百分比：98% 比 100% 少、102% 比 100% 多，关卡形状不变', () => {
    const def = TD2_LEVEL_DEFS[8]!;
    const a = buildLevel(def, 98);
    const b = buildLevel(def, 100);
    const c = buildLevel(def, 102);
    const total = (l: TdLevel): number => l.waves.reduce((s, w) => s + w.groups.reduce((t, g) => t + g.n * TD2_ENEMY_POINTS[g.enemy], 0), 0);
    expect(total(a)).toBeLessThanOrEqual(total(b));
    expect(total(c)).toBeGreaterThanOrEqual(total(b));
    expect(a.slots).toEqual(b.slots);
    expect(a.waves.map((w) => w.groups.map((g) => g.enemy))).toEqual(b.waves.map((w) => w.groups.map((g) => g.enemy)));
  });
});

describe('关卡岛的地形', () => {
  const size = (kind: string): number => BUILDINGS[kind as keyof typeof BUILDINGS].size;
  it('主寨、宝藏箱、木台、驻守台、火药桶互不重叠，木台和驻守台都在岛内', () => {
    for (const m of TD2_MAPS) {
      const used = new Map<string, string>();
      const claim = (x: number, y: number, n: number, what: string): void => {
        for (let dx = 0; dx < n; dx++) {
          for (let dy = 0; dy < n; dy++) {
            const k = `${x + dx},${y + dy}`;
            expect(used.has(k), `${m.id}: ${what} 压着 ${used.get(k)} 于 ${k}`).toBe(false);
            used.set(k, what);
          }
        }
      };
      for (const b of m.layout) {
        if (b.kind === 'rock' || b.kind === 'palm') continue; // 装饰不挡路，可以和别的东西挨着
        claim(b.x, b.y, size(b.kind), b.kind);
      }
      m.pads.forEach((p) => {
        expect(p.x >= 0 && p.y >= 0 && p.x + 2 <= 22 && p.y + 2 <= 22, `${m.id} 木台出岛`).toBe(true);
        claim(p.x, p.y, 2, 'pad');
      });
      m.garrison.forEach((g) => {
        expect(g.x >= 0 && g.y >= 0 && g.x + 2 <= 22 && g.y + 2 <= 22, `${m.id} 驻守台出岛`).toBe(true);
        claim(g.x, g.y, 2, 'garrison');
      });
      for (const k of m.kegs) claim(k.x, k.y, 1, 'keg');
      for (const b of m.layout) {
        if (b.kind === 'wall') continue; // 墙可以连到海滩上
        expect(b.x >= 0 && b.y >= 0 && b.x + size(b.kind) <= 22 && b.y + size(b.kind) <= 22, `${m.id} ${b.kind} 出岛`).toBe(true);
      }
    }
  });
  it('每条登陆路（含落潮路）都走得到宝藏箱，水手走完全程 8 秒以上；每关至少有一条 14 格以上的主路', () => {
    for (const l of TD2_LEVELS) {
      const s = createTd({ layout: l.layout, level: l, hero: 1, seed: 1, rules: RULES_VERSION, mode: 'campaign' });
      const all = [...l.lanes, ...(l.tide ? [l.tide.lane] : [])];
      const lens = all.map((p) => tdRoute(s, p.x, p.y).length);
      lens.forEach((n, i) => expect(n, `${l.id} 路 ${i}`).toBeGreaterThanOrEqual(8));
      expect(Math.max(...lens), l.id).toBeGreaterThanOrEqual(14);
      // 每个木台、驻守台、火药桶都真的摆上了（不被关卡自己的东西挤掉）
      const st = createTd({ layout: l.layout, level: l, hero: 1, seed: 1, rules: RULES_VERSION, mode: 'campaign' });
      expect(st.slots, l.id).toHaveLength(l.slots.length + l.garrison.length);
      expect(st.kegs, l.id).toHaveLength(l.kegs.length);
    }
  });
  it('一章内两关共用一张图的地形，换的是波次、开局金、木台数和驻守台上限', () => {
    for (const m of TD2_MAPS) {
      const ls = TD2_LEVELS.filter((l) => l.map === m.id);
      for (const l of ls) {
        expect(l.lanes).toEqual(m.lanes);
        expect(l.layout.filter((b) => b.kind !== 'hq')).toEqual(m.layout.filter((b) => b.kind !== 'hq'));
      }
    }
  });
});

describe('每一波的登陆口（竖屏镜头推过去看的地方）', () => {
  it('每关每一波：tdWaveLanes 和预告卡说的那几路是同一组登陆口，不重复', () => {
    for (const lv of ALL_LEVELS) {
      const r = tdGrowthSetup(lv.id, 'suggest', 1);
      if (!r.ok) throw new Error(lv.id);
      const s = createTd(r.value);
      const routes = tdRoutes(s);
      for (let w = 0; w < s.level.waves.length; w++) {
        s.wave = w;
        const want = (tdPreview(s, 1)[0]?.lanes ?? []).map((l) => routes.find((q) => q.lane === l.lane)!).map((q) => `${q.x},${q.y}`);
        const got = tdWaveLanes(s, w).map((c) => `${c.x},${c.y}`);
        expect(new Set(got).size, `${lv.id} 第 ${w + 1} 波`).toBe(got.length);
        expect([...got].sort(), `${lv.id} 第 ${w + 1} 波`).toEqual([...new Set(want)].sort());
      }
    }
  });
});

describe('还有敌人没上岛的那一波（竖屏自动构图：没人要来时镜头不动）', () => {
  it('开波前是 -1；叫波后是这一波，直到这一波都上岛', () => {
    const r = tdGrowthSetup('td03', 'suggest', 1);
    if (!r.ok) throw new Error('td03');
    const s = createTd(r.value);
    expect(tdIncomingWave(s)).toBe(-1);
    stepTd(s, [{ t: s.tick, type: 'call' }]);
    expect(tdIncomingWave(s)).toBe(0);
    for (let i = 0; i < 2000 && tdIncomingWave(s) === 0; i++) stepTd(s, []);
    expect(tdIncomingWave(s)).not.toBe(0);
    expect(s.enemies.length).toBeGreaterThan(0);
  });
});
