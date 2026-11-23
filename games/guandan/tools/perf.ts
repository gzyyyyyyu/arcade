/**
 * 性能量测：先 `npm run build`，本脚本用 vite preview 起 dist（线上同一份产物），Chromium 打开后按段量
 *   首屏可交互（主页出现"实盘"卡的时间）、长任务（≥50 毫秒的次数、总长、最长）、帧间隔（中位、p95、超过 34 毫秒的比例），外加 dist 各文件的原始和 gzip 体积。
 *
 *   node tools/perf.ts [--runs 3] [--table 45] [--level normal] [--no-worker] [--sizes desktop,phone] [--dist dist] [--out <json>] [--trace <json>] [--profile <cpuprofile>] [--census]
 *
 * 两个尺寸：desktop 1280×720；phone 390×844 触屏、dpr 2（手机上渲染 2 倍），--cpu N 给手机档加 CPU 降速（CDP Emulation.setCPUThrottlingRate，默认不降）。
 * 无头 Chromium 用软件渲染（SwiftShader），帧时间和长任务里有一大块是软件 GPU，真机上没有；比改前改后主要看各段的脚本时间 scriptMs。
 * 流程：冷开主页（停 3 秒）→ 点"实盘"打开选档页（停 2 秒）→ 关掉、点"娱乐"→ --level 难度（默认普通）进牌桌，电脑代打 --table 秒（动画照常）。
 * 每个尺寸跑 --runs 次，报各数的中位。怕干扰：用 browser-slot.sh exclusive 跑。
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { chromium, type Browser, type CDPSession, type Page } from 'playwright-core';
import { preview } from 'vite';

const arg = (k: string, d: string): string => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1]! : d;
};
/** 量哪一份产物（默认 dist；改前改后背靠背时把旧版的 dist 拷一份出来指过去） */
const DIST = arg('--dist', 'dist');
const RUNS = Number(arg('--runs', '3'));
const TABLE_S = Number(arg('--table', '45'));
const SIZES = arg('--sizes', 'desktop,phone').split(',');
/** 手机档的 CPU 降速倍数：无头 SwiftShader 下 4 倍降速同一份产物首屏能差十倍、还会超时（11-21 实测），默认不降，比脚本时间 */
const PHONE_CPU = Number(arg('--cpu', '1'));
const OUT = process.argv.includes('--out') ? arg('--out', '') : '';
/** 牌桌那一段的娱乐难度（novice / normal / pro）；高手档的对手带残局推演，量它算的时候画面冻不冻 */
const LEVEL = arg('--level', 'normal');
/** 把页面的 Worker 拿掉：电脑退回主线程同步算（view/common/bot-runner.ts 的兜底），和带后台线程的背靠背比 */
const NO_WORKER = process.argv.includes('--no-worker');
/** 第一次运行录一份 Chrome 性能追踪（DevTools 性能面板能打开），查长任务里是什么 */
const TRACE = process.argv.includes('--trace') ? arg('--trace', '') : '';
/** 第一次运行录 JS 的 CPU 采样（.cpuprofile，从冷开到牌桌结束），找热函数；配不压缩的构建（vite build --minify false）看得懂函数名 */
const PROFILE = process.argv.includes('--profile') ? arg('--profile', '') : '';

const SIZE: Record<string, { w: number; h: number; dpr: number; touch: boolean; cpu: number }> = {
  desktop: { w: 1280, h: 720, dpr: 1, touch: false, cpu: 1 },
  phone: { w: 390, h: 844, dpr: 2, touch: true, cpu: PHONE_CPU },
};

type Seg = { scriptMs: number; taskMs: number; longN: number; longMs: number; longMax: number; frames: number; p50: number; p95: number; jank: number; gfx: number; gfxCmds: number };
type Run = { interactive: number; home: Seg; tiers: Seg; table: Seg; heapMB: number; marks: Record<string, number> };

// 页面里：长任务和帧间隔都记进 window.__perf，按段切
const PROBE = (): void => {
  const p = { long: [] as { t: number; d: number }[], frames: [] as number[], interactive: 0 };
  (window as unknown as { __perf: typeof p }).__perf = p;
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) p.long.push({ t: e.startTime, d: e.duration });
  }).observe({ type: 'longtask', buffered: true });
  let last = 0;
  const tick = (t: number): void => {
    if (last) p.frames.push(t - last);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const iv = setInterval(() => {
    const g = (window as unknown as { __game?: { ready: boolean; controls(): Record<string, unknown> } }).__game;
    if (g?.ready && 'stake' in g.controls()) {
      p.interactive = performance.now();
      clearInterval(iv);
    }
  }, 20);
};

const pct = (xs: number[], q: number): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
};
const med = (xs: number[]): number => pct(xs, 0.5);

/** 从上次切点到现在的这一段 */
async function cut(page: Page, cdp: CDPSession, from: { t: number; f: number; script: number; task: number }): Promise<Seg> {
  const r = await page.evaluate((f) => {
    const p = (window as unknown as { __perf: { long: { t: number; d: number }[]; frames: number[] } }).__perf;
    // 旧版没有 graphics()（改前改后背靠背时量的是旧产物）
    const g = (window as unknown as { __game: { graphics?(): Record<string, { n: number; cmds: number }> } }).__game.graphics?.() ?? {};
    return { long: p.long.filter((e) => e.t >= f.t), frames: p.frames.slice(f.f), now: performance.now(), fN: p.frames.length, g };
  }, from);
  from.t = r.now;
  from.f = r.fN;
  // 主线程上 JS 和全部任务的累计用时（CDP Performance 域，单位秒）：不受软件渲染拖慢帧的影响，最接近真机上脚本的负担
  const m = Object.fromEntries(((await cdp.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] }).metrics.map((x) => [x.name, x.value]));
  const scriptMs = Math.round((m.ScriptDuration! - from.script) * 1000);
  const taskMs = Math.round((m.TaskDuration! - from.task) * 1000);
  from.script = m.ScriptDuration!;
  from.task = m.TaskDuration!;
  const ds = r.long.map((e) => e.d);
  if (process.argv.includes('--census')) console.log('  graphics', JSON.stringify(r.g));
  return {
    scriptMs,
    taskMs,
    longN: ds.length,
    longMs: Math.round(ds.reduce((a, b) => a + b, 0)),
    longMax: Math.round(Math.max(0, ...ds)),
    frames: r.frames.length,
    p50: +med(r.frames).toFixed(1),
    p95: +pct(r.frames, 0.95).toFixed(1),
    jank: +((100 * r.frames.filter((x) => x > 34).length) / Math.max(1, r.frames.length)).toFixed(1),
    // 段末看得见的 Graphics（每帧重新三角化）：个数和绘制命令数；--census 时按容器打印明细
    gfx: Object.values(r.g).reduce((a, x) => a + x.n, 0),
    gfxCmds: Object.values(r.g).reduce((a, x) => a + x.cmds, 0),
  };
}

async function until(page: Page, cond: string, timeout = 120_000): Promise<void> {
  await page.waitForFunction(`(() => { const g = window.__game; return !!g && (${cond}); })()`, null, { timeout, polling: 100 });
}

async function tap(page: Page, key: string, touch: boolean): Promise<void> {
  const c = (await page.evaluate((k) => (window as unknown as { __game: { controls(): Record<string, { x: number; y: number }> } }).__game.controls()[k], key))!;
  if (!c) throw new Error(`找不到控件 ${key}`);
  if (touch) await page.touchscreen.tap(c.x, c.y);
  else await page.mouse.click(c.x, c.y);
}

async function once(browser: Browser, base: string, size: string, trace = '', profile = ''): Promise<Run> {
  const z = SIZE[size]!;
  const ctx = await browser.newContext({ viewport: { width: z.w, height: z.h }, screen: { width: z.w, height: z.h }, deviceScaleFactor: z.dpr, hasTouch: z.touch, isMobile: z.touch });
  await ctx.addInitScript(() => {
    localStorage.setItem('guandan.tutorial', JSON.stringify({ v: 1, done: true }));
    localStorage.setItem('guandan.ddz.tutorial', JSON.stringify({ v: 1, done: true }));
    // 平台的登录提示 cookie：实盘卡要"登录了"才是能点的样子
    // biome-ignore lint/suspicious/noDocumentCookie: 无头浏览器里预置登录标记 cookie
    document.cookie = '__Host-arcade_li=1; Path=/; Secure; SameSite=Lax';
  });
  await ctx.addInitScript(PROBE);
  if (NO_WORKER) await ctx.addInitScript(() => Reflect.deleteProperty(window, 'Worker'));
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await ctx.route('**/api/**', (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path === '/api/me') return r.fulfill(json({ user: { id: 'u-perf', displayName: '量测' }, service: 'ok', saves: 'ok' }));
    if (path === '/api/wallet') return r.fulfill(json({ wallet: { balance: 1_000_000, stakes: [] } }));
    if (path === '/api/saves/guandan') return r.fulfill(json({ saves: [] }));
    if (path === '/api/invites') return r.fulfill(json({ invites: [] }));
    return r.fulfill({ status: 204 });
  });
  const page = await ctx.newPage();
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: z.cpu });
  await cdp.send('Performance.enable');
  if (trace) await browser.startTracing(page, { path: trace, screenshots: false });
  if (profile) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
    await cdp.send('Profiler.start');
  }
  // 手机档 4 倍降速时 load 事件可能晚于 30 秒，不等它：下面等主页控件出现（上限 120 秒）
  await page.goto(`${base}?debug=1&autoplay=1`, { waitUntil: 'commit' });
  await until(page, "g.ready && 'stake' in g.controls()");
  const mark = { t: 0, f: 0, script: 0, task: 0 };
  await page.waitForTimeout(3000);
  const interactive = Math.round(await page.evaluate(() => (window as unknown as { __perf: { interactive: number } }).__perf.interactive));
  const home = await cut(page, cdp, mark);
  await tap(page, 'stake', z.touch);
  await until(page, "'tier:lux' in g.controls()");
  await page.waitForTimeout(2000);
  const tiers = await cut(page, cdp, mark);
  await page.keyboard.press('Escape');
  await until(page, "!('tier:lux' in g.controls()) && 'fun' in g.controls()");
  await tap(page, 'fun', z.touch);
  await until(page, `'level:${LEVEL}' in g.controls()`);
  await tap(page, `level:${LEVEL}`, z.touch);
  await until(page, "g.scene === 'table'");
  await cut(page, cdp, mark);
  await page.waitForTimeout(TABLE_S * 1000);
  const table = await cut(page, cdp, mark);
  if (trace) await browser.stopTracing();
  if (profile) writeFileSync(profile, JSON.stringify(((await cdp.send('Profiler.stop')) as { profile: unknown }).profile));
  const heapMB = Math.round(((await cdp.send('Runtime.getHeapUsage')) as { usedSize: number }).usedSize / 1e6);
  // 启动和进牌桌各步的 performance.mark（docs/view.md 第 12 节的 gd:*），同名取第一次
  const marks = await page.evaluate(() => {
    const m: Record<string, number> = {};
    for (const e of performance.getEntriesByType('mark')) if (e.name.startsWith('gd:') && !(e.name in m)) m[e.name] = Math.round(e.startTime);
    return m;
  });
  await ctx.close();
  if (errs.length) throw new Error(`页面报错：${errs.join(' | ')}`);
  return { interactive, home, tiers, table, heapMB, marks };
}

function bundle(): { file: string; kb: number; gzKb: number }[] {
  const out: { file: string; kb: number; gzKb: number }[] = [];
  const walk = (dir: string): void => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(js|css|html)$/.test(f)) {
        const b = readFileSync(p);
        out.push({ file: p.slice(DIST.length + 1), kb: +(b.length / 1024).toFixed(1), gzKb: +(gzipSync(b).length / 1024).toFixed(1) });
      }
    }
  };
  walk(DIST);
  return out.sort((a, b) => b.kb - a.kb);
}

const medSeg = (xs: Seg[]): Seg => {
  const k = Object.keys(xs[0]!) as (keyof Seg)[];
  return Object.fromEntries(k.map((key) => [key, med(xs.map((x) => x[key]))])) as Seg;
};

async function main(): Promise<void> {
  const server = await preview({ root: process.cwd(), logLevel: 'warn', preview: { host: '127.0.0.1', port: 0, strictPort: false }, build: { outDir: DIST } });
  const addr = server.httpServer.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/`;
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--no-proxy-server', '--no-zygote', '--in-process-gpu'] });
  const report: Record<string, unknown> = { bundle: bundle() };
  try {
    for (const size of SIZES) {
      const runs: Run[] = [];
      for (let i = 0; i < RUNS; i++) runs.push(await once(browser, base, size, i === 0 && TRACE ? TRACE.replace(/(\.json)?$/, `-${size}.json`) : '', i === 0 && PROFILE ? PROFILE.replace(/(\.cpuprofile)?$/, `-${size}.cpuprofile`) : ''));
      const m = {
        interactive: med(runs.map((r) => r.interactive)),
        heapMB: med(runs.map((r) => r.heapMB)),
        home: medSeg(runs.map((r) => r.home)),
        tiers: medSeg(runs.map((r) => r.tiers)),
        table: medSeg(runs.map((r) => r.table)),
      };
      const marks = Object.fromEntries(Object.keys(runs[0]!.marks).map((k) => [k, med(runs.map((r) => r.marks[k] ?? 0))]));
      report[size] = { median: { ...m, marks }, runs };
      console.log(`== ${size}（${RUNS} 次中位）首屏可交互 ${m.interactive} ms，堆 ${m.heapMB} MB`);
      console.log(`  marks  ${JSON.stringify(marks)}`);
      if (OUT) writeFileSync(OUT, JSON.stringify(report, null, 2));
      for (const s of ['home', 'tiers', 'table'] as const) console.log(`  ${s.padEnd(6)} ${JSON.stringify(m[s])}`);
    }
  } finally {
    await browser.close();
    await new Promise<void>((r) => server.httpServer.close(() => r()));
  }
  const b = report.bundle as ReturnType<typeof bundle>;
  console.log(`== dist：js+css+html 合计 ${b.reduce((a, x) => a + x.kb, 0).toFixed(0)} KB，gzip ${b.reduce((a, x) => a + x.gzKb, 0).toFixed(0)} KB`);
  for (const x of b.slice(0, 6)) console.log(`  ${x.file} ${x.kb} KB（gzip ${x.gzKb}）`);
}

await main();
