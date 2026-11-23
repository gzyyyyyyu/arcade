/**
 * 快速匹配（kit 的 MatchClient，设计在 kit 的 docs/match.md）：选桌页"快速匹配"按这一档排队，
 * 一张卡写"已有几人、还剩几秒"；排到了照好友房进房（匹配桌）。
 */
import { MATCH_TEXT, MatchClient, type MatchSoloWhy } from 'arcade-kit/client';
import type { Level } from '../ai/venues.ts';
import { DEFAULT_VARIANT } from '../core/variants/index.ts';
import { matchTierOf } from '../game/match.ts';
import { stakesOf, type StakesId } from '../game/stakes.ts';
import { matchUrl } from '../online.ts';
import { closeDialog, dialog } from '../view/dialog.ts';
import { button, el } from '../view/dom.ts';
import { num, STAKES_NAME } from '../view/text.ts';
import type { AnyOpts } from '../view/variants/page.ts';
import { pageOf } from '../view/variants/pages.ts';
import { withNick } from './identity.ts';
import { enterRoom } from './room-flow.ts';
import { session } from './session.ts';
import { stage } from './shell.ts';
import { startSolo } from './solo-flow.ts';
import { TIMING } from './timing.ts';
import { checkFunds } from './wallet.ts';

export function stopMatch(): void {
  session.matcher?.cancel();
  session.matcher = null;
  window.clearInterval(session.matchTick);
  session.matchTick = 0;
}

/** 排队卡上说过的每句话（冒烟看排没排上、为什么转了单机；只是一串字，不进存储） */
const said = ((window as { __said?: string[] }).__said ??= []);

/** 排队卡：标题、一行进度、"取消"和"不等了，和电脑打" */
interface WaitCard {
  /** 房间来了新的人数和剩余时间 */
  waiting(count: number, size: number, leftMs: number): void;
  /** 每秒重画进度那一行 */
  paint(): void;
  say(text: string): void;
  /** 排队结束：说一句；then 非空就过 1 秒执行（卡还在的话），否则摆一个"好" */
  done(text: string, then: (() => void) | null): void;
}

function openWaitCard(stakes: StakesId, variant: string, mode: { three?: boolean; flow?: boolean }, goSolo: () => void): WaitCard {
  const st = stakesOf(stakes)!;
  let n = 1;
  let seats = mode.three ? 3 : 4;
  let until = 0;
  let line: HTMLElement | null = null;
  let acts: HTMLElement | null = null;
  const say = (text: string): void => {
    if (said.push(text) > 100) said.shift();
    if (line) line.textContent = text;
  };
  const paint = (): void => {
    const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
    say(until ? `正在找人 · 已有 ${n}/${seats} 人 · 还剩 ${left} 秒` : '正在找人……');
  };
  dialog(stage, 'match', (box) => {
    el('h2', '', box, '快速匹配');
    el('div', 'match-tier', box, `${pageOf(variant).matchTag}${mode.three ? '三人两房 · ' : mode.flow ? '血流成河 · ' : ''}${st.wallet ? `实盘${STAKES_NAME[stakes]}档 · 一份 ${num(st.share)}` : '娱乐 · 不算筹码'}`);
    line = el('p', 'match-wait', box);
    el('p', 'room-hint', box, '凑够几个算几个，空位电脑补；只剩你一个就先和电脑打');
    acts = el('div', 'row', box);
    button('act soft match-cancel', acts, '取消', () => {
      stopMatch();
      closeDialog();
    });
    button('act go match-solo', acts, '不等了，和电脑打', () => {
      stopMatch();
      goSolo();
    });
  }, false);
  paint();
  return {
    waiting(count, size, leftMs) {
      [n, seats, until] = [count, size, Date.now() + leftMs];
      paint();
    },
    paint,
    say,
    done(text, then) {
      stopMatch();
      say(text);
      acts?.replaceChildren();
      if (then) {
        const box = line;
        window.setTimeout(() => box?.isConnected && then(), TIMING.matchDoneHoldMs);
      } else if (acts) button('act go', acts, '好', closeDialog);
    },
  };
}

/**
 * 选桌页"快速匹配"：按这一档排队，一张卡写"已有几人、还剩几秒"；排到了照好友房进房（匹配桌）。
 * 只剩自己、今天局数用完、联机忙……先说一句再转这一档的单机（实盘照常带入一份）；别的页面排上了（replaced）只说一句、不开单机
 */
export async function quickMatch(stakes: StakesId, opts: AnyOpts, level: Level, variant: string = DEFAULT_VARIANT): Promise<void> {
  const st = stakesOf(stakes)!;
  if (st.wallet && !(await checkFunds(st.share))) return;
  stopMatch();
  const goSolo = (): void => {
    closeDialog();
    void startSolo(stakes, opts, level, variant);
  };
  const mode = opts as { three?: boolean; flow?: boolean };
  const card = openWaitCard(stakes, variant, mode, goSolo);
  const m = new MatchClient({
    url: withNick(matchUrl(matchTierOf(stakes, variant, mode))),
    onWaiting: card.waiting,
    onMatched: (code) => {
      card.say('凑好一桌了');
      enterRoom(code, false, null, true);
    },
    // 已经有一个开着的房间（kit 入队前先问计量）：带他回去
    onHasRoom: (code) => {
      card.say('你已经有一个房间了，带你回去');
      enterRoom(code, false);
    },
    onSolo: (why: MatchSoloWhy) => card.done(MATCH_TEXT[why], why === 'replaced' ? null : goSolo),
  });
  session.matcher = m;
  session.matchTick = window.setInterval(card.paint, TIMING.matchTickMs);
  m.start();
}
