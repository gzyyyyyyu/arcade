/**
 * 钱包：读余额刷新顶栏的钱包条、带入没成的提示、带"去大厅领补给"的报错框。
 * 钱包是平台的（服务绑定 WALLET）；单独部署没有钱包，不问也不摆实盘。
 */
import { maybeApplied, getWallet, type WalletReply } from '../net/wallet.ts';
import { closeDialog, dialog } from '../view/dialog.ts';
import { button, el } from '../view/dom.ts';
import { num, walletError } from '../view/text.ts';
import { session } from './session.ts';
import { stage, walletChip } from './shell.ts';

export async function refreshWallet(): Promise<void> {
  // 单独部署没有平台钱包：不问，实盘也不摆
  if (session.standalone) return;
  const r = await getWallet();
  if (r.ok && r.wallet) {
    session.wallet = r.wallet;
    session.walletNote = null;
    walletChip.textContent = `钱包 ${num(session.wallet.balance)} 筹码`;
  } else {
    session.wallet = null;
    session.walletNote = r.ok ? null : `${walletError(r.error).text}。实盘先不能选，娱乐照常玩。`;
    walletChip.textContent = '';
  }
}

export function showError(text: string, fix?: string): void {
  dialog(stage, 'error', (box) => {
    el('p', '', box, text);
    if (fix === 'less' || fix === 'wallet') {
      const a = el('a', 'act soft', box, '去大厅领补给') as HTMLAnchorElement;
      a.href = '/';
    }
    if (fix === 'refresh') button('act soft', box, '刷新', () => location.reload());
    button('act go', box, '知道了', closeDialog);
  });
}

/** 实盘开局前的钱包检查：读最新余额，读不到或不够一份就说原因并返回 false */
export async function checkFunds(share: number): Promise<boolean> {
  await refreshWallet();
  if (!session.wallet) {
    showError(session.walletNote ?? walletError('unavailable').text);
    return false;
  }
  if (session.wallet.balance < share) {
    showError(walletError('no_funds').text, 'less');
    return false;
  }
  return true;
}

/** 带入没成：明确被拒的照说原因；没回话的告诉他下次会自动再确认，不会多扣 */
export function buyinFailed(r: Extract<WalletReply, { ok: false }>): void {
  if (maybeApplied(r.error)) return showError('钱包这次没回话，不知道筹码扣了没有。下次点"接着打"会自动再确认一次，不会多扣。');
  const e = walletError(r.error, r.retryAfter);
  showError(e.text, e.fix);
}
