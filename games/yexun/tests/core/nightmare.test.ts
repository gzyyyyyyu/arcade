import { describe, expect, it } from 'vitest';
import { MAP_EVENT_AT, MAP_EVENT_KINDS, MAP_EVENT_WARN, MAP_EVENTS } from '../../src/content/mapEvents.ts';
import { MAP_IDS } from '../../src/content/maps.ts';
import { BLOOD_MOON, DANGER_IDS, DANGERS, ELITE_RAGE, NIGHTMARE_FROM } from '../../src/content/waves.ts';
import { createWorld, Ev, step, type World } from '../../src/core/index.ts';
import { grantWeapon, spawnNow } from '../../src/core/debug.ts';
import { normalizeSetup } from '../../src/core/state.ts';

/** 跳到第 tick 拍前一拍（不刷怪、不放法器），再走一拍，返回这一拍的事件 */
function at(w: World, tick: number): { type: number; a: number; b: number; c: number }[] {
  w.tick = tick - 1;
  step(w, 0, 0);
  const out = [];
  for (let k = 0; k < w.ev.n; k++) out.push({ type: w.ev.type[k]!, a: w.ev.a[k]!, b: w.ev.b[k]!, c: w.ev.c[k]! });
  return out;
}
function quiet(w: World): World {
  w.weapons.length = 0;
  w.wstats.length = 0;
  w.nextEvent = 1 << 30;
  return w;
}
const alive = (w: World): number => w.eAlive.reduce((s, v) => s + v, 0);

describe('噩梦档（危险 6–8）', () => {
  it('守夜能开到危险 8，夜探最高 5', () => {
    expect(DANGER_IDS.at(-1)).toBe(8);
    expect(normalizeSetup({ seed: 1, mode: 'vigil', danger: 8 }).danger).toBe(8);
    expect(normalizeSetup({ seed: 1, mode: 'raid', danger: 8 as never }).danger).toBe(5);
  });

  it('逐档只加不减：机制叠上去，噩梦档之间数值不降', () => {
    // 噩梦 1 的血和伤害也比危险 5 高（胜率逐档降）；危险 5 的机制噩梦档都有
    for (let d = NIGHTMARE_FROM; d <= 8; d++) {
      const a = DANGERS[(d - 1) as 5], b = DANGERS[d as 6];
      expect(b.hpMul).toBeGreaterThan(a.hpMul);
      expect(b.dmgMul).toBeGreaterThan(a.dmgMul);
      expect(b.countMul).toBeGreaterThanOrEqual(a.countMul);
      expect(b.weakKeep).toBeLessThanOrEqual(a.weakKeep);
      expect(b.eliteNoWard && b.twinBoss).toBe(true);
      expect(b.eliteRage).toBe(true);
    }
    expect(DANGERS[7].night).toBeGreaterThan(0);
    expect(DANGERS[7].supply).toBeLessThan(1);
    expect(DANGERS[8].bloodMoon && !DANGERS[7].bloodMoon).toBe(true);
    for (let d = 0; d < NIGHTMARE_FROM; d++) expect(DANGERS[d as 0].eliteRage || DANGERS[d as 0].bloodMoon || DANGERS[d as 0].night > 0 || DANGERS[d as 0].supply !== 1).toBe(false);
  });

  it('精英掉过半血那一下发狂，撞人更疼；危险 5 不会', () => {
    for (const [danger, mad] of [[6, true], [5, false]] as const) {
      const w = quiet(createWorld({ seed: 3, mode: 'vigil', danger }));
      grantWeapon(w, 'sword', 8);
      const i = spawnNow(w, 'whitefox', w.x + 30, w.y);
      const dmg = w.eDmg[i]!;
      const half = w.eHpMax[i]! * ELITE_RAGE.at;
      let raged = false;
      let crossed = false;
      // 每拍把血拉回半血上面一点、贴着主角，等桃木剑砍一下把它砍过半血
      for (let t = 0; t < 300 && !crossed; t++) {
        w.eHp[i] = half + 1;
        w.eX[i] = w.x + 30;
        w.eY[i] = w.y;
        w.invuln = 99;
        step(w, 0, 0);
        crossed = w.eHp[i]! < half;
        for (let k = 0; k < w.ev.n; k++) if (w.ev.type[k] === Ev.EliteRage) raged = true;
      }
      expect(crossed).toBe(true);
      expect(raged).toBe(mad);
      if (mad) expect(w.eDmg[i]).toBeCloseTo(dmg * ELITE_RAGE.dmg, 6);
      else expect(w.eDmg[i]).toBe(dmg);
    }
  });

  it('血月只在危险 8：到点预告、升起、落下', () => {
    const w = quiet(createWorld({ seed: 2, mode: 'vigil', danger: 8 }));
    const has = (evs: ReturnType<typeof at>, a: number): boolean => evs.some((e) => e.type === Ev.BloodMoon && e.a === a);
    expect(has(at(w, BLOOD_MOON.first - BLOOD_MOON.warn), 0)).toBe(true);
    expect(has(at(w, BLOOD_MOON.first), 1)).toBe(true);
    expect(has(at(w, BLOOD_MOON.first + BLOOD_MOON.dur), 2)).toBe(true);
    const w7 = quiet(createWorld({ seed: 2, mode: 'vigil', danger: 7 }));
    expect(at(w7, BLOOD_MOON.first).some((e) => e.type === Ev.BloodMoon)).toBe(false);
  });
});

describe('地图事件', () => {
  it('每张守夜图都有一个，编号对得上', () => {
    for (const m of MAP_IDS) expect(MAP_EVENT_KINDS).toContain(MAP_EVENTS[m].kind);
    expect(new Set(MAP_IDS.map((m) => MAP_EVENTS[m].kind)).size).toBe(MAP_IDS.length);
  });

  it('到点先预告、再开始，事件编号和第几次都带上', () => {
    const w = quiet(createWorld({ seed: 4, mode: 'vigil', danger: 2, map: 'temple' }));
    const code = MAP_EVENT_KINDS.indexOf('bell');
    expect(at(w, MAP_EVENT_AT[1]! - MAP_EVENT_WARN).some((e) => e.type === Ev.MapEvent && e.a === 0 && e.b === code && e.c === 1)).toBe(true);
    expect(at(w, MAP_EVENT_AT[1]!).some((e) => e.type === Ev.MapEvent && e.a === 1 && e.b === code)).toBe(true);
  });

  it('白毛风把站着不动的人吹走，第二次反过来吹；实盘一样吹', () => {
    const drift = (k: number, live: boolean): number => {
      const w = quiet(createWorld({ seed: 4, mode: 'vigil', danger: 2, map: 'snow', ...(live ? { live } : {}) }));
      w.tick = MAP_EVENT_AT[k]! + 10;
      const x0 = w.x;
      for (let t = 0; t < 30; t++) step(w, 0, 0);
      return w.x - x0;
    };
    expect(drift(0, false)).toBeGreaterThan(10);
    expect(drift(1, false)).toBeLessThan(-10);
    // 实盘守夜也有地图事件（DESIGN 3.4、4.2：实盘系数按带事件的全量模拟拟合）；预告出了风也要吹
    expect(drift(0, true)).toBe(drift(0, false));
    expect(drift(1, true)).toBe(drift(1, false));
  });

  it('涨潮时水里走得更慢；实盘一样', () => {
    const walk = (live: boolean, tide: boolean): number => {
      const w = quiet(createWorld({ seed: 4, mode: 'vigil', danger: 2, map: 'riverbank', ...(live ? { live } : {}) }));
      const r = w.water[0]!;
      w.x = r.x + r.w / 2;
      w.y = r.y + r.h / 2;
      w.tick = tide ? MAP_EVENT_AT[0]! + 10 : MAP_EVENT_AT[0]! - 200;
      const x0 = w.x;
      const y0 = w.y;
      for (let t = 0; t < 6; t++) step(w, 1);
      return Math.abs(w.x - x0) + Math.abs(w.y - y0);
    };
    for (const live of [false, true]) expect(walk(live, true)).toBeLessThan(walk(live, false) * 0.95);
    expect(walk(true, true)).toBe(walk(false, true));
  });

  it('竹浪当场冒出一圈竹精；晨钟定住身边的怪', () => {
    const w = quiet(createWorld({ seed: 4, mode: 'vigil', danger: 2, map: 'bamboo' }));
    const before = alive(w);
    at(w, MAP_EVENT_AT[0]!);
    expect(alive(w) - before).toBeGreaterThanOrEqual(10);

    const t = quiet(createWorld({ seed: 4, mode: 'vigil', danger: 2, map: 'temple' }));
    const i = spawnNow(t, 'jiangshi', t.x + 200, t.y);
    at(t, MAP_EVENT_AT[0]!);
    expect(t.eBind[i]).toBeGreaterThan(t.tick);
  });

  it('夜探没有地图事件', () => {
    const w = quiet(createWorld({ seed: 4, mode: 'raid', danger: 2, raid: { template: 'guzhen' } }));
    expect(at(w, MAP_EVENT_AT[0]!).some((e) => e.type === Ev.MapEvent)).toBe(false);
  });
});
