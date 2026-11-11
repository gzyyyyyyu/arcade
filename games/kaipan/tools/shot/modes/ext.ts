// --ext 模式：买多少、加仓 / 减一半、押跌与被轧、银行（借钱、打电话、收走、赎回）、图鉴小知识、带经历的结局。
import type { Browser } from 'playwright-core';
import { BALANCE, bankRisk, bankView, chatView, createRun, dispatch, isBusy, rngFor, runSummary, type Action, type GameState, type RunSetup } from '../../../src/core/index.ts';
import { emptyProfile, recordRun } from '../../../src/platform/profile.ts';
import { botByName } from '../../bots.ts';
import { loadSegment } from '../../segments-disk.ts';
import { PHONE, clock, click, controls, cueShot, dialogOpen, dispatchNoWait, expect, loadState, notes, openPage, openStory, shot, softExpect, step, waitIdle, type Ctx } from '../harness.ts';

export const EXT_TIPS_KEY = 'kaipan.extTips.v1';
export const EXT_SETUP: RunSetup = { persona: 'newbie', difficulty: 1 };

/** 只开盘不操作地推进到第 month 个月的盘前（ext 局）。 */
export function extToMonth(seed: string, setup: RunSetup, month: number): GameState {
  let s = createRun(seed, setup, { ext: true }).state;
  for (let k = 0; k < 400 && !(s.month >= month && s.phase === 'premarket'); k++) s = step(s).state;
  expect(s.month >= month && s.phase === 'premarket', `推进不到 ${month} 月`);
  return s;
}

function must(s: GameState, a: Action): GameState {
  const r = dispatch(s, a);
  if (r.error) throw new Error(`${JSON.stringify(a)}：${r.error}`);
  return r.state;
}

/** 第一条能买的推荐。 */
export function firstRec(s: GameState): number {
  const i = chatView(s).recs.findIndex((r) => !r.taken && !r.error);
  expect(i >= 0, '没有能买的推荐');
  return i;
}

/** 截图前确认画面上没有禁用词（Phaser 画在画布上，这里检查调试桥给的控件名和 DOM 文字）。 */
async function noBannedText(ctx: Ctx): Promise<void> {
  const body = await ctx.page.evaluate(() => document.body.innerText);
  softExpect(!/保证金|维持线|Reg T|margin|融资|融券/.test(body), `[${ctx.name}] 页面上出现了禁用词`);
}

export async function extShots(browser: Browser): Promise<void> {
  // ① 第一天：新玩法提示"买多少"、选仓位弹窗、重仓买入（筹码堆、现金还剩几份、点亮小知识）
  {
    const ctx = await openPage(browser, 'ext-size', 'anim=0');
    const s0 = createRun('ext-demo-1', EXT_SETUP, { ext: true }).state;
    await loadState(ctx, s0);
    await ctx.page.waitForTimeout(300);
    const regs = await ctx.page.evaluate(() => Object.keys(window.__game?.regions() ?? {}));
    softExpect(regs.includes('tip:size'), `[ext-size] 第一天应该出"买多少"的提示（${regs.join(',')}）`);
    // 手机横屏不放这条（持仓顶着顶栏，没地方），还剩几份看空格的悬停和「买多少」
    if (!PHONE) softExpect(regs.includes('cash'), '[ext-size] 持仓区应该写"现金还剩几份"');
    await shot(ctx, 'e01-tip-size');
    await click(ctx, `buy:${firstRec(s0)}`);
    await dialogOpen(ctx, 'size:heavy');
    await shot(ctx, 'e02-buy-dialog');
    await click(ctx, 'size:heavy');
    await waitIdle(ctx, '重仓买入');
    const st = (await ctx.page.evaluate(() => window.__game?.state())) as GameState;
    expect(st.slots.some((h) => (h?.units ?? 1) >= 4), '重仓应该把 4 份全压上');
    await ctx.page.waitForTimeout(200);
    await shot(ctx, 'e03-heavy-bought');
    await noBannedText(ctx);
    await ctx.page.context().close();
  }
  // ② 第二天：手里的股票（提示 → 点卡片 → 加仓 / 减一半）
  {
    let s = createRun('ext-demo-2', EXT_SETUP, { ext: true }).state;
    s = must(s, { type: 'buy', rec: firstRec(s), size: 'taste' });
    s = step(s).state;
    expect(s.phase === 'premarket' && !isBusy(s), '第二天应该能操作');
    const ctx = await openPage(browser, 'ext-holding', 'anim=0', { storage: { [EXT_TIPS_KEY]: JSON.stringify(['size']) } });
    await loadState(ctx, s);
    await ctx.page.waitForTimeout(300);
    await shot(ctx, 'e04-tip-holding');
    const slot = s.slots.findIndex((h) => h);
    await click(ctx, `card:${slot}`);
    await dialogOpen(ctx, 'hold:add');
    await shot(ctx, 'e05-holding-menu');
    await click(ctx, 'hold:add');
    await waitIdle(ctx, '加仓');
    await ctx.page.waitForTimeout(200);
    await shot(ctx, 'e06-added');
    // 卡上的「卖出」现在一步全卖；加仓 / 减一半在旁边的「加减」小按钮里
    await click(ctx, `more:${slot}`);
    await dialogOpen(ctx, 'hold:trim');
    await click(ctx, 'hold:trim');
    await waitIdle(ctx, '减一半');
    await ctx.page.waitForTimeout(200);
    const after = (await ctx.page.evaluate(() => window.__game?.state())) as GameState;
    notes.push(`加仓后减一半：第 ${slot + 1} 格现在 ${after.slots[slot]?.units ?? 0} 份`);
    await shot(ctx, 'e07-trimmed');
    await ctx.page.context().close();
  }
  // ③ 押跌：许可证解锁 → 推荐卡上的"押跌"按钮 → 弹窗里押跌那一行 → 押跌持仓卡（反色、倒着站）
  {
    // 找一局第一天就有空军老周（唱空的群友）建议押跌的推荐
    let s = createRun('ext-demo-3', { ...EXT_SETUP, items: ['short_permit'], friends: ['kongjun'] }, { ext: true }).state;
    for (let i = 0; i < 200; i++) {
      const t = createRun(`ext-demo-3-${i}`, { ...EXT_SETUP, items: ['short_permit'], friends: ['kongjun'] }, { ext: true }).state;
      if (chatView(t).recs.some((r) => r.short && !r.taken && !r.error)) {
        s = t;
        break;
      }
    }
    const ctx = await openPage(browser, 'ext-short', 'anim=0', { storage: { [EXT_TIPS_KEY]: JSON.stringify(['size', 'holding']) } });
    await loadState(ctx, s);
    await ctx.page.waitForTimeout(300);
    await shot(ctx, 'e08-tip-short');
    const recs = chatView(s).recs;
    const hinted = recs.findIndex((r) => r.short && !r.taken && !r.error);
    notes.push(`押跌：唱空群友推荐 ${hinted >= 0 ? `第 ${hinted + 1} 条` : '这一天没有'}`);
    const rec = hinted >= 0 ? hinted : firstRec(s);
    await click(ctx, `short:${rec}`);
    await dialogOpen(ctx, 'short:half');
    await shot(ctx, 'e09-short-dialog');
    await click(ctx, 'short:half');
    await waitIdle(ctx, '押跌买入');
    await ctx.page.waitForTimeout(200);
    await shot(ctx, 'e10-short-card');
    await ctx.page.context().close();
  }
  // ④ 被轧：在 node 里找一天押跌的股票涨停（动画开着，冻结在"被轧了！"那一下）
  {
    let found: GameState | null = null;
    for (let i = 0; i < 200 && !found; i++) {
      let s = createRun(`ext-squeeze-${i}`, { ...EXT_SETUP, items: ['short_permit'] }, { ext: true }).state;
      for (let d = 0; d < 30 && !found && s.phase !== 'won' && s.phase !== 'lost'; d++) {
        if (s.phase === 'premarket' && !isBusy(s) && s.slots.every((h) => !h)) {
          for (const [k, r] of chatView(s).recs.entries()) {
            if (r.taken || r.error) continue;
            const b = dispatch(s, { type: 'buy', rec: k, size: 'half', short: true });
            if (b.error) continue;
            const o = dispatch(b.state, { type: 'open' });
            if (o.events.some((e) => e.type === 'squeezed') && !o.events.some((e) => e.type === 'billPaid' || e.type === 'bankrupt')) {
              found = b.state;
              break;
            }
          }
        }
        if (!found) s = step(s).state;
      }
    }
    expect(found !== null, '找不到被轧的一天');
    const ctx = await openPage(browser, 'ext-squeeze', '', { storage: { [EXT_TIPS_KEY]: JSON.stringify(['size', 'holding', 'short', 'bank', 'call']) } });
    await loadState(ctx, found as GameState);
    const t0 = await clock(ctx);
    await dispatchNoWait(ctx, { type: 'open' });
    await cueShot(ctx, 'thunder', t0, 350, 'e11-squeezed');
    await waitIdle(ctx, '被轧那天收盘');
    await ctx.page.waitForTimeout(300);
    await shot(ctx, 'e12-squeeze-recap');
    await ctx.page.context().close();
  }
  // ⑤ 银行：第 2 个月开门（提示）→ 面板 → 押车借钱 → 面板里有了欠款 → 还钱赎回（动画开着，截彩带）
  {
    const s = extToMonth('ext-bank-1', EXT_SETUP, 2);
    const ctx = await openPage(browser, 'ext-bank', 'anim=0', { storage: { [EXT_TIPS_KEY]: JSON.stringify(['size', 'holding', 'short']) } });
    await loadState(ctx, s);
    await ctx.page.waitForTimeout(300);
    await shot(ctx, 'e13-tip-bank');
    await click(ctx, 'bank');
    await dialogOpen(ctx, 'bank:close');
    await shot(ctx, 'e14-bank-panel');
    await click(ctx, 'bank:borrow:car');
    await waitIdle(ctx, '押车借钱');
    await ctx.page.waitForTimeout(200);
    await shot(ctx, 'e15-borrowed');
    await click(ctx, 'bank');
    await dialogOpen(ctx, 'bank:close');
    await shot(ctx, 'e16-bank-panel-loan');
    await ctx.page.context().close();
    const s2 = must(s, { type: 'borrow', id: 'car' });
    const ctx2 = await openPage(browser, 'ext-redeem', '', { storage: { [EXT_TIPS_KEY]: JSON.stringify(['size', 'holding', 'short', 'bank', 'call']) } });
    await loadState(ctx2, s2);
    await click(ctx2, 'bank');
    await dialogOpen(ctx2, 'bank:repay:car');
    const t0 = await clock(ctx2);
    await click(ctx2, 'bank:repay:car');
    await cueShot(ctx2, 'rewardShow', t0, 450, 'e17-redeemed');
    await ctx2.page.context().close();
  }
  // ⑤b 月底账单里多一行"借钱的利息（另付）"
  {
    let s = must(extToMonth('ext-interest-1', EXT_SETUP, 2), { type: 'borrow', id: 'car' });
    let before: GameState | null = null;
    for (let k = 0; k < 40 && !before; k++) {
      if (s.phase === 'premarket' && dispatch(s, { type: 'open' }).events.some((e) => e.type === 'billPaid')) before = s;
      else s = step(s).state;
    }
    expect(before !== null, '找不到借了钱的月底');
    const ctx = await openPage(browser, 'ext-interest', '', { storage: { [EXT_TIPS_KEY]: JSON.stringify(['size', 'holding', 'short', 'bank', 'call']) } });
    await loadState(ctx, before as GameState);
    const t0 = await clock(ctx);
    await dispatchNoWait(ctx, { type: 'open' });
    await cueShot(ctx, 'stamp', t0, 400, 'e25-bill-interest');
    await ctx.page.context().close();
  }
  // ⑥ 银行打电话、东西被收走：押了东西重仓，把账户压到线边上，找一天下跌
  for (const [kind, line, file] of [['bankCalled', 1.41, 'e18-bank-call'], ['seized', 1.21, 'e20-seized']] as const) {
    let found: GameState | null = null;
    for (let i = 0; i < 60 && !found; i++) {
      let s = extToMonth(`ext-${kind}-${i}`, EXT_SETUP, 2);
      s = must(s, { type: 'borrow', id: 'car' });
      s = must(s, { type: 'borrow', id: 'bracelet' });
      for (let d = 0; d < 15 && !found && s.phase !== 'won' && s.phase !== 'lost'; d++) {
        if (s.phase === 'premarket' && !isBusy(s)) {
          let t = s;
          if (t.slots.every((h) => !h)) {
            const k = chatView(t).recs.findIndex((r) => !r.taken && !r.error);
            if (k >= 0) t = must(t, { type: 'buy', rec: k, size: 'heavy' });
          }
          if (t.slots.some((h) => h)) {
            const c = structuredClone(t);
            let debt = 0;
            for (const l of c.ext?.loans ?? []) debt += l.amount;
            c.account = Math.round(debt * line);
            const o = dispatch(c, { type: 'open' });
            if (o.events.some((e) => e.type === kind) && !o.events.some((e) => e.type === 'billPaid' || e.type === 'bankrupt')) found = c;
          }
          s = t;
        }
        if (!found) s = step(s).state;
      }
    }
    expect(found !== null, `找不到 ${kind} 的一天`);
    const ctx = await openPage(browser, `ext-${kind}`, 'anim=0', { storage: { [EXT_TIPS_KEY]: JSON.stringify(['size', 'holding', 'short', 'bank']) } });
    await loadState(ctx, found as GameState);
    await dispatchNoWait(ctx, { type: 'open' });
    await waitIdle(ctx, kind, 'window.__game.awaiting');
    await ctx.page.waitForTimeout(300);
    await shot(ctx, file);
    await ctx.page.evaluate(() => window.__game?.continue());
    await waitIdle(ctx, `${kind} 之后`);
    await ctx.page.waitForTimeout(300);
    if (kind === 'bankCalled') await shot(ctx, 'e19-call-next-day');
    else await shot(ctx, 'e21-seized-after');
    await ctx.page.context().close();
  }
  // ⑥b 月底付账单那天：开盘前猫先提醒会被收走；付完账单真被收走时，卡片写清是账单压垮的
  {
    let found: GameState | null = null;
    for (let i = 0; i < 20 && !found; i++) {
      let s = must(extToMonth(`ext-billseize-${i}`, EXT_SETUP, 2), { type: 'borrow', id: 'car' });
      for (let d = 0; d < 40 && s.phase !== 'won' && s.phase !== 'lost' && !found; d++) {
        if (s.phase === 'premarket' && bankRisk({ ...s, account: 0 }) !== null) {
          const c = structuredClone(s);
          const b = bankView(c);
          c.account = Math.round(b.debt * (BALANCE.ext.seizeLine - 0.1) + c.bill.amount + b.monthlyInterest);
          const o = dispatch(c, { type: 'open' });
          if (bankRisk(c)?.kind === 'seize' && o.events.some((e) => e.type === 'seized' && e.cause === 'bill') && o.events.some((e) => e.type === 'billPaid')) found = c;
          break;
        }
        s = step(s).state;
      }
    }
    expect(found !== null, '找不到付完账单被收走的一天');
    const ctx = await openPage(browser, 'ext-billseize', 'anim=0', { storage: { [EXT_TIPS_KEY]: JSON.stringify(['size', 'holding', 'short', 'bank', 'call']) } });
    await loadState(ctx, found as GameState);
    await ctx.page.waitForTimeout(400);
    await shot(ctx, 'e20b-bank-risk');
    await dispatchNoWait(ctx, { type: 'open' });
    // 同一天可能先"银行来电"再"收走"：一张张点过去，截到收走那张
    let seen = false;
    for (let k = 0; k < 4 && !seen; k++) {
      await waitIdle(ctx, '付完账单被收走', 'window.__game.awaiting');
      await ctx.page.waitForTimeout(300);
      seen = await ctx.page.evaluate(() => window.__game?.displayList().some((x) => x.includes('付完月底账单')) ?? false);
      if (seen) await shot(ctx, 'e20c-seized-bill');
      await ctx.page.evaluate(() => window.__game?.continue());
    }
    expect(seen, '付完账单被收走时，卡片应写明是月底账单压垮的');
    await ctx.page.context().close();
  }
  // ⑦ 带着这些经历打完一局真实行情（赌徒机器人：重仓、押跌、押东西借钱）→ "这段日子" → 结束页 → 图鉴小知识
  {
    let profile = emptyProfile();
    let best: { s: GameState; last: Action; score: number; seg: string } | null = null;
    for (const segId of ['2008-10-crash', '1999-03-bull', '2007-11-bear']) {
      const seg = loadSegment(segId);
      for (let i = 0; i < 6; i++) {
        const seed = `ext-story-${segId}-${i}`;
        const bot = botByName('gambler')();
        const rng = rngFor(seed, 'shot-ext');
        let s = createRun(seed, { ...EXT_SETUP, items: ['short_permit'] }, { segment: seg, ext: true }).state;
        for (let k = 0; k < 4000; k++) {
          let a = bot.act(s, rng);
          if (isBusy(s) && a.type !== 'open' && a.type !== 'borrow' && a.type !== 'repay') a = { type: 'open' };
          const r = dispatch(s, a, { events: false });
          if (r.error) {
            s = dispatch(s, { type: s.phase === 'reward' ? 'skipReward' : s.phase === 'event' ? 'choose' : 'open', option: 0 } as Action, { events: false }).state;
            continue;
          }
          if (r.state.phase === 'won' || r.state.phase === 'lost') {
            const sum = runSummary(r.state);
            const score = (sum.recap?.length ?? 0) + (r.state.ext?.log.borrowed.length ?? 0) + (r.state.ext?.log.shorts ? 1 : 0);
            if (!best || score > best.score) best = { s, last: a, score, seg: segId };
            profile = recordRun(profile, sum, '2026-10-12').profile;
            break;
          }
          s = r.state;
        }
      }
    }
    expect(best !== null, '赌徒机器人应该能打完一局');
    const b = best as { s: GameState; last: Action; score: number; seg: string };
    notes.push(`经历最多的一局：${b.seg}，${b.s.seed}`);
    const ctx = await openPage(browser, 'ext-story', 'anim=0');
    await loadState(ctx, b.s);
    await dispatchNoWait(ctx, b.last);
    for (let k = 0; k < 8; k++) {
      await waitIdle(ctx, '最后一天', "window.__game.awaiting || window.__game.scene === 'end'");
      if ((await ctx.page.evaluate(() => window.__game?.scene)) === 'end') break;
      await ctx.page.evaluate(() => window.__game?.continue());
    }
    await openStory(ctx);
    await ctx.page.waitForTimeout(500);
    await shot(ctx, 'e22-story');
    await click(ctx, 'reveal:close');
    await waitIdle(ctx, '结束页');
    await ctx.page.waitForTimeout(300);
    for (let k = 0; k < 6; k++) {
      const c = await controls(ctx);
      if ('reveal' in c && 'menu' in c && !Object.keys(c).some((x) => x.includes(':'))) break;
      const key = Object.keys(c).find((x) => x.endsWith(':close') || x.endsWith(':ok') || x === 'ok');
      if (!key) break;
      await click(ctx, key);
      await ctx.page.waitForTimeout(400);
    }
    await shot(ctx, 'e23-end');
    await noBannedText(ctx);
    await ctx.page.context().close();
    // 图鉴"小知识"：点亮一部分
    profile.knowledge = ['size', 'heavy', 'short', 'squeeze', 'borrow', 'call', 'seize'];
    const ctx3 = await openPage(browser, 'ext-codex', 'anim=0', { storage: { 'kaipan.profile': JSON.stringify(profile) } });
    await click(ctx3, 'codex');
    await dialogOpen(ctx3, 'codex:close');
    await click(ctx3, 'codex:tab:knowledge');
    await ctx3.page.waitForTimeout(300);
    await shot(ctx3, 'e24-codex-knowledge');
    await ctx3.page.context().close();
  }
}
