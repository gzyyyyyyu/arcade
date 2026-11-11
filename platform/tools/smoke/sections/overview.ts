/** 冒烟分段：adminOverview（npm run smoke -- --only=<段名>，段名表在 tools/smoke.ts） */
import type { Browser, Locator } from 'playwright-core';
import { adminSection, pickUser } from '../lib/accounts.ts';
import { BASE, check, shot, newPage, json } from '../lib/core.ts';
import { FAKE_WALLET, fakeAdmin } from '../lib/fakes.ts';
import { deskLayout } from '../lib/ui.ts';

/** 管理页的今日概况、账号列表的钱包摘要、展开一个人的战绩和流水。 */
export async function adminOverview(browser: Browser): Promise<void> {
  for (const screen of ['desktop', 'portrait'] as const) {
    console.log(`管理页今日概况、账号的钱包和战绩（${screen}）`);
    const { ctx, page } = await newPage(browser, `今日概况 ${screen}`, screen);
    await fakeAdmin(page);
    const at = (h: number) => Date.UTC(2026, 9, 15, h);
    await page.route('**/api/admin/wallet/xiaoming_2026', (r) =>
      r.fulfill(
        json({
          user: { username: 'xiaoming_2026', displayName: '小明' },
          wallet: { ...FAKE_WALLET.wallet, balance: 23_400, fresh: false, stakes: [{ game: 'texas', ref: 'room-123456', tier: 'small', amount: 2_000, mode: 'server', at: at(9), until: at(30) }] },
          log: [],
          career: { texas: { n: 12, net: 9_400, wnet: 3_000, rounds: 340, wins: 71, best: 8_800, titles: [{ id: 'bluff_king', at: at(3) }], max: {}, sum: {} } },
          ledger: [
            { at: at(9), t: 'buyin', g: 'texas', a: -2_000 },
            { at: at(8), t: 'settle', g: 'kaipan', a: 22_000, capped: 8_000 },
            { at: at(7), t: 'admin', a: 5_000 },
          ],
        }),
      ),
    );
    await page.goto(`${BASE}/admin`);
    const ov = page.getByTestId('overview');
    await ov.getByText('14').waitFor();
    const texasToday = (await page.locator('.game-today__item', { hasText: '德州扑克' }).innerText()).replace(/\s+/g, ' ');
    check(texasToday.includes('6 人') && texasToday.includes('带入 24,000 · 结回 21,000'), `今天各游戏里德州那行不对：${texasToday}`);
    check(await page.locator('.panel__head').getByTestId('admin-chips-open').isVisible(), '"管理筹码"应该在"今天"的标题行里');
    await shot(page, `admin-console-${screen}`);
    // 管理后台在 1280、1920 宽也不是窄列、不横着滑
    if (screen === 'desktop') await deskLayout(page, 'admin-console');
    // 一屏放下：窄屏趋势图、每天明细各在一个页签里（宽屏两栏都在）
    // 页面刚打开时会话还在重读，页签选中的状态可能被重置：等网络静下来再点
    await page.waitForLoadState('networkidle');
    const openTab = async (id: string) => {
      const t = page.getByTestId(`ptab-${id}`);
      if (await t.count()) await t.click();
    };
    await openTab('week');
    // 模拟数据只有两天：x 轴照样排满 7 天，没记录的天是 0 高的柱
    const chartDays = await page.locator('.chart__day .chart__label').allTextContents();
    check(chartDays.join(' ') === '10-10 10-11 10-12 10-13 10-14 10-15 今天', `趋势图应该固定 7 天：${chartDays.join(' ')}`);
    check((await page.locator('.chart__day .chart__in[height="0"]').count()) === 5, '没记录的 5 天应该画 0');
    if (screen !== 'portrait') {
      await page.locator('.chart__day').last().hover();
      const tip = (await page.locator('.chart__tip').innerText()).replace(/\s+/g, ' ');
      check(tip.includes('今天') && tip.includes('带入 30,000') && tip.includes('玩过 9 人'), `悬停今天应该浮出当天的数字：${tip}`);
    }
    await openTab('detail');
    const trendOld = await page.getByTestId('trend').locator('.atable__row').nth(1).locator('.atable__cell').nth(1).textContent();
    check(trendOld === '—', `0.10.7 以前的记录应该写"—"：${trendOld}`);
    const trendGames = (await page.getByTestId('trend').locator('.atable__row').first().locator('.per-people').innerText()).replace(/\s+/g, ' ');
    check(trendGames.includes('德州扑克') && !trendGames.includes('飞驰'), `趋势表按用钱包的游戏分列，不列飞驰：${trendGames}`);
    await adminSection(page, '用户');
    await page.getByTestId('user-xiaoming_2026').getByTestId('user-wallet').getByText('余额 23,400 · 桌上 2,000 · 开盘 3 次、德州扑克 12 次').waitFor();
    await page.getByTestId('user-a_very_long_name_20').getByText('还没用过钱包').waitFor();
    const user = await pickUser(page, 'xiaoming_2026');
    await user.getByTestId('user-detail').getByText('21%').waitFor();
    await user.getByTestId('user-tab-ledger').click();
    const ledger = user.getByTestId('ledger');
    await seek(ledger, ledger.getByText('到顶没进 8,000'));
    await seek(ledger, ledger.locator('.ledger__kind--settle').getByText('结回'));
    await seek(ledger, ledger.locator('.ledger__amount.up', { hasText: '+22,000' }));
    await shot(page, `admin-overview-${screen}`);
    await ctx.close();
  }
}

/** 流水按高度翻页（竖屏一页放不下 30 条）：从第一页往后翻，直到要找的那条出现 */
async function seek(paged: Locator, target: Locator): Promise<void> {
  const prev = paged.getByRole('button', { name: '上一页' });
  const next = paged.getByRole('button', { name: '下一页' });
  while ((await prev.count()) > 0 && (await prev.isEnabled())) await prev.click();
  for (let i = 0; i < 20; i++) {
    if ((await target.count()) > 0) break;
    if (!(await next.count()) || !(await next.isEnabled())) break;
    await next.click();
  }
  await target.first().waitFor();
}
