/** 共用电脑名册（personas.ts）：名册的形状、这一手的性格（换打法、手感、上头）确定且有界、按权重挑人、头像 */
import { describe, expect, it } from 'vitest';
import { type PersonaCtx, ROSTER, SWITCH_WINDOW, TRAIT_KEYS, personaFace, personById, pickLineup, traitsNow } from '../src/personas.ts';
import { type Entropy, stream } from '../src/rng.ts';

const SEED: Entropy = [1, 2, 3, 4, 5, 6, 7, 8];
const CALM: PersonaCtx = { hand: 0, form: 0, tiltNow: 0, lossRun: 0, lead: 0, targeted: 0, tableLoose: 0 };

describe('名册', () => {
  it('16 个人，id、名字都不重复；性格都是 0–100 的整数；换打法只写性格里的项', () => {
    expect(ROSTER).toHaveLength(16);
    expect(new Set(ROSTER.map((p) => p.id)).size).toBe(16);
    expect(new Set(ROSTER.map((p) => p.name)).size).toBe(16);
    for (const p of ROSTER) {
      for (const k of TRAIT_KEYS) expect(Number.isInteger(p.traits[k]) && p.traits[k] >= 0 && p.traits[k] <= 100, `${p.id}.${k}`).toBe(true);
      for (const [k, v] of Object.entries(p.alt)) {
        expect(TRAIT_KEYS as readonly string[]).toContain(k);
        expect(Number.isInteger(v) && v >= 0 && v <= 100).toBe(true);
      }
      expect(p.catchphrases.length).toBeGreaterThan(0);
      // 会换打法的人要写换成什么；不换的人不写
      expect(p.switchOn.length > 0).toBe(Object.keys(p.alt).length > 0);
    }
  });

  it('每档都有人；高手档至少 3 个（高档轮换不只两张脸）', () => {
    for (const lv of [0, 1, 2, 3, 4]) expect(ROSTER.some((p) => p.level === lv)).toBe(true);
    expect(ROSTER.filter((p) => p.level === 4).length).toBeGreaterThanOrEqual(3);
  });

  it('personById 认得每个人，认不得的抛错', () => {
    for (const p of ROSTER) expect(personById(p.id)).toBe(p);
    expect(() => personById('nobody')).toThrow();
  });
});

describe('这一手的性格 traitsNow', () => {
  it('风平浪静时就是底子', () => {
    for (const p of ROSTER.filter((x) => !x.switchOn.includes('rhythm'))) expect(traitsNow(p, CALM, SEED)).toEqual({ traits: p.traits, mode: 'base', why: null });
  });

  it('同种子同输入同输出；同一段（SWITCH_WINDOW 手）里换不换一致', () => {
    const p = personById('suanpan');
    for (let h = 0; h < 60; h++) {
      const a = traitsNow(p, { ...CALM, hand: h }, SEED);
      expect(traitsNow(p, { ...CALM, hand: h }, SEED)).toEqual(a);
      const first = traitsNow(p, { ...CALM, hand: Math.floor(h / SWITCH_WINDOW) * SWITCH_WINDOW }, SEED);
      expect(a.mode).toBe(first.mode);
    }
  });

  it('触发条件满足时按变招概率换打法：只改 alt 写了的项，原因写明；条件不满足不换', () => {
    const p = personById('aqiang');
    const losing = { ...CALM, lossRun: 3 };
    let alts = 0;
    for (let h = 0; h < 2000 * SWITCH_WINDOW; h += SWITCH_WINDOW) {
      const r = traitsNow(p, { ...losing, hand: h }, SEED);
      if (r.mode === 'alt') {
        alts++;
        expect(r.why).toBe('losing');
        expect(r.traits).toEqual({ ...p.traits, ...p.alt });
      }
      expect(traitsNow(p, { ...CALM, hand: h }, SEED).mode).toBe('base');
    }
    // 变招 25：2000 段里约 500 段换
    expect(alts).toBeGreaterThan(400);
    expect(alts).toBeLessThan(600);
  });

  it('不会换打法的人（板凳儿）永远是底子', () => {
    const p = personById('bandeng');
    for (let h = 0; h < 200; h += SWITCH_WINDOW) expect(traitsNow(p, { ...CALM, hand: h, lossRun: 9, targeted: 9, tableLoose: 100, lead: -100 }, SEED).mode).toBe('base');
  });

  it('手感好更敢、上头更莽更粗心；结果都夹在 0–100', () => {
    const p = personById('tutou');
    const hot = traitsNow(p, { ...CALM, form: 100 }, SEED).traits;
    const cold = traitsNow(p, { ...CALM, form: -100 }, SEED).traits;
    expect(hot.aggr).toBeGreaterThan(cold.aggr);
    expect(hot.care).toBeGreaterThan(cold.care);
    const tilted = traitsNow(p, { ...CALM, tiltNow: 100 }, SEED).traits;
    expect(tilted.aggr).toBeGreaterThan(p.traits.aggr);
    expect(tilted.care).toBeLessThan(p.traits.care);
    expect(traitsNow(personById('xiaomei'), { ...CALM, tiltNow: 100 }, SEED).traits).toEqual(personById('xiaomei').traits);
    for (const q of ROSTER)
      for (const ctx of [{ ...CALM, form: 100, tiltNow: 100, lossRun: 9, targeted: 9, tableLoose: 100, lead: -100 }, { ...CALM, form: -100, lead: 100 }]) {
        const r = traitsNow(q, ctx, SEED).traits;
        for (const k of TRAIT_KEYS) expect(r[k] >= 0 && r[k] <= 100 && Number.isInteger(r[k])).toBe(true);
      }
  });
});

describe('按权重挑人 pickLineup', () => {
  it('挑出不重复的人，权重 0 和没写的不挑；同一条流结果一样', () => {
    const w = { laozhang: 3, xiaomei: 1, aqiang: 2, bandeng: 0 };
    for (let i = 0; i < 50; i++) {
      const got = pickLineup(stream(SEED, 'lineup', i), w, 3);
      expect(new Set(got).size).toBe(3);
      expect(got).not.toContain('bandeng');
      expect(pickLineup(stream(SEED, 'lineup', i), w, 3)).toEqual(got);
    }
  });

  it('权重大的更常被挑到第一个', () => {
    const w = { laozhang: 9, xiaomei: 1 };
    let first = 0;
    for (let i = 0; i < 1000; i++) if (pickLineup(stream(SEED, 'lineup2', i), w, 1)[0] === 'laozhang') first++;
    expect(first).toBeGreaterThan(850);
  });

  it('人不够抛错（场地表要给够人）', () => {
    expect(() => pickLineup(stream(SEED, 'x'), { laozhang: 1 }, 2)).toThrow();
  });
});

describe('头像 personaFace', () => {
  it('每个人每种表情都是独立的 SVG 字符串，不引外部资源', () => {
    for (const p of ROSTER)
      for (const mood of ['normal', 'happy', 'sad', 'angry'] as const) {
        const s = personaFace(p.id, mood);
        expect(s.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"')).toBe(true);
        expect(s).not.toMatch(/href|url\(|<image|<script/);
      }
    expect(personaFace('laozhang', 'happy')).not.toBe(personaFace('laozhang', 'sad'));
    expect(personaFace('laozhang')).not.toBe(personaFace('xiaomei'));
  });
});
