/**
 * 残局抽样推演（docs/ai.md 第 1 节「残局推演」）：牌不多时，把几个候选出法各自推演到这一副打完，挑平均得分最高的。
 * 不读别人的手牌：按"没出现过的牌"（108 张减去我手里的、出过的、我看得到的贡牌）随机分给另外三家，张数对得上；
 * 每种分法里四家都按启发式（调用方给的 policy）打到底，按名次给分（双下 3、单下 2、末游 1，对方拿到就是负的）。
 * 整个过程只用调用方给的随机流，同一视图同一随机流结果相同。
 */
import { dealOver, fullDeck, nextActiveSeat, partnerOf, playsBeating, teamOf, trickTaken, type Card, type Play, type PlayerView, type Rng, type Seat, type Trick } from '../core/index.ts';

export interface EndgameOptions {
  /** 四家剩牌合计不超过这个数才推演 */
  total: number;
  /** 每个候选推演几种分牌 */
  samples: number;
  /** 工作量上限：推演里每次让一家想一手，按他手里的张数记（理牌的开销随张数涨）；超了就用已推完的那几轮，单次耗时有界 */
  budget: number;
}

/** 推演里一家出牌：拿这家的视图（手牌是分到的）回一手或 null（不要） */
export type Policy = (view: PlayerView) => Play | null;

/** 一副打完时这一队的得分：头游那队按对家名次拿 3 / 2 / 1，另一队拿负的 */
function dealScore(finished: readonly Seat[], team: number): number {
  const head = finished[0]!;
  const place = finished.indexOf(partnerOf(head));
  const up = place === 1 ? 3 : place === 2 ? 2 : 1;
  return teamOf(head) === team ? up : -up;
}

/** 我知道在谁手里的牌：交出去的贡牌（公开）、我还给别人的牌，没打出去的都还在对方手里 */
function knownHands(v: PlayerView, played: ReadonlySet<Card>): Map<Seat, Card[]> {
  const out = new Map<Seat, Card[]>();
  const put = (seat: Seat, c: Card | null) => {
    if (c === null || seat < 0 || seat === v.seat || played.has(c)) return;
    out.set(seat, [...(out.get(seat) ?? []), c]);
  };
  for (const e of v.tribute?.entries ?? []) {
    put(e.to, e.card);
    put(e.from, e.back);
  }
  return out;
}

/** 按没出现过的牌给另外三家随机分一手；张数对不上（不该发生）回 null */
function sampleHands(v: PlayerView, rng: Rng): Card[][] | null {
  const played = new Set<Card>();
  for (const h of v.history) if (h.play) for (const c of h.play.cards) played.add(c);
  const known = knownHands(v, played);
  const taken = new Set<Card>([...v.hand, ...played, ...[...known.values()].flat()]);
  const pool = rng.shuffle(fullDeck().filter((c) => !taken.has(c)));
  const hands: Card[][] = [[], [], [], []];
  let at = 0;
  for (let s = 0; s < 4; s++) {
    if (s === v.seat) {
      hands[s] = [...v.hand];
      continue;
    }
    const fixed = known.get(s) ?? [];
    const need = v.counts[s]! - fixed.length;
    if (need < 0) return null;
    hands[s] = [...fixed, ...pool.slice(at, at + need)];
    at += need;
  }
  return at === pool.length ? hands : null;
}

interface Node {
  hands: Card[][];
  trick: Trick;
  finished: Seat[];
  turn: Seat;
  history: PlayerView['history'];
}

/** 走一步（null = 不要），原地改 n；这一副打完回 true */
function step(n: Node, play: Play | null): boolean {
  const seat = n.turn;
  n.history.push({ seat, play });
  if (!play) {
    n.trick.passed[seat] = true;
    const taken = trickTaken(n.trick, n.finished);
    if (taken) {
      n.trick = { leader: taken.leader, last: null, passed: [false, false, false, false] };
      n.turn = taken.leader;
    } else n.turn = nextActiveSeat(n.finished, seat);
    return false;
  }
  const rm = new Set(play.cards);
  n.hands[seat] = n.hands[seat]!.filter((c) => !rm.has(c));
  n.trick = { leader: n.trick.leader, last: { seat, play }, passed: [false, false, false, false] };
  if (n.hands[seat]!.length === 0) {
    n.finished.push(seat);
    if (dealOver(n.finished)) return true;
  }
  n.turn = nextActiveSeat(n.finished, seat);
  return false;
}

function viewAt(v: PlayerView, n: Node): PlayerView {
  return { ...v, seat: n.turn, hand: n.hands[n.turn]!, counts: n.hands.map((h) => h.length), turn: n.turn, trick: n.trick, finished: n.finished, history: n.history, myTribute: null };
}

/** 从 n 起四家都按 policy 打到这一副结束，回我方得分；打不完（不该发生）算 0 */
function rollout(v: PlayerView, n: Node, policy: Policy, work: { used: number }): number {
  for (let k = 0; k < 400; k++) {
    const view = viewAt(v, n);
    const plays = playsBeating(view.hand, n.trick.last?.play ?? null, v.level, v.options);
    let p = plays.find((x) => x.cards.length === view.hand.length) ?? null;
    if (!p && plays.length) {
      work.used += view.hand.length;
      p = policy(view);
    }
    if (!p && !n.trick.last) p = plays[0]!;
    if (step(n, p)) return dealScore(n.finished, teamOf(v.seat));
  }
  return 0;
}

/**
 * 在候选出法里挑推演平均得分最高的（null = 不要）；baseline 是启发式本来要走的，打平时选它。
 * 牌还多、只有一个候选、分牌失败时回 undefined（照启发式出）。
 */
export function endgamePick(v: PlayerView, candidates: readonly (Play | null)[], baseline: Play | null, policy: Policy, rng: Rng, o: EndgameOptions): Play | null | undefined {
  if (candidates.length < 2) return undefined;
  const live = v.counts.reduce((a, b) => a + b, 0);
  if (live > o.total) return undefined;
  const sum = candidates.map(() => 0);
  const work = { used: 0 };
  for (let k = 0; k < o.samples && work.used < o.budget; k++) {
    const hands = sampleHands(v, rng);
    if (!hands) return undefined;
    candidates.forEach((mv, i) => {
      const n: Node = { hands: hands.map((h) => [...h]), trick: { ...v.trick, passed: [...v.trick.passed] }, finished: [...v.finished], turn: v.seat, history: [...v.history] };
      sum[i] = sum[i]! + (step(n, mv) ? dealScore(n.finished, teamOf(v.seat)) : rollout(v, n, policy, work));
    });
  }
  let top = 0;
  for (let i = 1; i < sum.length; i++) if (sum[i]! > sum[top]!) top = i;
  const baseIdx = candidates.indexOf(baseline);
  if (baseIdx >= 0 && sum[baseIdx]! >= sum[top]!) return baseline;
  return candidates[top];
}
