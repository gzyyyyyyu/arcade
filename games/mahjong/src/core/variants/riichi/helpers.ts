/**
 * 牌局的小工具：座风、宝牌指示、听牌和振听判断、点数收付、翻宝牌、和牌时机（给 score.ts）。
 * 被摸牌、声明、结算、动作几个文件共用，只依赖 state.ts。
 */
import type { Payment } from '../../match/index.ts';
import { distance, wallLeft } from '../../table/index.ts';
import { countsOf, HONOR0, kindOf, rankOf, type Tile } from '../../tiles/index.ts';
import { doraOf, waitsOf, type WinContext } from './score.ts';
import { SEATS, URA0, type RcEnd, type RcPlayer, type SeatStats, type RcState, TABLE } from './state.ts';

// ---------- 小工具 ----------

/** 中途流局：最后一局遇到也不算"庄家第一就停" */
export const ABORTS: ReadonlySet<RcEnd> = new Set(['nine_terminals', 'four_winds', 'four_kans', 'four_riichi', 'three_ron']);
export const isYaochu = (k: number): boolean => k >= HONOR0 || rankOf(k) === 1 || rankOf(k) === 9;
export const countKind = (tiles: readonly Tile[], k: number): number => tiles.reduce((a, t) => a + (kindOf(t) === k ? 1 : 0), 0);
export const isClosed = (p: RcPlayer): boolean => p.melds.every((m) => m.kan === 'concealed');
export const seatWind = (s: RcState, seat: number): number => distance(s.dealer, seat, SEATS);

export const doraIndicators = (s: RcState): Tile[] => s.dead.slice(0, s.doraOpen);
export const uraIndicators = (s: RcState): Tile[] => s.dead.slice(URA0, URA0 + s.doraOpen);

/** 听哪些牌（13 张时）。自己手里加副露已经四张的那种不算：摸不到也没人打得出来（天凤的"纯空听"不算听牌） */
export function tenpaiKinds(p: RcPlayer): number[] {
  const own = countsOf([...p.hand, ...p.melds.flatMap((m) => m.tiles)]);
  return waitsOf(countsOf(p.hand), p.melds.length).filter((k) => own[k]! < 4);
}

/** 舍张振听、同巡振听、立直后振听 */
export function furiten(p: RcPlayer): 'river' | 'passed' | 'riichi' | null {
  if (p.locked) return 'riichi';
  const waits = waitsOf(countsOf(p.hand), p.melds.length);
  if (p.river.some((r) => waits.includes(kindOf(r.tile)))) return 'river';
  return p.passed ? 'passed' : null;
}

export function emptyStats(): SeatStats {
  return { rounds: 0, wins: 0, tsumo: 0, dealIn: 0, riichi: 0, maxHan: 0, yakuman: 0, best: 0 };
}

export function emptyPlayer(): RcPlayer {
  return { hand: [], melds: [], river: [], riichi: 0, riichiAt: -1, ippatsu: false, passed: false, locked: false, banned: [], draws: 0 };
}

/** 点数可以付成负数（飞了），所以不用 match 的 payMany（它按付得起的付） */
export function move(s: RcState, pays: Payment[], from: number, to: number, amount: number, kind: string): void {
  if (amount <= 0) return;
  if (from !== TABLE) s.points[from]! -= amount;
  if (to !== TABLE) s.points[to]! += amount;
  pays.push({ kind, from, to, amount });
}

export function flush(s: RcState, pays: Payment[]): void {
  if (!pays.length) return;
  s.ledger.push(...pays);
  s.events.push({ e: 'pay', pays });
}

export function revealDora(s: RcState): void {
  s.doraOpen++;
  s.events.push({ e: 'dora', indicator: s.dead[s.doraOpen - 1]! });
}

export function flushDora(s: RcState): void {
  while (s.pendingDora > 0) {
    s.pendingDora--;
    revealDora(s);
  }
}

export function clearIppatsu(s: RcState): void {
  for (const p of s.players) p.ippatsu = false;
}

/** 和牌的时机（给 score.ts） */
export function winContext(s: RcState, seat: number, tile: Tile, tsumo: boolean, rob: boolean): WinContext {
  const p = s.players[seat]!;
  const first = p.draws === 1 && p.river.length === 0 && s.noCalls;
  const last = wallLeft(s.wall) === 0;
  return {
    win: tile,
    tsumo,
    seatWind: seatWind(s, seat),
    roundWind: s.wind,
    riichi: p.riichi,
    ippatsu: p.ippatsu,
    rinshan: tsumo && s.rinshan,
    chankan: rob,
    haitei: tsumo && !s.rinshan && last,
    houtei: !tsumo && !rob && last,
    tenhou: tsumo && first && seat === s.dealer,
    chiihou: tsumo && first && seat !== s.dealer,
    dora: doraIndicators(s).map((t) => doraOf(kindOf(t))),
    ura: p.riichi ? uraIndicators(s).map((t) => doraOf(kindOf(t))) : [],
  };
}
