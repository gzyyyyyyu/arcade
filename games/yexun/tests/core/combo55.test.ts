import { describe, expect, it } from 'vitest';
import { COMBO55, MERGES, mergeFor, type WeaponId } from '../../src/content/weapons.ts';
import { armsHitMul, ArmEv, ArmFx } from '../../src/core/arms/index.ts';
import { grantWeapon, openChestNow, spawnNow } from '../../src/core/debug.ts';
import { createWorld, Ev, RULES_VERSION, step, type World } from '../../src/core/index.ts';

// 规则 55 的新搭配和招魂幡自己招魂：55 才有，54（旧录像）不出、不发生
const NEW = ['fuhuo', 'linfu', 'lingyan', 'zhonggu'] as const;

function quiet(character: string, rules?: number): World {
  const w = createWorld({ seed: 5, mode: 'vigil', danger: 2, character: character as never }, rules);
  w.weapons.length = 0;
  w.wstats.length = 0;
  w.nextEvent = 1 << 30;
  w.spawnAcc = -1e9;
  return w;
}
const hold = (w: World, ids: WeaponId[], evolved = false): void => {
  for (const id of ids) grantWeapon(w, id, 8, evolved);
};
function mob(w: World, x: number, y: number, n: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const e = spawnNow(w, 'jiangshi', x + (k % 3) * 14, y + Math.floor(k / 3) * 14);
    w.eHp[e] = 1e6;
    w.eHpMax[e] = 1e6;
    out.push(e);
  }
  return out;
}
function run(w: World, n: number): Map<string, number> {
  const seen = new Map<string, number>();
  for (let t = 0; t < n; t++) {
    step(w, 0, -1);
    w.hp = w.stats.hpMax;
    for (let k = 0; k < w.ev.n; k++) {
      const key = `${w.ev.type[k]}:${w.ev.a[k]}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  return seen;
}
const count = (seen: Map<string, number>, type: number, a: number): number => seen.get(`${type}:${a}`) ?? 0;

describe('规则 55 的搭配', () => {
  it('新搭配都标了 since 55，规则 54 的世界里不能合、55 能合', () => {
    expect(RULES_VERSION).toBeGreaterThanOrEqual(55);
    for (const id of NEW) {
      const m = MERGES.find((x) => x.id === id)!;
      expect(m.since, id).toBe(55);
      const who = m.only?.split(',')[0] ?? 'xiaodao';
      const old = createWorld({ seed: 1, mode: 'vigil', danger: 0, character: who as never }, 54);
      const now = createWorld({ seed: 1, mode: 'vigil', danger: 0, character: who as never });
      expect(mergeFor(m, who, (v) => old.rulesFrom(v)), `${id} 54`).toBe(false);
      expect(mergeFor(m, who, (v) => now.rulesFrom(v)), `${id} 55`).toBe(true);
      for (const w of [old, now]) {
        w.weapons.length = 0;
        w.wstats.length = 0;
        hold(w, [m.a, m.b], true);
        openChestNow(w);
      }
      expect(old.merges, `${id} 54 宝箱`).not.toContain(id);
      expect(now.merges, `${id} 55 宝箱`).toContain(id);
    }
  });

  it('专属：钟鼓齐鸣只给纸匠和阴阳先生，符火燎原、铃符、铃焰人人能合', () => {
    const ok = (id: string, ch: string): boolean => mergeFor(MERGES.find((m) => m.id === id)!, ch, () => true);
    expect(['zhijiang', 'yinyang', 'xiaodao'].map((c) => ok('zhonggu', c))).toEqual([true, true, false]);
    for (const id of ['fuhuo', 'linfu', 'lingyan']) expect(['zhijiang', 'yinyang', 'xiaodao', 'gengfu'].every((c) => ok(id, c)), id).toBe(true);
  });

  it('铃符 / 铃焰：铃一响各自出手', () => {
    const t = quiet('gengfu');
    t.merges.push('linfu');
    hold(t, ['talisman', 'bell']);
    t.weapons.find((o) => o.id === 'talisman')!.timer = 1e9;
    mob(t, t.x + 30, t.y, 3);
    expect(count(run(t, 60), ArmEv.Combo, ArmFx.Linfu)).toBeGreaterThan(0);

    const y = quiet('gengfu');
    y.merges.push('lingyan');
    hold(y, ['gourd', 'bell']);
    y.weapons.find((o) => o.id === 'gourd')!.timer = 1e9;
    mob(y, y.x + 30, y.y, 3);
    const seen = run(y, 90);
    expect(count(seen, ArmEv.Combo, ArmFx.Lingyan)).toBeGreaterThan(0);
    expect(count(seen, Ev.Burn, 0)).toBeGreaterThan(0);
  });

  it('钟鼓齐鸣：站在方阵里铃一响，光环里的怪挨打 +40%', () => {
    const w = quiet('yinyang');
    w.merges.push('zhonggu');
    hold(w, ['flag', 'bell']);
    const es = mob(w, w.x + 30, w.y, 3);
    const seen = run(w, 120);
    expect(count(seen, ArmEv.Combo, ArmFx.Zhonggu)).toBeGreaterThan(0);
    expect(es.some((e) => w.eAlive[e] && armsHitMul(w, e) >= COMBO55.zhonggu.mul)).toBe(true);
  });

  it('符火燎原：每放一次符，怪脚下烧起一摊火', () => {
    const w = quiet('gengfu');
    w.merges.push('fuhuo');
    hold(w, ['talisman', 'gourd']);
    w.weapons.find((o) => o.id === 'gourd')!.timer = 1e9;
    mob(w, w.x + 120, w.y, 3);
    const seen = run(w, 120);
    expect(count(seen, ArmEv.Combo, ArmFx.Fuhuo)).toBeGreaterThan(0);
    expect(count(seen, Ev.Burn, 0)).toBeGreaterThan(0);
  });
});

describe('招魂幡自己招魂（规则 55）', () => {
  const ghosts = (rules?: number, withBell = false): number => {
    const w = quiet('zhijiang', rules);
    hold(w, ['banner']);
    if (withBell) hold(w, ['bell']);
    w.weapons.find((o) => o.id === 'bell')?.timer && (w.weapons.find((o) => o.id === 'bell')!.timer = 1e9);
    mob(w, w.x + 150, w.y, 2);
    let spawned = 0;
    for (let t = 0; t < 450; t++) {
      step(w, 0, -1);
      w.hp = w.stats.hpMax;
      for (let k = 0; k < w.ev.n; k++) if (w.ev.type[k] === ArmEv.Ghost && w.ev.a[k] === 0) spawned++;
    }
    return spawned;
  };
  it('没有击杀也隔几秒招一个冤魂；规则 54 不发生', () => {
    expect(ghosts()).toBeGreaterThan(0);
    expect(ghosts(54)).toBe(0);
  });
  it('带着镇魂铃时招得很稀', () => {
    expect(ghosts(undefined, true)).toBeLessThan(ghosts());
  });
});
