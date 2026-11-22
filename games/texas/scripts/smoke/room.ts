/** 好友房（--only room）和匹配真人（--only match）。 */
import type { Browser, Page } from 'playwright-core';
import { HANDS, DESK_W, allowed409, log, newContext, watch, shot, balance, skipTips, enter, openMore, PHONE, handNo, settled, linkSit } from './harness.ts';

/** 好友房两手之间停了多久（看到倒计时 → 下一手发出来），按页面记 */
const roomPauses: Record<string, number[]> = {};

/** 好友房里自动打到第 n 手：轮到就跟注过牌（偶尔弃牌），输光了补码；两手之间看到倒计时就量一下停了多久 */
/** 房主亮过牌没有（一场只试一次） */
let roomShowed = false;

export async function playRoom(page: Page, hands: number, tag: string, shotAt: Set<number> = new Set()): Promise<void> {
  let k = 0;
  let paused: { no: number; at: number } | null = null;
  const deadline = Date.now() + hands * 60_000;
  for (;;) {
    if (Date.now() > deadline) throw new Error(`[${tag}] room playing took too long`);
    const no = await handNo(page);
    if (paused && no > paused.no) {
      (roomPauses[tag] ??= []).push(Date.now() - paused.at);
      paused = null;
    }
    if (no > hands) return;
    // 主动亮牌（0.19.0）：房主第一次看到亮牌那一块就亮一张，自己座位上那张翻过来（经房间转一圈回来的视图）
    if (tag === 'host' && !roomShowed && (await page.locator('.show-cards').isVisible())) {
      roomShowed = true;
      await page.locator('.show-cards .sc-card').first().click();
      await page.locator('.seat.me .card.up').first().waitFor({ timeout: 5_000 });
      await shot(page, 'room-show');
      log('host showed a card at hand', no);
    }
    if (!paused && (await page.locator('.room-pause').isVisible())) {
      if (await page.locator('.next-hand').isVisible()) throw new Error(`[${tag}] room shows "下一手"`);
      if (!(roomPauses[tag]?.length)) await shot(page, `room-${tag}-pause`);
      paused = { no, at: Date.now() };
    }
    if (await page.locator('.dialog').isVisible()) {
      log(tag, 'dialog:', await page.locator('.d-title').textContent());
      await page.locator('.d-btn.primary').click();
      continue;
    }
    // 0.3.0 起桌上不满一份就能补：按钮常亮着，只在输光了才补（像真人一样），按钮刚好收起了就不等
    const topUp = page.locator('.hud .pill', { hasText: '补码' });
    if ((await topUp.isVisible()) && (await page.locator('.seat.me .stack').textContent())?.trim() === '0') {
      await topUp.click({ timeout: 2_000 }).catch(() => {});
      continue;
    }
    if (await page.locator('.actions.on').isVisible()) {
      if (shotAt.has(no)) {
        shotAt.delete(no);
        await shot(page, `room-${tag}-${no}`);
      }
      if (k++ % 9 === 4 && !(await page.locator('.act.fold.soft').isVisible())) await page.locator('.act.fold').click();
      else await page.locator('.act.call').click();
      await page.waitForTimeout(150);
      continue;
    }
    await page.waitForTimeout(150);
  }
}

/**
 * 好友房：三个人（两台电脑、一部手机）进同一个房间打 N 手；中途手机刷新（断线重连回到座位），
 * 后来的第四个人看着、接管电脑的座位；最后都离开，筹码结回钱包。
 */
export async function room(browser: Browser, base: string): Promise<void> {
  const pages: [Page, string][] = [];
  try {
    await roomFlow(browser, base, pages);
  } catch (e) {
    // 出错时四个人各拍一张，看卡在哪
    for (const [p, tag] of pages) await shot(p, `debug-room-${tag}`).catch(() => {});
    throw e;
  }
}

async function roomFlow(browser: Browser, base: string, pages: [Page, string][]): Promise<void> {
  const hands = Math.min(HANDS, 10);
  const host = await newContext(browser, base, 'smoke-host');
  const a = await newContext(browser, base, 'smoke-a');
  const b = await newContext(browser, base, 'smoke-b', PHONE);
  const d = await newContext(browser, base, 'smoke-d');
  const [hp, ap, bp, dp] = await Promise.all([host.newPage(), a.newPage(), b.newPage(), d.newPage()]);
  pages.push([hp, 'host'], [ap, 'a'], [bp, 'phone'], [dp, 'late']);
  watch(hp, 'room-host');
  watch(ap, 'room-a');
  watch(bp, 'room-phone');
  watch(dp, 'room-d');
  // 房主从平台大厅的"好友房"按钮进来（?online=1）：参数读完就去掉，好友房那一行亮起来、光标在房间码里
  await hp.goto(`${base}/games/texas/?online=1`);
  await hp.locator('.friends.spot').waitFor();
  if (new URL(hp.url()).search !== '') throw new Error(`?online=1 not stripped: ${hp.url()}`);
  if (!(await hp.locator('.code-in:not(.nick-in)').evaluate((e) => e === document.activeElement))) throw new Error('?online=1 should focus the room code');
  await shot(hp, 'online-entry');
  for (const p of [hp, ap, bp, dp]) {
    if (p !== hp) await p.goto(`${base}/games/texas/`);
    await p.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
  }

  // 房主选 4 人桌开房：自己坐 1 号
  await hp.locator('.size', { hasText: /^4$/ }).click();
  await hp.locator('.friends .pill', { hasText: '开房间' }).click();
  await hp.locator('.room-wait').waitFor();
  await hp.locator('.rw-seat.me').waitFor();
  const code = ((await hp.locator('.rw-code').textContent()) ?? '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(code)) throw new Error(`bad room code ${code}`);
  log('room', code);
  // 叫朋友来（kit 的面板）：好友列出来、叫一下变"已叫"，关掉
  await hp.locator('.rw-invite').click();
  const call = hp.locator('[data-key="invite:call:u-pal"]');
  await call.waitFor();
  await call.click();
  await hp.waitForFunction(() => (document.querySelector('[data-key="invite:call:u-pal"]') as HTMLButtonElement | null)?.disabled === true);
  await shot(hp, 'room-invite');
  await hp.locator('[data-key="invite:close"]').click();
  await hp.locator('#arcade-invite-panel').waitFor({ state: 'detached' });

  // 一个点邀请链接进来，一个（手机）在大厅输码
  await ap.goto(`${base}/games/texas/?room=${code}`);
  await ap.locator('.room-wait').waitFor();
  if (new URL(ap.url()).search) throw new Error('invite link query not stripped');
  // 好友房卡在主页第一屏（0.17.4 起第一屏就看得见，0.18.0 换成模式卡），点了才出开房、输码
  const tab = await bp.locator('.mcard[data-mode="room"]').boundingBox();
  if (!tab || tab.y + tab.height > PHONE.viewport.height) throw new Error(`phone: 好友房 should be on the first screen, got ${JSON.stringify(tab)}`);
  if (await bp.locator('.friends.join').isVisible()) throw new Error('phone: friends row should wait for the 好友房 card');
  await enter(bp, '好友房', true);
  await shot(bp, 'phone-friends-tab');
  await bp.locator('.code-in:not(.nick-in)').fill(code);
  await bp.locator('.friends .pill', { hasText: '进房间' }).tap();
  await bp.locator('.room-wait').waitFor();
  // 点链接进来的自动坐第一个空位（0.41.4）；实盘先问"坐下"
  await linkSit(ap);
  await bp.locator('.rw-seat').nth(2).locator('.rw-sit').tap();
  await bp.locator('.rw-seat.me').waitFor();
  // 输码进来的也知道档位和人数（开房时定的）：要带多少写着，用不到的座位不显示
  if (!((await bp.locator('.rw-info').textContent()) ?? '').includes('2,000')) throw new Error('room info should show the buy-in');
  if ((await bp.locator('.rw-seat:not(.hidden)').count()) !== 4) throw new Error('only the 4 seats in use should show');
  await hp.locator('.rw-seat.taken').nth(2).waitFor();
  await shot(hp, 'room-wait-host');
  await shot(bp, 'room-wait-phone');
  // 等人页画成桌子（0.18.4）：竖屏也得把椅子都放在桌子那块里、不压到下面的按钮
  await bp.setViewportSize({ width: 390, height: 844 });
  await bp.waitForTimeout(400);
  await shot(bp, 'room-wait-portrait');
  const box = await bp.locator('.rw-seats').boundingBox();
  const go = await bp.locator('.rw-go').boundingBox();
  for (const s of await bp.locator('.rw-seat:not(.hidden)').all()) {
    const r = await s.boundingBox();
    if (!box || !go || !r || r.x < 0 || r.x + r.width > 390 || r.y + r.height > go.y) throw new Error(`portrait waiting room: seat out of place ${JSON.stringify(r)}`);
  }
  await bp.setViewportSize(PHONE.viewport);
  // 坐着的人都有"开打"（0.3.5）：不是房主的点了，房间回 not_host，冒一句，还在等
  await ap.locator('.rw-go .start').click();
  await ap.locator('.toast.on', { hasText: '只有开房的人能开打' }).waitFor({ timeout: 5_000 });
  if (!(await ap.locator('.rw-seat.me').isVisible())) throw new Error('guest should still be waiting after not_host');

  await hp.locator('.rw-go .start').click();
  for (const p of [hp, ap, bp]) await p.locator('.seat.me .card.up').first().waitFor({ timeout: 20_000 });
  log('room started');

  // 好友房的乐子（0.3.0）：房主点手机的头像扔一个番茄，1 号从面板发一句嘲讽；手机上看得到道具飞过来、嘲讽的气泡，两边截图
  await hp.locator('.atf-hot[data-seat="2"]').click();
  await hp.locator('.atf-box [data-key="fun:prop0"]').click();
  await bp.locator('.arcade-fun > *').first().waitFor({ timeout: 5_000 });
  await shot(bp, 'fun-prop-phone');
  await ap.locator('.atf-btn').click();
  await ap.locator('.atf-box [data-key="fun:phrase0"]').click();
  await bp.locator('.atf-bubble', { hasText: '就这？' }).waitFor({ timeout: 5_000 });
  await hp.locator('.atf-bubble', { hasText: '就这？' }).waitFor({ timeout: 5_000 });
  await shot(bp, 'fun-taunt-phone');
  await shot(hp, 'fun-taunt-host');
  log('fun: prop and taunt seen on the other screens');
  // 好友房聊天（0.19.0，kit 0.18）：1 号从互动面板的聊天页说一句，房主和手机上都冒气泡；顶栏有聊天开关
  if (!(await hp.locator('.chat-toggle').isVisible())) throw new Error('room: chat toggle should show');
  await ap.locator('.atf-btn').click();
  await ap.locator('.atf-box [data-key="fun:tab:chat"]').click();
  await ap.locator('[data-key="fun:chatInput"]').fill('这把我跟到底');
  await ap.locator('[data-key="fun:chatSend"]').click();
  for (const p of [hp, bp]) await p.locator('.atf-say', { hasText: '这把我跟到底' }).waitFor({ timeout: 5_000 });
  await shot(hp, 'chat-host');
  await ap.locator('.atf-away').dispatchEvent('pointerdown');
  // kit 0.19 的聊天（0.19.4）：手机竖屏"聊天"按钮挨着"互动"，不压任何座位的头像和名牌
  await bp.setViewportSize({ width: 390, height: 844 });
  await bp.waitForTimeout(500);
  const cb = await bp.locator('[data-key="chat:button"]').boundingBox();
  if (!cb) throw new Error('portrait: no chat button');
  for (const e of await bp.locator('.seat:not(.empty) :is(.avatar, .plate)').all()) {
    const r = await e.boundingBox();
    if (r && r.x < cb.x + cb.width && cb.x < r.x + r.width && r.y < cb.y + cb.height && cb.y < r.y + r.height) throw new Error(`portrait: chat button covers a seat ${JSON.stringify(r)}`);
  }
  await shot(bp, 'chat-phone-portrait');
  await bp.setViewportSize(PHONE.viewport);
  // 房主把弹幕关了：1 号再说一句，房主那边只冒气泡、不飘弹幕（电脑版聊天框收起时先点开）
  if (await hp.locator('[data-key="chat:open"]').isVisible()) await hp.locator('[data-key="chat:open"]').click();
  await hp.locator('[data-key="chat:danmaku"]').click();
  await ap.waitForTimeout(3_100);
  await ap.locator('.atf-btn').click();
  await ap.locator('.atf-box [data-key="fun:tab:chat"]').click();
  await ap.locator('[data-key="fun:chatInput"]').fill('弹幕关了也看得到');
  await ap.locator('[data-key="fun:chatSend"]').click();
  await hp.locator('.atf-say', { hasText: '弹幕关了也看得到' }).waitFor({ timeout: 5_000 });
  if (await hp.locator('.atc-dms', { hasText: '弹幕关了也看得到' }).count()) throw new Error('host turned danmaku off but still sees it');
  await shot(hp, 'chat-host-danmaku-off');
  await ap.locator('.atf-away').dispatchEvent('pointerdown');
  log('chat: seen on the other screens, portrait button clear, danmaku off works');

  // 打到一半手机刷新：不自动进房（0.2.3），标题页有"回到房间"，点了回到原来的座位
  // 带着房间记录启动页面不能报错（0.3.7：原来先画大厅、后建云存档，这里一刷新就是 pageerror、大厅画不出来；结尾的零报错核对会抓到）
  const half = Math.max(2, Math.floor(hands / 2));
  const phone = (async () => {
    await playRoom(bp, half - 1, 'phone', new Set([1]));
    await bp.reload();
    await bp.locator('.banner.room .go', { hasText: code }).waitFor();
    if (await bp.locator('.in-room').count()) throw new Error('reload should not drop the phone back into the room');
    await shot(bp, 'room-reload-lobby');
    await bp.locator('.banner.room .go').tap();
    await bp.locator('.seat.me .card.up').first().waitFor({ timeout: 30_000 });
    log('phone rejoined at hand', await handNo(bp));
    await playRoom(bp, hands, 'phone', new Set([half + 1]));
  })();
  // 第四个人后来进房（第 3 手起）：看着，点亮着的电脑座位（4 号）接管
  const late = (async () => {
    while ((await handNo(hp)) < 3) await hp.waitForTimeout(500);
    await dp.goto(`${base}/games/texas/?room=${code}`);
    await dp.locator('.seat.takeable .avatar').first().waitFor({ timeout: 30_000 });
    await shot(dp, 'room-spectate');
    // 旁观（docs/social.md 1.4）：顶上写旁观中、有"坐下"、看不到任何人的底牌、不能扔东西（没有互动按钮）
    await dp.locator('.where.watching', { hasText: '旁观中' }).waitFor({ timeout: 10_000 });
    await dp.locator('.hud .pill', { hasText: /^坐下$/ }).waitFor();
    // 一手打完摊牌亮出来的是公开的，下一手发牌前才收；所以连着看两眼都在打牌、都有亮着的底牌才算看到了不该看的
    const leaked = async (): Promise<boolean> => (await dp.locator('.stage').getAttribute('data-phase')) !== 'idle' && (await dp.locator('.seat .card.up').count()) > 0;
    if (await leaked()) {
      await dp.waitForTimeout(2_000);
      if (await leaked()) throw new Error('spectator sees face-up hole cards during a hand');
    }
    if (await dp.locator('.atf-btn').isVisible()) throw new Error('spectator should not get the fun button');
    await dp.locator('.seat.takeable .avatar').first().click();
    await dp.locator('.dialog').waitFor();
    await dp.locator('.d-btn.primary').click();
    await dp.locator('.seat.me .card.up').first().waitFor({ timeout: 120_000 });
    log('late player took a seat at hand', await handNo(dp));
    await playRoom(dp, hands, 'late', new Set([(await handNo(dp)) + 1]));
  })();
  await Promise.all([phone, late, playRoom(hp, hands, 'host', new Set([4])), playRoom(ap, hands, 'a', new Set([3]))]);
  await shot(hp, 'room-after');
  if (!roomShowed) throw new Error('host never got the show-cards bar');
  // 两手之间房间停着（HAND_PAUSE_MS），大家看同一个倒计时：看到倒计时以后至少过了几秒才发
  for (const tag of ['host', 'a']) {
    const ms = roomPauses[tag] ?? [];
    log(tag, 'room pauses (ms)', ms.join(', '));
    if (!ms.length) throw new Error(`[${tag}] never saw the pause between hands`);
    if (Math.max(...ms) < 3_000) throw new Error(`[${tag}] pause between hands too short: ${ms.join(', ')}`);
  }

  // 都离开：这一手弃牌，打完筹码结回钱包；房主最后走，房间关掉
  for (const [p, tag] of [[bp, 'phone'], [ap, 'a'], [dp, 'late'], [hp, 'host']] as const) {
    await p.locator('.leave').click();
    await p.locator('.dialog').waitFor();
    if (tag === 'phone') await shot(p, 'room-leave-confirm');
    await p.locator('.d-btn.danger').click();
    // 坐着离开的：每个人这一场的输赢
    await p.locator('.summary').waitFor({ timeout: 5_000 });
    if (tag === 'phone') await shot(p, 'room-summary');
    // 颁奖（0.15.0）：打了好几手，真人里总有人输赢（电脑不进这张表，可能全是输的），至少一个奖；第一个走的点一下分享，卡能出来
    if ((await p.locator('.sum-award').count()) < 1) throw new Error(`[${tag}] room summary: expected awards`);
    if (tag === 'phone') {
      await p.locator('.sum-share').tap();
      await p.locator('[data-key="share:close"]').waitFor();
      await shot(p, 'room-share');
      await p.locator('[data-key="share:close"]').tap();
    }
    await p.locator('.d-btn.primary').click();
    await p.locator('.lobby').waitFor();
    log(tag, 'left, wallet', await settled(p, tag));
  }
  // 都离开了：房间没有真人就结束（0.2.4），标题页不给"回到房间"；房主再点"开房间"开出一个新的，不会 409、不会回到原来的房间
  if (await hp.locator('.banner.room').isVisible()) throw new Error('left the room: no "back to room" banner');
  await enter(hp, '好友房');
  await hp.locator('.friends .pill', { hasText: '开房间' }).click();
  await hp.locator('.room-wait').waitFor({ timeout: 20_000 });
  const code2 = ((await hp.locator('.rw-code').textContent()) ?? '').replace(/\D/g, '');
  if (code2 === code || !/^\d{6}$/.test(code2)) throw new Error(`open again: expected a new room, got ${code2}`);
  if (allowed409['room-host']) throw new Error('open again: no 409 expected');
  log('open again: new room', code2);
  // 每人同时 1 个房间：这间还开着时，同一个账号在另一页再点"开房间"，kit 回 409 has_room 带码，页面直接回到这一间
  const hp2 = await host.newPage();
  pages.push([hp2, 'host-again']);
  watch(hp2, 'room-host-again', true);
  await hp2.goto(`${base}/games/texas/`);
  await enter(hp2, '好友房');
  await hp2.locator('.friends .pill', { hasText: '开房间' }).click();
  await hp2.locator('.room-wait').waitFor({ timeout: 20_000 });
  const code3 = ((await hp2.locator('.rw-code').textContent()) ?? '').replace(/\D/g, '');
  if (code3 !== code2) throw new Error(`has_room: expected back in ${code2}, got ${code3}`);
  if (allowed409['room-host-again'] !== 1) throw new Error('has_room: expected exactly one 409');
  await hp2.locator('.toast.on', { hasText: '你已经开着一个房间' }).waitFor({ timeout: 5_000 });
  log('has_room: back to', code3);
  await Promise.all([host.close(), a.close(), b.close(), d.close()]);
}

/** 匹配真人：见文件头 */
export async function match(browser: Browser, base: string): Promise<void> {
  const one = await newContext(browser, base, 'smoke-m1');
  const two = await newContext(browser, base, 'smoke-m2');
  // 第二个人关了陌生人聊天（顶栏聊天开关的中间一档）
  await two.addInitScript(() => localStorage.setItem('texas.settings', JSON.stringify({ fast: true, strangerChat: false })));
  await one.addInitScript(() => localStorage.setItem('texas.settings', JSON.stringify({ fast: true })));
  const [p1, p2] = await Promise.all([one.newPage(), two.newPage()]);
  const sockets = new Map<Page, string[]>([[p1, []], [p2, []]]);
  for (const [p, tag] of [[p1, 'm1'], [p2, 'm2']] as const) {
    watch(p, `match-${tag}`);
    p.on('websocket', (ws) => sockets.get(p)!.push(ws.url()));
    await p.goto(`${base}/games/texas/`);
    await p.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
    await enter(p, '实盘');
    await openMore(p);
    await p.locator('.lobby .pill.match').waitFor();
  }
  // 取消：卡片关掉，还在选桌
  await p1.locator('.lobby .pill.match').click();
  // 等连上排队（卡上有"已有 n 人"）再点：连接还没建好就关，浏览器会记一条 WebSocket 警告
  await p1.locator('.match-card .mc-wait', { hasText: '已有' }).waitFor({ timeout: 10_000 });
  await p1.locator('.d-btn.primary', { hasText: '取消' }).click();
  await p1.locator('.match-card').waitFor({ state: 'detached' });
  await p1.waitForTimeout(1_500);
  if (await p1.locator('.stage.at-table').count()) throw new Error('match: cancel should stay in the lobby');

  const before = await balance(p1);
  await Promise.all([p1, p2].map((p) => p.locator('.lobby .pill.match').click()));
  await p1.locator('.match-card .mc-wait', { hasText: '已有 2/6 人' }).waitFor({ timeout: 10_000 });
  await shot(p1, 'match-waiting');
  // 排队等满 15 秒，人齐（排进来的两个都进了房间）自动开打
  for (const p of [p1, p2]) await p.locator('.stage.in-room.at-table').waitFor({ timeout: 45_000 });
  for (const [p, tag] of [[p1, 'm1'], [p2, 'm2']] as const) {
    if (await p.locator('.invite-btn').isVisible()) throw new Error(`[${tag}] match table: no invite button`);
    const where = (await p.locator('.topbar .where').textContent()) ?? '';
    if (!where.startsWith('匹配真人') || /\d{6}/.test(where)) throw new Error(`[${tag}] match table title: ${where}`);
  }
  const roomWs = (p: Page): string => sockets.get(p)!.find((u) => /\/rooms\/\d{6}/.test(u)) ?? '';
  if (!roomWs(p1).includes('chat=1')) throw new Error(`match: chat on should connect with chat=1: ${roomWs(p1)}`);
  if (!roomWs(p2) || roomWs(p2).includes('chat=1')) throw new Error(`match: stranger chat off should connect without chat=1: ${roomWs(p2)}`);
  // 1280×720 的 6 人桌放不下聊天框：第一次进桌（座位都坐上人以后才判断）先收成"聊天"小按钮
  if (DESK_W <= 1280) await p1.locator('.atc-pill').waitFor({ timeout: 15_000 });
  // 1920 放得下：聊天框展开着（kit 0.20.1 的 chatFolded 曾让 1920 也默认收起，0.20.2 修了）
  if (DESK_W >= 1600) {
    await p1.waitForTimeout(1_500);
    if (!(await p1.locator('[data-key="chat:dock"]').isVisible())) throw new Error('match table at 1920: chat dock should be open');
  }
  await shot(p1, 'match-table');
  await Promise.all([playRoom(p1, 2, 'm1'), playRoom(p2, 2, 'm2')]);
  for (const [p, tag] of [[p2, 'm2'], [p1, 'm1']] as const) {
    await p.locator('.leave').click();
    await p.locator('.dialog').waitFor();
    await p.locator('.d-btn.danger').click();
    await p.locator('.summary').waitFor({ timeout: 5_000 });
    await p.locator('.d-btn.primary').click();
    await p.locator('.lobby').waitFor();
    log(tag, 'left the match table, wallet', await settled(p, tag));
  }
  log('match wallet', before, '->', await balance(p1));

  // 娱乐档（0.21.0）：两个人排到同一张娱乐桌，标题写"娱乐"，打一手离开，钱包一分不动
  const funBefore = await Promise.all([p1, p2].map((p) => balance(p)));
  for (const p of [p1, p2]) {
    await enter(p, '娱乐');
    await openMore(p);
  }
  await Promise.all([p1, p2].map((p) => p.locator('.lobby .pill.match').click()));
  if (!((await p1.locator('.match-card .mc-tier').textContent()) ?? '').startsWith('娱乐')) throw new Error('fun match card should say 娱乐');
  for (const p of [p1, p2]) await p.locator('.stage.in-room.at-table').waitFor({ timeout: 45_000 });
  if (!((await p1.locator('.topbar .where').textContent()) ?? '').includes('娱乐')) throw new Error('fun match table title should say 娱乐');
  await shot(p1, 'match-fun');
  await Promise.all([playRoom(p1, 1, 'f1'), playRoom(p2, 1, 'f2')]);
  for (const p of [p2, p1]) {
    await p.locator('.leave').click();
    await p.locator('.dialog').waitFor();
    if ((await p.locator('.d-body').textContent())?.includes('钱包')) throw new Error('fun room leave should not mention the wallet');
    await p.locator('.d-btn.danger').click();
    await p.locator('.summary').waitFor({ timeout: 5_000 });
    await p.locator('.d-btn.primary').click();
    await p.locator('.lobby').waitFor();
  }
  const funAfter = await Promise.all([p1, p2].map((p) => settled(p, 'fun')));
  if (funAfter.join() !== funBefore.join()) throw new Error(`fun match should not touch the wallet: ${funBefore} -> ${funAfter}`);

  // 只有一个人排：15 秒后说一句，转成同一档的单机
  await enter(p1, '实盘');
  await openMore(p1);
  await p1.locator('.lobby .pill.match').click();
  await p1.locator('.stage.at-table').waitFor({ timeout: 45_000 });
  const said = await p1.evaluate(() => (window as { __said?: string[] }).__said ?? []);
  if (!said.some((t) => t.includes('现在没人在排'))) throw new Error(`match alone: expected the solo note, said ${said.join(' | ')}`);
  if (await p1.locator('.stage.in-room').count()) throw new Error('match alone: should be a solo table');
  await skipTips(p1);
  await shot(p1, 'match-solo');
  await Promise.all([one.close(), two.close()]);
}
