/**
 * 止盈（规则在 src/core/takeprofit.ts）：顶栏的开关、大厅"带上桌"下面那一行、一手打完问一次够没够。
 */
import { stakesOf } from '../core/stakes.ts';
import { reached, takeProfitLabel, TP_OFF, TP_PCTS, type TakeProfit } from '../core/takeprofit.ts';
import { ME } from '../solo.ts';
import { patchSettings } from '../store.ts';
import { closeDialog, dialog } from '../view/dialog.ts';
import { el } from '../view/dom.ts';
import { chips } from '../view/text.ts';
import type { App } from './state.ts';
import { must } from '../must.ts';

export function createTakeProfit(c: App) {
  const f = c.fn;
  const { stage, lobby } = c.ui;

  function drawTakeProfit(): void {
    lobby.setTakeProfit(takeProfitLabel(c.takeProfit, chips));
  }

  /** 选止盈：关 / 赢 50% / 100% / 200% / 自定义金额（按这次带上桌的算） */
  async function pickTakeProfit(): Promise<void> {
    let pick: TakeProfit | null = null;
    const body = el('div', 'tp-pick');
    el('div', 'tp-note', body, '这一桌净赢到这么多，一手打完就自动起身，筹码带回钱包（娱乐桌只是离桌）');
    const row = el('div', 'tp-opts', body);
    const opts: [string, TakeProfit][] = [['关', TP_OFF], ...TP_PCTS.map((p): [string, TakeProfit] => [`赢 ${p}%`, { kind: 'pct', pct: p }])];
    for (const [label, tp] of opts) {
      const b = el('button', `pill${JSON.stringify(tp) === JSON.stringify(c.takeProfit) ? ' sel' : ''}`, row, label);
      b.type = 'button';
      b.addEventListener('click', () => {
        pick = tp;
        closeDialog();
      });
    }
    const own = el('div', 'tp-own', body);
    const input = el('input', 'tp-amount', own);
    input.type = 'number';
    input.inputMode = 'numeric';
    input.min = '1';
    input.placeholder = '自定义：赢多少';
    if (c.takeProfit.kind === 'amount') input.value = String(c.takeProfit.amount);
    const use = el('button', 'pill', own, '用这个');
    use.type = 'button';
    use.addEventListener('click', () => {
      const n = Math.floor(Number(input.value));
      if (!Number.isSafeInteger(n) || n <= 0) return void input.focus();
      pick = { kind: 'amount', amount: n };
      closeDialog();
    });
    await dialog(stage, '止盈', body, [{ label: '取消', value: 'cancel', cancel: true }], true);
    if (!pick) return;
    c.takeProfit = pick;
    patchSettings({ takeProfit: c.takeProfit });
    drawTakeProfit();
    f.toast(takeProfitLabel(c.takeProfit, chips));
  }

  /** 一手打完问一次：这一桌净赢够了就走（正在打的一手已经打完了）。单机按坐下加补码算带入，好友房按一份满买入 */
  function checkTakeProfit(me: number): void {
    // 锦标赛里没有止盈（打到剩一人才结算）
    if (c.tour || c.tpFired || c.takeProfit.kind === 'off') return;
    if (c.solo) {
      const s = c.solo;
      if (s.busted || s.closing) return;
      const buyIn = s.stats.buyin;
      const now = must(s.table.seats[ME], '单机桌一定有我的座位').stack + (s.session.held ?? 0);
      if (!reached(c.takeProfit, buyIn, now)) return;
      c.tpFired = true;
      f.toast(`止盈了 +${chips(now - buyIn)}`);
      void f.leave(true);
      return;
    }
    const v = c.online?.state.view;
    const net = v?.net[me];
    // 只在手间停着（HAND_PAUSE_MS）时走：页面动画播完时服务端可能已经发了下一手（切后台、卡顿），这时离座会变成弃牌白丢盲注，
    // 留到这一手打完再问（tpFired 不置位）
    if (!v || v.tour || v.phase !== 'idle' || net === null || net === undefined || c.online!.state.status !== 'open') return;
    const buyIn = stakesOf(v.stakes).max;
    if (!reached(c.takeProfit, buyIn, buyIn + net)) return;
    c.tpFired = true;
    f.toast(`止盈了 +${chips(net)}`);
    void f.leaveRoom(false, true);
  }

  return { drawTakeProfit, pickTakeProfit, checkTakeProfit };
}
