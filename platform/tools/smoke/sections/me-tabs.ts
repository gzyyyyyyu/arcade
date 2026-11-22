/** "我的账号"页签的冒烟小工具：页面一屏放下后，内容按页签分开放（src/pages/me/Me.tsx），测之前先切到对应的页签。 */
import type { Locator, Page } from 'playwright-core';

type MeTab = 'profile' | 'privacy' | 'saves' | 'invite' | 'safe';

/** 切页签。宽屏上"隐私"并进"资料"，没有单独的页签，就停在资料 */
export async function meTab(page: Page, id: MeTab): Promise<void> {
  // 先等页签那一排画出来（页面刚打开时还是骨架），再看有没有这个页签，不然会误判成"没有"、点到资料上
  await page.getByTestId('me-tab-profile').waitFor();
  const tab = page.getByTestId(`me-tab-${id}`);
  const target = (await tab.count()) > 0 ? tab : page.getByTestId('me-tab-profile');
  if ((await target.getAttribute('aria-selected')) !== 'true') await target.click();
}

/** 云存档里某个游戏的那一行：行按高度翻页，没在这一页就往后翻 */
export async function savesRow(page: Page, id: string): Promise<Locator> {
  await meTab(page, 'saves');
  // 云存档页签一打开才去读：等第一行画出来再找、再翻页，不然还没画出来就判定"没这一行"（主流程里有长连接，等不到网络静下来）
  await page.getByTestId('saves').locator('.saves-row').first().waitFor();
  const row = page.getByTestId(`saves-${id}`);
  const next = page.getByRole('button', { name: '下一页' });
  for (let i = 0; i < 20 && (await row.count()) === 0 && (await next.count()) > 0 && (await next.isEnabled()); i++) await next.click();
  await row.waitFor();
  return row;
}

/** 账号操作：改昵称在资料页签，其余在安全页签里选一个操作。返回装着那个表单的区域 */
export async function openMeSection(page: Page, title: '改昵称' | '改密码' | '换一个恢复码' | '退出其他设备' | '注销账号'): Promise<Locator> {
  if (title === '改昵称') {
    await meTab(page, 'profile');
    return page.getByTestId('me-rename');
  }
  await meTab(page, 'safe');
  const key = { 改密码: 'password', 换一个恢复码: 'recovery', 退出其他设备: 'others', 注销账号: 'delete' }[title];
  await page.getByTestId(`safe-${key}`).click();
  return page.getByTestId('safe-pane');
}

/**
 * 隐私说明按小节分页签、每节再按高度翻页（src/pages/privacy/Privacy.tsx）：逐节逐页找，返回这段文字出现的次数。
 * 找到第一处就停（want 为真时），没找到走完所有小节和页。
 */
export async function privacyCount(page: Page, text: string | RegExp, stopAtFirst = true): Promise<number> {
  const tabs = page.locator('[data-testid^="ptab-"]');
  const n = await tabs.count();
  let found = 0;
  for (let i = 0; i < n; i++) {
    await tabs.nth(i).click();
    const prev = page.getByRole('button', { name: '上一页' });
    while ((await prev.count()) > 0 && (await prev.isEnabled())) await prev.click();
    for (let guard = 0; guard < 30; guard++) {
      found += await page.locator('.privacy-block').filter({ hasText: text }).count();
      if (found > 0 && stopAtFirst) return found;
      const next = page.getByRole('button', { name: '下一页' });
      if ((await next.count()) === 0 || !(await next.isEnabled())) break;
      await next.click();
    }
  }
  return found;
}

/** 回到第一节第一页（截图用） */
export async function privacyHome(page: Page): Promise<void> {
  await page.locator('[data-testid^="ptab-"]').first().click();
}
