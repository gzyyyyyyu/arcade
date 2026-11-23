/**
 * 电脑出手（docs/ai.md 4.2；见 4.6）。参数是这个座位的视图，不是完整状态：电脑在结构上就拿不到别人的底牌和牌堆。
 * 手牌强度（翻牌前查表、翻牌后蒙特卡洛）→ 和底池赔率、位置、性格、这一档的功力比 → 弃、过、跟、加。全程整数。
 */
import type { RandomStream } from 'arcade-kit/rng';
import type { Action } from '../core/table.ts';
import type { View } from '../core/view.ts';
import { categoryOf, evalCards, HIGH_CARD } from '../core/eval.ts';
import { equity } from './equity.ts';
import { PERSONAS, PERSONAS_SHARP, SKILL, type Persona, type Skill } from './personas.ts';
import { preflopEquity, TOP } from './preflop.ts';

/**
 * 翻牌后蒙特卡洛的次数。对手多时胜率本来就小，200 次误差也在 ±3% 左右；
 * 随机数用 arcade-kit 的 ChaCha20（每个数约 60 ns），这样 5 个对手单次决策 p99 约 0.3 ms（test/ai.test.ts 有预算断言）
 */
export const mcIters = (opponents: number): number => (opponents <= 2 ? 300 : 200);
/** 真人座位没有性格时（托管、模拟）按"算盘" */
const DEFAULT_PERSONA = 4;

/** 每次决定，跟进、加注的门槛上下随机浮动这么多（相对强度）：同样的牌不总是同样的打法 */
const JITTER = 80;
/** 翻牌后没人下注时，相对强度到这儿就算"有点牌"，按 THIN_BET + 性格的 bluff（‰）的概率先下一注 */
const THIN = 1000;
const THIN_BET = 200;
/** 翻牌前面对加注，自己已经投了钱（平跟过、盲注）时跟注门槛再放低多少（相对强度） */
const INVESTED = 200;
/** "上头"时（View.tilt > 0）：跟进门槛再放低、加注门槛再放低、诈唬翻倍、翻牌后多跟一点（docs/ai.md 4.6） */
const TILT = { loose: 150, wild: 100, bluff: 2, slack: 30 } as const;
/** 没有状态的（旧存档、托管的真人座位）：不浮动 */
const NO_FORM: readonly number[] = [0, 0, 1000, 1000];
/** 有效筹码不到这么多个大盲：翻牌前只推或弃（功力的 depth） */
export const SHORT_BB = 12;
/** 有效筹码这么多个大盲以上：没人加注时多看便宜的翻牌（深筹码，投机牌值钱） */
const DEEP_BB = 150;
/** 对手发到牌这么多手以后才看他的打法（样本太少不准） */
const READ_HANDS = 15;
/** 河牌两极（功力的 sharp）：先下注的牌相对强度不到这儿算中等，过牌摊牌；下注的（大牌、空气）尺度至少这么多（‰，乘 0.6–1.0 的浮动，约四分之三池） */
const POLAR = 1600;
const POLAR_SIZE = 950;

export function decide(v: View, r: RandomStream): Action {
  const me = v.me;
  const lg = v.legal;
  if (me === null || !lg) throw new Error('decide: not my turn');
  const seat = v.seats[me]!;
  const k = SKILL[v.level] ?? SKILL[0]!;
  const cast = k.sharp ? PERSONAS_SHARP : PERSONAS;
  const p: Persona = cast[seat.persona] ?? cast[DEFAULT_PERSONA]!;
  // 这一场的状态：松紧、激进、诈唬、快慢在性格的范围里浮动（坐下时抽好的，规则的 SeatState.form）
  const form = v.form ?? NO_FORM;
  const others = v.seats.flatMap((s, i) => (i !== me && (s.status === 'active' || s.status === 'allin') ? [i] : []));
  const opp = others.length;
  const raises = raisesThisStreet(v);
  const pre = v.board.length === 0;
  const raw = pre ? preflopEquity(v.hole[0]!, v.hole[1]!, opp) : equity(v.hole, v.board, opp, mcIters(opp), r, ranges(v, others, k, p));
  // 看对手（只用公开的统计，按功力和性格的 reads 打折）：谁还没说话、这一轮最后下注的人是谁
  const adapt = k.sharp ? 1000 : Math.min(1000, Math.floor((k.adapt * p.reads) / 1000));
  const yet = yetToAct(v, me);
  const bettor = raises > 0 ? lastAggressor(v, [streetStart(v), v.log.length]) : -1;
  const opp2 = adapt ? readOpponents(v, others, yet, bettor, k.sharp) : NO_READ;
  // 有人这一轮下注、加注时他的牌通常更好，每有一次打一个折扣（翻牌前的门槛另按加注次数抬高）
  // 按次数连乘：随机牌、空气碰到下注就该弃，不每手跟到摊牌
  let eq = raw;
  // 越往后的下注越说明有牌：转牌的折扣 ×1.15、河牌 ×1.3（河牌对随机牌的胜率最虚，空气也常有四五成）
  let read = Math.floor((k.read * (1000 + 150 * (v.board.length - 3))) / 1000);
  // 性格：胆小的更信下注，爱抓诈唬的不太信；再按下注的人是什么风格调：紧的人下注多半是真的，疯的人下注水分大
  read = Math.floor((read * styled(p.trust, k)) / 1000);
  if (raises > 0) read = Math.floor((read * (1000 + Math.floor(((opp2.bettor - 1000) * adapt) / 1000))) / 1000);
  // 记住上一手（大桌以上）：下注的人上一手亮出来的是空气，不那么信他
  if (!pre && raises > 0 && k.memory && showedAir(v, bettor)) read = Math.floor((read * (1000 - k.memory)) / 1000);
  read = Math.min(read, 950);
  if (!pre) for (let i = 0; i < Math.min(raises, 3); i++) eq = Math.floor((eq * (1000 - read)) / 1000);
  const rel = eq * (opp + 1);
  const eff = effectiveBb(v, me, others);
  const pos = positionOf(v, me, yet.length, p, k, k.depth ? eff : 0);
  const tilt = v.tilt > 0;
  const jit = r.below(2 * JITTER + 1) - JITTER;
  // 这一档的翻牌前门槛：功力的 tight 加上性格在软桌上放松的部分（老好更爱跟、阿强更爱加，见 personas.ts 的 loose / wild）；
  // loose 同时把面对加注时的底池赔率放宽 ¼，否则赔率这一关挡住，松不起来
  // 局面：领先放开、落后看性格；对手的打法；筹码深浅
  const lead = standing(v, seat, p);
  const deep = k.depth && pre && raises === 0 && eff >= DEEP_BB ? 50 : 0;
  // 对爱加注的人（翻牌前加注率高）：他加注的牌更杂，跟得宽一点
  const loosePre = pre && raises > 0 ? Math.floor((opp2.raiserLoose * adapt) / 1000) : 0;
  const loose = Math.floor((p.loose * k.soft) / 1000) + (tilt ? TILT.loose : 0) + lead.loose + deep + loosePre;
  // 偷盲：前面都弃了、我在后位，开池加注的门槛再放低；后面等着说话的人都很紧（盲注位弃牌多）再多偷
  const steal = pre && raises === 0 && yet.length <= 3 && !v.log.some((e) => e.seat >= 0 && e.act === 'call') ? Math.floor((p.steal * k.style) / 1000) + Math.floor((opp2.steal * adapt) / 1000) : 0;
  const callAt = p.call + k.tight - loose + form[0]! + jit;
  const raiseAt =
    (pre && raises === 0 ? (p.open ?? p.raise) : p.raise) + k.tight - Math.floor((p.wild * k.soft) / 1000) - (tilt ? TILT.wild : 0) + Math.floor(form[0]! / 2) - form[1]! - steal + jit;
  // 诈唬的倍数（‰）：这一场的状态 × 领先落后 × 对手（对紧的人多偷、对跟注站少诈唬）
  const readX = 1000 + Math.floor(((opp2.bluff - 1000) * adapt) / 1000);
  const bluffX = Math.floor((form[2]! * lead.bluff * readX) / 1_000_000);
  const toCall = lg.call;
  // 底池赔率：要跟的钱 ÷（池子 + 要跟的钱），千分数
  const odds = Math.floor((toCall * 1000) / (v.pot + toCall));

  // 筹码很短：翻牌前不再小加小跟，够好就推、不够就弃（会的才这样，低档照常打）
  if (pre && k.depth && eff <= SHORT_BB) {
    if (rel >= callAt - 120 + k.pre * raises - pos) return lg.raise ? { t: 'allin' } : lg.check ? { t: 'check' } : { t: 'call' };
    return lg.check ? { t: 'check' } : { t: 'fold' };
  }

  // 低档不连开三枪（第 0–3 档）：翻牌、转牌都是我下的注，河牌没人下注时有牌也多半只过牌（只管价值注，诈唬照常）
  const third = !pre && v.board.length === 5 && raises === 0 && k.third > 0 && lg.check && streak(v, me) >= 2 && r.below(1000) < k.third;

  // 大牌：加注（偶尔慢打）
  if (lg.raise && !third && rel >= raiseAt + k.pre * raises - pos) {
    const slow = eq >= 800 && v.board.length < 5 && r.below(1000) < p.slow;
    // 多跟少加（低档）：有人下注、加注时只跟
    // 不敢先打（低档）：没人下注时只过牌、翻牌前只平跟
    // 凶的性格（mild 小）少受这层压：低档里也看得出阿强、虎子爱打
    const meek = k.passive > 0 && raises > 0 ? r.below(1000) < mild(k.passive, p, k) : k.shy > 0 && raises === 0 && r.below(1000) < mild(k.shy, p, k);
    if (!slow && !meek) return raise(v, p, k, eq, raises, r);
    if (meek) return lg.check ? { t: 'check' } : { t: 'call' };
  }

  if (pre) {
    // 再加注：凶的人（阿强、虎子）面对一次加注，能跟的牌偶尔再加一手，不只拿大牌再加
    if (lg.raise && raises === 1 && rel >= callAt - pos && r.below(1000) < Math.floor((p.threebet * (1000 + 3 * form[1]!)) / 1000)) return raise(v, p, k, eq, raises, r);
    if (lg.check) return { t: 'check' };
    let ok: boolean;
    if (raises === 0) {
      // 没人加注，只是补一个大盲（或小盲补半个）看翻牌：只看牌力和位置，不查底池赔率。
      // 赔率按全桌的胜率算，6 人桌前面位置平跟要 400‰，5 个对手时普通牌只有 150–170‰，原来除了 JJ 以上全弃（"板凳儿一直弃牌"）
      ok = rel >= callAt - pos || (toCall * 2 <= v.bb && rel >= callAt - 200);
    } else {
      // 有人加注：要跟的钱多了，门槛按加注次数抬高、再看赔率。松的人不太把加注当回事，抬得少（loose 抵掉一部分，小桌的老好、板凳儿基本不抬）。
      // 胜率按"真的掏了钱的人"算（后面没说话的多半会弃），不按全桌
      const eqIn = preflopEquity(v.hole[0]!, v.hole[1]!, voluntary(v, me));
      // 已经投了钱（平跟过、在盲注位）的再放低一点：真人很少平跟完又被一加就弃
      const sunk = seat.bet > 0 ? INVESTED : 0;
      ok = rel >= callAt + Math.max(0, k.pre - 50 - loose) * raises - pos - sunk && eqIn * 1000 >= odds * (1000 - loose / 4);
    }
    // 小错：翻牌前差一点的牌，爱跟的人还是舍不得弃（只在便宜的时候，toCall 不到 3 个大盲）
    if (!ok && p.flaw === 'overcall' && rel >= callAt - pos - 120 && toCall <= 3 * v.bb && r.below(1000) < flawRate(p, k)) return { t: 'call' };
    return ok ? { t: 'call' } : { t: 'fold' };
  }

  if (lg.check) {
    if (lg.raise && raises === 0) {
      const mine = lastAggressor(v, prevStreet(v)) === me;
      const river = v.board.length === 5;
      let chance: number;
      if (mine && v.board.length > 3) {
        // 上一轮是我下的注：接着打第二枪、第三枪（虎子、阿强爱这样连着诈唬），对手越多越收着
        chance = Math.floor((p.barrel * k.bluff * bluffX) / 1_000_000) - 60 * Math.max(0, opp - 1);
      } else {
        // 没人下注：偶尔诈唬，对手越少越敢；翻牌前自己加过注的，翻牌上常"接着打"（持续下注）
        const cbet = v.board.length === 3 && lastPreflopRaiser(v) === me ? 3 : 1;
        chance = Math.floor((p.bluff * k.bluff * 2 * cbet * bluffX) / 1_000_000 / (opp + 1)) + pos / 2;
      }
      // 中等牌（比这一桌平均强）也常先下一注，不全靠过牌看牌：有来有回，弱牌被打走，不是每手都摊牌
      // 对手多时收着：每多一个对手少 80‰（不往 8 个人里薄打）
      // 对跟注站：有点牌就薄薄下一注（他会跟），门槛放低；低档偶尔手软，该下的只过牌
      let size = p.size;
      if (rel >= THIN + jit - pos - Math.floor((opp2.thin * adapt) / 1000)) {
        // 不连开第三枪只管有牌的价值注；诈唬照性格（拦掉诈唬反倒便宜了会弃牌的人）
        if (third) return { t: 'check' };
        if (k.slip && r.below(1000) < k.slip) return { t: 'check' };
        if (k.shy && r.below(1000) < mild(k.shy, p, k)) return { t: 'check' };
        if (k.sharp && river && rel < POLAR) return { t: 'check' };
        chance = Math.max(chance, THIN_BET + p.bluff - 80 * (opp - 1));
        size = Math.floor((p.size * k.value) / 1000);
      }
      // 河牌没牌、没人下注：爱诈唬的人常在这儿偷一把（被跟到就亮出"诈唬"）
      else if (river && categoryOf(evalCards([...v.hole, ...v.board])) === HIGH_CARD)
        chance = Math.max(chance, Math.floor((p.river * k.bluff * bluffX) / 1_000_000) - 80 * (opp - 1));
      if (tilt) chance *= TILT.bluff;
      // 小错：凶的人没牌也手痒（spew）；爱慢打的人河牌大牌装过了头，忘了收钱（trap）
      if (p.flaw === 'spew' && !pre) chance += flawRate(p, k) / 2;
      if (p.flaw === 'trap' && river && eq >= 900 && r.below(1000) < flawRate(p, k)) return { t: 'check' };
      if (k.sharp && river) size = Math.max(size, POLAR_SIZE);
      if (r.below(1000) < chance) {
        // 河牌上连着打过来的，偶尔全下吓人（筹码不到池子 3 倍才推，不然下 1.25 池的重注）
        if (river && mine && k.value >= 1000 && r.below(1000) < p.shove) return seat.stack <= 3 * v.pot ? { t: 'allin' } : betTo(v, Math.floor((v.pot * 1250) / 1000));
        return betTo(v, Math.floor((v.pot * size * (800 + Math.floor(((r.below(5) - 2) * 100 * styled(p.spread, k)) / 1000))) / 1_000_000));
      }
    }
    return { t: 'check' };
  }
  // 爱跟的性格（slack 为正）和 loose 一样按档的 soft 打折：小桌全用，越往上越收（中桌的板凳儿原来翻牌后照样跟到底，每百手 −150）
  const slack = p.slack > 0 ? Math.floor((p.slack * k.soft) / 1000) : p.slack;
  const ok = eq >= odds - slack - k.slack - (tilt ? TILT.slack : 0);
  // 低档手软（第 0–3 档）：够跟、但只比赔率多一点的牌，偶尔就弃了
  if (ok && k.slip && eq < odds + 150 && r.below(1000) < k.slip) return { t: 'fold' };
  // 小错（性格的 flaw）：舍不得弃（差一点的牌被下注仍然跟）、怕了（够跟但注太大）弃掉
  if (!ok && p.flaw === 'overcall' && eq >= odds - slack - k.slack - 150 && toCall * 3 <= v.pot && r.below(1000) < flawRate(p, k)) return { t: 'call' };
  if (ok && p.flaw === 'scared' && eq < odds + 120 && toCall * 2 >= v.pot && r.below(1000) < flawRate(p, k)) return { t: 'fold' };
  return ok ? { t: 'call' } : { t: 'fold' };
}

/**
 * 领先、落后：比坐下时多一半以上的，放开一点、多诈唬一点；少了一半以上的，爱赌的（阿强、虎子这类）更松更凶，
 * 稳的收紧、少诈唬。连同这一手已经投进去的一起算，一手打到一半不会变来变去
 */
function standing(v: View, seat: View['seats'][number], p: Persona): { loose: number; bluff: number } {
  if (!v.start) return { loose: 0, bluff: 1000 };
  const now = Math.floor(((seat.stack + seat.total) * 1000) / v.start);
  if (now >= 1500) return { loose: 40, bluff: 1200 };
  if (now <= 500) return p.wild > 0 || p.bluff >= 200 ? { loose: 60, bluff: 1250 } : { loose: -50, bluff: 750 };
  return { loose: 0, bluff: 1000 };
}

interface Read {
  /** 诈唬的倍数（‰）：这一手还在的对手都很紧（或很爱弃）就多偷，有跟注站（或一路看到摊牌的）就少诈唬 */
  bluff: number;
  /** 有跟注站时薄下注的门槛放低多少（相对强度，按 adapt 打折） */
  thin: number;
  /** 翻牌前最后加注的人加注很勤：跟注门槛放低多少（按 adapt 打折） */
  raiserLoose: number;
  /** 这一轮最后下注的人是什么风格，面对他的下注"他多半有牌"的折扣乘多少（‰）：紧的人 >1000，疯的人 <1000 */
  bettor: number;
  /** 后面等着说话的人都很紧：偷盲的门槛再放低多少（相对强度） */
  steal: number;
}
const NO_READ: Read = { bluff: 1000, thin: 0, raiserLoose: 0, bettor: 1000, steal: 0 };

const rate = (n: number | undefined, d: number | undefined): number => (d ? Math.floor(((n ?? 0) * 1000) / d) : 0);
/** 公开统计够用了才下判断（READ_HANDS 手；"看到翻牌"那项样本少一些，要 10 次） */
const sampled = (seen: readonly number[] | undefined): seen is readonly number[] => !!seen && seen[0]! >= READ_HANDS;

/**
 * 看对手的打法（入池、加注、摊牌率、下注的人、偷盲）：只用公开的统计（SeatView.seen，出手推出来的），手数够了才算。
 * 入池 ≤ 22% 算紧；入池 ≥ 45%、翻牌后下注加注不到跟注的六成算跟注站；翻牌前加注 ≥ 20% 算爱加注；
 * 看到翻牌的手里打到摊牌 ≥ 38% 算"一路看到底"（诈唬打不走），≤ 18% 算"爱弃牌"（诈唬、偷盲有用）
 */
function readOpponents(v: View, others: readonly number[], yet: readonly number[], bettor: number, sharp: boolean): Read {
  let tight = others.length > 0;
  let station = false;
  let sticky = false;
  let folder = others.length > 0;
  for (const s of others) {
    const seen = v.seats[s]!.seen;
    if (!sampled(seen)) {
      tight = false;
      folder = false;
      continue;
    }
    const vpip = rate(seen[1], seen[0]);
    if (vpip > 220) tight = false;
    if (vpip >= 450 && seen[3]! * 10 < seen[4]! * 6) station = true;
    const flops = seen[5] ?? 0;
    const wtsd = flops >= 10 ? rate(seen[6], flops) : -1;
    if (wtsd >= 380) sticky = true;
    if (wtsd < 0 || wtsd > 180) folder = false;
  }
  const raiser = lastPreflopRaiser(v);
  const rs = raiser >= 0 ? v.seats[raiser]!.seen : undefined;
  const loud = sampled(rs) && rs[2]! * 1000 >= 200 * rs[0]!;
  // 下注的人：很紧、很少下注的人下注，多半是真牌；入池高、翻牌前加注多、翻牌后下注比跟注多一倍的，水分大
  let bet = 1000;
  const bs = bettor >= 0 ? v.seats[bettor]?.seen : undefined;
  if (sampled(bs)) {
    const vpip = rate(bs[1], bs[0]);
    const aggr = bs[3]! * 10 >= (bs[4]! + 1) * 20;
    if (vpip <= 220 && !aggr) bet = 1250;
    else if (vpip >= 400 && aggr && rate(bs[2], bs[0]) >= 150) bet = 700;
  }
  // 等着说话的人（多半是盲注位）都很紧：偷
  const blindsTight = yet.length > 0 && yet.every((s) => sampled(v.seats[s]!.seen) && rate(v.seats[s]!.seen![1], v.seats[s]!.seen![0]) <= 240);
  // sharp（娱乐高手）下手更狠：对跟注站几乎不诈唬、薄打更宽，对紧的人多偷
  return {
    bluff: sharp ? (station ? 150 : sticky ? 400 : tight || folder ? 1500 : 1000) : station ? 500 : sticky ? 700 : tight || folder ? 1300 : 1000,
    thin: station || sticky ? (sharp ? 180 : 100) : 0,
    raiserLoose: loud ? 60 : 0,
    bettor: bet,
    steal: blindsTight ? 60 : 0,
  };
}

/** 这一轮还没说话的、没弃牌的对手（不含我）：翻牌前包括大小盲。后面等着的人越多，位置越前 */
function yetToAct(v: View, me: number): number[] {
  const acted = new Set<number>();
  for (let i = streetStart(v); i < v.log.length; i++) {
    const e = v.log[i]!;
    if (e.seat >= 0 && e.act !== 'sb' && e.act !== 'bb') acted.add(e.seat);
  }
  return v.seats.flatMap((s, i) => (i !== me && s.status === 'active' && !acted.has(i) ? [i] : []));
}

/** 低档的 shy / passive 对这个性格起几成：凶的少受压 */
const mild = (x: number, p: Persona, k: Skill): number => Math.min(1000, Math.floor((x * styled(p.mild, k)) / 1000));
/** 性格的风格项按这一档的 style 往 1000（标准）靠：低档只露一部分 */
const styled = (x: number, k: Skill): number => 1000 + Math.floor(((x - 1000) * k.style) / 1000);
/** 小错每次的概率（‰）：高档的电脑少犯一半，娱乐高手不犯 */
const flawRate = (p: Persona, k: Skill): number => (k.sharp ? 0 : Math.floor(((p.leak ?? 0) * (2000 - k.adapt)) / 2000));

/** 有效筹码（大盲数）：我和这一手里还在的对手里最深的那个，取小的 */
function effectiveBb(v: View, me: number, others: readonly number[]): number {
  const mine = v.seats[me]!.stack + v.seats[me]!.bet;
  let deepest = 0;
  for (const s of others) deepest = Math.max(deepest, v.seats[s]!.stack + v.seats[s]!.bet);
  return Math.floor(Math.min(mine, deepest) / v.bb);
}

/** 翻牌前这一手里真的掏了钱的对手（跟、加过，还没弃），至少 1 个 */
function voluntary(v: View, me: number): number {
  const s = new Set<number>();
  for (const e of v.log) {
    if (e.seat < 0) break;
    if (e.seat !== me && (e.act === 'call' || e.act === 'raise' || e.act === 'bet') && v.seats[e.seat]!.status !== 'folded') s.add(e.seat);
  }
  return Math.max(1, s.size);
}

/** 上一轮（翻牌上看翻牌前，转牌上看翻牌……）在操作记录里的起止下标；翻牌前没有上一轮 */
function prevStreet(v: View): [number, number] {
  const marks = v.log.flatMap((e, i) => (e.seat < 0 ? [i] : []));
  if (marks.length === 0) return [0, 0];
  const end = marks[marks.length - 1]!;
  return [marks.length >= 2 ? marks[marks.length - 2]! + 1 : 0, end];
}

/** 这一段操作记录里最后一个下注或加注的人，没有是 -1 */
function lastAggressor(v: View, [from, to]: [number, number]): number {
  let who = -1;
  for (let i = from; i < to; i++) {
    const e = v.log[i]!;
    if (e.act === 'raise' || e.act === 'bet') who = e.seat;
  }
  return who;
}

/** 这个人上一手摊牌时亮出来的是高牌（什么都没成）。只看 lastHand.shown（亮出来的牌，大家都看到） */
function showedAir(v: View, seat: number): boolean {
  if (seat < 0 || !v.lastHand) return false;
  const x = v.lastHand.shown.find((s) => s.seat === seat);
  return !!x && categoryOf(x.value) === HIGH_CARD;
}

/** 这一轮在操作记录里从哪儿开始（最后一次发公共牌之后；翻牌前从头） */
function streetStart(v: View): number {
  for (let i = v.log.length - 1; i >= 0; i--) if (v.log[i]!.seat < 0) return i + 1;
  return 0;
}

/** 翻牌以后连着几轮最后下注、加注的是我（到上一轮为止，往前数，断了就停） */
function streak(v: View, me: number): number {
  const marks = v.log.flatMap((e, i) => (e.seat < 0 ? [i] : []));
  let n = 0;
  // 第 j 轮（j ≥ 1 是翻牌以后）在 marks[j - 1] + 1 到 marks[j] 之间；最后一个 mark 之后是这一轮
  for (let j = marks.length - 1; j >= 1; j--) {
    if (lastAggressor(v, [marks[j - 1]! + 1, marks[j]!]) !== me) break;
    n++;
  }
  return n;
}

/** 这一轮有过几次下注或加注（盲注不算） */
function raisesThisStreet(v: View): number {
  let n = 0;
  for (let i = v.log.length - 1; i >= 0; i--) {
    const e = v.log[i]!;
    if (e.seat < 0) break;
    if (e.act === 'bet' || e.act === 'raise') n++;
  }
  return n;
}

/** 翻牌前最后一个加注的人，没有是 -1 */
function lastPreflopRaiser(v: View): number {
  let who = -1;
  for (const e of v.log) {
    if (e.seat < 0) break;
    if (e.act === 'raise' || e.act === 'bet') who = e.seat;
  }
  return who;
}

/**
 * 按翻牌前的动作猜每个对手的底牌范围（给蒙特卡洛的下限，见 equity.ts）：加过注的最紧，跟过加注的次之，平跟的再松一点。
 * 加注的人按这一档和性格里紧的那个猜（第 0–3 档本身不猜，只有性格里写了的阿强、老好、熊猫哥、板凳儿猜：他们翻牌前跟得松，翻牌后不看人会输穿）。
 * 都不猜时返回 undefined，蒙特卡洛按随机牌算
 */
function ranges(v: View, others: readonly number[], k: Skill, p: Persona): number[] | undefined {
  const raiser = Math.min(k.raiser, p.raiser);
  if (raiser >= 100 && k.caller >= 100 && k.limper >= 100) return undefined;
  const pct = new Map<number, number>();
  let level = v.bb;
  for (const e of v.log) {
    if (e.seat < 0) break;
    if (e.act === 'raise' || e.act === 'bet') {
      pct.set(e.seat, Math.min(pct.get(e.seat) ?? 100, raiser));
      level = e.amount;
    } else if (e.act === 'call') pct.set(e.seat, Math.min(pct.get(e.seat) ?? 100, level > v.bb ? k.caller : k.limper));
  }
  return others.map((s) => {
    const x = pct.get(s) ?? 100;
    return x >= 100 ? 0 : TOP[x]!;
  });
}

/**
 * 位置（千分数，加在门槛上）：按钮位最好，关煞位次之；翻牌前前位（后面等着说话的人多）再扣一点，桌子越大扣得越多。
 * 性格的 posX 管它占多大分量；会按筹码深浅的档（depth 非 0 是有效筹码的大盲数）：深筹码位置更值钱，短筹码不太看位置
 */
function positionOf(v: View, me: number, behind: number, p: Persona, k: Skill, depth: number): number {
  let x = positionBonus(v, me);
  if (v.board.length === 0) x -= Math.min(100, 25 * Math.max(0, behind - 3));
  const deep = depth >= 100 ? 1300 : depth > 0 && depth < 30 ? 600 : 1000;
  return Math.floor((x * styled(p.posX, k) * deep) / 1_000_000);
}

/** 按钮位最好，关煞位次之 */
function positionBonus(v: View, me: number): number {
  if (me === v.button) return 100;
  const n = v.seats.length;
  for (let i = 1; i < n; i++) {
    const k = (v.button - i + n) % n;
    if (v.seats[k]!.status !== 'out') return k === me ? 50 : 0;
  }
  return 0;
}

/** 加注的尺度带一点随机，像人：不总是同一个数 */
function raise(v: View, p: Persona, k: Skill, eq: number, raises: number, r: RandomStream): Action {
  const lg = v.legal!;
  let to: number;
  if (v.board.length === 0) {
    // 翻牌前：开池 2.5–3.5 个大盲（前面每有一个跟进的多加 1 个），再加注约 2.5–3.5 倍
    const limpers = v.log.filter((e) => e.act === 'call').length;
    const x = 5 + r.below(3);
    // 性格的加注大小（openX）：阿强、虎子加得大，板凳儿、老好只加一点点
    to = Math.floor(((raises === 0 ? Math.floor((x * v.bb) / 2) : Math.floor((x * v.currentBet) / 2)) * styled(p.openX, k)) / 1000) + (raises === 0 ? limpers * v.bb : 0);
  } else {
    // 翻牌后：性格的基本尺度乘 0.7–1.3（五档随机挑，不总是同一个数）；很大的牌再大一点
    // 河牌上的大牌，凶的人偶尔直接全下
    if (v.board.length === 5 && eq >= 900 && k.value >= 1000 && r.below(1000) < p.shove) return { t: 'allin' };
    // 低档（功力的 value 不到 1000；第 0–4 档）：尺度小一点，很大的牌也不再加码
    const size = Math.floor((Math.floor((p.size * k.value) / 1000) * (1000 + Math.floor(((r.below(5) - 2) * 150 * styled(p.spread, k)) / 1000))) / 1000) + (eq >= 850 && k.value >= 1000 ? 250 : 0);
    to = v.currentBet + Math.floor(((v.pot + lg.call) * size) / 1000);
  }
  return betTo(v, to);
}

/** 加到 to：取整到小盲的整数倍，夹在能加的范围里；剩的筹码不到池子一半就直接全下 */
function betTo(v: View, to: number): Action {
  const lg = v.legal!;
  let x = Math.floor(to / v.sb) * v.sb;
  x = Math.min(lg.maxTo, Math.max(lg.minTo, x));
  const me = v.seats[v.me!]!;
  const potAfter = v.pot + (x - me.bet);
  if ((lg.maxTo - x) * 2 < potAfter) x = lg.maxTo;
  return x === lg.maxTo ? { t: 'allin' } : { t: 'raise', to: x };
}
