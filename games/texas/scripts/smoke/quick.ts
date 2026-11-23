/** 全下局（--only pushfold）和今日锦标赛（--only dailytour）。 */
import type { Browser, Page } from 'playwright-core';
import { log, newContext, watch, shot, enter, openMore } from './harness.ts';
import { tallDevice } from './solo.ts';

/** 全下局打到结果卡出来：检查操作区只有两个大键，电脑版按键盘 A / F，手机点按钮；返回操作了几次 */
async function playPf(page: Page, tag: string, height: number, touch: boolean): Promise<number> {
    let checked = false;
    let n = 0;
    const deadline = Date.now() + 240_000;
    while (!(await page.locator('.pf-sum').isVisible())) {
      if (Date.now() > deadline) {
        await shot(page, `debug-pushfold-${tag}`);
        throw new Error(`[${tag}] pushfold session never ended`);
      }
      if (await page.locator('.actions.on').isVisible()) {
        if (!checked) {
          checked = true;
          // 只有两个键，且都不小于 44 高；没有加注、一键下注、赔率条；竖屏时它们在屏内
          const fold = await page.locator('.act.fold').boundingBox();
          const allin = await page.locator('.act.call').boundingBox();
          if (!fold || !allin || fold.height < 44 || allin.height < 44) throw new Error(`[${tag}] buttons too small: ${JSON.stringify([fold, allin])}`);
          if (allin.y + allin.height > height) throw new Error(`[${tag}] buttons off screen`);
          for (const sel of ['.act.raise', '.quick', '.odds']) if (await page.locator(`.actions ${sel}`).isVisible()) throw new Error(`[${tag}] ${sel} should be hidden in push/fold`);
          const label = (await page.locator('.act.call').textContent()) ?? '';
          if (!label.includes('全下')) throw new Error(`[${tag}] all-in label: ${label}`);
          if (!touch) {
            const hint = await page.locator('.act.call').evaluate((e) => getComputedStyle(e, '::after').content);
            if (!hint.includes('A')) throw new Error(`[${tag}] key hint missing: ${hint}`);
          }
          const hand = (await page.locator('.hand-no').textContent()) ?? '';
          if (!/第 \d+ \/ 15 手/.test(hand)) throw new Error(`[${tag}] hand counter: ${hand}`);
          await shot(page, `pushfold-${tag}-table`);
        }
        // 三手里弃一手，其余全下（要看全下摊牌的演出）
        const fold = n++ % 3 === 2;
        if (touch) await page.locator(fold ? '.act.fold' : '.act.call').tap({ timeout: 2_000 }).catch(() => {});
        else await page.keyboard.press(fold ? 'f' : 'a');
      }
      await page.waitForTimeout(150);
    }
  return n;
}

/**
 * 全下局 · 全下或弃牌（--only pushfold，docs/features.md 13.9）：电脑版 1280×800（键盘 A 全下、F 弃牌，按钮上有键位提示）和手机竖屏 390×844（点两个大按钮）
 * 各打一整局：娱乐选桌里点"全下局"，操作区只有"弃牌"和"全下 / 跟注全下"两个键（没有加注、一键下注），
 * 打满 15 手或输光后弹出结果卡（筹码、手数、最好成绩，本机存在 texas.pushfold），点"再来一局"马上重开；全程控制台零报错。
 */
export async function pushFoldFlow(browser: Browser, base: string): Promise<void> {
  const rigs = [
    { tag: 'desk', device: { viewport: { width: 1280, height: 800 } }, touch: false },
    { tag: 'phone', device: tallDevice(390, 844), touch: true },
  ] as const;
  for (const { tag, device, touch } of rigs) {
    const ctx = await newContext(browser, base, `smoke-pf-${tag}`, device);
    const page = await ctx.newPage();
    watch(page, `pf-${tag}`);
    await page.goto(`${base}/games/texas/`);
    await page.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
    await enter(page, '娱乐', touch);
    await openMore(page, touch);
    const pf = page.locator('.lobby [data-act="pf"]');
    await pf.waitFor();
    await pf.scrollIntoViewIfNeeded();
    await shot(page, `pushfold-${tag}-lobby`);
    const box = await pf.boundingBox();
    if (!box || (!touch && box.height < 44) || box.x + box.width > (device.viewport?.width ?? 0) || box.y + box.height > (device.viewport?.height ?? 0)) throw new Error(`[${tag}] 全下局 button off screen or too small: ${JSON.stringify(box)}`);
    await shot(page, `pushfold-${tag}-lobby`);
    await (touch ? pf.tap() : pf.click());
    await page.locator('.stage.at-table').waitFor();
    const where = (await page.locator('.topbar .where').textContent()) ?? '';
    if (!where.includes('全下局')) throw new Error(`[${tag}] top bar: ${where}`);

    const n = await playPf(page, tag, device.viewport?.height ?? 0, touch);
    await shot(page, `pushfold-${tag}-result`);
    const sum = (await page.locator('.pf-sum').textContent()) ?? '';
    if (!/打了\s*\d+ 手/.test(sum)) throw new Error(`[${tag}] result card: ${sum}`);
    const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('texas.pushfold') ?? 'null') as { best: number; plays: number } | null);
    if (rec?.plays !== 1 || !(rec.best >= 0)) throw new Error(`[${tag}] texas.pushfold: ${JSON.stringify(rec)}`);
    const again = page.locator('.d-btn.primary', { hasText: '再来一局' });
    const ab = await again.boundingBox();
    if (!ab || (!touch && ab.height < 44)) throw new Error(`[${tag}] 再来一局 too small: ${JSON.stringify(ab)}`);
    await (touch ? again.tap() : again.click());
    await page.locator('.hand-no', { hasText: '第 1 / 15 手' }).waitFor({ state: 'attached', timeout: 20_000 });
    await shot(page, `pushfold-${tag}-again`);
    // 离桌回大厅：娱乐不碰钱包，没有结回
    await page.locator('.pill.leave').click();
    await page.locator('.d-btn.danger', { hasText: '离桌' }).click();
    await page.locator('.d-btn.primary', { hasText: '回首页' }).click();
    await page.locator('.lobby').waitFor();
    log(tag, 'pushfold ok, hands played', n);
    await ctx.close();
  }

  // 今日全下：同一天同一副牌、一天记一次分上榜。第一局交一次分（榜名 daily-北京日期-pushfold），"再练一遍"是练习、不再交
  const scores: { gameId?: string; boardId?: string; score?: number }[] = [];
  const ctx = await newContext(browser, base, 'smoke-pf-daily', { viewport: { width: 1280, height: 800 } }, false, scores);
  const page = await ctx.newPage();
  watch(page, 'pf-daily');
  await page.goto(`${base}/games/texas/`);
  await page.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
  await enter(page, '娱乐');
  await openMore(page);
  await page.locator('.lobby [data-act="daily-pf"]').click();
  await page.locator('.stage.at-table').waitFor();
  if (!((await page.locator('.topbar .where').textContent()) ?? '').includes('今日全下')) throw new Error('daily: top bar should say 今日全下');
  await playPf(page, 'daily', 800, false);
  await page.locator('.pf-best', { hasText: '已上今日榜' }).waitFor({ timeout: 10_000 });
  await shot(page, 'pushfold-daily-result');
  if (scores.length !== 1) throw new Error(`daily: want 1 score post, got ${JSON.stringify(scores)}`);
  const want = /^daily-\d{4}-\d{2}-\d{2}-pushfold$/;
  if (scores[0]!.gameId !== 'texas' || !want.test(scores[0]!.boardId ?? '') || !Number.isInteger(scores[0]!.score)) throw new Error(`daily: bad score post ${JSON.stringify(scores[0])}`);
  const dailyRec = await page.evaluate(() => JSON.parse(localStorage.getItem('texas.pushfold') ?? 'null') as { daily?: { date: string; score: number } } | null);
  if (dailyRec?.daily?.score !== scores[0]!.score) throw new Error(`daily: record ${JSON.stringify(dailyRec)} vs post ${JSON.stringify(scores[0])}`);
  await page.locator('.d-btn.primary', { hasText: '再练一遍' }).click();
  await page.locator('.hand-no', { hasText: '第 1 / 15 手' }).waitFor({ state: 'attached', timeout: 20_000 });
  if (!((await page.locator('.topbar .where').textContent()) ?? '').includes('练习')) throw new Error('daily replay should be marked practice');
  await playPf(page, 'daily2', 800, false);
  await page.locator('.pf-best', { hasText: '练习局' }).waitFor();
  if (scores.length !== 1) throw new Error(`daily replay must not submit: ${JSON.stringify(scores)}`);
  log('daily ok', JSON.stringify(scores[0]));
  await ctx.close();
}

/**
 * 今日锦标赛（--only dailytour，docs/tournament.md 14.5）：电脑 1280×800，从娱乐选桌点"今日锦标赛"，一路全下加快出局，打到结束页。
 * 第一场：顶栏写"今日锦标赛"，加注面板展开时底池条不再重复（截图），结束页有分数，假平台只收到一次 POST（榜名 daily-北京日期-tour、整数分），写"已上今日榜"；
 * "再练一场"是练习：顶栏写"今日锦标赛（练习）"，打完不交分。全程控制台零报错
 */
async function playDailyTour(page: Page, tag: string, panelShot: boolean): Promise<void> {
  const deadline = Date.now() + 300_000;
  let panelDone = !panelShot;
  while (!(await page.locator('.tour-sum').isVisible())) {
    if (Date.now() > deadline) {
      await shot(page, `debug-dailytour-${tag}`);
      throw new Error(`[${tag}] daily tour never ended`);
    }
    if (await page.locator('.d-title', { hasText: '你出局了' }).isVisible()) {
      await page.locator('.d-btn', { hasText: '现在离桌' }).click();
      continue;
    }
    if (await page.locator('.dialog').isVisible()) {
      await page.waitForTimeout(200);
      continue;
    }
    if (await page.locator('.actions.on').isVisible()) {
      const canRaise = await page.locator('.act.raise:not(.hidden)').isVisible();
      // 先跟注打到翻牌后（桌心摆出池子），再在这一手展开加注面板截图；之后一路全下
      const centerPot = await page.locator('.pot-main b').isVisible();
      if (!panelDone && canRaise && centerPot) {
        await page.locator('.act.raise').click({ timeout: 2_000 }).catch(() => {});
        await page.waitForTimeout(300);
        if (await page.locator('.actions.open').isVisible()) {
          panelDone = true;
          const odds = await page.locator('.actions.open .odds').isVisible();
          await shot(page, 'dailytour-raise-panel');
          if (odds) throw new Error('raise panel open with the pot in the table center: the odds bar should be hidden (pot shows twice)');
          log('dailytour raise panel: pot shown once');
        }
      }
      if (!panelDone) {
        await page.locator('.act.call, .act.check').first().click({ timeout: 2_000 }).catch(() => {});
        await page.waitForTimeout(120);
        continue;
      }
      if (canRaise) {
        await page.locator('.act.raise:not(.hidden)').click({ timeout: 2_000 }).catch(() => {});
        await page.waitForTimeout(100);
        if (!(await page.locator('.actions.open').isVisible())) continue;
        await page.locator('.preset').nth(4).click({ timeout: 2_000 }).catch(() => {});
        await page.locator('.act.raise').click({ timeout: 2_000 }).catch(() => {});
      } else await page.locator('.act.call').click().catch(() => {});
    }
    await page.waitForTimeout(120);
  }
}

export async function dailyTourFlow(browser: Browser, base: string): Promise<void> {
  const scores: { gameId?: string; boardId?: string; score?: number }[] = [];
  const ctx = await newContext(browser, base, 'smoke-dailytour', { viewport: { width: 1280, height: 800 } }, false, scores);
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('texas.settings')) localStorage.setItem('texas.settings', JSON.stringify({ fast: true }));
  });
  const page = await ctx.newPage();
  watch(page, 'dailytour');
  await page.goto(`${base}/games/texas/`);
  await page.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
  await enter(page, '娱乐');
  // 舞台整体缩放过，高度和同一行的"今日全下"比（都是 44 css 像素）
  await openMore(page);
  const btn = await page.locator('.lobby [data-act="daily-tour"]').boundingBox();
  const ref = await page.locator('.lobby [data-act="daily-pf"]').boundingBox();
  if (!btn || !ref || Math.abs(btn.height - ref.height) > 0.5) throw new Error(`今日锦标赛 button should be as high as 今日全下: ${JSON.stringify([btn, ref])}`);
  await shot(page, 'dailytour-lobby');
  await page.locator('.lobby [data-act="daily-tour"]').click();
  await page.locator('.stage.at-table').waitFor();
  const where = (await page.locator('.topbar .where').textContent()) ?? '';
  if (!/^今日锦标赛 · 极速赛/.test(where)) throw new Error(`daily tour top bar: ${where}`);
  await playDailyTour(page, 'first', true);
  await page.locator('.tour-daily', { hasText: '已上今日榜' }).waitFor({ timeout: 10_000 });
  await shot(page, 'dailytour-result');
  if (scores.length !== 1) throw new Error(`dailytour: want 1 score post, got ${JSON.stringify(scores)}`);
  const want = /^daily-\d{4}-\d{2}-\d{2}-tour$/;
  if (scores[0]!.gameId !== 'texas' || !want.test(scores[0]!.boardId ?? '') || !Number.isInteger(scores[0]!.score)) throw new Error(`dailytour: bad score post ${JSON.stringify(scores[0])}`);
  const shown = Number(((await page.locator('.tour-score').textContent()) ?? '').replace(/\D/g, ''));
  if (shown !== scores[0]!.score) throw new Error(`dailytour: page score ${shown} vs post ${scores[0]!.score}`);
  const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('texas.dailytour') ?? 'null') as { score: number; sent: boolean } | null);
  if (rec?.score !== scores[0]!.score || rec.sent !== true) throw new Error(`dailytour: record ${JSON.stringify(rec)}`);
  await page.locator('.d-btn.primary', { hasText: '再练一场' }).click();
  await page.locator('.stage.at-table').waitFor();
  if (!((await page.locator('.topbar .where').textContent()) ?? '').includes('今日锦标赛（练习）')) throw new Error('daily tour replay should be marked practice');
  await playDailyTour(page, 'practice', false);
  await page.locator('.tour-daily', { hasText: '练习局' }).waitFor();
  if (scores.length !== 1) throw new Error(`dailytour replay must not submit: ${JSON.stringify(scores)}`);
  log('dailytour ok', JSON.stringify(scores[0]));
  await ctx.close();
}
