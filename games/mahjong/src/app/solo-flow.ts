/**
 * 单机：开局（含实盘带入）、接着打上一场、牌桌的画面回调、一局和一场打完的结算、再来一局、每日挑战、茶馆擂台的一桌。
 * 规则在 src/core，单机的推进在 src/solo.ts，这里把它们和画面、钱包连起来；各玩法不同的东西一律经 pageOf(玩法)。
 */
import { readText } from '../storage.ts';
import { localChat } from 'arcade-kit/chat';
import { PERSONAS } from '../ai/personas.ts';
import type { Level } from '../ai/venues.ts';
import { DEFAULT_VARIANT } from '../core/variants/index.ts';
import { coachAllowed } from '../game/coach.ts';
import { dexKey } from '../game/dex.ts';
import { isDailyVariant } from '../game/daily.ts';
import { bindSolo, levelOf, quitRun, startRun, tableKey, type LadderMode } from '../game/ladder.ts';
import { stakesOf, type StakesId } from '../game/stakes.ts';
import { randomId, type WalletReply } from '../net/wallet.ts';
import { loadSolo, newSolo, Solo, unsettled, type SoloAction, type SoloView } from '../solo.ts';
import { closeDialog, confirmBox, dialog } from '../view/dialog.ts';
import { recordAch } from '../view/achieve.ts';
import { dailyCard, dailyLine, todayCN } from '../view/daily.ts';
import { button, el } from '../view/dom.ts';
import { END_SPLIT, paginate } from '../view/pager.ts';
import { recordDex } from '../view/dex.ts';
import { guideKey, rotateTip, showGuide } from '../view/guide.ts';
import { ladderEnd, ladderTitle, readLadder, writeLadder } from '../view/ladder.ts';
import { fameSummary } from '../view/summary.ts';
import { play } from '../view/sound.ts';
import type { SeatMeta } from '../view/table.ts';
import { cheerLine, easierLevel, LEVEL_NAME, num, STAKES_NAME, walletError } from '../view/text.ts';
import type { AnyOpts } from '../view/variants/page.ts';
import { ladderChoiceOf, pageOf } from '../view/variants/pages.ts';
import { alertTurn, dropFun, feed, newFun, publicMoments } from './fun.ts';
import { prefs, savePrefs } from './prefs.ts';
import { bumpRecord, recordStreak } from './record.ts';
import { userIdOf } from './identity.ts';
import { homePage, ladderPage, lobby } from './routes.ts';
import { session } from './session.ts';
import { cardButton, matchBody, settle, showMine } from './settle.ts';
import { paintTop, screen, stage, title, toast } from './shell.ts';
import { TIMING } from './timing.ts';
import { buyinFailed, checkFunds, refreshWallet, showError } from './wallet.ts';

/** 冒烟用：?turbo 让电脑几乎不停顿（npm run smoke） */
const TURBO = new URLSearchParams(location.search).has('turbo');

// ---------- 开局 ----------

/** 记下这次选的档位、难度、玩法和规则设置（每日挑战的规则是固定的，不改玩家平时选的） */
function rememberChoice(stakes: StakesId, opts: AnyOpts, level: Level, variant: string, keepRules: boolean): void {
  prefs.stakes = stakes;
  prefs.level = level;
  // 实盘固定一局、主页的"快速一局"也固定一局，都不写进"平时的规则设置"（那是选桌页娱乐用的）
  if (!stakesOf(stakes)?.wallet && !keepRules) pageOf(variant).setRules(prefs, opts);
  if (variant !== DEFAULT_VARIANT) prefs.variant = variant;
  savePrefs();
}

/** 上一场实盘还没结回钱包：先结了再开，不然新的一场会盖掉它的存档（自审 C1）；false 是不开了（没同意、没结上） */
async function settleBeforeNew(): Promise<boolean> {
  const old = loadSolo();
  if (!unsettled(old)) return true;
  if (!(await confirmBox(stage, '上一场实盘还没结算完。先把上一场的筹码结回钱包，再开新的一场？', '先结算', '不了'))) return false;
  const r = await new Solo(old!, quietUi).finish();
  if (!old!.done) {
    showError(`上一场还没结上：${walletError(r && !r.ok ? r.error : 'network').text}`);
    return false;
  }
  return true;
}

export async function startSolo(stakes: StakesId, opts: AnyOpts, level: Level = prefs.level, variant: string = DEFAULT_VARIANT, daily?: string, keepRules = false): Promise<void> {
  if (!daily) rememberChoice(stakes, opts, level, variant, keepRules);
  // 实盘一局一结（2026-10-30，一次买入到结算 3–6 分钟）：川麻 1 局、立直一局，不看存着的规则设置。
  // 回来接着打的老存档（8 局、半庄）带着自己的规则，不走这里
  if (stakesOf(stakes)?.wallet) opts = pageOf(variant).realOpts(opts);
  if (!(await settleBeforeNew())) return;
  const st = stakesOf(stakes)!;
  const chips = st.share;
  if (!st.wallet) return playSolo(new Solo(newSolo(stakes, opts, session.myName, null, chips, level, variant, daily), soloUi));
  // 实盘只带整份（0.15.1）：底分和"最多赢 3 份"按整份算，少带等于输得少、赢得一样多
  if (!(await checkFunds(chips))) return;
  // 带入前先存"带入中"（ref、操作号），回包丢了下次用同一个号重发（自审 C3）
  const save = newSolo(stakes, opts, session.myName, randomId(), chips, 'easy', variant);
  save.buying = { op: randomId(), amount: chips };
  const s = new Solo(save, soloUi);
  const r = await s.buyin();
  if (!r.ok) return buyinFailed(r);
  if (r.wallet) session.wallet = r.wallet;
  playSolo(s);
}

/** 选桌页"接着打上一场"：带入还没确认的先确认；已经离开、只差结回的只结回、不接着打（自审 C2、C3） */
export async function resumeSolo(): Promise<void> {
  const save = loadSolo();
  if (!save) return;
  const s = new Solo(save, soloUi);
  if (save.settle) return settleLeftover(s);
  if (save.buying) {
    const r = await s.buyin();
    if (!r.ok) {
      lobby();
      // 0.15.1 以前少带开的、带入一直没确认的存档：现在只收整份，重发被拒，这一场已经作废（buyin 里标了 done）。
      // 当时要是扣了，那一份到期（24 小时）平台原样退回
      if (r.error === 'bad_amount') return showError('上一场是按旧规矩少带筹码开的，现在实盘只能带整份，那一场作废了。当时要是扣了筹码，24 小时内会原样退回钱包。重新开一局吧。');
      return buyinFailed(r);
    }
  }
  playSolo(s);
}

/** 上一场已经离开、结回没成：再结一次，成了说一声 */
export async function settleLeftover(s: Solo): Promise<void> {
  const r = await s.finish();
  if (screen.classList.contains('lobby')) lobby(false, session.lobbyMode);
  else if (screen.classList.contains('front')) homePage();
  if (r?.ok) toast('上一场的筹码已经结回钱包');
  else if (r) toast(`上一场的筹码还没结上：${walletError(r.error).text}`);
}

/** 不画牌桌的单机（结旧的一场用）：结回的结果由调用的人说 */
export const quietUi = {
  frame(): void {},
  roundEnd(): void {},
  settled(): void {
    void refreshWallet();
  },
};

/**
 * 茶馆擂台（game/ladder.ts）：打这一轮正在打的那一桌。单机存档还是这一桌就接着打；对不上（被别的单机盖了）就按同一副牌重开这一桌。
 * 娱乐、按桌号定难度、默认规则的短局，不改玩家平时的档位和规则设置
 */
export async function playLadder(): Promise<void> {
  const d = readLadder();
  const run = d.run;
  if (!run) return ladderPage();
  const save = loadSolo();
  if (save && run.solo && save.id === run.solo && !save.done) return resumeSolo();
  if (!(await settleBeforeNew())) return;
  const { page, choice } = ladderChoiceOf(run.mode);
  const fresh = newSolo('fun', choice.ladder.opts(), session.myName, null, stakesOf('fun')!.share, levelOf(run), page.id, undefined, {
    mode: run.mode,
    table: run.table,
    key: tableKey(run),
  });
  writeLadder(bindSolo(d, fresh.id!));
  playSolo(new Solo(fresh, soloUi));
}

/** 开一轮新的擂台（有没打完的一轮由擂台页先问过） */
export function startLadder(mode: LadderMode): Promise<void> {
  writeLadder(startRun(readLadder(), mode, [...crypto.getRandomValues(new Uint32Array(8))]));
  return playLadder();
}

/** 放弃这一轮擂台 */
export function quitLadder(): void {
  writeLadder(quitRun(readLadder()));
}

/** 每日挑战：娱乐普通档、固定长度（川麻 4 局、立直东风战），种子按今天（北京时间）和玩法定 */
export function startDaily(variant: string): Promise<void> {
  return startSolo('fun', pageOf(variant).daily.opts(), 'normal', variant, todayCN());
}

/** "再来一场"（降级后换低一档难度重开，见下面调用处）：同一个玩法、上次的规则设置 */
function startAgain(stakes: StakesId, variant: string, level: Level = prefs.level): Promise<void> {
  return startSolo(stakes, pageOf(variant).rulesOf(prefs), level, variant);
}

// ---------- 牌桌 ----------

/** 单机牌桌的画面回调：每一步重画、一局打完弹结算、实盘结回后提示 */
export const soloUi = {
  think(seat: number, ms: number): void {
    session.table?.think(seat, ms);
  },
  frame(v: SoloView, names: string[]): void {
    if (!session.table) return;
    const solo = session.solo;
    session.table.render({ v: pageOf(v.variant).tableView(v), seats: names.map((name, i): SeatMeta => ({ name, bot: i !== 0 })) });
    session.fun?.refresh();
    recordDex(v.events, 0, dexKey(solo?.save.id ?? 'solo', v, v.events, 0));
    recordAch(v, 0, solo?.save.id ?? 'solo');
    publicMoments(v, names, true);
    if (solo && !stakesOf(solo.stakes)?.wallet) feed(solo, v, 0);
    alertTurn(v);
  },
  roundEnd(v: SoloView, names: string[]): void {
    const unit = stakesOf(session.solo?.stakes)?.wallet ? '' : ' 分';
    // 停一下再弹结算：这期间回了选桌、又开了新的一场，就不弹到新牌桌上（自审 C8）
    const mine = session.solo;
    // 立直有人和了时，和牌亮牌（役一条条弹出来）要多摆一会儿再弹结算
    const wait = pageOf(v.variant).soloEndMs(v);
    window.setTimeout(() => {
      if (!session.solo || session.solo !== mine) return;
      if (v.phase === 'over') matchEndDialog(mine, v, names, unit);
      else roundEndDialog(v, names, unit);
    }, TURBO ? 50 : wait * (prefs.fast ? 0.5 : 1));
  },
  settled(r: WalletReply): void {
    if (r.ok) play('chips');
    const box = document.querySelector('.settle-note');
    const text: string = r.ok
      ? `已结回钱包${r.credited !== undefined ? ` ${num(r.credited)}` : ''}${r.capped ? `；今天单机实盘赢够了，多出的 ${num(r.capped)} 没进钱包，好友房不限` : ''}`
      : walletError(r.error).text;
    // 钱包常常比结算弹窗先回话（弹窗要等亮牌演完）：记下来，弹窗画的时候直接用，不然那行一直停在"正在结回"
    if (session.solo) SETTLED.set(session.solo, text);
    if (box) box.textContent = text;
    void refreshWallet().then(syncAgain);
  },
};

/** 这一场钱包结回的那句（settled 先到、结算弹窗后画时用） */
const SETTLED = new WeakMap<Solo, string>();

/** 一局打完（一场还没完）：结算加"下一局" */
function roundEndDialog(v: SoloView, names: string[], unit: string): void {
  dialog(stage, 'end', (box) => {
    const body = el('div', 'end-body', box);
    settle(body, pageOf(v.variant).roundSummary(v, names, unit));
    button('act go', el('div', 'row end-acts', box), '下一局', () => {
      closeDialog();
      session.solo?.next();
    });
    paginate(body);
  }, false);
}

/** 一场打完：这一局的结算、一场的总结算、每日成绩、名场面、连输的一句，和回选桌 / 分享 / 再来一局 */
function matchEndDialog(mine: Solo, v: SoloView, names: string[], unit: string): void {
  const page = pageOf(v.variant);
  const net = v.result?.seats[v.me!.seat]?.net ?? 0;
  let single = false;
  dialog(stage, 'end', (box) => {
    // 内容放进翻页区，按钮行在它下面、一直看得见（view/pager.ts）
    // 钱包结回的那句放在翻页区上面，哪一页都看得见；等钱包回话才有准话，先占一行，不然字来了把翻页区挤矮
    if (stakesOf(mine.stakes)?.wallet) el('div', 'settle-note', box, SETTLED.get(mine) ?? '正在结回钱包……');
    const body = el('div', 'end-body', box);
    const lad = mine.save.ladder;
    let ladder = null as ReturnType<typeof ladderEnd> | null;
    // 每日成绩、擂台这一桌的结果夹在名次和明细中间：结算长了要翻页，放末尾会被翻到后面几页（11-02 冒烟）
    single = matchBody(body, v.history.length, page.matchSummary(v, names, unit), page.roundSummary(v, names, unit), () => {
      if (mine.save.daily && isDailyVariant(v.variant)) body.appendChild(dailyLine(v.variant, mine.save.daily, net, mine.save.id ?? '', userIdOf(session.platformInfo)));
      if (lad) ladder = ladderEnd(body, mine.save.id ?? '', lad.mode, lad.table, net);
    });
    if (session.fame.length) body.appendChild(fameSummary(session.fame, names));
    cheer(body, mine, net);
    const row = el('div', 'row end-acts', box);
    button('act soft', row, lad ? '回擂台' : '回选桌', () => {
      closeDialog();
      if (lad) ladderPage();
      else lobby();
    });
    const st = stakesOf(mine.stakes)!;
    const kind = st.wallet ? `实盘${STAKES_NAME[st.id]}档` : `娱乐·${LEVEL_NAME[mine.save.level ?? 'easy']}`;
    const url = `${location.origin}${location.pathname}`;
    const dv = mine.save.daily && isDailyVariant(v.variant) ? v.variant : null;
    if (dv) cardButton(row, dailyCard(dv, mine.save.daily!, net, mine.save.id ?? ''), url);
    else cardButton(row, page.shareCard(v, { title: `${kind} · ${page.lengthText(v.opts)}`, unit: st.wallet ? '筹码' : '分', name: session.myName, fame: session.fame }), url);
    // 每日局再来一场就是同一副牌练习（不计成绩），不跳成平时设置的单机
    const daily = mine.save.daily;
    if (lad) ladderNext(row, lad.mode, ladder?.outcome ?? null);
    else if (daily && isDailyVariant(v.variant)) {
      const dv2 = v.variant;
      button('act go', row, '再练一次', () => {
        closeDialog();
        void startDaily(dv2);
      });
    } else againButton(box, row, mine);
    paginate(body, 0, END_SPLIT);
  }, false);
  if (!single) showMine();
  play(net >= 0 ? 'win' : 'lose');
}

/** 擂台一桌打完的下一步：赢了下一桌、能重打就重打、输了再开一轮；打通了只留"回擂台" */
function ladderNext(row: HTMLElement, mode: LadderMode, outcome: string | null): void {
  const go = (label: string, f: () => Promise<void>): void => {
    button('act go big', row, label, () => {
      closeDialog();
      void f();
    }).dataset.act = 'ladder';
  };
  if (outcome === 'next') go('下一桌', playLadder);
  else if (outcome === 'retry') go('重打这一桌', playLadder);
  else if (outcome === 'out') go('再开一轮', () => startLadder(mode));
}

/**
 * 一场打完后的"再来一局"：同玩法、同档位、同难度、同规则，一键开新的（走和主页开打同一个 startSolo，实盘照样先带入一份）。
 * 钱包不够一份时按钮灰掉，底下写原因；结回钱包后余额刷新（settled → syncAgain）会重新判断。电脑上按回车也能开
 */
function againButton(box: HTMLElement, row: HTMLElement, mine: Solo): void {
  const save = mine.save;
  const go = (): void => {
    document.removeEventListener('keydown', onKey);
    closeDialog();
    // 照这一场的规则再开（快速一局再来还是一局），不改选桌页里平时的规则设置
    void startSolo(save.stakes, save.state.opts, save.level ?? prefs.level, save.state.variant, undefined, true);
  };
  const b = button('act go big again-go', row, '再来一局', go);
  el('p', 'room-hint again-why', box).hidden = true;
  const onKey = (e: KeyboardEvent): void => {
    if (!b.isConnected) return document.removeEventListener('keydown', onKey);
    const t = e.target as HTMLElement | null;
    if (e.key !== 'Enter' || e.repeat || b.disabled || (t && /^(BUTTON|INPUT|TEXTAREA|A|SELECT)$/.test(t.tagName)) || document.querySelector('.mask.confirm')) return;
    e.preventDefault();
    b.click();
  };
  document.addEventListener('keydown', onKey);
  syncAgain();
}

/** "再来一局"够不够钱：实盘余额不到一份就灰掉（钱包没读到不拦，开打时 startSolo 会说原因） */
function syncAgain(): void {
  const b = document.querySelector<HTMLButtonElement>('.again-go');
  const why = document.querySelector<HTMLElement>('.again-why');
  const st = stakesOf(session.solo?.stakes);
  if (!b || !why || !st) return;
  const short = !!st.wallet && !!session.wallet && session.wallet.balance < st.share;
  b.disabled = short;
  why.hidden = !short;
  if (short) why.textContent = walletError('no_funds').text;
}

/**
 * 单机连输时结算页说一句（不嘲讽），娱乐局再给"换到轻松一档"（DESIGN.md 第 7 节）。只换难度，不改牌、不放水：
 * 每一档的电脑本来就是那么强，公平底线不动
 */
function cheer(box: HTMLElement, s: Solo, net: number): void {
  bumpRecord(s.save.id ?? '', net);
  const streak = recordStreak(s.save.id ?? '', net);
  if (!streak) return;
  const line = cheerLine(streak.n);
  if (!line) return;
  const c = el('div', 'cheer', box);
  el('p', '', c, line);
  // 擂台每桌的难度是定的，不给换档
  const lower = stakesOf(s.stakes)?.wallet || s.save.ladder ? null : easierLevel(s.save.level ?? 'easy');
  if (lower)
    button('act soft', c, `换到${LEVEL_NAME[lower]}档再来一场`, () => {
      closeDialog();
      void startAgain('fun', s.save.state.variant, lower);
    });
}

// ---------- 开打 ----------

/** 顶栏标题：玩法名单独一段（竖屏顶栏放不下时 CSS 藏掉它，留下档位，不缩字），后面是档位或难度 */
function paintSoloTitle(s: Solo): void {
  const st = stakesOf(s.stakes)!;
  title.replaceChildren();
  const variant = s.save.state.variant;
  el('span', 'var', title, `${pageOf(variant).name((s.save.state as { opts?: { flow?: boolean } }).opts)} · `);
  if (st.wallet) title.append(`实盘 ${num(st.share)}`);
  else if (s.save.ladder) {
    title.append(ladderTitle(s.save.ladder.table));
    el('span', 'lv', title, ` · ${LEVEL_NAME[s.save.level ?? 'easy']}`);
  } else {
    // 难度也单独一段：320 宽竖屏连"娱乐·新手"都放不下，藏掉难度只留"娱乐"（删字不截，10-20 多尺寸）
    title.append('娱乐');
    el('span', 'lv', title, ` · ${LEVEL_NAME[s.save.level ?? 'easy']}`);
  }
}

export function playSolo(s: Solo): void {
  session.solo = s;
  s.speed = TURBO ? 0.01 : prefs.fast ? TIMING.fastScale : 1;
  paintTop();
  closeDialog();
  screen.className = 'screen game';
  screen.replaceChildren();
  paintSoloTitle(s);
  const variant = s.save.state.variant;
  const act = (a: SoloAction): void => {
    const err = s.act(a);
    if (err && err !== 'busy') play('click');
  };
  const table = pageOf(variant).mountTable(screen, act);
  session.table = table;
  table.setCoach(prefs.coach && coachAllowed(s.save));
  rotateTip(stage);
  session.lastPrompt = false;
  session.fame = [];
  dropFun();
  const kinds = s.save.state.kinds;
  const personas = s.save.state.personas;
  // 单机没有房间：自己发的直接交回组件播，电脑怎么回由组件按 kit 的 botReact 算
  // 单机也能说话（kit 0.18.1 的 localChat：过滤、限速和房间一样，只在本地冒气泡）。我永远是 0 号座位；
  // 说的话只交给 TableFun 显示，不进 Solo、不给电脑（电脑不读聊天，公平）
  session.fun = newFun(
    table,
    () => 0,
    (seat) => (kinds[seat] === 'ai' ? (PERSONAS[personas[seat]!]?.fun ?? 'normal') : null),
    (id, to) => session.fun?.receive(0, id, to),
    'solo',
    true,
    localChat((text, masked) => session.fun?.chat(0, text, masked)),
  );
  // 第一次打这个玩法：先出说明，牌局画好但电脑不动，说明关掉才开打（不然电脑在说明后面照打、"吃/过"压在底下）。
  // 只有单机这样：好友房、匹配桌不弹说明，整桌不会因为一个人停
  const tutor = !readText(guideKey(variant));
  s.resume(!tutor);
  if (tutor) showGuide(stage, 0, () => session.solo === s && s.resume(), variant);
}
