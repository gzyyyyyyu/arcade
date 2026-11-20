import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHAR_FX, CHARACTER_IDS, type CharacterId } from '../../src/content/meta.ts';
import { weaponStats } from '../../src/content/weapons.ts';
import { Drop, Ev, MAX_DROPS, MAX_ENEMIES, MAX_SHOTS, RULES_VERSION, Shot, createWorld, fingerprint, skillCooldown, skillReady, step, type World } from '../../src/core/index.ts';
import { spawnNow } from '../../src/core/debug.ts';
import { ENEMIES } from '../../src/content/enemies.ts';
import { SKILLS, SKILL_FX, SKILL_IDS, charDmgMul, paperRefund } from '../../src/core/skills.ts';
import { LIVE_SKILL_OPEN } from '../../src/content/live.ts';
import { MAP_IDS } from '../../src/content/maps.ts';
import { SK } from '../../src/view/art/skills.ts';
import { decodeSkills, encodeSkills, type ReplayRecord } from '../../src/replay/format.ts';
import { ReplayPlayer } from '../../src/replay/player.ts';
import { Recorder } from '../../src/replay/recorder.ts';

/** 干净的一局：去掉起手法器（自动出手会混进伤害），主角放在场地中间 */
function fresh(character: CharacterId, extra: Record<string, unknown> = {}): World {
  const w = createWorld({ seed: 20261101, mode: 'vigil', danger: 0, character, ...extra } as never);
  w.weapons.length = 0;
  w.wstats.length = 0;
  return w;
}
const idle = (w: World, n: number): void => {
  for (let i = 0; i < n; i++) step(w, 0, -1, 0);
};
/** 某类事件在这一拍的个数 */
const count = (w: World, t: number): number => {
  let n = 0;
  for (let i = 0; i < w.ev.n; i++) if (w.ev.type[i] === t) n++;
  return n;
};

describe('技能表', () => {
  it('每个角色一个技能，编号和事件里的一致（画面层的 SK 也一致）', () => {
    expect([...SKILL_IDS]).toEqual([...CHARACTER_IDS]);
    for (const id of CHARACTER_IDS) expect(SKILLS[id].code).toBe(SKILL_IDS.indexOf(id));
    expect(SK).toEqual({ sweep: 0, volley: 1, dash: 2, iron: 3, clap: 4, spring: 5, paper: 6, ferry: 7, fortune: 8, array: 9 });
    expect(CHARACTER_IDS.length).toBe(10);
  });
});

describe('每个技能的效果', () => {
  it('小道士·剑气纵横：面前扇形里的怪挨 4 倍桃木剑并被推开，身后的不动', () => {
    const w = fresh('xiaodao');
    w.face = 0;
    const front = spawnNow(w, 'general', w.x + 150, w.y);
    const back = spawnNow(w, 'general', w.x - 150, w.y);
    const hp0 = w.eHp[front]!;
    const hpBack = w.eHp[back]!;
    step(w, 0, -1, 1);
    expect(count(w, Ev.SkillUse)).toBe(1);
    expect(hp0 - w.eHp[front]!).toBeGreaterThanOrEqual(4 * weaponStats('sword', 1, false).dmg);
    expect(w.eKX[front]!).toBeGreaterThan(0);
    expect(w.eHp[back]).toBe(hpBack);
  });

  it('符师·万符齐发：一口气 12 张追踪符，各盯不同的怪，打得出伤害', () => {
    const w = fresh('fushi');
    const ids: number[] = [];
    for (let k = 0; k < 12; k++) ids.push(spawnNow(w, 'general', w.x + 160 + (k % 4) * 40, w.y + (k - 6) * 50));
    const hp0 = ids.map((i) => w.eHp[i]!);
    step(w, 0, -1, 1);
    let shots = 0;
    const targets = new Set<number>();
    for (let s = 0; s < MAX_SHOTS; s++) {
      if (w.sAlive[s] && w.sKind[s] === Shot.SkillFu) {
        shots++;
        targets.add(w.sIdx[s]!);
      }
    }
    expect(shots).toBe(SKILL_FX.volley.n);
    expect(targets.size).toBe(12);
    idle(w, 60);
    const hurt = ids.filter((i, k) => !w.eAlive[i] || w.eHp[i]! < hp0[k]!).length;
    expect(hurt).toBeGreaterThanOrEqual(8);
  });

  it('剑侠·御剑突进：沿面向冲出一段，路上的怪挨一刀，冲的时候无敌', () => {
    const w = fresh('jianxia');
    w.face = 0;
    const x0 = w.x;
    const mid = spawnNow(w, 'general', w.x + 160, w.y);
    const far = spawnNow(w, 'general', w.x + 500, w.y);
    const hp0 = w.eHp[mid]!;
    step(w, 0, -1, 1);
    expect(w.x - x0).toBeGreaterThan(SKILL_FX.dash.dist - 20);
    expect(w.eHp[mid]!).toBeLessThan(hp0);
    expect(w.eHp[far]).toBe(w.eHpMax[far]);
    expect(w.invuln).toBeGreaterThanOrEqual(SKILL_FX.dash.invuln - 1);
    // 一拍里同一只最多挨一刀
    expect(hp0 - w.eHp[mid]!).toBeLessThanOrEqual(3 * weaponStats('flysword', 1, false).dmg * 2.6);
  });

  it('胖师叔·铁布衫：期间挨打只掉两成，结束时震开身边的怪', () => {
    const drop = (skill: number): number => {
      const w = fresh('pang');
      w.hp = w.stats.hpMax;
      if (skill) step(w, 0, -1, 1);
      const i = spawnNow(w, 'general', w.x, w.y);
      w.eDmg[i] = 50;
      w.eSpeed[i] = 0;
      const before = w.hp;
      idle(w, 3);
      return before - w.hp;
    };
    const plain = drop(0);
    const iron = drop(1);
    expect(plain).toBeGreaterThan(20);
    expect(iron).toBeLessThanOrEqual(Math.round(plain * 0.2) + 1);
    expect(iron).toBeGreaterThan(0);

    const w = fresh('pang');
    step(w, 0, -1, 1);
    const n = spawnNow(w, 'general', w.x + 100, w.y);
    w.eSpeed[n] = 0;
    w.eKX[n] = 0;
    let ended = 0;
    let kx = 0;
    for (let t = 0; t < SKILLS.pang.dur + 2; t++) {
      step(w, 0, -1, 0);
      ended += count(w, Ev.SkillEnd);
      if (count(w, Ev.SkillEnd)) kx = w.eKX[n]!;
    }
    expect(ended).toBe(1);
    expect(kx).toBeGreaterThan(5);
    expect(w.skill.active).toBe(0);
  });

  it('更夫·梆子声声：12 秒敲 6 次，近处的怪每次退一步并受伤，远处的不受影响', () => {
    const w = fresh('gengfu');
    const near = spawnNow(w, 'general', w.x + 120, w.y);
    const far = spawnNow(w, 'general', w.x + 900, w.y);
    w.eSpeed[near] = 0;
    w.eSpeed[far] = 0;
    const hp0 = w.eHp[near]!;
    let beats = 0;
    step(w, 0, -1, 1);
    beats += count(w, Ev.SkillBeat);
    for (let t = 0; t < SKILLS.gengfu.dur + 5; t++) {
      step(w, 0, -1, 0);
      beats += count(w, Ev.SkillBeat);
    }
    expect(beats).toBe(6);
    expect(w.eHp[near]!).toBeLessThan(hp0 - 5 * (SKILL_FX.clapper.dmg + SKILL_FX.clapper.perLevel));
    expect(w.eHp[far]).toBe(w.eHpMax[far]);
  });

  it('采药女·回春：立刻回 35% 血，再 6 秒每秒回 3%，身边的怪走得慢', () => {
    const w = fresh('caiyao');
    w.hp = w.stats.hpMax * 0.4;
    const near = spawnNow(w, 'general', w.x + 80, w.y);
    const far = spawnNow(w, 'general', w.x + 600, w.y);
    w.eSpeed[near] = w.eSpeed[far]!;
    // 不让它们碰到人（要量的是回的血）
    w.eDmg[near] = 0;
    w.eDmg[far] = 0;
    const hp0 = w.hp;
    step(w, 0, -1, 1);
    expect(w.hp - hp0).toBeGreaterThanOrEqual(w.stats.hpMax * 0.35 - 1);
    const hpAfterBurst = w.hp;
    idle(w, 2);
    // 慢一半：记在 eSlow 里，近处是 2，远处是 0
    expect(w.eSlow[near]).toBe(2);
    expect(w.eSlow[far]).toBe(0);
    idle(w, SKILLS.caiyao.dur);
    expect(w.hp - hpAfterBurst).toBeGreaterThan(w.stats.hpMax * 0.15);
    expect(w.skill.active).toBe(0);
  });
  it('每个技能都有专属图标（sk_ 开头，十个互不相同）', () => {
    const icons = CHARACTER_IDS.map((id) => SKILLS[id].icon);
    expect(new Set(icons).size).toBe(10);
    for (const i of icons) expect(i.startsWith('sk_')).toBe(true);
  });

  it('纸匠·剪纸成军：身边立刻出 4 个纸兵，超过法器的上限，寿命吃巧手，倒下时有时还冷却', () => {
    const w = createWorld({ seed: 20261101, mode: 'vigil', danger: 0, character: 'zhijiang' } as never);
    w.nextEvent = w.schedule.length;
    expect(w.weapons[0]!.id).toBe('zhibing');
    const papers = (): number => {
      let n = 0;
      for (let s = 0; s < MAX_SHOTS; s++) if (w.sAlive[s] && w.sKind[s] === Shot.Paper) n++;
      return n;
    };
    idle(w, 1);
    const before = papers();
    step(w, 0, -1, 1);
    expect(count(w, Ev.SkillUse)).toBe(1);
    expect(papers() - before).toBe(SKILL_FX.paper.n);
    // 8 秒的寿命乘巧手的 1.3 倍（不带别的寿命加成时）
    let life = 0;
    for (let s = 0; s < MAX_SHOTS; s++) if (w.sAlive[s] && w.sKind[s] === Shot.Paper) life = Math.max(life, w.sLife[s]!);
    expect(life).toBeGreaterThanOrEqual(Math.round(SKILL_FX.paper.life * CHAR_FX.zhijiangLife) - 2);
    // 再等 8 秒多：技能出的纸兵到点就散（巧手让它多活到 10.4 秒）
    idle(w, Math.round(SKILL_FX.paper.life * CHAR_FX.zhijiangLife) + 40);
    expect(papers()).toBeLessThanOrEqual(before + 1);
    // 巧手的"还冷却"：纸兵寿尽倒下的拍号里，大约两成会还（固定散列，同一拍同一槽位结果不变）
    const hit = (tick: number): boolean => {
      w.tick = tick;
      return paperRefund(w, 3);
    };
    let got = 0;
    for (let t = 0; t < 1000; t++) if (hit(t)) got++;
    expect(got).toBeGreaterThan(150);
    expect(got).toBeLessThan(250);
    expect(hit(77)).toBe(hit(77));
  });

  it('摆渡人·横江一渡：水域里主角快三成、怪慢，水域跟着走，5 秒后收；顺水：水里不减速', () => {
    const w = fresh('baidu');
    const near = spawnNow(w, 'general', w.x + 100, w.y);
    const far = spawnNow(w, 'general', w.x + 700, w.y);
    w.eDmg[near] = 0;
    w.eDmg[far] = 0;
    const x0 = w.x;
    step(w, 9, -1, 0);
    const walked = w.x - x0;
    const w2 = fresh('baidu');
    step(w2, 0, -1, 1);
    const x1 = w2.x;
    step(w2, 9, -1, 0);
    expect(w2.x - x1).toBeCloseTo(walked * SKILL_FX.ferry.speed, 4);
    idle(w, 0);
    step(w, 0, -1, 1);
    idle(w, 2);
    expect(w.eSlow[near]).toBe(1);
    expect(w.eSlow[far]).toBe(0);
    // 跟着走：走远之后原来的怪出圈、新靠近的进圈
    idle(w, SKILLS.baidu.dur);
    expect(w.skill.active).toBe(0);
    expect(count(w, Ev.SkillEnd)).toBeLessThanOrEqual(1);
    // 水类法器 +50%（规则 67 起，之前 +10%），别的不变（记功的法器是水的才加）
    expect(charDmgMul(w, 'tide')).toBe(CHAR_FX.baiduWater67);
    expect(charDmgMul(w, 'sword')).toBe(1);
  });

  it('货郎·招财进宝：全屏魂珠和铜钱立刻飞向身上，10 秒里打倒的怪多掉一枚铜钱；讨价：夜市九折、攒钱加伤害', () => {
    const w = fresh('huolang');
    // 远处放一颗魂珠、一枚铜钱，先不在磁吸范围里
    const put = (kind: Drop, x: number, y: number): number => {
      for (let i = 0; i < MAX_DROPS; i++) {
        if (w.dAlive[i]) continue;
        w.dAlive[i] = 1;
        w.dKind[i] = kind;
        w.dX[i] = x;
        w.dY[i] = y;
        w.dVal[i] = 1;
        w.dPull[i] = 0;
        w.dCount++;
        return i;
      }
      return -1;
    };
    const soul = put(Drop.Soul, w.x + 1500, w.y);
    const coin = put(Drop.Coin, w.x - 1500, w.y + 3);
    const chest = put(Drop.Chest, w.x, w.y + 1500);
    idle(w, 3);
    expect(w.dPull[soul]).toBe(0);
    step(w, 0, -1, 1);
    expect(w.dPull[soul]).toBeGreaterThan(0);
    expect(w.dPull[coin]).toBeGreaterThan(0);
    expect(w.dPull[chest]).toBe(0);
    // 期间打倒一只怪，铜钱比不放技能时多（同种子两局对照：一局先放技能，一局不放）
    const kill = (cast: boolean): number => {
      const v = createWorld({ seed: 4242, mode: 'vigil', danger: 0, character: 'huolang' } as never);
      v.nextEvent = v.schedule.length;
      step(v, 0, -1, cast ? 1 : 0);
      const e = spawnNow(v, 'general', v.x + 60, v.y);
      v.eDmg[e] = 0;
      v.eHp[e] = 0.01;
      for (let t = 0; t < 120 && v.eAlive[e]; t++) step(v, 0, -1, 0);
      expect(v.eAlive[e]).toBe(0);
      let ground = 0;
      for (let i = 0; i < MAX_DROPS; i++) if (v.dAlive[i] && v.dKind[i] === Drop.Coin) ground++;
      return ground + v.coins;
    };
    expect(kill(true)).toBeGreaterThan(kill(false));
    expect(skillCooldown(w)).toBe(SKILLS.huolang.cd);
    // 讨价：铜钱每满 100 枚 +1%，最多 +10%
    w.coins = 0;
    expect(charDmgMul(w, undefined)).toBe(1);
    w.coins = 350;
    expect(charDmgMul(w, undefined)).toBeCloseTo(1.03, 6);
    w.coins = 99999;
    expect(charDmgMul(w, undefined)).toBeCloseTo(1.1, 6);
    expect(w.stats.coinBonus).toBeGreaterThanOrEqual(CHAR_FX.huolangCoin);
  });

  it('阴阳先生·定阵：布阵那一刻阵里的怪定住 1.5 秒，阵里慢四成，阵钉在原地；Boss 定不住；阴阳互济看血', () => {
    const w = fresh('yinyang');
    const a = spawnNow(w, 'general', w.x + 100, w.y);
    const far = spawnNow(w, 'general', w.x + 800, w.y);
    w.eDmg[a] = 0;
    w.eDmg[far] = 0;
    const ax = w.x;
    const ay = w.y;
    step(w, 0, -1, 1);
    expect(count(w, Ev.SkillUse)).toBe(1);
    expect(w.eBind[a]!).toBeGreaterThan(w.tick);
    expect(w.eBind[far]!).toBeLessThanOrEqual(w.tick);
    const x0 = w.eX[a]!;
    idle(w, SKILL_FX.array.bind - 5);
    expect(Math.abs(w.eX[a]! - x0)).toBeLessThan(2);
    // 定住过后还在阵里：慢四成（记 1 档）；阵钉在原地，主角走开后阵不跟
    expect(w.skill.zx).toBe(ax);
    expect(w.skill.zy).toBe(ay);
    idle(w, 30);
    expect(w.eSlow[a]).toBe(1);
    // 阴阳互济：血过半 +8%，不足一半 −8% 冷却（只算一半的话是 −4%，见 skillCooldown 的 bonus/2）
    w.hp = w.stats.hpMax;
    expect(charDmgMul(w, undefined)).toBe(CHAR_FX.yinyangHigh);
    expect(skillCooldown(w)).toBe(SKILLS.yinyang.cd);
    w.hp = w.stats.hpMax * 0.3;
    expect(charDmgMul(w, undefined)).toBe(1);
    expect(skillCooldown(w)).toBe(Math.round(SKILLS.yinyang.cd * (1 - CHAR_FX.yinyangCd / 2)));
    idle(w, SKILLS.yinyang.dur);
    expect(w.skill.active).toBe(0);
  });

  it('阴阳先生·定阵：Boss 不被定住', () => {
    const w = fresh('yinyang');
    const b = spawnNow(w, 'boss', w.x + 60, w.y);
    const g = spawnNow(w, 'general', w.x - 60, w.y);
    expect(ENEMIES[w.eKind[b]!]!.boss).toBe(true);
    step(w, 0, -1, 1);
    expect(w.eBind[b]!).toBeLessThanOrEqual(w.tick);
    expect(w.eBind[g]!).toBeGreaterThan(w.tick);
  });

});

describe('实盘技能只在开放的「档位 × 地图」里放（规则版本 39 起）', () => {
  // danger 0 = 小档，2 = 中档；地图缺省雪原
  const mk = (extra: Record<string, unknown>, rules?: number): World => createWorld({ seed: 99, mode: 'vigil', danger: 0, character: 'xiaodao', live: true, ...extra } as never, rules);
  const run = (extra: Record<string, unknown>, press: boolean, rules?: number): { uses: number; fp: number } => {
    const w = mk(extra, rules);
    for (let t = 0; t < 200; t++) step(w, (t >> 4) % 33, w.phase === 'choose' ? 0 : -1, press && t % 10 === 3 ? 1 : 0);
    return { uses: w.skill.uses, fp: fingerprint(w) };
  };

  it('表里的格子（小档 × 雪原）能放技能，HUD 的"好了"也认', () => {
    expect(LIVE_SKILL_OPEN.small).toContain('snow');
    const w = mk({});
    expect(w.liveNoSkill).toBe(false);
    expect(skillReady(w)).toBe(true);
    expect(run({}, true).uses).toBeGreaterThan(0);
    expect(run({}, true).fp).not.toBe(run({}, false).fp);
  });

  it('规则 44 及以前开的局：当时表外的格子（和夜探实盘）按技能键不生效，指纹和不按完全相同，和线上原样一致', () => {
    const outside: Record<string, unknown>[] = [{ danger: 2, map: 'guishi' }, { danger: 4, map: 'guishi' }, { mode: 'raid', raid: { template: 'guzhen', live: 'small' } }];
    for (const map of MAP_IDS) if (!LIVE_SKILL_OPEN.small.includes(map)) outside.push({ map });
    for (const o of outside) {
      const w = mk(o, 44);
      expect(w.liveNoSkill, JSON.stringify(o)).toBe(true);
      expect(skillReady(w), JSON.stringify(o)).toBe(false);
      const a = run(o, true, 44), b = run(o, false, 44);
      expect(a.uses, JSON.stringify(o)).toBe(0);
      expect(a.fp, JSON.stringify(o)).toBe(b.fp);
    }
  });

  it('0.17.0（规则版本 40）起中档以上雪原能放技能；规则版本 39 的同一格录像回放时仍按 0.16.0 的表，按技能键不生效', () => {
    for (const danger of [2, 3, 4]) {
      const now = mk({ danger });
      expect(now.liveNoSkill, `危险 ${danger}`).toBe(false);
      expect(run({ danger }, true).uses, `危险 ${danger}`).toBeGreaterThan(0);
      const old = mk({ danger }, 39);
      expect(old.liveNoSkill, `危险 ${danger} 旧录像`).toBe(true);
      expect(run({ danger }, true, 39).uses).toBe(0);
      expect(run({ danger }, true, 39).fp).toBe(run({ danger }, false, 39).fp);
    }
    // 没过的角色在开了的档里照旧不放技能（更夫大档）
    const g = mk({ danger: 3, character: 'gengfu' }, 44);
    expect(g.liveNoSkill).toBe(true);
    expect(run({ danger: 3, character: 'gengfu' }, true, 44).fp).toBe(run({ danger: 3, character: 'gengfu' }, false, 44).fp);
    // 0.17.10（规则 45）起都放技能
    expect(mk({ danger: 3, character: 'gengfu' }).liveNoSkill).toBe(false);
    // 小档雪原在 39 和 40 都开
    expect(mk({}, 39).liveNoSkill).toBe(false);
  });

  it('0.17.8（规则版本 43）起小档河滩、义庄、荒庙、鬼市能放技能；规则版本 42 的同一格录像按技能键不生效', () => {
    for (const map of ['riverbank', 'yizhuang', 'temple', 'guishi']) {
      expect(mk({ map }).liveNoSkill, map).toBe(false);
      expect(run({ map }, true).uses, map).toBeGreaterThan(0);
      expect(mk({ map }, 42).liveNoSkill, `${map} 旧录像`).toBe(true);
      expect(run({ map }, true, 42).fp, map).toBe(run({ map }, false, 42).fp);
    }
  });

  it('规则版本 38 的实盘录像（哪怕是表里的格子）回放时按技能键不生效，指纹和不按完全相同', () => {
    const w = mk({}, 38);
    expect(w.liveNoSkill).toBe(true);
    expect(skillReady(w)).toBe(false);
    expect(run({}, true, 38).uses).toBe(0);
    expect(run({}, true, 38).fp).toBe(run({}, false, 38).fp);
    // 非实盘的旧录像不受影响
    expect(createWorld({ seed: 99, mode: 'vigil', danger: 0 } as never, 38).liveNoSkill).toBe(false);
  });
});

describe('冷却', () => {
  it('放完进冷却，冷却里再按没用；冷却完能再放', () => {
    const w = fresh('xiaodao');
    expect(skillReady(w)).toBe(true);
    step(w, 0, -1, 1);
    expect(w.skill.uses).toBe(1);
    expect(w.skill.cd).toBe(SKILLS.xiaodao.cd - 1);
    expect(skillReady(w)).toBe(false);
    for (let t = 0; t < SKILLS.xiaodao.cd - 1; t++) step(w, 0, -1, 1);
    expect(w.skill.uses).toBe(1);
    step(w, 0, -1, 1);
    expect(w.skill.uses).toBe(2);
  });

  it('香炉、灵气的冷却加成只算一半', () => {
    const base = fresh('xiaodao');
    expect(skillCooldown(base)).toBe(360);
    const incense = fresh('xiaodao');
    incense.passives.xianglu = 5; // 冷却 −40%，技能只吃 −20%
    expect(skillCooldown(incense)).toBe(288);
    const both = fresh('xiaodao', { perks: { lingqi: 5 } }); // 灵气 −15% → −7.5%
    expect(skillCooldown(both)).toBe(333);
    both.passives.xianglu = 5;
    expect(skillCooldown(both)).toBe(Math.round(360 * (1 - (0.4 + 0.15) / 2)));
  });

  it('不在打（选卡、结束）时按技能键无效', () => {
    const w = fresh('xiaodao');
    w.phase = 'choose';
    step(w, 0, -1, 1);
    expect(w.skill.uses).toBe(0);
    w.phase = 'over';
    step(w, 0, -1, 1);
    expect(w.skill.uses).toBe(0);
  });
});

describe('确定性和指纹', () => {
  const run = (character: CharacterId, press: (t: number) => number, ticks: number): number[] => {
    const w = createWorld({ seed: 77, mode: 'vigil', danger: 2, character } as never);
    const fps: number[] = [];
    for (let t = 0; t < ticks; t++) {
      step(w, w.phase === 'choose' ? 0 : (t >> 4) % 33, w.phase === 'choose' ? 0 : -1, press(t));
      fps.push(fingerprint(w));
    }
    return fps;
  };

  it('同种子同输入（含技能键）逐拍指纹相同，10 个角色都是', () => {
    for (const id of CHARACTER_IDS) {
      const press = (t: number): number => (t % 150 === 40 ? 1 : 0);
      expect(run(id, press, 900)).toEqual(run(id, press, 900));
    }
  }, 60_000);

  it('放了技能，指纹就不一样；一次没放，指纹里没有技能的部分', () => {
    const none = run('xiaodao', () => 0, 300);
    const some = run('xiaodao', (t) => (t === 100 ? 1 : 0), 300);
    expect(some[99]).toBe(none[99]);
    expect(some[100]).not.toBe(none[100]);
    expect(some[299]).not.toBe(none[299]);
  });
});

describe('录像', () => {
  it('技能键拍号往返；坏数据解不开', () => {
    expect(decodeSkills(encodeSkills([5, 90, 420]))).toEqual([5, 90, 420]);
    expect(decodeSkills(undefined)).toEqual([]);
    expect(decodeSkills('')).toEqual([]);
    expect(decodeSkills('5,5')).toBeNull();
    expect(decodeSkills('9,3')).toBeNull();
    expect(decodeSkills('a')).toBeNull();
  });

  it('旧卡池标记只由规则版本决定：<37 的录像带上，37 起的不带；不进 Setup，存档里带不进来', () => {
    const items = JSON.parse(readFileSync(new URL('../fixtures/replay-pre-skill.json', import.meta.url), 'utf8')) as { rec: ReplayRecord; fp: number }[];
    for (const it of items) {
      expect(ReplayPlayer.from(it.rec)!.world.legacyPool).toBe(true);
      expect(ReplayPlayer.from({ ...it.rec, rules: RULES_VERSION })!.world.legacyPool).toBe(false);
      // 玩家在存档 / URL 里塞 legacyPool 没用：整理开局设置时不认
      const smuggled = createWorld({ ...it.rec.setup, legacyPool: true } as never);
      expect(smuggled.legacyPool).toBe(false);
      // 新局不带标记，同一份设置按当前卡池走，指纹不会和旧录像的一样
      const fresh = ReplayPlayer.from({ ...it.rec, rules: RULES_VERSION })!;
      while (!fresh.done) fresh.tickOnce();
      expect(fingerprint(fresh.world)).not.toBe(it.fp);
    }
  });

  it('带技能的录像：录下真放出去的拍号（冷却中的空按不记），重放逐位一致', () => {
    for (const character of ['xiaodao', 'jianxia', 'caiyao', 'zhijiang', 'baidu', 'huolang', 'yinyang'] as const) {
      const setup = { seed: 31415, mode: 'vigil', danger: 2, curses: [], character } as const;
      const w = createWorld(setup as never);
      const r = new Recorder(setup as never, 1_700_000_000_000);
      for (let t = 0; t < 1500 && w.phase !== 'over'; t++) {
        const choose = w.phase === 'choose';
        // 每 20 拍按一次：大部分落在冷却里
        const skill = t % 20 === 7 ? 1 : 0;
        const dir = choose ? 0 : (t >> 5) % 33;
        r.before(w, dir, choose ? 0 : -1, skill);
        step(w, dir, choose ? 0 : -1, skill);
      }
      const rec = r.finish(w, { won: false, quit: true, seconds: 0, kills: w.kills, level: w.level, bossKilled: false, loot: 0, daily: null });
      expect(w.skill.uses).toBeGreaterThan(1);
      expect(decodeSkills(rec.skills)!.length).toBe(w.skill.uses);
      const p = ReplayPlayer.from(rec)!;
      expect(p.outdated).toBe(false);
      while (!p.done) p.tickOnce();
      expect(p.world.skill.uses).toBe(w.skill.uses);
      expect(fingerprint(p.world)).toBe(fingerprint(w));
    }
  });

  it('没按过技能键的录像不写 skills 这一项', () => {
    const setup = { seed: 5, mode: 'vigil', danger: 0, curses: [] } as const;
    const w = createWorld(setup as never);
    const r = new Recorder(setup as never, 1);
    for (let t = 0; t < 60; t++) {
      r.before(w, 1, -1, 0);
      step(w, 1, -1, 0);
    }
    const rec = r.finish(w, { won: false, quit: true, seconds: 0, kills: 0, level: 1, bossKilled: false, loot: 0, daily: null });
    expect('skills' in rec).toBe(false);
  });
});

describe('不碰无关的状态', () => {
  it('技能的怪槽位不会越界（满怪时放万符）', () => {
    const w = fresh('fushi');
    for (let k = 0; k < MAX_ENEMIES; k++) spawnNow(w, 'paper', w.x + 100 + (k % 30) * 20, w.y + Math.floor(k / 30) * 20 - 100);
    step(w, 0, -1, 1);
    idle(w, 20);
    expect(w.skill.uses).toBe(1);
  });
});

describe('技能特效', () => {
  it('每个技能放出来都有画面：新四个各自出特效，且都用主图集里有的帧', async () => {
    const { playSkillFx } = await import('../../src/view/art/skills.ts');
    const { SPRITES } = await import('../../src/view/art/sprites.ts');
    const { SPRITES2 } = await import('../../src/view/art/sprites-mobs.ts');
    const { SPRITES3 } = await import('../../src/view/art/sprites-relics.ts');
    const has = new Set([...SPRITES, ...SPRITES2, ...SPRITES3].map((d) => d.key));
    for (const id of ['zhijiang', 'baidu', 'huolang', 'yinyang'] as const) {
      const frames: string[] = [];
      const rec = { spawn: (o: { frame: string }): void => void frames.push(o.frame) };
      const ctx = { fx: rec, ground: rec, hero: () => ({ x: 0, y: 0 }), depth: 0, low: false, shake: () => undefined };
      const w = fresh(id);
      w.nextEvent = w.schedule.length;
      step(w, 0, -1, 1);
      let n = 0;
      for (let i = 0; i < w.ev.n; i++) {
        if (w.ev.type[i] === Ev.SkillUse) {
          n++;
          playSkillFx(ctx, Ev.SkillUse, w.ev.x[i]!, w.ev.y[i]!, w.ev.a[i]!, w.ev.b[i]!, w.ev.c[i]!);
        }
      }
      expect(n, id).toBe(1);
      expect(frames.length, id).toBeGreaterThan(3);
      for (const f of frames) expect(has.has(f), `${id} ${f}`).toBe(true);
    }
  });
});
