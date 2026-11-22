import { describe, expect, it } from 'vitest';
import {
  ESCORT_CELL, ESCORT_MEND, ESCORT_PACE, RULES_VERSION, createTd, escortMeet, escortRate, escortResultOf, escortStars, runEscortBot, stepTd, tdFingerprint,
  tdPreview, tdResult,
} from '../src/core/index.ts';
import type { EscortDef, EscortState, TdAction, TdEnemy, TdEnemyKind, TdEvent, TdLevel, TdState } from '../src/core/index.ts';

/** 护航规则核心（src/core/escort.ts 和 td.ts 里 s.escort 的分支）：用测试里手写的一张小护航关 */

const route = Array.from({ length: 13 }, (_, i) => ({ x: i, y: 2 }));
function def(p: Partial<EscortDef> = {}): EscortDef {
  return { route, gates: [3, 8], hull: 200, stars: [45, 80], ...p };
}
function lvl(p: Partial<TdLevel> = {}, e: Partial<EscortDef> = {}): TdLevel {
  return {
    id: 'esc-t', name: 't', hq: 1, hpPct: 100, gold: 400, first: 100_000, waveTicks: 600, lanes: [{ x: 6, y: 14 }], waves: [], kegs: [], obstacles: [],
    slots: [{ x: 3, y: 5 }, { x: 8, y: 5 }], escort: def(e), ...p,
  };
}
function make(p: Partial<TdLevel> = {}, e: Partial<EscortDef> = {}, seed = 1): TdState {
  const s = createTd({ layout: [{ id: 1, kind: 'hq', level: 1, x: 9, y: 9 }], level: lvl(p, e), hero: 1, seed, rules: RULES_VERSION, mode: 'escort' });
  s.hero.respawn = 1_000_000; // 英雄先倒下：测船和敌人时不让它插手
  s.hero.hp = 0;
  return s;
}
const es = (s: TdState): EscortState => s.escort as EscortState;
function steps(s: TdState, n: number, acts: TdAction[] = []): TdEvent[] {
  const all: TdEvent[] = [];
  for (let i = 0; i < n && !s.over; i++) all.push(...stepTd(s, i === 0 ? acts : []));
  return all;
}
/** 直接往场上放一个敌人，贴着船 */
function biter(s: TdState, id: number, kind: TdEnemyKind = 'sailor', dx = 0): TdEnemy {
  const sh = { x: route[0]!.x * 100 + 50, y: route[0]!.y * 100 + 50 };
  const hp = 100_000;
  const e: TdEnemy = { id, kind, wave: 0, x: sh.x + dx, y: sh.y, hp, maxHp: hp, mode: 'in', carry: 0, hx: sh.x, hy: sh.y, cd: 0, slowUntil: 0, slowPct: 0, face: 1, trail: [] };
  s.enemies.push(e);
  return e;
}

describe('护航：船速与咬住', () => {
  it('开局船停在起点，没有宝藏箱', () => {
    const s = make();
    expect(es(s).pos).toBe(0);
    expect(es(s).pace).toBe('hold');
    expect(s.vault).toBe(0);
    expect(s.treasures.length).toBe(0);
    expect(s.mode).toBe('escort');
    steps(s, 50);
    expect(es(s).pos).toBe(0);
  });
  it('停 / 巡航 / 冲：每拍前进 ESCORT_PACE 的 0 / 巡航 / 冲', () => {
    for (const pace of ['hold', 'sail', 'rush'] as const) {
      const s = make();
      steps(s, 40, [{ t: 0, type: 'pace', pace }]);
      expect(es(s).pos, pace).toBe(ESCORT_PACE[pace] * 40);
    }
  });
  it('咬住 1–2 个速度减半，3 个及以上钉死', () => {
    const s = make();
    es(s).pace = 'rush';
    for (const [n, rate] of [[0, ESCORT_PACE.rush], [1, Math.floor(ESCORT_PACE.rush / 2)], [2, Math.floor(ESCORT_PACE.rush / 2)], [3, 0], [5, 0]] as const) {
      es(s).biters = n;
      expect(escortRate(es(s)), `${n}`).toBe(rate);
    }
    // 真有敌人贴着船：1 个咬住，船走得慢；再来 2 个就钉死
    const t = make();
    es(t).pace = 'rush';
    biter(t, 900);
    steps(t, 5);
    expect(es(t).biters).toBe(1);
    const p1 = es(t).pos;
    steps(t, 20);
    expect(es(t).pos - p1).toBeLessThanOrEqual((20 * ESCORT_PACE.rush) / 2);
    biter(t, 901);
    biter(t, 902);
    steps(t, 3);
    expect(es(t).biters).toBe(3);
    const p3 = es(t).pos;
    steps(t, 10);
    expect(es(t).pos).toBe(p3);
  });
  it('过隘口发 gate 事件，一次一个', () => {
    const s = make();
    const ev = steps(s, Math.ceil((3 * ESCORT_CELL) / ESCORT_PACE.rush) + 1, [{ t: 0, type: 'pace', pace: 'rush' }]);
    expect(ev.filter((e) => e.type === 'gate')).toEqual([{ type: 'gate', index: 3 }]);
    expect(es(s).gatesPassed).toBe(1);
  });
});

describe('护航：终局与星数', () => {
  it('到终点就结束，满血 3★', () => {
    const s = make();
    const ev = steps(s, Math.ceil(((route.length - 1) * ESCORT_CELL) / ESCORT_PACE.rush) + 10, [{ t: 0, type: 'pace', pace: 'rush' }]);
    expect(s.over).toBe(true);
    expect(es(s).arrived).toBe(true);
    expect(es(s).pos).toBe((route.length - 1) * ESCORT_CELL);
    expect(ev.some((e) => e.type === 'arrive')).toBe(true);
    expect(tdResult(s).stars).toBe(3);
    const r = escortResultOf(s);
    expect(r).toMatchObject({ over: true, arrived: true, sunk: false, hullPct: 100, cells: 12, total: 12, stars: 3 });
  });
  it('星数边界：刚好 p2 / p3', () => {
    const d = def();
    expect([100, 80, 79, 45, 44, 1].map((p) => escortStars(p, d))).toEqual([3, 3, 2, 2, 1, 1]);
    // 到达时血量刚好 80%（200 的 160）→ 3★，159 → 2★
    for (const [hull, stars] of [[160, 3], [159, 2], [90, 2], [89, 1]] as const) {
      const s = make();
      es(s).hull = hull;
      steps(s, Math.ceil(((route.length - 1) * ESCORT_CELL) / ESCORT_PACE.rush) + 10, [{ t: 0, type: 'pace', pace: 'rush' }]);
      expect(tdResult(s).stars, `${hull}`).toBe(stars);
    }
  });
  it('血 ≤ 0 沉船结束，0★', () => {
    const s = make({}, { hull: 30 });
    biter(s, 900, 'ironclad');
    const ev = steps(s, 400);
    expect(s.over).toBe(true);
    expect(es(s).sunk).toBe(true);
    expect(ev.some((e) => e.type === 'sunk')).toBe(true);
    expect(ev.some((e) => e.type === 'bite')).toBe(true);
    expect(tdResult(s).stars).toBe(0);
    expect(escortResultOf(s)).toMatchObject({ arrived: false, sunk: true, hullPct: 0, stars: 0 });
  });
  it('超时没到也结束，0★，波打完了也不提前结束', () => {
    const s = make({ maxTicks: 120 });
    steps(s, 500, [{ t: 0, type: 'pace', pace: 'sail' }]);
    expect(s.over).toBe(true);
    expect(s.tick).toBe(120);
    expect(es(s).arrived).toBe(false);
    expect(tdResult(s).stars).toBe(0);
    expect(escortResultOf(s).cells).toBe(Math.floor((120 * ESCORT_PACE.sail) / ESCORT_CELL));
    // 没有波次的关，船停着也不会"清完了"就结束
    const t = make();
    steps(t, 3000);
    expect(t.over).toBe(false);
  });
});

describe('护航：修船与英雄跟随', () => {
  it('修船：花金、回 10%、不超过满血、有冷却', () => {
    const s = make();
    es(s).hull = 100;
    const g0 = s.gold;
    const ev = steps(s, 1, [{ t: 0, type: 'mend' }]);
    expect(es(s).hull).toBe(100 + 20);
    expect(s.gold).toBe(g0 - ESCORT_MEND.gold);
    expect(ev.some((e) => e.type === 'mend')).toBe(true);
    stepTd(s, [{ t: 1, type: 'mend' }]); // 冷却中
    expect(es(s).hull).toBe(120);
    steps(s, ESCORT_MEND.cd);
    stepTd(s, [{ t: 0, type: 'mend' }]);
    expect(es(s).hull).toBe(140);
    expect(es(s).mends).toBe(2);
    // 满血、钱不够都不修，也不扣钱
    es(s).hull = 195;
    es(s).mendReady = 0;
    stepTd(s, [{ t: 0, type: 'mend' }]);
    expect(es(s).hull).toBe(200);
    es(s).mendReady = 0;
    const g = s.gold;
    stepTd(s, [{ t: 0, type: 'mend' }]);
    expect(s.gold).toBe(g);
    es(s).hull = 100;
    es(s).mendReady = 0;
    s.gold = ESCORT_MEND.gold - 1;
    stepTd(s, [{ t: 0, type: 'mend' }]);
    expect(es(s).hull).toBe(100);
  });
  it('跟随：英雄每 10 拍往船旁边走；自己下 move 就关掉', () => {
    const s = make();
    s.hero.respawn = -1;
    s.hero.hp = s.hero.maxHp;
    s.hero.x = 450;
    s.hero.y = 650;
    s.hero.post = { x: 450, y: 650 }; // 摆在这里 = 守点在这里
    steps(s, 1, [{ t: 0, type: 'follow', on: true }, { t: 0, type: 'pace', pace: 'rush' }]);
    expect(es(s).follow).toBe(true);
    steps(s, 200);
    const sh = { x: es(s).def.route[Math.floor(es(s).pos / ESCORT_CELL)]!.x * 100 + 50, y: 250 };
    expect(Math.abs(s.hero.x - sh.x)).toBeLessThan(400);
    expect(Math.abs(s.hero.y - sh.y)).toBeLessThan(400);
    stepTd(s, [{ t: 0, type: 'move', x: 1000, y: 1000 }]);
    expect(es(s).follow).toBe(false);
  });
});

describe('护航：敌人追船、预告相遇点、确定性', () => {
  const waves: TdLevel['waves'] = [
    { groups: [{ enemy: 'sailor', n: 4, lane: 0, every: 10 }] },
    { groups: [{ enemy: 'ironclad', n: 2, lane: 0, every: 20 }] },
  ];
  it('敌人只追船、不抢宝藏：咬到船、船血掉', () => {
    const s = make({ first: 20, waves, gold: 0 });
    const ev = steps(s, 700);
    expect(ev.some((e) => e.type === 'bite')).toBe(true);
    expect(es(s).hull).toBeLessThan(200);
    expect(s.lost).toBe(0);
    expect(ev.some((e) => e.type === 'grab')).toBe(false);
  });
  it('预告每波带相遇点 meet', () => {
    const s = make({ first: 200, waves });
    const pv = tdPreview(s, 2);
    expect(pv.length).toBe(2);
    for (const p of pv) expect(typeof p.meet).toBe('number');
  });
  it('escortMeet：冲比巡航相遇得更靠后；停着就在当前格；追不上 -1', () => {
    const s = make();
    const lane = { x: 6, y: 14 };
    const m = (pace: 'hold' | 'sail' | 'rush'): number => {
      es(s).pace = pace;
      return escortMeet(es(s), 50, lane, 5);
    };
    const hold = m('hold');
    const sail = m('sail');
    const rush = m('rush');
    expect(hold).toBe(0);
    expect(sail).toBeGreaterThan(hold);
    expect(rush).toBeGreaterThan(sail);
    // 敌人慢得追不上冲的船
    es(s).pace = 'rush';
    expect(escortMeet(es(s), 100, lane, 1)).toBe(-1);
  });
  it('同种子同操作同指纹；换种子可以不同；机器人局确定', () => {
    const run = (seed: number): number => {
      const s = make({ first: 20, waves, gold: 300 }, {}, seed);
      steps(s, 600, [{ t: 0, type: 'pace', pace: 'sail' }, { t: 0, type: 'build', slot: 0, kind: 'cannon' }]);
      return tdFingerprint(s);
    };
    expect(run(7)).toBe(run(7));
    expect(run(7)).not.toBe(run(8));
    for (const kind of ['novice', 'normal'] as const) {
      const mk = (): Parameters<typeof runEscortBot>[1] => ({ layout: [{ id: 1, kind: 'hq', level: 1, x: 9, y: 9 }], level: lvl({ first: 40, waves, maxTicks: 1500 }), hero: 1, seed: 3, rules: RULES_VERSION, mode: 'escort' });
      const a = runEscortBot(kind, mk());
      const b = runEscortBot(kind, mk());
      expect(a, kind).toEqual(b);
      expect(a.escort.over).toBe(true);
    }
  });
});
