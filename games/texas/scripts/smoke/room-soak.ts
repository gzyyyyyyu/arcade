/** 好友房长跑（--only roomsoak）和后台切回、弱网（--only roomweak）：不在默认冒烟里。 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { opt } from '../args.ts';
import { SHOTS, log, newContext, watch, shot, handNo, linkSit } from './harness.ts';

/**
 * 好友房长跑（--only roomsoak，--soak-hands 200 --soak-csv 路径）：一个真人加三台电脑打很多手，每 10 手量一次页面的内存、DOM、监听器、计时器、重连次数。
 * 用来查"房间开久了变卡、画面倒退"（长跑里这些数该是平的）；不属于默认冒烟。
 */
interface SoakRoom {
  ctx: BrowserContext;
  gctx: BrowserContext;
  page: Page;
  gp: Page;
  cdp: import('playwright-core').CDPSession;
  guest: () => Promise<void>;
  sockets: () => number;
}

/** 长跑、弱网用：一个真人（被测页面）加一个凑人数的跟注页面，两台电脑，开快动画 */
async function startSoakRoom(browser: Browser, base: string): Promise<SoakRoom> {
  const ctx = await newContext(browser, base, 'smoke-soak');
  await ctx.addInitScript(() => {
    localStorage.setItem('texas.settings', JSON.stringify({ fast: true }));
    // 数还没清掉的计时器（泄漏的计时器会越攒越多）
    const live = new Set<number>();
    const w = window as unknown as { __live: Set<number> };
    w.__live = live;
    const st = window.setTimeout.bind(window);
    const si = window.setInterval.bind(window);
    window.setTimeout = ((f: TimerHandler, ms?: number, ...a: unknown[]) => {
      const id = st(() => {
        live.delete(id);
        typeof f === 'function' ? f(...a) : 0;
      }, ms);
      live.add(id);
      return id;
    }) as typeof window.setTimeout;
    window.setInterval = ((f: TimerHandler, ms?: number, ...a: unknown[]) => {
      const id = si(f as () => void, ms, ...a);
      live.add(id);
      return id;
    }) as typeof window.setInterval;
    const ct = window.clearTimeout.bind(window);
    window.clearTimeout = window.clearInterval = ((id?: number) => {
      if (id !== undefined) live.delete(id);
      ct(id);
    }) as typeof window.clearTimeout;
  });
  const page = await ctx.newPage();
  watch(page, 'soak');
  let sockets = 0;
  page.on('websocket', () => sockets++);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.goto(`${base}/games/texas/?online=1`);
  await page.locator('.friends.spot').waitFor();
  await page.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
  await page.locator('.size', { hasText: /^4$/ }).click();
  await page.locator('.friends .pill', { hasText: '开房间' }).click();
  await page.locator('.room-wait').waitFor();
  await page.locator('.rw-seat.me').waitFor();
  // 开打要两个真人：第二个人坐下后一直跟注（页面小开销，只为凑人）
  const code = ((await page.locator('.rw-code').textContent()) ?? '').replace(/\D/g, '');
  const gctx = await newContext(browser, base, 'smoke-soak-g');
  await gctx.addInitScript(() => localStorage.setItem('texas.settings', JSON.stringify({ fast: true })));
  const gp = await gctx.newPage();
  watch(gp, 'soak-guest');
  await gp.goto(`${base}/games/texas/?room=${code}`);
  await linkSit(gp);
  await page.locator('.rw-seat.taken').nth(1).waitFor();
  await page.locator('.rw-go .start').click();
  await page.locator('.seat.me .card.up').first().waitFor({ timeout: 20_000 });
  const guest = async (): Promise<void> => {
    if (await gp.locator('.dialog').isVisible()) await gp.locator('.d-btn.primary').click();
    else if (await gp.locator('.actions.on').isVisible()) await gp.locator('.act.call').click();
    else if ((await gp.locator('.seat.me .stack').textContent())?.trim() === '0') await gp.locator('.hud .pill', { hasText: '补筹码' }).click({ timeout: 1_000 });
  };
  return { ctx, gctx, page, gp, cdp, guest, sockets: () => sockets };
}

export async function roomSoak(browser: Browser, base: string): Promise<void> {
  const total = Number(opt('soak-hands', '200'));
  const csv = opt('soak-csv', join(SHOTS, 'soak.csv'));
  const { ctx, gctx, page, gp, cdp, guest, sockets: socketCount } = await startSoakRoom(browser, base);
  const t0 = Date.now();
  const rows = ['hands,sec,heapMB,nodes,domAll,listeners,timers,anims,sockets,layouts,docs'];
  let next = 10;
  const sample = async (no: number): Promise<void> => {
    await cdp.send('HeapProfiler.collectGarbage');
    const m = Object.fromEntries(((await cdp.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] }).metrics.map((x) => [x.name, x.value]));
    const e = await page.evaluate(() => ({ dom: document.querySelectorAll('*').length, timers: (window as unknown as { __live: Set<number> }).__live.size, anims: document.getAnimations().length }));
    rows.push([no, Math.round((Date.now() - t0) / 1000), ((m.JSHeapUsedSize ?? 0) / 1048576).toFixed(1), m.Nodes, e.dom, m.JSEventListeners, e.timers, e.anims, socketCount(), m.LayoutCount, m.Documents].join(','));
    writeFileSync(csv, rows.join('\n') + '\n');
    // 按"标签.类名"数节点，前后对比就知道是什么在涨
    const by = await page.evaluate(() => {
      const c: Record<string, number> = {};
      for (const el of document.querySelectorAll('*')) {
        const k = `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').split(' ')[0]}`;
        c[k] = (c[k] ?? 0) + 1;
      }
      return c;
    });
    writeFileSync(csv.replace(/\.csv$/, `-dom-${no}.json`), JSON.stringify(by));
    log('soak', rows.at(-1));
  };
  await sample(0);
  let k = 0;
  let last = 0;
  let lastMove = Date.now();
  const deadline = Date.now() + 4 * 3_600_000;
  while (Date.now() < deadline) {
    const no = await handNo(page);
    if (no < last) log('SOAK hand number went back', last, '->', no);
    if (no !== last) lastMove = Date.now();
    last = no;
    if (Date.now() - lastMove > 120_000) {
      // 两分钟没换手：多半卡住了，两边各拍一张、记下页面状态再退出
      await shot(page, 'soak-stall-host');
      await shot(gp, 'soak-stall-guest');
      log('SOAK stalled at hand', no, await page.evaluate(() => document.querySelector('.stage')?.getAttribute('class') + ' | ' + document.querySelector('.actions')?.getAttribute('class')));
      break;
    }
    if (no >= next) {
      await sample(no);
      next += 10;
    }
    if (no > total) break;
    await guest().catch(() => {});
    if (await page.locator('.dialog').isVisible()) {
      await page.locator('.d-btn.primary').click();
      continue;
    }
    const topUp = page.locator('.hud .pill', { hasText: '补筹码' });
    if ((await topUp.isVisible()) && (await page.locator('.seat.me .stack').textContent())?.trim() === '0') {
      await topUp.click({ timeout: 2_000 }).catch(() => {});
      continue;
    }
    if (await page.locator('.actions.on').isVisible()) {
      if (k++ % 9 === 4 && !(await page.locator('.act.fold.soft').isVisible())) await page.locator('.act.fold').click();
      else await page.locator('.act.call').click();
      await page.waitForTimeout(100);
      continue;
    }
    await page.waitForTimeout(100);
  }
  await sample(last);
  await shot(page, 'soak-table');
  await gctx.close();
  log(`soak done: ${last} hands in ${Math.round((Date.now() - t0) / 1000)} s, sockets ${socketCount()}`);
  await ctx.close();
}

/**
 * 后台切回、弱网（--only roomweak，--weak-out 目录）：在长跑的房间里让被测页面"进后台 / 冻结 / 断网 / 高延迟"一阵再恢复，
 * 页面里每 40 毫秒记一次（手数、公共牌张数、底池、我的筹码），恢复后看有没有倒退（手数变小、同一手公共牌变少）、追上最新花了多久、
 * 中间摆了多少个不同的画面（一手一手重播旧操作就会很多）。
 */
export async function roomWeak(browser: Browser, base: string): Promise<void> {
  const out = opt('weak-out', SHOTS);
  const secs = Number(opt('weak-secs', '45'));
  const { ctx, gctx, page, gp, cdp, guest, sockets } = await startSoakRoom(browser, base);
  await page.evaluate(() => {
    const w = window as unknown as { __tr: unknown[] };
    w.__tr = [];
    setInterval(() => {
      const t = (q: string): string => document.querySelector(q)?.textContent ?? '';
      w.__tr.push([Math.round(performance.now()), Number(t('.hand-no').replace(/\D/g, '')) || 0, [...document.querySelectorAll('.card.board:not(.hidden)')].map((c) => (c.textContent ?? '').replace(/\s/g, '').slice(0, 4)).join(' '), t('.pot b').trim(), t('.seat.me .stack').trim()]);
    }, 40);
  });
  const pump = async (ms: number): Promise<void> => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      await guest().catch(() => {});
      if (await page.locator('.actions.on').isVisible().catch(() => false)) await page.locator('.act.call').click({ timeout: 1_000 }).catch(() => {});
      await page.waitForTimeout(150);
    }
  };
  const hide = (on: boolean): Promise<unknown> =>
    page.evaluate((h) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
      document.dispatchEvent(new Event('visibilitychange'));
    }, on);
  const scenarios: [string, () => Promise<void>, () => Promise<void>][] = [
    ['hidden', () => hide(true).then(() => undefined), () => hide(false).then(() => undefined)],
    ['frozen', () => cdp.send('Page.setWebLifecycleState', { state: 'frozen' }).then(() => undefined), () => cdp.send('Page.setWebLifecycleState', { state: 'active' }).then(() => undefined)],
    ['offline', () => ctx.setOffline(true), () => ctx.setOffline(false)],
    ['slow', () => cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 800, downloadThroughput: 20_000, uploadThroughput: 20_000 }).then(() => undefined), () => cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }).then(() => undefined)],
  ];
  await cdp.send('Network.enable');
  await pump(20_000);
  const report: string[] = [];
  for (const [name, start, stop] of scenarios) {
    await pump(12_000);
    const socketsBefore = sockets();
    await page.evaluate(() => ((window as unknown as { __tr: unknown[] }).__tr.length = 0));
    await start();
    // 冻结时页面的计时器停了：回合的出手由房间超时代打，guest 页继续跟注
    const t0 = Date.now();
    while (Date.now() - t0 < secs * 1000) {
      await guest().catch(() => {});
      await gp.waitForTimeout(300);
    }
    const gHand = Number(((await gp.locator('.hand-no').textContent()) ?? '').replace(/\D/g, '')) || 0;
    await page.evaluate(() => ((window as unknown as { __tr: unknown[] }).__tr.length = 0));
    const tResume = Date.now();
    await stop();
    await pump(18_000);
    const tr0 = await page.evaluate(() => (window as unknown as { __tr: [number, number, string, string, string][] }).__tr);
    // 第 3 列换成张数，牌面留在第 6 列
    const tr = tr0.map((r) => [r[0], r[1], r[2] ? r[2].split(' ').length : 0, r[3], r[4], r[2]] as [number, number, number, string, string, string]);
    // 只留变化的行
    const ch = tr.filter((r, i) => i === 0 || r.slice(1).join('|') !== tr[i - 1]!.slice(1).join('|'));
    // 倒退：手数变小；或同一手里公共牌张数先到过 v、掉下去、又重新数到 v（旧操作被重播了一遍）
    let regress = 0;
    const peak = new Map<number, number>();
    let dropped = false;
    for (let i = 1; i < ch.length; i++) {
      const a = ch[i - 1]!;
      const b = ch[i]!;
      if (b[1] < a[1]) regress++;
      if (b[1] !== a[1]) {
        peak.clear();
        dropped = false;
      }
      const top = peak.get(b[1]) ?? 0;
      if (b[2] < top) dropped = true;
      else if (dropped && b[2] >= top && b[2] > 0 && b[2] > a[2]) {
        regress++;
        dropped = false;
      }
      peak.set(b[1], Math.max(top, b[2]));
    }
    const t00 = tr[0]?.[0] ?? 0;
    const lines = ch.slice(0, 30).map((r) => `${r[0] - t00}ms hand ${r[1]} board ${r[2]} pot ${r[3]} stack ${r[4]} [${r[5]}]`);
    const settle = ch.length ? ch.at(-1)![0] - t00 : 0;
    report.push(`## ${name}: guest hand at resume ${gHand}, states seen after resume ${ch.length}, regressions ${regress}, last change at +${settle}ms, new sockets ${sockets() - socketsBefore}`);
    report.push(...lines, '');
    log('weak', name, `states ${ch.length} regress ${regress} sockets +${sockets() - socketsBefore} resumeAt ${tResume - t0}`);
    await shot(page, `weak-${name}`);
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'weak.txt'), report.join('\n'));
  await gctx.close();
  await ctx.close();
}
