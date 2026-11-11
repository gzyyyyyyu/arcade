/**
 * 开局加载（素材烘焙）耗时：node tools/bake-time.ts [--runs 3] [--throttle 4]（1 = 不降速）
 * 手机竖屏 390×844 @2x，CDP 降 CPU（默认 4 倍；本机无 GPU 时降速会连软渲染一起拖慢，烘焙要等 10 分钟以上，请用 --throttle 1），从加载层出现到消失的毫秒数（烘焙全部素材 + 补烘基地建筑；模块下载不算）；
 * 每次开新的浏览器上下文（没有缓存的存档、纹理）。绝对值偏高（无 GPU），只看前后对比。
 */
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const argv = process.argv.slice(2);
const opt = (n: string, d: string): string => {
  const i = argv.indexOf(n);
  return i >= 0 ? (argv[i + 1] ?? d) : d;
};
const RUNS = Number(opt('--runs', '3'));
const THROTTLE = Number(opt('--throttle', '1'));

const server = await createServer({ logLevel: 'warn', server: { host: '127.0.0.1', port: 0, hmr: false } });
await server.listen();
const addr = server.httpServer?.address();
if (!addr || typeof addr === 'string') throw new Error('vite 没有监听端口');
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--no-proxy-server', '--no-zygote', '--in-process-gpu'] });
const out: number[] = [];
for (let i = 0; i < RUNS; i++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  // 先不降速，等页面脚本和模块都下完、加载层出现；降速只对烘焙这一段生效
  await page.goto(`http://127.0.0.1:${addr.port}/`, { timeout: 120_000, waitUntil: 'commit' });
  await page.waitForSelector('#boot', { timeout: 120_000 });
  if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  const t0 = Date.now();
  await page.waitForSelector('#boot', { state: 'detached', timeout: 600_000 });
  out.push(Date.now() - t0);
  await ctx.close();
}
console.log(`加载耗时（毫秒，降速 ${THROTTLE} 倍）：${out.join(' / ')}  中位 ${[...out].sort((a, b) => a - b)[Math.floor(out.length / 2)]}`);
await browser.close();
await server.close();
