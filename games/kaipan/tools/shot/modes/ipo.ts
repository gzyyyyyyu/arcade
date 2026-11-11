// --ipo 模式：打新（玩家看到的叫「抽新股」，设计见 docs/design.md 第 18 节）。申购日横条 → 申购面板 → 申购 → 出签（摇号）→ 新股持仓，另跑几条边界：
// 申购后刷新读档、申购按钮连点只算一次、减少动态效果、回开始菜单再继续、断网也照常（打新纯本地，不发网络请求）。
// 电脑 1280×720 一套；加 --phone 时 844×390 横屏一套，外加 390×844 竖屏（点「照样玩」）的一套。
import type { Browser } from 'playwright-core';
import { ipoToday, ipoWon, type BuySize, type GameState, type IpoOffer } from '../../../src/core/index.ts';
import {
  PHONE,
  clock,
  controls,
  cueShot,
  dialogOpen,
  expect,
  notes,
  openPage,
  point,
  shot,
  step,
  waitIdle,
  waitFor,
  click,
  loadState,
  tap,
  type Ctx,
} from '../harness.ts';

/** 开一局真实行情的娱乐局（和玩家从开始菜单开新局一样的设置），返回开局后的状态。 */
async function startReal(ctx: Ctx, seed: string): Promise<GameState> {
  const r = await ctx.page.evaluate((sd) => window.__game?.newRun(sd, { persona: 'newbie', difficulty: 1 }) ?? { error: '无' }, seed);
  expect(!r.error, `newRun 失败：${r.error}`);
  await waitIdle(ctx, '真实行情开局', `window.__game.scene === 'trade'`);
  const st = (await ctx.page.evaluate(() => window.__game?.state())) as GameState;
  expect(!!st.real && !!st.ext, '打新要用真实行情的普通娱乐局');
  return st;
}

/** 在 node 里什么都不买地推进到第一个申购日的盘前；走不到返回 null。 */
function toIpoDay(s0: GameState): { state: GameState; offer: IpoOffer } | null {
  let s = structuredClone(s0);
  for (let k = 0; k < 150 && s.phase !== 'won' && s.phase !== 'lost'; k++) {
    const offer = s.phase === 'premarket' ? ipoToday(s) : null;
    if (offer) return { state: s, offer };
    s = step(s).state;
  }
  return null;
}

/**
 * 找一局：wantWin 为真时挑「重仓能中签」的种子（中了签才有新股持仓可截），否则取第一个有申购日的种子。
 * 中签只看种子、月份和档位（ipoWon），和 core 一致。
 */
async function findRun(ctx: Ctx, prefix: string, wantWin: boolean): Promise<{ seed: string; state: GameState; offer: IpoOffer }> {
  let fallback: { seed: string; state: GameState; offer: IpoOffer } | null = null;
  for (let i = 0; i < 25; i++) {
    const seed = `${prefix}-${i}`;
    const found = toIpoDay(await startReal(ctx, seed));
    if (!found) continue;
    const hit = { seed, state: found.state, offer: found.offer };
    if (!wantWin) return hit;
    fallback ??= hit;
    if (ipoWon(seed, found.offer, 'heavy')) return hit;
  }
  if (fallback) {
    notes.push(`打新：${prefix} 没找到重仓中签的种子，改用 ${fallback.seed}`);
    return fallback;
  }
  throw new Error(`[${ctx.name}] 找不到有申购日的真实行情局`);
}

async function press(ctx: Ctx, key: string, touch: boolean): Promise<void> {
  if (touch) await tap(ctx, key);
  else await click(ctx, key);
}

/** 连点两下（间隔不到 50 毫秒）：申购只能算一次。 */
async function doubleClick(ctx: Ctx, key: string, touch: boolean): Promise<void> {
  const p = await point(ctx, key);
  if (touch) {
    await ctx.page.touchscreen.tap(p.x, p.y);
    await ctx.page.touchscreen.tap(p.x, p.y);
  } else {
    await ctx.page.mouse.click(p.x, p.y);
    await ctx.page.mouse.click(p.x, p.y);
  }
}

const state = (ctx: Ctx): Promise<GameState> => ctx.page.evaluate(() => window.__game?.state()) as Promise<GameState>;
const frozenCount = (s: GameState): number => s.slots.filter((h) => h?.ipo?.stage === 'frozen').length;

/** 点开盘直到某一天（dayIndex 到 day）；每次等动画和结算播完。 */
async function openUntil(ctx: Ctx, day: number, touch: boolean): Promise<void> {
  for (let k = 0; k < 8; k++) {
    const s = await state(ctx);
    if (s.dayIndex >= day || s.phase === 'won' || s.phase === 'lost') return;
    await press(ctx, 'open', touch);
    await waitIdle(ctx, `开盘到第 ${s.dayIndex + 1} 天`, `window.__game.state().dayIndex > ${s.dayIndex}`);
    await ctx.page.waitForTimeout(150);
  }
}

interface FlowOpts {
  /** 截图文件名前缀；不截图的子流程不给 */
  tag: string;
  win: boolean;
  /** 动画开着（截摇号）；关掉时一切瞬间到位 */
  anim: boolean;
  touch: boolean;
  /** 竖屏：先点「照样玩」 */
  portrait?: boolean;
  /** 要截的图：banner 横条、panel 申购面板、frozen 申购中的卡、draw 摇号、listed 新股持仓 */
  want: ('banner' | 'panel' | 'frozen' | 'draw' | 'listed')[];
}

/** 主流程：横条 → 申购面板 → 申购（连点两下）→ 出签 → 新股持仓；控制台零报错由入口统一判。 */
async function mainFlow(browser: Browser, name: string, o: FlowOpts): Promise<void> {
  const screen = o.portrait ? { width: 390, height: 844, dpr: 2 } : undefined;
  const ctx = await openPage(browser, name, o.anim ? 'speed=4' : 'anim=0', { touch: o.touch, ...(screen ? { screen } : {}) });
  if (o.portrait) {
    await ctx.page.locator('#rotate-hint .rh-play').tap();
    await ctx.page.waitForTimeout(500);
  }
  const { seed, state: st0, offer } = await findRun(ctx, `ipo-${o.tag}`, o.win);
  await loadState(ctx, st0);
  const want = (k: FlowOpts['want'][number]): boolean => o.want.includes(k);
  await ctx.page.waitForTimeout(400);
  // 横条：申购日盘前就在群聊里
  const c0 = await controls(ctx);
  expect('ipo' in c0, `申购日盘前应有「打新」横条（可用：${Object.keys(c0).join(', ')}）`);
  expect(await ctx.page.evaluate(() => window.__game?.displayList().some((t) => t.startsWith('text:') && t.includes('抽新股')) ?? false), '横条上应写着「抽新股」');
  if (want('banner')) await shot(ctx, `${o.tag}-banner`);
  // 申购面板：三档
  await press(ctx, 'ipo', o.touch);
  await dialogOpen(ctx, 'ipo:taste');
  const c1 = await controls(ctx);
  expect('ipo:half' in c1 && 'ipo:heavy' in c1, '申购面板应有试一口、半仓、重仓三档');
  if (want('panel')) await shot(ctx, `${o.tag}-panel`);
  const size: BuySize = o.win && ipoWon(seed, offer, 'heavy') ? 'heavy' : 'taste';
  await doubleClick(ctx, `ipo:${size}`, o.touch);
  await waitIdle(ctx, '申购');
  await ctx.page.waitForTimeout(300);
  const s1 = await state(ctx);
  expect(frozenCount(s1) === 1, `连点两下只应申购一次（冻结 ${frozenCount(s1)} 格）`);
  expect(s1.stats.ipo?.subs === 1, `打新统计应记 1 次申购（${JSON.stringify(s1.stats.ipo)}）`);
  expect(!('ipo' in (await controls(ctx))), '申购后横条应收起');
  if (want('frozen')) await shot(ctx, `${o.tag}-frozen`);
  // 出签：到出签那天收盘（摇号动画中途截一张）
  await openUntil(ctx, offer.drawDay, o.touch);
  if (o.anim && want('draw')) {
    const t = await clock(ctx);
    await press(ctx, 'open', o.touch);
    // 冒烟用 4 倍速（speed=4），摇号约 0.26 秒转球、再 0.3 秒翻出结果：冻结在约 0.35 秒处正好是翻出的结果
    await cueShot(ctx, 'ipo', t, 200, `${o.tag}-draw`);
  } else await press(ctx, 'open', o.touch);
  await waitIdle(ctx, '出签收盘', `window.__game.state().dayIndex > ${offer.drawDay}`);
  await ctx.page.waitForTimeout(300);
  const s2 = await state(ctx);
  const won = ipoWon(seed, offer, size);
  const listed = s2.slots.some((h) => h?.ipo?.stage === 'listed');
  expect(listed === won, `出签结果应和规则一致（中签 ${won}，持仓里有新股 ${listed}）`);
  expect(frozenCount(s2) === 0, '出签后不应还有申购中的格子');
  notes.push(`打新 ${name}：种子 ${seed}，${size === 'heavy' ? '重仓' : '试一口'}，${won ? '中签' : '没中'}`);
  // 新股持仓：上市首日收盘后，持仓格里有带「新」角标的卡
  if (won) {
    await openUntil(ctx, offer.listDay + 1, o.touch);
    const s3 = await state(ctx);
    expect(s3.slots.some((h) => h?.ipo?.stage === 'listed'), '上市后新股应在持仓里');
    if (want('listed')) await shot(ctx, `${o.tag}-listed`);
  }
  await ctx.page.context().close();
}

/** 边界：刷新读档、回菜单再继续、断网、减少动态效果的结果都和规则核心推出来的一致。 */
async function edgeFlow(browser: Browser): Promise<void> {
  const reqs: string[] = [];
  const ctx = await openPage(browser, 'ipo-edge', 'anim=0', { requests: reqs });
  const { seed, state: st0, offer } = await findRun(ctx, 'ipo-edge', true);
  await loadState(ctx, st0);
  await press(ctx, 'ipo', false);
  await dialogOpen(ctx, 'ipo:heavy');
  const size: BuySize = ipoWon(seed, offer, 'heavy') ? 'heavy' : 'taste';
  await click(ctx, `ipo:${size}`);
  await waitIdle(ctx, '申购');
  const before = await state(ctx);
  expect(frozenCount(before) === 1, '申购后应有一格申购中');
  // 刷新页面：读档后申购中的卡还在
  await ctx.page.reload();
  await waitIdle(ctx, '重新载入', "window.__game.scene === 'title'");
  await click(ctx, 'continue');
  await waitIdle(ctx, '继续', "window.__game.scene === 'trade'");
  const afterReload = await state(ctx);
  expect(frozenCount(afterReload) === 1 && afterReload.dayIndex === before.dayIndex, '刷新读档后申购中的格子应还在');
  expect(await ctx.page.evaluate(() => window.__game?.displayList().some((t) => t.startsWith('text:') && t.includes('申购中')) ?? false), '读档后画面上应画出「申购中」卡');
  // 中途回开始菜单再继续
  await click(ctx, 'settings');
  await dialogOpen(ctx, 'settings:menu');
  await click(ctx, 'settings:menu');
  await waitIdle(ctx, '开始菜单', "window.__game.scene === 'title'");
  await click(ctx, 'continue');
  await waitIdle(ctx, '回到对局', "window.__game.scene === 'trade'");
  const afterMenu = await state(ctx);
  expect(frozenCount(afterMenu) === 1 && afterMenu.dayIndex === before.dayIndex, '回菜单再继续后申购中的格子应还在');
  // 断网：出签、上市照常（打新纯本地）。页面已经载完，之后任何网络请求都算多余
  await ctx.page.context().setOffline(true);
  const n0 = reqs.length;
  await openUntil(ctx, offer.drawDay + 1, false);
  const drawn = await state(ctx);
  const won = ipoWon(seed, offer, size);
  expect(drawn.slots.some((h) => h?.ipo?.stage === 'listed') === won, '断网后出签结果应和规则一致');
  if (won) await openUntil(ctx, offer.listDay + 1, false);
  const extra = reqs.slice(n0).filter((u) => !u.startsWith('data:') && !u.startsWith('blob:'));
  expect(extra.length === 0, `打新不应发网络请求（多了：${extra.join(', ')}）`);
  await ctx.page.context().setOffline(false);
  await ctx.page.context().close();
}

/** 减少动态效果（动画开着）：摇号只淡入淡出，照样出结果，不报错。 */
async function calmFlow(browser: Browser): Promise<void> {
  const ctx = await openPage(browser, 'ipo-calm', 'speed=4', { settings: { reduceMotion: true } });
  const { seed, state: st0, offer } = await findRun(ctx, 'ipo-calm', true);
  await loadState(ctx, st0);
  await press(ctx, 'ipo', false);
  await dialogOpen(ctx, 'ipo:heavy');
  const size: BuySize = ipoWon(seed, offer, 'heavy') ? 'heavy' : 'taste';
  await click(ctx, `ipo:${size}`);
  await waitIdle(ctx, '申购');
  await openUntil(ctx, offer.drawDay, false);
  const t = await clock(ctx);
  await press(ctx, 'open', false);
  await waitFor(ctx, '出签的音效', `g.cues.some((c) => c.t >= ${t} && c.cue.type === 'ipo')`);
  await waitIdle(ctx, '出签收盘', `window.__game.state().dayIndex > ${offer.drawDay}`);
  const s = await state(ctx);
  expect(s.slots.some((h) => h?.ipo?.stage === 'listed') === ipoWon(seed, offer, size), '减少动态效果时出签结果也应一致');
  await ctx.page.context().close();
}

export async function ipoShots(browser: Browser): Promise<void> {
  // --edge-only：只跑边界（调试用）
  if (process.argv.includes('--edge-only')) {
    await edgeFlow(browser);
    await calmFlow(browser);
    return;
  }
  if (!PHONE) {
    // 电脑 1280×720：面板、申购中、摇号（动画开着）、新股持仓
    await mainFlow(browser, 'ipo-desk', { tag: 'ipo', win: true, anim: true, touch: false, want: ['panel', 'frozen', 'draw', 'listed'] });
  } else {
    // 手机横屏 844×390（触屏）：申购中、新股持仓；没中签的那条路用 miss 局走一遍
    await mainFlow(browser, 'ipo-phone', { tag: 'ipo-phone', win: true, anim: false, touch: true, want: ['frozen', 'listed'] });
    await mainFlow(browser, 'ipo-phone-miss', { tag: 'ipo-phone-miss', win: false, anim: false, touch: true, want: [] });
    // 竖屏 390×844：点「照样玩」后走一遍，截横条
    await mainFlow(browser, 'ipo-portrait', { tag: 'ipo-portrait', win: false, anim: false, touch: true, portrait: true, want: ['banner'] });
  }
  // 边界各跑一遍就够：结果只看规则，不分设备
  if (!PHONE) {
    await edgeFlow(browser);
    await calmFlow(browser);
  }
}
