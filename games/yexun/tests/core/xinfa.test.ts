// 心法特色（DESIGN 3.7、content/xinfa.ts）：条件满足才加、只加本流派的法器、受伤减免
import { describe, expect, it } from 'vitest';
import { XINFA_FX } from '../../src/content/xinfa.ts';
import { createWorld, type Setup, type World } from '../../src/core/index.ts';
import { xinfaCoin, xinfaHitMul, xinfaHurtMul, xinfaOnKill } from '../../src/core/xinfa.ts';

const make = (o: Partial<Setup>): World => createWorld({ seed: 7, mode: 'vigil', danger: 0, ...o });
/** 在 (x, y) 放一只活着的怪，返回槽位 */
function foe(w: World, x: number, y: number, slot = 0): number {
  w.eAlive[slot] = 1;
  w.eX[slot] = x;
  w.eY[slot] = y;
  return slot;
}

describe('心法特色', () => {
  it('不带心法、别的流派的法器、没记功的一下都是 1', () => {
    const w = make({ character: 'xiaodao' });
    expect(xinfaHitMul(w, 'sword', foe(w, w.x, w.y))).toBe(1);
    const s = make({ character: 'xiaodao', xinfa: 'sword' });
    const i = foe(s, s.x + 10, s.y);
    expect(xinfaHitMul(s, 'gourd', i)).toBe(1);
    expect(xinfaHitMul(s, undefined, i)).toBe(1);
    expect(xinfaHurtMul(w)).toBe(1);
  });

  it('剑意：近身的怪加、远的不加', () => {
    const w = make({ character: 'xiaodao', xinfa: 'sword' });
    expect(xinfaHitMul(w, 'sword', foe(w, w.x + XINFA_FX.sword.near - 1, w.y, 0))).toBe(XINFA_FX.sword.mul);
    expect(xinfaHitMul(w, 'sword', foe(w, w.x + XINFA_FX.sword.near + 1, w.y, 1))).toBe(1);
  });

  it('不动如山：站定够拍数才加伤害、减受伤', () => {
    const w = make({ character: 'pang', xinfa: 'ward' });
    const i = foe(w, w.x + 50, w.y);
    w.xf.still = XINFA_FX.ward.still - 1;
    expect(xinfaHitMul(w, 'bell', i)).toBe(1);
    expect(xinfaHurtMul(w)).toBe(1);
    w.xf.still = XINFA_FX.ward.still;
    expect(xinfaHitMul(w, 'bell', i)).toBe(XINFA_FX.ward.mul);
    expect(xinfaHurtMul(w)).toBe(XINFA_FX.ward.hurt);
  });

  it('水府打被拖慢的怪、幽冥残血才加', () => {
    const w = make({ character: 'jianxia', xinfa: 'water' });
    const i = foe(w, w.x + 50, w.y);
    expect(xinfaHitMul(w, 'spring', i)).toBe(1);
    w.eSlow[i] = 3;
    expect(xinfaHitMul(w, 'spring', i)).toBe(XINFA_FX.water.mul);
    const g = make({ character: 'zhijiang', xinfa: 'ghost' });
    const j = foe(g, g.x + 50, g.y);
    expect(xinfaHitMul(g, 'banner', j)).toBe(1);
    g.hp = g.stats.hpMax * XINFA_FX.ghost.hp;
    expect(xinfaHitMul(g, 'banner', j)).toBe(XINFA_FX.ghost.mul);
  });

  it('财运按捡的铜钱叠层、有上限；同袍按纸兵数减受伤、有上限', () => {
    const w = make({ character: 'huolang', xinfa: 'wealth' });
    const i = foe(w, w.x + 50, w.y);
    xinfaCoin(w, 3);
    expect(xinfaHitMul(w, 'dart', i)).toBeCloseTo(1 + 3 * XINFA_FX.wealth.step, 12);
    xinfaCoin(w, 100);
    expect(w.xf.stack).toBe(XINFA_FX.wealth.max);
    const p = make({ character: 'zhijiang', xinfa: 'paper' });
    p.xf.papers = 2;
    expect(xinfaHurtMul(p)).toBeCloseTo(1 - 2 * XINFA_FX.paper.step, 12);
    p.xf.papers = 50;
    expect(xinfaHurtMul(p)).toBeCloseTo(1 - XINFA_FX.paper.max, 12);
  });

  it('燎原只记本流派打倒的怪', () => {
    const w = make({ character: 'fushi', xinfa: 'fire' });
    xinfaOnKill(w, 'sword', 0, 0, 100);
    expect(w.xf.splash).toEqual([0, 0, Math.round(100 * XINFA_FX.fire.share)]);
    xinfaOnKill(w, 'spring', 0, 0, 100);
    expect(w.xf.splash.length).toBe(3);
  });

  it('每个流派都有特色文字', async () => {
    const { SCHOOL_IDS } = await import('../../src/content/guide.ts');
    const { XINFA_TEXT } = await import('../../src/content/xinfa.ts');
    for (const s of SCHOOL_IDS) expect(XINFA_TEXT[s].text.length).toBeGreaterThan(0);
  });
});
