/**
 * 冒烟分段：states（npm run smoke -- --only=states）。各页的空、加载中、出错三种状态各截一张，给人看：
 * 空数据五个尺寸都截（空状态最容易在小屏上排歪），加载中和出错截 1280、390 和 360。
 * 只查控制台零报错和"页面没白屏"（main 里有字）；排得好不好看截图，列在 states-index.md 里。
 * 出错状态的 500 是这里故意回的，从"没想到的 4xx/5xx"里去掉；连不上用 abort 模拟。
 */
import type { Browser, Page, Route } from 'playwright-core';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE, check, json, newPage, OUT, problems, shot } from '../lib/core.ts';
import { FAKE_ADMIN, FAKE_WALLET, mockAdmin, mockSession } from '../lib/fakes.ts';
import { overlapClipIssues } from '../lib/ui.ts';

const SIZES = [
  ['1280x720', { width: 1280, height: 720 }, false],
  ['1920x1080', { width: 1920, height: 1080 }, false],
  ['844x390', { width: 844, height: 390 }, true],
  ['390x844', { width: 390, height: 844 }, true],
  ['360x640', { width: 360, height: 640 }, true],
] as const;
// 加载中、出错截最常见的电脑、手机和最小的手机
const FEW = new Set(['1280x720', '390x844', '360x640']);

const EMPTY_WALLET = { ...FAKE_WALLET, ledger: [], week: {} };
const EMPTY_BOARDS = { week: '2026-10-26', boards: { total: { entries: [], me: null } }, daily: {} };
const EMPTY_STATS = { user: { userId: FAKE_ADMIN.id, displayName: FAKE_ADMIN.displayName, avatar: null }, relation: 'self', week: '2026-10-26', games: {} };

/** 一页：名字、地址、这页自己的数据接口（加载中、出错只动这些）、空数据怎么回 */
interface PageSpec {
  name: string;
  path: string;
  apis: string[];
  empty: (page: Page) => Promise<void>;
}

const PAGES: PageSpec[] = [
  { name: '大厅', path: '/', apis: ['**/api/wallet'], empty: async () => {} },
  {
    name: '排行', path: '/boards', apis: ['**/api/leaderboard?scope=*'],
    empty: (p) => p.route('**/api/leaderboard?scope=*', (r) => r.fulfill(json(EMPTY_BOARDS))),
  },
  { name: '动态', path: '/feed', apis: ['**/api/feed'], empty: async () => {} },
  {
    name: '好友', path: '/friends', apis: ['**/api/friends'],
    empty: async (p) => {
      await p.route('**/api/friends', (r) => r.fulfill(json({ friends: [], incoming: [], outgoing: [] })));
      await p.route('**/api/blocks', (r) => r.fulfill(json({ blocks: [] })));
    },
  },
  { name: '钱包', path: '/wallet', apis: ['**/api/wallet'], empty: (p) => p.route('**/api/wallet', (r) => r.fulfill(json(EMPTY_WALLET))) },
  { name: '战绩', path: '/me/stats', apis: ['**/api/stats/*'], empty: (p) => p.route('**/api/stats/*', (r) => r.fulfill(json(EMPTY_STATS))) },
  { name: '我的', path: '/me', apis: ['**/api/saves/*'], empty: (p) => p.route('**/api/saves/*', (r) => r.fulfill(json({ saves: [] }))) },
  { name: '管理', path: '/admin', apis: ['**/api/admin/overview'], empty: async () => {} },
];

type State = 'empty' | 'loading' | 'error500' | 'offline';

async function open(browser: Browser, size: (typeof SIZES)[number], spec: PageSpec, state: State, issues: string[]): Promise<void> {
  const [label, viewport, touch] = size;
  const tag = `状态 ${label} ${spec.name} ${state}`;
  const { ctx, page } = await newPage(browser, tag, touch ? 'portrait' : 'desktop', touch ? { viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport });
  await mockSession(page, { user: FAKE_ADMIN, wallet: EMPTY_WALLET });
  await mockAdmin(page);
  await page.route('**/api/friends', (r) => r.fulfill(json({ friends: [], incoming: [], outgoing: [] })));
  await page.route('**/api/blocks', (r) => r.fulfill(json({ blocks: [] })));
  await page.route('**/api/saves/*', (r) => r.fulfill(json({ saves: [] })));
  await page.route('**/api/stats/*', (r) => r.fulfill(json(EMPTY_STATS)));
  await spec.empty(page);
  // 后注册的路由先匹配：加载中、出错盖掉上面的空数据
  const hang: Route[] = [];
  for (const glob of state === 'empty' ? [] : spec.apis) {
    await page.route(glob, (r) => {
      if (state === 'loading') hang.push(r);
      else if (state === 'offline') return r.abort('failed');
      else return r.fulfill(json({ error: 'internal', message: '服务器出错了，过一会儿再试' }, 500));
    });
  }
  const before = problems.length;
  await page.goto(`${BASE}${spec.path}`);
  await page.locator('main').first().waitFor();
  await page.waitForTimeout(state === 'loading' ? 600 : 400);
  const text = (await page.locator('main').first().innerText()).trim();
  check(text.length > 0, `${tag}：main 里一个字都没有（白屏）`);
  await shot(page, `states-${spec.name}-${state}-${label}`, false);
  // 空、出错时的排法也量重叠和裁字（noscroll 段只量有数据的样子）
  const { overlaps, clips } = await overlapClipIssues(page);
  for (const p of [...overlaps, ...clips]) issues.push(`${label} ${spec.name} ${state}：${p}`);
  // 故意回的 500 不算问题；页面自己的报错照报
  for (let i = problems.length - 1; i >= before; i--) if (problems[i]!.includes('没想到的 500')) problems.splice(i, 1);
  for (const r of hang) await r.abort('failed').catch(() => {});
  await ctx.close();
}

export async function pageStates(browser: Browser): Promise<void> {
  const index: string[] = ['# 各页空、加载中、出错（states 段）', ''];
  const issues: string[] = [];
  for (const size of SIZES) {
    const states: State[] = FEW.has(size[0]) ? ['empty', 'loading', 'error500', 'offline'] : ['empty'];
    console.log(`页面状态（${size[0]}）：${states.join('、')}`);
    for (const spec of PAGES) for (const st of states) await open(browser, size, spec, st, issues);
    index.push(`- ${size[0]}：${PAGES.map((p) => p.name).join('、')} × ${states.join('、')}`);
  }
  index.push('', `重叠和裁字 ${issues.length} 处`, ...issues.map((p) => `- ${p}`));
  writeFileSync(join(OUT, 'states-index.md'), index.join('\n') + '\n');
  console.log(`  重叠和裁字 ${issues.length} 处`);
  check(issues.length === 0, `空、加载中、出错时按钮重叠或文字被裁：\n  ${issues.join('\n  ')}`);
}
