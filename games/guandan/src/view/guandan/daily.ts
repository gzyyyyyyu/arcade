/**
 * 掼蛋每日挑战（docs/design.md「每日挑战」）：同一天全服同一个种子、三个电脑都是普通难度、默认地方规则，
 * 打满 8 副（或者有一队先过 A，整局提前结束）就结束，分数是我方这几副的累计分（每副按实盘的 dealPoints，不封顶），
 * 交到平台的每日榜 daily-<日期>-gd（子榜 gd，平台按 public/daily.json 显示）。日期、交分、结束页的话和斗地主共用（daily.ts）。
 * 不写存档、不记战绩、不进云同步。
 */
import type { Venue } from '../../variants/guandan/ai/venue.ts';
import { createGame, type Action, type DealResult, type GameEvent, type GameState } from '../../variants/guandan/core/index.ts';
import { dealPoints } from '../../variants/guandan/stake/index.ts';
import { dailyBoard, submitDaily, type DailySubmit } from '../common/daily.ts';
import { Session } from './session.ts';

/** 规则版本：发牌、计分大改时加一，榜名带 -v<n>；0 = 不带 */
const GD_DAILY_RULES = 0;
/** 三个电脑的难度：大家打同样的对手 */
export const GD_DAILY_LEVEL = 'normal';
/** 一场的副数：8 副（和单机实盘的 3 副无关） */
export const GD_DAILY_DEALS = 8;

/** 进桌前的一句：比什么、打几副、记在哪（不说就直接发牌，进桌的人不知道） */
export const GD_DAILY_INTRO = `今天全站同一副牌、同样的电脑：打 ${GD_DAILY_DEALS} 副，按我方总得分排今天的榜（能重打，记最好的一次）`;

/** 这一天的种子：只和日期有关，所有人一样 */
export function gdDailySeed(date: string): string {
  return `gd-daily-${date}`;
}

export function gdDailyBoard(date: string): string {
  return dailyBoard(date, 'gd', GD_DAILY_RULES);
}

export function submitGdDaily(date: string, score: number, fetcher: typeof fetch = fetch): Promise<DailySubmit> {
  return submitDaily(gdDailyBoard(date), score, fetcher);
}

/** 每副我方的分（按副的先后），不封顶 */
interface DailyMatch {
  deals: number[];
}

/** 记一副。同一副（按 dealNo）只记一次；已经结束就不再记 */
export function dailyAddDeal(m: DailyMatch, r: DealResult): DailyMatch {
  if (r.dealNo !== m.deals.length + 1 || m.deals.length >= GD_DAILY_DEALS) return m;
  return { deals: [...m.deals, dealPoints(r, 0)] };
}

export function dailyPoints(m: DailyMatch): number {
  return m.deals.reduce((a, b) => a + b, 0);
}

/** 一场结束了没有：打满 8 副，或者牌局本身结束（有一队过了 A） */
export function dailyOver(m: DailyMatch, phase?: GameState['phase']): boolean {
  return m.deals.length >= GD_DAILY_DEALS || phase === 'gameOver';
}

/**
 * 每日挑战的一局：不存档、不计战绩；电脑按"普通"难度。随机用途派生沿用 Session（soloSeeds），
 * 电脑只读 viewFor，种子不交给电脑以外的任何东西。
 */
export class DailySession extends Session {
  readonly daily: string;
  match: DailyMatch = { deals: [] };
  /** 一场结束时记下要交的分 */
  result: number | null = null;
  sent = false;
  submit: Promise<DailySubmit> | null = null;

  constructor(date: string, state: GameState, events: GameEvent[]) {
    super(state, events, GD_DAILY_LEVEL);
    this.daily = date;
    this.persist = false;
    this.scored = false;
    this.fullGame = false;
  }

  /** 今天的新一场（再打一次也走这里：同一个种子重开） */
  static start(date: string): DailySession {
    const { state, events } = createGame(gdDailySeed(date));
    return new DailySession(date, state, events);
  }

  get points(): number {
    return dailyPoints(this.match);
  }

  get over(): boolean {
    return this.result !== null;
  }

  override apply(action: Action): { events: GameEvent[]; error: string | null } {
    if (this.over) return { events: [], error: '这一场已经结束了' };
    const r = super.apply(action);
    if (r.error) return r;
    for (const e of r.events) if (e.type === 'dealEnd') this.match = dailyAddDeal(this.match, e.result);
    if (dailyOver(this.match, this.state.phase)) this.result = this.points;
    return r;
  }

  protected override venue(): Venue {
    return { kind: 'solo', level: GD_DAILY_LEVEL };
  }
}
