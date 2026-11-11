/**
 * 冒烟测试 + 截图（0.3）：起 vite（127.0.0.1 上系统挑的空闲端口；KP_SHOT_PORT 可指定）→ 无头 Chromium（1280×720）→ 逐个画面截图到 shots/。
 * 浏览器类检查要和其他浏览器检查错开：按本机的浏览器排队规则运行 npm run shot
 *
 *   node tools/shot.ts              （或 npm run shot）截图 + 冒烟；--out <目录> 指定截图目录（默认 shots/）
 *   node tools/shot.ts --meta       只跑长线界面（开局选择、每日挑战、图鉴、成就、结束页解锁）
 *   node tools/shot.ts --friendly   只跑 0.3.1 的说明书、词典、新手提示、收盘小结、拆解条、新闻、台词
 *   node tools/shot.ts --story      只跑 0.4 重做的局末"这段日子"小故事（五种市况）和图鉴行情段重看故事；--segs a,b 只截这几段
 *   node tools/shot.ts --rhythm     只跑 0.24 演出和节奏：收盘逐张结算、三选一悬停、通关演出后的成绩页、点按钮才开的「这段日子」（动画开着，1280×800）
 *   node tools/shot.ts --real     只跑 0.4 重做的真实行情：挑选行情、交易日、"这段日子"、结束页、图鉴行情段、加载失败退回合成行情
 *   node tools/shot.ts --cloud      只跑 0.5.7 云存档：云朵的未登录 / 已合并 / 待上传（假平台接口）
 *   node tools/shot.ts --board      只跑 0.5.10 每日排行榜（假平台接口）：每日挑战面板看榜、翻页、好友；一局每日挑战打完交分、名次、连不上重试；
 *                                   0.5.11 调试局只留入口、交分还在问账号时点「大厅」先等交分发出去
 *   node tools/shot.ts --weekly     只跑本周市场（假平台接口）：开始菜单的卡 → 面板 → 开局三选一上的规则 → 群聊里的规则横条 → 打完交周榜、结束页、看周榜
 *   node tools/shot.ts --challenge  只跑 0.13.0 好友挑战（假平台接口）：发起拿链接、好友接受同一开局打完交成绩看名次、行情段下载不了不退回模拟行情
 *   node tools/shot.ts --live       只跑 0.6.0 实盘（假钱包）：带入 → 打完 → 结回、还没开盘就收手、刷新接着打、结回重试、过期、带入没回话、另一台设备
 *   node tools/shot.ts --touch      只跑主流程里的触屏一段（长按不算点击、点按完成一天、按在别处滑过来不算点击、按着时重画再松手照样算）
 *   node tools/shot.ts --lowmem     只跑 0.5.9 省内存设备（iPhone 8 Plus、iPad Pro 的触屏配置）：渲染倍数、图集、显存预算、截图
 *   node tools/shot.ts --lobby      只跑 0.5.8 回大厅：开始菜单、结束页直接走，对局里先确认（改过设置也一样），竖屏提示层（只断言跳到 /，不加载平台页面）
 *   node tools/shot.ts --noscroll   一屏放下（docs/ui.md 第 11 节）：1280×720、1920×1080、844×390、390×844、360×640 五个尺寸（加 `--sizes=390,360` 只量这几个尺寸，`--screens=title,trade` 只量这几段），开始菜单和它的每个面板、交易页（手机三个页签）、
 *                                   局内设置、结束页，逐个量页面 scrollHeight / scrollWidth 不超过视口、画布和所有按钮都在视口里；
 *                                   再量画布里的重叠和裁字（调试桥 layout()，src/debug/layout.ts）：控件底板和点击区两两不相交，文字不伸出屏幕、按钮底板，不压在别的按钮和文字上
 *   node tools/shot.ts --content    内容包的画面：顶栏里的新战法图标、新事件弹窗（真实行情普通局开局后改状态，不走完整一局）
 *   node tools/shot.ts --pages-a  只跑页面细节 A：结束页排版、手机群聊点推荐消息直接买、昨日回顾收成角标、竖屏「照样玩」（后两段要加 --phone）
 *   node tools/shot.ts --pages-b    只跑页面细节 B：开局面板、每日挑战的遮罩盖住标题页按钮、设置的分组和「恢复默认」、三选一卡悬停（电脑 1280×800；加 --phone 跑手机的设置）
 *   node tools/shot.ts --ext        只跑 0.4 C：买多少、加仓 / 减一半、押跌与被轧、银行（借钱、打电话、收走、赎回）、图鉴小知识、带经历的结局
 *   node tools/shot.ts --v05 [--l1|--l3] [--until N] --out shots/v05   0.5 试玩：选难度开局、真实鼠标键盘打完整局（--until 打到第 N 个月），记时长、每月停几次、弹窗数
 *   node tools/shot.ts --ipo [--phone] 只跑打新：申购日横条 → 申购面板 → 申购 → 出签 → 新股持仓；刷新读档、连点、减少动态效果、回菜单继续、不发网络请求（--phone 为 844×390，另外还跑 390×844 竖屏「照样玩」）
 *   node tools/shot.ts --main       只跑主流程那一段（不加参数时跑主流程 + --meta、--friendly、--real、--story）
 *   node tools/shot.ts --vis --out shots/vis-after   0.5 去文字化：主要画面截图，并统计每个画面可见汉字数（counts.json）
 *   node tools/shot.ts --phone [--ext|--meta|…] --out shots/phone   0.5.5 手机横屏：同一套冒烟改在 844×390（layout=phone）上跑，
 *                                   控件在没打开的标签页里时先点那一页；裁切截图改成整屏
 *   node tools/shot.ts --playtest   动画开启、1 倍速、真实鼠标与键盘从开始菜单玩起：前两个月正常看动画，
 *                                   之后每天用空格跳过动画，直到本局结束；报告每天耗时与点击次数
 *                                   加 --until-month=N 打到第 N 月开头就停；等待超时会把状态、最近的 cue 和画面写进日志（截图目录用环境变量 SHOT_STUCK_DIR）
 *
 * 特定局面（龙头带动、涨停、跌停、月底、通关）先在 node 里用 core 推进找到，再用调试桥 loadState 交给画面。
 * 任何 console error / pageerror / 等待超时 / 断言失败都会以非零码退出。
 *
 * 本文件只做入口：参数分发和汇总。通用辅助在 tools/shot/harness.ts，假平台数据在 tools/shot/fakes.ts，每种模式一个文件在 tools/shot/modes/。
 */
import { readFileSync } from 'node:fs';
import { chromium, type Browser } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { PORT, errors, notes, setBase, shots } from './shot/harness.ts';
import { cloudShots } from './shot/modes/cloud.ts';
import { boardShots } from './shot/modes/board.ts';
import { challengeShots } from './shot/modes/challenge.ts';
import { extShots } from './shot/modes/ext.ts';
import { friendlyShots } from './shot/modes/friendly.ts';
import { ipoShots } from './shot/modes/ipo.ts';
import { liveShots } from './shot/modes/live.ts';
import { lobbyShots } from './shot/modes/lobby.ts';
import { lowMemShots } from './shot/modes/lowmem.ts';
import { run } from './shot/modes/main.ts';
import { metaShots } from './shot/modes/meta.ts';
import { contentShots } from './shot/modes/content.ts';
import { noScrollShots } from './shot/modes/noscroll.ts';
import { pagesAShots } from './shot/modes/pages-a.ts';
import { pagesBShots } from './shot/modes/pages-b.ts';
import { playtest } from './shot/modes/playtest.ts';
import { realShots } from './shot/modes/real.ts';
import { rhythmShots } from './shot/modes/rhythm.ts';
import { storyShots } from './shot/modes/story.ts';
import { pressRebuildShots, touchShots } from './shot/modes/touch.ts';
import { playtest05 } from './shot/modes/v05.ts';
import { visShots } from './shot/modes/vis.ts';
import { weeklyShots } from './shot/modes/weekly.ts';

/**
 * 0.13.1：public/_headers 里 /* 那一段的头（CSP、不许被嵌），开发服务器照同一份文件带上，不另抄一遍；正式环境由 Cloudflare 按 _headers 加。
 * CSP 在这里改成 Report-Only：冒烟靠 Playwright 在页面里求值字符串条件（要 eval），生效的 CSP 会把它们拦掉、整个冒烟起不来。
 * 违规照样报出来（openPage 里监听 securitypolicyviolation，记成控制台报错、冒烟算失败）；生效时游戏能不能跑，用正式构建另测（README 安全头一节）。
 */
function pageHeaders(): Record<string, string> {
  const out: Record<string, string> = {};
  let inBlock = false;
  for (const line of readFileSync('public/_headers', 'utf8').split('\n')) {
    if (!line.startsWith(' ')) inBlock = line.trim() === '/*';
    else if (inBlock) {
      const i = line.indexOf(':');
      if (i > 0) out[line.slice(0, i).trim().replace(/^Content-Security-Policy$/, 'Content-Security-Policy-Report-Only')] = line.slice(i + 1).trim();
    }
  }
  return out;
}

async function main(): Promise<void> {
  let server: ViteDevServer | null = null;
  let browser: Browser | null = null;
  try {
    server = await createServer({
      root: process.cwd(),
      logLevel: 'warn',
      server: { host: '127.0.0.1', port: PORT, strictPort: true, hmr: false, headers: pageHeaders() },
    });
    await server.listen();
    const addr = server.httpServer?.address();
    if (!addr || typeof addr === 'string') throw new Error('vite 没有监听端口');
    setBase(`http://127.0.0.1:${addr.port}/`);
    // 无 GPU 虚拟机：WebGL 走 SwiftShader；受限环境下 zygote/独立 GPU 进程可能起不来，统一关掉
    browser = await chromium.launch({
      args: ['--enable-unsafe-swiftshader', '--no-proxy-server', '--no-zygote', '--in-process-gpu'],
    });
    if (process.argv.includes('--v05')) {
      const only = process.argv.includes('--l3') ? [3] : process.argv.includes('--l1') ? [1] : [1, 3];
      const ui = process.argv.indexOf('--until');
      const until = ui > 0 ? Number(process.argv[ui + 1]) : 99;
      for (const lv of only) await playtest05(browser, lv, `L${lv}`, lv === 1 ? 7919 : 9001, until);
    } else if (process.argv.includes('--vis')) await visShots(browser);
    else if (process.argv.includes('--playtest')) await playtest(browser);
    else if (process.argv.includes('--meta')) await metaShots(browser);
    else if (process.argv.includes('--friendly')) await friendlyShots(browser);
    else if (process.argv.includes('--real')) await realShots(browser);
    else if (process.argv.includes('--story')) await storyShots(browser);
    else if (process.argv.includes('--rhythm')) await rhythmShots(browser);
    else if (process.argv.includes('--ext')) await extShots(browser);
    else if (process.argv.includes('--cloud')) await cloudShots(browser);
    else if (process.argv.includes('--lowmem')) await lowMemShots(browser);
    else if (process.argv.includes('--touch')) {
      await pressRebuildShots(browser);
      await touchShots(browser);
    }
    else if (process.argv.includes('--board')) await boardShots(browser);
    else if (process.argv.includes('--weekly')) await weeklyShots(browser);
    else if (process.argv.includes('--challenge')) await challengeShots(browser);
    else if (process.argv.includes('--lobby')) await lobbyShots(browser);
    else if (process.argv.includes('--noscroll')) await noScrollShots(browser);
    else if (process.argv.includes('--content')) await contentShots(browser);
    else if (process.argv.includes('--pages-a')) await pagesAShots(browser);
    else if (process.argv.includes('--pages-b')) await pagesBShots(browser);
    else if (process.argv.includes('--live')) await liveShots(browser);
    else if (process.argv.includes('--ipo')) await ipoShots(browser);
    else if (process.argv.includes('--main')) await run(browser);
    else {
      // 演出和节奏放在最前面（动画开着的几段，别被后面的超时挤掉）；它失败只记一笔，后面的照跑
      await rhythmShots(browser).catch((err: unknown) => errors.push(err instanceof Error ? (err.stack ?? err.message) : String(err)));
      await run(browser);
      await metaShots(browser);
      await friendlyShots(browser);
      await realShots(browser);
      await storyShots(browser);
    }
  } catch (err) {
    errors.push(err instanceof Error ? (err.stack ?? err.message) : String(err));
  } finally {
    await browser?.close().catch(() => {});
    await server?.close().catch(() => {});
  }
  for (const p of shots) console.log(p);
  for (const n of notes) console.log(n);
  if (errors.length > 0) {
    console.error(`\n失败（${errors.length}）：`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log(`\n全部通过，共 ${shots.length} 张截图。`);
}

await main();
