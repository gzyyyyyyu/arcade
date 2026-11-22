/**
 * 锦标赛的页面：单机锦标赛（src/tour/solo.ts，我 + 5 个电脑）、今日赛（每天一场单机极速赛），和好友房锦标赛（docs/tournament.md 14.3）的出局、结束页。
 * 牌桌画面和出手节奏用单机那一套（table.ts 的 onStep、TableView）。
 */
import { canScoreTour, dailyTourBoardId, dailyTourSeed, finishTourDaily, parseTourDaily, sentTourDaily, startTourDaily, tourScore } from '../core/daily.ts';
import { FUN_LEVEL, FUN_STAKES, type StakesId } from '../core/stakes.ts';
import { view } from '../core/view.ts';
import { walletError } from '../net/wallet.ts';
import { submitScore } from '../net/scores.ts';
import { seatName, type OnlineState } from '../online.ts';
import type { RoomView } from '../room/rules.ts';
import { site } from '../site.ts';
import { ME } from '../solo.ts';
import { KEYS, readJson, writeJson } from '../store.ts';
import { formatInfo, START_STACK, tourLevel, type TourFormat } from '../tour/rules.ts';
import { TourSolo } from '../tour/solo.ts';
import { dialog } from '../view/dialog.ts';
import { el, setText, toggle } from '../view/dom.ts';
import { beijingDate } from '../view/puzzle.ts';
import { chips, personaName } from '../view/text.ts';
import { tourEndBody, tourOutBody, type TourRow } from '../view/tourroom.ts';
import { LOGIN_NOTE, PENDING_NOTE, type App } from './state.ts';
import { must } from '../must.ts';
import { RETRY_MS } from '../view/timing.ts';

export function createTour(c: App) {
  const f = c.fn;
  const { stage, tableView, reads, tally, handNo, topUpBtn, sitBtn, ffBtn, showBar, bar } = c.ui;
  /** 结奖金、出结束页这一段正在办（别叫两次） */
  let ending = false;

  /**
   * 今日赛：每天一场单机极速赛（6 人），只有娱乐、难度固定"普通"，不碰钱包。
   * 种子由北京日期推出（dailyTourSeed），当天所有人的牌堆、电脑性格和座位一样。
   * 当天第一场记分上榜（点开始就算打过，存 texas.dailytour），之后重打是练习
   */
  async function startDailyTour(): Promise<void> {
    if (c.busy || c.solo || c.tour || site.standalone) return;
    c.busy = true;
    f.drawLobby();
    const date = beijingDate();
    const rec = parseTourDaily(readJson(KEYS.dailyTour));
    const scored = canScoreTour(rec, date);
    const r = await TourSolo.open(c.tourDeps, { userId: c.cloud.userId(), stakes: FUN_STAKES, practice: true, level: FUN_LEVEL.normal, format: 'turbo', entropy: dailyTourSeed(date), daily: { date, scored } });
    c.busy = false;
    if ('error' in r) {
      c.walletNote = walletError(r.error);
      f.drawLobby();
      return;
    }
    if (scored) writeJson(KEYS.dailyTour, startTourDaily(rec, date));
    c.tour = r;
    enterTour();
  }

  async function startTour(stakes: StakesId, fun: boolean, level: number, format: TourFormat): Promise<void> {
    if (c.busy || c.solo || c.tour) return;
    c.busy = true;
    f.drawLobby();
    const r = await TourSolo.open(c.tourDeps, { userId: c.cloud.userId(), stakes: fun ? FUN_STAKES : stakes, practice: fun, level: fun ? level : tourLevel(format, stakes), format });
    c.busy = false;
    if ('error' in r) {
      await f.refreshWallet();
      if (r.pending) {
        c.tour = r.pending;
        await settleTour();
      } else c.walletNote = walletError(r.error);
      f.drawLobby();
      return;
    }
    c.tour = r;
    void f.refreshWallet();
    enterTour();
  }

  /** 办锦标赛本机存档里还没回话的那一笔（报名或结奖金），连不上隔一会儿用同一个操作 id 再办 */
  async function settleTour(): Promise<void> {
    const t = c.tour;
    if (!t?.session.pending) return;
    window.clearTimeout(c.retryTimer);
    const err = await t.settle();
    if (!TourSolo.load(localStorage, c.cloud.userId())) c.tour = null;
    await f.refreshWallet();
    if (t.session.pending && err === 'login') c.walletNote = LOGIN_NOTE;
    else if (t.session.pending) {
      c.walletNote = PENDING_NOTE;
      c.retryTimer = window.setTimeout(() => void settleTour().then(f.drawLobby), RETRY_MS);
    } else if (err) c.walletNote = walletError(err);
  }

  /** 锦标赛进桌：从停下的地方接着打（锦标赛不自动出新手指引，想看点 ?） */
  function enterTour(): void {
    const t = must(c.tour, '进锦标赛前赛事已经建好');
    reads.clear();
    tally.clear();
    c.feedSent.clear();
    c.outShown.clear();
    stage.classList.add('at-table');
    tableView.setup(t.table.seats.length, ME);
    tableView.show(view(t.table, ME));
    f.openFun('solo');
    f.drawTop();
    refreshTour();
    void driveTour(t.flush());
  }

  /** 等这一串（我出手、电脑接着出手、自动发牌）做完，再看轮到谁 */
  async function driveTour(p: Promise<unknown>): Promise<void> {
    await p;
    refreshTour();
  }

  /** 锦标赛的操作区、顶栏；我淘汰了问一次，整场结束出结算 */
  function refreshTour(): void {
    const t = c.tour;
    if (!t || !stage.classList.contains('at-table')) return;
    const v = t.view;
    setText(handNo, v.handNo ? `第 ${v.handNo} 手` : '');
    stage.dataset.phase = v.phase;
    // 锦标赛里没有补码、歇一手、下一手（自动发）、亮牌栏
    for (const b of [topUpBtn, sitBtn, ffBtn]) toggle(b, 'hidden', true);
    f.drawBetween(false);
    showBar.hide();
    f.drawTop();
    tourNotes(t);
    const auto = bar.update(v, c.animating === 0 && !t.closing && !t.eliminated);
    if (auto) {
      void driveTour(t.act(auto));
      return;
    }
    if (c.animating > 0 || c.asking) return;
    if (t.over) void endTour();
    else if (t.undecided) void askEliminated();
  }

  /** 谁出局了提示一句；盲注涨了顶栏跟着换 */
  function tourNotes(t: TourSolo): void {
    t.view.places.forEach((p, i) => {
      if (p !== null && !c.outShown.has(i)) {
        c.outShown.add(i);
        // 打完了（含现在离开时一口气跑完）不再一个个弹，结束页上有名次；不然最后一条会挂到回大厅以后
        if (i !== ME && !t.over) f.toast(`${personaName(t.table.seats[i]!.persona)} 出局，第 ${p} 名`);
      }
    });
    f.drawTop();
  }

  /** 我淘汰了：看到结束，还是现在离开（直接跑完出结算，名次和奖金不变） */
  async function askEliminated(): Promise<void> {
    const t = c.tour;
    if (!t || c.asking) return;
    c.asking = true;
    const place = must(t.state.places[ME], '赛事一定给我排了名次');
    const prize = t.result().prize;
    const body = el('div', 'tour-out');
    el('p', 'tour-out-place', body, `你拿了第 ${place} 名`);
    el('p', '', body, t.session.practice ? '娱乐赛，筹码不算数。' : prize > 0 ? `奖金 ${chips(prize)}，打完结回钱包。` : `没进前 ${formatInfo(t.state.format).pay.length} 名，没有奖金。`);
    el('p', 'sum-note', body, '看到结束：电脑接着打，你看谁拿冠军。现在离开：直接跑完，马上出结算。');
    const v = await dialog(stage, '你出局了', body, [
      { label: '现在离开', value: 'leave' },
      { label: '看到结束', value: 'watch', primary: true },
    ], true);
    c.asking = false;
    if (v === 'leave') return void (await leaveTour(true));
    t.watch();
    await driveTour(t.flush());
  }

  /** 整场打完：结奖金，出结算页 */
  async function endTour(): Promise<void> {
    const t = c.tour;
    if (!t || ending) return;
    ending = true;
    try {
      f.stopCountdown();
      f.achTour(t);
      await tourSummary(t, await t.finish());
    } finally {
      ending = false;
    }
  }

  /** 离开：打着的时候问一次；淘汰后选了"现在离开"（out）不再问。剩下的电脑托管跑完，按名次结 */
  async function leaveTour(out = false): Promise<boolean> {
    const t = c.tour;
    if (!t || ending) return true;
    if (!out && !t.over && !t.closing && !t.eliminated) {
      const ok = await dialog(stage, '现在离开？', t.session.practice ? '你的座位交给电脑接着打，直接跑完出名次。' : '你的座位交给电脑接着打，直接跑完按名次结奖金。报名费不退，想拿奖就坚持到底。', [
        { label: '接着打', value: 'no', cancel: true },
        { label: '离开', value: 'yes', danger: true },
      ]);
      if (ok !== 'yes') return false;
    }
    ending = true;
    try {
      f.stopCountdown();
      // 还活着就走、剩下的交给电脑打出来的名次不算成就
      const abandoned = !t.over && !t.eliminated;
      const err = await t.leave();
      if (!abandoned) f.achTour(t);
      if (t.session.pending?.t === 'buyin') {
        await dialog(stage, '先等报名', err === 'login' ? walletError('login') : '报名那一笔还没回话，报名费可能已经扣了。等它回话再离开，这一场才不会丢。', [{ label: '好', value: 'ok', primary: true }]);
        refreshTour();
        return false;
      }
      await tourSummary(t, err);
    } finally {
      ending = false;
    }
    return true;
  }

  /** 结束页：我的名次、奖金、前三名（拿奖的名次按赛制，经典是前四） */
  async function tourSummary(t: TourSolo, err: string | null): Promise<void> {
    await f.refreshWallet();
    const { place, prize, order } = t.result();
    const practice = t.session.practice;
    const body = el('div', 'tour-sum');
    el('div', 'tour-place', body, `第 ${place} 名`);
    let line: string;
    if (practice) line = '娱乐赛：筹码不算数';
    else if (err && t.closing) line = err === 'login' ? `奖金 ${chips(prize)}，登录后自动结回` : `奖金 ${chips(prize)}，钱包暂时连不上，稍后自动结回`;
    else if (err) line = `没结成：${walletError(err)}`;
    else if (prize > 0) line = `奖金 ${chips(prize)}，结回钱包${t.capped ? `（今天进账到顶，其中 ${chips(t.capped)} 没进钱包）` : ''}`;
    else line = `没进前 ${formatInfo(t.state.format).pay.length} 名，这次没有奖金`;
    el('div', 'tour-prize', body, line);
    const list = el('ol', 'tour-top', body);
    order.slice(0, 3).forEach((seat, k) => {
      const li = el('li', seat === ME ? 'me' : '', list);
      el('b', '', li, `第 ${k + 1} 名`);
      el('span', '', li, seat === ME ? `${c.myName}（你）` : personaName(must(t.table.seats[seat], '赛桌每个座位号都有座位').persona));
    });
    // 今日赛：当天第一场记分交榜，其余是练习
    const dly = t.session.daily;
    if (dly) {
      const score = tourScore(place, t.myHands);
      el('div', 'tour-score', body, `${score} 分`);
      const dailyNote = el('div', 'tour-daily', body);
      const rec = parseTourDaily(readJson(KEYS.dailyTour));
      const next = dly.scored ? finishTourDaily(rec, dly.date, score) : rec;
      // 先记"没交上"再交，成功才改成已上榜；记分这一步只在当天第一场、且还没记过分时发生，所以刷新、关页都不会交第二次
      if (dly.scored && next !== rec && !site.standalone) {
        writeJson(KEYS.dailyTour, next);
        const sent = c.cloud.userId() ? submitScore(dailyTourBoardId(dly.date), score) : Promise.resolve(false);
        setText(dailyNote, '正在交今日榜的分…');
        void sent.then((ok) => {
          if (ok) writeJson(KEYS.dailyTour, sentTourDaily(parseTourDaily(readJson(KEYS.dailyTour)), dly.date));
          setText(dailyNote, ok ? '已上今日榜' : '今日榜没交上：连不上，稍后再试；分数已记在本机');
        });
      } else setText(dailyNote, dly.scored ? '' : `练习局（${dly.date} 的今日赛已经记过分），不上榜`);
    }
    el('div', 'sum-note', body, `${t.table.seats.length} 人、每人 ${chips(START_STACK)} 比赛筹码，每 ${t.state.every} 手涨一次盲注`);
    const pick = await dialog(stage, dly ? '今日赛结束' : '锦标赛结束', body, [
      { label: '回首页', value: 'ok', primary: !dly },
      ...(dly ? [{ label: '再练一场', value: 'again', primary: true }] : []),
    ], true);
    if (err && t.closing) {
      c.walletNote = err === 'login' ? LOGIN_NOTE : '钱包暂时连不上：奖金先记在本机，稍后会自动结回钱包';
      if (err !== 'login') c.retryTimer = window.setTimeout(() => void settleTour().then(f.drawLobby), RETRY_MS);
    } else c.tour = null;
    f.showLobby();
    if (pick === 'again' && dly) await startDailyTour();
  }

  // ---------- 好友房锦标赛 ----------

  /** 谁出局了提示一句；我淘汰了问一次（看到结束 / 现在离开）；整场打完弹结束页 */
  function roomTourNotes(s: OnlineState, v: RoomView): void {
    const t = must(v.tour, '锦标赛房间的视图一定带赛事信息');
    if (s.busy || c.animating > 0) return;
    const me = s.you?.seat ?? null;
    t.places.forEach((p, i) => {
      if (p === null || c.outShown.has(i)) return;
      c.outShown.add(i);
      if (i !== me && !t.over) f.toast(`${f.nameAt(v, i, me)} 出局，第 ${p} 名`);
    });
    if (t.over) return void roomTourEnd(s);
    if (t.in && me !== null && t.places[me] !== null && !c.roomWatch && !c.asking) void askRoomEliminated(s, t.places[me]!);
  }

  async function askRoomEliminated(s: OnlineState, place: number): Promise<void> {
    const o = c.online;
    if (!o) return;
    c.asking = true;
    const how = await dialog(stage, '你出局了', tourOutBody(place, s.view?.tour?.fun === true), [
      { label: '现在离开', value: 'leave' },
      { label: '看到结束', value: 'watch', primary: true },
    ], true);
    c.asking = false;
    if (c.online !== o) return;
    if (how === 'leave') return void (await f.leaveRoom(false, true));
    c.roomWatch = true;
  }

  /** 整场打完：我的名次、奖金（实盘"结回钱包 X"，娱乐"筹码不算数"）和真人名次表；点"回首页"离开房间 */
  async function roomTourEnd(s: OnlineState): Promise<void> {
    const o = c.online;
    const v = s.view;
    const t = v?.tour;
    if (!o || !v || !t?.over || !t.order || c.roomTourEnded === s.code) return;
    c.roomTourEnded = s.code;
    f.stopCountdown();
    const me = s.you?.seat ?? s.you?.bound ?? null;
    const nameOf = (k: number): string => seatName(s, k, me, c.myName);
    const placeOf = (k: number): number => t.places[k] ?? must(t.order, '锦标赛结束时有名次表').indexOf(k) + 1;
    const rows: TourRow[] = t.order.filter((k) => t.humans.includes(k)).map((k) => ({ name: nameOf(k), place: placeOf(k), prize: t.prizes ? (t.prizes[k] ?? 0) : null, me: k === me }));
    const played = me !== null && t.humans.includes(me);
    // 娱乐赛的名次也进成就墙（和朋友打的主要就是好友房）；实盘锦标赛不算，和原来一样
    if (played && t.fun) f.achRoomTour(s.code, placeOf(me));
    const champ = must(t.order[0], '整场打完一定有冠军');
    const body = tourEndBody({
      place: played ? placeOf(me) : null,
      prize: played && t.prizes ? (t.prizes[me] ?? 0) : null,
      fun: t.fun,
      played,
      rows,
      champion: t.humans.includes(champ) ? nameOf(champ) : personaName(must(v.seats[champ], '视图里每个座位号都有座位').persona),
    });
    await dialog(stage, '锦标赛结束', body, [{ label: '回首页', value: 'ok', primary: true }], true);
    if (c.online !== o) return;
    o.close();
    f.forgetRoom();
    f.exitRoom(null);
  }

  return { startDailyTour, startTour, settleTour, enterTour, driveTour, refreshTour, tourNotes, leaveTour, roomTourNotes, roomTourEnd };
}
