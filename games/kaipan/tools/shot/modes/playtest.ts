// --playtest 模式：动画开启、1 倍速、真实鼠标与键盘从开始菜单玩起，报告每天耗时与点击次数。
import type { Browser } from 'playwright-core';
import { buyVia, click, clock, controls, errors, guideStep, openPage, press, shot, state, waitIdle, type Ctx } from '../harness.ts';

// ---------------------------------------------------------------- 试玩

type CueLog = { t: number; cue: { type: string; name?: string } }[];

export async function cueCounts(ctx: Ctx, from: number, to = Infinity): Promise<Record<string, number>> {
  const log = (await ctx.page.evaluate(() => window.__game?.cues ?? [])) as CueLog;
  const out: Record<string, number> = {};
  for (const { t, cue } of log) {
    if (t < from || t >= to) continue;
    const k = cue.type === 'ui' ? `ui.${cue.name ?? '?'}` : cue.type;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export const fmt = (c: Record<string, number>): string =>
  Object.entries(c)
    .filter(([k]) => k !== 'ui.hover' && k !== 'countUp')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}×${v}`)
    .join(' ');

/**
 * 实时试玩（动画开启、1 倍速、真实鼠标与键盘）：从开始菜单「新游戏」进入。普通玩家策略：
 * 有空格就买群友战绩最好的人推荐的那只；持有收益跌破 -8% 就卖。前两个月看完整动画，
 * 之后每天开盘后按空格跳过动画，直到本局结束。报告每天的耗时与点击次数。
 */
export async function playtest(browser: Browser): Promise<void> {
  const ctx = await openPage(browser, 'playtest', '', { guide: true });
  // 固定「随机」种子，保证每次试玩同一局
  await ctx.page.context().addInitScript(() => {
    const orig = crypto.getRandomValues.bind(crypto);
    let n = 0;
    crypto.getRandomValues = (<T extends ArrayBufferView | null>(a: T): T => {
      if (a instanceof Uint32Array && a.length === 2) {
        a[0] = 7919 + n * 13;
        a[1] = 104729 + n++;
        return a;
      }
      return orig(a as never) as T;
    }) as typeof crypto.getRandomValues;
  });
  // 记下最近的输入（排查偶发「奖励被选掉」用）
  await ctx.page.context().addInitScript(() => {
    const w = window as unknown as { __inputs: string[] };
    w.__inputs = [];
    for (const t of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'keydown']) {
      window.addEventListener(t, (e) => {
        const p = e as PointerEvent & KeyboardEvent;
        w.__inputs.push(`${Math.round(performance.now())} ${t} ${p.key ?? ''}${p.clientX !== undefined ? `${Math.round(p.clientX)},${Math.round(p.clientY)}` : ''}`);
        if (w.__inputs.length > 40) w.__inputs.shift();
      }, true);
    }
  });
  await ctx.page.reload();
  await waitIdle(ctx, '开始菜单', "window.__game.scene === 'title'");
  await click(ctx, 'quick');
  await waitIdle(ctx, '进入新局', "window.__game.scene === 'trade'");
  const report: string[] = [];
  const times: number[] = [];
  const clicks: number[] = [];
  const seen = new Set<string>();
  // 教程：像新玩家一样，每冒出一步就读完点「知道了」（第一次出现时截图）
  const tutorialSeen: string[] = [];
  const ackGuide = async (): Promise<void> => {
    for (let k = 0; k < 6; k++) {
      const st = await guideStep(ctx);
      if (!st) return;
      if (!tutorialSeen.includes(st)) {
        tutorialSeen.push(st);
        await ctx.page.waitForTimeout(250);
        await shot(ctx, `7${tutorialSeen.length}-playtest-tutorial-${st}`);
      }
      // 要动手的步骤（买入、开盘、卖出）没有「下一步」：交给后面的正常流程去点
      if (!('guide:next' in (await controls(ctx)))) return;
      await click(ctx, 'guide:next');
      await ctx.page.waitForTimeout(250);
    }
  };
  // --until-month=N：打到第 N 月开头就停（复现前几个月的问题时用，不走结束页）
  const until = Number(process.argv.find((x) => x.startsWith('--until-month='))?.split('=')[1] ?? 0);
  for (let guard = 0; guard < 200; guard++) {
    const phase = await state<string>(ctx, 's.phase');
    if (phase === 'won' || phase === 'lost') break;
    if (until > 0 && (await state<number>(ctx, 's.month')) >= until) {
      console.log(report.join('\n'));
      await ctx.page.context().close();
      return;
    }
    await ackGuide();
    if (phase === 'reward') {
      const from = await clock(ctx);
      const cards = await state<{ kind: string }[] | null>(ctx, 's.reward ? s.reward.cards : null');
      const i = Math.max(0, (cards ?? []).findIndex((c) => c.kind === 'item'));
      // 偶发：点完引导的「知道了」奖励已经被选掉了。把现场留下来（哪张被选、最近的 cue、事件、画面）
      if (!cards || !(`reward:${i}` in (await controls(ctx)))) {
        await shot(ctx, '68-playtest-reward-gone');
        const dump = await ctx.page.evaluate(() => {
          const g = window.__game;
          const s = g?.state();
          return { phase: s?.phase, month: s?.month, items: s?.items, slots: s?.slots?.map((h) => h?.stockId ?? null), controls: Object.keys(g?.controls() ?? {}), cues: (g?.cues ?? []).slice(-20), now: Math.round(performance.now()), inputs: (window as unknown as { __inputs?: string[] }).__inputs?.slice(-16) };
        });
        throw new Error(`[playtest] 奖励卡不见了：${JSON.stringify(dump)}`);
      }
      await click(ctx, `reward:${i}`);
      let n = 1;
      if (cards[i]?.kind === 'stock') {
        await ctx.page.waitForTimeout(100);
        const c = await controls(ctx);
        const slot = Object.keys(c).find((k) => k.startsWith('slot:'));
        if (slot) {
          await click(ctx, slot);
          n++;
        }
      }
      await waitIdle(ctx, '选完奖励');
      for (const k of Object.keys(await cueCounts(ctx, from))) seen.add(k);
      report.push(`  月度奖励：选了第 ${i + 1} 张（${cards[i]?.kind}），点击 ${n} 次`);
      continue;
    }
    if (phase === 'event') {
      await press(ctx, 'Digit1');
      // 接着就是新月份时，结果写进月初的看点卡里，没有单独的结果页（trade/monthFlow.ts 的 playAfterEvent）
      await waitIdle(ctx, '事件结果', "window.__game.awaiting || window.__game.state().phase === 'premarket'").catch(async (e: unknown) => {
        await shot(ctx, '69-playtest-stuck');
        throw e;
      });
      // 结果页的账户数字可能还在滚：第一下空格只快进动画，再按一下才继续
      for (let k = 0; k < 3 && (await ctx.page.evaluate(() => window.__game?.awaiting)); k++) {
        await press(ctx, 'Space');
        await ctx.page.waitForTimeout(300);
      }
      // 继续之后还有新月份开场：等它播完
      await waitIdle(ctx, '事件之后', "!window.__game.awaiting && window.__game.state().phase === 'premarket'");
      report.push('  事件：按 1 选第一个，空格继续');
      continue;
    }
    const day = await state<number>(ctx, 's.dayIndex + 1');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: 这是交给页面 eval 的表达式，${} 要在页面里才展开
    const label = await state<string>(ctx, '`${s.month}月第${s.dayInMonth + 1}天`');
    const fast = day > 10;
    const c0 = await clock(ctx);
    const t0 = Date.now();
    const ops: string[] = [];
    // 卖：持有收益跌破 -8% 的第一只
    const sell = await state<number>(ctx, 's.slots.findIndex((h, i) => h && h.value < 0.92 && h.boughtDay < s.today.day)');
    if (sell >= 0) {
      await click(ctx, `sell:${sell}`);
      await waitIdle(ctx, '卖出');
      ops.push('卖出');
    }
    // 买（当天没卖时）：有空格时买战绩最好的群友推荐的
    const buy = await state<number>(
      ctx,
      `(() => { if (!s.slots.some((h) => !h) || s.today.buysLeft <= 0) return -1; const score = (id) => { const f = s.friends.find((x) => x.id === id); return f ? (f.hits + 1) / (f.total + 2) : 0; }; let b = -1; s.today.recs.forEach((r, i) => { if (!r.taken && !s.slots.some((h) => h && h.stockId === r.stockId) && (b < 0 || score(r.friendId) > score(s.today.recs[b].friendId))) b = i; }); return b; })()`,
    );
    if (sell < 0 && buy >= 0 && `buy:${buy}` in (await controls(ctx))) {
      await buyVia(ctx, `buy:${buy}`);
      await waitIdle(ctx, '买入');
      ops.push('买入');
    }
    const tOpen = Date.now();
    await press(ctx, 'Space');
    ops.push('空格开盘');
    if (fast) {
      await ctx.page.waitForFunction(() => !window.__game?.idle, null, { timeout: 5000 }).catch(() => {});
      await ctx.page.waitForTimeout(250);
      await press(ctx, 'Space');
    }
    // 月底账单：逾期 / 通关时要点「继续」
    await waitIdle(ctx, `第 ${day} 天`);
    if (await ctx.page.evaluate(() => window.__game?.awaiting)) {
      await click(ctx, 'continue');
      ops.push('继续');
      await waitIdle(ctx, '结束页');
    }
    const animMs = Date.now() - tOpen;
    const total = Date.now() - t0;
    const fps = await ctx.page.evaluate(() => window.__game?.fps ?? 0);
    const counts = await cueCounts(ctx, c0);
    for (const k of Object.keys(counts)) seen.add(k);
    const dayOps = ops.filter((o) => o !== '继续').length;
    if (!fast) {
      times.push(animMs);
      clicks.push(dayOps);
    }
    const acc = await state<number>(ctx, 'Math.round(s.account)');
    report.push(
      `${label}${fast ? '（空格跳过）' : ''}：操作 ${ops.length} 次（${ops.join('、')}），开盘到下一步可操作 ${(animMs / 1000).toFixed(1)} 秒，共 ${(total / 1000).toFixed(1)} 秒，帧率约 ${fps.toFixed(0)}；账户 ${acc}；cue：${fmt(counts)}`,
    );
  }
  const end = await state<{ phase: string; month: number; account: number }>(ctx, '({ phase: s.phase, month: s.month, account: Math.round(s.account) })');
  await waitIdle(ctx, '结束页', "window.__game.scene === 'end'");
  await shot(ctx, '70-playtest-end');
  const avg = times.reduce((a, b) => a + b, 0) / Math.max(1, times.length);
  report.push(`本局结束：${end.phase === 'won' ? '通关' : '没还上，游戏结束'}，${end.month} 月，账户 ${end.account}`);
  report.push(`教程出现的步骤（按顺序）：${tutorialSeen.join(' → ') || '无'}`);
  report.push(`前 10 天（完整动画）平均开盘到可操作 ${(avg / 1000).toFixed(1)} 秒，最长 ${(Math.max(...times) / 1000).toFixed(1)} 秒；每天操作最多 ${Math.max(...clicks)} 次`);
  report.push(`运行时统计 ${JSON.stringify(await ctx.page.evaluate(() => window.__game?.stats()))}`);
  report.push(`触发过的 cue：${[...seen].sort().join(' ')}`);
  console.log(report.join('\n'));
  if (Math.max(...clicks) > 2) errors.push('[playtest] 每天操作应不超过 2 次（买 / 卖 + 开盘）');
  await ctx.page.context().close();
}
