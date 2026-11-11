/** 冒烟分段：friendsUx（npm run smoke -- --only=<段名>，段名表在 tools/smoke.ts） */
import type { Browser, Page } from 'playwright-core';
import { BASE, check, shot, newPage, json } from '../lib/core.ts';
import { FAKE_USER, mockSession } from '../lib/fakes.ts';

/** 一屏放下以后窄屏的"好友码"在页签里（宽屏两栏并排，没有页签）：有页签就点一下 */
async function openCodeTab(page: Page): Promise<void> {
  const tab = page.getByTestId('ptab-code');
  await page.getByTestId('person-小明').waitFor();
  if (await tab.count()) await tab.click();
}

/** 好友更好用。好友页的大分享按钮（手机走系统分享，电脑复制）、点好友名字看战绩、战绩页上加好友。 */
export async function friendsUx(browser: Browser): Promise<void> {
  const id = (c: string) => c.repeat(22);
  const lists = { friends: [{ userId: id('F'), displayName: '小明', avatar: null, lastSeenDaysAgo: 0 }], incoming: [], outgoing: [] };
  const stub = async (page: Page) => {
    await mockSession(page);
    await page.route('**/api/friends', (r) => r.fulfill(json(lists)));
    await page.route('**/api/blocks', (r) => r.fulfill(json({ blocks: [] })));
    await page.route(`**/api/stats/${id('F')}`, (r) => r.fulfill(json({ user: { userId: id('F'), displayName: '小明', avatar: null }, relation: 'friends', week: '2026-10-12', games: {} })));
    await page.route(`**/api/stats/${id('S')}`, (r) => r.fulfill(json({ user: { userId: id('S'), displayName: '排行榜上的人', avatar: null }, relation: 'none', week: '2026-10-12', games: {} })));
  };

  console.log('电脑：没有系统分享，大按钮直接复制好友链接；点好友名字进战绩页');
  {
    const { ctx, page } = await newPage(browser, '好友分享 电脑');
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    await stub(page);
    await page.goto(`${BASE}/friends`);
    await openCodeTab(page);
    await page.getByTestId('share-link').getByText('复制我的好友链接').click();
    await page.getByTestId('share-link').getByText('已复制，发给朋友吧').waitFor();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    check(copied.endsWith(`/f/${FAKE_USER.friendCode}`), `复制的不是好友链接：${copied}`);
    await page.getByRole('link', { name: '小明' }).click();
    await page.getByRole('heading', { name: '小明 的战绩' }).waitFor();
    await page.getByText('你们是好友。').waitFor();
    await ctx.close();
  }

  console.log('手机：大按钮叫"分享给朋友"，走系统分享面板；战绩页上给不是好友的人加好友');
  {
    const { ctx, page } = await newPage(browser, '好友分享 手机', 'portrait');
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', {
        value: async (d: ShareData) => {
          (window as unknown as { shared: ShareData }).shared = d;
        },
      });
    });
    await stub(page);
    let sent: unknown = null;
    await page.route('**/api/friends/requests', (r) => {
      sent = r.request().postDataJSON();
      return r.fulfill(json({ status: 'pending' }));
    });
    await page.goto(`${BASE}/friends`);
    await openCodeTab(page);
    await page.getByTestId('share-link').getByText('分享给朋友').click();
    const shared = await page.waitForFunction(() => (window as unknown as { shared?: ShareData }).shared?.url ?? null);
    check(String(await shared.jsonValue()).endsWith(`/f/${FAKE_USER.friendCode}`), '分享出去的不是好友链接');
    await shot(page, 'friends-share-portrait');
    await page.goto(`${BASE}/u/${id('S')}`);
    await page.getByTestId('add-friend').click();
    await page.getByTestId('friend-pending').waitFor();
    check(JSON.stringify(sent) === JSON.stringify({ userId: id('S') }), `加好友发的不对：${JSON.stringify(sent)}`);
    await shot(page, 'stats-add-friend-portrait');
    await ctx.close();
  }
}
