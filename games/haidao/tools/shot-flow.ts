/**
 * shot.ts 的 --flow：新存档的真人主流程（收金币 → 建造 → 主寨 → 船队 → 出海 → 手动登陆 → 结算 → 回家）。
 * 是新玩家第一次进游戏走的路，最长、最常跑，单独一个文件。
 */
import { HQ, hook, layoutProblems, type ShotCtx } from './shot-lib.ts';

/** --flow：新存档的真人主流程 */
export async function flow(c: ShotCtx): Promise<boolean> {
  const { page, v, ROOT, problems, shot, tap, sceneIs, step, click, where, tapBuilding, beach, ready } = c;
  await page.goto(HQ ? `${ROOT}?${HQ}` : ROOT, { timeout: 60_000 });
  await ready();
  await page.waitForTimeout(800);
  await shot('base');
  for (const p of await layoutProblems(page)) problems.push(`${v.name} 基地 ${p}`);
  const go =
    (await step('收金币', async () => {
      const b = await where('bubble');
      if (!b) throw new Error('金矿头上没有收取气泡');
      await tap(b.x, b.y);
      await page.waitForTimeout(500);
      await shot('collected');
    })) &&
    (await step('一键收取连点', async () => {
      // 所有者 11-21：每点一次「一键收取」按钮就往右跑。连点十次（每次关掉汇总框），按钮锚点不许变
      const fab = page.locator('.hd-claimfab.on');
      const boxes: Array<{ x: number; w: number }> = [];
      for (let i = 0; i < 10; i++) {
        await fab.waitFor({ state: 'visible', timeout: 15_000 });
        const b = await fab.boundingBox();
        if (!b) throw new Error('一键收取没有位置');
        boxes.push({ x: Math.round(b.x), w: Math.round(b.width) });
        if (v.hasTouch) await fab.tap({ timeout: 8000 });
        else await fab.click({ timeout: 8000 });
        await page.waitForTimeout(350);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
      }
      console.log(`${v.name} 一键收取连点：${boxes.map((q) => `${q.x}/${q.w}`).join(' ')}`);
      // 宽度跟着要收的数字走（多一种资源就宽一截），能变；变的是锚点才算乱跳：
      // 手机横屏贴着右侧竖排、右边对齐，量右边；其余居中，量中线。宽度没变时左边 x 也一样（改前电脑上左边在 573 / 640 来回跳）
      const anchor = (q: { x: number; w: number }): number => (v.name === 'phone' ? q.x + q.w : Math.round(q.x + q.w / 2));
      if (boxes.some((q) => Math.abs(anchor(q) - anchor(boxes[0]!)) > 1)) throw new Error(`一键收取连点后位置变了：${boxes.map((q) => `${q.x}/${q.w}`).join(',')}`);
      await shot('collect-10x');
    })) &&
    (await step('设置面板', async () => {
      // 顶栏右上只有一个齿轮；点开设置面板，同时只有一个遮罩；关音乐后 haidao.settings 里 music=false；Esc 关掉
      if ((await page.locator('.hd-mute, .hd-feel').count()) !== 1) throw new Error('右上角不止一个设置钮');
      await click('.hd-mute');
      await page.waitForTimeout(400);
      await shot('settings');
      if ((await page.locator('.hd-mask').count()) !== 1) throw new Error('设置面板打开后遮罩不是 1 个');
      await click('.hd-settings .hd-setrow:has-text("音乐") .hd-switch');
      const saved = await page.evaluate(() => localStorage.getItem('haidao.settings'));
      if (!saved || JSON.parse(saved).music !== false || JSON.parse(saved).sfx !== true) throw new Error(`设置没存对：${saved}`);
      await click('.hd-settings button:has-text("恢复默认")');
      const back = await page.evaluate(() => localStorage.getItem('haidao.settings'));
      if (!back || JSON.parse(back).music !== true) throw new Error(`恢复默认没生效：${back}`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      if ((await page.locator('.hd-mask').count()) !== 0) throw new Error('Esc 没关掉设置面板');
    })) &&
    (await step('建造', async () => {
      await click('.hd-bottom button:has-text("建造")');
      await page.waitForTimeout(400);
      await shot('build-list');
      // 手机用手指点卡片（之后的摆放用虚影旁的 ✓），电脑用鼠标（之后左键点虚影放下）
      const card = page.locator('.hd-card:has-text("金库")').first();
      if (v.hasTouch) await card.tap({ timeout: 8000 });
      else await card.click({ timeout: 8000 });
      await page.waitForTimeout(500);
      await shot('place');
      if (v.hasTouch) {
        if (!(await page.locator('.hd-place-float.on .hd-place-ok').count())) throw new Error('手机摆放时虚影旁没有 ✓');
        await page.locator('.hd-place-ok').tap({ timeout: 8000 });
      } else {
        const g = await where('ghost');
        if (!g) throw new Error('找不到虚影');
        await page.mouse.move(g.x, g.y);
        await page.waitForTimeout(300);
        await page.mouse.click(g.x, g.y);
      }
      await page.waitForTimeout(700);
      await shot('placed');
      if ((await page.locator('.hd-place').count()) > 0) throw new Error('放置没有完成');
    })) &&
    (await step('看主寨', async () => {
      if (v.hasTouch) {
        await tapBuilding('hq');
        await page.waitForTimeout(500);
        await shot('hq-ring');
        if ((await page.locator('.hd-rmenu [data-ring=info]').count()) === 0) throw new Error('点主寨没有弹出操作环');
        await click('.hd-rmenu [data-ring=info]');
      } else {
        // 电脑：右键弹菜单（贴着鼠标，带快捷键），Esc 收起；左键单击直接开信息面板
        const h = await where('hq');
        if (!h) throw new Error('找不到主寨');
        await page.mouse.move(h.x, h.y);
        await page.waitForTimeout(400);
        await shot('hq-hover');
        await page.mouse.click(h.x, h.y, { button: 'right' });
        await page.waitForTimeout(400);
        await shot('hq-ctxmenu');
        if ((await page.locator('.hd-ctxmenu [data-ctx=info]').count()) === 0) throw new Error('右键主寨没有弹出菜单');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        if ((await page.locator('.hd-ctxmenu').count()) > 0) throw new Error('Esc 没有收起右键菜单');
        await page.mouse.click(h.x, h.y);
      }
      await page.waitForTimeout(400);
      await shot('hq-panel');
      if ((await page.locator('.hd-sheet').count()) === 0) throw new Error(v.hasTouch ? '点操作环的「信息」没有弹出面板' : '左键单击主寨没有弹出信息面板');
      await click('.hd-sheet .hd-x');
      const miss = await page.evaluate(() => (window as unknown as { __haidao: { missing?(): string[] } }).__haidao.missing?.() ?? []);
      if (miss.length) throw new Error(`基地有缺图：${miss.join('、')}`);
    })) &&
    (await step('船队', async () => {
      await click('.hd-bottom button:has-text("船队")');
      await page.waitForTimeout(400);
      await shot('fleet');
      await click('.hd-sheet .hd-x');
    })) &&
    (await step('出海', async () => {
      await click('.hd-bottom button:has-text("出海")');
      await page.waitForTimeout(500);
      await shot('map');
      await click('.hd-map .hd-node:has(.hd-num:text-is("1"))');
      await page.waitForTimeout(400);
      await shot('island');
      await click('.hd-map .hd-sheet button:has-text("出发")');
      await sceneIs('battle');
      await page.waitForTimeout(800);
      await shot('battle-start');
    })) &&
    (await step('登陆放炮', async () => {
      for (let i = 0; i < 2; i++) {
        // 登陆一条后规则会自动选中下一条船，已经选中就不再点（再点会取消）
        if ((await page.locator('.hd-boat.sel').count()) === 0) await click('.hd-boat:not(.done)');
        await page.waitForTimeout(250);
        if (i === 0) await shot('boat-selected');
        const bp = await beach(i);
        if (!bp) throw new Error('没有海滩点');
        await tap(bp.x, bp.y);
        await page.waitForTimeout(500);
      }
      await shot('landed');
      const sk = page.locator('.hd-skill').first();
      if ((await sk.count()) === 0) throw new Error('没有技能按钮');
      await sk.click({ timeout: 5000 });
      const h = await where('hq');
      if (!h) throw new Error('战斗里找不到主寨');
      await tap(h.x, h.y);
      await page.waitForTimeout(1500);
      await shot('barrage');
      await page.locator('.hd-bar2 button:has-text("×")').first().click({ timeout: 5000 });
      await page.waitForTimeout(12_000);
      await shot('fight');
    })) &&
    (await step('结算', async () => {
      // 先等它自然打完（真人流程要看到正常的结算），超时才点"结束"
      await sceneIs('result', 90_000).catch(() => {});
      if ((await hook(page)).scene !== 'result') {
        await click('.hd-bar2 button.hd-btn-red');
        await page.locator('.hd-dialog button:has-text("结束")').click({ timeout: 5000 });
      }
      await sceneIs('result', 30_000);
      await page.waitForTimeout(1800);
      await shot('result');
      for (const p of await layoutProblems(page)) problems.push(`${v.name} 结算 ${p}`);
    })) &&
    (await step('回家', async () => {
      // 新成就的弹窗盖在结算上面（新档第一场必弹），先收起
      await page.waitForTimeout(3500);
      for (let i = 0; i < 4; i++) {
        const ok = page.locator('button:has-text("太棒了")');
        if (!(await ok.count())) break;
        await shot(`achievement-${i + 1}`);
        await ok.first().click({ timeout: 5000 });
        await page.waitForTimeout(500);
      }
      await click('.hd-result button:has-text("回家")');
      await sceneIs('base');
      await page.waitForTimeout(1000);
      await shot('home');
    }));
  return go;
}
