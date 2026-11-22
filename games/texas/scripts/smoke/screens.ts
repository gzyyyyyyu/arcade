/** 弹窗、大厅界面、成就、谜题、设置（--only dialogs / lobbyui / ach / puzzle / settings）。 */
import type { Browser, Page } from 'playwright-core';
import { opt } from '../args.ts';
import { DESK_W, log, newContext, watch, shot, enter, openMore } from './harness.ts';
import { summary, IPHONE, tallDevice } from './solo.ts';

/**
 * 弹窗（--only dialogs，仓库根 docs/ui.md 第 5 节）：娱乐桌上点离桌，确认框的默认焦点在"接着打"、"离桌"是危险色；
 * 弹窗开着按 F/C 不会弃牌或跟注（键不漏到牌桌）、Tab 十次焦点不出弹窗、Esc 关掉并把焦点还给离桌按钮；最后真离桌走到结算页
 */
export async function dialogsFlow(browser: Browser, base: string): Promise<void> {
  const ctx = await newContext(browser, base, 'smoke-dialogs');
  await ctx.addInitScript(() => localStorage.setItem('texas.settings', JSON.stringify({ fast: true })));
  const page = await ctx.newPage();
  watch(page, 'dialogs');
  await page.goto(`${base}/games/texas/`);
  await page.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
  await enter(page, '娱乐');
  await page.locator('.lobby .start').click();
  await page.locator('.seat.me .card.up').first().waitFor();
  const focused = (): Promise<string> => page.evaluate(() => (document.activeElement as HTMLElement | null)?.textContent?.trim() ?? '');
  await page.locator('.leave').click();
  await page.locator('.dialog').waitFor();
  if ((await focused()) !== '接着打') throw new Error(`leave confirm default focus should be 接着打, got ${await focused()}`);
  if ((await page.locator('.d-btn.danger').textContent())?.trim() !== '离桌') throw new Error('离桌 should be the danger button');
  if ((await page.locator('.dialog .d-btn.primary').count()) !== 0) throw new Error('leave confirm should have no gold primary button');
  const bg = await page.locator('.d-btn.danger').evaluate((e) => getComputedStyle(e).backgroundColor + '|' + getComputedStyle(e).backgroundImage);
  log('danger bg', bg);
  await shot(page, 'dialog-leave');
  // 键不漏到牌桌（F 弃牌、C 跟注、R 加注）：按了弹窗还在；漏没漏由 test/view/dialog.test.ts 查
  for (const k of ['f', 'c', 'r']) await page.keyboard.press(k);
  if (!(await page.locator('.dialog').isVisible())) throw new Error('letter keys should not close the dialog');
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press(i % 2 ? 'Tab' : 'Shift+Tab');
    if (!(await page.evaluate(() => !!document.activeElement?.closest('.dialog')))) throw new Error(`focus left the dialog at ${i}`);
  }
  await page.keyboard.press('Escape');
  await page.locator('.dialog').waitFor({ state: 'detached' });
  if (!(await page.evaluate(() => !!document.activeElement?.closest('.leave') || document.activeElement?.classList.contains('leave')))) throw new Error('focus should return to the leave button');
  log('dialogs: Esc closed, focus returned');
  await page.locator('.leave').click();
  await page.locator('.dialog').waitFor();
  await page.locator('.d-btn.danger').click();
  await summary(page, 'dialog-summary');
  await page.locator('.lobby').waitFor();
  await ctx.close();
}

/**
 * 止盈（--only tp）：实盘小桌把止盈设成"赢 1"，一直跟注，赢到的那一手打完就自动离桌：
 * 不问"离桌吗"、出结算页、钱包比坐下前多。大厅"带上桌"下面那一行显示同一个设置
 */
/**
 * 选桌页的界面规范（--only lobbyui，仓库根 docs/ui.md 第 2、4、9、11 节）：实盘选桌首屏金色主按钮只有"坐下开打"一个、
 * 选项不折叠（人数、带多少、止盈、匹配真人、锦标赛、全下局、今日全下、今日锦标赛直接摆着）、选中的档位卡不和主按钮同色；
 * 五个尺寸（1280×720、1920×1080、844×390、390×844、360×640）下主页、实盘/娱乐/好友房选桌的 .lobby 和右栏都不滚（scrollHeight ≤ clientHeight），
 * 可见按钮不小于 32、字不小于 12，各截一张；
 * 然后不碰鼠标：← / → 换档位、回车坐下开打；弹窗开着、输入框里不拦（电脑 1280×720）
 */
export async function lobbyUiFlow(browser: Browser, base: string): Promise<void> {
  const rigs = [
    { tag: 'desk', device: { viewport: { width: 1280, height: 720 } }, touch: false },
    { tag: 'portrait', device: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, touch: true },
    { tag: 'landscape', device: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, touch: true },
    { tag: 'fhd', device: { viewport: { width: 1920, height: 1080 } }, touch: false },
    { tag: 'small', device: { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, touch: true },
  ] as const;
  // 页面和右栏有没有滚动条、可见按钮最小多大、最小字号（只量看得见的）
  const fit = (page: Page): Promise<{ page: string; lobby: string; side: string; minBtn: number; minFont: number; slim: string }> =>
    page.evaluate(() => {
      const lobby = document.querySelector('.lobby') as HTMLElement;
      const side = [...document.querySelectorAll('.lobby .side > .panel, .lobby .side > .front')].find((e) => !e.classList.contains('hidden')) as HTMLElement;
      const de = document.documentElement;
      const show = (e: HTMLElement): string => `${e.scrollHeight}/${e.clientHeight}`;
      let minBtn = 999;
      let minFont = 999;
      let slim = '';
      for (const e of lobby.querySelectorAll<HTMLElement>('*')) {
        if (e.closest('.hidden') || e.closest('.hero')) continue;
        const r = e.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (e.matches('button, input')) {
          if (r.height < minBtn) minBtn = r.height;
          if (r.height < 32 && !e.matches('.p-back')) slim += `${e.className}:${Math.round(r.height)} `;
        }
        if ([...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim()) && !e.closest('.ver')) {
          const f = parseFloat(getComputedStyle(e).fontSize);
          if (f < minFont) minFont = f;
          if (f < 12) slim += `font ${e.className}:${f} `;
        }
      }
      return { page: `${de.scrollHeight}/${de.clientHeight}`, lobby: show(lobby), side: show(side), minBtn: Math.round(minBtn), minFont, slim };
    });
  const roomOpen = (page: Page): Promise<void> => page.waitForTimeout(250);
  for (const { tag, device, touch } of rigs) {
    if (opt('rig', '') && opt('rig', '') !== tag) continue;
    const ctx = await newContext(browser, base, `smoke-lobbyui-${tag}`, device);
    const page = await ctx.newPage();
    watch(page, `lobbyui-${tag}`);
    await page.goto(`${base}/games/texas/`);
    await page.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
    await enter(page, '实盘', touch);
    await page.waitForTimeout(500);
    const goN = await page.locator('.lobby .start:visible, .lobby .pill.go:visible, .lobby .qstart:visible').count();
    if (goN !== 1) throw new Error(`[${tag}] 选桌页的主按钮应只有 1 个，实际 ${goN}`);
    // 选中的档位卡不和主按钮同色
    const fill = await page.evaluate(() => {
      const bg = (s: string): string => getComputedStyle(document.querySelector(s)!).backgroundImage + getComputedStyle(document.querySelector(s)!).backgroundColor;
      return { sel: bg('.lobby .tile.sel'), start: bg('.lobby .start') };
    });
    if (fill.sel === fill.start) throw new Error(`[${tag}] 选中的档位卡和主按钮填充一样：${fill.sel}`);
    // 选项不折叠：实盘选桌上人数、带多少、止盈、匹配真人、锦标赛都直接看得见，不点任何东西
    for (const sel of ['.lobby .sizes .size', '.lobby .slider', '.lobby .tp-pick-btn', '.lobby .plays .pill.match', '.lobby .tour-btn']) {
      if (!(await page.locator(sel).first().isVisible())) throw new Error(`[${tag}] 实盘选桌上 ${sel} 应直接可见`);
    }
    if ((await page.locator('.lobby .more-btn').count()) !== 0) throw new Error(`[${tag}] 不该再有"更多玩法"折叠按钮`);
    if ((await page.locator('.lobby .start:visible, .lobby .pill.go:visible').count()) !== 1) throw new Error(`[${tag}] 主按钮应只有 1 个`);
    const checks: Array<[string, string]> = [];
    const measure = async (what: string): Promise<void> => {
      await roomOpen(page);
      const m = await fit(page);
      const [lh, lc] = m.lobby.split('/').map(Number);
      const [sh, sc] = m.side.split('/').map(Number);
      const [ph, pc] = m.page.split('/').map(Number);
      log(`noscroll ${tag} ${what}: 页 ${m.page} .lobby ${m.lobby} 右栏 ${m.side} 最小按钮 ${m.minBtn} 最小字 ${m.minFont}`, m.slim);
      checks.push([what, m.slim]);
      // 分两栏（电脑、手机横屏）时左右两栏等高
      const cols = await page.evaluate(() => ({ tall: !!document.querySelector('.stage.tall'), h: document.querySelector('.lobby .hero')!.getBoundingClientRect().height, s: document.querySelector('.lobby .side')!.getBoundingClientRect().height }));
      if (!cols.tall && Math.abs(cols.h - cols.s) > 2) throw new Error(`[${tag}] ${what} 两栏不等高：左 ${cols.h} 右 ${cols.s}`);
      await shot(page, `lobbyui-${tag}-${{ 实盘选桌: 'real', 娱乐选桌: 'fun', 好友房选桌: 'room', 标题主页: 'home' }[what]}`);
      if (ph! > pc! + 1 || lh! > lc! + 1 || sh! > sc! + 1) {
        const geo = await page.evaluate(() => ['.hero', '.side', '.side > .panel:not(.hidden), .side > .front:not(.hidden)'].map((q) => { const r = document.querySelector(q)!.getBoundingClientRect(); return `${q.slice(0, 8)} y${Math.round(r.y)} h${Math.round(r.height)}`; }).join(' '));
        log(`geo ${geo} 缩放 ${await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui'))}`);
        const rows = await page.evaluate(() => [...document.querySelectorAll('.lobby .side > :not(.hidden):not(.banner) > *:not(.hidden)')].map((e) => `${e.className.toString().split(' ')[0]}:${Math.round(e.getBoundingClientRect().top)}-${Math.round(e.getBoundingClientRect().bottom)}`).join(' '));
        throw new Error(`[${tag}] ${what} 要滚动：页 ${m.page} .lobby ${m.lobby} 右栏 ${m.side}；行高 ${rows}`);
      }
      if (m.minFont < 12) throw new Error(`[${tag}] ${what} 有小于 12 的字：${m.slim}`);
      if (m.minBtn < 32) throw new Error(`[${tag}] ${what} 有矮于 32 的按钮：${m.slim}`);
    };
    await measure('实盘选桌');
    await enter(page, '娱乐', touch);
    for (const name of ['匹配真人', '锦标赛', '全下局', '今日全下', '今日锦标赛']) {
      if (!(await page.locator('.lobby .plays .pill', { hasText: name }).first().isVisible())) throw new Error(`[${tag}] 娱乐选桌上 ${name} 应直接可见`);
    }
    await measure('娱乐选桌');
    await enter(page, '好友房', touch);
    await measure('好友房选桌');
    await page.locator('.lobby .p-back').click();
    await measure('标题主页');
    await enter(page, '实盘', touch);
    if (touch) {
      await ctx.close();
      continue;
    }
    // 键盘：不碰鼠标。先回到实盘首档，→ 走一档，← 回来，回车开打
    const sel = async (): Promise<string> => ((await page.locator('.lobby .tile.sel b').first().textContent()) ?? '').replace(/[✓\s]/g, '');
    await page.mouse.move(0, 0);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const first = await sel();
    await page.keyboard.press('ArrowRight');
    const second = await sel();
    if (second === first) throw new Error(`→ 没换档位：${first}`);
    await page.keyboard.press('ArrowLeft');
    if ((await sel()) !== first) throw new Error('← 没换回来');
    // 输入框里不拦：进好友房，在房间码框里按 ←、回车，档位不动、不开局
    await page.locator('.lobby .mode', { hasText: '好友房' }).click();
    await page.locator('.lobby .code-in').first().click();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    if (await page.locator('.stage.at-table').count()) throw new Error('房间码框里按回车不该开局');
    await page.locator('.lobby .mode', { hasText: '实盘' }).click();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    // 弹窗开着不处理：点止盈弹出选择框，按 → 档位不动
    await openMore(page);
    await page.locator('.lobby .tp-pick-btn').click();
    await page.locator('.dialog').waitFor();
    const before = await sel();
    await page.keyboard.press('ArrowRight');
    if ((await sel()) !== before) throw new Error('弹窗开着，→ 不该换档位');
    await page.keyboard.press('Escape');
    await page.locator('.dialog').waitFor({ state: 'detached' }).catch(async () => {
      await page.locator('.dialog .d-btn').first().click();
    });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Enter');
    await page.locator('.stage.at-table').waitFor({ timeout: 20_000 });
    log('lobbyui: 键盘 → ← 回车开了一局');
    await shot(page, 'lobbyui-keyboard-table');
    await ctx.close();
  }
}

/**
 * 成就（--only ach）：标题页"成就"打开成就墙（30 个格子、没拿到的灰着）；娱乐桌一直跟注到第一次赢，
 * 右上角冒出"成就解锁"小提示，不压操作按钮，texas.ach 里存上了；手机竖屏再看一次成就墙（格子不出屏）
 */
export async function achFlow(browser: Browser, base: string): Promise<void> {
  const ctx = await newContext(browser, base, 'smoke-ach');
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('texas.settings')) localStorage.setItem('texas.settings', JSON.stringify({ fast: true }));
  });
  const page = await ctx.newPage();
  watch(page, 'ach');
  await page.goto(`${base}/games/texas/`);
  await page.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
  await page.locator('.ach-open').click();
  await page.locator('.ach-panel').waitFor();
  if ((await page.locator('.ach-cell').count()) !== 30) throw new Error('achievement wall should list 30');
  if ((await page.locator('.ach-cell.got').count()) !== 0) throw new Error('new player should have none');
  await shot(page, 'ach-panel-desktop');
  await page.locator('.d-btn.primary').click();
  await enter(page, '娱乐');
  await page.locator('.lobby .start').click();
  await page.locator('.stage.at-table').waitFor();
  const deadline = Date.now() + 240_000;
  while (!(await page.locator('.ach-item').count())) {
    if (Date.now() > deadline) throw new Error('no achievement toast within 240 s');
    if (await page.locator('.next-hand').isVisible()) await page.locator('.next-hand').click().catch(() => {});
    else if (await page.locator('.actions.on').isVisible()) await page.locator('.act.call').click({ timeout: 2_000 }).catch(() => {});
    await page.waitForTimeout(150);
  }
  await shot(page, 'ach-toast-desktop');
  const t = await page.locator('.ach-item').first().boundingBox();
  const acts = await page.locator('.actions').boundingBox();
  if (!t) throw new Error('toast has no box');
  if (acts && t.y < acts.y + acts.height && t.y + t.height > acts.y && t.x < acts.x + acts.width && t.x + t.width > acts.x) throw new Error(`toast covers the action bar ${JSON.stringify({ t, acts })}`);
  if (t.x + t.width > DESK_W || t.y < 0) throw new Error(`toast off screen ${JSON.stringify(t)}`);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('texas.ach') ?? 'null') as { got?: string[] } | null);
  if (!saved?.got?.includes('first_win')) throw new Error(`texas.ach not saved: ${JSON.stringify(saved)}`);
  await ctx.close();

  // 手机竖屏：成就墙（带着刚存的一个成就进来更像真的：预置 texas.ach）
  const pctx = await newContext(browser, base, 'smoke-ach-phone', tallDevice(390, 844));
  await pctx.addInitScript(() => localStorage.setItem('texas.ach', JSON.stringify({ v: 1, got: ['first_win', 'cat_flush', 'beat_1', 'streak_3'], hands: 37, streak: 1, bluffs: 3, beat: [1, 4] })));
  const pp = await pctx.newPage();
  watch(pp, 'ach-phone');
  await pp.goto(`${base}/games/texas/`);
  await pp.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
  await pp.locator('.ach-open').tap();
  await pp.locator('.ach-panel').waitFor();
  if ((await pp.locator('.ach-cell.got').count()) !== 4) throw new Error('phone wall should show 4 unlocked');
  const box = await pp.locator('.dialog').boundingBox();
  if (!box || box.x < 0 || box.x + box.width > 390 || box.y < 0 || box.y + box.height > 844) throw new Error(`wall off screen ${JSON.stringify(box)}`);
  await shot(pp, 'ach-panel-phone');
  await pctx.close();
}

/**
 * 今日谜题（--only puzzle，docs/features.md 13.11）：每天 5 道题，答完把总分交每日榜。
 * 电脑 1280×800：标题页入口写"未开始" → 点开连着答，键盘 1/2 和点击都用上，每道揭晓有本题得分 → 答完第 3 道刷新，入口写"第 4 道"、
 * 点开接着答第 4 道（前三道的答案还在存档里）→ 第 5 道答完假平台只收到一次 POST（榜名 daily-北京日期-puzzle、整数总分和存档一致）→ 总结卡 →
 * 晒一下出预览层 → Esc 关，入口写总分 → 刷新再点开直接是总结卡、不再交榜。
 * 手机竖屏 390×844：5 道每一道和总结卡都在屏内不滚动，按钮不小于 44 px；答完只交一次。
 */
export async function puzzleFlow(browser: Browser, base: string): Promise<void> {
  const today = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
  const inView = async (page: Page, sel: string, w: number, h: number, what: string): Promise<void> => {
    const box = await page.locator(sel).boundingBox();
    if (!box || box.x < -0.5 || box.y < -0.5 || box.x + box.width > w + 0.5 || box.y + box.height > h + 0.5) throw new Error(`${what} off screen ${JSON.stringify({ box, w, h })}`);
  };
  const notScrolling = async (page: Page, what: string): Promise<void> => {
    const [sh, ch] = await page.locator('.pz').evaluate((e) => [e.scrollHeight, e.clientHeight] as const);
    if (sh > ch + 1) throw new Error(`${what} scrolls: ${sh} > ${ch}`);
  };
  type Saved = { days: Record<string, { picks: string[]; scores: number[]; sent: boolean | null }>; done: number } | null;
  const saved = (page: Page): Promise<Saved> => page.evaluate(() => JSON.parse(localStorage.getItem('texas.puzzle') ?? 'null') as Saved);
  const bigButtons = async (page: Page, sel: string, what: string): Promise<void> => {
    for (const b of await page.locator(sel).all()) {
      const box = await b.boundingBox();
      if (!box || box.height < 44) throw new Error(`${what} under 44 px: ${JSON.stringify(box)}`);
    }
  };
  /** 答第 n 道（1 起）：how 是键盘还是点；揭晓出来后返回本题得分 */
  const answer = async (page: Page, n: number, how: 'key' | 'click' | 'tap', index: number): Promise<number> => {
    await page.locator('.pz-name b').filter({ hasText: `第 ${n} / 5 题` }).waitFor();
    await page.locator('.pz .card.up').first().waitFor();
    if (how === 'key') await page.keyboard.press(String(index + 1));
    else if (how === 'click') await page.locator('.pz-ch').nth(index).click();
    else await page.locator('.pz-ch').nth(index).tap();
    await page.locator('.pz-verdict').waitFor();
    const txt = (await page.locator('.pz-score').textContent()) ?? '';
    const m = /本题 (\d+) 分/.exec(txt);
    if (!m) throw new Error(`no score on reveal: ${txt}`);
    if ((await page.locator('.pz-ch:not([disabled])').count()) !== 0) throw new Error('choices should be disabled after answering');
    return Number(m[1]);
  };

  // ---- 电脑 ----
  const scores: Array<{ gameId?: string; boardId?: string; score?: unknown }> = [];
  const ctx = await newContext(browser, base, 'smoke-puzzle', { viewport: { width: 1280, height: 800 } }, false, scores);
  const page = await ctx.newPage();
  watch(page, 'puzzle');
  await page.goto(`${base}/games/texas/`);
  await page.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
  const entry = page.locator('.pz-open');
  if (!(await entry.textContent())?.includes('未开始')) throw new Error(`entry should say 未开始: ${await entry.textContent()}`);
  await shot(page, 'puzzle-title-desktop');
  await entry.click();
  await page.locator('.pz').waitFor();
  await inView(page, '.pz', 1280, 800, 'puzzle');
  await notScrolling(page, 'puzzle (desktop, before answer)');
  await shot(page, 'puzzle-ask-desktop');
  const got: number[] = [];
  got.push(await answer(page, 1, 'key', 0));
  await page.waitForTimeout(1_800);
  // 抽一次看看把公共牌补满五张（翻牌前五张全是补的）
  if ((await page.locator('.pz-slot .card.up').count()) !== 5) throw new Error('board should be complete after the run-out');
  await inView(page, '.pz', 1280, 800, 'puzzle reveal');
  await notScrolling(page, 'puzzle (desktop, revealed)');
  await shot(page, 'puzzle-reveal-desktop');
  // 揭晓以后按 1/2/3 不能改答案
  await page.keyboard.press('1');
  await page.keyboard.press('2');
  let s = await saved(page);
  if (s?.days[today]?.picks.length !== 1) throw new Error(`a second key press was counted: ${JSON.stringify(s)}`);
  await page.locator('.pz-next').click();
  got.push(await answer(page, 2, 'key', 1));
  await page.locator('.pz-next').click();
  got.push(await answer(page, 3, 'click', 0));
  // 答到一半刷新：入口写第 4 道，点开接着答
  await page.reload();
  await page.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
  if (!(await page.locator('.pz-open').textContent())?.includes('第 4 道')) throw new Error(`entry after refresh should say 第 4 道: ${await page.locator('.pz-open').textContent()}`);
  await page.locator('.pz-open').click();
  await page.locator('.pz').waitFor();
  s = await saved(page);
  if (JSON.stringify(s?.days[today]?.scores) !== JSON.stringify(got)) throw new Error(`saved scores ${JSON.stringify(s?.days[today]?.scores)} != ${JSON.stringify(got)}`);
  got.push(await answer(page, 4, 'click', 0));
  await page.locator('.pz-next').click();
  if (scores.length > 0) throw new Error('score was submitted before the 5th question');
  got.push(await answer(page, 5, 'key', 0));
  const total = got.reduce((a, b) => a + b, 0);
  // 第 5 道答完就交榜：只收到一次，榜名带北京日期，分数是整数、和每道得分之和一样
  for (let i = 0; i < 40 && !scores.length; i++) await page.waitForTimeout(100);
  if (scores.length !== 1 || scores[0]!.gameId !== 'texas' || scores[0]!.boardId !== `daily-${today}-puzzle` || scores[0]!.score !== total || !Number.isInteger(total) || total < 0 || total > 500)
    throw new Error(`score post: ${JSON.stringify(scores)} expected ${total}`);
  if ((await page.locator('.pz-next').textContent()) !== '看总结') throw new Error('last question should say 看总结');
  await page.locator('.pz-next').click();
  await page.locator('.pz-sum').waitFor();
  if ((await page.locator('.pz-total b').textContent()) !== String(total)) throw new Error(`summary total ${await page.locator('.pz-total b').textContent()} != ${total}`);
  if ((await page.locator('.pz-res > div').count()) !== 5) throw new Error('summary should list 5 questions');
  await page.locator('.pz-board-note').filter({ hasText: '已上今日榜' }).waitFor();
  await inView(page, '.pz', 1280, 800, 'summary');
  await notScrolling(page, 'summary (desktop)');
  await shot(page, 'puzzle-summary-desktop');
  s = await saved(page);
  if (s?.done !== 1 || s.days[today]?.sent !== true) throw new Error(`summary save: ${JSON.stringify(s)}`);
  // 晒一下：无头浏览器出预览层
  await page.locator('.pz-share').click();
  await page.locator('[data-key="share:close"]').waitFor({ timeout: 10_000 });
  await shot(page, 'puzzle-share-desktop');
  await page.locator('[data-key="share:close"]').click();
  await page.keyboard.press('Escape');
  await page.locator('.pz').waitFor({ state: 'detached' });
  if (!(await entry.textContent())?.includes(`${total} 分`)) throw new Error(`entry should show the total: ${await entry.textContent()}`);
  // 刷新：直接是总结卡，不再交榜
  await page.reload();
  await page.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
  await page.locator('.pz-open').click();
  await page.locator('.pz-sum').waitFor();
  if ((await page.locator('.pz-ch').count()) !== 0) throw new Error('answered day should open on the summary');
  if ((await page.locator('.pz-total b').textContent()) !== String(total)) throw new Error('reload: summary total changed');
  await page.waitForTimeout(500);
  if (scores.length !== 1) throw new Error(`score posted again: ${scores.length}`);
  await page.locator('.pz-x').click();
  await page.locator('.pz').waitFor({ state: 'detached' });
  await ctx.close();

  // ---- 手机竖屏 ----
  const pscores: unknown[] = [];
  const pctx = await newContext(browser, base, 'smoke-puzzle-phone', tallDevice(390, 844), false, pscores);
  const pp = await pctx.newPage();
  watch(pp, 'puzzle-phone');
  await pp.goto(`${base}/games/texas/`);
  await pp.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
  await inView(pp, '.pz-open', 390, 844, 'puzzle entry');
  const eb = await pp.locator('.pz-open').boundingBox();
  if (!eb || eb.height < 44) throw new Error(`entry too small: ${JSON.stringify(eb)}`);
  await shot(pp, 'puzzle-title-phone');
  await pp.locator('.pz-open').tap();
  await pp.locator('.pz').waitFor();
  const xb = await pp.locator('.pz-x').boundingBox();
  if (!xb || xb.width < 44 || xb.height < 44) throw new Error(`close button under 44 px: ${JSON.stringify(xb)}`);
  for (let n = 1; n <= 5; n++) {
    await pp.locator('.pz .card.up').first().waitFor();
    await inView(pp, '.pz', 390, 844, `question ${n} (phone)`);
    await notScrolling(pp, `question ${n} (phone, before answer)`);
    await bigButtons(pp, '.pz-ch', `question ${n} choice`);
    if (n === 1) await shot(pp, 'puzzle-ask-phone');
    await answer(pp, n, 'tap', 0);
    await pp.waitForTimeout(1_500);
    await inView(pp, '.pz', 390, 844, `question ${n} reveal (phone)`);
    await notScrolling(pp, `question ${n} (phone, revealed)`);
    await bigButtons(pp, '.pz-actions button', `question ${n} reveal button`);
    await bigButtons(pp, '.pz-ch', `question ${n} revealed choice`);
    if (n === 1 || n === 5) await shot(pp, `puzzle-reveal${n}-phone`);
    await pp.locator('.pz-next').tap();
  }
  await pp.locator('.pz-sum').waitFor();
  await inView(pp, '.pz', 390, 844, 'summary (phone)');
  await notScrolling(pp, 'summary (phone)');
  await bigButtons(pp, '.pz-actions button', 'summary button');
  await shot(pp, 'puzzle-summary-phone');
  if (pscores.length !== 1) throw new Error(`phone: expected one score post, got ${pscores.length}`);
  await pp.locator('.pz-close').tap();
  await pp.locator('.pz').waitFor({ state: 'detached' });
  await pctx.close();
}

/**
 * 顶栏和设置面板（--only settings）：电脑 1280×720、手机竖屏 390×844、手机横屏 844×390 各进一桌单机。
 * 顶栏同屏可点的 ≤5 个、没有单字按钮、触屏上每个可点范围按舞台缩放后 ≥44×44 且相邻 ≥8（用 elementFromPoint 在范围四边中点取点核对）；
 * 齿轮打开设置面板：音效 / 音量 / 动画 / 互动 / 止盈 / 恢复默认，改了刷新后还在，Esc 关
 */
export async function settingsFlow(browser: Browser, base: string): Promise<void> {
  const SIZES: [string, number, number, boolean][] = [
    ['desk', 1280, 720, false],
    ['phone', 390, 844, true],
    ['land', 844, 390, true],
  ];
  for (const [tag, width, height, touch] of SIZES) {
    const ctx = await newContext(browser, base, `smoke-settings-${tag}`, touch ? { viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPHONE } : { viewport: { width, height } });
    const page = await ctx.newPage();
    watch(page, `settings-${tag}`);
    const click = async (sel: string): Promise<void> => void (await (touch ? page.locator(sel).tap() : page.locator(sel).click()));
    await page.goto(`${base}/games/texas/`);
    await page.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
    await enter(page, '娱乐', touch);
    await click('.lobby .start');
    await page.locator('.stage.at-table').waitFor();
    await page.locator('.topbar .where:not(:empty)').waitFor({ state: 'attached' });

    // 顶栏：可见的可点元素
    const bar = await page.evaluate(() => {
      const scale = (() => {
        const st = document.querySelector('.stage') as HTMLElement;
        return st.getBoundingClientRect().width / st.offsetWidth;
      })();
      const coarse = matchMedia('(pointer: coarse), (max-width: 959px)').matches;
      const items = [...document.querySelectorAll<HTMLElement>('.topbar > button, .topbar > a')].filter((e) => e.getClientRects().length > 0);
      return {
        scale,
        coarse,
        items: items.map((e) => {
          const r = e.getBoundingClientRect();
          // 可点范围：触屏上撑到 44×44（button::before / .home::before），其余就是看得见的框
          const w = coarse ? Math.max(r.width, 44) : r.width;
          const h = coarse ? Math.max(r.height, 44) : r.height;
          const cx = r.x + r.width / 2;
          const cy = r.y + r.height / 2;
          const pts = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dx, dy]) => {
            // 点落在屏幕外（顶栏贴着屏幕上沿）的不用查，点不到的地方本来就不在屏上
            const px = cx + dx! * (w / 2 - 1);
            const py = cy + dy! * (h / 2 - 1);
            if (px < 0 || py < 0 || px > innerWidth || py > innerHeight) return 'ok';
            const t = document.elementFromPoint(cx + dx! * (w / 2 - 1), cy + dy! * (h / 2 - 1));
            return t && (t === e || e.contains(t)) ? 'ok' : `${t?.tagName}.${t?.className}@${Math.round(cx + dx! * (w / 2 - 1))},${Math.round(cy + dy! * (h / 2 - 1))}`;
          });
          return { cls: e.className, text: (e.textContent ?? '').trim(), vw: r.width, vh: r.height, left: cx - w / 2, right: cx + w / 2, hitOk: pts.every((p) => p === 'ok'), pts: pts.join(' | ') };
        }),
      };
    });
    const min = touch ? 44 : 32;
    if (bar.items.length > 5) throw new Error(`[${tag}] topbar has ${bar.items.length} clickable items: ${bar.items.map((i) => i.cls).join(', ')}`);
    for (const [i, it] of bar.items.entries()) {
      if (it.text.length === 1) throw new Error(`[${tag}] single-char topbar button: ${it.cls}`);
      if (it.vw < 32 - 0.6 || it.vh < 32 - 0.6) throw new Error(`[${tag}] visible part under 32: ${it.cls} ${it.vw.toFixed(1)}x${it.vh.toFixed(1)}`);
      if (!it.hitOk) throw new Error(`[${tag}] hit area of ${it.cls} not ≥${min} (edge points are covered by: ${it.pts})`);
      const next = bar.items[i + 1];
      if (touch && next && next.left - it.right < 8 - 0.6) throw new Error(`[${tag}] gap between ${it.cls} and ${next.cls} is ${(next.left - it.right).toFixed(1)} < 8`);
    }
    log(`settings ${tag}: topbar ${bar.items.map((i) => `${i.cls.split(' ')[1] ?? i.cls}${Math.round(i.vw)}x${Math.round(i.vh)}`).join(' ')} scale ${bar.scale.toFixed(2)}`);
    if (await page.locator('.topbar .wallet-chip').count()) throw new Error(`[${tag}] wallet chip should not be in the topbar`);
    await shot(page, `settings-${tag}-topbar`);

    // 设置面板
    await click('.topbar .gear');
    const panel = page.locator('.settings .st-box');
    await panel.waitFor();
    const need = ['音效', '音量', '动画', '互动', '聊天', '止盈', '战绩', '钱包', '恢复默认'];
    const text = (await panel.textContent()) ?? '';
    for (const w of need) if (!text.includes(w)) throw new Error(`[${tag}] settings panel missing ${w}`);
    const box = await panel.boundingBox();
    if (!box || box.x < -0.5 || box.y < -0.5 || box.x + box.width > width + 0.5 || box.y + box.height > height + 0.5) throw new Error(`[${tag}] settings panel off screen ${JSON.stringify(box)}`);
    await shot(page, `settings-${tag}-panel`);
    // 音效关、动画快速：存进 texas.settings，刷新后面板里还是这样
    await click('.settings [data-key="sfx-off"]');
    await click('.settings [data-key="speed-fast"]');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('texas.settings') ?? '{}') as { sound?: boolean; fast?: boolean });
    if (saved.sound !== false || saved.fast !== true) throw new Error(`[${tag}] settings not saved: ${JSON.stringify(saved)}`);
    if (!(await page.locator('.settings .st-vol').isDisabled())) throw new Error(`[${tag}] volume should be disabled while 音效 is off`);
    await page.keyboard.press('Escape');
    await page.locator('.settings').waitFor({ state: 'detached' });
    await page.reload();
    await page.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('texas.settings') ?? '{}') as { sound?: boolean; fast?: boolean });
    if (after.sound !== false || after.fast !== true) throw new Error(`[${tag}] settings lost after reload: ${JSON.stringify(after)}`);
    // 大厅里齿轮也在；恢复默认
    await click('.topbar .gear');
    await page.locator('.settings .st-box').waitFor();
    if ((await page.locator('.settings [data-key="speed-fast"]').getAttribute('aria-pressed')) !== 'true') throw new Error(`[${tag}] panel should show 快速 after reload`);
    await click('.settings [data-key="reset"]');
    const reset = await page.evaluate(() => JSON.parse(localStorage.getItem('texas.settings') ?? '{}') as { sound?: boolean; fast?: boolean; volume?: number });
    if (reset.sound !== true || reset.fast !== false || reset.volume !== 0.8) throw new Error(`[${tag}] reset did not restore defaults: ${JSON.stringify(reset)}`);
    await click('.settings .st-x');
    await page.locator('.settings').waitFor({ state: 'detached' });
    await ctx.close();
  }
}
