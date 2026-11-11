import { describe, expect, it } from 'vitest';
import { canPlace, newProfile } from '../src/core/index.ts';
import { ISLAND, type Profile } from '../src/core/types.ts';
import { fresh, mergeSave, reviveSave, type Save } from '../src/platform/sync.ts';

/** 存档校验（src/platform/sync.ts）：坏档不能变成有效档再同步上云，也不能让规则核心崩 */
const good = (): Save => ({ profile: newProfile(), lastSeen: 1_000 });
const clone = (s: Save): Save => JSON.parse(JSON.stringify(s)) as Save;

describe('reviveSave', () => {
  it('好档原样认回', () => {
    const s = good();
    expect(reviveSave(clone(s))).toEqual(s);
  });

  it('形状不对、没有主寨：整份作废', () => {
    expect(reviveSave(null)).toBeNull();
    expect(reviveSave({ profile: { v: 2 } })).toBeNull();
    const s = clone(good());
    s.profile.base.buildings = s.profile.base.buildings.filter((b) => b.kind !== 'hq');
    expect(reviveSave(s)).toBeNull();
  });

  it('守岛星数：td01–td18 的星原样保留（守岛 2.0 换了关卡表，关 id 不变），不认识的关和越界的星丢掉', () => {
    const s = clone(good());
    const stars: Record<string, number> = { td01: 3, td09: 2, td18: 1, td19: 3, other: 2, td02: 7 };
    s.profile.td = { stars, day: 0, gotGold: 0, gotWood: 0 };
    expect(reviveSave(s)?.profile.td?.stars).toEqual({ td01: 3, td09: 2, td18: 1 });
  });

  it('坏建筑逐座丢掉：原型链上的名字、等级越界、坐标越界或带小数、重叠、重复 id', () => {
    const s = clone(good());
    const n = s.profile.base.buildings.length;
    const bad = [
      { id: 900, kind: 'toString', level: 1, x: 0, y: 0 },
      { id: 901, kind: 'cannon', level: 0, x: 0, y: 0 },
      { id: 902, kind: 'cannon', level: 99, x: 0, y: 0 },
      { id: 903, kind: 'cannon', level: 1, x: 21, y: 0 },
      { id: 904, kind: 'cannon', level: 1, x: 0.5, y: 0 },
      { id: 905, kind: 'cannon', level: 1, x: Number.NaN, y: 0 },
      { ...s.profile.base.buildings[0]!, id: 906 },
      { id: s.profile.base.buildings[0]!.id, kind: 'palm', level: 1, x: 0, y: 0 },
    ];
    (s.profile.base.buildings as unknown[]).push(...bad);
    const r = reviveSave(s)!;
    expect(r.profile.base.buildings).toHaveLength(n);
    expect(r.profile.base.nextId).toBeGreaterThan(Math.max(...r.profile.base.buildings.map((b) => b.id)));
  });

  it('nextId 不大于现有最大 id 时抬上去', () => {
    const s = clone(good());
    s.profile.base.nextId = 1;
    const r = reviveSave(s)!;
    expect(r.profile.base.nextId).toBe(Math.max(...r.profile.base.buildings.map((b) => b.id)) + 1);
  });

  it('不认识的兵种、星数、研究丢掉；资源卡到非负', () => {
    const s = clone(good()) as unknown as { profile: Record<string, unknown> };
    s.profile.boats = [{ troop: 'x' }, { troop: 'constructor' }, { troop: 'gunner' }];
    s.profile.stars = { c01: 3, c02: 1.5, c03: 4, zz: 2, c04: -1 };
    s.profile.research = { sailor: 3, gunner: 99, toString: 2, barrage: 0 };
    s.profile.res = { gold: -50, wood: Number.POSITIVE_INFINITY };
    const r = reviveSave(s)!;
    expect(r.profile.boats).toEqual([{ troop: 'gunner' }]);
    expect(r.profile.stars).toEqual({ c01: 3 });
    expect(r.profile.research).toEqual({ sailor: 3 });
    expect(r.profile.res).toEqual({ gold: 0, wood: 0 });
  });

  it('掉宝：不认识的去掉，没拥有的皮肤不能装备、装饰不能摆', () => {
    const s = clone(fresh());
    s.profile.cosmetics = ['skin:sailor:gold', 'skin:x:gold', 'deco:statue', 7] as unknown as string[];
    s.profile.skins = { sailor: 'gold', gunner: 'royal', toString: 'gold' } as unknown as Profile['skins'];
    const spot = (kind: 'statue' | 'chest'): [number, number] => {
      for (let y = 0; y < ISLAND; y++) for (let x = 0; x < ISLAND; x++) if (canPlace(s.profile, kind, x, y)) return [x, y];
      throw new Error('no spot');
    };
    const [sx, sy] = spot('statue');
    s.profile.base.buildings.push({ id: 900, kind: 'statue', level: 1, x: sx, y: sy });
    const [cx, cy] = spot('chest');
    s.profile.base.buildings.push({ id: 901, kind: 'chest', level: 1, x: cx, y: cy });
    s.profile.base.nextId = 902;
    const r = reviveSave(s)!;
    expect(r.profile.cosmetics).toEqual(['skin:sailor:gold', 'deco:statue']);
    expect(r.profile.skins).toEqual({ sailor: 'gold' });
    expect(r.profile.base.buildings.some((b) => b.id === 900)).toBe(true);
    expect(r.profile.base.buildings.some((b) => b.id === 901)).toBe(false);
  });
});

describe('mergeSave', () => {
  it('整份取进度大的', () => {
    const a = fresh();
    const b = clone(a);
    b.profile.stars = { c01: 3 };
    expect(mergeSave(a, b)).toBe(b);
    expect(mergeSave(b, a)).toBe(b);
  });
  it('战役一样时，守岛星数多的那份胜出', () => {
    const a = fresh();
    const b = clone(a);
    b.profile.td = { stars: { td01: 2 }, day: 0, gotGold: 0, gotWood: 0 };
    expect(mergeSave(a, b)).toBe(b);
    expect(mergeSave(b, a)).toBe(b);
  });
});
