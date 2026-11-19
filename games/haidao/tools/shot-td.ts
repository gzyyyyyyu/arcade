/**
 * shot.ts 的守岛三条：--td（战役一关）、--tide（大潮无尽）、--tdlive（悬赏守岛实盘）。
 * 三条走同一个 TdScene，选关页、造塔、加速钮的点法相同，改守岛界面时一起对照着改。
 */
import type { Route } from 'playwright-core';
import { FakePvp } from './shot-fake.ts';
import { TD_CHAPTER, TD_HQ, TD_LEVEL, TD_LV, TD_MECHANIC, TD_SPEED, layoutProblems, type Hook, type ShotCtx } from './shot-lib.ts';

/** --td：守岛一关 */
export async function td(c: ShotCtx): Promise<boolean> {
  const { page, v, ROOT, problems, shot, tap, sceneIs, step, click, ready } = c;
  // 守岛：真人点一遍第一章第 1 关（不是机器人代打）：建临时塔 → 选分叉 → 英雄走位 → 放技能 → 提前叫波 → 打完 → 结算
  const call = <T>(f: string, ...a: unknown[]): Promise<T> => page.evaluate(([fn, args]) => (window as unknown as { __haidao: Record<string, (...x: unknown[]) => unknown> }).__haidao[fn as string]!(...(args as unknown[])), [f, a]) as Promise<T>;
  const pt = (gx: number, gy: number): Promise<{ x: number; y: number }> => call('tdPt', gx, gy);
  const info = (): Promise<NonNullable<ReturnType<NonNullable<Hook['tdInfo']>>>> => call('tdInfo');
  const check = async (what: string): Promise<void> => {
    for (const p of await layoutProblems(page)) problems.push(`${v.name} ${what} ${p}`);
  };
  const ok =
    (await step('进基地', async () => {
      await page.goto(`${ROOT}?dev`, { timeout: 60_000 });
      await ready();
      await page.evaluate((hq) => (window as unknown as { __haidao: Hook }).__haidao.dev?.td(hq), TD_HQ);
      await page.waitForTimeout(900);
      await shot('base-td-entry');
      await check('基地');
    })) &&
    (await step('选关页', async () => {
      await click('.hd-bottom button:has-text("守岛")');
      await page.waitForTimeout(500);
      await shot('level-select');
      await check('选关页');
    })) &&
    (await step('进守岛', async () => {
      // 选关页分章、默认停在打到的那一章：先点到这一关所在的章节标签
      await click(`.hd-tdtab[data-chapter="${TD_CHAPTER}"]`);
      await page.waitForTimeout(300);
      if (TD_LEVEL !== 'td01') await shot('level-select-ch');
      // 一章的关卡分页（竖屏一页 3 关）：不在这一页就往后翻
      const lvBtn = page.locator(`.hd-tdcard button[data-level="${TD_LEVEL}"]`);
      for (let i = 0; i < 4 && !(await lvBtn.isVisible()); i++) await click('.hd-tdpg-next');
      await click(`.hd-tdcard button[data-level="${TD_LEVEL}"]`);
      await page.waitForTimeout(600);
      // 带驻守台的关先弹选塔面板：截一张，换挑第二种塔（有的话）再开打
      if (await page.locator('.hd-tdgar').count()) {
        await shot('garrison-pick');
        await check('驻守台选塔');
        const cards = page.locator('.hd-tdgar-spot').first().locator('.hd-tdgar-card');
        if ((await cards.count()) > 2) await cards.nth(1).click();
        await page.waitForTimeout(250);
        await shot('garrison-picked');
        if (v.hasTouch) await click('.hd-tdgar-go');
        else await page.keyboard.press('Space');
      } else if (TD_LV?.garrison.length) throw new Error('这一关有驻守台，却没弹选塔面板');
      await sceneIs('td', 40_000);
      await page.waitForTimeout(1500);
      await shot('td-start');
      await check('守岛开场');
    })) &&
    (await step('预告和路线', async () => {
      const inf = await info();
      if (TD_LV?.garrison.length && !inf.slots.some((q) => q.garrison && q.tower >= 0)) throw new Error('驻守台上没有塔');
      if (inf.flags < 1 || inf.routes < 1) throw new Error(`地图上没有预告旗 / 路线：旗 ${inf.flags}，路线 ${inf.routes}`);
      const txt = (await page.locator('.hd-td-plan').textContent()) ?? '';
      if (!/第 1\/\d+ 波/.test(txt)) throw new Error(`预告卡没写第几波：${txt}`);
      // 只有一种能造的伤害（或并列）时不给建议（td-ui.ts 的 fitSuggest），这里只查：本波敌人有头像、护甲写了全名
      if (!(await page.locator('.hd-td-plan .hd-plan-foes .hd-tden').count())) throw new Error(`预告卡没画本波敌人：${txt}`);
      if (!/布衣|重甲|木船|飞禽/.test(txt)) throw new Error(`预告卡没写护甲名：${txt}`);
      // 手机竖屏预告卡收在顶栏的波次小钮里（layout.ts），先点开
      if (await page.locator('.hd-plan-tog').isVisible()) await click('.hd-plan-tog');
      await shot('preview');
      // 点卡的标题（左上角）：卡正中可能正好是「建议」徽记，点徽记弹的是伤害说明，不开图鉴
      await page.locator('.hd-td-plan').click({ position: { x: 14, y: 12 }, timeout: 8000 });
      await page.waitForTimeout(400);
      if (!(await page.locator('.hd-td-best .hd-ctr-tb').isVisible())) throw new Error('敌人图鉴里没有展开的克制表');
      await shot('bestiary-counter');
      await check('敌人图鉴');
      await click('.hd-td-best .hd-x');
      await page.waitForTimeout(250);
    })) &&
    (await step('建塔和克制表', async () => {
      const inf = await info();
      const si = inf.slots.findIndex((q) => q.tower < 0 && !q.wreck);
      if (si < 0) throw new Error('没有空的木台');
      const sl = inf.slots[si]!;
      const p = await pt(sl.x, sl.y);
      await tap(p.x, p.y);
      await page.waitForTimeout(400);
      await shot('build-menu');
      await check('建塔菜单');
      await click('.hd-td-sheet .hd-ctr-tog');
      await page.waitForTimeout(300);
      await shot('build-counter');
      // 克制表点开后只留表（0.30.3 起一屏放下），先收起才看得到塔卡
      await click('.hd-td-sheet .hd-ctr-off');
      await page.waitForTimeout(300);
      // 电脑用数字键选塔（建塔菜单开着时 1 = 第一种），手机点卡片
      if (v.hasTouch) await click('.hd-td-tower[data-kind="cannon"]');
      else await page.keyboard.press(String((await page.locator('.hd-td-tower').evaluateAll((els) => els.findIndex((e) => (e as HTMLElement).dataset.kind === 'cannon'))) + 1));
      await page.waitForTimeout(600);
      if ((await info()).slots[si]!.tower < 0) throw new Error('没造出塔');
      await tap(p.x, p.y);
      await page.waitForTimeout(500);
      await shot('tower-panel');
      await click('.hd-td-up');
      await page.waitForTimeout(600);
      await shot('tower-up');
      // 卖塔：按两下（第一下变红确认）
      const gold0 = (await info()).gold;
      await click('.hd-td-sell');
      // 第一下之后面板按下一帧重画成红色的"再点一下确认"（2 秒内有效）；先截这一张
      await page.locator('.hd-td-sell.arm').first().waitFor({ timeout: 1500 });
      await shot('sell-confirm');
      // 截图在负载高、手机横屏画面大时会超过 2 秒的确认窗口：过期了就重新上膛，上膛后立刻点第二下（真人点法在 844×390 上实测两下就卖掉）
      for (let k = 0; k < 3 && (await info()).slots[si]!.tower >= 0; k++) {
        if ((await page.locator('.hd-td-sell.arm').count()) === 0) {
          await click('.hd-td-sell');
          await page.locator('.hd-td-sell.arm').first().waitFor({ timeout: 1500 });
        }
        await click('.hd-td-sell');
        await page
          .waitForFunction((i) => ((window as unknown as { __haidao: Hook }).__haidao.tdInfo?.()?.slots[i]?.tower ?? 0) < 0, si, { timeout: 3000 })
          .catch(() => undefined);
      }
      const after = await info();
      if (after.slots[si]!.tower >= 0) throw new Error('卖了塔还在');
      if (after.gold <= gold0) throw new Error(`卖塔没退钱：${gold0} → ${after.gold}`);
      await shot('sold');
      // 再造回一座，好守
      await tap(p.x, p.y);
      await page.waitForTimeout(400);
      await click('.hd-td-tower[data-kind="cannon"]');
      await page.waitForTimeout(400);
      if (await page.locator('.hd-td-sheet .hd-x').count()) await click('.hd-td-sheet .hd-x');
    })) &&
    (await step('清障', async () => {
      const inf = await info();
      const wi = inf.slots.findIndex((q) => q.wreck);
      if (wi < 0) return;
      const w = inf.slots[wi]!;
      const p = await pt(w.x, w.y);
      await tap(p.x, p.y);
      await page.waitForTimeout(400);
      await shot('wreck');
      await check('清障');
      await click('.hd-td-clear');
      await page.waitForTimeout(700);
      if ((await info()).slots[wi]!.wreck) throw new Error('付了钱沉船还在');
      if (await page.locator('.hd-td-sheet .hd-x').count()) await click('.hd-td-sheet .hd-x');
    })) &&
    (await step('英雄和技能', async () => {
      // 没选中英雄时点地面英雄不动（所有者嫌点哪去哪太乱）；先点底栏英雄钮再点地面才走过去
      // 落点挑一块不在木台上、离英雄有点距离的地（各关木台位置不同：td24 的 (10,7) 上就有驻守塔，点了会开塔面板）
      const i0 = await info();
      const free = (c: readonly [number, number]): boolean =>
        i0.slots.every((q) => Math.max(Math.abs(q.x - c[0]), Math.abs(q.y - c[1])) > 1.6) && Math.hypot(i0.hero.x - c[0], i0.hero.y - c[1]) > 2;
      // 高阶塔的贴图往上探好几格，点在塔身后面的地会点中塔、开塔面板；水里（td24 岛中间的池子）英雄走不过去：都换下一块
      const spots = ([[10, 7], [7, 10], [9, 9], [12, 12], [11, 5], [5, 11], [14, 9], [9, 14]] as const).filter(free);
      // 英雄会自己守点、挑站位（td.ts 的 heroGuard / autoPost），位置变不说明什么；看他的目标是不是点的那一格
      const near = (g: { x: number; y: number } | null, x: number, y: number): boolean => !!g && Math.hypot(g.x - x, g.y - y) < 1;
      const tried: string[] = [];
      let moved = false;
      for (const [gx, gy] of spots) {
        const hp = await pt(gx, gy);
        await tap(hp.x, hp.y);
        await page.waitForTimeout(700);
        if (await page.locator('.hd-td-sheet').isVisible()) {
          tried.push(`(${gx},${gy}) 点中了塔`);
          await click('.hd-td-sheet .hd-x');
          await page.waitForTimeout(250);
          continue;
        }
        const g1 = (await info()).hero.goal;
        if (near(g1, gx, gy)) throw new Error(`没选中英雄点地面他也朝那走了：目标 (${g1!.x.toFixed(1)},${g1!.y.toFixed(1)})`);
        await click('.hd-td-herobtn');
        await page.waitForTimeout(200);
        await tap(hp.x, hp.y);
        await page.waitForTimeout(300);
        if (near((await info()).hero.goal, gx, gy)) {
          moved = true;
          break;
        }
        tried.push(`(${gx},${gy}) 走不过去`);
        // 还选着（选中提示还在）就再点一次英雄钮取消，换下一块
        if ((await page.locator('.hd-hint').textContent())?.includes('让英雄过去')) await click('.hd-td-herobtn');
        await page.waitForTimeout(200);
      }
      if (!moved) throw new Error(`选中英雄再点地面，他没朝那走：${tried.join('；') || '没有空地可点'}`);
      await page.waitForTimeout(600);
      await shot('hero-move');
      await page.locator('.hd-td-skill:not(.hd-td-herobtn)').nth(0).click({ timeout: 5000 });
      await page.waitForTimeout(300);
      await shot('barricade-aim');
      const inf = await info();
      const bp = await pt(inf.hero.x, inf.hero.y - 1.5);
      await tap(bp.x, bp.y);
      await page.waitForTimeout(600);
      await page.locator('.hd-td-skill:not(.hd-td-herobtn)').nth(1).click({ timeout: 5000 });
      await page.waitForTimeout(300);
      await shot('keg-aim');
      const tp = await pt(inf.hero.x + 1, inf.hero.y - 1);
      await tap(tp.x, tp.y);
      await page.waitForTimeout(900);
      await shot('skills-used');
      await check('技能');
    })) &&
    (await step('开打', async () => {
      await shot('before-call');
      // 电脑按空格开打（按钮悬停提示里写着），手机点按钮
      if (v.hasTouch) await click('.hd-td-call');
      else await page.keyboard.press('Space');
      await page.waitForTimeout(700);
      if ((await info()).wave < 1) throw new Error('开打后还在第 0 波');
      await shot('wave-banner');
      await page.waitForTimeout(6000);
      await shot('wave-fight');
      await check('战斗中');
    })) &&
    (await step('新机制出现', async () => {
      if (!TD_MECHANIC) return;
      for (let i = 0; i < 2; i++) await click(TD_SPEED);
      for (let k = 0; k < 360; k++) {
        const inf = await info();
        if (inf.over || inf.jammed > 0 || inf.skilled > 0) break;
        await page.waitForTimeout(500);
      }
      await page.waitForTimeout(250);
      await shot('mechanic');
      await check('新机制');
    })) &&
    (await step('打完', async () => {
      if (!TD_MECHANIC) for (let i = 0; i < 2; i++) await click(TD_SPEED);
      await page.waitForTimeout(25_000);
      await shot('fight-late');
      await sceneIs('result', 300_000);
      await page.waitForTimeout(2600);
      await shot('result');
      await check('结算');
    })) &&
    (await step('回岛', async () => {
      await click('.hd-td-result button:has-text("回岛")');
      await sceneIs('base');
      await page.waitForTimeout(800);
      await shot('home');
    }));
  return ok;
}

/** --tide：大潮无尽 */
export async function tide(c: ShotCtx): Promise<boolean> {
  const { page, v, ROOT, problems, shot, tap, sceneIs, step, click, ready } = c;
  // 大潮无尽：平台和 /api/scores 都是假的（登录 cookie 补上，交分请求拦下记下来）
  const fake = new FakePvp();
  await fake.seed();
  await fake.route(page, problems);
  const scoreBodies: unknown[] = [];
  await page.route((u) => u.pathname === '/api/scores', async (r: Route) => {
    scoreBodies.push(JSON.parse(r.request().postData() ?? 'null'));
    const h = r.request().headers();
    if (h['x-arcade'] !== '1' || !/application\/json/.test(h['content-type'] ?? '')) problems.push(`${v.name} 交分请求头不对：${JSON.stringify(h)}`);
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ best: 123456, improved: true }) });
  });
  const call = <T>(fn: string, ...a: unknown[]): Promise<T> => page.evaluate(([f, args]) => (window as unknown as { __haidao: Record<string, (...x: unknown[]) => unknown> }).__haidao[f as string]!(...(args as unknown[])), [fn, a]) as Promise<T>;
  const pt = (gx: number, gy: number): Promise<{ x: number; y: number }> => call('tdPt', gx, gy);
  const info = (): Promise<NonNullable<ReturnType<NonNullable<Hook['tdInfo']>>>> => call('tdInfo');
  const check = async (what: string): Promise<void> => {
    for (const p of await layoutProblems(page)) problems.push(`${v.name} ${what} ${p}`);
  };
  const ok =
    (await step('进基地', async () => {
      await page.goto(`${ROOT}?dev&fast`, { timeout: 60_000 });
      await ready();
      await page.evaluate(() => (window as unknown as { __haidao: Hook }).__haidao.dev?.td(5));
      await page.waitForTimeout(900);
      await click('.hd-bottom button:has-text("守岛")');
      await page.locator('.hd-tidecard:not(.hd-homecard)').waitFor({ timeout: 8000 });
      await page.waitForTimeout(400);
      await shot('td-select-tide');
      await check('守岛选关页');
    })) &&
    (await step('开局', async () => {
      await click('.hd-tidecard button[data-tide]');
      await sceneIs('td', 40_000);
      await page.waitForTimeout(1500);
      if (!/第 \d+ 波/.test((await page.locator('.hd-td-bar').textContent()) ?? '')) throw new Error('顶栏没有显示"第 N 波"');
      await shot('tide-start');
      await check('大潮开场');
    })) &&
    (await step('造塔英雄技能叫波', async () => {
      const inf = await info();
      if (inf.slots.length === 0) throw new Error('没有临时塔位');
      const p = await pt(inf.slots[0]!.x, inf.slots[0]!.y);
      await tap(p.x, p.y);
      await page.waitForTimeout(400);
      await click('.hd-td-tower[data-kind="cannon"]');
      await page.waitForTimeout(600);
      if ((await info()).slots[0]!.tower < 0) throw new Error('没造出塔');
      const hp = await pt(10, 7);
      await click('.hd-td-herobtn');
      await tap(hp.x, hp.y);
      await page.waitForTimeout(700);
      // 横屏上 (10,7) 正好落在刚造的塔上，会打开这座塔的面板（游戏暂停、技能钮被盖住），关掉再往下
      if (await page.locator('.hd-td-sheet .hd-x').count()) await click('.hd-td-sheet .hd-x');
      await shot('tide-built');
      await page.locator('.hd-td-skill:not(.hd-td-herobtn)').nth(1).click({ timeout: 5000 });
      await page.waitForTimeout(400);
      await click('.hd-td-call');
      await page.waitForTimeout(5000);
      await shot('tide-fight');
      await check('大潮战斗中');
    })) &&
    (await step('撑到结束', async () => {
      for (let i = 0; i < 2; i++) await click(TD_SPEED);
      // 放着打，最多等 4 分钟；还没输就点撤退（也是结算的一条路）
      const done = await page.locator('.hd-tide-result').waitFor({ timeout: 240_000 }).then(() => true, () => false);
      if (!done) {
        await click('.hd-td-bar2 button:has-text("撤退")');
        await click('.hd-dialog button:has-text("撤退")');
        await page.locator('.hd-tide-result').waitFor({ timeout: 20_000 });
      }
      await page.waitForTimeout(900);
      await shot('tide-result');
      await check('大潮结算');
      const txt = (await page.locator('.hd-tide-result').textContent()) ?? '';
      if (!/撑过 \d+ 波/.test(txt) || !/击退 \d+/.test(txt) || !/本周最好：撑过 \d+ 波 · 击退 \d+/.test(txt)) throw new Error(`结算页文字不对：${txt}`);
      if (!/新纪录/.test(txt)) throw new Error(`结算页没有"新纪录"：${txt}`);
      if (/金币 \+|木材 \+/.test(txt)) throw new Error('大潮不该发金币木材');
      if (scoreBodies.length !== 1) throw new Error(`交分次数不对：${scoreBodies.length}`);
      const b = scoreBodies[0] as { gameId?: string; boardId?: string; score?: number };
      if (b.gameId !== 'haidao' || !/^week-\d{4}-W\d{2}-tide$/.test(b.boardId ?? '') || !Number.isInteger(b.score)) throw new Error(`交分请求体不对：${JSON.stringify(b)}`);
      const best = await page.evaluate(() => localStorage.getItem('haidao.tide'));
      if (!best || !/"week":"\d{4}-W\d{2}"/.test(best)) throw new Error(`haidao.tide 没记上：${best}`);
      console.log(`${v.name}：交分 ${JSON.stringify(b)}，本机 ${best}`);
    })) &&
    (await step('回岛', async () => {
      await click('.hd-tide-result button:has-text("回岛")');
      await sceneIs('base');
      await page.waitForTimeout(800);
      await shot('tide-home');
    }));
  return ok;
}

/** --tdlive：悬赏守岛 */
export async function tdLive(c: ShotCtx): Promise<boolean> {
  const { page, v, ROOT, problems, shot, tap, sceneIs, step, click, ready } = c;
  const fake = new FakePvp();
  await fake.seed();
  await fake.route(page, problems);
  const call = <T>(fn: string, ...a: unknown[]): Promise<T> => page.evaluate(([f, args]) => (window as unknown as { __haidao: Record<string, (...x: unknown[]) => unknown> }).__haidao[f as string]!(...(args as unknown[])), [fn, a]) as Promise<T>;
  const pt = (gx: number, gy: number): Promise<{ x: number; y: number }> => call('tdPt', gx, gy);
  const info = (): Promise<NonNullable<ReturnType<NonNullable<Hook['tdInfo']>>>> => call('tdInfo');
  const check = async (what: string): Promise<void> => {
    for (const p of await layoutProblems(page)) problems.push(`${v.name} ${what} ${p}`);
  };
  const ok =
    (await step('进基地', async () => {
      await page.goto(`${ROOT}?dev&fast`, { timeout: 60_000 });
      await ready();
      await page.evaluate(() => (window as unknown as { __haidao: Hook }).__haidao.dev?.td(3));
      await page.waitForTimeout(900);
      await click('.hd-bottom button:has-text("守岛")');
      await page.locator('.hd-tdsel-live').waitFor({ timeout: 8000 });
      await page.waitForTimeout(400);
      await shot('td-select-with-live');
      await check('守岛选关页');
    })) &&
    (await step('悬赏守岛选档', async () => {
      await click('.hd-tdsel-live');
      await page.locator('.hd-live-card button[data-tier="small"]').waitFor({ timeout: 8000 });
      await page.waitForTimeout(600);
      await shot('tdlive-tiers');
      await check('悬赏守岛选档');
    })) &&
    (await step('带入开守', async () => {
      await click('.hd-live-card button[data-tier="small"]');
      // 带入前有一次确认（写清带入多少、最多赢输多少）
      // 选档页本身也是 .hd-dialog，按文字找确认按钮
      const ok = page.locator('.hd-dialog .hd-btn-gold', { hasText: '确定开守' }).last();
      await ok.waitFor({ timeout: 8000 });
      await shot('tdlive-confirm');
      await ok.click({ timeout: 8000 });
      await sceneIs('td', 40_000);
      if (fake.bank.balance !== 10_000 - 2000) throw new Error(`带入后钱包余额不对：${fake.bank.balance}`);
      await page.waitForTimeout(1200);
      await shot('tdlive-start');
      await check('悬赏守岛开场');
    })) &&
    (await step('造塔英雄叫波', async () => {
      const inf = await info();
      if (inf.slots.length === 0) throw new Error('没有临时塔位');
      const p = await pt(inf.slots[0]!.x, inf.slots[0]!.y);
      await tap(p.x, p.y);
      await page.waitForTimeout(400);
      await click('.hd-td-tower[data-kind="cannon"]');
      await page.waitForTimeout(600);
      if ((await info()).slots[0]!.tower < 0) throw new Error('没造出塔');
      const hp = await pt(10, 7);
      await click('.hd-td-herobtn');
      await tap(hp.x, hp.y);
      await page.waitForTimeout(700);
      await shot('tdlive-built');
      await page.locator('.hd-td-skill:not(.hd-td-herobtn)').nth(1).click({ timeout: 5000 });
      await page.waitForTimeout(400);
      await click('.hd-td-call');
      await page.waitForTimeout(5000);
      await shot('tdlive-fight');
      await check('悬赏守岛战斗中');
    })) &&
    (await step('打完结算', async () => {
      for (let i = 0; i < 2; i++) await click(TD_SPEED);
      await page.locator('.hd-live button:has-text("回家")').waitFor({ timeout: 300_000 });
      await page.waitForTimeout(600);
      await shot('tdlive-result');
      await check('悬赏守岛结算');
      const set = fake.bank.calls.filter((c) => c.m === 'settle');
      if (set.length !== 1 || !String(set[0]!.a.ref).startsWith('ht-')) throw new Error('钱包里没有一次 ht- 前缀的结回');
      if ((await page.locator('.hd-live-net').count()) === 0) throw new Error('结算页没有显示赢 / 输多少筹码');
    })) &&
    (await step('回家', async () => {
      await click('.hd-live button:has-text("回家")');
      await sceneIs('base');
      await page.waitForTimeout(800);
      await shot('tdlive-home');
    }));
  return ok;
}
