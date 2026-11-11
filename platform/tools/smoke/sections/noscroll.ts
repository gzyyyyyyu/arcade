/** 冒烟分段：noScroll（npm run smoke -- --only=<段名>，段名表在 tools/smoke.ts） */
import type { Browser, Page } from 'playwright-core';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE, check, json, newPage, OUT, shot } from '../lib/core.ts';
import { FAKE_ADMIN, FAKE_FEED, FAKE_FRIENDS, FAKE_WALLET, fakeFeedFiles, mockAdmin } from '../lib/fakes.ts';
import { noScrollIssues, overlapClipIssues } from '../lib/ui.ts';

/** docs/ui.md 第 0、11 节的五个验收尺寸 */
const SIZES = [
  ['1280x720', { width: 1280, height: 720 }, false],
  ['1920x1080', { width: 1920, height: 1080 }, false],
  ['844x390', { width: 844, height: 390 }, true],
  ['390x844', { width: 390, height: 844 }, true],
  ['360x640', { width: 360, height: 640 }, true],
] as const;

/** 要一屏放下的界面：名字、地址、等到什么、打开后再做什么（弹窗） */
const PAGES: readonly (readonly [string, string, string, ((p: Page) => Promise<void>)?])[] = [
  ['大厅', '/', '.lobby-grid .card'],
  ['钱包', '/wallet', '[data-testid="wallet-balance"]'],
  ['排行', '/boards', '[data-testid="ranks"]'],
  ['好友', '/friends', '[data-testid="person-小明"]'],
  ['动态', '/feed', 'main h2'],
  ['我的账号', '/me', 'main h2'],
  ['隐私说明', '/privacy', 'main h2'],
  ['管理概览', '/admin', '[data-testid="admin-overview"]'],
  // 快捷键只在有鼠标的设备上开（src/features/hotkeys/Hotkeys.tsx），触屏尺寸跳过
  ['快捷键弹窗', '/', '.lobby-grid .card', async (p) => {
    await p.keyboard.press('?');
    await p.locator('.modal__box').waitFor();
  }],
];

/**
 * 一屏放下不滚：五个尺寸逐页量整页和内部的滚动、裁切。数据按"东西多"的情况给：
 * 30 笔流水、20 个人的榜、桌上有筹码（大厅多一条提示），列表要翻页而不是把页面撑长
 */
export async function noScroll(browser: Browser): Promise<void> {
  const u = (i: number) => String.fromCharCode(65 + i).repeat(22);
  const row = (i: number, name: string, value: number, rank = i + 1, isMe = false) => ({ rank, userId: u(i), displayName: name, avatar: null, value, isMe });
  const many = Array.from({ length: 20 }, (_, i) => row(i, `玩家${i + 1}`, 50_000 - i * 2_000));
  many[8] = row(8, FAKE_ADMIN.displayName, 34_000, 9, true);
  const leaderboard = { week: '2026-10-12', daily: {}, boards: { total: { entries: many, me: { rank: 9, value: 34_000 } }, titles: { entries: [], me: null } } };
  const ledger = Array.from({ length: 30 }, (_, i) => ({ at: Date.UTC(2026, 9, 17, 3) - i * 3_600_000, t: i % 2 ? 'buyin' : 'settle', g: i % 3 ? 'kaipan' : 'texas', a: i % 2 ? -2_000 : 3_000 }));
  const wallet = {
    ...FAKE_WALLET,
    wallet: { ...FAKE_WALLET.wallet, balance: 1_200, canRelief: true, fresh: false, stakes: [{ game: 'texas', ref: 'r1', tier: 'small', amount: 2_000, at: Date.UTC(2026, 9, 17, 2), until: Date.UTC(2026, 9, 18, 2), mode: 'server' }], caps: { kaipan: { net: 2_400, cap: 6_000 } } },
    ledger,
    week: { kaipan: 9_400, texas: -1_200 },
  };
  const problems: string[] = [];
  const overlapList: string[] = [];
  const clipList: string[] = [];
  for (const [label, viewport, touch] of SIZES) {
    const pages = PAGES.filter((p) => !touch || p[0] !== '快捷键弹窗');
    console.log(`一屏放下（${label}）：${pages.map((p) => p[0]).join('、')}`);
    const { ctx, page } = await newPage(browser, `一屏放下 ${label}`, touch ? 'portrait' : 'desktop', touch ? { viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport });
    await mockAdmin(page);
    await page.route('**/api/me', (r) => r.fulfill(json({ user: FAKE_ADMIN, service: 'ok', saves: 'ok', registration: 'closed' })));
    await page.route('**/api/wallet', (r) => r.fulfill(json(wallet)));
    await page.route('**/api/feed', (r) => r.fulfill(json({ items: FAKE_FEED })));
    await fakeFeedFiles(page);
    await page.route('**/api/friends', (r) => r.fulfill(json(FAKE_FRIENDS)));
    await page.route('**/api/blocks', (r) => r.fulfill(json({ blocks: [] })));
    await page.route('**/api/saves/*', (r) => r.fulfill(json({ saves: [] })));
    await page.route('**/api/leaderboard?scope=*', (r) => r.fulfill(json(leaderboard)));
    for (const [name, path, ready, after] of pages) {
      await page.goto(`${BASE}${path}`);
      await page.locator(ready).first().waitFor();
      if (after) await after(page);
      await page.waitForTimeout(200);
      const found = await noScrollIssues(page);
      for (const p of found) problems.push(`${label} ${name}：${p}`);
      // 按钮压按钮、字被裁一截（只量滚不滚抓不到）
      const { overlaps, clips } = await overlapClipIssues(page);
      for (const p of overlaps) overlapList.push(`${label} ${name}：${p}`);
      for (const p of clips) clipList.push(`${label} ${name}：${p}`);
      if (found.length || overlaps.length || clips.length) await shot(page, `noscroll-${label}-${name}`, false);
    }
    await ctx.close();
  }
  console.log(`  重叠 ${overlapList.length} 处 / 裁字 ${clipList.length} 处`);
  writeFileSync(join(OUT, 'noscroll-overlap-clip.txt'), [`重叠 ${overlapList.length} 处`, ...overlapList, `裁字 ${clipList.length} 处`, ...clipList].join('\n') + '\n');
  check(problems.length === 0, `这些界面要滚才能看全：\n  ${problems.join('\n  ')}`);
  check(overlapList.length === 0 && clipList.length === 0, `按钮重叠或文字被裁：\n  ${[...overlapList, ...clipList].join('\n  ')}`);
}
