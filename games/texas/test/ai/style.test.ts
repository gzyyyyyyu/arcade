/**
 * 电脑的风格（0.28.0，docs/ai.md 4.3 的风格表、4.2 的看人和位置）：性格拉得开、会按位置和筹码调整、
 * 会按对手的公开打法调整、有各自爱犯的小错。精确的数字靠 npm run sim 的混桌和配平（CI 上跑），这里只拦"不会随便翻的方向"，
 * 每条都做过反证。局面都从机器人对打里收集，再换成想看的性格、档位、对手统计重新决定。
 */
import { stream } from 'arcade-kit/rng';
import { describe, expect, it } from 'vitest';
import { decide } from '../../src/ai/decide.ts';
import { PERSONAS } from '../../src/ai/personas.ts';
import { view, type View } from '../../src/core/view.ts';
import { runBots } from '../support/bots.ts';
import { SEED } from '../support/helpers.ts';

const NAMES = Object.fromEntries(PERSONAS.map((p, i) => [p.name, i]));

/** 收集轮到电脑的视图（pick 满足的，最多 n 个） */
function collect(n: number, pick: (v: View) => boolean, o: { size?: number; hands?: number; personas?: number[] } = {}): View[] {
  const out: View[] = [];
  runBots({
    seed: SEED,
    size: o.size ?? 6,
    hands: o.hands ?? 3000,
    personas: o.personas ?? [0, 4, 7, 2, 5, 9],
    chaos: false,
    level: 4,
    onStep: (t) => {
      if (t.toAct === null || out.length >= n) return;
      const v = view(t, t.toAct);
      if (pick(v)) out.push(v);
    },
  });
  return out;
}

/** 把这个视图里我的座位换成某个性格、某一档 */
const as = (v: View, persona: number, level = 4): View => ({ ...v, level, seats: v.seats.map((x, j) => (j === v.me ? { ...x, persona } : x)) });
/** 把别的座位的公开统计换成指定的（[发到牌, 入池, 翻牌前加注, 翻牌后下注加注, 翻牌后跟注, 看到翻牌, 打到摊牌]） */
const withSeen = (v: View, seen: number[], only?: number[]): View => ({ ...v, seats: v.seats.map((x, j) => (j !== v.me && (!only || only.includes(j)) ? { ...x, seen } : x)) });
const count = (vs: View[], f: (v: View, i: number) => boolean): number => vs.filter(f).length;
const act = (v: View, i: number, tag = 'style') => decide(v, stream(SEED, tag, i));
/** 翻牌前轮到我时还没人入池（前面只有盲注和弃牌） */
const firstIn = (v: View): boolean => !v.log.some((e) => e.act === 'call' || e.act === 'raise' || e.act === 'bet');
const aggressive = (a: { t: string }): boolean => a.t === 'raise' || a.t === 'allin' || a.t === 'bet';

describe('性格拉开：翻牌前入池、加注，翻牌后凶不凶', () => {
  /** 6 人桌打若干场，每种性格的 [入池%, 加注%, 翻牌后下注加注÷跟注]（档位 level） */
  function profile(level: number): { vpip: number; pfr: number; af: number }[] {
    const n = PERSONAS.map(() => ({ dealt: 0, vpip: 0, pfr: 0, aggr: 0, calls: 0 }));
    for (let k = 0; k < 6; k++) {
      const personas = Array.from({ length: 6 }, (_, i) => (i + k * 3) % 10);
      let hand = -1;
      let seen = 0;
      let flop = false;
      let vpip = new Set<number>();
      let pfr = new Set<number>();
      const close = (): void => {
        for (const i of vpip) n[personas[i]!]!.vpip++;
        for (const i of pfr) n[personas[i]!]!.pfr++;
      };
      runBots({
        seed: [k, 2, 3, 4, 5, 6, 7, 8],
        size: 6,
        hands: 500,
        stakes: 'small',
        personas,
        chaos: false,
        level,
        onStep: (t) => {
          if (t.handNo !== hand) {
            close();
            vpip = new Set();
            pfr = new Set();
            [hand, seen, flop] = [t.handNo, 0, false];
            t.seats.forEach((s, i) => s.status !== 'out' && n[personas[i]!]!.dealt++);
          }
          for (const e of t.log.slice(seen)) {
            if (e.seat < 0) flop = true;
            else if (!flop && (e.act === 'call' || e.act === 'raise')) (e.act === 'raise' ? pfr : vpip).add(e.seat);
            else if (flop && (e.act === 'bet' || e.act === 'raise')) n[personas[e.seat]!]!.aggr++;
            else if (flop && e.act === 'call') n[personas[e.seat]!]!.calls++;
          }
          for (const s of pfr) vpip.add(s);
          seen = t.log.length;
        },
      });
      close();
    }
    return n.map((x) => ({ vpip: (x.vpip * 100) / x.dealt, pfr: (x.pfr * 100) / x.dealt, af: x.aggr / Math.max(1, x.calls) }));
  }

  it('豪华桌：松凶（阿飙、虎子）> 紧凶（稳哥、老鹰）> 跟注站（老好、叨叨、小白）的加注和凶度，跟注站入池最松；慢慢最紧最被动', () => {
    const p = profile(4);
    console.log(`豪华档 6 人桌 入池/加注/AF：${PERSONAS.map((x, i) => `${x.name} ${p[i]!.vpip.toFixed(0)}/${p[i]!.pfr.toFixed(0)}/${p[i]!.af.toFixed(1)}`).join('、')}`);
    const { 稳哥, 阿飙, 老好, 慢慢, 虎子, 老鹰, 叨叨, 小白 } = NAMES as Record<string, number>;
    for (const c of [老好!, 叨叨!, 小白!]) {
      expect(p[c]!.pfr).toBeLessThan(10);
      expect(p[c]!.af).toBeLessThan(p[阿飙!]!.af * 0.8);
      expect(p[c]!.vpip).toBeGreaterThan(p[稳哥!]!.vpip);
    }
    for (const a of [阿飙!, 虎子!]) {
      expect(p[a]!.vpip).toBeGreaterThan(p[稳哥!]!.vpip);
      expect(p[a]!.pfr).toBeGreaterThan(p[稳哥!]!.pfr);
    }
    expect(p[慢慢!]!.af).toBeLessThan(p[稳哥!]!.af);
    expect(p[慢慢!]!.pfr).toBeLessThan(p[老鹰!]!.pfr);
    expect(p[虎子!]!.af).toBeGreaterThan(p[老好!]!.af * 1.8);
  }, 120_000);

  it('小桌：风格也拉得开，但新手档只露一部分（老好和阿飙的加注差仍在、虎子比老好凶）', () => {
    const p = profile(1);
    const { 阿飙, 老好, 虎子, 慢慢 } = NAMES as Record<string, number>;
    expect(p[阿飙!]!.pfr).toBeGreaterThan(p[老好!]!.pfr + 5);
    expect(p[虎子!]!.af).toBeGreaterThan(p[老好!]!.af);
    expect(p[老好!]!.vpip).toBeGreaterThan(p[慢慢!]!.vpip + 20);
  }, 120_000);
});

describe('位置和筹码深浅', () => {
  it('同样的牌，按钮位比前位松：翻牌前没人入池时，按钮位开池加注的比例更高（算盘、豪华桌）', () => {
    const base = collect(1200, (v) => v.board.length === 0 && v.legal!.raise && firstIn(v), { size: 9, personas: [0, 1, 2, 3, 4, 5, 6, 7, 8] });
    const late = base.filter((v) => v.me === v.button);
    const early = base.filter((v) => v.me !== v.button && (v.button - v.me! + 9) % 9 >= 5);
    expect(late.length).toBeGreaterThan(40);
    expect(early.length).toBeGreaterThan(40);
    const rate = (vs: View[]): number => count(vs, (v, i) => aggressive(act(as(v, NAMES.算盘!), i))) / vs.length;
    console.log(`算盘开池加注：按钮位 ${(rate(late) * 100).toFixed(0)}%，前位 ${(rate(early) * 100).toFixed(0)}%（${late.length}/${early.length} 个局面）`);
    expect(rate(late)).toBeGreaterThan(rate(early) + 0.05);
  });

  it('位置的分量看性格：老鹰（算位置）按钮位比前位多开的比例，大于小白（不看位置）', () => {
    const base = collect(1200, (v) => v.board.length === 0 && v.legal!.raise && firstIn(v), { size: 9, personas: [0, 1, 2, 3, 4, 5, 6, 7, 8] });
    const late = base.filter((v) => v.me === v.button);
    const early = base.filter((v) => v.me !== v.button && (v.button - v.me! + 9) % 9 >= 5);
    const gap = (persona: number): number => {
      const r = (vs: View[]): number => count(vs, (v, i) => act(as(v, persona), i).t !== 'fold' && act(as(v, persona), i).t !== 'check') / vs.length;
      return r(late) - r(early);
    };
    expect(gap(NAMES.老鹰!)).toBeGreaterThan(gap(NAMES.小白!));
  });

  it('偷盲：前面都弃了、我在后位，凶的偷盲型（阿飙）比不偷的（老好）加注多', () => {
    const spots = collect(1200, (v) => v.board.length === 0 && v.legal!.raise && firstIn(v) && (v.me === v.button || v.seats.filter((s, j) => j !== v.me && s.status === 'active').length <= 3));
    expect(spots.length).toBeGreaterThan(100);
    const r = (p: number): number => count(spots, (v, i) => aggressive(act(as(v, p), i)));
    expect(r(NAMES.阿飙!)).toBeGreaterThan(r(NAMES.老好!) * 2);
  });
});

describe('按对手的公开打法调整（只用 SeatView.seen，和底牌无关）', () => {
  // 翻牌后没人下注、我能先打的局面
  const flop = collect(900, (v) => v.board.length >= 3 && v.legal!.check && v.legal!.raise && v.seats.filter((s, j) => j !== v.me && s.status === 'active').length === 1, { hands: 6000 });
  const NIT = [200, 40, 30, 20, 40, 100, 20]; // 入池 20%、看到翻牌的很爱弃（摊牌 20%）
  const STATION = [200, 110, 10, 20, 80, 100, 55]; // 入池 55%、爱跟不爱下注、一路看到摊牌（55%）
  const folder = (v: View): View => withSeen(v, [200, 90, 25, 40, 40, 100, 15]);

  it('对跟注站少诈唬、对爱弃牌的人多偷：同样的局面、同一个电脑（江湖，豪华桌）', () => {
    expect(flop.length).toBeGreaterThan(300);
    const bets = (seen: number[]): number => count(flop, (v, i) => aggressive(act(as(withSeen(v, seen), NAMES.江湖!), i)));
    const none = count(flop, (v, i) => aggressive(act(as(v, NAMES.江湖!), i)));
    const vsNit = bets(NIT);
    const vsStation = bets(STATION);
    console.log(`翻牌后能先打 ${flop.length} 个局面，江湖下注：对没数据的 ${none}、对紧的 ${vsNit}、对跟注站 ${vsStation}、对爱弃牌的 ${count(flop, (v, i) => aggressive(act(as(folder(v), NAMES.江湖!), i)))}`);
    expect(vsNit).toBeGreaterThan(vsStation);
  });

  it('不看人的性格（小白，reads 0）：对手统计变了决定一点不变', () => {
    const diff = count(flop, (v, i) => act(as(withSeen(v, NIT), NAMES.小白!), i).t !== act(as(withSeen(v, STATION), NAMES.小白!), i).t);
    expect(diff).toBe(0);
  });

  it('面对下注，按下注的人是什么风格调整：他是很紧的人，弃得更多；他是疯的人，抓得更多（老鹰，豪华桌）', () => {
    const facing = collect(700, (v) => v.board.length >= 3 && v.legal!.call > 0 && v.seats.filter((s, j) => j !== v.me && s.status === 'active').length === 1, { hands: 6000 });
    expect(facing.length).toBeGreaterThan(200);
    const folds = (seen: number[]): number => count(facing, (v, i) => act(as(withSeen(v, seen), NAMES.老鹰!), i).t === 'fold');
    const tight = folds([200, 40, 30, 20, 60, 100, 30]);
    const wild = folds([200, 100, 50, 90, 30, 100, 50]);
    console.log(`面对下注 ${facing.length} 个局面，老鹰弃牌：对很紧的人的下注 ${tight}、对疯子的下注 ${wild}`);
    expect(tight).toBeGreaterThan(wild);
  });

  it('偷盲：后面的人都很紧时，后位多开池（阿飙，豪华桌）', () => {
    const spots = collect(1200, (v) => v.board.length === 0 && v.legal!.raise && firstIn(v) && v.me === v.button);
    expect(spots.length).toBeGreaterThan(80);
    const r = (seen: number[]): number => count(spots, (v, i) => aggressive(act(as(withSeen(v, seen), NAMES.阿飙!), i)));
    expect(r([200, 30, 20, 10, 10, 20, 5])).toBeGreaterThan(r([200, 80, 30, 10, 10, 20, 5]));
  });
});

describe('性格爱犯的小错', () => {
  const ALL = PERSONAS as unknown as { leak?: number }[];
  /** 临时把一个性格的 leak 改成 x 跑 f，再还原 */
  const withLeak = <T>(persona: number, x: number, f: () => T): T => {
    const old = ALL[persona]!.leak;
    ALL[persona]!.leak = x;
    try {
      return f();
    } finally {
      if (old === undefined) delete ALL[persona]!.leak;
      else ALL[persona]!.leak = old;
    }
  };
  const facing = collect(800, (v) => v.board.length >= 3 && v.legal!.call > 0, { hands: 6000 });

  it('跟注站（老好）差一点的牌舍不得弃：有小错比没有多跟；胆小的（慢慢）有小错比没有多弃', () => {
    expect(facing.length).toBeGreaterThan(300);
    const calls = (p: number, leak: number): number => withLeak(p, leak, () => count(facing, (v, i) => act(as(v, p, 1), i).t === 'call'));
    const folds = (p: number, leak: number): number => withLeak(p, leak, () => count(facing, (v, i) => act(as(v, p, 1), i).t === 'fold'));
    const a = [calls(NAMES.老好!, 0), calls(NAMES.老好!, 400)];
    const b = [folds(NAMES.慢慢!, 0), folds(NAMES.慢慢!, 400)];
    console.log(`小错：老好跟注 ${a[0]} → ${a[1]}；慢慢弃牌 ${b[0]} → ${b[1]}（${facing.length} 个局面）`);
    expect(a[1]!).toBeGreaterThan(a[0]!);
    expect(b[1]!).toBeGreaterThan(b[0]!);
  });

  it('没有 flaw 的性格（算盘、老鹰）leak 怎么改都不影响决定；有 flaw 的 leak 是小概率（≤ 15%）', () => {
    for (const p of [NAMES.算盘!, NAMES.老鹰!]) {
      expect(PERSONAS[p]!.flaw).toBeUndefined();
      expect(count(facing, (v, i) => withLeak(p, 900, () => act(as(v, p, 1), i).t) !== act(as(v, p, 1), i).t)).toBe(0);
    }
    for (const x of PERSONAS) if (x.flaw) expect(x.leak ?? 0).toBeLessThanOrEqual(150);
  });
});
