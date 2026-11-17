// 规则 62（DESIGN 3.3e）：法器池换件、五个新搭配、阴阳先生阴时定身更久。实盘从规则 64 起有；规则 63 以前开的实盘局和规则 61 逐位一致
import { describe, expect, it } from 'vitest';
import { CHARACTER_POOLS, POOLS_BEFORE_62 } from '../../src/content/pools.ts';
import { LIVE_CHAR_IDS } from '../../src/content/live.ts';
import { CHAR_FX } from '../../src/content/meta.ts';
import { MERGES, WEAPONS, type MergeDef, type WeaponId } from '../../src/content/weapons.ts';
import { ArmEv, ArmFx } from '../../src/core/arms/events.ts';
import { grantWeapon, openChestNow, spawnNow } from '../../src/core/debug.ts';
import { createWorld, fingerprint, Pick, step, type Choice, type Setup, type World } from '../../src/core/index.ts';
import { liveSetup } from '../../src/platform/live.ts';
import { mergeHint } from '../../src/view/ui/mergeHint.ts';

const NEW = MERGES.filter((m) => m.since === 62);
const FX: Record<string, number> = { jianzou: ArmFx.Jianzou, longshe: ArmFx.Longshe, panzhen: ArmFx.Panzhen, suohun: ArmFx.Suohun, hanzhong: ArmFx.Hanzhong };
const WHO: Record<string, string> = { jianzou: 'jianxia', longshe: 'jianxia', panzhen: 'yinyang', suohun: 'yinyang', hanzhong: 'pang' };

/** 给齐料、开宝箱合上，主角四周两圈打不死的怪（和 combos-effect 同一个摆法） */
function merged(c: string, m: MergeDef, rules?: number, live = false): World {
  const w = createWorld({ seed: 11, mode: 'vigil', danger: 2, character: c as never, ...(live ? { live } : {}) } as Setup, rules);
  w.weapons.length = 0;
  w.wstats.length = 0;
  // 双修只要一件进化
  grantWeapon(w, m.a, 8, true);
  grantWeapon(w, m.b, 8, false);
  openChestNow(w);
  for (let k = 0; k < 24; k++) {
    const r = k < 8 ? 40 : 160;
    const e = spawnNow(w, 'jiangshi', w.x + ((k % 8 < 4 ? r : -r) * ((k % 4) + 1)) / 4, w.y + ((k % 2 ? r : -r) * (((k + 1) % 4) + 1)) / 4);
    w.eHp[e] = 1e7;
    w.eHpMax[e] = 1e7;
  }
  return w;
}

/** 跑 n 拍，数某种搭配特效出了几次 */
function count(w: World, n: number, fx: number, kill = false): number {
  let got = 0;
  for (let t = 0; t < n; t++) {
    // 锁魂幡要怪死：每拍把一只被锁过的怪打到只剩一口
    if (kill) for (let i = 0; i < w.arms.souled.length; i++) if (w.arms.souled[i] && w.eHp[i]! > 1) w.eHp[i] = 1;
    step(w, 0, w.phase === 'choose' ? 0 : -1);
    w.hp = w.stats.hpMax;
    for (let q = 0; q < w.ev.n; q++) if ((w.ev.type[q] as number) === ArmEv.Combo && w.ev.a[q] === fx) got++;
  }
  return got;
}

describe('规则 62：新搭配', () => {
  it('五个新搭配接在 MERGES 末尾，都是双修', () => {
    expect(NEW.map((m) => m.id)).toEqual(['jianzou', 'longshe', 'panzhen', 'suohun', 'hanzhong']);
    expect(MERGES.slice(-NEW.length)).toEqual(NEW);
    for (const m of NEW) expect(m.dual, m.id).toBe(true);
  });

  for (const m of NEW) {
    it(`${m.name}：合上就出手（实盘也是）；规则 61、规则 63 开的实盘局合不上`, () => {
      const c = WHO[m.id]!;
      const w = merged(c, m);
      expect(w.merges).toEqual([m.id]);
      expect(count(w, 60 * 30, FX[m.id]!, m.id === 'suohun'), m.id).toBeGreaterThan(0);
      expect(merged(c, m, 61).merges).toEqual([]);
      expect(merged(c, m, undefined, true).merges).toEqual([m.id]);
      expect(merged(c, m, 63, true).merges).toEqual([]);
    });
  }

  it('锁魂幡：被锁拉过的怪死了变冤魂，比不合的多', () => {
    const m = NEW.find((x) => x.id === 'suohun')!;
    const ghosts = (keep: boolean): number => {
      const w = merged('yinyang', m);
      if (!keep) w.merges.length = 0;
      let n = 0;
      for (let t = 0; t < 60 * 30; t++) {
        for (let i = 0; i < w.arms.souled.length; i++) if (w.eAlive[i] && w.arms.souled[i] && w.eHp[i]! > 1) w.eHp[i] = 1;
        step(w, 0, w.phase === 'choose' ? 0 : -1);
        w.hp = w.stats.hpMax;
        for (let q = 0; q < w.ev.n; q++) if ((w.ev.type[q] as number) === ArmEv.Ghost) n++;
      }
      return n;
    };
    expect(ghosts(true)).toBeGreaterThan(ghosts(false));
  });
});

describe('规则 62：法器池', () => {
  it('现行按新池，规则 61 按老池；每件法器仍至少在 2 个池里', () => {
    expect(CHARACTER_POOLS.jianxia.weapons).toContain('shield');
    expect(POOLS_BEFORE_62.jianxia.weapons).not.toContain('shield');
    expect(CHARACTER_POOLS.yinyang.weapons).not.toContain('sword');
    expect(CHARACTER_POOLS.yinyang.weapons).toContain('gourd');
    expect(CHARACTER_POOLS.zhijiang.weapons).not.toContain('lamp');
    for (const id of Object.keys(WEAPONS)) {
      const n = Object.values(CHARACTER_POOLS).filter((p) => p.weapons.includes(id as WeaponId)).length;
      expect(n, id).toBeGreaterThanOrEqual(2);
    }
  });

  /** 剑侠一直刷卡，看抽不抽得到金钟罩 */
  const drawsShield = (s: Setup, rules?: number): boolean => {
    const w = createWorld(s, rules);
    for (let t = 0; t < 3000 && w.phase !== 'choose'; t++) {
      w.invuln = 1e9;
      step(w, t % 8, -1);
    }
    for (let k = 0; k < 300; k++) {
      if (w.choices.some((c: Choice) => c.id === 'shield')) return true;
      w.rerolls = 1;
      step(w, 0, Pick.Reroll);
    }
    return false;
  };
  it('剑侠：现行（娱乐、实盘）抽得到金钟罩，规则 61 和规则 63 开的实盘局抽不到', () => {
    const fun: Setup = { seed: 3, mode: 'vigil', danger: 0, character: 'jianxia' };
    expect(drawsShield(fun)).toBe(true);
    expect(drawsShield(fun, 61)).toBe(false);
    expect(drawsShield(liveSetup('small', 3, undefined, 'jianxia'))).toBe(true);
    expect(drawsShield(liveSetup('small', 3, undefined, 'jianxia'), 63)).toBe(false);
  });

  it('规则 63 开的实盘局的合成提示不提新搭配', () => {
    const w = createWorld(liveSetup('medium', 3, undefined, 'jianxia'), 63);
    grantWeapon(w, 'flysword', 8, true);
    expect(mergeHint(w, { kind: 'weapon', id: 'dart' })?.id).not.toBe('jianzou');
    // 规则 62 的一步合（规则 63 的两段式提示另见 merge-hint.test.ts）
    const fun = createWorld({ seed: 3, mode: 'vigil', danger: 0, character: 'jianxia' }, 62);
    grantWeapon(fun, 'flysword', 8, true);
    grantWeapon(fun, 'dart', 7);
    expect(mergeHint(fun, { kind: 'weapon', id: 'dart' })?.id).toBe('jianzou');
  });
});

describe('规则 62：阴阳先生', () => {
  /** 捆一只怪，量定住几拍 */
  const bound = (yin: boolean, rules?: number): number => {
    const w = createWorld({ seed: 2, mode: 'vigil', danger: 0, character: 'yinyang' }, rules);
    w.weapons.length = 0;
    w.wstats.length = 0;
    grantWeapon(w, 'rope', 1);
    w.nextEvent = 1e9;
    w.spawnAcc = -1e9;
    if (yin) w.hp = 1;
    const e = spawnNow(w, 'jiangshi', w.x + 60, w.y);
    w.eHp[e] = 1e7;
    for (let t = 0; t < 120 && w.eBind[e]! <= w.tick; t++) {
      w.invuln = 1e9;
      step(w, -1, -1);
    }
    return w.eBind[e]! - w.tick;
  };
  it('阴时捆得更久，阳和规则 61 照旧', () => {
    expect(bound(true) - bound(false)).toBe(CHAR_FX.yinyangBind);
    expect(bound(true, 61)).toBe(bound(false, 61));
  });
});

describe('规则 62：旧实盘局逐位不变', () => {
  it('规则 63 开的实盘局（全部角色，第一、第二起手）一直按技能跑 4 分钟，和规则 61 一样', () => {
    for (const c of LIVE_CHAR_IDS) {
      for (const startAlt of [false, true]) {
        const run = (rules?: number): number => {
          const w = createWorld(liveSetup('medium', 7, undefined, c, 'snow', startAlt ? { startAlt } : {}), rules);
          for (let t = 0; t < 7200 && w.phase !== 'over'; t++) step(w, Math.floor(t / 45) % 8, w.phase === 'choose' ? t % 3 : -1, 1);
          return fingerprint(w);
        };
        expect(run(63), `${c} ${startAlt}`).toBe(run(61));
      }
    }
  }, 120_000);
});
