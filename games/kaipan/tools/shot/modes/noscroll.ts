// --noscroll 模式：一屏放下、不用滚动（仓库根 docs/ui.md 第 11 节，所有者 2026-11-01）
import type { Browser, Route } from 'playwright-core';
import { BALANCE, createRun, dailyScore, dailySegmentId, dailySetup, dispatch, ipoToday, type GameState, type RunSetup } from '../../../src/core/index.ts';
import { botByName, playRun, useExt, useMarket } from '../../bots.ts';
import { loadSegment } from '../../segments-disk.ts';
import { beijingToday, profileStorage } from '../fakes.ts';
import {
  BASIC_SETUP,
  T6,
  advanceTo,
  click,
  clock,
  controls,
  dialogOpen,
  dismissEndDialogs,
  settleEnd,
  dispatchNoWait,
  loadState,
  notes,
  openPage,
  setupQuery,
  shot,
  step,
  tap,
  toPage,
  waitFor,
  waitIdle,
  type Ctx,
} from '../harness.ts';
import { EXT_SETUP, EXT_TIPS_KEY, extToMonth, firstRec } from './ext.ts';

/** docs/ui.md 第 0 节的五个尺寸 */
const SIZES = [
  { id: '1280', width: 1280, height: 720, dpr: 1, touch: false },
  { id: '1920', width: 1920, height: 1080, dpr: 1, touch: false },
  { id: '844', width: 844, height: 390, dpr: 2, touch: true },
  { id: '390', width: 390, height: 844, dpr: 2, touch: true },
  { id: '360', width: 360, height: 640, dpr: 2, touch: true },
  // 省内存平板（iPad 的 UA 让 LOW_MEMORY 成立，点击区最小 56、电脑布局）：不在默认五个里，`--sizes=ipad` 才量
  { id: 'ipad', width: 1366, height: 1024, dpr: 2, touch: true, optIn: true, ua: 'Mozilla/5.0 (iPad; CPU OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1' },
] as const;

/** 开始菜单上点开的面板（按钮 key） */
const TITLE_PANELS = ['help', 'codex', 'achievements', 'settings', 'about', 'daily', 'flash', 'weekly', 'new'] as const;

type Box = { x: number; y: number; w: number; h: number };

/** 两个框相交（各边让 m 像素，贴边不算） */
const cross = (a: Box, b: Box, m = 1): boolean => a.x + m < b.x + b.w && b.x + m < a.x + a.w && a.y + m < b.y + b.h && b.y + m < a.y + a.h;
/** a 有一边伸出 b 超过 m 像素 */
const sticksOut = (a: Box, b: Box, m = 2): boolean => a.x < b.x - m || a.y < b.y - m || a.x + a.w > b.x + b.w + m || a.y + a.h > b.y + b.h + m;
/** Phaser 文字框含字体上下的留白（大字号尤其多）：比字压字时上下各收进 18%，只比字形大致所在的那条 */
const glyph = (a: Box): Box => ({ x: a.x, y: a.y + a.h * 0.18, w: a.w, h: a.h * 0.64 });
const area = (a: Box): number => Math.max(0, a.w) * Math.max(0, a.h);
const shared = (a: Box, b: Box): number => area({ x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), w: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h: Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) });

/** 有意的重叠（两个 key 的正则 + 理由）。登记了才放过，理由写清为什么不算问题 */
/** same：两个 key 末尾的序号要一样（同一张卡上的才算） */
const OVERLAP_OK: { a: RegExp; b: RegExp; same?: boolean; why: string }[] = [
  { a: /^card:\d+$/, b: /^slot:\d+$/, same: true, why: '放稀有股票 / 替换时的「放这一格」按钮画在持仓卡底部（trade/holdings.ts 的 pick），和「详情」一样嵌在卡里、在卡片上层先接住点击' },
  { a: /^card:\d+$/, b: /^detail:\d+$/, same: true, why: '「详情」是画在持仓卡里的小按钮（卡片整块可点、可拖），在卡片上层先接住点击，点卡片别处不会误开详情' },
];
/** 有意的出框 / 压字（文字的正则 + 理由） */
const CLIP_OK: { text: RegExp; why: string }[] = [];

/** 整趟累计的重叠和裁字（量到就记，最后汇总） */
const overlaps: string[] = [];
const clips: string[] = [];
/** 点击区不够大的按钮（docs/ui.md：触屏 ≥ 44×44，电脑 ≥ 32）：按「尺寸 按钮」去重，记下第一次量到的画面 */
const smallHits = new Map<string, string>();

/**
 * 画布里的重叠和裁字（调试桥 layout()，见 src/debug/layout.ts）：
 * - 重叠：任意两个控件的底板相交，或者点击区相交（触屏点到隔壁）；按钮被不接点击的不透明层盖住（看不见还点得到）；
 * - 裁字：文字伸出镜头（被屏幕边裁掉）、伸出自己按钮的底板、压在别的按钮底板上，或者两段文字互相压住超过小的那段的 1/4。
 * 页面上的 DOM 按钮（转屏提示等）同样量：两两相交、scrollWidth / scrollHeight 超过 client 的。
 */
async function checkLayout(ctx: Ctx, where: string): Promise<void> {
  const before = overlaps.length + clips.length;
  const L = await ctx.page.evaluate(() => window.__game?.layout() ?? null);
  const tail = (k: string): string => k.slice(k.lastIndexOf(':') + 1);
  const okPair = (a: string, b: string): boolean => OVERLAP_OK.some((w) => ((w.a.test(a) && w.b.test(b)) || (w.a.test(b) && w.b.test(a))) && (!w.same || tail(a) === tail(b)));
  const okText = (t: string): boolean => CLIP_OK.some((w) => w.text.test(t));
  const q = (t: string): string => `「${t.replace(/\s+/g, ' ').slice(0, 16)}」`;
  if (L) {
    const { texts, view } = L;
    // 被不透明层盖住的按钮看不见却还点得到：单独算一处重叠（点那块盖层会点到下面的按钮），不再和别的按钮比
    for (const b of L.boxes) if (b.covered) overlaps.push(`${where}：${b.key} 被不透明的层盖住了，看不见但还点得到`);
    // 点击区按页面像素量（画布有缩放，世界坐标不等于手指点到的大小）
    const min = ctx.touch ? 44 : 32;
    const o = await toPage(ctx, 0, 0);
    const k = await toPage(ctx, 1000, 1000);
    const kx = (k.x - o.x) / 1000;
    const ky = (k.y - o.y) / 1000;
    for (const b of L.boxes) {
      const w = Math.round(b.hit.w * kx);
      const h = Math.round(b.hit.h * ky);
      const id = `${where.split(' ')[0]} ${b.key}`;
      if ((w < min || h < min) && !smallHits.has(id)) smallHits.set(id, `${where}：${b.key} 点击区 ${w}×${h}（要 ≥ ${min}）`);
    }
    const boxes = L.boxes.filter((b) => !b.covered);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i] as (typeof boxes)[number];
        const b = boxes[j] as (typeof boxes)[number];
        if (a.id === b.id || okPair(a.key, b.key)) continue;
        if (cross(a.face, b.face)) overlaps.push(`${where}：${a.key} 和 ${b.key} 的底板重叠`);
        else if (cross(a.hit, b.hit)) overlaps.push(`${where}：${a.key} 和 ${b.key} 的点击区重叠`);
      }
    const faces = boxes.filter((b) => b.face !== b.hit && (b.face.x !== b.hit.x || b.face.w !== b.hit.w));
    for (let i = 0; i < texts.length; i++) {
      const t = texts[i] as (typeof texts)[number];
      if (okText(t.text)) continue;
      if (sticksOut(t.box, view)) clips.push(`${where}：${q(t.text)} 伸出屏幕`);
      const own = t.owner ? boxes.find((b) => b.key === t.owner) : undefined;
      if (own && sticksOut(t.box, own.face)) clips.push(`${where}：${q(t.text)} 伸出按钮 ${own.key} 的底板`);
      for (const f of faces) if (f.key !== t.owner && cross(t.box, f.face, 2)) clips.push(`${where}：${q(t.text)} 压在按钮 ${f.key} 上`);
      for (let j = i + 1; j < texts.length; j++) {
        const u = texts[j] as (typeof texts)[number];
        if (okText(u.text) || (u.text === t.text && Math.abs(u.box.x - t.box.x) < 4 && Math.abs(u.box.y - t.box.y) < 4)) continue;
        if (shared(glyph(t.box), glyph(u.box)) > Math.min(area(glyph(t.box)), area(glyph(u.box))) / 4) clips.push(`${where}：${q(t.text)} 和 ${q(u.text)} 压在一起`);
      }
    }
  }
  const dom = await ctx.page.evaluate(() => {
    const els = [...document.querySelectorAll<HTMLElement>('button, a, [role=button]')].filter((e) => e.offsetParent !== null && e.getClientRects().length > 0);
    const rs = els.map((e) => {
      const r = e.getBoundingClientRect();
      return { name: (e.textContent ?? e.className).trim().slice(0, 12) || e.tagName, x: r.x, y: r.y, w: r.width, h: r.height, clip: e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1 };
    });
    return rs;
  });
  for (let i = 0; i < dom.length; i++) {
    const a = dom[i] as (typeof dom)[number];
    if (a.clip && !okText(a.name)) clips.push(`${where}：页面按钮 ${q(a.name)} 的字放不下`);
    for (let j = i + 1; j < dom.length; j++) if (cross(a, dom[j] as Box)) overlaps.push(`${where}：页面按钮 ${q(a.name)} 和 ${q((dom[j] as (typeof dom)[number]).name)} 重叠`);
  }
  const fresh = [...overlaps, ...clips].length - before;
  if (fresh > 0) console.log(`  ⚠ ${where}：重叠 / 裁字 ${fresh} 处`);
}

/**
 * 量一屏：页面不能滚（documentElement / body 的 scrollHeight、scrollWidth 不超过视口），
 * 画布整个在视口里，当前画面上每个可点的东西都落在视口里（画布内容没有被挤到看不见的地方）。
 */
async function measure(ctx: Ctx, where: string, bad: string[], regionKeys: string[] = []): Promise<void> {
  const before = bad.length;
  const m = await ctx.page.evaluate(() => {
    const d = document.documentElement;
    const b = document.body;
    const c = document.querySelector('canvas')?.getBoundingClientRect();
    return {
      vw: innerWidth,
      vh: innerHeight,
      sh: Math.max(d.scrollHeight, b.scrollHeight),
      sw: Math.max(d.scrollWidth, b.scrollWidth),
      ch: d.clientHeight,
      cw: d.clientWidth,
      canvas: c ? { l: c.left, t: c.top, r: c.right, b: c.bottom } : null,
    };
  });
  if (m.sh > m.ch) bad.push(`${where}：页面高 ${m.sh} > 视口 ${m.ch}，要上下滚`);
  if (m.sw > m.cw) bad.push(`${where}：页面宽 ${m.sw} > 视口 ${m.cw}，要左右滚`);
  const c = m.canvas;
  if (c && (c.l < -1 || c.t < -1 || c.r > m.vw + 1 || c.b > m.vh + 1)) bad.push(`${where}：画布超出视口（${Math.round(c.l)},${Math.round(c.t)}–${Math.round(c.r)},${Math.round(c.b)}）`);
  const out: string[] = [];
  for (const [key, p] of Object.entries(await controls(ctx))) {
    const q = await toPage(ctx, p.x, p.y);
    if (q.x < 0 || q.y < 0 || q.x > m.vw || q.y > m.vh) out.push(key);
  }
  if (out.length) bad.push(`${where}：这些按钮在视口外 ${out.join(', ')}`);
  // 没有按钮的画面（本月看点卡等）：量命名区域的四个角
  if (regionKeys.length) {
    const regs = await ctx.page.evaluate(() => window.__game?.regions() ?? {});
    const outR: string[] = [];
    for (const key of regionKeys) {
      const r = regs[key];
      if (!r) continue;
      const a = await toPage(ctx, r.x, r.y);
      const b = await toPage(ctx, r.x + r.w, r.y + r.h);
      if (a.x < -1 || a.y < -1 || b.x > m.vw + 1 || b.y > m.vh + 1) outR.push(key);
    }
    if (outR.length) bad.push(`${where}：这些区域超出视口 ${outR.join(', ')}`);
  }
  await checkLayout(ctx, where);
  // 边量边打印：整趟很长，中途被停也留得下已经量到的
  console.log(`${bad.length > before ? '✗' : '✓'} ${where}${bad.length > before ? `：${bad.slice(before).join('；')}` : ''}`);
}

/** 竖屏先点「照样玩」收起转屏提示 */
async function playPortrait(ctx: Ctx): Promise<void> {
  const play = ctx.page.locator('#rotate-hint .rh-keep');
  if (await play.isVisible()) {
    await play.tap();
    await ctx.page.waitForTimeout(1200);
  }
}

type Size = (typeof SIZES)[number];

const press = (ctx: Ctx, sz: Size, key: string): Promise<void> => (sz.touch ? tap(ctx, key) : click(ctx, key));

/** 手机的右边一块是标签页：要点的东西在哪一页，就先切过去（电脑上没有标签，什么都不做） */
async function gotoTab(ctx: Ctx, sz: Size, tab: 'recs' | 'board' | 'msgs'): Promise<void> {
  if (!(`tab:${tab}` in (await controls(ctx)))) return;
  await press(ctx, sz, `tab:${tab}`);
  await ctx.page.waitForTimeout(300);
}

/** 在世界坐标点一下（没有控件名的地方：风口行、群友头像） */
async function tapWorld(ctx: Ctx, sz: Size, x: number, y: number): Promise<void> {
  const p = await toPage(ctx, x, y);
  if (sz.touch) await ctx.page.touchscreen.tap(p.x, p.y);
  else await ctx.page.mouse.click(p.x, p.y);
}

const regionsOf = (ctx: Ctx): Promise<Record<string, { x: number; y: number; w: number; h: number }>> => ctx.page.evaluate(() => window.__game?.regions() ?? {});

interface LayerOpts {
  /** 打开后出现的控件名（有就等它，没有就等一会再看顶层有没有多出东西） */
  ready?: string;
  /** 打开后多等几毫秒（异步出现的面板） */
  wait?: number;
  /** 关的办法；默认按 Esc */
  close?: () => Promise<void>;
}

/** 打开一层（弹窗、面板），量完关回上一层。开不出来记一条，不让整趟卡住。 */
async function layer(ctx: Ctx, sz: Size, where: string, bad: string[], open: () => Promise<void>, o: LayerOpts = {}): Promise<void> {
  const name = `${sz.id} ${where}`;
  const depth = (): Promise<number> => ctx.page.evaluate(() => window.__game?.displayList().length ?? 0);
  const n0 = await depth();
  try {
    await open();
    if (o.ready) await dialogOpen(ctx, o.ready);
  } catch (e) {
    bad.push(`${name}：打不开（${String(e instanceof Error ? e.message : e).slice(0, 80)}）`);
    console.log(`✗ ${name}：打不开`);
    // 打不开时留一张现场，好分清是弹窗挡着、按钮在转圈还是根本没反应
    await shot(ctx, `ns-${sz.id}-fail-${where}`).catch(() => undefined);
    return;
  }
  await ctx.page.waitForTimeout(o.wait ?? 700);
  if (!o.ready && (await depth()) <= n0) {
    bad.push(`${name}：点了没有新层出现`);
    console.log(`✗ ${name}：点了没有新层出现`);
    return;
  }
  await measure(ctx, name, bad);
  if (o.close) await o.close();
  else await ctx.page.keyboard.press('Escape');
  await ctx.page.waitForTimeout(500);
}

/** ext 局：第 2 个月第 2 天盘前，已经买了一口（有持仓卡）。找不到合适的种子就 null */
function extHolding(): GameState | null {
  for (let i = 0; i < 20; i++) {
    let s = extToMonth(`ext-bank-${i}`, EXT_SETUP, 2);
    const rec = (() => {
      try {
        return firstRec(s);
      } catch {
        return -1;
      }
    })();
    if (rec < 0) continue;
    const b = dispatch(s, { type: 'buy', rec, size: 'taste' });
    if (b.error) continue;
    s = step(b.state).state;
    if (s.phase === 'premarket' && s.slots.some((h) => h)) return s;
  }
  return null;
}

/** 月底：找一个三选一里有稀有股票、挑完能接上事件的种子（和 main.ts 第 8 段同一套） */
const MONTH_SETUP: RunSetup = { themes: T6, holdings: ['ai_leader', 'ai_follower', 'pig_leader', 'con_blue'] };
function monthSeed(): { seed: string; stockIdx: number } | null {
  for (let i = 0; i < 300; i++) {
    let s = createRun(`month-${i}`, MONTH_SETUP).state;
    while (s.phase === 'premarket') s = dispatch(s, { type: 'open' }).state;
    const si = s.reward?.cards.findIndex((c) => c.kind === 'stock') ?? -1;
    if (s.phase === 'reward' && si >= 0 && dispatch(s, { type: 'pickReward', index: si, slot: 0 }).state.phase === 'event') return { seed: `month-${i}`, stockIdx: si };
  }
  return null;
}

/** 动画中途冻住再量（账单这类停留很短的画面）：在页面里计时，和 harness.cueShot 一样 */
async function freezeMeasure(ctx: Ctx, type: string, since: number, delay: number, where: string, bad: string[]): Promise<void> {
  await ctx.page.evaluate(([t, s, ms]) => window.__game?.freezeAfterCue(t, s, ms), [type, since, delay + 150] as const);
  await waitFor(ctx, `cue ${type} + ${delay + 150}ms 冻结`, 'g.frozen');
  await ctx.page.waitForTimeout(150);
  await measure(ctx, where, bad);
  await ctx.page.evaluate(() => window.__game?.freeze(false));
}

/** 假平台：登录、云存档、每日榜、发起挑战（结束页的排行榜和挑战面板要登录才有） */
function fakeApi(boardId: string) {
  const entries = Array.from({ length: 50 }, (_, i) => ({ rank: i + 1, displayName: `玩家${i + 1}`, avatar: null, score: dailyScore(false, 0, 11 - Math.floor(i / 5)), isMe: false }));
  return async (route: Route): Promise<void> => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.pathname === '/api/me') return route.fulfill({ json: { user: { id: 'smoke-user', username: 'smoke', displayName: '冒烟' }, service: 'ok', saves: 'ok' } });
    if (u.pathname === '/api/saves/kaipan' && req.method() === 'GET') return route.fulfill({ json: { saves: [] } });
    if (req.method() === 'PUT') return route.fulfill({ json: { rev: 1, updatedAt: 2 } });
    if (u.pathname === '/api/scores') return route.fulfill({ json: { best: (req.postDataJSON() as { score: number }).score, improved: true } });
    if (u.pathname === `/api/boards/kaipan/${boardId}`) return route.fulfill({ json: { entries, me: { rank: 57, score: dailyScore(false, 0, 6) } } });
    if (req.method() === 'POST' && u.pathname === '/api/challenges') return route.fulfill({ json: { id: 'lqsmoke01', until: Date.now() + 30 * 86_400_000 } });
    return route.fulfill({ status: 404, json: { error: 'not_found' } });
  };
}

export async function noScrollShots(browser: Browser): Promise<void> {
  const bad: string[] = [];
  const ended = playRun('ns-end', botByName('smart'), { persona: 'newbie', difficulty: 1 });
  // 结束页之后的几层要真实行情（这段日子）、每日挑战（排行榜）、能发起挑战的一局（挑战面板）：各打一局备好
  const today = beijingToday();
  const boardId = `daily-${today}-classic`;
  const api = fakeApi(boardId);
  const dailySeg = dailySegmentId(today);
  let dailyEnd: GameState | null = null;
  if (dailySeg) {
    const d = dailySetup(today);
    useMarket(() => loadSegment(dailySeg));
    useExt(true);
    dailyEnd = playRun(d.seed, botByName('smart'), d.setup);
    useMarket(null);
    useExt(false);
  }
  useMarket(null);
  useExt(true);
  const challengeEnd = playRun('ns-ch-1', botByName('normal'), { persona: 'newbie', difficulty: 1, short: { months: 5, billMult: BALANCE.short.billMult, goal: BALANCE.short.goal[0]! } });
  useExt(false);
  const holding = extHolding();
  const month = monthSeed();
  // --sizes 390,360 只量这几个（负载高时分开跑）
  const only = process.argv.find((a) => a.startsWith('--sizes='))?.slice(8).split(',');
  // --screens=title,trade,layers,month 只量这几段（改了某几个画面时只量改到的；段名见下面各块的 want）
  const screens = process.argv.find((a) => a.startsWith('--screens='))?.slice(10).split(',');
  const want = (k: string): boolean => !screens || screens.includes(k);
  for (const sz of SIZES.filter((x) => (only ? only.includes(x.id) : !('optIn' in x)))) {
    const screen = { width: sz.width, height: sz.height, dpr: sz.dpr };
    const dev = { touch: sz.touch, screen, userAgent: 'ua' in sz ? sz.ua : undefined };
    if (want('title')) {
      // 开始菜单和它点开的每个面板
      const ctx = await openPage(browser, `ns-title-${sz.id}`, '', { storage: profileStorage('partial'), ...dev });
      await ctx.page.waitForTimeout(800);
      await playPortrait(ctx);
      await waitIdle(ctx, '开始菜单');
      await measure(ctx, `${sz.id} 开始菜单`, bad);
      await shot(ctx, `ns-${sz.id}-title`);
      for (const key of TITLE_PANELS) {
        if (!(key in (await controls(ctx)))) continue;
        await (sz.touch ? tap(ctx, key) : click(ctx, key));
        await ctx.page.waitForTimeout(700);
        await measure(ctx, `${sz.id} 开始菜单 → ${key}`, bad);
        await ctx.page.keyboard.press('Escape');
        await ctx.page.waitForTimeout(500);
      }
      await ctx.page.context().close();
    }
    if (want('trade')) {
      // 对局：交易页（手机三个页签各量一次）和局内设置
      const ctx = await openPage(browser, `ns-trade-${sz.id}`, `seed=pre-1&anim=0&${setupQuery(BASIC_SETUP)}`, { ...dev });
      await ctx.page.waitForTimeout(800);
      await playPortrait(ctx);
      await waitIdle(ctx, '交易页');
      await measure(ctx, `${sz.id} 交易页`, bad);
      await shot(ctx, `ns-${sz.id}-trade`);
      if (sz.touch) {
        for (const tab of ['recs', 'board', 'msgs'] as const) {
          if (!(`tab:${tab}` in (await controls(ctx)))) continue;
          await tap(ctx, `tab:${tab}`);
          await ctx.page.waitForTimeout(300);
          await measure(ctx, `${sz.id} 交易页 · ${tab}`, bad);
        }
      }
      if ('settings' in (await controls(ctx))) {
        await (sz.touch ? tap(ctx, 'settings') : click(ctx, 'settings'));
        await ctx.page.waitForTimeout(700);
        await measure(ctx, `${sz.id} 局内设置`, bad);
        await ctx.page.keyboard.press('Escape');
      }
      await ctx.page.context().close();
    }
    if (want('layers') && holding) {
      // 交易页上的各层（ext 局：买多少、加减、银行都在这一局里）；先 loadState 第 1 天看买多少，再换成有持仓的一天
      const ctx = await openPage(browser, `ns-layers-${sz.id}`, 'anim=0', { storage: { [EXT_TIPS_KEY]: JSON.stringify(['size', 'holding', 'short', 'bank', 'call']) }, ...dev });
      await ctx.page.waitForTimeout(800);
      await playPortrait(ctx);
      const s0 = createRun('ext-demo-1', EXT_SETUP, { ext: true }).state;
      await loadState(ctx, s0);
      await ctx.page.waitForTimeout(400);
      await layer(
        ctx,
        sz,
        '买入弹窗（买多少）',
        bad,
        async () => {
          await gotoTab(ctx, sz, 'recs');
          await press(ctx, sz, `buy:${firstRec(s0)}`);
        },
        { ready: 'size:taste' },
      );
      await loadState(ctx, holding);
      await ctx.page.waitForTimeout(400);
      const slot = holding.slots.findIndex((h) => h);
      await layer(ctx, sz, '持仓详情', bad, () => press(ctx, sz, `detail:${slot}`));
      await layer(ctx, sz, '持仓菜单（加减）', bad, () => press(ctx, sz, `more:${slot}`), { ready: 'hold:trim' });
      await layer(
        ctx,
        sz,
        '风口详情',
        bad,
        async () => {
          await gotoTab(ctx, sz, 'board');
          const r = (await regionsOf(ctx)).board;
          if (!r) throw new Error('没有 board 区域');
          // 电脑第一行从看板顶往下 50，手机第一行从 3；点在第一行右边，躲开左边的小图标
          await tapWorld(ctx, sz, r.x + r.w - 60, r.y + (r.h > 500 ? 85 : 16));
        },
      );
      await layer(
        ctx,
        sz,
        '群友详情',
        bad,
        async () => {
          await gotoTab(ctx, sz, 'msgs');
          const k = Object.entries(await regionsOf(ctx)).find(([n]) => n.startsWith('msg:'));
          if (!k) throw new Error('群聊里没有消息');
          // 头像在气泡左边 22、气泡顶往上 2 的位置（chat.ts 的 CX / AVATAR / BUBBLE_X）
          await tapWorld(ctx, sz, k[1].x - 22, k[1].y - 2);
        },
      );
      await layer(ctx, sz, '怎么玩', bad, () => press(ctx, sz, 'help'), { wait: 1800 });
      await layer(ctx, sz, '回大厅确认', bad, () => press(ctx, sz, 'lobby'), { ready: 'confirm:cancel' });
      await layer(ctx, sz, '银行', bad, () => press(ctx, sz, 'bank'), { ready: 'bank:close' });
      await ctx.page.context().close();
    } else if (want('layers')) bad.push(`${sz.id} 交易页各层：找不到有持仓的 ext 局面`);
    if (want('ipo')) {
      // 抽新股面板：真实行情的娱乐局推到第一个申购日（和 ipo.ts 同一套），点群聊里的「抽新股」横条
      const ctx = await openPage(browser, `ns-ipo-${sz.id}`, 'anim=0', { ...dev });
      await ctx.page.waitForTimeout(800);
      await playPortrait(ctx);
      const r = await ctx.page.evaluate(() => window.__game?.newRun('ns-ipo-1', { persona: 'newbie', difficulty: 1 }) ?? { error: '无' });
      if (r.error) bad.push(`${sz.id} 抽新股面板：开局失败 ${r.error}`);
      else {
        await waitIdle(ctx, '真实行情开局', "window.__game.scene === 'trade'");
        let s = (await ctx.page.evaluate(() => window.__game?.state())) as GameState;
        for (let k = 0; k < 150 && s.phase !== 'won' && s.phase !== 'lost' && !(s.phase === 'premarket' && ipoToday(s)); k++) s = step(s).state;
        if (s.phase === 'premarket' && ipoToday(s)) {
          await loadState(ctx, s);
          await ctx.page.waitForTimeout(400);
          await layer(
            ctx,
            sz,
            '抽新股面板',
            bad,
            async () => {
              await gotoTab(ctx, sz, 'msgs');
              await press(ctx, sz, 'ipo');
            },
            { ready: 'ipo:taste' },
          );
        } else bad.push(`${sz.id} 抽新股面板：这个种子推不到申购日`);
      }
      await ctx.page.context().close();
    }
    if (want('end')) {
      // 结束页（弹窗收掉以后）
      const ctx = await openPage(browser, `ns-end-${sz.id}`, '', { storage: profileStorage('partial'), ...dev });
      await ctx.page.waitForTimeout(800);
      await playPortrait(ctx);
      await loadState(ctx, ended);
      await waitIdle(ctx, '结束页', "window.__game.scene === 'end'");
      await ctx.page.waitForTimeout(2500);
      await measure(ctx, `${sz.id} 结束页（带弹窗）`, bad);
      await dismissEndDialogs(ctx);
      await ctx.page.waitForTimeout(1200);
      await measure(ctx, `${sz.id} 结束页`, bad);
      await shot(ctx, `ns-${sz.id}-end`);
      await ctx.page.context().close();
    }
    if (want('month') && month) {
      // 月底：账单 → 三选一 → 放哪一格 → 事件 → 事件结果 → 下个月的「本月看点」卡（动画开着，4 倍速）
      const ctx = await openPage(browser, `ns-month-${sz.id}`, `seed=${month.seed}&speed=4&${setupQuery(MONTH_SETUP)}`, { ...dev });
      await ctx.page.waitForTimeout(800);
      await playPortrait(ctx);
      await loadState(ctx, advanceTo(month.seed, MONTH_SETUP, 4));
      const t0 = await clock(ctx);
      await dispatchNoWait(ctx, { type: 'open' });
      await freezeMeasure(ctx, 'stamp', t0, 450, `${sz.id} 月底账单`, bad);
      await waitIdle(ctx, '三选一', "window.__game.state().phase === 'reward'");
      await measure(ctx, `${sz.id} 三选一`, bad);
      await press(ctx, sz, `reward:${month.stockIdx}`);
      await ctx.page.waitForTimeout(300);
      await measure(ctx, `${sz.id} 三选一 → 放哪一格`, bad);
      await shot(ctx, `ns-${sz.id}-pick`);
      await press(ctx, sz, 'slot:0');
      await waitIdle(ctx, '事件', "window.__game.state().phase === 'event'");
      await ctx.page.waitForTimeout(400);
      await measure(ctx, `${sz.id} 事件`, bad);
      await press(ctx, sz, 'event:0');
      await waitIdle(ctx, '事件结果', 'window.__game.awaiting');
      await measure(ctx, `${sz.id} 事件结果`, bad);
      await press(ctx, sz, 'continue');
      // 看点卡停留约 1 秒（4 倍速）：在页面里等它出现的那一帧就冻住
      const shown = await ctx.page.evaluate(async () => {
        const g = window.__game;
        for (let i = 0; i < 800; i++) {
          if (g && 'monthCard' in g.regions()) {
            g.freeze(true);
            return true;
          }
          await new Promise((r) => setTimeout(r, 10));
        }
        return false;
      });
      if (shown) {
        await ctx.page.waitForTimeout(150);
        await measure(ctx, `${sz.id} 本月看点卡`, bad, ['monthCard']);
        await ctx.page.evaluate(() => window.__game?.freeze(false));
      } else notes.push(`${sz.id} 本月看点卡：这个种子下个月没出看点卡，没量`);
      await ctx.page.context().close();
    } else if (want('month')) bad.push(`${sz.id} 月底：找不到「三选一有稀有股票、挑完接事件」的种子`);
    if (want('story')) {
      // 结束页之后：这段日子 + 排行榜（每日挑战局，假平台）
      const ctx = await openPage(browser, `ns-endd-${sz.id}`, '', { storage: profileStorage('partial'), api, loginHint: true, ...dev });
      await ctx.page.waitForTimeout(800);
      await playPortrait(ctx);
      if (dailyEnd) {
        await waitFor(ctx, '云同步', `['merged', 'synced'].includes(window.__game?.cloud().state ?? '')`);
        await loadState(ctx, dailyEnd);
        await waitIdle(ctx, '结束页', "window.__game.scene === 'end'");
        await waitFor(ctx, '交分完成', "g.board().state === 'done' && g.board().rank !== undefined");
        await settleEnd(ctx, 'reveal');
        await layer(ctx, sz, '这段日子', bad, () => press(ctx, sz, 'reveal'), { ready: 'reveal:close', close: () => press(ctx, sz, 'reveal:close') });
        await layer(ctx, sz, '排行榜', bad, () => press(ctx, sz, 'board'), { ready: 'board:next' });
      } else notes.push(`${sz.id} 这段日子、排行榜：今天没有每日挑战用的行情段，没量`);
      await ctx.page.context().close();
    }
    if (want('challenge')) {
      // 好友挑战：结束页点「挑战好友」→ 链接框。「看成绩」面板要先有人交过成绩，要走完接受挑战再打一局，
      // 这里的单屏冒烟不走这条长路，留给 --challenge 模式。
      const ctx = await openPage(browser, `ns-chal-${sz.id}`, '', { storage: profileStorage('partial'), api, loginHint: true, ...dev });
      await ctx.page.waitForTimeout(800);
      await playPortrait(ctx);
      await waitFor(ctx, '云同步', `['merged', 'synced'].includes(window.__game?.cloud().state ?? '')`);
      await loadState(ctx, challengeEnd);
      await waitIdle(ctx, '结束页', "window.__game.scene === 'end'");
      // 点「挑战好友」到链接框出来之间又弹了成就，链接框就不出（EndScene 有对话框开着时不叠）：关掉再点，最多三次
      const openLink = async (): Promise<void> => {
        for (let k = 0; k < 3; k++) {
          await settleEnd(ctx, 'challenge');
          await press(ctx, sz, 'challenge');
          const ok = await ctx.page
            .waitForFunction(() => 'challenge:copy' in (window.__game?.controls() ?? {}), undefined, { timeout: 8000, polling: 100 })
            .then(() => true, () => false);
          if (ok) return;
        }
        throw new Error('点了三次「挑战好友」都没出链接框');
      };
      await layer(ctx, sz, '好友挑战（链接框）', bad, openLink, { ready: 'challenge:copy' });
      await ctx.page.context().close();
    }
  }
  for (const b of bad) notes.push(`要滚动：${b}`);
  // 重叠和裁字按处去重（同一处在几次量里都会出现）
  const ov = [...new Set(overlaps)];
  const cl = [...new Set(clips)];
  const sm = [...smallHits.values()];
  console.log(`重叠 ${ov.length} 处 / 裁字 ${cl.length} 处 / 点击区小 ${sm.length} 处`);
  for (const o of ov) console.log(`  重叠：${o}`);
  for (const c of cl) console.log(`  裁字：${c}`);
  for (const h of sm) console.log(`  点击区小：${h}`);
  for (const o of ov) notes.push(`重叠：${o}`);
  for (const c of cl) notes.push(`裁字：${c}`);
  for (const h of sm) notes.push(`点击区小：${h}`);
  if (bad.length || ov.length || cl.length || sm.length)
    throw new Error(`放不下 ${bad.length} 处、重叠 ${ov.length} 处、裁字 ${cl.length} 处、点击区小 ${sm.length} 处：\n${[...bad, ...ov, ...cl, ...sm].join('\n')}`);
}
