/**
 * 大潮无尽配平模拟：node tools/td-tide-sim.ts [--n 20] [--map 0..3] [--weeks 2026-44,…] [--json]
 * 每张图（模板 × 镜像两种）、每种机器人打 n 局（周种子 + 局序号当 setup 种子，结果只看机器人的局内决策），
 * 打印撑过的波数（平均、最少、中位、最多）、击退数、时长（游戏内秒）。DESIGN 10.6e 的实测表用它量，本机用 nice 跑。
 */
import { RULES_VERSION, TIDE_MAPS, runTdBot, tideSetup } from '../src/core/index.ts';
import type { IsoWeek, TdSetup } from '../src/core/index.ts';
import { tideMap, tidePick } from '../src/core/tdtide.ts';
import { flag, num } from './args.ts';

const n = Math.max(1, num('--n', 20));
const only = flag('--map') ? num('--map', 0) : -1;

// 找一周对应某张图、某个镜像：扫周号直到凑齐（图和镜像都由周标签的哈希定）
const picks: Array<{ week: IsoWeek; map: number; mirror: boolean }> = [];
for (let wk = 1; picks.length < TIDE_MAPS.length * 2 && wk < 400; wk++) {
  const week: IsoWeek = { year: 2026 + Math.floor((wk - 1) / 52), week: ((wk - 1) % 52) + 1 };
  const p = tidePick(week);
  if (!picks.some((q) => q.map === p.map && q.mirror === p.mirror)) picks.push({ week, ...p });
}
picks.sort((a, b) => a.map - b.map || Number(a.mirror) - Number(b.mirror));

const fmt = (v: number): string => v.toFixed(1);
console.log(`每种每格 ${n} 局；时长为游戏内秒`);
const all: Record<string, number[]> = { novice: [], normal: [] };
for (const p of picks) {
  if (only >= 0 && p.map !== only) continue;
  for (const kind of ['novice', 'normal'] as const) {
    const waves: number[] = [];
    let kills = 0;
    let ticks = 0;
    for (let i = 1; i <= n; i++) {
      const base = tideSetup(p.week);
      const setup: TdSetup = { ...base, seed: i, rules: RULES_VERSION };
      const { result } = runTdBot(setup, kind);
      waves.push(result.waves);
      kills += result.kills ?? 0;
      ticks += result.ticks;
    }
    waves.sort((a, b) => a - b);
    all[kind]!.push(...waves);
    const avg = waves.reduce((a, b) => a + b, 0) / n;
    console.log(
      `${tideMap(p.week).name}${p.mirror ? '（镜像）' : ''} ${kind === 'novice' ? '小白' : '普通'}：撑过 平均 ${fmt(avg)} 波，最少 ${waves[0]}，中位 ${waves[Math.floor(n / 2)]}，最多 ${waves[n - 1]}；击退 ${fmt(kills / n)}；${fmt(ticks / n / 20)} 秒`,
    );
  }
}
for (const kind of ['novice', 'normal'] as const) {
  const v = all[kind]!;
  if (v.length) console.log(`合计 ${kind === 'novice' ? '小白' : '普通'}：平均 ${fmt(v.reduce((a, b) => a + b, 0) / v.length)} 波（${v.length} 局）`);
}
