/**
 * 结算（DESIGN.md 第 6 节）：一局打完列每家胡了什么番、钱怎么走的（点炮、自摸、杠钱、呼叫转移、退税、查花猪、查大叫）；
 * 一场打完再列总输赢和称号。只用公开信息。
 */
import { kindOf } from '../../../core/tiles/index.ts';
import type { XzView } from '../../../core/variants/sichuan-xuezhan/index.ts';
import { xzTier } from '../../../game/bighand.ts';
import { el } from '../../dom.ts';
import { backUrl, tileName, tileUrl } from '../../tiles.ts';
import { term } from '../../terms.ts';
import { FAN_NAME, PAY_KIND, signed, TITLE_NAME } from '../../text.ts';

export function roundSummary(v: XzView, names: string[], unit: string): HTMLElement {
  const box = el('div', 'summary');
  const h = v.history.at(-1);
  if (!h) return box;
  // 一场只打一局（快速一局、实盘一局一结）不写"第 1 局"
  el('h2', '', box, `${v.opts.rounds === 1 ? '这一局' : `第 ${h.round + 1} 局`}${h.end === 'wall' ? '：牌摸完了' : ''}`);
  // 电脑不看牌对玩家是看不见的（DESIGN.md 5.4），一局打完把所有人的牌摆出来，自己对得上
  // 这句每局都一样：一场的第一局讲一次就够
  if (v.history.length <= 1) el('p', 'fair', box, '一局打完所有人的牌都亮在这里。电脑和你一样，看不到别人手里的牌和牌墙。');
  const rows = el('div', 'rows', box);
  for (let seat = 0; seat < v.seats.length; seat++) {
    const row = el('div', `row${seat === v.me?.seat ? ' me' : ''}`, rows);
    row.dataset.seat = `${seat}`;
    el('span', 'who', row, names[seat]!);
    // 血流成河一家可以胡好几次：每次一条，第 n 次、番型、自摸还是点炮都写清；第一条带结算动画，后面的直接摆出来
    const mine = h.wins.filter((x) => x.seat === seat);
    const what = el('span', 'what', row);
    mine.forEach((w, i) => {
      const items = w.items.filter((x) => x.id !== 'ping' || w.items.length === 1);
      const how = `${w.from === null ? '自摸' : `胡（${names[w.from]} 点炮）`} `;
      const nth = mine.length > 1 ? `第 ${i + 1} 次 · ` : '';
      if (i === 0) {
        // 拆成一段段 span 是给结算动画（settle-fx.ts）用的：番型一条条亮起，最后滚总番数；拼起来的文字和原来一样
        // "胡（谁 点炮）"是一个整体，窄屏只许整段换行，不在括号里断
        el('span', 'how', what, nth + how);
        items.forEach((x, k) => el('span', 'fx-it', what, `${k ? ' · ' : ''}${FAN_NAME[x.id] + (x.n && x.n > 1 ? `×${x.n}` : '')}`));
        // 平胡不写“0 番”
        if (w.fan > 0) {
          // 不换行空格：最后一个番型和总番数连着，不让"1 番"孤零零掉到下一行
          what.append('\u00a0');
          const total = el('span', 'fx-total', what, `${w.fan}\u00a0番`);
          total.dataset.n = `${w.fan}`;
          total.dataset.suffix = '\u00a0番';
        }
      } else {
        const line = el('span', 'win-extra', what);
        line.append(`${nth}${how}${items.map((x) => FAN_NAME[x.id] + (x.n && x.n > 1 ? `×${x.n}` : '')).join(' · ')}${w.fan > 0 ? `\u00a0${w.fan}\u00a0番` : ''}`);
      }
    });
    if (mine.length) {
      const top = mine.reduce((m, x) => (x.fan > m.fan ? x : m));
      row.dataset.tier = `${xzTier(top.fan, top.fan >= v.opts.cap)}`;
      if (seat === v.me?.seat) row.dataset.mine = '1';
    }
    // 点炮给谁：输给谁一眼看得出来（血战里点过炮的人后面也可能胡）
    const fed = h.wins.filter((x) => x.from === seat).map((x) => names[x.seat]!);
    // 没胡又没点炮才写"—"；点了炮就只写"点炮给…"，不留孤零零的破折号和分隔点
    if (!mine.length && !fed.length && h.end !== 'wall') what.textContent = '—';
    else if (!mine.length && h.end === 'wall') what.textContent = '没胡';
    if (fed.length) what.append(`${what.textContent ? ' · ' : ''}点炮给 ${fed.join('、')}`);
    const n = h.net[seat]!;
    const net = el('span', `net ${n > 0 ? 'up' : n < 0 ? 'down' : ''}`, row, `${signed(n)}${unit}`);
    // 结算的动画（fx.ts 的 settleFx）从 0 数到这个数
    net.dataset.n = `${n}`;
    net.dataset.unit = unit;
    handLine(v, seat, row);
  }
  // 钱的流水：按种类合起来，一行一种
  const flows = new Map<string, number>();
  for (const p of v.ledger) {
    const key = `${p.kind}|${p.from}|${p.to}`;
    flows.set(key, (flows.get(key) ?? 0) + p.amount);
  }
  // 钱从谁那儿飞到谁那儿（settleFx 用）：只要方向，不分种类
  box.dataset.moves = JSON.stringify([...new Set([...flows.keys()].map((k) => k.split('|').slice(1).join('>')))]);
  if (flows.size) {
    const list = el('div', 'flows', box);
    for (const [key, amount] of flows) {
      const [kind, from, to] = key.split('|') as [string, string, string];
      const flow = el('div', 'flow', list);
      term(flow, PAY_KIND[kind] ?? kind);
      flow.append(`：${names[Number(from)]} → ${names[Number(to)]} ${amount}${unit.replace(' ', '\u00a0')}`);
    }
  }
  return box;
}

/**
 * 结算页头一行底下那句（一局定输赢时）：赢了说胡了什么，输了说钱主要输在哪种上，用大白话，不写术语表里才有的词。
 * 只看这一局公开的流水（v.ledger）和胡牌记录
 */
export function verdictWhy(v: XzView, seat: number, names: string[]): string | null {
  const h = v.history.at(-1);
  if (!h) return null;
  const net = h.net[seat] ?? 0;
  const mine = h.wins.filter((w) => w.seat === seat);
  if (net > 0 && mine.length) {
    const w = mine.reduce((a, x) => (x.fan > a.fan ? x : a));
    const items = w.items.filter((x) => x.id !== 'ping' || w.items.length === 1).map((x) => FAN_NAME[x.id]);
    return `${w.from === null ? '自摸' : '胡了'}${items.length ? `：${items.join('、')}` : ''}${w.fan > 0 ? `，${w.fan} 番` : ''}`;
  }
  if (net >= 0) return null;
  // 输的钱按种类合计，挑最多的那种说
  const out = new Map<string, { amount: number; to: Set<number> }>();
  for (const p of v.ledger) {
    if (p.from !== seat) continue;
    const x = out.get(p.kind) ?? { amount: 0, to: new Set<number>() };
    x.amount += p.amount;
    x.to.add(p.to);
    out.set(p.kind, x);
  }
  const top = [...out.entries()].sort((a, b) => b[1].amount - a[1].amount)[0];
  if (!top) return null;
  const who = [...top[1].to].map((s) => names[s]).join('、');
  const say: Record<string, string> = {
    hu: `你打的牌正好是 ${who} 要的，被胡了（点炮）。别人碰过牌、快胡的时候，少打桌上还没人打过的牌`,
    zimo: `${who} 自摸了，没胡的每家都要付`,
    kan: `${who} 杠了牌，杠钱没胡的人都要付`,
    pig: '牌摸完时手里还留着缺的那门（花猪），要赔给别家',
    cha: '牌摸完时还没听牌，要赔给听了牌的人',
    move: '你杠了以后打的牌被人胡了，杠钱转给了他（呼叫转移）',
    tax: '牌摸完时没听牌，杠来的钱要退回去（退税）',
  };
  return say[top[0]] ?? null;
}

/** 这一家最后的牌：碰杠在前，手牌按牌面排好，胡的那张单放在最后描金。视图在一局结束时本来就亮出所有人的手牌 */
function handLine(v: XzView, seat: number, row: HTMLElement): void {
  const s = v.seats[seat]!;
  if (!s.hand) return;
  const line = el('div', 'hand-line', row);
  const tile = (t: number, parent: HTMLElement): HTMLElement => {
    const e = el('span', 'mini', parent);
    e.style.backgroundImage = `url("${t < 0 ? backUrl() : tileUrl(kindOf(t))}")`;
    if (t >= 0) e.title = tileName(kindOf(t));
    return e;
  };
  for (const m of s.melds) {
    const g = el('span', 'group', line);
    for (const t of m.tiles) tile(t, g);
  }
  const hand = s.hand.slice().sort((a, b) => kindOf(a) - kindOf(b) || a - b);
  const won = s.won?.tile;
  if (won !== undefined && hand.includes(won)) hand.splice(hand.indexOf(won), 1);
  const g = el('span', 'group', line);
  for (const t of hand) tile(t, g);
  if (won !== undefined) {
    const w = tile(won, line);
    w.classList.add('won');
    w.title = `${tileName(kindOf(won))}：${s.won!.from === null ? '自摸' : '胡的这张'}`;
  }
}

export function matchSummary(v: XzView, names: string[], unit: string): HTMLElement {
  const box = el('div', 'summary final');
  el('h2', '', box, '这一场打完了');
  const r = v.result;
  if (!r) return box;
  const order = v.seats.map((_, i) => i).sort((a, b) => r.seats[b]!.net - r.seats[a]!.net);
  const rows = el('div', 'rows', box);
  order.forEach((seat, i) => {
    const x = r.seats[seat]!;
    const row = el('div', `row${seat === v.me?.seat ? ' me' : ''}`, rows);
    el('span', 'rank', row, `${i + 1}`);
    el('span', 'who', row, names[seat]!);
    const st = v.seats[seat]!.stats;
    el('span', 'what', row, `胡 ${st.wins} · 自摸 ${st.zimo} · 点炮 ${st.pao} · 杠 ${st.gangs}`);
    el('span', `net ${x.net > 0 ? 'up' : x.net < 0 ? 'down' : ''}`, row, `${signed(x.net)}${unit}`);
    const titles = el('div', 'titles', row);
    for (const t of x.stats.titles ?? []) el('span', 'title', titles, TITLE_NAME[t] ?? t);
  });
  return box;
}
