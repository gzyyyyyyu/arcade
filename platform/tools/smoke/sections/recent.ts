/** 冒烟分段：recentGames（npm run smoke -- --only=<段名>，段名表在 tools/smoke.ts） */
import type { Browser } from 'playwright-core';
import { GAMES } from '../../../shared/games.ts';
import { BASE, check, shot, newPage } from '../lib/core.ts';
import { noScrollIssues } from '../lib/ui.ts';
import { FAKE_USER, FAKE_WALLET, mockSession } from '../lib/fakes.ts';

/**
 * 大厅最近玩的排第一张卡：卡上写"上次玩 · 多久以前"、按钮是"继续玩"。
 * 本地记录和钱包流水合并后取最新；另一个账号的本地记录不算。
 * 第一屏验收（电脑 1280×720、手机）：顶栏以下常驻信息条最多 1 条，至少 2 张游戏卡的标题整个看得到；整页不滚。
 */
export async function recentGames(browser: Browser): Promise<void> {
  console.log('大厅最近玩过：合并顺序、第一张卡、第一屏');
  const now = Date.now();
  const seed = [{ id: 'racing', at: now - 10_000 }, { id: 'texas', at: now - 3 * 3_600_000 }, { id: 'nope', at: now }];
  const ledger = [{ at: now - 2 * 86_400_000, t: 'settle', g: 'kaipan', a: 1_000 }, { at: now - 9 * 86_400_000, t: 'buyin', g: 'mahjong', a: -500 }];
  for (const screen of ['desktop', 'portrait'] as const) {
    const { ctx, page } = await newPage(browser, `最近玩过 ${screen}`, screen, screen === 'desktop' ? { viewport: { width: 1280, height: 720 } } : {});
    // 本地记录按账号分开：键是 arcade.recent.<用户 id>；另一个账号的记录不该出现
    await page.addInitScript(([v, id]) => { localStorage.setItem(`arcade.recent.${id}`, JSON.stringify(v)); localStorage.setItem('arcade.recent.someone-else', JSON.stringify([{ id: 'danli', at: Date.now() }])); }, [seed, FAKE_USER.id] as const);
    await mockSession(page, { me: { notice: null }, wallet: () => ({ ...FAKE_WALLET, ledger }) });
    await page.goto(`${BASE}/`);
    await page.getByTestId('last-racing').getByText('上次玩 · 刚刚').waitFor();
    // 手机上"上次玩 ·"只留给读屏（视觉上藏起来，innerText 里还在），看得见的是"刚刚玩过"
    const kicker = (await page.getByTestId('last-racing').innerText()).replace(/\s+/g, ' ').trim();
    const want = screen === 'desktop' ? '上次玩 · 刚刚' : '刚刚玩过';
    check(screen === 'desktop' ? kicker === want : kicker.endsWith(want), `"上次玩"角标该是"${want}"：${kicker}`);
    const order = await page.locator('.lobby-grid .card').evaluateAll((els) => els.slice(0, 4).map((e) => e.getAttribute('data-game')));
    check(order.join() === 'racing,texas,kaipan,mahjong', `最近玩过的该排前面：${order}`);
    const first = page.locator('.lobby-grid .card[data-game="racing"] .card__play');
    check((await first.textContent())?.trim() === '继续玩', '最近玩的那张卡按钮该是"继续玩"');
    check((await first.getAttribute('href')) === '/games/racing/', '"继续玩"该链到飞驰');
    check((await page.locator('.card__kicker').count()) === 1, '"上次玩"只该出现在一张卡上');
    check((await page.locator('.hero').count()) === 0, '继续玩横幅已并进第一张卡，不该还在');
    const fs = await page.evaluate(() => {
      const cards = [...document.querySelectorAll<HTMLElement>('.lobby-grid .card__title')].filter((t) => { const r = t.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }).length;
      const bars = [...document.querySelectorAll<HTMLElement>('.banner, .nudge')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < innerHeight; }).length;
      return { cards, bars };
    });
    check(fs.cards >= 2, `${screen} 第一屏只看得到 ${fs.cards} 张游戏卡的标题`);
    check(fs.bars <= 1, `${screen} 第一屏常驻信息条有 ${fs.bars} 条，最多 1 条`);
    const issues = await noScrollIssues(page);
    check(issues.length === 0, `${screen} 大厅要滚：${issues.join('；')}`);
    console.log(`  ${screen} 第一屏游戏卡 ${fs.cards} 张，信息条 ${fs.bars} 条`);
    await shot(page, `lobby-recent-${screen}`, false);
    await ctx.close();
  }
  // 没玩过的新号：按目录顺序，没有"上次玩"，按钮都是"进入游戏"
  const { ctx, page } = await newPage(browser, '最近玩过 新号', 'portrait');
  await mockSession(page, { me: { notice: null } });
  await page.goto(`${BASE}/`);
  await page.locator('.lobby-grid .card').first().waitFor();
  check((await page.locator('.card__kicker').count()) === 0, '新号不该有"上次玩"');
  check((await page.locator('.lobby-grid .card').first().getAttribute('data-game')) === GAMES[0]!.id, '新号该按目录顺序');
  await ctx.close();
}
