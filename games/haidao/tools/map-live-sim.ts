/**
 * 寻宝航线实盘配平：node tools/map-live-sim.ts --days 2000 [--from 2026-11-10] [--json 输出文件]
 *                  node tools/map-live-sim.ts --merge 片1.json 片2.json …
 * 连续 N 天的航线（每天一条，航线和船队由日期定），小白、普通机器人每天各跑一趟（复用 map-sim.ts 的 playDay）。
 * 四档难度一样（全服同一条航线），所以只跑一遍，按 MAP_LIVE_TIERS 每档的倍数表分别算期望 ± 2SE，对照 docs/balance.md 第 2 节。
 * 拆片：不同 --from 各写一个 --json 再 --merge（合并时按当前 bp 重算，只改 bp 不用重跑）。本机用 nice 跑。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { MAP_STAR_PTS } from '../src/core/map.ts';
import { MAP_LIVE_TIERS } from '../src/core/maplive.ts';
import { LIVE_TIER_IDS } from '../src/core/live.ts';
import { type Raw, type Style, add, line, zero } from './live-fit-lib.ts';
import { playDay } from './map-sim.ts';
import { argv, num, opt } from './args.ts';

const STYLES: Style[] = ['novice', 'normal'];

function dayAdd(day: string, k: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + k);
  return d.toISOString().slice(0, 10);
}

/** 结局和档位无关：汇总存在 small 名下，打印时按每档的 bp 重算 */
function print(raws: Raw[]): void {
  for (const tier of LIVE_TIER_IDS) for (const r of raws) console.log(line({ ...r, tier }, MAP_LIVE_TIERS[tier].bp));
}

if (argv[0] === '--merge') {
  const acc = new Map<Style, Raw>();
  for (const f of argv.slice(1)) {
    for (const r of JSON.parse(readFileSync(f, 'utf8')) as Raw[]) {
      if (!acc.has(r.style)) acc.set(r.style, zero('small', r.style));
      add(acc.get(r.style)!, r);
    }
  }
  print([...acc.values()]);
} else {
  const days = Math.max(1, num('--days', 200));
  const from = opt('--from') ?? '2026-11-10';
  const out: Raw[] = [];
  for (const style of STYLES) {
    const r = zero('small', style);
    for (let k = 0; k < days; k++) {
      const p = playDay(dayAdd(from, k), style);
      r.n++;
      r.dist[p.final.stars]!++;
      r.secs += p.secs;
      if (p.final.stars === 0) {
        const f = Math.min(MAP_STAR_PTS[0], p.final.pts) / MAP_STAR_PTS[0];
        r.f0 += f;
        r.f0sq += f * f;
      }
    }
    out.push(r);
  }
  const json = opt('--json');
  if (json) writeFileSync(json, JSON.stringify(out));
  else print(out);
}
