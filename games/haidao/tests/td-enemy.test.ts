import { describe, expect, it } from 'vitest';
import { TD2_ENEMIES } from '../src/content/td2units.ts';
import { RULES_VERSION, createTd, stepTd, tdBotActions, tdGrowthSetup } from '../src/core/index.ts';
import type { Placed, TdAction, TdEnemyKind, TdEvent, TdLevel, TdSetup, TdState } from '../src/core/index.ts';
import { TD_ENEMY_ARMOR } from '../src/core/td2types.ts';
import { cellIdx } from '../src/core/grid.ts';
import { ensureGrid, inner } from '../src/core/tdstate.ts';

/**
 * 第六章的新敌人（td.md 批 3、批 4）：冲锋手扛着宝藏回程变慢；盾鼓手让身边同伴挨直射只吃七成；
 * 热气球打下来落 4 人、飘到箱子边落 6 人；铁潮舰长三段（海上 → 上岸带两个鼓手 → 冲锋），只有最后一段给金。
 */

function lvl(p: Partial<TdLevel> = {}): TdLevel {
  return { id: 't', name: 't', hq: 1, hpPct: 100, gold: 2000, first: 0, waveTicks: 4000, lanes: [{ x: 10, y: -2 }], waves: [], kegs: [], obstacles: [], slots: [], ...p };
}
const base: Placed[] = [{ id: 1, kind: 'hq', level: 1, x: 16, y: 16 }, { id: 2, kind: 'treasure', level: 1, x: 10, y: 15 }];
function setup(level: TdLevel, extra: Partial<TdSetup> = {}): TdSetup {
  return { layout: base, level, hero: 1, seed: 1, rules: RULES_VERSION, mode: 'campaign', ...extra };
}
function bench(s: TdState): void {
  s.hero.respawn = 1_000_000;
  s.hero.hp = 0;
}
/** 一波一组 */
const one = (enemy: TdEnemyKind, n = 1, every = 10): TdLevel['waves'] => [{ groups: [{ enemy, n, lane: 0, every }] }];
function run(s: TdState, ticks: number, look: (s: TdState, ev: TdEvent[]) => boolean | undefined = () => false, acts: (s: TdState) => TdAction[] = () => []): TdEvent[] {
  const all: TdEvent[] = [];
  for (let i = 0; i < ticks && !s.over; i++) {
    const ev = stepTd(s, acts(s));
    all.push(...ev);
    if (look(s, ev)) break;
  }
  return all;
}
const walkable = (s: TdState, x: number, y: number): boolean => {
  ensureGrid(s);
  return inner(s).occ[cellIdx(Math.floor(x / 100), Math.floor(y / 100))] === 0;
};

describe('冲锋手', () => {
  it('去的时候速度 10，扛着宝藏回船只有 5；布衣', () => {
    expect(TD2_ENEMIES.charger.speed).toBe(2 * TD2_ENEMIES.sailor.speed);
    expect(TD2_ENEMIES.charger.carrySpeed).toBe(5);
    expect(TD_ENEMY_ARMOR.charger).toBe('cloth');
    const s = createTd(setup(lvl({ waves: one('charger') })));
    bench(s);
    const steps: { in: number[]; out: number[] } = { in: [], out: [] };
    let last: { x: number; y: number; mode: string } | null = null;
    run(s, 3000, (st) => {
      const e = st.enemies[0];
      if (!e) return;
      if (last && last.mode === e.mode && (e.mode === 'in' || (e.mode === 'out' && e.carry > 0))) {
        const d = Math.max(Math.abs(e.x - last.x), Math.abs(e.y - last.y));
        if (d > 0) (e.mode === 'in' ? steps.in : steps.out).push(d);
      }
      last = { x: e.x, y: e.y, mode: e.mode };
      return e.mode === 'gone';
    });
    expect(steps.in.length).toBeGreaterThan(10);
    expect(steps.out.length).toBeGreaterThan(10);
    expect(Math.max(...steps.in)).toBe(10);
    expect(Math.max(...steps.out)).toBe(5);
  });
});

describe('盾鼓手', () => {
  /** 登陆口边上一座塔打第一个水手的第一下伤害；drum：和水手同时上岸一个盾鼓手 */
  function firstHit(kind: 'gunTower' | 'mortar', drum: boolean): number {
    const waves: TdLevel['waves'] = [{ groups: [{ enemy: 'sailor', n: 1, lane: 0, every: 1 }, ...(drum ? [{ enemy: 'drummer' as const, n: 1, lane: 0, every: 1 }] : [])] }];
    const s = createTd(setup(lvl({ waves, slots: [{ x: 12, y: 1 }] })));
    bench(s);
    let sailor = -1;
    let dmg = -1;
    run(
      s,
      2000,
      (st, ev) => {
        if (sailor < 0) sailor = st.enemies.find((e) => e.kind === 'sailor')?.id ?? -1;
        for (const e of ev) if (e.type === 'hit' && e.id === sailor) dmg = e.dmg;
        return dmg >= 0;
      },
      (st) => (st.tick === 1 ? [{ t: st.tick, type: 'build', slot: 0, kind }] : []),
    );
    return dmg;
  }
  it('身边的同伴挨枪弹直射只吃 70%；臼炮（溅射）不打折', () => {
    const plain = firstHit('gunTower', false);
    expect(plain).toBeGreaterThan(0);
    expect(firstHit('gunTower', true)).toBe(Math.floor((plain * TD2_ENEMIES.drummer.drum!.pct) / 100));
    const splash = firstHit('mortar', false);
    expect(splash).toBeGreaterThan(0);
    expect(firstHit('mortar', true)).toBe(splash);
  });
  it('重甲；自己和首领不吃这个减伤（数据）', () => {
    expect(TD_ENEMY_ARMOR.drummer).toBe('heavy');
    expect(TD2_ENEMIES.drummer.drum).toEqual({ r: 250, pct: 70 });
    for (const k of ['tyrant', 'tyrantRun', 'tyrantShip'] as const) expect(TD2_ENEMIES[k].boss).toBe(true);
  });
});

describe('热气球', () => {
  it('不拿宝藏，飘到箱子边自己落下 6 个水手，然后消失', () => {
    const s = createTd(setup(lvl({ waves: one('balloon') })));
    bench(s);
    let landed: TdEvent[] = [];
    run(s, 6000, (_, ev) => {
      if (ev.some((e) => e.type === 'land')) {
        landed = ev;
        return true;
      }
    });
    expect(landed.filter((e) => e.type === 'spawn' && e.kind === 'sailor')).toHaveLength(TD2_ENEMIES.balloon.land!.near);
    expect(s.enemies.find((e) => e.kind === 'balloon')!.mode).toBe('gone');
    expect(s.lost).toBe(0);
    for (const e of s.enemies.filter((q) => q.kind === 'sailor')) expect(walkable(s, e.x, e.y)).toBe(true);
  });
  it('半路被打下来：原地落 4 个水手，都落在能走的格（水面、墙上挪到旁边）', () => {
    // 一道水面横在登陆口和箱子中间：在水上空被打下，人要挪到岸上
    const water = Array.from({ length: 22 }, (_, x) => [{ x, y: 4 }, { x, y: 5 }]).flat();
    const s = createTd(setup(lvl({ waves: one('balloon'), water, slots: [{ x: 8, y: 6 }] })));
    bench(s);
    let died: TdEvent[] = [];
    run(
      s,
      6000,
      (st, ev) => {
        const b = st.enemies.find((e) => e.kind === 'balloon');
        if (b && b.mode === 'in' && Math.floor(b.y / 100) >= 4 && Math.floor(b.y / 100) <= 5) b.hp = 1;
        if (ev.some((e) => e.type === 'die' && e.kind === 'balloon')) {
          died = ev;
          return true;
        }
      },
      (st) => (st.tick === 1 ? [{ t: st.tick, type: 'build', slot: 0, kind: 'gunTower' }] : []),
    );
    const crew = died.filter((e) => e.type === 'spawn' && e.kind === 'sailor');
    expect(crew).toHaveLength(TD2_ENEMIES.balloon.land!.shot);
    for (const c of crew) if (c.type === 'spawn') expect(walkable(s, c.x, c.y), `${c.x},${c.y}`).toBe(true);
  });
});

describe('铁潮舰长（td34）', () => {
  it('三段护甲不同：木船 → 重甲 → 布衣；只有最后一段给金', () => {
    expect([TD_ENEMY_ARMOR.tyrantShip, TD_ENEMY_ARMOR.tyrant, TD_ENEMY_ARMOR.tyrantRun]).toEqual(['wood', 'heavy', 'cloth']);
    expect(TD2_ENEMIES.tyrantShip.gold).toBe(0);
    expect(TD2_ENEMIES.tyrant.gold).toBe(0);
    expect(TD2_ENEMIES.tyrantRun.gold).toBeGreaterThan(0);
  });
  it('血到 60% 换成岸上的舰长（站在能走的格）并带两个盾鼓手，到 25% 换成冲锋；换形态不算打死', () => {
    const r = tdGrowthSetup('td34', 'max', 1);
    if (!r.ok) throw new Error(r.error);
    const s = createTd(r.value);
    const bot = tdBotActions('normal', 1);
    const phases: Array<{ kind: TdEnemyKind; drummers: number; at: { x: number; y: number } }> = [];
    const deaths: TdEnemyKind[] = [];
    while (!s.over) {
      const ev = stepTd(s, bot(s));
      for (const e of ev) {
        if (e.type === 'die' && (e.kind === 'tyrantShip' || e.kind === 'tyrant' || e.kind === 'tyrantRun')) deaths.push(e.kind);
        if (e.type !== 'phase') continue;
        const n = s.enemies.find((q) => q.id === e.next)!;
        phases.push({ kind: e.kind, drummers: ev.filter((q) => q.type === 'spawn' && q.kind === 'drummer').length, at: { x: n.x, y: n.y } });
      }
    }
    expect(phases.map((p) => p.kind)).toEqual(['tyrant', 'tyrantRun']);
    expect(phases[0]!.drummers).toBe(2);
    expect(phases[1]!.drummers).toBe(0);
    expect(walkable(s, phases[0]!.at.x, phases[0]!.at.y)).toBe(true);
    expect(deaths).toEqual(['tyrantRun']);
  }, 120_000);
});
