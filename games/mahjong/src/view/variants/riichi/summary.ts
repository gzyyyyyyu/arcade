/**
 * 立直的结算（docs/riichi.md 第 4 节）：一局一张役种表——每个役一行写名字和番数，宝牌、赤宝牌、里宝牌分开写，再写符、番、点数；
 * 每家点数怎么动、本场和供托；流局写谁听牌、中途流局写原因。一场打完再列终局点数、顺位、马、头名奖、得分和筹码。只用公开信息。
 */
import { kindOf, byTile, type Tile } from '../../../core/tiles/index.ts';
import { isRed, RETURN_POINTS, START_POINTS, UMA, YAKU_NAME, SEATS, type HandScore, type RcView, type RcWin } from '../../../core/variants/riichi/index.ts';
import type { ShareCard } from 'arcade-kit/share';
import { rcTier } from '../../../game/bighand.ts';
import { el } from '../../dom.ts';
import { GAME_NAME, num, signed, TITLE_NAME } from '../../text.ts';
import { backUrl, tileName, tileUrl } from '../../tiles.ts';
import { term } from '../../terms.ts';
import { windOf } from './view.ts';
import { ABORT_WHY, END_NAME, LIMIT_NAME, PAY_NAME, RC_WIND, lengthName, roundName, scoreText, yakumanName } from './text.ts';

interface YakuLine {
  name: string;
  /** "1 番"、"役满" */
  han: string;
  /** 宝牌这一类（赤、里宝也算），表里画得淡一点 */
  dora?: true;
}

/** 役种表的行：役在前，宝牌、赤宝牌、里宝牌分开写；役满只列役满的名字 */
export function yakuLines(sc: HandScore): YakuLine[] {
  const out: YakuLine[] = [];
  if (sc.yakuman && !sc.kazoe) {
    for (const y of sc.yaku) out.push({ name: YAKU_NAME[y.id], han: '役满' });
    return out;
  }
  for (const y of sc.yaku) out.push({ name: YAKU_NAME[y.id], han: `${y.han} 番` });
  if (sc.dora) out.push({ name: '宝牌', han: `${sc.dora} 番`, dora: true });
  if (sc.aka) out.push({ name: '赤宝牌', han: `${sc.aka} 番`, dora: true });
  if (sc.ura) out.push({ name: '里宝牌', han: `${sc.ura} 番`, dora: true });
  return out;
}

/** 符、番、封顶的叫法："30 符 4 番"、"满贯"、"役满"、"双倍役满" */
export function scoreHead(sc: HandScore): string {
  if (sc.yakuman && !sc.kazoe) return yakumanName(sc.yakuman);
  if (sc.kazoe) return `${sc.han} 番 · 累计役满`;
  const limit = LIMIT_NAME[sc.limit];
  return limit ? `${sc.han} 番 · ${limit}` : `${sc.fu} 符 ${sc.han} 番`;
}

/** 这一把本身值多少点（不含本场和供托）：从点数流水里加出来，包牌、双响都不用另算 */
export function handValue(ledger: RcView['ledger'], w: RcWin): number {
  return ledger.filter((p) => p.to === w.seat && (p.kind === 'ron' || p.kind === 'tsumo' || p.kind === 'pao')).reduce((a, p) => a + p.amount, 0);
}

/** 一个小牌（结算里的牌面），赤宝牌画红的 */
function mini(t: Tile, parent: HTMLElement, cls = 'mini'): HTMLElement {
  const e = el('span', cls, parent);
  const red = t >= 0 && isRed(t);
  e.style.backgroundImage = `url("${t < 0 ? backUrl() : tileUrl(kindOf(t), red)}")`;
  if (t >= 0) e.title = tileName(kindOf(t), red);
  return e;
}

/** 一手牌：副露在前，手牌排好，胡的那张单放最后描金 */
function handLine(hand: readonly Tile[], melds: RcWin['melds'], won: Tile | null, parent: HTMLElement): void {
  const line = el('div', 'hand-line', parent);
  for (const m of melds) {
    const g = el('span', 'group', line);
    m.tiles.forEach((t, i) => mini(m.kan === 'concealed' && (i === 0 || i === 3) ? -1 : t, g));
  }
  const rest = hand.slice().sort(byTile);
  if (won !== null && rest.includes(won)) rest.splice(rest.indexOf(won), 1);
  const g = el('span', 'group', line);
  for (const t of rest) mini(t, g);
  if (won !== null) mini(won, line).classList.add('won');
}

/** 一排指示牌：宝牌指示牌、里宝指示牌 */
function indicators(label: string, tiles: readonly Tile[], parent: HTMLElement, notes: HTMLElement): void {
  const row = el('span', 'rc-ind', parent);
  term(el('span', 'rc-ind-label', row), label, notes);
  const g = el('span', 'group', row);
  for (const t of tiles) mini(t, g);
}

export function roundSummary(v: RcView, names: string[]): HTMLElement {
  const box = el('div', 'summary rc-summary');
  const h = v.history.at(-1);
  if (!h) return box;
  // 明细（胡了谁、手牌、役种）和各家点数分两块：电脑横屏左右两栏一页放下（riichi.css），竖屏照样上下排
  const main = el('div', 'rc-main', box);
  const head = el('h2', '', main);
  head.append(`${roundName(h.wind, h.hand)} · ${END_NAME[h.end]}`);
  const notes = el('div', 'term-notes', main);
  if (h.honba) {
    const small = el('small', '', head, ` ${h.honba} `);
    term(small, '本场', notes);
  }
  const why = ABORT_WHY[h.end];
  if (why) el('p', 'fair', main, why);
  // 电脑不看牌对玩家是看不见的（DESIGN.md 5.4），胡了、听牌的人把牌亮出来，自己对得上
  // 这句每局都一样：一场的第一局讲一次就够
  if ((h.wins.length || h.tenpai) && v.history.length <= 1) el('p', 'fair', main, '胡了、听牌的人亮出手牌。电脑和你一样，看不到别人手里的牌和牌墙。');
  if (h.dora.length || h.ura.length) {
    const line = el('div', 'rc-inds', main);
    indicators('宝牌指示', h.dora, line, notes);
    if (h.ura.length) indicators('里宝指示', h.ura, line, notes);
  }
  for (const w of h.wins) winBlock(v, w, names, main);
  const side = el('div', 'rc-side', box);
  const rows = el('div', 'rows', side);
  for (let seat = 0; seat < SEATS; seat++) {
    const row = el('div', `row${seat === v.me?.seat ? ' me' : ''}`, rows);
    row.dataset.seat = `${seat}`;
    el('span', 'who', row, `${RC_WIND[windOf(h.dealer, seat)]}家 ${names[seat]}`);
    const what = el('span', 'what', row);
    const win = h.wins.find((x) => x.seat === seat);
    if (win) what.textContent = win.from === null ? '自摸' : '胡';
    else if (h.wins.some((x) => x.from === seat)) what.textContent = '点炮';
    else if (h.tenpai) what.textContent = h.tenpai[seat] ? '听牌' : '没听牌';
    else what.textContent = '—';
    const d = h.delta[seat]!;
    const net = el('span', `net ${d > 0 ? 'up' : d < 0 ? 'down' : ''}`, row, signed(d));
    // 结算的动画（fx.ts 的 settleFx）从 0 数到这个数
    net.dataset.n = `${d}`;
    el('span', 'rc-pts', row, `${num(v.seats[seat]!.points)} 点`);
    if (h.tenpai?.[seat]) {
      const s = v.seats[seat]!;
      if (s.hand) handLine(s.hand, s.melds, null, row);
    }
  }
  // 点数从谁那儿飞到谁那儿（settleFx 用）：只要方向，桌上的供托不算
  box.dataset.moves = JSON.stringify([...new Set(v.ledger.filter((p) => p.from >= 0 && p.to >= 0).map((p) => `${p.from}>${p.to}`))]);
  // 点数怎么动的：本场、供托、不听罚符这些另写一行，免得和役种表里的点数对不上
  const flows = new Map<string, number>();
  for (const p of v.ledger) {
    if (p.kind === 'ron' || p.kind === 'tsumo') continue;
    const key = `${p.kind}|${p.from}|${p.to}`;
    flows.set(key, (flows.get(key) ?? 0) + p.amount);
  }
  if (flows.size) {
    const list = el('div', 'flows', side);
    for (const [key, amount] of flows) {
      const [kind, from, to] = key.split('|') as [string, string, string];
      const f = Number(from);
      const t = Number(to);
      const flow = el('div', 'flow', list);
      term(flow, PAY_NAME[kind] ?? kind);
      flow.append(`：${f < 0 ? '桌上' : names[f]} → ${t < 0 ? '桌上' : names[t]} ${num(amount)} 点`);
    }
  }
  if (v.sticks && !v.final) el('div', 'rc-sticks', side, `桌上还有 ${v.sticks} 根立直棒，留给下一个胡牌的人`);
  return box;
}

/** 一次胡牌：谁、怎么胡的、亮出的整手、役种表、符番点数 */
function winBlock(v: RcView, w: RcWin, names: string[], parent: HTMLElement): void {
  const sc = w.score;
  const win = el('div', 'rc-win', parent);
  // 结算动画（settle-fx.ts）按这两个标记认大牌、认自己
  win.dataset.tier = `${rcTier(sc.limit)}`;
  if (w.seat === v.me?.seat) win.dataset.mine = '1';
  const who = el('div', 'rc-who', win);
  el('b', '', who, names[w.seat]);
  who.append(w.from === null ? ' 自摸' : ` 胡（${names[w.from]} 点炮）`);
  if (w.pao !== null) el('small', '', who, ` · ${names[w.pao]} 包牌`);
  handLine(w.hand, w.melds, w.tile, win);
  const table = el('div', 'rc-yaku', win);
  for (const l of yakuLines(sc)) {
    const r = el('div', `rc-yaku-row${l.dora ? ' dora' : ''}`, table);
    el('span', 'n', r, l.name);
    el('span', 'f', r, l.han);
  }
  const total = el('div', 'rc-total', win);
  const head = el('span', 'rc-head', total);
  const limit = !sc.yakuman && !sc.kazoe ? LIMIT_NAME[sc.limit] : '';
  const notes = el('div', 'term-notes', win);
  if (limit) {
    head.append(`${sc.han} 番 · `);
    term(head, limit, notes);
  } else head.textContent = scoreHead(sc);
  const value = handValue(v.ledger, w);
  const val = el('span', 'rc-value', total, `${num(value)} 点`);
  val.dataset.n = `${value}`;
  val.dataset.suffix = ' 点';
}

/** 一场的名次表：终局点数、顺位、马、头名奖、得分、筹码 */
export function matchSummary(v: RcView, names: string[], unit: string): HTMLElement {
  const box = el('div', 'summary final rc-summary');
  // 一局一结不说「这一场」，局、场不混着用（和川麻一样）
  el('h2', '', box, v.opts.length === 'ikkyoku' ? '这一局的名次' : `这一场打完了 · ${lengthName(v.opts.length)}`);
  const f = v.final;
  const r = v.result;
  if (!f || !r) return box;
  if (v.opts.length === 'ikkyoku') el('p', 'fair', box, '一局一结，只算点数差');
  const rows = el('div', 'rows', box);
  const oka = (RETURN_POINTS - START_POINTS) * SEATS;
  // 一局一结只按点数差算分（core 的 standings），不列马和头名奖，免得以为算进去了
  const plain = v.opts.length === 'ikkyoku';
  f.rank.forEach((seat, i) => {
    const x = r.seats[seat]!;
    const row = el('div', `row${seat === v.me?.seat ? ' me' : ''}`, rows);
    el('span', 'rank', row, `${i + 1}`);
    el('span', 'who', row, names[seat]!);
    const parts = [`终局 ${num(v.seats[seat]!.points)} 点`];
    if (!plain) parts.push(`马 ${scoreText(UMA[i]! * 1000)}`);
    if (i === 0 && !plain) parts.push(`头名奖 ${scoreText(oka)}`);
    el('span', 'what', row, parts.join(' · '));
    el('span', 'rc-score', row, `得分 ${scoreText(f.score[seat]!)}`);
    el('span', `net ${x.net > 0 ? 'up' : x.net < 0 ? 'down' : ''}`, row, `${signed(x.net)}${unit}`);
    const titles = el('div', 'titles', row);
    for (const t of x.stats.titles ?? []) el('span', 'title', titles, TITLE_NAME[t] ?? t);
  });
  return box;
}

/** 自己这一场的战绩图（分享用）：只放公开的、自己的数 */
export function cardOf(v: RcView, title: string, unit: string, name: string): ShareCard | null {
  const me = v.me?.seat;
  const r = me === undefined ? undefined : v.result?.seats[me];
  if (me === undefined || !r || !v.final) return null;
  const st = v.seats[me]!.stats;
  const titles = r.stats.titles ?? [];
  const badge = titles[0] === undefined ? undefined : TITLE_NAME[titles[0]];
  return {
    game: GAME_NAME,
    title,
    accent: '#0f5a41',
    big: { value: signed(r.net), label: unit },
    stats: [
      { label: '顺位', value: `第 ${v.final.rank.indexOf(me) + 1} 名` },
      { label: '得分', value: scoreText(v.final.score[me]!) },
      { label: '胡了', value: `${st.wins} 局` },
    ],
    ...(badge ? { line: `这一场拿到「${badge}」` } : {}),
    player: { name, ...(badge ? { badge } : {}) },
  };
}

/**
 * 结算页头一行底下那句（一场打完）：赢了说胡了几次、最大的一手；输了说点数主要丢在哪种上（点炮、别人自摸、流局没听），用大白话。
 * 只看这一场公开的每局小结（v.history）
 */
export function verdictWhy(v: RcView, seat: number, names: string[]): string | null {
  const total = v.history.reduce((a, h) => a + (h.delta[seat] ?? 0), 0);
  const mine = v.history.flatMap((h) => h.wins.filter((w) => w.seat === seat));
  if (total > 0 && mine.length) {
    const best = mine.reduce((a, w) => (w.gain > a.gain ? w : a));
    const yaku = yakuLines(best.score).filter((y) => !y.dora).map((y) => y.name);
    return `胡了 ${mine.length} 次，最大一手：${yaku.length ? `${yaku.join('、')}，` : ''}${scoreHead(best.score)}`;
  }
  if (total >= 0) return null;
  // 每局丢的点按这一局为什么丢归一类，挑丢得最多的那类说
  const lost = { dealIn: { pts: 0, n: 0, to: new Set<number>() }, tsumo: { pts: 0, n: 0, to: new Set<number>() }, noten: { pts: 0, n: 0, to: new Set<number>() } };
  for (const h of v.history) {
    const d = h.delta[seat] ?? 0;
    if (d >= 0) continue;
    const hit = h.wins.filter((w) => w.from === seat);
    const tsumo = h.wins.filter((w) => w.from === null && w.seat !== seat);
    const k = hit.length ? 'dealIn' : tsumo.length ? 'tsumo' : h.tenpai && !h.tenpai[seat] ? 'noten' : null;
    if (!k) continue;
    lost[k].pts -= d;
    lost[k].n++;
    for (const w of hit.length ? hit : tsumo) lost[k].to.add(w.seat);
  }
  const [k, x] = (Object.entries(lost) as [keyof typeof lost, (typeof lost)['dealIn']][]).sort((a, b) => b[1].pts - a[1].pts)[0]!;
  if (!x.pts) return null;
  const who = [...x.to].map((s) => names[s]).join('、');
  if (k === 'dealIn') return `点炮 ${x.n} 次（给 ${who}），共丢 ${num(x.pts)} 点。别人立直以后，打他河里有的牌最安全`;
  if (k === 'tsumo') return `${who} 自摸了 ${x.n} 次，没点炮也要付，共丢 ${num(x.pts)} 点`;
  return `牌摸完时没听牌 ${x.n} 次，要赔给听了牌的人，共丢 ${num(x.pts)} 点`;
}
