/**
 * 单机：开局（含实盘带入）、接着打上一场、牌桌的画面回调、每日挑战、茶馆擂台的一桌。
 * 一局和一场打完的结算弹窗、再来一局在 solo-settle.ts（好友房那边对应 room-flow.ts / room-settle.ts）。
 * 规则在 src/core，单机的推进在 src/solo.ts，这里把它们和画面、钱包连起来；各玩法不同的东西一律经 pageOf(玩法)。
 */
import { readText } from '../storage.ts';
import { localChat } from 'arcade-kit/chat';
import { PERSONAS } from '../ai/personas.ts';
import type { Level } from '../ai/venues.ts';
import { DEFAULT_VARIANT } from '../core/variants/index.ts';
import { coachAllowed } from '../game/coach.ts';
import { dexKey } from '../game/dex.ts';
import { bindSolo, levelOf, quitRun, startRun, tableKey, type LadderMode } from '../game/ladder.ts';
import { stakesOf, type StakesId } from '../game/stakes.ts';
import { randomId, type WalletReply } from '../net/wallet.ts';
import { loadSolo, newSolo, Solo, unsettled, type SoloAction, type SoloView } from '../solo.ts';
import { closeDialog, confirmBox } from '../view/dialog.ts';
import { recordAch } from '../view/achieve.ts';
import { todayCN } from '../view/daily.ts';
import { el } from '../view/dom.ts';
import { recordDex } from '../view/dex.ts';
import { guideKey, rotateTip, showGuide } from '../view/guide.ts';
import { ladderTitle, readLadder, writeLadder } from '../view/ladder.ts';
import { play } from '../view/sound.ts';
import type { SeatMeta } from '../view/table.ts';
import { LEVEL_NAME, num, walletError } from '../view/text.ts';
import type { AnyOpts } from '../view/variants/page.ts';
import { ladderChoiceOf, pageOf } from '../view/variants/pages.ts';
import { alertTurn, dropFun, feed, newFun, publicMoments, refreshFun } from './fun.ts';
import { prefs, savePrefs } from './prefs.ts';
import { homePage, ladderPage, lobby } from './routes.ts';
import { session } from './session.ts';
import { paintTop, screen, stage, title, toast } from './shell.ts';
import { TIMING } from './timing.ts';
import { matchEndDialog, noteSettled, roundEndDialog, syncAgain } from './solo-settle.ts';
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

/** 上一场实盘还没带回钱包：先结了再开，不然新的一场会盖掉它的存档；false 是不开了（没同意、没结上） */
async function settleBeforeNew(): Promise<boolean> {
  const old = loadSolo();
  if (!unsettled(old)) return true;
  if (!(await confirmBox(stage, '上一场实盘还没结算完。先把上一场的筹码带回钱包，再开新的一场？', '先结算', '不了', false))) return false;
  const r = await new Solo(old!, quietUi).finish();
  if (!old!.done) {
    showError(`上一场还没结上：${walletError(r && !r.ok ? r.error : 'network').text}`);
    return false;
  }
  return true;
}

export async function startSolo(stakes: StakesId, opts: AnyOpts, level: Level = prefs.level, variant: string = DEFAULT_VARIANT, daily?: string, keepRules = false): Promise<void> {
  if (!daily) rememberChoice(stakes, opts, level, variant, keepRules);
  // 实盘一局一结：川麻 1 局、立直一局，不看存着的规则设置。
  // 回来接着打的老存档（8 局、半庄）带着自己的规则，不走这里
  if (stakesOf(stakes)?.wallet) opts = pageOf(variant).realOpts(opts);
  if (!(await settleBeforeNew())) return;
  const st = stakesOf(stakes)!;
  const chips = st.share;
  if (!st.wallet) return playSolo(new Solo(newSolo(stakes, opts, session.myName, null, chips, level, variant, daily), soloUi));
  // 实盘只带整份：底分和"最多赢 3 份"按整份算，少带等于输得少、赢得一样多
  if (!(await checkFunds(chips))) return;
  // 带入前先存"带入中"（ref、操作号），回包丢了下次用同一个号重发
  const save = newSolo(stakes, opts, session.myName, randomId(), chips, 'easy', variant);
  save.buying = { op: randomId(), amount: chips };
  const s = new Solo(save, soloUi);
  const r = await s.buyin();
  if (!r.ok) return buyinFailed(r);
  if (r.wallet) session.wallet = r.wallet;
  playSolo(s);
}

/** 选桌页"接着打上一场"：带入还没确认的先确认；已经离开、只差带回的只带回、不接着打 */
export async function resumeSolo(): Promise<void> {
  const save = loadSolo();
  if (!save) return;
  const s = new Solo(save, soloUi);
  if (save.settle) return settleLeftover(s);
  if (save.buying) {
    const r = await s.buyin();
    if (!r.ok) {
      lobby();
      // 少带开的、带入一直没确认的存档：现在只收整份，重发被拒，这一场已经作废（buyin 里标了 done）。
      // 当时要是扣了，那一份到期（24 小时）平台原样退回
      if (r.error === 'bad_amount') return showError('上一场是按旧规矩少带筹码开的，现在实盘只能带整份，那一场作废了。当时要是扣了筹码，24 小时内会原样退回钱包。重新开一局吧。');
      return buyinFailed(r);
    }
  }
  playSolo(s);
}

/** 上一场已经离开、带回没成：再结一次，成了说一声 */
export async function settleLeftover(s: Solo): Promise<void> {
  const r = await s.finish();
  if (screen.classList.contains('lobby')) lobby(false, session.lobbyMode);
  else if (screen.classList.contains('front')) homePage();
  if (r?.ok) toast('上一场的筹码已经带回钱包');
  else if (r) toast(`上一场的筹码还没结上：${walletError(r.error).text}`);
}

/** 不画牌桌的单机（结旧的一场用）：带回的结果由调用的人说 */
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

// ---------- 牌桌 ----------

/** 单机牌桌的画面回调：每一步重画、一局打完弹结算、实盘带回后提示 */
const soloUi = {
  think(seat: number, ms: number): void {
    session.table?.think(seat, ms);
  },
  frame(v: SoloView, names: string[]): void {
    if (!session.table) return;
    const solo = session.solo;
    session.table.render({ v: pageOf(v.variant).tableView(v), seats: names.map((name, i): SeatMeta => ({ name, bot: i !== 0 })) });
    refreshFun();
    recordDex(v.events, 0, dexKey(solo?.save.id ?? 'solo', v, v.events, 0));
    recordAch(v, 0, solo?.save.id ?? 'solo');
    publicMoments(v, names, true);
    if (solo && !stakesOf(solo.stakes)?.wallet) feed(solo, v, 0);
    alertTurn(v);
  },
  roundEnd(v: SoloView, names: string[]): void {
    const unit = stakesOf(session.solo?.stakes)?.wallet ? '' : ' 分';
    // 停一下再弹结算：这期间回了选桌、又开了新的一场，就不弹到新牌桌上
    const mine = session.solo;
    // 立直有人胡了时，胡牌亮牌（役一条条弹出来）要多摆一会儿再弹结算
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
      ? `已带回钱包${r.credited !== undefined ? ` ${num(r.credited)}` : ''}${r.capped ? `；今天单机实盘赢够了，多出的 ${num(r.capped)} 没进钱包，好友房不限` : ''}`
      : walletError(r.error).text;
    // 钱包常常比结算弹窗先回话（弹窗要等亮牌演完）：记下来，弹窗画的时候直接用，不然那行一直停在"正在带回"
    if (session.solo) noteSettled(session.solo, text);
    if (box) box.textContent = text;
    void refreshWallet().then(syncAgain);
  },
};

// ---------- 开打 ----------

/** 顶栏标题：玩法名单独一段（竖屏顶栏放不下时 CSS 藏掉它，留下档位，不缩字），后面是档位或难度 */
function paintSoloTitle(s: Solo): void {
  const st = stakesOf(s.stakes)!;
  title.replaceChildren();
  const variant = s.save.state.variant;
  const name = pageOf(variant).name((s.save.state as { opts?: { flow?: boolean } }).opts);
  el('span', 'var', title, `${name} · `);
  // 竖屏放不下全名：只写两个字「血战」「血流」「三人」「立直」，血战、血流规则不一样，手机上也得看得出在打哪种；四个字时 390 宽连难度都挤掉
  el('span', 'var-short', title, `${name.split('·').at(-1)!.slice(0, 2)} · `);
  if (st.wallet) title.append(`实盘 ${num(st.share)}`);
  else if (s.save.ladder) {
    title.append(ladderTitle(s.save.ladder.table));
    el('span', 'lv', title, ` · ${LEVEL_NAME[s.save.level ?? 'easy']}`);
  } else {
    // 竖屏放不下"血战 · 娱乐 · 新手"（360 宽差 20 像素）：CSS 藏掉"娱乐"和难度前面那个点，留"血战 · 新手"（删字不截；实盘写"实盘 1,000"，分得开）
    el('span', 'kind', title, '娱乐');
    const lv = el('span', 'lv', title);
    el('span', 'dot', lv, ' · ');
    lv.append(LEVEL_NAME[s.save.level ?? 'easy']);
  }
}

function playSolo(s: Solo): void {
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
  // 单机也能说话（过滤、限速和房间一样，只在本地冒气泡）。我永远是 0 号座位；
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
