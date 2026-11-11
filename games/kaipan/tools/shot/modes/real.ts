// --real 模式：0.4 重做的真实行情（挑选行情、交易日、"这段日子"、结束页、图鉴行情段、加载失败退回合成行情）
import type { Browser } from 'playwright-core';
import { dispatch, isBusy, rngFor, type Action, type GameState } from '../../../src/core/index.ts';
import { botByName } from '../../bots.ts';
import { click, controls, dialogOpen, dispatch2, dispatchNoWait, errors, expect, loadState, notes, openPage, openStory, shot, waitIdle } from '../harness.ts';

// ---------------------------------------------------------------- 0.4 重做：真实行情

/**
 * 真实行情流程：开始菜单开新局（"正在挑选行情……"）→ 交易日 → 玩到通关或失败（中段在 node 里用机器人推进）
 * → 揭晓页 → 结束页 → 图鉴"行情段"；另有一条行情加载失败、退回合成行情的流程。截图名 rN-*。
 */
export async function realShots(browser: Browser): Promise<void> {
  {
    const ctx = await openPage(browser, 'real', 'anim=0');
    // 让行情目录晚一点到，截到"正在挑选行情……"
    await ctx.page.route('**/data/segments/index.json', async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    const seed = 'real-demo-3';
    const r = await ctx.page.evaluate((sd) => window.__game?.newRun(sd, { persona: 'newbie', difficulty: 1 }) ?? { error: '无' }, seed);
    expect(!r.error, `newRun 失败：${r.error}`);
    await ctx.page.waitForTimeout(500);
    await shot(ctx, 'r1-loading');
    await waitIdle(ctx, '真实行情开局', `window.__game.scene === 'trade'`);
    await ctx.page.waitForTimeout(400);
    let st = (await ctx.page.evaluate(() => window.__game?.state())) as GameState;
    expect(!!st.real, '开局应该用上真实行情段');
    const segId = st.real?.segId ?? '';
    notes.push(`真实行情：种子 ${seed} 抽到 ${segId}（${st.real?.from}–${st.real?.to}，${st.real?.regime}）`);
    await shot(ctx, 'r2-trade-day1');
    const body = await ctx.page.evaluate(() => document.body.innerText);
    expect(!/(19|20)\d\d 年/.test(body), '玩的时候页面上不该出现年份');
    // 前 3 天在画面里玩：机器人在 node 里决定操作，画面执行
    const bot = botByName('normal')();
    const rng = rngFor(seed, 'shot-bot');
    for (let k = 0; k < 40 && st.dayIndex < 3; k++) {
      const a = bot.act(st, rng);
      await dispatch2(ctx, isBusy(st) && (a.type === 'buy' || a.type === 'sell') ? { type: 'open' } : a);
      st = (await ctx.page.evaluate(() => window.__game?.state())) as GameState;
    }
    await shot(ctx, 'r3-trade-day4');
    // 中段在 node 里推进到最后一步之前，再交给画面
    let s = structuredClone(st);
    let last: Action | null = null;
    for (let k = 0; k < 3000 && s.phase !== 'won' && s.phase !== 'lost'; k++) {
      let a = bot.act(s, rng);
      if (isBusy(s) && (a.type === 'buy' || a.type === 'sell')) a = { type: 'open' };
      const next = dispatch(s, a, { events: false }).state;
      if (next.phase === 'won' || next.phase === 'lost') {
        last = a;
        break;
      }
      s = next;
    }
    expect(last !== null, '机器人应该能把这局玩完');
    await loadState(ctx, s);
    await dispatchNoWait(ctx, last as Action);
    // 最后的账单 / 结果画面等玩家点继续
    for (let k = 0; k < 6; k++) {
      await waitIdle(ctx, '最后一天', "window.__game.awaiting || window.__game.scene === 'end'");
      if ((await ctx.page.evaluate(() => window.__game?.scene)) === 'end') break;
      await ctx.page.evaluate(() => window.__game?.continue());
    }
    await openStory(ctx);
    await ctx.page.waitForTimeout(500);
    await shot(ctx, 'r4-reveal');
    await click(ctx, 'reveal:close');
    await waitIdle(ctx, '结束页');
    await ctx.page.waitForTimeout(300);
    // 成就、解锁弹窗（如果有）逐个关掉
    for (let k = 0; k < 6; k++) {
      const c = await controls(ctx);
      if ('reveal' in c && 'menu' in c && !Object.keys(c).some((x) => x.includes(':'))) break;
      const key = Object.keys(c).find((x) => x.endsWith(':close') || x.endsWith(':ok') || x === 'ok');
      if (!key) break;
      await click(ctx, key);
      await ctx.page.waitForTimeout(400);
    }
    await shot(ctx, 'r5-end');
    await click(ctx, 'menu');
    await waitIdle(ctx, '开始菜单', `window.__game.scene === 'title'`);
    await click(ctx, 'codex');
    await dialogOpen(ctx, 'codex:close');
    await click(ctx, 'codex:tab:segments');
    await ctx.page.waitForTimeout(300);
    await shot(ctx, 'r6-codex-segments');
    await ctx.page.context().close();
  }
  {
    // 行情目录拿不到：退回 0.3 的合成行情，提示一句
    const ctx = await openPage(browser, 'real-fallback', 'anim=0');
    await ctx.page.route('**/data/segments/**', (route) => route.fulfill({ status: 404, body: 'nope' }));
    const r = await ctx.page.evaluate(() => window.__game?.newRun('real-fallback-1', { persona: 'newbie', difficulty: 1 }) ?? { error: '无' });
    expect(!r.error, `newRun 失败：${r.error}`);
    await waitIdle(ctx, '合成行情开局', `window.__game.scene === 'trade'`);
    await ctx.page.waitForTimeout(300);
    const st = (await ctx.page.evaluate(() => window.__game?.state())) as GameState;
    expect(!st.real, '加载失败时应退回合成行情');
    await shot(ctx, 'r7-fallback');
    // 这条流程故意让行情段 404：浏览器那条"资源加载失败"是预期内的
    for (let i = errors.length - 1; i >= 0; i--) if (errors[i]?.startsWith('[real-fallback]') && errors[i]?.includes('404')) errors.splice(i, 1);
    await ctx.page.context().close();
  }
}
