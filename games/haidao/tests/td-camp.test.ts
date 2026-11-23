import { describe, expect, it } from 'vitest';
import { TD2_CAMP } from '../src/content/tdcamp.ts';
import { RULES_VERSION, createTd, stepTd, tdFingerprint } from '../src/core/index.ts';
import type { Placed, TdAction, TdEnemyKind, TdLevel, TdMode, TdSetup, TdState } from '../src/core/index.ts';
import { rallyOk } from '../src/core/tdcamp.ts';
import { stepKey } from '../src/view/td-ui.ts';

/**
 * 水手营（td.md 批 4）：造在木台上，兵站到集结点拦地面敌人（飞的不拦），被拦的原地打兵；
 * 兵倒下敌人接着走、按阶复活；集结点只能在营 3 格内能走的格；只有战役和海盗来袭、开局给了 camp 才能造。
 */

function lvl(p: Partial<TdLevel> = {}): TdLevel {
  return { id: 't', name: 't', hq: 1, hpPct: 100, gold: 2000, first: 0, waveTicks: 4000, lanes: [{ x: 10, y: -2 }], waves: [], kegs: [], obstacles: [], slots: [{ x: 12, y: 6 }], ...p };
}
const base: Placed[] = [{ id: 1, kind: 'hq', level: 1, x: 16, y: 16 }, { id: 2, kind: 'treasure', level: 1, x: 10, y: 15 }];
function setup(level: TdLevel, extra: Partial<TdSetup> = {}): TdSetup {
  return { layout: base, level, hero: 1, seed: 1, rules: RULES_VERSION, mode: 'campaign', camp: true, ...extra };
}
function bench(s: TdState): void {
  s.hero.respawn = 1_000_000;
  s.hero.hp = 0;
}
const one = (enemy: TdEnemyKind, n = 1, delay = 200): TdLevel['waves'] => [{ groups: [{ enemy, n, lane: 0, every: 20, delay }] }];
/** 开局造营，然后跑 ticks 拍（look 返回 true 停） */
function play(s: TdState, ticks: number, look: (s: TdState) => boolean | undefined = () => false): void {
  for (let i = 0; i < ticks && !s.over; i++) {
    const acts: TdAction[] = s.tick === 1 ? [{ t: s.tick, type: 'camp', slot: 0 }] : [];
    stepTd(s, acts);
    if (look(s)) break;
  }
}

describe('水手营：造', () => {
  it('造了营，局内「下一座造」重挑（营那块台不再当空台）', () => {
    const s = createTd(setup(lvl({ waves: one('sailor') })));
    const k0 = stepKey(s);
    play(s, 2);
    expect(s.slots[0]!.tower).toBeGreaterThanOrEqual(0);
    expect(stepKey(s)).not.toBe(k0);
  });
  it('花 110 金造在木台上，3 名兵满血，集结点在 3 格内能走的格', () => {
    const s = createTd(setup(lvl({ waves: one('sailor') })));
    const g0 = s.gold;
    play(s, 2);
    expect(s.gold).toBe(g0 - TD2_CAMP.cost);
    const c = s.camps![0]!;
    expect(c.men).toHaveLength(3);
    expect(c.men.every((m) => m.hp === TD2_CAMP.tiers[0].hp)).toBe(true);
    expect(rallyOk(s, 0, c.rx, c.ry)).toBe(true);
    expect(s.slots[0]!.tower).toBe(c.id);
  });
  it('没给 camp、或悬赏守岛 / 大潮 / 护航：造营的操作不改状态', () => {
    const cases: Array<Partial<TdSetup>> = [{ camp: undefined }, ...(['live', 'tide', 'escort'] as TdMode[]).map((mode) => ({ mode }))];
    for (const extra of cases) {
      const s = createTd(setup(lvl({ waves: one('sailor') }), extra));
      const ref = createTd(setup(lvl({ waves: one('sailor') }), extra));
      stepTd(s, [{ t: s.tick, type: 'camp', slot: 0 }]);
      stepTd(ref, []);
      expect(s.camps, JSON.stringify(extra)).toBeUndefined();
      expect(tdFingerprint(s), JSON.stringify(extra)).toBe(tdFingerprint(ref));
    }
  });
  it('集结点：3 格内能走的格才行，超出范围、墙上的不行', () => {
    const wall: Placed[] = [{ id: 9, kind: 'wall', level: 3, x: 11, y: 9 }];
    const s = createTd({ ...setup(lvl({ waves: one('sailor') })), layout: [...base, ...wall] });
    play(s, 2);
    const c = s.camps![0]!;
    const ok = { x: 11 * 100 + 50, y: 8 * 100 + 50 };
    expect(rallyOk(s, 0, ok.x, ok.y)).toBe(true);
    expect(rallyOk(s, 0, 11 * 100 + 50, 9 * 100 + 50)).toBe(false);
    expect(rallyOk(s, 0, 13 * 100, 13 * 100)).toBe(false);
    stepTd(s, [{ t: s.tick, type: 'muster', slot: 0, x: 13 * 100, y: 13 * 100 }]);
    expect({ x: c.rx, y: c.ry }).not.toEqual({ x: 1300, y: 1300 });
    stepTd(s, [{ t: s.tick, type: 'muster', slot: 0, x: ok.x, y: ok.y }]);
    expect({ x: c.rx, y: c.ry }).toEqual(ok);
  });
});

describe('水手营：拦人', () => {
  it('地面敌人被兵拦住停下、打兵；飞的不拦', () => {
    for (const kind of ['sailor', 'parrot'] as const) {
      const s = createTd(setup(lvl({ waves: one(kind) })));
      bench(s);
      let held = 0;
      let last: { x: number; y: number } | null = null;
      play(s, 1500, (st) => {
        const e = st.enemies[0];
        if (e?.mode !== 'in') return;
        if (last && last.x === e.x && last.y === e.y) held++;
        last = { x: e.x, y: e.y };
      });
      const hurt = s.camps![0]!.men.some((m) => m.hp < m.maxHp || m.respawn >= 0);
      if (kind === 'sailor') {
        expect(held, kind).toBeGreaterThan(20);
        expect(hurt).toBe(true);
      } else {
        expect(held, kind).toBe(0);
        expect(hurt).toBe(false);
      }
    }
  });
  it('兵全倒下敌人接着走；倒下的兵按阶的复活时间回来', () => {
    // 一大串铁甲：兵打不过，会倒
    const s = createTd(setup(lvl({ waves: one('ironclad', 8) })));
    bench(s);
    let down = -1;
    let up = -1;
    play(s, 3000, (st) => {
      const m = st.camps?.[0]?.men[0];
      if (!m) return;
      if (down < 0 && m.respawn >= 0) down = st.tick;
      if (down >= 0 && up < 0 && m.respawn < 0) up = st.tick;
      return up >= 0;
    });
    expect(down).toBeGreaterThan(0);
    expect(up - down).toBe(TD2_CAMP.tiers[0].respawn);
    // 有人越过集结点走到了宝藏箱那边
    expect(s.enemies.some((e) => e.mode !== 'dead' && e.y > s.camps![0]!.ry + 200)).toBe(true);
  });
  it('同种子同操作，带营的局指纹一样', () => {
    const fp = (): number => {
      const s = createTd(setup(lvl({ waves: one('ironclad', 4) })));
      play(s, 1200);
      return tdFingerprint(s);
    };
    expect(fp()).toBe(fp());
  });
});

describe('水手营：挑战限制', () => {
  it('限塔种（rule.kinds）、整关不准造台（noPads）的挑战：造营的操作不改状态', () => {
    for (const rule of [{ kinds: ['gunTower' as const] }, { noPads: true as const }]) {
      const s = createTd(setup(lvl({ waves: one('sailor') }), { rule }));
      const g0 = s.gold;
      stepTd(s, [{ t: s.tick, type: 'camp', slot: 0 }]);
      expect(s.camps, JSON.stringify(rule)).toBeUndefined();
      expect(s.slots[0]!.tower).toBe(-1);
      expect(s.gold).toBe(g0);
    }
  });
  it('不准卖（noSell）的挑战：营卖不掉', () => {
    const s = createTd(setup(lvl({ waves: one('sailor') }), { rule: { noSell: true } }));
    play(s, 2);
    const g = s.gold;
    stepTd(s, [{ t: s.tick, type: 'sell', slot: 0 }]);
    expect(s.camps).toHaveLength(1);
    expect(s.slots[0]!.tower).toBe(s.camps![0]!.id);
    expect(s.gold).toBe(g);
  });
});

describe('多段首领换形态', () => {
  it('扛着宝藏回船的途中换段：新形态接着回船、带着宝藏，不折返再抢', () => {
    const s = createTd(setup(lvl({ waves: one('tyrant', 1, 0) }), { camp: undefined }));
    bench(s);
    stepTd(s, [{ t: s.tick, type: 'build', slot: 0, kind: 'gunTower' }]);
    let boss = s.enemies.find((e) => e.kind === 'tyrant');
    for (let i = 0; i < 400 && !boss; i++) {
      stepTd(s, []);
      boss = s.enemies.find((e) => e.kind === 'tyrant');
    }
    if (!boss) throw new Error('没刷出舰长');
    boss.x = 1100;
    boss.y = 600;
    boss.mode = 'out';
    boss.carry = 3;
    boss.hp = Math.floor((boss.maxHp * 26) / 100);
    let next: number | undefined;
    for (let i = 0; i < 400 && next === undefined; i++) for (const e of stepTd(s, [])) if (e.type === 'phase') next = e.next;
    const n = s.enemies.find((e) => e.id === next);
    expect(n?.kind).toBe('tyrantRun');
    expect(n?.mode).toBe('out');
    expect(n?.carry).toBe(3);
  });
});
