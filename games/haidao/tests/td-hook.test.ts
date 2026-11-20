import { describe, expect, it } from 'vitest';
import { RULES_VERSION, TD2_HERO_SKILL, createTd, runTd, runTdBot, stepTd, tdFingerprint, tdGrowthSetup } from '../src/core/index.ts';
import type { Placed, TdAction, TdEnemy, TdEnemyKind, TdLevel, TdMode, TdSetup, TdState } from '../src/core/index.ts';
import { cellIdx, cellX, cellY } from '../src/core/grid.ts';
import { hookPath } from '../src/core/tdhook.ts';
import { inner } from '../src/core/tdstate.ts';

/** 锚钩（tdhook.ts）：开放条件、整数格路线和挡住的边界、拖着走、冷却、逐位可复现 */

const HOOK = TD2_HERO_SKILL.hook;
const base: Placed[] = [{ id: 1, kind: 'hq', level: 1, x: 9, y: 9 }, { id: 2, kind: 'treasure', level: 1, x: 10, y: 13 }];
function lvl(enemy: TdEnemyKind = 'sailor'): TdLevel {
  return {
    id: 't', name: 't', hq: 1, hpPct: 100, gold: 0, first: 1, waveTicks: 4000, lanes: [{ x: 10, y: -2 }],
    waves: [{ groups: [{ enemy, n: 1, lane: 0, every: 1 }] }], kegs: [], obstacles: [], slots: [],
  };
}
const setup = (o: { mode?: TdMode; hero?: number; enemy?: TdEnemyKind } = {}): TdSetup => ({
  layout: base, level: lvl(o.enemy), hero: o.hero ?? HOOK.level, seed: 1, rules: RULES_VERSION, mode: o.mode ?? 'campaign',
});

/** 开局、等第一个敌人出来，把英雄和它摆到指定格中心（英雄不动、敌人先不走：都交给测试控制） */
function staged(at: { hero: [number, number]; foe: [number, number] }, o: Parameters<typeof setup>[0] = {}): { s: TdState; e: TdEnemy } {
  const s = createTd(setup(o));
  while (s.enemies.length === 0) stepTd(s, []);
  const e = s.enemies[0] as TdEnemy;
  s.hero.x = at.hero[0] * 100 + 50;
  s.hero.y = at.hero[1] * 100 + 50;
  s.hero.goal = { x: s.hero.x, y: s.hero.y };
  e.x = at.foe[0] * 100 + 50;
  e.y = at.foe[1] * 100 + 50;
  return { s, e };
}
function block(s: TdState, x: number, y: number): void {
  const I = inner(s);
  I.fixed[cellIdx(x, y)] = 2;
  I.ver++;
}
const cells = (pts: Array<[number, number]>): number[] => pts.map(([x, y]) => cellIdx(x, y));

describe('锚钩：哪些局有', () => {
  it('战役或海盗来袭、英雄 8 级起才有；悬赏守岛、大潮、护航、7 级都没有', () => {
    expect(createTd(setup()).hero.hookReady).toBe(0);
    expect(createTd(setup({ mode: 'home' })).hero.hookReady).toBe(0);
    for (const s of [setup({ hero: HOOK.level - 1 }), setup({ mode: 'live' }), setup({ mode: 'tide' }), setup({ mode: 'escort' })]) {
      expect(createTd(s).hero.hookReady).toBeUndefined();
    }
  });

  it('没有锚钩的局里按了也不起作用，整局指纹和不按一样', () => {
    for (const o of [{ mode: 'live' as const }, { hero: 7 }]) {
      const st = setup(o);
      const press: TdAction[] = [10, 30, 60].map((t) => ({ t, type: 'hook', id: 1 }));
      expect(tdFingerprint(runTd(st, press).state)).toBe(tdFingerprint(runTd(st, []).state));
    }
  });
});

describe('锚钩：整数格路线', () => {
  it('直线拉回最多 3 格，不进英雄脚下那格', () => {
    const { s, e } = staged({ hero: [3, 8], foe: [3, 4] });
    expect(hookPath(s, e, 3, 8)).toEqual(cells([[3, 5], [3, 6], [3, 7]]));
    const near = staged({ hero: [3, 6], foe: [3, 4] });
    expect(hookPath(near.s, near.e, 3, 6)).toEqual(cells([[3, 5]]));
  });

  it('直线上碰到挡路的格，停在它前一格', () => {
    const { s, e } = staged({ hero: [3, 8], foe: [3, 4] });
    block(s, 3, 6);
    expect(hookPath(s, e, 3, 8)).toEqual(cells([[3, 5]]));
  });

  it('斜着拉、两格之间的缝一侧被挡：一格也不拉（和流场一样不从缝里挤过去），只定住', () => {
    const { s, e } = staged({ hero: [6, 7], foe: [3, 4] });
    expect(hookPath(s, e, 6, 7)).toEqual(cells([[4, 5], [5, 6]]));
    block(s, 4, 4); // 只挡 (3,4)→(4,5) 这一步旁边的一格
    expect(hookPath(s, e, 6, 7)).toEqual([]);
    const t0 = s.tick;
    const ev = stepTd(s, [{ t: t0, type: 'hook', id: e.id }]);
    expect(ev).toContainEqual(expect.objectContaining({ type: 'hook', id: e.id, path: [], until: t0 + HOOK.fly + HOOK.stun }));
    expect(e.hook).toBeUndefined();
    for (let i = 0; i < HOOK.fly + HOOK.stun - 1; i++) stepTd(s, []);
    expect([e.x, e.y]).toEqual([350, 450]);
  });

  it('飞的不管挡路', () => {
    const { s, e } = staged({ hero: [6, 7], foe: [3, 4] }, { enemy: 'parrot' });
    block(s, 4, 4);
    block(s, 4, 5);
    expect(hookPath(s, e, 6, 7)).toEqual(cells([[4, 5], [5, 6]]));
  });
});

describe('锚钩：拖着走、定住、冷却', () => {
  it('钩子飞 4 拍，之后每 2 拍拖一格（每拍挪半格，不瞬移），到最后一格再定 20 拍', () => {
    const { s, e } = staged({ hero: [3, 8], foe: [3, 4] });
    const t0 = s.tick;
    stepTd(s, [{ t: t0, type: 'hook', id: e.id }]);
    expect(s.hero.hookReady).toBe(t0 + HOOK.cd);
    const ys: number[] = [];
    for (let i = 0; i < HOOK.fly + 3 * HOOK.perCell; i++) {
      stepTd(s, []);
      ys.push(e.y);
    }
    // 飞的几拍不动，之后每拍 50 单位
    expect(ys).toEqual([450, 450, 450, 500, 550, 600, 650, 700, 750, 750]);
    expect([e.x, e.y]).toEqual([cellX(cellIdx(3, 7)), cellY(cellIdx(3, 7))]);
    expect(e.hook).toBeUndefined();
    const until = t0 + HOOK.fly + 3 * HOOK.perCell + HOOK.stun;
    while (s.tick < until - 1) stepTd(s, []);
    expect(e.y).toBe(750); // 还定着
  });

  it('冷却没好、超出射程、首领都钩不了', () => {
    const far = staged({ hero: [3, 10], foe: [3, 4] });
    stepTd(far.s, [{ t: far.s.tick, type: 'hook', id: far.e.id }]);
    expect(far.s.hero.hookReady).toBe(0);
    const boss = staged({ hero: [3, 8], foe: [3, 4] }, { enemy: 'captain' });
    stepTd(boss.s, [{ t: boss.s.tick, type: 'hook', id: boss.e.id }]);
    expect(boss.s.hero.hookReady).toBe(0);
    const { s, e } = staged({ hero: [3, 8], foe: [3, 4] });
    stepTd(s, [{ t: s.tick, type: 'hook', id: e.id }]);
    const ready = s.hero.hookReady;
    for (let i = 0; i < 40; i++) stepTd(s, []);
    stepTd(s, [{ t: s.tick, type: 'hook', id: e.id }]);
    expect(s.hero.hookReady).toBe(ready);
  });
});

describe('锚钩：逐位可复现', () => {
  it('同一串操作重放两次指纹一样', () => {
    const st = setup();
    const press: TdAction[] = [];
    for (let t = 20; t < 3000; t += 37) press.push({ t, type: 'hook', id: 1 + (t % 5) });
    expect(tdFingerprint(runTd(st, press).state)).toBe(tdFingerprint(runTd(st, press).state));
  });

  it('满养成战役局（英雄 8 级）普通机器人会用锚钩，重放两次一样', () => {
    const r = tdGrowthSetup('td16', 'max', 3);
    if (!r.ok) throw new Error(r.error);
    const a = runTdBot(r.value, 'normal');
    const b = runTdBot(r.value, 'normal');
    expect(a.actions.some((x) => x.type === 'hook')).toBe(true);
    expect(tdFingerprint(a.state)).toBe(tdFingerprint(b.state));
  });
});
