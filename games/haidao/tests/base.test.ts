import { describe, expect, it } from 'vitest';
import {
  BUILDINGS, CAMPAIGN, HQ_LEVELS, armyCost, armyFor, boatSlots, build, buildLimit, canPlace, capacity, collect,
  hqLevel, move, newProfile, produce, research, researchCost, setBoat, totalStars, upgrade, upgradeCost,
} from '../src/core/index.ts';
import type { BuildingKind, Profile } from '../src/core/index.ts';
import { TD_RUN_REWARD } from '../src/content/tdreward.ts';
import { maxCapacity } from '../src/core/validate.ts';

function rich(p: Profile): Profile {
  return { ...p, res: { gold: 999999, wood: 999999 } };
}
function val<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('内容表', () => {
  it('27 种建筑、1–8 级；装饰和宝藏箱 1 级', () => {
    expect(Object.keys(BUILDINGS)).toHaveLength(27);
    for (const [k, d] of Object.entries(BUILDINGS)) {
      expect(d.levels.length, k).toBe(d.maxLevel);
      expect(d.maxLevel).toBe(d.category === 'deco' || k === 'treasure' ? 1 : 8);
    }
  });
  it('主寨等级表：要求星数和能量递增', () => {
    expect(HQ_LEVELS.map((h) => h.needStars)).toEqual([0, 3, 7, 11, 16, 21, 27, 36]);
    for (let i = 1; i < HQ_LEVELS.length; i++) expect(HQ_LEVELS[i]!.energy).toBeGreaterThanOrEqual(HQ_LEVELS[i - 1]!.energy);
  });
  it('战役 30 关，主寨等级不降、最终到 8；每 5 关一个首领', () => {
    expect(CAMPAIGN).toHaveLength(30);
    expect(CAMPAIGN.filter((l) => l.boss).map((l) => l.id)).toEqual(['c05', 'c10', 'c15', 'c20', 'c25', 'c30']);
    for (const l of CAMPAIGN.filter((q) => q.boss)) expect(l.bossName && l.mechanic).toBeTruthy();
    for (let i = 1; i < CAMPAIGN.length; i++) expect(CAMPAIGN[i]!.hq).toBeGreaterThanOrEqual(CAMPAIGN[i - 1]!.hq);
    expect(CAMPAIGN[29]!.hq).toBe(8);
  });
  it('每关布局合法：不越界、不重叠、有主寨、建筑等级不超过主寨、数量不超过名额', () => {
    for (const lv of CAMPAIGN) {
      const grid = new Set<string>();
      const count: Record<string, number> = {};
      let hq = 0;
      for (const b of lv.layout) {
        const s = BUILDINGS[b.kind].size;
        // 海怪长在岛外的海里（海滩范围内），其余建筑在岛上
        const lo = b.kind === 'kraken' ? -3 : 0;
        const hi = b.kind === 'kraken' ? 25 : 22;
        expect(b.x >= lo && b.y >= lo && b.x + s <= hi && b.y + s <= hi, `${lv.id} ${b.kind} 越界`).toBe(true);
        for (let dx = 0; dx < s; dx++)
          for (let dy = 0; dy < s; dy++) {
            const key = `${b.x + dx},${b.y + dy}`;
            expect(grid.has(key), `${lv.id} ${b.kind}(${b.x},${b.y}) 重叠 ${key}`).toBe(false);
            grid.add(key);
          }
        expect(b.level >= 1 && b.level <= BUILDINGS[b.kind].maxLevel).toBe(true);
        if (b.kind === 'hq') hq = b.level;
        count[b.kind] = (count[b.kind] ?? 0) + 1;
      }
      expect(hq, `${lv.id} 主寨等级`).toBe(lv.hq);
      expect(new Set(lv.layout.map((b) => b.id)).size).toBe(lv.layout.length);
      for (const [k, n] of Object.entries(count)) {
        // 资源、仓库、船坞、军械所是电脑岛的摆设，不受玩家名额限制；防御和地雷要守名额
        // 首领岛和 c13 起的电脑岛有特殊摆法，不受玩家名额限制
        const free = lv.boss === true || Number(lv.id.slice(1)) >= 13 || ['goldmine', 'sawmill', 'vault', 'woodyard', 'dock', 'armory'].includes(k);
        if (!free) expect(n, `${lv.id} ${k} 超过名额`).toBeLessThanOrEqual(HQ_LEVELS[lv.hq - 1]!.limits[k as keyof typeof BUILDINGS] ?? 0);
        if (k !== 'hq' && k !== 'palm' && k !== 'rock') {
          for (const b of lv.layout) if (b.kind === k) expect(b.level, `${lv.id} ${k} 等级`).toBeLessThanOrEqual(lv.hq);
        }
      }
    }
  });
});

describe('研究价', () => {
  it('老存档研究到 N 级：改价只影响下一次花费，已研究的不退不补，资源不出负数', () => {
    const base = newProfile();
    const armory = { id: 90, kind: 'armory' as const, level: 8, x: 0, y: 0 };
    const hq = { ...base.base.buildings.find((b) => b.kind === 'hq')!, level: 8 };
    const old: Profile = {
      ...base,
      base: { ...base.base, buildings: [...base.base.buildings.filter((b) => b.kind !== 'hq'), hq, armory], nextId: 91 },
      research: { sailor: 5, gunner: 3 },
      res: { gold: 12345, wood: 6789 },
    };
    const snap = JSON.stringify(old);
    // 公式只看「当前级」，不看存档里是怎么花到这一级的
    for (let c = 1; c < 8; c++) {
      const cost = researchCost('sailor', c);
      expect(cost).toEqual({ gold: 100 * c * c, wood: 80 * c * c });
      expect(cost.gold).toBeGreaterThan(0);
    }
    const r = val(research(old, 'sailor'));
    expect(r.research.sailor).toBe(6);
    expect(r.res).toEqual({ gold: 12345 - researchCost('sailor', 5).gold, wood: 6789 - researchCost('sailor', 5).wood });
    expect(r.research.gunner).toBe(3);
    expect(JSON.stringify(old)).toBe(snap);
    // 钱不够就拒绝，资源原样
    const poor = { ...old, res: { gold: 10, wood: 10 } };
    expect(research(poor, 'sailor')).toEqual({ ok: false, error: 'no_gold' });
  });
});

describe('基地', () => {
  it('新号：主寨 1 级在中间，两条水手船，函数不改入参', () => {
    const p = newProfile();
    const snap = JSON.stringify(p);
    expect(hqLevel(p)).toBe(1);
    expect(totalStars(p)).toBe(0);
    expect(p.boats).toHaveLength(2);
    expect(boatSlots(p)).toEqual({ boats: 2, cap: 6 });
    expect(build(p, 'goldmine', 0, 18).ok).toBe(false); // 名额已满
    expect(JSON.stringify(p)).toBe(snap);
  });
  it('摆放：越界、重叠、忽略自己', () => {
    const p = newProfile();
    expect(canPlace(p, 'cannon', 21, 0)).toBe(false);
    expect(canPlace(p, 'cannon', -1, 0)).toBe(false);
    expect(canPlace(p, 'cannon', 10, 10)).toBe(false);
    expect(canPlace(p, 'cannon', 10, 10, 1)).toBe(true);
    expect(canPlace(p, 'palm', 0, 0)).toBe(true);
  });
  it('建造的错误码和扣费', () => {
    const p = newProfile();
    expect(build(p, 'mine', 0, 0)).toEqual({ ok: false, error: 'locked' });
    expect(build(p, 'vault', 9, 9)).toEqual({ ok: false, error: 'blocked' });
    expect(build({ ...p, res: { gold: 0, wood: 400 } }, 'vault', 0, 0)).toEqual({ ok: false, error: 'no_gold' });
    expect(build({ ...p, res: { gold: 5000, wood: 400 } }, 'cannon', 0, 0).ok).toBe(true);
    const q = val(build(p, 'vault', 0, 0));
    expect(q.res.gold).toBe(p.res.gold - BUILDINGS.vault.levels[0]!.cost.gold);
    expect(buildLimit(q, 'vault')).toEqual({ have: 1, max: 1 });
    expect(build(q, 'vault', 0, 5)).toEqual({ ok: false, error: 'limit' });
  });
  it('移动', () => {
    const p = newProfile();
    expect(move(p, 4, 0, 0).ok).toBe(true);
    expect(move(p, 4, 9, 9)).toEqual({ ok: false, error: 'blocked' });
    expect(move(p, 99, 0, 0)).toEqual({ ok: false, error: 'not_found' });
  });
  it('升级：建筑等级不超过主寨；主寨要星数', () => {
    const p = rich(newProfile());
    expect(upgrade(p, 4)).toEqual({ ok: false, error: 'need_hq' });
    expect(upgrade(p, 1)).toEqual({ ok: false, error: 'need_stars' });
    const q = { ...p, stars: { c01: 3 } };
    const r = val(upgrade(q, 1));
    expect(hqLevel(r)).toBe(2);
    expect(val(upgrade(r, 4)).base.buildings.find((b) => b.id === 4)!.level).toBe(2);
    expect(upgradeCost('cannon', 8)).toBeNull();
    expect(upgradeCost('cannon', 1)).toEqual(BUILDINGS.cannon.levels[1]!.cost);
    expect(upgrade({ ...q, res: { gold: 1, wood: 0 } }, 1)).toEqual({ ok: false, error: 'no_gold' });
  });
  it('产出、收取与仓库上限', () => {
    let p = { ...newProfile(), res: { gold: 0, wood: 0 } };
    p = produce(p, 3600);
    expect(p.base.buildings.find((b) => b.id === 2)!.stored).toBeCloseTo(BUILDINGS.goldmine.levels[0]!.rate!, 5);
    expect(BUILDINGS.goldmine.levels.map((l) => l.rate)).toEqual([255, 340, 442, 561, 714, 884, 1088, 1326]);
    expect(BUILDINGS.sawmill.levels.map((l) => l.rate)).toEqual([156, 208, 273, 351, 442, 546, 676, 832]);
    p = produce(p, 3600 * 100);
    const cap = BUILDINGS.goldmine.levels[0]!.cap!;
    expect(p.base.buildings.find((b) => b.id === 2)!.stored).toBe(cap);
    const got = val(collect(p, 2));
    expect(got.kind).toBe('gold');
    // 矿自身存量（12 小时产量）可以比主寨自带仓库大：先收放得下的，剩下的留在矿里
    const take = Math.min(cap, capacity(p).gold - p.res.gold);
    expect(got.got).toBe(take);
    expect(got.profile.res.gold).toBe(p.res.gold + take);
    // 仓库快满：只收放得下的
    const tight = { ...p, res: { ...p.res, gold: capacity(p).gold - 10 } };
    expect(val(collect(tight, 2)).got).toBe(10);
    expect(collect({ ...p, res: { ...p.res, gold: capacity(p).gold } }, 2)).toEqual({ ok: false, error: 'full' });
    expect(collect(newProfile(), 2)).toEqual({ ok: false, error: 'empty' });
  });
  it('船与部队', () => {
    let p = newProfile();
    expect(setBoat(p, 0, 'brute')).toEqual({ ok: false, error: 'locked' });
    expect(setBoat(p, 5, 'sailor')).toEqual({ ok: false, error: 'bad_index' });
    p = val(setBoat(p, 1, 'gunner'));
    const a = armyFor(p);
    expect(a.boats).toEqual([{ troop: 'sailor', count: 6, level: 1 }, { troop: 'gunner', count: 6, level: 1 }]);
    expect(a.energy).toBe(HQ_LEVELS[0]!.energy);
    expect(armyCost(p).wood).toBe(6 * 8 + 6 * 12);
  });
  it('研究要军械所，等级不超过军械所', () => {
    const p = rich(newProfile());
    expect(research(p, 'sailor')).toEqual({ ok: false, error: 'need_armory' });
    const q = { ...p, base: { ...p.base, buildings: [...p.base.buildings, { id: 20, kind: 'armory' as const, level: 2, x: 0, y: 18 }] } };
    const r = val(research(q, 'sailor'));
    expect(r.research.sailor).toBe(2);
    expect(research(r, 'sailor')).toEqual({ ok: false, error: 'need_armory' });
    expect(research(q, 'brute')).toEqual({ ok: false, error: 'locked' });
  });
});

describe('船长只能带一个', () => {
  const hq5 = (): Profile => {
    const p = newProfile();
    return { ...p, res: { gold: 999999, wood: 999999 }, base: { ...p.base, buildings: [...p.base.buildings.map((b) => (b.kind === 'hq' ? { ...b, level: 5 } : b)), { id: 30, kind: 'dock' as const, level: 3, x: 0, y: 9 }] } };
  };
  it('setBoat：已有船长时再设一个返回 one_captain；同一条船换回来不算', () => {
    let p = val(setBoat(hq5(), 0, 'captain'));
    expect(setBoat(p, 1, 'captain')).toEqual({ ok: false, error: 'one_captain' });
    expect(setBoat(p, 0, 'captain').ok).toBe(true);
    p = val(setBoat(p, 0, 'sailor'));
    expect(setBoat(p, 1, 'captain').ok).toBe(true);
  });
  it('armyFor：坏存档里多出的船长船当空船，不收木材', () => {
    const p = { ...hq5(), boats: [{ troop: 'captain' as const }, { troop: 'captain' as const }, { troop: 'sailor' as const }] };
    const a = armyFor(p);
    expect(a.boats.filter((b) => b.troop === 'captain' && b.count > 0)).toHaveLength(1);
    expect(a.boats[1]!.count).toBe(0);
    expect(a.boats).toHaveLength(4);
  });
});

describe('仓库上限：每个主寨等级建满后装得下这一级要花的钱', () => {
  /** 这一级能买的最贵单项：名额里每种建筑升到 min(主寨, 上限) 的各级花费，加上升下一级主寨 */
  const priciest = (hq: number): { gold: number; wood: number } => {
    const lim = HQ_LEVELS[hq - 1]!.limits as Partial<Record<BuildingKind, number>>;
    const costs = (Object.keys(BUILDINGS) as BuildingKind[])
      .filter((k) => k !== 'hq' && (lim[k] ?? 0) > 0 && BUILDINGS[k].unlockHq <= hq)
      .flatMap((k) => BUILDINGS[k].levels.slice(0, Math.min(hq, BUILDINGS[k].maxLevel)).map((l) => l.cost));
    const up = HQ_LEVELS[hq]?.cost;
    if (up) costs.push(up);
    return { gold: Math.max(...costs.map((c) => c.gold)), wood: Math.max(...costs.map((c) => c.wood)) };
  };
  it('能花的上限 ≥ 最贵单项 × 1.25，且 ≥ 守岛 3★ 两局', () => {
    for (let hq = 1; hq <= HQ_LEVELS.length; hq++) {
      const cap = maxCapacity(hq);
      const top = priciest(hq);
      const run = TD_RUN_REWARD[hq - 1]!;
      for (const k of ['gold', 'wood'] as const) {
        expect(cap[k], `主寨 ${hq} ${k}`).toBeGreaterThanOrEqual(Math.ceil(top[k] * 1.25));
        expect(cap[k], `主寨 ${hq} ${k}`).toBeGreaterThanOrEqual(2 * run[k]);
      }
    }
  });
  it('只加不减：各级不低于 0.36.1 的数，逐级不降', () => {
    const OLD = [1800, 3000, 4800, 7200, 10200, 14400, 20400, 28800];
    const OLD_HQ = [1500, 2200, 3200, 4500, 6500, 9000, 13000, 18000];
    for (const k of ['vault', 'woodyard', 'hq'] as const) {
      const caps = BUILDINGS[k].levels.map((l) => l.cap!);
      const old = k === 'hq' ? OLD_HQ : OLD;
      caps.forEach((c, i) => {
        expect(c).toBeGreaterThanOrEqual(old[i]!);
        if (i > 0) expect(c).toBeGreaterThan(caps[i - 1]!);
      });
    }
    expect(maxCapacity(6).gold).toBe(9000 + 3 * 40400);
  });
});
