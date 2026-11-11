/**
 * 配平（docs/balance.md，结果写 DESIGN.md 4.1）：单机各场地，座位 0 是小白或普通（scripts/play.ts），三个电脑照场地表挑性格、配状态，打 N 场。
 * 报每场净输赢（份，均值 ± 2 倍标准误）、胜率（一场结束净输赢为正）、一场多久、输光、赢满 3 份、落在 ±1 份以内的比例。
 * 时长按真人速度估：自己每个决定 3 秒，电脑 0.8 秒（play.ts 的 BOT_SECS，单机电脑停顿压缩后的速度），每局另加换牌、定缺、结算 20 秒（和 sim.ts 一样）。
 * 三人两房（DESIGN.md 2.11）加 --three：3 个人、筒条两门、不定缺、不换三张，电脑只坐 2 个座位。血流成河（2.10）加 --flow。
 * 用法：node scripts/balance.ts [--rounds 1|4|8|16，不给就是默认 8 局；实盘一局一结用 1] [--three] [--flow] [场数] [场地，逗号分隔] [场地参数 JSON（调参时临时覆盖场地表，比如 '{"soft":600}'）] [小白参数 JSON] [普通参数 JSON]
 * 想快就每个场地开一个进程。
 */
import { stream } from 'arcade-kit/rng';
import { seatPlan, VENUES, type Venue } from '../src/ai/venues.ts';
import { sichuanXuezhan as XZ } from '../src/core/variants/sichuan-xuezhan/index.ts';
import { stakesOf, type StakesId } from '../src/game/stakes.ts';
import { meanSe, minutesOf, NOVICE, pct, playMatch, PLAYER, roundsArg, signed } from './play.ts';

const ROUNDS = roundsArg();
const THREE = process.argv.includes('--three');
if (THREE) process.argv.splice(process.argv.indexOf('--three'), 1);
const FLOW = process.argv.includes('--flow');
if (FLOW) process.argv.splice(process.argv.indexOf('--flow'), 1);
const EXTRA = { ...(THREE ? { three: true, swap: false } : {}), ...(FLOW ? { flow: true } : {}) };
const N = Number(process.argv[2] ?? 2000);
const ONLY = process.argv[3]?.split(',');
const OVERRIDE = process.argv[4] && process.argv[4] !== '-' ? (JSON.parse(process.argv[4]) as Partial<Venue>) : null;
const P_NOVICE = { ...NOVICE, ...(process.argv[5] ? JSON.parse(process.argv[5]) : {}) };
const P_PLAYER = { ...PLAYER, ...(process.argv[6] ? JSON.parse(process.argv[6]) : {}) };
// 三人两房有自己一行的档位（venues.ts 的 <场地>:three）用那一行，和游戏里 venueOf 一样
const venues = Object.keys(VENUES)
  .filter((v) => v.startsWith('solo:') && !v.endsWith(':three') && (!ONLY || ONLY.includes(v)))
  .map((v) => (THREE && VENUES[`${v}:three`] ? `${v}:three` : v));

for (const venue of venues) {
  if (OVERRIDE) (VENUES as Record<string, Venue>)[venue] = { ...VENUES[venue]!, ...OVERRIDE };
  const st = stakesOf(venue.split(':')[1] as StakesId)!;
  for (const proxy of [P_NOVICE, P_PLAYER]) {
    const nets: number[] = [];
    const mins: number[] = [];
    let win = 0;
    let bust = 0;
    let cap = 0;
    let inside = 0;
    let mine = 0;
    for (let i = 0; i < N; i++) {
      const key = [i, st.share, proxy === P_PLAYER ? 1 : 2, 11, 11, 11, 11, 11];
      const plan = seatPlan(stream(key, 'persona'), venue, THREE ? 2 : 3);
      const { s, moves } = playMatch(key, st.share, [0, ...plan.personas], [{ mood: 0, soft: 0 }, ...plan.tunes], new Map([[0, proxy]]), ROUNDS, EXTRA);
      const net = XZ.result(s).seats[0]!.net / st.share;
      nets.push(net);
      mine += moves[0]!;
      mins.push(minutesOf(moves, s.history.length));
      if (net > 0) win++;
      if (Math.abs(net) <= 1) inside++;
      if (s.chips[0]! <= 0) bust++;
      if (s.chips[0]! >= st.share * 4) cap++;
    }
    const { mean, se } = meanSe(nets);
    const avgMin = mins.reduce((a, x) => a + x, 0) / N;
    const p = (x: number): string => `${((x / N) * 100).toFixed(1)}%`;
    console.log(
      `${venue.padEnd(16)} ${proxy.name}  ${ROUNDS === 1 ? '每局' : '每场'} ${signed(mean)} ± ${(2 * se).toFixed(3)} 份  胜 ${p(win)}  平均 ${avgMin.toFixed(1)} 分  每小时 ${signed((mean * 60) / avgMin, 2)} 份  ` +
        `时长 p50 ${pct(mins, 50).toFixed(1)} 分（p10 ${pct(mins, 10).toFixed(1)}、p90 ${pct(mins, 90).toFixed(1)}）  输光 ${p(bust)}  赢满 3 份 ${p(cap)}  ±1 份以内 ${p(inside)}  自己每场做决定 ${(mine / N).toFixed(0)} 次`,
    );
  }
}
