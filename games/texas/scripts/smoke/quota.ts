import type { Browser, Page } from 'playwright-core';
import { allowed409, enter, log, newContext, openMore, watch, linkSit } from './harness.ts';
import { playRoom } from './room.ts';

/**
 * 每人同时 1 个房间（0.39.0，--only quota）。德州没有"再来一场"按钮（结算页只回标题），再来 = 回大厅开新房 / 再排：
 * - 现金房：房主先走、朋友还在打，房主还占着这一间：开房被 has_room 送回原房间，并提示一句；朋友（不是房主）离桌后自己开房开出新的；
 * - 快速匹配：一个人先走、另一个还在打，先走的人还占着那一桌：再排被送回原桌，同一句提示。
 * 锦标赛打完马上能开新房在 tourroom 冒烟里核对，大家都走了再开在 room 冒烟里核对。
 */
export async function quotaFlow(browser: Browser, base: string): Promise<void> {
  const codeOf = async (p: Page): Promise<string> => ((await p.locator('.rw-code').textContent()) ?? '').replace(/\D/g, '');
  const told = (p: Page): Promise<void> => p.locator('.toast.on', { hasText: '你已经开着一个房间' }).waitFor({ timeout: 5_000 });
  // 匹配桌的标题不带房间码：按连上的房间 WebSocket 认是哪一间
  const sockets = new Map<Page, string[]>();
  const lastRoom = (p: Page): string => (sockets.get(p) ?? []).map((u) => /\/rooms\/(\d{6})\//.exec(u)?.[1] ?? '').filter(Boolean).at(-1) ?? '';
  const leave = async (p: Page): Promise<void> => {
    await p.locator('.leave').click();
    await p.locator('.dialog').waitFor();
    await p.locator('.d-btn.danger').click();
    // 打过的出结算页；还在等人页（没开打）的直接回大厅
    await p.locator('.summary, .lobby').first().waitFor({ timeout: 10_000 });
    if (await p.locator('.summary').isVisible()) await p.locator('.d-btn.primary').click();
    await p.locator('.lobby').waitFor();
  };
  const openRoom = async (p: Page): Promise<void> => {
    await enter(p, '好友房');
    await p.locator('.friends .pill', { hasText: '开房间' }).click();
    await p.locator('.stage.in-room').waitFor({ timeout: 20_000 });
  };
  const page = async (userId: string, tag: string, allow409 = false): Promise<Page> => {
    const ctx = await newContext(browser, base, userId);
    await ctx.addInitScript(() => localStorage.setItem('texas.settings', JSON.stringify({ fast: true })));
    const p = await ctx.newPage();
    watch(p, tag, allow409);
    sockets.set(p, []);
    p.on('websocket', (ws) => sockets.get(p)!.push(ws.url()));
    await p.goto(`${base}/games/texas/`);
    await p.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
    return p;
  };

  // —— 现金房：房主开 4 人桌，朋友进来坐下，开打一手 ——
  const hp = await page('smoke-qh', 'quota-host', true);
  const ap = await page('smoke-qa', 'quota-a');
  await enter(hp, '好友房');
  await hp.locator('.size', { hasText: /^4$/ }).click();
  await hp.locator('.friends .pill', { hasText: '开房间' }).click();
  await hp.locator('.rw-seat.me').waitFor();
  const code = await codeOf(hp);
  log('quota: cash room', code);
  await ap.goto(`${base}/games/texas/?room=${code}`);
  await linkSit(ap);
  await hp.locator('.rw-go .start').click();
  for (const p of [hp, ap]) await p.locator('.seat.me .card.up').first().waitFor({ timeout: 20_000 });
  await Promise.all([playRoom(hp, 1, 'qh'), playRoom(ap, 1, 'qa')]);

  // 房主先走、朋友还在打：再开房被送回原房间，有提示，只有一次 409
  await leave(hp);
  await openRoom(hp);
  await told(hp);
  if (lastRoom(hp) !== code) throw new Error(`host left while the table plays: expected back in ${code}, got ${lastRoom(hp)}`);
  if (allowed409['quota-host'] !== 1) throw new Error(`host: expected exactly one 409, got ${allowed409['quota-host'] ?? 0}`);
  log('quota: host back to', code);
  await leave(hp);

  // 朋友（不是房主）离桌，自己开房：开出新的，不 409
  await leave(ap);
  await openRoom(ap);
  const a2 = await codeOf(ap);
  if (a2 === code || !/^\d{6}$/.test(a2)) throw new Error(`guest: expected a new room, got ${a2}`);
  if (allowed409['quota-a']) throw new Error('guest: no 409 expected');
  log('quota: guest new room', a2);
  await leave(ap);

  // —— 快速匹配：两个人排到一桌，m1 先走、m2 还在打，m1 再排被送回原桌 ——
  const p1 = await page('smoke-qm1', 'quota-m1');
  const p2 = await page('smoke-qm2', 'quota-m2');
  for (const p of [p1, p2]) {
    await enter(p, '实盘');
    await openMore(p);
  }
  await Promise.all([p1, p2].map((p) => p.locator('.lobby .pill.match').click()));
  for (const p of [p1, p2]) await p.locator('.stage.in-room.at-table').waitFor({ timeout: 45_000 });
  const m = lastRoom(p1);
  await Promise.all([playRoom(p1, 1, 'qm1'), playRoom(p2, 1, 'qm2')]);
  await leave(p1);
  await enter(p1, '实盘');
  await openMore(p1);
  await p1.locator('.lobby .pill.match').click();
  await p1.locator('.stage.in-room').waitFor({ timeout: 20_000 });
  await told(p1);
  if (!m || lastRoom(p1) !== m) throw new Error(`match leaver: expected back in ${m}, got ${lastRoom(p1)}`);
  log('quota: match leaver back to', m);
  for (const p of [p1, p2]) await leave(p);
  await Promise.all([hp, ap, p1, p2].map((p) => p.context().close()));
}
