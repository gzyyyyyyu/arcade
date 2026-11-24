import { describe, expect, it } from 'vitest';
import {
  RULES_VERSION, TD2_BATTERY, TD2_CRATE, TD2_DRAWBRIDGE, createTd, runTd, runTdBot, stepTd, tdFingerprint, tdGrowthSetup, tdLanes, tdNextTide, tdPreview, tdRoutes, tdSluiceCan,
} from '../src/core/index.ts';
import type { Placed, TdAction, TdLevel, TdSetup, TdState } from '../src/core/index.ts';
import { cellIdx, cellX } from '../src/core/grid.ts';
import { ensureGrid, inner } from '../src/core/tdstate.ts';
import { rallyOk } from '../src/core/tdcamp.ts';

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

describe('吊桥', () => {
  // 横穿整岛的一道水道（含海滩），只留东西两座 2×2 吊桥；东桥下面有一片雾区
  const b0 = [{ x: 4, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 7 }, { x: 5, y: 7 }];
  const b1 = [{ x: 16, y: 6 }, { x: 17, y: 6 }, { x: 16, y: 7 }, { x: 17, y: 7 }];
  const skip = new Set([...b0, ...b1].map((c) => `${c.x},${c.y}`));
  const water: Array<{ x: number; y: number }> = [];
  for (let y = 6; y <= 7; y++) for (let x = -3; x < 25; x++) if (!skip.has(`${x},${y}`)) water.push({ x, y });
  const level = lvl({
    lanes: [{ x: 10, y: -2 }],
    water,
    drawbridge: [b0, b1],
    fogZones: [{ x: 16, y: 9, r: 2.5 }],
    waves: [{ groups: [{ enemy: 'sailor' as const, n: 1, lane: 0, every: 1 }] }],
    waveTicks: 4000,
  });

  it('开局就能用，切换另一座放下并进 20 秒冷却；tdRoutes 和 tdPreview 立刻重算', () => {
    const s = createTd(setup(level));
    benchHero(s);
    expect(s.drawbridge).toEqual({ down: 0, ready: 0 });
    const xs = (cells: readonly number[]): number[] => cells.map((c) => Math.floor(cellX(c) / 100));
    expect(xs(tdRoutes(s)[0]!.cells).some((x) => x <= 5)).toBe(true);
    expect(tdPreview(s, 1)[0]!.lanes[0]!.enemies[0]!.fog).toBe(false);

    // 开局（tick 0）就能切换
    const ev = stepTd(s, [{ t: 0, type: 'drawbridge' }]);
    expect(ev).toContainEqual({ type: 'drawbridge', down: 1, ready: TD2_DRAWBRIDGE.cd });
    expect(s.drawbridge).toEqual({ down: 1, ready: TD2_DRAWBRIDGE.cd });
    expect(xs(tdRoutes(s)[0]!.cells).some((x) => x >= 16)).toBe(true);
    expect(tdPreview(s, 1)[0]!.lanes[0]!.enemies[0]!.fog).toBe(true);

    // 冷却里再按没用
    stepTd(s, [{ t: s.tick, type: 'drawbridge' }]);
    expect(s.drawbridge!.down).toBe(1);

    // 20 秒后又能切回来
    while (s.tick < TD2_DRAWBRIDGE.cd) stepTd(s, []);
    stepTd(s, [{ t: s.tick, type: 'drawbridge' }]);
    expect(s.drawbridge!.down).toBe(0);
  });

  it('桥上的人不受影响：收起时已经走到桥上的敌人照走完过桥，不会卡住', () => {
    const s = createTd(setup(level));
    benchHero(s);
    const onB0 = (x: number, y: number): boolean => b0.some((c) => c.x === Math.floor(x / 100) && c.y === Math.floor(y / 100));
    // 等敌人走到 0 号桥的第一格
    for (let i = 0; i < 600; i++) {
      stepTd(s, []);
      const e = s.enemies[0];
      if (e && onB0(e.x, e.y)) break;
    }
    const e = s.enemies[0]!;
    expect(onB0(e.x, e.y)).toBe(true);
    // 把 0 号桥收起（切到 1 号桥放下）
    stepTd(s, [{ t: s.tick, type: 'drawbridge' }]);
    expect(s.drawbridge!.down).toBe(1);
    // 敌人继续往前走过桥到达南岸（y >= 800）且到宝藏箱拿到宝藏
    let crossed = false;
    for (let i = 0; i < 600 && !s.over; i++) {
      stepTd(s, []);
      if (Math.floor(e.y / 100) >= 8) crossed = true;
      if (e.mode === 'out') break;
    }
    expect(crossed).toBe(true);
    expect(e.mode).toBe('out');
    // 同一串操作重放指纹逐位一样
    const acts: TdAction[] = [{ t: 0, type: 'drawbridge' }, { t: 400, type: 'drawbridge' }];
    expect(tdFingerprint(runTd(setup(level), acts).state)).toBe(tdFingerprint(runTd(setup(level), acts).state));
  });

  // 收起的桥是水面：桥上不留宝藏堆、集结点、英雄守点（不然捡宝藏的人借桥过海峡、营兵和英雄站在水上）
  const onB0 = (p: { x: number; y: number }): boolean => b0.some((c) => c.x === Math.floor(p.x / 100) && c.y === Math.floor(p.y / 100));
  const dry = (s: TdState, p: { x: number; y: number }): boolean => {
    ensureGrid(s);
    return inner(s).occ[cellIdx(Math.floor(p.x / 100), Math.floor(p.y / 100))] === 0;
  };

  it('桥上的宝藏堆：收起时挪到最近的岸上，枚数不变', () => {
    const s = createTd(setup(level));
    benchHero(s);
    s.piles.push({ x: 450, y: 650, n: 2, at: s.tick });
    stepTd(s, [{ t: s.tick, type: 'drawbridge' }]);
    expect(s.drawbridge!.down).toBe(1);
    const p = s.piles[0]!;
    expect(p.n).toBe(2);
    expect(onB0(p)).toBe(false);
    expect(dry(s, p)).toBe(true);
    expect(Math.abs(p.x - 450) + Math.abs(p.y - 650)).toBeLessThanOrEqual(200);
  });

  it('扛宝藏的倒在收起的桥上：宝藏落在最近的岸上', () => {
    const s = createTd(setup(level));
    benchHero(s);
    stepTd(s, [{ t: s.tick, type: 'drawbridge' }]);
    while (!s.enemies.length) stepTd(s, []);
    const e = s.enemies[0]!;
    Object.assign(e, { x: 550, y: 750, carry: 1, mode: 'out', hp: 1, stunUntil: 1_000_000 });
    s.hero.respawn = -1;
    s.hero.hp = s.hero.maxHp;
    Object.assign(s.hero, { x: 550, y: 950, goal: null, post: { x: 550, y: 950 } });
    for (let i = 0; i < 200 && !s.piles.length; i++) stepTd(s, []);
    expect(e.mode).toBe('dead');
    expect(s.piles).toHaveLength(1);
    expect(onB0(s.piles[0]!)).toBe(false);
    expect(dry(s, s.piles[0]!)).toBe(true);
  });

  it('集结点在桥上：收起时挪到最近的岸上（还在营的范围里）', () => {
    const lv = { ...level, gold: 2000, slots: [{ x: 6, y: 8 }] };
    const s = createTd({ ...setup(lv), camp: true });
    benchHero(s);
    stepTd(s, [{ t: s.tick, type: 'camp', slot: 0 }]);
    expect(s.camps).toHaveLength(1);
    stepTd(s, [{ t: s.tick, type: 'muster', slot: 0, x: 550, y: 750 }]);
    const c = s.camps![0]!;
    expect(onB0({ x: c.rx, y: c.ry })).toBe(true);
    stepTd(s, [{ t: s.tick, type: 'drawbridge' }]);
    expect(onB0({ x: c.rx, y: c.ry })).toBe(false);
    expect(dry(s, { x: c.rx, y: c.ry })).toBe(true);
    expect(rallyOk(s, 0, c.rx, c.ry)).toBe(true);
  });

  it('玩家让英雄站到桥上：收起后自己走到岸上，不站在水上', () => {
    const s = createTd(setup(level));
    stepTd(s, [{ t: s.tick, type: 'move', x: 450, y: 650 }]);
    for (let i = 0; i < 400 && !(onB0(s.hero) && !s.hero.goal); i++) stepTd(s, []);
    expect(onB0(s.hero)).toBe(true);
    stepTd(s, [{ t: s.tick, type: 'drawbridge' }]);
    expect(onB0(s.hero.post!)).toBe(false);
    for (let i = 0; i < 100; i++) stepTd(s, []);
    expect(onB0(s.hero)).toBe(false);
    expect(dry(s, s.hero)).toBe(true);
  });

  it('同一串操作（含桥上东西挪上岸）重放指纹逐位一样', () => {
    const lv = { ...level, gold: 2000, slots: [{ x: 6, y: 8 }] };
    const acts: TdAction[] = [{ t: 0, type: 'camp', slot: 0 }, { t: 1, type: 'muster', slot: 0, x: 550, y: 750 }, { t: 2, type: 'move', x: 450, y: 650 }, { t: 60, type: 'drawbridge' }];
    const st = { ...setup(lv), camp: true as const };
    expect(tdFingerprint(runTd(st, acts).state)).toBe(tdFingerprint(runTd(st, acts).state));
  });
});
