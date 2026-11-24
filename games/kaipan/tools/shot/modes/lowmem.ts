// --lowmem 模式：省内存设备（iPhone 8 Plus、iPad Pro 的触屏配置）
import type { Browser } from 'playwright-core';
import { BASIC_SETUP, controls, expect, notes, openPage, setupQuery, shot, toPage, waitIdle } from '../harness.ts';

// ---------------------------------------------------------------- 省内存设备

/**
 * iOS 上内存超了网页进程会崩（"网页已崩溃"）。触屏设备的渲染倍数封顶 2（用 2 倍图集）、整屏背景按 1 倍光栅化：
 * 按 iPhone 8 Plus（DPR 3）和 iPad Pro（1366×1024@2）的触屏配置打开，断言倍数、图集、显存估算不超预算，截图看清不清楚。
 */
export async function lowMemShots(browser: Browser): Promise<void> {
  /** 纹理 + 文字画布 + 主画布，每像素 4 字节；修之前约 390–870 MB，修之后约 170 MB */
  const BUDGET_MB = 260;
  const devices = [
    { name: 'iphone8plus', screen: { width: 736, height: 414, dpr: 3 } },
    { name: 'ipadpro', screen: { width: 1366, height: 1024, dpr: 2 } },
  ];
  // 看得见的高度比屏幕小 80（iOS Safari 横屏带着地址栏、标签栏）：画布按看得见的铺，顶上的按钮都在里面
  {
    const visible = { width: 667, height: 375 - 80 };
    const ctx = await openPage(browser, 'lowmem-toolbar', `seed=pre-1&anim=0&${setupQuery(BASIC_SETUP)}`, { touch: true, screen: { width: 667, height: 375, dpr: 2 }, visible });
    await waitIdle(ctx, 'trade', "window.__game.scene === 'trade'");
    await ctx.page.waitForTimeout(500);
    const c = await controls(ctx);
    for (const k of ['settings', 'help', 'tab:msgs', 'tab:recs', 'tab:board']) {
      const p = c[k];
      expect(!!p, `顶部应有控件 ${k}`);
      if (!p) continue;
      const q = await toPage(ctx, p.x, p.y);
      expect(q.y >= 0 && q.y <= visible.height && q.x >= 0 && q.x <= visible.width, `${k} 应在看得见的区域里（${Math.round(q.x)},${Math.round(q.y)}，可见 ${visible.width}×${visible.height}）`);
    }
    const box = await ctx.page.locator('canvas').boundingBox();
    expect(!!box && box.y >= 0 && box.y + box.height <= visible.height + 1, `画布应在看得见的区域里（${JSON.stringify(box)}）`);
    await shot(ctx, 'm-toolbar-trade');
    // 双指放大（visualViewport.scale = 2，看得见的宽高减半）：画布不跟着缩、不抖
    const before = { box: await ctx.page.locator('canvas').boundingBox(), h: await ctx.page.evaluate(() => document.documentElement.style.getPropertyValue('--app-h')) };
    await ctx.page.evaluate(() => {
      const vv = window.visualViewport!;
      const w = vv.width;
      const h = vv.height;
      Object.defineProperty(vv, 'scale', { configurable: true, get: () => 2 });
      Object.defineProperty(vv, 'width', { configurable: true, get: () => w / 2 });
      Object.defineProperty(vv, 'height', { configurable: true, get: () => h / 2 });
      vv.dispatchEvent(new Event('resize'));
    });
    await ctx.page.waitForTimeout(600);
    const after = { box: await ctx.page.locator('canvas').boundingBox(), h: await ctx.page.evaluate(() => document.documentElement.style.getPropertyValue('--app-h')) };
    expect(JSON.stringify(after) === JSON.stringify(before), `双指放大时画布不该变（${JSON.stringify(before)} → ${JSON.stringify(after)}）`);
    // WebGL 上下文丢了：很快恢复就不提示；3 秒没恢复才提示一条，恢复后收起
    const banners = (): Promise<number> => ctx.page.evaluate(() => document.querySelectorAll('.kp-banner').length);
    const lose = await ctx.page.evaluate(() => {
      const gl = document.querySelector('canvas')?.getContext('webgl2') ?? document.querySelector('canvas')?.getContext('webgl');
      const ext = gl?.getExtension('WEBGL_lose_context');
      if (!ext) return false;
      (window as unknown as { __lose: WEBGL_lose_context }).__lose = ext;
      ext.loseContext();
      return true;
    });
    if (lose) {
      await ctx.page.waitForTimeout(300);
      await ctx.page.evaluate(() => (window as unknown as { __lose: WEBGL_lose_context }).__lose.restoreContext());
      await ctx.page.waitForTimeout(3500);
      expect((await banners()) === 0, '上下文很快恢复时不该提示');
      await ctx.page.evaluate(() => (window as unknown as { __lose: WEBGL_lose_context }).__lose.loseContext());
      await ctx.page.waitForTimeout(3500);
      expect((await banners()) === 1, `3 秒没恢复应提示一条（${await banners()}）`);
      await ctx.page.evaluate(() => (window as unknown as { __lose: WEBGL_lose_context }).__lose.restoreContext());
      await ctx.page.waitForTimeout(500);
      expect((await banners()) === 0, '恢复后提示应收起');
    } else notes.push('这个浏览器没有 WEBGL_lose_context，跳过上下文丢失的检查');
    await ctx.page.context().close();
  }
  // iOS Safari：开始菜单底下「添加到主屏幕玩更大」，点 × 关掉后记住、不再出现
  {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1';
    const ctx = await openPage(browser, 'lowmem-hometip', '', { touch: true, screen: { width: 667, height: 375, dpr: 2 }, userAgent: ua });
    await waitIdle(ctx, 'title', "window.__game.scene === 'title'");
    const tip = ctx.page.locator('#home-tip');
    expect(await tip.isVisible(), 'iOS Safari 的开始菜单应提示添加到主屏幕');
    await shot(ctx, 'm-home-tip');
    await tip.locator('button').tap();
    expect(!(await tip.isVisible()), '点 × 应关掉提示');
    expect((await ctx.page.evaluate(() => localStorage.getItem('kaipan.homeTip.off'))) === '1', '关掉后应记在 kaipan.homeTip.off');
    await ctx.page.reload();
    await waitIdle(ctx, 'title', "window.__game.scene === 'title'");
    expect(!(await tip.isVisible()), '关掉过就不再提示');
    await ctx.page.context().close();
  }
  for (const d of devices) {
    for (const [scene, query] of [['title', ''], ['trade', `seed=pre-1&anim=0&${setupQuery(BASIC_SETUP)}`]] as const) {
      const ctx = await openPage(browser, `lowmem-${d.name}-${scene}`, query, { touch: true, screen: d.screen });
      await waitIdle(ctx, scene, `window.__game.scene === '${scene}'`);
      await ctx.page.waitForTimeout(800);
      const r = await ctx.page.evaluate(() => {
        const g = window.__game!;
        const a = g.atlas() as unknown as Record<string, { status: string }>;
        return { scale: g.renderScale, game: a.game?.status, meta: a.meta?.status, mem: g.memory() };
      });
      const mb = Math.round(((r.mem.texturePx + r.mem.textPx + r.mem.canvasPx) * 4) / 1e6);
      notes.push(`省内存设备 ${d.name} ${scene}：渲染 ${r.scale} 倍，图集 ${r.game}/${r.meta}，估算 ${mb} MB（纹理 ${r.mem.textures} 个）`);
      expect(r.scale === 2, `${d.name}：触屏设备渲染倍数应封顶 2（实际 ${r.scale}）`);
      expect(r.game === 'used', `${d.name}：应用 2 倍图集（实际 ${r.game}）`);
      expect(mb <= BUDGET_MB, `${d.name} ${scene}：显存估算 ${mb} MB 超过预算 ${BUDGET_MB} MB`);
      await shot(ctx, `m-${d.name}-${scene}`);
      await ctx.page.context().close();
    }
  }
}
