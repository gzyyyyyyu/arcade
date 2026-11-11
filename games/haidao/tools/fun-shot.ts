/**
 * 每局不一样的真实画面和冒烟（DESIGN 15）：node tools/fun-shot.ts [--out <目录>] [--view desktop,phonep]
 *
 * - 战役 c05、固定种子 7（?funseed=7）：先停住帧循环，用 frameStep 一拍一拍推进，所以宝箱被捡、援军预告和靠岸的拍数是确定的：
 *   开局宝箱 + 第一次提示 → 兵路过捡到宝箱（光圈、图标、数字）→ 援军预告旗和倒计时 → 援军靠岸；
 * - 误放撤回：登陆后点"撤回"小钮，60 帧录一段 webm 加联系表（tools/record.ts 的 recordFixed）；
 * - 试打自己的岛：从 pvp.ts 直接开一局，撤退后看"试打结果"，核对没有任何 pvp 接口请求；
 * - 控制台零报错、页面零未捕获异常，不然退出码 1。端口由系统分配；没有 GPU 走 SwiftShader。
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright-core';
import { createServer } from 'vite';
import { recordFixed } from './record.ts';

const argv = process.argv.slice(2);
const opt = (k: string): string | undefined => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
const OUT = opt('--out') ?? join(process.cwd(), 'shots-fun');
const ONLY = opt('--view')?.split(',') ?? ['desktop', 'phonep'];
const VIEWS = [
  { name: 'desktop', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  { name: 'phonep', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];
mkdirSync(OUT, { recursive: true });

type Hook = { ready?: boolean; battleInfo?(): { tick: number; landed: boolean[]; units: number }; beach?(i: number): { x: number; y: number } | null; frameStep?(n: number, ms: number): void; frameEnd?(): void };
const hook = <T>(page: Page, f: (h: Hook) => T): Promise<T> => page.evaluate(`(${f.toString()})(window.__haidao)`) as Promise<T>;
const tick = (page: Page): Promise<number> => hook(page, (h) => h.battleInfo?.().tick ?? -1);
const stepTo = async (page: Page, target: number): Promise<void> => {
  for (let guard = 0; guard < 4000; guard++) {
    const t = await tick(page);
    if (t >= target) return;
    // 一次推几拍：每拍 50 毫秒，一次最多 10 拍，免得来回太多
    const n = Math.max(1, Math.min(10, target - t)) * 3;
    await page.evaluate((k) => (window as unknown as { __haidao: Hook }).__haidao.frameStep?.(k, 1000 / 60), n);
    await page.waitForTimeout(20);
  }
  throw new Error(`推不到第 ${target} 拍`);
};

const server = await createServer({ logLevel: 'warn', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
await server.listen();
const addr = server.httpServer?.address();
if (!addr || typeof addr === 'string') throw new Error('vite 没有监听端口');
const ROOT = `http://127.0.0.1:${addr.port}/`;
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--no-proxy-server', '--no-zygote', '--in-process-gpu', '--autoplay-policy=no-user-gesture-required'] });
const problems: string[] = [];

const open = async (v: (typeof VIEWS)[number], query: string): Promise<{ page: Page; close(): Promise<void>; requests: string[] }> => {
  const ctx = await browser.newContext(v);
  const page = await ctx.newPage();
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/GL Driver Message/.test(m.text())) problems.push(`${v.name} 控制台报错：${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`${v.name} 未捕获异常：${e.message}`));
  await page.goto(`${ROOT}?${query}`, { timeout: 60_000 });
  await page.waitForFunction(() => (window as unknown as { __haidao?: Hook }).__haidao?.ready === true, null, { timeout: 90_000 });
  return { page, close: () => ctx.close(), requests };
};

/** 选第一张没登陆的船卡，点 beach(i) */
const landOne = async (page: Page, i: number): Promise<void> => {
  await page.locator('.hd-boat:not(.done)').first().click();
  const p = await hook(page, (h) => h.beach?.(0) ?? null);
  void i;
  if (!p) throw new Error('取不到沙滩点');
  await page.mouse.click(p.x, p.y);
};

try {
  for (const v of VIEWS) {
    if (!ONLY.includes(v.name)) continue;
    // ---- 宝箱和援军
    {
      const { page, close } = await open(v, 'battle=c05&funseed=7&mt1&bloom=0');
      await page.evaluate(() => (window as unknown as { __haidao: Hook }).__haidao.frameStep?.(1, 1000 / 60));
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(OUT, `${v.name}-1-chests.png`) });
      const left = await page.locator('.hd-boat:not(.done)').count();
      for (let i = 0; i < left; i++) await landOne(page, i);
      const L = await tick(page);
      // 种子 7：兵走到 L+127 拍左右捡到第一个宝箱；援军 582 拍预告、642 拍靠岸
      await stepTo(page, L + 133);
      await page.screenshot({ path: join(OUT, `${v.name}-2-pickup.png`) });
      await stepTo(page, 590);
      await page.screenshot({ path: join(OUT, `${v.name}-3-ally-warn.png`) });
      await stepTo(page, 650);
      await page.screenshot({ path: join(OUT, `${v.name}-4-ally-land.png`) });
      const info = await hook(page, (h) => h.battleInfo?.());
      console.log(`${v.name}: 登陆拍 ${L}，现在 ${info?.tick} 拍，场上 ${info?.units} 个兵`);
      await close();
    }
    // ---- 撤回：落地后点"撤回"，60 帧
    {
      const { page, close } = await open(v, 'battle=c05&funseed=7&mt1&bloom=0');
      await page.evaluate(() => (window as unknown as { __haidao: Hook }).__haidao.frameStep?.(1, 1000 / 60));
      await landOne(page, 0);
      let clicked = false;
      const frames = await recordFixed(page, OUT, `${v.name}-recall`, 60, { w: 1, h: 1 }, async () => {
        if (!clicked && (await page.locator('.hd-recall button').count()) > 0) {
          await page.locator('.hd-recall button').first().click();
          clicked = true;
        }
        return false;
      });
      const after = await hook(page, (h) => h.battleInfo?.());
      console.log(`${v.name}: 撤回录了 ${frames} 帧，点到撤回钮：${clicked}，之后场上 ${after?.units} 个兵，landed=${after?.landed.join(',')}`);
      if (!clicked) problems.push(`${v.name} 没出现撤回钮`);
      if (after && after.units !== 0) problems.push(`${v.name} 撤回后场上还有 ${after.units} 个兵`);
      await close();
    }
  }
  // ---- 试打自己的岛（电脑视口）
  {
    const { page, close, requests } = await open(VIEWS[0]!, 'dev&mt1&bloom=0');
    await page.waitForTimeout(500);
    const before = requests.length;
    // 直接调 pvp.ts 的 trySelf（面板里的按钮只在联机平台上有）；用字符串求值避开类型检查
    await page.evaluate("import('/src/view/pvp.ts').then((m) => m.trySelf())");
    await page.waitForFunction(() => (window as unknown as { __haidao?: Hook }).__haidao?.battleInfo?.() !== undefined, null, { timeout: 60_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT, 'trial-1-battle.png') });
    await page.locator('.hd-btn-red').first().click();
    await page.getByRole('button', { name: '结束' }).click().catch(() => undefined);
    await page.getByText('试打结果').waitFor({ timeout: 10_000 });
    await page.screenshot({ path: join(OUT, 'trial-2-result.png') });
    const pvpCalls = requests.slice(before).filter((u) => /\/api\/pvp\//.test(u));
    console.log(`试打：pvp 接口请求 ${pvpCalls.length} 次`);
    if (pvpCalls.length > 0) problems.push(`试打调了 pvp 接口：${pvpCalls.join(' ')}`);
    await close();
  }
} finally {
  await browser.close();
  await server.close();
}
if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('fun-shot：全部通过，图在', OUT);
