import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../src/content/meta.ts';
import { SCHOOLS } from '../../src/content/guide.ts';
import { CHARACTER_POOLS, POOL_CHARACTER_IDS, POOL_START, inPool } from '../../src/content/pools.ts';
import { MERGES, PASSIVES, WEAPON_IDS, WEAPONS } from '../../src/content/weapons.ts';
import { createWorld, step } from '../../src/core/index.ts';

describe('角色法器池（content/pools.ts）', () => {
  it('10 个角色，每人 12–15 件法器', () => {
    expect(POOL_CHARACTER_IDS.length).toBe(10);
    for (const id of POOL_CHARACTER_IDS) {
      const n = CHARACTER_POOLS[id].weapons.length;
      expect(n, id).toBeGreaterThanOrEqual(12);
      expect(n, id).toBeLessThanOrEqual(15);
    }
  });

  it('起手法器在池里，和角色表里的起手一致', () => {
    for (const id of POOL_CHARACTER_IDS) {
      expect(CHARACTER_POOLS[id].weapons, id).toContain(POOL_START[id]);
      if (id in CHARACTERS) expect(CHARACTERS[id as keyof typeof CHARACTERS].start).toBe(POOL_START[id]);
    }
  });

  it('2–3 个主修流派，成套件（法器）都在池里', () => {
    for (const id of POOL_CHARACTER_IDS) {
      const p = CHARACTER_POOLS[id];
      expect(p.schools.length, id).toBeGreaterThanOrEqual(2);
      expect(p.schools.length, id).toBeLessThanOrEqual(3);
      for (const s of p.schools) for (const wId of SCHOOLS[s].weapons) expect(p.weapons, `${id} ${s} ${wId}`).toContain(wId);
    }
  });

  it('池里每件法器的进化被动也在池里（否则进化不了）', () => {
    for (const id of POOL_CHARACTER_IDS) {
      for (const wId of CHARACTER_POOLS[id].weapons) expect(CHARACTER_POOLS[id].passives, `${id} ${wId}`).toContain(WEAPONS[wId].evolve!.with);
      for (const p of CHARACTER_POOLS[id].passives) expect(PASSIVES[p]).toBeDefined();
    }
  });

  it('每件法器至少在 2 个角色的池里', () => {
    for (const wId of WEAPON_IDS) {
      const n = POOL_CHARACTER_IDS.filter((id) => CHARACTER_POOLS[id].weapons.includes(wId)).length;
      expect(n, wId).toBeGreaterThanOrEqual(2);
    }
  });

  it('每个合成 / 双修至少有一个角色（专属的是对应角色）能凑齐两件料', () => {
    for (const m of MERGES) {
      const who = POOL_CHARACTER_IDS.filter((id) => (!m.only || m.only.split(',').includes(id)) && CHARACTER_POOLS[id].weapons.includes(m.a) && CHARACTER_POOLS[id].weapons.includes(m.b));
      expect(who.length, m.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('升级三选一只出池里的卡（娱乐局）', () => {
    for (const ch of ['xiaodao', 'caiyao'] as const) {
      const seen = new Set<string>();
      for (let seed = 1; seed <= 6; seed++) {
        const w = createWorld({ seed, mode: 'vigil', danger: 2, character: ch });
        for (let t = 0; t < 30 * 90 && w.phase !== 'over'; t++) {
          step(w, (t >> 5) % 8 === 0 ? 1 : 5, -1);
          if (w.phase === 'choose') {
            for (const c of w.choices) seen.add(c.id);
            step(w, 0, 0);
          }
        }
      }
      for (const id of seen) if (id !== 'coins') expect(inPool(ch, id), `${ch} 抽到池外的 ${id}`).toBe(true);
      expect(seen.size).toBeGreaterThan(4);
    }
  }, 60_000);
});
