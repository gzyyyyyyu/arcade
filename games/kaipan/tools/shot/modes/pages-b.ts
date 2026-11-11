// --pages-b 模式：页面细节 B（开局面板、设置的分组和「恢复默认」、三选一卡悬停）
import type { Browser } from 'playwright-core';
import { createRun, rewardView } from '../../../src/core/index.ts';
import { BASIC_SETUP, click, controls, dialogOpen, expect, loadState, PHONE, openPage, shot, step, tap, toPage, type Ctx } from '../harness.ts';

/**
 * 页面细节 B（--pages-b，加 --phone 跑手机尺寸）：开局面板和每日挑战面板的遮罩盖住标题页那排按钮、设置面板分组和「恢复默认」、
 * 三选一卡静止和悬停倾斜时大数字完整。
 */
export async function pagesBShots(browser: Browser): Promise<void> {
  const screen = PHONE ? undefined : { width: 1280, height: 800, dpr: 1 };
  const press = (ctx: Ctx, key: string): Promise<void> => (PHONE ? tap(ctx, key) : click(ctx, key));
  {
    // 开局面板、每日挑战：遮罩做实，面板边上看不到标题页的按钮
    const ctx = await openPage(browser, 'pb-setup', 'anim=0', { ...(screen ? { screen } : {}), touch: PHONE });
    await ctx.page.waitForTimeout(500);
    await press(ctx, 'new');
    await dialogOpen(ctx, 'setup:start');
    await shot(ctx, 'pb1-setup');
    await ctx.page.keyboard.press('Escape');
    await ctx.page.waitForTimeout(300);
    await press(ctx, 'daily');
    await dialogOpen(ctx, 'daily:start');
    await shot(ctx, 'pb2-daily');
    await ctx.page.context().close();
  }
  // 设置：电脑 1280×800 和手机横屏 844×390 各走一遍；分组小标题；「恢复默认」点两下才恢复，设置和画面偏好都回默认值
  for (const phone of [false, true]) {
    const tag = phone ? 'm' : 'd';
    const act = (ctx: Ctx, key: string): Promise<void> => (phone ? tap(ctx, key) : click(ctx, key));
    const prefs = JSON.stringify({ hints: 'off', recap: 'brief', bill: 'quick', autoQuiet: false });
    const ctx = await openPage(browser, `pb-settings-${tag}`, phone ? 'anim=0&layout=phone' : 'anim=0', {
      screen: phone ? { width: 844, height: 390, dpr: 2 } : { width: 1280, height: 800, dpr: 1 },
      touch: phone,
      settings: { masterVolume: 0.2, muted: true, animSpeed: 4, colorScheme: 'intl' },
      storage: { 'kaipan.view.prefs': prefs },
    });
    await ctx.page.waitForTimeout(500);
    await act(ctx, 'settings');
    await dialogOpen(ctx, 'settings:done');
    await shot(ctx, `pb3${tag}-settings`);
    expect('settings:reset' in (await controls(ctx)), '设置里应有「恢复默认」');
    const saved = (): Promise<{ s: Record<string, unknown>; v: Record<string, unknown> }> =>
      ctx.page.evaluate(() => ({ s: JSON.parse(localStorage.getItem('kaipan.settings') ?? '{}'), v: JSON.parse(localStorage.getItem('kaipan.view.prefs') ?? '{}') }));
    await act(ctx, 'settings:reset');
    await ctx.page.waitForTimeout(300);
    expect((await saved()).s.masterVolume !== 0.8, '点一下「恢复默认」不该马上恢复');
    // 手机 2 倍屏截图慢，会超过「再点一次」的 3 秒，只在电脑上截这一张
    if (!phone) await shot(ctx, `pb4${tag}-settings-confirm`);
    await act(ctx, 'settings:reset');
    await ctx.page.waitForTimeout(400);
    const after = await saved();
    expect(after.s.masterVolume === 0.8 && after.s.muted === false && after.s.animSpeed === 1 && after.s.colorScheme === 'cn', `点两下应恢复设置默认值（${JSON.stringify(after.s)}）`);
    expect(after.v.recap === 'full' && after.v.bill === 'stage' && after.v.hints === 'auto' && after.v.autoQuiet === true, `画面偏好也该回默认（${JSON.stringify(after.v)}）`);
    await shot(ctx, `pb5${tag}-settings-reset`);
    if (phone) {
      await act(ctx, 'settings:tab-1');
      await ctx.page.waitForTimeout(200);
      await shot(ctx, 'pb6m-settings-tab1');
    }
    await ctx.page.context().close();
  }
  if (PHONE) return;
  {
    // 三选一卡：静止、悬停抬起倾斜各截一张，看中间那张的大数字有没有被截
    let s = createRun('rhythm-reward-0', BASIC_SETUP).state;
    for (let i = 0; i < 40 && s.phase !== 'reward'; i++) {
      s = createRun(`rhythm-reward-${i}`, BASIC_SETUP).state;
      for (let k = 0; k < 120 && s.phase !== 'reward'; k++) {
        if (s.phase === 'won' || s.phase === 'lost') break;
        s = step(s).state;
      }
    }
    expect(s.phase === 'reward', '找不到三选一的局面');
    const kinds = rewardView(s).map((r) => r.kind);
    const pick = kinds[1] !== undefined && kinds[1] !== 'stock' ? 1 : kinds.findIndex((k) => k !== 'stock');
    expect(pick >= 0, '三张都是股票卡');
    const ctx = await openPage(browser, 'pb-reward', 'speed=1', { screen: screen! });
    await loadState(ctx, s);
    await ctx.page.waitForTimeout(900);
    await shot(ctx, 'pb7-reward-still');
    const c = (await controls(ctx))[`reward:${pick}`]!;
    const p = await toPage(ctx, c.x + 20, c.y - 130);
    await ctx.page.mouse.move(p.x - 60, p.y);
    await ctx.page.mouse.move(p.x, p.y, { steps: 6 });
    await ctx.page.waitForTimeout(350);
    await shot(ctx, 'pb8-reward-hover');
    await ctx.page.context().close();
  }
}
