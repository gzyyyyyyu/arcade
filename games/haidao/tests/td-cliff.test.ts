import { describe, expect, it } from 'vitest';
import { RULES_VERSION, SHIELD, TD2_CLIFF, TD2_COST, cliffOn, createTd, runTd, stepTd, tdBuildCost, tdBuildRange, tdCampaign, tdGrowthSetup, tdTowerRange } from '../src/core/index.ts';
import type { Placed, TdAction, TdEnemyKind, TdEvent, TdLevel, TdMode, TdSetup, TdState } from '../src/core/index.ts';
import { cellIdx } from '../src/core/grid.ts';
import { inner } from '../src/core/tdstate.ts';

/** 第五章「断崖海岸」：断崖格、崖上高台、盾兵在断崖关的判定；只由关卡的 cliffs 打开 */

const LAYOUT: Placed[] = [{ id: 1, kind: 'hq', level: 1, x: 18, y: 0 }, { id: 2, kind: 'treasure', level: 1, x: 10, y: 19 }];

/**
 * 试验岛：北边一条直路（x = 10 往南走到宝藏箱），东南边一小块崖，崖上一块高台；cliffs 不写就是普通岛（高台标记不起作用）。
 * slots：0、1 是路尽头、正对着来人的两块（正面）；2、3 是路两侧的两块（侧面）；4 是崖上的高台（在来人的前方偏东，打过去也是盾的正面）
 */
function arena(o: { cliffs?: boolean; enemy?: TdEnemyKind; n?: number; waves?: number } = {}): TdLevel {
  const n = o.n ?? 6;
  return {
    id: 't', name: 't', hq: 8, hpPct: 100, gold: 99_999, first: 1, waveTicks: 600, lanes: [{ x: 10, y: -2 }],
    waves: Array.from({ length: o.waves ?? 1 }, () => ({ groups: [{ enemy: o.enemy ?? 'shield', n, lane: 0, every: 30 }] })),
    kegs: [], obstacles: [],
    slots: [{ x: 7, y: 17 }, { x: 11, y: 17 }, { x: 6, y: 8 }, { x: 13, y: 8 }, { x: 14, y: 11, high: true }],
    ...(o.cliffs === false ? {} : { cliffs: [{ x: 13, y: 10 }, { x: 16, y: 10 }, { x: 13, y: 13 }, { x: 16, y: 13 }] }),
  };
}
const setup = (level: TdLevel, o: { mode?: TdMode; hero?: number } = {}): TdSetup => ({
  layout: LAYOUT, level, hero: o.hero ?? 1, seed: 1, rules: RULES_VERSION, mode: o.mode ?? 'campaign', unlocked: ['cannon', 'gunTower', 'mortar'],
});
/** 在这几块木台上造塔（第 0 拍造、立刻升 ups 次，默认升满阶） */
const towers = (slots: number[], kind: 'cannon' | 'gunTower' | 'mortar' = 'cannon', ups = 2): TdAction[] =>
  slots.flatMap((slot): TdAction[] => [{ t: 0, type: 'build', slot, kind }, ...Array.from({ length: ups }, (): TdAction => ({ t: 0, type: 'up', slot }))]);
/** 把英雄挪开、不让它动（试验只看塔） */
function benchHero(s: TdState): void {
  s.hero.x = 1 * 100 + 50;
  s.hero.y = 20 * 100 + 50;
  s.hero.goal = { x: s.hero.x, y: s.hero.y };
}

describe('断崖关的开关', () => {
  it('关卡写了 cliffs 才开；没写 cliffs 的关，高台标记不起作用、崖格能走', () => {
    expect(cliffOn({ level: arena() })).toBe(true);
    expect(cliffOn({ level: arena({ cliffs: false }) })).toBe(false);
    const on = createTd(setup(arena()));
    const old = createTd(setup(arena({ cliffs: false })));
    expect(on.slots[4]!.high).toBe(true);
    expect(old.slots[4]!.high).toBeUndefined();
    expect(inner(on).fixed[cellIdx(13, 10)]).toBe(2);
    expect(inner(old).fixed[cellIdx(13, 10)]).toBe(0);
  });

  it('战役第五章的关都写了 cliffs、用到的高台不在断崖格里；前四章的关都没写', () => {
    for (const lv of tdCampaign()) {
      if (lv.chapter !== 5) {
        expect(lv.cliffs, lv.id).toBeUndefined();
        continue;
      }
      expect(lv.cliffs?.length, lv.id).toBeGreaterThan(0);
      const highs = lv.slots.filter((p) => p.high);
      expect(highs.length, lv.id).toBeGreaterThanOrEqual(2);
      for (const p of highs) for (const c of lv.cliffs!) expect(c.x >= p.x && c.x <= p.x + 1 && c.y >= p.y && c.y <= p.y + 1, `${lv.id} 高台 ${p.x},${p.y}`).toBe(false);
    }
  });
});

describe('崖上的高台', () => {
  it('射程多 rangeAdd、崖下 minRange 内打不到（和臼炮的近身死区取大的）；造价按 costPct，升阶照常', () => {
    const r = tdGrowthSetup('td25', 'suggest', 1);
    if (!r.ok) throw new Error(r.error);
    const high = r.value.level.slots.findIndex((p) => p.high);
    const low = r.value.level.slots.findIndex((p) => !p.high);
    const res = runTd({ ...r.value, level: { ...r.value.level, gold: 99_999, waves: [] }, unlocked: ['cannon', 'mortar'] }, [
      { t: 0, type: 'build', slot: high, kind: 'cannon' },
      { t: 0, type: 'build', slot: low, kind: 'cannon' },
    ]);
    const s = res.state;
    const on = (slot: number) => s.towers.find((t) => t.slot === slot)!;
    const base = tdBuildRange('cannon', 1);
    expect(tdTowerRange(s, on(high))).toEqual({ range: base.range + TD2_CLIFF.rangeAdd, minRange: TD2_CLIFF.minRange });
    expect(tdTowerRange(s, on(low))).toEqual(base);
    expect(tdBuildRange('cannon', 1, true)).toEqual(tdTowerRange(s, on(high)));
    // 臼炮自己的死区（3 格）比崖下的 2 格大：取大的
    expect(tdBuildRange('mortar', 1, true).minRange).toBe(Math.max(tdBuildRange('mortar', 1).minRange, TD2_CLIFF.minRange));
    expect(tdBuildCost(s, high, 'cannon')).toBe(Math.floor((TD2_COST.cannon * TD2_CLIFF.costPct) / 100));
    expect(tdBuildCost(s, low, 'cannon')).toBe(TD2_COST.cannon);
    expect(s.slots[high]!.spent).toBe(tdBuildCost(s, high, 'cannon'));
  });

  it('高台上的塔打崖脚下（死区里）的敌人打不到，离开死区就打', () => {
    const s = createTd(setup(arena({ enemy: 'sailor', n: 1 })));
    stepTd(s, towers([4]));
    while (s.enemies.length === 0) stepTd(s, []);
    const e = s.enemies[0]!;
    // 血调厚：登陆那一刻它在射程里、挨了一炮，别让它死了
    e.hp = 1_000_000;
    e.maxHp = e.hp;
    const t = s.towers[0]!;
    /** 把敌人按在 (x, y) 上 n 拍，数这座塔开了几炮 */
    const shots = (x: number, y: number, n: number): number => {
      let k = 0;
      for (let i = 0; i < n; i++) {
        benchHero(s);
        e.x = x;
        e.y = y;
        for (const ev of stepTd(s, []) as TdEvent[]) if (ev.type === 'shoot' && ev.id === t.id) k++;
      }
      return k;
    };
    // 高台 (14, 11) 的中心在 (1500, 1200)：贴着崖脚 1.5 格在死区里，7 格外在射程里
    expect(shots(1350, 1200, 200)).toBe(0);
    expect(shots(1000, 700, 200)).toBeGreaterThan(0);
  });
});

describe('盾兵在断崖关', () => {
  /** 一局里推了几次 guard（盾挡住了） */
  function guards(level: TdLevel, acts: TdAction[], o: { hero?: number; bench?: boolean } = {}): number {
    const s = createTd(setup(level, o));
    if (o.bench !== false) benchHero(s);
    let n = 0;
    const sorted = [...acts];
    while (!s.over) {
      const now = sorted.filter((a) => a.t === s.tick);
      for (const ev of stepTd(s, now) as TdEvent[]) if (ev.type === 'guard') n++;
      if (o.bench !== false) benchHero(s);
    }
    return n;
  }

  it('崖上高台往下打的直射，盾挡不住（同一座加农放在路尽头正面就被挡）', () => {
    expect(guards(arena(), towers([4]))).toBe(0);
    expect(guards(arena(), towers([0]))).toBeGreaterThan(0);
    // 没写 cliffs 的岛：同一块木台不是高台，从同一个位置打就被挡（说明是「从崖上往下打」起的作用，不是位置）
    expect(guards(arena({ cliffs: false }), towers([4]))).toBeGreaterThan(0);
  });

  it('英雄的枪：断崖关里正面照样被盾挡；别的关（海盗来袭等）不挡', () => {
    const hero = (cliffs: boolean): number => {
      const level = arena({ cliffs, n: 4 });
      return guards({ ...level, slots: [] }, [], { hero: 8, bench: false });
    };
    expect(hero(true)).toBeGreaterThan(0);
    expect(hero(false)).toBe(0);
  });

  it('锚钩钩住的盾兵：拖动和定住期间盾放下，正面打过来也不挡', () => {
    const s = createTd(setup(arena({ n: 1 }), { hero: 8 }));
    while (s.enemies.length === 0) stepTd(s, []);
    const e = s.enemies[0]!;
    s.hero.x = 1050;
    s.hero.y = 1050;
    s.hero.goal = { x: s.hero.x, y: s.hero.y };
    e.x = 1050;
    e.y = 650;
    stepTd(s, [{ t: s.tick, type: 'hook', id: e.id }]);
    expect(e.hook).toBeDefined();
    const until = e.stunUntil ?? 0;
    let blocked = 0;
    while (s.tick < until) for (const ev of stepTd(s, []) as TdEvent[]) if (ev.type === 'guard' && ev.id === e.id) blocked++;
    expect(until).toBeGreaterThan(0);
    expect(blocked).toBe(0);
  });

  it('站位克制：同样两座 2 阶加农，放在路两侧比放在路尽头正对着来人少漏 ≥ 3 枚宝藏', () => {
    // 四波全是盾兵，从北往南直走；正面那两座一直打在盾上，侧面那两座等盾兵走到旁边、走过去以后打在侧面和背后
    const lost = (slots: number[]): number => runTd(setup(arena({ n: 8, waves: 4 })), towers(slots, 'cannon', 1)).result.lost;
    const front = lost([0, 1]);
    const side = lost([2, 3]);
    expect(front - side, `正面漏 ${front}、侧面漏 ${side}`).toBeGreaterThanOrEqual(3);
    expect(SHIELD.frontPct).toBeLessThan(100);
  }, 60_000);
});
