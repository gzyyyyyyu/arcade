/** 冒烟分段：loginNext（npm run smoke -- --only=<段名>，段名表在 tools/smoke.ts） */
import type { Browser, Route } from 'playwright-core';
import { BASE, check, expectHttp, shot, newPage, json } from '../lib/core.ts';
import { FAKE_USER, FAKE_WALLET } from '../lib/fakes.ts';

/** 游戏"叫朋友来"，没登录的朋友带 next 去登录，登录后带着房间码回到游戏；不合格的 next 不认，按 from 回游戏首页。 */
export async function loginNext(browser: Browser): Promise<void> {
  console.log('登录出错的提示：网关 429（带 Retry-After）、平台 429、502、断网都有一句话，按钮恢复能点');
  console.log('登录页带 next：登录后回到 /games/texas/?room=123456；next 是外站时不认，按 from 回游戏');
  const { ctx, page } = await newPage(browser, '登录 next');
  let loggedIn = false;
  await page.route('**/api/me', (r) => r.fulfill(json({ user: loggedIn ? FAKE_USER : null, service: 'ok', saves: 'ok', registration: 'closed' })));
  // 登录出错时的提示：网关限速回的 429 不是 JSON，不能说成"连不上服务器"；每种都要有一句话，按钮恢复能点
  let failWith: ((r: Route) => Promise<void>) | null = null;
  await page.route('**/api/auth/login', (r) => {
    if (failWith) return failWith(r);
    loggedIn = true;
    return r.fulfill(json({ user: FAKE_USER }));
  });
  await page.goto(`${BASE}/login`);
  await page.getByLabel('用户名').fill('someone');
  await page.getByLabel('密码').fill('password-123');
  for (const [handler, text, status] of [
    [(r: Route) => r.fulfill({ status: 429, contentType: 'text/html', headers: { 'retry-after': '30' }, body: '<html>rate limited</html>' }), '试得太频繁了，稍等一会儿再来（30 秒后）', 429],
    [(r: Route) => r.fulfill(json({ error: 'rate_limited', message: '操作太频繁了，歇一会儿再试', retryAfter: 505 }, 429)), '操作太频繁了，歇一会儿再试（9 分钟后）', 429],
    [(r: Route) => r.fulfill({ status: 502, contentType: 'text/html', body: '<html>bad gateway</html>' }), '连不上服务器，过一会儿再试', 502],
    [(r: Route) => r.abort('internetdisconnected'), '网络不通，检查一下再试', 0],
  ] as const) {
    failWith = handler;
    if (status) expectHttp(status, '/api/auth/login');
    await page.getByRole('button', { name: '登录' }).click();
    await page.getByText(text).waitFor();
    check(await page.getByRole('button', { name: '登录' }).isEnabled(), `登录出错（${text}）后按钮应该能再点`);
    if (status === 429 && text.startsWith('试得')) await shot(page, 'login-429');
  }
  failWith = null;
  await page.route('**/api/wallet', (r) => r.fulfill(json(FAKE_WALLET)));
  // 游戏是另一个 Worker，本地没有：只看跳到了哪里
  await page.route('**/games/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>game</title>' }));
  for (const [query, want] of [
    [`next=${encodeURIComponent('/games/texas/?room=123456')}`, '/games/texas/?room=123456'],
    [`from=texas&next=${encodeURIComponent('//evil.example/games/x')}`, '/games/texas/'],
  ] as const) {
    loggedIn = false;
    await page.goto(`${BASE}/login?${query}`);
    await page.getByLabel('用户名').fill('someone');
    await page.getByLabel('密码').fill('password-123');
    await page.getByRole('button', { name: '登录' }).click();
    await page.waitForURL((u) => u.pathname.startsWith('/games/'));
    const u = new URL(page.url());
    check(u.pathname + u.search === want, `登录后应该到 ${want}，实际 ${u.pathname + u.search}`);
  }
  await ctx.close();
}
