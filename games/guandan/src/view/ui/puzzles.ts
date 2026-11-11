/**
 * 斗地主"残局"的选关弹窗：顶上一张"今日残局"大卡（每日一题，控件 `puzzle:daily`），下面 20 个格子七列三行。过了的打勾（绿）、下一关高亮（金）、锁着的灰（画一把锁，点不了）。
 * 标题页和牌桌（过关后的"选关"）共用。格子是 Button，控件名 `puzzle:<关卡 id>`：弹窗 body 的 data 里是 `btn:puzzle:p01` 这样，
 * 标题页的 controls() 和牌桌的 reg 都从这里取。
 */
import type Phaser from 'phaser';
import { DDZ_PUZZLES, type DdzPuzzle } from '../../variants/doudizhu/puzzles/puzzles.ts';
import { beijingDate } from '../common/daily.ts';
import { dailyPuzzleOf, puzzleStatuses, puzzlesDone, type PuzzleStatus } from '../doudizhu/puzzle.ts';
import { getDdzDailyPuzzle } from '../store.ts';
import { COLOR, TYPE, minHit, phoneType } from '../common/theme.ts';
import { Button, fitWidth, modal, text, type ButtonStyle, type Modal } from './kit.ts';

// 七列三行：顶上加了今日大卡，五列四行的弹窗会超出 720 高的世界
const COLS = 7;
/** 今日大卡占的高度（卡 + 下面一行小字） */
const DAILY_H = 92;
const STYLE: Record<PuzzleStatus, ButtonStyle> = { done: 'green', next: 'gold', open: 'wood', locked: 'wood' };

export function openPuzzlePicker(scene: Phaser.Scene, opts: { onPick: (p: DdzPuzzle) => void; onDaily: () => void; onClose?: () => void }): Modal {
  const done = puzzlesDone();
  const status = puzzleStatuses(done);
  const rows = Math.ceil(DDZ_PUZZLES.length / COLS);
  // 格距至少 minHit()：手机横屏上每格的点按区要 44 CSS 像素
  const pitch = Math.max(104, minHit() + 6);
  const w = COLS * pitch + 72;
  const h = rows * pitch + 210 + DAILY_H;
  // 选了一关就直接开，不再走关闭弹窗的回调（牌桌的 onClose 会回到结果页）
  let picked = false;
  const m = modal(scene, w, h, undefined, { onClose: () => !picked && opts.onClose?.() });
  const b = m.body;
  b.add(text(scene, 0, -h / 2 + 46, '残局闯关', { size: TYPE.title, bold: true, color: COLOR.ink }));
  const sub = `已过 ${done.size}/${DDZ_PUZZLES.length} 关${phoneType() ? '' : ' · 三家的牌都摊开，你当地主先出'}`;
  b.add(fitWidth(text(scene, 0, -h / 2 + 86, sub, { size: TYPE.small, color: COLOR.muted }), w - 72));
  // 今日残局：题名 + 我今天最好的分；点了进今天这一题（第一次打开这一天会现算，约零点几秒）
  const today = dailyPuzzleOf(beijingDate(Date.now()));
  const mine = getDdzDailyPuzzle(today.date);
  const cardW = w - 72;
  const daily = new Button(scene, 0, -h / 2 + 142, cardW, 64, `今日残局 · ${today.name}`, 'gold', () => {
    picked = true;
    m.close();
    opts.onDaily();
  }, 'crown');
  b.add(daily);
  b.setData('btn:puzzle:daily', daily);
  const best = mine.best > 0 ? `今天最好 ${mine.best} 分 · 打过 ${mine.tries} 次` : '今天还没打 · 越快分越高，上每日榜';
  b.add(fitWidth(text(scene, 0, -h / 2 + 142 + 50, best, { size: TYPE.small, bold: mine.best > 0, color: mine.best > 0 ? COLOR.redDark : COLOR.muted }), cardW));
  const x0 = -((COLS - 1) * pitch) / 2;
  const y0 = -h / 2 + 128 + DAILY_H + pitch / 2;
  DDZ_PUZZLES.forEach((p, i) => {
    const x = x0 + (i % COLS) * pitch;
    const y = y0 + Math.floor(i / COLS) * pitch;
    const st = status[i]!;
    const cell = pitch - 12;
    const btn = new Button(scene, x, y, cell, cell, st === 'locked' ? '' : String(i + 1), STYLE[st], () => {
      picked = true;
      m.close();
      opts.onPick(p);
    }, st === 'done' ? 'check' : undefined);
    btn.setEnabled(st !== 'locked');
    b.add(btn);
    b.setData(`btn:puzzle:${p.id}`, btn);
    if (st === 'locked') b.add(lock(scene, x, y - 2));
  });
  const next = status.indexOf('next');
  const foot = next >= 0 ? `下一关：第 ${next + 1} 关 · ${DDZ_PUZZLES[next]!.name}` : '全部过关了，挑一关再玩';
  b.add(fitWidth(text(scene, 0, h / 2 - 34, foot, { size: TYPE.label, bold: true, color: COLOR.ink }), w - 72));
  return m;
}

/** 一把小锁（锁着的格子里；不用图标文件，免得多一张纹理） */
function lock(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics({ x, y });
  g.lineStyle(5, 0xf2ece4, 1).beginPath().arc(0, -6, 10, Math.PI, 0, false).strokePath();
  g.fillStyle(0xf2ece4, 1).fillRoundedRect(-15, -6, 30, 24, 5);
  g.fillStyle(0x8a8079, 1).fillCircle(0, 5, 3.5);
  return g;
}
