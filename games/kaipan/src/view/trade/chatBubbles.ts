import Phaser from 'phaser';
import { HIT_MIN } from '../ui/button.ts';
import { friendView, type Comment, type FriendView, type MessageView } from '../../core/index.ts';
import { avatarKey, type AvatarFace } from '../assets.ts';
import { TURN_LABEL, claimSign, recordText } from '../labels.ts';
import { DIR_WORD, term, termTip } from '../glossary.ts';
import { COLOR, FS } from '../theme.ts';
import { addGlyph, addImage, addPill, addSlice } from '../ui/art.ts';
import { addText } from '../ui/text.ts';
import { bindTooltip } from '../ui/tooltip.ts';
import { openFriendDetail } from './detail.ts';
import { clickSuppressed } from './dragGeo.ts';
import { buyTagRowHeight } from './buyTagLayout.ts';
import { recShort, bubbleLine, CX, CW, AVATAR, BUBBLE_X, BUBBLE_W } from './chatConsts.ts';
import type { ChatView3 } from './chat.ts';

/** 群友头像：悬停看简介，点一下打开群友详情（战绩、最近说对说错）。 */
export function avatar(v: ChatView3, friendId: string, x: number, y: number, face: AvatarFace = 'normal', size = AVATAR): Phaser.GameObjects.Image {
  const img = addImage(v.scene, x + size / 2, y + size / 2, avatarKey(friendId, face), size);
  img.setInteractive({ useHandCursor: true });
  bindTooltip(img, () => ({ x, y, w: size, h: size }), () => {
    if (!v.state.friends.some((f) => f.id === friendId)) return null;
    const f = friendView(v.state, friendId);
    return { title: `${f.name}（${f.title}）· ${recordText(f.record)}`, body: `${f.desc}\n最懂：${f.topics}\n${term('record').explain}\n点头像看他最近说得准不准。` };
  });
  img.on(Phaser.Input.Events.POINTER_UP, (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
    if (!v.state.friends.some((f) => f.id === friendId)) return;
    ev.stopPropagation();
    openFriendDetail(v.scene, v.state, friendId);
  });
  return img;
}

/** 名字旁边的战绩：靶子小图标 + 「3/5」（新来的写「新」）。 */
export function recordTag(v: ChatView3, record: string, x: number, y: number): { icon: Phaser.GameObjects.Image; text: Phaser.GameObjects.Text; w: number } {
  const icon = addGlyph(v.scene, x + 6, y + 7, 'target', 12);
  const text = addText(v.scene, x + 13, y, recShort(record), { size: FS.xs, bold: true, num: true, color: COLOR.muted });
  text.setInteractive();
  bindTooltip(text, () => ({ x: text.x, y: text.y, w: text.width, h: 16 }), () => termTip('record'));
  return { icon, text, w: 13 + text.width };
}

export function addMessage(v: ChatView3, m: MessageView, y: number, size: number): number {
  const s = v.scene;
  const root = s.add.container(0, 0);
  const av = avatar(v, m.friend.id, CX, y);
  const name = addText(s, BUBBLE_X, y - 1, m.friend.name, { size: 12, bold: true });
  const badge = ownerBadge(v, m.friend, BUBBLE_X + name.width + 4, y);
  const tag = recordTag(v, m.friend.record, BUBBLE_X + name.width + 4 + (badge ? badge.w + 2 : 0), y);
  const rec = tag.text;
  if (badge) root.add(badge.node);
  root.add(tag.icon);
  // 题材方向标签（右上）
  const sign = claimSign(m.reverse && m.readAs ? m.readAs : m.claim);
  // 本周市场的反话：箭头照他说的画，前面加「反话」，由玩家自己反着听
  const fill = sign > 0 ? 0xffd9d2 : sign < 0 ? 0xd4f0dd : 0xece3ea;
  const ink = sign > 0 ? COLOR.up : sign < 0 ? COLOR.down : COLOR.muted;
  // 反着信群主：群主的话按反方向读（readAsLabel）
  const raw = v.state.today.messages[m.index];
  const days = raw?.days ?? 1;
  const big = !!raw?.big;
  // 0.5：风口图标 + 箭头 + 天数（「AI 2天内 涨」这类整句在悬停提示里）
  const dirSign = claimSign(m.reverse && m.readAs ? m.readAs : m.claim);
  const arrow = dirSign > 0 ? '↑' : dirSign < 0 ? '↓' : '→';
  // 0.5.1：「反」看不懂，写成「反着听」（箭头已经是反过来之后的方向）
  const chipLabel = `${m.reverse && m.readAs ? '反着听' : m.liar ? '反话' : ''}${arrow}${days > 1 ? `${days}天` : ''}${m.certain ? '必中' : ''}`;
  const chipText = addText(s, 0, y + 7, chipLabel, { size: 13, bold: true, color: ink, originX: 1, originY: 0.5 });
  const chipW = chipText.width + 34;
  const chip = addPill(s, CX + CW - chipW, y - 3, chipW, 20, fill, false);
  const themeIcon = addImage(s, CX + CW - chipW + 12, y + 7, `theme:${m.theme}`, 18);
  chip.setInteractive();
  bindTooltip(chip, () => ({ x: CX + CW - chipW, y: y - 2, w: chipW, h: 18 }), () => {
    const dir = DIR_WORD[m.reverse && m.readAs ? m.readAs : m.claim];
    const base = m.reverse
      ? `${m.friend.name}说${m.themeName}今天${DIR_WORD[m.claim]}；你有反着听的道具，按${dir}看。`
      : m.liar
        ? `${m.friend.name}说「${m.themeName}」这个风口今天${dir}。本周群友说的全是反话，多半是反过来。`
        : `${m.friend.name}说「${m.themeName}」这个风口今天${dir}。`;
    const flatNote = m.claim === 'flat' ? `\n${term('flat').word}：${term('flat').explain}` : '';
    const when = days > 1 ? `\n说的是接下来 ${days} 天（含今天）加起来的方向，第 ${days} 天收盘才见分晓。` : '';
    return { title: `${m.themeName} · ${dir}`, body: `${base}准不准，看他名字旁边的「说对 几/几」。${when}${flatNote}` };
  });
  chipText.setX(CX + CW - 6);
  // 拐点消息（「他觉得：要凉了」）：名字那行放得下就放名字后面，放不下就放进气泡第一行
  const turnText = m.turn ? addText(s, 0, 0, TURN_LABEL[m.turn].replace(/^.*：/, ''), { size: FS.xs, bold: true, color: COLOR.ink, originY: 0.5 }) : null;
  let tx = rec.x + rec.width + 6;
  if (!turnText && m.friend.title !== '群主') {
    const title = addText(s, tx, y, m.friend.title, { size: FS.xs, color: COLOR.dim });
    if (title.width <= CX + CW - chipW - 6 - tx) {
      root.add(title);
      tx += title.width + 6;
    } else title.destroy();
  }
  const inRow = turnText !== null && turnText.width + 10 <= CX + CW - chipW - 6 - tx;
  const inBubble = turnText !== null && !inRow;
  // 手机横屏：这位群友今天有推荐，点这条消息就能买（和推荐卡「买入」同一条路径），不用先切到「推荐」页签
  const recIdx = v.msgBuy.get(m.friend.id) ?? -1;
  const buyTag = recIdx >= 0 ? addText(s, 0, 0, '买 ›', { size: 12, bold: true, color: COLOR.white, originX: 0.5, originY: 0.5 }) : null;
  // 气泡里只放 ≤10 字的短话，整句点开（悬停 / 长按）看
  const text = addText(s, BUBBLE_X + 12, y + v.head + (v.tight ? 4 : 6) + (inBubble ? 18 : 0), bubbleLine(m.text, big ? size + 1 : size), { size: big ? size + 1 : size, bold: big, wrap: BUBBLE_W - 20, lineSpacing: 2 });
  // 「买 ›」小签和文字的最宽一行放不进同一行时，气泡下沿多留一行给它，不盖字
  const buyRow = buyTag ? buyTagRowHeight(text.width, BUBBLE_W, buyTag.width + 14) : 0;
  const bh = text.height + v.pad + (inBubble ? 18 : 0) + buyRow;
  const bubble = addSlice(s, BUBBLE_X, y + v.head, BUBBLE_W, bh, 'bubble_left');
  const full = m.text;
  if (text.text !== full) {
    const hit = s.add.rectangle(BUBBLE_X, y + v.head, BUBBLE_W, bh, 0xffffff, 0.001).setOrigin(0, 0).setInteractive();
    bindTooltip(hit, () => ({ x: BUBBLE_X, y: y + v.head, w: BUBBLE_W, h: bh }), () => ({ title: m.friend.name, body: full }));
    root.add(hit);
  }
  root.add([av, name, rec, chip, themeIcon, chipText, bubble, text]);
  if (recIdx >= 0) {
    const bt = buyTag as Phaser.GameObjects.Text;
    const pw = bt.width + 14;
    // 文字这行放得下就挂在气泡里靠右、上下居中；放不下就落在多留出的下沿一行；都不垂到气泡外（会压住下一条的名字）
    const py = buyRow > 0 ? y + v.head + bh - 18 - 4 : y + v.head + Math.round((bh - 18) / 2);
    const pill = addPill(s, BUBBLE_X + BUBBLE_W - pw - 10, py, pw, 18, COLOR.up, false);
    bt.setPosition(pill.x + pw / 2, py + 9);
    // 竖屏版气泡宽、一行就放下，只有约 29 高：点击区往上撑进名字那一行，凑够 HIT_MIN（头像在左边，不盖）
    // 最多撑到和上一条之间空隙的一半（不盖上一条的点击区）
    const hy = Math.max(y - v.gap / 2, y + v.head + bh - Math.max(bh, HIT_MIN));
    const hh = y + v.head + bh - hy;
    const hit = s.add.rectangle(BUBBLE_X, hy, BUBBLE_W, hh, 0xffffff, 0.001).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    hit.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      // 和推荐卡的「买入」一样：右键不算，拖拽刚松手落在这条消息上也不算（不然拖卡卖出时会顺手误买一笔）
      if (p.button !== 0 || clickSuppressed(performance.now())) return;
      ev.stopPropagation();
      v.onBuy(recIdx);
    });
    bindTooltip(hit, () => ({ x: BUBBLE_X, y: hy, w: BUBBLE_W, h: hh }), () => ({ title: '点一下买入', body: `${m.friend.name}今天有推荐，点这条消息和「推荐」页的买入一样。` }));
    root.add([pill, bt, hit]);
    v.recBuy.push({ index: m.index, x: BUBBLE_X + BUBBLE_W / 2, y: hy + hh / 2 });
  }
  if (big) {
    // 重磅情报：金色粗框 + 「重磅」签压在气泡左上角
    const ring = s.add.rectangle(BUBBLE_X + 2, y + v.head, BUBBLE_W - 2, bh).setOrigin(0, 0).setRounded(10).setStrokeStyle(3.5, COLOR.accent, 1);
    const bt = addText(s, 0, 0, '重磅', { size: FS.xs, bold: true, color: COLOR.white, originX: 0.5, originY: 0.5 });
    const bp = addPill(s, BUBBLE_X + BUBBLE_W - bt.width - 18, y + v.head + bh - 9, bt.width + 12, 16, COLOR.danger, false);
    bt.setPosition(bp.x + (bt.width + 12) / 2, bp.y + 8);
    bp.setInteractive();
    bindTooltip(bp, () => ({ x: bp.x, y: bp.y, w: bt.width + 12, h: 16 }), () => ({ title: '重磅情报', body: '这个月的大事：群里最靠谱的人说的，多半是真的。' }));
    root.add([ring, bp, bt]);
  }
  if (turnText) {
    const ring = s.add.rectangle(BUBBLE_X + 3, y + v.head + 1, BUBBLE_W - 4, bh - 3).setOrigin(0, 0).setRounded(10).setStrokeStyle(2.5, COLOR.gold, 1);
    const px = inRow ? tx : BUBBLE_X + 12;
    const py = inRow ? y - 2 : y + v.head + (v.tight ? 4 : 6);
    const pill = addPill(s, px, py, turnText.width + 10, 16, COLOR.gold, false);
    pill.setInteractive();
    bindTooltip(pill, () => ({ x: px, y: py, w: turnText.width + 10, h: 16 }), () => termTip('turn'));
    turnText.setPosition(px + 5, py + 8);
    root.add([ring, pill, turnText]);
  }
  v.content.add(root);
  v.msgs.push({ index: m.index, friendId: m.friend.id, rec, root, bubble: { x: BUBBLE_X, y: y + v.head, w: BUBBLE_W, h: bh }, top: y });
  return y + v.head + bh;
}

/** 盘中播报一行（红底白字的小条，不可点）。 */
export function tickerNode(v: ChatView3, text: string): { node: Phaser.GameObjects.Container; h: number } {
  const label = addText(v.scene, 0, 0, '播报', { size: FS.xs, bold: true, color: COLOR.white, originY: 0.5 });
  const t = addText(v.scene, 0, 0, text, { size: 12, bold: true, color: COLOR.ink, wrap: CW - label.width - 30, lineSpacing: 2 });
  const h = Math.max(24, t.height + 8);
  const bg = v.scene.add.rectangle(0, 0, CW, h, 0xffe1d6).setOrigin(0, 0).setRounded(8).setStrokeStyle(1.5, COLOR.danger, 1);
  const pill = addPill(v.scene, 6, h / 2 - 8, label.width + 10, 16, COLOR.danger, false);
  label.setPosition(11, h / 2);
  t.setPosition(label.width + 22, 4);
  const node = v.scene.add.container(CX, 0, [bg, pill, label, t]).setVisible(false);
  return { node, h };
}

/** 群主的名字旁边带一个「群主」小签（文案里说"群主"，群里显示的是网名）。 */
export function ownerBadge(v: ChatView3, f: Pick<FriendView, 'title'>, x: number, y: number): { node: Phaser.GameObjects.Container; w: number } | null {
  if (f.title !== '群主') return null;
  const t = addText(v.scene, 0, 0, f.title, { size: FS.xs, bold: true, color: COLOR.white, originX: 0.5, originY: 0.5 });
  const w = t.width + 8;
  const pill = addPill(v.scene, 0, 0, w, 15, COLOR.accentDark, false);
  t.setPosition(w / 2, 7.5);
  return { node: v.scene.add.container(x, y, [pill, t]), w };
}

/** 一条吐槽，画在 y 处。 */
export function commentNode(v: ChatView3, c: Comment, y: number): { node: Phaser.GameObjects.Container; h: number } {
  const node = v.scene.add.container(0, 0).setVisible(false);
  const face: AvatarFace = c.mood === 'smug' ? 'smug' : c.mood === 'awkward' ? 'awkward' : 'normal';
  const av = avatar(v, c.friendId, CX, y, face);
  const f = v.state.friends.some((x) => x.id === c.friendId) ? friendView(v.state, c.friendId) : null;
  const name = addText(v.scene, BUBBLE_X, y - 1, f ? f.name : '', { size: 12, bold: true });
  const badge = f ? ownerBadge(v, f, BUBBLE_X + name.width + 4, y) : null;
  const rec = addText(v.scene, BUBBLE_X + name.width + 6 + (badge ? badge.w + 2 : 0), y, f ? recShort(f.record) : '', { size: FS.xs, bold: true, num: true, color: COLOR.muted });
  const text = addText(v.scene, BUBBLE_X + 12, y + 24, bubbleLine(c.text, 13), { size: 13, wrap: BUBBLE_W - 20, lineSpacing: 2 });
  const bh = text.height + 12;
  const bubble = addSlice(v.scene, BUBBLE_X, y + v.head, BUBBLE_W, bh, 'bubble_left');
  const hit = v.scene.add.rectangle(BUBBLE_X, y + v.head, BUBBLE_W, bh, 0xffffff, 0.001).setOrigin(0, 0).setInteractive();
  bindTooltip(hit, () => ({ x: BUBBLE_X, y: y + 18, w: BUBBLE_W, h: bh }), () => ({ title: f ? f.name : '群友', body: c.text }));
  node.add([av, name, rec, bubble, hit, text]);
  if (badge) node.add(badge.node);
  return { node, h: 18 + bh };
}
