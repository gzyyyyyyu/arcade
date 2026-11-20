import { describe, expect, it } from 'vitest';
import { RULES_VERSION, TD_HERO_GUARD, createTd, stepTd, tdBuildRange, tdHeroStats, tdTowerRange } from '../src/core/index.ts';
import type { Placed, TdEvent, TdLevel, TdSetup, TdState } from '../src/core/index.ts';

/** 守岛 2.0 的寻敌、攻击和角色规则（DESIGN 10.2b，规则版本 8）：每条规则一个测试 */

function lvl(p: Partial<TdLevel> = {}): TdLevel {
  return { id: 't', name: 't', hq: 1, hpPct: 100, gold: 0, first: 0, waveTicks: 4000, lanes: [{ x: 10, y: -2 }], waves: [], kegs: [], obstacles: [], slots: [], ...p };
}
function setup(layout: Placed[], level: TdLevel, seed = 1): TdSetup {
  return { layout, level, hero: 1, seed, rules: RULES_VERSION };
}
const base = (extra: Placed[] = []): Placed[] => [{ id: 1, kind: 'hq', level: 1, x: 9, y: 9 }, { id: 2, kind: 'treasure', level: 1, x: 10, y: 13 }, ...extra];
const benchHero = (s: TdState): void => {
  s.hero.respawn = 1_000_000;
  s.hero.hp = 0;
};
const d2 = (ax: number, ay: number, bx: number, by: number): number => (ax - bx) ** 2 + (ay - by) ** 2;
const alive = (s: TdState) => s.enemies.filter((e) => e.mode === 'in' || e.mode === 'out');
const sailors = (n: number, every = 12) => [{ groups: [{ enemy: 'sailor' as const, n, lane: 0, every }] }];

describe('塔的寻敌', () => {
  it('锁定目标：换目标只在旧目标死了（或路上的炮弹已经够打死它）、出了射程，或新目标优先级更高（拿着宝藏）时发生', () => {
    const tower: Placed = { id: 50, kind: 'gunTower', level: 3, x: 12, y: 5 };
    const s = createTd(setup(base([tower]), lvl({ waves: sailors(6, 6) })));
    benchHero(s);
    const t = s.towers.find((q) => q.kind === 'gunTower')!;
    const { range } = tdTowerRange(s, t);
    const cx = t.x * 100 + (t.size * 100) / 2;
    const cy = t.y * 100 + (t.size * 100) / 2;
    let prev = -1;
    let switches = 0;
    // 换走的时候旧目标还活着、在射程里：要么它 2 秒内就被路上的炮弹打死（必死不追打），要么不该换
    const check: Array<{ id: number; until: number; at: number; from: number; to: number }> = [];
    for (let i = 0; i < 1500 && !s.over; i++) {
      const before = new Map(alive(s).map((e) => [e.id, { ...e }]));
      stepTd(s, []);
      if (t.aim >= 0 && prev >= 0 && t.aim !== prev) {
        switches++;
        // 死了的每秒从列表里清掉，找不到也算死了
        const old = s.enemies.find((e) => e.id === prev);
        const gone = !old || (old.mode !== 'in' && old.mode !== 'out');
        const out = !!old && d2(old.x, old.y, cx, cy) > range * range;
        const neu = s.enemies.find((e) => e.id === t.aim)!;
        const upgraded = !!old && neu.carry > 0 && old.carry === 0;
        if (!(gone || out || upgraded)) check.push({ id: prev, until: s.tick + 40, at: s.tick, from: prev, to: t.aim });
        expect(before.has(prev)).toBe(true);
      }
      if (t.aim >= 0) prev = t.aim;
      for (const c of check.filter((q) => q.until === s.tick)) {
        const old = s.enemies.find((e) => e.id === c.id);
        expect(!old || (old.mode !== 'in' && old.mode !== 'out'), `第 ${c.at} 拍从 ${c.from} 换到 ${c.to}，旧目标 2 秒后还活着`).toBe(true);
      }
    }
    expect(switches).toBeGreaterThan(0);
  });

  it('射程：只打射程（含 minRange 死区）以内的；射程出口和出手判定是同一个数', () => {
    const tower: Placed = { id: 50, kind: 'mortar', level: 3, x: 12, y: 5 };
    const s = createTd(setup(base([tower]), lvl({ waves: sailors(4) })));
    benchHero(s);
    const t = s.towers.find((q) => q.kind === 'mortar')!;
    const r = tdTowerRange(s, t);
    expect(r.minRange).toBeGreaterThan(0);
    const cx = t.x * 100 + (t.size * 100) / 2;
    const cy = t.y * 100 + (t.size * 100) / 2;
    for (let i = 0; i < 1500 && !s.over; i++) {
      const ev = stepTd(s, []);
      for (const e of ev) {
        if (e.type !== 'shoot' || e.id !== t.id) continue;
        const tg = s.enemies.find((q) => q.id === e.target)!;
        const d = d2(tg.x, tg.y, cx, cy);
        expect(d).toBeLessThanOrEqual(r.range * r.range);
        expect(d).toBeGreaterThanOrEqual(r.minRange * r.minRange);
      }
    }
    expect(tdBuildRange('mortar', 1).range).toBeGreaterThan(0);
  });
});

describe('塔的攻击', () => {
  it('提前量：炸的（臼炮）落点按敌人的走速往前估，落点离敌人落地那一刻的位置在溅射半径以内', () => {
    const tower: Placed = { id: 50, kind: 'mortar', level: 3, x: 13, y: 4 };
    const s = createTd(setup(base([tower]), lvl({ waves: sailors(5, 30) })));
    benchHero(s);
    const pending: Array<{ t1: number; x: number; y: number; id: number }> = [];
    let ok = 0;
    let all = 0;
    for (let i = 0; i < 1500 && !s.over; i++) {
      const ev: TdEvent[] = stepTd(s, []);
      for (const e of ev) if (e.type === 'shoot' && e.target !== undefined) pending.push({ t1: e.t1, x: e.x1, y: e.y1, id: e.target });
      for (const p of pending.filter((q) => q.t1 === s.tick)) {
        const tg = s.enemies.find((q) => q.id === p.id);
        if (!tg || (tg.mode !== 'in' && tg.mode !== 'out')) continue;
        all++;
        if (d2(tg.x, tg.y, p.x, p.y) <= 150 * 150) ok++;
      }
    }
    expect(all).toBeGreaterThan(3);
    expect(ok / all).toBeGreaterThanOrEqual(0.8);
  });
});

describe('弹的飞行和多发', () => {
  it('臼炮一发飞 1–1.4 秒；火箭射程里只有一个敌人时三发都打它', () => {
    const towers: Placed[] = [
      { id: 50, kind: 'mortar', level: 3, x: 15, y: 4 },
      { id: 51, kind: 'rocket', level: 3, x: 6, y: 4 },
    ];
    // 一次只来一个（间隔 8 秒），火箭射程里就只有它
    const s = createTd(setup(base(towers), lvl({ waves: sailors(4, 160) })));
    s.hero.hp = 1_000_000;
    const mortar = s.towers.find((q) => q.kind === 'mortar')!;
    const rocket = s.towers.find((q) => q.kind === 'rocket')!;
    let mortarShots = 0;
    let rocketVolleys = 0;
    for (let i = 0; i < 1500 && !s.over; i++) {
      const ev = stepTd(s, []);
      const rk = ev.filter((e) => e.type === 'shoot' && e.id === rocket.id);
      if (rk.length > 0) {
        rocketVolleys++;
        expect(rk.length).toBe(3);
      }
      for (const e of ev) {
        if (e.type !== 'shoot') continue;
        if (e.id === mortar.id) {
          mortarShots++;
          expect(e.t1 - s.tick + 1).toBeGreaterThanOrEqual(20);
          expect(e.t1 - s.tick + 1).toBeLessThanOrEqual(28);
        }
      }
    }
    expect([mortarShots > 0, rocketVolleys > 0]).toEqual([true, true]);
  });
});

describe('不浪费炮弹', () => {
  it('路上的直射伤害已经够打死的敌人，别的塔改打下一个：落地时目标已死的直射弹不到两成', () => {
    const towers: Placed[] = [
      { id: 50, kind: 'gunTower', level: 3, x: 12, y: 3 },
      { id: 51, kind: 'gunTower', level: 3, x: 7, y: 3 },
      { id: 52, kind: 'cannon', level: 3, x: 12, y: 6 },
      { id: 53, kind: 'harpoon', level: 3, x: 7, y: 6 },
    ];
    const s = createTd(setup(base(towers), lvl({ waves: sailors(12, 8) })));
    benchHero(s);
    const pending: Array<{ t1: number; id: number }> = [];
    let wasted = 0;
    let all = 0;
    for (let i = 0; i < 1500 && !s.over; i++) {
      const ev = stepTd(s, []);
      for (const e of ev) if (e.type === 'shoot' && e.target !== undefined) pending.push({ t1: e.t1, id: e.target });
      for (const p of pending.filter((q) => q.t1 === s.tick)) {
        all++;
        const tg = s.enemies.find((q) => q.id === p.id);
        // 落地这一拍先结算伤害，同一拍被它打死的不算浪费；之前就死了的才算
        if (!tg || (tg.mode === 'dead' && !ev.some((x) => x.type === 'die' && x.id === p.id))) wasted++;
      }
    }
    expect(all).toBeGreaterThan(20);
    expect(wasted / all).toBeLessThan(0.2);
  });
});

describe('敌人走位', () => {
  it('同一条路上的敌人按 id 错开，不叠成一个点', () => {
    const s = createTd(setup(base(), lvl({ waves: sailors(6, 4) })));
    benchHero(s);
    let stacked = 0;
    let samples = 0;
    for (let i = 0; i < 600 && !s.over; i++) {
      stepTd(s, []);
      const a = alive(s).filter((e) => e.mode === 'in' && e.y >= 0); // 岛外刚刷出来的那一拍不算
      if (a.length < 4 || i % 10 !== 0) continue;
      samples++;
      for (let j = 0; j < a.length; j++) for (let k = j + 1; k < a.length; k++) if (d2(a[j]!.x, a[j]!.y, a[k]!.x, a[k]!.y) < 8 * 8) stacked++;
    }
    expect(samples).toBeGreaterThan(5);
    expect(stacked).toBe(0);
  });
});

describe('英雄', () => {
  it('守点：守点附近的敌人主动迎上去打，不追出守点范围太远；没敌人了回守点', () => {
    const s = createTd(setup(base(), lvl({ waves: sailors(3, 20) })));
    s.hero.hp = 1_000_000;
    s.hero.maxHp = 1_000_000;
    // 守点在敌人路线（x≈1050 这一列）旁边 3 格：路过的敌人在守点范围内、但在英雄射程外，要他自己迎上去
    const post = { x: 1350, y: 650 };
    stepTd(s, [{ t: 0, type: 'move', x: post.x, y: post.y }]);
    const hr = tdHeroStats(s.hero.level).range;
    let arrived = false;
    let moved = false;
    let far = 0;
    for (let i = 0; i < 2500 && !s.over; i++) {
      stepTd(s, []);
      const d = Math.sqrt(d2(s.hero.x, s.hero.y, post.x, post.y));
      if (!arrived) {
        arrived = d <= 20;
        continue;
      }
      far = Math.max(far, d);
      if (d > 60) moved = true;
      if (alive(s).length === 0 && s.tick > 400) break;
    }
    expect(moved).toBe(true);
    expect(far).toBeLessThanOrEqual(TD_HERO_GUARD + hr);
    for (let i = 0; i < 300; i++) stepTd(s, []);
    expect(Math.sqrt(d2(s.hero.x, s.hero.y, post.x, post.y))).toBeLessThanOrEqual(60);
  });

  it('射程内先打拿着宝藏的；开枪有开火事件（id -1，画面播弹道）', () => {
    // 当作玩家指挥过：英雄守在出生的宝藏边（没指挥时他去路口拦，敌人摸不到宝藏，这个场景出不来）
    const s = createTd(setup(base(), lvl({ waves: sailors(4, 6) })));
    (s.internal as { heroCmd: boolean }).heroCmd = true;
    s.hero.hp = 1_000_000;
    let checked = 0;
    let shots = 0;
    for (let i = 0; i < 2500 && !s.over; i++) {
      shots += stepTd(s, []).filter((e) => e.type === 'shoot' && e.id === -1 && e.target === s.hero.aim).length;
      if (s.hero.aim < 0) continue;
      const hr = tdHeroStats(s.hero.level).range;
      const near = alive(s).filter((e) => d2(e.x, e.y, s.hero.x, s.hero.y) <= hr * hr);
      if (!near.some((e) => e.carry > 0)) continue;
      checked++;
      expect(s.enemies.find((e) => e.id === s.hero.aim)?.carry ?? 0).toBeGreaterThan(0);
    }
    expect(checked).toBeGreaterThan(0);
    expect(shots).toBeGreaterThan(0);
  });

  it('手动走位优先：玩家点了地方，英雄先走到那里，不被守点逻辑拽走', () => {
    const s = createTd(setup(base(), lvl({ waves: sailors(3, 20) })));
    s.hero.hp = 1_000_000;
    const goal = { x: 450, y: 1250 };
    stepTd(s, [{ t: 0, type: 'move', x: goal.x, y: goal.y }]);
    let reached = false;
    for (let i = 0; i < 600 && !reached; i++) {
      stepTd(s, []);
      if (d2(s.hero.x, s.hero.y, goal.x, goal.y) <= 20 * 20) reached = true;
    }
    expect(reached).toBe(true);
    expect(s.hero.post).toEqual(goal);
  });
});
