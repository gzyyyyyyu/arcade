// --weekly 模式：本周市场（假平台接口）。
import type { Browser, Route } from 'playwright-core';
import { weeklyInfo, weeklySegmentId, weeklySetup } from '../../../src/core/index.ts';
import { beijingIsoWeek } from '../../../src/view/labels.ts';
import { botByName, playRun, useExt, useMarket } from '../../bots.ts';
import { loadSegment } from '../../segments-disk.ts';
import { profileStorage } from '../fakes.ts';
import { PHONE, type Ctx, click, controls, dialogOpen, expect, hasText, loadState, openPage, shot, tap, waitFor, waitIdle } from '../harness.ts';

/**
 * 本周市场（假平台接口）：开始菜单有「本周市场」卡 → 面板 → 开始 → 三选一界面上写着这周规则（反向群聊那周是红字）→ 群聊最上面常驻规则横条；
 * 一局真实行情的本周市场打完：结束页交一次分到 week-周号-rules、读榜显示名次、点「排行榜」看周榜。
 */
export async function weeklyShots(browser: Browser): Promise<void> {
  const week = beijingIsoWeek();
  const info = weeklyInfo(week);
  const boardId = `week-${week}-rules`;
  const press = (ctx: Ctx, key: string): Promise<void> => (PHONE ? tap(ctx, key) : click(ctx, key));
  const calls: { method: string; path: string; body: unknown }[] = [];
  const names = ['老王', '张姐', '股市小诸葛', '韭菜收割机', '小李', '阿强'];
  const fake = async (route: Route): Promise<void> => {
    const req = route.request();
    const u = new URL(req.url());
    calls.push({ method: req.method(), path: u.pathname, body: req.method() === 'POST' ? (req.postDataJSON() as unknown) : null });
    if (u.pathname === '/api/me') return route.fulfill({ json: { user: { id: 'smoke-user', username: 'smoke', displayName: '冒烟' }, service: 'ok', saves: 'ok' } });
    if (u.pathname === '/api/saves/kaipan' && req.method() === 'GET') return route.fulfill({ json: { saves: [] } });
    if (req.method() === 'PUT') return route.fulfill({ json: { rev: 1, updatedAt: 2 } });
    if (u.pathname === '/api/scores') return route.fulfill({ json: { best: (req.postDataJSON() as { score: number }).score, improved: true } });
    if (u.pathname === `/api/boards/kaipan/${boardId}`) {
      const entries = names.map((n, i) => ({ rank: i + 1, displayName: i === 2 ? '冒烟' : n, avatar: null, score: 180_000 - i * 9_000, isMe: i === 2 }));
      return route.fulfill({ json: { entries, me: { rank: 3, score: 162_000 } } });
    }
    return route.fulfill({ status: 404, json: { error: 'not_found' } });
  };
  {
    // 开始菜单 → 面板 → 开局
    const ctx = await openPage(browser, 'weekly-play', '', { storage: profileStorage('partial'), api: fake, loginHint: true, touch: PHONE });
    expect('weekly' in (await controls(ctx)), '开始菜单应有「本周市场」卡');
    await shot(ctx, 'w1-title');
    await press(ctx, 'weekly');
    await dialogOpen(ctx, 'daily:start');
    expect(await hasText(ctx, `本周市场 · ${week}`), '面板标题应写周号');
    expect(await hasText(ctx, info.name), '面板应写这周规则名');
    await shot(ctx, 'w1b-panel');
    await press(ctx, 'daily:start');
    await waitIdle(ctx, '三选一', "window.__game.state().phase === 'reward'");
    await ctx.page.waitForTimeout(500);
    // 手机上只写前半句（见 monthEnd 的 RewardPanel）
    expect(await hasText(ctx, `本周规则：${PHONE ? info.line.split(/[：，]/)[0]! : info.line}`), '三选一界面应写这周规则的一句话');
    await shot(ctx, 'w2-rule-banner');
    await press(ctx, 'reward:0');
    await waitIdle(ctx, '第一天盘前', "window.__game.state().phase === 'premarket'");
    await ctx.page.waitForTimeout(600);
    expect(await hasText(ctx, info.line.startsWith('本周群友') ? '本周群友说的全是反话' : `本周 · ${info.name}`), '群聊最上面应常驻规则横条');
    expect(await hasText(ctx, '本周市场 · 还剩 10 天'), '顶栏应写本周市场和剩余天数');
    await shot(ctx, 'w3-chat-banner');
    await ctx.page.context().close();
  }
  // 一局打完：真实行情（本周冻结段）
  const d = weeklySetup(week);
  useMarket(() => loadSegment(weeklySegmentId(week) as string));
  useExt(true);
  const ended = playRun(d.seed, botByName('smart'), d.setup);
  useMarket(null);
  useExt(false);
  {
    calls.length = 0;
    const ctx = await openPage(browser, 'weekly-end', '', { storage: profileStorage('partial'), api: fake, loginHint: true, touch: PHONE });
    await waitFor(ctx, '云同步', `window.__game?.cloud().state === 'synced'`);
    await loadState(ctx, ended);
    await waitIdle(ctx, '结束页', "window.__game.scene === 'end'");
    await waitFor(ctx, '交分完成', "g.board().state === 'done' && g.board().rank !== undefined");
    const post = calls.filter((c) => c.method === 'POST' && c.path === '/api/scores');
    expect(post.length === 1, `一局只交一次分（${post.length}）`);
    const body = post[0]?.body as { boardId: string; score: number } | undefined;
    expect(!!body && body.boardId === boardId && body.score === Math.round(ended.account), `交分内容不对：${JSON.stringify(body)}（应是 ${boardId} ${Math.round(ended.account)}）`);
    await ctx.page.waitForTimeout(2600);
    expect(await hasText(ctx, '本周排名'), '结束页应写「本周排名」');
    expect(await hasText(ctx, `本周「${info.name}」`), '结束页应写这周规则');
    await shot(ctx, 'w4-end');
    await press(ctx, 'board');
    await dialogOpen(ctx, 'board:friends');
    expect(await hasText(ctx, '本周市场排行'), '周榜面板标题');
    await shot(ctx, 'w5-board-panel');
    await ctx.page.context().close();
  }
}
