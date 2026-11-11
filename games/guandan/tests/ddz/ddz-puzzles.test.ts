import { describe, expect, it } from 'vitest';
import { dispatchDdz, type DdzAction, type DdzState } from '../../src/variants/doudizhu/core/index.ts';
import { ddzValue, enumerateDdz, interpretDdz } from '../../src/variants/doudizhu/core/index.ts';
import { DDZ_PUZZLES, parseCards } from '../../src/variants/doudizhu/puzzles/puzzles.ts';
import { bestReply, hint, legalActions, solve } from '../../src/variants/doudizhu/puzzles/solver.ts';
import { puzzleState } from '../../src/variants/doudizhu/puzzles/state.ts';

const sources = import.meta.glob('../../src/variants/doudizhu/puzzles/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const sigOf = (a: DdzAction): string => (a.type === 'play' ? a.cards.map(ddzValue).sort((x, y) => x - y).join(',') : 'pass');

/** 确定性的小随机数（只在测试里用，选着法用） */
function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

/** 暴力：这个人手牌的所有子集 + 不要，凡是 dispatchDdz 认的就是合法着法（用点数多重集去重） */
function bruteLegal(s: DdzState): Set<string> {
  const hand = s.hands[s.turn]!;
  const out = new Set<string>();
  for (let mask = 1; mask < 1 << hand.length; mask++) {
    const cards = hand.filter((_, i) => mask & (1 << i));
    const a: DdzAction = { type: 'play', seat: s.turn, cards };
    if (dispatchDdz(s, a).error === null) out.add(sigOf(a));
  }
  if (dispatchDdz(s, { type: 'pass', seat: s.turn }).error === null) out.add('pass');
  return out;
}

describe('关卡表', () => {
  it('约 20 关，id 连续、名字和提示不空', () => {
    expect(DDZ_PUZZLES).toHaveLength(20);
    DDZ_PUZZLES.forEach((p, i) => {
      expect(p.id).toBe(`p${String(i + 1).padStart(2, '0')}`);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.tip.length).toBeGreaterThan(0);
    });
    expect(new Set(DDZ_PUZZLES.map((p) => p.name)).size).toBe(DDZ_PUZZLES.length);
  });

  it('牌不重复、每家 ≤ 10 张、总数不超过一副', () => {
    for (const p of DDZ_PUZZLES) {
      const all = p.hands.flat();
      expect(new Set(all).size, p.id).toBe(all.length);
      expect(all.length, p.id).toBeLessThanOrEqual(54);
      expect(all.every((c) => c >= 0 && c < 54), p.id).toBe(true);
      for (const h of p.hands) {
        expect(h.length, p.id).toBeGreaterThan(0);
        expect(h.length, p.id).toBeLessThanOrEqual(10);
      }
    }
  });

  it('parseCards：花色自动补、明写的花色算数、超过四张或重复报错', () => {
    expect(parseCards('BJ SJ 2 2 A 10 7h')).toHaveLength(7);
    expect(new Set(parseCards('3 3 3 3')).size).toBe(4);
    expect(() => parseCards('3 3 3 3 3')).toThrow();
    expect(() => parseCards('3s 3s')).toThrow();
    expect(() => parseCards('X')).toThrow();
  });
});

describe('求解器', () => {
  it('每一关地主都有必胜的出法，求解总时长在几秒内', () => {
    const t0 = performance.now();
    // 断言按本进程用掉的 CPU 时间算，不按墙钟：机器满载时墙钟会被别的进程拉长（11-03 负载 32 时墙钟 12.4 秒），CPU 时间不会
    const cpu0 = process.cpuUsage();
    const rows: string[] = [];
    for (const p of DDZ_PUZZLES) {
      const t = performance.now();
      const sol = solve(puzzleState(p));
      rows.push(`${p.id} ${p.name} [${p.hands.map((h) => h.length).join('/')}] ${sol.plays}手 ${Math.round(performance.now() - t)}ms`);
      expect(sol.win, p.id).toBe(true);
      expect(sol.line, p.id).toBeDefined();
    }
    const cpu = process.cpuUsage(cpu0);
    const total = (cpu.user + cpu.system) / 1000;
    console.log(`${rows.join('\n')}\n求解总时长 ${Math.round(performance.now() - t0)}ms（CPU ${Math.round(total)}ms）`);
    expect(total).toBeLessThan(10000);
  }, 60_000); // 断言自己卡 10 秒 CPU；超时只防死循环，放宽到 60 秒，满载时墙钟拉长不算失败

  it('关卡由易到难：前 5 关 ≤ 3 手，后 3 关 ≥ 5 手，后半的牌比前半多', () => {
    const plays = DDZ_PUZZLES.map((p) => solve(puzzleState(p)).plays!);
    expect(Math.max(...plays.slice(0, 5))).toBeLessThanOrEqual(3);
    expect(Math.min(...plays.slice(-3))).toBeGreaterThanOrEqual(5);
    const cards = (ps: typeof DDZ_PUZZLES) => ps.reduce((n, p) => n + p.hands.flat().length, 0) / ps.length;
    expect(cards(DDZ_PUZZLES.slice(10))).toBeGreaterThan(cards(DDZ_PUZZLES.slice(0, 10)));
  });

  it('不是每个出法都赢：地主走错（先出会被压住的牌）确实会输', () => {
    const s = puzzleState(DDZ_PUZZLES[0]!);
    const lose = legalActions(s).filter((a) => !stillWins(s, a));
    expect(lose.length).toBeGreaterThan(0);
  });

  it('地主赢不了的局面：solve 说输，bestReply 给出的应对合法', () => {
    // 地主只剩一张 3，两家农民各有一张 A，轮到农民 1：农民直接出完
    const base = puzzleState(DDZ_PUZZLES[0]!);
    const s: DdzState = { ...base, hands: [[1], [12], [25]], turn: 1, trick: [{ seat: 0, play: interpretDdz([1])[0]! }] };
    expect(solve(s).win).toBe(false);
    const a = bestReply(s);
    expect(dispatchDdz(s, a).error).toBeNull();
    expect(dispatchDdz(s, a).state.phase).toBe('dealEnd');
  });
});

/** 走完这一步之后，地主还是必胜吗（这一步打完牌就看谁赢） */
function stillWins(s: DdzState, a: DdzAction): boolean {
  const n = dispatchDdz(s, a).state;
  return n.phase === 'play' ? solve(n).win : n.results[n.results.length - 1]!.landlordWon;
}

describe('puzzleState 和 dispatchDdz', { timeout: 60000 }, () => {
  it('用 hint 一路打到地主出完（农民用 bestReply），每一步 dispatchDdz 都接受', () => {
    for (const p of DDZ_PUZZLES) {
      let s = puzzleState(p);
      expect(s.phase).toBe('play');
      expect(s.turn).toBe(s.landlord);
      expect(s.bottom).toEqual([]);
      for (let guard = 0; s.phase === 'play' && guard < 80; guard++) {
        const a = s.turn === s.landlord ? hint(s) : bestReply(s);
        expect(a, `${p.id} 第 ${guard} 步`).not.toBeNull();
        const r = dispatchDdz(s, a!);
        expect(r.error, `${p.id} 第 ${guard} 步`).toBeNull();
        s = r.state;
      }
      expect(s.phase, p.id).toBe('dealEnd');
      expect(s.results[0]!.landlordWon, p.id).toBe(true);
      expect(s.results[0]!.landlord).toBe(0);
    }
  });

  it('地主随便走一步之后，只要还在必胜线上，hint 仍然给得出赢的着法', () => {
    const rnd = lcg(7);
    for (const p of DDZ_PUZZLES.slice(0, 10)) {
      let s = puzzleState(p);
      for (let guard = 0; s.phase === 'play' && guard < 80; guard++) {
        if (s.turn === s.landlord) {
          expect(solve(s).win, p.id).toBe(true);
          // 在所有仍然必胜的着法里随机挑一个，不总走最快的那条线
          const wins = legalActions(s).filter((a) => stillWins(s, a));
          expect(wins.length, p.id).toBeGreaterThan(0);
          s = dispatchDdz(s, wins[Math.floor(rnd() * wins.length)]!).state;
        } else {
          const acts = legalActions(s);
          s = dispatchDdz(s, acts[Math.floor(rnd() * acts.length)]!).state;
          // 农民乱走：地主没有因此失去必胜（农民最优应对是最坏情形，乱走只会更好）
        }
        if (s.phase === 'play' && s.turn === s.landlord) expect(solve(s).win, p.id).toBe(true);
      }
    }
  });

  it('solver 的合法着法和 dispatchDdz 一致（暴力枚举所有子集对拍），沿随机路线走下去', () => {
    const rnd = lcg(11);
    for (const p of DDZ_PUZZLES.filter((_, i) => i % 3 === 0)) {
      let s = puzzleState(p);
      for (let guard = 0; s.phase === 'play' && guard < 60; guard++) {
        const mine = new Set(legalActions(s).map(sigOf));
        const brute = bruteLegal(s);
        expect([...mine].sort(), `${p.id} 第 ${guard} 步`).toEqual([...brute].sort());
        const acts = legalActions(s);
        for (const a of acts) expect(dispatchDdz(s, a).error, `${p.id} ${JSON.stringify(a)}`).toBeNull();
        s = dispatchDdz(s, acts[Math.floor(rnd() * acts.length)]!).state;
      }
    }
  });

  it('枚举是完整的：enumerateDdz 给的每一手都在 solver 的着法里', () => {
    for (const p of DDZ_PUZZLES) {
      const s = puzzleState(p);
      const mine = new Set(legalActions(s).map(sigOf));
      for (const play of enumerateDdz(s.hands[0]!)) expect(mine.has(play.cards.map(ddzValue).sort((x, y) => x - y).join(',')), `${p.id}`).toBe(true);
    }
  });
});

describe('求解结果和暴力搜索一致（小牌局）', () => {
  /** 不用任何剪枝和记忆化，直接靠 dispatchDdz 的极小极大 */
  function naive(s: DdzState): boolean {
    if (s.phase !== 'play') return s.results[s.results.length - 1]!.landlordWon;
    const hand = s.hands[s.turn]!;
    const acts: DdzAction[] = [];
    for (let mask = 1; mask < 1 << hand.length; mask++) acts.push({ type: 'play', seat: s.turn, cards: hand.filter((_, i) => mask & (1 << i)) });
    acts.push({ type: 'pass', seat: s.turn });
    const next = acts.map((a) => dispatchDdz(s, a)).filter((r) => r.error === null).map((r) => naive(r.state));
    return s.turn === s.landlord ? next.some(Boolean) : next.every(Boolean);
  }

  it('随机发的 4/3/3 张牌，solve().win 和暴力一致', () => {
    const rnd = lcg(2026);
    let wins = 0;
    let losses = 0;
    for (let n = 0; n < 60; n++) {
      const deck = Array.from({ length: 54 }, (_, i) => i);
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [deck[i], deck[j]] = [deck[j]!, deck[i]!];
      }
      // 只用 3..8 和王，让对子、顺子、炸弹更常见
      const pool = deck.filter((c) => c % 54 >= 52 || (c % 13) + 2 <= 8);
      const sizes = [4, 3, 3];
      let at = 0;
      const hands = sizes.map((k) => pool.slice(at, (at += k)).sort((a, b) => a - b));
      const s = puzzleState({ id: 'x', name: '', tip: '', hands });
      const expected = naive(s);
      expect(solve(s).win, JSON.stringify(hands)).toBe(expected);
      if (expected) wins++;
      else losses++;
    }
    expect(wins).toBeGreaterThan(0);
    expect(losses).toBeGreaterThan(0);
  });
});

describe('残局闯关的核心保持纯逻辑', () => {
  it('puzzles/ 下的源码不碰随机数、时间、浏览器全局和画面层', () => {
    const files = Object.keys(sources);
    expect(files.length).toBeGreaterThanOrEqual(3);
    const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const forbidden: [RegExp, string][] = [
      [/Math\.random|Date\.now|new Date\b|performance\.now/, '随机数与时间'],
      [/Math\.(exp|log|log2|log10|pow|sin|cos|tan|atan2?|cbrt|hypot)\b/, '平台相关的数学函数'],
      [/[\w)\]]\s*\*\*\s*[\w(]/, '幂运算'],
      [/\b(window|document|localStorage|sessionStorage|navigator)\b/, '浏览器全局对象'],
      [/from\s+['"]phaser['"]|from\s+['"]\.\.?\/(\.\.\/)*(view|debug|platform)\b/, '画面层'],
      [/\bfetch\s*\(|WebSocket/, '网络'],
    ];
    for (const [path, raw] of Object.entries(sources)) {
      const code = strip(raw);
      for (const [re, why] of forbidden) expect(re.test(code), `${path}：${why}`).toBe(false);
    }
  });
});
