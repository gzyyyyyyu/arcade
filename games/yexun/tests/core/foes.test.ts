import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RAID_TEMPLATES } from '../../src/content/explore.ts';
import { ENEMY_BY_KIND, type EnemyKind } from '../../src/content/enemies.ts';
import { BINGHUN, WUMIAN } from '../../src/content/foes.ts';
import { MAP_IDS, type MapId } from '../../src/content/maps.ts';
import { RAID_REGIONS, VIGIL_REGIONS, vigilRegion } from '../../src/content/regions.ts';
import { MID_BOSS, midBossOf } from '../../src/content/waves.ts';
import { createWorld, Drop, Ev, fingerprint, rushPlan, step, type World } from '../../src/core/index.ts';
import { grantWeapon, spawnNow } from '../../src/core/debug.ts';
import { foeHurtMul, foeSlowMul } from '../../src/core/foes/index.ts';
import { generateMap } from '../../src/explore/mapgen.ts';
import { NAV_INF } from '../../src/explore/nav.ts';
import { ReplayPlayer } from '../../src/replay/player.ts';
import type { ReplayRecord } from '../../src/replay/format.ts';

const MID_AT = 480 * 30;
const BOSS_MAPS: [MapId, EnemyKind][] = [['bamboo', 'zhumu'], ['riverbank', 'shuihou'], ['icelake', 'binghun'], ['temple', 'wumian']];
const code = (k: EnemyKind): number => ENEMY_BY_KIND[k].code;

/** 干净的场：没有法器、不再按分钟补怪、不放定点事件；每拍把血补满，免得测试途中被打死 */
function quiet(map: MapId, seed = 5): World {
  const w = createWorld({ seed, mode: 'vigil', danger: 2, map });
  w.weapons.length = 0;
  w.wstats.length = 0;
  w.nextEvent = 1 << 30;
  w.spawnAcc = -1e9;
  return w;
}

/** 走 n 拍（不动），返回这几拍的 Ev.Foe 子类计数；hp 补满 */
function foeEvents(w: World, n: number, each?: () => void): Map<number, number> {
  const m = new Map<number, number>();
  for (let t = 0; t < n; t++) {
    w.hp = w.stats.hpMax;
    each?.();
    step(w, 0, -1);
    for (let k = 0; k < w.ev.n; k++) if (w.ev.type[k] === Ev.Foe) m.set(w.ev.a[k]!, (m.get(w.ev.a[k]!) ?? 0) + 1);
  }
  return m;
}

describe('2.0 中期首领按图出场', () => {
  it('8:00 的首领：竹林竹母、河滩水猴王、冰湖冰魄娘娘、荒庙无面佛、鬼市画皮，其余仍是纸扎老爷', () => {
    for (const map of MAP_IDS) {
      const want = (MID_BOSS as Record<string, string | undefined>)[map] ?? 'lord';
      const w = createWorld({ seed: 7, mode: 'vigil', danger: 2, map });
      const ev = w.schedule.find((e) => e.kind === 'boss' && e.enemy !== 'boss')!;
      expect(ev.at).toBe(MID_AT);
      expect(ev.kind === 'boss' && ev.enemy).toBe(want);
      expect(midBossOf(map)).toBe(want);
    }
    expect(Object.fromEntries(BOSS_MAPS)).toEqual({ bamboo: 'zhumu', riverbank: 'shuihou', icelake: 'binghun', temple: 'wumian' });
  });

  it('到点真的刷出来，是首领（有血条槽位），发出场事件', () => {
    for (const [map, kind] of BOSS_MAPS) {
      const w = createWorld({ seed: 7, mode: 'vigil', danger: 2, map });
      w.weapons.length = 0;
      w.wstats.length = 0;
      w.nextEvent = w.schedule.findIndex((e) => e.kind === 'boss' && e.enemy === kind);
      w.tick = MID_AT - 1;
      w.hp = w.stats.hpMax;
      step(w, 0, -1);
      expect(w.bossSlot, map).toBeGreaterThanOrEqual(0);
      expect(w.eKind[w.bossSlot]).toBe(code(kind));
      let arrived = false;
      for (let k = 0; k < w.ev.n; k++) if (w.ev.type[k] === Ev.Arrive && w.ev.a[k] === code(kind)) arrived = true;
      expect(arrived).toBe(true);
    }
  });

  it('首领连战第 5 关同步：按图出本图的首领', () => {
    for (const map of MAP_IDS) {
      const plan = rushPlan(11, map);
      expect(plan.stages[4]).toEqual([midBossOf(map)]);
    }
  });
});

describe('2.0 千年竹母', () => {
  it('一段竹笋（先冒圈再刺）和召竹精；血少一半发怒进二段，放竹浪，躲进空隙不挨打，站在墙上挨打', () => {
    const w = quiet('bamboo');
    const i = spawnNow(w, 'zhumu', w.x + 260, w.y);
    const e1 = foeEvents(w, 700);
    expect(e1.get(30), '竹笋预警').toBeGreaterThan(0);
    expect(e1.get(50), '竹笋刺出').toBeGreaterThan(0);
    expect(e1.get(3), '召竹精').toBeGreaterThan(0);
    expect(e1.get(2) ?? 0, '一段没有竹浪').toBe(0);
    w.eHp[i] = w.eHpMax[i]! * 0.45;
    let phase = false;
    const e2 = foeEvents(w, 900, () => {
      for (let k = 0; k < w.ev.n; k++) if (w.ev.type[k] === Ev.Boss && w.ev.a[k] === 4) phase = true;
    });
    expect(e2.get(2), '二段放竹浪').toBeGreaterThan(0);
    expect(phase || w.ePhase[i] === 1).toBe(true);
  });

  it('竹浪：空隙里挨不到，空隙外挨一下', () => {
    for (const inGap of [true, false]) {
      const w = quiet('bamboo');
      const f = w.foe;
      f.used = true;
      f.wOn[0] = 1;
      f.wWarn[0] = 0;
      f.wAxis[0] = 0;
      f.wDir[0] = 1;
      f.wPos[0] = w.x - 20;
      f.wEnd[0] = w.x + 400;
      f.wGap[0] = inGap ? w.y : w.y + 500;
      f.wGapW[0] = 200;
      const hp0 = w.hp;
      for (let t = 0; t < 8; t++) step(w, 0, -1);
      if (inGap) expect(w.hp).toBe(hp0);
      else expect(w.hp).toBeLessThan(hp0);
    }
  });
});

describe('2.0 水猴王', () => {
  it('潜水时打不到也碰不到，到点从预警圈里冒出来扑；水鞭打中减速；二段拖人，走出河岸就断', () => {
    const w = quiet('riverbank');
    const i = spawnNow(w, 'shuihou', w.x + 300, w.y);
    grantWeapon(w, 'bell', 8);
    let sawGhost = false;
    const e1 = foeEvents(w, 900, () => {
      if (w.eS[i] === 1) {
        sawGhost = true;
        const hp = w.eHp[i];
        // 潜水时：把怪挪到主角脚下也不伤人
        w.eX[i] = w.x;
        w.eY[i] = w.y;
        expect(w.hp).toBe(w.stats.hpMax);
        expect(w.eHp[i]).toBe(hp);
      }
    });
    expect(sawGhost).toBe(true);
    expect(e1.get(4), '潜水').toBeGreaterThan(0);
    expect(e1.get(5), '冒出').toBeGreaterThan(0);
    expect(e1.get(31), '扑的预警圈（水猴）').toBeGreaterThan(0);
    expect(e1.get(6), '水鞭').toBeGreaterThan(0);
    // 二段拖人：直接进拖人状态（潜水扑完会落在主角脚下，那时距离太近不拖）
    const w2 = quiet('riverbank');
    const j = spawnNow(w2, 'shuihou', w2.x + 250, w2.y);
    w2.eHp[j] = w2.eHpMax[j]! * 0.4;
    w2.eS[j] = 3;
    w2.eT[j] = 100;
    const x0 = w2.x;
    foeEvents(w2, 20);
    expect(w2.x, '主角被拖向水猴王').toBeGreaterThan(x0 + 10);
    // 离得远了断
    w2.eX[j] = w2.x + 900;
    step(w2, 0, -1);
    expect(w2.eS[j]).toBe(0);
    // 二段的技能轮里有拖人
    const w3 = quiet('riverbank');
    const q = spawnNow(w3, 'shuihou', w3.x + 250, w3.y);
    w3.eHp[q] = w3.eHpMax[q]! * 0.4;
    expect(foeEvents(w3, 1400).get(7), '拖人').toBeGreaterThan(0);
  });
});

describe('2.0 冰魄娘娘', () => {
  it('冰风（吹过后冰面更滑）、冰刺圈（先预警再落）；二段冰面裂开，浮冰上正常、水里变慢', () => {
    const w = quiet('icelake');
    const i = spawnNow(w, 'binghun', w.x + 260, w.y);
    const e1 = foeEvents(w, 700);
    expect(e1.get(8), '冰风').toBeGreaterThan(0);
    expect(e1.get(32), '冰刺预警').toBeGreaterThan(0);
    expect(e1.get(52), '冰刺落下').toBeGreaterThan(0);
    expect(w.foe.slickUntil).toBeGreaterThan(0);
    w.eHp[i] = w.eHpMax[i]! * 0.4;
    const e2 = foeEvents(w, BINGHUN.crack.every + 100);
    expect(e2.get(9), '冰面裂开').toBeGreaterThan(0);
    // 裂开期间：浮冰上乘 1，浮冰外慢
    const f = w.foe;
    f.fN = 1;
    f.fX[0] = w.x - 50;
    f.fY[0] = w.y - 50;
    f.fW[0] = 100;
    f.fH[0] = 100;
    f.floeWarnEnd = w.tick - 1;
    f.floeUntil = w.tick + 100;
    expect(foeSlowMul(w)).toBe(1);
    w.x += 300;
    expect(foeSlowMul(w)).toBe(BINGHUN.crack.offSlow);
  });
});

describe('2.0 无面佛', () => {
  it('四尊小佛放金光圈；冲撞撞上庙柱眩晕（挨打更重）；二段香炉全灭，香火区外挨打加倍', () => {
    const w = quiet('temple');
    const i = spawnNow(w, 'wumian', w.x + 260, w.y);
    const e1 = foeEvents(w, 900);
    expect(e1.get(33), '金光圈预警').toBeGreaterThan(0);
    expect(e1.get(53), '金光圈落下').toBeGreaterThan(0);
    expect(e1.get(10), '睁眼冲撞蓄力').toBeGreaterThan(0);
    // 撞墙：把它放在大殿南边，朝北冲
    const w2 = quiet('temple');
    const k = spawnNow(w2, 'wumian', 1500, 1500 - 560 + 200);
    w2.x = 1500;
    w2.y = 1500 + 200;
    w2.eS[k] = 2;
    w2.eT[k] = 30;
    w2.eAX[k] = 0;
    w2.eAY[k] = -1;
    const e2 = foeEvents(w2, 30);
    expect(e2.get(11), '撞庙柱眩晕').toBeGreaterThan(0);
    expect(w2.eS[k]).toBe(3);
    // 二段
    w.eHp[i] = w.eHpMax[i]! * 0.4;
    const e3 = foeEvents(w, 300);
    expect(e3.get(12), '香炉全灭').toBeGreaterThan(0);
    w.inIncense = false;
    expect(foeHurtMul(w)).toBe(WUMIAN.darkMul);
    w.inIncense = true;
    expect(foeHurtMul(w)).toBe(1);
  });
});

describe('2.0 首领倒下', () => {
  it('四个首领倒下发倒下事件、掉宝箱；画皮之外的"中期首领"规矩一样（收获期）', () => {
    for (const [map, kind] of BOSS_MAPS) {
      const w = quiet(map);
      const i = spawnNow(w, kind, w.x + 30, w.y);
      grantWeapon(w, 'bell', 8);
      w.eHp[i] = 5;
      let down = false;
      for (let t = 0; t < 120 && !down; t++) {
        w.hp = w.stats.hpMax;
        step(w, 0, -1);
        for (let k = 0; k < w.ev.n; k++) if (w.ev.type[k] === Ev.Foe && w.ev.a[k] === 23 && w.ev.b[k] === code(kind)) down = true;
      }
      expect(down, kind).toBe(true);
      expect(w.eAlive[i]).toBe(0);
      let chest = 0;
      for (let d = 0; d < w.dAlive.length; d++) if (w.dAlive[d] && w.dKind[d] === Drop.Chest) chest++;
      expect(chest, `${kind} 掉宝箱`).toBe(1);
      expect(w.calmUntil).toBeGreaterThan(w.tick);
    }
  });
});

describe('2.0 特色怪', () => {
  it('雪童子只在雪原、棺钉鬼只在义庄出（守夜 4 分钟内各图跑一遍）', () => {
    const seen: Record<string, Set<string>> = {};
    for (const map of MAP_IDS) {
      const w = createWorld({ seed: 3, mode: 'vigil', danger: 2, map });
      const s = (seen[map] = new Set<string>());
      for (let t = 0; t < 5400; t++) {
        w.hp = w.stats.hpMax;
        step(w, 0, -1);
        if (t % 30 === 0) for (let i = 0; i < w.eAlive.length; i++) if (w.eAlive[i]) s.add(['xuetong', 'guandingui'].find((k) => code(k as EnemyKind) === w.eKind[i]!) ?? '');
        if (w.phase !== 'play') break;
      }
    }
    for (const map of MAP_IDS) {
      expect(seen[map]!.has('xuetong'), `${map} 雪童子`).toBe(map === 'snow');
      expect(seen[map]!.has('guandingui'), `${map} 棺钉鬼`).toBe(map === 'yizhuang');
    }
    expect(VIGIL_REGIONS.snow?.mobs[0]?.kind).toBe('xuetong');
    expect(VIGIL_REGIONS.yizhuang?.mobs[0]?.kind).toBe('guandingui');
  }, 60000);

  it('雪童子：没风时照常追；白毛风里隐在雪里（画面读 eAX），近了现身冲刺；被火打中现形', () => {
    const w = quiet('snow');
    const i = spawnNow(w, 'xuetong', w.x + 600, w.y);
    foeEvents(w, 3);
    expect(w.eAX[i], '没风不隐').toBe(0);
    // 白毛风（第一次在 4 分钟）：隐着，走得慢
    w.tick = 240 * 30;
    w.eX[i] = w.x + 600;
    w.eY[i] = w.y;
    foeEvents(w, 3, () => {
      w.x = 1500;
      w.y = 1500;
    });
    expect(w.eAX[i], '风里隐着').toBe(1);
    // 近了：现身冲刺（Ev.Foe 13）
    w.eX[i] = w.x + 120;
    w.eY[i] = w.y;
    const e = foeEvents(w, 60);
    expect(e.get(13), '现身冲刺').toBeGreaterThan(0);
    expect(w.eS[i]).not.toBe(0);
    // 被火打中现形：现形期间不隐
    const w2 = quiet('snow');
    const j = spawnNow(w2, 'xuetong', w2.x + 600, w2.y);
    w2.tick = 240 * 30;
    grantWeapon(w2, 'gourd', 8);
    w2.eX[j] = w2.x + 80;
    w2.eY[j] = w2.y;
    const e2 = foeEvents(w2, 40);
    expect(e2.get(13) ?? 0).toBeGreaterThan(0);
  });

  it('棺钉鬼：躺着不动，走近棺盖弹开、坐起钉三枚；倒下留空棺（挡路，主角过不去），空棺到点散', () => {
    const w = quiet('yizhuang');
    const i = spawnNow(w, 'guandingui', w.x + 700, w.y);
    foeEvents(w, 20);
    expect(w.eS[i]).toBe(0);
    const x0 = w.eX[i];
    foeEvents(w, 20);
    expect(w.eX[i]).toBe(x0);
    w.eX[i] = w.x + 200;
    w.eY[i] = w.y;
    const e = foeEvents(w, 120);
    expect(e.get(14), '棺盖弹开').toBeGreaterThan(0);
    expect(e.get(15), '棺钉').toBeGreaterThan(0);
    // 倒下留空棺
    grantWeapon(w, 'bell', 8);
    w.eX[i] = w.x + 20;
    w.eY[i] = w.y;
    w.eHp[i] = 1;
    const e2 = foeEvents(w, 60);
    expect(e2.get(16), '留空棺').toBeGreaterThan(0);
    let coffin = -1;
    for (let k = 0; k < w.eAlive.length; k++) if (w.eAlive[k] && w.eKind[k] === code('coffin')) coffin = k;
    expect(coffin).toBeGreaterThanOrEqual(0);
    w.weapons.length = 0;
    w.wstats.length = 0;
    w.eX[coffin] = w.x + 40;
    w.eY[coffin] = w.y;
    for (let t = 0; t < 20; t++) {
      w.hp = w.stats.hpMax;
      step(w, 9, -1);
    }
    // 主角往东（输入 9）走，被空棺挡在圈外
    expect(Math.hypot(w.x - w.eX[coffin]!, w.y - w.eY[coffin]!)).toBeGreaterThanOrEqual(w.eR[coffin]! + 13);
    w.eT[coffin] = 1;
    foeEvents(w, 2);
    expect(w.eAlive[coffin]).toBe(0);
  });
});

describe('2.0 夜探新镇', () => {
  it('戏楼镇、粮仓镇登记完整：特色怪、守门首领、戏台', () => {
    expect(RAID_REGIONS.xilou?.mobs[0]?.kind).toBe('troupe');
    expect(RAID_REGIONS.liangcang?.mobs[0]?.kind).toBe('ratdemon');
    expect(RAID_TEMPLATES.xilou.vaultGuard).toBe('hongyi');
    expect(RAID_TEMPLATES.liangcang.vaultGuard).toBe('shuoshu');
    expect(RAID_TEMPLATES.xilou.stage).toEqual([2, 2]);
  });

  it('新镇子生成可走通、撤离点可达，守门首领守在最值钱的院子，戏楼镇有戏台', () => {
    for (const t of ['xilou', 'liangcang'] as const) {
      for (const seed of [1, 2, 3, 7, 42]) {
        const m = generateMap(t, seed);
        const reach = m.nav.field([m.nav.index(m.spawn.x, m.spawn.y)]);
        for (const g of m.gates) expect(reach[m.nav.index(g.x, g.y)]! < NAV_INF, `${t}/${seed} ${g.name}`).toBe(true);
        for (const c of m.chests) expect(reach[m.nav.index(c.x, c.y)]! < NAV_INF, `${t}/${seed} 宝箱`).toBe(true);
        const gate = m.guards.filter((g) => g.role === 'gate');
        expect(gate.length, `${t}/${seed} 守门首领`).toBe(1);
        expect(gate[0]!.kind).toBe(RAID_TEMPLATES[t].vaultGuard);
        expect(m.guards.some((g) => g.role === 'beast')).toBe(false);
        if (t === 'xilou') {
          expect(m.stage).toBeDefined();
          expect(m.blocks.some((b) => b.look === 'stage')).toBe(true);
        } else expect(m.blocks.some((b) => b.look === 'granary')).toBe(true);
      }
    }
  });

  it('戏台每 40 秒开一场：锣响、戏班鬼影分批冒出来；离得远不开', () => {
    const w = createWorld({ seed: 4, mode: 'raid', danger: 1, raid: { template: 'xilou' } });
    const st = w.raid!.map.stage!;
    w.weapons.length = 0;
    w.wstats.length = 0;
    // 远：不开
    const far = foeEvents(w, 1300);
    expect(far.get(17) ?? 0).toBe(0);
    w.x = st.x + 300;
    w.y = st.y + 300;
    w.raid!.map.index.pushOut(w, 14);
    const near = foeEvents(w, 400, () => {
      w.invuln = 99;
    });
    expect(near.get(17), '开场锣').toBe(1);
    expect(near.get(18), '鬼影分批冒').toBeGreaterThanOrEqual(3);
  });

  it('红衣戏子：水袖预警和扫圈；换脸留下假身（一碰就破、不掉东西）；硕鼠将军钻地不被打、冒出来扑，吐米山挡路', () => {
    const w = createWorld({ seed: 4, mode: 'raid', danger: 1, raid: { template: 'xilou' } });
    w.weapons.length = 0;
    w.wstats.length = 0;
    w.raid!.map.guards.length = 0;
    const i = spawnNow(w, 'hongyi', w.x + 200, w.y);
    w.invuln = 0;
    const e1 = foeEvents(w, 700, () => {
      w.invuln = 99;
    });
    expect(e1.get(35), '水袖预警').toBeGreaterThan(0);
    expect(e1.get(55), '水袖扫圈').toBeGreaterThan(0);
    expect(e1.get(20), '换脸').toBeGreaterThan(0);
    let clones = 0;
    for (let k = 0; k < w.eAlive.length; k++) if (w.eAlive[k] && w.eKind[k] === code('hongyiclone')) clones++;
    expect(clones).toBeGreaterThanOrEqual(1);
    expect(w.eAlive[i]).toBe(1);

    const w2 = createWorld({ seed: 4, mode: 'raid', danger: 1, raid: { template: 'liangcang' } });
    w2.weapons.length = 0;
    w2.wstats.length = 0;
    w2.raid!.map.guards.length = 0;
    const j = spawnNow(w2, 'shuoshu', w2.x + 200, w2.y);
    let ghost = false;
    const e2 = foeEvents(w2, 700, () => {
      w2.invuln = 99;
      if (w2.eS[j] === 1) ghost = true;
    });
    expect(ghost).toBe(true);
    expect(e2.get(21), '钻地/冒出').toBeGreaterThanOrEqual(2);
    expect(e2.get(34), '鼠洞预警').toBeGreaterThan(0);
    expect(e2.get(22), '吐米').toBeGreaterThan(0);
    let piles = 0;
    for (let k = 0; k < w2.eAlive.length; k++) if (w2.eAlive[k] && w2.eKind[k] === code('ricepile')) piles++;
    expect(piles).toBeGreaterThan(0);
  });
});

describe('2.0 确定性', () => {
  it('同种子同输入，带首领的一局指纹逐拍相同', () => {
    const run = (): number[] => {
      const w = createWorld({ seed: 9, mode: 'vigil', danger: 2, map: 'bamboo' });
      w.weapons.length = 0;
      w.wstats.length = 0;
      w.nextEvent = 1 << 30;
      spawnNow(w, 'zhumu', w.x + 260, w.y);
      const out: number[] = [];
      for (let t = 0; t < 900; t++) {
        w.hp = w.stats.hpMax;
        step(w, t % 40 < 20 ? 3 : 20, -1);
        if (t % 60 === 0) out.push(fingerprint(w));
      }
      return out;
    };
    expect(run()).toEqual(run());
  });
});

describe('2.0 实盘不被带偏', () => {
  it('规则 52 之前的实盘局各图的中期首领、特色怪表和 2.0 之前一致（画皮三图，其余纸扎老爷；雪原义庄不刷新怪）', () => {
    const before: Record<string, string> = { bamboo: 'huapi', riverbank: 'huapi', guishi: 'huapi' };
    for (const map of MAP_IDS) {
      const w = createWorld({ seed: 7, mode: 'vigil', danger: 2, map, live: true }, 51);
      const ev = w.schedule.find((e) => e.kind === 'boss' && e.enemy !== 'boss')!;
      expect(ev.kind === 'boss' && ev.enemy, map).toBe(before[map] ?? 'lord');
      expect(vigilRegion(map, true), map).toBe(map === 'snow' || map === 'yizhuang' ? undefined : VIGIL_REGIONS[map]);
    }
    // 实盘雪原 / 义庄 3 分钟里一只新怪都没有
    for (const map of ['snow', 'yizhuang'] as const) {
      const w = createWorld({ seed: 3, mode: 'vigil', danger: 2, map, live: true }, 51);
      for (let t = 0; t < 5400; t++) {
        w.hp = w.stats.hpMax;
        step(w, 0, -1);
        if (t % 60 === 0) for (let i = 0; i < w.eAlive.length; i++) if (w.eAlive[i]) expect([code('xuetong'), code('guandingui')]).not.toContain(w.eKind[i]);
      }
    }
  }, 60000);

  it('规则 52 起实盘局和娱乐局同一套中期首领和特色怪', () => {
    for (const map of MAP_IDS) {
      const live = createWorld({ seed: 7, mode: 'vigil', danger: 2, map, live: true });
      const fun = createWorld({ seed: 7, mode: 'vigil', danger: 2, map });
      expect(live.legacyFoes, map).toBe(false);
      const boss = (w: typeof live) => w.schedule.find((e) => e.kind === 'boss' && e.enemy !== 'boss');
      expect(boss(live), map).toEqual(boss(fun));
    }
  });
});

describe('2.0 旧录像', () => {
  // 规则版本 37 录的六局（竹林、河滩、雪原、义庄、冰湖、荒庙，小道士 + 剑修机器人打满）：38 里回放要逐位一致，
  // 也就是 < 38 的录像用 2.0 之前的首领和刷怪表（画皮 / 纸扎老爷，没有雪童子、棺钉鬼）
  const items = JSON.parse(readFileSync(new URL('../fixtures/replay-rules37.json', import.meta.url), 'utf8')) as { rec: ReplayRecord; fp: number; kills: number; level: number }[];

  it('规则版本 37 的录像在当前版本回放，到最后指纹、击杀、等级和录制时一致', () => {
    expect(items.length).toBe(6);
    for (const it of items) {
      expect(it.rec.rules).toBe(37);
      const p = ReplayPlayer.from(it.rec)!;
      expect(p.outdated).toBe(true);
      expect(p.world.replayRules).toBe(37);
      expect(p.world.legacyPool).toBe(false);
      expect(p.world.legacyFoes).toBe(true);
      while (!p.done) p.tickOnce();
      expect(fingerprint(p.world), it.rec.setup.map).toBe(it.fp);
      expect(p.exact).toBe(true);
      expect(p.world.kills).toBe(it.kills);
      expect(p.world.level).toBe(it.level);
    }
  }, 120000);

  it('旧标记只由录像的规则版本决定：<38 用旧首领，当前版本不带；Setup 里塞不进来', () => {
    const rec = items[0]!.rec;
    const old = createWorld(rec.setup, 37);
    expect(old.schedule.find((e) => e.kind === 'boss' && e.enemy !== 'boss')).toMatchObject({ enemy: 'huapi' });
    const cur = createWorld(rec.setup);
    expect(cur.replayRules).toBeUndefined();
    expect(cur.legacyFoes).toBe(false);
    expect(cur.schedule.find((e) => e.kind === 'boss' && e.enemy !== 'boss')).toMatchObject({ enemy: 'zhumu' });
    expect(createWorld({ ...rec.setup, replayRules: 30 } as never).legacyFoes).toBe(false);
    expect(createWorld(rec.setup, 38).legacyFoes).toBe(false);
    // 首领连战的第五关同样按旧表
    const rush = { ...rec.setup, rush: true } as never;
    expect(createWorld(rush, 37).rush!.stages[4]).toEqual(['huapi']);
    expect(createWorld(rush).rush!.stages[4]).toEqual(['zhumu']);
  });
});
