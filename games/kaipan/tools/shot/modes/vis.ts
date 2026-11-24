// --vis 模式：0.5 去文字化，主要画面截图并统计每个画面可见汉字数（counts.json）。
import type { Browser } from 'playwright-core';
import { chatView, createRun, dispatch, isBusy, rngFor, type Action, type GameState } from '../../../src/core/index.ts';
import { botByName } from '../../bots.ts';
import { loadSegment } from '../../segments-disk.ts';
import { OUT, buyVia, click, clock, controls, dialogOpen, dispatch2, dispatchNoWait, expect, loadState, notes, openPage, openStory, press, shot, state, step, waitFor, waitIdle, type Ctx } from '../harness.ts';
import { EXT_SETUP, EXT_TIPS_KEY, extToMonth, firstRec } from './ext.ts';

// ---------------------------------------------------------------- 去文字化：主要画面截图 + 可见汉字数

const visCounts: { file: string; han: number; texts: number }[] = [];

/** 截图并统计画面上看得见的汉字（Phaser 文字对象 + DOM 文字）。 */
async function visShot(ctx: Ctx, file: string): Promise<void> {
  await shot(ctx, file);
  const list = (await ctx.page.evaluate(() => window.__game?.displayList() ?? [])) as string[];
  const texts = list.filter((x) => x.startsWith('text:')).map((x) => x.slice(5));
  const dom = await ctx.page.evaluate(() => document.body.innerText);
  const all = [...texts, dom].join('\n');
  const han = (all.match(/[一-鿿]/g) ?? []).length;
  visCounts.push({ file, han, texts: texts.length });
  const fs = await import('node:fs');
  fs.writeFileSync(`${OUT}/${file}.txt`, `${texts.join('\n---\n')}\n=== DOM ===\n${dom}`);
}

const VIS_TIPS = { [EXT_TIPS_KEY]: JSON.stringify(['size', 'holding', 'short', 'bank', 'call']) };
const VIS_SEG = '2005-06-flat';

function visRun(seed: string): GameState {
  return createRun(seed, EXT_SETUP, { segment: loadSegment(VIS_SEG), ext: true }).state;
}

export async function visShots(browser: Browser): Promise<void> {
  // ① 标题 → 选人设和难度 → 本月看点卡 → 盘前 → 开盘翻牌 → 收盘
  {
    const ctx = await openPage(browser, 'vis-main', '', { storage: VIS_TIPS });
    await ctx.page.evaluate(() => window.__game?.setProfile('all'));
    await waitIdle(ctx, '换档案', "window.__game.scene === 'title'");
    await ctx.page.waitForTimeout(500);
    await visShot(ctx, '01-title');
    await click(ctx, 'new');
    await dialogOpen(ctx, 'setup:start');
    await click(ctx, 'setup:diff:1');
    await ctx.page.waitForTimeout(300);
    await visShot(ctx, '02-setup');
    await ctx.page.context().close();
  }
  {
    // 看点卡：从开局面板真实开一局（动画开着），在 monthStart 之后冻结
    const ctx = await openPage(browser, 'vis-card', '', { storage: VIS_TIPS });
    await ctx.page.evaluate(() => window.__game?.setProfile('all'));
    await waitIdle(ctx, '换档案', "window.__game.scene === 'title'");
    await ctx.page.waitForTimeout(400);
    await click(ctx, 'new');
    await dialogOpen(ctx, 'setup:start');
    await click(ctx, 'setup:diff:1');
    await ctx.page.waitForTimeout(200);
    const t0 = await clock(ctx);
    await click(ctx, 'setup:start');
    await ctx.page.evaluate(([t, s, ms]) => window.__game?.freezeAfterCue(t, s, ms), ['monthStart', t0, 1400] as const);
    await waitFor(ctx, '看点卡冻结', 'g.frozen');
    await ctx.page.waitForTimeout(200);
    await visShot(ctx, '03-month-card');
    await ctx.page.evaluate(() => window.__game?.freeze(false));
    await ctx.page.context().close();
  }
  {
    const ctx = await openPage(browser, 'vis-day', '', { storage: VIS_TIPS });
    const s0 = visRun('vis-1');
    await loadState(ctx, s0);
    await ctx.page.waitForTimeout(500);
    await visShot(ctx, '04-premarket');
    const rec = firstRec(s0);
    await buyVia(ctx, `buy:${rec}`);
    await waitIdle(ctx, '买入');
    await ctx.page.waitForTimeout(300);
    // 持仓卡的放大镜 → 股票详情卡
    if (process.argv.includes('--vis') && 'detail:0' in (await controls(ctx))) {
      await visShot(ctx, '04a-bought');
      await click(ctx, 'detail:0');
      await ctx.page.waitForTimeout(900);
      await visShot(ctx, '04b-detail');
      await press(ctx, 'Escape');
      await ctx.page.waitForTimeout(300);
    }
    const t0 = await clock(ctx);
    await dispatchNoWait(ctx, { type: 'open' });
    await ctx.page.evaluate(([t, s, ms]) => window.__game?.freezeAfterCue(t, s, ms), ['reveal', t0, 400] as const);
    await waitFor(ctx, '翻牌冻结', 'g.frozen');
    await ctx.page.waitForTimeout(150);
    await visShot(ctx, '05-open-flip');
    await ctx.page.evaluate(() => window.__game?.freeze(false));
    await waitIdle(ctx, '收盘');
    await ctx.page.waitForTimeout(500);
    await visShot(ctx, '06-close');
    await ctx.page.context().close();
  }
  // 新手教程第一步（全新进度）
  {
    const ctx = await openPage(browser, 'vis-guide', '', { storage: VIS_TIPS, guide: true });
    await loadState(ctx, visRun('vis-1'));
    await ctx.page.waitForTimeout(1200);
    await visShot(ctx, '04c-tutorial');
    await ctx.page.context().close();
  }
  // ② 月底三选一 → 事件 → 事件结果
  {
    let found: { seed: string; s: GameState } | null = null;
    for (let i = 0; i < 200 && !found; i++) {
      let s = visRun(`vis-m-${i}`);
      let last = s;
      for (let k = 0; k < 80 && s.phase !== 'reward'; k++) {
        if (s.phase === 'won' || s.phase === 'lost') break;
        last = s;
        s = step(s).state;
      }
      if (s.phase === 'reward' && dispatch(s, { type: 'skipReward' }).state.phase === 'event') found = { seed: `vis-m-${i}`, s: last };
    }
    expect(found !== null, '找不到「三选一 + 事件」的局面');
    const ctx = await openPage(browser, 'vis-month', 'anim=0', { storage: VIS_TIPS });
    await loadState(ctx, found!.s);
    await dispatch2(ctx, { type: 'open' });
    for (let k = 0; k < 4 && (await state<string>(ctx, 's.phase')) !== 'reward'; k++) {
      if (await ctx.page.evaluate(() => window.__game?.awaiting)) await ctx.page.evaluate(() => window.__game?.continue());
      await waitIdle(ctx, '三选一');
    }
    await waitIdle(ctx, '三选一', "window.__game.state().phase === 'reward'");
    await ctx.page.waitForTimeout(400);
    await visShot(ctx, '07-reward');
    await click(ctx, 'reward:skip');
    await waitIdle(ctx, '事件', "window.__game.state().phase === 'event'");
    await ctx.page.waitForTimeout(400);
    await visShot(ctx, '08-event');
    await click(ctx, 'event:0');
    await waitIdle(ctx, '事件结果', "window.__game.awaiting || window.__game.state().phase === 'premarket'");
    await ctx.page.waitForTimeout(300);
    await visShot(ctx, '09-event-result');
    await ctx.page.context().close();
  }
  // ③ 银行、押跌
  {
    const s = extToMonth('ext-bank-1', EXT_SETUP, 2);
    const ctx = await openPage(browser, 'vis-bank', 'anim=0', { storage: VIS_TIPS });
    await loadState(ctx, s);
    await click(ctx, 'bank');
    await dialogOpen(ctx, 'bank:close');
    await ctx.page.waitForTimeout(300);
    await visShot(ctx, '10-bank');
    await ctx.page.context().close();
  }
  {
    let s = createRun('ext-demo-3', { ...EXT_SETUP, items: ['short_permit'], friends: ['kongjun'] }, { ext: true }).state;
    for (let i = 0; i < 200; i++) {
      const t = createRun(`ext-demo-3-${i}`, { ...EXT_SETUP, items: ['short_permit'], friends: ['kongjun'] }, { ext: true }).state;
      if (chatView(t).recs.some((r) => r.short && !r.taken && !r.error)) {
        s = t;
        break;
      }
    }
    const ctx = await openPage(browser, 'vis-short', 'anim=0', { storage: VIS_TIPS });
    await loadState(ctx, s);
    const recs = chatView(s).recs;
    const hinted = recs.findIndex((r) => r.short && !r.taken && !r.error);
    await click(ctx, `short:${hinted >= 0 ? hinted : firstRec(s)}`);
    await dialogOpen(ctx, 'short:half');
    await ctx.page.waitForTimeout(300);
    await visShot(ctx, '11-short');
    await ctx.page.context().close();
  }
  // ④ 结局小故事
  {
    const seg = loadSegment(VIS_SEG);
    const bot = botByName('normal')();
    const rng = rngFor('vis-story', 'shot-story');
    let s = createRun('vis-story', EXT_SETUP, { segment: seg }).state;
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
    const ctx = await openPage(browser, 'vis-story', 'anim=0', { storage: VIS_TIPS });
    await loadState(ctx, s);
    await dispatchNoWait(ctx, last as Action);
    for (let k = 0; k < 6; k++) {
      await waitIdle(ctx, '最后一天', "window.__game.awaiting || window.__game.scene === 'end'");
      if ((await ctx.page.evaluate(() => window.__game?.scene)) === 'end') break;
      await ctx.page.evaluate(() => window.__game?.continue());
    }
    await openStory(ctx);
    await ctx.page.waitForTimeout(600);
    await visShot(ctx, '12-story');
    await click(ctx, 'reveal:close');
    await ctx.page.waitForTimeout(600);
    await visShot(ctx, '12b-end');
    await ctx.page.context().close();
  }
  // ⑤ 图鉴、成就、怎么玩
  {
    const ctx = await openPage(browser, 'vis-meta', '', { storage: VIS_TIPS });
    await ctx.page.evaluate(() => window.__game?.setProfile('partial'));
    await waitIdle(ctx, '换档案', "window.__game.scene === 'title'");
    await ctx.page.waitForTimeout(400);
    await click(ctx, 'codex');
    await dialogOpen(ctx, 'codex:close');
    await ctx.page.waitForTimeout(300);
    await visShot(ctx, '13-codex');
    await click(ctx, 'codex:tab:achievements');
    await ctx.page.waitForTimeout(300);
    await visShot(ctx, '14-achievements');
    await press(ctx, 'Escape');
    await click(ctx, 'codex:close').catch(() => {});
    await waitFor(ctx, '关掉图鉴', `'help' in g.controls() && !('codex:close' in g.controls())`);
    await ctx.page.waitForTimeout(300);
    await click(ctx, 'help');
    await dialogOpen(ctx, 'help:next');
    for (let i = 1; i <= 8 && 'help:next' in (await controls(ctx)); i++) {
      await ctx.page.waitForTimeout(250);
      await visShot(ctx, `15-help-${i}`);
      await click(ctx, 'help:next');
    }
    await ctx.page.context().close();
  }
  const fs = await import('node:fs');
  fs.writeFileSync(`${OUT}/counts.json`, JSON.stringify(visCounts, null, 1));
  for (const c of visCounts) notes.push(`${c.file}\t${c.han}`);
}
