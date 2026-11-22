/** 冒烟分段：statsPage（npm run smoke -- --only=<段名>，段名表在 tools/smoke.ts） */
import type { Browser, Page } from 'playwright-core';
import { BASE, check, expectHttp, shot, newPage, json } from '../lib/core.ts';
import { FAKE_USER, mockSession } from '../lib/fakes.ts';
import { clickShare } from '../lib/ui.ts';

/** 窄屏上总览、游戏页签里的两栏是小页签，一次只看一栏：宽屏上两栏都在，没有这个按钮 */
async function pane(page: Page, id: string): Promise<void> {
  const t = page.getByTestId(`ptab-${id}`);
  if (await t.count()) await t.click();
}

/** 徽章墙按高度翻页：翻到想看的那一枚出现为止 */
async function showBadge(page: Page, id: string): Promise<void> {
  await pane(page, 'badges');
  const badge = page.getByTestId(`badge-${id}`);
  for (let i = 0; i < 20 && !(await badge.count()); i++) await page.getByTestId('badges').getByRole('button', { name: '下一页' }).click();
  await badge.waitFor();
}

/** 战绩页（一屏放下：总览 + 每个游戏一个页签）。自己的、别人的；称号目录读得到的显示名字（没拿到的灰着），读不到的显示"神秘称号"。 */
export async function statsPage(browser: Browser): Promise<void> {
  const career = (o: Record<string, unknown>) => ({ n: 3, net: 2_000, wnet: 0, rounds: 0, wins: 0, best: 0, titles: [], max: {}, sum: {}, ...o });
  const games = {
    texas: career({ n: 4, wnet: -1_500, rounds: 1_000, wins: 213, best: 18_400, titles: [{ id: 'bluff_king', at: Date.UTC(2026, 9, 14, 12) }] }),
    kaipan: career({ n: 2, wnet: 12_000, rounds: 2, wins: 1, best: 12_000, titles: [{ id: 'first_year', at: Date.UTC(2026, 9, 13, 3) }, { id: 'diamond_hands', at: Date.UTC(2026, 9, 15, 3) }] }),
    // 照真号那张卡：雀馆 25 局 4%、最近拿到的是"点炮王"——卡上都不该出现（小格是德州胜率、最大一把、称号数，昵称旁挂"钻石手"）
    mahjong: career({ n: 3, rounds: 25, wins: 1, best: 12, titles: [{ id: 'xz_pao_king', at: Date.UTC(2026, 9, 16, 3) }] }),
  };
  const catalog = { first_year: { name: '熬过一年', desc: '实盘打满 12 个月' }, diamond_hands: { name: '钻石手', desc: '一只票拿满半年' }, all_in: { name: '满仓侠', desc: '满仓过一个月' } };
  for (const screen of ['desktop', 'portrait'] as const) {
    console.log(`战绩页（${screen}）：局数、胜率、最大一把、本周净赢、称号墙`);
    const { ctx, page } = await newPage(browser, `战绩 ${screen}`, screen);
    await mockSession(page);
    await page.route('**/api/stats/me', (r) => r.fulfill(json({ user: { userId: FAKE_USER.id, displayName: FAKE_USER.displayName, avatar: null }, relation: 'self', week: '2026-10-12', games })));
    await page.route('**/games/kaipan/titles.json', (r) => r.fulfill(json(catalog)));
    await page.route('**/games/mahjong/titles.json', (r) => r.fulfill(json({ xz_pao_king: { name: '点炮王', desc: '一场点炮最多' } })));
    // 德州还没放称号文件：显示"神秘称号"，不报错
    await page.route('**/games/texas/titles.json', (r) => {
      expectHttp(404, '/games/texas/titles.json');
      return r.fulfill({ status: 404, body: '' });
    });
    await page.goto(`${BASE}/me/stats`);
    // 总览：玩家名片 + 各游戏概览（按大厅顺序，局数、胜率、本周净赢）
    await page.getByTestId('player-card').waitFor();
    await pane(page, 'games');
    await page.getByTestId('career-texas').getByText('21%').waitFor();
    await page.getByTestId('career-kaipan').getByText('+12,000').waitFor();
    const order = await page.locator('[data-testid^="career-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    check(order.join() === 'career-kaipan,career-texas,career-mahjong', `战绩应该按大厅顺序排：${order}`);
    await shot(page, `stats-${screen}`);
    // 页签：总览 + 玩过的每个游戏；游戏页签里是称号墙，目录读不到的显示"神秘称号"
    const tabs = await page.locator('[data-testid^="stab-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    check(tabs.join() === 'stab-all,stab-kaipan,stab-texas,stab-mahjong', `战绩页签不对：${tabs}`);
    await page.getByTestId('stab-kaipan').click();
    await page.getByTestId('gstats-kaipan').getByText('+12,000').waitFor();
    await pane(page, 'titles');
    await page.getByText('钻石手').waitFor();
    await page.getByText('满仓侠').waitFor();
    await shot(page, `stats-game-${screen}`);
    await page.getByTestId('stab-texas').click();
    await page.getByTestId('gstats-texas').getByText('18,400').waitFor();
    await pane(page, 'titles');
    await page.getByText('神秘称号').waitFor();
    // 街机厅徽章：假战绩（德州 1000 局、开盘、雀馆 25 局）按算法正好解锁 10 个；点一枚出怎么拿；窄屏不横向溢出
    await page.getByTestId('stab-all').click();
    await pane(page, 'badges');
    await page.getByTestId('badges').waitFor();
    const unlocked = (await page.getByTestId('badges-count').textContent())?.trim();
    check(unlocked === '10', `徽章应解锁 10 个：${unlocked}`);
    await showBadge(page, 'regular');
    await page.getByTestId('badge-regular').click();
    await page.getByTestId('badge-tip').getByText('打满 50、200、1000 局').waitFor();
    check((await page.getByTestId('badge-regular').getAttribute('data-tier')) === '3', '常客应该是金档');
    await showBadge(page, 'sharp');
    check((await page.getByTestId('badge-sharp').getAttribute('data-tier')) === '0', '神机妙算（胜率 20%）应该没拿到');
    const tiny = await page.locator('.badge').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 44).length);
    check(tiny === 0, `徽章点击区应不小于 44px，有 ${tiny} 个更小`);
    // 一屏放下：页面不横向也不纵向溢出，翻页后还在
    const over = await page.evaluate(() => ({ x: document.documentElement.scrollWidth > window.innerWidth, y: document.documentElement.scrollHeight > window.innerHeight }));
    check(!over.x && !over.y, `战绩页应一屏放下：${JSON.stringify(over)}`);
    await shot(page, `stats-badges-${screen}`);
    await clickShare(page, 'share-stats', `stats-share-${screen}`);
    await ctx.close();
  }
  console.log('别人的战绩：/u/<id>，没战绩时说"还没有战绩"');
  const { ctx, page } = await newPage(browser, '别人的战绩');
  const other = 'B'.repeat(22);
  await mockSession(page);
  await page.route(`**/api/stats/${other}`, (r) => r.fulfill(json({ user: { userId: other, displayName: '小明', avatar: null }, relation: 'friends', week: '2026-10-12', games: {} })));
  await page.goto(`${BASE}/u/${other}`);
  await page.getByRole('heading', { name: '小明 的战绩' }).waitFor();
  await page.getByTestId('career-empty').waitFor();
  check((await page.locator('[data-testid^="stab-"]').count()) === 0, '没战绩时不该有游戏页签');
  await ctx.close();
  console.log('好友的战绩：有战绩时先看到总览和加好友之外的名片，游戏页签里有"和我一起"');
  const mate = await newPage(browser, '好友的战绩');
  const pal = 'C'.repeat(22);
  await mockSession(mate.page);
  await mate.page.route('**/games/*/titles.json', (r) => r.fulfill(json({})));
  await mate.page.route(`**/api/stats/${pal}`, (r) =>
    r.fulfill(json({ user: { userId: pal, displayName: '小红', avatar: null }, relation: 'friends', week: '2026-10-12', games: { texas: career({ n: 4, rounds: 40, wins: 10, best: 900 }) }, together: { texas: { n: 6, wins: 4, theirWins: 2, teamN: 0, teamWins: 0 } } })),
  );
  await mate.page.goto(`${BASE}/u/${pal}`);
  await mate.page.getByTestId('player-card').waitFor();
  check((await mate.page.getByTestId('add-friend').count()) === 0, '已经是好友，不该再有加好友按钮');
  await mate.page.getByTestId('stab-texas').click();
  await mate.page.getByTestId('gstats-texas').getByText('25%').waitFor();
  await pane(mate.page, 'facts');
  await mate.page.getByTestId('together').waitFor();
  // 不是好友的人：名片上有"加好友"，点了变成"已发请求"
  const stranger = 'D'.repeat(22);
  let sent: unknown = null;
  await mate.page.route('**/api/friends/requests', (r) => {
    sent = r.request().postDataJSON();
    return r.fulfill(json({ status: 'pending' }));
  });
  await mate.page.route(`**/api/stats/${stranger}`, (r) => r.fulfill(json({ user: { userId: stranger, displayName: '路人', avatar: null }, relation: 'none', week: '2026-10-12', games: {} })));
  await mate.page.goto(`${BASE}/u/${stranger}`);
  await mate.page.getByTestId('add-friend').click();
  await mate.page.getByTestId('friend-pending').waitFor();
  check(JSON.stringify(sent) === JSON.stringify({ userId: stranger }), `加好友发的不对：${JSON.stringify(sent)}`);
  await mate.ctx.close();
}
