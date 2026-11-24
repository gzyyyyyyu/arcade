/** 冒烟分段：anonymous adminFlow friendsFlow friendFlow（npm run smoke -- --only=<段名>，段名表在 tools/smoke.ts） */
import { join } from 'node:path';
import type { Browser, BrowserContext, Page, Route } from 'playwright-core';
import { ADMIN, NAME, NAME2, PW2, PW3, READABLE, breathe, login, adminSection, pickUser } from '../lib/accounts.ts';
import { BASE, OUT, check, expectHttp, apiCalls, shot, newPage, dismissNextDialog, json } from '../lib/core.ts';
import { meTab, openMeSection, savesRow } from './me-tabs.ts';
import { cardButtonsFit } from '../lib/ui.ts';
import { GAMES } from '../../../shared/games.ts';

export async function anonymous(browser: Browser): Promise<void> {
  console.log('没登录：首页一个 /api 请求都不发，游戏卡片是"登录后玩"；各页面带 CSP');
  const { ctx, page } = await newPage(browser, '没登录');
  const calls = apiCalls(page);
  const res = await page.goto(`${BASE}/`);
  const csp = res?.headers()['content-security-policy'] ?? '';
  for (const part of ["script-src 'self'", "connect-src 'self'", "frame-ancestors 'none'", "base-uri 'none'"]) {
    check(csp.includes(part), `首页的 CSP 缺 ${part}：${csp || '（没有 CSP 头）'}`);
  }
  await page.getByRole('heading', { name: '开盘' }).waitFor();
  const play = page.locator('.card', { hasText: '开盘' }).getByRole('link', { name: '登录后玩' });
  check((await play.getAttribute('href')) === '/login?from=kaipan', '"登录后玩"应该去 /login?from=kaipan');
  check((await page.getByRole('link', { name: '进入游戏' }).count()) === 0, '没登录时不该有"进入游戏"');
  check((await page.locator('.account').textContent()) === '登录', '没登录时右上角是"登录"');
  check((await page.getByRole('link', { name: '管理' }).count()) === 0, '没登录时不该有"管理"');
  check(calls.length === 0, `没登录时首页不该调接口：${calls.join(', ')}`);
  await shot(page, 'home-anon');
  for (const path of ['/me', '/forgot', '/privacy']) {
    const r = await page.goto(`${BASE}${path}`);
    // 单页回退的地址也要带 CSP
    check((r?.headers()['content-security-policy'] ?? '').includes("script-src 'self'"), `${path} 没有 CSP 头`);
  }

  console.log('注册关着（wrangler.jsonc 默认）：登录页只有登录，没有"注册"两个字；直接调注册接口 403');
  await page.goto(`${BASE}/`);
  await Promise.all([page.waitForResponse(`${BASE}/api/me`), play.click()]);
  // 从游戏过来：顶上一句"朋友邀请你来"，下面有"用邀请码注册"
  await page.getByText('朋友邀请你来街机厅。现在是邀请制，找 TA 要个邀请就能玩。').waitFor();
  await page.getByText('登录后回到「开盘」').waitFor();
  await page.getByRole('link', { name: '用邀请码注册' }).waitFor();
  check(new URL(page.url()).search === '?from=kaipan', `点"登录后玩"应该带上 from：${page.url()}`);
  // 有一个"用邀请码注册"的链接；没有的是"注册"页签和注册表单
  check((await page.getByRole('link', { name: '注册', exact: true }).count()) === 0, '注册关着时登录页不该有"注册"页签');
  check((await page.getByRole('heading', { name: '注册' }).count()) === 0, '注册关着时登录页不该有注册表单');
  await shot(page, 'login-invite');
  await Promise.all([page.waitForResponse(`${BASE}/api/me`), page.goto(`${BASE}/login?tab=register`)]);
  await page.getByText('现在只对受邀的朋友开放').waitFor();
  check((await page.getByRole('heading', { name: '注册' }).count()) === 0, '注册关着时 ?tab=register 也不该出现注册表单');
  expectHttp(403, '/api/auth/register');
  const reg = await page.evaluate(async () => {
    const r = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'x-arcade': '1', 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'nobody_here', password: 'Whatever-Pass-1', displayName: '路人' }),
    });
    return [r.status, ((await r.json()) as { error: string }).error] as const;
  });
  check(reg[0] === 403 && reg[1] === 'registration_closed', `注册关着时接口应该回 403 registration_closed：${reg.join(' ')}`);

  console.log('没登录打开好友链接：叫人先登录，登录后回到这个链接');
  await page.goto(`${BASE}/f/ABCD2345`);
  await page.getByText('登录后才能加好友').waitFor();
  check((await page.getByRole('link', { name: '去登录' }).getAttribute('href')) === '/login?from=f%2FABCD2345', '好友链接的"去登录"应该带上 from');
  await Promise.all([page.waitForResponse(`${BASE}/api/me`), page.getByRole('link', { name: '去登录' }).click()]);
  await page.getByText('登录后回到刚才那一页').waitFor();
  // 从好友链接来、注册关着：顶上说是朋友叫你来的
  await page.getByText('朋友邀请你来街机厅。现在是邀请制，找 TA 要个邀请就能玩。').waitFor();

  console.log('邀请链接 /i/<码>：注册关着也给注册表单，码已经填好');
  await Promise.all([page.waitForResponse(`${BASE}/api/me`), page.goto(`${BASE}/i/ABCD2345EFGH`)]);
  await page.getByRole('heading', { name: '注册' }).waitFor();
  check((await page.locator('input[name="inviteCode"]').inputValue()) === 'ABCD2345EFGH', '邀请链接应该预填好码');
  check(new URL(page.url()).pathname === '/login', `邀请链接应该换成注册页：${page.url()}`);
  await shot(page, 'invite-link-register');

  console.log('没登录进 /admin：回首页');
  await page.goto(`${BASE}/admin`);
  await page.waitForURL(`${BASE}/`);
  await page.getByRole('heading', { name: '开盘' }).waitFor();
  check(calls.every((c) => c === 'GET /api/me' || c === 'POST /api/auth/register'), `没登录时只该问 /api/me：${calls.join(', ')}`);
  await ctx.close();
}

export async function adminFlow(browser: Browser, adminPw: string): Promise<void> {
  const admin = await newPage(browser, '管理员', 'desktop', { permissions: ['clipboard-read', 'clipboard-write'] });
  const page = admin.page;
  await login(page, ADMIN, adminPw);

  console.log('管理员：右上角有"管理"；建号时弱密码 422，留空自动生成');
  await page.getByRole('link', { name: '管理' }).click();
  await page.getByTestId('admin-overview').waitFor();
  await adminSection(page, '钱包统计');

  console.log('管理页的筹码统计表；钱包：新号看到 10,000、还没建行，余额够时领补给 409，浏览器没有带入的路');
  const stats = page.getByTestId('wallet-stats');
  await stats.getByText('10-14').waitFor();
  await stats.getByText('1,234,567').waitFor();
  await stats.locator('.per-game li', { hasText: '开盘 带入 4,000 · 带回 6,000 · 退回 0' }).waitFor();
  expectHttp(409, '/api/wallet/relief');
  expectHttp(404, '/api/wallet/buyin');
  const wallet = await page.evaluate(async () => {
    const post = (path: string) => fetch(path, { method: 'POST', headers: { 'x-arcade': '1', 'content-type': 'application/json' }, body: '{}' });
    const r = await fetch('/api/wallet');
    const relief = await post('/api/wallet/relief');
    const buy = await post('/api/wallet/buyin');
    return {
      status: r.status,
      body: (await r.json()) as { wallet: { balance: number; fresh: boolean } },
      relief: [relief.status, ((await relief.json()) as { error: string }).error],
      buy: buy.status,
    };
  });
  check(wallet.status === 200 && wallet.body.wallet.balance === 10_000 && wallet.body.wallet.fresh, `新号的钱包不对：${JSON.stringify(wallet)}`);
  check(wallet.relief[0] === 409 && wallet.relief[1] === 'relief_not_needed', `余额够时领补给应该 409：${JSON.stringify(wallet.relief)}`);
  check(wallet.buy === 404, `浏览器不该有带入的路：${wallet.buy}`);
  await shot(page, 'admin-wallet-stats');

  console.log('管理员开关注册：默认关着；点了先确认，取消不改；打开后 /api/me 马上是 open，再关回去');
  await adminSection(page, '设置');
  const sw = page.getByTestId('registration-switch');
  await sw.getByText('现在：只邀请').waitFor();
  await sw.getByText('还没改过（默认关着）').waitFor();
  const regOf = () => page.evaluate(async () => ((await (await fetch('/api/me')).json()) as { registration: string }).registration);
  const asked = dismissNextDialog(page);
  await sw.getByRole('button', { name: '打开注册' }).click();
  check((await asked) === 'confirm', '打开注册前应该先确认一次');
  check((await regOf()) === 'closed', '取消了确认，注册不该被打开');
  page.once('dialog', (d) => void d.accept());
  await sw.getByRole('button', { name: '打开注册' }).click();
  await sw.getByText('现在：开放注册').waitFor();
  await sw.getByText(/^上次改动：/).waitFor();
  check((await regOf()) === 'open', '打开注册后 /api/me 应该马上是 open');
  await shot(page, 'admin-registration-open');
  page.once('dialog', (d) => void d.accept());
  await sw.getByRole('button', { name: '关闭注册' }).click();
  await sw.getByText('现在：只邀请').waitFor();
  check((await regOf()) === 'closed', '关闭注册后 /api/me 应该马上是 closed');
  await adminSection(page, '用户');
  await (await pickUser(page, ADMIN)).getByText('你自己的密码去"我的账号"改').waitFor();
  await page.getByTestId('new-user').click();
  await page.getByLabel('用户名').fill(NAME);
  await page.getByLabel('昵称').fill('冒烟小王');
  await page.getByLabel('密码').fill('password1');
  expectHttp(422, '/api/admin/users');
  await page.getByRole('button', { name: '建号', exact: true }).click();
  await page.getByText('密码太简单了').waitFor();
  await page.getByLabel('密码').fill('');
  await page.getByRole('button', { name: '建号', exact: true }).click();
  await page.getByRole('heading', { name: '账号建好了' }).waitFor();
  const pw1 = (await page.getByTestId('cred-password').textContent())!.trim();
  const rc1 = (await page.getByTestId('cred-recovery').textContent())!.trim();
  check(READABLE.test(pw1), `生成的密码不像"3 个词 + 2 位数字"：${pw1}`);
  check((await page.getByTestId('cred-username').textContent()) === NAME, '卡片上的用户名不对');
  const done = page.getByRole('button', { name: '好了' });
  check(await done.isDisabled(), '没勾"已经发给对方了"之前不能关卡片');
  await page.getByRole('button', { name: '复制成一段话' }).click();
  await page.getByRole('button', { name: '已复制' }).waitFor();
  const msg = await page.evaluate(() => navigator.clipboard.readText());
  for (const line of [`游戏地址：${BASE}`, `用户名：${NAME}`, `密码：${pw1}`, `恢复码：${rc1}`, '登录后可以在"我的账号"改密码', '恢复码是聊天发给你的，登录后可以在"我的账号"换一个新的']) {
    check(msg.includes(line), `复制的那段话里缺"${line}"：\n${msg}`);
  }
  await shot(page, 'admin-created');
  // 离开提醒：点右上角、后退都先问；点"取消"留在原地
  let kind = dismissNextDialog(page);
  await page.locator('.account', { hasText: '冒烟阿国' }).click();
  check((await kind) === 'confirm', '密码卡片没勾之前点别的链接应该先确认');
  kind = dismissNextDialog(page);
  await page.goBack();
  check((await kind) === 'confirm', '密码卡片没勾之前后退应该先确认');
  await page.getByTestId('cred-password').waitFor();
  await page.getByLabel('已经发给对方了').check();
  await done.click();
  await page.getByTestId(`user-${NAME}`).waitFor();

  console.log('重名 409；给了密码时卡片上显示的就是那个密码');
  await page.getByTestId('new-user').click();
  await page.getByLabel('用户名').fill(NAME);
  await page.getByLabel('昵称').fill('撞名的人');
  expectHttp(409, '/api/admin/users');
  await page.getByRole('button', { name: '建号', exact: true }).click();
  await page.getByText('这个用户名已经有人用了').waitFor();
  await page.getByLabel('用户名').fill(NAME2);
  await page.getByLabel('昵称').fill('要删的号');
  await page.getByLabel('密码').fill(PW3);
  await page.getByRole('button', { name: '建号', exact: true }).click();
  await page.getByRole('heading', { name: '账号建好了' }).waitFor();
  check((await page.getByTestId('cred-password').textContent()) === PW3, '给了密码时卡片上应该是那个密码');
  await page.getByLabel('已经发给对方了').check();
  await done.click();
  await page.getByTestId(`user-${NAME2}`).waitFor();
  await shot(page, 'admin-list');

  console.log('朋友用管理员给的密码登录：首页能进游戏；没有"管理"；进不了 /admin');
  const friend = await newPage(browser, '朋友', 'desktop', { permissions: ['clipboard-read', 'clipboard-write'] });
  await login(friend.page, NAME, pw1);
  const enter = friend.page.locator('.card', { hasText: '开盘' }).getByRole('link', { name: '进入游戏' });
  check((await enter.getAttribute('href')) === '/games/kaipan/', '登录后"进入游戏"应该指向 /games/kaipan/');
  check((await friend.page.getByRole('link', { name: '管理' }).count()) === 0, '普通用户不该看到"管理"');
  await shot(friend.page, 'friend-home');
  // 大厅卡片只有一个"进入游戏"，铺满卡片正文宽；好友房在游戏里开、进，标签照旧写"好友房"
  console.log('每张能玩的卡片只有一个"进入游戏"，指向游戏首页、铺满卡片；同一行卡片的按钮一样高；没有"好友房"按钮');
  for (const [name, path] of [['牌馆', '/games/guandan/'], ['德州扑克', '/games/texas/'], ['雀馆', '/games/mahjong/'], ['飞驰', '/games/racing/'], ['夜巡', '/games/yexun/'], ['弹里个弹', '/games/danli/'], ['海岛', '/games/haidao/']] as const) {
    const card = friend.page.locator('.card', { hasText: name });
    const links = card.getByRole('link');
    check((await links.count()) === 1, `${name}卡片上应该只有一个按钮，实际 ${await links.count()} 个`);
    check((await links.first().getAttribute('href')) === path, `${name}"进入游戏"应该指向 ${path}`);
  }
  const texas = friend.page.locator('.card', { hasText: '德州扑克' });
  check((await texas.locator('.card__tags').getByText('好友房', { exact: true }).count()) === 1, '德州卡片上的标签还写着"好友房"');
  await cardButtonsFit(friend.page, '大厅');
  for (const img of await friend.page.locator('.card__cover').all()) {
    await img.scrollIntoViewIfNeeded();
    await img.evaluate((el: HTMLImageElement) => el.decode());
    const w = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
    // srcset 按屏幕挑：一倍屏的短卡拿 400 宽的小图，高分屏拿 800 宽的原图；两种都算画出来了
    check(w >= 400, `封面没画出来：${await img.getAttribute('src')}，宽 ${w}`);
  }
  await texas.scrollIntoViewIfNeeded();
  await shot(friend.page, 'home-texas');
  await friend.page.evaluate(() => window.scrollTo(0, 0));
  // 本地没有掼蛋的 Worker，平台对 /games/* 回 404，这里只看跳到了哪
  expectHttp(404, '/games/guandan/');
  await Promise.all([friend.page.waitForURL(`${BASE}/games/guandan/`), friend.page.locator('.card', { hasText: '掼蛋' }).getByRole('link', { name: '进入游戏' }).click()]);
  await friend.page.goto(`${BASE}/`);
  await friend.page.goto(`${BASE}/admin`);
  await friend.page.waitForURL(`${BASE}/`);
  check((await friend.page.getByRole('heading', { name: '给朋友建个账号' }).count()) === 0, '普通用户进不了管理界面');

  console.log('管理员重设朋友的密码（顺便换恢复码）：朋友那边会话失效，旧密码登不上，新密码能登');
  const row = await pickUser(page, NAME);
  await row.getByRole('button', { name: '重设密码' }).click();
  await row.getByLabel('恢复码也换一个').check();
  await shot(page, 'admin-reset-form');
  await row.locator('form').getByRole('button', { name: '重设密码' }).click();
  await page.getByRole('heading', { name: '密码重设好了' }).waitFor();
  const pw2 = (await page.getByTestId('cred-password').textContent())!.trim();
  const rc2 = (await page.getByTestId('cred-recovery').textContent())!.trim();
  check(READABLE.test(pw2) && pw2 !== pw1 && rc2 !== rc1, '重设后应该是新的密码和恢复码');
  await shot(page, 'admin-reset-card');
  await page.getByLabel('已经发给对方了').check();
  await done.click();
  await friend.page.goto(`${BASE}/me`);
  await friend.page.getByRole('link', { name: '去登录' }).waitFor();
  await friend.page.goto(`${BASE}/login`);
  await friend.page.getByLabel('用户名').fill(NAME);
  await friend.page.getByLabel('密码').fill(pw1);
  expectHttp(401, '/api/auth/login');
  await friend.page.getByRole('button', { name: '登录' }).click();
  await friend.page.getByText('用户名或密码不对').waitFor();
  await friend.page.getByLabel('密码').fill(pw2);
  await friend.page.getByRole('button', { name: '登录' }).click();
  await friend.page.locator('.account__name', { hasText: '冒烟小王' }).waitFor();

  console.log('管理员删号：要先勾确认；删完列表里没了');
  const row2 = await pickUser(page, NAME2);
  await row2.getByRole('button', { name: '删号' }).click();
  const del = row2.locator('form').getByRole('button', { name: '删号' });
  check(await del.isDisabled(), '没勾确认之前不能删号');
  await row2.getByLabel(/确定删掉「要删的号」/).check();
  await shot(page, 'admin-delete');
  await del.click();
  await page.getByText(`已经删掉「要删的号」（${NAME2}）`).waitFor();
  // 提示先出来，列表随后重读：等这一行消失（5 秒内不消失就算失败）
  await page.getByTestId(`user-${NAME2}`).waitFor({ state: 'detached', timeout: 5_000 });

  await friendsFlow(page, friend.page);
  await admin.ctx.close();

  await friendFlow(browser, friend.ctx, friend.page, pw2, rc2);
}

/** 好友：管理员（a）和朋友（b）互加、屏蔽、解除、拒绝、换好友码。 */
async function friendsFlow(a: Page, b: Page): Promise<void> {
  console.log('好友：朋友的好友页有好友码和链接，复制链接');
  await b.getByRole('link', { name: '好友', exact: true }).click();
  await b.getByRole('heading', { name: '我的好友码' }).waitFor();
  const code = (await b.getByTestId('my-friend-code').textContent())!.trim();
  const link = (await b.getByTestId('my-friend-link').textContent())!.trim();
  check(link === `${BASE}/f/${code}`, `分享链接不对：${link}`);
  // 电脑上（没有系统分享）是一个大按钮"复制我的好友链接"
  await b.getByTestId('share-link').click();
  await b.getByTestId('share-link').getByText('已复制，发给朋友吧').waitFor();
  check((await b.evaluate(() => navigator.clipboard.readText())) === link, '复制的不是好友链接');
  await b.getByText('还没有好友').waitFor();
  await shot(b, 'friends-empty');

  console.log('管理员打开好友链接：看到昵称（没有用户名），点"加好友"');
  await a.goto(link);
  await a.getByText('冒烟小王').waitFor();
  check((await a.getByText(NAME).count()) === 0, '好友链接页不该显示对方的用户名');
  await a.getByRole('button', { name: '加好友' }).click();
  await a.getByText('已发送，等对方接受').waitFor();
  await shot(a, 'friend-link-sent');

  console.log('朋友接受：两边都在好友列表里，都开着大厅，显示绿点和"在大厅"（社交 1.2）');
  await b.reload();
  const req = b.getByTestId('person-冒烟阿国');
  await req.getByText('想加你为好友').waitFor();
  await shot(b, 'friends-incoming');
  await req.getByRole('button', { name: '接受' }).click();
  await b.getByRole('heading', { name: '好友（1）' }).waitFor();
  await b.getByTestId('person-冒烟阿国').getByText('在大厅').waitFor();
  await a.getByRole('link', { name: '好友', exact: true }).click();
  await a.getByTestId('person-冒烟小王').getByText('在大厅').waitFor();
  check((await a.getByTestId('person-冒烟小王').locator('.people__online').count()) === 1, '在线的好友该有绿点');
  await shot(a, 'friends-list');

  console.log('朋友在"我的"关掉"让好友看到我在哪"：管理员那边只剩"今天来过"，再打开恢复');
  await b.goto(`${BASE}/me`);
  await meTab(b, 'privacy');
  await b.getByTestId('show-where').uncheck();
  await b.getByText('好友只看到你几天前来过').waitFor();
  await shot(b, 'me-show-where-off');
  await a.reload();
  await a.getByTestId('person-冒烟小王').getByText('今天来过').waitFor();
  check((await a.getByTestId('person-冒烟小王').locator('.people__online').count()) === 0, '关了开关不该有绿点');
  await b.getByTestId('show-where').check();
  await b.getByText('好友在好友页能看到你在不在线').waitFor();
  // 好友动态的开关，关了再开（真接口）
  await b.getByTestId('show-feed').uncheck();
  await b.getByText('不再生成你的动态，已有的好友也看不到。').waitFor();
  await b.getByTestId('show-feed').check();
  await b.getByText('好友点顶栏的「动态」能看到你最近 7 天的动态').waitFor();
  await b.goto(`${BASE}/friends`);

  console.log('管理员叫朋友来掼蛋房（真接口）：朋友顶上弹一条、"好友"带红点，点"不了"收起');
  const friendId = await b.evaluate(async () => ((await (await fetch('/api/me')).json()) as { user: { id: string } }).user.id);
  const sent = await a.evaluate(
    async (to) => (await fetch('/api/invites', { method: 'POST', headers: { 'x-arcade': '1', 'content-type': 'application/json' }, body: JSON.stringify({ to, game: 'guandan', room: '123456' }) })).status,
    friendId,
  );
  check(sent === 200, `发邀请该回 200（${sent}）`);
  await b.reload();
  await b.getByTestId('invite-bar').getByText('冒烟阿国').waitFor();
  await b.getByTestId('invite-dot').waitFor();
  await shot(b, 'invite-bar');
  await b.getByTestId('invite-bar').getByRole('button', { name: '不了' }).click();
  await b.getByTestId('invite-bar').waitFor({ state: 'detached' });
  await b.reload();
  await b.getByRole('heading', { name: '好友（1）' }).waitFor();
  check((await b.getByTestId('invite-bar').count()) === 0, '点了"不了"刷新后不该再弹');
  check((await b.getByTestId('invite-dot').count()) === 0, '点了"不了"刷新后顶栏"好友"的红点该消失');

  console.log('朋友屏蔽管理员：要先勾确认；好友没了，屏蔽的人里有');
  const row = b.getByTestId('person-冒烟阿国');
  await row.getByRole('button', { name: '屏蔽' }).click();
  const blockBtn = row.locator('.people__confirm').getByRole('button', { name: '屏蔽' });
  check(await blockBtn.isDisabled(), '没勾确认之前不能屏蔽');
  await row.getByLabel(/确定屏蔽「冒烟阿国」/).check();
  await shot(b, 'friends-block-confirm');
  await blockBtn.click();
  await b.getByRole('heading', { name: '好友（0）' }).waitFor();
  await b.getByRole('heading', { name: '屏蔽的人（1）' }).waitFor();
  await shot(b, 'friends-blocked');

  console.log('被屏蔽的管理员看不出来：再打开链接照常能发，显示"已发送"；朋友那边收不到');
  await a.goto(link);
  await a.getByRole('button', { name: '加好友' }).click();
  await a.getByText('已发送，等对方接受').waitFor();
  await b.reload();
  await b.getByRole('heading', { name: '屏蔽的人（1）' }).waitFor();
  check((await b.getByRole('heading', { name: /想加你的人/ }).count()) === 0, '屏蔽的人发来的请求不该显示');

  console.log('解除屏蔽后请求重新出现；拒绝');
  await b.getByTestId('person-冒烟阿国').getByRole('button', { name: '解除屏蔽' }).click();
  await b.getByRole('heading', { name: '想加你的人（1）' }).waitFor();
  await b.getByTestId('person-冒烟阿国').getByRole('button', { name: '拒绝' }).click();
  // 列表随后重读：等"想加你的人"那一块消失（5 秒内）
  await b.getByRole('heading', { name: /想加你的人/ }).waitFor({ state: 'detached', timeout: 5_000 });

  console.log('坏编码的好友链接：显示"没找到"，页面不崩');
  expectHttp(404, '/api/friends/code/%25E0');
  await a.goto(`${BASE}/f/%E0`);
  await a.getByText('没有找到这个好友码').waitFor();

  console.log('朋友换好友码：旧链接失效');
  await b.getByText('换一个好友码').click();
  await b.getByRole('button', { name: '换好友码' }).click();
  await b.getByText('换好了').waitFor();
  const code2 = (await b.getByTestId('my-friend-code').textContent())!.trim();
  check(code2 !== code && /^[0-9A-HJKMNP-TV-Z]{8}$/.test(code2), `新好友码不对：${code2}`);
  expectHttp(404, `/api/friends/code/${code}`);
  await a.goto(link);
  await a.getByText('没有找到这个好友码').waitFor();
  await shot(a, 'friend-link-missing');
}

/**
 * 打开"我的"并等它把每个游戏的云存档都读回来。页面一打开就并发读各游戏的存档，紧接着退出或注销的话，
 * 晚到的那几个请求会吃 401（CI 上见过 /api/saves/haidao，排在最后的游戏），冒烟就当成没声明的错误。
 * 存档行一开始就画着"读取中"，等不了它，只能在打开之前先挂上每个响应。
 */
async function openMe(page: Page, open: () => Promise<unknown>): Promise<void> {
  const saves = GAMES.map((g) => page.waitForResponse((r) => new URL(r.url()).pathname === `/api/saves/${g.id}`));
  await Promise.all([...saves, open()]);
}

/** 朋友的"我的账号"：资料、云存档、改密码、换恢复码、退出、找回、注销。 */
async function friendFlow(browser: Browser, ctx: BrowserContext, page: Page, pw1: string, rc1: string): Promise<void> {
  const calls = apiCalls(page);

  console.log('已经登录着、从游戏点"登录"过来：给"回到开盘"');
  await page.goto(`${BASE}/login?from=kaipan`);
  await page.getByRole('link', { name: '回到开盘' }).waitFor();
  check((await page.getByRole('link', { name: '回到开盘' }).getAttribute('href')) === '/games/kaipan/', '"回到开盘"应该指向 /games/kaipan/');
  await shot(page, 'login-already');

  console.log('我的账号：资料、云存档（模拟游戏存一份）');
  await page.evaluate(async () => {
    const r = await fetch('/api/saves/kaipan/profile', {
      method: 'PUT',
      headers: { 'x-arcade': '1', 'content-type': 'application/json' },
      body: JSON.stringify({ baseRev: 0, data: { runs: 3, best: '股神', tutorial: true } }),
    });
    if (r.status !== 200) throw new Error(`存档失败 ${r.status}`);
  });

  console.log('排行榜（模拟游戏交分、读榜；没有界面）：真的 D1 上迁移和路由都通');
  // 每日榜只收北京时间昨天到明天的，按真实时间算今天
  const today = `daily-${new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)}-classic`;
  const board = await page.evaluate(async (boardId) => {
    const post = (score: number) =>
      fetch('/api/scores', {
        method: 'POST',
        headers: { 'x-arcade': '1', 'content-type': 'application/json' },
        body: JSON.stringify({ gameId: 'kaipan', boardId, score }),
      }).then((r) => r.json());
    const first = await post(120);
    const lower = await post(80);
    const read = await fetch(`/api/boards/kaipan/${boardId}?scope=friends`).then((r) => r.json());
    return { first, lower, read };
  }, today);
  check(JSON.stringify(board.first) === '{"best":120,"improved":true}', `第一次交分不对：${JSON.stringify(board.first)}`);
  check(JSON.stringify(board.lower) === '{"best":120,"improved":false}', `更低的分不该覆盖：${JSON.stringify(board.lower)}`);
  check(board.read.me?.rank === 1 && board.read.entries?.[0]?.isMe === true && !('username' in board.read.entries[0]), `读榜不对：${JSON.stringify(board.read)}`);

  await page.getByTitle('我的账号').click();
  await page.getByRole('heading', { name: '我的账号' }).waitFor();
  await (await savesRow(page, 'kaipan')).getByText(/^已存 1 份/).waitFor();
  await (await savesRow(page, 'guandan')).getByText('还没有存档').waitFor();
  await shot(page, 'me');

  console.log('邀请朋友（真接口）：生成一个码、列表里有码和"分享/复制链接"，撤回后额度回来');
  await meTab(page, 'invite');
  await page.getByTestId('invite-left').getByText('还能邀请 3 个').waitFor();
  await page.getByTestId('invite-create').click();
  const code = (await page.getByTestId('invite-code').locator('.code-mid').textContent()) ?? '';
  check(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(code), `邀请码的样子不对：${code}`);
  await page.getByTestId('invite-left').getByText('还能邀请 2 个').waitFor();
  await shot(page, 'me-invite');
  await page.getByTestId('invite-code').getByRole('button', { name: '撤回' }).click();
  await page.getByText('已撤回').waitFor();
  await page.getByTestId('invite-left').getByText('还能邀请 3 个').waitFor();

  console.log('改昵称；写接口的 429、503、断网提示（浏览器里模拟）');
  let d = await openMeSection(page, '改昵称');
  await d.getByLabel('改昵称').fill('冒烟老王');
  await d.getByRole('button', { name: '保存' }).click();
  await d.getByText('改好了').waitFor();
  await page.locator('.account__name', { hasText: '冒烟老王' }).waitFor();
  check(await d.getByRole('button', { name: '保存' }).isDisabled(), '昵称没改时"保存"该是灰的');
  const patchOnly = (handle: (r: Route) => Promise<void>) => (r: Route) => (r.request().method() === 'PATCH' ? handle(r) : r.continue());
  for (const [what, handler, text, status] of [
    ['429', patchOnly((r) => r.fulfill(json({ error: 'rate_limited', message: '操作太频繁，过一会儿再试', retryAfter: 120 }, 429))), '操作太频繁，过一会儿再试（2 分钟后）', 429],
    ['503', patchOnly((r) => r.fulfill(json({ error: 'busy', message: '服务器有点忙，明天再来' }, 503))), '服务器有点忙，明天再来', 503],
    ['断网', patchOnly((r) => r.abort('internetdisconnected')), '网络不通，检查一下再试', 0],
  ] as const) {
    await page.route('**/api/me', handler);
    if (status) expectHttp(status, '/api/me');
    // 和现在的昵称一样时"保存"是灰的：每次换个名字
    await d.getByLabel('改昵称').fill(`冒烟老王${what}`);
    await d.getByRole('button', { name: '保存' }).click();
    await d.getByText(text).waitFor();
    if (what === '429') await shot(page, 'rename-429');
    await page.unroute('**/api/me');
  }

  console.log('改密码：先输错一次（401，提示"密码不对"），再改成功');
  d = await openMeSection(page, '改密码');
  await d.getByLabel('现在的密码').fill('Wrong-Pass-000');
  await d.getByLabel('新密码').fill(PW2);
  expectHttp(401, '/api/account/password');
  await d.getByRole('button', { name: '改密码' }).click();
  await d.getByText('密码不对', { exact: true }).waitFor();
  await shot(page, 'change-password-wrong');
  await d.getByLabel('现在的密码').fill(pw1);
  await d.getByRole('button', { name: '改密码' }).click();
  await d.getByText('改好了，别的设备都已退出').waitFor();

  console.log('换恢复码：复制、存图；没存好时点链接、后退、整页跳走、点"退出登录"都先确认，点"取消"人还登录着、码还在');
  d = await openMeSection(page, '换一个恢复码');
  await d.getByLabel('现在的密码').fill(PW2);
  await d.getByRole('button', { name: '换恢复码' }).click();
  const codeEl = d.getByTestId('recovery-code');
  await codeEl.waitFor();
  const code2 = (await codeEl.textContent())!.trim();
  check(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/.test(code2) && code2 !== rc1, `新恢复码格式不对或没变：${code2}`);
  check(await d.getByRole('button', { name: '好了' }).isDisabled(), '没勾"我已经存好了"之前不能继续');
  await d.getByRole('button', { name: '复制', exact: true }).click();
  await d.getByRole('button', { name: '已复制' }).waitFor();
  check((await page.evaluate(() => navigator.clipboard.readText())) === code2, '复制到剪贴板的不是恢复码');
  // 存成图片：浏览器里现画，下载下来放进截图目录，人工看一眼（这一步也在 CSP 下）
  const [download] = await Promise.all([page.waitForEvent('download'), d.getByRole('button', { name: '存成图片' }).click()]);
  check(download.suggestedFilename() === `恢复码-${NAME}.png`, `图片文件名不对：${download.suggestedFilename()}`);
  await download.saveAs(join(OUT, 'recovery-code-image.png'));
  console.log(`  图片 ${join(OUT, 'recovery-code-image.png')}`);
  let kind = dismissNextDialog(page);
  await page.getByRole('link', { name: '隐私说明' }).click();
  check((await kind) === 'confirm', '恢复码没存好就点链接应该先确认');
  await codeEl.waitFor();
  kind = dismissNextDialog(page);
  await page.goBack();
  check((await kind) === 'confirm', '恢复码没存好时后退应该先确认');
  await codeEl.waitFor();
  kind = dismissNextDialog(page);
  await page.evaluate(() => {
    location.href = '/privacy';
  });
  check((await kind) === 'beforeunload', '恢复码没存好时整页跳走应该有 beforeunload 提醒');
  await page.waitForTimeout(300);
  check(new URL(page.url()).pathname === '/me', `取消离开后应该还在我的账号：${page.url()}`);
  // 复审 A：先问再退出。点"取消"时不该发出退出请求，人还登录着，码还在
  const logouts = () => calls.filter((c) => c === 'POST /api/auth/logout').length;
  const before = logouts();
  // 退出登录在"资料"页签；切过去再回来，没存好的码还在（安全页签只藏不卸）
  await meTab(page, 'profile');
  kind = dismissNextDialog(page);
  if (await page.getByTestId('me-tab-profile').count()) await meTab(page, 'profile'); // 退出登录在"资料"页签
  await page.getByRole('button', { name: '退出登录' }).click();
  check((await kind) === 'confirm', '恢复码没存好时点"退出登录"应该先确认');
  await page.waitForTimeout(300);
  check(logouts() === before, '点了"取消"却还是发了退出请求');
  await meTab(page, 'safe');
  await codeEl.waitFor();
  await page.locator('.account__name', { hasText: '冒烟老王' }).waitFor();
  await shot(page, 'new-recovery-code');
  await d.getByLabel('我已经存好了').check();
  await d.getByRole('button', { name: '好了' }).click();

  console.log('退出其他设备；被退出的那台设备再操作：401，页面变成"去登录"，cookie 被清掉');
  const other = await newPage(browser, '另一台设备');
  await login(other.page, NAME, PW2);
  await other.page.goto(`${BASE}/me`);
  const od = await openMeSection(other.page, '改昵称');
  // 另一台设备登录后还在后台同步云存档、问邀请和钱包：等这些都回来再退出它，不然晚到的请求先吃 401，页面提前变成"去登录"
  await other.page.waitForLoadState('networkidle');
  d = await openMeSection(page, '退出其他设备');
  await d.getByLabel('现在的密码').fill(PW2);
  await d.getByRole('button', { name: '退出其他设备' }).click();
  await d.getByText('别的设备都已退出').waitFor();
  await od.getByLabel('改昵称').fill('冒烟小李');
  expectHttp(401, '/api/me');
  await od.getByRole('button', { name: '保存' }).click();
  await other.page.getByRole('link', { name: '去登录' }).waitFor();
  check((await other.page.locator('.account').textContent()) === '登录', '会话失效后右上角回到"登录"');
  check(!(await other.ctx.cookies(BASE)).some((c) => c.name === '__Host-arcade_li' && c.value), '401 之后登录提示 cookie 应该被清掉');
  await shot(other.page, 'session-expired');
  await other.ctx.close();

  console.log('没有离开提醒时退出登录：不问，直接回首页');
  kind = dismissNextDialog(page);
  if (await page.getByTestId('me-tab-profile').count()) await meTab(page, 'profile'); // 退出登录在"资料"页签
  await page.getByRole('button', { name: '退出登录' }).click();
  await page.locator('.account', { hasText: '登录' }).waitFor();
  check((await kind) === 'none', '没有要保存的东西时退出不该弹确认');
  check(!(await ctx.cookies(BASE)).some((c) => c.name === '__Host-sid' && c.value), '退出后会话 cookie 应该清掉');

  // 登录、找回、建号工具都吃同一个 IP 的匿名令牌（每分钟 10 个，5.4），本地所有请求都是一个 IP：
  // 到这里已经用了十来个，后面还有 6 次登录和找回，等它回满再走，免得被 429
  await breathe(page, 40);

  console.log('从游戏来登录：登录后回到游戏（德州的闸门也带 from=texas 过来）');
  await page.goto(`${BASE}/login?from=texas`);
  await page.getByText('登录后回到「德州扑克」').waitFor();
  await page.goto(`${BASE}/login?from=kaipan`);
  await page.getByText('登录后回到「开盘」').waitFor();
  await page.getByLabel('用户名').fill(NAME);
  await page.getByLabel('密码').fill(PW2);
  // 本地没有开盘的 Worker，平台对 /games/* 回 404，这里只看跳到了哪
  expectHttp(404, '/games/kaipan/');
  await Promise.all([page.waitForURL(`${BASE}/games/kaipan/`), page.getByRole('button', { name: '登录' }).click()]);

  console.log('from 是外站网址：不认，回首页');
  await openMe(page, () => page.goto(`${BASE}/me`));
  if (await page.getByTestId('me-tab-profile').count()) await meTab(page, 'profile'); // 退出登录在"资料"页签
  await page.getByRole('button', { name: '退出登录' }).click();
  await page.locator('.account', { hasText: '登录' }).waitFor();
  await page.goto(`${BASE}/login?from=${encodeURIComponent('https://evil.example/')}`);
  check((await page.getByText('登录后回到').count()) === 0, '外站 from 不该显示"回到"');
  await page.getByLabel('用户名').fill(NAME);
  await page.getByLabel('密码').fill(PW2);
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL(`${BASE}/`);
  await page.locator('.account__name').waitFor();
  await openMe(page, () => page.goto(`${BASE}/me`));
  if (await page.getByTestId('me-tab-profile').count()) await meTab(page, 'profile'); // 退出登录在"资料"页签
  await page.getByRole('button', { name: '退出登录' }).click();
  await page.locator('.account', { hasText: '登录' }).waitFor();

  console.log('登录输错密码：提示，不说是哪个错');
  await page.goto(`${BASE}/login`);
  await page.getByLabel('用户名').fill(NAME);
  await page.getByLabel('密码').fill('Wrong-Pass-000');
  expectHttp(401, '/api/auth/login');
  await page.getByRole('button', { name: '登录' }).click();
  await page.getByText('用户名或密码不对').waitFor();
  await shot(page, 'login-wrong');

  console.log('忘了密码：恢复码错时说"用户名或恢复码不对"；用对的重设，复制不了时给提示');
  await page.getByRole('link', { name: '用恢复码找回' }).click();
  await page.getByRole('heading', { name: '忘了密码' }).waitFor();
  await page.getByLabel('用户名').fill(NAME);
  await page.getByLabel('恢复码').fill('AAAAA-AAAAA-AAAAA-AAAAA');
  await page.getByLabel('新密码').fill(PW3);
  expectHttp(401, '/api/auth/recover');
  await page.getByRole('button', { name: '重设密码' }).click();
  await page.getByText('用户名或恢复码不对').waitFor();
  await page.getByLabel('恢复码').fill(code2.toLowerCase().replaceAll('-', ' '));
  await shot(page, 'forgot');
  await page.getByRole('button', { name: '重设密码' }).click();
  await page.getByTestId('recovery-code').waitFor();
  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error('不让用'));
  });
  await page.getByRole('button', { name: '复制', exact: true }).click();
  await page.getByText('复制不了，长按上面的码手动复制').waitFor();
  await shot(page, 'forgot-done');
  await page.getByLabel('我已经存好了').check();
  await page.getByRole('button', { name: '回首页' }).click();
  await page.locator('.account__name', { hasText: '冒烟老王' }).waitFor();

  console.log('注销：恢复码错时说"恢复码不对"；勾选前按钮不能点；注销后回首页，提示只出现一次');
  await openMe(page, () => page.getByTitle('我的账号').click());
  d = await openMeSection(page, '注销账号');
  await d.getByRole('button', { name: '忘了密码？用恢复码' }).click();
  await d.getByLabel('恢复码').fill('AAAAA-AAAAA-AAAAA-AAAAA');
  check(await d.getByRole('button', { name: '注销账号' }).isDisabled(), '没勾"我知道删了就找不回来"之前不能注销');
  await d.getByLabel('我知道删了就找不回来').check();
  expectHttp(401, '/api/account/delete');
  await d.getByRole('button', { name: '注销账号' }).click();
  await d.getByText('恢复码不对', { exact: true }).waitFor();
  await d.getByRole('button', { name: '改用密码' }).click();
  check((await d.getByText('恢复码不对', { exact: true }).count()) === 0, '换成用密码后，恢复码的出错提示应该清掉');
  await d.getByLabel('现在的密码').fill(PW3);
  await shot(page, 'delete');
  await d.getByRole('button', { name: '注销账号' }).click();
  await page.getByText('账号已经注销').waitFor();
  check(!page.url().includes('deleted'), `注销提示显示后应该把 ?deleted=1 从网址里去掉：${page.url()}`);
  check((await page.locator('.account').textContent()) === '登录', '注销后右上角回到"登录"');
  check((await page.getByRole('link', { name: '登录后玩' }).count()) > 0, '注销后游戏卡片回到"登录后玩"');
  await shot(page, 'deleted');
  await page.reload();
  await page.getByRole('heading', { name: '开盘' }).waitFor();
  check((await page.getByText('账号已经注销').count()) === 0, '刷新后注销提示不该再出现');
  // 账号真没了：同样的用户名和密码登不上
  await page.goto(`${BASE}/login`);
  await page.getByLabel('用户名').fill(NAME);
  await page.getByLabel('密码').fill(PW3);
  expectHttp(401, '/api/auth/login');
  await page.getByRole('button', { name: '登录' }).click();
  await page.getByText('用户名或密码不对').waitFor();
  await ctx.close();
}
