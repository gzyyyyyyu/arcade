/** 锦标赛（--only tour / tourfmt / tourroom）。 */
import type { Browser, Page } from 'playwright-core';
import { DESK_W, log, newContext, watch, shot, balance, skipTips, handText, enter, openMore, settled, badgesClear, DESK_H } from './harness.ts';
import { IPHONE } from './solo.ts';

export async function tourFlow(browser: Browser, base: string): Promise<void> {
  const ctx = await newContext(browser, base, 'smoke-tour');
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('texas.settings')) localStorage.setItem('texas.settings', JSON.stringify({ fast: true }));
  });
  const page = await ctx.newPage();
  watch(page, 'tour');
  await page.goto(`${base}/games/texas/`);
  await page.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
  for (const mode of ['娱乐', '实盘'] as const) {
    await enter(page, mode);
    await openMore(page);
    const go = await page.locator('.lobby .start').boundingBox();
    const tb =await page.locator('.lobby .tour-btn').boundingBox();
    if (!go || go.height > 70 || go.y + go.height > DESK_H) throw new Error(`lobby(${mode}): 坐下开打 off screen ${JSON.stringify(go)}`);
    if (!tb || tb.y + tb.height > DESK_H || tb.x + tb.width > DESK_W) throw new Error(`lobby(${mode}): 锦标赛 off screen ${JSON.stringify(tb)}`);
    const note = await page.locator('.lobby .tour-note').boundingBox();
    if (!note || note.y + note.height > DESK_H + 0) { await shot(page, `debug-tour-lobby-${mode}`); throw new Error(`lobby(${mode}): 锦标赛说明 off screen ${JSON.stringify(note)}`); }
    await shot(page, `tour-lobby-${mode}`);
  }
  await enter(page, '娱乐');
  await openMore(page);
  await page.locator('.lobby .tour-btn').click();
  await skipTips(page);
  await page.locator('.stage.at-table').waitFor();
  const where =(await page.locator('.topbar .where').textContent()) ?? '';
  if (!/锦标赛 · 第 \d+ 级 · 盲注 [\d,]+\/[\d,]+ · /.test(where)) throw new Error(`tour top bar: ${where}`);
  if (await page.locator('.next-hand:visible').count()) throw new Error('tournament should not have a next-hand button');
  let shotTable = false;
  let resShot = false;
  let badges = 0;
  const deadline = Date.now() + 560_000;
  while (!(await page.locator('.tour-sum').isVisible())) {
    if (Date.now() > deadline) {
      await shot(page, 'debug-tour');
      throw new Error('tournament never ended');
    }
    if (await page.locator('.d-title', { hasText: '你出局了' }).isVisible()) {
      badges += await badgesClear(page);
      await shot(page, 'tour-out');
      await page.locator('.d-btn', { hasText: '现在离开' }).click();
      continue;
    }
    // 结果条里不该有"空位"（0.26.x：锦标赛电脑座位 owner 是 player，赢家名字一律显示空位）
    const res = (await page.locator('.result.on').isVisible()) ? await page.locator('.result.on').textContent({ timeout: 500 }).catch(() => null) : null;
    if (res?.includes('空位')) throw new Error(`tour result bar shows 空位: ${res}`);
    if (res && !resShot) {
      resShot = true;
      await shot(page, 'tour-result');
    }
    if (await page.locator('.dialog').isVisible()) {
      await page.waitForTimeout(200);
      continue;
    }
    if (await page.locator('.actions.on').isVisible()) {
      if (!shotTable) {
        shotTable = true;
        await shot(page, 'tour-table');
      }
      badges += await badgesClear(page);
      // 一直跟注撑到单挑时要打很久（冒烟 560 秒等不起）：20 手以后能全下就全下
      if ((await handText(page)) >= 20 && (await page.locator('.act.raise:not(.hidden)').isVisible())) {
        await page.locator('.act.raise').click({ timeout: 2_000 }).catch(() => {});
        await page.locator('.preset').nth(4).click({ timeout: 2_000 }).catch(() => {});
        await page.locator('.act.raise').click({ timeout: 2_000 }).catch(() => {});
      } else await page.locator('.act.call').click().catch(() => {});
    }
    await page.waitForTimeout(120);
  }
  await shot(page, 'tour-summary');
  log('tour badges checked', badges + (await badgesClear(page)));
  const place = Number(((await page.locator('.tour-place').textContent()) ?? '').replace(/\D/g, ''));
  if (!(place >= 1 && place <= 6)) throw new Error(`tour place out of range: ${place}`);
  if ((await page.locator('.tour-top li').count()) !== 3) throw new Error('tour summary should list the top 3');
  const prize = (await page.locator('.tour-prize').textContent()) ?? '';
  if (!prize.includes('筹码不算数')) throw new Error(`fun tournament prize line: ${prize}`);
  log('tour place', place, prize);
  await page.locator('.d-btn.primary').click();
  await page.locator('.lobby').waitFor();
  // 实盘：报名扣一份，开打就离开（剩下的托管跑完），钱包 = 报名前 - 报名费 + 奖金（真走 worker 的 api/solo 和假平台钱包）
  await enter(page, '实盘');
  await openMore(page);
  const before = await balance(page);
  const fee =Number(((await page.locator('.lobby .tour-btn').textContent()) ?? '').replace(/\D/g, ''));
  if (!(fee > 0)) throw new Error('real tournament button should show the fee');
  await page.locator('.lobby .tour-btn').click();
  await skipTips(page);
  await page.locator('.stage.at-table').waitFor();
  await page.locator('.pill.leave').click();
  await page.locator('.d-title', { hasText: '现在离开' }).waitFor();
  await page.locator('.d-btn.danger').click();
  await page.locator('.tour-sum').waitFor({ timeout: 60_000 });
  const realPlace = Number(((await page.locator('.tour-place').textContent()) ?? '').replace(/\D/g, ''));
  const realPrize = [3, 1.8, 1.2].map((k) => Math.round(fee * k))[realPlace - 1] ?? 0;
  log('real tour place', realPlace, (await page.locator('.tour-prize').textContent()) ?? '');
  await page.locator('.d-btn.primary').click();
  await page.locator('.lobby').waitFor();
  await page.waitForFunction((want) => Number((document.querySelector('.w-balance')?.textContent ?? '').replace(/,/g, '')) === want, before - fee + realPrize, { timeout: 10_000 }).catch(async () => {
    throw new Error(`real tour wallet ${before} -> ${await balance(page)}, want ${before - fee + realPrize} (fee ${fee}, place ${realPlace})`);
  });
  await ctx.close();
}

/**
 * 单机锦标赛的赛制（--only tour 的第二段，0.29.0）：选赛制的一行在手机竖屏 390×844、横屏 667×375、电脑上都在屏内，选择记在设置里；
 * 电脑上开 9 人赛（9 个座位、顶栏写赛制）刷新后接着打、截图，离开后结束页名次 1–9，再开一场极速赛（6 个座位、顶栏写赛制）离开。
 */
export async function tourFormatFlow(browser: Browser, base: string): Promise<void> {
  for (const [tag, width, height] of [['phone-portrait', 390, 844], ['phone-landscape', 667, 375]] as const) {
    const ctx = await newContext(browser, base, `smoke-tourfmt-${tag}`, { viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPHONE });
    await ctx.addInitScript(() => localStorage.setItem('texas.settings', JSON.stringify({ fast: true })));
    const page = await ctx.newPage();
    watch(page, `tourfmt-${tag}`);
    await page.goto(`${base}/games/texas/`);
    await page.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
    await enter(page, '娱乐', true);
    await openMore(page, true);
    const row = page.locator('.lobby .tour-fmts');
    await row.scrollIntoViewIfNeeded();
    await page.locator('.lobby .tfmt', { hasText: '极速赛' }).tap();
    await shot(page, `tour-fmt-${tag}`);
    const b = await row.boundingBox();
    if (!b || b.x < 0 || b.x + b.width > width + 1) throw new Error(`${tag}: 赛制一行超出屏宽 ${JSON.stringify(b)}`);
    for (const t of await page.locator('.lobby .tfmt').all()) {
      const tb = await t.boundingBox();
      if (!tb || tb.x < 0 || tb.x + tb.width > width + 1 || tb.height < 24) throw new Error(`${tag}: 赛制按钮不合适 ${JSON.stringify(tb)}`);
      const [sw, cw] = await t.evaluate((e) => [e.scrollWidth, e.clientWidth]);
      if (sw > cw + 2) throw new Error(`${tag}: 赛制按钮字被截断 ${sw}/${cw}`);
    }
    await ctx.close();
  }

  const ctx = await newContext(browser, base, 'smoke-tourfmt');
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('texas.settings')) localStorage.setItem('texas.settings', JSON.stringify({ fast: true }));
  });
  const page = await ctx.newPage();
  watch(page, 'tourfmt');
  await page.goto(`${base}/games/texas/`);
  await page.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
  await enter(page, '娱乐');
  await openMore(page);
  const fb =await page.locator('.lobby .tour-fmts').boundingBox();
  if (!fb || fb.y + fb.height > DESK_H) throw new Error(`desktop: 赛制一行 off screen ${JSON.stringify(fb)}`);
  await shot(page, 'tour-fmt-desktop');
  await page.locator('.lobby .tfmt', { hasText: '9 人赛' }).click();
  // 记在设置里：刷新后还是 9 人赛
  await page.reload();
  await page.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
  await enter(page, '娱乐');
  await openMore(page);
  if (!(await page.locator('.lobby .tfmt.sel', { hasText: '9 人赛' }).count())) throw new Error('tour format choice not remembered');
  await page.locator('.lobby .tour-btn').click();
  await skipTips(page);
  await page.locator('.stage.at-table').waitFor();
  let where = (await page.locator('.topbar .where').textContent()) ?? '';
  if (!/锦标赛 · 9 人赛 · 第 1 级 · 盲注 15\/30/.test(where)) throw new Error(`nine top bar: ${where}`);
  if ((await page.locator('.seat:not(.empty)').count()) !== 9) throw new Error('nine tournament should seat 9');
  await page.locator('.actions.on').waitFor({ timeout: 30_000 });
  await shot(page, 'tour-nine-table');
  // 存档里带赛制：刷新后从标题页接着打，还是 9 人赛 9 个座位
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('texas.tour') ?? 'null')?.state?.format);
  if (saved !== 'nine') throw new Error(`tour save format: ${saved}`);
  await page.reload();
  await page.locator('.qstart', { hasText: '继续上局' }).click();
  await page.locator('.stage.at-table').waitFor();
  await skipTips(page);
  where = (await page.locator('.topbar .where').textContent()) ?? '';
  if (!/锦标赛 · 9 人赛 · 第 \d+ 级/.test(where) || (await page.locator('.seat:not(.empty)').count()) !== 9) throw new Error(`nine resume: ${where}`);
  const leave = async (): Promise<number> => {
    await page.locator('.pill.leave').click();
    await page.locator('.d-title', { hasText: '现在离开' }).waitFor();
    await page.locator('.d-btn.danger').click();
    await page.locator('.tour-sum').waitFor({ timeout: 60_000 });
    const place = Number(((await page.locator('.tour-place').textContent()) ?? '').replace(/\D/g, ''));
    if ((await page.locator('.tour-top li').count()) !== 3) throw new Error('tour summary should list the top 3');
    return place;
  };
  const p9 = await leave();
  if (!(p9 >= 1 && p9 <= 9)) throw new Error(`nine place out of range: ${p9}`);
  log('nine place', p9);
  await page.locator('.d-btn.primary').click();
  await page.locator('.lobby').waitFor();
  await enter(page, '娱乐');
  await openMore(page);
  await page.locator('.lobby .tfmt', { hasText: '极速赛' }).click();
  await page.locator('.lobby .tour-btn').click();
  await skipTips(page);
  await page.locator('.stage.at-table').waitFor();
  where = (await page.locator('.topbar .where').textContent()) ?? '';
  if (!/锦标赛 · 极速赛 · 第 1 级 · 盲注 25\/50/.test(where) || (await page.locator('.seat:not(.empty)').count()) !== 6) throw new Error(`turbo top bar: ${where}`);
  const p6 = await leave();
  if (!(p6 >= 1 && p6 <= 6)) throw new Error(`turbo place out of range: ${p6}`);
  log('turbo place', p6);
  // 9 人赛只开娱乐（0.29.0）：实盘选了 9 人赛，锦标赛按钮灰着、说明写为什么；换回极速赛就能报
  await page.locator('.d-btn.primary').click();
  await page.locator('.lobby').waitFor();
  await enter(page, '实盘');
  await openMore(page);
  await page.locator('.lobby .tfmt', { hasText: '9 人赛' }).click();
  if (!(await page.locator('.lobby .tour-btn').isDisabled())) {
    await shot(page, 'tour-nine-real-fail');
    throw new Error(`nine should be fun-only in 实盘: ${await page.locator('.lobby .tour-btn').textContent()} / ${await page.locator('.lobby .tour-note').textContent()} / ${await page.locator('.lobby .mode.sel, .lobby .mode.on').allTextContents()}`);
  }
  const note = (await page.locator('.lobby .tour-note').textContent()) ?? '';
  if (!note.includes('只有娱乐')) throw new Error(`nine real note: ${note}`);
  await shot(page, 'tour-nine-real-off');
  await page.locator('.lobby .tfmt', { hasText: '极速赛' }).click();
  if (!(await page.locator('.lobby .tour-btn').isDisabled())) throw new Error('turbo should be fun-only in 实盘');
  await page.locator('.lobby .tfmt', { hasText: '经典' }).click();
  if (await page.locator('.lobby .tour-btn').isDisabled()) throw new Error('classic should be open in 实盘');
  await ctx.close();
}

/**
 * 好友房锦标赛（--only tourroom，0.24.0）：两个浏览器上下文。房主在好友房里选"锦标赛"（实盘小桌、空位电脑补）开房，
 * 另一个人用房间码进来坐下，房主点"开赛"；两人前几手跟注、之后能加注就全下（房间里电脑一步 1.6 秒，一直跟注要十几分钟），被淘汰就选"看到结束"，直到两边的结束页出现。
 * 核对：顶栏"锦标赛 · 第 N 级"、没有止盈旗子 / 补码 / 歇一手 / 下一手；两人钱包变化之和 = 0（奖池只在两个真人之间分，第 1 名拿走全部）、
 * 每人变化 = 结束页写的奖金 - 报名费。截牌桌和结束页。
 */
export async function tourRoomFlow(browser: Browser, base: string): Promise<void> {
  const fastInit = (): void => {
    if (!localStorage.getItem('texas.settings')) localStorage.setItem('texas.settings', JSON.stringify({ fast: true }));
  };
  const hc = await newContext(browser, base, 'smoke-trh');
  const gc = await newContext(browser, base, 'smoke-trg');
  await hc.addInitScript(fastInit);
  await gc.addInitScript(fastInit);
  const [hp, gp] = await Promise.all([hc.newPage(), gc.newPage()]);
  watch(hp, 'tourroom-host');
  watch(gp, 'tourroom-guest');
  try {
    await hp.goto(`${base}/games/texas/?online=1`);
    await hp.locator('.friends.spot').waitFor();
    await gp.goto(`${base}/games/texas/`);
    for (const p of [hp, gp]) await p.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
    const before = [await balance(hp), await balance(gp)];
    // 开房面板：玩法里选锦标赛，人数那一行收起，多一张娱乐卡和"空位电脑补"开关；现金桌的开房原样
    const cash = await hp.locator('.friends.open .pill', { hasText: '开房间' }).boundingBox();
    if (!cash || cash.y + cash.height > DESK_H) throw new Error(`cash 开房间 should stay on the first screen, got ${JSON.stringify(cash)}`);
    await shot(hp, 'tourroom-lobby-cash');
    await hp.locator('.friends.open .kind', { hasText: '锦标赛' }).click();
    if (await hp.locator('.sizes').isVisible()) throw new Error('size row should hide for a tournament');
    if (!(await hp.locator('.friends.open .fill').textContent())?.includes('开')) throw new Error('电脑补 should default on');
    await shot(hp, 'tourroom-lobby');
    const onScreen = await hp.locator('.friends.open .pill').boundingBox();
    if (!onScreen || onScreen.y + onScreen.height > DESK_H) throw new Error(`开锦标赛房间 off screen ${JSON.stringify(onScreen)}`);
    await hp.locator('.friends .pill', { hasText: '开锦标赛房间' }).click();
    await hp.locator('.room-wait').waitFor();
    const info = (await hp.locator('.rw-info').textContent()) ?? '';
    if (!info.includes('锦标赛') || !info.includes('2,000') || !info.includes('电脑补')) throw new Error(`tour room info: ${info}`);
    const code = ((await hp.locator('.rw-code').textContent()) ?? '').replace(/\D/g, '');
    if (!/^\d{6}$/.test(code)) throw new Error(`bad room code ${code}`);
    log('tour room', code);
    await gp.goto(`${base}/games/texas/?room=${code}`);
    await gp.locator('.room-wait').waitFor();
    await gp.locator('.rw-seat').nth(1).locator('.rw-sit').click();
    await gp.locator('.rw-seat.me').waitFor();
    await hp.locator('.rw-seat.taken').nth(1).waitFor();
    if (!(await hp.locator('.rw-go .start').textContent())?.includes('开赛')) throw new Error('start button should say 开赛');
    await shot(hp, 'tourroom-wait');
    await hp.locator('.rw-go .start').click();
    for (const p of [hp, gp]) await p.locator('.seat.me .card.up').first().waitFor({ timeout: 30_000 });
    const where = (await hp.locator('.topbar .where').textContent()) ?? '';
    if (!/锦标赛 · 第 \d+ 级 · 盲注 [\d,]+\/[\d,]+ · /.test(where)) throw new Error(`tour room top bar: ${where}`);
    for (const p of [hp, gp]) {
      if (await p.locator('.next-hand:visible').count()) throw new Error('tournament room should not have a next-hand button');
      for (const t of ['补码', '歇一手']) if (await p.locator('.hud .pill', { hasText: t }).isVisible()) throw new Error(`tournament room should not show ${t}`);
    }
    // 打：一直跟注；被淘汰就选"看到结束"；两边的结束页都出来为止
    let tableShot = false;
    const deadline = Date.now() + 520_000;
    const done = async (p: Page): Promise<boolean> => p.locator('.tour-sum').isVisible();
    while (!((await done(hp)) && (await done(gp)))) {
      if (Date.now() > deadline) {
        await shot(hp, 'debug-tourroom-host');
        await shot(gp, 'debug-tourroom-guest');
        throw new Error('tour room never ended');
      }
      for (const p of [hp, gp]) {
        if (await done(p)) continue;
        if (await p.locator('.d-title', { hasText: '你出局了' }).isVisible()) {
          if (p === hp) await shot(hp, 'tourroom-out');
          await p.locator('.d-btn', { hasText: '看到结束' }).click();
          continue;
        }
        if (await p.locator('.dialog').isVisible()) continue;
        if (await p.locator('.actions.on').isVisible()) {
          if (!tableShot && p === hp) {
            tableShot = true;
            await shot(hp, 'tourroom-table');
          }
          // 前几手一直跟注；之后能加注就全下：房间里电脑一步 1.6 秒，一直跟注要打二三十手、十几分钟，冒烟等不起
          if ((await handText(p)) >= 5 && (await p.locator('.act.raise:not(.hidden)').isVisible())) {
            await p.locator('.act.raise').click({ timeout: 2_000 }).catch(() => {});
            await p.locator('.preset').nth(4).click({ timeout: 2_000 }).catch(() => {});
            await p.locator('.act.raise').click({ timeout: 2_000 }).catch(() => {});
          } else await p.locator('.act.call').click({ timeout: 2_000 }).catch(() => {});
        }
      }
      await hp.waitForTimeout(150);
    }
    await shot(hp, 'tourroom-summary');
    const prizes: number[] = [];
    for (const [p, tag] of [[hp, 'host'], [gp, 'guest']] as const) {
      const place = Number(((await p.locator('.tour-place').textContent()) ?? '').replace(/\D/g, ''));
      // 大字是真人之间的名次（1 或 2），奖金跟着它走
      if (!(place === 1 || place === 2)) throw new Error(`${tag}: human place should be 1 or 2: ${place}`);
      if ((await p.locator('.tour-top li').count()) !== 2) throw new Error(`${tag}: 真人名次表 should list the 2 humans`);
      const line = (await p.locator('.tour-prize').textContent()) ?? '';
      if (!/^结回钱包 [\d,]+$/.test(line)) throw new Error(`${tag}: prize line: ${line}`);
      prizes.push(Number(line.replace(/\D/g, '')));
      if ((place === 1) !== (prizes.at(-1) === 4_000)) throw new Error(`${tag}: human place ${place} but prize ${line}`);
      log(tag, 'tour place', place, line);
    }
    // 两个真人：第 1 名拿全部奖池（2 份），另一个 0
    if (prizes.slice().sort((a, b) => a - b).join() !== '0,4000') throw new Error(`prizes should be 0 and 4,000, got ${prizes.join()}`);
    for (const p of [hp, gp]) {
      await p.locator('.d-btn.primary').click();
      await p.locator('.lobby').waitFor();
    }
    const after = [await settled(hp, 'tour-host'), await settled(gp, 'tour-guest')];
    const delta = after.map((a, i) => a - before[i]!);
    if (delta[0]! + delta[1]! !== 0) throw new Error(`wallet changes should sum to 0, got ${delta.join()} (prizes ${prizes.join()})`);
    if (delta[0] !== prizes[0]! - 2_000 || delta[1] !== prizes[1]! - 2_000) throw new Error(`wallet deltas ${delta.join()} do not match prizes ${prizes.join()} - fee 2,000`);
    log('tour room wallets', delta.join(), 'sum 0');
    // 每人同时 1 个房间（0.39.0）：比赛打完 kit 就还了房主的名额，回大厅马上能开新房，不被 has_room 送回这一间
    await enter(hp, '好友房');
    await hp.locator('.friends.open .kind', { hasText: '现金桌' }).click();
    await hp.locator('.friends .pill', { hasText: '开房间' }).click();
    await hp.locator('.room-wait').waitFor({ timeout: 20_000 });
    const again = ((await hp.locator('.rw-code').textContent()) ?? '').replace(/\D/g, '');
    if (again === code || !/^\d{6}$/.test(again)) throw new Error(`after the tournament: expected a new room, got ${again}`);
    log('after the tournament: new room', again);
  } catch (e) {
    await shot(hp, 'debug-tourroom-host').catch(() => {});
    await shot(gp, 'debug-tourroom-guest').catch(() => {});
    throw e;
  } finally {
    await Promise.all([hc.close(), gc.close()]);
  }
}
