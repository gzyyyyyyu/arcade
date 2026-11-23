/**
 * 单机实盘（docs/stake.md 第 2 节）的页面这一半：存档 guandan.stake、和掼蛋 Worker 的三个接口打交道、实盘的牌局会话。
 *
 * - 存档单独一个 key，不碰 guandan.save，也不进云同步（只在这台设备上）；记着 userId，换了账号不显示。
 * - 一场打完（或碰到封顶、或者"现在结算"）先把要结的数记进存档（settle），再去结回：刷新、关页面、钱包一时忙，下次打开接着结，
 *   同一个 op 重发钱包只算一次。
 * - 结回、放弃遇到钱包忙（busy、internal、连不上）在这里重试几次；还不行就留着存档，下次再结。
 */
import type { Venue } from '../../variants/guandan/ai/venue.ts';
import { createGame, type Action, type GameEvent, type GameState } from '../../variants/guandan/core/index.ts';
import { TIERS, isTier, newSoloMatch, rulesOf, soloAddDeal, soloOver, soloPoints, type SoloMatch, type TierId } from '../../variants/guandan/stake/index.ts';
import { emptyTally, statsOf, tallyDeal, type Tally } from '../../variants/guandan/stake/stats.ts';
import { currentUserId } from '../common/room-link.ts';
import { postStake, refundWith, settleWith, stakeSeed, type Deps, type SettleOutcome, type WalletView } from '../common/stake-api.ts';
import { ME, Session } from './session.ts';
import { KEYS, rawStore } from '../store.ts';

export const STAKE_KEY = KEYS.stake;

export interface StakeSave {
  v: 1;
  userId: string;
  ref: string;
  tier: TierId;
  share: number;
  /** 钱包里那一份的到期时间（Unix 毫秒）：过了钱包会原样退回 */
  until: number;
  match: SoloMatch;
  state: GameState;
  /** 要结回的数：一场结束或者选了"现在结算"时记下，结回成功后存档删掉 */
  settle: { points: number; deals: number } | null;
  /** 这一份攒的战绩，结回时报给平台（平台 0.10.0）；0.6.0 以前的存档没有，就不报 */
  tally?: Tally;
}

export function loadStake(): StakeSave | null {
  const s = rawStore.read<StakeSave>(STAKE_KEY);
  if (s?.v !== 1 || typeof s.userId !== 'string' || typeof s.ref !== 'string' || !isTier(s.tier) || !s.state || !s.match || !Array.isArray(s.match.deals)) return null;
  return s;
}

function writeStake(s: StakeSave): void {
  rawStore.write(STAKE_KEY, s);
}

export function clearStake(ref?: string): void {
  // 只删指定的那一场：别的标签页可能已经开了新的一场
  if (ref && loadStake()?.ref !== ref) return;
  rawStore.remove(STAKE_KEY);
}

export function stakeExpired(s: StakeSave, now = Date.now()): boolean {
  return now >= s.until;
}

/** 标题页"接着打实盘"那一行：中档 · 第 3/3 副 · +3 分 */
export function stakeLeft(s: StakeSave): { dealsDone: number; dealsTotal: number; points: number } {
  return { dealsDone: s.match.deals.length, dealsTotal: rulesOf(s.match.rules).soloDeals, points: soloPoints(s.match) };
}

/** 结回这一场（存档里必须已经记了 settle）。成功、结过、过期都删存档 */
export async function settleStake(s: StakeSave, deps: Deps = {}): Promise<SettleOutcome> {
  const st = s.settle;
  if (!st) return { kind: 'failed', error: 'not_over' };
  // rules 告诉 Worker 这一场用哪一套数；3 副之前开的存档没有，Worker 就按旧的算
  const body = { ref: s.ref, tier: s.tier, points: st.points, deals: st.deals, ...(s.match.rules ? { rules: s.match.rules } : {}), ...(s.tally ? { stats: statsOf(s.tally) } : {}) };
  return settleWith(body, st.points, () => clearStake(s.ref), deps);
}

/** 一副没打完就不玩了：那一份原样退回 */
export async function refundStake(s: StakeSave, deps: Deps = {}): Promise<SettleOutcome> {
  return refundWith({ ref: s.ref }, () => clearStake(s.ref), deps);
}

/** 进场：认人、带入一份，成功就开一场。带入不重试：ref 由 Worker 生成，重发是另一份 */
export async function buyinStake(tier: TierId, fetcher: typeof fetch = fetch): Promise<{ ok: true; ses: StakeSession } | { ok: false; error: string; wallet?: WalletView }> {
  const userId = await currentUserId(fetcher);
  if (!userId) return { ok: false, error: 'login' };
  const r = await postStake('buyin', { tier }, fetcher);
  if (!r.ok) return r;
  if (typeof r.ref !== 'string' || typeof r.until !== 'number') return { ok: false, error: 'other' };
  return { ok: true, ses: StakeSession.start({ userId, ref: r.ref, tier, until: r.until }) };
}

// ───────────── 实盘的牌局会话 ─────────────

/**
 * 单机实盘的一局：规则全用默认（实盘不让改规则），电脑按档位（1.3），每副记分，存进 guandan.stake；不计战绩、不写 guandan.save。
 * 一场结束（打满副数、封顶、过 A）就记下要结的数，画面去结回。
 */
export class StakeSession extends Session {
  stake: StakeSave;

  constructor(save: StakeSave, events: GameEvent[] = []) {
    super(save.state, events, 'normal');
    this.stake = save;
    this.scored = false;
  }

  /** 带入成功后开一场 */
  static start(info: { userId: string; ref: string; tier: TierId; until: number }, seed = stakeSeed()): StakeSession {
    const { state, events } = createGame(seed);
    const save: StakeSave = { v: 1, ...info, share: TIERS[info.tier], match: newSoloMatch(info.tier), state, settle: null, tally: emptyTally() };
    const ses = new StakeSession(save, events);
    ses.save();
    return ses;
  }

  get tier(): TierId {
    return this.stake.tier;
  }

  get points(): number {
    return soloPoints(this.stake.match);
  }

  /** 这一场结束了（打满、封顶、过 A），或者选了"现在结算" */
  get over(): boolean {
    return this.stake.settle !== null;
  }

  override apply(action: Action): { events: GameEvent[]; error: string | null } {
    if (this.over) return { events: [], error: '这一场已经结束了' };
    const r = super.apply(action);
    if (r.error) return r;
    let m = this.stake.match;
    let tally = this.stake.tally;
    for (const e of r.events) {
      if (e.type !== 'dealEnd') continue;
      const before = m;
      m = soloAddDeal(m, e.result);
      // 同一副只记一次（和 soloAddDeal 一样）；这一副的出牌记录一副结束时还在状态里
      if (m !== before && tally) tally = tallyDeal(tally, e.result, this.state.history, ME, this.tier, m.rules);
    }
    this.stake = { ...this.stake, match: m, ...(tally ? { tally } : {}) };
    if (soloOver(m, this.state.phase)) this.finish();
    else this.save();
    return r;
  }

  /** 记下要结的数（一场结束，或者打了几副后选"现在结算"） */
  finish(): void {
    const m = this.stake.match;
    this.stake = { ...this.stake, settle: { points: soloPoints(m), deals: m.deals.length } };
    this.save();
  }

  protected override venue(): Venue {
    return { kind: 'soloStake', tier: this.tier };
  }

  override save(): void {
    // 构造时父类还没设 stake
    if (!this.stake) return;
    this.stake = { ...this.stake, state: this.state };
    writeStake(this.stake);
  }
}
