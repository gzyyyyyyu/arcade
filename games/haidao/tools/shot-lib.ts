/**
 * shot.ts 各条流程共用的部分：测试钩子的类型、视口表、几条流程都认的参数、按钮尺寸检查、音效计数，
 * 以及每个视口一份的上下文 ShotCtx。各流程在函数开头解构 ShotCtx 拿到要用的名字，所以字段名跟着流程体走，不另起名。
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { CAMPAIGN, TD2_LEVEL_BY_ID } from '../src/core/index.ts';
import { flag, opt } from './args.ts';

export const QUERY = opt('--query') ?? '';
/** 驻岛英雄截图：给战役局加一个宝藏箱和英雄（等级 1-8），见 main.ts 的 devhero */
const HERO = opt('--hero');
export const HQ = HERO ? `dev&devhero=${HERO}` : '';
export const LEVEL = opt('--level') ?? CAMPAIGN[0]?.id ?? '';
/** --td 默认打第一章第 1 关；--level td07 打别的关（章节标签、主寨等级随关卡走，--hq 可改主寨） */
export const TD_LEVEL = opt('--level') ?? 'td01';
export const TD_LV = TD2_LEVEL_BY_ID.get(TD_LEVEL);
export const TD_CHAPTER = TD_LV?.chapter ?? 1;
export const TD_HQ = Number(opt('--hq') ?? Math.max(3, TD_LV?.hq ?? 3));
/** --td --nav：在驻守台面板上换成航海士（要第一章通关，dev.td 给了），技能那一步改放急射旗和重赏 */
export const TD_NAV = flag('--nav');
export const TD_MECHANIC = !!(TD_LV && (TD_LV.sapperJam || TD_LV.bossSkill));
// 守岛类的加速钮：电脑和横屏在底栏，手机竖屏挪到顶栏（.hd-td-speedtop，layout.ts）；竖屏护航常驻在右边一列（.hd-esc-quick .hd-esc-speed，escortview.ts）
export const TD_SPEED = '.hd-td-bar2 button:has-text("×"):visible, .hd-td-speedtop:visible, .hd-esc-speed:visible';

export const VIEWS = [
  { name: 'desktop', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  { name: 'wide', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  { name: 'phonep', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'phone', viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'small', viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];
export type View = (typeof VIEWS)[number];

export type Hook = { tdPt?(x: number, y: number): { x: number; y: number }; tdInfo?(): { tick: number; wave: number; vault: number; lost: number; gold: number; over: boolean; slots: Array<{ x: number; y: number; tower: number; wreck: boolean; garrison: boolean }>; flags: number; routes: number; barricades: number; hero: { x: number; y: number; goal: { x: number; y: number } | null; kind?: 'nav'; flag: boolean; reward: boolean }; jammed: number; skilled: number; tags: Array<{ l: number; t: number; r: number; b: number; text: string }> }; ready?: boolean; level?: string; scene?: string; dev?: { give(g: number, w: number, s: number): void; td(hq: number, branch?: boolean): void }; where?(k: string): { x: number; y: number } | null; beach?(i: number): { x: number; y: number } | null };
export const hook = (page: Page): Promise<Hook> => page.evaluate(() => ((window as unknown as { __haidao?: Hook }).__haidao ?? {}) as Hook);

// ---------------------------------------------------------------- 音效触发统计（--sfx-out <文件> 写 json，控制台总是打印）

type SfxCount = { req: number; played: number; gap: number; cap: number; silent: number };
const sfxTotal = new Map<string, SfxCount>();
/** 每 400ms 读一次页面里的计数（页面跳转会清零，按增量累加；计数只增不减，变小就当作重新载入） */
function trackSfx(page: Page): () => Promise<void> {
  const prev = new Map<string, SfxCount>();
  const poll = async (): Promise<void> => {
    const st = await page.evaluate(() => (window as unknown as { __haidao?: { sfxStats?(): { counts: Record<string, SfxCount> } } }).__haidao?.sfxStats?.().counts ?? null).catch(() => null);
    if (!st) return;
    for (const [name, c] of Object.entries(st)) {
      const old = prev.get(name);
      const base = old && old.req <= c.req ? old : { req: 0, played: 0, gap: 0, cap: 0, silent: 0 };
      const tot = sfxTotal.get(name) ?? { req: 0, played: 0, gap: 0, cap: 0, silent: 0 };
      for (const k of Object.keys(tot) as Array<keyof SfxCount>) tot[k] += c[k] - base[k];
      sfxTotal.set(name, tot);
      prev.set(name, { ...c });
    }
  };
  const timer = setInterval(() => void poll(), 400);
  return async () => {
    clearInterval(timer);
    await poll();
  };
}
export function printSfx(): void {
  const rows = [...sfxTotal.entries()].sort((a, b) => b[1].req - a[1].req);
  console.log('声音\t请求\t放出\t限频丢\t并发丢\t没有音频');
  for (const [n, c] of rows) console.log(`${n}\t${c.req}\t${c.played}\t${c.gap}\t${c.cap}\t${c.silent}`);
  const out = opt('--sfx-out');
  if (out) writeFileSync(out, JSON.stringify(Object.fromEntries(rows)));
}

export async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const bad: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('button, a, [role="button"]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (getComputedStyle(el).visibility === 'hidden') continue;
      if (r.width < 44 || r.height < 44) bad.push(`点击区域太小 ${Math.round(r.width)}×${Math.round(r.height)}：${el.getAttribute('aria-label') ?? el.textContent?.trim()}`);
      // 左右被裁：最近一层裁内容的外框（overflow 不是 visible）把按钮切掉一截（上下在滚动区里是正常的，不查）
      for (let p = el.parentElement; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
        const q = p.getBoundingClientRect();
        const cut = Math.max(q.left - r.left, r.right - q.right);
        if (cut > 1) bad.push(`按钮左右被切 ${Math.round(cut)} 像素：${el.getAttribute('aria-label') ?? el.textContent?.trim()}`);
        break;
      }
    }
    return bad;
  });
}

// ---------------------------------------------------------------- 每个视口一份的上下文

export type ShotCtx = {
  page: Page;
  v: View;
  ctx: BrowserContext;
  OUT: string;
  ROOT: string;
  /** 所有视口、所有流程共用一份，shot.ts 最后统一报 */
  problems: string[];
  /** 假服务端故意回 409 need_reload 的那一步：浏览器会把 4xx 记成控制台 error，这一步里放过 */
  allow409: boolean;
  sfxDone: () => Promise<void>;
  ready: () => Promise<void>;
  shot: (name: string) => Promise<void>;
  tap: (x: number, y: number) => Promise<void>;
  sceneIs: (s: string, ms?: number) => Promise<unknown>;
  step: (name: string, f: () => Promise<void>) => Promise<boolean>;
  click: (sel: string) => Promise<void>;
  where: (k: string) => Promise<{ x: number; y: number } | null>;
  /** 基地里点一座建筑：在屏幕外（竖屏常见）就先像玩家一样拖地图把它拖到屏幕中间，再点；返回点的位置 */
  tapBuilding: (k: string) => Promise<{ x: number; y: number }>;
  beach: (i: number) => Promise<{ x: number; y: number } | null>;
};

/** 开一个视口：新 context 和页面、音效计数、控制台报错收集，以及流程里的那些小函数（截图编号每个视口从 1 起） */
export async function openView(browser: Browser, v: View, ROOT: string, OUT: string, problems: string[]): Promise<ShotCtx> {
  const ctx = await browser.newContext(v);
  const page = await ctx.newPage();
  const sfxDone = trackSfx(page);
  const ready = async (): Promise<void> => {
    try {
      await page.waitForFunction(() => (window as unknown as { __haidao?: Hook }).__haidao?.ready === true, null, { timeout: 60_000 });
    } catch (e) {
      // 没就绪：把截图和已收集的报错先吐出来，再失败
      await page.screenshot({ path: join(OUT, `${v.name}-stuck.png`) }).catch(() => {});
      console.error(`${v.name} 没就绪，场景 ${(await hook(page).catch(() => ({}) as Hook)).scene}，载入文字：${await page.locator('#boot').textContent().catch(() => '')}`);
      console.error(problems.join('\n'));
      throw e;
    }
  };
  let n = 0;
  const shot = async (name: string): Promise<void> => {
    // 结算页有入场动画（星星依次落、战利品滚动、按钮最后淡入），等演完再截
    if (name.includes('result')) await page.waitForTimeout(3200);
    await page.screenshot({ path: join(OUT, `${v.name}-${String(++n).padStart(2, '0')}-${name}.png`) });
  };
  const tap = async (x: number, y: number): Promise<void> => {
    if (v.hasTouch) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
  };
  const sceneIs = (s: string, ms = 20_000): Promise<unknown> => page.waitForFunction((w) => (window as unknown as { __haidao?: Hook }).__haidao?.scene === w, s, { timeout: ms });
  const step = async (name: string, f: () => Promise<void>): Promise<boolean> => {
    try {
      await f();
      return true;
    } catch (e) {
      problems.push(`${v.name} 流程「${name}」失败：${(e as Error).message.split('\n')[0]}`);
      await page.screenshot({ path: join(OUT, `${v.name}-${String(++n).padStart(2, '0')}-FAIL-${name}.png`) }).catch(() => {});
      return false;
    }
  };
  const click = (sel: string): Promise<void> => page.locator(sel).first().click({ timeout: 8000 });
  const where = (k: string): Promise<{ x: number; y: number } | null> => page.evaluate((kk) => (window as unknown as { __haidao: Hook }).__haidao.where?.(kk) ?? null, k);
  const beach = (i: number): Promise<{ x: number; y: number } | null> => page.evaluate((ii) => (window as unknown as { __haidao: Hook }).__haidao.beach?.(ii) ?? null, i);
  /** 一指（或鼠标左键）从屏幕中间拖 (dx, dy)：分 12 步，像手指慢慢挪，不会被当成点按或快甩 */
  const drag = async (dx: number, dy: number): Promise<void> => {
    const sx = v.viewport.width / 2;
    const sy = v.viewport.height / 2;
    if (v.hasTouch) {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy }] });
      for (let k = 1; k <= 12; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + (dx * k) / 12, y: sy + (dy * k) / 12 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    } else {
      await page.mouse.move(sx, sy);
      await page.mouse.down();
      await page.mouse.move(sx + dx, sy + dy, { steps: 12 });
      await page.mouse.up();
    }
    await page.waitForTimeout(600);
  };
  const tapBuilding = async (k: string): Promise<{ x: number; y: number }> => {
    const { width: w, height: h } = v.viewport;
    const inView = (p: { x: number; y: number }): boolean => p.x > 40 && p.x < w - 40 && p.y > 90 && p.y < h - 140;
    let p = await where(k);
    // 一次最多拖四分之一屏：拖太远会甩出惯性；四次还不在屏内就照点，让流程按「没弹出来」报
    for (let i = 0; i < 4 && p && !inView(p); i++) {
      await drag(Math.max(-w / 4, Math.min(w / 4, w / 2 - p.x)), Math.max(-h / 4, Math.min(h / 4, h / 2 - p.y)));
      p = await where(k);
    }
    if (!p) throw new Error(`找不到 ${k}`);
    await tap(p.x, p.y);
    return p;
  };
  const c: ShotCtx = { page, v, ctx, OUT, ROOT, problems, allow409: false, sfxDone, ready, shot, tap, sceneIs, step, click, where, tapBuilding, beach };
  page.on('console', (m) => {
    if (m.type() === 'error' && !/GL Driver Message/.test(m.text()) && !(c.allow409 && /status of 409/.test(m.text()))) problems.push(`${v.name} 控制台报错：${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`${v.name} 未捕获异常：${e.message}`));
  return c;
}
