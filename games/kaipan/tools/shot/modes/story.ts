// --story 模式：0.4 重做的局末"这段日子"小故事（五种市况）和图鉴行情段重看故事
import type { Browser } from 'playwright-core';
import { createRun, dispatch, isBusy, rngFor, runSummary, type Action } from '../../../src/core/index.ts';
import { emptyProfile, recordRun } from '../../../src/platform/profile.ts';
import { botByName } from '../../bots.ts';
import { loadSegment } from '../../segments-disk.ts';
import { click, dialogOpen, dispatchNoWait, expect, loadState, notes, openPage, openStory, PHONE, shot, waitIdle } from '../harness.ts';

// ---------------------------------------------------------------- 0.4 重做：这段日子（局末小故事）

/**
 * 五种市况各玩一局（node 里机器人推进到最后一步，画面执行最后一步）→ "这段日子"小故事页；
 * 再把这几局记进档案，打开图鉴"行情段"页，逐个点卡片重看故事。截图名 sN-*。
 */
export async function storyShots(browser: Browser): Promise<void> {
  const cases: [string, string, string][] = [
    ['2008-10-crash', 'follower', 'story-crash-1'],
    ['1999-03-bull', 'smart', 'story-bull-2'],
    ['2005-06-flat', 'normal', 'story-flat-1'],
    ['1999-10-bubble', 'smart', 'story-bubble-1'],
    ['2007-11-bear', 'qunzhu', 'story-bear-1'],
  ];
  // --segs a,b,c：只截这几段的开局（第一个交易日）和结局小故事（抽查全量段库用）
  const only = ((): string[] | null => {
    const k = process.argv.indexOf('--segs');
    return k > 0 && process.argv[k + 1] ? (process.argv[k + 1] as string).split(',') : null;
  })();
  if (only) cases.splice(0, cases.length, ...only.map((id) => [id, 'normal', `story-${id}`] as (typeof cases)[number]));
  let profile = emptyProfile();
  for (const [segId, botName, seed] of cases) {
    if (only) {
      const seg0 = loadSegment(segId);
      const s0 = createRun(seed, { persona: 'newbie', difficulty: 1 }, { segment: seg0 }).state;
      const c0 = await openPage(browser, `open-${segId}`, 'anim=0');
      await loadState(c0, s0);
      await c0.page.waitForTimeout(800);
      await shot(c0, `open-${segId}`);
      const b0 = await c0.page.evaluate(() => document.body.innerText);
      expect(!/(19|20)\d\d/.test(b0), '开局画面上不该出现年份');
      notes.push(`${segId} 开局 → open-${segId}`);
      await c0.page.context().close();
    }
    const seg = loadSegment(segId);
    const bot = botByName(botName)();
    const rng = rngFor(seed, 'shot-story');
    let s = createRun(seed, { persona: 'newbie', difficulty: 1 }, { segment: seg }).state;
    let last: Action | null = null;
    for (let k = 0; k < 4000; k++) {
      let a = bot.act(s, rng);
      if (isBusy(s) && (a.type === 'buy' || a.type === 'sell')) a = { type: 'open' };
      const next = dispatch(s, a, { events: false }).state;
      if (next.phase === 'won' || next.phase === 'lost') {
        last = a;
        profile = recordRun(profile, runSummary(next), '2026-10-12').profile;
        break;
      }
      s = next;
    }
    expect(last !== null, `${segId}：机器人应该能把这局玩完`);
    const ctx = await openPage(browser, `story-${segId}`, 'anim=0');
    await loadState(ctx, s);
    await dispatchNoWait(ctx, last as Action);
    for (let k = 0; k < 6; k++) {
      await waitIdle(ctx, '最后一天', "window.__game.awaiting || window.__game.scene === 'end'");
      if ((await ctx.page.evaluate(() => window.__game?.scene)) === 'end') break;
      await ctx.page.evaluate(() => window.__game?.continue());
    }
    await openStory(ctx);
    await ctx.page.waitForTimeout(500);
    await shot(ctx, only ? `story-${segId}` : `s1-story-${seg.regime}`);
    const body = await ctx.page.evaluate(() => document.body.innerText);
    expect(!/(19|20)\d\d/.test(body), '故事页上不该出现年份');
    notes.push(`${segId}（${seg.regime}，${botName}）→ s1-story-${seg.regime}`);
    await ctx.page.context().close();
  }
  if (only) return;
  const ctx = await openPage(browser, 'story-codex', 'anim=0', { storage: { 'kaipan.profile': JSON.stringify(profile) } });
  await click(ctx, 'codex');
  await dialogOpen(ctx, 'codex:close');
  await click(ctx, 'codex:tab:segments');
  await ctx.page.waitForTimeout(300);
  await shot(ctx, 's2-codex-segments-0');
  // 手机横屏的行情段一页 4 张，只点第一页里的
  for (const i of PHONE ? [1, 2, 3] : [1, 2, 4]) {
    await click(ctx, `codex:seg:${i}`);
    await ctx.page.waitForTimeout(250);
    await shot(ctx, `s2-codex-segments-${i}`);
  }
  await ctx.page.context().close();
}
