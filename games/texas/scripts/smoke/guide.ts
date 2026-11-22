/** 新手指引（--only guide）和止盈（--only tp）。 */
import type { Browser, Page } from 'playwright-core';
import { opt } from '../args.ts';
import { log, newContext, watch, shot, balance, handText, enter, openMore, settled, DESK_H, linkSit } from './harness.ts';
import { summary, IPHONE, tallDevice } from './solo.ts';

export async function takeProfitFlow(browser: Browser, base: string): Promise<void> {
  const ctx = await newContext(browser, base, 'smoke-tp');
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('texas.settings')) localStorage.setItem('texas.settings', JSON.stringify({ fast: true, takeProfit: { kind: 'amount', amount: 1 } }));
  });
  const page = await ctx.newPage();
  watch(page, 'tp');
  const toasts: string[] = [];
  await page.goto(`${base}/games/texas/`);
  await page.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
  const before = await balance(page);
  await enter(page, '实盘');
  await openMore(page);
  const row = ((await page.locator('.lobby .tp-pick-btn').textContent()) ?? '').replace(/\s/g, '');
  if (!row.includes('赢1')) throw new Error(`lobby take-profit button: ${row}`);
  // 选桌多了止盈按钮也要整个放得下（1280×720 的"坐下开打"不出屏）
  const go = await page.locator('.lobby .start').boundingBox();
  if (!go || go.y + go.height > DESK_H) throw new Error(`lobby: 坐下开打 off screen ${JSON.stringify(go)}`);
  await shot(page, 'tp-lobby');
  await page.locator('.lobby .start').click();
  const deadline = Date.now() + 420_000;
  while (!(await page.locator('.summary').isVisible())) {
    if (Date.now() > deadline) {
      await shot(page, 'debug-tp');
      throw new Error('take profit never fired');
    }
    // 止盈自动走不问"离桌吗"；别的框（补码、输光了）点主按钮接着打
    if (await page.locator('.d-title', { hasText: '离桌' }).isVisible()) throw new Error('take profit should not ask before leaving');
    if (await page.locator('.dialog').isVisible()) {
      await page.locator('.d-btn.primary').click().catch(() => {});
      continue;
    }
    if (await page.locator('.actions.on').isVisible()) await page.locator('.act.call').click().catch(() => {});
    // 一手打完停在"下一手"（自动下一手没开就不发）：点了才接着打，不然永远等不到止盈
    if (await page.locator('.next-hand').isVisible()) await page.locator('.next-hand').click().catch(() => {});
    // 顶上那条提示是同一个元素换字，边打边记
    const t = (await page.locator('.toast').first().textContent()) ?? '';
    if (t.includes('止盈了')) toasts.push(t);
    await page.waitForTimeout(150);
  }
  await shot(page, 'tp-summary');
  // 提示是同一个元素，淡出后字还在
  toasts.push((await page.locator('.toast').first().textContent()) ?? '');
  if (!toasts.some((t) => t.includes('止盈了 +'))) throw new Error(`take profit toast missing: ${toasts.join(' | ')}`);
  await page.locator('.d-btn.primary').click();
  await page.locator('.lobby').waitFor();
  const after = await settled(page, 'tp');
  if (after <= before) throw new Error(`take profit: wallet should grow, ${before} -> ${after}`);
  log('take profit', before, '->', after, toasts[0]);
  await ctx.close();
}

/**
 * 新手指引（--only guide，--rigs phone,desk,land,land2,fhd 选尺寸）：全新的账号第一次轮到我出手时盖出说明框，一步一步指着桌上真的东西。
 * 每一步查：说明框整个在屏幕里、不压高亮圈、圈住了它讲的那块（底牌、按钮）、讲按钮时桌上的按钮被层挡住点不到；
 * 讲到一半转屏（手机）/改窗口（电脑）后依然在屏里、不压。走完记下 texas.guide；
 * 手机和电脑再接着打：第一次点加注出滑杆提示、第一手打完出结果提示（摊牌的出"为什么赢"）、各只一次；牌桌上的"?"再来一遍；
 * 电脑再离桌，点大厅的"怎么玩"重置并重新出；land2 跳过后刷新接着打不再出。
 */
const GUIDE_RIGS: Record<string, Parameters<Browser['newContext']>[0]> = {
  phone: tallDevice(390, 844),
  desk: { viewport: { width: 1280, height: 720 } },
  land: { viewport: { width: 667, height: 375 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IPHONE },
  land2: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IPHONE },
  fhd: { viewport: { width: 1920, height: 1080 } },
};

interface CoachGeom {
  box: { l: number; t: number; r: number; b: number };
  ring: { l: number; t: number; r: number; b: number } | null;
  W: number;
  H: number;
  title: string;
  text: string;
}

const coachGeom = (page: Page): Promise<CoachGeom> =>
  page.evaluate(() => {
    const q = (r: DOMRect) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });
    const b = document.querySelector('.coach-box');
    if (!b) throw new Error('no .coach-box');
    const ring = document.querySelector('.coach-ring:not(.hidden)');
    return { box: q(b.getBoundingClientRect()), ring: ring ? q(ring.getBoundingClientRect()) : null, W: innerWidth, H: innerHeight, title: b.querySelector('.c-title')?.textContent ?? '', text: b.textContent ?? '' };
  });

/** 说明框在屏幕里、不压高亮圈 */
async function assertCoach(page: Page, tag: string, what: string, wantRing: boolean | null): Promise<CoachGeom> {
  const g = await coachGeom(page);
  const { box, ring, W, H } = g;
  const at = `[guide ${tag}] ${what} box ${[box.l, box.t, box.r, box.b].map(Math.round)} in ${W}x${H}`;
  if (box.l < -0.5 || box.t < -0.5 || box.r > W + 0.5 || box.b > H + 0.5) throw new Error(`${at}: box out of the screen`);
  if (wantRing === true && !ring) throw new Error(`${at}: expected a highlight ring`);
  if (wantRing === false && ring) throw new Error(`${at}: expected no ring`);
  if (ring && box.l < ring.r && ring.l < box.r && box.t < ring.b && ring.t < box.b) throw new Error(`${at}: box covers the ring ${[ring.l, ring.t, ring.r, ring.b].map(Math.round)}`);
  return g;
}

/** 高亮圈把某个元素整个圈在里面（留 8 像素容差） */
async function assertRingHolds(page: Page, tag: string, what: string, sel: string, lenient = false): Promise<void> {
  const ok = await page.evaluate(([sel, lenient]) => {
    const rs = [...document.querySelectorAll(sel!)].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
    const ring = document.querySelector('.coach-ring:not(.hidden)')?.getBoundingClientRect();
    if (!ring) return 'missing';
    if (!rs.length) return lenient ? 'ok' : 'missing';
    const l = Math.min(...rs.map((r) => r.left));
    const t = Math.min(...rs.map((r) => r.top));
    const r = Math.max(...rs.map((r) => r.right));
    const b = Math.max(...rs.map((r) => r.bottom));
    return l >= ring.left - 8 && t >= ring.top - 8 && r <= ring.right + 8 && b <= ring.bottom + 8 ? 'ok' : `ring ${[ring.left, ring.top, ring.right, ring.bottom].map(Math.round)} vs ${[l, t, r, b].map(Math.round)}`;
  }, [sel, lenient] as const);
  if (ok !== 'ok') throw new Error(`[guide ${tag}] ${what}: ring does not hold ${sel}: ${ok}`);
}

async function guideStored(page: Page): Promise<{ v: number; done: boolean; seen: string[] } | null> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('texas.guide') ?? 'null'));
}

/** 走一遍：每一步查摆位，返回 */
/** 说明框不盖亮着的操作区、我的底牌和头像 */
async function assertCoachClear(page: Page, tag: string, what: string): Promise<void> {
  const bad = await page.evaluate(() => {
    const box = document.querySelector('.coach-box')?.getBoundingClientRect();
    if (!box) return 'no box';
    for (const sel of ['.actions.on', '.seat.me .card.up', '.seat.me .avatar']) {
      for (const e of document.querySelectorAll(sel)) {
        const r = e.getBoundingClientRect();
        if (r.width > 0 && box.left < r.right && r.left < box.right && box.top < r.bottom && r.top < box.bottom) return sel;
      }
    }
    return '';
  });
  if (bad) {
    await shot(page, `debug-guide-${tag}-${what}`);
    throw new Error(`[guide ${tag}] ${what}: coach box covers ${bad}`);
  }
}

async function walkGuide(page: Page, tag: string, touch: boolean, opts: { shots: boolean; resize?: { w: number; h: number; at: string }; stopAfter?: number }): Promise<void> {
  const STEPS = (await import('../../src/guide.ts')).stepsFor(touch, true);
  const view = page.viewportSize()!;
  const press = (loc: ReturnType<Page['locator']>) => (touch ? loc.tap() : loc.click());
  for (const [i, st] of STEPS.entries()) {
    if (opts.stopAfter !== undefined && i >= opts.stopAfter) return;
    await page.waitForTimeout(500);
    const g = await assertCoach(page, tag, st.id, st.target === null ? false : null);
    if (g.title !== st.title) throw new Error(`[guide ${tag}] step ${i + 1} title "${g.title}" != "${st.title}"`);
    if (!g.text.includes(`${i + 1}/${STEPS.length}`)) throw new Error(`[guide ${tag}] step counter: ${g.text}`);
    if (st.id === 'cards') await assertRingHolds(page, tag, st.id, '.seat.me .card.up');
    // 手机上开局指引 4 步以内；说明框不盖操作区和我的底牌、头像（buttons 那步圈的就是操作区，本来就不压）
    if (touch && STEPS.length > 4) throw new Error(`[guide ${tag}] touch guide has ${STEPS.length} steps`);
    await assertCoachClear(page, tag, st.id);
    if (st.id === 'buttons') {
      await assertRingHolds(page, tag, st.id, '.actions.on .act');
      // 层挡着桌上的按钮：点"跟注"的位置落在指引层上
      const hit = await page.evaluate(() => {
        const b = document.querySelector('.actions.on .act.call')?.getBoundingClientRect();
        if (!b) return 'no button';
        const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return e?.closest('.coach-layer') ? 'blocked' : `reaches ${e?.className}`;
      });
      if (hit !== 'blocked') throw new Error(`[guide ${tag}] buttons step: table button not blocked (${hit})`);
    }
    if (opts.shots) await shot(page, `guide-${tag}-${i + 1}-${st.id}`);
    // 讲到一半转屏 / 改窗口：框跟着重摆
    if (opts.resize && opts.resize.at === st.id) {
      await page.setViewportSize({ width: opts.resize.w, height: opts.resize.h });
      await page.waitForTimeout(900);
      await assertCoach(page, tag, `${st.id} after resize ${opts.resize.w}x${opts.resize.h}`, st.target === null ? false : null);
      if (opts.shots) await shot(page, `guide-${tag}-${i + 1}-${st.id}-resized`);
      await page.setViewportSize(view);
      await page.waitForTimeout(900);
      await assertCoach(page, tag, `${st.id} after resize back`, st.target === null ? false : null);
    }
    await press(page.locator('.coach-box .c-btn.primary'));
  }
  await page.waitForTimeout(300);
  if (await page.locator('.coach-layer').count()) throw new Error(`[guide ${tag}] coach still open after the last step`);
}

export async function guideFlow(browser: Browser, base: string): Promise<void> {
  const { stepsFor } = await import('../../src/guide.ts');
  const rigs = opt('rigs', 'phone,desk,land,land2,fhd,room').split(',');
  for (const tag of rigs) {
    if (tag === 'room') {
      await guideRoom(browser, base);
      continue;
    }
    const device = GUIDE_RIGS[tag];
    if (!device) throw new Error(`unknown rig ${tag}`);
    const touch = !!(device as { hasTouch?: boolean }).hasTouch;
    const press = (page: Page, sel: string) => (touch ? page.locator(sel).tap() : page.locator(sel).click());
    const ctx = await newContext(browser, base, `smoke-guide-${tag}`, device, true);
    await ctx.addInitScript(() => localStorage.setItem('texas.settings', JSON.stringify({ fast: true })));
    const page = await ctx.newPage();
    watch(page, `guide-${tag}`);
    await page.goto(`${base}/games/texas/`);
    await page.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
    // 主页有"怎么玩"
    if (!(await page.locator('.howto').isVisible())) throw new Error(`[guide ${tag}] lobby has no 怎么玩 entry`);
    if (tag === 'phone') await shot(page, 'guide-phone-lobby');
    if ((await guideStored(page)) !== null) throw new Error(`[guide ${tag}] fresh account should have no texas.guide`);
    await press(page, '.qstart');
    // 第一次轮到我才出（开局发牌、电脑先说话时不出）
    await page.locator('.coach-box').waitFor({ timeout: 90_000 });
    if (!(await page.locator('.actions.on').count())) throw new Error(`[guide ${tag}] coach opened while it was not my turn`);
    log(`guide ${tag}: coach opened at hand ${await handText(page)}`);
    const full = tag === 'phone' || tag === 'desk';
    const resize = tag === 'phone' ? { w: 844, h: 390, at: 'cards' } : tag === 'desk' ? { w: 900, h: 600, at: 'buttons' } : undefined;
    if (tag === 'land2') {
      // 跳过：记下、连提示一起关；刷新接着打不再出
      await walkGuide(page, tag, touch, { shots: false, stopAfter: 2 });
      await press(page, '.coach-box .c-btn:not(.primary)');
      await page.waitForTimeout(300);
      const g = await guideStored(page);
      if (!g?.done || g.seen.length !== 4) throw new Error(`[guide ${tag}] skip should store done + all hints seen: ${JSON.stringify(g)}`);
      if (await page.locator('.coach-layer').count()) throw new Error(`[guide ${tag}] coach still open after skip`);
      await page.reload();
      // 刷新后主页的大按钮变成"继续上局"
      await page.locator('.qstart', { hasText: '继续上局' }).waitFor({ timeout: 20_000 });
      await press(page, '.qstart');
      await page.locator('.actions.on').waitFor({ timeout: 90_000 });
      await page.waitForTimeout(1_500);
      if (await page.locator('.coach-layer').count()) throw new Error(`[guide ${tag}] coach came back after skip + reload`);
      log(`guide ${tag}: skip persisted across reload`);
      await ctx.close();
      continue;
    }
    await walkGuide(page, tag, touch, { shots: full, ...(resize ? { resize } : {}) });
    const done = await guideStored(page);
    if (!done?.done) throw new Error(`[guide ${tag}] finishing should store done: ${JSON.stringify(done)}`);
    if (!(await page.locator('.actions.on').isVisible())) throw new Error(`[guide ${tag}] after the last step it should still be my turn`);
    log(`guide ${tag}: ${stepsFor(touch, true).length} steps ok`);
    if (!full) {
      await ctx.close();
      continue;
    }

    // 第一次点加注：滑杆提示
    await page.locator('.act.raise').evaluate((e) => (e as HTMLElement).click());
    await page.locator('.coach-layer:not(.block) .coach-box').waitFor({ timeout: 5_000 });
    let g = await assertCoach(page, tag, 'raise hint', null);
    await assertCoachClear(page, tag, 'raise hint');
    if (!g.text.includes('确认')) throw new Error(`[guide ${tag}] raise hint text: ${g.text}`);
    await shot(page, `guide-${tag}-hint-raise`);
    // 不拦牌桌：层本身点得穿（滑杆还在手下）
    if (!(await page.locator('.raise-panel').isVisible())) throw new Error(`[guide ${tag}] raise panel should stay open under the hint`);
    await page.locator('.coach-box .c-btn').evaluate((e) => (e as HTMLElement).click());
    if (await page.locator('.coach-layer').count()) throw new Error(`[guide ${tag}] hint should close on 知道了`);
    // 确认加注，之后一路跟注到这一手打完
    await page.locator('.act.raise').evaluate((e) => (e as HTMLElement).click());
    for (let k = 0; k < 600 && !(await page.locator('.next-hand').isVisible()); k++) {
      if (await page.locator('.actions.on').isVisible()) await page.locator('.act.call').evaluate((e) => (e as HTMLElement).click()).catch(() => {});
      await page.waitForTimeout(150);
    }
    await page.locator('.coach-layer:not(.block) .coach-box').waitFor({ timeout: 8_000 });
    g = await assertCoach(page, tag, 'end hint', null);
    const showdown = g.text.includes('摊牌');
    if (!showdown && !g.text.includes('这手打完了')) throw new Error(`[guide ${tag}] end hint text: ${g.text}`);
    // 不压"下一手"
    const next = await page.locator('.next-hand').boundingBox();
    if (next && g.box.l < next.x + next.width && next.x < g.box.r && g.box.t < next.y + next.height && next.y < g.box.b) throw new Error(`[guide ${tag}] end hint covers 下一手`);
    await shot(page, `guide-${tag}-hint-end`);
    const seen = (await guideStored(page))?.seen ?? [];
    if (!seen.includes('raise') || !seen.includes('result') || (showdown && !seen.includes('showdown'))) throw new Error(`[guide ${tag}] seen after first hand: ${seen}`);
    log(`guide ${tag}: end hint ok (${showdown ? 'showdown' : 'result'})`);
    // 下一手：提示收起，也不再出第二遍
    await press(page, '.next-hand');
    if (await page.locator('.coach-layer').count()) throw new Error(`[guide ${tag}] hint should close on 下一手`);
    await page.locator('.seat.me .card.up').first().waitFor({ timeout: 30_000 });
    for (let k = 0; k < 600 && !(await page.locator('.next-hand').isVisible()); k++) {
      if (await page.locator('.actions.on').isVisible()) await page.locator('.act.call').evaluate((e) => (e as HTMLElement).click()).catch(() => {});
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(1_200);
    if (!showdown && (await page.locator('.coach-layer').count())) {
      // 第一手没摊牌，第二手摊牌了可以再出一条"为什么赢"（各一次）；只允许这一条
      const t = (await page.locator('.coach-box').textContent()) ?? '';
      if (!t.includes('摊牌')) throw new Error(`[guide ${tag}] unexpected second hint: ${t}`);
      await page.locator('.coach-box .c-btn').evaluate((e) => (e as HTMLElement).click());
    } else if (await page.locator('.coach-layer').count()) throw new Error(`[guide ${tag}] a hint came twice`);

    // 牌桌上的"?"：随时再来一遍
    await press(page, '.topbar .help');
    await page.locator('.coach-box').waitFor({ timeout: 5_000 });
    const again = await assertCoach(page, tag, 'help replay', null);
    if (again.title !== stepsFor(touch)[0]!.title) throw new Error(`[guide ${tag}] help should start from step 1: ${again.title}`);
    await shot(page, `guide-${tag}-help`);
    await press(page, '.coach-box .c-btn:not(.primary)');
    await page.waitForTimeout(300);

    if (tag === 'desk') {
      // 离桌 → 大厅"怎么玩" → 重置并出新的一遍
      await page.locator('.leave').click();
      await page.locator('.dialog').waitFor();
      await page.locator('.d-btn.danger').click();
      await summary(page, 'guide-summary');
      await page.locator('.lobby').waitFor();
      await page.locator('.howto').click();
      const reset = await guideStored(page);
      if (reset?.done || reset?.seen.length) throw new Error(`[guide ${tag}] 怎么玩 should reset: ${JSON.stringify(reset)}`);
      await page.locator('.coach-box').waitFor({ timeout: 90_000 });
      await walkGuide(page, tag, touch, { shots: false });
      log(`guide ${tag}: replay from the lobby ok`);
    }
    await ctx.close();
  }
}

/** 好友房（最窄的 SE 上的房主）：不自动出指引；牌桌上的"?"能点出来，说明框在屏里；顶上那一排没有因为多了"?"换行 */
async function guideRoom(browser: Browser, base: string): Promise<void> {
  const { stepsFor } = await import('../../src/guide.ts');
  const host = await newContext(browser, base, 'smoke-guide-host', tallDevice(375, 667), true);
  const pal = await newContext(browser, base, 'smoke-guide-pal');
  const [hp, pp] = await Promise.all([host.newPage(), pal.newPage()]);
  watch(hp, 'guide-room-host');
  watch(pp, 'guide-room-pal');
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
  await hp.waitForTimeout(2_000);
  if (await hp.locator('.coach-layer').count()) throw new Error('[guide room] friend rooms must not open the guide by themselves');
  const mids = await hp.locator('.hud > :not(.hidden)').evaluateAll((es) => es.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0).map((r) => r.top + r.height / 2));
  if (Math.max(...mids) - Math.min(...mids) > 30) {
    const parts = await hp.locator('.hud > :not(.hidden)').evaluateAll((es) => es.map((e) => { const r = e.getBoundingClientRect(); return `${e.className}:${Math.round(r.left)}-${Math.round(r.right)}x${Math.round(r.top)}`; }));
    throw new Error(`[guide room] the top row wrapped ${mids.map(Math.round).join(',')} ${parts.join(' ')}`);
  }
  await hp.locator('.topbar .help').tap();
  await hp.locator('.coach-box').waitFor({ timeout: 5_000 });
  for (const [i, st] of stepsFor(true).entries()) {
    await hp.waitForTimeout(400);
    await assertCoach(hp, 'room', st.id, st.target === null ? false : null);
    if (i === 0) await shot(hp, 'guide-room-1');
    await hp.locator('.coach-box .c-btn.primary').tap();
  }
  if (await hp.locator('.coach-layer').count()) throw new Error('[guide room] coach still open after the last step');
  log('guide room: manual entry ok, top row not wrapped');
  await Promise.all([host.close(), pal.close()]);
}
