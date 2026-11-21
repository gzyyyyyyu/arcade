/**
 * 三种按种子抽关的实盘（悬赏出海 live、悬赏守岛 td、护航 escort）配平，档位表在 src/content/livetable.ts。航线另见 map-live-sim.ts。
 *   跑：  node tools/live-sim.ts --kind live|td|escort --n 2000 [--tier mid] [--level c10] [--from 0] [--json 输出文件]
 *   合并：node tools/live-sim.ts --merge 片1.json 片2.json …       （按当前倍数表重算，逐关一行、每档汇总一行）
 *   拟合：node tools/live-sim.ts --fit 片1.json 片2.json … [--b3 15000]（每关建议一组 bp，见 fit()；--b3 试一个新的三星倍数）
 *   连闯：node tools/live-sim.ts --streak 悬赏出海的片…              （悬赏连闯的期望，见 streak()）
 * 每关、每种机器人（小白 novice、普通 normal）各 n 局：按顺序扫种子、挑出正好抽到这一关的，镜像正反各半，
 * 所以走的是实盘同一条开局路径。一档的期望 = 池里各关的平均（抽关是均匀的）。目标区间见 docs/balance.md 第 2 节。
 * 汇总只存星数分布和 0 星折算（live-fit-lib.ts），改 bp 不用重跑。本机用 nice，多开几个进程按 --tier / --level 拆片。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { LIVE_TABLE, STREAK_LADDER, STREAK_PASS, type Bp, type LiveKind } from '../src/content/livetable.ts';
import { battleResult, botActions, createBattle, stepBattle } from '../src/core/index.ts';
import { runEscortBot } from '../src/core/escortbot.ts';
import { escortLiveSetup } from '../src/core/escortlive.ts';
import { LIVE_TIER_IDS, STREAK_ISLANDS, livePick, liveSetup, type LiveTier } from '../src/core/live.ts';
import { runTdBot } from '../src/core/tdbot.ts';
import { tdLiveSetup } from '../src/core/tdlive.ts';
import { TARGET, add, inside, line, stats, zero, type Raw, type Style } from './live-fit-lib.ts';
import { argv, num, opt } from './args.ts';

type SimKind = Exclude<LiveKind, 'map'>;
const STYLES: Style[] = ['novice', 'normal'];
const isKind = (v: unknown): v is SimKind => v === 'live' || v === 'td' || v === 'escort';

/** 从 from 起按顺序扫种子，挑出 n 个正好抽到这一关的（livePick 同一条规则），镜像正反交替 */
function seedsFor(kind: SimKind, tier: LiveTier, level: string, from: number, n: number): number[] {
  const out: number[] = [];
  for (let m = from; out.length < n; m++) {
    const seed = (m << 1) | (out.length & 1);
    if (livePick(kind, tier, seed).level === level) out.push(seed);
  }
  return out;
}

/** 一局：星数、0 星折算 f、游戏内秒数 */
function play(kind: SimKind, tier: LiveTier, seed: number, style: Style): { stars: number; f: number; secs: number } {
  if (kind === 'live') {
    const setup = liveSetup(tier, seed);
    const acts = botActions(setup, style);
    const s = createBattle(setup);
    let k = 0;
    let wiped = -1;
    while (!s.over) {
      const now = [];
      while (k < acts.length && acts[k]!.t <= s.tick) now.push(acts[k++]!);
      stepBattle(s, now);
      if (wiped < 0 && s.landed.every(Boolean) && !s.units.some((u) => u.mode !== 'dead')) wiped = s.tick;
    }
    const r = battleResult(s);
    return { stars: r.stars, f: r.destroyedPct / 100, secs: (wiped >= 0 ? wiped : s.tick) / 20 };
  }
  if (kind === 'td') {
    const { result } = runTdBot(tdLiveSetup(tier, seed), style);
    return { stars: result.stars, f: 1 - (1 - result.waves / Math.max(1, result.total)) ** 3, secs: result.ticks / 20 };
  }
  const { escort } = runEscortBot(style, escortLiveSetup(tier, seed));
  const total = Math.max(1, escort.total);
  return { stars: escort.arrived ? Math.max(0, Math.min(3, escort.stars)) : 0, f: Math.min(total, escort.cells) / total, secs: escort.ticks / 20 };
}

function run(kind: SimKind): Raw[] {
  const n = Math.max(1, num('--n', 200));
  const from = Number(opt('--from') ?? 0);
  const onlyTier = opt('--tier');
  const onlyLevel = opt('--level');
  const out: Raw[] = [];
  for (const tier of LIVE_TIER_IDS) {
    if (onlyTier && tier !== onlyTier) continue;
    const pool = LIVE_TABLE[kind][tier].pool;
    for (const p of pool) {
      if (onlyLevel && p.level !== onlyLevel) continue;
      const seeds = seedsFor(kind, tier, p.level, from, n);
      for (const style of STYLES) {
        const r = zero(tier, style, p.level);
        for (const seed of seeds) {
          const g = play(kind, tier, seed, style);
          r.n++;
          r.dist[g.stars]!++;
          r.secs += g.secs;
          if (g.stars === 0) {
            r.f0 += g.f;
            r.f0sq += g.f * g.f;
          }
        }
        out.push({ ...r, kind } as Raw & { kind: SimKind });
      }
    }
  }
  return out;
}

type KRaw = Raw & { kind: SimKind };

function load(files: string[]): KRaw[] {
  const acc = new Map<string, KRaw>();
  for (const f of files) {
    for (const r of JSON.parse(readFileSync(f, 'utf8')) as KRaw[]) {
      const key = `${r.kind}.${r.tier}.${r.level}.${r.style}`;
      if (!acc.has(key)) acc.set(key, { ...zero(r.tier, r.style, r.level), kind: r.kind });
      add(acc.get(key)!, r);
    }
  }
  return [...acc.values()];
}

const bpOf = (r: KRaw): Bp | undefined => LIVE_TABLE[r.kind][r.tier].pool.find((p) => p.level === r.level)?.bp;

/** 逐关一行；每档每种机器人再汇总一行（池里各关平均，SE 按各关独立合成） */
function print(raws: KRaw[]): void {
  for (const kind of ['live', 'td', 'escort'] as SimKind[]) {
    for (const tier of LIVE_TIER_IDS) {
      for (const style of STYLES) {
        // 表里已经没有的关（从池里删掉的）不算进整档平均
        const rs = raws.filter((r) => r.kind === kind && r.tier === tier && r.style === style && bpOf(r));
        if (!rs.length) continue;
        let m = 0;
        let v = 0;
        for (const r of rs) {
          const bp = bpOf(r)!;
          console.log(`${kind.padEnd(7)}${line(r, bp)}`);
          const s = stats(r, bp);
          m += s.mean / rs.length;
          v += (s.se2 / 2) ** 2 / rs.length ** 2;
        }
        const [lo, hi] = TARGET[tier][style];
        console.log(`${kind.padEnd(7)}${tier.padEnd(6)}${'＝整档'.padEnd(13)}${(style === 'novice' ? '小白' : '普通').padEnd(4)} 期望 ${m >= 0 ? '+' : ''}${m.toFixed(3)} ± ${(2 * Math.sqrt(v)).toFixed(3)}  目标 ${lo ?? ''}～${hi ?? ''} ${inside(tier, style, m) ? '✓' : '✗'}`);
      }
    }
  }
}

/**
 * 每关拟合一组 bp：让两种机器人的期望都落到目标区间中点（豪华小白只要求 ≤ −0.25），
 * 同时尽量贴近这一档现在的表（改动最小）。3 星倍数不动（同档各关一样，保住「档越高三星不降」），只拟合 0–2 星；
 * 约束：0 星最多回的 < 1 星 < 2 星 < 3 星（每级至少差 300）；
 * 小档小白赢的场次 ≥ 50%。1–3 星网格步长 100，0 星满值从几个档里挑。
 */
function fit(raws: KRaw[]): void {
  const mid = (t: LiveTier, s: Style): number => {
    const [lo, hi] = TARGET[t][s];
    return lo === null ? Math.min(hi!, -0.25) : hi === null ? lo : (lo + hi) / 2;
  };
  for (const r of raws.filter((x) => x.style === 'normal')) {
    const nov = raws.find((x) => x.kind === r.kind && x.tier === r.tier && x.level === r.level && x.style === 'novice');
    const cur = bpOf(r);
    if (!nov || !cur) continue;
    let best: { bp: Bp; cost: number } | null = null;
    const zeros = r.kind === 'live' ? [5_000, 7_500, 10_000, 12_500, 15_000, 17_500, 20_000] : [2_000, 3_000, 4_000, 5_000, 6_000, 7_000, 7_900];
    for (const b0 of zeros) {
    const zeroMax = r.kind === 'live' ? (b0 * 49) / 100 : b0;
    for (let b1 = Math.max(5_000, Math.ceil((zeroMax + 300) / 100) * 100); b1 <= 20_000; b1 += 100) {
      for (let b2 = b1 + 300; b2 <= 25_000; b2 += 100) {
        for (const b3 of [Number(opt('--b3')) || cur[3]]) {
          if (b3 < b2 + 300) continue;
          const bp: Bp = [b0, b1, b2, b3];
          const a = stats(nov, bp);
          const b = stats(r, bp);
          if (r.tier === 'small' && a.win < 0.5) continue;
          const dn = r.tier === 'lux' ? Math.max(0, a.mean - mid('lux', 'novice')) : a.mean - mid(r.tier, 'novice');
          const dm = b.mean - mid(r.tier, 'normal');
          const shape = ((b0 - cur[0]) ** 2 + (b1 - cur[1]) ** 2 + (b2 - cur[2]) ** 2 + (b3 - cur[3]) ** 2) / 1e8;
          const cost = dn * dn + dm * dm + 0.0005 * shape;
          if (!best || cost < best.cost) best = { bp, cost };
        }
      }
    }
    }
    if (!best) continue;
    const a = stats(nov, best.bp);
    const b = stats(r, best.bp);
    console.log(
      `${r.kind.padEnd(7)}${r.tier.padEnd(6)}${r.level.padEnd(15)} 现在 [${cur.join(', ')}] → 建议 [${best.bp.join(', ')}]  ` +
        `小白 ${a.mean >= 0 ? '+' : ''}${a.mean.toFixed(3)}${inside(r.tier, 'novice', a.mean) ? '✓' : '✗'}  普通 ${b.mean >= 0 ? '+' : ''}${b.mean.toFixed(3)}${inside(r.tier, 'normal', b.mean) ? '✓' : '✗'}`,
    );
  }
}

/**
 * 悬赏连闯的期望（只用悬赏出海的逐关数据，不另跑）：每座独立从池里抽，过关率 q = 池里各关 ≥ STREAK_PASS 星的比例的平均；
 * 按 STREAK_LADDER 算"一路闯到底"和"过 j 座就收手"的期望（份），对照 docs/balance.md 第 2 节。
 */
function streak(raws: KRaw[]): void {
  for (const tier of LIVE_TIER_IDS) {
    const L = STREAK_LADDER[tier];
    const qs: Partial<Record<Style, number>> = {};
    for (const style of STYLES) {
      const rs = raws.filter((r) => r.kind === 'live' && r.tier === tier && r.style === style && bpOf(r));
      if (!rs.length) continue;
      const q = rs.reduce((a, r) => a + r.dist.slice(STREAK_PASS).reduce((x, y) => x + y, 0) / r.n, 0) / rs.length;
      const ev = (stopAt: number): number => {
        let e = 0;
        for (let k = 0; k < stopAt; k++) e += q ** k * (1 - q) * L.fail[k]!;
        return (e + q ** stopAt * L.win[stopAt - 1]!) / 10_000 - 1;
      };
      const s = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(3)}`;
      const all = ev(STREAK_ISLANDS);
      console.log(`连闯 ${tier.padEnd(6)}${(style === 'novice' ? '小白' : '普通').padEnd(4)} 每座过关率 ${(q * 100).toFixed(1)}%  闯到底 ${s(all)}${inside(tier, style, all) ? '✓' : '✗'}  过一座就收 ${s(ev(1))}  过两座就收 ${s(ev(2))}  目标 ${TARGET[tier][style].map((x) => x ?? '').join('～')}`);
      qs[style] = q;
    }
    if (qs.novice !== undefined && qs.normal !== undefined) fitStreak(tier, qs.novice, qs.normal);
  }
}

/** "过 stopAt 座就收"（stopAt = 3 即闯到底）的期望（份） */
function streakEv(q: number, win: readonly number[], fail: readonly number[], stopAt: number): number {
  let e = 0;
  for (let k = 0; k < stopAt; k++) e += q ** k * (1 - q) * fail[k]!;
  return (e + q ** stopAt * win[stopAt - 1]!) / 10_000 - 1;
}

/**
 * 连闯倍数表建议：两种机器人"闯到底"的期望都靠近目标区间中点（豪华小白靠 −0.35），
 * 而且对普通机器人"过一座 / 两座就收手"不比闯到底划算（否则会玩的人不再闯）；输了要真输：第一座没过最多回六成，
 * 之后没过比上一座收手至少少 0.1 份。网格步长 500。
 */
function fitStreak(tier: LiveTier, qn: number, qm: number): void {
  const mid = (st: Style): number => {
    const [lo, hi] = TARGET[tier][st];
    return lo === null ? Math.min(hi!, -0.25) : hi === null ? lo : (lo + hi) / 2;
  };
  let best: { win: number[]; fail: number[]; cost: number } | null = null;
  for (let w2 = 10_500; w2 <= 25_000; w2 += 500) {
    for (let w1 = Math.ceil((w2 * 0.7) / 500) * 500; w1 < w2; w1 += 500) {
      for (let w0 = Math.ceil((w1 * 0.8) / 500) * 500; w0 < w1; w0 += 500) {
        for (let f2 = Math.ceil((w1 * 0.4) / 500) * 500; f2 <= w1 - 1_000; f2 += 500) {
          for (let f1 = 500; f1 < f2 && f1 <= w0 - 1_000; f1 += 500) {
            for (let f0 = 0; f0 < f1 && f0 <= 6_000; f0 += 1_000) {
              const win = [w0, w1, w2];
              const fail = [f0, f1, f2];
              const en = streakEv(qn, win, fail, 3);
              const em = streakEv(qm, win, fail, 3);
              if (streakEv(qm, win, fail, 1) > em || streakEv(qm, win, fail, 2) > em) continue;
              // 豪华小白只有上限（≤ −0.20），往 −0.35 靠，免得为了它把保底压到几乎全输
              const dn = en - (tier === 'lux' ? -0.35 : mid('novice'));
              const cost = dn * dn + (em - mid('normal')) ** 2 + ((w2 - 10_000) / 1e6) ** 2;
              if (!best || cost < best.cost) best = { win, fail, cost };
            }
          }
        }
      }
    }
  }
  if (!best) return console.log(`连闯 ${tier} 没找到满足约束的倍数表`);
  const en = streakEv(qn, best.win, best.fail, 3);
  const em = streakEv(qm, best.win, best.fail, 3);
  console.log(`连闯 ${tier.padEnd(6)}建议 win [${best.win.join(', ')}] fail [${best.fail.join(', ')}]  小白闯到底 ${en.toFixed(3)}  普通闯到底 ${em.toFixed(3)}`);
}

if (argv[0] === '--merge') print(load(argv.slice(1)));
else if (argv[0] === '--streak') streak(load(argv.slice(1)));
else if (argv[0] === '--fit') fit(load(argv.slice(1).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'))));
else {
  const kind = opt('--kind');
  if (!isKind(kind)) throw new Error('--kind 要写 live、td 或 escort');
  const out = run(kind) as KRaw[];
  const json = opt('--json');
  if (json) writeFileSync(json, JSON.stringify(out));
  else print(out);
}
