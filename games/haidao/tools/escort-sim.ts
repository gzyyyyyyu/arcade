/**
 * 护航配平模拟：node tools/escort-sim.ts [--n 50] [--from 1] [--level strait-normal]
 * 9 关各打 n 局（种子 from..from+n-1），小白、普通两种机器人各一遍：胜率（到达且 ≥ 1★）、星数分布（0–3★）、沉船率。
 * 目标是共用难度线（src/content/difficulty.ts）：三张图并列，进度按难度档（新手 0、普通 0.5、高手 1），
 * 普通机器人看三星率、小白看胜率，偏出容差标 ↑ 太易 / ↓ 太难。本机用 nice 跑小样本，大批量上 CI。
 */
import { diffTarget, offMark, progressOf } from '../src/content/difficulty.ts';
import { ESCORT_DIFFS, ESCORT_LEVELS, escortSetup } from '../src/core/index.ts';
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
console.log('关卡\t\t机器人\t胜率\t0★/1★/2★/3★\t沉船率\t对目标');
for (const lv of levels) {
  const t = diffTarget(progressOf(ESCORT_DIFFS.indexOf(lv.diff), ESCORT_DIFFS.length));
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
    const [got, aim] = kind === 'normal' ? [(100 * dist[3]!) / n, t.steady3] : [(100 * win) / n, t.novice1];
    const vs = `${kind === 'normal' ? '3★' : '胜率'} ${Math.round(got)}% / ${Math.round(aim)}%${offMark(got, aim)}`;
    console.log(`${lv.id}\t${kind}\t${pct(win)}\t${dist.map((d) => pct(d)).join(' / ')}\t${pct(sunk)}\t${vs}`);
  }
}
