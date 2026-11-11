/** 血流成河（川麻选项 flow）：胡了不下桌，手牌锁住，牌墙摸完才结束（DESIGN.md 2.10） */
import { describe, expect, test } from 'vitest';
import { xuezhanAi, decideAs } from '../src/ai/xuezhan.ts';
import { fixedStyle } from '../src/ai/style.ts';
import type { Persona } from '../src/ai/personas.ts';
import { kindOf, tileOf, type Tile } from '../src/core/tiles/index.ts';
import { kanOptions, sichuanXuezhan as XZ, view, type XzState } from '../src/core/variants/sichuan-xuezhan/index.ts';
import { baseOf, FLOW_BASE_K, realOpts } from '../src/game/stakes.ts';
import { mahjongRoom } from '../src/room/rules.ts';
import { playMatch } from '../scripts/play.ts';
import { kinds } from './helpers.ts';
import { act, table, tileIn } from './xz-table.ts';

const FLOW = { ...XZ.defaults, flow: true };
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** 0 号坐庄，14 张齐了（刚摸的 1m 是胡的那张），自摸后手里是 23m456m789m234p55p，听 1m、4m；1 号接着摸牌墙第一张 */
function zimo0(flow: boolean, wall = '1m9s9s9s'): XzState {
  const s = table(['123m456m789m234p55p', '123m456m789m11p46p', '1s', '2s'], [2, 2, 0, 0], 0, wall, { ...XZ.defaults, flow });
  return act(s, 0, { t: 'zimo' });
}

describe('血流：胡了不下桌', () => {
  test('自摸：手牌摘出那张，向所有别家收；接着轮到下家', () => {
    const r = zimo0(true);
    expect(r.players[0]!.hand).toHaveLength(13);
    expect(r.players[0]!.wins).toHaveLength(1);
    expect(r.chips).toEqual([2_060, 1_980, 1_980, 1_980]);
    expect(r.events.find((e) => e.e === 'hu')).toMatchObject({ seat: 0, n: 1 });
    expect(r.turn).toBe(1);
    expect(r.phase).toBe('turn');
    // 视图：已胡的人手牌对全桌亮着，hus 记次数
    const v = view(r, 2);
    expect(v.seats[0]!.hand).toHaveLength(13);
    expect(v.seats[0]!.hus).toBe(1);
    expect(v.seats[3]!.hus).toBe(0);
  });

  test('连胡：自摸一次、点炮一次，各自当场按番结算，小结两条，事件 n = 1、2', () => {
    const r = zimo0(true);
    const t = r.drawn!;
    expect(kindOf(t)).toBe(kinds('1m')[0]);
    // 1 号打出 1 万（0 号听 1m、4m），0 号是已胡的人，窗口里只有"胡"
    const d = act(r, 1, { t: 'discard', tile: t });
    expect(d.phase).toBe('claim');
    expect(d.claim!.opts[0]).toEqual(['ron']);
    expect(view(d, 0).prompt).toEqual({ claim: { w: d.claim!.id, opts: ['ron'] } });
    const e = act(d, 0, { t: 'claim', w: d.claim!.id, c: 'ron' });
    expect(e.players[0]!.hand).toHaveLength(13);
    expect(e.players[0]!.wins.map((w) => w.from)).toEqual([null, 1]);
    expect(e.players[0]!.won).toBe(e.players[0]!.wins[0]);
    expect(e.events.find((x) => x.e === 'hu')).toMatchObject({ seat: 0, n: 2, from: 1 });
    // 第二次胡：点炮的 1 号付一把（0 番 = 底分 10）
    expect(e.chips).toEqual([2_070, 1_970, 1_980, 1_980]);
    expect(view(e, 3).seats[0]!.hus).toBe(2);
    // 牌墙摸完收局：小结里同一家两条
    const end = toEnd(e);
    expect(end.history[0]!.wins.map((w) => [w.seat, w.from])).toEqual([
      [0, null],
      [0, 1],
    ]);
    expect(sum(end.chips)).toBe(8_000);
  });

  test('已胡的人在窗口里可以过', () => {
    const r = zimo0(true);
    const d = act(r, 1, { t: 'discard', tile: r.drawn! });
    const e = act(d, 0, { t: 'claim', w: d.claim!.id, c: 'pass' });
    expect(e.players[0]!.wins).toHaveLength(1);
  });

  test('三家都胡了不结束；血战同样的局面是三家胡了收局', () => {
    const mk = (flow: boolean): XzState => {
      const s = table(['123m456m789m234p55p', '123m456m789m234p5p', '666p777p888p123s4s', '9m'], [2, 2, 0, 0], 0, '5p4s9s9s', { ...XZ.defaults, flow });
      return act(act(act(s, 0, { t: 'zimo' }), 1, { t: 'zimo' }), 2, { t: 'zimo' });
    };
    const f = mk(true);
    expect(f.winners).toBe(3);
    expect(f.phase).toBe('turn');
    expect(f.turn).toBe(3);
    expect(f.history).toHaveLength(0);
    expect(f.players.map((p) => p.hand.length)).toEqual([13, 13, 13, 2]);
    expect(mk(false).history[0]!.end).toBe('three');
  });

  test('点炮胡：那张不进手牌，手牌仍是 13 张', () => {
    const s = table(['111s222s333s44s5p7p8p', '123m456m789m11p46p', '123m456m789m11p67p', '9m'], [0, 2, 2, 2], 0, '9s9s9s', FLOW);
    const d = act(s, 0, { t: 'discard', tile: tileIn(s, 0, '5p') });
    const e = act(act(d, 1, { t: 'claim', w: d.claim!.id, c: 'ron' }), 2, { t: 'claim', w: d.claim!.id, c: 'ron' });
    expect(e.players[1]!.hand).toHaveLength(13);
    expect(e.players[2]!.hand).toHaveLength(13);
    expect(e.players[1]!.wins[0]!.hand).toHaveLength(14);
    expect(view(e, 3).seats[1]!.hand).toHaveLength(13);
  });
});

/** 推到这一局结束（电脑照常打，没人点就超时代出） */
function toEnd(s0: XzState): XzState {
  let s = s0;
  for (let k = 0; k < 2_000 && s.phase !== 'end' && s.phase !== 'over'; k++) {
    const seat = s.phase === 'claim' ? XZ.actors(s)!.seats[0]! : s.turn;
    s = act(s, seat, XZ.timeout(s, seat, xuezhanAi));
  }
  return s;
}

/** 0 号锁手牌：111m234m567m23p99p，听 1p、4p（刚自摸了 4p）；之后轮到他摸 draw，手里变成 14 张 */
function lockedHand(wall = '1m'): XzState {
  const s = table(['111m234m567m23p99p4p', '5s', '23m456p789p234p55p', '9m'], [2, 1, 2, 0], 0, wall, FLOW);
  s.drawn = tileIn(s, 0, '4p');
  return act(s, 0, { t: 'zimo' });
}

/** 让已胡的 0 号再轮到出手：手里加一张刚摸的牌 */
function drawNow(s: XzState, k: string): XzState {
  const used = new Set<Tile>([...s.wall.tiles, ...s.players.flatMap((p) => [...p.hand, ...p.melds.flatMap((m) => m.tiles), ...p.river.map((x) => x.tile)])]);
  const t = [0, 1, 2, 3].map((c) => tileOf(kinds(k)[0]!, c)).find((x) => !used.has(x))!;
  const n = structuredClone(s);
  n.players[0]!.hand.push(t);
  n.players[0]!.hand.sort((a, b) => a - b);
  n.players[0]!.draws++;
  n.turn = 0;
  n.drawn = t;
  n.canZimo = true;
  n.phase = 'turn';
  n.events = [];
  return n;
}

describe('血流：胡后手牌锁住', () => {
  test('只能打刚摸的那张，打别的被拒；摸到的能胡就自摸', () => {
    const s = drawNow(lockedHand(), '8s');
    const p = view(s, 0).prompt!;
    expect(p.discard).toEqual([s.drawn]);
    expect(p.zimo).toBeUndefined();
    const other = s.players[0]!.hand.find((t) => t !== s.drawn)!;
    expect(XZ.apply(s, 0, { t: 'discard', tile: other })).toEqual({ error: 'locked' });
    const ok = act(s, 0, { t: 'discard', tile: s.drawn! });
    expect(ok.players[0]!.hand).toHaveLength(13);
    // 摸到听的牌：自摸
    const z = drawNow(lockedHand(), '1p');
    expect(view(z, 0).prompt!.zimo).toBe(true);
    expect(act(z, 0, { t: 'zimo' }).players[0]!.wins).toHaveLength(2);
  });

  test('不能碰、不能直杠：窗口里已胡的人没有碰杠，答碰杠被拒；别人的视图里刚摸的牌不亮', () => {
    const r = lockedHand();
    // 1 号摸到 1 万打出：0 号手里有三张 1 万，没胡的话能碰能杠；2 号听 1 万能胡
    const d = act(r, 1, { t: 'discard', tile: r.drawn! });
    expect(d.claim!.opts[0]).toEqual([]);
    expect(d.claim!.opts[2]).toEqual(['ron']);
    expect(XZ.apply(d, 0, { t: 'claim', w: d.claim!.id, c: 'kan' })).toEqual({ error: 'no_claim' });
    expect(XZ.apply(d, 0, { t: 'claim', w: d.claim!.id, c: 'pon' })).toEqual({ error: 'no_claim' });
    const s = drawNow(r, '8s');
    expect(view(s, 2).seats[0]!.hand).toHaveLength(13);
    expect(view(s, 2).seats[0]!.hand).not.toContain(s.drawn);
    expect(view(s, 0).me!.hand).toHaveLength(14);
  });

  test('暗杠：杠完听的牌不变可以，改听被拒', () => {
    // 111m234m567m23p99p 听 1p、4p：摸到第四张 1 万，杠了还是听 1p、4p
    const s = drawNow(lockedHand('9s9s9s'), '1m');
    expect(view(s, 0).prompt!.kan).toHaveLength(1);
    const k = act(s, 0, { t: 'kan', tile: view(s, 0).prompt!.kan![0]! });
    expect(k.players[0]!.melds).toHaveLength(1);
    expect(k.chips[0]! - s.chips[0]!).toBe(60);
    // 1112m456m789m234p 听 2m、3m：摸到第四张 1 万，杠了只剩听 2m，不让杠
    const t = table(['11122m456m789m234p', '5s', '23m456p789p234p55p', '9m'], [2, 2, 2, 0], 0, '9s9s9s', FLOW);
    t.drawn = tileIn(t, 0, '2m');
    const z = act(t, 0, { t: 'zimo' });
    expect(z.players[0]!.hand).toHaveLength(13);
    const n = drawNow(z, '1m');
    expect(n.players[0]!.hand.filter((x) => kindOf(x) === kinds('1m')[0])).toHaveLength(4);
    expect(view(n, 0).prompt!.kan).toBeUndefined();
    const four = n.players[0]!.hand.find((x) => kindOf(x) === kinds('1m')[0])!;
    expect(XZ.apply(n, 0, { t: 'kan', tile: four })).toEqual({ error: 'cannot_kan' });
    // 对照：不是血流的话这一杠是合法的，被拒只因为改了听
    const ctl = structuredClone(n);
    ctl.opts.flow = false;
    expect(kanOptions(ctl, 0)).toContain(four);
  });
});

describe('血流：牌墙摸完才结算', () => {
  test('已胡的人不参加查花猪、查大叫、退税：既不赔也不收', () => {
    // 0 号自摸后，1 号（听 5p）摸最后一张 9s 打出；2 号花猪（手里有缺门 s），3 号没听牌也不是花猪
    const s = table(['123m456m789m234p55p', '123m456m789m11p46p', '1m3m5m7m9m1s3s5s2p', '2m4m6m8m1p2p3p4p5p6p7p8p9p'], [2, 2, 2, 2], 0, '9s', FLOW);
    s.players[3]!.que = 2;
    const z = act(s, 0, { t: 'zimo' });
    // 退税：3 号收过 0、1、2 号的杠钱（手写进账本），没听牌要退；退给 0 号的不退
    z.ledger.push(
      { kind: 'kan', from: 0, to: 3, amount: 20, ref: 77 },
      { kind: 'kan', from: 1, to: 3, amount: 20, ref: 77 },
      { kind: 'kan', from: 2, to: 3, amount: 20, ref: 77 },
    );
    z.chips[3]! += 60;
    z.chips[0]! -= 20;
    z.chips[1]! -= 20;
    z.chips[2]! -= 20;
    const total = sum(z.chips);
    const end = toEnd(z);
    expect(end.phase).not.toBe('turn');
    const after = end.ledger.slice(z.ledger.length);
    expect(after.some((x) => x.kind === 'tax')).toBe(true);
    expect(after.some((x) => x.kind === 'pig' || x.kind === 'cha')).toBe(true);
    for (const x of after) {
      expect(x.from, x.kind).not.toBe(0);
      expect(x.to, x.kind).not.toBe(0);
    }
    expect(sum(end.chips)).toBe(total);
  });
});

describe('血流：同种子同结果', () => {
  test('整场对局跑两遍 JSON 相等，筹码守恒', () => {
    const key = [7, 2, 0, 2, 6, 1, 3, 1];
    const personas = [0, 1, 2, 3];
    const tunes = personas.map(() => ({ mood: 0, soft: 0 }));
    const a = playMatch(key, 2_000, personas, tunes, new Map(), 4, { flow: true });
    const b = playMatch(key, 2_000, personas, tunes, new Map(), 4, { flow: true });
    expect(JSON.stringify(a.s)).toBe(JSON.stringify(b.s));
    expect(a.s.opts.flow).toBe(true);
    expect(sum(a.s.chips)).toBe(8_000);
    // 血流确实连胡了（不然这条测的是血战）
    const multi = a.s.history.some((h) => new Set(h.wins.map((w) => w.seat)).size < h.wins.length);
    const many = a.s.history.some((h) => h.wins.length > 3);
    expect(multi || many).toBe(true);
    expect(a.s.history.every((h) => h.end === 'wall')).toBe(true);
  });
});

describe('血流：电脑', () => {
  test('自己已胡：能自摸就自摸，否则打刚摸的那张，不杠', () => {
    const s = drawNow(lockedHand('9s9s9s'), '1m');
    // 暗杠本来可以杠，已胡的电脑不杠
    expect(view(s, 0).prompt!.kan).toBeDefined();
    expect(xuezhanAi.decide(view(s, 0))).toEqual({ t: 'discard', tile: s.drawn });
    const z = drawNow(lockedHand(), '1p');
    expect(xuezhanAi.decide(view(z, 0))).toEqual({ t: 'zimo' });
  });

  test('别家已胡：打他听的牌极危险，别的牌照旧', () => {
    // 0 号听 1p、4p；1 号 14 张里 1p 和 9p 都是孤张，原本先打编号小的 1p
    const r = lockedHand();
    const mk = (flow: boolean): XzState => {
      const n = structuredClone(r);
      n.opts.flow = flow;
      const used = new Set<Tile>([...n.wall.tiles, ...n.players.flatMap((p) => [...p.hand, ...p.river.map((x) => x.tile)])]);
      n.players[1]!.hand = kinds('234s567s678p77p1p9p9s').map((k) => {
        const t = [0, 1, 2, 3].map((c) => tileOf(k, c)).find((x) => !used.has(x))!;
        used.add(t);
        return t;
      });
      n.players[1]!.hand.sort((a, b) => a - b);
      n.players[1]!.que = 0;
      n.turn = 1;
      n.drawn = n.players[1]!.hand[0]!;
      n.phase = 'turn';
      n.events = [];
      return n;
    };
    const careful: Persona = { name: '谨慎', style: '', defense: 1_000, greed: 300, pon: 500, slip: 0, reads: 300, level: 1, kanLove: 400, temper: 0, swing: 0, tempo: 1_000, talk: 0, skill: 0, fun: 'normal' };
    const pick = (flow: boolean) => {
      const n = mk(flow);
      const a = decideAs(view(n, 1), fixedStyle(careful));
      return a.t === 'discard' ? kindOf(a.tile) : -1;
    };
    // 血战里 0 号下桌了，打 1p 无所谓；血流里 0 号还听着 1p，不能打
    expect(pick(false)).toBe(kinds('1p')[0]);
    expect(pick(true)).not.toBe(kinds('1p')[0]);
  });
});

describe('血流：选项', () => {
  test('flow 不是 boolean 被拒，没写按 false，旧存档没有字段也按 false', () => {
    expect(XZ.options({ flow: 'yes' })).toBeNull();
    expect(XZ.options({ flow: 1 })).toBeNull();
    expect(XZ.options({})!.flow).toBe(false);
    expect(XZ.options(undefined)!.flow).toBe(false);
    expect(XZ.options({ flow: true })!.flow).toBe(true);
    const old = { ...table(['123m456m789m234p55p', '1s', '2s', '3s'], [2, 0, 0, 0], 0) };
    delete (old.opts as { flow?: boolean }).flow;
    for (const p of old.players) delete (p as { wins?: unknown }).wins;
    expect(view(old as XzState, 0).seats[0]!.hus).toBe(0);
    const z = act(old as XzState, 0, { t: 'zimo' });
    expect(z.players[0]!.hand).toHaveLength(14);
    expect(z.players[0]!.wins).toHaveLength(1);
  });

  test('实盘开血流：realOpts 留着 flow，好友房各档都能带 flow 开；血流底分减半', () => {
    expect(realOpts({ ...FLOW }).flow).toBe(true);
    const o = (stakes: string, flow: boolean) => mahjongRoom.options!({ variant: XZ.id, stakes, rules: { flow } });
    for (const st of ['fun', 'small', 'mid', 'big', 'lux']) {
      expect(o(st, true), st).not.toBeNull();
      expect(o(st, false), st).not.toBeNull();
    }
    expect(baseOf(2_000, { flow: true })).toBe(baseOf(2_000) / FLOW_BASE_K);
    expect(baseOf(200_000, { flow: false })).toBe(baseOf(200_000));
  });
});
