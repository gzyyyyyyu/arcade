import { describe as group, expect, it } from 'vitest';
import { WEAPON_IDS, PASSIVE_IDS } from '../../src/content/weapons.ts';
import { createWorld, Pick, rushRoute, step, type World } from '../../src/core/index.ts';
import { describe } from '../../src/view/ui/cards.ts';

/** 放逐掉所有法器和被动：连战卡池抽空，核心只能发铜钱卡（rush-flow drawCard） */
function emptyPool(seed: number): World {
  const w = createWorld({ seed, mode: 'vigil', danger: 2, rush: true });
  w.banned.push(...WEAPON_IDS, ...PASSIVE_IDS);
  return w;
}

group('连战：卡池抽空发铜钱卡，画面不崩', () => {
  it('商店的卡格是铜钱卡，describe 不崩', () => {
    let seed = 1;
    let path = -1;
    for (; seed < 500 && path < 0; seed++) path = rushRoute(seed).layers[0]!.findIndex((o) => o.stop === 'shop');
    const w = emptyPool(seed - 1);
    step(w, 0, Pick.Route + path);
    expect(w.stop).toBe('shop');
    const cards = w.stopGoods.filter((g) => g.kind === 'card');
    expect(cards.length).toBeGreaterThan(0);
    for (const g of cards) {
      expect(g.card!.kind).toBe('coins');
      expect(() => describe(w, g.card!)).not.toThrow();
    }
  });

  it('过关选卡、重抽：一手全是铜钱卡，describe 不崩', () => {
    const w = emptyPool(9);
    let guard = 0;
    while (!(w.phase === 'choose' && w.menu === 'cards') && guard++ < 3000) {
      if (w.phase === 'choose') step(w, 0, w.menu === 'route' ? Pick.Route : Pick.Leave);
      else {
        w.hp = w.stats.hpMax;
        for (let i = 0; i < w.eRush.length; i++) if (w.eRush[i] && w.eAlive[i]) w.eHp[i] = Math.min(w.eHp[i]!, 1);
        step(w, 1 + ((guard >> 4) % 32), -1);
      }
    }
    expect(w.menu).toBe('cards');
    for (const c of w.choices) expect(() => describe(w, c)).not.toThrow();
    expect(w.choices.every((c) => c.kind === 'coins')).toBe(true);
    w.rerolls = Math.max(1, w.rerolls);
    step(w, 0, Pick.Reroll);
    for (const c of w.choices) expect(() => describe(w, c)).not.toThrow();
  });
});
