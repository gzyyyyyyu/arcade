/**
 * 斗地主的单机会话（牌馆 0.28.0，docs/doudizhu.md 第 4、5 节）：我是 0 号，1 号下家稳哥、2 号上家幺妹儿都是电脑。
 * 和掼蛋的 Session 同一个思路：推进只走规则核心的 dispatchDdz，事件交给画面一条条播；电脑只拿 viewDdz；
 * 电脑的随机数按这一局的种子另外派生（和发牌的流不相干，见 session.ts 的 soloSeeds）。存档、战绩在 store.ts（guandan.ddz.*）。
 */
import { hashSeed } from '../../core/rng.ts';
import {
  DDZ_FUN_BLUNDER, DDZ_NOSHUFFLE, DDZ_SEAT_STYLE, createDdz, dispatchDdz, viewDdz,
  type DdzAction, type DdzEvent, type DdzLevel, type DdzOptions, type DdzState, type DdzView,
} from '../../variants/doudizhu/index.ts';
import type { DailySubmit } from './daily.ts';
import { runDdzBotJob, type DdzBotJob } from './bot-job.ts';
import { recordAch, type AchSummary } from '../common/achievements.ts';
import { type DdzDeal, clearDdzSave, loadDdzSave, recordDdzDeal, recordDdzGame, writeDdzSave } from '../store.ts';

export const DDZ_ME = 0;

/**
 * 斗地主牌桌（DdzScene）只认这个接口：单机的 DdzSession（本地算）和联机的 DdzNetSession（doudizhu/net.ts，房间算好下发）各实现一份。
 * 视角一律是"我 = 0"（联机时在 doudizhu/net.ts 里先转好）。
 */
export interface DdzTableSession {
  /** 联机会话：电脑在房间里出，结算页的"下一副"是"继续"，没有再来一局 */
  readonly online: boolean;
  /** 调试：电脑代打我 */
  autoplay: boolean;
  /** 进场时要播的事件（新开的一副） */
  lastEvents: DdzEvent[];
  /** 每日挑战（只有单机有；联机永远是 null） */
  daily: string | null;
  dailySent: boolean;
  dailyResult: Promise<DailySubmit> | null;
  view(): DdzView;
  /** 推进一步：单机马上返回事件；联机只是发出去（sent），结果随房间的下一帧到 */
  apply(a: DdzAction): { events: DdzEvent[]; error: string | null; sent?: boolean };
  /** 这个座位要不要由本地的电脑出（联机时电脑在房间里出，只有托管我自己时才在本地算） */
  isBot(seat: number): boolean;
  botAction(seat: number): DdzAction | null;
  /** 电脑这一手要算的东西（纯数据，能交给 worker 算，见 bot-worker.ts）；null = 只能当场同步算（残局、联机托管） */
  botJob?(seat: number): DdzBotJob | null;
}

/**
 * 娱乐单机开局的规则：明牌开着（地主每副选亮不亮，亮了 ×2，不想要点"不明牌"就是原来的打法）。
 * 每日挑战（大家同一套规则比分）、实盘（配平按不明牌算的）不开；好友房的娱乐房间也开（net/rules.ts 的 ddzBegin）
 */
export const DDZ_FUN_OPTS: Partial<DdzOptions> = { mingpai: true };

/** 娱乐单机开局的规则加上发牌方式：不洗牌（炸弹多、每副封顶，docs/doudizhu.md 第 4 节）叠在明牌上，单机里只开在娱乐，好友房见 ddzBegin */
export function ddzFunOpts(deal: DdzDeal): Partial<DdzOptions> {
  return deal === 'clump' ? { ...DDZ_FUN_OPTS, ...DDZ_NOSHUFFLE } : DDZ_FUN_OPTS;
}

/** 电脑的随机流：只和这一局的种子有关，电脑拿不到发牌的种子 */
export function ddzSeeds(seed: string): { ai: number } {
  return { ai: hashSeed(seed, 'ddz-solo-ai') };
}

export class DdzSession implements DdzTableSession {
  readonly online = false;
  state: DdzState;
  level: DdzLevel;
  /** 进场时要播的事件（新开的一局） */
  lastEvents: DdzEvent[];
  /** 调试：电脑代打我 */
  autoplay = false;
  /** 存档、记战绩（测试、调试开局、每日挑战关掉） */
  persist = true;
  /** 每日挑战的日期（北京时间）；null 是平常的一局 */
  daily: string | null = null;
  /** 每日挑战这一场交过分了（交分的结果，结束页重建时接着显示） */
  dailySent = false;
  dailyResult: Promise<DailySubmit> | null = null;
  private counted = false;
  private dealsCounted = 0;
  /** 还没弹给玩家的新成就（画面层用 takeUnlocked 取走） */
  private unlocked: string[] = [];
  /** 这一副我打出过王炸（王炸在牌桌记录里没有留痕，一副一清） */
  private rocket = false;

  constructor(state: DdzState, events: DdzEvent[], level: DdzLevel) {
    this.state = state;
    this.lastEvents = events;
    this.level = level;
  }

  /** persist 为假：调试开局（URL 带种子）时已有存档就不写，免得覆盖玩家进度 */
  static fresh(seed: string, level: DdzLevel, opts?: Partial<DdzOptions>, persist = true): DdzSession {
    const { state, events } = createDdz(seed, opts);
    const s = new DdzSession(state, events, level);
    s.persist = persist;
    s.save();
    return s;
  }

  static restore(): DdzSession | null {
    const d = loadDdzSave();
    if (!d || d.state.phase === 'gameOver') return null;
    const s = new DdzSession(d.state, [], d.level);
    s.counted = d.counted;
    s.dealsCounted = d.dealsCounted;
    return s;
  }

  view(seat = DDZ_ME): DdzView {
    return viewDdz(this.state, seat);
  }

  /** 推进一步；非法时回 error，状态不变 */
  apply(a: DdzAction): { events: DdzEvent[]; error: string | null } {
    const r = dispatchDdz(this.state, a);
    if (r.error) return { events: [], error: r.error };
    this.state = r.state;
    for (const e of r.events) {
      // 成就不看 persist：实盘、每日也算；代打（调试）不算
      if (e.type === 'play' && e.seat === DDZ_ME && e.play.type === 'rocket') this.rocket = true;
      if (e.type === 'dealEnd') {
        const me = e.result.delta[DDZ_ME]!;
        this.achieve({ kind: 'ddz-deal', landlord: e.result.landlord === DDZ_ME, won: me > 0, bid: e.result.bid, spring: e.result.spring, rocket: this.rocket });
        this.rocket = false;
      }
      if (e.type === 'gameOver') this.achieve({ kind: 'ddz-game', won: this.state.scores[DDZ_ME]! > 0, daily: this.daily !== null });
      if (e.type === 'dealEnd' && this.persist && this.state.results.length > this.dealsCounted) {
        this.dealsCounted = this.state.results.length;
        const me = e.result.delta[DDZ_ME]!;
        recordDdzDeal(me > 0, e.result.landlord === DDZ_ME, e.result.spring !== null);
      }
      if (e.type === 'gameOver' && this.persist && !this.counted) {
        this.counted = true;
        recordDdzGame(this.state.scores[DDZ_ME]! > 0);
      }
    }
    this.save();
    return { events: r.events, error: null };
  }

  /** 取走新解锁的成就 id（取一次清空） */
  takeUnlocked(): string[] {
    const u = this.unlocked;
    this.unlocked = [];
    return u;
  }

  private achieve(m: AchSummary): void {
    if (!this.autoplay) this.unlocked.push(...recordAch(m));
  }

  isBot(seat: number): boolean {
    return seat !== DDZ_ME || this.autoplay;
  }

  /** 电脑（或代打的我）在这个座位的决定：代打的我按最强；电脑高手档用娱乐专属的深残局（decideDdz 的 deep） */
  botAction(seat: number): DdzAction | null {
    const job = this.botJob(seat);
    return job ? runDdzBotJob(job) : null;
  }

  botJob(seat: number): DdzBotJob | null {
    const level: DdzLevel = seat === DDZ_ME ? 'pro' : this.level;
    const opts = seat === DDZ_ME ? { blunder: 0 } : { blunder: DDZ_FUN_BLUNDER[level], deep: true, style: DDZ_SEAT_STYLE[seat] };
    return { view: this.view(seat), level, seed: `${ddzSeeds(this.state.seed).ai}|${seat}|${this.state.step}`, opts };
  }

  save(): void {
    if (!this.persist) return;
    if (this.state.phase === 'gameOver') clearDdzSave();
    else writeDdzSave({ v: 1, state: this.state, level: this.level, counted: this.counted, dealsCounted: this.dealsCounted });
  }
}
