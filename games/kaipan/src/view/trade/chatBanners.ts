import Phaser from 'phaser';
import { friendView, themeById, type IpoOffer, type GameState, type topBar } from '../../core/index.ts';
import { claimSign } from '../labels.ts';
import { DIR_WORD, termTip } from '../glossary.ts';
import type { Rect } from '../rect.ts';
import { COLOR, FS } from '../theme.ts';
import { addGlyph, addPill, addSlice } from '../ui/art.ts';
import { addText, fitWidth } from '../ui/text.ts';
import { bindTooltip } from '../ui/tooltip.ts';
import { clickSuppressed } from './dragGeo.ts';
import { drawWord } from './ipo.ts';
import { SX, SW, CX, CW } from './chatConsts.ts';
import type { ChatView3 } from './chat.ts';

/** 本周规则的横条：反向群聊用红底，别的周用主色；悬停看这一周规则的说明。 */
export function addWeeklyBanner(v: ChatView3, w: NonNullable<ReturnType<typeof topBar>['weekly']>, y: number): number {
  const text = w.rule === 'reverse' ? '本周群友说的全是反话' : `本周 · ${w.name}`;
  const t = addText(v.scene, SX + SW / 2, y + 11, text, { size: 12, bold: true, color: COLOR.white, originX: 0.5, originY: 0.5 });
  fitWidth(t, CW - 24);
  const bw = Math.min(CW, t.width + 28);
  const bg = addPill(v.scene, SX + SW / 2 - bw / 2, y, bw, 22, w.rule === 'reverse' ? COLOR.danger : COLOR.accent, false);
  bg.setInteractive();
  bindTooltip(bg, () => ({ x: SX + SW / 2 - bw / 2, y, w: bw, h: 22 }), () => ({ title: `本周市场 · ${w.name}`, body: w.tip }));
  v.content.add([bg, t]);
  return y + 22;
}

/** 「打新」横条：金色底，第一行新股名，第二行题材和几天出签；整条能点（高 44，触屏够大）。 */
export function addIpoBanner(v: ChatView3, s: GameState, offer: IpoOffer, y: number): number {
  const h = 44;
  const r: Rect = { x: CX, y, w: CW, h };
  v.ipoRect = r;
  const bg = v.scene.add.rectangle(r.x, r.y, r.w, r.h, 0xfff1c4).setOrigin(0, 0).setRounded(12).setStrokeStyle(3, COLOR.gold, 1);
  const star = addGlyph(v.scene, CX + 22, y + h / 2, 'star', 26);
  const t1 = fitWidth(addText(v.scene, CX + 42, y + 14, `抽新股 · ${offer.name}`, { size: 14, bold: true, color: COLOR.ink, originY: 0.5 }), CW - 100);
  const t2 = fitWidth(addText(v.scene, CX + 42, y + 31, `${themeById(offer.theme).name} · ${drawWord(s, offer)}`, { size: FS.xs, color: COLOR.muted, originY: 0.5 }), CW - 100);
  const goW = 46;
  const go = addPill(v.scene, CX + CW - goW - 8, y + 9, goW, 26, COLOR.accent, false);
  const goT = addText(v.scene, CX + CW - goW / 2 - 8, y + 22, '申购', { size: 14, bold: true, color: COLOR.white, originX: 0.5, originY: 0.5 });
  bg.setInteractive({ useHandCursor: true });
  bg.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
    if (p.button !== 0 || clickSuppressed(performance.now())) return;
    if (!v.locked) v.onIpo?.();
  });
  bindTooltip(bg, () => r, () => termTip('newstock', `${offer.name}：点开选试一口、半仓或重仓。`));
  v.content.add([bg, star, t1, t2, go, goT]);
  return y + h;
}

export function addSysPill(v: ChatView3, text: string, y: number): number {
  const t = addText(v.scene, SX + SW / 2, y + 11, text, { size: FS.xs, color: COLOR.muted, originX: 0.5, originY: 0.5 });
  const w = Math.min(CW, t.width + 24);
  const bg = addSlice(v.scene, SX + SW / 2 - w / 2, y, w, 22, 'system_pill');
  v.content.add([bg, t]);
  return y + 22;
}

/** 前几天发的多日消息：一行一条「老王 2 天前说：AI 3天内涨 · 还剩 1 天」，最多 3 条。 */
export function addWatch(v: ChatView3, s: GameState, y: number): number {
  const list = (s.watch ?? []).filter((w) => w.day < s.today.day).sort((a, b) => a.day + a.days - (b.day + b.days));
  const shown = list.slice(0, 3);
  for (const w of shown) {
    const ago = s.today.day - w.day;
    const left = w.day + w.days - s.today.day;
    const name = s.friends.some((f) => f.id === w.friendId) ? friendView(s, w.friendId).name : '群友';
    const sign = claimSign(w.claim);
    const ink = sign > 0 ? COLOR.up : sign < 0 ? COLOR.down : COLOR.muted;
    const r = addText(v.scene, CW - 8, 11, left <= 1 ? '今天揭晓' : `剩${left}天`, { size: FS.xs, bold: left <= 1, color: left <= 1 ? COLOR.accentDark : COLOR.muted, originX: 1, originY: 0.5 });
    const room = CW - 8 - r.width - 16;
    // 0.5.1：找回「N天前」——左边灰字写哪天说的，后面是谁说哪个风口几天内往哪走
    const when = addText(v.scene, 8, 11, `${ago}天前`, { size: FS.xs, color: COLOR.muted, originY: 0.5 });
    const t = addText(v.scene, 8 + when.width + 5, 11, `${name}：${themeById(w.theme).name} ${sign > 0 ? '↑' : sign < 0 ? '↓' : '→'}${w.days}天`, { size: FS.xs, bold: true, color: ink, originY: 0.5 });
    const tRoom = room - when.width - 5;
    fitWidth(t, tRoom, 3);
    const bg = v.scene.add.rectangle(0, 0, CW, 22, 0xfff3d6).setOrigin(0, 0).setRounded(8).setStrokeStyle(1.5, COLOR.gold, 1);
    const node = v.scene.add.container(CX, y, [bg, when, t, r]);
    bg.setInteractive();
    bindTooltip(bg, () => ({ x: CX, y: node.y, w: CW, h: 22 }), () => ({ title: '等揭晓的消息', body: `${name} ${ago} 天前说「${themeById(w.theme).name}」接下来 ${w.days} 天加起来${DIR_WORD[w.claim]}，第 ${w.days} 天收盘时揭晓说没说对。` }));
    v.content.add(node);
    v.watchNodes.push({ day: w.day, index: w.index, node, w: CW });
    y += 22 + 4;
  }
  if (list.length > shown.length) {
    y = addSysPill(v, `+${list.length - shown.length} 条待揭晓`, y) + 4;
    // addPill 加了底和字两个对象
    v.watchPills.push(...(v.content.list.slice(-2) as Phaser.GameObjects.GameObject[]));
  }
  return y;
}
