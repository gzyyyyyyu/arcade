// --live 模式：0.6.0 实盘（假钱包）。
import type { Browser } from 'playwright-core';
import { BALANCE, gearLevered, liveSetup, replay, runSummary, type GameState } from '../../../src/core/index.ts';
import { botByName, playRun, useExt, useMarket } from '../../bots.ts';
import { fakeWallet, profileStorage } from '../fakes.ts';
import { PHONE, type Ctx, type OpenOpts, click, controls, dialogOpen, dispatch2, expect, hasText, loadState, openPage, shot, state, tap, texts, waitFor, waitIdle } from '../harness.ts';

// ---------------------------------------------------------------- 0.6.0 实盘

/**
 * 实盘（设计稿第 8 节第 5 步）：假钱包跑一遍"带入 → 打完 → 结回"、"还没开盘就收手 → 原样退回"、"打到一半刷新 → 接着打 → 结回"、
 * "结回连不上 / 钱包忙 / 平台内部出错 → 重试"、"放太久 → 改成不算筹码"、"带入没等到回话 → 下次先收回"、"另一台设备上有一局"。
 */
export async function liveShots(browser: Browser): Promise<void> {
  const press = (ctx: Ctx, key: string): Promise<void> => (PHONE ? tap(ctx, key) : click(ctx, key));
  const rec = (ctx: Ctx) => ctx.page.evaluate(() => window.__game?.live() ?? null);
  const startLive = async (ctx: Ctx, tier: string, gear = 1): Promise<void> => {
    await press(ctx, 'live');
    await dialogOpen(ctx, `setup:tier:${tier}`);
    await press(ctx, `setup:tier:${tier}`);
    if (gear > 1) await press(ctx, `setup:gear:${gear}`);
    await ctx.page.waitForTimeout(200);
    await press(ctx, 'setup:start');
    await waitIdle(ctx, '实盘开局', "window.__game.scene === 'trade'");
  };
  /** 在 node 里把这局（同一种子、同一设置）打完，交给画面 */
  const finished = (s: GameState): GameState => {
    useMarket(null);
    useExt(true);
    const end = playRun(s.seed, botByName('normal'), s.setup);
    useExt(false);
    return end;
  };
  const opts = (w: ReturnType<typeof fakeWallet>, net = false): OpenOpts => ({ storage: profileStorage('partial'), api: (r) => w.route(r), loginHint: true, touch: PHONE, netErrors: net });

  // A. 带入 → 打完 → 结回
  {
    const w = fakeWallet();
    const ctx = await openPage(browser, 'live-full', '', opts(w));
    await shot(ctx, 'l0-title');
    await press(ctx, 'live');
    await dialogOpen(ctx, 'setup:tier:small');
    expect(await hasText(ctx, '钱包 12,340 筹码（无任何现金价值）'), `开局面板应写钱包余额（${(await texts(ctx)).join(' | ')}）`);
    await press(ctx, 'setup:tier:mid');
    await ctx.page.waitForTimeout(200);
    expect(await hasText(ctx, '带 10,000 进场'), '开始按钮应写"带 10,000 进场"');
    // 0.11.0 杠杆：默认稳健，这局选进取 ×2
    await press(ctx, 'setup:gear:2');
    await ctx.page.waitForTimeout(200);
    await shot(ctx, 'l1-setup-live');
    await press(ctx, 'setup:start');
    await waitIdle(ctx, '实盘开局', "window.__game.scene === 'trade'");
    const r = await rec(ctx);
    const buy = w.calls.find((c) => c.action === 'buyin');
    expect(!!r && r.step === 'playing' && r.tier === 'mid' && r.stake === 10_000, `带入后记录应是 playing（${JSON.stringify(r)}）`);
    expect(!!buy && buy.body.ref === r?.ref && buy.body.tier === 'mid' && buy.xArcade === '1' && Object.keys(buy.body).sort().join() === 'ref,tier', `带入只传 ref 和 tier、带 X-Arcade（${JSON.stringify(buy)}）`);
    const st = await state<GameState>(ctx, 'window.__game.state()');
    expect(st.seed === r?.seed && st.setup?.live?.months === BALANCE.live.months && st.setup.live.tier === 'mid' && st.setup.live.gear?.x === 2 && st.difficulty === 2, `中档打 ${BALANCE.live.months} 个月、难度 2（${JSON.stringify(st.setup)}）`);
    // 电脑上有月度主题时这一格窄，写短的「实盘中档×2 → 约 10,000」；杠杆和约值都得在
    await waitFor(ctx, '顶栏的实盘小牌子', "g.displayList().some((t) => t === 'text:实盘中档×2 → 约 10,000' || t === 'text:实盘 · 中档 10,000 · 杠杆×2 → 约 10,000')");
    await shot(ctx, 'l2-trade-badge');
    const end = finished(st);
    const bp = runSummary(end).live?.bp ?? -1;
    await loadState(ctx, end);
    await waitIdle(ctx, '结束页', "window.__game.scene === 'end'");
    await waitFor(ctx, '结回', "g.live()?.step === 'done'");
    const settle = w.calls.find((c) => c.action === 'settle');
    expect(!!settle && settle.body.ref === r?.ref && settle.body.bp === bp && settle.body.tier === 'mid', `结回应传这局的倍数 ${bp}（${JSON.stringify(settle?.body)}）`);
    const got = Math.floor((10_000 * bp) / 10_000);
    await ctx.page.waitForTimeout(400);
    expect(await hasText(ctx, `带回 ${got.toLocaleString('en-US')} 筹码`), `结束页应写带回 ${got}（${(await texts(ctx)).join(' | ')}）`);
    const c = await controls(ctx);
    expect('menu' in c && !('retry' in c) && !('new' in c), `实盘结束页只有「回开始菜单」（${Object.keys(c).join(',')}）`);
    for (const word of ['回本', '翻本', '再来一把', '就差一点', '马上', '限时']) expect(!(await texts(ctx)).some((t) => t.includes(word)), `结束页不该出现"${word}"`);
    await shot(ctx, 'l3-end-settled');
    await press(ctx, 'menu');
    await waitIdle(ctx, '开始菜单', "window.__game.scene === 'title'");
    await ctx.page.waitForTimeout(300);
    expect(!('notice:ok' in (await controls(ctx))), '结束页说过的结果，开始菜单不再弹');
    await ctx.page.context().close();
  }

  // B. 还没开盘就收手 → 原样退回
  {
    const w = fakeWallet();
    const ctx = await openPage(browser, 'live-refund', '', opts(w));
    await startLive(ctx, 'small');
    await press(ctx, 'settings');
    await dialogOpen(ctx, 'settings:quit-live');
    await shot(ctx, 'l4-settings-quit');
    // 设置里改过东西（关掉时要重建画面）再点收手，确认框照样出来
    await ctx.page.evaluate(() => localStorage.setItem('kaipan.view.prefs', JSON.stringify({ hints: 'auto', recap: 'full', autoQuiet: false })));
    await press(ctx, 'settings:quit-live');
    await dialogOpen(ctx, 'confirm:ok');
    expect(await hasText(ctx, '原样退回'), '还没开盘收手应说原样退回');
    await press(ctx, 'confirm:ok');
    await waitIdle(ctx, '回开始菜单', "window.__game.scene === 'title'");
    await dialogOpen(ctx, 'notice:ok');
    const r = await rec(ctx);
    expect(w.calls.some((c) => c.action === 'refund' && c.body.ref === r?.ref) && !w.calls.some((c) => c.action === 'settle'), '还没开盘收手应走 refund');
    expect(r?.step === 'done' && r.kind === 'refund' && r.credited === 2_000 && w.balance === 12_340, `应原样退回（${JSON.stringify(r)}，余额 ${w.balance}）`);
    expect(await hasText(ctx, '退回 2,000 筹码'), '开始菜单应说退回了多少');
    await shot(ctx, 'l5-title-refund');
    await press(ctx, 'notice:ok');
    await ctx.page.waitForTimeout(300);
    expect(!('continue' in (await controls(ctx))), '收手后这局不能再继续');
    await ctx.page.context().close();
  }

  // C. 打到一半刷新 → 接着打 → 结回；开盘以后收手按现在的资产结
  {
    const w = fakeWallet();
    const ctx = await openPage(browser, 'live-resume', '', opts(w));
    await startLive(ctx, 'small');
    await dispatch2(ctx, { type: 'open' });
    await ctx.page.reload();
    await waitIdle(ctx, '刷新后', "window.__game.scene === 'title'");
    await ctx.page.waitForTimeout(400);
    // 0.14.0 大卡：标题「继续」，下面一行「实盘 · 1月 · 人设」
    expect(await hasText(ctx, '实盘 · 1月'), `刷新后「继续」应写实盘（${(await texts(ctx)).join(' | ')}）`);
    await shot(ctx, 'l6-title-resume');
    // 实盘没打完时开别的局：先问继续还是收手
    await press(ctx, 'quick');
    await dialogOpen(ctx, 'live:continue');
    await shot(ctx, 'l6b-guard');
    await press(ctx, 'live:continue');
    await waitIdle(ctx, '接着打', "window.__game.scene === 'trade'");
    const st = await state<GameState>(ctx, 'window.__game.state()');
    expect(st.dayIndex === 1, '接着打的是刷新前那一局');
    await press(ctx, 'settings');
    await dialogOpen(ctx, 'settings:quit-live');
    await press(ctx, 'settings:quit-live');
    await dialogOpen(ctx, 'confirm:ok');
    expect(await hasText(ctx, '按现在的资产结算'), '开盘以后收手应按现在的资产结');
    await press(ctx, 'confirm:ok');
    await waitIdle(ctx, '回开始菜单', "window.__game.scene === 'title'");
    const settle = w.calls.find((c) => c.action === 'settle');
    expect(!!settle && typeof settle.body.bp === 'number' && !w.calls.some((c) => c.action === 'refund'), `开盘以后收手走 settle（${JSON.stringify(w.calls.map((c) => c.action))}）`);
    // 0.6.7 提前收手也带战绩小结（0.6.5 线上验证时发现漏了）
    const quitStats = (settle?.body as { stats?: { rounds?: number } } | undefined)?.stats;
    expect(quitStats?.rounds === 1, `提前收手的结回也带战绩小结（${JSON.stringify(settle?.body)}）`);
    await ctx.page.context().close();
  }

  // D. 结回连不上 → 钱包忙 → 平台内部出错 → 联网后结上
  {
    const w = fakeWallet();
    const ctx = await openPage(browser, 'live-retry', '', opts(w, true));
    await startLive(ctx, 'small');
    const st = await state<GameState>(ctx, 'window.__game.state()');
    w.fail.settle = 'down';
    await loadState(ctx, finished(st));
    await waitIdle(ctx, '结束页', "window.__game.scene === 'end'");
    await waitFor(ctx, '待结', "g.live()?.step === 'settling' && g.live()?.wait === 'offline'");
    await ctx.page.waitForTimeout(400);
    expect(await hasText(ctx, '成绩记下了，联网后自动带回'), '连不上时结束页说联网后自动带回');
    await shot(ctx, 'l7-end-settling');
    for (const f of ['busy', 'internal']) {
      w.fail.settle = f;
      const n = w.calls.length;
      await ctx.page.evaluate(() => window.dispatchEvent(new Event('online')));
      await waitFor(ctx, `重发（${f}）`, 'true');
      await ctx.page.waitForTimeout(300);
      expect(w.calls.length === n + 1 && (await rec(ctx))?.step === 'settling', `${f} 应留在 settling 之后重试`);
    }
    w.fail.settle = null;
    w.capAt = 1_000;
    await ctx.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await waitFor(ctx, '结上了', "g.live()?.step === 'done'");
    const refs = new Set(w.calls.filter((c) => c.action === 'settle').map((c) => c.body.ref));
    expect(refs.size === 1, '重发的都是同一个 ref');
    await ctx.page.waitForTimeout(400);
    expect(await hasText(ctx, '实盘赢够了'), '到顶时结束页说没进钱包的数');
    // 0.6.5 结回带着战绩小结（平台 5.10），重发时一样
    const stats = w.calls.filter((c) => c.action === 'settle').map((c) => JSON.stringify((c.body as { stats?: unknown }).stats ?? null));
    expect(stats.length > 0 && stats[0] !== 'null' && new Set(stats).size === 1, `结回带着同一份战绩小结：${stats[0]}`);
    await shot(ctx, 'l8-end-capped');
    await ctx.page.context().close();
  }

  // E. 放超过一天 → 不算筹码，接着玩
  {
    const w = fakeWallet();
    const ctx = await openPage(browser, 'live-expired', '', opts(w));
    await startLive(ctx, 'small');
    await ctx.page.evaluate(() => {
      const r = JSON.parse(localStorage.getItem('kaipan.live') ?? '{}') as { until: number };
      r.until = Date.now() - 1000;
      localStorage.setItem('kaipan.live', JSON.stringify(r));
    });
    await ctx.page.reload();
    await waitIdle(ctx, '刷新后', "window.__game.scene === 'title'");
    await dialogOpen(ctx, 'notice:ok');
    expect(await hasText(ctx, '已经原样退回钱包'), '过期应说本金已原样退回');
    expect((await rec(ctx))?.step === 'void' && !w.calls.some((c) => c.action !== 'buyin'), '过期不再找钱包结');
    await shot(ctx, 'l9-title-expired');
    await press(ctx, 'notice:ok');
    await ctx.page.waitForTimeout(300);
    expect((await texts(ctx)).some((t) => t.startsWith('1月 · ')), '过期的局照样能接着玩（不再写实盘）');
    await ctx.page.context().close();
  }

  // F. 带入没等到回话 → 记成 buying，下次打开面板先收回；另一台设备上有一局 → 开不了
  {
    const w = fakeWallet();
    w.fail.buyin = 'down';
    const ctx = await openPage(browser, 'live-buying', '', opts(w, true));
    await press(ctx, 'live');
    await dialogOpen(ctx, 'setup:tier:small');
    await press(ctx, 'setup:start');
    await dialogOpen(ctx, 'notice:ok');
    expect(await hasText(ctx, '钱包暂时连不上'), '带入连不上应提示');
    expect((await rec(ctx))?.step === 'buying' && (await state<string>(ctx, 'window.__game.scene')) === 'title', '带入连不上不开局、记成 buying');
    const ref = (await rec(ctx))?.ref;
    await press(ctx, 'notice:ok');
    w.fail.buyin = null;
    w.stakes.push({ game: 'kaipan', ref: 'kaipan-elsewhere-0000', tier: 'small', amount: 2_000, mode: 'client', at: Date.now(), until: Date.now() + 86_400_000 });
    await press(ctx, 'live');
    await dialogOpen(ctx, 'setup:tier:small');
    expect(w.calls.some((c) => c.action === 'refund' && c.body.ref === ref) && (await rec(ctx)) === null, '再打开面板前先收回没开成的那一份');
    // 0.6.8 桌上有别处的一份不再拦开新局：提示一句，给「回去接着打」「原样退回」
    // 手机上底下一排窄，写短句（0.19.1）
    expect(await hasText(ctx, PHONE ? '没结的实盘 2,000' : '你还有一局实盘没结（2,000 筹码）'), '另一台设备上有一局时应提示还有一局没结');
    const c0 = await controls(ctx);
    expect('setup:aside:resume' in c0 && 'setup:aside:refund' in c0, `给「回去接着打」「原样退回」（${Object.keys(c0).join(',')}）`);
    await shot(ctx, 'l10-setup-elsewhere');
    await press(ctx, 'setup:aside:refund');
    await dialogOpen(ctx, 'confirm:ok');
    await press(ctx, 'confirm:ok');
    await dialogOpen(ctx, 'setup:tier:small');
    expect(w.calls.some((c) => c.action === 'refund' && c.body.ref === 'kaipan-elsewhere-0000'), '「原样退回」退的是别处那一份');
    expect(!(await hasText(ctx, '你还有一局实盘没结')), '退回以后不再提示');
    await press(ctx, 'setup:start');
    await waitIdle(ctx, '照样能开新的一局', "window.__game.scene === 'trade'");
    expect(w.calls.filter((c) => c.action === 'buyin').length === 2, '退回以后开得了新的一局');
    await ctx.page.context().close();
  }

  // F2. 娱乐局打到一半去开实盘：先问"开一局新的？"，确认了才带入
  {
    const w = fakeWallet();
    const ctx = await openPage(browser, 'live-over-fun', '', opts(w));
    await press(ctx, 'quick');
    await waitIdle(ctx, '娱乐开局', "window.__game.scene === 'trade'");
    await dispatch2(ctx, { type: 'open' });
    await press(ctx, 'settings');
    await dialogOpen(ctx, 'settings:menu');
    expect(!('settings:quit-live' in (await controls(ctx))), '娱乐局的设置里没有「提前收手」');
    await press(ctx, 'settings:menu');
    await waitIdle(ctx, '开始菜单', "window.__game.scene === 'title'");
    await press(ctx, 'live');
    await dialogOpen(ctx, 'setup:tier:small');
    await press(ctx, 'setup:start');
    await dialogOpen(ctx, 'confirm:ok');
    expect(w.calls.length === 0, '确认之前不带入');
    await press(ctx, 'confirm:ok');
    await waitIdle(ctx, '实盘开局', "window.__game.scene === 'trade'");
    expect(w.calls.filter((c) => c.action === 'buyin').length === 1 && (await rec(ctx))?.step === 'playing', '确认后带入、开局');
    await ctx.page.context().close();
  }

  // G. 没登录：「实盘」是灰的
  {
    const w = fakeWallet();
    const ctx = await openPage(browser, 'live-out', '', { storage: profileStorage('partial'), api: (r) => w.route(r), touch: PHONE });
    await press(ctx, 'live');
    await ctx.page.waitForTimeout(400);
    expect(!('setup:start' in (await controls(ctx))) && w.calls.length === 0, '没登录点「实盘」不开面板');
    await ctx.page.context().close();
  }

  // H. 0.11.0 杠杆 ×3 跌到清零线：前一天盘前顶栏变红、提醒一句；开盘后弹「清零了」，结束页说按 0 结
  {
    useMarket(null);
    useExt(true);
    const setup = liveSetup('small', 'newbie', 3);
    const gear = setup.live!.gear!;
    let pre: GameState | null = null;
    for (let i = 0; i < 80 && !pre; i++) {
      const end = playRun(`wipe-${i}`, botByName('xiaobai'), setup);
      if (end.endReason !== 'margin') continue;
      const last = end.actions.map((a) => a.type).lastIndexOf('open');
      const s = replay(end.seed, end.actions.slice(0, last), setup, { ext: true });
      const v = gearLevered(s);
      if (s.phase === 'premarket' && v !== null && v <= gear.call + BALANCE.live.warnGap) pre = s;
    }
    useExt(false);
    if (!pre) throw new Error('找不到杠杆 ×3 清零的局面');
    const w = fakeWallet();
    const ctx = await openPage(browser, 'live-wipe', '', opts(w));
    await startLive(ctx, 'small', 3);
    // 实盘记录换成找好的那一局的种子（记录每次都从存储里读）
    await ctx.page.evaluate((seed) => {
      const r = JSON.parse(localStorage.getItem('kaipan.live') ?? '{}') as { seed: string };
      r.seed = seed;
      localStorage.setItem('kaipan.live', JSON.stringify(r));
    }, pre.seed);
    await loadState(ctx, pre);
    await waitIdle(ctx, '交易画面', "window.__game.scene === 'trade'");
    await ctx.page.waitForTimeout(400);
    expect(await hasText(ctx, '离清零线不远了'), `清零前一天应提醒（${(await texts(ctx)).join(' | ')}）`);
    await shot(ctx, 'l11-trade-near-wipe');
    await click(ctx, 'open');
    await waitFor(ctx, '清零卡', "g.displayList().some((t) => t === 'text:清零了')");
    await ctx.page.waitForTimeout(400);
    await shot(ctx, 'l12-trade-wiped');
    await ctx.page.keyboard.press('Space');
    await waitIdle(ctx, '结束页', "window.__game.scene === 'end'");
    await ctx.page.waitForTimeout(400);
    await shot(ctx, 'l13-end-wiped');
    await ctx.page.context().close();
  }
}
