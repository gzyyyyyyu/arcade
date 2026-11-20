/**
 * 守岛 2.0 配平模拟：node tools/td-sim.ts [--level td07] [--n 200] [--parts main,anti,hero,care,budget,layouts] [--json] [--from 1] [--rules 13] [--hero nav]
 * 18 关（关卡岛 + 驻守台，建议养成的存档）各打 n 局（种子 from..from+n-1），按验收表（DESIGN 10.7）出数：
 *   main    小白、照建议的新手、稳（普通）、贪四种机器人的星数分布，稳 / 贪的三星率差，局末没花掉的金币占比（新手线按「新手 ≥1★」量，DESIGN 10.7）；
 *   anti    反压制：把稳机器人造的塔全换成一种（喷火 / 火枪 / 加农各量一次，取最高的）；
 *   hero    英雄拆开看：稳机器人不放技能、不走位；
 *   care    养成三档：零养成（只有主寨）、建议养成、满养成（主寨 8 级满配）；
 *   budget  预算 ±2% 时稳机器人的三星率（> 15 点说明这关太悬崖，改地图不改数）；
 *   curve   稳机器人的三星率随预算百分比怎么变（--pcts 70,85,100,115,130），配平时找"预算差多少才对上目标"用。
 * --hero nav 带航海士（规则版本 23）；每格另记经济：局末没花掉的金币占收入的比例（余金）、第几波开打时木台全都是三阶塔（升满阶，没升满的局不算，另给升满的局占比）。
 * 默认只跑 main；全部：--parts main,anti,hero,care,budget。大批量拆成每关一片在 CI 上跑（--json 出可合并的汇总），
 * 再 `node tools/td-sim.ts --merge 片1.json 片2.json …` 合并成表（本机只跑小样本，用 nice）。
 */
import { readFileSync } from 'node:fs';
import { RULES_VERSION, TD_ENEMY_ARMOR, createTd, stepTd, tdBotActions, tdGrowthSetup, tdResult } from '../src/core/index.ts';
import type { TdState } from '../src/core/index.ts';
import type { TdArmor, TdBotKind, TdBotOpts, TdGrowth, TdSetup } from '../src/core/index.ts';
import { buildLevel, TD2_LEVEL_DEFS } from '../src/content/td2levels.ts';
import { argv, flag, num, opt } from './args.ts';

// ---------------------------------------------------------------- 参数

const n = Math.max(1, num('--n', 50));
const from = num('--from', 1);
const only = opt('--level');
const json = flag('--json');
const parts = new Set((opt('--parts') ?? 'main').split(','));
// --rules 13：按旧规则版本打（比规则改动前后，同一份代码两次跑）
const rulesOpt = opt('--rules') ? Number(opt('--rules')) : undefined;
const pcts = (opt('--pcts') ?? '70,85,100,115,130').split(',').map(Number);
const hero = opt('--hero') === 'nav' ? ('nav' as const) : undefined;

// ---------------------------------------------------------------- 一局

interface Played {
  stars: number;
  lost: number;
  waves: number;
  total: number;
  ticks: number;
  /** 局末没花掉的金币、整局的收入（开局金 + 局内挣的） */
  left: number;
  income: number;
  /** 第几波开打时木台（不算还压着沉船的）全是三阶塔；没升满为 -1 */
  full: number;
}

/** 能造的木台全是三阶塔了（驻守台、压着沉船的不算；一座都没有不算） */
function allMaxed(s: TdState): boolean {
  let n = 0;
  for (const sl of s.slots) {
    if (sl.garrison !== undefined || sl.wreck !== undefined) continue;
    const t = sl.tower >= 0 ? s.towers.find((q) => q.id === sl.tower) : undefined;
    if (t?.tier !== 3) return false;
    n++;
  }
  return n > 0;
}

function play(setup: TdSetup, kind: TdBotKind, o: TdBotOpts): Played {
  const s = createTd(setup);
  const bot = tdBotActions(kind, setup.seed, o);
  let full = -1;
  while (!s.over) {
    stepTd(s, bot(s));
    if (full < 0 && allMaxed(s)) full = s.wave;
  }
  const r = tdResult(s);
  return { stars: r.stars, lost: r.lost, waves: r.waves, total: r.total, ticks: r.ticks, left: s.gold, income: setup.level.gold + s.goldEarned, full };
}

/** 养成三档：zero 零养成、suggest 建议养成、max 满养成（tdGrowthSetup）；预算不是 100 时换成按百分比缩放的波次 */
function setupOf(id: string, seed: number, growth: TdGrowth, budgetPct = 100): TdSetup {
  const r = tdGrowthSetup(id, growth, seed, hero);
  if (!r.ok) throw new Error(`${id}: ${r.error}`);
  const v = rulesOpt === undefined ? r.value : { ...r.value, rules: rulesOpt };
  if (budgetPct === 100) return v;
  const def = TD2_LEVEL_DEFS.find((d) => d.id === id)!;
  return { ...v, level: buildLevel(def, budgetPct) };
}

// ---------------------------------------------------------------- 汇总

/** 一格的原始汇总：星数分布 + 丢的枚数 + 局末金币 + 收入 + 撑过波数（0 星局） */
export interface Cell {
  n: number;
  dist: [number, number, number, number];
  lost: number;
  ticks: number;
  left: number;
  income: number;
  waves0: number;
  /** 升满阶的局数、这些局升满时的波数之和（旧的 json 没有，按 0 合并） */
  fullN: number;
  fullW: number;
}

const blank = (): Cell => ({ n: 0, dist: [0, 0, 0, 0], lost: 0, ticks: 0, left: 0, income: 0, waves0: 0, fullN: 0, fullW: 0 });

function run(id: string, kind: TdBotKind, growth: TdGrowth, o: TdBotOpts = {}, budgetPct = 100): Cell {
  const c = blank();
  for (let seed = from; seed < from + n; seed++) {
    const r = play(setupOf(id, seed, growth, budgetPct), kind, o);
    c.n++;
    c.dist[r.stars as 0 | 1 | 2 | 3]++;
    c.lost += r.lost;
    c.ticks += r.ticks;
    c.left += r.left;
    c.income += r.income;
    if (r.stars === 0) c.waves0 += r.waves;
    if (r.full >= 0) {
      c.fullN++;
      c.fullW += r.full;
    }
  }
  return c;
}

export interface LevelRaw {
  id: string;
  cells: Record<string, Cell>;
}

function armorKinds(id: string): number {
  const def = TD2_LEVEL_DEFS.find((d) => d.id === id)!;
  const set = new Set<TdArmor>();
  for (const w of buildLevel(def).waves) for (const g of w.groups) set.add(TD_ENEMY_ARMOR[g.enemy]);
  return set.size;
}

function simLevel(id: string): LevelRaw {
  const cells: Record<string, Cell> = {};
  if (parts.has('main')) {
    cells.novice = run(id, 'novice', 'suggest');
    cells.guided = run(id, 'guided', 'suggest');
    cells.normal = run(id, 'normal', 'suggest');
    cells.greedy = run(id, 'greedy', 'suggest');
  }
  if (parts.has('anti') && armorKinds(id) >= 3) {
    for (const k of ['flame', 'gunTower', 'cannon'] as const) cells[`anti.${k}`] = run(id, 'normal', 'suggest', { only: k });
  }
  // ③a 布局多样性：同一关同一攻击、普通机器人按三种布局思路各打 n 局，比守住率（≥1★）
  if (parts.has('layouts')) {
    for (const l of ['mix', 'focus', 'tall'] as const) cells[`layout.${l}`] = run(id, 'normal', 'suggest', { layout: l });
  }
  if (parts.has('hero')) {
    cells['hero.noskill'] = run(id, 'normal', 'suggest', { skills: false });
    cells['hero.nomove'] = run(id, 'normal', 'suggest', { move: false });
  }
  if (parts.has('care')) {
    cells['care.none'] = run(id, 'normal', 'zero');
    cells['care.full'] = run(id, 'normal', 'max');
    if (!cells.normal) cells.normal = run(id, 'normal', 'suggest');
  }
  if (parts.has('budget')) {
    cells['budget.98'] = run(id, 'normal', 'suggest', {}, 98);
    cells['budget.102'] = run(id, 'normal', 'suggest', {}, 102);
    if (!cells.normal) cells.normal = run(id, 'normal', 'suggest');
  }
  if (parts.has('curve')) for (const p of pcts) cells[`curve.${p}`] = run(id, 'normal', 'suggest', {}, p);
  return { id, cells };
}

// ---------------------------------------------------------------- 出表

const pct = (c: Cell | undefined, stars: number): number => (c ? (100 * c.dist.slice(stars).reduce((a, b) => a + b, 0)) / c.n : NaN);
const f0 = (v: number): string => (Number.isNaN(v) ? '-' : String(Math.round(v)));
const se2 = (c: Cell | undefined): number => {
  if (!c) return NaN;
  const p = c.dist[3] / c.n;
  return 200 * Math.sqrt((p * (1 - p)) / c.n);
};
/** 局末没花掉的金币占整局收入 */
const leftPct = (c: Cell | undefined): string => (c && c.income > 0 ? `${f0((100 * c.left) / c.income)}%` : '-');
/** 升满阶：平均第几波（1 起）、升满的局占比 */
const fullAt = (c: Cell | undefined): string => (c && c.fullN > 0 ? `${(c.fullW / c.fullN).toFixed(1)}（${f0((100 * c.fullN) / c.n)}%）` : '-');
/** 验收目标：第 i 关（0 起）普通三星率 85 − 3i */
const target = (i: number): number => 85 - 3 * i;

function merge(a: LevelRaw[]): LevelRaw[] {
  const out = new Map<string, LevelRaw>();
  for (const l of a) {
    const o = out.get(l.id) ?? { id: l.id, cells: {} };
    out.set(l.id, o);
    for (const [k, c] of Object.entries(l.cells)) {
      const m = o.cells[k] ?? blank();
      o.cells[k] = m;
      m.n += c.n;
      for (let i = 0; i < 4; i++) m.dist[i as 0 | 1 | 2 | 3] += c.dist[i as 0 | 1 | 2 | 3];
      m.lost += c.lost;
      m.ticks += c.ticks;
      m.left += c.left;
      m.income += c.income;
      m.waves0 += c.waves0;
      m.fullN += c.fullN ?? 0;
      m.fullW += c.fullW ?? 0;
    }
  }
  return [...out.values()].sort((x, y) => x.id.localeCompare(y.id));
}

function table(levels: LevelRaw[]): string {
  const rows: string[] = [];
  rows.push('| 关 | 稳 3★ (±2SE) | 目标 | 稳 0★ | 新手 ≥1★ | 小白 ≥1★ | 贪 3★ | 稳-贪 | 反压制 3★（塔） | 差 | 不放技能 | 不走位 | 零养成 | 满养成 | 预算 98 / 102 | 余金 稳 / 贪 | 升满阶 稳 / 贪 |');
  rows.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  const prev: number[] = [];
  for (const l of levels) {
    const i = TD2_LEVEL_DEFS.findIndex((d) => d.id === l.id);
    const c = l.cells;
    const norm = pct(c.normal, 3);
    prev.push(norm);
    let anti = '-';
    let antiDiff = '-';
    const antis = Object.entries(c).filter(([k]) => k.startsWith('anti.'));
    if (antis.length) {
      const best = antis.reduce((x, y) => (pct(y[1], 3) > pct(x[1], 3) ? y : x));
      anti = `${f0(pct(best[1], 3))}（${best[0].slice(5)}）`;
      antiDiff = f0(norm - pct(best[1], 3));
    }
    const bud = c['budget.98'] && c['budget.102'] ? `${f0(pct(c['budget.98'], 3))} / ${f0(pct(c['budget.102'], 3))}` : '-';
    const left = `${leftPct(c.normal)} / ${leftPct(c.greedy)}`;
    const full = `${fullAt(c.normal)} / ${fullAt(c.greedy)}`;
    rows.push(
      `| ${l.id} | ${f0(norm)}% ± ${f0(se2(c.normal))} | ${target(i)}% | ${f0(c.normal ? (100 * c.normal.dist[0]) / c.normal.n : NaN)}% | ${f0(pct(c.guided, 1))}% | ${f0(pct(c.novice, 1))}% | ${f0(pct(c.greedy, 3))}% | ${f0(Math.abs(norm - pct(c.greedy, 3)))} | ${anti} | ${antiDiff} | ` +
        `${f0(pct(c['hero.noskill'], 3))}% | ${f0(pct(c['hero.nomove'], 3))}% | ${f0(pct(c['care.none'], 3))}% | ${f0(pct(c['care.full'], 3))}% | ${bud} | ${left} | ${full} |`,
    );
  }
  const steps = levels.slice(1).map((l, k) => `${l.id}:${f0(pct(l.cells.normal, 3) - prev[k]!)}`);
  const curves = levels
    .map((l) => {
      const cs = Object.entries(l.cells).filter(([k]) => k.startsWith('curve.'));
      return cs.length ? `${l.id}（目标 ${target(TD2_LEVEL_DEFS.findIndex((d) => d.id === l.id))}%）：${cs.map(([k, c]) => `${k.slice(6)}%→${f0(pct(c, 3))}`).join(' ')}` : '';
    })
    .filter(Boolean);
  return `${rows.join('\n')}\n\n相邻关三星率变化（后 − 前）：${steps.join(' ')}${curves.length ? `\n\n预算百分比 → 稳三星率：\n${curves.join('\n')}` : ''}`;
}

// ---------------------------------------------------------------- 入口

if (flag('--merge')) {
  const files = argv.slice(argv.indexOf('--merge') + 1).filter((a) => !a.startsWith('--'));
  const all = files.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')) as LevelRaw[]);
  console.log(`合并 ${files.length} 片\n`);
  console.log(table(merge(all)));
} else {
  const ids = TD2_LEVEL_DEFS.map((d) => d.id).filter((id) => !only || id === only);
  if (ids.length === 0) {
    console.error(`没有这一关：${only}（可选 ${TD2_LEVEL_DEFS.map((d) => d.id).join(' / ')}，规则版本 ${RULES_VERSION}）`);
    process.exit(1);
  }
  const raws: LevelRaw[] = [];
  for (const id of ids) {
    const t0 = Date.now();
    raws.push(simLevel(id));
    if (!json) console.error(`${id} 完成 ${Math.round((Date.now() - t0) / 1000)} 秒`);
  }
  if (json) console.log(JSON.stringify(raws));
  else console.log(`每格 ${n} 局（种子 ${from}–${from + n - 1}），建议养成的存档，英雄${hero ? '航海士' : '船长'}；目标列 = 验收表的稳三星率\n\n${table(raws)}`);
}
