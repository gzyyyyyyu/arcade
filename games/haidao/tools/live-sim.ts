/**
 * 悬赏出海（实盘）配平：node tools/live-sim.ts --n 2000 [--tier small] [--from 1]
 * 每档用小白、普通两个机器人各打 n 局（种子 from..from+n-1），按 src/core/live.ts 的倍数表算每场期望（份）± 2 倍标准误、
 * 赢的场次（结回 > 带入）、星数分布、平均时长（游戏内秒，部队全灭就停表）。目标区间见 docs/balance.md 第 2 节。
 */
import { battleResult, botActions, createBattle, stepBattle } from '../src/core/index.ts';
import { LIVE_TIER_IDS, liveBp, liveSetup, type LiveTier } from '../src/core/live.ts';

const args = process.argv.slice(2);
const opt = (k: string): string | undefined => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const n = Number(opt('--n') ?? 500) || 500;
const from = Number(opt('--from') ?? 1) || 1;
const only = opt('--tier');

console.log(`每格 ${n} 局（种子 ${from}–${from + n - 1}）；期望单位：份（结回倍数 − 1），± 2SE`);
for (const tier of LIVE_TIER_IDS as readonly LiveTier[]) {
  if (only && tier !== only) continue;
  for (const style of ['novice', 'normal'] as const) {
    let sum = 0;
    let sq = 0;
    let wins = 0;
    let secs = 0;
    const dist = [0, 0, 0, 0];
    let pct0 = 0;
    for (let seed = from; seed < from + n; seed++) {
      const setup = liveSetup(tier, seed);
      const acts = botActions(setup, style);
      const s = createBattle(setup);
      let k = 0;
      let wiped = -1;
      while (!s.over) {
        const now = [];
        while (k < acts.length && acts[k]!.t <= s.tick) now.push(acts[k++]!);
        stepBattle(s, now);
        if (wiped < 0 && s.landed.every(Boolean) && !s.units.some((u) => u.mode !== 'dead')) wiped = s.tick;
      }
      const r = battleResult(s);
      const v = liveBp(tier, r) / 10_000 - 1;
      sum += v;
      sq += v * v;
      if (v > 0) wins++;
      dist[r.stars] = (dist[r.stars] ?? 0) + 1;
      if (r.stars === 0) pct0 += r.destroyedPct;
      secs += (wiped >= 0 ? wiped : s.tick) / 20;
    }
    const mean = sum / n;
    const se = Math.sqrt(Math.max(0, sq / n - mean * mean) / n);
    console.log(
      `${tier.padEnd(6)}${(style === 'novice' ? '小白' : '普通').padEnd(4)} 期望 ${mean >= 0 ? '+' : ''}${mean.toFixed(3)} ± ${(2 * se).toFixed(3)}  赢 ${Math.round((wins * 100) / n)}%  星 0/1/2/3 = ${dist.join('/')}  0 星平均摧毁 ${dist[0] ? Math.round(pct0 / dist[0]) : 0}%  时长 ${Math.round(secs / n)} 秒`,
    );
  }
}
