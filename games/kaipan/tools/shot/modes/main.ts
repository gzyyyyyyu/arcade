// 冒烟模式 --main：主流程（开始菜单、教程、结算动画、月底、结束页、速度档、触屏、竖屏、配色、高分屏，末尾接云存档、排行榜、回大厅、省内存）
import type { Browser } from 'playwright-core';
import { SAVE_FORMAT } from '../../../src/platform/storage.ts';
import { baseBill, createRun, dispatch, totalDays, type GameEvent, type GameState, type RunSetup } from '../../../src/core/index.ts';
import {
  BASIC_SETUP,
  CHAIN_SETUP,
  LIMIT_SETUP,
  OUT,
  PHONE,
  T6,
  advanceTo,
  buyVia,
  click,
  clock,
  controls,
  cueShot,
  quietShot,
  dispatch2,
  dispatchNoWait,
  expect,
  expectNotCovered,
  findDay,
  guideStep,
  hover,
  loadState,
  notes,
  openPage,
  phoneTab,
  press,
  setupQuery,
  shot,
  shots,
  softExpect,
  state,
  step,
  waitCue,
  waitIdle,
  type OpenOpts,
} from '../harness.ts';
import { boardShots } from './board.ts';
import { cloudShots } from './cloud.ts';
import { lobbyShots } from './lobby.ts';
import { lowMemShots } from './lowmem.ts';
import { pressRebuildShots, touchShots } from './touch.ts';

export async function run(browser: Browser): Promise<void> {
  // 1. 开始菜单、设置、关于
  {
    const ctx = await openPage(browser, 'title', '');
    expect((await ctx.page.evaluate(() => window.__game?.scene)) === 'title', '启动后应进入开始菜单');
    await shot(ctx, '01-title');
    await click(ctx, 'settings');
    await quietShot(ctx, '02-settings');
    await click(ctx, 'settings:done');
    await click(ctx, 'about');
    await quietShot(ctx, '03-about');
    await click(ctx, 'about:ok');
    notes.push(`启动耗时（开发服务器、软件渲染、首屏开始菜单）：${await ctx.page.evaluate(() => window.__game?.bootMs)} ms`);
    await ctx.page.context().close();
  }
  // 1b. 启动请求数（到开始菜单可操作为止）：有图集 / 模拟没有图集（入口返回开发服务器的 index.html 回退）
  {
    const isModule = (u: string): boolean => /\/src\/|\/node_modules\/|\/@vite|\/@fs\/|\/@id\//.test(u);
    const count = async (label: string, routes: OpenOpts['routes']): Promise<void> => {
      const reqs: string[] = [];
      const ctx = await openPage(browser, `requests-${label}`, '', { requests: reqs, routes });
      const assets = reqs.filter((u) => !isModule(u));
      const atlas = await ctx.page.evaluate(() => window.__game?.atlas());
      notes.push(`启动请求（${label}，到开始菜单）：资源 ${assets.length} 个（${[...new Set(assets.map((u) => u.split('?')[0]!.split('.').pop()))].map((ext) => `${ext} ${assets.filter((u) => u.split('?')[0]!.endsWith(`.${ext}`)).length}`).join('、')}），另有开发模式的 JS 模块 ${reqs.length - assets.length} 个；图集 ${JSON.stringify(atlas)}`);
      if (label === '有图集') softExpect(atlas?.game.status === 'used' && atlas.game.ready, `应使用 game 图集（${JSON.stringify(atlas)}）`);
      await ctx.page.context().close();
    };
    await count('有图集', []);
    await count('无图集', [{ pattern: '**/assets/art/v3/atlas/**', body: '<!doctype html><title>fallback</title>', type: 'text/html' }]);
  }
  // 1c. 没有标题主视觉时退回小屋 + 纸面板（模拟文件不存在：开发服务器回退成 index.html）
  {
    const ctx = await openPage(browser, 'title-no-keyart', '', { routes: [{ pattern: '**/scene/title_house.svg', body: '<!doctype html><title>fallback</title>', type: 'text/html' }] });
    await shot(ctx, '01b-title-no-keyart');
    expect('new' in (await controls(ctx)), '没有主视觉时标题页也应有「新游戏」');
    await ctx.page.context().close();
  }
  // 1d. 眨眼：待机的小人隔几秒眨一下，而且不会全体一起眨
  {
    const ctx = await openPage(browser, 'blink', `seed=pre-1&idle=1&${setupQuery({ ...BASIC_SETUP })}`);
    let max = 0;
    let seen = 0;
    let shotDone = false;
    const guys = await ctx.page.evaluate(() => window.__game?.countFrames('/calm') ?? 0);
    for (let i = 0; i < 160; i++) {
      const n = await ctx.page.evaluate(() => window.__game?.countFrames('blink') ?? 0);
      if (n > 0) {
        seen += 1;
        max = Math.max(max, n);
        if (!shotDone) {
          await ctx.page.evaluate(() => window.__game?.freeze(true));
          await shot(ctx, '16b-blink', { x: 266, y: 232, width: 700, height: 230 });
          await ctx.page.evaluate(() => window.__game?.freeze(false));
          shotDone = true;
        }
      }
      await ctx.page.waitForTimeout(50);
    }
    const atlas = await ctx.page.evaluate(() => window.__game?.atlas());
    notes.push(`眨眼：约 8 秒内采样到 ${seen} 次闭眼，同时闭眼最多 ${max} 只（calm 小人 ${guys} 只）`);
    if (atlas?.blink) softExpect(seen > 0 && max < Math.max(2, guys), `应能看到眨眼且不同时眨（采样 ${seen}，最多 ${max}/${guys}）`);
    await ctx.page.context().close();
  }
  // 2. 旧版本存档提示
  {
    const legacy = JSON.stringify({ format: 3, appVersion: '0.2.0', savedAt: '2026-10-01T00:00:00Z', state: {} });
    const ctx = await openPage(browser, 'legacy', '', { storage: { 'kaipan.save': legacy, 'kaipan.save.v0.2': legacy, 'kaipan.terms.v04': '[]', 'kaipan.records': '{"version":2}' } });
    await ctx.page.waitForTimeout(200);
    await shot(ctx, '04-legacy-notice');
    expect('notice:ok' in (await controls(ctx)), '应弹出旧存档提示');
    // 0.6.15：旧存档清掉、不再备份；当年留下的备份 key 启动时清掉
    const left = await ctx.page.evaluate(() => ['kaipan.save', 'kaipan.save.v0.2', 'kaipan.terms.v04', 'kaipan.records'].filter((k) => localStorage.getItem(k) !== null));
    expect(left.length === 0, `旧存档和旧备份 key 应清掉（还剩 ${left.join('、')}）`);
    await click(ctx, 'notice:ok');
    await ctx.page.context().close();
  }
  // 3. 有存档：继续
  {
    let s = createRun('save-1').state;
    s = dispatch(s, { type: 'open' }).state;
    const save = JSON.stringify({ format: SAVE_FORMAT, appVersion: 'dev', savedAt: new Date().toISOString(), state: s });
    const ctx = await openPage(browser, 'continue', '', { storage: { 'kaipan.save': save } });
    await shot(ctx, '05-title-continue');
    await click(ctx, 'continue');
    await waitIdle(ctx, '继续', "window.__game.scene === 'trade'");
    expect((await state<number>(ctx, 's.dayIndex')) === 1, '继续应回到存档的第 2 天');
    await ctx.page.context().close();
  }
  // 4. 新游戏 + 分步教程（第 1 天：目标 → 群聊 → 推荐 → 开盘；第 2 天：红涨绿跌 → 题材热度 → 卖出）+ 鼠标买入、开盘
  {
    const ctx = await openPage(browser, 'newgame', '', { guide: true });
    await click(ctx, 'quick');
    await waitIdle(ctx, '新局', "window.__game.scene === 'trade' && 'guide:next' in window.__game.controls()");
    await ctx.page.waitForTimeout(400);
    expect((await guideStep(ctx)) === 'goal', `第 1 天应先讲目标和办法（${await guideStep(ctx)}）`);
    expect(!('hint' in ((await ctx.page.evaluate(() => window.__game?.regions())) ?? {})), '教程期间猫的提示应先隐藏');
    await shot(ctx, '10a-tutorial-0-goal');
    await click(ctx, 'guide:next');
    await ctx.page.waitForTimeout(400);
    expect((await guideStep(ctx)) === 'chat', `第二步应讲群聊（${await guideStep(ctx)}）`);
    await shot(ctx, '10-tutorial-1-chat');
    await click(ctx, 'guide:next');
    await ctx.page.waitForTimeout(400);
    expect((await guideStep(ctx)) === 'rec', `第三步应讲推荐（${await guideStep(ctx)}）`);
    await expectNotCovered(ctx, 'buy:0');
    await shot(ctx, '11-tutorial-2-rec');
    const t0 = await clock(ctx);
    await buyVia(ctx, 'buy:0');
    await waitIdle(ctx, '买入');
    expect((await state<number>(ctx, 's.slots.filter(Boolean).length')) === 1, '点买入后应有 1 只持仓');
    await waitCue(ctx, 'buy', t0);
    await quietShot(ctx, '12-tutorial-3-open', async () => {
      expect((await guideStep(ctx)) === 'open', `买入后应讲开盘（${await guideStep(ctx)}）`);
      await expectNotCovered(ctx, 'open');
    });
    // T+1：当天买入的不能卖。0.4 起持仓按钮是"加 / 卖"（当天可以加仓），所以按钮还在，改为检查规则层的状态
    expect(await state<boolean>(ctx, 's.slots[0] && s.slots[0].boughtDay >= s.today.day'), '当天买入的不能卖（规则层应记为今天买入）');
    await click(ctx, 'open');
    await waitIdle(ctx, '开盘', 'window.__game.state().dayIndex === 1');
    await ctx.page.waitForTimeout(400);
    expect((await guideStep(ctx)) === 'colors', `第一天开盘后应讲红涨绿跌（${await guideStep(ctx)}）`);
    await shot(ctx, '12b-tutorial-colors');
    await click(ctx, 'guide:next');
    await ctx.page.waitForTimeout(400);
    expect((await guideStep(ctx)) === 'heat', `第 2 天应讲题材热度（${await guideStep(ctx)}）`);
    await shot(ctx, '13-tutorial-4-heat');
    // 打断后恢复：重新载入页面，没看完的这一步还在
    await ctx.page.reload();
    await waitIdle(ctx, '重新载入', "window.__game.scene === 'title'");
    await click(ctx, 'continue');
    await waitIdle(ctx, '继续', "window.__game.scene === 'trade'");
    await ctx.page.waitForTimeout(400);
    expect((await guideStep(ctx)) === 'heat', `刷新后应接着讲题材热度（${await guideStep(ctx)}）`);
    await click(ctx, 'guide:next');
    await ctx.page.waitForTimeout(400);
    expect((await guideStep(ctx)) === 'sell', `接着应讲 T+1 与卖出（${await guideStep(ctx)}）`);
    await expectNotCovered(ctx, 'sell:0');
    await expectNotCovered(ctx, 'open');
    await shot(ctx, '13b-tutorial-5-sell');
    expect('sell:0' in (await controls(ctx)), '第二天应能卖出');
    // 跳过全部
    await click(ctx, 'guide:close');
    await ctx.page.waitForTimeout(150);
    const prog = await ctx.page.evaluate(() => window.__game?.tutorial());
    expect(prog?.off === true, '「跳过教程」后应记为关闭');
    expect((await guideStep(ctx)) === null, '跳过后不应再有气泡');
    await ctx.page.context().close();
  }
  // 4b. 教程：连锁、连板 / 炸板、月底月供与奖励（只剩那一步没看过）
  {
    const chainDay = findDay(CHAIN_SETUP, (ev) => ev.some((e) => e.type === 'chain' && e.held.length > 0), 'tchain', 40, (s) => s.dayInMonth < 3);
    const after = dispatch(chainDay.state, { type: 'open' }).state;
    const ctx = await openPage(browser, 'tutorial-chain', `seed=${chainDay.seed}&anim=0&${setupQuery(CHAIN_SETUP)}`, { guide: ['chain'] });
    await loadState(ctx, after);
    await ctx.page.waitForTimeout(300);
    expect((await guideStep(ctx)) === 'chain', `龙头带动后应讲连锁（${await guideStep(ctx)}）`);
    await shot(ctx, '22-tutorial-chain');
    await ctx.page.context().close();
  }
  {
    const held = (ev: GameEvent[]): boolean => {
      const rep = ev.find((e): e is Extract<GameEvent, { type: 'dayClosed' }> => e.type === 'dayClosed')?.report;
      if (!rep) return false;
      const ids = new Set(rep.holdings.map((h) => h.stockId));
      return rep.stocks.some((st) => ids.has(st.id) && (st.boards >= 2 || st.blown));
    };
    const boardDay = findDay(LIMIT_SETUP, held, 'tboards', 40, (s) => s.dayInMonth < 3);
    const after = dispatch(boardDay.state, { type: 'open' }).state;
    const ctx = await openPage(browser, 'tutorial-boards', `seed=${boardDay.seed}&anim=0&${setupQuery(LIMIT_SETUP)}`, { guide: ['boards'] });
    await loadState(ctx, after);
    await ctx.page.waitForTimeout(300);
    if ((await guideStep(ctx)) === 'boards') await shot(ctx, '23-tutorial-boards');
    else softExpect(false, `连板 / 炸板后应讲连板（${await guideStep(ctx)}；可能那只已被自动卖出）`);
    await ctx.page.context().close();
  }
  {
    // 月底：找一个奖励里有道具卡的局面（顺便看道具图标）
    const setup: RunSetup = { themes: T6, holdings: ['ai_leader', 'con_blue'] };
    let reward: GameState | null = null;
    for (let i = 0; i < 100 && !reward; i++) {
      let s = createRun(`treward-${i}`, setup).state;
      while (s.phase === 'premarket') s = dispatch(s, { type: 'open' }).state;
      if (s.phase === 'reward' && s.reward?.cards.some((c) => c.kind === 'item')) reward = s;
    }
    expect(reward !== null, '找不到带道具卡的月底奖励');
    const r = reward as GameState;
    const ctx = await openPage(browser, 'tutorial-bill', `seed=${r.seed}&anim=0&${setupQuery(setup)}`, { guide: ['bill'] });
    await loadState(ctx, r);
    await ctx.page.waitForTimeout(300);
    expect((await guideStep(ctx)) === 'bill', `月底奖励时应讲月供与奖励（${await guideStep(ctx)}）`);
    for (const k of ['reward:0', 'reward:1', 'reward:2', 'reward:skip']) await expectNotCovered(ctx, k);
    await shot(ctx, '24-tutorial-bill-reward');
    await ctx.page.context().close();
  }
  // 5. 盘前全景（4 格）、悬停说明、5 格、满仓替换
  {
    const ctx = await openPage(browser, 'premarket', `seed=pre-1&anim=0&${setupQuery({ ...BASIC_SETUP, items: ['longtou', 'margin', 'mood_meter'] })}`);
    await shot(ctx, '14-premarket-4slots');
    // 手机横屏：风口在右边的「风口」页里，第一行在 (700, 128)；第一张持仓卡、第一个道具也各在别处
    if (PHONE) await click(ctx, 'tab:board');
    await (PHONE ? hover(ctx, 700, 128) : hover(ctx, 120, 160));
    await shot(ctx, '15-tooltip-theme');
    if (PHONE) {
      await click(ctx, 'tab:msgs');
      const c0 = (await controls(ctx))['card:0'];
      if (c0) await hover(ctx, c0.x, c0.y);
    } else await hover(ctx, 340, 300);
    await shot(ctx, '16-tooltip-stock');
    await shot(ctx, '17a-items-topbar', { x: 880, y: 0, width: 400, height: 70 });
    await (PHONE ? hover(ctx, 664, 27) : hover(ctx, 914, 33));
    await shot(ctx, '17-tooltip-item');
    await ctx.page.context().close();
  }
  // 道具攒多了：最多两排，多的收进「+N」，不盖住下面
  {
    const items = ['longtou', 'genfeng', 'baima', 'yaogu', 'lianban', 'dixi', 'zhisun', 'zhiying', 'margin', 'ipo', 'credit', 'paid_group', 'notebook', 'mood_meter', 'hot_money', 'value_eye', 'fan_qunzhu', 'diversify', 'fomo', 'night_review', 'crowd_fund', 'rumor_mill', 'sunglasses', 'banker', 'pyramid'];
    const ctx = await openPage(browser, 'premarket', `seed=pre-1&anim=0&${setupQuery({ ...BASIC_SETUP, items })}`);
    await shot(ctx, '17b-items-overflow');
    await shot(ctx, '17c-items-overflow-bar', { x: 880, y: 0, width: 400, height: 90 });
    expect(await ctx.page.evaluate(() => window.__game?.displayList().some((x) => /^text:\+\d+$/.test(x)) ?? false), '道具超过两排时应收进「+N」');
    await ctx.page.context().close();
  }
  {
    const setup: RunSetup = { themes: T6, items: ['extra_slot'], holdings: ['ai_leader', 'ai_follower', 'con_blue', 'pig_meme', 'ph_leader'] };
    const ctx = await openPage(browser, 'five', `seed=five-1&anim=0&${setupQuery(setup)}`);
    await shot(ctx, '18-five-slots-full');
    const recs = await state<number>(ctx, 's.today.recs.length');
    await phoneTab(ctx, 'recs');
    let i = 0;
    while (i < recs && !(`buy:${i}` in (await controls(ctx)))) i++;
    expect(i < recs, '满仓时推荐卡应提供「换仓」');
    await buyVia(ctx, `buy:${i}`);
    await ctx.page.waitForTimeout(150);
    await shot(ctx, '19-replace-pick');
    await click(ctx, 'slot:1');
    await ctx.page.waitForTimeout(150);
    await shot(ctx, '20-replace-confirm');
    await click(ctx, 'confirm:ok');
    await waitIdle(ctx, '换仓');
    expect((await state<number>(ctx, 's.today.ops')) === 1, '确认换仓后应完成一次操作');
    await shot(ctx, '21-replaced');
    await ctx.page.context().close();
  }
  // 6. 结算动画：热度、揭晓、龙头带动、道具
  {
    const found = findDay(CHAIN_SETUP, (ev) => ev.some((e) => e.type === 'chain' && e.held.length > 0), 'chain');
    const ctx = await openPage(browser, 'chain', `seed=${found.seed}&${setupQuery(CHAIN_SETUP)}`);
    await loadState(ctx, found.state);
    const t0 = await clock(ctx);
    await dispatchNoWait(ctx, { type: 'open' });
    await cueShot(ctx, 'heat', t0, 350, '30-settle-themes');
    await cueShot(ctx, 'reveal', t0, 200, '31-settle-reveal');
    await cueShot(ctx, 'chain', t0, 260, '32-settle-chain');
    const hasItem = await ctx.page.evaluate(() => window.__game?.events().some((e) => e.type === 'itemTriggered'));
    if (hasItem) {
      await cueShot(ctx, 'item', t0, 150, '33-settle-item');
    }
    await cueShot(ctx, 'settle', t0, 500, '34-settle-account');
    await waitIdle(ctx, '结算结束');
    await ctx.page.context().close();
  }
  // 7. 涨停烟花、跌停雨云
  {
    const up = findDay(LIMIT_SETUP, (ev) => ev.some((e) => e.type === 'dayClosed' && e.report.fireworks), 'limitup');
    const ctx = await openPage(browser, 'limitup', `seed=${up.seed}&${setupQuery(LIMIT_SETUP)}`);
    await loadState(ctx, up.state);
    let t0 = await clock(ctx);
    await dispatchNoWait(ctx, { type: 'open' });
    await cueShot(ctx, 'limitUp', t0, 200, '35-limit-up');
    await waitIdle(ctx, '涨停日结束');
    const down = findDay(LIMIT_SETUP, (ev) => ev.some((e) => e.type === 'dayClosed' && e.report.rain), 'limitdown');
    await ctx.page.evaluate(() => window.__game?.newRun('x'));
    await waitIdle(ctx, '换局');
    await loadState(ctx, down.state);
    t0 = await clock(ctx);
    await dispatchNoWait(ctx, { type: 'open' });
    await cueShot(ctx, 'limitDown', t0, 450, '36-limit-down');
    await waitIdle(ctx, '跌停日结束');
    await ctx.page.context().close();
  }
  // 8. 月底：账单、三选一（稀有股票放哪一格）、事件、新月份
  {
    const setup: RunSetup = { themes: T6, holdings: ['ai_leader', 'ai_follower', 'pig_leader', 'con_blue'] };
    let pickSeed = '';
    let stockIdx = -1;
    for (let i = 0; i < 300 && !pickSeed; i++) {
      let s = createRun(`month-${i}`, setup).state;
      while (s.phase === 'premarket') s = dispatch(s, { type: 'open' }).state;
      const si = s.reward?.cards.findIndex((c) => c.kind === 'stock') ?? -1;
      if (s.phase === 'reward' && si >= 0 && dispatch(s, { type: 'pickReward', index: si, slot: 0 }).state.phase === 'event') {
        pickSeed = `month-${i}`;
        stockIdx = si;
      }
    }
    expect(pickSeed !== '', '找不到「稀有股票 + 事件」的种子');
    const ctx = await openPage(browser, 'month', `seed=${pickSeed}&${setupQuery(setup)}`);
    await loadState(ctx, advanceTo(pickSeed, setup, 4));
    const t0 = await clock(ctx);
    await dispatchNoWait(ctx, { type: 'open' });
    await cueShot(ctx, 'stamp', t0, 450, '40-bill-paid');
    await waitIdle(ctx, '三选一', "window.__game.state().phase === 'reward'");
    await quietShot(ctx, '41-reward');
    await click(ctx, `reward:${stockIdx}`);
    await ctx.page.waitForTimeout(150);
    await shot(ctx, '42-reward-pick-slot');
    await click(ctx, 'slot:0');
    await waitIdle(ctx, '事件', "window.__game.state().phase === 'event'");
    await shot(ctx, '43-event');
    await click(ctx, 'event:0');
    await waitIdle(ctx, '事件结果', 'window.__game.awaiting');
    await quietShot(ctx, '44-event-result');
    const t1 = await clock(ctx);
    await click(ctx, 'continue');
    await cueShot(ctx, 'monthStart', t1, 400, '45-month-intro');
    await waitIdle(ctx, '下个月第一天', "window.__game.state().phase === 'premarket'");
    await shot(ctx, '46-month2-day1');
    await ctx.page.context().close();
  }
  // 8b. 突发账单、拐点消息
  {
    const setup: RunSetup = { themes: T6, account: 5_000_000 };
    let bill: GameState | null = null;
    let turn: GameState | null = null;
    for (let i = 0; i < 200 && (!bill || !turn); i++) {
      let s = createRun(`extra-${i}`, setup).state;
      for (let d = 0; d < 40 && s.phase !== 'won' && s.phase !== 'lost'; d++) {
        if (s.phase === 'premarket') {
          if (!turn && s.today.messages.some((m) => m.turn)) turn = s;
          if (!bill && (s.bill.extras?.length ?? 0) > 0 && s.dayInMonth === (s.month === 10 ? 2 : 4)) bill = s;
        }
        s = step(s).state;
      }
    }
    if (turn) {
      const ctx = await openPage(browser, 'turn', `seed=${turn.seed}&anim=0&${setupQuery(setup)}`);
      await loadState(ctx, turn);
      await shot(ctx, '48-chat-turn');
      await ctx.page.context().close();
    } else notes.push('没找到带拐点消息的局面，跳过 48-chat-turn');
    if (bill) {
      const ctx = await openPage(browser, 'surprise', `seed=${bill.seed}&${setupQuery(setup)}`);
      await loadState(ctx, bill);
      const t0 = await clock(ctx);
      await dispatchNoWait(ctx, { type: 'open' });
      await cueShot(ctx, 'stamp', t0, 300, '49-bill-surprise');
      await waitIdle(ctx, '突发账单之后');
      await ctx.page.context().close();
    } else notes.push('没找到带突发账单的局面，跳过 49-bill-surprise');
  }
  // 9. 爆仓（逾期）→ 结束页；通关 → 结束页
  {
    // 开局账户只有 1 月月供的一半：月底必然逾期
    const setup: RunSetup = { themes: T6, account: Math.round(baseBill(1) * 0.5) };
    const ctx = await openPage(browser, 'lost', `seed=lost-1&${setupQuery(setup)}`);
    await loadState(ctx, advanceTo('lost-1', setup, 4));
    const t0 = await clock(ctx);
    await dispatchNoWait(ctx, { type: 'open' });
    await cueShot(ctx, 'stamp', t0, 450, '47-bill-overdue');
    await waitIdle(ctx, '逾期继续', 'window.__game.awaiting');
    await click(ctx, 'continue');
    await waitIdle(ctx, '结束页', "window.__game.scene === 'end'");
    await quietShot(ctx, '50-end-lost');
    // 同种子再来
    await click(ctx, 'retry');
    await waitIdle(ctx, '同种子再来', "window.__game.scene === 'trade'");
    expect((await state<string>(ctx, 's.seed')) === 'lost-1', '同种子再来应沿用种子');
    await ctx.page.context().close();
  }
  {
    const setup: RunSetup = { themes: T6, account: 50_000_000, holdings: ['con_blue', 'fin_blue'] };
    const setup2: RunSetup = { ...setup, themes: ['ai', 'newenergy', 'consumer', 'pharma', 'finance', 'pig'] };
    const last = advanceTo('won-1', setup2, totalDays() - 1);
    const ctx = await openPage(browser, 'won', `seed=won-1&${setupQuery(setup2)}`);
    await loadState(ctx, last);
    await dispatchNoWait(ctx, { type: 'open' });
    await waitIdle(ctx, '通关账单', 'window.__game.awaiting');
    await click(ctx, 'continue');
    await waitIdle(ctx, '结束页', "window.__game.scene === 'end'");
    await quietShot(ctx, '51-end-won');
    // 0.12.0 分享卡（共用包画）：无头 Chromium 不能带文件调系统分享，出预览层；点「保存图片」存下来看一眼，再关掉
    await click(ctx, 'share');
    await ctx.page.waitForSelector('[data-key="share:save"]', { timeout: 15_000 });
    // kit 0.15.1：桌面不调系统分享、直接出预览，多一个「复制图片」（去微信里粘贴）
    expect((await ctx.page.locator('[data-key="share:copy-image"]').count()) === 1, '桌面的分享预览应有「复制图片」');
    // 预览图是异步塞进 img 的：等它解码完再截
    await ctx.page.waitForFunction(() => [...document.querySelectorAll('img')].some((i) => i.complete && i.naturalWidth > 0 && (i.src.startsWith('data:') || i.src.startsWith('blob:'))), null, { timeout: 15_000 });
    await shot(ctx, '51b-share-preview');
    const dl = ctx.page.waitForEvent('download', { timeout: 15_000 });
    await ctx.page.click('[data-key="share:save"]');
    const file = await dl;
    expect(file.suggestedFilename() === 'kaipan-won-1.png', `分享卡文件名 ${file.suggestedFilename()}`);
    await file.saveAs(`${OUT}/51c-share-card.png`);
    shots.push(`${OUT}/51c-share-card.png`);
    await ctx.page.click('[data-key="share:close"]');
    await ctx.page.waitForSelector('[data-key="share:save"]', { state: 'detached' });
    await click(ctx, 'menu');
    await waitIdle(ctx, '回菜单', "window.__game.scene === 'title'");
    await shot(ctx, '52-title-records');
    await ctx.page.context().close();
  }
  // 10. 跳过、4 档速度、减少动态效果（挑一个不是月底的涨停日，免得账单和三选一混进计时）
  {
    const found = findDay(LIMIT_SETUP, (ev) => ev.some((e) => e.type === 'dayClosed' && e.report.fireworks), 'limitup', 40, (s) => s.dayInMonth < 3);
    const durations: Record<string, number> = {};
    for (const [label, q] of [
      ['1×', 'speed=1'],
      ['2×', 'speed=2'],
      ['4×', 'speed=4'],
      ['关闭', 'anim=0'],
    ] as const) {
      const ctx = await openPage(browser, `speed-${label}`, `seed=${found.seed}&${q}&${setupQuery(LIMIT_SETUP)}`);
      await loadState(ctx, found.state);
      // 等 Phaser 启动后的帧时间冷却期过去（见 src/view/game.ts 的 fps.panicMax），否则开头的动画会被拖慢
      await ctx.page.waitForTimeout(1500);
      const t0 = Date.now();
      await dispatch2(ctx, { type: 'open' });
      durations[label] = Date.now() - t0;
      await ctx.page.context().close();
    }
    notes.push(`一天（含动画）的耗时：${Object.entries(durations).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}s`).join('，')}`);
    // 软件渲染只有 7–10 帧，每段等待至少一帧，4× 会碰到这个下限：要求 1× 明显慢于 2×，4× 不慢于 2×（留 15% 抖动），且都比关闭慢
    const d = durations as Record<'1×' | '2×' | '4×' | '关闭', number>;
    softExpect(
      d['1×'] > d['2×'] * 1.2 && d['4×'] < d['2×'] * 1.15 && d['4×'] > d.关闭,
      `动画速度应逐档变快：${JSON.stringify(durations)}`,
    );
    softExpect(durations.关闭! < 1500, `关闭动画时一天应几乎瞬间完成：${durations.关闭} ms`);
    // 跳过：开盘 0.4 秒后按空格
    const ctx = await openPage(browser, 'skip', `seed=${found.seed}&${setupQuery(LIMIT_SETUP)}`);
    await loadState(ctx, found.state);
    const t0 = Date.now();
    await dispatchNoWait(ctx, { type: 'open' });
    await ctx.page.waitForTimeout(400);
    await press(ctx, 'Space');
    await waitIdle(ctx, '跳过');
    const skipped = Date.now() - t0;
    notes.push(`开盘 0.4 秒后按空格跳过：${(skipped / 1000).toFixed(1)}s 回到盘前`);
    softExpect(skipped < durations['1×']! * 0.6, `空格跳过应明显缩短：${skipped} ms`);
    await ctx.page.context().close();
    // 减少动态效果：同一个涨停日，截中途
    const calm = await openPage(browser, 'reduce-motion', `seed=${found.seed}&${setupQuery(LIMIT_SETUP)}`, { settings: { reduceMotion: true } });
    await loadState(calm, found.state);
    const c0 = await clock(calm);
    await dispatchNoWait(calm, { type: 'open' });
    await cueShot(calm, 'limitUp', c0, 300, '53-reduce-motion');
    const tweens = await calm.page.evaluate(() => window.__game?.stats().tweens ?? -1);
    await waitIdle(calm, '减少动态效果结束');
    const idleTweens = await calm.page.evaluate(() => window.__game?.stats().tweens ?? -1);
    notes.push(`减少动态效果：结算中途补间 ${tweens} 个，盘前常驻补间 ${idleTweens} 个`);
    softExpect(idleTweens <= 2, `减少动态效果时不应有常驻的环境补间（${idleTweens}）`);
    await calm.page.context().close();
  }
  // 11. 触屏：不显示快捷键提示；点按完成一天
  await pressRebuildShots(browser);
  await touchShots(browser);
  // 12. 竖屏提示
  {
    const ctx = await openPage(browser, 'portrait', 'seed=demo-1&anim=0', { touch: true, screen: { width: 390, height: 844, dpr: 2 } });
    await ctx.page.waitForTimeout(800);
    await shot(ctx, '61-portrait'); // 竖屏提示层是 DOM，自动化下已停 CSS 动画
    await ctx.page.context().close();
  }
  // 12b. 竖屏打开、再横过来（微信里点开链接最常见的进法）：不带 layout 参数，靠自动判定也要拿到手机布局（0.5.5 审阅）
  {
    const ctx = await openPage(browser, 'rotate', `seed=pre-1&anim=0&${setupQuery(BASIC_SETUP)}`, { touch: true, screen: { width: 390, height: 844, dpr: 2 } });
    await ctx.page.setViewportSize({ width: 844, height: 390 });
    await waitIdle(ctx, '横过来之后');
    await ctx.page.waitForTimeout(600);
    // 0.19.0 手机世界高 404（宽按屏幕比例）：画布高是 404 的整数倍；电脑布局会是 720 的倍数
    const ch = await ctx.page.evaluate(() => document.querySelector('canvas')?.height ?? 0);
    expect(ch > 0 && ch % 404 === 0, `竖屏打开再横过来应是手机布局（画布高 ${ch}，应是 404 的整数倍）`);
    notes.push(`竖屏打开再横过来：画布高 ${ch}`);
    await shot(ctx, '61b-portrait-then-landscape');
    await ctx.page.context().close();
  }
  // 13. 绿涨红跌配色
  {
    const ctx = await openPage(browser, 'intl', `seed=pre-1&anim=0&${setupQuery(BASIC_SETUP)}`, { settings: { colorScheme: 'intl' } });
    await dispatch2(ctx, { type: 'open' });
    await shot(ctx, '62-intl');
    await ctx.page.context().close();
  }
  // 14. 高分屏：同一画面按实际渲染倍数（after）与强制 1 倍（before）各截一块
  const screens: [string, { width: number; height: number; dpr: number }][] = [
    ['1280x720@2', { width: 1280, height: 720, dpr: 2 }],
    ['1920x1080@1', { width: 1920, height: 1080, dpr: 1 }],
  ];
  for (const [label, screen] of screens) {
    for (const mode of ['before', 'after']) {
      const ctx = await openPage(browser, `hidpi-${label}-${mode}`, `seed=pre-1&anim=0&${setupQuery(BASIC_SETUP)}${mode === 'before' ? '&scale=1' : ''}`, { screen });
      const scale = await ctx.page.evaluate(() => window.__game?.renderScale ?? 0);
      if (mode === 'after') notes.push(`渲染倍数 ${label}：${scale}`);
      const k = screen.width / 1280;
      await shot(ctx, `63-hidpi-${label}-${mode}`, { x: 260 * k, y: 220 * k, width: 520 * k, height: 260 * k });
      await ctx.page.context().close();
    }
  }
  await cloudShots(browser);
  await boardShots(browser);
  await lobbyShots(browser);
  if (!PHONE) await lowMemShots(browser);
}
