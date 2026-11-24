// 冒烟模式 --touch：主流程里的触屏一段（长按不算点击、点按完成一天）
import type { Browser } from 'playwright-core';
import { BASIC_SETUP, buyVia, controls, expect, longPress, openPage, point, setupQuery, shot, state, tap, waitIdle } from '../harness.ts';

// ---------------------------------------------------------------- 截图与冒烟

/** 触屏：不显示快捷键提示；长按不算点击；点按完成一天（主流程第 11 段，`--touch` 单独跑）。 */
export async function touchShots(browser: Browser): Promise<void> {
  const ctx = await openPage(browser, 'touch', `seed=touch-1&anim=0&${setupQuery(BASIC_SETUP)}`, { touch: true });
  await shot(ctx, '60-touch');
  // 长按永远不算点击：长按买入按钮不买；长按持仓卡弹出说明、不打开详情。说明留在屏幕上，下一次点击只收起说明（不会点到下面的开盘）
  const held = 's.slots.filter((x) => x).length';
  const before = await state<number>(ctx, held);
  // 起触屏且电脑布局字太小的屏（这里 1280×720 触屏）走手机布局：推荐收在「推荐」页签里，先点开
  if ('tab:recs' in (await controls(ctx))) {
    await tap(ctx, 'tab:recs');
    // 等页签切完再按：机器很卡时 200 毫秒后推荐卡可能还在重画，手指按在旧按钮上，长按根本没开始计时
    await waitIdle(ctx, '切到推荐页签', "'buy:0' in window.__game.controls()");
  }
  await longPress(ctx, 'buy:0');
  expect((await state<number>(ctx, held)) === before && !('size:taste' in (await controls(ctx))), '触屏长按买入按钮不应买入');
  // 按住时整块界面重画（按钮在手指底下销毁重建）再按满长按：以前计时器随旧按钮一起被取消，新按钮把松手当成点击，误买
  await longPress(ctx, 'buy:0', async () => {
    await ctx.page.evaluate(() => window.__game?.loadState(window.__game.state()));
  });
  expect((await state<number>(ctx, held)) === before && !('size:taste' in (await controls(ctx))), '按住买入时界面重画，按满长按再松手也不应买入');
  await longPress(ctx, 'card:0');
  await shot(ctx, '60b-touch-longpress');
  await tap(ctx, 'open');
  await ctx.page.waitForTimeout(300);
  expect((await state<number>(ctx, 's.dayIndex')) === 0, '长按说明显示时，点一下只收起说明，不应点到下面的按钮');
  await buyVia(ctx, 'buy:0', true);
  await waitIdle(ctx, '触屏买入');
  await tap(ctx, 'open');
  await waitIdle(ctx, '触屏开盘', 'window.__game.state().dayIndex === 1');
  await ctx.page.context().close();
}

/**
 * 按钮只认在自己身上按下的那一下（ui/clickGuard.ts）：按在空处、滑到「开盘」上松手不算点击；
 * 按住「开盘」时整块界面重画（按钮销毁重建）再松手，点击照样生效。单开一页，不受前面触屏长按的影响。
 */
export async function pressRebuildShots(browser: Browser): Promise<void> {
  const ctx = await openPage(browser, 'press-rebuild', `seed=touch-2&anim=0&${setupQuery(BASIC_SETUP)}`);
  const open = await point(ctx, 'open');
  const slots = await state<string>(ctx, 'JSON.stringify(s.slots.map((h) => h && h.stockId))');
  await ctx.page.mouse.move(open.x, open.y - 140);
  await ctx.page.mouse.down();
  await ctx.page.mouse.move(open.x, open.y, { steps: 4 });
  await ctx.page.mouse.up();
  await ctx.page.waitForTimeout(400);
  expect((await state<number>(ctx, 's.dayIndex')) === 0, '按在别处、松手才落到「开盘」上，不应开盘');
  expect((await state<string>(ctx, 'JSON.stringify(s.slots.map((h) => h && h.stockId))')) === slots, '滑过去不应拖动持仓（按下处应是空处）');
  await waitIdle(ctx, '滑过之后');
  await ctx.page.mouse.move(open.x, open.y);
  await ctx.page.mouse.down();
  await ctx.page.evaluate(() => window.__game?.loadState(window.__game.state()));
  await waitIdle(ctx, '按着时重画');
  await ctx.page.mouse.up();
  await waitIdle(ctx, '重画后松手开盘', 'window.__game.state().dayIndex === 1');
  await ctx.page.context().close();
}
