// --friendly 模式：看得懂、说人话（说明书、词典、新手提示、收盘小结、拆解条、新闻、台词）
import type { Browser } from 'playwright-core';
import { BASIC_SETUP, clickAt, click, clock, controls, dialogOpen, dispatch2, dispatchNoWait, expect, findDay, LIMIT_SETUP, loadState, notes, openPage, PHONE, phoneTab, setupQuery, shot, waitIdle, WAIT_MS } from '../harness.ts';

// ---------------------------------------------------------------- 看得懂、说人话

/** 说明书、词典、新手提示、收盘小结、拆解条、新闻、台词气泡、新设置面板。截图名 a0–a9。 */
export async function friendlyShots(browser: Browser): Promise<void> {
  // A. 说明书三页（开始菜单入口）、词典
  {
    const ctx = await openPage(browser, 'help', '');
    expect('help' in (await controls(ctx)), '开始菜单应有「怎么玩」');
    await click(ctx, 'help');
    await dialogOpen(ctx, 'help:next');
    // 仓位玩法加了第 4 页（买多少、押跌、银行）
    for (let i = 1; i <= 4; i++) {
      await ctx.page.waitForTimeout(250);
      await shot(ctx, i <= 3 ? `a${i}-help-page-${i}` : `a3b-help-page-${i}`);
      await click(ctx, 'help:next');
    }
    await ctx.page.waitForTimeout(250);
    expect(!('help:next' in (await controls(ctx))), '最后一页点「知道了」应关掉说明书');
    await click(ctx, 'codex');
    await dialogOpen(ctx, 'codex:close');
    await click(ctx, 'codex:tab:words');
    await ctx.page.waitForTimeout(250);
    // 手机横屏的词典分页，一页 8 条：点第一页里的一条
    await click(ctx, `codex:card:${PHONE ? 4 : 8}`);
    await ctx.page.waitForTimeout(200);
    await shot(ctx, 'a4-codex-words');
    await click(ctx, 'codex:close');
    await ctx.page.waitForTimeout(250);
    await click(ctx, 'settings');
    await dialogOpen(ctx, 'settings:done');
    await shot(ctx, 'a5-settings');
    await click(ctx, 'settings:done');
    await ctx.page.context().close();
  }
  // B. 交易画面：新手提示（全新档案默认打开）→ 买入台词 → 开盘 → 小结卡、新闻 → 点持仓卡看拆解条 → 顶栏「怎么玩」
  {
    const ctx = await openPage(browser, 'friendly-day', `seed=pre-1&${setupQuery({ ...BASIC_SETUP })}`);
    const regions = async (): Promise<Record<string, { x: number; y: number; w: number; h: number }>> => (await ctx.page.evaluate(() => window.__game?.regions())) ?? {};
    expect('hint' in (await regions()), '全新档案开盘前应有新手提示');
    await shot(ctx, 'a6-newbie-hint');
    await click(ctx, 'buy:0');
    await ctx.page.waitForTimeout(350);
    expect(Object.keys(await regions()).some((k) => k.startsWith('quip:')), '买入时小人应冒一句台词');
    await shot(ctx, 'a7-quip-bought');
    await waitIdle(ctx, '买入');
    await dispatch2(ctx, { type: 'open' });
    await ctx.page.waitForTimeout(300);
    // 手机横屏：买入时切到了「推荐」页，新闻在「群聊」页里
    await phoneTab(ctx, 'msgs');
    const r = await regions();
    expect('recap:recap' in r, `收盘后应有小结卡（${Object.keys(r).join(',')}）`);
    notes.push(`收盘后：新闻 ${'news' in r ? '有' : '无'}`);
    // 小结和猫一次只露一个（电脑、手机一样），猫的话先收着，小结卡上挂一只小猫
    const catWaiting = 'recap:cat' in (await controls(ctx));
    expect('hint' in r || catWaiting, `第二天开盘前猫也应该说话（${Object.keys(r).join(',')}）`);
    await shot(ctx, 'a8-recap-card');
    if ('news' in r) {
      // 新闻默认折叠成一行，点开看全文
      expect(!('news:open' in r), '新闻默认应折叠');
      await click(ctx, 'news:toggle');
      await ctx.page.waitForTimeout(200);
      expect('news:open' in (await regions()), '点新闻条应展开');
      await shot(ctx, 'a8b-news', { x: 960, y: 60, width: 320, height: 660 });
      await click(ctx, 'news:toggle');
      await ctx.page.waitForTimeout(150);
    }
    // 小结卡默认两句，点「展开」看全部
    if ('recap:expand' in (await controls(ctx))) {
      await click(ctx, 'recap:expand');
      await ctx.page.waitForTimeout(200);
      await shot(ctx, 'a8c-recap-expanded');
      await click(ctx, 'recap:expand');
      await ctx.page.waitForTimeout(150);
    }
    if (catWaiting) {
      await click(ctx, 'recap:cat');
      await ctx.page.waitForTimeout(250);
      const r2 = await regions();
      expect('hint' in r2 && !('recap:recap' in r2), '点小结卡上的小猫应收起小结、露出猫的提示');
      await shot(ctx, 'a8d-phone-cat-hint');
    }
    // 点第一格小人：拆解条
    const slot = r.slots!;
    await clickAt(ctx, slot.x + 70, slot.y + 110);
    await ctx.page.waitForTimeout(300);
    expect('recap:breakdown' in (await regions()), '点持仓卡应显示拆解条');
    await shot(ctx, 'a9-breakdown');
    await click(ctx, 'help');
    await dialogOpen(ctx, 'help:next');
    await shot(ctx, 'a9b-help-in-game');
    await ctx.page.context().close();
  }
  // C. 收盘时的台词：挑一个持仓涨停的日子，在涨停那一下之后冻结画面
  {
    const found = findDay(LIMIT_SETUP, (ev) => ev.some((e) => e.type === 'quip'), 'quip', 40, (s) => s.dayInMonth < 3);
    const ctx = await openPage(browser, 'quip-close', `seed=${found.seed}&${setupQuery(LIMIT_SETUP)}`);
    await loadState(ctx, found.state);
    const t0 = await clock(ctx);
    await dispatchNoWait(ctx, { type: 'open' });
    await ctx.page.waitForFunction(`(() => { const g = window.__game; return !!g && Object.keys(g.regions()).some((k) => k.startsWith('quip:')); })()`, null, { timeout: WAIT_MS, polling: 30 });
    await ctx.page.evaluate(() => window.__game?.freeze(true));
    await shot(ctx, 'a10-quip-close');
    await ctx.page.evaluate(() => window.__game?.freeze(false));
    notes.push(`收盘台词：开盘后 ${(await clock(ctx)) - t0} ms 内出现`);
    await waitIdle(ctx, '收盘台词之后');
    await ctx.page.context().close();
  }
}
