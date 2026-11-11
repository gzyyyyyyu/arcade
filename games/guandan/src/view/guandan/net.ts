/**
 * 掼蛋的联机会话：继承 common/room-link.ts 的 RoomLink，把房间按真实座位发来的视图转成"我 = 0"，排成帧给牌桌一帧帧播放，
 * 同时实现单机 Session 一样的 TableSession 接口，牌桌场景不分单机联机。
 *
 * - 每帧带这一步的事件；入座、掉线这类广播会重发同一个状态（view.step 没变），这种帧只刷新画面、不再播放事件。
 * - 座位上是谁（真人昵称、电脑、掉线、代打）写进 labels.ts 的 seatIdentity，牌桌的头像和名牌按它画。
 */
import { PERSONAS, SEAT_PERSONA, decide, situationOf, tiltOf } from '../../variants/guandan/ai/index.ts';
import type { Action, GameEvent, NextPreview, PlayerView } from '../../variants/guandan/core/index.ts';
import type { NetAction, NetView } from '../../variants/guandan/net/rules.ts';
import { rotateNetView, rotation, toReal } from '../../variants/guandan/net/rotate.ts';
import { seatIdentity, setSeatIdentities, setWatching, type SeatIdentity } from '../common/labels.ts';
import { RoomLink, type LinkDeps } from '../common/room-link.ts';
import type { BotStyle, TableSession } from './session.ts';

export interface NetFrame {
  nv: NetView;
  delay: number;
}

export type NetSessionDeps = LinkDeps<NetAction, NetView>;

export class NetSession extends RoomLink<NetAction, NetView, NetView> implements TableSession {
  lastEvents: GameEvent[] = [];
  /** 再来一场：我开的新房间的码（别人点的跟过去时不是房主） */
  againCode: string | null = null;

  constructor(code: string, host: boolean, deps: NetSessionDeps = {}) {
    super('guandan', code, host, deps);
  }

  protected project(v: NetView): NetView {
    return rotateNetView(v, this.mySeat ?? 0);
  }

  protected seatToView(real: number): number {
    return rotation(this.mySeat ?? 0).seat(real);
  }

  protected seatToReal(view: number): number {
    return toReal(this.mySeat ?? 0, view);
  }

  protected override onFresh(): void {
    this.lastEvents = [];
  }

  protected identities(): void {
    const room = this.room;
    if (!room) return;
    const me = this.mySeat ?? 0;
    setWatching(this.watching);
    // 走开了的（0.6.3）：看收到的最新一帧（已经按我的座位转过，下标是画面座位）
    const afk = (this.queue[this.queue.length - 1]?.nv ?? this.shown)?.afk;
    const list: (SeatIdentity | null)[] = [];
    for (let shown = 0; shown < 4; shown++) {
      const s = room.seats[toReal(me, shown)];
      if (!s || s.kind === 'empty') list.push(null);
      // 绑了人、主人离座的座位：显示主人的名字和"电脑代打"（和掉线超过宽限一个样子）；没绑人的电脑座位 name 是 null
      else if (s.kind === 'ai') list.push(s.name !== null ? { human: true, name: s.name, away: true, auto: true } : { human: false, name: '', away: false, auto: false, persona: SEAT_PERSONA[toReal(me, shown)] });
      else list.push({ human: true, name: s.name ?? '玩家', away: s.away, auto: s.auto, ...(afk?.[shown] ? { afk: true } : {}) });
    }
    setSeatIdentities(list);
  }

  /** 进牌桌时：还没显示过就拿第一帧，它的事件（发牌）当作进场动画 */
  begin(): void {
    if (this.shown) return;
    const f = this.take();
    this.lastEvents = f ? f.nv.events : [];
  }

  /** 结算页上我还能点"继续"（坐着、这副结束了、还没点过、上一手没在路上）。不看房间的"轮到谁"：结算时所有没准备的人都能点 */
  canReady(): boolean {
    const nv = this.shown;
    return nv?.view.phase === 'dealEnd' && !!nv.ready && !nv.ready[0] && this.mySeat !== null && this.status === 'open' && this.pending === null;
  }

  /** 结算页上还在等谁（画面座位，不含已经点了"继续"的）和自动开下一副的时间 */
  readyWait(): { waiting: number[]; deadline: number | null } | null {
    const ready = this.shown?.view.phase === 'dealEnd' ? this.shown.ready : null;
    if (!ready) return null;
    return { waiting: [0, 1, 2, 3].filter((s) => !ready[s]), deadline: this.room?.turn?.deadline ?? null };
  }

  // ───────────── TableSession ─────────────

  view(): PlayerView {
    if (!this.shown) throw new Error('还没收到牌局');
    return this.shown.view;
  }

  apply(a: Action): { events: GameEvent[]; error: string | null; sent?: boolean } {
    if (this.pending) return { events: [], error: '上一手还在路上，等一下', sent: false };
    let na: NetAction;
    switch (a.type) {
      case 'nextDeal':
        // 单机的"下一副"在好友房里是"我准备好了"，人齐了（或到点）由房间开下一副
        na = { type: 'ready' };
        break;
      case 'play':
        na = a.as ? { type: 'play', cards: a.cards, as: a.as } : { type: 'play', cards: a.cards };
        break;
      case 'pass':
        na = { type: 'pass' };
        break;
      default:
        na = { type: a.type, card: a.card };
    }
    this.pending = this.client.act(na);
    return { events: [], error: null, sent: true };
  }

  get afk(): boolean {
    return !!(this.queue[this.queue.length - 1]?.nv ?? this.shown)?.afk?.[0];
  }

  /** 再来一场（0.6.2）：新房间我已经开好了，叫这一桌的人一起过去（不轮流的操作） */
  again(code: string): void {
    this.client.act({ type: 'again', code });
  }

  /** 收到的最新一帧里的"再来一场"（还没播到的也算：牌局已经打完，不用等动画） */
  get againInfo(): NetView['again'] {
    return (this.queue[this.queue.length - 1]?.nv ?? this.shown)?.again;
  }

  /** 这一场的公开记录（0.14.0，结束颁奖用；画面座位）：看收到的最新一帧，结算页开着时帧不往下播。0.14.0 以前开的房间没有 */
  get matchLog(): NetView['log'] {
    return (this.queue[this.queue.length - 1]?.nv ?? this.shown)?.log;
  }

  /** 实盘房间带入被拒以后再带一份（不轮流的操作，房间不看轮没轮到我；不占"上一手还在路上"） */
  rebuy(): void {
    this.client.act({ type: 'buyin' });
  }

  isBot(seat: number): boolean {
    return seat === 0 && this.autoplay;
  }

  /** 房间里电脑的状态按密钥抽，页面不知道：只给性格和看得见的上头程度 */
  botStyle(seat: number): BotStyle | null {
    const persona = seatIdentity[seat]?.persona;
    if (!persona || !this.shown) return null;
    const v = this.shown.view;
    return { persona, form: 0, tilt: tiltOf(PERSONAS[persona], situationOf(v, seat)) };
  }

  botAction(seat: number): Action | null {
    if (seat !== 0 || !this.shown) return null;
    const v = this.shown.view;
    if (v.phase === 'dealEnd') return this.canReady() ? { type: 'nextDeal' } : null;
    return decide(v, { seed: this.hintSeed(), difficulty: 'hard' });
  }

  hintSeed(): string {
    const v = this.shown?.view;
    return `${this.code}|${v?.dealNo ?? 0}|${v?.step ?? 0}`;
  }

  preview(): NextPreview | null {
    return this.shown?.next ?? null;
  }

  canAct(): boolean {
    return this.status === 'open' && this.pending === null && this.queue.length === 0 && this.mySeat !== null && this.room?.turn?.seat === this.mySeat;
  }
}
