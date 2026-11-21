/**
 * 立直的危险度（docs/riichi.md 第 3 节"押引"）：电脑押引（riichi.ts）和牌桌上给真人的"安全牌提示"共用这一套，
 * 只用公开信息——河、副露、立直宣告、宝牌指示牌，加上自己手里的牌；不碰别人的手牌和牌墙。纯函数，没有随机数和时间。
 */
import { countsOf, HONOR0, kindOf, rankOf } from '../core/tiles/index.ts';
import { doraOf, type RcView } from '../core/variants/riichi/index.ts';

/** 算危险度要的局面：看得见的张数、宝牌、各家的现物 */
interface DangerCtx {
  v: RcView;
  /** 看得见的每种牌的张数，不含自己手里的 */
  visible: number[];
  /** 每种牌是几张宝牌 */
  doraHits: number[];
  /** 现物：对每个有威胁的对手，哪些牌种他肯定不和；没威胁的是 null */
  safe: (Set<number> | null)[];
}

export function visibleCounts(v: RcView): number[] {
  const c = new Array<number>(34).fill(0);
  for (const s of v.seats) {
    for (const r of s.river) if (!r.taken) c[kindOf(r.tile)]!++;
    for (const m of s.melds) for (const t of m.tiles) if (t >= 0) c[kindOf(t)]!++;
  }
  for (const t of v.dora) c[kindOf(t)]!++;
  return c;
}

/**
 * 对立直的人，哪些牌是现物：他自己河里的牌，加上他立直宣告以后全桌打出的牌（他没和，就是放过了，同巡振听和立直后振听都管着他）。
 * 先后按河里每张记的"全桌第几张"（n）判断，有人鸣牌打乱轮次也不会算错
 */
export function safeSetOf(v: RcView, o: number): Set<number> {
  const s = v.seats[o]!;
  const out = new Set<number>(s.river.map((r) => kindOf(r.tile)));
  if (!s.riichi || s.riichiAt < 0) return out;
  const at = s.river[s.riichiAt]!.n;
  for (const x of v.seats) for (const r of x.river) if (r.n > at) out.add(kindOf(r.tile));
  return out;
}

/** 数牌按位置的基础危险（0–1000）：中张最危险，幺九最安全 */
const RANK_DANGER = [0, 300, 380, 480, 560, 560, 560, 480, 380, 300];

/**
 * 打出 k 对 o 有多危险（0–1000，0 是肯定不放铳）。mine 是我自己手里的张数（看得见的一部分）。
 * 读牌的准头（reads，0–1000）决定筋、壁这些推断信几成：新手只认现物和字牌
 */
export function dangerOf(c: DangerCtx, reads: number, o: number, k: number, mine: readonly number[]): number {
  if (c.safe[o]!.has(k)) return 0;
  const seen = (x: number): number => c.visible[x]! + mine[x]!;
  /** 把一个"打折"系数按读牌的准头打折扣（f 是千分比，1000 = 不打折） */
  const trust = (f: number): number => 1_000 - ((1_000 - f) * reads) / 1_000;
  if (k >= HONOR0) {
    const n = seen(k);
    if (n >= 4) return 0;
    let d = [420, 330, 200, 80][n]!;
    const w = c.v.seats[o]!.wind;
    // 他的役牌（三元、场风、他的自风）比客风危险
    if (k >= 31 || k === 27 + c.v.wind || k === 27 + w) d = (d * 125) / 100;
    else d = (d * 80) / 100;
    return Math.round(d);
  }
  if (seen(k) >= 4) return 0;
  const r = rankOf(k);
  let d = RANK_DANGER[r]!;
  const river = new Set(c.v.seats[o]!.river.map((x) => kindOf(x.tile)));
  // 筋：他打过的牌差 3 的另一头，两面听不了
  const lower = r >= 4 && river.has(k - 3);
  const upper = r <= 6 && river.has(k + 3);
  if (r >= 4 && r <= 6) d = lower && upper ? (d * trust(400)) / 1_000 : lower || upper ? (d * trust(800)) / 1_000 : d;
  else if ((r <= 3 && upper) || (r >= 7 && lower)) d = (d * trust(450)) / 1_000;
  // 壁：旁边的牌四张都看见了，能凑出这张的顺子少一路
  const realUp = r <= 7 && (seen(k + 1) >= 4 || seen(k + 2) >= 4);
  const realDown = r >= 3 && (seen(k - 1) >= 4 || seen(k - 2) >= 4);
  if (realUp || realDown) {
    const upOk = realUp || r >= 8;
    const downOk = realDown || r <= 2;
    d = upOk && downOk ? (d * trust(400)) / 1_000 : (d * trust(850)) / 1_000;
  }
  // 宝牌放铳更痛
  if (c.doraHits[k]! > 0) d = (d * 125) / 100;
  return Math.round(d);
}

// ---------- 给真人的安全牌提示 ----------

/** 较安全的线：危险度不超过这个数（筋、壁、字牌见得多的这一档；读牌按全准算，提示是帮人看，不是模仿某个电脑的水平） */
const SAFE_LINE = 230;

export type Safety = 'safe' | 'fair';

/**
 * 我出牌时手里每种牌的安全档：safe = 对每个立直的人都是现物；fair = 对每个立直的人危险度都不超过 SAFE_LINE（筋、壁、字牌见 3 张这类）；
 * 其余没有档（有风险）。别家没人立直、或者我自己已经立直，返回 null（不提示）。只看立直的人，副露显眼的不算
 */
export function safetyOf(v: RcView): Map<number, Safety> | null {
  const me = v.me;
  if (!me || v.seats[me.seat]!.riichi > 0) return null;
  const foes = v.seats.map((s, i) => i !== me.seat && s.riichi > 0);
  if (!foes.some(Boolean)) return null;
  const doraHits = new Array<number>(34).fill(0);
  for (const t of v.dora) doraHits[doraOf(kindOf(t))]!++;
  const c: DangerCtx = { v, visible: visibleCounts(v), doraHits, safe: v.seats.map((_, i) => (foes[i] ? safeSetOf(v, i) : null)) };
  const mine = countsOf(me.hand);
  const out = new Map<number, Safety>();
  for (const t of me.hand) {
    const k = kindOf(t);
    if (out.has(k)) continue;
    let worst = 0;
    foes.forEach((f, o) => {
      if (f) worst = Math.max(worst, dangerOf(c, 1_000, o, k, mine));
    });
    if (worst === 0) out.set(k, 'safe');
    else if (worst <= SAFE_LINE) out.set(k, 'fair');
  }
  return out;
}
