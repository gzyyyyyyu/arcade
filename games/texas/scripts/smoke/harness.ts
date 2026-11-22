/** 冒烟的公共部分：起 Worker、假平台、浏览器上下文、控制台错误收集、量遮挡和滚动的小工具。 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { opt } from '../args.ts';

export const HANDS = Number(opt('hands', '30'));
export const SHOTS = opt('shots', join(tmpdir(), 'texas-shots'));
/** 电脑的窗口大小（art v3：改前改后在 1280、1920 各截一套），--desk 1920x1080 */
export const [DESK_W, DESK_H] = opt('desk', '1280x720').split('x').map(Number) as [number, number];
mkdirSync(SHOTS, { recursive: true });

const ROOT = new URL('../..', import.meta.url).pathname;
export const errors: string[] = [];
/** 开房的 409（has_room）按页面记数：0.2.4 起不该再有，最后核对是 0 */
export const allowed409: Record<string, number> = {};
export const log = (...a: unknown[]): void => console.log('[smoke]', ...a);

function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => ok(p));
    });
    s.on('error', fail);
  });
}

/** 平台模式用测试配置加假平台；单独部署用原样的 wrangler.jsonc（入口多导出了东西、配置写错，这里就起不来） */
export const PLATFORM_CONFIG = ['-c', 'test/wrangler.smoke.jsonc', '-c', 'test/arcade.dev.jsonc'];
export const STANDALONE_CONFIG = ['-c', 'wrangler.jsonc'];

async function startWorker(port: number, state: string, config: string[]): Promise<ChildProcess> {
  const origin = `http://localhost:${port}`;
  const p = spawn('npx', ['wrangler', 'dev', ...config, '--ip', '127.0.0.1', '--port', String(port), '--persist-to', state, '--var', `SITE_ORIGIN:${origin}`], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let out = '';
  p.stdout!.on('data', (d) => (out += d));
  p.stderr!.on('data', (d) => (out += d));
  for (let i = 0; i < 120; i++) {
    try {
      // 平台模式没登录 302 到登录页，单独部署直接回页面
      const r = await fetch(`${origin}/games/texas/`, { redirect: 'manual' });
      if (r.status === 302 || r.status === 200) return p;
    } catch {
      // 还没起来
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`wrangler dev did not start:\n${out.slice(-2000)}`);
}

/** 平台的接口：/api/me 认 cookie 里的人，云存档存在内存里 */
async function fakePlatform(ctx: BrowserContext, userId: string, scores: unknown[] = []): Promise<void> {
  let rev = 0;
  // 每日榜交分（POST /api/scores）：记下请求体，--only pushfold 的今日局核对
  await ctx.route((u) => u.pathname === '/api/scores', (route) => {
    scores.push(route.request().postDataJSON());
    return route.fulfill({ json: { best: 1, improved: true } });
  });
  let data: unknown = null;
  // 回大厅跳到的平台首页
  await ctx.route((u) => u.pathname === '/', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>大厅</title>大厅' }));
  // 报位置、收邀请、叫人、报名场面（kit 的 social，docs/social.md 1.2、1.3，平台 15.17）：位置、名场面收下，邀请一条都没有，好友一个、叫他就成
  await ctx.route(/\/api\/(presence|invites|friends|feed)/, (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path.startsWith('/games/')) return route.continue();
    if (path === '/api/friends') return route.fulfill({ json: { friends: [{ userId: 'u-pal', displayName: '老王', online: true }] } });
    if (req.method() === 'GET') return route.fulfill({ json: { invites: [] } });
    return path === '/api/invites' ? route.fulfill({ json: { id: 'inv-1' } }) : route.fulfill({ status: 204 });
  });
  await ctx.route(/\/api\/(me|saves)/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname.startsWith('/games/')) return route.continue();
    if (url.pathname === '/api/me') return route.fulfill({ json: { user: { id: userId, displayName: '冒烟测试', username: 'smoke' }, saves: 'on' } });
    if (url.pathname === '/api/saves/texas' && req.method() === 'GET') return route.fulfill({ json: { saves: rev ? [{ slot: 'stats', rev, updatedAt: Date.now(), data }] : [] } });
    if (url.pathname === '/api/saves/texas/stats' && req.method() === 'PUT') {
      const b = req.postDataJSON() as { baseRev: number; data: unknown };
      if (b.baseRev !== rev) return route.fulfill({ status: 409, json: { error: 'conflict', current: rev ? { rev, data, updatedAt: Date.now() } : null } });
      rev++;
      data = b.data;
      return route.fulfill({ json: { rev, updatedAt: Date.now() } });
    }
    return route.fulfill({ status: 404, json: { error: 'not_found' } });
  });
}

export async function newContext(browser: Browser, base: string, userId: string, device: Parameters<Browser['newContext']>[0] = {}, guide = false, scores: unknown[] = []): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width: DESK_W, height: DESK_H }, ...device });
  await cspWatch(ctx);
  // 新手指引（src/guide.ts）第一次轮到我时会盖住整页：别的流程不是在测它，先记成走完；--only guide 自己带着全新的状态进来
  if (!guide)
    await ctx.addInitScript(() => {
      if (!localStorage.getItem('texas.guide')) localStorage.setItem('texas.guide', JSON.stringify({ v: 1, done: true, seen: ['result', 'showdown', 'raise'] }));
    });
  // 平台的两个 cookie（__Host- 的不能带 Domain；CDP 这里要写 domain，浏览器照样当 host-only，localhost 算安全来源）
  const host = new URL(base).hostname;
  await ctx.addCookies([
    { name: '__Host-sid', value: userId, domain: host, path: '/', secure: true },
    { name: '__Host-arcade_li', value: '1', domain: host, path: '/', secure: true },
  ]);
  await fakePlatform(ctx, userId, scores);
  return ctx;
}

/** 页面的 CSP（0.17.1）：违规（拦了的、只报不拦的）都在控制台记一条错误，冒烟按零报错查 */
export async function cspWatch(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript(() =>
    document.addEventListener('securitypolicyviolation', (e) => console.error(`csp ${e.disposition}: ${e.effectiveDirective} ${e.blockedURI}`)),
  );
}

export function watch(page: Page, tag: string, allow409 = false): void {
  let rooms409 = 0;
  page.on('response', (r) => {
    if (process.env.SMOKE_STACK && r.status() === 404) console.log('[404]', tag, r.url());
    if (r.status() === 409 && new URL(r.url()).pathname.endsWith('/rooms')) allowed409[tag] = ++rooms409;
  });
  page.on('console', (m) => {
    // 浏览器把 409 记成一条"Failed to load resource"：这个页面本该有一次（另一台设备开房），多了、少了最后核对
    if (allow409 && m.type() === 'error' && /409/.test(m.text()) && rooms409 <= 1) return;
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${tag}] console.${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}${process.env.SMOKE_STACK ? '\n' + e.stack : ''}`));
}

/**
 * 可复现的截图（scenes 用）：同一份构建跑两次要逐像素一致。
 * 动画停在终态、光标藏起来，再连续截到两张一样才算数（电脑说话的气泡、淡入这些到点就收，等它们落定）。
 * 最后一次仍不一致就把最后一张写出去并返回 false。
 */
export async function stableShot(page: Page, path: string): Promise<boolean> {
  // 电脑说话的气泡、飞行的筹码和庆祝字播完才截：它们出现与否取决于计时，会让两次运行差一块
  await page.waitForFunction(() => !document.querySelector('.fx .speech, .fx .fx-big, .fx .fx-burst, .fx .fx-beat, .fx .fx-coin'), null, { timeout: 8_000 }).catch(() => undefined);
  // 牌面的圆角裁剪（.c-face 的 overflow:hidden）：翻牌、飞牌动画播过的牌，浏览器留着动画时的栅格，边缘抗锯齿和重新画的差一两级灰度，
  // 每次留的不一样。截图前让牌面不再裁剪（内容本来就在圆角里面），逼它按终态重画；要在牌已经画出来之后加，一开始就加没用（实测）
  // 头像也一样：电脑头像右下的小标（.seat.house .avatar::after）压在圆形裁剪的边上，换成看起来一模一样的 overflow:clip 逼它重画，小标再单独放一层（只换裁剪不够，11-03 实测还会换一家差几像素）
  // 每次截都先拆掉上一次的再重加，否则第二张（之后的局面）等于没重画
  await page.evaluate(() => {
    document.getElementById('shot-fix')?.remove();
    const st = document.createElement('style');
    st.id = 'shot-fix';
    st.textContent = '.c-face{overflow:visible!important}.seat .avatar{overflow:clip!important}.seat.house .avatar::after{will-change:transform}';
    document.head.append(st);
  });
  await page.waitForTimeout(300);
  const take = (): Promise<Buffer> => page.screenshot({ animations: 'disabled', caret: 'hide' });
  let prev = await take();
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(250);
    const cur = await take();
    if (cur.equals(prev)) {
      writeFileSync(path, cur);
      return true;
    }
    prev = cur;
  }
  writeFileSync(path, prev);
  return false;
}

/** 复现用的页面环境：随机数、时间钉死（电脑的表情、闲话、计时圈都不再随机） */
export async function pinPage(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript(() => {
    // 牌的 preserve-3d 让浏览器给每张牌各开一层、牌面的圆角裁剪（overflow:hidden）又套一层，边缘抗锯齿每次差一两级灰度；
    // 压成 flat、牌面不裁剪后逐像素稳定（牌面内容本来就在圆角里面，肉眼看不出区别；实测只开其中一个都不够）
    document.addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style');
      st.textContent = '*,*::before,*::after{transform-style:flat!important}';
      document.head.append(st);
    });
    let a = 0x9e3779b9;
    Math.random = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // 下一手的牌、电脑决定的熵取自 crypto：单独一条序列，不和画面层的 Math.random 抢（说话的次数看计时，会把序列错开）
    let c = 0x1234abcd;
    const nat = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = ((arr: ArrayBufferView) => {
      if (!(arr instanceof Uint32Array)) return nat(arr as never);
      for (let i = 0; i < arr.length; i++) {
        c = (c + 0x6d2b79f5) | 0;
        let t = Math.imul(c ^ (c >>> 15), 1 | c);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        arr[i] = (t ^ (t >>> 14)) >>> 0;
      }
      return arr;
    }) as typeof crypto.getRandomValues;
  });
}

export const shot = async (page: Page, name: string): Promise<void> => {
  // 弹窗、加注面板有 0.2 秒的淡入
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
  log('shot', name);
};

export async function balance(page: Page): Promise<number> {
  const t = (await page.locator('.w-balance').textContent()) ?? '';
  return Number(t.replace(/,/g, ''));
}

/** 旧的三页弹窗提示（新手指引取代了它，别的流程已预先记成走完）：留着兜底，没有弹窗就马上返回 */
export async function skipTips(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const d = page.locator('.dialog');
    if (!(await d.isVisible().catch(() => false))) {
      await page.waitForTimeout(300);
      if (!(await d.isVisible().catch(() => false))) return;
    }
    await page.locator('.d-btn.primary').click();
  }
}

export const handText = async (page: Page): Promise<number> => Number(((await page.locator('.hand-no').textContent()) ?? '').replace(/\D/g, '')) || 0;

/** 一手打完停着（0.1.1）：结果条亮着、"下一手"在，等 5 秒不点也不发 */
export async function assertHeld(page: Page, tag: string): Promise<void> {
  const no = await handText(page);
  if (!(await page.locator('.result.on').isVisible())) throw new Error(`[${tag}] no result bar after hand ${no}`);
  await shot(page, `${tag}-hand-end`);
  await page.waitForTimeout(5_000);
  const phase = await page.locator('.stage').getAttribute('data-phase');
  if ((await handText(page)) !== no || phase !== 'idle') throw new Error(`[${tag}] dealt hand ${await handText(page)} (${phase}) without "下一手"`);
  if (!(await page.locator('.next-hand').isVisible()) || !(await page.locator('.result.on').isVisible())) throw new Error(`[${tag}] result or "下一手" went away`);
  log(tag, `hand ${no} held 5s until "下一手"`);
}

/** 自动下一手：打开后有倒计时圈，不点也会发（下一次停下时由 playUntil 关掉） */
export async function assertAutoNext(page: Page): Promise<void> {
  await page.locator('.auto-next').click();
  if (!(await page.locator('.auto-next.sel').isVisible()) || !(await page.locator('.next-ring:not(.hidden)').isVisible())) throw new Error('auto next: no countdown ring');
  await shot(page, 'auto-next');
  const no = await handText(page);
  const t0 = Date.now();
  while ((await handText(page)) === no) {
    if (Date.now() - t0 > 10_000) throw new Error('auto next did not deal');
    await page.waitForTimeout(100);
  }
  log(`auto next dealt hand ${no + 1} after ${Date.now() - t0} ms`);
}

/** 自动打到第 n 手打完；大多跟注过牌，偶尔加注、弃牌，让各条路都走到。一手打完点"下一手"（第一次先核对不点不发、再试一次自动下一手） */
/** 加注面板盖住了几个座位的头像或名牌（单机打磨时加的检查）；只留名牌的座位（.tucked，0.9.0）头像藏着，不算 */
export const coveredSeats = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const r = document.querySelector('.raise-panel')!.getBoundingClientRect();
    return [...document.querySelectorAll('.seat:not(.empty)')].filter((seat) =>
      [...seat.querySelectorAll(seat.classList.contains('tucked') ? '.plate' : '.avatar, .plate')].some((e) => {
        const b = e.getBoundingClientRect();
        return b.right > r.left && b.left < r.right && b.bottom > r.top && b.top < r.bottom;
      }),
    ).length;
  });

/** 座位之间互相压着的对数（头像、名牌；0.9.0：原来挪开的座位会压到别的座位上，上面那个检查看不出来） */
export const seatOverlaps = (page: Page): Promise<number> =>
  page.evaluate(() => {
    // 0.18.3 起连动作签一起算：挪开的座位的签原来压在上一家的名牌上
    const boxes = [...document.querySelectorAll('.seat:not(.empty)')].map((seat) =>
      [...seat.querySelectorAll(seat.classList.contains('tucked') ? '.plate' : '.avatar, .plate, .bubble.on')].map((e) => e.getBoundingClientRect()),
    );
    let n = 0;
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++)
        if (boxes[i]!.some((a) => boxes[j]!.some((b) => a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom))) n++;
    return n;
  });

/** 0.18.0 起标题页先是主页：在主页就点模式卡，已经在选桌就点上面的玩法按钮 */
export async function enter(page: Page, mode: '娱乐' | '实盘' | '好友房', tap = false): Promise<void> {
  const id = { 娱乐: 'fun', 实盘: 'real', 好友房: 'room' }[mode];
  const card = page.locator(`.mcard[data-mode="${id}"]`);
  const target = (await card.isVisible()) ? card : page.locator('.lobby .mode', { hasText: mode });
  await (tap ? target.tap() : target.click());
}

/**
 * 按朋友的链接（?room=）进了还没开打的好友房：页面替他坐第一个空位（0.41.4）；实盘房先问一句"坐下"（开打时从钱包带入），点了才坐
 */
export async function linkSit(page: Page, tap = false): Promise<void> {
  await page.locator('.rw-seat.me, .mask .dialog').first().waitFor({ timeout: 20_000 });
  if (await page.locator('.mask .dialog').isVisible()) {
    const title = (await page.locator('.mask .d-title').textContent()) ?? '';
    if (title !== '坐下') throw new Error(`link join: unexpected dialog ${title}`);
    const ok = page.locator('.mask .d-btn.primary');
    await (tap ? ok.tap() : ok.click());
  }
  await page.locator('.rw-seat.me').waitFor();
}

/** 选桌页的选项不折叠（0.34.0）：人数、带多少、止盈、各玩法入口一直摆在页面上，不用展开；留着这个空操作，免得每处调用都改 */
export async function openMore(_page: Page, _tap = false): Promise<void> {}

export const PHONE = {
  viewport: { width: 844, height: 390 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};

export const handNo = async (page: Page): Promise<number> =>
  (await page.locator('.stage').evaluate((e) => e.classList.contains('at-table')))
    ? Number(((await page.locator('.hand-no').textContent()) ?? '').replace(/\D/g, '')) || 0
    : 0;

/** 钱包里那一桌好友房结回来了（大厅不再提示"好友房里还有一桌"） */
export async function settled(page: Page, tag: string): Promise<number> {
  for (let i = 0; i < 60; i++) {
    await page.goto(page.url().split('?')[0]!);
    await page.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
    await page.waitForTimeout(300);
    const note = (await page.locator('.note').isVisible()) ? await page.locator('.note').textContent() : '';
    if (!note?.includes('好友房里还有一桌')) return balance(page);
    await page.waitForTimeout(2_000);
  }
  throw new Error(`[${tag}] room seat never settled back to the wallet`);
}

/**
 * 单机锦标赛（--only tour，0.23.0）：娱乐锦标赛进去，一直跟注到被淘汰或打完；淘汰了点"现在离开"；
 * 看到结束页，名次在 1–6，前三名三行；顶上写"锦标赛 · 第 N 级"，桌上没有止盈旗子；选桌里"坐下开打"和锦标赛入口都在第一屏
 */
/** 名牌上的标签（锦标赛出局的"输光"等）不压名字（0.25.2）；返回这次查到几个标签 */
export async function badgesClear(page: Page): Promise<number> {
  const r = await page.evaluate(() => {
    const seats = [...document.querySelectorAll('.seat')].filter((seat) => seat.querySelector('.badge.on'));
    const covered = seats.flatMap((seat) => {
      const b = seat.querySelector('.badge.on')!.getBoundingClientRect();
      const n = seat.querySelector('.plate .name')?.getBoundingClientRect();
      if (!n?.width) return [];
      const dy = Math.min(b.bottom, n.bottom) - Math.max(b.top, n.top);
      const dx = Math.min(b.right, n.right) - Math.max(b.left, n.left);
      return dx > 0 && dy > 1 ? [`${seat.querySelector('.plate .name')?.textContent} ${Math.round(dy)}px`] : [];
    });
    return { covered, n: seats.length };
  });
  if (r.covered.length) throw new Error(`seat badge covers the name: ${r.covered.join(', ')}`);
  return r.n;
}

/** 起一个 wrangler dev，跑完关掉、删掉它的本地存储 */
export async function withWorker(config: string[], run: (base: string) => Promise<void>): Promise<void> {
  const port = await freePort();
  const state = mkdtempSync(join(tmpdir(), 'texas-smoke-'));
  const worker = await startWorker(port, state, config);
  try {
    await run(`http://localhost:${port}`);
  } finally {
    if (worker.pid) process.kill(-worker.pid, 'SIGTERM');
    rmSync(state, { recursive: true, force: true });
  }
}
