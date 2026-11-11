// --v05 模式：0.5 试玩，选难度开局、真实鼠标键盘打完整局，记时长、每月停几次、弹窗数。
import type { Browser } from 'playwright-core';
import { PHONE, WAIT_MS, buyVia, click, controls, dialogOpen, errors, notes, openPage, press, shot, state, waitFor, waitIdle } from '../harness.ts';

/**
 * 0.5 试玩（--v05）：动画开启、1 倍速、真实鼠标与键盘，从开始菜单「新的一局」选难度开局，打完一整局。
 * 策略同 --playtest（持有跌破 -8% 卖、有空格买战绩最好的群友推荐的）；平淡日有「快进」时按 F，自动快进照默认打开。
 * 记录：一局总时长、每个月停下来等玩家的次数、弹窗数（看点卡、账单、三选一、事件）、
 * 连续"什么都没发生又必须手动点"的最长天数；沿途截看点卡、boss 卡、翻牌、大字、平淡日、自动快进、收盘小结。
 */
export async function playtest05(browser: Browser, level: number, tag: string, seedBase: number, until = 99): Promise<void> {
  const ctx = await openPage(browser, `v05-${tag}`, '');
  await ctx.page.context().addInitScript((base) => {
    const orig = crypto.getRandomValues.bind(crypto);
    let n = 0;
    crypto.getRandomValues = (<T extends ArrayBufferView | null>(a: T): T => {
      if (a instanceof Uint32Array && a.length === 2) {
        a[0] = base + n * 13;
        a[1] = 104729 + n++;
        return a;
      }
      return orig(a as never) as T;
    }) as typeof crypto.getRandomValues;
  }, seedBase);
  await ctx.page.reload();
  await waitIdle(ctx, '开始菜单', "window.__game.scene === 'title'");
  await ctx.page.evaluate(() => window.__game?.setProfile('all'));
  await waitIdle(ctx, '换档案', "window.__game.scene === 'title'");
  await ctx.page.waitForTimeout(400);
  await click(ctx, 'new');
  await dialogOpen(ctx, 'setup:start');
  await click(ctx, `setup:diff:${level}`);
  await ctx.page.waitForTimeout(300);
  await shot(ctx, `${tag}-00-setup`);
  const tStart = Date.now();
  await click(ctx, 'setup:start');
  const report: string[] = [];
  type Month = { stops: number; fast: number; auto: number; cards: number; bills: number; rewards: number; events: number; results: number; bank: number };
  const months = new Map<number, Month>();
  const mon = (m: number): Month => {
    let x = months.get(m);
    if (!x) months.set(m, (x = { stops: 0, fast: 0, auto: 0, cards: 0, bills: 0, rewards: 0, events: 0, results: 0, bank: 0 }));
    return x;
  };
  const shotDone = new Set<string>();
  const once = async (key: string, file: string): Promise<void> => {
    if (shotDone.has(key)) return;
    shotDone.add(key);
    await shot(ctx, `${tag}-${file}`);
  };
  let lastCue = 0;
  let curMonth = 1;
  /** 等画面空闲，顺路截动画中的画面、数弹窗（看点卡、账单）和自动快进的天数。 */
  const settle = async (what: string): Promise<void> => {
    const deadline = Date.now() + WAIT_MS;
    let sawCard = false;
    for (;;) {
      const info = (await ctx.page.evaluate(() => {
        const g = window.__game;
        if (!g) return null;
        const r = g.regions();
        return { idle: g.ready && g.idle, card: 'monthCard' in r, month: g.state().month, phase: g.state().phase, cues: g.cues.map((c) => ({ t: c.t, type: c.cue.type, limit: (c.cue as { limit?: string }).limit ?? null })) };
      })) as { idle: boolean; card: boolean; month: number; phase: string; cues: { t: number; type: string; limit: string | null }[] } | null;
      if (!info) throw new Error('页面没有 __game');
      curMonth = info.month;
      const fresh = info.cues.filter((c) => c.t > lastCue);
      if (fresh.length > 0) lastCue = fresh[fresh.length - 1]!.t;
      for (const c of fresh) {
        if (c.type === 'monthStart') mon(info.month).cards += 1;
        if (c.type === 'bill') mon(info.month).bills += 1;
      }
      if (info.card && !sawCard) {
        sawCard = true;
        const boss = await state<boolean>(ctx, '!!(s.tempo && s.tempo.cur && s.tempo.cur.boss)');
        await ctx.page.waitForTimeout(450);
        if (info.month === 1) await once('card1', '01-month-card');
        else if (boss) await once(`boss${info.month}`, `0${info.month === 4 ? 2 : 3}-boss-card-m${info.month}`);
      }
      if (fresh.some((c) => c.type === 'reveal' && c.limit === 'up')) await once('flipUp', '10-flip-limitup');
      if (fresh.some((c) => c.type === 'reveal' && c.limit === 'down')) await once('flipDown', '11-flip-limitdown');
      if (fresh.some((c) => c.type === 'rewardShow') && info.phase !== 'reward') {
        await ctx.page.waitForTimeout(120);
        await once('shout', '12-shout');
      }
      if (fresh.some((c) => c.type === 'stamp') && info.phase !== 'reward') {
        await ctx.page.waitForTimeout(150);
        await once('stamp', '13-goal-stamp');
      }
      if (info.idle) return;
      if (Date.now() > deadline) throw new Error(`[${ctx.name}] 等待超时：${what}`);
      await ctx.page.waitForTimeout(90);
    }
  };
  await waitFor(ctx, '进入新局', "g.scene === 'trade' && !g.state().phase.startsWith('x')");
  await settle('第一个月');
  let nothingRun = 0;
  let nothingMax = 0;
  let manualDays = 0;
  let autoDays = 0;
  for (let guard = 0; guard < 400; guard++) {
    const phase = await state<string>(ctx, 's.phase');
    if (phase === 'won' || phase === 'lost') break;
    if ((await state<number>(ctx, 's.month')) >= until) break;
    if (phase === 'reward') {
      mon(curMonth).rewards += 1;
      const cards = await state<{ kind: string }[]>(ctx, 's.reward.cards');
      const i = Math.max(0, cards.findIndex((c) => c.kind === 'item'));
      if (!shotDone.has('reward')) await once('reward', '20-reward');
      await click(ctx, `reward:${i}`);
      if (cards[i]?.kind === 'stock') {
        await ctx.page.waitForTimeout(150);
        const slot = Object.keys(await controls(ctx)).find((k) => k.startsWith('slot:'));
        if (slot) await click(ctx, slot);
      }
      await settle('选完奖励');
      continue;
    }
    if (phase === 'event') {
      mon(curMonth).events += 1;
      await press(ctx, 'Digit1');
      for (let k = 0; k < 40; k++) {
        await ctx.page.waitForTimeout(150);
        const st = await ctx.page.evaluate(() => ({ awaiting: window.__game?.awaiting, phase: window.__game?.state().phase, idle: window.__game?.idle }));
        if (st.awaiting) {
          mon(curMonth).results += 1;
          await press(ctx, 'Space');
          await ctx.page.waitForTimeout(200);
          if (await ctx.page.evaluate(() => window.__game?.awaiting)) await press(ctx, 'Space');
          break;
        }
        if (st.phase !== 'event' && !st.awaiting) break;
      }
      await settle('事件之后');
      continue;
    }
    // 开盘前：玩家要做决定（一次"停下"）
    const s0 = await state<{ day: number; month: number; quiet: boolean }>(ctx, '({ day: s.dayIndex, month: s.month, quiet: !!s.today.quiet })');
    const m = mon(s0.month);
    m.stops += 1;
    manualDays += 1;
    let acted = false;
    const c = await controls(ctx);
    if ('fast' in c) await once('quiet', '30-quiet-day');
    const sell = await state<number>(ctx, 's.slots.findIndex((h) => h && h.value < 0.92 && h.boughtDay < s.today.day)');
    if (sell >= 0 && `sell:${sell}` in c) {
      // 「卖出」一步全卖，不再弹菜单
      await click(ctx, `sell:${sell}`);
      await settle('卖出');
      acted = true;
    }
    const buy = await state<number>(
      ctx,
      `(() => { if (!s.slots.some((h) => !h) || s.today.buysLeft <= 0) return -1; const score = (id) => { const f = s.friends.find((x) => x.id === id); return f ? (f.hits + 1) / (f.total + 2) : 0; }; let b = -1; s.today.recs.forEach((r, i) => { if (!r.taken && !r.short && !s.slots.some((h) => h && h.stockId === r.stockId) && (b < 0 || score(r.friendId) > score(s.today.recs[b].friendId))) b = i; }); return b; })()`,
    );
    // 手机上推荐在「推荐」标签页里，没打开时找不到买入键（10-20 以前手机上这里一只都没买成，格子空着就一直不平淡）
    if (!acted && buy >= 0 && PHONE && !(`buy:${buy}` in (await controls(ctx))) && 'tab:recs' in (await controls(ctx))) {
      await click(ctx, 'tab:recs');
      await ctx.page.waitForTimeout(300);
    }
    if (!acted && buy >= 0 && `buy:${buy}` in (await controls(ctx))) {
      await buyVia(ctx, `buy:${buy}`);
      await settle('买入');
      acted = true;
    }
    if (shotDone.has('card1') && !shotDone.has('premarket')) await once('premarket', '31-premarket');
    const useFast = 'fast' in (await controls(ctx));
    if (useFast) {
      m.fast += 1;
      await press(ctx, 'KeyF');
    } else await press(ctx, 'Space');
    await settle(`第 ${s0.day + 1} 天`);
    // 自动快进：看过的那一天之后又自己走了几天
    const after = await state<{ day: number; quiet: boolean | null; pending: boolean }>(ctx, '({ day: s.dayIndex, quiet: s.lastDay && s.lastDay.tempo ? !!s.lastDay.tempo.quiet : null })');
    const auto = Math.max(0, after.day - s0.day - 1);
    autoDays += auto;
    m.auto += auto;
    if (!shotDone.has('recap') && (await state<boolean>(ctx, '!!(s.lastDay && s.lastDay.tempo && s.lastDay.tempo.highlights.length > 0)'))) await once('recap', '40-recap-star');
    if (!shotDone.has('watch') && (await state<boolean>(ctx, '(s.watch || []).some((w) => w.day < s.today.day)'))) await once('watch', '41-chat-watch');
    if (!shotDone.has('big') && (await state<boolean>(ctx, 's.today.messages.some((x) => x.big)'))) await once('big', '42-chat-big');
    // 什么都没发生又得手动点：这一天没买没卖、收盘是平淡日、而且没有被自动快进接走
    if (!acted && after.quiet === true && auto === 0) {
      nothingRun += 1;
      nothingMax = Math.max(nothingMax, nothingRun);
    } else nothingRun = 0;
    if (await ctx.page.evaluate(() => window.__game?.awaiting)) {
      await click(ctx, 'continue');
      await settle('结束页');
    }
  }
  const total = Date.now() - tStart;
  const end = await state<{ phase: string; month: number; account: number; results: unknown }>(ctx, '({ phase: s.phase, month: s.month, account: Math.round(s.account), results: s.tempo ? s.tempo.results : null })');
  if (end.phase === 'won' || end.phase === 'lost') {
    await waitIdle(ctx, '结束页', "window.__game.scene === 'end'");
    await shot(ctx, `${tag}-90-end`);
  }
  report.push(`【${tag}】第 ${level} 级：${end.phase === 'won' ? '通关' : '没撑到最后'}，${end.month} 月，账户 ${end.account}；总时长 ${(total / 1000).toFixed(0)} 秒`);
  report.push(`  手动开盘 ${manualDays} 天、自动快进 ${autoDays} 天；连续"什么都没发生又得手动点"最长 ${nothingMax} 天`);
  for (const [k, x] of [...months.entries()].sort((a, b) => a[0] - b[0])) {
    const pops = x.cards + x.bills + x.rewards + x.events + x.results;
    report.push(`  ${k}月：停下 ${x.stops} 次（其中按 F 快进 ${x.fast}），自动快进 ${x.auto} 天；弹窗 ${pops}（看点卡 ${x.cards}、账单 ${x.bills}、三选一 ${x.rewards}、事件 ${x.events}、事件结果要点 ${x.results}）`);
  }
  report.push(`  月度目标：${JSON.stringify(end.results)}`);
  console.log(report.join('\n'));
  notes.push(...report);
  if (nothingMax >= 3) errors.push(`[${tag}] 连续 ${nothingMax} 天什么都没发生又必须手动点`);
  await ctx.page.context().close();
}
