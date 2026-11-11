// --meta 模式：长线界面（0.3.0）——开局选择、每日挑战、图鉴、成就、结束页解锁
import type { Browser } from 'playwright-core';
import { chatView, createRun, topBar, type GameState, type RunSetup } from '../../../src/core/index.ts';
import { botByName, playRun } from '../../bots.ts';
import { advanceTo, BASIC_SETUP, click, controls, dialogOpen, dispatchNoWait, expect, hover, loadState, notes, openPage, PHONE, press, setupQuery, shot, state, step, waitFor, waitIdle } from '../harness.ts';
import { profileStorage } from '../fakes.ts';

// ---------------------------------------------------------------- 长线界面（0.3.0）

/** 开始菜单 → 开局面板 / 每日挑战 / 图鉴 / 成就；结束页的达成与解锁弹窗。截图名 8x / 9x。 */
export async function metaShots(browser: Browser): Promise<void> {
  // A. 全新档案（用调试桥构造）：标题、开局面板（锁定的人设与难度）、快速开始
  {
    const ctx = await openPage(browser, 'meta-fresh', '');
    await ctx.page.evaluate(() => window.__game?.setProfile('fresh'));
    await waitIdle(ctx, '换档案', "window.__game.scene === 'title'");
    await ctx.page.waitForTimeout(400);
    await shot(ctx, '80-title-fresh');
    for (const k of ['quick', 'new', 'daily', 'codex', 'achievements', 'settings', 'about']) expect(k in (await controls(ctx)), `开始菜单应有 ${k}`);
    await click(ctx, 'new');
    await dialogOpen(ctx, 'setup:start');
    await shot(ctx, '81-setup-fresh');
    // 点锁定的人设：抖一下并写出解锁条件；点锁定的难度：写出新增约束和解锁条件
    const unlocked = (await ctx.page.evaluate(() => window.__game?.profile().personas ?? [])) as string[];
    const lockedKey = Object.keys(await controls(ctx)).find((k) => k.startsWith('setup:persona:') && !unlocked.includes(k.slice('setup:persona:'.length)));
    expect(!!lockedKey, '全新档案应有锁定的人设');
    await click(ctx, lockedKey!);
    await ctx.page.waitForTimeout(350);
    await click(ctx, 'setup:diff:4');
    await ctx.page.waitForTimeout(350);
    await shot(ctx, '82-setup-locked-click');
    await click(ctx, 'setup:back');
    await ctx.page.waitForTimeout(250);
    await click(ctx, 'quick');
    await waitIdle(ctx, '快速开始', "window.__game.scene === 'trade'");
    const st = await state<{ persona: string; difficulty: number }>(ctx, '({ persona: s.persona, difficulty: s.difficulty })');
    expect(st.persona === 'newbie' && st.difficulty === 1, `第一次快速开始应是新手 + 第 1 级（${JSON.stringify(st)}）`);
    await shot(ctx, '83-trade-topbar-newbie', { x: 0, y: 0, width: 1280, height: 120 });
    await ctx.page.context().close();
  }
  // B. 全解锁档案（调试桥）：标题、开局面板选人设 + 难度开局、图鉴各页、成就页
  {
    const ctx = await openPage(browser, 'meta-all', '');
    await ctx.page.evaluate(() => window.__game?.setProfile('all'));
    await waitIdle(ctx, '换档案', "window.__game.scene === 'title'");
    await ctx.page.waitForTimeout(400);
    await shot(ctx, '84-title-all');
    await click(ctx, 'new');
    await dialogOpen(ctx, 'setup:start');
    const personas = Object.keys(await controls(ctx)).filter((k) => k.startsWith('setup:persona:'));
    expect(personas.length === 5, `开局面板应有 5 个人设（${personas.length}）`);
    await click(ctx, personas[3]!);
    await click(ctx, 'setup:diff:6');
    await ctx.page.waitForTimeout(300);
    await shot(ctx, '85-setup-all');
    await click(ctx, 'setup:start');
    await waitIdle(ctx, '选人设开局', "window.__game.scene === 'trade'");
    const st = await state<{ persona: string; difficulty: number }>(ctx, '({ persona: s.persona, difficulty: s.difficulty })');
    expect(st.persona === personas[3]!.slice('setup:persona:'.length) && st.difficulty === 6, `应按选择开局（${JSON.stringify(st)}）`);
    await shot(ctx, '86-trade-persona-level6');
    await ctx.page.evaluate(() => window.__game?.toTitle());
    await waitIdle(ctx, '回菜单', "window.__game.scene === 'title'");
    await click(ctx, 'codex');
    await dialogOpen(ctx, 'codex:close');
    await shot(ctx, '87-codex-all-stocks');
    await click(ctx, 'codex:tab:achievements');
    await ctx.page.waitForTimeout(300);
    await shot(ctx, '88-achievements-all');
    await click(ctx, 'codex:close');
    await ctx.page.context().close();
  }
  // C. 玩过几局（一半点亮、一部分没看过）：图鉴五个页签（问号卡、「新」角标）、成就页
  {
    const ctx = await openPage(browser, 'meta-partial', '', { storage: profileStorage('partial') });
    await shot(ctx, '89-title-partial');
    await click(ctx, 'codex');
    await dialogOpen(ctx, 'codex:close');
    for (const [i, tab] of ['stocks', 'friends', 'items', 'events'].entries()) {
      await click(ctx, `codex:tab:${tab}`);
      await ctx.page.waitForTimeout(300);
      if (tab === 'stocks') await hover(ctx, 120, 260);
      await shot(ctx, `90${'abcd'[i]}-codex-${tab}`);
    }
    await click(ctx, 'codex:close');
    await ctx.page.waitForTimeout(250);
    await click(ctx, 'achievements');
    await dialogOpen(ctx, 'codex:close');
    await shot(ctx, '91-achievements-partial');
    await click(ctx, 'codex:close');
    // 再打开：看过的不再标「新」
    await ctx.page.waitForTimeout(250);
    await click(ctx, 'codex');
    await dialogOpen(ctx, 'codex:close');
    await shot(ctx, '90e-codex-stocks-reopen');
    await click(ctx, 'codex:close');
    await ctx.page.waitForTimeout(250);
    // 每日挑战：入口、开局、局内标记
    await click(ctx, 'daily');
    await dialogOpen(ctx, 'daily:start');
    await shot(ctx, '92-daily-panel');
    await click(ctx, 'daily:start');
    await waitIdle(ctx, '每日挑战开局', "window.__game.scene === 'trade'");
    const daily = await state<string | null>(ctx, 's.setup && s.setup.daily');
    expect(typeof daily === 'string', `每日挑战局应带日期（${daily}）`);
    await shot(ctx, '93-daily-in-game');
    await shot(ctx, '93b-daily-topbar', { x: 0, y: 0, width: 1280, height: 120 });
    await ctx.page.context().close();
  }
  // D. 结束页：全新档案打一局正式的通关（机器人在 node 里打完），新纪录、新成就、新人设、新难度依次弹出
  {
    let won: GameState | null = null;
    for (let i = 0; i < 20 && !won; i++) {
      const s = playRun(`end-smart-${i}`, botByName('smart'), { persona: 'newbie', difficulty: 1 });
      if (s.phase === 'won') won = s;
    }
    expect(won !== null, '机器人没打出通关局');
    const ctx = await openPage(browser, 'meta-end', '', { storage: profileStorage('fresh') });
    await loadState(ctx, won!);
    await waitIdle(ctx, '结束页', "window.__game.scene === 'end'");
    const kinds: string[] = [];
    for (let k = 0; k < 8; k++) {
      try {
        await waitFor(ctx, '达成弹窗', "'unlock:ok' in g.controls()");
      } catch {
        break;
      }
      await ctx.page.waitForTimeout(500);
      kinds.push(String(k));
      await shot(ctx, `94${'abcdefgh'[k]}-end-unlock`);
      await click(ctx, 'unlock:ok');
      await ctx.page.waitForTimeout(300);
      if (!(await ctx.page.evaluate(() => 'unlock:ok' in (window.__game?.controls() ?? {})))) {
        await ctx.page.waitForTimeout(300);
        if (!(await ctx.page.evaluate(() => 'unlock:ok' in (window.__game?.controls() ?? {})))) break;
      }
    }
    expect(kinds.length >= 2, `通关后应依次弹出成就和解锁（${kinds.length} 个）`);
    const prof = await ctx.page.evaluate(() => window.__game?.profile());
    expect(prof?.runs === 1 && prof.maxDifficulty === 2, `档案应记下这局并解锁第 2 级（${JSON.stringify({ runs: prof?.runs, max: prof?.maxDifficulty })}）`);
    await shot(ctx, '95-end-new-record');
    // 重建结束页：不重复记、不再弹
    await ctx.page.evaluate(() => window.__game?.setProfile(window.__game.profile()));
    await waitIdle(ctx, '重建结束页');
    await ctx.page.waitForTimeout(500);
    expect(!('unlock:ok' in (await controls(ctx))), '重建结束页不应再弹解锁');
    expect((await ctx.page.evaluate(() => window.__game?.profile().runs)) === 1, '重建结束页不应重复记档案');
    await click(ctx, 'menu');
    await waitIdle(ctx, '回菜单', "window.__game.scene === 'title'");
    await ctx.page.waitForTimeout(300);
    await shot(ctx, '96-title-after-win');
    await ctx.page.context().close();
  }
  // E. 0.3.0-alpha 的旧存档提示；档案损坏提示
  {
    const old = JSON.stringify({ format: 4, appVersion: '0.3.0-alpha.1', savedAt: '2026-10-05T00:00:00Z', state: {} });
    const ctx = await openPage(browser, 'legacy-03a', '', { storage: { 'kaipan.save': old } });
    await ctx.page.waitForTimeout(200);
    expect('notice:ok' in (await controls(ctx)), '应弹出 0.3a 旧存档提示');
    await shot(ctx, '97-legacy-03a-notice');
    await ctx.page.context().close();
    const bad = await openPage(browser, 'profile-corrupt', '', { storage: { 'kaipan.profile': '{broken' } });
    await bad.page.waitForTimeout(200);
    expect('notice:ok' in (await controls(bad)), '应弹出档案损坏提示');
    await shot(bad, '98-profile-corrupt-notice');
    await bad.page.context().close();
  }
  // F. 没有 meta 图集（模拟文件不存在）：开局面板和图鉴退回单张 SVG
  {
    const ctx = await openPage(browser, 'meta-no-atlas', '', { storage: profileStorage('partial'), routes: [{ pattern: '**/atlas/meta*', body: '<!doctype html><title>fallback</title>', type: 'text/html' }] });
    await click(ctx, 'new');
    await dialogOpen(ctx, 'setup:start');
    await shot(ctx, '99a-setup-no-meta-atlas');
    await click(ctx, 'setup:back');
    await ctx.page.waitForTimeout(250);
    await click(ctx, 'achievements');
    await dialogOpen(ctx, 'codex:close');
    await shot(ctx, '99b-achievements-no-meta-atlas');
    const atlas = await ctx.page.evaluate(() => window.__game?.atlas());
    notes.push(`没有 meta 图集时：${JSON.stringify(atlas?.meta)}`);
    await ctx.page.context().close();
  }
  // H. 顶栏日期行三个标签同时出现（每日挑战 + 市场传闻 + 加班）：要自适应，不能越过「账户」那一列。
  // 加班来自随机事件，和传闻同一天很少见：在 node 里找到有传闻的那天，再把这天标成加班（只为看画面）。
  {
    const setup: RunSetup = { persona: 'newbie', difficulty: 8, daily: '2026-10-10', account: 50_000_000 };
    let s = createRun('flags-0', setup).state;
    for (let d = 0; d < 80 && !(s.phase === 'premarket' && topBar(s).notice); d++) {
      if (s.phase === 'won' || s.phase === 'lost') throw new Error('找传闻日时本局结束');
      s = step(s).state;
    }
    expect(!!topBar(s).notice, '没找到有市场传闻的一天');
    s = { ...s, busyDay: s.today.day };
    expect(topBar(s).busy && !!topBar(s).daily, '构造的局面应同时有每日挑战、传闻和加班');
    const ctx = await openPage(browser, 'topbar-flags', `seed=flags-0&${setupQuery(setup)}`);
    await loadState(ctx, s);
    await ctx.page.waitForTimeout(300);
    const r = await ctx.page.evaluate(() => window.__game?.regions().flags ?? null);
    // 「账户」那一列的左边：电脑 296，手机横屏 216
    const accX = PHONE ? 216 : 296;
    expect(!!r && r.x + r.w <= accX, `日期行标签越过了「账户」那一列（${JSON.stringify(r)}）`);
    notes.push(`顶栏三个标签同时出现：占 x ${r!.x}–${r!.x + r!.w}（账户列从 ${accX} 开始）`);
    await shot(ctx, '99d-topbar-three-flags', { x: 0, y: 0, width: 640, height: 70 });
    await hover(ctx, r!.x + 10, r!.y + 9);
    await ctx.page.waitForTimeout(300);
    await shot(ctx, '99e-topbar-flags-tooltip', { x: 0, y: 0, width: 640, height: 260 });
    await ctx.page.context().close();
  }
  // I. 停在最后的账单上刷新：这一局照样记进档案（状态进入 won / lost 时就记，不等结束页）
  {
    let last: GameState | null = null;
    playRun('end-smart-0', botByName('smart'), { persona: 'newbie', difficulty: 1 }, (st) => {
      if (st.phase === 'premarket') last = structuredClone(st);
    });
    expect(last !== null, '没拿到最后一天的局面');
    const ctx = await openPage(browser, 'record-on-refresh', '', { storage: profileStorage('fresh') });
    await loadState(ctx, last!);
    await dispatchNoWait(ctx, { type: 'open' });
    await waitIdle(ctx, '最后的账单', 'window.__game.awaiting');
    const phase = await state<string>(ctx, 's.phase');
    expect(phase === 'won' || phase === 'lost', `最后一天开盘后应结束（${phase}）`);
    await shot(ctx, '99f-final-bill-before-refresh');
    await ctx.page.reload();
    await waitIdle(ctx, '刷新后', 'true');
    await ctx.page.waitForTimeout(400);
    const prof = await ctx.page.evaluate(() => window.__game?.profile());
    expect(prof?.runs === 1 && Object.keys(prof.achievements).length > 0, `停在账单上刷新后档案里应有这一局（runs ${prof?.runs}，成就 ${Object.keys(prof?.achievements ?? {}).length}）`);
    notes.push(`账单上刷新：档案 runs ${prof?.runs}，成就 ${Object.keys(prof?.achievements ?? {}).length} 个，最高难度 ${prof?.maxDifficulty}`);
    await shot(ctx, '99g-after-refresh');
    await ctx.page.context().close();
  }
  // J. 加班日：卖出按钮「加班中」并禁用，点了给出原因（构造：把第 3 天标成加班）
  {
    const base = advanceTo('busy-1', BASIC_SETUP, 2);
    const busy: GameState = { ...base, busyDay: base.today.day };
    const ctx = await openPage(browser, 'busy-day', `seed=busy-1&${setupQuery(BASIC_SETUP)}`);
    await loadState(ctx, busy);
    await ctx.page.waitForTimeout(300);
    expect(!('sell:0' in (await controls(ctx))), '加班日卖出按钮应禁用');
    // Shift+1：卖第一格（按钮禁用）→ 应弹出原因
    await press(ctx, 'Shift+Digit1');
    await ctx.page.waitForTimeout(250);
    expect('toast' in ((await ctx.page.evaluate(() => window.__game?.regions())) ?? {}), '按禁用的卖出应给出轻提示');
    await shot(ctx, '99h-busy-day-sell');
    await ctx.page.context().close();
  }
  // K. FOMO（4 条推荐）+ 小道消息：当天消息完整显示，推荐卡压扁
  {
    const setup: RunSetup = { items: ['fomo', 'rumor_mill'], account: 50_000_000 };
    const st = advanceTo('fomo-0', setup, 1);
    const cv = chatView(st);
    const ctx = await openPage(browser, 'fomo-rumor', `seed=fomo-0&${setupQuery(setup)}`);
    await loadState(ctx, st);
    await ctx.page.waitForTimeout(300);
    const keys = Object.keys((await ctx.page.evaluate(() => window.__game?.regions())) ?? {});
    const shown = keys.filter((k) => k.startsWith('msg:')).length;
    expect(cv.recs.length >= 4, `FOMO 应有 4 条推荐（${cv.recs.length}）`);
    expect(shown === cv.messages.length, `当天 ${cv.messages.length} 条消息应全部显示（显示了 ${shown} 条）`);
    notes.push(`FOMO + 小道消息：消息 ${cv.messages.length} 条全部显示，推荐 ${cv.recs.length} 条`);
    await shot(ctx, '99i-fomo-rumor-chat');
    await shot(ctx, '99j-fomo-rumor-phone', { x: 960, y: 60, width: 320, height: 660 });
    // 第 4 条推荐的快捷键「4」
    await press(ctx, 'Digit4');
    await waitIdle(ctx, '按 4 买第 4 条');
    const want = cv.recs[3]!.stock.id;
    const held = await state<string[]>(ctx, 's.slots.filter(Boolean).map((h) => h.stockId)');
    expect(held.includes(want), `按 4 应买入第 4 条推荐 ${want}（持仓 ${held.join(',')}）`);
    await ctx.page.context().close();
  }
  // G. 没有标题主视觉、玩过几局：小屋 + 纸面板里的按钮和档案一行
  {
    const ctx = await openPage(browser, 'meta-no-keyart', '', { storage: profileStorage('partial'), routes: [{ pattern: '**/scene/title_house.svg', body: '<!doctype html><title>fallback</title>', type: 'text/html' }] });
    await shot(ctx, '99c-title-no-keyart-partial');
    await ctx.page.context().close();
  }
}
