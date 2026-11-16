/**
 * shot.ts 的 --pvp：异步攻防的真人流程，接口由 shot-fake.ts 里真的 handlePvp 回。
 * 中间故意让假服务端回一次 409 need_reload，那一步把 c.allow409 打开，浏览器记的 4xx 报错不算问题。
 */
import { newProfile } from '../src/core/index.ts';
import { FakePvp } from './shot-fake.ts';
import { layoutProblems, type ShotCtx } from './shot-lib.ts';

/** --pvp：异步攻防 */
export async function pvp(c: ShotCtx): Promise<boolean> {
  const { page, v, ROOT, problems, shot, tap, sceneIs, step, click, where, beach, ready } = c;
  const fake = new FakePvp();
  await fake.seed();
  await fake.route(page, problems);
  // 老玩家的存档（跳过新手引导、打过一场），木材够出海；只在第一次打开时写，之后的刷新沿用页面自己存的
  const save = JSON.stringify({ profile: { ...newProfile(), tutorial: 99, res: { gold: 1500, wood: 1500 }, stats: { attacks: 1, wins: 1, lootGold: 0, lootWood: 0 } }, lastSeen: Date.now() });
  await page.addInitScript((sv) => {
    if (!localStorage.getItem('haidao.save')) localStorage.setItem('haidao.save', sv);
  }, save);
  const check = async (what: string): Promise<void> => {
    for (const p of await layoutProblems(page)) problems.push(`${v.name} ${what} ${p}`);
  };
  const openPanel = async (): Promise<void> => {
    await click('.hd-bottom button:has-text("出海")');
    await page.waitForTimeout(500);
    await click('.hd-pvp-mapbtn');
    await page.locator('.hd-pvp button:has-text("找对手")').waitFor({ timeout: 10_000 });
    await page.waitForTimeout(300);
  };
  // ?fast：战斗和回放 4 倍速，省时间；操作仍是真人点的
  await page.goto(`${ROOT}?fast`, { timeout: 60_000 });
  await ready();
  await page.waitForTimeout(800);
  const ok =
    (await step('海图上的打玩家', async () => {
      await click('.hd-bottom button:has-text("出海")');
      await page.locator('.hd-pvp-mapbtn').waitFor({ timeout: 8000 });
      await page.waitForTimeout(500);
      await shot('pvp-map');
      await check('海图');
      await click('.hd-pvp-mapbtn');
      await page.locator('.hd-pvp button:has-text("找对手")').waitFor({ timeout: 10_000 });
      await page.waitForTimeout(300);
      await shot('pvp-panel');
      await check('打玩家面板');
    })) &&
    (await step('游戏更新了弹窗', async () => {
      // 假服务端回一次 need_reload：旧页面发的请求被挡，页面弹出带"刷新"按钮的提示
      fake.staleNext = true;
      c.allow409 = true;
      await click('.hd-pvp button:has-text("找对手")');
      await page.locator('.hd-pvp-reload button:has-text("刷新")').waitFor({ timeout: 10_000 });
      await page.waitForTimeout(300);
      c.allow409 = false;
      await shot('pvp-need-reload');
      await check('游戏更新了弹窗');
      await page.evaluate(() => document.querySelector('.hd-pvp-reload')?.remove());
    })) &&
    (await step('找对手', async () => {
      await click('.hd-pvp button:has-text("找对手")');
      await page.locator('.hd-pvp button:has-text("开打")').waitFor({ timeout: 10_000 });
      if (await page.locator('.hd-pvp .hd-pvp-tag:has-text("电脑")').count()) throw new Error('第一次找对手应该匹配到真人老李');
      await page.waitForTimeout(300);
      await shot('pvp-opponent');
      await check('对手');
    })) &&
    (await step('手动打', async () => {
      await click('.hd-pvp button:has-text("开打")');
      await sceneIs('battle');
      await page.waitForTimeout(1200);
      await shot('pvp-battle-start');
      for (let i = 0; i < 2; i++) {
        if ((await page.locator('.hd-boat.sel').count()) === 0) await click('.hd-boat:not(.done)');
        await page.waitForTimeout(250);
        const bp = await beach(i * 3);
        if (!bp) throw new Error('没有海滩点');
        await tap(bp.x, bp.y);
        await page.waitForTimeout(500);
      }
      await click('.hd-skill');
      const h = await where('hq');
      if (!h) throw new Error('战斗里找不到主寨');
      await tap(h.x, h.y);
      await page.waitForTimeout(1500);
      await shot('pvp-battle-barrage');
      await page.waitForTimeout(1500);
      await shot('pvp-battle-fight');
      await check('攻防战斗');
    })) &&
    (await step('服务端结算', async () => {
      // 等它打完（4 倍速），超时就撤退：结果仍由服务端按交上去的操作和结束拍重放
      await page.locator('.hd-pvp button:has-text("回家")').waitFor({ timeout: 90_000 }).catch(async () => {
        await click('.hd-bar2 button.hd-btn-red');
        await page.locator('.hd-dialog button:has-text("结束")').click({ timeout: 5000 });
      });
      await page.locator('.hd-pvp button:has-text("回家")').waitFor({ timeout: 30_000 });
      await page.waitForTimeout(600);
      await shot('pvp-result');
      await check('攻防结算');
      await click('.hd-pvp button:has-text("回家")');
      await sceneIs('base');
      await page.waitForTimeout(800);
    })) &&
    (await step('被打了 N 次', async () => {
      await fake.raidMe();
      // 重新打开游戏：进基地时查一次
      await page.goto(`${ROOT}?fast`, { timeout: 60_000 });
      await ready();
      await page.locator('.hd-pvp h2:has-text("你不在时被打了")').waitFor({ timeout: 15_000 });
      await page.waitForTimeout(500);
      await shot('pvp-raided');
      await check('被打提示');
      await click('.hd-pvp button:has-text("知道了")');
    })) &&
    (await step('防守记录和回放', async () => {
      await openPanel();
      await page.locator('.hd-pvp-item').first().scrollIntoViewIfNeeded();
      await shot('pvp-defenses');
      await click('.hd-pvp-item button:has-text("看回放")');
      await sceneIs('battle');
      await page.waitForTimeout(3500);
      await shot('pvp-replay');
      await page.locator('.hd-pvp h2:has-text("的进攻")').waitFor({ timeout: 90_000 });
      await page.waitForTimeout(400);
      await shot('pvp-replay-end');
      await check('回放结束');
      await click('.hd-pvp button:has-text("回家")');
      await sceneIs('base');
      await page.waitForTimeout(800);
    })) &&
    (await step('复仇', async () => {
      await openPanel();
      await click('.hd-pvp-item button:has-text("复仇")');
      await page.locator('.hd-pvp .hd-pvp-tag:has-text("复仇")').waitFor({ timeout: 10_000 });
      await page.waitForTimeout(300);
      await shot('pvp-revenge');
      await check('复仇');
      // 不点"不打了"（放弃的接口要改成按输结），直接重开页面
    })) &&
    (await step('流浪海盗岛', async () => {
      await page.goto(`${ROOT}?fast`, { timeout: 60_000 });
      await ready();
      await page.waitForTimeout(800);
      await openPanel();
      await click('.hd-pvp button:has-text("找对手")');
      await page.locator('.hd-pvp .hd-pvp-tag:has-text("电脑")').waitFor({ timeout: 10_000 });
      await page.waitForTimeout(300);
      await shot('pvp-wanderer');
      await check('流浪海盗岛');
    }));
  return ok;
}
