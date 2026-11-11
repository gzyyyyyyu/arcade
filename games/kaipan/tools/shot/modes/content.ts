// --content 模式：内容包的画面（0.29 起）：顶栏里的新战法图标、新事件弹窗。真实行情的普通局开局后在页面里改状态，不走完整一局。
import type { Browser } from 'playwright-core';
import { eventById, rngFor, type GameState } from '../../../src/core/index.ts';
import { PHONE, expect, loadState, openPage, shot, waitIdle } from '../harness.ts';

/** 每个新事件截一张弹窗；战法带在身上截一张顶栏 */
const TACTICS = ['dip_buyer', 'early_bird'];
const EVENTS = ['invest_group', 'broker_tea', 'show_off', 'free_eggs'];

export async function contentShots(browser: Browser): Promise<void> {
  const ctx = await openPage(browser, 'content', 'anim=0', { touch: PHONE });
  const r = await ctx.page.evaluate(() => window.__game?.newRun('content-1', { persona: 'newbie', difficulty: 1 }) ?? { error: '无' });
  expect(!r.error, `newRun 失败：${r.error}`);
  await waitIdle(ctx, '真实行情开局', "window.__game.scene === 'trade'");
  const st = (await ctx.page.evaluate(() => window.__game?.state())) as GameState;
  expect(!!st.real, '内容包只在真实行情的普通局里出现');
  await loadState(ctx, { ...st, items: [...st.items, ...TACTICS] });
  await ctx.page.waitForTimeout(400);
  await shot(ctx, 'c1-tactics');
  for (const [i, id] of EVENTS.entries()) {
    // 金额这类数据由事件自己的 prepare 算（游戏里月底抽到事件时也是这样），不手填
    const prep = eventById(id).prepare({ state: st, rng: rngFor(st.seed, 'content-shot'), month: st.month });
    expect(!!prep, `事件 ${id} 在这一局应能出现`);
    await loadState(ctx, { ...st, phase: 'event', event: { id, month: st.month, ...prep } });
    await ctx.page.waitForTimeout(500);
    expect((await ctx.page.evaluate(() => window.__game?.state().phase)) === 'event', `事件 ${id} 应停在二选一`);
    await shot(ctx, `c${i + 2}-event-${id}`);
  }
  await ctx.page.context().close();
}
