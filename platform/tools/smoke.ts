/**
 * 无头浏览器冒烟 + 截图：账号界面的主流程和各种出错提示（docs/platform-backend.md 5.2、5.7），
 * 邀请制：注册关着、管理员建号、管理命令行工具（tools/admin.ts）。
 *
 *   npm run smoke                 先构建，再跑；截图放 shots/（不进 Git）
 *   node tools/smoke.ts --out <目录>
 *   npm run smoke -- --only=<段名>  只跑一段（段名表在下面的 only）
 *
 * 本文件只管参数、起停服务、按段调度；各段在 tools/smoke/sections/<段名>.ts，公共部分在 tools/smoke/lib/：
 * core（断言、监视、截图、开页面）、server（本地接口服务）、fakes（假数据和接口 mock）、accounts（真走本地 D1 的账号和管理工具）、ui（排版检查和常用操作）。
 * 加一段：在 sections/ 下新建文件导出一个 (browser) => Promise<void>，登记进 only 和全量顺序。
 *
 * 用临时目录里的本地 D1 起 wrangler dev（127.0.0.1:5181，平台登记的接口端口），界面和接口同源，和线上一样；
 * 静态资源的 public/_headers（CSP 等）wrangler dev 也会加上（实测），所以页面是在正式的 CSP 下跑的。
 * Secret 用命令行传的假值，不读也不改 .dev.vars。REGISTRATION 不传，用 wrangler.jsonc 里的默认值（switch，D1 里没设过按关），顺带验证默认是关着的。
 *
 * 失败条件，任何一条都以非零码退出：
 * - 页面报错、控制台 error（"Failed to load resource" 除外，它们按下面的 HTTP 检查算）、CSP 拦下了任何东西；
 * - 没有事先声明的 4xx/5xx 响应；
 * - 断言不成立。
 * 服务端不好造的情况（只读档、停服、429、断网、网关出错页）用 page.route 在浏览器里模拟。
 */
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import { cli } from './smoke/lib/accounts.ts';
import { OUT, problems, expected, shotNo } from './smoke/lib/core.ts';
import { startServer, ensurePortFree, waitForServer } from './smoke/lib/server.ts';
import { boardsPage } from './smoke/sections/boards.ts';
import { podiumMatrix } from './smoke/sections/podium.ts';
import { staleChunk } from './smoke/sections/chunk.ts';
import { deskPages } from './smoke/sections/desk.ts';
import { feedPop } from './smoke/sections/feedpop.ts';
import { friendsUx } from './smoke/sections/friends.ts';
import { friendsFeed } from './smoke/sections/friendsfeed.ts';
import { adminInvites } from './smoke/sections/invites.ts';
import { anonymous, adminFlow } from './smoke/sections/main-flow.ts';
import { mobile } from './smoke/sections/mobile.ts';
import { transitions } from './smoke/sections/motion2.ts';
import { loginNext } from './smoke/sections/next.ts';
import { lobbyNotice } from './smoke/sections/notice.ts';
import { lobbyNudge } from './smoke/sections/nudge.ts';
import { adminOverview } from './smoke/sections/overview.ts';
import { deviceMatrix, phoneAudit } from './smoke/sections/phone.ts';
import { noScroll } from './smoke/sections/noscroll.ts';
import { recentGames } from './smoke/sections/recent.ts';
import { walletRulesAdmin } from './smoke/sections/rules.ts';
import { serviceStates } from './smoke/sections/services.ts';
import { lobbySound } from './smoke/sections/sound.ts';
import { statsPage } from './smoke/sections/stats.ts';
import { pageStates } from './smoke/sections/states.ts';
import { motionFrames } from './smoke/sections/frames.ts';
import { boardsMatrix } from './smoke/sections/boardsmatrix.ts';
import { adminTally } from './smoke/sections/tally.ts';
import { lobbyTour } from './smoke/sections/tour.ts';
import { walletAndSlowNet } from './smoke/sections/wallet.ts';

const state = mkdtempSync(join(tmpdir(), 'arcade-smoke-'));
mkdirSync(OUT, { recursive: true });
// 清掉上一次跑出来的图（只删本脚本起的名字），免得新旧混在一起看错
for (const f of readdirSync(OUT)) {
  if (/^\d{2}-.+\.png$/.test(f) || f === 'recovery-code-image.png') rmSync(join(OUT, f));
}
let server: ChildProcess | null = null;
let browser: Browser | null = null;
let ok = false;
// 被 Ctrl+C 或超时杀掉时也把 wrangler dev 整组收掉，不留占着端口的进程
const killServer = () => {
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      // 已经退了
    }
  }
};
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sig, () => {
    killServer();
    rmSync(state, { recursive: true, force: true });
    process.exit(130);
  });
}
try {
  await ensurePortFree();
  server = startServer(state);
  await waitForServer();
  // 无头环境常常没有可用的 GPU 进程：GPU 放进浏览器进程里、用软件渲染；环境里设了代理变量时 localhost 也不能走代理
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--no-proxy-server', '--no-zygote', '--in-process-gpu'] });
  // npm run smoke -- --only=<名字>：只跑其中一段（改界面时先跑相关的那段）；不带就全跑
  const only: Record<string, (b: Browser) => Promise<void>> = {
    main: async (b) => { await anonymous(b); await adminFlow(b, cli()); }, // 主流程：注册登录、管理员建号、好友、我的账号
    wallet: walletAndSlowNet, // 钱包页和网络卡住
    chunk: staleChunk, // 发版后分块 404
    next: loginNext, // 登录页的 next
    stats: statsPage, // 战绩页
    services: serviceStates, // 只读档、停服、限流、断网
    mobile: mobile, // 手机主流程和积分筹码说明
    desk: deskPages, // 电脑版排版：大厅、好友、我的、战绩
    phone: phoneAudit, // 手机界面专项：四种屏幕逐页量
    noscroll: noScroll, // 一屏放下不滚：五个尺寸逐页量
    devices: deviceMatrix, // 多尺寸矩阵：手机竖横、平板、折叠屏、电脑，只做通用检查
    boards: boardsPage, // 排行榜
    podium: podiumMatrix, // 总榜领奖台：1、2、3、10 人 × 我在不在榜 × 五个尺寸
    feedpop: feedPop, // 顶栏的动态按钮和浮层
    friends: friendsUx, // 好友分享、点名字看战绩、战绩页加好友
    friendsfeed: friendsFeed, // 好友页和动态页，好友多、动态多的时候
    rules: walletRulesAdmin, // 管理页的钱包规则
    invites: adminInvites, // 管理页的邀请码
    overview: adminOverview, // 管理页的今日概况和账号详情
    tally: adminTally, // 管理页的真人对局
    notice: lobbyNotice, // 大厅公告
    nudge: lobbyNudge, // 大厅提醒
    sound: lobbySound, // 大厅点按声
    recent: recentGames, // 大厅最近玩过
    tour: lobbyTour, // 新人引导
    motion2: transitions, // 进出游戏过渡、键盘快捷键
    states: pageStates, // 各页的空、加载中、出错，截图给人看
    frames: motionFrames, // 动效逐帧截图给人看（不在全量里）
    boardsmatrix: boardsMatrix, // 排行页每个页签 × 空榜、1 人、满榜 × 三个尺寸，截图给人看（不在全量里）
  };
  const picked = Object.keys(only).find((k) => process.argv.includes(`--only=${k}`));
  if (picked) await only[picked]!(browser);
  else {
    await anonymous(browser);
    await adminFlow(browser, cli());
    await mobile(browser);
    await serviceStates(browser);
    await walletAndSlowNet(browser);
    await staleChunk(browser);
    await loginNext(browser);
    await statsPage(browser);
    await deskPages(browser);
    await phoneAudit(browser);
    await noScroll(browser);
    await boardsPage(browser);
    await podiumMatrix(browser);
    await feedPop(browser);
    await friendsFeed(browser);
    await friendsUx(browser);
    await walletRulesAdmin(browser);
    await adminInvites(browser);
    await adminOverview(browser);
    await lobbyNotice(browser);
    await lobbyNudge(browser);
    await lobbySound(browser);
    await recentGames(browser);
    await lobbyTour(browser);
    await transitions(browser);
    await pageStates(browser);
  }
  for (const e of expected) problems.push(`说好会出现、却没出现的 ${e.status}：${e.path}`);
  ok = problems.length === 0;
} catch (e) {
  problems.push(e instanceof Error ? (e.stack ?? e.message) : String(e));
} finally {
  await browser?.close();
  killServer();
  rmSync(state, { recursive: true, force: true });
}
if (!ok) {
  console.error(`\n冒烟失败（${problems.length} 条）：`);
  for (const p of problems) console.error(`- ${p}`);
  process.exit(1);
}
console.log(`\n冒烟通过：控制台零报错、CSP 没拦任何东西，截图 ${shotNo} 张在 ${OUT}`);
