import { describe, expect, it } from 'vitest';
import { TD2_LEVEL_BY_ID, tdBuildRange, type TdGarrisonOption, type TdTowerKind } from '../src/core/index.ts';
import { UNIT } from '../src/core/types.ts';
import { garrisonRec, levelFoes, SHIP_RANGE } from '../src/view/garrisonrec.ts';

const all: TdTowerKind[] = ['cannon', 'gunTower', 'mortar', 'flame', 'harpoon', 'rocket', 'shock', 'sniper'];
const opts = (tier: 1 | 2 | 3): TdGarrisonOption[] => all.map((kind) => ({ kind, baseLevel: 8, tier, branch: [], bonusPct: 10 }));

describe('驻守台的「这关推荐」', () => {
  it('护甲占比按血量加权，加起来是 1；第四章的炮艇关算有船', () => {
    const f = levelFoes(TD2_LEVEL_BY_ID.get('td21')!.waves);
    expect(Object.values(f.share).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(f.ships).toBe(true);
    expect(levelFoes(TD2_LEVEL_BY_ID.get('td01')!.waves).ships).toBe(false);
  });
  it('td24（海盗王 + 炮艇）三座 3 阶台：推荐的都够得着海上的船，而且不全是同一种', () => {
    const lv = TD2_LEVEL_BY_ID.get('td24')!;
    const rec = garrisonRec(lv.waves, lv.garrison.map(() => opts(3)));
    expect(rec.size).toBe(lv.garrison.length);
    expect(new Set(rec.values()).size).toBeGreaterThan(1);
    for (const k of rec.values()) expect(tdBuildRange(k, 3).range).toBeGreaterThanOrEqual(SHIP_RANGE * UNIT);
  });
  it('全是重甲的关推炮弹（克重甲），全是飞的推枪弹（炮弹打不到飞的）', () => {
    const heavy = garrisonRec([{ groups: [{ enemy: 'ironclad', n: 20, lane: 0, every: 10 }] }], [opts(2)]);
    expect(['cannon', 'mortar', 'rocket', 'shock']).toContain(heavy.get(0));
    const air = garrisonRec([{ groups: [{ enemy: 'parrot', n: 20, lane: 0, every: 10 }] }], [opts(2)]);
    expect(['gunTower', 'harpoon', 'sniper']).toContain(air.get(0));
  });
  it('一种都带不了的台不推荐', () => {
    expect(garrisonRec(TD2_LEVEL_BY_ID.get('td21')!.waves, [[]]).size).toBe(0);
  });
});
