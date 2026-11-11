/** 冒烟分段：lobbyTour（npm run smoke -- --only=<段名>，段名表在 tools/smoke.ts） */
import type { Browser, Page } from 'playwright-core';
import { BASE, check, shot, type Screen, newPage } from '../lib/core.ts';
import { FAKE_USER, mockSession } from '../lib/fakes.ts';

/** 新人引导：7 天内注册、没记录的账号第一次进大厅走三步；看完记 done，刷新不再弹；老账号不弹。冒烟浏览器默认不弹（webdriver），这里用 arcade.tour.test 打开 */
export async function lobbyTour(browser: Browser): Promise<void> {
  console.log('新人引导：三步、记住、老账号不弹');
  const TEXTS = ['挑一个游戏，点这里就开打', '这是你的筹码：只能用来玩，不能买、不能换。用完了每天能领补给', '加好友、看好友在玩什么、一键加入他的房间'];
  const fresh = { ...FAKE_USER, id: 'tour-new', createdAt: Date.now() };
  const open = async (screen: Screen, user: object, label: string) => {
    const { ctx, page } = await newPage(browser, label, screen);
    await page.addInitScript(() => localStorage.setItem('arcade.tour.test', '1'));
    await mockSession(page, { user });
    await page.goto(`${BASE}/`);
    return { ctx, page };
  };
  const checkBubble = async (page: Page, i: number) => {
    const bubble = page.getByTestId('tour-bubble');
    await bubble.getByText(TEXTS[i]!, { exact: true }).waitFor();
    const vp = page.viewportSize()!;
    check((await bubble.evaluate((el) => document.activeElement === el)) === true, `第 ${i + 1} 步焦点应在气泡上`);
    const box = (await bubble.boundingBox())!;
    check(box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width && box.y + box.height <= vp.height, `第 ${i + 1} 步气泡出了屏幕：${JSON.stringify(box)}`);
    for (const b of await bubble.getByRole('button').all()) {
      const bb = (await b.boundingBox())!;
      check(bb.height >= 44, `引导按钮不到 44 高：${await b.textContent()}（${bb.height}）`);
    }
    check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `第 ${i + 1} 步整页横滑了`);
    check((await bubble.getByRole('button', { name: '跳过' }).count()) === 1, `第 ${i + 1} 步缺"跳过"`);
  };

  const desk = await open('desktop', fresh, '引导电脑');
  await checkBubble(desk.page, 0);
  await shot(desk.page, 'tour-step1-desktop', false);
  await desk.ctx.close();

  const { ctx, page } = await open('portrait', fresh, '引导手机');
  await checkBubble(page, 0);
  check((await page.getByTestId('tour-next').textContent()) === '下一步', '第一步该是"下一步"');
  await shot(page, 'tour-step1-phone', false);
  await page.getByTestId('tour-next').click();
  await checkBubble(page, 1);
  await shot(page, 'tour-step2-phone', false);
  await page.getByTestId('tour-next').click();
  await checkBubble(page, 2);
  check((await page.getByTestId('tour-next').textContent()) === '知道了', '最后一步该是"知道了"');
  await page.getByTestId('tour-next').click();
  await page.getByTestId('lobby-tour').waitFor({ state: 'detached' });
  check((await page.evaluate(() => localStorage.getItem('arcade.tour.tour-new'))) === 'done', '看完应记下 arcade.tour.<用户 id> = done');
  await page.reload();
  await page.locator('.card__play').first().waitFor();
  await page.waitForTimeout(500);
  check((await page.getByTestId('lobby-tour').count()) === 0, '看完刷新后不该再弹');
  await ctx.close();

  // 跳过、Esc 也都记下来
  const skip = await open('portrait', { ...fresh, id: 'tour-skip' }, '引导跳过');
  await skip.page.getByTestId('tour-bubble').waitFor();
  await skip.page.getByTestId('tour-skip').click();
  await skip.page.getByTestId('lobby-tour').waitFor({ state: 'detached' });
  check((await skip.page.evaluate(() => localStorage.getItem('arcade.tour.tour-skip'))) === 'done', '跳过应记 done');
  await skip.ctx.close();
  const esc = await open('desktop', { ...fresh, id: 'tour-esc' }, '引导 Esc');
  await esc.page.getByTestId('tour-bubble').waitFor();
  await esc.page.keyboard.press('Escape');
  await esc.page.getByTestId('lobby-tour').waitFor({ state: 'detached' });
  check((await esc.page.evaluate(() => localStorage.getItem('arcade.tour.tour-esc'))) === 'done', 'Esc 应记 done');
  await esc.ctx.close();

  // 老账号（30 天前注册）不弹
  const old = await open('portrait', { ...FAKE_USER, id: 'tour-old', createdAt: Date.now() - 30 * 24 * 3600 * 1000 }, '引导老账号');
  await old.page.locator('.card__play').first().waitFor();
  await old.page.waitForTimeout(500);
  check((await old.page.getByTestId('lobby-tour').count()) === 0, '老账号不该弹引导');
  await old.ctx.close();
}
