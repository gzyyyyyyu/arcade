import { describe, expect, it } from 'vitest';
import { ENEMY_BY_KIND, MARKETBOSS, PEDDLER, PUPPET } from '../../src/content/enemies.ts';
import { MAPS, MAP_IDS, MAP_UNLOCK } from '../../src/content/maps.ts';
import { MAP_EVENT_AT, MAP_EVENTS } from '../../src/content/mapEvents.ts';
import { ARENA, PLAYER } from '../../src/content/player.ts';
import { VIGIL_REGIONS } from '../../src/content/regions.ts';
import { liveMapOk } from '../../src/content/live.ts';
import { dangerDef } from '../../src/content/waves.ts';
import { ACHIEVEMENT_BY_ID } from '../../src/content/achievements.ts';
import { MONSTER_INFO } from '../../src/view/ui/codex.ts';
import { createWorld, Ev, Shot, step, type World } from '../../src/core/index.ts';
import { spawnNow } from '../../src/core/debug.ts';

const G = MAPS.guishi;
const C = ARENA.w / 2;
const PUPPET_CODE = ENEMY_BY_KIND.puppet.code;

function quiet(seed = 7): World {
  const w = createWorld({ seed, mode: 'vigil', danger: 2, map: 'guishi' });
  w.weapons.length = 0;
  w.wstats.length = 0;
  w.nextEvent = 1 << 30;
  w.spawnAcc = -1e9;
  return w;
}

/** 本拍出了哪些 Ev.Mob 子类 */
function mobEvents(w: World, into: Set<number>): void {
  for (let k = 0; k < w.ev.n; k++) if (w.ev.type[k] === Ev.Mob) into.add(w.ev.a[k]!);
}

const moneyShots = (w: World): number => {
  let n = 0;
  for (let i = 0; i < w.sAlive.length; i++) if (w.sAlive[i] && w.sKind[i] === Shot.Fireball && w.sState[i] === 3) n++;
  return n;
};

describe('鬼市', () => {
  it('登记：12 分钟解锁、特色怪和精英、地图事件、图鉴、成就；实盘先不开', () => {
    expect(MAP_UNLOCK.guishi?.seconds).toBe(720);
    // 卡上的"难"字从表里来：义庄、荒庙
    expect(MAP_IDS.filter((m) => MAPS[m].hard)).toEqual(['yizhuang', 'temple']);
    expect(VIGIL_REGIONS.guishi?.mobs.map((m) => m.kind)).toEqual(['puppet', 'peddler']);
    expect(VIGIL_REGIONS.guishi?.elites?.every((e) => e.enemy === 'marketboss')).toBe(true);
    expect(MAP_EVENTS.guishi.kind).toBe('parade');
    expect(MONSTER_INFO.puppet.name).toBe('皮影鬼');
    expect(MONSTER_INFO.peddler.name).toBe('鬼贩');
    expect(MONSTER_INFO.marketboss.name).toBe('鬼市主');
    expect(ACHIEVEMENT_BY_ID.dawn_guishi).toBeTruthy();
    expect(liveMapOk('guishi')).toBe(true); // 0.17.7 拟好系数后开实盘
    // 新怪只在鬼市刷：别的图的特色怪表里没有它们
    for (const id of MAP_IDS) if (id !== 'guishi') for (const m of VIGIL_REGIONS[id]?.mobs ?? []) expect(['puppet', 'peddler']).not.toContain(m.kind);
  });

  it('摊子都在场地里；出生点和南北大街空着；同一排摊子之间的缝主角钻得过去', () => {
    expect(G.blocks.length).toBeGreaterThan(60);
    for (const b of G.blocks) {
      expect(b.look).toBe('gstall');
      expect(b.x).toBeGreaterThan(0);
      expect(b.y).toBeGreaterThan(0);
      expect(b.x + b.w).toBeLessThan(ARENA.w);
      expect(b.y + b.h).toBeLessThan(ARENA.h);
      // 南北大街
      expect(b.x + b.w <= C - 80 || b.x >= C + 80).toBe(true);
      // 出生点四周的空场：块上离中心最近的点也在 250 以外
      const nx = Math.max(b.x, Math.min(C, b.x + b.w)) - C;
      const ny = Math.max(b.y, Math.min(C, b.y + b.h)) - C;
      expect(nx * nx + ny * ny).toBeGreaterThan(250 * 250);
    }
    const rows = new Map<number, number[]>();
    for (const b of G.blocks) rows.set(b.y, [...(rows.get(b.y) ?? []), b.x]);
    for (const xs of rows.values()) {
      xs.sort((a, b) => a - b);
      for (let k = 1; k < xs.length; k++) expect(xs[k]! - (xs[k - 1]! + G.blocks[0]!.w)).toBeGreaterThan(PLAYER.r * 2 + 20);
    }
  });

  it('顺着南北大街一路往北走得到头', () => {
    const w = quiet();
    for (let t = 0; t < 30 * 20; t++) {
      step(w, 25, -1);
      w.hp = 999;
    }
    expect(w.y).toBeLessThan(200);
    expect(Math.abs(w.x - C)).toBeLessThan(5);
  });

  it('皮影鬼：先抖一阵，然后一下闪到跟前（不闪进人身上）', () => {
    const w = quiet();
    const i = spawnNow(w, 'puppet', w.x + 300, w.y);
    w.eT[i] = 1;
    const seen = new Set<number>();
    step(w, 0, -1);
    expect(w.eS[i]).toBe(1);
    const before = w.eX[i]!;
    for (let t = 0; t < PUPPET.warn + 1; t++) {
      step(w, 0, -1);
      mobEvents(w, seen);
    }
    expect(seen.has(16) && seen.has(17)).toBe(true);
    expect(before - w.eX[i]!).toBeGreaterThan(PUPPET.dist - 5);
    // 贴着人的时候不闪
    const w2 = quiet();
    const j = spawnNow(w2, 'puppet', w2.x + PUPPET.keep - 5, w2.y);
    w2.eT[j] = 1;
    const seen2 = new Set<number>();
    for (let t = 0; t < PUPPET.warn + 2; t++) {
      step(w2, 0, -1);
      w2.hp = 999;
      mobEvents(w2, seen2);
    }
    expect(seen2.has(17)).toBe(false);
  });

  it('鬼贩：你靠近它就退；够得着就丢钱袋', () => {
    const w = quiet();
    const i = spawnNow(w, 'peddler', w.x + 120, w.y);
    w.eT[i] = 1000;
    for (let t = 0; t < 30; t++) step(w, 0, -1);
    expect(w.eX[i]! - w.x).toBeGreaterThan(140);
    const w2 = quiet();
    const j = spawnNow(w2, 'peddler', w2.x + PEDDLER.near + 20, w2.y);
    w2.eT[j] = 1;
    step(w2, 0, -1);
    expect(moneyShots(w2)).toBe(1);
  });

  it('鬼市主：撒一扇铜钱；血少一半更多，还叫皮影鬼围上来', () => {
    const w = quiet();
    const i = spawnNow(w, 'marketboss', w.x + 320, w.y);
    w.eT[i] = 1;
    step(w, 0, -1);
    expect(moneyShots(w)).toBe(MARKETBOSS.fan[0]);
    const w2 = quiet();
    const j = spawnNow(w2, 'marketboss', w2.x + 320, w2.y);
    w2.eHp[j] = w2.eHpMax[j]! * 0.4;
    w2.eT[j] = 1;
    const n0 = w2.eCount;
    step(w2, 0, -1);
    expect(moneyShots(w2)).toBe(MARKETBOSS.fan[1]);
    expect(w2.eCount - n0).toBe(MARKETBOSS.puppets[1]);
  });

  it('百鬼夜行：第 4 分钟一横排皮影鬼从西边齐步横扫过来，走完照常', () => {
    const w = quiet();
    w.tick = MAP_EVENT_AT[0]! - 1;
    step(w, 0, -1);
    const idx: number[] = [];
    for (let i = 0; i < w.eAlive.length; i++) if (w.eAlive[i] && w.eKind[i] === PUPPET_CODE) idx.push(i);
    expect(idx.length).toBe(Math.round(MAP_EVENTS.guishi.mob!.count * dangerDef('vigil', 2).countMul));
    for (const i of idx) {
      expect(w.eS[i]).toBe(9);
      expect(w.eX[i]!).toBeLessThan(w.x - 300);
    }
    const x0 = idx.map((i) => w.eX[i]!);
    for (let t = 0; t < 60; t++) {
      step(w, 0, -1);
      w.hp = 999;
    }
    // 不追人：两秒里每只都照直往东走了一截
    idx.forEach((i, k) => expect(w.eX[i]! - x0[k]!).toBeGreaterThan(60 * PUPPET.marchSpeed * 0.8));
    for (let t = 0; t < PUPPET.march; t++) {
      step(w, 0, -1);
      w.hp = 999;
    }
    for (const i of idx) if (w.eAlive[i]) expect(w.eS[i]).not.toBe(9);
  });
});

describe('新地图不改动已开打的挑战', () => {
  it('连战、本周夜事用自己写死的图表：鬼市加进守夜后，某天的连战图、某周的本周夜事图不变', async () => {
    const { RUSH_MAPS, rushDaily } = await import('../../src/online/rush.ts');
    const { WEEKLY_MAPS, weeklyPlan } = await import('../../src/online/weekly.ts');
    const six = ['snow', 'bamboo', 'icelake', 'riverbank', 'yizhuang', 'temple'];
    expect(RUSH_MAPS).toEqual(six);
    expect(WEEKLY_MAPS).toEqual(six);
    // 这两天在鬼市加进来之前就已经有人打过榜
    expect(six).toContain(rushDaily('2026-10-31').setup.map);
    expect(six).toContain(weeklyPlan('2026-10-31').setup.map);
  });
});
