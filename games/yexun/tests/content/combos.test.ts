import { describe, expect, it } from 'vitest';
import { mergeReach, mergeWho, reachableMerges, SHOWN_MERGES } from '../../src/content/combos.ts';
import { PICK_CHAR_IDS } from '../../src/content/meta.ts';
import { CHARACTER_POOLS, inPool, mainSchools, type PoolCharacterId } from '../../src/content/pools.ts';
import { SCHOOL_IDS } from '../../src/content/guide.ts';
import { MERGES, PASSIVES, WEAPON_IDS, WEAPONS, type MergeDef, type WeaponId } from '../../src/content/weapons.ts';
import { grantWeapon, openChestNow } from '../../src/core/debug.ts';
import { createWorld, type World } from '../../src/core/index.ts';
import { renderCombos, newCombosState, schoolMerges, whoText } from '../../src/view/ui/codexCombos.ts';
import { mergeHint } from '../../src/view/ui/mergeHint.ts';
import { emptyRecords } from '../../src/meta/records.ts';

// 组合可达性（DESIGN 3.3d）：界面上「谁能合」都读 content/combos.ts，这里锁住它和规则核心、角色池、各处界面一致

/** 照搭配的门槛给两件料（合成两件都进化；双修把进化被动在池里的那件进化、另一件满级），开一个宝箱 */
function chestWith(c: string, m: MergeDef): World {
  const w = createWorld({ seed: 7, mode: 'vigil', danger: 2, character: c as never });
  w.weapons.length = 0;
  w.wstats.length = 0;
  const evoIn = (id: WeaponId): boolean => !!WEAPONS[id].evolve && CHARACTER_POOLS[c as PoolCharacterId].passives.includes(WEAPONS[id].evolve!.with);
  const aEvo = !m.dual || evoIn(m.a);
  grantWeapon(w, m.a, 8, aEvo);
  grantWeapon(w, m.b, 8, !m.dual || !aEvo);
  openChestNow(w);
  return w;
}

describe('组合可达性：和规则核心、角色池一致', () => {
  for (const c of PICK_CHAR_IDS) {
    it(`${c}：每个搭配的结论都对得上`, () => {
      for (const m of MERGES) {
        const r = mergeReach(m, c);
        if (r === 'ok') {
          // 凑得出：两件料、进化要的被动都抽得到，照门槛给齐后宝箱里真的合上
          expect(inPool(c, m.a, true) && inPool(c, m.b, true), m.id).toBe(true);
          expect(chestWith(c, m).merges, `${c} ${m.id}`).toContain(m.id);
        } else if (r === 'only') {
          // 别人的专属：料给齐了宝箱里也不合
          expect(chestWith(c, m).merges, `${c} ${m.id}`).not.toContain(m.id);
        } else if (r === 'pool') {
          expect(inPool(c, m.a, true) && inPool(c, m.b, true), m.id).toBe(false);
        } else {
          const evo = [m.a, m.b].map((id) => WEAPONS[id].evolve?.with).filter((p) => p !== undefined);
          expect(evo.filter((p) => inPool(c, p!, true)).length, m.id).toBeLessThan(m.dual ? 1 : 2);
        }
      }
    });
  }

  it('界面上列的搭配：能选的角色里至少一人凑得出；收起角色的专属不列', () => {
    for (const m of MERGES) expect(SHOWN_MERGES.includes(m), m.id).toBe(mergeWho(m).length > 0);
    // 渡魂灯只给收起的摆渡人
    expect(SHOWN_MERGES.some((m) => m.id === 'dudeng')).toBe(false);
  });

  it('每个能选的角色至少凑得出 6 个搭配，且至少一个是自己的专属', () => {
    for (const c of PICK_CHAR_IDS) {
      const mine = reachableMerges(c);
      expect(mine.length, c).toBeGreaterThanOrEqual(6);
      expect(mine.some((m) => m.only?.split(',').includes(c)), c).toBe(true);
    }
  });
});

describe('组合可达性：界面如实显示', () => {
  const rec = emptyRecords();
  const icons = (k: string): string => k;
  it('图鉴搭配表：按角色看时，「凑得出」那一段正好是他凑得出的，其余压暗写原因', () => {
    for (const c of PICK_CHAR_IDS) {
      const st = newCombosState();
      st.char = c;
      const html = renderCombos(st, icons, rec);
      const [yes = '', no = ''] = html.split('凑不出的 ');
      for (const m of SHOWN_MERGES) {
        const ok = mergeReach(m, c) === 'ok';
        expect(yes.includes(`<b>${m.name}</b>`), `${c} ${m.name}`).toBe(ok);
        expect(no.includes(`<b>${m.name}</b>`), `${c} ${m.name}`).toBe(!ok);
      }
      expect(html.includes('渡魂灯'), c).toBe(false);
      expect((no.match(/yx-cc-row[^"]* no"/g) ?? []).length, c).toBe(SHOWN_MERGES.length - reachableMerges(c).length);
    }
  });

  it('「人人能合」只写给九个角色都凑得出的', () => {
    for (const m of SHOWN_MERGES) expect(whoText(m) === '人人能合', m.id).toBe(mergeWho(m).length === PICK_CHAR_IDS.length);
  });

  it('玩法说明的流派例子只推荐主修这个流派的人凑得出的搭配', () => {
    for (const s of SCHOOL_IDS) {
      const mains = PICK_CHAR_IDS.filter((c) => mainSchools(c).includes(s));
      for (const m of schoolMerges(s)) expect(mains.some((c) => mergeReach(m, c) === 'ok'), `${s} ${m.id}`).toBe(true);
    }
  });

  it('选卡提示：凑不出的搭配，拿什么卡都不提示', () => {
    for (const c of PICK_CHAR_IDS) {
      for (const m of MERGES) {
        if (mergeReach(m, c) === 'ok') continue;
        // 手上有其中一件（满级），把这个角色池里所有的卡都试一遍
        const held = inPool(c, m.a, true) ? m.a : inPool(c, m.b, true) ? m.b : null;
        if (!held) continue;
        const w = createWorld({ seed: 3, mode: 'vigil', danger: 2, character: c });
        grantWeapon(w, held, 8, false);
        for (const id of WEAPON_IDS) if (inPool(c, id, true)) expect(mergeHint(w, { kind: 'weapon', id })?.id, `${c} ${m.id} ${id}`).not.toBe(m.id);
        for (const id of Object.keys(PASSIVES)) if (inPool(c, id, true)) expect(mergeHint(w, { kind: 'passive', id: id as never })?.id, `${c} ${m.id} ${id}`).not.toBe(m.id);
      }
    }
  });
});
