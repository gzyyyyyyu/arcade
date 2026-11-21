// 角色技能钩子（DESIGN 3.7，core/skills.ts SKILL_FX.hooks）：娱乐、实盘一样
import { describe, expect, it } from 'vitest';
import { createWorld, Ev, Shot, step, MAX_SHOTS, type Setup, type World } from '../../src/core/index.ts';
import { grantWeapon, spawnNow } from '../../src/core/debug.ts';
import { SKILL_FX } from '../../src/core/skills.ts';
import { CHAR_FX, type CharacterId } from '../../src/content/meta.ts';
import type { WeaponId } from '../../src/content/weapons.ts';

/** 干净的一局：只有给定的法器，不刷怪，血很厚 */
function arena(c: CharacterId, arms: WeaponId[], live = false): World {
  const w = createWorld({ seed: 4, mode: 'vigil', danger: 0, character: c, ...(live ? { live } : {}) } as Setup);
  w.weapons.length = 0;
  w.wstats.length = 0;
  for (const id of arms) grantWeapon(w, id, 3);
  w.nextEvent = 1e9;
  w.spawnAcc = -1e9;
  w.hp = w.stats.hpMax = 1e6;
  return w;
}

/** 主角四周一圈打不死的怪 */
function ring(w: World, n = 12, d = 80): number[] {
  const out: number[] = [];
  for (let j = 0; j < n; j++) {
    const a = (j / n) * Math.PI * 2;
    const e = spawnNow(w, 'jiangshi', w.x + Math.cos(a) * d, w.y + Math.sin(a) * d);
    w.eHp[e] = 1e7;
    out.push(e);
  }
  return out;
}

const lost = (w: World, ids: number[]): number => ids.reduce((s, e) => s + (1e7 - w.eHp[e]!), 0);

/** 放一次技能，返回这一拍的 SkillUse 事件数 */
function cast(w: World): number {
  w.skill.cd = 0;
  step(w, -1, -1, 1);
  let n = 0;
  for (let i = 0; i < w.ev.n; i++) if (w.ev.type[i] === Ev.SkillUse) n++;
  return n;
}

describe('角色技能钩子', () => {
  it('小道士：手上剑类 ≥ 2 件，剑气纵横身后再斩一刀（实盘也是）；一件剑只一刀', () => {
    expect(cast(arena('xiaodao', ['sword', 'flysword']))).toBe(2);
    expect(cast(arena('xiaodao', ['sword']))).toBe(1);
    expect(cast(arena('xiaodao', ['sword', 'flysword'], true))).toBe(2);
  });

  it('符师：每多一件符类多飞 3 张，封顶 21', () => {
    const fu = (arms: WeaponId[]): number => {
      const w = arena('fushi', arms);
      cast(w);
      let n = 0;
      for (let i = 0; i < MAX_SHOTS; i++) if (w.sAlive[i] && w.sKind[i] === Shot.SkillFu) n++;
      return n;
    };
    const f = SKILL_FX.volley.n;
    expect(fu(['talisman'])).toBe(f);
    expect(fu(['talisman', 'thunder'])).toBe(f + 3);
    expect(fu(['talisman', 'thunder', 'crane', 'dart', 'cracker'])).toBe(SKILL_FX.hooks.fuMax);
  });

  it('剑侠：御剑突进打倒精英，冷却当场转好；没打倒照常冷却', () => {
    const dash = (hp: number): number => {
      const w = arena('jianxia', ['flysword']);
      w.face = 0;
      const e = spawnNow(w, 'shishi', w.x + 120, w.y);
      w.eHp[e] = hp;
      cast(w);
      return w.skill.cd;
    };
    expect(dash(1)).toBe(0);
    expect(dash(1e7)).toBeGreaterThan(0);
  });

  it('胖师叔：铁布衫挡下的伤害攒起来，结束时震出去', () => {
    const w = arena('pang', []);
    const ids = ring(w, 8, 40);
    cast(w);
    for (let t = 0; t < 30; t++) {
      w.hp = w.stats.hpMax;
      step(w, -1, -1, 0);
    }
    expect(w.skill.store).toBeGreaterThan(0);
    for (let t = 0; t < 100 && w.skill.active > 0; t++) {
      w.hp = w.stats.hpMax;
      step(w, -1, -1, 0);
    }
    w.hp = w.stats.hpMax;
    step(w, -1, -1, 0);
    expect(w.skill.store).toBe(0);
    expect(lost(w, ids)).toBeGreaterThan(0);
  });

  it('采药女：回春期间药香圈里的怪每秒受伤（手上没有法器）', () => {
    const w = arena('caiyao', []);
    const ids = ring(w, 8, 60);
    cast(w);
    for (let t = 0; t < 200; t++) step(w, -1, -1, 0);
    expect(lost(w, ids)).toBeGreaterThan(0);
  });

  it('纸匠：身边有纸兵时这一下由纸兵替挨（不掉血，纸兵下一拍倒下）；纸兵都在远处照常掉血', () => {
    const hit = (near = true): { hp: number; papers: number } => {
      const w = arena('zhijiang', []);
      // 纸兵直接放在主角身边或远处，排除纸兵自己跑位的影响
      grantWeapon(w, 'zhibing', 3);
      const papers = (): number => { let n = 0; for (let i = 0; i < MAX_SHOTS; i++) if (w.sAlive[i] && w.sKind[i] === Shot.Paper) n++; return n; };
      for (let t = 0; t < 90 && papers() < 2; t++) step(w, -1, -1, 0);
      for (let i = 0; i < MAX_SHOTS; i++) if (w.sAlive[i] && w.sKind[i] === Shot.Paper) {
        w.sX[i] = w.x + (near ? 30 : 400);
        w.sY[i] = w.y;
      }
      const before = papers();
      const hp = w.hp;
      // 一只怪贴在主角身上，走一拍：碰撞伤害在这一拍结算
      const e = spawnNow(w, 'jiangshi', w.x, w.y);
      w.eHp[e] = 1e7;
      step(w, -1, -1, 0);
      // 替身的纸兵下一拍走正常的倒下
      w.invuln = 1e9;
      step(w, -1, -1, 0);
      return { hp: hp - w.hp, papers: before - papers() };
    };
    expect(hit()).toEqual({ hp: 0, papers: 1 });
    expect(hit(false).hp).toBeGreaterThan(0);
  });

  it('更夫：梆子声声每一梆补一层护身，没带金钟罩也有一层', () => {
    const w = arena('gengfu', ['sword']);
    cast(w);
    expect(w.shield).toBe(1);
  });

  it(`货郎：捡到的铜钱每攒满 ${CHAR_FX.huolangRerollEvery} 枚补一次刷新`, () => {
    const w = createWorld({ seed: 6, mode: 'vigil', danger: 0, character: 'huolang' });
    // 先记成只差一枚，跑到再捡一枚为止
    const at = CHAR_FX.huolangRerollEvery;
    w.coinBy.drop = at - 1;
    let n = 0;
    for (let t = 0; t < 9000 && w.phase !== 'over' && w.coinBy.drop + w.coinBy.purse < at; t++) {
      w.invuln = 1e9;
      step(w, Math.floor(t / 45) % 8, w.phase === 'choose' ? 0 : -1);
      for (let i = 0; i < w.ev.n; i++) if (w.ev.type[i] === Ev.Reroll && w.ev.a[i] === 2) n++;
    }
    expect(w.coinBy.drop + w.coinBy.purse).toBeGreaterThanOrEqual(at);
    expect(n).toBeGreaterThan(0);
  }, 30_000);
});
