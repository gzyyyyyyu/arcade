/**
 * 残局闯关的求解器（docs/doudizhu.md「残局闯关」）：明牌、极小极大。
 * 地主要在"两家农民任何应对"下先出完；农民那边只要有一个应对让地主输，就算地主输（两家农民当成一方，合作）。
 * 地主也可以"不要"（让农民先走有时才是赢法），所以"必胜"是对地主所有合法着法算的，不只是出牌。
 * 着法按"点数多重集"枚举（花色不影响规则）：对手牌所有子集调 interpretDdz，所以带牌是全枚举，不像 enumerateDdz 只给最小带法，
 * 否则农民少了应对，"必胜"就是假的。出牌合法性和 dispatchDdz 同一套：chooseDdz(interpretDdz(牌), 要压的牌)，pass 的轮转也一样。
 */
import { type Card, BIG_JOKER, SMALL_JOKER, makeCard } from '../../../core/cards.ts';
import { type DdzAction, type DdzState, next3, targetOf } from '../core/game.ts';
import { type DdzPlay, chooseDdz, ddzValue, interpretDdz, isBombish } from '../core/patterns.ts';

/** 一手牌，用点数值（3..15，小王 16，大王 17）表示 */
interface Move {
  vals: number[];
  /** 这些牌的各种读法（首出取第一个，跟牌取第一个压得上的，和 dispatchDdz 一样） */
  options: DdzPlay[];
  /** 用掉哪些点数的几张，供快速扣除 */
  sig: string;
}

interface Node {
  /** 三家手牌，点数值升序 */
  hands: number[][];
  target: { seat: number; play: DdzPlay } | null;
  turn: number;
}

export interface Solution {
  win: boolean;
  /** 轮到地主且能赢时，地主该出的那一手（最少步数的必胜着法） */
  line?: DdzAction;
  /** 必胜时地主最少还要出几手（不管农民怎么应对都不超过它） */
  plays?: number;
}

const sigOf = (vals: readonly number[]): string => vals.join(',');

/** 点数值 → 一张假牌（只为喂给 interpretDdz；同点数用不同花色区分） */
function fakeCard(v: number, k: number): Card {
  if (v === SMALL_JOKER || v === BIG_JOKER) return makeCard(v, 0);
  return makeCard(v === 15 ? 2 : v, k);
}

function fakeCards(vals: readonly number[]): Card[] {
  const seen = new Map<number, number>();
  return vals.map((v) => {
    const k = seen.get(v) ?? 0;
    seen.set(v, k + 1);
    return fakeCard(v, k);
  });
}

const movesCache = new Map<string, Move[]>();

/** 一手牌里所有能出的不同点数组合（手牌 ≤ 约 17 张时也能算，求解器按 ≤ 10 张设计） */
function movesOf(hand: readonly number[]): Move[] {
  const key = sigOf(hand);
  const hit = movesCache.get(key);
  if (hit) return hit;
  const out: Move[] = [];
  const seen = new Set<string>();
  const n = hand.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const vals: number[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) vals.push(hand[i]!);
    const sig = sigOf(vals);
    if (seen.has(sig)) continue;
    seen.add(sig);
    const options = interpretDdz(fakeCards(vals));
    if (options.length) out.push({ vals, options, sig });
  }
  // 张数多的先试：地主常常大手先出，剪枝更快
  out.sort((a, b) => b.vals.length - a.vals.length || a.vals[0]! - b.vals[0]!);
  movesCache.set(key, out);
  return out;
}

function removeVals(hand: readonly number[], vals: readonly number[]): number[] {
  const rest = hand.slice();
  for (const v of vals) rest.splice(rest.indexOf(v), 1);
  return rest;
}

/** 这个人现在所有合法着法（play 带读法；pass 用 null），顺序固定 */
interface Step {
  move: Move | null;
  play: DdzPlay | null;
}

function stepsOf(node: Node): Step[] {
  const target = node.target ? node.target.play : null;
  const out: Step[] = [];
  for (const m of movesOf(node.hands[node.turn]!)) {
    const play = chooseDdz(m.options, target);
    if (play) out.push({ move: m, play });
  }
  if (node.target) out.push({ move: null, play: null });
  return out;
}

/** 走一步（和 dispatchDdz 一致）：出牌记为要压的牌，pass 后轮回出牌人就清空 */
function advance(node: Node, step: Step): Node {
  if (step.move) {
    const hands = node.hands.map((h, i) => (i === node.turn ? removeVals(h, step.move!.vals) : h));
    return { hands, target: { seat: node.turn, play: step.play! }, turn: next3(node.turn) };
  }
  const turn = next3(node.turn);
  return { hands: node.hands, target: turn === node.target!.seat ? null : node.target, turn };
}

function nodeKey(node: Node): string {
  const t = node.target;
  const tk = t ? `${t.seat}:${t.play.type}:${t.play.v}:${t.play.len}:${t.play.cards.length}` : '-';
  return `${node.hands.map(sigOf).join('|')}#${tk}#${node.turn}`;
}

/** 每个局面记两个界：win 是已证明"k 手内能赢"的最小 k，fail 是已证明"k 手内赢不了"的最大 k；k 越大越容易赢，所以不同的 k 能共用结论 */
interface Bound {
  win: number;
  fail: number;
}
const memo = new Map<string, Bound>();
const MEMO_MAX = 600000;
export const UNBOUNDED = 99;

/** 设计关卡时用：搜索节点超过预算就放弃（候选牌太难算，不适合做关卡）；平时不设上限 */
class BudgetExceeded extends Error {}
let budget = Infinity;
export function withBudget<T>(nodes: number, f: () => T): T | null {
  budget = nodes;
  try {
    return f();
  } catch (e) {
    if (e instanceof BudgetExceeded) return null;
    throw e;
  } finally {
    budget = Infinity;
  }
}

/** 地主能不能在 k 手之内（含现在这一手）稳赢；k 用 UNBOUNDED 表示不限 */
function can(node: Node, landlord: number, k: number): boolean {
  if (--budget < 0) throw new BudgetExceeded();
  const key = nodeKey(node);
  let b = memo.get(key);
  if (b) {
    if (k >= b.win) return true;
    if (k <= b.fail) return false;
  } else {
    if (memo.size > MEMO_MAX) memo.clear();
    b = { win: Infinity, fail: -1 };
    memo.set(key, b);
  }
  let res: boolean;
  const mine = node.turn === landlord;
  if (mine && k <= 0) res = false;
  else {
    const steps = stepsOf(node);
    if (mine) {
      res = false;
      for (const st of steps) {
        // 出牌用掉一手；"不要"不算手数（地主有时要让农民先走，才能赢）
        if (st.move ? st.move.vals.length === node.hands[node.turn]!.length || can(advance(node, st), landlord, k - 1) : can(advance(node, st), landlord, k)) {
          res = true;
          break;
        }
      }
    } else {
      res = true;
      for (const st of steps) {
        // 农民出完牌就是地主输；否则看地主还能不能赢
        if ((st.move && st.move.vals.length === node.hands[node.turn]!.length) || !can(advance(node, st), landlord, k)) {
          res = false;
          break;
        }
      }
    }
  }
  if (res) b.win = Math.min(b.win, k);
  else b.fail = Math.max(b.fail, k);
  return res;
}

function nodeOf(s: DdzState): Node {
  const t = targetOf(s);
  return {
    hands: s.hands.map((h) => h.map(ddzValue).sort((a, b) => a - b)),
    target: t?.play ? { seat: t.seat, play: t.play } : null,
    turn: s.turn,
  };
}

/** 地主最少要几手才能稳赢（不能赢回 Infinity） */
function fewest(node: Node, landlord: number): number {
  if (!can(node, landlord, UNBOUNDED)) return Infinity;
  const size = node.hands[landlord]!.length;
  for (let k = 1; k <= size; k++) if (can(node, landlord, k)) return k;
  return size;
}

/** 点数多重集 → 这个人手里真实的牌 */
function cardsFor(hand: readonly Card[], vals: readonly number[]): Card[] {
  const pool = hand.slice();
  return vals.map((v) => pool.splice(pool.findIndex((c) => ddzValue(c) === v), 1)[0]!);
}

function actionOf(s: DdzState, st: Step): DdzAction {
  return st.move ? { type: 'play', seat: s.turn, cards: cardsFor(s.hands[s.turn]!, st.move.vals) } : { type: 'pass', seat: s.turn };
}

/** 局面（出牌阶段）里，地主是不是无论农民怎么应对都能先出完。轮到地主时顺带给最快的必胜着法 */
export function solve(s: DdzState): Solution {
  const node = nodeOf(s);
  const plays = fewest(node, s.landlord);
  if (plays === Infinity) return { win: false };
  const sol: Solution = { win: true, plays };
  if (node.turn === s.landlord) {
    const st = stepsOf(node).find((x) => (x.move ? x.move.vals.length === node.hands[node.turn]!.length || can(advance(node, x), s.landlord, plays - 1) : can(advance(node, x), s.landlord, plays)));
    if (st) sol.line = actionOf(s, st);
  }
  return sol;
}

/** 给玩家的提示：地主有必胜着法就给最快的一手，没有（已经走错）回 null */
export function hint(s: DdzState): DdzAction | null {
  if (s.phase !== 'play' || s.turn !== s.landlord) return null;
  return solve(s).line ?? null;
}

/** 候选应对的排序：不浪费炸弹 → 点数小的 → 张数多的；"不要"放最后（农民会尽量压） */
function humanRank(st: Step): number[] {
  if (!st.move || !st.play) return [2, 0, 0];
  return [isBombish(st.play) ? 1 : 0, st.play.v, -st.move.vals.length];
}

/** 字典序：a 比 b 大 */
function greater(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return false;
}

/**
 * 农民（非地主）这一步怎么应对，确定性：
 * 能直接出完就出完；能让地主输的应对里选"最像人"的；地主已经必胜时，选让他要出最多手的（拖得最久），再按"像人"打破平局。
 */
export function bestReply(s: DdzState): DdzAction {
  const node = nodeOf(s);
  const steps = stepsOf(node);
  let best: { st: Step; score: number[] } | null = null;
  for (const st of steps) {
    const out = st.move !== null && st.move.vals.length === node.hands[node.turn]!.length;
    const left = out ? Infinity : fewest(advance(node, st), s.landlord);
    // 分数越大越好：先看地主还剩几手才能赢（Infinity = 地主赢不了），再看像不像人
    const score = [out ? 2 : left === Infinity ? 1 : 0, left === Infinity ? 0 : left, ...humanRank(st).map((x) => -x)];
    if (!best || greater(score, best.score)) best = { st, score };
  }
  return actionOf(s, best!.st);
}

/** 地主现在每个出法是不是必胜（关卡难度的度量：必胜出法占的比例越小越难） */
export function rootMoves(s: DdzState): { action: DdzAction; wins: boolean }[] {
  const node = nodeOf(s);
  return stepsOf(node).map((st) => ({
    action: actionOf(s, st),
    wins: (st.move !== null && st.move.vals.length === node.hands[node.turn]!.length) || can(advance(node, st), s.landlord, UNBOUNDED),
  }));
}

/** 轮到的人现在所有合法着法（和 dispatchDdz 认的一致，相同点数的牌只列一种选法）：测试对拍用 */
export function legalActions(s: DdzState): DdzAction[] {
  return stepsOf(nodeOf(s)).map((st) => actionOf(s, st));
}
