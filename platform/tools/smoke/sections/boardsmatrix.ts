/**
 * 冒烟分段：boardsmatrix（npm run smoke -- --only=boardsmatrix，不在全量里）。排行页每个页签 × 空榜 / 1 人 / 满榜 × 三个尺寸各截一张给人看，
 * 顺带量重叠、裁字、页面滚动，和"卡片里内容只占顶上一小块、下面一大片空"（内容底到卡片底的空白占卡高的比例）。
 * 每日榜的榜名、分数格式都用假的：平台只读游戏的 daily.json，这里不引用游戏的文件。
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser } from 'playwright-core';
import { BASE, check, json, newPage, OUT, type Screen, shot } from '../lib/core.ts';
import { mockSession } from '../lib/fakes.ts';
import { overlapClipIssues } from '../lib/ui.ts';

const SIZES: { label: string; w: number; h: number; screen: Screen }[] = [
  { label: '1280x720', w: 1280, h: 720, screen: 'desktop' },
  { label: '1920x1080', w: 1920, h: 1080, screen: 'desktop' },
  { label: '390x844', w: 390, h: 844, screen: 'portrait' },
];
const FILLS = ['empty', 'one', 'full'] as const;
type Fill = (typeof FILLS)[number];
const NAMES = ['老王的徒弟', '小明', '某人', '输光了', '韭菜', '阿强', '小红', '大刘', '老六', '新来的', '路过', '阿珍', '老周', '二狗', '小美', '阿飞', '大熊', '小鱼', '豆豆', '石头'];
const u = (i: number) => String.fromCharCode(65 + (i % 26)).repeat(21) + String(i % 10);
const WEEKLY = ['total', 'kaipan', 'guandan', 'texas', 'mahjong', 'yexun', 'haidao'];
const DAILY = ['kaipan:classic', 'guandan:ddzpz', 'texas:tour', 'mahjong:xz', 'yexun:vigil'];
const count: Record<Fill, number> = { empty: 0, one: 1, full: 20 };

/** 1 人时就是我自己；满榜时我是第 5 名 */
function weekly(fill: Fill) {
  const n = count[fill];
  const meAt = fill === 'one' ? 0 : fill === 'full' ? 4 : -1;
  const entries = NAMES.slice(0, n).map((displayName, i) => ({ rank: i + 1, userId: u(i), displayName, avatar: null, value: 52_000 - i * 2_350, isMe: i === meAt }));
  return { entries, me: meAt >= 0 ? { rank: meAt + 1, value: entries[meAt]!.value } : null };
}
function daily(fill: Fill) {
  const w = weekly(fill);
  return { entries: w.entries.map(({ value, ...e }) => ({ ...e, score: Math.round(value / 10) })), me: w.me && { rank: w.me.rank, score: Math.round(w.me.value / 10) } };
}

export async function boardsMatrix(browser: Browser): Promise<void> {
  const issues: string[] = [];
  const table = ['| 尺寸 | 页签 | 状态 | 卡片 | 卡里空白 | 页面滚动 |', '|---|---|---|---|---|---|'];
  for (const size of SIZES) {
    const { ctx, page } = await newPage(browser, `排行矩阵 ${size.label}`, size.screen, { viewport: { width: size.w, height: size.h } });
    await mockSession(page);
    let fill: Fill = 'empty';
    // 每日榜：有榜名才会去读；空榜时榜名为 null（今天还没人交分）。键照 shared/games.ts 的登记（featuredDaily），登记改了这里跟着改
    await page.route('**/api/leaderboard?scope=*', (r) => {
      const boards = Object.fromEntries(WEEKLY.map((k) => [k, weekly(fill)]));
      const names = Object.fromEntries(DAILY.map((k) => [k, fill === 'empty' ? null : `daily-2026-11-03-${k.replace(':', '-')}`]));
      return r.fulfill(json({ week: '2026-11-02', boards, daily: names }));
    });
    await page.route('**/api/boards/*/*?scope=*', (r) => r.fulfill(json(daily(fill))));
    await page.route('**/api/friends/week/*', (r) => r.fulfill(json({ week: '2026-11-02', ...daily(fill) })));
    await page.route('**/games/*/daily.json', (r) => r.fulfill(json({ score: [{ text: '{n} 分' }] })));
    await page.goto(`${BASE}/boards`);
    await page.getByTestId('btab-total').waitFor();
    const tabs = await page.locator('[data-testid^="btab-"]').evaluateAll((els) => els.map((e) => ({ id: e.getAttribute('data-testid')!.slice(5), name: e.textContent ?? '' })));
    for (const f of FILLS) {
      fill = f;
      for (const tab of tabs) {
        await page.goto(`${BASE}/boards`);
        await page.getByTestId(`btab-${tab.id}`).click();
        await page.getByTestId('board-body').locator(f === 'empty' ? '[data-testid="board-empty"]' : '[data-testid="ranks"]').first().waitFor();
        await page.waitForTimeout(400);
        const tag = `${size.label} ${tab.name} ${f}`;
        await shot(page, `bm-${size.label}-${tab.id}-${f}`, false);
        const m = await page.evaluate(() => {
          const cards = [...document.querySelectorAll<HTMLElement>('.bcard')].filter((c) => c.offsetParent !== null);
          return {
            cards: cards.map((c) => {
              const box = c.getBoundingClientRect();
              const kids = [...c.querySelectorAll<HTMLElement>('.bcard__head, .empty > *, .bcard__mine, .podium__item, .paged__item, .paged__bar')].filter((k) => k.offsetParent !== null);
              const bottom = Math.max(box.top, ...kids.map((k) => k.getBoundingClientRect().bottom));
              return { h: Math.round(box.height), gap: Math.round(box.bottom - bottom) };
            }),
            sh: document.documentElement.scrollHeight,
            ch: document.documentElement.clientHeight,
          };
        });
        const { overlaps, clips } = await overlapClipIssues(page);
        for (const p of [...overlaps, ...clips]) issues.push(`${tag}：${p}`);
        const scroll = m.sh > m.ch;
        if (scroll) issues.push(`${tag}：页面滚动 ${m.sh} > ${m.ch}`);
        table.push(`| ${size.label} | ${tab.name} | ${f} | ${m.cards.map((c) => c.h).join(' / ')} | ${m.cards.map((c) => `${c.gap}（${Math.round((100 * c.gap) / Math.max(1, c.h))}%）`).join(' / ')} | ${scroll ? '滚' : '—'} |`);
      }
    }
    await ctx.close();
  }
  writeFileSync(join(OUT, 'boardsmatrix.md'), [...table, '', `重叠、裁字、滚动 ${issues.length} 处`, ...issues.map((p) => `- ${p}`), ''].join('\n'));
  console.log(`  排行矩阵：重叠、裁字、滚动 ${issues.length} 处（表在 boardsmatrix.md）`);
  check(issues.length === 0, `排行矩阵：\n  ${issues.join('\n  ')}`);
}
