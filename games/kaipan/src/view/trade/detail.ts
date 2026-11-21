import Phaser from 'phaser';
import { chatView, friendView, holdingCards, stockCard, themeBoard, type GameState, type ThemeId } from '../../core/index.ts';
import { avatarKey, roleKey } from '../assets.ts';
import { FEEL_WORD, ROLE_TERM, ROLE_WORD, term } from '../glossary.ts';
import { pctArrow, recordText } from '../labels.ts';
import { COLOR, FEEL_COLOR, FS, THEME_COLOR, TYPE, signColor, textOn } from '../theme.ts';
import { addGlyph, addImage, addPill } from '../ui/art.ts';
import { Button } from '../ui/button.ts';
import { Dialog, dialogW, phonePanel } from '../ui/dialog.ts';
import { addSpark } from '../ui/spark.ts';
import { buyPower, candles, intraday, volumes } from './kline.ts';
import { StockGuy } from '../ui/stockGuy.ts';
import { MIN_NUM_SIZE_PHONE, MIN_TEXT_SIZE, addText, fitWidth } from '../ui/text.ts';
import { hideTooltip } from '../ui/tooltip.ts';
import { friendCalls, preCount, stockMoves, streakOf, sumMoves, themeHeat, vsMarket, vsWord } from './tape.ts';
import { phoneLayout, viewOf } from '../viewport.ts';

/**
 * 0.5.1 详情卡：点股票小人 / 推荐卡 / 风口行 / 群友头像打开，让玩家自己研究。
 * 打开时向场景发 DETAIL_EVENT（交易场景登记成当前对话框，自动化和快捷键都认它）。
 */
export const DETAIL_EVENT = 'detail:open';
/** 0.35.0 详情卡上点了「自选」：向场景发这个事件（参数是股票 id），交易场景执行加星 / 取消 */
export const STAR_EVENT = 'detail:star';

const W = 640;
const H = 420;

/** 小数据格：标签在上、大数字在下。 */
function stat(scene: Phaser.Scene, root: Phaser.GameObjects.Container, x: number, y: number, w: number, label: string, value: string, color: number = COLOR.ink): void {
  const bg = scene.add.rectangle(x, y, w, 54, COLOR.paperHi, 1).setOrigin(0, 0).setRounded(10).setStrokeStyle(2, COLOR.edge, 1);
  const l = addText(scene, x + 10, y + 7, label, { size: 12, color: COLOR.muted });
  const v = addText(scene, x + 10, y + 24, value, { size: 20, bold: true, num: true, color });
  while (v.width > w - 16 && v.style.fontSize && parseInt(String(v.style.fontSize), 10) - 2 >= Math.max(12, MIN_TEXT_SIZE, phoneLayout(scene) ? MIN_NUM_SIZE_PHONE : 0)) v.setFontSize(parseInt(String(v.style.fontSize), 10) - 2);
  root.add([bg, l, v]);
}

function chartBox(scene: Phaser.Scene, root: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number, title: string): void {
  const bg = scene.add.rectangle(x, y, w, h, COLOR.screen, 0.92).setOrigin(0, 0).setRounded(12).setStrokeStyle(2, COLOR.ink, 1);
  const t = addText(scene, x + 12, y + 8, title, { size: 12, bold: true, color: COLOR.screenText });
  root.add([bg, t]);
}

function streakWord(n: number): string {
  return n > 0 ? `连涨${n}天` : n < 0 ? `连跌${-n}天` : '昨天走平';
}

/** 0.19.0 手机世界高只有 404：详情框收到 392 高，里面各行往上收（cmp = compact） */
function compact(scene: Phaser.Scene): boolean {
  return phoneLayout(scene) && viewOf(scene).h < H + 12;
}

/** 0.33.0 竖屏版：详情框跟屏一样窄（约 388），左右两栏改成上下叠 */
function portrait(scene: Phaser.Scene): boolean {
  const V = viewOf(scene);
  return phoneLayout(scene) && V.h > V.w;
}

/** 详情框的内宽（竖屏版按屏宽，横屏和电脑是 640） */
function innerW(scene: Phaser.Scene): number {
  return portrait(scene) ? dialogW(scene, W) : W;
}

class DetailDialog extends Dialog {
  /** tall：竖屏版这张详情要多高（内容往下叠，各张不一样；屏矮时封顶到屏高） */
  constructor(scene: Phaser.Scene, title: string, tall: number) {
    super(scene, innerW(scene), portrait(scene) ? Math.min(phonePanel(scene)!.h, tall) : compact(scene) ? viewOf(scene).h - 12 : H, title);
    hideTooltip(scene);
    scene.events.emit(DETAIL_EVENT, this);
  }

  /** 详情卡里的按钮登记给自动化（controls() 认它） */
  nameControl(key: string, b: Button): void {
    this.named[key] = b;
  }
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 股票详情的排布：电脑和横屏左边小人、右边走势和数据格；竖屏版小人和角色说明一排，走势、数据格、推荐人往下叠 */
function stockGeo(scene: Phaser.Scene): { pad: number; full: number; stage: Box; guyY: number; guyS: number; roleX: number; roleY: number; roleW: number; chart: Box; cellX: number; cellY: number; cellW: number; cellGap: number; cellRow: number; recY: number } {
  if (portrait(scene)) {
    const w = innerW(scene);
    const full = w - 32;
    const cellW = Math.floor((full - 18) / 4);
    return { pad: 16, full, stage: { x: 16, y: 62, w: 150, h: 150 }, guyY: 190, guyS: 104, roleX: 180, roleY: 70, roleW: w - 196, chart: { x: 16, y: 224, w: full, h: 140 }, cellX: 16, cellY: 376, cellW, cellGap: 6, cellRow: 62, recY: 502 };
  }
  const k = compact(scene);
  return { pad: 24, full: 592, stage: { x: 24, y: k ? 66 : 74, w: 168, h: k ? 160 : 170 }, guyY: k ? 202 : 214, guyS: k ? 112 : 120, roleX: 24, roleY: k ? 234 : 252, roleW: 168, chart: { x: 208, y: k ? 66 : 74, w: 408, h: k ? 140 : 150 }, cellX: 208, cellY: k ? 214 : 234, cellW: 96, cellGap: 7, cellRow: k ? 60 : 62, recY: k ? 336 : 360 };
}

/** K 线页：左 62% 日 K（开局前的日子淡色）+ 量柱，右边昨天的分时 + 买卖力量条。只画已经收盘的日子。 */
function drawKline(scene: Phaser.Scene, r: Phaser.GameObjects.Container, ch: Box, s: Readonly<GameState>, id: string, moves: readonly number[]): void {
  const pre = preCount(s, moves.length);
  const split = Math.round(ch.w * 0.62);
  chartBox(scene, r, ch.x, ch.y, ch.w, ch.h, moves.length ? `日K · ${moves.length} 天${pre > 0 ? `（开局前 ${pre} 天淡色）` : ''}` : '日K');
  r.add(addText(scene, ch.x + split + 8, ch.y + 8, '昨天分时', { size: 12, bold: true, color: COLOR.screenText }));
  if (moves.length === 0) {
    r.add(addText(scene, ch.x + ch.w / 2, ch.y + ch.h / 2 + 8, '还没开过盘', { size: 14, color: 0xb8cde0, originX: 0.5, originY: 0.5 }));
    return;
  }
  const up = signColor(1);
  const down = signColor(-1);
  const colorOf = (m: number): number => (Math.abs(m) < 0.05 ? 0xb8cde0 : m > 0 ? up : down);
  const g = scene.add.graphics();
  r.add(g);
  // 日 K
  const kx = ch.x + 12;
  const kw = split - 20;
  const ky = ch.y + 30;
  const volH = 22;
  const kh = ch.h - 30 - volH - 12;
  const firstDay = (s.lastDay?.day ?? -1) - moves.length + 1;
  const cs = candles(moves, `${s.seed}:${id}`, firstDay);
  const hi = Math.max(...cs.map((c) => c.h));
  const lo = Math.min(...cs.map((c) => c.l));
  const span = Math.max(hi - lo, 0.5);
  const yOf = (v: number): number => ky + kh - ((v - lo) / span) * kh;
  const step = kw / Math.max(cs.length, 12);
  const body = Math.max(3, Math.min(10, step * 0.62));
  const vols = volumes(moves);
  cs.forEach((c, i) => {
    const x = kx + (i + 0.5) * step;
    const col = colorOf(c.move);
    const a = i < pre ? 0.45 : 1;
    g.lineStyle(1.5, col, a).lineBetween(x, yOf(c.h), x, yOf(c.l));
    const y1 = yOf(Math.max(c.o, c.c));
    g.fillStyle(col, a).fillRect(x - body / 2, y1, body, Math.max(1.5, yOf(Math.min(c.o, c.c)) - y1));
    const vh = Math.max(2, (vols[i] ?? 0) * volH);
    g.fillStyle(col, a * 0.7).fillRect(x - body / 2, ch.y + ch.h - 8 - vh, body, vh);
  });
  // 昨天分时：从昨收（0）走到收盘，横线是昨收
  const last = moves[moves.length - 1] ?? 0;
  const path = intraday(last, `${s.seed}:${id}:${s.lastDay?.day ?? -1}`);
  const tx = ch.x + split + 8;
  const tw = ch.w - split - 20;
  const ty = ch.y + 32;
  const th = ch.h - 32 - 34;
  const lim = Math.max(1, ...path.map((v) => Math.abs(v)));
  const pyOf = (v: number): number => ty + th / 2 - (v / lim) * (th / 2);
  g.lineStyle(1, 0x8fa6bd, 0.6).lineBetween(tx, pyOf(0), tx + tw, pyOf(0));
  g.lineStyle(2, colorOf(last), 1).beginPath();
  path.forEach((v, k) => {
    const x = tx + (k / (path.length - 1)) * tw;
    if (k === 0) g.moveTo(x, pyOf(v));
    else g.lineTo(x, pyOf(v));
  });
  g.strokePath();
  // 买卖力量
  const buy = buyPower(moves);
  const by = ch.y + ch.h - 26;
  g.fillStyle(up, 1).fillRect(tx, by, tw * buy, 8);
  g.fillStyle(down, 1).fillRect(tx + tw * buy, by, tw * (1 - buy), 8);
  r.add(addText(scene, tx, by + 10, `买 ${Math.round(buy * 100)}%`, { size: 12, bold: true, num: true, color: mixLight(up) }));
  r.add(addText(scene, tx + tw, by + 10, `卖 ${Math.round((1 - buy) * 100)}%`, { size: 12, bold: true, num: true, color: mixLight(down), originX: 1 }));
}

/** 深色底上的涨跌色提亮一点 */
function mixLight(c: number): number {
  const m = (v: number): number => Math.round(v + (255 - v) * 0.35);
  return (m((c >> 16) & 0xff) << 16) | (m((c >> 8) & 0xff) << 8) | m(c & 0xff);
}

/** 股票详情：K 线页、近几天涨跌、连涨连跌、风口热度、角色、推荐人、比大环境。 */
export function openStockDetail(scene: Phaser.Scene, s: Readonly<GameState>, id: string): Dialog {
  const c = stockCard(s, id);
  const d = new DetailDialog(scene, c.name, 566);
  const r = d.inner;
  const G = stockGeo(scene);
  // 左：小人 + 风口签 + 角色
  const tc = THEME_COLOR[c.theme];
  const { stage: st } = G;
  const stage = scene.add.rectangle(st.x, st.y, st.w, st.h, 0xfff3d6, 1).setOrigin(0, 0).setRounded(14).setStrokeStyle(2, COLOR.edge, 1);
  r.add(stage);
  const guy = new StockGuy(scene, st.x + st.w / 2, G.guyY, id, c.face, G.guyS, { idle: true });
  r.add(guy);
  const tagT = addText(scene, 0, 0, c.themeName, { size: 13, bold: true, color: textOn(tc), originX: 0.5, originY: 0.5 });
  const tag = addPill(scene, st.x + 10, st.y + 10, tagT.width + 18, 22, tc);
  tagT.setPosition(st.x + 10 + (tagT.width + 18) / 2, st.y + 21);
  r.add([tag, tagT]);
  const role = addImage(scene, st.x + st.w - 20, st.y + 22, roleKey(c.role), 26);
  r.add(role);
  // 0.35.0 自选：角色名同一行、靠右的按钮（Button 原点在左上），点了加星 / 取消（交易场景执行；按钮当场换字）
  let starred = (s.stars ?? []).includes(id);
  const starBtn: Button = new Button(scene, G.roleX + G.roleW - 88, G.roleY - 6, {
    width: 88,
    height: 28,
    fontSize: 13,
    label: starred ? '已自选' : '自选',
    icon: 'star',
    variant: starred ? 'primary' : 'default',
    onClick: () => {
      starred = !starred;
      starBtn.setLabel(starred ? '已自选' : '自选');
      scene.events.emit(STAR_EVENT, id);
    },
  });
  r.add(starBtn);
  d.nameControl('detail:star', starBtn);
  const roleT = addText(scene, G.roleX, G.roleY, `${ROLE_WORD[c.role]}`, { size: 15, bold: true, color: c.role === 'st' ? COLOR.danger : COLOR.ink });
  const roleD = addText(scene, G.roleX, G.roleY + 28, term(ROLE_TERM[c.role]).explain, { size: 12, color: COLOR.muted, wrap: G.roleW, lineSpacing: 2 });
  r.add([roleT, roleD]);
  // 0.35.0 K 线页：左边日 K + 量柱，右边昨天的分时 + 买卖力量（电脑和横屏在右上，竖屏在小人下面）
  const moves = stockMoves(s, id, 20);
  drawKline(scene, r, G.chart, s, id, moves);
  // 数据格
  const theme = themeBoard(s).find((t) => t.id === c.theme);
  const vs = vsWord(vsMarket(s, id, Math.min(5, moves.length)));
  const sum5 = sumMoves(moves.slice(-5));
  const cells: [string, string, number][] = [
    ['昨天', moves.length ? pctArrow(moves[moves.length - 1] ?? 0) : '—', signColor(moves[moves.length - 1] ?? 0)],
    [`近${Math.min(5, moves.length)}天`, moves.length ? pctArrow(sum5) : '—', signColor(sum5)],
    ['连涨连跌', moves.length ? streakWord(streakOf(moves)) : '—', signColor(streakOf(moves))],
    ['风口热度', theme ? `${Math.round(theme.heat)} ${FEEL_WORD[theme.feel]}` : '—', theme ? FEEL_COLOR[theme.feel] : COLOR.ink],
  ];
  cells.forEach(([l, v, col], i) => stat(scene, r, G.cellX + i * (G.cellW + G.cellGap), G.cellY, G.cellW, l, v, col === FEEL_COLOR.cold ? COLOR.ink : col));
  const hold = holdingCards(s).find((h) => h?.id === id);
  const rec = chatView(s).recs.find((x) => x.stock.id === id);
  const cells2: [string, string, number][] = [
    ['比大环境', vs ? vs.word : '—', vs ? signColor(vs.sign) : COLOR.ink],
    ['连续涨停', c.boards > 0 ? `涨停×${c.boards}` : '没有', c.boards > 0 ? COLOR.up : COLOR.muted],
    hold ? ['买入以来', pctArrow(hold.holdRet), signColor(hold.holdRet)] : ['股价', `¥${c.price.toFixed(2)}`, COLOR.ink],
    hold ? ['占账户', `${Math.round(hold.weight * 100)}%`, COLOR.ink] : ['今天', rec ? '有人推荐' : '没人推荐', rec ? COLOR.accentDark : COLOR.muted],
  ];
  cells2.forEach(([l, v, col], i) => stat(scene, r, G.cellX + i * (G.cellW + G.cellGap), G.cellY + G.cellRow, G.cellW, l, v, col));
  // 底：推荐人一句话
  if (rec) {
    const y = G.recY;
    const bg = scene.add.rectangle(G.pad, y, G.full, 44, 0xfff3d6, 1).setOrigin(0, 0).setRounded(10).setStrokeStyle(2, COLOR.gold, 1);
    r.add(bg);
    if (rec.friend) {
      r.add(addImage(scene, G.pad + 22, y + 22, avatarKey(rec.friend.id), 32));
      r.add(addText(scene, G.pad + 44, y + 6, `${rec.friend.name} · ${recordText(rec.friend.record)}`, { size: 12, bold: true, color: COLOR.accentDark }));
    } else r.add(addGlyph(scene, G.pad + 22, y + 22, 'horn', 28));
    const t = addText(scene, G.pad + 44, y + 24, rec.text, { size: 13, color: COLOR.ink });
    fitWidth(t, G.full - 52, 3);
    r.add(t);
  }
  return d;
}

/** 风口详情：热度曲线、状态、说明、成分股小人和昨天涨跌。 */
export function openThemeDetail(scene: Phaser.Scene, s: Readonly<GameState>, id: ThemeId): Dialog {
  const card = themeBoard(s).find((t) => t.id === id);
  const d = new DetailDialog(scene, card?.name ?? '风口', 680);
  const r = d.inner;
  if (!card) return d;
  const calm = false;
  const pt = portrait(scene);
  const iw = innerW(scene);
  r.add(addImage(scene, 64, 112, `theme:${id}`, 72));
  const fp = addPill(scene, 24, 160, 80, 24, FEEL_COLOR[card.feel]);
  const ft = addText(scene, 64, 172, FEEL_WORD[card.feel], { size: 13, bold: true, originX: 0.5, originY: 0.5 });
  const heat = addText(scene, 64, 196, `${Math.round(card.heat)}`, { size: 34, bold: true, num: true, color: THEME_COLOR[id], originX: 0.5 });
  const hl = addText(scene, 64, 236, '热度', { size: 12, color: COLOR.muted, originX: 0.5 });
  const desc = addText(scene, 120, 76, card.desc, { size: 13, color: COLOR.ink, wrap: iw - 150, lineSpacing: 3 });
  r.add([fp, ft, heat, hl, desc]);
  const curve = themeHeat(s, id, 20);
  // 竖屏版：走势图整宽，放在左边热度一栏下面
  const cx = pt ? 16 : 120;
  const cy = pt ? Math.max(256, 84 + desc.height) : Math.max(120, 84 + desc.height);
  const cw0 = pt ? iw - 32 : 496;
  const k = compact(scene);
  chartBox(scene, r, cx, cy, cw0, k ? 116 : 130, `热度 · 最近 ${curve.length} 天`);
  const line = addSpark(scene, cx + 18, cy + 32, cw0 - 36, k ? 72 : 84, curve, { kind: 'line', area: true, dot: true, width: 2.5, color: THEME_COLOR[id], pre: preCount(s, curve.length), preLabel: true });
  r.add(line.nodes());
  line.play(700, calm);
  if (card.stageLabel) r.add(addText(scene, cx + cw0 - 16, cy + 8, `实际：${card.stageLabel}`, { size: 12, bold: true, color: 0xe7c6ff, originX: 1 }));
  // 成分股：竖屏版一排 3 个、排两排
  const sy = cy + (k ? 126 : 144);
  r.add(addText(scene, 24, sy, '成分股', { size: 13, bold: true, color: COLOR.muted }));
  const stocks = card.stocks.slice(0, 6);
  const perRow = pt ? 3 : 6;
  const cw = pt ? Math.floor((iw - 32) / 3) : Math.min(100, Math.floor(580 / Math.max(1, stocks.length)));
  stocks.forEach((sid, j) => {
    const sc = stockCard(s, sid);
    const i = j % perRow;
    const ry = sy + Math.floor(j / perRow) * 104;
    const x = (pt ? 16 : 24) + i * cw + cw / 2;
    const guy = new StockGuy(scene, x, ry + 76, sid, sc.face, 54, { idle: false });
    const n = addText(scene, x, ry + 80, sc.name, { size: FS.xs, bold: true, originX: 0.5 });
    if ((s.stars ?? []).includes(sid)) r.add(addGlyph(scene, x + 22, ry + 30, 'star', 18));
    const m = addText(scene, x, ry + 96, sc.history.length ? pctArrow(sc.move) : '—', { size: 13, bold: true, num: true, color: signColor(sc.move), originX: 0.5 });
    const hit = scene.add.rectangle(x - cw / 2 + 4, ry + 18, cw - 8, 96, 0xffffff, 0.001).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    hit.on(Phaser.Input.Events.POINTER_UP, () => {
      d.close();
      openStockDetail(scene, s, sid);
    });
    r.add([guy, n, m, hit]);
  });
  return d;
}

/** 群友详情：头像、简介、战绩环、擅长、最近说对说错。 */
export function openFriendDetail(scene: Phaser.Scene, s: Readonly<GameState>, friendId: string): Dialog {
  const f = friendView(s, friendId);
  const d = new DetailDialog(scene, `${f.name} · ${f.title}`, 540);
  const r = d.inner;
  const k = compact(scene);
  // 竖屏版：头像框小一号，简介在右边；战绩条、擅长、最近揭晓往下叠（揭晓格一排 7 个、排两排）
  const pt = portrait(scene);
  const iw = innerW(scene);
  const pad = pt ? 16 : 24;
  const box = pt ? 120 : 150;
  const boxY = pt ? 62 : 74;
  r.add(scene.add.rectangle(pad, boxY, box, box, 0xfff3d6, 1).setOrigin(0, 0).setRounded(14).setStrokeStyle(2, COLOR.edge, 1));
  r.add(addImage(scene, pad + box / 2, boxY + box / 2, avatarKey(friendId, f.total > 0 && f.hits / f.total >= 0.6 ? 'smug' : 'normal'), box - 30));
  const dx = pad + box + 22;
  const desc = addText(scene, dx, boxY + 2, f.desc, { size: 13, color: COLOR.ink, wrap: iw - dx - pad, lineSpacing: 3 });
  r.add(desc);
  // 战绩：大字 + 进度条
  const rate = f.total > 0 ? f.hits / f.total : 0;
  const ry = pt ? Math.max(boxY + box + 14, desc.y + desc.height + 12) : 150;
  const rx = pt ? pad + 6 : 210;
  const barW = pt ? iw - 2 * pad - 12 : 400;
  r.add(addGlyph(scene, rx, ry + 14, 'trophy', 30));
  r.add(addText(scene, rx + 22, ry, f.total > 0 ? `${f.hits}/${f.total}` : '新来的', { size: TYPE.big, bold: true, num: true, color: COLOR.accentDark }));
  r.add(addText(scene, rx + 142, ry + 8, f.total > 0 ? `说对 ${Math.round(rate * 100)}%` : '还没揭晓过', { size: 14, bold: true, color: COLOR.muted }));
  r.add(scene.add.rectangle(rx, ry + 42, barW, 12, 0xeadcc8).setOrigin(0, 0).setRounded(6).setStrokeStyle(2, COLOR.ink, 1));
  if (rate > 0) r.add(scene.add.rectangle(rx + 2, ry + 44, Math.max(8, (barW - 4) * rate), 8, rate >= 0.6 ? COLOR.accent : rate >= 0.4 ? COLOR.gold : 0x8d7b84).setOrigin(0, 0).setRounded(4));
  const topicY = pt ? ry + 70 : k ? 232 : 240;
  r.add(addText(scene, pad, topicY, `最懂：${f.topics}`, { size: 14, bold: true, color: COLOR.ink, wrap: iw - 2 * pad }));
  // 最近说对说错（记录仪里有的）
  const calls = friendCalls(s, friendId, 12);
  const callY = pt ? topicY + 28 : k ? 258 : 272;
  r.add(addText(scene, pad, callY, calls.length ? '最近揭晓' : '最近揭晓：还没有', { size: 13, bold: true, color: COLOR.muted }));
  const perRow = pt ? Math.floor((iw - 2 * pad + 5) / 49) : 12;
  calls.forEach((c, j) => {
    const i = j % perRow;
    const x = pad + i * 49;
    const cy0 = pt ? callY + 22 + Math.floor(j / perRow) * 62 : k ? 280 : 294;
    const bg = scene.add.rectangle(x, cy0, 44, 56, c.hit ? 0xffe2cc : 0xe6e0e8, 1).setOrigin(0, 0).setRounded(10).setStrokeStyle(2, c.hit ? COLOR.accent : 0x8d7b84, 1);
    const ic = addImage(scene, x + 22, cy0 + 18, `theme:${c.theme}`, 24);
    const mk = addText(scene, x + 22, cy0 + 46, c.hit ? '对' : '错', { size: 13, bold: true, color: c.hit ? COLOR.accentDark : 0x8d7b84, originX: 0.5, originY: 0.5 });
    r.add([bg, ic, mk]);
  });
  // 今天说了什么
  const msgs = chatView(s).messages.filter((m) => m.friend.id === friendId);
  if (msgs.length) {
    const m = msgs[0]!;
    const y = pt ? callY + 22 + Math.ceil(Math.max(1, calls.length) / perRow) * 62 + 6 : k ? 342 : 362;
    r.add(scene.add.rectangle(pad, y, iw - 2 * pad, 40, 0xfff3d6, 1).setOrigin(0, 0).setRounded(10).setStrokeStyle(2, COLOR.gold, 1));
    r.add(addImage(scene, pad + 20, y + 20, `theme:${m.theme}`, 24));
    const t = addText(scene, pad + 40, y + 20, `今天：${m.text}`, { size: 13, color: COLOR.ink, originY: 0.5 });
    fitWidth(t, iw - 2 * pad - 52, 3);
    r.add(t);
  }
  return d;
}
