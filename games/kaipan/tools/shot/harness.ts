/**
 * 冒烟脚本的通用辅助（tools/shot.ts 和 modes/ 下各模式共用）：开页面、点控件、等条件、截图、断言，
 * 以及在 node 里找局面的小工具。共享的全局状态（OUT、PHONE、BASE、errors / shots / notes / presence）都收在这里，
 * 各模式文件从这里取同一份，入口汇总结果时才不会漏。
 */
import { appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, BrowserContextOptions, Page, Route } from 'playwright-core';
import { createRun, dispatch, type Action, type GameEvent, type GameState, type RunSetup } from '../../src/core/index.ts';
import { LONG_PRESS_MS } from '../../src/view/ui/clickGuard.ts';

// 不占任何模块登记的端口（仓库 AGENTS.md 第 3 节）：5180 是平台的，开盘的 5173 / 4173 常开着给人手动看，
// 默认让系统挑一个空闲端口，起来后再定 BASE
export const PORT = Number(process.env.KP_SHOT_PORT ?? 0);
export let BASE = '';
/** 入口起好 vite 后调用：BASE 在别的模块里是只读的，只能经这里改 */
export function setBase(base: string): void {
  BASE = base;
}
export const OUT = ((): string => {
  const i = process.argv.indexOf('--out');
  const dir = i > 0 ? process.argv[i + 1] : undefined;
  if (!dir) return `${process.cwd()}/shots`;
  return dir.startsWith('/') ? dir : `${process.cwd()}/${dir}`;
})();
export const WAIT_MS = 120_000;
/** 0.5.5：手机横屏模式（844×390、2 倍屏、layout=phone）。显式给了 screen 的检查（竖屏、高分屏）照旧 */
export const PHONE = process.argv.includes('--phone');
export const TUTORIAL_KEY = 'kaipan.tutorial.v3';
export const TUTORIAL_STEPS = ['goal', 'chat', 'rec', 'open', 'colors', 'heat', 'chain', 'boards', 'sell', 'bill'];
/** 教程进度：只留 keep 这几步没看过（其余记为已看）；不传 keep 时关闭教程 */
export function tutorialProgress(keep?: string[]): string {
  if (!keep) return JSON.stringify({ v: 1, off: true, done: [] });
  return JSON.stringify({ v: 1, off: false, done: TUTORIAL_STEPS.filter((x) => !keep.includes(x)) });
}

export const errors: string[] = [];
export const shots: string[] = [];
/** 社交部件报上来的位置（请求体），冒烟核对开盘报的是"在玩开盘" */
export const presence: string[] = [];
export const notes: string[] = [];

export interface Ctx {
  page: Page;
  name: string;
  /** 触屏上下文（手机横屏切标签页时用点按，不用鼠标） */
  touch?: boolean;
}

export interface OpenOpts {
  screen?: { width: number; height: number; dpr: number };
  settings?: Record<string, unknown>;
  /** 触屏设备（pointer: coarse） */
  touch?: boolean;
  /** 打开前写入 localStorage 的键值 */
  storage?: Record<string, string>;
  /** 教程：true 为全新进度，字符串数组为只剩这几步没看过；默认关闭 */
  guide?: boolean | string[];
  /** 记录页面发出的网络请求（不含 blob: / data:） */
  requests?: string[];
  /** 打开前在浏览器里拦截的地址：返回内容或模拟「文件不存在」 */
  routes?: { pattern: string; body: string; type: string }[];
  /** 0.5.7 云存档：假平台接口（/api/**），和页面能读到的登录提示 cookie */
  api?: (route: Route) => Promise<void>;
  loginHint?: boolean;
  /** 0.5.9：看得见的区域比屏幕小（iOS Safari 的地址栏、标签栏占掉的），给了就按它设视口 */
  visible?: { width: number; height: number };
  /** 0.5.9：浏览器 UA（模拟 iOS Safari） */
  userAgent?: string;
  /** 0.5.10：这个场景故意让请求失败（模拟连不上），浏览器自己打的 "Failed to load resource" 不算报错 */
  netErrors?: boolean;
  /** 0.36.5：这个场景故意把请求挂着、由冒烟自己放行：页面里的请求超时（AbortSignal.timeout）不生效，免得软件渲染慢时超时先到 */
  holdRequests?: boolean;
}

export async function openPage(browser: Browser, name: string, query: string, opts: OpenOpts = {}): Promise<Ctx> {
  const screen = opts.screen ?? (PHONE ? { width: 844, height: 390, dpr: 2 } : { width: 1280, height: 720, dpr: 1 });
  // 每个场景用独立上下文，避免 localStorage 存档互相影响
  const co: BrowserContextOptions = {
    viewport: opts.visible ?? { width: screen.width, height: screen.height },
    ...(opts.userAgent ? { userAgent: opts.userAgent } : {}),
    screen: { width: screen.width, height: screen.height },
    deviceScaleFactor: screen.dpr,
  };
  if (opts.touch) Object.assign(co, { hasTouch: true, isMobile: true });
  const context = await browser.newContext(co);
  const storage: Record<string, string> = { ...(opts.storage ?? {}) };
  storage[TUTORIAL_KEY] = opts.guide === true ? tutorialProgress(TUTORIAL_STEPS) : tutorialProgress(Array.isArray(opts.guide) ? opts.guide : undefined);
  if (opts.settings) storage['kaipan.settings'] = JSON.stringify({ version: 1, ...opts.settings });
  await context.addInitScript((kv) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v);
  }, storage);
  for (const r of opts.routes ?? []) await context.route(r.pattern, (route) => route.fulfill({ status: 200, contentType: r.type, body: r.body }));
  if (opts.api) {
    await context.route('**/api/**', opts.api);
    // 0.12.0 社交部件（共用包）：有假平台、有登录提示时它会报位置、问邀请；后注册的先匹配，这两条不进各场景的假接口
    await context.route('**/api/presence', async (route) => {
      presence.push(route.request().postData() ?? '');
      await route.fulfill({ status: 204 });
    });
    await context.route('**/api/invites**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"invites":[]}' }));
  }
  if (opts.holdRequests) await context.addInitScript(() => Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: () => new AbortController().signal }));
  // __Host- cookie 只能在 https 下设，冒烟是 http：直接让页面读到提示 cookie
  if (opts.loginHint) await context.addInitScript(() => Object.defineProperty(Document.prototype, 'cookie', { configurable: true, get: () => '__Host-arcade_li=1', set: () => undefined }));
  // 0.13.1：CSP 违规（含 Report-Only）一律记成报错，冒烟算失败。例外是没有来源文件的 eval：那是这个脚本让 Playwright
  // 在页面里求值字符串条件（waitFor、state）造成的，游戏的包里没有 eval（正式构建下实测零违规）
  await context.addInitScript(() =>
    document.addEventListener('securitypolicyviolation', (e) => {
      if (e.blockedURI === 'eval' && !e.sourceFile) return;
      console.error(`CSP 违规：${e.effectiveDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`);
    }),
  );
  const page = await context.newPage();
  const reqs = opts.requests;
  if (reqs) page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('blob:') && !u.startsWith('data:')) reqs.push(u);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !(opts.netErrors && msg.text().startsWith('Failed to load resource'))) errors.push(`[${name}] console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`[${name}] pageerror: ${err.message}`));
  await page.goto(`${BASE}?${PHONE && !opts.screen ? `${query}${query ? '&' : ''}layout=phone` : query}`);
  const ctx: Ctx = { page, name, touch: !!opts.touch };
  if (screen.width >= screen.height) {
    await waitIdle(ctx, '首屏');
    // 场景淡入（约 0.2 秒；软件渲染下帧率低，多等一会儿）
    await page.waitForTimeout(600);
  }
  return ctx;
}

export async function waitIdle(ctx: Ctx, what: string, extra = 'true'): Promise<void> {
  try {
    // 上限按游戏时间算（120 秒游戏时间），不按真实时间：机器一忙帧率掉到个位数，Phaser 每帧的步长有封顶，
    // 同一段演出要的真实时间成倍变长（负载 30 时开新局要 150 秒），固定 120 秒真实时间会把正常的慢当成卡住；真实时间另封顶 15 分钟
    const t0 = await ctx.page.evaluate(() => window.__game?.loopTime ?? 0);
    const ok = await ctx.page.waitForFunction(
      ([from, budget, cond]) => {
        const g = window.__game;
        if (!g) return false;
        if (g.ready && g.idle && Function("g", `return (${cond})`)(g)) return 'idle';
        return g.loopTime - from > budget ? 'late' : false;
      },
      [t0, WAIT_MS, extra] as const,
      { timeout: 15 * 60_000, polling: 50 },
    );
    if ((await ok.jsonValue()) !== 'idle') throw new Error('late');
  } catch {
    const info = await ctx.page.evaluate(() => {
      const g = window.__game;
      return g ? { ready: g.ready, idle: g.idle, awaiting: g.awaiting, scene: g.scene, phase: g.state().phase, controls: Object.keys(g.controls()) } : null;
    });
    // 卡住时把更多现场写到日志（复现偶发卡住用）：弹窗和引导看 regions / displayList，最近的 cue 看卡在哪段表现
    const dump = await ctx.page.evaluate(() => {
      const g = window.__game;
      if (!g) return null;
      const s = g.state();
      return { day: `${s.month}月${s.dayInMonth + 1}`, fps: g.fps, frozen: g.frozen, regions: Object.keys(g.regions()), tutorial: g.tutorial(), top: g.displayList().slice(-25), cues: g.cues.slice(-15) };
    }).catch((e: unknown) => String(e));
    console.error(`[${ctx.name}] 卡住时的现场：${JSON.stringify(dump)}`);
    await ctx.page.screenshot({ path: `${process.env.SHOT_STUCK_DIR ?? tmpdir()}/stuck-${what.replace(/\W+/g, '_')}-${Date.now()}.png` }).catch(() => {});
    throw new Error(`[${ctx.name}] 等待超时：${what}（${JSON.stringify(info)}）`);
  }
}

/** 等到页面里某个条件成立（不要求 idle，用于截动画中途）。 */
export async function waitFor(ctx: Ctx, what: string, cond: string): Promise<void> {
  try {
    await ctx.page.waitForFunction(`(() => { const g = window.__game; return !!g && (${cond}); })()`, null, { timeout: WAIT_MS, polling: 20 });
  } catch {
    throw new Error(`[${ctx.name}] 等待超时：${what}`);
  }
}

/** 等到 since 之后出现某种 cue（动画播到这一步）。 */
export async function waitCue(ctx: Ctx, type: string, since: number): Promise<void> {
  await waitFor(ctx, `cue ${type}`, `g.cues.some((c) => c.t >= ${since} && c.cue.type === '${type}')`);
}

export async function dispatchNoWait(ctx: Ctx, action: Action): Promise<void> {
  const r = await ctx.page.evaluate((a) => window.__game?.dispatch(a) ?? { error: '__game 未挂载' }, action);
  if (r.error) throw new Error(`[${ctx.name}] dispatch ${JSON.stringify(action)} 失败：${r.error}`);
}

export async function dispatch2(ctx: Ctx, action: Action): Promise<void> {
  await dispatchNoWait(ctx, action);
  await waitIdle(ctx, `dispatch ${action.type}`);
}

export async function controls(ctx: Ctx): Promise<Record<string, { x: number; y: number }>> {
  return ctx.page.evaluate(() => window.__game?.controls() ?? {});
}

/** 世界坐标 → 页面坐标：按当前场景的相机换算（电脑上就是 1280×720 等比缩放；手机横屏的世界另算）。 */
export async function toPage(ctx: Ctx, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = await ctx.page.locator('canvas').boundingBox();
  if (!box) throw new Error(`[${ctx.name}] 找不到画布`);
  const f = await ctx.page.evaluate(([a, b]) => window.__game?.toCanvas(a, b) ?? { x: a / 1280, y: b / 720 }, [x, y] as const);
  return { x: box.x + f.x * box.width, y: box.y + f.y * box.height };
}

export async function point(ctx: Ctx, key: string): Promise<{ x: number; y: number }> {
  let c = await controls(ctx);
  // 手机横屏：右边一块是标签页，控件在没打开的那页里时先点那一页（真人也是这么点的）
  if (!(key in c) && PHONE && !key.startsWith('tab:')) {
    for (const t of ['tab:recs', 'tab:msgs', 'tab:board']) {
      const tp = c[t];
      if (!tp) continue;
      const q = await toPage(ctx, tp.x, tp.y);
      if (ctx.touch) await ctx.page.touchscreen.tap(q.x, q.y);
      else await ctx.page.mouse.click(q.x, q.y);
      await ctx.page.waitForTimeout(150);
      c = await controls(ctx);
      if (key in c) break;
    }
  }
  const p = c[key];
  if (!p) throw new Error(`[${ctx.name}] 找不到控件 ${key}（可用：${Object.keys(c).join(', ')}）`);
  return toPage(ctx, p.x, p.y);
}

/** 手机横屏：切到右边的某一页（群聊 msgs / 推荐 recs / 风口 board）；电脑上什么都不做。 */
export async function phoneTab(ctx: Ctx, tab: 'msgs' | 'recs' | 'board'): Promise<void> {
  if (!PHONE || !(`tab:${tab}` in (await controls(ctx)))) return;
  await click(ctx, `tab:${tab}`);
  await ctx.page.waitForTimeout(150);
}

/** 用真实鼠标点击某个控件（坐标来自 __game.controls()，按画布实际大小换算）。 */
export async function click(ctx: Ctx, key: string): Promise<void> {
  const p = await point(ctx, key);
  await ctx.page.mouse.click(p.x, p.y);
}

/** 结束页过场之后弹的成就、解锁弹窗（盖住成绩页，点不到下面的按钮）逐个关掉；连着 0.7 秒没有新的才算关完。 */
export async function dismissEndDialogs(ctx: Ctx): Promise<void> {
  for (let k = 0; k < 8; k++) {
    await ctx.page.waitForTimeout(700);
    const key = Object.keys(await controls(ctx)).find((x) => (x.endsWith(':ok') || x.endsWith(':close')) && x !== 'reveal:close');
    if (!key) return;
    await click(ctx, key);
  }
}

/**
 * 结束页的成就、解锁弹窗在过场演完才弹，慢的时候比 dismissEndDialogs 的第一次检查还晚，
 * 关完弹窗马上去点按钮会点在弹窗底下（1920 冒烟踩过）：等到要点的按钮在、且一段时间里没有新弹窗再走。
 */
export async function settleEnd(ctx: Ctx, key: string): Promise<void> {
  // 成就弹窗要等图标生成完才弹，忙的时候晚好几秒：连着三次（约 3.6 秒）都没有弹窗才算稳
  let calm = 0;
  for (let k = 0; k < 15 && calm < 3; k++) {
    await dismissEndDialogs(ctx);
    await ctx.page.waitForTimeout(1200);
    const keys = Object.keys(await controls(ctx));
    calm = keys.includes(key) && !keys.some((x) => x.endsWith(':ok')) ? calm + 1 : 0;
  }
  if (calm >= 3) return;
  throw new Error(`[${ctx.name}] 结束页：等不到 ${key}（弹窗关不完）`);
}

/** 0.24 起结束页不再自动弹「这段日子」：等成绩页出来，点页上的「这段日子」按钮，再等故事面板。 */
export async function openStory(ctx: Ctx): Promise<void> {
  await waitFor(ctx, '结束页的「这段日子」按钮', `g.scene === 'end' && 'reveal' in g.controls()`);
  await dismissEndDialogs(ctx);
  await click(ctx, 'reveal');
  await waitFor(ctx, '这段日子', `'reveal:close' in g.controls()`);
}

/** 点推荐卡上的"买入"：0.4 C 的局会先弹"买多少"，这时选"试一口"（旧流程的买 1 份）。 */
export async function buyVia(ctx: Ctx, key: string, touch = false): Promise<void> {
  if (touch) await tap(ctx, key);
  else await click(ctx, key);
  await ctx.page.waitForTimeout(150);
  const c = await controls(ctx);
  if ('size:taste' in c) {
    if (touch) await tap(ctx, 'size:taste');
    else await click(ctx, 'size:taste');
  }
}

export async function hover(ctx: Ctx, x: number, y: number): Promise<void> {
  const p = await toPage(ctx, x, y);
  await ctx.page.mouse.move(p.x, p.y);
  await ctx.page.waitForTimeout(120);
}

/** 在世界坐标 (x, y) 处点一下鼠标。 */
export async function clickAt(ctx: Ctx, x: number, y: number): Promise<void> {
  const p = await toPage(ctx, x, y);
  await ctx.page.mouse.click(p.x, p.y);
}

export async function tap(ctx: Ctx, key: string): Promise<void> {
  const p = await point(ctx, key);
  await ctx.page.touchscreen.tap(p.x, p.y);
}

/**
 * 触屏长按（Playwright 的 touchscreen 只有点按，长按走 CDP 直接发触摸事件）。
 * 不按固定时长等：等到游戏真的认了长按（调试桥 longPresses 加一，说明钉住）再松手，和负载无关，也和真人一样「看到说明才松手」。
 * 机器很忙时长按计时器走得慢，按满固定时长也未必到点，松手就成了点击（11-03 负载 28 下误买过）。
 * 上限 30 秒真实时间：机器满载、只有三四帧时，从按下到长按生效实测要 5–10 秒。
 * during：按下之后、松手之前做的事。传了就是「按住时整个场景重建」：旧场景的长按计时器跟着没了，说明不会出来，
 * 这时改等按住满长按时长的两倍（按真实时间，和 ui/button.ts 判断「重建后按满长按」用的指针时间一致）再松手。
 */
export async function longPress(ctx: Ctx, key: string, during?: () => Promise<void>): Promise<void> {
  const p = await point(ctx, key);
  const n0 = await ctx.page.evaluate(() => window.__game?.longPresses ?? 0);
  const cdp = await ctx.page.context().newCDPSession(ctx.page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
  const down = await ctx.page.evaluate(() => performance.now());
  if (during) {
    await during();
    const left = 2 * LONG_PRESS_MS - ((await ctx.page.evaluate(() => performance.now())) - down);
    if (left > 0) await ctx.page.waitForTimeout(left);
  } else {
    const deadline = Date.now() + 30_000;
    while ((await ctx.page.evaluate(() => window.__game?.longPresses ?? 0)) <= n0) {
      if (Date.now() > deadline) throw new Error(`[${ctx.name}] 按住 ${key} 30 秒，长按还没生效`);
      await ctx.page.waitForTimeout(300);
    }
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await ctx.page.waitForTimeout(150);
}

/** 触屏拖拽：从 from 按下，分几步挪到 to 再松手（和长按一样走 CDP 发触摸事件）。 */
export async function touchDrag(ctx: Ctx, from: string, to: string, steps = 8): Promise<void> {
  const a = await point(ctx, from);
  const b = await point(ctx, to);
  const cdp = await ctx.page.context().newCDPSession(ctx.page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
  for (let i = 1; i <= steps; i++) {
    await ctx.page.waitForTimeout(40);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps }] });
  }
  await ctx.page.waitForTimeout(120);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await ctx.page.waitForTimeout(150);
}

export async function shot(ctx: Ctx, file: string, clip?: { x: number; y: number; width: number; height: number }): Promise<void> {
  const path = `${OUT}/${file}.png`;
  // 裁切框是按电脑 1280×720 写的；手机横屏一律截整屏
  await ctx.page.screenshot(clip && !PHONE ? { path, clip } : { path });
  shots.push(path);
}

/**
 * 动画中途截图：在 since 之后出现 type 这个 cue、再过 delay 毫秒时由页面自己冻结画面（暂停场景更新），截完再继续。
 * 冻结在页面内计时：软件渲染下一帧上百毫秒、自动化往返能到 1 秒，从外面轮询会错过账单这类停留不长的画面。
 * delay 额外加 150ms，与以前「等待 + 往返」的效果大致相当。
 * 中途截图不做逐像素比对：冻结点按真实时间落在动画的某一帧，机器快慢不同，同一份代码两次也会差几帧（结算、涨跌停、账单这些）。
 * 文件名记进输出目录的 midway.txt，比对两次截图时跳过这些，只人工看有没有画错。
 */
export async function cueShot(ctx: Ctx, type: string, since: number, delay: number, file: string): Promise<void> {
  await ctx.page.evaluate(([t, s, ms]) => window.__game?.freezeAfterCue(t, s, ms), [type, since, delay + 150] as const);
  await waitFor(ctx, `cue ${type} + ${delay + 150}ms 冻结`, 'g.frozen');
  await ctx.page.waitForTimeout(150);
  await shot(ctx, file);
  appendFileSync(join(OUT, 'midway.txt'), `${file}.png\n`);
  await ctx.page.evaluate(() => window.__game?.freeze(false));
}

/**
 * 播完再截：等画面静下来（补间、计时器、粒子、相机效果都结束）由页面自己冻结，再截、再继续。
 * 取代「waitForTimeout 之后直接截」——软件渲染下同样的真实时间能跑出不同的帧数。between 在冻结之后、截图之前做检查。
 * 最多等 maxMs 毫秒游戏时间；超时（有永不结束的动画）记一条说明，这张图可能不可复现。
 */
export async function quietShot(ctx: Ctx, file: string, between?: () => Promise<void>, maxMs = 6000): Promise<void> {
  await ctx.page.evaluate((m) => window.__game?.freezeWhenQuiet(m), maxMs);
  await waitFor(ctx, '画面静下来后冻结', 'g.frozen');
  if (await ctx.page.evaluate(() => window.__game?.quietTimedOut ?? false)) notes.push(`${file}：${maxMs}ms 内画面没静下来，可能不可复现`);
  await between?.();
  await shot(ctx, file);
  await ctx.page.evaluate(() => window.__game?.freeze(false));
}

/** 正在显示的教程步骤（没有为 null）。 */
export async function guideStep(ctx: Ctx): Promise<string | null> {
  const r = await ctx.page.evaluate(() => Object.keys(window.__game?.regions() ?? {}).find((k) => k.startsWith('guide:')) ?? null);
  return r ? r.slice('guide:'.length) : null;
}

/** 教程气泡不能盖住要点的控件。 */
export async function expectNotCovered(ctx: Ctx, key: string): Promise<void> {
  const info = await ctx.page.evaluate((k) => {
    const g = window.__game;
    if (!g) return null;
    const box = Object.entries(g.regions()).find(([n]) => n.startsWith('guide:'))?.[1];
    return { box, p: g.controls()[k] };
  }, key);
  if (!info?.box || !info.p) return;
  const { box, p } = info;
  softExpect(!(p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h), `[${ctx.name}] 教程气泡盖住了 ${key}`);
}

export async function press(ctx: Ctx, key: string): Promise<void> {
  await ctx.page.keyboard.press(key);
}

export async function clock(ctx: Ctx): Promise<number> {
  return ctx.page.evaluate(() => Math.round(performance.now()));
}

export async function state<T>(ctx: Ctx, expr: string): Promise<T> {
  return (await ctx.page.evaluate(`(() => { const s = window.__game.state(); return ${expr}; })()`)) as T;
}

/** 画面上所有文字（显示列表里的 text:） */
export async function texts(ctx: Ctx): Promise<string[]> {
  return (await ctx.page.evaluate(() => window.__game?.displayList() ?? [])).filter((t) => t.startsWith('text:')).map((t) => t.slice(5));
}

export async function hasText(ctx: Ctx, part: string): Promise<boolean> {
  return (await texts(ctx)).some((t) => t.includes(part));
}

export function expect(ok: boolean, msg: string): void {
  if (!ok) throw new Error(msg);
}

export function softExpect(ok: boolean, msg: string): void {
  if (!ok) errors.push(msg);
}

// 外面用 timeout 限时跑（浏览器锁每次最多 10 分钟）：被停时先把已经记下的软失败打出来，不然什么都看不到
process.once('SIGTERM', () => {
  console.log(`\n被停了（超时）。到这里为止的软失败（${errors.length}）：\n${errors.map((e) => `  ${e}`).join('\n') || '  无'}`);
  process.exit(124);
});

export async function loadState(ctx: Ctx, s: GameState): Promise<void> {
  await ctx.page.evaluate((st) => window.__game?.loadState(st), s);
  await waitIdle(ctx, 'loadState');
}

// ---------------------------------------------------------------- 在 node 里找局面

/** 只开盘不操作地推进；月底奖励都不要、事件选第一个。 */
export function step(s: GameState): { state: GameState; events: GameEvent[] } {
  const a: Action = s.phase === 'reward' ? { type: 'skipReward' } : s.phase === 'event' ? { type: 'choose', option: 0 } : { type: 'open' };
  const r = dispatch(s, a);
  if (r.error) throw new Error(`推进失败：${r.error}`);
  return r;
}

/** 找第一个「开盘后满足 pred」的交易日，返回开盘前的局面。 */
export function findDay(setup: RunSetup, pred: (events: GameEvent[]) => boolean, prefix: string, maxDays = 40, ok: (s: GameState) => boolean = () => true): { seed: string; state: GameState } {
  for (let i = 0; i < 300; i++) {
    const seed = `${prefix}-${i}`;
    let s = createRun(seed, setup).state;
    for (let d = 0; d < maxDays && (s.phase === 'premarket' || s.phase === 'reward' || s.phase === 'event'); ) {
      const r = step(s);
      if (s.phase === 'premarket') {
        d += 1;
        if (ok(s) && pred(r.events)) return { seed, state: s };
      }
      s = r.state;
    }
  }
  throw new Error(`找不到局面：${prefix}`);
}

/** 推进到第 n 个交易日的盘前（0 起）。 */
export function advanceTo(seed: string, setup: RunSetup, day: number): GameState {
  let s = createRun(seed, setup).state;
  while (!(s.phase === 'premarket' && s.dayIndex >= day)) {
    if (s.phase === 'won' || s.phase === 'lost') throw new Error(`推进到第 ${day} 天前本局结束`);
    s = step(s).state;
  }
  return s;
}

export const THEMES6 = 'ai,newenergy,consumer,pharma,lowalt,pig';
export const T6 = THEMES6.split(',') as RunSetup['themes'];
export const CHAIN_SETUP: RunSetup = { themes: T6, holdings: ['ai_leader', 'ai_follower', 'la_leader', 'la_follower'], items: ['longtou', 'genfeng', 'margin'] };
export const LIMIT_SETUP: RunSetup = { themes: T6, holdings: ['ai_meme', 'pig_meme', 'la_meme', 'ne_meme'] };
export const BASIC_SETUP: RunSetup = { themes: T6, holdings: ['ai_leader', 'con_blue', 'pig_leader'] };

export function setupQuery(setup: RunSetup): string {
  const q: string[] = [];
  if (setup.themes) q.push(`themes=${setup.themes.join(',')}`);
  if (setup.holdings) q.push(`holdings=${setup.holdings.join(',')}`);
  if (setup.items) q.push(`items=${setup.items.join(',')}`);
  if (setup.account !== undefined) q.push(`account=${setup.account}`);
  return q.join('&');
}

export async function dialogOpen(ctx: Ctx, key: string): Promise<void> {
  await waitFor(ctx, `对话框 ${key}`, `${JSON.stringify(key)} in g.controls()`);
  await ctx.page.waitForTimeout(250);
}
