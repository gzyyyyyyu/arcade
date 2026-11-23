/** 界面检查和常用操作：卡片按钮放不放得下、电脑版主区宽度、手机上的点按目标和字号、分享按钮、动态的一行 */
import type { Locator, Page } from 'playwright-core';
import { GAMES } from '../../../shared/games.ts';
import { check, shot } from './core.ts';

/** 一条动态的三段：名字、在哪、结果标签（每个标签一块，数字整个在标签里） */
export async function feedLine(item: Locator, who: string, where: string, tags: string[]): Promise<void> {
  await item.locator('.feed__name', { hasText: who }).waitFor();
  check((await item.locator('.feed__game').textContent())?.trim() === where, `动态"在哪"不对：${await item.locator('.feed__game').textContent()}`);
  const got = (await item.locator('.feed__tag').allTextContents()).map((t) => t.trim());
  check(got.join('|') === tags.join('|'), `动态的标签不对：${got.join('|')}`);
}

/** 排行榜页。本周净赢（总榜、各游戏）、开盘每日挑战（分数写法读游戏的 daily.json）、称号收集，全部 / 只看好友；我不在前 50 时单独一行。 */
/** 点一下分享按钮。桌面无头浏览器不支持带文件的系统分享，应该出 kit 的预览层；关掉后日志里有"分享 预览" */
export async function clickShare(page: Page, testId: string, shotName: string): Promise<void> {
  await page.getByTestId(testId).click();
  await page.locator('#arcade-share-preview').waitFor();
  await shot(page, shotName);
  const log = await page.evaluate(() => (window as Window & { __arcadeShareLog?: string[] }).__arcadeShareLog ?? []);
  check(log.some((l) => l.includes('分享 预览')), `分享日志里该有"分享 预览"：${log.join(' | ')}`);
  // 电脑上不弹系统共享，直接出预览，多一个"复制图片"（去微信粘贴）
  if (shotName.endsWith('desktop')) check((await page.locator('#arcade-share-preview [data-key="share:copy-image"]').count()) === 1, '电脑上的分享预览该有"复制图片"');
  await page.locator('#arcade-share-preview [data-key="share:close"]').click();
  await page.locator('#arcade-share-preview').waitFor({ state: 'detached' });
}

/**
 * 电脑版排版：在 1280、1920 宽各看一次——主区不能还是中间一窄列（至少占内容区的 85%），整页不能横着滑；各截一张。
 * 看完把窗口恢复成原来的大小
 */
/**
 * 大厅游戏卡：每张只有一个按钮，和名字同一排、完整在卡里、够高（触屏 44，鼠标 32）；同一行的卡片按钮在同一高度
 */
export async function cardButtonsFit(page: Page, where: string): Promise<void> {
  const cards = await page.locator('.lobby-grid .card').evaluateAll((els) =>
    els.map((c) => {
      const card = c.getBoundingClientRect();
      const btns = [...c.querySelectorAll('.card__play')].map((e) => e.getBoundingClientRect());
      const btn = btns[0];
      const min = matchMedia('(pointer: coarse)').matches ? 43.5 : 31.5;
      const full = !!btn && btn.height >= min && btn.left >= card.left && btn.right <= card.right + 0.5 && btn.bottom <= card.bottom + 0.5;
      return { top: Math.round(card.top), n: btns.length, bottom: Math.round(btn?.bottom ?? 0), full };
    }),
  );
  check(cards.every((c) => c.n === 1 && c.full), `${where}：每张卡只该有一个按钮，完整在卡里、够高：${JSON.stringify(cards)}`);
  const rows = new Map<number, Set<number>>();
  for (const c of cards) rows.set(c.top, (rows.get(c.top) ?? new Set<number>()).add(c.bottom));
  check([...rows.values()].every((r) => r.size === 1), `${where}：同一行卡片的按钮应该在同一高度：${JSON.stringify(cards)}`);
}

/**
 * 一屏放下（docs/ui.md 第 11 节）：整页不比视口高；翻页列表、内容区里的东西没有被裁掉或伸出去。
 * 返回问题列表，空的就是放下了
 */
export async function noScrollIssues(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const d = document.documentElement;
    if (d.scrollHeight > d.clientHeight) out.push(`整页 ${d.scrollHeight} 比视口 ${d.clientHeight} 高`);
    const name = (el: Element) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`;
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const s = getComputedStyle(el);
      if (/(auto|scroll)/.test(s.overflowY) && el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 1) out.push(`${name(el)} 里面能滚（${el.scrollHeight}/${el.clientHeight}）`);
    }
    for (const el of document.querySelectorAll<HTMLElement>('.paged__list')) {
      if (el.scrollHeight > el.clientHeight + 1) out.push(`${name(el)} 裁掉了一截（${el.scrollHeight}/${el.clientHeight}）`);
    }
    for (const el of document.querySelectorAll<HTMLElement>('.page__body, .page__body main')) {
      const r = el.getBoundingClientRect();
      const low = Math.max(...[...el.children].map((c) => c.getBoundingClientRect().bottom), r.bottom);
      if (low > r.bottom + 1) out.push(`${name(el)} 的内容伸出去 ${Math.round(low - r.bottom)}px`);
    }
    return out;
  });
}

/**
 * 有意用省略号截断的文字：选择器和理由。不在这里的元素，文字放不下就算"裁字"。
 * 只量"滚不滚"抓不到按钮压按钮、字被裁一截（海岛 11-02 手机竖屏登陆战），所以 noscroll 段一起量这两样。
 */
const CLIP_OK: readonly (readonly [string, string])[] = [
  ['.card__tagline', '大厅卡片的一句话最多两行，多的省略；完整介绍在电脑上悬停时、游戏里看'],
  ['.nudge__mid', '大厅提醒条窄屏只写"桌上"，几份加起来还放不下时省略它，游戏名和金额是单独两块、不截'],
];

/** 一屏里看得见的可点元素两两不相交（嵌套的不算）；文字不被裁（白名单 CLIP_OK 除外） */
export async function overlapClipIssues(page: Page): Promise<{ overlaps: string[]; clips: string[] }> {
  return page.evaluate((clipOk) => {
    const name = (el: Element) => {
      const t = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 12);
      return `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}${t ? `「${t}」` : ''}`;
    };
    const seen = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (el as HTMLElement).checkVisibility({ visibilityProperty: true, opacityProperty: true });
    };
    const clickable = [...document.querySelectorAll('button, a[href], [role="button"]')].filter(seen);
    const overlaps: string[] = [];
    for (let i = 0; i < clickable.length; i++) {
      for (let j = i + 1; j < clickable.length; j++) {
        const [a, b] = [clickable[i]!, clickable[j]!];
        if (a.contains(b) || b.contains(a)) continue;
        const [ra, rb] = [a.getBoundingClientRect(), b.getBoundingClientRect()];
        const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (w > 1 && h > 1) overlaps.push(`${name(a)} 和 ${name(b)} 重叠 ${Math.round(w)}×${Math.round(h)}`);
      }
    }
    const clips: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      // 只看直接带字的 HTML 块（SVG 的 text 另算）；宽高不到 2px 的是只给读屏的隐藏文字；能滚的容器另有"里面能滚"那一项
      const texts = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent!.trim());
      if (!texts.length || el instanceof SVGElement || el.clientWidth < 2 || el.clientHeight < 2 || !seen(el)) continue;
      const s = getComputedStyle(el);
      if (/(auto|scroll)/.test(s.overflowX + s.overflowY)) continue;
      // 量字本身占的范围，不用 scrollWidth/scrollHeight：触屏上透明外扩的点按区（::after）会把它们撑大，却没裁到字
      const box = el.getBoundingClientRect();
      const range = document.createRange();
      let over = { w: 0, h: 0 };
      for (const t of texts) {
        range.selectNodeContents(t);
        for (const r of range.getClientRects()) {
          over = { w: Math.max(over.w, box.left - r.left, r.right - box.right), h: Math.max(over.h, box.top - r.top, r.bottom - box.bottom) };
        }
      }
      if (clipOk.some(([sel]) => el.matches(sel))) continue;
      // 竖向放 3px：行高 1 的字（按钮、数字）字形框本来就比行框高一两像素，没裁到
      if (over.w > 1 || over.h > 3) {
        clips.push(`${name(el)} 字伸出框外 横 ${Math.round(over.w)}px 竖 ${Math.round(over.h)}px`);
        continue;
      }
      // 字在自己框里，但框被外层 overflow: hidden 的卡片切掉一截（844×390 钱包卡最后一行就是这样，只量自己的框抓不到）
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const as = getComputedStyle(a);
        if (/(auto|scroll)/.test(as.overflowX + as.overflowY)) break;
        if (!/(hidden|clip)/.test(as.overflowX + as.overflowY)) continue;
        const ab = a.getBoundingClientRect();
        let cut = 0;
        for (const t of texts) {
          range.selectNodeContents(t);
          for (const r of range.getClientRects()) cut = Math.max(cut, ab.left - r.left, r.right - ab.right, ab.top - r.top, r.bottom - ab.bottom);
        }
        if (cut > 3) {
          clips.push(`${name(el)} 被外层 ${name(a).split('「')[0]} 裁掉 ${Math.round(cut)}px`);
          break;
        }
      }
    }
    return { overlaps, clips };
  }, CLIP_OK);
}

export async function deskLayout(page: Page, name: string): Promise<void> {
  const before = page.viewportSize()!;
  // 大厅多看一个 2560 宽（卡片按钮叠在一起的问题是在 2560 宽屏上发现的）
  for (const width of name === 'home' ? [1280, 1920, 2560] : [1280, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    const m = await page.evaluate(() => {
      const shell = document.querySelector('.page')!;
      const cs = getComputedStyle(shell);
      const mr = document.querySelector('main')!.getBoundingClientRect();
      const inner = shell.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      // 没有侧栏：主区从外框内沿开始，宽度还给内容区
      const indent = mr.left - shell.getBoundingClientRect().left - parseFloat(cs.paddingLeft);
      return { main: mr.width, inner, indent, scroll: document.documentElement.scrollWidth - window.innerWidth };
    });
    check(m.main >= m.inner * 0.85, `${name}（${width} 宽）主区还是窄列：${Math.round(m.main)} / ${Math.round(m.inner)}`);
    check(Math.abs(m.indent) <= 2, `${name}（${width} 宽）主区左边空出 ${Math.round(m.indent)}px（不该有侧栏）`);
    check(m.scroll <= 0, `${name}（${width} 宽）整页能横着滑：多出 ${m.scroll}px`);
    if (name === 'home') await lobbyNoGap(page, `大厅 ${width} 宽`);
    await shot(page, `${name}-desk-${width}`);
  }
  await page.setViewportSize(before);
}

/** 大厅：卡片按钮放得下；格子铺满内容宽、整页不滚；电脑上一页放下全部游戏（不翻页） */
export async function lobbyNoGap(page: Page, where: string): Promise<void> {
  await cardButtonsFit(page, where);
  const m = await page.evaluate(() => {
    const body = document.querySelector('.lobby__games')!.getBoundingClientRect();
    const grid = document.querySelector('.lobby-grid .paged__list')!.getBoundingClientRect();
    const desk = matchMedia('(min-width: 960px) and (min-height: 600px)').matches;
    return { desk, wide: grid.width / body.width, pager: document.querySelectorAll('.lobby-grid .paged__bar').length, cards: document.querySelectorAll('.lobby-grid .card').length };
  });
  check(m.wide > 0.99, `${where}：游戏格子没铺满（${Math.round(m.wide * 100)}%）`);
  // 电脑上一页放下全部游戏；手机、横屏按高度翻页
  if (m.desk) {
    check(m.pager === 0, `${where}：电脑上该一页放下全部游戏，不该有翻页`);
    check(m.cards === GAMES.length, `${where}：一页只有 ${m.cards} 张卡，该有 ${GAMES.length} 张`);
  }
  const issues = await noScrollIssues(page);
  check(issues.length === 0, `${where}：${issues.join('；')}`);
}

/**
 * 手机界面专项：iPhone SE 375×667 竖、390×844 竖、844×390 横、iPad 820×1180 竖，
 * 平台各页逐页量：能点的东西 ≥ 44×44、字 ≥ 12px（数字 ≥ 14px）、整页不横着滑、没有东西伸出屏幕、顶栏一行放得下；
 * 第一屏就有主操作（大厅的游戏卡、钱包的余额和补给、排行的自己）。用管理员登录（顶栏按钮最多）。
 */
export const PHONES = [
  ['se', { width: 375, height: 667 }],
  ['iphone', { width: 390, height: 844 }],
  ['landscape', { width: 844, height: 390 }],
  ['ipad', { width: 820, height: 1180 }],
] as const;

/** 在页面里量一遍，返回不合格的地方（一句话一条） */
export async function phoneIssues(page: Page, minTap = 44, minNum = 14): Promise<string[]> {
  return page.evaluate(([minTap, minNum]) => {
    const out: string[] = [];
    const vw = window.innerWidth;
    const name = (el: Element) => `${el.tagName.toLowerCase()}${el.getAttribute('data-testid') ? `[${el.getAttribute('data-testid')}]` : ''}「${(el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 16)}」`;
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    // 在能横着滑的框里（表格、标签条）的东西伸出屏幕不算
    const inScroller = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return true;
      }
      return false;
    };
    if (document.documentElement.scrollWidth > vw + 1) out.push(`整页能横着滑：宽 ${document.documentElement.scrollWidth} > ${vw}`);
    for (const el of document.querySelectorAll('a[href], button, summary, input:not([type=hidden]), select, textarea')) {
      if (!visible(el) || el.closest('[aria-hidden="true"]')) continue;
      // 句子里的文字链接（隐私说明里的"我的账号"这种）按 WCAG 2.5.8 不算：它跟着一行字走，放大了反而把句子撑开
      if (el.tagName === 'A' && el.parentElement?.matches('p, li') && (el.parentElement.textContent ?? '').trim().length > (el.textContent ?? '').trim().length + 4) continue;
      // 复选框、单选框按它外面那一整行标签算
      const target = (el as HTMLInputElement).type === 'checkbox' || (el as HTMLInputElement).type === 'radio' ? (el.closest('label') ?? el) : el;
      const r = target.getBoundingClientRect();
      // 看着小、点击区用透明的 ::after 外扩的（页脚的链接，docs/ui.md 第 11 节"触屏 44 可透明外扩"）：按外扩后的大小算
      const after = getComputedStyle(target, '::after');
      const hit = after.content !== 'none' && after.position === 'absolute' ? { w: Math.max(r.width, parseFloat(after.width) || 0), h: Math.max(r.height, parseFloat(after.height) || 0) } : { w: r.width, h: r.height };
      if (hit.w < minTap - 0.5 || hit.h < minTap - 0.5) out.push(`点击区小：${name(el)} ${Math.round(hit.w)}×${Math.round(hit.h)}`);
      if (r.right > vw + 1 && !inScroller(el)) out.push(`伸出屏幕：${name(el)} 右边到 ${Math.round(r.right)}`);
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent ?? '').trim();
      const el = n.parentElement;
      if (!text || !el || seen.has(el) || !visible(el) || el.closest('svg, [aria-hidden="true"], .sr-only')) continue;
      seen.add(el);
      const size = parseFloat(getComputedStyle(el).fontSize);
      const numeric = /^[+\-−]?[\d,.:%·\s]+$/.test(text);
      if (size < (numeric ? minNum : 12) - 0.01) out.push(`字小：${name(el)} ${size}px${numeric ? '（数字）' : ''}`);
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 && !inScroller(el)) out.push(`字伸出屏幕：${name(el)}`);
    }
    const tops = [...document.querySelectorAll('.topbar .account')].filter(visible).map((e) => Math.round(e.getBoundingClientRect().top));
    if (new Set(tops).size > 1) {
      const bar = document.querySelector('.topbar')!;
      const need = [...bar.querySelectorAll('.account')].reduce((w, e) => w + e.getBoundingClientRect().width, 0);
      out.push(`顶栏折成了 ${new Set(tops).size} 行（按钮共 ${Math.round(need)}，这一行宽 ${Math.round(bar.getBoundingClientRect().width)}）`);
    }
    // 手机竖屏顶栏不挤：相邻按钮之间至少空 4px；排行、动态、好友的小字离按钮内沿左右各至少 4px（圆按钮里字不贴边）
    if (vw <= 560) {
      const items = [...document.querySelectorAll('.top__home, .topbar > *')].filter(visible).map((e) => [e, e.getBoundingClientRect()] as const).sort((a, b) => a[1].left - b[1].left);
      for (let i = 1; i < items.length; i++) {
        const gap = items[i]![1].left - items[i - 1]![1].right;
        if (gap < 3.5) out.push(`顶栏挤：${name(items[i - 1]![0])} 和 ${name(items[i]![0])} 只隔 ${gap.toFixed(1)}px（${vw} 宽，各项 ${items.map(([, r]) => Math.round(r.width)).join('/')}）`);
      }
      for (const el of document.querySelectorAll('.topbar .account--nav, .topbar .feedpop__btn')) {
        const label = el.querySelector('.account__label, .feedpop__label');
        if (!label || !visible(el)) continue;
        const r = el.getBoundingClientRect();
        const l = label.getBoundingClientRect();
        const bw = parseFloat(getComputedStyle(el).borderLeftWidth);
        const room = Math.min(l.left - r.left - bw, r.right - bw - l.right);
        if (parseFloat(getComputedStyle(el).borderTopLeftRadius) >= r.height / 2 - 1) out.push(`顶栏 ${name(el)} 是圆的，字会贴着弧边：手机上用圆角方块`);
        if (room < 3.5) out.push(`顶栏字贴边：${name(el)} 字离按钮内沿只有 ${room.toFixed(1)}px（按钮 ${Math.round(r.width)}，字 ${Math.round(l.width)}）`);
      }
    }
    // 关键元素互不相交：顶栏按钮之间、顶栏按钮和左上角标题
    const heads = [...document.querySelectorAll('.top__home, .topbar .account')].filter(visible).map((e) => [e, e.getBoundingClientRect()] as const);
    for (let i = 0; i < heads.length; i++)
      for (let j = i + 1; j < heads.length; j++) {
        const [a, ra] = heads[i]!;
        const [b, rb] = heads[j]!;
        if (ra.left < rb.right - 1 && rb.left < ra.right - 1 && ra.top < rb.bottom - 1 && rb.top < ra.bottom - 1) out.push(`顶栏叠在一起：${name(a)} 和 ${name(b)}`);
      }
    return [...new Set(out)];
  }, [minTap, minNum] as const);
}

/**
 * 手机大厅（有桌上筹码时）："回去接着打"是页面顶上的一条，按钮够大，游戏名和数字没被省略，页面里只有这一条；
 * 竖屏首屏至少 2 张游戏卡的标题整个看得到（横屏 390 高放不下横幅加两张卡，不查）；顶栏排行、动态、好友图标下面有 12px 常驻文字（全站最小字号）、点击区 ≥44
 */
export async function lobbyTopIssues(page: Page, viewport: { width: number; height: number }): Promise<string[]> {
  const out: string[] = [];
  const bar = page.getByTestId('nudge-stake');
  const pos = await bar.evaluate((el) => getComputedStyle(el).position);
  if (pos === 'fixed' || pos === 'sticky') out.push(`提示条不该是固定的：position=${pos}`);
  const box = (await bar.boundingBox())!;
  if (box.height < 44 || box.height > 72) out.push(`提示条高 ${Math.round(box.height)}，要 52 左右`);
  const btn = (await bar.getByRole('link', { name: '回去接着打' }).boundingBox())!;
  if (btn.height < 44) out.push(`"回去接着打"高 ${Math.round(btn.height)}，不到 44`);
  const cut = await bar.locator('.nudge__keep').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
  if (cut.length) out.push(`游戏名或数字被省略了：${cut.join('、')}`);
  if (!/德州扑克.*2,000/.test((await bar.textContent()) ?? '')) out.push('提示条上没写游戏名和数字');
  if ((await page.getByRole('link', { name: '回去接着打' }).count()) !== 1) out.push('"回去接着打"不止一个');
  const cards = await page.locator('.lobby-grid .card__title').evaluateAll((els, h) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= h; }).length, viewport.height);
  if (viewport.height > viewport.width && cards < 2) out.push(`首屏只看得到 ${cards} 张游戏卡的标题`);
  // 顶栏图标加字只在手机竖屏宽度（≤560）；更宽的屏本来就是图标加字横排
  for (const sel of viewport.width <= 560 ? ['.topbar .account--nav', '.topbar .feedpop__btn'] : []) {
    for (const el of await page.locator(sel).all()) {
      const b = (await el.boundingBox())!;
      if (b.height < 44 || b.width < 36) out.push(`顶栏 ${sel} 点击区 ${Math.round(b.width)}×${Math.round(b.height)}，要 ≥44 高`);
      const label = await el.locator('.account__label, .feedpop__label').first().evaluate((e) => { const r = e.getBoundingClientRect(); return { w: r.width, fs: parseFloat(getComputedStyle(e).fontSize) }; });
      if (label.w < 8 || label.fs !== 12) out.push(`顶栏 ${sel} 的文字标签不可见或字号不是 12px（宽 ${Math.round(label.w)}，字号 ${label.fs}）`);
    }
  }
  return out;
}

/** 多尺寸适配的尺寸矩阵（CSS 像素，所有游戏统一用这套）：手机竖、横，平板竖横和折叠屏，电脑 */
export const DEVICES: readonly (readonly [string, { width: number; height: number }])[] = [
  ...([[320, 568], [360, 640], [360, 780], [375, 667], [390, 844], [393, 852], [412, 915], [414, 896], [430, 932]] as const).map(([w, h]) => [`竖${w}×${h}`, { width: w, height: h }] as const),
  ...([[568, 320], [640, 360], [667, 375], [780, 360], [844, 390], [896, 414], [932, 430]] as const).map(([w, h]) => [`横${w}×${h}`, { width: w, height: h }] as const),
  ...([[768, 1024], [1024, 768], [820, 1180], [1180, 820], [1024, 1366], [1366, 1024], [884, 1104]] as const).map(([w, h]) => [`平板${w}×${h}`, { width: w, height: h }] as const),
  ...([[1280, 720], [1366, 768], [1920, 1080]] as const).map(([w, h]) => [`电脑${w}×${h}`, { width: w, height: h }] as const),
];
