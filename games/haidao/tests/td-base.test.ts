import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BRANCHES, BUILDINGS, HQ_LEVELS, branchOptions, buildLimit, chooseBranch, heroLevel, newProfile,
  pvpSnapshot, researchHero, runTdBot, tdGrowthSetup,
} from '../src/core/index.ts';
import type { Placed, Profile } from '../src/core/index.ts';
import { validateBase } from '../src/core/validate.ts';
import { reviveSave } from '../src/platform/sync.ts';

/** 守岛的基地部分（src/core/tdbase.ts、内容表）、存档、攻防快照、机器人 */

function withBuildings(extra: Placed[], hq = 7): Profile {
  const p = newProfile();
  const buildings = p.base.buildings.map((b) => (b.kind === 'hq' ? { ...b, level: hq } : b));
  return { ...p, base: { buildings: [...buildings, ...extra], nextId: 200 } };
}

describe('宝藏箱', () => {
  it('1×1，主寨 1 级 1 个、4 级 2 个、7 级 3 个；不进建造菜单的四类，也不是掉宝宝箱', () => {
    expect(BUILDINGS.treasure.size).toBe(1);
    expect(HQ_LEVELS.map((h) => h.limits.treasure ?? 0)).toEqual([1, 1, 1, 2, 2, 2, 3, 3]);
    expect(['resource', 'storage', 'army', 'defense', 'deco']).not.toContain(BUILDINGS.treasure.category);
    expect(BUILDINGS.chest.category).toBe('deco');
    expect(buildLimit(withBuildings([], 4), 'treasure').max).toBe(2);
  });
});

describe('塔的分叉', () => {
  it('每种防御塔 3 级、6 级各 2–3 条', () => {
    for (const k of ['cannon', 'gunTower', 'mortar', 'harpoon', 'flame', 'rocket', 'mine', 'tar'] as const) {
      for (const tier of [1, 2] as const) {
        const n = branchOptions(k, tier).length;
        expect(n, `${k} ${tier}`).toBeGreaterThanOrEqual(2);
        expect(n).toBeLessThanOrEqual(3);
      }
    }
    expect(new Set(BRANCHES.map((b) => b.id)).size).toBe(BRANCHES.length);
  });

  it('chooseBranch 校验：没到等级、选过了、不是这种塔的、6 级要先选 3 级那次、找不到', () => {
    const p = withBuildings([
      { id: 101, kind: 'cannon', level: 2, x: 0, y: 0 },
      { id: 102, kind: 'cannon', level: 3, x: 0, y: 2 },
      { id: 103, kind: 'cannon', level: 6, x: 0, y: 6 },
    ]);
    expect(chooseBranch(p, 101, 'cannon.pierce')).toEqual({ ok: false, error: 'need_level' });
    expect(chooseBranch(p, 102, 'gunTower.marksman')).toEqual({ ok: false, error: 'bad_branch' });
    expect(chooseBranch(p, 102, 'nope')).toEqual({ ok: false, error: 'bad_branch' });
    expect(chooseBranch(p, 102, 'cannon.heavy')).toEqual({ ok: false, error: 'need_level' });
    expect(chooseBranch(p, 103, 'cannon.heavy')).toEqual({ ok: false, error: 'need_tier1' });
    expect(chooseBranch(p, 999, 'cannon.pierce')).toEqual({ ok: false, error: 'not_found' });
    const r = chooseBranch(p, 102, 'cannon.pierce');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.base.buildings.find((b) => b.id === 102)?.branch).toEqual(['cannon.pierce']);
    expect(p.base.buildings.find((b) => b.id === 102)?.branch).toBeUndefined(); // 不改入参
    expect(chooseBranch(r.value, 102, 'cannon.chain')).toEqual({ ok: false, error: 'chosen' });
    const r2 = chooseBranch(p, 103, 'cannon.grape');
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    const r3 = chooseBranch(r2.value, 103, 'cannon.quick');
    expect(r3.ok && r3.value.base.buildings.find((b) => b.id === 103)?.branch).toEqual(['cannon.grape', 'cannon.quick']);
  });
});

describe('守岛英雄研究', () => {
  it('要军械所、最高等于主寨等级、只花木材', () => {
    const p = { ...withBuildings([], 4), res: { gold: 0, wood: 100000 } };
    expect(researchHero(p)).toEqual({ ok: false, error: 'need_armory' });
    let q: Profile = { ...p, base: { ...p.base, buildings: [...p.base.buildings, { id: 150, kind: 'armory', level: 4, x: 0, y: 0 }] } };
    for (let i = 0; i < 3; i++) {
      const r = researchHero(q);
      expect(r.ok).toBe(true);
      if (r.ok) q = r.value;
    }
    expect(q.research.hero).toBe(4);
    expect(q.res.gold).toBe(0);
    expect(researchHero(q)).toEqual({ ok: false, error: 'max' });
    expect(heroLevel({ ...q, research: { hero: 8 } })).toBe(4);
  });
});

describe('攻防快照', () => {
  it('pvpSnapshot 带上宝藏箱、分叉、英雄研究（规则版本 6），只去掉本机进度，不改入参；服务端校验照常通过', () => {
    const p: Profile = {
      ...withBuildings([
        { id: 101, kind: 'cannon', level: 3, x: 0, y: 0, branch: ['cannon.pierce'] },
        { id: 102, kind: 'treasure', level: 1, x: 0, y: 3 },
        { id: 103, kind: 'armory', level: 3, x: 17, y: 17 },
      ], 4),
      research: { hero: 3 },
      td: { stars: { td01: 3 }, day: 1, gotGold: 5, gotWood: 5 },
    };
    const before = JSON.stringify(p);
    const snap = pvpSnapshot(p);
    expect(snap.base.buildings.find((b) => b.id === 101)?.branch).toEqual(['cannon.pierce']);
    expect(snap.base.buildings.some((b) => b.kind === 'treasure')).toBe(true);
    expect(snap.research).toEqual({ hero: 3 });
    expect(snap.td).toBeUndefined();
    expect(JSON.stringify(p)).toBe(before);
    const v = validateBase(snap);
    expect(v.ok ? 'ok' : v.error).toBe('ok');
  });
});

describe('存档', () => {
  it('reviveSave 认合法的分叉、英雄研究和宝藏箱', () => {
    const p = withBuildings([
      { id: 101, kind: 'cannon', level: 6, x: 0, y: 0, branch: ['cannon.pierce', 'cannon.heavy'] },
      { id: 102, kind: 'treasure', level: 1, x: 0, y: 3 },
    ]);
    p.research = { hero: 5 };
    const s = reviveSave(JSON.parse(JSON.stringify({ profile: p, lastSeen: 1 })));
    expect(s?.profile.base.buildings.find((b) => b.id === 101)?.branch).toEqual(['cannon.pierce', 'cannon.heavy']);
    expect(s?.profile.base.buildings.some((b) => b.kind === 'treasure')).toBe(true);
    expect(s?.profile.research.hero).toBe(5);
  });

  it('reviveSave 丢掉不合法的：别的塔的分叉、等级不够、不是数组、英雄等级越界', () => {
    const p = withBuildings([
      { id: 101, kind: 'cannon', level: 3, x: 0, y: 0, branch: ['gunTower.marksman'] },
      { id: 103, kind: 'cannon', level: 3, x: 0, y: 6, branch: ['cannon.pierce', 'cannon.heavy'] },
      { id: 104, kind: 'cannon', level: 2, x: 0, y: 9, branch: ['cannon.pierce'] },
    ]);
    const raw = JSON.parse(JSON.stringify({ profile: p, lastSeen: 1 }));
    raw.profile.base.buildings.push({ id: 102, kind: 'cannon', level: 3, x: 0, y: 3, branch: 'cannon.pierce' });
    raw.profile.research = { hero: 13 }; // 研究最高 12（HERO_RESEARCH_MAX，主寨 8 级后）
    const s = reviveSave(raw)!;
    const br = (id: number) => s.profile.base.buildings.find((b) => b.id === id);
    expect(br(101)).toBeDefined();
    expect(br(101)?.branch).toBeUndefined();
    expect(br(102)?.branch).toBeUndefined();
    expect(br(103)?.branch).toEqual(['cannon.pierce']); // 3 级的塔，6 级那次不算
    expect(br(104)?.branch).toBeUndefined();
    expect(s.profile.research.hero).toBeUndefined();
    raw.profile.research = { hero: 0 };
    expect(reviveSave(raw)!.profile.research.hero).toBeUndefined();
  });
});

describe('守岛机器人', () => {
  it('样板关上普通、贪两种机器人都比小白打得好（星数、撑过的波数、丢的宝藏）', () => {
    const score = { novice: 0, normal: 0, greedy: 0 };
    for (let seed = 1; seed <= 4; seed++) {
      const st = tdGrowthSetup('td2-sample', 'suggest', seed);
      if (!st.ok) throw new Error(st.error);
      for (const bot of ['novice', 'normal', 'greedy'] as const) {
        const r = runTdBot(st.value, bot).result;
        score[bot] += r.stars * 100 + r.waves - r.lost;
      }
    }
    expect(score.normal).toBeGreaterThan(score.novice);
    expect(score.greedy).toBeGreaterThan(score.novice);
  }, 60_000);
});

describe('架构', () => {
  it('arch.test.ts 扫的目录里包含守岛的新文件', () => {
    const core = readdirSync(new URL('../src/core/', import.meta.url));
    const content = readdirSync(new URL('../src/content/', import.meta.url));
    for (const f of ['td.ts', 'tdbase.ts', 'tdbot.ts', 'grid.ts', 'tdtypes.ts', 'td2types.ts', 'tdrun.ts', 'tdhome.ts']) expect(core).toContain(f);
    for (const f of ['branches.ts', 'tdbranches.ts', 'tdunits.ts', 'td2units.ts', 'tdmaps.ts']) expect(content).toContain(f);
  });
});
