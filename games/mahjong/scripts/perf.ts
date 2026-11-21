/**
 * 性能量测（所有者 11-21「先量后改」）：拿构建好的页面（vite build 的产物，静态服务挂在 /games/mahjong/），无头 Chromium 量三段，前后同口径背靠背比：
 * 1. 主页打开：首次内容绘制（FCP）、主页可用（.home-main 出现）、可交互（主页可用后主线程第一次空出 1 秒、没有长任务的时刻）、到可交互为止的长任务总阻塞（TBT）、首屏下载的 JS/CSS 字节；
 * 2. 选桌页打开：主页点「娱乐」卡到 .lobby-head 画出来（两帧后）的耗时和其间的长任务，重复 5 次取中位数；
 * 3. 对局中：主页「快速一局」开一局，自己这家照冒烟的打法（换三张帮我选、定缺照推荐、能胡就胡、别的过、打最右边），正常速度（不带 ?turbo）打 N 秒，
 *    记每一帧的间隔（p50 / p95 / p99 / 最长、超过 33 毫秒的占比）和长任务（个数、总时长、最长）。
 * 两个尺寸：desk 1280×720；phone 390×844、dpr 2、触屏，CDP 把 CPU 降速 4 倍。包体积按产物里的 JS、CSS 算（原始和 gzip）。
 * 用法：node scripts/perf.ts [--dist 产物目录，不给就先 vite build 到临时目录] [--runs 3] [--secs 40] [--only desk|phone] [--out 结果 JSON 路径]
 * 无头浏览器的数比真机慢、抖，只用来前后比；比较时两版在同一台机器上交替跑（脚本跑一版，另一版接着跑同样的参数）。
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium, type Browser, type Page } from 'playwright-core';

const args = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : def;
};
const ROOT = new URL('..', import.meta.url).pathname;
const RUNS = Number(opt('runs', '3'));
const SECS = Number(opt('secs', '40'));
const ONLY = opt('only', '');
const OUT = opt('out', '');

let dist = opt('dist', '');
if (!dist) {
  dist = mkdtempSync(join(tmpdir(), 'mahjong-perf-'));
  const { build } = await import('vite');
  await build({ root: ROOT, logLevel: 'warn', build: { outDir: dist, emptyOutDir: true } });
}

// ---------- 包体积 ----------
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(dist);
const sizeOf = (ext: string): { raw: number; gz: number } =>
  files
    .filter((f) => extname(f) === ext)
    .reduce(
      (a, f) => {
        const b = readFileSync(f);
        return { raw: a.raw + b.length, gz: a.gz + gzipSync(b).length };
      },
      { raw: 0, gz: 0 },
    );
const bundle = { js: sizeOf('.js'), css: sizeOf('.css') };

// ---------- 静态服务：产物挂在 /games/mahjong/，别的路径（/api 等）一律 404，两版一样 ----------
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.webmanifest': 'application/manifest+json' };
const server: Server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  if (!path.startsWith('/games/mahjong/')) {
    res.writeHead(404).end();
    return;
  }
  let rel = normalize(path.slice('/games/mahjong/'.length));
  if (rel.startsWith('..')) {
    res.writeHead(403).end();
    return;
  }
  if (!rel || rel === '.' || rel.endsWith('/')) rel = join(rel, 'index.html');
  try {
    const body = readFileSync(join(dist, rel));
    res.writeHead(200, { 'content-type': TYPES[extname(rel)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${(server.address() as { port: number }).port}/games/mahjong/`;

// ---------- 页面里的探针：长任务、帧间隔、主页出现的时刻 ----------
const PROBE = (): void => {
  const w = window as unknown as { __lt: { s: number; d: number }[]; __frames: number[] | null; __home: number };
  w.__lt = [];
  w.__frames = null;
  w.__home = 0;
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) w.__lt.push({ s: e.startTime, d: e.duration });
  }).observe({ type: 'longtask', buffered: true });
  new MutationObserver((_, o) => {
    if (!w.__home && document.querySelector('.home-main')) {
      w.__home = performance.now();
      o.disconnect();
    }
  }).observe(document, { childList: true, subtree: true });
  let last = 0;
  const tick = (t: number): void => {
    if (w.__frames && last) w.__frames.push(t - last);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  localStorage.setItem('mahjong.guide', '1');
  localStorage.setItem('mahjong.guide.rc', '1');
};

const PROFILES = {
  desk: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, cpu: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, cpu: 4 },
} as const;
type ProfileId = keyof typeof PROFILES;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)]! : Number.NaN;
};
const pctl = (xs: number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))]! : Number.NaN;
};
const r1 = (x: number): number => Math.round(x * 10) / 10;

async function newPage(browser: Browser, id: ProfileId): Promise<Page> {
  const { cpu, ...ctxOpts } = PROFILES[id];
  const ctx = await browser.newContext(ctxOpts);
  await ctx.addInitScript(PROBE);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  page.on('pageerror', (e) => console.error(`[${id}] pageerror ${e.message}`));
  return page;
}

/** 主页打开（冷启动，新的浏览器上下文、没有缓存） */
async function homeOpen(page: Page): Promise<Record<string, number>> {
  let bytes = 0;
  page.on('response', async (r) => {
    if (/\.(js|css)$/.test(new URL(r.url()).pathname)) bytes += (await r.body().catch(() => Buffer.alloc(0))).length;
  });
  await page.goto(BASE);
  await page.waitForSelector('.home-main');
  // 等主线程安静：主页出现以后，1 秒没有长任务
  const t = await page.evaluate(
    () =>
      new Promise<{ fcp: number; home: number; tti: number; tbt: number; lt: number }>((ok) => {
        const w = window as unknown as { __lt: { s: number; d: number }[]; __home: number };
        const check = (): void => {
          const now = performance.now();
          const lastEnd = Math.max(w.__home, ...w.__lt.map((x) => x.s + x.d));
          if (now - lastEnd < 1000) {
            setTimeout(check, 100);
            return;
          }
          const tti = lastEnd;
          const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? Number.NaN;
          const before = w.__lt.filter((x) => x.s < tti);
          ok({ fcp, home: w.__home, tti, tbt: before.reduce((a, x) => a + Math.max(0, x.d - 50), 0), lt: before.length });
        };
        check();
      }),
  );
  return { ...t, kb: bytes / 1024 };
}

/** 主页点「娱乐」到选桌页画出来；回主页再来，共 5 次 */
async function lobbyOpen(page: Page): Promise<Record<string, number>> {
  const ms: number[] = [];
  const blocked: number[] = [];
  for (let i = 0; i < 5; i++) {
    await page.waitForSelector('.home-main .mode.fun');
    await page.waitForTimeout(300);
    const r = await page.evaluate(
      () =>
        new Promise<{ ms: number; tbt: number }>((ok) => {
          const w = window as unknown as { __lt: { s: number; d: number }[] };
          const t0 = performance.now();
          (document.querySelector('.home-main .mode.fun') as HTMLElement).click();
          const done = (): void => {
            if (!document.querySelector('.lobby-head')) {
              requestAnimationFrame(done);
              return;
            }
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                const t1 = performance.now();
                ok({ ms: t1 - t0, tbt: w.__lt.filter((x) => x.s >= t0 - 1 && x.s < t1).reduce((a, x) => a + Math.max(0, x.d - 50), 0) });
              }),
            );
          };
          done();
        }),
    );
    ms.push(r.ms);
    blocked.push(r.tbt);
    await page.click('.pill.back');
  }
  return { ms: median(ms), tbt: median(blocked) };
}

/** 对局中：快速一局，正常速度打 SECS 秒 */
async function inGame(page: Page): Promise<Record<string, number>> {
  await page.click('.home-main .quick');
  await page.waitForSelector('.my-hand .tile', { timeout: 20_000 });
  const t0 = await page.evaluate(() => {
    const w = window as unknown as { __frames: number[] | null };
    w.__frames = [];
    return performance.now();
  });
  const end = Date.now() + SECS * 1000;
  while (Date.now() < end) {
    if (await page.$('.mask.end >> text=/回选桌|再来一局/')) {
      await page.click('.mask.end >> text=/再来一局/').catch(() => {});
    } else if (await page.$('.mask.end >> text=下一局')) await page.click('.mask.end >> text=下一局').catch(() => {});
    else if (await page.$('text=帮我选')) {
      await page.click('text=帮我选').catch(() => {});
      await page.click('button:has-text("换出")').catch(() => {});
    } else if (await page.$('.act.que.best')) await page.click('.act.que.best').catch(() => {});
    else if (await page.$('.bar .act.ron')) await page.click('.bar .act.ron').catch(() => {});
    else if (await page.$('.bar .act.pass')) await page.click('.bar .act.pass').catch(() => {});
    else {
      const t = (await page.$$('.my-hand .tile:not(.off)')).at(-1);
      if (t) {
        await t.click({ timeout: 1000 }).catch(() => {});
        await t.click({ timeout: 1000 }).catch(() => {});
      }
    }
    await page.waitForTimeout(150);
  }
  const r = await page.evaluate((from) => {
    const w = window as unknown as { __frames: number[]; __lt: { s: number; d: number }[] };
    const lt = w.__lt.filter((x) => x.s >= from);
    return { frames: w.__frames, lt: lt.map((x) => x.d) };
  }, t0);
  const f = r.frames;
  return {
    frames: f.length,
    p50: pctl(f, 0.5),
    p95: pctl(f, 0.95),
    p99: pctl(f, 0.99),
    max: Math.max(...f),
    jank: (100 * f.filter((x) => x > 33.4).length) / f.length,
    lt: r.lt.length,
    ltSum: r.lt.reduce((a, x) => a + x, 0),
    ltMax: r.lt.length ? Math.max(...r.lt) : 0,
  };
}

const browser = await chromium.launch({ args: ['--no-zygote', '--disable-gpu'] });
const result: Record<string, unknown> = { dist, bundle: { jsKB: r1(bundle.js.raw / 1024), jsGzKB: r1(bundle.js.gz / 1024), cssKB: r1(bundle.css.raw / 1024), cssGzKB: r1(bundle.css.gz / 1024) } };
for (const id of Object.keys(PROFILES) as ProfileId[]) {
  if (ONLY && ONLY !== id) continue;
  const runs: Record<string, Record<string, number>>[] = [];
  for (let i = 0; i < RUNS; i++) {
    const page = await newPage(browser, id);
    const home = await homeOpen(page);
    const lobby = await lobbyOpen(page);
    const game = await inGame(page);
    runs.push({ home, lobby, game });
    await page.context().close();
  }
  // 每项取各轮的中位数
  const agg: Record<string, Record<string, number>> = {};
  for (const part of ['home', 'lobby', 'game']) {
    agg[part] = {};
    for (const k of Object.keys(runs[0]![part]!)) agg[part]![k] = r1(median(runs.map((x) => x[part]![k]!)));
  }
  result[id] = agg;
}
await browser.close();
server.close();
console.log(JSON.stringify(result, null, 1));
if (OUT) writeFileSync(OUT, JSON.stringify(result, null, 1));
