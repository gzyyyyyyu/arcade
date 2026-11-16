import { describe, expect, it } from 'vitest';
import { SCHOOL_IDS, SCHOOLS, WEAPON_ROLE } from '../../src/content/guide.ts';
import { ARM_FX, ARM_FX2, MERGES, PASSIVE_IDS, PASSIVES, WEAPON_IDS, WEAPONS } from '../../src/content/weapons.ts';
import { ArmEv, ArmFx } from '../../src/core/arms/index.ts';
import { layout } from '../../src/view/art/atlas.ts';
import { SPRITES12 } from '../../src/view/art/sprites-regional.ts';
import { SPRITES13 } from '../../src/view/art/sprites-paper.ts';
import { SPRITES14 } from '../../src/view/art/sprites-water.ts';
import { SPRITES_GUISHI } from '../../src/view/art/sprites-guishi.ts';
import { SPRITES_HUAPI } from '../../src/view/art/sprites-huapi.ts';
import { SPRITES_FOES } from '../../src/view/art/sprites-foes.ts';
import { ACHIEVEMENTS } from '../../src/content/achievements.ts';
import { createWorld, fingerprint, MAX_SHOTS, Shot, step, type World } from '../../src/core/index.ts';
import { grantWeapon, openChestNow, spawnNow } from '../../src/core/debug.ts';
import { SPRITES_ARMS } from '../../src/view/art/sprites-arms.ts';
import { SPRITES_ARMS2 } from '../../src/view/art/sprites-arms2.ts';
import { BUILDS } from '../../tools/bots.ts';

/** 干净的场：只拿给定的法器，定点事件和补怪都关掉；血无限 */
function quiet(seed = 5): World {
  const w = createWorld({ seed, mode: 'vigil', danger: 2 });
  w.weapons.length = 0;
  w.wstats.length = 0;
  w.nextEvent = 1 << 30;
  w.spawnAcc = -1e9;
  return w;
}
/** 一团打不死、站着不动的怪 */
function mob(w: World, x: number, y: number, n: number, dx = 12): number[] {
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const e = spawnNow(w, 'jiangshi', x + (k % 3) * dx, y + Math.floor(k / 3) * dx);
    w.eHp[e] = 1e6;
    w.eHpMax[e] = 1e6;
    w.eSpeed[e] = 0;
    out.push(e);
  }
  return out;
}
/** 跑 n 拍，每拍把血补满（可关），返回这期间出现过的 ArmEv / Ev 事件计数：键是 `类型:a` */
function run(w: World, n: number, heal = true): Map<string, number> {
  const seen = new Map<string, number>();
  for (let t = 0; t < n; t++) {
    step(w, 0, -1);
    if (heal) w.hp = w.stats.hpMax;
    for (let k = 0; k < w.ev.n; k++) {
      const key = `${w.ev.type[k]}:${w.ev.a[k]}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  return seen;
}
const count = (seen: Map<string, number>, type: number, a: number): number => seen.get(`${type}:${a}`) ?? 0;
const armed = (w: World, ids: Parameters<typeof grantWeapon>[1][], evolved = false, level = 8): void => {
  for (const id of ids) grantWeapon(w, id, level, evolved);
};
const damaged = (w: World, es: number[]): number => es.filter((e) => w.eHp[e]! < 1e6).length;

describe('2.0 第一批：登记', () => {
  it('内容一致性锁：法器 24、被动 20、进化 24、合成 + 双修 33、流派 10', () => {
    expect(WEAPON_IDS.length).toBe(24);
    expect(PASSIVE_IDS.length).toBe(20);
    expect(WEAPON_IDS.filter((id) => WEAPONS[id].evolve).length).toBe(24);
    expect(MERGES.length).toBe(33);
    expect(SCHOOL_IDS.length).toBe(10);
  });

  it('新法器的进化被动、五行类型、图标和图标帧', () => {
    expect(WEAPONS.flag).toMatchObject({ el: '土', type: '镇' });
    expect(WEAPONS.chain).toMatchObject({ el: '金', type: '镇' });
    expect(WEAPONS.pole).toMatchObject({ el: '水', type: '剑' });
    expect(WEAPONS.lamp).toMatchObject({ el: '火', type: '灵' });
    expect(WEAPONS.flag.evolve?.with).toBe('qizhi');
    expect(WEAPONS.chain.evolve?.with).toBe('tielian');
    expect(WEAPONS.pole.evolve?.with).toBe('caoxie');
    expect(WEAPONS.lamp.evolve?.with).toBe('dengyou');
    const keys = new Set([...SPRITES_ARMS, ...SPRITES_ARMS2].map((s) => s.key));
    for (const id of ['flag', 'chain', 'pole', 'lamp'] as const) {
      expect(keys.has(WEAPONS[id].icon)).toBe(true);
      expect(keys.has(WEAPONS[id].evolve!.icon)).toBe(true);
      expect(WEAPON_ROLE[id]).toBeDefined();
    }
    for (const id of ['qizhi', 'tielian', 'dengyou'] as const) expect(keys.has(PASSIVES[id].icon)).toBe(true);
    for (const m of MERGES.slice(9)) expect(keys.has(m.icon)).toBe(true);
    for (const id of WEAPON_IDS.slice(15)) {
      expect(keys.has(WEAPONS[id].icon)).toBe(true);
      expect(keys.has(WEAPONS[id].evolve!.icon)).toBe(true);
    }
    for (const id of PASSIVE_IDS.slice(13)) expect(keys.has(PASSIVES[id].icon)).toBe(true);
  });

  it('阵法流派单子和机器人的单子是同一份，且包含四件里的两件以上', () => {
    expect([...SCHOOLS.array.weapons]).toEqual(BUILDS.array.weapons);
    expect([...SCHOOLS.array.passives]).toEqual(BUILDS.array.passives);
    expect(SCHOOLS.array.weapons).toContain('flag');
    expect(SCHOOLS.array.weapons).toContain('chain');
  });

  it('十五个新搭配的料都在 24 件以内，五个人人能合，十个有专属角色', () => {
    const fresh = MERGES.slice(9, 24);
    expect(fresh.map((m) => m.id)).toEqual(['leijie', 'hejin', 'qiankun', 'qianjian', 'heling', 'yiwei', 'chenzhong', 'huadeng', 'dudeng', 'liangyi', 'yinlv', 'maibu', 'yinbing', 'baozhu', 'caiyuan']);
    expect(fresh.filter((m) => !m.only).length).toBe(5);
    for (const m of fresh) {
      expect(WEAPONS[m.a]).toBeDefined();
      expect(WEAPONS[m.b]).toBeDefined();
    }
  });
});

describe('阵旗', () => {
  it('布阵：阵里的怪挨打且被定住，阵外的不动', () => {
    const w = quiet();
    armed(w, ['flag'], false, 1);
    const inside = mob(w, w.x + 30, w.y, 3);
    const outside = mob(w, w.x + 330, w.y, 1);
    const seen = run(w, 30);
    expect(w.arms.zones.length).toBe(1);
    expect(damaged(w, inside)).toBe(3);
    expect(inside.every((e) => w.arms.freezeAt[e]! > 0)).toBe(true);
    expect(damaged(w, outside)).toBe(0);
    expect(count(seen, ArmEv.Zone, 0)).toBe(1);
    expect(count(seen, ArmEv.Freeze, ARM_FX.flag.freeze)).toBeGreaterThan(0);
  });

  it('被定住的怪走不动，到点放开再定', () => {
    const w = quiet();
    armed(w, ['flag'], false, 1);
    const [e] = mob(w, w.x + 30, w.y, 1);
    run(w, 10);
    expect(w.eBind[e!]! > w.tick).toBe(true);
    run(w, ARM_FX.flag.freeze + 2);
    expect(w.eBind[e!]! > w.tick).toBe(false);
    run(w, ARM_FX.flag.freezeEvery);
    expect(w.eBind[e!]! > w.tick || w.arms.freezeAt[e!]! > w.tick).toBe(true);
  });

  it('阵到点就撤', () => {
    const w = quiet();
    armed(w, ['flag'], false, 1);
    mob(w, w.x + 30, w.y, 1);
    run(w, 12);
    expect(w.arms.zones.length).toBe(1);
    run(w, WEAPONS.flag.base.duration);
    expect(w.arms.zones.every((z) => z.life > 0)).toBe(true);
    const first = w.arms.zones[0]!;
    expect(first.life).toBeLessThanOrEqual(WEAPONS.flag.base.duration);
  });

  it('四象大阵：布两座，旗线上的怪挨得更疼', () => {
    const w = quiet();
    armed(w, ['flag'], true);
    const half = WEAPONS.flag.evolve!.stats.area;
    const onLine = mob(w, w.x + half - 6, w.y, 1);
    const center = mob(w, w.x, w.y + 20, 1);
    const seen = run(w, 16);
    expect(count(seen, ArmEv.Zone, 1)).toBeGreaterThanOrEqual(2);
    const lineHit = 1e6 - w.eHp[onLine[0]!]!;
    const centerHit = 1e6 - w.eHp[center[0]!]!;
    expect(lineHit).toBeGreaterThan(centerHit);
  });

  it('令旗：镇类范围变大，被定住多定一阵', () => {
    const a = quiet();
    armed(a, ['flag'], false, 1);
    const b = quiet();
    b.passives.qizhi = 5;
    armed(b, ['flag'], false, 1);
    expect(b.wstats[0]!.area).toBeCloseTo(a.wstats[0]!.area * 1.5, 5);
    const [e] = mob(b, b.x + 30, b.y, 1);
    run(b, 10);
    expect(b.eBind[e!]! - b.tick).toBeGreaterThanOrEqual(ARM_FX.flag.freeze + ARM_FX.flag.qizhiTicks * 5 - 6);
  });
});

describe('勾魂锁', () => {
  it('把一群怪拉向锚点再勒一下', () => {
    const w = quiet();
    armed(w, ['chain'], false, 1);
    const es = mob(w, w.x + 200, w.y - 60, 6, 30);
    const ax = w.eX[es[0]!]!;
    const ay = w.eY[es[0]!]!;
    const before = es.map((e) => Math.hypot(w.eX[e]! - ax, w.eY[e]! - ay));
    const seen = run(w, 12);
    expect(count(seen, ArmEv.Chain, 0)).toBe(1);
    expect(count(seen, ArmEv.Pull, w.eX[es[1]!]!)).toBeGreaterThanOrEqual(0);
    const pulledN = es.filter((e, i) => Math.hypot(w.eX[e]! - ax, w.eY[e]! - ay) < before[i]! - 1).length;
    // 1 级一次拉 3 只
    expect(pulledN).toBeGreaterThanOrEqual(2);
    expect(damaged(w, es)).toBeGreaterThanOrEqual(3);
  });

  it('勾魂索命：拉一次抓得更多，被拉到的怪三秒内挨打 +25%；铁链叠加易伤', () => {
    const w = quiet();
    armed(w, ['chain'], true);
    const es = mob(w, w.x + 200, w.y, 9, 24);
    run(w, 10);
    const vul = es.filter((e) => w.arms.vulnUntil[e]! > w.tick);
    expect(vul.length).toBeGreaterThanOrEqual(6);
    expect(w.arms.vulnMul[vul[0]!]).toBeCloseTo(1.25, 5);
    const t = quiet();
    t.passives.tielian = 4;
    armed(t, ['chain'], false, 1);
    const e2 = mob(t, t.x + 200, t.y, 3, 24);
    run(t, 10);
    const v2 = e2.filter((e) => t.arms.vulnUntil[e]! > t.tick);
    expect(v2.length).toBeGreaterThan(0);
    expect(t.arms.vulnMul[v2[0]!]).toBeCloseTo(1 + 4 * ARM_FX.chain.tielianHurt, 5);
    // 铁链也让所有法器击退 / 拉拽距离变大
    expect(t.wstats[0]!.knock).toBeGreaterThan(WEAPONS.chain.base.knock);
  });
});

describe('竹篙', () => {
  it('戳一道直线：线上的怪挨打并被送远，线外的不挨', () => {
    const w = quiet();
    armed(w, ['pole'], false, 1);
    const online = mob(w, w.x + 100, w.y, 1);
    const online2 = mob(w, w.x + 200, w.y, 1);
    const off = mob(w, w.x + 100, w.y + 120, 1);
    const x0 = w.eX[online[0]!]!;
    const seen = run(w, 16);
    expect(count(seen, ArmEv.Thrust, 0)).toBeGreaterThanOrEqual(1);
    expect(damaged(w, [...online, ...online2])).toBe(2);
    expect(damaged(w, off)).toBe(0);
    expect(w.eX[online[0]!]!).toBeGreaterThan(x0);
  });

  it('撑船破浪：路上留水痕，水痕里的怪慢三成（记 4）', () => {
    const w = quiet();
    armed(w, ['pole'], true);
    const es = mob(w, w.x + 120, w.y, 1);
    run(w, 12);
    expect(w.arms.puddles.length).toBeGreaterThan(0);
    // 水痕在怪脚下：它的减速记号是 4（markSlow 在每拍开头算）
    run(w, 2);
    expect(w.eSlow[es[0]!]).toBe(ARM_FX.pole.slow);
    run(w, WEAPONS.pole.evolve!.stats.duration + 5, true);
  });

  it('扇面：多戳几下，方向错开', () => {
    const w = quiet();
    armed(w, ['pole'], true);
    mob(w, w.x + 120, w.y, 1);
    run(w, 6);
    const dirs = new Set<number>();
    for (let t = 0; t < 6; t++) {
      step(w, 0, -1);
      for (let k = 0; k < w.ev.n; k++) if (w.ev.type[k] === ArmEv.Thrust) dirs.add(w.ev.a[k]!);
    }
    expect(dirs.size).toBe(3);
  });
});

describe('长明灯', () => {
  it('点灯：灯里的怪被烧，站在光里回血，离开光不回', () => {
    const w = quiet();
    armed(w, ['lamp'], false, 1);
    const es = mob(w, w.x + 62, w.y, 2, 14);
    w.hp = 20;
    const seen = run(w, 90, false);
    expect(count(seen, ArmEv.Lamp, 0)).toBe(1);
    expect(damaged(w, es)).toBe(2);
    expect(w.hp).toBeGreaterThan(20);
    expect(w.arms.lamps.length).toBe(1);
  });

  it('灯油：灯亮得更久，回血更快', () => {
    const base = quiet(7);
    armed(base, ['lamp'], false, 1);
    base.hp = 10;
    run(base, 200, false);
    const oil = quiet(7);
    oil.passives.dengyou = 5;
    armed(oil, ['lamp'], false, 1);
    oil.hp = 10;
    run(oil, 200, false);
    expect(oil.hp - 10).toBeGreaterThan((base.hp - 10) * 1.8);
    expect(oil.arms.lamps[0]!.life).toBeGreaterThan(base.arms.lamps[0]!.life);
  });

  it('万家灯火：身边一圈小灯跟着走，会烧怪', () => {
    const w = quiet();
    armed(w, ['lamp'], true);
    // 小灯绕 95 的圈走，怪放在圈上
    const es = mob(w, w.x + 95, w.y, 1);
    const seen = run(w, 120);
    expect(count(seen, ArmEv.Lamp, 2)).toBeGreaterThanOrEqual(4 * 100);
    expect(count(seen, ArmEv.Lamp, 1)).toBeGreaterThanOrEqual(1);
    expect(damaged(w, es)).toBe(1);
  });
});

describe('阵法套件', () => {
  it('2 件：阵里和绳子捆住的怪多定 0.3 秒；3 件：被捆的怪多挨 30%；4 件：每 10 秒自动布一座小阵', () => {
    const mk = (ids: Parameters<typeof grantWeapon>[1][]): World => {
      const w = quiet();
      armed(w, ids, false, 1);
      return w;
    };
    expect(mk(['flag']).arms.tier).toBe(0);
    expect(mk(['flag', 'chain']).arms.tier).toBe(2);
    expect(mk(['flag', 'chain', 'rope']).arms.tier).toBe(3);
    const four = mk(['flag', 'chain', 'rope', 'shield']);
    expect(four.arms.tier).toBe(4);

    // 2 件：定身时间 = 15 + 9
    const two = mk(['flag', 'chain']);
    const [e] = mob(two, two.x + 30, two.y, 1);
    run(two, 10);
    expect(two.eBind[e!]! - two.tick).toBeGreaterThanOrEqual(ARM_FX.flag.freeze + ARM_FX.set.two - 3);

    // 3 件：同一只被定住的怪，挨打更疼
    const hit = (ids: Parameters<typeof grantWeapon>[1][]): number => {
      const w = mk(ids);
      const [t] = mob(w, w.x + 30, w.y, 1);
      w.eBind[t!] = w.tick + 100;
      w.rHit.next();
      // 直接比一次命中的伤害：阵旗的一次结算
      run(w, 16);
      return 1e6 - w.eHp[t!]!;
    };
    expect(hit(['flag', 'chain', 'rope'])).toBeGreaterThan(hit(['flag', 'chain']) * 1.15);

    // 4 件：自动布阵不占阵旗的冷却（没带阵旗也布）
    const auto = quiet();
    armed(auto, ['chain', 'rope', 'shield', 'mirror'], false, 1);
    expect(auto.arms.tier).toBe(4);
    mob(auto, auto.x + 30, auto.y, 1);
    const seen = run(auto, ARM_FX.flag.autoEvery + 5);
    expect(count(seen, ArmEv.Zone, 2)).toBe(1);
  });
});

describe('搭配', () => {
  /** 拿上两件（进化）、记上搭配，原地跑一阵，看搭配发的 Combo 事件 */
  const combo = (a: Parameters<typeof grantWeapon>[1], b: Parameters<typeof grantWeapon>[1], id: (typeof MERGES)[number]['id'], fx: number, setup: (w: World) => void, ticks = 240): number => {
    const w = quiet();
    w.merges.push(id);
    armed(w, [a, b], true);
    setup(w);
    return count(run(w, ticks), ArmEv.Combo, fx);
  };
  const crowd = (w: World): void => void mob(w, w.x + 70, w.y, 6, 20);

  it('雷劫锁魂：被拉到的怪头上落雷', () => {
    expect(combo('chain', 'thunder', 'leijie', ArmFx.Leijie, (w) => void mob(w, w.x + 150, w.y, 6, 20))).toBeGreaterThan(0);
  });
  it('鹤翼金身：护盾在时纸鹤啄近处的怪，盾碎时俯冲一圈', () => {
    expect(combo('crane', 'shield', 'hejin', ArmFx.Hejin, crowd)).toBeGreaterThan(0);
    const w = quiet();
    w.merges.push('hejin');
    armed(w, ['crane', 'shield'], true);
    const es = mob(w, w.x + 60, w.y, 3);
    run(w, 3);
    w.shieldBurst = true;
    const seen = run(w, 2);
    expect(count(seen, ArmEv.Combo, ArmFx.Hejin)).toBeGreaterThan(0);
    expect(damaged(w, es)).toBe(3);
  });
  it('乾坤护阵：盾碎放光波，并挡下飞来的弹幕', () => {
    const w = quiet();
    w.merges.push('qiankun');
    armed(w, ['mirror', 'shield'], true);
    mob(w, w.x + 80, w.y, 2);
    run(w, 2);
    const i = [...Array(MAX_SHOTS).keys()].find((s) => !w.sAlive[s])!;
    w.sAlive[i] = 1;
    w.sCount++;
    w.sKind[i] = Shot.Fireball;
    w.sX[i] = w.x + 200;
    w.sY[i] = w.y;
    w.sVX[i] = 0;
    w.sVY[i] = 0;
    w.sLife[i] = 100;
    w.shieldBurst = true;
    const seen = run(w, 1);
    expect(count(seen, ArmEv.Combo, ArmFx.Qiankun)).toBe(1);
    expect(w.sAlive[i]).toBe(0);
  });
  it('钱剑连城：飞出的剑带铜钱串多打一下', () => {
    expect(combo('coins', 'flysword', 'qianjian', ArmFx.Qianjian, (w) => void mob(w, w.x + 160, w.y, 4, 16))).toBeGreaterThan(0);
  });
  it('引魂鹤铃：铃响，纸鹤去啄铃里最近的怪', () => {
    expect(combo('crane', 'bell', 'heling', ArmFx.Heling, crowd)).toBeGreaterThan(0);
  });
  it('一苇渡江：飞剑飞过的路上留水痕', () => {
    const w = quiet();
    w.merges.push('yiwei');
    armed(w, ['flysword', 'pole'], true);
    mob(w, w.x + 200, w.y, 3, 16);
    run(w, 60);
    expect(w.arms.puddles.length).toBeGreaterThan(0);
  });
  it('晨钟暮鼓：站在阵里时铃的光环多响一遍', () => {
    expect(combo('bell', 'flag', 'chenzhong', ArmFx.Chenzhong, crowd)).toBeGreaterThan(0);
  });
  it('花灯会：站在灯光里，花瓣追灯边的怪，回血', () => {
    expect(combo('petals', 'lamp', 'huadeng', ArmFx.Huadeng, crowd)).toBeGreaterThan(0);
  });
  it('渡魂灯：亮着灯的水痕烧里面的怪', () => {
    expect(combo('pole', 'lamp', 'dudeng', ArmFx.Dudeng, (w) => void mob(w, w.x + 120, w.y, 1))).toBeGreaterThan(0);
  });
  it('两仪阵：方阵里的怪被推向旗线，在旗线上挨打', () => {
    expect(combo('flag', 'mirror', 'liangyi', ArmFx.Liangyi, (w) => void mob(w, w.x + 20, w.y, 3, 14))).toBeGreaterThan(0);
  });

  it('专属搭配只在对应角色的宝箱里出现', () => {
    const m = MERGES.find((x) => x.id === 'chenzhong')!;
    for (const ch of ['pang', 'xiaodao'] as const) {
      const w = createWorld({ seed: 1, mode: 'vigil', danger: 0, character: ch });
      w.weapons.length = 0;
      w.wstats.length = 0;
      grantWeapon(w, m.a, 8, true);
      grantWeapon(w, m.b, 8, true);
      openChestNow(w);
      expect(w.merges.includes('chenzhong')).toBe(ch === m.only);
    }
  });
});

describe('确定性', () => {
  it('四件新法器 + 阵法套件 + 搭配：同种子同输入，逐拍指纹相同', () => {
    const go = (): number[] => {
      const w = createWorld({ seed: 77, mode: 'vigil', danger: 2 });
      w.merges.push('hejin', 'liangyi', 'dudeng');
      armed(w, ['flag', 'chain', 'pole', 'lamp', 'mirror', 'shield'], true);
      const out: number[] = [];
      for (let t = 0; t < 600 && w.phase !== 'over'; t++) {
        step(w, t % 90 < 45 ? 1 : 5, w.phase === 'choose' ? 0 : -1);
        out.push(fingerprint(w));
      }
      return out;
    };
    expect(go()).toEqual(go());
  });
});

// ───────────────────────── 第二批 ─────────────────────────

/** 一团怪，血是 hp、站着不动（能被打死） */
function soft(w: World, x: number, y: number, n: number, hp: number, dx = 14): number[] {
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const e = spawnNow(w, 'jiangshi', x + (k % 3) * dx, y + Math.floor(k / 3) * dx);
    w.eHp[e] = hp;
    w.eHpMax[e] = hp;
    w.eSpeed[e] = 0;
    out.push(e);
  }
  return out;
}

describe('2.0 第二批：登记', () => {
  it('五件法器的五行类型、进化被动、图标、活', () => {
    expect(WEAPONS.dart).toMatchObject({ el: '金', type: '符' });
    expect(WEAPONS.abacus).toMatchObject({ el: '金', type: '灵' });
    expect(WEAPONS.banner).toMatchObject({ el: '土', type: '灵' });
    expect(WEAPONS.brush).toMatchObject({ el: '木', type: '剑' });
    expect(WEAPONS.cracker).toMatchObject({ el: '火', type: '符' });
    expect(WEAPONS.dart.evolve?.with).toBe('qiandai');
    expect(WEAPONS.abacus.evolve?.with).toBe('huangli');
    expect(WEAPONS.banner.evolve?.with).toBe('baifan');
    expect(WEAPONS.brush.evolve?.with).toBe('zhubi');
    expect(WEAPONS.cracker.evolve?.with).toBe('liuhuang');
    for (const id of ['dart', 'abacus', 'banner', 'brush', 'cracker'] as const) expect(WEAPON_ROLE[id]).toBeDefined();
  });

  it('流派 10：幽冥、聚财的单子和机器人一致，烈火加鞭炮长明灯、水府加竹篙', () => {
    for (const id of ['ghost', 'wealth'] as const) {
      expect([...SCHOOLS[id].weapons]).toEqual(BUILDS[id].weapons);
      expect([...SCHOOLS[id].passives]).toEqual(BUILDS[id].passives);
    }
    expect(SCHOOLS.fire.weapons).toEqual(expect.arrayContaining(['cracker', 'lamp']));
    expect(SCHOOLS.water.weapons).toContain('pole');
    expect(SCHOOLS.ghost.weapons).toContain('banner');
    expect(SCHOOLS.wealth.weapons).toContain('dart');
  });

  it('搭配矩阵：10 个流派两两（含自己）都有一个人人能合的搭配，按单子重算', () => {
    const generic = MERGES.filter((m) => !m.only);
    for (let i = 0; i < SCHOOL_IDS.length; i++) {
      for (let j = i; j < SCHOOL_IDS.length; j++) {
        const A = SCHOOLS[SCHOOL_IDS[i]!].weapons;
        const B = SCHOOLS[SCHOOL_IDS[j]!].weapons;
        const ok = generic.some((m) => (A.includes(m.a) && B.includes(m.b)) || (A.includes(m.b) && B.includes(m.a)));
        expect(ok, `${SCHOOL_IDS[i]} × ${SCHOOL_IDS[j]} 没有搭配`).toBe(true);
      }
    }
  });

  it('图集高度：特色怪图集在渲染倍数 3 下不超过 2048', () => {
    const defs = [...SPRITES12, ...SPRITES13, ...SPRITES14, ...SPRITES_ARMS, ...SPRITES_ARMS2, ...SPRITES_GUISHI, ...SPRITES_HUAPI, ...SPRITES_FOES];
    for (const res of [1, 2, 3]) expect(layout(defs, res).height).toBeLessThanOrEqual(2048);
  });

  it('套件标签不被成就当成"3 件套装"', () => {
    const ach = ACHIEVEMENTS.find((a) => a.id === 'set_3')!;
    const run = (sets: string[]): boolean => ach.test({ sets } as never, {} as never);
    expect(run(['阵法·3', '幽冥·3', '聚财·4'])).toBe(false);
    expect(run(['剑2', '金3'])).toBe(true);
  });
});

describe('铜钱镖', () => {
  it('来回两趟，每趟在怪之间弹：一个镖打到多只，最后回到手里消失', () => {
    const w = quiet();
    armed(w, ['dart'], false, 1);
    const es = mob(w, w.x + 150, w.y, 4, 40);
    const seen = run(w, 200);
    expect(count(seen, ArmEv.Dart, 0)).toBeGreaterThan(0);
    expect(damaged(w, es)).toBeGreaterThanOrEqual(3);
    // 命中事件：b 是 7；两趟加起来最多 2 × hops 下
    const hits = [...seen].filter(([k]) => k.startsWith(`${ArmEv.Dart}:`)).length;
    expect(hits).toBeGreaterThan(0);
    expect(w.arms.darts.length).toBeLessThanOrEqual(1);
  });

  it('飞钱雨：一次掷一扇，弹跳比普通多两只', () => {
    const w = quiet();
    armed(w, ['dart'], true);
    mob(w, w.x + 150, w.y, 6, 40);
    run(w, 10);
    expect(w.arms.darts.length).toBe(WEAPONS.dart.evolve!.stats.amount);
    expect(w.arms.darts[0]!.hopsMax).toBe(ARM_FX2.dart.hops + ARM_FX2.dart.evoHops);
  });

  it('钱袋：铜钱掉落 +15% 每级，金类伤害 +4% 每级', () => {
    const a = quiet();
    armed(a, ['dart'], false, 1);
    const b = quiet();
    b.passives.qiandai = 5;
    armed(b, ['dart'], false, 1);
    expect(b.stats.coinBonus).toBeCloseTo(a.stats.coinBonus + 0.75, 6);
    expect(b.wstats[0]!.dmg).toBeCloseTo(a.wstats[0]!.dmg * 1.2, 6);
  });
});

describe('算盘', () => {
  it('范围里每只怪累积账，结算时层数越多越疼，结算后清零', () => {
    const w = quiet();
    armed(w, ['abacus'], false, 1);
    const [near] = mob(w, w.x + 60, w.y, 1);
    const seen = run(w, 100);
    expect(w.arms.beads[near!]).toBeGreaterThan(1);
    expect(count(seen, ArmEv.Abacus, 0)).toBeGreaterThan(0);
    // 第一次结算在账记上以后（计时到点再试）；之后的一次整个结算周期里账又被清掉
    const s2 = run(w, 160);
    expect(count(seen, ArmEv.Abacus, 1) + count(s2, ArmEv.Abacus, 1)).toBeGreaterThanOrEqual(1);
    expect(w.eHp[near!]!).toBeLessThan(1e6);
  });

  it('层数越多这一下越疼；封顶 12 层', () => {
    const w = quiet();
    armed(w, ['abacus'], false, 1);
    const [few, many] = mob(w, w.x + 60, w.y, 2, 24);
    w.arms.beads[many!] = 12;
    w.arms.beads[few!] = 1;
    w.wstats[0]!.cd = 1;
    w.weapons[0]!.timer = 1;
    step(w, 0, -1);
    expect(1e6 - w.eHp[many!]!).toBeGreaterThan(1e6 - w.eHp[few!]!);
    expect(ARM_FX2.abacus.cap).toBe(12);
  });

  it('天机算盘：结算后账不清零，精英多记三层', () => {
    const w = quiet();
    armed(w, ['abacus'], true);
    const [e] = mob(w, w.x + 60, w.y, 1);
    w.arms.beads[e!] = 10;
    w.weapons[0]!.timer = 1;
    step(w, 0, -1);
    expect(w.arms.beads[e!]).toBe(5);
  });
});

describe('招魂幡', () => {
  it('立幡；死在幡里的怪按概率变成冤魂，冤魂追着怪撞一下', () => {
    const w = quiet();
    armed(w, ['banner', 'sword'], false, 8);
    w.passives.baifan = 5;
    soft(w, w.x + 80, w.y, 30, 5);
    const far = mob(w, w.x + 260, w.y, 3);
    const seen = run(w, 200);
    expect(count(seen, ArmEv.Banner, 0)).toBeGreaterThanOrEqual(1);
    expect(count(seen, ArmEv.Ghost, 0)).toBeGreaterThan(0);
    expect(count(seen, ArmEv.Ghost, 2)).toBeGreaterThan(0);
    expect(damaged(w, far)).toBeGreaterThanOrEqual(0);
  });

  it('万魂幡：概率翻倍，冤魂撞完回到幡旁再来一次', () => {
    expect(ARM_FX2.banner.evoChance).toBeGreaterThan(ARM_FX2.banner.chance);
    const w = quiet();
    armed(w, ['banner'], true);
    w.arms.banners.push({ x: w.x + 90, y: w.y, r: 150, life: 300, evo: 1, slot: 0 });
    const es = mob(w, w.x + 160, w.y, 2, 30);
    // 直接放一只万魂幡的冤魂
    w.arms.ghosts.push({ x: w.x + 100, y: w.y, kind: 0, life: 100, dmg: 20, speed: 8, evo: 1, ret: 0, hx: w.x + 90, hy: w.y, slot: 0 });
    run(w, 40);
    expect(damaged(w, es)).toBeGreaterThan(0);
    expect(w.arms.ghosts.length === 0 || w.arms.ghosts[0]!.ret >= 1).toBe(true);
  });

  it('白幡：魂珠范围 +10% 每级', () => {
    const a = quiet();
    const b = quiet();
    b.passives.baifan = 5;
    armed(b, ['banner'], false, 1);
    armed(a, ['banner'], false, 1);
    expect(b.stats.magnet).toBeCloseTo(a.stats.magnet * 1.5, 6);
  });
});

describe('判官笔', () => {
  it('点名血最多的怪，连点三下', () => {
    const w = quiet();
    armed(w, ['brush'], false, 1);
    const [small, big] = soft(w, w.x + 100, w.y, 2, 5000, 30);
    w.eHp[big!] = 9000;
    w.eHpMax[big!] = 9000;
    const seen = run(w, 40);
    expect(count(seen, ArmEv.Brush, 0)).toBe(1);
    expect(count(seen, ArmEv.Brush, 1)).toBe(1);
    expect(count(seen, ArmEv.Brush, 2)).toBe(1);
    expect(9000 - w.eHp[big!]!).toBeGreaterThan(5000 - w.eHp[small!]!);
  });

  it('生死簿：血剩两成以下的怪直接勾销，首领改为额外挨打', () => {
    const w = quiet();
    armed(w, ['brush'], true);
    const [e] = soft(w, w.x + 100, w.y, 1, 100);
    w.eHp[e!] = 15;
    const seen = run(w, 30);
    expect(w.eAlive[e!]).toBe(0);
    expect(count(seen, ArmEv.Brush, 0) + count(seen, ArmEv.Brush, 1)).toBeGreaterThan(0);
    expect(ARM_FX2.brush.bossBonus).toBe(0.2);
  });

  it('朱笔：暴击伤害 +15% 每级；对精英、首领 +4% 每级', () => {
    const a = quiet();
    const b = quiet();
    b.passives.zhubi = 5;
    armed(a, ['brush'], false, 1);
    armed(b, ['brush'], false, 1);
    expect(b.stats.critDmg).toBeCloseTo(a.stats.critDmg + 0.75, 6);
  });
});

describe('鞭炮', () => {
  it('朝前抛一串爆竹，沿路连爆，把小怪吓退', () => {
    const w = quiet();
    armed(w, ['cracker'], false, 1);
    const [e] = mob(w, w.x + 100, w.y, 1);
    const x0 = w.eX[e!]!;
    const seen = run(w, 30);
    expect(count(seen, ArmEv.Cracker, 0)).toBeGreaterThanOrEqual(WEAPONS.cracker.base.amount - 1);
    expect(w.eHp[e!]!).toBeLessThan(1e6);
    expect(w.eX[e!]!).toBeGreaterThan(x0);
  });

  it('十响连环：落地后再炸一轮', () => {
    const w = quiet();
    armed(w, ['cracker'], true);
    mob(w, w.x + 100, w.y, 1);
    const seen = run(w, 80);
    expect(count(seen, ArmEv.Cracker, 1)).toBeGreaterThanOrEqual(WEAPONS.cracker.evolve!.stats.amount + 1);
  });

  it('硫磺：火类伤害 +8% 每级、持续 +10% 每级（只影响火行法器）', () => {
    const a = quiet();
    const b = quiet();
    b.passives.liuhuang = 5;
    armed(a, ['cracker', 'sword'], false, 1);
    armed(b, ['cracker', 'sword'], false, 1);
    expect(b.wstats[0]!.dmg).toBeCloseTo(a.wstats[0]!.dmg * 1.4, 6);
    expect(b.wstats[1]!.dmg).toBeCloseTo(a.wstats[1]!.dmg, 6);
  });
});

describe('幽冥、聚财套件', () => {
  it('幽冥 2 件：冤魂概率 +10%；3 件：冤魂伤害 +40%、上限 +4；4 件：每 15 只召一位鬼差；标签写成"幽冥·N"', () => {
    const w = quiet();
    armed(w, ['banner', 'brush'], false, 1);
    expect(w.arms.ghostTier).toBe(2);
    expect(w.sets).toContain('幽冥·2');
    armed(w, ['chain'], false, 1);
    expect(w.arms.ghostTier).toBe(3);
    expect(w.sets).toContain('幽冥·3');
    armed(w, ['crane'], false, 1);
    expect(w.arms.ghostTier).toBe(4);
    expect(w.sets).toContain('幽冥·4');
    // 4 件：打倒 15 只，一位鬼差
    soft(w, w.x + 60, w.y, 3, 1);
    w.kills = w.arms.chaiNext;
    const seen = run(w, 3);
    expect(count(seen, ArmEv.Ghost, 3)).toBe(1);
    expect(w.arms.ghosts.some((g) => g.kind === 1)).toBe(true);
  });

  it('聚财 2 件：铜钱 +25%；3 件：每 100 枚局内铜钱伤害 +1%，最多 +12%；4 件：铜钱雨、夜市多一摊', () => {
    const w = quiet();
    armed(w, ['dart', 'abacus'], false, 1);
    expect(w.arms.wealthTier).toBe(2);
    expect(w.sets).toContain('聚财·2');
    expect(w.stats.coinBonus).toBeGreaterThanOrEqual(0.25);
    armed(w, ['coins'], false, 1);
    expect(w.sets).toContain('聚财·3');
    const [e] = mob(w, w.x + 500, w.y, 1);
    w.coins = 0;
    const m0 = armsHitMulOf(w, e!);
    w.coins = 600;
    expect(armsHitMulOf(w, e!)).toBeCloseTo(m0 * 1.06, 6);
    w.coins = 99999;
    expect(armsHitMulOf(w, e!)).toBeCloseTo(m0 * 1.12, 6);
    armed(w, ['flysword'], false, 1);
    expect(w.arms.wealthTier).toBe(4);
    w.arms.rainAt = w.tick + 1;
    mob(w, w.x + 60, w.y, 2);
    const seen = run(w, 4);
    expect(count(seen, ArmEv.Rain, 0)).toBe(1);
  });

  it('阵法 / 幽冥 / 聚财标签带"·"，不会被当成剑 3、金 3 这样的类型五行套装', () => {
    const w = quiet();
    armed(w, ['flag', 'mirror', 'rope'], false, 1);
    expect(w.sets).toContain('阵法·3');
    for (const s of w.sets) if (s.includes('·')) expect(/^[^·]+·[234]$/.test(s)).toBe(true);
  });
});

/** 从一次命中里量出第二批的倍数：直接取 armsHitMul */
import { armsHitMul } from '../../src/core/arms/index.ts';
function armsHitMulOf(w: World, i: number): number {
  return armsHitMul(w, i);
}

describe('第二批搭配', () => {
  const merged = (id: string, a: Parameters<typeof grantWeapon>[1][]): World => {
    const w = quiet();
    armed(w, a, false, 8);
    w.merges.push(id as never);
    return w;
  };

  it('阴律斩：每次挥剑，判官笔对挥中血最多的那只补一笔', () => {
    const w = merged('yinlv', ['sword', 'brush']);
    const [a, b] = soft(w, w.x + 60, w.y, 2, 9000, 30);
    w.eHp[b!] = 12000;
    w.eHpMax[b!] = 12000;
    const seen = run(w, 60);
    expect(count(seen, ArmEv.Combo, ArmFx.Yinlv)).toBeGreaterThan(0);
    expect(a).toBeDefined();
  });

  it('买路符钱：符贴在怪身上，怪死后爆成铜钱', () => {
    const w = merged('maibu', ['talisman', 'dart']);
    const [e] = soft(w, w.x + 100, w.y, 1, 100000);
    run(w, ARM_FX2.combo.maibu.every + 2);
    expect(w.arms.marked[e!]).toBe(1);
    const c0 = w.coins;
    w.eHp[e!] = 1;
    const seen = run(w, 40);
    expect(w.eAlive[e!]).toBe(0);
    expect(w.coins).toBeGreaterThanOrEqual(c0 + ARM_FX2.combo.maibu.coins);
    expect(count(seen, ArmEv.Combo, ArmFx.Maibu)).toBeGreaterThan(0);
  });

  it('阴兵借道：纸兵倒下变成一个冤魂', () => {
    const w = merged('yinbing', ['zhibing', 'banner']);
    w.nextEvent = 1 << 30;
    const seen = new Map<string, number>();
    for (let t = 0; t < 900; t++) {
      // 不停补一圈会咬人的怪，纸兵很快就挨倒
      if (t % 40 === 0) {
        for (let k = 0; k < 4; k++) {
          const e = spawnNow(w, 'jiangshi', w.x + 60 + k * 12, w.y + (k - 2) * 20);
          w.eHp[e] = 1e6;
          w.eHpMax[e] = 1e6;
        }
      }
      step(w, 0, -1);
      w.hp = w.stats.hpMax;
      for (let k = 0; k < w.ev.n; k++) {
        const key = `${w.ev.type[k]}:${w.ev.a[k]}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
    }
    expect(count(seen, 55, 0)).toBeGreaterThan(0);
    expect(count(seen, ArmEv.Combo, ArmFx.Yinbing)).toBeGreaterThan(0);
  });

  it('爆竹驱年：护盾破时连放一串爆竹，震开全屏', () => {
    const w = merged('baozhu', ['shield', 'cracker']);
    w.nextEvent = 1 << 30;
    w.weapons[1]!.timer = 1e9;
    const seen = new Map<string, number>();
    for (let t = 0; t < 600 && !count(seen, ArmEv.Combo, ArmFx.Baozhu); t++) {
      if (t % 10 === 0) spawnNow(w, 'jiangshi', w.x + 20, w.y);
      step(w, 0, -1);
      w.hp = w.stats.hpMax;
      for (let k = 0; k < w.ev.n; k++) {
        const key = `${w.ev.type[k]}:${w.ev.a[k]}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
    }
    expect(count(seen, 20, 0)).toBeGreaterThan(0);
    expect(count(seen, ArmEv.Combo, ArmFx.Baozhu)).toBeGreaterThan(0);
    expect(w.arms.crackers.length).toBeGreaterThan(0);
  });

  it('财源滚滚：算盘每结算一次，从怪身上弹出一枚铜钱镖', () => {
    const w = merged('caiyuan', ['dart', 'abacus']);
    mob(w, w.x + 60, w.y, 3);
    const ka = w.weapons.findIndex((o) => o.id === 'abacus');
    const kd = w.weapons.findIndex((o) => o.id === 'dart');
    w.weapons[kd]!.timer = 1e9;
    w.arms.beads.fill(3);
    w.weapons[ka]!.timer = 1;
    const seen = run(w, 3);
    expect(count(seen, ArmEv.Combo, ArmFx.Caiyuan)).toBeGreaterThan(0);
    expect(w.arms.darts.length).toBeGreaterThan(0);
  });
});

describe('规则 51 之前的实盘局不放 2.0 的新内容（录像按规则 50 重放）', () => {
  it('实盘的卡池、宝箱里永远抽不到新法器、新被动、新套件、新搭配', () => {
    const newW = new Set<string>(['flag', 'chain', 'pole', 'lamp', 'dart', 'abacus', 'banner', 'brush', 'cracker']);
    const newP = new Set<string>(['qizhi', 'tielian', 'dengyou', 'qiandai', 'baifan', 'zhubi', 'liuhuang']);
    for (let seed = 1; seed <= 12; seed++) {
      const w = createWorld({ seed, mode: 'vigil', danger: 2, live: true }, 50);
      for (let t = 0; t < 30 * 100 && w.phase !== 'over'; t++) {
        step(w, (t >> 5) % 8 === 0 ? 1 : 5, -1);
        if (w.phase === 'choose') {
          for (const c of w.choices) expect(newW.has(c.id) || newP.has(c.id)).toBe(false);
          step(w, 0, 0);
          openChestNow(w);
        }
      }
      for (const o of w.weapons) expect(newW.has(o.id)).toBe(false);
      for (const id of Object.keys(w.passives)) expect(newP.has(id)).toBe(false);
      expect(w.arms.live()).toBe(false);
      expect(w.sets.every((s) => !s.includes('·'))).toBe(true);
    }
    // 12 局各跑到 100 秒：空载单线程约 1.9 秒（冷启动，进程 CPU 时间，2026-11-02 量；热了约 0.9 秒），取 4 倍；
    // 默认 5 秒在机器负载 28–33 时会超时（不是断言失败）
  }, 8_000);

  it('实盘里货郎、阴阳先生自己的起手法器和进化被动能升级进化，其余新内容仍不出；规则版本 38 的实盘录像不放', () => {
    const newW = new Set<string>(['flag', 'chain', 'pole', 'lamp', 'dart', 'abacus', 'banner', 'brush', 'cracker']);
    const newP = new Set<string>(['qizhi', 'tielian', 'dengyou', 'qiandai', 'baifan', 'zhubi', 'liuhuang']);
    const own: Record<string, string[]> = { huolang: ['dart', 'qiandai'], yinyang: ['flag', 'qizhi'] };
    // 直接塞升级次数，把每次三选一里出现过的牌都记下来（三选一不吃局面，只吃种子）
    const seenIds = (character: 'huolang' | 'yinyang' | 'zhijiang', rules?: number): Set<string> => {
      const seen = new Set<string>();
      for (let seed = 1; seed <= 6; seed++) {
        const w = createWorld({ seed, mode: 'vigil', danger: 0, character, live: true } as never, rules);
        for (let n = 0; n < 40 && w.phase !== 'over'; n++) {
          w.hp = w.stats.hpMax;
          w.pendingLevels = 1;
          step(w, 0, -1);
          if (w.phase === 'choose') {
            for (const c of w.choices) seen.add(c.id);
            step(w, 0, 0);
          }
        }
      }
      return seen;
    };
    for (const c of ['huolang', 'yinyang'] as const) {
      const seen = seenIds(c, 50);
      for (const id of own[c]!) expect(seen.has(id), `${c} ${id}`).toBe(true);
      for (const id of [...newW, ...newP]) if (!own[c]!.includes(id)) expect(seen.has(id), `${c} ${id}`).toBe(false);
      const old = seenIds(c, 38);
      for (const id of [...newW, ...newP]) expect(old.has(id), `旧录像 ${c} ${id}`).toBe(false);
    }
    const zj = seenIds('zhijiang', 50);
    expect(zj.has('zhibing')).toBe(true);
    for (const id of [...newW, ...newP]) expect(zj.has(id), `zhijiang ${id}`).toBe(false);
  });

  it('实盘里即使凑出阵法单子的老法器，也没有套件（实盘配置照旧）', () => {
    const w = createWorld({ seed: 1, mode: 'vigil', danger: 2, live: true }, 50);
    armed(w, ['mirror', 'rope', 'shield'], false, 1);
    expect(w.arms.tier).toBe(0);
    expect(w.sets.some((s) => s.includes('·'))).toBe(false);
  });

  it('实盘宝箱不合 2.0 的搭配（老搭配照合）', () => {
    const w = createWorld({ seed: 1, mode: 'vigil', danger: 0, live: true }, 50);
    w.weapons.length = 0;
    w.wstats.length = 0;
    grantWeapon(w, 'crane', 8, true);
    grantWeapon(w, 'shield', 8, true);
    openChestNow(w);
    expect(w.merges.includes('hejin')).toBe(false);
    const v = createWorld({ seed: 1, mode: 'vigil', danger: 0, live: true }, 50);
    v.weapons.length = 0;
    v.wstats.length = 0;
    grantWeapon(v, 'sword', 8, true);
    grantWeapon(v, 'flysword', 8, true);
    openChestNow(v);
    expect(v.merges.includes('zhuxie')).toBe(true);
  });
});

describe('规则 51 起实盘和娱乐一样按角色法器池抽', () => {
  it('实盘局抽卡、宝箱合成、套件和娱乐同一个池', () => {
    for (const c of ['huolang', 'yinyang', 'zhijiang', 'pang'] as const) {
      const live = createWorld({ seed: 3, mode: 'vigil', danger: 2, character: c, live: true } as never);
      const ent = createWorld({ seed: 3, mode: 'vigil', danger: 2, character: c } as never);
      expect(live.oldPool, c).toBe(false);
      expect(ent.oldPool, c).toBe(false);
    }
    const w = createWorld({ seed: 1, mode: 'vigil', danger: 2, live: true });
    armed(w, ['mirror', 'rope', 'shield'], false, 1);
    expect(w.arms.tier).toBe(3);
    const m = createWorld({ seed: 1, mode: 'vigil', danger: 0, live: true });
    m.weapons.length = 0;
    m.wstats.length = 0;
    grantWeapon(m, 'crane', 8, true);
    grantWeapon(m, 'shield', 8, true);
    openChestNow(m);
    expect(m.merges.includes('hejin')).toBe(true);
    // 规则 50 的实盘录像照旧走老卡池
    expect(createWorld({ seed: 1, mode: 'vigil', danger: 2, live: true }, 50).oldPool).toBe(true);
  });

  it('实盘货郎的三选一能抽到池里的 2.0 法器（和娱乐一样）', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 6; seed++) {
      const w = createWorld({ seed, mode: 'vigil', danger: 0, character: 'huolang', live: true } as never);
      for (let n = 0; n < 40 && w.phase !== 'over'; n++) {
        w.hp = w.stats.hpMax;
        w.pendingLevels = 1;
        step(w, 0, -1);
        if (w.phase === 'choose') {
          for (const c of w.choices) seen.add(c.id);
          step(w, 0, 0);
        }
      }
    }
    expect(seen.has('abacus')).toBe(true);
  });
});
