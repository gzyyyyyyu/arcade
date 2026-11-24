/**
 * 页面入口：启动、全局事件、读 URL 决定进哪一页。
 * 页面骨架和顶栏在 app/shell.ts（设置面板 app/settings.ts），页面路由（主页、选桌页、练习页）在 app/routes.ts；
 * 单机 app/solo-flow.ts + solo-settle.ts、好友房 app/room-flow.ts + room-settle.ts、快速匹配 app/match-flow.ts，会话状态在 app/session.ts；
 * 规则在 src/core，单机的推进在 solo.ts，好友房的连接在 online.ts，各玩法不同的页面代码在 view/variants/<id>/。
 */
// 第一个 import：先挂上报错上报，下面任何模块加载时的报错也收得到
import { readText } from './storage.ts';
import './app/report.ts';
import { loadSolo, Solo } from './solo.ts';
import { wallUrl, warmTileArt } from './view/tiles.ts';
import { installArt } from './view/art.ts';
import { guideKey, showGuide } from './view/guide.ts';
import { play, setAmbience, setSound, setVolume, unlockAudio } from './view/sound.ts';
import { fitStage } from './view/viewport.ts';
import { setSafeHint } from './view/variants/riichi/ui.ts';
import './view/style.css';
import './view/art.css';
import './view/pc.css';
import { startCloud } from './app/cloud.ts';
import { loadMe } from './app/identity.ts';
import { installLeaveGuard } from './app/leave.ts';
import { live, prefs } from './app/prefs.ts';
import { enterRoom } from './app/room-flow.ts';
import { homePage, lobby, startQuick } from './app/routes.ts';
import { session } from './app/session.ts';
import { app, paintTop, stage } from './app/shell.ts';
import { quietUi, settleLeftover } from './app/solo-flow.ts';
import { startSocial } from './app/social.ts';
import { refreshWallet } from './app/wallet.ts';
import { getWallet } from './net/wallet.ts';

setSound(live.sound);
setVolume(prefs.volume);
setAmbience(prefs.ambience);
setSafeHint(prefs.safeHint);
// 牌桌、选桌页的画（art.css 用的 --art-* 变量）
installArt();
// 牌墙的立体牌背：只生成一次，写成变量给 css/table.css 的 .opp-hand .back 用
document.documentElement.style.setProperty('--wall-h', `url("${wallUrl('h')}")`);
document.documentElement.style.setProperty('--wall-v', `url("${wallUrl('v')}")`);

fitStage(app, stage);
document.addEventListener('pointerdown', unlockAudio, { capture: true });
// 按钮点按一律轻响一下（手牌出牌有自己的声音，不在这里）
document.addEventListener('click', (e) => {
  const b = (e.target as Element | null)?.closest('button');
  if (b && !b.disabled) play('button');
});
installLeaveGuard();

/** 地址栏决定第一页：?room=123456 直接进房（match=1 是匹配桌），?online=1 是平台大厅的"好友房"按钮。online 用完就从地址栏去掉，刷新不再亮 */
function entryFromUrl(): { code: string | null; match: boolean; friends: boolean } {
  const q = new URLSearchParams(location.search);
  const code = q.get('room');
  const friends = q.get('online') === '1';
  if (q.has('online')) {
    const u = new URL(location.href);
    u.searchParams.delete('online');
    history.replaceState(null, '', u);
  }
  return { code: code && /^\d{6}$/.test(code) ? code : null, match: q.get('match') === '1', friends };
}

/** 认人和钱包同时问：先后问要等两个来回才画主页；单独部署时钱包那一问回 404，不用它 */
async function loadAccount(): Promise<void> {
  const wallet = getWallet();
  await loadMe();
  if (!session.standalone) {
    void startSocial();
    startCloud();
  }
  await refreshWallet(wallet);
}

void (async () => {
  paintTop();
  await loadAccount();
  // 朋友发来的房间链接（登录后平台按 next 原样带回来）、刷新：直接进房
  const { code, match, friends } = entryFromUrl();
  if (code) return enterRoom(code, false, null, match);
  if (friends) lobby(true, 'room');
  else homePage();
  // 上一场单机实盘离开时没结上：打开就自动再结一次
  const left = loadSolo();
  if (left?.settle && !left.done) void settleLeftover(new Solo(left, quietUi));
  // 主页画好后空闲时把牌面图先解出来，第一次进桌少卡一下
  (window.requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 200)))(() => warmTileArt());
  // 第一次来弹说明，按主页上选着的玩法讲（选着立直却弹川麻的"不能吃"，说的和要打的对不上）。
  // 在说明上点"开打"就开快速一局；从平台的"好友房"进来的是来开房的，只关掉说明
  if (!readText(guideKey(prefs.variant)) && !loadSolo()) showGuide(stage, 0, undefined, prefs.variant, friends ? undefined : () => void startQuick());
})();
