/**
 * 性能测量（0.34.0）：同口径量一段主流程，改前改后背靠背比。浏览器类检查，按本机的浏览器排队规则运行（计时类用独占位子）。
 *
 *   npm run build -- --outDir <目录>            先构建（正式构建，不量开发服务器）
 *   node tools/perf.ts --dist <目录> [--profile desktop|portrait|both] [--days 6] [--rounds 2] [--json <文件>] [--cpuprofile <前缀>] [--who] [--seg boot|start|days]
 *
 * 两种口径：desktop = 1280×720、1 倍屏、鼠标；portrait = 390×844、2 倍屏、触屏、CPU 4 倍降速（CDP Emulation.setCPUThrottlingRate）。
 * 正式构建只在 URL 带 debug=1 时挂调试桥，所以带上它，并删掉同时挂上的调试浮层；/api/** 回 404（按单独部署量）。
 * 流程：打开首页（清空存档、关教程）→ 开始菜单点「快速开局」→ 进交易页 → 动画开着、1 倍速打 days 个交易日（空格就买第一只推荐，
 * 月底账单、三选一、事件照常走）。记：
 *   - 首屏可交互：调试桥的 bootMs（页面开始加载到开始菜单可操作）；首次绘制 FCP
 *   - 开局：点「快速开局」到交易页静下来的毫秒数
 *   - 长任务（PerformanceObserver longtask ≥ 50ms）：个数、合计、最长；分「启动」「开局」「交易日」三段
 *   - 帧时间（页面里 rAF 的间隔）：中位、p95、超过 50ms 的帧占比；只量交易日这段
 *   - 纹理上传（texImage2D / texSubImage2D）和量字（measureText）次数：和机器快慢无关，分段记，交易日按每天平均
 *   - 包体积：dist 里 js / css 的原始和 gzip 大小
 * 每个口径跑 rounds 轮取中位数（第一轮之前先热身打开一次，让磁盘缓存一致）。
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { preview } from 'vite';

const arg = (k: string, d: string): string => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? (process.argv[i + 1] as string) : d;
};
const DIST = arg('dist', 'dist');
const PROFILE = arg('profile', 'both');
const DAYS = Number(arg('days', '6'));
const ROUNDS = Number(arg('rounds', '2'));
const JSON_OUT = arg('json', '');
/** 另存一份 --seg 那一段的 CPU 采样（.cpuprofile，Chrome DevTools 能直接打开）；只在最后一轮采，找根因用 */
const PROFILE_OUT = arg('cpuprofile', '');
/** 找根因：交易日里每次纹理上传是哪段游戏代码引起的，按调用处计数（配 vite build --minify false 才看得懂） */
const WHO = process.argv.includes('--who');
/** --who、--cpuprofile 记哪一段：boot = 打开页面到开始菜单可操作，start = 点「快速开局」到交易页静下来，days = 交易日 */
const SEG = arg('seg', 'days');

interface Profile {
  id: 'desktop' | 'portrait';
  viewport: { width: number; height: number };
  dpr: number;
  touch: boolean;
  cpu: number;
  query: string;
}
const PROFILES: Profile[] = [
  { id: 'desktop', viewport: { width: 1280, height: 720 }, dpr: 1, touch: false, cpu: 1, query: '' },
  { id: 'portrait', viewport: { width: 390, height: 844 }, dpr: 2, touch: true, cpu: 4, query: 'layout=portrait' },
];

interface Round {
  bootMs: number;
  fcp: number;
  startMs: number;
  dayMs: number[];
  long: Record<'boot' | 'start' | 'days', { n: number; total: number; max: number }>;
  /** 纹理上传、量字次数（交易日按每天平均） */
  uploads: Record<'boot' | 'start' | 'days', number>;
  measures: Record<'boot' | 'start' | 'days', number>;
  frames: { p50: number; p95: number; jank: number; n: number };
  heapMB: number;
}

function bundle(dir: string): Record<string, number> {
  const out = { js: 0, jsGz: 0, css: 0, cssGz: 0, entryGz: 0 };
  for (const f of readdirSync(`${dir}/assets`, { recursive: true })) {
    if (!/\.(js|css)$/.test(f)) continue;
    const b = readFileSync(`${dir}/assets/${f}`);
    const gz = gzipSync(b).length;
    if (f.endsWith('.js')) {
      out.js += b.length;
      out.jsGz += gz;
    } else {
      out.css += b.length;
      out.cssGz += gz;
    }
  }
  // 首屏要下载的 js：index.html 里直接引用和 modulepreload 的
  const html = readFileSync(`${dir}/index.html`, 'utf8');
  for (const m of html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+\.js)"/g)) out.entryGz += gzipSync(readFileSync(`${dir}/${m[1] as string}`)).length;
  return out;
}

/** 页面里：长任务按段记、rAF 帧间隔（只在 __perf.rec 为真时记） */
function probe([who, whoSeg]: [boolean, string]): void {
  type Seg = 'boot' | 'start' | 'days';
  const w = window as unknown as { __perf: { seg: Seg; long: { seg: Seg; d: number }[]; frames: number[]; rec: boolean; up: Record<Seg, number>; measure: Record<Seg, number> } };
  w.__perf = { seg: 'boot', long: [], frames: [], rec: false, up: { boot: 0, start: 0, days: 0 }, measure: { boot: 0, start: 0, days: 0 } };
  const whoMap: Record<string, number> = {};
  (w as unknown as { __who: Record<string, number> }).__who = whoMap;
  // 和机器快慢无关的两个数：纹理上传次数（文字每重画一次就整张传一遍；2D 画布在 GPU 上时还要先读回来）、量字次数
  for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
    for (const k of ['texImage2D', 'texSubImage2D'] as const) {
      const orig = C.prototype[k] as (...a: unknown[]) => void;
      (C.prototype as unknown as Record<string, unknown>)[k] = function (this: unknown, ...a: unknown[]) {
        w.__perf.up[w.__perf.seg]++;
        if (who && w.__perf.seg === whoSeg) {
          // 调用栈里第一个不在 phaser 块里的帧之后再取两帧
          const all = (new Error().stack ?? '').split('\n').slice(2);
          const game = all.filter((l) => !l.includes('/phaser-'));
          // 全在 phaser 里（渲染时才传的纹理）就记 phaser 的前几帧
          const fr = game.length > 0 ? game : all.map((l) => `phaser:${l}`);
          const k = fr.slice(0, game.length > 0 ? 4 : 10).map((l) => l.trim().replace(/at /, '').replace(/\(?https?:\/\/[^/]+\/assets\//, '(')).join(' < ');
          whoMap[k] = (whoMap[k] ?? 0) + 1;
        }
        return orig.apply(this, a);
      };
    }
  }
  // 文字重画（Phaser 的 updateText 先 clearRect 整张画布）：纹理是渲染时才传的，调用栈要在这里记
  const cr = CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect = function (...a: [number, number, number, number]) {
    if (who && w.__perf.seg === whoSeg) {
      const fr = (new Error().stack ?? '').split('\n').slice(2).filter((l) => !l.includes('/phaser-'));
      const k = `重画 ${fr.slice(0, 3).map((l) => l.trim().replace(/^at /, '').replace(/\(?https?:\/\/[^/]+\/assets\//, '(')).join(' < ')}`;
      whoMap[k] = (whoMap[k] ?? 0) + 1;
    }
    return cr.apply(this, a);
  };
  const mt = CanvasRenderingContext2D.prototype.measureText;
  CanvasRenderingContext2D.prototype.measureText = function (t: string) {
    w.__perf.measure[w.__perf.seg]++;
    return mt.call(this, t);
  };
  // 开始菜单的「快速开局」用随机种子：固定下来，每轮打的是同一局
  let n = 0;
  const grv = crypto.getRandomValues.bind(crypto);
  crypto.getRandomValues = (<T extends ArrayBufferView | null>(a: T): T => {
    if (a instanceof Uint32Array && a.length === 2) {
      a[0] = 7919 + n * 13;
      a[1] = 104729 + n++;
      return a;
    }
    return grv(a as never) as T;
  }) as typeof crypto.getRandomValues;
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) w.__perf.long.push({ seg: w.__perf.seg, d: e.duration });
  }).observe({ type: 'longtask', buffered: true });
  let last = 0;
  const tick = (t: number): void => {
    if (w.__perf.rec && last > 0) w.__perf.frames.push(t - last);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

async function until(page: Page, cond: string, ms = 600_000): Promise<void> {
  await page.waitForFunction(`(() => { const g = window.__game; return !!g && g.ready && (${cond}); })()`, null, { timeout: ms, polling: 50 });
}

async function idle(page: Page): Promise<void> {
  await until(page, 'g.idle');
}

/** 打一个交易日（或处理掉一个等待中的画面）；返回是否真的开了一天盘 */
async function step(page: Page): Promise<boolean> {
  const phase = await page.evaluate(() => window.__game?.state().phase);
  if (phase === 'won' || phase === 'lost') throw new Error('一局在量完之前就结束了，换个种子');
  if (await page.evaluate(() => window.__game?.continue())) {
    await idle(page);
    return false;
  }
  if (phase === 'reward') {
    await page.evaluate(() => window.__game?.dispatch({ type: 'skipReward' }));
    await idle(page);
    return false;
  }
  if (phase === 'event') {
    await page.evaluate(() => window.__game?.dispatch({ type: 'choose', option: 0 }));
    await idle(page);
    return false;
  }
  // 空格就买第一只推荐
  await page.evaluate(() => {
    const g = window.__game;
    const s = g?.state();
    if (s?.slots.some((h) => !h) && s.today.recs.length > 0) g?.dispatch({ type: 'buy', rec: 0 });
  });
  await idle(page);
  await page.evaluate(() => window.__game?.dispatch({ type: 'open' }));
  await idle(page);
  return true;
}

async function round(browser: Browser, p: Profile, cpuprofile = ''): Promise<Round> {
  const context: BrowserContext = await browser.newContext({
    viewport: p.viewport,
    screen: p.viewport,
    deviceScaleFactor: p.dpr,
    ...(p.touch ? { hasTouch: true, isMobile: true } : {}),
  });
  await context.addInitScript(() => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    localStorage.setItem('kaipan.tutorial.v3', JSON.stringify({ v: 1, off: true, done: [] }));
  });
  await context.addInitScript(probe, [WHO, SEG] as [boolean, string]);
  // 按单独部署量：没有平台接口（/api/me 回 404，开盘按「没有平台」画）
  await context.route('**/api/**', (r) => r.fulfill({ status: 404, body: '' }));
  const page = await context.newPage();
  const errs: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errs.push(m.text());
  });
  page.on('pageerror', (e) => errs.push(e.message));
  const cdp = await context.newCDPSession(page);
  if (p.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: p.cpu });
  const profOn = async (seg: string): Promise<void> => {
    if (!cpuprofile || seg !== SEG) return;
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.start');
  };
  const profOff = async (seg: string): Promise<void> => {
    if (!cpuprofile || seg !== SEG) return;
    const { profile } = (await cdp.send('Profiler.stop')) as { profile: unknown };
    writeFileSync(cpuprofile, JSON.stringify(profile));
  };
  await profOn('boot');
  // 正式构建只在 debug=1 时挂调试桥；同时挂上的调试浮层（一个 DOM 元素）删掉，改前改后一样
  await page.goto(`${BASE}?debug=1${p.query ? `&${p.query}` : ''}`, { timeout: 600_000 });
  await until(page, "g.scene === 'title' && g.idle");
  await profOff('boot');
  await page.evaluate(() => document.getElementById('debug-overlay')?.remove());
  const bootMs = await page.evaluate(() => window.__game?.bootMs ?? 0);
  const fcp = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0);
  await page.evaluate(() => {
    (window as unknown as { __perf: { seg: string } }).__perf.seg = 'start';
  });
  await profOn('start');
  const t0 = Date.now();
  const q = await page.evaluate(() => {
    const c = window.__game?.controls().quick;
    return c ? window.__game?.toCanvas(c.x, c.y) : null;
  });
  if (!q) throw new Error('开始菜单上找不到「快速开局」');
  const box = (await page.locator('canvas').boundingBox()) as { x: number; y: number; width: number; height: number };
  const at = { x: box.x + q.x * box.width, y: box.y + q.y * box.height };
  if (p.touch) await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.click(at.x, at.y);
  await until(page, "g.scene === 'trade' && g.idle");
  const startMs = Date.now() - t0;
  await profOff('start');
  await page.evaluate(() => {
    const w = window as unknown as { __perf: { seg: string; rec: boolean } };
    w.__perf.seg = 'days';
    w.__perf.rec = true;
  });
  await profOn('days');
  const dayMs: number[] = [];
  for (let guard = 0; dayMs.length < DAYS && guard < DAYS * 6; guard++) {
    const d0 = Date.now();
    if (await step(page)) dayMs.push(Date.now() - d0);
  }
  await profOff('days');
  const perf = await page.evaluate(() => {
    const w = window as unknown as { __perf: { long: { seg: string; d: number }[]; frames: number[]; up: Record<'boot' | 'start' | 'days', number>; measure: Record<'boot' | 'start' | 'days', number> } };
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return { long: w.__perf.long, frames: w.__perf.frames, up: w.__perf.up, measure: w.__perf.measure, heap: mem ? mem.usedJSHeapSize / 2 ** 20 : 0 };
  });
  if (WHO) {
    const who = (await page.evaluate(() => (window as unknown as { __who: Record<string, number> }).__who)) as Record<string, number>;
    for (const [k, v] of Object.entries(who).sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(String(v).padStart(6), k);
  }
  await context.close();
  if (errs.length) throw new Error(`[${p.id}] 控制台报错：\n${errs.join('\n')}`);
  const seg = (s: string): { n: number; total: number; max: number } => {
    const xs = perf.long.filter((x) => x.seg === s).map((x) => x.d);
    return { n: xs.length, total: Math.round(xs.reduce((a, b) => a + b, 0)), max: Math.round(Math.max(0, ...xs)) };
  };
  const f = [...perf.frames].sort((a, b) => a - b);
  const pq = (k: number): number => Math.round((f[Math.min(f.length - 1, Math.floor(k * f.length))] ?? 0) * 10) / 10;
  return {
    bootMs: Math.round(bootMs),
    fcp: Math.round(fcp),
    startMs,
    dayMs,
    long: { boot: seg('boot'), start: seg('start'), days: seg('days') },
    frames: { p50: pq(0.5), p95: pq(0.95), jank: Math.round((f.filter((x) => x > 50).length / Math.max(1, f.length)) * 1000) / 10, n: f.length },
    heapMB: Math.round(perf.heap),
    uploads: { ...perf.up, days: Math.round(perf.up.days / dayMs.length) },
    measures: { ...perf.measure, days: Math.round(perf.measure.days / dayMs.length) },
  };
}

const med = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)] as number;
};

function summary(rs: Round[]): Record<string, number> {
  const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
  return {
    bootMs: med(rs.map((r) => r.bootMs)),
    fcp: med(rs.map((r) => r.fcp)),
    startMs: med(rs.map((r) => r.startMs)),
    dayMs: med(rs.map((r) => Math.round(sum(r.dayMs) / r.dayMs.length))),
    longBootMs: med(rs.map((r) => r.long.boot.total)),
    longStartMs: med(rs.map((r) => r.long.start.total)),
    longDaysMs: med(rs.map((r) => r.long.days.total)),
    longDaysN: med(rs.map((r) => r.long.days.n)),
    longMax: med(rs.map((r) => Math.max(r.long.boot.max, r.long.start.max, r.long.days.max))),
    frameP50: med(rs.map((r) => r.frames.p50)),
    frameP95: med(rs.map((r) => r.frames.p95)),
    jankPct: med(rs.map((r) => r.frames.jank)),
    heapMB: med(rs.map((r) => r.heapMB)),
    uploadsBoot: med(rs.map((r) => r.uploads.boot)),
    uploadsStart: med(rs.map((r) => r.uploads.start)),
    uploadsPerDay: med(rs.map((r) => r.uploads.days)),
    measuresStart: med(rs.map((r) => r.measures.start)),
    measuresPerDay: med(rs.map((r) => r.measures.days)),
  };
}

let BASE = '';
const server = await preview({ preview: { port: 0, host: '127.0.0.1', strictPort: false }, build: { outDir: DIST }, logLevel: 'silent' });
BASE = (server.resolvedUrls?.local[0] as string) ?? '';
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--no-proxy-server', '--no-zygote', '--in-process-gpu'] });
const result: Record<string, unknown> = { dist: DIST, days: DAYS, rounds: ROUNDS, bundle: bundle(DIST) };
try {
  for (const p of PROFILES.filter((x) => PROFILE === 'both' || PROFILE === x.id)) {
    await round(browser, p); // 热身
    const rs: Round[] = [];
    for (let i = 0; i < ROUNDS; i++) rs.push(await round(browser, p, PROFILE_OUT && i === ROUNDS - 1 ? PROFILE_OUT.replace(/(\.cpuprofile)?$/, `-${p.id}.cpuprofile`) : ''));
    result[p.id] = { median: summary(rs), rounds: rs };
    console.log(p.id, JSON.stringify(summary(rs)));
  }
} finally {
  await browser.close();
  await new Promise<void>((r) => server.httpServer.close(() => r()));
}
console.log('bundle', JSON.stringify(result.bundle));
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(result, null, 1));
