/** 冒烟分段：podiumMatrix（npm run smoke -- --only=<段名>，段名表在 tools/smoke.ts） */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser } from 'playwright-core';
import { BASE, check, json, newPage, OUT, type Screen, shot } from '../lib/core.ts';
import { mockSession } from '../lib/fakes.ts';

/**
 * 总榜领奖台：1、2、3、10、15 个人（15 人宽屏要翻页），我在榜上和不在，五个尺寸逐个量；一两个人不站台子，查的是"列表、没有台子"。
 * 宽屏的领奖台有尺寸包含，按内容收缩会被算成 0 宽（11-02 线上一个人上榜时缩成一根竖条），所以量实际宽度，不只看有没有。
 * 矮屏（Boards.tsx 的 COMPACT：手机横屏、360×640 这类）本来就不放领奖台，所有人排成列表，这里查的是"列表、没有台子"。
 */
export async function podiumMatrix(browser: Browser): Promise<void> {
  const sizes: { w: number; h: number; screen: Screen }[] = [
    { w: 1280, h: 720, screen: 'desktop' },
    { w: 1920, h: 1080, screen: 'desktop' },
    { w: 844, h: 390, screen: 'landscape' },
    { w: 390, h: 844, screen: 'portrait' },
    { w: 360, h: 640, screen: 'portrait' },
  ];
  const names = ['老王的徒弟', '小明', '某人', '输光了', '韭菜', '阿强', '小红', '大刘', '老六', '新来的', '路过', '阿珍', '老周', '二狗', '小美'];
  const u = (i: number) => String.fromCharCode(65 + i).repeat(22);
  // 我在榜上：人少时我是第 2 名（一个人时就是我），10 个人时我是第 5 名（在翻页名单里）
  const boardOf = (n: number, mine: boolean) => {
    const meAt = mine ? (n === 1 ? 0 : n >= 10 ? 4 : 1) : -1;
    const entries = names.slice(0, n).map((name, i) => ({ rank: i + 1, userId: u(i), displayName: name, avatar: null, value: 50_000 - i * 3_000, isMe: i === meAt }));
    return { entries, me: meAt >= 0 ? { rank: meAt + 1, value: entries[meAt]!.value } : null };
  };
  let current: { entries: ReturnType<typeof boardOf>['entries']; me: ReturnType<typeof boardOf>['me'] } = boardOf(1, true);
  // 一个组合不过不马上中断：量完整张表再一起报，要的是整张表
  const bad: string[] = [];
  const expect = (cond: boolean, msg: string) => {
    if (!cond) bad.push(msg);
  };
  const rows: string[] = ['| 尺寸 | 人数 | 我 | 领奖台宽 | 最窄台子 | 卡到台顶 | 有名单 | 页面滚动 |', '|---|---|---|---|---|---|---|---|'];
  for (const { w, h, screen } of sizes) {
    console.log(`领奖台 ${w}×${h}`);
    const { ctx, page } = await newPage(browser, `领奖台 ${w}x${h}`, screen, { viewport: { width: w, height: h } });
    await mockSession(page);
    await page.route('**/api/leaderboard?scope=*', (r) => r.fulfill(json({ week: '2026-10-12', daily: {}, boards: { total: current } })));
    for (const n of [1, 2, 3, 10, 15]) {
      for (const mine of [true, false]) {
        current = boardOf(n, mine);
        await page.goto(`${BASE}/boards`);
        const card = page.getByTestId('board-weekly');
        await card.getByText(names[0]!).first().waitFor();
        // 我在前三名里只高亮自己那格，不单写"我"那一行；10 个人时我第 5 名，才有那一行
        if (mine) await (n >= 10 ? card.getByTestId('my-rank') : card.locator('.rank--me')).first().waitFor();
        // 一屏放下要等翻页按高度排好（Paged 量完高度再排一遍），刚出字就量会把排版途中的高度算进去
        await page.waitForTimeout(300);
        const m = await page.evaluate(() => {
          const pod = document.querySelector('[data-testid="board-weekly"] .podium');
          const items = [...document.querySelectorAll('[data-testid="board-weekly"] .podium__item')].map((el) => el.getBoundingClientRect());
          return {
            podium: pod ? Math.round(pod.getBoundingClientRect().width) : 0,
            minItem: items.length ? Math.round(Math.min(...items.map((r) => r.width))) : 0,
            minItemH: items.length ? Math.round(Math.min(...items.map((r) => r.height))) : 0,
            // "我的名次"卡底到最高那个台子顶的空隙（没有"我的名次"卡时记 -1）
            gap: (() => {
              const mine = document.querySelector('[data-testid="board-weekly"] [data-testid="my-rank"]');
              return mine && items.length ? Math.round(Math.min(...items.map((r) => r.top)) - mine.getBoundingClientRect().bottom) : -1;
            })(),
            list: !!document.querySelector('[data-testid="board-weekly"] [data-testid="rank-pages"]'),
            sh: document.documentElement.scrollHeight,
            ch: document.documentElement.clientHeight,
            sw: document.documentElement.scrollWidth,
            cw: document.documentElement.clientWidth,
            // 超出一屏时记下最下面那几个元素，好知道是谁撑出来的
            over: [...document.querySelectorAll('body *')]
              .filter((el) => el.getBoundingClientRect().bottom > document.documentElement.clientHeight + 0.5)
              .slice(-3)
              .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}@${Math.round(el.getBoundingClientRect().bottom)}`)
              .join(' '),
          };
        });
        const what = `${w}×${h} ${n} 人 ${mine ? '我在榜上' : '我不在榜上'}`;
        const compact = await page.evaluate(() => matchMedia('(max-height: 600px), (max-width: 480px) and (max-height: 700px)').matches);
        if (compact) {
          expect(m.podium === 0 && m.list, `排行页（${what}）矮屏该排成列表、不放领奖台`);
        } else if (n < 3) {
          // 一两个人不站台子，排成列表（一个人的台子孤零零一块）
          expect(m.podium === 0 && m.list, `排行页（${what}）不满三个人该排成列表、不放领奖台`);
        } else {
          expect(m.podium >= 160, `领奖台（${what}）宽 ${m.podium}，该 ≥160`);
          expect(m.minItem >= 60, `领奖台（${what}）最窄的台子 ${m.minItem}，该 ≥60`);
          expect(m.minItemH >= 60, `领奖台（${what}）最矮的台子 ${m.minItemH}，该 ≥60`);
          expect(m.list === n > 3, `领奖台（${what}）${n > 3 ? '该有' : '不该有'}翻页名单`);
        }
        // 横向超出（比如顶栏放不下）在手机上会让浏览器把整页缩小，竖向也跟着放不下
        expect(m.sw <= m.cw, `排行页（${what}）横向超出：scrollWidth ${m.sw} > ${m.cw}`);
        expect(m.sh <= m.ch, `排行页（${what}）该一屏放下：scrollHeight ${m.sh} > ${m.ch}（超出的：${m.over}）`);
        rows.push(`| ${w}×${h} | ${n} | ${mine ? '在' : '不在'} | ${compact ? '矮屏不放' : m.podium} | ${compact ? '—' : `${m.minItem}×${m.minItemH}`} | ${m.gap >= 0 && !compact ? m.gap : '—'} | ${m.list ? '有' : '无'} | ${m.sh > m.ch ? `滚 ${m.sh - m.ch}` : '不滚'} |`);
        if ((w === 1920 || w === 1280) && mine && (n === 1 || n === 3 || n >= 10)) await shot(page, `podium-${w}-${n}`, false);
      }
    }
    // 有负分：净赢榜后端只给赢了的（> 0），我这周输了就不在榜上（me 是 null）；谁都没赢时榜是空的
    for (const [label, board, want] of [
      ['我输了、别人赢了', { entries: boardOf(2, false).entries, me: null }, 'mine'],
      ['谁都没赢', { entries: [], me: null }, 'empty'],
    ] as const) {
      current = { entries: [...board.entries], me: board.me };
      await page.goto(`${BASE}/boards`);
      const card = page.getByTestId('board-weekly');
      const what = `${w}×${h} ${label}`;
      if (want === 'mine') {
        await card.getByText(names[0]!).first().waitFor();
        expect((await card.getByTestId('my-rank').getByText('这周还没赢').count()) === 1, `排行页（${what}）"我"那一行该写"这周还没赢"`);
        expect((await card.locator('.rank--me').count()) === 0, `排行页（${what}）榜上不该有我`);
      } else {
        await card.getByTestId('board-empty').waitFor();
        expect((await card.getByTestId('board-empty').getByText('这周还没人上榜').count()) === 1, `排行页（${what}）空榜该说"这周还没人上榜"`);
      }
      await page.waitForTimeout(300);
      const sh = await page.evaluate(() => [document.documentElement.scrollHeight, document.documentElement.clientHeight, document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      expect(sh[0]! <= sh[1]! && sh[2]! <= sh[3]!, `排行页（${what}）该一屏放下、不横向超出：${sh.join('/')}`);
      rows.push(`| ${w}×${h} | ${label} | 不在 | — | — | — | ${want === 'mine' ? '有' : '空榜'} | ${sh[0]! > sh[1]! ? `滚 ${sh[0]! - sh[1]!}` : '不滚'} |`);
    }
    await ctx.close();
  }
  writeFileSync(join(OUT, 'podium-table.md'), `${rows.join('\n')}\n`);
  console.log(`  量测表 ${join(OUT, 'podium-table.md')}`);
  check(bad.length === 0, `领奖台矩阵 ${bad.length} 处不对：\n${bad.join('\n')}`);
}
