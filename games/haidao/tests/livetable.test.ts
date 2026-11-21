import { describe, expect, it } from 'vitest';
import { BOUNTY_LEVELS } from '../src/content/bountylevels.ts';
import { ESCORT_LIVE_LEVELS } from '../src/content/escortlivelevels.ts';
import { LIVE_STAKE, LIVE_TABLE, STREAK_LADDER, STREAK_PASS, type LiveKind } from '../src/content/livetable.ts';
import { TD_LIVE_ISLANDS } from '../src/content/tdlive.ts';
import { ESCORT_LIVE_ZERO_MAX_BP } from '../src/core/escortlive.ts';
import { LIVE_MAX_BP, LIVE_TIER_IDS, livePick, liveTopBp, streakBp, streakPassed, streakSeed, streakSetup } from '../src/core/live.ts';
import { MAP_LIVE_ZERO_MAX_BP } from '../src/core/maplive.ts';
import { TD_LIVE_ZERO_MAX_BP } from '../src/core/tdlive.ts';

/** 四种实盘的一张表（content/livetable.ts）：形状、economy.md 第 2 节的边界、抽关规则 */
const KINDS: LiveKind[] = ['live', 'td', 'escort', 'map'];
/** 0 星最多回多少：悬赏出海 0 星最多拆到 49%，其余三种是满值本身（再封 0.79 份） */
const zeroTop = (kind: LiveKind, bp0: number): number => (kind === 'live' ? Math.floor((bp0 * 49) / 100) : bp0);
const ZERO_CAP: Record<LiveKind, number> = { live: LIVE_MAX_BP, td: TD_LIVE_ZERO_MAX_BP, escort: ESCORT_LIVE_ZERO_MAX_BP, map: MAP_LIVE_ZERO_MAX_BP };
const EXISTS: Record<LiveKind, (id: string) => boolean> = {
  live: (id) => BOUNTY_LEVELS.some((l) => l.id === id),
  td: (id) => id in TD_LIVE_ISLANDS,
  escort: (id) => ESCORT_LIVE_LEVELS.some((l) => l.id === id),
  map: (id) => id === 'route',
};

describe.each(KINDS)('%s 实盘表', (kind) => {
  it('每关：0 星最多回的 < 1 星 < 2 星 < 3 星 ≤ 3 份，3 星赢钱；关都在冻结副本里、池里不重复', () => {
    for (const t of LIVE_TIER_IDS) {
      const pool = LIVE_TABLE[kind][t].pool;
      expect(pool.length).toBeGreaterThan(0);
      expect(new Set(pool.map((p) => p.level)).size).toBe(pool.length);
      for (const { level, bp } of pool) {
        expect(EXISTS[kind](level), `${kind} ${t} ${level}`).toBe(true);
        expect(bp[0]).toBeLessThanOrEqual(ZERO_CAP[kind]);
        expect(zeroTop(kind, bp[0])).toBeLessThan(bp[1]);
        expect(bp[1]).toBeLessThan(bp[2]);
        expect(bp[2]).toBeLessThan(bp[3]);
        expect(bp[3]).toBeGreaterThan(10_000);
        expect(bp[3]).toBeLessThanOrEqual(LIVE_MAX_BP);
      }
    }
  });
  it('档越高三星不降（池里最低、最高的三星都不比低一档的低）', () => {
    for (let i = 1; i < LIVE_TIER_IDS.length; i++) {
      const b3 = (j: number): number[] => LIVE_TABLE[kind][LIVE_TIER_IDS[j]!].pool.map((p) => p.bp[3]);
      expect(Math.min(...b3(i))).toBeGreaterThanOrEqual(Math.min(...b3(i - 1)));
      expect(Math.max(...b3(i))).toBeGreaterThanOrEqual(Math.max(...b3(i - 1)));
    }
  });
});

describe('抽关', () => {
  it('四档一份的金额', () => {
    expect(LIVE_STAKE).toEqual({ small: 2_000, mid: 10_000, big: 50_000, lux: 200_000 });
  });
  it('种子最低位只管镜像：相邻的一对种子抽到同一关；池里每一关都抽得到，抽法均匀', () => {
    const N = 4000;
    for (const kind of KINDS) {
      for (const t of LIVE_TIER_IDS) {
        const pool = LIVE_TABLE[kind][t].pool;
        const hit = new Map<string, number>();
        for (let s = 0; s < 2 * N; s += 2) {
          expect(livePick(kind, t, s)).toBe(livePick(kind, t, s + 1));
          const id = livePick(kind, t, s).level;
          hit.set(id, (hit.get(id) ?? 0) + 1);
        }
        for (const p of pool) expect(Math.abs((hit.get(p.level) ?? 0) / N - 1 / pool.length), `${kind} ${t} ${p.level}`).toBeLessThan(0.03);
      }
    }
  });
  it('抽到哪一关和种子 % 4（机器人挑登陆边）无关：每关四种余数都有', () => {
    for (const t of LIVE_TIER_IDS) {
      const seen = new Map<string, Set<number>>();
      for (let s = 0; s < 400; s++) {
        const id = livePick('live', t, s).level;
        if (!seen.has(id)) seen.set(id, new Set());
        seen.get(id)!.add(s % 4);
      }
      for (const set of seen.values()) expect(set.size).toBe(4);
    }
  });
  it('最多赢多少按池里最高的三星算', () => {
    for (const kind of KINDS) for (const t of LIVE_TIER_IDS) expect(liveTopBp(kind, t)).toBe(Math.max(...LIVE_TABLE[kind][t].pool.map((p) => p.bp[3])));
  });
  it('种子取 32 位全范围也落在池里', () => {
    for (const kind of KINDS) for (const t of LIVE_TIER_IDS) expect(livePick(kind, t, 0xffffffff)).toBeDefined();
  });
});

describe('悬赏连闯', () => {
  it('同档：过得越多收手拿得越多；没过总比上一座收手少；第一座就没过算输；三座全过 ≤ 3 份、赢钱', () => {
    for (const t of LIVE_TIER_IDS) {
      const { win, fail } = STREAK_LADDER[t];
      expect(win[0]).toBeLessThan(win[1]);
      expect(win[1]).toBeLessThan(win[2]);
      expect(fail[0]).toBeLessThan(fail[1]);
      expect(fail[1]).toBeLessThan(fail[2]);
      expect(fail[0]).toBeLessThan(10_000);
      expect(fail[1]).toBeLessThan(win[0]);
      expect(fail[0]).toBeLessThanOrEqual(6_000);
      expect(fail[2]).toBeLessThan(win[1]);
      expect(win[2]).toBeGreaterThan(10_000);
      expect(win[2]).toBeLessThanOrEqual(LIVE_MAX_BP);
    }
  });
  it('streakBp：收手按 win、没过按 fail，三座全过不管收不收手都是 win[2]；过 0 座收手等于没过', () => {
    const L = STREAK_LADDER.mid;
    expect(streakBp('mid', 0, false)).toBe(L.fail[0]);
    expect(streakBp('mid', 0, true)).toBe(L.fail[0]);
    expect(streakBp('mid', 1, true)).toBe(L.win[0]);
    expect(streakBp('mid', 2, false)).toBe(L.fail[2]);
    expect(streakBp('mid', 3, false)).toBe(L.win[2]);
    expect(streakBp('mid', 9, true)).toBe(L.win[2]);
  });
  it('三座各自抽关、各自镜像，只由带入的种子决定', () => {
    const seeds = [0, 1, 2].map((i) => streakSeed(12_345, i));
    expect(new Set(seeds).size).toBe(3);
    expect(streakSetup('big', 12_345, 2)).toEqual(streakSetup('big', 12_345, 2));
    expect(streakSetup('big', 12_345, 1).seed).toBe(seeds[1]);
  });
  it('1 星以上算过', () => {
    expect(STREAK_PASS).toBe(1);
    expect(streakPassed({ stars: 1 })).toBe(true);
    expect(streakPassed({ stars: 0 })).toBe(false);
  });
});

