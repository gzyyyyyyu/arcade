// --board 模式：每日排行榜（假平台接口）。
import type { Browser, Route } from 'playwright-core';
import { dailyScore, dailySegmentId, dailySetup, runSummary } from '../../../src/core/index.ts';
import { botByName, playRun, useExt, useMarket } from '../../bots.ts';
import { loadSegment } from '../../segments-disk.ts';
import { beijingToday, profileStorage } from '../fakes.ts';
import { PHONE, type Ctx, click, controls, dialogOpen, expect, loadState, openPage, shot, tap, waitFor, waitIdle } from '../harness.ts';

/**
 * 每日排行榜（假平台接口，不连真的平台）：
 * - 每日挑战面板 →「排行榜」：前 50 名分页、我不在前 50 时单独一行，切到好友；关掉回到每日挑战面板；
 * - 一局真实行情的每日挑战打完：结束页交一次分（带 gameId、榜单、分数、userId，keepalive），再读一次榜显示名次；
 * - 交分时连不上：显示「重试」，点了再交；
 * - 退回模拟行情的一局：不交分，说明不计入排行。
 */
export async function boardShots(browser: Browser): Promise<void> {
  const today = beijingToday();
  const boardId = `daily-${today}-classic`;
  const press = (ctx: Ctx, key: string): Promise<void> => (PHONE ? tap(ctx, key) : click(ctx, key));
  const names = ['老王', '张姐', '股市小诸葛', '韭菜收割机', '小李', '阿强', '老赵', '宝妈', '大V', '小白'];
  const entries = (n: number, meAt: number | null) =>
    Array.from({ length: n }, (_, i) => ({
      rank: i + 1,
      displayName: i + 1 === meAt ? '冒烟' : `${names[i % names.length]}${i >= names.length ? i : ''}`,
      avatar: null,
      score: i < n / 2 ? dailyScore(true, 9_000_000 - i * 120_000, 12) : dailyScore(false, 0, 11 - Math.floor((i - n / 2) / 3)),
      isMe: i + 1 === meAt,
    }));
  const calls: { method: string; path: string; search: string; body: unknown; headers: Record<string, string> }[] = [];
  let scoresDown = false;
  const fake = async (route: Route): Promise<void> => {
    const req = route.request();
    const u = new URL(req.url());
    calls.push({ method: req.method(), path: u.pathname, search: u.search, body: req.postDataJSON() as unknown, headers: req.headers() });
    if (u.pathname === '/api/me') return route.fulfill({ json: { user: { id: 'smoke-user', username: 'smoke', displayName: '冒烟' }, service: 'ok', saves: 'ok' } });
    if (u.pathname === '/api/saves/kaipan' && req.method() === 'GET') return route.fulfill({ json: { saves: [] } });
    if (req.method() === 'PUT') return route.fulfill({ json: { rev: 1, updatedAt: 2 } });
    if (u.pathname === '/api/scores') {
      if (scoresDown) return route.abort('failed');
      const body = req.postDataJSON() as { score: number };
      return route.fulfill({ json: { best: body.score, improved: true } });
    }
    if (u.pathname === `/api/boards/kaipan/${boardId}`) {
      const friends = u.searchParams.get('scope') === 'friends';
      return route.fulfill({ json: friends ? { entries: entries(3, 2), me: { rank: 2, score: entries(3, 2)[1]!.score } } : { entries: entries(50, null), me: { rank: 57, score: dailyScore(false, 0, 6) } } });
    }
    return route.fulfill({ status: 404, json: { error: 'not_found' } });
  };
  {
    const ctx = await openPage(browser, 'board-panel', '', { storage: profileStorage('partial'), api: fake, loginHint: true, touch: PHONE });
    // 0.6.9 今天还没打：「每日挑战」角上写「新题」，不读榜
    await ctx.page.waitForTimeout(400);
    expect(!calls.some((c) => c.path.startsWith('/api/boards/')), '今天没打过，开始菜单不该读榜');
    await shot(ctx, 'b0-title-fresh');
    await press(ctx, 'daily');
    await dialogOpen(ctx, 'daily:board');
    await shot(ctx, 'b1-daily-panel');
    await press(ctx, 'daily:board');
    await dialogOpen(ctx, 'board:next');
    expect(calls.some((c) => c.path === `/api/boards/kaipan/${boardId}` && c.search === '?scope=all'), `应读今天的全站榜 ${boardId}`);
    await shot(ctx, 'b2-board-all');
    await press(ctx, 'board:next');
    await ctx.page.waitForTimeout(200);
    await shot(ctx, 'b3-board-all-p2');
    await press(ctx, 'board:friends');
    await waitFor(ctx, '好友榜', "!('board:next' in g.controls())");
    await ctx.page.waitForTimeout(300);
    expect(calls.some((c) => c.search === '?scope=friends'), '切到好友应读好友榜');
    await shot(ctx, 'b4-board-friends');
    // 榜单叠在每日挑战面板上：Esc 只关榜单，回到面板
    await ctx.page.keyboard.press('Escape');
    await dialogOpen(ctx, 'daily:start');
    expect(!('board:friends' in (await controls(ctx))), 'Esc 后榜单应已关掉');
    await shot(ctx, 'b4b-back-to-daily');
    await ctx.page.context().close();
  }
  {
    // 0.6.9 今天打过：开始菜单读一次全站榜，角上写名次（假榜里我排 57）
    calls.length = 0;
    const st = profileStorage('partial');
    const prof = JSON.parse(st['kaipan.profile']!) as { daily: Record<string, unknown> };
    prof.daily = { ...prof.daily, [today]: { persona: dailySetup(today).setup.persona, difficulty: dailySetup(today).setup.difficulty, attempts: 1, won: false, bestAccount: 0, bestMonths: 6 } };
    const ctx = await openPage(browser, 'board-badge', '', { storage: { ...st, 'kaipan.profile': JSON.stringify(prof) }, api: fake, loginHint: true, touch: PHONE });
    await ctx.page.waitForTimeout(800);
    expect(calls.some((c) => c.path === `/api/boards/kaipan/${boardId}` && c.search === '?scope=all'), '今天打过，开始菜单应读今天的全站榜拿名次');
    await shot(ctx, 'b0-title-rank');
    await ctx.page.context().close();
  }
  // 当天的每日挑战，用冻结段池里当天那一段真实行情，机器人打完
  const d = dailySetup(today);
  const seg = dailySegmentId(today)!;
  useMarket(() => loadSegment(seg));
  useExt(true);
  const ended = playRun(d.seed, botByName('smart'), d.setup);
  useMarket(null);
  useExt(false);
  expect(ended.real?.segId === seg, `每日挑战局应是当天那段真实行情（${ended.real?.segId} / ${seg}）`);
  // 结束页过场之后一个个弹成就、解锁（「这段日子」0.24 起不再自动弹，没有弹窗就别干等）
  const closeUnlocks = async (ctx: Ctx): Promise<void> => {
    for (let k = 0; k < 10; k++) {
      let found = false;
      for (let t = 0; t < 32 && !found; t++) {
        await ctx.page.waitForTimeout(250);
        const c = await controls(ctx);
        found = 'unlock:ok' in c || 'reveal:close' in c;
      }
      if (!found) break;
      await ctx.page.waitForTimeout(300);
      await press(ctx, 'reveal:close' in (await controls(ctx)) ? 'reveal:close' : 'unlock:ok');
      await ctx.page.waitForTimeout(400);
    }
  };
  {
    calls.length = 0;
    scoresDown = false;
    const ctx = await openPage(browser, 'board-end', '', { storage: profileStorage('partial'), api: fake, loginHint: true, touch: PHONE });
    await waitFor(ctx, '云同步', `window.__game?.cloud().state === 'synced'`);
    await loadState(ctx, ended);
    await waitIdle(ctx, '结束页', "window.__game.scene === 'end'");
    await waitFor(ctx, '交分完成', "g.board().state === 'done' && g.board().rank !== undefined");
    const post = calls.filter((c) => c.method === 'POST' && c.path === '/api/scores');
    expect(post.length === 1, `一局只交一次分（${post.length}）`);
    const body = post[0]?.body as { gameId: string; boardId: string; score: number; userId: string } | undefined;
    const want = dailyScore(ended.phase === 'won', ended.account, runSummary(ended).billsPaid);
    expect(!!body && body.gameId === 'kaipan' && body.boardId === boardId && body.score === want && body.userId === 'smoke-user', `交分内容不对：${JSON.stringify(body)}（应是 ${boardId} ${want}）`);
    expect(post[0]?.headers['x-arcade'] === '1', '交分要带 X-Arcade');
    await closeUnlocks(ctx);
    await shot(ctx, 'b5-end-board');
    await press(ctx, 'board');
    await dialogOpen(ctx, 'board:next');
    await shot(ctx, 'b6-end-board-panel');
    await ctx.page.context().close();
  }
  {
    // 交分时连不上：给「重试」，点了再交
    calls.length = 0;
    scoresDown = true;
    const ctx = await openPage(browser, 'board-retry', '', { storage: profileStorage('partial'), api: fake, loginHint: true, touch: PHONE, netErrors: true });
    await waitFor(ctx, '云同步', `window.__game?.cloud().state === 'synced'`);
    await loadState(ctx, ended);
    await waitIdle(ctx, '结束页', "window.__game.scene === 'end'");
    await waitFor(ctx, '交分失败', "g.board().state === 'done' && g.board().result.kind === 'offline'");
    await closeUnlocks(ctx);
    await waitFor(ctx, '重试按钮', "'board:retry' in g.controls()");
    await shot(ctx, 'b7-end-board-offline');
    scoresDown = false;
    await press(ctx, 'board:retry');
    await waitFor(ctx, '重试交上', "g.board().state === 'done' && g.board().result.kind === 'ok'");
    expect(calls.filter((c) => c.path === '/api/scores').length === 2, '重试应再交一次');
    await ctx.page.context().close();
  }
  {
    // 退回模拟行情的一局：不交分
    calls.length = 0;
    const synthetic = playRun(d.seed, botByName('smart'), d.setup);
    const ctx = await openPage(browser, 'board-synthetic', '', { storage: profileStorage('partial'), api: fake, loginHint: true, touch: PHONE });
    await loadState(ctx, synthetic);
    await waitIdle(ctx, '结束页', "window.__game.scene === 'end'");
    await waitFor(ctx, '不计入排行', "g.board().state === 'skip'");
    expect(!calls.some((c) => c.path === '/api/scores'), '模拟行情的局不该交分');
    await ctx.page.context().close();
  }
  {
    // 0.5.11 调试局（不计入档案）：不交分，排行一行写"每日排行 月/日"（0.5.12）、留「排行榜」入口
    calls.length = 0;
    const ctx = await openPage(browser, 'board-none', 'debug=1', { storage: profileStorage('partial'), api: fake, loginHint: true, touch: PHONE });
    await loadState(ctx, ended);
    await waitIdle(ctx, '结束页', "window.__game.scene === 'end'");
    await closeUnlocks(ctx);
    await waitFor(ctx, '排行榜按钮', "g.board().state === 'none' && 'board' in g.controls()");
    expect(!calls.some((c) => c.path === '/api/scores'), '调试局不该交分');
    const rowText = `每日排行 ${String(ended.setup?.daily).slice(5).replace('-', '/')}`;
    const shown = (await ctx.page.evaluate(() => window.__game?.displayList() ?? [])) as string[];
    expect(shown.includes(`text:${rowText}`), `排行一行应写「${rowText}」`);
    await shot(ctx, 'b8-end-board-none');
    await ctx.page.context().close();
  }
  {
    // 0.5.11 云同步没确认账号（第一次问 /api/me 时平台暂停），结束时交分还在问账号就点「大厅」：等交分发出去再走
    calls.length = 0;
    let mes = 0;
    let releaseMe: () => void = () => undefined;
    const meHeld = new Promise<void>((r) => (releaseMe = r));
    const slowMe = async (route: Route): Promise<void> => {
      if (new URL(route.request().url()).pathname === '/api/me' && mes++ === 0) return route.fulfill({ status: 503, json: { error: 'busy' } });
      if (new URL(route.request().url()).pathname === '/api/me') await meHeld;
      return fake(route);
    };
    // 带个参数：页面地址有查询串，才分得清还在本页还是到了大厅 /
    const ctx = await openPage(browser, 'board-lobby', 'anim=0', { storage: profileStorage('partial'), api: slowMe, loginHint: true, touch: PHONE, netErrors: true, holdRequests: true });
    await ctx.page.route((u) => u.pathname === '/' && u.search === '', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>lobby</title>' }));
    await loadState(ctx, ended);
    await waitIdle(ctx, '结束页', "window.__game.scene === 'end'");
    await closeUnlocks(ctx);
    expect(mes === 2 && (await ctx.page.evaluate(() => window.__game?.board().state)) === 'sending', `交分应在等账号（问了 ${mes} 次 /api/me）`);
    // 点一下「大厅」只该发出一次跳转：影子按钮的点击和画布按钮的松手都会触发同一个按钮，跳转发两次的话，
    // 第二次把第一次顶掉，waitForURL 会按「导航被中止」报错（net::ERR_ABORTED）
    const lobbyNavs: string[] = [];
    ctx.page.on('request', (r) => {
      const u = new URL(r.url());
      if (r.isNavigationRequest() && u.pathname === '/' && u.search === '') lobbyNavs.push(r.url());
    });
    await press(ctx, 'lobby');
    await ctx.page.waitForTimeout(300);
    expect(new URL(ctx.page.url()).search !== '', '交分还在问账号时不该马上走');
    // 等的这一会儿有"正在离开……"（0.5.12）
    expect(await ctx.page.evaluate(() => [...document.querySelectorAll('.kp-banner')].some((e) => e.textContent === '正在离开……')), '等交分时应提示正在离开');
    releaseMe();
    await ctx.page.waitForURL((u) => u.pathname === '/' && u.search === '', { timeout: 5000 });
    expect(lobbyNavs.length === 1, `点一下「大厅」应只跳转一次（${lobbyNavs.length} 次）`);
    const post = calls.filter((c) => c.method === 'POST' && c.path === '/api/scores');
    expect(post.length === 1 && (post[0]?.body as { userId?: string } | undefined)?.userId === 'smoke-user', `回大厅前应把分交出去（${JSON.stringify(post.map((c) => c.body))}）`);
    await ctx.page.context().close();
  }
}
