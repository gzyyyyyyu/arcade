/**
 * shot.ts 的寻宝航线两条：--map（每日航线，交分拦下核对；电脑那一遍录终局演出）和 --maplive（航线实盘，中途刷新接着跑）。
 * 航线图、站间条、登陆战的点法相同，改航线界面时一起对照着改。
 */
import { join } from 'node:path';
import type { Route } from 'playwright-core';
import { newProfile } from '../src/core/index.ts';
import { MAP_LIVE_TIERS } from '../src/core/maplive.ts';
import { opt } from './args.ts';
import { FakePvp } from './shot-fake.ts';
import { recordFixed } from './record.ts';
import { layoutProblems, type ShotCtx } from './shot-lib.ts';

/** --map：寻宝航线 */
export async function map(c: ShotCtx): Promise<boolean> {
  const { page, v, OUT, ROOT, problems, shot, tap, sceneIs, step, click, where, beach, ready } = c;
  const fake = new FakePvp();
  await fake.seed();
  await fake.route(page, problems);
  const scoreBodies: Array<{ gameId?: string; boardId?: string; score?: number }> = [];
  await page.route((u) => u.pathname === '/api/scores', async (r: Route) => {
    scoreBodies.push(JSON.parse(r.request().postData() ?? 'null'));
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ best: 4321, improved: true }) });
  });
  const save = JSON.stringify({ profile: { ...newProfile(), tutorial: 99, res: { gold: 1500, wood: 1500 }, stats: { attacks: 1, wins: 1, lootGold: 0, lootWood: 0 } }, lastSeen: Date.now() });
  await page.addInitScript((sv) => {
    if (!localStorage.getItem('haidao.save')) localStorage.setItem('haidao.save', sv);
  }, save);
  const check = async (what: string): Promise<void> => {
    for (const p of await layoutProblems(page)) problems.push(`${v.name} ${what} ${p}`);
  };
  const isDesk = !v.hasTouch;
  const recDir = opt('--rec-out') ?? OUT;
  let recorded = false;
  let stops = 0;
  let reefs = 0;
  const ok =
    (await step('今日航线卡', async () => {
      await page.goto(`${ROOT}?fast`, { timeout: 60_000 });
      await ready();
      await page.waitForTimeout(800);
      await click('.hd-bottom button:has-text("出海")');
      await page.locator('.hd-mapcard:not(.hd-esc-card)').waitFor({ timeout: 8000 });
      await page.waitForTimeout(500);
      await shot('map-card');
      await check('海图');
      await click('.hd-mapcard:not(.hd-esc-card)');
      await page.locator('.hd-route .hd-route-node.cur').first().waitFor({ timeout: 8000 });
      await page.waitForTimeout(600);
      await shot('route');
      await check('航线图');
      // 船队一行（船多时换行）：每张卡都完整在屏内
      const out = await page.evaluate(() => [...document.querySelectorAll('.hd-route-crew, .hd-route-energy')].filter((e) => { const r = e.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth || r.width === 0; }).length);
      if (out) throw new Error(`船队有 ${out} 张卡出屏`);
      if (isDesk) {
        // 电脑悬停：节点卡放大高亮
        await page.locator('.hd-route-node.cur').first().hover();
        await page.waitForTimeout(350);
        await shot('route-hover');
      }
    })) &&
    (await step('走航线', async () => {
      for (let guard = 0; guard < 8; guard++) {
        if (await page.locator('.hd-route-end').count()) break;
        await page.locator('.hd-route .hd-route-node.cur').first().waitFor({ timeout: 15_000 });
        await page.waitForTimeout(400);
        const cur = page.locator('.hd-route-node.cur');
        const n = await cur.count();
        const reefAt = await cur.evaluateAll((els) => els.findIndex((e) => e.classList.contains('reef')));
        // 有补给礁就走一次补给礁，其余打岛
        const pickReef = reefAt >= 0 && reefs === 0;
        const idx = pickReef ? reefAt : reefAt === 0 && n > 1 ? 1 : 0;
        if (isDesk && stops === 1 && n > 1) await page.keyboard.press(`Digit${idx + 1}`);
        else await cur.nth(idx).click({ timeout: 8000 });
        await page.waitForTimeout(500);
        if (pickReef) {
          reefs++;
          await shot('reef');
          await check('补给礁');
          await click('.hd-route-pick');
          await page.waitForTimeout(1800);
          await shot('reef-done');
          continue;
        }
        if (stops === 0 || stops === 1) {
          // 第二站休整一条船
          if (stops === 1) {
            const rb = page.locator('.hd-route-restbtn:not(:disabled)');
            if (await rb.count()) await rb.first().click();
            await page.waitForTimeout(300);
          }
          await shot(`prep-${stops + 1}`);
          await check('整备');
        }
        if (isDesk && stops === 1) await page.keyboard.press('Enter');
        else await click('.hd-route-bottom button:has-text("出发")');
        await sceneIs('battle', 40_000);
        stops++;
        await page.waitForTimeout(600);
        if (stops === 1) await shot('stop-intro');
        // 收起开场的射程提示
        const vp = page.viewportSize()!;
        await tap(vp.width / 2, vp.height / 2);
        await page.waitForTimeout(400);
        // 终点站留一条船不登陆：船队不会全灭，终局走"打下终点"的宝箱演出（录像要它）
        const last = /第 4\/4 站/.test((await page.locator('.hd-mapstrip').textContent()) ?? '');
        const boats = await page.locator('.hd-boat').count();
        for (let i = 0; i < boats + 2; i++) {
          const left = await page.locator('.hd-boat:not(.done)').count();
          if (left === 0 || (last && left <= 1)) break;
          if ((await page.locator('.hd-boat.sel').count()) === 0) await click('.hd-boat:not(.done)');
          await page.waitForTimeout(200);
          const bp = await beach(i % 2);
          if (!bp) throw new Error('没有海滩点');
          await tap(bp.x, bp.y);
          await page.waitForTimeout(300);
        }
        const sk = page.locator('.hd-skill:not(.off)');
        if (await sk.count()) {
          await sk.first().click({ timeout: 5000 });
          const h = await where('hq');
          if (h) await tap(h.x, h.y);
        }
        await page.waitForTimeout(2500);
        if (stops <= 2) {
          await shot(`stop-${stops}`);
          await check('航线站');
          if (!/第 \d\/4 站/.test((await page.locator('.hd-mapstrip').textContent()) ?? '')) throw new Error('顶栏没有"第 N/4 站"');
        }
        await page.locator('.hd-route-mid').waitFor({ timeout: 90_000 });
        await page.locator('.hd-route-mid .hd-row.on').waitFor({ timeout: 15_000 });
        await page.waitForTimeout(200);
        await shot(`mid-${stops}`);
        await check('站间条');
        if (await page.locator('.hd-route-mid button:has-text("继续")').count()) {
          await click('.hd-route-mid button:has-text("继续")');
          await sceneIs('base', 30_000);
          await page.waitForTimeout(900);
          if (stops === 1) await shot('route-after');
        } else {
          // 最后一站（或船队打光）：从这里起录终局演出
          if (v.name === 'desktop' && !recorded) {
            recorded = true;
            const fr = await recordFixed(page, recDir, 'map-final', 420, { w: 1, h: 1 }, async () => (await page.locator('.hd-route-result').count()) > 0, 30);
            console.log(`录了终局演出 ${fr} 帧：${join(recDir, 'map-final.webm')}`);
          } else {
            await page.locator('.hd-route-end').waitFor({ timeout: 15_000 });
            await page.waitForTimeout(1700);
            await shot('final-show');
          }
          break;
        }
      }
    })) &&
    (await step('结算交榜', async () => {
      await page.locator('.hd-route-result').waitFor({ timeout: 30_000 });
      await shot('final-result');
      await check('航线结算');
      const txt = (await page.locator('.hd-route-result').textContent()) ?? '';
      if (!/宝分 [\d,]+/.test(txt)) throw new Error(`结算没有宝分：${txt}`);
      const loc = await page.evaluate(() => localStorage.getItem('haidao.map'));
      const best = (JSON.parse(loc ?? '{}') as { best?: number; state?: unknown }).best ?? -1;
      if (best < 0 || (JSON.parse(loc ?? '{}') as { state?: unknown }).state) throw new Error(`haidao.map 不对：${loc}`);
      if (best > 0) {
        if (scoreBodies.length !== 1) throw new Error(`交分次数不对：${scoreBodies.length}`);
        const b = scoreBodies[0]!;
        if (b.gameId !== 'haidao' || !/^daily-\d{4}-\d{2}-\d{2}-map$/.test(b.boardId ?? '') || b.score !== best) throw new Error(`交分请求体不对：${JSON.stringify(b)}`);
      } else if (scoreBodies.length) throw new Error('0 宝分不该交榜');
      console.log(`${v.name}：打了 ${stops} 站、补给礁 ${reefs} 次，宝分 ${best}，交分 ${JSON.stringify(scoreBodies)}`);
    })) &&
    (await step('分享', async () => {
      await click('.hd-route-share');
      const close = page.locator('[data-key="share:close"]');
      await close.waitFor({ timeout: 10_000 });
      await page.waitForTimeout(600);
      await shot('share');
      await close.click();
      await page.waitForTimeout(300);
    })) &&
    (await step('回岛', async () => {
      await click('.hd-route-result button:has-text("回岛")');
      await sceneIs('base');
      await page.waitForTimeout(800);
      if (await page.locator('.hd-route, .hd-route-end').count()) throw new Error('航线界面没收起');
      await shot('map-home');
    }));
  return ok;
}

/** --maplive：航线实盘 */
export async function mapLive(c: ShotCtx): Promise<boolean> {
  const { page, v, ROOT, problems, shot, tap, sceneIs, step, click, beach, ready } = c;
  // 航线实盘：海图「今日航线」旁的「实盘」→ 选档 → 带入 → 打一站 → 刷新页面 → 接着跑 → 收航 → 结算 → 回家
  const fake = new FakePvp();
  await fake.seed();
  await fake.route(page, problems);
  const scoreBodies: unknown[] = [];
  await page.route((u) => u.pathname === '/api/scores', async (r: Route) => {
    scoreBodies.push(JSON.parse(r.request().postData() ?? 'null'));
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ best: 1, improved: true }) });
  });
  const save = JSON.stringify({ profile: { ...newProfile(), tutorial: 99, res: { gold: 1500, wood: 1500 }, stats: { attacks: 1, wins: 1, lootGold: 0, lootWood: 0 } }, lastSeen: Date.now() });
  await page.addInitScript((sv) => {
    if (!localStorage.getItem('haidao.save')) localStorage.setItem('haidao.save', sv);
  }, save);
  const check = async (what: string): Promise<void> => {
    for (const p of await layoutProblems(page)) problems.push(`${v.name} ${what} ${p}`);
  };
  const stake = MAP_LIVE_TIERS.small.stake;
  const openTiers = async (): Promise<void> => {
    await click('.hd-bottom button:has-text("出海")');
    await page.locator('.hd-mapchip').waitFor({ timeout: 8000 });
    await page.waitForTimeout(500);
  };
  const ok =
    (await step('海图上的实盘钮', async () => {
      await page.goto(`${ROOT}?fast`, { timeout: 60_000 });
      await ready();
      await page.waitForTimeout(800);
      await openTiers();
      await shot('maplive-card');
      await check('海图（今日航线 + 实盘）');
    })) &&
    (await step('航线实盘选档', async () => {
      await click('.hd-mapchip');
      await page.locator('.hd-live-card button[data-tier="small"]').waitFor({ timeout: 8000 });
      await page.waitForTimeout(700);
      await shot('maplive-tiers');
      await check('航线实盘选档');
      const txt = (await page.locator('.hd-live-tiers').textContent()) ?? '';
      if (!/今天还能跑 \d+ 趟/.test(txt)) throw new Error(`选档页没写今天还剩几趟：${txt}`);
      if (!/同一条航线，档越高结回越少/.test(txt)) throw new Error('选档卡没写同一条航线');
      if (/电脑/.test(txt)) throw new Error('航线选档卡不该写电脑★');
    })) &&
    (await step('带入出航', async () => {
      await click('.hd-live-card button[data-tier="small"]');
      const go = page.locator('.hd-dialog .hd-btn-gold', { hasText: '确定出航' }).last();
      await go.waitFor({ timeout: 8000 });
      await go.click({ timeout: 8000 });
      await page.locator('.hd-route .hd-route-node.cur').first().waitFor({ timeout: 15_000 });
      if (fake.bank.balance !== 10_000 - stake) throw new Error(`带入后钱包余额不对：${fake.bank.balance}`);
      await page.waitForTimeout(700);
      await shot('maplive-route');
      await check('航线实盘航线图');
      if (!/实盘/.test((await page.locator('.hd-route-title').textContent()) ?? '')) throw new Error('航线页没标实盘');
    })) &&
    (await step('打一站', async () => {
      const cur = page.locator('.hd-route-node.cur');
      const reefAt = await cur.evaluateAll((els) => els.findIndex((e) => e.classList.contains('reef')));
      await cur.nth(reefAt === 0 ? 1 : 0).click({ timeout: 8000 });
      await page.waitForTimeout(500);
      await click('.hd-route-bottom button:has-text("出发")');
      await sceneIs('battle', 40_000);
      await page.waitForTimeout(600);
      const vp = page.viewportSize()!;
      await tap(vp.width / 2, vp.height / 2);
      await page.waitForTimeout(400);
      const boats = await page.locator('.hd-boat').count();
      for (let i = 0; i < boats + 2; i++) {
        if ((await page.locator('.hd-boat:not(.done)').count()) === 0) break;
        if ((await page.locator('.hd-boat.sel').count()) === 0) {
          // 手机竖屏有的船队第一张卡被技能钮压住一角，点不到就直接触发它的 click
          await click('.hd-boat:not(.done)').catch(() => page.locator('.hd-boat:not(.done)').first().evaluate((e) => (e as HTMLElement).click()));
        }
        await page.waitForTimeout(200);
        const bp = await beach(i % 2);
        if (!bp) throw new Error('没有海滩点');
        await tap(bp.x, bp.y);
        await page.waitForTimeout(300);
      }
      await page.locator('.hd-route-mid').waitFor({ timeout: 120_000 });
      await page.locator('.hd-route-mid .hd-row.on').waitFor({ timeout: 15_000 });
      await check('航线实盘站间条');
      await click('.hd-route-mid button:has-text("继续")');
      await sceneIs('base', 30_000);
      await page.waitForTimeout(900);
      const run = await page.evaluate(() => localStorage.getItem('haidao.maplive.run'));
      if (!run || !/"state"/.test(run)) throw new Error('haidao.maplive.run 没存进度');
      if (await page.evaluate(() => localStorage.getItem('haidao.map'))) throw new Error('实盘不该写娱乐的 haidao.map');
    })) &&
    (await step('刷新后接着跑', async () => {
      await page.reload({ timeout: 60_000 });
      await ready();
      await page.waitForTimeout(800);
      await openTiers();
      await click('.hd-mapchip');
      const resume = page.locator('.hd-live-tiers button:has-text("接着跑")');
      await resume.waitFor({ timeout: 8000 });
      await page.waitForTimeout(500);
      await shot('maplive-resume');
      await check('航线实盘接着跑');
      await resume.click();
      await page.locator('.hd-route .hd-route-node.cur').first().waitFor({ timeout: 15_000 });
      await page.waitForTimeout(500);
      await check('航线实盘接着跑的航线图');
    })) &&
    (await step('收航结算', async () => {
      await click('.hd-route-bottom button:has-text("收航")');
      await click('.hd-dialog button:has-text("收航")');
      await page.locator('.hd-route-result').waitFor({ timeout: 40_000 });
      await page.waitForTimeout(3200);
      await shot('maplive-result');
      await check('航线实盘结算');
      const txt = (await page.locator('.hd-route-result').textContent()) ?? '';
      if (!/拿回带入的 \d+%/.test(txt)) throw new Error(`结算没写拿回带入的几成：${txt}`);
      await page.locator('.hd-live-net.hd-pos, .hd-live-net.hd-neg').waitFor({ timeout: 8000 });
      if (/今天最好|新纪录/.test(txt)) throw new Error('实盘结算不该写今天最好');
      const set = fake.bank.calls.filter((c) => c.m === 'settle');
      if (set.length !== 1 || !String(set[0]!.a.ref).startsWith('hm-')) throw new Error('钱包里没有一次 hm- 前缀的结回');
      if (scoreBodies.length) throw new Error(`实盘不该交榜：${JSON.stringify(scoreBodies)}`);
      if (await page.evaluate(() => localStorage.getItem('haidao.maplive.run'))) throw new Error('结算后 haidao.maplive.run 没清掉');
      if (await page.evaluate(() => localStorage.getItem('haidao.map'))) throw new Error('实盘不该写娱乐的 haidao.map');
    })) &&
    (await step('回岛', async () => {
      await click('.hd-route-result button:has-text("回岛")');
      await sceneIs('base');
      await page.waitForTimeout(800);
      if (await page.locator('.hd-route, .hd-route-end').count()) throw new Error('航线界面没收起');
    }));
  return ok;
}
