import { describe, expect, it } from 'vitest';
import { ENEMY_BY_KIND, type EnemyKind } from '../../src/content/enemies.ts';
import { AFFIX_FX, RUSH_FOE_IDS, RUSH_FOES, YELOU, type AffixId } from '../../src/content/rushFoes.ts';
import { createWorld, Ev, step, type World } from '../../src/core/index.ts';
import { spawnNow } from '../../src/core/debug.ts';
import { api } from '../../src/core/foes/api.ts';
import { affixInit, affixShieldLeft, affixTick, foeAct, foeGhost, foeHitMul, foeOnKill, foeTick, yelouDrip, type FoeMv } from '../../src/core/foes/index.ts';

const code = (k: EnemyKind): number => ENEMY_BY_KIND[k].code;

function quiet(seed = 5): World {
  const w = createWorld({ seed, mode: 'vigil', danger: 2, map: 'snow' });
  w.weapons.length = 0;
  w.wstats.length = 0;
  w.nextEvent = 1 << 30;
  w.spawnAcc = -1e9;
  return w;
}

function alive(w: World, k: EnemyKind): number {
  let n = 0;
  for (let i = 0; i < w.eAlive.length; i++) if (w.eAlive[i] && w.eKind[i] === code(k)) n++;
  return n;
}

/** 夜漏君走一拍（不靠 step 的分发，直接调行为和收尾），返回这拍的事件 */
function act(w: World, i: number): { a: number[]; rush: number[] } {
  w.ev.n = 0;
  const dx = w.x - w.eX[i]!;
  const dy = w.y - w.eY[i]!;
  const d = Math.hypot(dx, dy) || 1;
  const mv: FoeMv = { vx: dx / d, vy: dy / d, sp: w.eSpeed[i]! };
  foeAct(w, i, 'yelou', d, dx / d, dy / d, mv);
  foeTick(w);
  w.tick++;
  const a: number[] = [];
  const rush: number[] = [];
  for (let k = 0; k < w.ev.n; k++) {
    if (w.ev.type[k] === Ev.Foe) a.push(w.ev.a[k]!);
    if (w.ev.type[k] === Ev.Rush) rush.push(w.ev.a[k]!);
  }
  return { a, rush };
}

function yelou(w: World): number {
  const i = spawnNow(w, 'yelou', w.x + 400, w.y);
  w.eHp[i] = YELOU.hp;
  w.eHpMax[i] = YELOU.hp;
  w.eDmg[i] = YELOU.dmg;
  return i;
}

describe('首领池', () => {
  it('13 个候选，每个上场的怪都有定义，双煞两只', () => {
    expect(RUSH_FOE_IDS.length).toBe(13);
    for (const id of RUSH_FOE_IDS) for (const k of RUSH_FOES[id].kinds) expect(ENEMY_BY_KIND[k], `${id} ${k}`).toBeDefined();
    expect(RUSH_FOES.duo_lion.kinds.length).toBe(2);
  });
});

describe('夜漏君', () => {
  it('三阶段按血切：65% 进三更（夜色、灯笼）、30% 进五更（夜潮、滴漏），转阶段发 Ev.Rush 5', () => {
    const w = quiet();
    const i = yelou(w);
    expect(act(w, i).a).not.toContain(80);
    w.eHp[i] = YELOU.hp * 0.6;
    const e1 = act(w, i);
    expect(w.ePhase[i]).toBe(1);
    expect(e1.a).toContain(80);
    expect(e1.rush).toContain(5);
    expect(w.foe.ylDark).toBe(1);
    expect(w.foe.lN).toBe(3);
    w.tick += YELOU.shift;
    w.eHp[i] = YELOU.hp * 0.25;
    act(w, i);
    expect(w.ePhase[i]).toBe(2);
    expect(w.foe.ylDark).toBe(0);
    expect(w.foe.lN).toBe(0);
    expect(w.foe.tideR).toBe(YELOU.tide.start);
    expect(yelouDrip(w)).toBe(YELOU.drip - 1);
  });

  it('转阶段无敌 1.5 秒（打不到、碰不到），清掉场上的敌弹', () => {
    const w = quiet();
    const i = yelou(w);
    act(w, i);
    api.shot(w, w.x + 300, w.y, 0, 0, 200, 5, 10, 0);
    const shots = w.sCount;
    expect(shots).toBeGreaterThan(0);
    w.eHp[i] = YELOU.hp * 0.6;
    act(w, i);
    expect(w.sCount).toBe(0);
    expect(foeGhost(w, i)).toBe(true);
    for (let t = 1; t < YELOU.shift; t++) act(w, i);
    expect(foeGhost(w, i)).toBe(false);
  });

  it('三更站在灯笼旁打它 +20%', () => {
    const w = quiet();
    const i = yelou(w);
    w.eHp[i] = YELOU.hp * 0.6;
    act(w, i);
    w.x = w.foe.lX[0]!;
    w.y = w.foe.lY[0]!;
    expect(foeHitMul(w, i)).toBe(YELOU.lantern.hitMul);
    w.x = w.foe.lX[0]! + 2000;
    expect(foeHitMul(w, i)).toBe(1);
  });

  it('一更：鼓圈、更签雨、召更夫鬼都放得出来', () => {
    const w = quiet();
    const i = yelou(w);
    const seen = new Set<number>();
    for (let t = 0; t < YELOU.call.first + 5; t++) {
      w.hp = w.stats.hpMax;
      for (const a of act(w, i).a) seen.add(a);
    }
    expect(seen.has(70)).toBe(true);
    expect(seen.has(36)).toBe(true);
    expect(seen.has(72)).toBe(true);
    expect(alive(w, 'nightwatch')).toBe(YELOU.call.n);
  });

  it('滴漏倒数到 0 不秒人：夜潮停收、伤害按 10 秒一档往上加、封顶 ×2', () => {
    const w = quiet();
    const i = yelou(w);
    w.eHp[i] = YELOU.hp * 0.25;
    act(w, i);
    w.tick += YELOU.shift;
    const base = w.eDmg[i]!;
    for (let t = 0; t < YELOU.drip + 5 * 60 * 30; t++) {
      w.hp = w.stats.hpMax;
      w.invuln = 0;
      act(w, i);
      expect(w.hp).toBeGreaterThan(0);
    }
    expect(yelouDrip(w)).toBe(0);
    expect(w.foe.tideR).toBeGreaterThanOrEqual(YELOU.tide.min);
    expect(w.eDmg[i]! / base).toBeCloseTo(YELOU.enrage.maxDmg, 6);
    const r = w.foe.tideR;
    for (let t = 0; t < 400; t++) act(w, i);
    expect(w.foe.tideR).toBe(r);
  });

  it('倒下：漏壶碎（Ev.Foe 81），夜色、灯笼、夜潮都收掉', () => {
    const w = quiet();
    const i = yelou(w);
    w.eHp[i] = YELOU.hp * 0.25;
    act(w, i);
    expect(w.foe.tideR).toBeGreaterThan(0);
    w.ev.n = 0;
    foeOnKill(w, i, w.eX[i]!, w.eY[i]!);
    const subs: number[] = [];
    for (let k = 0; k < w.ev.n; k++) if (w.ev.type[k] === Ev.Foe) subs.push(w.ev.a[k]!);
    expect(subs).toContain(81);
    expect(w.foe.tideR).toBe(0);
    expect(w.foe.ylDark).toBe(0);
    expect(yelouDrip(w)).toBe(-1);
  });
});

describe('词缀', () => {
  function boss(w: World, affixes: AffixId[], ruler = false): number {
    if (ruler) w.rushRelics.push('ruler');
    const i = spawnNow(w, 'lord', w.x + 300, w.y);
    w.eHp[i] = 10000;
    w.eHpMax[i] = 10000;
    w.eDmg[i] = 10;
    affixInit(w, i, affixes);
    return i;
  }
  const tick = (w: World, i: number, n = 1): void => {
    for (let t = 0; t < n; t++) {
      affixTick(w, i, api);
      w.tick++;
    }
  };

  it('铁加血、疾加速；镇尺只取一半加成', () => {
    const w = quiet();
    const i = boss(w, ['tough', 'swift']);
    expect(w.eHpMax[i]).toBeCloseTo(12500, 6);
    const w2 = quiet();
    const sp = w2.eSpeed[spawnNow(w2, 'lord', 0, 0)]!;
    const j = boss(w2, ['tough', 'swift'], true);
    expect(w2.eHpMax[j]).toBeCloseTo(11250, 6);
    expect(w2.eSpeed[j]! / sp).toBeCloseTo(1.125, 6);
  });

  it('护：到点上盾 = 8% 血上限，盾先吸伤，打破才掉血', () => {
    const w = quiet();
    const i = boss(w, ['shield']);
    tick(w, i, AFFIX_FX.shield.first);
    expect(affixShieldLeft(w, i)).toBeCloseTo(800, 6);
    w.eHp[i]! -= 500;
    tick(w, i);
    expect(affixShieldLeft(w, i)).toBeCloseTo(300, 6);
    w.eHp[i]! -= 500;
    tick(w, i);
    expect(affixShieldLeft(w, i)).toBe(0);
    expect(w.eHp[i]).toBeCloseTo(9800, 6);
    const w2 = quiet();
    const j = boss(w2, ['shield'], true);
    tick(w2, j, AFFIX_FX.shield.first);
    expect(affixShieldLeft(w2, j)).toBeCloseTo(400, 6);
  });

  it('分：半血分出 2 个影子（镇尺 1 个），只一次；本体倒了影子散', () => {
    const w = quiet();
    const i = boss(w, ['split']);
    w.eHp[i] = 4900;
    tick(w, i, 5);
    expect(alive(w, 'yingzi')).toBe(2);
    w.eAlive[i] = 0;
    w.eCount--;
    foeTick(w);
    expect(alive(w, 'yingzi')).toBe(0);
    const w2 = quiet();
    const j = boss(w2, ['split'], true);
    w2.eHp[j] = 4900;
    tick(w2, j);
    expect(alive(w2, 'yingzi')).toBe(1);
  });

  it('招：每 12 秒召 6 只这张图的特色小怪（镇尺 3 只）', () => {
    for (const [ruler, n] of [[false, 6], [true, 3]] as const) {
      const w = quiet();
      const i = boss(w, ['summon'], ruler);
      const before = w.eCount;
      tick(w, i, AFFIX_FX.summon.first);
      expect(w.eCount - before).toBe(n);
      tick(w, i, AFFIX_FX.summon.every);
      expect(w.eCount - before).toBe(2 * n);
    }
  });

  it('狂：不到 40% 血伤害 ×1.3', () => {
    const w = quiet();
    const i = boss(w, ['rage']);
    tick(w, i);
    expect(w.eDmg[i]).toBe(10);
    w.eHp[i] = 3900;
    tick(w, i, 3);
    expect(w.eDmg[i]).toBeCloseTo(13, 6);
  });

  it('火：走过留鬼火，踩上去挨烧', () => {
    const w = quiet();
    const i = boss(w, ['trail']);
    tick(w, i, AFFIX_FX.trail.every + 1);
    const n = w.foe.hEnd.filter((t) => t > w.tick).length;
    expect(n).toBeGreaterThan(0);
    w.x = w.eX[i]!;
    w.y = w.eY[i]!;
    w.invuln = 0;
    const hp = w.hp;
    foeTick(w);
    expect(w.hp).toBeLessThan(hp);
  });

  it('吸：撞中主角回 3% 血上限', () => {
    const w = quiet();
    const i = boss(w, ['leech']);
    w.eHp[i] = 5000;
    tick(w, i);
    w.x = w.eX[i]!;
    w.y = w.eY[i]!;
    w.invuln = 0;
    api.hurt(w, 10, w.eKind[i]!);
    tick(w, i);
    expect(w.eHp[i]).toBeCloseTo(5300, 6);
  });

  it('风：预警 1 秒后把主角往它身边拽', () => {
    const w = quiet();
    const i = boss(w, ['wind']);
    const d0 = Math.abs(w.x - w.eX[i]!);
    tick(w, i, AFFIX_FX.wind.first + AFFIX_FX.wind.warn + 10);
    expect(Math.abs(w.x - w.eX[i]!)).toBeLessThan(d0 - 20);
  });
});

describe('红衣戏子、硕鼠将军搬进守夜世界', () => {
  for (const kind of ['hongyi', 'shuoshu'] as const) {
    it(`${kind} 在守夜里放 60 秒技能不报错`, () => {
      const w = quiet();
      const i = spawnNow(w, kind, w.x + 400, w.y);
      expect(i).toBeGreaterThanOrEqual(0);
      const seen = new Set<number>();
      for (let t = 0; t < 60 * 30; t++) {
        w.hp = w.stats.hpMax;
        step(w, 0, -1);
        for (let k = 0; k < w.ev.n; k++) if (w.ev.type[k] === Ev.Foe) seen.add(w.ev.a[k]!);
      }
      expect(w.phase).toBe('play');
      expect(seen.size).toBeGreaterThan(1);
    });
  }
});
