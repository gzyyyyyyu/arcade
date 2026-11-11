import { describe, expect, it } from 'vitest';
import { createWorld, fingerprint, mergeReady, RULES_VERSION, step, type World } from '../../src/core/index.ts';
import { grantWeapon, openEliteChestNow } from '../../src/core/debug.ts';
import type { CharacterId } from '../../src/content/meta.ts';
import type { MapId } from '../../src/content/maps.ts';
import { MERGES, MAX_WEAPON_LEVEL, WEAPONS, type WeaponId } from '../../src/content/weapons.ts';

/** 走 n 拍（左右来回走，血补满），返回世界 */
function run(map: MapId, character: CharacterId, rules: number | undefined, live: boolean, n = 6000): World {
  const w = createWorld({ seed: 23, mode: 'vigil', danger: 2, map, character, ...(live ? { live } : {}) }, rules);
  for (let t = 0; t < n; t++) {
    w.hp = w.stats.hpMax;
    step(w, t % 90 < 45 ? 1 : 17, 0);
  }
  return w;
}

/** 手上换成这几件（[id, 级, 进化]） */
function hold(w: World, list: [WeaponId, number, boolean][]): void {
  w.weapons.length = 0;
  for (const [id, level, evolved] of list) grantWeapon(w, id, level, evolved);
}

describe('规则 57：新搭配和别的双修同一条件、守夜补精英、宝箱更大（娱乐 57 起，实盘 58 起）', () => {
  it('内容闸 new57：娱乐 57 起开；实盘 58 起开（现行规则 58），规则 57 的实盘录像、规则 56 的录像都关', () => {
    expect(RULES_VERSION).toBeGreaterThanOrEqual(58);
    expect(createWorld({ seed: 1, mode: 'vigil', danger: 2 }).new57).toBe(true);
    expect(createWorld({ seed: 1, mode: 'vigil', danger: 2, live: true }).new57).toBe(true);
    expect(createWorld({ seed: 1, mode: 'vigil', danger: 2, live: true }, 57).new57).toBe(false);
    expect(createWorld({ seed: 1, mode: 'vigil', danger: 2 }, 56).new57).toBe(false);
    expect(createWorld({ seed: 1, mode: 'vigil', danger: 2, live: true }, 58).new57).toBe(true);
  });

  it('规则 57 的实盘录像和规则 56 逐位一样（过了 1:45 那只精英和第一箱）', () => {
    const cases: [MapId, CharacterId][] = [['snow', 'xiaodao'], ['riverbank', 'gengfu'], ['yizhuang', 'yinyang']];
    for (const [map, c] of cases) expect(fingerprint(run(map, c, 57, true)), `${map} ${c}`).toBe(fingerprint(run(map, c, 56, true)));
  }, 120000);

  it('娱乐局的时间线多了 1:45、13:00 的精英，雪原、义庄另补 6:30、11:00', () => {
    const elites = (map: MapId, rules?: number): number[] =>
      createWorld({ seed: 1, mode: 'vigil', danger: 2, map }, rules)
        .schedule.filter((e) => e.kind === 'elite')
        .map((e) => e.at / 30);
    expect(elites('snow')).toEqual([105, 180, 300, 390, 450, 600, 660, 720, 721, 780]);
    expect(elites('bamboo')).toEqual([105, 180, 300, 390, 450, 600, 660, 720, 721, 780]);
    expect(elites('snow', 56)).toEqual([180, 300, 450, 600, 720, 721]);
  });

  it('符火燎原两件各 5 级：规则 56 合，规则 57 不合；一件进化另一件满级才合', () => {
    const def = MERGES.find((m) => m.id === 'fuhuo')!;
    const old = createWorld({ seed: 1, mode: 'vigil', danger: 2, character: 'fushi' }, 56);
    const now = createWorld({ seed: 1, mode: 'vigil', danger: 2, character: 'fushi' });
    for (const w of [old, now]) hold(w, [['talisman', 5, false], ['gourd', 5, false]]);
    expect(mergeReady(old, def)).toBe(true);
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

