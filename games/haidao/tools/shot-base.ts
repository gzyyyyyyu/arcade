/**
 * shot.ts 里不碰假服务端的几条：--views（各界面逐个截图）、--home（海盗来袭）、--cam（镜头适配），
 * 以及不带开关时的简单冒烟。只用本地存档和 ?dev，单独放一起，改假平台时不用看这里。
 */
import { join } from 'node:path';
import { HQ, LEVEL, QUERY, TD_CHAPTER, TD_HQ, TD_LEVEL, TD_SPEED, hook, layoutProblems, type Hook, type ShotCtx } from './shot-lib.ts';

/** --views：各界面逐个截图 */
export async function views(c: ShotCtx): Promise<boolean> {
  const { page, v, ROOT, problems, shot, sceneIs, step, click, tapBuilding, ready } = c;
  const ok =
    (await step('基地', async () => {
      await page.goto(`${ROOT}?dev`, { timeout: 60_000 });
      await ready();
      await page.waitForTimeout(800);
      await shot('base');
      for (const p of await layoutProblems(page)) problems.push(`${v.name} 基地 ${p}`);
    })) &&
    (await step('海图', async () => {
      // 星数给够，海图上才有首领岛可点
      await page.evaluate(() => (window as unknown as { __haidao: Hook }).__haidao.dev?.give(9000, 9000, 30));
      await page.waitForTimeout(400);
      await click('.hd-bottom button:has-text("出海")');
      await page.waitForTimeout(600);
      await shot('map');
      // 打开海图会平移到「下一关」，第 1 座岛多半在画面外（地图是平移的，不能滚），点下一关那座
      await click('.hd-map .hd-node.next');
      await page.waitForTimeout(400);
      await shot('map-island');
      if (await page.locator('.hd-map .hd-sheet button:has-text("侦察")').count()) {
        await click('.hd-map .hd-sheet button:has-text("侦察")');
        await page.waitForTimeout(800);
        await shot('scout');
        await click('.hd-scout .hd-x');
        await page.waitForTimeout(300);
      }
      await click('.hd-map .hd-sheet .hd-x');
      if (await page.locator('.hd-bounty').count()) {
        await click('.hd-bounty');
        await page.waitForTimeout(400);
        await shot('bounty');
        await click('.hd-map .hd-sheet .hd-x');
      }
      // 首领岛可能在画面外，平移的地图滚不过去：直接对它派发 click（岛面板固定在地图外，照样截得到）
      await page.locator('.hd-map .hd-node.boss:not(.lock)').last().dispatchEvent('click');
      await page.waitForTimeout(500);
      await shot('map-boss');
      await click('.hd-map .hd-sheet .hd-x');
      await click('.hd-map-close');
      await page.waitForTimeout(300);
      if (await page.locator('.hd-profile').count()) {
        // 星数和成就收在个人面板里：顶栏的船长钮 → 船长档案 → 成就和称号
        await click('.hd-profile');
        await page.waitForTimeout(400);
        await shot('profile');
        await click('.hd-sheet button:has-text("成就和称号")');
        await page.waitForTimeout(400);
        await shot('achievements');
        await click('.hd-sheet .hd-tabs button:has-text("收藏")');
        await page.waitForTimeout(400);
        await shot('collection');
        await click('.hd-sheet .hd-x');
      }
    })) &&
    (await step('建造列表', async () => {
      await click('.hd-bottom button:has-text("建造")');
      await page.waitForTimeout(500);
      await shot('build-list');
      await click('.hd-sheet button:has-text("推荐布局")');
      await page.waitForTimeout(700);
      await shot('presets');
      await click('.hd-sheet .hd-x');
    })) &&
    (await step('主寨面板和升级庆祝', async () => {
      await page.evaluate(() => (window as unknown as { __haidao: Hook }).__haidao.dev?.give(9000, 9000, 30));
      await page.waitForTimeout(400);
      await tapBuilding('hq');
      await page.waitForTimeout(500);
      // 手机点建筑弹操作环再点「信息」；电脑左键单击直接开右侧信息面板
      if (v.hasTouch) {
        await shot('hq-ring');
        await click('.hd-rmenu [data-ring=info]');
        await page.waitForTimeout(400);
      }
      await shot('hq-panel');
      await click('.hd-sheet .hd-upbtn');
      // 解锁弹窗等升级演出（约 2 秒）播完才出
      await page.locator('.hd-celebrate').waitFor({ timeout: 15_000 });
      await page.waitForTimeout(1200);
      await shot('celebrate');
      await click('.hd-mask .hd-celebrate .hd-btn-gold');
      await page.waitForTimeout(1500);
      await shot('celebrate-badge');
      // 成就窗是叠着弹的（升级庆祝和新成就可能各一张），从最上面那张逐张关，点被盖住的那张会一直等到超时
      for (let k = 0; k < 4 && (await page.locator('.hd-badge button').count()); k++) {
        await page.locator('.hd-badge button').last().click({ timeout: 8000 });
        await page.waitForTimeout(300);
      }
    })) &&
    (await step('战斗和结算', async () => {
      await page.goto(`${ROOT}?battle=${LEVEL}&auto&fast&dev${HQ ? `&${HQ}` : ''}`, { timeout: 60_000 });
      await ready();
      if ((await hook(page)).level !== LEVEL) throw new Error(`?battle=${LEVEL} 打开的不是这一关`);
      await page.waitForTimeout(2500);
      await shot('battle');
      await sceneIs('result', 90_000);
      await page.waitForTimeout(1500);
      await shot('result');
      for (const p of await layoutProblems(page)) problems.push(`${v.name} 结算 ${p}`);
    })) &&
    (await step('首领战斗', async () => {
      // c15 迷雾（雾里的建筑只能是一团雾）、c10 海怪、c30 终局岛；每关先截开场俯瞰，再截战斗中
      for (const id of ['c15', 'c10', 'c30']) {
        await page.goto(`${ROOT}?battle=${id}&auto&fast&dev${HQ ? `&${HQ}` : ''}`, { timeout: 60_000 });
        await ready();
        const got = (await hook(page)).level;
        if (got !== id) throw new Error(`?battle=${id} 打开的却是 ${got}`);
        await page.waitForTimeout(700);
        await shot(`boss-intro-${id}`);
        await page.waitForTimeout(4500);
        await shot(`boss-battle-${id}`);
      }
    }));
  return ok;
}

/** --home：海盗来袭 */
export async function home(c: ShotCtx): Promise<boolean> {
  const { page, v, ROOT, problems, shot, tap, sceneIs, step, click, ready } = c;
  // 海盗来袭：守自己的岛（dev 示范岛），真人点：选关页入口 → 开局 → 造塔、英雄、开打 → 4 倍速撑到结束（4 分钟没完就撤退）→ 结算（不算星）→ 回岛
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
      await page.locator('.hd-homecard').waitFor({ timeout: 8000 });
      await page.waitForTimeout(400);
      await shot('td-select-home');
      await check('守岛选关页');
    })) &&
    (await step('开局', async () => {
      await click('.hd-homecard button[data-home]');
      await sceneIs('td', 40_000);
      await page.waitForTimeout(1500);
      if (!/0\/\d+ 波|波 0\/\d+|第 1 波待开/.test((await page.locator('.hd-td-bar').textContent()) ?? '')) throw new Error('顶栏没有显示波数');
      const inf = await info();
      if (inf.flags < 1) throw new Error('海盗来袭开局没有预告旗');
      await shot('home-start');
      await check('海盗来袭开场');
    })) &&
    (await step('造塔英雄开打', async () => {
      const inf = await info();
      const si = inf.slots.findIndex((q) => q.tower < 0 && !q.wreck);
      if (si < 0) throw new Error('没有空的木台');
      const p = await pt(inf.slots[si]!.x, inf.slots[si]!.y);
      await tap(p.x, p.y);
      await page.waitForTimeout(400);
      await click('.hd-td-tower[data-kind="cannon"]');
      await page.waitForTimeout(600);
      if ((await info()).slots[si]!.tower < 0) throw new Error('没造出塔');
      if (await page.locator('.hd-td-sheet .hd-x').count()) await click('.hd-td-sheet .hd-x');
      const hp = await pt(10, 7);
      await click('.hd-td-herobtn');
      await tap(hp.x, hp.y);
      await page.waitForTimeout(600);
      await shot('home-built');
      await click('.hd-td-call');
      await page.waitForTimeout(5000);
      await shot('home-fight');
      await check('海盗来袭战斗中');
    })) &&
    (await step('撑到结束', async () => {
      for (let i = 0; i < 2; i++) await click(TD_SPEED);
      const done = await page.locator('.hd-home-result').waitFor({ timeout: 240_000 }).then(() => true, () => false);
      if (!done) {
        await click('.hd-td-bar2 button:has-text("撤退")');
        await click('.hd-dialog button:has-text("撤退")');
        await page.locator('.hd-home-result').waitFor({ timeout: 20_000 });
      }
      await page.waitForTimeout(3200);
      await shot('home-result');
      await check('海盗来袭结算');
      const txt = (await page.locator('.hd-home-result').textContent()) ?? '';
      if (!/撑过 \d+ 波/.test(txt)) throw new Error(`结算页文字不对：${txt}`);
      if (await page.locator('.hd-home-result .hd-td-starrow').count()) throw new Error('海盗来袭不该有星星');
    })) &&
    (await step('回岛', async () => {
      await click('.hd-home-result button:has-text("回岛")');
      await sceneIs('base');
      await page.waitForTimeout(800);
      await shot('home-back');
    }));
  return ok;
}

/** --cam：镜头适配 */
export async function cam(c: ShotCtx): Promise<boolean> {
  const { page, v, ROOT, problems, shot, sceneIs, step, click, ready } = c;
  type FitInfo = { box: { l: number; r: number; t: number; b: number } | null; w: number; h: number };
  const call = <T>(f: string, ...a: unknown[]): Promise<T> => page.evaluate(([fn, args]) => (window as unknown as { __haidao: Record<string, (...x: unknown[]) => unknown> }).__haidao[fn as string]!(...(args as unknown[])), [f, a]) as Promise<T>;
  const fit = (): Promise<FitInfo> => call<FitInfo>('fitInfo');
  const pct = (f: FitInfo): number => (f.box ? (f.box.b - f.box.t) / f.h : 0);
  const portrait = v.viewport.height > v.viewport.width * 1.2;
  const check = async (what: string): Promise<void> => {
    for (const p of await layoutProblems(page)) problems.push(`${v.name} ${what} ${p}`);
    // 看得见的按钮两两不重叠（嵌套的不算）
    const lap = await page.evaluate(() => {
      const bs = [...document.querySelectorAll<HTMLElement>('.hd-ui button')].filter((b) => b.offsetParent && getComputedStyle(b).visibility !== 'hidden');
      const out: string[] = [];
      for (let i = 0; i < bs.length; i++) {
        for (let j = i + 1; j < bs.length; j++) {
          const a = bs[i]!, c = bs[j]!;
          if (a.contains(c) || c.contains(a)) continue;
          const p = a.getBoundingClientRect(), q = c.getBoundingClientRect();
          if (p.width && q.width && p.left < q.right - 1 && q.left < p.right - 1 && p.top < q.bottom - 1 && q.top < p.bottom - 1) out.push(`${a.className}「${a.textContent?.trim().slice(0, 8)}」和 ${c.className}「${c.textContent?.trim().slice(0, 8)}」重叠`);
        }
      }
      return out;
    });
    for (const p of lap) problems.push(`${v.name} ${what} ${p}`);
  };
  /** 进场前在页面里挂一个逐帧的探针，记下这个场景里内容盒占屏高的最小值（竖屏开场的全景）；机器负载高时进场检测会晚，所以不靠进场后再量 */
  const probe = (scene: string): Promise<void> =>
    page.evaluate((sc) => {
      const w = window as unknown as { __minFit: number; __haidao?: { scene?: string; fitInfo?(): FitInfo } };
      w.__minFit = 9;
      const loop = (): void => {
        const f = w.__haidao?.scene === sc ? w.__haidao.fitInfo?.() : null;
        if (f?.box) w.__minFit = Math.min(w.__minFit, (f.box.b - f.box.t) / f.h);
        requestAnimationFrame(loop);
      };
      loop();
    }, scene);
  /** 推镜结束后量一次，和探针记下的开场比 */
  const intro = async (what: string): Promise<void> => {
    await page.waitForTimeout(2500);
    const f0: FitInfo = { box: { l: 0, r: 0, t: 0, b: await page.evaluate(() => (window as unknown as { __minFit: number }).__minFit) }, w: 0, h: 1 };
    const f1 = await fit();
    console.log(`${v.name} ${what}：内容盒占屏高 开场 ${Math.round(pct(f0) * 100)}% → 推镜后 ${Math.round(pct(f1) * 100)}%，左右 ${Math.round(f1.box?.l ?? 0)}..${Math.round(f1.box?.r ?? 0)} / ${f1.w}`);
    if (portrait) {
      if (pct(f1) < 0.5 || pct(f1) > 0.62) throw new Error(`竖屏推镜后内容盒占屏高 ${Math.round(pct(f1) * 100)}%，应约 60%`);
      if (pct(f0) > pct(f1) - 0.1) throw new Error('竖屏开场没有先给整岛全景');
    } else if (!f1.box || f1.box.l < -1 || f1.box.r > f1.w + 1 || f1.box.t < -1 || f1.box.b > f1.h + 1) throw new Error('电脑上内容盒没有完整在屏内');
  };
  const ok =
    (await step('守岛开场', async () => {
      await page.goto(`${ROOT}?dev`, { timeout: 60_000 });
      await ready();
      await page.evaluate((hq) => (window as unknown as { __haidao: Hook }).__haidao.dev?.td(hq), TD_HQ);
      await page.waitForTimeout(900);
      await click('.hd-bottom button:has-text("守岛")');
      await page.waitForTimeout(500);
      await click(`.hd-tdtab[data-chapter="${TD_CHAPTER}"]`);
      await page.waitForTimeout(300);
      await probe('td');
      await click(`.hd-tdcard button[data-level="${TD_LEVEL}"]`);
      await page.waitForTimeout(600);
      if (await page.locator('.hd-tdgar').count()) {
        if (v.hasTouch) await click('.hd-tdgar-go');
        else await page.keyboard.press('Space');
      }
      await sceneIs('td', 40_000);
      await intro('守岛');
      await shot('cam-td-start');
      await check('守岛开场');
    })) &&
    (!portrait ||
      ((await step('屏外箭头', async () => {
        await click('.hd-td-call');
        await page.waitForFunction(() => ((window as unknown as { __haidao: { units?(): unknown[] } }).__haidao.units?.() ?? []).length > 0, null, { timeout: 30_000 });
        await page.waitForTimeout(1500);
        const edge = page.locator('.hd-td-edge:not(.slot):not(.gate):visible');
        // 单指拖开：先往右拖（看左边），没有箭头再往左拖
        for (const dx of [240, -480, -240]) {
          await page.mouse.move(195, 460);
          await page.mouse.down();
          await page.mouse.move(195 + dx, 460, { steps: 10 });
          await page.mouse.up();
          await page.waitForTimeout(500);
          if (await edge.count()) break;
        }
        const n = await edge.count();
        if (!n) throw new Error('拖开以后屏幕边上没有敌人箭头');
        await shot('cam-td-edge');
        await check('屏外箭头');
        const b0 = (await fit()).box!;
        await edge.first().click();
        await page.waitForTimeout(700);
        const b1 = (await fit()).box!;
        if (Math.abs(b1.l - b0.l) < 20 && Math.abs(b1.t - b0.t) < 20) throw new Error('点了箭头镜头没动');
        console.log(`${v.name}：屏边敌人箭头 ${n} 个、空木台小标 ${await page.locator('.hd-td-edge.slot:visible').count()} 个，点箭头镜头移了 ${Math.round(b1.l - b0.l)},${Math.round(b1.t - b0.t)}`);
      })) &&
        (await step('登陆战开场', async () => {
          await page.goto(`${ROOT}?dev`, { timeout: 60_000 });
          await ready();
          await page.waitForTimeout(800);
          await click('.hd-bottom button:has-text("出海")');
          await page.waitForTimeout(500);
          await click('.hd-map .hd-node:has(.hd-num:text-is("1"))');
          await page.waitForTimeout(400);
          await probe('battle');
          await click('.hd-map .hd-sheet button:has-text("出发")');
          await sceneIs('battle');
          await intro('登陆战');
          await shot('cam-battle-start');
          await check('登陆战开场');
        }))));
  return ok;
}

/** 不带开关：基地、机器人代打一关、结算三张 */
export async function smoke(c: ShotCtx): Promise<void> {
  const { page, v, OUT, ROOT, problems, ready } = c;
  await page.goto(`${ROOT}?${QUERY}`, { timeout: 60_000 });
  await ready();
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, `${v.name}-base.png`) });
  for (const p of await layoutProblems(page)) problems.push(`${v.name} 基地 ${p}`);

  await page.goto(`${ROOT}?battle=${LEVEL}&auto&fast${QUERY ? `&${QUERY}` : ''}${HQ ? `&${HQ}` : ''}`, { timeout: 60_000 });
  await ready();
  if ((await hook(page)).level !== LEVEL) problems.push(`${v.name} ?battle=${LEVEL} 打开的不是这一关`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(OUT, `${v.name}-battle.png`) });
  for (const p of await layoutProblems(page)) problems.push(`${v.name} 战斗 ${p}`);
  await page.waitForFunction(() => (window as unknown as { __haidao?: Hook }).__haidao?.scene === 'result', null, { timeout: 90_000 }).catch(() => problems.push(`${v.name} 战斗 90 秒没打完`));
  await page.waitForTimeout(3200);
  await page.screenshot({ path: join(OUT, `${v.name}-result.png`) });
  console.log(`${v.name}：场景 ${(await hook(page)).scene}`);
}
