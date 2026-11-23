/**
 * 成就（DESIGN.md 第 7 节）：只管"哪一步解锁哪个、进度怎么数"，纯函数，不碰画面和存储。
 * 只按自己座位的公开事件和一场打完的结果判；没有的事件（没有牌例、没有事件的东西）不做成就。
 * 解锁了就是解锁了，不会收回；计数（打完几场、这一场和几把）一起放在记录里，由画面层存取。
 */
import type { RcEvent } from '../core/variants/riichi/index.ts';
import type { XzEvent } from '../core/variants/sichuan-xuezhan/index.ts';
import { dexProgress, type DexRecord } from './dex.ts';

export interface AchRecord {
  /** 已解锁的 id */
  got: Record<string, 1>;
  /** 累计：打完几场 */
  played: number;
  /** 这一场已经胡了几把（一场打完或新开一场时清零） */
  wins: number;
  /** 最后判过的那一步的标识（achKey），刷新页面后同一步不再判；老数据没有这一项 */
  last?: string;
}

/** 玩法：xz 只在川麻里能拿，rc 只在立直里能拿，all 两边都行 */
type AchScope = 'xz' | 'rc' | 'all';
interface AchDef {
  id: string;
  name: string;
  /** 没解锁时灰着写的"怎么达成" */
  how: string;
  scope: AchScope;
}

export const ACHIEVEMENTS: readonly AchDef[] = [
  { id: 'first_win', name: '开张大吉', how: '第一次胡牌', scope: 'all' },
  { id: 'first_zimo', name: '自己摸来的', how: '第一次自摸胡牌', scope: 'all' },
  { id: 'kan_win', name: '杠上开花', how: '杠完补的牌正好胡了', scope: 'all' },
  { id: 'last_tile', name: '海底捞月', how: '和最后一张牌（摸到的或打出的都算）', scope: 'all' },
  { id: 'rob_kan', name: '截胡', how: '别人加杠的那张牌，你正好胡了', scope: 'all' },
  { id: 'multi_ron', name: '一炮双响', how: '同一张牌被两家以上同时胡，你是其中一家', scope: 'all' },
  { id: 'flush', name: '清一色', how: '胡一手清一色（全是同一门）', scope: 'all' },
  { id: 'seven_pairs', name: '七对', how: '胡一手七个对子', scope: 'all' },
  { id: 'wins3', name: '一场三胡', how: '一场里胡 3 把', scope: 'all' },
  { id: 'first_place', name: '一场第一', how: '一场打完，排第一（川麻看输赢最多，立直看名次）', scope: 'all' },
  { id: 'played10', name: '常客', how: '打完 10 场', scope: 'all' },
  { id: 'played50', name: '老茶客', how: '打完 50 场', scope: 'all' },
  { id: 'big_fan', name: '大牌', how: '一把和到 4 番以上', scope: 'xz' },
  { id: 'heaven_earth', name: '天地胡', how: '胡一手天胡或地胡（起手就胡）', scope: 'xz' },
  { id: 'dex10', name: '图鉴十样', how: '图鉴里集到 10 样番型或役', scope: 'all' },
  { id: 'dex_xz', name: '川麻集齐', how: '川麻番型图鉴全部集齐', scope: 'xz' },
  { id: 'haneman', name: '跳满', how: '一把和到跳满以上（6 番起）', scope: 'rc' },
  { id: 'yakuman', name: '役满', how: '胡一手役满（含累计役满）', scope: 'rc' },
  { id: 'ippatsu', name: '一发', how: '立直后一巡内胡牌', scope: 'rc' },
  { id: 'ura', name: '里宝牌', how: '立直胡牌翻开里宝牌，里面有宝牌', scope: 'rc' },
  { id: 'dealer3', name: '连庄三次', how: '坐庄连庄到第 3 本场', scope: 'rc' },
  { id: 'dex_rc', name: '立直集齐', how: '立直役和役满图鉴全部集齐', scope: 'rc' },
];

export const emptyAch = (): AchRecord => ({ got: {}, played: 0, wins: 0 });

const known = new Set(ACHIEVEMENTS.map((a) => a.id));
const count = (x: unknown): number => (typeof x === 'number' && Number.isInteger(x) && x > 0 ? x : 0);

/** 从存储里读出来的东西不可信：认不得的 id 丢掉，计数不是正整数当 0 */
export function parseAch(raw: unknown): AchRecord {
  const out = emptyAch();
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as Record<string, unknown>;
  const got = r.got;
  if (typeof got === 'object' && got !== null && !Array.isArray(got)) for (const id of Object.keys(got)) if (known.has(id)) out.got[id] = 1;
  out.played = count(r.played);
  if (typeof r.last === 'string' && r.last) out.last = r.last;
  out.wins = count(r.wins);
  return out;
}

/** 一步里的结局：画面层从视图里取（立直看名次，川麻看净输赢最多）；没打完是 null */
export interface AchCtx {
  /** 这一步一场打完了，自己是不是第一；没打完、不知道时 null */
  first: boolean | null;
  dex: DexRecord;
}

const FLUSH = new Set(['qing', 'chinitsu']);
const PAIRS = new Set(['qidui', 'longqidui', 'chiitoi']);
const LAST = new Set(['haidi', 'haidipao', 'haitei', 'houtei']);
const KAN_WIN = new Set(['gangkai', 'rinshan']);
const BIG_LIMIT = new Set(['haneman', 'baiman', 'sanbaiman', 'yakuman']);

/** 这一步（一份事件）里自己的每一手胡牌：按"哪些 id 的番型 / 役"整理成一样的形状 */
interface MyWin {
  ids: string[];
  tsumo: boolean;
  rob: boolean;
  from: number | null;
  tile: number;
  fan: number;
  rc?: RcEvent & { e: 'win' };
}

const myWins = (events: readonly (XzEvent | RcEvent)[], seat: number): MyWin[] => {
  const out: MyWin[] = [];
  for (const e of events) {
    if (e.e === 'hu' && e.seat === seat) out.push({ ids: e.items.map((i) => i.id), tsumo: e.from === null, rob: e.rob, from: e.from, tile: e.tile, fan: e.fan });
    else if (e.e === 'win' && e.seat === seat) out.push({ ids: e.score.yaku.map((y) => y.id), tsumo: e.from === null, rob: e.rob, from: e.from, tile: e.tile, fan: e.score.han, rc: e });
  }
  return out;
};

/** 同一张牌被两家以上同时和（只数点炮的那种，自摸不可能多家） */
const multiRon = (events: readonly (XzEvent | RcEvent)[], mine: MyWin[]): boolean =>
  mine.some((w) => w.from !== null && events.filter((e) => (e.e === 'hu' || e.e === 'win') && e.from === w.from && e.tile === w.tile).length >= 2);

/**
 * 这一步里自己新解锁了什么，返回新记录和新解锁的 id（按成就表的顺序）。旁观（seat 为 null）不判。
 * 不改传进来的记录；没有任何变化时原样返回同一个对象。
 */
/**
 * 这一步的标识：场号（单机存档号 / 房间码）+ 第几局 + 牌墙余量 + 事件数和最后一个事件。都是刷新后不变的信息（和图鉴的 dexKey 同一个思路，
 * 但成就也要判没有胡牌的步：发牌清零、一场打完），没有事件返回 null
 */
export function achKey(scope: string, v: { round?: number; wind?: number; hand?: number; honba?: number; wall: number }, events: readonly (XzEvent | RcEvent)[]): string | null {
  if (!events.length) return null;
  return [scope, v.round ?? `${v.wind}-${v.hand}-${v.honba}`, v.wall, events.length, events.at(-1)!.e].join('|');
}

export function achFromEvents(rec: AchRecord, events: readonly (XzEvent | RcEvent)[], seat: number | null, ctx: AchCtx): { rec: AchRecord; fresh: string[] } {
  if (seat === null) return { rec, fresh: [] };
  const mine = myWins(events, seat);
  const next: AchRecord = { got: { ...rec.got }, played: rec.played, wins: rec.wins };
  const hit = new Set<string>();
  const unlock = (id: string): void => void hit.add(id);

  // 新开一场：上一场没打完就放弃的胡牌数作废（立直从东一局 0 本场开始，川麻从第 0 局开始）
  for (const e of events) {
    if ((e.e === 'deal' && 'round' in e && e.round === 0) || (e.e === 'deal' && 'wind' in e && e.wind === 0 && e.hand === 0 && e.honba === 0)) next.wins = 0;
    if (e.e === 'deal' && 'honba' in e && e.dealer === seat && e.honba >= 3) unlock('dealer3');
  }

  next.wins += mine.length;
  if (mine.length) unlock('first_win');
  if (next.wins >= 3) unlock('wins3');
  for (const w of mine) {
    if (w.tsumo) unlock('first_zimo');
    if (w.rob) unlock('rob_kan');
    if (w.ids.some((i) => KAN_WIN.has(i))) unlock('kan_win');
    if (w.ids.some((i) => LAST.has(i))) unlock('last_tile');
    if (w.ids.some((i) => FLUSH.has(i))) unlock('flush');
    if (w.ids.some((i) => PAIRS.has(i))) unlock('seven_pairs');
    if (w.ids.includes('tianhu') || w.ids.includes('dihu')) unlock('heaven_earth');
    if (w.rc) {
      const s = w.rc.score;
      if (BIG_LIMIT.has(s.limit)) unlock('haneman');
      if (s.yakuman > 0) unlock('yakuman');
      if (w.ids.includes('ippatsu')) unlock('ippatsu');
      if (s.ura > 0) unlock('ura');
    } else if (w.fan >= 4) unlock('big_fan');
  }
  if (multiRon(events, mine)) unlock('multi_ron');

  if (events.some((e) => e.e === 'over')) {
    next.played += 1;
    next.wins = 0;
    if (ctx.first) unlock('first_place');
    if (next.played >= 10) unlock('played10');
    if (next.played >= 50) unlock('played50');
  }

  if (mine.length) {
    const xz = dexProgress(ctx.dex, 'xz');
    const rc = dexProgress(ctx.dex, 'rc');
    if (xz.got + rc.got >= 10) unlock('dex10');
    if (xz.got >= xz.total) unlock('dex_xz');
    if (rc.got >= rc.total) unlock('dex_rc');
  }

  const fresh = ACHIEVEMENTS.filter((a) => hit.has(a.id) && !next.got[a.id]).map((a) => a.id);
  for (const id of fresh) next.got[id] = 1;
  const same = fresh.length === 0 && next.played === rec.played && next.wins === rec.wins;
  return { rec: same ? rec : next, fresh };
}

/** 进度型成就的"现在 N / 目标"，没进度可写的返回 null */
export function achProgress(rec: AchRecord, id: string, dex: DexRecord): { n: number; total: number } | null {
  const cap = (n: number, total: number) => ({ n: Math.min(n, total), total });
  if (id === 'wins3') return cap(rec.wins, 3);
  if (id === 'played10') return cap(rec.played, 10);
  if (id === 'played50') return cap(rec.played, 50);
  const xz = dexProgress(dex, 'xz');
  const rc = dexProgress(dex, 'rc');
  if (id === 'dex10') return cap(xz.got + rc.got, 10);
  if (id === 'dex_xz') return { n: xz.got, total: xz.total };
  if (id === 'dex_rc') return { n: rc.got, total: rc.total };
  return null;
}

/** 当前玩法能拿的成就（共用的加这个玩法专属的） */
export const achFor = (variant: 'xz' | 'rc'): AchDef[] => ACHIEVEMENTS.filter((a) => a.scope === 'all' || a.scope === variant);
