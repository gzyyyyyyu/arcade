/**
 * 一局游戏的会话：持有 GameState，所有推进都走核心的 dispatch，并负责存档和战绩。
 * 画面层（TableScene）只通过它推进状态，拿到事件后自己播放动画。
 */
import { styleOf, type PersonaId } from '../../variants/guandan/ai/index.ts';
import { runBotJob, type BotJob } from './bot-job.ts';
import { botFor, type SoloLevel, type Venue } from '../../variants/guandan/ai/venue.ts';
import { ACE, SHORT_END_LEVEL, createGame, dispatch, eventsFor, hashSeed, previewNext, viewFor, type Action, type DealResult, type GameEvent, type GameState, type NextPreview, type Options, type PlayerView } from '../../variants/guandan/core/index.ts';
import { recordAch, type AchSummary } from '../common/achievements.ts';
import { clearSave, getSettings, loadSave, recordDeal, recordGame, writeSave } from '../store.ts';
import { emptyMatchLog, type MatchLog } from '../../variants/guandan/stake/titles.ts';

export const ME = 0;

/**
 * 单机电脑拿到的随机数：按用途从牌局种子派生（AI 公平审计），和好友房的 aiSeed、formSeed（src/net/rules.ts）同一个做法。
 * 牌局种子能重算发牌（rngFor(种子, 'deal', 第几副)），交给电脑就说不清它有没有借此看别人的牌；派生出来的数和发牌、首出的流毫不相干。
 * ai：出牌的随机流（电脑再按座位、步数分流）；form：这一场的状态；hint：给我的"提示"排序
 */
export function soloSeeds(seed: string): { ai: number; form: number; hint: number } {
  return { ai: hashSeed(seed, 'solo-ai'), form: hashSeed(seed, 'solo-form'), hint: hashSeed(seed, 'solo-hint') };
}

/**
 * 牌桌画面（TableScene）只认这个接口：单机的 Session（本地算）和联机的 NetSession（net.ts，房间算好下发）各实现一份。
 * 视角一律是"我 = 0"（联机时在 net.ts 里先转好）。
 */
export interface TableSession {
  /** 联机会话（画面据此换掉单机才有的东西：再来一局、电脑在本地想……） */
  readonly online: boolean;
  /** 调试：电脑代打我的座位 */
  autoplay: boolean;
  /** 进场时要播放的事件（新开的一副） */
  lastEvents: GameEvent[];
  view(seat?: number): PlayerView;
  /** 推进一步：单机马上返回事件；联机只是发出去（sent），结果随房间的下一帧到 */
  apply(action: Action): { events: GameEvent[]; error: string | null; sent?: boolean };
  /** 这个座位的电脑是谁、状态怎样（口吻、表情、出手节奏跟着它）；真人和我自己是 null */
  botStyle(seat: number): BotStyle | null;
  /** 这个座位要不要由本地的电脑出（联机时电脑在房间里出，只有托管我自己时才在本地算） */
  isBot(seat: number): boolean;
  botAction(seat: number): Action | null;
  /** 电脑这一手要算的东西（纯数据，能交给 worker 算，见 bot-worker.ts）；null = 只能当场同步算（联机托管） */
  botJob?(seat: number): BotJob | null;
  /** "提示"排序用的种子（联机时拿不到牌局种子；单机也不直接给，见 soloSeeds） */
  hintSeed(): string | number;
  /** 一副结束时下一副谁进贡 */
  preview(): NextPreview | null;
  /** 我现在能不能出手（联机时还要等房间指到我、上一手的结果回来） */
  canAct(): boolean;
}

export interface BotStyle {
  persona: PersonaId;
  /** 这一场的状态：正的手热，负的手冷 */
  form: number;
  /** 上头的程度（0 到 1） */
  tilt: number;
}

export class Session implements TableSession {
  readonly online = false;
  state: GameState;
  difficulty: SoloLevel;
  /** 最近一次推进的事件（玩家视角裁剪后） */
  lastEvents: GameEvent[];
  private counted = false;
  private dealsCounted = 0;
  /** false：这一局不写存档（URL 调试开局且已有存档时，免得覆盖玩家的进度） */
  persist = true;
  /** false：不计入战绩（调试局） */
  scored = true;
  /** 调试：电脑代打我的座位 */
  autoplay = false;
  /** 打满了才算一场（每日挑战提前分出胜负不算，DailySession 设成 false）：只管成就的连胜和场数 */
  fullGame = true;
  /** 还没弹给玩家的新成就（画面层用 takeUnlocked 取走） */
  private unlocked: string[] = [];
  /** 这一局的称号统计（牌桌 logMatch 攒、这里跟着存档走）：放在牌桌场景里的话回大厅再"继续"就从头攒，晒战绩少算副数、头游 */
  log: MatchLog = emptyMatchLog();
  loggedDeal = 0;

  constructor(state: GameState, events: GameEvent[], difficulty: SoloLevel) {
    this.state = state;
    this.difficulty = difficulty;
    this.lastEvents = eventsFor(events, ME);
  }

  static fresh(seed: string, options?: Partial<Options>, difficulty?: SoloLevel): Session {
    const s = getSettings();
    // 局长只管娱乐单机：实盘的 stake.ts 自己用默认规则开，不经这里
    const { state, events } = createGame(seed, options ?? { ...s.rules, ...(s.length === 'short' ? { endLevel: SHORT_END_LEVEL } : {}) });
    const ses = new Session(state, events, difficulty ?? s.difficulty);
    ses.save();
    return ses;
  }

  static restore(): Session | null {
    const d = loadSave();
    if (!d) return null;
    const ses = new Session(d.state, [], d.difficulty);
    ses.counted = d.counted;
    ses.dealsCounted = d.dealsCounted;
    if (d.log) {
      ses.log = d.log;
      ses.loggedDeal = d.loggedDeal ?? d.log.deals;
    }
    return ses;
  }

  view(seat = ME): PlayerView {
    return viewFor(this.state, seat);
  }

  /** 推进一步；非法时返回 error，状态不变。 */
  apply(action: Action): { events: GameEvent[]; error: string | null } {
    const r = dispatch(this.state, action);
    if (r.error) return { events: [], error: r.error };
    this.state = r.state;
    this.lastEvents = eventsFor(r.events, ME);
    for (const e of r.events) {
      if (e.type === 'dealEnd' && this.scored && e.result.dealNo > this.dealsCounted) {
        this.dealsCounted = e.result.dealNo;
        recordDeal(e.result.order[0] === ME, e.result.winnerTeam === 0);
      }
      if (e.type === 'gameOver' && this.scored && !this.counted) {
        this.counted = true;
        recordGame(e.winner === 0);
      }
      // 成就不看 scored：实盘、每日也算；代打（调试）不算
      if (e.type === 'dealEnd') this.achieveDeal(e.result);
      if (e.type === 'gameOver') this.achieveGame(e.winner === 0, e.winner === 0 && e.levels[0] === ACE);
    }
    this.save();
    return { events: this.lastEvents, error: null };
  }

  /** 取走新解锁的成就 id（取一次清空） */
  takeUnlocked(): string[] {
    const u = this.unlocked;
    this.unlocked = [];
    return u;
  }

  /** 记成就摘要（每日挑战打完由牌桌调用，见 TableScene.showDailyResult） */
  achieve(m: AchSummary): void {
    if (!this.autoplay) this.unlocked.push(...recordAch(m));
  }

  /** 一副结束：状态里的出牌记录是这一副全部的，数我打出的炸弹 */
  private achieveDeal(r: DealResult): void {
    const mine = this.state.history.filter((h) => h.seat === ME && h.play).map((h) => h.play!.type);
    const sf = mine.filter((t) => t === 'straightFlush').length;
    const bombs = mine.filter((t) => t === 'bomb' || t === 'straightFlush' || t === 'jokerBomb').length;
    this.achieve({ kind: 'gd-deal', sf: sf > 0, bombs, doubleDown: r.doubleDown && r.winnerTeam === 0 });
  }

  /** 一场结束。每日挑战不算完整的一场，连胜、场数不记，"每日一练"由牌桌在结算页解锁 */
  private achieveGame(won: boolean, passedA: boolean): void {
    if (!this.fullGame) return;
    this.achieve({ kind: 'gd-game', won, passedA });
  }

  hintSeed(): number {
    return soloSeeds(this.state.seed).hint;
  }

  preview(): NextPreview | null {
    return previewNext(this.state);
  }

  canAct(): boolean {
    return true;
  }

  /** 电脑（或代打时的我）在这个座位的决定。 */
  botAction(seat: number): Action | null {
    return runBotJob(this.botJob(seat));
  }

  botJob(seat: number): BotJob {
    // 代打时的我：最强、没性格；电脑按场地（docs/ai.md）：搭档、对手的强弱和性格，状态按这一局的种子
    const bot = seat === ME ? { difficulty: 'hard' as const } : botFor(this.venue(), seat);
    const s = soloSeeds(this.state.seed);
    return { view: viewFor(this.state, seat), cfg: { seed: s.ai, match: s.form, ...bot } };
  }

  /** 单机娱乐按设置里的难度；实盘按档位（StakeSession） */
  protected venue(): Venue {
    return { kind: 'solo', level: this.difficulty };
  }

  botStyle(seat: number): BotStyle | null {
    if (seat === ME) return null;
    const bot = botFor(this.venue(), seat);
    const { form, tilt } = styleOf(viewFor(this.state, ME), bot.difficulty, bot.persona, soloSeeds(this.state.seed).form, seat);
    return { persona: bot.persona, form, tilt };
  }

  isBot(seat: number): boolean {
    return seat !== ME || this.autoplay;
  }

  save(): void {
    if (!this.persist) return;
    if (this.state.phase === 'gameOver') {
      // 整局结束就不留存档："继续"只在有未完成的局时出现
      clearSave();
      return;
    }
    writeSave({ v: 1, state: this.state, difficulty: this.difficulty, counted: this.counted, dealsCounted: this.dealsCounted, log: this.log, loggedDeal: this.loggedDeal });
  }
}
