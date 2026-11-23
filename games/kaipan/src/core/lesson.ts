/**
 * 新手课（docs/design-lesson.md）：一局固定行情、固定种子的两个月短局，教选股规则和炒股心法。
 * lessonAdvice 按几条写死的规则给「今天该做什么」，只读玩家看得见的东西（持仓收益、风口体感、群聊、群友战绩、黑天鹅预告），
 * 照着做的结果由 tests/core/lesson.test.ts 锁住：一直听建议的打完不亏，满仓一只、死拿不卖的会亏。
 */
import { flipDir } from './chat.ts';
import { stockById } from './content/index.ts';
import { canSell, daysInMonth, isBusy, swanNotice, validate } from './engine/index.ts';
import { feelOf } from './market.ts';
import { SWAN_DEFS } from './swan.ts';
import type { Dir, Feel, GameState, RunSetup, ThemeId } from './types.ts';

/** 炒股心法：一句大白话（画面在当场的例子旁边弹出，图鉴里能翻看）。 */
export type MindId = 'zhisun' | 'kongcang' | 'yibasuo' | 'fensan' | 'zhuigao' | 'zhanji';

export interface MindDef {
  id: MindId;
  name: string;
  line: string;
}

export const MINDS: readonly MindDef[] = [
  { id: 'zhisun', name: '止损', line: '亏到一成就走，别等回本。' },
  { id: 'kongcang', name: '宁愿空仓', line: '看不准就不买，空仓也是一种仓位。' },
  { id: 'yibasuo', name: '别一把梭', line: '一次只买一口，错了还有子弹。' },
  { id: 'fensan', name: '分散', line: '一个风口只拿一只，别把鸡蛋放一个篮子。' },
  { id: 'zhuigao', name: '不追高', line: '涨过头的不追，过热又有人喊跌就先落袋。' },
  { id: 'zhanji', name: '看战绩', line: '只听说对多的人，嗓门大不算数。' },
];

export const MIND_IDS: readonly MindId[] = MINDS.map((m) => m.id);

export function mindById(id: MindId): MindDef {
  const d = MINDS.find((m) => m.id === id);
  if (!d) throw new Error(`未知心法：${id}`);
  return d;
}

/** 新手课这一局：种子、行情段和规则线。段和种子是挑过的：照建议做净赚、满仓一只和死拿都亏（docs/design-lesson.md 第 2 节）。 */
export const LESSON = {
  seed: 'lesson-8',
  segment: 'seg_76141a5a68',
  /** 两个月 10 个交易日；账单只是走个过场；最后要交回开局的钱，不亏就算过 */
  short: { months: 2, billMult: 0.05, goal: 1 },
  /** 持有亏到这条线就卖（止损） */
  stop: 0.92,
  /** 群友说对的比例至少这么多才听他的（发过的消息少于 minTotal 条时先信着） */
  trust: 0.5,
  minTotal: 2,
  /** 最多拿几只 */
  maxHold: 3,
} as const;

export function lessonSetup(): RunSetup {
  return { persona: 'newbie', difficulty: 1, short: { ...LESSON.short }, lesson: true };
}

/** 新手课一共几个交易日 */
export function lessonDays(): number {
  let n = 0;
  for (let m = 1; m <= LESSON.short.months; m++) n += daysInMonth(m);
  return n;
}

export function isLesson(s: Readonly<Pick<GameState, 'setup'>>): boolean {
  return s.setup?.lesson === true;
}

/** 建议：卖哪格 / 买哪条推荐（一律试一口） / 今天不动；mind 是这条建议对应的心法，why 是一句理由。 */
export type LessonAdvice =
  | { kind: 'sell'; slot: number; mind: MindId; why: string }
  | { kind: 'buy'; rec: number; mind: MindId; why: string }
  | { kind: 'wait'; mind: MindId; why: string };

const claimOf = (m: { claim: Dir; reverse?: boolean }): Dir => (m.reverse ? flipDir(m.claim) : m.claim);

/** 群友的战绩（说对 / 发过）；还没发过几条的返回 null。 */
export function friendRecord(s: Readonly<GameState>, id: string): { hits: number; total: number } | null {
  const f = s.friends.find((x) => x.id === id);
  return f && f.total >= LESSON.minTotal ? { hits: f.hits, total: f.total } : null;
}

function trusted(s: Readonly<GameState>, id: string): boolean {
  const r = friendRecord(s, id);
  return !r || r.hits / r.total >= LESSON.trust;
}

const feelNow = (s: Readonly<GameState>, theme: ThemeId): Feel => feelOf(s.themes[theme]?.history ?? []);

/** 今天盘前该做的下一步（做完一步再问一次，直到给出 wait）。只在盘前有意义，其他阶段返回 null。 */
export function lessonAdvice(s: Readonly<GameState>): LessonAdvice | null {
  if (s.phase !== 'premarket') return null;
  const swan = swanNotice(s);
  const swanDown = swan && SWAN_DEFS[swan.kind].down ? swan : null;
  const hit = (theme: ThemeId): boolean => !!swanDown && (swanDown.kind !== 'themeBust' || swanDown.theme === theme);
  const busy = isBusy(s);

  if (!busy && s.today.ops < 2) {
    for (let i = 0; i < s.slots.length; i++) {
      const h = s.slots[i];
      if (!h || h.short || !canSell(s, i)) continue;
      const theme = stockById(h.stockId).theme;
      const feel = feelNow(s, theme);
      const name = stockById(h.stockId).name;
      if (h.value <= LESSON.stop) return { kind: 'sell', slot: i, mind: 'zhisun', why: `${name}亏到 ${Math.round((1 - h.value) * 100)}%，到线就走` };
      if (hit(theme)) return { kind: 'sell', slot: i, mind: 'kongcang', why: `大事要来，${name}先下车` };
      const bearish = s.today.messages.some((m) => m.theme === theme && claimOf(m) === 'down');
      if ((feel === 'hot' || feel === 'overheated') && bearish) return { kind: 'sell', slot: i, mind: 'zhuigao', why: `${name}的风口过热，又有人喊跌，落袋` };
      if (feel === 'cooling') return { kind: 'sell', slot: i, mind: 'zhisun', why: `${name}的风口在降温，先走` };
    }
  }

  const held = s.slots.filter((h) => h !== null).length;
  if (swanDown) return { kind: 'wait', mind: 'kongcang', why: '大事要来，今天不买' };
  if (busy || s.today.buysLeft <= 0 || s.today.ops >= 2 || held >= LESSON.maxHold || !s.slots.includes(null)) {
    return held > 0 ? { kind: 'wait', mind: 'yibasuo', why: `拿着别动：今天不用再买，${held === 1 ? '手里这只' : '手里的'}先拿着` } : { kind: 'wait', mind: 'kongcang', why: '今天不用动' };
  }
  const heldThemes = new Set(s.slots.flatMap((h) => (h ? [stockById(h.stockId).theme] : [])));
  let best = -1;
  let bestScore = -Infinity;
  s.today.recs.forEach((r, i) => {
    if (r.taken || s.slots.some((h) => h?.stockId === r.stockId) || validate(s, { type: 'buy', rec: i, size: 'taste' }) !== null) return;
    const def = stockById(r.stockId);
    if (def.role === 'st' || heldThemes.has(def.theme) || feelNow(s, def.theme) !== 'warming' || !trusted(s, r.friendId)) return;
    if (s.today.messages.some((m) => m.theme === def.theme && claimOf(m) === 'down')) return;
    const rec = friendRecord(s, r.friendId);
    const score = (rec ? rec.hits / rec.total : 0.5) * 100 - (s.themes[def.theme]?.heat ?? 0) / 10;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  // 「空仓也是一种仓位」只在真空仓时说；手里有股票就是拿着别动
  if (best < 0) return held > 0 ? { kind: 'wait', mind: 'yibasuo', why: `拿着别动：今天没有新的好机会，${held === 1 ? '手里这只' : '手里的'}先拿着` } : { kind: 'wait', mind: 'kongcang', why: '没有合适的，空仓等着' };
  const r = s.today.recs[best];
  const rec = r ? friendRecord(s, r.friendId) : null;
  const name = r ? stockById(r.stockId).name : '';
  return {
    kind: 'buy',
    rec: best,
    mind: rec ? 'zhanji' : 'yibasuo',
    why: rec ? `推荐的人说对 ${rec.hits}/${rec.total}，风口刚升温：${name}试一口` : `风口刚升温：${name}试一口`,
  };
}

/** 当场的例子：画面在这时弹出对应的心法卡（每张卡每个档案只弹一次）。text 是这一局里正在发生的事。 */
export interface MindMoment {
  id: MindId;
  text: string;
  /** 例子里的那只股票（画面指着它的持仓卡）；不是某一只的为 null */
  stockId: string | null;
}

const pct = (v: number): number => Math.round(Math.abs(1 - v) * 100);

/**
 * 盘前看一眼局面，找一个能讲心法的当场例子（没有返回 null）。只读玩家看得见的：持仓收益和份数、买时的风口体感、推荐人战绩、风口体感、黑天鹅预告。
 * 先后按「最疼的先讲」：一把梭亏了、亏过一成没走、追高被套、听了战绩差的人、全押一个风口、大事要来。
 */
export function mindMoment(s: Readonly<GameState>): MindMoment | null {
  if (s.phase !== 'premarket') return null;
  const held = s.slots.flatMap((h) => (h && !h.short && !h.ipo ? [h] : []));
  const name = (id: string): string => stockById(id).name;
  for (const h of held) if ((h.units ?? 1) >= 3 && h.value <= 0.95) return { id: 'yibasuo', text: `${name(h.stockId)}一把梭进去，已经亏了 ${pct(h.value)}%`, stockId: h.stockId };
  for (const h of held) if (h.value <= 0.9) return { id: 'zhisun', text: `${name(h.stockId)}亏了 ${pct(h.value)}%，还在等回本`, stockId: h.stockId };
  for (const h of held) if ((h.buyFeel === 'hot' || h.buyFeel === 'overheated') && h.value <= 0.95) return { id: 'zhuigao', text: `${name(h.stockId)}是风口最热时买的，现在亏 ${pct(h.value)}%`, stockId: h.stockId };
  for (const h of held) {
    const r = h.recBy ? friendRecord(s, h.recBy) : null;
    if (r && r.hits / r.total < LESSON.trust && h.value <= 0.95) return { id: 'zhanji', text: `${name(h.stockId)}是只说对 ${r.hits}/${r.total} 的人推荐的，亏 ${pct(h.value)}%`, stockId: h.stockId };
  }
  if (held.length >= 2) {
    const theme = stockById(held[0]?.stockId ?? '').theme;
    const feel = feelNow(s, theme);
    if (held.every((h) => stockById(h.stockId).theme === theme) && (feel === 'cooling' || feel === 'cold')) return { id: 'fensan', text: `手里 ${held.length} 只全在同一个风口，它凉了就一起跌`, stockId: held[0]?.stockId ?? null };
  }
  const swan = swanNotice(s);
  if (swan && SWAN_DEFS[swan.kind].down && held.length > 0) return { id: 'kongcang', text: `${swan.name}：拿着股票的要挨砸，空仓的不怕`, stockId: null };
  return null;
}
