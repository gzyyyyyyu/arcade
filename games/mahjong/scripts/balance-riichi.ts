/**
 * 立直的配平（docs/balance.md，结果写 docs/riichi.md 第 7 节和 DESIGN.md 4.1）：单机各场地，座位 0 是小白或普通（scripts/play.ts 的模拟玩家，
 * 参数按立直的意思读：pon 是鸣牌、greed 是默听、defense 是弃和），三个电脑照场地表挑性格、配状态，打 N 场。
 * 报每场净输赢（份，均值 ± 2 倍标准误）、胜率（一场结束净输赢为正）、每小时、一场多久、输光、赢满 3 份、落在 ±1 份以内。
 * 时长按真人速度估：自己每个决定 3 秒，电脑 BOT_SEC 秒，每局另加发牌、结算 15 秒。
 * 用法：node scripts/balance-riichi.ts [场数] [场地，逗号分隔] [hanchan|tonpuu|ikkyoku] [种子起点] [小白|普通，不写两个都跑] [--json 文件]
 * 大量的到 CI 上分片跑（sim/mahjong-* 一次性分支），本机只跑小样本。
 */
import { writeFileSync } from 'node:fs';
import { stream } from 'arcade-kit/rng';
import { decideAs } from '../src/ai/riichi.ts';
import { AIS } from '../src/ai/index.ts';
import { fixedStyle } from '../src/ai/style.ts';
import type { Persona } from '../src/ai/personas.ts';
import { seatPlan, VENUES } from '../src/ai/venues.ts';
import { riichi as RC, type RcAction, type RcState, type RcView } from '../src/core/variants/riichi/index.ts';
import type { VariantAi } from '../src/core/variants/types.ts';
import { baseOf, stakesOf, type StakesId } from '../src/game/stakes.ts';
import { meanSe, NOVICE, pct, PLAYER, signed } from './play.ts';

/** 单机电脑每个决定的停顿（秒）：单机的电脑停顿在压缩（原来 1.2 秒），按压缩后的 0.8 秒估 */
const BOT_SEC = 0.8;
const OWN_SEC = 3;
const HAND_SEC = 15;
const args = process.argv.slice(2);
const jsonAt = args.indexOf('--json');
const JSON_OUT = jsonAt >= 0 ? args.splice(jsonAt, 2)[1] : undefined;
const N = Number(args[0] ?? 200);
const ONLY = args[1] && args[1] !== '-' ? args[1].split(',') : null;
const LENGTH = (args[2] ?? 'hanchan') as 'hanchan' | 'tonpuu' | 'ikkyoku';
const FROM = Number(args[3] ?? 0);
const WHO = args[4] ? [args[4]] : ['小白', '普通'];
if (LENGTH !== 'hanchan' && LENGTH !== 'tonpuu' && LENGTH !== 'ikkyoku') throw new Error('第三个参数是 hanchan、tonpuu 或 ikkyoku');
const venues = Object.keys(VENUES).filter((v) => v.startsWith('solo:') && (!ONLY || ONLY.includes(v)));
const ai = AIS[RC.id]! as VariantAi<RcView, RcAction>;

/** 娱乐的场地（solo:fun:easy）也按一份 2,000 记，换算成"份"才和实盘可比 */
const shareOf = (venue: string): number => stakesOf(venue.split(':')[1] as StakesId)?.share ?? 2_000;

function playOne(key: number[], venue: string, proxy: Persona): { s: RcState; moves: number[] } {
  const share = shareOf(venue);
  const plan = seatPlan(stream(key, 'persona'), venue, 3);
  const me: VariantAi<RcView, RcAction> = { decide: (v) => decideAs(v, fixedStyle(proxy)) };
  let s = RC.begin(key, { length: LENGTH }, ['human', 'ai', 'ai', 'ai'], { share, base: baseOf(share), personas: [0, ...plan.personas], tunes: [{ mood: 0, soft: 0 }, ...plan.tunes] }) as RcState;
  const moves = [0, 0, 0, 0];
  for (let n = 0; n < 200_000 && !RC.over(s); n++) {
    const act = RC.actors(s);
    if (!act?.seats.length) {
      s = RC.resume(s);
      continue;
    }
    const seat = act.seats[0]!;
    const next = RC.apply(s, seat, RC.auto(s, seat, seat === 0 ? me : ai));
    if ('error' in next) throw new Error(`move rejected: ${next.error}`);
    moves[seat]!++;
    s = next as RcState;
  }
  if (!RC.over(s)) throw new Error('一场没打完');
  return { s, moves };
}

const rows: unknown[] = [];
for (const venue of venues) {
  const share = shareOf(venue);
  for (const who of WHO) {
    const proxy = who === '小白' ? NOVICE : PLAYER;
    const nets: number[] = [];
    const mins: number[] = [];
    let win = 0;
    let bust = 0;
    let cap = 0;
    let inside = 0;
    for (let i = FROM; i < FROM + N; i++) {
      const key = [i, share, proxy === PLAYER ? 1 : 2, 27, 10, 26, LENGTH === 'hanchan' ? 1 : LENGTH === 'tonpuu' ? 2 : 3, 7];
      const { s, moves } = playOne(key, venue, proxy);
      const net = RC.result(s).seats[0]!.net / share;
      nets.push(net);
      mins.push((moves[0]! * OWN_SEC + (moves[1]! + moves[2]! + moves[3]!) * BOT_SEC + s.history.length * HAND_SEC) / 60);
      if (net > 0) win++;
      if (Math.abs(net) <= 1) inside++;
      if (net <= -1) bust++;
      if (net >= 3) cap++;
    }
    const { mean, se } = meanSe(nets);
    const avgMin = mins.reduce((a, x) => a + x, 0) / N;
    const p = (x: number): string => `${((x / N) * 100).toFixed(1)}%`;
    rows.push({ venue, who, length: LENGTH, from: FROM, n: N, mean, se, avgMin, perHour: (mean * 60) / avgMin, winRate: win / N, botSec: BOT_SEC, sum: nets.reduce((a, x) => a + x, 0), sumSq: nets.reduce((a, x) => a + x * x, 0), win, bust, cap, inside, minutes: mins.reduce((a, x) => a + x, 0) });
    console.log(
      `${venue.padEnd(16)} ${who} ${LENGTH}  每场 ${signed(mean)} ± ${(2 * se).toFixed(3)} 份  胜 ${p(win)}  每小时 ${signed((mean * 60) / avgMin, 2)} 份  ` +
        `时长 p50 ${pct(mins, 50).toFixed(1)} 分（p10 ${pct(mins, 10).toFixed(1)}、p90 ${pct(mins, 90).toFixed(1)}）  输光 ${p(bust)}  赢满 3 份 ${p(cap)}  ±1 份以内 ${p(inside)}`,
    );
  }
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(rows));
