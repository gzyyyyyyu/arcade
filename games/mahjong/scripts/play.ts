/**
 * 模拟器共用（sim.ts、stake-room.ts、strength.ts）：打一整场，电脑座位照线上的打法（性格 + 状态 + 场地 + 局面），
 * 模拟玩家座位用固定参数（不浮动、不看局面），顺便数每个座位的打法指标。
 *
 * 模拟玩家（DESIGN.md 4.1）：
 * - PLAYER"普通"：简单合理的打法，防守、做牌都中等，偶尔打错；
 * - NOVICE"小白"：打孤张、不防守、见碰就碰，常打错。
 * 两个都是确定性的（同一个种子同一个结果），只拿自己座位的视图（decideAs），不读别人的牌。
 */
import { AIS } from '../src/ai/index.ts';
import type { Persona } from '../src/ai/personas.ts';
import { fixedStyle } from '../src/ai/style.ts';
import { decideAs } from '../src/ai/xuezhan.ts';
import { sichuanXuezhan as XZ, type XzAction, type XzOpts, type XzState, type XzView } from '../src/core/variants/sichuan-xuezhan/index.ts';
import type { Tune, VariantAi } from '../src/core/variants/types.ts';
import { baseOf } from '../src/game/stakes.ts';

const base = { kanLove: 400, temper: 0, swing: 0, tempo: 1_000, talk: 0, skill: 0, fun: 'normal' as const };
export const PLAYER: Persona = { ...base, name: '普通', style: '', defense: 500, greed: 300, pon: 500, slip: 40, reads: 300, level: 1 };
/** 小白（docs/balance.md 第 1 节）：只会按牌效打孤张，一点不防守、不读牌，见碰就碰、见杠就杠，常打错 */
export const NOVICE: Persona = { ...base, name: '小白', style: '', defense: 0, greed: 100, kanLove: 1_000, pon: 1_000, slip: 250, reads: 0, level: 0 };

const KINDS = ['ai', 'ai', 'ai', 'ai'] as const;

export interface Played {
  s: XzState;
  /** 每个座位：碰了几次、做了几次决定 */
  pons: number[];
  moves: number[];
}

/** 打一整场。extra：覆盖的规则选项（比如 { flow: true } 打血流成河）。proxies：这些座位用模拟玩家的固定参数；kinds 只影响"手软放过真人小胡"（模拟玩家当真人） */
export function playMatch(key: number[], share: number, personas: number[], tunes: Tune[], proxies: ReadonlyMap<number, Persona> = new Map(), rounds?: 1 | 4 | 8 | 16, extra: Partial<XzOpts> = {}): Played {
  const ai = AIS[XZ.id]! as VariantAi<XzView, XzAction>;
  const proxyAi = new Map([...proxies].map(([seat, p]) => [seat, { decide: (v: XzView) => decideAs(v, fixedStyle(p)) } as VariantAi<XzView, XzAction>]));
  const kinds = KINDS.map((k, i) => (proxies.has(i) ? 'human' : k));
  let s = XZ.begin(key, { ...XZ.defaults, ...(rounds ? { rounds } : {}), ...extra }, kinds, { share, base: baseOf(share, extra), personas, tunes }) as XzState;
  const pons = [0, 0, 0, 0];
  const moves = [0, 0, 0, 0];
  for (let n = 0; n < 20_000; n++) {
    if (XZ.over(s)) break;
    const act = XZ.actors(s);
    if (!act?.seats.length) {
      s = XZ.resume(s);
      continue;
    }
    const seat = act.seats[0]!;
    const a = XZ.auto(s, seat, proxyAi.get(seat) ?? ai);
    const next = XZ.apply(s, seat, a);
    if ('error' in next) throw new Error(`move rejected: ${next.error}`);
    moves[seat]!++;
    for (const e of (next as XzState).events) if (e.e === 'pon') pons[e.seat]!++;
    s = next as XzState;
  }
  return { s, pons, moves };
}

/** 时长估算（真人速度）：自己每个决定 3 秒；电脑每步 BOT_SECS；每局另加换牌、定缺、结算 20 秒。
 *  BOT_SECS 取 0.8（原 1.2）：单机电脑的停顿正在压缩，按压缩后的速度估 */
export const OWN_SECS = 3;
export const BOT_SECS = 0.8;
export const ROUND_SECS = 20;
export const minutesOf = (moves: number[], rounds: number): number => (moves[0]! * OWN_SECS + (moves[1]! + moves[2]! + moves[3]!) * BOT_SECS + rounds * ROUND_SECS) / 60;

/** 命令行参数 --rounds N（1/4/8/16）；不给就用默认规则 */
export function roundsArg(): 1 | 4 | 8 | 16 | undefined {
  const i = process.argv.indexOf('--rounds');
  if (i < 0) return undefined;
  const n = Number(process.argv[i + 1]);
  if (![1, 4, 8, 16].includes(n)) throw new Error('--rounds 只能是 1、4、8、16');
  process.argv.splice(i, 2);
  return n as 1 | 4 | 8 | 16;
}

/** 一个 0–999 之间的整数序列的分位数 */
export const pct = (xs: number[], p: number): number => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((xs.length * p) / 100))]!;

/** 均值和标准误 */
export function meanSe(xs: number[]): { mean: number; se: number } {
  const n = xs.length;
  const mean = xs.reduce((a, x) => a + x, 0) / n;
  const v = xs.reduce((a, x) => a + (x - mean) * (x - mean), 0) / Math.max(1, n - 1);
  return { mean, se: Math.sqrt(v / n) };
}

export const signed = (x: number, d = 3): string => (x >= 0 ? '+' : '') + x.toFixed(d);
