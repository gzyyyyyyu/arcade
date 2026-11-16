/**
 * 寻宝航线（每日航线，娱乐）配平：node tools/map-sim.ts --days 60 [--from 2026-11-01]
 * 连续 N 天的航线，每天小白、普通机器人各打一局（航线、船队、种子都由日期定，同一天两次结果相同）。
 * 打印平均宝分、星分布、三星率、平均时长（每站实际拍数 / 20 + 每站 10 秒决策）、覆灭率、收航率、平均打了几站。
 * 目标（普通）：平均 1.5–1.8 星、三星 15–25%、一局 3–4 分钟；阈值在 src/core/map.ts 的 MAP_STAR_PTS，岛的宝分在 src/content/maps.ts。
 */
import {
  MAP_BOSSES,
  MAP_FLEETS,
  MAP_ISLANDS,
  MAP_STAR_PTS,
  TROOPS,
  fleetPct,
  botActions,
  finishStop,
  fleetSurvivors,
  goHome,
  mapBotMove,
  mapFinal,
  routeOf,
  runStop,
  startMap,
  stopSetup,
  takeReef,
} from '../src/core/index.ts';
import type { MapBotStyle, MapState } from '../src/core/index.ts';
import { flag, num, opt } from './args.ts';

const days = num('--days', 60);
const from = opt('--from') ?? '2026-11-01';
const verbose = flag('--v');

/** 'YYYY-MM-DD' 加 k 天（工具里用 Date 没关系，核心不用） */
function dayAdd(day: string, k: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + k);
  return d.toISOString().slice(0, 10);
}

interface Play {
  final: ReturnType<typeof mapFinal>;
  end: MapState['end'];
  secs: number;
  battles: number;
  stops: number;
  islands: string[];
}

export function playDay(day: string, style: MapBotStyle): Play {
  let s = startMap(routeOf(day));
  let secs = 0;
  let battles = 0;
  let stops = 0;
  const islands: string[] = [];
  while (!s.over) {
    const m = mapBotMove(s, style);
    secs += 10;
    if (m.kind === 'home') {
      s = goHome(s);
      break;
    }
    stops++;
    if (m.kind === 'reef') {
      s = takeReef(s, m.node, m.pick);
      continue;
    }
    const setup = stopSetup(s, m.node, m.rest);
    const n = s.route.layers[s.layer]?.[m.node];
    if (n?.kind === 'island') islands.push(`${n.island}`);
    const run = runStop(setup, botActions(setup, style));
    secs += run.ticks / 20;
    battles++;
    s = finishStop(s, m.node, m.rest, run.result, fleetSurvivors(s, m.rest, run.survivors), run.energyLeft);
    if (verbose) console.log(day, style, `L${s.log.at(-1)?.layer}`, n?.kind === 'island' ? n.island : '', `${run.result.destroyedPct}% ${run.result.stars}★ +${s.log.at(-1)?.gain}`, `${run.ticks}拍`, s.fleet.map((b) => `${b.alive}/${b.cap}`).join(' '), `能量${s.energy}`);
  }
  return { final: mapFinal(s), end: s.end, secs, battles, stops, islands };
}

/** --islands：每座岛 × 每套船队（满编、开局能量）× 普通 / 小白机器人打一站，看摧毁率、星、拍数、损耗；调岛用 */
function islandTable(): void {
  console.log('岛 | 风格 | 宝分 | 普通：摧毁率 / 星 / 拍数 / 剩兵% | 小白：摧毁率 / 星');
  for (const def of [...MAP_ISLANDS, ...MAP_BOSSES]) {
    const acc = { normal: [0, 0, 0, 0], novice: [0, 0, 0, 0] };
    let n = 0;
    for (const fl of MAP_FLEETS) {
      for (const mirror of [false, true]) {
        const route = routeOf('probe');
        const fleet = fl.crew.map((troop) => {
          const cap = troop === 'captain' ? 1 : Math.max(1, Math.floor(fl.boatCap / TROOPS[troop].housing));
          return { troop, level: fl.level, cap, alive: cap };
        });
        const r2 = { ...route, fleet, skills: fl.skills, layers: [[{ kind: 'island' as const, island: def.id, mirror }], ...route.layers.slice(1)] };
        const s = startMap(r2);
        n++;
        for (const style of ['normal', 'novice'] as const) {
          const setup = stopSetup(s, 0, -1);
          const run = runStop(setup, botActions(setup, style));
          const after = finishStop(s, 0, -1, run.result, fleetSurvivors(s, -1, run.survivors), run.energyLeft);
          const a = acc[style];
          a[0]! += run.result.destroyedPct;
          a[1]! += run.result.stars;
          a[2]! += run.ticks;
          a[3]! += fleetPct(after.fleet);
        }
      }
    }
    const f = (a: number[]): string => `${Math.round(a[0]! / n)}% / ${(a[1]! / n).toFixed(1)} / ${Math.round(a[2]! / n)} / ${Math.round(a[3]! / n)}%`;
    console.log(`${def.id} ${def.name} | ${def.style} | ${def.pts} | ${f(acc.normal)} | ${f(acc.novice)}`);
  }
}

const isMain = process.argv[1]?.endsWith('map-sim.ts');
if (isMain && flag('--islands')) islandTable();
else if (isMain) {
  console.log(`${days} 天（${from} 起），每天每种机器人一局；星阈值 ${MAP_STAR_PTS.join(' / ')}`);
  console.log('机器人 | 平均宝分 | 平均星 | 0★ / 1★ / 2★ / 3★ | 三星率 | 平均时长 | 覆灭率 | 收航率 | 平均战斗站');
  for (const style of ['novice', 'normal'] as const) {
    let pts = 0;
    let stars = 0;
    let secs = 0;
    let battles = 0;
    let wiped = 0;
    let home = 0;
    const dist = [0, 0, 0, 0];
    const all: number[] = [];
    const byIsland = new Map<string, number>();
    for (let k = 0; k < days; k++) {
      const p = playDay(dayAdd(from, k), style);
      pts += p.final.pts;
      all.push(p.final.pts);
      stars += p.final.stars;
      dist[p.final.stars]!++;
      secs += p.secs;
      battles += p.battles;
      if (p.end === 'wiped') wiped++;
      if (p.end === 'home') home++;
      for (const id of p.islands) byIsland.set(id, (byIsland.get(id) ?? 0) + 1);
    }
    const pc = (v: number): string => `${Math.round((v * 100) / days)}%`;
    const sec = Math.round(secs / days);
    console.log(
      `${style === 'novice' ? '小白' : '普通'} | ${Math.round(pts / days)} | ${(stars / days).toFixed(2)} | ${dist.join(' / ')} | ${pc(dist[3]!)} | ${Math.floor(sec / 60)}分${sec % 60}秒 | ${pc(wiped)} | ${pc(home)} | ${(battles / days).toFixed(2)}`,
    );
    all.sort((a, b) => a - b);
    const q = (f: number): number => all[Math.min(all.length - 1, Math.floor(all.length * f))] ?? 0;
    console.log(`  宝分分位 p10 ${q(0.1)} / p25 ${q(0.25)} / p50 ${q(0.5)} / p75 ${q(0.75)} / p90 ${q(0.9)}`);
    if (verbose) console.log([...byIsland.entries()].sort().map(([k, v]) => `${k}:${v}`).join(' '));
  }
}
