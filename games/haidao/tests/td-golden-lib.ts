import { readFileSync } from 'node:fs';
import { TIDE_MAPS, TIDE_MODS_FROM, runTdBot, tdCampaign, tdFingerprint, tdGrowthProfile, tdGrowthSetup, tdHomeSetup, tideMod, tideSetup } from '../src/core/index.ts';
import { TIDE_MOD_ORDER } from '../src/content/tdtide.ts';
import type { IsoWeek, TdBotKind, TdSetup } from '../src/core/index.ts';
import { LIVE_TIER_IDS, tdLiveSetup } from '../src/core/tdlive.ts';
import { tidePick } from '../src/core/tdtide.ts';

/**
 * 守岛指纹锁（只锁当前规则版本）：战役各关（建议养成，船长和航海士）、悬赏守岛四档、大潮四张图和每条海况、海盗来袭（主寨 6、8 级，普通档和加难档）
 * × 3 个种子 × 三种机器人（战役另加「照建议的新手」），打完一局的状态指纹加星数 / 丢失 / 波数 / 拍数必须逐位不变——
 * 规则、关卡数据、机器人任何一处改动都会让它变，所以改了守岛规则或配平后要有意重生成：`node tools/td-golden.ts`，并在提交说明里写清为什么。
 * 回放不保证跨版本，旧版本不另录。攻防（battle.ts）不读守岛的规则，它的指纹锁在 tests/raid-rules.test.ts。
 *
 * 一千多局一个文件串行要十几分钟，所以按清单序号取模分成 GOLDEN_SHARDS 片（tests/td-golden-<片>.test.ts），
 * vitest 每个文件一个进程并行跑；td-golden.test.ts 只列键不打局，锁住键的集合和顺序。指纹都在同一份 td-golden.json。
 */
export const GOLDEN_FILE = new URL('./td-golden.json', import.meta.url);
/** 分片数：GitHub 的机器 4 核，8 片让慢片和别的测试文件错开 */
export const GOLDEN_SHARDS = 8;
/** 海盗来袭进指纹锁的主寨等级：6 是加难档开放的那一级，8 是满级 */
const HOME_HQ = [6, 8];
const SEEDS = [1, 2, 3];
const BOTS: readonly TdBotKind[] = ['novice', 'normal', 'greedy'];

export interface GoldenJob {
  key: string;
  setup: TdSetup;
  bot: TdBotKind;
}

/** 每张大潮图（不镜像）对应的一周 */
function tideWeeks(): IsoWeek[] {
  const out: IsoWeek[] = [];
  for (let wk = 1; out.length < TIDE_MAPS.length && wk < 400; wk++) {
    const week: IsoWeek = { year: 2026 + Math.floor((wk - 1) / 52), week: ((wk - 1) % 52) + 1 };
    const p = tidePick(week);
    if (!p.mirror && !out[p.map]) out[p.map] = week;
  }
  return out;
}

/** 每条大潮海况轮到的第一周（从开始有海况的那周往后找） */
function modWeeks(): Array<[string, IsoWeek]> {
  const out: Array<[string, IsoWeek]> = [];
  for (let i = 0; out.length < TIDE_MOD_ORDER.length && i < 60; i++) {
    const wk = TIDE_MODS_FROM.week - 1 + i;
    const week: IsoWeek = { year: TIDE_MODS_FROM.year + Math.floor(wk / 52), week: (wk % 52) + 1 };
    const mod = tideMod(week);
    if (mod && !out.some(([m]) => m === mod)) out.push([mod, week]);
  }
  return out;
}

/** 全部局的清单，顺序就是 td-golden.json 里键的顺序 */
export function goldenJobs(): GoldenJob[] {
  const out: GoldenJob[] = [];
  const one = (key: string, setup: TdSetup, bot: TdBotKind): void => {
    out.push({ key, setup, bot });
  };
  for (const lv of tdCampaign()) {
    for (const seed of SEEDS) {
      const r = tdGrowthSetup(lv.id, 'suggest', seed);
      if (!r.ok) throw new Error(`${lv.id}: ${r.error}`);
      for (const bot of BOTS) one(`${lv.id}-${bot}-${seed}`, r.value, bot);
      one(`${lv.id}-guided-${seed}`, r.value, 'guided');
    }
  }
  for (const tier of LIVE_TIER_IDS) for (const seed of SEEDS) for (const bot of BOTS) one(`live-${tier}-${bot}-${seed}`, tdLiveSetup(tier, seed), bot);
  tideWeeks().forEach((week, i) => {
    for (const seed of SEEDS) for (const bot of BOTS) one(`tide${i}-${bot}-${seed}`, { ...tideSetup(week), seed }, bot);
  });
  for (const [mod, week] of modWeeks()) for (const seed of SEEDS) for (const bot of BOTS) one(`tidemod-${mod}-${bot}-${seed}`, { ...tideSetup(week), seed }, bot);
  for (const hq of HOME_HQ) for (const hard of [false, true]) for (const seed of SEEDS) {
    const r = tdHomeSetup(tdGrowthProfile({ hq }, 'suggest'), seed, hard);
    if (!r.ok) throw new Error(`home hq${hq}: ${r.error}`);
    for (const bot of BOTS) one(`home-${hard ? 'hard' : 'normal'}-hq${hq}-${bot}-${seed}`, r.value, bot);
  }
  for (const lv of tdCampaign()) {
    for (const seed of SEEDS) {
      const r = tdGrowthSetup(lv.id, 'suggest', seed, 'nav');
      if (!r.ok) throw new Error(`${lv.id}: ${r.error}`);
      for (const bot of BOTS) one(`nav-${lv.id}-${bot}-${seed}`, r.value, bot);
    }
  }
  for (const hq of HOME_HQ) for (const hard of [false, true]) for (const seed of SEEDS) {
    const r = tdHomeSetup(tdGrowthProfile({ hq }, 'suggest', 'nav'), seed, hard);
    if (!r.ok) throw new Error(`nav home hq${hq}: ${r.error}`);
    for (const bot of BOTS) one(`nav-home-${hard ? 'hard' : 'normal'}-hq${hq}-${bot}-${seed}`, r.value, bot);
  }
  return out;
}

/** 第 shard 片：清单里序号模 GOLDEN_SHARDS 余 shard 的局（取模而不是切段，各片的关卡和版本搭配均匀，耗时差不多） */
export function shardJobs(jobs: readonly GoldenJob[], shard: number): GoldenJob[] {
  return jobs.filter((_, i) => i % GOLDEN_SHARDS === shard);
}

export function runJob(j: GoldenJob): string {
  const r = runTdBot(j.setup, j.bot);
  return `${tdFingerprint(r.state)} s${r.result.stars} l${r.result.lost} w${r.result.waves} t${r.result.ticks}`;
}

export function readGolden(): Record<string, string> {
  return JSON.parse(readFileSync(GOLDEN_FILE, 'utf8')) as Record<string, string>;
}

/** 写回的格式和原来一样（一格缩进、末尾换行），键按清单顺序 */
export function goldenText(all: Record<string, string>): string {
  return JSON.stringify(all, null, 1) + '\n';
}
