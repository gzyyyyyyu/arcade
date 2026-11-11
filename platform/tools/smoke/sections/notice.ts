/** 冒烟分段：lobbyNotice（npm run smoke -- --only=<段名>，段名表在 tools/smoke.ts） */
import type { Browser } from 'playwright-core';
import { BASE, check, shot, newPage, json } from '../lib/core.ts';
import { FAKE_WALLET, mockSession, fakeAdmin } from '../lib/fakes.ts';

/** 管理页发大厅公告，大厅顶上显示（只给登录了的人）。 */
export async function lobbyNotice(browser: Browser): Promise<void> {
  console.log('管理页发大厅公告，大厅里看到');
  const text = '今晚 9 点掼蛋好友局，来凑一桌！德州新加了表情，欢迎来试试，有问题直接找阿国。';
  const at = Date.UTC(2026, 9, 15, 13);
  {
    const { ctx, page } = await newPage(browser, '发公告');
    await fakeAdmin(page);
    let sent: unknown = null;
    await page.route('**/api/admin/settings/notice', (r) => {
      if (r.request().method() === 'GET') return r.fulfill(json({ notice: null, max: 120 }));
      sent = r.request().postDataJSON();
      return r.fulfill(json({ notice: { text, at, by: 'owner' }, max: 120 }));
    });
    await page.goto(`${BASE}/admin?s=settings`);
    const form = page.getByTestId('notice-admin');
    await form.getByText('现在没有公告').waitFor();
    await form.getByLabel('公告内容').fill('字'.repeat(121));
    await form.getByText('太长了，最多 120 个字（现在 121）').waitFor();
    check(await form.getByRole('button', { name: '发布' }).isDisabled(), '太长了还能点发布');
    await form.getByLabel('公告内容').fill(text);
    await form.getByRole('button', { name: '发布' }).click();
    await form.getByText('现在挂着：owner').waitFor();
    await form.getByRole('button', { name: '撤下公告' }).waitFor();
    check(JSON.stringify(sent) === JSON.stringify({ text }), `发的不对：${JSON.stringify(sent)}`);
    await shot(page, 'admin-notice');
    await ctx.close();
  }
  // 首屏最多一条提示：桌上有筹码时也只显示公告
  const { ctx, page } = await newPage(browser, '大厅公告', 'portrait');
  const stake = { game: 'texas', ref: 'room-123456', tier: 'small', amount: 1_000, mode: 'server', at, until: at + 8 * 3600_000 };
  await mockSession(page, { me: { notice: { text, at } }, wallet: { ...FAKE_WALLET, wallet: { ...FAKE_WALLET.wallet, stakes: [stake] }, ledger: [] } });
  await page.goto(`${BASE}/`);
  await page.getByTestId('notice').getByText(text).waitFor();
  await page.waitForLoadState('networkidle');
  check((await page.getByTestId('nudges').count()) === 0, '有公告时不该再显示桌上筹码的提示');
  await shot(page, 'lobby-notice');
  await ctx.close();
}
