/** 单机桌面和手机、竖屏大厅、各种高度的手机、单独部署：见 smoke.ts 顶部说明。 */
import type { Browser, Page } from 'playwright-core';
import { HANDS, DESK_W, log, newContext, cspWatch, watch, shot, balance, skipTips, handText, assertHeld, assertAutoNext, coveredSeats, seatOverlaps, enter, openMore, PHONE, DESK_H, linkSit } from './harness.ts';
import { playRoom } from './room.ts';

/** 单机亮过牌没有（一场只试一次） */
let soloShowed = false;

async function playUntil(page: Page, hands: number, shotAt: Set<number>, checks = false): Promise<void> {
  let k = 0;
  let held = !checks;
  let auto = !checks;
  // 电脑按"像人"的节奏想，动画正常速度：6 人桌一手常要二三十秒
  const deadline = Date.now() + hands * 40_000;
  for (;;) {
    if (Date.now() > deadline) {
      await shot(page, 'too-long');
      throw new Error(`playing took too long (hand ${await handText(page)})`);
    }
    const no = await handText(page);
    if (no > hands) return;
    if (await page.locator('.next-hand').isVisible()) {
      if (no === hands) return;
      // 主动亮牌（0.19.0，单机）：第一次有亮牌那一块就点"都亮"，我的两张翻开、那一块收起
      if (checks && !soloShowed && (await page.locator('.show-cards').isVisible())) {
        soloShowed = true;
        await page.locator('.show-cards .sc-both').click();
        await page.waitForFunction(() => document.querySelectorAll('.seat.me .card.up').length === 2, null, { timeout: 5_000 });
        if (await page.locator('.show-cards').isVisible()) throw new Error('solo show: bar should hide after showing both');
        await shot(page, 'solo-show');
        log('solo: showed both cards at hand', no);
      }
      if (!held) {
        held = true;
        await assertHeld(page, 'desk');
      } else if (!auto && no >= 2) {
        auto = true;
        await assertAutoNext(page);
        continue;
      } else if (await page.locator('.auto-next.sel').isVisible()) {
        await page.locator('.auto-next').click();
        if (await page.locator('.next-ring:not(.hidden)').isVisible()) throw new Error('auto next: ring still shown after turning off');
      }
      await page.locator('.next-hand').click().catch(() => {});
      continue;
    }
    if (await page.locator('.dialog').isVisible()) {
      // 输光了：补上
      const title = await page.locator('.d-title').textContent();
      log('dialog:', title);
      await page.locator('.d-btn.primary').click();
      continue;
    }
    if (await page.locator('.actions.on').isVisible()) {
      if (shotAt.has(no)) {
        shotAt.delete(no);
        await shot(page, `table-turn-${no}`);
      }
      const r = k++ % 11;
      if (r === 3 && (await page.locator('.act.raise:not(.hidden)').isVisible())) {
        await page.locator('.act.raise').click();
        // 加注面板不能盖住任何座位：被盖住的座位要挪到面板上方（挪的动画 0.18 秒）
        // 机器忙时挪座位的动画会拖：最多等 1.5 秒挪完，还盖着才算失败（截一张留证）
        let covered = 0;
        for (let i = 0; i < 6; i++) {
          await page.waitForTimeout(250);
          covered = await coveredSeats(page);
          if (!covered) break;
        }
        if (covered) {
          await shot(page, `raise-covers-${no}`);
          throw new Error(`raise panel covers ${covered} seat(s)`);
        }
        const stacked = await seatOverlaps(page);
        if (stacked) {
          await shot(page, `raise-stacks-${no}`);
          throw new Error(`moving seats out of the raise panel stacked ${stacked} pair(s) of seats`);
        }
        // 0.18.2：面板矮了一行，电脑上 6 人桌右下角的座位不用再挤成只剩名牌
        if ((page.viewportSize()?.width ?? 0) >= 1280 && (await page.locator('.seat:not(.empty)').count()) === 6 && (await page.locator('.seat.tucked').count())) {
          await shot(page, `raise-tucked-${no}`);
          throw new Error('raise panel still tucks a seat at a 6-seat desktop table');
        }
        if (shotAt.has(-1)) {
          shotAt.delete(-1);
          await shot(page, 'raise-panel');
        }
        await page.locator('.preset').nth(2).click();
        await page.locator('.act.raise').click();
      } else if (
        !(await page.locator('.act.fold.soft').isVisible()) &&
        (r === 7 || (Number(((await page.locator('.act.call').textContent()) ?? '').replace(/\D/g, '')) > 100 && r % 3 !== 0))
      ) {
        // 要跟的多（5 个大盲以上）时多数弃牌：一直跟注 30 手会输光好几次，把钱包补空，后面就开不了桌
        await page.locator('.act.fold').click();
      } else {
        await page.locator('.act.call').click();
      }
      continue;
    }
    await page.waitForTimeout(120);
  }
}

export async function desktop(browser: Browser, base: string): Promise<void> {
  const ctx = await newContext(browser, base, 'smoke-desk');
  await ctx.addInitScript(() => localStorage.setItem('texas.settings', JSON.stringify({ fast: true })));
  const page = await ctx.newPage();
  watch(page, 'desktop');
  await page.goto(`${base}/games/texas/`);
  await page.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
  const before = await balance(page);
  if (before !== 10_000) throw new Error(`new wallet should have 10,000, got ${before}`);
  // 0.18.0：一进来是主页，不摆选项（主页不再一进来就摆选项）；快速开始第一次是娱乐·新手·6 人，背景是分层的
  if ((await page.locator('.tile:visible').count()) !== 0) throw new Error('home should not show the stakes cards');
  const quick = (await page.locator('.qstart').textContent()) ?? '';
  if (!quick.includes('快速开始') || !quick.includes('娱乐 · 新手 · 6 人')) throw new Error(`first visit quick start: ${quick}`);
  if ((await page.locator('.scene .sc-bokeh i').count()) < 8) throw new Error('layered background missing');
  await shot(page, 'home');
  // 选桌：娱乐默认新手，三张难度卡；切到实盘才是四张档位卡
  await enter(page, '娱乐');
  if ((await page.locator('.tile.diff:visible').count()) !== 3 || (await page.locator('.tile.diff.sel', { hasText: '新手' }).count()) !== 1)
    throw new Error('first visit should default to 娱乐 · 新手 with three difficulty cards');
  await shot(page, 'lobby');
  await page.locator('.p-back').click();
  await enter(page, '实盘');
  if ((await page.locator('.tile:not(.diff):visible').count()) !== 4) throw new Error('real mode should show four stakes cards');
  await shot(page, 'lobby-real');
  // 主题房（0.18.1）：选中哪一档，背景和舞台就换成那一间；选回小桌回到默认
  await page.locator('.tile', { hasText: '黑金' }).click();
  if ((await page.locator('.stage[data-room="lux"]').count()) !== 1 || (await page.locator('.scene[data-room="lux"]').count()) !== 1) throw new Error('picking 豪华桌 should switch to the 黑金 room');
  await shot(page, 'lobby-lux');
  await page.locator('.tile', { hasText: '街角牌室' }).click();
  if ((await page.locator('[data-room]').count()) !== 3) throw new Error('back to 小桌: only the three other stakes cards keep data-room');
  await page.locator('.lobby .start').click();
  // 新手指引不再是开局的弹窗：直接发牌，指引在第一次轮到我时出（--only guide 测）
  await page.locator('.seat.me .card.up').first().waitFor({ timeout: 30_000 }).catch(async (e: unknown) => {
    await shot(page, 'debug-start');
    throw new Error(`no hole cards after start; note: ${await page.locator('.note').textContent()}; ${String(e)}`);
  });
  if (await page.locator('.coach-layer').count()) throw new Error('guide shown although marked done');
  // 荷官（0.18.3）：电脑上 6 人桌站在桌子顶边
  if ((await page.locator('.dealer-guy:not(.hidden)').count()) !== 1) {
    // 带上顶栏各块的位置，好看出是谁挡了荷官的站位
    const bar = await page.locator('.topbar > :not(.spacer)').evaluateAll((es) => es.map((e) => { const r = e.getBoundingClientRect(); return `${e.className}:${Math.round(r.left)}-${Math.round(r.right)}x${Math.round(r.top)}-${Math.round(r.bottom)}`; }));
    const st = await page.evaluate(() => {
      const t = document.querySelector('.table');
      const r = t?.getBoundingClientRect();
      return `table ${t?.clientWidth}x${t?.clientHeight} at ${Math.round(r?.left ?? 0)}-${Math.round(r?.right ?? 0)}x${Math.round(r?.top ?? 0)} transform ${getComputedStyle(t ?? document.body).transform}`;
    });
    throw new Error(`desktop 6-seat table should show the dealer; top bar ${bar.join(' ')}; ${st}`);
  }
  // 互动（docs/table-fun.md，0.13.0 起是 kit 的 TableFun）：点 1 号电脑的头像扔一个道具，点自己的头像发一个表情；
  // "互动"面板里发一句；全部屏蔽、再全部恢复；点名牌看对手
  await page.locator('.atf-hot[data-seat="1"]').click();
  await page.locator('.atf-box [data-key="fun:prop0"]').click();
  await page.locator('.arcade-fun > *').first().waitFor({ timeout: 5_000 });
  const meSeat = await page.locator('.seat.me').getAttribute('data-seat');
  await page.locator(`.atf-hot[data-seat="${meSeat}"]`).click();
  await page.locator('.atf-box [data-key="fun:sticker0"]').click();
  await page.locator('.atf-box').waitFor({ state: 'detached' });
  await shot(page, 'solo-fun-sticker');
  // 表情和短语共用 1 秒冷却
  await page.waitForTimeout(1_100);
  await page.locator('.atf-btn').click();
  await page.locator('.atf-box [data-key="fun:phrase0"]').click();
  await page.locator('.atf-bubble', { hasText: '就这？' }).waitFor({ timeout: 5_000 });
  await shot(page, 'solo-fun');
  await page.locator('.atf-btn').click();
  await page.locator('.atf-box [data-key="fun:blockAll"]', { hasText: '全部屏蔽' }).click();
  await page.locator('.atf-btn').click();
  await page.locator('.atf-box [data-key="fun:blockAll"]', { hasText: '全部恢复' }).click();
  // 电脑版聊天框（kit 0.19，0.19.4）：放得下就常驻、不压下注按钮；1280×720 的 6 人桌放不下，第一次进桌收成"聊天"小按钮
  const dock = page.locator('[data-key="chat:dock"], [data-key="chat:open"]').first();
  await dock.waitFor({ timeout: 5_000 });
  const db = (await dock.boundingBox())!;
  if (db.x + db.width > DESK_W / 2 && db.y + db.height > DESK_H * 0.7) throw new Error(`desktop chat dock sits on the bet buttons ${JSON.stringify(db)}`);
  // 单机聊天（0.19.3，kit 的 localChat）：顶栏有聊天开关，聊天页说一句，冒在我自己头上；链接不让发
  if (!(await page.locator('.chat-toggle').isVisible())) throw new Error('solo: chat toggle should show');
  await page.locator('.atf-btn').click();
  await page.locator('.atf-box [data-key="fun:tab:chat"]').click();
  await page.locator('[data-key="fun:chatInput"]').fill('这把稳了');
  await page.locator('[data-key="fun:chatSend"]').click();
  await page.locator('.atf-say', { hasText: '这把稳了' }).waitFor({ timeout: 5_000 });
  await shot(page, 'solo-chat');
  await page.locator('[data-key="fun:chatInput"]').fill('看 example.com');
  await page.locator('[data-key="fun:chatSend"]').click();
  await page.locator('.atf-note', { hasText: '链接' }).waitFor({ timeout: 5_000 });
  await page.locator('.atf-away').dispatchEvent('pointerdown');
  await page.locator('.seat[data-seat="1"] .plate').click();
  await page.locator('.read-card .rc-tag').waitFor({ timeout: 5_000 });
  log('solo fun: prop, own sticker, phrase, block all, read card');
  await playUntil(page, HANDS, new Set([1, 5, -1]), true);
  if (!soloShowed) throw new Error('solo: never got the show-cards bar');
  await shot(page, 'after-hands');
  // 补码：先歇一手，这一手打完牌桌停下，再补码、回来
  const rest = page.locator('.hud .pill', { hasText: '歇一手' });
  if (await rest.isVisible()) await rest.click();
  let busted = false;
  for (let i = 0; i < 200 && (await page.locator('.stage').getAttribute('data-phase')) !== 'idle'; i++) {
    // 这一手正好输光了：弹出"输光了"，在里面补码
    if (await page.locator('.dialog').isVisible()) {
      log('dialog:', await page.locator('.d-title').textContent());
      await shot(page, 'topup');
      await page.locator('.d-btn.primary').click();
      busted = true;
      break;
    }
    if (await page.locator('.actions.on').isVisible()) await page.locator('.act.call').click();
    await page.waitForTimeout(200);
  }
  // 牌桌停下以后"输光了"才弹出来（输光的那一手正好打完）：同样在里面补码
  await page.waitForTimeout(600);
  if (!busted && (await page.locator('.dialog').isVisible())) {
    log('dialog:', await page.locator('.d-title').textContent());
    await shot(page, 'topup');
    await page.locator('.d-btn.primary').click();
    busted = true;
  }
  const topUp = page.locator('.hud .pill', { hasText: '补码' });
  if (busted) {
    log('topped up (busted)');
  } else if (await topUp.isVisible()) {
    await topUp.click();
    await page.locator('.dialog').waitFor();
    await shot(page, 'topup');
    await page.locator('.d-btn.primary').click();
    log('topped up');
  } else if (await page.locator('.hud .pill', { hasText: '回来' }).isVisible()) {
    // 筹码是满的，不用补
    await page.locator('.hud .pill', { hasText: '回来' }).click();
  }
  await page.waitForTimeout(800);
  // 离桌：确认 → 结算页（带上桌、结回、这一场、打了几手）→ 回标题
  await page.locator('.leave').click();
  await page.locator('.dialog').waitFor();
  await page.locator('.d-btn.danger').click();
  const net = await summary(page, 'summary');
  await page.locator('.lobby').waitFor();
  await page.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
  await page.waitForTimeout(400);
  const after = await balance(page);
  log('wallet', before, '→', after, 'summary', net);
  // 结算页写的"这一场"就是钱包的变化（小桌到不了每日上限）
  if (!Number.isFinite(net) || after !== before + net) throw new Error(`wallet ${before} → ${after} but summary says ${net}`);
  // 离桌回来是主页，快速开始记着上次的实盘
  if (!((await page.locator('.qstart').textContent()) ?? '').includes('实盘')) throw new Error('quick start should remember 实盘');
  await shot(page, 'lobby-after');
  // 娱乐：不碰钱包（平台那边没有德州的一份）；再在桌上点回大厅（确认后走）
  await enter(page, '娱乐');
  await shot(page, 'lobby-fun');
  await page.locator('.lobby .start').click();
  await skipTips(page);
  await page.locator('.seat.me .card.up').first().waitFor();
  const stakes = await page.evaluate(async () => ((await (await fetch('/api/wallet')).json()) as { wallet: { stakes: unknown[] } }).wallet.stakes);
  if (stakes.length) throw new Error(`fun mode touched the wallet: ${JSON.stringify(stakes)}`);
  await page.locator('.home').click();
  await page.locator('.dialog').waitFor();
  await shot(page, 'home-confirm');
  await page.locator('.d-btn.danger').click();
  await page.locator('.summary').waitFor();
  await Promise.all([page.waitForURL((u) => u.pathname === '/'), page.locator('.d-btn.primary').click()]);
  log('back to lobby ok');
  await ctx.close();
}

/** 一场打完的结算页：只有一个"回首页"，不放"再来一场"。回这一场的输赢 */
export async function summary(page: Page, name: string): Promise<number> {
  await page.locator('.summary').waitFor({ timeout: 20_000 });
  const text = (await page.locator('.dialog').textContent()) ?? '';
  for (const w of ['带上桌', '这一场']) if (!text.includes(w)) throw new Error(`summary lacks ${w}: ${text}`);
  if ((await page.locator('.sum-hero').count()) !== 1) throw new Error('summary should lead with the big +/− line');
  const buttons = await page.locator('.dialog .d-btn').allTextContents();
  if (buttons.join() !== '回首页') throw new Error(`summary buttons: ${buttons.join()}`);
  // 0.18.4 起这一场的 +/− 是最上面的大字
  const net = ((await page.locator('.sum-hero .sum-net').textContent()) ?? '').replace(/,/g, '');
  await shot(page, name);
  // 分享卡（docs/social.md 1.1，kit 的 share）：无头浏览器不能带文件分享，出预览层；看一眼再关，结算页还在
  if (await page.locator('.sum-share').isVisible()) {
    await page.locator('.sum-share').click();
    await page.locator('[data-key="share:close"]').waitFor({ timeout: 10_000 });
    await shot(page, `${name}-share`);
    await page.locator('[data-key="share:close"]').click();
    await page.locator('.summary').waitFor();
  }
  await page.locator('.d-btn.primary').click();
  return net.startsWith('±') ? 0 : Number(net.replace('−', '-'));
}

export async function mobile(browser: Browser, base: string): Promise<void> {
  const ctx = await newContext(browser, base, 'smoke-phone', {
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  watch(page, 'mobile');
  // 省内存设备：CPU 降速 4 倍
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(`${base}/games/texas/`);
  await page.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
  await shot(page, 'phone-lobby');
  // 快速开始：第一次来是娱乐·新手·6 人
  await page.locator('.qstart').tap();
  await skipTips(page);
  await page.locator('.seat.me .card.up').first().waitFor();
  await playUntil(page, 3, new Set([2]));
  await shot(page, 'phone-table');
  // 双指放大：visualViewport.scale 变成 2 时舞台不能跟着重排（CDP 设页面缩放 = 手指捏开的结果），缩回 1 倍后照常
  const stageStyle = () => page.locator('.stage').evaluate((e) => (e as HTMLElement).style.cssText);
  const before = await stageStyle();
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(600);
  const zoomed = await page.evaluate(() => window.visualViewport?.scale ?? 1);
  await shot(page, 'phone-pinch');
  if (zoomed < 1.5) throw new Error(`page did not zoom (scale ${zoomed})`);
  if ((await stageStyle()) !== before) throw new Error('stage relaid out while zoomed');
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(600);
  log('pinch scale', zoomed, 'stage kept');
  // 竖屏（0.10.0）：换竖的牌桌，座位、操作区都在舞台里、互不压
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  if (!(await page.locator('.stage.tall').count())) throw new Error('portrait layout not used');
  const out = await page.evaluate(() => {
    const st = document.querySelector('.stage')!.getBoundingClientRect();
    return [...document.querySelectorAll('.seat:not(.empty) .plate, .act, .qbet')].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && (r.left < st.left - 1 || r.right > st.right + 1 || r.top < st.top - 1 || r.bottom > st.bottom + 1);
    }).length;
  });
  if (out) throw new Error(`portrait: ${out} element(s) outside the stage`);
  if (await seatOverlaps(page)) throw new Error('portrait: seats overlap');
  await shot(page, 'phone-portrait');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(500);
  await page.locator('.leave').tap();
  await page.locator('.d-btn.danger').tap();
  await summary(page, 'phone-summary');
  await page.locator('.lobby').waitFor();
  await ctx.close();
}

/**
 * 竖屏打磨（--only tall，0.21.3）：五档竖屏（SE 375×667、安卓 360×780、390×844、414×896、430×932）各截单机 6 人桌、打开聊天条、发一句冒气泡、点头像出互动菜单；
 * SE 再截一张好友房（两个人坐下开打，顶上那一排不换行）。看谁压了谁用，控制台零报错照样算
 */
const TALL: [string, number, number][] = [
  ['se', 375, 667],
  ['360', 360, 780],
  ['390', 390, 844],
  ['414', 414, 896],
  ['430', 430, 932],
];
export const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
export const tallDevice = (width: number, height: number) => ({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPHONE });

export async function tall(browser: Browser, base: string): Promise<void> {
  for (const [tag, width, height] of TALL) {
    const ctx = await newContext(browser, base, `smoke-tall-${tag}`, tallDevice(width, height));
    await ctx.addInitScript(() => localStorage.setItem('texas.settings', JSON.stringify({ fast: true })));
    const page = await ctx.newPage();
    watch(page, `tall-${tag}`);
    await page.goto(`${base}/games/texas/`);
    await page.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
    await page.locator('.qstart').tap();
    await skipTips(page);
    if (!(await page.locator('.stage.tall').count())) throw new Error(`${tag}: portrait layout not used`);
    // 轮到我、操作按钮亮着的时候截：手牌、公共牌、按钮都在
    await page.locator('.actions.on').waitFor({ timeout: 60_000 });
    await shot(page, `tall-${tag}-table`);
    // 跟到翻牌：公共牌摆出来再截一张（看公共牌有没有被筹码、座位挡住）
    for (let i = 0; i < 300 && (await page.locator('.card.board.up').count()) < 3; i++) {
      if (await page.locator('.actions.on').isVisible()) await page.locator('.act.call').tap().catch(() => {});
      await page.waitForTimeout(150);
    }
    await page.locator('.actions.on').waitFor({ timeout: 30_000 }).catch(() => {});
    await shot(page, `tall-${tag}-board`);
    await page.locator('[data-key="chat:button"]').tap();
    await page.locator('.atc-input').waitFor();
    await shot(page, `tall-${tag}-chat`);
    await page.locator('.atc-input').fill('这把我跟了');
    await page.locator('.atc-input').press('Enter');
    await page.waitForTimeout(400);
    await page.locator('[data-key="chat:close"]').tap().catch(() => {});
    await page.waitForTimeout(300);
    await shot(page, `tall-${tag}-bubble`);
    // 头像上盖着 kit 的热区（atf-hot），点一下是扔道具
    await page.locator('.atf-hot[data-seat="2"]').tap();
    await page.waitForTimeout(400);
    await shot(page, `tall-${tag}-throw`);
    // 加注面板展开（竖屏操作区最高的时候）：不压我的名牌和底牌
    if (await page.locator('.actions.on .act.raise').isVisible()) {
      await page.locator('.act.raise').evaluate((e) => (e as HTMLElement).click());
      await page.waitForTimeout(400);
      await shot(page, `tall-${tag}-raise`);
      const [plate, panel] = await Promise.all([page.locator('.seat.me .plate').boundingBox(), page.locator('.raise-panel').boundingBox()]);
      if (plate && panel && panel.height > 0 && panel.y < plate.y + plate.height) throw new Error(`${tag}: raise panel covers my plate`);
    }
    // 互动面板（左上"互动"按钮），最后截：面板开着会挡住别的点击
    await page.locator('.atf-ui .atf-btn:not([data-key])').evaluate((e) => (e as HTMLElement).click());
    await page.waitForTimeout(400);
    await shot(page, `tall-${tag}-menu`);
    await ctx.close();
  }
  // 好友房：最窄的 SE 上的房主开 6 人房（顶上那一排最挤：互动、聊天、第几手、歇一手、叫朋友来），电脑上的朋友进来坐下，开打
  const host = await newContext(browser, base, 'smoke-tall-host', tallDevice(375, 667));
  const pal = await newContext(browser, base, 'smoke-tall-pal');
  const [hp, pp] = await Promise.all([host.newPage(), pal.newPage()]);
  watch(hp, 'tall-room-host');
  watch(pp, 'tall-room-pal');
  for (const p of [hp, pp]) {
    await p.goto(`${base}/games/texas/`);
    await p.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
  }
  await enter(hp, '好友房', true);
  await hp.locator('.friends .pill', { hasText: '开房间' }).tap();
  await hp.locator('.rw-seat.me').waitFor();
  const code = ((await hp.locator('.rw-code').textContent()) ?? '').replace(/\D/g, '');
  await pp.goto(`${base}/games/texas/?room=${code}`);
  await linkSit(pp);
  await hp.locator('.rw-go .start').tap();
  await hp.locator('.stage.at-table').waitFor({ timeout: 30_000 });
  await hp.locator('.seat.me .card.up').first().waitFor({ timeout: 30_000 });
  await skipTips(hp);
  await shot(hp, 'tall-se-room');
  // 换行了的话第二行的中线比第一行低一大截
  const mids = await hp.locator('.hud > :not(.hidden)').evaluateAll((es) =>
    es.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0).map((r) => r.top + r.height / 2),
  );
  if (Math.max(...mids) - Math.min(...mids) > 30) throw new Error(`tall room: the top row wrapped ${mids.map(Math.round).join(',')}`);
  await Promise.all([host.close(), pal.close()]);
}

/** 单独部署：见文件头 */
export async function standalone(browser: Browser, base: string): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: DESK_W, height: DESK_H } });
  await cspWatch(ctx);
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('texas.settings')) localStorage.setItem('texas.settings', JSON.stringify({ fast: true, nick: '小明' }));
    if (!localStorage.getItem('texas.guide')) localStorage.setItem('texas.guide', JSON.stringify({ v: 1, done: true, seen: ['result', 'showdown', 'raise'] }));
  });
  const page = await ctx.newPage();
  watch(page, 'alone');
  await page.goto(`${base}/`);
  if (new URL(page.url()).pathname !== '/games/texas/') throw new Error(`standalone: / should go to /games/texas/, got ${page.url()}`);
  await page.locator('.mcard[data-mode="room"]').waitFor();
  for (const sel of ['.lobby .wallet', '.lobby .disclaimer']) if (await page.locator(sel).first().isVisible()) throw new Error(`standalone: ${sel} should be hidden`);
  if (await page.locator('.mcard[data-mode="real"]').isVisible()) throw new Error('standalone: 实盘 should be hidden');
  await shot(page, 'alone-home');
  // 好友房：昵称框和开房间在这一栏里
  await enter(page, '好友房');
  if (await page.locator('.lobby .mode', { hasText: '实盘' }).isVisible()) throw new Error('standalone: 实盘 should be hidden');
  await page.locator('.nick-row').waitFor();
  const home = await page.locator('.home').evaluate((a) => (a as HTMLAnchorElement).href);
  if (home !== `${base}/games/texas/`) throw new Error(`standalone: "大厅" should go to the game, got ${home}`);
  if (!(await page.locator('.friends .pill', { hasText: '开房间' }).isEnabled())) throw new Error('standalone: 开房间 should work without a wallet');
  await shot(page, 'alone-lobby');

  // 单机：只有娱乐
  await enter(page, '娱乐');
  await page.locator('.tile', { hasText: '新手' }).click();
  await openMore(page);
  await page.locator('.size', { hasText: /^4$/ }).click();
  await page.locator('.lobby .start').click();
  await skipTips(page);
  await playUntil(page, 2, new Set()).catch(async (e: unknown) => {
    await shot(page, 'debug-alone-solo');
    throw e;
  });
  await shot(page, 'alone-solo');
  await page.locator('.leave').click();
  if (await page.locator('.dialog').isVisible({ timeout: 2_000 }).catch(() => false)) await page.locator('.d-btn.danger').click();
  await summary(page, 'alone-solo-summary');

  // 好友房：房主带昵称"小明"开房，手机点邀请链接进来（没填昵称，是"游客1234"）
  await enter(page, '好友房');
  await page.locator('.size', { hasText: /^4$/ }).click();
  await page.locator('.friends .pill', { hasText: '开房间' }).click();
  await page.locator('.rw-seat.me').waitFor({ timeout: 20_000 });
  const code = ((await page.locator('.rw-code').textContent()) ?? '').replace(/\D/g, '');
  const phone = await browser.newContext(PHONE);
  await cspWatch(phone);
  const pp = await phone.newPage();
  watch(pp, 'alone-phone');
  await pp.goto(`${base}/games/texas/?room=${code}`);
  await linkSit(pp, true);
  await page.locator('.rw-seat.taken').nth(1).waitFor();
  const names = (await page.locator('.rw-name').allTextContents()).join('|');
  if (!names.includes('小明') || !/游客\d{4}/.test(names)) throw new Error(`standalone room names: ${names}`);
  if (!((await pp.locator('.rw-info').textContent()) ?? '').includes('筹码不算数')) throw new Error('standalone room info should say chips do not count');
  await shot(page, 'alone-room-wait');
  await page.locator('.rw-go .start').click();
  await Promise.all([playRoom(page, 2, 'alone-host', new Set([2])), playRoom(pp, 2, 'alone-phone')]);
  for (const p of [pp, page]) {
    await p.locator('.leave').click();
    if (await p.locator('.dialog').isVisible({ timeout: 2_000 }).catch(() => false)) await p.locator('.d-btn.danger').click();
    await p.locator('.lobby').waitFor();
  }
  log('standalone: solo, guest room ok');
  await Promise.all([ctx.close(), phone.close()]);
}

/**
 * 竖着拿的手机看标题页（0.17.4，手机上曾找不到好友房）：iPhone SE 和常见的 390 宽，快速开始和"好友房"卡在第一屏，
 * 点了以后输码进房那一行也在第一屏（开房间在选完档位的下面，和"坐下开打"一个位置）
 */
export async function portraitLobby(browser: Browser, base: string): Promise<void> {
  // 0.18.0 加上手机横屏和电脑：主页的快速开始、三张模式卡都在第一屏（手机横屏的标题页最挤）
  for (const [tag, width, height, phone] of [
    ['se', 375, 667, true],
    ['portrait', 390, 844, true],
    ['landscape', 844, 390, true],
    ['desk', DESK_W, DESK_H, false],
  ] as const) {
    const ctx = await newContext(browser, base, `smoke-${tag}`, { viewport: { width, height }, ...(phone ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
    const page = await ctx.newPage();
    watch(page, tag);
    await page.goto(`${base}/games/texas/`);
    await page.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
    const onScreen = async (sel: string, what: string): Promise<void> => {
      const b = await page.locator(sel).first().boundingBox();
      if (!b || b.y < 0 || b.y + b.height > height) {
        await shot(page, `debug-${tag}`);
        throw new Error(`${tag}: ${what} should be on the first screen, got ${JSON.stringify(b)}`);
      }
    };
    await onScreen('.qstart', '快速开始');
    for (const m of ['fun', 'real', 'room']) await onScreen(`.mcard[data-mode="${m}"]`, `mode card ${m}`);
    await onScreen('.mystats', 'stats');
    await shot(page, `${tag}-lobby`);
    await enter(page, '好友房', phone);
    await onScreen('.friends.join .code-in', 'room code');
    if (!(await page.locator('.friends.open .pill', { hasText: '开房间' }).isVisible())) throw new Error(`${tag}: 开房间 missing`);
    await shot(page, `${tag}-friends`);
    // 快速匹配（0.20.0）挨着"坐下开打"，最窄的屏也整个看得见
    await enter(page, '实盘', phone);
    await openMore(page, phone);
    await page.locator('.lobby .pill.match').scrollIntoViewIfNeeded();
    const m = await page.locator('.lobby .pill.match').boundingBox();
    if (!m || m.x < 0 || m.x + m.width > width) throw new Error(`${tag}: 快速匹配 should fit the width, got ${JSON.stringify(m)}`);
    await shot(page, `${tag}-real`);
    await ctx.close();
  }
}
