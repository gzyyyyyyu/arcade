import { describe, expect, it } from 'vitest';
import {
  BUILDINGS, RULES_VERSION, TD2_BOSS_EXTRA_TICKS, TD2_COST, TD2_ECON, TD2_ENEMIES, TD2_HERO, TD2_HERO_SKILL, TD2_LEVEL_BY_ID, TD2_LOSE_AT,
  TD2_MINE_REARM_TICKS, TD2_TREASURE_ROLL_TICKS, TD2_UP_PCT, TD_BRANCH_MOD, TD_TREASURE, createTd, runTd, runTdBot, stepTd, tdBarricadeHp,
  tdBuildBlock, tdCallBonus, tdFingerprint, tdGrowthSetup, tdPreview, tdResult, tdRoutes, tdSellRefund, tdStars,
} from '../src/core/index.ts';
import type { Placed, TdAction, TdEvent, TdLevel, TdSetup, TdState } from '../src/core/index.ts';
import { UNIT } from '../src/core/types.ts';

/** 守岛规则核心（src/core/td.ts）：找路、敌人、炸药桶、宝藏、星数、叫波、木台和驻守台、卖塔清障、拒马、确定性 */

function lvl(p: Partial<TdLevel> = {}): TdLevel {
  return { id: 't', name: 't', hq: 1, hpPct: 100, gold: 0, first: 0, waveTicks: 4000, lanes: [{ x: 10, y: -2 }], waves: [], kegs: [], obstacles: [], slots: [], ...p };
}
function base(extra: Placed[] = [], treasure: [number, number] = [10, 13]): Placed[] {
  return [{ id: 1, kind: 'hq', level: 1, x: 9, y: 9 }, { id: 2, kind: 'treasure', level: 1, x: treasure[0], y: treasure[1] }, ...extra];
}
function setup(layout: Placed[], level: TdLevel, seed = 1, extra: Partial<TdSetup> = {}): TdSetup {
  return { layout, level, hero: 1, seed, rules: RULES_VERSION, mode: 'campaign', ...extra };
}
/** 英雄先"倒下"很久：测塔和敌人的时候不让它插手 */
function benchHero(s: TdState): void {
  s.hero.respawn = 1_000_000;
  s.hero.hp = 0;
}
/** 推进到 until 返回 true 或 maxTicks，收集事件 */
function run(s: TdState, until: (s: TdState, ev: TdEvent[]) => boolean, maxTicks = 4000, acts: (s: TdState) => TdAction[] = () => []): TdEvent[] {
  const all: TdEvent[] = [];
  for (let i = 0; i < maxTicks && !s.over; i++) {
    const ev = stepTd(s, acts(s));
    all.push(...ev);
    if (until(s, ev)) break;
  }
  return all;
}
const wallRow = (y: number, xs: number[], level = 3, id0 = 100): Placed[] => xs.map((x, i) => ({ id: id0 + i, kind: 'wall', level, x, y }));
const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const sample = (seed: number, growth: 'zero' | 'suggest' | 'max' = 'suggest'): TdSetup => {
  const r = tdGrowthSetup('td2-sample', growth, seed);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe('守岛：确定性', () => {
  it('同一个种子加同一串操作，重放指纹和结果一致；三种机器人自己打的那局也一样', () => {
    for (const bot of ['novice', 'normal', 'greedy'] as const) {
      const st = sample(3);
      const r = runTdBot(st, bot);
      const a = runTd(sample(3), r.actions);
      const b = runTd(sample(3), r.actions);
      expect(tdFingerprint(a.state), bot).toBe(tdFingerprint(b.state));
      expect(a.result).toEqual(b.result);
      expect(tdFingerprint(a.state)).toBe(tdFingerprint(r.state));
      expect(a.result).toEqual(r.result);
      expect(a.result.over).toBe(true);
    }
  }, 60_000);
  it('换种子结果可以不同（登陆点有抖动）', () => {
    const fp = new Set<number>();
    for (const seed of [1, 2, 3]) fp.add(tdFingerprint(runTdBot(sample(seed), 'novice').state));
    expect(fp.size).toBeGreaterThan(1);
  });
});

describe('守岛：找路', () => {
  const one = (enemy: 'sailor' | 'sapper' | 'parrot'): TdLevel => lvl({ waves: [{ groups: [{ enemy, n: 1, lane: 0, every: 1 }] }] });

  it('墙上有近的缺口就绕过去，不砸墙', () => {
    const walls = wallRow(5, range(0, 21).filter((x) => x !== 12));
    const s = createTd(setup(base(walls), one('sailor')));
    benchHero(s);
    const seen = new Set<string>();
    const ev = run(s, (st) => {
      for (const e of st.enemies) seen.add(`${Math.floor(e.x / 100)},${Math.floor(e.y / 100)}`);
      return st.vault < TD_TREASURE;
    });
    expect(ev.some((e) => e.type === 'grab')).toBe(true);
    expect(seen.has('12,5')).toBe(true);
    expect(s.walls.every((w) => w.hp === w.maxHp)).toBe(true);
  });

  it('工兵直奔挡路的墙，炸开一段', () => {
    const walls = wallRow(5, range(0, 21).filter((x) => x !== 12));
    const s = createTd(setup(base(walls), one('sapper')));
    benchHero(s);
    const ev = run(s, (st) => st.walls.some((w) => w.destroyed));
    expect(s.walls.some((w) => w.destroyed)).toBe(true);
    expect(ev.some((e) => e.type === 'die')).toBe(true);
  });

  it('没有缺口时水手砸墙过去', () => {
    const walls = wallRow(5, range(0, 21));
    const s = createTd(setup(base(walls), one('sailor')));
    benchHero(s);
    run(s, (st) => st.vault < TD_TREASURE);
    expect(s.vault).toBe(TD_TREASURE - 1);
    expect(s.walls.some((w) => w.hp < w.maxHp)).toBe(true);
  });

  it('鹦鹉飞过整圈墙直扑宝藏箱，墙一点没掉', () => {
    const ring: Placed[] = [];
    let id = 100;
    for (let x = 8; x <= 12; x++) for (const y of [14, 18]) ring.push({ id: id++, kind: 'wall', level: 3, x, y });
    for (let y = 15; y <= 17; y++) for (const x of [8, 12]) ring.push({ id: id++, kind: 'wall', level: 3, x, y });
    const s = createTd(setup([{ id: 1, kind: 'hq', level: 1, x: 2, y: 2 }, { id: 2, kind: 'treasure', level: 1, x: 10, y: 16 }, ...ring], one('parrot')));
    benchHero(s);
    const ev = run(s, (st) => st.vault < TD_TREASURE);
    expect(ev.some((e) => e.type === 'grab')).toBe(true);
    expect(s.walls.every((w) => w.hp === w.maxHp)).toBe(true);
    expect(s.tick).toBeLessThan(400);
  });
});

describe('守岛：敌人', () => {
  const firstHit = (layout: Placed[], enemy: 'ironclad' | 'fog' | 'sailor'): TdEvent[] => {
    const s = createTd(setup(layout, lvl({ hpPct: 1000, waves: [{ groups: [{ enemy, n: 1, lane: 0, every: 1 }] }] })));
    benchHero(s);
    return run(s, (st) => st.vault < TD_TREASURE || st.tick > 900).filter((e) => e.type === 'hit');
  };
  const cannon = (branch?: string[]): Placed => ({ id: 50, kind: 'cannon', level: 3, x: 11, y: 3, ...(branch ? { branch } : {}) });
  const base3 = BUILDINGS.cannon.levels[2]!.dmg!;

  it('炮弹打重甲 1.5 倍；穿甲弹在守岛里是"打重甲再加几成"，对布衣只多分叉自带的那点伤害', () => {
    const pierce = TD_BRANCH_MOD.get('cannon.pierce')!;
    const withAp = Math.floor((base3 * (100 + (pierce.dmgPct ?? 0))) / 100);
    expect(firstHit(base([cannon()]), 'ironclad')[0]).toMatchObject({ dmg: Math.floor((base3 * 150) / 100) });
    expect(firstHit(base([cannon(['cannon.pierce'])]), 'ironclad')[0]).toMatchObject({ dmg: Math.floor((withAp * (150 + pierce.heavyPct!)) / 100) });
    expect(firstHit(base([cannon(['cannon.pierce'])]), 'sailor')[0]).toMatchObject({ dmg: withAp });
  });

  it('雾船：没有灯塔打不中，灯塔分叉照亮后就打得中', () => {
    const gun = (branch?: string[]): Placed => ({ id: 50, kind: 'gunTower', level: 3, x: 11, y: 3, ...(branch ? { branch } : {}) });
    expect(firstHit(base([gun()]), 'fog')).toHaveLength(0);
    expect(firstHit(base([gun(['gunTower.lighthouse'])]), 'fog').length).toBeGreaterThan(0);
  });

  it('英雄身边 2 格能照亮雾船', () => {
    const s = createTd(setup(base([{ id: 50, kind: 'gunTower', level: 3, x: 11, y: 3 }]), lvl({ hpPct: 1000, waves: [{ groups: [{ enemy: 'fog', n: 1, lane: 0, every: 1 }] }] })));
    const ev = run(s, (st) => st.vault < TD_TREASURE || st.tick > 900, 4000, (st) => (st.tick === 0 ? [{ t: 0, type: 'move', x: 1050, y: 150 }] : []));
    expect(ev.some((e) => e.type === 'hit')).toBe(true);
  });

  it('分裂小艇打沉后分成 3 个小艇', () => {
    const s = createTd(setup(base([cannon()]), lvl({ hpPct: 1, waves: [{ groups: [{ enemy: 'skiff', n: 1, lane: 0, every: 1 }] }] })));
    benchHero(s);
    const ev = run(s, (st) => st.enemies.some((e) => e.kind === 'skiffling'));
    expect(ev.filter((e) => e.type === 'spawn' && e.kind === 'skiffling')).toHaveLength(3);
  });

  it('飞禽：炮弹、火打不到（不瞄准），枪弹打得到；火箭选"高射"才打得到', () => {
    const hits = (p: Placed): number => {
      const s = createTd(setup(base([p]), lvl({ hpPct: 1000, waves: [{ groups: [{ enemy: 'parrot', n: 1, lane: 0, every: 1 }] }] })));
      benchHero(s);
      const ev = run(s, (st) => st.vault < TD_TREASURE);
      expect(s.towers[0]!.aim === -1 || ev.some((e) => e.type === 'hit')).toBe(true);
      return ev.filter((e) => e.type === 'hit').length;
    };
    const at = { id: 50, level: 3, x: 11, y: 3 } as const;
    expect(hits({ ...at, kind: 'cannon' })).toBe(0);
    expect(hits({ ...at, kind: 'flame' })).toBe(0);
    expect(hits({ ...at, kind: 'rocket' })).toBe(0);
    expect(hits({ ...at, kind: 'gunTower' })).toBeGreaterThan(0);
    expect(hits({ ...at, kind: 'rocket', branch: ['rocket.flak'] })).toBeGreaterThan(0);
  });

  it('瞄准离宝藏箱路程最近的（走在最前面的），不是离塔最近的', () => {
    // 塔在登陆口边上：后上岸的离塔近，先上岸的走得远
    const s = createTd(setup(base([{ id: 50, kind: 'harpoon', level: 1, x: 12, y: -2 }]), lvl({ hpPct: 1000, waves: [{ groups: [{ enemy: 'sailor', n: 2, lane: 0, every: 60 }] }] })));
    benchHero(s);
    let checked = false;
    run(s, (st) => {
      const live = st.enemies.filter((e) => e.mode === 'in');
      if (live.length < 2) return false;
      const [a, b] = live as [typeof live[0], typeof live[0]];
      const tower = st.towers[0]!;
      const dA = (a.x - 1300) ** 2 + (a.y + 100) ** 2;
      const dB = (b.x - 1300) ** 2 + (b.y + 100) ** 2;
      if (a.y - b.y < 200 || dB >= dA) return false;
      expect(tower.aim).toBe(a.id);
      checked = true;
      return true;
    }, 600);
    expect(checked).toBe(true);
  });

  it('英雄最多同时缠住 3 个地面敌人，多的绕过去', () => {
    const s = createTd(setup(base(), lvl({ waves: [{ groups: [{ enemy: 'sailor', n: 6, lane: 0, every: 2 }] }] })));
    s.hero.x = 1050;
    s.hero.y = 550;
    s.hero.post = { x: 1050, y: 550 }; // 摆在这里 = 守点在这里
    s.hero.hp = 1_000_000;
    s.hero.maxHp = 1_000_000;
    // 英雄不还手：只看挡路
    const ev = run(s, (st) => st.vault < TD_TREASURE, 1500, (st) => {
      st.hero.cd = st.tick + 100;
      return [];
    });
    expect(TD2_HERO.maxEngaged).toBe(3);
    expect(ev.some((e) => e.type === 'grab')).toBe(true);
    expect(s.hero.respawn).toBe(-1);
  });
});

describe('守岛：炸药桶、地雷', () => {
  it('英雄扔炸药桶点着地上的一串，挨着的连锁炸开，敌我都炸，远处的不炸', () => {
    const kegs = [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 5, y: 7 }, { x: 6, y: 8 }, { x: 7, y: 9 }, { x: 18, y: 18 }];
    const s = createTd(setup(base([], [8, 8]), lvl({ kegs, waves: [{ groups: [] }], first: 100000 })));
    expect([s.hero.x, s.hero.y]).toEqual([850, 950]);
    const hp0 = s.hero.hp;
    const ev = run(s, (st) => st.tick > 80, 4000, (st) => (st.tick === 0 ? [{ t: 0, type: 'keg', x: 550, y: 550 }] : []));
    expect(s.kegs.filter((k) => !k.alive)).toHaveLength(5);
    expect(s.kegs.find((k) => k.x === 1850)?.alive).toBe(true);
    expect(s.hero.hp).toBeLessThan(hp0);
    expect(ev.filter((e) => e.type === 'explode').length).toBeGreaterThanOrEqual(6);
    expect(s.hero.kegReady).toBe(TD2_HERO_SKILL.bomb.cd);
  });

  it('炸药桶伤害是这一关每波平均单个敌人血量的 dmgPct%，按爆破算（铁甲、水手一样，打不到飞的）', () => {
    const waves = [{ groups: [{ enemy: 'sailor' as const, n: 3, lane: 0, every: 1 }] }, { groups: [{ enemy: 'ironclad' as const, n: 1, lane: 0, every: 1 }] }];
    const s = createTd(setup(base(), lvl({ waves, first: 100000 })));
    const avg = Math.floor((TD2_ENEMIES.sailor.hp * 3 + TD2_ENEMIES.ironclad.hp) / 4);
    const want = Math.floor((avg * TD2_HERO_SKILL.bomb.dmgPct) / 100);
    // 敌人摆到英雄身边
    const ev = run(s, () => false, 1, (st) => [{ t: st.tick, type: 'keg', x: st.hero.x, y: st.hero.y - 200 }]);
    expect(ev.some((e) => e.type === 'hero' && e.what === 'keg')).toBe(true);
    benchHero(s); // 炸药桶已经扔出去了；英雄别再开枪，免得命中混进来
    s.enemies.push(
      { id: 900, kind: 'ironclad', wave: 0, x: s.hero.x, y: s.hero.y - 200, hp: 10000, maxHp: 10000, mode: 'in', carry: 0, hx: 0, hy: 0, cd: 1e9, slowUntil: 0, slowPct: 0, face: 1, trail: [] },
      { id: 901, kind: 'parrot', wave: 0, x: s.hero.x, y: s.hero.y - 200, hp: 10000, maxHp: 10000, mode: 'in', carry: 0, hx: 0, hy: 0, cd: 1e9, slowUntil: 0, slowPct: 0, face: 1, trail: [] },
    );
    const hits = run(s, (st) => st.tick > 12, 20).filter((e) => e.type === 'hit');
    expect(hits).toContainEqual({ type: 'hit', id: 900, dmg: want });
    expect(hits.some((e) => e.type === 'hit' && e.id === 901)).toBe(false);
  });

  it('地雷炸完过一阵重新埋好（rearm），能再炸', () => {
    const waves = [{ groups: [{ enemy: 'sailor' as const, n: 1, lane: 0, every: 1 }] }, { groups: [{ enemy: 'sailor' as const, n: 1, lane: 0, every: 1 }] }];
    const s = createTd(setup(base([{ id: 60, kind: 'mine', level: 1, x: 10, y: 3 }]), lvl({ hpPct: 1000, waves, waveTicks: TD2_MINE_REARM_TICKS + 200 })));
    benchHero(s);
    const ev = run(s, (st) => st.over, 3000);
    const booms = ev.filter((e) => e.type === 'explode');
    const rearm = ev.filter((e) => e.type === 'rearm');
    expect(rearm.length).toBeGreaterThanOrEqual(1);
    for (const r of rearm) expect(r).toEqual({ type: 'rearm', id: 60 });
    expect(booms.length).toBeGreaterThanOrEqual(2);
  });
});

describe('守岛：宝藏', () => {
  it('被拿走 1 枚、半路打死掉在地上、英雄捡回去', () => {
    const s = createTd(setup(base(), lvl({ waves: [{ groups: [{ enemy: 'sailor', n: 2, lane: 0, every: 2000 }] }] })));
    benchHero(s);
    run(s, (st) => st.vault < TD_TREASURE);
    expect(s.vault).toBe(TD_TREASURE - 1);
    const e = s.enemies.find((q) => q.mode === 'out')!;
    expect(e.carry).toBe(1);
    e.hp = 1;
    s.hero.respawn = s.tick;
    const ev = run(s, (st) => st.piles.length > 0, 200);
    expect(ev.some((q) => q.type === 'drop')).toBe(true);
    const pile = s.piles[0]!;
    const ev2 = run(s, (st) => st.piles.length === 0, 600, (st) => (st.hero.goal ? [] : [{ t: st.tick, type: 'move', x: pile.x, y: pile.y }]));
    expect(ev2.some((q) => q.type === 'pickup')).toBe(true);
    expect(s.vault).toBe(TD_TREASURE);
    expect(s.lost).toBe(0);
  });

  it('地上的宝藏没人捡，TD2_TREASURE_ROLL_TICKS 拍后自己滚回箱子（roll 事件）', () => {
    const s = createTd(setup(base(), lvl({ waves: [{ groups: [{ enemy: 'sailor', n: 2, lane: 0, every: 4000 }] }] })));
    benchHero(s);
    run(s, (st) => st.vault < TD_TREASURE);
    const e = s.enemies.find((q) => q.mode === 'out')!;
    e.hp = 1;
    s.hero.respawn = s.tick;
    run(s, (st) => st.piles.length > 0, 200);
    benchHero(s);
    const dropAt = s.piles[0]!.at;
    const ev = run(s, (st) => st.piles.length === 0, TD2_TREASURE_ROLL_TICKS + 10);
    expect(ev.find((q) => q.type === 'roll')).toMatchObject({ type: 'roll', n: 1 });
    expect(s.tick - dropAt).toBe(TD2_TREASURE_ROLL_TICKS + 1);
    expect(s.vault).toBe(TD_TREASURE);
  });

  it('星数区间：0 → 3★、≤ 3 → 2★、≤ 10 → 1★、11 起 0★', () => {
    expect([0, 1, 3, 4, 10, 11, 20].map(tdStars)).toEqual([3, 2, 2, 1, 1, 0, 0]);
  });

  it('没有塔守，丢到 TD2_LOSE_AT 枚当场结束：0★，撑过的波数少于总波数', () => {
    const waves = Array.from({ length: 4 }, () => ({ groups: [{ enemy: 'parrot' as const, n: 8, lane: 0, every: 5 }] }));
    // 英雄请下场（他会自己去路口打鹦鹉，这里只测没塔）
    const s = createTd(setup(base(), lvl({ waves, waveTicks: 200 })));
    s.hero.respawn = 1_000_000;
    s.hero.hp = 0;
    while (!s.over) stepTd(s, []);
    const result = tdResult(s);
    expect(result.over).toBe(true);
    expect(result.stars).toBe(0);
    expect(result.lost).toBeGreaterThanOrEqual(TD2_LOSE_AT);
    expect(result.lost).toBeLessThan(TD_TREASURE);
    expect(result.waves).toBeLessThan(4);
  });
});

describe('守岛：波次和叫波', () => {
  it('叫下一波：金 = 下一波击杀金 × 剩余倒数占比 × callPct%，剩下的倒数抵英雄技能冷却（wave 事件带 cdCut）', () => {
    const waves = [{ groups: [] }, { groups: [{ enemy: 'sailor' as const, n: 4, lane: 0, every: 2000 }, { enemy: 'skiff' as const, n: 1, lane: 0, every: 1, delay: 3000 }] }];
    const s = createTd(setup(base(), lvl({ waveTicks: 400, waves })));
    run(s, (st) => st.tick >= 100);
    expect(s.wave).toBe(1);
    const killGold = 4 * TD2_ENEMIES.sailor.gold + TD2_ENEMIES.skiff.gold + 3 * TD2_ENEMIES.skiffling.gold;
    const left = 400 - 100;
    const gold = Math.floor((killGold * left * TD2_ECON.callPct) / (400 * 100));
    const cdCut = Math.floor((left * TD2_ECON.callCdPct) / 100);
    expect(tdCallBonus(s)).toEqual({ gold, cdCut });
    s.hero.kegReady = s.tick + 500;
    s.hero.barricadeReady = s.tick + 100;
    const g0 = s.gold;
    const t0 = s.tick;
    const ev = stepTd(s, [{ t: s.tick, type: 'call' }]);
    expect(ev).toContainEqual({ type: 'wave', wave: 1, early: true, bonus: gold, cdCut });
    expect(s.gold).toBe(g0 + gold);
    expect(s.hero.kegReady).toBe(t0 + 500 - cdCut);
    expect(s.hero.barricadeReady).toBe(t0);
    expect(s.wave).toBe(2);
    expect(tdCallBonus(s)).toEqual({ gold: 0, cdCut: 0 });
  });

  it('首领波前多给 TD2_BOSS_EXTRA_TICKS 拍（关卡写了 bossExtra 按它）；预告带 boss 和开打的拍', () => {
    const waves = [{ groups: [] }, { groups: [] }, { groups: [], boss: true }];
    const s = createTd(setup(base(), lvl({ first: 50, waveTicks: 300, waves })));
    const pv0 = tdPreview(s, 3);
    expect(pv0.map((p) => p.at)).toEqual([50, 350, 650 + TD2_BOSS_EXTRA_TICKS]);
    expect(pv0.map((p) => p.boss)).toEqual([false, false, true]);
    run(s, (st) => st.wave >= 2);
    expect(s.next - s.tick).toBe(300 + TD2_BOSS_EXTRA_TICKS - 1);
    const own = createTd(setup(base(), { ...lvl({ first: 50, waveTicks: 300, waves }), bossExtra: 77 } as TdLevel));
    run(own, (st) => st.wave >= 2);
    expect(own.next - own.tick).toBe(300 + 77 - 1);
  });
});

describe('守岛：木台、驻守台、卖塔、清障', () => {
  it('木台：造 1 阶、升两次到 3 阶（花造价的 TD2_UP_PCT%），3 阶才能选分叉；花的钱记在 spent；打完岛（layout）不变', () => {
    const layout = base();
    const before = JSON.stringify(layout);
    const level = lvl({ gold: 2000, slots: [{ x: 1, y: 1 }], first: 100000, waves: [{ groups: [] }] });
    const s = createTd(setup(layout, level));
    const step = (a: TdAction): void => void stepTd(s, [{ ...a, t: s.tick }]);
    step({ t: 0, type: 'build', slot: 0, kind: 'cannon' });
    const t = s.towers.find((q) => q.slot === 0)!;
    expect(t.tier).toBe(1);
    expect(s.gold).toBe(2000 - TD2_COST.cannon);
    step({ t: 0, type: 'up', slot: 0 });
    step({ t: 0, type: 'branch', slot: 0, branch: 'cannon.pierce' }); // 2 阶选不了
    expect(t.branch).toEqual([]);
    step({ t: 0, type: 'up', slot: 0 });
    step({ t: 0, type: 'up', slot: 0 }); // 升满了
    expect(t.tier).toBe(3);
    const spent = TD2_COST.cannon + Math.floor((TD2_COST.cannon * TD2_UP_PCT[0]) / 100) + Math.floor((TD2_COST.cannon * TD2_UP_PCT[1]) / 100);
    expect(s.slots[0]!.spent).toBe(spent);
    expect(s.gold).toBe(2000 - spent);
    step({ t: 0, type: 'branch', slot: 0, branch: 'cannon.pierce' });
    step({ t: 0, type: 'branch', slot: 0, branch: 'cannon.heavy' });
    expect(t.branch).toEqual(['cannon.pierce', 'cannon.heavy']);
    expect(JSON.stringify(layout)).toBe(before);
  });

  it('tdBuildBlock：英雄站在台上（中心 ±100 内）造不了，界面读同一个函数写原因；英雄走开、倒下就能造', () => {
    const level = lvl({ gold: 2000, slots: [{ x: 1, y: 1 }], first: 100000, waves: [{ groups: [] }] });
    const s = createTd(setup(base(), level));
    s.hero.x = 2 * UNIT + 40;
    s.hero.y = 2 * UNIT - 30;
    expect(tdBuildBlock(s, 0)).toBe('hero');
    stepTd(s, [{ t: s.tick, type: 'build', slot: 0, kind: 'cannon' }]);
    expect(s.towers).toHaveLength(0);
    s.hero.x = 2 * UNIT + 160;
    expect(tdBuildBlock(s, 0)).toBeNull();
    s.hero.x = 2 * UNIT;
    s.hero.respawn = 1_000_000;
    expect(tdBuildBlock(s, 0)).toBeNull();
    expect(tdBuildBlock(s, 5)).toBeNull();
    stepTd(s, [{ t: s.tick, type: 'build', slot: 0, kind: 'cannon' }]);
    expect(s.towers).toHaveLength(1);
  });

  it('没指挥时英雄自己站到威胁最大那条路的路口（不站木台）；指挥过就听玩家的，复活后重新自己守', () => {
    const lv = lvl({ lanes: [{ x: 2, y: -2 }, { x: 19, y: -2 }], slots: [{ x: 15, y: 6 }, { x: 16, y: 9 }], first: 100000, waves: [{ groups: [{ enemy: 'sailor', n: 8, lane: 1, every: 20 }] }] });
    const s = createTd(setup(base(), lv));
    const onSlot = (x: number, y: number): boolean => s.slots.some((q) => Math.abs(x - (q.x * UNIT + 100)) < 100 && Math.abs(y - (q.y * UNIT + 100)) < 100);
    for (let i = 0; i < 300; i++) stepTd(s, []);
    const post = s.hero.post!;
    expect(post.x).toBeGreaterThan(10 * UNIT + 50); // 东边那条路来敌人，站到东边
    expect(onSlot(post.x, post.y)).toBe(false);
    expect(Math.hypot(s.hero.x - post.x, s.hero.y - post.y)).toBeLessThan(60);
    // 指到木台上：挪到台边；之后自己守不再改守点
    stepTd(s, [{ t: s.tick, type: 'move', x: 16 * UNIT + 100, y: 6 * UNIT + 90 }]);
    expect(onSlot(s.hero.goal!.x, s.hero.goal!.y)).toBe(false);
    const cmd = { ...s.hero.post! };
    for (let i = 0; i < 400; i++) stepTd(s, []);
    expect(s.hero.post).toEqual(cmd);
    expect(onSlot(s.hero.x, s.hero.y)).toBe(false);
    s.hero.hp = 0;
    s.hero.respawn = s.tick + 1;
    for (let i = 0; i < 120; i++) stepTd(s, []);
    expect(s.hero.post).toEqual(post);
  });

  it('只能造解锁的守岛塔（TdSetup.unlocked）', () => {
    const level = lvl({ gold: 2000, slots: [{ x: 1, y: 1 }, { x: 4, y: 1 }], first: 100000, waves: [{ groups: [] }] });
    const s = createTd(setup(base(), level, 1, { unlocked: ['gunTower'] }));
    stepTd(s, [{ t: 0, type: 'build', slot: 0, kind: 'cannon' }, { t: 0, type: 'build', slot: 1, kind: 'kraken' }]);
    expect(s.towers).toHaveLength(0);
    stepTd(s, [{ t: 1, type: 'build', slot: 0, kind: 'gunTower' }]);
    expect(s.towers.map((t) => t.kind)).toEqual(['gunTower']);
    expect(s.unlocked).toEqual(['gunTower']);
  });

  it('卖塔：退已花的 sellPct%，木台空出来能再造；退款不算局内挣的', () => {
    const level = lvl({ gold: 1000, slots: [{ x: 1, y: 1 }], first: 100000, waves: [{ groups: [] }] });
    const s = createTd(setup(base(), level));
    stepTd(s, [{ t: 0, type: 'build', slot: 0, kind: 'flame' }]);
    stepTd(s, [{ t: 1, type: 'up', slot: 0 }]);
    const spent = s.slots[0]!.spent!;
    const refund = Math.floor((spent * TD2_ECON.sellPct) / 100);
    expect(tdSellRefund(s, 0)).toBe(refund);
    const g0 = s.gold;
    const ev = stepTd(s, [{ t: 2, type: 'sell', slot: 0 }]);
    expect(ev).toContainEqual({ type: 'sell', slot: 0, refund });
    expect(s.gold).toBe(g0 + refund);
    expect(s.goldEarned).toBe(0);
    expect(s.towers).toHaveLength(0);
    expect(s.slots[0]).toMatchObject({ tower: -1, ups: 0, spent: 0 });
    expect(tdSellRefund(s, 0)).toBe(-1);
    stepTd(s, [{ t: 3, type: 'build', slot: 0, kind: 'cannon' }]);
    expect(s.towers.map((t) => t.kind)).toEqual(['cannon']);
  });

  it('沉船压着的木台：清掉前造不了；花钱立刻清（paid）或英雄去打（给 heroClearGold）', () => {
    const level = lvl({ gold: 500, slots: [{ x: 10, y: 15, wreck: { hp: 200 } }, { x: 6, y: 13, wreck: { hp: 100 } }], first: 100000, waves: [{ groups: [] }] });
    const s = createTd(setup(base(), level));
    const [a, b] = s.slots as [typeof s.slots[0], typeof s.slots[0]];
    expect(a.wreck).toBeDefined();
    stepTd(s, [{ t: 0, type: 'build', slot: 0, kind: 'gunTower' }]);
    expect(s.towers).toHaveLength(0);
    const ev = stepTd(s, [{ t: 1, type: 'clearNow', id: a.wreck! }]);
    expect(ev).toContainEqual({ type: 'cleared', id: s.blocks[0]!.id, slot: 0, paid: true, gold: 0 });
    expect(s.gold).toBe(500 - TD2_ECON.clearGold);
    expect(a.wreck).toBeUndefined();
    stepTd(s, [{ t: 2, type: 'build', slot: 0, kind: 'gunTower' }]);
    expect(s.towers).toHaveLength(1);
    // 英雄去打第二块
    const id = b.wreck!;
    const g0 = s.gold;
    const ev2 = run(s, (st) => st.slots[1]!.wreck === undefined, 800, (st) => (st.tick === 3 ? [{ t: 3, type: 'clear', id }] : []));
    expect(ev2).toContainEqual({ type: 'cleared', id, slot: 1, paid: false, gold: TD2_ECON.heroClearGold });
    expect(s.gold).toBe(g0 + TD2_ECON.heroClearGold);
  });

  it('驻守台：setup.garrison 的塔按给的阶和分叉摆上去，能升、能卖（按同阶木台塔的花费退）；没挑的驻守台能当木台用', () => {
    const level = lvl({ gold: 1000, slots: [{ x: 1, y: 1 }], garrison: [{ x: 4, y: 1, cap: 2 }, { x: 7, y: 1, cap: 3 }], first: 100000, waves: [{ groups: [] }] });
    const s = createTd(setup(base(), level, 1, { garrison: [{ spot: 0, kind: 'cannon', tier: 2, branch: ['cannon.pierce'] }] }));
    expect(s.slots.map((q) => q.garrison)).toEqual([undefined, 0, 1]);
    const t = s.towers.find((q) => q.garrison)!;
    expect(t).toMatchObject({ kind: 'cannon', tier: 2, slot: 1, branch: ['cannon.pierce'] });
    const spent = TD2_COST.cannon + Math.floor((TD2_COST.cannon * TD2_UP_PCT[0]) / 100);
    expect(s.slots[1]!.spent).toBe(spent);
    expect(tdSellRefund(s, 1)).toBe(Math.floor((spent * TD2_ECON.sellPct) / 100));
    stepTd(s, [{ t: 0, type: 'up', slot: 1 }, { t: 0, type: 'build', slot: 2, kind: 'gunTower' }]);
    expect(t.tier).toBe(3);
    expect(s.towers.find((q) => q.slot === 2)?.kind).toBe('gunTower');
  });

  it('基地加成（TdSetup.bonus）按百分比加在这种塔的伤害上', () => {
    const hitOf = (bonus: number): number => {
      const level = lvl({ hpPct: 1000, slots: [{ x: 11, y: 3 }], waves: [{ groups: [{ enemy: 'sailor', n: 1, lane: 0, every: 1 }] }] });
      const s = createTd(setup(base(), level, 1, { garrison: [], bonus: { gunTower: bonus } }));
      s.gold = 1000;
      benchHero(s);
      const ev = run(s, (_, e) => e.some((q) => q.type === 'hit'), 900, (st) => (st.tick === 0 ? [{ t: 0, type: 'build', slot: 0, kind: 'gunTower' }] : []));
      return (ev.find((q) => q.type === 'hit') as { dmg: number }).dmg;
    };
    expect(hitOf(10)).toBeGreaterThan(hitOf(0));
    expect(hitOf(10)).toBe(Math.floor((hitOf(0) * 110) / 100));
  });

  it('修墙花 TD2_ECON.repairGold，打完岛上的墙不受影响', () => {
    const layout = base(wallRow(5, range(0, 21)));
    const snapshot = JSON.stringify(layout);
    const s = createTd(setup(layout, lvl({ gold: 100, first: 100000, waves: [{ groups: [] }] })));
    const w = s.walls[0]!;
    w.hp = 1;
    stepTd(s, [{ t: 0, type: 'repair', id: w.id }]);
    expect(w.hp).toBe(w.maxHp);
    expect(s.gold).toBe(100 - TD2_ECON.repairGold);
    expect(JSON.stringify(layout)).toBe(snapshot);
  });

  it('清掉木桶给局内金币', () => {
    const s = createTd(setup(base(), lvl({ first: 100000, waves: [{ groups: [] }], obstacles: [{ kind: 'barrel', x: 10, y: 16, size: 1, hp: 50, gold: 12 }] })));
    const id = s.blocks[0]!.id;
    run(s, (st) => st.blocks[0]!.destroyed, 600, (st) => (st.tick === 0 ? [{ t: 0, type: 'clear', id }] : []));
    expect(s.blocks[0]!.destroyed).toBe(true);
    expect(s.gold).toBe(12);
    expect(tdResult(s).goldEarned).toBe(12);
  });
});

describe('守岛：英雄技能', () => {
  it('拒马：英雄够得着的空地才放得下；地面敌人过不去只能砸；冷却 cd', () => {
    const waves = [{ groups: [{ enemy: 'sailor' as const, n: 3, lane: 0, every: 10 }] }, { groups: [{ enemy: 'sailor' as const, n: 3, lane: 0, every: 10 }] }];
    const s = createTd(setup(base(), lvl({ waves, first: 0, waveTicks: 4000 })));
    // 当作玩家指挥过：守点就是手摆的位置（没指挥时英雄自己挑路口，会把守点改掉）
    (s.internal as { heroCmd: boolean }).heroCmd = true;
    // 路绕开主寨走 x = 8 这一列；英雄站在路边（10, 6），不还手，只看拒马挡不挡
    const idle = (st: TdState): TdAction[] => {
      st.hero.cd = st.tick + 100;
      return [];
    };
    s.hero.x = 1050;
    s.hero.y = 650;
    s.hero.post = { x: 1050, y: 650 }; // 摆在这里 = 守点在这里
    s.hero.hp = 1_000_000;
    run(s, (st) => (st.enemies[0]?.y ?? -1000) >= 250, 400, idle);
    expect(s.enemies[0]!.x).toBeLessThan(900);
    const t0 = s.tick;
    const hp = tdBarricadeHp(s);
    expect(stepTd(s, [{ t: t0, type: 'barricade', x: 1050, y: 1350 }]).some((e) => e.type === 'barricade')).toBe(false); // 宝藏箱占着
    expect(stepTd(s, [{ t: t0 + 1, type: 'barricade', x: 1050, y: 1250 }]).some((e) => e.type === 'barricade')).toBe(false); // 超出 range
    const ev = stepTd(s, [{ t: t0 + 2, type: 'barricade', x: 850, y: 650 }]);
    const bar = s.barricades[0]!;
    expect(ev).toContainEqual({ type: 'barricade', id: bar.id, x: 8, y: 6, until: t0 + 2 + TD2_HERO_SKILL.barricade.ticks });
    expect(bar).toMatchObject({ hp, maxHp: hp });
    expect(s.hero.barricadeReady).toBe(t0 + 2 + TD2_HERO_SKILL.barricade.cd);
    expect(stepTd(s, [{ t: t0 + 3, type: 'barricade', x: 850, y: 350 }]).some((e) => e.type === 'barricade')).toBe(false); // 冷却中
    let low = hp;
    const all = run(s, (st) => {
      if (st.barricades[0]) low = Math.min(low, st.barricades[0].hp);
      for (const e of st.enemies) if (st.barricades.length > 0) expect(e.y).toBeLessThan(500);
      return st.barricades.length === 0;
    }, 400, idle);
    expect(all.some((e) => e.type === 'grab')).toBe(false);
    expect(all.some((e) => e.type === 'barricadeBreak')).toBe(true);
    expect(low).toBeLessThan(hp);
    // 拒马没了，接着走去抢
    expect(run(s, (st) => st.vault < TD_TREASURE, 600, idle).some((e) => e.type === 'grab')).toBe(true);
  });

  it('拒马到时间就撤（barricadeBreak），血按这一关每波平均敌人总血 × hpPct%', () => {
    const waves = [{ groups: [{ enemy: 'sailor' as const, n: 4, lane: 0, every: 10 }] }, { groups: [{ enemy: 'ironclad' as const, n: 2, lane: 0, every: 10 }] }];
    const s = createTd(setup(base(), lvl({ waves, first: 100000 })));
    const avgWave = Math.floor((4 * TD2_ENEMIES.sailor.hp + 2 * TD2_ENEMIES.ironclad.hp) / 2);
    expect(tdBarricadeHp(s)).toBe(Math.floor((avgWave * TD2_HERO_SKILL.barricade.hpPct) / 100));
    stepTd(s, [{ t: 0, type: 'barricade', x: s.hero.x + 100, y: s.hero.y }]);
    expect(s.barricades).toHaveLength(1);
    const ev = run(s, (st) => st.barricades.length === 0, TD2_HERO_SKILL.barricade.ticks + 5);
    expect(ev.filter((e) => e.type === 'barricadeBreak')).toHaveLength(1);
    expect(s.tick).toBe(TD2_HERO_SKILL.barricade.ticks + 1);
  });

  it('号令改成被动：英雄身边的塔攻速 +pct%；旧命令 rally 不做事', () => {
    const gap = (heroNear: boolean): number => {
      const s = createTd(setup(base([{ id: 50, kind: 'gunTower', level: 1, x: 11, y: 3 }]), lvl({ hpPct: 1000, waves: [{ groups: [{ enemy: 'ironclad', n: 1, lane: 0, every: 1 }] }] })));
      if (heroNear) {
        s.hero.x = 1250;
        s.hero.y = 550;
        s.hero.post = { x: 1250, y: 550 }; // 摆在这里 = 守点在这里
        s.hero.hp = 1_000_000;
      } else benchHero(s);
      const at: number[] = [];
      run(s, (st, e) => {
        for (const q of e) if (q.type === 'shoot') at.push(st.tick);
        return at.length >= 3;
      }, 900, (st) => {
        st.hero.cd = st.tick + 100; // 英雄自己不开枪
        return [{ t: st.tick, type: 'rally' }];
      });
      return at[2]! - at[1]!;
    };
    const plain = BUILDINGS.gunTower.levels[0]!.reload!;
    expect(gap(false)).toBe(plain);
    expect(gap(true)).toBe(Math.floor((plain * 100) / (100 + TD2_HERO_SKILL.rally.pct)));
  });
});

describe('守岛：预告和路线', () => {
  it('预告下两波：每路的敌人和数量、护甲占比；落潮路涨潮时换算成 0 号路', () => {
    const level = TD2_LEVEL_BY_ID.get('td2-sample')!;
    const s = createTd(sample(1));
    const pv = tdPreview(s, 2);
    expect(pv.map((p) => p.wave)).toEqual([0, 1]);
    expect(pv[0]!.lanes).toEqual([{ lane: 0, fly: false, enemies: [{ kind: 'sailor', armor: 'cloth', n: 8, fog: false }] }]);
    expect(pv[0]!.armorShare.cloth).toBe(100);
    expect(pv[0]!.at).toBe(level.first);
    // 落潮路（下标 = lanes.length）在开潮前改走 0 号路；全是飞的路标 fly
    const tide = lvl({
      lanes: [{ x: 10, y: -2 }],
      tide: { wave: 1, lane: { x: -2, y: 11 } },
      waves: [
        { groups: [{ enemy: 'ironclad', n: 2, lane: 1, every: 10 }, { enemy: 'parrot', n: 3, lane: 0, every: 10 }] },
        { groups: [{ enemy: 'ironclad', n: 2, lane: 1, every: 10 }] },
      ],
    });
    const q = tdPreview(createTd(setup(base(), tide)), 2);
    expect(q[0]!.lanes).toEqual([{ lane: 0, fly: false, enemies: [{ kind: 'ironclad', armor: 'heavy', n: 2, fog: false }, { kind: 'parrot', armor: 'air', n: 3, fog: false }] }]);
    expect(q[0]!.tide).toBe(false);
    expect(q[1]!.lanes.map((l) => l.lane)).toEqual([1]);
    const fly = tdPreview(createTd(setup(base(), lvl({ lanes: [{ x: 10, y: -2 }, { x: -2, y: 11 }], waves: [{ groups: [{ enemy: 'parrot', n: 3, lane: 1, every: 10 }] }] }))), 1);
    expect(fly[0]!.lanes[0]).toMatchObject({ lane: 1, fly: true });
  });

  it('机器人只读预告：两关前几波一样、后面不一样，预告看不到的时候两边下的操作逐拍相同', () => {
    const a = sample(2);
    const lv = a.level;
    // 第 5 波起倒过来排：每波平均（英雄技能的相对值）不变，只是后面的波次不同
    const b: TdSetup = { ...a, level: { ...lv, waves: [...lv.waves.slice(0, 5), ...lv.waves.slice(5).reverse()] } };
    expect(b.level.waves[5]).not.toEqual(lv.waves[5]);
    const ra = runTdBot(a, 'normal');
    const rb = runTdBot(b, 'normal');
    // 第 3 波（0 起）开打前，预告最多看到第 4 波：之前的操作完全一样
    const end = firstTickOfWave(a, ra, 3);
    expect(end).toBeGreaterThan(0);
    const cut = (r: typeof ra): TdAction[] => r.actions.filter((x) => x.t < end);
    expect(cut(rb)).toEqual(cut(ra));
    expect(cut(ra).length).toBeGreaterThan(10);
  }, 60_000);

  it('路线：每条登陆路（含落潮路）一条，落潮路按下一波开不开标 open', () => {
    const s = createTd(sample(1));
    const r = tdRoutes(s);
    const lv = s.level;
    expect(r.map((q) => q.lane)).toEqual([...lv.lanes.map((_, i) => i), lv.lanes.length]);
    expect(r.at(-1)).toMatchObject({ tide: true, open: false });
    for (const q of r) expect(q.cells.length).toBeGreaterThan(0);
  });
});

/** 一局里第 w 波开打的拍（重放机器人的操作找出来） */
function firstTickOfWave(st: TdSetup, r: { actions: TdAction[] }, w: number): number {
  const s = createTd(st);
  const acts = [...r.actions];
  let k = 0;
  while (!s.over && s.wave <= w) {
    const now: TdAction[] = [];
    while (k < acts.length && acts[k]!.t <= s.tick) now.push(acts[k++]!);
    stepTd(s, now);
  }
  return s.tick - 1;
}
