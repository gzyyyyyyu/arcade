/**
 * shot.ts --record 的录像部分：只开自己的 480×400 视口，不走 ShotCtx，所以和截图流程分开。
 * 逐帧截图和拼 webm 在 record.ts，这里管开哪一局、镜头跟谁、录多久。
 */
import { mkdirSync } from 'node:fs';
import type { Browser, Page } from 'playwright-core';
import { recordClip, recordFixed } from './record.ts';
import { opt } from './args.ts';
import { QUERY, type Hook } from './shot-lib.ts';

const REC_KINDS = (opt('--rec-kinds') ?? 'sailor').split(',').filter(Boolean);
const REC_TD = (opt('--rec-td') ?? 'any').split(',').filter(Boolean);
/** --rec-towers battle,cannon,mortar,…：录炮台（battle = 登陆战里第一座有兵靠近的炮台；其余种类在守岛 td03 的木台上造一座再叫波），镜头定在塔上 */
const REC_TOWERS = (opt('--rec-towers') ?? '').split(',').filter(Boolean);
const REC_TZOOM = Number(opt('--rec-tzoom') ?? 0.75);
const REC_SECS = Number(opt('--rec-secs') ?? 4);
const REC_ZOOM = Number(opt('--rec-zoom') ?? 1.5);
const REC_LEVEL = opt('--level') ?? 'c07';
/** --rec-fps 60：手动按 16.67ms 推帧逐帧截图（固定 60 帧，默认）；--rec-fps live：CDP 屏幕广播收实际出的帧 */
const REC_LIVE = opt('--rec-fps') === 'live';

type RecUnit = { id: number; kind: string; mode: string; hp: number; maxHp: number; front?: boolean };
/**
 * --record <目录>：录动作短片。视口 480×400 @2x、渲染倍数 2（?rs=2）、关掉泛光，镜头用 follow 钩子对准一个单位、放大 --rec-zoom 倍，
 * 裁出画面正中一块拼成 640 宽的 webm（tools/record.ts），每段旁边一张抽帧拼图（同名 .png）。
 * - 登陆战（--level，默认 c07，机器人代打）：--rec-kinds 里每个兵种开一局（dev&devarmy=<兵种>，全军都是这种兵），各录走路、攻击 --rec-secs 秒，
 *   再等一个血量掉到三成以下的同种兵，跟着它录到倒下消失后 1.5 秒（battle-<兵种>-walk / attack / die）；
 * - 守岛（td03，dev 示范岛，造一座炮塔后叫波）：--rec-td 里每种敌人（any = 第一个出现的）录走路，再录一个倒下的（td-<种类>-walk / die）。
 */
export async function recordAll(browser: Browser, ROOT: string, dir: string, problems: string[]): Promise<void> {
  mkdirSync(dir, { recursive: true });
  // 2 倍够看清部件，3 倍时没有 GPU 的机器只出十几帧，看不出动作顺不顺
  const view = { viewport: { width: 480, height: 400 }, deviceScaleFactor: 2, isMobile: false, hasTouch: false };
  const [cw, ch, cu] = (opt('--rec-crop') ?? '0.6,0.7,0').split(',').map(Number);
  const crop = { w: cw ?? 0.62, h: ch ?? 0.62, up: cu ?? 0 };
  // mt1：无头 Chrome 的多纹理合批会让部件随机缺块（见 main.ts），录屏只用一个纹理单元
  const q = `rs=2&bloom=0&mt1${QUERY ? `&${QUERY}` : ''}`;
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  const open = async (url: string): Promise<{ page: Page; close(): Promise<void>; cdp: Awaited<ReturnType<Awaited<ReturnType<typeof browser.newContext>>['newCDPSession']>> }> => {
    const ctx = await browser.newContext(view);
    const page = await ctx.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error' && !/GL Driver Message/.test(m.text())) problems.push(`录屏 控制台报错：${m.text()}`);
    });
    page.on('pageerror', (e) => problems.push(`录屏 未捕获异常：${e.message}`));
    await page.goto(url, { timeout: 60_000 });
    await page.waitForFunction(() => (window as unknown as { __haidao?: Hook }).__haidao?.ready === true, null, { timeout: 90_000 });
    return { page, cdp: await ctx.newCDPSession(page), close: () => ctx.close() };
  };
  // 录的是画布里的动作：界面（顶栏、底部卡片）藏起来，不挡住镜头中间
  const hideUi = (page: Page): Promise<unknown> => page.addStyleTag({ content: '.hd-ui{visibility:hidden!important}' });
  const units = (page: Page): Promise<RecUnit[]> => page.evaluate(() => (window as unknown as { __haidao: { units?(): RecUnit[] } }).__haidao.units?.() ?? []);
  const pick = async (page: Page, f: (u: RecUnit) => boolean, ms: number, best?: (a: RecUnit, b: RecUnit) => number): Promise<RecUnit | null> => {
    for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(100)) {
      const us = (await units(page)).filter(f);
      if (us.length) return best ? us.sort(best)[0]! : us[0]!;
    }
    return null;
  };
  const follow = (page: Page, id: number | null): Promise<void> => page.evaluate(([i, z]) => (window as unknown as { __haidao: { follow?(id: number | null, z?: number): void } }).__haidao.follow?.(i, z), [id, REC_ZOOM] as const);
  /** 跟住一个单位录到它倒下消失后再录 1.5 秒（最长 ms） */
  const untilGone = (page: Page, id: number): (() => Promise<boolean>) => {
    let goneAt = 0;
    return async () => {
      const u = (await units(page)).find((x) => x.id === id);
      if ((!u || u.mode === 'dead') && !goneAt) goneAt = Date.now();
      // 逐帧录（默认）由 recordFixed 在倒下后再补录一段；实时录按墙钟多等 1.5 秒
      return goneAt > 0 && (!REC_LIVE || Date.now() - goneAt > 1500);
    };
  };
  const clip = async (page: Page, cdp: Parameters<typeof recordClip>[1], name: string, u: RecUnit | null, ms: number, until?: () => Promise<boolean>): Promise<void> => {
    if (!u) {
      problems.push(`录屏：${name} 没等到合适的单位`);
      return;
    }
    await follow(page, u.id);
    await sleep(300);
    const n = REC_LIVE ? await recordClip(page, cdp, dir, name, ms, crop, until) : await recordFixed(page, dir, name, Math.round((ms / 1000) * 60), crop, until);
    const occ = await page.evaluate(() => (window as unknown as { __haidao: { occluded?(): number } }).__haidao.occluded?.() ?? 0);
    console.log(`${name}：${u.kind} #${u.id}，${n} 帧（开局以来画过遮挡剪影 ${occ} 帧）`);
  };
  const byHp = (a: RecUnit, b: RecUnit): number => a.hp / a.maxHp - b.hp / b.maxHp;
  for (let kind of REC_KINDS) {
    // 只放 3 个，镜头里不叠成一团（--rec-kinds sailor:4 可改）
    const { page, cdp, close } = await open(`${ROOT}?battle=${REC_LEVEL}&auto&dev&devarmy=${kind.includes(':') ? kind : `${kind}:3`}&${q}`);
    kind = kind.split(':')[0]!;
    await hideUi(page);
    await clip(page, cdp, `battle-${kind}-walk`, await pick(page, (u) => u.kind === kind && u.mode === 'move', 30_000), REC_SECS * 1000);
    // 攻击挑站在建筑前面的（跟拍时建筑半透明，但站前面看得最清楚），其中血最多的（血少的录不完就倒了）；等不到再挑血最多的
    const hpFirst = (a: RecUnit, b: RecUnit): number => byHp(b, a);
    const atk = (await pick(page, (u) => u.kind === kind && u.mode === 'attack' && u.front === true && u.hp > u.maxHp * 0.6, 8_000, hpFirst)) ?? (await pick(page, (u) => u.kind === kind && u.mode === 'attack', 20_000, hpFirst));
    await clip(page, cdp, `battle-${kind}-attack`, atk, REC_SECS * 1000);
    const d = await pick(page, (u) => u.kind === kind && u.mode !== 'dead' && u.hp < u.maxHp * 0.5, 60_000, byHp);
    await clip(page, cdp, `battle-${kind}-die`, d, 12_000, d ? untilGone(page, d.id) : undefined);
    await close();
  }
  if (REC_TD.length) {
    const { page, cdp, close } = await open(`${ROOT}?dev&${q}`);
    await page.evaluate(() => (window as unknown as { __haidao: Hook }).__haidao.dev?.td(3));
    await sleep(900);
    await page.locator('.hd-bottom button:has-text("守岛")').first().click({ timeout: 8000 });
    await sleep(500);
    await page.locator('.hd-tdtab[data-chapter="1"]').first().click({ timeout: 8000 });
    await sleep(300);
    await page.locator('.hd-tdcard button[data-level="td03"]').first().click({ timeout: 8000 });
    await page.locator('.hd-tdgar-go').first().click({ timeout: 3000 }).catch(() => undefined);
    await page.waitForFunction(() => (window as unknown as { __haidao?: Hook }).__haidao?.scene === 'td', null, { timeout: 90_000 });
    await sleep(1200);
    const inf = await page.evaluate(() => (window as unknown as { __haidao: Hook }).__haidao.tdInfo?.());
    const sl = inf?.slots[0];
    if (sl) {
      const p = await page.evaluate(([x, y]) => (window as unknown as { __haidao: Hook }).__haidao.tdPt?.(x, y), [sl.x, sl.y] as const);
      if (p) await page.mouse.click(p.x, p.y);
      await sleep(400);
      await page.locator('.hd-td-tower[data-kind="cannon"]').first().click({ timeout: 8000 }).catch(() => undefined);
      await sleep(400);
      // 造完面板还开着（显示升级），收起来才点得到叫波
      if (await page.locator('.hd-td-sheet .hd-x').count()) await page.locator('.hd-td-sheet .hd-x').first().click({ timeout: 5000 }).catch(() => undefined);
      await sleep(300);
    }
    await page.locator('.hd-td-call').first().click({ timeout: 8000 });
    await hideUi(page);
    const seen = new Set<string>();
    for (const want of REC_TD) {
      const u = await pick(page, (x) => (want === 'any' || x.kind === want) && x.mode === 'in' && !seen.has(x.kind), 40_000);
      if (u) seen.add(u.kind);
      await clip(page, cdp, `td-${u?.kind ?? want}-walk`, u, REC_SECS * 1000);
    }
    const d = await pick(page, (u) => u.hp < u.maxHp * 0.5, 40_000, byHp);
    await clip(page, cdp, `td-${d?.kind ?? 'enemy'}-die`, d, 12_000, d ? untilGone(page, d.id) : undefined);
    await close();
  }
  type RecTower = { id: number; kind: string; level: number; slot: number; aim: boolean; near: boolean; x: number; y: number; tx?: number; ty?: number };
  const towers = (page: Page): Promise<RecTower[]> => page.evaluate(() => (window as unknown as { __haidao: { towers?(): RecTower[] } }).__haidao.towers?.() ?? []);
  /** 等一座塔有人靠近（进 1.5 倍射程），镜头定在它上面录 --rec-secs 秒；裁剪放宽，弹道和落点也在画面里 */
  const towerClip = async (page: Page, name: string, f: (t: RecTower) => boolean, z = REC_TZOOM): Promise<void> => {
    let t: RecTower | undefined;
    for (const t0 = Date.now(); Date.now() - t0 < 90_000 && !t; await sleep(50)) t = (await towers(page)).find((x) => f(x) && x.near);
    if (!t) {
      problems.push(`录屏：${name} 没等到有敌人靠近的塔`);
      return;
    }
    await page.evaluate(([x, y, z]) => (window as unknown as { __haidao: { lookAt?(x: number, y: number, z: number): void } }).__haidao.lookAt?.(x, y, z), [t.tx ? t.x * 0.62 + t.tx * 0.38 : t.x, t.ty ? t.y * 0.62 + t.ty * 0.38 + 6 : t.y + 10, z] as const);
    await sleep(200);
    const n = await recordFixed(page, dir, name, Math.round(REC_SECS * 60), { w: 0.96, h: 0.92, up: 0.02 });
    console.log(`${name}：${t.kind} ${t.level} 级 #${t.id}，${n} 帧`);
  };
  for (const item of REC_TOWERS) {
    // 种类:缩放（gunTower:1.4）单独给这一段的镜头缩放
    const [want = '', zs] = item.split(':');
    const tz = zs ? Number(zs) : REC_TZOOM;
    if (want === 'battle') {
      const { page, close } = await open(`${ROOT}?battle=${REC_LEVEL}&auto&${q}`);
      await hideUi(page);
      await towerClip(page, 'battle-tower', (t) => t.kind === 'cannon' || t.kind === 'mortar' || t.kind === 'gunTower', tz);
      await close();
      continue;
    }
    const { page, close } = await open(`${ROOT}?dev&${q}`);
    await page.evaluate(() => (window as unknown as { __haidao: Hook }).__haidao.dev?.td(3));
    await sleep(900);
    await page.locator('.hd-bottom button:has-text("守岛")').first().click({ timeout: 8000 });
    await sleep(500);
    await page.locator('.hd-tdtab[data-chapter="1"]').first().click({ timeout: 8000 });
    await sleep(300);
    await page.locator('.hd-tdcard button[data-level="td03"]').first().click({ timeout: 8000 });
    await page.locator('.hd-tdgar-go').first().click({ timeout: 3000 }).catch(() => undefined);
    await page.waitForFunction(() => (window as unknown as { __haidao?: Hook }).__haidao?.scene === 'td', null, { timeout: 90_000 });
    await sleep(1200);
    // td03 的 0 号木台在敌人必经的路边（射程最短的喷火塔也够得着）；--rec-slot 可换
    const inf = await page.evaluate(() => (window as unknown as { __haidao: Hook }).__haidao.tdInfo?.());
    const sl = inf?.slots[Number(opt('--rec-slot') ?? 0)];
    if (sl) {
      const p = await page.evaluate(([x, y]) => (window as unknown as { __haidao: Hook }).__haidao.tdPt?.(x, y), [sl.x, sl.y] as const);
      if (p) await page.mouse.click(p.x, p.y);
      await sleep(400);
      await page.locator(`.hd-td-tower[data-kind="${want}"]`).first().click({ timeout: 8000 }).catch(() => problems.push(`录屏：造不了 ${want}`));
      await sleep(400);
      if (await page.locator('.hd-td-sheet .hd-x').count()) await page.locator('.hd-td-sheet .hd-x').first().click({ timeout: 5000 }).catch(() => undefined);
      await sleep(300);
    }
    await page.locator('.hd-td-call').first().click({ timeout: 8000 });
    await hideUi(page);
    // 喷火塔射程短：等它真喷起来再录（起势在录像开头）；其余塔有敌人靠近就录（看得到提前转向）
    await towerClip(page, `td-tower-${want}`, (t) => t.kind === want && t.slot >= 0 && (want !== 'flame' || t.aim), tz);
    await close();
  }
}
