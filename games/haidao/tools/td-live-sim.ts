/**
 * 悬赏守岛（实盘）配平：node tools/td-live-sim.ts --n 2000 [--tier small] [--from 1] [--json]
 * 每档用小白、普通两个机器人各打 n 局（种子 from..from+n-1），按 src/core/tdlive.ts 的倍数表算每场期望（份）± 2 倍标准误、
 * 赢的场次（结回 > 带入）、星数分布、0 星平均撑过几波、平均时长（游戏内秒）。目标区间见 docs/balance.md 第 2 节。
 * --json：输出可合并的原始汇总（给 td-live-merge.ts，拆成几片在 CI 上并行跑）。
 */
import { runTdBot } from '../src/core/tdbot.ts';
import { LIVE_TIER_IDS, type LiveTier } from '../src/core/live.ts';
import { tdLiveSetup } from '../src/core/tdlive.ts';
import { line, zero, type Raw, type Style } from './td-live-lib.ts';

const args = process.argv.slice(2);
const opt = (k: string): string | undefined => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const n = Number(opt('--n') ?? 500) || 500;
const from = Number(opt('--from') ?? 1) || 1;
const only = opt('--tier');
const json = args.includes('--json');

if (!json) console.log(`每格 ${n} 局（种子 ${from}–${from + n - 1}）；期望单位：份（结回倍数 − 1），± 2SE`);
const all: Raw[] = [];
for (const tier of LIVE_TIER_IDS as readonly LiveTier[]) {
  if (only && tier !== only) continue;
  for (const style of ['novice', 'normal'] as Style[]) {
    const r = zero(tier, style);
    const t0 = Date.now();
    for (let seed = from; seed < from + n; seed++) {
      const { result } = runTdBot(tdLiveSetup(tier, seed), style);
      r.n++;
      r.dist[result.stars]!++;
      r.lost += result.lost;
      r.ticks += result.ticks;
      if (result.stars === 0) {
        // 存折算后的占比 1 − (1 − 撑过占比)³（和 tdLiveBp 的 0 星折算一致），合并时乘 bp[0] 就是期望里的 0 星部分
        const f = 1 - (1 - result.waves / Math.max(1, result.total)) ** 3;
        r.f0 += f;
        r.f0sq += f * f;
        r.waves0 += result.waves;
      }
    }
    all.push(r);
    if (!json) console.log(`${line(r)}  [${Math.round((Date.now() - t0) / n)} ms/局]`);
  }
}
if (json) console.log(JSON.stringify(all));
