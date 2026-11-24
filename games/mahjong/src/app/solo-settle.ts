/**
 * 单机一局、一场打完的结算弹窗：这一局的明细、一场的总结算和名次、每日成绩、擂台这一桌的结果、连输的一句，
 * 以及回选桌 / 分享 / 再来一局 / 下一桌。开局和牌桌回调在 solo-flow.ts，好友房的结算在 room-settle.ts。
 */
import type { Level } from '../ai/venues.ts';
import { isDailyVariant } from '../game/daily.ts';
import type { LadderMode } from '../game/ladder.ts';
import { stakesOf, type StakesId } from '../game/stakes.ts';
import type { Solo, SoloView } from '../solo.ts';
import { closeDialog, dialog } from '../view/dialog.ts';
import { dailyCard, dailyLine } from '../view/daily.ts';
import { button, el } from '../view/dom.ts';
import { END_SPLIT, paginate } from '../view/pager.ts';
import { ladderEnd } from '../view/ladder.ts';
import { fameSummary } from '../view/summary.ts';
import { play } from '../view/sound.ts';
import { cheerLine, easierLevel, LEVEL_NAME, num, STAKES_NAME, walletError } from '../view/text.ts';
import { pageOf } from '../view/variants/pages.ts';
import { userIdOf } from './identity.ts';
import { prefs } from './prefs.ts';
import { bumpRecord, recordStreak } from './record.ts';
import { ladderPage, lobby } from './routes.ts';
import { session } from './session.ts';
import { cardButton, matchBody, settle, showMine } from './settle.ts';
import { stage } from './shell.ts';
import { playLadder, startDaily, startLadder, startSolo } from './solo-flow.ts';

/** "再来一场"（降级后换低一档难度重开，见下面调用处）：同一个玩法、上次的规则设置 */
function startAgain(stakes: StakesId, variant: string, level: Level = prefs.level): Promise<void> {
  return startSolo(stakes, pageOf(variant).rulesOf(prefs), level, variant);
}

/** 这一场钱包带回的那句（settled 先到、结算弹窗后画时用） */
const SETTLED = new WeakMap<Solo, string>();

/** 钱包带回的话到了（solo-flow.ts 的 settled）：记下来给还没画的结算弹窗 */
export function noteSettled(s: Solo, text: string): void {
  SETTLED.set(s, text);
}

/** 一局打完（一场还没完）：结算加"下一局" */
export function roundEndDialog(v: SoloView, names: string[], unit: string): void {
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
export function matchEndDialog(mine: Solo, v: SoloView, names: string[], unit: string): void {
  const page = pageOf(v.variant);
  const net = v.result?.seats[v.me!.seat]?.net ?? 0;
  let single = false;
  dialog(stage, 'end', (box) => {
    // 内容放进翻页区，按钮行在它下面、一直看得见（view/pager.ts）
    // 钱包带回的那句放在翻页区上面，哪一页都看得见；等钱包回话才有准话，先占一行，不然字来了把翻页区挤矮
    if (stakesOf(mine.stakes)?.wallet) el('div', 'settle-note', box, SETTLED.get(mine) ?? '正在带回钱包……');
    verdict(box, v, names, unit, net);
    const body = el('div', 'end-body', box);
    const lad = mine.save.ladder;
    let ladder = null as ReturnType<typeof ladderEnd> | null;
    // 每日成绩、擂台这一桌的结果夹在名次和明细中间：结算长了要翻页，放末尾会被翻到后面几页
    single = matchBody(body, v.history.length, page.matchSummary(v, names, unit), page.roundSummary(v, names, unit), () => {
      if (mine.save.daily && isDailyVariant(v.variant)) body.appendChild(dailyLine(v.variant, mine.save.daily, net, mine.save.id ?? '', userIdOf(session.platformInfo)));
      if (lad) ladder = ladderEnd(body, mine.save.id ?? '', lad.mode, lad.table, net);
    });
    if (session.fame.length) body.appendChild(fameSummary(session.fame, names));
    cheer(body, mine, net);
    endActions(box, mine, v, net, ladder?.outcome ?? null);
    paginate(body, 0, END_SPLIT);
  }, false);
  if (!single) showMine();
  play(net >= 0 ? 'win' : 'lose');
}

/** 一场打完的按钮行：回选桌（擂台回擂台）、分享卡，再加下一步（擂台下一桌 / 每日再练一次 / 再来一局） */
function endActions(box: HTMLElement, mine: Solo, v: SoloView, net: number, ladderOutcome: string | null): void {
  const page = pageOf(v.variant);
  const lad = mine.save.ladder;
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
  if (lad) ladderNext(row, lad.mode, ladderOutcome);
  else if (dv)
    button('act go', row, '再练一次', () => {
      closeDialog();
      void startDaily(dv);
    });
  else againButton(box, row, mine);
}

/**
 * 结算页最上面一行：第几名、赢了输了多少，底下再用一句大白话说为什么（玩法的 verdictWhy，说不清不写）。
 * 放在翻页区外面，哪一页都看得见；新手第一局最想知道的就是这两件事（输了只看到一屏流水）
 */
function verdict(box: HTMLElement, v: SoloView, names: string[], unit: string, net: number): void {
  const seats = v.result?.seats;
  const me = v.me?.seat;
  if (!seats || me === undefined) return;
  const rank = 1 + seats.filter((s) => s.net > net).length;
  const top = el('div', `verdict ${net > 0 ? 'up' : net < 0 ? 'down' : ''}`, box);
  el('b', 'rank', top, `第 ${rank} 名`);
  el('b', 'net', top, net === 0 ? '打平' : `${net > 0 ? '赢' : '输'} ${num(Math.abs(net))}${unit}`);
  const why = pageOf(v.variant).verdictWhy?.(v, me, names);
  if (why) el('p', 'why', top, why);
}

/** 擂台一桌打完的下一步：赢了下一桌、输了再开一轮；打通了只留"回擂台" */
function ladderNext(row: HTMLElement, mode: LadderMode, outcome: string | null): void {
  const go = (label: string, f: () => Promise<void>): void => {
    button('act go big', row, label, () => {
      closeDialog();
      void f();
    }).dataset.act = 'ladder';
  };
  if (outcome === 'next') go('下一桌', playLadder);
  else if (outcome === 'out') go('再开一轮', () => startLadder(mode));
}

/**
 * 一场打完后的"再来一局"：同玩法、同档位、同难度、同规则，一键开新的（走和主页开打同一个 startSolo，实盘照样先带入一份）。
 * 钱包不够一份时按钮灰掉，底下写原因；带回钱包后余额刷新（settled → syncAgain）会重新判断。电脑上按回车也能开
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
export function syncAgain(): void {
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
