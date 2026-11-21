/** 冒烟分段：deskPages（npm run smoke -- --only=<段名>，段名表在 tools/smoke.ts） */
import type { Browser, Page } from 'playwright-core';
import { BASE, check, shot, newPage, json } from '../lib/core.ts';
import { savesRow } from './me-tabs.ts';
import { FAKE_USER, mockSession, FAKE_FRIENDS, FAKE_FEED, fakeFeedFiles } from '../lib/fakes.ts';
import { deskLayout, lobbyNoGap } from '../lib/ui.ts';

/** 顶栏每一项的名字和位置（取整到像素）：换页时要一模一样（所有页面同一个顶栏，不按页面藏项、不挪位置）。
 *  导航只在顶栏一处：顶栏外不许再有指向顶栏同一页面的导航链接（以前宽屏子页左边有一列重复的侧栏） */
async function topbarLayout(page: Page): Promise<string> {
  // 筹码数字第一次读到时会滚动一下，等它停
  await page.waitForTimeout(1_000);
  const dup = await page.evaluate(() => {
    const hrefs = new Set([...document.querySelectorAll('.topbar a[href]')].map((a) => a.getAttribute('href')));
    return [...document.querySelectorAll('nav a[href]')].filter((a) => !a.closest('.topbar') && hrefs.has(a.getAttribute('href'))).map((a) => a.getAttribute('href'));
  });
  check(dup.length === 0, `${page.url()}：顶栏外还有重复的导航入口 ${dup.join(' ')}`);
  return page.locator('.topbar').evaluate((bar) =>
    [...bar.children]
      .filter((el) => getComputedStyle(el).display !== 'none')
      .map((el) => {
        const r = el.getBoundingClientRect();
        return `${el.getAttribute('href') ?? el.className}@${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}x${Math.round(r.height)}`;
      })
      .join(' '),
  );
}

/** 电脑版排版：大厅、好友、我的、我的战绩在 1280、1920 宽各一张（不是窄长列、不横着滑），手机竖屏各一张；顺带比各页顶栏一样 */
export async function deskPages(browser: Browser): Promise<void> {
  const career = (o: Record<string, unknown>) => ({ n: 3, net: 2_000, wnet: 0, rounds: 0, wins: 0, best: 0, titles: [], max: {}, sum: {}, ...o });
  const games = {
    kaipan: career({ n: 2, wnet: 12_000, rounds: 2, wins: 1, best: 12_000, titles: [{ id: 'first_year', at: Date.UTC(2026, 9, 13, 3) }] }),
    guandan: career({ n: 6, wnet: -800, rounds: 40, wins: 22, best: 3_200 }),
    texas: career({ n: 4, wnet: -1_500, rounds: 1_000, wins: 213, best: 18_400 }),
    mahjong: career({ n: 3, rounds: 25, wins: 6, best: 1_200 }),
  };
  const pages = [
    ['home', '/', async (page: Page) => void (await page.locator('.card').first().waitFor())],
    ['friends', '/friends', async (page: Page) => void (await page.getByText('名字有十二个字那么长的人').first().waitFor())],
    ['me', '/me', async (page: Page) => void (await (await savesRow(page, 'kaipan')).getByText('还没有存档').waitFor())],
    ['stats', '/me/stats', async (page: Page) => void (await page.getByTestId('player-card').waitFor())],
    ['boards', '/boards', async (page: Page) => void (await page.getByTestId('board-body').waitFor())],
    ['wallet', '/wallet', async (page: Page) => void (await page.getByTestId('wallet-badge').waitFor())],
    ['feed', '/feed', async (page: Page) => void (await page.locator('main .panel').first().waitFor())],
  ] as const;
  for (const screen of ['desktop', 'portrait'] as const) {
    console.log(`电脑版排版（${screen}）：大厅、好友、我的、战绩`);
    const { ctx, page } = await newPage(browser, `电脑排版 ${screen}`, screen);
    await mockSession(page, { feed: FAKE_FEED });
    await fakeFeedFiles(page);
    await page.route('**/api/friends', (r) => r.fulfill(json(FAKE_FRIENDS)));
    await page.route('**/api/blocks', (r) => r.fulfill(json({ blocks: [] })));
    await page.route('**/api/saves/*', (r) => r.fulfill(json({ saves: [] })));
    await page.route('**/api/stats/me', (r) => r.fulfill(json({ user: { userId: FAKE_USER.id, displayName: FAKE_USER.displayName, avatar: null }, relation: 'self', week: '2026-10-12', games })));
    await page.route('**/games/*/titles.json', (r) => r.fulfill(json({ first_year: { name: '熬过一年', desc: '实盘打满 12 个月' } })));
    let homeBar = '';
    for (const [name, path, ready] of pages) {
      await page.goto(`${BASE}${path}`);
      await ready(page);
      const bar = await topbarLayout(page);
      if (name === 'home') homeBar = bar;
      else check(bar === homeBar, `${screen}：${path} 的顶栏和大厅不一样（换页会跳）\n  大厅 ${homeBar}\n  这页 ${bar}`);
      if (name === 'boards' || name === 'wallet' || name === 'feed') {
        // 这几页只为比顶栏，排版各有自己的段
        if (name === 'boards') await shot(page, `boards-${screen}`);
        continue;
      }
      if (screen === 'desktop') await deskLayout(page, name);
      else {
        if (name === 'home') await lobbyNoGap(page, '大厅 手机竖屏');
        await shot(page, `${name}-phone`);
      }
    }
    await ctx.close();
  }
}
