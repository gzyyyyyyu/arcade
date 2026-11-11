/**
 * 声明窗口与杠：荣和资格、食替、吃的选项、开窗口、同巡振听、一轮回答的裁决（和 > 碰 / 杠 > 吃）、记杠与加杠后的翻宝牌。
 */
import type { Payment } from '../../match/index.ts';
import { resolveClaims, wallLeft, type ClaimKind } from '../../table/index.ts';
import { byTile, countsOf, HONOR0, kindOf, rankOf, suitOf, type Tile } from '../../tiles/index.ts';
import { isAgari, isKokushi, scoreWin } from './score.ts';
import { SEATS, type Claim, type RcState, TABLE } from './state.ts';
import { countKind, furiten, move, flush, revealDora, flushDora, clearIppatsu, winContext } from './helpers.ts';
import { drawFor, advance } from './deal.ts';
import { recordWin, abort, endRound } from './settle.ts';

/** 这张牌能不能荣和：成形、有役、不振听；暗杠只有国士能抢 */
function canRon(s: RcState, seat: number, tile: Tile, rob: Claim['rob']): boolean {
  const p = s.players[seat]!;
  const hand = [...p.hand, tile];
  const c = countsOf(hand);
  if (!isAgari(c, p.melds.length)) return false;
  if (rob === 'concealed' && !isKokushi(c)) return false;
  if (furiten(p)) return false;
  return scoreWin(hand, p.melds, winContext(s, seat, tile, false, rob !== null)) !== null;
}

/** 吃、碰以后不能打的牌种（食替）：吃的那张本身，以及吃两头时另一头 */
export function kuikae(called: number, low: number | null): number[] {
  if (low === null) return [called];
  const out = [called];
  if (called === low && rankOf(low) <= 6) out.push(low + 3);
  if (called === low + 2 && rankOf(low) >= 2) out.push(low - 1);
  return out;
}

/** 吃碰以后手里得留着能打的牌（全是不能打的就不许鸣） */
function callable(hand: readonly Tile[], used: readonly number[], banned: readonly number[]): boolean {
  const rest = hand.map(kindOf);
  for (const k of used) rest.splice(rest.indexOf(k), 1);
  return rest.some((k) => !banned.includes(k));
}

/** 能吃的几种：返回顺子最小那张的牌种 */
export function chiOptions(hand: readonly Tile[], tile: Tile): number[] {
  const k = kindOf(tile);
  if (k >= HONOR0) return [];
  const have = countsOf(hand);
  const out: number[] = [];
  for (const low of [k - 2, k - 1, k]) {
    if (low < 0 || suitOf(low) !== suitOf(k) || rankOf(low) > 7) continue;
    const need = [low, low + 1, low + 2].filter((x) => x !== k);
    if (need.some((x) => have[x]! < 1)) continue;
    if (callable(hand, need, kuikae(k, low))) out.push(low);
  }
  return out;
}

/** 别人打出（或开杠）一张以后谁能做什么；没人有选择就不开窗口（同巡振听照记），返回开没开 */
export function openClaim(s: RcState, tile: Tile, from: number, rob: Claim['rob']): boolean {
  const k = kindOf(tile);
  const opts: ClaimKind[][] = s.players.map(() => []);
  const chi: number[][] = s.players.map(() => []);
  const could = s.players.map(() => false);
  const calls = rob === null && wallLeft(s.wall) > 0;
  let any = false;
  for (let i = 0; i < SEATS; i++) {
    if (i === from) continue;
    const p = s.players[i]!;
    const c = countsOf([...p.hand, tile]);
    could[i] = rob === 'concealed' ? isKokushi(c) : isAgari(c, p.melds.length);
    const o = opts[i]!;
    if (could[i] && canRon(s, i, tile, rob)) o.push('ron');
    if (calls && !p.riichi) {
      const n = countKind(p.hand, k);
      if (n >= 3 && s.kans < 4) o.push('kan');
      if (n >= 2 && callable(p.hand, [k, k], kuikae(k, null))) o.push('pon');
      if (i === (from + 1) % SEATS) {
        chi[i] = chiOptions(p.hand, tile);
        if (chi[i]!.length) o.push('chi');
      }
    }
    if (o.length) any = true;
  }
  const claim: Claim = { id: ++s.claimSeq, tile, from, rob, opts, chi, could, ans: s.players.map(() => null), low: s.players.map(() => null), bot: s.players.map(() => false) };
  if (!any) {
    markPassed(s, claim);
    return false;
  }
  s.claim = claim;
  s.phase = 'claim';
  return true;
}

/** 能和没和的人进同巡振听；立直的人这一局一直振听 */
function markPassed(s: RcState, c: Claim): void {
  c.could.forEach((x, i) => {
    if (!x || c.ans[i] === 'ron') return;
    const p = s.players[i]!;
    p.passed = true;
    if (p.riichi) p.locked = true;
  });
}

/**
 * 打出的牌没被荣和：立直成立（放棒、一发开始），再看中途流局（四家立直、四风连打、四杠散了）。返回这一局是不是因此结束了
 */
export function passDiscard(s: RcState): boolean {
  const r = s.pendingRiichi;
  if (r !== null) {
    s.pendingRiichi = null;
    const p = s.players[r]!;
    const double = p.river.length === 1 && s.noCalls;
    p.riichi = double ? 2 : 1;
    p.ippatsu = true;
    s.stats[r]!.riichi++;
    const pays: Payment[] = [];
    move(s, pays, r, TABLE, 1000, 'stick');
    s.sticks++;
    s.events.push({ e: 'riichi', seat: r, double });
    flush(s, pays);
    if (s.players.every((x) => x.riichi)) {
      abort(s, 'four_riichi');
      return true;
    }
  }
  if (s.noCalls && s.discards === SEATS) {
    const k = kindOf(s.players[s.dealer]!.river[0]!.tile);
    if (k >= HONOR0 && k < HONOR0 + 4 && s.players.every((p) => p.river.length === 1 && kindOf(p.river[0]!.tile) === k)) {
      abort(s, 'four_winds');
      return true;
    }
  }
  if (s.kans === 4 && new Set(s.kanBy).size > 1) {
    abort(s, 'four_kans');
    return true;
  }
  return false;
}

/** 有选择的人都答完了（或者到点了） */
export function resolve(s: RcState): void {
  const c = s.claim!;
  s.claim = null;
  const ans = c.ans.map((a, i) => (c.opts[i]!.length ? (a ?? 'pass') : null));
  markPassed(s, c);
  const thrower = s.players[c.from]!;
  const r = resolveClaims(ans, c.from, true);
  if (r && 'ron' in r) {
    if (r.ron.length === 3) return abort(s, 'three_ron');
    // 立直宣告牌被荣和：立直不成立，不放棒
    s.pendingRiichi = null;
    if (c.rob === 'added') thrower.hand.splice(thrower.hand.indexOf(c.tile), 1);
    else if (c.rob === null) thrower.river[thrower.river.length - 1]!.taken = true;
    const wins = r.ron.map((seat, i) => recordWin(s, seat, c.tile, c.from, c.rob !== null, i === 0));
    return endRound(s, 'ron', r.ron.includes(s.dealer), wins);
  }
  if (c.rob === 'added') return finishAddedKan(s, c.from, c.tile);
  if (c.rob === 'concealed') return drawFor(s, c.from, true);
  if (passDiscard(s)) return;
  if (!r) return advance(s, c.from);
  const p = s.players[r.seat]!;
  const k = kindOf(c.tile);
  thrower.river[thrower.river.length - 1]!.taken = true;
  clearIppatsu(s);
  s.noCalls = false;
  s.turn = r.seat;
  p.passed = false;
  if (r.kind === 'kan') {
    const mine = p.hand.filter((t) => kindOf(t) === k);
    p.hand = p.hand.filter((t) => kindOf(t) !== k);
    p.melds.push({ kind: 'kan', tiles: [...mine, c.tile].sort(byTile), from: c.from, kan: 'direct' });
    s.events.push({ e: 'kan', seat: r.seat, from: c.from, tile: c.tile, kan: 'direct' });
    addKan(s, r.seat, false);
    return drawFor(s, r.seat, true);
  }
  let used: number[];
  let low: number | null = null;
  if (r.kind === 'chi') {
    low = c.low[r.seat] ?? c.chi[r.seat]![0]!;
    used = [low, low + 1, low + 2].filter((x) => x !== k);
  } else used = [k, k];
  const mine: Tile[] = [];
  for (const x of used) {
    const t = p.hand.find((y) => kindOf(y) === x && !mine.includes(y))!;
    mine.push(t);
  }
  p.hand = p.hand.filter((t) => !mine.includes(t));
  p.melds.push({ kind: r.kind, tiles: r.kind === 'chi' ? [c.tile, ...mine.sort(byTile)] : [...mine, c.tile].sort(byTile), from: c.from });
  p.banned = kuikae(k, low);
  s.drawn = null;
  s.canTsumo = false;
  s.rinshan = false;
  s.phase = 'turn';
  s.events.push({ e: r.kind, seat: r.seat, from: c.from, tile: c.tile });
}

/** 记一杠：先翻掉上一杠还没翻的杠宝；暗杠当场翻，明杠、加杠等打出下一张再翻 */
export function addKan(s: RcState, seat: number, concealed: boolean): void {
  flushDora(s);
  s.kans++;
  s.kanBy.push(seat);
  s.noCalls = false;
  clearIppatsu(s);
  if (concealed) revealDora(s);
  else s.pendingDora++;
}

export function finishAddedKan(s: RcState, seat: number, tile: Tile): void {
  const p = s.players[seat]!;
  const k = kindOf(tile);
  p.hand.splice(p.hand.indexOf(tile), 1);
  const m = p.melds.find((x) => x.kind === 'pon' && kindOf(x.tiles[0]!) === k)!;
  m.kind = 'kan';
  m.kan = 'added';
  m.tiles = [...m.tiles, tile].sort(byTile);
  s.events.push({ e: 'kan', seat, from: m.from, tile, kan: 'added' });
  addKan(s, seat, false);
  drawFor(s, seat, true);
}

/**
 * 和牌收点：荣和由放铳者付，自摸各家付（score.ts 的 payments）。本场（荣和 300、自摸每家 100）和供托只给 bonus 的那一家
 * （双响时离放铳者最近的，天凤的"上家取り"）。
 * 包牌（大三元、大四喜）：那一倍役满自摸时责任者全付，荣和时责任者和放铳者各付一半；同时有别的役满，那部分照常付
 */
