import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TD2_ENEMIES, TD2_ENEMY_POINTS } from '../src/content/td2units.ts';
import { TD2_LEVEL_DEFS, TD2_LEVELS, TD_ELITE } from '../src/content/td2levels.ts';
import { RULES_SINCE, RULES_VERSION, TIDE_MAPS, createTd, levelForRules, runTdBot, stepTd, tdBotActions, tdFingerprint, tdGrowthSetup, tideSetup } from '../src/core/index.ts';
import type { IsoWeek, TdEnemyKind, TdLevel } from '../src/core/index.ts';
import { TD_ENEMY_ARMOR } from '../src/core/td2types.ts';
import { LIVE_TIER_IDS, tdLiveSetup } from '../src/core/tdlive.ts';
import { tidePick } from '../src/core/tdtide.ts';
import { tdHomeGen, tdHomeWave } from '../src/core/tdhome.ts';
import { ESCORT_LEVELS } from '../src/content/escortlevels.ts';

/**
 * 守岛精英（规则版本 15，DESIGN 10.3 末尾）：td07（第 6 波起）、td10 / td14（第 4 波起）水手、鹦鹉六成换成水手长、鹦鹉王。
 * 新旧两套组并排写在关卡里（TdGroup.since / until），createTd 按局的规则版本挑：15 以前的局逐位不变。
 * 大副（规则版本 17）：td16 第 4 波起水手的份额换成大副（倒下散成 3 个水手），鹦鹉照常换鹦鹉王；17 以前的 td16 逐位不变。
 */
const ELITE_LEVELS = ['td07', 'td10', 'td14', 'td16', 'td20', 'td22', 'td23', 'td24', 'td29', 'td30'];
const ELITES: readonly TdEnemyKind[] = ['bosun', 'macaw', 'mate'];
const count = (lv: TdLevel): number => lv.waves.reduce((a, w) => a + w.groups.reduce((b, g) => b + g.n, 0), 0);
const kinds = (lv: TdLevel): Set<TdEnemyKind> => new Set(lv.waves.flatMap((w) => w.groups.map((g) => g.enemy)));

describe('精英敌人的数', () => {
  it('一个顶四个：血、预算点、金都是普通的 4 倍；水手长布衣、鹦鹉王会飞', () => {
    expect(TD2_ENEMIES.bosun.hp).toBe(TD2_ENEMIES.sailor.hp * 4);
    expect(TD2_ENEMIES.macaw.hp).toBe(TD2_ENEMIES.parrot.hp * 4);
    expect(TD2_ENEMY_POINTS.bosun).toBe(TD2_ENEMY_POINTS.sailor * 4);
    expect(TD2_ENEMY_POINTS.macaw).toBe(TD2_ENEMY_POINTS.parrot * 4);
    expect(TD2_ENEMIES.bosun.gold).toBe(TD2_ENEMIES.sailor.gold * 4);
    expect(TD2_ENEMIES.macaw.gold).toBe(TD2_ENEMIES.parrot.gold * 4);
    expect(TD_ENEMY_ARMOR.bosun).toBe('cloth');
    expect(TD_ENEMY_ARMOR.macaw).toBe('air');
  });
});

describe('哪几关、从第几波', () => {
  it('只有三关带精英配方；现在的规则下精英只从这关定的那一波（默认第 4 波）起出，之前的波没有精英', () => {
    expect(TD2_LEVEL_DEFS.filter((d) => d.elite).map((d) => d.id)).toEqual(ELITE_LEVELS);
    for (const raw of TD2_LEVELS) {
      const now = levelForRules(raw, RULES_VERSION);
      if (!ELITE_LEVELS.includes(raw.id)) {
        // 规则 24 放宽的关（ease）也是新旧两套组并排，按版本挑过不再是同一个对象；它们不带精英，tests/td-ease.test.ts 另锁
        if (!TD2_LEVEL_DEFS.find((d) => d.id === raw.id)?.ease) expect(now, raw.id).toBe(raw);
        continue;
      }
      const from = TD2_LEVEL_DEFS.find((d) => d.id === raw.id)!.elite!.from ?? TD_ELITE.from;
      now.waves.slice(0, from).forEach((w, i) => {
        expect(w.groups.some((g) => ELITES.includes(g.enemy)), `${raw.id} 第 ${i + 1} 波`).toBe(false);
      });
      expect(now.waves.slice(from).some((w) => w.groups.some((g) => ELITES.includes(g.enemy))), raw.id).toBe(true);
    }
  });

  it('同一关敌人总数少一成五以上（大副散出来的水手不算从船上下来的）', () => {
    for (const id of ELITE_LEVELS) {
      const raw = TD2_LEVELS.find((l) => l.id === id)!;
      const before = count(levelForRules(raw, RULES_SINCE.tdElite - 1));
      const after = count(levelForRules(raw, RULES_VERSION));
      expect(after, id).toBeLessThan(before * 0.85);
    }
  });
});

describe('规则版本 15 以前的局逐位不变', () => {
  it('旧版本挑出来的波次里没有精英，组的个数、路、间隔和精英配方加进来以前一样', () => {
    for (const raw of TD2_LEVELS) {
      for (const rules of [9, 10, 11, 12, 14]) {
        const old = levelForRules(raw, rules);
        expect([...kinds(old)].some((k) => ELITES.includes(k)), `${raw.id} v${rules}`).toBe(false);
        for (const w of old.waves) for (const g of w.groups) expect(g.since, raw.id).toBeUndefined();
      }
    }
  });

  it('旧版本的整局指纹和 td-golden 里升版本前录的一样（战役精英关、大潮）；大潮、悬赏守岛在新版本下也一样', () => {
    const golden = JSON.parse(readFileSync(new URL('./td-golden.json', import.meta.url), 'utf8')) as Record<string, string>;
    const one = (key: string, setup: Parameters<typeof runTdBot>[0]): void => {
      const r = runTdBot(setup, 'normal');
      expect(`${tdFingerprint(r.state)} s${r.result.stars} l${r.result.lost} w${r.result.waves} t${r.result.ticks}`, key).toBe(golden[key]);
    };
    for (const id of ['td07', 'td14']) {
      const r = tdGrowthSetup(id, 'suggest', 1);
      if (!r.ok) throw new Error(id);
      one(`v14-${id}-normal-1`, { ...r.value, rules: 14 });
    }
    let week: IsoWeek | null = null;
    for (let wk = 1; !week && wk < 400; wk++) {
      const w: IsoWeek = { year: 2026 + Math.floor((wk - 1) / 52), week: ((wk - 1) % 52) + 1 };
      const p = tidePick(w);
      if (!p.mirror && p.map === 2) week = w;
    }
    expect(TIDE_MAPS.length).toBeGreaterThan(0);
    one('v14-tide2-normal-1', { ...tideSetup(week!, 14), seed: 1 });
    // 大潮、悬赏守岛没有精英：规则 15 下和 14 逐位一样，所以周中换版本不影响周榜，悬赏守岛的期望不变
    one('v14-tide2-normal-1', { ...tideSetup(week!, RULES_VERSION), seed: 1 });
    for (const tier of LIVE_TIER_IDS) one(`v14-live-${tier}-normal-1`, { ...tdLiveSetup(tier, 1), rules: RULES_VERSION });
  }, 60_000);

  it('大潮的关卡没有分版本的组：交分重放用的就是原来那份，不复制', () => {
    const lv = tideSetup({ year: 2026, week: 10 }, RULES_VERSION).level;
    expect(levelForRules(lv, 14)).toBe(lv);
    const s = createTd({ ...tideSetup({ year: 2026, week: 10 }, 14), seed: 1 });
    for (const w of s.level.waves) for (const g of w.groups) expect(ELITES.includes(g.enemy)).toBe(false);
  });
});

describe('精英只在规则 15 的战役新配方里', () => {
  it('大潮、海盗来袭、悬赏守岛、护航的波次里都没有精英', () => {
    const none = (waves: readonly { groups: readonly { enemy: TdEnemyKind }[] }[], what: string): void => {
      for (const [i, w] of waves.entries()) for (const g of w.groups) expect(ELITES.includes(g.enemy), `${what} 第 ${i + 1} 波`).toBe(false);
    };
    for (let wk = 1; wk <= 52; wk += 3) {
      const lv = tideSetup({ year: 2026, week: wk }, RULES_VERSION).level;
      none(Array.from({ length: 40 }, (_, i) => lv.endless!(i)), `大潮第 ${wk} 周`);
    }
    for (let hq = 1; hq <= 8; hq++) {
      const gen = tdHomeGen({ layout: [], hq, hero: 1 }, 7);
      none(Array.from({ length: 40 }, (_, w) => tdHomeWave(gen, w)), `海盗来袭主寨 ${hq}`);
    }
    for (const tier of LIVE_TIER_IDS) none(tdLiveSetup(tier, 1).level.waves, `悬赏守岛 ${tier}`);
    for (const lv of ESCORT_LEVELS) none(lv.waves, lv.id);
  });
});


describe('大副（规则版本 17）', () => {
  it('倒下散成 3 个水手；预算点按本体加分身的等效血量折，金按水手的比例连分身一起算；布衣', () => {
    const m = TD2_ENEMIES.mate;
    expect(m.split).toEqual({ kind: 'sailor', n: 3 });
    const ehp = m.hp + 3 * TD2_ENEMIES.sailor.hp;
    expect(TD2_ENEMY_POINTS.mate).toBe(Math.round(ehp / 15));
    const total = m.gold + 3 * TD2_ENEMIES.sailor.gold;
    expect(Math.abs(total - (TD2_ENEMY_POINTS.mate * TD2_ENEMIES.sailor.gold) / TD2_ENEMY_POINTS.sailor)).toBeLessThanOrEqual(1);
    expect(TD_ENEMY_ARMOR.mate).toBe('cloth');
  });

  it('只在 td16、第四章的 td20、td22、td23、td24 和第五章的 td29、td30，水手换大副、鹦鹉换鹦鹉王；规则 17 以前 td16 没有大副，规则 15、16 的 td16 一个精英都没有', () => {
    for (const raw of TD2_LEVELS) {
      const has = kinds(levelForRules(raw, RULES_VERSION)).has('mate');
      expect(has, raw.id).toBe(['td16', 'td20', 'td22', 'td23', 'td24', 'td29', 'td30'].includes(raw.id));
    }
    const td16 = TD2_LEVELS.find((l) => l.id === 'td16')!;
    const now = kinds(levelForRules(td16, RULES_VERSION));
    expect(now.has('bosun')).toBe(false);
    expect(now.has('macaw')).toBe(true);
    for (const rules of [14, 15, 16]) {
      const old = kinds(levelForRules(td16, rules));
      for (const k of ELITES) expect(old.has(k), `v${rules} ${k}`).toBe(false);
    }
  });

  it('打倒大副原地散出 3 个水手（离倒下的地方不到半格），算在同一波里', () => {
    const r = tdGrowthSetup('td16', 'suggest', 1);
    if (!r.ok) throw new Error('td16');
    const s = createTd({ ...r.value, rules: RULES_VERSION });
    const bot = tdBotActions('normal', 1);
    let checked = 0;
    while (!s.over && checked < 3) {
      const before = new Map(s.enemies.map((e) => [e.id, e]));
      const ev = stepTd(s, bot(s));
      for (const d of ev) {
        if (d.type !== 'die' || d.kind !== 'mate') continue;
        const mate = before.get(d.id)!;
        const kids = ev.filter((e) => e.type === 'spawn' && e.kind === 'sailor') as Array<{ x: number; y: number; id: number }>;
        expect(kids.length).toBeGreaterThanOrEqual(3);
        for (const k of kids.slice(0, 3)) {
          expect(Math.abs(k.x - mate.x)).toBeLessThanOrEqual(50);
          expect(Math.abs(k.y - mate.y)).toBeLessThanOrEqual(50);
          expect(s.enemies.find((e) => e.id === k.id)!.wave).toBe(mate.wave);
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
