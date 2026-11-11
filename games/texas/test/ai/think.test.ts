/**
 * 电脑想多久（src/ai/think.ts，docs/ai.md 4.7 第 4 节）：快慢随局面和性格变，但绝不能透露牌力。
 * 反事实对照和 test/fair.test.ts 一个思路：公开的局面一样、只换底牌，同一条随机流下的想的时间必须逐个相等
 * （逐个相等就是分布完全一样，比"统计上差不多"强）。
 */
import { stream } from 'arcade-kit/rng';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { thinkMs } from '../../src/ai/think.ts';
import { PERSONAS } from '../../src/ai/personas.ts';
import { view, type View } from '../../src/core/view.ts';
import { runBots } from '../support/bots.ts';
import { SEED } from '../support/helpers.ts';

/** 机器人对打里收集各种局面的视图（翻牌前后、有没有人下注都有） */
function spots(n: number, size = 6): View[] {
  const out: View[] = [];
  runBots({
    seed: SEED,
    size,
    hands: 600,
    chaos: false,
    onStep: (t) => {
      if (t.toAct !== null && out.length < n && t.handNo % 2 === 0) out.push(view(t, t.toAct));
    },
  });
  return out;
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('思考时间不泄露牌力', () => {
  it('同一个公开局面、换成别的底牌：同一条随机流下，想的时间逐个相等（分布一样）', () => {
    const vs = spots(400);
    expect(vs.length).toBe(400);
    let checked = 0;
    for (const [i, v] of vs.entries()) {
      for (let k = 0; k < 8; k++) {
        // 8 条不同的流各抽一次；换底牌用任意别的两张（连是不是和公共牌重复都不管，更狠）
        const a = thinkMs(v, stream(SEED, 'think', i * 8 + k));
        for (const hole of [v.hole.map((c) => (c + 7) % 52), v.hole.map((c) => (c + 23) % 52), []]) {
          const b = thinkMs({ ...v, hole }, stream(SEED, 'think', i * 8 + k));
          expect(b, `局面 ${i} 流 ${k}`).toBe(a);
          checked++;
        }
      }
    }
    expect(checked).toBe(400 * 8 * 3);
  });

  it('同一个座位、同一个公开局面，不同的牌力（赢面从很弱到很强）想的时间序列相同', () => {
    // 连续决定 200 次共用一条流：序列逐个相等，说明每次调用抽的数也和牌无关（不会因为牌错位）
    const v = spots(60).find((x) => x.board.length >= 3 && x.legal!.call > 0)!;
    expect(v).toBeTruthy();
    const run = (hole: number[]): number[] => {
      const r = stream(SEED, 'think-seq');
      return Array.from({ length: 200 }, () => thinkMs({ ...v, hole }, r));
    };
    const base = run(v.hole);
    expect(run([0, 1])).toEqual(base);
    expect(run([51, 50])).toEqual(base);
  });

  it('源码里没有底牌、牌力、胜率：think.ts 不引用 hole / equity / eval / 蒙特卡洛', () => {
    const src = readFileSync(new URL('../../src/ai/think.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(src).not.toMatch(/hole|equity|eval|preflop|\.deck|\.seed/);
  });

  it('阳性对照：故意按牌力想的时间，同样的对照抓得出来', () => {
    const vs = spots(120);
    const cheat = (v: View, r: ReturnType<typeof stream>): number => thinkMs(v, r) + (v.hole[0]! % 13) * 100;
    let differ = 0;
    for (const [i, v] of vs.entries()) if (cheat(v, stream(SEED, 'think', i)) !== cheat({ ...v, hole: v.hole.map((c) => (c + 7) % 52) }, stream(SEED, 'think', i))) differ++;
    expect(differ).toBeGreaterThan(vs.length * 0.5);
  });
});

describe('思考时间像人：随局面和性格变', () => {
  const sample = (v: View, persona: number, n = 400): number[] => {
    const seats = v.seats.map((x, j) => (j === v.me ? { ...x, persona } : x));
    return Array.from({ length: n }, (_, i) => thinkMs({ ...v, seats }, stream(SEED, 'think-dist', i)));
  };
  const vs = spots(400);
  // 局面都从真实的一手里改出来：同一个座位、同一个池子，只改要跟多少、是不是翻牌前
  const mid = vs.find((v) => v.board.length >= 3 && v.legal!.call > 0 && v.legal!.call * 3 < v.seats[v.me!]!.stack && v.legal!.call < v.pot)!;
  const owing = (v: View, owe: number): View => ({ ...v, currentBet: v.seats[v.me!]!.bet + owe });
  const easy = { ...owing(mid, mid.bb), board: [] };
  const hard = owing(mid, mid.pot * 2);

  it('顺手的局面很快，难的局面更久；同一个局面每次不一样', () => {
    expect(!!mid).toBe(true);
    for (const p of [0, 3, 6]) {
      const e = sample(easy, p);
      const m = sample(mid, p);
      const h = sample(hard, p);
      expect(Math.max(...e)).toBeLessThanOrEqual(300 * 1.25);
      expect(mean(h)).toBeGreaterThan(mean(m));
      expect(mean(m)).toBeGreaterThan(mean(e) * 1.5);
      expect(new Set(m).size).toBeGreaterThan(50);
      expect(Math.max(...h)).toBeLessThanOrEqual(3_000 * 1.25);
      expect(Math.min(...h)).toBeGreaterThan(120);
    }
  });

  it('能过牌（要跟的钱是 0）时每家最多想 0.6 秒；要跟钱的局面不受这条限制', () => {
    const free = owing(mid, 0);
    for (const p of [0, 3, 9]) {
      expect(Math.max(...sample(free, p, 600))).toBeLessThanOrEqual(600);
      expect(Math.max(...sample({ ...free, board: [] }, p, 600))).toBeLessThanOrEqual(600);
    }
    expect(Math.max(...sample(hard, 3, 600))).toBeGreaterThan(600);
  });

  it('性格拉得开：慢慢、小白比阿飙、虎子慢；阿飙、虎子常一把梭，慢慢偶尔想很久', () => {
    const [wen, biao, , man, , , hu, , , bai] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => sample(mid, p, 600));
    console.log(`中等局面平均想的时间（毫秒）：${PERSONAS.map((p, i) => `${p.name} ${Math.round(mean(sample(mid, i, 600)))}`).join('、')}`);
    expect(mean(man!)).toBeGreaterThan(mean(biao!) * 1.25);
    expect(mean(bai!)).toBeGreaterThan(mean(hu!) * 1.25);
    expect(mean(man!)).toBeGreaterThan(mean(wen!));
    const snaps = (xs: number[]): number => xs.filter((x) => x < 300).length;
    expect(snaps(hu!)).toBeGreaterThan(snaps(man!) * 3);
    const tanks = (xs: number[]): number => xs.filter((x) => x > 1_200).length;
    expect(tanks(man!)).toBeGreaterThan(tanks(biao!));
  });

  it('这一场的快慢状态（form 第 4 项）按比例缩放', () => {
    const slow = sample({ ...mid, form: [0, 0, 1000, 1250] }, 4);
    const fast = sample({ ...mid, form: [0, 0, 1000, 800] }, 4);
    expect(mean(slow)).toBeGreaterThan(mean(fast) * 1.4);
  });
});
