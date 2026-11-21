import { describe, expect, it } from 'vitest';
import { ENEMY_BY_KIND, type EnemyKind } from '../../src/content/enemies.ts';
import { CROSSBOW, HURRIER } from '../../src/content/foes.ts';
import { vigilRegion, VIGIL_REGIONS } from '../../src/content/regions.ts';
import { createWorld, step, type World } from '../../src/core/index.ts';
import { spawnNow } from '../../src/core/debug.ts';

const code = (k: EnemyKind): number => ENEMY_BY_KIND[k].code;
const NEW = [code('crossbow'), code('hurrier')];

/** 走 n 拍（左右来回走，血补满），返回场上出现过新怪的次数 */
function run(map: 'riverbank' | 'temple', n: number, live = false): { w: World; seen: number } {
  const w = createWorld({ seed: 11, mode: 'vigil', danger: 2, map, ...(live ? { live } : {}) });
  let seen = 0;
  for (let t = 0; t < n; t++) {
    w.hp = w.stats.hpMax;
    step(w, t % 90 < 45 ? 1 : -1, 0);
    if (t % 30 === 0) for (let i = 0; i < w.eAlive.length; i++) if (w.eAlive[i] && NEW.includes(w.eKind[i]!)) seen++;
  }
  return { w, seen };
}

describe('克制镇守的两种怪（纸弩手、催命鬼）', () => {
  it('河滩、荒庙刷新怪（娱乐、实盘都是），别的图不刷', () => {
    for (const map of ['riverbank', 'temple'] as const) {
      expect(run(map, 9000).seen, map).toBeGreaterThan(0);
      expect(run(map, 9000, true).seen, `${map} 实盘`).toBeGreaterThan(0);
      expect(vigilRegion(map)!.mobs.map((m) => m.kind)).toEqual([...VIGIL_REGIONS[map]!.mobs.map((m) => m.kind), 'crossbow', 'hurrier']);
    }
    for (const map of ['snow', 'bamboo', 'icelake', 'yizhuang', 'guishi'] as const) expect(vigilRegion(map)).toBe(VIGIL_REGIONS[map]);
  }, 60000);

  function quiet(): World {
    const w = createWorld({ seed: 5, mode: 'vigil', danger: 2, map: 'riverbank' });
    w.weapons.length = 0;
    w.wstats.length = 0;
    w.nextEvent = 1 << 30;
    w.spawnAcc = -1e9;
    return w;
  }
  const dist = (w: World, i: number): number => Math.hypot(w.eX[i]! - w.x, w.eY[i]! - w.y);

  it('纸弩手：站在远处放箭，主角靠近就后退', () => {
    const w = quiet();
    spawnNow(w, 'crossbow', w.x + 380, w.y);
    const i = w.eAlive.findIndex((a, k) => !!a && w.eKind[k] === code('crossbow'));
    let shots = 0;
    let minD = 1e9;
    for (let t = 0; t < 600; t++) {
      w.hp = w.stats.hpMax;
      step(w, 0, 0);
      minD = Math.min(minD, dist(w, i));
      shots = Math.max(shots, w.sAlive.reduce((n, a) => n + a, 0));
    }
    expect(shots).toBeGreaterThan(0);
    expect(minD).toBeGreaterThan(CROSSBOW.near - 60);
  });

  it('催命鬼：主角站着不动满 wait 拍就加速，一动就恢复', () => {
    const w = quiet();
    spawnNow(w, 'hurrier', w.x + 900, w.y);
    const i = w.eAlive.findIndex((a, k) => !!a && w.eKind[k] === code('hurrier'));
    for (let t = 0; t < HURRIER.wait - 5; t++) step(w, 0, 0);
    expect(w.eS[i]).toBe(0);
    for (let t = 0; t < 10; t++) step(w, 0, 0);
    expect(w.eS[i]).toBe(1);
    for (let t = 0; t < 40; t++) step(w, 1, 0);
    expect(w.eS[i]).toBe(0);
  });
});
