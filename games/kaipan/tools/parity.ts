/**
 * 核心对拍：同一批种子在两份代码上各跑一遍，逐局比终局，证明重构、删旧路径没改变对局结果（process.md 第 1 节）。
 *   node tools/parity.ts run [--from 1] [--to 200] --out <结果.json>      在要跑的那份代码的模块目录里执行（行情段按当前目录读）
 *   node tools/parity.ts diff <旧.json> <新.json> [--ignore 字段,字段]
 *
 * run 只从当前目录动态加载核心、机器人、行情段，所以旧版本里不用有本文件：旧版本用 git archive 解一份到别处、node_modules 链过去，
 * cd 进去用 `node <本文件的绝对路径> run ...` 跑。每个种子跑五局，都是真实行情（段按种子号均匀覆盖），仓位 / 押跌 / 抵押都开：
 *   live-small / live-mid / live-big / live-lux  实盘四档：人设、杠杆 1/2/3、机器人小白/普通/聪明按种子轮换
 *   ent  娱乐普通局：难度 1–3、短局 / 完整一年、机器人按种子轮换
 * 每局记：终局阶段、结局原因、月份、交易日、账户、持仓、结回额（bp，实盘才有）、事件流指纹、状态指纹。
 * 状态指纹先抹平只是形状变化、不影响规则的字段（normalize），diff 里照常比其余每一项。
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

export interface GameRow {
  seed: number;
  kind: string;
  setup: string;
  bot: string;
  phase: string;
  endReason: string;
  month: number;
  day: number;
  account: number;
  slots: string;
  bp: number;
  events: string;
  fp: string;
}

/**
 * 状态里只是形状变化的字段（路径按点分）：0.37.0 删了日计划里的 0.4 拆分项 base（只写不读）；
 * stats.eventPicks 从「第一次选事件才有」改成开局就是 []，空数组按没有算。
 */
const STRIP = ['today.plan.base'];
// biome-ignore lint/suspicious/noExplicitAny: 两份代码的状态类型不同，只按字段读
function normalize(s: any): void {
  for (const p of STRIP) strip(s, p);
  if (Array.isArray(s.stats?.eventPicks) && s.stats.eventPicks.length === 0) delete s.stats.eventPicks;
}

function strip(o: unknown, path: string): void {
  if (!o || typeof o !== 'object') return;
  const parts = path.split('.');
  let cur = o as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur[parts[i] as string];
    if (!next || typeof next !== 'object') return;
    cur = next as Record<string, unknown>;
  }
  delete cur[parts[parts.length - 1] as string];
}

/** 确定性序列化：键排序，undefined / 非有限数 / Map / Set 有固定写法（同 tests/core/fingerprint.test.ts）。 */
function canon(v: unknown): string {
  if (v === undefined) return '"~u"';
  if (typeof v === 'number') return Number.isFinite(v) ? (Object.is(v, -0) ? '"~-0"' : String(v)) : `"~${v}"`;
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (v instanceof Map) return `{"~map":${canon([...v.entries()])}}`;
  if (v instanceof Set) return `{"~set":${canon([...v.values()])}}`;
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canon(o[k])}`)
    .join(',')}}`;
}

const sha = (text: string): string => createHash('sha256').update(new TextEncoder().encode(text)).digest('hex').slice(0, 16);

async function run(from: number, to: number): Promise<GameRow[]> {
  const root = process.cwd();
  const load = (p: string) => import(pathToFileURL(`${root}/${p}`).href);
  const core = await load('src/core/index.ts');
  const { botByName, playRun, useExt, useMarket } = await load('tools/bots.ts');
  const { loadSegment, segmentIndex } = await load('tools/segments-disk.ts');
  const segs = segmentIndex().segments as { id: string }[];
  useExt(true);
  let segId = '';
  useMarket(() => loadSegment(segId));

  const BOTS = ['xiaobai', 'putong', 'smart'];
  const TIERS = ['small', 'mid', 'big', 'lux'];
  const rows: GameRow[] = [];
  for (let seed = from; seed <= to; seed++) {
    segId = (segs[seed % segs.length] as { id: string }).id;
    const persona = core.PERSONA_IDS[seed % core.PERSONA_IDS.length];
    const games: { kind: string; setup: unknown; bot: string }[] = TIERS.map((t, i) => ({
      kind: `live-${t}`,
      setup: core.liveSetup(t, persona, 1 + ((seed + i) % 3)),
      bot: BOTS[(seed + i) % BOTS.length] as string,
    }));
    const lv = 1 + (seed % 3);
    games.push({ kind: 'ent', setup: seed % 2 ? core.shortSetup(persona, lv) : { persona, difficulty: lv }, bot: BOTS[seed % BOTS.length] as string });
    for (const g of games) {
      let ev = '';
      // biome-ignore lint/suspicious/noExplicitAny: 两份代码的类型各不相同，这里只按字段读
      const end: any = playRun(`par-${seed}-${g.kind}`, botByName(g.bot), g.setup, (_s: unknown, events: unknown[]) => {
        ev = sha(ev + canon(events));
      });
      const s = structuredClone(end);
      normalize(s);
      rows.push({
        seed,
        kind: g.kind,
        setup: JSON.stringify(g.setup),
        bot: g.bot,
        phase: end.phase,
        endReason: String(end.endReason),
        month: end.month,
        day: end.dayIndex,
        account: end.account,
        slots: JSON.stringify(end.slots.map((h: { stockId: string; units?: number; value: number } | null) => (h ? [h.stockId, h.units ?? 1, h.value] : null))),
        bp: core.runSummary(end).live?.bp ?? 0,
        events: ev,
        fp: sha(canon(s)),
      });
    }
  }
  return rows;
}

function diff(a: GameRow[], b: GameRow[], ignore: readonly string[]): string[] {
  const out: string[] = [];
  const key = (r: GameRow): string => `${r.kind} 种子${r.seed}`;
  const bm = new Map(b.map((r) => [key(r), r]));
  if (a.length !== b.length) out.push(`局数不同：${a.length} vs ${b.length}`);
  for (const r of a) {
    const s = bm.get(key(r));
    if (!s) {
      out.push(`${key(r)}：新结果里没有`);
      continue;
    }
    for (const f of Object.keys(r) as (keyof GameRow)[]) {
      if (ignore.includes(f) || r[f] === s[f]) continue;
      out.push(`${key(r)} ${f}：${r[f]} → ${s[f]}`);
    }
  }
  return out;
}

const cmd = argv[0];
if (cmd === 'run') {
  const out = opt('--out');
  if (!out) throw new Error('要 --out <结果.json>');
  const rows = await run(Number(opt('--from') ?? 1), Number(opt('--to') ?? 200));
  writeFileSync(out, JSON.stringify(rows));
  console.log(`${rows.length} 局 → ${out}`);
} else if (cmd === 'diff') {
  const [fa, fb] = [argv[1], argv[2]];
  if (!fa || !fb) throw new Error('要两个结果文件');
  const ignore = (opt('--ignore') ?? '').split(',').filter(Boolean);
  const a = JSON.parse(readFileSync(fa, 'utf8')) as GameRow[];
  const b = JSON.parse(readFileSync(fb, 'utf8')) as GameRow[];
  const d = diff(a, b, ignore);
  const kinds = new Map<string, number>();
  for (const r of a) kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + 1);
  console.log(`${a.length} 局（${[...kinds].map(([k, n]) => `${k} ${n}`).join('、')}）`);
  if (d.length === 0) console.log('逐局逐项全等');
  else {
    console.log(`不等 ${d.length} 处：`);
    for (const line of d.slice(0, 50)) console.log(`  ${line}`);
  }
  process.exit(d.length === 0 ? 0 : 1);
} else {
  console.log('用法：node tools/parity.ts run [--from 1] [--to 200] --out <结果.json> | diff <旧.json> <新.json> [--ignore 字段]');
}
