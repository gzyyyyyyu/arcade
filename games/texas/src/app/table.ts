/**
 * 单机现金桌和全下局的牌桌：进桌、出手、播画面、两手之间、补码、离桌结算。
 * 规则在 src/core，流程在 solo.ts，这里只把它们和画面连起来。onStep、drawBetween 这几个锦标赛和好友房也用。
 */
import { stream } from 'arcade-kit/rng';
import { thinkMs } from '../ai/think.ts';
import { DIFFICULTY_NAME, difficultyOf, PF_HANDS, stakesOf } from '../core/stakes.ts';
import type { Action, Table } from '../core/table.ts';
import { view, type View } from '../core/view.ts';
import { walletApi, walletError, type WalletApi, type WalletReply } from '../net/wallet.ts';
import { site } from '../site.ts';
import { ffThinkMs, ME, type Solo, type SoloDeps, type Step } from '../solo.ts';
import type { TourDeps } from '../tour-solo.ts';
import { myTurn, notMyTurn } from '../view/alert.ts';
import { closeCoach } from '../view/coach.ts';
import { askTopUp, closeDialog, dialog } from '../view/dialog.ts';
import { el, setText, toggle } from '../view/dom.ts';
import { readLines, styleTag } from '../view/reads.ts';
import { soloCard } from '../view/share.ts';
import { soloSummary, type SoloSummary } from '../view/summary.ts';
import { must } from '../must.ts';
import { shareIt } from './shell.ts';
import { AUTO_NEXT_MS, END_CARD_MS, PF_NEXT_MS, RETRY_MS, TOPUP_RETRY_MS, TOPUP_WAIT_MS } from '../view/timing.ts';
import { fastForwarding, LOGIN_NOTE, waitPace, type App, type Fns, type State } from './state.ts';


/** 单机和锦标赛的依赖：钱包（回话顺手记下最新余额）、本机存档、随机、电脑想多久、等多久、每一步的画面 */
export function soloDeps(s: State, fn: Fns): { deps: SoloDeps; tourDeps: TourDeps } {
  /** 钱包的回话顺手记下最新余额 */
  const tracked = (api: WalletApi): WalletApi => {
    const keep = (r: WalletReply): WalletReply => {
      if (r.ok) s.wallet = r.wallet;
      return r;
    };
    return {
      buyin: async (...a) => keep(await api.buyin(...a)),
      cashout: async (...a) => keep(await api.cashout(...a)),
    };
  };
  /**
   * 电脑想多久：规则在 src/ai/think.ts（纯函数，只看公开的局面、性格和这一场的快慢，不看牌力；docs/ai.md 4.7）。
   * 这里只管三件页面上的事：随机流（每次打开页面一条，和牌无关）、7–9 人桌的紧凑、等待节奏 waitPace
   */
  const thinkRng = stream(Array.from(crypto.getRandomValues(new Uint32Array(8))), 'think');
  const think = (t: Table, seat: number): number => thinkMs(view(t, seat), thinkRng) * waitPace(s);
  // 单机桌我不在这一手里时电脑少想一会儿（只改等待，不碰规则和随机）
  const soloThink = (t: Table, seat: number): number => {
    const raw = thinkMs(view(t, seat), thinkRng);
    return fastForwarding(s) ? ffThinkMs(raw, raw * waitPace(s)) : raw * waitPace(s);
  };
  const onStep = (st: Step): Promise<void> => fn.onStep(st);
  const deps: SoloDeps = {
    wallet: tracked(walletApi),
    store: localStorage,
    entropy: () => Array.from(crypto.getRandomValues(new Uint32Array(8))),
    newId: () => crypto.randomUUID(),
    think: soloThink,
    wait: (ms) => new Promise((ok) => window.setTimeout(ok, ms)),
    onStep,
  };
  const tourDeps: TourDeps = {
    wallet: tracked(walletApi),
    store: localStorage,
    entropy: deps.entropy,
    newId: deps.newId,
    // 我淘汰了在旁观时，电脑想得快一点
    think: (t, seat) => think(t, seat) * (s.tour?.eliminated ? 0.5 : 1),
    // 一手打完停几秒让人看清结果，再自动发下一手；旁观时短一点
    gap: (watching) => (watching ? 1_200 : 3_200) * waitPace(s),
    wait: deps.wait,
    onStep,
  };
  return { deps, tourDeps };
}

/** 左上角的手数：全下局写"第 n / 15 手" */
const handText = (v: View): string => (v.handNo ? (v.pf ? `第 ${v.handNo} / ${PF_HANDS} 手` : `第 ${v.handNo} 手`) : '');

/** 圈在 ms 里走完 */
function drain(ring: Element, ms: number): Animation | null {
  const circle = ring.querySelector('circle');
  return circle ? circle.animate([{ strokeDashoffset: '0' }, { strokeDashoffset: '100' }], { duration: Math.max(0, ms), fill: 'forwards' }) : null;
}

/** 单机这一桌怎么称呼（分享卡的标题）：娱乐写难度，实盘写档位 */
function soloWhere(s: Solo): string {
  const diff = s.session.practice ? difficultyOf(s.table.level) : null;
  return s.session.practice ? `娱乐 · ${diff ? DIFFICULTY_NAME[diff] : stakesOf(s.table.stakes).name}` : stakesOf(s.table.stakes).name;
}

export function createTable(c: App) {
  const f = c.fn;
  const { stage, tableView, reads, tally, handNo, topUpBtn, sitBtn, ffBtn, betweenBar, roomPause, nextBtn, autoBtn, showBar, bar } = c.ui;
  /** 自动下一手的倒计时（同一时间只有一个） */
  let autoTimer = 0;
  /** 输光了：结果先摆一会儿，再问补码 */
  let bustTimer = 0;
  /** 全下局的结果卡已经弹出（一局只弹一次） */
  let pfOver = false;

  /** 快进时（我弃牌了、这一手还没打完）显示"看完这手"；点了这一手恢复正常节奏，下一手再弃牌会重新快进 */
  function drawFf(): void {
    const s = c.solo;
    toggle(ffBtn, 'hidden', !(s && fastForwarding(c) && s.table.phase !== 'idle'));
  }
  ffBtn.addEventListener('click', () => {
    if (c.solo) c.ffSkip = c.solo.table.handNo;
    drawFf();
  });

  function enterTable(): void {
    const s = must(c.solo, '进牌桌前单机局已经建好');
    c.pfMode = s.table.pushFold === true;
    pfOver = false;
    reads.clear();
    tally.clear();
    c.feedSent.clear();
    stage.classList.add('at-table');
    tableView.setup(s.table.seats.length, ME);
    tableView.show(view(s.table, ME));
    // 单机也有互动：对电脑扔道具、点名、发表情，电脑在本机按 kit 的 botReact 回
    f.openFun('solo');
    f.drawTop();
    refresh();
    // 刚坐下的桌从第一手发起；接着打的桌从停下的地方接着。新手指引在第一次轮到我时出（refresh）
    void drive(s.table.handNo === 0 && s.between ? s.next() : s.flush());
  }

  /** 亮我刚才的牌：好友房交给房间，单机在本机做 */
  function showMine(cards: number[]): void {
    if (c.online) c.online.act({ t: 'show', cards });
    else if (c.solo) void c.solo.showCards(cards).then(() => refresh());
  }

  /** 亮牌那一块：一手打完停着、我在这一手里、摊牌时没亮过才有；key 换了（新的一手）重新计时 */
  function drawShow(v: View, key: string, until: number | null): void {
    const me = v.me;
    if (!v.hold || me === null || v.lastHand?.shown.some((x) => x.seat === me)) return showBar.hide();
    showBar.draw(v.kept, v.lastHand?.showed?.find((x) => x.seat === me)?.cards ?? [], key, until);
  }

  /** 发下一手（点了"下一手"、自动下一手倒数完） */
  function nextHand(): void {
    stopCountdown();
    closeCoach();
    toggle(betweenBar, 'hidden', true);
    if (c.online || !c.solo?.between || c.animating > 0) return;
    void drive(c.solo.next());
  }

  function stopCountdown(): void {
    window.clearTimeout(autoTimer);
    autoTimer = 0;
    c.countdown?.cancel();
    c.countdown = null;
  }

  /** 单机两手之间的那一栏：下一手 + 自动下一手（开着就倒数） */
  function drawBetween(show: boolean): void {
    const { settings, pfMode } = c;
    toggle(betweenBar, 'hidden', !show);
    toggle(roomPause, 'hidden', true);
    toggle(nextBtn, 'hidden', false);
    // 全下局一律自动下一手（点"下一手"可以更快），不给关
    const auto = settings.autoNext || pfMode;
    toggle(autoBtn, 'hidden', pfMode);
    toggle(autoBtn, 'sel', settings.autoNext);
    autoBtn.setAttribute('aria-pressed', String(settings.autoNext));
    const ring = must(nextBtn.querySelector('.next-ring'), '"下一手"的倒计时圈 .next-ring');
    toggle(ring, 'hidden', !auto);
    if (!show || !auto) return stopCountdown();
    if (autoTimer) return;
    const ms = (pfMode ? PF_NEXT_MS : AUTO_NEXT_MS) * waitPace(c);
    c.countdown = drain(ring, ms);
    autoTimer = window.setTimeout(nextHand, ms);
  }

  async function act(a: Action): Promise<void> {
    // 情境提示不跟着下一步留在桌上
    closeCoach();
    if (c.online) {
      c.online.act(a);
      return;
    }
    if (c.tour) return void f.driveTour(c.tour.act(a));
    if (!c.solo) return;
    await drive(c.solo.act(a));
  }

  /** 等这一串（我出手、电脑接着出手）做完，再看轮到谁 */
  async function drive(p: Promise<unknown>): Promise<void> {
    await p;
    refresh();
  }

  /** 摆操作区和左下角；轮到我且有预选就直接做；输光了问补码 */
  function refresh(): void {
    if (c.tour) return f.refreshTour();
    const s = c.solo;
    if (!s || !stage.classList.contains('at-table')) return;
    const { pfMode } = c;
    drawFf();
    const v = view(s.table, ME);
    const meSeat = must(s.table.seats[ME], '单机桌一定有我的座位');
    setText(handNo, handText(v));
    // 冒烟脚本看这个判断牌桌停没停
    stage.dataset.phase = v.phase;
    const out = meSeat.status === 'out' && v.phase === 'idle';
    // 钱包里连一个大盲都没有就不给补码（点了也补不上）
    const st = stakesOf(s.table.stakes);
    toggle(topUpBtn, 'hidden', pfMode || !(out && meSeat.stack < st.max && (s.session.practice || (c.wallet?.balance ?? 0) >= st.bb)));
    setText(sitBtn, meSeat.away ? '回来' : '歇一手');
    toggle(sitBtn, 'sel', meSeat.away);
    toggle(sitBtn, 'hidden', s.busted || pfMode);
    f.drawTop();
    // 全下局打满手数或输光了：一手打完停着时出结果卡
    if (pfMode && s.between && v.handNo > 0 && c.animating === 0 && !c.asking && !pfOver && (v.handNo >= PF_HANDS || s.busted)) {
      pfOver = true;
      drawBetween(false);
      window.setTimeout(() => {
        if (c.solo === s) void f.pfFinish(s);
      }, END_CARD_MS * waitPace(c));
      return;
    }
    // 第一手由进桌时看完提示自己发，不给"下一手"
    drawBetween(s.between && v.handNo > 0 && c.animating === 0 && !s.busted && !c.asking && !pfOver);
    if (!v.hold) showBar.hide();
    else if (c.animating === 0) drawShow(v, `s${v.handNo}`, null);
    // 跟注提示只在单机桌（这里）给，设置里能关；好友房、锦标赛的 bar.update 不传（src/view/actions.ts）
    const auto = bar.update(v, c.animating === 0 && !s.closing, c.settings.hint);
    if (auto) {
      void drive(s.act(auto));
      return;
    }
    // 全下局不走新手指引（只有两个键，没什么可讲）
    if (!pfMode) f.guideTurn(v);
    if (v.hold && !pfMode) f.guideEnd(v);
    // 输光了：先让人看清这一手怎么输的，再问补码（全下局直接出结果卡）
    if (s.busted && c.animating === 0 && !c.asking && !bustTimer && !s.toppingUp && !pfMode) {
      bustTimer = window.setTimeout(() => {
        bustTimer = 0;
        if (c.solo === s && s.busted && c.animating === 0) void offerTopUp(true);
      }, END_CARD_MS * waitPace(c));
    }
  }

  async function onStep(st: Step): Promise<void> {
    // 坐下那一笔买入回话时牌桌还没摆出来，进桌时会整个摆一遍；离桌时电脑快进打完的那一手不用播
    if (!stage.classList.contains('at-table') || st.action?.t === 'leave') return;
    // 亮牌只翻牌：不收两手之间那一栏、不停自动下一手的倒数
    if (st.action?.t === 'show') return tableView.play(view(st.prev, ME), view(st.next, ME), st.seat, st.action);
    c.animating++;
    drawFf();
    bar.update(view(st.prev, ME), false);
    drawBetween(false);
    try {
      const prev = view(st.prev, ME);
      const next = view(st.next, ME);
      if (next.handNo !== prev.handNo) setText(handNo, handText(next));
      await tableView.play(prev, next, st.seat, st.action);
      record(prev, next);
      reads.observe(prev, next, who(prev));
      f.handDone(prev, next, ME);
      f.achHand(st, prev, next);
    } finally {
      c.animating--;
    }
    if (c.tour) f.tourNotes(c.tour);
    drawFf();
    const v = view(st.next, ME);
    bar.update(v, false);
    f.syncFun();
    // 轮到我了：提示音、振动、后台时标题闪（单机没有计时，不嘀嗒）
    if (v.toAct === ME) myTurn(`s${v.handNo}:${v.log.length}`);
    else notMyTurn();
  }

  /** 座位上是谁（看对手按它分开数：电脑换了性格、好友房换了人就重新数） */
  function who(v: View): (i: number) => string {
    const room = c.online?.state.room;
    return (i) => {
      const s = must(v.seats[i], '视图里每个座位号都有座位');
      const info = room?.seats[i];
      return `${i}:${s.owner === 'house' ? `h${s.persona}` : info?.kind === 'human' && info.name ? info.name : s.owner}`;
    };
  }

  /** 点了别人的名牌（关了互动、没坐下时点头像也是）：弹这一场的数（看对手） */
  function showRead(i: number): void {
    const v = f.curView();
    if (!v?.seats[i]) return;
    const r = reads.get(who(v)(i));
    tableView.showCard(i, styleTag(r), readLines(r));
  }

  /** 一手打完记战绩（云存档的 stats 槽）；me 是我坐的座位 */
  function record(prev: View, next: View, me = ME): void {
    const r = next.lastHand;
    if (!r || r.handNo !== prev.handNo || prev.phase === 'idle') return;
    const meSeat = prev.seats[me];
    if (!meSeat || meSeat.status === 'out') return;
    const won = r.pots.reduce((a, p) => a + (p.winners.find((w) => w.seat === me)?.won ?? 0), 0);
    const shown = r.byFold ? undefined : r.shown.find((x) => x.seat === me);
    const pot = r.pots.reduce((a, p) => a + p.amount, 0);
    c.cloud.update((s) => ({
      ...s,
      hands: s.hands + 1,
      won: s.won + (won > 0 ? 1 : 0),
      biggestPot: won > 0 ? Math.max(s.biggestPot, pot) : s.biggestPot,
      best: shown ? Math.max(s.best, shown.value) : s.best,
      showdowns: s.showdowns + (shown ? 1 : 0),
      showdownWins: s.showdownWins + (shown && won > 0 ? 1 : 0),
    }));
  }

  async function offerTopUp(busted: boolean): Promise<void> {
    const s = c.solo;
    if (!s || c.asking || s.toppingUp) return;
    const st = stakesOf(s.table.stakes);
    const stack = must(s.table.seats[ME], '单机桌一定有我的座位').stack;
    const room = st.max - stack;
    const bal = s.session.practice ? Infinity : (c.wallet?.balance ?? 0);
    const min = busted ? st.min : st.bb;
    if (bal < min || room < min) {
      // 补不了：直接结这一场，结算页里温和地说一句（快乐为主，docs/economy.md 第 0 节）
      if (busted) await leave();
      return;
    }
    c.asking = true;
    drawBetween(false);
    const amount = await askTopUp(stage, { min, max: Math.min(room, bal), step: st.bb, balance: s.session.practice ? 0 : bal, busted });
    c.asking = false;
    if (amount === null) {
      if (busted) await leave();
      else refresh();
      return;
    }
    const err = await s.topUp(amount);
    if (err && s.toppingUp) return waitTopUp(s);
    await toppedUp(s, err);
  }

  /** 补码办完了（补上了，或者钱包明确拒了） */
  async function toppedUp(s: Solo, err: string | null): Promise<void> {
    if (err) {
      await dialog(stage, '没补上', walletError(err), [{ label: '好', value: 'ok', primary: true }]);
      refresh();
      return;
    }
    void f.refreshWallet();
    await drive(s.flush());
  }

  /**
   * 补码时钱包连不上：钱可能已经扣了，牌桌停住等回话（Solo.toppingUp），弹窗说清楚在等什么、等了多久、最多等多久，不让人以为卡死了。
   * 等到了就接着打；等够了还没回话（或者人点了"先回大厅"），这一桌和那一笔留在本机，大厅里接着自动重试，点"接着打"回来
   */
  async function waitTopUp(s: Solo): Promise<void> {
    const body = document.createElement('div');
    const msg = el('p', '', body, '钱包连不上，补的筹码还没到。这笔筹码可能已经从钱包扣了，所以牌桌先停在这儿等它回话：连上了自动补上、接着打，不会重复扣。');
    const clock = el('p', 'sum-note', body);
    const t0 = Date.now();
    let closed = false;
    void dialog(stage, '补的筹码在路上', body, [{ label: '先回首页', value: 'lobby' }]).then(() => (closed = true));
    let err: string | null = null;
    while (!closed && s.toppingUp && Date.now() - t0 < TOPUP_WAIT_MS) {
      setText(clock, `已经等了 ${Math.round((Date.now() - t0) / 1000)} 秒，最多等 ${TOPUP_WAIT_MS / 1000} 秒`);
      await new Promise((r) => window.setTimeout(r, TOPUP_RETRY_MS));
      if (!closed) err = await s.settle();
    }
    if (!s.toppingUp) {
      if (!closed) closeDialog();
      return toppedUp(s, err);
    }
    if (!closed) {
      setText(msg, '等了一分钟，钱包还是连不上。先回首页：这一桌和这一笔补筹码记在本机，钱包连上后自动补上，点"接着打"回到这一桌。');
      setText(clock, '');
      await dialog(stage, '补的筹码在路上', body, [{ label: '回首页', value: 'lobby', primary: true }]);
    }
    if (c.solo !== s || !s.toppingUp) return refresh();
    stopCountdown();
    c.walletNote = '补的筹码还在路上：钱包连上后自动补上，点"接着打"回到这一桌';
    window.clearTimeout(c.retryTimer);
    c.retryTimer = window.setTimeout(() => void f.settlePending().then(f.drawLobby), RETRY_MS);
    f.showLobby();
  }

  /** 离桌回大厅：手里有牌就弃，筹码结回钱包。auto：止盈到了自动走，不问 */
  async function leave(auto = false): Promise<boolean> {
    const s = c.solo;
    if (!s) return true;
    const inHand = must(s.table.seats[ME], '单机桌一定有我的座位').status === 'active';
    if (!s.busted && !s.closing && !auto) {
      const back = s.session.practice ? '' : '桌上的筹码带回钱包。';
      const ok = await dialog(stage, '离桌', inHand ? `这一手会弃牌。${back}` : back || '回首页，这一桌就结束了。', [
        { label: '接着打', value: 'no', cancel: true },
        { label: '离桌', value: 'yes', danger: true },
      ]);
      if (ok !== 'yes') return false;
    }
    stopCountdown();
    toggle(betweenBar, 'hidden', true);
    const busted = s.busted;
    const err = await s.leave();
    if (s.toppingUp) {
      // 补码那一笔还没回话，先不走（钱包可能已经扣了，离桌的结回会把它覆盖掉）
      await dialog(stage, '先等补筹码', err === 'login' ? walletError('login') : '补的筹码还在路上：钱包连不上，这笔筹码可能已经扣了。等它回话再离桌，这一笔才不会丢；连上后自动补上。', [{ label: '好', value: 'ok', primary: true }]);
      refresh();
      return false;
    }
    await f.refreshWallet();
    // 这一场的结算页。今天德州 client 模式的净赢到了上限（docs/economy.md 第 4 节）：多赢的照常算在牌桌上，只是不进钱包
    const st = s.stats;
    // 称号：诈唬王、天选之人、跟注站按全桌；输赢只知道我的，赢了给"大赢家"，输了不点名（单机就一个真人）
    const titles = tally.titles(s.left > st.buyin ? [{ name: c.myName, net: s.left - st.buyin }] : []);
    const sum: SoloSummary = {
      practice: s.session.practice,
      buyin: st.buyin,
      out: s.closing || err ? null : s.left - s.capped,
      left: s.left,
      // 结回没办成：登录过期的等登录后再结；钱包明确拒了的（放太久已经退回、别处结过）照实说，不显示结回了多少
      ...(s.closing && err === 'login' ? { pending: '登录后自动带回钱包' } : {}),
      ...(err && !s.closing ? { refused: walletError(err) } : {}),
      hands: st.hands,
      won: st.won,
      best: st.best,
      capped: s.capped,
      busted,
      titles,
    };
    // 分享卡（仓库根 docs/social.md 1.1）：单独部署没有，还没打完一手的也不给
    await soloSummary(stage, site.standalone || !st.hands ? sum : { ...sum, share: shareIt(soloCard(sum, soloWhere(s), c.myName)) });
    if (err && s.closing) {
      c.walletNote = err === 'login' ? LOGIN_NOTE : '钱包暂时连不上：这一桌的筹码先记在本机，稍后会自动带回钱包';
      if (err !== 'login') c.retryTimer = window.setTimeout(() => void f.settlePending().then(f.drawLobby), RETRY_MS);
    } else {
      c.solo = null;
    }
    f.showLobby();
    return true;
  }

  return { enterTable, showMine, drawShow, nextHand, stopCountdown, drain, drawBetween, act, drive, refresh, onStep, who, showRead, record, offerTopUp, leave };
}
