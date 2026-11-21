// 选卡（DESIGN 3.9）：心法保底、主修进化多补刷新、缘分、夜市求签和「法器 +1 级」升最近的那件
import { describe, expect, it } from 'vitest';
import { createWorld, Pick, step, type Choice, type Setup, type World } from '../../src/core/index.ts';
import { grantWeapon, openChestNow } from '../../src/core/debug.ts';
import { SCHOOLS } from '../../src/content/guide.ts';
import { MARKET_GOODS, NIGHT_MARKET } from '../../src/content/market.ts';
import { MAX_WEAPON_LEVEL, MERGES, WEAPONS, type PassiveId, type WeaponId } from '../../src/content/weapons.ts';
import { PICKS } from '../../src/content/picks.ts';

const make = (o: Partial<Setup> = {}): World => createWorld({ seed: 31, mode: 'vigil', danger: 0, ...o });

/** 走到第一次升级的选卡上（主角无敌） */
function toChoose(w: World): void {
  for (let t = 0; t < 3000 && w.phase !== 'choose'; t++) {
    w.invuln = 1e9;
    step(w, t % 8, -1);
  }
  expect(w.phase).toBe('choose');
}

/** 在同一次选卡上连刷 n 次，收集每一手三选一 */
function draws(w: World, n: number): Choice[][] {
  const out: Choice[][] = [w.choices.slice()];
  for (let k = 1; k < n; k++) {
    w.rerolls = 1;
    step(w, 0, Pick.Reroll);
    out.push(w.choices.slice());
  }
  return out;
}

const inSchool = (school: keyof typeof SCHOOLS) => (c: Choice): boolean => {
  const s = SCHOOLS[school];
  return c.kind === 'weapon' ? s.weapons.includes(c.id as WeaponId) : c.kind === 'passive' && s.passives.includes(c.id as PassiveId);
};

describe('选卡', () => {
  it('心法保底：每一手三选一里至少一张主修流派的卡', () => {
    const now = make({ character: 'fushi', xinfa: 'fire' });
    toChoose(now);
    expect(draws(now, 200).every((h) => h.some(inSchool('fire')))).toBe(true);
  });

  it('缘分：手上有搭配的一件料，另一件料更常出', () => {
    // 小道士起手桃木剑：诛邪剑阵的另一件是飞剑；对照把手上的法器拿空
    const count = (hold: boolean): number => {
      const w = make({ character: 'xiaodao' });
      toChoose(w);
      if (!hold) {
        w.weapons.length = 0;
        w.wstats.length = 0;
      }
      return draws(w, 400).filter((h) => h.some((c) => c.id === 'flysword')).length;
    };
    expect(count(true)).toBeGreaterThan(count(false));
  });

  it('主修单子上的法器进化多补一次刷新，别的法器进化照旧补一次', () => {
    const evolve = (xinfa: Setup['xinfa'] | undefined): number => {
      const w = make({ character: 'xiaodao', ...(xinfa ? { xinfa } : {}) });
      w.rerolls = 0;
      grantWeapon(w, 'sword', MAX_WEAPON_LEVEL);
      w.passives[WEAPONS.sword.evolve!.with] = 1;
      openChestNow(w);
      expect(w.weapons.find((o) => o.id === 'sword')!.evolved).toBe(true);
      return w.rerolls;
    };
    expect(evolve('sword')).toBe(2);
    expect(evolve(undefined)).toBe(1);
  });

  it('求签：下一次升级必有指的搭配缺的料，用过就清', () => {
    const zhuxie = MERGES.findIndex((m) => m.id === 'zhuxie');
    const wants = new Set<string>(['sword', 'flysword', WEAPONS.sword.evolve!.with, WEAPONS.flysword.evolve!.with]);
    for (let seed = 1; seed <= 30; seed++) {
      const w = make({ seed, character: 'xiaodao' });
      w.omen = zhuxie;
      toChoose(w);
      expect(w.choices.some((c) => wants.has(c.id)), `种子 ${seed}`).toBe(true);
      expect(w.omen).toBe(-1);
    }
  });
});

describe('夜市：求签、法器 +1 级', () => {
  const M = NIGHT_MARKET;
  /** 跳到开市，把第一摊换成 good、价格 0，站上去买 */
  function buy(w: World, good: (typeof MARKET_GOODS)[number]): void {
    w.tick = M.at[0]! - 5;
    while (w.mkPhase !== 2) {
      w.invuln = 1e9;
      step(w, 0, w.phase === 'choose' ? 0 : -1);
    }
    w.mkGood[0] = MARKET_GOODS.indexOf(good);
    w.mkPrice[0] = 0;
    for (let t = 0; t < M.hold + 2 && !w.mkSold[0]; t++) {
      w.x = w.mkX[0]!;
      w.y = w.mkY[0]!;
      w.invuln = 1e9;
      step(w, 0, w.phase === 'choose' ? 0 : -1);
    }
    expect(w.mkSold[0]).toBe(1);
  }

  it('求签指离成形最近的搭配；手上一件料都没有的时候换成刷新 +2', () => {
    const w = make({ character: 'xiaodao' });
    buy(w, 'omen');
    expect(w.omen).toBeGreaterThanOrEqual(0);
    const m = MERGES[w.omen]!;
    expect(w.weapons.some((o) => o.id === m.a || o.id === m.b)).toBe(true);
    const bare = make({ character: 'xiaodao' });
    bare.weapons.length = 0;
    bare.rerolls = 0;
    buy(bare, 'omen');
    expect(bare.omen).toBe(-1);
    expect(bare.rerolls).toBe(Math.min(PICKS.rerollMax, 2));
  });

  it('「法器 +1 级」升离满级最近的那件', () => {
    const w = make({ character: 'xiaodao' });
    grantWeapon(w, 'flysword', 5);
    const sword = w.weapons.find((o) => o.id === 'sword')!;
    sword.level = 2;
    buy(w, 'upgrade');
    expect(w.weapons.find((o) => o.id === 'flysword')!.level).toBe(6);
  });
});
