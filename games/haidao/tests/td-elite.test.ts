import { describe, expect, it } from 'vitest';
import { TD2_ENEMIES, TD2_ENEMY_POINTS } from '../src/content/td2units.ts';
import { TD2_LEVEL_DEFS, TD2_LEVELS, TD_ELITE } from '../src/content/td2levels.ts';
import { RULES_VERSION, createTd, stepTd, tdBotActions, tdGrowthSetup, tideSetup } from '../src/core/index.ts';
import type { TdEnemyKind, TdLevel } from '../src/core/index.ts';
import { TD_ENEMY_ARMOR } from '../src/core/td2types.ts';
import { LIVE_TIER_IDS, tdLiveSetup } from '../src/core/tdlive.ts';
import { tdHomeGen, tdHomeWave } from '../src/core/tdhome.ts';
import { ESCORT_LEVELS } from '../src/content/escortlevels.ts';

/**
 * 守岛精英（DESIGN 10.3 末尾）：写了 elite 的关从 elite.from 波（默认第 4 波）起水手、鹦鹉六成换成水手长、鹦鹉王。
 * 大副：写了 elite.kind = 'mate' 的关水手的份额换成大副（倒下散成 3 个水手），鹦鹉照常换鹦鹉王。
 */
const ELITE_LEVELS = ['td07', 'td10', 'td14', 'td16', 'td20', 'td22', 'td23', 'td24', 'td29', 'td30'];
const ELITES: readonly TdEnemyKind[] = ['bosun', 'macaw', 'mate'];
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
  it('只有这几关带精英配方；精英只从这关定的那一波（默认第 4 波）起出，之前的波没有精英', () => {
    expect(TD2_LEVEL_DEFS.filter((d) => d.elite).map((d) => d.id)).toEqual(ELITE_LEVELS);
    for (const now of TD2_LEVELS) {
      if (!ELITE_LEVELS.includes(now.id)) {
        // 第六章的大副是波次里直接写的（不走精英配方），只查水手长、鹦鹉王
        const elites = now.chapter === 6 ? ELITES.filter((k) => k !== 'mate') : ELITES;
        expect([...kinds(now)].some((k) => elites.includes(k)), now.id).toBe(false);
        continue;
      }
      const from = TD2_LEVEL_DEFS.find((d) => d.id === now.id)!.elite!.from ?? TD_ELITE.from;
      now.waves.slice(0, from).forEach((w, i) => {
        expect(w.groups.some((g) => ELITES.includes(g.enemy)), `${now.id} 第 ${i + 1} 波`).toBe(false);
      });
      expect(now.waves.slice(from).some((w) => w.groups.some((g) => ELITES.includes(g.enemy))), now.id).toBe(true);
    }
  });

});

describe('精英只在战役的精英配方里', () => {
  it('大潮、海盗来袭、悬赏守岛、护航的波次里都没有精英', () => {
    const none = (waves: readonly { groups: readonly { enemy: TdEnemyKind }[] }[], what: string): void => {
      for (const [i, w] of waves.entries()) for (const g of w.groups) expect(ELITES.includes(g.enemy), `${what} 第 ${i + 1} 波`).toBe(false);
    };
    for (let wk = 1; wk <= 52; wk += 3) {
      const lv = tideSetup({ year: 2026, week: wk }).level;
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


describe('大副', () => {
  it('倒下散成 3 个水手；预算点按本体加分身的等效血量折，金按水手的比例连分身一起算；布衣', () => {
    const m = TD2_ENEMIES.mate;
    expect(m.split).toEqual({ kind: 'sailor', n: 3 });
    const ehp = m.hp + 3 * TD2_ENEMIES.sailor.hp;
    expect(TD2_ENEMY_POINTS.mate).toBe(Math.round(ehp / 15));
    const total = m.gold + 3 * TD2_ENEMIES.sailor.gold;
    expect(Math.abs(total - (TD2_ENEMY_POINTS.mate * TD2_ENEMIES.sailor.gold) / TD2_ENEMY_POINTS.sailor)).toBeLessThanOrEqual(1);
    expect(TD_ENEMY_ARMOR.mate).toBe('cloth');
  });

  it('只在 td16、第四章的 td20、td22、td23、td24、第五章的 td29、td30 和第六章波次里直接写了大副的 td31、td32、td34，水手换大副、鹦鹉换鹦鹉王', () => {
    for (const raw of TD2_LEVELS) {
      const has = kinds(raw).has('mate');
      expect(has, raw.id).toBe(['td16', 'td20', 'td22', 'td23', 'td24', 'td29', 'td30', 'td31', 'td32', 'td34'].includes(raw.id));
    }
    const now = kinds(TD2_LEVELS.find((l) => l.id === 'td16')!);
    expect(now.has('bosun')).toBe(false);
    expect(now.has('macaw')).toBe(true);
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
