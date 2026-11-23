/**
 * 街机厅徽章：从战绩（15.11 的 games）在浏览器里算出来，不存、不上传，换算法不用迁移。
 * 只认大厅登记过的游戏（gameList），战绩里多出来的游戏 id 一律不算。
 * 每个徽章最多三档（铜/银/金）；数的都是局数、胜场、筹码这类"打了多少"，没有任何兑换，也不鼓励多带筹码。
 */
import type { CareerView } from '../../api.ts';

type GlyphName = 'compass' | 'coin' | 'crown' | 'star' | 'flame' | 'card' | 'shield' | 'target' | 'ribbon' | 'people';

/** 算徽章只用到游戏登记的这几项：测试里不用拼整份 GameEntry */
export interface BadgeGame {
  id: string;
  tags: readonly string[];
  status: string;
  wallet?: false;
}

export interface Badge {
  id: string;
  name: string;
  /** 一句话讲怎么拿 */
  how: string;
  glyph: GlyphName;
  /** 每一档要到的数 */
  tiers: readonly number[];
  /** 现在的数 */
  value: number;
  /** 数的单位 */
  unit: string;
  /** 已拿到几档：0 到 tiers.length */
  tier: number;
  /** 离下一档还差多少；满档是 null */
  left: number | null;
  /** 卡上写的那一行：几档、离下一档还要做什么（"铜牌 · 再上桌 80 次升银牌"、"再打 50 局就拿到"、满档"金牌"） */
  line: string;
  /** 总共有几档 */
  max: number;
}

const TIER_NAMES = ['铜', '银', '金'] as const;

interface Totals {
  played: number;
  n: number;
  net: number;
  wnet: number;
  rounds: number;
  wins: number;
  best: number;
  titles: number;
  /** 单个游戏里局数最多的 */
  deepest: number;
  card: number;
  solo: number;
  room: number;
  /** 登记在册、能用钱包的游戏里，赢过的有几个 / 一共几个 */
  winners: number;
  wallets: number;
}

const CARD_TAGS = ['牌类', '麻将'];

function totalsOf(games: Record<string, CareerView>, gameList: readonly BadgeGame[]): Totals {
  const t: Totals = { played: 0, n: 0, net: 0, wnet: 0, rounds: 0, wins: 0, best: 0, titles: 0, deepest: 0, card: 0, solo: 0, room: 0, winners: 0, wallets: 0 };
  for (const g of gameList) {
    const c = games[g.id];
    const countable = g.status === 'playable' && g.wallet !== false;
    if (countable) t.wallets++;
    if (!c) continue;
    if (c.n > 0) t.played++;
    t.n += c.n;
    t.net += c.net;
    t.wnet += c.wnet;
    t.rounds += c.rounds;
    t.wins += c.wins;
    t.best = Math.max(t.best, c.best);
    t.titles += c.titles.length;
    t.deepest = Math.max(t.deepest, c.rounds);
    if (g.tags.some((x) => CARD_TAGS.includes(x))) t.card += c.rounds;
    if (g.tags.includes('单人')) t.solo += c.rounds;
    if (g.tags.includes('好友房')) t.room += c.rounds;
    if (countable && (c.wins > 0 || c.best > 0)) t.winners++;
  }
  return t;
}

interface Def {
  id: string;
  name: string;
  /** 三档的：要做到什么（"带筹码上桌"），说明里接上"20 次铜、100 次银、500 次金"；只有一档的写整句 how */
  what?: string;
  how?: string;
  glyph: GlyphName;
  tiers: readonly number[];
  unit: string;
  value: (t: Totals) => number;
  /** 离下一档还要做什么（"再上桌 80 次"），后面接"就拿到"或"升银牌"；默认"再 80 次"。done 为真是整句，不再接 */
  step?: (t: Totals, left: number, next: number) => string | { done: string };
}

/** 总局数够不够算"稳"这类比例徽章 */
const MIN_ROUNDS = 30;
const STEADY_ROUNDS = 20;

const n = (x: number) => x.toLocaleString('zh-CN');

const DEFS: readonly Def[] = [
  { id: 'tour', name: '八方来客', what: '在几个不同的游戏里上过桌', glyph: 'compass', tiers: [3, 5, 7], unit: '个游戏', value: (t) => t.played, step: (_, l) => `再玩 ${l} 个游戏` },
  { id: 'regular', name: '常客', what: '所有游戏加起来打满', glyph: 'coin', tiers: [50, 200, 1000], unit: '局', value: (t) => t.rounds, step: (_, l) => `再打 ${n(l)} 局` },
  { id: 'seat', name: '老座位', what: '带筹码上桌', glyph: 'people', tiers: [20, 100, 500], unit: '次', value: (t) => t.n, step: (_, l) => `再上桌 ${n(l)} 次` },
  { id: 'winner', name: '赢家', what: '所有游戏加起来赢', glyph: 'crown', tiers: [10, 50, 200], unit: '场', value: (t) => t.wins, step: (_, l) => `再赢 ${n(l)} 场` },
  { id: 'big', name: '大赢一把', what: '单把赢到', glyph: 'star', tiers: [10_000, 50_000, 200_000], unit: '筹码', value: (t) => t.best, step: (_, _l, next) => `单把赢到 ${n(next)}` },
  { id: 'titles', name: '称号收藏家', what: '收集游戏称号', glyph: 'ribbon', tiers: [3, 10, 25], unit: '个', value: (t) => t.titles, step: (_, l) => `再收 ${l} 个称号` },
  { id: 'hot', name: '本周手热', how: '这周各游戏加起来净赢（周一清零）：赢了就铜，5,000 筹码银、50,000 筹码金', glyph: 'flame', tiers: [1, 5_000, 50_000], unit: '筹码', value: (t) => t.wnet, step: (_, l) => `本周净赢再多 ${n(l)}` },
  {
    id: 'steady',
    name: '不倒翁',
    how: `打满 ${STEADY_ROUNDS} 局，而且总账不亏`,
    glyph: 'shield',
    tiers: [1],
    unit: '',
    value: (t) => (t.rounds >= STEADY_ROUNDS && t.net >= 0 ? 1 : 0),
    step: (t) => (t.rounds < STEADY_ROUNDS ? `再打 ${STEADY_ROUNDS - t.rounds} 局` : `总账再赢回 ${n(Math.max(0, -t.net))} 筹码`),
  },
  {
    id: 'sharp',
    name: '神机妙算',
    what: `打满 ${MIN_ROUNDS} 局后，总胜率达到`,
    glyph: 'target',
    tiers: [30, 40, 50],
    unit: '%',
    value: (t) => (t.rounds >= MIN_ROUNDS ? Math.floor((t.wins / t.rounds) * 100) : 0),
    step: (t, left) => (t.rounds < MIN_ROUNDS ? { done: `再打 ${MIN_ROUNDS - t.rounds} 局才开始算胜率` } : `胜率再高 ${left} 个百分点`),
  },
  { id: 'cards', name: '牌桌老手', what: '在牌类、麻将游戏里打满', glyph: 'card', tiers: [100, 500, 2000], unit: '局', value: (t) => t.card, step: (_, l) => `再打 ${n(l)} 局` },
  { id: 'solo', name: '独行侠', what: '在单人游戏里打满', glyph: 'compass', tiers: [20, 100, 500], unit: '局', value: (t) => t.solo, step: (_, l) => `再打 ${n(l)} 局` },
  { id: 'room', name: '热闹局', what: '在能开好友房的游戏里打满', glyph: 'people', tiers: [30, 150, 600], unit: '局', value: (t) => t.room, step: (_, l) => `再打 ${n(l)} 局` },
  { id: 'master', name: '一门精通', what: '在同一个游戏里打满', glyph: 'target', tiers: [100, 500, 2000], unit: '局', value: (t) => t.deepest, step: (_, l) => `再打 ${n(l)} 局` },
  { id: 'net', name: '稳稳进账', what: '各游戏加起来累计净赢', glyph: 'coin', tiers: [20_000, 100_000, 500_000], unit: '筹码', value: (t) => t.net, step: (_, l) => `累计净赢再多 ${n(l)}` },
  {
    id: 'all',
    name: '全能选手',
    how: '每个能带筹码的游戏都赢过至少一次',
    glyph: 'crown',
    tiers: [1],
    unit: '',
    value: (t) => (t.wallets > 0 && t.winners >= t.wallets ? 1 : 0),
    step: (t) => `再在 ${Math.max(0, t.wallets - t.winners)} 个游戏里各赢一次`,
  },
];

export const BADGE_COUNT = DEFS.length;

/** "带筹码上桌：20 次铜、100 次银、500 次金"；百分比写"30% 铜" */
function howOf(d: Def): string {
  if (d.how) return d.how;
  const sp = d.unit === '%' ? '' : ' ';
  return `${d.what}：${d.tiers.map((x, i) => `${n(x)}${sp}${d.unit}${TIER_NAMES[i]}`).join('、')}`;
}

/** 卡上那一行：没拿到"再打 50 局就拿到"，拿到没满档"铜牌 · 再上桌 80 次升银牌"，满档"金牌" */
function lineOf(d: Def, t: Totals, tier: number, left: number | null): string {
  const got = tier > 0 ? `${TIER_NAMES[tier - 1]}牌` : '';
  if (left === null) return got;
  const next = d.tiers[tier]!;
  const step = d.step ? d.step(t, left, next) : `再 ${n(left)} ${d.unit}`;
  if (typeof step !== 'string') return got ? `${got} · ${step.done}` : step.done;
  const sp = /\d$/.test(step) ? ' ' : '';
  return got ? `${got} · ${step}${sp}升${TIER_NAMES[tier]}牌` : `${step}${sp}就拿到`;
}

/** 算出全部徽章（没拿到的也在，带进度）。games 是战绩接口的 games，gameList 是大厅登记的游戏 */
export function badgesOf(games: Record<string, CareerView>, gameList: readonly BadgeGame[]): Badge[] {
  const t = totalsOf(games, gameList);
  return DEFS.map((d) => {
    const value = d.value(t);
    const tier = d.tiers.filter((x) => value >= x).length;
    const next = tier < d.tiers.length ? d.tiers[tier]! : null;
    const left = next === null ? null : Math.max(0, next - value);
    return { id: d.id, name: d.name, how: howOf(d), glyph: d.glyph, tiers: d.tiers, value, unit: d.unit, tier, left, line: lineOf(d, t, tier, left), max: d.tiers.length };
  });
}

/** 已解锁的徽章数（拿到至少一档的） */
export const unlockedCount = (badges: readonly Badge[]): number => badges.filter((b) => b.tier > 0).length;
