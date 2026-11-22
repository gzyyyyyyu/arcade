/**
 * 截图看画面（本地自查用）：起一个 vite 开发服务器（系统分配端口），无头浏览器打开单机，按几个时刻截图到 shots/。
 * 用法：node scripts/capture.ts [land|desk|pc1280|pc1920|port|port360|land844|se-land|se-port] [步数] [输出目录，默认 shots/]。控制台的报错打印出来。
 * pc1280、pc1920：电脑浏览器全屏的 16:10（1280×800）和 16:9（1920×1080）。
 * desk：1920 宽的电脑浏览器去掉标签栏、地址栏后看得见的区域（约 1920×911）。
 * port360、land844：360×780 竖屏、844×390 横屏，按手机模拟（触屏、2 倍）。
 * se-*：iPhone SE（375×667）Safari 工具栏都展开时看得见的区域（横屏约 667×330、竖屏约 375×553），按手机模拟（触屏、2 倍）。
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const SIZES = {
  land: { width: 1280, height: 720 },
  desk: { width: 1920, height: 911 },
  pc1280: { width: 1280, height: 800 },
  pc1920: { width: 1920, height: 1080 },
  port: { width: 390, height: 844 },
  port360: { width: 360, height: 780 },
  land844: { width: 844, height: 390 },
  'se-land': { width: 667, height: 330 },
  'se-port': { width: 375, height: 553 },
} as const;
const orient = (process.argv[2] ?? 'land') in SIZES ? ((process.argv[2] ?? 'land') as keyof typeof SIZES) : 'land';
const phone = orient.startsWith('se-') || orient === 'port360' || orient === 'land844';
const steps = Number(process.argv[3] ?? 6);
const root = new URL('..', import.meta.url).pathname;
const shotDir = process.argv[4] ? process.argv[4].replace(/\/?$/, '/') : `${root}shots/`;
mkdirSync(shotDir, { recursive: true });

const server = await createServer({ root, server: { port: 0, host: '127.0.0.1', strictPort: false }, logLevel: 'error' });
await server.listen();
const port = (server.httpServer!.address() as { port: number }).port;
const browser = await chromium.launch({ args: ['--no-zygote', '--disable-gpu'] });
const page = await browser.newPage({ viewport: SIZES[orient], deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone });
const errors: string[] = [];
page.on('console', (m) => m.type() === 'error' && !m.text().includes('/api/') && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript(() => {
  localStorage.setItem('mahjong.guide', '1');
  localStorage.setItem('mahjong.prefs', JSON.stringify({ fast: true }));
});
await page.goto(`http://127.0.0.1:${port}/games/mahjong/`);
await page.waitForSelector('.home-main');
await page.screenshot({ path: `${shotDir}${orient}-0-lobby.png` });
await page.click('.act.quick');
for (let i = 1; i <= steps; i++) {
  await page.waitForTimeout(1200);
  // 换三张：帮我选 + 换出；定缺：点推荐的；轮到打牌：点两下最右边那张能打的
  if (await page.$('text=帮我选')) {
    await page.click('text=帮我选');
    await page.click('button:has-text("换出")');
  } else if (await page.$('.act.que.best')) await page.click('.act.que.best');
  else if (await page.$('.act.ron')) await page.click('.act.ron');
  else if (await page.$('.act.pass')) await page.click('.act.pass');
  else {
    const tiles = await page.$$('.my-hand .tile:not(.off)');
    const t = tiles.at(-1);
    if (t) {
      await t.click();
      await t.click().catch(() => {});
    }
  }
  if (await page.$('text=下一局')) {
    await page.screenshot({ path: `${shotDir}${orient}-${i}-end.png` });
    await page.click('text=下一局');
  }
  if (await page.$('text=再来一场')) {
    await page.screenshot({ path: `${shotDir}${orient}-${i}-over.png` });
    break;
  }
  await page.screenshot({ path: `${shotDir}${orient}-${i}.png` });
  for (const o of await overlaps()) console.log(`${i}: 压住了 ${o}`);
  console.log(`${i}: 点按尺寸 ${await tapSizes()}`);
}
/** 操作条每个按钮、互动和聊天圆钮在屏幕上的宽×高，操作条下沿到手牌上沿的空档，牌河和手牌一张牌的宽（CSS 像素） */
async function tapSizes(): Promise<string> {
  return page.evaluate(() => {
    const sz = (e: Element): string => {
      const r = e.getBoundingClientRect();
      return `${Math.round(r.width)}x${Math.round(r.height)}`;
    };
    const bar = [...document.querySelectorAll('.bar > button')].map((e) => `${e.textContent?.trim().slice(0, 3)} ${sz(e)}`);
    const fun = [...document.querySelectorAll('.atf-btn')].map(sz);
    const b = document.querySelector('.bar')?.getBoundingClientRect();
    const h = document.querySelector('.my-hand')?.getBoundingClientRect();
    const w = (sel: string): string => {
      const t = document.querySelector(sel)?.getBoundingClientRect();
      return t ? t.width.toFixed(1) : '-';
    };
    return `条[${bar.join(', ')}] 圆钮[${fun.join(', ')}] 条到手牌 ${b && h ? Math.round(h.top - b.bottom) : '-'} 牌宽 河${w('.river .tile')} 手${w('.my-hand .tile')}`;
  });
}
/** 牌桌上不同部分（各家的牌河、副露、手牌、头像、中间、操作条、互动气泡）有没有互相压住：按每张牌、每个按钮的框算 */
async function overlaps(): Promise<string[]> {
  return page.evaluate(() => {
    const parts = ['.center', '.bar > *', '.my-hand .tile', '.atf-btn', '.atf-bubble'];
    for (let r = 0; r < 4; r++) parts.push(`.river.r${r} .tile`, `.melds.r${r} .tile`, `.badge.r${r}`, `.opp-hand.r${r} > *`);
    const boxes = parts.map((sel) => [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0));
    const out: string[] = [];
    for (let a = 0; a < parts.length; a++)
      for (let b = a + 1; b < parts.length; b++) {
        const hit = boxes[a]!.some((x) => boxes[b]!.some((y) => x.left < y.right - 2 && y.left < x.right - 2 && x.top < y.bottom - 2 && y.top < x.bottom - 2));
        if (hit) out.push(`${parts[a]} × ${parts[b]}`);
      }
    return out;
  });
}

console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'no console errors');
await browser.close();
await server.close();
