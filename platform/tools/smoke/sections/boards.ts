/** 冒烟分段：pickBoard pickPane boardsPage（npm run smoke -- --only=<段名>，段名表在 tools/smoke.ts） */
import type { Browser, Page } from 'playwright-core';
import { BASE, check, shot, newPage, json } from '../lib/core.ts';
import { mockSession } from '../lib/fakes.ts';
import { clickShare } from '../lib/ui.ts';

/** 排行页换游戏页签（顶上一排，窄屏横滑；点之前先滚到可见） */
export async function pickBoard(page: Page, game: string): Promise<void> {
  await page.getByRole('tablist', { name: '哪个榜' }).getByRole('tab', { name: game, exact: true }).click();
}

/** 窄屏上游戏页签里的"本周净赢 / 每日"小页签；宽屏两块并排，没有这一排 */
export async function pickPane(page: Page, name: string): Promise<void> {
  const tab = page.getByRole('tablist', { name: '本周净赢和每日榜' }).getByRole('tab', { name });
  if (await tab.isVisible().catch(() => false)) await tab.click();
}

/** 一屏放下：整页不滚（docs/ui.md 第 11 节） */
async function noScroll(page: Page, what: string): Promise<void> {
  const m = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight }));
  check(m.sh <= m.ch, `排行页（${what}）该一屏放下：scrollHeight ${m.sh} > ${m.ch}`);
}

export async function boardsPage(browser: Browser): Promise<void> {
  const u = (i: number) => String.fromCharCode(65 + i).repeat(22);
  const row = (i: number, name: string, value: number, rank = i + 1, isMe = false) => ({ rank, userId: u(i), displayName: name, avatar: null, value, isMe });
  const board = (entries: ReturnType<typeof row>[], me: { rank: number; value: number } | null = null) => ({ entries, me });
  const all = {
    week: '2026-10-12',
    // 夜巡一天两个每日榜（子榜）：今天守夜有人交了分，夜探还没人交
    daily: { 'kaipan:classic': 'daily-2026-10-15-classic-v2', 'kaipan:flash': null, 'haidao:map': null, 'texas:pushfold': null, 'mahjong:hekiri': null, 'yexun:vigil': 'daily-2026-10-15-vigil', 'yexun:raid': null, 'guandan:ddz': null, 'guandan:gd': null },
    boards: {
      // 净赢榜只排赢了的（净赢 > 0），后端过滤，这里照它给的样子
      total: board([row(0, '老王的徒弟', 48_000), row(1, '小明', 12_500), row(2, '某人', 12_500, 2, true), row(3, '小赢', 600, 4)], { rank: 2, value: 12_500 }),
      // 我这周在开盘输了：榜上没有我，me 是 null，"我"那一行写"这周还没赢"
      kaipan: board([row(1, '小明', 12_000), row(0, '老王的徒弟', 9_000), row(3, '小赢', 5_000, 3)]),
      guandan: board([]),
      texas: board([row(0, '老王的徒弟', 48_000), row(2, '某人', 500, 2, true)], { rank: 2, value: 500 }),
      titles: board([row(1, '小明', 9), row(0, '老王的徒弟', 4)], { rank: 73, value: 1 }),
    },
  };
  const friends = { ...all, boards: { ...all.boards, total: board([row(2, '某人', 12_500, 1, true)], { rank: 1, value: 12_500 }) } };
  for (const screen of ['desktop', 'portrait'] as const) {
    console.log(`排行榜（${screen}）`);
    const { ctx, page } = await newPage(browser, `排行榜 ${screen}`, screen);
    await mockSession(page);
    await page.route('**/api/leaderboard?scope=*', (r) => r.fulfill(json(new URL(r.request().url()).searchParams.get('scope') === 'friends' ? friends : all)));
    await page.route('**/api/boards/kaipan/daily-2026-10-15-classic-v2?scope=*', (r) =>
      r.fulfill(json({ entries: [{ rank: 1, userId: u(1), displayName: '小明', avatar: null, score: 1e11 + 3_820_000, isMe: false }, { rank: 2, userId: u(4), displayName: '韭菜', avatar: null, score: 7, isMe: false }], me: null })),
    );
    await page.route('**/api/friends/week/kaipan?board=classic', (r) =>
      r.fulfill(json({ week: '2026-10-12', entries: [{ rank: 1, displayName: '小明', avatar: null, score: 12, isMe: false }, { rank: 2, displayName: '某人', avatar: null, score: 9, isMe: true }], me: { rank: 2, score: 9 } })),
    );
    // 跟开盘约定的格式（docs/platform-backend.md 15.12）
    await page.route('**/games/kaipan/daily.json', (r) =>
      r.fulfill(json({ note: '每天一样的行情，比谁打得好。', score: [{ from: 1e11, text: '通关 · {n} 元' }, { text: '撑了 {n} 个月' }] })),
    );
    // 照夜巡 public/daily.json 的写法（平台只读，不引用游戏的文件）：撑到天亮的分数加了 100 万
    await page.route('**/api/boards/yexun/daily-2026-10-15-vigil?scope=*', (r) =>
      r.fulfill(json({ entries: [{ rank: 1, userId: u(1), displayName: '小明', avatar: null, score: 1_000_000 + 1_320, isMe: false }, { rank: 2, userId: u(2), displayName: '某人', avatar: null, score: 600, isMe: true }], me: { rank: 2, score: 600 } })),
    );
    await page.route('**/games/yexun/daily.json', (r) =>
      r.fulfill(json({ note: '今天所有人玩同一局。', score: [{ text: '{n}' }], boards: { vigil: { note: '撑到天亮的比拼击杀，没撑到的比谁撑得久。', score: [{ from: 1_000_000, text: '天亮 · 斩 {n}' }, { text: '撑了 {n} 秒' }] }, raid: { note: '比谁撤出时带出的宝物更值钱。', score: [{ text: '带出 {n} 铜钱' }] } } })),
    );
    await page.goto(`${BASE}/`);
    await page.locator('.topbar').getByRole('link', { name: '排行' }).click();
    // 默认是总榜：领奖台 + 列表，自己（第 2 名）在领奖台上、那格高亮；前三名不再单写"我"那一行，免得同一个人写两遍
    const total = page.getByTestId('board-weekly');
    await total.getByText('+48,000').waitFor();
    await total.locator('.rank--me').getByText('某人').waitFor();
    check((await total.getByTestId('my-rank').count()) === 0, '我在前三名里，不该再单写"我"那一行');
    await noScroll(page, `总榜 ${screen}`);
    await shot(page, `boards-${screen}`);
    await clickShare(page, 'share-rank', `boards-share-${screen}`);
    await page.getByRole('button', { name: '只看好友' }).click();
    // 好友榜里只有我：一个人不站领奖台，排成列表，我是第 1 名。
    // 先等台子撤掉：+12,500 那格在全站榜的领奖台上也有，只等它会在好友榜画出来之前就往下走
    await total.locator('.podium').waitFor({ state: 'detached' });
    await total.locator('.rank--me').getByText('+12,500').waitFor();
    await page.getByRole('button', { name: '全部' }).click();
    await total.getByText('+48,000').waitFor();
    // 页签：总榜 + 接了钱包或有代表性每日榜（featuredDaily）的游戏；飞驰、弹里个弹都没有，不开
    const tablist = page.getByRole('tablist', { name: '哪个榜' });
    for (const name of ['总榜', '开盘', '牌馆', '德州扑克', '雀馆', '夜巡', '海岛']) check((await tablist.getByRole('tab', { name, exact: true }).count()) === 1, `排行页该有"${name}"页签`);
    for (const name of ['飞驰', '弹里个弹']) check((await tablist.getByRole('tab', { name, exact: true }).count()) === 0, `排行页不该有"${name}"页签`);
    // 开盘：本周净赢 + 经典每日榜；我这周输了，不在榜上
    await pickBoard(page, '开盘');
    await pickPane(page, '本周净赢');
    const weekly = page.getByTestId('board-weekly');
    await weekly.getByTestId('my-rank').getByText('这周还没赢').waitFor();
    check((await weekly.locator('.rank--me').count()) === 0, '这周没赢，榜上不该有我');
    await noScroll(page, `开盘 ${screen}`);
    await shot(page, `boards-me-not-won-${screen}`);
    await pickPane(page, '经典');
    const daily = page.getByTestId('board-daily');
    await daily.getByText('通关 · 3,820,000 元').waitFor();
    await daily.getByText('撑了 7 个月').waitFor();
    await noScroll(page, `开盘每日 ${screen}`);
    if (screen === 'desktop') await shot(page, 'boards-game-desktop');
    // 每日挑战只看好友时比这周每人最好的一天
    await page.getByRole('button', { name: '只看好友' }).click();
    if (screen === 'desktop') await daily.getByText('好友比这周最好的一天').waitFor();
    await daily.locator('.rank--me').getByText('撑了 9 个月').waitFor();
    if (screen === 'desktop') await shot(page, 'boards-friends-week');
    await page.getByRole('button', { name: '全部' }).click();
    // 夜巡：代表性每日榜是守夜，分数按子榜的写法
    await pickBoard(page, '夜巡');
    await pickPane(page, '守夜');
    await page.getByTestId('board-daily').getByText('天亮 · 斩 1,320').waitFor();
    await page.getByTestId('board-daily').locator('.rank--me').getByText('撑了 600 秒').waitFor();
    check((await page.getByText('夜探').count()) === 0, '排行页只列一个代表性每日榜，夜探不该出现');
    await noScroll(page, `夜巡 ${screen}`);
    // 牌馆没人上榜：空状态一句话 + 去玩一局
    await pickBoard(page, '牌馆');
    await pickPane(page, '本周净赢');
    await page.getByTestId('board-weekly').getByTestId('board-empty').getByRole('link', { name: '去玩一局' }).waitFor();
    await noScroll(page, `牌馆空榜 ${screen}`);
    await pickBoard(page, '总榜');
    await total.getByText('+48,000').waitFor();
    await total.getByTestId('ranks').getByRole('link', { name: '小明' }).first().click();
    await page.waitForURL((x) => x.pathname === `/u/${u(1)}`);
    await ctx.close();
  }
}
