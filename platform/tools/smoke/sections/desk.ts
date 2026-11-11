/** 冒烟分段：deskPages（npm run smoke -- --only=<段名>，段名表在 tools/smoke.ts） */
import type { Browser, Page } from 'playwright-core';
import { BASE, shot, newPage, json } from '../lib/core.ts';
import { savesRow } from './me-tabs.ts';
import { FAKE_USER, mockSession, FAKE_FRIENDS, FAKE_FEED, fakeFeedFiles } from '../lib/fakes.ts';
import { deskLayout, lobbyNoGap } from '../lib/ui.ts';

/** 电脑版排版：大厅、好友、我的、我的战绩在 1280、1920 宽各一张（不是窄长列、不横着滑），手机竖屏各一张 */
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
    for (const [name, path, ready] of pages) {
      await page.goto(`${BASE}${path}`);
      await ready(page);
      if (screen === 'desktop') await deskLayout(page, name);
      else {
        if (name === 'home') await lobbyNoGap(page, '大厅 手机竖屏');
        await shot(page, `${name}-phone`);
      }
    }
    await ctx.close();
  }
}
