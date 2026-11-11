import { describe, expect, test } from 'vitest';
import { sichuanXuezhan as XZ, options, view, type XzOpts, type XzState } from '../src/core/variants/sichuan-xuezhan/index.ts';
import { seatsOf } from '../src/core/variants/sichuan-xuezhan/rules.ts';
import { wallLeft } from '../src/core/table/index.ts';
import { kindOf, suitOf, tileOf } from '../src/core/tiles/index.ts';
import { runAuto } from '../src/game/driver.ts';
import type { SeatKind } from '../src/core/variants/types.ts';

// 三人两房（DESIGN.md 第 13 节）：3 个人、筒条两门 72 张、不定缺；血战两家胡了就结束。四人局不受影响
const ALL_AI: SeatKind[] = ['ai', 'ai', 'ai', 'ai'];
const SETUP = { share: 2_000, base: 40, personas: [0, 1, 2, 4] };
const THREE: XzOpts = { ...XZ.defaults, rounds: 4, three: true, swap: false };

function playMatch(key: number[], opts: XzOpts, check?: (s: XzState) => void): XzState {
  let s = XZ.begin(key, opts, ALL_AI, SETUP) as XzState;
  for (let guard = 0; guard < 100; guard++) {
    for (const step of runAuto(XZ, s, ALL_AI.slice(0, seatsOf(opts)), 2_000)) {
      check?.(step.state as XzState);
      s = step.state as XzState;
    }
    if (XZ.over(s)) return s;
    s = XZ.resume(s);
  }
  throw new Error('match did not finish');
}

/** 72 张一张不多一张不少（胡的那张在点炮人的弃牌里记 taken；一炮多响同一张算进几家手里，多的减掉） */
function tilesConserved(s: XzState): void {
  if (s.phase === 'over' || s.phase === 'end') return;
  let n = wallLeft(s.wall);
  for (const p of s.players) n += p.hand.length + p.melds.reduce((a, m) => a + m.tiles.length, 0) + p.river.filter((r) => !r.taken).length;
  const groups = new Map<string, number>();
  for (const p of s.players) if (p.won && p.won.from !== null) groups.set(`${p.won.from}-${p.won.tile}`, (groups.get(`${p.won.from}-${p.won.tile}`) ?? 0) + 1);
  const dup = [...groups.values()].reduce((a, x) => a + x - 1, 0);
  expect(n - dup, `phase ${s.phase}`).toBe(72);
}

describe('三人两房', () => {
  test('3 个座位、只有筒条、不定缺；打得完，筹码总数不变，牌不多不少', () => {
    let wall = 0;
    let three = 0;
    for (let i = 0; i < 15; i++) {
      const s = playMatch([i, 3, 3, 3, 3, 3, 3, 3], THREE, (x) => {
        expect(x.players).toHaveLength(3);
        expect(x.chips.reduce((a, b) => a + b, 0)).toBe(6_000);
        expect(x.phase).not.toBe('que');
        expect(x.players.every((p) => p.que === -1)).toBe(true);
        for (const p of x.players) expect(p.hand.every((t) => suitOf(kindOf(t)) !== 0)).toBe(true);
        tilesConserved(x);
        // 花猪只有定缺才有：三人局不会出
        expect(x.ledger.some((p) => p.kind === 'pig')).toBe(false);
      });
      expect(s.phase).toBe('over');
      expect(s.kinds).toHaveLength(3);
      for (const h of s.history) {
        expect(h.net).toHaveLength(3);
        // 血战：两家胡了就结束（一炮多响两家同时胡也算）
        if (h.end === 'three') {
          three++;
          expect(new Set(h.wins.map((w) => w.seat)).size).toBe(2);
        } else wall++;
      }
    }
    expect(three).toBeGreaterThan(0);
    expect(wall).toBeGreaterThan(0);
  });

  test('换三张开着：只往上家、下家换，换完直接开打', () => {
    for (let i = 0; i < 6; i++) {
      let dirs = new Set<number>();
      playMatch([i, 4, 4, 4, 4, 4, 4, 4], { ...THREE, swap: true, rounds: 1 }, (x) => {
        if (x.swapDir !== null) dirs.add(x.swapDir);
        expect(x.phase).not.toBe('que');
      });
      for (const d of dirs) expect([0, 2]).toContain(d);
      dirs = new Set();
    }
  });

  test('同一把密钥、同一串操作，结果完全一样', () => {
    const a = playMatch([9, 9, 9, 9, 1, 2, 3, 4], THREE);
    const b = playMatch([9, 9, 9, 9, 1, 2, 3, 4], THREE);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test('视图不下发别家的暗牌和牌墙', () => {
    playMatch([5, 1, 2, 3, 4, 5, 6, 7], { ...THREE, rounds: 1 }, (x) => {
      if (x.phase !== 'turn' && x.phase !== 'claim') return;
      for (const seat of [0, 1, 2, null]) {
        const v = view(x, seat);
        expect(v.seats).toHaveLength(3);
        expect(JSON.stringify(v)).not.toContain('"key"');
        v.seats.forEach((st, j) => {
          if (j !== seat && !x.players[j]!.won) expect(st.hand ?? []).toEqual([]);
        });
      }
    });
  });

  test('查大叫：牌墙摸完时没听牌的两家各赔给听牌的那家（只在 3 个座位之间）', () => {
    // 两门牌、三个人，随机打几乎总是两家先胡完，摆一个流局的局面：庄家听 5 条，另两家没听
    const s = XZ.begin([1, 1, 1, 1, 1, 1, 1, 1], { ...THREE, rounds: 1 }, ALL_AI, SETUP) as XzState;
    const d = s.dealer;
    const t = (k: number, c = 0): number => tileOf(k, c);
    // 筒 1–9 是 9–17，条 1–9 是 18–26
    s.players[d]!.hand = [9, 10, 11, 12, 13, 14, 15, 16, 17].map((k) => t(k)).concat([t(18), t(18, 1), t(18, 2), t(22), t(26)]);
    const noten = [t(9, 1), t(11, 1), t(13, 1), t(15, 1), t(17, 1), t(19), t(21), t(23), t(25), t(10, 1), t(12, 1), t(14, 1), t(16, 1)];
    const noten2 = [t(9, 2), t(11, 2), t(13, 2), t(15, 2), t(17, 2), t(19, 1), t(21, 1), t(23, 1), t(25, 1), t(10, 2), t(12, 2), t(14, 2), t(16, 2)];
    const others = [1, 2].map((x) => (d + x) % 3);
    s.players[others[0]!]!.hand = noten;
    s.players[others[1]!]!.hand = noten2;
    s.wall = { ...s.wall, head: s.wall.tail + 1 };
    s.phase = 'turn';
    s.turn = d;
    const before = s.chips.slice();
    const next = XZ.apply(s, d, { t: 'discard', tile: t(26) }) as XzState;
    expect(next.phase).toBe('over');
    expect(next.history[0]!.end).toBe('wall');
    const cha = next.ledger.filter((x) => x.kind === 'cha');
    expect(cha.map((x) => x.from).sort()).toEqual([...others].sort());
    expect(cha.every((x) => x.to === d && x.amount > 0)).toBe(true);
    expect(next.chips.reduce((a, b) => a + b, 0)).toBe(before.reduce((a, b) => a + b, 0));
    expect(next.ledger.some((x) => x.kind === 'pig')).toBe(false);
  });

  test('四人局不变：选项里写 three: false 和不写，一场打下来一模一样', () => {
    const { three: _, ...old } = XZ.defaults;
    const a = playMatch([7, 7, 7, 7, 2, 2, 2, 2], { ...old, rounds: 4 } as XzOpts);
    const b = playMatch([7, 7, 7, 7, 2, 2, 2, 2], { ...XZ.defaults, rounds: 4, three: false });
    expect(a.history).toEqual(b.history);
    expect(a.chips).toEqual(b.chips);
    expect(a.players).toHaveLength(4);
  });

  test('房间选项收 three，不是布尔就拒', () => {
    expect(options({ three: true })?.three).toBe(true);
    expect(options({})?.three).toBe(false);
    expect(options({ three: 'yes' })).toBeNull();
  });
});
