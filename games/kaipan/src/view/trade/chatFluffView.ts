import type Phaser from 'phaser';
import { friendView, type GameState, runMonths } from '../../core/index.ts';
import type { Glyph } from '../assets.ts';
import { COLOR, FS } from '../theme.ts';
import { addGlyph, addSlice } from '../ui/art.ts';
import { addText, fitWidth } from '../ui/text.ts';
import { fluffNote, makeFluff, toneOf, type Fluff } from './chatFluff.ts';
import { storyBeat } from './storyArcs.ts';
import { SX, SW, CX, CW, BUBBLE_X, BUBBLE_W, GAP } from './chatConsts.ts';
import { avatar } from './chatBubbles.ts';
import type { ChatView3 } from './chat.ts';

/**
 * 在 y 到 limit 之间放热闹元素（确定性随机：同一天重绘一样），放不下的跳过。
 * 返回新的 y 和放进去的节点（已加进群聊容器）。
 */
export function addFluff(v: ChatView3, s: GameState, y: number, limit: number, salt: string, said: { friendId: string; text: string }[]): { y: number; nodes: { node: Phaser.GameObjects.Container; pop: Phaser.GameObjects.Image | null }[] } {
  const nodes: { node: Phaser.GameObjects.Container; pop: Phaser.GameObjects.Image | null }[] = [];
  if (limit - y < 22 || s.friends.length === 0) return { y, nodes };
  const friends = s.friends.map((f) => ({ id: f.id, name: friendView(s, f.id).name }));
  const tone = toneOf(s.lastDay ? s.lastDay.market.ret : null);
  const list = makeFluff({ seed: s.seed, day: s.today.day, salt, tone, friends, said, max: 4 });
  // 群友连载：每个讲故事的月份，月底算账时先发一段（引用上一段）；盘前推荐卡多，放不下
  const beat = salt === 'month' ? storyBeat({ seed: s.seed, month: s.month, months: runMonths(s), friendIds: s.friends.map((x) => x.id) }) : null;
  if (beat) list.unshift({ kind: 'reply', friendId: beat.friendId, toId: beat.friendId, quote: beat.quote, text: beat.text });
  for (const f of list) {
    if (limit - y < 22) break;
    const n = fluffNode(v, s, f, y);
    if (y + n.h > limit) {
      n.node.destroy();
      continue;
    }
    v.content.add(n.node);
    const item = { node: n.node, pop: n.pop };
    nodes.push(item);
    v.fluffNodes.push(item);
    y += n.h + GAP;
  }
  return { y, nodes };
}

/** 一条热闹元素：贴纸（大图标 + 贴纸字）、带引用条的回复、撤回 / 拍一拍的系统提示。 */
function fluffNode(v: ChatView3, s: GameState, f: Fluff, y: number): { node: Phaser.GameObjects.Container; h: number; pop: Phaser.GameObjects.Image | null } {
  const sc = v.scene;
  const node = sc.add.container(0, 0);
  const nameOf = (id: string): string => (s.friends.some((x) => x.id === id) ? friendView(s, id).name : '群友');
  if (f.kind === 'recall' || f.kind === 'poke' || f.kind === 'note') {
    const t = addText(sc, SX + SW / 2, y + 11, fluffNote(f, nameOf), { size: FS.xs, color: COLOR.muted, originX: 0.5, originY: 0.5 });
    const w = Math.min(CW, t.width + 24);
    node.add([addSlice(sc, SX + SW / 2 - w / 2, y, w, 22, 'system_pill'), t]);
    return { node, h: 22, pop: null };
  }
  const av = avatar(v, f.friendId, CX, y);
  const name = addText(sc, BUBBLE_X, y - 1, nameOf(f.friendId), { size: 12, bold: true });
  node.add([av, name]);
  if (f.kind === 'sticker') {
    // 表情包：淡色圆角底 + 大图标 + 压在底边的描边字
    const w = 88;
    const h = 82;
    const bg = sc.add.rectangle(BUBBLE_X, y + 18, w, h, 0xffffff, 0.8).setOrigin(0, 0).setRounded(14).setStrokeStyle(2, COLOR.edge, 1);
    const img = addGlyph(sc, BUBBLE_X + w / 2, y + 18 + 33, f.glyph as Glyph, 58);
    const cap = addText(sc, BUBBLE_X + w / 2, y + 18 + h - 11, f.caption, { size: 12, bold: true, color: COLOR.white, stroke: COLOR.ink, strokeWidth: 3, originX: 0.5, originY: 0.5 });
    node.add([bg, img, cap]);
    return { node, h: 18 + h, pop: img };
  }
  // 互相回复：气泡里先是一条灰色引用（「老王：大消费，不急」），下面是回复
  const quote = addText(sc, BUBBLE_X + 20, y + 23, f.quote, { size: FS.xs, color: COLOR.muted });
  fitWidth(quote, BUBBLE_W - 36, 2);
  const qbg = sc.add.rectangle(BUBBLE_X + 10, y + 22, quote.width + 16, 16, 0xf1e7da, 1).setOrigin(0, 0).setRounded(4);
  const bar = sc.add.rectangle(BUBBLE_X + 12, y + 24, 3, 12, COLOR.edge, 1).setOrigin(0, 0);
  const text = addText(sc, BUBBLE_X + 12, y + 42, f.text, { size: 13, wrap: BUBBLE_W - 20, lineSpacing: 2 });
  const bh = 24 + text.height + 8;
  const bubble = addSlice(sc, BUBBLE_X, y + v.head, BUBBLE_W, bh, 'bubble_left');
  node.add([bubble, qbg, bar, quote, text]);
  return { node, h: 18 + bh, pop: null };
}
