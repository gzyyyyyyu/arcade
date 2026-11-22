import { describe, expect, it } from 'vitest';
import {
  RULES_VERSION, createTd, runTdBot, stepTd, tdCampaign, tdGrowthSetup, tdJammed, tdLanes, tdNextTide, tideOpenAt,
} from '../src/core/index.ts';
import type { Placed, TdLevel, TdSetup, TdState } from '../src/core/index.ts';

/** 每个新机制（涨落的潮、雾区、炸塔工兵、首领技能）的规则 */

function lvl(p: Partial<TdLevel> = {}): TdLevel {
  return { id: 't', name: 't', hq: 1, hpPct: 100, gold: 0, first: 0, waveTicks: 4000, lanes: [{ x: 10, y: -2 }], waves: [], kegs: [], obstacles: [], slots: [], ...p };
}
function base(extra: Placed[] = []): Placed[] {
  return [{ id: 1, kind: 'hq', level: 1, x: 9, y: 9 }, { id: 2, kind: 'treasure', level: 1, x: 10, y: 13 }, ...extra];
}
const setup = (layout: Placed[], level: TdLevel, seed = 1): TdSetup => ({ layout, level, hero: 1, seed, rules: RULES_VERSION, mode: 'campaign' });
function benchHero(s: TdState): void {
  s.hero.respawn = 1_000_000;
  s.hero.hp = 0;
}
const gun = (id: number, x: number, y: number, branch?: string[]): Placed => ({ id, kind: 'gunTower', level: 3, x, y, ...(branch ? { branch } : {}) });

describe('涨落的潮', () => {
  const lv = lvl({ tide: { wave: 0, lane: { x: 11, y: 23 } }, tideOpen: [1, 3], waves: [{ groups: [] }, { groups: [] }, { groups: [] }, { groups: [] }] });
  it('tideOpenAt：只在名单里的波开；没写名单的老关从 tide.wave 起一直开', () => {
    expect([0, 1, 2, 3].map((w) => tideOpenAt(lv, w))).toEqual([false, true, false, true]);
    const old = lvl({ tide: { wave: 2, lane: { x: 11, y: 23 } } });
    expect([0, 1, 2, 3, 9].map((w) => tideOpenAt(old, w))).toEqual([false, false, true, true, true]);
    expect(tideOpenAt(lvl(), 0)).toBe(false);
  });
  it('落潮路的组：开潮的波从南边上岸，涨潮的波改走 0 号路；预告和当前的路跟着变', () => {
    const level = lvl({
      ...lv,
      lanes: [{ x: 10, y: -2 }, { x: -2, y: 11 }],
      waves: [0, 1, 2].map(() => ({ groups: [{ enemy: 'sailor' as const, n: 1, lane: 2, every: 1 }] })),
      first: 1,
      waveTicks: 40,
    });
    const s = createTd(setup(base(), level));
    benchHero(s);
    expect(tdNextTide(s)).toBe(false); // 第 0 波涨潮
    expect(tdLanes(s)).toHaveLength(2);
    const spawnY: number[] = [];
    for (let i = 0; i < 130; i++) {
      for (const e of stepTd(s, [])) if (e.type === 'spawn') spawnY.push(e.y);
    }
    // 波 0 涨潮 → 北路（y=-200），波 1 开潮 → 南路（y=2300），波 2 涨潮 → 北路
    expect(spawnY.map((y) => (y > 1000 ? 'S' : 'N')).join('')).toBe('NSN');
    expect(tdNextTide(s)).toBeNull(); // 三波都开打了
    // 第二波开打后路线表里有南路
    const s2 = createTd(setup(base(), level));
    benchHero(s2);
    while (s2.wave < 2) stepTd(s2, []);
    expect(tdLanes(s2)).toHaveLength(3);
    expect(tdNextTide(s2)).toBe(false);
  });
});

describe('雾区', () => {
  const zone = { x: 10, y: 3, r: 3 };
  const spawnIn = (level: TdLevel, layout: Placed[]): TdState => {
    const s = createTd(setup(layout, { ...level, waves: [{ groups: [{ enemy: 'sailor', n: 1, lane: 0, every: 1 }] }] }));
    benchHero(s);
    return s;
  };
  const shotsWhileInZone = (layout: Placed[], fogZones?: TdLevel['fogZones']): number => {
    const s = spawnIn(lvl({ ...(fogZones ? { fogZones } : {}) }), layout);
    let hits = 0;
    for (let i = 0; i < 400; i++) {
      // 塔开火那一拍敌人在雾区里 = 塔瞄准了雾里的敌人（弹丸落地晚几拍，那时敌人可能已经出雾，所以数开火不数命中）
      const ev = stepTd(s, []);
      const e = s.enemies[0];
      const inZone = !!e && (e.x - 1050) ** 2 + (e.y - 350) ** 2 <= 300 * 300;
      if (inZone) hits += ev.filter((q) => q.type === 'shoot').length;
    }
    return hits;
  };
  it('雾区里的水手塔打不中；同一座塔在没有雾的关里打得中', () => {
    const layout = base([gun(3, 8, 3)]);
    expect(shotsWhileInZone(layout)).toBeGreaterThan(0);
    expect(shotsWhileInZone(layout, [zone])).toBe(0);
  });
  it('灯塔分叉的塔照亮雾区，里面的敌人又打得中', () => {
    expect(shotsWhileInZone(base([gun(3, 8, 3, ['gunTower.lighthouse'])]), [zone])).toBeGreaterThan(0);
  });
  it('英雄走到雾区里（身边 2 格）也能打到', () => {
    const s = spawnIn(lvl({ fogZones: [zone] }), base());
    s.hero.respawn = -1;
    s.hero.hp = s.hero.maxHp;
    s.hero.x = 1050;
    s.hero.y = 450;
    s.hero.post = { x: 1050, y: 450 }; // 摆在这里 = 守点在这里
    let hits = 0;
    for (let i = 0; i < 300; i++) hits += stepTd(s, []).filter((q) => q.type === 'hit').length;
    expect(hits).toBeGreaterThan(0);
  });
});

describe('炸塔工兵', () => {
  const level = (sj?: TdLevel['sapperJam']): TdLevel =>
    lvl({ ...(sj ? { sapperJam: sj } : {}), waves: [{ groups: [{ enemy: 'sapper', n: 1, lane: 0, every: 1 }] }] });
  const layout = base([gun(3, 9, 6)]);
  it('走到塔边引爆：自己没了、塔哑火一阵、之后恢复', () => {
    const s = createTd(setup(layout, level({ r: 3, ticks: 60 })));
    benchHero(s);
    let jam = 0;
    let died = false;
    let sawJammed = false;
    for (let i = 0; i < 2000 && !s.over; i++) {
      const t0 = s.tick;
      const ev = stepTd(s, []);
      for (const q of ev) {
        if (q.type === 'jam') {
          jam++;
          expect(q.until).toBe(t0 + 60); // 哑火 60 拍
        }
        if (q.type === 'die') died = true;
      }
      if (tdJammed(s, 3)) sawJammed = true;
    }
    expect(jam).toBe(1);
    expect(died).toBe(true);
    expect(sawJammed).toBe(true);
  });
  it('哑火的塔不开火', () => {
    const s = createTd(setup(base([gun(3, 9, 6)]), lvl({ waves: [{ groups: [{ enemy: 'sailor', n: 3, lane: 0, every: 10 }] }] })));
    benchHero(s);
    const I = s.internal as { jam: Map<number, number> };
    I.jam.set(3, 100_000);
    let shots = 0;
    for (let i = 0; i < 300; i++) shots += stepTd(s, []).filter((q) => q.type === 'shoot').length;
    expect(shots).toBe(0);
  });
  it('没写 sapperJam 的关，工兵不炸塔', () => {
    const s = createTd(setup(layout, level()));
    benchHero(s);
    let jam = 0;
    for (let i = 0; i < 700; i++) jam += stepTd(s, []).filter((q) => q.type === 'jam').length;
    expect(jam).toBe(0);
  });
});

describe('首领技能', () => {
  const level = (skill: boolean): TdLevel =>
    lvl({
      ...(skill ? { bossSkill: { summon: { kind: 'skiff' as const, n: 4 }, jam: 1, jamTicks: 100 } } : {}),
      waves: [{ boss: true, groups: [{ enemy: 'captain', n: 1, lane: 0, every: 1 }] }],
    });
  const layout = base([gun(3, 5, 8), gun(4, 14, 8)]);
  it('血量掉到一半发一次：召 4 条小艇、炸哑最近的 1 座塔；不会发第二次', () => {
    const s = createTd(setup(layout, level(true)));
    benchHero(s);
    while (s.enemies.length === 0) stepTd(s, []);
    const cap = s.enemies[0]!;
    const before = s.enemies.length;
    cap.hp = Math.floor(cap.maxHp / 2);
    const ev = stepTd(s, []);
    expect(ev.filter((q) => q.type === 'skill')).toHaveLength(1);
    expect(s.enemies.filter((e) => e.kind === 'skiff')).toHaveLength(4);
    expect(s.enemies.length).toBe(before + 4);
    expect(ev.filter((q) => q.type === 'jam')).toHaveLength(1);
    cap.hp = 10;
    expect(stepTd(s, []).filter((q) => q.type === 'skill')).toHaveLength(0);
  });
  it('没写 bossSkill 的首领波不发技能', () => {
    const s = createTd(setup(layout, level(false)));
    benchHero(s);
    while (s.enemies.length === 0) stepTd(s, []);
    s.enemies[0]!.hp = 100;
    const ev = stepTd(s, []);
    expect(ev.some((q) => q.type === 'skill' || q.type === 'jam')).toBe(false);
  });
});

describe('新关能跑完，确定性', () => {
  it('第二、三章每关：两种机器人各打 1 局（建议养成），打得完，同种子同结果', () => {
    for (const l of tdCampaign().filter((q) => q.chapter >= 2)) {
      const r = tdGrowthSetup(l.id, 'suggest', 1);
      if (!r.ok) throw new Error(`${l.id}: ${r.error}`);
      for (const kind of ['novice', 'normal'] as const) {
        const a = runTdBot(r.value, kind);
        const b = runTdBot(r.value, kind);
        expect(a.result.over).toBe(true);
        expect(a.result).toEqual(b.result);
      }
    }
  }, 285_000); // 负载 28–32、maxWorkers=1 实测 70.4 秒，取 4 倍
});
