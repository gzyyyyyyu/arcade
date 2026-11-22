/** 冒烟的公共底子：端口和输出目录、问题清单、断言、控制台和 HTTP 监视、截图、开页面 */
import { join, resolve } from 'node:path';
import type { Browser, BrowserContext, BrowserContextOptions, Dialog, Page } from 'playwright-core';

export const PORT = 5181;
export const BASE = `http://localhost:${PORT}`;
const outArg = process.argv.indexOf('--out');
export const OUT = resolve(outArg > 0 ? process.argv[outArg + 1]! : 'shots');

export const problems: string[] = [];
/** 事先声明会出现的错误响应（状态码 + 路径），出现一次划掉一个。 */
export const expected: { status: number; path: string }[] = [];
export let shotNo = 0;

export function fail(msg: string): never {
  throw new Error(msg);
}

export function check(cond: unknown, msg: string): void {
  if (!cond) fail(msg);
}

export function expectHttp(status: number, path: string): void {
  expected.push({ status, path });
}

/** 盯住一个页面：报错、控制台、CSP 拦截、错误响应。 */
async function watch(page: Page, label: string): Promise<Page> {
  page.on('pageerror', (e) => problems.push(`[${label}] 页面报错：${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (m.text().startsWith('Failed to load resource')) return;
    problems.push(`[${label}] 控制台：${m.text()}`);
  });
  page.on('response', (r) => {
    if (r.status() < 400) return;
    const path = new URL(r.url()).pathname;
    const i = expected.findIndex((e) => e.status === r.status() && e.path === path);
    if (i >= 0) expected.splice(i, 1);
    else problems.push(`[${label}] 没想到的 ${r.status()}：${path}`);
  });
  // CSP 拦下的东西有时只是一条 warning：直接听 securitypolicyviolation 事件，换页后也照样报
  await page.exposeBinding('__cspViolation', (_src, what: string) => problems.push(`[${label}] CSP 拦下了：${what}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __cspViolation: (s: string) => void }).__cspViolation(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  return page;
}

/** 记下这个页面发过的 /api 请求。 */
export function apiCalls(page: Page): string[] {
  const calls: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/api/')) calls.push(`${r.method()} ${u.pathname}`);
  });
  return calls;
}

/** 下一张截图的文件名：按拍的先后编号，看图时和日志对得上 */
function shotFile(name: string): string {
  shotNo += 1;
  return join(OUT, `${String(shotNo).padStart(2, '0')}-${name}.png`);
}

export async function shot(page: Page, name: string, fullPage = true): Promise<void> {
  const file = shotFile(name);
  await page.screenshot({ path: file, fullPage });
  console.log(`  截图 ${file}`);
}

export type Screen = 'desktop' | 'portrait' | 'landscape';

export async function newPage(browser: Browser, label: string, screen: Screen = 'desktop', extra: BrowserContextOptions = {}): Promise<{ ctx: BrowserContext; page: Page }> {
  const phone = { deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const opts: Record<Screen, BrowserContextOptions> = {
    desktop: { viewport: { width: 1280, height: 800 } },
    portrait: { viewport: { width: 390, height: 844 }, ...phone },
    landscape: { viewport: { width: 844, height: 390 }, ...phone },
  };
  const ctx = await browser.newContext({ ...opts[screen], ...extra });
  return { ctx, page: await watch(await ctx.newPage(), label) };
}

export const fold = (page: Page, title: string) => page.locator('details', { has: page.locator(`summary:text-is("${title}")`) });

/** 下一个弹窗（confirm、beforeunload）点"取消"，返回它的类型；5 秒内没弹出来返回 'none'（让断言失败，而不是一直等）。 */
export function dismissNextDialog(page: Page): Promise<string> {
  return new Promise((ok) => {
    const onDialog = (d: Dialog) => {
      clearTimeout(timer);
      ok(d.type());
      void d.dismiss();
    };
    const timer = setTimeout(() => {
      page.off('dialog', onDialog);
      ok('none');
    }, 5_000);
    page.once('dialog', onDialog);
  });
}

export const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
