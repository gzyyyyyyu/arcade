import { describe, expect, it } from 'vitest';
import { mergeWho, SHOWN_MERGES } from '../../src/content/combos.ts';
import { CHARACTER_POOLS, type PoolCharacterId } from '../../src/content/pools.ts';
import { WEAPONS, type MergeDef, type WeaponId } from '../../src/content/weapons.ts';
import { grantWeapon, openChestNow, spawnNow } from '../../src/core/debug.ts';
import { createWorld, fingerprint, step, type World } from '../../src/core/index.ts';

// 每个搭配一条：拿到料 → 开宝箱合上 → 效果真的起作用。
// 两个一模一样的世界都照门槛给料、开宝箱，其中一个合完把搭配抹掉；规则核心按 w.merges 判搭配，
// 所以两边逐拍一样，直到这个搭配的效果第一次改动了局面，指纹就分开了。没分开 = 合上了却没起作用。
// 主角身边围一圈打不死的怪（中后期的样子）：开局的怪一碰就死，「打中后再怎样」的搭配（贴符、被锁拉到、挨打破盾）没有机会出手

function setup(c: string, m: MergeDef): World {
  const w = createWorld({ seed: 11, mode: 'vigil', danger: 2, character: c as never });
  w.weapons.length = 0;
  w.wstats.length = 0;
  const evoIn = (id: WeaponId): boolean => !!WEAPONS[id].evolve && CHARACTER_POOLS[c as PoolCharacterId].passives.includes(WEAPONS[id].evolve!.with);
  const aEvo = !m.dual || evoIn(m.a);
  grantWeapon(w, m.a, 8, aEvo);
  grantWeapon(w, m.b, 8, !m.dual || !aEvo);
  openChestNow(w);
  // 两圈打不死的怪：里圈贴身（挨打、破盾），外圈在法器够得着的地方
  for (let k = 0; k < 24; k++) {
    const r = k < 8 ? 40 : 160;
    const e = spawnNow(w, 'jiangshi', w.x + (k % 8 < 4 ? r : -r) * ((k % 4) + 1) / 4, w.y + (k % 2 ? r : -r) * (((k + 1) % 4) + 1) / 4);
    w.eHp[e] = 1e7;
    w.eHpMax[e] = 1e7;
  }
  return w;
}

/** 两边同样站着不动、升级选第一张；返回第一次分开的拍号（-1 = 跑满没分开） */
function diverge(a: World, b: World, ticks: number): number {
  for (let t = 0; t < ticks; t++) {
    if (a.phase === 'over' || b.phase === 'over') return a.phase === b.phase ? -1 : t;
    step(a, 0, a.phase === 'choose' ? 0 : -1);
    step(b, 0, b.phase === 'choose' ? 0 : -1);
    // 不让主角死：只看搭配的效果，不看谁先倒
    a.hp = a.stats.hpMax;
    b.hp = b.stats.hpMax;
    if (fingerprint(a) !== fingerprint(b)) return t;
  }
  return -1;
}

describe('每个搭配：拿到料 → 合上 → 起作用', () => {
  for (const m of SHOWN_MERGES) {
    const c = mergeWho(m)[0]!;
    it(`${m.name}（${c}）`, () => {
      const a = setup(c, m);
      const b = setup(c, m);
      expect(a.merges).toEqual([m.id]);
      b.merges.length = 0;
      // 抹掉以后重算一遍属性（搭配有的效果在重算时记下来）：再给一次手上已有的料就会重算，等级不变
      grantWeapon(b, m.a, 1);
      expect(diverge(a, b, 60 * 30), `${m.id} 合上了，但一分钟里没改动局面`).toBeGreaterThanOrEqual(0);
    });
  }
});
