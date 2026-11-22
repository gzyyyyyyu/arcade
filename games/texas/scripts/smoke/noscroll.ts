/** 不滚动检查（--only noscroll）：每个界面在各尺寸下都不该出滚动条。 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright-core';
import { opt } from '../args.ts';
import { SHOTS, log, newContext, watch, skipTips, enter } from './harness.ts';
import { IPHONE } from './solo.ts';

/**
 * 不滚动（--only noscroll，docs/ui.md 第 11 节）：五个尺寸各走一遍所有界面，量页面和每个能滚的元素有没有"装不下"（纵横都查，多 1px 不算）。
 * 结果写成清单 <shots>/noscroll.txt（尺寸、界面、元素、多出多少 px），只给有问题的界面截图；有问题就抛错。没走到的界面也列在清单里。
 */
const NOSCROLL_SIZES: [string, number, number, boolean][] = [
  ['1280x720', 1280, 720, false],
  ['1920x1080', 1920, 1080, false],
  ['844x390', 844, 390, true],
  ['390x844', 390, 844, true],
  ['360x640', 360, 640, true],
];

interface ScrollHit {
  size: string;
  screen: string;
  el: string;
  axis: Axis;
  over: number;
}
/**
 * 纵、横：要滚；叠：两个可点的东西框子相交；裁：文字装不下被截（11-02：只量滚不滚抓不到按钮互压、字被裁一截）；
 * 出：面板、弹窗、按钮、名牌、牌伸出屏幕（11-21：好友房等人页电脑版底边伸出 4 像素，页面不滚所以前三样都抓不到）
 */
type Axis = '纵' | '横' | '叠' | '裁' | '出';

/**
 * 有意截断、不算"裁"的文字（选择器 → 理由）。只放确实想要省略号或固定一行的；加一条写一句为什么。
 */
const CLIP_OK: [string, string][] = [
  ['.rw-name', '好友房等人页座位卡里的昵称：卡宽固定，长昵称按省略号截（不是数字）'],
];

/** 页面本身和所有看得见的、overflow 是 auto 或 scroll 的元素：内容比框大（超过 1px）就算要滚 */
export const measureScroll = (page: Page): Promise<{ el: string; axis: Axis; over: number }[]> =>
  page.evaluate((CLIP) => {
    const out: { el: string; axis: Axis; over: number }[] = [];
    const name = (e: Element): string => {
      const own = e.tagName.toLowerCase() + [...e.classList].map((c) => '.' + c).join('');
      const p = e.parentElement;
      return p && p !== document.body ? `${p.tagName.toLowerCase()}${[...p.classList].map((c) => '.' + c).join('')} > ${own}` : own;
    };
    const se = document.scrollingElement as HTMLElement;
    if (se.scrollHeight - se.clientHeight > 1) out.push({ el: '(页面)', axis: '纵', over: se.scrollHeight - se.clientHeight });
    if (se.scrollWidth - se.clientWidth > 1) out.push({ el: '(页面)', axis: '横', over: se.scrollWidth - se.clientWidth });
    for (const e of document.querySelectorAll<HTMLElement>('body *')) {
      const cs = getComputedStyle(e);
      const y = cs.overflowY === 'auto' || cs.overflowY === 'scroll';
      const x = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
      if (!y && !x) continue;
      const r = e.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0 || cs.visibility === 'hidden' || e.getClientRects().length === 0) continue;
      if (y && e.scrollHeight - e.clientHeight > 1) out.push({ el: name(e), axis: '纵', over: e.scrollHeight - e.clientHeight });
      if (x && e.scrollWidth - e.clientWidth > 1) out.push({ el: name(e), axis: '横', over: e.scrollWidth - e.clientWidth });
    }
    // 可点元素两两不相交：弹窗开着时只看最上面那层弹窗里的（底下的点不到）
    const vis = (e: Element): boolean => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05 && e.getClientRects().length > 0 && !e.closest('[aria-hidden="true"], .hidden');
    };
    const masks = [...document.querySelectorAll('.mask, .pz-mask, .aiv-back, .atf-box')].filter(vis);
    const scope: ParentNode = masks.at(-1) ?? document;
    const TAP = 'button, a[href], [role=button], input[type=range]';
    // 被不可点的层整个盖住的不算（互动面板盖住的补码、歇一手：点不到，也看不见）。中心点上是别的按钮的照算，那正是两个按钮压在一起
    const covered = (e: Element): boolean => {
      const r = e.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!top && !e.contains(top) && !top.closest(TAP);
    };
    const taps = [...scope.querySelectorAll<HTMLElement>(TAP)].filter((e) => vis(e) && !(e as HTMLButtonElement).disabled && !covered(e));
    taps.forEach((ea, i) => {
      const a = ea.getBoundingClientRect();
      for (const eb of taps.slice(i + 1)) {
        if (ea.contains(eb) || eb.contains(ea)) continue;
        const b = eb.getBoundingClientRect();
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 1 && h > 1) out.push({ el: `${name(ea)} × ${name(eb)}`, axis: '叠', over: Math.round(Math.min(w, h)) });
      }
    });
    // 伸出屏幕：整块的东西（面板、弹窗、按钮、名牌、牌、结果条）框子出了视口 1px 以上；fx 层的飞行动画不算
    for (const e of document.querySelectorAll<HTMLElement>(`${TAP}, .panel, .front, .room-wait, .dialog, .seat .plate, .card, .result.on, .actions .odds`)) {
      if (!vis(e) || e.closest('.fx')) continue;
      const r = e.getBoundingClientRect();
      const over = Math.max(-r.left, -r.top, r.right - innerWidth, r.bottom - innerHeight);
      if (over > 1) out.push({ el: name(e), axis: '出', over: Math.round(over) });
    }
    // 文字被裁：自己直接带字、框子装不下（scrollWidth/Height 比 clientWidth/Height 大 1px 以上），登记过的有意截断除外
    const ok = (e: Element): boolean => CLIP.some((s) => e.matches(s));
    for (const e of document.querySelectorAll<HTMLElement>('body *')) {
      if (e.clientWidth === 0 || !vis(e) || ok(e)) continue;
      if (![...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '')) continue;
      const cs = getComputedStyle(e);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible' && cs.textOverflow !== 'ellipsis' && !cs.webkitLineClamp?.match(/\d/)) continue;
      const dx = e.scrollWidth - e.clientWidth;
      const dy = e.scrollHeight - e.clientHeight;
      if (dx > 1 || dy > 1) out.push({ el: `${name(e)}「${(e.textContent ?? '').trim().slice(0, 12)}」`, axis: '裁', over: Math.max(dx, dy) });
    }
    return out;
  }, CLIP_OK.map(([s]) => s));

/** 全下局：全下和弃牌交替点（直接 click 事件，不管触屏还是鼠标），打到结果卡出来 */
async function playPfToEnd(page: Page): Promise<number> {
  let n = 0;
  const deadline = Date.now() + 240_000;
  while (!(await page.locator('.pf-sum').isVisible())) {
    if (Date.now() > deadline) throw new Error('全下局 4 分钟没打完');
    if (await page.locator('.actions.on').isVisible()) await page.locator(n++ % 3 === 2 ? '.act.fold' : '.act.call').evaluate((e) => (e as HTMLElement).click()).catch(() => {});
    await page.waitForTimeout(150);
  }
  return n;
}

export async function noScrollFlow(browser: Browser, base: string): Promise<void> {
  const hits: ScrollHit[] = [];
  const reached: string[] = [];
  const unreached: string[] = [];
  // --sizes 1920x1080,390x844：只量这几个（复查一处时不用把五个尺寸都走一遍）
  const pick = opt('sizes', '').split(',').filter(Boolean);
  const sizes = NOSCROLL_SIZES.filter(([size]) => !pick.length || pick.includes(size));
  for (const [size, width, height, touch] of sizes) {
    const ctx = await newContext(browser, base, `smoke-noscroll-${size}`, touch ? { viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPHONE } : { viewport: { width, height } });
    await ctx.addInitScript(() => localStorage.setItem('texas.settings', JSON.stringify({ fast: true })));
    const page = await ctx.newPage();
    watch(page, `noscroll-${size}`);
    const go = async (sel: string): Promise<void> => {
      const l = page.locator(sel).first();
      try {
        await (touch ? l.tap({ timeout: 5_000 }) : l.click({ timeout: 5_000 }));
      } catch {
        await l.evaluate((e) => (e as HTMLElement).click());
      }
    };
    const home = async (query = ''): Promise<void> => {
      await page.goto(`${base}/games/texas/${query}`);
      await page.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
    };
    /** 量一次；有问题就截图 */
    const look = async (screen: string): Promise<void> => {
      await page.waitForTimeout(450);
      const found = await measureScroll(page);
      reached.push(`${size} ${screen}`);
      for (const f of found) hits.push({ size, screen, ...f });
      if (found.length) await page.screenshot({ path: join(SHOTS, `noscroll-${size}-${screen}.png`) });
      log('noscroll', size, screen, found.length ? found.map((f) => `${f.el}${f.axis}+${f.over}`).join(' ') : 'ok');
    };
    /** 一段走法：走不到就记"没走到"，下一段从主页重来 */
    const step = async (screens: string, run: () => Promise<void>): Promise<void> => {
      try {
        await run();
      } catch (e) {
        unreached.push(`${size} ${screens}: ${String(e).split('\n')[0]}`);
        await page.screenshot({ path: join(SHOTS, `noscroll-${size}-unreached-${screens.split(/[ /]/)[0]}.png`) }).catch(() => {});
      }
    };
    /** 折起来的"更多玩法"里的按钮：看不见就先点开 */
    const reveal = async (sel: string): Promise<void> => {
      if (await page.locator(sel).first().isVisible()) return;
      const more = page.locator('.lobby .more-btn');
      if ((await more.count()) && (await more.getAttribute('aria-expanded')) !== 'true') await go('.lobby .more-btn');
      await page.locator(sel).first().waitFor({ timeout: 5_000 });
    };
    const myTurn = (): Promise<void> => page.locator('.actions.on').waitFor({ timeout: 90_000 });
    const sit = async (): Promise<void> => {
      await skipTips(page);
      await page.locator('.seat.me .card.up').first().waitFor({ timeout: 30_000 });
    };
    /** 前面几段离开时没离桌，主页挂着"继续上局"：今日全下、坐下开打都灰着（先打完上一桌）。接着打进去再离桌结算掉 */
    const clearUnfinished = async (): Promise<void> => {
      for (let tries = 0; tries < 3; tries++) {
        await home();
        // 主页上没打完的那桌是大按钮"继续上局"（选桌页才是横幅）；存档读完才换字，数字出来时可能还没到
        const resume = page.locator('.lobby .qstart', { hasText: '继续上局' });
        const shown = await resume
          .waitFor({ state: 'visible', timeout: 3_000 })
          .then(() => true)
          .catch(() => false);
        if (!shown) return;
        await resume.click();
        await page.locator('.stage.at-table').waitFor();
        await skipTips(page);
        await go('.leave');
        await page.locator('.dialog').waitFor();
        await go('.d-btn.danger');
        await page.locator('.summary').waitFor({ timeout: 20_000 });
      }
      await home();
    };

    await step('首页', async () => {
      await home();
      await look('home');
    });
    await step('每日谜题', async () => {
      await home();
      await go('.pz-open');
      await page.locator('.pz').waitFor();
      await look('puzzle');
    });
    await step('成就', async () => {
      await home();
      await go('.ach-open');
      await page.locator('.ach-panel').waitFor();
      await look('ach');
    });
    await step('选桌', async () => {
      await home();
      await enter(page, '娱乐', touch);
      await page.locator('.lobby').waitFor();
      await look('lobby-fun');
      if (await page.locator('.lobby .more-btn').count()) {
        await go('.lobby .more-btn');
        await look('lobby-fun-more');
      }
      await go('.p-back');
      await enter(page, '实盘', touch);
      await page.locator('.lobby').waitFor();
      await look('lobby-real');
    });
    await step('选桌 好友房', async () => {
      await home('?online=1');
      await enter(page, '好友房', touch);
      await page.locator('.friends').first().waitFor();
      await look('lobby-room');
    });
    await step('单机牌桌 加注 帮助 设置 一手结束 补码 离桌 结算', async () => {
      await clearUnfinished();
      await enter(page, '娱乐', touch);
      // 带最少的上桌：打完一手没输光也一定有"补码"可点（带满了就没有，补码弹窗量不到）
      await page.locator('.lobby .slider').evaluate((e) => {
        const r = e as HTMLInputElement;
        r.value = r.min;
        r.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await go('.lobby .start');
      await sit();
      await myTurn();
      await look('table-turn');
      await go('.topbar .gear');
      await page.locator('.settings .st-box').waitFor();
      await look('settings');
      await page.keyboard.press('Escape');
      await page.locator('.settings').waitFor({ state: 'detached' });
      await go('.topbar .help');
      await page.locator('.coach-box').waitFor({ timeout: 5_000 });
      await look('help');
      await go('.coach-box .c-btn:not(.primary)');
      await page.waitForTimeout(300);
      await go('.act.raise');
      await page.locator('.raise-panel').waitFor({ state: 'visible', timeout: 5_000 });
      await look('table-raise');
      // 一直跟注到这一手结束（中途输光了就看一眼补码弹窗）
      const deadline = Date.now() + 120_000;
      let busted = false;
      while (!(await page.locator('.next-hand').isVisible())) {
        if (Date.now() > deadline) throw new Error('一手没打完');
        if (await page.locator('.dialog').isVisible()) {
          busted = true;
          await look('busted');
          await go('.d-btn.primary');
        } else if (await page.locator('.actions.on').isVisible()) await page.locator('.act.call').evaluate((e) => (e as HTMLElement).click()).catch(() => {});
        await page.waitForTimeout(150);
      }
      await page.locator('.result.on').waitFor({ timeout: 5_000 });
      await look('hand-end');
      const topUp = page.locator('.hud .pill', { hasText: '补码' });
      if (await topUp.isVisible()) {
        await topUp.evaluate((e) => (e as HTMLElement).click());
        await page.locator('.dialog').waitFor({ timeout: 5_000 });
        await look('topup');
        await page.keyboard.press('Escape');
        await page.locator('.dialog').waitFor({ state: 'detached', timeout: 3_000 }).catch(async () => go('.d-btn:not(.primary)'));
      } else if (!busted) unreached.push(`${size} 输光或补码弹窗: 补码按钮不在，这一手也没输光`);
      await go('.leave');
      await page.locator('.dialog').waitFor();
      await look('leave-confirm');
      await go('.d-btn.danger');
      await page.locator('.summary').waitFor({ timeout: 20_000 });
      await look('summary');
    });
    await step('指引', async () => {
      // 全新账号第一次轮到我：盖出新手指引
      const gctx = await newContext(browser, base, `smoke-noscroll-guide-${size}`, touch ? { viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPHONE } : { viewport: { width, height } }, true);
      await gctx.addInitScript(() => localStorage.setItem('texas.settings', JSON.stringify({ fast: true })));
      const gp = await gctx.newPage();
      watch(gp, `noscroll-guide-${size}`);
      try {
        await gp.goto(`${base}/games/texas/`);
        await gp.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
        await gp.locator('.qstart').first().evaluate((e) => (e as HTMLElement).click());
        await gp.locator('.coach-box').waitFor({ timeout: 90_000 });
        await gp.waitForTimeout(450);
        const found = await measureScroll(gp);
        reached.push(`${size} guide`);
        for (const f of found) hits.push({ size, screen: 'guide', ...f });
        if (found.length) await gp.screenshot({ path: join(SHOTS, `noscroll-${size}-guide.png`) });
        log('noscroll', size, 'guide', found.length ? 'over' : 'ok');
      } finally {
        await gctx.close();
      }
    });
    await step('锦标赛牌桌 锦标赛离开 锦标赛结算', async () => {
      await home();
      await enter(page, '娱乐', touch);
      await reveal('.lobby .tour-btn');
      await go('.lobby .tour-btn');
      await skipTips(page);
      await page.locator('.stage.at-table').waitFor();
      await myTurn();
      await look('tour-table');
      await go('.pill.leave');
      await page.locator('.dialog').waitFor();
      await look('tour-leave');
      await go('.d-btn.danger');
      await page.locator('.tour-sum').waitFor({ timeout: 60_000 });
      await look('tour-summary');
    });
    await step('全下局', async () => {
      await home();
      await enter(page, '娱乐', touch);
      await reveal('.lobby [data-act="pf"]');
      await go('.lobby [data-act="pf"]');
      await skipTips(page);
      await page.locator('.stage.at-table').waitFor();
      await page.locator('.actions.on').waitFor({ timeout: 60_000 });
      await look('pushfold-table');
      // 打满一局出结果卡
      const nf = await playPfToEnd(page);
      void nf;
      await look('pushfold-result');
    });
    /** 单开一个新账号走到某一屏再量：主账号前面几段留下的桌子、今天打过的局会让入口灰着或直接给成绩 */
    const fresh = async (screen: string, run: (p: Page) => Promise<void>): Promise<void> => {
      const fctx = await newContext(browser, base, `smoke-noscroll-${screen}-${size}`, touch ? { viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPHONE } : { viewport: { width, height } });
      await fctx.addInitScript(() => localStorage.setItem('texas.settings', JSON.stringify({ fast: true })));
      const fp = await fctx.newPage();
      watch(fp, `noscroll-${screen}-${size}`);
      try {
        await fp.goto(`${base}/games/texas/`);
        await fp.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
        await run(fp);
        await fp.waitForTimeout(450);
        const found = await measureScroll(fp);
        reached.push(`${size} ${screen}`);
        for (const f of found) hits.push({ size, screen, ...f });
        if (found.length) await fp.screenshot({ path: join(SHOTS, `noscroll-${size}-${screen}.png`) });
        log('noscroll', size, screen, found.length ? found.map((f) => `${f.el}${f.axis}+${f.over}`).join(' ') : 'ok');
      } finally {
        await fctx.close();
      }
    };
    await step('今日全下结果', () =>
      fresh('pushfold-daily-result', async (dp) => {
        await enter(dp, '娱乐', touch);
        await dp.locator('.lobby [data-act="daily-pf"]').evaluate((e) => (e as HTMLElement).click());
        await skipTips(dp);
        await dp.locator('.stage.at-table').waitFor();
        await playPfToEnd(dp);
      }),
    );
    await step('止盈弹窗 设置各页签 止盈叠层', async () => {
      await home();
      await enter(page, '实盘', touch);
      await page.locator('.lobby').waitFor();
      await reveal('.lobby .tp-pick-btn');
      await go('.lobby .tp-pick-btn');
      await page.locator('.dialog .tp-own').waitFor({ timeout: 5_000 });
      await look('takeprofit');
      await page.keyboard.press('Escape');
      await page.locator('.dialog').waitFor({ state: 'detached', timeout: 3_000 }).catch(async () => go('.d-btn'));
      // 选桌页上的设置：三个页签各量一次（横屏三栏同屏，页签按钮点得到就点）
      await go('.topbar .gear');
      await page.locator('.settings .st-box').waitFor();
      for (const t of [0, 1, 2]) {
        const tb = page.locator(`.settings .st-tabs .tab-${t}`);
        if (!(await tb.count())) continue;
        await tb.evaluate((e) => (e as HTMLElement).click());
        await look(`settings-tab${t}`);
      }
      // 设置里点止盈：叠一层 dialog
      const tpRow = page.locator('.settings .st-row', { hasText: '止盈' }).locator('button').first();
      if (await tpRow.count()) {
        await page.locator('.settings .st-tabs .tab-1').evaluate((e) => (e as HTMLElement).click()).catch(() => {});
        await tpRow.evaluate((e) => (e as HTMLElement).click());
        await page.locator('.dialog .tp-own').waitFor({ timeout: 5_000 });
        await look('settings-takeprofit');
      } else unreached.push(`${size} 设置里的止盈叠层: 选桌页的设置里没有止盈这一行`);
    });
    await step('匹配真人卡', async () => {
      await home();
      await enter(page, '实盘', touch);
      await reveal('.lobby .pill.match');
      await go('.lobby .pill.match');
      await page.locator('.match-card .mc-wait', { hasText: '已有' }).waitFor({ timeout: 15_000 });
      await look('match-card');
      await go('.d-btn.primary');
      await page.locator('.match-card').waitFor({ state: 'detached' });
    });
    await step('好友房等人 叫朋友 离开房间', async () => {
      await home('?online=1');
      await enter(page, '好友房', touch);
      await page.locator('.friends').first().waitFor();
      await go('.size >> text=/^4$/');
      await go('.friends .pill >> text=开房间');
      await page.locator('.room-wait').waitFor({ timeout: 15_000 });
      await page.locator('.rw-seat.me').waitFor();
      await look('room-wait');
      await go('.rw-invite');
      await page.locator('#arcade-invite-panel').waitFor({ timeout: 5_000 });
      await look('room-invite');
      await go('[data-key="invite:close"]');
      await page.locator('#arcade-invite-panel').waitFor({ state: 'detached' });
      await go('.pill.leave');
      await page.locator('.dialog').waitFor({ timeout: 5_000 });
      await look('room-leave');
      await go('.d-btn.danger');
    });
    await step('牌桌互动面板', () =>
      fresh('table-fun', async (fp) => {
        await enter(fp, '娱乐', touch);
        await fp.locator('.lobby .start').evaluate((e) => (e as HTMLElement).click());
        await skipTips(fp);
        await fp.locator('.seat.me .card.up').first().waitFor({ timeout: 30_000 });
        // kit 的互动按钮坐下后才挂上：等看得见的那个再点
        const btn = fp.locator('.atf-btn:visible').first();
        await btn.waitFor({ timeout: 15_000 });
        await btn.evaluate((e) => (e as HTMLElement).click());
        await fp.locator('.atf-box').waitFor({ timeout: 5_000 });
      }),
    );
    await step('每日谜题 揭晓 总结卡', async () => {
      await home();
      await go('.pz-open');
      await page.locator('.pz').waitFor();
      for (let n = 1; n <= 5; n++) {
        await page.locator('.pz-name b', { hasText: `第 ${n} / 5 题` }).waitFor({ timeout: 10_000 });
        await page.locator('.pz .card.up').first().waitFor();
        if (n === 1) await look('puzzle-q1');
        await go('.pz-ch');
        await page.locator('.pz-verdict').waitFor({ timeout: 5_000 });
        await page.waitForTimeout(1_900);
        if (n === 1 || n === 5) await look(`puzzle-reveal${n}`);
        await go('.pz-next');
      }
      await page.waitForTimeout(300);
      await look('puzzle-total');
    });
    await ctx.close();
  }

  const lines = [
    `不滚动检查 ${new Date().toISOString().slice(0, 10)}：${sizes.map((s) => s[0]).join(' ')}；量了 ${reached.length} 个界面，要滚 ${hits.filter((h) => h.axis === '纵' || h.axis === '横').length} 处、可点元素重叠 ${hits.filter((h) => h.axis === '叠').length} 处、文字被裁 ${hits.filter((h) => h.axis === '裁').length} 处、伸出屏幕 ${hits.filter((h) => h.axis === '出').length} 处（德州没有画布，按钮都是 DOM，全部量到）`,
    '',
    '尺寸\t界面\t元素\t类别（纵/横=要滚，叠=可点元素相交，裁=文字被裁，出=伸出屏幕）\t多出(px)',
    ...hits.map((h) => `${h.size}\t${h.screen}\t${h.el}\t${h.axis}\t${h.over}`),
    '',
    `没走到 ${unreached.length} 项`,
    ...unreached,
    '',
    '量过的界面:',
    ...reached,
  ];
  const path = join(SHOTS, 'noscroll.txt');
  writeFileSync(path, lines.join('\n') + '\n');
  log('noscroll list', path);
  if (hits.length) throw new Error(`${hits.length} places scroll, overlap or clip, see ${path}`);
}
