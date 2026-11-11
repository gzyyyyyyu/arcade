/** 冒烟分段：lobbyNudge（npm run smoke -- --only=<段名>，段名表在 tools/smoke.ts） */
import type { Browser } from 'playwright-core';
import { BASE, check, shot, newPage, json } from '../lib/core.ts';
import { FAKE_WALLET, mockSession } from '../lib/fakes.ts';

export async function lobbyNudge(browser: Browser): Promise<void> {
  console.log('大厅提醒：桌上的筹码；能领补给时顶栏筹码亮红点，进钱包页领');
  const { ctx, page } = await newPage(browser, '大厅提醒', 'portrait');
  const stake = { game: 'texas', ref: 'room-123456', tier: 'small', amount: 1_000, mode: 'server', at: Date.UTC(2026, 9, 16, 1), until: Date.UTC(2026, 9, 16, 9) };
  const low = { balance: 300, stakes: [stake], canRelief: true, writesLeft: 200, caps: {}, fresh: false };
  let relieved = false;
  await mockSession(page, { me: { notice: null }, wallet: () => ({ ...FAKE_WALLET, wallet: relieved ? { ...low, balance: 1_000, canRelief: false } : low, ledger: [] }) });
  await page.route('**/api/wallet/relief', (r) => {
    relieved = true;
    return r.fulfill(json({ wallet: { ...low, balance: 1_000, canRelief: false } }));
  });
  await page.goto(`${BASE}/`);
  const toTable = page.getByTestId('nudge-stake');
  await toTable.getByText('德州扑克好友房桌上还有 1,000').waitFor();
  // 同一个游戏两份（单机加好友房）：还是直达德州，不说"2 个游戏"
  await page.unroute('**/api/wallet');
  const solo = { ...stake, ref: 'solo-abcdef', mode: 'client', amount: 2_000 };
  await page.route('**/api/wallet', (r) => r.fulfill(json({ ...FAKE_WALLET, wallet: { ...low, stakes: [stake, solo] }, ledger: [] })));
  await page.reload();
  await toTable.getByText('德州扑克桌上还有 3,000（2 份）').waitFor();
  await toTable.getByRole('link', { name: '回去接着打' }).waitFor();
  await page.unroute('**/api/wallet');
  await page.route('**/api/wallet', (r) =>
    r.fulfill(json({ ...FAKE_WALLET, wallet: relieved ? { ...low, balance: 1_000, canRelief: false } : low, ledger: [] })),
  );
  await page.reload();
  await toTable.getByText('德州扑克好友房桌上还有 1,000').waitFor();
  const href = await toTable.getByRole('link', { name: '回去接着打' }).getAttribute('href');
  check(href === '/games/texas/', `"回去接着打"指错了：${href}`);
  // 领补给不再占大厅一条提示：首屏只有"桌上还有"这一条，筹码牌子上亮红点，到钱包页领
  check((await page.getByTestId('nudge-relief').count()) === 0, '大厅不该再有领补给提示条');
  await page.getByTestId('wallet-badge').getByTestId('relief-dot').waitFor();
  await shot(page, 'lobby-nudge');
  await page.goto(`${BASE}/wallet`);
  const btn = page.locator('.wallet__relief button');
  await btn.waitFor();
  check(((await btn.boundingBox())?.height ?? 0) >= 44, '钱包页"领补给"不到 44 高');
  await btn.click();
  await page.getByTestId('wallet-badge').getByText('1,000').waitFor();
  await page.getByTestId('relief-dot').waitFor({ state: 'detached' });
  await page.goto(`${BASE}/`);
  await toTable.waitFor();
  await ctx.close();
}
