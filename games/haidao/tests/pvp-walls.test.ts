import { describe, expect, it } from 'vitest';
import { HQ_LEVELS, botActions, newProfile, presetLayout } from '../src/core/index.ts';
import type { BuildingKind, Placed, Profile } from '../src/core/index.ts';
import { raidSetup, replayRaid } from '../src/core/pvp.ts';
import { validateBase } from '../src/core/validate.ts';
import { sampleArmy } from '../tools/sample.ts';

/** 0.3.0 的城墙、主寨 8 级、掉宝装饰进了快照校验；满墙的岛服务端重放要在预算内 */

/** 主寨 hq 级、按名额摆满 kinds 的岛（坐标交给推荐布局 presetLayout 排） */
function island(hq: number, extra: Partial<Record<BuildingKind, number>>, cosmetics?: string[]): Profile {
  const p = newProfile();
  let id = 100;
  const list: Placed[] = p.base.buildings.filter((b) => b.kind !== 'palm').map((b) => (b.kind === 'hq' ? { ...b, level: hq } : b));
  for (const [kind, n] of Object.entries(extra) as [BuildingKind, number][]) {
    for (let i = 0; i < n; i++) list.push({ id: id++, kind, level: kind === 'wall' ? Math.min(hq, 6) : 1, x: 0, y: 0 });
  }
  const prof: Profile = { ...p, base: { buildings: list, nextId: id }, ...(cosmetics ? { cosmetics } : {}) };
  return { ...prof, base: { ...prof.base, buildings: presetLayout(prof, 'turtle') } };
}

const json = (p: Profile): unknown => {
  const o = JSON.parse(JSON.stringify(p)) as Record<string, unknown>;
  return o;
};

describe('快照校验：城墙、主寨 8 级、掉宝装饰', () => {
  it('主寨 8 级、按名额摆满城墙（60 段）能过；多一段回 limit', () => {
    const max = HQ_LEVELS[7]?.limits.wall ?? 0;
    expect(max).toBe(60);
    const ok = island(8, { wall: max, cannon: 3 });
    expect(ok.base.buildings.filter((b) => b.kind === 'wall')).toHaveLength(max);
    expect(validateBase(json(ok))).toMatchObject({ ok: true });
    const raw = json(ok) as { base: { buildings: Placed[] } };
    raw.base.buildings.push({ id: 9999, kind: 'wall', level: 1, x: 21, y: 21 });
    // 先确认那一格空着，免得测成 overlap
    const r = validateBase(raw);
    expect(r.ok ? 'ok' : r.error).toMatch(/limit|overlap/);
  });
  it('各级城墙名额按 HQ_LEVELS：主寨 2 级 10 段过、11 段回 limit；主寨 1 级没开放回 locked', () => {
    expect(validateBase(json(island(2, { wall: 10 })))).toMatchObject({ ok: true });
    expect(validateBase(json(island(2, { wall: 11 })))).toMatchObject({ ok: false, error: 'limit' });
    expect(validateBase(json(island(1, { wall: 1 })))).toMatchObject({ ok: false, error: 'locked' });
  });
  it('城墙等级不超过主寨', () => {
    const p = island(3, { wall: 2 });
    const raw = json(p) as { base: { buildings: Placed[] } };
    for (const b of raw.base.buildings) if (b.kind === 'wall') b.level = 4;
    expect(validateBase(raw)).toMatchObject({ ok: false, error: 'level' });
  });
  it('掉宝装饰：快照带收藏时必须已拥有；没带收藏的旧快照放行', () => {
    expect(validateBase(json(island(2, { statue: 1 }, ['deco:statue'])))).toMatchObject({ ok: true });
    expect(validateBase(json(island(2, { statue: 1 }, [])))).toMatchObject({ ok: false, error: 'deco' });
    const legacy = json(island(2, { chest: 1 })) as Record<string, unknown>;
    delete legacy.cosmetics;
    expect(validateBase(legacy)).toMatchObject({ ok: true });
    // 名额照样管：一种装饰最多 1 个
    expect(validateBase(json(island(2, { flagpole: 2 }, ['deco:flagpole'])))).toMatchObject({ ok: false, error: 'limit' });
    // 守岛第四章全部过关送的「海盗王的舵轮」同一条规矩
    expect(validateBase(json(island(2, { wheel: 1 }, ['deco:wheel'])))).toMatchObject({ ok: true });
    expect(validateBase(json(island(2, { wheel: 1 }, [])))).toMatchObject({ ok: false, error: 'deco' });
  });
});

describe('满墙的岛：服务端重放', () => {
  it('规则版本 5 的核心重放和浏览器一致，用时在预算内（本机约 150 毫秒，负载高时放宽到 2 秒）', () => {
    const p = island(8, { wall: 60, cannon: 6, gunTower: 6, mortar: 4 });
    const v = validateBase(json(p));
    expect(v.ok ? 'ok' : v.error).toBe('ok');
    const layout = v.ok ? v.value.base.buildings : [];
    const setup = raidSetup(layout, sampleArmy(6), 4242);
    const acts = botActions(setup, 'normal');
    const t0 = performance.now();
    const a = replayRaid(setup, acts);
    const ms = performance.now() - t0;
    expect(replayRaid(setup, acts).fingerprint).toBe(a.fingerprint);
    expect(ms).toBeLessThan(2000);
  });
});
