/**
 * --bounty：悬赏出海（实盘）这一批的真人流程（DESIGN 4.5–4.7），钱包是假的（shot-fake.ts → 真的 worker/live.ts + fake-bank.ts）：
 * 顶栏「换」→ 金银锭换筹码 → 海图「悬赏出海（实盘）」→ 连闯三座 → 带入 → 真人登陆打第一座 → 过了就收手（没过直接结）→ 结算 → 回家
 * → 船长档案的收藏页 → 用筹码买一件装饰。核对钱包里兑换走 hx-i-、装饰走 hd- 命名空间，余额按步对得上。
 */
import { newProfile } from '../src/core/index.ts';
import { CHIP_SHOP, LIVE_STAKE } from '../src/content/livetable.ts';
import { FakePvp } from './shot-fake.ts';
import { layoutProblems, type ShotCtx } from './shot-lib.ts';

export async function bounty(c: ShotCtx): Promise<boolean> {
  const { page, v, ROOT, problems, shot, tap, sceneIs, step, click, beach, ready } = c;
  const fake = new FakePvp();
  await fake.seed();
  await fake.route(page, problems);
  // 五关三星、已领 5 锭：手里正好 5 锭，兑换面板有「换 1 锭」「换 5 锭」
  const stars = { c01: 3, c02: 3, c03: 3, c04: 3, c05: 3 };
  const save = JSON.stringify({ profile: { ...newProfile(), tutorial: 99, stars, ingot: { claimed: 5, spent: 0 }, res: { gold: 1500, wood: 1500 }, stats: { attacks: 1, wins: 1, lootGold: 0, lootWood: 0 } }, lastSeen: Date.now() });
  await page.addInitScript((sv) => {
    if (!localStorage.getItem('haidao.save')) localStorage.setItem('haidao.save', sv);
  }, save);
  const check = async (what: string): Promise<void> => {
    for (const p of await layoutProblems(page)) problems.push(`${v.name} ${what} ${p}`);
  };
  const want = async (bal: number, what: string): Promise<void> => {
    for (let i = 0; i < 40 && fake.bank.balance !== bal; i++) await page.waitForTimeout(100);
    if (fake.bank.balance !== bal) throw new Error(`${what}后钱包余额 ${fake.bank.balance}，应为 ${bal}`);
  };
  let bal = fake.bank.balance;
  const ok =
    (await step('金银锭换筹码', async () => {
      await page.goto(`${ROOT}?fast`, { timeout: 60_000 });
      await ready();
      await page.waitForTimeout(800);
      await click('.hd-live-xbtn');
      const five = page.locator('.hd-dialog button:has-text("换 5 锭")');
      await five.waitFor({ timeout: 8000 });
      await page.waitForTimeout(400);
      await shot('ingot-exchange');
      await check('兑换面板');
      await five.click({ timeout: 8000 });
      await want((bal += 500), '换 5 锭');
      const ex = fake.bank.calls.filter((x) => x.m === 'exchange');
      if (ex.length !== 1 || !String(ex[0]!.a.op).startsWith('hx-i-')) throw new Error(`兑换没走 hx-i- 命名空间：${JSON.stringify(ex)}`);
      await page.locator('.hd-dialog', { hasText: '手里 0 锭' }).waitFor({ timeout: 8000 });
      await click('.hd-dialog button:has-text("不换了")');
    })) &&
    (await step('悬赏连闯选档', async () => {
      await click('.hd-bottom button:has-text("出海")');
      await click('.hd-live-mapbtn');
      await page.locator('.hd-live-card button:has-text("出海")').first().waitFor({ timeout: 8000 });
      await click('.hd-live-mode button:has-text("连闯")');
      await page.waitForTimeout(500);
      await shot('streak-tiers');
      await check('悬赏连闯选档');
      if (!/星以上算过/.test((await page.locator('.hd-live-tiers').textContent()) ?? '')) throw new Error('连闯选档页没写几星算过');
    })) &&
    (await step('带入打第一座', async () => {
      await page.locator('.hd-live-card button:has-text("出海")').first().click({ timeout: 8000 });
      const go = page.locator('.hd-dialog .hd-btn-gold', { hasText: '确定' }).last();
      await go.waitFor({ timeout: 8000 });
      await go.click({ timeout: 8000 });
      await sceneIs('battle', 40_000);
      await want((bal -= LIVE_STAKE.small), '带入');
      await page.waitForTimeout(600);
      const vp = page.viewportSize()!;
      await tap(vp.width / 2, vp.height / 2);
      await page.waitForTimeout(400);
      const boats = await page.locator('.hd-boat').count();
      for (let i = 0; i < boats + 2; i++) {
        if ((await page.locator('.hd-boat:not(.done)').count()) === 0) break;
        if ((await page.locator('.hd-boat.sel').count()) === 0) {
          await click('.hd-boat:not(.done)').catch(() => page.locator('.hd-boat:not(.done)').first().evaluate((e) => (e as HTMLElement).click()));
        }
        await page.waitForTimeout(200);
        const bp = await beach(i % 2);
        if (!bp) throw new Error('没有海滩点');
        await tap(bp.x, bp.y);
        await page.waitForTimeout(300);
      }
      await page.waitForTimeout(1500);
      await shot('streak-battle');
    })) &&
    (await step('收手结算', async () => {
      const stop = page.locator('.hd-dialog button:has-text("收手")');
      const home = page.locator('.hd-live button:has-text("回家")');
      await stop.or(home).first().waitFor({ timeout: 180_000 });
      if (await stop.count()) {
        await page.waitForTimeout(400);
        await shot('streak-choice');
        await check('连闯过一座的选择');
        await stop.click({ timeout: 8000 });
      }
      await home.waitFor({ timeout: 15_000 });
      await page.waitForTimeout(600);
      await shot('streak-result');
      await check('连闯结算');
      const set = fake.bank.calls.filter((x) => x.m === 'settle');
      if (set.length !== 1) throw new Error(`连闯应结回一次：${JSON.stringify(set)}`);
      bal += Number(set[0]!.a.amount);
      await want(bal, '结回');
      await home.click({ timeout: 8000 });
      await sceneIs('base');
      await page.waitForTimeout(800);
    })) &&
    (await step('收藏页买装饰', async () => {
      await click('.hd-profile');
      await click('.hd-sheet button:has-text("成就和称号")');
      await click('.hd-sheet .hd-tabs button:has-text("收藏")');
      const buy = page.locator('.hd-sheet .hd-ach button:has-text("买"):visible').first();
      // 电脑上收藏页分页，「用筹码买」在后面几页
      const next = page.locator('.hd-sheet button:has-text("下一页"):visible:enabled');
      for (let i = 0; i < 5 && (await buy.count()) === 0 && (await next.count()) > 0; i++) {
        await next.first().click({ timeout: 8000 });
        await page.waitForTimeout(300);
      }
      await buy.waitFor({ timeout: 8000 });
      await page.waitForTimeout(400);
      await shot('shop');
      await check('收藏页（用筹码买）');
      await buy.click({ timeout: 8000 });
      await page.locator('.hd-dialog button:has-text("买")').last().click({ timeout: 8000 });
      await want((bal -= CHIP_SHOP['deco:flagpole']!), '买旗杆');
      const shopOps = fake.bank.calls.filter((x) => String(x.a.op ?? '').startsWith('hd-'));
      if (!shopOps.length) throw new Error('买装饰没走 hd- 命名空间');
      await page.waitForTimeout(800);
      const cos = await page.evaluate(() => JSON.parse(localStorage.getItem('haidao.save') ?? '{}').profile?.cosmetics ?? []);
      if (!cos.includes('deco:flagpole')) throw new Error(`买到的旗杆没进存档：${JSON.stringify(cos)}`);
      await shot('shop-bought');
      await click('.hd-sheet .hd-x');
    }));
  return ok;
}
