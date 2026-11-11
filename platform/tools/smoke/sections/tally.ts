/** 冒烟分段：adminTally（npm run smoke -- --only=<段名>，段名表在 tools/smoke.ts） */
import type { Browser } from 'playwright-core';
import { BASE, check, shot, newPage, json } from '../lib/core.ts';
import { mockAdmin } from '../lib/fakes.ts';

/** 管理页"真人对局"：汇总表按行画出来、按高度翻页，7/30/90 天切换会重新请求，整页不横滑也不竖滑。 */
export async function adminTally(browser: Browser): Promise<void> {
  const row = (game: string, variant: string, mode: string, tier: string, n: number, dur: Record<string, number>, outcome: Record<string, number>) => ({ game, variant, mode, tier, n, dur, outcome });
  const rows = [
    row('texas', 'holdem', 'server', 'mid', 120, { 'lt1m': 4, '1-5m': 40, '5-15m': 50, '15-30m': 20, '30-60m': 6 }, { bust: 10, lose: 40, even: 5, win: 55, big: 10 }),
    row('texas', 'holdem', 'server', 'big', 36, { '1-5m': 8, '5-15m': 18, '15-30m': 10 }, { bust: 4, lose: 12, win: 16, big: 4 }),
    row('mahjong', 'xz', 'server', 'small', 64, { '5-15m': 20, '15-30m': 30, '30-60m': 12, ge60m: 2 }, { lose: 30, win: 28, big: 6 }),
    row('guandan', 'main', 'client', 'small', 80, { '5-15m': 30, '15-30m': 40, '30-60m': 10 }, { lose: 38, win: 42 }),
    row('kaipan', 'main', 'none', 'none', 55, { '15-30m': 35, '30-60m': 20 }, { na: 55 }),
    row('yexun', 'vigil', 'none', 'none', 41, { '5-15m': 25, '15-30m': 16 }, { na: 41 }),
  ];
  for (const screen of ['desktop', 'wide', 'portrait'] as const) {
    console.log(`管理页真人对局（${screen}）`);
    const { ctx, page } = await newPage(browser, `真人对局 ${screen}`, screen === 'wide' ? 'desktop' : screen);
    if (screen === 'wide') await page.setViewportSize({ width: 1920, height: 1080 });
    await mockAdmin(page);
    const asked: string[] = [];
    await page.route('**/api/admin/play-tally*', (r) => {
      asked.push(new URL(r.request().url()).searchParams.get('days') ?? '');
      r.fulfill(json({ from: '2026-09-27', to: '2026-10-26', rows }));
    });
    await page.goto(`${BASE}/admin?s=tally`);
    const box = page.getByTestId('play-tally');
    await box.locator('.atable__row').first().waitFor();
    await shot(page, `admin-tally-${screen}`);
    // 一屏放下：行按剩下的高度翻页（手机上一行是一张卡片，一页放得少），翻着数
    const seen: string[] = [];
    for (let i = 0; i < 10; i++) {
      seen.push(...(await box.locator('.atable__row').allInnerTexts()));
      const next = box.getByRole('button', { name: '下一页' });
      if (!(await next.count()) || (await next.isDisabled())) break;
      await next.click();
    }
    check(seen.length === rows.length, `翻着数应该有 ${rows.length} 行：${seen.length}`);
    check(seen.filter((t) => t.includes('德州扑克')).length === 2, '德州扑克应该两行（中、大档）');
    check((await box.getByRole('button', { name: /近 (7|30|90) 天/ }).count()) === 3, '应该有 7/30/90 三个按钮');
    const before = asked.length;
    await box.getByRole('button', { name: '近 90 天' }).click();
    await page.waitForTimeout(500);
    check(asked.length > before && asked[asked.length - 1] === '90', `点 90 天应该带 days=90 请求：${asked.join(',')}`);
    await box.locator('.atable__row').first().waitFor();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(over <= 1, `整页不该横着滑：多 ${over}px`);
    const tall = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    check(tall <= 1, `一屏放下，整页不该竖着滑：多 ${tall}px`);
    await ctx.close();
  }
}
