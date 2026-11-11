/** 冒烟分段：adminInvites（npm run smoke -- --only=<段名>，段名表在 tools/smoke.ts） */
import type { Browser } from 'playwright-core';
import { BASE, check, shot, newPage, json } from '../lib/core.ts';
import { mockAdmin } from '../lib/fakes.ts';

/** 管理页的钱包规则：不合格的数直接提示、不发请求；改一条要确认，发的只有改了的那条，改完显示记录。 */
/** 管理页"邀请码"。宽屏、普通电脑、手机各截一张：行高紧凑、码表不撑破面板、一屏放下不滚、完整的码能复制、状态小色块、已注销灰着 */
export async function adminInvites(browser: Browser): Promise<void> {
  const at = (h: number, m = 0) => Date.UTC(2026, 9, 17, h - 8, m);
  const p = (username: string, displayName: string) => ({ username, displayName });
  const codes = [
    { id: 'c1', hint: '…XCWJ', code: 'K7QM-2RTP-XCWJ', status: 'unused', owner: p('owner', '阿国'), createdAt: at(20), expiresAt: at(20) + 7 * 86_400_000 },
    { id: 'c2', hint: '…1Y8K', status: 'used', owner: p('a_very_long_name_20', '名字有十二个字那么长的人'), createdAt: at(19, 39), expiresAt: 0, usedAt: at(19, 50), usedBy: p('pialfe2o3', 'pialfe2o3') },
    { id: 'c3', hint: '…3J1F', status: 'used', owner: p('qatest01', 'QA测试一'), createdAt: at(19, 38), expiresAt: 0, usedAt: at(19, 40), usedBy: null },
    { id: 'c4', hint: '…9PQR', status: 'expired', owner: null, createdAt: at(9, 5), expiresAt: at(9, 6) },
    { id: 'c5', hint: '…HHMM', status: 'revoked', owner: p('xiaoming_2026', '小明'), createdAt: at(8, 1), expiresAt: at(8, 1) + 86_400_000 },
  ];
  const range = { userQuota: [0, 100], adminQuota: [0, 1_000], ttlDays: [1, 90], perDay: [1, 100] };
  const rules = { userQuota: 3, adminQuota: 50, ttlDays: 7, perDay: 5 };
  const screens = [
    ['wide', 'desktop', { viewport: { width: 2000, height: 1000 } }],
    ['desktop', 'desktop', {}],
    ['portrait', 'portrait', {}],
  ] as const;
  for (const [name, screen, extra] of screens) {
    console.log(`管理页·邀请码（${name}）：行高、码表不出框、复制完整的码`);
    const { ctx, page } = await newPage(browser, `邀请码 ${name}`, screen, { ...extra, permissions: ['clipboard-read', 'clipboard-write'] });
    await mockAdmin(page);
    await page.route('**/api/admin/settings/invites', (r) => r.fulfill(json({ rules, defaults: rules, range })));
    await page.route('**/api/admin/invite-codes?*', (r) => r.fulfill(json({ codes })));
    await page.goto(`${BASE}/admin?s=invites`);
    // 窄屏三个页签：额度、单独改额度、邀请码；宽屏左边两个表单、右边码表
    await page.waitForLoadState('networkidle');
    const codesTab = page.getByTestId('ptab-codes');
    if (await codesTab.count()) await codesTab.click();
    const table = page.getByTestId('invite-code-table');
    await table.getByText('K7QM-2RTP-XCWJ').waitFor();
    const rowH = await table.locator('.invite-code').first().evaluate((el) => el.getBoundingClientRect().height);
    // 一个码两行；竖屏上"复制"按钮是 44 高的点击区，一行约 61px；折行撑高时远不止这些
    check(rowH < (screen === 'portrait' ? 68 : 60), `邀请码一行不该被撑高：${rowH}px`);
    const panel = page.locator('.panel', { has: table });
    const [pb, tb, segW] = await Promise.all([panel.boundingBox(), table.boundingBox(), panel.locator('.seg').evaluate((el) => el.getBoundingClientRect().width - [...el.children].reduce((w, c) => w + c.getBoundingClientRect().width, 0))]);
    check(!!pb && !!tb && tb.x + tb.width <= pb.x + pb.width + 1 && tb.y + tb.height <= pb.y + pb.height + 1, '码表不该超出面板');
    check(segW <= 8, `分段按钮该贴着内容宽：按钮后面空着 ${segW}px`);
    const over = await page.evaluate(() => ({ x: document.documentElement.scrollWidth - window.innerWidth, y: document.documentElement.scrollHeight - window.innerHeight }));
    check(over.x <= 1 && over.y <= 1, `一屏放下，整页不该滑（${name}）：横 ${over.x}px、竖 ${over.y}px`);
    check((await page.getByTestId('invite-quota').locator('select.field__input').count()) === 1, '"谁"的下拉框该和输入框一个样式');
    // 码表按高度翻页（竖屏一页放不下 5 个）：逐页数，数完翻回第一页
    let dead = await table.getByText('已注销').count();
    const next = table.getByRole('button', { name: '下一页' });
    let flips = 0;
    for (; flips < 10 && (await next.count()) > 0 && (await next.isEnabled()); flips++) {
      await next.click();
      dead += await table.getByText('已注销').count();
    }
    for (let i = 0; i < flips; i++) await table.getByRole('button', { name: '上一页' }).click();
    check(dead === 2, `注销了的发码人和用码人都该写"已注销"（数到 ${dead} 个）`);
    await table.locator('.invite-code', { hasText: 'K7QM' }).getByRole('button', { name: '复制' }).click();
    await table.getByRole('button', { name: '已复制' }).waitFor();
    check((await page.evaluate(() => navigator.clipboard.readText())) === 'K7QM-2RTP-XCWJ', '复制的该是完整的码');
    await shot(page, `admin-invites-${name}`);
    await ctx.close();
  }
}
