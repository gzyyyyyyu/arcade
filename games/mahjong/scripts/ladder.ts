/**
 * 茶馆擂台的配平（DESIGN.md 4.1）：座位 0 是小白或普通（scripts/play.ts 的模拟玩家），按 src/game/ladder.ts 连打三桌（新手 → 普通 → 高手，娱乐的短局：川麻 1 局、立直一局），
 * 每桌的牌和三个电脑跟游戏里一样由这一轮的密钥派生。报每一桌的赢面（打完净分 ≥ 0）、不重打三桌全赢的比例、每轮能原桌重打一次时三桌全赢的比例。
 * 目标：普通模拟玩家三桌全赢约 15%–25%。
 * 用法：node scripts/ladder.ts [轮数] [xz,xl,rc，不写全跑] [小白|普通，不写两个都跑]
 */
import { stream } from 'arcade-kit/rng';
import { AIS } from '../src/ai/index.ts';
import { decideAs } from '../src/ai/riichi.ts';
import { fixedStyle } from '../src/ai/style.ts';
import type { Persona } from '../src/ai/personas.ts';
import { seatPlan, venueOf } from '../src/ai/venues.ts';
import { riichi as RC, type RcAction, type RcState, type RcView } from '../src/core/variants/riichi/index.ts';
import { sichuanXuezhan as XZ } from '../src/core/variants/sichuan-xuezhan/index.ts';
import type { VariantAi } from '../src/core/variants/types.ts';
import { LADDER_LEVELS, LADDER_MODES, tableKey, TABLES, winsTable, type LadderMode, type LadderRun } from '../src/game/ladder.ts';
import { baseOf, stakesOf } from '../src/game/stakes.ts';
import { NOVICE, playMatch, PLAYER } from './play.ts';

const N = Number(process.argv[2] ?? 500);
const MODES = (process.argv[3] && process.argv[3] !== '-' ? process.argv[3].split(',') : LADDER_MODES) as LadderMode[];
const WHO = process.argv[4] ? [process.argv[4]] : ['小白', '普通'];
const SHARE = stakesOf('fun')!.share;
const rcAi = AIS[RC.id]! as VariantAi<RcView, RcAction>;

function riichiNet(key: number[], personas: number[], tunes: { mood: number; soft: number }[], proxy: Persona): number {
  const me: VariantAi<RcView, RcAction> = { decide: (v) => decideAs(v, fixedStyle(proxy)) };
  let s = RC.begin(key, { ...RC.defaults, length: 'ikkyoku' }, ['human', 'ai', 'ai', 'ai'], { share: SHARE, base: baseOf(SHARE), personas, tunes }) as RcState;
  for (let n = 0; n < 200_000 && !RC.over(s); n++) {
    const act = RC.actors(s);
    if (!act?.seats.length) {
      s = RC.resume(s);
      continue;
    }
    const seat = act.seats[0]!;
    const next = RC.apply(s, seat, RC.auto(s, seat, seat === 0 ? me : rcAi));
    if ('error' in next) throw new Error(`move rejected: ${next.error}`);
    s = next as RcState;
  }
  return RC.result(s).seats[0]!.net;
}

/** 打一桌，回这一桌的净分 */
function playTable(run: LadderRun, proxy: Persona): number {
  const key = tableKey(run);
  const plan = seatPlan(stream(key, 'persona'), venueOf('solo', 'fun', true, LADDER_LEVELS[run.table]), 3);
  const personas = [0, ...plan.personas];
  const tunes = [{ mood: 0, soft: 0 }, ...plan.tunes];
  if (run.mode === 'rc') return riichiNet(key, personas, tunes, proxy);
  const { s } = playMatch(key, SHARE, personas, tunes, new Map([[0, proxy]]), 1, { flow: run.mode === 'xl' });
  return XZ.result(s).seats[0]!.net;
}

const pc = (x: number, n: number): string => `${((x / n) * 100).toFixed(1)}%`;
for (const mode of MODES) {
  for (const who of WHO) {
    const proxy = who === '小白' ? NOVICE : PLAYER;
    const tried = [0, 0, 0];
    const won = [0, 0, 0];
    let clear0 = 0;
    let clear1 = 0;
    for (let i = 0; i < N; i++) {
      const key = [i, LADDER_MODES.indexOf(mode), proxy === PLAYER ? 1 : 2, 31, 10, 20, 26, 7];
      // 一轮：最多重打一次；没用上重打就全赢的同时算进"不重打"
      let retried = 0;
      let table = 0;
      while (table < TABLES) {
        const net = playTable({ mode, key, table, retried }, proxy);
        tried[table]!++;
        if (winsTable(net)) {
          won[table]!++;
          table++;
        } else if (retried < 1) retried++;
        else break;
      }
      if (table === TABLES) {
        clear1++;
        if (retried === 0) clear0++;
      }
    }
    const per = LADDER_LEVELS.map((l, t) => `${l} ${pc(won[t]!, tried[t]!)}`).join('  ');
    console.log(`${mode} ${who}  每桌赢面 ${per}  三桌全赢：不重打 ${pc(clear0, N)}、能重打一次 ${pc(clear1, N)}（${N} 轮）`);
  }
}
