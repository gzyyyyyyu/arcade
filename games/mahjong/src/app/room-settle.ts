/**
 * 好友房一局、一场打完的结算：一局打完房间停 8 秒自动发下一局，结算摆着不用点；一场打完给总结算、颁奖、分享、再来一场，
 * 别人开了新房间就几秒后跟过去。
 */
import { createRoom } from 'arcade-kit/client';
import { awardsOf } from '../game/awards.ts';
import { stakesOf } from '../game/stakes.ts';
import { createError, type OnlineState } from '../online.ts';
import { SEATS, type RoomView } from '../room/rules.ts';
import { closeDialog, dialog } from '../view/dialog.ts';
import { button, el } from '../view/dom.ts';
import { END_SPLIT, paginate } from '../view/pager.ts';
import { play } from '../view/sound.ts';
import { awardsSummary, fameSummary } from '../view/summary.ts';
import { STAKES_NAME } from '../view/text.ts';
import type { AnyView } from '../view/variants/page.ts';
import { pageOf } from '../view/variants/pages.ts';
import { withNick } from './identity.ts';
import { prefs } from './prefs.ts';
import { enterRoom, FOLLOW_MS, seatMetas } from './room-flow.ts';
import { lobby } from './routes.ts';
import { inMatch, roomBack, session } from './session.ts';
import { awardsButton, cardButton, settle, showMine } from './settle.ts';
import { stage, toast } from './shell.ts';
import { refreshWallet } from './wallet.ts';

/** 一局打完：房间停 8 秒自动发下一局，结算摆着不用点；一场打完给总结算 */
export function roomRoundEnd(s: OnlineState, rv: RoomView, g: AnyView, replay: boolean): void {
  const names = seatMetas(s, g).map((x) => x.name);
  const wallet = !!stakesOf(rv.stakes)?.wallet && !rv.unrated;
  if (g.phase === 'over' || rv.done) {
    const me = s.you?.seat ?? null;
    if (!(replay && document.querySelector('.mask.end'))) matchEndDialog(s, rv, g, names, wallet, me);
    followRematch(rv, me, names);
    return;
  }
  if (g.phase === 'end') return roundEndDialog(g, names, wallet, replay);
  if (document.querySelector('.mask.end')) closeDialog();
}

/** 一场打完的总结算：颁奖在最上面，然后这一局的结算、一场的结算、名场面，底下回选桌 / 分享 / 再来一场 */
function matchEndDialog(s: OnlineState, rv: RoomView, g: AnyView, names: string[], wallet: boolean, me: number | null): void {
  const page = pageOf(g.variant);
  const unit = wallet ? '' : ' 分';
  // 颁奖（docs/social.md 第 2 节）：只按结算里公开的净输赢和胡、杠、自摸数评，放在最上面；立直的小计没有杠数，不评杠王（game/riichi/fun.ts）
  const prizes = g.result ? awardsOf(g.result.seats.map((x) => x.net), page.tally(g)) : [];
  const prizeUnit = wallet ? ' 筹码' : ' 分';
  dialog(stage, 'end', (box) => {
    // 为什么结束、钱怎么走的放在翻页区上面：结算长了要翻页，放在里面会跟着"翻到我那一行"被翻走，第一眼看不到（11-02 冒烟）
    if (rv.cut) el('div', 'settle-note', box, '只剩一个人在下注，实盘这一场提前结束（实盘至少要两个人）');
    if (wallet) el('div', 'settle-note', box, '桌上的筹码已经结回钱包');
    else if (rv.unrated) el('div', 'settle-note', box, '实盘只有一个人，这一场不计输赢、没动钱包');
    // 内容放进翻页区，按钮行在它下面、一直看得见（view/pager.ts）
    const body = el('div', 'end-body', box);
    if (prizes.length) body.appendChild(awardsSummary(prizes, names, prizeUnit));
    // 一场的名次在前，这一局的明细在后（单机一样，app/solo-flow.ts）
    body.appendChild(page.matchSummary(g, names, unit));
    settle(body, page.roundSummary(g, names, unit));
    if (session.fame.length) body.appendChild(fameSummary(session.fame, names));
    const row = el('div', 'row end-acts', box);
    const match = inMatch();
    const back = roomBack();
    button('act soft', row, '回选桌', () => {
      closeDialog();
      lobby(false, back);
    });
    // 分享卡带房间码：房间已经结束的话，朋友打开就是游戏首页。匹配桌不带（外人进不去）
    const title = `${match ? '快速匹配' : '好友房'} · ${wallet ? `实盘${STAKES_NAME[rv.stakes]}档` : '娱乐'} · ${page.lengthText(g.opts)}`;
    const url = match ? `${location.origin}${location.pathname}` : new URL(`?room=${s.code}`, location.href).toString();
    awardsButton(row, prizes, names, prizeUnit, `${title} · 颁奖`, url);
    cardButton(row, page.shareCard(g, { title, unit: wallet ? '筹码' : '分', name: session.myName, fame: session.fame }), url);
    // 再来一场：我开个同样规则的新房间，这一桌跟过来。房间等 3 分钟，过了再点就自己先去新房间、再叫朋友
    if (me !== null && s.room?.seats[me]?.kind === 'human' && !rv.next) {
      const b = button('act go rematch', row, '再来一场', () => void rematch(b));
      // 放在按钮行上面：按钮行贴着弹窗底（css/settle.css），排在它后面的字会被底边裁掉一半
      if (stakesOf(rv.stakes)?.wallet) row.before(el('p', 'room-hint', box, '新房间里各人自己坐下，开打时才从钱包带一份'));
    }
    paginate(body, 0, END_SPLIT);
  }, false);
  showMine();
  if (g.me) play((g.result?.seats[g.me.seat]?.net ?? 0) >= 0 ? 'win' : 'lose');
  void refreshWallet();
}

/** 别人开了新房间：结算上写一句，几秒后跟过去（娱乐坐回原来的相对位置，实盘只亮座位、自己点了才坐） */
function followRematch(rv: RoomView, me: number | null, names: string[]): void {
  if (!rv.next || rv.next.by === me || session.followTimer) return;
  const next = rv.next;
  const from = me === null ? null : { seat: (me - next.by + SEATS) % SEATS, sit: !stakesOf(rv.stakes)?.wallet };
  const go = (): void => enterRoom(next.code, false, from);
  session.followTimer = window.setTimeout(go, FOLLOW_MS);
  const box = document.querySelector<HTMLElement>('.mask.end .dialog');
  const row = box?.querySelector<HTMLElement>('.end-acts');
  if (box && row) {
    row.querySelector('.rematch')?.remove();
    row.before(el('p', 'room-hint', null, `${names[next.by]} 开了新房间 ${next.code}，马上跟过去`));
    button('act go', row, '现在过去', go);
  }
}

/** 一局打完（一场还没完）：结算摆着，几秒后房间自动发下一局 */
function roundEndDialog(g: AnyView, names: string[], wallet: boolean, replay: boolean): void {
  if (replay && (document.querySelector('.mask.end') || session.endTimer)) return;
  const page = pageOf(g.variant);
  const show = (): void => {
    dialog(stage, 'end', (box) => {
      const body = el('div', 'end-body', box);
      settle(body, page.roundSummary(g, names, wallet ? '' : ' 分'));
      el('p', 'room-hint', box, '几秒后自动开下一局');
      paginate(body);
    });
  };
  // 立直有人和了：和牌亮牌（役一条条弹出来）先摆一会儿再盖上结算（和单机一样）；这期间开了下一局或离了房就不弹
  const hold = page.roomEndMs(g);
  if (!hold) return show();
  const t = session.table;
  session.endTimer = window.setTimeout(() => {
    session.endTimer = 0;
    if (session.table === t && (session.online?.state.view?.g as AnyView | undefined)?.phase === 'end') show();
  }, hold * (prefs.fast ? 0.5 : 1));
}

async function rematch(b: HTMLButtonElement): Promise<void> {
  const online = session.online;
  const opts = online?.state.opts;
  if (!online || !opts) return;
  b.disabled = true;
  const r = await createRoom(withNick('rooms'), opts);
  if ('error' in r) {
    b.disabled = false;
    return toast(createError(r.error));
  }
  // 先把房间号发给这一桌（关连接前发出去的会先送到），自己马上过去当房主坐 0 号
  online.next(r.code);
  enterRoom(r.code, true);
}
