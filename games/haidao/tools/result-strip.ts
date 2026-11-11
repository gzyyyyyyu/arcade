/**
 * 结算演出连拍拼图：node tools/result-strip.ts [--out <目录>] [--name <文件名前缀>] [--level <关卡id>]
 * 打开 ?battle=<关>&auto&fast，机器人打完后在结算框出现的头 ~3 秒里连拍，按拍摄时刻（毫秒）排成一张拼图（手机竖屏 + 电脑各一张）。
 * 帧间隔取决于截图耗时（SwiftShader 下约 150–250ms），所以时刻只是大致的；对比前后两版看演出的先后顺序。
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { createServer } from 'vite';
import { CAMPAIGN } from '../src/core/index.ts';

const argv = process.argv.slice(2);
const opt = (n: string): string | null => {
  const i = argv.indexOf(n);
  return i >= 0 ? (argv[i + 1] ?? null) : null;
};
const OUT = opt('--out') ?? join(tmpdir(), 'haidao-strip');
const NAME = opt('--name') ?? 'strip';
const LEVEL = opt('--level') ?? CAMPAIGN[0]?.id ?? '';
mkdirSync(OUT, { recursive: true });

const VIEWS = [
  { name: 'phonep', viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, tile: 190 },
  { name: 'desktop', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, tile: 380 },
];

const server = await createServer({ logLevel: 'warn', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
await server.listen();
const addr = server.httpServer?.address();
if (!addr || typeof addr === 'string') throw new Error('vite 没有监听端口');
const ROOT = `http://127.0.0.1:${addr.port}/`;
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--no-proxy-server', '--no-zygote', '--in-process-gpu'] });
try {
  for (const v of VIEWS) {
    const ctx = await browser.newContext(v);
    const page = await ctx.newPage();
    const errs: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/GL Driver Message/.test(m.text())) errs.push(m.text()); });
    await page.goto(`${ROOT}?battle=${LEVEL}&auto&fast`, { timeout: 60_000 });
    await page.waitForFunction(() => (window as unknown as { __haidao?: { ready?: boolean } }).__haidao?.ready === true, null, { timeout: 60_000 });
    await page.waitForSelector('.hd-result', { timeout: 120_000, state: 'attached' });
    const t0 = Date.now();
    const frames: Array<{ ms: number; buf: Buffer }> = [];
    while (Date.now() - t0 < 3600 && frames.length < 14) {
      const ms = Date.now() - t0;
      frames.push({ ms, buf: await page.screenshot() });
    }
    const tiles = await Promise.all(frames.map(async (f) => {
      const h = Math.round((v.tile * v.viewport.height) / v.viewport.width);
      const img = await sharp(f.buf).resize(v.tile, h).png().toBuffer();
      const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${v.tile}" height="22"><rect width="100%" height="100%" fill="#000"/><text x="6" y="16" font-size="14" fill="#fff" font-family="sans-serif">${f.ms} ms</text></svg>`);
      return sharp({ create: { width: v.tile, height: h + 22, channels: 3, background: '#000' } })
        .composite([{ input: label, top: 0, left: 0 }, { input: img, top: 22, left: 0 }]).png().toBuffer();
    }));
    const cols = v.name === 'phonep' ? 7 : 4;
    const rows = Math.ceil(tiles.length / cols);
    const th = Math.round((v.tile * v.viewport.height) / v.viewport.width) + 22;
    await sharp({ create: { width: cols * v.tile, height: rows * th, channels: 3, background: '#222' } })
      .composite(tiles.map((input, i) => ({ input, left: (i % cols) * v.tile, top: Math.floor(i / cols) * th })))
      .png().toFile(join(OUT, `${NAME}-${v.name}.png`));
    console.log(`${v.name}：${frames.length} 帧，报错 ${errs.length}${errs.length ? `：${errs.join(' | ')}` : ''}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(`拼图在 ${OUT}`);
