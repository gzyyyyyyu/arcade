/** 结束页。 */
import type { Regime } from '../segment.ts';
import { storyView } from '../reveal.ts';
import { difficultyDef, personaAccount, personaById, stockById, themeById } from '../content/index.ts';
import { extRecap } from '../extview.ts';
import { isCleanLiveSetup, liveAssets, liveMultipleBp, liveStart, liveTierOf, liveValue } from '../live.ts';
import type { LiveTier } from '../liveTiers.ts';
import { debtOf, isRankedSetup, totalDays } from '../engine/index.ts';
import { achievementsOf, runId, seenOf } from '../meta.ts';
import type { SeenSets } from '../meta.ts';
import { AUTO_SELL_LABEL } from '../labels.ts';
import { round2 } from '../market.ts';
import type { GameState, PersonaId, ThemeId } from '../types.ts';

// ================================================================ 结束页

export interface RunSummary {
  /** 本局已经结束（won / lost）；没结束时档案不记 */
  ended: boolean;
  won: boolean;
  account: number;
  peakAccount: number;
  /** 撑到第几个月（通关为 12） */
  month: number;
  billsPaid: number;
  days: number;
  totalDays: number;
  buys: number;
  limitUpDays: number;
  maxBoards: number;
  chains: number;
  /** 最赚的一笔（含未卖出的持仓） */
  bestTrade: { stockId: string; name: string; ret: number } | null;
  title: string;
  /** 0.6.3 按打法给的评语：一个标签和一句话（结束页称号下面） */
  style: PlayStyle;
  /** 0.5.4：开局本钱、账户实际付掉的账单合计、炒股本身累计赚亏 */
  startAccount: number;
  billMoney: number;
  tradeMoney: number;
  /**
   * 0.5.4：其他进出（红包、事件、月度奖励、借款利息、被收走的罚款……），让 本钱 + 炒股 − 账单 + 其他 + 没还的借款 = 最后剩。
   * 按差额算，保证几个数加得起来。
   */
  otherMoney: number;
  /** 0.5.4：结束时还欠着银行的钱（中途出局时借来的钱还在账户里） */
  debtLeft: number;
  autoSold: Record<string, number>;
  /** 0.3.0：档案用 */
  seed: string;
  /** 去重用的唯一标识 */
  runId: string;
  persona: PersonaId;
  personaName: string;
  difficulty: number;
  difficultyName: string;
  /** 每日挑战的日期；不是每日挑战为 null */
  daily: string | null;
  /** 闪电盘的日期；不是闪电盘为 null */
  flash: string | null;
  /** 本周市场的周号；不是本周市场为 null */
  weekly: string | null;
  /** 正常开局（不是调试设置）：只有这样的局计入档案 */
  ranked: boolean;
  /** 新手课（core/lesson.ts）：只记过没过，不进档案的局数和成绩 */
  lesson: boolean;
  /** 0.10.0 娱乐短局（打几个月、最后交首付）；完整一年、实盘、每日挑战为 false */
  short: boolean;
  /** 黑天鹅 Boss 日：打到最后一天的局有（名字、给持仓带来的盈亏元、有没有中招）；没打到最后一天、没有黑天鹅的局缺省 */
  swan?: { name: string; money: number; touched: boolean };
  /**
   * 0.6.0 实盘：打几个月、开局资产、当前资产（账户 − 借款）、结回倍数（万分之几）、档位和一份、按倍数结回多少；
   * clean 是正常从界面开的实盘局（图鉴照记）。娱乐局为 null
   */
  live: { months: number; start: number; assets: number; bp: number; tier: LiveTier | null; stake: number; value: number; clean: boolean; /** 0.11.0 杠杆（1 / 2 / 3）和是不是跌到清零线结束的 */ gear: number; margin: boolean; /** 0.32.0 资产涨跌按几倍算进筹码（开局抄进 setup.live.lev；老局没有按 1），结束页的账本用 */ lev: number } | null;
  /** 本局达成的成就 id（结束后才判定） */
  achievements: string[];
  /** 本局见过的东西（图鉴） */
  seen: SeenSets;
  /** 0.4 重做：这局用的真实行情段（图鉴"见过的行情段"）；合成行情为 null */
  segment: SeenSegment | null;
  /** 0.4 C：本局点亮的小知识 id；没有新机制的局为空 */
  knowledge: string[];
  /** 0.4 C：本局的重仓、押跌、抵押经历（几句大白话） */
  recap: string[];
}

/** 图鉴里记的一段行情。 */
export interface SeenSegment {
  /** 段 id（不透明的短哈希；0.4 开发期的旧档案里是"年-月-市况"，照样能显示） */
  id: string;
  regime: Regime;
  /** 游戏化标题（不透露年代和公司） */
  title: string;
  /** 最近一局的"这段日子"小故事（图鉴里可以重看）；旧档案没有 */
  story?: string[];
  /** 最近一局的结局吐槽 */
  verdict?: string;
}

function seenSegment(s: Readonly<GameState>): SeenSegment | null {
  const r = s.real;
  const story = storyView(s);
  if (!r || !story) return null;
  return { id: r.segId, regime: r.regime, title: story.title, story: story.lines, verdict: story.verdict };
}

/** 结束页称号：爆仓按撑到的月份，通关按最终账户。 */
/**
 * 称号。通关的按"炒股本身赚了几倍本钱"评（0.5.4，试玩反馈：10 万剩 4.38 万也叫"惊险上岸"看不懂）：
 * 12 个月账单合计比本钱还多，通关时剩的钱普遍只有一两万，剩多少不说明打得好不好；炒股净赚才说明。
 * 本钱不是正数（调试开局）时按最后剩的钱评。
 */
export function titleFor(won: boolean, month: number, account: number, trade: { money: number; start: number }): string {
  if (!won) return month <= 3 ? '新韭菜' : month <= 8 ? '老韭菜' : '差一点上岸的韭菜';
  if (trade.start > 0) {
    // 只看炒股本身：剩多少钱受本钱和账单影响（自定义开局本钱可以很大），不算数。
    // 分档按机器人实测（真实行情各 120 局通关局的 炒股净赚/本钱）：smart 中位 0.5（p10 0.21、p90 1.5），oracle 中位约 4
    const x = trade.money / trade.start;
    if (x >= 3) return '百万韭菜王';
    if (x >= 1.2) return '大户新秀';
    if (x >= 0.3) return '上岸散户';
    return '惊险上岸';
  }
  if (account >= 1_000_000) return '百万韭菜王';
  if (account >= 300_000) return '大户新秀';
  if (account >= 100_000) return '上岸散户';
  return '惊险上岸';
}

export interface PlayStyle {
  id: string;
  tag: string;
  line: string;
}

/**
 * 0.6.3 按这一局的打法给评语：从最有特点的往下看，第一个对上的就是。只看本局统计，不看输赢（输赢在称号里）。
 * 文案只调侃打法，不调侃人；破产也不挖苦。
 */
export function playStyle(s: Readonly<GameState>): PlayStyle {
  const st = s.stats;
  const log = s.ext?.log;
  const days = Math.max(1, st.days);
  const recBuys = st.trades.filter((t) => t.recBy !== null).length;
  const followRate = st.trades.length > 0 ? recBuys / st.trades.length : 0;
  const style = (id: string, tag: string, line: string): PlayStyle => ({ id, tag, line });
  // 开局自带持仓（自定义开局）也算动过：有交易就不是观望
  if (st.buys === 0 && st.trades.length === 0 && s.slots.every((h) => !h)) return style('zen', '观望大师', '一整局手都没伸出去，看了个热闹，账单倒是一个没落。');
  if (log && log.borrowed.length > 0 && log.seized.length > 0) return style('allin_bank', '押上全部家当', '把东西押给银行借钱炒股，还真被收走过。下回让它们在家待着吧。');
  if (log && log.shorts >= 5) return style('bear', '反着来的人', `押跌 ${log.shorts} 回，别人追涨你看跌，群里都怕你开口。`);
  if (st.maxBoards >= 5) return style('rider', '连涨骑手', `骑着一只连涨 ${st.maxBoards} 天的小人，风大的时候也没被甩下来。`);
  if (st.activeDays / days >= 0.75 && st.buys >= 30) return style('busy', '手速选手', '几乎天天有进有出，手续费都认识你了。');
  if (followRate >= 0.7 && st.trades.length >= 8) return style('follower', '群聊信徒', '买的大半是群友推荐的，群里一说话你就动手。');
  if (st.maxSameTheme >= 3) return style('one_theme', '一根筋', '认准一个风口一次拿好几只，要么吃饱，要么一起饿。');
  if (st.creditUsed >= 2) return style('card', '信用卡战士', `月底钱不够，信用卡垫了 ${st.creditUsed} 回，硬是撑着打下去。`);
  if (st.limitUpDays >= 10) return style('limitup', '涨停收藏家', `持仓里出过 ${st.limitUpDays} 天涨停，看到满屏红色就开心。`);
  if (st.maxThemes >= 4) return style('spread', '雨露均沾', '几个风口都放一点，哪边起风都有份。');
  if (st.buys <= 6) return style('patient', '慢工细活', '一局只出手寥寥几次，买了就拿着，不急不躁。');
  return style('plain', '普通上班族', '该买买、该卖卖，跟群里大多数人差不多，也挺好。');
}

export function runSummary(s: Readonly<GameState>): RunSummary {
  const won = s.phase === 'won';
  const startAccount = s.setup?.account ?? personaAccount(s.persona);
  const debtLeft = s.ext ? debtOf(s) : 0;
  let best: RunSummary['bestTrade'] = null;
  const consider = (stockId: string, ret: number): void => {
    if (!best || ret > best.ret) best = { stockId, name: stockById(stockId).name, ret };
  };
  for (const t of s.stats.trades) consider(t.stockId, t.ret);
  for (const h of s.slots) if (h) consider(h.stockId, Math.round((h.value - 1) * 10000) / 100);
  const autoSold: Record<string, number> = {};
  for (const t of s.stats.trades) {
    if (t.reason === 'stop' || t.reason === 'take' || t.reason === 'delist') {
      const k = AUTO_SELL_LABEL[t.reason];
      autoSold[k] = (autoSold[k] ?? 0) + 1;
    }
  }
  return {
    ended: won || s.phase === 'lost',
    won,
    account: s.account,
    peakAccount: s.stats.peakAccount,
    month: s.month,
    billsPaid: s.stats.billsPaid,
    days: s.stats.days,
    totalDays: totalDays(),
    buys: s.stats.buys,
    limitUpDays: s.stats.limitUpDays,
    maxBoards: s.stats.maxBoards,
    chains: s.stats.chains,
    bestTrade: best,
    style: playStyle(s),
    title: titleFor(won, s.month, s.account, { money: s.stats.tradeMoney, start: startAccount }),
    startAccount,
    billMoney: s.stats.billMoney,
    tradeMoney: s.stats.tradeMoney,
    otherMoney: round2(s.account - startAccount - s.stats.tradeMoney + s.stats.billMoney - debtLeft),
    debtLeft,
    autoSold,
    seed: s.seed,
    runId: runId(s),
    persona: s.persona,
    personaName: personaById(s.persona).name,
    difficulty: s.difficulty,
    difficultyName: difficultyDef(s.difficulty).name,
    daily: s.setup?.daily ?? null,
    flash: s.setup?.flash ?? null,
    weekly: s.setup?.weekly ?? null,
    ranked: isRankedSetup(s.setup),
    lesson: s.setup?.lesson === true,
    short: !!s.setup?.short,
    ...(s.lastDay?.swan ? { swan: { name: s.lastDay.swan.name, money: s.lastDay.swan.money, touched: s.lastDay.swan.touched } } : {}),
    live: s.setup?.live
      ? {
          months: s.setup.live.months,
          start: liveStart(s),
          assets: liveAssets(s),
          bp: liveMultipleBp(s),
          tier: liveTierOf(s)?.id ?? null,
          stake: liveTierOf(s)?.stake ?? 0,
          value: liveValue(s) ?? 0,
          clean: isCleanLiveSetup(s.setup),
          gear: s.setup.live.gear?.x ?? 1,
          lev: s.setup.live.lev ?? 1,
          margin: s.endReason === 'margin',
        }
      : null,
    achievements: achievementsOf(s),
    seen: seenOf(s),
    segment: seenSegment(s),
    knowledge: [...(s.ext?.learned ?? [])],
    recap: extRecap(s),
  };
}

/** 题材名（画面常用）。 */
export function themeName(id: ThemeId): string {
  return themeById(id).name;
}
