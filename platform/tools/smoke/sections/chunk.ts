/** 冒烟分段：staleChunk（npm run smoke -- --only=<段名>，段名表在 tools/smoke.ts） */
import type { Browser } from 'playwright-core';
import { BASE, check, expectHttp, shot, newPage } from '../lib/core.ts';
import { mockSession } from '../lib/fakes.ts';

/** 发版后旧分块没了（404）：整页重载一次拿新版；还是 404 就停下来提示刷新，不来回重载、不白屏。 */
export async function staleChunk(browser: Browser): Promise<void> {
  console.log('发版后点进钱包页，分块 404：重载一次，还不行就提示刷新；好了以后点"刷新"能进');
  const { ctx, page } = await newPage(browser, '分块 404');
  await mockSession(page);
  await page.goto(`${BASE}/`);
  await page.getByTestId('wallet-badge').waitFor();
  let missing = 0;
  await page.route('**/assets/Wallet-*.js', (r) => {
    missing++;
    expectHttp(404, new URL(r.request().url()).pathname);
    return r.fulfill({ status: 404, body: '' });
  });
  await page.evaluate(() => ((window as unknown as { beforeDeploy: boolean }).beforeDeploy = true));
  await page.getByTestId('wallet-badge').click();
  await page.getByTestId('page-load-failed').waitFor();
  check(new URL(page.url()).pathname === '/wallet', `应该停在 /wallet，实际 ${page.url()}`);
  check(!(await page.evaluate(() => (window as unknown as { beforeDeploy?: boolean }).beforeDeploy)), '分块 404 后没有整页重载');
  check(missing === 2, `分块应该请求 2 次（第一次 + 重载后一次），实际 ${missing}`);
  await shot(page, 'stale-chunk');
  await page.unroute('**/assets/Wallet-*.js');
  await page.getByTestId('page-load-failed').getByRole('button', { name: '刷新' }).click();
  await page.getByTestId('wallet-balance').waitFor();
  await ctx.close();
}
