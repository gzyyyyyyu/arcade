/**
 * shot.ts 的护航两条：--escort（娱乐）和 --escortlive（实盘，钱包走假服务端）。局内界面同一套，放一起对照。
 */
import { LIVE_STAKE } from '../src/content/livetable.ts';
import { FakePvp } from './shot-fake.ts';
import { TD_SPEED, layoutProblems, type Hook, type ShotCtx } from './shot-lib.ts';

/** --escort：护航 */
export async function escort(c: ShotCtx): Promise<boolean> {
  const { page, v, ROOT, problems, shot, tap, sceneIs, step, click, ready } = c;
  // 护航：海图的护航卡 → 选图和难度 → 开局 → 停 / 冲 / 修船 / 跟随、造一座塔 → 4 倍速打到结束 → 结算 → 回岛
  const call = <T>(fn: string, ...a: unknown[]): Promise<T> => page.evaluate(([f, args]) => (window as unknown as { __haidao: Record<string, (...x: unknown[]) => unknown> }).__haidao[f as string]!(...(args as unknown[])), [fn, a]) as Promise<T>;
  const pt = (gx: number, gy: number): Promise<{ x: number; y: number }> => call('tdPt', gx, gy);
  const info = (): Promise<NonNullable<ReturnType<NonNullable<Hook['tdInfo']>>>> => call('tdInfo');
  const check = async (what: string): Promise<void> => {
    for (const p of await layoutProblems(page)) problems.push(`${v.name} ${what} ${p}`);
  };
  const paceOn = async (): Promise<string> => (await page.locator('.hd-esc-pbtn.on').first().getAttribute('data-pace')) ?? '';
  const ok =
    (await step('进基地', async () => {
      await page.goto(`${ROOT}?dev`, { timeout: 60_000 });
      await ready();
      await page.evaluate(() => (window as unknown as { __haidao: Hook }).__haidao.dev?.td(5));
      await page.waitForTimeout(900);
      await click('.hd-bottom button:has-text("出海")');
      await page.locator('.hd-esc-card').waitFor({ timeout: 8000 });
      await page.waitForTimeout(500);
      await shot('escort-card');
      await check('海图护航卡');
    })) &&
    (await step('选图选难度', async () => {
      await click('.hd-esc-card');
      await page.locator('.hd-esc-sel').waitFor({ timeout: 8000 });
      await page.waitForTimeout(500);
      if ((await page.locator('.hd-esc-map').count()) < 1) throw new Error('选图页没有图');
      if ((await page.locator('.hd-esc-diff').count()) !== 3) throw new Error('难度不是三档');
      await shot('escort-select');
      await check('护航选图页');
      await click('.hd-esc-diff[data-diff="easy"]');
      await shot('escort-select-easy');
    })) &&
    (await step('开局', async () => {
      await click('.hd-esc-go');
      await sceneIs('td', 40_000);
      await page.waitForTimeout(2500);
      if ((await page.locator('.hd-esc-hull').count()) !== 1) throw new Error('顶栏没有商船血条');
      if ((await page.locator('.hd-esc-pbtn').count()) !== 3) throw new Error('速度钮不是三个');
      if ((await page.locator('.hd-esc-pbtn.on').count()) !== 1) throw new Error('当前档没有高亮');
      await shot('escort-start');
      await check('护航开场');
    })) &&
    (await step('造两座塔', async () => {
      // 开局倒数很快，没塔第一波上岸船就沉了：先造两座塔再点操作钮（造塔时游戏暂停）
      for (let k = 0; k < 2; k++) {
        const inf = await info();
        const si = inf.slots.findIndex((q) => q.tower < 0 && !q.wreck);
        if (si < 0) throw new Error('没有空的木台');
        // 竖屏镜头在跟船，木台的屏幕位置会动：点不开面板就重新取坐标再点（最多 4 次）
        for (let t = 0; t < 4 && !(await page.locator('.hd-td-tower[data-kind="cannon"]').count()); t++) {
          const p = await pt(inf.slots[si]!.x, inf.slots[si]!.y);
          await tap(p.x, p.y);
          await page.waitForTimeout(400);
        }
        if (k === 0) {
          await shot('escort-build-sheet');
          await check('护航造塔面板');
        }
        await click('.hd-td-tower[data-kind="cannon"]');
        await page.waitForTimeout(600);
        if (await page.locator('.hd-td-sheet .hd-x').count()) await click('.hd-td-sheet .hd-x');
      }
    })) &&
    (await step('停冲修船跟随', async () => {
      // 手机竖屏三档并成底栏的船速钮（点一下换下一档，escortcss.ts）；加速、修船、跟随常驻在它上方（.hd-esc-quick）
      const folded = await page.locator('.hd-esc-sum').isVisible();
      const pick = async (p: string): Promise<void> => {
        if (!folded) await click(`.hd-esc-pbtn[data-pace="${p}"]`);
        else for (let i = 0; i < 3 && (await paceOn()) !== p; i++) await click('.hd-esc-sum');
        await page.waitForTimeout(500);
        if ((await paceOn()) !== p) throw new Error(`换到 ${p} 之后高亮没跟过去`);
      };
      await pick('hold');
      await pick('rush');
      if (folded) {
        for (const q of ['.hd-esc-quick .hd-esc-speed', '.hd-esc-quick .hd-esc-mend', '.hd-esc-quick .hd-esc-follow']) {
          if (!(await page.locator(q).isVisible())) throw new Error(`竖屏 ${q} 没常驻`);
        }
      }
      for (const q of await page.locator('.hd-esc-pbtn, .hd-esc-sum, .hd-esc-speed, .hd-esc-mend, .hd-esc-follow').all()) {
        if (!(await q.isVisible())) continue;
        const b = await q.boundingBox();
        if (b && (b.width < 44 || b.height < 44)) problems.push(`${v.name} 护航按钮小于 44：${Math.round(b.width)}×${Math.round(b.height)}`);
      }
      await click('.hd-esc-follow');
      await page.waitForTimeout(300);
      if (await page.locator('.hd-esc-mend:not([disabled])').count()) await click('.hd-esc-mend');
      await pick('sail');
      await shot('escort-controls');
      await check('护航操作钮');
    })) &&
    (await step('开打', async () => {
      await click('.hd-td-call');
      await page.waitForTimeout(3000);
      await shot('escort-fight');
      await check('护航战斗中');
    })) &&
    (await step('打到结束', async () => {
      for (let i = 0; i < 2; i++) await click(TD_SPEED);
      const done = await page.locator('.hd-esc-result').waitFor({ timeout: 300_000 }).then(() => true, () => false);
      if (!done) {
        await click('.hd-td-bar2 button:has-text("撤退")');
        await click('.hd-dialog button:has-text("撤退")');
        await page.locator('.hd-esc-result').waitFor({ timeout: 20_000 });
      }
      await page.waitForTimeout(3200);
      await shot('escort-result');
      await check('护航结算');
      const txt = (await page.locator('.hd-esc-result').textContent()) ?? '';
      if (!/(到港|沉没|误了潮)/.test(txt)) throw new Error(`结算标题不对：${txt}`);
      if (!/\d+%/.test(txt)) throw new Error('结算没有剩余血量百分比');
      if (!/\d 星 · 走了 \d+ 格 · 修了 \d+ 次/.test(txt)) throw new Error(`结算小字不对：${txt}`);
    })) &&
    (await step('回岛', async () => {
      await click('.hd-esc-result button:has-text("回岛")');
      await sceneIs('base');
      await page.waitForTimeout(800);
      await shot('escort-back');
    })) &&
    (await step('减少动效：中途撤退、刷新回基地', async () => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`${ROOT}?dev`, { timeout: 60_000 });
      await ready();
      await page.evaluate(() => (window as unknown as { __haidao: Hook }).__haidao.dev?.td(5));
      await page.waitForTimeout(900);
      await click('.hd-bottom button:has-text("出海")');
      await click('.hd-esc-card');
      await page.locator('.hd-esc-sel').waitFor({ timeout: 8000 });
      await click('.hd-esc-go');
      await sceneIs('td', 40_000);
      await page.waitForTimeout(1500);
      await click('.hd-td-bar2 button:has-text("撤退")');
      await click('.hd-dialog button:has-text("撤退")');
      await page.locator('.hd-esc-result').waitFor({ timeout: 20_000 });
      await page.waitForTimeout(3200);
      await shot('escort-retreat-result');
      await check('护航撤退结算（减少动效）');
      await page.reload({ timeout: 60_000 });
      await ready();
      await sceneIs('base');
      await shot('escort-reload-base');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    }));
  return ok;
}

/** --escortlive：护航实盘 */
export async function escortLive(c: ShotCtx): Promise<boolean> {
  const { page, v, ROOT, problems, shot, tap, sceneIs, step, click, ready } = c;
  // 护航实盘：海图护航卡 → 选图页「实盘」→ 选档 → 带入 → 造塔、叫波 → 打完（或到时撤退）→ 结算 → 回岛
  const fake = new FakePvp();
  await fake.seed();
  await fake.route(page, problems);
  const call = <T>(fn: string, ...a: unknown[]): Promise<T> => page.evaluate(([f, args]) => (window as unknown as { __haidao: Record<string, (...x: unknown[]) => unknown> }).__haidao[f as string]!(...(args as unknown[])), [fn, a]) as Promise<T>;
  const pt = (gx: number, gy: number): Promise<{ x: number; y: number }> => call('tdPt', gx, gy);
  const info = (): Promise<NonNullable<ReturnType<NonNullable<Hook['tdInfo']>>>> => call('tdInfo');
  const check = async (what: string): Promise<void> => {
    for (const p of await layoutProblems(page)) problems.push(`${v.name} ${what} ${p}`);
  };
  const stake = LIVE_STAKE.small;
  const ok =
    (await step('护航选图页的实盘钮', async () => {
      await page.goto(`${ROOT}?dev&fast`, { timeout: 60_000 });
      await ready();
      await page.evaluate(() => (window as unknown as { __haidao: Hook }).__haidao.dev?.td(3));
      await page.waitForTimeout(900);
      await click('.hd-bottom button:has-text("出海")');
      await page.locator('.hd-esc-card').waitFor({ timeout: 8000 });
      await click('.hd-esc-card');
      await page.locator('.hd-esc-live').waitFor({ timeout: 8000 });
      await page.waitForTimeout(500);
      await shot('escortlive-select');
      await check('护航选图页');
    })) &&
    (await step('护航实盘选档', async () => {
      await click('.hd-esc-live');
      await page.locator('.hd-live-card button[data-tier="small"]').waitFor({ timeout: 8000 });
      await page.waitForTimeout(700);
      await shot('escortlive-tiers');
      await check('护航实盘选档');
      const txt = (await page.locator('.hd-live-tiers').textContent()) ?? '';
      if (!/今天还能护 \d+ 场/.test(txt)) throw new Error(`选档页没写今天还剩几场：${txt}`);
      if (!/最多赢 .*最多输/.test(txt)) throw new Error('选档卡没写最多赢 / 最多输');
    })) &&
    (await step('带入开护', async () => {
      await click('.hd-live-card button[data-tier="small"]');
      const go = page.locator('.hd-dialog .hd-btn-gold', { hasText: '确定开护' }).last();
      await go.waitFor({ timeout: 8000 });
      await go.click({ timeout: 8000 });
      await sceneIs('td', 40_000);
      if (fake.bank.balance !== 10_000 - stake) throw new Error(`带入后钱包余额不对：${fake.bank.balance}`);
      await page.waitForTimeout(2000);
      if ((await page.locator('.hd-esc-hull').count()) !== 1) throw new Error('顶栏没有商船血条');
      await shot('escortlive-start');
      await check('护航实盘开场');
    })) &&
    (await step('造塔叫波', async () => {
      for (let k = 0; k < 2; k++) {
        const inf = await info();
        const si = inf.slots.findIndex((q) => q.tower < 0 && !q.wreck);
        if (si < 0) throw new Error('没有空的木台');
        for (let t = 0; t < 4 && !(await page.locator('.hd-td-tower[data-kind="cannon"]').count()); t++) {
          const p = await pt(inf.slots[si]!.x, inf.slots[si]!.y);
          await tap(p.x, p.y);
          await page.waitForTimeout(400);
        }
        await click('.hd-td-tower[data-kind="cannon"]');
        await page.waitForTimeout(600);
        if (await page.locator('.hd-td-sheet .hd-x').count()) await click('.hd-td-sheet .hd-x');
      }
      await click('.hd-esc-pbtn[data-pace="sail"]');
      await click('.hd-td-call');
      await page.waitForTimeout(3000);
      await shot('escortlive-fight');
      await check('护航实盘战斗中');
    })) &&
    (await step('打完或撤退后结算', async () => {
      for (let i = 0; i < 2; i++) await click(TD_SPEED);
      const done = await page.locator('.hd-live button:has-text("回岛")').waitFor({ timeout: 150_000 }).then(() => true, () => false);
      if (!done) {
        // 撤退：按走过的格数折算
        await click('.hd-td-bar2 button:has-text("撤退")');
        const t = await page.locator('.hd-dialog', { hasText: '按已经走过的路结回筹码' }).count();
        if (!t) throw new Error('撤退确认没写按走过的路结回筹码');
        await click('.hd-dialog button:has-text("撤退")');
        await page.locator('.hd-live button:has-text("回岛")').waitFor({ timeout: 20_000 });
      }
      await page.waitForTimeout(600);
      await shot('escortlive-result');
      await check('护航实盘结算');
      const txt = (await page.locator('.hd-live').last().textContent()) ?? '';
      if (!/(到港|沉没|误了潮)/.test(txt)) throw new Error(`结算标题不对：${txt}`);
      if (!/商船剩余血量 \d+% · 走了 \d+\/\d+ 格/.test(txt)) throw new Error(`结算没写船血和格数：${txt}`);
      if (!/拿回带入的 \d+%/.test(txt)) throw new Error('结算没写拿回带入的几成');
      const set = fake.bank.calls.filter((c) => c.m === 'settle');
      if (set.length !== 1 || !String(set[0]!.a.ref).startsWith('he-')) throw new Error('钱包里没有一次 he- 前缀的结回');
      if ((await page.locator('.hd-live-net').count()) === 0) throw new Error('结算页没有显示赢 / 输多少筹码');
      const save = await page.evaluate(() => localStorage.getItem('haidao.save') ?? '');
      if (/"escort":\{"stars":\{"[^}]+\d/.test(save)) throw new Error('实盘不该记护航星数');
    })) &&
    (await step('回岛', async () => {
      await click('.hd-live button:has-text("回岛")');
      await sceneIs('base');
      await page.waitForTimeout(800);
      await shot('escortlive-home');
    }));
  return ok;
}
