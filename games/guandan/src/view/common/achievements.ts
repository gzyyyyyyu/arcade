/**
 * 成就（docs/design.md「成就」）：纯函数，不碰 DOM 和 Phaser。
 * 只记在本机（guandan.achievements），不进云同步。条件都能从一副 / 一场的结果里直接判断，判断不了的不做。
 * 会话（session.ts、doudizhu/session.ts）在一副、一场结束时把摘要交给 evaluate，拿到新解锁的 id；画面层（ui/achievements.ts）负责弹提示、画成就墙。
 */
import { KEYS, rawStore } from '../store.ts';

export type AchGroup = 'gd' | 'ddz';

export interface AchDef {
  id: string;
  group: AchGroup;
  name: string;
  /** 条件，大白话；成就墙上未解锁的也写这句 */
  desc: string;
}

export const ACHIEVEMENTS: readonly AchDef[] = [
  { id: 'gd-first-win', group: 'gd', name: '初战告捷', desc: '赢下一场掼蛋' },
  { id: 'gd-streak3', group: 'gd', name: '三连胜', desc: '掼蛋连赢 3 场' },
  { id: 'gd-pass-a', group: 'gd', name: '过 A', desc: '完整局打到 A 并赢下整场' },
  { id: 'gd-sf', group: 'gd', name: '同花顺', desc: '一副里打出同花顺' },
  { id: 'gd-bombs3', group: 'gd', name: '炸弹连连', desc: '一副里打出 3 个以上炸弹' },
  { id: 'gd-double-down', group: 'gd', name: '双下对面', desc: '和搭档包揽头游、二游' },
  { id: 'gd-games10', group: 'gd', name: '牌桌常客', desc: '掼蛋累计打完 10 场' },
  { id: 'gd-daily', group: 'gd', name: '每日一练', desc: '打完一次掼蛋每日挑战' },
  { id: 'ddz-first-win', group: 'ddz', name: '初战告捷', desc: '赢下一场斗地主' },
  { id: 'ddz-landlord-win', group: 'ddz', name: '地主翻身', desc: '当地主赢下一副' },
  { id: 'ddz-farmer-win', group: 'ddz', name: '农民联手', desc: '当农民赢下一副' },
  { id: 'ddz-bid3-win', group: 'ddz', name: '敢叫三分', desc: '叫 3 分当地主并赢下这一副' },
  { id: 'ddz-spring', group: 'ddz', name: '春天', desc: '当地主打出春天（农民一手没出）' },
  { id: 'ddz-rocket', group: 'ddz', name: '王炸', desc: '打出一次王炸' },
  { id: 'ddz-games10', group: 'ddz', name: '牌桌常客', desc: '斗地主累计打完 10 场' },
  { id: 'ddz-daily', group: 'ddz', name: '每日一练', desc: '打完一次斗地主每日挑战' },
];

export interface AchState {
  v: 1;
  /** 已解锁的 id（按解锁先后） */
  unlocked: string[];
  /** 累计打完的场数（实盘、娱乐、每日都算；好友房、匹配不算） */
  gdGames: number;
  ddzGames: number;
  /** 掼蛋当前连胜 */
  gdStreak: number;
}

export const EMPTY_ACH: AchState = { v: 1, unlocked: [], gdGames: 0, ddzGames: 0, gdStreak: 0 };

/** 一副 / 一场结束时会话交来的摘要；座位一律是"我 = 0"视角 */
export type AchSummary =
  /** 掼蛋一副结束。bombs：我这一副打出的炸弹数（含同花顺、天王炸） */
  | { kind: 'gd-deal'; sf: boolean; bombs: number; doubleDown: boolean }
  /** 掼蛋一场结束（有一队赢了）。passedA：我方赢了且是打到 A 的完整局 */
  | { kind: 'gd-game'; won: boolean; passedA: boolean }
  /** 掼蛋每日挑战打完（8 副或提前结束） */
  | { kind: 'gd-daily' }
  /** 斗地主一副结束。landlord：我是不是地主；won：我这一副分数为正 */
  | { kind: 'ddz-deal'; landlord: boolean; won: boolean; bid: number; spring: 'spring' | 'anti' | null; rocket: boolean }
  /** 斗地主一场结束 */
  | { kind: 'ddz-game'; won: boolean; daily: boolean };

export function achDef(id: string): AchDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/** 能数出进度的成就（连胜、累计场数）：现在几 / 要几；一次就成的返回 null。成就墙上没解锁的画进度条 */
export function achProgress(id: string, s: AchState): { n: number; of: number } | null {
  const of = id === 'gd-streak3' ? 3 : id === 'gd-games10' || id === 'ddz-games10' ? 10 : 0;
  if (!of) return null;
  const n = id === 'gd-streak3' ? s.gdStreak : id === 'gd-games10' ? s.gdGames : s.ddzGames;
  return { n: Math.min(n, of), of };
}

const nat = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0);

/** 把读出来的任何东西收拾成合法状态：版本不对当空，认不得的 id 丢掉，重复的去重 */
export function sanitize(raw: unknown): AchState {
  const o = raw as Partial<AchState> | null;
  if (!o || typeof o !== 'object' || o.v !== 1) return { ...EMPTY_ACH, unlocked: [] };
  const ids = Array.isArray(o.unlocked) ? o.unlocked.filter((x): x is string => typeof x === 'string' && !!achDef(x)) : [];
  return { v: 1, unlocked: [...new Set(ids)], gdGames: nat(o.gdGames), ddzGames: nat(o.ddzGames), gdStreak: nat(o.gdStreak) };
}

/** 摘要触发的成就（含已解锁的，evaluate 再去重） */
function hits(s: AchState, m: AchSummary): string[] {
  switch (m.kind) {
    case 'gd-deal':
      return [m.sf && 'gd-sf', m.bombs >= 3 && 'gd-bombs3', m.doubleDown && 'gd-double-down'].filter((x): x is string => !!x);
    case 'gd-game':
      return [m.won && 'gd-first-win', m.won && s.gdStreak >= 3 && 'gd-streak3', m.passedA && 'gd-pass-a', s.gdGames >= 10 && 'gd-games10'].filter((x): x is string => !!x);
    case 'gd-daily':
      return ['gd-daily'];
    case 'ddz-deal':
      return [
        m.landlord && m.won && 'ddz-landlord-win',
        !m.landlord && m.won && 'ddz-farmer-win',
        m.landlord && m.won && m.bid >= 3 && 'ddz-bid3-win',
        m.landlord && m.won && m.spring === 'spring' && 'ddz-spring',
        m.rocket && 'ddz-rocket',
      ].filter((x): x is string => !!x);
    case 'ddz-game':
      return [m.won && 'ddz-first-win', s.ddzGames >= 10 && 'ddz-games10', m.daily && 'ddz-daily'].filter((x): x is string => !!x);
  }
}

/** 先按摘要更新计数，再看哪些条件满足；已解锁的不重复给。不改传入的状态 */
export function evaluate(prev: AchState, m: AchSummary): { next: AchState; newly: string[] } {
  const s: AchState = { ...prev, unlocked: [...prev.unlocked] };
  if (m.kind === 'gd-game') {
    s.gdGames += 1;
    s.gdStreak = m.won ? s.gdStreak + 1 : 0;
  } else if (m.kind === 'ddz-game') {
    s.ddzGames += 1;
  }
  const newly = hits(s, m).filter((id) => !s.unlocked.includes(id));
  s.unlocked.push(...newly);
  return { next: s, newly };
}

export function loadAch(): AchState {
  return sanitize(rawStore.read<unknown>(KEYS.achievements));
}

/** 记一副 / 一场的结果：读、算、写回，返回新解锁的 id */
export function recordAch(m: AchSummary): string[] {
  const { next, newly } = evaluate(loadAch(), m);
  rawStore.write(KEYS.achievements, next);
  return newly;
}
