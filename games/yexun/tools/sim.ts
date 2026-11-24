/**
 * 机器人模拟（DESIGN.md 第 8 节）：node tools/sim.ts [--n 局数] [--danger 0,2,4 | --diff easy,normal,hard] [--skill novice,normal] [--build sword,talisman,ward,wood,fire | 流派:路线，见 bots.ts ROUTES] [--map snow|yizhuang] [--char xiaodao|fushi|jianxia|pang|gengfu|caiyao] [--live 按实盘局开] [--noskill 机器人不放技能] [--pool 角色id|all 法器池] [--start alt 第二件起手=另一主修的核心件，规则 52] [--xinfa 流派|auto 心法，auto = --build 的流派，不是本角色主修就不带] [--threads N] [--json 文件] [--from 偏移]
 * --mode rush：首领连战（docs/design-play.md 2.5），每格 = 危险 × 玩家 × 配装。缺省每日（--day 起连着 n 天，危险按每日）；--free 自由连战（种子 from+1..，--danger 0,2,4）；
 *   --preset 0|1|2|rand（推荐配装 稳 / 猛 / 双，rand = 按种子轮流，可逗号列几套各成一格）、--hex fast,fierce（咒）、--skill novice,normal、--char、--threads（默认 4）、--json。
 *   --live small,medium：实盘连战（platform/live.ts liveRushSetup，配装按 --preset、默认三套各 1/3），每格多报实盘期望（rushBp）。
 *   报：全清率、平均打到第几关、第一关倒下、到终局后打倒率、局内和估真人局长、纸钱进出、每关倒下和秒数；「卡住」不为 0 说明机器人和核心的菜单对不上。
 * --trial chuye,dumu | all：试炼（content/trials.ts），每关跑 --n 局（种子 from+1..），报通关率 ± 2SE 和平均完成度；单进程，并行就分几个进程各跑几关。
 * --json：把每局的结局（赢没赢、打没打倒尸王、撑了几拍）按格存下来，第 7 步离线调实盘倍数曲线用（曲线不影响对局，改曲线不用重跑）。
 *
 * --from：种子从 from+1 起（默认 0），把一格拆成几片分到不同机器上跑，再用 tools/sim-merge.ts 拼表。
 *
 * --stop（要配 --live）：每格（同一档的小白、普通两条线）按批跑（--batch，默认 50 局），每批后看两条线实盘期望的 ±2SE 区间，
 * 「要不要动系数」都定了（压 / 抬 / 不用动，口径和配平的修正规则一致，见 tools/early-stop.ts）就停；最少 --min（默认 100）局，最多 --n 局。
 * 表和 json 里写每格实际跑了几局、为什么停。种子照样从 from+1 顺着排，提前停的结果就是跑满那一格的前 N 局。
 *
 * 每个组合跑 N 局（种子 from+1..from+N），报：胜率（撑到天亮）± 2 倍标准误、平均撑了多久、打倒尸王的比例、
 * 节奏指标（第一次升级、3 分钟 / 5 分钟内升级次数、全局升级次数、7:30 以后每分钟升级次数，DESIGN.md 13.3）、击杀、一局耗时。
 * 多线程：每个线程跑一部分种子，结果按种子顺序合并，和线程数无关。
 */
import { CHARACTER_IDS, type CharacterId } from '../src/content/meta.ts';
import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { createWorld, Pick, rushPresets, rushResult, step, trialResult, Ev, type Setup } from '../src/core/index.ts';
import { RUSH_HEX_IDS, RUSH_TOTAL, type RushHexId } from '../src/content/rush.ts';
import { isTrialId, TRIAL_IDS, TRIAL_TIERS, TRIALS, type TrialId } from '../src/content/trials.ts';
import { rushDaily, rushFree, withLoadout } from '../src/online/rush.ts';
import { liveRushSetup, type RushPreset } from '../src/platform/live.ts';
import { shiftDate } from '../src/online/daily.ts';
import { writeFileSync } from 'node:fs';
import { DIFFICULTIES, type Danger } from '../src/content/waves.ts';
import { LIVE_RUSH_TIERS, LIVE_TIERS, rushBp, tierOfDanger, vigilBp, type LiveTier } from '../src/content/live.ts';
import { MAPS, type MapId } from '../src/content/maps.ts';
import { Bot, routeDone, type Build, type Skill } from './bots.ts';
import { RaidBot } from '../src/explore/bot.ts';
import { settleRaid } from '../src/explore/settle.ts';
import '../src/explore/register.ts';
import { RAID_LIVE, RAID_TEMPLATES, RAID_LIVE_TIERS, type RaidLiveTier, type RaidTemplateId } from '../src/content/explore.ts';
import { MERGES } from '../src/content/weapons.ts';
import { mainSchools } from '../src/content/pools.ts';
import type { SchoolId } from '../src/content/guide.ts';
import { STOP_DEFAULTS, stopWhy, tierOf, type StopWhy } from './early-stop.ts';


export interface RunResult {
  won: boolean;
  boss: boolean;
  seconds: number;
  firstLevel: number;
  levels3: number;
  levels5: number;
  levels: number;
  /** 7:30 以后每分钟升几级 */
  late: number;
  kills: number;
  elites: number;
  /** 撑了几拍（实盘倍数按它算） */
  ticks: number;
  /** 夜探：撤出时背包的价值（没撤出是 0）；守夜是 0 */
  value: number;
  /** 合成了几件双修（1.1 验收：普通机器人每 20 局至少 5 次） */
  duals: number;
  /** 搭配路线走成了没有（`--build 流派:路线`；没指定路线是 false） */
  routed: boolean;
  /** 第一次合成双修是第几拍（没合成 -1）：比"合成那一刻还活着的局"的胜率用 */
  dualTick: number;
  /** 输了的局最后一下是谁打的（怪的编号；远程弹 1000 + 弹种；赢了或不明 -1） */
  killer: number;
  /** 夜探实盘：结回倍数（万分比，没撤出 0）；其余 0 */
  bp?: number;
  /** 局里捡到的铜钱和来源（量铜钱进账用，结算加成在 platform/save.ts runCoins） */
  coins?: number;
  coinBy?: { drop: number; purse: number; prop: number; chest: number; weekly: number };
  /** 招财进宝多掉的、局里花掉的（platform/save.ts carryCoins 用） */
  coinFortune?: number;
  coinSpent?: number;
}
const dualsOf = (w: { merges: readonly string[] }): number => w.merges.filter((id) => MERGES.find((m) => m.id === id)?.dual).length;

/** 夜探的玩家模型：小白门一开就走；普通搜到 10 分钟再走；贪心搜到 13 分钟（DESIGN.md 2.3、4.2） */
export const RAID_LEAVE: Record<string, number> = { novice: 0, normal: 600 * 30, greedy: 780 * 30 };

/** 夜探一局：RaidBot 指路（去哪），守夜的机器人躲怪、选卡；返回结局和带出价值 */
export function runRaid(seed: number, danger: Danger, who: string, build: Build, template: RaidTemplateId, character: CharacterId = 'xiaodao', skills = true, liveTier?: RaidLiveTier, loadout: Pick<Setup, 'startAlt' | 'xinfa'> = {}): RunResult {
  // 实盘局：和 platform/live.ts liveSetup 一样的配置（危险按实盘档、不带加成），结回倍数 bp 由 settleRaid 算
  // loadout：开局配置（规则 52），按起手配对比较时用；sim 命令行不带
  const w = createWorld(liveTier ? { seed, mode: 'raid', danger: RAID_LIVE.danger[liveTier] as Danger, raid: { template, live: liveTier }, character, perks: {}, assist: false, live: true, ...loadout } : { seed, mode: 'raid', danger, raid: { template }, character, ...loadout });
  const bot = new Bot(who === 'novice' ? 'novice' : 'normal', build, seed, { skills });
  const leave = RAID_LEAVE[who] ?? 0;
  const guide = new RaidBot(w.raid!, leave);
  let guard = 0;
  while (w.phase !== 'over' && guard++ < 200_000) {
    if (w.phase !== 'choose') {
      const d = guide.dir(w.x, w.y, w.tick, w.coins);
      bot.goal = d === 0 ? -1 : d;
      bot.detour = !(w.raid!.gateMask !== 0 && w.tick >= leave);
    }
    const a = bot.act(w);
    step(w, a.dir, a.choice, a.skill);
  }
  const won = w.raid!.outcome === 'escaped';
  return { won, boss: false, seconds: w.tick / 30, firstLevel: 0, levels3: 0, levels5: 0, levels: w.level - 1, late: 0, kills: w.kills, elites: 0, ticks: w.tick, value: won ? settleRaid(w.raid!, 0).value : 0, duals: dualsOf(w), routed: false, dualTick: -1, killer: won ? -1 : w.hurtBy, bp: won && liveTier ? settleRaid(w.raid!, 0).bp : 0, coins: w.coins, coinBy: { ...w.coinBy }, coinFortune: w.coinFortune, coinSpent: w.coinSpent };
}

/** 连战一局的开法：每日（--day 起的日期，危险按每日）或自由（种子、--danger）；配装是第几套推荐（rand = 按种子轮流）；咒 */
export interface RushOpts {
  free: boolean;
  /** 实盘连战（platform/live.ts liveRushSetup：小道士、三套推荐之一、不带咒，危险按档）；有它时 free、danger、hexes、char 不看 */
  live?: LiveTier;
  danger: Danger;
  preset: number | 'rand';
  hexes: RushHexId[];
  skill: Skill;
  char: CharacterId;
  /** 每日：第一天；第 k 局是这天往后第 k 天 */
  day: string;
}

export interface RushRun {
  /** 打倒几只（双煞一关算两只）、打完几关（0–11）、全清（打倒夜漏君）、倒下 */
  down: number;
  stages: number;
  cleared: boolean;
  dead: boolean;
  /** 局内拍数（菜单停拍不算） */
  ticks: number;
  /** 每关打了几拍（没打完的关是 -1）；下标 0–9 是路线图的列，10 是终局 */
  stage: number[];
  /** 纸钱进账、花掉 */
  coinsIn: number;
  coinsOut: number;
  /** 进了几次菜单（选卡、路线、驿站；真人局长按每次约 20 秒估） */
  menus: number;
  /** 走了几次精英路 */
  elites: number;
  /** 用的第几套推荐配装 */
  preset: number;
  /** 实盘：结回倍数（万分比，rushBp）；娱乐 0 */
  bp: number;
  /** 机器人按的键核心没接受（菜单卡住）几次；整局没结束就被截断记 truncated */
  stuck: number;
  truncated: boolean;
}

/** 一局连战最多跑几步（菜单也算步）：20 分钟局内 + 菜单，远超正常局长 */
const RUSH_GUARD = 30 * 60 * 25;

/**
 * 首领连战一局（docs/design-play.md 2.5）：机器人按推荐配装开局、按心法流派选卡，走路线图、驿站。
 * 种子：每日是那天的种子（危险按每日固定），自由是 seed 本身。
 */
export function runRush(seed: number, o: RushOpts): RushRun {
  const preset = (o.preset === 'rand' ? seed % 3 : o.preset) as RushPreset;
  const setup: Setup = o.live
    ? liveRushSetup(o.live, seed, preset)
    : withLoadout(o.free ? rushFree(seed, o.danger) : rushDaily(shiftDate(o.day, seed - 1)).setup, rushPresets(o.char)[preset], o.hexes);
  const w = createWorld(setup);
  const loadout = w.setup.rushLoadout!;
  const bot = new Bot(o.skill, loadout.xinfa, seed, { skills: true });
  const stage = new Array<number>(RUSH_TOTAL).fill(-1);
  let coinsIn = 0;
  let coinsOut = 0;
  let menus = 0;
  let elites = 0;
  let coins = w.rushCoins;
  let k = w.rushStage;
  let inMenu = '';
  let guard = 0;
  while (w.phase !== 'over' && guard++ < RUSH_GUARD) {
    const a = bot.act(w);
    if (w.phase === 'choose' && w.menu === 'route' && a.choice >= Pick.Route && a.choice < Pick.Buy && w.rush!.layers[w.rushStage]?.[a.choice - Pick.Route]?.elite) elites++;
    step(w, a.dir, a.choice, a.skill);
    const menu = w.phase === 'choose' ? `${w.menu}${w.rushStage}` : '';
    if (menu && menu !== inMenu) menus++;
    inMenu = menu;
    if (w.rushCoins > coins) coinsIn += w.rushCoins - coins;
    else coinsOut += coins - w.rushCoins;
    coins = w.rushCoins;
    if (w.rushStage !== k) {
      if (k < RUSH_TOTAL) stage[k] = w.tick - w.rushFrom;
      k = w.rushStage;
    }
  }
  const r = rushResult(w)!;
  return { down: r.down, stages: Math.min(RUSH_TOTAL, w.rushStage), cleared: r.cleared, dead: w.hp <= 0, ticks: r.ticks, stage, coinsIn, coinsOut, menus, elites, preset, bp: o.live ? rushBp(o.live, r.down, r.total, r.cleared) : 0, stuck: bot.stuck, truncated: w.phase !== 'over' };
}

/**
 * 试炼一局：配置按表展开（Setup.trial），机器人按白名单流派、没有就按角色第一主修流派选卡；夜探按普通玩家搜到 10 分钟再走。
 * 返回通关没有、完成度、撑了几秒
 */
export function runTrial(seed: number, id: TrialId, skill: Skill): { won: boolean; progress: number; seconds: number } {
  const t = TRIALS[id];
  const w = createWorld({ seed, mode: t.mode, danger: t.danger, trial: id });
  const build = (t.only ?? mainSchools(t.character as CharacterId)[0]!) as Build;
  const bot = new Bot(skill, build, seed);
  const guide = w.raid ? new RaidBot(w.raid, RAID_LEAVE.normal!) : null;
  let guard = 0;
  while (w.phase !== 'over' && guard++ < 200_000) {
    if (guide && w.phase !== 'choose') {
      const d = guide.dir(w.x, w.y, w.tick, w.coins);
      bot.goal = d === 0 ? -1 : d;
      bot.detour = !(w.raid!.gateMask !== 0 && w.tick >= RAID_LEAVE.normal!);
    }
    const a = bot.act(w);
    step(w, a.dir, a.choice, a.skill);
  }
  const value = w.raid && w.raid.outcome === 'escaped' ? settleRaid(w.raid, 0).value : 0;
  const r = trialResult(w, value)!;
  return { won: r.won, progress: r.progress, seconds: w.tick / 30 };
}

export function runOne(seed: number, danger: Danger, skill: Skill, build: Build, map: MapId = 'snow', character: CharacterId = 'xiaodao', noDual = false, tall = false, live = false, pool: CharacterId | 'all' | '' = '', skills = true, startAlt = false, xinfa = ''): RunResult {
  const w = createWorld({ seed, mode: 'vigil', danger, map, character, ...(startAlt ? { startAlt } : {}), ...(xinfa ? { xinfa: xinfa as SchoolId } : {}), ...(noDual ? { noDual } : {}), ...(tall ? { tall } : {}), ...(live ? { live } : {}), ...(pool ? { pool } : {}) });
  const bot = new Bot(skill, build, seed, { skills });
  let firstLevel = -1;
  let levels3 = 0;
  let levels5 = 0;
  let elites = 0;
  let late = 0;
  let dualTick = -1;
  let guard = 0;
  while (w.phase !== 'over' && guard++ < 200_000) {
    const a = bot.act(w);
    step(w, a.dir, a.choice, a.skill);
    const ev = w.ev;
    for (let i = 0; i < ev.n; i++) {
      const t = ev.type[i];
      if (t === Ev.LevelUp) {
        if (firstLevel < 0) firstLevel = w.tick / 30;
        if (w.tick <= 30 * 180) levels3++;
        if (w.tick <= 30 * 300) levels5++;
        if (w.tick > 30 * 450) late++;
      } else if (t === Ev.Kill && ev.b[i] === 1) elites++;
      else if (t === Ev.Merge && dualTick < 0 && MERGES[ev.a[i]!]?.dual) dualTick = w.tick;
    }
  }
  return { won: w.won, boss: w.bossKilled, seconds: w.tick / 30, firstLevel, levels3, levels5, levels: w.level - 1, late: late / Math.max(1, (w.tick - 30 * 450) / 1800), kills: w.kills, elites, ticks: w.tick, value: 0, duals: dualsOf(w), routed: bot.route ? routeDone(w, bot.route) : false, dualTick, killer: w.won ? -1 : w.hurtBy, coins: w.coins, coinBy: { ...w.coinBy }, coinFortune: w.coinFortune, coinSpent: w.coinSpent };
}

/** 夜探实盘的危险 → 档（小 0、中 1、大 2） */
const tierOfRaidDanger = (d: number): RaidLiveTier | undefined => RAID_LIVE_TIERS.find((t) => RAID_LIVE.danger[t] === d);

interface Cell {
  diff: Danger;
  /** 守夜：novice / normal；夜探另有 greedy（见 RAID_LEAVE） */
  skill: string;
  build: Build;
}

/** 发给工作线程的一小段活：某一格的几个种子（小块 + 全局队列，快慢局自动均衡，格与格之间不用等） */
interface Task {
  id: number;
  cell: Cell;
  /** 守夜的地图，或夜探的镇子模板（raid 为真时） */
  map: string;
  raid: boolean;
  /** 守夜的出战角色（--char） */
  char: CharacterId;
  /** --nodual：双修对照臂（条件满足也不合） */
  noDual: boolean;
  tall: boolean;
  /** --live：按实盘局开（Setup.live，老卡池，不放 2.0 新内容） */
  live: boolean;
  /** --pool：法器池按这个 id（'all' 不限池） */
  pool: CharacterId | 'all' | '';
  /** 机器人放技能（--noskill 关） */
  skills: boolean;
  /** --start alt */
  startAlt: boolean;
  /** --xinfa（auto 已按每格的 --build 在主线程换成流派；空 = 不带） */
  xinfa: string;
  seeds: number[];
}

/** 连战的一小段活：同一格的几个种子 */
interface RushTask {
  id: number;
  rush: RushOpts;
  seeds: number[];
}

/** 用 threads 个常驻工作线程跑完所有连战任务，结果按任务 id 回填 */
async function runRushPool(tasks: RushTask[], threads: number, done: (id: number, rs: RushRun[]) => void): Promise<void> {
  let next = 0;
  let left = tasks.length;
  await new Promise<void>((resolve, reject) => {
    if (!left) return resolve();
    const workers: Worker[] = [];
    for (let k = 0; k < Math.min(threads, tasks.length); k++) {
      const wk = new Worker(new URL(import.meta.url));
      workers.push(wk);
      wk.on('error', reject);
      wk.on('message', (m: { id: number; rs: RushRun[] }) => {
        done(m.id, m.rs);
        if (--left === 0) {
          for (const x of workers) void x.terminate();
          resolve();
        } else if (next < tasks.length) wk.postMessage(tasks[next++]);
      });
      wk.postMessage(tasks[next++]);
    }
  });
}

if (!isMainThread) {
  // 常驻工作线程：每个进程只启动一次（导入核心和内容表要几百毫秒），一直接活到被关掉
  parentPort!.on('message', (t: Task | RushTask) => {
    if ('rush' in t) return parentPort!.postMessage({ id: t.id, rs: t.seeds.map((s) => runRush(s, t.rush)) });
    parentPort!.postMessage({ id: t.id, rs: t.seeds.map((s) => (t.raid ? runRaid(s, t.cell.diff, t.cell.skill, t.cell.build, t.map as RaidTemplateId, t.char, t.skills, t.live ? tierOfRaidDanger(t.cell.diff) : undefined) : runOne(s, t.cell.diff, t.cell.skill as Skill, t.cell.build, t.map as MapId, t.char, t.noDual, t.tall, t.live, t.pool, t.skills, t.startAlt, t.xinfa))) });
  });
} else if (process.argv[1]?.endsWith('sim.ts')) {
  const arg = (name: string, def: string): string => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1]! : def;
  };
  const n = Number(arg('--n', '200'));
  const seedFrom = Number(arg('--from', '0'));
  if (process.argv.includes('--trial')) {
    const want = arg('--trial', 'all');
    const ids = want === 'all' ? TRIAL_IDS : want.split(',').filter(isTrialId);
    const skill = arg('--skill', 'normal') as Skill;
    for (const id of ids) {
      const t0 = Date.now();
      const rs = Array.from({ length: n }, (_, i) => runTrial(seedFrom + i + 1, id, skill));
      const p = rs.filter((r) => r.won).length / n;
      const se = Math.sqrt((p * (1 - p)) / n);
      const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
      const t = TRIALS[id];
      console.log(`${id} ${t.name}（${TRIAL_TIERS[t.tier]!.name}）· ${skill} · ${n} 局：通关 ${(p * 100).toFixed(0)}% ±${(2 * se * 100).toFixed(0)} · 平均完成度 ${avg(rs.map((r) => r.progress)).toFixed(0)} · 平均撑 ${avg(rs.map((r) => r.seconds)).toFixed(0)} 秒 · ${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
    }
    process.exit(0);
  }
  if (arg('--mode', 'vigil') === 'rush') {
    // 首领连战（docs/design-play.md 2.5、第 8 节目标）：每格 = 危险 × 玩家 × 配装；每日按 --day 起连着 n 天（危险按每日），--free 按种子 from+1.. 随机开
    // --live small,medium：实盘连战（种子 from+1..，配装按 --preset，默认三套轮流），每格再报实盘期望
    const liveArg = process.argv.includes('--live') ? arg('--live', '') : null;
    const lives = liveArg === null ? [] : ((!liveArg || liveArg.startsWith('--') ? LIVE_RUSH_TIERS.join(',') : liveArg).split(',') as LiveTier[]);
    for (const t of lives) if (!LIVE_RUSH_TIERS.includes(t)) throw new Error(`--live 只认 ${LIVE_RUSH_TIERS.join('/')}，收到 ${t}`);
    const free = process.argv.includes('--free') || lives.length > 0;
    const day = arg('--day', '2026-11-01');
    const dangers = (free ? arg('--danger', '2') : String(rushDaily(day).setup.danger)).split(',').map((d) => Number(d) as Danger);
    const skills = arg('--skill', 'novice,normal').split(',') as Skill[];
    const presets = arg('--preset', 'rand').split(',').map((p) => (p === 'rand' ? 'rand' : Number(p))) as (number | 'rand')[];
    for (const p of presets) if (p !== 'rand' && !(p >= 0 && p <= 2)) throw new Error(`--preset 只认 0、1、2、rand，收到 ${p}`);
    const hexes = arg('--hex', '').split(',').filter(Boolean) as RushHexId[];
    for (const h of hexes) if (!RUSH_HEX_IDS.includes(h)) throw new Error(`--hex 只认 ${RUSH_HEX_IDS.join('/')}，收到 ${h}`);
    const char = arg('--char', 'xiaodao') as CharacterId;
    if (!(CHARACTER_IDS as readonly string[]).includes(char)) throw new Error(`--char 只认 ${CHARACTER_IDS.join('/')}`);
    const threads = Math.max(1, Number(arg('--threads', '4')));
    const chunk = Math.max(1, Number(arg('--chunk', '4')));
    const jsonOut = arg('--json', '');
    const cells: RushOpts[] = [];
    if (lives.length) for (const live of lives) for (const skill of skills) for (const preset of presets) cells.push({ free, live, danger: LIVE_TIERS[live].danger, preset, hexes: [], skill, char: 'xiaodao', day });
    else for (const danger of dangers) for (const skill of skills) for (const preset of presets) cells.push({ free, danger, preset, hexes, skill, char, day });
    const results: RushRun[][] = cells.map(() => new Array<RushRun>(n));
    const tasks: RushTask[] = [];
    const owner: { cell: number; from: number }[] = [];
    cells.forEach((rush, ci) => {
      for (let from = 0; from < n; from += chunk) {
        const seeds: number[] = [];
        for (let s = from; s < Math.min(n, from + chunk); s++) seeds.push(seedFrom + s + 1);
        owner.push({ cell: ci, from });
        tasks.push({ id: tasks.length, rush, seeds });
      }
    });
    const t0 = Date.now();
    await runRushPool(tasks, threads, (id, rs) => rs.forEach((r, j) => (results[owner[id]!.cell]![owner[id]!.from + j] = r)));
    const m = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    const pct = (xs: boolean[]): string => {
      const p = m(xs.map((x) => (x ? 1 : 0)));
      return `${(p * 100).toFixed(0)}% ±${(2 * Math.sqrt((p * (1 - p)) / Math.max(1, xs.length)) * 100).toFixed(0)}`;
    };
    const presetName = (p: number | 'rand'): string => (p === 'rand' ? '三套轮流' : ['稳', '猛', '双'][p]!);
    /** 每局结回 − 1 份的均值 ±2SE */
    const ev = (rs: RushRun[]): string => {
      const xs = rs.map((r) => r.bp / 10_000 - 1);
      const mu = m(xs);
      return `${mu >= 0 ? '+' : ''}${mu.toFixed(3)} ±${((2 * Math.sqrt(m(xs.map((x) => (x - mu) * (x - mu))))) / Math.sqrt(Math.max(1, xs.length))).toFixed(3)}`;
    };
    console.log(`首领连战 · ${lives.length ? `实盘 ${lives.join(',')}（种子 ${seedFrom + 1} 起）` : free ? `自由（种子 ${seedFrom + 1} 起）` : `每日（${shiftDate(day, seedFrom)} 起）`} · ${char}${hexes.length ? ` · 咒 ${hexes.join(',')}` : ''} · 每格 ${n} 局 · ${threads} 线程`);
    console.log(`${lives.length ? '档位 | ' : ''}危险 | 玩家 | 配装 | 全清 ±2SE | 平均打到第几关 | 第一关倒下 | 到终局 | 到终局后打倒 | 局内 | 估真人局长 | 精英路 | 纸钱进/出 | 卡住${lives.length ? ' | 实盘期望 ±2SE（份）' : ''}`);
    for (const [ci, c] of cells.entries()) {
      const rs = results[ci]!;
      const reach = rs.map((r) => Math.min(RUSH_TOTAL, r.stages + 1));
      const final = rs.filter((r) => r.stages >= RUSH_TOTAL - 1);
      const stuck = rs.reduce((a, r) => a + r.stuck, 0);
      const cut = rs.filter((r) => r.truncated).length;
      console.log(
        [
          ...(c.live ? [c.live] : []),
          c.danger,
          c.skill,
          presetName(c.preset),
          pct(rs.map((r) => r.cleared)),
          m(reach).toFixed(1),
          pct(rs.map((r) => r.dead && r.stages === 0)),
          `${((final.length / Math.max(1, n)) * 100).toFixed(0)}%`,
          final.length ? pct(final.map((r) => r.cleared)) : '-',
          `${(m(rs.map((r) => r.ticks)) / 1800).toFixed(1)} 分`,
          `${m(rs.map((r) => r.ticks / 1800 + (r.menus * 20) / 60)).toFixed(1)} 分`,
          m(rs.map((r) => r.elites)).toFixed(1),
          `${m(rs.map((r) => r.coinsIn)).toFixed(0)}/${m(rs.map((r) => r.coinsOut)).toFixed(0)}`,
          stuck || cut ? `${stuck} 次${cut ? `，${cut} 局截断` : ''}` : '0',
          ...(c.live ? [ev(rs)] : []),
        ].join(' | '),
      );
      // 每关：倒在这关的局数、打完这关的平均秒数（第 11 关是夜漏君）
      const deaths = Array.from({ length: RUSH_TOTAL }, (_, k) => rs.filter((r) => !r.cleared && r.dead && r.stages === k).length);
      const secs = Array.from({ length: RUSH_TOTAL }, (_, k) => {
        const xs = rs.map((r) => r.stage[k]!).filter((x) => x >= 0);
        return xs.length ? (m(xs) / 30).toFixed(0) : '-';
      });
      console.log(`   每关倒下 ${deaths.map((d, k) => `${k + 1}:${d}`).join(' ')}`);
      console.log(`   每关秒数 ${secs.map((x, k) => `${k + 1}:${x}`).join(' ')}`);
      if (c.preset === 'rand') console.log(`   各套全清 ${[0, 1, 2].map((p) => `${presetName(p)} ${pct(rs.filter((r) => r.preset === p).map((r) => r.cleared))}${c.live ? `（期望 ${ev(rs.filter((r) => r.preset === p))}）` : ''}`).join(' · ')}`);
    }
    if (jsonOut) {
      // 每局 [打倒几只, 打完几关, 全清, 倒下, 局内拍数, 菜单次数, 纸钱进, 纸钱出, 配装, 结回万分比, 每关拍数…]
      writeFileSync(jsonOut, JSON.stringify(cells.map((c, i) => ({ ...c, mode: 'rush', from: seedFrom, runs: results[i]!.map((r) => [r.down, r.stages, r.cleared ? 1 : 0, r.dead ? 1 : 0, r.ticks, r.menus, r.coinsIn, r.coinsOut, r.preset, r.bp, ...r.stage]) }))));
      console.log(`每局结局写到 ${jsonOut}`);
    }
    const total = cells.length * n;
    console.log(`共 ${total} 局，${((Date.now() - t0) / 1000).toFixed(1)} 秒，${(total / ((Date.now() - t0) / 1000)).toFixed(2)} 局/秒`);
    process.exit(0);
  }
  // --danger 0–5；老的 --diff easy,normal,hard 照认（危险 0 / 2 / 4）
  const diffs: Danger[] = process.argv.includes('--danger')
    ? arg('--danger', '2').split(',').map((d) => Number(d) as Danger)
    : arg('--diff', 'easy,normal,hard').split(',').map((d) => DIFFICULTIES[d as keyof typeof DIFFICULTIES].danger);
  const jsonOut = arg('--json', '');
  // --mode raid：夜探（--map 是镇子模板，--skill 可以带 greedy）；默认守夜
  const raid = arg('--mode', 'vigil') === 'raid';
  const skills = arg('--skill', raid ? 'novice,normal,greedy' : 'novice,normal').split(',');
  const builds = arg('--build', 'sword').split(',') as Build[];
  const threads = Math.max(1, Number(arg('--threads', String(availableParallelism()))));
  const chunk = Math.max(1, Number(arg('--chunk', '4')));
  const maps = arg('--map', raid ? 'guzhen,dukou,shansi' : 'snow').split(',');
  const map = maps[0]!;
  const char = arg('--char', 'xiaodao') as CharacterId;
  // 双修对照臂：同一批种子再跑一遍、双修条件满足也不合，和正常臂按种子配对比净强度
  const noDual = process.argv.includes('--nodual');
  // 竖屏开的局（刷怪圈转 90°，Setup.tall）：和横屏同种子对照，量横竖屏是不是一套难度
  const tall = process.argv.includes('--tall');
  const live = process.argv.includes('--live');
  const poolArg = arg('--pool', '');
  if (poolArg && poolArg !== 'all' && !(CHARACTER_IDS as readonly string[]).includes(poolArg)) throw new Error(`--pool 只认 all 或 ${CHARACTER_IDS.join('/')}，收到 ${poolArg}`);
  const pool = poolArg as CharacterId | 'all' | '';
  // 机器人默认会放技能（bots.ts pressSkill）；--noskill 是不放技能的对照臂
  const useSkills = !process.argv.includes('--noskill');
  // 开局配置（规则 52）：--start alt = 第二件起手；--xinfa 流派 / auto（auto 按每格 --build 的流派，不是本角色主修就不带）
  const startAlt = arg('--start', '') === 'alt';
  const xinfaArg = arg('--xinfa', '');
  const xinfaOf = (build: string): string => {
    const sch = xinfaArg === 'auto' ? build.split(':')[0]! : xinfaArg;
    return sch && (CHARACTER_IDS as readonly string[]).includes(char) && (mainSchools(char as CharacterId) as readonly string[]).includes(sch) ? sch : '';
  };

  const cells: (Cell & { map: string })[] = [];
  for (const m of raid ? maps : [map])
    for (const diff of diffs) for (const skill of skills) for (const build of skill === 'novice' ? builds.slice(0, 1) : builds) cells.push({ diff, skill, build, map: m });

  // 任务按格子顺序排队；结果按种子填回，和线程数、分块无关
  const results: RunResult[][] = cells.map(() => new Array<RunResult>(n));
  const pending: number[] = cells.map(() => 0);
  const queue: Task[] = [];
  let tid = 0;
  const owner: { cell: number; from: number }[] = [];
  const enqueue = (ci: number, a: number, b: number): void => {
    const cell = cells[ci]!;
    for (let from = a; from < b; from += chunk) {
      const seeds: number[] = [];
      for (let s = from; s < Math.min(b, from + chunk); s++) seeds.push(seedFrom + s + 1);
      owner.push({ cell: ci, from });
      queue.push({ id: tid++, cell, map: cell.map, raid, char, noDual, tall, live, pool, skills: useSkills, startAlt, xinfa: xinfaOf(cell.build), seeds });
      pending[ci]! += seeds.length;
    }
  };

  // --stop：同一镇子 / 地图、同一档的小白和普通是一组，按批加种子，两条线都定了就停（tools/early-stop.ts）
  const stop = process.argv.includes('--stop');
  const batch = Math.max(1, Number(arg('--batch', String(STOP_DEFAULTS.batch))));
  const minN = Math.min(n, Math.max(1, Number(arg('--min', String(STOP_DEFAULTS.min)))));
  const groups: { cells: number[]; novice: number; normal: number; upto: number; why?: StopWhy }[] = [];
  const groupOf: number[] = [];
  if (stop) {
    if (!live) throw new Error('--stop 要配 --live（按实盘期望判断）');
    cells.forEach((c, ci) => {
      let g = groups.findIndex((x) => cells[x.cells[0]!]!.map === c.map && cells[x.cells[0]!]!.diff === c.diff);
      if (g < 0) g = groups.push({ cells: [], novice: -1, normal: -1, upto: 0 }) - 1;
      groups[g]!.cells.push(ci);
      if (c.skill === 'novice') groups[g]!.novice = ci;
      else if (c.skill === 'normal' && groups[g]!.normal < 0) groups[g]!.normal = ci;
      groupOf[ci] = g;
    });
    for (const g of groups) if (g.novice < 0 || g.normal < 0 || !tierOf(raid, cells[g.cells[0]!]!.diff)) throw new Error('--stop 要每格都有小白和普通两条线，且危险是实盘档（守夜 0/2/3/4，夜探 0/1/2）');
  }
  /** 一局的实盘结回 − 1 份：守夜按 vigilBp，夜探用 settleRaid 算好的 bp */
  const runEv = (r: RunResult, diff: Danger, m: string): number => (raid ? (r.bp ?? 0) : vigilBp(tierOf(false, diff)!, r.ticks, r.won, r.boss, char, m as MapId)) / 10_000 - 1;
  const nextBatch = (gi: number): void => {
    const g = groups[gi]!;
    const b = Math.min(n, g.upto + batch);
    for (const ci of g.cells) enqueue(ci, g.upto, b);
    g.upto = b;
  };
  if (stop) groups.forEach((_, gi) => nextBatch(gi));
  else cells.forEach((_, ci) => enqueue(ci, 0, n));
  /** 这一格最后跑了几局（提前停的是停的那一刻；没开 --stop 就是 n） */
  const runsOf = (ci: number): number => (stop ? groups[groupOf[ci]!]!.upto : n);
  /** 一组的一批跑完了：两条线都定了就停，否则再加一批 */
  const settleGroup = (gi: number): void => {
    const g = groups[gi]!;
    if (g.why || g.cells.some((ci) => pending[ci]! > 0)) return;
    const c0 = cells[g.cells[0]!]!;
    const line = (ci: number): number[] => results[ci]!.slice(0, g.upto).map((r) => runEv(r, c0.diff, c0.map));
    const why = stopWhy({ novice: line(g.novice), normal: line(g.normal) }, tierOf(raid, c0.diff)!, g.upto, minN, n);
    if (why) g.why = why;
    else nextBatch(gi);
  };

  const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  /** 按现在的倍数曲线：每局结回 − 1 份的均值 ± 2SE（实盘只有危险 0/2/3/4，别的档出 -） */
  const ev = (rs: RunResult[], diff: Danger): string => {
    const tier = tierOfDanger(diff);
    if (!tier) return '-';
    const xs = rs.map((r) => vigilBp(tier, r.ticks, r.won, r.boss, char, map as MapId) / 10_000 - 1);
    const m = mean(xs);
    const sd = Math.sqrt(mean(xs.map((x) => (x - m) * (x - m))));
    return `${m >= 0 ? '+' : ''}${m.toFixed(2)} ±${((2 * sd) / Math.sqrt(Math.max(1, xs.length))).toFixed(2)}`;
  };
  const rev = (xs: number[]): string => {
    const m = mean(xs);
    return `${m >= 0 ? '+' : ''}${m.toFixed(2)} ±${((2 * Math.sqrt(mean(xs.map((x) => (x - m) * (x - m))))) / Math.sqrt(Math.max(1, xs.length))).toFixed(2)}`;
  };
  const se2 = (p: number, m: number): number => 2 * Math.sqrt((p * (1 - p)) / Math.max(1, m));
  console.log(`${raid ? `夜探${RAID_TEMPLATES[map as RaidTemplateId].name}` : MAPS[map as MapId].name}，每格 ${stop ? `${minN}–${n} 局（提前停，每批 ${batch}）` : `${n} 局`}（种子 ${seedFrom + 1} 起）${tall ? '，竖屏局' : ''}，${threads} 线程`);
  console.log(
    raid
      ? '镇子 | 危险 | 玩家 | 流派 | 撤出 ±2SE | 带出价值（撤出的局） | 平均待了 | 击杀 | 实盘期望 ±2SE（份，--live）'
      : '危险 | 玩家 | 流派 | 胜率 ±2SE | 打倒尸王 | 平均撑 | 第一次升级 | 3 分钟升级 | 5 分钟升级 | 全局升级 | 后半段每分钟 | 击杀 | 精英 | 实盘期望 ±2SE（份） | 路线走成',
  );
  const lines: string[] = [];
  let printed = 0;
  let tPrev = Date.now();
  const flush = (): void => {
    while (printed < cells.length && pending[printed] === 0 && (!stop || groups[groupOf[printed]!]!.why)) {
      const { diff, skill, build } = cells[printed]!;
      const rs = results[printed]!.slice(0, runsOf(printed));
      const nn = rs.length;
      const stopNote = stop && cells[printed]!.skill === 'normal' ? `   [${nn} 局，${groups[groupOf[printed]!]!.why}]` : '';
      const win = mean(rs.map((r) => (r.won ? 1 : 0)));
      const now = Date.now();
      if (raid) {
        lines.push(
          [cells[printed]!.map, diff, skill, skill === 'novice' ? '-' : build, `${(win * 100).toFixed(0)}% ±${(se2(win, nn) * 100).toFixed(0)}`, mean(rs.filter((r) => r.won).map((r) => r.value)).toFixed(0), `${(mean(rs.map((r) => r.seconds)) / 60).toFixed(1)} 分`, mean(rs.map((r) => r.kills)).toFixed(0), live ? rev(rs.map((r) => (r.bp ?? 0) / 10_000 - 1)) : '-'].join(' | ') +
            `   (${((now - tPrev) / 1000).toFixed(1)} s)${stopNote}`,
        );
        console.log(lines[lines.length - 1]);
        tPrev = now;
        printed++;
        continue;
      }
      lines.push(
        [
          diff,
          skill,
          skill === 'novice' ? '-' : build,
          `${(win * 100).toFixed(0)}% ±${(se2(win, nn) * 100).toFixed(0)}`,
          `${(mean(rs.map((r) => (r.boss ? 1 : 0))) * 100).toFixed(0)}%`,
          `${(mean(rs.map((r) => r.seconds)) / 60).toFixed(1)} 分`,
          `${mean(rs.map((r) => r.firstLevel)).toFixed(1)} 秒`,
          mean(rs.map((r) => r.levels3)).toFixed(1),
          mean(rs.map((r) => r.levels5)).toFixed(1),
          mean(rs.map((r) => r.levels)).toFixed(1),
          mean(rs.filter((r) => r.seconds > 600).map((r) => r.late)).toFixed(2),
          mean(rs.map((r) => r.kills)).toFixed(0),
          mean(rs.map((r) => r.elites)).toFixed(1),
          ev(rs, diff),
          build.includes(':') ? `${(mean(rs.map((r) => (r.routed ? 1 : 0))) * 100).toFixed(0)}%` : '-',
        ].join(' | ') + `   (${((now - tPrev) / 1000).toFixed(1)} s)${stopNote}`,
      );
      console.log(lines[lines.length - 1]);
      tPrev = now;
      printed++;
    }
  };
  const t0 = Date.now();
  await new Promise<void>((resolve, reject) => {
    // 队列会边跑边加（--stop 一批跑完才决定要不要下一批）：闲着的线程记下来，有新活再喂
    let next = 0;
    let busy = 0;
    const workers: Worker[] = [];
    const idle: Worker[] = [];
    const feed = (wk: Worker): void => {
      if (next < queue.length) {
        busy++;
        wk.postMessage(queue[next++]);
      } else idle.push(wk);
    };
    const finish = (): void => {
      for (const x of workers) void x.terminate();
      resolve();
    };
    for (let k = 0; k < Math.min(threads, queue.length); k++) {
      const wk = new Worker(new URL(import.meta.url));
      workers.push(wk);
      wk.on('error', reject);
      wk.on('message', (m: { id: number; rs: RunResult[] }) => {
        busy--;
        const o = owner[m.id]!;
        m.rs.forEach((r, j) => (results[o.cell]![o.from + j] = r));
        pending[o.cell]! -= m.rs.length;
        if (stop) settleGroup(groupOf[o.cell]!);
        flush();
        feed(wk);
        while (idle.length && next < queue.length) feed(idle.pop()!);
        if (busy === 0 && next >= queue.length) finish();
      });
      feed(wk);
    }
    if (!queue.length) resolve();
  });
  const total = cells.reduce((a, _, ci) => a + runsOf(ci), 0);
  if (jsonOut) {
    // 守夜每局 [赢没赢, 打没打倒尸王, 撑了几拍, 双修几件, 第一次双修的拍, 死因, 路线走成没有]；夜探每局 [撤没撤出, 带出价值, 待了几拍, 双修几件, -1, 死因]（mode 字段区分）
    writeFileSync(
      jsonOut,
      JSON.stringify(cells.map((c, i) => ({ ...c, char, mode: raid ? 'raid' : 'vigil', ...(noDual ? { noDual } : {}), ...(tall ? { tall } : {}), ...(live ? { live } : {}), ...(pool ? { pool } : {}), ...(useSkills ? {} : { noskill: true }), from: seedFrom, ...(stop ? { stop: { n: runsOf(i), why: groups[groupOf[i]!]!.why } } : {}), runs: results[i]!.slice(0, runsOf(i)).map((r) => [r.won ? 1 : 0, raid ? r.value : r.boss ? 1 : 0, r.ticks, r.duals, r.dualTick, r.killer, r.routed ? 1 : 0, r.bp ?? 0]) }))),
    );
    console.log(`每局结局写到 ${jsonOut}`);
  }
  console.log(`共 ${total} 局，${((Date.now() - t0) / 1000).toFixed(1)} 秒，${(total / ((Date.now() - t0) / 1000)).toFixed(2)} 局/秒`);
}
