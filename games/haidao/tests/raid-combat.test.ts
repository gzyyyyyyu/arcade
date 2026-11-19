import { describe, expect, it } from 'vitest';
import { BUILDINGS, CAMPAIGN, RULES_VERSION, battleFingerprint, botActions, createBattle, runBattle, stepBattle } from '../src/core/index.ts';
import type { BattleSetup, BattleState, BuildingKind, BUnit } from '../src/core/index.ts';
import { sampleArmy } from '../tools/sample.ts';

/**
 * 规则版本 9：进攻（battle.ts）接入共用战斗规则 combat.ts——塔锁定目标、炸的瞄提前量、兵按小道错开、
 * 在途伤害够打死的算必死、火箭人不够从头轮、追不过去英雄就先不理、信号弹期间不被英雄引走。版本 ≤ 8 逐位不变。
 */
const lay = (rows: Array<[BuildingKind, number, number, number]>) => rows.map(([kind, level, x, y], i) => ({ id: i + 1, kind, level, x, y }));

/** 一座塔（放在岛中间）加 n 个船医当靶子：没有别的兵时船医站着不动，位置由测试摆；第二条船不登陆，战斗不会因为"没兵了"提前结束 */
const dummyArmy = (n: number): BattleSetup['army'] => ({ boats: [{ troop: 'medic', count: n, level: 1 }, { troop: 'sailor', count: 1, level: 1 }], skills: [], energy: 0 });
function range(kind: BuildingKind, n: number, rules = 9): { s: BattleState; cx: number; cy: number; dummies: BUnit[] } {
  const layout = lay([['hq', 1, 0, 0], [kind, 1, 9, 9]]);
  const s = createBattle({ layout, army: dummyArmy(n), seed: 1, rules });
  stepBattle(s, [{ t: 0, type: 'land', boat: 0, x: -150, y: 1100 }]);
  const b = s.buildings[1]!;
  const cx = b.x * 100 + b.size * 50;
  const cy = b.y * 100 + b.size * 50;
  return { s, cx, cy, dummies: s.units.slice() };
}

const put = (u: BUnit, x: number, y: number): void => {
  u.x = x;
  u.y = y;
  u.px = x;
  u.py = y;
};

describe('规则版本 9：进攻接入 combat.ts', () => {
  it('当前版本是 10（版本 9 的规则照旧，10 只加震荡炮和掷弹兵，见 content1.test.ts）', () => {
    expect(RULES_VERSION).toBe(21);
  });

  it('锁定：近处又来一个兵，塔接着打原来那个；版本 8 会换', () => {
    for (const rules of [8, 9]) {
      const { s, cx, cy, dummies } = range('cannon', 2, rules);
      const [a, b] = dummies as [BUnit, BUnit];
      put(a, cx + 400, cy);
      put(b, cx + 600, cy);
      stepBattle(s, []);
      const tower = s.buildings[1]!;
      expect(tower.aim).toBe(a.id);
      put(b, cx, cy + 300);
      stepBattle(s, []);
      expect(tower.aim, `v${rules}`).toBe(rules >= 9 ? a.id : b.id);
    }
  });

  it('射程两端都算（含 range 和 minRange），出了任一端就不打', () => {
    const lv = BUILDINGS.mortar.levels[0]!;
    const R = Math.round((lv.range ?? 0) * 100);
    const m = Math.round((lv.minRange ?? 0) * 100);
    expect(m).toBeGreaterThan(0);
    for (const [d, inside] of [[R, true], [R + 1, false], [m, true], [m - 1, false]] as const) {
      const { s, cx, cy, dummies } = range('mortar', 1);
      put(dummies[0]!, cx + d, cy);
      stepBattle(s, []);
      expect(s.buildings[1]!.aim >= 0, `d=${d}`).toBe(inside);
    }
  });

  it('提前量：臼炮炮弹落地时被瞄的兵离落点 1 格内的比例，版本 9 比 8 高', () => {
    const rate = (rules: number): number => {
      let n = 0;
      let hit = 0;
      for (const i of [4, 6, 9, 12]) {
        const lv = CAMPAIGN[i]!;
        const setup: BattleSetup = { layout: lv.layout, army: sampleArmy(lv.hq), seed: 1, rules };
        const acts = botActions(setup, 'normal');
        const s = createBattle(setup);
        const fly: Array<{ t: number; id: number; x: number; y: number }> = [];
        while (!s.over) {
          for (const f of fly) {
            if (f.t !== s.tick) continue;
            const u = s.units[f.id - 1]!;
            if (u.mode === 'dead') continue;
            n++;
            if ((u.x - f.x) ** 2 + (u.y - f.y) ** 2 <= 100 * 100) hit++;
          }
          for (const e of stepBattle(s, acts.filter((a) => a.t === s.tick))) {
            if (e.type !== 'shoot' || e.from !== 'building') continue;
            const b = s.buildings.find((q) => q.id === e.id)!;
            if (b.kind !== 'mortar') continue;
            const p = s.projectiles.find((q) => q.id === e.projectile)!;
            fly.push({ t: p.t1, id: b.aim, x: p.x1, y: p.y1 });
          }
        }
      }
      expect(n).toBeGreaterThan(20);
      return hit / n;
    };
    const v8 = rate(8);
    const v9 = rate(9);
    expect(v9).toBeGreaterThan(v8);
  }, 60_000);

  it('错开：同一条船的兵走同一串格子，版本 9 不叠成一个点', () => {
    const stacked = (rules: number): number => {
      const army = { boats: [{ troop: 'sailor' as const, count: 8, level: 1 }], skills: [], energy: 0 };
      const s = createBattle({ layout: lay([['hq', 1, 14, 14]]), army, seed: 1, rules });
      stepBattle(s, [{ t: 0, type: 'land', boat: 0, x: -150, y: 1100 }]);
      let worst = 0;
      for (let t = 0; t < 200; t++) {
        stepBattle(s, []);
        const seen = new Map<string, number>();
        for (const u of s.units) if (u.mode === 'move') seen.set(`${u.x},${u.y}`, (seen.get(`${u.x},${u.y}`) ?? 0) + 1);
        for (const c of seen.values()) worst = Math.max(worst, c);
      }
      return worst;
    };
    expect(stacked(8)).toBeGreaterThan(1);
    expect(stacked(9)).toBe(1);
  });

  it('火箭：只剩一个兵时三发都打它；在途伤害够打死的兵排到后面', () => {
    const { s, cx, cy, dummies } = range('rocket', 1);
    put(dummies[0]!, cx + 300, cy);
    const shots = stepBattle(s, []).filter((e) => e.type === 'shoot').length;
    expect(shots).toBe(3);

    // 两座加农炮同一拍开火：第一座的弹丸够打死近的那个兵，第二座改打远的
    const layout = lay([['hq', 1, 0, 0], ['cannon', 1, 9, 9], ['cannon', 1, 9, 13]]);
    const t = createBattle({ layout, army: dummyArmy(2), seed: 1, rules: 9 });
    stepBattle(t, [{ t: 0, type: 'land', boat: 0, x: -150, y: 1100 }]);
    const [a, b] = t.units as [BUnit, BUnit];
    put(a, 1000, 1200);
    put(b, 1000, 1600);
    a.hp = 1;
    b.hp = 1;
    stepBattle(t, []);
    expect(t.buildings[1]!.aim).toBe(a.id);
    expect(t.buildings[2]!.aim).toBe(b.id);
  });

  it('追英雄被墙挡住：之后 20 拍不理英雄、一直往自己的目标走（版本 8 会在追英雄和拆房子之间来回切）', () => {
    // 主寨在上，墙横在兵和英雄之间；英雄每拍摆回原处（测试只看兵）
    const run = (rules: number): { ys: number[]; until: number; blockedAt: number } => {
      const layout = lay([['hq', 1, 4, 0], ['wall', 1, 4, 7], ['wall', 1, 5, 7], ['wall', 1, 6, 7], ['treasure', 1, 15, 15]]);
      const s = createBattle({ layout, army: { boats: [{ troop: 'brute', count: 1, level: 1 }, { troop: 'sailor', count: 1, level: 1 }], skills: [], energy: 0 }, seed: 1, rules, hero: 1 });
      stepBattle(s, [{ t: 0, type: 'land', boat: 0, x: -150, y: 1100 }]);
      const u = s.units[0]!;
      put(u, 550, 680);
      u.hp = 99999;
      u.maxHp = 99999;
      const h = s.hero!;
      const ignore = (s.internal as { ignoreHero?: number[] }).ignoreHero;
      const ys: number[] = [];
      let blockedAt = -1;
      for (let i = 0; i < 60; i++) {
        h.x = h.postX = 550;
        h.y = h.postY = 850;
        stepBattle(s, []);
        ys.push(u.y);
        if (blockedAt < 0 && ignore && (ignore[u.id] ?? 0) > 0) blockedAt = s.tick - 1;
      }
      return { ys, until: ignore?.[u.id] ?? 0, blockedAt };
    };
    const v9 = run(9);
    expect(v9.blockedAt).toBeGreaterThanOrEqual(0);
    expect(v9.until).toBeGreaterThan(v9.blockedAt);
    // ys[i] 是第 i+1 拍走完的位置：挡住那一拍起 20 拍里兵只往上（主寨）走，不回头追英雄；到期后才可能再追一次（一来一回 40 拍，不是每拍）
    const after = v9.ys.slice(v9.blockedAt - 1, v9.blockedAt + 19);
    for (let i = 1; i < after.length; i++) expect(after[i]!).toBeLessThanOrEqual(after[i - 1]!);
    // 版本 8：同一段里有往下（追英雄）也有往上（拆房子），来回切
    const ys8 = run(8).ys;
    let flips = 0;
    for (let i = 2; i < ys8.length; i++) if (Math.sign(ys8[i]! - ys8[i - 1]!) * Math.sign(ys8[i - 1]! - ys8[i - 2]!) < 0) flips++;
    expect(flips).toBeGreaterThan(2);
  });

  it('信号弹生效期间：英雄 3 格内的兵也先去打标记的建筑，不跟英雄缠斗（版本 8 会打英雄）', () => {
    const heroHits = (rules: number): number => {
      const layout = lay([['hq', 1, 4, 0], ['treasure', 1, 15, 15]]);
      const army: BattleSetup['army'] = { boats: [{ troop: 'brute', count: 3, level: 1 }, { troop: 'sailor', count: 1, level: 1 }], skills: [{ kind: 'flare', level: 1 }], energy: 20 };
      const s = createBattle({ layout, army, seed: 1, rules, hero: 1 });
      stepBattle(s, [{ t: 0, type: 'land', boat: 0, x: -150, y: 1100 }]);
      const h = s.hero!;
      s.units.forEach((u, i) => put(u, h.x + 120, h.y + (i - 1) * 60));
      let n = 0;
      for (const e of stepBattle(s, [{ t: 1, type: 'skill', skill: 'flare', x: 600, y: 200 }])) if (e.type === 'skill') expect(e.skill).toBe('flare');
      for (let i = 0; i < 60; i++) for (const e of stepBattle(s, [])) if (e.type === 'hit' && e.target === 'hero') n++;
      return n;
    };
    expect(heroHits(8)).toBeGreaterThan(0);
    expect(heroHits(9)).toBe(0);
  });

  it('版本 ≤ 8 逐位不变：6、7、8 指纹一样，9 不一样', () => {
    for (const i of [0, 4, 11]) {
      const lv = CAMPAIGN[i]!;
      const fp = (rules: number): number => {
        const setup: BattleSetup = { layout: lv.layout, army: sampleArmy(lv.hq), seed: 42, rules };
        return battleFingerprint(runBattle(setup, botActions(setup, 'normal')).state);
      };
      const v6 = fp(6);
      expect(fp(7)).toBe(v6);
      expect(fp(8)).toBe(v6);
      expect(fp(9), lv.id).not.toBe(v6);
    }
  }, 60_000);
});
