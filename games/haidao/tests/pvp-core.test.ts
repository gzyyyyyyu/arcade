import { describe, expect, it } from 'vitest';
import { CAMPAIGN, RULES_VERSION, armyFor, battleFingerprint, botActions, newProfile, runBattle } from '../src/core/index.ts';
import type { BattleSetup, BuildingKind, Placed, Profile } from '../src/core/index.ts';
import { canPlace } from '../src/core/base.ts';
import { BATTLE_TICKS, ISLAND } from '../src/core/types.ts';
import { LOOT_PCT, MAX_ACTIONS, raidGain, raidLoss, replayRaid, sanitizeActions, shieldMs, trophyDelta, wandererGain, wandererIsland } from '../src/core/pvp.ts';
import { maxCapacity, validateBase } from '../src/core/validate.ts';
import { HQ_LEVELS } from '../src/content/index.ts';
import { sampleArmy } from '../tools/sample.ts';
import { HarborCore, MemHarbor, ONLINE_MS, eligible } from '../worker/pvp/harbor.ts';
import type { PickReq } from '../worker/pvp/harbor.ts';
import type { HarborEntry } from '../worker/pvp/base.ts';

function setupOf(i: number, seed: number, strong: boolean): BattleSetup {
  const lv = CAMPAIGN[i]!;
  const army = strong ? sampleArmy(lv.hq) : armyFor({ ...newProfile(), research: { sailor: 2, gunner: 2 } });
  return { layout: lv.layout, army, seed, rules: RULES_VERSION };
}

describe('重放一致性', () => {
  for (const strong of [false, true]) {
    it(`replayRaid 与 runBattle 逐位相同（${strong ? '典型部队' : '新档部队'}）`, () => {
      for (const [i, seed] of [[1, 42], [1, 7], [3, 99]] as const) {
        const setup = setupOf(i, seed, strong);
        const acts = botActions(setup, 'normal');
        expect(acts.length).toBeGreaterThan(0);
        const a = runBattle(setup, acts);
        const b = replayRaid(setup, acts);
        expect(b.fingerprint).toBe(battleFingerprint(a.state));
        expect(b.result.stars).toBe(a.result.stars);
        expect(b.result.destroyedPct).toBe(a.result.destroyedPct);
        expect(b.result.hqDown).toBe(a.result.hqDown);
        expect(b.result.over).toBe(true);
        expect(b.ticks).toBe(a.state.tick);
      }
    });
  }
  it('操作顺序打乱不影响结果（按拍稳定排序）', () => {
    const setup = setupOf(1, 5, true);
    const acts = botActions(setup, 'normal');
    const a = replayRaid(setup, acts);
    const b = replayRaid(setup, [...acts].sort((p, q) => q.t - p.t));
    expect(b.result).toEqual(a.result);
  });
  it('endTick 提前结束：只推进到 endTick', () => {
    const setup = setupOf(1, 42, true);
    const acts = botActions(setup, 'normal');
    const r = replayRaid(setup, acts, 100);
    expect(r.ticks).toBe(100);
    expect(r.result.over).toBe(true);
    expect(replayRaid(setup, acts, 0).ticks).toBe(0);
    const full = replayRaid(setup, acts);
    expect(full.ticks).toBeGreaterThan(100);
    expect(full.ticks).toBeLessThanOrEqual(BATTLE_TICKS);
  });
});

describe('pvp 纯函数', () => {
  it('raidLoss：pct=100 时正好仓库的 20%（向下取整），不为负', () => {
    expect(raidLoss({ gold: 1001, wood: 7 }, 100)).toEqual({ gold: 200, wood: 1 });
    expect(raidLoss({ gold: 1000, wood: 0 }, 50)).toEqual({ gold: 100, wood: 0 });
    expect(raidLoss({ gold: -5, wood: 3 }, 100)).toEqual({ gold: 0, wood: 0 });
    for (const g of [0, 1, 99, 12345, 1e9]) for (const p of [0, 1, 33, 99, 100]) {
      const l = raidLoss({ gold: g, wood: g }, p);
      expect(l.gold).toBeLessThanOrEqual(Math.floor((g * LOOT_PCT) / 100));
      expect(l.gold).toBeGreaterThanOrEqual(0);
    }
  });
  it('raidGain = 掉的 × 1.5 向下取整各项', () => {
    expect(raidGain({ gold: 201, wood: 1 })).toEqual({ gold: 301, wood: 1 });
    expect(raidGain({ gold: 0, wood: 0 })).toEqual({ gold: 0, wood: 0 });
  });
  it('trophyDelta：赢加输扣、不扣到负、流浪海盗岛减半且没有防守方', () => {
    const w = trophyDelta(100, 100, 3);
    expect(w.att).toBe(25);
    expect(w.def).toBe(-25);
    const l = trophyDelta(100, 100, 0);
    expect(l.att).toBe(-10);
    expect(l.def).toBe(10);
    expect(trophyDelta(0, 0, 0)).toEqual({ att: 0, def: 5 + 5 });
    expect(trophyDelta(3, 0, 0).att).toBe(-3);
    expect(trophyDelta(100, 0, 3).def).toBe(0);
    const wd = trophyDelta(100, 100, 3, true);
    expect(wd.att).toBe(12);
    expect(wd.def).toBe(0);
  });
  it('shieldMs：90% 以上 12 小时，有拆 8 小时，没拆 0', () => {
    expect(shieldMs(100)).toBe(12 * 3600_000);
    expect(shieldMs(90)).toBe(12 * 3600_000);
    expect(shieldMs(89)).toBe(8 * 3600_000);
    expect(shieldMs(1)).toBe(8 * 3600_000);
    expect(shieldMs(0)).toBe(0);
  });
  it('wandererIsland / wandererGain', () => {
    const a = wandererIsland(0, 1, 2);
    const b = wandererIsland(0, 1, 3);
    expect(a.hq).toBeLessThanOrEqual(2);
    expect(a.layout.length).toBe(b.layout.length);
    expect(a.layout.some((p, i) => p.x !== b.layout[i]!.x)).toBe(true);
    expect(wandererIsland(0, 1, 2)).toEqual(a);
    expect(wandererIsland(99999, 1, 2).hq).toBeLessThanOrEqual(2);
    expect(wandererGain({ gold: 700, wood: 450 }, 100)).toEqual({ gold: 350, wood: 225 });
    expect(wandererGain({ gold: 700, wood: 450 }, 0)).toEqual({ gold: 0, wood: 0 });
  });
  it('sanitizeActions：只留认得的字段，不合格整串作废', () => {
    const army = armyFor(newProfile());
    const ok = sanitizeActions([{ t: 3, type: 'land', boat: 0, x: -150, y: 1000, stars: 3, junk: 1 }], army);
    expect(ok).toEqual([{ t: 3, type: 'land', boat: 0, x: -150, y: 1000 }]);
    expect(sanitizeActions([{ t: 0, type: 'skill', skill: 'barrage', x: 0, y: 0 }], army)).toHaveLength(1);
    expect(sanitizeActions([{ t: 0, type: 'skill', skill: 'nope', x: 0, y: 0 }], army)).toBeNull();
    expect(sanitizeActions([{ t: 0, type: 'land', boat: 9, x: 0, y: 0 }], army)).toBeNull();
    expect(sanitizeActions([{ t: -1, type: 'land', boat: 0, x: 0, y: 0 }], army)).toBeNull();
    expect(sanitizeActions([{ t: 0, type: 'land', boat: 0, x: 1.5, y: 0 }], army)).toBeNull();
    expect(sanitizeActions([{ t: 0, type: 'land', boat: 0, x: 1e9, y: 0 }], army)).toBeNull();
    expect(sanitizeActions([{ t: 0, type: 'boom', x: 0, y: 0 }], army)).toBeNull();
    expect(sanitizeActions('x', army)).toBeNull();
    const many = Array.from({ length: MAX_ACTIONS + 1 }, () => ({ t: 0, type: 'land', boat: 0, x: -100, y: 0 }));
    expect(sanitizeActions(many, army)).toBeNull();
    expect(sanitizeActions(many.slice(1), army)).toHaveLength(MAX_ACTIONS);
  });
});

const NOW = 1_800_000_000_000;
function entry(over: Partial<HarborEntry> = {}): HarborEntry {
  return { id: 'x', trophies: 100, hq: 1, shieldUntil: 0, protectUntil: 0, lockUntil: 0, activeAt: NOW - 3600_000, ...over };
}
const Q: Omit<PickReq, 'rand' | 'self'> = { attackerId: 'me', trophies: 100, hq: 1, exclude: [], now: NOW };

describe('匹配排除', () => {
  it('eligible：合格的通过，各条排除各自生效（含边界）', () => {
    expect(eligible(entry(), Q)).toBe(true);
    expect(eligible(entry({ id: 'me' }), Q)).toBe(false);
    expect(eligible(entry(), { ...Q, exclude: ['x'] })).toBe(false);
    expect(eligible(entry({ shieldUntil: NOW + 1 }), Q)).toBe(false);
    expect(eligible(entry({ shieldUntil: NOW }), Q)).toBe(true);
    expect(eligible(entry({ protectUntil: NOW + 1 }), Q)).toBe(false);
    expect(eligible(entry({ lockUntil: NOW }), Q)).toBe(false);
    expect(eligible(entry({ lockUntil: NOW - 1 }), Q)).toBe(true);
    expect(eligible(entry({ activeAt: NOW - ONLINE_MS + 1 }), Q)).toBe(false);
    expect(eligible(entry({ activeAt: NOW - ONLINE_MS }), Q)).toBe(true);
    expect(eligible(entry({ trophies: 251 }), Q)).toBe(false);
    expect(eligible(entry({ trophies: 250 }), Q)).toBe(true);
    expect(eligible(entry({ trophies: 0 }), Q)).toBe(true);
    expect(eligible(entry({ hq: 3 }), Q)).toBe(false);
    expect(eligible(entry({ hq: 2 }), Q)).toBe(true);
  });
  it('HarborCore.pick：只挑合格的，挑中后上锁，再挑挑不到', async () => {
    const h = new HarborCore(new MemHarbor());
    await h.upsert([entry({ id: 'a' }), entry({ id: 'b', shieldUntil: NOW + 5 })]);
    await h.upsert([entry({ id: 'c', hq: 4 }), entry({ id: 'me' })]);
    await h.upsert([entry({ id: 'd', lockUntil: NOW + 5 }), entry({ id: 'e', trophies: 900 })]);
    await h.upsert([entry({ id: 'f', activeAt: NOW }), entry({ id: 'g', protectUntil: NOW + 5 })]);
    const first = await h.pick({ ...Q, rand: 0.5 }, 240_000);
    expect(first.id).toBe('a');
    expect((await h.pick({ ...Q, rand: 0.5 }, 240_000)).id).toBeNull();
    // 锁过期后又能挑
    expect((await h.pick({ ...Q, now: NOW + 240_001, rand: 0 }, 240_000)).id).toBe('a');
    expect((await h.pick({ ...Q, exclude: ['a'], now: NOW + 999_999_999, rand: 0 }, 1)).id).not.toBe('a');
  });
  it('HarborCore.pick：rand 选下标；重建后从存储读回', async () => {
    const kv = new MemHarbor();
    const h = new HarborCore(kv);
    await h.upsert([entry({ id: 'a' }), entry({ id: 'b' })]);
    await h.upsert([entry({ id: 'c' })]);
    expect((await h.pick({ ...Q, rand: 0.99 }, 1000)).id).toBe('c');
    const h2 = new HarborCore(kv);
    expect(kv.rows.size).toBe(3);
    expect((await h2.pick({ ...Q, rand: 0 }, 1000)).id).toBe('a');
    // 进攻方自己那一行写进索引
    await h2.pick({ ...Q, rand: 0, self: entry({ id: 'me', trophies: 100 }) }, 1000);
    expect(kv.rows.has('me')).toBe(true);
  });
});

function free(p: Profile, kind: BuildingKind): { x: number; y: number } {
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (canPlace(p, kind, x, y)) return { x, y };
  throw new Error('no free spot');
}
function withB(p: Profile, kind: BuildingKind, level = 1, id = 100): Profile {
  const { x, y } = free(p, kind);
  const b: Placed = { id, kind, level, x, y };
  return { ...p, base: { ...p.base, buildings: [...p.base.buildings, b] } };
}
const clone = <T>(v: T): T => structuredClone(v);
const err = (v: unknown): string => {
  const r = validateBase(v);
  return r.ok ? 'OK' : r.error;
};

describe('validateBase', () => {
  it('新档通过，回规整过的 Profile', () => {
    const r = validateBase(newProfile());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.base.buildings).toHaveLength(newProfile().base.buildings.length);
  });
  it('JSON 往返后仍通过；多余字段被丢掉', () => {
    const p = { ...clone(newProfile()), evil: 1 } as unknown;
    const r = validateBase(JSON.parse(JSON.stringify(p)));
    expect(r.ok).toBe(true);
    if (r.ok) expect('evil' in r.value).toBe(false);
  });
  it('shape', () => {
    for (const v of [null, 1, 'x', [], {}, { ...newProfile(), v: 2 }, { ...newProfile(), res: null }]) expect(err(v)).toBe('shape');
    const p = clone(newProfile());
    p.base.buildings = [];
    expect(err(p)).toBe('shape');
  });
  it('building：未知种类、等级越界、坐标越界', () => {
    let p = clone(newProfile());
    (p.base.buildings[1] as unknown as { kind: string }).kind = 'nope';
    expect(err(p)).toBe('building');
    p = clone(newProfile());
    p.base.buildings[1]!.level = 0;
    expect(err(p)).toBe('building');
    p = clone(newProfile());
    p.base.buildings[1]!.x = 99;
    expect(err(p)).toBe('building');
    p = clone(newProfile());
    p.base.buildings[1]!.x = 1.5;
    expect(err(p)).toBe('building');
  });
  it('overlap / dup_id', () => {
    let p = clone(newProfile());
    const gm = p.base.buildings.find((b) => b.kind === 'goldmine')!;
    p.base.buildings.find((b) => b.kind === 'sawmill')!.x = gm.x + 1;
    p.base.buildings.find((b) => b.kind === 'sawmill')!.y = gm.y;
    expect(err(p)).toBe('overlap');
    p = clone(newProfile());
    p.base.buildings[7]!.id = p.base.buildings[6]!.id;
    expect(err(p)).toBe('dup_id');
  });
  it('no_hq：两座或没有主寨', () => {
    expect(err(withB(newProfile(), 'hq'))).toBe('no_hq');
    const p = clone(newProfile());
    p.base.buildings = p.base.buildings.filter((b) => b.kind !== 'hq');
    expect(err(p)).toBe('no_hq');
  });
  it('locked：主寨 1 级放 mortar；limit：多放一座炮', () => {
    expect(err(withB(newProfile(), 'mortar'))).toBe('locked');
    let p = newProfile();
    p = withB(p, 'cannon', 1, 100);
    p = withB(p, 'cannon', 1, 101);
    p = withB(p, 'cannon', 1, 102);
    p = withB(p, 'cannon', 1, 103);
    expect(err(p)).toBe('limit');
  });
  it('level：建筑等级超过主寨', () => {
    const p = clone(newProfile());
    p.base.buildings.find((b) => b.kind === 'goldmine')!.level = 2;
    expect(err(p)).toBe('level');
  });
  it('宝藏箱、分叉、英雄研究进攻防（规则版本 6）：宝藏箱留下；坏的分叉回 branch', () => {
    const p = clone(newProfile());
    let spot: [number, number] | null = null;
    for (let y = 0; y < ISLAND && !spot; y++) for (let x = 0; x < ISLAND && !spot; x++) if (canPlace(p, 'treasure', x, y)) spot = [x, y];
    p.base.buildings.push({ id: 999, kind: 'treasure', level: 1, x: spot![0], y: spot![1] });
    p.base.nextId = 1000;
    const cannon = p.base.buildings.find((b) => b.kind === 'cannon')!;
    (cannon as { branch?: string }).branch = 'pierce';
    (p.research as Record<string, number>).hero = 1;
    expect(err(p)).toBe('branch');
    delete (cannon as { branch?: string }).branch;
    const v = validateBase(p);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value.base.buildings.some((b) => b.kind === 'treasure')).toBe(true);
    expect(v.value.research.hero).toBe(1);
  });
  it('research：没有军械所、超过军械所、不认识的键', () => {
    const p = clone(newProfile());
    p.research = { sailor: 2 };
    expect(err(p)).toBe('research');
    p.research = { sailor: 1 };
    expect(err(p)).toBe('OK');
    (p.research as Record<string, number>).nope = 1;
    expect(err(p)).toBe('research');
    // 主寨 4 级、军械所 1 级：研究 2 超过军械所；军械所 2 级就可以
    let q = clone(newProfile());
    q.base.buildings.find((b) => b.kind === 'hq')!.level = 4;
    q = withB(q, 'armory', 1);
    q.research = { sailor: 2 };
    expect(err(q)).toBe('research');
    q.base.buildings.find((b) => b.kind === 'armory')!.level = 2;
    expect(err(q)).toBe('OK');
    q.research = { sailor: 7 };
    expect(err(q)).toBe('research');
  });
  it('boat：兵种未解锁、不是数组、太多', () => {
    const p = clone(newProfile());
    p.boats = [{ troop: 'captain' }];
    expect(err(p)).toBe('boat');
    expect(err({ ...newProfile(), boats: 'x' })).toBe('boat');
    expect(err({ ...newProfile(), boats: Array.from({ length: 33 }, () => ({ troop: 'sailor' })) })).toBe('boat');
    expect(err({ ...newProfile(), boats: [{ troop: 'nope' }] })).toBe('boat');
  });
  it('res：仓库容量随主寨等级上涨', () => {
    for (let hq = 2; hq <= HQ_LEVELS.length; hq++) {
      const lo = maxCapacity(hq - 1);
      const hi = maxCapacity(hq);
      expect(hi.gold, `hq ${hq}`).toBeGreaterThanOrEqual(lo.gold);
      expect(hi.wood, `hq ${hq}`).toBeGreaterThanOrEqual(lo.wood);
      expect(hi.gold + hi.wood, `hq ${hq}`).toBeGreaterThan(lo.gold + lo.wood);
    }
    expect(maxCapacity(1).gold).toBeGreaterThan(0);
  });
  it('res：快照报天文数字刷别人的掠夺——超过这个主寨等级的仓库总容量就拒收，正好封顶能过', () => {
    const cap = maxCapacity(1);
    expect(err({ ...newProfile(), res: { gold: cap.gold, wood: cap.wood } })).toBe('OK');
    expect(err({ ...newProfile(), res: { gold: cap.gold + 1, wood: 0 } })).toBe('res');
    expect(err({ ...newProfile(), res: { gold: 0, wood: cap.wood + 1 } })).toBe('res');
  });
  it('res：资源为负、非有限数、超大；stored 为负', () => {
    expect(err({ ...newProfile(), res: { gold: -1, wood: 0 } })).toBe('res');
    expect(err({ ...newProfile(), res: { gold: 1e10, wood: 0 } })).toBe('res');
    expect(err({ ...newProfile(), res: { gold: 1, wood: '5' } })).toBe('res');
    expect(err({ ...newProfile(), res: { gold: Number.NaN, wood: 0 } })).toBe('res');
    const p = clone(newProfile());
    p.base.buildings.find((b) => b.kind === 'goldmine')!.stored = -5;
    expect(err(p)).toBe('res');
  });
});
