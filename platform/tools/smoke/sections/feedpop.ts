/** 冒烟分段：feedPop（npm run smoke -- --only=<段名>，段名表在 tools/smoke.ts） */
import type { Browser } from 'playwright-core';
import { BASE, fail, check, shot, newPage } from '../lib/core.ts';
import { mockSession, FAKE_FEED, fakeFeedFiles } from '../lib/fakes.ts';
import { feedLine } from '../lib/ui.ts';

/**
 * 顶栏"动态"：有新的带红点，点开就消失；电脑是按钮下面约 360 宽的浮层（Esc、点外面收起），手机是底部半屏面板（点遮罩、往下拉收起）；
 * 底下"看全部"进好友页；能点的都够 44（电脑上看得见就行）。四种屏幕各截关、开两张。
 */
export async function feedPop(browser: Browser): Promise<void> {
  const sizes = [
    ['电脑1280', 'desktop', { width: 1280, height: 800 }],
    ['电脑1920', 'desktop', { width: 1920, height: 1080 }],
    ['竖390', 'portrait', { width: 390, height: 844 }],
    ['横844', 'landscape', { width: 844, height: 390 }],
  ] as const;
  for (const [label, screen, viewport] of sizes) {
    console.log(`顶栏动态（${label}）`);
    const { ctx, page } = await newPage(browser, `动态 ${label}`, screen, { viewport });
    await mockSession(page, { feed: FAKE_FEED });
    await fakeFeedFiles(page);
    await page.goto(`${BASE}/`);
    const btn = page.getByTestId('feed-button');
    await btn.getByTestId('feed-dot').waitFor();
    const b = (await btn.boundingBox())!;
    check(b.height >= 44 && b.width >= 44, `${label}："动态"按钮不到 44（${Math.round(b.width)}×${Math.round(b.height)}）`);
    check((await page.locator('.topbar').evaluate((el) => {
      const tops = new Set([...el.children].map((c) => Math.round(c.getBoundingClientRect().top)));
      return tops.size;
    })) === 1, `${label}：顶栏折行了`);
    await shot(page, `feedpop-${label}-closed`, false);
    await btn.click();
    const pop = page.getByTestId('feed-pop');
    await pop.waitFor();
    await feedLine(pop.getByTestId('feed-item').first(), '小明', '牌馆小档', ['赢了 1.6 份', '称号：双下王']);
    // 横屏半屏只有一两百像素高：放不下的翻页，至少有 1 条，其余各尺寸 2 条都在
    const shownN = await pop.getByTestId('feed-item').count();
    check(screen === 'landscape' ? shownN >= 1 : shownN === 2, `${label}：浮层里该有 2 条（横屏放不下时至少 1 条）：${shownN}`);
    check((await btn.getByTestId('feed-dot').count()) === 0, `${label}：点开了红点该消失`);
    check((await pop.getByRole('link', { name: '看全部' }).getAttribute('href')) === '/feed', `${label}："看全部"该进动态页`);
    const p = (await pop.boundingBox())!;
    if (screen === 'desktop') {
      check(Math.abs(p.width - 360) <= 2 && p.y >= b.y + b.height && p.x >= 0 && p.x + p.width <= viewport.width, `${label}：浮层该挂在按钮下面、约 360 宽（${Math.round(p.x)},${Math.round(p.y)} ${Math.round(p.width)} 宽）`);
    } else {
      check(Math.abs(p.y + p.height - viewport.height) <= 1 && Math.abs(p.width - viewport.width) <= 1, `${label}：手机上该是贴底的整宽面板（${Math.round(p.y)}+${Math.round(p.height)}）`);
      for (const el of await pop.locator('a, button').all()) {
        const r = await el.boundingBox();
        if (r && (r.height < 44 || r.width < 44)) fail(`${label}：浮层里的「${(await el.textContent())?.trim()}」不到 44（${Math.round(r.width)}×${Math.round(r.height)}）`);
      }
    }
    const listBox = await pop.locator('.feedpop__list').evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
    check(listBox.sh <= listBox.ch + 1, `${label}：浮层里的列表不该滚（${listBox.sh} / ${listBox.ch}）`);
    const all = (await pop.getByRole('link', { name: '看全部' }).boundingBox())!;
    check(all.y >= 0 && all.y + all.height <= viewport.height + 1, `${label}："看全部"该在屏幕里（${Math.round(all.y)}+${Math.round(all.height)}）`);
    await shot(page, `feedpop-${label}-open`, false);
    if (screen === 'desktop') {
      await page.keyboard.press('Escape');
      await pop.waitFor({ state: 'detached' });
      await btn.click();
      await pop.waitFor();
      await page.mouse.click(20, viewport.height - 20);
      await pop.waitFor({ state: 'detached' });
    } else {
      // 点遮罩（面板上面那块）收起；再打开，把顶上的小横条往下拉收起
      await page.mouse.click(viewport.width / 2, 10);
      await pop.waitFor({ state: 'detached' });
      await btn.click();
      const grab = (await pop.locator('.feedpop__grab').boundingBox())!;
      await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2);
      await page.mouse.down();
      await page.mouse.move(grab.x + grab.width / 2, grab.y + 150, { steps: 5 });
      await page.mouse.up();
      await pop.waitFor({ state: 'detached' });
    }
    await ctx.close();
  }

  // 动态多（12 条）：浮层只给一页，放不下的翻页，列表不滚，"看全部"和翻页条都在屏幕里
  for (const [label, screen, viewport] of [
    ['电脑1280', 'desktop', { width: 1280, height: 800 }],
    ['横844', 'landscape', { width: 844, height: 390 }],
  ] as const) {
    console.log(`顶栏动态很多（${label}）`);
    const { ctx, page } = await newPage(browser, `动态很多 ${label}`, screen, { viewport });
    const feed = Array.from({ length: 12 }, (_, i) => ({ ...FAKE_FEED[0]!, id: `0000000${String.fromCharCode(97 + i)}AAAAAAAAAAAA`, at: Date.now() - (i + 1) * 5 * 60_000 }));
    await mockSession(page, { feed });
    await fakeFeedFiles(page);
    await page.goto(`${BASE}/`);
    await page.getByTestId('feed-button').click();
    const pop = page.getByTestId('feed-pop');
    await pop.getByTestId('feed-item').first().waitFor();
    const listBox = await pop.locator('.feedpop__list').evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
    check(listBox.sh <= listBox.ch + 1, `${label}：浮层里的列表不该滚（${listBox.sh} / ${listBox.ch}）`);
    const shown = await pop.getByTestId('feed-item').count();
    check(shown >= 1 && shown < 8, `${label}：浮层一页该放不下 8 条（${shown}）`);
    await pop.getByRole('button', { name: '下一页' }).click();
    check((await pop.locator('.paged__at').textContent())!.startsWith('2 /'), `${label}：浮层该能翻页`);
    const all = (await pop.getByRole('link', { name: '看全部' }).boundingBox())!;
    check(all.y >= 0 && all.y + all.height <= viewport.height + 1, `${label}："看全部"该在屏幕里`);
    await shot(page, `feedpop-many-${label}`, false);
    await ctx.close();
  }
}
