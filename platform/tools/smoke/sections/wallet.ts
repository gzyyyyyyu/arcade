/** 冒烟分段：walletAndSlowNet（npm run smoke -- --only=<段名>，段名表在 tools/smoke.ts） */
import type { Browser } from 'playwright-core';
import { BASE, check, shot, newPage, json } from '../lib/core.ts';
import { fakeLoginHint, FAKE_USER, mockSession, mockAdmin } from '../lib/fakes.ts';
import { deskLayout } from '../lib/ui.ts';

/** /api/me 挂住时大厅不卡；钱包页和顶栏的筹码牌子（电脑、手机竖屏、横屏）。 */
export async function walletAndSlowNet(browser: Browser): Promise<void> {
  console.log('/api/me 一直不回：8 秒后卡片能点"进入游戏"，顶上写"正在重连"');
  {
    const { ctx, page } = await newPage(browser, '网络卡住');
    await page.route('**/api/me', () => {
      // 不回，模拟国内网络卡住
    });
    await fakeLoginHint(page);
    const t0 = Date.now();
    await page.goto(`${BASE}/`);
    await page.locator('.card', { hasText: '开盘' }).getByText('请稍等…').waitFor();
    const enter = page.locator('.card', { hasText: '开盘' }).getByRole('link', { name: '进入游戏' });
    await enter.waitFor({ timeout: 12_000 });
    const waited = Date.now() - t0;
    check(waited >= 7_000 && waited < 12_000, `"进入游戏"应该在 8 秒左右出来，实际 ${waited} ms`);
    await page.getByTestId('reconnecting').waitFor();
    await shot(page, 'slow-net-home');
    await ctx.close();
  }
  const wallet = {
    balance: 10_320,
    canRelief: false,
    writesLeft: 180,
    fresh: false,
    caps: { kaipan: { net: 2_400, cap: 6_000 }, guandan: { net: -1_200, cap: 30_000 } },
    stakes: [
      { game: 'texas', ref: 'room-123456', tier: 'small', amount: 2_000, mode: 'server', at: Date.UTC(2026, 9, 15, 12, 5), until: Date.UTC(2026, 9, 16, 12, 5) },
      { game: 'kaipan', ref: 'solo-abcdef', tier: 'mid', amount: 10_000, mode: 'client', at: Date.UTC(2026, 9, 15, 13, 0), until: Date.UTC(2026, 9, 16, 13, 0) },
    ],
  };
  const at = (h: number) => Date.UTC(2026, 9, 16, h);
  const ledger = [
    { at: at(5), t: 'buyin', g: 'texas', a: -20_000 },
    { at: at(4), t: 'settle', g: 'kaipan', a: 12_000, capped: 1_200 },
    { at: at(3), t: 'buyin', g: 'kaipan', a: -2_000 },
    { at: at(2), t: 'relief', a: 1_500 },
    { at: at(1), t: 'grant', a: 10_000 },
  ];
  for (const screen of ['desktop', 'portrait', 'landscape'] as const) {
    console.log(`钱包页和顶栏的筹码牌子（${screen}）`);
    const { ctx, page } = await newPage(browser, `钱包 ${screen}`, screen);
    await mockSession(page, {
      user: { ...FAKE_USER, displayName: '名字有八个字的人' },
      wallet: { wallet, tiers: { small: 2_000, mid: 10_000, big: 50_000, lux: 200_000 }, reliefTo: 2_000, playing: { texas: 12, kaipan: 3 }, ledger, week: { kaipan: 9_400, texas: -1_200 } },
    });
    await page.goto(`${BASE}/`);
    const badge = page.getByTestId('wallet-badge');
    await badge.getByText('10,320').waitFor();
    // 大厅提醒：两个游戏有筹码在桌上，指去钱包页
    await page.getByTestId('nudge-stake').getByText('2 个游戏的桌上还有 12,000').waitFor();
    check((await page.getByTestId('nudge-relief').count()) === 0, '钱包加桌上的够多，不该提醒领补给');
    // 最近玩过的排前面（流水里最后碰的是德州），卡片上有本周净赢，这周没玩的没有
    const order = await page.locator('.card__title').evaluateAll((els) => els.map((e) => e.firstChild?.textContent));
    // 大厅一屏放下后卡片分页，一页放几张看屏高：只比页上有的前几张
    check(order.length >= 2 && order.slice(0, 3).join() === ['德州扑克', '开盘', '牌馆'].slice(0, Math.min(3, order.length)).join(), `卡片顺序不对：${order.join()}`);
    await page.getByTestId('week-kaipan').getByText('本周 +9,400').waitFor();
    await page.getByTestId('week-texas').getByText('本周 -1,200').waitFor();
    check((await page.getByTestId('week-guandan').count()) === 0, '牌馆这周没玩，不该有本周净赢');
    // 封面右上角的人数：有人玩的才显示
    await page.getByTestId('playing-texas').getByText('今天 12 人玩过').waitFor();
    await page.getByTestId('playing-kaipan').getByText('今天 3 人玩过').waitFor();
    check((await page.getByTestId('playing-guandan').count()) === 0, '掼蛋今天没人玩，不该有人数牌子');
    const box = (await badge.boundingBox())!;
    const vw = page.viewportSize()!.width;
    check(box.x >= 0 && box.x + box.width <= vw, `筹码牌子出了屏幕：${JSON.stringify(box)}，屏宽 ${vw}`);
    // 窄屏上"管理"收进了"我的"页（display: none），不算
    const tops = await page.locator('.topbar .account').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => Math.round(e.getBoundingClientRect().top)));
    check(new Set(tops).size === 1, `顶栏换行了：${tops}`);
    await shot(page, `wallet-badge-${screen}`);
    await badge.click();
    await page.getByTestId('wallet-balance').getByText('10,320').waitFor();
    // 窄屏钱包页分页签（筹码 / 这周 / 进出），宽屏三块都在
    const tab = async (id: string) => {
      const t = page.getByTestId(`ptab-${id}`);
      if (await t.count()) await t.click();
    };
    await tab('chips');
    await page.getByTestId('relief-why').getByText('钱包加桌上的还有 22,320').waitFor();
    await page.getByTestId('stakes').getByText('回房间点“离开房间”').waitFor();
    await tab('week');
    await page.getByText('开盘：今天实盘赢了 2,400，还能再赢 3,600。').waitFor();
    // 这周的输赢：合计 + 每个游戏一根条
    await page.getByTestId('week-summary').getByText('+8,200').waitFor();
    check((await page.locator('.week-bars__row').count()) === 2, '这周的输赢该有开盘、德州两根条');
    await tab('flow');
    // 最近进出
    await page.getByTestId('ledger').locator('.ledger__row', { hasText: '开盘' }).getByText('到顶没进 1,200').waitFor();
    await page.getByTestId('ledger').getByText('+12,000').waitFor();
    await shot(page, `wallet-${screen}`);
    if (screen === 'desktop') {
      // 最近进出按游戏筛
      await page.getByRole('group', { name: '看哪个游戏' }).getByRole('button', { name: '开盘' }).click();
      const games = await page.locator('.ledger__what').evaluateAll((els) => [...new Set(els.map((e) => e.firstChild?.textContent ?? ''))]);
      check(games.join() === '开盘', `只看开盘时不该有别的：${games.join()}`);
      await page.getByRole('group', { name: '看哪个游戏' }).getByRole('button', { name: '全部' }).click();
      await deskLayout(page, 'wallet');
    }
    await ctx.close();
  }
  for (const screen of ['desktop', 'portrait'] as const) {
    console.log(`管理筹码的小窗口（${screen}）：查人、加 5,000、确认一次、显示新余额和最近的调整`);
    const { ctx, page } = await newPage(browser, `管理筹码 ${screen}`, screen);
    // 入口只在 /admin 页里（维护者：外面的按钮重复了）；大厅顶栏照旧一行、没有这个按钮
    await mockAdmin(page, { open: false, switchOpen: false, forcedOff: false, updatedAt: null });
    const target = { username: 'xiaoming_2026', displayName: '小明' };
    let recent = [{ ...target, at: Date.UTC(2026, 9, 15, 2, 0), amount: -500, note: '多给了', by: 'owner' }];
    await page.route('**/api/admin/wallet-adjustments', (r) => r.fulfill(json({ recent })));
    await page.route('**/api/admin/wallet/xiaoming_2026', (r) => r.fulfill(json({ user: target, wallet: { ...wallet, balance: 3_200 }, log: [] })));
    await page.route('**/api/admin/wallet/adjust', (r) => {
      recent = [{ ...target, at: Date.UTC(2026, 9, 15, 3, 0), amount: 5_000, note: '同学测试', by: 'owner' }, ...recent];
      return r.fulfill(json({ wallet: { ...wallet, balance: 8_200 }, credited: 5_000 }));
    });
    await page.goto(`${BASE}/`);
    await page.getByTestId('wallet-badge').waitFor();
    // 窄屏上"管理"收进了"我的"页（display: none），不算
    const tops = await page.locator('.topbar .account').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => Math.round(e.getBoundingClientRect().top)));
    check(new Set(tops).size === 1, `管理员的顶栏换行了：${tops}`);
    check((await page.getByTestId('admin-chips-open').count()) === 0, '大厅不该再有"管理筹码"按钮');
    if (screen === 'desktop') await page.getByRole('link', { name: '管理', exact: true }).click();
    else {
      // 手机上顶栏没有"管理"，从"我的"页的"去管理后台"进
      await page.route('**/api/saves/*', (r) => r.fulfill(json({ saves: [] })));
      await page.locator('.topbar a[href="/me"]').click();
      await page.getByTestId('me-admin').click();
    }
    await page.getByTestId('admin-chips-open').click();
    const box = page.getByTestId('admin-chips');
    await box.getByLabel('用户名').fill('xiaoming_2026');
    await box.getByRole('button', { name: '查' }).click();
    await box.getByTestId('admin-chips-balance').getByText('3,200').waitFor();
    await box.getByLabel('数量').fill('5000');
    await box.getByLabel('备注').fill('同学测试');
    const asked = new Promise<string>((res) => page.once('dialog', (d) => {
      res(d.message());
      void d.accept();
    }));
    await box.getByRole('button', { name: '确认' }).click();
    check((await asked) === '给 小明（xiaoming_2026）加 5,000？', `确认的话不对：${await asked}`);
    await box.getByText('加了 5,000，现在手上 8,200').waitFor();
    await box.getByTestId('admin-chips-recent').getByText('同学测试').waitFor();
    await shot(page, `admin-chips-${screen}`);
    await ctx.close();
  }
}
