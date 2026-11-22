import { describe, expect, it } from 'vitest';
import { ENEMY_BY_KIND, HUAPI } from '../../src/content/enemies.ts';
import { MAP_IDS } from '../../src/content/maps.ts';
import { midBossOf } from '../../src/content/waves.ts';
import { createWorld, Ev, fingerprint, rushPlan, step, type World } from '../../src/core/index.ts';
import { grantWeapon, spawnNow } from '../../src/core/debug.ts';

const HUAPI_MAPS = ['guishi'] as const;
const MID_AT = 480 * 30;

/** 干净的场：没有法器、不再按分钟补怪；主角血量拉满，免得测试途中被打死 */
function quiet(seed = 5): World {
  const w = createWorld({ seed, mode: 'vigil', danger: 2, map: 'bamboo' });
  w.weapons.length = 0;
  w.wstats.length = 0;
  w.nextEvent = 1 << 30;
  return w;
}

/** 走 n 拍，收集这几拍的画皮事件（a, b） */
function huapiEvents(w: World, n: number, dir = 0): [number, number][] {
  const out: [number, number][] = [];
  for (let t = 0; t < n; t++) {
    w.hp = w.stats.hpMax;
    step(w, dir, -1);
    for (let k = 0; k < w.ev.n; k++) if (w.ev.type[k] === Ev.Huapi) out.push([w.ev.a[k]!, w.ev.b[k]!]);
  }
  return out;
}

function count(w: World, kind: keyof typeof ENEMY_BY_KIND): number {
  let n = 0;
  for (let i = 0; i < w.eAlive.length; i++) if (w.eAlive[i] && w.eKind[i] === ENEMY_BY_KIND[kind].code) n++;
  return n;
}

describe('画皮：按图出场', () => {
  it('鬼市第 8 分钟出画皮（竹林、河滩、冰湖、荒庙换成自己的首领见 foes.test.ts），雪原、义庄仍是纸扎老爷', () => {
    for (const map of MAP_IDS) {
      if (!['guishi', 'snow', 'yizhuang'].includes(map)) continue;
      const w = createWorld({ seed: 7, mode: 'vigil', danger: 2, map });
      const k = w.schedule.findIndex((e) => e.kind === 'boss' && e.enemy !== 'boss');
      const ev = w.schedule[k]!;
      expect(ev.at).toBe(MID_AT);
      expect(ev.kind === 'boss' && ev.enemy).toBe((HUAPI_MAPS as readonly string[]).includes(map) ? 'huapi' : 'lord');
      expect(midBossOf(map)).toBe((HUAPI_MAPS as readonly string[]).includes(map) ? 'huapi' : 'lord');
    }
  });

  it('到点真的刷出画皮：离主角 300–450、发出场事件、混迹阶段', () => {
    const w = createWorld({ seed: 7, mode: 'vigil', danger: 2, map: 'guishi' });
    w.weapons.length = 0;
    w.wstats.length = 0;
    w.nextEvent = w.schedule.findIndex((e) => e.kind === 'boss' && e.enemy === 'huapi');
    w.tick = MID_AT;
    const evs = huapiEvents(w, 1);
    expect(evs).toHaveLength(1);
    expect(evs[0]![0]).toBe(0);
    const i = evs[0]![1];
    expect(w.eKind[i]).toBe(ENEMY_BY_KIND.huapi.code);
    expect(w.eS[i]).toBe(0);
    const d = Math.sqrt((w.eX[i]! - w.x) ** 2 + (w.eY[i]! - w.y) ** 2);
    expect(d).toBeGreaterThan(HUAPI.spawnMin - 20);
    expect(d).toBeLessThan(HUAPI.spawnMax + 10);
  });
});

describe('画皮：混迹与现形', () => {
  it('混迹时第一次挨打发一次提示，不放技能；掉到现形血线现形并立刻甩分身', () => {
    const w = quiet();
    const i = spawnNow(w, 'huapi', w.x + 20, w.y);
    expect(w.bossSlot).toBe(i);
    // 不挨打：一阵子里不放分身
    expect(huapiEvents(w, 400).filter(([a]) => a === 3 || a === 2)).toEqual([]);
    w.eHp[i] = w.eHpMax[i]! * 0.9;
    grantWeapon(w, 'bell', 8);
    const hit = huapiEvents(w, 60);
    expect(hit.filter(([a]) => a === 1)).toEqual([[1, i]]);
    expect(w.eS[i]).toBe(0);
    // 再挨打也不再发
    expect(huapiEvents(w, 60).filter(([a]) => a === 1)).toEqual([]);
    w.eHp[i] = w.eHpMax[i]! * (HUAPI.revealAt - 0.02);
    const reveal = huapiEvents(w, 2);
    expect(reveal.map(([a]) => a)).toEqual(expect.arrayContaining([2, 3]));
    expect(w.eS[i]).toBe(1);
  });

  it('现形后按间隔甩分身（3 个、血 cloneHp、会自己散），倒下发倒下事件', () => {
    const w = quiet();
    const i = spawnNow(w, 'huapi', w.x + 300, w.y);
    w.eS[i] = 1;
    w.eT[i] = HUAPI.every[0]!;
    const evs = huapiEvents(w, HUAPI.every[0]! + 2);
    expect(evs.filter(([a]) => a === 3)).toEqual([[3, HUAPI.clones]]);
    let skin = -1;
    for (let j = 0; j < w.eAlive.length; j++) if (w.eAlive[j] && w.eKind[j] === ENEMY_BY_KIND.huapiskin.code) skin = j;
    expect(skin).toBeGreaterThanOrEqual(0);
    expect(w.eHpMax[skin]).toBe(HUAPI.cloneHp);
    // 分身寿命到了自己消失；过程中画皮也会再甩，但场上不超过上限
    for (let t = 0; t < 40 * 30; t++) {
      huapiEvents(w, 1);
      expect(count(w, 'huapiskin')).toBeLessThanOrEqual(HUAPI.maxClones);
    }
    // 画皮倒下
    w.eHp[i] = 0.5;
    w.eX[i] = w.x + 20;
    w.eY[i] = w.y;
    grantWeapon(w, 'bell', 8);
    const end = huapiEvents(w, 90);
    expect(end.filter(([a]) => a === 4)).toEqual([[4, i]]);
    expect(w.eAlive[i]).toBe(0);
    expect(w.phase).not.toBe('over');
  });

  it('缠丝：现形的画皮身边 silkR 内主角变慢，圈外不变', () => {
    const run = (huapiAt: number | null): number => {
      const w = quiet(11);
      w.x = 1500;
      w.y = 1500;
      if (huapiAt !== null) {
        const i = spawnNow(w, 'huapi', w.x + huapiAt, w.y);
        w.eS[i] = 1;
        w.eT[i] = 1 << 20;
      }
      huapiEvents(w, 3, 1);
      const x0 = w.x;
      const y0 = w.y;
      huapiEvents(w, 1, 1);
      return Math.sqrt((w.x - x0) ** 2 + (w.y - y0) ** 2);
    };
    const free = run(null);
    const far = run(HUAPI.silkR + 200);
    const near = run(HUAPI.silkR - 60);
    expect(far).toBeCloseTo(free, 6);
    expect(near).toBeCloseTo(free * HUAPI.silkSlow, 6);
  });
});

describe('画皮：连战与确定性', () => {
  it('连战第 5 关：按图出本图的中期首领（鬼市画皮，其余见 foes.test.ts）；横幅名有画皮', () => {
    for (const map of MAP_IDS) {
      for (let seed = 1; seed <= 5; seed++) {
        const p = rushPlan(seed, map);
        expect(p.stages[4]).toEqual([midBossOf(map)]);
        expect(p.stages[6]).toEqual(['boss']);
      }
    }
    expect(ENEMY_BY_KIND.huapi.name).toBe('画皮');
  });

  it('同种子同输入：逐拍指纹相同', () => {
    const make = (): World => {
      const w = createWorld({ seed: 21, mode: 'vigil', danger: 2, map: 'guishi' });
      w.nextEvent = w.schedule.findIndex((e) => e.kind === 'boss' && e.enemy === 'huapi');
      w.tick = MID_AT;
      return w;
    };
    const a = make();
    const b = make();
    for (let t = 0; t < 900; t++) {
      const dir = 1 + ((t >> 5) % 8);
      step(a, dir, -1);
      step(b, dir, -1);
      expect(fingerprint(a)).toBe(fingerprint(b));
    }
    expect(count(a, 'huapi')).toBeLessThanOrEqual(1);
  });
});
