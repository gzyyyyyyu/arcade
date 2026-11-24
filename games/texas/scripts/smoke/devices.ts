/** 各种设备尺寸的检查、scenes 截图、大场面（--only devices / scenes / bigmoments）。 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { args, opt } from '../args.ts';
import { bigHand, scene, sceneSave, type BigKind, type SceneKind } from '../scenes.ts';
import { SHOTS, errors, log, newContext, watch, enter, stableShot, pinPage } from './harness.ts';

/**
 * 多尺寸（--only devices）：一个浏览器跑完手机竖横、平板、折叠屏、电脑的尺寸矩阵，每个尺寸走
 * 主页 → 选桌（娱乐、实盘、好友房各一遍）→ 对局（轮到我）→ 离桌结算，自动查：横向滚动、伸出屏幕又滚不到、点击区 ≥ 44（320 宽 ≥ 40）、关键元素互相压、
 * 截字（有意的省略号除外）、按钮里的字折出按钮、字号 ≥ 12、控制台报错。有问题的尺寸才截图；问题全收齐了一起报。
 * 390×664 是 iPhone Safari 带着上下工具栏剩下的高度。--lobby 只查主页和选桌页
 */
const DEVICE_SIZES: { name: string; w: number; h: number; touch: boolean }[] = [
  ...[[320, 568], [360, 640], [360, 780], [375, 667], [390, 664], [390, 844], [393, 852], [412, 915], [414, 896], [430, 932]].map(([w, h]) => ({ name: `phone-${w}x${h}`, w: w!, h: h!, touch: true })),
  ...[[568, 320], [640, 360], [667, 375], [780, 360], [844, 390], [896, 414], [932, 430]].map(([w, h]) => ({ name: `land-${w}x${h}`, w: w!, h: h!, touch: true })),
  ...[[768, 1024], [1024, 768], [820, 1180], [1180, 820], [1024, 1366], [1366, 1024], [884, 1104]].map(([w, h]) => ({ name: `tab-${w}x${h}`, w: w!, h: h!, touch: true })),
  ...[[1280, 720], [1366, 768], [1920, 1080]].map(([w, h]) => ({ name: `desk-${w}x${h}`, w: w!, h: h!, touch: false })),
];

/** 这一屏的毛病（看得见的元素按屏幕坐标量） */
async function audit(page: Page, where: string, touch: boolean): Promise<string[]> {
  return page.evaluate(([where, touch]) => {
    const W = innerWidth;
    const H = innerHeight;
    const out: string[] = [];
    const shown = (e: Element): DOMRect | null => {
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return null;
      const cs = getComputedStyle(e);
      if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return null;
      // 盖在弹窗遮罩下面的不算（摸不到、也看不清）
      const mask = document.querySelector('.mask:not(.hidden)');
      if (mask && !mask.contains(e) && getComputedStyle(mask).display !== 'none') return null;
      return r;
    };
    const label = (e: Element): string => `${e.tagName.toLowerCase()}.${[...e.classList].slice(0, 3).join('.')}「${(e.textContent ?? '').trim().slice(0, 8)}」`;
    if (document.documentElement.scrollWidth > W + 1) out.push(`横向滚动 ${document.documentElement.scrollWidth}>${W}`);
    // 外面有能滚的一层（滚得到）就不算出屏
    const scrolls = (e: Element): boolean => {
      for (let p = e.parentElement; p; p = p.parentElement) if (/auto|scroll/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight + 1) return true;
      return false;
    };
    const clickable = [...document.querySelectorAll('button, a[href], input, select, [role="button"]')].filter((e) => !(e as HTMLButtonElement).disabled);
    // 触屏上 button 和"大厅"用 ::before 把能点的范围撑到 44 个屏幕像素（style.css 的 --hit，无头浏览器不认 pointer: coarse，量不到）；
    // 电脑用鼠标，不查点按区
    // 滑杆在触屏条件（pointer: coarse 或宽 < 960）下直接做到 --hit：宽 ≥ 960 的平板在无头浏览器里两样都不命中，量的是电脑版的高度，不算；窄的照量
    const touchCss = matchMedia('(pointer: coarse), (max-width: 959px)').matches;
    const small = (e: Element): boolean => touch && !(e.tagName === 'BUTTON' || e.classList.contains('home')) && (touchCss || (e as HTMLInputElement).type !== 'range');
    const min = W <= 320 ? 40 : 44;
    for (const e of clickable) {
      const r = shown(e);
      if (!r) continue;
      if (r.left < -1 || r.right > W + 1 || ((r.top < -1 || r.bottom > H + 1) && !scrolls(e))) out.push(`伸出屏幕 ${label(e)} ${Math.round(r.left)},${Math.round(r.top)}-${Math.round(r.right)},${Math.round(r.bottom)}`);
      // 点击区：按钮自己或外面一圈能点的（::before 扩出来的不算，量不到）
      if (small(e) && (r.width < min - 0.5 || r.height < min - 0.5)) out.push(`点击区小 ${label(e)} ${Math.round(r.width)}×${Math.round(r.height)}`);
      // 按钮的 ::before 外扩量不到框，但点得到：过中心横竖各量一条，逐像素看点下去是不是这个按钮，连着点得到的长度不到 min 就报。
      // 落进邻居外扩出来的缝里算共用（缝里谁后画归谁），只有落到别的东西上（被外层裁掉、被盖住、进了另一个按钮自己画出来的框）才算断
      if (touch && touchCss && (e.tagName === 'BUTTON' || e.classList.contains('home')) && (r.width < min - 0.5 || r.height < min - 0.5)) {
        const cx = (r.left + r.right) / 2;
        const cy = (r.top + r.bottom) / 2;
        const stop: string[] = [];
        const reach = (dx: number, dy: number): number => {
          let n = 0;
          for (let k = 1; k <= min; k++) {
            const px = cx + dx * k;
            const py = cy + dy * k;
            if (px < 0 || py < 0 || px > W - 1 || py > H - 1) return min; // 屏幕边上：手指按到边也算
            const hit = document.elementFromPoint(px, py);
            if (hit && e.contains(hit)) {
              n = k;
              continue;
            }
            const other = hit?.closest('button, a[href], input, select, [role="button"]');
            if (other) {
              const o = other.getBoundingClientRect();
              if (px < o.left || px > o.right || py < o.top || py > o.bottom) {
                n = k;
                continue;
              }
            }
            stop.push(hit ? label(hit) : '空');
            break;
          }
          return n;
        };
        const tall = reach(0, -1) + reach(0, 1) + 1;
        const wide = reach(-1, 0) + reach(1, 0) + 1;
        if (tall < min - 0.5 || wide < min - 0.5) out.push(`点按区不到 ${min} ${label(e)} 画 ${Math.round(r.width)}×${Math.round(r.height)} 点得到 ${wide}×${tall}，挡住的 ${[...new Set(stop)].join('、')}`);
      }
    }
    // 关键元素两两不压（同一个元素里套着的不算）
    const KEY = '.seat .plate, .seat .avatar, .seat.me .bubble.on, .seat.me .card, .card.board, .actions .act, .actions .preset, .actions .qbet, .actions .odds, .hud > :not(.hidden), .topbar > :not(.spacer), .atc-pill, .atf-btn, .lobby .start, .lobby .tour-btn, .lobby .mcard';
    const keys = [...document.querySelectorAll(KEY)].map((e) => ({ e, r: shown(e) })).filter((x): x is { e: Element; r: DOMRect } => !!x.r);
    for (let i = 0; i < keys.length; i++)
      for (let j = i + 1; j < keys.length; j++) {
        const a = keys[i]!;
        const b = keys[j]!;
        if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
        // kit 的"互动""聊天"按钮就摆在给它留的占位格上
        if ([a.e, b.e].some((e) => e.classList.contains('fun-slot'))) continue;
        const dx = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const dy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (dx > 2 && dy > 2) out.push(`重叠 ${label(a.e)} × ${label(b.e)} ${Math.round(dx)}×${Math.round(dy)}`);
      }
    // 截字和字号：叶子文字元素
    for (const e of document.querySelectorAll('body *')) {
      if (e.children.length || !(e.textContent ?? '').trim()) continue;
      const r = shown(e);
      if (!r) continue;
      const cs = getComputedStyle(e);
      if (parseFloat(cs.fontSize) * (r.height / Math.max(1, (e as HTMLElement).offsetHeight || r.height)) < 11.5) out.push(`字小 ${label(e)} ${cs.fontSize}`);
      const he = e as HTMLElement;
      if (cs.textOverflow !== 'ellipsis' && cs.overflow !== 'visible' && he.scrollWidth > he.clientWidth + 1) out.push(`截字 ${label(e)}`);
      // 出了屏幕下沿、又没有能滚的外层：看不到也滚不到（选桌页锦标赛那行说明）
      if (r.bottom > H + 1 && !scrolls(e)) out.push(`出屏 ${label(e)} 下沿 ${Math.round(r.bottom)}>${H}`);
    }
    // 按钮里的字折行后高出按钮（竖屏选桌页"好友房"折成两行、"房"被切掉一半）
    for (const e of document.querySelectorAll('button')) {
      if (!shown(e)) continue;
      // 量字本身占的框（scrollHeight 会算上 ::before 撑开的点按区）
      const b = e.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(e);
      const t = range.getBoundingClientRect();
      if (t.height && (t.bottom > b.bottom + 2 || t.top < b.top - 2)) out.push(`按钮放不下字 ${label(e)} 字 ${Math.round(t.top)}-${Math.round(t.bottom)} 按钮 ${Math.round(b.top)}-${Math.round(b.bottom)}`);
    }
    return [...new Set(out)].map((x) => `${where}: ${x}`);
  }, [where, touch] as const);
}

class LobbyOnly extends Error {}

export async function devicesFlow(browser: Browser, base: string): Promise<void> {
  const report: string[] = [];
  // --sizes 568x320,780x360：只跑这几个，每一屏都截（检测量不到折行这类，人看一眼）
  const pick = opt('sizes', '').split(',').filter(Boolean);
  const contexts = new Map<boolean, BrowserContext>();
  for (const d of DEVICE_SIZES.filter((x) => !pick.length || pick.includes(`${x.w}x${x.h}`))) {
    let ctx = contexts.get(d.touch);
    if (!ctx) {
      ctx = await newContext(browser, base, d.touch ? 'smoke-dev-touch' : 'smoke-dev-desk', d.touch ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } : {});
      await ctx.addInitScript(() => {
        if (!localStorage.getItem('texas.settings')) localStorage.setItem('texas.settings', JSON.stringify({ fast: true }));
      });
      // tsx 编译时给函数加了 __name(...) 包装，audit 里定义的小函数传进页面会找不到它
      await ctx.addInitScript('globalThis.__name = (f) => f;');
      contexts.set(d.touch, ctx);
    }
    const page = await ctx.newPage();
    const before = errors.length;
    watch(page, `devices ${d.name}`);
    const found: string[] = [];
    // 哪一屏有问题就截哪一屏
    const check = async (where: string): Promise<void> => {
      const got = await audit(page, where, d.touch);
      if (got.length || pick.length) await page.screenshot({ path: join(SHOTS, `dev-${d.name}-${where}.png`) });
      found.push(...got);
    };
    try {
      await page.setViewportSize({ width: d.w, height: d.h });
      await page.goto(`${base}/games/texas/`);
      await page.locator('.w-balance').filter({ hasText: /\d/ }).waitFor({ state: 'attached' });
      await page.waitForTimeout(400);
      await check('home');
      await enter(page, '娱乐', d.touch);
      await page.waitForTimeout(400);
      await check('lobby');
      // 实盘和好友房的选桌页长得不一样（档位卡、锦标赛那行、输码进房），各查一遍再回娱乐
      for (const [mode, where] of [['实盘', 'lobby-real'], ['好友房', 'lobby-room']] as const) {
        if (!(await page.locator('.lobby .mode', { hasText: mode }).isVisible())) continue;
        await enter(page, mode, d.touch);
        await page.waitForTimeout(300);
        await check(where);
      }
      // --lobby：只查主页和选桌页
      if (args.includes('--lobby')) throw new LobbyOnly();
      await enter(page, '娱乐', d.touch);
      await page.waitForTimeout(300);
      await page.locator('.lobby .start').click();
      await page.locator('.stage.at-table').waitFor();
      await page.locator('.actions.on').waitFor({ timeout: 30_000 });
      await page.waitForTimeout(500);
      await check('table');
      await page.locator('.pill.leave').click();
      if (await page.locator('.dialog').isVisible({ timeout: 2_000 }).catch(() => false)) await page.locator('.d-btn.danger').click();
      await page.locator('.summary').waitFor({ timeout: 20_000 });
      await page.waitForTimeout(400);
      await check('summary');
    } catch (e) {
      if (!(e instanceof LobbyOnly)) found.push(`flow: ${(e as Error).message.split('\n')[0]}`);
    }
    for (const x of errors.splice(before)) found.push(`报错 ${x}`);
    if (found.length) report.push(...found.map((x) => `[${d.name}] ${x}`));
    log('devices', d.name, found.length ? `${found.length} issues` : 'ok');
    await page.close();
  }
  for (const c of contexts.values()) await c.close();
  writeFileSync(join(SHOTS, 'devices.txt'), report.join('\n') + '\n');
  if (report.length) throw new Error(`devices: ${report.length} issues in ${new Set(report.map((x) => x.slice(0, x.indexOf(']') + 1))).size} sizes, see ${join(SHOTS, 'devices.txt')}`);
}

/**
 * 牌桌上的东西两两不压（曾出现：边池变成两条长条压住桌心和手牌、底池被公共牌盖住一半、D 压住名牌）：
 * 名牌、头像、底牌、动作签、牌型、下注、D、公共牌、底池和边池、结果条、操作区、左下一排、顶栏、聊天框。同一个座位里的（头像挨着名牌这种）不算。
 * 返回问题清单，空就是没压
 */
async function tableHits(page: Page, where: string): Promise<string[]> {
  return page.evaluate(async ([where]) => {
    // 筹码落进名牌时名牌鼓一下（scale 1.1，0.4 秒）：量到鼓起的那一刻会多报几像素，等它放完再量
    // 名牌的动画、座位让位的平移（.seat 的 translate 过渡）都等落定再量：半路上量到的位置截图里看不到。
    // 只等有终点的（循环的永远等不完），最多等 2 秒
    const moving = document.getAnimations().filter((a) => (a.effect as KeyframeEffect | null)?.target?.closest('.seat') && Number.isFinite(a.effect?.getComputedTiming().endTime));
    await Promise.race([Promise.all(moving.map((a) => a.finished.catch(() => {}))), new Promise((ok) => setTimeout(ok, 2000))]);
    const PARTS = '.seat .plate, .seat .avatar, .seat .hole .card:not(.hidden), .seat .bubble.on, .seat .hand.on, .bet:not(.hidden), .dealer:not(.hidden), .card.board:not(.hidden), .pot-main:not(.hidden), .pot-sides > *, .result.on, .actions .act, .actions .preset, .actions .qbet, .actions .odds, .hud > :not(.hidden), .topbar > :not(.spacer), .atc-dock';
    const shown = (e: Element): DOMRect | null => {
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return null;
      for (let p: Element | null = e; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return null;
      }
      return r;
    };
    const label = (e: Element): string => `${e.tagName.toLowerCase()}.${[...e.classList].slice(0, 3).join('.')}「${(e.textContent ?? '').trim().slice(0, 8)}」`;
    const items = [...document.querySelectorAll(PARTS)].map((e) => ({ e, r: shown(e), seat: e.closest('.seat') })).filter((x) => x.r) as { e: Element; r: DOMRect; seat: Element | null }[];
    const out: string[] = [];
    for (let i = 0; i < items.length; i++)
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i]!;
        const b = items[j]!;
        if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
        if (a.seat && a.seat === b.seat) continue;
        // 动作签一闪而过、画在 D 上面可以；D 不能为它挪位置（scenes 另查前后 D 没动）
        const d = (e: Element): boolean => e.classList.contains('dealer');
        const bb = (e: Element): boolean => e.classList.contains('bubble');
        if ((d(a.e) && bb(b.e)) || (bb(a.e) && d(b.e))) continue;
        // 正在飞向落点的牌（.fly）和落点那张重合是发牌途中；摊牌时赢的五张放大 1.12 倍、压在相邻的公共牌上是设计（potfx.css 的 .card.best）
        if (a.e.classList.contains('fly') || b.e.classList.contains('fly')) continue;
        const board = (e: Element): boolean => e.classList.contains('board');
        if (board(a.e) && board(b.e) && (a.e.classList.contains('best') || b.e.classList.contains('best'))) continue;
        const dx = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const dy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        const at = (r: DOMRect): string => `${Math.round(r.left)},${Math.round(r.top)}–${Math.round(r.right)},${Math.round(r.bottom)}`;
        // 座位（名牌、头像、底牌）画在下注上面（.seat 的 z-index 比 .bet 高）：全下的高摞筹码顶塞到名牌下沿、底牌角底下不挡字，
        // 只查下注的金额有没有被盖住（390×844 9 人桌「1,160」伸到右上那家头像底下）
        const bet = a.e.classList.contains('bet') ? a : b.e.classList.contains('bet') ? b : null;
        const seated = bet === a ? b : a;
        if (bet && seated.seat) {
          const amt = bet.e.querySelector('.bet-amt')?.getBoundingClientRect();
          const ax = amt ? Math.min(seated.r.right, amt.right) - Math.max(seated.r.left, amt.left) : 0;
          const ay = amt ? Math.min(seated.r.bottom, amt.bottom) - Math.max(seated.r.top, amt.top) : 0;
          if (ax > 4 && ay > 4) out.push(`${where}: 座位盖住下注金额 ${label(seated.e)} ${at(seated.r)} × ${label(bet.e)} ${at(bet.r)} ${Math.round(ax)}×${Math.round(ay)}`);
          continue;
        }
        if (dx > 2 && dy > 2) out.push(`${where}: 压住 ${label(a.e)} ${at(a.r)} × ${label(b.e)} ${at(b.r)} ${Math.round(dx)}×${Math.round(dy)}`);
      }
    // 同一个座位里互相挨着可以，但筹码数不许被盖（试玩 1122：矮屏摊牌的牌型签盖住「1,560」）；动作签盖头像不超过头像高的 1/4（盖住半张脸）
    for (const seat of document.querySelectorAll('.seat')) {
      const stack = seat.querySelector('.plate .stack');
      const sr = stack && shown(stack);
      const av = seat.querySelector('.avatar');
      const ar = av && shown(av);
      for (const e of seat.querySelectorAll('.hand.on, .bubble.on, .hole .card:not(.hidden), .badge.on')) {
        const r = shown(e);
        if (!r) continue;
        const at = (q: DOMRect): string => `${Math.round(q.left)},${Math.round(q.top)}–${Math.round(q.right)},${Math.round(q.bottom)}`;
        if (sr) {
          const dx = Math.min(r.right, sr.right) - Math.max(r.left, sr.left);
          const dy = Math.min(r.bottom, sr.bottom) - Math.max(r.top, sr.top);
          if (dx > 2 && dy > 2) out.push(`${where}: 盖住筹码数 ${label(e)} ${at(r)} × ${label(stack)} ${at(sr)} ${Math.round(dx)}×${Math.round(dy)}`);
        }
        if (ar && e.classList.contains('bubble')) {
          const dx = Math.min(r.right, ar.right) - Math.max(r.left, ar.left);
          const dy = Math.min(r.bottom, ar.bottom) - Math.max(r.top, ar.top);
          if (dx > ar.width / 4 && dy > ar.height / 4) out.push(`${where}: 动作签盖住头像 ${label(e)} ${at(r)} × 头像 ${at(ar)} ${Math.round(dx)}×${Math.round(dy)}`);
        }
      }
    }
    // 出屏：只查两两互压发现不了被屏幕边缘切掉的部分
    for (const { e, r } of items)
      if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) out.push(`${where}: 出屏 ${label(e)} ${Math.round(r.left)},${Math.round(r.top)}–${Math.round(r.right)},${Math.round(r.bottom)}`);
    return out;
  }, [where] as const);
}

/**
 * 电脑版聊天框收着时玩家自己点开（试玩 1122：1280 上点开正好盖住自己两张底牌和「小盲」）：放不下时它总得盖点什么，
 * 但不许盖我的底牌和动作签、任何一家的名牌（名字、筹码数）、公共牌、底池、下注区。查完删掉 kit 记的展开设置，不影响同一尺寸后面的局面
 */
async function openedDockHits(page: Page, path: string): Promise<string[]> {
  const pill = page.locator('[data-key="chat:open"]');
  if (!(await pill.count())) return [];
  await pill.click();
  await page.locator('.atc-dock').waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path });
  const out = await page.evaluate(() => {
    const dock = document.querySelector('.atc-dock')?.getBoundingClientRect();
    if (!dock) return ['chat: 点了「聊天」没展开'];
    const KEEP = '.seat.me .hole .card:not(.hidden), .seat.me .bubble.on, .seat .plate, .card.board:not(.hidden), .pot-main:not(.hidden), .actions .act, .actions .preset, .actions .qbet, .actions .odds';
    return [...document.querySelectorAll(KEEP)].flatMap((e) => {
      const r = e.getBoundingClientRect();
      const dx = Math.min(r.right, dock.right) - Math.max(r.left, dock.left);
      const dy = Math.min(r.bottom, dock.bottom) - Math.max(r.top, dock.top);
      return r.width > 0 && dx > 2 && dy > 2 ? [`chat: 点开的聊天框压住 ${e.className.toString().slice(0, 30)}「${(e.textContent ?? '').trim().slice(0, 8)}」 ${Math.round(dx)}×${Math.round(dy)}`] : [];
    });
  });
  await page.evaluate(() => localStorage.removeItem('texas.chat'));
  return out;
}

/** 牌桌的几种局面（scripts/scenes.ts）：2–9 人，一个、两个边池，有人全下，摊牌；每个尺寸每个局面截一张、查互压 */
const SCENE_SIZES: { name: string; w: number; h: number; touch: boolean }[] = [
  { name: 'desk-1280x720', w: 1280, h: 720, touch: false },
  { name: 'desk-1920x1080', w: 1920, h: 1080, touch: false },
  { name: 'wide-2000x950', w: 2000, h: 950, touch: false },
  { name: 'land-844x390', w: 844, h: 390, touch: true },
  { name: 'land-667x375', w: 667, h: 375, touch: true },
  { name: 'phone-390x844', w: 390, h: 844, touch: true },
  // 矮竖屏走固定格子（layout.ts 的 isCompact），和 390×844 的椭圆是两套摆法
  { name: 'phone-360x640', w: 360, h: 640, touch: true },
];

/** D 的位置（没显示返回 null）：同一手里它只该跟庄家换人或版式走 */
const dealerRect = (page: Page): Promise<number[] | null> =>
  page.evaluate(() => {
    const e = document.querySelector('.dealer:not(.hidden)');
    const r = e?.getBoundingClientRect();
    return r && r.width > 0 ? [r.left, r.top] : null;
  });

export async function scenesFlow(browser: Browser, base: string): Promise<void> {
  const report: string[] = [];
  const pick = opt('sizes', '').split(',').filter(Boolean);
  const cases: [number, number, SceneKind][] = [[2, 1, 'showdown']];
  for (let n = 3; n <= 9; n++) {
    cases.push([n, 1, 'side']);
    if (n >= 4) cases.push([n, 2, 'side']);
    cases.push([n, n >= 4 ? 2 : 1, 'showdown']);
  }
  const user = 'smoke-scenes';
  for (const d of SCENE_SIZES.filter((x) => !pick.length || pick.some((p) => x.name.endsWith(p)))) {
    const ctx = await newContext(browser, base, user, d.touch ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {});
    await ctx.addInitScript('globalThis.__name = (f) => f;');
    await pinPage(ctx);
    // D 只跟庄家座位走：竖屏（D 贴着头像外侧、最容易被动作签挤）把庄家挨个换到每个座位，其余尺寸换一个（按局面轮着来）
    const withBtn = cases.flatMap(([n, sides, kind], k): [number, number, SceneKind, number][] =>
      kind !== 'side' ? [[n, sides, kind, -1]] : d.name.startsWith('phone') ? Array.from({ length: n }, (_, b) => [n, sides, kind, b]) : [[n, sides, kind, k % n]],
    );
    for (const [n, sides, kind, btn] of withBtn) {
      const tag = `${d.name}-${n}p-${kind}${kind === 'side' ? `${sides}-btn${btn}` : ''}`;
      const page = await ctx.newPage();
      const before = errors.length;
      watch(page, `scenes ${tag}`);
      const found: string[] = [];
      try {
        const table = scene(n, sides, kind, n * 10 + sides);
        // 只改显示用的庄家：翻牌后轮到我，之后的行动顺序由 toAct 接着走，冒烟只看版式
        if (btn >= 0) table.button = btn;
        const save = sceneSave(table, user);
        await page.addInitScript(([save]) => {
          localStorage.setItem('texas.settings', JSON.stringify({ fast: true }));
          localStorage.setItem('texas.session', save);
        }, [save] as const);
        await page.setViewportSize({ width: d.w, height: d.h });
        await page.goto(`${base}/games/texas/`);
        await page.locator('.qstart', { hasText: '继续上局' }).click();
        await page.locator('.stage.at-table').waitFor();
        if (kind === 'side') {
          await page.locator('.actions.on').waitFor({ timeout: 15_000 });
          await page.waitForTimeout(700);
          found.push(...(await tableHits(page, 'flop')));
          const d0 = await dealerRect(page);
          if (!(await stableShot(page, join(SHOTS, `scene-${tag}.png`)))) found.push('shot: 截图到时没落定');
          // 我过牌、电脑跟着说话：动作签都亮着的时候再查一遍
          await page.locator('.actions .act', { hasText: /过牌|跟注/ }).first().click();
          await page.waitForTimeout(900);
          found.push(...(await tableHits(page, 'after')));
          // 同一手、同一个庄：动作签冒出来不能把 D 顶开（比如右下那家的 D 跟着"下注 800"跳）
          const d1 = await dealerRect(page);
          if (d0 && d1 && Math.max(Math.abs(d0[0]! - d1[0]!), Math.abs(d0[1]! - d1[1]!)) > 1) found.push(`after: D 移动了 ${d0.map(Math.round)} → ${d1.map(Math.round)}`);
          // 电脑们接着走：等到又轮到我或这手打完再截，别截在半路（半路停在哪一家取决于计时）
          await page.locator('.actions.on, .result.on').first().waitFor({ timeout: 20_000 }).catch(() => undefined);
          // 停下来的这一刻再查一遍：0.9 秒那次电脑可能还没下注（9 人桌左中那家全下的「1,160」压住公共牌，只在它先下了注的那轮报）
          found.push(...(await tableHits(page, 'settled')));
          if (!(await stableShot(page, join(SHOTS, `scene-${tag}-after.png`)))) found.push('shot-after: 截图到时没落定');
          if (!d.touch) found.push(...(await openedDockHits(page, join(SHOTS, `scene-${tag}-chat.png`))));
        } else {
          await page.locator('.result.on').waitFor({ timeout: 15_000 });
          await page.waitForTimeout(700);
          found.push(...(await tableHits(page, 'showdown')));
          if (!(await stableShot(page, join(SHOTS, `scene-${tag}.png`)))) found.push('shot: 截图到时没落定');
        }
      } catch (e) {
        found.push(`flow: ${(e as Error).message.split('\n')[0]}`);
      }
      for (const x of errors.splice(before)) found.push(`报错 ${x}`);
      report.push(...[...new Set(found)].map((x) => `[${tag}] ${x}`));
      log('scenes', tag, found.length ? `${found.length} issues` : 'ok');
      await page.close();
    }
    await ctx.close();
  }
  writeFileSync(join(SHOTS, 'scenes.txt'), report.join('\n') + '\n');
  if (report.length) throw new Error(`scenes: ${report.length} issues, see ${join(SHOTS, 'scenes.txt')}`);
}

/**
 * 大场面（--only bigmoments）：摆好牌的两人桌（scripts/scenes.ts 的 bigHand），电脑已全下、我跟注，真速度（不开快档）放完：
 * 补牌时每家标出胜率、转牌河牌慢翻；四条 / 葫芦的庆祝字；葫芦那手转牌领先 95% 的电脑输了，冒"被逆转"。
 * 电脑 1280×720 和手机竖屏 390×844 各截几张（<shots>/big-<局>-<尺寸>-<步>.png），控制台零报错。
 */
export async function bigMomentsFlow(browser: Browser, base: string): Promise<void> {
  const user = 'smoke-big';
  const sizes = [
    { name: 'desk', w: 1280, h: 720, touch: false },
    { name: 'phone', w: 390, h: 844, touch: true },
  ];
  const report: string[] = [];
  for (const d of sizes) {
    const ctx = await newContext(browser, base, user, d.touch ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {});
    await ctx.addInitScript('globalThis.__name = (f) => f;');
    for (const kind of ['quads', 'boat'] as BigKind[]) {
      const tag = `${kind}-${d.name}`;
      const page = await ctx.newPage();
      const before = errors.length;
      watch(page, `big ${tag}`);
      const found: string[] = [];
      const shot = (step: string): Promise<Buffer> => page.screenshot({ path: join(SHOTS, `big-${tag}-${step}.png`) });
      try {
        const save = sceneSave(bigHand(kind, 41), user);
        await page.addInitScript(([save]) => {
          localStorage.setItem('texas.settings', JSON.stringify({}));
          localStorage.setItem('texas.session', save);
        }, [save] as const);
        await page.setViewportSize({ width: d.w, height: d.h });
        await page.goto(`${base}/games/texas/`);
        await page.locator('.qstart', { hasText: '继续上局' }).click();
        await page.locator('.stage.at-table').waitFor();
        await page.locator('.actions.on').waitFor({ timeout: 15_000 });
        await page.locator('.actions .act', { hasText: /跟注|全下/ }).first().click();
        // 底牌翻开、胜率出来
        await page.locator('.seat .hand.eq').first().waitFor({ timeout: 8_000 });
        await page.waitForTimeout(250);
        await shot('1-equity');
        const pct = await page.locator('.seat .hand.eq').allTextContents();
        if (pct.length !== 2 || !pct.every((x) => /^胜率 \d+%$/.test(x))) found.push(`胜率标签不对：${pct.join('|')}`);
        // 翻牌后（3 张）胜率变了
        await page.waitForFunction(() => document.querySelectorAll('.card.board:not(.hidden)').length >= 3, null, { timeout: 12_000 });
        await page.waitForTimeout(900);
        const flop = await page.locator('.seat .hand.eq').allTextContents();
        await shot('2-flop');
        if (flop.join() === pct.join()) found.push(`翻牌后胜率没变：${flop.join('|')}`);
        // 转牌：停一下、心跳、慢翻——翻到一半截
        await page.waitForFunction(() => document.querySelectorAll('.card.board:not(.hidden)').length >= 4, null, { timeout: 12_000 });
        await page.waitForTimeout(420);
        await shot('3-turn-flip');
        // 河牌前的悬念：转牌翻完、河牌还没出
        await page.waitForTimeout(1_100);
        await shot('4-before-river');
        await page.waitForFunction(() => document.querySelectorAll('.card.board:not(.hidden)').length >= 5, null, { timeout: 12_000 });
        await page.waitForTimeout(500);
        await shot('5-river-flip');
        // 庆祝
        const big = page.locator('.fx .fx-big');
        await big.waitFor({ timeout: 20_000 });
        await page.waitForTimeout(450);
        await shot('6-celebrate');
        const text = await big.first().textContent();
        const want = kind === 'quads' ? '四条！' : '葫芦！';
        if (text !== want) found.push(`庆祝字应是 ${want}，实际 ${text}`);
        if ((await big.first().evaluate((e) => getComputedStyle(e).pointerEvents)) !== 'none') found.push('庆祝字会拦点按');
        if (kind === 'boat') {
          await page.locator('.fx .fx-beat').waitFor({ timeout: 8_000 });
          await page.waitForTimeout(300);
          await shot('7-badbeat');
        } else if ((await page.locator('.fx .fx-beat').count()) > 0) found.push('四条那手不该有被逆转');
        // 播完、停着：特效节点都收了，结果条在
        await page.locator('.result.on').waitFor({ timeout: 10_000 });
        await page.waitForFunction(() => document.querySelectorAll('.fx .fx-big, .fx .fx-burst, .fx .fx-beat, .fx .fx-coin').length === 0, null, { timeout: 9_000 }).catch(() => found.push('特效节点播完没收'));
        found.push(...(await tableHits(page, `big-${kind}`)));
      } catch (e) {
        found.push(`flow: ${(e as Error).message.split('\n')[0]}`);
      }
      for (const x of errors.splice(before)) found.push(`报错 ${x}`);
      report.push(...found.map((x) => `[${tag}] ${x}`));
      log('big', tag, found.length ? `${found.length} issues` : 'ok');
      await page.close();
    }
    await ctx.close();
  }
  if (report.length) throw new Error(`bigmoments:\n${report.join('\n')}`);
}
