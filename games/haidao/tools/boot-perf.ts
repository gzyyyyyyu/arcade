/**
 * 打开海岛的卡顿测量（生产构建）：node tools/boot-perf.ts --out <目录> [--runs 2] [--views phone4,desktop] [--profile] [--warm] [--dist <已构建目录>]
 *
 * - 先 vite build 到临时目录（或用 --dist 给的），vite preview 起在临时端口，和线上一样是打包后的文件；
 * - 存档：tools/sample.ts 的满配岛（主寨 7、引导走完），上次离开在 1 小时前（开局补算离线产出）；每次新浏览器上下文（没有缓存）；
 * - phone4 = 手机竖屏 390×844 @2x、从打开页面起 CDP 降 CPU 4 倍；desktop = 1280×800 不降速；
 * - 每次记：
 *   首屏可交互 = 页面导航开始到加载层消失、基地就绪（毫秒，页面里的 performance.now）；期间的长任务个数、总时长、最长一个；JS 下载字节；
 *   基地 = 就绪后静置 8 秒的帧时长中位 / p95、>50ms 长帧、长任务；
 *   海图 = 点「出海」到海图出现的毫秒数，之后 3 秒的长任务和最长一帧；
 * - --warm 量「第二次打开」：同一个浏览器上下文先打开一次、等烘好的素材写进本机缓存（haidao.art 条目数 2 秒不变），再打开一次只量这一次；
 *   不加是第一次打开（新上下文，没有任何缓存）；
 * - --profile 另跑一次开 CPU 采样，列出首屏这段自身耗时最多的函数（开采样会变慢，只看占比）；
 * - 本机没有 GPU（SwiftShader），绝对值偏高，只看同口径的前后对比；结果里记了机器负载。输出 boot.json、boot.md。
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import type { CDPSession, Page } from 'playwright-core';
import { build, preview } from 'vite';
import { fullBase } from './sample.ts';
import { flag, num, opt } from './args.ts';

const OUT = opt('--out');
if (!OUT) throw new Error('要用 --out <目录> 指定输出目录');
mkdirSync(OUT, { recursive: true });
const RUNS = num('--runs', 2);
const VIEW_NAMES = (opt('--views') ?? 'phone4,desktop').split(',');
const PROFILE = flag('--profile');
const WARM = flag('--warm');

const DIST = opt('--dist') ?? mkdtempSync(join(tmpdir(), 'haidao-boot-'));
if (!opt('--dist')) await build({ logLevel: 'warn', build: { outDir: DIST, emptyOutDir: true } });
const assets = readdirSync(join(DIST, 'assets')).filter((f) => f.endsWith('.js'));
const bundle = Object.fromEntries(assets.map((f) => [f, Math.round(statSync(join(DIST, 'assets', f)).size / 1024)]));

const server = await preview({ logLevel: 'warn', build: { outDir: DIST }, preview: { host: '127.0.0.1', port: 0, strictPort: false } });
const ROOT = server.resolvedUrls?.local[0];
if (!ROOT) throw new Error('vite preview 没有地址');
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--no-proxy-server', '--no-zygote', '--in-process-gpu'] });
const loadavg = (): string => readFileSync('/proc/loadavg', 'utf8').split(' ').slice(0, 3).join(' ');
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const r1 = (n: number): number => Math.round(n * 10) / 10;
const pct = (a: number[], p: number): number => (a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor((p / 100) * a.length))]! : 0);

interface View {
  name: string;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
  throttle: number;
}
const VIEWS: View[] = [
  { name: 'phone4', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, throttle: 4 },
  { name: 'desktop', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, throttle: 1 },
];

/** 注入页面：从一开始记长任务和每一帧的时间戳 */
function recorder(): void {
  const rec = { lt: [] as number[][], t: [] as number[] };
  (window as unknown as { __boot: typeof rec }).__boot = rec;
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) rec.lt.push([e.startTime, e.duration]);
  }).observe({ type: 'longtask', buffered: true });
  const loop = (ts: number): void => {
    rec.t.push(ts);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

interface Win {
  lt: number[][];
  ltCount: number;
  ltMs: number;
  ltMax: number;
}
const win = (lt: number[][], a: number, b: number): Win => {
  const s = lt.filter((e) => e[0]! >= a && e[0]! < b);
  return { lt: s, ltCount: s.length, ltMs: Math.round(s.reduce((x, e) => x + e[1]!, 0)), ltMax: Math.round(Math.max(0, ...s.map((e) => e[1]!))) };
};

interface Run {
  ttiMs: number;
  boot: Omit<Win, 'lt'>;
  jsKB: number;
  base: { p50: number; p95: number; over50: number } & Omit<Win, 'lt'>;
  mapMs: number;
  map: { maxFrame: number } & Omit<Win, 'lt'>;
  load: string;
  errors: string[];
  top?: Array<{ where: string; ms: number; pct: number }>;
}

interface CpuProfile {
  nodes: Array<{ id: number; callFrame: { functionName: string; url: string; lineNumber: number } }>;
  samples: number[];
  timeDeltas: number[];
}
function topSelf(p: CpuProfile): Array<{ where: string; ms: number; pct: number }> {
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const self = new Map<string, number>();
  let busy = 0;
  for (let i = 0; i < p.samples.length; i++) {
    const n = byId.get(p.samples[i]!);
    if (!n || n.callFrame.functionName === '(idle)') continue;
    const dt = (p.timeDeltas[i] ?? 0) / 1000;
    busy += dt;
    const { functionName: fn, url, lineNumber } = n.callFrame;
    const key = `${fn || '(anonymous)'} ${url.split('/').pop()?.split('?')[0] ?? ''}:${lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + dt);
  }
  return [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([where, ms]) => ({ where, ms: Math.round(ms), pct: r1((ms / Math.max(1, busy)) * 100) }));
}

async function run(view: View, profile: boolean): Promise<Run> {
  const ctx = await browser.newContext({ viewport: view.viewport, deviceScaleFactor: view.deviceScaleFactor, isMobile: view.isMobile, hasTouch: view.hasTouch });
  const save = JSON.stringify({ profile: { ...fullBase(7, 'spread', true), tutorial: 99, res: { gold: 5000, wood: 5000 } }, lastSeen: Date.now() - 3600_000 });
  await ctx.addInitScript((sv: string) => localStorage.setItem('haidao.save', sv), save);
  await ctx.addInitScript(recorder);
  const page: Page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/GL Driver Message|Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`异常：${e.message}`));
  const cdp: CDPSession = await ctx.newCDPSession(page);
  if (view.throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: view.throttle });
  if (profile) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
    await cdp.send('Profiler.start');
  }
  const booted = (): Promise<unknown> =>
    page.waitForFunction(() => (window as unknown as { __haidao?: { ready?: boolean } }).__haidao?.ready === true && !document.getElementById('boot'), null, { timeout: 900_000, polling: 50 });
  if (WARM) {
    // 先打开一次，等后台烘焙和写缓存都停下来（条目数 2 秒不变）
    await page.goto(ROOT!, { timeout: 120_000, waitUntil: 'commit' });
    await booted();
    let last = -1;
    for (let i = 0; i < 300; i++) {
      await sleep(2000);
      const n = await page.evaluate(async () => (await (await caches.open('haidao.art')).keys()).length);
      if (n === last && i >= 2) break;
      last = n;
    }
  }
  const load = loadavg();
  await page.goto(ROOT!, { timeout: 120_000, waitUntil: 'commit' });
  await booted();
  const tti = await page.evaluate(() => performance.now());
  let top: Run['top'];
  if (profile) top = topSelf((await cdp.send('Profiler.stop')).profile as unknown as CpuProfile);
  const jsKB = await page.evaluate(() => Math.round(performance.getEntriesByType('resource').filter((e) => /\.js(\?|$)/.test(e.name)).reduce((s, e) => s + (e as PerformanceResourceTiming).encodedBodySize, 0) / 1024));
  // 基地静置 8 秒
  const b0 = await page.evaluate(() => performance.now());
  await sleep(8000);
  const b1 = await page.evaluate(() => performance.now());
  // 打开海图
  await page.getByRole('button', { name: /出海/ }).first().click({ timeout: 10_000 });
  const m0 = await page.evaluate(() => performance.now());
  await page.waitForSelector('.hd-map', { timeout: 60_000 });
  const m1 = await page.evaluate(() => performance.now());
  await sleep(3000);
  const m2 = await page.evaluate(() => performance.now());
  const rec = await page.evaluate(() => (window as unknown as { __boot: { lt: number[][]; t: number[] } }).__boot);
  const frames = (a: number, b: number): number[] => {
    const t = rec.t.filter((x) => x >= a && x < b);
    return t.slice(1).map((x, i) => x - t[i]!);
  };
  const strip = ({ lt: _, ...w }: Win): Omit<Win, 'lt'> => w;
  const bd = frames(b0, b1);
  const out: Run = {
    ttiMs: Math.round(tti),
    boot: strip(win(rec.lt, 0, tti)),
    jsKB,
    base: { p50: r1(pct(bd, 50)), p95: r1(pct(bd, 95)), over50: bd.filter((d) => d > 50).length, ...strip(win(rec.lt, b0, b1)) },
    mapMs: Math.round(m1 - m0),
    map: { maxFrame: Math.round(Math.max(0, ...frames(m0, m2))), ...strip(win(rec.lt, m0, m2)) },
    load: `${load} -> ${loadavg()}`,
    errors,
    top,
  };
  await ctx.close();
  return out;
}

const result: Record<string, Run[]> = {};
const lines: string[] = [`# 打开海岛（生产构建，${WARM ? '第二次打开：本机缓存里有烘好的素材' : '第一次打开：没有缓存'}）`, '', `JS 包（KB，未压缩）：${Object.entries(bundle).map(([f, k]) => `${f} ${k}`).join('，')}`, ''];
lines.push('| 视口 | 第几次 | 首屏可交互 ms | 首屏长任务 个 / 总 ms / 最长 | JS 下载 KB | 基地帧 中位 / p95 / >50ms | 基地长任务 个 / ms | 开海图 ms | 海图长任务 个 / ms / 最长帧 | 负载 |', '|---|---|---|---|---|---|---|---|---|---|');
for (const vn of VIEW_NAMES) {
  const view = VIEWS.find((v) => v.name === vn);
  if (!view) throw new Error(`没有视口 ${vn}`);
  result[vn] = [];
  for (let i = 0; i < RUNS; i++) {
    const r = await run(view, false);
    result[vn].push(r);
    console.log(`${vn} #${i + 1}：首屏 ${r.ttiMs}ms 长任务 ${r.boot.ltCount}/${r.boot.ltMs}ms 最长 ${r.boot.ltMax}；基地 p95 ${r.base.p95}；海图 ${r.mapMs}ms${r.errors.length ? ` 报错 ${r.errors.length}` : ''}`);
    lines.push(`| ${vn} | ${i + 1} | ${r.ttiMs} | ${r.boot.ltCount} / ${r.boot.ltMs} / ${r.boot.ltMax} | ${r.jsKB} | ${r.base.p50} / ${r.base.p95} / ${r.base.over50} | ${r.base.ltCount} / ${r.base.ltMs} | ${r.mapMs} | ${r.map.ltCount} / ${r.map.ltMs} / ${r.map.maxFrame} | ${r.load} |`);
  }
  if (PROFILE) {
    const r = await run(view, true);
    result[`${vn}-profile`] = [r];
    lines.push('', `## ${vn} 首屏 CPU 自身耗时（开采样，首屏 ${r.ttiMs}ms）`, '', ...r.top!.map((t) => `- ${t.ms}ms（${t.pct}%）${t.where}`), '');
  }
}
const errs = Object.values(result).flat().flatMap((r) => r.errors);
if (errs.length) lines.push('', '## 报错', '', ...errs.map((e) => `- ${e}`));
writeFileSync(join(OUT, 'boot.json'), JSON.stringify({ bundle, result }, null, 1));
writeFileSync(join(OUT, 'boot.md'), `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
await browser.close();
await server.close();
