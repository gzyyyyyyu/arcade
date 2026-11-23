import Phaser from 'phaser';
import { sound } from '../sound.ts';
import { formatPoints, themeById, type BoardEntry, type DragonBoard, type NewsItem } from '../../core/index.ts';
import { NEWS_KEY, hasArt } from '../assets.ts';
import { COLOR, FS, signColor } from '../theme.ts';
import { addImage, addSlice } from '../ui/art.ts';
import { touchHit } from '../ui/button.ts';
import { addText, fitKeepTail, fitWidth } from '../ui/text.ts';
import { BODY_Y, BODY_H, CX, CW } from './chatConsts.ts';
import type { ChatView3 } from './chat.ts';

/**
 * 折叠的新闻条（画面重点：新闻收进群聊里，不跟小结卡、猫抢眼）：一行「今日新闻（3 条）· 点开看」，
 * 点一下在群聊里展开完整新闻卡（盖在消息上面），再点一下或点卡片收起。
 */
/** 头名一行：放不下时先去掉「领涨 / 领跌」（颜色和正负号已经说了涨跌），还放不下再缩名字，数字不缩 */
function leadText(t: Phaser.GameObjects.Text, top: { name: string; move: number }, room: number): Phaser.GameObjects.Text {
  const tail = ` ${formatPoints(top.move)}`;
  t.setText(`${top.move > 0 ? '领涨' : '领跌'} ${top.name}${tail}`);
  return t.width > room ? fitKeepTail(t, top.name, tail, room) : t;
}

export function newsFold(v: ChatView3, list: NewsItem[], heading: string, board: DragonBoard | null = null): { node: Phaser.GameObjects.Container; h: number } {
  const s = v.scene;
  const node = s.add.container(0, 0).setVisible(false);
  const h = 30;
  const card = addSlice(s, CX, 0, CW, h, 'bubble_card');
  const icon = hasArt(s.textures, NEWS_KEY) ? [addImage(s, CX + 20, h / 2, NEWS_KEY, 20)] : [];
  const title = addText(s, CX + (icon.length > 0 ? 36 : 12), h / 2, list.length > 0 ? `${heading} ${Math.min(3, list.length)}` : '龙虎榜', { size: 12, bold: true, color: COLOR.white, originY: 0.5, stroke: COLOR.ink, strokeWidth: 3 });
  const more = addText(s, CX + CW - 12, h / 2, '展开 ▾', { size: FS.xs, bold: true, color: COLOR.info, originX: 1, originY: 0.5 });
  // 0.36 折着也露出龙虎榜的头名：涨得最多的一只（没有就跌得最多的）
  const top = board?.up[0] ?? board?.down[0];
  const lead = top ? [leadText(addText(s, title.x + title.width + 10, h / 2, '', { size: FS.xs, bold: true, color: signColor(top.move), originY: 0.5 }), top, more.x - more.width - title.x - title.width - 20)] : [];
  // 条只有 30 高：触屏上点击区上下撑到 HIT_MIN（docs/ui.md：触屏可点区域 ≥ 44 像素）
  const hit = touchHit(s, CX + CW / 2, h / 2, CW, h);
  hit.on(Phaser.Input.Events.POINTER_UP, (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
    ev.stopPropagation();
    sound.ui('toggle');
    toggleNews(v);
  });
  node.add([card, ...icon, title, ...lead, more, hit]);
  v.newsList = list;
  v.newsBoard = board;
  v.newsHeading = heading;
  v.newsMore = more;
  v.newsOpen?.destroy();
  v.newsOpen = null;
  v.newsShown = Math.min(3, list.length);
  return { node, h };
}

/** 展开 / 收起新闻（自动化也用）；没有新闻时什么都不做。 */
export function toggleNews(v: ChatView3): void {
  if (v.newsOpen) {
    v.newsOpen.destroy();
    v.newsOpen = null;
    v.newsMore?.setText('展开 ▾');
    return;
  }
  const at = v.newsRect;
  if (!at || (v.newsList.length === 0 && !v.newsBoard)) return;
  const full = newsNode(v, v.newsList, v.newsHeading, v.newsBoard);
  // 优先在折叠条下面展开，放不下就往上
  const bottom = BODY_Y + BODY_H - 4;
  const y = at.y + full.h <= bottom ? at.y : Math.max(BODY_Y, bottom - full.h);
  full.node.setY(y).setVisible(true).setDepth(5);
  const hit = v.scene.add.rectangle(CX, 0, CW, full.h, 0xffffff, 0.001).setOrigin(0, 0).setInteractive({ useHandCursor: true });
  hit.on(Phaser.Input.Events.POINTER_UP, (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
    ev.stopPropagation();
    sound.ui('toggle');
    toggleNews(v);
  });
  full.node.add(addText(v.scene, CX + CW - 12, 13, '收起 ▴', { size: FS.xs, bold: true, color: COLOR.white, originX: 1, originY: 0.5, stroke: COLOR.ink, strokeWidth: 3 }));
  full.node.add(hit);
  v.content.add(full.node);
  v.content.bringToTop(full.node);
  v.newsOpen = full.node;
  v.newsMore?.setText('收起 ▴');
  v.newsOpenRect = { x: CX, y, w: CW, h: full.h };
}

/** 「今日新闻」卡：报纸图标 + 每条一行标题，右边写这条对应的热度变化。 */
export function newsNode(v: ChatView3, list: NewsItem[], heading = '今日新闻', board: DragonBoard | null = null): { node: Phaser.GameObjects.Container; h: number } {
  const s = v.scene;
  const node = s.add.container(0, 0).setVisible(false);
  const parts: Phaser.GameObjects.GameObject[] = [];
  let y = 30;
  for (const n of list.slice(0, 3)) {
    const tag = n.theme ? `${themeById(n.theme).name}热度 ${n.value > 0 ? '+' : ''}${Math.round(n.value)}` : `大环境 ${formatPoints(n.value)}`;
    const tt = addText(s, CX + CW - 10, y, tag, { size: FS.xs, bold: true, color: signColor(n.dir === 'up' ? 1 : -1), originX: 1 });
    const t = addText(s, CX + 12, y, n.text, { size: 12, color: COLOR.ink, wrap: CW - 24 - tt.width - 8, lineSpacing: 2 });
    parts.push(t, tt);
    y += t.height + 8;
  }
  if (board) y = boardRows(v, board, parts, list.length > 0 ? y + 2 : y);
  const h = y + 2;
  const card = addSlice(s, CX, 0, CW, h, 'bubble_card');
  const icon = hasArt(s.textures, NEWS_KEY) ? [addImage(s, CX + 22, 15, NEWS_KEY, 22)] : [];
  const title = addText(s, CX + (icon.length > 0 ? 38 : 12), 13, list.length > 0 ? heading : '龙虎榜', { size: 12, bold: true, color: COLOR.white, originY: 0.5, stroke: COLOR.ink, strokeWidth: 3 });
  node.add([card, ...icon, title, ...parts]);
  v.newsShown = list.length;
  return { node, h };
}

/** 龙虎榜两栏：左涨右跌各 3 行「名字 涨跌」，名字后面灰字写当天喊对它的群友；最后一行上榜群友的得意话。 */
function boardRows(v: ChatView3, board: DragonBoard, parts: Phaser.GameObjects.GameObject[], y0: number): number {
  const s = v.scene;
  let y = y0;
  if (y0 > 30) {
    parts.push(s.add.rectangle(CX + 12, y, CW - 24, 1.5, COLOR.edge, 0.35).setOrigin(0, 0));
    y += 6;
    parts.push(addText(s, CX + 12, y, '龙虎榜', { size: 12, bold: true, color: COLOR.ink }));
    y += 20;
  }
  const colW = (CW - 24 - 10) / 2;
  const cell = (e: BoardEntry | undefined, x: number, ry: number): void => {
    if (!e) return;
    const pct = addText(s, x + colW, ry, formatPoints(e.move), { size: 12, bold: true, num: true, color: signColor(e.move), originX: 1 });
    const name = fitWidth(addText(s, x, ry, e.name, { size: 12, bold: e.limit, color: COLOR.ink }), colW - pct.width - 6);
    parts.push(name, pct);
    if (e.callers.length > 0) parts.push(fitWidth(addText(s, x, ry + 16, `${e.callers.join('、')}喊对`, { size: FS.xs, color: COLOR.muted }), colW));
  };
  const rows = Math.max(board.up.length, board.down.length);
  for (let i = 0; i < rows; i++) {
    const up = board.up[i];
    const down = board.down[i];
    cell(up, CX + 12, y);
    cell(down, CX + 12 + colW + 10, y);
    y += (up?.callers.length || down?.callers.length ? 34 : 20);
  }
  if (board.brag) {
    const t = addText(s, CX + 12, y, `${board.brag.name}：${board.brag.text}`, { size: FS.xs, color: COLOR.accentDark, wrap: CW - 24 });
    parts.push(t);
    y += t.height + 6;
  }
  return y + 4;
}
