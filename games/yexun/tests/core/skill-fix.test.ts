// 规则 59：第二件起手时技能借的法器不在手上——纸匠的剪纸成军照样剪纸兵，小道士、剑侠、符师的技能伤害跟着成长走。
// 实盘也走修好的逻辑（主线 11-15 定）；只变这四个角色的第二起手，其余配置和规则 58 逐位一致
import { describe, expect, it } from 'vitest';
import { createWorld, fingerprint, Shot, step, MAX_SHOTS, type Setup, type World } from '../../src/core/index.ts';
import { borrowStats } from '../../src/core/skills.ts';
import { spawnNow } from '../../src/core/debug.ts';
import { LIVE_CHAR_IDS } from '../../src/content/live.ts';
import { weaponStats } from '../../src/content/weapons.ts';
import { liveSetup } from '../../src/platform/live.ts';
import type { CharacterId } from '../../src/content/meta.ts';

const AFFECTED: readonly CharacterId[] = ['zhijiang', 'xiaodao', 'jianxia', 'fushi'];

// 升级优先升手上已有的法器（这样法器才会过 1 级，借等级的差别才显出来），没有就选第一张
const pick = (w: World): number => Math.max(0, w.choices.findIndex((c) => c.kind === 'weapon' && w.weapons.some((o) => o.id === c.id)));

// 固定输入跑 4 分钟：每 1.5 秒换个方向，技能一好就放
function run(s: Setup, rules?: number): World {
  const w = createWorld(s, rules);
  for (let t = 0; t < 7200 && w.phase !== 'over'; t++) step(w, Math.floor(t / 45) % 8, w.phase === 'choose' ? pick(w) : -1, 1);
  return w;
}

const papers = (w: World, slot: number): number => {
  let n = 0;
  for (let i = 0; i < MAX_SHOTS; i++) if (w.sAlive[i] && w.sKind[i] === Shot.Paper && w.sSlot[i] === slot) n++;
  return n;
};

describe('规则 59：第二件起手的技能', () => {
  it('实盘（开了技能的中档，规则 63 开的局：规则 60–63 的内容还没进实盘）：第一起手全部角色、第二起手另外五个角色和规则 58 逐位一致', () => {
    // 四个受影响角色的第二起手不在这里比：前几分钟技能打的怪大多一下就死，修没修指纹未必分得出，改在下面逐个量伤害
    for (const c of LIVE_CHAR_IDS) {
      for (const startAlt of [false, true]) {
        if (startAlt && AFFECTED.includes(c)) continue;
        const s = liveSetup('medium', 7, undefined, c, 'snow', startAlt ? { startAlt } : {});
        expect(s.character, c).toBe(c);
        expect(fingerprint(run(s, 63)), `${c} ${startAlt ? '第二起手' : '第一起手'}`).toBe(fingerprint(run(s, 58)));
      }
    }
  }, 60_000);

  // 主角四周围一圈打不死的怪，起手法器升到 5 级，放一次技能，量 60 拍里怪一共掉了多少血
  const skillHurt = (c: CharacterId, rules?: number): number => {
    const w = createWorld({ seed: 9, mode: 'vigil', danger: 0, character: c, startAlt: true }, rules);
    w.weapons[0]!.level = 5;
    const ids: number[] = [];
    for (let j = 0; j < 16; j++) ids.push(spawnNow(w, 'jiangshi', w.x + [1, 0.7, 0, -0.7, -1, -0.7, 0, 0.7][j % 8]! * (90 + 60 * (j >> 3)), w.y + [0, 0.7, 1, 0.7, 0, -0.7, -1, -0.7][j % 8]! * (90 + 60 * (j >> 3))));
    for (const e of ids) w.eHp[e] = 1e7;
    w.skill.cd = 0;
    step(w, 0, -1, 1);
    for (let t = 0; t < 60; t++) step(w, -1, w.phase === 'choose' ? 0 : -1, 0);
    return ids.reduce((n, e) => n + (1e7 - w.eHp[e]!), 0);
  };

  it('小道士、剑侠、符师第二起手：技能伤害跟着成长，比规则 58 高', () => {
    for (const c of ['xiaodao', 'jianxia', 'fushi'] as const) expect(skillHurt(c), c).toBeGreaterThan(skillHurt(c, 58));
  });

  it('借的法器不在手上：规则 59 按手上最高等级算，规则 58 一直 1 级；拿在手上的照旧用手上的', () => {
    const w = createWorld({ seed: 3, mode: 'vigil', danger: 2, character: 'xiaodao', startAlt: true });
    expect(w.weapons.some((o) => o.id === 'sword')).toBe(false);
    w.weapons[0]!.level = 5;
    expect(borrowStats(w, 'sword').dmg).toBe(weaponStats('sword', 5, false).dmg);
    expect(borrowStats(w, 'sword').dmg).toBeGreaterThan(weaponStats('sword', 1, false).dmg);
    const old = createWorld({ seed: 3, mode: 'vigil', danger: 2, character: 'xiaodao', startAlt: true }, 58);
    old.weapons[0]!.level = 5;
    expect(borrowStats(old, 'sword').dmg).toBe(weaponStats('sword', 1, false).dmg);
    const held = createWorld({ seed: 3, mode: 'vigil', danger: 2, character: 'xiaodao' });
    expect(borrowStats(held, 'sword')).toBe(held.wstats[0]);
  });

  it('纸匠第二起手放剪纸成军：剪出 4 个不挂槽位的纸兵，会打怪；规则 58 一个也剪不出', () => {
    const play = (rules?: number): { made: number; hurt: number } => {
      const w = createWorld({ seed: 5, mode: 'vigil', danger: 0, character: 'zhijiang', startAlt: true }, rules);
      expect(w.weapons.some((o) => o.id === 'zhibing')).toBe(false);
      for (let t = 0; t < 60; t++) step(w, -1, w.phase === 'choose' ? 0 : -1, 0);
      w.skill.cd = 0;
      step(w, -1, -1, 1);
      const made = papers(w, -1);
      const e = spawnNow(w, 'jiangshi', w.x + 70, w.y);
      w.eHp[e] = 1e7;
      const hp = w.eHp[e]!;
      for (let t = 0; t < 90; t++) step(w, -1, w.phase === 'choose' ? 0 : -1, 0);
      return { made, hurt: hp - w.eHp[e]! };
    };
    // 同一局只差纸兵：起手法器打掉的两边一样，多出来的是纸兵打的
    const now = play();
    const old = play(58);
    expect(now.made).toBe(4);
    expect(old.made).toBe(0);
    expect(now.hurt).toBeGreaterThan(old.hurt);
  });
});
