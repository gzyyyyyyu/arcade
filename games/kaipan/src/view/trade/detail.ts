import Phaser from 'phaser';
import { chatView, friendView, holdingCards, stockCard, themeBoard, type GameState, type ThemeId } from '../../core/index.ts';
import { avatarKey, roleKey } from '../assets.ts';
import { FEEL_WORD, ROLE_TERM, ROLE_WORD, term } from '../glossary.ts';
import { pctArrow, recordText } from '../labels.ts';
import { COLOR, FEEL_COLOR, FS, THEME_COLOR, TYPE, signColor, textOn } from '../theme.ts';
import { addGlyph, addImage, addPill } from '../ui/art.ts';
import { Dialog, dialogW, phonePanel } from '../ui/dialog.ts';
import { addSpark } from '../ui/spark.ts';
import { StockGuy } from '../ui/stockGuy.ts';
import { MIN_NUM_SIZE_PHONE, MIN_TEXT_SIZE, addText, fitWidth } from '../ui/text.ts';
import { hideTooltip } from '../ui/tooltip.ts';
import { friendCalls, preCount, stockMoves, streakOf, sumMoves, themeHeat, toLevels, vsMarket, vsWord } from './tape.ts';
import { phoneLayout, viewOf } from '../viewport.ts';

/**
 * 0.5.1 详情卡：点股票小人 / 推荐卡 / 风口行 / 群友头像打开，让玩家自己研究。
 * 打开时向场景发 DETAIL_EVENT（交易场景登记成当前对话框，自动化和快捷键都认它）。
 */
export const DETAIL_EVENT = 'detail:open';

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

/** 股票详情：大走势图、近几天涨跌、连涨连跌、风口热度、角色、推荐人、比大环境。 */
export function openStockDetail(scene: Phaser.Scene, s: Readonly<GameState>, id: string): Dialog {
  const c = stockCard(s, id);
  const d = new DetailDialog(scene, c.name, 566);
  const r = d.inner;
  const calm = false;
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
  const roleT = addText(scene, G.roleX, G.roleY, `${ROLE_WORD[c.role]}`, { size: 15, bold: true, color: c.role === 'st' ? COLOR.danger : COLOR.ink });
  const roleD = addText(scene, G.roleX, G.roleY + 22, term(ROLE_TERM[c.role]).explain, { size: 12, color: COLOR.muted, wrap: G.roleW, lineSpacing: 2 });
  r.add([roleT, roleD]);
  // 走势图（最近 10 天涨跌柱 + 累计折线）：电脑和横屏在右上，竖屏在小人下面
  const moves = stockMoves(s, id, 10);
  const pre = preCount(s, moves.length);
  const ch = G.chart;
  const k = ch.h < 150;
  chartBox(scene, r, ch.x, ch.y, ch.w, ch.h, moves.length ? `最近 ${moves.length} 天${pre > 0 ? `（开局前 ${pre} 天虚线）` : ''}` : '最近走势');
  const levels = toLevels(moves);
  const line = addSpark(scene, ch.x + 18, ch.y + (k ? 28 : 30), ch.w - 36, k ? 56 : 60, levels, { kind: 'line', area: true, dot: true, width: 2.5, pre: pre > 0 ? pre + 1 : 0, preLabel: true });
  const bars = addSpark(scene, ch.x + 18, ch.y + (k ? 92 : 98), ch.w - 36, k ? 42 : 44, moves, { kind: 'bars', cap: 10, pre });
  r.add([...line.nodes(), ...bars.nodes()]);
  line.play(600, calm);
  bars.play(600, calm);
  if (moves.length === 0) r.add(addText(scene, ch.x + ch.w / 2, ch.y + (k ? 72 : 76), '还没开过盘', { size: 14, color: 0xb8cde0, originX: 0.5, originY: 0.5 }));
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
