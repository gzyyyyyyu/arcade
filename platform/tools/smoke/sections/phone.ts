/** 冒烟分段：phoneAudit deviceMatrix（npm run smoke -- --only=<段名>，段名表在 tools/smoke.ts） */
import type { Browser } from 'playwright-core';
import { BASE, check, shot, newPage, json } from '../lib/core.ts';
import { FAKE_ADMIN, FAKE_WALLET, mockAdmin, FAKE_FRIENDS, FAKE_FEED, fakeFeedFiles } from '../lib/fakes.ts';
import { PHONES, phoneIssues, lobbyTopIssues, DEVICES } from '../lib/ui.ts';

/** npm run smoke -- --only=devices：同一个浏览器把矩阵每个尺寸、每页过一遍通用检查（第一屏、单手够得着这些只按原来四台手机量），有问题的那页才截图 */
export async function deviceMatrix(browser: Browser): Promise<void> {
  await phoneAudit(browser, DEVICES, true);
}

export async function phoneAudit(browser: Browser, sizes: readonly (readonly [string, { width: number; height: number }])[] = PHONES, matrix = false): Promise<void> {
  const career = (o: Record<string, unknown>) => ({ n: 3, net: 2_000, wnet: 0, rounds: 0, wins: 0, best: 0, titles: [], max: {}, sum: {}, ...o });
  const games = { kaipan: career({ n: 2, wnet: 12_000, rounds: 2, wins: 1, best: 12_000 }), texas: career({ n: 4, wnet: -1_500, rounds: 1_000, wins: 213, best: 18_400 }) };
  const u = (i: number) => String.fromCharCode(65 + i).repeat(22);
  const row = (i: number, name: string, value: number, rank = i + 1, isMe = false) => ({ rank, userId: u(i), displayName: name, avatar: null, value, isMe });
  const many = Array.from({ length: 12 }, (_, i) => row(i, `玩家${i + 1}`, 50_000 - i * 3_000));
  many[8] = row(8, FAKE_ADMIN.displayName, 26_000, 9, true);
  const leaderboard = { week: '2026-10-12', daily: {}, boards: { total: { entries: many, me: { rank: 9, value: 26_000 } }, titles: { entries: [], me: null } } };
  const wallet = {
    ...FAKE_WALLET,
    wallet: { ...FAKE_WALLET.wallet, balance: 1_200, canRelief: true, fresh: false, stakes: [{ game: 'texas', ref: 'r1', amount: 2_000, at: Date.UTC(2026, 9, 17, 2), until: Date.UTC(2026, 9, 18, 2), mode: 'server' }], caps: { kaipan: { net: 2_400, cap: 6_000 } } },
    ledger: [{ at: Date.UTC(2026, 9, 17, 3), t: 'settle', g: 'kaipan', a: 12_000, capped: 1_200 }, { at: Date.UTC(2026, 9, 17, 2), t: 'buyin', g: 'texas', a: -2_000 }],
    week: { kaipan: 9_400, texas: -1_200 },
  };
  const pages = [
    ['home', '/', '.card'],
    ['wallet', '/wallet', '[data-testid="wallet-balance"]'],
    ['boards', '/boards', '[data-testid="ranks"]'],
    ['friends', '/friends', '[data-testid="person-小明"]'],
    ['me', '/me', '[data-testid="me-tab-profile"]'],
    ['stats', '/me/stats', '[data-testid="player-card"]'],
    ['admin', '/admin', '[data-testid="admin-overview"]'],
    ['admin-users', '/admin?s=users', '[data-testid="user-xiaoming_2026"]'],
    ['admin-invites', '/admin?s=invites', '[data-testid="invite-rules"]'],
    ['privacy', '/privacy', 'main h2'],
  ] as const;
  // 第一屏要整个看得到的东西：大厅顶上的"回去接着打"和第一张游戏卡的标题、钱包的余额和补给、排行的自己
  const firstScreen: Record<string, string[]> = {
    home: ['[data-testid="nudge-stake"] a', '.card .card__title'],
    wallet: ['[data-testid="wallet-balance"]', '.wallet__relief button'],
    boards: ['[data-testid="my-rank"]'],
  };
  // 主按钮：钱包的补给。大厅的"回去接着打"在页面顶上（不再是底部固定条），不量单手够得着
  const reach: Record<string, string[]> = {
    wallet: ['.wallet__relief button'],
  };
  const problems: string[] = [];
  for (const [label, viewport] of sizes) {
    console.log(`手机清单（${label} ${viewport.width}×${viewport.height}）：${pages.map((p) => p[0]).join('、')}`);
    // 电脑尺寸不模拟触屏（鼠标、宽窗口），其余按手机平板
    const desk = label.startsWith('电脑');
    const { ctx, page } = await newPage(browser, `手机清单 ${label}`, desk ? 'desktop' : 'portrait', desk ? { viewport } : { viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await mockAdmin(page);
    await page.route('**/api/me', (r) => r.fulfill(json({ user: FAKE_ADMIN, service: 'ok', saves: 'ok', registration: 'closed' })));
    await page.route('**/api/wallet', (r) => r.fulfill(json(wallet)));
    await page.route('**/api/feed', (r) => r.fulfill(json({ items: FAKE_FEED })));
    await fakeFeedFiles(page);
    await page.route('**/api/friends', (r) => r.fulfill(json(FAKE_FRIENDS)));
    await page.route('**/api/blocks', (r) => r.fulfill(json({ blocks: [] })));
    await page.route('**/api/saves/*', (r) => r.fulfill(json({ saves: [] })));
    await page.route('**/api/stats/me', (r) => r.fulfill(json({ user: { userId: FAKE_ADMIN.id, displayName: FAKE_ADMIN.displayName, avatar: null }, relation: 'self', week: '2026-10-12', games })));
    await page.route('**/api/leaderboard?scope=*', (r) => r.fulfill(json(leaderboard)));
    await page.route('**/games/*/titles.json', (r) => r.fulfill(json({})));
    await page.route('**/api/admin/settings/invites', (r) => r.fulfill(json({ rules: { userQuota: 3, adminQuota: 50, ttlDays: 7, perDay: 5 }, defaults: { userQuota: 3, adminQuota: 50, ttlDays: 7, perDay: 5 }, range: { userQuota: [0, 100], adminQuota: [0, 1_000], ttlDays: [1, 90], perDay: [1, 100] } })));
    await page.route('**/api/admin/invite-codes?*', (r) => r.fulfill(json({ codes: [] })));
    await page.route('**/api/admin/wallet-adjustments', (r) => r.fulfill(json({ recent: [] })));
    for (const [name, path, ready] of pages) {
      await page.goto(`${BASE}${path}`);
      await page.locator(ready).first().waitFor();
      await page.waitForTimeout(150);
      // 点击区：320 宽可以 40；电脑尺寸用鼠标、宽窗口里按钮本来就紧凑，按 WCAG 2.5.8 的 24 量
      // 数字：手机平板上 ≥ 14（#228），电脑上按简报的 12（管理后台数据密、用鼠标看）
      const found = await phoneIssues(page, desk ? 24 : viewport.width <= 320 ? 40 : 44, desk ? 12 : 14);
      for (const p of found) problems.push(`${label} ${name}：${p}`);
      if (matrix) {
        // 每个尺寸留一张首页给人看，其余页有问题才截。只截看得见的一屏：整页截图会临时改视口，
        // 截完平板的触屏模拟就丢了，后面几页全按电脑的小按钮量
        if (found.length || name === 'home') await shot(page, `devices-${label}-${name}`, false);
        continue;
      }
      // 第一屏就有主操作（竖着拿的时候；横屏只有 390 高，标题和顶栏占掉一半，往下翻一下是正常的）
      if (label !== 'landscape') {
        for (const sel of firstScreen[name] ?? []) {
          const box = await page.locator(sel).first().boundingBox();
          if (!box || box.y < 0 || box.y + box.height > viewport.height) problems.push(`${label} ${name}：第一屏看不到 ${sel}${box ? `（在 ${Math.round(box.y)}–${Math.round(box.y + box.height)}）` : ''}`);
        }
      }
      // 单手够得着：手机竖着拿时主按钮的中心不在屏幕最上面三分之一（拇指最难够的地方）；iPad 一般两手拿，不量
      if (label === 'se' || label === 'iphone') {
        for (const sel of reach[name] ?? []) {
          const box = await page.locator(sel).first().boundingBox();
          const mid = box ? box.y + box.height / 2 : -1;
          if (mid < viewport.height / 3) problems.push(`${label} ${name}：主按钮 ${sel} 在屏幕最上面三分之一，单手够不着（中心 ${Math.round(mid)}，要 ≥ ${Math.round(viewport.height / 3)}）`);
        }
      }
      if (name === 'home') problems.push(...(await lobbyTopIssues(page, viewport)).map((p) => `${label} home：${p}`));
      await shot(page, `phone-${label}-${name}`);
    }
    // 管理筹码小窗口在 SE 上不出屏、里面能点的够大
    if (label === 'se' && !matrix) {
      await page.goto(`${BASE}/admin`);
      await page.getByTestId('admin-chips-open').click();
      await page.getByTestId('admin-chips').waitFor();
      await page.waitForTimeout(250);
      const box = await page.getByTestId('admin-chips').boundingBox();
      if (!box || box.x < 0 || box.y < 0 || box.x + box.width > viewport.width || box.y + box.height > viewport.height) problems.push(`se 管理筹码：小窗口出了屏幕 ${JSON.stringify(box)}`);
      for (const p of await phoneIssues(page)) problems.push(`se 管理筹码：${p}`);
      await shot(page, 'phone-se-admin-chips');
    }
    // 竖着转横着再转回来：不横着滑、顶栏不折行
    if (label === 'iphone' && !matrix) {
      await page.goto(`${BASE}/`);
      await page.locator('.card').first().waitFor();
      for (const vp of [{ width: 844, height: 390 }, viewport]) {
        await page.setViewportSize(vp);
        await page.waitForTimeout(300);
        for (const p of await phoneIssues(page)) problems.push(`转屏 ${vp.width}×${vp.height} home：${p}`);
      }
    }
    await ctx.close();
  }
  // 电脑上（宽窗口、鼠标）也是页面里的一条提示
  if (!matrix) {
    const { ctx, page } = await newPage(browser, '手机清单 电脑对照', 'desktop');
    await mockAdmin(page);
    await page.route('**/api/me', (r) => r.fulfill(json({ user: FAKE_ADMIN, service: 'ok', saves: 'ok', registration: 'closed' })));
    await page.route('**/api/wallet', (r) => r.fulfill(json(wallet)));
    await page.goto(`${BASE}/`);
    const pos = await page.getByTestId('nudge-stake').evaluate((el) => getComputedStyle(el).position);
    if (pos !== 'static') problems.push(`电脑大厅："回去接着打"应该是页面里的一条提示，实际 position=${pos}`);
    await ctx.close();
  }
  for (const p of problems) console.log(`  · ${p}`);
  check(problems.length === 0, `${matrix ? '多尺寸矩阵' : '手机清单'}有 ${problems.length} 处不合格（见上面的列表）`);
}
