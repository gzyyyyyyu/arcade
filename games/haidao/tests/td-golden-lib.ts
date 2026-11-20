import { readFileSync } from 'node:fs';
import { RULES_SINCE, RULES_VERSION, TIDE_MAPS, TIDE_MODS_FROM, runTdBot, tdCampaign, tdFingerprint, tdGrowthProfile, tdGrowthSetup, tdHomeSetup, tideMod, tideSetup } from '../src/core/index.ts';
import { TIDE_MOD_ORDER } from '../src/content/tdtide.ts';
import type { IsoWeek, TdBotKind, TdSetup } from '../src/core/index.ts';
import { LIVE_TIER_IDS, tdLiveSetup } from '../src/core/tdlive.ts';
import { tidePick } from '../src/core/tdtide.ts';

/**
 * 守岛 2.0 指纹锁（键名带规则版本）：战役各关（建议养成）、悬赏守岛四档、大潮四张图 × 3 个种子 × 三种机器人，
 * 打完一局的状态指纹加星数 / 丢失 / 波数 / 拍数必须逐位不变——规则、关卡数据、机器人任何一处改动都会让它变，
 * 所以改了守岛规则或配平后要有意重生成：`node tools/td-golden.ts`，并在提交说明里写清为什么。
 * 攻防（battle.ts）不读守岛的新规则，它的指纹锁在 tests/raid-rules.test.ts。
 *
 * 两千多局一个文件串行要半个多小时，所以按清单序号取模分成 GOLDEN_SHARDS 片（tests/td-golden-<片>.test.ts），
 * vitest 每个文件一个进程并行跑；td-golden.test.ts 只列键不打局，锁住键的集合和顺序。指纹都在同一份 td-golden.json。
 *
 * 每一局按各个规则版本都打一遍：升版本前录的旧键，把 setup 的 rules 改回旧版本必须逐位一样（旧回放照原样放），新版本另录一组键。
 * 重生成后 diff 确认旧键一字不差，只多出新版本的键。各版本只改了什么：
 * - 10（震荡炮、掷弹兵）、11（狙击塔、盾兵）、12（进攻寻敌，守岛不变，指纹应与 v11 同）；13 只改登陆战，守岛和 12 一样，不另录；
 * - 14（英雄自己守）只改守岛；15（守岛精英，只改战役 td07 / td10 / td14），除这三关外 v15- 和 v14- 逐个相同（tests/td-elite.test.ts 另锁大潮、悬赏守岛）；
 * - 16（章末机制，只改战役 td05 / td06 / td11 / td12 / td17 / td18），除这六关外 v16- 和 v15- 逐个相同（tests/td-mech.test.ts 另锁几关）；
 * - 17（大副，只改 td16），除 td16 外 v17- 和 v16- 逐个相同；
 * - 18（第四章 td19 起）：第四章的关只在 v18 起算，前 18 关的 v18- 和 v17- 逐个相同；
 * - 19（友军巡航船、海盗王，td23、td24）：这两关只在 v19 起算，别的关的 v19- 和 v18- 逐个相同；
 * - 20（英雄锚钩、海盗来袭加难档）：英雄够 8 级的战役局（机器人会钩）才和 v19- 不同，悬赏守岛、大潮的 v20- 和 v19- 逐个相同（tests/td-hook.test.ts 锁住）；
 *   海盗来袭（主寨 6、8 级，普通档和加难档）从 v20 起才进指纹锁，`v20-home-*`；
 * - 21（海盗来袭的登陆点按布局挑）：只改 `v21-home-*` 里登陆点离宝藏箱不够远的局，别的键 v21- 和 v20- 逐个相同（tests/td-home.test.ts 锁住）。
 * - 22（关内事件、大潮每周海况）：只改写了 events 的 12 关，别的键 v22- 和 v21- 逐个相同（tests/td-event.test.ts 锁住）；
 *   大潮每周海况从 v22 起进指纹锁，每条海况挑它轮到的第一周，`v22-tidemod-<海况>-*`。
 * - 23（第二个英雄航海士）：选船长的局一律不变，v23- 和 v22- 逐个相同（tests/td-nav.test.ts 锁住）；带航海士的局从 v23 起另录
 *   `v23-nav-<关>-*`（战役各关，建议养成）和 `v23-nav-home-*`（海盗来袭，主寨 6、8 级，普通档和加难档）。
 * - 24（战役几关前几波放宽，关卡的 ease）：只改写了 ease 的关，别的键 v24- 和 v23- 逐个相同（tests/td-ease.test.ts 锁住）；
 *   照建议的新手（guided）从 v24 起只录战役关，`v24-<关>-guided-*`。
 * - 25（护航新手档放宽、娱乐护航开局跟随）只改护航，守岛各玩法和 24 一样，不另录；护航的锁在 tests/escort-golden.test.ts。
 * - 26（第五章「断崖海岸」td25–td30：断崖格、崖上高台、盾兵进战役）：第五章的关只在 v26 起算，别的键 v26- 和 v24- 逐个相同
 *   （tests/td-cliff.test.ts 锁住）；断崖关以外的盾兵（海盗来袭）照旧。
 * v10 中档 0.29.1 前未开放（线上没有 v10 中档的对局），指纹随 0.29.1 的配平（hpPct 180 → 190）更新，只动了 v10-live-mid-* 9 个键。
 */
export const GOLDEN_FILE = new URL('./td-golden.json', import.meta.url);
/** 分片数：GitHub 的机器 4 核，8 片让慢片和别的测试文件错开 */
export const GOLDEN_SHARDS = 8;
const VERSIONS = [9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 26];
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
    const mod = tideMod(week, RULES_VERSION);
    if (mod && !out.some(([m]) => m === mod)) out.push([mod, week]);
  }
  return out;
}

/** 全部局的清单，顺序就是 td-golden.json 里键的顺序 */
export function goldenJobs(): GoldenJob[] {
  const out: GoldenJob[] = [];
  const weeks = tideWeeks();
  for (const rules of VERSIONS) {
    if (rules > RULES_VERSION) continue;
    const V = `v${rules}`;
    const one = (key: string, setup: TdSetup, bot: TdBotKind): void => {
      out.push({ key: `${V}-${key}`, setup: { ...setup, rules }, bot });
    };
    for (const lv of tdCampaign()) {
      // 第四章是规则版本 18 才有的关：旧版本下不算（旧版本的键和加第四章以前一字不差）
      if (lv.chapter === 4 && rules < RULES_SINCE.tdChapter4) continue;
      // 带友军船的关（td23、td24）是规则版本 19 才有的
      if (lv.fleet && rules < RULES_SINCE.tdFleet) continue;
      // 第五章（断崖关）是规则版本 26 才有的
      if (lv.chapter === 5 && rules < RULES_SINCE.tdCliffs) continue;
      for (const seed of SEEDS) {
        const r = tdGrowthSetup(lv.id, 'suggest', seed);
        if (!r.ok) throw new Error(`${lv.id}: ${r.error}`);
        for (const bot of BOTS) one(`${lv.id}-${bot}-${seed}`, r.value, bot);
        // 照建议的新手是规则 24 给战役配平加的量尺，只在战役关、v24 起录（旧键不动）
        if (rules >= RULES_SINCE.tdEase) one(`${lv.id}-guided-${seed}`, r.value, 'guided');
      }
    }
    for (const tier of LIVE_TIER_IDS) for (const seed of SEEDS) for (const bot of BOTS) one(`live-${tier}-${bot}-${seed}`, tdLiveSetup(tier, seed), bot);
    weeks.forEach((week, i) => {
      for (const seed of SEEDS) for (const bot of BOTS) one(`tide${i}-${bot}-${seed}`, { ...tideSetup(week, rules), seed }, bot);
    });
    if (rules >= RULES_SINCE.tdEvents) {
      for (const [mod, week] of modWeeks()) for (const seed of SEEDS) for (const bot of BOTS) one(`tidemod-${mod}-${bot}-${seed}`, { ...tideSetup(week, rules), seed }, bot);
    }
    if (rules >= RULES_SINCE.tdHook) {
      for (const hq of HOME_HQ) for (const hard of [false, true]) for (const seed of SEEDS) {
        // 按这一版的规则开局：规则 21 起登陆点按布局挑，开局本身就不一样，不能先按新版开再改 rules
        const r = tdHomeSetup(tdGrowthProfile({ hq }, 'suggest'), seed, hard, rules);
        if (!r.ok) throw new Error(`home hq${hq}: ${r.error}`);
        for (const bot of BOTS) one(`home-${hard ? 'hard' : 'normal'}-hq${hq}-${bot}-${seed}`, r.value, bot);
      }
    }
    if (rules >= RULES_SINCE.tdNav) {
      for (const lv of tdCampaign()) {
        if (lv.chapter === 5 && rules < RULES_SINCE.tdCliffs) continue;
        for (const seed of SEEDS) {
          const r = tdGrowthSetup(lv.id, 'suggest', seed, 'nav');
          if (!r.ok) throw new Error(`${lv.id}: ${r.error}`);
          for (const bot of BOTS) one(`nav-${lv.id}-${bot}-${seed}`, r.value, bot);
        }
      }
      for (const hq of HOME_HQ) for (const hard of [false, true]) for (const seed of SEEDS) {
        const r = tdHomeSetup(tdGrowthProfile({ hq }, 'suggest', 'nav'), seed, hard, rules);
        if (!r.ok) throw new Error(`nav home hq${hq}: ${r.error}`);
        for (const bot of BOTS) one(`nav-home-${hard ? 'hard' : 'normal'}-hq${hq}-${bot}-${seed}`, r.value, bot);
      }
    }
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
