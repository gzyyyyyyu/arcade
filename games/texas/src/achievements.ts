/**
 * 成就（docs/features.md 13.9）：单机（娱乐、实盘）和单机锦标赛里打出来的，好友房不算。
 * 纯函数：吃一手的公开结果（HandResult、操作记录）加我自己的底牌和座位上的电脑性格，吐新状态和这一手新拿到的成就。
 * 底牌只用我自己的（kept），诈唬按"我自己的牌是不是没靠底牌"判，不看别人没亮的牌。
 * 状态存本机 texas.ach（view/ach.ts 读写），不进云存档（云存档的 stats 槽有严格的字段校验，加字段要动合并逻辑，得不偿失）。
 */
import { categoryOf, evalCards, FLUSH, FULL_HOUSE, PAIR, QUADS, STRAIGHT_FLUSH } from './core/eval.ts';
import type { Card } from './core/cards.ts';
import { invested } from './core/fame.ts';
import { PERSONA_COUNT, type HandResult, type LogEntry } from './core/table.ts';

type Tier = 'bronze' | 'silver' | 'gold';
/** 图标上的图案（view/ach.ts 画） */
export type Glyph = 'star' | 'cards' | 'flame' | 'crown' | 'trophy' | 'bolt' | 'mask' | 'rise' | 'face';

export interface Def {
  id: string;
  name: string;
  tier: Tier;
  glyph: Glyph;
  /** 一句话怎么拿 */
  how: string;
  /** 有进度的：目标数；没有就是一次性的 */
  goal?: number;
  /** 性格成就的性格编号（图标上写名字的头一个字） */
  persona?: number;
}

/** 电脑性格的名字（和 ai/personas.ts 的顺序一致；成就是纯逻辑，不引电脑的包，test/achievements.test.ts 核对） */
export const PERSONA_NAMES = ['稳哥', '阿飙', '老好', '慢慢', '算盘', '江湖', '虎子', '老鹰', '叨叨', '小白'] as const;

const personaDefs: Def[] = PERSONA_NAMES.map((n, i) => ({
  id: `beat_${i}`,
  name: `赢过${n}`,
  tier: 'bronze',
  glyph: 'face',
  how: `摊牌时牌比${n}大，赢下来`,
  persona: i,
}));

export const DEFS: readonly Def[] = [
  { id: 'first_win', name: '初战告捷', tier: 'bronze', glyph: 'star', how: '赢下第一手' },
  { id: 'hands_100', name: '牌桌常客', tier: 'bronze', glyph: 'cards', how: '打满 100 手', goal: 100 },
  { id: 'hands_500', name: '资深牌手', tier: 'silver', glyph: 'cards', how: '打满 500 手', goal: 500 },
  { id: 'hands_2000', name: '牌桌老炮', tier: 'gold', glyph: 'cards', how: '打满 2000 手', goal: 2000 },
  { id: 'cat_flush', name: '一色到底', tier: 'bronze', glyph: 'star', how: '用同花赢下一手' },
  { id: 'cat_full', name: '满堂红', tier: 'bronze', glyph: 'star', how: '用葫芦赢下一手' },
  { id: 'cat_quads', name: '四条威风', tier: 'silver', glyph: 'crown', how: '用四条赢下一手' },
  { id: 'cat_sf', name: '同花顺来了', tier: 'gold', glyph: 'crown', how: '用同花顺赢下一手' },
  { id: 'cat_royal', name: '皇家气派', tier: 'gold', glyph: 'crown', how: '用皇家同花顺赢下一手' },
  { id: 'allin3', name: '三雄会', tier: 'silver', glyph: 'bolt', how: '三个人以上全下，你赢了主池' },
  { id: 'bluff_1', name: '空城计', tier: 'silver', glyph: 'mask', how: '河牌下注，牌很烂但对手全弃了' },
  { id: 'bluff_10', name: '影帝', tier: 'gold', glyph: 'mask', how: '河牌诈唬成功 10 次', goal: 10 },
  ...personaDefs,
  { id: 'beat_all', name: '牌桌霸主', tier: 'gold', glyph: 'trophy', how: '把 10 个电脑都赢过一遍', goal: PERSONA_COUNT },
  { id: 'streak_3', name: '三连胜', tier: 'bronze', glyph: 'flame', how: '连赢 3 手', goal: 3 },
  { id: 'streak_5', name: '五连胜', tier: 'silver', glyph: 'flame', how: '连赢 5 手', goal: 5 },
  { id: 'streak_8', name: '势不可挡', tier: 'gold', glyph: 'flame', how: '连赢 8 手', goal: 8 },
  { id: 'comeback', name: '绝地反击', tier: 'silver', glyph: 'rise', how: '筹码只剩不到一成时赢下一手' },
  { id: 'tour_play', name: '初登擂台', tier: 'bronze', glyph: 'trophy', how: '打完一场锦标赛' },
  { id: 'tour_top3', name: '锦标赛前三', tier: 'silver', glyph: 'trophy', how: '锦标赛进前三名' },
  { id: 'tour_win', name: '锦标赛冠军', tier: 'gold', glyph: 'trophy', how: '拿下一场锦标赛冠军' },
];

export const defOf = (id: string): Def | undefined => DEFS.find((d) => d.id === id);

export interface AchState {
  v: 1;
  /** 已拿到的成就 id */
  got: string[];
  hands: number;
  /** 眼下连赢几手（输了、弃牌归零） */
  streak: number;
  bluffs: number;
  /** 摊牌赢过的电脑性格编号 */
  beat: number[];
}

export const emptyAch = (): AchState => ({ v: 1, got: [], hands: 0, streak: 0, bluffs: 0, beat: [] });

/** 读出来的整理一遍：坏的当没有，数字拉回合理范围 */
export function parseAch(x: unknown): AchState {
  const o = x && typeof x === 'object' ? (x as Record<string, unknown>) : null;
  if (o?.v !== 1) return emptyAch();
  const n = (k: string): number => (Number.isSafeInteger(o[k]) && (o[k] as number) >= 0 ? (o[k] as number) : 0);
  const ids = new Set(DEFS.map((d) => d.id));
  const got = Array.isArray(o.got) ? [...new Set((o.got as unknown[]).filter((g): g is string => typeof g === 'string' && ids.has(g)))] : [];
  const beat = Array.isArray(o.beat) ? [...new Set((o.beat as unknown[]).filter((p): p is number => Number.isInteger(p) && (p as number) >= 0 && (p as number) < PERSONA_COUNT))] : [];
  return { v: 1, got, hands: n('hands'), streak: n('streak'), bluffs: n('bluffs'), beat };
}

/** 一手打完的输入：全是我这个座位看得到的 */
export interface HandFacts {
  r: HandResult;
  /** 这一手完整的操作记录 */
  log: readonly LogEntry[];
  me: number;
  /** 我这一手的底牌（kept）；拿不到是空数组 */
  hole: readonly Card[];
  /** 打完后我座位上的筹码 */
  endStack: number;
  /** 一份的基准：现金桌是这一档的带入上限，锦标赛是起始筹码（"不到一成"按它算） */
  base: number;
  /** 座位上是电脑时的性格编号，不是电脑 -1 */
  personaAt: (seat: number) => number;
}

/** 我这一手拿到的钱（所有池子加起来） */
const wonBy = (r: HandResult, seat: number): number => r.pots.reduce((a, p) => a + (p.winners.find((w) => w.seat === seat)?.won ?? 0), 0);

/** 河牌上我下过注或加注，对手全弃了，而我自己的牌没靠底牌（高牌，或者一对在公共牌上） */
export function riverBluffWin(f: HandFacts): boolean {
  const { r, log, me, hole } = f;
  if (!r.byFold || r.board.length < 5 || hole.length < 2 || wonBy(r, me) <= 0) return false;
  let street = 0;
  let bet = false;
  for (const e of log) {
    if (e.seat < 0) street++;
    else if (street === 3 && e.seat === me && (e.act === 'bet' || e.act === 'raise')) bet = true;
  }
  if (!bet) return false;
  const all = categoryOf(evalCards([...hole, ...r.board]));
  return all <= PAIR && all === categoryOf(evalCards(r.board));
}

/** 全下的人数（盲注自动全下不算） */
function allinSeats(log: readonly LogEntry[]): Set<number> {
  return new Set(log.filter((e) => e.allin && e.act !== 'sb' && e.act !== 'bb').map((e) => e.seat));
}

/**
 * 一手打完：返回新状态和这一手新拿到的成就 id。这一手我没发到牌（log 里没有我）原样返回。
 * 同一手同时满足的成就都给；已拿到的不重复给。
 */
export function noteHandAch(s: AchState, f: HandFacts): { state: AchState; fresh: string[] } {
  const { r, log, me } = f;
  if (!log.some((e) => e.seat === me)) return { state: s, fresh: [] };
  const won = wonBy(r, me);
  const mine = r.byFold ? undefined : r.shown.find((x) => x.seat === me);
  const hit = new Set<string>();

  const hands = s.hands + 1;
  const streak = won > 0 ? s.streak + 1 : 0;
  if (won > 0) hit.add('first_win');
  for (const [n, id] of [[100, 'hands_100'], [500, 'hands_500'], [2000, 'hands_2000']] as const) if (hands >= n) hit.add(id);
  for (const [n, id] of [[3, 'streak_3'], [5, 'streak_5'], [8, 'streak_8']] as const) if (streak >= n) hit.add(id);

  if (mine && won > 0) {
    const c = categoryOf(mine.value);
    if (c === FLUSH) hit.add('cat_flush');
    if (c === FULL_HOUSE) hit.add('cat_full');
    if (c === QUADS) hit.add('cat_quads');
    if (c === STRAIGHT_FLUSH) {
      // 同花顺的低 20 位是顺子最大的那张 + 1，A 到 10 是 13
      hit.add((mine.value & 0xfffff) === 13 ? 'cat_royal' : 'cat_sf');
    }
  }

  // 三个人以上全下，我是其中之一并赢了主池
  const ai = allinSeats(log);
  if (ai.has(me) && ai.size >= 3 && (r.pots[0]?.winners ?? []).some((w) => w.seat === me)) hit.add('allin3');

  const bluffs = s.bluffs + (riverBluffWin(f) ? 1 : 0);
  if (bluffs > s.bluffs) hit.add('bluff_1');
  if (bluffs >= 10) hit.add('bluff_10');

  // 摊牌赢过的电脑：我亮的牌比他亮的大
  const beat = [...s.beat];
  if (mine && won > 0) {
    for (const x of r.shown) {
      const p = f.personaAt(x.seat);
      if (x.seat !== me && p >= 0 && x.value < mine.value && !beat.includes(p)) beat.push(p);
    }
  }
  for (const p of beat) hit.add(`beat_${p}`);
  if (beat.length >= PERSONA_COUNT) hit.add('beat_all');

  // 手上只剩不到一成还赢了：开局筹码 = 打完后的 − 赢回的 + 投进去的
  if (won > 0) {
    const start = f.endStack - won + invested(log, me, r);
    if (start > 0 && start * 10 < f.base) hit.add('comeback');
  }

  return settle({ ...s, hands, streak, bluffs, beat }, hit);
}

/** 锦标赛结束：名次 1 起 */
export function noteTour(s: AchState, place: number): { state: AchState; fresh: string[] } {
  const hit = new Set<string>(['tour_play']);
  if (place <= 3) hit.add('tour_top3');
  if (place === 1) hit.add('tour_win');
  return settle(s, hit);
}

function settle(s: AchState, hit: Set<string>): { state: AchState; fresh: string[] } {
  const fresh = DEFS.map((d) => d.id).filter((id) => hit.has(id) && !s.got.includes(id));
  return { state: { ...s, got: [...s.got, ...fresh] }, fresh };
}

/** 进度：计数类的现在到哪了 */
export function progressOf(s: AchState, d: Def): number {
  if (d.id.startsWith('hands_')) return s.hands;
  if (d.id.startsWith('streak_')) return s.streak;
  if (d.id === 'bluff_10') return s.bluffs;
  if (d.id === 'beat_all') return s.beat.length;
  return s.got.includes(d.id) ? 1 : 0;
}

