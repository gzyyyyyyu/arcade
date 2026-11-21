/** 冒烟分段：mobile（npm run smoke -- --only=<段名>，段名表在 tools/smoke.ts） */
import type { Browser } from 'playwright-core';
import { pickUser } from '../lib/accounts.ts';
import { BASE, check, shot, newPage, json } from '../lib/core.ts';
import { openMeSection, privacyCount, privacyHome } from './me-tabs.ts';
import { mockSession, fakeAdmin, FAKE_FEED, fakeFeedFiles, fakeFriends } from '../lib/fakes.ts';
import { feedLine } from '../lib/ui.ts';

export async function mobile(browser: Browser): Promise<void> {
  console.log('手机竖屏：首页、登录（注册关着/开着）、隐私说明、我的账号、管理界面；可点的地方至少 44 高');
  const { ctx, page } = await newPage(browser, '手机竖屏', 'portrait');
  await page.goto(`${BASE}/`);
  await page.locator('.account').waitFor();
  await shot(page, 'mobile-home');
  const playBox = await page.getByRole('link', { name: '登录后才能玩' }).first().boundingBox();
  check(playBox && playBox.height >= 44, `"登录后才能玩"不到 44 高（${playBox?.height ?? 0}）`);
  await Promise.all([page.waitForResponse(`${BASE}/api/me`), page.goto(`${BASE}/login`)]);
  await page.getByText('现在只对受邀的朋友开放').waitFor();
  await shot(page, 'mobile-login');
  // 以后打开注册时的样子（接口回 open）
  await page.route('**/api/me', (r) => r.fulfill(json({ user: null, service: 'ok', saves: 'ok', registration: 'open' })));
  await page.goto(`${BASE}/login?tab=register`);
  await page.getByRole('heading', { name: '注册' }).waitFor();
  await shot(page, 'mobile-register-open');
  await page.unroute('**/api/me');
  await page.goto(`${BASE}/privacy`);
  await page.getByRole('heading', { name: '我们存了你什么' }).waitFor();
  // 一屏放下：隐私说明按小节分页签、每节翻页，逐节找
  const seen = async (text: string | RegExp) => (await privacyCount(page, text)) > 0;
  check(await seen(/^我们不放广告，也不卖你的数据；除了下面"访问统计"/), '隐私说明里没有"不放广告"');
  check(await seen(/^排行榜：每个榜只留你最好的一次成绩/), '隐私说明里没有排行榜一条');
  check(await seen(/^我们用 Cloudflare 的网站统计，看有多少次访问/), '隐私说明里没有访问统计');
  // 注册开着、关着都成立的说法；不再说"只对受邀的朋友开放"
  check(await seen('有账号、登录后才能玩。注册不一定一直开着，没开的时候，凭朋友给的邀请码注册，或者由管理员给朋友建账号。'), '隐私说明里没有注册那句');
  check((await privacyCount(page, /受邀/, false)) === 0, '隐私说明不该再说"受邀"');
  // 积分和筹码那段（维护者 2026-10-14 定）：免费没充值、没有现金价值、不涉及线下财物、可能清零、包括德州扑克
  await page.getByTestId('ptab-coins').waitFor();
  for (const text of [
    /^这是朋友之间一起玩的娱乐小站：免费，也没有充值。$/,
    /^游戏里的积分、筹码只能在游戏里用，没有任何现金价值：不能买，不能换成钱或东西，不能转给或送给别的玩家，也不设任何奖品。$/,
    /^本站不涉及任何线下的财物或交易。$/,
    /^调整规则或清理数据时，筹码、积分和战绩可能会被清零。$/,
    /^所有游戏都是这样，包括以后新上的游戏。$/,
  ]) {
    check(await seen(text), `隐私说明里没有显示：${text.source}`);
  }
  await privacyHome(page);
  await shot(page, 'mobile-privacy');
  // 用模拟的登录状态打开"我的账号"，量点击区
  // 好友超过了我这周的开盘每日挑战，大厅顶上提一句
  // 好友动态不在大厅占地方，在顶栏"动态"按钮里（细查见 feedPop）
  await mockSession(page, { overtakes: [{ gameId: 'kaipan', board: 'classic', by: { userId: 'f1', displayName: '小明' }, score: 12, mine: 9 }], feed: FAKE_FEED });
  await fakeFeedFiles(page);
  await page.route('**/api/saves/*', (r) => r.fulfill(json({ saves: [] })));
  // 登录后的首页：牌馆卡片只有"进入游戏"，至少 44 高
  await page.goto(`${BASE}/`);
  const overtake = page.getByTestId('nudge-overtake');
  await overtake.getByText('超过了你这周的开盘·经典每日挑战纪录').waitFor();
  check((await overtake.getByRole('link', { name: '去挑战' }).getAttribute('href'))?.startsWith('/games/kaipan/') === true, '"去挑战"该进开盘');
  check((await page.getByTestId('feed-strip').count()) === 0, '大厅不该再有整块的动态');
  await page.getByTestId('feed-button').getByTestId('feed-dot').waitFor();
  await shot(page, 'mobile-home-overtake');
  const guandan = page.locator('.card', { hasText: '掼蛋' });
  const enterBox = await guandan.getByRole('link', { name: '进入游戏' }).boundingBox();
  check(enterBox && enterBox.height >= 44, `首页"进入游戏"不到 44 高（${enterBox?.height ?? 0}）`);
  await guandan.scrollIntoViewIfNeeded();
  await shot(page, 'mobile-home-signed-in');
  await page.goto(`${BASE}/me`);
  await page.getByRole('heading', { name: '我的账号' }).waitFor();
  await openMeSection(page, '注销账号');
  const targets = [
    ...(await page.getByTestId('safe-delete').locator('xpath=..').getByRole('tab').all()),
    page.getByRole('button', { name: '忘了密码？用恢复码' }),
    page.getByRole('link', { name: '隐私说明' }),
  ];
  for (const t of targets) {
    const box = await t.boundingBox();
    check(box && box.height >= 44, `点击区不到 44 高：${await t.textContent()}（${box?.height ?? 0}）`);
  }
  await shot(page, 'mobile-me');
  await ctx.close();

  const adm = await newPage(browser, '手机竖屏管理', 'portrait');
  await fakeAdmin(adm.page);
  await shot(adm.page, 'mobile-admin');
  const row = await pickUser(adm.page, 'a_very_long_name_20');
  check(await adm.page.getByTestId('user-xiaoming_2026').isHidden(), '手机上点进一个人以后列表应该收起来');
  for (const t of await row.locator('.btn').all()) {
    const box = await t.boundingBox();
    check(box && box.height >= 44, `管理界面的按钮不到 44 高：${await t.textContent()}（${box?.height ?? 0}）`);
  }
  await row.getByRole('button', { name: '删号' }).click();
  await row.getByLabel(/确定删掉/).waitFor();
  await shot(adm.page, 'mobile-admin-delete');
  await row.getByRole('button', { name: '返回列表' }).click();
  await adm.page.getByTestId('new-user').click();
  check(await adm.page.getByTestId('user-xiaoming_2026').isHidden(), '手机上点"+ 建号"以后列表应该收起来');
  await adm.page.getByRole('button', { name: '建号', exact: true }).click(); // 必填项空着：浏览器自己拦下，不发请求
  await adm.page.getByLabel('用户名').fill('xiaoming_2026');
  await adm.page.getByLabel('昵称').fill('小明');
  await adm.page.getByRole('button', { name: '建号', exact: true }).click();
  await adm.page.getByRole('heading', { name: '账号建好了' }).waitFor();
  await shot(adm.page, 'mobile-admin-card');
  await adm.ctx.close();

  const fr = await newPage(browser, '手机竖屏好友', 'portrait');
  // 小明在掼蛋房里，有"加入"；有人叫我时顶上一条、顶栏"好友"带红点
  await fakeFriends(fr.page, [{ id: 'inv-0000000000001', from: { id: 'f3', name: '阿花' }, game: 'guandan', room: '654321', until: Date.now() + 600_000 }], FAKE_FEED);
  // 好友按在房间里、在线、最近来过排：小明在第 1 页；手机上列表顶上有约局条，后面的人可能翻到下一页，翻着找完再翻回第 1 页
  await fr.page.getByTestId('person-小明').getByText('在牌馆房里 · 3/4 人').waitFor();
  check(
    (await fr.page.getByTestId('person-小明').getByTestId('join-room').getAttribute('href')) === '/games/guandan/?room=123456',
    '"加入"该指向好友的房间',
  );
  check((await fr.page.getByTestId('join-room').count()) === 1, '只有在房间里的好友才有"加入"');
  const pager = fr.page.getByTestId('friends-paged');
  const flip = async (name: '上一页' | '下一页') => {
    const btn = pager.getByRole('button', { name });
    if (!(await btn.count()) || (await btn.isDisabled())) return false;
    await btn.click();
    return true;
  };
  for (const text of ['昨天来过', '23 天前来过']) {
    while (!(await pager.getByText(text).isVisible()) && (await flip('下一页')));
    await pager.getByText(text).waitFor();
  }
  while (await flip('上一页'));
  await fr.page.getByTestId('person-小明').waitFor();
  await fr.page.getByTestId('invite-bar').getByText('叫你来牌馆').waitFor();
  await fr.page.getByTestId('invite-dot').waitFor();
  await shot(fr.page, 'mobile-friends');
  await fr.page.getByTestId('invite-bar').getByRole('button', { name: '不了' }).click();
  await fr.page.getByTestId('invite-bar').waitFor({ state: 'detached' });
  check((await fr.page.getByTestId('invite-dot').count()) === 0, '点了"不了"红点该消失');
  for (const t of await fr.page.locator('.people .btn').all()) {
    const box = await t.boundingBox();
    check(box && box.height >= 44, `好友页的按钮不到 44 高：${await t.textContent()}（${box?.height ?? 0}）`);
  }
  // 好友动态在动态页：好友页只有一行入口。结回的按平台模板拼、称号读 titles.json；名场面按游戏的模板拼；模板不合格的那条不显示
  check((await fr.page.getByTestId('feed').count()) === 0, '好友页不该再铺动态列表');
  await fr.page.getByTestId('feed-entry').getByText('好友动态 · 2 条新').click();
  await fr.page.waitForURL(`${BASE}/feed`);
  const feed = fr.page.getByTestId('feed');
  await feedLine(feed.getByTestId('feed-item').first(), '小明', '牌馆小档', ['赢了 1.6 份', '称号：双下王']);
  await feedLine(feed.getByTestId('feed-item').nth(1), '阿花', '牌馆', ['一副牌扔了 4 个炸弹']);
  check((await feed.getByTestId('feed-item').count()) === 2, '模板不合格的动态不该显示');
  check((await feed.getByText('<b>').count()) === 0, '模板不能当 HTML');
  await feed.getByTestId('feed-item').nth(1).getByText('你扔了番茄').waitFor();
  const first = feed.getByTestId('feed-item').first();
  await first.getByText('赞 2').waitFor();
  await first.getByRole('button', { name: '扔个道具' }).click();
  await first.getByRole('button', { name: '玫瑰' }).waitFor();
  await shot(fr.page, 'mobile-feed');
  await fr.page.goto(`${BASE}/f/ABCD2345`);
  await fr.page.getByRole('button', { name: '接受，成为好友' }).waitFor();
  await shot(fr.page, 'mobile-friend-link');
  await fr.ctx.close();

  console.log('手机横屏：首页、登录、我的账号、隐私说明、管理界面、好友页');
  const land = await newPage(browser, '手机横屏', 'landscape');
  await land.page.goto(`${BASE}/`);
  await land.page.locator('.account').waitFor();
  await shot(land.page, 'landscape-home');
  await Promise.all([land.page.waitForResponse(`${BASE}/api/me`), land.page.goto(`${BASE}/login`)]);
  await land.page.getByRole('heading', { name: '登录' }).waitFor();
  await shot(land.page, 'landscape-login');
  await mockSession(land.page);
  await land.page.route('**/api/saves/*', (r) => r.fulfill(json({ saves: [] })));
  await land.page.goto(`${BASE}/me`);
  await land.page.getByRole('heading', { name: '我的账号' }).waitFor();
  await shot(land.page, 'landscape-me');
  await land.page.goto(`${BASE}/privacy`);
  await land.page.getByText(/^我们不放广告，也不卖你的数据；除了下面"访问统计"/).waitFor();
  await land.page.getByTestId('ptab-coins').waitFor();
  await shot(land.page, 'landscape-privacy');
  await land.ctx.close();
  const land2 = await newPage(browser, '手机横屏管理', 'landscape');
  await fakeAdmin(land2.page);
  await shot(land2.page, 'landscape-admin');
  await land2.ctx.close();
  const land3 = await newPage(browser, '手机横屏好友', 'landscape');
  await fakeFriends(land3.page);
  await shot(land3.page, 'landscape-friends');
  await land3.ctx.close();
}
