/**
 * 界面拥挤度自动测量（所有者质量线）：node tools/layout-check.ts [--view phonep,phonel,pc720,pc1080]
 * 四种尺寸 × 基地 / 登陆战（真人非 auto，选好船）/ 守岛开局，量 DOM 矩形：
 *   顶栏 + 底栏占屏高（竖屏 ≤ 22%）、岛可见区面积（≥ 60%）、点按目标 ≥ 44×44、相邻目标间距 ≥ 8、同屏文字牌子 ≤ 6、
 *   拇指区（竖屏下 1/3）放最常用操作。每项给数字和 过 / 没过，有一项没过退出码 1。
 */
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { opt } from './args.ts';

const ONLY = opt('--view')?.split(',') ?? ['phonep', 'phonel', 'pc720', 'pc1080'];
/** 守岛量哪一关（默认第 1 关；带驻守台的关会先过选塔面板） */
const TD_LEVEL = opt('--level') ?? 'td01';
const VIEWS = [
  { name: 'phonep', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'phonel', viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'pc720', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  { name: 'pc1080', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];
interface M { topPct: number; bottomPct: number; barsPct: number; areaPct: number; small: string[]; minGap: number; tight: string; signs: number; thumb: string }
type H = { ready?: boolean; scene?: string; dev: { give(g: number, w: number, s: number): void; td(hq: number): void } };

const server = await createServer({ logLevel: 'warn', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
await server.listen();
const addr = server.httpServer?.address();
if (!addr || typeof addr === 'string') throw new Error('vite 没有监听端口');
const ROOT = `http://127.0.0.1:${addr.port}/`;
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--no-proxy-server', '--no-zygote', '--in-process-gpu'] });
let fail = 0;

const measure = (): M => {
  const W = innerWidth;
  const Hh = innerHeight;
  const vis = (e: Element): DOMRect | null => {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' ? r : null;
  };
  let top = 0, bottom = 0, right = 0;
  for (const e of document.querySelectorAll('.hd-hall, .hd-bar, .hd-bar2, .hd-td-bar, .hd-td-bar2')) {
    const r = vis(e);
    if (r && r.top < Hh * 0.3) top = Math.max(top, r.bottom);
  }
  let bottomTop = Hh;
  for (const e of document.querySelectorAll('.hd-bottom, .hd-cards, .hd-td-bottom')) {
    const r = vis(e);
    if (!r) continue;
    if (r.width > W * 0.6) { bottom = Math.max(bottom, Hh - r.top); bottomTop = Math.min(bottomTop, r.top); }
    else if (r.left > W * 0.5) right = Math.max(right, W - r.left);
  }
  const btns = [...document.querySelectorAll('.hd-ui button')].map((b) => ({ b, r: vis(b) })).filter((x): x is { b: Element; r: DOMRect } => x.r !== null);
  const small = btns.filter((x) => x.r.width < 43.5 || x.r.height < 43.5).map((x) => `${Math.round(x.r.width)}×${Math.round(x.r.height)} ${x.b.getAttribute('aria-label') ?? x.b.textContent?.trim().slice(0, 8)}`);
  let minGap = Infinity;
  let tight = '';
  for (let a = 0; a < btns.length; a++) {
    for (let c = a + 1; c < btns.length; c++) {
      const p = btns[a]!.r, q = btns[c]!.r;
      if (btns[a]!.b.contains(btns[c]!.b) || btns[c]!.b.contains(btns[a]!.b)) continue;
      const dx = Math.max(q.left - p.right, p.left - q.right);
      const dy = Math.max(q.top - p.bottom, p.top - q.bottom);
      const gap = dx < 0 && dy < 0 ? -1 : Math.max(dx, dy);
      if (gap < 40 && gap < minGap) { minGap = gap; tight = `${btns[a]!.b.textContent?.trim().slice(0, 6) || '图标'} / ${btns[c]!.b.textContent?.trim().slice(0, 6) || '图标'}`; }
    }
  }
  const signs = [...document.querySelectorAll('.hd-pill, .hd-hint, .hd-toast.on, .hd-td-plan, .hd-en')].filter((e) => vis(e)).length;
  const land = W > Hh;
  const area = ((W - right) * (Hh - top - bottom)) / (W * Hh);
  return {
    topPct: Math.round((top / Hh) * 1000) / 10,
    bottomPct: Math.round((bottom / Hh) * 1000) / 10,
    barsPct: Math.round(((top + bottom) / Hh) * 1000) / 10,
    areaPct: Math.round(area * 1000) / 10,
    small,
    minGap: minGap === Infinity ? 99 : Math.round(minGap),
    tight,
    signs,
    thumb: land ? '横屏' : bottomTop >= (Hh * 2) / 3 - 1 ? `底栏顶在 ${Math.round((bottomTop / Hh) * 100)}%` : `底栏顶在 ${Math.round((bottomTop / Hh) * 100)}%（高于下 1/3）`,
  };
};

try {
  for (const v of VIEWS) {
    if (!ONLY.includes(v.name)) continue;
    const ctx = await browser.newContext(v);
    const page = await ctx.newPage();
    const ready = (): Promise<unknown> => page.waitForFunction(() => (window as unknown as { __haidao?: H }).__haidao?.ready === true, null, { timeout: 90_000 });
    const portrait = v.viewport.height > v.viewport.width;
    const report = async (scene: string): Promise<void> => {
      const m = (await page.evaluate(measure)) as M;
      const checks: Array<[string, boolean, string]> = [
        ['点按 ≥ 44×44', m.small.length === 0, m.small.length ? m.small.join('；') : '全部达标'],
        ['相邻间距 ≥ 8', m.minGap >= 8, `最小 ${m.minGap}px${m.tight ? `（${m.tight}）` : ''}`],
        ['文字牌子 ≤ 6', m.signs <= 6, `${m.signs} 个`],
        ['岛可见区 ≥ 60%', m.areaPct >= 60, `${m.areaPct}%`],
      ];
      if (portrait) {
        checks.push(['顶栏 + 底栏 ≤ 22%', m.barsPct <= 22, `${m.barsPct}%（顶 ${m.topPct}% + 底 ${m.bottomPct}%）`]);
        checks.push(['拇指区放操作', m.thumb.indexOf('高于') < 0, m.thumb]);
      }
      for (const [n, ok, d] of checks) {
        if (!ok) fail++;
        console.log(`${v.name} ${scene} ${n}：${ok ? '过' : '没过'} ${d}`);
      }
    };
    await page.goto(`${ROOT}?dev`, { timeout: 60_000 });
    await ready();
    await page.evaluate(() => (window as unknown as { __haidao: H }).__haidao.dev.give(600, 400, 0));
    await page.waitForTimeout(1500);
    await report('基地');
    await page.goto(`${ROOT}?battle=c04&dev`, { timeout: 60_000 });
    await ready();
    await page.waitForSelector('.hd-boat', { timeout: 30_000 });
    await page.waitForTimeout(2000);
    await page.locator('.hd-boat').first().click();
    await page.waitForTimeout(400);
    await report('登陆战');
    await page.goto(`${ROOT}?dev`, { timeout: 60_000 });
    await ready();
    await page.evaluate(() => (window as unknown as { __haidao: H }).__haidao.dev.td(3));
    await page.waitForTimeout(900);
    await page.locator('.hd-bottom button:has-text("守岛")').first().click();
    await page.waitForTimeout(500);
    await page.locator('.hd-tdtab[data-chapter="1"]').first().click();
    await page.waitForTimeout(300);
    await page.locator(`.hd-tdcard button[data-level="${TD_LEVEL}"]`).first().click();
    await page.waitForTimeout(500);
    if (await page.locator('.hd-tdgar-go').count()) {
      await report('驻守台选塔');
      await page.locator('.hd-tdgar-go').first().click();
    }
    await page.waitForFunction(() => (window as unknown as { __haidao?: H }).__haidao?.scene === 'td', null, { timeout: 60_000 });
    await page.waitForTimeout(1800);
    await report('守岛');
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(fail ? `共 ${fail} 项没过` : '全部通过');
process.exit(fail ? 1 : 0);
