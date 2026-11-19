import { describe, expect, it } from 'vitest';
import { TD2_ENEMIES, TD2_FLEET, TD_SEA_RANGE } from '../src/content/td2units.ts';
import { TD2_LEVEL_BY_ID } from '../src/content/tdmaps.ts';
import { RULES_SINCE, RULES_VERSION, createTd, stepTd, tdBotActions, tdGrowthSetup } from '../src/core/index.ts';
import { GRID, cellIdx } from '../src/core/grid.ts';
import { fleetAt } from '../src/core/tdmech.ts';
import { HIT_HERO, targetable, tdTowerRange } from '../src/core/tdstate.ts';
import type { TdEvent, TdState } from '../src/core/index.ts';

/**
 * 守岛第四章（规则版本 18，DESIGN 10.6e）：水面格谁都走不过去、军医给身边的同伴回血、炮艇停在海上炸哑塔到点开走、
 * 海上的目标只有射程够远的塔打得到。这些都只由关卡（water）和敌人种类打开，前 18 关不受影响（指纹锁在 td-golden）。
 */

function setup(id: string, seed = 1, rules = RULES_VERSION) {
  const r = tdGrowthSetup(id, 'suggest', seed);
  if (!r.ok) throw new Error(id);
  return { ...r.value, rules };
}

/** 机器人打一局，每拍把局面和这拍的事件交给 look；look 返回 true 就停 */
function play(id: string, look: (s: TdState, ev: TdEvent[]) => boolean | undefined, seed = 1): TdState {
  const st = setup(id, seed);
  const s = createTd(st);
  const bot = tdBotActions('normal', seed);
  while (!s.over) if (look(s, stepTd(s, bot(s)))) break;
  return s;
}

const water = (id: string): Set<string> => new Set((TD2_LEVEL_BY_ID.get(id)!.water ?? []).map((c) => `${c.x},${c.y}`));
const cellKey = (x: number, y: number): string => `${Math.floor(x / 100)},${Math.floor(y / 100)}`;

describe('水面', () => {
  it('双子岛、火山口：一整局下来地上的敌人一步都没踩进水里（飞的不算）', () => {
    for (const id of ['td19', 'td21']) {
      const w = water(id);
      expect(w.size, id).toBeGreaterThan(0);
      play(id, (s) => {
        for (const e of s.enemies) {
          if ((e.mode !== 'in' && e.mode !== 'out') || e.kind === 'parrot' || e.kind === 'macaw' || e.kind === 'gunboat') continue;
          expect(w.has(cellKey(e.x, e.y)), `${id} ${e.kind} 在水里`).toBe(false);
        }
      });
    }
  }, 60_000);

  it('双子岛：从北边上岸的人都从桥上过（走过桥的格子）', () => {
    const bridge = new Set((TD2_LEVEL_BY_ID.get('td19')!.bridges ?? []).map((c) => `${c.x},${c.y}`));
    expect(bridge.size).toBe(4);
    let crossed = 0;
    play('td19', (s) => {
      for (const e of s.enemies) if (e.mode === 'in' && e.kind === 'sailor' && bridge.has(cellKey(e.x, e.y))) crossed++;
      return crossed > 0;
    });
    expect(crossed).toBeGreaterThan(0);
  });

  it('规则版本 18 以前不建水面（第四章的关只在 18 起有，这里只锁住闸门）', () => {
    const lv = TD2_LEVEL_BY_ID.get('td19')!;
    const c = lv.water![0]!;
    const occ = (rules: number): number => {
      const s = createTd(setup('td19', 1, rules));
      return (s.internal as { occ: Uint8Array }).occ[cellIdx(c.x, c.y)] ?? -1;
    };
    expect(occ(RULES_SINCE.tdChapter4)).toBe(2);
    expect(occ(RULES_SINCE.tdChapter4 - 1)).not.toBe(2);
  });
});

describe('军医', () => {
  it('每秒给 2 格内掉了血的同伴回 3% 最大血，自己不回', () => {
    const hl = TD2_ENEMIES.medic.heal!;
    let checked = false;
    // 回血在开拍时 tick 是 20 的倍数的那一拍（stepTd 最后才 tick++）
    play('td19', (s) => {
      if (s.tick % 20 !== 19) return;
      const m = s.enemies.find((e) => e.kind === 'medic' && e.mode === 'in');
      if (!m) return;
      const near = s.enemies.find((e) => e !== m && e.mode === 'in' && e.kind !== 'captain' && (e.x - m.x) ** 2 + (e.y - m.y) ** 2 <= (hl.r - 40) ** 2);
      if (!near) return;
      stepTd(s, []);
      near.hp = Math.max(1, Math.floor(near.maxHp / 2));
      m.hp = Math.max(1, m.hp - 10);
      const before = near.hp;
      const mBefore = m.hp;
      // 这一拍把塔拿开，免得同一拍挨打把回的血抵掉
      const towers = s.towers;
      s.towers = [];
      const ev = stepTd(s, []);
      s.towers = towers;
      if (near.mode !== 'in' || m.mode !== 'in') return;
      expect(ev.some((e) => e.type === 'heal' && e.id === m.id)).toBe(true);
      expect(near.hp - before).toBe(Math.max(1, Math.floor((near.maxHp * hl.pct) / 100)));
      expect(m.hp).toBeLessThanOrEqual(mBefore);
      checked = true;
      return true;
    });
    expect(checked).toBe(true);
  });
});

describe('炮艇', () => {
  it('停在原地不上岸，隔一阵炸哑射程内最近的一座塔，停够 40 秒开走、不丢宝藏', () => {
    const sh = TD2_ENEMIES.gunboat.shell!;
    const seen = new Map<number, { x: number; y: number; born: number }>();
    let shells = 0;
    let jams = 0;
    let sailed = 0;
    play('td21', (s, ev) => {
      for (const e of s.enemies) {
        if (e.kind !== 'gunboat' || (e.mode !== 'in' && e.mode !== 'out')) continue;
        const was = seen.get(e.id);
        if (!was) seen.set(e.id, { x: e.x, y: e.y, born: s.tick });
        else {
          expect(e.x).toBe(was.x);
          expect(e.y).toBe(was.y);
        }
      }
      for (const x of ev) {
        if (x.type === 'shell') {
          shells++;
          expect(s.towers.some((q) => q.id === x.tower)).toBe(true);
          expect((x.x1 - x.x0) ** 2 + (x.y1 - x.y0) ** 2).toBeLessThanOrEqual(sh.range * sh.range);
          // 打中的塔哑到这一拍之后 jamTicks 拍（已经哑得更久的不再发 jam 事件）
          const j = ev.find((q) => q.type === 'jam' && q.id === x.tower);
          if (j && j.type === 'jam') expect(j.until).toBe(s.tick - 1 + sh.jamTicks);
          if (j) jams++;
        }
        if (x.type === 'sail') {
          sailed++;
          const w = seen.get(x.id)!;
          expect(s.tick - w.born).toBeGreaterThanOrEqual(sh.moor - 1);
        }
      }
    });
    expect(seen.size).toBeGreaterThan(0);
    expect(shells).toBeGreaterThan(0);
    expect(jams).toBeGreaterThan(0);
    expect(sailed).toBeGreaterThan(0);
  });

  it('海上的炮艇只有射程不小于 TD_SEA_RANGE 的塔打得到，英雄打不到', () => {
    let done = false;
    play('td21', (s) => {
      const g = s.enemies.find((e) => e.kind === 'gunboat' && e.mode === 'in');
      if (!g) return;
      expect(targetable(s, g, HIT_HERO)).toBe(false);
      expect(targetable(s, g, HIT_HERO, TD_SEA_RANGE - 1)).toBe(false);
      expect(targetable(s, g, HIT_HERO, TD_SEA_RANGE)).toBe(true);
      done = true;
      return true;
    });
    expect(done).toBe(true);
  });
});

describe('机器人遇炮艇', () => {
  it('第一艘炮艇停下时，木台上已有至少两座够得着海上的塔', () => {
    let reach = -1;
    play('td21', (s) => {
      if (!s.enemies.some((e) => e.kind === 'gunboat' && e.mode === 'in')) return;
      reach = s.towers.filter((t) => t.slot >= 0 && tdTowerRange(s, t).range >= TD_SEA_RANGE).length;
      return true;
    });
    expect(reach).toBeGreaterThanOrEqual(2);
  });
});

describe('狙击塔先打军医', () => {
  it('木台上只造狙击塔时，射程里有军医就瞄军医（船长、拿着宝藏的除外）', () => {
    const st = setup('td19');
    const s = createTd(st);
    const bot = tdBotActions('normal', 1, { only: 'sniper' });
    let aimedMedic = 0;
    while (!s.over && aimedMedic < 3) {
      const ev = stepTd(s, bot(s));
      for (const e of ev) if (e.type === 'aim' && s.enemies.find((q) => q.id === e.target)?.kind === 'medic') aimedMedic++;
    }
    expect(aimedMedic).toBeGreaterThan(0);
  });
});

describe('友军巡航船（规则版本 19）', () => {
  it('只有写了 fleet 的关、规则 19 起才有；开局就能叫，叫了沿格子外 1.5 格的海上开半圈、到点回航，冷却 60 秒', () => {
    expect(createTd(setup('td23', 1, RULES_SINCE.tdFleet - 1)).fleet).toBeUndefined();
    expect(createTd(setup('td22')).fleet).toBeUndefined();
    const s = createTd(setup('td23'));
    expect(s.fleet).toEqual({ ready: 0, sail: null });
    const ev = stepTd(s, [{ t: s.tick, type: 'fleet' }]);
    const come = ev.find((e) => e.type === 'fleet' && e.what === 'come');
    expect(come).toBeDefined();
    const sail = s.fleet!.sail!;
    expect(s.fleet!.ready).toBe(sail.t0 + TD2_FLEET.cd);
    // 船还在海上时再叫没用
    stepTd(s, [{ t: s.tick, type: 'fleet' }]);
    expect(s.fleet!.sail!.t0).toBe(sail.t0);
    const edge = (p: { x: number; y: number }): boolean => p.x === -150 || p.y === -150 || p.x === (GRID + 1) * 100 + 50 || p.y === (GRID + 1) * 100 + 50;
    let went = false;
    while (!went) {
      const at = fleetAt(sail, s.tick);
      expect(edge(at), `${at.x},${at.y}`).toBe(true);
      for (const e of stepTd(s, [])) {
        if (e.type !== 'fleet') continue;
        if (e.what === 'shot') {
          // 只打船边 r 内的、不打飞的
          expect((e.x1 - e.x) ** 2 + (e.y1 - e.y) ** 2).toBeLessThanOrEqual(TD2_FLEET.r * TD2_FLEET.r);
        }
        if (e.what === 'go') went = true;
      }
    }
    expect(s.tick - sail.t0).toBe(TD2_FLEET.ticks + 1);
    expect(s.fleet!.sail).toBeNull();
  });

  it('有海上的船时从离它最近的那段岸边进场', () => {
    let checked = false;
    play('td23', (s) => {
      if (!s.fleet || s.fleet.sail || s.tick < s.fleet.ready) return;
      const sea = s.enemies.filter((e) => e.kind === 'gunboat' && e.mode === 'in');
      if (!sea.length) return;
      const g = sea.reduce((a, b) => (b.id < a.id ? b : a));
      stepTd(s, [{ t: s.tick, type: 'fleet' }]);
      const at = fleetAt(s.fleet!.sail!, s.fleet!.sail!.t0);
      // 进场点是一圈上离它最近的点：比四个角都近
      const d = (at.x - g.x) ** 2 + (at.y - g.y) ** 2;
      const hi = (GRID + 1) * 100 + 50;
      for (const c of [[-150, -150], [hi, -150], [hi, hi], [-150, hi]]) expect(d).toBeLessThanOrEqual((c[0]! - g.x) ** 2 + (c[1]! - g.y) ** 2);
      checked = true;
      return true;
    });
    expect(checked).toBe(true);
  }, 60_000);
});

describe('海盗王（规则版本 19）', () => {
  it('停在海上不动，按 drop.every 放人上岸，血过半叫两艘炮艇护航（一局一次）；英雄打不到，远程塔打得到', () => {
    const def = TD2_ENEMIES.king;
    let drops = 0;
    let escorts = 0;
    let pos: { x: number; y: number } | null = null;
    let born = -1;
    play('td24', (s, ev) => {
      const k = s.enemies.find((e) => e.kind === 'king' && e.mode === 'in');
      if (k) {
        if (!pos) {
          pos = { x: k.x, y: k.y };
          born = s.tick - 1;
          expect(targetable(s, k, HIT_HERO)).toBe(false);
          expect(targetable(s, k, HIT_HERO, TD_SEA_RANGE)).toBe(true);
        }
        expect({ x: k.x, y: k.y }).toEqual(pos);
      }
      for (const e of ev) {
        if (e.type !== 'king') continue;
        if (e.what === 'drop') {
          drops++;
          expect((s.tick - 1 - born) % def.drop!.every).toBe(0);
          expect(ev.filter((q) => q.type === 'spawn' && q.kind === def.drop!.kind).length).toBeGreaterThanOrEqual(def.drop!.n);
        } else {
          escorts++;
          expect(ev.filter((q) => q.type === 'spawn' && q.kind === 'gunboat').length).toBe(def.escort!.n);
        }
      }
    });
    expect(pos).not.toBeNull();
    expect(drops).toBeGreaterThan(0);
    expect(escorts).toBeLessThanOrEqual(1);
  }, 60_000);

  it('机器人看到海盗王就叫友军船', () => {
    let called = false;
    play('td24', (s, ev) => {
      if (ev.some((e) => e.type === 'fleet' && e.what === 'come') && s.enemies.some((e) => e.kind === 'king' && e.mode === 'in')) called = true;
      return called;
    });
    expect(called).toBe(true);
  }, 60_000);
});
