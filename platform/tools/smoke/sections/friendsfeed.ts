/** 冒烟分段：friendsFeed（npm run smoke -- --only=<段名>，段名表在 tools/smoke.ts） */
import type { Browser, Page } from 'playwright-core';
import { BASE, fail, check, shot, newPage, json } from '../lib/core.ts';
import { mockSession, FAKE_FRIENDS } from '../lib/fakes.ts';

/** 页面不滚、翻页区里的内容没被裁（docs/ui.md 第 11 节）。 */
async function noScroll(page: Page, label: string, what: string): Promise<void> {
  const m = await page.evaluate(() => ({
    sh: document.documentElement.scrollHeight,
    ch: document.documentElement.clientHeight,
    cut: [...document.querySelectorAll<HTMLElement>('.paged__list')].filter((el) => el.scrollHeight > el.clientHeight + 1).length,
  }));
  check(m.sh <= m.ch, `${label}：${what}整页在滚（${m.sh} / ${m.ch}）`);
  check(m.cut === 0, `${label}：${what}有列表内容被裁掉`);
}

/**
 * 好友页和动态页，好友多、动态多的时候：好友列表和动态都翻页、整页不滚；
 * 电脑上三栏（好友码和加好友 / 好友列表 / 请求）等高，手机上用页签；动态页电脑排两列，长说明点"展开"在弹窗里看。
 */
export async function friendsFeed(browser: Browser): Promise<void> {
  const many = {
    ...FAKE_FRIENDS,
    friends: Array.from({ length: 18 }, (_, i) => ({ userId: `m${i}`, displayName: i === 3 ? '名字有十二个字那么长的人' : `牌友${i + 1}号`, avatar: null, lastSeenDaysAgo: i % 5, online: i % 4 === 0 })),
  };
  const titleIds = ['double_down', 't2', 't3', 't4', 't5'];
  const feed = Array.from({ length: 25 }, (_, i) => ({
    id: `0000000${String.fromCharCode(97 + (i % 26))}${String(i).padStart(2, '0')}AAAAAAAAAAA`.slice(0, 21),
    user: { userId: `m${i % 18}`, displayName: i === 1 ? '名字有十二个字那么长的人' : `牌友${(i % 18) + 1}号`, avatar: null },
    game: 'guandan',
    kind: i % 3 === 2 ? 'moment' : 'settle',
    at: Date.now() - (i + 1) * 20 * 60_000,
    data: i % 3 === 2 ? { m: 'four_bombs', n: [i + 2] } : { tier: 'small', units: 12 + i, titles: i === 0 ? titleIds : i % 3 === 1 ? ['double_down'] : [] },
    reactions: i % 4 === 0 ? { like: 3, rose: 1 } : {},
  }));
  const titles = Object.fromEntries(titleIds.map((id, k) => [id, { name: k ? `称号${k}` : '双下王', desc: '一局里打出双下，对家两个人都还没出完牌就被你们走完了，这种称号的说明故意写得很长' }]));
  for (const [label, screen, viewport] of [
    ['1280', 'desktop', { width: 1280, height: 800 }],
    ['1920', 'desktop', { width: 1920, height: 1080 }],
    ['390', 'portrait', { width: 390, height: 844 }],
  ] as const) {
    console.log(`好友页和动态页（${label}）：好友 18 个、动态 25 条`);
    const { ctx, page } = await newPage(browser, `好友动态 ${label}`, screen, { viewport });
    await mockSession(page, { feed });
    await page.route('**/games/guandan/moments.json', (r) => r.fulfill(json({ four_bombs: { text: '{name}一副牌扔了 {n} 个炸弹' } })));
    await page.route('**/games/guandan/titles.json', (r) => r.fulfill(json(titles)));
    await page.route('**/api/friends', (r) => r.fulfill(json(many)));
    await page.route('**/api/blocks', (r) => r.fulfill(json({ blocks: [] })));
    await page.goto(`${BASE}/friends`);
    await page.getByRole('heading', { name: '好友（18）' }).waitFor();
    check((await page.getByTestId('feed').count()) === 0, `${label}：好友页不该铺动态`);
    await noScroll(page, label, '好友页');
    // 18 个好友一页放不下：有翻页条，往后翻能看到后面的人，翻完整页还是不滚
    const at = page.getByTestId('friends-paged-at');
    const total = Number((await at.textContent())!.split('/')[1]);
    check(total > 1, `${label}：18 个好友该分页（${await at.textContent()}）`);
    check((await page.getByTestId('person-牌友1号').count()) === 1, `${label}：第一页该有第一个好友`);
    check((await page.getByTestId('person-牌友18号').count()) === 0, `${label}：最后一个好友不该在第一页`);
    for (let i = 1; i < total; i++) await page.getByRole('button', { name: '下一页' }).click();
    await page.getByTestId('person-牌友18号').waitFor();
    check((await at.textContent())!.startsWith(`${total} /`), `${label}：翻到最后一页该是 ${total} / ${total}（${await at.textContent()}）`);
    await noScroll(page, label, '好友页最后一页');
    if (screen === 'desktop') {
      // 各栏顶部对齐、不强求等高（0.39.13 起人少的栏按内容高）；要翻页的好友栏撑满，是最高的那栏
      const cols = await page.locator('.friends-page .ptabs__pane').evaluateAll((els) => els.map((e) => ({ top: Math.round(e.getBoundingClientRect().top), h: Math.round(e.getBoundingClientRect().height), list: !!e.querySelector('[data-testid="friends-paged"]') })));
      check(cols.length >= 2 && cols.every((c) => Math.abs(c.top - cols[0]!.top) <= 2), `${label}：电脑上各栏该顶部对齐（${cols.map((c) => c.top).join(' / ')}）`);
      const list = cols.find((c) => c.list);
      check(!!list && cols.every((c) => c.h <= list.h + 2), `${label}：要翻页的好友栏该撑满、最高（${cols.map((c) => c.h).join(' / ')}）`);
      check((await page.getByTestId('share-link').isVisible()) && (await page.locator('.friends-add').isVisible()), `${label}：电脑上好友码和加好友该直接看得到`);
    } else {
      const ys = await Promise.all(['ptab-friends', 'friends-paged'].map(async (t) => (await page.getByTestId(t).boundingBox())!.y));
      check(ys[0]! < ys[1]!, `${label}：手机上页签该在好友列表上面（${ys.join(',')}）`);
      for (const t of ['req', 'add', 'code']) check((await page.getByTestId(`ptab-${t}`).count()) === 1, `${label}：手机上该有"${t}"页签`);
      for (const el of await page.locator('.feed-entry, .people .btn').all()) {
        const b = await el.boundingBox();
        if (b && b.height < 44) fail(`${label}：好友页「${(await el.textContent())?.trim()}」不到 44 高`);
      }
      await page.getByTestId('ptab-add').click();
      for (const el of await page.locator('.friends-add .btn').all()) {
        const b = await el.boundingBox();
        if (b && b.height < 44) fail(`${label}：好友页「${(await el.textContent())?.trim()}」不到 44 高`);
      }
      await page.getByTestId('ptab-friends').click();
    }
    await shot(page, `friends-many-${label}`);
    await page.getByTestId('feed-entry').click();
    await page.waitForURL(`${BASE}/feed`);
    const list = page.getByTestId('feed');
    await list.getByTestId('feed-item').first().waitFor();
    await noScroll(page, label, '动态页');
    const n1 = await list.getByTestId('feed-item').count();
    check(n1 > 0 && n1 < 25, `${label}：25 条动态一页放不下，该只有一部分（${n1}）`);
    const feedAt = page.getByTestId('feed-at');
    const feedPages = Number((await feedAt.textContent())!.split('/')[1]);
    check(feedPages > 1, `${label}：动态该分页（${await feedAt.textContent()}）`);
    if (screen === 'desktop') {
      // 电脑上排两列：同一行的两条在左右
      const xs = new Set(await list.getByTestId('feed-item').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().x))));
      check(xs.size >= 2, `${label}：电脑上动态该排两列（${[...xs].join(',')}）`);
    }
    // 长说明：默认两行，点"展开"在弹窗里看全文
    const more = list.getByTestId('feed-item').first().getByRole('button', { name: '展开' });
    await more.click();
    const full = page.getByTestId('feed-note-modal');
    await full.waitFor();
    check(((await full.textContent()) ?? '').includes('这种称号的说明故意写得很长'), `${label}：弹窗里该是完整说明`);
    await page.keyboard.press('Escape');
    await full.waitFor({ state: 'detached' });
    await shot(page, `feed-${label}`, false);
    // 扔个道具在弹窗里选；翻页后不滚
    const withProps = list.getByRole('button', { name: '扔个道具' }).first();
    await withProps.click();
    await page.getByTestId('feed-props-modal').getByRole('button', { name: '玫瑰' }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByTestId('feed-props-modal').waitFor({ state: 'detached' });
    for (let i = 1; i < feedPages; i++) await page.getByRole('button', { name: '下一页' }).click();
    check((await feedAt.textContent())!.startsWith(`${feedPages} /`), `${label}：动态翻到最后一页（${await feedAt.textContent()}）`);
    await noScroll(page, label, '动态页最后一页');
    if (screen !== 'desktop') {
      for (const el of await page.locator('.feedpage button, .feedpage a').all()) {
        const b = await el.boundingBox();
        if (b && b.height < 44) fail(`${label}：动态页「${(await el.textContent())?.trim()}」不到 44 高`);
      }
    }
    await ctx.close();
  }
}
