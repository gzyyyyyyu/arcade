/**
 * 无头浏览器冒烟：node tools/smoke.ts
 *
 * 仓库硬规范要求每个游戏都有的一份：主流程控制台零报错，加上手机平板（尤其 iOS）的四个坑——
 * 省内存设备（?lowmem）、双指放大、WebGL 上下文丢失 / 恢复、对局中点"回大厅"先确认、手机竖屏菜单点"回大厅"。
 * 自己起 vite（临时端口，不占 5178/4178），浏览器启动参数同 shot.ts；任一项失败就打印原因并退出码 1。
 * 机器上有别的模拟在占 CPU 时慢一点没关系，等待都放得比较宽。
 *
 * 共十段，各段做什么写在下面每段开头（第 10 段试炼排在第 7 段前面）。`--only 5,6` 只跑其中几段；第 8 段（噩梦 3 × 每张守夜图）默认不跑，要点名：`--only 8 --out <目录>`。
 * 第 9 段的实盘只量选模式页、不点开始：开发服务器没有钱包，带入会报 bad_reply。有意的裁剪登记在 `CLIP_WHITELIST` 并写理由。
 */
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { createServer } from 'vite';
import { MAP_IDS } from '../src/content/maps.ts';

const problems: string[] = [];
const fail = (m: string): void => {
  problems.push(m);
  console.error(`失败：${m}`);
};
const ok = (m: string): void => console.log(`通过：${m}`);

const server = await createServer({ logLevel: 'warn', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
await server.listen();
const addr = server.httpServer?.address();
if (!addr || typeof addr === 'string') throw new Error('vite 没有监听端口');
const ORIGIN = `http://127.0.0.1:${addr.port}`;

/** --only 5,6：只跑这几段（本机验一个 PR 时用，整套交给 CI） */
const ONLY_ARG = process.argv.indexOf('--only');
const ONLY = ONLY_ARG >= 0 ? (process.argv[ONLY_ARG + 1] ?? '').split(',').map(Number) : null;
const want = (n: number): boolean => !ONLY || ONLY.includes(n);
/** --out <目录>：第 8、10 段截图放这里（不给不截） */
const SHOT_DIR = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1]! : '';

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--no-proxy-server', '--no-zygote', '--in-process-gpu'] });

// ---- 两项检查（同一段在 audit.mjs / check.mjs / game.mjs / 冒烟第 9 段里复制）----
// 白名单：[选择器, 理由]。命中的元素（含其后代）不报。
const OVERLAP_WHITELIST: [string, string][] = [
  // 目前为空：可点元素重叠没有有意的例外
];
const CLIP_WHITELIST: [string, string][] = [
  ['.yx-avatar', '头像图片故意放大裁在圆里，不是文字'],
];
// 在页面里执行：返回问题字符串数组。可点元素两两不相交 + 文字不被裁
const EXTRA_CHECKS = `(() => {
  const OL = ${JSON.stringify(OVERLAP_WHITELIST)}, CL = ${JSON.stringify(CLIP_WHITELIST)};
  const r = [];
  const vis = (el) => { try { return el.checkVisibility({ opacityProperty: true, visibilityProperty: true }); } catch { return el.offsetParent !== null; } };
  const cn = (e) => (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : e.tagName.toLowerCase());
  const nm = (el) => cn(el) + (el.textContent.trim() ? '「' + el.textContent.trim().replace(/\\s+/g, ' ').slice(0, 8) + '」' : '');
  const wl = (el, list) => list.some(([s]) => el.closest(s));
  // 可见区域 = 自身矩形 ∩ 所有裁剪祖先矩形 ∩ 视口；为空说明被裁掉或滚出去了
  const shown = (el) => {
    const b = el.getBoundingClientRect();
    let l = Math.max(b.left, 0), t = Math.max(b.top, 0), rt = Math.min(b.right, innerWidth), bt = Math.min(b.bottom, innerHeight);
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const q = p.getBoundingClientRect();
      l = Math.max(l, q.left); t = Math.max(t, q.top); rt = Math.min(rt, q.right); bt = Math.min(bt, q.bottom);
    }
    return rt - l > 0 && bt - t > 0 ? { l, t, r: rt, b: bt } : null;
  };
  const ov = (el) => { for (let p = el; p && p !== document.body; p = p.parentElement) { if (p.matches('[role=dialog],[role=alertdialog],[aria-modal],.yx-screen')) return p; const cs = getComputedStyle(p); if (cs.position === 'fixed' && parseInt(cs.zIndex, 10) >= 10) return p; } return null; };
  const SEL = 'button,a[href],[role=button],[data-a],input,select';
  const items = [];
  for (const el of document.querySelectorAll(SEL)) {
    if (!vis(el) || wl(el, OL) || getComputedStyle(el).pointerEvents === 'none') continue;
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) continue;
    const s = shown(el);
    if (!s) continue;
    // 中心点被不可点的东西（遮罩、弹窗）盖住的不算
    const top = document.elementFromPoint((s.l + s.r) / 2, (s.t + s.b) / 2);
    if (top && !el.contains(top) && !top.contains(el) && !top.closest(SEL)) continue;
    items.push({ el, s });
  }
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], c = items[j];
    if (a.el.contains(c.el) || c.el.contains(a.el)) continue;
    const pa = a.el.parentElement && a.el.parentElement.closest(SEL), pc = c.el.parentElement && c.el.parentElement.closest(SEL);
    if (pa && pa === pc) continue;
    // 一个在弹窗/浮层（role=dialog、.yx-screen 界面层、或 z-index≥10 的 fixed 层）里、另一个在它下面的页面上：被盖住，不算
    if (ov(a.el) !== ov(c.el)) continue;
    const w = Math.min(a.s.r, c.s.r) - Math.max(a.s.l, c.s.l), h = Math.min(a.s.b, c.s.b) - Math.max(a.s.t, c.s.t);
    if (w > 0 && h > 0 && w * h > 1) r.push('可点重叠 ' + nm(a.el) + ' × ' + nm(c.el) + ' ' + Math.round(w) + '×' + Math.round(h));
  }
  for (const el of document.body.querySelectorAll('*')) {
    if (['SCRIPT', 'STYLE', 'CANVAS'].includes(el.tagName) || !vis(el) || wl(el, CL)) continue;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const cs = getComputedStyle(el);
    const ell = cs.textOverflow === 'ellipsis';
    const clipX = (cs.overflowX !== 'visible' && !['auto', 'scroll'].includes(cs.overflowX)) || ell;
    const clipY = cs.overflowY !== 'visible' && !['auto', 'scroll'].includes(cs.overflowY);
    if (el.clientWidth > 0 && clipX && el.scrollWidth > el.clientWidth + 1) r.push('文字被裁 ' + nm(el) + ' 宽 ' + el.scrollWidth + '>' + el.clientWidth);
    if (el.clientHeight > 0 && clipY && el.scrollHeight > el.clientHeight + 1) r.push('文字被裁 ' + nm(el) + ' 高 ' + el.scrollHeight + '>' + el.clientHeight);
  }
  return [...new Set(r)];
})()`;

/** 开一个页面（手机横屏，触屏），控制台报错和未捕获异常记进 errs */
async function open(query: string, errs: string[], viewport = { width: 844, height: 390 }, init?: () => void): Promise<Page> {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  if (init) await page.addInitScript(init);
  page.setDefaultTimeout(30_000);
  page.on('console', (m) => {
    // SwiftShader 截图时的 GPU 驱动提示不是页面的问题
    if (m.type() === 'error' && !/GL Driver Message/.test(m.text())) errs.push(`控制台报错：${m.text()}`);
  });
  page.on('pageerror', (e) => errs.push(`未捕获异常：${e.message}`));
  await page.goto(`${ORIGIN}/?${query}`, { timeout: 90_000 });
  await page.waitForFunction(() => !!(window as unknown as { __yx?: unknown }).__yx, null, { timeout: 90_000 });
  return page;
}
/** 点开始并等到场上出怪 */
async function startRun(page: Page): Promise<void> {
  // 带 ?auto 时直接开打、没有菜单；没带就走菜单点"开始"
  const btn = page.locator('[data-a="quick"]').first();
  if (await btn.isVisible().catch(() => false)) await btn.click();
  await page.waitForFunction(() => {
    const w = (window as unknown as { __yx: { world: { eAlive: Uint8Array } | null } }).__yx.world;
    return !!w && w.eAlive.some((x) => x === 1);
  });
}
const report = (name: string, errs: string[]): void => (errs.length ? errs.forEach((e) => fail(`${name} ${e}`)) : ok(`${name} 零报错`));
const canvasBox = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector('canvas')!;
    const r = c.getBoundingClientRect();
    return { w: c.width, h: c.height, x: Math.round(r.x), y: Math.round(r.y), cw: Math.round(r.width), ch: Math.round(r.height), app: getComputedStyle(document.documentElement).getPropertyValue('--app-h') };
  });

// 选模式页的三项量测：页面和每一栏不滚动、按钮不伸出视口、可点元素不相交且文字不被裁（EXTRA_CHECKS）
const measureSel = async (page: Page, big = false): Promise<string[]> => {
  const bad = await page.evaluate((big) => {
    const r: string[] = [];
    const root = document.querySelector<HTMLElement>('.yx-selscreen')!;
    for (const el of [document.scrollingElement as HTMLElement, root, ...root.querySelectorAll<HTMLElement>('*')]) {
      if (el !== root && el !== document.scrollingElement && el.offsetParent === null) continue;
      if (el.scrollHeight > el.clientHeight + 1 && ['auto', 'scroll'].includes(getComputedStyle(el).overflowY)) r.push(`${el.className || el.tagName} 要滚 ${el.scrollHeight}>${el.clientHeight}`);
    }
    for (const b of root.querySelectorAll<HTMLElement>('button')) {
      if (b.offsetParent === null) continue;
      const q = b.getBoundingClientRect();
      if (q.bottom > innerHeight + 1 || q.right > innerWidth + 1 || q.top < -1 || q.left < -1) r.push(`「${b.textContent!.trim().slice(0, 8)}」伸出屏幕`);
    }
    // 电脑大屏（≥1440 宽）：整块按设计尺寸排好再整体 zoom（--k = min(宽/1476, 高/700)，限 1~1.6，取到 0.01；1920×911 是 1.3）。
    // 查 k 算得对、块真按 k 放大（宽 = 1100 × k，卡片不另外拉伸），渲染后的字 ≥12、按钮 ≥32（鼠标设备的下限）
    if (big) {
      const blk = root.querySelector<HTMLElement>('.yx-sel')!.getBoundingClientRect();
      const k = Number.parseFloat(root.style.getPropertyValue('--k')) || 1;
      const want = Math.max(1, Math.min(1.6, Math.floor(Math.min(innerWidth / 1476, innerHeight / 700) * 100 + 1e-6) / 100));
      if (Math.abs(k - want) > 0.001) r.push(`放大倍数 ${k} ≠ ${want}`);
      if (Math.abs(blk.width - 1100 * k) > 2) r.push(`块宽 ${blk.width.toFixed(0)} ≠ 1100×${k}`);
      for (const el of root.querySelectorAll<HTMLElement>('.yx-sel *')) {
        if (el.offsetParent === null || !el.checkVisibility()) continue;
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
        if (own && Number.parseFloat(getComputedStyle(el).fontSize) * k < 11.95) r.push(`字太小 ${el.className || el.tagName}「${el.textContent!.trim().slice(0, 6)}」`);
        if (el.matches('button') && el.getBoundingClientRect().height < 31.95) r.push(`按钮太矮「${el.textContent!.trim().slice(0, 6) || el.getAttribute('aria-label')}」${el.getBoundingClientRect().height.toFixed(1)}<32`);
      }
    }
    return r;
  }, big);
  const extra = (await page.evaluate(EXTRA_CHECKS)) as string[];
  bad.push(...extra);
  return bad;
};
try {
  // 1) 主流程：菜单 → 开打（机器人代打）→ 跑几秒
  if (want(1)) {
    const errs: string[] = [];
    const page = await open('', errs);
    await startRun(page);
    await page.waitForTimeout(5000);
    report('主流程', errs);
    await page.context().close();
  }
  // 2) 省内存设备
  if (want(2)) {
    const errs: string[] = [];
    const page = await open('lowmem&auto', errs);
    const low = await page.evaluate(() => (window as unknown as { __yx: { lowmem: boolean } }).__yx.lowmem);
    if (!low) fail('?lowmem 没有生效');
    await startRun(page);
    await page.waitForTimeout(4000);
    report('lowmem', errs);
    await page.context().close();
  }
  // 3) 双指放大：布局不动，缩回后正常
  if (want(3)) {
    const errs: string[] = [];
    const page = await open('auto', errs);
    await startRun(page);
    await page.waitForTimeout(1500);
    const before = await canvasBox(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    await page.waitForTimeout(800);
    const scale = await page.evaluate(() => window.visualViewport?.scale ?? 1);
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.waitForTimeout(800);
    const zoomedBox = await canvasBox(page);
    if (scale < 1.5) fail(`双指放大没有模拟成功（visualViewport.scale=${scale}）`);
    else if (JSON.stringify(before) !== JSON.stringify(zoomedBox)) fail(`放大时画布或布局变了：${JSON.stringify(before)} → ${JSON.stringify(zoomedBox)}`);
    else ok('双指放大时画布和布局不变');
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await page.waitForTimeout(800);
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.waitForTimeout(800);
    const back = await canvasBox(page);
    if (back.cw <= 0 || back.ch <= 0) fail('缩回 1 倍后画布消失');
    await page.waitForTimeout(1500);
    report('双指放大', errs);
    await page.context().close();
  }
  // 4) WebGL 上下文丢失 / 恢复
  if (want(4)) {
    const errs: string[] = [];
    const page = await open('auto', errs);
    await startRun(page);
    const tips = (): Promise<number> => page.locator('.yx-glitch').count();
    const lose = await page.evaluate(() => {
      const c = document.querySelector('canvas')!;
      const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGL2RenderingContext | WebGLRenderingContext | null;
      const ext = gl?.getExtension('WEBGL_lose_context');
      if (!ext) return false;
      ext.loseContext();
      (window as unknown as { __ext: unknown }).__ext = ext;
      return true;
    });
    if (!lose) fail('拿不到 WEBGL_lose_context，没法模拟上下文丢失');
    else {
      await page.waitForTimeout(1500);
      if ((await tips()) !== 0) fail('上下文刚丢就弹了提示（应该先等几秒）');
      await page.waitForTimeout(3500);
      const n = await tips();
      if (n !== 1) fail(`上下文丢了超过 3 秒，提示应该正好 1 条，实际 ${n}`);
      else ok('上下文丢失超过 3 秒出现 1 条提示');
      // 再丢一次也不能叠出第二条
      await page.evaluate(() => (window as unknown as { __ext: { restoreContext(): void } }).__ext.restoreContext());
      await page.waitForTimeout(2000);
      if ((await tips()) !== 0) fail('上下文恢复后提示没有收起');
      else ok('上下文恢复后提示收起');
    }
    // 恢复后的页面可能带出来 Phaser 的报错，也算
    report('上下文丢失/恢复', errs);
    await page.context().close();
  }
  // 5) 对局中点回大厅：先确认，确认后去 /
  if (want(5)) {
    const errs: string[] = [];
    const page = await open('', errs);
    const homeUrl = (u: URL): boolean => u.pathname === '/' && u.search === '';
    await page.route(homeUrl, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>大厅</title>' }));
    await startRun(page);
    await page.waitForTimeout(1500);
    const label = await page.locator('.yx-hud .yx-home').innerText();
    if (!label.includes('大厅')) fail(`对局里的回大厅按钮看不到「大厅」二字：${JSON.stringify(label)}`);
    await page.locator('.yx-hud .yx-home').click();
    const confirmBox = page.locator('.yx-confirm');
    await confirmBox.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => fail('点回大厅后没有出现确认弹层'));
    if (page.url().endsWith('/') && !page.url().includes('?')) fail('没确认就离开了');
    await Promise.all([page.waitForURL(`${ORIGIN}/`, { timeout: 20_000 }).catch(() => fail('确认后没有导航到 /')), page.locator('.yx-confirm [data-a="yes"]').click()]);
    if (page.url() === `${ORIGIN}/`) ok('对局中点回大厅：先确认，确认后去了 /');
    report('回大厅', errs);
    await page.context().close();
  }
  // 6) 手机竖屏的完整菜单（玩过一局）点回大厅：模式卡曾经叠在按钮上把点击截走
  if (want(6)) {
    const errs: string[] = [];
    const page = await open('', errs, { width: 390, height: 844 }, () => localStorage.setItem('yexun.save', JSON.stringify({ v: 1, runs: 1 })));
    await page.route((u: URL) => u.pathname === '/' && u.search === '', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>大厅</title>' }));
    await page.locator('.yx-homescreen .yx-quick').waitFor({ state: 'visible' }).catch(() => fail('竖屏没有出现完整主页'));
    // 不用 force：按钮被别的元素盖住时 playwright 会超时，正好就是要抓的问题
    await Promise.all([page.waitForURL(`${ORIGIN}/`, { timeout: 20_000 }).catch(() => fail('竖屏主页点回大厅没有去 /')), page.locator('.yx-homescreen .yx-home').click({ timeout: 10_000 }).catch(() => fail('竖屏菜单的回大厅点不到（被盖住）'))]);
    if (page.url() === `${ORIGIN}/`) ok('竖屏主页点回大厅：去了 /');
    report('竖屏菜单回大厅', errs);
    await page.context().close();
  }
  // 10) 试炼页 → 开第一关 → 认输 → 回试炼页：电脑 1280、手机竖屏各一遍；试炼页不滚动、卡片不伸出屏幕
  if (want(10)) {
    for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
      const errs: string[] = [];
      const name = `试炼 ${vp.width}×${vp.height}`;
      // 从主页的「试炼」按钮进；开发服务器没有平台，好友成绩的读榜截下来给一行假的（顺带看卡上写出来了）
      const page = await open('', errs, vp, () => localStorage.setItem('yexun.save', JSON.stringify({ v: 1, runs: 1 })));
      await page.route('**/api/boards/yexun/trial-*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: [{ rank: 1, displayName: '阿甲', score: 1e9 + 30, isMe: false }], me: null }) }));
      await page.locator('.yx-homescreen [data-a="trials"]').click();
      const card = page.locator('.yx-tr-card[data-id="chuye"]');
      await card.waitFor({ state: 'visible' }).catch(() => fail(`${name} 没有出现试炼页`));
      const bad = await page.evaluate(() => {
        const r: string[] = [];
        const root = document.querySelector<HTMLElement>('.yx-trials')!;
        for (const el of [document.scrollingElement as HTMLElement, root, ...root.querySelectorAll<HTMLElement>('*')]) {
          if (el.offsetParent === null && el !== document.scrollingElement) continue;
          if (el.scrollHeight > el.clientHeight + 1 && ['auto', 'scroll'].includes(getComputedStyle(el).overflowY)) r.push(`${el.className || el.tagName} 要滚`);
        }
        for (const b of root.querySelectorAll<HTMLElement>('button')) {
          if (b.offsetParent === null) continue;
          const q = b.getBoundingClientRect();
          if (q.bottom > innerHeight + 1 || q.right > innerWidth + 1) r.push(`「${b.textContent!.trim().slice(0, 6)}」伸出屏幕`);
        }
        return r;
      });
      for (const b of bad) fail(`${name} ${b}`);
      await page.waitForFunction(() => !!document.querySelector('.yx-tr-card[data-id="chuye"] .f')?.textContent, null, { timeout: 10_000 }).catch(() => fail(`${name} 卡上没写好友最好`));
      if (SHOT_DIR) await page.screenshot({ path: join(SHOT_DIR, `trials-${vp.width}.png`) });
      await card.click();
      await page.waitForFunction(() => (window as unknown as { __yx: { world: { trial: { id: string } | null } | null } }).__yx.world?.trial?.id === 'chuye');
      await page.waitForTimeout(2500);
      if (SHOT_DIR) await page.screenshot({ path: join(SHOT_DIR, `trial-run-${vp.width}.png`) });
      await page.locator('.yx-hud .yx-pause').click();
      await page.locator('.yx-pausescr [data-a="quit"]').click();
      await page.locator('.yx-confirm [data-a="yes"]').click();
      await page.locator('.yx-result [data-a="menu"]').click({ timeout: 20_000 }).catch(() => fail(`${name} 认输后没有结算页`));
      await card.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => fail(`${name} 结算页返回没有回到试炼页`));
      report(name, errs);
      await page.context().close();
    }
  }
  // 7) 对局 HUD 各块互不相交：手机竖屏、横屏 × 守夜、夜探；打开固定摇杆（和小地图都在左边）、不带 auto（新手提示条也在）
  if (want(7)) {
    const fixedStick = (): void => localStorage.setItem('yexun.settings', JSON.stringify({ fixedStick: true }));
    const views = [
      { name: '竖屏', size: { width: 390, height: 844 } },
      { name: '横屏', size: { width: 844, height: 390 } },
    ];
    const modes = [
      { name: '守夜', query: 'play' },
      { name: '夜探', query: 'raid=guzhen' },
    ];
    // 要互相避开的块：顶栏各件、夜探目标条和背包、小地图、法器格、提示条、固定摇杆
    const BLOCKS = ['.yx-hud .yx-home', '.yx-hud .yx-card', '.yx-hud .yx-timer', '.yx-hud .yx-caps', '.yx-hud .yx-pause', '.yx-hud .yx-bag', '.yx-hud .yx-rs', '.yx-hud .yx-mm', '.yx-hud .yx-slots', '.yx-hud .yx-skill', '.yx-tip', '.yx-stick'];
    for (const v of views) {
      for (const m of modes) {
        const errs: string[] = [];
        const tag = `HUD ${v.name}${m.name}`;
        const page = await open(m.query, errs, v.size, fixedStick);
        await startRun(page);
        await page.waitForTimeout(2500);
        const res = await page.evaluate((sels) => {
          const seen: { sel: string; x: number; y: number; w: number; h: number }[] = [];
          for (const sel of sels) {
            const e = document.querySelector<HTMLElement>(sel);
            if (!e) continue;
            const r = e.getBoundingClientRect();
            if (r.width < 1 || r.height < 1 || getComputedStyle(e).visibility === 'hidden') continue;
            seen.push({ sel, x: r.left, y: r.top, w: r.width, h: r.height });
          }
          const hit: string[] = [];
          for (let i = 0; i < seen.length; i++) {
            for (let j = i + 1; j < seen.length; j++) {
              const a = seen[i]!;
              const b = seen[j]!;
              const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
              const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
              if (ox > 1 && oy > 1) hit.push(`${a.sel} 与 ${b.sel} 相交 ${Math.round(ox)}×${Math.round(oy)}（${[a, b].map((q) => `${Math.round(q.x)},${Math.round(q.y)} ${Math.round(q.w)}×${Math.round(q.h)}`).join(' / ')}）`);
            }
          }
          const out = seen.filter((a) => a.x < -1 || a.y < -1 || a.x + a.w > innerWidth + 1 || a.y + a.h > innerHeight + 1).map((a) => `${a.sel} 超出屏幕`);
          return { names: seen.map((a) => a.sel), problems: [...hit, ...out] };
        }, BLOCKS);
        // 血条、计时一定要看得见（竖屏曾经被盖住）
        for (const need of ['.yx-hud .yx-hp', '.yx-hud .yx-timer', '.yx-hud .yx-caps']) if (!res.names.includes(need) && need !== '.yx-hud .yx-hp') fail(`${tag} 找不到 ${need}`);
        const hp = await page.locator('.yx-hud .yx-hp').boundingBox();
        if (!hp || hp.width < 30 || hp.height < 8) fail(`${tag} 血条太小或看不见：${JSON.stringify(hp)}`);
        // 头像血条那块只有一行高：0.3.0 菜单的地图卡也叫 .yx-card，样式串过来把它撑成一个高纸框（血条挤成小点）
        const card = await page.locator('.yx-hud .yx-card').boundingBox();
        if (!card || card.height > 64) fail(`${tag} 头像血条那块被撑高了：${JSON.stringify(card)}`);
        if (!res.names.includes('.yx-stick')) fail(`${tag} 固定摇杆没有显示，没法检查和小地图是否相交`);
        if (m.name === '夜探' && !res.names.includes('.yx-hud .yx-mm')) fail(`${tag} 看不到小地图`);
        res.problems.forEach((p) => fail(`${tag} ${p}`));
        if (!res.problems.length) ok(`${tag} 各块互不相交（${res.names.length} 块）`);
        report(tag, errs);
        await page.context().close();
      }
    }
  }
  // 8) 噩梦 3（危险 8）× 每张守夜图（maps.ts 的 MAP_IDS）：快进到第 4 分钟事件之后，夜色遮罩在、控制台零报错，每张图截一张
  //    （单独跑：--only 8；截图放 --out <目录>，不给就放系统临时目录）
  if (want(8) && ONLY) {
    const outArg = process.argv.indexOf('--out');
    const out = outArg >= 0 ? process.argv[outArg + 1]! : join(tmpdir(), 'yexun-smoke8');
    mkdirSync(out, { recursive: true });
    for (const map of MAP_IDS) {
      const errs: string[] = [];
      const page = await open(`danger=8&play&auto&map=${map}&warp=7300`, errs);
      await page.waitForTimeout(2500);
      const st = await page.evaluate(() => {
        const w = (window as unknown as { __yx: { world: { tick: number; hp: number; setup: { danger: number; map?: string } } } }).__yx.world;
        const n = document.querySelector('.yx-weather.yx-night');
        return { tick: w.tick, hp: w.hp, danger: w.setup.danger, map: w.setup.map ?? 'snow', night: !!n && n.classList.contains('on') };
      });
      if (st.danger !== 8 || st.map !== map) fail(`噩梦 ${map} 开局不对：${JSON.stringify(st)}`);
      // 噩梦 3 机器人可能撑不到第 4 分钟：倒下了不算错（这局看不到事件），没倒下却停在前面才算
      else if (st.tick < 7300 && st.hp > 0) fail(`噩梦 ${map} 没快进到第 4 分钟以后：第 ${st.tick} 拍`);
      else if (st.tick < 7300) ok(`噩梦 3 · ${map} 机器人第 ${st.tick} 拍倒下，没到事件`);
      else if (!st.night) fail(`噩梦 ${map} 夜色遮罩没有出现`);
      await page.screenshot({ path: join(out, `nm-${map}.png`) });
      report(`噩梦 3 · ${map}`, errs);
      await page.context().close();
    }
  }
  // 9) 一屏放下不滚动（docs/ui.md 第 11 节）：选模式页在九个尺寸下，新存档和全解锁存档（噩梦档、咒印、无尽都露出来，最挤）
  //    页面和每一栏 scrollHeight ≤ clientHeight，按钮不伸出视口
  if (want(9)) {
    const SIZES = [
      { name: '1280×720', viewport: { width: 1280, height: 720 }, touch: false },
      { name: '2560×1440', viewport: { width: 2560, height: 1440 }, touch: false },
      { name: '1920×1080', viewport: { width: 1920, height: 1080 }, touch: false },
      { name: '1920×911', viewport: { width: 1920, height: 911 }, touch: false },
      { name: '1440×900', viewport: { width: 1440, height: 900 }, touch: false },
      { name: '1366×768', viewport: { width: 1366, height: 768 }, touch: false },
      { name: '844×390', viewport: { width: 844, height: 390 }, touch: true },
      { name: '390×844', viewport: { width: 390, height: 844 }, touch: true },
      { name: '360×640', viewport: { width: 360, height: 640 }, touch: true },
    ];
    const RICH = JSON.stringify({ v: 1, runs: 60, wins: 20, danger: 2, cleared: 7, maxSeconds: 900, raidDone: true, curses: ['fast', 'more'], character: 'jianxia' });
    // 娱乐和实盘的配置面板同高、整页顶部对齐（所有者 11-09：以实盘为准）：实盘那遍里先量娱乐（同样有娱乐 / 实盘开关），切过去再对照
    const optsBox = (page: Page) => page.locator('.yx-sel .yx-opts').first().evaluate((e) => { const r = e.getBoundingClientRect(); return { top: r.top, h: r.height }; });
    const shotDir = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1]! : '';
    for (const sz of SIZES) {
      for (const [label, save] of [['新存档', ''], ['全解锁', RICH]] as const) {
        const errs: string[] = [];
        const ctx = await browser.newContext({ viewport: sz.viewport, ...(sz.touch ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
        if (save) await ctx.addInitScript((s) => localStorage.getItem('yexun.save') || localStorage.setItem('yexun.save', s), save);
        const page = await ctx.newPage();
        page.on('pageerror', (e) => errs.push(`未捕获异常：${e.message}`));
        await page.goto(`${ORIGIN}/`, { timeout: 90_000 });
        await page.waitForFunction(() => !!(window as unknown as { __yx?: unknown }).__yx, null, { timeout: 90_000 });
        for (const kind of ['vigil', 'raid']) {
          if (kind === 'vigil') await page.locator('[data-a="select"]').first().click();
          else await page.locator('[data-a="kind"][data-k="raid"]').first().click();
          await page.waitForTimeout(400);
          const bad = await measureSel(page, sz.viewport.width >= 1440 && !sz.touch);
          const tag = `不滚动 · ${sz.name} · ${label} · ${kind === 'vigil' ? '守夜' : '夜探'}`;
          bad.forEach((p) => fail(`${tag} ${p}`));
          if (!bad.length) ok(`${tag} 一屏放下`);
        }
        report(`不滚动 · ${sz.name} · ${label}`, errs);
        await ctx.close();
      }
    }
    // 实盘：选模式页要登录提示 cookie 才露出「实盘」开关。本机 dev 没有钱包，真正带入会报 bad_reply，所以这里只量选模式页、
    // 不点开始；只靠 pageerror 收异常（这一段不听 console，/api 的 404 之类不算）。
    for (const sz of SIZES) {
      for (const [label, save] of [['新存档', ''], ['全解锁', RICH]] as const) {
        const errs: string[] = [];
        const ctx = await browser.newContext({ viewport: sz.viewport, ...(sz.touch ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
        // __Host- 前缀的 cookie 必须 https 才设得进去，本机是 http，所以直接让页面读到登录提示
        await ctx.addInitScript(() => Object.defineProperty(Document.prototype, 'cookie', { get: () => '__Host-arcade_li=1', set: () => {}, configurable: true }));
        // 全解锁档把角色设成 zhijiang：0.17.10 起新三人各档各图都能带，选中档冰湖时不该出「带不进来」的红字
        if (save) await ctx.addInitScript((s) => localStorage.getItem('yexun.save') || localStorage.setItem('yexun.save', s), JSON.stringify({ ...JSON.parse(save), character: 'zhijiang' }));
        const page = await ctx.newPage();
        page.on('pageerror', (e) => errs.push(`未捕获异常：${e.message}`));
        await page.goto(`${ORIGIN}/`, { timeout: 90_000 });
        await page.waitForFunction(() => !!(window as unknown as { __yx?: unknown }).__yx, null, { timeout: 90_000 });
        for (const kind of ['vigil', 'raid']) {
          if (kind === 'vigil') await page.locator('[data-a="select"]').first().click();
          else await page.locator('[data-a="kind"][data-k="raid"]').first().click();
          await page.waitForTimeout(300);
          // 只量电脑尺寸（所有者截的是电脑）；手机实盘多一行数字小牌，本来就比娱乐高一点
          const f = save && kind === 'vigil' && !sz.touch ? await optsBox(page) : null;
          if (f && shotDir && sz.name === '1920×911') await page.screenshot({ path: join(shotDir, 'fun-1920x911.png') });
          await page.locator('[data-a="lv"][data-m="live"]').first().click();
          await page.waitForTimeout(400);
          const bad = await measureSel(page, sz.viewport.width >= 1440 && !sz.touch);
          const tag = `不滚动 · ${sz.name} · ${label} · ${kind === 'vigil' ? '守夜' : '夜探'} · 实盘`;
          if (save && kind === 'vigil') {
            await page.locator('[data-a="tier"][data-t="medium"]').first().click();
            await page.locator('[data-a="map"][data-m="icelake"]').first().click();
            await page.waitForTimeout(400);
            if (await page.locator('.yx-livewarn').count()) bad.push('中档冰湖 + 纸匠出了「带不进来」的红字（0.17.10 起都能带）');
            bad.push(...(await measureSel(page, sz.viewport.width >= 1440 && !sz.touch)));
          }
          if (f) {
            const l = await optsBox(page);
            if ((Math.abs(f.top - l.top) > 5 || Math.abs(f.h - l.h) > 5)) bad.push(`配置面板和娱乐不齐：娱乐 顶 ${f.top.toFixed(0)} 高 ${f.h.toFixed(0)}，实盘 顶 ${l.top.toFixed(0)} 高 ${l.h.toFixed(0)}`);
            if (shotDir && sz.name === '1920×911') await page.screenshot({ path: join(shotDir, 'live-1920x911.png') });
          }
          bad.forEach((p) => fail(`${tag} ${p}`));
          if (!bad.length) ok(`${tag} 一屏放下`);
          if (sz.name === '360×640' && save && kind === 'vigil' && process.argv.includes('--out')) await page.screenshot({ path: join(process.argv[process.argv.indexOf('--out') + 1]!, 'live-360x640.png') });
        }
        report(`不滚动 · ${sz.name} · ${label} · 实盘`, errs);
        await ctx.close();
      }
    }
  }
} finally {
  await browser.close();
  await server.close();
}
if (problems.length) {
  console.error(`冒烟失败 ${problems.length} 项`);
  process.exit(1);
}
console.log('冒烟全部通过');
