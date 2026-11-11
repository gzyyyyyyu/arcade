/**
 * 冒烟分段：frames（npm run smoke -- --only=frames，不在全量里）。动效逐帧看：关掉自动化标记让动效照真人浏览器播，
 * 一出现动画就全部暂停，按进度 0、25%、50%、75%、100% 各截一张，拼成一行写进 frames-<名字>-<尺寸>.png。
 * 截图要真等，靠时间截会截不到短动效（无头浏览器一秒只有几帧）；暂停后拨 currentTime 截出来的是那一刻的样子。
 * 只截图不判对错，看图的人列问题。
 */
import type { Browser, Page } from 'playwright-core';
import { writeFileSync } from 'node:fs';
import { BASE, check, json, newPage, OUT, type Screen } from '../lib/core.ts';
import { FAKE_USER, FAKE_WALLET, mockSession } from '../lib/fakes.ts';

const STEPS = [0, 0.25, 0.5, 0.75, 1];

/** 页面里正在播的动画全部暂停，拨到同一个进度（按各自的总长算），截一张 */
async function strip(page: Page, name: string): Promise<void> {
  const shots: Buffer[] = [];
  for (const k of STEPS) {
    await page.evaluate((k) => {
      for (const a of document.getAnimations()) {
        a.pause();
        const end = Number(a.effect?.getComputedTiming().endTime ?? 0);
        // 一直转的（骨架屏闪光、加载圈）没有终点，停在原地
        if (Number.isFinite(end)) a.currentTime = end * k;
      }
    }, k);
    shots.push(await page.screenshot());
  }
  // 拼成一行：浏览器里画，省得多装图片库
  const html = `<body style="margin:0;display:flex;gap:6px;background:#888">${shots.map((b, i) => `<figure style="margin:0"><figcaption style="font:14px sans-serif;color:#fff">${STEPS[i]! * 100}%</figcaption><img style="display:block;width:${100 / STEPS.length}vw;max-width:640px" src="data:image/png;base64,${b.toString('base64')}"></figure>`).join('')}</body>`;
  const sheet = await page.context().browser()!.newPage({ viewport: { width: 1600, height: 600 } });
  await sheet.setContent(html);
  await sheet.screenshot({ path: `${OUT}/frames-${name}.png`, fullPage: true });
  await sheet.close();
}

/** 等到有动画在播（最多 2 秒），立刻全部暂停 */
async function catchMotion(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((done) => {
        const t0 = performance.now();
        const look = () => {
          const all = document.getAnimations().filter((a) => a.playState === 'running');
          if (all.length || performance.now() - t0 > 2_000) {
            for (const a of all) a.pause();
            done(all.length);
          } else requestAnimationFrame(look);
        };
        look();
      }),
  );
}

async function open(browser: Browser, screen: Screen): Promise<Page> {
  const { page } = await newPage(browser, `逐帧 ${screen}`, screen);
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  return page;
}

export async function motionFrames(browser: Browser): Promise<void> {
  const names = ['老王的徒弟', '小明', '某人'];
  const board = { entries: names.map((n, i) => ({ rank: i + 1, userId: String.fromCharCode(65 + i).repeat(22), displayName: n, avatar: null, value: 50_000 - i * 4_000, isMe: i === 2 })), me: { rank: 3, value: 42_000 } };
  for (const screen of ['desktop', 'portrait'] as const) {
    const page = await open(browser, screen);
    await mockSession(page, { wallet: { ...FAKE_WALLET, wallet: { ...FAKE_WALLET.wallet, balance: 800, canRelief: true, fresh: false } } });
    await page.route('**/api/leaderboard?scope=*', (r) => r.fulfill(json({ week: '2026-10-26', daily: {}, boards: { total: board } })));
    await page.route('**/api/stats/me', (r) => r.fulfill(json({ user: { userId: FAKE_USER.id, displayName: FAKE_USER.displayName, avatar: null }, relation: 'self', week: '2026-10-26', games: { texas: { n: 30, net: 9_000, wnet: 2_000, rounds: 300, wins: 120, best: 9_000, titles: [], max: {}, sum: {} } } })));
    await page.route('**/api/friends', (r) => r.fulfill(json({ friends: [], incoming: [], outgoing: [] })));
    await page.route('**/api/blocks', (r) => r.fulfill(json({ blocks: [] })));
    await page.route('**/api/wallet/relief', (r) => r.fulfill(json({ ...FAKE_WALLET, wallet: { ...FAKE_WALLET.wallet, balance: 2_000, canRelief: false, fresh: false } })));
    const runs: [string, () => Promise<void>][] = [
      ['lobby', () => page.goto(`${BASE}/`).then(() => undefined)],
      ['podium', () => page.goto(`${BASE}/boards`).then(() => undefined)],
      // 徽章第一次看到只记不演：先看一次，再把记录调低一档，第二次进来演"新拿到"
      ['badges', async () => {
        await page.goto(`${BASE}/me/stats`);
        await page.waitForTimeout(800);
        await page.evaluate(() => {
          for (const k of Object.keys(localStorage)) if (k.startsWith('arcade.badgesSeen.')) localStorage.setItem(k, '{}');
        });
        await page.goto(`${BASE}/me/stats`);
      }],
      ['relief', async () => {
        await page.goto(`${BASE}/wallet`);
        await page.getByRole('button', { name: '领补给' }).click();
      }],
      ['modal-or-page', async () => {
        await page.goto(`${BASE}/`);
        await page.waitForTimeout(800);
        if (screen === 'desktop') await page.keyboard.press('?');
        else await page.getByRole('link', { name: '好友' }).first().click(); // 手机没有快捷键：看换页的进场

      }],
    ];
    await badgeReveal(page, screen);
    for (const [name, go] of runs) {
      await go();
      const n = await catchMotion(page);
      console.log(`  逐帧 ${name}（${screen}）：${n} 个动画`);
      if (n) await strip(page, `${name}-${screen}`);
      await page.evaluate(() => {
        for (const a of document.getAnimations()) {
          try {
            a.finish();
          } catch {
            a.cancel(); // 没有终点的动画 finish 会抛错
          }
        }
      });
    }
    await page.context().close();
  }
}

/** 两张截图有多少像素明显不同（0–1）：在浏览器里画到画布上逐像素比，省得装图片库 */
async function diffRatio(page: Page, a: Buffer, b: Buffer): Promise<number> {
  const p = await page.context().browser()!.newPage();
  const r = await p.evaluate(
    async ([a, b]) => {
      const load = (src: string) =>
        new Promise<HTMLImageElement>((ok) => {
          const img = new Image();
          img.onload = () => ok(img);
          img.src = `data:image/png;base64,${src}`;
        });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const w = Math.min(ia.width, ib.width);
      const h = Math.min(ia.height, ib.height);
      const px = (img: HTMLImageElement) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const g = c.getContext('2d')!;
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, w, h).data;
      };
      const [da, db] = [px(ia), px(ib)];
      let n = 0;
      for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i]! - db[i]!) + Math.abs(da[i + 1]! - db[i + 1]!) + Math.abs(da[i + 2]! - db[i + 2]!) > 24) n++;
      return n / (w * h);
    },
    [a.toString('base64'), b.toString('base64')] as const,
  );
  await p.close();
  return r;
}

/**
 * 战绩页新拿到的徽章亮相（badges.css 的 badges-flip 翻面 + badges-sweep 扫光）：把记录清成"什么都没看过"再进来，
 * 等到 .badge--fx 出现就把这一枚身上的动画全部暂停，按同一条时间线逐档拨（各自到头就停在最后），只截这一枚。
 * 判定：除了最后一段缓出收尾，相邻两帧都不一样（真在动，不是截到静止的）；最后一帧和动画撤掉后的静止样子一样（落位准确，不跳一下）。
 */
async function badgeReveal(page: Page, screen: Screen): Promise<void> {
  await page.goto(`${BASE}/me/stats`);
  await page.getByTestId('badges').waitFor();
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('arcade.badgesSeen.')) localStorage.setItem(k, '{}');
  });
  await page.goto(`${BASE}/me/stats`);
  const el = page.locator('.badge--fx').first();
  await el.waitFor({ timeout: 3_000 });
  const info = await el.evaluate((b) => {
    const all = b.getAnimations({ subtree: true });
    for (const a of all) a.pause();
    const names = all.map((a) => (a as CSSAnimation).animationName ?? 'js');
    const end = Math.max(...all.map((a) => Number(a.effect?.getComputedTiming().endTime ?? 0)));
    (window as unknown as { __rev: Animation[] }).__rev = all;
    return { names, end };
  });
  check(info.names.includes('badges-flip'), `徽章亮相没有翻面动画：${info.names.join('、')}`);
  const box = (await el.boundingBox())!;
  const clip = { x: Math.max(0, box.x - 12), y: Math.max(0, box.y - 12), width: box.width + 24, height: box.height + 24 };
  const steps = 9;
  const frames: Buffer[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (info.end * i) / (steps - 1);
    await page.evaluate((t) => {
      for (const a of (window as unknown as { __rev: Animation[] }).__rev) {
        const end = Number(a.effect?.getComputedTiming().endTime ?? 0);
        a.currentTime = Math.min(t, end);
      }
    }, t);
    frames.push(await page.screenshot({ clip }));
  }
  // 静止的样子：动画撤掉（cancel 以后元素按没有动画的样式画）
  await page.evaluate(() => {
    for (const a of (window as unknown as { __rev: Animation[] }).__rev) a.cancel();
  });
  const rest = await page.screenshot({ clip });
  const steps2: number[] = [];
  for (let i = 1; i < frames.length; i++) steps2.push(await diffRatio(page, frames[i - 1]!, frames[i]!));
  const toRest = await diffRatio(page, frames.at(-1)!, rest);
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const report = [
    `徽章亮相（${screen}）：动画 ${info.names.join('、')}，总长 ${Math.round(info.end)}ms，截 ${steps} 帧`,
    `相邻两帧不同的像素：${steps2.map(pct).join(' / ')}`,
    `最后一帧和静止态不同的像素：${pct(toRest)}`,
  ];
  console.log(`  ${report.join('\n  ')}`);
  writeFileSync(`${OUT}/badge-reveal-${screen}.txt`, report.join('\n') + '\n');
  // 拼一行给人看：9 帧 + 静止态
  const all = [...frames, rest];
  const html = `<body style="margin:0;display:flex;gap:6px;background:#888">${all.map((b, i) => `<figure style="margin:0"><figcaption style="font:12px sans-serif;color:#fff">${i < steps ? `${Math.round((info.end * i) / (steps - 1))}ms` : '静止'}</figcaption><img style="display:block" src="data:image/png;base64,${b.toString('base64')}"></figure>`).join('')}</body>`;
  const sheet = await page.context().browser()!.newPage({ viewport: { width: 1600, height: 400 } });
  await sheet.setContent(html);
  await sheet.screenshot({ path: `${OUT}/frames-badge-reveal-${screen}.png`, fullPage: true });
  await sheet.close();
  // 最后一段是缓出收尾（扫光淡到 0、落回静止），本来就几乎不动；它之前每一段都要真在动
  check(steps2.slice(0, -1).every((x) => x > 0.005), `徽章亮相中途有两帧几乎一样（没在动？）：${steps2.map(pct).join(' / ')}`);
  check(toRest < 0.01, `徽章亮相最后一帧和静止态差 ${pct(toRest)}（落位会跳一下）`);
}
