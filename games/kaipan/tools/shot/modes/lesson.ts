// --lesson 模式：新号从开始菜单点「先上一课」，照老师傅的气泡一步步做完新手课（docs/design-lesson.md）。
import type { Browser } from 'playwright-core';
import { MIND_IDS, lessonAdvice, type GameState } from '../../../src/core/index.ts';
import { buyVia, click, controls, expect, guideStep, openPage, press, shot, state, tap, waitIdle } from '../harness.ts';

/**
 * 全新存档（教程也没看过）：开始菜单大卡是「先上一课」；局里只出老师傅和心法的气泡，不出通用教程。
 * 默认照建议做（买只点「试一口」、到线就卖、等就开盘），要过关、六张心法全亮、图鉴「心法」页能翻看；
 * --defy 反着来（一律重仓、从不卖），要看到心法气泡（点「记住了」亮一张）和「没过」的结束页。
 * --portrait 在 390×844 竖屏触屏上跑。每种气泡第一次出现截一张。
 */
export async function lessonShots(browser: Browser): Promise<void> {
  const portrait = process.argv.includes('--portrait');
  const defy = process.argv.includes('--defy');
  const tag = `${portrait ? 'pt-' : ''}${defy ? 'defy' : 'follow'}`;
  const ctx = await openPage(browser, `lesson-${tag}`, '', portrait ? { noProfile: true, touch: true, screen: { width: 390, height: 844, dpr: 2 } } : { noProfile: true });
  const act = portrait ? tap : click;
  if (portrait) await waitIdle(ctx, '首屏');
  await shot(ctx, `lesson-${tag}-00-title`);
  await act(ctx, 'quick');
  await waitIdle(ctx, '进入新手课', "window.__game.scene === 'trade'");
  expect(await state<boolean>(ctx, 's.setup?.lesson === true'), '大卡开的是新手课');
  const seen = new Set<string>();
  const snap = async (kind: string): Promise<void> => {
    if (seen.has(kind)) return;
    seen.add(kind);
    await ctx.page.waitForTimeout(300);
    await shot(ctx, `lesson-${tag}-${String(seen.size).padStart(2, '0')}-${kind}`);
  };
  const recTab = async (): Promise<void> => {
    if (portrait && 'tab:recs' in (await controls(ctx))) {
      await act(ctx, 'tab:recs');
      await ctx.page.waitForTimeout(150);
    }
  };
  for (let guard = 0; guard < 80; guard++) {
    const phase = await state<string>(ctx, 's.phase');
    if (phase === 'won' || phase === 'lost') break;
    if (phase === 'reward') {
      await act(ctx, 'reward:0');
      await ctx.page.waitForTimeout(150);
      const slot = Object.keys(await controls(ctx)).find((k) => k.startsWith('slot:'));
      if (slot) await act(ctx, slot);
      await waitIdle(ctx, '选完奖励');
      continue;
    }
    if (phase === 'event') {
      await press(ctx, 'Digit1');
      await waitIdle(ctx, '事件之后', "!window.__game.awaiting && window.__game.state().phase !== 'event'");
      continue;
    }
    const g = await guideStep(ctx);
    expect(g === null || g === 'coach' || g.startsWith('mind-'), `新手课里不出通用教程（出了 ${g}）`);
    if (g?.startsWith('mind-')) {
      await snap('mind');
      await act(ctx, 'guide:next');
      await ctx.page.waitForTimeout(250);
      continue;
    }
    if (g === 'coach') await snap('coach');
    const s = await state<GameState>(ctx, 's');
    const adv = lessonAdvice(s);
    if (defy) {
      const rec = s.slots.includes(null) && s.today.buysLeft > 0 ? s.today.recs.findIndex((r) => !r.taken && !s.slots.some((h) => h?.stockId === r.stockId)) : -1;
      if (rec >= 0 && s.today.ops < 2) {
        await recTab();
        if (`buy:${rec}` in (await controls(ctx))) {
          await act(ctx, `buy:${rec}`);
          await ctx.page.waitForTimeout(150);
          const c = await controls(ctx);
          if ('size:heavy' in c) await act(ctx, 'size:heavy');
          else if ('size:taste' in c) await act(ctx, 'size:taste');
          await waitIdle(ctx, '买入');
          continue;
        }
      }
    } else if (adv?.kind === 'sell') {
      await act(ctx, `sell:${adv.slot}`);
      await waitIdle(ctx, '卖出');
      continue;
    } else if (adv?.kind === 'buy') {
      await recTab();
      await buyVia(ctx, `buy:${adv.rec}`, portrait);
      await waitIdle(ctx, '买入');
      continue;
    }
    await press(ctx, 'Space');
    await ctx.page.waitForFunction(() => !window.__game?.idle, null, { timeout: 5000 }).catch(() => {});
    await ctx.page.waitForTimeout(250);
    await press(ctx, 'Space');
    await waitIdle(ctx, '开盘');
    if (await ctx.page.evaluate(() => window.__game?.awaiting)) {
      await act(ctx, 'continue');
      await waitIdle(ctx, '结束页');
    }
  }
  await waitIdle(ctx, '结束页', "window.__game.scene === 'end'");
  await shot(ctx, `lesson-${tag}-90-end`);
  const won = await state<boolean>(ctx, "s.phase === 'won'");
  const profile = await ctx.page.evaluate(() => JSON.parse(localStorage.getItem('kaipan.profile') ?? '{}') as { minds?: string[]; lessonWon?: boolean; runs?: number });
  expect(seen.has('coach'), '出过老师傅的气泡');
  expect((profile.runs ?? 0) === 0, '新手课不算正式局');
  if (defy) {
    expect(!won, '反着来的没过');
    expect(seen.has('mind'), '反着来的局里弹过心法');
    expect((profile.minds ?? []).length > 0 && !profile.lessonWon, '点「记住了」的心法亮了，新手课没记过关');
  } else {
    expect(won, '照建议做的过关');
    expect(profile.lessonWon === true && MIND_IDS.every((id) => profile.minds?.includes(id)), '过关后六张心法全亮');
    // 回开始菜单 → 图鉴「心法」页
    await act(ctx, 'menu');
    await waitIdle(ctx, '开始菜单', "window.__game.scene === 'title'");
    await act(ctx, 'codex');
    await ctx.page.waitForTimeout(400);
    await act(ctx, 'codex:tab:minds');
    await ctx.page.waitForTimeout(300);
    await shot(ctx, `lesson-${tag}-91-codex`);
  }
  await ctx.page.context().close();
}
