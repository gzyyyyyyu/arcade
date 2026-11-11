/** 冒烟分段：walletRulesAdmin（npm run smoke -- --only=<段名>，段名表在 tools/smoke.ts） */
import type { Browser } from 'playwright-core';
import { BASE, check, shot, newPage, json } from '../lib/core.ts';
import { DEFAULT_RULES, FAKE_RULES, fakeAdmin } from '../lib/fakes.ts';

export async function walletRulesAdmin(browser: Browser): Promise<void> {
  console.log('管理页改钱包规则：补给额 2,000 → 3,000');
  const { ctx, page } = await newPage(browser, '钱包规则');
  await fakeAdmin(page);
  let sent: unknown = null;
  await page.route('**/api/admin/settings/wallet', (r) => {
    if (r.request().method() === 'GET') return r.fulfill(json(FAKE_RULES));
    sent = r.request().postDataJSON();
    return r.fulfill(
      json({ ...FAKE_RULES, rules: { ...DEFAULT_RULES, reliefTo: 3_000 }, log: [{ at: Date.UTC(2026, 9, 15, 16), by: 'owner', changes: { reliefTo: [2_000, 3_000] } }], updatedAt: Date.UTC(2026, 9, 15, 16) }),
    );
  });
  await page.goto(`${BASE}/admin?s=settings`);
  const form = page.getByTestId('wallet-rules');
  await form.getByLabel('单机实盘每天最多赢几份').fill('0');
  await form.getByText('要是 1 到 1,000 的整数').waitFor();
  await form.getByLabel('单机实盘每天最多赢几份').fill('10');
  await form.getByLabel('补给补到').fill('3000');
  page.once('dialog', (d) => {
    check(d.message().includes('补给补到：2,000 → 3,000'), `确认框说的不对：${d.message()}`);
    void d.accept();
  });
  await form.getByRole('button', { name: '保存（改 1 条）' }).click();
  await form.getByText('改好了，已经生效').waitFor();
  check(JSON.stringify(sent) === JSON.stringify({ reliefTo: 3_000 }), `发的不对：${JSON.stringify(sent)}`);
  await form.getByText('改动记录（1）').click();
  await page.getByTestId('rules-log').getByText('补给补到 2,000 → 3,000').waitFor();
  await shot(page, 'admin-wallet-rules');
  await ctx.close();
}
