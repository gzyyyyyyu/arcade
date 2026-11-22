import { describe, expect, it } from 'vitest';
import {
  RULES_VERSION, TD2_ENEMIES, TIDE_MODS_FROM, createTd, eventAt, raining, runTd, runTdBot, stepTd, tdDareCan, tdFingerprint, tdGrowthSetup, tdPreview,
  tideMod, tideSetup,
} from '../src/core/index.ts';
import type { IsoWeek, Placed, TdLevel, TdSetup, TdState } from '../src/core/index.ts';
import { TD2_EVENT } from '../src/content/td2units.ts';
import { TD2_LEVEL_DEFS } from '../src/content/td2levels.ts';
import { TIDE_MOD_NUM, TIDE_MOD_ORDER } from '../src/content/tdtide.ts';
import { heroCd, killGold } from '../src/core/tdevent.ts';

/** 守岛关内事件和大潮每周海况（tdevent.ts、tdtide.ts）：同种子逐位可重放、各自的效果 */

function lvl(p: Partial<TdLevel> = {}): TdLevel {
  return { id: 't', name: 't', hq: 1, hpPct: 100, gold: 0, first: 1, waveTicks: 200, lanes: [{ x: 10, y: -2 }, { x: -2, y: 11 }], waves: [], kegs: [], obstacles: [], slots: [], ...p };
}
const base: Placed[] = [{ id: 1, kind: 'hq', level: 1, x: 9, y: 9 }, { id: 2, kind: 'treasure', level: 1, x: 10, y: 13 }];
const setup = (level: TdLevel, seed = 1): TdSetup => ({ layout: base, level, hero: 1, seed, rules: RULES_VERSION, mode: 'campaign' });
const campaign = (id: string, seed = 1): TdSetup => {
  const r = tdGrowthSetup(id, 'suggest', seed);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
function benchHero(s: TdState): void {
  s.hero.respawn = 1_000_000;
  s.hero.hp = 0;
}
/** 推到第 w 波（0 起）刚开打 */
function toWave(s: TdState, w: number): void {
  while (s.wave <= w && !s.over) stepTd(s, []);
}

const EVENT_LEVELS = TD2_LEVEL_DEFS.filter((d) => d.events);

describe('关内事件：开关和挑波', () => {
  it('14 关写了事件（赏金船 5 关、暴雨 4 关、战书 5 关），赏金船的关都有两条以上登陆路（要跑到另一条）', () => {
    const by = (k: string): string[] => EVENT_LEVELS.filter((d) => d.events === k).map((d) => d.id);
    expect(by('bounty')).toEqual(['td04', 'td09', 'td14', 'td20', 'td27']);
    expect(by('rain')).toEqual(['td08', 'td10', 'td15', 'td21']);
    expect(by('dare')).toEqual(['td13', 'td16', 'td19', 'td22', 'td26']);
    for (const id of by('bounty')) expect(createTd(campaign(id)).level.lanes.length, id).toBeGreaterThanOrEqual(2);
  });

  it('每关挑一波，落在第 3–7 波、不挑首领波；同种子挑同一波，种子不同会挑到不同的波', () => {
    for (const d of EVENT_LEVELS) {
      const waves = new Set<number>();
      for (let seed = 1; seed <= 12; seed++) {
        const s = createTd(campaign(d.id, seed));
        const at = s.happen?.at ?? [];
        expect(at.length, d.id).toBe(1);
        const a = at[0]!;
        expect(a.kind).toBe(d.events);
        expect(a.wave).toBeGreaterThanOrEqual(2);
        expect(a.wave).toBeLessThanOrEqual(6);
        expect(s.level.waves[a.wave]?.boss ?? false, `${d.id} 第 ${a.wave} 波`).toBe(false);
        expect(createTd(campaign(d.id, seed)).happen?.at).toEqual(at);
        waves.add(a.wave);
      }
      expect(waves.size, d.id).toBeGreaterThan(1);
    }
  });

  it('同一个种子加同一串操作逐位一样（三种事件各一关，三种机器人）', { timeout: 120_000 }, () => {
    for (const id of ['td04', 'td08', 'td13']) {
      for (const bot of ['novice', 'normal', 'greedy'] as const) {
        const a = runTdBot(campaign(id, 3), bot);
        const b = runTd(campaign(id, 3), a.actions);
        expect(tdFingerprint(b.state), `${id} ${bot}`).toBe(tdFingerprint(a.state));
      }
    }
  });

  it('预告提前一波写出事件：倒数里看到的下两波里带 event', () => {
    const s = createTd(setup(lvl({ events: [{ kind: 'rain', from: 1, to: 1 }], waves: [0, 1, 2].map(() => ({ groups: [] })) })));
    expect(tdPreview(s, 2).map((p) => p.event)).toEqual([undefined, 'rain']);
    toWave(s, 0);
    expect(tdPreview(s, 2).map((p) => p.event)).toEqual(['rain', undefined]);
  });
});

describe('暴雨', () => {
  const level = lvl({ events: [{ kind: 'rain', from: 1, to: 1 }], waves: [0, 1, 2].map(() => ({ groups: [{ enemy: 'parrot' as const, n: 1, lane: 0, every: 1 }] })) });

  it('只在那一波开打到下一波开打之间下：火伤害打折、飞的变慢', () => {
    const s = createTd(setup(level));
    benchHero(s);
    expect(eventAt(s, 1)).toBe('rain');
    toWave(s, 0);
    expect(raining(s)).toBe(false);
    toWave(s, 1);
    expect(raining(s)).toBe(true);
    toWave(s, 2);
    expect(raining(s)).toBe(false);
  });

  it('鹦鹉在雨里每拍走的是平时的 airPct%', () => {
    const run = (rain: boolean): number => {
      const s = createTd(setup(rain ? level : { ...level, events: [] }));
      benchHero(s);
      toWave(s, 1);
      for (let i = 0; i < 6; i++) stepTd(s, []);
      const e = s.enemies.find((q) => q.wave === 1)!;
      const x0 = e.x;
      const y0 = e.y;
      stepTd(s, []);
      return Math.abs(e.x - x0) + Math.abs(e.y - y0);
    };
    const dry = run(false);
    const wet = run(true);
    expect(dry).toBeGreaterThan(0);
    expect(wet).toBeLessThan(dry);
    expect(wet).toBeLessThanOrEqual(Math.ceil((dry * TD2_EVENT.rain.airPct) / 100) + 1);
  });
});

describe('赏金船', () => {
  const level = lvl({ events: [{ kind: 'bounty', from: 0, to: 0 }], waves: [{ groups: [] }, { groups: [] }] });

  it('开打 delay 拍后上岸：血量是水手的 hpMul 倍、挂着 bounty、一上岸就往另一条登陆路跑，跑掉不算丢', () => {
    const s = createTd(setup(level));
    benchHero(s);
    toWave(s, 0);
    for (let i = 0; i <= TD2_EVENT.bounty.delay; i++) stepTd(s, []);
    const b = s.enemies.find((e) => e.bounty);
    expect(b).toBeDefined();
    expect(b!.mode).toBe('out');
    expect(b!.maxHp).toBe(TD2_ENEMIES.sailor.hp * TD2_EVENT.bounty.hpMul);
    expect(b!.hx).toBe(-2 * 100 + 50);
    expect(b!.hy).toBe(11 * 100 + 50);
    let gone = false;
    for (let i = 0; i < 4000 && !gone; i++) gone = stepTd(s, []).some((e) => e.type === 'bounty' && e.what === 'gone');
    expect(gone).toBe(true);
    expect(s.lost).toBe(0);
  });

  it('被打倒多给这一波击杀金的 goldPct%（至少 minGold）', () => {
    const s = createTd(setup(level));
    benchHero(s);
    toWave(s, 0);
    for (let i = 0; i <= TD2_EVENT.bounty.delay; i++) stepTd(s, []);
    const b = s.enemies.find((e) => e.bounty)!;
    b.hp = 1;
    const gold0 = s.gold;
    // 用炸药桶口径的爆炸打一下：直接走规则的伤害结算
    s.hero.respawn = -1;
    s.hero.hp = 1000;
    s.hero.x = b.x;
    s.hero.y = b.y;
    s.hero.kegReady = 0;
    const ev = stepTd(s, [{ t: s.tick, type: 'keg', x: b.x, y: b.y }]).concat(...Array.from({ length: 12 }, () => stepTd(s, [])));
    const paid = ev.find((e) => e.type === 'bounty' && e.what === 'paid');
    expect(paid).toBeDefined();
    expect(paid && 'gold' in paid ? paid.gold : 0).toBe(TD2_EVENT.bounty.minGold);
    expect(s.gold - gold0).toBe(TD2_ENEMIES.sailor.gold + TD2_EVENT.bounty.minGold);
  });
});

describe('战书', () => {
  const level = lvl({ events: [{ kind: 'dare', from: 1, to: 1 }], waves: [0, 1, 2].map(() => ({ groups: [{ enemy: 'sailor' as const, n: 8, lane: 0, every: 4 }] })) });

  it('只能在开打前接下一波；接了预告和上岸的人数多 morePct%（向下取整）、这一波击杀金翻倍；再按一次退掉', () => {
    const s = createTd(setup(level));
    benchHero(s);
    expect(tdDareCan(s)).toBeNull();
    toWave(s, 0);
    expect(tdDareCan(s)).toBe('take');
    stepTd(s, [{ t: s.tick, type: 'dare' }]);
    expect(tdDareCan(s)).toBe('drop');
    expect(tdPreview(s, 1)[0]?.lanes[0]?.enemies[0]?.n).toBe(Math.floor((8 * (100 + TD2_EVENT.dare.morePct)) / 100));
    expect(tdPreview(s, 1)[0]?.dare).toBe(true);
    stepTd(s, [{ t: s.tick, type: 'dare' }]);
    expect(tdDareCan(s)).toBe('take');
    stepTd(s, [{ t: s.tick, type: 'dare' }]);
    toWave(s, 1);
    expect(tdDareCan(s)).toBeNull();
    const e1 = { ...s.enemies[0]!, wave: 1 };
    const e0 = { ...s.enemies[0]!, wave: 0 };
    expect(killGold(s, e1, 10)).toBe(10 * TD2_EVENT.dare.goldMul);
    expect(killGold(s, e0, 10)).toBe(10);
    for (let i = 0; i < 60; i++) stepTd(s, []);
    expect(s.enemies.filter((e) => e.wave === 1).length).toBe(Math.floor((8 * (100 + TD2_EVENT.dare.morePct)) / 100));
  });

  it('单个的敌人接了也不变成两个', () => {
    const one = lvl({ events: [{ kind: 'dare', from: 0, to: 0 }], waves: [{ groups: [{ enemy: 'captain', n: 1, lane: 0, every: 1 }] }] });
    const s = createTd(setup(one));
    stepTd(s, [{ t: 0, type: 'dare' }]);
    expect(tdPreview(s, 1)[0]?.lanes[0]?.enemies[0]?.n).toBe(1);
  });
});

describe('大潮每周海况', () => {
  const wk = (week: number, year = 2026): IsoWeek => ({ year, week });

  it('第 48 周（11 月 23 日周一）起才有海况', () => {
    expect(TIDE_MODS_FROM).toEqual(wk(48));
    expect(tideMod(wk(47))).toBeNull();
    expect(tideMod(wk(48))).not.toBeNull();
  });

  it('按周轮换：相邻两周一定不同，每条都轮得到，跨年也接得上；同一周谁算都一样', () => {
    const weeks = [...Array.from({ length: 5 }, (_, i) => wk(48 + i)), wk(53), wk(1, 2027), wk(2, 2027)].filter((w) => !(w.year === 2026 && w.week > 53));
    const mods = weeks.map((w) => tideMod(w));
    for (let i = 1; i < mods.length; i++) expect(mods[i], `${weeks[i]!.year}-W${weeks[i]!.week}`).not.toBe(mods[i - 1]);
    expect(new Set(mods)).toEqual(new Set(TIDE_MOD_ORDER));
    for (const w of weeks) expect(tideMod(w)).toBe(tideMod({ ...w }));
  });

  // 一局完整的大潮机器人在负载高时要十几秒：每种海况拆成一条，机器人只跑一局，第二局用它的操作重放（同种子加同一串操作）
  for (const mod of TIDE_MOD_ORDER) {
    it(`海况「${mod}」：同一周两次开局逐位一样（所有人同一套），改的是开局金、击杀金、英雄冷却、雾区`, () => {
      const w = [48, 49, 50].map((n) => wk(n)).find((x) => tideMod(x) === mod)!;
      const a = tideSetup(w);
      const b = tideSetup(w);
      const bot = runTdBot(a, 'normal');
      expect(tdFingerprint(runTd(b, bot.actions).state)).toBe(tdFingerprint(bot.state));
      const plain = tideSetup(w, null);
      const s = createTd(a);
      if (mod === 'fog') expect([a.level.fogFrom, plain.level.fogFrom === 0]).toEqual([0, false]);
      if (mod === 'rich') {
        expect(a.level.gold).toBe(Math.floor((plain.level.gold * TIDE_MOD_NUM.richGoldPct) / 100));
        expect(killGold(s, s.enemies[0] ?? ({ wave: 0 } as never), 10)).toBe(Math.floor((10 * TIDE_MOD_NUM.richKillPct) / 100));
      }
      expect(heroCd(s, 400)).toBe(mod === 'hero' ? Math.floor((400 * TIDE_MOD_NUM.heroCdPct) / 100) : 400);
    }, 60_000);
  }

  it('没有海况的周：大潮的局不建事件状态', () => {
    expect(createTd(tideSetup(wk(47))).happen).toBeUndefined();
    expect(createTd(tideSetup(wk(48), null)).happen).toBeUndefined();
  });
});
