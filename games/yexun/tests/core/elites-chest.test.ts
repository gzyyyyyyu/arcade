import { describe, expect, it } from 'vitest';
import { createWorld, mergeReady, type World } from '../../src/core/index.ts';
import { grantWeapon, openEliteChestNow } from '../../src/core/debug.ts';
import type { MapId } from '../../src/content/maps.ts';
import { MERGES, MAX_WEAPON_LEVEL, WEAPONS, type WeaponId } from '../../src/content/weapons.ts';

/** 手上换成这几件（[id, 级, 进化]） */
function hold(w: World, list: [WeaponId, number, boolean][]): void {
  w.weapons.length = 0;
  for (const [id, level, evolved] of list) grantWeapon(w, id, level, evolved);
}

describe('守夜精英节奏、新搭配的合成条件、一箱结完', () => {
  it('时间线有 1:45、13:00 的精英，雪原、义庄另补 6:30、11:00', () => {
    const elites = (map: MapId): number[] =>
      createWorld({ seed: 1, mode: 'vigil', danger: 2, map })
        .schedule.filter((e) => e.kind === 'elite')
        .map((e) => e.at / 30);
    expect(elites('snow')).toEqual([105, 180, 300, 390, 450, 600, 660, 720, 721, 780]);
    expect(elites('bamboo')).toEqual([105, 180, 300, 390, 450, 600, 660, 720, 721, 780]);
  });

  it('符火燎原两件各 5 级不合；一件进化另一件满级才合', () => {
    const def = MERGES.find((m) => m.id === 'fuhuo')!;
    const now = createWorld({ seed: 1, mode: 'vigil', danger: 2, character: 'fushi' });
    hold(now, [['talisman', 5, false], ['gourd', 5, false]]);
    expect(mergeReady(now, def)).toBe(false);
    hold(now, [['talisman', MAX_WEAPON_LEVEL, true], ['gourd', MAX_WEAPON_LEVEL, false]]);
    expect(mergeReady(now, def)).toBe(true);
  });

  it('一箱结完：能进化的先进化，进化完凑齐的双修当场合上，同一个箱子里', () => {
    const w = createWorld({ seed: 1, mode: 'vigil', danger: 2, character: 'fushi' });
    hold(w, [['talisman', MAX_WEAPON_LEVEL, false], ['gourd', MAX_WEAPON_LEVEL, false]]);
    // 两件进化要的被动都给上
    for (const o of w.weapons) w.passives[WEAPONS[o.id].evolve!.with] = 1;
    const ups = w.chestUps;
    openEliteChestNow(w, 1);
    // 进化、合成不占件数：这一箱照样升了一件
    expect(w.chestUps).toBe(ups + 1);
    expect(w.weapons.every((o) => o.evolved)).toBe(true);
    expect(w.merges).toContain('fuhuo');
  });
});
