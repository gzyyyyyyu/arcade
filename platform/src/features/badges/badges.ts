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
  /** 数的单位，用在"还差 x 局" */
  unit: string;
  /** 已拿到几档：0 到 tiers.length */
  tier: number;
  /** 离下一档还差多少；满档是 null */
  left: number | null;
  /** 没拿到时的进度说明，如"还差 8 局" */
  progress: string;
  /** 总共有几档 */
  max: number;
}

export const TIER_NAMES = ['铜', '银', '金'] as const;

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
  how: string;
  glyph: GlyphName;
  tiers: readonly number[];
  unit: string;
  value: (t: Totals) => number;
  /** 默认"还差 x 单位"；有特别说法的写这里 */
  progress?: (t: Totals, left: number) => string;
}

/** 总局数够不够算"稳"这类比例徽章 */
const MIN_ROUNDS = 30;
const STEADY_ROUNDS = 20;

const DEFS: readonly Def[] = [
  { id: 'tour', name: '八方来客', how: '在不同的游戏里都上过桌：3 个、5 个、7 个', glyph: 'compass', tiers: [3, 5, 7], unit: '个游戏', value: (t) => t.played },
  { id: 'regular', name: '常客', how: '所有游戏加起来打满 50、200、1000 局', glyph: 'coin', tiers: [50, 200, 1000], unit: '局', value: (t) => t.rounds },
  { id: 'seat', name: '老座位', how: '带筹码上桌 20、100、500 次', glyph: 'people', tiers: [20, 100, 500], unit: '次', value: (t) => t.n },
  { id: 'winner', name: '赢家', how: '所有游戏加起来赢 10、50、200 场', glyph: 'crown', tiers: [10, 50, 200], unit: '场', value: (t) => t.wins },
  { id: 'big', name: '大赢一把', how: '单把最多结回 10,000、50,000、200,000 筹码', glyph: 'star', tiers: [10_000, 50_000, 200_000], unit: '筹码', value: (t) => t.best },
  { id: 'titles', name: '称号收藏家', how: '收集 3、10、25 个游戏称号', glyph: 'ribbon', tiers: [3, 10, 25], unit: '个称号', value: (t) => t.titles },
  { id: 'hot', name: '本周手热', how: '这周各游戏加起来净赢：大于 0、5,000、50,000 筹码（周一清零）', glyph: 'flame', tiers: [1, 5_000, 50_000], unit: '筹码', value: (t) => t.wnet },
  {
    id: 'steady',
    name: '不倒翁',
    how: `打满 ${STEADY_ROUNDS} 局，而且总账不亏`,
    glyph: 'shield',
    tiers: [1],
    unit: '',
    value: (t) => (t.rounds >= STEADY_ROUNDS && t.net >= 0 ? 1 : 0),
    progress: (t) => (t.rounds < STEADY_ROUNDS ? `还差 ${STEADY_ROUNDS - t.rounds} 局` : `总账还差 ${Math.max(0, -t.net).toLocaleString('zh-CN')} 筹码回本`),
  },
  {
    id: 'sharp',
    name: '神机妙算',
    how: `打满 ${MIN_ROUNDS} 局后，总胜率达到 30%、40%、50%`,
    glyph: 'target',
    tiers: [30, 40, 50],
    unit: '%',
    value: (t) => (t.rounds >= MIN_ROUNDS ? Math.floor((t.wins / t.rounds) * 100) : 0),
    progress: (t, left) => (t.rounds < MIN_ROUNDS ? `还差 ${MIN_ROUNDS - t.rounds} 局才开始算` : `胜率还差 ${left} 个百分点`),
  },
  { id: 'cards', name: '牌桌老手', how: '在牌类、麻将游戏里打满 100、500、2000 局', glyph: 'card', tiers: [100, 500, 2000], unit: '局', value: (t) => t.card },
  { id: 'solo', name: '独行侠', how: '在单人游戏里打满 20、100、500 局', glyph: 'compass', tiers: [20, 100, 500], unit: '局', value: (t) => t.solo },
  { id: 'room', name: '热闹局', how: '在能开好友房的游戏里打满 30、150、600 局', glyph: 'people', tiers: [30, 150, 600], unit: '局', value: (t) => t.room },
  { id: 'master', name: '一门精通', how: '在同一个游戏里打满 100、500、2000 局', glyph: 'target', tiers: [100, 500, 2000], unit: '局', value: (t) => t.deepest },
  { id: 'net', name: '稳稳进账', how: '各游戏加起来累计净赢 20,000、100,000、500,000 筹码', glyph: 'coin', tiers: [20_000, 100_000, 500_000], unit: '筹码', value: (t) => t.net },
  {
    id: 'all',
    name: '全能选手',
    how: '每个能带筹码的游戏都赢过至少一次',
    glyph: 'crown',
    tiers: [1],
    unit: '',
    value: (t) => (t.wallets > 0 && t.winners >= t.wallets ? 1 : 0),
    progress: (t) => `还差 ${Math.max(0, t.wallets - t.winners)} 个游戏`,
  },
];

export const BADGE_COUNT = DEFS.length;

/** 算出全部徽章（没拿到的也在，带进度）。games 是战绩接口的 games，gameList 是大厅登记的游戏 */
export function badgesOf(games: Record<string, CareerView>, gameList: readonly BadgeGame[]): Badge[] {
  const t = totalsOf(games, gameList);
  return DEFS.map((d) => {
    const value = d.value(t);
    const tier = d.tiers.filter((x) => value >= x).length;
    const next = tier < d.tiers.length ? d.tiers[tier]! : null;
    const left = next === null ? null : Math.max(0, next - value);
    const progress = next === null ? '' : d.progress ? d.progress(t, left!) : `还差 ${left!.toLocaleString('zh-CN')} ${d.unit}`;
    return { id: d.id, name: d.name, how: d.how, glyph: d.glyph, tiers: d.tiers, value, unit: d.unit, tier, left, progress, max: d.tiers.length };
  });
}

/** 已解锁的徽章数（拿到至少一档的） */
export const unlockedCount = (badges: readonly Badge[]): number => badges.filter((b) => b.tier > 0).length;
