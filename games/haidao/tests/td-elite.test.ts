import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TD2_ENEMIES, TD2_ENEMY_POINTS } from '../src/content/td2units.ts';
import { TD2_LEVEL_DEFS, TD2_LEVELS, TD_ELITE } from '../src/content/td2levels.ts';
import { RULES_SINCE, RULES_VERSION, TIDE_MAPS, createTd, levelForRules, runTdBot, tdFingerprint, tdGrowthSetup, tideSetup } from '../src/core/index.ts';
import type { IsoWeek, TdEnemyKind, TdLevel } from '../src/core/index.ts';
import { TD_ENEMY_ARMOR } from '../src/core/td2types.ts';
import { LIVE_TIER_IDS, tdLiveSetup } from '../src/core/tdlive.ts';
import { tidePick } from '../src/core/tdtide.ts';
import { tdHomeGen, tdHomeWave } from '../src/core/tdhome.ts';
import { ESCORT_LEVELS } from '../src/content/escortlevels.ts';

/**
 * 守岛精英（规则版本 15，DESIGN 10.3 末尾）：td07（第 6 波起）、td10 / td14（第 4 波起）水手、鹦鹉六成换成水手长、鹦鹉王。
 * 新旧两套组并排写在关卡里（TdGroup.since / until），createTd 按局的规则版本挑：15 以前的局逐位不变。
 */
const ELITE_LEVELS = ['td07', 'td10', 'td14'];
const ELITES: readonly TdEnemyKind[] = ['bosun', 'macaw'];
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
        expect(now, raw.id).toBe(raw);
        continue;
      }
      const from = TD2_LEVEL_DEFS.find((d) => d.id === raw.id)!.elite!.from ?? TD_ELITE.from;
      now.waves.slice(0, from).forEach((w, i) => {
        expect(w.groups.some((g) => ELITES.includes(g.enemy)), `${raw.id} 第 ${i + 1} 波`).toBe(false);
      });
      expect(now.waves.slice(from).some((w) => w.groups.some((g) => ELITES.includes(g.enemy))), raw.id).toBe(true);
    }
  });

  it('同一关敌人总数少一成五以上', () => {
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

