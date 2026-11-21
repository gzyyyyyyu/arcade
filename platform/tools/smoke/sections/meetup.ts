/** 冒烟分段：meetup（npm run smoke -- --only=<段名>，段名表在 tools/smoke.ts） */
import type { Browser } from 'playwright-core';
import { BASE, check, shot, newPage, json } from '../lib/core.ts';
import { FAKE_FRIENDS, fakeFeedFiles, mockSession } from '../lib/fakes.ts';
import { phoneIssues } from '../lib/ui.ts';

/**
 * 约局和在线（docs/social.md 1.6、1.2）：顶栏"好友"上的在线数、约局到点时头像的小点（点了去好友页）；
 * 好友页顶上一条约局：主人在那个游戏的房间里"去"直接进房，还没开就进游戏首页；"约一局"弹窗发出的游戏和时间对；
 * 电脑 1280 和手机竖屏（390、360）一屏放下、顶栏不挤。
 */
export async function meetupFlow(browser: Browser): Promise<void> {
  // 5 分钟后开局：已经在"到点"（开局前 10 分钟起）里
  const soon = Date.now() + 300_000;
  // 北京时间明天 21:00（不管现在几点都落在"明天"）
  const DAY = 86_400_000;
  const tomorrow21 = Math.floor((Date.now() + 8 * 3_600_000) / DAY) * DAY + DAY + 13 * 3_600_000;
  // 小明约的掼蛋快到点了，他正在掼蛋房里；阿花约的德州在明天
  const meetups = [
    { host: { id: 'f1', name: '小明' }, game: 'guandan', at: soon },
    { host: { id: 'f3', name: '阿花' }, game: 'texas', at: tomorrow21 },
  ];
  for (const [label, screen, viewport] of [
    ['desktop', 'desktop', undefined],
    ['portrait', 'portrait', undefined],
    ['360', 'portrait', { width: 360, height: 780 }],
  ] as const) {
    console.log(`约局（${label}）：顶栏在线数和头像小点、好友页的约局、约一局`);
    const { ctx, page } = await newPage(browser, `约局 ${label}`, screen, viewport ? { viewport } : {});
    let poll: Record<string, unknown> = { meetups, mine: null, online: 2 };
    await mockSession(page);
    await page.route('**/api/invites', (r) => r.fulfill(json({ invites: [], ...poll })));
    await fakeFeedFiles(page);
    await page.route('**/api/friends', (r) => r.fulfill(json(FAKE_FRIENDS)));
    await page.route('**/api/blocks', (r) => r.fulfill(json({ blocks: [] })));
    let sent: unknown = null;
    await page.route('**/api/meetup', (r) => {
      sent = r.request().postDataJSON();
      const { game, at } = sent as { game: string; at: number };
      poll = { ...poll, mine: { game, at } };
      return r.fulfill(json({ meetup: { game, at } }));
    });

    await page.goto(`${BASE}/`);
    const count = page.getByTestId('online-count');
    await count.waitFor();
    check((await count.textContent()) === '2', `顶栏"好友"上该写 2 个在线（${await count.textContent()}）`);
    await page.getByTestId('meetup-dot').waitFor();
    check((await page.getByTestId('avatar-link').getAttribute('href')) === '/friends', '约局到点时点头像该去好友页');
    if (screen === 'portrait') {
      const issues = (await phoneIssues(page)).filter((p) => p.startsWith('顶栏'));
      check(issues.length === 0, `手机 ${label} 顶栏：\n  ${issues.join('\n  ')}`);
    }

    await page.getByTestId('avatar-link').click();
    const strip = page.getByTestId('meetups');
    await strip.waitFor();
    const go = strip.getByTestId('meetup-go');
    check((await go.count()) === 2, `好友页该列两个约局（${await go.count()}）`);
    check((await go.first().getAttribute('href')) === '/games/guandan/?room=123456', '小明在掼蛋房里："去"该直接进他的房间');
    check((await go.first().getAttribute('class'))?.includes('btn--primary') === true, '到点的"去"该是主按钮');
    check((await go.nth(1).getAttribute('href')) === '/games/texas/', '阿花还没开桌："去"该进德州首页');
    await strip.getByText('明天').waitFor();
    const over = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    check(over <= 1, `好友页（${label}）该一屏放下：多出 ${over}px`);
    await shot(page, `meetup-friends-${label}`);

    await page.getByTestId('meetup-new').click();
    const form = page.getByTestId('meetup-form');
    await form.getByRole('button', { name: '德州扑克' }).click();
    await form.getByRole('button', { name: '明天' }).click();
    await form.getByLabel('几点').selectOption({ label: '20:00' });
    await form.getByRole('button', { name: /^约 明天 20:00 的德州扑克$/ }).click();
    await form.waitFor({ state: 'detached' });
    const at = (sent as { at: number } | null)?.at ?? 0;
    check((sent as { game?: string } | null)?.game === 'texas', `约一局该发德州（${JSON.stringify(sent)}）`);
    check(new Date(at + 8 * 3_600_000).toISOString().slice(11, 16) === '20:00' && at > Date.now(), `约一局的时间该是北京时间明天 20:00（${at}）`);
    await page.getByTestId('meetup-mine').getByText('明天 20:00').waitFor();
    await ctx.close();
  }
}
