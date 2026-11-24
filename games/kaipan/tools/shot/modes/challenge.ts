// --challenge 模式：0.13.0 好友挑战（假平台接口）。
import type { Browser, Route } from 'playwright-core';
import { BALANCE, type GameState, type RunSetup } from '../../../src/core/index.ts';
import { botByName, playRun, useExt, useMarket } from '../../bots.ts';
import { profileStorage } from '../fakes.ts';
import { PHONE, type Ctx, click, controls, dialogOpen, errors, expect, hasText, loadState, openPage, shot, state, texts, waitFor, waitIdle } from '../harness.ts';

// ---------------------------------------------------------------- 0.13.0 好友挑战

/**
 * 假平台上走一遍好友挑战（docs/platform-integration.md 第 5 节）：发起人打完一局点「挑战好友」→ 拿到链接；
 * 好友打开链接 → 挑战卡 → 接受 → 打完同一局 → 交成绩 → 结束页一行写名次、点「看成绩」看成绩表。
 * 再试一次指定的行情段下载不了：不退回模拟行情，提示一句、不开局。
 */
export async function challengeShots(browser: Browser): Promise<void> {
  const ID = 'lqsmoke01';
  type Created = { game: string; payload: { seed: string; setup: RunSetup; segment: string | null; v: string }; score: number };
  // 在路由回调里赋值：用 as 免得 TS 把它收窄成 null
  let created = null as Created | null;
  const results: { userId: string; displayName: string; score: number; stats: unknown }[] = [];
  let payloadOverride: unknown = null;
  const api = (userId: string, displayName: string) => async (route: Route): Promise<void> => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === '/api/me') return route.fulfill({ json: { user: { id: userId, username: userId, displayName }, service: 'ok', saves: 'ok' } });
    if (req.method() === 'GET' && path === '/api/saves/kaipan') return route.fulfill({ json: { saves: [] } });
    if (req.method() === 'PUT') return route.fulfill({ json: { rev: 1, updatedAt: 1 } });
    if (req.method() === 'POST' && path === '/api/challenges') {
      if (req.headers()['x-arcade'] !== '1') errors.push('[challenge] 发起没带 X-Arcade');
      created = req.postDataJSON() as typeof created;
      results.push({ userId, displayName, score: created!.score, stats: (req.postDataJSON() as { stats: unknown }).stats });
      return route.fulfill({ json: { id: ID, until: Date.now() + 30 * 86_400_000 } });
    }
    if (req.method() === 'GET' && path === `/api/challenges/${ID}`) {
      if (!created) return route.fulfill({ status: 404, json: { error: 'not_found' } });
      const sorted = [...results].sort((x, y) => y.score - x.score);
      const mine = sorted.findIndex((r) => r.userId === userId);
      return route.fulfill({
        json: {
          game: 'kaipan',
          payload: payloadOverride ?? created.payload,
          owner: { userId: 'smoke-owner', displayName: '老王' },
          until: Date.now() + 86_400_000,
          results: sorted.map((r, i) => ({ rank: i + 1, ...r, isMe: r.userId === userId })),
          count: sorted.length,
          me: mine < 0 ? null : { rank: mine + 1, score: sorted[mine]!.score, stats: sorted[mine]!.stats },
        },
      });
    }
    if (req.method() === 'POST' && path === `/api/challenges/${ID}/results`) {
      const b = req.postDataJSON() as { score: number; stats: unknown };
      if (results.some((r) => r.userId === userId)) return route.fulfill({ json: { result: 'already', mine: {} } });
      results.push({ userId, displayName, score: b.score, stats: b.stats });
      return route.fulfill({ json: { result: 'ok' } });
    }
    return route.fulfill({ status: 404, json: { error: 'not_found' } });
  };
  /** 在 node 里把这局（同一种子、同一设置）打完，交给画面 */
  /** 结束页先弹的达成、解锁弹窗一个个关掉 */
  const closePopups = async (ctx: Ctx): Promise<void> => {
    // 弹窗一个接一个出来，中间隔着动画：连着 1.5 秒没有新弹窗才算关完
    for (let k = 0; k < 8; k++) {
      let key: string | null = null;
      for (let t = 0; t < 6 && !key; t++) {
        await ctx.page.waitForTimeout(250);
        const c = await controls(ctx);
        key = 'reveal:close' in c ? 'reveal:close' : 'unlock:ok' in c ? 'unlock:ok' : null;
      }
      if (!key) return;
      await click(ctx, key);
    }
  };
  const finish = (seed: string, setup: RunSetup): GameState => {
    useMarket(null);
    useExt(true);
    const end = playRun(seed, botByName('normal'), setup);
    useExt(false);
    return end;
  };

  // A. 发起：打完一局短局，结束页点「挑战好友」，弹出链接框
  {
    const ctx = await openPage(browser, 'challenge-make', '', { storage: profileStorage('partial'), api: api('smoke-owner', '老王'), loginHint: true, touch: PHONE });
    await waitFor(ctx, '云同步认出账号', `['merged', 'synced'].includes(window.__game?.cloud().state ?? '')`);
    await loadState(ctx, finish('ch-smoke-1', { persona: 'newbie', difficulty: 1, short: { months: 5, billMult: BALANCE.short.billMult, goal: BALANCE.short.goal[0]! } }));
    await waitIdle(ctx, '结束页', "window.__game.scene === 'end'");
    await closePopups(ctx);
    await waitFor(ctx, '「挑战好友」', "'challenge' in g.controls()");
    await shot(ctx, 'h1-end-challenge');
    await click(ctx, 'challenge');
    await dialogOpen(ctx, 'challenge:copy');
    expect(created?.game === 'kaipan' && created.payload.seed === 'ch-smoke-1' && created.payload.setup.persona === 'newbie' && !!created.payload.setup.short, `发起交的 payload 不对：${JSON.stringify(created)}`);
    await shot(ctx, 'h2-challenge-link');
    await ctx.page.context().close();
  }

  // B. 好友打开链接：挑战卡 → 接受 → 打完 → 交成绩 → 名次 → 成绩表
  {
    const ctx = await openPage(browser, 'challenge-take', `challenge=${ID}`, { storage: profileStorage('partial'), api: api('smoke-friend', '小李'), loginHint: true, touch: PHONE });
    await dialogOpen(ctx, 'challenge:accept');
    expect(await hasText(ctx, '老王 挑战你'), '挑战卡应写谁发起的');
    expect(!(await ctx.page.evaluate(() => location.search.includes('challenge='))), '读完挑战应从地址里去掉 ?challenge=');
    await shot(ctx, 'h3-challenge-card');
    await click(ctx, 'challenge:accept');
    await waitIdle(ctx, '挑战开局', "window.__game.scene === 'trade'");
    const st = await state<GameState>(ctx, 'window.__game.state()');
    const p = created!.payload;
    expect(st.seed === p.seed && st.persona === p.setup.persona && st.difficulty === p.setup.difficulty && (st.real?.segId ?? null) === p.segment, '接受后应是同一个开局');
    await loadState(ctx, finish(st.seed, st.setup!));
    await waitIdle(ctx, '结束页', "window.__game.scene === 'end'");
    await closePopups(ctx);
    await waitFor(ctx, '「看成绩」', "'challenge:results' in g.controls()");
    for (let i = 0; i < 20 && !(await hasText(ctx, '共 2 人')); i++) await ctx.page.waitForTimeout(250);
    expect(await hasText(ctx, '共 2 人'), `结束页应写挑战里的名次和人数（${(await texts(ctx)).join(' | ')}）`);
    expect(results.some((r) => r.userId === 'smoke-friend'), '应交了好友的成绩');
    await shot(ctx, 'h4-end-challenge-done');
    await click(ctx, 'challenge:results');
    for (let i = 0; i < 20 && !(await hasText(ctx, '发起的挑战')); i++) await ctx.page.waitForTimeout(250);
    expect(await hasText(ctx, '老王 发起的挑战'), '应打开成绩表');
    await shot(ctx, 'h5-challenge-results');
    await ctx.page.context().close();
  }

  // C. 指定的行情段下载不了：不退回模拟行情，提示一句、留在开始菜单
  {
    payloadOverride = { ...created!.payload, segment: 'nosuchseg' };
    results.length = 1;
    const ctx = await openPage(browser, 'challenge-noseg', `challenge=${ID}`, { storage: profileStorage('partial'), api: api('smoke-friend2', '小张'), loginHint: true, touch: PHONE });
    await dialogOpen(ctx, 'challenge:accept');
    await click(ctx, 'challenge:accept');
    await dialogOpen(ctx, 'notice:ok');
    expect(await hasText(ctx, '行情没下载下来'), '段下载不了应提示');
    expect((await ctx.page.evaluate(() => window.__game?.scene)) === 'title', '段下载不了不该开局');
    await ctx.page.context().close();
    payloadOverride = null;
  }
}
