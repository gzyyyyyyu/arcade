// 规则 66（DESIGN 3.3e、3.7）：小道士池加龙王令、笔走龙蛇共享给小道士；采药女满血回春转药香伤害；阴阳先生阴阳互换炸一圈。
// 娱乐和实盘同一版起；规则 65 的录像（夹具是规则 65 的代码录的）在新代码里逐位重放
import { describe, expect, it } from 'vitest';
import { createWorld, Ev, step, type Setup, type World } from '../../src/core/index.ts';
import { spawnNow } from '../../src/core/debug.ts';
import { CHAR_FX } from '../../src/content/meta.ts';
import { inPool, poolsFor } from '../../src/content/pools.ts';
import { MERGES, mergeFor } from '../../src/content/weapons.ts';
import { SKILLS } from '../../src/core/skills.ts';

const make = (o: Partial<Setup> = {}, rules?: number): World => createWorld({ seed: 7, mode: 'vigil', danger: 0, ...o }, rules);
const events = (w: World, type: number): number[][] => {
  const out: number[][] = [];
  const e = w.ev;
  for (let k = 0; k < e.n; k++) if (e.type[k] === type) out.push([e.x[k]!, e.y[k]!, e.a[k]!, e.b[k]!, e.c[k]!]);
  return out;
};

describe('规则 66：池和共享专属', () => {
  it('小道士池加龙王令，规则 62–65 的池没有；采药女的池不变', () => {
    expect(inPool('xiaodao', 'tide')).toBe(true);
    expect(inPool('xiaodao', 'tide', 62)).toBe(false);
    expect(poolsFor(66).caiyao).toEqual(poolsFor(62).caiyao);
    expect(poolsFor(66).xiaodao.weapons.length).toBe(poolsFor(62).xiaodao.weapons.length + 1);
    expect(make({ character: 'xiaodao' }).poolRules).toBe(66);
    expect(make({ character: 'xiaodao' }, 65).poolRules).toBe(62);
  });
  it('笔走龙蛇：规则 66 起剑侠、小道士都能合，之前只有剑侠', () => {
    const m = MERGES.find((x) => x.id === 'longshe')!;
    expect(mergeFor(m, 'xiaodao', (v) => v <= 66)).toBe(true);
    expect(mergeFor(m, 'jianxia', (v) => v <= 66)).toBe(true);
    expect(mergeFor(m, 'xiaodao', (v) => v <= 65)).toBe(false);
    expect(mergeFor(m, 'jianxia', (v) => v <= 65)).toBe(true);
    expect(mergeFor(m, 'yinyang', (v) => v <= 66)).toBe(false);
  });
});

describe('规则 66：采药女满血回春', () => {
  const cast = (hpFrac: number, rules?: number): number => {
    const w = make({ character: 'caiyao' }, rules);
    step(w, 0, -1);
    w.hp = w.stats.hpMax * hpFrac;
    step(w, 0, -1, 1);
    expect(w.skill.uses).toBe(1);
    return w.skill.store;
  };
  it('满血放：回不进去的血全换成药香伤害（千分比 1000 = 翻倍）；缺的血够回就不加；规则 65 不加', () => {
    expect(cast(1)).toBe(1000);
    expect(cast(0.5)).toBe(0);
    expect(cast(0.8)).toBe(Math.round((1000 * (0.35 - 0.2)) / 0.35));
    expect(cast(1, 65)).toBe(0);
  });
  it('药香圈每一下按倍数打，回春结束清零', () => {
    const run = (hpFrac: number): number => {
      const w = make({ character: 'caiyao' });
      step(w, 0, -1);
      w.hp = w.stats.hpMax * hpFrac;
      // 一只血厚的怪贴在身边，只比回春那一跳造成的掉血
      const i = spawnNow(w, 'jiangshi', w.x + 40, w.y);
      w.eHp[i] = 1e6;
      w.weapons.length = 0;
      step(w, 0, -1, 1);
      const before = w.eHp[i]!;
      for (let t = 0; t < 30; t++) step(w, 0, -1);
      return before - w.eHp[i]!;
    };
    expect(run(1)).toBeCloseTo(run(0.3) * 2, 6);
    const w = make({ character: 'caiyao' });
    step(w, 0, -1, 1);
    for (let t = 0; t < SKILLS.caiyao.dur + 2; t++) step(w, 0, -1);
    expect(w.skill.store).toBe(0);
  });
});

describe('规则 66：阴阳先生阴阳互换', () => {
  const setup = (rules?: number): { w: World; i: number } => {
    const w = make({ character: 'yinyang' }, rules);
    step(w, 0, -1);
    const i = spawnNow(w, 'jiangshi', w.x + 60, w.y);
    return { w, i };
  };
  it('阳变阴那一拍：身边的怪定住、发事件；20 秒内阴变阳不再炸，过了冷却再炸', () => {
    const { w, i } = setup();
    w.hp = w.stats.hpMax * 0.4;
    step(w, 0, -1);
    expect(w.eBind[i]!).toBeGreaterThanOrEqual(w.tick - 1 + CHAR_FX.yinyangFlipBind - 1);
    expect(events(w, Ev.SkillBeat).some((e) => e[2] === SKILLS.yinyang.code)).toBe(true);
    const next = w.flip.next;
    w.hp = w.stats.hpMax;
    step(w, 0, -1);
    expect(events(w, Ev.SkillBeat).some((e) => e[2] === SKILLS.yinyang.code)).toBe(false);
    expect(w.flip.next).toBe(next);
    for (let t = 0; t < CHAR_FX.yinyangFlipCd + 5 && w.tick < next; t++) {
      w.invuln = 1e9;
      w.hp = w.stats.hpMax;
      step(w, 0, w.phase === 'choose' ? 0 : -1);
    }
    expect(w.tick).toBeGreaterThanOrEqual(next);
    w.hp = w.stats.hpMax * 0.4;
    step(w, 0, -1);
    expect(events(w, Ev.SkillBeat).some((e) => e[2] === SKILLS.yinyang.code)).toBe(true);
  });
  it('规则 65 的局没有这一下，指纹也不多东西', () => {
    const { w, i } = setup(65);
    w.hp = w.stats.hpMax * 0.4;
    step(w, 0, -1);
    expect(w.eBind[i]!).toBeLessThan(w.tick);
    expect(w.flip.side).toBe(0);
  });
});
