import { describe, expect, it } from 'vitest';
import {
  BUILDINGS, RULES_SINCE, RULES_VERSION, TD2_ENEMIES, TD2_EVENT, TD2_NAV, TD2_NAV_SKILL, createTd, flagOn, heroKindOf, navEnabled, runTd, startTd2, stepTd,
  runTdBot, tdCallBonus, tdCampaign, tdFingerprint, tdGrowthProfile, tdGrowthSetup, tdHeroStats, tdHomeSetup,
} from '../src/core/index.ts';
import type { Placed, TdAction, TdEvent, TdLevel, TdMode, TdSetup, TdState } from '../src/core/index.ts';
import { killGold } from '../src/core/tdevent.ts';
import { tdLiveSetup } from '../src/core/tdlive.ts';
import { pvpSnapshot } from '../src/core/tdbase.ts';
import { fresh, reviveSave } from '../src/platform/sync.ts';

/** 航海士（规则版本 23，tdnav.ts）：哪些局有、急射旗、重赏、精打细算、冷却刷新、和船长的技能互不串 */

const V = RULES_SINCE.tdNav;
const TOWER = 50;
/** 火枪塔（11,3，2×2）的中心：急射旗插在这里，圈住它 */
const FX = 1200;
const FY = 400;
function lvl(p: Partial<TdLevel> = {}): TdLevel {
  return {
    id: 't', name: 't', hq: 1, hpPct: 1000, gold: 0, first: 0, waveTicks: 4000, lanes: [{ x: 10, y: -2 }],
    waves: [{ groups: [{ enemy: 'ironclad', n: 1, lane: 0, every: 1 }] }], kegs: [], obstacles: [], slots: [], ...p,
  };
}
const layout: Placed[] = [{ id: 1, kind: 'hq', level: 1, x: 9, y: 9 }, { id: 2, kind: 'treasure', level: 1, x: 10, y: 13 }, { id: TOWER, kind: 'gunTower', level: 1, x: 11, y: 3 }];
function setup(o: { rules?: number; mode?: TdMode; nav?: boolean; level?: TdLevel } = {}): TdSetup {
  return { layout, level: o.level ?? lvl(), hero: 1, seed: 1, rules: o.rules ?? RULES_VERSION, mode: o.mode ?? 'campaign', ...(o.nav === false ? {} : { heroKind: 'nav' as const }) };
}
/** 英雄摆到塔边（格 12,5），血加满不会倒，自己不开枪 */
function park(s: TdState): void {
  s.hero.x = 1250;
  s.hero.y = 550;
  s.hero.post = { x: 1250, y: 550 };
  s.hero.goal = null;
  s.hero.hp = 1_000_000;
}
function run(s: TdState, until: (s: TdState, ev: TdEvent[]) => boolean, maxTicks: number, acts: (s: TdState) => TdAction[] = () => []): TdEvent[] {
  const all: TdEvent[] = [];
  for (let i = 0; i < maxTicks && !s.over; i++) {
    const ev = stepTd(s, acts(s));
    all.push(...ev);
    if (until(s, ev)) break;
  }
  return all;
}

describe('航海士：哪些局有', () => {
  it('规则 23、战役或海盗来袭、setup 写了 heroKind 才是航海士；旧版本、悬赏守岛、大潮、护航、没写都是船长', () => {
    expect(createTd(setup()).hero.kind).toBe('nav');
    expect(createTd(setup({ mode: 'home' })).hero.kind).toBe('nav');
    for (const st of [setup({ rules: V - 1 }), setup({ mode: 'live' }), setup({ mode: 'tide' }), setup({ mode: 'escort' }), setup({ nav: false })]) {
      expect(navEnabled(st)).toBe(false);
      expect(createTd(st).hero.kind).toBeUndefined();
    }
  });

  it('航海士的身板按 TD2_NAV，每级同样加；没有锚钩', () => {
    const s = createTd({ ...setup(), hero: 8 });
    expect(s.hero.maxHp).toBe(tdHeroStats(8, 'nav').hp);
    expect(tdHeroStats(1, 'nav')).toEqual({ hp: TD2_NAV.hp, dmg: TD2_NAV.dmg, reload: TD2_NAV.reload, range: TD2_NAV.range, speed: TD2_NAV.speed });
    expect(s.hero.hookReady).toBeUndefined();
  });

  it('存档选了航海士、第一章通关才写进开局；没通关、没选都不写；悬赏守岛永远不写；海盗来袭按旧版本开不写', () => {
    const lv = tdCampaign()[0]!;
    const p = tdGrowthProfile(lv, 'suggest', 'nav');
    expect(heroKindOf(p)).toEqual({ heroKind: 'nav' });
    const r = startTd2(p, lv.id, 1, []);
    expect(r.ok && r.value.heroKind).toBe('nav');
    const fresh = { ...p, td: { stars: {}, day: 0, gotGold: 0, gotWood: 0 } };
    expect(heroKindOf(fresh)).toEqual({});
    expect(heroKindOf({ ...p, heroPick: undefined })).toEqual({});
    expect(tdLiveSetup('small', 1).heroKind).toBeUndefined();
    const home = tdHomeSetup(tdGrowthProfile({ hq: 6 }, 'suggest', 'nav'), 1, false, V - 1);
    expect(home.ok && home.value.heroKind).toBeUndefined();
    const home23 = tdHomeSetup(tdGrowthProfile({ hq: 6 }, 'suggest', 'nav'), 1);
    expect(home23.ok && home23.value.heroKind).toBe('nav');
  });

  it('船长的技能航海士按了不起作用，航海士的技能船长按了也不起作用：整局指纹和不按一样', () => {
    const capPress: TdAction[] = [10, 30, 60].flatMap((t) => [{ t, type: 'keg', x: 1150, y: 450 }, { t, type: 'barricade', x: 1050, y: 350 }, { t, type: 'hook', id: 1 }] as TdAction[]);
    const navPress: TdAction[] = [10, 30, 60].flatMap((t) => [{ t, type: 'flag', x: FX, y: FY }, { t, type: 'reward', x: 1150, y: 450 }] as TdAction[]);
    const nav = setup();
    const cap = setup({ nav: false });
    expect(tdFingerprint(runTd(nav, capPress).state)).toBe(tdFingerprint(runTd(nav, []).state));
    expect(tdFingerprint(runTd(cap, navPress).state)).toBe(tdFingerprint(runTd(cap, []).state));
  });
});

describe('航海士：急射旗', () => {
  /** 塔连开三枪，第二、三枪之间隔几拍；flagAt 拍插旗 */
  const gap = (flag: boolean, o: Parameters<typeof setup>[0] = {}): { gap: number; s: TdState } => {
    const s = createTd(setup(o));
    park(s);
    const at: number[] = [];
    run(s, (st, e) => {
      for (const q of e) if (q.type === 'shoot' && q.id === TOWER) at.push(st.tick);
      return at.length >= 3;
    }, 1200, (st) => {
      st.hero.cd = st.tick + 100;
      return flag && at.length === 1 ? [{ t: st.tick, type: 'flag', x: FX, y: FY }] : [];
    });
    return { gap: at[2]! - at[1]!, s };
  };

  it('圈里的塔装填减半；船长的号令航海士没有', () => {
    const plain = BUILDINGS.gunTower.levels[0]!.reload!;
    expect(gap(false).gap).toBe(plain);
    expect(gap(true).gap).toBe(Math.floor((plain * 100) / (100 + TD2_NAV_SKILL.flag.pct)));
  });

  it('圈外的塔不加快', () => {
    const s = createTd(setup());
    park(s);
    stepTd(s, [{ t: 0, type: 'flag', x: FX + TD2_NAV_SKILL.flag.r + 60, y: FY }]);
    expect(s.hero.flag).toBeDefined();
    expect(s.towers.filter((t) => t.id === TOWER).map((t) => flagOn(s, t))).toEqual([false]);
    stepTd(s, []);
    const s2 = createTd(setup());
    park(s2);
    stepTd(s2, [{ t: 0, type: 'flag', x: FX, y: FY }]);
    expect(s2.towers.filter((t) => t.id === TOWER).map((t) => flagOn(s2, t))).toEqual([true]);
  });

  it('冷却没好、落点太远、英雄倒着都插不上；插上后到时间失效', () => {
    const s = createTd(setup());
    park(s);
    stepTd(s, [{ t: 0, type: 'flag', x: FX, y: FY }]);
    expect(s.hero.flag).toEqual({ x: FX, y: FY, until: TD2_NAV_SKILL.flag.ticks });
    expect(s.hero.barricadeReady).toBe(TD2_NAV_SKILL.flag.cd);
    const before = { ...s.hero.flag! };
    stepTd(s, [{ t: s.tick, type: 'flag', x: FX, y: FY }]); // 冷却中
    expect(s.hero.flag).toEqual(before);
    const far = createTd(setup());
    park(far);
    far.hero.x = 150;
    far.hero.y = 1950;
    stepTd(far, [{ t: 0, type: 'flag', x: FX, y: FY }]);
    expect(far.hero.flag).toBeUndefined();
    const down = createTd(setup());
    park(down);
    down.hero.respawn = 1000;
    stepTd(down, [{ t: 0, type: 'flag', x: FX, y: FY }]);
    expect(down.hero.flag).toBeUndefined();
  });
});

describe('航海士：重赏', () => {
  it('圈里倒下的击杀金翻倍、圈外和过了时间不翻；和战书相乘', () => {
    const s = createTd(setup());
    park(s);
    while (s.enemies.length === 0) stepTd(s, []);
    const e = s.enemies[0]!;
    const g = TD2_ENEMIES[e.kind].gold;
    e.x = 1150;
    e.y = 450;
    stepTd(s, [{ t: s.tick, type: 'reward', x: 1150, y: 450 }]);
    expect(s.hero.reward).toBeDefined();
    expect(killGold(s, e, g)).toBe(g * TD2_NAV_SKILL.reward.mul);
    e.x = 1150 + TD2_NAV_SKILL.reward.r + 10;
    expect(killGold(s, e, g)).toBe(g);
    e.x = 1150;
    s.happen = { at: [], dare: [e.wave] };
    expect(killGold(s, e, g)).toBe(g * TD2_NAV_SKILL.reward.mul * TD2_EVENT.dare.goldMul);
    s.happen = undefined;
    s.tick = s.hero.reward!.until;
    expect(killGold(s, e, g)).toBe(g);
  });

  it('倒在圈里的敌人实际多给的金和 killGold 一致（整局里）', () => {
    const s = createTd(setup({ level: lvl({ hpPct: 100, waves: [{ groups: [{ enemy: 'sailor', n: 1, lane: 0, every: 1 }] }] }) }));
    park(s);
    while (s.enemies.length === 0) stepTd(s, []);
    const e = s.enemies[0]!;
    e.x = 1150;
    e.y = 450;
    e.hp = 1;
    stepTd(s, [{ t: s.tick, type: 'reward', x: 1150, y: 450 }]);
    const g0 = s.goldEarned;
    run(s, (st) => st.enemies.every((q) => q.id !== e.id), 400);
    expect(s.goldEarned - g0).toBe(TD2_ENEMIES.sailor.gold * TD2_NAV_SKILL.reward.mul);
  });
});

describe('航海士：精打细算和冷却', () => {
  it('提前叫波的金币是船长的 call.pct%（抵冷却一样）', () => {
    const lv = lvl({ first: 400, waves: [{ groups: [{ enemy: 'sailor', n: 4, lane: 0, every: 1 }] }, { groups: [{ enemy: 'sailor', n: 4, lane: 0, every: 1 }] }] });
    const nav = createTd(setup({ level: lv }));
    const cap = createTd(setup({ level: lv, nav: false }));
    const a = tdCallBonus(nav);
    const b = tdCallBonus(cap);
    expect(b.gold).toBeGreaterThan(0);
    expect(a.gold).toBe(Math.floor((b.gold * TD2_NAV_SKILL.call.pct) / 100));
    expect(a.cdCut).toBe(b.cdCut);
  });

  it('提前叫波抵掉两个技能的冷却', () => {
    const lv = lvl({ first: 400, waves: [{ groups: [{ enemy: 'sailor', n: 1, lane: 0, every: 1 }] }, { groups: [{ enemy: 'sailor', n: 1, lane: 0, every: 1 }] }] });
    const s = createTd(setup({ level: lv }));
    park(s);
    stepTd(s, [{ t: 0, type: 'flag', x: FX, y: FY }, { t: 0, type: 'reward', x: 1150, y: 450 }]);
    const r1 = s.hero.barricadeReady!;
    const r2 = s.hero.kegReady;
    const cut = tdCallBonus(s).cdCut;
    expect(cut).toBeGreaterThan(0);
    stepTd(s, [{ t: s.tick, type: 'call' }]);
    expect(s.hero.barricadeReady).toBe(Math.max(s.tick - 1, r1 - cut));
    expect(s.hero.kegReady).toBe(Math.max(s.tick - 1, r2 - cut));
  });
});

describe('航海士：机器人', () => {
  it('普通机器人在战役里两个技能都会放，小白不放；同种子重放逐位一样', () => {
    const r = tdGrowthSetup('td03', 'suggest', 1, 'nav');
    if (!r.ok) throw new Error(r.error);
    const a = runTdBot(r.value, 'normal');
    expect(a.state.hero.kind).toBe('nav');
    expect(a.actions.some((x) => x.type === 'flag')).toBe(true);
    expect(a.actions.some((x) => x.type === 'reward')).toBe(true);
    expect(runTdBot(r.value, 'novice').actions.some((x) => x.type === 'flag' || x.type === 'reward')).toBe(false);
    expect(tdFingerprint(runTd(r.value, a.actions).state)).toBe(tdFingerprint(a.state));
  });
});

describe('航海士：存档', () => {
  it('读存档：选了航海士、第一章通关才留；没通关、别的值都按船长（不写字段）；旧存档照常读', () => {
    const s = JSON.parse(JSON.stringify(fresh())) as ReturnType<typeof fresh>;
    expect(reviveSave(s)!.profile.heroPick).toBeUndefined();
    const stars = Object.fromEntries(tdCampaign().filter((l) => l.chapter === 1).map((l) => [l.id, 1]));
    (s.profile as unknown as Record<string, unknown>).heroPick = 'nav';
    expect(reviveSave(s)!.profile.heroPick).toBeUndefined();
    s.profile.td = { stars, day: 0, gotGold: 0, gotWood: 0 };
    expect(reviveSave(s)!.profile.heroPick).toBe('nav');
    (s.profile as unknown as Record<string, unknown>).heroPick = 'captain';
    expect(reviveSave(s)!.profile.heroPick).toBeUndefined();
  });

  it('攻防快照不带 heroPick（驻岛英雄照旧是船长）', () => {
    const p = tdGrowthProfile(tdCampaign()[0]!, 'suggest', 'nav');
    expect(p.heroPick).toBe('nav');
    expect('heroPick' in pvpSnapshot(p)).toBe(false);
  });
});
