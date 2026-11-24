/**
 * 配平（仓库根 docs/balance.md）：小白、普通两个玩家模型在实盘各档、娱乐三档下的结果，和一局大概多久。
 * `npm run sim -- --balance --runs 2000` 打出第 6 节那张对照表；docs/design-live.md 第 3 节、design-balance 的数都从这里来。
 * 真实行情、段按局号均匀覆盖（和 tools/live.ts 一样），仓位 / 押跌 / 抵押都开，新手人设。
 */
import { BALANCE, LIVE_TIERS, PERSONA_IDS, flashScore, flashSegmentId, flashSetup, hashSeed, pickSegmentId, personaAccount, shortSetup, weeklyInfo, weeklyRule, type LiveTier, type RunSetup } from '../src/core/index.ts';
import { DAILY_SEGMENTS } from '../src/core/content/dailySegments.ts';
import { botByName, playRun, useExt, useMarket } from './bots.ts';
import { liveStats, timed, useLiveMarket, type LiveStats } from './live.ts';
import { loadSegment } from './segments-disk.ts';

export interface EntStats {
  level: number;
  bot: string;
  runs: number;
  /** 达成最终目标（撑过 12 个月）的局占比 */
  win: number;
  /** 2 倍标准误 */
  se2: number;
  minutes: number;
}

/** 娱乐局：某一难度、某个机器人打 runs 局，达成最终目标（撑到最后一个月）的比例；short 是短局 */
export function entStats(level: number, bot: string, runs: number, prefix = 'ent', short = false): EntStats {
  useLiveMarket(prefix);
  const t = timed(botByName(bot)());
  let won = 0;
  let sec = 0;
  for (let i = 0; i < runs; i++) {
    t.reset();
    const end = playRun(`${prefix}-${i}`, t.bot, short ? shortSetup('newbie', level) : { persona: 'newbie', difficulty: level });
    if (end.phase === 'won') won++;
    sec += t.seconds();
  }
  const win = won / runs;
  return { level, bot, runs, win, se2: 2 * Math.sqrt((win * (1 - win)) / runs), minutes: sec / runs / 60 };
}

/** 第 2、4 节的目标（实盘，单位：份，按带回倍数写：1 = 不赚不亏） */
export const LIVE_TARGET: Record<LiveTier, Record<'xiaobai' | 'putong', [number, number]>> = {
  small: { xiaobai: [1.05, 1.15], putong: [1.2, 1.4] },
  mid: { xiaobai: [0.95, 1.05], putong: [1.1, 1.2] },
  big: { xiaobai: [0.8, 0.9], putong: [1, 1.1] },
  lux: { xiaobai: [-Infinity, 0.8], putong: [0.95, 1.05] },
};

/** 第 3 节：娱乐三档（难度 1–3）达成最终目标的比例（docs/design-balance.md 第 3 节） */
export const ENT_TARGET: Record<number, { name: string } & Record<'xiaobai' | 'putong', [number, number]>> = {
  1: { name: '新手', xiaobai: [0.85, Infinity], putong: [0.9, Infinity] },
  2: { name: '普通', xiaobai: [0.55, 0.8], putong: [0.7, 0.9] },
  3: { name: '高手', xiaobai: [0.3, 0.5], putong: [0.5, 0.7] },
};

const MODELS = ['xiaobai', 'putong'] as const;
const NAME = { xiaobai: '小白', putong: '普通' } as const;

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const share = (x: number): string => (x - 1 >= 0 ? `+${(x - 1).toFixed(2)}` : (x - 1).toFixed(2));
function range([lo, hi]: [number, number], f: (x: number) => string): string {
  if (lo === -Infinity) return `≤ ${f(hi)}`;
  if (hi === Infinity) return `≥ ${f(lo)}`;
  return `${f(lo)} ～ ${f(hi)}`;
}
const ok = (x: number, [lo, hi]: [number, number]): string => (x >= lo && x <= hi ? '✓' : '✗');

/** 杠杆的目标（小档，每场期望（份））；中、大、豪华档按逐档变难同比往下，不另设区间 */
const GEAR_TARGET: Record<number, Record<(typeof MODELS)[number], [number, number]>> = {
  1: { xiaobai: [1.05, 1.15], putong: [1.25, 1.35] },
  2: { xiaobai: [0.95, 1.05], putong: [1.4, 1.5] },
  3: { xiaobai: [0.75, 0.9], putong: [1.55, 1.7] },
};

/** 杠杆表：每档 × 模型 × 杠杆，均值 ± 2SE、中位数、≥ 3 倍、≥ 5 倍、带回 0（其中跌到清零线的） */
export function gearTable(runs: number): void {
  console.log(`实盘杠杆（每格 ${runs} 局，种子 bal-*；目标只给小档）\n`);
  console.log('| 档位 | 模型 | 杠杆 | 每场期望（份）± 2SE | 目标 | 中位数 | ≥ 3 倍 | ≥ 5 倍 | 带回 0 | 其中清零线 |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const t of LIVE_TIERS) {
    for (const m of MODELS) {
      for (const x of [1, 2, 3]) {
        const r = liveStats(t.id, m, runs, 'bal', 'newbie', x);
        const tg = t.id === 'small' ? GEAR_TARGET[x]![m] : null;
        console.log(
          `| ${t.name} | ${NAME[m]} | ×${x} | ${share(r.mean)} ± ${(2 * r.se).toFixed(3)}${tg ? ` ${ok(r.mean, tg)}` : ''} | ${tg ? range(tg, share) : '—'} | ${r.p50.toFixed(2)} | ${pct(r.x3)} | ${pct(r.x5)} | ${pct(r.zero)} | ${pct(r.margin)} |`,
        );
      }
    }
  }
}

/** 打出第 6 节的对照表（Markdown，直接贴进 PR 和设计稿） */
export function balanceTable(runs: number): void {
  const live = new Map<string, LiveStats & { minutes: number }>();
  console.log(`实盘（每格 ${runs} 局，种子 bal-*；带回减 1 就是"每场期望（份）"）\n`);
  console.log('| 档位 | 模型 | 每场期望（份）± 2SE | 目标 | 中位数 | 赚的局 | 带回 0 | 约几分钟 |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const t of LIVE_TIERS) {
    for (const m of MODELS) {
      const r = liveStats(t.id, m, runs, 'bal');
      live.set(`${t.id}|${m}`, r);
      const tg = LIVE_TARGET[t.id][m];
      console.log(
        `| ${t.name} | ${NAME[m]} | ${share(r.mean)} ± ${(2 * r.se).toFixed(3)} ${ok(r.mean, tg)} | ${range(tg, share)} | ${r.p50.toFixed(2)} | ${pct(r.up)} | ${pct(r.zero)} | ${r.minutes.toFixed(1)} |`,
      );
    }
  }
  const sx = live.get('small|xiaobai') as LiveStats & { minutes: number };
  const sp = live.get('small|putong') as LiveStats & { minutes: number };
  console.log(
    `\n第 4 节（小档）：中位数 小白 ${sx.p50.toFixed(2)}（≥ 1.0）${sx.p50 >= 1 ? '✓' : '✗'}、普通 ${sp.p50.toFixed(2)}（≥ 1.25）${sp.p50 >= 1.25 ? '✓' : '✗'}；` +
      `带回 0 小白 ${pct(sx.zero)}（≤ 15%）、普通 ${pct(sp.zero)}（≤ 5%）；小白赚的局 ${pct(sx.up)}（≥ 50%）`,
  );
  console.log(`小档普通每小时：${((sp.mean - 1) * (60 / sp.minutes)).toFixed(2)} 份（一局约 ${sp.minutes.toFixed(1)} 分钟）`);

  console.log(`\n娱乐（达成最终目标 = 撑到最后一个月还完账单；每格 ${runs} 局，种子 bal-*）\n`);
  console.log('| 一局 | 难度 | 模型 | 胜率 ± 2SE | 目标 | 约几分钟 |');
  console.log('|---|---|---|---|---|---|');
  for (const short of [true, false]) {
    for (const lv of [1, 2, 3]) {
      const tg = ENT_TARGET[lv] as (typeof ENT_TARGET)[number];
      for (const m of MODELS) {
        const r = entStats(lv, m, runs, 'bal', short);
        const len = short ? `短局 ${BALANCE.short.months} 个月` : '完整一年';
        console.log(`| ${len} | ${tg.name} | ${NAME[m]} | ${pct(r.win)} ± ${pct(r.se2)} ${ok(r.win, tg[m])} | ${range(tg[m], pct)} | ${r.minutes.toFixed(1)} |`);
      }
    }
  }
}

/** 闪电盘一个机器人打 runs 局（第 i 局用 2026-01-01 起第 i 天的闪电盘，人设、难度、行情段都跟着日期变）：最终资产、一局估计时长（分钟） */
export interface FlashStats {
  bot: string;
  runs: number;
  /** 最终资产（元）：均值、标准差、分位数 */
  mean: number;
  sd: number;
  p10: number;
  p50: number;
  p90: number;
  /** 资产比开局多的局占比 */
  up: number;
  /** 平均涨跌（最终 ÷ 开局 − 1） */
  growth: number;
  minutes: number;
  /** 估时最短、最长 */
  minMin: number;
  maxMin: number;
}

export function flashStats(bot: string, runs: number, from = '2026-01-01'): FlashStats {
  useMarket((seed) => loadSegment(flashSegmentId(seed.replace(/^flash-/, '')) as string));
  useExt(true);
  const t = timed(botByName(bot)());
  const accounts: number[] = [];
  const mins: number[] = [];
  let up = 0;
  let growth = 0;
  const t0 = Date.parse(`${from}T00:00:00Z`);
  for (let i = 0; i < runs; i++) {
    const date = new Date(t0 + i * 86_400_000).toISOString().slice(0, 10);
    const d = flashSetup(date);
    t.reset();
    const end = playRun(d.seed, t.bot, d.setup);
    const start = personaAccount(d.setup.persona);
    accounts.push(flashScore(end));
    mins.push(t.seconds() / 60);
    if (end.account > start) up++;
    growth += end.account / start - 1;
  }
  const sorted = [...accounts].sort((a, b) => a - b);
  const q = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] as number;
  const mean = accounts.reduce((a, b) => a + b, 0) / runs;
  const sd = Math.sqrt(accounts.reduce((a, b) => a + (b - mean) ** 2, 0) / runs);
  return {
    bot,
    runs,
    mean,
    sd,
    p10: q(0.1),
    p50: q(0.5),
    p90: q(0.9),
    up: up / runs,
    growth: growth / runs,
    minutes: mins.reduce((a, b) => a + b, 0) / runs,
    minMin: Math.min(...mins),
    maxMin: Math.max(...mins),
  };
}

/** 闪电盘表（Markdown，贴进 docs/design-modes.md 第 15 节的配平）：小白、普通各 runs 局 */
export function flashTable(runs: number, bots: readonly string[] = ['xiaobai', 'putong']): void {
  console.log(`闪电盘（每个模型 ${runs} 局，第 i 局 = 2026-01-01 起第 i 天；时长按 tools/live.ts 的 STEP_SECONDS 估）\n`);
  console.log('| 模型 | 平均资产 | 标准差 | 10% / 中位 / 90% 分位 | 赚的局 | 平均涨跌 | 估时（均值，最短–最长，分钟） |');
  console.log('|---|---|---|---|---|---|---|');
  for (const b of bots) {
    const r = flashStats(b, runs);
    const y = (v: number): string => Math.round(v).toLocaleString('en-US');
    console.log(
      `| ${b} | ¥${y(r.mean)} | ${y(r.sd)} | ${y(r.p10)} / ${y(r.p50)} / ${y(r.p90)} | ${pct(r.up)} | ${pct(r.growth)} | ${r.minutes.toFixed(1)}（${r.minMin.toFixed(1)}–${r.maxMin.toFixed(1)}） |`,
    );
  }
}

/**
 * 本周市场一个机器人打 runs 局：同一周的规则，人设 × 难度（FLASH_LEVELS 的 2..4）轮着换、行情段按局号从冻结段池里抽
 * （正式的一周只有一局，这里要样本量）。week 为 null 时是对照组：同样的 10 天短局，没有周规则。
 */
export interface WeeklyStats {
  bot: string;
  week: string | null;
  rule: string;
  runs: number;
  mean: number;
  p10: number;
  p50: number;
  p90: number;
  /** 资产比开局多的局占比 */
  up: number;
  /** 平均涨跌（最终 ÷ 开局 − 1）、最大涨幅、最大跌幅 */
  growth: number;
  best: number;
  worst: number;
  minutes: number;
}

export function weeklyStats(bot: string, runs: number, week: string | null): WeeklyStats {
  useMarket((seed) => {
    const id = pickSegmentId(seed, DAILY_SEGMENTS, hashSeed);
    return id ? loadSegment(id) : null;
  });
  useExt(true);
  const t = timed(botByName(bot)());
  const accounts: number[] = [];
  const growths: number[] = [];
  const mins: number[] = [];
  let up = 0;
  for (let i = 0; i < runs; i++) {
    const persona = PERSONA_IDS[i % PERSONA_IDS.length] as (typeof PERSONA_IDS)[number];
    const difficulty = 2 + (Math.floor(i / PERSONA_IDS.length) % 3);
    const setup: RunSetup = week ? { persona, difficulty, weekly: week } : { persona, difficulty, flash: '2026-01-01' };
    t.reset();
    const end = playRun(`weekly-sim-${week ?? 'base'}-${i}`, t.bot, setup);
    const start = personaAccount(persona);
    accounts.push(flashScore(end));
    growths.push(end.account / start - 1);
    mins.push(t.seconds() / 60);
    if (end.account > start) up++;
  }
  const sorted = [...accounts].sort((a, b) => a - b);
  const q = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] as number;
  return {
    bot,
    week,
    rule: week ? weeklyInfo(week).name : '无规则（对照）',
    runs,
    mean: accounts.reduce((a, b) => a + b, 0) / runs,
    p10: q(0.1),
    p50: q(0.5),
    p90: q(0.9),
    up: up / runs,
    growth: growths.reduce((a, b) => a + b, 0) / runs,
    best: Math.max(...growths),
    worst: Math.min(...growths),
    minutes: mins.reduce((a, b) => a + b, 0) / runs,
  };
}

/** 本周市场表（Markdown）：指定周号（缺省 2026-W44..W48 五条规则各一周）和对照组，小白、普通各 runs 局 */
export function weeklyTable(runs: number, weeks: readonly string[], bots: readonly string[] = ['xiaobai', 'putong']): void {
  console.log(`本周市场（每个模型每条规则 ${runs} 局；人设 × 难度 2..4 轮换、行情段按局号抽）\n`);
  console.log('| 规则 | 周号 | 模型 | 平均涨跌 | 赚的局 | 10% / 中位 / 90% 资产 | 最大涨 / 最大跌 | 估时（分钟） |');
  console.log('|---|---|---|---|---|---|---|---|');
  const y = (v: number): string => Math.round(v).toLocaleString('en-US');
  for (const week of [null, ...weeks]) {
    for (const b of bots) {
      const r = weeklyStats(b, runs, week);
      const rule = week ? `${weeklyInfo(week).name}（${weeklyRule(week)}）` : r.rule;
      console.log(`| ${rule} | ${week ?? '—'} | ${b} | ${pct(r.growth)} | ${pct(r.up)} | ${y(r.p10)} / ${y(r.p50)} / ${y(r.p90)} | ${pct(r.best)} / ${pct(r.worst)} | ${r.minutes.toFixed(1)} |`);
    }
  }
}
