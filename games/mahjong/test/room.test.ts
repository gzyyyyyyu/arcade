/**
 * 好友房的规则（src/room/rules.ts）：开局带入、少带、被拒由庄家打、离座马上结回、打完和关房结回、隐藏信息。
 * 房间（kit）、钱包 DO 在 workerd 里的部分在 test/worker/room.test.ts。
 */
import { snapshotBytes } from 'arcade-kit/game';
import type { SeatKind } from 'arcade-kit/protocol';
import { describe, expect, test } from 'vitest';
import type { XzState, XzView } from '../src/core/variants/sichuan-xuezhan/index.ts';
import { PERSONAS } from '../src/ai/personas.ts';
import { VENUES } from '../src/ai/venues.ts';
import { EMOTES } from '../src/game/emotes.ts';
import { roomOp, SOLO_OP, soloOp } from '../src/game/ops.ts';
import { stakesOf } from '../src/game/stakes.ts';
import { RoomTalk } from '../src/room/talk.ts';
import { mahjongRoom as G, matchWins, OPENING_MS, REMATCH_MS, type RoomAction, type RoomState, type WalletEffect } from '../src/room/rules.ts';
import { KEY } from './helpers.ts';
import { RON, tileIn } from './xz-table.ts';

const SHARE = 2_000;
const OK = { ok: true };
const RULES = { rounds: 4, cap: 3, swap: true, zimo: 'di', transfer: true };

function begin(seats: SeatKind[], stakes = 'small', key = KEY): RoomState {
  const opts = G.options!({ variant: 'sichuan-xuezhan', stakes, rules: RULES })!;
  return G.begin!(key, 1, { opts, seats });
}

function must(x: RoomState | { error: string }): RoomState {
  if ('error' in x && typeof x.error === 'string') throw new Error(`unexpected error ${x.error}`);
  return x as RoomState;
}

const act = (s: RoomState, seat: number, a: RoomAction) => must(G.apply(s, seat, a));
const fx = (s: RoomState) => G.effects!(s);
const strip = ({ ref: _r, stakes: _s, stats: _t, ...e }: WalletEffect) => e;
const g = (s: RoomState, seat: number | null) => G.view(s, seat).g as XzView;
const seatsOf = (s: RoomState) => {
  const a = G.actors!(s);
  return Array.isArray(a) ? a : a.seats;
};

function settleAll(s0: RoomState, reply: (e: WalletEffect) => unknown = () => OK): RoomState {
  let s = s0;
  for (let k = 0; k < 20 && fx(s).length; k++) for (const e of fx(s)) s = G.settled!(s, e.id, reply(e));
  return s;
}

/** 像房间一样推：电脑座位用 ai，真人用 timeout（当他一直没点），停着的就 resume；直到打完或者 steps 用完 */
function drive(s0: RoomState, steps = 100_000, stop?: (s: RoomState) => boolean): RoomState {
  let s = s0;
  for (let k = 0; k < steps && !G.over(s); k++) {
    if (stop?.(s)) return s;
    const seats = seatsOf(s);
    if (!seats.length) {
      expect(G.pause!(s)).not.toBeNull();
      s = G.resume!(s);
      continue;
    }
    const seat = seats[0]!;
    s = act(s, seat, s.kinds[seat] === 'ai' ? G.ai(s, seat) : G.timeout!(s, seat));
  }
  return s;
}

describe('选项', () => {
  test('默认、合格、不合格', () => {
    expect(G.options!(undefined)).toMatchObject({ variant: 'sichuan-xuezhan', stakes: 'fun' });
    expect(G.options!({ variant: 'sichuan-xuezhan', stakes: 'mid', rules: { rounds: 8 } })).toMatchObject({ stakes: 'mid', rules: { rounds: 8, cap: 4 } });
    expect(G.options!({ stakes: 'x' })).toBeNull();
    expect(G.options!({ stakes: 'fun', rules: { rounds: 5 } })).toBeNull();
    expect(G.options!([])).toBeNull();
  });

  test('互动的编号：14 句短语 + 12 张表情包 + 8 个道具', () => {
    expect(G.emotes).toBe(EMOTES);
    expect(EMOTES).toBe(34);
  });
});

describe('开局和带入', () => {
  test('娱乐：不碰钱包，真人一坐下就能打', () => {
    const s = begin(['human', 'human', 'ai', 'ai'], 'fun');
    expect(fx(s)).toEqual([]);
    expect(s.opening).toBe(false);
    expect(s.own).toEqual([true, true, false, false]);
    expect(G.actors!(s)).toMatchObject({ group: 'swap-0' });
  });

  test('实盘：真人的带入交给钱包，都有回话才开打；ref 是房间号 + 座位 + 第几份', () => {
    let s = begin(['human', 'human', 'ai', 'ai']);
    expect(s.ref).toMatch(/^r[0-9a-f]{16}$/);
    expect(fx(s).map(strip)).toEqual([
      { id: 'b0', seat: 0, kind: 'debit', amount: SHARE },
      { id: 'b1', seat: 1, kind: 'debit', amount: SHARE },
    ]);
    expect(fx(s)[0]!.ref).toBe(`${s.ref}s0n1`);
    expect(G.actors!(s)).toEqual({ seats: [0], group: 'opening' });
    expect(G.turnMs!(s)).toBe(OPENING_MS);
    expect(G.apply(s, 0, { t: 'play', v: 'sichuan-xuezhan', a: { t: 'swap', tiles: [] } })).toEqual({ error: 'opening' });
    // 客户端发不了 go（parse 不收）
    expect(G.parse({ t: 'go' })).toBeNull();
    // 也发不了收掉声明窗口的 expire、电脑的 bot 回答；合格的玩法动作带上玩法 id
    expect(G.parse({ t: 'play', v: 'sichuan-xuezhan', a: { t: 'expire', w: 1 } })).toBeNull();
    expect(G.parse({ t: 'play', v: 'sichuan-xuezhan', a: { t: 'claim', w: 1, c: 'pass', bot: true } })).toBeNull();
    expect(G.parse({ t: 'play', v: 'sichuan-xuezhan', a: { t: 'claim', w: 1, c: 'pass' } })).toEqual({ t: 'play', v: 'sichuan-xuezhan', a: { t: 'claim', w: 1, c: 'pass' } });
    expect(G.free!(G.parse({ t: 'play', v: 'sichuan-xuezhan', a: { t: 'claim', w: 1, c: 'pass' } })!)).toBe(true);
    s = G.settled!(s, 'b0', OK);
    expect(s.own).toEqual([true, false, false, false]);
    expect(G.actors!(s)).toEqual({ seats: [1], group: 'opening' });
    s = G.settled!(s, 'b1', OK);
    expect(s.opening).toBe(false);
    expect(s.own).toEqual([true, true, false, false]);
    expect(G.view(s, 0).inn).toBe(SHARE);
    expect(G.view(s, 2).inn).toBe(0);
    expect(G.view(s, null).inn).toBe(0);
  });

  test('钱包不够一份：不少带（底分和"最多赢 3 份"都按整份，少带的输得少、赢得一样多，第三轮审计），按被拒算', () => {
    // 豪华档两个真人，一个钱包只有 1：他进不去，只剩一个人下注，这一场当场结束，另一个人的那一份原样结回
    const lux = stakesOf('lux')!.share;
    let s = G.settled!(begin(['human', 'human', 'ai', 'ai'], 'lux'), 'b1', OK);
    s = G.settled!(s, 'b0', { ok: false, error: 'no_funds', balance: 1 });
    expect(fx(s).every((e) => e.kind !== 'debit')).toBe(true);
    expect([s.own[0], G.view(s, 0).refused, G.view(s, 0).inn]).toEqual([false, 'no_funds', 0]);
    expect(s.cut).toBe(true);
    expect(fx(s).map(strip)).toEqual([{ id: 'c2', seat: 1, kind: 'credit', amount: lux }]);
    // 三个真人时被拒的那位接着看，带入一律整份
    s = G.settled!(G.settled!(begin(['human', 'human', 'human', 'ai'], 'lux'), 'b1', OK), 'b2', OK);
    s = G.settled!(s, 'b0', { ok: false, error: 'no_funds', balance: 1 });
    expect([s.own[0], s.cut]).toEqual([false, false]);
    s = act(s, 0, { t: 'rebuy' });
    // 已经发牌了：等这一局打完才扣，扣的照旧是整份
    s = drive(s, 4_000, (x) => fx(x).length > 0);
    expect(fx(s).map(strip)).toEqual([{ id: 'b3', seat: 0, kind: 'debit', amount: lux }]);
  });

  test('被拒（一分钱没有）：座位由庄家出筹码、这里替电脑打，他不能出手；可以再带一次（一局打到一半点的，这一局打完才扣）', () => {
    // 三个真人：被拒一个还剩两个在下注，接着打
    let s = begin(['human', 'human', 'human', 'ai']);
    s = G.settled!(G.settled!(G.settled!(s, 'b0', OK), 'b2', OK), 'b1', { ok: false, error: 'no_funds', wallet: { balance: 0 } });
    expect(s.opening).toBe(false);
    expect(G.view(s, 1).refused).toBe('no_funds');
    expect(G.view(s, 0).refused).toBeNull();
    expect(G.view(s, 1).canRebuy).toBe(true);
    // 换三张的名单里没有 1 号（已经替他换了）
    expect(seatsOf(s)).not.toContain(1);
    expect(G.apply(s, 1, { t: 'play', v: 'sichuan-xuezhan', a: { t: 'que', suit: 0 } })).toEqual({ error: 'not_seated' });
    s = act(s, 1, { t: 'rebuy' });
    // 开局已经发牌（不在局间）：先记下，等这一局打完
    expect([fx(s), G.view(s, 1).waiting, G.view(s, 1).canRebuy, G.view(s, 1).refused]).toEqual([[], true, false, null]);
    s = drive(s, 4_000, (x) => fx(x).length > 0);
    expect(g(s, null).phase).toBe('end');
    expect(fx(s).map(strip)).toEqual([{ id: 'b3', seat: 1, kind: 'debit', amount: SHARE }]);
    // 没开成的那一份不算，再带还是第 1 份
    expect(fx(s)[0]!.ref).toBe(`${s.ref}s1n1`);
    expect(G.view(s, 1).buying[1]).toBe(true);
    s = G.settled!(s, 'b3', OK);
    expect(s.own[1]).toBe(true);
    expect(g(s, 1).seats[1]!.chips).toBe(SHARE);
  });

  test('开局有人的带入一直没回话：到点（房间代出 go）先开打，他的座位先由庄家打；钱在这一局中途到账先收着，这一局打完才接手（不在一局中途换人）', () => {
    let s = G.settled!(begin(['human', 'human', 'ai', 'ai']), 'b0', OK);
    expect(G.timeout!(s, 1)).toEqual({ t: 'go' });
    expect(G.ai(s, 1)).toEqual({ t: 'go' });
    expect(G.apply(s, 0, { t: 'go' })).toEqual({ error: 'not_now' });
    s = act(s, 1, { t: 'go' });
    expect(s.opening).toBe(false);
    expect(seatsOf(s)).not.toContain(1);
    s = G.settled!(s, 'b1', OK);
    expect([s.own[1], s.ready?.[1], G.view(s, 1).canRebuy]).toEqual([false, true, false]);
    s = drive(s, 4_000, (x) => g(x, null).phase === 'end');
    expect([s.own[1], s.ready?.[1], g(s, 1).seats[1]!.chips]).toEqual([true, false, SHARE]);
  });
});

describe('实盘至少两个真人', () => {
  test('开局只有一个真人（旧页面、脚本绕过了灰掉的"开打"）：整场不计输赢、不碰钱包，按娱乐打完', () => {
    let s = begin(['human', 'ai', 'ai', 'ai']);
    expect(s.unrated).toBe(true);
    expect(fx(s)).toEqual([]);
    expect(s.opening).toBe(false);
    expect(s.own).toEqual([true, false, false, false]);
    expect(G.view(s, 0)).toMatchObject({ unrated: true, cut: false, canRebuy: false });
    s = drive(s);
    expect(s.done).toBe(true);
    expect(fx(s)).toEqual([]);
    // 中途有人来接管电脑的座位也一样不碰钱包
    let t = drive(begin(['human', 'ai', 'ai', 'ai']), 200, (x) => x.n > 20);
    t = G.seated!(t, 2, 'human');
    expect(fx(t)).toEqual([]);
    expect(t.own[2]).toBe(true);
  });

  test('电脑按场地挑：实盘各档用 room:<档> 的组合，娱乐和不计输赢的按 room:fun；每个座位都有这一场的状态', () => {
    const allowed = (venue: string, s: RoomState) => (s.g as XzState).personas.every((p) => VENUES[venue]!.weights[p]! > 0);
    for (const st of ['small', 'mid', 'big', 'lux']) {
      const s = begin(['human', 'human', 'ai', 'ai'], st);
      expect(allowed(`room:${st}`, s)).toBe(true);
      expect((s.g as XzState).tunes!.every((t) => t.mood !== 0 && t.soft === VENUES[`room:${st}`]!.soft)).toBe(true);
    }
    // 实盘桌的两家电脑都是高档的人，不管坐哪两个座位都不重名（真人坐哪儿都一样）
    for (const kinds of [['human', 'human', 'ai', 'ai'], ['ai', 'human', 'ai', 'human'], ['ai', 'ai', 'human', 'human']] as const) {
      for (const st of ['small', 'big']) {
        const ps = (begin([...kinds], st).g as XzState).personas;
        const bots = kinds.flatMap((k, i) => (k === 'ai' ? [ps[i]!] : []));
        expect(new Set(bots).size).toBe(2);
        expect(bots.every((i) => PERSONAS[i]!.level >= 3)).toBe(true);
      }
    }
    expect(allowed('room:fun', begin(['human', 'human', 'ai', 'ai'], 'fun'))).toBe(true);
    expect((begin(['human', 'ai', 'ai', 'ai'], 'lux').g as XzState).tunes![1]!.soft).toBe(VENUES['room:fun']!.soft);
  });

  test('开打以后只剩一个真人在下注：这一局打完时这一场结束，所有人桌上的筹码按那一刻结回（一局打到一半走的，这一局照算）', () => {
    let s = settleAll(begin(['human', 'human', 'ai', 'ai']));
    s = drive(s, 400, (x) => g(x, null).phase === 'turn' && x.n > 40);
    s = G.seated!(s, 1, 'ai');
    // 这一局还没完：他的筹码还在桌上、算下注的，电脑替他打，不结回、不提前收场
    expect([s.cut, s.done, fx(s), s.own[1], s.leaving?.[1]]).toEqual([false, false, [], true, true]);
    s = drive(s, 2_000, (x) => !!x.done);
    const chips = g(s, null).seats.map((x) => x.chips);
    expect(s.cut).toBe(true);
    expect(s.done).toBe(true);
    expect(g(s, 0).phase).toBe('over');
    expect(G.view(s, 0).cut).toBe(true);
    expect(fx(s).map(strip)).toEqual([
      { id: 'c2', seat: 1, kind: 'credit', amount: Math.max(0, Math.min(chips[1]!, 4 * SHARE)) },
      { id: 'c3', seat: 0, kind: 'credit', amount: Math.max(0, Math.min(chips[0]!, 4 * SHARE)) },
    ]);
    expect(G.apply(s, 0, { t: 'play', v: 'sichuan-xuezhan', a: { t: 'zimo' } })).toEqual({ error: 'closed' });
    expect(G.apply(s, 0, { t: 'rebuy' })).toEqual({ error: 'closed' });
  });

  test('开局有人被拒、只剩一个人在下注：当场结束，到账的那一份原样结回', () => {
    let s = begin(['human', 'human', 'ai', 'ai']);
    s = G.settled!(G.settled!(s, 'b0', OK), 'b1', { ok: false, error: 'no_funds', balance: 0 });
    expect(s.cut).toBe(true);
    expect(fx(s).map(strip)).toEqual([{ id: 'c2', seat: 0, kind: 'credit', amount: SHARE }]);
    expect(G.view(s, 1).canRebuy).toBe(false);
  });
});

describe('离座和结回', () => {
  test('离座：电脑替他打完这一局，这一局结束时带着筹码和小结结回，座位交给电脑接着打；回来再坐开新的一份', () => {
    // 三个真人：走一个还剩两个在下注，接着打
    let s = settleAll(begin(['human', 'human', 'human', 'ai']));
    s = drive(s, 400, (x) => g(x, null).phase === 'turn' && x.n > 40);
    s = G.seated!(s, 0, 'ai');
    // 一局打到一半走的：这一局照算（不然眼看要输就走，能躲掉查叫和别人的自摸）
    expect([fx(s), s.own[0], s.leaving?.[0]]).toEqual([[], true, true]);
    s = drive(s, 2_000, (x) => fx(x).length > 0);
    // 结回排在这一局的结算上（停在 end），不是离座那一刻
    expect(g(s, null).phase).toBe('end');
    const chips = g(s, null).seats[0]!.chips;
    const c = fx(s);
    expect(c.map(strip)).toEqual([{ id: 'c3', seat: 0, kind: 'credit', amount: Math.max(0, Math.min(chips, 4 * SHARE)) }]);
    expect(c[0]!.ref).toBe(`${s.ref}s0n1`);
    expect(c[0]!.stats).toMatchObject({ rounds: expect.any(Number), wins: expect.any(Number) });
    expect(s.own[0]).toBe(false);
    s = settleAll(s);
    expect(G.over(s)).toBe(false);
    // 他回来：开第 2 份
    s = G.seated!(s, 0, 'human');
    expect(fx(s)[0]).toMatchObject({ kind: 'debit', seat: 0, ref: `${s.ref}s0n2`, amount: SHARE });
    s = settleAll(s);
    expect(s.own[0]).toBe(true);
    expect(g(s, 0).seats[0]!.chips).toBe(SHARE);
  });

  test('一局打到一半离座、这一局没完又坐回来：筹码本来就是他的，接着打，不结回、不另开一份', () => {
    let s = settleAll(begin(['human', 'human', 'human', 'ai']));
    s = drive(s, 400, (x) => g(x, null).phase === 'turn' && x.n > 40);
    const before = { share: s.share[0], chips: g(s, 0).seats[0]!.chips };
    s = G.seated!(G.seated!(s, 0, 'ai'), 0, 'human');
    expect([fx(s), s.own[0], s.leaving?.[0], s.share[0], g(s, 0).seats[0]!.chips]).toEqual([[], true, false, before.share, before.chips]);
  });

  test('娱乐房、一局打完停在结算时离座：照旧马上结束（娱乐不碰钱包；局间没有要躲的）', () => {
    let s = settleAll(begin(['human', 'human', 'human', 'ai']));
    s = drive(s, 2_000, (x) => g(x, null).phase === 'end');
    s = G.seated!(s, 0, 'ai');
    expect([fx(s).map(strip), s.own[0], !!s.leaving?.[0]]).toEqual([[{ id: 'c3', seat: 0, kind: 'credit', amount: expect.any(Number) }], false, false]);
    let f = settleAll(begin(['human', 'human', 'ai', 'ai'], 'fun'));
    f = drive(f, 400, (x) => g(x, null).phase === 'turn' && x.n > 40);
    f = G.seated!(f, 0, 'ai');
    expect([f.own[0], !!f.leaving?.[0]]).toEqual([false, false]);
  });

  test('真人在一局中途一起走了：电脑替所有座位把这一局打完（查叫、查花猪、退税照算）再结回，房间就算打完（第三轮审计）', () => {
    let dodged = 0;
    for (let k = 0; k < 12; k++) {
      let s = settleAll(begin(['human', 'human', 'ai', 'ai'], 'small', KEY.map((x, i) => (i === 0 ? x + k : x))));
      s = drive(s, 400, (x) => g(x, null).phase === 'turn' && x.n > 40);
      const mid = g(s, null).seats.map((x) => x.chips);
      s = G.seated!(G.seated!(s, 0, 'ai'), 1, 'ai');
      // kit 桌上没真人时不推电脑：这一局在这一步里就打到了结算，两个人按结算后的筹码结回、马上收场
      const x = s.g as XzState;
      expect(['end', 'over']).toContain(x.phase);
      expect(G.over(s)).toBe(true);
      expect(s.leaving).toEqual([false, false, false, false]);
      const end = g(s, null).seats.map((y) => y.chips);
      expect(fx(s).map(strip)).toEqual([0, 1].map((seat, i) => ({ id: `c${2 + i}`, seat, kind: 'credit', amount: Math.max(0, Math.min(end[seat]!, 4 * SHARE)) })));
      // 流局的赔付（查大叫、查花猪、退税）落在他们头上的：按半局的筹码结就躲掉了
      if (x.ledger.some((p) => ['cha', 'pig', 'tax'].includes(p.kind) && p.from <= 1) && end[0]! + end[1]! < mid[0]! + mid[1]!) dodged++;
    }
    expect(dodged).toBeGreaterThan(0);
  });

  test('带入还在路上人就走了：到账后原样结回', () => {
    let s = G.settled!(G.settled!(begin(['human', 'human', 'human', 'ai']), 'b1', OK), 'b2', OK);
    s = G.seated!(s, 0, 'ai');
    expect(G.over(s)).toBe(false);
    s = G.settled!(s, 'b0', OK);
    expect(fx(s).map(strip)).toEqual([{ id: 'c3', seat: 0, kind: 'credit', amount: SHARE }]);
    expect(s.done).toBe(false);
  });

  test('一场打完：桌上每个真人各结回一笔（按"最多赢 3 份"截过，带小结）；电脑的归庄家', () => {
    let s = settleAll(begin(['human', 'human', 'ai', 'ai']));
    s = drive(s);
    expect(G.over(s)).toBe(true);
    expect(s.done).toBe(true);
    const c = fx(s);
    expect(c.map((e) => e.seat).sort()).toEqual([0, 1]);
    for (const e of c) {
      expect(e.kind).toBe('credit');
      expect(e.amount).toBeGreaterThanOrEqual(0);
      expect(e.amount).toBeLessThanOrEqual(4 * SHARE);
      expect(JSON.stringify(e.stats).length).toBeLessThanOrEqual(256);
    }
    expect(G.apply(s, 0, { t: 'rebuy' })).toEqual({ error: 'closed' });
  });

  test('房间要关：所有人桌上的筹码结回，牌局不再动', () => {
    let s = drive(settleAll(begin(['human', 'human', 'ai', 'ai'])), 200, (x) => x.n > 40);
    s = G.closing!(s);
    expect(fx(s).map((e) => [e.seat, e.kind])).toEqual([
      [0, 'credit'],
      [1, 'credit'],
    ]);
    expect(G.apply(s, 0, { t: 'play', v: 'sichuan-xuezhan', a: { t: 'zimo' } })).toEqual({ error: 'closed' });
    expect(G.over(s)).toBe(true);
  });
});

describe('实盘一局打到一半坐下：这一局电脑照打，下一局才带入（0.47.3）', () => {
  /** 两个真人在打、2 号座位是电脑；推到一局正打到一半 */
  const midRound = (): RoomState => drive(settleAll(begin(['human', 'human', 'ai', 'ai'])), 400, (x) => g(x, null).phase === 'turn' && x.n > 40);
  const toRoundEnd = (s: RoomState): RoomState => drive(s, 4_000, (x) => g(x, null).phase === 'end');
  const credits = (s: WalletEffect[], seat: number) => s.filter((e) => e.seat === seat && e.kind === 'credit');

  test('中途坐下：不扣钱、不换人（玩法里这个座位还是那个电脑、筹码不动），他旁观（看不到这个座位的暗牌）、不能出手，这一局照常打完', () => {
    const s0 = midRound();
    const s = G.seated!(s0, 2, 'human');
    const xz = (x: RoomState) => x.g as XzState;
    expect([fx(s), s.own[2], s.waiting?.[2], G.view(s, 2).waiting]).toEqual([[], false, true, true]);
    expect([xz(s).kinds[2], xz(s).personas[2], xz(s).chips[2], xz(s).start[2]]).toEqual([xz(s0).kinds[2], xz(s0).personas[2], xz(s0).chips[2], xz(s0).start[2]]);
    expect(G.view(s, 2).g).toEqual(G.view(s, null).g);
    expect(G.apply(s, 2, { t: 'play', v: 'sichuan-xuezhan', a: { t: 'discard', tile: 0 } })).toEqual({ error: 'not_seated' });
    // 电脑替这个座位出手（kit 不会叫他）：一局照常打到结算，中间这个座位一直是电脑、不是他的
    const a = drive(s, 4_000, (x) => g(x, null).phase === 'end' || x.own[2] || xz(x).kinds[2] !== 'ai');
    expect([g(a, null).phase, a.own[2], xz(a).kinds[2]]).toEqual(['end', false, 'ai']);
  });

  test('下一局发牌前扣一份（像开局一样等钱包回话），到账才是他的、从一份算；整场打完只结回一次', () => {
    let s = toRoundEnd(G.seated!(midRound(), 2, 'human'));
    expect(fx(s).map(strip)).toEqual([{ id: expect.any(String), seat: 2, kind: 'debit', amount: SHARE }]);
    expect(fx(s)[0]!.ref).toBe(`${s.ref}s2n1`);
    expect([s.opening, s.waiting?.[2], G.pause!(s)]).toEqual([true, false, null]);
    s = settleAll(s);
    expect([s.opening, s.own[2], g(s, 2).seats[2]!.chips]).toEqual([false, true, SHARE]);
    // 到账以后看得到自己的牌
    expect(G.view(s, 2).g).not.toEqual(G.view(s, null).g);
    const all: WalletEffect[] = [];
    for (let k = 0; k < 200 && !G.over(s) && !s.done; k++) {
      s = drive(s, 4_000, (x) => fx(x).length > 0 || x.done);
      all.push(...fx(s));
      s = settleAll(s);
    }
    all.push(...fx(s));
    expect(s.done).toBe(true);
    const c = credits(all, 2);
    expect(c.length).toBe(1);
    expect(c[0]!.ref).toBe(`${s.ref}s2n1`);
  });

  test('坐下以后、下一局开始前走了：不扣钱，记号清掉，座位还是电脑的', () => {
    let s = G.seated!(G.seated!(midRound(), 2, 'human'), 2, 'ai');
    expect([fx(s), s.waiting?.[2], s.own[2]]).toEqual([[], false, false]);
    s = toRoundEnd(s);
    s = drive(s, 400, (x) => g(x, null).phase !== 'end');
    expect(fx(s).filter((e) => e.seat === 2)).toEqual([]);
    expect(s.share[2]).toBe(0);
  });

  test('局间（停在结算）坐下照旧马上带入；娱乐房中途坐下照旧马上是他的', () => {
    let s = toRoundEnd(midRound());
    s = G.seated!(s, 2, 'human');
    expect(fx(s).map(strip)).toEqual([{ id: expect.any(String), seat: 2, kind: 'debit', amount: SHARE }]);
    let f = drive(settleAll(begin(['human', 'human', 'ai', 'ai'], 'fun')), 400, (x) => g(x, null).phase === 'turn' && x.n > 40);
    f = G.seated!(f, 2, 'human');
    expect([f.own[2], f.waiting?.[2] ?? false, g(f, 2).seats[2]!.chips]).toEqual([true, false, stakesOf('fun')!.share]);
  });
});

describe('跨审 0.47.3（Gemini 只读审查的线索，逐条复现）', () => {
  const midRound = (seats: SeatKind[] = ['human', 'human', 'ai', 'ai']): RoomState =>
    drive(settleAll(begin(seats)), 400, (x) => g(x, null).phase === 'turn' && x.n > 40);
  const toRoundEnd = (s: RoomState): RoomState => drive(s, 4_000, (x) => g(x, null).phase === 'end' || x.done || x.opening);

  test('第 2 条①：C 中途坐下等下一局、B 中途离座：这一局打完不算"只剩一个人"，接着打、C 带入', () => {
    let s = G.seated!(G.seated!(midRound(), 2, 'human'), 1, 'ai');
    s = toRoundEnd(s);
    expect(s.cut ?? false).toBe(false);
    expect(fx(s).filter((e) => e.kind === 'debit').map((e) => e.seat)).toEqual([2]);
    expect(fx(s).filter((e) => e.kind === 'credit').map((e) => e.seat)).toEqual([1]);
  });

  test('第 2 条②：A、B 都中途离座、只剩 C 在等：这一场到此结束，C 一分不扣', () => {
    let s = G.seated!(midRound(), 2, 'human');
    s = G.seated!(G.seated!(s, 0, 'ai'), 1, 'ai');
    s = toRoundEnd(s);
    expect(fx(s).filter((e) => e.seat === 2)).toEqual([]);
    expect([s.cut, s.done, s.opening]).toEqual([true, true, false]);
  });

  test('第 4 条①：局间等两个人的钱，先排的那个走了：接着等还坐着的那个，不由电脑代出"开打"', () => {
    let s = G.seated!(G.seated!(midRound(), 2, 'human'), 3, 'human');
    s = toRoundEnd(s);
    expect([s.opening, fx(s).filter((e) => e.kind === 'debit').map((e) => e.seat)]).toEqual([true, [2, 3]]);
    s = G.seated!(s, 2, 'ai');
    expect(seatsOf(s)).toEqual([3]);
    // 走了的那一份到账：原样结回
    const b2 = fx(s).find((e) => e.seat === 2 && e.kind === 'debit')!;
    s = G.settled!(s, b2.id, OK);
    expect([s.opening, s.own[2], fx(s).find((e) => e.seat === 2)?.kind]).toEqual([true, false, 'credit']);
  });

  test('第 4 条②：局间等钱时他掉线托管（kit 马上替他代出"开打"）：钱在下一局中途到账也不当场换人，等这一局打完才算他的', () => {
    let s = toRoundEnd(G.seated!(midRound(), 2, 'human'));
    expect(seatsOf(s)).toEqual([2]);
    // kit 的 runAuto 对托管的真人调 ai：开局等钱时就是"开打"
    s = act(s, 2, G.ai(s, 2));
    expect(s.opening).toBe(false);
    s = drive(s, 400, (x) => g(x, null).phase === 'turn' && x.n > 5);
    const b = fx(s).find((e) => e.seat === 2 && e.kind === 'debit')!;
    s = G.settled!(s, b.id, OK);
    expect([g(s, null).phase, s.own[2]]).toEqual(['turn', false]);
    expect(G.view(s, 2).g).toEqual(G.view(s, null).g);
    // 这一局打完：从一份算、是他的了
    s = toRoundEnd(s);
    expect([s.own[2], g(s, 2).seats[2]!.chips]).toEqual([true, SHARE]);
  });

  test('第 4 条②续：钱收着、还没接手时走了：那一份原样结回一次，座位还是电脑的', () => {
    let s = toRoundEnd(G.seated!(midRound(), 2, 'human'));
    s = act(s, 2, G.ai(s, 2));
    s = drive(s, 400, (x) => g(x, null).phase === 'turn' && x.n > 5);
    s = G.settled!(s, fx(s).find((e) => e.seat === 2 && e.kind === 'debit')!.id, OK);
    s = G.seated!(s, 2, 'ai');
    const c = fx(s).filter((e) => e.seat === 2);
    expect(c.map(strip)).toEqual([{ id: expect.any(String), seat: 2, kind: 'credit', amount: SHARE }]);
    expect(c[0]!.ref).toBe(`${s.ref}s2n1`);
    expect([s.own[2], s.ready?.[2], (s.g as XzState).kinds[2]]).toEqual([false, false, 'ai']);
  });

  test('第 3 条：筹码不是他的座位（局间带入被拒、带入超时先开打）一律不给暗牌，和旁观一样', () => {
    // 三个真人在打，2 号是 C：局间带入被拒，下一局这个座位由庄家打
    let s = G.seated!(midRound(['human', 'human', 'ai', 'ai']), 2, 'human');
    s = toRoundEnd(s);
    const b = fx(s).find((e) => e.seat === 2 && e.kind === 'debit')!;
    s = G.settled!(s, b.id, { ok: false, error: 'no_funds', wallet: { balance: 0 } });
    s = drive(s, 400, (x) => g(x, null).phase === 'turn');
    expect([s.own[2], s.waiting?.[2], G.view(s, 2).refused]).toEqual([false, false, 'no_funds']);
    expect(G.view(s, 2).g).toEqual(G.view(s, null).g);
    // 开局带入一直没回话、到点先开打：钱还在路上，这个座位由庄家打，也不给暗牌
    let o = G.settled!(begin(['human', 'human', 'ai', 'ai']), 'b0', OK);
    o = act(o, 1, { t: 'go' });
    expect([o.own[1], G.view(o, 1).buying[1]]).toEqual([false, true]);
    expect(G.view(o, 1).g).toEqual(G.view(o, null).g);
  });
});

describe('好友房的公平和边角', () => {
  test('声明窗口里真人答了、窗口没结束：别人的视图一点不变、步数不加（kit 0.7.1 据此不广播）；答完结束窗口的照常加', () => {
    // 四个真人的娱乐房，局面换成"0 号打 5p，1、2 号都能胡"（test/xz-table.ts）
    let s: RoomState = { ...begin(['human', 'human', 'human', 'human'], 'fun'), g: RON() };
    const play = (a: unknown) => G.parse({ t: 'play', v: 'sichuan-xuezhan', a })!;
    s = act(s, 0, play({ t: 'discard', tile: tileIn(s.g as XzState, 0, '5p') }));
    const w = g(s, 1).prompt!.claim!.w;
    expect(g(s, 2).prompt!.claim!.w).toBe(w);
    const others = [null, 0, 2, 3];
    const before = others.map((x) => JSON.stringify(G.view(s, x)));
    const a = play({ t: 'claim', w, c: 'ron' });
    expect(G.free!(a)).toBe(true);
    const next = act(s, 1, a);
    expect(others.map((x) => JSON.stringify(G.view(next, x)))).toEqual(before);
    expect(next.n).toBe(s.n);
    // 他自己的按钮收起
    expect(g(next, 1).prompt).toBeNull();
    // 最后一个有选择的答完：窗口结束，照常是新的一步，事件是新的
    const end = act(next, 2, play({ t: 'claim', w, c: 'pass' }));
    expect(end.n).toBe(s.n + 1);
    expect(g(end, 0).events.some((e) => e.e === 'hu')).toBe(true);
  });

  test('四个真人带入都被拒：没人下注，这一场当场结束，不卡住', () => {
    let s = begin(['human', 'human', 'human', 'human']);
    for (const e of fx(s)) s = G.settled!(s, e.id, { ok: false, error: 'no_funds', balance: 0 });
    expect(s.own).toEqual([false, false, false, false]);
    expect(s.cut).toBe(true);
    for (let k = 0; k < 100 && !G.over(s); k++) {
      // 谁也不用出手：停在结算，到点 resume
      expect(seatsOf(s)).toEqual([]);
      s = G.resume!(s);
    }
    expect(G.over(s)).toBe(true);
    expect(fx(s)).toEqual([]);
  });

  test('房间到点替庄家代打的座位代出（kit 的 timeout、ai 带 srv）：照样往下推；客户端发的被拒', () => {
    let s = G.settled!(G.settled!(begin(['human', 'human', 'human', 'ai']), 'b1', OK), 'b2', OK);
    s = G.settled!(s, 'b0', { ok: false, error: 'no_funds', balance: 0 });
    // 构造一个 sync 没推完的局面：把一个"该庄家代打"的状态直接交给 apply
    const a = G.timeout!(s, 1);
    expect(a).toMatchObject({ t: 'play', srv: true });
    expect(G.parse({ ...(a as object) })).not.toHaveProperty('srv');
    expect(G.apply(s, 0, { t: 'play', v: 'sichuan-xuezhan', a: { t: 'que', suit: 0 } })).toEqual({ error: 'not_seated' });
  });
});

describe('隐藏信息和大小', () => {
  test('视图里没有密钥，看不到别人的手牌；快照不大', () => {
    let s = settleAll(begin(['human', 'human', 'ai', 'ai']));
    s = drive(s, 300, (x) => g(x, null).phase === 'turn' && x.n > 40);
    for (const seat of [null, 0, 1, 2, 3]) {
      const v = G.view(s, seat);
      expect(JSON.stringify(v)).not.toMatch(/"key"/);
      const gv = v.g as XzView;
      gv.seats.forEach((x, i) => {
        if (i !== seat && !x.won) expect(x.hand).toBeNull();
      });
    }
    expect(snapshotBytes(G, s)).toBeLessThan(12_000);
  });

  test('步数 n：出牌、发下一局才加，钱包到账不加（页面靠它不重放动画）', () => {
    let s = begin(['human', 'human', 'ai', 'ai']);
    s = G.settled!(s, 'b0', OK);
    const n = s.n;
    s = G.settled!(s, 'b1', OK);
    expect(s.n).toBe(n);
    s = drive(s, 1);
    expect(s.n).toBe(n + 1);
  });

  test('同样的熵、同样的操作，结果一样', () => {
    const run = () => drive(settleAll(begin(['human', 'human', 'ai', 'ai'], 'small', [9, 8, 7, 6, 5, 4, 3, 2])));
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});

describe('再来一场', () => {
  const done = () => drive(settleAll(begin(['human', 'human', 'ai', 'ai'])), 100_000, (x) => x.done);

  test('打完先结回，房间停着等人点，不算打完', () => {
    const s = done();
    expect(s.done).toBe(true);
    expect(fx(s).every((e) => e.kind === 'credit')).toBe(true);
    expect(G.over(s)).toBe(false);
    expect(seatsOf(s)).toEqual([]);
    expect(G.pause!(s)).toBe(REMATCH_MS);
  });

  test('打完等人点的这几分钟算 idle（kit 先还开房名额），在打时不算；到点收场、有人点了也还是 idle', () => {
    const playing = settleAll(begin(['human', 'human', 'ai', 'ai']));
    expect(G.idle!(playing)).toBe(false);
    const s = done();
    expect(G.idle!(s)).toBe(true);
    expect(G.idle!(G.resume!(s))).toBe(true);
    expect(G.idle!(act(s, 1, { t: 'next', code: '123456' }))).toBe(true);
  });

  test('搭子战绩的输赢：这一场净赢为正算赢，平和输不算；按座位给', () => {
    const s = done();
    const nets = g(s, 0).result!.seats.map((x) => x.net);
    expect(matchWins(s)).toEqual(nets.map((n) => n > 0));
    expect(matchWins(s)).toContain(true);
  });

  test('到点没人点：收场', () => {
    const s = G.resume!(done());
    expect(s.ended).toBe(true);
    expect(G.over(s)).toBe(true);
    expect(G.apply(s, 0, { t: 'next', code: '123456' })).toEqual({ error: 'not_now' });
  });

  test('真人点了：记下新房间号和谁开的，大家看得到，这一间打完；只认第一次', () => {
    const s = act(done(), 1, { t: 'next', code: '123456' });
    expect(s.next).toEqual({ code: '123456', by: 1 });
    expect(G.view(s, 0).next).toEqual({ code: '123456', by: 1 });
    expect(G.over(s)).toBe(true);
    expect(G.apply(s, 0, { t: 'next', code: '654321' })).toEqual({ error: 'not_now' });
    // 不额外扣谁的钱
    expect(fx(s).some((e) => e.kind === 'debit')).toBe(false);
  });

  test('没打完、电脑座位都不能点；房间号只收 6 位数字', () => {
    const s = settleAll(begin(['human', 'human', 'ai', 'ai']));
    expect(G.apply(s, 0, { t: 'next', code: '123456' })).toEqual({ error: 'not_now' });
    expect(G.apply(done(), 2, { t: 'next', code: '123456' })).toEqual({ error: 'not_now' });
    for (const code of ['12345', '1234567', 'abcdef', '12345a', 123456, null, '../123'])
      expect(G.parse({ t: 'next', code })).toBeNull();
    expect(G.parse({ t: 'next', code: '000123' })).toEqual({ t: 'next', code: '000123' });
    expect(G.free!({ t: 'next', code: '000123' })).toBe(true);
  });
});

describe('好友房里电脑的互动（src/room/talk.ts）', () => {
  test('电脑连着出手推好几步也不漏胡；只有电脑座位发，编号合法', () => {
    // 一个只认事，一个认了再让电脑发（同一步只认一次）
    const eye = new RoomTalk(9);
    // 名场面（杠、自摸、杠上花、清一色）才起哄、各按概率：一场下来一个种子可能一次都没有，几个种子合起来数
    const talks = [9, 10, 11, 12, 13].map((x) => new RoomTalk(x));
    const talk = talks[0]!;
    let s = begin(['human', 'ai', 'ai', 'ai'], 'fun');
    let hus = 0;
    let kans = 0;
    let acts = 0;
    let now = 0;
    // 每 5 步看一次（像 kit 一批推好几步，onStep 只看到最后一步）
    for (let k = 0; !G.over(s) && k < 100_000; k++) {
      s = drive(s, 5);
      now += 10_000;
      const ms = eye.watch(s);
      hus += ms.filter((m) => m.k === 'hu').length;
      kans += ms.filter((m) => m.k === 'kan').length;
      for (const a of talks.flatMap((t) => t.step(s, now))) {
        acts++;
        expect(s.kinds[a.seat]).toBe('ai');
        expect(a.id >= 0 && a.id < EMOTES).toBe(true);
      }
    }
    const st = (s.g as XzState).history;
    expect(hus).toBe(st.reduce((n, h) => n + h.wins.length, 0));
    expect(kans).toBeGreaterThan(0);
    expect(eye.watch(s)).toEqual([]);
    // 真人冲电脑扔了东西（kit 的 botReact，60% 回应）：只有被冲着的电脑回，回一定是表情 + 有时回扔道具；扔 40 次总有回的。
    // 冲一家不高冷的电脑扔（高冷的性格本来就少回）
    const personas = (s.g as XzState).personas;
    const warm = [1, 2, 3].find((i) => PERSONAS[personas[i]!]!.fun !== 'cool')!;
    let back = 0;
    for (let i = 0; i < 40; i++) {
      for (const a of talk.reply(0, EMOTES - 4, warm, now + 60_000 + i * 1_600)) {
        back++;
        expect(a.seat).toBe(warm);
        expect(a.id >= 0 && a.id < EMOTES).toBe(true);
      }
    }
    expect(back).toBeGreaterThan(10);
    // 冲真人扔的、对大家说的，电脑不回
    expect(talk.reply(1, EMOTES - 4, 0, now + 200_000)).toEqual([]);
    expect(talk.reply(0, 0, undefined, now + 200_000)).toEqual([]);
    expect(acts).toBeGreaterThan(0);
  });
});

describe('钱包操作 id（src/game/ops.ts，审计高危）', () => {
  test('单机的一律带 solo- 前缀（已经带了不重复加）；好友房的永远不以 solo- 开头：浏览器造不出好友房的 id、借不到平台的去重', () => {
    expect(soloOp('op-000001')).toBe('solo-op-000001');
    expect(soloOp('solo-op-000001')).toBe('solo-op-000001');
    expect(soloOp('r0123456789abcdef-b0')).toBe('solo-r0123456789abcdef-b0');
    // 好友房里会出现的每一种：开局带入、被拒再带、离座结回、回来开新的一份、打完结回，几个房间号
    const ops: string[] = [];
    const record = (e: WalletEffect) => {
      ops.push(roomOp(e));
      return e.kind === 'debit' && e.seat === 2 && e.ref.endsWith('n1') ? { ok: false, error: 'no_funds', balance: 500 } : OK;
    };
    for (const k of [1, 2, 3]) {
      let s = settleAll(begin(['human', 'human', 'human', 'ai'], 'small', KEY.map((x, i) => (i === 0 ? x + k : x))), record);
      s = drive(s, 400, (x) => g(x, null).phase === 'turn' && x.n > 40);
      s = settleAll(G.seated!(s, 0, 'ai'), record);
      s = settleAll(drive(s, 2_000, (x) => !x.own[0]), record);
      s = settleAll(G.seated!(s, 0, 'human'), record);
      s = settleAll(drive(s), record);
    }
    expect(ops.length).toBeGreaterThan(12);
    for (const op of ops) {
      expect(op).toMatch(/^r[0-9a-f]{16}s[0-3]n\d+-[bc]\d+$/);
      expect(op.startsWith(SOLO_OP)).toBe(false);
    }
  });
});
