/**
 * 单机锦标赛配平（仓库根 docs/balance.md 第 2 节，docs/tournament.md 14.4）：小白（novice）、普通（simple）坐 0 号，对一桌电脑（强弱档 = 实盘各档的 SOLO_LEVEL）打完一场，
 * 只记"我"拿第几名。奖金只看名次，所以每格记下名次分布，奖金表怎么调都能直接算期望，不用重跑。
 *
 * node scripts/tour-balance.ts [每格场数，默认 2000] [--format=sng,turbo,nine] [--levels=1,2,3,4] [--from=种子起点] [--pay=a,b,c] [--threads=n]
 * 输出每格一行：名次分布、进前三的概率、平均手数，和按 --pay（份，默认按 payouts）算的每场期望 ± 2 倍标准误。
 * 大表放 CI 上跑（一次性 sim/texas-* 分支），本机只拿小场数试。
 */
import { availableParallelism } from 'node:os';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { stream } from 'arcade-kit/rng';
import { isFail } from '../src/core/table.ts';
import { view } from '../src/core/view.ts';
import { formatInfo, newTour, payouts, tourAi, tourApply, type TourFormat, type TourState } from '../src/tour/rules.ts';
import { STRATEGIES } from '../test/support/strategies.ts';

type Job = { format: TourFormat; level: number; strategy: string; from: number; to: number };
/** [名次, 手数] */
type Row = [number, number];

const seedOf = (k: number): number[] => [k, 0x70b1, 3, 4, 5, 6, 7, 8];

function one(j: Job, k: number): Row {
  const seed = seedOf(k);
  const n = formatInfo(j.format).seats;
  const play = STRATEGIES[j.strategy]!;
  let s: TourState = newTour({ format: j.format, humans: Array.from({ length: n }, (_, i) => i === 0), level: j.level }, seed);
  let guard = 0;
  // 我出局就有名次了，剩下的不用打
  while (!s.over && s.places[0] === null) {
    if (++guard > 200_000) throw new Error(`stuck in game ${k}`);
    const seat = s.table.toAct;
    if (seat === null) throw new Error(`no one to act in game ${k}`);
    const a = seat === 0 ? play(view(s.table, 0), stream(seed, 'player', s.table.handNo * 0x20000 + s.table.log.length)) : tourAi(s)!.action;
    const r = tourApply(s, seat, a);
    if (isFail(r)) throw new Error(r.error);
    s = r;
  }
  const place = s.places[0] ?? 1;
  return [place, s.table.handNo];
}

if (!isMainThread) {
  const j = workerData as Job;
  const rows: Row[] = [];
  for (let k = j.from; k < j.to; k++) rows.push(one(j, k));
  parentPort!.postMessage(rows);
}

const arg = (k: string): string | undefined => process.argv.find((x) => x.startsWith(`--${k}=`))?.slice(k.length + 3);

const THREADS = Number(arg('threads') ?? Math.max(1, availableParallelism() - (process.env.CI ? 0 : 2)));

function fanout(n: number, from0: number, job: (from: number, to: number) => Job): Promise<Row[]> {
  const chunk = Math.ceil(n / THREADS);
  const jobs: Promise<Row[]>[] = [];
  for (let from = from0; from < from0 + n; from += chunk)
    jobs.push(
      new Promise((ok, fail) => {
        const w = new Worker(new URL(import.meta.url), { workerData: job(from, Math.min(from0 + n, from + chunk)) });
        w.once('message', ok);
        w.once('error', fail);
      }),
    );
  return Promise.all(jobs).then((x) => x.flat());
}

async function main(): Promise<void> {
  const n = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 2000);
  const from = Number(arg('from') ?? 0);
  const formats = (arg('format') ?? 'turbo,nine').split(',') as TourFormat[];
  const levels = (arg('levels') ?? '1,2,3,4').split(',').map(Number);
  const pay = arg('pay')?.split(',').map(Number);
  console.log(`锦标赛配平：每格 ${n} 场（种子 ${from} 起），${THREADS} 线程`);
  for (const format of formats) {
    const seats = formatInfo(format).seats;
    // 份：报名 1 份，奖金按名次（默认 payouts 按 100 的报名费算再除回去）
    const prize = pay ?? payouts(100, format).map((x) => x / 100);
    for (const level of levels)
      for (const sg of ['novice', 'simple']) {
        const rows = await fanout(n, from, (a, b) => ({ format, level, strategy: sg, from: a, to: b }));
        const hist = new Array<number>(seats).fill(0);
        for (const [p] of rows) hist[p - 1]!++;
        const xs = rows.map(([p]) => (prize[p - 1] ?? 0) - 1);
        const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
        const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1));
        const top3 = (hist[0]! + hist[1]! + hist[2]!) / rows.length;
        const hands = rows.reduce((a, [, h]) => a + h, 0) / rows.length;
        console.log(
          `CELL ${format} level=${level} ${sg === 'novice' ? '小白' : '普通'} n=${rows.length} hist=${hist.join(',')} 前三=${(top3 * 100).toFixed(1)}% 第一=${((hist[0]! / rows.length) * 100).toFixed(1)}% ` +
            `期望=${mean >= 0 ? '+' : ''}${mean.toFixed(3)}±${((2 * sd) / Math.sqrt(xs.length)).toFixed(3)}份 我出局前平均手数=${hands.toFixed(1)}`,
        );
      }
  }
}

if (isMainThread) await main();
