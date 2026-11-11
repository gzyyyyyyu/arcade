/**
 * 护航实盘配平：node tools/escort-live-sim.ts --n 2000 [--from 1] [--tier small] [--json 输出文件]
 *               node tools/escort-live-sim.ts --merge 片1.json 片2.json …
 * 每档用 ESCORT_LIVE_TIERS 那一关，小白、普通机器人各打 n 局（种子 from..from+n-1），按当前倍数表报期望 ± 2SE，对照 docs/balance.md 第 2 节。
 * 拆片：不同 --from 各写一个 --json，再 --merge（合并时按当前 bp 重算，只改 bp 不用重跑）。本机用 nice 跑。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { runEscortBot } from '../src/core/escortbot.ts';
import { ESCORT_LIVE_TIERS, escortLiveSetup } from '../src/core/escortlive.ts';
import { LIVE_TIER_IDS, type LiveTier } from '../src/core/live.ts';
import { type Raw, type Style, add, line, zero } from './live-fit-lib.ts';

const args = process.argv.slice(2);
const opt = (k: string): string | undefined => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const STYLES: Style[] = ['novice', 'normal'];

function print(raws: Raw[]): void {
  for (const r of raws) console.log(`${ESCORT_LIVE_TIERS[r.tier].level.padEnd(15)}${line(r, ESCORT_LIVE_TIERS[r.tier].bp)}`);
}

if (args[0] === '--merge') {
  const acc = new Map<string, Raw>();
  for (const f of args.slice(1)) {
    for (const r of JSON.parse(readFileSync(f, 'utf8')) as Raw[]) {
      const k = `${r.tier}.${r.style}`;
      if (!acc.has(k)) acc.set(k, zero(r.tier, r.style));
      add(acc.get(k)!, r);
    }
  }
  print([...acc.values()]);
} else {
  const n = Math.max(1, Number(opt('--n') ?? 200) || 200);
  const from = Number(opt('--from') ?? 1) || 1;
  const only = opt('--tier');
  const tiers = LIVE_TIER_IDS.filter((t) => !only || t === only) as LiveTier[];
  const out: Raw[] = [];
  for (const tier of tiers) {
    for (const style of STYLES) {
      const r = zero(tier, style);
      for (let seed = from; seed < from + n; seed++) {
        const { escort } = runEscortBot(style, escortLiveSetup(tier, seed));
        const st = escort.arrived ? Math.max(0, Math.min(3, escort.stars)) : 0;
        r.n++;
        r.dist[st]!++;
        r.secs += escort.ticks / 20;
        if (st === 0) {
          const total = Math.max(1, escort.total);
          const f = Math.min(total, escort.cells) / total;
          r.f0 += f;
          r.f0sq += f * f;
        }
      }
      out.push(r);
    }
  }
  const json = opt('--json');
  if (json) writeFileSync(json, JSON.stringify(out));
  else print(out);
}
