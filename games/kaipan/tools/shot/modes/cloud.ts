// 冒烟模式 --cloud：0.5.7 云存档（云朵的未登录 / 已合并 / 待上传，假平台接口）
import type { Browser, Route } from 'playwright-core';
import { emptyProfile } from '../../../src/platform/profile.ts';
import { presetProfile } from '../../../src/debug/profiles.ts';
import { profileStorage } from '../fakes.ts';
import { PHONE, click, controls, expect, hover, longPress, openPage, presence, shot, tap, waitFor, type Ctx } from '../harness.ts';

// ---------------------------------------------------------------- 0.5.7 云存档

/**
 * 云朵的几种状态（假平台接口，不连真的平台）：
 * - 没有登录提示 cookie：一个 /api 请求都不发，云朵"未登录"，点一下去 /login?from=kaipan；
 * - 云端有别的设备的进度：合并后"已合并"，开始菜单按合并后的档案重画，交上去的请求带 X-Arcade、baseRev 是云端的 rev、不带 last；
 * - /api/me 说存档暂停：云朵"待上传"，悬停说明平台在歇口气。
 */
export async function cloudShots(browser: Browser): Promise<void> {
  const local = presetProfile('partial').profile;
  const remote = { ...emptyProfile(), runs: local.runs + 40, maxDifficulty: 8 };
  const apiCalls: { method: string; path: string; body: unknown; headers: Record<string, string> }[] = [];
  const fake = (saves: 'ok' | 'paused', cloudSaves = [{ slot: 'profile', rev: 3, updatedAt: 1, data: remote as unknown }]) => async (route: Route): Promise<void> => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    apiCalls.push({ method: req.method(), path, body: req.postDataJSON() as unknown, headers: req.headers() });
    if (path === '/api/me') return route.fulfill({ json: { user: { id: 'smoke-user', username: 'smoke', displayName: '冒烟' }, service: 'ok', saves } });
    if (req.method() === 'GET' && path === '/api/saves/kaipan') return route.fulfill({ json: { saves: cloudSaves } });
    if (req.method() === 'PUT') return route.fulfill({ json: { rev: 4, updatedAt: 2 } });
    return route.fulfill({ status: 404, json: { error: 'not_found', message: '没有找到' } });
  };
  const cloudState = (ctx: Ctx): Promise<string> => ctx.page.evaluate(() => window.__game?.cloud().state ?? '');
  {
    const reqs: string[] = [];
    const ctx = await openPage(browser, 'cloud-out', '', { storage: profileStorage('partial'), requests: reqs, touch: PHONE });
    expect((await cloudState(ctx)) === 'out', '没登录时云朵应是"未登录"');
    expect(!reqs.some((u) => u.includes('/api/')), `没有登录提示 cookie 时不该调 /api：${reqs.filter((u) => u.includes('/api/')).join(', ')}`);
    await shot(ctx, 'c1-cloud-out');
    await ctx.page.route('**/login*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>login</title>' }));
    if (PHONE) await tap(ctx, 'cloud');
    else await click(ctx, 'cloud');
    await ctx.page.waitForURL('**/login?from=kaipan', { timeout: 5000 });
    await ctx.page.context().close();
  }
  {
    const ctx = await openPage(browser, 'cloud-merged', '', { storage: profileStorage('partial'), api: fake('ok'), loginHint: true, touch: PHONE });
    await waitFor(ctx, '云朵"已合并"', `window.__game?.cloud().state === 'merged'`);
    const me = apiCalls.findIndex((c) => c.path === '/api/me');
    const get = apiCalls.findIndex((c) => c.path === '/api/saves/kaipan');
    expect(me >= 0 && get > me, '应先调 /api/me 再取存档');
    const put = apiCalls.find((c) => c.method === 'PUT' && c.path === '/api/saves/kaipan/profile');
    expect(!!put, '合并后应把档案交上去');
    if (put) {
      const body = put.body as { baseRev: number; data: { runs: number; last: string; maxDifficulty: number } };
      expect(put.headers['x-arcade'] === '1', '写请求要带 X-Arcade: 1');
      expect(body.baseRev === 3, `baseRev 应是云端的 3，实际 ${body.baseRev}`);
      expect(body.data.runs === remote.runs && body.data.maxDifficulty === 8 && body.data.last === '', '交上去的应是合并后的档案、不带 last');
    }
    const runs = await ctx.page.evaluate(() => window.__game?.profile().runs ?? -1);
    expect(runs === remote.runs, `本地档案应换成合并后的（局数 ${remote.runs}），实际 ${runs}`);
    await ctx.page.waitForTimeout(400);
    await shot(ctx, 'c2-cloud-merged');
    const c = (await controls(ctx)).cloud;
    expect(!!c, '开始菜单上应有云朵');
    if (c) {
      if (PHONE) await longPress(ctx, 'cloud');
      else await hover(ctx, c.x, c.y);
      await shot(ctx, 'c2b-cloud-merged-tip');
    }
    await ctx.page.context().close();
  }
  {
    // 本机没有档案、云端有：直接用云端的，什么都不用传 → 已同步
    apiCalls.length = 0;
    presence.length = 0;
    const ctx = await openPage(browser, 'cloud-synced', '', { noProfile: true, api: fake('ok'), loginHint: true, touch: PHONE });
    await waitFor(ctx, '云朵"已同步"', `window.__game?.cloud().state === 'synced'`);
    // 0.12.0 社交：登录了就报一次"在玩开盘"
    for (let i = 0; i < 20 && !presence.length; i++) await ctx.page.waitForTimeout(250);
    expect(presence.some((b) => JSON.parse(b).place === 'game' && JSON.parse(b).game === 'kaipan'), `应报位置"在玩开盘"（${presence.join(' | ')}）`);
    // 冒烟打开页面时总会写一份教程进度（关着），那一槽照常传；档案不该传
    expect(!apiCalls.some((c) => c.method === 'PUT' && c.path.endsWith('/profile')), '本机没有档案时不该上传档案');
    await ctx.page.waitForTimeout(400);
    await shot(ctx, 'c4-cloud-synced');
    await ctx.page.context().close();
  }
  {
    apiCalls.length = 0;
    const ctx = await openPage(browser, 'cloud-paused', '', { storage: profileStorage('partial'), api: fake('paused'), loginHint: true, touch: PHONE });
    await waitFor(ctx, '云朵"待上传"', `window.__game?.cloud().state === 'pending'`);
    expect(!apiCalls.some((c) => c.path.startsWith('/api/saves')), '存档暂停时不该再调存档接口');
    const c = (await controls(ctx)).cloud;
    if (c) {
      if (PHONE) await longPress(ctx, 'cloud');
      else await hover(ctx, c.x, c.y);
    }
    await shot(ctx, 'c3-cloud-paused-tip');
    await ctx.page.context().close();
  }
}
