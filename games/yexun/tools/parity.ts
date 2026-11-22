/**
 * 核心对拍：同一批种子在两份代码上各跑一遍，逐局比终局，证明改动（搬家、重构）没改变对局结果。
 *   node tools/parity.ts run [--root <模块目录>] [--from 1] [--to 200] --out <结果.json>
 *   node tools/parity.ts diff <旧.json> <新.json> [--ignore 字段,字段]
 *
 * run：--root 指向要跑的那份代码（默认本目录；旧版本用 git archive 解一份到别处，node_modules 链过去），
 * 脚本只从 root 动态加载核心、机器人、结算，所以旧版本里不用有本文件。每个种子跑四局，novice 一律不开：
 *   vigil  娱乐守夜：危险 0–5、角色、地图、机器人小白/普通按种子轮换，选卡按角色第一主修流派
 *   vigilLive  守夜实盘：档位、角色、地图轮换，开局走 platform/live.ts 的 liveSetup，结回额 vigilBp
 *   raid  娱乐夜探：镇子模板、危险、角色轮换，机器人按普通玩家 10 分钟后找门撤
 *   raidLive  夜探实盘：档位、镇子、角色轮换，liveSetup 开局，撤出按 settleRaid 结回额
 * 每局记：终局拍数、等级、经验（魂）、铜钱、击杀、血、胜负、打倒尸王、结回额（bp）、状态指纹。
 * diff：两份结果逐局逐项比，全等退出码 0；有不等的列出局和字段，退出码 1。
 * 一个种子约 10 秒（四局）：200 个种子分几段 --from/--to 并行跑，把各段的数组拼成一份再 diff。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

export interface GameRow {
  seed: number;
  kind: 'vigil' | 'vigilLive' | 'raid' | 'raidLive';
  setup: string;
  ticks: number;
  level: number;
  xp: number;
  coins: number;
  kills: number;
  hp: number;
  won: boolean;
  boss: boolean;
  bp: number;
  fp: number;
}

async function run(root: string, from: number, to: number): Promise<GameRow[]> {
  const core = await import(`${root}/src/core/index.ts`);
  await import(`${root}/src/explore/register.ts`);
  const { Bot } = await import(`${root}/tools/bots.ts`);
  const { RaidBot } = await import(`${root}/src/explore/bot.ts`);
  const { settleRaid } = await import(`${root}/src/explore/settle.ts`);
  const { liveSetup } = await import(`${root}/src/platform/live.ts`);
  const { vigilBp, LIVE_TIER_IDS, LIVE_CHAR_IDS } = await import(`${root}/src/content/live.ts`);
  const { RAID_LIVE_TEMPLATES } = await import(`${root}/src/content/explore.ts`);
  const { CHARACTER_IDS } = await import(`${root}/src/content/meta.ts`);
  const { MAP_IDS } = await import(`${root}/src/content/maps.ts`);
  const { mainSchools } = await import(`${root}/src/content/pools.ts`);
  const RAID_FUN = ['guzhen', 'dukou', 'shansi', 'xilou', 'liangcang', 'yaozhen'] as const;
  const LEAVE = 600 * core.TICKS_PER_SECOND;

  // biome-ignore lint/suspicious/noExplicitAny: 两份代码的类型各不相同，这里只按字段读
  const play = (setup: any, skill: 'novice' | 'normal', raid: boolean): any => {
    const w = core.createWorld(setup);
    const bot = new Bot(skill, mainSchools(w.setup.character ?? 'xiaodao')[0], setup.seed, { skills: true });
    const guide = raid ? new RaidBot(w.raid, LEAVE) : null;
    let guard = 0;
    while (w.phase !== 'over' && guard++ < 200_000) {
      if (guide && w.phase !== 'choose') {
        const d = guide.dir(w.x, w.y, w.tick, w.coins);
        bot.goal = d === 0 ? -1 : d;
        bot.detour = !(w.raid.gateMask !== 0 && w.tick >= LEAVE);
      }
      const a = bot.act(w);
      core.step(w, a.dir, a.choice, a.skill);
    }
    return w;
  };
  // biome-ignore lint/suspicious/noExplicitAny: 同上
  const row = (seed: number, kind: GameRow['kind'], setup: any, w: any, bp: number): GameRow => ({
    seed, kind, setup: JSON.stringify(setup), ticks: w.tick, level: w.level, xp: w.xp, coins: w.coins, kills: w.kills, hp: w.hp,
    won: w.raid ? w.raid.outcome === 'escaped' : w.won, boss: w.bossKilled, bp, fp: core.fingerprint(w),
  });

  const rows: GameRow[] = [];
  for (let seed = from; seed <= to; seed++) {
    const skill = seed % 2 ? 'normal' : 'novice';
    const char = CHARACTER_IDS[seed % CHARACTER_IDS.length];
    const map = MAP_IDS[seed % MAP_IDS.length];
    const tier = LIVE_TIER_IDS[seed % LIVE_TIER_IDS.length];
    const liveChar = LIVE_CHAR_IDS[seed % LIVE_CHAR_IDS.length];

    const vs = { seed, mode: 'vigil', danger: seed % 6, character: char, map };
    rows.push(row(seed, 'vigil', vs, play(vs, skill, false), 0));

    const ls = liveSetup(tier, seed, undefined, liveChar, map);
    const lw = play(ls, skill, false);
    rows.push(row(seed, 'vigilLive', ls, lw, vigilBp(tier, lw.tick, lw.won, lw.bossKilled, ls.character, ls.map)));

    // 和下面的夜探实盘错开模板和危险档，免得两局一模一样
    const rs = { seed, mode: 'raid', danger: (seed + 2) % 6, raid: { template: RAID_FUN[(seed + 3) % RAID_FUN.length] }, character: char };
    rows.push(row(seed, 'raid', rs, play(rs, skill, true), 0));

    const rls = liveSetup(tier, seed, RAID_LIVE_TEMPLATES[seed % RAID_LIVE_TEMPLATES.length], liveChar);
    const rw = play(rls, skill, true);
    rows.push(row(seed, 'raidLive', rls, rw, rw.raid.outcome === 'escaped' ? settleRaid(rw.raid, 0).bp : 0));
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

const [cmd] = argv;
if (cmd === 'run') {
  const root = resolve(opt('--root') ?? resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  const out = opt('--out');
  if (!out) throw new Error('要 --out <结果.json>');
  const from = Number(opt('--from') ?? 1);
  const to = Number(opt('--to') ?? 200);
  const t0 = performance.now();
  const rows = await run(root, from, to);
  writeFileSync(out, JSON.stringify(rows));
  console.log(`${root}：种子 ${from}–${to}，${rows.length} 局，${((performance.now() - t0) / 1000).toFixed(0)} 秒 → ${out}`);
} else if (cmd === 'diff') {
  const [fa, fb] = argv.slice(1, 3);
  if (!fa || !fb) throw new Error('要两份结果：diff <旧.json> <新.json>');
  const read = (f: string): GameRow[] => JSON.parse(readFileSync(f, 'utf8')) as GameRow[];
  const a = read(fa);
  const bad = diff(a, read(fb), opt('--ignore')?.split(',') ?? []);
  const kinds = [...new Set(a.map((r) => r.kind))].map((k) => `${k} ${a.filter((r) => r.kind === k).length}`).join('、');
  if (bad.length === 0) console.log(`全等：${a.length} 局（${kinds}），每局 ${Object.keys(a[0] ?? {}).length} 项`);
  else {
    console.log(`不等 ${bad.length} 处：`);
    for (const l of bad.slice(0, 200)) console.log(`  ${l}`);
    process.exitCode = 1;
  }
} else {
  console.log('用法见文件头：node tools/parity.ts run … | diff …');
  process.exitCode = 2;
}
