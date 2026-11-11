import { describe, expect, it } from 'vitest';
import { MERGES, WEAPONS } from '../../src/content/weapons.ts';
import { createWorld, Ev, MAX_SHOTS, Shot, step, type World } from '../../src/core/index.ts';
import { grantWeapon, spawnNow } from '../../src/core/debug.ts';

/** 干净的场：只拿给定的法器，定点事件和补怪都关掉 */
function quiet(seed = 5): World {
  const w = createWorld({ seed, mode: 'vigil', danger: 2 });
  w.weapons.length = 0;
  w.wstats.length = 0;
  w.nextEvent = 1 << 30;
  w.spawnAcc = -1e9;
  return w;
}
const shots = (w: World, kind: number): number[] => {
  const out: number[] = [];
  for (let i = 0; i < MAX_SHOTS; i++) if (w.sAlive[i] && w.sKind[i] === kind) out.push(i);
  return out;
};
const run = (w: World, n: number, seen?: Set<string>): void => {
  for (let t = 0; t < n; t++) {
    step(w, 0, -1);
    w.hp = w.stats.hpMax;
    if (seen) for (let k = 0; k < w.ev.n; k++) if (w.ev.type[k] === Ev.Spring) seen.add(`${w.ev.a[k]}`);
  }
};
/** 一团打不死的怪（站在 (x, y) 附近） */
function mob(w: World, x: number, y: number, n: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const e = spawnNow(w, 'jiangshi', x + (k % 3) * 12, y + Math.floor(k / 3) * 12);
    w.eHp[e] = 1e6;
    w.eHpMax[e] = 1e6;
    w.eSpeed[e] = 0;
    out.push(e);
  }
  return out;
}

describe('水府', () => {
  it('登记：寒泉 水·灵（墨斗进化）、龙王令 水·灵（香炉进化）；双修雷雨 = 寒泉 + 雷符', () => {
    expect(WEAPONS.spring).toMatchObject({ el: '水', type: '灵' });
    expect(WEAPONS.tide).toMatchObject({ el: '水', type: '灵' });
    expect(WEAPONS.spring.evolve?.with).toBe('modou');
    expect(WEAPONS.tide.evolve?.with).toBe('xianglu');
    const m = MERGES.find((x) => x.id === 'leiyu')!;
    expect(m).toMatchObject({ a: 'spring', b: 'thunder', dual: true });
    // 双修要跨流派：类型、五行都不同
    expect(WEAPONS[m.a].type).not.toBe(WEAPONS[m.b].type);
    expect(WEAPONS[m.a].el).not.toBe(WEAPONS[m.b].el);
  });

  it('寒泉冒在怪堆里，泉里的怪挨打、减速；泉到点就干', () => {
    const w = quiet();
    grantWeapon(w, 'spring', 1);
    const es = mob(w, w.x + 200, w.y, 6);
    run(w, 10);
    const pools = shots(w, Shot.Spring);
    expect(pools.length).toBe(1);
    const p = pools[0]!;
    const gen = w.sGen[p];
    expect(Math.abs(w.sX[p]! - (w.x + 200))).toBeLessThan(40);
    run(w, 30);
    expect(es.some((e) => w.eHp[e]! < 1e6)).toBe(true);
    expect(es.some((e) => w.eSlow[e] !== 0)).toBe(true);
    run(w, WEAPONS.spring.base.duration);
    expect(w.sAlive[p] === 1 && w.sGen[p] === gen).toBe(false);
  });

  it('没有怪时不冒泉', () => {
    const w = quiet();
    grantWeapon(w, 'spring', 1);
    run(w, 60);
    expect(shots(w, Shot.Spring).length).toBe(0);
  });

  it('玄冥寒潭：潭里减速一半（记 2），潭干时炸开（事件 a = 1）', () => {
    const w = quiet();
    grantWeapon(w, 'spring', 8, true);
    const es = mob(w, w.x + 200, w.y, 6);
    const seen = new Set<string>();
    run(w, 12, seen);
    expect(es.some((e) => w.eSlow[e] === 2)).toBe(true);
    run(w, WEAPONS.spring.evolve!.stats.duration * 2, seen);
    expect(seen.has('1')).toBe(true);
  });

  it('龙王令的浪朝怪推过去，把怪往外带', () => {
    const w = quiet();
    grantWeapon(w, 'tide', 1);
    const e = spawnNow(w, 'jiangshi', w.x + 120, w.y + 10);
    w.eHp[e] = 1e6;
    w.eSpeed[e] = 0;
    const x0 = w.eX[e]!;
    run(w, 10);
    expect(shots(w, Shot.Tide).length).toBe(1);
    run(w, 40);
    expect(w.eHp[e]!).toBeLessThan(1e6);
    // 带怪的力度只有浪速的一成多，僵尸还扛推（steady 0.3）：被带出去一小段
    expect(w.eX[e]!).toBeGreaterThan(x0 + 6);
  });

  it('翻江倒海：浪走到头卷回来，回到主角身边收掉', () => {
    const w = quiet();
    grantWeapon(w, 'tide', 8, true);
    const e = spawnNow(w, 'jiangshi', w.x + 150, w.y);
    w.eHp[e] = 1e6;
    w.eSpeed[e] = 0;
    run(w, 10);
    const n = shots(w, Shot.Tide).length;
    expect(n).toBe(WEAPONS.tide.evolve!.stats.amount);
    let back = false;
    for (let t = 0; t < WEAPONS.tide.evolve!.stats.duration + 10; t++) {
      run(w, 1);
      if (shots(w, Shot.Tide).some((i) => w.sState[i] === 1)) back = true;
    }
    expect(back).toBe(true);
  });

  it('雷雨：雷先劈泉里的怪，电顺着泉水传开（事件 a = 2）', () => {
    const w = quiet();
    grantWeapon(w, 'spring', 8, true);
    grantWeapon(w, 'thunder', 8);
    w.merges.push('leiyu');
    mob(w, w.x + 200, w.y, 6);
    const seen = new Set<string>();
    run(w, WEAPONS.thunder.base.cd * 3, seen);
    expect(seen.has('2')).toBe(true);
  });
});
