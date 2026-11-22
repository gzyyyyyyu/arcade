/** 假数据和接口 mock：只在浏览器里拦请求，不碰本地 D1 */
import type { Page } from 'playwright-core';
import { adminSection, findUser } from './accounts.ts';
import { BASE, json } from './core.ts';

/** 装作登录着：写上登录提示 cookie（addCookies 不收 __Host- 前缀，localhost 是安全上下文，页面里能写）。 */
export async function fakeLoginHint(page: Page): Promise<void> {
  await page.goto(`${BASE}/privacy`);
  await page.evaluate(() => {
    // biome-ignore lint/suspicious/noDocumentCookie: 冒烟里要在页面里写 __Host- 登录提示 cookie，Cookie Store API 与 addCookies 都不便写
    document.cookie = '__Host-arcade_li=1; Path=/; Secure; SameSite=Lax';
  });
}

export const FAKE_USER = { id: 'x', username: 'someone', displayName: '某人', friendCode: 'ABCD2345', createdAt: Date.UTC(2026, 9, 1), showWhere: true, showFeed: true, showMates: true, gamePrefs: { show: [] as string[], hide: [] as string[] } };
export const FAKE_ADMIN = { ...FAKE_USER, id: 'a', username: 'owner', displayName: '阿国', isAdmin: true };
/** 模拟登录的页面也要模拟钱包：不然真的 /api/wallet 回 401，页面会当成会话失效、退回没登录 */
export const FAKE_WALLET = {
  wallet: { balance: 10_000, stakes: [], canRelief: false, writesLeft: 200, caps: {}, fresh: true },
  tiers: { small: 2_000, mid: 10_000, big: 50_000, lux: 200_000 },
  reliefTo: 2_000,
  winUnits: 10,
  ledger: [] as unknown[],
  week: {} as Record<string, number>,
};
/** 只给冒烟用的假令牌（wrangler dev 用 --var 传进去）。 */
export const ADMIN_TOKEN = 'smoke:smoke-only-admin-token-0000';
/** GET /api/invites 的完整形状（docs/platform-backend.md 15.15、15.22）：没邀请、没约局、没人在线 */
export const EMPTY_POLL = { invites: [], meetups: [], mine: null, online: 0 };

/**
 * 装作某人登录着：/api/me、/api/wallet 都用假的，再写上登录提示 cookie。
 * me 里的字段盖掉 /api/me 默认的几项（写 undefined 就是不带这一项）；wallet 是函数时每次请求现算，用来模拟领完补给这类前后变化。
 */
export async function mockSession(
  page: Page,
  { user = FAKE_USER, me = {}, wallet = FAKE_WALLET, invites = [], poll = {}, overtakes = [], feed = [] }: {
    user?: object;
    me?: Record<string, unknown>;
    wallet?: object | (() => object);
    invites?: object[];
    /** 30 秒轮询里除邀请以外的：约局（meetups、mine）、在线好友数（online） */
    poll?: Record<string, unknown>;
    overtakes?: object[];
    feed?: object[];
  } = {},
): Promise<void> {
  await page.route('**/api/me', (r) => r.fulfill(json({ user, service: 'ok', saves: 'ok', registration: 'closed', ...me })));
  await page.route('**/api/wallet', (r) => r.fulfill(json(typeof wallet === 'function' ? wallet() : wallet)));
  // 登录后的大厅会报在线；模拟的人在真接口那边不认识，回 401
  await page.route('**/api/presence', (r) => r.fulfill({ status: 204 }));
  // 登录后每 30 秒问一次有没有人叫；"不了"回 204
  await page.route('**/api/invites', (r) => r.fulfill(json({ ...EMPTY_POLL, invites, ...poll })));
  await page.route('**/api/invites/*/dismiss', (r) => r.fulfill({ status: 204 }));
  // 大厅问一次"这周哪个好友超过了我"
  await page.route('**/api/friends/overtakes', (r) => r.fulfill(json({ overtakes })));
  // 好友动态：大厅小条和好友页都读；赞和扔道具回 204
  await page.route('**/api/feed', (r) => r.fulfill(json({ items: feed })));
  await page.route('**/api/feed/*/react', (r) => r.fulfill({ status: 204 }));
  // 排行页问 /api/leaderboard（快捷键段会跳过去）：默认回空榜，要看榜的段自己覆盖
  await page.route('**/api/leaderboard?scope=*', (r) => r.fulfill(json({ week: '2026-10-26', boards: {}, daily: {} })));
  // 邀请码："我的"页会问一次
  await page.route('**/api/invite-codes', (r) => r.fulfill(json({ quota: 3, taken: 0, left: 3, todayLeft: 5, ttlDays: 7, codes: [] })));
  await fakeLoginHint(page);
}

// ---------- 起本地接口 ----------

export const FAKE_LIST = [
  { id: 'a', username: 'owner', displayName: '阿国', role: 'admin', createdAt: Date.UTC(2026, 9, 14), lastSeenAt: Date.UTC(2026, 9, 14, 8) },
  {
    id: 'b',
    username: 'xiaoming_2026',
    displayName: '小明',
    role: 'user',
    createdAt: Date.UTC(2026, 9, 14, 9),
    lastSeenAt: Date.UTC(2026, 9, 14, 9),
    wallet: { balance: 23_400, onTable: 2_000, played: { kaipan: 3, texas: 12 } },
  },
  {
    id: 'c',
    username: 'a_very_long_name_20',
    displayName: '名字有十二个字那么长的人',
    role: 'user',
    createdAt: Date.UTC(2026, 9, 14, 10),
    lastSeenAt: Date.UTC(2026, 9, 15, 10),
    wallet: { balance: null, onTable: 0, played: {} },
  },
];

/** 今日概况：今天现算，前一天是早期记的（没有人数） */
export const FAKE_OVERVIEW = {
  today: {
    day: '2026-10-16', total: 12_400_000, wallets: 44, grant: 20_000, relief: 3_500, admin: 5_000, active: 9, reliefCount: 2, visitors: 14,
    games: { kaipan: { in: 6_000, out: 9_000, back: 0, capped: 1_200, players: 3 }, texas: { in: 24_000, out: 21_000, back: 2_000, capped: 0, players: 6 } },
  },
  days: [{ day: '2026-10-15', total: 12_345_678, wallets: 42, grant: 120_000, relief: 6_000, games: { kaipan: { in: 8_000, out: 14_000, back: 2_000, capped: 1_500 } } }],
};

/** 手机上的筹码统计表：几个游戏、大数字，看横向能不能滑开 */
export const FAKE_STATS = [
  { day: '2026-10-15', total: 12_345_678, wallets: 42, grant: 120_000, relief: 6_000,
    games: { guandan: { in: 20_000, out: 18_500, back: 0, capped: 0 }, kaipan: { in: 8_000, out: 14_000, back: 2_000, capped: 1_500 }, texas: { in: 50_000, out: 38_000, back: 2_000, capped: 0 } } },
  { day: '2026-10-14', total: 12_100_000, wallets: 40, grant: 100_000, relief: 2_000, games: {} },
];

/** 用模拟的管理员登录状态打开管理界面（不占真实登录次数）。 */
export const DEFAULT_RULES = { reliefTo: 2_000, winUnits: 10, newBalance: 10_000, adminAdjustMax: 1_000_000, exchangeCap: 2_000 };
export const FAKE_RULES = {
  rules: DEFAULT_RULES,
  defaults: DEFAULT_RULES,
  range: { reliefTo: [0, 1_000_000], winUnits: [1, 1_000], newBalance: [0, 10_000_000], adminAdjustMax: [1, 100_000_000], exchangeCap: [0, 1_000_000] },
  log: [],
  updatedAt: null,
};

/** 装作管理员登录着，管理页要读的接口都用假的；registration 是"开放注册"那块读到的状态。 */
export async function mockAdmin(page: Page, registration: object = { open: true, switchOpen: true, forcedOff: false, updatedAt: Date.UTC(2026, 9, 14, 12, 5) }): Promise<void> {
  await mockSession(page, { user: FAKE_ADMIN });
  await page.route('**/api/admin/users', (r) =>
    r.request().method() === 'GET'
      ? r.fulfill(json({ users: FAKE_LIST }))
      : r.fulfill(json({ user: FAKE_LIST[1], password: 'maple-otter-sunny-42', recoveryCode: 'BJ342-PD1HQ-H29E6-HZVR3' }, 201)),
  );
  await page.route('**/api/admin/settings/registration', (r) => r.fulfill(json(registration)));
  await page.route('**/api/admin/wallet-stats', (r) => r.fulfill(json({ days: FAKE_STATS })));
  await page.route('**/api/admin/settings/wallet', (r) => r.fulfill(json(FAKE_RULES)));
  await page.route('**/api/admin/overview', (r) => r.fulfill(json(FAKE_OVERVIEW)));
  await page.route('**/api/admin/settings/notice', (r) => r.fulfill(json({ notice: null, max: 120 })));
  await page.route('**/api/admin/settings/games', (r) => r.fulfill(json({ hidden: [] })));
  // 点开一个人就读他的钱包：默认给个没用过钱包的空摘要，要看具体内容的段落再单独挂（后挂的先匹配）
  await page.route('**/api/admin/wallet/*', (r) => r.fulfill(json({ ...FAKE_WALLET, log: [] })));
}

/** 用模拟的管理员打开管理页：先看一眼钱包统计画出来，再停在"用户"一区等账号列表。 */
export async function fakeAdmin(page: Page): Promise<void> {
  await mockAdmin(page);
  await page.goto(`${BASE}/admin?s=stats`);
  await page.getByTestId('wallet-stats').locator('.per-game li', { hasText: '德州扑克 带入 50,000 · 结回 38,000 · 退回 2,000' }).waitFor();
  // 打开后会话还会再读一次、可能把选中的分区重置：等网络静下来再点
  await page.waitForLoadState('networkidle');
  await adminSection(page, '用户');
  await findUser(page, 'xiaoming_2026');
}

export const FAKE_FRIENDS = {
  friends: [
    { userId: 'f1', displayName: '小明', avatar: null, lastSeenDaysAgo: 0, online: true, where: { place: 'room', game: 'guandan', room: '123456', seats: '3/4' } },
    { userId: 'f2', displayName: '名字有十二个字那么长的人', avatar: null, lastSeenDaysAgo: 1, online: false },
    { userId: 'f3', displayName: '阿花', avatar: null, lastSeenDaysAgo: 23 },
  ],
  incoming: [{ userId: 'f4', displayName: '新朋友', avatar: null }],
  outgoing: [{ userId: 'f5', displayName: '老同学', avatar: null }],
};

/** 用模拟的登录状态打开好友页（不占真实登录次数）。 */
/** 好友动态的样子：结回生成的（带称号）、游戏报的名场面（模板读游戏的 moments.json）、模板不合格的（不显示） */
export const FAKE_FEED = [
  { id: '00000000aAAAAAAAAAAAA', user: { userId: 'f1', displayName: '小明', avatar: null }, game: 'guandan', kind: 'settle', at: Date.now() - 5 * 60_000, data: { tier: 'small', units: 16, titles: ['double_down'] }, reactions: { like: 2 } },
  { id: '00000000bAAAAAAAAAAAA', user: { userId: 'f3', displayName: '阿花', avatar: null }, game: 'guandan', kind: 'moment', at: Date.now() - 3 * 3_600_000, data: { m: 'four_bombs', n: [4] }, reactions: {}, mine: 'tomato' },
  { id: '00000000cAAAAAAAAAAAA', user: { userId: 'f3', displayName: '阿花', avatar: null }, game: 'guandan', kind: 'moment', at: Date.now() - 4 * 3_600_000, data: { m: 'bad_tpl' }, reactions: {} },
];

export async function fakeFeedFiles(page: Page): Promise<void> {
  await page.route('**/games/guandan/moments.json', (r) =>
    r.fulfill(json({ four_bombs: { text: '{name}一副牌扔了 {n} 个炸弹' }, bad_tpl: { text: '<b>{who}</b>' } })),
  );
  await page.route('**/games/guandan/titles.json', (r) => r.fulfill(json({ double_down: { name: '双下王', desc: '打出双下' } })));
}

export async function fakeFriends(page: Page, invites: object[] = [], feed: object[] = []): Promise<void> {
  await mockSession(page, { invites, feed });
  await fakeFeedFiles(page);
  await page.route('**/api/friends', (r) => r.fulfill(json(FAKE_FRIENDS)));
  await page.route('**/api/blocks', (r) => r.fulfill(json({ blocks: [{ userId: 'f6', displayName: '烦人的人', avatar: null }] })));
  await page.route('**/api/friends/code/*', (r) => r.fulfill(json({ user: { userId: 'f7', displayName: '小红', avatar: null }, relation: 'pending_in' })));
  await page.goto(`${BASE}/friends`);
  await page.getByRole('heading', { name: '好友（3）' }).waitFor();
}

/** 管理页邀请码：没用、用过、过期、撤回各一条，加一个长期码（每次调用给一份新的，段落里改了不串到别的段） */
export function fakeInviteCodes() {
  const at = (h: number, m = 0) => Date.UTC(2026, 9, 17, h - 8, m);
  const p = (username: string, displayName: string) => ({ username, displayName });
  return [
    { id: 'c1', hint: '…XCWJ', code: 'K7QM-2RTP-XCWJ', status: 'unused', owner: p('owner', '阿国'), createdAt: at(20), expiresAt: at(20) + 7 * 86_400_000 },
    { id: 'c2', hint: '…1Y8K', status: 'used', owner: p('a_very_long_name_20', '名字有十二个字那么长的人'), createdAt: at(19, 39), expiresAt: 0, usedAt: at(19, 50), usedBy: p('pialfe2o3', 'pialfe2o3') },
    { id: 'c3', hint: '…3J1F', status: 'used', owner: p('qatest01', 'QA测试一'), createdAt: at(19, 38), expiresAt: 0, usedAt: at(19, 40), usedBy: null },
    { id: 'c4', hint: '…9PQR', status: 'expired', owner: null, createdAt: at(9, 5), expiresAt: at(9, 6) },
    { id: 'c5', hint: '…HHMM', status: 'revoked', owner: p('xiaoming_2026', '小明'), createdAt: at(8, 1), expiresAt: at(8, 1) + 86_400_000 },
    // 长期码：已用/上限、用它注册的人列前 3 个
    { id: 'c6', hint: '…7MUL', code: 'ABCD-EFGH-7MUL', status: 'unused', owner: p('owner', '阿国'), createdAt: at(7), expiresAt: null, maxUses: 100, uses: 4,
      users: [{ ...p('u1', '一号'), usedAt: at(8) }, { ...p('u2', '二号'), usedAt: at(8) }, { ...p('u3', '三号'), usedAt: at(8) }, { ...p('u4', '四号'), usedAt: at(8) }] },
  ].map((c) => ({ uses: c.status === 'used' ? 1 : 0, maxUses: 1, ...c }));
}

/** 管理页邀请码的两个读接口：规则和码表（status=multi 只回长期码） */
export async function mockInviteCodes(page: Page, codes: { maxUses: number }[] = fakeInviteCodes()): Promise<void> {
  const rules = { userQuota: 3, adminQuota: 50, ttlDays: 7, perDay: 5 };
  const range = { userQuota: [0, 100], adminQuota: [0, 1_000], ttlDays: [1, 90], perDay: [1, 100] };
  await page.route('**/api/admin/settings/invites', (r) => r.fulfill(json({ rules, defaults: rules, range })));
  await page.route('**/api/admin/invite-codes?*', (r) => r.fulfill(json({ codes: r.request().url().includes('status=multi') ? codes.filter((c) => c.maxUses > 1) : codes })));
}

/** 战绩页：自己和 otherId 那个人各玩过开盘、德州（德州 1,000 局，数字最长） */
export async function mockStats(page: Page, otherId: string): Promise<void> {
  const career = (o: Record<string, unknown>) => ({ n: 3, net: 2_000, wnet: 0, rounds: 0, wins: 0, best: 0, titles: [], max: {}, sum: {}, ...o });
  const games = { kaipan: career({ n: 2, wnet: 12_000, rounds: 2, wins: 1, best: 12_000 }), texas: career({ n: 4, wnet: -1_500, rounds: 1_000, wins: 213, best: 18_400 }) };
  await page.route(`**/api/stats/${otherId}`, (r) => r.fulfill(json({ user: { userId: otherId, displayName: '玩家1', avatar: null }, relation: 'none', week: '2026-10-12', games })));
  await page.route('**/api/stats/me', (r) => r.fulfill(json({ user: { userId: FAKE_ADMIN.id, displayName: FAKE_ADMIN.displayName, avatar: null }, relation: 'self', week: '2026-10-12', games })));
  await page.route('**/games/*/titles.json', (r) => r.fulfill(json({})));
}
