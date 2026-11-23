// 接共用名册（arcade-kit/personas）的对拍：映射出来的性格和接名册前逐项一样，挑人和接名册前同种子同结果
import { ROSTER } from 'arcade-kit/personas';
import { type RandomStream, stream } from 'arcade-kit/rng';
import { describe, expect, test } from 'vitest';
import { PERSONAS, pickPersonas } from '../src/ai/personas.ts';
import { roomSeatPlan, seatPlan, VENUES } from '../src/ai/venues.ts';

// 接名册前 personas.ts 里写死的六个人（0.47.7）
const BEFORE = [
  { name: '幺妹儿', style: '快：见胡就胡，能碰就碰', defense: 350, greed: 0, kanLove: 300, pon: 900, slip: 50, reads: 250, temper: 300, swing: 300, tempo: 650, talk: 700, fun: 'rowdy', level: 1, skill: 0 },
  { name: '熊猫哥', style: '贪：爱做清一色、对对胡', defense: 200, greed: 950, kanLove: 500, pon: 450, slip: 60, reads: 200, temper: 600, swing: 500, tempo: 1_000, talk: 800, fun: 'normal', level: 1, skill: 0 },
  { name: '盖碗儿', style: '稳：守门清，少碰少杠', defense: 950, greed: 200, kanLove: 150, pon: 150, slip: 20, reads: 700, temper: 100, swing: 200, tempo: 1_350, talk: 250, fun: 'cool', level: 2, skill: 300 },
  { name: '兔头哥', style: '爱杠：能杠就杠，输了容易上头', defense: 300, greed: 400, kanLove: 1_000, pon: 600, slip: 60, reads: 300, temper: 700, swing: 500, tempo: 850, talk: 900, fun: 'rowdy', level: 1, skill: 0 },
  { name: '火锅婆婆', style: '老练：牌效和防守都细', defense: 750, greed: 350, kanLove: 400, pon: 450, slip: 0, reads: 1_000, temper: 0, swing: 250, tempo: 1_150, talk: 400, fun: 'cool', level: 3, skill: 1_000 },
  { name: '板凳儿', style: '新手：常打错，不太防守', defense: 50, greed: 100, kanLove: 600, pon: 700, slip: 300, reads: 0, temper: 900, swing: 800, tempo: 900, talk: 600, fun: 'normal', level: 0, skill: 0 },
];

// 接名册前的挑人（0.47.7 的 pickPersonas 原样）
function pickBefore(rng: RandomStream, weights: readonly number[], n: number): number[] {
  const pool = weights.map((w, i) => ({ i, w })).filter((x) => x.w > 0);
  const out: number[] = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((a, x) => a + x.w, 0);
    let r = rng.below(total);
    const at = pool.findIndex((x) => (r -= x.w) < 0);
    out.push(pool[at]!.i);
    pool.splice(at, 1);
  }
  while (out.length < n) out.push(out[0] ?? 0);
  return out;
}

describe('接共用名册', () => {
  test('六个人映射后的每个参数和接名册前一样', () => {
    expect(PERSONAS).toEqual(BEFORE);
  });

  test('名字都在名册里（平台保留昵称跟着名册走）', () => {
    const names = new Set(ROSTER.map((p) => p.name));
    expect(PERSONAS.every((p) => names.has(p.name))).toBe(true);
  });

  test('每个场地、每种座位数，挑人和接名册前同种子同结果（随机流用掉的也一样多）', () => {
    for (const v of Object.values(VENUES)) {
      for (const n of [1, 2, 3, 4]) {
        for (let k = 0; k < 200; k++) {
          const key = [k, n, 7, 1, 3, 5, 9, 2];
          const a = stream(key, 'persona');
          const b = stream(key, 'persona');
          expect(pickPersonas(a, v.weights, n)).toEqual(pickBefore(b, v.weights, n));
          expect(a.u32()).toBe(b.u32());
        }
      }
    }
  });

  test('房间和单机的座位计划（性格 + 这一场的状态）照旧确定', () => {
    const key = [3, 1, 4, 1, 5, 9, 2, 6];
    expect(seatPlan(stream(key, 'persona'), 'solo:lux', 3)).toEqual(seatPlan(stream(key, 'persona'), 'solo:lux', 3));
    const room = roomSeatPlan(stream(key, 'persona'), 'room:small', [true, false, true, false]);
    expect(new Set([room.personas[1], room.personas[3]]).size).toBe(2);
  });
});
