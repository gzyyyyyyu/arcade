import type { Browser } from 'playwright-core';
import { createRun, dispatch, earningsView, type GameState } from '../../../src/core/index.ts';
import { segmentForSeed } from '../../segments-disk.ts';
import { controls, expect, loadState, notes, openPage, shot, state, step, tap, click, waitIdle, type Ctx } from '../harness.ts';
import { firstRec } from './ext.ts';

/**
 * 0.35.0 --market：炒股手感那一批的画面（电脑 1280 + 手机竖屏 390×844）。
 * 真实行情的娱乐局走到第 2 个月，买一只、再开几天盘：交易页（大盘屏的情绪、领涨领跌、持仓卡的累计钱数）→
 * 持仓的股票详情（日 K、分时、买卖力量）→ 点「自选」加星（按钮换字、局面里记上）→ 推荐卡上能押跌。
 * 0.36.0：3 月财报周的盘前（群聊里的财报横条）→ 展开新闻条看龙虎榜。
 */
function midRun(seed: string): GameState {
  let s = createRun(seed, { persona: 'newbie', difficulty: 1 }, { segment: segmentForSeed(seed), ext: true }).state;
  for (let k = 0; k < 400 && !(s.month >= 2 && s.phase === 'premarket'); k++) s = step(s).state;
  const b = dispatch(s, { type: 'buy', rec: firstRec(s), size: 'half' });
  expect(b.error === null, `买不进：${b.error}`);
  s = b.state;
  for (let d = 0; d < 3; ) {
    const was = s.phase;
    s = step(s).state;
    if (was === 'premarket') d++;
  }
  for (let k = 0; k < 10 && s.phase !== 'premarket'; k++) s = step(s).state;
  expect(s.phase === 'premarket' && s.slots.some((h) => h), '没走到有持仓的盘前');
  return s;
}

/** 推进到 3 月财报周预告那天的盘前（什么都不买）。 */
function earningsDay(seed: string): GameState {
  let s = createRun(seed, { persona: 'newbie', difficulty: 1 }, { segment: segmentForSeed(seed), ext: true }).state;
  for (let k = 0; k < 400 && !(s.phase === 'premarket' && earningsView(s)?.stage === 'soon'); k++) s = step(s).state;
  expect(earningsView(s) !== null, '走不到财报周');
  return s;
}

async function earningsFlow(ctx: Ctx, tag: string, touch: boolean, s: GameState): Promise<void> {
  await loadState(ctx, s);
  await ctx.page.waitForTimeout(600);
  expect(await ctx.page.evaluate(() => window.__game?.displayList().some((t) => t.startsWith('text:') && t.includes('财报 · ')) ?? false), '群聊里应有财报横条');
  await shot(ctx, `market-${tag}-earnings`);
  await (touch ? tap : click)(ctx, 'news:toggle');
  await ctx.page.waitForTimeout(400);
  expect(await ctx.page.evaluate(() => window.__game?.displayList().some((t) => t.startsWith('text:') && t.includes('龙虎榜')) ?? false), '展开新闻应看到龙虎榜');
  await shot(ctx, `market-${tag}-board`);
  notes.push(`--market ${tag}：财报 ${earningsView(s)?.name}，龙虎榜展开`);
}

async function flow(ctx: Ctx, tag: string, touch: boolean, s: GameState): Promise<void> {
  // openPage 只在横版里等首屏；竖屏要自己等 Phaser 起来，不然 loadState 早于启动会报「Phaser 尚未启动」
  if (touch) await waitIdle(ctx, '首屏');
  await loadState(ctx, s);
  await ctx.page.waitForTimeout(600);
  await shot(ctx, `market-${tag}-trade`);
  const slot = s.slots.findIndex((h) => h);
  const press = touch ? tap : click;
  await press(ctx, `detail:${slot}`);
  await ctx.page.waitForTimeout(900);
  expect('detail:star' in (await controls(ctx)), '股票详情里应有「自选」');
  await shot(ctx, `market-${tag}-detail`);
  await press(ctx, 'detail:star');
  await waitIdle(ctx, '加自选');
  const id = s.slots[slot]?.stockId ?? '';
  expect((await state<string[]>(ctx, 's.stars ?? []')).includes(id), '点「自选」以后局面里应记上这只');
  await ctx.page.waitForTimeout(400);
  await shot(ctx, `market-${tag}-starred`);
  await ctx.page.keyboard.press('Escape');
  await ctx.page.waitForTimeout(400);
  notes.push(`--market ${tag}：持仓 ${id}，加了自选`);
}

export async function marketShots(browser: Browser): Promise<void> {
  const s = midRun('market-1');
  const e = earningsDay('market-1');
  {
    const ctx = await openPage(browser, 'market-desktop', '');
    await flow(ctx, '1280', false, s);
    await earningsFlow(ctx, '1280', false, e);
    await ctx.page.context().close();
  }
  {
    const ctx = await openPage(browser, 'market-portrait', '', { touch: true, screen: { width: 390, height: 844, dpr: 2 } });
    await flow(ctx, 'portrait', true, s);
    await earningsFlow(ctx, 'portrait', true, e);
    await ctx.page.context().close();
  }
}
