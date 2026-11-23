/**
 * 每日何切的纯函数（DESIGN.md 7 节）：日期 → 五道题、算每个打法的牌效、打分、记成绩和连续天数。
 * 不碰时间、存储和画面：今天是几号由画面层按北京时间算好传进来，读写 mahjong.hekiri 也在画面层（view/hekiri.ts）。
 * 同一天的种子相同，所以所有人这一天拿到同样的五手牌。
 */
import { stream, shuffle, type RandomStream } from 'arcade-kit/rng';
import { shanten, ukeire, type ShapeRules } from '../core/hand/index.ts';
import { KINDS, suitKinds, type Kind, type Suit } from '../core/tiles/index.ts';
import { dayNo } from './daily.ts';

export const HEKIRI_KEY = 'mahjong.hekiri';
/** 一天几道题、每题满分 */
export const QUESTIONS = 5;
export const POINTS = 20;
/** 最近几天的成绩留着 */
const KEEP_DAYS = 7;
/** 每道题最多试多少副手牌；到顶还没合格就取试过的里面最接近的（测试保证实际用不到） */
const MAX_TRIES = 4000;

/** 川麻的牌型：一般型加七对（龙七对算两对） */
const RULES: ShapeRules = { seven: true, sevenQuads: true, kokushi: false };

export interface Puzzle {
  /** 14 张手牌的牌种，从小到大 */
  hand: Kind[];
  /** 桌上已经打出来的牌（弃牌和别家的副露），从小到大；算进张时这些牌摸不到了 */
  visible: Kind[];
}

/** 打掉某一种牌之后的样子 */
export interface Choice {
  kind: Kind;
  /** 打完之后的向听数：0 是听牌 */
  shanten: number;
  /** 还摸得到的有效牌一共几张（手里的、桌上的和刚打出的都扣掉了） */
  ukeire: number;
  /** 有效牌是哪几种 */
  kinds: Kind[];
}

/** 三门数牌的 27 种（川麻没有字牌） */
const NUMBER_KINDS = Array.from({ length: 27 }, (_, k) => k);

const countOf = (kinds: readonly Kind[]): number[] => {
  const c = new Array<number>(KINDS).fill(0);
  for (const k of kinds) c[k]!++;
  return c;
};

/** 这手牌每个不同的打法的牌效，最好的在前（向听小的在前，同向听进张多的在前，再同按牌种） */
export function evaluate(p: Puzzle): Choice[] {
  const hand = countOf(p.hand);
  const seen = countOf(p.visible);
  const out: Choice[] = [];
  for (const k of NUMBER_KINDS) {
    if (!hand[k]) continue;
    hand[k]!--;
    // 刚打出去的这张也算看见了
    seen[k]!++;
    const u = ukeire(hand, 0, RULES, NUMBER_KINDS, seen);
    out.push({ kind: k, shanten: shanten(hand, 0, RULES), ukeire: u.total, kinds: u.kinds });
    seen[k]!--;
    hand[k]!++;
  }
  return out.sort((a, b) => a.shanten - b.shanten || b.ukeire - a.ukeire || a.kind - b.kind);
}

/** 打这一种得几分：最好的满分；向听一样但进张少的按进张比例；向听更多的 0 分 */
export function scoreOf(p: Puzzle, kind: Kind, list: readonly Choice[] = evaluate(p)): number {
  const best = list[0]!;
  const mine = list.find((c) => c.kind === kind);
  if (!mine || mine.shanten > best.shanten) return 0;
  if (mine.ukeire >= best.ukeire) return POINTS;
  return Math.round((POINTS * mine.ukeire) / best.ukeire);
}

/** 一题的评价：好（满分）、接近（向听一样但进张少，还有分）、差（没分） */
export type Mark = 'ok' | 'near' | 'bad';
export const markOf = (score: number): Mark => (score >= POINTS ? 'ok' : score > 0 ? 'near' : 'bad');
export const MARK_TEXT: Record<Mark, string> = { ok: '✓', near: '△', bad: '✗' };

/** 每题的出题条件：easy 最好的和第二名差得多、答案一眼能看出来；hard 同向听的打法多、差距小 */
interface Spec {
  /** 最好的打法打完是几向听 */
  shanten: number;
  hard: boolean;
}
/** 难度往上走：前两题一向听、差距大；后三题更多形状，有两向听 */
const SPECS: readonly Spec[] = [
  { shanten: 1, hard: false },
  { shanten: 1, hard: false },
  { shanten: 1, hard: true },
  { shanten: 2, hard: true },
  { shanten: 1, hard: true },
];

/** 合格的题：最好的不能是唯一一个显然的选择，也不能所有打法都一样好 */
function fits(list: readonly Choice[], spec: Spec | null, fullHand: number[]): boolean {
  if (list.length < 3) return false;
  const best = list[0]!;
  const third = list[2]!;
  // 最好的比第三名好：向听更少，或进张严格更多
  if (!(best.shanten < third.shanten || best.ukeire > third.ukeire)) return false;
  // 至少一个诱人的错误选项：向听一样、进张更少
  const same = list.filter((c) => c.shanten === best.shanten);
  if (!same.some((c) => c.ukeire < best.ukeire && c.ukeire > 0)) return false;
  // 打之前不能已经胡了
  if (shanten(fullHand, 0, RULES) < 0) return false;
  if (best.shanten > 2 || best.ukeire === 0) return false;
  if (!spec) return true;
  if (best.shanten !== spec.shanten) return false;
  const second = list[1]!;
  const gap = second.shanten === best.shanten ? best.ukeire - second.ukeire : 99;
  if (spec.hard) return same.length >= 3 && gap <= 4 && gap >= 1;
  return gap >= 4 && same.length >= 2;
}

/** 第 i 题（0 起）这手牌是不是合格的：测试用它守住出题条件 */
export const puzzleFits = (p: Puzzle, i: number): boolean => fits(evaluate(p), SPECS[i]!, countOf(p.hand));

/** 日期 → 种子（8 个 32 位数，和每日挑战同一个形状，盐不同所以两件事互不影响） */
function hekiriKey(date: string): number[] {
  return Array.from({ length: 8 }, (_, i) => {
    let h = 0x811c9dc5;
    for (const c of `mahjong-hekiri:${date}:${i}`) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
    return h;
  });
}

/** 从两门数牌里发 14 张手牌加几张桌上的牌（川麻缺一门，所以只用两门） */
function deal(rng: RandomStream): Puzzle {
  const skip = rng.below(3);
  const suits = ([0, 1, 2] as Suit[]).filter((s) => s !== skip);
  const pool: Kind[] = [];
  for (const s of suits) for (const k of suitKinds(s)) for (let i = 0; i < 4; i++) pool.push(k);
  const deck = shuffle(pool, rng);
  const nSeen = 6 + rng.below(5);
  return {
    hand: deck.slice(0, 14).sort((a, b) => a - b),
    visible: deck.slice(14, 14 + nSeen).sort((a, b) => a - b),
  };
}

function build(date: string, i: number): Puzzle {
  const rng = stream(hekiriKey(date), 'puzzle', i);
  const spec = SPECS[i]!;
  let loose: Puzzle | null = null;
  for (let t = 0; t < MAX_TRIES; t++) {
    const p = deal(rng);
    const list = evaluate(p);
    const full = countOf(p.hand);
    if (fits(list, spec, full)) return p;
    // 备选：不看难度档、只要基本合格
    if (!loose && fits(list, null, full)) loose = p;
  }
  return loose ?? deal(rng);
}

const memo = new Map<string, Puzzle[]>();

/** 这一天的五道题，所有人一样；难度一题比一题高 */
export function puzzlesOf(date: string): Puzzle[] {
  let hit = memo.get(date);
  if (!hit) {
    hit = Array.from({ length: QUESTIONS }, (_, i) => build(date, i));
    memo.set(date, hit);
  }
  return hit;
}

// ---------- 成绩和连续天数 ----------

export interface HekiriDay {
  /** 五题加起来 0–100 */
  score: number;
  /** 每题的评价，五个字符：o 好、n 接近、x 差 */
  marks: string;
}

export interface HekiriData {
  /** 日期（YYYY-MM-DD）→ 当天算数的成绩，只留最近 KEEP_DAYS 天 */
  days: Record<string, HekiriDay>;
  /** 历史最好的一天；没做过是 null */
  best: number | null;
  /** 连续打卡：最后一次做完的日期和到那天为止连续几天 */
  last: string | null;
  run: number;
}

export const emptyHekiri = (): HekiriData => ({ days: {}, best: null, last: null, run: 0 });

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (s: unknown): s is string => typeof s === 'string' && DATE.test(s) && !Number.isNaN(dayNo(s));
const MARK_CODE: Record<Mark, string> = { ok: 'o', near: 'n', bad: 'x' };
export const marksString = (scores: readonly number[]): string => scores.map((s) => MARK_CODE[markOf(s)]).join('');

/** 读出来的东西不对（坏数据）当空 */
export function parseHekiri(raw: unknown): HekiriData {
  try {
    const o = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Partial<HekiriData> | null;
    if (!o || typeof o !== 'object' || !o.days || typeof o.days !== 'object') return emptyHekiri();
    const days: Record<string, HekiriDay> = {};
    for (const [d, x] of Object.entries(o.days)) {
      if (isDate(d) && x && Number.isInteger(x.score) && x.score >= 0 && x.score <= QUESTIONS * POINTS && typeof x.marks === 'string' && /^[onx]{5}$/.test(x.marks)) {
        days[d] = { score: x.score, marks: x.marks };
      }
    }
    const best = Number.isInteger(o.best) && o.best! >= 0 && o.best! <= QUESTIONS * POINTS ? o.best! : null;
    const last = isDate(o.last) ? o.last : null;
    const run = last && Number.isInteger(o.run) && o.run! > 0 ? o.run! : 0;
    return { days, best, last, run };
  } catch {
    return emptyHekiri();
  }
}

/**
 * 记一天。这个日期已经有成绩就是练习，原样返回（first 为 false）；没有就记下。
 * 连续天数：最后打卡是前一天就 +1，是当天保持，更早或第一次就从 1 开始；补记过了零点的旧日期不倒着改连续天数。
 */
export function recordHekiri(data: HekiriData, date: string, scores: readonly number[]): { data: HekiriData; first: boolean } {
  if (data.days[date]) return { data, first: false };
  const score = scores.reduce((a, b) => a + b, 0);
  const days = { ...data.days, [date]: { score, marks: marksString(scores) } };
  for (const d of Object.keys(days).sort().slice(0, -KEEP_DAYS)) delete days[d];
  let run = data.run;
  let last = data.last;
  if (!last || dayNo(date) > dayNo(last)) {
    run = last && dayNo(date) - dayNo(last) === 1 ? run + 1 : 1;
    last = date;
  }
  return { data: { days, best: data.best === null ? score : Math.max(data.best, score), last, run }, first: true };
}

/** 今天看到的连续天数：最后打卡是今天或昨天还算数，再早就断了 */
export function hekiriStreak(data: HekiriData, today: string): number {
  return data.last && dayNo(today) - dayNo(data.last) <= 1 ? data.run : 0;
}

/** 交给平台每日榜的榜名（和别的游戏的 daily-日期-子榜 同一个写法） */
export const hekiriBoard = (date: string): string => `daily-${date}-hekiri`;
