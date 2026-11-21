/**
 * 性能测量（同口径背靠背比较用）：真的 Worker + 假平台（同冒烟），电脑 1280×800 和手机竖屏 390×844（CPU 降速 4 倍）各跑几遍取中位数。
 *
 *   npm run build:cf && node scripts/perf.ts [--runs 3] [--play 40] [--out 结果.json] [--profile 目录]
 *   --profile：手机那一遍把主页打开、点坐下开打、对局中三段的 CPU 采样存成 .cpuprofile（看名字要先 vite build --minify false）。
 *
 * 三段：
 * - 主页打开：FCP、LCP、可交互（"快速开始"出现后，之后 5 秒内最后一个长任务结束的时刻）、长任务（个数、超出 50 毫秒的部分之和 TBT）、传了多少字节；
 * - 选桌页：点"娱乐"到"坐下开打"出现的耗时、期间长任务；
 * - 对局中：点"坐下开打"到底牌出现的耗时；按默认动画速度打 --play 秒（能过就过、能跟就跟、一手完了点下一手），记帧间隔（p50/p95/p99、超过 50 毫秒的比例）、长任务、JS 堆。
 * - assets.immutable：带哈希的 JS 的 Cache-Control 有没有 immutable（1/0）。
 * 无头浏览器是软件渲染：绝对数和真机不同，只拿来前后比。端口由系统分配。
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { opt } from './args.ts';
import { enter, newContext, PLATFORM_CONFIG, withWorker } from './smoke/harness.ts';
import { IPHONE } from './smoke/solo.ts';

type Probe = { lt: [number, number][]; fr: number[]; rec: boolean; lcp: number };
declare global {
  interface Window {
    __perf: Probe;
  }
}

const DEVICES = {
  desktop: { device: {}, cpu: 1 },
  phone: { device: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPHONE }, cpu: 4 },
} as const;

function probe(): void {
  const p: Probe = { lt: [], fr: [], rec: false, lcp: 0 };
  window.__perf = p;
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) p.lt.push([e.startTime, e.duration]);
  }).observe({ type: 'longtask', buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) p.lcp = e.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  let last = 0;
  const tick = (t: number): void => {
    if (p.rec && last) p.fr.push(t - last);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const now = (page: Page): Promise<number> => page.evaluate(() => performance.now());
const longIn = (page: Page, from: number, to: number) =>
  page.evaluate(([a, b]) => window.__perf.lt.filter(([s]) => s >= a && s < b), [from, to] as const);
const tbt = (lt: [number, number][]): number => lt.reduce((x, [, d]) => x + Math.max(0, d - 50), 0);
const q = (xs: number[], k: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(k * s.length))]! : 0;
};
const r1 = (x: number): number => Math.round(x * 10) / 10;

async function once(browser: Browser, base: string, kind: keyof typeof DEVICES, play: number, i: number): Promise<Record<string, number>> {
  const d = DEVICES[kind];
  const ctx = await newContext(browser, base, `perf-${kind}-${i}`, d.device);
  await ctx.addInitScript(probe);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: d.cpu });
  const out: Record<string, number> = {};
  const profDir = i === 0 && kind === 'phone' ? opt('profile', '') : '';
  const prof = async (tag: string, f: () => Promise<void>): Promise<void> => {
    if (!profDir) return f();
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    await cdp.send('Profiler.start');
    await f();
    const { profile } = (await cdp.send('Profiler.stop')) as { profile: unknown };
    writeFileSync(join(profDir, `${tag}.cpuprofile`), JSON.stringify(profile));
  };

  // 主页
  let ready = 0;
  await prof('home', async () => {
    await page.goto(`${base}/games/texas/`);
    await page.locator('.qstart').waitFor();
    ready = await now(page);
    if (profDir) await page.waitForTimeout(1_000);
  });
  await page.waitForTimeout(5_000);
  const home = await page.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0;
    const res = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const kb = (f: (r: PerformanceResourceTiming) => boolean) => res.filter(f).reduce((a, r) => a + r.transferSize, 0) / 1024;
    return { fcp, lcp: window.__perf.lcp, js: kb((r) => r.name.endsWith('.js')), css: kb((r) => r.name.endsWith('.css')), all: kb(() => true) + nav.transferSize / 1024 };
  });
  const homeLt = await longIn(page, 0, ready + 5_000);
  const lastEnd = Math.max(ready, ...homeLt.map(([s, du]) => s + du));
  Object.assign(out, { 'home.fcp': r1(home.fcp), 'home.lcp': r1(home.lcp), 'home.tti': r1(lastEnd), 'home.longtasks': homeLt.length, 'home.tbt': r1(tbt(homeLt)), 'home.kb': r1(home.all), 'home.kbJs': r1(home.js), 'home.kbCss': r1(home.css) });

  // 选桌页
  const t0 = await now(page);
  await enter(page, '娱乐', kind === 'phone');
  await page.locator('.lobby .start').waitFor();
  const t1 = await now(page);
  await page.waitForTimeout(1_000);
  const lobLt = await longIn(page, t0, t1 + 1_000);
  Object.assign(out, { 'lobby.open': r1(t1 - t0), 'lobby.longtasks': lobLt.length, 'lobby.tbt': r1(tbt(lobLt)) });

  // 对局中
  const s0 = await now(page);
  await prof('table-open', async () => {
    await page.locator('.lobby .start').click();
    await page.locator('.seat.me .card.up').first().waitFor({ timeout: 30_000 });
  });
  const s1 = await now(page);
  await page.evaluate(() => {
    window.__perf.fr = [];
    window.__perf.rec = true;
  });
  const end = Date.now() + play * 1_000;
  let hands = 0;
  await prof('play', async () => {
  while (Date.now() < end) {
    if (await page.locator('.next-hand:visible').count()) {
      hands++;
      await page.locator('.next-hand').click({ timeout: 1_000 }).catch(() => {});
    } else if (await page.locator('.actions.on').isVisible()) {
      const check = page.locator('.act.check:visible');
      await ((await check.count()) ? check : page.locator('.act.call')).first().click({ timeout: 1_000 }).catch(() => {});
    }
    await page.waitForTimeout(250);
  }
  });
  const s2 = await now(page);
  const fr = await page.evaluate(() => {
    window.__perf.rec = false;
    return window.__perf.fr;
  });
  const playLt = await longIn(page, s1, s2);
  const heap = (await cdp.send('Runtime.getHeapUsage')) as { usedSize: number };
  Object.assign(out, {
    'table.open': r1(s1 - s0),
    'table.hands': hands,
    'table.frames': fr.length,
    'table.fps': r1((fr.length * 1_000) / (s2 - s1)),
    'table.p50': r1(q(fr, 0.5)),
    'table.p95': r1(q(fr, 0.95)),
    'table.p99': r1(q(fr, 0.99)),
    'table.jank50%': r1((100 * fr.filter((x) => x > 50).length) / Math.max(1, fr.length)),
    'table.longtasks': playLt.length,
    'table.tbt': r1(tbt(playLt)),
    'table.ltMax': r1(Math.max(0, ...playLt.map(([, du]) => du))),
    'table.heapMB': r1(heap.usedSize / 2 ** 20),
  });
  // 带哈希的静态资源的缓存头（冒烟的假平台开了请求拦截，Playwright 这时不用 HTTP 缓存，量不出"再次打开"，只核对头）
  const js = await page.evaluate(() => (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).map((r) => r.name).find((n) => /\/assets\/.+\.js$/.test(n)) ?? '');
  const cc = js ? ((await page.request.get(js)).headers()['cache-control'] ?? '') : '';
  out['assets.immutable'] = cc.includes('immutable') ? 1 : 0;
  await ctx.close();
  return out;
}

async function main(): Promise<void> {
  const runs = Number(opt('runs', '3'));
  const play = Number(opt('play', '40'));
  const browser = await chromium.launch({ args: ['--no-zygote', '--disable-gpu'] });
  const result: Record<string, Record<string, number>> = {};
  try {
    await withWorker(PLATFORM_CONFIG, async (base) => {
      // 先热一遍（wrangler 首次编译、浏览器缓存不算）
      await once(browser, base, 'desktop', 3, -1);
      for (const kind of Object.keys(DEVICES) as (keyof typeof DEVICES)[]) {
        const all: Record<string, number>[] = [];
        for (let i = 0; i < runs; i++) all.push(await once(browser, base, kind, play, i));
        result[kind] = Object.fromEntries(Object.keys(all[0]!).map((k) => [k, q(all.map((x) => x[k]!), 0.5)]));
        console.log(kind, JSON.stringify(result[kind]));
      }
    });
  } finally {
    await browser.close();
  }
  const file = opt('out', '');
  if (file) writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
}

await main();
