// --pages-a 模式：页面细节 A（结束页排版、手机群聊点推荐直接买、昨日回顾角标、竖屏「照样玩」）
import type { Browser } from 'playwright-core';
import { botByName, playRun } from '../../bots.ts';
import { BASIC_SETUP, controls, dismissEndDialogs, dispatch2, expect, loadState, PHONE, openPage, setupQuery, shot, state, tap, touchDrag, waitFor, waitIdle, type Ctx } from '../harness.ts';
import { profileStorage } from '../fakes.ts';

/**
 * 页面细节 A（--pages-a，加 --phone 跑手机部分）：结束页（手机横屏不挤、电脑收获行不压月份条）、
 * 手机群聊页点带推荐的消息直接买、昨日回顾几秒后收成角标、竖屏「照样玩」。真人操作（不开机器人代打）的是交易那段。
 */
export async function pagesAShots(browser: Browser): Promise<void> {
  const regions = (ctx: Ctx): Promise<Record<string, unknown>> => ctx.page.evaluate(() => window.__game?.regions() ?? {});
  {
    // 结束页：有「收获」图标时，下面的月份条不压住它
    const ended = playRun('pa-end', botByName('smart'), { persona: 'newbie', difficulty: 1 });
    const ctx = await openPage(browser, 'pa-end', PHONE ? '' : 'layout=desktop', { storage: profileStorage('partial'), touch: PHONE });
    await loadState(ctx, ended);
    await waitIdle(ctx, '结束页', "window.__game.scene === 'end'");
    await ctx.page.waitForTimeout(2500);
    await shot(ctx, 'pa1-end-dialogs');
    await dismissEndDialogs(ctx);
    await ctx.page.waitForTimeout(1500);
    await shot(ctx, 'pa2-end');
    await ctx.page.context().close();
  }
  if (PHONE) {
    // 同一趟里再截一张电脑版结束页（有「收获」图标时月份条不压它）
    const ended = playRun('pa-end', botByName('smart'), { persona: 'newbie', difficulty: 1 });
    const ctx = await openPage(browser, 'pa-end-desk', 'layout=desktop', { storage: profileStorage('partial'), screen: { width: 1280, height: 720, dpr: 1 } });
    await loadState(ctx, ended);
    await waitIdle(ctx, '电脑结束页', "window.__game.scene === 'end'");
    await ctx.page.waitForTimeout(2500);
    await dismissEndDialogs(ctx);
    await ctx.page.waitForTimeout(1500);
    await shot(ctx, 'pa2d-end-desktop');
    await ctx.page.context().close();
  }
  if (!PHONE) return;
  {
    // 交易页：群聊页里点带推荐的消息就买；昨日回顾几秒后收成角标
    const ctx = await openPage(browser, 'pa-trade', `seed=pre-1&anim=0&${setupQuery(BASIC_SETUP)}`, { touch: true });
    await ctx.page.waitForTimeout(500);
    await shot(ctx, 'pa3-chat');
    expect('chat:buy' in (await controls(ctx)), `群聊页应有带推荐的消息（${Object.keys(await controls(ctx)).join(',')}）`);
    const held = 's.slots.filter((x) => x).length';
    // 拖持仓卡出持仓区、松手正好落在带推荐的消息上：只卖出这一只，不能顺手把消息当成点击再买一笔
    const beforeDrag = await state<number>(ctx, held);
    await touchDrag(ctx, 'card:0', 'chat:buy');
    await waitIdle(ctx, '拖出去卖');
    expect((await state<number>(ctx, held)) === beforeDrag - 1, `拖到消息上松手应只卖出一只、不买（拖前 ${beforeDrag}，拖后 ${await state<number>(ctx, held)}）`);
    // 有仓位玩法时买入先弹「买多少」：误触发的话这里会弹出来
    expect(!('size:taste' in (await controls(ctx))), '拖到消息上松手不该弹出买入的选择');
    const before = await state<number>(ctx, held);
    await tap(ctx, 'chat:buy');
    await ctx.page.waitForTimeout(300);
    if ('size:taste' in (await controls(ctx))) await tap(ctx, 'size:taste');
    await waitIdle(ctx, '点消息买入');
    expect((await state<number>(ctx, held)) === before + 1, '点群聊里带推荐的消息应买入一只');
    await shot(ctx, 'pa4-chat-bought');
    await dispatch2(ctx, { type: 'open' });
    await ctx.page.waitForTimeout(600);
    expect('recap:recap' in (await regions(ctx)), '收盘后应有昨日回顾');
    await shot(ctx, 'pa5-recap');
    // 收起计时按游戏时间走 7 秒：负载高时软件渲染掉帧，游戏时间比真实时间慢，所以按条件等，不按固定秒数
    await waitFor(ctx, '几秒后昨日回顾应收成角标', "'recap:badge' in g.controls()");
    expect(!('recap:recap' in (await regions(ctx))), '收成角标后不应还留着整张卡');
    await shot(ctx, 'pa6-recap-badge');
    await tap(ctx, 'recap:badge');
    await ctx.page.waitForTimeout(400);
    expect('recap:recap' in (await regions(ctx)), '点角标应再展开');
    await shot(ctx, 'pa7-recap-reopened');
    await ctx.page.context().close();
  }
  {
    // 0.33.0 起竖屏打开就是竖屏版、不提示；横过来版面和方向不一致才提示「换成横屏版？」，点「照样玩」收起，转回竖屏也不再提示
    const ctx = await openPage(browser, 'pa-portrait', `seed=pre-1&anim=0&${setupQuery(BASIC_SETUP)}`, { touch: true, screen: { width: 390, height: 844, dpr: 2 } });
    await waitIdle(ctx, '竖屏首屏');
    expect(!(await ctx.page.locator('#rotate-hint').isVisible()), '竖屏打开就是竖屏版，不应有转屏提示');
    await shot(ctx, 'pa8-portrait');
    await ctx.page.setViewportSize({ width: 844, height: 390 });
    await ctx.page.waitForTimeout(500);
    expect(await ctx.page.locator('#rotate-hint').isVisible(), '竖屏版横过来应提示换版');
    await shot(ctx, 'pa9-portrait-turned');
    await ctx.page.locator('#rotate-hint .rh-keep').tap();
    await ctx.page.waitForTimeout(500);
    expect(!(await ctx.page.locator('#rotate-hint').isVisible()), '点「照样玩」应收起提示层');
    await ctx.page.setViewportSize({ width: 390, height: 844 });
    await waitIdle(ctx, '转回竖屏');
    expect(!(await ctx.page.locator('#rotate-hint').isVisible()), '转回竖屏版面和方向一致，不应提示');
    await ctx.page.context().close();
  }
}
