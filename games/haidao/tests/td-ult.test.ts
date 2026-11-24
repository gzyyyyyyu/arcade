import { describe, expect, it } from 'vitest';
import { RULES_VERSION, createTd, runTd, stepTd, tdFingerprint, tdGrowthProfile } from '../src/core/index.ts';
import type { Placed, TdAction, TdEnemy, TdEnemyKind, TdLevel, TdMode, TdSetup, TdState } from '../src/core/index.ts';
import { stunned } from '../src/core/combat.ts';
import { inner } from '../src/core/tdstate.ts';
import { tdLoseAt, tdSellRefund, tdUltCost, tdUltOptions } from '../src/core/tdquery.ts';
import { TD_VET_LOSE_AT } from '../src/core/tddeep.ts';
import { TD2_LOSE_AT } from '../src/core/td2types.ts';
import type { TdTowerKind } from '../src/core/td2types.ts';
import { setTdTalent, settleTd, startTd2, tdPlayOpen, tdTalentPicks, tdTalentPoints, tdUltUnlocked } from '../src/core/tdrun.ts';
import { tdHomeSetup } from '../src/core/tdhome.ts';
import { TD_CHALLENGES, vetLevel } from '../src/content/tdchallenge.ts';
import { TD2_LEVEL_BY_ID } from '../src/content/tdmaps.ts';
import { talentError, talentFold, talentPoints } from '../src/content/tdtalent.ts';
import { mergeSave, reviveSave } from '../src/platform/sync.ts';
import type { Profile } from '../src/core/types.ts';

/** 终极塔、先打、老兵、挑战、海图天赋（设计稿 td.md 批 1、批 2） */

const BRANCH: Record<string, string[]> = { cannon: ['cannon.pierce', 'cannon.heavy'], mortar: ['mortar.heavy', 'mortar.wide'], gunTower: ['gunTower.marksman', 'gunTower.keen'] };
const layout: Placed[] = [{ id: 1, kind: 'hq', level: 1, x: 9, y: 16 }, { id: 2, kind: 'treasure', level: 1, x: 10, y: 13 }];

function lvl(enemies: TdEnemyKind[], every = 1): TdLevel {
  return {
    id: 't', name: 't', hq: 1, hpPct: 100, gold: 5000, first: 1, waveTicks: 4000, lanes: [{ x: 10, y: -2 }],
    waves: [{ groups: enemies.map((enemy, i) => ({ enemy, n: 1, lane: 0, every, delay: i * every })) }], kegs: [], obstacles: [], slots: [],
    garrison: [{ x: 11, y: 4 }],
  } as TdLevel;
}
function setup(kind: TdTowerKind, enemies: TdEnemyKind[], o: { mode?: TdMode; every?: number } = {}): TdSetup {
  return {
    layout, level: lvl(enemies, o.every), hero: 1, seed: 7, rules: RULES_VERSION, mode: o.mode ?? 'campaign', ult: true,
    garrison: [{ spot: 0, kind, tier: 3, branch: BRANCH[kind] ?? [] }],
  };
}
/** 开局换好终极（slot 0 是驻守台），英雄挪到远处不帮忙 */
function staged(kind: TdTowerKind, ult: string | null, enemies: TdEnemyKind[], o: { mode?: TdMode; every?: number } = {}): TdState {
  const s = createTd(setup(kind, enemies, o));
  stepTd(s, ult ? [{ t: 0, type: 'ult', slot: 0, ult }] : []);
  s.hero.x = 300;
  s.hero.y = 2000;
  s.hero.goal = { x: 300, y: 2000 };
  return s;
}
/** 跑到第一个敌人第一次掉血：回那一拍掉的血和敌人 */
function firstHit(s: TdState, kind: TdEnemyKind): { dmg: number; e: TdEnemy; before: { x: number; y: number } } {
  const tough = new Set<number>();
  for (let i = 0; i < 2000; i++) {
    const e = s.enemies.find((q) => q.kind === kind);
    // 血加厚，一炮打不死才看得到推、晕
    if (e && !tough.has(e.id)) {
      tough.add(e.id);
      e.hp = 1_000_000;
    }
    const hp = e?.hp;
    const before = e ? { x: e.x, y: e.y } : { x: 0, y: 0 };
    stepTd(s, []);
    const e2 = s.enemies.find((q) => q.kind === kind);
    if (e && e2 && hp !== undefined && e2.hp < hp) return { dmg: hp - e2.hp, e: e2, before };
  }
  throw new Error('没打中');
}

describe('终极：换法和价', () => {
  it('3 阶两档分叉选完才能换；钱按造价 × 200% 扣，卖塔按已花的退', () => {
    const s = staged('cannon', null, ['sailor']);
    expect(tdUltOptions(s, 0).map((u) => u.id)).toEqual(['ult.siege', 'ult.blunder']);
    const gold = s.gold;
    const spent = s.slots[0]!.spent ?? 0;
    stepTd(s, [{ t: s.tick, type: 'ult', slot: 0, ult: 'ult.siege' }]);
    expect(s.towers[0]!.ult).toBe('ult.siege');
    expect(gold - s.gold).toBe(tdUltCost(s, 'ult.siege'));
    expect(tdUltOptions(s, 0)).toEqual([]);
    expect(tdSellRefund(s, 0)).toBe(Math.floor(((spent + tdUltCost(s, 'ult.siege')) * 70) / 100));
  });

  it('没开终极（没解锁）、分叉没选完、换别的塔的终极都不生效', () => {
    const a = createTd({ ...setup('cannon', ['sailor']), ult: undefined });
    stepTd(a, [{ t: 0, type: 'ult', slot: 0, ult: 'ult.siege' }]);
    expect(a.towers[0]!.ult).toBeUndefined();
    const b = createTd({ ...setup('cannon', ['sailor']), garrison: [{ spot: 0, kind: 'cannon', tier: 3, branch: ['cannon.pierce'] }] });
    stepTd(b, [{ t: 0, type: 'ult', slot: 0, ult: 'ult.siege' }]);
    expect(b.towers[0]!.ult).toBeUndefined();
    const c = staged('cannon', 'ult.rain', ['sailor']);
    expect(c.towers[0]!.ult).toBeUndefined();
  });

  it('悬赏守岛、大潮、护航：发终极、先打都不改状态（指纹和不发一样）', () => {
    for (const mode of ['live', 'tide', 'escort'] as const) {
      const st = setup('cannon', ['sailor', 'sailor'], { mode });
      const acts: TdAction[] = [{ t: 0, type: 'ult', slot: 0, ult: 'ult.siege' }, { t: 1, type: 'prio', slot: 0, prio: 'strong' }];
      expect(tdFingerprint(runTd(st, acts).state)).toBe(tdFingerprint(runTd(st, []).state));
    }
  });
});

describe('终极：打法', () => {
  it('攻城巨炮打首领多五成（同是铁甲的铁甲兵对照）；霰弹炮台不加', () => {
    const ratio = (ult: string): number => firstHit(staged('cannon', ult, ['captain']), 'captain').dmg * 1000 / firstHit(staged('cannon', ult, ['ironclad']), 'ironclad').dmg;
    expect(ratio('ult.siege')).toBeGreaterThanOrEqual(1480);
    expect(ratio('ult.siege')).toBeLessThanOrEqual(1520);
    expect(ratio('ult.blunder')).toBeGreaterThanOrEqual(980);
    expect(ratio('ult.blunder')).toBeLessThanOrEqual(1020);
  });

  it('霰弹炮台把地面的往回推，不推飞的、不推首领', () => {
    const back = (k: TdEnemyKind): number => {
      const h = firstHit(staged('cannon', 'ult.blunder', [k]), k);
      return h.before.y - h.e.y;
    };
    expect(back('sailor')).toBeGreaterThan(0);
    expect(back('parrot')).toBeLessThanOrEqual(0);
    expect(back('captain')).toBeLessThanOrEqual(0);
  });

  it('火雨一炮落三发，落点固定（同种子两次一样、互不相同）', () => {
    const pts = (): string[] => {
      const s = staged('mortar', 'ult.rain', ['sailor']);
      for (let i = 0; i < 2000; i++) {
        const n0 = s.towers[0]!.cd;
        stepTd(s, []);
        if (s.towers[0]!.cd !== n0) break;
      }
      return inner(s).pend.filter((p) => p.kind === 'splash').map((p) => `${p.x},${p.y}`);
    };
    const a = pts();
    expect(a.length).toBe(3);
    expect(new Set(a).size).toBe(3);
    expect(pts()).toEqual(a);
  });

  it('震地弹打中的晕一下；刚晕过的有免控', () => {
    const s = staged('mortar', 'ult.quake', ['sailor']);
    const h = firstHit(s, 'sailor');
    expect(stunned(h.e, s.tick)).toBe(true);
    expect(h.e.immuneUntil ?? 0).toBeGreaterThan(h.e.stunUntil ?? 0);
  });

  it('同种子同操作逐位一样', () => {
    const st = setup('gunTower', ['sailor', 'parrot', 'sailor']);
    const acts: TdAction[] = [{ t: 0, type: 'ult', slot: 0, ult: 'ult.eagle' }, { t: 2, type: 'prio', slot: 0, prio: 'elite' }];
    expect(tdFingerprint(runTd(st, acts).state)).toBe(tdFingerprint(runTd(st, acts).state));
  });
});

describe('先打', () => {
  /** 两个敌人摆好：a 离宝藏近、血少、离塔远；b 离宝藏远、血多、离塔近 */
  function aimWith(prio: 'first' | 'strong' | 'near' | 'elite', kinds: [TdEnemyKind, TdEnemyKind] = ['sailor', 'sailor']): number[] {
    const s = staged('gunTower', null, kinds, { every: 2 });
    if (prio !== 'first') stepTd(s, [{ t: s.tick, type: 'prio', slot: 0, prio }]);
    while (s.enemies.length < 2) stepTd(s, []);
    const [a, b] = s.enemies as [TdEnemy, TdEnemy];
    a.x = 1050; a.y = 750; a.hp = 5;
    b.x = 1150; b.y = 350;
    const t = s.towers[0]!;
    t.lock = -1;
    stepTd(s, []);
    return [t.aim, a.id, b.id];
  }
  it('最前打离宝藏近的、最强打血多的、最近打离塔近的', () => {
    const [f, a] = aimWith('first');
    expect(f).toBe(a);
    const [st, , b] = aimWith('strong');
    expect(st).toBe(b);
    const [n, , b2] = aimWith('near');
    expect(n).toBe(b2);
  });
  it('精英：精英先打（即使走在后面）', () => {
    const [e, , b] = aimWith('elite', ['sailor', 'bosun']);
    expect(e).toBe(b);
  });
  it('改回最前就清掉', () => {
    const s = staged('gunTower', null, ['sailor']);
    stepTd(s, [{ t: s.tick, type: 'prio', slot: 0, prio: 'near' }]);
    expect(s.towers[0]!.prio).toBe('near');
    stepTd(s, [{ t: s.tick, type: 'prio', slot: 0, prio: 'first' }]);
    expect(s.towers[0]!.prio).toBeUndefined();
  });
});

// ---------------------------------------------------------------- 开局：解锁、老兵、挑战、天赋

function prof(stars: number, extra: Partial<NonNullable<Profile['td']>> = {}): Profile {
  const p = tdGrowthProfile(TD2_LEVEL_BY_ID.get('td30')!, 'max');
  const s = Object.fromEntries(Object.keys(p.td!.stars).map((k) => [k, stars]));
  return { ...p, td: { ...p.td!, stars: s, ...extra } };
}

describe('开局', () => {
  it('td06 ≥1★ 才写 ult；海盗来袭同一个条件', () => {
    const p0 = prof(0);
    p0.td!.stars = { td01: 1, td02: 1, td03: 1, td04: 1, td05: 1 };
    expect(tdUltUnlocked(p0)).toBe(false);
    expect(startTd2(p0, 'td05', 1, []).ok && (startTd2(p0, 'td05', 1, []) as { value: TdSetup }).value.ult).toBeFalsy();
    const p1 = prof(1);
    const r = startTd2(p1, 'td05', 1, []);
    expect(r.ok && r.value.ult).toBe(true);
    const h = tdHomeSetup(p1, 3);
    expect(h.ok && h.value.ult).toBe(true);
  });

  it('老兵：3★ 才能开；预算多三成、丢 6 枚就输', () => {
    expect(tdPlayOpen(prof(2), 'td10', 'vet')).toBe(false);
    expect(startTd2(prof(2), 'td10', 1, [], 'vet').ok).toBe(false);
    const r = startTd2(prof(3), 'td10', 1, [], 'vet');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.vet).toBe(true);
    expect(r.value.level.waves).toEqual(vetLevel('td10')!.waves);
    expect(tdLoseAt(createTd(r.value))).toBe(TD_VET_LOSE_AT);
    expect(tdLoseAt(createTd({ ...r.value, mode: 'live' }))).toBe(TD2_LOSE_AT);
    const n = (l: TdLevel): number => l.waves.reduce((s, w) => s + w.groups.reduce((m, g) => m + g.n, 0), 0);
    expect(n(r.value.level)).toBeGreaterThan(n(TD2_LEVEL_BY_ID.get('td10')!));
  });

  it('老兵、挑战局结算：≥1★ 记徽，不给金币木材、不改星', () => {
    const p = prof(3);
    const res = { over: true, stars: 2, lost: 2, waves: 10, total: 10, ticks: 1, goldEarned: 0 };
    const r = settleTd(p, 'td10', res, 5, 'vet');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.profile.td!.vet).toEqual({ td10: 1 });
    expect(r.value.profile.res).toEqual(p.res);
    expect(r.value.profile.td!.stars).toEqual(p.td!.stars);
    const c = settleTd(p, 'td03', { ...res, stars: 0 }, 5, 'chal');
    expect(c.ok && c.value.profile.td!.chal).toBeUndefined();
  });

  it('挑战：每条限制都写进 setup；能造的塔、开局金按挑战折', () => {
    const p = prof(1);
    for (const c of TD_CHALLENGES) {
      const r = startTd2(p, c.id, 1, [], 'chal');
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.value.rule).toEqual(c.rule);
      if (c.rule.kinds) expect([...r.value.unlocked!].sort()).toEqual([...c.rule.kinds].sort());
      if (c.rule.goldPct) expect(r.value.level.gold).toBe(Math.floor((TD2_LEVEL_BY_ID.get(c.id)!.gold * c.rule.goldPct) / 100));
    }
    expect(startTd2(p, 'td04', 1, [], 'chal').ok).toBe(false);
  });

  it('挑战限制在局内生效：木台造不了、塔卖不掉、分叉选不了、海盗来袭不吃挑战', () => {
    const r = startTd2(prof(1), 'td05', 1, [], 'chal');
    if (!r.ok) throw new Error(r.error);
    const s = createTd(r.value);
    stepTd(s, [{ t: 0, type: 'build', slot: 0, kind: 'cannon' }]);
    expect(s.slots[0]!.tower).toBe(-1);
    const st = { ...setup('gunTower', ['sailor']), rule: { noSell: true as const, noBranch: ['gunTower.keen'] } };
    const a = createTd({ ...st, garrison: [{ spot: 0, kind: 'gunTower', tier: 3, branch: ['gunTower.marksman'] }] });
    stepTd(a, [{ t: 0, type: 'branch', slot: 0, branch: 'gunTower.keen' }, { t: 0, type: 'sell', slot: 0 }]);
    expect(a.towers[0]!.branch).toEqual(['gunTower.marksman']);
    expect(a.slots[0]!.tower).toBeGreaterThanOrEqual(0);
    expect(createTd({ ...st, mode: 'home' }).deep!.rule).toEqual({});
  });

  it('天赋：点数、先点上一格、点数不够、折法', () => {
    expect(talentPoints(90, 30)).toBe(25);
    expect(talentError(['tower1', 'tower2'], 3)).toBeNull();
    expect(talentError(['tower2'], 3)).toBe('need_prev');
    expect(talentError(['tower1', 'tower2', 'tower3'], 5)).toBe('no_points');
    expect(talentError(['tower4'], 10)).toBe('bad_talent');
    expect(talentError(['tower1', 'tower1'], 10)).toBe('dup_talent');
    const f = talentFold(['tower1', 'tower2', 'tower3', 'tower4:cannon', 'supply1', 'hero1']);
    expect(f).toEqual({ fx: { sellPct: 80, ultPct: 90, respawnPct: 85 }, gold: 15, garrisonUp: true, focus: 'cannon' });
  });

  it('天赋折进 setup：开局金、驻守台阶、偏爱、局内效果；同种子同操作逐位一样', () => {
    const p0 = prof(3);
    // 点数 = 守岛总星 ÷ 6（每关 3★）
    expect(tdTalentPoints(p0)).toBe(Math.floor((Object.keys(p0.td!.stars).length * 3) / 6));
    const set = setTdTalent(p0, ['tower1', 'tower2', 'tower3', 'tower4:cannon', 'supply1']);
    if (!set.ok) throw new Error(set.error);
    const p = set.value;
    expect(tdTalentPicks(p)).toHaveLength(5);
    const lowHq = { ...p, base: { ...p.base, buildings: p.base.buildings.map((b) => (b.kind === 'cannon' ? { ...b, level: 4 } : b)) } };
    const r = startTd2(lowHq, 'td10', 1, [{ spot: 0, kind: 'cannon' }]);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.level.gold).toBe(TD2_LEVEL_BY_ID.get('td10')!.gold + 15);
    expect(r.value.garrison![0]!.tier).toBe(3);
    expect(r.value.bonus?.cannon).toBe(8);
    expect(r.value.bonus?.mortar).toBe(-3);
    expect(r.value.talent).toEqual({ sellPct: 80, ultPct: 90 });
    const acts: TdAction[] = [{ t: 5, type: 'build', slot: 0, kind: 'gunTower' }];
    expect(tdFingerprint(runTd(r.value, acts).state)).toBe(tdFingerprint(runTd(r.value, acts).state));
    // 点数不够的档（别的设备合并来的）开局当没点
    expect(tdTalentPicks({ ...p, td: { ...p.td!, stars: {} } })).toEqual([]);
  });
});

describe('存档', () => {
  it('reviveSave 留认识的徽和天赋；mergeSave 胜出那份并上输家的徽', () => {
    const p = prof(3, { vet: { td01: 1, bogus: 1 } as Record<string, 1>, chal: { td03: 1 }, talent: ['tower1', 'nope'] });
    const s = reviveSave({ profile: p, lastSeen: 10 })!;
    expect(s.profile.td!.vet).toEqual({ td01: 1 });
    expect(s.profile.td!.chal).toEqual({ td03: 1 });
    expect(s.profile.td!.talent).toEqual(['tower1']);
    const old = reviveSave({ profile: { ...p, td: { stars: p.td!.stars, day: 0, gotGold: 0, gotWood: 0 } }, lastSeen: 1 })!;
    expect(old.profile.td!.vet).toBeUndefined();
    const other = { ...s, lastSeen: 1, profile: { ...s.profile, td: { ...s.profile.td!, vet: { td02: 1 as const }, chal: undefined } } };
    const m = mergeSave(s, other);
    expect(m.profile.td!.vet).toEqual({ td01: 1, td02: 1 });
    expect(m.profile.td!.chal).toEqual({ td03: 1 });
    expect(m.lastSeen).toBe(10);
  });
});
