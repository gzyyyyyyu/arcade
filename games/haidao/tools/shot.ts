/**
 * 无头浏览器冒烟 + 截图：node tools/shot.ts [--out <目录>] [--view desktop,phonep] [--query <附加查询串>]
 *
 * - 自己起一个 vite 开发服务（端口由系统分配，不占 5170/4170，见仓库根 AGENTS.md 第 3 节），用 playwright-core + chromium；
 * - 每个视口截三张：基地、战斗中（?battle=<第 1 关>&auto&fast，机器人代打）、战斗打完；
 * - --views：各界面逐个截图（基地、海图、建造列表、主寨面板、升级庆祝面板、战斗中、结算），用 ?dev 给资源和星数，不写存档；
 * - --flow：新存档的真人流程（收金币 → 建造 → 看主寨 → 船队 → 出海 → 手动登陆放炮击 → 结算 → 回家），每步截图，任何一步失败记问题并退出码 1；
 * - --pvp：异步攻防的真人流程（海图"打玩家" → 找对手 → 手动登陆打 → 服务端结算 → 回家看"被打了 N 次" → 防守记录和回放 → 复仇 → 流浪海盗岛）。
 *   平台和 /api/pvp/* 由 shot-fake.ts 的 FakePvp 假装：Node 里跑真正的 worker/pvp/api.ts（内存假存储），回话和线上同一份代码出；
 * - --tdlive：悬赏守岛（实盘）的真人流程（守岛选关页 → 悬赏守岛选档 → 带入 → 造塔 / 英雄 / 叫波 → 结算 → 回家）。
 *   /api/td/*、/api/live/* 同样交给真的 worker/live.ts（内存假钱包 tools/fake-bank.ts）；--pvp 里还会让假服务端回一次 need_reload，截「游戏更新了」弹窗；
 * - --escortlive：护航实盘的真人流程（出海海图的护航卡 → 选图页的「实盘」→ 选档 → 带入 → 造塔、叫波 → 打完或撤退 → 结算 → 回家），钱包同样是假的；
 * - --maplive：航线实盘的真人流程（海图上「今日航线」旁的「实盘」→ 选档 → 带入 → 打一站 → 刷新页面 → 接着跑 → 收航 → 结算 → 回家），
 *   核对只写 haidao.maplive.run、不动 haidao.map、不交榜；
 * - --td：守岛一关的真人流程（--level，默认 td01）：选关页 → 驻守台选塔（电脑按空格开打）→ 预告卡和地图上的路线旗 → 敌人图鉴和克制表 →
 *   建塔（电脑按数字键选塔）、升级、卖塔（按两下）→ 清障 → 英雄走位、拒马、炸药桶 → 开打（电脑按空格）→ 4 倍速打完 → 结算；
 * - --escort：护航（商船队）的真人流程：出海海图的护航卡 → 选图选难度 → 局中点 停 / 冲 / 修船 / 跟随、造一座塔 → 4 倍速打到结束（5 分钟没完就撤退）→ 结算 → 回岛；
 *   检查顶栏血条、速度三联钮（当前档高亮、可点 ≥ 44）、手机竖屏的"回到船"钮，控制台零报错；
 * - --home：海盗来袭（守自己的岛）的真人流程：选关页入口 → 开局 → 造塔、英雄、开打 → 撑到结束（4 分钟没完就撤退）→ 结算（不算星）→ 回岛；
 * - 视口：desktop 1280×800、wide 1920×1080、phonep 手机竖屏、phone 手机横屏，--view 挑（默认 desktop,phonep）；
 * - --tide：大潮无尽（每周榜）的真人流程（守岛选关页的大潮入口 → 开局 → 造塔 / 英雄 / 技能 / 叫波 → 撑到结束 → 结算页 → 回岛）。
 *   往 /api/scores 交分用 page.route 拦下回 {best, improved: true}，并核对请求体（gameId、boardId、score）和只交了一次；
 * - --map：寻宝航线（每日航线）的真人流程，三个视口（电脑 1280×800、1920×1080、手机竖屏）：老玩家存档 → 出海 → 今日航线卡 → 航线图 → 选节点 → 整备（休整一条船）
 *   / 补给礁 → 真人登陆打（点船卡、点沙滩、放技能，不开 auto，?fast 4 倍速）→ 站间条 → … → 终局演出 → 结算 → 分享 → 回岛；
 *   往 /api/scores 交分用 page.route 拦下，核对榜名 daily-<日期>-map、只交了一次、haidao.map 记上了最好；
 *   电脑 1280×800 那一遍从最后一站的站间条起按 60 帧录终局演出（宝箱 / 沉船，webm + 拼图，--rec-out <目录>，默认 --out）；
 * - 可点的东西 ≥ 44×44 CSS 像素，控制台没有 error、页面没有未捕获的异常，不过就退出码 1；
 * - 没有 GPU 的环境 WebGL 走 SwiftShader（启动参数照开盘）。
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { flag, opt } from './args.ts';
import { cam, home, smoke, views } from './shot-base.ts';
import { escort, escortLive } from './shot-escort.ts';
import { flow } from './shot-flow.ts';
import { openView, printSfx, VIEWS, type ShotCtx } from './shot-lib.ts';
import { map, mapLive } from './shot-map.ts';
import { pvp } from './shot-pvp.ts';
import { recordAll } from './shot-record.ts';
import { td, tdLive, tide } from './shot-td.ts';

const OUT = opt('--out') ?? opt('--record') ?? join(tmpdir(), 'haidao-shots');
mkdirSync(OUT, { recursive: true });

const MAP = flag('--map');
/** --cam：镜头适配。手机竖屏守岛开场推镜、屏外敌人箭头、登陆战开场；电脑 / 1920 守岛整岛在屏内、按钮不重叠 */
const CAM = flag('--cam');
const ONLY = opt('--view')?.split(',') ?? (MAP ? ['desktop', 'wide', 'phonep'] : CAM ? ['phonep', 'wide'] : ['desktop', 'phonep']);
/** --record <目录>：录动作短片（webm + 抽帧拼图），见 shot-record.ts */
const REC = opt('--record');
/** 开关 → 流程、终端里的名字、走完时的说法；同时给了几个开关只跑排在前面的那条，都没给就是简单冒烟 */
const MODES: Array<[on: boolean, run: (c: ShotCtx) => Promise<boolean>, what: string, done?: string]> = [
  [flag('--views'), views, '界面', '截完'],
  [flag('--td'), td, '守岛'],
  [MAP, map, '寻宝航线'],
  [CAM, cam, '镜头'],
  [flag('--escort'), escort, '护航'],
  [flag('--home'), home, '海盗来袭'],
  [flag('--tide'), tide, '大潮无尽'],
  [flag('--escortlive'), escortLive, '护航实盘'],
  [flag('--maplive'), mapLive, '航线实盘'],
  [flag('--tdlive'), tdLive, '悬赏守岛'],
  [flag('--pvp'), pvp, '攻防'],
  [flag('--flow'), flow, '流程'],
];
const MODE = MODES.find(([on]) => on);

const server = await createServer({ logLevel: 'warn', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
await server.listen();
const addr = server.httpServer?.address();
if (!addr || typeof addr === 'string') throw new Error('vite 没有监听端口');
const ROOT = `http://127.0.0.1:${addr.port}/`;

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--no-proxy-server', '--no-zygote', '--in-process-gpu', '--autoplay-policy=no-user-gesture-required'] });
const problems: string[] = [];
try {
  if (REC) await recordAll(browser, ROOT, REC, problems);
  else for (const v of VIEWS) {
    if (!ONLY.includes(v.name)) continue;
    const c = await openView(browser, v, ROOT, OUT, problems);
    if (MODE) {
      const [, run, what, done = '走完'] = MODE;
      const ok = await run(c);
      await c.sfxDone();
      await c.ctx.close();
      console.log(`${v.name}：${what} ${ok ? done : '中断'}`);
    } else {
      await smoke(c);
      await c.sfxDone();
      await c.ctx.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
printSfx();
console.log(`截图在 ${OUT}`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('控制台零报错，按钮检查通过');
