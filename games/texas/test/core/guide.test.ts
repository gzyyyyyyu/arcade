import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { endHint, finishWalk, freshGuide, HINTS, overlaps, parseGuide, placeBest, placeCoach, replay, see, seeEnd, skipAll, stepsFor, type Box } from '../../src/guide.ts';

describe('新手指引的状态（只出一次）', () => {
  it('没有记录是全新的；坏的记录也当全新的', () => {
    expect(parseGuide(null)).toEqual(freshGuide());
    expect(parseGuide('x')).toEqual(freshGuide());
    expect(parseGuide({ v: 2, done: true, seen: [] })).toEqual(freshGuide());
    expect(parseGuide({ v: 1, done: 'yes', seen: [] })).toEqual(freshGuide());
  });

  it('旧版三页提示看过的老玩家：算走完，情境提示也不出', () => {
    const g = parseGuide(null, true);
    expect(g.done).toBe(true);
    expect(g.seen).toEqual([...HINTS]);
    // 有新记录就以新记录为准
    expect(parseGuide({ v: 1, done: false, seen: [] }, true).done).toBe(false);
  });

  it('读出来的提示名只留认识的、去重按固定顺序', () => {
    const g = parseGuide({ v: 1, done: true, seen: ['raise', 'nope', 'raise', 'result'] });
    // 老存档走完了的：旧版走一遍里讲过底池，底池提示照旧算看过
    expect(g.seen).toEqual(['result', 'raise', 'pot']);
    expect(parseGuide({ v: 1, done: false, seen: ['raise'] }).seen).toEqual(['raise']);
  });

  it('走完只记走完，提示照常；跳过连提示一起关；怎么玩全部重来', () => {
    const g = see(freshGuide(), 'raise');
    expect(finishWalk(g)).toEqual({ v: 1, done: true, seen: ['raise'] });
    expect(parseGuide(finishWalk(g)).seen).toEqual(['raise', 'pot']);
    expect(skipAll()).toEqual({ v: 1, done: true, seen: [...HINTS] });
    expect(replay()).toEqual(freshGuide());
  });

  it('see 不重复记', () => {
    const g = see(see(freshGuide(), 'result'), 'result');
    expect(g.seen).toEqual(['result']);
  });

  it('一手打完：先讲结果条在哪；第一次摊牌讲为什么赢；各只一次', () => {
    let g = freshGuide();
    // 第一手别人都弃了：只讲结果条
    expect(endHint(g, false)).toBe('result');
    g = seeEnd(g, 'result');
    expect(endHint(g, false)).toBeNull();
    // 之后第一次摊牌
    expect(endHint(g, true)).toBe('showdown');
    g = seeEnd(g, 'showdown');
    expect(endHint(g, true)).toBeNull();
    expect(endHint(g, false)).toBeNull();
  });

  it('第一手就摊牌：只出摊牌那条，结果条那条算一起看过', () => {
    let g = freshGuide();
    expect(endHint(g, true)).toBe('showdown');
    g = seeEnd(g, 'showdown');
    expect([...g.seen].sort()).toEqual(['result', 'showdown']);
    expect(endHint(g, false)).toBeNull();
  });

  it('走一遍的步骤：每步一两句，指向的块只有认识的几种，牌型表九行', () => {
    // 手机 3 步（4 步以内），电脑多一页快捷键
    expect(stepsFor(true).map((s) => s.id)).toEqual(['cards', 'buttons', 'rank']);
    expect(stepsFor(false).map((s) => s.id)).toEqual(['cards', 'buttons', 'rank', 'keys']);
    expect(new Set(stepsFor(false).map((s) => s.id)).size).toBe(4);
    for (const s of stepsFor(false)) {
      expect(s.title.length, s.id).toBeLessThanOrEqual(12);
      expect(s.lines.length, s.id).toBeLessThanOrEqual(2);
      for (const l of s.lines) expect(l.length, s.id).toBeLessThanOrEqual(40);
      expect([null, 'hole', 'board', 'pot', 'actions']).toContain(s.target);
    }
    expect(stepsFor(true).find((s) => s.id === 'rank')!.items).toHaveLength(9);
    expect(stepsFor(true).find((s) => s.id === 'buttons')!.items!.map((i) => i[0])).toEqual(['弃牌', '过牌', '跟注', '加注']);
  });

  it('触屏不出快捷键页；快捷键一页：牌桌、快速局、谜题、选桌四处的键都在', () => {
    const keys = stepsFor(false).find((s) => s.id === 'keys')!.items!.map((i) => `${i[0]} ${i[1]}`).join('\n');
    for (const want of ['F 牌桌：弃牌', 'C 牌桌', 'R 牌桌', '回车 牌桌', 'Esc 牌桌', '1–5', 'Shift', '滚轮', 'A 快速局', 'F 快速局', '1 2 3 今日谜题', '← → 选桌：换档位', '回车 选桌：坐下开打']) expect(keys, want).toContain(want);
  });

  it('src/guide.ts 不碰页面和存储（读写在 store.ts，画面在 view/coach.ts）', () => {
    const src = readFileSync(new URL('../../src/guide.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    expect(src).not.toMatch(/\b(window|document|localStorage|sessionStorage)\b|Math\.random|Date\./);
  });
});

describe('说明框的摆放', () => {
  const sizes: [string, number, number][] = [['手机竖屏', 390, 844], ['手机横屏', 667, 375], ['横屏大', 844, 390], ['电脑', 1280, 720], ['大屏', 1920, 1080]];
  // 目标：四个角和中间附近的常见大小（底牌、整排公共牌、操作区）
  const targets = (w: number, h: number): Box[] => [
    { x: w * 0.35, y: h * 0.7, w: 120, h: 70 },
    { x: w * 0.2, y: h * 0.4, w: Math.min(w * 0.6, 300), h: 70 },
    { x: w - 230, y: h - 150, w: 220, h: 140 },
    { x: 10, y: 60, w: 100, h: 60 },
    { x: w / 2 - 60, y: h / 2 - 30, w: 120, h: 60 },
  ];

  for (const [name, w, h] of sizes) {
    it(`${name} ${w}×${h}：框在可用区里，不压目标`, () => {
      const area: Box = { x: 8, y: 8, w: w - 16, h: h - 16 };
      // 内容大致一定的面积：窄了就变高
      const sizeAt = (mw: number): { w: number; h: number } => ({ w: mw, h: Math.round(30_000 / mw) + 50 });
      for (const t of targets(w, h)) {
        const b = placeBest(t, sizeAt, area);
        expect(b.x, JSON.stringify(t)).toBeGreaterThanOrEqual(area.x);
        expect(b.y).toBeGreaterThanOrEqual(area.y);
        expect(b.x + b.w).toBeLessThanOrEqual(area.x + area.w + 0.001);
        expect(b.y + b.h).toBeLessThanOrEqual(area.y + area.h + 0.001);
        expect(overlaps(b, t), JSON.stringify([t, b])).toBe(false);
      }
    });
  }

  it('没有目标就居中', () => {
    const b = placeCoach(null, { w: 200, h: 100 }, { x: 0, y: 0, w: 400, h: 300 });
    expect(b).toEqual({ x: 100, y: 100, w: 200, h: 100 });
  });

  it('要避开的块（"下一手"按钮）也不压', () => {
    const area: Box = { x: 8, y: 8, w: 374, h: 828 };
    const t: Box = { x: 100, y: 300, w: 190, h: 60 };
    const next: Box = { x: 120, y: 380, w: 150, h: 50 };
    const b = placeCoach(t, { w: 300, h: 100 }, area, [next]);
    expect(overlaps(b, t)).toBe(false);
    expect(overlaps(b, next)).toBe(false);
  });

  it('四边都放不下时，扫全区挑压得最少的位置，不压目标', () => {
    const area: Box = { x: 8, y: 8, w: 374, h: 828 };
    const t: Box = { x: 100, y: 400, w: 190, h: 60 };
    // 目标上下各一大块不许压的东西，只剩中间一条空地以外的缝
    const avoid: Box[] = [{ x: 8, y: 8, w: 374, h: 380 }, { x: 8, y: 470, w: 374, h: 366 }];
    const b = placeCoach(t, { w: 200, h: 100 }, area, avoid);
    expect(overlaps(b, t)).toBe(false);
    expect(b.y).toBeGreaterThanOrEqual(8);
    expect(b.y + b.h).toBeLessThanOrEqual(836.001);
  });

  it('目标靠近边时挪进可用区，不出屏', () => {
    const area: Box = { x: 8, y: 8, w: 374, h: 828 };
    const b = placeCoach({ x: 0, y: 0, w: 60, h: 40 }, { w: 300, h: 120 }, area);
    expect(b.x).toBeGreaterThanOrEqual(8);
    expect(b.y).toBeGreaterThanOrEqual(8);
  });
});
