/**
 * 冒烟（AGENTS.md 第 4 节"每个游戏一个无头浏览器冒烟"）：起 vite 开发服务器（系统分配端口），单机打完一整场（?turbo 电脑不停顿），
 * 横屏、竖屏各一遍；检查控制台零报错（开发时平台接口没起，/api 的 502 不算）、结算出来、对局中点"大厅"先确认。
 * 一屏放下（docs/ui.md 第 11 节）：走到的每个界面都量一次 scrollHeight（noScroll）；`--only noscroll` 把主页、选桌页、规则每一页、擂台、速判、何切在五个尺寸各量一遍。
 * 用法：npm run smoke [-- --only ting|ladder|daily|noscroll]。截图在 shots/smoke-*.png。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, type Page } from 'playwright-core';
import { createServer } from 'vite';

const root = new URL('..', import.meta.url).pathname;
/**
 * 结算框里的按钮只认开着的那个（.mask.end）：关掉的结算框淡出时还在页面上（摘掉了 end 类，view/dialog.ts），
 * 只按字找会又点到正在淡出的那个"下一局"，它一消失新的一局还没打完，就干等到超时
 */
const NEXT = '.mask.end >> text=下一局';
mkdirSync(`${root}shots`, { recursive: true });
const server = await createServer({ root, server: { port: 0, host: '127.0.0.1', strictPort: false }, logLevel: 'silent' });
await server.listen();
const port = (server.httpServer!.address() as { port: number }).port;
const browser = await chromium.launch({ args: ['--no-zygote', '--disable-gpu'] });
let failed = false;
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
if (ONLY === 'ting' || ONLY === 'ladder' || ONLY === 'daily' || ONLY === 'noscroll') {
  await (ONLY === 'ting' ? tingSmoke() : ONLY === 'ladder' ? ladderSmoke() : ONLY === 'daily' ? dailySmoke() : noScrollSmoke());
  await browser.close();
  await server.close();
  process.exit(failed ? 1 : 0);
}

/**
 * 一屏放下（docs/ui.md 第 11 节）：页面本身和里面任何能滚的容器 scrollHeight 都不超过 clientHeight（横向同理），
 * 看得见的按钮、输入框、标题、正文不露出视口（被裁掉也是看不全）。手牌、牌河、副露本来就排在牌桌边上，不算
 */
async function noScroll(page: Page, where: string, errors: string[]): Promise<void> {
  await page.waitForTimeout(300);
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    const name = (e: Element): string => e.tagName.toLowerCase() + (e.classList.length ? `.${[...e.classList].slice(0, 2).join('.')}` : '');
    const de = document.scrollingElement!;
    if (de.scrollHeight > innerHeight + 1 || de.scrollWidth > innerWidth + 1) out.push(`页面 ${de.scrollWidth}×${de.scrollHeight}`);
    for (const e of document.querySelectorAll<HTMLElement>('body *')) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || !e.clientHeight) continue;
      if (/auto|scroll/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 1) out.push(`${name(e)} 高 ${e.scrollHeight}/${e.clientHeight}`);
      if (/auto|scroll/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 1) out.push(`${name(e)} 宽 ${e.scrollWidth}/${e.clientWidth}`);
    }
    for (const e of document.querySelectorAll<HTMLElement>('button, input, select, h1, h2, h3, p, label, li, td')) {
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height || e.closest('.my-hand, .river, .table .melds')) continue;
      if (r.bottom > innerHeight + 2 || r.top < -2 || r.right > innerWidth + 2 || r.left < -2) out.push(`${name(e)} 出界`);
    }
    return [...new Set(out)].slice(0, 4);
  });
  if (bad.length) {
    errors.push(`${where}要滚动才看得全：${bad.join('；')}`);
    await page.screenshot({ path: `${root}shots/smoke-noscroll-${where}.png` });
  }
}

async function play(page: Page, name: string): Promise<boolean> {
  // 我这一家：换三张、定缺照推荐；能胡就胡，有碰杠的选择就过；轮到打牌打最右边能打的那张
  // 第一次出现"听"的标记：点一下那张，操作条上要摆出听哪些牌，截一张图
  let ting = false;
  // 第一次轮到打牌：按住最右边那张往上拖出去，河里要多一张
  let dragged = false;
  // 胡牌亮牌：第一次出现截一张（要有番型和合计）
  let hu = false;
  for (let i = 0; i < 3_000; i++) {
    if (!hu && (await page.$('.hu-card .total'))) {
      hu = true;
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${root}shots/smoke-${name}-hu.png` });
    }
    // 一场打完：总结算上才有"回选桌"（擂台是"回擂台"；一局打完只有"下一局"）
    if (await page.$('.mask.end >> text=/回(选桌|擂台)/')) {
      // 能不能碰上"打了能听"看这一场的牌（自己这家只会打最右边那张，早早有人打光就散场），碰不上只提示；听牌的算法有单测
      if (!ting) console.log(`${name}: 这一场没碰上能听牌的时候，听牌提示没点到（看运气，不算错）`);
      return hu;
    }
    if (await page.$(NEXT)) await page.click(NEXT);
    else if (await page.$('text=帮我选')) {
      await page.click('text=帮我选');
      await page.click('button:has-text("换出")');
    } else if (await page.$('.act.que.best')) await page.click('.act.que.best');
    else if (await page.$('.bar .act.ron')) await page.click('.bar .act.ron');
    else if (await page.$('.bar .act.pass')) await page.click('.bar .act.pass');
    else if (!ting && (await page.$('.my-hand .tile.ting'))) {
      ting = true;
      await page.click('.my-hand .tile.ting');
      await page.waitForSelector('.bar .ting .k');
      await page.screenshot({ path: `${root}shots/smoke-${name}-ting.png` });
    } else if (!dragged && (await page.$('.bar .hint:has-text("往上拖")'))) {
      dragged = true;
      const before = (await page.$$('.river.r0 .tile')).length;
      const box = (await (await page.$$('.my-hand .tile:not(.off)')).at(-1)!.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y - 30, { steps: 4 });
      await page.mouse.move(box.x + box.width / 2, box.y - 70, { steps: 4 });
      await page.mouse.up();
      await page.waitForFunction((n) => document.querySelectorAll('.river.r0 .tile').length > n, before);
    } else {
      const t = (await page.$$('.my-hand .tile:not(.off)')).at(-1);
      if (t) {
        await t.click().catch(() => {});
        await t.click().catch(() => {});
      }
    }
    await page.waitForTimeout(40);
  }
  await page.screenshot({ path: `${root}shots/smoke-${name}-stuck.png` });
  throw new Error(`${name}: match did not finish（停在哪见 shots/smoke-${name}-stuck.png）`);
}

/**
 * 单机的互动（kit 的 table-fun，开发服务器上 app/fun.ts 把组件挂在 window.__fun、流水在 window.__funLog）：
 * 点一个电脑的头像，菜单里 8 个道具 + 3 句点名 + 屏蔽他，扔第二个道具（菜单收起）；点自己的头像，12 个表情里发一个；
 * "互动"按钮的面板里点名说一句。按控件的屏幕中心点（kit 的 controls()），流水里要有扔道具、表情、短语三行。
 * 截一张头像菜单开着的图（shots/smoke-<land/port>-menu.png 和 -panel.png），面板要整个在屏幕里
 */
async function soloFun(page: Page, name: string): Promise<void> {
  type Box = { x: number; y: number; w: number; h: number };
  const controls = (): Promise<Record<string, Box>> => page.evaluate(() => (window as unknown as { __fun: { controls(): Record<string, Box> } }).__fun.controls());
  const tap = async (key: string): Promise<void> => {
    const c = (await controls())[key];
    if (!c) throw new Error(`没有控件 ${key}`);
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(150);
  };
  const log = (): Promise<string[]> => page.evaluate(() => (window as unknown as { __funLog?: string[] }).__funLog ?? []);
  await page.waitForFunction(() => !!(window as unknown as { __fun?: unknown }).__fun);
  await tap('fun:seat1');
  const menu = Object.keys(await controls());
  const props = menu.filter((k) => /^fun:prop\d/.test(k)).length;
  const named = menu.filter((k) => /^fun:named\d/.test(k)).length;
  if (props !== 8 || named !== 3 || !menu.includes('fun:block')) throw new Error(`头像菜单不是 8 个道具 + 3 句点名 + 屏蔽他：${props}、${named}`);
  await page.screenshot({ path: `${root}shots/smoke-${name}-menu.png` });
  await tap('fun:prop1');
  await page.waitForTimeout(1_700);
  await tap('fun:seat0');
  const mine = Object.keys(await controls()).filter((k) => /^fun:sticker\d/.test(k)).length;
  if (mine !== 12) throw new Error(`自己的表情菜单不是 12 个：${mine}`);
  await tap('fun:sticker2');
  await page.waitForTimeout(1_200);
  await tap('fun:button');
  // 面板整个在屏幕里（kit 0.11.2 起窄屏自己收窄，这里守着别回退）
  const out = await page.evaluate(() => [...document.querySelectorAll('.atf-box')].some((b) => { const r = b.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight; }));
  if (out) throw new Error('互动面板伸出屏幕');
  await page.screenshot({ path: `${root}shots/smoke-${name}-panel.png` });
  await tap('fun:tab:phrase');
  await tap('fun:phrase0');
  await page.waitForTimeout(300);
  const lines = await log();
  for (const [what, re] of [['扔道具', /^道具 0>1/], ['发表情', /^表情 0/], ['说短语', /^短语 0/]] as const) {
    if (!lines.some((l) => re.test(l))) throw new Error(`互动流水里没有${what}：${lines.join(' | ')}`);
  }
  // 单机聊天（0.19.2，kit 的 localChat）：手机号整条拒发、在面板里说原因；正常的一句在自己头像旁冒气泡
  await page.waitForTimeout(1_200);
  await tap('fun:button');
  await tap('fun:tab:chat');
  await page.fill('[data-key="fun:chatInput"]', '加我 13800138000');
  await page.click('[data-key="fun:chatSend"]');
  // kit 0.19.0 起电脑版还有常驻聊天框，页面上不止一行提示：等说"号码"的那一行
  if (!(await page.waitForSelector('.atf-note:has-text("号码")', { timeout: 2_000 }).catch(() => null))) throw new Error('单机聊天发手机号没被拦下');
  await page.fill('[data-key="fun:chatInput"]', '这把稳了');
  await page.click('[data-key="fun:chatSend"]');
  if (!(await page.waitForSelector('.atf-say:has-text("这把稳了")', { timeout: 3_000 }).catch(() => null))) throw new Error('单机聊天说的话没冒气泡');
  await page.click('.atf-away', { position: { x: 5, y: 5 } });
}

// 平台大厅的"好友房"按钮带 ?online=1：开房、进房那一块亮起来，参数用完从地址栏去掉
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(() => localStorage.setItem('mahjong.guide', '1'));
  await page.goto(`http://127.0.0.1:${port}/games/mahjong/?online=1`);
  const ok = !!(await page.waitForSelector('.join.spot', { timeout: 5_000 }).catch(() => null)) && !page.url().includes('online');
  failed ||= !ok;
  console.log(`online=1: ${ok ? 'ok，好友房入口亮起、地址栏去掉参数' : '没有亮起或参数没去掉'}`);
  await page.close();
}

// 省内存模式（AGENTS.md 第 4 节，0.18.0）：SE 竖屏、触屏、减少动态效果。麻将是 DOM 渲染、没有 WebGL，lite 只关常驻小动画、发牌过场、
// 结算的飞筹码；这里看 lite 标记写上了、从主页进牌桌换牌定缺打几手，控制台零报错
{
  const page = await browser.newPage({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && !/502|Bad Gateway/.test(m.text()) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => localStorage.setItem('mahjong.guide', '1'));
  await page.goto(`http://127.0.0.1:${port}/games/mahjong/?turbo`);
  await page.waitForSelector('.home-main');
  if ((await page.evaluate(() => document.documentElement.dataset.lite)) !== '1') errors.push('省内存标记没写上');
  await page.click('.home-main .quick');
  await page.waitForSelector('text=帮我选');
  await page.click('text=帮我选');
  await page.click('button:has-text("换出")');
  await page.waitForSelector('.act.que.best');
  await page.click('.act.que.best');
  let turns = 0;
  for (const until = Date.now() + 60_000; turns < 3 && Date.now() < until; ) {
    await page.waitForTimeout(200);
    for (const b of ['.act.ron', '.act.pass']) if (await page.$(b)) await page.click(b, { force: true }).catch(() => {});
    const t = (await page.$$('.my-hand.turn .tile:not(.off)')).at(-1);
    if (!t) continue;
    await t.click({ force: true }).catch(() => {});
    await t.click({ force: true }).catch(() => {});
    turns++;
  }
  if (turns < 3) errors.push(`省内存模式下只打出 ${turns} 手`);
  const ok = errors.length === 0;
  failed ||= !ok;
  console.log(`lite: ${ok ? 'ok，省内存标记生效、打了 3 手、控制台零报错' : errors.join('\n')}`);
  await page.close();
}

/**
 * 立直单机（docs/riichi.md 第 4、5 节）：入口已放开（不带参数的选桌页就有"玩法"）；选立直开打，
 * 打到一局结算出来、役种表里有役（有人和了；一直流局就多打几局），再点开规则里的役种表；控制台零报错。
 * 我这一家：能和就和、能立直就立直（点一张亮着的牌）、吃有几种就挑第一种、碰杠不要；其余打最右边能打的那张。截图在 shots/smoke-rc-*.png
 */
for (const [name, viewport] of [
  ['land', { width: 1280, height: 720 }],
  ['port', { width: 390, height: 844 }],
] as const) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && !/502|Bad Gateway/.test(m.text()) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.setItem('mahjong.guide', '1');
    localStorage.setItem('mahjong.guide.rc', '1');
  });
  // 入口已放开：不带参数的选桌页就有玩法选项
  await page.goto(`http://127.0.0.1:${port}/games/mahjong/?turbo`);
  await page.click('.mode.fun');
  await page.waitForSelector('.lobby-head', { timeout: 8_000 }).catch(async () => { await page.screenshot({ path: `${root}shots/smoke-ladder-leave.png` }); throw new Error('离开以后没回选桌页'); });
  if (!(await page.$('.lobby-variants'))) errors.push('选桌页应该有玩法选项（立直已放开）');
  await page.click('.lobby-variants .chip:has-text("立直")');
  await page.click('text=单机开打');
  await page.waitForSelector('.table.rc .my-hand .tile');
  let win = false;
  let rounds = 0;
  for (let i = 0; i < 6_000 && !win && rounds < 12; i++) {
    if (await page.$('.mask.end .rc-win')) {
      win = true;
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${root}shots/smoke-rc-${name}-summary.png` });
      await noScroll(page, `立直一局结算-${name}`, errors);
    } else if (await page.$(NEXT)) {
      rounds++;
      await page.click(NEXT);
    } else if (await page.$('.bar .act.ron')) await page.click('.bar .act.ron');
    else if (await page.$('.bar .act.chi')) {
      await page.click('.bar .act.chi');
      if (await page.waitForSelector('.rc-pick .rc-opt', { timeout: 300 }).catch(() => null)) {
        await page.screenshot({ path: `${root}shots/smoke-rc-${name}-chi.png` });
        await page.click('.rc-pick .rc-opt');
      }
    } else if (await page.$('.bar .act.pass')) await page.click('.bar .act.pass');
    else if (await page.$('.bar .act.kyuu')) {
      await page.click('.bar .act.kyuu');
      await page.click('.bar .act.kyuu');
    } else if (await page.$('.bar .act.riichi')) {
      await page.click('.bar .act.riichi');
      const t = (await page.$$('.my-hand .tile:not(.off)')).at(-1);
      await t?.click().catch(() => {});
      await t?.click().catch(() => {});
    } else {
      const t = (await page.$$('.my-hand .tile:not(.off)')).at(-1);
      await t?.click().catch(() => {});
      await t?.click().catch(() => {});
    }
    await page.waitForTimeout(30);
  }
  if (!win) errors.push(`打了 ${rounds} 局没出现和牌的役种表`);
  else if ((await page.$$('.mask.end .rc-yaku-row')).length === 0) errors.push('役种表里没有役');
  if (await page.$('.mask.end .rc-total .rc-value')) console.log(`rc ${name}: ${await page.textContent('.mask.end .rc-total')}`);
  // 规则里的役种表
  await page.click(NEXT);
  await page.click('.topbar >> text=规则');
  await page.click('.rules .tab:has-text("役种")');
  await page.waitForSelector('.rules table');
  await noScroll(page, `立直役种表-${name}`, errors);
  const yaku = (await page.$$('.rules.rc-guide td.n')).length;
  if (yaku < 30) errors.push(`役种表只有 ${yaku} 行`);
  const ok = errors.length === 0;
  failed ||= !ok;
  console.log(`rc ${name}: ${ok ? `ok，一局结算有役种表（${rounds + 1} 局内）、规则里役种 ${yaku} 行、控制台零报错` : `报错：\n${errors.join('\n')}`}`);
  await page.close();
}

for (const [name, viewport] of [
  ['land', { width: 1280, height: 720 }],
  ['port', { width: 390, height: 844 }],
] as const) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && !/502|Bad Gateway/.test(m.text()) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => localStorage.setItem('mahjong.guide', '1'));
  await page.goto(`http://127.0.0.1:${port}/games/mahjong/?turbo`);
  // 主页（0.17.0）→ 娱乐卡 → 选桌页 → 单机开打
  await page.waitForSelector('.home-main');
  await noScroll(page, `主页-${name}`, errors);
  await page.click('.mode.fun');
  await page.waitForSelector('.lobby-head', { timeout: 8_000 }).catch(async () => { await page.screenshot({ path: `${root}shots/smoke-ladder-leave.png` }); throw new Error('离开以后没回选桌页'); });
  await noScroll(page, `选桌页-${name}`, errors);
  await page.click('text=单机开打');
  await page.waitForSelector('.my-hand .tile');
  // 对局中点"大厅"：先问一次，点"接着打"留在牌桌
  await page.click('.home');
  // 只认确认框里的按钮：问话本身也带"接着打"（"不能接着打"），按字找会点到问话上
  const stay = '.mask.confirm button:has-text("接着打")';
  await page.waitForSelector(stay);
  await page.click(stay);
  await soloFun(page, name);
  if (!(await play(page, name))) errors.push('一场里没出现过胡牌亮牌');
  await page.screenshot({ path: `${root}shots/smoke-${name}.png` });
  await noScroll(page, `一场结算-${name}`, errors);
  // 结算页的"分享"（docs/social.md 1.1）：无头浏览器没有带文件的系统分享，出 kit 的预览层（存图、复制链接、关闭）
  await page.click('.share-card');
  await page.waitForSelector('[data-key="share:close"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${root}shots/smoke-${name}-share.png` });
  // 卡片原图另存一份（kit 0.15.0 起右下角有二维码，人工看一眼）
  const card = await page.evaluate(async () => {
    const img = document.querySelector<HTMLImageElement>('img[alt="战绩图"]');
    if (!img) return null;
    const b = new Uint8Array(await (await fetch(img.src)).arrayBuffer());
    let s = '';
    for (const x of b) s += String.fromCharCode(x);
    return btoa(s);
  });
  if (card) writeFileSync(`${root}shots/smoke-${name}-card.png`, Buffer.from(card, 'base64'));
  else errors.push('分享预览里没有卡片图');
  await page.click('[data-key="share:close"]');
  const shared = await page.evaluate(() => (window as unknown as { __shareLog?: string[] }).__shareLog ?? []);
  if (!shared.includes('分享 预览')) errors.push(`分享没出预览：${shared.join(' | ')}`);
  // 回选桌、再回主页，看一眼规则表
  await page.click('.mask.end >> text=回选桌');
  await page.click('.pill.back');
  await page.waitForSelector('.home-main');
  await page.click('text=规则和番型表');
  await page.waitForSelector('.rules table');
  await noScroll(page, `番型表-${name}`, errors);
  const ok = errors.length === 0;
  failed ||= !ok;
  console.log(`${name}: ${ok ? 'ok，控制台零报错' : `控制台报错：\n${errors.join('\n')}`}`);
  await page.close();
}
// 听牌速判（竖屏 390×844）：主页"速判"进说明屏 → 开始；9 个按钮每个至少 44 见方；点一个选上、再点取消（反悔）、再选上提交，
// 一直答到 60 秒用完出成绩；控制台零报错。答对答错不管（判题和计分有单测）。`npm run smoke -- --only ting` 只跑这一段
async function tingSmoke(): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && !/502|Bad Gateway/.test(m.text()) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => localStorage.setItem('mahjong.guide', '1'));
  await page.goto(`http://127.0.0.1:${port}/games/mahjong/`);
  await page.click('.prog:has-text("速判")');
  await page.click('.td-go');
  await page.waitForSelector('.td-key');
  const keys = await page.$$eval('.td-key', (bs) => bs.map((b) => b.getBoundingClientRect()).map((r) => Math.min(r.width, r.height)));
  if (keys.length !== 9 || Math.min(...keys) < 44) errors.push(`9 个按钮至少 44 见方：${keys.map((x) => x.toFixed(0)).join(',')}`);
  let undo = false;
  for (let i = 0; i < 400 && !(await page.$('.td-big')); i++) {
    const key = page.locator('.td-key').first();
    if (!(await key.isVisible().catch(() => false))) {
      await page.waitForTimeout(200);
      continue;
    }
    await key.click().catch(() => {});
    if (!undo) {
      // 提交前反悔：选上的有 on，再点一下没了
      const on = await key.evaluate((b) => b.classList.contains('on')).catch(() => false);
      await key.click().catch(() => {});
      const off = await key.evaluate((b) => !b.classList.contains('on')).catch(() => false);
      if (!on || !off) errors.push('点一下选上、再点一下取消');
      undo = true;
      await key.click().catch(() => {});
    }
    await page.click('.td-submit', { timeout: 1_000 }).catch(() => {});
    await page.waitForTimeout(250);
  }
  if (!(await page.waitForSelector('.td-big', { timeout: 15_000 }).catch(() => null))) errors.push('60 秒后没出成绩');
  else await noScroll(page, '速判成绩', errors);
  await page.screenshot({ path: `${root}shots/smoke-ting.png` });
  console.log(`ting: ${errors.length ? `报错：\n${errors.join('\n')}` : `ok，按钮 ${Math.min(...keys).toFixed(0)} 见方、能反悔、出了成绩（${(await page.textContent('.td-big'))?.trim()}）、控制台零报错`}`);
  if (errors.length) failed = true;
  await page.close();
}

// 茶馆擂台（1280×800）：主页"擂台"进擂台页 → 血战开擂 → 打完第一桌，结算里有擂台那一行；
// 赢了点"下一桌"、输了点"再开一轮"，打几手后点"离开"，回擂台页"接着打"，顶栏还是同一桌、河里的牌还在。`npm run smoke -- --only ladder` 只跑这一段
async function ladderSmoke(): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && !/502|Bad Gateway/.test(m.text()) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => localStorage.setItem('mahjong.guide', '1'));
  const url = `http://127.0.0.1:${port}/games/mahjong/?turbo`;
  await page.goto(url);
  await page.click('.prog:has-text("擂台")');
  await page.click('.ld-card[data-mode="xz"] .ld-go');
  await page.waitForSelector('.my-hand .tile');
  if (!(await page.textContent('.topbar'))?.includes('擂台第 1 桌')) errors.push('顶栏没写擂台第 1 桌');
  await play(page, 'ladder');
  const end = await page.waitForSelector('.mask.end .ladder-end');
  const won = await end.evaluate((e) => e.classList.contains('next'));
  await page.screenshot({ path: `${root}shots/smoke-ladder-end.png` });
  // 按按钮选：擂台结算顶上那句"……赢了！下一桌：普通"也含"下一桌"，按文字选会点到那行字上
  await page.click(`.mask.end button:has-text("${won ? '下一桌' : '再开一轮'}")`);
  await page.waitForSelector('.my-hand .tile');
  const table = won ? 2 : 1;
  // 中途离开：打几手后点"离开"（确认的话是"下次接着打"），刷新后从主页进擂台页接着打，河里的牌一张不少（接着这一手，不是重开）
  for (let i = 0; i < 300 && (await page.$$('.river .tile')).length < 4; i++) {
    if (await page.$('text=帮我选')) {
      await page.click('text=帮我选').catch(() => {});
      await page.click('button:has-text("换出")').catch(() => {});
    } else if (await page.$('.act.que.best')) await page.click('.act.que.best').catch(() => {});
    else if (await page.$('.bar .act.pass')) await page.click('.bar .act.pass').catch(() => {});
    else await (await page.$$('.my-hand .tile:not(.off)')).at(-1)?.dblclick().catch(() => {});
    await page.waitForTimeout(60);
  }
  await page.click('.topbar >> text=离开');
  await page.click('.mask.confirm .act.danger');
  await page.waitForSelector('.lobby-head', { timeout: 8_000 }).catch(async () => { await page.screenshot({ path: `${root}shots/smoke-ladder-leave.png` }); throw new Error('离开以后没回选桌页'); });
  if (!(await page.evaluate(() => localStorage.getItem('mahjong.solo')))) errors.push('离开以后擂台这一桌的存档没了');
  await page.goto(url);
  await page.click('.prog:has-text("擂台")');
  await page.waitForSelector(`.ld-card[data-mode="xz"] >> text=接着打第 ${table} 桌`);
  await noScroll(page, '擂台页（打到一半）', errors);
  await page.screenshot({ path: `${root}shots/smoke-ladder-page.png` });
  await page.click('.ld-card[data-mode="xz"] .ld-go');
  await page.waitForSelector('.my-hand .tile');
  if (!(await page.textContent('.topbar'))?.includes(`擂台第 ${table} 桌`)) errors.push(`接着打以后顶栏不是擂台第 ${table} 桌`);
  if ((await page.$$('.river .tile')).length < 4) errors.push('接着打以后河里的牌没了（重开了）');
  console.log(`ladder: ${errors.length ? `报错：\n${errors.join('\n')}` : `ok，第一桌${won ? '赢了，进了第二桌' : '输了，再开一轮'}、离开后接着打第 ${table} 桌（河里的牌还在）、控制台零报错`}`);
  if (errors.length) failed = true;
  await page.close();
}

// 每日挑战交每日榜（1280×800）：假平台（/api/me 登录着、/api/scores 收分，别的 /api 照开发时回 502），选桌页开今天的川麻每日挑战打完；
// 结算里有"已进今日榜"，交了一次 daily-<日期>-xz、分数是整数；回主页补交不会再交第二次。`npm run smoke -- --only daily` 只跑这一段
async function dailySmoke(): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const posts: { boardId: string; score: number; userId: string }[] = [];
  await ctx.route('**/api/**', (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === '/api/me') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'u1', displayName: '茶客' }, service: 'ok', saves: 'ok' }) });
    if (u.pathname === '/api/scores') {
      posts.push(r.request().postDataJSON());
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ best: 0, improved: true }) });
    }
    return r.fulfill({ status: 502, body: 'Bad Gateway' });
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && !/502|Bad Gateway/.test(m.text()) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => localStorage.setItem('mahjong.guide', '1'));
  const url = `http://127.0.0.1:${port}/games/mahjong/?turbo`;
  await page.goto(url);
  await page.click('.mode.fun');
  await page.click('.daily-entry');
  await page.waitForSelector('.my-hand .tile');
  await play(page, 'daily');
  await page.waitForSelector('.mask.end .daily-line >> text=已进今日榜', { timeout: 10_000 }).catch(() => errors.push('结算里没写"已进今日榜"'));
  await page.screenshot({ path: `${root}shots/smoke-daily-end.png` });
  if (posts.length !== 1 || !/^daily-\d{4}-\d{2}-\d{2}-xz$/.test(posts[0]!.boardId) || !Number.isInteger(posts[0]!.score) || posts[0]!.userId !== 'u1')
    errors.push(`交榜不对：${JSON.stringify(posts)}`);
  // 回主页（会补交没交上的）：已经交过，不再交
  await page.goto(url);
  await page.waitForSelector('.home-main');
  await page.waitForTimeout(1_000);
  if (posts.length !== 1) errors.push(`回主页又交了一次：${posts.length}`);
  console.log(`daily: ${errors.length ? `报错：\n${errors.join('\n')}` : `ok，交了一次 ${posts[0]!.boardId}（${posts[0]!.score} 分）、结算写了"已进今日榜"、回主页没重交、控制台零报错`}`);
  if (errors.length) failed = true;
  await ctx.close();
}
await tingSmoke();
await ladderSmoke();
await dailySmoke();

await browser.close();
await server.close();
process.exit(failed ? 1 : 0);

/**
 * 一屏放下（docs/ui.md 第 11 节）：五个尺寸各走一遍主页、娱乐和好友房选桌页、规则小册子每一页（血战、立直）、擂台、速判、何切，都不许要滚动。
 * 牌桌和结算在上面的整场里量。`npm run smoke -- --only noscroll` 只跑这一段
 */
async function noScrollSmoke(): Promise<void> {
  const errors: string[] = [];
  for (const [w, h] of [
    [1280, 720],
    [1920, 1080],
    [844, 390],
    [390, 844],
    [360, 640],
  ] as const) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    page.on('console', (m) => m.type() === 'error' && !/401|404|502|Bad Gateway|Failed to load resource/.test(m.text()) && errors.push(`${w}×${h} ${m.text()}`));
    page.on('pageerror', (e) => errors.push(`${w}×${h} ${String(e)}`));
    await page.addInitScript(() => {
      localStorage.setItem('mahjong.guide', '1');
      localStorage.setItem('mahjong.guide.rc', '1');
    });
    const home = async (variant: string): Promise<void> => {
      await page.goto(`http://127.0.0.1:${port}/games/mahjong/?turbo`);
      await page.waitForSelector('.home-main');
      await page.click(`.quick-variants .chip:has-text("${variant}")`).catch(() => {});
      await page.waitForTimeout(200);
    };
    for (const v of ['血战', '三人', '立直']) {
      await home(v);
      await noScroll(page, `${w}×${h}主页-${v}`, errors);
      for (const m of ['fun', 'room']) {
        await home(v);
        await page.click(`.mode.${m}`);
        await page.waitForSelector('.lobby-head');
        await noScroll(page, `${w}×${h}选桌页-${m}-${v}`, errors);
      }
    }
    for (const v of ['血战', '立直']) {
      await home(v);
      await page.click('.home-main .link');
      for (const t of await page.$$eval('.rules .tab', (x) => x.map((e) => e.textContent!.trim()))) {
        await page.click(`.rules .tab:has-text("${t}")`);
        await noScroll(page, `${w}×${h}规则-${v}-${t}`, errors);
        // 放不下的页翻到最后一页也量一次
        while (await page.$('.rules .pager .pg-next:not(:disabled)')) await page.click('.rules .pager .pg-next');
        await noScroll(page, `${w}×${h}规则-${v}-${t}-末页`, errors);
      }
    }
    for (const prog of ['擂台', '速判', '何切']) {
      await home('血战');
      await page.click(`.prog:has-text("${prog}")`);
      await page.waitForTimeout(300);
      await noScroll(page, `${w}×${h}${prog}`, errors);
    }
    await page.close();
  }
  failed ||= errors.length > 0;
  console.log(`noscroll: ${errors.length ? `\n${errors.join('\n')}` : 'ok，五个尺寸都一屏放下、控制台零报错'}`);
}
