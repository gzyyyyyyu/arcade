// --lobby 模式：回大厅（开始菜单、对局里、结束页、竖屏提示层）
import type { Browser } from 'playwright-core';
import { botByName, playRun } from '../../bots.ts';
import { BASIC_SETUP, buyVia, click, controls, dialogOpen, expect, loadState, PHONE, openPage, setupQuery, shot, state, tap, waitFor, waitIdle, type Ctx } from '../harness.ts';
import { profileStorage } from '../fakes.ts';

// ---------------------------------------------------------------- 回大厅

/**
 * 「大厅」跳平台首页 `/`：只断言地址（拦下 / 的请求，回一页空白），不加载平台的页面。
 * 开始菜单左上角直接走；对局里齿轮 → 回大厅先确认（取消留在这局）；竖屏提示层左上角，对局中先在卡片里问一次。
 */
export async function lobbyShots(browser: Browser): Promise<void> {
  const atLobby = async (ctx: Ctx, why: string): Promise<void> => {
    try {
      await ctx.page.waitForURL((u) => u.pathname === '/' && u.search === '', { timeout: 5000 });
    } catch {
      expect(false, `${why}：应跳到大厅 /（现在是 ${ctx.page.url()}）`);
    }
  };
  // 拦下大厅（游戏页带着查询参数打开，地址不会和大厅一样）
  const stubLobby = (ctx: Ctx): Promise<void> => ctx.page.route((u) => u.pathname === '/' && u.search === '', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>lobby</title>' }));
  const press = (ctx: Ctx, key: string): Promise<void> => (PHONE ? tap(ctx, key) : click(ctx, key));
  {
    // 开始菜单：左上角「大厅」，不在一局里，点了直接走
    const ctx = await openPage(browser, 'lobby-title', PHONE ? '' : 'layout=desktop', { touch: PHONE });
    expect('lobby' in (await controls(ctx)), '开始菜单应有「大厅」');
    await shot(ctx, 'l1-title-lobby', { x: 0, y: 0, width: PHONE ? 422 : 640, height: PHONE ? 195 : 360 });
    await stubLobby(ctx);
    await press(ctx, 'lobby');
    await atLobby(ctx, '开始菜单点「大厅」');
    await ctx.page.context().close();
  }
  {
    // 对局里：齿轮 → 回大厅 → 确认框；取消留在这局，确认才走
    const ctx = await openPage(browser, 'lobby-run', `seed=pre-1&anim=0&${setupQuery(BASIC_SETUP)}`, { touch: PHONE });
    // 左上角常驻的「大厅」：同一个确认框，取消留在这局
    expect('lobby' in (await controls(ctx)), '交易界面左上角应有「大厅」');
    await shot(ctx, 'l1b-trade-lobby', { x: 0, y: 0, width: PHONE ? 422 : 640, height: PHONE ? 195 : 200 });
    await press(ctx, 'lobby');
    await dialogOpen(ctx, 'confirm:ok');
    await press(ctx, 'confirm:cancel');
    await ctx.page.waitForTimeout(300);
    expect((await ctx.page.evaluate(() => window.__game?.scene)) === 'trade', '左上角「大厅」取消后应留在这局');
    await press(ctx, 'settings');
    await dialogOpen(ctx, 'settings:lobby');
    await shot(ctx, 'l2-settings-lobby');
    await press(ctx, 'settings:lobby');
    await dialogOpen(ctx, 'confirm:ok');
    await shot(ctx, 'l3-lobby-confirm');
    await press(ctx, 'confirm:cancel');
    await ctx.page.waitForTimeout(300);
    expect((await ctx.page.evaluate(() => window.__game?.scene)) === 'trade' && new URL(ctx.page.url()).search !== '', '取消后应留在这局');
    // 取消后还能接着玩：买一只
    const held = 's.slots.filter((x) => x).length';
    const before = await state<number>(ctx, held);
    await buyVia(ctx, 'buy:0', PHONE);
    await waitIdle(ctx, '取消回大厅后买入');
    expect((await state<number>(ctx, held)) === before + 1, '取消回大厅后应能接着买');
    // 改过设置（平淡日改手动，关掉设置框时要重建画面）再点回大厅：确认框也得出来
    await press(ctx, 'settings');
    await dialogOpen(ctx, 'settings:lobby');
    if (!('settings:quiet-manual' in (await controls(ctx)))) await press(ctx, 'settings:tab-1');
    await ctx.page.waitForTimeout(200);
    await press(ctx, 'settings:quiet-manual');
    await press(ctx, 'settings:lobby');
    await dialogOpen(ctx, 'confirm:ok');
    // 取消：这时再按改过的设置重建画面，还在这局
    await press(ctx, 'confirm:cancel');
    await waitIdle(ctx, '取消后重建画面');
    await ctx.page.waitForTimeout(300);
    expect((await ctx.page.evaluate(() => window.__game?.scene)) === 'trade', '改过设置后取消回大厅，应留在这局');
    await stubLobby(ctx);
    await press(ctx, 'settings');
    await dialogOpen(ctx, 'settings:lobby');
    await press(ctx, 'settings:lobby');
    await dialogOpen(ctx, 'confirm:ok');
    await press(ctx, 'confirm:ok');
    await atLobby(ctx, '对局里确认回大厅');
    await ctx.page.context().close();
  }
  {
    // 结束页：左上角「大厅」直接走（这局已经结束、记进档案了）
    const ended = playRun('lobby-end', botByName('smart'), { persona: 'newbie', difficulty: 1 });
    const ctx = await openPage(browser, 'lobby-end', PHONE ? '' : 'layout=desktop', { storage: profileStorage('partial'), touch: PHONE });
    await loadState(ctx, ended);
    await waitIdle(ctx, '结束页', "window.__game.scene === 'end'");
    // 成就、解锁弹窗一个接一个弹：等着一个个关掉
    for (let k = 0; k < 8; k++) {
      try {
        await waitFor(ctx, '达成弹窗', "'unlock:ok' in g.controls()");
      } catch {
        break;
      }
      await ctx.page.waitForTimeout(300);
      await press(ctx, 'unlock:ok');
      await ctx.page.waitForTimeout(400);
    }
    expect('lobby' in (await controls(ctx)), '结束页应有「大厅」');
    await shot(ctx, 'l5-end-lobby');
    await stubLobby(ctx);
    await press(ctx, 'lobby');
    await atLobby(ctx, '结束页点「大厅」');
    await ctx.page.context().close();
  }
  if (!PHONE) {
    // 转屏提示层：竖屏版开局后横过来（竖屏打开就是竖屏版，方向和版面不一致才提示）；
    // 一局进行中，点「大厅」先在卡片里问；「留下」收起，「回大厅」才走
    const ctx = await openPage(browser, 'lobby-portrait', `seed=pre-1&anim=0&${setupQuery(BASIC_SETUP)}`, { touch: true, screen: { width: 390, height: 844, dpr: 2 } });
    await ctx.page.waitForTimeout(600);
    await ctx.page.setViewportSize({ width: 844, height: 390 });
    const lobby = ctx.page.locator('#rotate-hint .rh-lobby');
    await lobby.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
    expect(await lobby.isVisible(), '转屏提示层左上角应有「大厅」');
    await lobby.tap();
    expect(await ctx.page.locator('#rotate-hint .rh-ask').isVisible(), '一局进行中点「大厅」应先问一次');
    await shot(ctx, 'l4-portrait-lobby-ask');
    await ctx.page.locator('#rotate-hint .rh-ask button', { hasText: '留下' }).tap();
    expect(!(await ctx.page.locator('#rotate-hint .rh-ask').isVisible()), '点「留下」应收起');
    await stubLobby(ctx);
    await lobby.tap();
    await ctx.page.locator('#rotate-hint .rh-go').tap();
    await atLobby(ctx, '竖屏提示层确认回大厅');
    await ctx.page.context().close();
  }
}
