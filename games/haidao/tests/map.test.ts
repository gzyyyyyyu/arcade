import { describe, expect, it } from 'vitest';
import {
  BUILDINGS,
  ISLAND,
  MAP_BOSSES,
  MAP_ENERGY_MAX,
  MAP_FLEETS,
  MAP_ISLANDS,
  MAP_LAYERS,
  MAP_RULES,
  MAP_STAR_PTS,
  MAP_STOP_TICKS,
  RULES_VERSION,
  botActions,
  finishStop,
  fleetSurvivors,
  goHome,
  mapBotMove,
  mapFinal,
  mapHint,
  nodeLayout,
  restOf,
  routeOf,
  runStop,
  startMap,
  stopSetup,
  takeReef,
} from '../src/core/index.ts';
import type { BattleResult, MapBotStyle, MapNode, MapState, Placed } from '../src/core/index.ts';
import { validateBase } from '../src/core/validate.ts';
import { hash32 } from '../src/core/rng.ts';

const DECO = new Set(['palm', 'rock']);
const res = (destroyedPct: number, stars: number): BattleResult => ({ over: true, stars, destroyedPct, hqDown: stars >= 2 });

/** 一条固定的测试航线：第 0 层两座岛，第 1 层一座岛加补给礁，第 2 层两座岛，第 3 层终点 */
function testState(): MapState {
  const r = routeOf('2026-11-01');
  const layers: MapNode[][] = [
    [{ kind: 'island', island: 'm01', mirror: false }, { kind: 'island', island: 'm04', mirror: true }],
    [{ kind: 'island', island: 'm02', mirror: false }, { kind: 'reef' }],
    [{ kind: 'island', island: 'm03', mirror: false }, { kind: 'island', island: 'm06', mirror: false }],
    [{ kind: 'island', island: 'b1', mirror: false }],
  ];
  return startMap({ ...r, layers });
}

function snapshot(layout: Placed[]) {
  return validateBase({ v: 1, base: { buildings: layout, nextId: layout.length + 1 }, res: { gold: 0, wood: 0 }, boats: [] });
}

function play(day: string, style: MapBotStyle): MapState {
  let s = startMap(routeOf(day));
  while (!s.over) {
    const m = mapBotMove(s, style);
    if (m.kind === 'home') s = goHome(s);
    else if (m.kind === 'reef') s = takeReef(s, m.node, m.pick);
    else {
      const setup = stopSetup(s, m.node, m.rest);
      const run = runStop(setup, botActions(setup, style));
      s = finishStop(s, m.node, m.rest, run.result, fleetSurvivors(s, m.rest, run.survivors), run.energyLeft);
    }
  }
  return s;
}

describe('航线生成', () => {
  it('同一天两次完全相同，不同天不同', () => {
    expect(routeOf('2026-11-01')).toEqual(routeOf('2026-11-01'));
    const keys = new Set<string>();
    for (let d = 1; d <= 10; d++) keys.add(JSON.stringify(routeOf(`2026-11-${String(d).padStart(2, '0')}`).layers));
    expect(keys.size).toBeGreaterThanOrEqual(9);
    expect(routeOf('2026-11-01').seed).not.toBe(routeOf('2026-11-02').seed);
  });

  it('结构：4 层、前三层两个节点、第 0 层没有补给礁、每层最多一个、终点是宝岛、船队 4–6 条', () => {
    for (let d = 0; d < 60; d++) {
      const r = routeOf(`2027-01-${String((d % 28) + 1).padStart(2, '0')}#${d}`);
      expect(r.layers.length).toBe(MAP_LAYERS);
      for (let l = 0; l < 3; l++) {
        expect(r.layers[l]!.length).toBe(2);
        const reefs = r.layers[l]!.filter((n) => n.kind === 'reef').length;
        expect(reefs).toBeLessThanOrEqual(l === 0 ? 0 : 1);
      }
      const last = r.layers[3]!;
      expect(last.length).toBe(1);
      expect(last[0]!.kind === 'island' && MAP_BOSSES.some((b) => b.id === (last[0] as { island: string }).island)).toBe(true);
      const ids = r.layers.flat().flatMap((n) => (n.kind === 'island' ? [n.island] : []));
      expect(new Set(ids).size).toBe(ids.length);
      expect(r.fleet.length).toBeGreaterThanOrEqual(4);
      expect(r.fleet.length).toBeLessThanOrEqual(6);
      expect(r.skills.length).toBeGreaterThanOrEqual(2);
      expect(r.skills.length).toBeLessThanOrEqual(3);
      for (const b of r.fleet) expect(b.alive).toBe(b.cap);
    }
  });

  it('开局：能量 8、宝分 0、第 0 层', () => {
    const s = startMap(routeOf('2026-11-01'));
    expect(s.energy).toBe(8);
    expect(s.pts).toBe(0);
    expect(s.layer).toBe(0);
    expect(s.over).toBe(false);
  });
});

describe('内容', () => {
  it('12 座微型岛四种风格各 3、3 座终点宝岛带宝藏箱；建筑数 8–12；名字和 id 不重复', () => {
    expect(MAP_ISLANDS.length).toBe(12);
    for (const st of ['cannon', 'mine', 'mortar', 'vault'] as const) expect(MAP_ISLANDS.filter((d) => d.style === st).length).toBe(3);
    expect(MAP_BOSSES.length).toBe(3);
    for (const b of MAP_BOSSES) {
      expect(b.style).toBe('boss');
      expect(b.layout.some((p) => p.kind === 'treasure')).toBe(true);
    }
    const all = [...MAP_ISLANDS, ...MAP_BOSSES];
    expect(new Set(all.map((d) => d.id)).size).toBe(all.length);
    expect(new Set(all.map((d) => d.name)).size).toBe(all.length);
    for (const d of all) {
      const n = d.layout.filter((p) => !DECO.has(p.kind)).length;
      expect(n, d.id).toBeGreaterThanOrEqual(8);
      expect(n, d.id).toBeLessThanOrEqual(12);
      expect(d.hint).toEqual(mapHint(d.layout));
      expect(d.hint.some((h) => h.includes('雷'))).toBe(false);
    }
  });

  it('所有岛（原样和镜像）过放置校验：不越界、不重叠、主寨 3–6 级名额和等级合法', () => {
    for (const d of [...MAP_ISLANDS, ...MAP_BOSSES]) {
      for (const mirror of [false, true]) {
        const layout = nodeLayout({ kind: 'island', island: d.id, mirror });
        const v = snapshot(layout);
        expect(v.ok ? 'ok' : v.error, `${d.id} ${mirror}`).toBe('ok');
        for (const p of layout) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x + BUILDINGS[p.kind].size).toBeLessThanOrEqual(ISLAND);
        }
        const hq = layout.find((p) => p.kind === 'hq')!;
        expect(hq.level).toBeGreaterThanOrEqual(3);
        expect(hq.level).toBeLessThanOrEqual(6);
      }
      const plain = nodeLayout({ kind: 'island', island: d.id, mirror: false });
      const mir = nodeLayout({ kind: 'island', island: d.id, mirror: true });
      plain.forEach((p, i) => expect(mir[i]!.x).toBe(ISLAND - p.x - BUILDINGS[p.kind].size));
    }
  });

  it('船队模板 3–4 套，每套 4–6 条船、2–3 个技能', () => {
    expect(MAP_FLEETS.length).toBeGreaterThanOrEqual(3);
    expect(MAP_FLEETS.length).toBeLessThanOrEqual(4);
    for (const f of MAP_FLEETS) {
      expect(f.crew.length).toBeGreaterThanOrEqual(4);
      expect(f.crew.length).toBeLessThanOrEqual(6);
      expect(f.skills.length).toBeGreaterThanOrEqual(2);
      expect(f.skills.length).toBeLessThanOrEqual(3);
    }
  });
});

describe('站内', () => {
  it('stopSetup：去掉休整船和全灭船，能量、种子、规则版本、镜像布局', () => {
    let s = testState();
    s = { ...s, energy: 13, fleet: s.fleet.map((b, i) => (i === 1 ? { ...b, alive: 0 } : b)) };
    const setup = stopSetup(s, 1, 0);
    expect(setup.army.boats.length).toBe(s.fleet.length - 2);
    expect(setup.army.boats[0]!.troop).toBe(s.fleet[2]!.troop);
    expect(setup.army.energy).toBe(13);
    expect(setup.seed).toBe(hash32('map.battle:0:1', s.route.seed));
    expect(setup.rules).toBe(RULES_VERSION);
    expect(setup.layout).toEqual(nodeLayout({ kind: 'island', island: 'm04', mirror: true }));
  });

  it('只剩一条活船时不许休整它', () => {
    const s0 = testState();
    const s = { ...s0, fleet: s0.fleet.map((b, i) => (i === 2 ? b : { ...b, alive: 0 })) };
    expect(restOf(s, 2)).toBe(-1);
    expect(stopSetup(s, 0, 2).army.boats.length).toBe(1);
    // 休整一条全灭的船可以（把它救回一半）
    expect(restOf(s, 0)).toBe(0);
  });

  it('runStop 最多打 MAP_STOP_TICKS 拍', () => {
    const s = testState();
    const setup = stopSetup(s, 0, -1);
    const run = runStop(setup, []);
    expect(run.ticks).toBeLessThanOrEqual(MAP_STOP_TICKS);
    const run2 = runStop(setup, botActions(setup, 'normal'));
    expect(run2.ticks).toBeLessThanOrEqual(MAP_STOP_TICKS);
    expect(run2.survivors.length).toBe(setup.army.boats.length);
    run2.survivors.forEach((n, i) => expect(n).toBeLessThanOrEqual(setup.army.boats[i]!.count));
  });
});

describe('站间写回', () => {
  it('存活写回、休整船恢复缺员一半（向下取整）、能量 = 剩余 + 2 封顶、宝分 = 岛分 × 摧毁率 + 星加成', () => {
    let s = testState();
    s = { ...s, fleet: s.fleet.map((b, i) => (i === 0 ? { ...b, alive: b.cap - 5 } : b)) };
    const surv = s.fleet.map((b) => b.alive);
    surv[1] = 1;
    surv[0] = 999; // 休整船填什么都按恢复算
    const t = finishStop(s, 0, 0, res(80, 2), surv, 3);
    expect(t.fleet[0]!.alive).toBe(s.fleet[0]!.cap - 5 + 2);
    expect(t.fleet[1]!.alive).toBe(1);
    expect(t.energy).toBe(5);
    expect(t.pts).toBe(Math.floor((45 * 80) / 100) + 20);
    expect(t.layer).toBe(1);
    expect(t.log[0]).toMatchObject({ layer: 0, node: 0, destroyedPct: 80, stars: 2, rested: 0, lost: s.fleet[1]!.alive - 1 });
    expect(finishStop(s, 0, -1, res(0, 0), s.fleet.map((b) => b.alive), 19).energy).toBe(MAP_ENERGY_MAX);
    expect(finishStop(s, 0, -1, res(0, 0), s.fleet.map((b) => b.alive)).energy).toBe(s.energy + 2);
    // 存活数不能比出战前多
    expect(finishStop(s, 0, -1, res(0, 0), s.fleet.map((b) => b.cap + 9)).fleet).toEqual(s.fleet);
    // 原状态没被改
    expect(s.layer).toBe(0);
    expect(s.log.length).toBe(0);
  });

  it('fleetSurvivors 把出战船下标换成 fleet 下标', () => {
    const s0 = testState();
    const s = { ...s0, fleet: s0.fleet.map((b, i) => (i === 1 ? { ...b, alive: 0 } : b)) };
    const out = fleetSurvivors(s, 0, [1, 2, 3]);
    expect(out[0]).toBe(s.fleet[0]!.alive);
    expect(out[1]).toBe(0);
    expect(out.slice(2, 5)).toEqual([1, 2, 3].map((n, k) => Math.min(n, s.fleet[k + 2]!.alive)));
  });

  it('补给礁：补兵每条船恢复缺员一半；补能量 +8 封顶；不是礁的节点不动', () => {
    let s = testState();
    s = finishStop(s, 0, -1, res(50, 1), s.fleet.map((b) => Math.floor(b.alive / 3)), 6);
    expect(s.layer).toBe(1);
    const crew = takeReef(s, 1, 'crew');
    crew.fleet.forEach((b, i) => expect(b.alive).toBe(s.fleet[i]!.alive + Math.floor((b.cap - s.fleet[i]!.alive) / 2)));
    expect(crew.layer).toBe(2);
    expect(crew.log.at(-1)).toMatchObject({ reef: 'crew', gain: 0 });
    expect(takeReef(s, 1, 'energy').energy).toBe(16);
    expect(takeReef({ ...s, energy: 15 }, 1, 'energy').energy).toBe(MAP_ENERGY_MAX);
    expect(takeReef(s, 0, 'crew')).toBe(s);
  });
});

describe('结局', () => {
  it('全灭：over、wiped，终局宝分按 70%', () => {
    let s = testState();
    s = finishStop(s, 0, -1, res(60, 1), s.fleet.map((b) => b.alive), 5);
    const before = s.pts;
    s = finishStop(s, 0, -1, res(50, 1), s.fleet.map(() => 0), 0);
    expect(s.over).toBe(true);
    expect(s.end).toBe('wiped');
    const pts = before + Math.floor((55 * 50) / 100) + 10;
    expect(s.pts).toBe(pts);
    expect(mapFinal(s)).toEqual({ pts: Math.floor((pts * 70) / 100), stars: [0, 1, 2].filter((i) => Math.floor((pts * 70) / 100) >= MAP_STAR_PTS[i]!).length, score: Math.floor((pts * 70) / 100) });
    // 结束后再操作不变
    expect(finishStop(s, 0, -1, res(100, 3), s.fleet.map((b) => b.alive))).toBe(s);
    expect(goHome(s)).toBe(s);
  });

  it('收航：over、home，宝分全算', () => {
    let s = testState();
    s = finishStop(s, 0, -1, res(100, 3), s.fleet.map((b) => b.alive), 5);
    s = goHome(s);
    expect(s.end).toBe('home');
    expect(mapFinal(s).pts).toBe(45 + 30);
    expect(mapFinal(s).score).toBe(75);
  });

  it('通关：打完终点岛 over、clear；星按阈值', () => {
    let s = testState();
    const all = (st: MapState) => st.fleet.map((b) => b.alive);
    s = finishStop(s, 0, -1, res(100, 3), all(s), 5);
    s = takeReef(s, 1, 'energy');
    s = finishStop(s, 1, -1, res(100, 3), all(s), 5);
    expect(s.layer).toBe(3);
    s = finishStop(s, 0, -1, res(100, 3), all(s), 5);
    expect(s.over).toBe(true);
    expect(s.end).toBe('clear');
    expect(s.pts).toBe(45 + 30 + 60 + 30 + 120 + 30);
    expect(mapFinal(s).stars).toBe(3);
    expect(mapFinal({ ...s, pts: MAP_STAR_PTS[0] - 1 }).stars).toBe(0);
    expect(mapFinal({ ...s, pts: MAP_STAR_PTS[0] }).stars).toBe(1);
    expect(mapFinal({ ...s, pts: MAP_STAR_PTS[1] }).stars).toBe(2);
  });

  it('MAP_RULES 就是这些函数', () => {
    expect(MAP_RULES.routeOf).toBe(routeOf);
    expect(MAP_RULES.finishStop).toBe(finishStop);
    expect(MAP_RULES.mapFinal).toBe(mapFinal);
  });
});

describe('整局确定性', () => {
  it('同一天、同一串决定和机器人操作，两次得到同一结果', () => {
    for (const style of ['normal', 'novice'] as const) {
      const a = play('2026-11-03', style);
      const b = play('2026-11-03', style);
      expect(a.over).toBe(true);
      expect(b).toEqual(a);
      expect(mapFinal(b).score).toBe(mapFinal(a).score);
    }
  }, 15_000); // 负载 28–32、maxWorkers=1 实测 1.9 秒，取 4 倍
});
