/**
 * 前后对比截图（固定存档、固定时刻）：node tools/ui-compare.ts --out <目录> [--view phonep,desktop]
 * 基地、登陆战（开场 / 选中兵种卡 / 登陆后技能充能）、守岛（开场 / 瞄准火药桶 / 火药桶冷却中），
 * 手机竖屏、手机横屏、1280×720、1920×1080 四种尺寸各一套；改皮肤、镜头前后各跑一次，对着看。用 ?dev 给资源，不写存档。
 * 基地手感另拍：悬停名牌和右键菜单（电脑）、升级面板、升级演出连拍（0/200/500/900/1300/1800ms，停下帧循环按 60 帧推）、摆放能放 / 不能放。
 * --rec-up：1280×720 再录两段 60 帧的升级演出（金矿、主寨）webm 和抽帧拼图。
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';
import { recordFixed } from './record.ts';
import { createServer } from 'vite';

const argv = process.argv.slice(2);
const opt = (n: string): string | null => {
  const i = argv.indexOf(n);
  return i >= 0 ? (argv[i + 1] ?? null) : null;
};
const OUT = opt('--out') ?? join(tmpdir(), 'haidao-ui-compare');
const ONLY = opt('--view')?.split(',') ?? ['phonep', 'phonel', 'pc720', 'pc1080'];
const REC_UP = argv.includes('--rec-up');
mkdirSync(OUT, { recursive: true });
const VIEWS = [
  { name: 'phonep', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'phonel', viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'pc720', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  { name: 'pc1080', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];
type H = Record<string, (...a: unknown[]) => unknown> & { dev: { give(g: number, w: number, s: number): void; td(hq: number): void }; ready?: boolean; scene?: string };

const server = await createServer({ logLevel: 'warn', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
await server.listen();
const addr = server.httpServer?.address();
if (!addr || typeof addr === 'string') throw new Error('vite 没有监听端口');
const ROOT = `http://127.0.0.1:${addr.port}/`;
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--no-proxy-server', '--no-zygote', '--in-process-gpu'] });
const problems: string[] = [];
try {
  for (const v of VIEWS) {
    if (!ONLY.includes(v.name)) continue;
    const ctx = await browser.newContext(v);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' && !/GL Driver Message/.test(m.text())) problems.push(`${v.name} 控制台报错：${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`${v.name} 未捕获异常：${e.message}`));
    const ready = (): Promise<unknown> => page.waitForFunction(() => (window as unknown as { __haidao?: { ready?: boolean } }).__haidao?.ready === true, null, { timeout: 90_000 });
    const sceneIs = (s: string): Promise<unknown> => page.waitForFunction((w) => (window as unknown as { __haidao?: { scene?: string } }).__haidao?.scene === w, s, { timeout: 60_000 });
    const call = <T>(f: string, ...a: unknown[]): Promise<T> => page.evaluate(([fn, args]) => ((window as unknown as { __haidao: H }).__haidao[fn as string] as (...x: unknown[]) => unknown)(...(args as unknown[])), [f, a]) as Promise<T>;
    const shot = (name: string): Promise<unknown> => page.screenshot({ path: join(OUT, `${v.name}-${name}.png`) });
    const tap = async (x: number, y: number): Promise<void> => (v.hasTouch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
    const run = async (name: string, f: () => Promise<void>): Promise<void> => {
      try { await f(); } catch (e) { problems.push(`${v.name} ${name}：${(e as Error).message.split('\n')[0]}`); await shot(`FAIL-${name}`).catch(() => {}); }
    };

    await run('基地', async () => {
      await page.goto(`${ROOT}?dev`, { timeout: 60_000 });
      await ready();
      await page.evaluate(() => (window as unknown as { __haidao: H }).__haidao.dev.give(600, 400, 0));
      await page.waitForTimeout(1500);
      await shot('1-base');
      // 三颗星：主寨升得起（底栏「建造」上亮红点）；点主寨 / 靠边的伐木场弹出操作环；放大后出现「全景」钮；个人面板
      await page.evaluate(() => (window as unknown as { __haidao: H }).__haidao.dev.give(900, 600, 3));
      await page.waitForTimeout(1500);
      await shot('1b-base-dots');
      const hq = await call<{ x: number; y: number } | null>('where', 'hq');
      if (hq) { await tap(hq.x, hq.y); await page.waitForTimeout(500); await shot('1c-base-ring-hq'); }
      const sm = await call<{ x: number; y: number } | null>('where', 'sawmill');
      if (sm) { await tap(sm.x, sm.y); await page.waitForTimeout(500); await shot('1d-base-ring-edge'); }
      await page.mouse.move(v.viewport.width / 2, v.viewport.height / 2);
      await page.mouse.wheel(0, -900);
      await page.waitForTimeout(700);
      await shot('1e-base-zoomed');
      if (await page.locator('.hd-fitbtn.on').count()) await page.locator('.hd-fitbtn.on').click();
      await page.waitForTimeout(400);
      if (await page.locator('.hd-profile').count()) {
        await page.locator('.hd-profile').click();
        await page.waitForTimeout(400);
        await shot('1f-base-profile');
      }
    });
    await run('基地手感', async () => {
      await page.goto(`${ROOT}?dev`, { timeout: 60_000 });
      await ready();
      // 主寨 4 级的示范岛（关掉新手引导；岛上建筑都和主寨同级），资源和星星给够
      await page.evaluate(() => (window as unknown as { __haidao: H }).__haidao.dev.td(4));
      await page.evaluate(() => (window as unknown as { __haidao: H }).__haidao.dev.give(400000, 400000, 60));
      await page.waitForTimeout(1500);
      const at = (k: string): Promise<{ x: number; y: number } | null> => call<{ x: number; y: number } | null>('where', k);
      /** 场景里不许有缺图（__MISSING）：示范岛里有开局没烘的外观（宝藏箱、高等级），要等补烘完 */
      const noMissing = async (when: string): Promise<void> => {
        const m = await call<string[]>('missing');
        if (m.length) problems.push(`${v.name} ${when}有缺图：${m.join('、')}`);
      };
      await page.waitForTimeout(1500);
      await noMissing('示范岛开场');
      /** 选中一座建筑（手机点一下弹操作环，电脑左键开面板），再 Esc 收起，快捷键 U 就作用在它上面 */

      const dismiss = async (): Promise<void> => {
        const go = page.locator('.hd-mask button:has-text("去看看")');
        await go.waitFor({ timeout: 20_000 });
        await page.waitForTimeout(600);
        await go.click();
        await page.waitForTimeout(900);
        for (let i = 0; i < 4 && (await page.locator('.hd-badge button').count()); i++) {
          await page.locator('.hd-badge button').first().click();
          await page.waitForTimeout(500);
        }
      };
      /** 镜头对准放大并选中（focusOn；点建筑会点到挡在前面的塔），按 U，然后停下帧循环：要么连拍几个时刻，要么录 60 帧视频 */
      const upgradeShow = async (k: string, zoom: number, shots: number[] | null, rec: string | null): Promise<void> => {
        if (!(await call<boolean>('focusOn', k, zoom))) throw new Error(`找不到${k}`);
        if (!v.hasTouch) await page.mouse.move(2, 2);
        await page.waitForTimeout(800);
        await page.keyboard.press('u');
        if (rec) {
          const frames = await recordFixed(page, OUT, rec, k === 'hq' ? 132 : 118, { w: 0.62, h: 0.86, up: 0.04 });
          console.log(`录了 ${rec}.webm：${frames} 帧`);
          return;
        }
        let t = 0;
        for (const ms of shots ?? []) {
          const n = Math.max(1, Math.round((ms - t) / (1000 / 60)));
          await call('frameStep', n, 1000 / 60);
          t += n * (1000 / 60);
          await shot(`1j-base-upfx-${k}-${String(ms).padStart(4, '0')}ms`);
        }
        await call('frameStep', 150, 1000 / 60);
        await call('frameEnd');
      };
      // 1) 电脑：悬停名牌、右键菜单（金矿和主寨同级，升级项灰着写原因）
      const gm = await at('goldmine');
      if (!gm) throw new Error('找不到金矿');
      if (!v.hasTouch) {
        await page.mouse.move(gm.x, gm.y);
        await page.waitForTimeout(600);
        await shot('1g-base-hover-plate');
        await page.mouse.click(gm.x, gm.y, { button: 'right' });
        await page.waitForTimeout(500);
        await shot('1h-base-ctxmenu');
        await page.keyboard.press('Escape');
      }
      // 2) 主寨升级（更大的庆祝，之后解锁弹窗）：电脑 1280×720 录视频，其余连拍
      await upgradeShow('hq', 1.7, [0, 300, 700, 1000, 1400, 2000], REC_UP && v.name === 'pc720' ? 'upgrade-hq' : null);
      await dismiss();
      // 3) 升级面板：金矿 4 → 5（当前 → 下一级、增量、花费、大按钮）
      await call('home');
      await page.waitForTimeout(400);
      const gm2 = await at('goldmine');
      if (!gm2) throw new Error('找不到金矿');
      if (v.hasTouch) {
        await tap(gm2.x, gm2.y);
        await page.waitForTimeout(500);
        await page.locator('.hd-rmenu [data-ring=info]').click();
      } else await page.mouse.click(gm2.x, gm2.y);
      await page.waitForTimeout(600);
      await shot('1i-base-upgrade-panel');
      if (!v.hasTouch) {
        await page.mouse.click(gm2.x, gm2.y, { button: 'right' });
        await page.waitForTimeout(500);
        await shot('1h2-base-ctxmenu-can');
      }
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      // 4) 普通建筑的升级演出连拍（金矿），电脑另录一段视频（伐木场）
      await upgradeShow('goldmine', 2.3, [0, 200, 500, 900, 1300, 1800], null);
      if (REC_UP && v.name === 'pc720') await upgradeShow('sawmill', 2.3, null, 'upgrade-sawmill');
      await page.waitForTimeout(1200);
      // 5) 摆放：能放（绿）/ 不能放（红，写原因）
      await call('home');
      await page.waitForTimeout(500);
      await page.locator('.hd-bottom button:has-text("建造")').click();
      await page.waitForTimeout(400);
      const card = page.locator('.hd-card:not(.off)').first();
      if (v.hasTouch) await card.tap();
      else await card.click();
      await page.waitForTimeout(600);
      const g = await at('ghost');
      if (g && !v.hasTouch) await page.mouse.move(g.x, g.y);
      await page.waitForTimeout(400);
      await shot('1k-base-place-ok');
      const hq = await at('hq');
      if (hq) {
        if (v.hasTouch) await tap(hq.x, hq.y);
        else await page.mouse.move(hq.x, hq.y);
      }
      await page.waitForTimeout(500);
      await shot('1l-base-place-bad');
      await page.keyboard.press('Escape');
      await noMissing('升级和摆放之后');
    });
    await run('登陆战', async () => {
      await page.goto(`${ROOT}?battle=c04&dev`, { timeout: 60_000 });
      await ready();
      await page.waitForSelector('.hd-boat', { timeout: 30_000 });
      await page.waitForTimeout(2500);
      await shot('2-battle');
      await page.locator('.hd-boat').first().click();
      await page.waitForTimeout(500);
      await shot('3-battle-boat-selected');
      const bp = await call<{ x: number; y: number } | null>('beach', 0);
      if (bp) await tap(bp.x, bp.y);
      await page.waitForTimeout(5000);
      await shot('4-battle-landed');
      // 放一发炮击：能量不够再放，技能钮进入“充能中”
      await page.locator('.hd-skill').first().click();
      const hq = await call<{ x: number; y: number } | null>('where', 'hq');
      if (hq) await tap(hq.x, hq.y);
      await page.waitForTimeout(1200);
      await shot('4b-battle-skill-used');
    });
    await run('守岛', async () => {
      await page.goto(`${ROOT}?dev`, { timeout: 60_000 });
      await ready();
      await page.evaluate(() => (window as unknown as { __haidao: H }).__haidao.dev.td(3));
      await page.waitForTimeout(900);
      await page.locator('.hd-bottom button:has-text("守岛")').first().click();
      await page.waitForTimeout(500);
      await page.locator('.hd-tdtab[data-chapter="1"]').first().click();
      await page.waitForTimeout(300);
      await page.locator('.hd-tdcard button[data-level="td01"]').first().click();
      // 带驻守台的关先弹选塔面板：按默认挑法开打
      await page.locator('.hd-tdgar-go').first().click({ timeout: 3000 }).catch(() => undefined);
      await sceneIs('td');
      await page.waitForTimeout(1800);
      await shot('5-td');
      await page.locator('.hd-td-skill').nth(0).click();
      await page.waitForTimeout(400);
      await shot('6-td-keg-aim');
      const inf = await call<{ hero: { x: number; y: number } }>('tdInfo');
      const p = await call<{ x: number; y: number }>('tdPt', inf.hero.x + 1, inf.hero.y - 1);
      await tap(p.x, p.y);
      await page.waitForTimeout(1500);
      await shot('7-td-cooldown');
    });
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(`截图在 ${OUT}`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('控制台零报错');
