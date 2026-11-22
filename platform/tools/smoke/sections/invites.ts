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
    // 长期码：已用/上限、用它注册的人列前 3 个
    { id: 'c6', hint: '…7MUL', code: 'ABCD-EFGH-7MUL', status: 'unused', owner: p('owner', '阿国'), createdAt: at(7), expiresAt: null, maxUses: 100, uses: 4,
      users: [{ ...p('u1', '一号'), usedAt: at(8) }, { ...p('u2', '二号'), usedAt: at(8) }, { ...p('u3', '三号'), usedAt: at(8) }, { ...p('u4', '四号'), usedAt: at(8) }] },
  ].map((c) => ({ uses: c.status === 'used' ? 1 : 0, maxUses: 1, ...c }));
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
    await page.route('**/api/admin/invite-codes?*', (r) => r.fulfill(json({ codes: r.request().url().includes('status=multi') ? codes.filter((c) => c.maxUses > 1) : codes })));
    let made: unknown = null;
    await page.route('**/api/admin/invite-codes', (r) => {
      made = r.request().postDataJSON();
      return r.fulfill(json({ id: 'c7', code: 'WXYZ-2345-6789', link: '/i/WXYZ23456789', maxUses: 100, expiresAt: null }, 201));
    });
    await page.goto(`${BASE}/admin?s=invites`);
    // 窄屏四个页签：额度、长期码、单独改额度、邀请码；宽屏左边三个表单、右边码表
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
    // 按码去重：翻到有高条目的一页时每页条数会变少、边界后移，同一个码可能在两页都出现
    const seen = new Map<string, { dead: number; multi: number }>();
    const tally = async () => {
      for (const row of await table.locator('.invite-code').all()) {
        const code = (await row.locator('.invite-code__code').textContent()) ?? '';
        seen.set(code, { dead: await row.getByText('已注销').count(), multi: await row.getByText('能用 4/100').count() });
      }
    };
    // 码表吃满面板剩下的高（以前一份全局样式把它变成网格，1280×800 一页只放 3 条、下面空一大块）。
    // Paged 按见过的最高一条估每页条数，所以有翻页时最后一条下面最多空出不到两条高
    const fill = await table.evaluate((t) => {
      const list = t.querySelector('.paged__list')!.getBoundingClientRect();
      const rows = [...t.querySelectorAll('.invite-code')].map((r) => r.getBoundingClientRect());
      return { paged: !!t.querySelector('.paged__bar'), free: list.bottom - rows[rows.length - 1]!.bottom, row: Math.max(...rows.map((r) => r.height)), n: rows.length };
    });
    check(!fill.paged || fill.free < 2 * fill.row, `码表下面空着 ${Math.round(fill.free)}px，还放得下一条（${name}，一页 ${fill.n} 条）`);
    await tally();
    const next = table.getByRole('button', { name: '下一页' });
    let flips = 0;
    for (; flips < 10 && (await next.count()) > 0 && (await next.isEnabled()); flips++) {
      await next.click();
      await tally();
    }
    const dead = [...seen.values()].reduce((t, r) => t + r.dead, 0);
    const multi = [...seen.values()].reduce((t, r) => t + r.multi, 0);
    check(seen.size === codes.length, `翻完该见到全部 ${codes.length} 个码（见到 ${seen.size} 个）`);
    const prev = table.getByRole('button', { name: '上一页' });
    for (let i = 0; i < 10 && (await prev.count()) > 0 && (await prev.isEnabled()); i++) await prev.click();
    check(dead === 2, `注销了的发码人和用码人都该写"已注销"（数到 ${dead} 个）`);
    check(multi === 1, `长期码该显示一次 已用/上限（数到 ${multi} 个）`);
    await table.locator('.invite-code', { hasText: 'K7QM' }).getByRole('button', { name: '复制' }).click();
    await table.getByRole('button', { name: '已复制' }).waitFor();
    check((await page.evaluate(() => navigator.clipboard.readText())) === 'K7QM-2RTP-XCWJ', '复制的该是完整的码');
    await shot(page, `admin-invites-${name}`);
    // 码表顶上一直有"新建长期邀请码"（不用先筛到长期码）：点开是表单，默认 100 次、不过期；建好显示新码，能一键复制完整链接和码
    await panel.getByTestId('multi-new').click();
    const form = page.getByTestId('multi-code');
    const posted = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/admin/invite-codes');
    await form.getByRole('button', { name: '建好' }).click();
    await posted;
    check(JSON.stringify(made) === JSON.stringify({ maxUses: 100, days: null }), `建长期码发的不对：${JSON.stringify(made)}`);
    const created = page.getByTestId('multi-created');
    await created.getByRole('button', { name: '复制链接' }).click();
    await created.getByRole('button', { name: '链接已复制' }).waitFor();
    check((await page.evaluate(() => navigator.clipboard.readText())) === `${BASE}/i/WXYZ23456789`, '复制链接该是完整的注册链接');
    await created.getByRole('button', { name: '复制码' }).click();
    await created.getByRole('button', { name: '码已复制' }).waitFor();
    check((await page.evaluate(() => navigator.clipboard.readText())) === 'WXYZ-2345-6789', '复制码该是完整的码');
    check(await panel.getByRole('button', { name: '长期码' }).getAttribute('aria-pressed') === 'true', '建好后码表该筛到长期码');
    const over2 = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    check(over2 <= 1, `长期码筛选下一屏放下（${name}）：竖 ${over2}px`);
    await shot(page, `admin-invites-multi-${name}`);
    // 长期码改次数：弹框默认是现在的次数，改成上限 10000 发出去；码表重读后写"能用 4/10000"
    let usesBody: unknown = null;
    await page.route('**/api/admin/invite-codes/c6/uses', (r) => {
      usesBody = r.request().postDataJSON();
      const c6 = codes.find((c) => c.id === 'c6')!;
      c6.maxUses = 10_000;
      return r.fulfill(json({ id: 'c6', maxUses: 10_000 }));
    });
    await table.locator('.invite-code', { hasText: '7MUL' }).getByTestId('code-uses').click();
    const usesForm = page.getByTestId('code-uses-form');
    const usesInput = usesForm.getByLabel('能用几次');
    check((await usesInput.inputValue()) === '100', `改次数的框该先填现在的次数（是 ${await usesInput.inputValue()}）`);
    await usesInput.fill('10000');
    await shot(page, `admin-invites-uses-${name}`);
    await usesForm.getByRole('button', { name: '保存' }).click();
    await table.locator('.invite-code', { hasText: '7MUL' }).getByText('能用 4/10000').waitFor();
    check(JSON.stringify(usesBody) === JSON.stringify({ maxUses: 10_000 }), `改次数发的不对：${JSON.stringify(usesBody)}`);
    check((await usesForm.count()) === 0 || !(await usesForm.isVisible()), '改好后弹框该收起');
    codes.find((c) => c.id === 'c6')!.maxUses = 100; // 假数据各尺寸共用，改回去
    await ctx.close();
  }
}
