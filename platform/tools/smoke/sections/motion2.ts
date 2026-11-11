/** 冒烟分段：transitions（npm run smoke -- --only=<段名>，段名表在 tools/smoke.ts） */
import type { Browser } from 'playwright-core';
import { BASE, check, shot, newPage } from '../lib/core.ts';
import { FAKE_WALLET, mockSession } from '../lib/fakes.ts';

/**
 * 点"进入游戏"封面从卡片放大铺满再跳转、回大厅时缩回那张卡；键盘快捷键（? 帮助、B 排行、Esc 回大厅、数字键开游戏）。
 * 冒烟浏览器默认是自动化模式（动效全关），这里把 navigator.webdriver 改成 false，按真人浏览器的样子播。
 */
export async function transitions(browser: Browser): Promise<void> {
  console.log('进出游戏过渡、键盘快捷键');
  const { ctx, page } = await newPage(browser, '过渡', 'desktop');
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  // 记下每次 pageshow 是不是从往返缓存恢复的，后退那一步用
  await page.addInitScript(() => addEventListener('pageshow', (e) => ((window as unknown as { __shows: boolean[] }).__shows ??= []).push(e.persisted)));
  await mockSession(page);
  // 游戏页换成一页空白占位：只看跳没跳到
  await page.route('**/games/*/', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>游戏</title><p>游戏</p>' }));
  await page.goto(`${BASE}/`);
  // 按钮字是"进入游戏"，开盘要是最近玩过的就是"继续玩"：按卡片找，不按字找
  const enter = page.locator('.lobby-grid .card[data-game="kaipan"] .card__play');
  await enter.click();
  await page.locator('.enterfx').waitFor({ timeout: 2_000 });
  await shot(page, 'enter-zoom', false); // 放大层是 fixed 的，整页截图会把它截成一截
  await page.waitForURL((u) => u.pathname === '/games/kaipan/');
  const rec = await page.evaluate(() => sessionStorage.getItem('arcade.enterFx'));
  check(rec !== null && JSON.parse(rec).id === 'kaipan', `进游戏该记下 arcade.enterFx：${rec}`);
  // 回大厅：封面从满屏缩回开盘那张卡，播完就移除，记录删掉
  await page.goto(`${BASE}/`);
  await page.locator('.enterfx').waitFor({ state: 'attached', timeout: 3_000 });
  await page.locator('.enterfx').waitFor({ state: 'detached', timeout: 3_000 });
  check((await page.evaluate(() => sessionStorage.getItem('arcade.enterFx'))) === null, '回大厅播完该删掉 arcade.enterFx');
  // 浏览器后退：大厅可能从往返缓存（bfcache）原样恢复，进游戏时那张满屏封面不能还盖在上面
  await enter.click();
  await page.waitForURL((u) => u.pathname === '/games/kaipan/');
  await page.goBack();
  await page.waitForURL((u) => u.pathname === '/');
  await page.locator('.enterfx').first().waitFor({ state: 'detached', timeout: 3_000 });
  const persisted = await page.evaluate(() => (window as unknown as { __shows?: boolean[] }).__shows?.at(-1) ?? false);
  const clickable = await page.locator('.lobby-grid .card__play[href]').first().evaluate((a) => {
    const r = a.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && a.contains(hit);
  });
  check((await page.locator('.enterfx').count()) === 0 && clickable, `后退回大厅后不该还有过渡层盖着、卡片要能点（${persisted ? '从往返缓存恢复' : '重新加载'}）`);
  console.log(`  后退回大厅：${persisted ? '从往返缓存恢复' : '重新加载'}，没有残留的封面`);
  // 无头浏览器不一定走往返缓存：直接模拟一次恢复，留一张封面再发 persisted 的 pageshow，看会不会被收掉
  await page.evaluate(() => {
    const el = document.createElement('div');
    el.className = 'enterfx';
    document.body.append(el);
    dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  check((await page.locator('.enterfx').count()) === 0, '往返缓存恢复（pageshow persisted）时该拿掉残留的过渡层');
  // 键盘
  await page.locator('.card').first().waitFor();
  await page.keyboard.press('?');
  const help = page.getByRole('dialog', { name: '快捷键' });
  await help.waitFor();
  // 这一段关了自动化标记，淡入真的在播：等动画放完再截，免得截到半透明的面板。
  // 用 allSettled：中途被取消的动画（元素被移除）的 finished 会以 AbortError 拒绝，不能让它把冒烟弄挂
  await page.evaluate(() => Promise.allSettled(document.getAnimations().map((a) => a.finished)));
  await shot(page, 'hotkeys-help', false);
  await page.keyboard.press('Escape');
  await help.waitFor({ state: 'detached' });
  check(new URL(page.url()).pathname === '/', 'Esc 先关帮助，不该离开大厅');
  await page.keyboard.press('b');
  await page.waitForURL((u) => u.pathname === '/boards');
  await page.locator('main.page-in').waitFor();
  await page.keyboard.press('Escape');
  await page.waitForURL((u) => u.pathname === '/');
  const first = await page.locator('.lobby-grid .card__play[href]').first().getAttribute('href');
  await page.locator('.card').first().waitFor();
  await page.keyboard.press('1');
  await page.waitForURL((u) => u.pathname === first);
  await ctx.close();
  await chipsBack(browser);
}

/**
 * 从游戏回大厅：筹码总数（余额 + 桌上）比进去时多，顶栏数字滚上去、牌子迸金币；少了只滚数字；没变、筹码挪到桌上了都不播（src/lib/chips-fx.ts）。
 */
async function chipsBack(browser: Browser): Promise<void> {
  console.log('回大厅的筹码演出');
  const { ctx, page } = await newPage(browser, '筹码演出', 'desktop');
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  let w: { balance: number; stakes: object[] } = { balance: 10_000, stakes: [] };
  await mockSession(page, { wallet: () => ({ ...FAKE_WALLET, wallet: { ...FAKE_WALLET.wallet, ...w, fresh: false } }) });
  await page.route('**/games/*/', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>游戏</title><p>游戏</p>' }));
  // 记下每次回来有没有迸金币（金币层播完就删，等元素会错过）
  await page.addInitScript(() => {
    new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) if (n instanceof HTMLElement && n.classList.contains('chips-burst')) (window as unknown as { __burst: number }).__burst = 1;
    }).observe(document, { childList: true, subtree: true });
  });
  const badge = page.getByTestId('wallet-badge');
  const round = async (next: typeof w, label: string) => {
    await page.goto(`${BASE}/`);
    // 钱包读到了（latestTotal 有数）再点进游戏，不然进去时记不下总数
    await badge.locator('.chips-num:not(.chips-num--wait)').waitFor();
    await page.waitForTimeout(700);
    await page.locator('.lobby-grid .card[data-game="kaipan"] .card__play').click();
    await page.waitForURL((u) => u.pathname === '/games/kaipan/');
    w = next;
    await page.goto(`${BASE}/`);
    await page.waitForTimeout(250);
    if (label === 'win') await shot(page, 'chips-burst', false);
    await page.waitForTimeout(800);
    const burst = await page.evaluate(() => (window as unknown as { __burst?: number }).__burst === 1);
    const text = (await badge.textContent()) ?? '';
    return { burst, text };
  };
  const win = await round({ balance: 12_500, stakes: [] }, 'win');
  check(win.burst && win.text.includes('12,500'), `赢了回大厅该迸金币、数字到 12,500：${JSON.stringify(win)}`);
  const lose = await round({ balance: 11_000, stakes: [] }, 'lose');
  check(!lose.burst && lose.text.includes('11,000'), `输了只滚数字、不迸金币：${JSON.stringify(lose)}`);
  // 实盘中途离开：2,000 还在桌上，总数没变，不算赢也不算输
  const table = await round({ balance: 9_000, stakes: [{ game: 'texas', ref: 'r1', tier: 'small', amount: 2_000, at: Date.now(), until: Date.now() + 3_600_000, mode: 'server' }] }, 'table');
  check(!table.burst, `筹码挪到桌上不该迸金币：${JSON.stringify(table)}`);
  console.log(`  赢了迸金币到 ${win.text.trim()}；输了只滚到 ${lose.text.trim()}；挪到桌上不播`);
  await ctx.close();
}
