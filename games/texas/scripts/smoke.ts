/**
 * 冒烟（AGENTS.md 第 4 节）：真的 Worker（页面 + 登录闸门 + 钱包）跑在本地 wrangler dev 里，平台换成 test/support/arcade.dev.ts；
 * 浏览器里平台的 /api/me、/api/saves 由这里代答。跑一遍主流程，控制台和页面报错一律算失败。
 *
 *   npm run build:cf && npm run smoke [-- --hands 30] [--shots 目录]
 *
 * 内容：标题页 → 坐下（钱包扣买入）→ 自动点着打满 N 手（一手打完不点"下一手"就不发、自动下一手有倒计时）
 * → 补码 → 离桌（结算页，结回钱包）→ 回大厅确认；
 * 手机横屏（像素比 3、触屏）、省内存设备（CPU 降速 4 倍）、双指放大不重排、竖屏提示；
 * 好友房：房主从平台大厅的"好友房"（?online=1）进来开房，三个人（一部手机）同桌打满 10 手（两手之间房间停一会儿、大家看同一个倒计时）、
 * 手机刷新后不自动进房、点标题页的"回到房间"回到座位，第四个人接管电脑座位，都离开后房间结束、房主再点"开房间"开出新的（不 409）、
 * 都离开后结算页、结回钱包（--only room 只跑这段）。
 * 快速匹配（--only match，0.20.0）：两个人点小桌的"快速匹配"，等满 15 秒排到同一张 6 人桌（没有房间码、叫人），关了陌生人聊天的那个连接不带 chat=1，
 * 打两手、离开结回钱包；娱乐档两人排到娱乐桌打一手、钱包不动（0.21.0）；排队时点"取消"回选桌；只有一个人排时转成同一档的单机。
 * 桌面那一段开"快"动画（0.55 倍）省时间；默认速度的节奏用 scripts/capture.ts 连拍看。
 * 单独部署（--only standalone，不带 --only 时也跑）：原样的 wrangler.jsonc 另起一个 wrangler dev，不接假平台：站点根跳到游戏首页，
 * 没有钱包、云存档、实盘，"大厅"回游戏首页；单机娱乐打两手、离桌；两个游客（一个带昵称）开好友房打两手、离开（docs/deploy.md 10.1）。
 * 弹窗（--only dialogs）：离桌确认的默认焦点和危险色、Esc、Tab 循环、焦点归还、键不漏到牌桌，见 dialogsFlow。
 * 成就（--only ach）：成就墙、第一次赢时的小提示、手机竖屏的成就墙。
 * 好友房锦标赛（--only tourroom，0.24.0）：两个人开实盘锦标赛房间（电脑补空位）打完，结束页、钱包守恒（见 tourRoomFlow）。
 * 快速局（--only pushfold）：全下或弃牌，电脑版键盘 A / F、手机竖屏两个大键各打一整局，见 pushFoldFlow。
 * 今日赛（--only dailytour）：电脑版从娱乐选桌点"今日赛"打到结束页，加注面板展开时底池不重复、假平台只收一次分、再练一场不交分，见 dailyTourFlow。
 * 今日谜题（--only puzzle）：每天 5 道连着答、每道揭晓、答到一半刷新接着答、答完交一次每日榜、总结卡、晒一下、键盘 1/2/3 和 Esc；电脑 1280×800 和手机竖屏 390×844 各一遍（见 puzzleFlow）。
 * 顶栏和设置面板（--only settings）：见 settingsFlow 的注释。
 * 新手指引（--only guide）：见 guideFlow 的注释。
 * 每人同时 1 个房间（--only quota）：房主先走再开房、匹配先走再排都回原房间并提示，朋友离桌后开出新房，见 quota.ts。
 * 好友房长跑（--only roomsoak）、后台切回和弱网（--only roomweak）：见各自函数的注释，不在默认冒烟里。
 * 端口一律由系统分配（不占 5175 / 4175）。截图放在 --shots（默认系统临时目录下的 texas-shots）。
 */
import { chromium } from 'playwright-core';
import { opt } from './args.ts';
import { SHOTS, errors, log, PLATFORM_CONFIG, STANDALONE_CONFIG, withWorker } from './smoke/harness.ts';
import { desktop, mobile, tall, standalone, portraitLobby } from './smoke/solo.ts';
import { room, match } from './smoke/room.ts';
import { dialogsFlow, lobbyUiFlow, achFlow, puzzleFlow, settingsFlow } from './smoke/screens.ts';
import { takeProfitFlow, guideFlow } from './smoke/guide.ts';
import { tourFlow, tourFormatFlow, tourRoomFlow } from './smoke/tour.ts';
import { pushFoldFlow, dailyTourFlow } from './smoke/quick.ts';
import { devicesFlow, scenesFlow, bigMomentsFlow } from './smoke/devices.ts';
import { roomSoak, roomWeak } from './smoke/room-soak.ts';
import { noScrollFlow } from './smoke/noscroll.ts';
import { quotaFlow } from './smoke/quota.ts';

async function main(): Promise<void> {
  // 有的沙箱环境里 zygote 拉不起 GPU 子进程，浏览器会直接退出；不用 zygote 就好（CI 上加不加都一样）
  const browser = await chromium.launch({ args: ['--no-zygote', '--disable-gpu'] });
  try {
    const only = opt('only', '');
    if (only !== 'standalone')
      await withWorker(PLATFORM_CONFIG, async (base) => {
        if (!only || only === 'desktop') await desktop(browser, base);
        if (!only || only === 'mobile') await mobile(browser, base);
        if (!only || only === 'mobile' || only === 'portrait') await portraitLobby(browser, base);
        if (!only || only === 'room') await room(browser, base);
        if (!only || only === 'match') await match(browser, base);
        if (only === 'tall') await tall(browser, base);
        if (only === 'noscroll') await noScrollFlow(browser, base);
        if (only === 'settings') await settingsFlow(browser, base);
        if (only === 'guide') await guideFlow(browser, base);
        if (only === 'tp') await takeProfitFlow(browser, base);
        if (only === 'lobbyui') await lobbyUiFlow(browser, base);
        if (only === 'dialogs') await dialogsFlow(browser, base);
        if (only === 'ach') await achFlow(browser, base);
        if (only === 'puzzle') await puzzleFlow(browser, base);
        if (only === 'tour') await tourFlow(browser, base);
        if (only === 'tour' || only === 'tourfmt') await tourFormatFlow(browser, base);
        if (only === 'pushfold') await pushFoldFlow(browser, base);
        if (only === 'dailytour') await dailyTourFlow(browser, base);
        if (only === 'tourroom') await tourRoomFlow(browser, base);
        if (only === 'devices') await devicesFlow(browser, base);
        if (only === 'scenes') await scenesFlow(browser, base);
        if (only === 'bigmoments') await bigMomentsFlow(browser, base);
        if (only === 'roomsoak') await roomSoak(browser, base);
        if (only === 'roomweak') await roomWeak(browser, base);
        if (only === 'quota') await quotaFlow(browser, base);
      });
    if (!only || only === 'standalone') await withWorker(STANDALONE_CONFIG, (base) => standalone(browser, base));
  } catch (e) {
    // 半路失败时也把攒下的控制台错误打出来：卡住的原因常在这里（比如 CSP 拦了什么）
    if (errors.length) console.error(errors.join('\n'));
    throw e;
  } finally {
    await browser.close();
  }
  if (errors.length) {
    console.error(errors.join('\n'));
    throw new Error(`${errors.length} console errors`);
  }
  log(`ok, screenshots in ${SHOTS}`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
