/** 冒烟分段：serviceStates（npm run smoke -- --only=<段名>，段名表在 tools/smoke.ts） */
import type { Browser, Route } from 'playwright-core';
import { GAMES } from '../../../shared/games.ts';
import { BASE, check, expectHttp, shot, newPage, json } from '../lib/core.ts';
import { meTab, openMeSection, savesRow } from './me-tabs.ts';
import { EMPTY_POLL, fakeLoginHint, FAKE_USER, FAKE_WALLET, mockSession } from '../lib/fakes.ts';

export async function serviceStates(browser: Browser): Promise<void> {
  console.log('只读档：写按钮灰掉，云存档标暂停；一个游戏的存档读不到不连累别的');
  {
    const { ctx, page } = await newPage(browser, '只读档');
    // 这一版 /api/me 不带 registration
    await mockSession(page, { me: { service: 'readonly', saves: 'paused', registration: undefined } });
    // 每个登记了的游戏都要模拟：漏一个就是真请求，回 401 会把假登录当成失效。掼蛋那份读不到
    const broken = 'guandan';
    for (const g of GAMES) {
      await page.route(`**/api/saves/${g.id}`, (r) =>
        r.fulfill(g.id === broken ? json({ error: 'internal', message: '服务器出错了，过一会儿再试' }, 500) : json({ saves: [] })),
      );
    }
    expectHttp(500, `/api/saves/${broken}`);
    await page.goto(`${BASE}/me`);
    await page.locator('.banner', { hasText: '服务器有点忙，现在只能看、不能改' }).waitFor();
    await meTab(page, 'saves');
    await page.getByTestId('saves-paused').waitFor();
    for (const g of GAMES) await (await savesRow(page, g.id)).getByText(g.id === broken ? '服务器出错了' : '还没有存档').waitFor();
    for (const [title, button] of [
      ['改昵称', '保存'],
      ['改密码', '改密码'],
      ['换一个恢复码', '换恢复码'],
      ['退出其他设备', '退出其他设备'],
    ] as const) {
      const d = await openMeSection(page, title);
      check(await d.getByRole('button', { name: button }).isDisabled(), `只读档时"${title}"的按钮应该灰掉`);
    }
    await meTab(page, 'profile'); // 退出登录在"资料"页签
    check(!(await page.getByRole('button', { name: '退出登录' }).isDisabled()), '只读档时退出登录照常能点');
    await shot(page, 'readonly');
    await ctx.close();
  }

  console.log('停服档（接口回 busy）：提示休息，不叫人去登录，右上角不放入口');
  {
    const { ctx, page } = await newPage(browser, '停服档');
    await page.route('**/api/me', (r) => r.fulfill(json({ error: 'busy', message: '服务器有点忙，明天再来' }, 503)));
    expectHttp(503, '/api/me');
    await fakeLoginHint(page);
    await page.goto(`${BASE}/me`);
    await page.locator('.banner', { hasText: '账号服务暂时休息' }).waitFor();
    await page.getByText('账号服务暂时休息，过一会儿再来看').waitFor();
    check((await page.getByRole('link', { name: '去登录' }).count()) === 0, '停服档不该叫人去登录');
    check((await page.locator('.account').count()) === 0, '停服档右上角不该有登录入口');
    await shot(page, 'banner-off');
    await ctx.close();
  }

  console.log('连不上：断网、网关回的非 JSON 503 都算"连不上"（不算停服），点"重试"恢复');
  for (const [what, handler, status] of [
    ['断网', (r: Route) => r.abort('internetdisconnected'), 0],
    ['网关出错页', (r: Route) => r.fulfill({ status: 503, contentType: 'text/html', body: '<html><body>error code: 1027</body></html>' }), 503],
  ] as const) {
    const { ctx, page } = await newPage(browser, `连不上（${what}）`);
    await page.route('**/api/me', handler);
    // 网络层面的失败会再试 2 次（session.tsx），一共 3 次
    if (status) for (let i = 0; i < 3; i++) expectHttp(status, '/api/me');
    await fakeLoginHint(page);
    await page.goto(`${BASE}/me`);
    await page.locator('.banner', { hasText: '连不上服务器' }).waitFor();
    check((await page.locator('.banner', { hasText: '账号服务暂时休息' }).count()) === 0, `${what}不该被当成停服`);
    check((await page.getByRole('link', { name: '去登录' }).count()) === 0, `${what}时不该叫人去登录`);
    if (what === '断网') await shot(page, 'unreachable');
    await page.unroute('**/api/me');
    await page.route('**/api/me', (r) => r.fulfill(json({ user: FAKE_USER, service: 'ok', saves: 'ok' })));
    await page.route('**/api/wallet', (r) => r.fulfill(json(FAKE_WALLET)));
    await page.route('**/api/presence', (r) => r.fulfill({ status: 204 }));
    await page.route('**/api/invites', (r) => r.fulfill(json(EMPTY_POLL)));
    await page.route('**/api/friends/overtakes', (r) => r.fulfill(json({ overtakes: [] })));
    await page.route('**/api/feed', (r) => r.fulfill(json({ items: [] })));
    await page.route('**/api/saves/*', (r) => r.fulfill(json({ saves: [] })));
    await page.route('**/api/invite-codes', (r) => r.fulfill(json({ quota: 3, taken: 0, left: 3, todayLeft: 5, ttlDays: 7, codes: [] })));
    await page.getByRole('button', { name: '重试' }).click();
    await page.locator('.account__name', { hasText: '某人' }).waitFor();
    await page.getByRole('heading', { name: '我的账号' }).waitFor();
    await ctx.close();
  }
}

// ---------- 主程序 ----------
