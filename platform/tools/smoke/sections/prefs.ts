/** 冒烟分段：hiddenGames（npm run smoke -- --only=<段名>，段名表在 tools/smoke.ts） */
import type { Browser, Page } from 'playwright-core';
import { BASE, check, json, newPage, shot } from '../lib/core.ts';
import { FAKE_USER, mockAdmin, mockSession } from '../lib/fakes.ts';

const cardOf = (page: Page, id: string) => page.locator('.lobby__games').locator(`a[href*="/games/${id}/"]`);

/**
 * 隐藏游戏（15.21）：管理员默认隐藏飞驰；我在 我的账号 → 偏好 里打开飞驰、隐藏开盘，发的是我要隐藏的整张表；
 * 回大厅开盘不见了、飞驰在；排行页没有开盘的页签。管理页 设置 → 隐藏游戏 勾了能存。电脑和手机竖屏各走一遍。
 */
export async function hiddenGames(browser: Browser): Promise<void> {
  for (const screen of ['desktop', 'portrait'] as const) {
    console.log(`隐藏游戏（${screen}）：偏好里切、大厅和排行跟着变；管理页设默认`);
    const { ctx, page } = await newPage(browser, `隐藏游戏 ${screen}`, screen);
    let prefs = { show: [] as string[], hide: [] as string[] };
    await mockSession(page, { user: { ...FAKE_USER, gamePrefs: prefs }, me: { hiddenDefault: ['racing'] } });
    // /api/me 每次按最新的偏好回
    await page.route('**/api/me', (r) => r.fulfill(json({ user: { ...FAKE_USER, gamePrefs: prefs }, service: 'ok', saves: 'ok', registration: 'closed', hiddenDefault: ['racing'] })));
    // 我的账号一打开就读云存档
    await page.route('**/api/saves/*', (r) => r.fulfill(json({ saves: [] })));
    let sent: unknown = null;
    await page.route('**/api/me/games', (r) => {
      sent = r.request().postDataJSON();
      const hidden = new Set((sent as { hidden: string[] }).hidden);
      prefs = { show: hidden.has('racing') ? [] : ['racing'], hide: [...hidden].filter((id) => id !== 'racing') };
      return r.fulfill(json({ user: { ...FAKE_USER, gamePrefs: prefs }, hiddenDefault: ['racing'] }));
    });
    await page.goto(`${BASE}/`);
    await cardOf(page, 'kaipan').first().waitFor();
    check((await cardOf(page, 'racing').count()) === 0, '默认隐藏的飞驰不该在大厅');

    await page.goto(`${BASE}/me?tab=prefs`);
    const card = page.getByTestId('me-prefs');
    await card.waitFor();
    check(!(await page.getByTestId('pref-racing').isChecked()), '默认隐藏的飞驰该是没勾的');
    check((await card.getByText('默认隐藏').count()) === 1, '默认隐藏的该标出来');
    await page.getByTestId('pref-racing').check();
    await page.waitForFunction(() => !(document.querySelector('[data-testid="pref-racing"]') as HTMLInputElement).disabled);
    await page.getByTestId('pref-kaipan').uncheck();
    await page.waitForFunction(() => !(document.querySelector('[data-testid="pref-kaipan"]') as HTMLInputElement).disabled);
    check(JSON.stringify(sent) === JSON.stringify({ hidden: ['kaipan'] }), `发的该是要隐藏的整张表：${JSON.stringify(sent)}`);
    check(!(await page.getByTestId('pref-kaipan').isChecked()) && (await page.getByTestId('pref-racing').isChecked()), '存完勾选该停在点的样子');
    await shot(page, `me-prefs-${screen}`);

    await page.goto(`${BASE}/`);
    await cardOf(page, 'racing').first().waitFor();
    check((await cardOf(page, 'kaipan').count()) === 0, '隐藏了的开盘不该在大厅');
    await page.goto(`${BASE}/boards`);
    await page.waitForLoadState('networkidle');
    check((await page.getByRole('button', { name: '开盘', exact: true }).count()) + (await page.getByRole('tab', { name: '开盘', exact: true }).count()) === 0, '排行页不该有开盘的页签');
    await ctx.close();
  }

  const { ctx, page } = await newPage(browser, '管理页·隐藏游戏');
  await mockAdmin(page);
  let saved: unknown = null;
  await page.route('**/api/admin/settings/games', (r) => {
    if (r.request().method() === 'GET') return r.fulfill(json({ hidden: ['racing'] }));
    saved = r.request().postDataJSON();
    return r.fulfill(json(saved));
  });
  await page.goto(`${BASE}/admin?s=settings`);
  const form = page.getByTestId('hidden-games-admin');
  await form.waitFor();
  check(await form.getByLabel('飞驰').isChecked(), '后台该勾着默认隐藏的飞驰');
  check(await form.getByRole('button', { name: '保存' }).isDisabled(), '没改的时候保存该是灰的');
  await form.getByLabel('开盘').check();
  await form.getByRole('button', { name: '保存' }).click();
  await form.getByText('改好了').waitFor();
  check(JSON.stringify((saved as { hidden: string[] }).hidden.sort()) === JSON.stringify(['kaipan', 'racing']), `存的不对：${JSON.stringify(saved)}`);
  const over = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  check(over <= 1, `管理页设置一屏放下，整页不该滑：${over}px`);
  await shot(page, 'admin-hidden-games');
  await ctx.close();
}
