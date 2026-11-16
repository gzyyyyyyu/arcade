/**
 * 护航配平模拟：node tools/escort-sim.ts [--n 50] [--from 1] [--level strait-normal]
 * 9 关各打 n 局（种子 from..from+n-1），小白、普通两种机器人各一遍：胜率（到达且 ≥ 1★）、星数分布（0–3★）、沉船率。
 * 目标（design 5）：新手档小白 ≥ 60%、普通 ≥ 75%；普通档 40–50% / 55–65%；高手档 ≤ 30% / 40–50%。本机用 nice 跑小样本，大批量上 CI。
 * 依赖核心的 runEscortBot(kind, setup) → { result, escort }（src/core/escortbot.ts）；核心没合进来时这里的导入会报错。
 */
import { ESCORT_LEVELS, escortSetup } from '../src/core/index.ts';
import { runEscortBot } from '../src/core/escortbot.ts';
import { num, opt } from './args.ts';

const n = Math.max(1, num('--n', 50));
const from = num('--from', 1);
const only = opt('--level');
const KINDS = ['novice', 'normal'] as const;
const pct = (x: number): string => `${((100 * x) / n).toFixed(0)}%`;

const levels = ESCORT_LEVELS.filter((l) => !only || l.id === only);
if (levels.length === 0) throw new Error(`没有这一关：${only}`);

console.log(`护航 sim：每格 ${n} 局，种子 ${from}..${from + n - 1}`);
console.log('关卡\t\t机器人\t胜率\t0★/1★/2★/3★\t沉船率');
for (const lv of levels) {
  for (const kind of KINDS) {
    let win = 0;
    let sunk = 0;
    const dist = [0, 0, 0, 0];
    for (let s = from; s < from + n; s++) {
      const { result, escort } = runEscortBot(kind, escortSetup(lv.id, s)) as { result: { stars: number }; escort: { arrived: boolean; sunk: boolean } };
      const st = escort.arrived ? Math.max(0, Math.min(3, result.stars)) : 0;
      dist[st]!++;
      if (escort.arrived && result.stars >= 1) win++;
      if (escort.sunk) sunk++;
    }
    console.log(`${lv.id}\t${kind}\t${pct(win)}\t${dist.map((d) => pct(d)).join(' / ')}\t${pct(sunk)}`);
  }
}
