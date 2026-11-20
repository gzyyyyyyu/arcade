/**
 * 画面帧率 / 长帧测量：node tools/perf.ts --out <目录> [--secs 25] [--runs 2] [--views phone4,desktop] [--scenes battle,td] [--only fps|diag|shot|sheet] [--query rs=1.5]
 *   [--battle c07] [--army <主寨等级>] [--td td03] [--calls 2] [--hq 7] [--focus goldmine] [--zoom 1.1]
 *
 * - 自己起 vite 开发服务（端口由系统分配）+ playwright-core 无头 Chromium（WebGL 走 SwiftShader，启动参数同 shot.ts）。
 *   所以绝对帧率偏低，只用来前后对比；对比要在相近的机器负载下跑（结果里记了 /proc/loadavg）；
 * - 两个视口：phone4 = 手机竖屏 390×844 @2x，CDP 把 CPU 降 4 倍（就绪之后才降）；desktop = 1280×800 不降速；
 * - 三个场景，都用固定存档（新档 / dev.td / 满配岛）加固定操作序列，操作全是真人点击（不开 auto），按「规则的拍数」对齐，不按墙钟：
 *   battle = 战役 c07（新档的小队能撑过 25 秒；c10 海怪关 9 秒就全灭），按拍数放全部兵，再放一次炮击；td = 守岛 td03，造三座炮塔、英雄走位、放号令、叫两次波；
 *   base = 基地（tools/sample.ts 的满配岛，主寨等级 --hq 默认 7，推荐布局 spread），不点任何东西，镜头用 focusOn 对着 --focus 那种建筑、放大 --zoom 倍（默认金矿 1.1，岛中间）；
 *   --focus edge 对着岛边（离岛心最远的那座资源建筑）、--focus <格x>,<格y> 对着岛上任意一格（可以在岛外，海上是负数或大于 ISLAND）、--focus home 是开场的全岛远景；
 *   大场面：--army 8 用这一级主寨的满编船队（tools/sample.ts 的 sampleProfile）打登陆战；--td td14 --calls 6 换关、每 60 拍叫一次波，把几波敌人叠在岛上；
 * - 三种跑法（--only 只跑一种）：
 *   fps  = 页面里 requestAnimationFrame 计帧，录 --secs 秒：平均帧率、帧时长 p50/p95/p99、>33ms、>50ms 的长帧个数、longtask 个数和总时长；--runs 次取 p95 最好的一次；
 *   diag = 同样的操作录 --secs 秒，但开 CDP CPU 采样（按函数 / 文件归自身耗时，GC 单列）+ 包 WebGL 的 draw / 贴图上传计数（每帧多少次绘制、多少次传贴图）。
 *          开了采样和计数帧率会偏低，只看占比，不和 fps 的数字比；
 *   shot = 不降速、不记帧，在固定的拍数（battle 第 260 拍、td 叫波后第 160 拍）截一张，前后对比图用；
 * - 输出到 --out：perf.json（全部数据）、perf.md（表格）、shots 的 png（<视口>-<场景>.png）。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import type { Browser, CDPSession, Page } from 'playwright-core';
import { createServer } from 'vite';
import { Resvg } from '@resvg/resvg-js';
import { BUILDINGS, ISLAND, tdCampaign } from '../src/core/index.ts';
import { fullBase, sampleProfile } from './sample.ts';
import { iso } from '../src/view/iso.ts';
import { opt } from './args.ts';

const OUT = opt('--out');
if (!OUT) throw new Error('要用 --out <目录> 指定输出目录');
const SECS = Number(opt('--secs') ?? 25);
const RUNS = Number(opt('--runs') ?? 2);
const ONLY = opt('--only');
const VIEW_NAMES = (opt('--views') ?? 'phone4,desktop').split(',');
const SCENES = (opt('--scenes') ?? 'battle,td').split(',');
const BATTLE_LEVEL = opt('--battle') ?? 'c07';
/** 附加到页面地址的查询参数（不带 ?，如 rs=1.5 强制渲染倍数，做 A/B） */
const EXTRA = opt('--query') ? `&${opt('--query')}` : '';
const TD_LEVEL = opt('--td') ?? 'td03';
/** 守岛叫几次波（第一次开打算一次）：越多场上同时的敌人越多 */
const TD_CALLS = Number(opt('--calls') ?? 2);
/** 登陆战用哪一级主寨的满编船队（不给 = 新档的小队） */
const ARMY_HQ = opt('--army') ? Number(opt('--army')) : 0;
/** 基地场景的镜头：对着哪种建筑（edge = 离岛心最远的资源建筑，home = 全岛远景）、放大几倍 */
const BASE_FOCUS = opt('--focus') ?? 'goldmine';
const BASE_ZOOM = Number(opt('--zoom') ?? 1.1);
/** 基地场景的满配岛用几级主寨（tools/sample.ts 的 fullBase） */
const BASE_HQ = Number(opt('--hq') ?? 7);
/** 岛边：满配岛上离岛心最远的那座资源建筑（focusOn 的 种类#序号） */
const EDGE_KIND = ((): string => {
  const bs = fullBase(BASE_HQ, 'spread', true).base.buildings;
  const c = ISLAND / 2;
  let best = { d: -1, key: 'goldmine' };
  for (const b of bs) {
    if (BUILDINGS[b.kind].category !== 'resource') continue;
    const s = BUILDINGS[b.kind].size;
    const d = (b.x + s / 2 - c) ** 2 + (b.y + s / 2 - c) ** 2;
    if (d > best.d) best = { d, key: `${b.kind}#${bs.filter((q) => q.kind === b.kind).indexOf(b)}` };
  }
  return best.key;
})();
const TD_HQ = tdCampaign().find((l) => l.id === TD_LEVEL)?.hq ?? 3;
mkdirSync(OUT, { recursive: true });

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

// ---------------------------------------------------------------- 页面里的记录器

/** 注入页面：rAF 计帧、longtask、可选的 WebGL 计数。window.__pf.on 为 true 时才记 */
function recorder(gl: boolean): void {
  const pf = { on: false, t: [] as number[], lt: [] as number[][], draws: [] as number[], uploads: [] as number[], js: [] as number[], d: 0, u: 0 };
  (window as unknown as { __pf: typeof pf }).__pf = pf;
  // 游戏自己的 rAF 回调（Phaser 的 step：规则推进 + 场景更新 + 提交绘制）用了多少毫秒：
  // 没有 GPU 的机器上帧率被软件光栅化拖住，这个数才是 JS 侧的真实开销
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb: FrameRequestCallback): number =>
    raf((ts) => {
      const a = performance.now();
      try {
        cb(ts);
      } finally {
        if (pf.on) pf.js.push(performance.now() - a);
      }
    });
  const loop = (ts: number): void => {
    if (pf.on) {
      pf.t.push(ts);
      pf.draws.push(pf.d);
      pf.uploads.push(pf.u);
    }
    pf.d = 0;
    pf.u = 0;
    raf(loop);
  };
  raf(loop);
  try {
    new PerformanceObserver((l) => {
      if (!pf.on) return;
      for (const e of l.getEntries()) pf.lt.push([e.startTime, e.duration]);
    }).observe({ type: 'longtask', buffered: false });
  } catch {
    /* 没有 longtask 就算了 */
  }
  if (!gl) return;
  for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
    const P = C.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
    for (const n of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const o = P[n];
      if (!o) continue;
      P[n] = function (this: unknown, ...a: unknown[]) {
        pf.d++;
        return o.apply(this, a);
      };
    }
    for (const n of ['texImage2D', 'texSubImage2D']) {
      const o = P[n];
      if (!o) continue;
      P[n] = function (this: unknown, ...a: unknown[]) {
        pf.u++;
        return o.apply(this, a);
      };
    }
  }
}

const pct = (a: number[], p: number): number => {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
};
const r1 = (n: number): number => Math.round(n * 10) / 10;

interface Fps {
  frames: number;
  secs: number;
  avgFps: number;
  p50: number;
  p95: number;
  p99: number;
  over33: number;
  over50: number;
  longtasks: number;
  longtaskMs: number;
  /** 游戏的 rAF 回调耗时 平均 / p95 / p99（毫秒） */
  jsAvg: number;
  jsP95: number;
  jsP99: number;
  /** 帧节奏：p95 / 中位数（质量线 ≤ 1.5） */
  ratio: number;
  /** 每帧非脚本时间 ≈ 中位帧时长 - 脚本平均（没有 GPU 时主要是软件光栅化，单列，不算进脚本开销） */
  rasterMs: number;
  /** 逐帧数据（帧时长、游戏回调耗时，毫秒），画帧时间曲线用 */
  dts?: number[];
  js?: number[];
  /** 录完时场景里的显示对象个数（容器里的部件也算） */
  objects?: number;
  /** 录完时场上的兵 / 敌人数 */
  units?: number;
  drawsAvg?: number;
  drawsP95?: number;
  uploadsPerSec?: number;
}

type Hook = Record<string, (...a: unknown[]) => unknown> & { ready?: boolean; scene?: string };

async function collect(page: Page, gl: boolean): Promise<Fps> {
  const raw = await page.evaluate(() => (window as unknown as { __pf: { t: number[]; lt: number[][]; draws: number[]; uploads: number[]; js: number[] } }).__pf);
  const dts: number[] = [];
  for (let i = 1; i < raw.t.length; i++) dts.push(raw.t[i]! - raw.t[i - 1]!);
  const secs = raw.t.length > 1 ? (raw.t[raw.t.length - 1]! - raw.t[0]!) / 1000 : 0;
  const f: Fps = {
    frames: raw.t.length,
    secs: r1(secs),
    avgFps: r1(secs > 0 ? dts.length / secs : 0),
    p50: r1(pct(dts, 50)),
    p95: r1(pct(dts, 95)),
    p99: r1(pct(dts, 99)),
    over33: dts.filter((d) => d > 33.4).length,
    over50: dts.filter((d) => d > 50).length,
    longtasks: raw.lt.length,
    longtaskMs: Math.round(raw.lt.reduce((s, e) => s + e[1]!, 0)),
    jsAvg: r1(raw.js.reduce((s, x) => s + x, 0) / Math.max(1, raw.js.length)),
    jsP95: r1(pct(raw.js, 95)),
    jsP99: r1(pct(raw.js, 99)),
    ratio: 0,
    rasterMs: 0,
    dts: dts.map(r1),
    js: raw.js.map(r1),
  };
  f.ratio = Math.round((f.p95 / Math.max(0.1, f.p50)) * 100) / 100;
  f.rasterMs = r1(Math.max(0, f.p50 - f.jsAvg));
  if (gl) {
    f.drawsAvg = r1(raw.draws.reduce((s, x) => s + x, 0) / Math.max(1, raw.draws.length));
    f.drawsP95 = pct(raw.draws, 95);
    f.uploadsPerSec = r1(raw.uploads.reduce((s, x) => s + x, 0) / Math.max(1, secs));
  }
  return f;
}

// ---------------------------------------------------------------- CPU 采样汇总

interface CpuNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
}
interface CpuProfile {
  nodes: CpuNode[];
  samples: number[];
  timeDeltas: number[];
}
interface Top {
  where: string;
  ms: number;
  pct: number;
}
function summarize(p: CpuProfile): { buckets: Record<string, number>; top: Top[]; totalMs: number } {
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const self = new Map<string, number>();
  const buckets: Record<string, number> = { game: 0, phaser: 0, arcadeKit: 0, otherLib: 0, gc: 0, program: 0, idle: 0, native: 0 };
  let total = 0;
  for (let i = 0; i < p.samples.length; i++) {
    const n = byId.get(p.samples[i]!);
    const dt = (p.timeDeltas[i] ?? 0) / 1000;
    if (!n) continue;
    total += dt;
    const { functionName: fn, url, lineNumber } = n.callFrame;
    let b: string;
    if (fn === '(idle)') b = 'idle';
    else if (fn === '(garbage collector)') b = 'gc';
    else if (fn === '(program)' || fn === '(root)') b = 'program';
    else if (!url) b = 'native';
    else if (/\/src\//.test(url) && !/node_modules/.test(url)) b = 'game';
    else if (/phaser/i.test(url)) b = 'phaser';
    else if (/arcade-kit/.test(url)) b = 'arcadeKit';
    else b = 'otherLib';
    buckets[b] = (buckets[b] ?? 0) + dt;
    if (b === 'idle') continue;
    const file = url.split('/').pop()?.split('?')[0] ?? '';
    const key = `${fn || '(anonymous)'} ${file}:${lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + dt);
  }
  const busy = total - (buckets.idle ?? 0);
  const top = [...self.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 22)
    .map(([where, ms]) => ({ where, ms: Math.round(ms), pct: r1((ms / Math.max(1, busy)) * 100) }));
  for (const k of Object.keys(buckets)) buckets[k] = Math.round(buckets[k]!);
  return { buckets, top, totalMs: Math.round(total) };
}

// ---------------------------------------------------------------- 场景

const server = await createServer({ logLevel: 'warn', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
await server.listen();
const addr = server.httpServer?.address();
if (!addr || typeof addr === 'string') throw new Error('vite 没有监听端口');
const ROOT = `http://127.0.0.1:${addr.port}/`;
const browser: Browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--no-proxy-server', '--no-zygote', '--in-process-gpu'] });

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const loadavg = (): string => readFileSync('/proc/loadavg', 'utf8').split(' ').slice(0, 3).join(' ');

interface Run {
  mode: 'fps' | 'diag' | 'shot' | 'sheet';
  fps?: Fps;
  cpu?: ReturnType<typeof summarize>;
  errors: string[];
  load: string;
  ops: string[];
}

type Call = <T>(f: string, ...a: unknown[]) => Promise<T>;
type Pt = { id: number; x: number; y: number };

/** 连拍拼图：同一个兵连拍 6 帧、一座建筑倒塌连拍 6 帧、同一座建筑的受损阶段 4 帧；每格都是围着目标裁出来的小图，拼成一排（sheet-*.png） */
async function sheets(page: Page, call: Call, vn: string): Promise<void> {
  const vp = page.viewportSize()!;
  const S = 150;
  const clipOf = (p: Pt): { x: number; y: number; width: number; height: number } => ({ x: Math.round(Math.min(vp.width - S, Math.max(0, p.x - S / 2))), y: Math.round(Math.min(vp.height - S, Math.max(0, p.y - S / 2))), width: S, height: S });
  const stitch = async (name: string, shots: Buffer[]): Promise<void> => {
    const p2 = await page.context().newPage();
    await p2.setViewportSize({ width: S * shots.length * 2 + 20, height: S * 2 + 20 });
    await p2.setContent(`<body style="margin:0;background:#123;display:flex;gap:4px;padding:10px">${shots.map((b) => `<img style="width:${S * 2}px;height:${S * 2}px;image-rendering:auto" src="data:image/png;base64,${b.toString('base64')}">`).join('')}</body>`);
    await p2.screenshot({ path: join(OUT!, `sheet-${vn}-${name}.png`) });
    await p2.close();
  };
  // 1. 同一个兵连拍
  let u = await call<Pt | null>('probe', 'unit');
  for (let k = 0; !u && k < 40; k++) {
    await sleep(250);
    u = await call<Pt | null>('probe', 'unit');
  }
  if (u) {
    const id = u.id;
    const shots: Buffer[] = [];
    let last = u;
    for (let i = 0; i < 6; i++) {
      last = (await call<Pt | null>('probe', 'unit', id)) ?? last;
      shots.push(await page.screenshot({ clip: clipOf(last) }));
      await sleep(40);
    }
    await stitch('unit', shots);
  }
  // 2. 受损阶段：主寨 满血、60%、30%、10%
  const hq = await call<Pt | null>('probe', 'building', 'hq');
  if (hq) {
    const shots: Buffer[] = [];
    for (const f of [1, 0.6, 0.3, 0.1]) {
      await call('poke', 'hq', f);
      await sleep(900);
      shots.push(await page.screenshot({ clip: clipOf((await call<Pt | null>('probe', 'building', 'hq')) ?? hq) }));
    }
    await stitch('stages', shots);
  }
  // 3. 倒塌：挑一座非主寨的建筑改成 1 点血，连拍到它塌下去之后
  for (const kind of ['goldmine', 'sawmill', 'cannon', 'vault', 'woodyard']) {
    const b = await call<Pt | null>('probe', 'building', kind);
    if (!b) continue;
    await call('poke', kind, 0.001);
    const base = (await call<{ ruined: number }>('battleInfo')).ruined;
    const frames: Array<{ shot: Buffer; ruined: number }> = [];
    let after = 0;
    for (let i = 0; i < 400 && after < 6; i++) {
      const info = await call<{ ruined: number }>('battleInfo');
      frames.push({ shot: await page.screenshot({ clip: clipOf(b) }), ruined: info.ruined });
      if (info.ruined > base) after++;
    }
    const at = frames.findIndex((f) => f.ruined > base);
    if (at >= 0) {
      await stitch('collapse', frames.slice(Math.max(0, at - 1), Math.max(0, at - 1) + 6).map((f) => f.shot));
      break;
    }
  }
}

async function runScene(view: View, scene: string, mode: Run['mode']): Promise<Run> {
  const ctx = await browser.newContext({ viewport: view.viewport, deviceScaleFactor: view.deviceScaleFactor, isMobile: view.isMobile, hasTouch: view.hasTouch });
  const page = await ctx.newPage();
  const errors: string[] = [];
  const ops: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/GL Driver Message/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`异常：${e.message}`));
  const gl = mode === 'diag';
  await page.addInitScript(recorder, gl);
  const cdp: CDPSession = await ctx.newCDPSession(page);
  const load = loadavg();

  const call = <T>(f: string, ...a: unknown[]): Promise<T> => page.evaluate(([fn, args]) => ((window as unknown as { __haidao: Hook }).__haidao[fn as string] as (...x: unknown[]) => unknown)(...(args as unknown[])), [f, a]) as Promise<T>;
  const tapAt = async (x: number, y: number): Promise<void> => {
    if (view.hasTouch) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
  };
  const click = (sel: string): Promise<void> => page.locator(sel).first().click({ timeout: 10_000 });
  const sceneIs = (s: string, ms = 60_000): Promise<unknown> => page.waitForFunction((w) => (window as unknown as { __haidao?: Hook }).__haidao?.scene === w, s, { timeout: ms, polling: 100 });
  const ready = (): Promise<unknown> => page.waitForFunction(() => (window as unknown as { __haidao?: Hook }).__haidao?.ready === true, null, { timeout: 120_000, polling: 200 });
  const tickOf = async (): Promise<number> => (scene === 'battle' ? (await call<{ tick: number }>('battleInfo')).tick : (await call<{ tick: number }>('tdInfo')).tick);
  const waitTick = async (n: number): Promise<void> => {
    for (let i = 0; i < 2000; i++) {
      if ((await tickOf()) >= n) return;
      await sleep(40);
    }
    throw new Error(`等不到第 ${n} 拍，现在 ${JSON.stringify(await call(scene === 'battle' ? 'battleInfo' : 'tdInfo'))}，操作 ${ops.join('；')}`);
  };

  try {
    const record = mode !== 'shot' && mode !== 'sheet';
    const start = async (): Promise<void> => {
      if (!record) return;
      await page.evaluate(() => {
        const pf = (window as unknown as { __pf: { on: boolean; t: number[]; lt: number[][]; draws: number[]; uploads: number[]; js: number[] } }).__pf;
        pf.t.length = pf.lt.length = pf.draws.length = pf.uploads.length = pf.js.length = 0;
        pf.on = true;
      });
      if (mode === 'diag') {
        await cdp.send('Profiler.enable');
        await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
        await cdp.send('Profiler.start');
      }
    };
    let t0 = 0;

    if (scene === 'base') {
      await page.goto(`${ROOT}?dev${EXTRA}`, { timeout: 60_000 });
      await ready();
      await page.evaluate((pr) => (window as unknown as { __haidao: { dev: { load(x: unknown): void } } }).__haidao.dev.load(pr), { ...fullBase(BASE_HQ, 'spread', true), res: { gold: 5000, wood: 5000 }, tutorial: 99 });
      await sleep(1500);
      await ready();
      if (BASE_FOCUS !== 'home') {
        const at = /^-?[\d.]+,-?[\d.]+$/.test(BASE_FOCUS) ? iso(...(BASE_FOCUS.split(',').map(Number) as [number, number])) : null;
        const ok = await page.evaluate(([k, z, p]) => {
          const h = (window as unknown as { __haidao: { focusOn(k: string, z: number): boolean; lookAt(x: number, y: number, z: number): void } }).__haidao;
          if (!p) return h.focusOn(k as string, z as number);
          h.lookAt(p.x, p.y, z as number);
          return true;
        }, [BASE_FOCUS === 'edge' ? EDGE_KIND : BASE_FOCUS, BASE_ZOOM, at] as const);
        if (!ok) throw new Error(`基地里没有 ${BASE_FOCUS}`);
        // 只要镜头，不要选中框（选中时前面的建筑会淡出）
        await page.keyboard.press('Escape');
      }
      await sleep(2500);
      if (record && view.throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: view.throttle });
      await sleep(600);
      await start();
      ops.push(`镜头 ${BASE_FOCUS === 'edge' ? `${BASE_FOCUS}（${EDGE_KIND}）` : BASE_FOCUS} ×${BASE_ZOOM}`);
      if (mode === 'shot') await page.screenshot({ path: join(OUT!, `${view.name === 'phone4' ? 'phone' : view.name}-base-${BASE_FOCUS}.png`) });
    } else if (scene === 'battle') {
      if (ARMY_HQ > 0) {
        const save = JSON.stringify({ profile: { ...sampleProfile(ARMY_HQ), tutorial: 99, res: { gold: 50_000, wood: 50_000 } }, lastSeen: 0 });
        await page.addInitScript((sv: string) => localStorage.setItem('haidao.save', sv), save);
      }
      await page.goto(`${ROOT}?battle=${BATTLE_LEVEL}${EXTRA}`, { timeout: 60_000 });
      await ready();
      if (record && view.throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: view.throttle });
      await sleep(600);
      await start();
      t0 = await tickOf();
      // 放全部兵：每 8 拍放一队，轮流用四面沙滩；点船卡、点沙滩都是真点击
      for (let i = 0; i < 24; i++) {
        const info = await call<{ landed: boolean[] }>('battleInfo');
        if (info.landed.every(Boolean)) break;
        // 第一队马上放：侦察期里第一个操作之前拍数不走（BattleScene.scouting），等拍会一直等不到
        if (i > 0) await waitTick(t0 + 4 + i * 8);
        if ((await page.locator('.hd-boat.sel').count()) === 0) await click('.hd-boat:not(.done)');
        await sleep(120);
        const bp = await call<{ x: number; y: number } | null>('beach', i);
        if (!bp) throw new Error('没有海滩点');
        await tapAt(bp.x, bp.y);
        ops.push(`第 ${i === 0 ? t0 : t0 + 4 + i * 8} 拍起放第 ${i + 1} 队`);
      }
      // 炮击：能量够了（按钮不再灰）才放，打主寨
      const skillAt = t0 + 100;
      await waitTick(skillAt);
      for (let k = 0; k < 600; k++) {
        const on = await page.evaluate(() => {
          const b = document.querySelector<HTMLElement>('.hd-skill');
          return !!b && b.style.opacity === '1';
        });
        if (on) break;
        if (record && (await tickOf()) > t0 + SECS * 20) break;
        await sleep(100);
      }
      if (await page.evaluate(() => document.querySelector<HTMLElement>('.hd-skill')?.style.opacity === '1')) {
        await click('.hd-skill');
        const h = await call<{ x: number; y: number } | null>('where', 'hq');
        if (h) await tapAt(h.x, h.y);
        ops.push(`第 ${await tickOf()} 拍放炮击`);
      } else ops.push('能量没攒够，没放炮击');
      if (mode === 'shot') {
        await waitTick(t0 + 260);
        await call('home');
        await sleep(150);
        await page.screenshot({ path: join(OUT!, `${view.name === 'phone4' ? 'phone' : view.name}-battle.png`) });
      }
      if (mode === 'sheet') {
        await waitTick(t0 + 150);
        await sheets(page, call, view.name);
      }
    } else {
      await page.goto(`${ROOT}?dev${EXTRA}`, { timeout: 60_000 });
      await ready();
      await page.evaluate((hq) => (window as unknown as { __haidao: { dev: { td(h: number): void } } }).__haidao.dev.td(hq), TD_HQ);
      await sleep(900);
      await click('.hd-bottom button:has-text("守岛")');
      await sleep(500);
      await click(`.hd-tdtab[data-chapter="${Math.ceil(Number(TD_LEVEL.slice(2)) / 6)}"]`);
      await sleep(300);
      await click(`.hd-tdcard button[data-level="${TD_LEVEL}"]`);
      // 带驻守台的关先弹选塔面板：按默认挑法开打
      await page.locator('.hd-tdgar-go').first().click({ timeout: 3000 }).catch(() => undefined);
      await sceneIs('td', 90_000);
      await sleep(1200);
      if (record && view.throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: view.throttle });
      const pt = (gx: number, gy: number): Promise<{ x: number; y: number }> => call('tdPt', gx, gy);
      // 造三座炮塔（面板开着时画面层暂停，造完才往前走，所以先造再开始录）
      const inf = await call<{ slots: Array<{ x: number; y: number; tower: number }> }>('tdInfo');
      for (let i = 0; i < Math.min(3, inf.slots.length); i++) {
        const sl = inf.slots[i]!;
        const p = await pt(sl.x, sl.y);
        await tapAt(p.x, p.y);
        await sleep(400);
        const btn = page.locator('.hd-td-tower[data-kind="cannon"]').first();
        if (!(await btn.isEnabled())) {
          // 钱不够：收起面板，用已经造出来的塔
          await page.locator('.hd-td-sheet .hd-x').first().click({ timeout: 5000 }).catch(() => undefined);
          ops.push(`第 ${i + 1} 座炮塔钱不够，跳过`);
          break;
        }
        await btn.click({ timeout: 10_000 });
        await sleep(500);
        ops.push(`造第 ${i + 1} 座炮塔`);
      }
      await start();
      t0 = await tickOf();
      await click('.hd-td-call');
      ops.push(`第 ${t0} 拍叫第一波`);
      const hp = await pt(10, 7);
      await tapAt(hp.x, hp.y);
      ops.push('英雄走位');
      await waitTick(t0 + 40);
      await page.locator('.hd-td-skill').nth(1).click({ timeout: 8000 }).catch(() => ops.push('号令点不动'));
      ops.push(`第 ${await tickOf()} 拍放号令`);
      for (let c = 2; c <= TD_CALLS; c++) {
        await waitTick(t0 + 100 + (c - 2) * 60);
        await page.locator('.hd-td-call').click({ timeout: 8000 }).catch(() => ops.push(`第 ${c} 次叫波点不动`));
        ops.push(`第 ${await tickOf()} 拍叫第 ${c} 波`);
      }
      if (mode === 'shot') {
        await waitTick(t0 + 160);
        await page.screenshot({ path: join(OUT!, `${view.name === 'phone4' ? 'phone' : view.name}-td.png`) });
      }
    }

    const run: Run = { mode, errors, load, ops };
    if (record) {
      // 录满 SECS 秒（从开始录算）
      const began = Date.now();
      // start() 之后已经过了一些时间，用页面里的计时保证总长
      for (;;) {
        const have = await page.evaluate(() => {
          const t = (window as unknown as { __pf: { t: number[] } }).__pf.t;
          return t.length > 1 ? (t[t.length - 1]! - t[0]!) / 1000 : 0;
        });
        if (have >= SECS || Date.now() - began > SECS * 3000) break;
        await sleep(500);
      }
      await page.evaluate(() => ((window as unknown as { __pf: { on: boolean } }).__pf.on = false));
      run.fps = await collect(page, gl);
      if (scene !== 'base') run.fps.objects = (await call<{ objects: number }>(scene === 'battle' ? 'battleInfo' : 'tdInfo')).objects;
      // 场上同时有几个兵 / 敌人（看大场面压到多少）
      if (scene !== 'base') run.fps.units = (await call<unknown[] | undefined>('units'))?.length ?? 0;
      if (mode === 'diag') {
        const prof = (await cdp.send('Profiler.stop')) as unknown as { profile: CpuProfile };
        run.cpu = summarize(prof.profile);
      }
    }
    if (record && scene !== 'base') ops.push(`录完时：${JSON.stringify(await call(scene === 'battle' ? 'battleInfo' : 'tdInfo').then((x) => { const o = x as Record<string, unknown>; delete o.slots; return o; }))}`);
    run.load = `${load} -> ${loadavg()}`;
    return run;
  } finally {
    await ctx.close();
  }
}

// ---------------------------------------------------------------- 帧时间曲线

/** 逐帧的帧时长（蓝）和游戏脚本耗时（橙）画成曲线，标出中位数、1.5 × 中位数、50ms 三条线 */
function curve(file: string, title: string, f: Fps): void {
  const d = f.dts ?? [];
  const j = f.js ?? [];
  if (d.length < 2) return;
  const W = 1200;
  const H = 360;
  const L = 50;
  const T = 30;
  const pw = W - L - 20;
  const ph = H - T - 40;
  const max = Math.max(70, Math.min(160, Math.ceil(pct(d, 99.5) / 10) * 10));
  const X = (i: number, n: number): number => L + (i / Math.max(1, n - 1)) * pw;
  const Y = (ms: number): number => T + ph - (Math.min(ms, max) / max) * ph;
  const poly = (a: number[], c: string): string => `<polyline fill="none" stroke="${c}" stroke-width="1.2" points="${a.map((v, i) => `${X(i, a.length).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}"/>`;
  // left：标签放左端（1.5 倍中位常和 50ms 重合，两个标签分放两头）
  const hl = (ms: number, c: string, label: string, left = false): string => `<line x1="${L}" x2="${L + pw}" y1="${Y(ms)}" y2="${Y(ms)}" stroke="${c}" stroke-dasharray="6 4"/><text x="${left ? L + 4 : L + pw - 4}" y="${Y(ms) - 4}" text-anchor="${left ? 'start' : 'end'}" font-size="13" fill="${c}">${label}</text>`;
  let g = `<rect width="${W}" height="${H}" fill="#fff"/><text x="${L}" y="20" font-size="15" fill="#123">${title}：帧时长（蓝）、游戏脚本（橙），${f.frames} 帧 / ${f.secs} 秒，中位 ${f.p50}ms，p95 ${f.p95}ms（${f.ratio}×），&gt;50ms ${f.over50} 帧</text>`;
  for (let ms = 0; ms <= max; ms += 10) g += `<line x1="${L}" x2="${L + pw}" y1="${Y(ms)}" y2="${Y(ms)}" stroke="#eee"/><text x="${L - 6}" y="${Y(ms) + 4}" text-anchor="end" font-size="11" fill="#678">${ms}</text>`;
  g += poly(d, '#2a6fdb') + poly(j, '#f08a24');
  g += hl(f.p50, '#2a8a3a', `中位 ${f.p50}`) + hl(f.p50 * 1.5, '#b07a00', `1.5×中位 ${r1(f.p50 * 1.5)}`) + hl(50, '#c0392b', '50ms', true);
  g += `<text x="${L}" y="${H - 12}" font-size="12" fill="#678">横轴：帧序号（共 ${d.length} 帧）；纵轴：毫秒（超过 ${max} 的压在顶上）</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg>`;
  writeFileSync(join(OUT!, file), new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng());
}

// ---------------------------------------------------------------- 主流程

interface Cell {
  fps: Run[];
  best?: Run;
  diag?: Run;
  shotErrors?: string[];
}
const result: Record<string, Record<string, Cell>> = {};
const lines: string[] = [];
const started = Date.now();
try {
  for (const v of VIEWS) {
    if (!VIEW_NAMES.includes(v.name)) continue;
    for (const sc of SCENES) {
      const cell: Cell = { fps: [] };
      (result[v.name] ??= {})[sc] = cell;
      if (!ONLY || ONLY === 'fps') {
        for (let i = 0; i < RUNS; i++) {
          const r = await runScene(v, sc, 'fps');
          cell.fps.push(r);
          console.log(`${v.name} ${sc} fps#${i + 1}：${r.fps?.avgFps} 帧/秒 p95 ${r.fps?.p95}ms 长帧(>33) ${r.fps?.over33} 负载 ${r.load}${r.errors.length ? ` 报错 ${r.errors.length}` : ''}`);
        }
        cell.best = cell.fps.slice().sort((a, b) => a.fps!.p95 - b.fps!.p95)[0];
      }
      if (!ONLY || ONLY === 'diag') {
        cell.diag = await runScene(v, sc, 'diag');
        console.log(`${v.name} ${sc} diag：draw/帧 ${cell.diag.fps?.drawsAvg} 传贴图/秒 ${cell.diag.fps?.uploadsPerSec} GC ${cell.diag.cpu?.buckets.gc}ms`);
      }
      if (ONLY === 'sheet') {
        if (sc === 'battle' && v.name === 'desktop') await runScene(v, sc, 'sheet');
      }
      if (!ONLY || ONLY === 'shot') {
        const s = await runScene(v, sc, 'shot');
        cell.shotErrors = s.errors;
        console.log(`${v.name} ${sc} shot 完成${s.errors.length ? `，报错 ${s.errors.length}` : ''}`);
      }
    }
  }
} finally {
  await browser.close();
  await server.close();
}

// 表格
const name: Record<string, string> = { base: `基地 ${BASE_HQ} 级满配（镜头 ${BASE_FOCUS} ×${BASE_ZOOM}）`, battle: `登陆战 ${BATTLE_LEVEL}${ARMY_HQ ? `（主寨 ${ARMY_HQ} 满编）` : ''}`, td: `守岛 ${TD_LEVEL}${TD_CALLS !== 2 ? `（叫 ${TD_CALLS} 次波）` : ''}`, phone4: '手机竖屏 CPU×4', desktop: '桌面 1280×800' };
lines.push(`# 帧率测量（${new Date().toISOString().slice(0, 16)}，每格 ${SECS} 秒，${RUNS} 次取 p95 最好的一次）`, '');
lines.push('| 视口 | 场景 | 平均帧率 | 中位 ms | p95 ms | p95/中位 | p99 ms | >33ms | >50ms | JS 每帧 平均 / p95 ms | 非脚本（光栅化）ms | 显示对象 / 兵和敌人 | longtask 个数 / 总 ms | 负载（跑前 -> 跑后） |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const [vn, cells] of Object.entries(result)) {
  for (const [sn, c] of Object.entries(cells)) {
    const f = c.best?.fps;
    if (!f) continue;
    lines.push(`| ${name[vn]} | ${name[sn]} | ${f.avgFps} | ${f.p50} | ${f.p95} | ${f.ratio} | ${f.p99} | ${f.over33} | ${f.over50} | ${f.jsAvg} / ${f.jsP95} | ${f.rasterMs} | ${f.objects ?? ''} / ${f.units ?? ''} | ${f.longtasks} / ${f.longtaskMs} | ${c.best!.load} |`);
    curve(`curve-${vn}-${sn}.png`, `${name[vn]} / ${name[sn]}`, f);
  }
}
// 所有者质量线（2026-10-30）：p95 ≤ 1.5 × 中位数、没有 >50ms 长帧、手机降速 JS ≤ 8ms/帧（本机无 GPU，帧时间含软件光栅化，只看比值和 JS）
lines.push('', '## 质量线', '', '| 视口 | 场景 | p95 / 中位数（≤ 1.5） | >50ms 长帧（0） | JS 每帧 ms（手机 ≤ 8） |', '|---|---|---|---|---|');
for (const [vn, cells] of Object.entries(result)) {
  for (const [sn, c] of Object.entries(cells)) {
    const f = c.best?.fps;
    if (!f) continue;
    const ratio = f.p95 / Math.max(0.1, f.p50);
    const jsOk = vn !== 'phone4' || f.jsAvg <= 8;
    lines.push(`| ${name[vn]} | ${name[sn]} | ${ratio.toFixed(2)} ${ratio <= 1.5 ? '过' : '没过'} | ${f.over50} ${f.over50 === 0 ? '过' : '没过'} | ${f.jsAvg} ${jsOk ? '过' : '没过'} |`);
  }
}
lines.push('');
for (const [vn, cells] of Object.entries(result)) {
  for (const [sn, c] of Object.entries(cells)) {
    const d = c.diag;
    if (!d?.cpu) continue;
    lines.push('', `## 采样：${name[vn]} / ${name[sn]}`, '');
    lines.push(`draw 调用 平均 ${d.fps?.drawsAvg} / 帧（p95 ${d.fps?.drawsP95}），传贴图 ${d.fps?.uploadsPerSec} 次/秒；自身耗时分布（ms）：${Object.entries(d.cpu.buckets).map(([k, x]) => `${k} ${x}`).join('，')}`, '');
    lines.push('| 自身耗时 ms | 占忙时 % | 函数 |', '|---|---|---|');
    for (const t of d.cpu.top.slice(0, 15)) lines.push(`| ${t.ms} | ${t.pct} | ${t.where} |`);
  }
}
const errs = Object.entries(result).flatMap(([vn, cells]) => Object.entries(cells).flatMap(([sn, c]) => [...c.fps.flatMap((r) => r.errors), ...(c.diag?.errors ?? []), ...(c.shotErrors ?? [])].map((e) => `${vn} ${sn}：${e}`)));
if (errs.length) lines.push('', '## 控制台报错', '', ...[...new Set(errs)].map((e) => `- ${e}`));
writeFileSync(join(OUT, 'perf.json'), JSON.stringify(result));
writeFileSync(join(OUT, 'perf.md'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
console.log(`\n用时 ${Math.round((Date.now() - started) / 1000)} 秒，输出在 ${OUT}`);
if (errs.length) process.exit(1);
