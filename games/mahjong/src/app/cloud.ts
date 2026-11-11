/**
 * 页面上的云存档（同步规则见 net/cloud.ts）：有平台时开始同步，接上本机擂台记录的改动、切后台和离开牌桌补传、回前台复查身份、多标签页。
 */
import { CloudSync } from '../net/cloud.ts';
import { onLadderWrite } from '../view/ladder.ts';

export const cloud = new CloudSync({
  fetch: (...a) => fetch(...a),
  get store() {
    return localStorage;
  },
  now: () => Date.now(),
  loggedIn: () => /(?:^|;\s*)__Host-arcade_li=/.test(document.cookie),
  later: (f, ms) => window.setTimeout(f, ms),
  cancel: (t) => window.clearTimeout(t as number),
});

export function startCloud(): void {
  onLadderWrite(() => cloud.touched());
  void cloud.start();
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? cloud.flush() : void cloud.recheck()));
  window.addEventListener('pagehide', () => cloud.flush());
  window.addEventListener('focus', () => void cloud.recheck());
  window.addEventListener('storage', (e) => cloud.storage(e.key));
}
