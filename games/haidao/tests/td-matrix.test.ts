import { describe, expect, it } from 'vitest';
import {
  BUILDINGS, COUNTER, RULES_VERSION, TD_ARMORS, TD_BRANCH_DAMAGE, TD_BRANCH_DESC, TD_BRANCH_MOD, TD_DAMAGES, TD_ENEMY_ARMOR, TD_TOWER_DAMAGE,
  TD_TOWER_KINDS, bestDamageVs, counterPct, createTd, stepTd,
} from '../src/core/index.ts';
import type { Placed, TdArmor, TdEnemyKind, TdEvent, TdLevel, TdTowerKind } from '../src/core/index.ts';
import { BRANCHES } from '../src/content/branches.ts';

/** 守岛 2.0 的克制表（core/td2types.ts）：表本身的形状，以及规则核心里每种塔 × 每种护甲实际打出来的伤害逐格对上表 */

const ARMOR_ENEMY: Record<TdArmor, TdEnemyKind> = { cloth: 'sailor', heavy: 'ironclad', wood: 'skiff', air: 'parrot' };

describe('克制表本身', () => {
  it('倍率只有 150 / 100 / 50 / 0 四档；枪弹、炮弹各克一类怕一类，火克两类，爆破对地面一样', () => {
    for (const d of TD_DAMAGES) for (const a of TD_ARMORS) expect([150, 100, 50, 0]).toContain(COUNTER[d][a]);
    const strong = (d: (typeof TD_DAMAGES)[number]): TdArmor[] => TD_ARMORS.filter((a) => COUNTER[d][a] > 100);
    const weak = (d: (typeof TD_DAMAGES)[number]): TdArmor[] => TD_ARMORS.filter((a) => COUNTER[d][a] < 100);
    expect(strong('shot')).toEqual(['air']);
    expect(weak('shot')).toEqual(['heavy']);
    expect(strong('shell')).toEqual(['heavy']);
    expect(weak('shell')).toEqual(['air']);
    expect(strong('fire')).toEqual(['cloth', 'wood']);
    expect(weak('fire')).toEqual(['heavy', 'air']);
    expect(strong('blast')).toEqual([]);
    expect(weak('blast')).toEqual(['air']);
  });

  it('建议的伤害：布衣、木船 → 火，重甲 → 炮弹，飞禽 → 枪弹', () => {
    expect(TD_ARMORS.map(bestDamageVs)).toEqual(['fire', 'shell', 'fire', 'shot']);
  });

  it('分叉例外只有两条：高射火箭能打飞禽（按 airPct，不吃 1.5），燃烧弹留火按火；其余分叉不改倍率', () => {
    expect(Object.keys(TD_BRANCH_DAMAGE).sort()).toEqual(['mortar.fire', 'rocket.flak']);
    expect(counterPct('shell', 'air', ['rocket.flak'])).toBe(TD_BRANCH_DAMAGE['rocket.flak']!.airPct);
    expect(counterPct('shell', 'air', ['rocket.swarm'])).toBe(0);
    expect(counterPct('shell', 'heavy', ['rocket.flak'])).toBe(COUNTER.shell.heavy);
  });

  it('守岛的分叉解释（tdbranches.ts）：每个分叉都有，去掉了穿甲和防空开关；穿甲弹改成打重甲加成，说明跟着改', () => {
    for (const b of BRANCHES) {
      const m = TD_BRANCH_MOD.get(b.id);
      expect(m, b.id).toBeDefined();
      expect('pierce' in m! || 'antiAir' in m!).toBe(false);
      expect(TD_BRANCH_DESC.get(b.id)).toBeTruthy();
    }
    expect(TD_BRANCH_MOD.get('cannon.pierce')!.heavyPct).toBeGreaterThan(0);
    expect(TD_BRANCH_DESC.get('cannon.pierce')).not.toBe(BRANCHES.find((b) => b.id === 'cannon.pierce')!.desc);
    expect(TD_BRANCH_DESC.get('rocket.flak')).toContain('鹦鹉');
  });

  it('每种敌人一种护甲，雾不是护甲（雾船是木船）', () => {
    expect(TD_ENEMY_ARMOR.fog).toBe('wood');
    expect(TD_ENEMY_ARMOR.captain).toBe('heavy');
    expect(TD_ENEMY_ARMOR.sapper).toBe('cloth');
  });
});

/** 一座常驻塔（基地等级表，不选分叉）对一个敌人打出的第一下 */
function firstHit(kind: TdTowerKind, enemy: TdEnemyKind): { hits: TdEvent[]; aimed: boolean } {
  const layout: Placed[] = [
    { id: 1, kind: 'hq', level: 1, x: 2, y: 2 },
    { id: 2, kind: 'treasure', level: 1, x: 10, y: 13 },
    { id: 50, kind, level: 3, x: 11, y: 3 },
  ];
  const level: TdLevel = {
    id: 't', name: 't', hq: 1, hpPct: 1000, gold: 0, first: 0, waveTicks: 4000, lanes: [{ x: 10, y: -2 }],
    waves: [{ groups: [{ enemy, n: 1, lane: 0, every: 1 }] }], kegs: [], obstacles: [], slots: [],
  };
  const s = createTd({ layout, level, hero: 1, seed: 1, rules: RULES_VERSION });
  s.hero.respawn = 1_000_000;
  const hits: TdEvent[] = [];
  let aimed = false;
  for (let i = 0; i < 900 && !s.over && hits.length === 0; i++) {
    for (const e of stepTd(s, [])) if (e.type === 'hit') hits.push(e);
    if (s.towers[0]!.aim >= 0) aimed = true;
    // 分裂小艇别被打沉（分出来的小艇会混进来）
    if (s.vault < 20) break;
  }
  return { hits, aimed };
}

describe('规则核心按表打：每种塔 × 每种护甲逐格', () => {
  for (const kind of TD_TOWER_KINDS) {
    it(`${kind}（${TD_TOWER_DAMAGE[kind]}）`, () => {
      const dmg = BUILDINGS[kind].levels[2]!.dmg!;
      for (const armor of TD_ARMORS) {
        const pct = COUNTER[TD_TOWER_DAMAGE[kind]][armor];
        const r = firstHit(kind, ARMOR_ENEMY[armor]);
        if (pct === 0) {
          expect(r.hits, `${kind} → ${armor}`).toHaveLength(0);
          expect(r.aimed, `${kind} 不瞄准 ${armor}`).toBe(false);
        } else {
          expect(r.hits[0], `${kind} → ${armor}`).toMatchObject({ dmg: Math.floor((dmg * pct) / 100) });
        }
      }
    });
  }
});
