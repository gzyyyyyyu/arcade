// 冒烟模式 --rhythm：0.24 演出和节奏（收盘逐张结算、三选一悬停、通关演出后的成绩页、点按钮才开的「这段日子」）
import type { Browser } from 'playwright-core';
import { createRun, dispatch, isBusy, rewardView, rngFor, type Action } from '../../../src/core/index.ts';
import { botByName } from '../../bots.ts';
import { loadSegment } from '../../segments-disk.ts';
import { BASIC_SETUP, clock, click, controls, dismissEndDialogs, dispatchNoWait, expect, loadState, notes, openPage, shot, step, toPage, waitFor, waitIdle } from '../harness.ts';

/**
 * 0.24 演出和节奏（动画开着、不开机器人代打、1280×800）：① 收盘逐张结算进行中（数字飞向账户）② 三选一悬停抬起、倾斜
 * ③ 通关 / 出局演出和成绩页（带「这段日子」按钮）④ 点按钮才打开故事面板、Esc 退场后页面仍可用。
 * 同时记下一天结算各步的 cue 时间，核对逐张结算没有把收盘拖长。
 */
export async function rhythmShots(browser: Browser): Promise<void> {
  const screen = { width: 1280, height: 800, dpr: 1 };
  // ① 逐张结算
  {
    const ctx = await openPage(browser, 'rhythm-day', 'speed=1', { screen });
    await loadState(ctx, createRun('rhythm-day-1', BASIC_SETUP).state);
    const t0 = await clock(ctx);
    await dispatchNoWait(ctx, { type: 'open' });
    await ctx.page.evaluate(([t, s, ms]) => window.__game?.freezeAfterCue(t, s, ms), ['tally', t0, 230] as const);
    await waitFor(ctx, '逐张结算冻结', 'g.frozen');
    await ctx.page.waitForTimeout(150);
    await shot(ctx, 'rhythm-1-settle');
    await ctx.page.evaluate(() => window.__game?.freeze(false));
    await waitIdle(ctx, '收盘');
    const cues = (await ctx.page.evaluate(() => (window.__game?.cues ?? []).map((c) => ({ t: Math.round(c.t), type: c.cue.type })))) as { t: number; type: string }[];
    const at = (type: string): number[] => cues.filter((c) => c.type === type && c.t >= t0).map((c) => c.t - t0);
    const tally = at('tally');
    expect(tally.length > 0, '收盘应有逐张结算的音');
    notes.push(`逐张结算：开盘 ${at('marketOpen')[0]}ms，账户结算 ${at('settle')[0]}ms，逐张 ${tally.join('/')}ms（共 ${tally.length} 条，首尾相差 ${tally[tally.length - 1]! - tally[0]!}ms）`);
    await ctx.page.context().close();
  }
  // ② 三选一悬停
  {
    let s = createRun('rhythm-reward-0', BASIC_SETUP).state;
    for (let i = 0; i < 40 && s.phase !== 'reward'; i++) {
      s = createRun(`rhythm-reward-${i}`, BASIC_SETUP).state;
      for (let k = 0; k < 120 && s.phase !== 'reward'; k++) {
        if (s.phase === 'won' || s.phase === 'lost') break;
        s = step(s).state;
      }
    }
    expect(s.phase === 'reward', '找不到三选一的局面');
    // 选不进格子挑选的那种卡（股票卡要先挑格子，不在这里测）；中间一张优先
    const kinds = rewardView(s).map((r) => r.kind);
    const pick = kinds[1] !== undefined && kinds[1] !== 'stock' ? 1 : kinds.findIndex((k) => k !== 'stock');
    expect(pick >= 0, '三张都是股票卡');
    const ctx = await openPage(browser, 'rhythm-reward', 'speed=1', { screen });
    await loadState(ctx, s);
    await ctx.page.waitForTimeout(900);
    const c = (await controls(ctx))[`reward:${pick}`]!;
    const p = await toPage(ctx, c.x + 20, c.y - 130);
    await ctx.page.mouse.move(p.x - 60, p.y);
    await ctx.page.mouse.move(p.x, p.y, { steps: 6 });
    await ctx.page.waitForTimeout(350);
    await shot(ctx, 'rhythm-2-reward-hover');
    // 选一张：飞起 + 其余落下，之后才进下一步
    await click(ctx, `reward:${pick}`);
    await ctx.page.waitForTimeout(140);
    await shot(ctx, 'rhythm-2b-reward-pick');
    await waitIdle(ctx, '选完三选一', "window.__game.state().phase !== 'reward'");
    await ctx.page.context().close();
  }
  // ③④ 结束页
  {
    const seg = loadSegment('1999-03-bull');
    const bot = botByName('smart')();
    const rng = rngFor('rhythm-end', 'shot-story');
    let s = createRun('rhythm-end', { persona: 'newbie', difficulty: 1 }, { segment: seg }).state;
    let last: Action | null = null;
    for (let k = 0; k < 4000; k++) {
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
    const ctx = await openPage(browser, 'rhythm-end', 'speed=1', { screen });
    await loadState(ctx, s);
    const t0 = await clock(ctx);
    await dispatchNoWait(ctx, last as Action);
    // 最后的账单等玩家点继续；之后演出 → 成绩页
    for (let k = 0; k < 6; k++) {
      await waitIdle(ctx, '最后一天', "window.__game.awaiting || window.__game.scene === 'end'");
      if ((await ctx.page.evaluate(() => window.__game?.scene)) === 'end') break;
      await ctx.page.evaluate(() => window.__game?.continue());
    }
    await waitFor(ctx, '结束页', `g.scene === 'end' && 'reveal' in g.controls()`);
    await ctx.page.waitForTimeout(350);
    await shot(ctx, 'rhythm-3a-cutscene');
    await ctx.page.waitForTimeout(3000);
    expect(!('reveal:close' in (await controls(ctx))), '「这段日子」不该自动弹出来');
    // 成就、解锁弹窗会盖住成绩页：先关掉，再截成绩页
    await dismissEndDialogs(ctx);
    await shot(ctx, 'rhythm-3-end');
    await click(ctx, 'reveal');
    await waitFor(ctx, '这段日子', `'reveal:close' in g.controls()`);
    await ctx.page.waitForTimeout(500);
    await shot(ctx, 'rhythm-4-story');
    await ctx.page.keyboard.press('Escape');
    await ctx.page.waitForTimeout(500);
    expect(!('reveal:close' in (await controls(ctx))) && 'reveal' in (await controls(ctx)), '故事面板 Esc 关掉后成绩页应能继续用');
    notes.push(`结束页：从最后一天开盘起 ${(await clock(ctx)) - t0}ms 内成绩页和故事面板都走通`);
    await ctx.page.context().close();
  }
}
