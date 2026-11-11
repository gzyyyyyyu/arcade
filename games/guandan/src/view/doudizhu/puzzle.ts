/**
 * 斗地主残局闯关的会话与进度（docs/doudizhu.md 第 6 节）：明牌残局，我是地主先出，两家农民按 bestReply 应对，
 * 先出完过关；农民先出完失败，可以重来。不存档、不记战绩、不计成就，只在 guandan.ddz.puzzles 记过了哪几关。
 */
import { dispatchDdz, type DdzAction, type DdzEvent } from '../../variants/doudizhu/index.ts';
import { type DailyPuzzle, dailyPuzzle, dailyPuzzleScore } from '../../variants/doudizhu/puzzles/daily.ts';
import { DDZ_PUZZLES, type DdzPuzzle } from '../../variants/doudizhu/puzzles/puzzles.ts';
import { bestReply, hint, solve } from '../../variants/doudizhu/puzzles/solver.ts';
import { puzzleState } from '../../variants/doudizhu/puzzles/state.ts';
import { app } from '../app.ts';
import { DDZ_ME, DdzSession } from './session.ts';
import { beijingDate, dailyBoard, submitDaily, type DailySubmit } from '../common/daily.ts';
import { addDdzPuzzleDone, getDdzPuzzlesDone, recordDdzDailyPuzzle } from '../store.ts';

/** 提示按钮在走错（已经赢不了）时说的话 */
export const PUZZLE_LOST_HINT = '这步之后已经赢不了了，重来试试';

/** 过了的关卡 id，只认关卡表里有的 */
export function puzzlesDone(): Set<string> {
  const known = new Set(DDZ_PUZZLES.map((p) => p.id));
  return new Set(getDdzPuzzlesDone().filter((id) => known.has(id)));
}

/**
 * 每一关的状态：过了 done、下一关 next（第一个没过的开放关）、锁着 locked。
 * 开放规则：第一关总是开放，其余只开放"已过关卡的下一关"（过了的关也能重玩）。
 */
export type PuzzleStatus = 'done' | 'next' | 'open' | 'locked';

export function puzzleStatuses(done: ReadonlySet<string>): PuzzleStatus[] {
  const open = DDZ_PUZZLES.map((p, i) => i === 0 || done.has(p.id) || done.has(DDZ_PUZZLES[i - 1]!.id));
  const nextAt = DDZ_PUZZLES.findIndex((p, i) => open[i] && !done.has(p.id));
  return DDZ_PUZZLES.map((p, i) => (done.has(p.id) ? 'done' : !open[i] ? 'locked' : i === nextAt ? 'next' : 'open'));
}

/** 过关后的下一关（最后一关回 null） */
export function puzzleAfter(p: DdzPuzzle): DdzPuzzle | null {
  return DDZ_PUZZLES[DDZ_PUZZLES.findIndex((x) => x.id === p.id) + 1] ?? null;
}

export class PuzzleSession extends DdzSession {
  readonly puzzle: DdzPuzzle;

  protected constructor(p: DdzPuzzle) {
    super(puzzleState(p), [], 'pro');
    this.puzzle = p;
    this.persist = false;
  }

  /** 开一关。进关先求解一次：之后提示、农民应对都走缓存（最慢一关冷启动约 1 秒） */
  static start(p: DdzPuzzle): PuzzleSession {
    const s = new PuzzleSession(p);
    solve(s.state);
    return s;
  }

  /** 推进一步；地主先出完就记进度。不碰战绩、成就和存档 */
  override apply(a: DdzAction): { events: DdzEvent[]; error: string | null } {
    const r = dispatchDdz(this.state, a);
    if (r.error) return { events: [], error: r.error };
    this.state = r.state;
    for (const e of r.events) if (e.type === 'dealEnd' && e.result.landlordWon) this.won();
    return { events: r.events, error: null };
  }

  /** 地主先出完：记进度（每日残局改成记今天的成绩） */
  protected won(): void {
    addDdzPuzzleDone(this.puzzle.id);
  }

  /** 农民走 bestReply；调试托管时我这一座按提示出 */
  override botAction(seat: number): DdzAction | null {
    if (this.state.phase !== 'play' || this.state.turn !== seat) return null;
    return seat === DDZ_ME ? hint(this.state) : bestReply(this.state);
  }

  /** 提示按钮：必胜着法；已经走错回 null */
  hintAction(): DdzAction | null {
    return hint(this.state);
  }

  /** 三家的手牌（明牌残局：画面把农民的牌摊开） */
  hand(seat: number): readonly number[] {
    return this.state.hands[seat]!;
  }
}

/** 进某一关的牌桌：设好 app.ddz，调用方再切到（或重启）斗地主牌桌场景 */
export function startPuzzle(p: DdzPuzzle): PuzzleSession {
  const ses = PuzzleSession.start(p);
  app.ddz = ses;
  return ses;
}

// ───────────── 每日残局（docs/doudizhu.md 第 6 节） ─────────────

/** 每日残局的榜名：daily-<日期>-ddzpz */
export function dailyPuzzleBoard(date: string): string {
  return dailyBoard(date, 'ddzpz');
}

export function submitDailyPuzzle(date: string, score: number, fetcher: typeof fetch = fetch): Promise<DailySubmit> {
  return submitDaily(dailyPuzzleBoard(date), score, fetcher);
}

const todayCache = new Map<string, DailyPuzzle>();

/** 某一天的题（生成一次约几十到几百毫秒，按日期缓存）；不给日期是北京时间今天 */
export function dailyPuzzleOf(date = beijingDate(Date.now())): DailyPuzzle {
  let p = todayCache.get(date);
  if (!p) {
    p = dailyPuzzle(date);
    todayCache.clear();
    todayCache.set(date, p);
  }
  return p;
}

/** 重来时带过去的东西：计时不清零、重来和提示次数累计 */
interface Carry {
  startedAt: number | null;
  tries: number;
  hints: number;
}

/**
 * 每日残局的会话：计时从第一手出牌开始，到地主出完为止；"重来"（restart）计时不清零、次数加一，打完后"再来一次"（begin）才是重新计。
 * 分数 = dailyPuzzleScore(秒, 重来次数, 提示次数)，打完记进本机今天的最好成绩，交分由画面调 submit()（一场只交一次）。
 */
export class DailyPuzzleSession extends PuzzleSession {
  readonly date: string;
  /** 重来了几次 */
  tries: number;
  /** 用了几次提示 */
  hints: number;
  finished = false;
  /** 交分的结果（一场只交一次，结果页重建时接着显示） */
  submitted: Promise<DailySubmit> | null = null;
  private startedAt: number | null;
  private endedAt: number | null = null;
  private readonly now: () => number;

  private constructor(p: DailyPuzzle, now: () => number, carry: Carry) {
    super(p);
    this.date = p.date;
    this.now = now;
    this.startedAt = carry.startedAt;
    this.tries = carry.tries;
    this.hints = carry.hints;
  }

  /** 开今天这一题（或指定的一题）：全新的一场 */
  static begin(p: DailyPuzzle = dailyPuzzleOf(), now: () => number = Date.now): DailyPuzzleSession {
    return DailyPuzzleSession.make(p, now, { startedAt: null, tries: 0, hints: 0 });
  }

  private static make(p: DailyPuzzle, now: () => number, carry: Carry): DailyPuzzleSession {
    const s = new DailyPuzzleSession(p, now, carry);
    solve(s.state);
    return s;
  }

  /** 重来：同一题重新摆好，计时接着走，重来次数加一 */
  restart(): DailyPuzzleSession {
    return DailyPuzzleSession.make(this.puzzle as DailyPuzzle, this.now, { startedAt: this.startedAt, tries: this.tries + 1, hints: this.hints });
  }

  override apply(a: DdzAction): { events: DdzEvent[]; error: string | null } {
    const first = this.startedAt === null && a.type === 'play';
    const r = super.apply(a);
    if (first && !r.error) this.startedAt ??= this.now();
    return r;
  }

  protected override won(): void {
    // 只有一手牌就出完时，上面的 startedAt 还没记：这里补上，用时算 0
    this.startedAt ??= this.now();
    this.endedAt = this.now();
    this.finished = true;
    recordDdzDailyPuzzle(this.date, this.score());
  }

  override hintAction(): DdzAction | null {
    const a = super.hintAction();
    if (a && !this.finished) this.hints++;
    return a;
  }

  elapsedMs(): number {
    if (this.startedAt === null) return 0;
    return Math.max(0, (this.endedAt ?? this.now()) - this.startedAt);
  }

  seconds(): number {
    return Math.floor(this.elapsedMs() / 1000);
  }

  score(): number {
    return dailyPuzzleScore(this.seconds(), this.tries, this.hints);
  }

  /** 交到平台每日榜（一场只交一次） */
  submit(fetcher: typeof fetch = fetch): Promise<DailySubmit> {
    this.submitted ??= submitDailyPuzzle(this.date, this.score(), fetcher);
    return this.submitted;
  }
}

/** 进今天这一题的牌桌：设好 app.ddz，调用方再切到（或重启）斗地主牌桌场景 */
export function startDailyPuzzle(ses: DailyPuzzleSession = DailyPuzzleSession.begin()): DailyPuzzleSession {
  app.ddz = ses;
  return ses;
}
