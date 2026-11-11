/**
 * 结算弹窗里各玩法、单机和好友房共用的小件：一局的结算加动画、滚到自己那一行、分享按钮。
 */
import type { ShareCard } from 'arcade-kit/share';
import type { Award } from '../game/awards.ts';
import { button } from '../view/dom.ts';
import { pageTo } from '../view/pager.ts';
import { settleFx } from '../view/fx.ts';
import { settleReveal } from '../view/settle-fx.ts';
import { awardsCard, prepareCard } from '../view/share.ts';
import { play } from '../view/sound.ts';
import { prefs } from './prefs.ts';
import { session } from './session.ts';

/** 结算弹窗里放一局的结算，分从 0 数上去、铜钱飞，飞了就响一声筹码 */
export function settle(box: HTMLElement, summary: HTMLElement): void {
  box.appendChild(summary);
  if (settleFx(summary)) play('chips');
  settleReveal(summary, prefs.fast);
}

/** 一场打完的结算放不下一页时（view/pager.ts 翻页），打开就翻到一场排名里自己那行所在的页 */
export function showMine(): void {
  const me = document.querySelector<HTMLElement>('.mask.end .summary.final .row.me');
  if (me) pageTo(me);
}

/** 结算页的"分享"（docs/social.md 1.1）：只有坐着打完的人有（旁观的没有自己的战绩），卡由玩法给（page.shareCard） */
export function cardButton(row: HTMLElement, card: ShareCard | null, url: string): void {
  if (!card) return;
  // 结算页出来就画好，点的那一下直接调系统分享（iOS 要求，见 view/share.ts）
  const p = prepareCard(card, url);
  button('act soft share-card', row, '分享', () => void p.share());
}

/** 颁奖的分享卡（旁观的也能分享：奖和名字都是公开的） */
export function awardsButton(row: HTMLElement, prizes: readonly Award[], names: string[], unit: string, title: string, url: string): void {
  const card = awardsCard(prizes, names, unit, title, session.myName);
  if (!card) return;
  const p = prepareCard(card, url);
  button('act soft share-awards', row, '分享颁奖', () => void p.share());
}
