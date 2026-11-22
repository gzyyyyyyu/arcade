import { describe, expect, it } from 'vitest';
import { BUILDINGS, TROOP_KINDS } from '../src/content/index.ts';
import { CHIP_SHOP } from '../src/content/livetable.ts';
import { COSMETICS } from '../src/core/run.ts';
import type { BuildingKind, TroopKind } from '../src/core/types.ts';
import { buildingArt, troopFrames } from '../src/view/art/index.ts';

// 取图的地方（战斗、结算掉落窗、收藏页、商店）不包 try：这里锁住所有种类都画得出来，画不出来在测试里就坏，不在玩家面前退成岩石
describe('所有种类都能出图', () => {
  it('每种建筑的每一级', () => {
    for (const [kind, def] of Object.entries(BUILDINGS) as Array<[BuildingKind, (typeof BUILDINGS)[BuildingKind]]>) {
      for (let lv = 1; lv <= def.maxLevel; lv++) expect(buildingArt(kind, lv).svg.length, `${kind} ${lv} 级`).toBeGreaterThan(0);
    }
  });
  it('每种兵 × 每个动作 × 默认和三种皮肤', () => {
    for (const kind of TROOP_KINDS) {
      for (const anim of ['idle', 'walk', 'attack'] as const) {
        for (const skin of [undefined, 'gold', 'shadow', 'royal']) expect(troopFrames(kind, anim, skin).length, `${kind} ${anim} ${skin ?? '默认'}`).toBeGreaterThan(0);
      }
    }
  });
  it('收藏（掉宝池、章节纪念）和商店里的每一件', () => {
    for (const id of new Set([...COSMETICS, ...Object.keys(CHIP_SHOP)])) {
      const [type, a, b] = id.split(':') as [string, string, string];
      if (type === 'skin') expect(troopFrames(a as TroopKind, 'idle', b)[0], id).toBeTruthy();
      else expect(buildingArt(a as BuildingKind, 1).svg.length, id).toBeGreaterThan(0);
    }
  });
});
