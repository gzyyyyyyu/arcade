/**
 * 斗地主单机实盘的模拟（docs/stake.md 第 10 节的数字从这里来）：量每档、每种电脑搭配下，"普通玩家"和"小白"每场的期望（单位：份）。
 *
 *   node tools/ddz-stake-sim.ts                          默认：每格 2000 场，6 种电脑搭配 × 2 种玩家，并行跑
 *   node tools/ddz-stake-sim.ts --matches 500 --me normal --bots normal,pro
 *   node tools/ddz-stake-sim.ts --table                  只量 DDZ_SOLO_BOTS 里每档用的搭配（四档 × 两种玩家）
 *   node tools/ddz-stake-sim.ts --time --bots novice,novice 每格多打一项"一场真人要坐多久"（分钟，中位 / p90）：按画面节奏估，
 *                                                            用来判断每场的副数设得是否合适（没有它只能凭副数猜时长）；
 *                                                            另给"一手"的中位 / p90 / p99 秒数、超 2 分钟的比例，和时间花在叫分 / 我出牌 / 电脑停顿 / 动画 / 结算各占几成
 *   node tools/ddz-stake-sim.ts --table --pps 20 --cap 12   扫规则：每分 = 一份的 1/20（也是一场结束的分数线）、每副 s 封顶 12；--deals 改副数
 *   node tools/ddz-stake-sim.ts --fun --bots novice,novice   娱乐单机的一局（DDZ_FUN：6 副、不封顶），看"赢"那一栏（净分 > 0 = 这局赢了，和战绩一样算）
 *
 * 玩家模型：我坐 0 号，"普通玩家" = 电脑的 normal 档代打（--me normal），"小白" = 本文件里单独写的 newbieDecide（--me newbie，
 * 不用电脑的任何一档，调电脑时不会跟着变，定义见 docs/stake.md 10.2）。电脑坐 1、2 号，按给定的两档。
 * 一场用实盘选项（现行 3 副；--pps / --cap / --deals 可覆盖，--pps 40 --cap 24 --deals 8 就是老规则），每场用不同的种子；输出每场净分换成份数
 * （分 ÷ pps）的均值、标准误、2 倍标准误上界、赢的比例（净分 > 0）、平均副数、一场碰到 ±40 封顶的比例。
 * 并行：每格拆成几段，每段一个子进程（--worker，结果从标准输出回传），合起来。
 */
import { spawn } from 'node:child_process';
import { thinkTime } from '../src/view/personas.ts';
import { PACE, bannerMs, dealInMs, wordMs } from '../src/view/common/pace.ts';
import { rngFor } from '../src/core/rng.ts';
import { DDZ_FUN, DDZ_FUN_BLUNDER, DDZ_NOSHUFFLE, createDdz, decideDdz, dispatchDdz, enumerateDdz, interpretDdz, isBombish, playsBeatingDdz, viewDdz, type DdzAction, type DdzEvent, type DdzLevel, type DdzView } from '../src/variants/doudizhu/index.ts';
import { CURRENT_RULES, DDZ_SOLO_BOTS, TIER_IDS, stakeOptions, type TierId } from '../src/variants/doudizhu/stake/index.ts';

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : def;
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`);
/** --fun：按娱乐单机的规则打一局（docs/stake.md 10.2 娱乐新手档那一行） */
const FUN = flag('fun');
const TIME = flag('time');
/** 扫参数用：--pps 每分一份的 1/P（也是一场结束的分数线）、--cap 每副 s 的封顶、--deals 一场几副；不给就是现行规则（stake/index.ts 的 CURRENT_RULES） */
const PPS = Number(arg('pps', String(CURRENT_RULES.pps)));
/** --noshuffle：不洗牌玩法（和 --fun 一起用：娱乐单机开不洗牌，每副封顶默认 DDZ_NOSHUFFLE.dealCap，--cap 可覆盖），看炸弹多了一局会不会拖长、碰封顶多少 */
const NOSHUF = flag('noshuffle');
const BASE = FUN ? DDZ_FUN : stakeOptions(Number(arg('deals', String(CURRENT_RULES.soloDeals))), { ...CURRENT_RULES, pps: PPS, dealCap: Number(arg('cap', String(CURRENT_RULES.dealCap))) });
const OPTS = NOSHUF ? { ...BASE, ...DDZ_NOSHUFFLE, ...(process.argv.includes('--cap') ? { dealCap: Number(arg('cap', '0')) } : {}) } : BASE;
/** 电脑的失误率：--fun 按娱乐单机的表 DDZ_FUN_BLUNDER，实盘按 decideDdz 的默认；--blunder normal=0.1,pro=0.05 临时覆盖（扫值调参用） */
const BLUNDER: Record<DdzLevel, number> = FUN ? { ...DDZ_FUN_BLUNDER } : { novice: DDZ_FUN_BLUNDER.novice, normal: 0, pro: 0 };
for (const kv of arg('blunder', '').split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  if (k && k in BLUNDER) BLUNDER[k as DdzLevel] = Number(v);
}

const LEVELS: readonly DdzLevel[] = ['novice', 'normal', 'pro'];
const NAME: Record<DdzLevel, string> = { novice: '新手', normal: '普通', pro: '高手' };

/** 玩家：电脑的某一档，或者"小白"（见下） */
type Me = DdzLevel | 'newbie';
const ME_NAME = (m: Me): string => (m === 'newbie' ? '小白' : NAME[m]);

/**
 * 小白玩家模型（docs/stake.md 10.2）：照 docs/balance.md 对掼蛋小白的描述类推，不读隐藏信息、不记牌，只看自己的手牌和桌面：
 * 叫分凭感觉（王、2 的张数加一点随机）；领出就出最小的一手（同点数先出长的）；跟牌能压就压最小的，不分对手还是队友；
 * 炸弹乱用（压不过时 2/3 会炸，能正常压时也有 1/4 手痒去炸）。故意不用电脑的任何一档，免得调电脑时两边一起变。
 */
function newbieDecide(v: DdzView, seed: string): DdzAction | null {
  if (v.turn !== v.seat) return null;
  const me = v.seat;
  if (v.phase === 'bid') {
    const rng = rngFor(seed, 'newbie-bid', v.dealNo, me, v.step);
    const big = v.hand.filter((c) => c >= 52).length * 2 + v.hand.filter((c) => c >= 48 && c < 52).length;
    const want = Math.min(3, Math.max(0, Math.floor((big + rng.int(4) - 1) / 2)));
    return { type: 'bid', seat: me, bid: want <= v.bid ? 0 : want };
  }
  if (v.phase !== 'play') return null;
  const rng = rngFor(seed, 'newbie-play', v.dealNo, me, v.step);
  const lowest = (xs: ReturnType<typeof enumerateDdz>) => xs.reduce((a, b) => (b.v < a.v || (b.v === a.v && b.cards.length > a.cards.length) ? b : a));
  if (!v.target) {
    const all = enumerateDdz(v.hand);
    const plain = all.filter((p) => !isBombish(p));
    return { type: 'play', seat: me, cards: lowest(plain.length ? plain : all).cards };
  }
  const opts = playsBeatingDdz(v.hand, v.target.play);
  if (!opts.length) return { type: 'pass', seat: me };
  const plain = opts.filter((p) => !isBombish(p));
  const bombs = opts.filter(isBombish);
  let pick = plain.length ? lowest(plain) : null;
  if (bombs.length && (!pick ? rng.int(3) < 2 : rng.int(4) === 0)) pick = lowest(bombs);
  return pick ? { type: 'play', seat: me, cards: pick.cards } : { type: 'pass', seat: me };
}

/** 时间花在哪：叫分、我想牌、电脑停顿、动画和横幅、结算 */
type Seg = 'bid' | 'me' | 'bot' | 'anim' | 'settle';
const SEGS: readonly Seg[] = ['bid', 'me', 'bot', 'anim', 'settle'];
const SEG_NAME: Record<Seg, string> = { bid: '叫分', me: '我出牌', bot: '电脑停顿', anim: '动画横幅', settle: '结算' };
type Acc = Record<Seg, number>;
const zero = (): Acc => ({ bid: 0, me: 0, bot: 0, anim: 0, settle: 0 });

interface One {
  points: number;
  deals: number;
  capped: boolean;
  /** 真人坐一场大约多少秒（paceOf 累加） */
  seconds: number;
  /** 每一副的秒数（含结算） */
  dealSeconds: number[];
  /** 一场里各段的秒数 */
  segs: Acc;
}

/**
 * 一步大概要多久（秒），画面的停顿全取 src/view/common/pace.ts（和 DdzScene 同一份，1 倍速）：
 * 电脑想多久用 thinkTime 的中间值（rand 固定 0.5），叫分想 PACE.ddz.bidThink；我（0 号）出牌 / 不要 4 秒、叫分 3 秒（任务约定）；
 * 出牌动画 PACE.play.fly 加 250 毫秒的固定收尾；炸弹、王炸的大字完整播一遍；
 * 定地主：横幅完整播一遍，我当地主再加亮底牌；一副结束：最后一手留着 → 结算页（真人看 5 秒）→ 下一副的"第 n 副"大字和发 17 张。
 */
// PACE_NO_HUMAN=1 把真人自己的时间（出牌 4 秒、叫分 3 秒、结算页 5 秒）设 0，只看画面自己占的时间
const HUMAN = process.env.PACE_NO_HUMAN ? { play: 0, bid: 0, settle: 0 } : { play: 4, bid: 3, settle: 5 };
function paceOf(seat: number, view: DdzView, a: DdzAction, events: DdzEvent[], acc: Acc): void {
  if (view.phase === 'bid') {
    acc.bid += seat === 0 ? HUMAN.bid : PACE.ddz.bidThink / 1000;
  } else if (a.type === 'play' || a.type === 'pass') {
    if (seat === 0) acc.me += HUMAN.play;
    else {
      const lead = !view.target || view.target.seat === seat;
      const bomb = a.type === 'play' && isBombish(interpretDdz(a.cards)[0] ?? { type: 'single' });
      const tense = view.counts.some((n, i) => i !== seat && n <= 2);
      let passes = 0;
      for (let i = view.trick.length - 1; i >= 0 && view.trick[i]!.play === null; i--) passes++;
      acc.bot += thinkTime({ kind: a.type === 'pass' ? 'pass' : bomb ? 'bomb' : 'play', lead, tense, passes }, () => 0.5) / 1000;
    }
  }
  for (const e of events) {
    if (e.type === 'bid') acc.bid += PACE.ddz.bid / 1000;
    else if (e.type === 'redeal') acc.anim += bannerMs() / 1000;
    else if (e.type === 'landlord') acc.anim += bannerMs() / 1000 + (e.seat === 0 ? PACE.ddz.bottom / 1000 : 0);
    else if (e.type === 'play') acc.anim += (PACE.play.fly + 250) / 1000 + (isBombish(e.play) ? wordMs(e.play.type === 'rocket' ? PACE.ddz.rocket : PACE.ddz.bomb) / 1000 : 0);
    else if (e.type === 'pass') acc.anim += PACE.pass / 1000;
    else if (e.type === 'newTrick') acc.anim += (PACE.trick.hold + PACE.trick.fade) / 1000;
    else if (e.type === 'dealEnd') acc.settle += (PACE.dealEnd + wordMs(PACE.dealTitle) + dealInMs(17)) / 1000 + HUMAN.settle;
  }
}

/** 打一场；seed 区分每场 */
function playMatch(seed: string, me: Me, bots: readonly [DdzLevel, DdzLevel]): One {
  const levels: Me[] = [me, bots[0], bots[1]];
  let { state } = createDdz(seed, OPTS);
  const acc = zero();
  // 每副的耗时和各段：dealEnd 事件结束一副时切一刀（含这副的结算），重发（redeal）的时间算进同一副
  const perDeal: Acc[] = [];
  let cur = zero();
  for (let guard = 0; guard < 20_000; guard++) {
    if (state.phase === 'gameOver') break;
    if (state.phase === 'dealEnd') {
      state = dispatchDdz(state, { type: 'next' }).state;
      continue;
    }
    const seat = state.turn;
    const lv = levels[seat]!;
    const view = viewDdz(state, seat);
    // 我（0 号）是玩家模型，不带电脑的失误；1、2 号是电脑，按上面的 BLUNDER
    const a = lv === 'newbie' ? newbieDecide(view, `${seed}-ai${seat}`) : decideDdz(view, lv, `${seed}-ai${seat}`, seat === 0 ? 0 : BLUNDER[lv]);
    if (!a) throw new Error(`没有动作：${seed} phase=${state.phase} turn=${seat}`);
    const r = dispatchDdz(state, a);
    if (r.error) throw new Error(`非法动作 ${r.error}：${seed}`);
    paceOf(seat, view, a, r.events, cur);
    if (r.events.some((e) => e.type === 'dealEnd')) {
      perDeal.push(cur);
      for (const k of SEGS) acc[k] += cur[k];
      cur = zero();
    }
    state = r.state;
  }
  if (state.phase !== 'gameOver') throw new Error(`没打完：${seed}`);
  const sum = (x: Acc): number => SEGS.reduce((t, k) => t + x[k], 0);
  return { points: state.scores[0]!, deals: state.results.length, capped: state.scores.some((x) => Math.abs(x) >= PPS), seconds: sum(acc), dealSeconds: perDeal.map(sum), segs: acc };
}

// ───────────── 子进程 ─────────────

if (flag('worker')) {
  const me = arg('me', 'normal') as Me;
  const bots = arg('bots', 'normal,normal').split(',') as [DdzLevel, DdzLevel];
  const from = Number(arg('from', '0'));
  const to = Number(arg('to', '0'));
  const tag = arg('tag', 'x');
  const out: One[] = [];
  for (let i = from; i < to; i++) out.push(playMatch(`sim-${tag}-${me}-${bots.join('')}-${i}`, me, bots));
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

// ───────────── 主进程 ─────────────

const MATCHES = Number(arg('matches', '2000'));
const JOBS = Number(arg('jobs', '8'));

function runChunk(me: Me, bots: readonly [DdzLevel, DdzLevel], from: number, to: number): Promise<One[]> {
  return new Promise((ok, fail) => {
    const c = spawn('node', [process.argv[1]!, '--worker', ...(FUN ? ['--fun'] : []), ...(NOSHUF ? ['--noshuffle'] : []), '--pps', String(PPS), '--cap', String(OPTS.dealCap), '--deals', String(OPTS.deals), ...(arg('blunder', '') ? ['--blunder', arg('blunder', '')] : []), '--me', me, '--bots', bots.join(','), '--from', String(from), '--to', String(to)], { stdio: ['ignore', 'pipe', 'inherit'] });
    let text = '';
    c.stdout?.on('data', (d) => void (text += d.toString()));
    c.once('error', fail);
    c.once('exit', (code) => (code ? fail(new Error(`子进程退出 ${code}`)) : ok(JSON.parse(text) as One[])));
  });
}

interface Cell {
  tier: TierId | '-';
  me: Me;
  bots: readonly [DdzLevel, DdzLevel];
}

async function measure(cell: Cell): Promise<string> {
  const step = Math.ceil(MATCHES / JOBS);
  const parts = await Promise.all(Array.from({ length: JOBS }, (_, j) => runChunk(cell.me, cell.bots, j * step, Math.min(MATCHES, (j + 1) * step))));
  const all = parts.flat();
  const n = all.length;
  const x = all.map((r) => r.points / PPS);
  const mean = x.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(x.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const se = sd / Math.sqrt(n);
  const win = all.filter((r) => r.points > 0).length / n;
  const deals = all.reduce((a, r) => a + r.deals, 0) / n;
  const capped = all.filter((r) => r.capped).length / n;
  const f = (v: number): string => (v >= 0 ? '+' : '') + v.toFixed(3);
  const mins = all.map((r) => r.seconds / 60).sort((a, b) => a - b);
  const q = (p: number): number => mins[Math.min(n - 1, Math.floor(p * n))]!;
  const ok = mean + 2 * se <= 0 ? '达标' : '不达标';
  let timeText = '';
  if (TIME) {
    const hands = all.flatMap((r) => r.dealSeconds).sort((a, b) => a - b);
    const hq = (p: number): number => hands[Math.min(hands.length - 1, Math.floor(p * hands.length))]!;
    const total = SEGS.reduce((t, k) => t + all.reduce((x, r) => x + r.segs[k], 0), 0);
    const share = SEGS.map((k) => `${SEG_NAME[k]} ${((all.reduce((x, r) => x + r.segs[k], 0) / total) * 100).toFixed(0)}%`).join(' ');
    const over2 = hands.filter((h) => h > 120).length / hands.length;
    timeText = `  一场 ${q(0.5).toFixed(1)} / ${q(0.9).toFixed(1)} 分钟（中位 / p90）  一手 ${hq(0.5).toFixed(0)} / ${hq(0.9).toFixed(0)} / ${hq(0.99).toFixed(0)} 秒（中位 / p90 / p99）超 2 分钟 ${(over2 * 100).toFixed(1)}%  时间花在：${share}`;
  }
  return `${cell.tier.padEnd(5)} ${ME_NAME(cell.me)}玩家 vs ${NAME[cell.bots[0]]}+${NAME[cell.bots[1]]}  ${f(mean)} ± ${(2 * se).toFixed(3)} 份  赢 ${(win * 100).toFixed(0)}%  ${deals.toFixed(1)} 副  碰封顶 ${(capped * 100).toFixed(1)}%  n=${n}  ${ok}${timeText}`;
}

const cells: Cell[] = [];
const meList = arg('me', 'normal,newbie').split(',') as Me[];
if (flag('table')) {
  for (const tier of TIER_IDS) for (const me of meList) cells.push({ tier, me, bots: DDZ_SOLO_BOTS[tier] });
} else if (process.argv.includes('--bots')) {
  const bots = arg('bots', 'normal,normal').split(',') as [DdzLevel, DdzLevel];
  for (const me of meList) cells.push({ tier: '-', me, bots });
} else {
  for (let i = 0; i < LEVELS.length; i++) for (let j = i; j < LEVELS.length; j++) for (const me of meList) cells.push({ tier: '-', me, bots: [LEVELS[i]!, LEVELS[j]!] });
}
console.log(`每格 ${MATCHES} 场，规则 ${JSON.stringify(OPTS)}；± 是 2 倍标准误`);
for (const c of cells) console.log(await measure(c));
