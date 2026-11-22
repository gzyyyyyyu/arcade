import { describe, expect, it } from 'vitest';
import {
  RULES_VERSION, TD2_BATTERY, TD2_CRATE, createTd, runTd, runTdBot, stepTd, tdFingerprint, tdGrowthSetup, tdLanes, tdNextTide, tdPreview, tdSluiceCan,
} from '../src/core/index.ts';
import type { Placed, TdAction, TdLevel, TdSetup, TdState } from '../src/core/index.ts';
import { cellIdx } from '../src/core/grid.ts';
import { ensureGrid, inner } from '../src/core/tdstate.ts';

/** 守岛章末机制（tdmech.ts）：用了逐位可重放、各自的效果 */

function lvl(p: Partial<TdLevel> = {}): TdLevel {
  return { id: 't', name: 't', hq: 1, hpPct: 100, gold: 0, first: 1, waveTicks: 40, lanes: [{ x: 10, y: -2 }, { x: -2, y: 11 }], waves: [], kegs: [], obstacles: [], slots: [], ...p };
}
const base: Placed[] = [{ id: 1, kind: 'hq', level: 1, x: 9, y: 9 }, { id: 2, kind: 'treasure', level: 1, x: 10, y: 13 }];
const setup = (level: TdLevel): TdSetup => ({ layout: base, level, hero: 1, seed: 1, rules: RULES_VERSION, mode: 'campaign' });
function benchHero(s: TdState): void {
  s.hero.respawn = 1_000_000;
  s.hero.hp = 0;
}
const campaign = (id: string): TdSetup => {
  const r = tdGrowthSetup(id, 'suggest', 1);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe('潮汐水闸', () => {
  // 三波都从落潮路（下标 2）来；落潮只在第 1、2 波开
  const level = lvl({
    tide: { wave: 0, lane: { x: 11, y: 23 } },
    tideOpen: [1, 2],
    sluice: 1,
    waves: [0, 1, 2].map(() => ({ groups: [{ enemy: 'sailor' as const, n: 1, lane: 2, every: 1 }] })),
  });

  it('只有下一波落潮时能关；关上那一波的人改走 0 号路，预告、路线跟着变；用完就不能再关', () => {
    const s = createTd(setup(level));
    benchHero(s);
    expect(s.sluice).toEqual({ left: 1, shut: [] });
    expect(tdSluiceCan(s)).toBeNull(); // 第 0 波涨潮，用不着
    stepTd(s, [{ t: 0, type: 'sluice' }]);
    expect(s.sluice!.left).toBe(1);
    while (s.wave < 1) stepTd(s, []);
    expect(tdSluiceCan(s)).toBe('shut');
    expect(tdNextTide(s)).toBe(true);
    const ev = stepTd(s, [{ t: s.tick, type: 'sluice' }]);
    expect(ev).toContainEqual({ type: 'sluice', wave: 1, shut: true, left: 0 });
    expect(tdSluiceCan(s)).toBe('open');
    expect(tdNextTide(s)).toBe(false);
    expect(tdPreview(s, 1)[0]!.lanes.map((l) => l.lane)).toEqual([0]);
    const spawnY: number[] = [];
    while (s.wave < 3) for (const e of stepTd(s, [])) if (e.type === 'spawn') spawnY.push(e.y);
    for (let i = 0; i < 5; i++) for (const e of stepTd(s, [])) if (e.type === 'spawn') spawnY.push(e.y);
    // 第 1 波关了闸 → 北路；第 2 波没次数了，照常从南边落潮路来
    expect(spawnY.slice(0, 2).map((y) => (y > 1000 ? 'S' : 'N')).join('')).toBe('NS');
    expect(tdSluiceCan(s)).toBeNull();
  });

  it('关上后再按一下重新打开，次数退回；打开之后照常落潮', () => {
    const s = createTd(setup(level));
    benchHero(s);
    while (s.wave < 1) stepTd(s, []);
    stepTd(s, [{ t: s.tick, type: 'sluice' }]);
    const ev = stepTd(s, [{ t: s.tick, type: 'sluice' }]);
    expect(ev).toContainEqual({ type: 'sluice', wave: 1, shut: false, left: 1 });
    expect(s.sluice).toEqual({ left: 1, shut: [] });
    while (s.wave < 2) stepTd(s, []);
    expect(tdLanes(s)).toHaveLength(3);
  });

  it('同一串操作重放两次逐位一样', () => {
    const acts: TdAction[] = [{ t: 2, type: 'sluice' }, { t: 3, type: 'sluice' }, { t: 4, type: 'sluice' }];
    expect(tdFingerprint(runTd(setup(level), acts).state)).toBe(tdFingerprint(runTd(setup(level), acts).state));
  });

  it('战役只有 td11、td12 带水闸', () => {
    expect(createTd(campaign('td11')).sluice?.left).toBe(3);
    expect(createTd(campaign('td12')).sluice?.left).toBe(3);
    expect(createTd(campaign('td10')).sluice).toBeUndefined();
  });

  it('机器人会关闸，打出来的局能按它的操作逐位重放', () => {
    const st = campaign('td12');
    const r = runTdBot(st, 'normal');
    expect(r.actions.some((a) => a.type === 'sluice')).toBe(true);
    expect(tdFingerprint(runTd(st, r.actions).state)).toBe(tdFingerprint(r.state));
  }, 120_000);
});

describe('漂流补给箱', () => {
  // 第 0 波开打时，宝藏箱（10,13）南边的沙滩上漂来一个箱子；这一波的敌人走北路，离得远
  const level = lvl({
    crates: [{ wave: 0, x: 10, y: 23 }],
    // 第二组很晚才来：箱子漂走前这一局不会打完
    waves: [{ groups: [{ enemy: 'sailor' as const, n: 2, lane: 0, every: 200 }, { enemy: 'sailor' as const, n: 1, lane: 0, every: 1, delay: 2000 }] }],
    waveTicks: 4000,
  });
  const started = (): { s: TdState; ev: ReturnType<typeof stepTd> } => {
    const s = createTd(setup(level));
    const ev: ReturnType<typeof stepTd> = [];
    while (s.wave < 1) ev.push(...stepTd(s, []));
    return { s, ev };
  };

  it('开打时漂来；叫英雄去捡：拿到金币、技能马上好，捡完回原来的守点', () => {
    const { s, ev } = started();
    const drift = ev.find((e) => e.type === 'crate' && e.what === 'drift');
    expect(drift).toMatchObject({ x: 1050, y: 2350 });
    const box = s.drift!.crates[0]!;
    s.hero.kegReady = s.tick + 400;
    const post = { ...s.hero.post! };
    const gold0 = s.gold;
    stepTd(s, [{ t: s.tick, type: 'pickup', id: box.id }]);
    expect(s.drift!.chase).toBe(box.id);
    let pick: (typeof ev)[number] | undefined;
    for (let i = 0; i < 400 && !pick; i++) pick = stepTd(s, []).find((e) => e.type === 'crate' && e.what === 'pick');
    expect(pick).toBeDefined();
    const gold = (pick as { gold: number }).gold;
    expect(gold).toBeGreaterThanOrEqual(TD2_CRATE.minGold);
    expect(s.gold).toBeGreaterThanOrEqual(gold0 + gold);
    expect(s.hero.kegReady).toBeLessThanOrEqual(s.tick);
    expect(s.drift).toMatchObject({ crates: [], chase: -1 });
    expect(s.hero.goal).toEqual(post);
  });

  it('没人捡就漂走；另外指挥英雄会忘掉箱子', () => {
    const { s } = started();
    const box = s.drift!.crates[0]!;
    stepTd(s, [{ t: s.tick, type: 'pickup', id: box.id }]);
    stepTd(s, [{ t: s.tick, type: 'move', x: 1050, y: 1050 }]);
    expect(s.drift!.chase).toBe(-1);
    let gone = false;
    for (let i = 0; i <= TD2_CRATE.ticks && !gone; i++) gone = stepTd(s, []).some((e) => e.type === 'crate' && e.what === 'gone');
    expect(gone).toBe(true);
    expect(s.drift!.crates).toHaveLength(0);
  });

  it('战役里箱子漂到的格子英雄都走得到（占格表里是空地）', () => {
    for (const id of ['td05', 'td06']) {
      const st = campaign(id);
      const s = createTd(st);
      ensureGrid(s);
      for (const c of st.level.crates ?? []) expect({ id, c, occ: inner(s).occ[cellIdx(c.x, c.y)] }).toEqual({ id, c, occ: 0 });
    }
  });

  it('战役只有 td05、td06 带补给箱', () => {
    expect(createTd(campaign('td05')).drift).toBeDefined();
    expect(createTd(campaign('td06')).drift).toBeDefined();
    expect(createTd(campaign('td04')).drift).toBeUndefined();
  });

  it('机器人清完一波会去捡，打出来的局能按它的操作逐位重放', () => {
    const st = campaign('td05');
    const r = runTdBot(st, 'normal');
    expect(r.actions.some((a) => a.type === 'pickup')).toBe(true);
    expect(tdFingerprint(runTd(st, r.actions).state)).toBe(tdFingerprint(r.state));
  }, 120_000);
});

describe('岸防老炮', () => {
  // 一队水手和一群鹦鹉同时从北边上岸
  const level = lvl({
    battery: { x: 23, y: 18 },
    waves: [{ groups: [{ enemy: 'sailor' as const, n: 4, lane: 0, every: 1 }, { enemy: 'parrot' as const, n: 3, lane: 0, every: 1 }] }],
    waveTicks: 4000,
  });
  const landed = (): TdState => {
    const s = createTd(setup(level));
    benchHero(s);
    while (s.enemies.filter((e) => e.mode === 'in').length < 7) stepTd(s, []);
    return s;
  };

  it('1 秒后落地，炸地面的不炸飞的；冷却没好再打不起作用', () => {
    const s = landed();
    const sailor = s.enemies.find((e) => e.kind === 'sailor')!;
    const at = { x: sailor.x, y: sailor.y };
    const hp0 = new Map(s.enemies.map((e) => [e.id, e.hp]));
    const ev = stepTd(s, [{ t: s.tick, type: 'battery', ...at }]);
    const shot = ev.find((e) => e.type === 'battery');
    expect(shot).toMatchObject({ x0: 2350, y0: 1850, x1: at.x, y1: at.y });
    expect(s.battery!.ready).toBe(s.tick - 1 + TD2_BATTERY.cd);
    // 冷却里再打：没有新的一发
    expect(stepTd(s, [{ t: s.tick, type: 'battery', ...at }]).some((e) => e.type === 'battery')).toBe(false);
    let boom = false;
    for (let i = 0; i < TD2_BATTERY.delay + 2 && !boom; i++) boom = stepTd(s, []).some((e) => e.type === 'explode' && e.r === TD2_BATTERY.r);
    expect(boom).toBe(true);
    const hurt = (kind: string): boolean => s.enemies.some((e) => e.kind === kind && (e.hp < (hp0.get(e.id) ?? 0) || e.mode === 'dead'));
    expect(hurt('sailor')).toBe(true);
    expect(hurt('parrot')).toBe(false);
  });

  it('落点在格子外不打、不进冷却', () => {
    const s = landed();
    stepTd(s, [{ t: s.tick, type: 'battery', x: -900, y: 500 }]);
    expect(s.battery!.ready).toBe(0);
  });

  it('战役只有 td17、td18 带老炮', () => {
    expect(createTd(campaign('td17')).battery).toBeDefined();
    expect(createTd(campaign('td18')).battery).toBeDefined();
    expect(createTd(campaign('td16')).battery).toBeUndefined();
  });

  it('机器人会开炮，打出来的局能按它的操作逐位重放', () => {
    const st = campaign('td17');
    const r = runTdBot(st, 'normal');
    expect(r.actions.some((a) => a.type === 'battery')).toBe(true);
    expect(tdFingerprint(runTd(st, r.actions).state)).toBe(tdFingerprint(r.state));
  }, 120_000);
});
