/** 真走本地 D1 的账号：这次跑的用户名、登录、管理命令行工具、管理页的导航 */
import { spawnSync } from 'node:child_process';
import type { Locator, Page } from 'playwright-core';
import { BASE, fail, check } from './core.ts';
import { ADMIN_TOKEN } from './fakes.ts';

const STAMP = Date.now().toString(36);
/** 管理员（管理命令行工具建）、朋友（管理员在界面上建，密码自动生成）、给管理员删的号。用户名最长 20 位。 */
export const ADMIN = `owner_${STAMP}`;
export const NAME = `smoke_${STAMP}`;
export const NAME2 = `smoke2_${STAMP}`;
export const PW2 = 'Smoke-Test-Pass-2';
export const PW3 = 'Smoke-Test-Pass-3';
export const READABLE = /^[a-z]+-[a-z]+-[a-z]+-\d{2}$/;

export async function breathe(page: Page, seconds: number): Promise<void> {
  console.log(`  （等 ${seconds} 秒，让匿名接口的令牌回满）`);
  await page.waitForTimeout(seconds * 1000);
}

export async function login(page: Page, username: string, password: string): Promise<void> {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('用户名').fill(username);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录' }).click();
  await page.locator('.account__name').waitFor();
}

/** 跑一次管理命令行工具（和维护者用的是同一个脚本），接口指向本地。 */
function adminCli(args: string[], token = ADMIN_TOKEN): { code: number; out: string } {
  const r = spawnSync(process.execPath, ['tools/admin.ts', ...args, `--base=${BASE}`], {
    encoding: 'utf8',
    env: { ...process.env, ARCADE_ADMIN_TOKEN: token },
  });
  const out = `${r.stdout}${r.stderr}`;
  check(!out.includes(token), '建号工具不该把令牌打印出来');
  return { code: r.status ?? -1, out };
}

export const field = (out: string, name: string): string => new RegExp(`^${name}：(.+)$`, 'm').exec(out)?.[1]?.trim() ?? fail(`输出里没有"${name}"：\n${out}`);

/** 管理命令行工具：返回建好、又重设过一次的管理员密码。 */
export function cli(): string {
  console.log('管理命令行工具：令牌不对 401；用对的令牌建管理员、列出账号；不打印令牌');
  const wrong = adminCli(['list'], 'smoke:wrong-token-0000000000');
  check(wrong.code === 1 && wrong.out.includes('401'), `令牌不对时应该 401 退出：\n${wrong.out}`);
  const made = adminCli(['create', ADMIN, '冒烟阿国', '--admin']);
  check(made.code === 0, `建管理员失败：\n${made.out}`);
  check(made.out.includes('（管理员）'), `建出来的应该是管理员：\n${made.out}`);
  const pw = field(made.out, '密码');
  check(READABLE.test(pw), `生成的密码不像"3 个词 + 2 位数字"：${pw}`);
  check(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}/.test(field(made.out, '恢复码')), '建号工具没给恢复码');
  check(field(made.out, '游戏地址') === BASE, '发给对方的话里游戏地址不对');
  const list = adminCli(['list']);
  check(list.code === 0 && new RegExp(`${ADMIN}\\t冒烟阿国\\t管理员`).test(list.out), `list 里没有刚建的管理员：\n${list.out}`);
  const bad = adminCli(['create', 'x']);
  check(bad.code === 1 && bad.out.includes('用法'), '参数不对时应该给用法');
  // 令牌里混了换行：先挡住，不发请求，报错里也不带原文（adminCli 会查输出里有没有令牌）
  const newline = adminCli(['list'], 'smoke:secret-part-one\nsecret-part-two');
  check(newline.code === 1 && newline.out.includes('令牌格式不对') && !newline.out.includes('secret-part'), `令牌格式不对时应该拒绝且不回显：\n${newline.out}`);
  // 不是 https 也不是本机：不把令牌明文发出去
  const plain = spawnSync(process.execPath, ['tools/admin.ts', 'list', '--base=http://example.com'], {
    encoding: 'utf8',
    env: { ...process.env, ARCADE_ADMIN_TOKEN: ADMIN_TOKEN },
  });
  check(plain.status === 1 && plain.stderr.includes('只能是 https'), `--base 是外站 http 时应该拒绝：\n${plain.stderr}`);
  // 没给站点地址：不猜默认地址，直接报错
  const { ARCADE_BASE_URL: _unused, ...noBase } = process.env;
  const missing = spawnSync(process.execPath, ['tools/admin.ts', 'list'], { encoding: 'utf8', env: { ...noBase, ARCADE_ADMIN_TOKEN: ADMIN_TOKEN } });
  check(missing.status === 1 && missing.stderr.includes('不知道站点地址'), `没给 --base 也没设 ARCADE_BASE_URL 时应该报错：\n${missing.stderr}`);
  // 用户名按 NFKC 找：全角也认
  const fullwidth = adminCli(['reset', ADMIN.replace('o', 'Ｏ')]);
  check(fullwidth.code === 0 && fullwidth.out.includes('重设好了'), `全角用户名应该也能找到：\n${fullwidth.out}`);
  const pw2 = field(fullwidth.out, '密码');
  check(READABLE.test(pw2) && pw2 !== pw, '重设后应该是新生成的密码');
  return pw2;
}

/** 管理页（分区）：点左边（窄屏是顶上）的分区导航，等那一区出来 */
export async function adminSection(page: Page, label: '概览' | '用户' | '钱包统计' | '设置'): Promise<void> {
  const id = { 概览: 'overview', 用户: 'users', 钱包统计: 'stats', 设置: 'settings' }[label];
  await page.locator('.console__nav').getByRole('link', { name: label }).click();
  await page.getByTestId(`admin-${id}`).waitFor();
}

/** 管理页·用户列表里的一个人：列表按高度翻页（矮屏一页可能只放一个），没在这一页就往后翻 */
export async function findUser(page: Page, username: string): Promise<Locator> {
  const row = page.getByTestId(`user-${username}`);
  const next = page.getByTestId('admin-users').getByRole('button', { name: '下一页' });
  await page.getByTestId('admin-users').locator('[data-testid^="user-"]').first().waitFor();
  for (let i = 0; i < 20 && (await row.count()) === 0 && (await next.count()) > 0 && (await next.isEnabled()); i++) await next.click();
  await row.waitFor();
  return row;
}

/** 管理页·用户：点列表里的一个人，等右边（窄屏是进去的）详情出来，返回详情 */
export async function pickUser(page: Page, username: string): Promise<Locator> {
  await (await findUser(page, username)).click();
  const detail = page.getByTestId(`detail-${username}`);
  await detail.waitFor();
  return detail;
}
