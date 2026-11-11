/**
 * 斗地主「明牌」玩法的规则核心和电脑：开关关时和以前逐位相同、亮牌后倍数 ×2、超时不亮、视图公开地主的牌但不泄漏农民的牌、
 * 电脑强牌亮弱牌不亮、农民看着公开的牌也能打完整局、同种子同操作结果相同。
 */
import { describe, expect, it } from 'vitest';
import { makeCard } from '../../src/core/cards.ts';
import { decideDdz, shouldShowDdz } from '../../src/variants/doudizhu/ai/index.ts';
import {
  DDZ_BID_MS, type DdzAction, type DdzState, actorsDdz, createDdz, currentMult, dispatchDdz, replayDdz, sortDdz, timeoutDdz, turnMsDdz, viewDdz,
} from '../../src/variants/doudizhu/core/index.ts';
import { parseDdzAction } from '../../src/variants/doudizhu/net/rules.ts';

const c = (rank: number, suit = 0) => makeCard(rank, suit);

function must(s: DdzState, a: DdzAction): DdzState {
  const r = dispatchDdz(s, a);
  expect(r.error, JSON.stringify(a)).toBeNull();
  return r.state;
}

/** 摆一个明牌阶段的局面：地主 landlord 手里是 landlordHand，剩下的牌平分给两个农民 */
function showing(landlordHand: number[], landlord = 0, bid = 1): DdzState {
  const base = createDdz('ming-fix', { deals: 6, mingpai: true }).state;
  const rest = Array.from({ length: 54 }, (_, i) => i).filter((x) => !landlordHand.includes(x));
  const farmers = [0, 1, 2].filter((x) => x !== landlord);
  const hands: number[][] = [[], [], []];
  hands[landlord] = sortDdz(landlordHand);
  hands[farmers[0]!] = sortDdz(rest.slice(0, 17));
  hands[farmers[1]!] = sortDdz(rest.slice(17));
  return { ...base, phase: 'show', landlord, bid, turn: landlord, hands, bottom: landlordHand.slice(0, 3), bids: [null, null, null] };
}

const STRONG = [c(16), c(17), ...[0, 1, 2, 3].flatMap((s) => [c(2, s), c(14, s), c(13, s), c(12, s)]), c(11, 0), c(11, 1)];
/** 3 到 Q 的十个对子：一手连对，牌力很低 */
const WEAK = Array.from({ length: 10 }, (_, i) => [c(3 + i, 0), c(3 + i, 1)]).flat();

/** FNV 哈希：一整局的状态（不含 opts，那里 mingpai: false 本来就多一个键）、事件、四个视角的视图、actors、turnMs 逐步混进去 */
function transcriptHash(opts: { mingpai?: boolean }): number {
  let h = 2166136261;
  const mix = (x: unknown) => {
    const t = JSON.stringify(x);
    for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619) >>> 0;
  };
  for (const [seed, lv] of [['t1', 'normal'], ['t2', 'pro'], ['t3', 'novice'], ['t4', 'normal']] as const) {
    let s = createDdz(seed, { deals: 2, ...opts }).state;
    mix({ ...s, opts: 0 });
    for (let g = 0; g < 3000 && s.phase !== 'gameOver'; g++) {
      const a: DdzAction = s.phase === 'dealEnd' ? { type: 'next' } : decideDdz(viewDdz(s, s.turn), lv, `${seed}/x`)!;
      const r = dispatchDdz(s, a);
      expect(r.error).toBeNull();
      s = r.state;
      mix([{ ...r.state, opts: 0 }, r.events, [0, 1, 2, -1].map((q) => viewDdz(s, q)), actorsDdz(s), turnMsDdz(s)]);
    }
  }
  return h;
}

describe('开关关着：和加明牌之前逐位相同', () => {
  // 这个数是在加明牌之前的代码上算出来的（同一段脚本跑旧提交），之后不许变
  const BEFORE = 1496214349;
  it('不带 mingpai 的整局（状态、事件、视图、actors、turnMs）哈希不变', () => {
    expect(transcriptHash({})).toBe(BEFORE);
  });
  it('mingpai: false 同样', () => {
    expect(transcriptHash({ mingpai: false })).toBe(BEFORE);
  });
  it('没有 show 阶段、没有 ming 字段', () => {
    let s = createDdz('off', { deals: 1 }).state;
    for (let g = 0; g < 3000 && s.phase !== 'gameOver'; g++) {
      expect(s.phase).not.toBe('show');
      s = must(s, decideDdz(viewDdz(s, s.turn), 'normal', 'off')!);
      expect('ming' in s).toBe(false);
    }
    expect('ming' in s.results[0]!).toBe(false);
    const v = viewDdz(s, 0);
    expect('ming' in v).toBe(false);
    expect('mingHand' in v).toBe(false);
  });
  it('关着时 show 动作不被接受', () => {
    const s = createDdz('off2').state;
    expect(dispatchDdz(s, { type: 'show', seat: s.turn, open: true }).error).toBe('not_show');
  });
});

describe('明牌阶段', () => {
  it('叫分结束、地主拿底牌后进 show：只有地主动，叫分和出牌都不行', () => {
    let s = createDdz('ming-flow', { deals: 1, mingpai: true }).state;
    s = must(s, { type: 'bid', seat: s.turn, bid: 3 });
    expect(s.phase).toBe('show');
    expect(s.landlord).toBe(s.turn);
    expect(s.hands[s.landlord]!.length).toBe(20);
    expect(actorsDdz(s).seats).toEqual([s.landlord]);
    expect(actorsDdz(s).group).toBe(`show-1-${s.step}`);
    expect(turnMsDdz(s)).toBe(DDZ_BID_MS);
    const other = (s.landlord + 1) % 3;
    expect(dispatchDdz(s, { type: 'show', seat: other, open: true }).error).toBe('not_your_turn');
    expect(dispatchDdz(s, { type: 'bid', seat: s.landlord, bid: 3 }).error).toBe('not_bidding');
    expect(dispatchDdz(s, { type: 'play', seat: s.landlord, cards: [s.hands[s.landlord]![0]!] }).error).toBe('not_playing');
    expect(dispatchDdz(s, { type: 'pass', seat: s.landlord }).error).toBe('not_playing');
    expect(dispatchDdz(s, { type: 'show', seat: s.landlord, open: 'yes' as unknown as boolean }).error).toBe('bad_show');
  });
  it('亮牌和不亮都进出牌阶段，地主先出，事件里有 show', () => {
    const s0 = showing(STRONG);
    const r1 = dispatchDdz(s0, { type: 'show', seat: 0, open: true });
    expect(r1.events).toEqual([{ type: 'show', seat: 0, open: true }]);
    expect(r1.state.phase).toBe('play');
    expect(r1.state.turn).toBe(0);
    expect(r1.state.ming).toBe(true);
    const r2 = dispatchDdz(s0, { type: 'show', seat: 0, open: false });
    expect(r2.events).toEqual([{ type: 'show', seat: 0, open: false }]);
    expect(r2.state.phase).toBe('play');
    expect('ming' in r2.state).toBe(false);
    expect(dispatchDdz(r1.state, { type: 'show', seat: 0, open: true }).error).toBe('not_show');
  });
  it('三家都不叫连着 3 次后自动当地主，也要过 show', () => {
    let s = createDdz('ming-redeal', { deals: 1, mingpai: true }).state;
    for (let g = 0; g < 12 && s.phase === 'bid'; g++) s = must(s, { type: 'bid', seat: s.turn, bid: 0 });
    expect(s.phase).toBe('show');
    expect(s.redeal).toBe(3);
  });
  it('下一副重新叫分，上一副的明牌标记不带过去', () => {
    let s = showing([c(3)], 0);
    s = { ...s, ming: true, phase: 'play', hands: [[c(3)], [c(4)], [c(5)]] };
    s = must(s, { type: 'play', seat: 0, cards: [c(3)] });
    expect(s.phase).toBe('dealEnd');
    s = must(s, { type: 'next' });
    expect('ming' in s).toBe(false);
    expect(s.phase).toBe('bid');
  });
});

describe('计分', () => {
  /** 亮牌后地主出完最后一手：农民一手没出，春天 */
  const finish = (s: DdzState, open: boolean): DdzState => {
    let t = must({ ...s, hands: s.hands.map((h, i) => (i === s.landlord ? [c(3)] : h)) }, { type: 'show', seat: s.landlord, open });
    t = must(t, { type: 'play', seat: t.landlord, cards: [c(3)] });
    return t;
  };
  it('亮牌 ×2，和春天相乘；结果里写明明牌', () => {
    const s = finish(showing(STRONG, 0, 2), true);
    expect(s.results[0]).toMatchObject({ bid: 2, spring: 'spring', ming: true, mult: 4, s: 8 });
    expect(s.results[0]!.delta).toEqual([16, -8, -8]);
  });
  it('不亮：倍数照旧，结果里 ming 为 false（开了玩法的局才有这个字段）', () => {
    const s = finish(showing(STRONG, 0, 2), false);
    expect(s.results[0]).toMatchObject({ spring: 'spring', ming: false, mult: 2, s: 4 });
  });
  it('亮牌 + 炸弹 + 农民赢：三个倍数相乘，地主输得更多', () => {
    const base = showing(STRONG, 0, 3);
    let s: DdzState = { ...base, phase: 'play', ming: true, bombs: 1, turn: 1, hands: [[c(9), c(10)], [c(4)], [c(6)]], handsPlayed: [2, 0, 0] };
    expect(currentMult(s)).toBe(4);
    s = must(s, { type: 'play', seat: 1, cards: [c(4)] });
    expect(s.results[0]).toMatchObject({ landlordWon: false, bombs: 1, ming: true, spring: null, mult: 4, s: 12 });
    expect(s.results[0]!.delta).toEqual([-24, 12, 12]);
  });
  it('每副封顶仍然生效', () => {
    const base = showing(STRONG, 0, 3);
    const s = finish({ ...base, opts: { ...base.opts, dealCap: 5 } }, true);
    expect(s.results[0]).toMatchObject({ mult: 4, s: 5 });
  });
});

describe('超时', () => {
  it('明牌阶段超时 = 不亮牌；不是自己的回合不动', () => {
    const s = showing(STRONG, 1);
    expect(timeoutDdz(viewDdz(s, 1))).toEqual({ type: 'show', seat: 1, open: false });
    expect(timeoutDdz(viewDdz(s, 0))).toBeNull();
    const t = must(s, timeoutDdz(viewDdz(s, 1))!);
    expect(t.phase).toBe('play');
    expect('ming' in t).toBe(false);
  });
});

describe('视图：公开地主的手牌，不泄漏别人的', () => {
  it('没亮牌：任何座位（含旁观）都没有 ming / mingHand，看不到地主手牌', () => {
    for (const s of [showing(STRONG, 0), must(showing(STRONG, 0), { type: 'show', seat: 0, open: false })]) {
      for (const seat of [0, 1, 2, -1]) {
        const v = viewDdz(s, seat);
        expect('ming' in v).toBe(false);
        expect('mingHand' in v).toBe(false);
        if (seat !== 0) {
          expect(v.hand.filter((x) => s.hands[0]!.includes(x))).toEqual([]);
        }
      }
    }
  });
  it('亮牌后：地主自己、两个农民和旁观都看到地主现在的手牌，随出牌更新', () => {
    let s = must(showing(STRONG, 0), { type: 'show', seat: 0, open: true });
    for (const seat of [0, 1, 2, -1]) {
      const v = viewDdz(s, seat);
      expect(v.ming).toBe(true);
      expect(v.mingHand).toEqual(s.hands[0]);
    }
    const first = s.hands[0]![0]!;
    s = must(s, { type: 'play', seat: 0, cards: [first] });
    for (const seat of [0, 1, 2, -1]) expect(viewDdz(s, seat).mingHand).toEqual(s.hands[0]);
    expect(viewDdz(s, 1).mingHand).not.toContain(first);
  });
  it('亮牌后农民和旁观仍看不到另一个农民的手牌', () => {
    const s = must(showing(STRONG, 0), { type: 'show', seat: 0, open: true });
    const hidden = new Set(s.hands[2]!);
    for (const seat of [1, -1]) {
      const v = viewDdz(s, seat);
      const shown = [...v.hand, ...(v.mingHand ?? []), ...v.bottom, ...v.played, ...v.trick.flatMap((t) => t.play?.cards ?? [])];
      expect(shown.filter((x) => hidden.has(x))).toEqual([]);
      expect(v.counts[2]).toBe(17);
    }
    // 农民 2 自己的视图看不到农民 1 的牌
    const mine1 = new Set(s.hands[1]!);
    const v2 = viewDdz(s, 2);
    expect([...v2.hand, ...(v2.mingHand ?? [])].filter((x) => mine1.has(x))).toEqual([]);
  });
  it('视图是副本，改它不影响状态', () => {
    const s = must(showing(STRONG, 0), { type: 'show', seat: 0, open: true });
    const v = viewDdz(s, 1);
    v.mingHand!.length = 0;
    expect(s.hands[0]!.length).toBe(20);
  });
});

describe('电脑：要不要亮牌', () => {
  it('强牌亮（三档里新手只是偶尔），弱牌不亮', () => {
    const strong = showing(STRONG, 0);
    const weak = showing(WEAK, 0);
    for (const lv of ['normal', 'pro'] as const) {
      expect(decideDdz(viewDdz(strong, 0), lv, 'x')).toEqual({ type: 'show', seat: 0, open: true });
      expect(decideDdz(viewDdz(weak, 0), lv, 'x')).toEqual({ type: 'show', seat: 0, open: false });
    }
    expect(decideDdz(viewDdz(weak, 0), 'novice', 'x')).toEqual({ type: 'show', seat: 0, open: false });
    let opened = 0;
    for (let i = 0; i < 400; i++) if (shouldShowDdz(viewDdz(strong, 0), 'novice', `n${i}`)) opened++;
    expect(opened).toBeGreaterThan(40);
    expect(opened).toBeLessThan(220);
  });
  it('不是自己的回合不动；同一视图同一种子结果相同', () => {
    const s = showing(STRONG, 0);
    expect(decideDdz(viewDdz(s, 1), 'pro', 'x')).toBeNull();
    for (let i = 0; i < 20; i++) expect(shouldShowDdz(viewDdz(s, 0), 'novice', `k${i}`)).toBe(shouldShowDdz(viewDdz(s, 0), 'novice', `k${i}`));
  });
  it('电脑只读视图：不同的农民手牌、同一个地主视图，决定相同', () => {
    const a = showing(STRONG, 0);
    const b = { ...a, hands: [a.hands[0]!, a.hands[2]!, a.hands[1]!] };
    expect(decideDdz(viewDdz(a, 0), 'pro', 's')).toEqual(decideDdz(viewDdz(b, 0), 'pro', 's'));
  });
});

describe('整局：电脑打完带明牌阶段的牌，无非法动作、无死锁、零和', () => {
  it('三档混打，地主亮牌时农民读公开的牌也能打完', () => {
    const levels = ['novice', 'normal', 'pro'] as const;
    let ming = 0;
    for (let i = 0; i < 30; i++) {
      let s = createDdz(`ming-full-${i}`, { deals: 1, mingpai: true }).state;
      let forced = false;
      for (let g = 0; g < 3000 && s.phase !== 'gameOver'; g++) {
        const lv = levels[(i + s.turn) % 3]!;
        // 前一半的局强制亮牌，保证农民那条路径被走到
        let a = decideDdz(viewDdz(s, s.turn), lv, `f${i}`)!;
        if (s.phase === 'show' && i % 2 === 0) a = { type: 'show', seat: s.turn, open: true };
        if (s.phase === 'show' && a.type === 'show' && a.open) forced = true;
        s = must(s, a);
      }
      expect(s.phase).toBe('gameOver');
      if (forced) ming++;
      const r = s.results[0]!;
      expect(r.delta.reduce((x, y) => x + y, 0)).toBe(0);
      expect(r.ming).toBe(forced);
    }
    expect(ming).toBeGreaterThanOrEqual(15);
  }, 20_000); // 30 整局，单独跑约 3 秒；不卡时长，超时只防死循环
  it('同种子同操作：回放得到逐位相同的状态', () => {
    const actions: DdzAction[] = [];
    let s = createDdz('ming-replay', { deals: 1, mingpai: true }).state;
    for (let g = 0; g < 3000 && s.phase !== 'gameOver'; g++) {
      const a = s.phase === 'show' ? ({ type: 'show', seat: s.turn, open: true } as const) : decideDdz(viewDdz(s, s.turn), 'normal', 'r')!;
      actions.push(a);
      s = must(s, a);
    }
    expect(JSON.stringify(replayDdz('ming-replay', { deals: 1, mingpai: true }, actions))).toBe(JSON.stringify(s));
    expect(s.results[0]!.ming).toBe(true);
  });
});

describe('联机动作的解析', () => {
  it('show 认布尔 open，其余不认', () => {
    expect(parseDdzAction({ type: 'show', open: true })).toEqual({ type: 'show', open: true });
    expect(parseDdzAction({ type: 'show', open: false })).toEqual({ type: 'show', open: false });
    expect(parseDdzAction({ type: 'show', open: 1 })).toBeNull();
    expect(parseDdzAction({ type: 'show' })).toBeNull();
  });
});
